// GET /api/daily-month?year=YYYY&month=M — returns the LeetCode daily
// challenges for a given month from LC's `dailyCodingChallengeV2` GraphQL
// query. Cached server-side for 6h; past months won't change after the
// month ends, and the current month only grows by one new daily per day.
//
// Used by the home page calendar to show what the daily was on each day
// the user views, even when they did not solve it via the tracker.

import { NextResponse } from "next/server";

const LEETCODE_GRAPHQL = "https://leetcode.com/graphql";
const QUERY = `query dailyCodingQuestionRecords($year: Int!, $month: Int!) {
  dailyCodingChallengeV2(year: $year, month: $month) {
    challenges {
      date
      link
      question {
        questionFrontendId
        title
        titleSlug
        difficulty
        isPaidOnly
      }
    }
  }
}`;

export const revalidate = 21600; // 6h

type ChallengeOut = {
  date: string;
  url: string;
  slug: string;
  leetcodeNumber: number;
  title: string;
  difficulty: "easy" | "medium" | "hard";
  paidOnly: boolean;
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const yearStr = url.searchParams.get("year");
  const monthStr = url.searchParams.get("month");
  const year = yearStr ? parseInt(yearStr, 10) : NaN;
  const month = monthStr ? parseInt(monthStr, 10) : NaN;

  if (
    !Number.isFinite(year) ||
    year < 2018 ||
    year > 2100 ||
    !Number.isFinite(month) ||
    month < 1 ||
    month > 12
  ) {
    return NextResponse.json(
      { error: "year and month query params required (e.g. ?year=2026&month=5)" },
      { status: 400 },
    );
  }

  try {
    const res = await fetch(LEETCODE_GRAPHQL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        referer: "https://leetcode.com/problemset/",
      },
      body: JSON.stringify({ query: QUERY, variables: { year, month } }),
      next: { revalidate: 21600 },
    });
    if (!res.ok) {
      throw new Error(`LeetCode responded ${res.status}`);
    }
    const json = (await res.json()) as {
      data?: {
        dailyCodingChallengeV2?: {
          challenges?: {
            date: string;
            link: string;
            question: {
              questionFrontendId: string;
              title: string;
              titleSlug: string;
              difficulty: string;
              isPaidOnly: boolean;
            };
          }[];
        };
      };
      errors?: { message: string }[];
    };

    if (json.errors?.length) {
      throw new Error(json.errors.map((e) => e.message).join("; "));
    }

    const raw = json.data?.dailyCodingChallengeV2?.challenges ?? [];
    const challenges: ChallengeOut[] = raw.map((c) => ({
      date: c.date,
      url: `https://leetcode.com${c.link}`,
      slug: c.question.titleSlug,
      leetcodeNumber: parseInt(c.question.questionFrontendId, 10) || 0,
      title: c.question.title,
      difficulty: (c.question.difficulty || "").toLowerCase() as ChallengeOut["difficulty"],
      paidOnly: !!c.question.isPaidOnly,
    }));

    return NextResponse.json(
      { year, month, challenges },
      {
        headers: {
          "cache-control": "public, max-age=3600, stale-while-revalidate=21600",
        },
      },
    );
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? e.message
            : "Failed to fetch monthly daily challenges from LeetCode",
      },
      { status: 502 },
    );
  }
}
