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

/** Input is the server's sanitized node tree, never pasted HTML. */
export function prepareWechatNodes(nodes: WechatRichTextNode[]): WechatRichTextNode[] {
  if (!Array.isArray(nodes)) return [];
  return nodes.flatMap((node): WechatRichTextNode[] => {
    if (!node || typeof node !== "object") return [];
    if (node.type === "text") {
      return typeof node.text === "string" ? [{ type: "text", text: node.text }] : [];
    }
    if (typeof node.name !== "string") return [];

    const attrs = { ...node.attrs };
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
      ...(node.children ? { children: prepareWechatNodes(node.children) } : {}),
    }];
  });
}
