"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useStore } from "@/lib/store";
import { Shell, Topbar } from "@/components/Shell";
import { COMPANIES, PROBLEMS, applyOverride, getProblem } from "@/lib/catalog";
import { DifficultyBadge, StatusGlyph } from "@/components/Primitives";
import { DatePicker } from "@/components/DatePicker";
import {
  computePlanProgress,
  generateStudyPlan,
  isoDate,
  parseLocalDate,
  startOfDay,
} from "@/lib/studyPlan";
import type { CompanyEntry, Problem, StudyPlanSlot } from "@/lib/schema";

export default function PrepPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const attempts = useStore((s) => s.attempts);
  const overrides = useStore((s) => s.problemOverrides);
  const activePlan = useStore((s) => s.activePlan);
  const setActivePlan = useStore((s) => s.setActivePlan);
  const clearActivePlan = useStore((s) => s.clearActivePlan);
  const targetCompanies = useStore((s) => s.targetCompanies);

  if (!mounted) return null;

  return (
    <Shell>
      <Topbar />

      <div className="fade-up mb-7">
        <div
          className="text-[10.5px] uppercase mb-1.5 font-mono"
          style={{ color: "var(--color-accent)", letterSpacing: "0.14em" }}
        >
          Interview prep
        </div>
        <h1
          className="font-display font-medium m-0"
          style={{ fontSize: 32, lineHeight: 1.1, letterSpacing: "-0.025em" }}
        >
          Your study plan.
        </h1>
        <p
          className="m-0 mt-2 text-[14px]"
          style={{ color: "var(--color-text-2)", lineHeight: 1.55 }}
        >
          Pick a target company and your interview date. We build a
          day-by-day plan from the company&apos;s most recently-asked unsolved
          problems, ramped easy to hard so you peak the day of.
        </p>
      </div>

      {activePlan ? (
        <ActivePlanView
          attempts={attempts}
          overrides={overrides}
          onReset={() => clearActivePlan()}
        />
      ) : (
        <CreatePlanForm
          defaultCompany={targetCompanies[0]}
          onCreate={(plan) => setActivePlan(plan)}
          attempts={attempts}
        />
      )}
    </Shell>
  );
}

/* ─── Create plan form ─────────────────────────────────────────────── */

function CreatePlanForm({
  defaultCompany,
  attempts,
  onCreate,
}: {
  defaultCompany?: string;
  attempts: Record<string, import("@/lib/schema").Attempt>;
  onCreate: (plan: import("@/lib/schema").StudyPlan) => void;
}) {
  const [company, setCompany] = useState<string>(defaultCompany ?? "");
  const [date, setDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return isoDate(d);
  });

  const minDate = isoDate(new Date());

  /* Live preview of what the plan would look like for current inputs. */
  const preview = useMemo(() => {
    if (!company || !date) return null;
    return generateStudyPlan({ company, interviewDate: date, problems: PROBLEMS, attempts });
  }, [company, date, attempts]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!company || !date) return;
    const plan = generateStudyPlan({
      company,
      interviewDate: date,
      problems: PROBLEMS,
      attempts,
    });
    onCreate(plan);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="fade-up rounded-xl px-5 py-5 md:px-7 md:py-7"
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
      }}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <FormLabel n="01" label="Target company" />
          <CompanyPicker
            value={company}
            onChange={setCompany}
            companies={COMPANIES}
          />
          <p
            className="mt-1.5 text-[11.5px]"
            style={{ color: "var(--color-dim)" }}
          >
            Pick from {COMPANIES.length.toLocaleString()} companies in the catalog.
          </p>
        </div>

        <div>
          <FormLabel n="02" label="Interview date" />
          <DatePicker
            value={date}
            onChange={setDate}
            min={minDate}
          />
          <p
            className="mt-1.5 text-[11.5px]"
            style={{ color: "var(--color-dim)" }}
          >
            {(() => {
              if (!date) return "Pick a date to see plan length.";
              const days = Math.max(
                1,
                Math.ceil(
                  (parseLocalDate(date).getTime() - startOfDay(new Date()).getTime()) /
                    86400000,
                ) + 1,
              );
              return `${days} day${days === 1 ? "" : "s"} from today.`;
            })()}
          </p>
        </div>
      </div>

      {preview && preview.slots.length > 0 && (
        <div
          className="mt-6 px-4 py-3 rounded-md"
          style={{
            background: "var(--color-bg-warm)",
            border: "1px solid var(--color-border-2)",
          }}
        >
          <div
            className="font-mono text-[10.5px] uppercase mb-1.5"
            style={{ color: "var(--color-dim)", letterSpacing: "0.14em" }}
          >
            Preview
          </div>
          <div className="text-[13px]" style={{ color: "var(--color-text)" }}>
            {preview.slots.reduce((n, s) => n + s.problemIds.length, 0)} problems across {preview.slots.length} day{preview.slots.length === 1 ? "" : "s"}, easy{" "}
            <span style={{ color: "var(--color-easy)" }}>→</span> hard.
          </div>
        </div>
      )}

      {preview && preview.slots.length === 0 && company && (
        <div
          className="mt-6 px-4 py-3 rounded-md text-[12.5px]"
          style={{
            background: "var(--color-red-soft)",
            border: "1px solid rgba(224, 138, 120, 0.25)",
            color: "var(--color-red)",
          }}
        >
          No unsolved problems found for {company}. Try a different company or
          reset some solves.
        </div>
      )}

      <div className="mt-7 flex items-center gap-3">
        <button
          type="submit"
          disabled={!company || !date || (preview?.slots.length ?? 0) === 0}
          className="px-5 py-2.5 rounded-md text-[13px] font-medium transition-colors"
          style={{
            background:
              !company || !date || (preview?.slots.length ?? 0) === 0
                ? "var(--color-surface-2)"
                : "var(--color-accent)",
            color:
              !company || !date || (preview?.slots.length ?? 0) === 0
                ? "var(--color-dim)"
                : "#1A0F08",
          }}
        >
          Generate plan
        </button>
        <span className="text-[11.5px]" style={{ color: "var(--color-dim)" }}>
          The plan lives in your browser. No account needed.
        </span>
      </div>
    </form>
  );
}

