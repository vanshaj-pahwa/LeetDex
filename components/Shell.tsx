"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, Suspense, useContext, useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { COMPANIES, PROBLEMS, STATS } from "@/lib/catalog";
import { solveStats } from "@/lib/recommend";
import { TOPIC_BUCKETS } from "@/lib/topics";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/problems", label: "Problems" },
  { href: "/topics", label: "Topics" },
  { href: "/companies", label: "Companies" },
  { href: "/progress", label: "Progress" },
];

export function Shell({
  children,
  detail,
}: {
  children: React.ReactNode;
  detail?: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const name = useStore((s) => s.name);
  const attempts = useStore((s) => s.attempts);
  const hasAnyKey = useStore((s) => s.hasAnyKey());
  const activeProvider = useStore((s) => s.activeProvider);

  // Mobile drawer state — sidebar is hidden on <md by default, opened by the
  // hamburger in the topbar.
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Close drawer on route change.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  const stats = mounted ? solveStats(PROBLEMS, attempts) : null;

  const sidebar = (
    <Suspense fallback={null}>
      <SidebarSlot
        pathname={pathname}
        solved={stats?.solved ?? 0}
        problems={PROBLEMS.length}
        companies={COMPANIES.length}
        topics={TOPIC_BUCKETS.length}
        hasAnyKey={hasAnyKey}
        providerLabel={activeProvider}
        name={name}
      />
    </Suspense>
  );

  return (
    <ShellContext.Provider value={{ openDrawer: () => setDrawerOpen(true) }}>
      <div className="md:mx-auto" style={{ maxWidth: 1680 }}>
        {/* Desktop layout (≥ md): three-pane grid with sidebar always visible. */}
        <div
          className="hidden md:grid min-h-screen"
          style={{
            gridTemplateColumns: detail ? "232px 1fr 400px" : "232px 1fr",
          }}
        >
          {sidebar}
          <main className="min-w-0 px-12 py-9 pb-20">{children}</main>
          {detail && (
            <aside
              className="sticky top-0 max-h-screen overflow-y-auto px-8 py-9"
              style={{
                borderLeft: "1px solid var(--color-border)",
                background: "var(--color-bg-warm)",
              }}
            >
              {detail}
            </aside>
          )}
        </div>

        {/* Mobile layout (< md): single column, sidebar slides in as overlay. */}
        <div className="md:hidden min-h-screen">
          <main className="min-w-0 px-4 py-5 pb-16">{children}</main>
          {detail && (
            <aside
              className="px-4 py-6 mt-2"
              style={{
                borderTop: "1px solid var(--color-border)",
                background: "var(--color-bg-warm)",
              }}
            >
              {detail}
            </aside>
          )}
          {drawerOpen && (
            <>
              <div
                onClick={() => setDrawerOpen(false)}
                style={{
                  position: "fixed",
                  inset: 0,
                  background: "rgba(0,0,0,0.55)",
                  backdropFilter: "blur(2px)",
                  zIndex: 80,
                }}
                aria-hidden
              />
              <div
                className="fade-up"
                style={{
                  position: "fixed",
                  top: 0,
                  left: 0,
                  bottom: 0,
                  width: 260,
                  background: "var(--color-bg)",
                  borderRight: "1px solid var(--color-border-2)",
                  zIndex: 90,
                  overflowY: "auto",
                }}
              >
                {sidebar}
              </div>
            </>
          )}
        </div>
      </div>
    </ShellContext.Provider>
  );
}

const ShellContext = createContext<{ openDrawer: () => void }>({
  openDrawer: () => {},
});

/** Inner component that reads useSearchParams; wrapped in Suspense by the
 * parent so pages without their own Suspense boundary don't crash. */
function SidebarSlot({
  pathname,
  ...rest
}: {
  pathname: string;
  solved: number;
  problems: number;
  companies: number;
  topics: number;
  hasAnyKey: boolean;
  providerLabel: string;
  name?: string;
}) {
  const sp = useSearchParams();
  const status = sp.get("status");

  // The main "Problems" item is active only when on /problems WITHOUT a
  // status filter that points at the Solved shortcut.
  const onSolvedShortcut = pathname === "/problems" && status === "solved";

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    if (href === "/problems") return pathname.startsWith("/problems") && !onSolvedShortcut;
    return pathname.startsWith(href);
  };

  return (
    <Sidebar
      {...rest}
      isActive={isActive}
      solvedOn={onSolvedShortcut}
    />
  );
}

