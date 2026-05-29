"use client";

import type { Difficulty, Status } from "@/lib/schema";

const DIFF_COLOR: Record<Difficulty, { bg: string; fg: string }> = {
  easy: { bg: "var(--color-easy-soft)", fg: "var(--color-easy)" },
  medium: { bg: "var(--color-medium-soft)", fg: "var(--color-medium)" },
  hard: { bg: "var(--color-hard-soft)", fg: "var(--color-hard)" },
};

export function DifficultyBadge({ value }: { value: Difficulty }) {
  const c = DIFF_COLOR[value];
  return (
    <span
      style={{
        background: c.bg,
        color: c.fg,
        fontSize: 10.5,
        padding: "3px 9px",
        borderRadius: 999,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        fontWeight: 500,
      }}
    >
      {value}
    </span>
  );
}

export function StatusGlyph({ status }: { status: Status | undefined }) {
  const isSolved = status === "solved";
  if (isSolved) {
    return (
      <span
        className="inline-flex items-center justify-center rounded-full"
        style={{
          color: "var(--color-green)",
          width: 16,
          height: 16,
          background: "var(--color-green-soft)",
          border: "1px solid rgba(123, 196, 164, 0.3)",
        }}
        title="solved"
      >
        <svg
          width="10"
          height="10"
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
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center justify-center rounded-full"
      style={{
        width: 16,
        height: 16,
        border: "1px solid var(--color-border-2)",
        background: "transparent",
      }}
      title="unsolved"
    />
  );
}

export function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-3 py-1.5 rounded-full text-[12px] transition-colors"
      style={{
        background: on ? "var(--color-accent-soft)" : "transparent",
        border: `1px solid ${on ? "rgba(224, 164, 88, 0.3)" : "var(--color-border-2)"}`,
        color: on ? "var(--color-accent)" : "var(--color-text-2)",
      }}
    >
      {children}
    </button>
  );
}

export function Stat({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div
      className="px-5 py-4 rounded-xl"
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
      }}
    >
      <div
        className="text-[11px] mb-2 uppercase"
        style={{ color: "var(--color-dim)", letterSpacing: "0.06em" }}
      >
        {label}
      </div>
      <div
        className="font-mono font-medium tnum"
        style={{
          color: accent ? "var(--color-accent)" : "var(--color-text)",
          letterSpacing: "-0.02em",
          fontSize: 26,
        }}
      >
        {value}
      </div>
      {sub && (
        <div className="text-[11.5px] mt-1" style={{ color: "var(--color-dim)" }}>
          {sub}
        </div>
      )}
    </div>
  );
}
