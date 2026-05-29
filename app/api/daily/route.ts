// GET /api/daily — fetches LeetCode's daily coding challenge from their
// public (undocumented) GraphQL endpoint and returns a stripped-down JSON
// payload. Cached server-side for ~30 min so we re-check LC a couple of
// times per hour and pick up the day flip quickly.

import { NextResponse } from "next/server";

const LEETCODE_GRAPHQL = "https://leetcode.com/graphql";
const QUERY = `query questionOfToday {
  activeDailyCodingChallengeQuestion {
    date
    link
    question {
      acRate
      difficulty
      frontendQuestionId: questionFrontendId
      paidOnly: isPaidOnly
      title
      titleSlug
      topicTags { name slug }
    }
  }
}`;

export const revalidate = 1800; // 30 min — daily flips at UTC midnight, pick it up fast.

type Daily = {
  date: string;
  url: string;
  title: string;
  slug: string;
  leetcodeNumber: number;
  difficulty: "easy" | "medium" | "hard";
  paidOnly: boolean;
  acceptance?: number;
  topics: string[];
};

export async function GET() {
  try {
    const res = await fetch(LEETCODE_GRAPHQL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        // A browser-like UA reduces the chance of being filtered out.
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        referer: "https://leetcode.com/problemset/",
      },
      body: JSON.stringify({ query: QUERY, variables: {} }),
      next: { revalidate: 1800 },
    });
    if (!res.ok) {
      throw new Error(`LeetCode responded ${res.status}`);
    }
    const json = (await res.json()) as {
      data?: {
        activeDailyCodingChallengeQuestion?: {
          date: string;
          link: string;
          question: {
            acRate: number;
            difficulty: string;
            frontendQuestionId: string;
            paidOnly: boolean;
            title: string;
            titleSlug: string;
            topicTags: { name: string; slug: string }[];
          };
        };
      };
      errors?: { message: string }[];
    };
    if (json.errors?.length) {
      throw new Error(json.errors.map((e) => e.message).join("; "));
    }
    const q = json.data?.activeDailyCodingChallengeQuestion;
    if (!q) {
      throw new Error("LeetCode returned no daily question");
    }
    const payload: Daily = {
      date: q.date,
      url: `https://leetcode.com${q.link}`,
      title: q.question.title,
      slug: q.question.titleSlug,
      leetcodeNumber: parseInt(q.question.frontendQuestionId, 10) || 0,
      difficulty: (q.question.difficulty || "").toLowerCase() as Daily["difficulty"],
      paidOnly: !!q.question.paidOnly,
      acceptance:
        typeof q.question.acRate === "number"
          ? Math.round(q.question.acRate * 10) / 10
          : undefined,
      topics: q.question.topicTags?.map((t) => t.name) ?? [],
    };
    return NextResponse.json(payload, {
      headers: {
        // Browser: re-validate every 5 minutes so users don't sit on a stale
        // day. Server cache (above) absorbs the actual upstream load.
        "cache-control": "public, max-age=300, stale-while-revalidate=1800",
      },
    });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? e.message
            : "Failed to fetch LeetCode daily challenge",
      },
      { status: 502 },
    );
  }
}
