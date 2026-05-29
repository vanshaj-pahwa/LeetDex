import type { Problem } from "./schema";

/**
 * Topic buckets derived from problem titles. The catalog doesn't carry
 * topic tags, so this is a coarse keyword heuristic - good enough to spot
 * weak areas, not good enough to be the source of truth.
 */
export const TOPIC_BUCKETS: { name: string; keywords: RegExp }[] = [
  { name: "Array & Hashing",      keywords: /\b(array|two sum|hash|anagram|subarray|prefix)\b/i },
  { name: "Two Pointers",         keywords: /\b(two pointer|palindrome|sorted|container|water)\b/i },
  { name: "Sliding Window",       keywords: /\b(window|substring|longest|consecutive)\b/i },
  { name: "Stack & Queue",        keywords: /\b(stack|queue|parenth|bracket|deque)\b/i },
  { name: "Binary Search",        keywords: /\b(binary search|sqrt|search.*rotated|kth)\b/i },
  { name: "Linked List",          keywords: /\b(linked list|cycle|reverse list|merge.*list)\b/i },
  { name: "Trees",                keywords: /\b(tree|bst|inorder|preorder|postorder|level order)\b/i },
  { name: "Heap / Priority Queue", keywords: /\b(heap|priority|k largest|k smallest|merge k)\b/i },
  { name: "Backtracking",         keywords: /\b(combination|permutation|subset|n-queens|sudoku|generate)\b/i },
  { name: "Graphs",               keywords: /\b(graph|island|course|clone|word ladder|network)\b/i },
  { name: "DP",                   keywords: /\b(dp|dynamic|edit distance|knapsack|coin|longest.*subsequence|stairs|robber)\b/i },
  { name: "Greedy",               keywords: /\b(jump game|gas|interval|meeting room|task scheduler)\b/i },
  { name: "Bit Manipulation",     keywords: /\b(bit|xor|single number|hamming)\b/i },
  { name: "Math",                 keywords: /\b(prime|factorial|pow|happy|roman|integer)\b/i },
  { name: "Strings",              keywords: /\b(string|reverse|valid)\b/i },
];

export function topicsOf(problem: Problem): string[] {
  // Explicit topics on the problem (set via the edit UI) win over keyword
  // inference. If nothing's explicit, fall back to title-keyword buckets.
  if (problem.topics && problem.topics.length > 0) return problem.topics;
  return TOPIC_BUCKETS.filter((b) => b.keywords.test(problem.title)).map((b) => b.name);
}
