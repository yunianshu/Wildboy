import DOMPurify from "dompurify";
import { decodeWechatFence } from "./components/wechatFence";
import { cleanWechatPreview } from "./wechatPaste";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isSafeImageUrl(url: string): boolean {
  const trimmed = url.trim();
  if (/^\/assets\/[A-Za-z0-9_./-]+$/.test(trimmed)) {
    return !trimmed.split("/").includes("..");
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function isSafeLinkUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function renderInline(raw: string): string {
  const codeSpans: string[] = [];
  let text = raw.replace(/`([^`\n]+)`/g, (_, code: string) => {
    const idx = codeSpans.length;
    codeSpans.push(`<code>${escapeHtml(code)}</code>`);
    return `\u0000CODE${idx}\u0000`;
  });

  text = escapeHtml(text);

  // Images ![alt](url)
  text = text.replace(
    /!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g,
    (_, alt: string, url: string) => {
      const cleanUrl = url.replace(/&amp;/g, "&");
      if (!isSafeImageUrl(cleanUrl)) return alt ? `<span>${alt}</span>` : "";
      return `<img src="${escapeHtml(cleanUrl)}" alt="${alt}" referrerpolicy="no-referrer" />`;
    },
  );

  // Links [label](url)
  text = text.replace(
    /\[([^\]]+)\]\(([^)\s]+)\)/g,
    (_, label: string, url: string) => {
      const cleanUrl = url.replace(/&amp;/g, "&");
      if (!isSafeLinkUrl(cleanUrl)) return label;
      return `<a href="${escapeHtml(cleanUrl)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    },
  );

  // Bold, strikethrough, italic
  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  text = text.replace(/~~([^~]+)~~/g, "<del>$1</del>");
  text = text.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");

  return text.replace(
    /\u0000CODE(\d+)\u0000/g,
    (_, idx: string) => codeSpans[Number(idx)] ?? "",
  );
}

function splitTableCells(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

function isTableSeparator(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes("|") && !trimmed.includes("-")) return false;
  const cells = splitTableCells(trimmed);
  return cells.length > 0 && cells.every((c) => /^:?-{3,}:?$/.test(c));
}

function isHorizontalRule(line: string): boolean {
  return /^\s*(?:[-*_]\s*){3,}$/.test(line);
}

function isHeading(line: string): boolean {
  return /^#{1,6}\s+/.test(line);
}

function isUnorderedListItem(line: string): boolean {
  return /^\s*[-*+]\s+/.test(line);
}

function isOrderedListItem(line: string): boolean {
  return /^\s*\d+\.\s+/.test(line);
}

function isStandaloneImage(line: string): RegExpMatchArray | null {
  return line
    .trim()
    .match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)$/);
}

