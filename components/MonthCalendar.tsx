"use client";

import { useMemo, useState } from "react";
import type { Attempt } from "@/lib/schema";

/**
 * Monthly calendar of solves. Today is filled with the accent color; days
 * with at least one solve get a small dot underneath; days outside the
 * current view-month are dimmed. The header shows the month and a today /
 * prev / next control.
 */
export function MonthCalendar({
  attempts,
}: {
  attempts: Record<string, Attempt>;
}) {
  const [view, setView] = useState<Date>(() => startOfMonth(new Date()));

  const solveCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of Object.values(attempts)) {
      if (!a.solvedAt) continue;
      const key = a.solvedAt.slice(0, 10);
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [attempts]);

  const today = new Date();
  const todayKey = isoDate(today);

  const cells = useMemo(() => buildMonthGrid(view, solveCounts, todayKey), [
    view,
    solveCounts,
    todayKey,
  ]);

  const solvedThisMonth = cells.reduce(
    (sum, c) => sum + (c.inMonth ? c.count : 0),
    0,
  );

  const monthLabel = view.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  const goPrev = () =>
    setView(new Date(view.getFullYear(), view.getMonth() - 1, 1));
  const goNext = () =>
    setView(new Date(view.getFullYear(), view.getMonth() + 1, 1));
  const goToday = () => setView(startOfMonth(new Date()));

  const isCurrentMonth =
    view.getFullYear() === today.getFullYear() &&
    view.getMonth() === today.getMonth();

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
          <DayCell key={cell.key} cell={cell} />
        ))}
      </div>
    </div>
  );
}

function DayCell({
  cell,
}: {
  cell: {
    key: string;
    date: Date;
    inMonth: boolean;
    isToday: boolean;
    count: number;
  };
}) {
  const hasSolve = cell.count > 0;
  return (
    <div
      className="relative aspect-square flex flex-col items-center justify-center rounded-md"
      title={hasSolve ? `${cell.key} · ${cell.count} solved` : cell.key}
      style={{
        background: cell.isToday ? "var(--color-accent)" : "transparent",
        color: cell.isToday
          ? "#1A0F08"
          : cell.inMonth
            ? "var(--color-text)"
            : "var(--color-dimmer)",
        border: hasSolve && !cell.isToday
          ? "1px solid rgba(224, 164, 88, 0.25)"
          : "1px solid transparent",
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
    </div>
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
