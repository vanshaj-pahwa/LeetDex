"use client";

import {
  hintStreamWithGemini,
  pickWithGemini,
  summarizeWeekWithGemini,
  verifyGeminiKey,
} from "./gemini";
import {
  hintStreamWithOpenAI,
  pickWithOpenAI,
  summarizeWeekWithOpenAI,
  verifyOpenAIKey,
} from "./openai";
import {
  hintStreamWithAnthropic,
  pickWithAnthropic,
  summarizeWeekWithAnthropic,
  verifyAnthropicKey,
} from "./anthropic";
import type { Problem } from "../schema";
import type { buildHistorySummary, buildWeeklySummary } from "../recommend";

export type Provider = "gemini" | "openai" | "anthropic";

export type HintMode = "nudge" | "approach" | "complexity" | "code";

export type HintRequest = {
  provider: Provider;
  apiKey: string;
  problem: Problem;
  mode: HintMode;
  userContext?: string;       // free-text "I'm stuck on…"
  codeLanguage?: string;      // used by mode === "code" to pick the language
  problemStatement?: string;  // plain-text problem statement for grounding
};

export const PROVIDER_META: Record<
  Provider,
  { label: string; model: string; placeholder: string; getKeyUrl: string }
> = {
  gemini: {
    label: "Gemini",
    model: "gemini-3-flash-preview",
    placeholder: "AIza…",
    getKeyUrl: "https://aistudio.google.com/apikey",
  },
  openai: {
    label: "OpenAI",
    model: "gpt-4o-mini",
    placeholder: "sk-…",
    getKeyUrl: "https://platform.openai.com/api-keys",
  },
  anthropic: {
    label: "Anthropic",
    model: "claude-sonnet-4-6",
    placeholder: "sk-ant-…",
    getKeyUrl: "https://console.anthropic.com/settings/keys",
  },
};

export async function verifyKey(provider: Provider, apiKey: string): Promise<boolean> {
  switch (provider) {
    case "gemini":    return verifyGeminiKey(apiKey);
    case "openai":    return verifyOpenAIKey(apiKey);
    case "anthropic": return verifyAnthropicKey(apiKey);
  }
}

/** Streams AI hint output from the active provider. Calls `onChunk` for
 * every token-batch the provider returns. Resolves with the full text. */
export async function hintStream(
  req: HintRequest,
  onChunk: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  switch (req.provider) {
    case "gemini":    return hintStreamWithGemini(req, onChunk, signal);
    case "openai":    return hintStreamWithOpenAI(req, onChunk, signal);
    case "anthropic": return hintStreamWithAnthropic(req, onChunk, signal);
  }
}

/* ─── Next-pick (AI recommendation) ──────────────────────────────────── */

export type PickRequest = {
  provider: Provider;
  apiKey: string;
  summary: ReturnType<typeof buildHistorySummary>;
};

export type PickResult = {
  problemId: string;
  reason: string;
};

export async function pickNext(req: PickRequest): Promise<PickResult> {
  switch (req.provider) {
    case "gemini":    return pickWithGemini(req);
    case "openai":    return pickWithOpenAI(req);
    case "anthropic": return pickWithAnthropic(req);
  }
}

export function buildPickPrompt(
  summary: ReturnType<typeof buildHistorySummary>,
): string {
  const targeting =
    summary.targetCompanies.length > 0
      ? `The user is actively prepping for: ${summary.targetCompanies.join(", ")}. Strongly prefer problems asked at these companies.`
      : "";

  return [
    "You are picking the next LeetCode problem for someone preparing for technical interviews.",
    "Choose ONE problem from the candidates that best stretches them: target a topic or company where their coverage is low, at a difficulty one notch above their average.",
    targeting,
    "Vary your pick across calls so the user doesn't see the same problem repeatedly when their state has barely changed.",
    "",
    "Their history:",
    JSON.stringify(
      {
        solvedTotal: summary.stats.solved,
        byDifficulty: summary.stats.byDifficulty,
        weakestTopics: summary.topics.slice(0, 6),
        weakestCompanies: summary.companies.slice(0, 6),
        recentlySolved: summary.recent,
        targetingCompanies: summary.targetCompanies,
      },
      null,
      2,
    ),
    "",
    "Candidates (you MUST pick one of these by id):",
    JSON.stringify(summary.candidates, null, 2),
    "",
    'Respond with ONLY a JSON object of the form: {"problemId": "<exact id from candidates>", "reason": "<one short sentence, no em-dashes, no hyphens-as-separator>"}.',
    "No prose, no markdown fences.",
  ]
    .filter(Boolean)
    .join("\n");
}

/* ─── Weekly summary (AI digest) ────────────────────────────────────── */

export type WeeklySummaryRequest = {
  provider: Provider;
  apiKey: string;
  summary: ReturnType<typeof buildWeeklySummary>;
};

export type WeeklySummaryResult = {
  summary: string;       // "You solved 4 problems (2 graphs, 1 DP)."
  coverageGap: string;   // "Sliding window is your thinnest area..."
  focus: string;         // "This week, try 2-3 sliding window problems."
};

export async function summarizeWeek(
  req: WeeklySummaryRequest,
): Promise<WeeklySummaryResult> {
  switch (req.provider) {
    case "gemini":    return summarizeWeekWithGemini(req);
    case "openai":    return summarizeWeekWithOpenAI(req);
    case "anthropic": return summarizeWeekWithAnthropic(req);
  }
}