function Sidebar({
  isActive,
  solvedOn,
  solved,
  problems,
  companies,
  topics,
  hasAnyKey,
  providerLabel,
}: {
  isActive: (href: string) => boolean;
  solvedOn: boolean;
  solved: number;
  problems: number;
  companies: number;
  topics: number;
  hasAnyKey: boolean;
  providerLabel: string;
}) {
  return (
    <aside
      className="flex flex-col gap-1 px-4 py-6 min-h-screen"
      style={{ borderRight: "1px solid var(--color-border)" }}
    >
      <Link href="/" className="block px-2.5 py-1.5 mb-7">
        <div className="flex items-center gap-2.5">
          <div
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{
              background: "linear-gradient(135deg, var(--color-accent), var(--color-accent-2))",
              boxShadow: "0 0 12px var(--color-accent-glow)",
            }}
          />
          <span
            className="font-display font-semibold text-base"
            style={{ letterSpacing: "-0.015em" }}
          >
            LeetDex
          </span>
        </div>
        <div
          className="text-[10px] mt-1 whitespace-nowrap"
          style={{
            color: "var(--color-dim)",
            letterSpacing: "0.01em",
            lineHeight: 1.3,
          }}
        >
          Company-wise LeetCode, no Premium.
        </div>
      </Link>

      <nav className="flex flex-col gap-px">
        {NAV.map((item) => {
          const count =
            item.href === "/problems"
              ? problems
              : item.href === "/topics"
                ? topics
                : item.href === "/companies"
                  ? companies
                  : item.href === "/progress"
                    ? solved
                    : undefined;
          return (
            <NavLink
              key={item.href}
              href={item.href}
              label={item.label}
              count={count}
              on={isActive(item.href)}
            />
          );
        })}
      </nav>

      <GroupLabel>Practice</GroupLabel>
      <nav className="flex flex-col gap-px">
        <NavLink href="/problems?status=solved" label="Solved" on={solvedOn} count={solved} />
      </nav>

      <div className="flex-1" />

      <Link href="/onboarding" className="block">
        <div
          className="rounded-xl p-3.5 text-xs leading-relaxed mt-4"
          style={{
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            color: "var(--color-dim)",
          }}
        >
          <div className="flex justify-between py-0.5">
            <span>{providerLabel}</span>
            <span
              className="font-mono text-[11px]"
              style={{ color: hasAnyKey ? "var(--color-green)" : "var(--color-dim)" }}
            >
              {hasAnyKey ? "● connected" : "○ not set"}
            </span>
          </div>
          <div className="flex justify-between py-0.5">
            <span>Settings</span>
            <span className="font-mono text-[11px]" style={{ color: "var(--color-accent)" }}>
              →
            </span>
          </div>
        </div>
      </Link>

      <div
        className="font-mono text-[10px] mt-3 px-2.5"
        style={{
          color: "var(--color-dimmer)",
          letterSpacing: "0.06em",
        }}
      >
        Catalog updated {formatCatalogDate(STATS.generatedAt)}
      </div>
    </aside>
  );
}

function formatCatalogDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d
      .toLocaleDateString(undefined, { month: "short", year: "numeric" })
      .replace(",", "");
  } catch {
    return "—";
  }
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-[10.5px] uppercase tracking-[0.12em] px-2.5 pt-2 pb-1 mt-3"
      style={{ color: "var(--color-dimmer)" }}
    >
      {children}
    </div>
  );
}

function NavLink({
  href,
  label,
  count,
  on,
}: {
  href: string;
  label: string;
  count?: number;
  on: boolean;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between px-2.5 py-2 rounded-md text-[13.5px] transition-colors relative"
      style={{
        color: on ? "var(--color-text)" : "var(--color-dim)",
        background: on ? "var(--color-surface)" : "transparent",
      }}
    >
      {on && (
        <span
          className="absolute"
          style={{
            left: "-18px",
            top: "50%",
            transform: "translateY(-50%)",
            width: 2,
            height: 16,
            background: "var(--color-accent)",
            borderRadius: 2,
          }}
        />
      )}
      <span>{label}</span>
      {count !== undefined && (
        <span
          className="font-mono text-[10.5px] px-1.5 py-px rounded-full tnum"
          style={{
            color: on ? "var(--color-accent)" : "var(--color-dim)",
            background: on ? "var(--color-accent-soft)" : "var(--color-surface-2)",
          }}
        >
          {count}
        </span>
      )}
    </Link>
  );
}

