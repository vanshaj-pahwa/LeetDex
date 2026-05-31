"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { Shell, Topbar } from "@/components/Shell";
import { COMPANIES, PROBLEMS, STATS, getProblem } from "@/lib/catalog";
import {
  buildHeatmap,
  buildHistorySummary,
  buildWeeklySummary,
  solveStats,
  weeklyDigestKey,
} from "@/lib/recommend";
import { DifficultyBadge, StatusGlyph } from "@/components/Primitives";
import { TagInput } from "@/components/TagInput";
import { MonthCalendar } from "@/components/MonthCalendar";
import { DailyChallenge } from "@/components/DailyChallenge";
import { StreakModal, motivationLine } from "@/components/StreakModal";
import { computePlanProgress, parseLocalDate } from "@/lib/studyPlan";
import {
  pickNext,
  PROVIDER_META,
  summarizeWeek,
  type PickResult,
  type WeeklySummaryResult,
} from "@/lib/llm/router";
import { TOPIC_BUCKETS, topicsOf } from "@/lib/topics";
import type { Difficulty, Problem } from "@/lib/schema";

export default function HomePage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Random subline index, stable for the session. SSR sees 0; client picks
  // a random one after mount so the line changes per page load without
  // causing a hydration mismatch.
  const [greetingIdx, setGreetingIdx] = useState(0);
  useEffect(() => {
    setGreetingIdx(Math.floor(Math.random() * 7));
  }, []);

  const [streakOpen, setStreakOpen] = useState(false);

  const name = useStore((s) => s.name);
  const attempts = useStore((s) => s.attempts);
  const hasKey = useStore((s) => s.hasAnyKey());
  const activeProvider = useStore((s) => s.activeProvider);

  const stats = useMemo(() => solveStats(PROBLEMS, attempts), [attempts]);
  const cells = useMemo(() => buildHeatmap(attempts, 91), [attempts]);
  const streak = useMemo(() => computeStreak(cells), [cells]);
  const weekSummary = useMemo(
    () => buildWeeklySummary(PROBLEMS, attempts),
    [attempts],
  );

  // AI-powered Up next. Only fetches when a key is connected.
  const activeKey = useStore((s) => s.activeKey());
  const targetCompanies = useStore((s) => s.targetCompanies);
  const setTargetCompanies = useStore((s) => s.setTargetCompanies);

  // `pickNonce` reshuffles the candidate list. Seeded with a random value at
  // mount so two sessions don't see the same first pick. Refresh bumps it.
  const [pickNonce, setPickNonce] = useState(() => Math.floor(Math.random() * 1e9));

  // Track the last few picks so Refresh can exclude them from the next
  // shortlist (the LLM stops re-suggesting the same one).
  const [recentPickIds, setRecentPickIds] = useState<string[]>([]);

  const summary = useMemo(
    () =>
      buildHistorySummary(PROBLEMS, attempts, {
        targetCompanies,
        shuffleSeed: pickNonce,
        excludeIds: recentPickIds,
      }),
    [attempts, targetCompanies, pickNonce, recentPickIds],
  );

  const [aiPick, setAiPick] = useState<PickResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string>("");

  useEffect(() => {
    if (!hasKey || !activeKey || summary.candidates.length === 0) {
      setAiPick(null);
      return;
    }
    let cancelled = false;
    setAiLoading(true);
    setAiError("");
    pickNext({ provider: activeProvider, apiKey: activeKey, summary })
      .then((res) => {
        if (!cancelled) setAiPick(res);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setAiError(e instanceof Error ? e.message : String(e));
          setAiPick(null);
        }
      })
      .finally(() => {
        if (!cancelled) setAiLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [hasKey, activeKey, activeProvider, summary]);

  // Refresh button: exclude the current pick, reshuffle, re-query.
  const refreshPick = () => {
    if (aiPick?.problemId) {
      setRecentPickIds((prev) => {
        const next = [aiPick.problemId, ...prev.filter((id) => id !== aiPick.problemId)];
        return next.slice(0, 5);
      });
    }
    setPickNonce(Math.floor(Math.random() * 1e9));
  };

  const aiPickProblem: Problem | undefined = aiPick
    ? getProblem(aiPick.problemId)
    : undefined;

  // ─── Weekly summary (AI digest, cached per week + per solve-set) ─────
  const cachedDigest = useStore((s) => s.weeklyDigest);
  const cachedDigestKey = useStore((s) => s.weeklyDigestCacheKey);
  const setWeeklyDigest = useStore((s) => s.setWeeklyDigest);

  const wantedDigestKey = useMemo(
    () => weeklyDigestKey(weekSummary, activeProvider),
    [weekSummary, activeProvider],
  );

  const [weekResult, setWeekResult] = useState<WeeklySummaryResult | null>(null);
  const [weekLoading, setWeekLoading] = useState(false);
  const [weekError, setWeekError] = useState<string>("");

  useEffect(() => {
    if (!hasKey || !activeKey) {
      setWeekResult(null);
      return;
    }
    // Cache hit: same week, same provider, same solved set.
    if (cachedDigest && cachedDigestKey === wantedDigestKey) {
      setWeekResult(cachedDigest);
      return;
    }
    let cancelled = false;
    setWeekLoading(true);
    setWeekError("");
    summarizeWeek({
      provider: activeProvider,
      apiKey: activeKey,
      summary: weekSummary,
    })
      .then((res) => {
        if (cancelled) return;
        setWeekResult(res);
        setWeeklyDigest(wantedDigestKey, res);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setWeekError(e instanceof Error ? e.message : String(e));
          setWeekResult(null);
        }
      })
      .finally(() => {
        if (!cancelled) setWeekLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    hasKey,
    activeKey,
    activeProvider,
    weekSummary,
    wantedDigestKey,
    cachedDigest,
    cachedDigestKey,
    setWeeklyDigest,
  ]);

  const recents = useMemo(() => {
    return Object.values(attempts)
      .sort((a, b) =>
        (b.solvedAt ?? b.attemptedAt).localeCompare(a.solvedAt ?? a.attemptedAt),
      )
      .slice(0, 4)
      .map((a) => ({ attempt: a, problem: getProblem(a.problemId) }))
      .filter((r) => r.problem);
  }, [attempts]);

  const topicTiles = useMemo(() => {
    const all = TOPIC_BUCKETS.map((b) => {
      const inTopic = PROBLEMS.filter((p) => topicsOf(p).includes(b.name));
      const done = inTopic.filter((p) => {
        const a = attempts[p.id];
        return a?.status === "solved";
      }).length;
      return { name: b.name, total: inTopic.length, done };
    }).filter((t) => t.total >= 5);
    return all.sort((a, b) => b.total - a.total).slice(0, 6);
  }, [attempts]);

  const companyTiles = useMemo(() => {
    const solvedByCo = new Map<string, number>();
    for (const p of PROBLEMS) {
      const a = attempts[p.id];
      if (a?.status === "solved") {
        for (const c of p.companies) solvedByCo.set(c, (solvedByCo.get(c) ?? 0) + 1);
      }
    }
    return COMPANIES.slice(0, 8).map((c) => ({
      ...c,
      done: solvedByCo.get(c.name) ?? 0,
    }));
  }, [attempts]);

  if (!mounted) return null;

  return (
    <Shell>
      <Topbar />

      <div className="grid gap-6 lg:gap-8 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0">

      {/* Welcome / setup banner. Pinned to the top so first-time visitors
          see the call-to-action before the generic greeting. Self-dismisses
          once both name and AI key are set. */}
      {(!name || !hasKey) && (
        <div
          className="rounded-xl mb-7 px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 fade-up"
          style={{
            background:
              "linear-gradient(135deg, rgba(224, 164, 88, 0.05), transparent 70%), var(--color-surface)",
            border: "1px dashed rgba(224, 164, 88, 0.25)",
          }}
        >
          <div className="min-w-0">
            <div
              className="font-mono text-[10.5px] mb-1.5"
              style={{
                color: "var(--color-accent)",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
              }}
            >
              {!name && !hasKey ? "Welcome to LeetDex" : "Finish setup"}
            </div>
            <p
              className="text-[13px] m-0"
              style={{ color: "var(--color-text-2)", lineHeight: 1.5 }}
            >
              {!name && !hasKey
                ? "Add your name for a personalized greeting and avatar, and optionally connect an AI provider for smarter picks."
                : !name
                  ? "Add your name for a personalized greeting and avatar."
                  : "Connect an AI provider for smarter Up next picks and weekly summaries."}
            </p>
          </div>
          <Link
            href="/onboarding"
            className="shrink-0 px-4 py-2 rounded-md text-[13px] font-medium self-start sm:self-auto"
            style={{
              background: "var(--color-accent)",
              color: "#1A0F08",
            }}
          >
            Personalize →
          </Link>
        </div>
      )}

      {/* Greeting */}
      <section className="fade-up mb-7 md:mb-9">
        <h1
          className="font-display font-medium m-0 mb-2 text-[28px] md:text-[42px]"
          style={{
            lineHeight: 1.08,
            letterSpacing: "-0.025em",
          }}
        >
          {greeting()}{name ? `, ${name}` : ""}.
        </h1>
        <div
          className="font-display font-medium text-[17px] md:text-[22px]"
          style={{
            lineHeight: 1.25,
            color: "var(--color-accent)",
            letterSpacing: "-0.018em",
          }}
        >
          {pickGreetingLine({
            solved: stats.solved,
            total: PROBLEMS.length,
            streak,
            idx: greetingIdx,
          })}
        </div>
      </section>

      {/* LeetCode daily challenge — fetched from LC's public GraphQL. */}
      <DailyChallenge />

      {/* Interview prep snippet — only renders when the user has an active plan. */}
      <PrepSnippet />


      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8 md:mb-10 fade-up">
        <StatBlock
          label="Solved"
          value={stats.solved}
          sub={`of ${PROBLEMS.length}`}
          href="/problems?status=solved"
        />
        <StatBlock
          label="This week"
          value={weekSummary.countThisWeek}
          sub={`since ${weekSummary.weekStartLabel}`}
        />
        <StatBlock
          label="Streak"
          value={streak}
          sub={motivationLine(streak)}
          accent
          onClick={streak > 0 ? () => setStreakOpen(true) : undefined}
        />
        <StatBlock
          label="AI provider"
          value={hasKey ? PROVIDER_META[activeProvider].label : "Not set"}
          sub={hasKey ? "BYOK · connected" : "optional · set up →"}
          mono={false}
          href={!hasKey ? "/onboarding" : undefined}
        />
      </div>

      {/* Up next: AI-only. No heuristic fallback. */}
      <SectionHeader
        title="Up next"
        right={
          hasKey ? (
            <button
              onClick={refreshPick}
              disabled={aiLoading}
              className="font-mono text-[11px] px-2.5 py-1 rounded-md transition-colors inline-flex items-center gap-1.5"
              style={{
                color: aiLoading ? "var(--color-dimmer)" : "var(--color-dim)",
                background: "transparent",
                border: "1px solid var(--color-border-2)",
                letterSpacing: "0.02em",
              }}
              title="Re-roll the pick"
            >
              <RefreshIcon /> refresh
            </button>
          ) : (
            <SmallLink href="/problems">Browse all {PROBLEMS.length}</SmallLink>
          )
        }
      />

      {hasKey && (
        <TargetingRow
          target={targetCompanies}
          onChange={setTargetCompanies}
          allCompanies={COMPANIES.map((c) => c.name)}
        />
      )}

      {!hasKey ? (
        <div
          className="px-7 py-8 rounded-2xl flex items-center justify-between gap-6 mb-10 fade-up"
          style={{
            background:
              "linear-gradient(135deg, rgba(224, 164, 88, 0.04), transparent 70%), var(--color-surface)",
            border: "1px dashed var(--color-border-2)",
          }}
        >
          <div className="min-w-0">
            <div
              className="font-mono text-[10.5px] mb-2"
              style={{
                color: "var(--color-dim)",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
              }}
            >
              AI required
            </div>
            <h3
              className="font-display font-medium m-0 text-[20px]"
              style={{ letterSpacing: "-0.02em" }}
            >
              Connect a provider to get your next pick.
            </h3>
            <p
              className="text-[12.5px] mt-1.5 max-w-[480px]"
              style={{ color: "var(--color-text-2)" }}
            >
              Gemini, OpenAI, or Anthropic. The model reads your solve history (locally, in your browser) and picks one problem that stretches you.
            </p>
          </div>
          <Link
            href="/onboarding"
            className="px-4 py-2 rounded-md text-[13px] font-medium shrink-0"
            style={{ background: "var(--color-accent)", color: "#1A0F08" }}
          >
            Connect a key →
          </Link>
        </div>
      ) : aiLoading ? (
        <div
          className="px-7 py-8 rounded-2xl mb-10 fade-up flex items-center gap-4"
          style={{
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
          }}
        >
          <PulseDot />
          <div>
            <div
              className="font-mono text-[10.5px] mb-1"
              style={{
                color: "var(--color-accent)",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
              }}
            >
              {PROVIDER_META[activeProvider].label} is thinking
            </div>
            <div className="text-[13px]" style={{ color: "var(--color-text-2)" }}>
              Picking the problem that best stretches you.
            </div>
          </div>
        </div>
      ) : aiError ? (
        <div
          className="px-5 py-4 rounded-2xl mb-10 fade-up flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4"
          style={{
            background: "var(--color-red-soft)",
            border: "1px solid rgba(224, 138, 120, 0.25)",
          }}
        >
          <div className="min-w-0 flex-1">
            <div
              className="font-mono text-[10.5px] mb-1"
              style={{
                color: "var(--color-red)",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
              }}
            >
              AI pick failed
            </div>
            <div
              className="text-[12.5px]"
              style={{
                color: "var(--color-text-2)",
                wordBreak: "break-word",
                overflowWrap: "anywhere",
              }}
            >
              {aiError}
            </div>
          </div>
          <button
            onClick={refreshPick}
            className="px-3 py-1.5 rounded-md text-[12px] font-medium self-start sm:self-auto sm:shrink-0"
            style={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border-2)",
              color: "var(--color-text-2)",
            }}
          >
            Retry
          </button>
        </div>
      ) : aiPickProblem && aiPick ? (
        <Link
          href={`/problems/${aiPickProblem.id}`}
          className="block px-7 py-6 rounded-2xl card-hover fade-up mb-10"
          style={{
            background:
              "linear-gradient(135deg, rgba(224, 164, 88, 0.06), transparent 70%), var(--color-surface)",
            border: "1px solid rgba(224, 164, 88, 0.22)",
          }}
        >
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0">
              <h3
                className="font-display font-medium m-0 text-[24px]"
                style={{ letterSpacing: "-0.02em" }}
              >
                {aiPickProblem.leetcodeNumber}. {aiPickProblem.title}
              </h3>
              <div
                className="text-[13px] mt-2 italic"
                style={{ color: "var(--color-text-2)" }}
              >
                &ldquo;{aiPick.reason}&rdquo;
              </div>
              <div
                className="text-[11.5px] mt-2"
                style={{ color: "var(--color-dim)" }}
              >
                Asked at {aiPickProblem.companies.slice(0, 5).join(", ")}
                {aiPickProblem.companies.length > 5 &&
                  ` and ${aiPickProblem.companies.length - 5} more`}
              </div>
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <DifficultyBadge value={aiPickProblem.difficulty} />
            </div>
          </div>
        </Link>
      ) : (
        <div
          className="px-7 py-8 rounded-2xl text-center mb-10"
          style={{
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
          }}
        >
          <div
            className="font-display font-medium text-lg"
            style={{ color: "var(--color-text-2)" }}
          >
            Nothing to recommend yet. Solve a few problems to get started.
          </div>
        </div>
      )}

      {/* Quick browse */}
      <SectionHeader title="Quick browse" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3 fade-up">
        <DifficultyTile diff="easy" total={stats.totalByDifficulty.easy} done={stats.byDifficulty.easy} />
        <DifficultyTile diff="medium" total={stats.totalByDifficulty.medium} done={stats.byDifficulty.medium} />
        <DifficultyTile diff="hard" total={stats.totalByDifficulty.hard} done={stats.byDifficulty.hard} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-10 fade-up">
        <BrowseGroup
          title="By topic"
          allHref="/topics"
          items={topicTiles.map((t) => ({
            label: t.name,
            href: `/problems?topic=${encodeURIComponent(t.name)}`,
            done: t.done,
            total: t.total,
          }))}
        />
        <BrowseGroup
          title="By company"
          allHref="/companies"
          items={companyTiles.map((c) => ({
            label: c.name,
            href: `/problems?company=${encodeURIComponent(c.name)}`,
            done: c.done,
            total: c.count,
          }))}
        />
      </div>

        </div>

        {/* Right column: sticky activity calendar (collapses below main on
            mobile/tablet, sticks on desktop). */}
        <aside className="lg:sticky lg:top-9 self-start space-y-3">
          <div
            className="font-mono text-[10.5px] uppercase"
            style={{
              color: "var(--color-dim)",
              letterSpacing: "0.14em",
              paddingLeft: 2,
            }}
          >
            Activity
          </div>
          <MonthCalendar attempts={attempts} />
          <div
            className="text-[11px] font-mono"
            style={{ color: "var(--color-dimmer)", paddingLeft: 2, letterSpacing: "0.02em" }}
          >
            {COMPANIES.length} companies · {PROBLEMS.length} problems
          </div>

          {recents.length > 0 && (
            <>
              <div
                className="flex items-baseline justify-between pt-3"
                style={{ paddingLeft: 2 }}
              >
                <div
                  className="font-mono text-[10.5px] uppercase"
                  style={{ color: "var(--color-dim)", letterSpacing: "0.14em" }}
                >
                  Recently solved
                </div>
                <Link
                  href="/problems?status=solved"
                  className="text-[10.5px] font-mono"
                  style={{ color: "var(--color-dim)", letterSpacing: "0.02em" }}
                >
                  all →
                </Link>
              </div>
              <div
                className="rounded-xl overflow-hidden"
                style={{
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                }}
              >
                {recents.map(({ attempt, problem }, i) =>
                  problem ? (
                    <Link
                      key={problem.id}
                      href={`/problems/${problem.id}`}
                      className="flex items-center gap-3 px-3.5 py-2.5 transition-colors"
                      style={{
                        borderTop:
                          i > 0 ? "1px solid var(--color-border)" : undefined,
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background = "var(--color-surface-2)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = "transparent")
                      }
                    >
                      <StatusGlyph status={attempt.status} />
                      <span
                        className="font-mono text-[11px] tnum text-right shrink-0"
                        style={{ color: "var(--color-dim)", width: 32 }}
                      >
                        {problem.leetcodeNumber}
                      </span>
                      <span
                        className="font-display font-medium text-[12.5px] flex-1 min-w-0 truncate"
                        style={{ letterSpacing: "-0.01em" }}
                      >
                        {problem.title}
                      </span>
                      <span
                        className="font-mono text-[10px] uppercase shrink-0"
                        style={{
                          color: "var(--color-dimmer)",
                          letterSpacing: "0.08em",
                        }}
                      >
                        {formatDate(attempt.solvedAt ?? attempt.attemptedAt)}
                      </span>
                    </Link>
                  ) : null,
                )}
              </div>
            </>
          )}

          {hasKey && (
            <>
              <div
                className="font-mono text-[10.5px] uppercase pt-3"
                style={{
                  color: "var(--color-dim)",
                  letterSpacing: "0.14em",
                  paddingLeft: 2,
                }}
              >
                Weekly summary
              </div>
              <WeeklySummaryCard
                weekStartLabel={weekSummary.weekStartLabel}
                countThisWeek={weekSummary.countThisWeek}
                loading={weekLoading}
                result={weekResult}
                error={weekError}
              />
            </>
          )}

        </aside>
      </div>

      {streakOpen && (
        <StreakModal
          streak={streak}
          attempts={attempts}
          onClose={() => setStreakOpen(false)}
        />
      )}
    </Shell>
  );
}

function SectionHeader({
  title,
  right,
}: {
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-3.5 flex items-baseline justify-between">
      <h2
        className="font-display font-medium m-0 text-[19px]"
        style={{ letterSpacing: "-0.015em" }}
      >
        {title}
      </h2>
      {right}
    </div>
  );
}

function SmallLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="text-xs"
      style={{ color: "var(--color-dim)" }}
    >
      {children} →
    </Link>
  );
}

