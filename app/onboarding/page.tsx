"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { PROVIDER_META, verifyKey, type Provider } from "@/lib/llm/router";

type Status = "idle" | "ok" | "fail" | "verifying";

const PROVIDERS: { id: Provider; description: string; recommended?: boolean }[] = [
  {
    id: "gemini",
    description: "Most cost-effective. Great for hints and complexity walks.",
    recommended: true,
  },
  { id: "openai", description: "GPT-4o-mini. Crisp explanations." },
  {
    id: "anthropic",
    description: "Claude. Strongest for stepwise reasoning and edge cases.",
  },
];

export default function OnboardingPage() {
  const router = useRouter();

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const storeName = useStore((s) => s.name);
  const setName = useStore((s) => s.setName);
  const keys = useStore((s) => s.keys);
  const activeProvider = useStore((s) => s.activeProvider);
  const setKey = useStore((s) => s.setKey);
  const setActiveProvider = useStore((s) => s.setActiveProvider);

  const [nameDraft, setNameDraft] = useState("");
  useEffect(() => {
    if (mounted) setNameDraft(storeName ?? "");
  }, [mounted, storeName]);

  const isExisting = !!storeName;
  // Whether the name field has actually changed since the last save. Only
  // governs whether we call setName; the CTA itself is always enabled now
  // since both name and AI key are optional.
  const nameChanged = nameDraft.trim() !== (storeName ?? "");

  function handleSaveAndContinue() {
    if (nameChanged) setName(nameDraft.trim() || undefined);
    router.push("/");
  }

  if (!mounted) return null;

  return (
    <>
      <header
        className="flex items-center gap-3 px-6 md:px-8 py-5 md:py-6"
        style={{ borderBottom: "1px solid var(--color-border)" }}
      >
        <Link href={isExisting ? "/" : "#"} className="flex items-center gap-2.5">
          <div
            className="w-2.5 h-2.5 rounded-full"
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
        </Link>
        {isExisting && (
          <Link
            href="/"
            className="ml-auto inline-flex items-center gap-1.5 text-[12.5px] font-medium px-3 py-1.5 rounded-md transition-colors"
            style={{
              color: "var(--color-text-2)",
              background: "var(--color-surface)",
              border: "1px solid var(--color-border-2)",
            }}
          >
            <span style={{ fontFamily: "var(--font-mono)" }}>←</span> Back to app
          </Link>
        )}
      </header>

      <main className="max-w-[580px] mx-auto px-6 py-14 pb-20">
        {isExisting && (
          <div
            className="font-mono text-[11px] mb-3.5"
            style={{
              color: "var(--color-accent)",
              letterSpacing: "0.16em",
              textTransform: "uppercase",
            }}
          >
            Settings
          </div>
        )}
        <h1
          className="font-display font-medium m-0 mb-3.5"
          style={{
            fontSize: 42,
            lineHeight: 1.05,
            letterSpacing: "-0.03em",
          }}
        >
          {isExisting ? (
            <>
              Update your <span style={{ color: "var(--color-accent)" }}>setup.</span>
            </>
          ) : (
            <>
              Welcome to <span style={{ color: "var(--color-accent)" }}>LeetDex.</span>
            </>
          )}
        </h1>
        <p
          className="m-0 mb-10 text-[16px] leading-[1.55]"
          style={{ color: "var(--color-text-2)" }}
        >
          {isExisting
            ? "Update your name or swap which AI provider is active. Changes save instantly."
            : "A LeetCode problem tracker, organized by company. Both your name and the AI provider are optional. Add either anytime; this page is always reachable from the avatar in the topbar."}
        </p>

        {/* Step 1 - Name */}
        <SectionLabel step="01" title="Your name" optional />
        <div
          className="px-5 py-5 rounded-xl mb-8 fade-up"
          style={{
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
          }}
        >
          <input
            type="text"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSaveAndContinue();
            }}
            placeholder="What should we call you?"
            autoFocus={!isExisting}
            className="w-full px-4 py-3 rounded-md text-[15px] outline-none transition-colors"
            style={{
              background: "var(--color-bg-warm)",
              border: "1px solid var(--color-border-2)",
              color: "var(--color-text)",
            }}
          />
          <p className="m-0 mt-3 text-[11.5px]" style={{ color: "var(--color-dim)" }}>
            Just for the greeting and your avatar. Stays in your browser.
          </p>
        </div>

        {/* Step 2 - AI key (optional) */}
        <SectionLabel step="02" title="AI provider" optional />
        <p
          className="m-0 mb-3 text-[13px]"
          style={{ color: "var(--color-dim)" }}
        >
          Optional. Skip and add one later from this page. Without a key you still get the full catalog, filters, and progress tracking.
        </p>
        {PROVIDERS.map((p) => (
          <ProviderCard
            key={p.id}
            id={p.id}
            description={p.description}
            recommended={p.recommended}
            connected={!!keys[p.id]}
            active={activeProvider === p.id}
            existingKey={keys[p.id] ?? ""}
            onSetActive={() => setActiveProvider(p.id)}
            onSave={(k) => setKey(p.id, k)}
            onClear={() => setKey(p.id, undefined)}
          />
        ))}

        <div
          className="flex gap-3.5 px-5 py-4 rounded-xl mb-10 fade-up mt-2"
          style={{
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            animationDelay: "300ms",
          }}
        >
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-[13px]"
            style={{
              background: "var(--color-accent-soft)",
              color: "var(--color-accent)",
            }}
          >
            ◆
          </div>
          <div
            className="text-[13px] leading-[1.55]"
            style={{ color: "var(--color-text-2)" }}
          >
            <strong style={{ color: "var(--color-text)", fontWeight: 500 }}>
              Keys never leave your machine.
            </strong>{" "}
            Stored in browser localStorage. Hints stream straight from your provider to your browser. Nothing routes through any server.
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 fade-up">
          <button
            onClick={handleSaveAndContinue}
            className="px-5 py-2.5 text-[13.5px] font-medium rounded-md transition-all"
            style={{
              background: "var(--color-accent)",
              color: "#1A0F08",
            }}
          >
            {isExisting
              ? nameChanged
                ? "Save changes"
                : "Done"
              : "Get started →"}
          </button>
        </div>
      </main>
    </>
  );
}

