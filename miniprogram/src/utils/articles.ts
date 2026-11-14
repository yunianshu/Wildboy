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
/** 服务端 commonmark 解析出的结构化节点（原生组件渲染，不含 HTML）。 */
export type MarkdownNode = Record<string, any>;
export interface Article extends ArticleSummary {
  contentNodes: MarkdownNode[];
}
