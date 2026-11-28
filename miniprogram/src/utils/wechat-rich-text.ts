import { config } from "../config";
import { mediaUrl } from "./api";

export type WechatRichTextNode =
  | { type: "text"; text: string }
  | {
      type?: "node";
      name: string;
      attrs?: Record<string, string>;
      children?: WechatRichTextNode[];
    };

// Respect narrow source columns and captions as well as the mobile viewport.
function fitContainer(style: string) {
  const sourceLimit = /(?:^|;)\s*max-width\s*:\s*([\d.]+(?:px|em|rem|vw|%))\s*(?:;|$)/i.exec(style)?.[1];
  const maxWidth = sourceLimit && sourceLimit !== "100%" ? `min(100%,${sourceLimit})` : "100%";
  return [style, `box-sizing:border-box;max-width:${maxWidth}`].filter(Boolean).join(";");
}

// Defaults mirror the admin phone preview without overriding pasted styles.
const activityStyles: Record<string, string> = {
  p: "margin:0 0 10px;overflow-wrap:anywhere",
  h1: "margin:12px 0 6px;font-size:18px;font-weight:700;line-height:1.4",
  h2: "margin:12px 0 6px;font-size:16px;font-weight:700;line-height:1.4",
  h3: "margin:12px 0 6px;font-size:15px;font-weight:700;line-height:1.4",
  h4: "margin:12px 0 6px;font-weight:700;line-height:1.4",
  img: "display:block;margin:8px 0;border-radius:8px",
  blockquote: "margin:8px 0;padding:6px 10px;border-left:3px solid #38835a;background:#eff5eb",
  ul: "margin:6px 0 10px;padding-left:18px",
  ol: "margin:6px 0 10px;padding-left:18px",
  pre: "padding:8px 10px;border-radius:8px;background:#f1f5ee;font-size:12px;white-space:pre-wrap;word-break:break-all",
  th: "border:1px solid #dce2d8;padding:5px 7px;text-align:left",
  td: "border:1px solid #dce2d8;padding:5px 7px;text-align:left",
};
/** Input is the server's sanitized node tree, never pasted HTML. */
export function prepareWechatNodes(nodes: WechatRichTextNode[], activityLayout = false, paragraph = false): WechatRichTextNode[] {
  if (!Array.isArray(nodes)) return [];
  return nodes.flatMap((node): WechatRichTextNode[] => {
    if (!node || typeof node !== "object") return [];
    if (node.type === "text") {
      if (typeof node.text !== "string") return [];
      if (!activityLayout || !paragraph || !/\r?\n/.test(node.text)) return [{ type: "text", text: node.text }];
      // Stored CommonMark soft breaks are raw newlines; the admin preview uses br.
      return node.text.split(/\r?\n/).flatMap((text, index): WechatRichTextNode[] => [
        ...(index ? [{ name: "br" } as const] : []),
        ...(text ? [{ type: "text" as const, text }] : []),
      ]);
    }
    if (typeof node.name !== "string") return [];

    const attrs = { ...node.attrs };
    const defaults = activityLayout ? activityStyles[node.name] : "";
    if (defaults) attrs.style = [defaults, attrs.style].filter(Boolean).join(";");
    if (node.name === "img") {
      const src = mediaUrl(attrs.src || "");
      if (!src) return attrs.alt ? [{ type: "text", text: attrs.alt }] : [];
      // Even images bundled in the mini program require a network URL inside rich-text.
      attrs.src = src.startsWith("/") ? config.apiOrigin + src : src;
      attrs.style = fitContainer(attrs.style || "") + ";height:auto";
      return [{ name: "img", attrs }];
    }
    if (["div", "p", "blockquote", "pre", "h1", "h2", "h3", "h4", "h5", "h6"].includes(node.name)) {
      attrs.style = fitContainer(attrs.style || "");
    }
    return [{
      name: node.name,
      attrs,
      ...(node.children ? { children: prepareWechatNodes(node.children, activityLayout, !["pre", "code"].includes(node.name) && (paragraph || node.name === "p")) } : {}),
    }];
  });
}
