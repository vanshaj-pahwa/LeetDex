import type { Attempt, Problem } from "./schema";
import { getProblem } from "./catalog";
import { topicsOf } from "./topics";

export type Recommendation = {
  problem: Problem;
  /** "topic:Graphs" | "company:Google" | "starter" | "fallback" */
  reason: string;
  reasonLabel: string;
};

const diffScore = (d: Problem["difficulty"]) =>
  d === "easy" ? 1 : d === "medium" ? 2 : 3;

/**
 * Local heuristic "next pick" - runs without an LLM. Logic:
 *
 *   1. If the user has zero solves: return a foundational easy problem
 *      ("Two Sum" if present, otherwise any easy).
 *   2. Otherwise compute solve-rate per topic and per company. Pick the
 *      weakest area (lowest rate, must have ≥5 problems total).
 *   3. From that area, pick an un-attempted problem at one notch above the
 *      user's average difficulty there.
 *   4. Fall back to a medium the user hasn't touched.
 */
export function nextCrux(
  problems: Problem[],
  attempts: Record<string, Attempt>,
): Recommendation | undefined {
  if (problems.length === 0) return undefined;

  const isDone = (id: string) => {
    const a = attempts[id];
    return a?.status === "solved";
  };
  const isTouched = (id: string) => !!attempts[id];
  const totalSolved = problems.filter((p) => isDone(p.id)).length;

  // 1. Cold start.
  if (totalSolved === 0) {
    const starter =
      problems.find((p) => p.slug === "two-sum") ??
      problems.find((p) => p.difficulty === "easy");
    if (starter) {
      return {
        problem: starter,
        reason: "starter",
        reasonLabel: "Start here · foundational easy",
      };
    }
  }

  type Bucket = { total: number; done: number; sumDifficulty: number };
  const topicStats = new Map<string, Bucket>();
  const companyStats = new Map<string, Bucket>();

  for (const p of problems) {
    const done = isDone(p.id);
    const score = diffScore(p.difficulty);
    for (const t of topicsOf(p)) {
      const b = topicStats.get(t) ?? { total: 0, done: 0, sumDifficulty: 0 };
      b.total += 1;
      if (done) { b.done += 1; b.sumDifficulty += score; }
      topicStats.set(t, b);
    }
    for (const c of p.companies) {
      const b = companyStats.get(c) ?? { total: 0, done: 0, sumDifficulty: 0 };
      b.total += 1;
      if (done) { b.done += 1; b.sumDifficulty += score; }
      companyStats.set(c, b);
    }
  }

  const weakTopics = Array.from(topicStats.entries())
    .filter(([, b]) => b.total >= 5)
    .map(([name, b]) => ({
      name,
      ratio: b.done / b.total,
      avgDiff: b.done > 0 ? b.sumDifficulty / b.done : 2,
    }))
    .sort((a, b) => a.ratio - b.ratio);

  const weakCompanies = Array.from(companyStats.entries())
    .filter(([, b]) => b.total >= 10)
    .map(([name, b]) => ({
      name,
      ratio: b.done / b.total,
      avgDiff: b.done > 0 ? b.sumDifficulty / b.done : 2,
    }))
    .sort((a, b) => a.ratio - b.ratio);

  // 2. Try topic-based pick (only if the user has some progress in any topic
  // so the comparison is meaningful).
  if (totalSolved >= 3) {
    for (const t of weakTopics.slice(0, 3)) {
      const targetDiff = Math.min(3, Math.ceil(t.avgDiff + 0.5));
      const candidates = problems
        .filter((p) => topicsOf(p).includes(t.name) && !isTouched(p.id))
        .filter((p) => diffScore(p.difficulty) === targetDiff)
        .sort((a, b) => a.leetcodeNumber - b.leetcodeNumber);
      if (candidates[0]) {
        return {
          problem: candidates[0],
          reason: `topic:${t.name}`,
          reasonLabel: `Topic gap · ${t.name}`,
        };
      }
    }
  }

  // 3. Company-based pick. We deliberately don't name the company in the
  // label, because the recommended problem already shows its full company
  // list right below ("Asked at Amazon, Bloomberg, Capital One, ...").
  for (const c of weakCompanies.slice(0, 5)) {
    const targetDiff = Math.min(3, Math.ceil(c.avgDiff + 0.5));
    const candidates = problems
      .filter((p) => p.companies.includes(c.name) && !isTouched(p.id))
      .filter((p) => diffScore(p.difficulty) === targetDiff)
      .sort((a, b) => a.leetcodeNumber - b.leetcodeNumber);
    if (candidates[0]) {
      return {
        problem: candidates[0],
        reason: `company:${c.name}`,
        reasonLabel: "Coverage gap",
      };
    }
  }

  // 4. Fallback.
  const fallback = problems
    .filter((p) => p.difficulty === "medium" && !isTouched(p.id))
    .sort((a, b) => a.leetcodeNumber - b.leetcodeNumber);
  if (fallback[0]) {
    return {
      problem: fallback[0],
      reason: "fallback",
      reasonLabel: "Popular medium · warm up",
    };
  }
  return undefined;
}

