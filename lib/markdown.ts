/**
 * Tiny markdown → safe HTML for LLM-produced hint text.
 *
 * Escapes raw HTML first, then applies a small set of GFM-ish rules:
 *   - fenced code blocks (```lang\n…\n```)
 *   - inline code (`…`)
 *   - headings (#, ##, ###)
 *   - bold (**…**), italic (*…* or _…_)
 *   - links [text](url) - only http/https/mailto
 *   - unordered (- / *) and ordered (1.) lists
 *   - paragraphs separated by blank lines
 *
 * This is intentionally not a full CommonMark engine. It's the smallest thing
 * that renders the LLM output cleanly and never injects user-controlled HTML.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/* Tiny syntax highlighter for fenced code blocks.
 * Single-pass state machine that walks raw source and emits HTML with
 * <span class="tok-..."> wrappers. The keyword set is a union of common
 * imperative languages (JS/TS/Python/Java/C++/Go/Rust). Imperfect but
 * good enough to make code instantly readable without pulling in a
 * full highlighter library. */
const KEYWORDS = new Set([
  // control flow
  "if","else","elif","for","while","do","switch","case","default","break",
  "continue","return","yield","throw","try","catch","except","finally","raise",
  "loop","match","when","fallthrough","go","defer","range","in","of","is","as",
  // declarations
  "var","let","const","def","function","fn","fun","func","class","interface",
  "type","enum","struct","trait","impl","extends","implements","module",
  "namespace","package","mod","use","using","include","template","typename",
  "where","mut","ref","move","static","final","abstract","virtual","override",
  "public","private","protected","readonly","friend","sealed","synchronized",
  // imports
  "import","from","export","require",
  // primitive / literal types
  "int","long","short","char","bool","boolean","string","float","double",
  "void","auto","str","bytes","list","dict","set","tuple","array","map",
  "vec","Vec","Option","Result","Some","Ok","Err","None","Self","self","super",
  "this","new","delete","sizeof","typeof","instanceof",
  // booleans / null
  "true","false","null","nil","undefined","True","False",
  // misc
  "async","await","not","and","or","lambda","pass","with","global","nonlocal",
  "chan","crate",
]);

function complexityRow(time: string, space: string): string {
  return (
    `<div class="complexity-row">` +
      `<span class="complexity-cell">` +
        `<span class="complexity-label">Time</span>` +
        `<span class="complexity-value">${inline(time)}</span>` +
      `</span>` +
      `<span class="complexity-cell">` +
        `<span class="complexity-label">Space</span>` +
        `<span class="complexity-value">${inline(space)}</span>` +
      `</span>` +
    `</div>`
  );
}

function highlightCode(src: string): string {
  let out = "";
  let i = 0;
  const n = src.length;

  function appendText(s: string) {
    out += escapeHtml(s);
  }
  function appendToken(cls: string, s: string) {
    out += `<span class="tok-${cls}">${escapeHtml(s)}</span>`;
  }

  while (i < n) {
    const c = src[i];
    const two = src.slice(i, i + 2);

    // line comment: // ... \n
    if (two === "//") {
      const end = src.indexOf("\n", i);
      const k = end === -1 ? n : end;
      appendToken("com", src.slice(i, k));
      i = k;
      continue;
    }
    // line comment: # ... \n  (Python, shell, Ruby)
    if (c === "#") {
      const end = src.indexOf("\n", i);
      const k = end === -1 ? n : end;
      appendToken("com", src.slice(i, k));
      i = k;
      continue;
    }
    // block comment: /* ... */
    if (two === "/*") {
      const end = src.indexOf("*/", i + 2);
      const k = end === -1 ? n : end + 2;
      appendToken("com", src.slice(i, k));
      i = k;
      continue;
    }
    // string: " ... " or ' ... ' or ` ... `
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      let k = i + 1;
      while (k < n) {
        if (src[k] === "\\") { k += 2; continue; }
        if (src[k] === quote) { k++; break; }
        if (src[k] === "\n" && quote !== "`") { break; } // unterminated
        k++;
      }
      appendToken("str", src.slice(i, k));
      i = k;
      continue;
    }
    // number
    if (/\d/.test(c)) {
      let k = i + 1;
      while (k < n && /[\d._a-fA-FxXbBoO]/.test(src[k])) k++;
      appendToken("num", src.slice(i, k));
      i = k;
      continue;
    }
    // identifier (possibly keyword)
    if (/[A-Za-z_$]/.test(c)) {
      let k = i + 1;
      while (k < n && /[A-Za-z0-9_$]/.test(src[k])) k++;
      const word = src.slice(i, k);
      if (KEYWORDS.has(word)) {
        appendToken("kw", word);
      } else {
        appendText(word);
      }
      i = k;
      continue;
    }
    // anything else: just escape and emit
    appendText(c);
    i++;
  }
  return out;
}

