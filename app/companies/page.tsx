"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { Shell, Topbar } from "@/components/Shell";
import { COMPANIES, PROBLEMS } from "@/lib/catalog";

export default function CompaniesPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [q, setQ] = useState("");
  const attempts = useStore((s) => s.attempts);

  const enriched = useMemo(() => {
    const solvedByCo = new Map<string, number>();
    for (const p of PROBLEMS) {
      const a = attempts[p.id];
      if (a?.status === "solved") {
        for (const c of p.companies) {
          solvedByCo.set(c, (solvedByCo.get(c) ?? 0) + 1);
        }
      }
    }
    const term = q.trim().toLowerCase();
    return COMPANIES.map((c) => ({
      ...c,
      solved: solvedByCo.get(c.name) ?? 0,
    })).filter((c) => !term || c.name.toLowerCase().includes(term));
  }, [q, attempts]);

  if (!mounted) return null;

  return (
    <Shell>
      <Topbar value={q} onChange={setQ} searchPlaceholder="Filter companies…" />

      <div className="fade-up mb-6 md:mb-8">
        <h1
          className="font-display font-medium m-0 mb-2 text-[24px] md:text-[32px]"
          style={{ lineHeight: 1.1, letterSpacing: "-0.025em" }}
        >
          Companies
        </h1>
        <p className="m-0 text-sm" style={{ color: "var(--color-dim)" }}>
          {enriched.length} of {COMPANIES.length} companies
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 fade-up">
        {enriched.map((c) => {
          const pct = c.count > 0 ? Math.round((c.solved / c.count) * 100) : 0;
          return (
            <Link
              key={c.name}
              href={`/problems?company=${encodeURIComponent(c.name)}`}
              className="px-5 py-4 rounded-xl card-hover"
              style={{
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <span
                  className="font-display font-medium text-[15px]"
                  style={{ letterSpacing: "-0.015em" }}
                >
                  {c.name}
                </span>
                <span
                  className="font-mono text-[11px] tnum"
                  style={{ color: "var(--color-dim)" }}
                >
                  {c.solved}/{c.count}
                </span>
              </div>
              <div
                className="h-[3px] rounded-full overflow-hidden"
                style={{ background: "var(--color-surface-2)" }}
              >
                <div
                  className="h-full transition-all"
                  style={{
                    width: `${pct}%`,
                    background:
                      "linear-gradient(90deg, var(--color-accent), var(--color-accent-2))",
                  }}
                />
              </div>
            </Link>
          );
        })}
      </div>
    </Shell>
  );
}