export function solveStats(
  problems: Problem[],
  attempts: Record<string, Attempt>,
) {
  let solved = 0;
  const byDifficulty = { easy: 0, medium: 0, hard: 0 };
  const totalByDifficulty = { easy: 0, medium: 0, hard: 0 };
  for (const p of problems) {
    totalByDifficulty[p.difficulty] += 1;
    const a = attempts[p.id];
    if (a?.status === "solved") {
      solved += 1;
      byDifficulty[p.difficulty] += 1;
    }
  }
  return { solved, byDifficulty, totalByDifficulty };
}

/**
 * Compact, LLM-friendly summary of the user's practice history.
 * Used to ask an LLM "given this, pick what's next".
 */
export type HistorySummaryOpts = {
  /** Companies the user is actively prepping for. If non-empty, the candidate
   * shortlist is restricted to problems asked at any of these companies, and
   * the per-company coverage stats are computed from this subset. */
  targetCompanies?: string[];
  /** Random seed used to shuffle the candidate pool so the LLM doesn't always
   * see the same order. Pass `Date.now()` for "fresh roll", or a stable value
   * to make picks reproducible. */
  shuffleSeed?: number;
  /** Problem IDs to exclude from the candidate pool, e.g. the last N AI picks
   * the user dismissed. Forces variety on refresh. */
  excludeIds?: string[];
};

