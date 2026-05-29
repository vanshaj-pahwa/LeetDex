"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Difficulty, Problem } from "@/lib/schema";
import { TOPIC_BUCKETS } from "@/lib/topics";
import { COMPANIES } from "@/lib/catalog";
import { TagInput } from "./TagInput";
import { topicsOf } from "@/lib/topics";
import { useStore } from "@/lib/store";

/* `npm run dev` writes to data/problems.json via the API route. Vercel /
 * hosted builds have a read-only filesystem, so we fall back to a per-user
 * override saved in localStorage. process.env.NODE_ENV is inlined at build
 * time by Next so this works in client components. */
const IS_DEV = process.env.NODE_ENV === "development";

type Draft = {
  title: string;
  leetcodeUrl: string;
  difficulty: Difficulty;
  topics: string[];
  companies: string[];
};

export function EditProblemModal({
  problem,
  onClose,
}: {
  problem: Problem;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [draft, setDraft] = useState<Draft>({
    title: problem.title,
    leetcodeUrl: problem.leetcodeUrl,
    difficulty: problem.difficulty,
    topics: topicsOf(problem),
    companies: problem.companies,
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>("");

  const saveOverride = useStore((s) => s.saveProblemOverride);
  const clearOverride = useStore((s) => s.clearProblemOverride);
  const hasOverride = useStore((s) => !!s.problemOverrides[problem.id]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const dirty =
    draft.title !== problem.title ||
    draft.leetcodeUrl !== problem.leetcodeUrl ||
    draft.difficulty !== problem.difficulty ||
    arraysDiffer(draft.topics, topicsOf(problem)) ||
    arraysDiffer(draft.companies, problem.companies);

  async function save() {
    if (!dirty) {
      onClose();
      return;
    }
    setSaving(true);
    setError("");
    const patch = {
      title: draft.title,
      leetcodeUrl: draft.leetcodeUrl,
      difficulty: draft.difficulty,
      topics: draft.topics,
      companies: draft.companies,
    };
    if (IS_DEV) {
      try {
        const res = await fetch(
          `/api/problems/${encodeURIComponent(problem.id)}`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(patch),
          },
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error ?? `Save failed (${res.status})`);
        }
        // Refresh so the imported JSON re-reads with the new values.
        window.location.reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setSaving(false);
      }
      return;
    }
    // Hosted path: store the edit as a per-user override.
    saveOverride(problem.id, patch);
    setSaving(false);
    onClose();
  }

  function resetOverride() {
    clearOverride(problem.id);
    onClose();
  }

  if (!mounted) return null;

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
        {/* Header (fixed) */}
        <div
          className="px-6 py-4 shrink-0"
          style={{ borderBottom: "1px solid var(--color-border)" }}
        >
          <div
            className="font-mono text-[10.5px] mb-1.5"
            style={{
              color: "var(--color-accent)",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
            }}
          >
            Edit problem · #{problem.leetcodeNumber}
          </div>
          <h2
            className="font-display font-medium m-0 truncate"
            style={{ fontSize: 20, letterSpacing: "-0.02em" }}
          >
            {problem.title}
          </h2>
        </div>

        {/* Body (scrolls when content overflows) */}
        <div className="px-6 py-5 flex flex-col gap-5 overflow-y-auto flex-1">
          <Field label="Title">
            <input
              type="text"
              value={draft.title}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              className="w-full px-3 py-2.5 rounded-md text-[14px] outline-none"
              style={fieldStyle}
            />
          </Field>

          <Field label="LeetCode URL">
            <input
              type="url"
              value={draft.leetcodeUrl}
              onChange={(e) =>
                setDraft((d) => ({ ...d, leetcodeUrl: e.target.value }))
              }
              className="w-full px-3 py-2.5 rounded-md text-[13px] outline-none font-mono"
              style={fieldStyle}
              placeholder="https://leetcode.com/problems/..."
            />
          </Field>

          <Field label="Difficulty">
            <div className="flex gap-1.5">
              {(["easy", "medium", "hard"] as Difficulty[]).map((d) => {
                const on = draft.difficulty === d;
                const fg =
                  d === "easy"
                    ? "var(--color-easy)"
                    : d === "medium"
                      ? "var(--color-medium)"
                      : "var(--color-hard)";
                const bg =
                  d === "easy"
                    ? "var(--color-easy-soft)"
                    : d === "medium"
                      ? "var(--color-medium-soft)"
                      : "var(--color-hard-soft)";
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDraft((cur) => ({ ...cur, difficulty: d }))}
                    className="px-3.5 py-1.5 rounded-md text-[12px] font-medium transition-colors capitalize"
                    style={{
                      background: on ? bg : "transparent",
                      color: on ? fg : "var(--color-text-2)",
                      border: `1px solid ${on ? "transparent" : "var(--color-border-2)"}`,
                    }}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label="Topics">
            <TagInput
              value={draft.topics}
              onChange={(v) => setDraft((d) => ({ ...d, topics: v }))}
              suggestions={TOPIC_BUCKETS.map((t) => t.name)}
              placeholder="Add a topic and press enter"
              allowCustom
            />
          </Field>

          <Field label="Companies">
            <TagInput
              value={draft.companies}
              onChange={(v) => setDraft((d) => ({ ...d, companies: v }))}
              suggestions={COMPANIES.map((c) => c.name)}
              placeholder="Add a company and press enter"
              allowCustom
            />
          </Field>

          {error && (
            <div
              className="px-3 py-2.5 rounded-md text-[12.5px]"
              style={{
                background: "var(--color-red-soft)",
                border: "1px solid rgba(224, 138, 120, 0.25)",
                color: "var(--color-red)",
              }}
            >
              {error}
            </div>
          )}
        </div>

        {/* Footer (fixed) */}
        <div
          className="px-6 py-4 flex items-center justify-between shrink-0"
          style={{
            borderTop: "1px solid var(--color-border)",
            background: "var(--color-bg-warm)",
          }}
        >
          <span className="text-[11px]" style={{ color: "var(--color-dimmer)" }}>
            {IS_DEV
              ? "Saves directly to data/problems.json"
              : "Saved to your browser only"}
          </span>
          <div className="flex gap-2">
            {!IS_DEV && hasOverride && (
              <button
                type="button"
                onClick={resetOverride}
                disabled={saving}
                className="px-3 py-2 rounded-md text-[12.5px] font-medium"
                style={{
                  background: "transparent",
                  border: "1px solid var(--color-border-2)",
                  color: "var(--color-dim)",
                }}
                title="Discard your override and restore the original problem"
              >
                Reset
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded-md text-[12.5px] font-medium"
              style={{
                background: "transparent",
                border: "1px solid var(--color-border-2)",
                color: "var(--color-text-2)",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving || !dirty}
              className="px-4 py-2 rounded-md text-[12.5px] font-medium transition-colors"
              style={{
                background: saving || !dirty ? "var(--color-surface-2)" : "var(--color-accent)",
                color: saving || !dirty ? "var(--color-dim)" : "#1A0F08",
              }}
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

const fieldStyle: React.CSSProperties = {
  background: "var(--color-bg)",
  border: "1px solid var(--color-border-2)",
  color: "var(--color-text)",
};

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div
        className="text-[10.5px] font-mono uppercase mb-2"
        style={{ color: "var(--color-dim)", letterSpacing: "0.14em" }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function arraysDiffer(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return true;
  const as = [...a].sort();
  const bs = [...b].sort();
  for (let i = 0; i < as.length; i++) if (as[i] !== bs[i]) return true;
  return false;
}
