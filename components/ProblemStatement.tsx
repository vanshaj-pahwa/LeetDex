"use client";

import { useEffect, useState } from "react";

type Loaded = {
  content: string | null;
  isPaidOnly: boolean;
};
type Status = { kind: "loading" } | { kind: "ok"; data: Loaded } | { kind: "error"; message: string };

const LS_PREFIX = "leetdex-problem-content:";

export function ProblemStatement({
  slug,
  leetcodeUrl,
}: {
  slug: string;
  leetcodeUrl: string;
}) {
  const [status, setStatus] = useState<Status>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setStatus({ kind: "loading" });

    // Try localStorage cache first — instant revisits, works offline once
    // the user has viewed the problem at least once.
    try {
      const raw = localStorage.getItem(LS_PREFIX + slug);
      if (raw) {
        const cached = JSON.parse(raw) as Loaded;
        setStatus({ kind: "ok", data: cached });
        return;
      }
    } catch {
      /* ignore corrupted cache entries */
    }

    fetch(`/api/problem/${encodeURIComponent(slug)}`)
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
          throw new Error(body?.error ?? `HTTP ${r.status}`);
        }
        return r.json();
      })
      .then((data: Loaded) => {
        if (cancelled) return;
        try {
          localStorage.setItem(LS_PREFIX + slug, JSON.stringify(data));
        } catch {
          /* localStorage may be full or unavailable */
        }
        setStatus({ kind: "ok", data });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setStatus({
          kind: "error",
          message: e instanceof Error ? e.message : String(e),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  return (
    <div className="fade-up mb-8">
      <div
        className="text-[10.5px] uppercase mb-3"
        style={{ color: "var(--color-dim)", letterSpacing: "0.12em" }}
      >
        Problem statement
      </div>

      <div
        className="rounded-xl px-5 py-5"
        style={{
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
        }}
      >
        {status.kind === "loading" && <StatementSkeleton />}
        {status.kind === "error" && (
          <ErrorFallback url={leetcodeUrl} message={status.message} />
        )}
        {status.kind === "ok" &&
          (status.data.isPaidOnly || !status.data.content ? (
            <PremiumFallback url={leetcodeUrl} />
          ) : (
            <div
              className="prose-statement"
              dangerouslySetInnerHTML={{ __html: status.data.content }}
            />
          ))}
      </div>
    </div>
  );
}

function StatementSkeleton() {
  const widths = ["92%", "88%", "95%", "70%", "85%", "60%"];
  return (
    <div className="flex flex-col gap-3 py-1">
      {widths.map((w, i) => (
        <div
          key={i}
          className="skeleton-line"
          style={{ width: w, animationDelay: `${i * 80}ms` }}
        />
      ))}
    </div>
  );
}

function PremiumFallback({ url }: { url: string }) {
  return (
    <div className="flex items-start gap-3">
      <div
        className="font-mono text-[10px] uppercase px-1.5 py-0.5 rounded shrink-0"
        style={{
          color: "var(--color-amber)",
          background: "var(--color-amber-soft)",
          letterSpacing: "0.1em",
        }}
      >
        Premium
      </div>
      <div className="text-[13px]" style={{ color: "var(--color-text-2)" }}>
        This problem is locked behind LeetCode Premium, so its statement
        can&apos;t be loaded here.{" "}
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: "var(--color-accent)",
            borderBottom: "1px solid rgba(224, 164, 88, 0.35)",
          }}
        >
          Open on LeetCode ↗
        </a>
      </div>
    </div>
  );
}

function ErrorFallback({ url, message }: { url: string; message: string }) {
  return (
    <div
      className="text-[13px]"
      style={{ color: "var(--color-text-2)", lineHeight: 1.55 }}
    >
      <div
        className="font-mono text-[10.5px] mb-1.5"
        style={{
          color: "var(--color-red)",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
        }}
      >
        Couldn&apos;t load statement
      </div>
      <div className="mb-2" style={{ wordBreak: "break-word" }}>
        {message}
      </div>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          color: "var(--color-accent)",
          borderBottom: "1px solid rgba(224, 164, 88, 0.35)",
        }}
      >
        Open on LeetCode ↗
      </a>
    </div>
  );
}