export function buildHistorySummary(
  problems: Problem[],
  attempts: Record<string, Attempt>,
  opts: HistorySummaryOpts = {},
) {
  const targetCompanies = (opts.targetCompanies ?? []).filter(Boolean);
  const hasTarget = targetCompanies.length > 0;
  const targetSet = new Set(targetCompanies);
  const excludeSet = new Set(opts.excludeIds ?? []);

  const stats = solveStats(problems, attempts);
  const isDone = (id: string) => {
    const a = attempts[id];
    return a?.status === "solved";
  };

  // Per-topic
  type Bucket = { total: number; done: number };
  const topicMap = new Map<string, Bucket>();
  const companyMap = new Map<string, Bucket>();
  for (const p of problems) {
    const done = isDone(p.id);
    // Topic stats: when targeting, only count problems asked at target companies.
    if (!hasTarget || p.companies.some((c) => targetSet.has(c))) {
      for (const t of topicsOf(p)) {
        const b = topicMap.get(t) ?? { total: 0, done: 0 };
        b.total += 1; if (done) b.done += 1;
        topicMap.set(t, b);
      }
    }
    for (const c of p.companies) {
      const b = companyMap.get(c) ?? { total: 0, done: 0 };
      b.total += 1; if (done) b.done += 1;
      companyMap.set(c, b);
    }
  }
  const topics = Array.from(topicMap.entries())
    .map(([name, b]) => ({ name, done: b.done, total: b.total }))
    .sort((a, b) => a.done / a.total - b.done / b.total);

  // Company stats: when targeting, surface only the targets; otherwise the 10
  // largest companies.
  const companies = hasTarget
    ? Array.from(companyMap.entries())
        .filter(([name]) => targetSet.has(name))
        .map(([name, b]) => ({ name, done: b.done, total: b.total }))
        .sort((a, b) => a.done / a.total - b.done / b.total)
    : Array.from(companyMap.entries())
        .filter(([, b]) => b.total >= 10)
        .map(([name, b]) => ({ name, done: b.done, total: b.total }))
        .sort((a, b) => a.done / a.total - b.done / b.total)
        .slice(0, 10);

  // Recently solved (by solvedAt timestamp)
  const recent = Object.values(attempts)
    .filter((a) => a.solvedAt)
    .sort((a, b) => (b.solvedAt ?? "").localeCompare(a.solvedAt ?? ""))
    .slice(0, 8)
    .map((a) => {
      const p = getProblem(a.problemId);
      return p ? `${p.leetcodeNumber}. ${p.title} (${p.difficulty})` : null;
    })
    .filter(Boolean) as string[];

  // Candidate shortlist: a pure random sample of ~25 untouched problems from
  // the eligible pool. Because we reseed the shuffle every call from the home
  // page, the candidate set CHANGES on every API call, which is what forces
  // the LLM to vary its pick. The user's weakest topics/companies are still
  // passed in the summary so the model has the strategic context it needs to
  // bias picks intelligently without us hand-curating the shortlist.
  //
  // A solved problem (entry with status === "solved") is never eligible.
  // We deliberately use isDone (not isTouched) so legacy "unsolved" entries
  // from the old multi-status schema don't get accidentally excluded.
  const eligible = (p: Problem) =>
    !isDone(p.id) &&
    !excludeSet.has(p.id) &&
    (!hasTarget || p.companies.some((c) => targetSet.has(c)));

  const TARGET_SIZE = 25;
  const eligiblePool: Problem[] = [];
  for (const p of problems) {
    if (eligible(p)) eligiblePool.push(p);
  }
  const sampleSeed = opts.shuffleSeed ?? Math.floor(Math.random() * 1e9);
  const sampled = seededShuffle(eligiblePool, sampleSeed).slice(0, TARGET_SIZE);
  const candidates = new Map<string, Problem>();
  for (const p of sampled) candidates.set(p.id, p);

  let candidatesArr = Array.from(candidates.values());
  if (opts.shuffleSeed !== undefined) {
    candidatesArr = seededShuffle(candidatesArr, opts.shuffleSeed);
  }

  return {
    stats,
    topics,
    companies,
    recent,
    targetCompanies,
    candidates: candidatesArr.map((p) => ({
      id: p.id,
      number: p.leetcodeNumber,
      title: p.title,
      difficulty: p.difficulty,
      companies: p.companies.slice(0, 2),
    })),
  };
}