function TargetingRow({
  target,
  onChange,
  allCompanies,
}: {
  target: string[];
  onChange: (v: string[]) => void;
  allCompanies: string[];
}) {
  const [editing, setEditing] = useState(false);
  return (
    <div
      className="px-4 py-3 rounded-xl mb-3 flex items-center gap-3 flex-wrap fade-up"
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
      }}
    >
      <span
        className="font-mono text-[10.5px] uppercase shrink-0"
        style={{ color: "var(--color-dim)", letterSpacing: "0.14em" }}
      >
        Targeting
      </span>
      {target.length === 0 && !editing ? (
        <span
          className="text-[12px]"
          style={{ color: "var(--color-dimmer)" }}
        >
          no companies set. picks span your weakest topics.
        </span>
      ) : null}
      {target.map((c) => (
        <span
          key={c}
          className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-0.5 rounded-full text-[11.5px]"
          style={{
            background: "var(--color-accent-soft)",
            color: "var(--color-accent)",
            border: "1px solid rgba(224, 164, 88, 0.3)",
          }}
        >
          {c}
          <button
            type="button"
            onClick={() => onChange(target.filter((x) => x !== c))}
            aria-label={`Remove ${c}`}
            className="w-4 h-4 rounded-full flex items-center justify-center"
            style={{ color: "var(--color-accent)" }}
          >
            <span className="text-[14px] leading-none">×</span>
          </button>
        </span>
      ))}
      <div className="flex-1 min-w-[180px]">
        {editing ? (
          <TagInput
            value={target}
            onChange={onChange}
            suggestions={allCompanies}
            placeholder="Type a company name…"
          />
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => setEditing((v) => !v)}
        className="font-mono text-[11px] px-2 py-1 rounded-md transition-colors"
        style={{
          color: editing ? "var(--color-accent)" : "var(--color-dim)",
          background: editing ? "var(--color-accent-soft)" : "transparent",
          border: `1px solid ${editing ? "rgba(224, 164, 88, 0.3)" : "var(--color-border-2)"}`,
        }}
      >
        {editing ? "done" : target.length > 0 ? "edit" : "+ add company"}
      </button>
    </div>
  );
}

function RefreshIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

function WeeklySummaryCard({
  weekStartLabel,
  countThisWeek,
  loading,
  result,
  error,
}: {
  weekStartLabel: string;
  countThisWeek: number;
  loading: boolean;
  result: WeeklySummaryResult | null;
  error: string;
}) {
  return (
    <div
      className="px-4 py-4 rounded-xl"
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
      }}
    >
      <div
        className="text-[11px] font-mono mb-3"
        style={{ color: "var(--color-dim)", letterSpacing: "0.02em" }}
      >
        week of {weekStartLabel} · {countThisWeek} solved
      </div>
      {loading && !result ? (
        <div className="flex items-center gap-2.5 py-2">
          <PulseDot />
          <span className="text-[12.5px]" style={{ color: "var(--color-text-2)" }}>
            Reading your week…
          </span>
        </div>
      ) : error ? (
        <div
          className="px-2.5 py-2 rounded-md text-[11.5px]"
          style={{
            background: "var(--color-red-soft)",
            border: "1px solid rgba(229, 96, 74, 0.25)",
            color: "var(--color-red)",
            wordBreak: "break-word",
            overflowWrap: "anywhere",
          }}
        >
          {error}
        </div>
      ) : result ? (
        <div className="flex flex-col gap-3">
          <DigestLine label="This week" body={result.summary} accent="var(--color-green)" />
          <DigestLine label="Coverage gap" body={result.coverageGap} accent="var(--color-amber)" />
          <DigestLine label="Focus next" body={result.focus} accent="var(--color-accent)" />
        </div>
      ) : null}
    </div>
  );
}

