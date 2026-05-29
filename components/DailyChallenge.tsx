"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PROBLEMS } from "@/lib/catalog";
import { DifficultyBadge } from "./Primitives";
import type { Difficulty } from "@/lib/schema";

type Daily = {
  date: string;
  url: string;
  title: string;
  slug: string;
  leetcodeNumber: number;
  difficulty: Difficulty;
  paidOnly: boolean;
  acceptance?: number;
  topics: string[];
};

export function DailyChallenge() {
  const [daily, setDaily] = useState<Daily | null>(null);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Skip the browser HTTP cache so a long-open tab still picks up the
    // day flip; the server route still owns its own short TTL cache.
    fetch("/api/daily", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d: Daily) => {
        if (!cancelled && d && d.title) setDaily(d);
      })
      .catch(() => {
        if (!cancelled) setErrored(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // If the daily problem is in our catalog, link to the internal detail page
  // so the user gets tracking + AI hints. Otherwise link straight to LC.
  // Hook runs unconditionally (returns undefined when daily isn't loaded).
  const catalogMatch = useMemo(
    () =>
      daily
        ? PROBLEMS.find(
            (p) =>
              p.slug === daily.slug ||
              p.leetcodeNumber === daily.leetcodeNumber,
          )
        : undefined,
    [daily],
  );

  // If LC's API failed (CORS, rate limit, schema change), render nothing.
  if (errored || !daily) return null;

  const internalHref = catalogMatch ? `/problems/${catalogMatch.id}` : null;
  const { day, month } = parseDate(daily.date);

  return (
    <div
      className="rounded-xl mb-7 px-4 sm:px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 fade-up"
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
      }}
    >
      {/* Left: calendar-tile date block (MMM on top, day below) */}
      <div
        className="flex flex-col items-center justify-center shrink-0 rounded-lg"
        style={{
          width: 46,
          height: 50,
          background: "var(--color-bg-warm)",
          border: "1px solid var(--color-border-2)",
        }}
        aria-label={daily.date}
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
          {month}
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
          {day}
        </div>
      </div>

      {/* Middle: eyebrow + title + topics */}
      <div className="min-w-0 flex-1">
        <div
          className="font-mono text-[10px] uppercase mb-1"
          style={{
            color: "var(--color-dim)",
            letterSpacing: "0.14em",
          }}
        >
          Today&apos;s LeetCode challenge
        </div>
        <div className="flex items-baseline gap-2 flex-wrap">
          <span
            className="font-mono text-[11px] tnum shrink-0"
            style={{ color: "var(--color-dim)" }}
          >
            #{daily.leetcodeNumber}
          </span>
          <span
            className="font-display font-medium text-[14.5px] truncate"
            style={{ letterSpacing: "-0.01em" }}
          >
            {daily.title}
          </span>
          {daily.paidOnly && (
            <span
              className="font-mono text-[9px] uppercase px-1.5 py-px rounded"
              style={{
                color: "var(--color-amber)",
                background: "var(--color-amber-soft)",
                letterSpacing: "0.1em",
              }}
              title="Requires LeetCode Premium"
            >
              Premium
            </span>
          )}
        </div>
        {daily.topics.length > 0 && (
          <div
            className="text-[11px] mt-0.5 truncate"
            style={{ color: "var(--color-dimmer)" }}
          >
            {daily.topics.slice(0, 4).join(" · ")}
            {daily.topics.length > 4 && ` · +${daily.topics.length - 4}`}
          </div>
        )}
      </div>

      {/* Right: difficulty + action */}
      <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
        <DifficultyBadge value={daily.difficulty} />
        {internalHref ? (
          <Link
            href={internalHref}
            className="px-3 py-1.5 rounded-md text-[12px] font-medium"
            style={{ background: "var(--color-accent)", color: "#1A0F08" }}
          >
            Solve →
          </Link>
        ) : (
          <a
            href={daily.url}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 rounded-md text-[12px] font-medium inline-flex items-center gap-1.5"
            style={{ background: "var(--color-accent)", color: "#1A0F08" }}
          >
            LeetCode <span style={{ fontFamily: "var(--font-mono)" }}>↗</span>
          </a>
        )}
      </div>
    </div>
  );
}

function parseDate(iso: string): { day: string; month: string } {
  try {
    const [y, m, d] = iso.split("-").map(Number);
    if (!y || !m || !d) return { day: "—", month: "" };
    const date = new Date(y, m - 1, d);
    return {
      day: String(d),
      month: date
        .toLocaleDateString(undefined, { month: "short" })
        .toUpperCase(),
    };
  } catch {
    return { day: "—", month: "" };
  }
}
