"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { Shell, Topbar } from "@/components/Shell";
import { applyOverride, getProblem } from "@/lib/catalog";
import { DifficultyBadge, StatusGlyph } from "@/components/Primitives";
import { HintPanel } from "@/components/HintPanel";
import { ProblemStatement } from "@/components/ProblemStatement";
export default function ProblemDetailPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { id } = useParams<{ id: string }>();
  const override = useStore((s) => s.problemOverrides[id]);
  const baseProblem = getProblem(id);
  const problem = baseProblem ? applyOverride(baseProblem, override) : undefined;

  const attempt = useStore((s) => s.attempts[id]);
  const setStatus = useStore((s) => s.setStatus);
  const clearAttempt = useStore((s) => s.clearAttempt);
  const patchAttempt = useStore((s) => s.patchAttempt);

  const [notesDraft, setNotesDraft] = useState("");
  useEffect(() => {
    setNotesDraft(attempt?.notes ?? "");
  }, [id, attempt?.notes]);

  if (!mounted) return null;
  if (!problem) {
    return (
      <Shell>
        <Topbar />
        <div className="text-center py-20">
          <h1 className="font-display text-2xl mb-2">Problem not found.</h1>
          <Link href="/problems" style={{ color: "var(--color-accent)" }}>
            ← Back to problems
          </Link>
        </div>
      </Shell>
    );
  }

  const isSolved = attempt?.status === "solved";

  const toggleSolved = () => {
    if (isSolved) clearAttempt(problem.id);
    else setStatus(problem.id, "solved");
  };

  const handleSaveNotes = () => {
    if (!attempt) setStatus(problem.id, "solved", notesDraft);
    else patchAttempt(problem.id, { notes: notesDraft });
  };

  return (
    <Shell detail={<HintPanel problem={problem} />}>
      <Topbar />

      <div className="fade-up mb-8">
        <Link
          href="/problems"
          className="text-xs mb-4 inline-block"
          style={{ color: "var(--color-dim)" }}
        >
          ← All problems
        </Link>
        <div className="flex items-baseline gap-4 mb-3">
          <StatusGlyph status={attempt?.status} />
          <span
            className="font-mono text-[13px] tnum"
            style={{ color: "var(--color-dim)" }}
          >
            #{problem.leetcodeNumber}
          </span>
          <DifficultyBadge value={problem.difficulty} />
        </div>
        <h1
          className="font-display font-medium m-0 mb-3"
          style={{
            fontSize: 36,
            lineHeight: 1.1,
            letterSpacing: "-0.025em",
          }}
        >
          {problem.title}
        </h1>
        <a
          href={problem.leetcodeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-[13px]"
          style={{ color: "var(--color-accent)" }}
        >
          Open on LeetCode <span className="font-mono text-[11px]">↗</span>
        </a>
      </div>

      {/* LeetCode problem statement, fetched lazily via /api/problem/[slug]
          and cached in localStorage per slug. */}
      <ProblemStatement slug={problem.slug} leetcodeUrl={problem.leetcodeUrl} />

      <div className="fade-up mb-8">
        <div
          className="text-[10.5px] uppercase mb-3"
          style={{ color: "var(--color-dim)", letterSpacing: "0.12em" }}
        >
          Status
        </div>
        <button
          onClick={toggleSolved}
          className="px-5 py-2.5 rounded-md text-[13px] font-medium transition-colors inline-flex items-center gap-2"
          style={{
            background: isSolved ? "var(--color-green-soft)" : "var(--color-accent)",
            border: `1px solid ${
              isSolved ? "rgba(123, 196, 164, 0.3)" : "transparent"
            }`,
            color: isSolved ? "var(--color-green)" : "#1A0F08",
          }}
        >
          {isSolved ? (
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <span
              className="inline-block rounded-full"
              style={{
                width: 12,
                height: 12,
                border: "1.5px solid currentColor",
              }}
              aria-hidden
            />
          )}
          {isSolved ? "Solved · click to undo" : "Mark as solved"}
        </button>
      </div>

      <div className="fade-up mb-8">
        <div
          className="text-[10.5px] uppercase mb-3"
          style={{ color: "var(--color-dim)", letterSpacing: "0.12em" }}
        >
          Asked at
        </div>
        <div className="flex flex-wrap gap-1.5">
          {problem.companies.map((c) => (
            <Link
              key={c}
              href={`/problems?company=${encodeURIComponent(c)}`}
              className="px-2.5 py-1 rounded-full text-[11.5px]"
              style={{
                background: "var(--color-surface)",
                border: "1px solid var(--color-border-2)",
                color: "var(--color-text-2)",
              }}
            >
              {c}
            </Link>
          ))}
        </div>
      </div>

      <div className="fade-up">
        <div className="flex items-baseline justify-between mb-3">
          <div
            className="text-[10.5px] uppercase"
            style={{ color: "var(--color-dim)", letterSpacing: "0.12em" }}
          >
            Notes
          </div>
          <button
            onClick={handleSaveNotes}
            disabled={notesDraft === (attempt?.notes ?? "")}
            className="text-[11.5px] px-2 py-0.5"
            style={{
              color:
                notesDraft === (attempt?.notes ?? "")
                  ? "var(--color-dimmer)"
                  : "var(--color-accent)",
            }}
          >
            Save
          </button>
        </div>
        <textarea
          value={notesDraft}
          onChange={(e) => setNotesDraft(e.target.value)}
          placeholder="Solution sketch, edge cases, things that tripped you up…"
          rows={6}
          className="w-full px-4 py-3 rounded-md text-[13px] outline-none resize-y"
          style={{
            background: "var(--color-bg-warm)",
            border: "1px solid var(--color-border-2)",
            color: "var(--color-text)",
            fontFamily: "var(--font-mono)",
            lineHeight: 1.55,
          }}
        />
        {attempt?.solvedAt && (
          <div
            className="mt-2 font-mono text-[11px]"
            style={{ color: "var(--color-dim)" }}
          >
            Solved {new Date(attempt.solvedAt).toLocaleDateString()}
          </div>
        )}
      </div>
    </Shell>
  );
}
