"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Attempt, Difficulty, Problem } from "@/lib/schema";
import { PROBLEMS, applyOverride, getProblem } from "@/lib/catalog";
import { useStore } from "@/lib/store";
import { DifficultyBadge } from "./Primitives";

/**
 * Monthly calendar of solves. Today is filled with the accent color; days
 * with at least one solve get a small dot underneath; days outside the
 * current view-month are dimmed. Clicking any in-month date opens a panel
 * underneath listing the problems solved on that day, plus the LeetCode
 * daily challenge for that date (marked solved or unsolved).
 */

type DailyMeta = {
  date: string;
  url: string;
  slug: string;
  leetcodeNumber: number;
  title: string;
  difficulty: Difficulty;
  paidOnly: boolean;
};
type DailyMonthResponse = { year: number; month: number; challenges: DailyMeta[] };

/* Match a LC daily challenge to a problem in our catalog by slug first, then
 * by leetcodeNumber. Used to render an internal link when possible. */
function matchCatalogProblem(daily: DailyMeta): Problem | undefined {
  const bySlug = PROBLEMS.find((p) => p.slug === daily.slug);
  if (bySlug) return bySlug;
  return PROBLEMS.find((p) => p.leetcodeNumber === daily.leetcodeNumber);
}

export function MonthCalendar({
  attempts,
}: {
  attempts: Record<string, Attempt>;
}) {
  const [view, setView] = useState<Date>(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const overrides = useStore((s) => s.problemOverrides);

  // LC dailies for the viewed month, keyed by ISO date string. Refetched
  // whenever the view month changes. Past months are immutable and cache
  // forever; the current month grows by at most one entry per day.
  const [dailiesByDate, setDailiesByDate] = useState<Map<string, DailyMeta>>(
    () => new Map(),
  );
  useEffect(() => {
    let cancelled = false;
    const y = view.getFullYear();
    const m = view.getMonth() + 1;
    fetch(`/api/daily-month?year=${y}&month=${m}`, { cache: "force-cache" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: DailyMonthResponse | null) => {
        if (cancelled || !d?.challenges) return;
        const map = new Map<string, DailyMeta>();
        for (const c of d.challenges) map.set(c.date, c);
        setDailiesByDate(map);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [view]);

  // Group attempts by their solvedAt date once; both the dot counts and the
  // selected-day list read from this.
  const attemptsByDay = useMemo(() => {
    const map = new Map<string, Attempt[]>();
    for (const a of Object.values(attempts)) {
      if (!a.solvedAt) continue;
      const key = a.solvedAt.slice(0, 10);
      const arr = map.get(key) ?? [];
      arr.push(a);
      map.set(key, arr);
    }
    return map;
  }, [attempts]);

  const solveCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const [k, arr] of attemptsByDay) map.set(k, arr.length);
    return map;
  }, [attemptsByDay]);

  const today = new Date();
  const todayKey = isoDate(today);

  const cells = useMemo(
    () => buildMonthGrid(view, solveCounts, todayKey),
    [view, solveCounts, todayKey],
  );

  const solvedThisMonth = cells.reduce(
    (sum, c) => sum + (c.inMonth ? c.count : 0),
    0,
  );

  const monthLabel = view.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  const goPrev = () => {
    setView(new Date(view.getFullYear(), view.getMonth() - 1, 1));
    setSelectedDay(null);
  };
  const goNext = () => {
    setView(new Date(view.getFullYear(), view.getMonth() + 1, 1));
    setSelectedDay(null);
  };
  const goToday = () => {
    setView(startOfMonth(new Date()));
    setSelectedDay(null);
  };

  const isCurrentMonth =
    view.getFullYear() === today.getFullYear() &&
    view.getMonth() === today.getMonth();

  function handleDayClick(key: string, inMonth: boolean) {
    if (!inMonth) return;
    setSelectedDay((prev) => (prev === key ? null : key));
  }

  // Resolve the selected day's attempts to full Problem rows.
  const selectedRows = useMemo(() => {
    if (!selectedDay) return [];
    const arr = attemptsByDay.get(selectedDay) ?? [];
    return arr
      .map((a) => {
        const base = getProblem(a.problemId);
        if (!base) return null;
        return { attempt: a, problem: applyOverride(base, overrides[base.id]) };
      })
      .filter((x): x is { attempt: Attempt; problem: NonNullable<ReturnType<typeof getProblem>> } => x !== null)
      .sort((a, b) =>
        (b.attempt.solvedAt ?? "").localeCompare(a.attempt.solvedAt ?? ""),
      );
  }, [selectedDay, attemptsByDay, overrides]);

  const selectedDaily = selectedDay ? dailiesByDate.get(selectedDay) ?? null : null;

  // If the user solved the day's daily, find its row so we can tag it and
  // suppress the standalone "daily challenge" row that would otherwise
  // duplicate it.
  const dailyMatchedProblemId = useMemo(() => {
    if (!selectedDaily) return null;
    const hit = selectedRows.find(
      ({ problem }) =>
        problem.slug === selectedDaily.slug ||
        problem.leetcodeNumber === selectedDaily.leetcodeNumber,
    );
    return hit?.problem.id ?? null;
  }, [selectedDaily, selectedRows]);

  return (
    <div
      className="px-5 py-5 rounded-xl"
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <div
            className="font-display font-medium text-[16px]"
            style={{ letterSpacing: "-0.015em" }}
          >
            {monthLabel}
          </div>
          <div
            className="text-[11.5px] mt-0.5 font-mono"
            style={{ color: "var(--color-dim)" }}
          >
            {solvedThisMonth} solved this month
          </div>
        </div>
        <div className="flex items-center gap-1">
          <NavBtn onClick={goPrev} title="Previous month" aria-label="Previous month">
            ‹
          </NavBtn>
          <button
            onClick={goToday}
            disabled={isCurrentMonth}
            className="px-2.5 py-1 rounded-md text-[11px] font-mono transition-colors"
            style={{
              background: isCurrentMonth ? "transparent" : "var(--color-surface-2)",
              border: `1px solid ${
                isCurrentMonth ? "var(--color-border)" : "var(--color-border-2)"
              }`,
              color: isCurrentMonth ? "var(--color-dimmer)" : "var(--color-text-2)",
              letterSpacing: "0.02em",
            }}
          >
            today
          </button>
          <NavBtn onClick={goNext} title="Next month" aria-label="Next month">
            ›
          </NavBtn>
        </div>
      </div>

      {/* Weekday strip */}
      <div className="grid grid-cols-7 gap-1 mb-1.5">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div
            key={i}
            className="text-center text-[10px] font-mono uppercase"
            style={{ color: "var(--color-dimmer)", letterSpacing: "0.12em" }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell) => (
          <DayCell
            key={cell.key}
            cell={cell}
            selected={cell.key === selectedDay}
            onClick={() => handleDayClick(cell.key, cell.inMonth)}
          />
        ))}
      </div>

      {/* Selected-day panel */}
      {selectedDay && (
        <SelectedDayPanel
          selectedDay={selectedDay}
          rows={selectedRows}
          dailyMatchedProblemId={dailyMatchedProblemId}
          dailyChallenge={selectedDaily}
          onClose={() => setSelectedDay(null)}
        />
      )}
    </div>
  );
}

