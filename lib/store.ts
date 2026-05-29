"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Attempt, Difficulty, Status } from "./schema";

/* Per-problem edit override. Only the fields the EditProblemModal lets the
 * user change live here; the catalog stays the source for everything else.
 * In hosted builds this is the only edit path (filesystem is read-only),
 * so saved overrides survive across reloads via persist. */
export type ProblemOverride = {
  title?: string;
  leetcodeUrl?: string;
  difficulty?: Difficulty;
  topics?: string[];
  companies?: string[];
};

export type Provider = "gemini" | "openai" | "anthropic";

type Keys = {
  gemini?: string;
  openai?: string;
  anthropic?: string;
};

type WeeklyDigest = {
  summary: string;
  coverageGap: string;
  focus: string;
};

type State = {
  name?: string;

  keys: Keys;
  activeProvider: Provider;

  // problemId -> Attempt
  attempts: Record<string, Attempt>;

  /** Per-problem field overrides applied on top of the shipped catalog.
   * Empty by default; populated only when the user uses the Edit modal in
   * hosted builds (npm run dev edits go to the JSON file directly). */
  problemOverrides: Record<string, ProblemOverride>;

  /** Companies the user is actively prepping for. Biases the AI Up-next pick
   * toward problems asked at these companies. Empty array = no preference. */
  targetCompanies: string[];

  /** Preferred language for AI-generated code (Code mode in the hint panel).
   * Persists until the user clears it. */
  codeLanguage?: string;

  /** Cached AI weekly digest. Keyed by (weekKey + provider + solve-hash) so it
   * invalidates when the week rolls over or when the user solves something. */
  weeklyDigestCacheKey?: string;
  weeklyDigest?: WeeklyDigest;
  weeklyDigestAt?: string;

  /** Cached AI Up-next pick. Keyed by (provider + solved-set + targets) so it
   * survives page reloads. Cleared on Refresh or when the user solves. */
  upNextPickCacheKey?: string;
  upNextPick?: { problemId: string; reason: string };
  upNextPickAt?: string;

  // sticky UI state - survives reloads, doesn't grow.
  filters: {
    difficulties: string[];   // ["easy","medium","hard"]
    companies: string[];
    topics: string[];
    /* Multi-select recency window. Empty = no filter. A problem matches if
     * ANY of its (problem, company) pairs falls in one of the selected
     * recency buckets — and if a company filter is also active, the
     * intersection (company + bucket) must be non-empty. */
    recency: string[];        // subset of Recency values
    status: Status | "all";
    search: string;
    sort: "number" | "difficulty" | "title" | "status";
  };

  setName: (name: string | undefined) => void;
  setKey: (provider: Provider, key: string | undefined) => void;
  setActiveProvider: (provider: Provider) => void;

  setStatus: (problemId: string, status: Status, notes?: string) => void;
  clearAttempt: (problemId: string) => void;
  patchAttempt: (problemId: string, patch: Partial<Attempt>) => void;

  setFilters: (patch: Partial<State["filters"]>) => void;
  resetFilters: () => void;

  setTargetCompanies: (companies: string[]) => void;

  saveProblemOverride: (problemId: string, patch: ProblemOverride) => void;
  clearProblemOverride: (problemId: string) => void;

  setCodeLanguage: (lang: string | undefined) => void;

  setWeeklyDigest: (key: string, digest: WeeklyDigest) => void;

  setUpNextPick: (key: string, pick: { problemId: string; reason: string }) => void;
  clearUpNextPick: () => void;

  hasAnyKey: () => boolean;
  activeKey: () => string | undefined;
};