/* ─── Active plan view ─────────────────────────────────────────────── */

function ActivePlanView({
  attempts,
  overrides,
  onReset,
}: {
  attempts: Record<string, import("@/lib/schema").Attempt>;
  overrides: Record<string, import("@/lib/store").ProblemOverride>;
  onReset: () => void;
}) {
  const activePlan = useStore((s) => s.activePlan);
  const setActivePlan = useStore((s) => s.setActivePlan);
  const [switching, setSwitching] = useState(false);
  // Compute progress unconditionally so the hook always runs in the same
  // order. Returns null when there's no plan; we guard the render below.
  const progress = useMemo(
    () => (activePlan ? computePlanProgress(activePlan, attempts) : null),
    [activePlan, attempts],
  );
  if (!activePlan || !progress) return null;

  const pct = progress.totalProblems
    ? Math.round((progress.solvedProblems / progress.totalProblems) * 100)
    : 0;

  return (
    <>
      {/* Header card with target + counters */}
      <div
        className="fade-up rounded-xl px-5 py-5 md:px-7 md:py-6 mb-5"
        style={{
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
        }}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-4 mb-4">
          <div>
            <div
              className="font-mono text-[10.5px] uppercase mb-1"
              style={{ color: "var(--color-accent)", letterSpacing: "0.14em" }}
            >
              Target
            </div>
            <h2
              className="font-display font-medium m-0"
              style={{ fontSize: 24, letterSpacing: "-0.02em" }}
            >
              {activePlan.company}
            </h2>
            <div
              className="text-[12.5px] mt-1"
              style={{ color: "var(--color-text-2)" }}
            >
              Interview on{" "}
              <span style={{ color: "var(--color-text)" }}>
                {formatLongDate(activePlan.interviewDate)}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setSwitching(true)}
              className="text-[11.5px] font-mono px-2.5 py-1 rounded-md transition-colors"
              style={{
                color: "var(--color-accent)",
                background: "var(--color-accent-soft)",
                border: "1px solid rgba(224, 164, 88, 0.25)",
              }}
              title="Change company or interview date"
            >
              switch target
            </button>
            <button
              type="button"
              onClick={onReset}
              className="text-[11.5px] font-mono px-2.5 py-1 rounded-md transition-colors"
              style={{
                color: "var(--color-dim)",
                background: "transparent",
                border: "1px solid var(--color-border-2)",
              }}
              title="Discard this plan and start over"
            >
              reset plan
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="grid grid-cols-3 gap-3 md:gap-5">
          <PlanStat
            label="Days left"
            value={progress.daysRemaining}
            sub={progress.daysRemaining === 1 ? "day" : "days"}
            accent
          />
          <PlanStat
            label="Solved"
            value={`${progress.solvedProblems}/${progress.totalProblems}`}
            sub={`${pct}%`}
          />
          <PlanStat
            label="Overdue"
            value={progress.overdueProblemIds.length}
            sub={progress.overdueProblemIds.length === 0 ? "all caught up" : "to revisit"}
            tone={progress.overdueProblemIds.length > 0 ? "warn" : "ok"}
          />
        </div>

        <div className="mt-5">
          <div
            className="h-1.5 rounded-full overflow-hidden"
            style={{ background: "var(--color-surface-2)" }}
          >
            <div
              style={{
                width: `${pct}%`,
                height: "100%",
                background: "var(--color-accent)",
                transition: "width 240ms ease",
              }}
            />
          </div>
        </div>
      </div>

      {/* Today + the schedule */}
      <div className="fade-up grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-4">
        <TodayCard
          slot={progress.todaySlot}
          overdueProblemIds={progress.overdueProblemIds}
          attempts={attempts}
          overrides={overrides}
        />
        <ScheduleCard
          slots={activePlan.slots}
          todayKey={progress.todayKey}
          attempts={attempts}
          overrides={overrides}
        />
      </div>

      {switching && (
        <SwitchTargetModal
          currentCompany={activePlan.company}
          currentDate={activePlan.interviewDate}
          attempts={attempts}
          onApply={(plan) => {
            setActivePlan(plan);
            setSwitching(false);
          }}
          onClose={() => setSwitching(false)}
        />
      )}
    </>
  );
}

