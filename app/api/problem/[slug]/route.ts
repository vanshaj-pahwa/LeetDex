// GET /api/problem/[slug] — fetches one problem's description from LeetCode's
// public GraphQL endpoint. Returns sanitized HTML + a few metadata fields.
// Cached server-side for 24h. Returns null content for Premium-locked
// problems so the client can render a "Premium only" notice.

import { NextResponse } from "next/server";

const LEETCODE_GRAPHQL = "https://leetcode.com/graphql";
const QUERY = `query questionContent($titleSlug: String!) {
  question(titleSlug: $titleSlug) {
    title
    titleSlug
    content
    difficulty
    isPaidOnly
    hints
    exampleTestcases
    topicTags { name slug }
  }
}`;

export const revalidate = 86400; // 24h

const ALLOWED_TAGS = new Set([
  "p", "br", "div", "span", "b", "strong", "i", "em", "u", "s",
  "code", "pre", "ul", "ol", "li", "sup", "sub",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "blockquote", "img", "a",
  "table", "thead", "tbody", "tr", "td", "th",
]);

const ALLOWED_ATTRS: Record<string, Set<string>> = {
  img: new Set(["src", "alt", "title"]),
  a: new Set(["href", "title"]),
};

/* Post-process LC's HTML into a structured shape: examples become cards,
 * Constraints + Follow-up get eyebrow labels, Input/Output/Explanation
 * prefixes get color-coded classes.
 *
 * LC's body comes in two shapes:
 *   A) <p><strong>Example N:</strong></p><pre>... Input/Output ...</pre>
 *   B) <p><strong>Example N:</strong></p><p><strong>Input:</strong> ...</p>
 *      <p><strong>Output:</strong> ...</p><p>...</p>
 * The state-machine below walks the HTML at the section-marker level so
 * both shapes get the same card treatment. */
function structureStatement(html: string): string {
  const h = html.replace(/<p>(?:&nbsp;|\s)*<\/p>/g, "");

  // Markers are standalone <p><strong>LABEL:</strong></p> elements.
  const MARKER_RE =
    /<p>\s*<strong>\s*(Example\s+\d+|Constraints?|Follow[\s-]?up)\s*:?\s*<\/strong>\s*<\/p>/gi;

  type Marker = { start: number; end: number; label: string };
  const markers: Marker[] = [];
  let m: RegExpExecArray | null;
  while ((m = MARKER_RE.exec(h)) !== null) {
    markers.push({ start: m.index, end: m.index + m[0].length, label: m[1] });
  }

  let out: string;
  if (markers.length === 0) {
    out = h;
  } else {
    out = h.slice(0, markers[0].start);
    for (let i = 0; i < markers.length; i++) {
      const mk = markers[i];
      const bodyEnd = i + 1 < markers.length ? markers[i + 1].start : h.length;
      const body = h.slice(mk.end, bodyEnd).trim();

      const example = mk.label.match(/Example\s+(\d+)/i);
      if (example) {
        out += `<div class="ps-example"><div class="ps-example-num">Example ${example[1]}</div>${body}</div>`;
      } else if (/^Constraints?$/i.test(mk.label)) {
        out += `<div class="ps-section"><div class="ps-section-label">Constraints</div>${body}</div>`;
      } else if (/^Follow[\s-]?up$/i.test(mk.label)) {
        out += `<div class="ps-followup"><div class="ps-section-label">Follow-up</div>${body}</div>`;
      }
    }
  }

  // Inline Follow-up that wasn't its own <p><strong>Follow-up:</strong></p>:
  //   <strong>Follow-up:&nbsp;</strong>Can you... → wrap that trailing chunk.
  if (!/ps-followup/.test(out)) {
    out = out.replace(
      /<p>\s*<strong>\s*Follow[\s-]?up\s*:?\s*(?:&nbsp;|\s)*<\/strong>([\s\S]*?)<\/p>/i,
      (_m, body: string) =>
        `<div class="ps-followup"><div class="ps-section-label">Follow-up</div><div>${body.trim()}</div></div>`,
    );
  }

  // Color-code the Input/Output/Explanation prefixes inside example bodies.
  out = out.replace(/<strong>(Input)\s*:\s*<\/strong>/g, '<strong class="ps-input">$1:</strong>');
  out = out.replace(/<strong>(Output)\s*:\s*<\/strong>/g, '<strong class="ps-output">$1:</strong>');
  out = out.replace(
    /<strong>(Explanation)\s*:\s*<\/strong>/g,
    '<strong class="ps-explanation">$1:</strong>',
  );
  return out;
}