function inline(s: string): string {
  let out = escapeHtml(s);

  // inline code first (so its contents skip other inline rules)
  out = out.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);

  // Caret-style superscripts that LLMs love: O(n^2) -> O(n²) via <sup>.
  // Only matches when preceded by an alnum and followed by 1-4 alnum chars
  // so we don't trip over bitwise XOR or stray carets.
  out = out.replace(/(\w)\^(\w{1,4})/g, "$1<sup>$2</sup>");

  // LaTeX-style inline math: $expr$ -> <code>expr</code>. LLMs love to wrap
  // things like $O(n^2)$. We render them as code so they read sensibly
  // without pulling in a full math typesetter.
  out = out.replace(/\$([^$\n]{1,80}?)\$/g, (_m, expr: string) => `<code>${expr}</code>`);

  // bold
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

  // italic
  out = out.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "<em>$1</em>");
  out = out.replace(/(?<!_)_([^_\n]+)_(?!_)/g, "<em>$1</em>");

  // links - only allow safe URL schemes
  out = out.replace(
    /\[([^\]]+)\]\(([^)\s]+)\)/g,
    (_m, text: string, url: string) => {
      if (!/^(https?:|mailto:)/i.test(url)) return text;
      return `<a href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
    },
  );

  return out;
}

function isTableSeparator(line: string): boolean {
  // Like `| :--- | ---: | :---: | --- |`
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function parseTableRow(line: string): string[] {
  return line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
}

type Align = "left" | "right" | "center" | null;

function parseAlignments(line: string): Align[] {
  return parseTableRow(line).map((cell) => {
    const t = cell.trim();
    const left = t.startsWith(":");
    const right = t.endsWith(":");
    if (left && right) return "center";
    if (right) return "right";
    if (left) return "left";
    return null;
  });
}

function buildTable(header: string[], align: Align[], rows: string[][]): string {
  const alignAttr = (i: number) => {
    const a = align[i];
    return a ? ` style="text-align:${a}"` : "";
  };
  let html = '<div class="prose-hint-table-wrap"><table class="prose-hint-table">';
  html += "<thead><tr>";
  for (let i = 0; i < header.length; i++) {
    html += `<th${alignAttr(i)}>${inline(header[i])}</th>`;
  }
  html += "</tr></thead><tbody>";
  for (const row of rows) {
    html += "<tr>";
    for (let i = 0; i < header.length; i++) {
      html += `<td${alignAttr(i)}>${inline(row[i] ?? "")}</td>`;
    }
    html += "</tr>";
  }
  html += "</tbody></table></div>";
  return html;
}

export function renderMarkdown(src: string): string {
  // Strip em-dash (U+2014) and en-dash (U+2013) from LLM output per style rule.
  const text = src.replace(/—/g, "-").replace(/–/g, "-");

  const lines = text.split(/\r?\n/);
  const out: string[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // fenced code
    const fence = /^```(\w+)?\s*$/.exec(line);
    if (fence) {
      const lang = fence[1] ?? "";
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      const raw = buf.join("\n");
      const highlighted = highlightCode(raw);
      const langAttr = lang ? escapeAttr(lang) : "";
      out.push(
        `<div class="code-block">` +
          `<div class="code-block-bar">` +
            `<span class="code-block-lang">${langAttr || "code"}</span>` +
            `<button type="button" class="code-block-copy" data-copy="true">Copy</button>` +
          `</div>` +
          `<pre><code class="lang-${langAttr}" data-raw="${escapeAttr(raw)}">${highlighted}</code></pre>` +
        `</div>`,
      );
      continue;
    }

    // horizontal rule: `---`, `***`, or `___` on a line by itself
    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      out.push("<hr />");
      i++;
      continue;
    }

    // heading
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      const level = Math.min(4, h[1].length);
      out.push(`<h${level}>${inline(h[2])}</h${level}>`);
      i++;
      continue;
    }

    // unordered list
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(/^[-*]\s+/, ""))}</li>`);
        i++;
      }
      out.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    // ordered list
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(/^\d+\.\s+/, ""))}</li>`);
        i++;
      }
      out.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    // GFM-style table: a header row beginning with `|`, immediately followed
    // by a separator row of dashes/colons. Subsequent `|`-prefixed lines are
    // body rows until a non-table line.
    if (
      /^\s*\|/.test(line) &&
      i + 1 < lines.length &&
      isTableSeparator(lines[i + 1])
    ) {
      const header = parseTableRow(line);
      const align = parseAlignments(lines[i + 1]);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        rows.push(parseTableRow(lines[i]));
        i++;
      }
      out.push(buildTable(header, align, rows));
      continue;
    }

    // blank line - paragraph break
    if (/^\s*$/.test(line)) {
      i++;
      continue;
    }

    // paragraph (consume contiguous non-blank lines)
    const buf: string[] = [];
    while (
      i < lines.length &&
      !/^\s*$/.test(lines[i]) &&
      !/^```/.test(lines[i]) &&
      !/^#{1,6}\s/.test(lines[i]) &&
      !/^[-*]\s+/.test(lines[i]) &&
      !/^\d+\.\s+/.test(lines[i]) &&
      !/^\s*\|/.test(lines[i])
    ) {
      buf.push(lines[i]);
      i++;
    }
    const para = buf.join(" ").trim();

    // Pretty-render the canonical "Time: O(...) Space: O(...)" line emitted
    // by the Code mode prompt. Anything matching becomes a labeled badge row
    // instead of plain prose.
    const cx = /^Time\s*:\s*(.+?)\s*(?:[·/|,]|\s)+\s*Space\s*:\s*(.+?)\s*\.?$/i.exec(
      para,
    );
    if (cx) {
      out.push(complexityRow(cx[1], cx[2]));
      continue;
    }

    out.push(`<p>${inline(para)}</p>`);
  }

  return out.join("\n");
}
