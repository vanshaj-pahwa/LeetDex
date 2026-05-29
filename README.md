# LeetDex

A free, open-source, bring-your-own-key LeetCode Premium alternative for company-wise interview prep. Browse company-tagged LeetCode questions (Google, Meta, Amazon, Microsoft, Apple, Netflix, Uber, and hundreds more), filter by how recently each problem was asked, track your progress locally, and connect your own Gemini, OpenAI, or Anthropic key for hints, approaches, tiered code solutions (brute, optimal, best), and next-problem picks.

**Live at [leetdex.vercel.app](https://leetdex.vercel.app)**

If you have ever searched for things like "LeetCode premium free", "company wise LeetCode questions", "Google interview LeetCode list", "Meta tagged problems", or "which LeetCode questions does Amazon ask" - this is for you.

## Why this exists

LeetCode Premium gates the most useful information behind a paywall: which problems each company actually asks, and how recently. LeetDex bundles a snapshot of that data (refreshed manually from time to time) and pairs it with an AI assistant that reads your solve history and picks the next problem worth your time.

Pick Amazon and the Last 30 Days filter, and the list narrows from 800 historical questions to the dozen they are actually asking this month.

Everything runs in your browser. No account, no server, no tracking. Bring your own AI key if you want the smart picks; the rest works offline.

## Features

### Without an AI key

- **Company-tagged problem list.** LeetCode problems mapped to the companies that asked them, with per-company recency so you can prioritize "asked in the last 30 days at Meta" over five-year-old questions.
- **Filter and search.** By difficulty, topic, company, recency window, solved status, or full-text.
- **Real problem statements.** The full LeetCode statement is fetched on demand, so you do not need to context-switch to leetcode.com to start solving.
- **Local solve tracking.** Mark problems solved, add notes, see a monthly activity calendar and current streak. Stored in `localStorage`, no account needed.
- **LeetCode daily challenge.** Pulled live and shown on the home page.

### With your own AI key (Gemini, OpenAI, or Anthropic)

- **Tiered hints.** Open any problem and ask for a nudge, an approach, a complexity discussion, or full code solutions (brute, optimal, and best variants) in your preferred language.
- **"Up next" pick.** Reads your solve history (locally, in your browser) and picks one problem that stretches you, optionally biased toward companies you are targeting.
- **Weekly digest.** A short read of what you solved this week, where your coverage is thin, and what to focus on next.

## Getting started

```
npm install
npm run dev
```

Open http://localhost:3000.

On first load you will be prompted to set a name and (optionally) connect an AI provider. The AI features are gated behind a key; browsing, filtering, and solve tracking all work without one.

### Connecting an AI provider

LeetDex never proxies your key. The key is stored in `localStorage` and used to call the provider's API directly from your browser.

| Provider  | Model used               | Get a key                                         |
| --------- | ------------------------ | ------------------------------------------------- |
| Gemini    | gemini-3-flash-preview   | https://aistudio.google.com/apikey                |
| OpenAI    | gpt-4o-mini              | https://platform.openai.com/api-keys              |
| Anthropic | claude-sonnet-4-6        | https://console.anthropic.com/settings/keys       |

All three providers offer a free tier that is more than enough for personal prep.

## Data and privacy

- All solve history, settings, and API keys live in your browser's `localStorage`. Nothing is sent to a LeetDex server (there is no LeetDex server).
- AI requests go directly from your browser to the provider you configured.
- The problem statement endpoint at `/api/problem/[slug]` proxies LeetCode's public GraphQL only to sidestep CORS; no user data is attached.


## Disclaimer

LeetDex is not affiliated with LeetCode. "LeetCode" is a trademark of its respective owner. This project links to the public leetcode.com pages for each problem and does not redistribute problem solutions or premium content.
