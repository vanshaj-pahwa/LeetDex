"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useStore } from "@/lib/store";
import { Shell, Topbar } from "@/components/Shell";
import { COMPANIES, PROBLEMS, applyOverride } from "@/lib/catalog";
import { DifficultyBadge, StatusGlyph } from "@/components/Primitives";
import { TagInput } from "@/components/TagInput";
import { EditProblemModal } from "@/components/EditProblemModal";
import { TOPIC_BUCKETS, topicsOf } from "@/lib/topics";
import {
  RECENCY_ORDER,
  RECENCY_LABEL,
  RECENCY_SHORT,
  type Difficulty,
  type Problem,
  type Recency,
  type Status,
} from "@/lib/schema";

const PAGE_SIZE = 50;

type SortKey = "number" | "title" | "difficulty" | "status";
type SortDir = "asc" | "desc";

const DIFF_RANK: Record<Difficulty, number> = { easy: 1, medium: 2, hard: 3 };

export default function ProblemsClient() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const searchParams = useSearchParams();
  const filters = useStore((s) => s.filters);
  const setFilters = useStore((s) => s.setFilters);
  const resetFilters = useStore((s) => s.resetFilters);
  const attempts = useStore((s) => s.attempts);

  useEffect(() => {
    const sp = searchParams.get("status");
    if (sp === "solved" || sp === "unsolved") {
      setFilters({ status: sp });
    }
    const c = searchParams.get("company");
    if (c) setFilters({ companies: [c] });
    const t = searchParams.get("topic");
    if (t) setFilters({ topics: [t] });
    const d = searchParams.get("difficulty");
    if (d === "easy" || d === "medium" || d === "hard") {
      setFilters({ difficulties: [d] });
    }
    const s = searchParams.get("search");
    if (s) setFilters({ search: s });
    const r = searchParams.get("recency");
    if (r && RECENCY_ORDER.includes(r as Recency)) {
      setFilters({ recency: [r] });
    }
  }, [searchParams, setFilters]);

  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [filters]);

  const [sortKey, setSortKey] = useState<SortKey>(
    (filters.sort as SortKey) ?? "number",
  );
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  useEffect(() => {
    setFilters({ sort: sortKey });
  }, [sortKey, setFilters]);

  const companyNames = useMemo(() => COMPANIES.map((c) => c.name), []);
  const topicNames = useMemo(() => TOPIC_BUCKETS.map((b) => b.name), []);

  const [showAdvanced, setShowAdvanced] = useState(
    filters.companies.length > 0 || filters.topics.length > 0,
  );

  // Apply per-user overrides once so every read below (filter, search,
  // display) sees the same merged view of each problem.
  const overrides = useStore((s) => s.problemOverrides);
  const catalog = useMemo(
    () => PROBLEMS.map((p) => applyOverride(p, overrides[p.id])),
    [overrides],
  );

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    const rows = catalog.filter((p) => {
      if (
        filters.difficulties.length > 0 &&
        !filters.difficulties.includes(p.difficulty)
      )
        return false;
      if (
        filters.companies.length > 0 &&
        !filters.companies.some((c) => p.companies.includes(c))
      )
        return false;
      if (filters.topics.length > 0) {
        const pt = topicsOf(p);
        if (!filters.topics.some((t) => pt.includes(t))) return false;
      }
      if (filters.recency.length > 0) {
        const cr = p.companyRecency ?? {};
        // When companies are also filtered, only the intersection counts:
        // problem must have a (selected-company, selected-recency) pair.
        // Otherwise: any tagged company matching the recency bucket is fine.
        const pool =
          filters.companies.length > 0
            ? filters.companies.filter((c) => p.companies.includes(c))
            : p.companies;
        const hit = pool.some((co) => {
          const r = cr[co];
          return !!r && filters.recency.includes(r);
        });
        if (!hit) return false;
      }
      if (filters.status !== "all") {
        const a = attempts[p.id];
        if (filters.status === "solved") {
          if (a?.status !== "solved") return false;
        } else if (filters.status === "unsolved") {
          if (a?.status === "solved") return false;
        }
      }
      if (q) {
        const hay = `${p.leetcodeNumber} ${p.title} ${p.companies.join(" ")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const dir = sortDir === "asc" ? 1 : -1;
    const isSolved = (id: string) => attempts[id]?.status === "solved" ? 1 : 0;
    rows.sort((a, b) => {
      switch (sortKey) {
        case "title":
          return a.title.localeCompare(b.title) * dir;
        case "difficulty":
          return (DIFF_RANK[a.difficulty] - DIFF_RANK[b.difficulty]) * dir;
        case "status":
          // Tie-break by leetcode number so the within-group order is stable.
          return (
            (isSolved(a.id) - isSolved(b.id)) * dir ||
            a.leetcodeNumber - b.leetcodeNumber
          );
        case "number":
        default:
          return (a.leetcodeNumber - b.leetcodeNumber) * dir;
      }
    });

    return rows;
  }, [filters, attempts, sortKey, sortDir, catalog]);

  const shown = filtered.slice(0, page * PAGE_SIZE);
  const hasMore = shown.length < filtered.length;

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // Default direction: solved-first for status; otherwise small-first.
      setSortDir(key === "status" ? "desc" : "asc");
    }
    // If the user picks a column whose values are constrained by an active
    // filter, clearing that filter lets the sort actually show a spread.
    if (key === "difficulty" && filters.difficulties.length > 0) {
      setFilters({ difficulties: [] });
    }
    if (key === "status" && filters.status !== "all") {
      setFilters({ status: "all" });
    }
  }

  const activeFilterCount =
    filters.difficulties.length +
    filters.companies.length +
    filters.topics.length +
    filters.recency.length +
    (filters.status !== "all" ? 1 : 0) +
    (filters.search ? 1 : 0);

  if (!mounted) return null;

  return (
    <Shell>
      <Topbar
        value={filters.search}
        onChange={(v) => setFilters({ search: v })}
      />

      <div className="fade-up mb-6 flex items-end justify-between">
        <div>
          <h1
            className="font-display font-medium m-0"
            style={{ fontSize: 32, lineHeight: 1.1, letterSpacing: "-0.025em" }}
          >
            Problems
          </h1>
          <p
            className="m-0 mt-1 text-[13px] font-mono tnum"
            style={{ color: "var(--color-dim)", letterSpacing: "0.02em" }}
          >
            {filtered.length.toLocaleString()} of {PROBLEMS.length.toLocaleString()}
          </p>
        </div>
        {activeFilterCount > 0 && (
          <button
            onClick={resetFilters}
            className="text-[12px] font-mono px-2.5 py-1 rounded-md transition-colors"
            style={{
              color: "var(--color-accent)",
              background: "var(--color-accent-soft)",
              border: "1px solid rgba(224, 164, 88, 0.25)",
            }}
          >
            clear {activeFilterCount} filter{activeFilterCount === 1 ? "" : "s"}
          </button>
        )}
      </div>

      {/* Filter bar: one tight row */}
      <div
        className="fade-up rounded-xl mb-4"
        style={{
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
        }}
      >
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
          <FilterGroup label="Difficulty">
            <SegChip
              on={filters.difficulties.length === 0}
              onClick={() => setFilters({ difficulties: [] })}
            >
              All
            </SegChip>
            <SegChip
              on={filters.difficulties.includes("easy")}
              tone="easy"
              onClick={() => toggleArr(filters.difficulties, "easy", (v) => setFilters({ difficulties: v }))}
            >
              Easy
            </SegChip>
            <SegChip
              on={filters.difficulties.includes("medium")}
              tone="medium"
              onClick={() => toggleArr(filters.difficulties, "medium", (v) => setFilters({ difficulties: v }))}
            >
              Medium
            </SegChip>
            <SegChip
              on={filters.difficulties.includes("hard")}
              tone="hard"
              onClick={() => toggleArr(filters.difficulties, "hard", (v) => setFilters({ difficulties: v }))}
            >
              Hard
            </SegChip>
          </FilterGroup>

          <Divider />

          <FilterGroup label="Status">
            {(["all", "unsolved", "solved"] as const).map((s) => (
              <SegChip
                key={s}
                on={filters.status === s}
                onClick={() => setFilters({ status: s as Status | "all" })}
              >
                {s === "all" ? "All" : capitalize(s)}
              </SegChip>
            ))}
          </FilterGroup>

          <Divider />

          <FilterGroup label="Asked">
            <SegChip
              on={filters.recency.length === 0}
              onClick={() => setFilters({ recency: [] })}
            >
              Any
            </SegChip>
            {RECENCY_ORDER.map((r) => (
              <SegChip
                key={r}
                on={filters.recency.includes(r)}
                onClick={() =>
                  toggleArr(filters.recency, r, (v) => setFilters({ recency: v }))
                }
                title={RECENCY_LABEL[r]}
              >
                {RECENCY_SHORT[r]}
              </SegChip>
            ))}
          </FilterGroup>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setShowAdvanced((v) => !v)}
              className="text-[12px] font-mono px-2.5 py-1 rounded-md transition-colors flex items-center gap-1.5"
              style={{
                color: showAdvanced ? "var(--color-accent)" : "var(--color-text-2)",
                background: showAdvanced ? "var(--color-accent-soft)" : "var(--color-surface-2)",
                border: `1px solid ${showAdvanced ? "rgba(224, 164, 88, 0.25)" : "var(--color-border-2)"}`,
              }}
            >
              <FilterIcon />
              {filters.companies.length + filters.topics.length > 0
                ? `${filters.companies.length + filters.topics.length} filters`
                : "more filters"}
            </button>
          </div>
        </div>

        {showAdvanced && (
          <div
            className="grid grid-cols-2 gap-3 px-4 py-3.5"
            style={{ borderTop: "1px solid var(--color-border)" }}
          >
            <div>
              <div
                className="text-[10px] font-mono uppercase mb-1.5"
                style={{ color: "var(--color-dim)", letterSpacing: "0.14em" }}
              >
                Topics
              </div>
              <TagInput
                value={filters.topics}
                onChange={(v) => setFilters({ topics: v })}
                suggestions={topicNames}
                placeholder="Add a topic"
              />
            </div>
            <div>
              <div
                className="text-[10px] font-mono uppercase mb-1.5"
                style={{ color: "var(--color-dim)", letterSpacing: "0.14em" }}
              >
                Companies
              </div>
              <TagInput
                value={filters.companies}
                onChange={(v) => setFilters({ companies: v })}
                suggestions={companyNames}
                placeholder="Add a company"
              />
            </div>
          </div>
        )}
      </div>

      {/* Table */}
      <div
        className="fade-up rounded-xl overflow-hidden"
        style={{
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
        }}
      >
        {/* Column header (desktop only; mobile rows are self-labeling). */}
        <div
          className="hidden md:flex items-center gap-3 px-4 py-2.5 text-[10.5px] font-mono uppercase"
          style={{
            color: "var(--color-dim)",
            letterSpacing: "0.12em",
            borderBottom: "1px solid var(--color-border)",
            background: "var(--color-bg-warm)",
          }}
        >
          <span style={{ width: 24, textAlign: "center" }}>
            <ColHeader
              active={sortKey === "status"}
              dir={sortDir}
              onClick={() => toggleSort("status")}
              align="center"
              title="Sort by solved"
            >
              ✓
            </ColHeader>
          </span>
          <span style={{ width: 48 }}>
            <ColHeader active={sortKey === "number"} dir={sortDir} onClick={() => toggleSort("number")} align="right">
              #
            </ColHeader>
          </span>
          <span className="flex-1 min-w-0">
            <ColHeader active={sortKey === "title"} dir={sortDir} onClick={() => toggleSort("title")}>
              Title
            </ColHeader>
          </span>
          <span style={{ width: 240, paddingLeft: 4 }}>Topics</span>
          <span style={{ width: 90 }}>
            <ColHeader active={sortKey === "difficulty"} dir={sortDir} onClick={() => toggleSort("difficulty")} align="center">
              Difficulty
            </ColHeader>
          </span>
          <span style={{ width: 64 }} />
        </div>

        {shown.length === 0 ? (
          <div className="px-7 py-14 text-center">
            <div
              className="font-display font-medium text-lg mb-1"
              style={{ color: "var(--color-text-2)" }}
            >
              No matches.
            </div>
            <p className="text-sm" style={{ color: "var(--color-dim)" }}>
              Try a different search or clear your filters.
            </p>
          </div>
        ) : (
          shown.map((p) => (
            <ProblemRow
              key={p.id}
              problem={p}
              status={attempts[p.id]?.status}
              recencyFilter={filters.recency as Recency[]}
              companyFilter={filters.companies}
            />
          ))
        )}
      </div>

      {hasMore && (
        <div className="text-center mt-5 fade-up">
          <button
            onClick={() => setPage((p) => p + 1)}
            className="px-5 py-2 rounded-md text-[12.5px] font-mono"
            style={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border-2)",
              color: "var(--color-text-2)",
              letterSpacing: "0.02em",
            }}
          >
            load {Math.min(PAGE_SIZE, filtered.length - shown.length).toLocaleString()} more
          </button>
        </div>
      )}
    </Shell>
  );
}

function ProblemRow({
  problem,
  status,
  recencyFilter,
  companyFilter,
}: {
  problem: Problem;
  status?: Status;
  recencyFilter: Recency[];
  companyFilter: string[];
}) {
  const topics = topicsOf(problem);
  const [editing, setEditing] = useState(false);
  const setProblemStatus = useStore((s) => s.setStatus);
  const clearAttempt = useStore((s) => s.clearAttempt);
  const isSolved = status === "solved";

  /* When a recency filter is active, the company chip line narrows to only
   * the companies that asked this problem in the selected window. Otherwise
   * the full company list is shown. Company filter intersects further. */
  const displayCompanies = useMemo(() => {
    let pool = problem.companies;
    if (companyFilter.length > 0) {
      pool = pool.filter((c) => companyFilter.includes(c));
    }
    if (recencyFilter.length > 0) {
      const cr = problem.companyRecency ?? {};
      pool = pool.filter((c) => {
        const r = cr[c];
        return !!r && recencyFilter.includes(r);
      });
    }
    return pool;
  }, [problem.companies, problem.companyRecency, recencyFilter, companyFilter]);

  const toggleStatus = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isSolved) clearAttempt(problem.id);
    else setProblemStatus(problem.id, "solved");
  };

  // Subtle green tint when solved. Hover lifts slightly stronger.
  const baseBg = isSolved ? "rgba(123, 196, 164, 0.05)" : "transparent";
  const hoverBg = isSolved ? "rgba(123, 196, 164, 0.09)" : "var(--color-surface-2)";

  return (
    <div
      className="relative flex items-center gap-2 md:gap-3 px-3 md:px-4 py-2.5 transition-colors group"
      style={{
        borderTop: "1px solid var(--color-border)",
        background: baseBg,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = hoverBg)}
      onMouseLeave={(e) => (e.currentTarget.style.background = baseBg)}
    >
      <Link
        href={`/problems/${problem.id}`}
        className="absolute inset-0"
        aria-label={problem.title}
      />

      {/* Status toggle */}
      <button
        type="button"
        onClick={toggleStatus}
        title={isSolved ? "Mark unsolved" : "Mark solved"}
        aria-label={isSolved ? "Mark unsolved" : "Mark solved"}
        className="relative z-10 flex items-center justify-center rounded-full shrink-0"
        style={{ width: 24, height: 24 }}
      >
        <StatusGlyph status={status} />
      </button>

      {/* Number (fixed width on desktop, smaller on mobile) */}
      <div
        className="font-mono text-[11.5px] md:text-[12px] tnum text-right pointer-events-none shrink-0"
        style={{ color: "var(--color-dim)", width: 40, paddingRight: 4 }}
      >
        {problem.leetcodeNumber}
      </div>

      {/* Title + companies (flex-grow, truncates) */}
      <div className="flex-1 min-w-0 pointer-events-none">
        <div
          className="font-display font-medium text-[13.5px] md:text-[14px] truncate"
          style={{ letterSpacing: "-0.01em" }}
        >
          {problem.title}
        </div>
        <div
          className="text-[10.5px] md:text-[11px] truncate mt-0.5"
          style={{ color: "var(--color-dim)" }}
        >
          {displayCompanies.slice(0, 3).join(" · ")}
          {displayCompanies.length > 3 && (
            <span
              className="font-mono ml-1"
              style={{ color: "var(--color-dimmer)" }}
            >
              +{displayCompanies.length - 3}
            </span>
          )}
        </div>
      </div>

      {/* Topics (desktop only) */}
      <div
        className="hidden md:flex text-[11.5px] items-center gap-1.5 pointer-events-none shrink-0"
        style={{ color: "var(--color-dim)", width: 240 }}
      >
        {topics.length === 0 ? (
          <span style={{ color: "var(--color-dimmer)" }}>·</span>
        ) : (
          topics.slice(0, 2).map((t) => (
            <span
              key={t}
              className="px-1.5 py-0.5 rounded-md text-[10.5px] truncate"
              style={{
                background: "var(--color-surface-2)",
                color: "var(--color-text-2)",
                border: "1px solid var(--color-border)",
              }}
            >
              {t}
            </span>
          ))
        )}
        {topics.length > 2 && (
          <span className="font-mono text-[10px]" style={{ color: "var(--color-dimmer)" }}>
            +{topics.length - 2}
          </span>
        )}
      </div>

      {/* Difficulty */}
      <div className="flex justify-center pointer-events-none shrink-0" style={{ width: 70 }}>
        <DifficultyBadge value={problem.difficulty} />
      </div>

      {/* Actions (edit + external link) */}
      <div className="relative z-10 flex items-center justify-end gap-1 shrink-0" style={{ width: 60 }}>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setEditing(true);
          }}
          title="Edit problem"
          aria-label="Edit problem"
          className="w-7 h-7 rounded-md flex items-center justify-center transition-colors"
          style={{ color: "var(--color-dim)", background: "transparent" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "var(--color-accent)";
            e.currentTarget.style.background = "var(--color-accent-soft)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--color-dim)";
            e.currentTarget.style.background = "transparent";
          }}
        >
          <EditIcon />
        </button>
        <a
          href={problem.leetcodeUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          title="Open on LeetCode"
          aria-label="Open on LeetCode"
          className="w-7 h-7 rounded-md flex items-center justify-center transition-colors"
          style={{ color: "var(--color-dim)", background: "transparent" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "var(--color-accent)";
            e.currentTarget.style.background = "var(--color-accent-soft)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--color-dim)";
            e.currentTarget.style.background = "transparent";
          }}
        >
          <ExternalLinkIcon />
        </a>
      </div>

      {editing && (
        <EditProblemModal problem={problem} onClose={() => setEditing(false)} />
      )}
    </div>
  );
}

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="text-[10px] font-mono uppercase shrink-0"
        style={{ color: "var(--color-dim)", letterSpacing: "0.14em" }}
      >
        {label}
      </span>
      <div className="flex items-center gap-1">{children}</div>
    </div>
  );
}

function SegChip({
  on,
  onClick,
  tone,
  title,
  children,
}: {
  on: boolean;
  onClick: () => void;
  tone?: "easy" | "medium" | "hard";
  title?: string;
  children: React.ReactNode;
}) {
  const toneFg =
    tone === "easy"
      ? "var(--color-easy)"
      : tone === "medium"
        ? "var(--color-medium)"
        : tone === "hard"
          ? "var(--color-hard)"
          : "var(--color-accent)";
  const toneBg =
    tone === "easy"
      ? "var(--color-easy-soft)"
      : tone === "medium"
        ? "var(--color-medium-soft)"
        : tone === "hard"
          ? "var(--color-hard-soft)"
          : "var(--color-accent-soft)";

  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="px-2.5 py-1 rounded-md text-[12px] transition-colors font-medium"
      style={{
        background: on ? toneBg : "transparent",
        color: on ? toneFg : "var(--color-text-2)",
        border: `1px solid ${on ? "transparent" : "var(--color-border-2)"}`,
      }}
    >
      {children}
    </button>
  );
}

function Divider() {
  return (
    <span
      className="self-stretch"
      style={{ width: 1, background: "var(--color-border)" }}
      aria-hidden
    />
  );
}

function ColHeader({
  active,
  dir,
  onClick,
  align = "left",
  title,
  children,
}: {
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  align?: "left" | "right" | "center";
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="flex items-center gap-1 px-1 py-0.5 transition-colors font-mono"
      style={{
        color: active ? "var(--color-accent)" : "var(--color-dim)",
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        fontSize: "10.5px",
        justifyContent: align === "right" ? "flex-end" : align === "center" ? "center" : "flex-start",
      }}
    >
      <span>{children}</span>
      <span
        className="text-[9px] transition-opacity"
        style={{ opacity: active ? 1 : 0 }}
      >
        {dir === "asc" ? "↑" : "↓"}
      </span>
    </button>
  );
}

function FilterIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  );
}

function ExternalLinkIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function toggleArr(arr: string[], val: string, set: (v: string[]) => void) {
  set(arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val]);
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