export function Topbar({
  searchPlaceholder = "Search problems, companies, topics…",
  value,
  onChange,
}: {
  searchPlaceholder?: string;
  value?: string;
  onChange?: (v: string) => void;
}) {
  const name = useStore((s) => s.name);
  const initial = (name ?? "L").trim().charAt(0).toUpperCase() || "L";
  const inputRef = useRef<HTMLInputElement>(null);
  const { openDrawer } = useContext(ShellContext);
  const pathname = usePathname();
  const router = useRouter();
  const showBack = pathname !== "/";

  // If the host page didn't wire up onChange (e.g. Home, Prep, Topics),
  // fall back to a local-state input that navigates to /problems on Enter.
  const isControlled = value !== undefined && onChange !== undefined;
  const [localValue, setLocalValue] = useState("");
  const inputValue = isControlled ? value : localValue;
  const handleChange = (v: string) => {
    if (isControlled) onChange?.(v);
    else setLocalValue(v);
  };
  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (isControlled) return; // /problems wires its own filter; no nav needed.
    if (e.key === "Enter") {
      const q = localValue.trim();
      if (!q) return;
      router.push(`/problems?search=${encodeURIComponent(q)}`);
      setLocalValue("");
      inputRef.current?.blur();
    }
  };

  // "/" anywhere on the page focuses the search box, unless the user is
  // already typing in another input/textarea/contenteditable.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/") return;
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      )
        return;
      e.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex items-center gap-2 mb-6 md:mb-9">
      {/* Hamburger (mobile only) */}
      <button
        type="button"
        onClick={openDrawer}
        aria-label="Open menu"
        className="md:hidden w-9 h-9 rounded-md flex items-center justify-center shrink-0"
        style={{
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          color: "var(--color-text-2)",
        }}
      >
        <MenuIcon />
      </button>

      {/* Back to Home — visible on every Shell page except Home itself.
          On phones it's icon-only to save room next to the hamburger; from
          sm+ it expands to show the "Home" label too. */}
      {showBack && (
        <Link
          href="/"
          aria-label="Back to home"
          title="Back to home"
          className="inline-flex items-center gap-1.5 text-[12.5px] font-medium rounded-md transition-colors shrink-0 px-2.5 py-1.5"
          style={{
            color: "var(--color-text-2)",
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "var(--color-accent)";
            e.currentTarget.style.borderColor = "rgba(224, 164, 88, 0.3)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--color-text-2)";
            e.currentTarget.style.borderColor = "var(--color-border)";
          }}
        >
          <span style={{ fontFamily: "var(--font-mono)" }}>←</span>
          <span className="hidden sm:inline">Home</span>
        </Link>
      )}

      <div
        className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-lg text-sm flex-1"
        style={{
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          maxWidth: 720,
          color: "var(--color-dim)",
        }}
      >
        <span>⌕</span>
        <input
          ref={inputRef}
          className="flex-1 min-w-0 bg-transparent border-none outline-none text-[13px]"
          style={{ color: "var(--color-text)" }}
          placeholder={searchPlaceholder}
          value={inputValue}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKey}
        />
        <kbd
          className="hidden md:inline-block font-mono text-[11px] px-1.5 py-px rounded"
          style={{ background: "var(--color-surface-2)", color: "var(--color-dim)" }}
          title="Press / anywhere to focus"
        >
          /
        </kbd>
      </div>
      <div className="flex items-center gap-3 ml-auto">
        <Link
          href="/onboarding"
          aria-label="Settings"
          title={name ? `${name} · settings` : "Settings"}
          className="w-8 h-8 rounded-full flex items-center justify-center font-display font-semibold text-xs text-white transition-transform hover:scale-105"
          style={{
            background: "linear-gradient(135deg, #5B9B96, #E0A458)",
            boxShadow: "0 0 0 1px rgba(224, 164, 88, 0)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow = "0 0 0 2px var(--color-accent-soft)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = "0 0 0 1px rgba(224, 164, 88, 0)";
          }}
        >
          {initial}
        </Link>
      </div>
    </div>
  );
}

function MenuIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}
