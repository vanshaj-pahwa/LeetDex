"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

type Rect = { top: number; left: number; width: number } | null;

export function TagInput({
  value,
  onChange,
  suggestions,
  placeholder = "Type to search…",
  allowCustom = false,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  suggestions: ReadonlyArray<string>;
  placeholder?: string;
  allowCustom?: boolean;
}) {
  const [input, setInput] = useState("");
  const [focused, setFocused] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [rect, setRect] = useState<Rect>(null);

  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setMounted(true), []);

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
    const q = input.toLowerCase().trim();
    if (!q) return [];
    return suggestions
      .filter((s) => s.toLowerCase().includes(q) && !value.includes(s))
      .slice(0, 8);
  }, [input, value, suggestions]);

  function add(item: string) {
    const c = item.trim();
    if (!c || value.includes(c)) {
      setInput("");
      return;
    }
    onChange([...value, c]);
    setInput("");
    setActiveIdx(0);
    inputRef.current?.focus();
  }

  function remove(item: string) {
    onChange(value.filter((v) => v !== item));
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (filtered.length > 0) add(filtered[activeIdx]);
      else if (allowCustom && input.trim()) add(input.trim());
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
    if (e.key === "Backspace" && !input && value.length > 0) {
      onChange(value.slice(0, -1));
      return;
    }
    if (e.key === "Escape") {
      setFocused(false);
      inputRef.current?.blur();
    }
  }

  const showDropdown =
    focused && rect && (filtered.length > 0 || input.trim().length > 0);

  return (
    <div className="relative">
      <div
        ref={boxRef}
        onClick={() => inputRef.current?.focus()}
        className="flex flex-wrap items-center gap-1.5 px-2.5 rounded-md cursor-text transition-colors"
        style={{
          background: "var(--color-bg-warm)",
          border: `1px solid ${
            focused ? "var(--color-accent)" : "var(--color-border-2)"
          }`,
          minHeight: 42,
          paddingTop: 6,
          paddingBottom: 6,
        }}
      >
        {value.map((c) => (
          <span
            key={c}
            className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 rounded-full text-xs"
            style={{
              background: "var(--color-accent-soft)",
              color: "var(--color-accent)",
              border: "1px solid rgba(224, 164, 88, 0.3)",
              height: 26,
              lineHeight: 1,
            }}
          >
            {c}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                remove(c);
              }}
              className="w-4 h-4 rounded-full flex items-center justify-center transition-colors"
              style={{ color: "var(--color-accent)" }}
              aria-label={`Remove ${c}`}
            >
              <span className="text-[14px] leading-none">×</span>
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setActiveIdx(0);
          }}
          onKeyDown={handleKey}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder={value.length === 0 ? placeholder : ""}
          className="flex-1 min-w-[120px] bg-transparent border-none outline-none text-sm"
          style={{
            color: "var(--color-text)",
            height: 26,
            lineHeight: "26px",
          }}
        />
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
            {filtered.length > 0 ? (
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
                {filtered.map((s, i) => (
                  <button
                    key={s}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      add(s);
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
                    <span>{highlightMatch(s, input)}</span>
                    {activeIdx === i && (
                      <span
                        className="font-mono text-[10.5px]"
                        style={{ color: "var(--color-accent)" }}
                      >
                        ↵
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ) : input.trim() && allowCustom ? (
              <div
                className="px-3.5 py-2.5 rounded-md text-sm"
                style={{
                  background: "#1A1612",
                  border: "1px solid var(--color-border-2)",
                  color: "var(--color-dim)",
                  boxShadow: "0 12px 32px rgba(0, 0, 0, 0.55)",
                }}
              >
                No match - press{" "}
                <kbd
                  className="font-mono text-[10.5px] px-1 py-px rounded"
                  style={{
                    background: "var(--color-surface-2)",
                    color: "var(--color-text)",
                  }}
                >
                  ↵
                </kbd>{" "}
                to add &quot;
                <span style={{ color: "var(--color-accent)" }}>
                  {input.trim()}
                </span>
                &quot;
              </div>
            ) : null}
          </div>,
          document.body,
        )}
    </div>
  );
}

function highlightMatch(text: string, query: string): React.ReactNode {
  const q = query.trim();
  if (!q) return text;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <span style={{ color: "var(--color-text)", fontWeight: 600 }}>
        {text.slice(idx, idx + q.length)}
      </span>
      {text.slice(idx + q.length)}
    </>
  );
}
