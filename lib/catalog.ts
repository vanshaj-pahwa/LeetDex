import problemsJson from "@/data/problems.json";
import companiesJson from "@/data/companies.json";
import statsJson from "@/data/stats.json";
import type { CompanyEntry, Problem, Stats } from "./schema";
import type { ProblemOverride } from "./store";

export const PROBLEMS: Problem[] = problemsJson as Problem[];
export const COMPANIES: CompanyEntry[] = companiesJson as CompanyEntry[];
export const STATS: Stats = statsJson as Stats;

const BY_ID = new Map(PROBLEMS.map((p) => [p.id, p]));
export function getProblem(id: string): Problem | undefined {
  return BY_ID.get(id);
}

/* Merge a per-user override on top of the shipped catalog entry. Used by
 * the Problems list and the detail page so a localStorage edit shows up
 * immediately without touching the source JSON. */
export function applyOverride(
  problem: Problem,
  override: ProblemOverride | undefined,
): Problem {
  if (!override) return problem;
  return {
    ...problem,
    ...(override.title !== undefined ? { title: override.title } : null),
    ...(override.leetcodeUrl !== undefined
      ? { leetcodeUrl: override.leetcodeUrl }
      : null),
    ...(override.difficulty !== undefined
      ? { difficulty: override.difficulty }
      : null),
    ...(override.topics !== undefined ? { topics: override.topics } : null),
    ...(override.companies !== undefined
      ? { companies: override.companies }
      : null),
  };
}
