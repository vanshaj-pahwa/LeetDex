"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import type { Problem } from "@/lib/schema";
import { hintStream, PROVIDER_META, type HintMode } from "@/lib/llm/router";
import { renderMarkdown } from "@/lib/markdown";

type ModeMeta = {
  value: HintMode;
  label: string;
  /** Short, user-facing description of what this mode produces. */
  help: string;
};

const MODES: ModeMeta[] = [
  {
    value: "nudge",
    label: "Nudge",
    help: "A tiny push toward the right pattern. No spoilers.",
  },
  {
    value: "approach",
    label: "Approach",
    help: "Step-by-step walkthrough of the canonical solution.",
  },
  {
    value: "complexity",
    label: "Complexity",
    help: "Time and space complexity, including naive vs optimal.",
  },
  {
    value: "code",
    label: "Code",
    help: "Clean Python solution with the pattern named.",
  },
];

/* Read the cached statement (populated by <ProblemStatement>) and convert it
 * to plain text so we can feed it into the LLM prompt. Keeps AI hints
 * grounded in the actual problem rather than the model's training memory. */
function getCachedStatementText(slug: string): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = localStorage.getItem(`leetdex-problem-content:${slug}`);
    if (!raw) return undefined;
    const obj = JSON.parse(raw) as { content?: string | null };
    if (!obj?.content) return undefined;
    return htmlToText(obj.content);
  } catch {
    return undefined;
  }
}