function TodayCard({
  slot,
  overdueProblemIds,
  attempts,
  overrides,
}: {
  slot: StudyPlanSlot | undefined;
  overdueProblemIds: string[];
  attempts: Record<string, import("@/lib/schema").Attempt>;
  overrides: Record<string, import("@/lib/store").ProblemOverride>;
}) {
  return (
    <div
      className="rounded-xl px-5 py-5"
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
      }}
    >
      <div
        className="font-mono text-[10.5px] uppercase mb-3"
        style={{ color: "var(--color-accent)", letterSpacing: "0.14em" }}
      >
        Today
      </div>

      {slot ? (
        <ProblemList
          problemIds={slot.problemIds}
          attempts={attempts}
          overrides={overrides}
          emptyLabel="Nothing scheduled."
        />
      ) : (
        <div className="text-[13px]" style={{ color: "var(--color-dimmer)" }}>
          No slot for today (plan may have ended or you started after the run).
        </div>
      )}

      {overdueProblemIds.length > 0 && (
        <>
          <div
            className="font-mono text-[10.5px] uppercase mt-5 mb-2"
            style={{ color: "var(--color-amber)", letterSpacing: "0.14em" }}
          >
            Catch up · {overdueProblemIds.length}
          </div>
          <ProblemList
            problemIds={overdueProblemIds}
            attempts={attempts}
            overrides={overrides}
            emptyLabel=""
          />
        </>
      )}
    </div>
  );
}