function DigestLine({
  label,
  body,
  accent,
}: {
  label: string;
  body: string;
  accent: string;
}) {
  return (
    <div>
      <div
        className="font-mono text-[9.5px] uppercase mb-1"
        style={{ color: accent, letterSpacing: "0.14em" }}
      >
        {label}
      </div>
      <div className="text-[12.5px] leading-[1.55]" style={{ color: "var(--color-text)" }}>
        {body}
      </div>
    </div>
  );
}

function PulseDot() {
  return (
    <span
      className="inline-block w-2 h-2 rounded-full"
      style={{
        background: "var(--color-accent)",
        boxShadow: "0 0 12px var(--color-accent-glow)",
        animation: "pulseDot 1.4s ease-in-out infinite",
      }}
    >
      <style>{`@keyframes pulseDot { 0%,100%{opacity:0.4;transform:scale(0.9)} 50%{opacity:1;transform:scale(1.1)} }`}</style>
    </span>
  );
}

function StatBlock({
  label,
  value,
  sub,
  accent = false,
  mono = true,
  href,
  onClick,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: boolean;
  mono?: boolean;
  href?: string;
  onClick?: () => void;
}) {
  const body = (
    <>
      <div
        className="text-[11px] mb-2 uppercase"
        style={{ color: "var(--color-dim)", letterSpacing: "0.06em" }}
      >
        {label}
      </div>
      <div
        className={mono ? "font-mono tnum font-medium" : "font-display font-medium"}
        style={{
          color: accent ? "var(--color-accent)" : "var(--color-text)",
          letterSpacing: "-0.02em",
          fontSize: mono ? 26 : 22,
        }}
      >
        {value}
      </div>
      {sub && (
        <div className="text-[11.5px] mt-1" style={{ color: "var(--color-dim)" }}>
          {sub}
        </div>
      )}
    </>
  );
  const baseStyle = {
    background: "var(--color-surface)",
    border: "1px solid var(--color-border)",
  };
  if (href) {
    return (
      <Link
        href={href}
        className="block px-5 py-4 rounded-xl card-hover"
        style={baseStyle}
      >
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="block w-full text-left px-5 py-4 rounded-xl card-hover"
        style={baseStyle}
      >
        {body}
      </button>
    );
  }
  return (
    <div className="px-5 py-4 rounded-xl" style={baseStyle}>
      {body}
    </div>
  );
}

