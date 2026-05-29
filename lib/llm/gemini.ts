"use client";

import { GoogleGenerativeAI } from "@google/generative-ai";
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

export async function verifyGeminiKey(apiKey: string): Promise<boolean> {
  try {
    const client = new GoogleGenerativeAI(apiKey);
    const model = client.getGenerativeModel({ model: "gemini-3-flash-preview" });
    const res = await model.generateContent("ping");
    return !!res.response.text();
  } catch (e) {
    console.error("Gemini verify failed:", e);
    return false;
  }
}

export async function hintStreamWithGemini(
  req: HintRequest,
  onChunk: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const client = new GoogleGenerativeAI(req.apiKey);
  const model = client.getGenerativeModel({
    model: "gemini-3-flash-preview",
    generationConfig: { temperature: 0.4 },
  });
  const res = await model.generateContentStream(buildHintPrompt(req));
  let full = "";
  for await (const chunk of res.stream) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const text = chunk.text();
    if (text) {
      full += text;
      onChunk(text);
    }
  }
  return full;
}

export async function pickWithGemini(req: PickRequest): Promise<PickResult> {
  const client = new GoogleGenerativeAI(req.apiKey);
  const model = client.getGenerativeModel({
    model: "gemini-3-flash-preview",
    generationConfig: {
      temperature: 0.55,
      responseMimeType: "application/json",
    },
  });
  const res = await model.generateContent(buildPickPrompt(req.summary));
  const raw = res.response.text();
  return parsePickResponse(
    raw,
    req.summary.candidates.map((c) => c.id),
  );
}

export async function summarizeWeekWithGemini(
  req: WeeklySummaryRequest,
): Promise<WeeklySummaryResult> {
  const client = new GoogleGenerativeAI(req.apiKey);
  const model = client.getGenerativeModel({
    model: "gemini-3-flash-preview",
    generationConfig: {
      temperature: 0.4,
      responseMimeType: "application/json",
    },
  });
  const res = await model.generateContent(buildWeekSummaryPrompt(req.summary));
  return parseWeekSummaryResponse(res.response.text());
}
