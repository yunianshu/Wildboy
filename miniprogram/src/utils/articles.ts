import { ContentBlock } from "./content";
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
export interface Article extends ArticleSummary {
  blocks: ContentBlock[];
}