function ScheduleCard({
  slots,
  todayKey,
  attempts,
  overrides,
}: {
  slots: StudyPlanSlot[];
  todayKey: string;
  attempts: Record<string, import("@/lib/schema").Attempt>;
  overrides: Record<string, import("@/lib/store").ProblemOverride>;
}) {
  return (
    <div
      className="rounded-xl px-5 py-5"
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
      }}
    >
      <div
        className="font-mono text-[10.5px] uppercase mb-3"
        style={{ color: "var(--color-dim)", letterSpacing: "0.14em" }}
      >
        Full schedule · {slots.length} day{slots.length === 1 ? "" : "s"}
      </div>
      <ul className="flex flex-col gap-3 max-h-[480px] overflow-y-auto thin-scrollbar pr-1 -mr-1">
        {slots.map((slot) => {
          const isToday = slot.date === todayKey;
          const isPast = slot.date < todayKey;
          const solvedHere = slot.problemIds.filter(
            (id) => attempts[id]?.status === "solved",
          ).length;
          const allDone = solvedHere === slot.problemIds.length;
          return (
            <li key={slot.date}>
              <div
                className="flex items-baseline justify-between mb-1.5"
                style={{
                  color: isToday
                    ? "var(--color-accent)"
                    : isPast && !allDone
                      ? "var(--color-amber)"
                      : "var(--color-text-2)",
                }}
              >
                <span
                  className="font-mono text-[11px]"
                  style={{ letterSpacing: "0.04em" }}
                >
                  {formatShortDate(slot.date)}
                  {isToday && " · today"}
                </span>
                <span
                  className="font-mono text-[11px]"
                  style={{ color: "var(--color-dim)" }}
                >
                  {solvedHere}/{slot.problemIds.length}
                </span>
              </div>
              <ProblemList
                problemIds={slot.problemIds}
                attempts={attempts}
                overrides={overrides}
                emptyLabel=""
                dense
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ProblemList({
  problemIds,
  attempts,
  overrides,
  emptyLabel,
  dense = false,
}: {
  problemIds: string[];
  attempts: Record<string, import("@/lib/schema").Attempt>;
  overrides: Record<string, import("@/lib/store").ProblemOverride>;
  emptyLabel: string;
  dense?: boolean;
}) {
  if (problemIds.length === 0) {
    if (!emptyLabel) return null;
    return (
      <div className="text-[12.5px]" style={{ color: "var(--color-dimmer)" }}>
        {emptyLabel}
      </div>
    );
  }
  return (
    <ul className={`flex flex-col ${dense ? "gap-0.5" : "gap-1.5"}`}>
      {problemIds.map((pid) => (
        <ProblemRow
          key={pid}
          pid={pid}
          attempts={attempts}
          overrides={overrides}
        />
      ))}
    </ul>
  );
}

/* Single row inside ProblemList. The row's Link is an absolutely-positioned
 * overlay so the status toggle (a real button on top with z-10) can fire its
 * own onClick without navigating. Matches the pattern in ProblemsClient. */
function ProblemRow({
  pid,
  attempts,
  overrides,
}: {
  pid: string;
  attempts: Record<string, import("@/lib/schema").Attempt>;
  overrides: Record<string, import("@/lib/store").ProblemOverride>;
}) {
  const setStatus = useStore((s) => s.setStatus);
  const clearAttempt = useStore((s) => s.clearAttempt);

  const base = getProblem(pid);
  if (!base) return null;
  const problem: Problem = applyOverride(base, overrides[pid]);
  const solved = attempts[pid]?.status === "solved";

  function toggleSolved(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (solved) clearAttempt(pid);
    else setStatus(pid, "solved");
  }

  return (
    <li
      className="relative flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors"
      style={{ background: "transparent" }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.background = "var(--color-surface-2)")
      }
      onMouseLeave={(e) =>
        (e.currentTarget.style.background = "transparent")
      }
    >
      <Link
        href={`/problems/${pid}`}
        className="absolute inset-0"
        aria-label={problem.title}
      />
      <button
        type="button"
        onClick={toggleSolved}
        title={solved ? "Mark unsolved" : "Mark solved"}
        aria-label={solved ? "Mark unsolved" : "Mark solved"}
        className="relative z-10 flex items-center justify-center rounded-full shrink-0 w-5 h-5"
      >
        <StatusGlyph status={solved ? "solved" : undefined} />
      </button>
      <span
        className="font-mono text-[11px] tnum shrink-0 pointer-events-none"
        style={{ color: "var(--color-dim)", minWidth: 32 }}
      >
        {problem.leetcodeNumber}
      </span>
      <span
        className="text-[12.5px] truncate flex-1 pointer-events-none"
        style={{
          color: solved ? "var(--color-dim)" : "var(--color-text)",
          textDecorationLine: solved ? "line-through" : "none",
          textDecorationColor: "var(--color-dimmer)",
        }}
      >
        {problem.title}
      </span>
      <div className="relative z-10 pointer-events-none">
        <DifficultyBadge value={problem.difficulty} />
      </div>
    </li>
  );
}

/* ─── Tiny presentational helpers ─────────────────────────────────── */

function FormLabel({ n, label }: { n: string; label: string }) {
  return (
    <div className="flex items-baseline gap-2 mb-1.5">
      <span
        className="font-mono text-[10.5px]"
        style={{ color: "var(--color-accent)", letterSpacing: "0.14em" }}
      >
        {n}
      </span>
      <span
        className="font-display font-medium text-[14px]"
        style={{ color: "var(--color-text)" }}
      >
        {label}
      </span>
    </div>
  );
}

function PlanStat({
  label,
  value,
  sub,
  accent = false,
  tone,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: boolean;
  tone?: "warn" | "ok";
}) {
  const valueColor =
    tone === "warn"
      ? "var(--color-amber)"
      : accent
        ? "var(--color-accent)"
        : "var(--color-text)";
  return (
    <div
      className="px-3 py-3 rounded-md"
      style={{
        background: "var(--color-bg-warm)",
        border: "1px solid var(--color-border-2)",
      }}
    >
      <div
        className="text-[10px] uppercase mb-1.5 font-mono"
        style={{ color: "var(--color-dim)", letterSpacing: "0.12em" }}
      >
        {label}
      </div>
      <div
        className="font-mono tnum font-medium"
        style={{ color: valueColor, fontSize: 22, letterSpacing: "-0.02em" }}
      >
        {value}
      </div>
      {sub && (
        <div className="text-[11px] mt-0.5" style={{ color: "var(--color-dim)" }}>
          {sub}
        </div>
      )}
    </div>
  );
}

/* ─── Company picker (single-select autocomplete) ──────────────────────
 * Matches the visual + interaction model of TagInput: input field with
 * a portal-positioned dropdown below it, keyboard navigation, click to
 * pick. Shows problem count next to each company name for context. */

type Rect = { top: number; left: number; width: number } | null;

function CompanyPicker({
  value,
  onChange,
  companies,
}: {
  value: string;
  onChange: (v: string) => void;
  companies: ReadonlyArray<CompanyEntry>;
}) {
  const [query, setQuery] = useState(value);
  const [focused, setFocused] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [rect, setRect] = useState<Rect>(null);

  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setMounted(true), []);

  // Keep input in sync if parent resets the value.
  useEffect(() => {
    setQuery(value);
  }, [value]);

  useLayoutEffect(() => {
    if (!focused) return;
    function update() {
      const el = boxRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setRect({ top: r.bottom + 6, left: r.left, width: r.width });
    }
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [focused]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    const sorted = [...companies].sort((a, b) => b.count - a.count);
    const list = q
      ? sorted.filter((c) => c.name.toLowerCase().includes(q))
      : sorted;
    return list.slice(0, 30);
  }, [query, companies]);

  function pick(name: string) {
    onChange(name);
    setQuery(name);
    setFocused(false);
    inputRef.current?.blur();
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[activeIdx]) pick(filtered[activeIdx].name);
      return;
    }
    if (e.key === "ArrowDown" && filtered.length > 0) {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % filtered.length);
      return;
    }
    if (e.key === "ArrowUp" && filtered.length > 0) {
      e.preventDefault();
      setActiveIdx((i) => (i - 1 + filtered.length) % filtered.length);
      return;
    }
    if (e.key === "Escape") {
      setFocused(false);
      inputRef.current?.blur();
    }
  }

  const showDropdown = focused && rect && filtered.length > 0;

  return (
    <div className="relative">
      <div
        ref={boxRef}
        className="flex items-center rounded-md transition-colors"
        style={{
          background: "var(--color-bg)",
          border: `1px solid ${
            focused ? "var(--color-accent)" : "var(--color-border-2)"
          }`,
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIdx(0);
            // Treat typed-but-not-picked as no selection; parent re-syncs on pick.
            if (e.target.value !== value) onChange("");
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          onKeyDown={handleKey}
          placeholder="Search companies..."
          className="flex-1 min-w-0 bg-transparent outline-none text-[14px] px-3 py-2.5"
          style={{ color: "var(--color-text)" }}
          autoComplete="off"
        />
        <span
          className="font-mono text-[11px] pr-3 shrink-0"
          style={{ color: "var(--color-dim)" }}
          aria-hidden
        >
          {focused ? "▴" : "▾"}
        </span>
      </div>

      {mounted &&
        showDropdown &&
        rect &&
        createPortal(
          <div
            style={{
              position: "fixed",
              top: rect.top,
              left: rect.left,
              width: rect.width,
              zIndex: 9999,
            }}
          >
            <div
              className="rounded-md overflow-hidden"
              style={{
                background: "#1A1612",
                border: "1px solid var(--color-border-2)",
                boxShadow:
                  "0 12px 32px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255,255,255,0.02)",
                maxHeight: 280,
                overflowY: "auto",
              }}
            >
              {filtered.map((c, i) => (
                <button
                  key={c.name}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(c.name);
                  }}
                  onMouseEnter={() => setActiveIdx(i)}
                  className="w-full text-left px-3.5 py-2 text-sm transition-colors flex items-center justify-between"
                  style={{
                    background:
                      activeIdx === i ? "var(--color-accent-soft)" : "transparent",
                    color:
                      activeIdx === i
                        ? "var(--color-accent)"
                        : "var(--color-text-2)",
                  }}
                >
                  <span>{c.name}</span>
                  <span
                    className="font-mono text-[10.5px] tnum shrink-0"
                    style={{
                      color:
                        activeIdx === i
                          ? "var(--color-accent)"
                          : "var(--color-dim)",
                    }}
                  >
                    {c.count}
                  </span>
                </button>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

/* ─── Switch target modal ─────────────────────────────────────────────
 * Compact dialog for changing the active plan's company or interview date
 * without going through reset + recreate. Pre-filled with current values
 * so the common case (date slip by a day or two) is a one-field tweak. */
function SwitchTargetModal({
  currentCompany,
  currentDate,
  attempts,
  onApply,
  onClose,
}: {
  currentCompany: string;
  currentDate: string;
  attempts: Record<string, import("@/lib/schema").Attempt>;
  onApply: (plan: import("@/lib/schema").StudyPlan) => void;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [company, setCompany] = useState(currentCompany);
  const [date, setDate] = useState(currentDate);
  const minDate = isoDate(new Date());

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const preview = useMemo(() => {
    if (!company || !date) return null;
    return generateStudyPlan({
      company,
      interviewDate: date,
      problems: PROBLEMS,
      attempts,
    });
  }, [company, date, attempts]);

  const previewCount = preview?.slots.reduce((n, s) => n + s.problemIds.length, 0) ?? 0;
  const changed = company !== currentCompany || date !== currentDate;
  const canApply = changed && !!company && !!date && previewCount > 0;

  function handleApply() {
    if (!canApply || !preview) return;
    onApply(preview);
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
          maxWidth: 480,
          background: "var(--color-bg-warm)",
          border: "1px solid var(--color-border-2)",
          boxShadow: "0 24px 60px rgba(0,0,0,0.6)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
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
            Switch target
          </div>
          <h2
            className="font-display font-medium m-0"
            style={{ fontSize: 20, letterSpacing: "-0.02em" }}
          >
            Update company or date
          </h2>
          <p
            className="text-[12px] mt-1.5"
            style={{ color: "var(--color-text-2)" }}
          >
            A new plan replaces the current one. Solved problems stay solved.
          </p>
        </div>

        <div className="px-6 py-5 flex flex-col gap-5">
          <div>
            <FormLabel n="01" label="Target company" />
            <CompanyPicker
              value={company}
              onChange={setCompany}
              companies={COMPANIES}
            />
          </div>
          <div>
            <FormLabel n="02" label="Interview date" />
            <DatePicker
              value={date}
              onChange={setDate}
              min={minDate}
            />
          </div>

          {preview && previewCount > 0 && (
            <div
              className="px-3 py-2.5 rounded-md text-[12.5px]"
              style={{
                background: "var(--color-bg-warm)",
                border: "1px solid var(--color-border-2)",
                color: "var(--color-text-2)",
              }}
            >
              New plan: {previewCount} problems across {preview.slots.length} day
              {preview.slots.length === 1 ? "" : "s"}.
            </div>
          )}
          {preview && previewCount === 0 && (
            <div
              className="px-3 py-2.5 rounded-md text-[12px]"
              style={{
                background: "var(--color-red-soft)",
                border: "1px solid rgba(224, 138, 120, 0.25)",
                color: "var(--color-red)",
              }}
            >
              No unsolved problems for {company}. Pick a different company.
            </div>
          )}
        </div>

        <div
          className="px-6 py-4 flex items-center justify-end gap-2 shrink-0"
          style={{
            borderTop: "1px solid var(--color-border)",
          }}
        >
          <button
            type="button"
            onClick={onClose}
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
            onClick={handleApply}
            disabled={!canApply}
            className="px-4 py-2 rounded-md text-[12.5px] font-medium transition-colors"
            style={{
              background: canApply ? "var(--color-accent)" : "var(--color-surface-2)",
              color: canApply ? "#1A0F08" : "var(--color-dim)",
            }}
          >
            Apply new plan
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function formatLongDate(iso: string): string {
  const d = parseLocalDate(iso);
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatShortDate(iso: string): string {
  const d = parseLocalDate(iso);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