const DEFAULT_FILTERS: State["filters"] = {
  difficulties: [],
  companies: [],
  topics: [],
  recency: [],
  status: "all",
  search: "",
  sort: "number",
};

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      keys: {},
      activeProvider: "gemini",
      attempts: {},
      problemOverrides: {},
      filters: DEFAULT_FILTERS,
      targetCompanies: [],

      setName: (name) => set({ name: name?.trim() || undefined }),

      setKey: (provider, key) =>
        set((s) => ({ keys: { ...s.keys, [provider]: key || undefined } })),

      setActiveProvider: (provider) => set({ activeProvider: provider }),

      setStatus: (problemId, status, notes) =>
        set((s) => {
          const now = new Date().toISOString();
          const prev = s.attempts[problemId];
          const next: Attempt = {
            problemId,
            status,
            attemptedAt: prev?.attemptedAt ?? now,
            solvedAt: status === "solved" ? prev?.solvedAt ?? now : prev?.solvedAt,
            notes: notes ?? prev?.notes,
          };
          return { attempts: { ...s.attempts, [problemId]: next } };
        }),

      clearAttempt: (problemId) =>
        set((s) => {
          const next = { ...s.attempts };
          delete next[problemId];
          return { attempts: next };
        }),

      patchAttempt: (problemId, patch) =>
        set((s) => {
          const prev = s.attempts[problemId];
          if (!prev) return s;
          return {
            attempts: { ...s.attempts, [problemId]: { ...prev, ...patch } },
          };
        }),

      setFilters: (patch) =>
        set((s) => ({ filters: { ...s.filters, ...patch } })),

      resetFilters: () => set({ filters: DEFAULT_FILTERS }),

      setTargetCompanies: (companies) =>
        set({
          targetCompanies: Array.from(new Set(companies.map((c) => c.trim()).filter(Boolean))),
        }),

      setCodeLanguage: (lang) =>
        set({ codeLanguage: lang?.trim() || undefined }),

      saveProblemOverride: (problemId, patch) =>
        set((s) => ({
          problemOverrides: {
            ...s.problemOverrides,
            [problemId]: { ...s.problemOverrides[problemId], ...patch },
          },
        })),

      clearProblemOverride: (problemId) =>
        set((s) => {
          const next = { ...s.problemOverrides };
          delete next[problemId];
          return { problemOverrides: next };
        }),

      setWeeklyDigest: (key, digest) =>
        set({
          weeklyDigestCacheKey: key,
          weeklyDigest: digest,
          weeklyDigestAt: new Date().toISOString(),
        }),

      setUpNextPick: (key, pick) =>
        set({
          upNextPickCacheKey: key,
          upNextPick: pick,
          upNextPickAt: new Date().toISOString(),
        }),

      clearUpNextPick: () =>
        set({
          upNextPickCacheKey: undefined,
          upNextPick: undefined,
          upNextPickAt: undefined,
        }),

      hasAnyKey: () => {
        const k = get().keys;
        return !!(k.gemini || k.openai || k.anthropic);
      },

      activeKey: () => {
        const s = get();
        return s.keys[s.activeProvider];
      },
    }),
    {
      name: "leetdex-store-v1",
      storage: createJSONStorage(() => localStorage),
      // Don't persist the static problem catalog - it lives in /data and is
      // imported synchronously. Only persist user-owned state.
      partialize: (s) => ({
        name: s.name,
        keys: s.keys,
        activeProvider: s.activeProvider,
        attempts: s.attempts,
        problemOverrides: s.problemOverrides,
        filters: s.filters,
        targetCompanies: s.targetCompanies,
        codeLanguage: s.codeLanguage,
        weeklyDigestCacheKey: s.weeklyDigestCacheKey,
        weeklyDigest: s.weeklyDigest,
        weeklyDigestAt: s.weeklyDigestAt,
      }),
      // Deep-merge the persisted slice into current defaults so newly-added
      // fields (e.g. filters.topics, filters.sort) don't crash old sessions.
      // Also migrate legacy "attempted" / "reviewed" attempt statuses into
      // the simplified "unsolved" / "solved" scheme.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<State>;
        const migratedAttempts: Record<string, Attempt> = {};
        if (p.attempts) {
          for (const [id, a] of Object.entries(p.attempts)) {
            const raw = (a as Attempt).status as string;
            const status: Status =
              raw === "solved" || raw === "reviewed" ? "solved" : "unsolved";
            migratedAttempts[id] = { ...(a as Attempt), status };
          }
        }
        const filters = { ...current.filters, ...(p.filters ?? {}) };
        // Migrate filter.status too in case it was set to attempted/reviewed.
        if (
          filters.status !== "all" &&
          filters.status !== "solved" &&
          filters.status !== "unsolved"
        ) {
          filters.status = "all";
        }
        // Drop legacy "acceptance" sort which no longer exists.
        if (!["number", "difficulty", "title", "status"].includes(filters.sort as string)) {
          filters.sort = "number";
        }
        // Recency filter was added later; old sessions won't have it.
        if (!Array.isArray(filters.recency)) {
          filters.recency = [];
        }
        return {
          ...current,
          ...p,
          attempts: p.attempts ? migratedAttempts : current.attempts,
          problemOverrides: p.problemOverrides ?? {},
          filters,
          keys: { ...current.keys, ...(p.keys ?? {}) },
        };
      },
    },
  ),
);
