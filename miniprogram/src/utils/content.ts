import { request, mediaUrl } from "./api";
import type { MarkdownNode } from "./articles";
import type { WechatRichTextNode } from "./wechat-rich-text";

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; url: string; caption?: string }
  | { type: "table"; rows: string[][] }
  | { type: "wechat"; nodes: WechatRichTextNode[] };

export type ContentDocument = {
  blocks: ContentBlock[];
  version: number;
  contentNodes?: MarkdownNode[] | null;
};

export async function loadContent(path: string): Promise<ContentDocument> {
  const data = await request<ContentDocument>(path);
  if (!data || !Array.isArray(data.blocks)) throw new Error("图文加载失败");
  return {
    ...data,
    blocks: data.blocks.map(block =>
      block.type === "image" ? { ...block, url: mediaUrl(block.url || "") } : block,
    ),
  };
}
