// PATCH /api/problems/[id] - update one problem in data/problems.json.
//
// This route writes the project's source JSON file. It only works when
// the filesystem is writable, which means it works in `next dev` and on
// self-hosted Node deployments but NOT on Vercel / hosted serverless
// (read-only fs). We refuse the write there and return 503.

import { NextResponse } from "next/server";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Problem } from "@/lib/schema";

const DATA_FILE = resolve(process.cwd(), "data/problems.json");

type Patch = Partial<
  Pick<Problem, "title" | "leetcodeUrl" | "difficulty" | "topics" | "companies">
>;

const VALID_DIFFICULTIES = new Set(["easy", "medium", "hard"]);

function isPatch(x: unknown): x is Patch {
  if (!x || typeof x !== "object") return false;
  const p = x as Record<string, unknown>;
  if (p.title !== undefined && typeof p.title !== "string") return false;
  if (p.leetcodeUrl !== undefined && typeof p.leetcodeUrl !== "string") return false;
  if (
    p.difficulty !== undefined &&
    (typeof p.difficulty !== "string" || !VALID_DIFFICULTIES.has(p.difficulty))
  ) return false;
  if (
    p.topics !== undefined &&
    (!Array.isArray(p.topics) || p.topics.some((t) => typeof t !== "string"))
  ) return false;
  if (
    p.companies !== undefined &&
    (!Array.isArray(p.companies) || p.companies.some((c) => typeof c !== "string"))
  ) return false;
  return true;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // Hosted builds use per-user localStorage overrides instead of writing the
  // catalog. Disable this route there so a misrouted client can't get a 503.
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json(
      { error: "Catalog edits are only writable in local dev." },
      { status: 404 },
    );
  }
  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!isPatch(body)) {
    return NextResponse.json({ error: "Invalid patch shape" }, { status: 400 });
  }
  const patch = body as Patch;

  let raw: string;
  try {
    raw = await readFile(DATA_FILE, "utf8");
  } catch (e) {
    return NextResponse.json(
      { error: `Cannot read data file: ${(e as Error).message}` },
      { status: 500 },
    );
  }
  let problems: Problem[];
  try {
    problems = JSON.parse(raw) as Problem[];
  } catch {
    return NextResponse.json({ error: "Data file is not valid JSON" }, { status: 500 });
  }

  const idx = problems.findIndex((p) => p.id === id);
  if (idx === -1) {
    return NextResponse.json({ error: `No problem with id ${id}` }, { status: 404 });
  }

  // Trim/dedupe arrays defensively so the file stays tidy.
  const cleanArr = (a?: string[]) =>
    a ? Array.from(new Set(a.map((s) => s.trim()).filter(Boolean))) : undefined;

  const updated: Problem = {
    ...problems[idx],
    ...(patch.title !== undefined ? { title: patch.title.trim() } : null),
    ...(patch.leetcodeUrl !== undefined ? { leetcodeUrl: patch.leetcodeUrl.trim() } : null),
    ...(patch.difficulty !== undefined ? { difficulty: patch.difficulty } : null),
    ...(patch.topics !== undefined ? { topics: cleanArr(patch.topics) ?? [] } : null),
    ...(patch.companies !== undefined ? { companies: cleanArr(patch.companies) ?? [] } : null),
  };
  problems[idx] = updated;

  try {
    await writeFile(DATA_FILE, JSON.stringify(problems));
  } catch (e) {
    return NextResponse.json(
      {
        error:
          `Cannot write data file: ${(e as Error).message}. ` +
          "If this is a hosted deployment, the filesystem is read-only and edits aren't supported there.",
      },
      { status: 503 },
    );
  }

  return NextResponse.json({ ok: true, problem: updated });
}
