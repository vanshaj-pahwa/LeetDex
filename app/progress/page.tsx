"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { Shell, Topbar } from "@/components/Shell";
import { PROBLEMS } from "@/lib/catalog";
import { buildHeatmap, solveStats } from "@/lib/recommend";
import { Stat } from "@/components/Primitives";

export default function ProgressPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const attempts = useStore((s) => s.attempts);

  if (!mounted) return null;

  const stats = solveStats(PROBLEMS, attempts);
  const cells = buildHeatmap(attempts, 182); // last ~26 weeks
  const cols: { date: string; count: number }[][] = [];
  for (let i = 0; i < cells.length; i += 7) cols.push(cells.slice(i, i + 7));
  const max = Math.max(1, ...cells.map((c) => c.count));

  // Weak areas - companies with the lowest solve-rate (min 10 problems).
  const byCo = new Map<string, { total: number; done: number }>();
  for (const p of PROBLEMS) {
    for (const c of p.companies) {
      const b = byCo.get(c) ?? { total: 0, done: 0 };
      b.total += 1;
      const a = attempts[p.id];
      if (a?.status === "solved") b.done += 1;
      byCo.set(c, b);
    }
  }
  const weak = Array.from(byCo.entries())
    .filter(([, b]) => b.total >= 10)
    .map(([name, b]) => ({ name, ...b, pct: b.done / b.total }))
    .sort((a, b) => a.pct - b.pct)
    .slice(0, 8);

  return (
    <Shell>
      <Topbar />

      <div className="fade-up mb-8">
        <h1
          className="font-display font-medium m-0 mb-2"
          style={{ fontSize: 32, lineHeight: 1.1, letterSpacing: "-0.025em" }}
        >
          Progress
        </h1>
        <p className="m-0 text-sm" style={{ color: "var(--color-dim)" }}>
          Local-only. Stored in your browser. Export coming.
        </p>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-8 fade-up">
        <Stat label="Total solved" value={stats.solved} accent sub={`of ${PROBLEMS.length}`} />
        <Stat
          label="Easy"
          value={`${stats.byDifficulty.easy}/${stats.totalByDifficulty.easy}`}
        />
        <Stat
          label="Medium"
          value={`${stats.byDifficulty.medium}/${stats.totalByDifficulty.medium}`}
        />
        <Stat
          label="Hard"
          value={`${stats.byDifficulty.hard}/${stats.totalByDifficulty.hard}`}
        />
      </div>

      <h2
        className="font-display font-medium m-0 mb-3 text-[18px]"
        style={{ letterSpacing: "-0.015em" }}
      >
        Last 26 weeks
      </h2>
      <div
        className="px-5 py-5 rounded-xl mb-8"
        style={{
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
        }}
      >
        <div className="flex gap-[3px] overflow-x-auto">
          {cols.map((col, ci) => (
            <div key={ci} className="flex flex-col gap-[3px]">
              {col.map((c) => {
                const intensity = c.count === 0 ? 0 : Math.min(1, c.count / max);
                return (
                  <div
                    key={c.date}
                    className="heat-cell"
                    title={`${c.date} · ${c.count} solved`}
                    style={
                      c.count > 0
                        ? {
                            background: `rgba(224, 164, 88, ${0.18 + intensity * 0.6})`,
                            borderColor: "rgba(224, 164, 88, 0.3)",
                          }
                        : undefined
                    }
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <h2
        className="font-display font-medium m-0 mb-3 text-[18px]"
        style={{ letterSpacing: "-0.015em" }}
      >
        Weak areas
      </h2>
      <p className="m-0 text-sm mb-4" style={{ color: "var(--color-dim)" }}>
        Companies where your solve-rate is lowest. Your next crux usually comes from here.
      </p>
      <div className="flex flex-col gap-2 fade-up">
        {weak.map((w) => (
          <div
            key={w.name}
            className="px-5 py-3.5 rounded-xl flex items-center gap-4"
            style={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
            }}
          >
            <span className="font-display font-medium text-[14px]" style={{ minWidth: 160 }}>
              {w.name}
            </span>
            <div
              className="flex-1 h-[3px] rounded-full overflow-hidden"
              style={{ background: "var(--color-surface-2)" }}
            >
              <div
                className="h-full"
                style={{
                  width: `${w.pct * 100}%`,
                  background: "var(--color-accent)",
                }}
              />
            </div>
            <span
              className="font-mono text-[12px] tnum shrink-0"
              style={{ color: "var(--color-dim)", minWidth: 60, textAlign: "right" }}
            >
              {w.done}/{w.total}
            </span>
          </div>
        ))}
      </div>
    </Shell>
  );
}