function SelectedDayPanel({
  selectedDay,
  rows,
  dailyMatchedProblemId,
  dailyChallenge,
  onClose,
}: {
  selectedDay: string;
  rows: {
    attempt: Attempt;
    problem: NonNullable<ReturnType<typeof getProblem>>;
  }[];
  dailyMatchedProblemId: string | null;
  dailyChallenge: DailyMeta | null;
  onClose: () => void;
}) {
  const headingLabel = useMemo(() => {
    const [y, m, d] = selectedDay.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }, [selectedDay]);

  // The daily challenge (if any) is rendered in its own labeled subsection
  // above the regular solves list, never inline.
  const dailyCatalogMatch = dailyChallenge
    ? matchCatalogProblem(dailyChallenge)
    : undefined;

  // Exclude the daily from the regular solves list so it doesn't appear
  // twice when the user solved it.
  const otherRows = useMemo(
    () => rows.filter(({ problem }) => problem.id !== dailyMatchedProblemId),
    [rows, dailyMatchedProblemId],
  );

  const totalLabel =
    rows.length === 0
      ? dailyChallenge
        ? "daily only"
        : "no solves"
      : `${rows.length} solved`;

  return (
    <div
      className="mt-4 pt-4 fade-up"
      style={{ borderTop: "1px solid var(--color-border)" }}
    >
      <div className="flex items-baseline justify-between mb-3">
        <div
          className="font-display font-medium text-[13.5px]"
          style={{ letterSpacing: "-0.01em" }}
        >
          {headingLabel}
          <span
            className="font-mono ml-2 text-[11.5px]"
            style={{ color: "var(--color-dim)" }}
          >
            {totalLabel}
          </span>
        </div>
        <button
          onClick={onClose}
          className="font-mono text-[11px] px-1.5 py-0.5"
          style={{ color: "var(--color-dim)" }}
          title="Close"
        >
          ×
        </button>
      </div>

      {/* LeetCode Daily subsection — always shown when LC had a daily for this date */}
      {dailyChallenge && (
        <div className="mb-3">
          <SubHeading>LeetCode Daily</SubHeading>
          <DailyRow
            daily={dailyChallenge}
            catalogMatch={dailyCatalogMatch}
            solved={!!dailyMatchedProblemId}
          />
        </div>
      )}

      {/* Other solves on this day, excluding the daily (already shown above). */}
      {otherRows.length > 0 && (
        <>
          {dailyChallenge && <SubHeading>Solved</SubHeading>}
          <ul className="flex flex-col gap-1">
            {otherRows.map(({ problem }) => (
              <li key={problem.id}>
                <Link
                  href={`/problems/${problem.id}`}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors"
                  style={{ background: "transparent" }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = "var(--color-surface-2)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = "transparent")
                  }
                >
                  <span
                    className="font-mono text-[11px] tnum shrink-0"
                    style={{ color: "var(--color-dim)", minWidth: 28 }}
                  >
                    {problem.leetcodeNumber}
                  </span>
                  <span
                    className="text-[12.5px] truncate flex-1"
                    style={{ color: "var(--color-text)" }}
                  >
                    {problem.title}
                  </span>
                  <DifficultyBadge value={problem.difficulty} />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Empty state: no solves, no daily. */}
      {rows.length === 0 && !dailyChallenge && (
        <div className="text-[12px]" style={{ color: "var(--color-dimmer)" }}>
          Nothing solved on this day.
        </div>
      )}
    </div>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-[10px] font-mono uppercase mb-1.5"
      style={{ color: "var(--color-dim)", letterSpacing: "0.14em" }}
    >
      {children}
    </div>
  );
}

function DailyRow({
  daily,
  catalogMatch,
  solved,
}: {
  daily: DailyMeta;
  catalogMatch: Problem | undefined;
  solved: boolean;
}) {
  const href = catalogMatch ? `/problems/${catalogMatch.id}` : daily.url;
  const isInternal = !!catalogMatch;

  const content = (
    <>
      <span
        className="font-mono text-[11px] tnum shrink-0"
        style={{ color: "var(--color-dim)", minWidth: 28 }}
      >
        {daily.leetcodeNumber}
      </span>
      <span
        className="text-[12.5px] truncate flex-1"
        style={{
          color: solved ? "var(--color-text)" : "var(--color-text-2)",
        }}
      >
        {daily.title}
      </span>
      <DifficultyBadge value={daily.difficulty} />
    </>
  );

  const sharedClass =
    "flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors";
  const hoverIn = (el: HTMLElement) =>
    (el.style.background = "var(--color-surface-2)");
  const hoverOut = (el: HTMLElement) => (el.style.background = "transparent");

  if (isInternal) {
    return (
      <Link
        href={href}
        className={sharedClass}
        style={{ background: "transparent" }}
        onMouseEnter={(e) => hoverIn(e.currentTarget)}
        onMouseLeave={(e) => hoverOut(e.currentTarget)}
      >
        {content}
      </Link>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={sharedClass}
      style={{ background: "transparent" }}
      onMouseEnter={(e) => hoverIn(e.currentTarget)}
      onMouseLeave={(e) => hoverOut(e.currentTarget)}
    >
      {content}
    </a>
  );
}

function DayCell({
  cell,
  selected,
  onClick,
}: {
  cell: {
    key: string;
    date: Date;
    inMonth: boolean;
    isToday: boolean;
    count: number;
  };
  selected: boolean;
  onClick: () => void;
}) {
  const hasSolve = cell.count > 0;
  // Selected cells get an accent ring; today still gets its filled accent bg.
  const border = selected
    ? "1px solid var(--color-accent)"
    : hasSolve && !cell.isToday
      ? "1px solid rgba(224, 164, 88, 0.25)"
      : "1px solid transparent";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!cell.inMonth}
      className="relative aspect-square flex flex-col items-center justify-center rounded-md transition-colors"
      title={hasSolve ? `${cell.key} · ${cell.count} solved` : cell.key}
      style={{
        background: cell.isToday ? "var(--color-accent)" : "transparent",
        color: cell.isToday
          ? "#1A0F08"
          : cell.inMonth
            ? "var(--color-text)"
            : "var(--color-dimmer)",
        border,
        cursor: cell.inMonth ? "pointer" : "default",
        boxShadow: selected && !cell.isToday
          ? "0 0 0 1px var(--color-accent) inset"
          : "none",
      }}
      onMouseEnter={(e) => {
        if (!cell.inMonth || cell.isToday) return;
        if (!selected) e.currentTarget.style.background = "var(--color-surface-2)";
      }}
      onMouseLeave={(e) => {
        if (!cell.inMonth || cell.isToday) return;
        if (!selected) e.currentTarget.style.background = "transparent";
      }}
    >
      <span
        className="font-mono tnum"
        style={{
          fontSize: 12,
          fontWeight: cell.isToday ? 600 : 400,
          lineHeight: 1,
        }}
      >
        {cell.date.getDate()}
      </span>
      {hasSolve && !cell.isToday && (
        <span
          className="rounded-full"
          style={{
            width: 4,
            height: 4,
            marginTop: 3,
            background: "var(--color-accent)",
          }}
        />
      )}
      {hasSolve && cell.isToday && (
        <span
          className="rounded-full"
          style={{
            width: 4,
            height: 4,
            marginTop: 3,
            background: "#1A0F08",
            opacity: 0.7,
          }}
        />
      )}
    </button>
  );
}

function NavBtn({
  children,
  onClick,
  ...rest
}: {
  children: React.ReactNode;
  onClick: () => void;
  title?: string;
  ["aria-label"]?: string;
}) {
  return (
    <button
      onClick={onClick}
      {...rest}
      className="w-7 h-7 rounded-md flex items-center justify-center transition-colors font-mono text-[15px]"
      style={{
        background: "transparent",
        border: "1px solid var(--color-border-2)",
        color: "var(--color-text-2)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = "var(--color-accent)";
        e.currentTarget.style.borderColor = "rgba(224, 164, 88, 0.3)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = "var(--color-text-2)";
        e.currentTarget.style.borderColor = "var(--color-border-2)";
      }}
    >
      {children}
    </button>
  );
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function buildMonthGrid(
  view: Date,
  solveCounts: Map<string, number>,
  todayKey: string,
) {
  const year = view.getFullYear();
  const month = view.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startWeekday = firstOfMonth.getDay(); // Sun=0
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: {
    key: string;
    date: Date;
    inMonth: boolean;
    isToday: boolean;
    count: number;
  }[] = [];

  // Pad before with trailing days from prev month.
  for (let i = startWeekday - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    const key = isoDate(d);
    cells.push({
      key,
      date: d,
      inMonth: false,
      isToday: key === todayKey,
      count: solveCounts.get(key) ?? 0,
    });
  }
  // Current month days.
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month, day);
    const key = isoDate(d);
    cells.push({
      key,
      date: d,
      inMonth: true,
      isToday: key === todayKey,
      count: solveCounts.get(key) ?? 0,
    });
  }
  // Pad after to fill 6 full weeks (42 cells).
  let nextDay = 1;
  while (cells.length < 42) {
    const d = new Date(year, month + 1, nextDay++);
    const key = isoDate(d);
    cells.push({
      key,
      date: d,
      inMonth: false,
      isToday: key === todayKey,
      count: solveCounts.get(key) ?? 0,
    });
  }
  return cells;
}
