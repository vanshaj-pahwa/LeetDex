"use client";

import OpenAI from "openai";
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

function client(apiKey: string) {
  return new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
}

export async function verifyOpenAIKey(apiKey: string): Promise<boolean> {
  try {
    await client(apiKey).models.list();
    return true;
  } catch (e) {
    console.error("OpenAI verify failed:", e);
    return false;
  }
}

export async function hintStreamWithOpenAI(
  req: HintRequest,
  onChunk: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const stream = await client(req.apiKey).chat.completions.create(
    {
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: buildHintPrompt(req) }],
      temperature: 0.4,
      stream: true,
    },
    signal ? { signal } : undefined,
  );
  let full = "";
  for await (const chunk of stream) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) {
      full += delta;
      onChunk(delta);
    }
  }
  return full;
}

export async function pickWithOpenAI(req: PickRequest): Promise<PickResult> {
  const res = await client(req.apiKey).chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: buildPickPrompt(req.summary) }],
    response_format: { type: "json_object" },
    temperature: 0.55,
  });
  const raw = res.choices[0]?.message?.content ?? "";
  return parsePickResponse(
    raw,
    req.summary.candidates.map((c) => c.id),
  );
}

export async function summarizeWeekWithOpenAI(
  req: WeeklySummaryRequest,
): Promise<WeeklySummaryResult> {
  const res = await client(req.apiKey).chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: buildWeekSummaryPrompt(req.summary) }],
    response_format: { type: "json_object" },
    temperature: 0.4,
  });
  return parseWeekSummaryResponse(res.choices[0]?.message?.content ?? "");
}
