import type {
  Attempt,
  Problem,
  Recency,
  StudyPlan,
  StudyPlanSlot,
} from "./schema";

/* How heavily each recency bucket weighs when picking the *which* problems
 * within a difficulty band. Recent problems matter more for interview prep
 * because they're literally what the company is asking right now. */
const RECENCY_WEIGHT: Record<Recency, number> = {
  last30d: 100,
  last3m: 80,
  last6m: 50,
  last1y: 20,
  older: 5,
};

type Diff = "easy" | "medium" | "hard";

/* Per-day difficulty mix based on where the day sits in the timeline (0 =
 * first day, 1 = interview day). Early days build confidence with easies +
 * a medium; middle days run mostly mediums (where real interviews live);
 * late days stretch with hards. Sum is always PROBLEMS_PER_DAY. */
function perDayMix(fraction: number): Record<Diff, number> {
  if (fraction < 0.25) return { easy: 2, medium: 1, hard: 0 };
  if (fraction < 0.6) return { easy: 1, medium: 2, hard: 0 };
  if (fraction < 0.85) return { easy: 0, medium: 2, hard: 1 };
  return { easy: 0, medium: 1, hard: 2 };
}

/* Generate an interview study plan for a target company + date. Picks the
 * most recently-asked unsolved problems at that company, distributed
 * across days with a difficulty ramp: easy-leaning early days, mostly
 * mediums in the middle, harder problems near the interview. */
export function generateStudyPlan({
  company,
  interviewDate,
  problems,
  attempts,
}: {
  company: string;
  interviewDate: string; // YYYY-MM-DD
  problems: Problem[];
  attempts: Record<string, Attempt>;
}): StudyPlan {
  const today = startOfDay(new Date());
  const target = parseLocalDate(interviewDate);
  const daysAvailable = Math.max(
    1,
    Math.ceil((target.getTime() - today.getTime()) / 86400000) + 1,
  );

  /* Candidate pool: problems tagged at this company, not already solved.
   * We don't drop problems with stale recency because some companies have
   * a thin "last 30d" set and we still want a reasonable plan length. */
  const scored = problems
    .filter((p) => p.companies.includes(company))
    .filter((p) => attempts[p.id]?.status !== "solved")
    .map((p) => ({
      problem: p,
      score: RECENCY_WEIGHT[p.companyRecency?.[company] ?? "older"] ?? 0,
    }));

  /* Bucket by difficulty, each sorted by recency descending so we always
   * pull the freshest problem in each band. */
  const byDiff: Record<Diff, typeof scored> = {
    easy: scored
      .filter((c) => c.problem.difficulty === "easy")
      .sort((a, b) => b.score - a.score),
    medium: scored
      .filter((c) => c.problem.difficulty === "medium")
      .sort((a, b) => b.score - a.score),
    hard: scored
      .filter((c) => c.problem.difficulty === "hard")
      .sort((a, b) => b.score - a.score),
  };

  /* Pointers into each bucket, advanced as we pull. Fall-back order when
   * a requested bucket is empty: medium > easy > hard. */
  const cursors: Record<Diff, number> = { easy: 0, medium: 0, hard: 0 };
  const fallbackOrder: Diff[] = ["medium", "easy", "hard"];

  function take(preferred: Diff): Problem | null {
    if (cursors[preferred] < byDiff[preferred].length) {
      return byDiff[preferred][cursors[preferred]++].problem;
    }
    for (const alt of fallbackOrder) {
      if (alt === preferred) continue;
      if (cursors[alt] < byDiff[alt].length) {
        return byDiff[alt][cursors[alt]++].problem;
      }
    }
    return null;
  }

  const slots: StudyPlanSlot[] = [];
  for (let i = 0; i < daysAvailable; i++) {
    const fraction = daysAvailable === 1 ? 0 : i / (daysAvailable - 1);
    const mix = perDayMix(fraction);

    const slotProblems: Problem[] = [];
    /* Pull in priority order: hards first so the hardest problems for late
     * days are claimed before fallbacks promote a medium into hard's slot. */
    const order: Diff[] = ["hard", "medium", "easy"];
    for (const diff of order) {
      for (let j = 0; j < mix[diff]; j++) {
        const p = take(diff);
        if (p) slotProblems.push(p);
      }
    }

    if (slotProblems.length === 0) break;

    /* Visual ordering within a day: easy → medium → hard so each day reads
     * as its own mini-warmup. */
    slotProblems.sort((a, b) => diffRank(a.difficulty) - diffRank(b.difficulty));

    const date = new Date(today);
    date.setDate(date.getDate() + i);
    slots.push({
      date: isoDate(date),
      problemIds: slotProblems.map((p) => p.id),
    });
  }

  return {
    id: String(Date.now()),
    company,
    interviewDate,
    createdAt: new Date().toISOString(),
    slots,
  };
}

function diffRank(d: Diff): number {
  return d === "easy" ? 1 : d === "medium" ? 2 : 3;
}

/* Helpers exposed for the prep page UI. */

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/* "YYYY-MM-DD" -> local Date (not UTC). Avoids timezone surprises where
 * the input string would otherwise be parsed at UTC midnight. */
export function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export type PlanProgress = {
  todayKey: string;
  totalProblems: number;
  solvedProblems: number;
  daysRemaining: number;       // calendar days from today to interview, min 0
  todaySlot: StudyPlanSlot | undefined;
  overdueProblemIds: string[]; // unsolved problems from past slots
};

/* Derive runtime progress without persisting it. Called every render. */
export function computePlanProgress(
  plan: StudyPlan,
  attempts: Record<string, Attempt>,
): PlanProgress {
  const today = startOfDay(new Date());
  const todayKey = isoDate(today);
  const target = parseLocalDate(plan.interviewDate);
  const daysRemaining = Math.max(
    0,
    Math.ceil((target.getTime() - today.getTime()) / 86400000),
  );

  let totalProblems = 0;
  let solvedProblems = 0;
  let todaySlot: StudyPlanSlot | undefined;
  const overdueProblemIds: string[] = [];

  for (const slot of plan.slots) {
    totalProblems += slot.problemIds.length;
    for (const pid of slot.problemIds) {
      if (attempts[pid]?.status === "solved") solvedProblems += 1;
      else if (slot.date < todayKey) overdueProblemIds.push(pid);
    }
    if (slot.date === todayKey) todaySlot = slot;
  }

  return {
    todayKey,
    totalProblems,
    solvedProblems,
    daysRemaining,
    todaySlot,
    overdueProblemIds,
  };
}