function SectionLabel({
  step,
  title,
  required = false,
  optional = false,
}: {
  step: string;
  title: string;
  required?: boolean;
  optional?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-3 mb-3">
      <span
        className="font-mono text-[11px]"
        style={{
          color: "var(--color-accent)",
          letterSpacing: "0.14em",
        }}
      >
        {step}
      </span>
      <span
        className="font-display font-medium text-[17px]"
        style={{ letterSpacing: "-0.015em" }}
      >
        {title}
      </span>
      {required && (
        <span
          className="font-mono text-[10px] px-1.5 py-0.5 rounded"
          style={{
            background: "var(--color-accent-soft)",
            color: "var(--color-accent)",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          Required
        </span>
      )}
      {optional && (
        <span
          className="font-mono text-[10px] px-1.5 py-0.5 rounded"
          style={{
            background: "var(--color-surface-2)",
            color: "var(--color-dim)",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          Optional
        </span>
      )}
    </div>
  );
}

function ProviderCard({
  id,
  description,
  recommended,
  connected,
  active,
  existingKey,
  onSetActive,
  onSave,
  onClear,
}: {
  id: Provider;
  description: string;
  recommended?: boolean;
  connected: boolean;
  active: boolean;
  existingKey: string;
  onSetActive: () => void;
  onSave: (k: string) => void;
  onClear: () => void;
}) {
  const meta = PROVIDER_META[id];
  const [value, setValue] = useState(existingKey);
  const [status, setStatus] = useState<Status>(connected ? "ok" : "idle");
  const [error, setError] = useState<string>("");

  async function handleVerify() {
    if (!value.trim()) return;
    setStatus("verifying");
    setError("");
    const ok = await verifyKey(id, value.trim());
    if (ok) {
      onSave(value.trim());
      onSetActive();
      setStatus("ok");
    } else {
      setStatus("fail");
      setError(`Key didn't work. Check it at ${meta.getKeyUrl}`);
    }
  }

  function handleClear() {
    onClear();
    setValue("");
    setStatus("idle");
  }

  const statusText =
    status === "ok"
      ? `● verified · ${meta.model}`
      : status === "fail"
        ? "× verify failed"
        : status === "verifying"
          ? "verifying…"
          : "Not connected";

  const statusColor =
    status === "ok"
      ? "var(--color-green)"
      : status === "fail"
        ? "var(--color-red)"
        : "var(--color-dim)";

  return (
    <div
      className="px-5 py-5 rounded-xl mb-2.5 fade-up transition-all"
      style={{
        background: active
          ? "linear-gradient(135deg, rgba(224, 164, 88, 0.05), transparent 70%)"
          : connected
            ? "linear-gradient(135deg, rgba(123, 196, 164, 0.04), transparent 70%)"
            : "var(--color-surface)",
        border: `1px solid ${
          active
            ? "rgba(224, 164, 88, 0.35)"
            : connected
              ? "rgba(123, 196, 164, 0.18)"
              : "var(--color-border)"
        }`,
      }}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap justify-between items-baseline mb-1 gap-x-3 gap-y-1">
          <div className="flex items-baseline gap-2 flex-wrap">
            <div
              className="font-display font-medium text-base"
              style={{ letterSpacing: "-0.015em" }}
            >
              {meta.label}
            </div>
            {recommended && (
              <span
                className="font-mono text-[10px] px-1.5 py-0.5 rounded"
                style={{
                  background: "var(--color-accent-soft)",
                  color: "var(--color-accent)",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                Recommended
              </span>
            )}
            {active && connected && (
              <span
                className="font-mono text-[10px] px-1.5 py-0.5 rounded"
                style={{
                  background: "var(--color-accent-soft)",
                  color: "var(--color-accent)",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                Active
              </span>
            )}
          </div>
          <div
            className="font-mono text-[10.5px] truncate"
            style={{
              color: statusColor,
              letterSpacing: "0.02em",
              maxWidth: "100%",
            }}
            title={statusText}
          >
            {statusText}
          </div>
        </div>
        <div
          className="text-[12.5px] leading-[1.5] mb-3"
          style={{ color: "var(--color-dim)" }}
        >
          {description}{" "}
          <a
            href={meta.getKeyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
            style={{ color: "var(--color-dim)" }}
          >
            Get a key →
          </a>
        </div>
        <div className="flex gap-2">
          <input
            type="password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={meta.placeholder}
            className="flex-1 px-3 py-2.5 rounded-md font-mono text-[12.5px] outline-none transition-colors"
            style={{
              background: "var(--color-bg-warm)",
              border: `1px solid ${
                status === "fail" ? "var(--color-red)" : "var(--color-border-2)"
              }`,
              color: "var(--color-text)",
              letterSpacing: "0.02em",
            }}
          />
          {connected && !active && (
            <button
              onClick={onSetActive}
              className="px-3 py-2.5 rounded-md text-[12.5px] font-medium"
              style={{
                background: "var(--color-surface-2)",
                border: "1px solid var(--color-border-2)",
                color: "var(--color-accent)",
              }}
            >
              Use this
            </button>
          )}
          {connected ? (
            <button
              onClick={handleClear}
              className="px-3 py-2.5 rounded-md text-[12.5px] font-medium"
              style={{
                background: "transparent",
                border: "1px solid var(--color-border-2)",
                color: "var(--color-dim)",
              }}
            >
              Clear
            </button>
          ) : (
            <button
              onClick={handleVerify}
              disabled={!value.trim() || status === "verifying"}
              className="px-4 py-2.5 rounded-md text-[12.5px] font-medium transition-all"
              style={{
                background: "var(--color-surface-2)",
                border: "1px solid var(--color-border-2)",
                color: "var(--color-text-2)",
                opacity: !value.trim() ? 0.5 : 1,
                cursor: status === "verifying" ? "wait" : "pointer",
              }}
            >
              {status === "verifying" ? "Verifying…" : "Verify"}
            </button>
          )}
        </div>
        {error && (
          <div className="mt-2 text-[11.5px]" style={{ color: "var(--color-red)" }}>
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