function sanitizeHtml(html: string): string {
  let out = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");

  out = out.replace(
    /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\s*([^>]*?)\/?>/g,
    (_match, slash: string, tag: string, rawAttrs: string) => {
      const t = tag.toLowerCase();
      if (!ALLOWED_TAGS.has(t)) return "";
      if (slash) return `</${t}>`;

      const allowed = ALLOWED_ATTRS[t];
      const safeAttrs: string[] = [];
      if (allowed) {
        const attrRe = /([a-zA-Z][a-zA-Z0-9-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
        let m;
        while ((m = attrRe.exec(rawAttrs)) !== null) {
          const name = m[1].toLowerCase();
          if (!allowed.has(name)) continue;
          const value = (m[2] ?? m[3] ?? m[4] ?? "").trim();
          // Block dangerous URL schemes
          if (
            (name === "href" || name === "src") &&
            /^\s*(javascript|data|vbscript|file):/i.test(value)
          ) continue;
          // Block raw event handlers (defensive; attr name allowlist already
          // excludes on*, but keep the safety net).
          if (name.startsWith("on")) continue;
          safeAttrs.push(`${name}="${value.replace(/"/g, "&quot;")}"`);
        }
      }

      // Force <a> to open in a new tab without referrer leak.
      if (t === "a") {
        safeAttrs.push('target="_blank"', 'rel="noopener noreferrer"');
      }
      // <img> needs width-cap class added at render time via CSS.

      return safeAttrs.length > 0
        ? `<${t} ${safeAttrs.join(" ")}>`
        : `<${t}>`;
    },
  );

  return out.trim();
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
  }
  try {
    const res = await fetch(LEETCODE_GRAPHQL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        referer: `https://leetcode.com/problems/${slug}/`,
      },
      body: JSON.stringify({
        query: QUERY,
        variables: { titleSlug: slug },
      }),
      next: { revalidate: 86400 },
    });
    if (!res.ok) {
      throw new Error(`LeetCode responded ${res.status}`);
    }
    const json = (await res.json()) as {
      data?: {
        question?: {
          title: string;
          titleSlug: string;
          content: string | null;
          difficulty: string;
          isPaidOnly: boolean;
          hints: string[] | null;
          exampleTestcases: string | null;
          topicTags: { name: string; slug: string }[] | null;
        } | null;
      };
      errors?: { message: string }[];
    };
    if (json.errors?.length) {
      throw new Error(json.errors.map((e) => e.message).join("; "));
    }
    const q = json.data?.question;
    if (!q) {
      return NextResponse.json(
        { error: "Problem not found on LeetCode" },
        { status: 404 },
      );
    }
    return NextResponse.json(
      {
        title: q.title,
        slug: q.titleSlug,
        content: q.content ? structureStatement(sanitizeHtml(q.content)) : null,
        isPaidOnly: !!q.isPaidOnly,
        hints: q.hints ?? [],
        topics: q.topicTags?.map((t) => t.name) ?? [],
      },
      {
        headers: {
          "cache-control": "public, max-age=86400, stale-while-revalidate=86400",
        },
      },
    );
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? e.message
            : "Failed to fetch problem from LeetCode",
      },
      { status: 502 },
    );
  }
}
