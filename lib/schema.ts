export type Difficulty = "easy" | "medium" | "hard";

export type Status = "unsolved" | "solved";

/* Per-(problem, company) recency, from tightest bucket to oldest. */
export type Recency = "last30d" | "last3m" | "last6m" | "last1y" | "older";

export const RECENCY_ORDER: Recency[] = [
  "last30d",
  "last3m",
  "last6m",
  "last1y",
  "older",
];

export const RECENCY_LABEL: Record<Recency, string> = {
  last30d: "Last 30 Days",
  last3m: "Last 3 Months",
  last6m: "Last 6 Months",
  last1y: "Last 1 Year",
  older: "More than 1 Year",
};

/* Short label for chips / dense UI. */
export const RECENCY_SHORT: Record<Recency, string> = {
  last30d: "30d",
  last3m: "3m",
  last6m: "6m",
  last1y: "1y",
  older: "1y+",
};

export type Problem = {
  id: string;                 // e.g. "lc-1-two-sum"
  leetcodeNumber: number;
  title: string;
  slug: string;
  leetcodeUrl: string;
  difficulty: Difficulty;
  topics: string[];
  companies: string[];
  /* Per-company recency tag. companies[] and companyRecency keys should
   * be in 1:1 sync — every name in companies[] has an entry here.
   * Optional only to stay backwards-compatible with old persisted state. */
  companyRecency?: Partial<Record<string, Recency>>;
};

export type Attempt = {
  problemId: string;
  status: Status;
  attemptedAt: string;        // ISO
  solvedAt?: string;          // ISO
  notes?: string;
};

export type CompanyEntry = { name: string; count: number };

/* A single day's slot in an interview study plan: 2-3 problems the user
 * is expected to work through that day. */
export type StudyPlanSlot = {
  date: string;          // YYYY-MM-DD
  problemIds: string[];  // typically 2-3
};

/* The active interview study plan. One plan at a time keeps the UI and
 * persistence model simple; regenerating replaces the previous plan. */
export type StudyPlan = {
  id: string;            // timestamp-based, just for React keys
  company: string;
  interviewDate: string; // YYYY-MM-DD
  createdAt: string;     // ISO datetime
  slots: StudyPlanSlot[];
};

export type Stats = {
  total: number;
  easy: number;
  medium: number;
  hard: number;
  companies: number;
  generatedAt: string;
  errors?: number;
};