/* Compact home-page snippet that nudges the user toward today's slot in
 * the active interview prep plan. Only renders when a plan exists.
 * Returns null otherwise so first-time users see no clutter. */
function PrepSnippet() {
  const plan = useStore((s) => s.activePlan);
  const attempts = useStore((s) => s.attempts);
  if (!plan) return null;

  const progress = computePlanProgress(plan, attempts);
  const todayCount = progress.todaySlot?.problemIds.length ?? 0;
  const todaySolved = (progress.todaySlot?.problemIds ?? []).filter(
    (id) => attempts[id]?.status === "solved",
  ).length;

  const headline =
    todayCount === 0
      ? progress.overdueProblemIds.length > 0
        ? `${progress.overdueProblemIds.length} to catch up on`
        : "Plan window is over"
      : todaySolved === todayCount
        ? `Today done · ${todayCount}/${todayCount}`
        : `${todaySolved}/${todayCount} today`;

  return (
    <Link
      href="/prep"
      className="block rounded-xl mb-7 px-4 sm:px-5 py-4 fade-up card-hover"
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
      }}
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
        <div
          className="flex flex-col items-center justify-center shrink-0 rounded-lg"
          style={{
            width: 46,
            height: 50,
            background: "var(--color-bg-warm)",
            border: "1px solid var(--color-border-2)",
          }}
        >
          <div
            className="font-mono text-[9px]"
            style={{
              color: "var(--color-accent)",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              lineHeight: 1,
              marginTop: 4,
            }}
          >
            {progress.daysRemaining === 0 ? "Now" : "Days"}
          </div>
          <div
            className="font-display font-semibold tnum"
            style={{
              fontSize: 22,
              lineHeight: 1.1,
              color: "var(--color-text)",
              letterSpacing: "-0.02em",
              marginTop: 2,
            }}
          >
            {progress.daysRemaining}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div
            className="font-mono text-[10px] uppercase mb-1"
            style={{ color: "var(--color-dim)", letterSpacing: "0.14em" }}
          >
            Interview prep · {plan.company}
          </div>
          <div
            className="font-display font-medium text-[14.5px]"
            style={{ letterSpacing: "-0.01em" }}
          >
            {headline}
          </div>
          <div
            className="text-[11.5px] mt-0.5"
            style={{ color: "var(--color-dimmer)" }}
          >
            Interview on {parseLocalDate(plan.interviewDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            {progress.overdueProblemIds.length > 0 && todayCount > 0
              ? ` · ${progress.overdueProblemIds.length} overdue`
              : ""}
          </div>
        </div>

        <div
          className="shrink-0 self-start sm:self-auto px-3 py-1.5 rounded-md text-[12px] font-medium"
          style={{ background: "var(--color-accent)", color: "#1A0F08" }}
        >
          Open plan →
        </div>
      </div>
    </Link>
  );
}

