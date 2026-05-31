"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

/**
 * Custom date picker that matches the home page MonthCalendar UI instead of
 * the browser's native date input. Click the field to open a month grid;
 * navigate months with the < > controls; click a day to select it.
 *
 * Value is an ISO date string ("YYYY-MM-DD"). Min/max are inclusive.
 */
export function DatePicker({
  value,
  onChange,
  min,
  max,
  placeholder = "Pick a date",
}: {
  value: string;
  onChange: (iso: string) => void;
  min?: string;
  max?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<Date>(() => {
    if (value) {
      const d = parseLocalDate(value);
      return startOfMonth(d);
    }
    return startOfMonth(new Date());
  });
  const [mounted, setMounted] = useState(false);
  const [rect, setRect] = useState<
    { top: number; left: number; width: number } | null
  >(null);

  const fieldRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  /* Sync the visible month with the value when the value changes externally. */
  useEffect(() => {
    if (value) {
      const d = parseLocalDate(value);
      setView(startOfMonth(d));
    }
  }, [value]);

  /* Recompute popover position whenever it opens (or the window scrolls).
   * Popover is a fixed compact 300px regardless of field width — otherwise
   * a wide field would balloon the calendar into oversized day cells. */
  useLayoutEffect(() => {
    if (!open) return;
    function update() {
      const el = fieldRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const popWidth = 300;
      // Anchor left edge to the field, but don't overflow the viewport edge.
      const left = Math.min(r.left, window.innerWidth - popWidth - 12);
      setRect({ top: r.bottom + 6, left, width: popWidth });
    }
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  /* Click-outside + Escape to close. */
  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      const t = e.target as Node;
      if (fieldRef.current?.contains(t)) return;
      if (popoverRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const minDate = min ? parseLocalDate(min) : null;
  const maxDate = max ? parseLocalDate(max) : null;
  const todayKey = isoDate(new Date());
  const selectedKey = value || null;

  const cells = useMemo(
    () => buildMonthGrid(view, todayKey, selectedKey, minDate, maxDate),
    [view, todayKey, selectedKey, minDate, maxDate],
  );

  const monthLabel = view.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  function pick(iso: string, disabled: boolean) {
    if (disabled) return;
    onChange(iso);
    setOpen(false);
  }

  const displayLabel = value
    ? parseLocalDate(value).toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : placeholder;

  return (
    <>
      <button
        ref={fieldRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 rounded-md text-[14px] outline-none transition-colors text-left"
        style={{
          background: "var(--color-bg)",
          border: `1px solid ${
            open ? "var(--color-accent)" : "var(--color-border-2)"
          }`,
          color: value ? "var(--color-text)" : "var(--color-dim)",
        }}
      >
        <span>{displayLabel}</span>
        <span
          className="font-mono text-[11px] shrink-0"
          style={{ color: "var(--color-dim)" }}
          aria-hidden
        >
          {open ? "▴" : "▾"}
        </span>
      </button>

      {mounted &&
        open &&
        rect &&
        createPortal(
          <div
            ref={popoverRef}
            style={{
              position: "fixed",
              top: rect.top,
              left: rect.left,
              width: rect.width,
              zIndex: 9999,
            }}
          >
            <div
              className="rounded-xl p-3 fade-up"
              style={{
                background: "#1A1612",
                border: "1px solid var(--color-border-2)",
                boxShadow:
                  "0 12px 32px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255,255,255,0.02)",
              }}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-2">
                <div
                  className="font-display font-medium text-[13px]"
                  style={{ letterSpacing: "-0.015em" }}
                >
                  {monthLabel}
                </div>
                <div className="flex items-center gap-1">
                  <NavBtn
                    onClick={() =>
                      setView(
                        new Date(view.getFullYear(), view.getMonth() - 1, 1),
                      )
                    }
                    label="Previous month"
                  >
                    ‹
                  </NavBtn>
                  <NavBtn
                    onClick={() =>
                      setView(
                        new Date(view.getFullYear(), view.getMonth() + 1, 1),
                      )
                    }
                    label="Next month"
                  >
                    ›
                  </NavBtn>
                </div>
              </div>

              {/* Weekday strip */}
              <div className="grid grid-cols-7 gap-1 mb-1.5">
                {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                  <div
                    key={i}
                    className="text-center text-[10px] font-mono uppercase"
                    style={{
                      color: "var(--color-dimmer)",
                      letterSpacing: "0.12em",
                    }}
                  >
                    {d}
                  </div>
                ))}
              </div>

              {/* Day cells */}
              <div className="grid grid-cols-7 gap-1">
                {cells.map((cell) => (
                  <DayCell key={cell.key} cell={cell} onPick={pick} />
                ))}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

type Cell = {
  key: string;
  date: Date;
  inMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  disabled: boolean;
};

function DayCell({
  cell,
  onPick,
}: {
  cell: Cell;
  onPick: (iso: string, disabled: boolean) => void;
}) {
  const baseColor = cell.disabled
    ? "var(--color-dimmer)"
    : cell.inMonth
      ? "var(--color-text)"
      : "var(--color-dimmer)";

  const background = cell.isSelected
    ? "var(--color-accent)"
    : cell.isToday
      ? "var(--color-accent-soft)"
      : "transparent";

  const color = cell.isSelected
    ? "#1A0F08"
    : cell.isToday
      ? "var(--color-accent)"
      : baseColor;

  return (
    <button
      type="button"
      onClick={() => onPick(cell.key, cell.disabled)}
      disabled={cell.disabled}
      className="aspect-square flex items-center justify-center rounded-md transition-colors"
      style={{
        background,
        color,
        border: cell.isToday && !cell.isSelected
          ? "1px solid rgba(224, 164, 88, 0.35)"
          : "1px solid transparent",
        cursor: cell.disabled ? "not-allowed" : "pointer",
        opacity: cell.disabled ? 0.4 : 1,
      }}
      onMouseEnter={(e) => {
        if (cell.disabled || cell.isSelected || cell.isToday) return;
        e.currentTarget.style.background = "var(--color-surface-2)";
      }}
      onMouseLeave={(e) => {
        if (cell.disabled || cell.isSelected || cell.isToday) return;
        e.currentTarget.style.background = "transparent";
      }}
    >
      <span
        className="font-mono tnum"
        style={{
          fontSize: 12,
          fontWeight: cell.isSelected || cell.isToday ? 600 : 400,
          lineHeight: 1,
        }}
      >
        {cell.date.getDate()}
      </span>
    </button>
  );
}

function NavBtn({
  children,
  onClick,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="w-7 h-7 rounded-md flex items-center justify-center transition-colors font-mono text-[15px]"
      style={{
        background: "transparent",
        border: "1px solid var(--color-border-2)",
        color: "var(--color-text-2)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = "var(--color-accent)";
        e.currentTarget.style.borderColor = "rgba(224, 164, 88, 0.3)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = "var(--color-text-2)";
        e.currentTarget.style.borderColor = "var(--color-border-2)";
      }}
    >
      {children}
    </button>
  );
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function buildMonthGrid(
  view: Date,
  todayKey: string,
  selectedKey: string | null,
  minDate: Date | null,
  maxDate: Date | null,
): Cell[] {
  const year = view.getFullYear();
  const month = view.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startWeekday = firstOfMonth.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: Cell[] = [];

  function makeCell(d: Date, inMonth: boolean): Cell {
    const key = isoDate(d);
    const t = d.getTime();
    const disabled =
      (minDate ? t < minDate.getTime() : false) ||
      (maxDate ? t > maxDate.getTime() : false);
    return {
      key,
      date: d,
      inMonth,
      isToday: key === todayKey,
      isSelected: key === selectedKey,
      disabled,
    };
  }

  // Pad before with trailing days from prev month.
  for (let i = startWeekday - 1; i >= 0; i--) {
    cells.push(makeCell(new Date(year, month, -i), false));
  }
  // Current month days.
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(makeCell(new Date(year, month, day), true));
  }
  // Pad after to fill 6 full weeks (42 cells).
  let nextDay = 1;
  while (cells.length < 42) {
    cells.push(makeCell(new Date(year, month + 1, nextDay++), false));
  }
  return cells;
}