function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "  - ")
    .replace(/<sup[^>]*>/gi, "^")
    .replace(/<\/sup>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const CODE_LANGUAGES = [
  "Python",
  "JavaScript",
  "TypeScript",
  "Java",
  "C++",
  "Go",
  "Rust",
  "C#",
  "Ruby",
  "Kotlin",
  "Swift",
];

export function HintPanel({ problem }: { problem: Problem }) {
  const activeProvider = useStore((s) => s.activeProvider);
  const activeKey = useStore((s) => s.activeKey());
  const codeLanguage = useStore((s) => s.codeLanguage);
  const setCodeLanguage = useStore((s) => s.setCodeLanguage);
  const effectiveLang = codeLanguage || "Python";

  const [mode, setMode] = useState<HintMode>("nudge");
  const [userCtx, setUserCtx] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string>("");
  const [error, setError] = useState<string>("");

  const hasKey = !!activeKey;
  const activeMode = MODES.find((m) => m.value === mode) ?? MODES[0];

  // Track the AbortController for the in-flight stream so a tab-switch can
  // cancel the previous request mid-flight.
  const abortRef = useRef<AbortController | null>(null);

  async function go(
    forMode: HintMode = mode,
    ctx: string = userCtx,
    forLang?: string,
  ) {
    if (!hasKey) return;
    // Cancel any in-flight stream from a previous tab.
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    setError("");
    setResult("");
    const lang = forLang ?? effectiveLang;
    const statementText = getCachedStatementText(problem.slug);
    try {
      await hintStream(
        {
          provider: activeProvider,
          apiKey: activeKey!,
          problem,
          mode: forMode,
          userContext: ctx.trim() || undefined,
          codeLanguage: forMode === "code" ? lang : undefined,
          problemStatement: statementText,
        },
        (chunk) => {
          if (!ctrl.signal.aborted) {
            setResult((prev) => prev + chunk);
          }
        },
        ctrl.signal,
      );
    } catch (e: unknown) {
      // Ignore deliberate aborts; surface everything else.
      if (e instanceof DOMException && e.name === "AbortError") return;
      const err = e as { name?: string; message?: string };
      if (err?.name === "AbortError") return;
      setError(err?.message ?? String(e));
    } finally {
      if (abortRef.current === ctrl) {
        setLoading(false);
        abortRef.current = null;
      }
    }
  }

  // Abort any in-flight stream when the panel unmounts or the problem changes.
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, [problem.id]);

  function pickMode(next: HintMode) {
    if (next === mode && (loading || result)) return;
    setMode(next);
    go(next, userCtx);
  }

  /* Event-delegated copy handler: any "Copy" button rendered inside the
   * result HTML (via markdown.ts code-block-bar) walks up to its code-block
   * and copies the raw source from the <code data-raw> attribute. */
  function handleResultClick(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    const btn = target.closest<HTMLButtonElement>(
      "button.code-block-copy[data-copy]",
    );
    if (!btn) return;
    const block = btn.closest(".code-block");
    const code = block?.querySelector<HTMLElement>("code[data-raw]");
    const raw = code?.dataset.raw;
    if (!raw) return;
    navigator.clipboard
      .writeText(raw)
      .then(() => {
        const original = btn.textContent;
        btn.textContent = "Copied";
        btn.classList.add("copied");
        setTimeout(() => {
          btn.textContent = original ?? "Copy";
          btn.classList.remove("copied");
        }, 1400);
      })
      .catch(() => {
        // Clipboard may be blocked (e.g. insecure context); fall back silently.
      });
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-baseline justify-between mb-4">
        <h2
          className="font-display font-medium m-0 text-[16px]"
          style={{ letterSpacing: "-0.015em" }}
        >
          Ask AI
        </h2>
        <span
          className="font-mono text-[10.5px]"
          style={{
            color: hasKey ? "var(--color-green)" : "var(--color-dim)",
          }}
        >
          {hasKey ? `● ${PROVIDER_META[activeProvider].label}` : "○ no key"}
        </span>
      </div>

      {!hasKey ? (
        <div
          className="px-4 py-4 rounded-md text-[13px]"
          style={{
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            color: "var(--color-text-2)",
            lineHeight: 1.55,
          }}
        >
          <div className="font-display font-medium mb-1.5" style={{ color: "var(--color-text)" }}>
            No AI provider connected.
          </div>
          Connect Gemini, OpenAI, or Anthropic in{" "}
          <Link href="/onboarding" style={{ color: "var(--color-accent)" }}>
            settings
          </Link>{" "}
          to get hints, approaches, complexity walks, or code. Your key stays
          in your browser.
        </div>
      ) : (
        <>
          {/* Segmented mode picker. Clicking auto-fires the new mode. */}
          <div
            className="grid grid-cols-4 gap-1 p-1 rounded-md mb-2"
            style={{
              background: "var(--color-bg-warm)",
              border: "1px solid var(--color-border)",
            }}
          >
            {MODES.map((m) => {
              const on = mode === m.value;
              return (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => pickMode(m.value)}
                  className="px-2 py-1.5 rounded text-[11.5px] font-medium transition-colors"
                  style={{
                    background: on ? "var(--color-accent-soft)" : "transparent",
                    color: on ? "var(--color-accent)" : "var(--color-text-2)",
                    border: `1px solid ${on ? "rgba(224, 164, 88, 0.3)" : "transparent"}`,
                  }}
                >
                  {m.label}
                </button>
              );
            })}
          </div>

          <p
            className="text-[11.5px] mb-3 px-1"
            style={{ color: "var(--color-dim)", lineHeight: 1.4 }}
          >
            {mode === "code"
              ? `Clean ${effectiveLang} solution with the pattern named.`
              : activeMode.help}
          </p>

          {/* Language picker (Code mode only). The selection persists across
              sessions until the user changes it. */}
          {mode === "code" && (
            <div className="flex items-center gap-2 mb-3 px-1">
              <span
                className="font-mono text-[10px] uppercase shrink-0"
                style={{ color: "var(--color-dim)", letterSpacing: "0.12em" }}
              >
                Language
              </span>
              <select
                value={effectiveLang}
                onChange={(e) => {
                  const newLang = e.target.value;
                  setCodeLanguage(newLang);
                  // Pass the new language explicitly so the request doesn't
                  // race the async store update.
                  go("code", userCtx, newLang);
                }}
                className="px-2.5 py-1 rounded-md text-[12px] font-medium outline-none cursor-pointer"
                style={{
                  background: "var(--color-bg-warm)",
                  border: "1px solid var(--color-border-2)",
                  color: "var(--color-text)",
                }}
              >
                {CODE_LANGUAGES.map((l) => (
                  <option key={l} value={l} style={{ background: "var(--color-bg-warm)" }}>
                    {l}
                  </option>
                ))}
              </select>
              {codeLanguage && codeLanguage !== "Python" && (
                <button
                  type="button"
                  onClick={() => setCodeLanguage(undefined)}
                  title="Reset to default (Python)"
                  className="font-mono text-[10.5px] px-1.5 py-0.5"
                  style={{ color: "var(--color-dim)" }}
                >
                  reset
                </button>
              )}
            </div>
          )}

          {/* Optional context input + Ask button */}
          <div className="flex gap-1.5 items-stretch mb-3">
            <input
              type="text"
              value={userCtx}
              onChange={(e) => setUserCtx(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !loading) go();
              }}
              placeholder="What are you stuck on? (optional)"
              className="flex-1 min-w-0 px-3 py-2 rounded-md text-[12.5px] outline-none transition-colors"
              style={{
                background: "var(--color-bg-warm)",
                border: "1px solid var(--color-border-2)",
                color: "var(--color-text)",
                lineHeight: 1.4,
              }}
            />
            <button
              type="button"
              onClick={() => go()}
              disabled={loading}
              className="px-3.5 py-2 rounded-md text-[12.5px] font-medium transition-colors inline-flex items-center gap-1.5 shrink-0"
              style={{
                background: loading ? "var(--color-surface-2)" : "var(--color-accent)",
                color: loading ? "var(--color-dim)" : "#1A0F08",
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "…" : (
                <>
                  Ask
                  <span style={{ fontFamily: "var(--font-mono)" }}>→</span>
                </>
              )}
            </button>
          </div>

          {error && (
            <div
              className="px-3 py-2.5 rounded-md text-[12px] mb-3"
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
          )}

          {/* Result box. Always visible once user has triggered a request,
              shows skeleton while waiting for first token, streams content
              in with a blinking cursor while still receiving. */}
          {(loading || result) && (
            <div
              className="px-4 py-3.5 rounded-md fade-up"
              style={{
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                minHeight: 96,
              }}
              onClick={handleResultClick}
            >
              {result ? (
                <div className="prose-hint">
                  <span
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(result) }}
                  />
                  {loading && <span className="stream-cursor" aria-hidden />}
                </div>
              ) : (
                <SkeletonLines />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SkeletonLines() {
  // Four lines at varying widths, giving a paragraph-ish silhouette.
  const widths = ["88%", "94%", "76%", "60%"];
  return (
    <div className="flex flex-col gap-2.5 py-1">
      {widths.map((w, i) => (
        <div
          key={i}
          className="skeleton-line"
          style={{ width: w, animationDelay: `${i * 90}ms` }}
        />
      ))}
    </div>
  );
}