function DifficultyTile({
  diff,
  total,
  done,
}: {
  diff: Difficulty;
  total: number;
  done: number;
}) {
  const colors = {
    easy: { fg: "var(--color-easy)", bg: "var(--color-easy-soft)" },
    medium: { fg: "var(--color-medium)", bg: "var(--color-medium-soft)" },
    hard: { fg: "var(--color-hard)", bg: "var(--color-hard-soft)" },
  }[diff];
  const pct = total > 0 ? (done / total) * 100 : 0;
  return (
    <Link
      href={`/problems?difficulty=${diff}`}
      className="block px-5 py-4 rounded-xl card-hover relative overflow-hidden"
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <span
          className="text-[10.5px] font-mono uppercase"
          style={{ color: colors.fg, letterSpacing: "0.14em" }}
        >
          {diff}
        </span>
        <span
          className="font-mono text-[11px] tnum"
          style={{ color: "var(--color-dim)" }}
        >
          {done}/{total}
        </span>
      </div>
      <div
        className="font-mono font-medium tnum"
        style={{
          color: "var(--color-text)",
          fontSize: 28,
          letterSpacing: "-0.02em",
        }}
      >
        {total}
      </div>
      <div className="text-[11px] mt-0.5" style={{ color: "var(--color-dim)" }}>
        problems
      </div>
      <div
        className="h-[3px] rounded-full mt-3 overflow-hidden"
        style={{ background: "var(--color-surface-2)" }}
      >
        <div
          className="h-full transition-all"
          style={{ width: `${pct}%`, background: colors.fg }}
        />
      </div>
    </Link>
  );
}

