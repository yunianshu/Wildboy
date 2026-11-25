import type { WechatRichTextNode } from "./wechat-rich-text";

export interface ArticleSummary {
  id: string;
  title: string;
  summary: string;
  coverUrl: string;
  activityId: string | null;
  isOfficial: boolean;
  publishedAt: string | null;
  version: number;
}
type InlineSpan = {
  t: "text" | "bold" | "italic" | "code" | "link";
  s: string;
  href?: string;
};
export type MarkdownNode = { quote?: boolean } & (
  | { type: "heading"; level: number; spans: InlineSpan[] }
  | { type: "paragraph"; spans: InlineSpan[] }
  | { type: "image"; url: string; caption?: string }
  | { type: "code"; text: string }
  | { type: "hr" }
  | { type: "list"; ordered: boolean; level?: number; items: { spans: InlineSpan[] }[] }
  | { type: "table"; head: InlineSpan[][]; rows: InlineSpan[][][] }
  | { type: "wechat"; nodes: WechatRichTextNode[] }
);
export interface Article extends ArticleSummary {
  contentNodes: MarkdownNode[];
}