/** Fisher-Yates with a seeded RNG (mulberry32). Deterministic per seed. */
function seededShuffle<T>(arr: T[], seed: number): T[] {
  const out = arr.slice();
  let s = seed >>> 0;
  const rng = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Stable hash for the cached AI Up-next pick. Same key = reuse the cached
 * pick (no LLM call). Key changes when the user solves something, switches
 * provider, or edits target companies. The shuffle nonce / recent-excludes
 * are NOT in the key; the explicit Refresh button is what busts it. */
export function upNextCacheKey(
  attempts: Record<string, Attempt>,
  provider: string,
  targetCompanies: string[],
): string {
  const solvedIds = Object.entries(attempts)
    .filter(([, a]) => a.status === "solved")
    .map(([id]) => id)
    .sort()
    .join(",");
  const targets = [...targetCompanies].sort().join(",");
  return djb2(`${provider}|${solvedIds}|${targets}`);
}

function djb2(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/* ─── Weekly summary ─────────────────────────────────────────────────────
 * Packages the inputs the LLM needs to produce a 3-line weekly digest:
 * what you solved this week, your biggest coverage gap, and what to focus
 * on next. The "week" is Monday-to-Sunday for the user's local timezone.
 */

export type WeeklySummaryInput = ReturnType<typeof buildWeeklySummary>;

export function buildWeeklySummary(
  problems: Problem[],
  attempts: Record<string, Attempt>,
  now: Date = new Date(),
) {
  const weekStart = mondayOf(now);
  const weekStartIso = weekStart.toISOString().slice(0, 10);
  const weekKey = weekStartIso;

  // Solves whose solvedAt falls on/after Monday 00:00 local time.
  const solvedThisWeek: {
    id: string;
    number: number;
    title: string;
    difficulty: Problem["difficulty"];
    topics: string[];
    solvedAt: string;
  }[] = [];

  for (const a of Object.values(attempts)) {
    if (a.status !== "solved" || !a.solvedAt) continue;
    const d = new Date(a.solvedAt);
    if (d < weekStart) continue;
    const p = getProblem(a.problemId);
    if (!p) continue;
    solvedThisWeek.push({
      id: p.id,
      number: p.leetcodeNumber,
      title: p.title,
      difficulty: p.difficulty,
      topics: topicsOf(p),
      solvedAt: a.solvedAt,
    });
  }
  solvedThisWeek.sort((a, b) => a.solvedAt.localeCompare(b.solvedAt));

  // Difficulty + topic counts for solved-this-week.
  const byDifficulty = { easy: 0, medium: 0, hard: 0 };
  const topicCountsThisWeek = new Map<string, number>();
  for (const s of solvedThisWeek) {
    byDifficulty[s.difficulty] += 1;
    for (const t of s.topics) {
      topicCountsThisWeek.set(t, (topicCountsThisWeek.get(t) ?? 0) + 1);
    }
  }

  // Coverage gaps across all-time: per-topic and per-company solve rates,
  // sorted so weakest comes first. Min 5/10 problems so a 0/2 topic doesn't
  // win by triviality.
  const isDone = (id: string) => attempts[id]?.status === "solved";
  type Bucket = { total: number; done: number };
  const topicMap = new Map<string, Bucket>();
  const companyMap = new Map<string, Bucket>();

  for (const p of problems) {
    const done = isDone(p.id);
    for (const t of topicsOf(p)) {
      const b = topicMap.get(t) ?? { total: 0, done: 0 };
      b.total += 1; if (done) b.done += 1;
      topicMap.set(t, b);
    }
    for (const c of p.companies) {
      const b = companyMap.get(c) ?? { total: 0, done: 0 };
      b.total += 1; if (done) b.done += 1;
      companyMap.set(c, b);
    }
  }

  const topicGaps = Array.from(topicMap.entries())
    .filter(([, b]) => b.total >= 5)
    .map(([name, b]) => ({ name, done: b.done, total: b.total }))
    .sort((a, b) => a.done / a.total - b.done / b.total)
    .slice(0, 5);

  const companyGaps = Array.from(companyMap.entries())
    .filter(([, b]) => b.total >= 20)
    .map(([name, b]) => ({ name, done: b.done, total: b.total }))
    .sort((a, b) => a.done / a.total - b.done / b.total)
    .slice(0, 5);

  return {
    weekKey,
    weekStartIso,
    weekStartLabel: weekStart.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    }),
    solvedThisWeek,
    countThisWeek: solvedThisWeek.length,
    byDifficulty,
    topicCountsThisWeek: Array.from(topicCountsThisWeek.entries()).map(
      ([topic, count]) => ({ topic, count }),
    ),
    topicGaps,
    companyGaps,
    totalSolvedAllTime: Object.values(attempts).filter(
      (a) => a.status === "solved",
    ).length,
    totalProblems: problems.length,
  };
}

/** Stable cache key for the weekly digest: invalidate when the week rolls
 * over OR when the user solves something new this week. */
export function weeklyDigestKey(
  summary: ReturnType<typeof buildWeeklySummary>,
  provider: string,
): string {
  const ids = summary.solvedThisWeek.map((s) => s.id).sort().join(",");
  return djb2(`${provider}|${summary.weekKey}|${ids}`);
}

function mondayOf(d: Date): Date {
  const m = new Date(d);
  m.setHours(0, 0, 0, 0);
  // getDay(): Sun=0..Sat=6. Want Monday=0..Sunday=6 offset.
  const offset = (m.getDay() + 6) % 7;
  m.setDate(m.getDate() - offset);
  return m;
}

/** Last-N-days heatmap. */
export function buildHeatmap(attempts: Record<string, Attempt>, days = 91) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cells: { date: string; count: number }[] = [];
  const counts = new Map<string, number>();
  for (const a of Object.values(attempts)) {
    if (!a.solvedAt) continue;
    const d = new Date(a.solvedAt);
    d.setHours(0, 0, 0, 0);
    const key = d.toISOString().slice(0, 10);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    cells.push({ date: key, count: counts.get(key) ?? 0 });
  }
  return cells;
}
