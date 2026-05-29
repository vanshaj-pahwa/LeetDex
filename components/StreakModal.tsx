"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import type { Attempt } from "@/lib/schema";
import { applyOverride, getProblem } from "@/lib/catalog";
import { useStore } from "@/lib/store";
import { DifficultyBadge } from "./Primitives";

/**
 * Modal listing every problem solved during the active streak, grouped by
 * day from most recent to streak start. Opens from the home page Streak
 * stat card. Closes on Escape, backdrop click, or the × button.
 */
export function StreakModal({
  streak,
  attempts,
  onClose,
}: {
  streak: number;
  attempts: Record<string, Attempt>;
  onClose: () => void;
}) {
  const overrides = useStore((s) => s.problemOverrides);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // The streak runs from `streak - 1` days ago through today. Build a list
  // of date keys in reverse chronological order so the most recent solves
  // appear first.
  const dateKeys = useMemo(() => {
    if (streak <= 0) return [];
    const keys: string[] = [];
    const today = startOfDay(new Date());
    for (let i = 0; i < streak; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      keys.push(isoDate(d));
    }
    return keys;
  }, [streak]);

  // Group attempts by their solvedAt date, filtering to the streak window.
  const groupedByDay = useMemo(() => {
    const inWindow = new Set(dateKeys);
    const groups = new Map<string, { attempt: Attempt; problem: ReturnType<typeof getProblem> }[]>();
    for (const a of Object.values(attempts)) {
      if (!a.solvedAt) continue;
      const key = a.solvedAt.slice(0, 10);
      if (!inWindow.has(key)) continue;
      const base = getProblem(a.problemId);
      if (!base) continue;
      const arr = groups.get(key) ?? [];
      arr.push({ attempt: a, problem: applyOverride(base, overrides[base.id]) });
      groups.set(key, arr);
    }
    // Sort each group's items by solvedAt descending.
    for (const arr of groups.values()) {
      arr.sort((a, b) =>
        (b.attempt.solvedAt ?? "").localeCompare(a.attempt.solvedAt ?? ""),
      );
    }
    return groups;
  }, [attempts, dateKeys, overrides]);

  const totalSolved = useMemo(() => {
    let n = 0;
    for (const arr of groupedByDay.values()) n += arr.length;
    return n;
  }, [groupedByDay]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.55)",
        backdropFilter: "blur(2px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9000,
        padding: "24px 16px",
      }}
    >
      <div
        className="rounded-2xl fade-up w-full flex flex-col"
        style={{
          maxWidth: 560,
          maxHeight: "calc(100vh - 48px)",
          background: "var(--color-bg-warm)",
          border: "1px solid var(--color-border-2)",
          boxShadow: "0 24px 60px rgba(0,0,0,0.6)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="px-6 py-4 flex items-start justify-between shrink-0"
          style={{ borderBottom: "1px solid var(--color-border)" }}
        >
          <div>
            <div
              className="font-mono text-[10.5px] mb-1.5"
              style={{
                color: "var(--color-accent)",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
              }}
            >
              Current streak
            </div>
            <h2
              className="font-display font-medium m-0"
              style={{ fontSize: 22, letterSpacing: "-0.02em" }}
            >
              {streak} {streak === 1 ? "day" : "days"} in a row
            </h2>
            <div
              className="text-[12.5px] mt-1.5"
              style={{ color: "var(--color-text-2)" }}
            >
              {motivationLine(streak)}
            </div>
          </div>
          <button
            onClick={onClose}
            className="font-mono text-[16px] px-2 py-0.5 shrink-0"
            style={{ color: "var(--color-dim)" }}
            title="Close"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 overflow-y-auto flex-1">
          <div
            className="font-mono text-[10.5px] mb-3"
            style={{
              color: "var(--color-dim)",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
            }}
          >
            {totalSolved} solved across the streak
          </div>

          {dateKeys.length === 0 || totalSolved === 0 ? (
            <div className="text-[13px]" style={{ color: "var(--color-dimmer)" }}>
              No solves in the streak window yet.
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              {dateKeys.map((key) => {
                const group = groupedByDay.get(key);
                if (!group || group.length === 0) return null;
                return (
                  <div key={key}>
                    <div
                      className="font-display font-medium text-[12.5px] mb-2"
                      style={{
                        color: "var(--color-text-2)",
                        letterSpacing: "-0.01em",
                      }}
                    >
                      {formatDayLabel(key)}
                      <span
                        className="font-mono ml-2 text-[11px]"
                        style={{ color: "var(--color-dim)" }}
                      >
                        {group.length} solved
                      </span>
                    </div>
                    <ul className="flex flex-col gap-1">
                      {group.map(({ problem }) =>
                        problem ? (
                          <li key={problem.id}>
                            <Link
                              href={`/problems/${problem.id}`}
                              onClick={onClose}
                              className="flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors"
                              style={{ background: "transparent" }}
                              onMouseEnter={(e) =>
                                (e.currentTarget.style.background =
                                  "var(--color-surface-2)")
                              }
                              onMouseLeave={(e) =>
                                (e.currentTarget.style.background =
                                  "transparent")
                              }
                            >
                              <span
                                className="font-mono text-[11px] tnum shrink-0"
                                style={{
                                  color: "var(--color-dim)",
                                  minWidth: 28,
                                }}
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
                        ) : null,
                      )}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* Pick a tiered motivational line based on the current streak length.
 * Bands picked to feel rewarding without being saccharine. */
export function motivationLine(streak: number): string {
  if (streak <= 0) return "Solve one problem today to start a streak.";
  if (streak === 1) return "Day one. Don't break it tomorrow.";
  if (streak < 7) return `${streak} days in. Keep showing up.`;
  if (streak === 7) return "Seven days. Well done, champ. Keep going.";
  if (streak < 14) return `${streak} days strong. Don't stop now.`;
  if (streak === 14) return "Two weeks straight. Real momentum.";
  if (streak < 30) return `${streak} days. You're building a habit.`;
  if (streak === 30) return "Thirty days. That's a milestone.";
  if (streak < 100) return `${streak} days. Unstoppable.`;
  return `${streak} days. You're on another level now.`;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDayLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const todayKey = isoDate(startOfDay(new Date()));
  const yKey = isoDate(
    new Date(new Date().setDate(new Date().getDate() - 1)),
  );
  if (iso === todayKey) return "Today";
  if (iso === yKey) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
