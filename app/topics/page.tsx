"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Shell, Topbar } from "@/components/Shell";
import { PROBLEMS } from "@/lib/catalog";

/**
 * The catalog doesn't carry topic tags, so we do
 * not include topic tags. Until we add a topic-enrichment step (LLM-driven or
 * a static map), we infer rough buckets from the title with a tiny keyword
 * heuristic. It's intentionally crude.
 */
const BUCKETS: { name: string; keywords: RegExp }[] = [
  { name: "Array & Hashing", keywords: /\b(array|two sum|hash|anagram|subarray|prefix)\b/i },
  { name: "Two Pointers", keywords: /\b(two pointer|palindrome|sorted|container|water)\b/i },
  { name: "Sliding Window", keywords: /\b(window|substring|longest|consecutive)\b/i },
  { name: "Stack & Queue", keywords: /\b(stack|queue|parenth|bracket|deque)\b/i },
  { name: "Binary Search", keywords: /\b(binary search|sqrt|search.*rotated|kth)\b/i },
  { name: "Linked List", keywords: /\b(linked list|node|cycle|reverse list|merge)\b/i },
  { name: "Trees", keywords: /\b(tree|bst|binary tree|inorder|preorder|postorder|level order)\b/i },
  { name: "Heap / Priority Queue", keywords: /\b(heap|priority|k largest|k smallest|merge k)\b/i },
  { name: "Backtracking", keywords: /\b(combination|permutation|subset|n-queens|sudoku|generate)\b/i },
  { name: "Graphs", keywords: /\b(graph|island|course|clone|word ladder|network)\b/i },
  { name: "DP", keywords: /\b(dp|dynamic|edit distance|knapsack|coin|longest.*subsequence|stairs|robber)\b/i },
  { name: "Greedy", keywords: /\b(jump game|gas|interval|meeting room|task scheduler)\b/i },
  { name: "Bit Manipulation", keywords: /\b(bit|xor|single number|hamming)\b/i },
  { name: "Math", keywords: /\b(prime|factorial|pow|happy|roman|integer)\b/i },
  { name: "Strings", keywords: /\b(string|substring|palindrome|reverse|valid)\b/i },
];

export default function TopicsPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  const totals = BUCKETS.map((b) => ({
    ...b,
    count: PROBLEMS.filter((p) => b.keywords.test(p.title)).length,
  })).sort((a, b) => b.count - a.count);

  return (
    <Shell>
      <Topbar />

      <div className="fade-up mb-3">
        <h1
          className="font-display font-medium m-0 mb-2 text-[24px] md:text-[32px]"
          style={{ lineHeight: 1.1, letterSpacing: "-0.025em" }}
        >
          Topics
        </h1>
        <p className="m-0 text-sm max-w-[640px]" style={{ color: "var(--color-dim)" }}>
          The catalog does not carry topic tags, so buckets are inferred from problem titles. Crude but useful for browsing.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 fade-up mt-8">
        {totals.map((t) => (
          <Link
            key={t.name}
            href={`/problems?topic=${encodeURIComponent(t.name)}`}
            className="px-5 py-4 rounded-xl card-hover"
            style={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
            }}
          >
            <div className="flex items-center justify-between">
              <span
                className="font-display font-medium text-[15px]"
                style={{ letterSpacing: "-0.015em" }}
              >
                {t.name}
              </span>
              <span
                className="font-mono text-[11px] tnum"
                style={{ color: "var(--color-dim)" }}
              >
                {t.count} problems
              </span>
            </div>
          </Link>
        ))}
      </div>
    </Shell>
  );
}