function BrowseGroup({
  title,
  allHref,
  items,
}: {
  title: string;
  allHref: string;
  items: { label: string; href: string; done: number; total: number }[];
}) {
  return (
    <div
      className="px-5 py-4 rounded-xl"
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
      }}
    >
      <div className="flex items-baseline justify-between mb-3">
        <span
          className="text-[10.5px] font-mono uppercase"
          style={{ color: "var(--color-dim)", letterSpacing: "0.14em" }}
        >
          {title}
        </span>
        <Link
          href={allHref}
          className="text-[11px]"
          style={{ color: "var(--color-accent)" }}
        >
          see all →
        </Link>
      </div>
      <div className="flex flex-col">
        {items.map((it) => {
          const pct = it.total > 0 ? (it.done / it.total) * 100 : 0;
          return (
            <Link
              key={it.label}
              href={it.href}
              className="flex items-center gap-3 py-2 transition-colors"
              style={{ color: "var(--color-text-2)" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-text)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-text-2)")}
            >
              <span className="text-[13px] font-medium flex-1 truncate">
                {it.label}
              </span>
              <div
                className="h-[2px] rounded-full overflow-hidden"
                style={{ background: "var(--color-surface-2)", width: 56 }}
              >
                <div
                  className="h-full"
                  style={{ width: `${pct}%`, background: "var(--color-accent)" }}
                />
              </div>
              <span
                className="font-mono text-[10.5px] tnum shrink-0"
                style={{ color: "var(--color-dim)", minWidth: 48, textAlign: "right" }}
              >
                {it.done}/{it.total}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

/* Subline under "Good morning." If the user has solves, we always show
 * their progress (most meaningful info). Otherwise we pick from a small
 * pool of factual first-impression lines — `idx` is randomized in the
 * component so it stays stable for the render but changes per page load. */
function pickGreetingLine({
  solved,
  total,
  idx,
}: {
  solved: number;
  total: number;
  streak: number;
  idx: number;
}): string {
  const n = (v: number) => v.toLocaleString();
  if (solved > 0) return `${n(solved)} of ${n(total)} solved.`;
  const lines = [
    `${n(total)} problems to start with.`,
    `${n(STATS.companies)} companies, organized by recency.`,
    `${n(STATS.easy)} easy problems to warm up with.`,
    `Pick a company. See what they actually ask.`,
    `Track every solve locally, no account needed.`,
  ];
  return lines[idx % lines.length];
}

function computeStreak(cells: { date: string; count: number }[]) {
  let streak = 0;
  for (let i = cells.length - 1; i >= 0; i--) {
    if (cells[i].count > 0) streak += 1;
    else if (i === cells.length - 1) continue;
    else break;
  }
  return streak;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  // Compare calendar days in local time, not 24-hour windows. A solve at
  // 11 PM yesterday and a render at 1 AM today is < 24h apart but it IS
  // "yesterday", not "today".
  const dMidnight = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round(
    (nowMidnight.getTime() - dMidnight.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diff <= 0) return "today";
  if (diff === 1) return "yesterday";
  if (diff < 7) return `${diff}d ago`;
  return d.toLocaleDateString();
}
