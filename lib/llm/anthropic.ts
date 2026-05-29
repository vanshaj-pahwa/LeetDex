"use client";

import {
  buildHintPrompt,
  buildPickPrompt,
  buildWeekSummaryPrompt,
  parsePickResponse,
  parseWeekSummaryResponse,
  type HintRequest,
  type PickRequest,
  type PickResult,
  type WeeklySummaryRequest,
  type WeeklySummaryResult,
} from "./router";

/**
 * Direct fetch - the @anthropic-ai/sdk pulls in node:fs/promises via its
 * agent-toolset and Turbopack can't bundle it for the browser.
 */
const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";

async function callAnthropic(opts: {
  apiKey: string;
  model: string;
  maxTokens: number;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  temperature?: number;
}): Promise<string> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "x-api-key": opts.apiKey,
      "anthropic-version": API_VERSION,
      "anthropic-dangerous-direct-browser-access": "true",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens,
      temperature: opts.temperature ?? 0.4,
      messages: opts.messages,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  const block = data?.content?.[0];
  if (!block || block.type !== "text") {
    throw new Error("Anthropic returned no text content");
  }
  return block.text as string;
}

export async function verifyAnthropicKey(apiKey: string): Promise<boolean> {
  try {
    await callAnthropic({
      apiKey,
      model: "claude-haiku-4-5",
      maxTokens: 4,
      messages: [{ role: "user", content: "ping" }],
    });
    return true;
  } catch (e) {
    console.error("Anthropic verify failed:", e);
    return false;
  }
}

export async function hintStreamWithAnthropic(
  req: HintRequest,
  onChunk: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetch(API_URL, {
    method: "POST",
    signal,
    headers: {
      "x-api-key": req.apiKey,
      "anthropic-version": API_VERSION,
      "anthropic-dangerous-direct-browser-access": "true",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      temperature: 0.4,
      stream: true,
      messages: [{ role: "user", content: buildHintPrompt(req) }],
    }),
  });
  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    throw new Error(`Anthropic ${res.status}: ${body.slice(0, 300)}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const evt = JSON.parse(payload);
        if (
          evt.type === "content_block_delta" &&
          evt.delta?.type === "text_delta" &&
          typeof evt.delta.text === "string"
        ) {
          full += evt.delta.text;
          onChunk(evt.delta.text);
        }
      } catch {
        // ignore malformed SSE chunks
      }
    }
  }
  return full;
}

export async function pickWithAnthropic(req: PickRequest): Promise<PickResult> {
  const raw = await callAnthropic({
    apiKey: req.apiKey,
    model: "claude-sonnet-4-6",
    maxTokens: 512,
    temperature: 0.55,
    messages: [
      {
        role: "user",
        content:
          buildPickPrompt(req.summary) +
          "\n\nReturn ONLY the JSON object. No prose, no markdown fences.",
      },
    ],
  });
  return parsePickResponse(
    raw,
    req.summary.candidates.map((c) => c.id),
  );
}

export async function summarizeWeekWithAnthropic(
  req: WeeklySummaryRequest,
): Promise<WeeklySummaryResult> {
  const raw = await callAnthropic({
    apiKey: req.apiKey,
    model: "claude-sonnet-4-6",
    maxTokens: 512,
    temperature: 0.4,
    messages: [
      {
        role: "user",
        content:
          buildWeekSummaryPrompt(req.summary) +
          "\n\nReturn ONLY the JSON object. No prose, no markdown fences.",
      },
    ],
  });
  return parseWeekSummaryResponse(raw);
}