function renderMarkdownBlocks(segment: string): string {
  const lines = segment.split("\n");
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.+?)\s*#*$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      out.push(`<h${level}>${renderInline(headingMatch[2])}</h${level}>`);
      i++;
      continue;
    }

    // Horizontal rule
    if (isHorizontalRule(line)) {
      out.push("<hr />");
      i++;
      continue;
    }

    // Standalone image
    const imageMatch = isStandaloneImage(line);
    if (imageMatch) {
      const [, alt, url] = imageMatch;
      if (isSafeImageUrl(url)) {
        out.push(
          `<figure class="mp-md-figure"><img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" referrerpolicy="no-referrer" /></figure>`,
        );
      }
      i++;
      continue;
    }

    // Table
    if (
      line.includes("|") &&
      i + 1 < lines.length &&
      isTableSeparator(lines[i + 1])
    ) {
      const headers = splitTableCells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim() && lines[i].includes("|")) {
        rows.push(splitTableCells(lines[i]));
        i++;
      }
      const headHtml = headers
        .map((cell) => `<th>${renderInline(cell)}</th>`)
        .join("");
      const bodyHtml = rows
        .map(
          (row) =>
            `<tr>${headers
              .map((_, col) => `<td>${renderInline(row[col] ?? "")}</td>`)
              .join("")}</tr>`,
        )
        .join("");
      out.push(
        `<div class="mp-md-table-wrap"><table><thead><tr>${headHtml}</tr></thead><tbody>${bodyHtml}</tbody></table></div>`,
      );
      continue;
    }

    // Blockquote
    if (/^\s*>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      out.push(
        `<blockquote>${quoteLines.map((q) => renderInline(q)).join("<br />")}</blockquote>`,
      );
      continue;
    }

    // Unordered list
    if (isUnorderedListItem(line)) {
      const items: string[] = [];
      while (i < lines.length && isUnorderedListItem(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ""));
        i++;
      }
      out.push(
        `<ul>${items.map((item) => `<li>${renderInline(item)}</li>`).join("")}</ul>`,
      );
      continue;
    }

    // Ordered list
    if (isOrderedListItem(line)) {
      const items: string[] = [];
      while (i < lines.length && isOrderedListItem(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      out.push(
        `<ol>${items.map((item) => `<li>${renderInline(item)}</li>`).join("")}</ol>`,
      );
      continue;
    }

    // Paragraph
    const paragraph: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !isHeading(lines[i]) &&
      !isHorizontalRule(lines[i]) &&
      !isStandaloneImage(lines[i]) &&
      !/^\s*>\s?/.test(lines[i]) &&
      !isUnorderedListItem(lines[i]) &&
      !isOrderedListItem(lines[i]) &&
      !(
        lines[i].includes("|") &&
        i + 1 < lines.length &&
        isTableSeparator(lines[i + 1])
      )
    ) {
      paragraph.push(lines[i]);
      i++;
    }
    out.push(`<p>${paragraph.map((p) => renderInline(p)).join("<br />")}</p>`);
  }

  return out.join("\n");
}

const markdownAllowedTags = [
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "br",
  "hr",
  "strong",
  "em",
  "del",
  "code",
  "pre",
  "blockquote",
  "ul",
  "ol",
  "li",
  "a",
  "img",
  "figure",
  "div",
  "span",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
];

export function renderPreviewMarkdown(markdown: string): string {
  const normalized = markdown.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return "";

  const wechatBlocks: string[] = [];
  const fenceRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
  const parts: string[] = [];
  let lastIndex = 0;

  for (const match of normalized.matchAll(fenceRegex)) {
    const start = match.index ?? 0;
    if (start > lastIndex) {
      parts.push(renderMarkdownBlocks(normalized.slice(lastIndex, start)));
    }
    const lang = (match[1] || "").trim().toLowerCase();
    const code = match[2] || "";
    if (lang === "wechat") {
      const decoded = decodeWechatFence(code);
      const cleaned = cleanWechatPreview(decoded);
      const token = `WECHAT_PLACEHOLDER_${wechatBlocks.length}_END`;
      wechatBlocks.push(`<div class="wechat-prose">${cleaned}</div>`);
      parts.push(`<div data-wechat-token="${token}">${token}</div>`);
    } else {
      parts.push(`<pre><code>${escapeHtml(code.replace(/\n$/, ""))}</code></pre>`);
    }
    lastIndex = start + match[0].length;
  }

  if (lastIndex < normalized.length) {
    parts.push(renderMarkdownBlocks(normalized.slice(lastIndex)));
  }

  let sanitized = DOMPurify.sanitize(parts.join("\n"), {
    ALLOWED_TAGS: markdownAllowedTags,
    ALLOWED_ATTR: ["class", "src", "alt", "href", "target", "rel", "referrerpolicy"],
    ALLOW_DATA_ATTR: false,
  });

  wechatBlocks.forEach((html, idx) => {
    const token = `WECHAT_PLACEHOLDER_${idx}_END`;
    sanitized = sanitized.replace(`<div>${token}</div>`, html);
  });

  return sanitized;
}
