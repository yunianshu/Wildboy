import DOMPurify from "dompurify";
import { request } from "./api";

// Some clients remove the public-account wrapper when copying a selection.
// In that case the formatted paragraphs or lazy image attributes are the evidence.
export function readWechatClipboard(event: ClipboardEvent): string | null {
  const html = event.clipboardData?.getData("text/html")?.trim();
  if (!html) return null;
  const formatted =
    /(?:mp\.weixin\.qq\.com|mmbiz\.|mmecoa\.qpic\.cn|rich_media_content|js_content|data-(?:src|wechat)|<(?:section|table|blockquote|h[1-6])\b|<(?:span|p|div|img)\b[^>]*\bstyle\s*=)/i;
  return formatted.test(html) ? html : null;
}

export function importWechatHtml(html: string) {
  return request<{ html: string; warnings: string[] }>(
    "/admin/content/wechat-import",
    {
      method: "POST",
      body: JSON.stringify({ html }),
    },
  );
}

const tags =
  "a b blockquote br caption code col colgroup dd del div dl dt em figcaption figure h1 h2 h3 h4 h5 h6 hr i img li ol p pre s small span strong sub sup table tbody td th thead tr u ul".split(
    " ",
  );
const properties =
  /^(?:color|background-color|font-(?:family|size|style|weight)|letter-spacing|line-height|text-(?:align|decoration|indent)|vertical-align|white-space|word-break|width|max-width|height|display|flex(?:-direction|-wrap|-grow|-shrink|-basis)?|gap|align-items|justify-content|list-style-type|border(?:-(?:top|bottom|left|right)(?:-color|-style|-width)?|-(?:width|style|color|radius|collapse))?|(?:padding|margin)(?:-(?:top|bottom|left|right))?)$/;

// A stored Markdown fence can also have been typed by hand. Always sanitize the
// live editor preview, even when the original paste went through the import API.
export function cleanWechatPreview(html: string): string {
  const fragment = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: tags,
    ALLOWED_ATTR: [
      "style",
      "src",
      "alt",
      "colspan",
      "rowspan",
      "start",
      "href",
    ],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    RETURN_DOM_FRAGMENT: true,
  });
  for (const el of fragment.querySelectorAll<HTMLElement>("*")) {
    const rawStyle = el.style.cssText;
    el.removeAttribute("style");
    for (const declaration of rawStyle.split(";")) {
      const at = declaration.indexOf(":");
      const prop = declaration.slice(0, at).trim();
      const value = declaration.slice(at + 1).trim();
      if (
        properties.test(prop) &&
        value.length <= 180 &&
        /^[\p{L}\d\s#.,%'"/()+-]+$/u.test(value) &&
        !/(?:url|var|calc|env|expression|image|element|attr)\s*\(/i.test(value)
      ) {
        el.style.setProperty(prop, value);
      }
    }
    if (el.tagName === "IMG") {
      const src = el.getAttribute("src") || "";
      if (
        !/^https:\/\/[^\s<>"'\\]+$/i.test(src) &&
        !/^\/assets\/[\w/-]+\.(?:png|jpe?g|webp)$/i.test(src)
      )
        el.removeAttribute("src");
      el.style.maxWidth = "100%";
      el.style.height = "auto";
    }
    if (
      el.hasAttribute("href") &&
      !/^https:\/\//i.test(el.getAttribute("href") || "")
    )
      el.removeAttribute("href");
  }
  const template = document.createElement("template");
  template.content.append(fragment);
  return template.innerHTML;
}