export function buildWeekSummaryPrompt(
  s: ReturnType<typeof buildWeeklySummary>,
): string {
  return [
    "You are writing a short, calm weekly digest for someone practicing for technical interviews.",
    "Produce three concise lines: what they did this week, where their biggest coverage gap is, and what to focus on next.",
    "Be specific (cite numbers from the data). No platitudes. Do not use em-dashes or hyphens as sentence separators.",
    "",
    "Their data:",
    JSON.stringify(
      {
        weekStarting: s.weekStartIso,
        solvedThisWeek: {
          count: s.countThisWeek,
          byDifficulty: s.byDifficulty,
          byTopic: s.topicCountsThisWeek,
          titles: s.solvedThisWeek.map((p) => `${p.number}. ${p.title}`),
        },
        coverage: {
          totalSolvedAllTime: s.totalSolvedAllTime,
          totalProblems: s.totalProblems,
          weakestTopics: s.topicGaps,
          weakestCompanies: s.companyGaps,
        },
      },
      null,
      2,
    ),
    "",
    'Respond with ONLY a JSON object: {"summary": "<one sentence>", "coverageGap": "<one sentence>", "focus": "<one sentence>"}.',
    "Each value should be 1 sentence, max ~22 words. No prose outside the JSON, no markdown fences.",
  ].join("\n");
}

export function parseWeekSummaryResponse(raw: string): WeeklySummaryResult {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  let obj: unknown;
  try {
    obj = JSON.parse(cleaned);
  } catch {
    throw new Error(`AI returned non-JSON: ${cleaned.slice(0, 120)}`);
  }
  const o = obj as Partial<WeeklySummaryResult>;
  if (!o?.summary || !o?.coverageGap || !o?.focus) {
    throw new Error("Weekly summary missing required fields");
  }
  return {
    summary: String(o.summary).trim(),
    coverageGap: String(o.coverageGap).trim(),
    focus: String(o.focus).trim(),
  };
}

export function parsePickResponse(
  raw: string,
  candidateIds: string[],
): PickResult {
  // Strip any code fences the model wrapped the JSON in.
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  let obj: unknown;
  try {
    obj = JSON.parse(cleaned);
  } catch {
    throw new Error(`AI returned non-JSON: ${cleaned.slice(0, 120)}`);
  }
  const o = obj as { problemId?: string; reason?: string };
  if (!o?.problemId || typeof o.problemId !== "string") {
    throw new Error("AI response missing problemId");
  }
  if (!candidateIds.includes(o.problemId)) {
    throw new Error(`AI picked an id outside the candidate set: ${o.problemId}`);
  }
  return {
    problemId: o.problemId,
    reason: (o.reason ?? "").toString().trim() || "AI pick",
  };
}

/** System+user prompt used by every provider. Returns markdown. */
export function buildHintPrompt(req: HintRequest): string {
  const { problem, mode, userContext, problemStatement } = req;
  const modeRubric: Record<HintMode, string> = {
    nudge: [
      "Give ONE small nudge - a question or observation that points the user toward the right pattern without revealing the algorithm.",
      "Keep it to 2-4 sentences. No code. No headings.",
    ].join(" "),
    approach: [
      "Walk through the canonical approach as a numbered list of steps.",
      "Name the pattern (e.g., 'sliding window', 'monotonic stack') in **bold**.",
      "Do not include code. End with the time/space complexity.",
    ].join(" "),
    complexity: [
      "Explain time and space complexity for the standard solution(s).",
      "If multiple approaches exist (naive vs optimal), compare them in a short table.",
    ].join(" "),
    code: ((): string => {
      const lang = req.codeLanguage || "Python";
      const tag = lang.toLowerCase();
      return [
        `Output ${lang} solutions structured as 2 or 3 sections.`,
        `Always include: "### Brute force" (the naive approach) and "### Optimal" (the standard interview-expected solution).`,
        `Also include "### Best" ONLY if there is a meaningfully better further optimization beyond Optimal (e.g. constant-space variant, bit/math trick, in-place modification, single-pass). Omit "### Best" entirely if it would be identical or trivially different from Optimal.`,
        `Each solution MUST be a complete, runnable function: handle all paths and ALWAYS include an explicit fallback return after every loop or branch (e.g. \`return []\`, \`return -1\`, \`return null\`, \`return new int[0]\`, \`return ""\` depending on the return type) so the function never falls off the end without a return value, even when LeetCode's problem statement guarantees a solution exists.`,
        `Match the canonical LeetCode signature for the problem (correct method/class name, parameter names and types, return type).`,
        `For EACH section: write the "###" heading, then a fenced code block tagged \`\`\`${tag}, then exactly one line of "Time: O(...) Space: O(...)" immediately after the code block.`,
        `Above each function, add a short comment naming the pattern used.`,
        `Do not write any extra prose between sections; the headings + code + complexity line ARE the answer.`,
      ].join(" ");
    })(),
  };
  // Trim absurdly long statements so we don't blow the prompt budget.
  const trimmedStatement = problemStatement
    ? problemStatement.slice(0, 6000)
    : "";
  return [
    `You are helping a user practice for technical interviews. Problem:`,
    ``,
    `**LeetCode ${problem.leetcodeNumber}. ${problem.title}**`,
    `Difficulty: ${problem.difficulty}.  URL: ${problem.leetcodeUrl}`,
    ``,
    trimmedStatement ? `Problem statement (verbatim from LeetCode):` : ``,
    trimmedStatement ? "```" : ``,
    trimmedStatement,
    trimmedStatement ? "```" : ``,
    trimmedStatement ? `` : ``,
    `Task: ${modeRubric[mode]}`,
    ``,
    userContext ? `The user adds: "${userContext}"` : ``,
    ``,
    `Output: GitHub-flavored markdown only. Do NOT use em dashes.`,
  ]
    .filter(Boolean)
    .join("\n");
}
