import { ApiError, mediaUrl, request } from "../../utils/api";
import type { Article } from "../../utils/articles";
import { aboutIntro } from "../../utils/about-intro";
import { aboutArticlePath, openWechatOfficialArticle, safeWechatArticleUrl } from "../../utils/home-shortcuts";

type ReadableArticle = Pick<Article, "title" | "summary" | "coverUrl" | "contentNodes" | "activityId"> & { id?: string };

function articleSource(value: unknown): string {
  if (typeof value !== "string" || value.length > 6144) return "";
  const direct = safeWechatArticleUrl(value);
  if (direct) return direct;
  try { return safeWechatArticleUrl(decodeURIComponent(value)); } catch { return ""; }
}
import { message, safeId } from "../../utils/domain";
import { enterPage } from "../../utils/page-motion";

Page({
  data: {
    pageMotionClass: "",
    article: null as ReadableArticle | null,
    isAbout: false,
    originalUrl: "",
    loading: true,
    error: "",
    empty: "",
    canRetry: false,
  },
  _epoch: 0,
  _path: "",
  onLoad(options) {
    const id = safeId(options.id);
    if (options.about === "1" && options.id === undefined && options.official === undefined) {
      this.setData({ article: aboutIntro, isAbout: true, originalUrl: articleSource(options.source), loading: false });
      wx.setNavigationBarTitle?.({ title: aboutIntro.title });
      return;
    }
    if (options.about !== undefined) {
      this.setData({ loading: false, error: "文章链接无效" });
      return;
    }
    if (options.official === "1" && options.id === undefined)
      this._path = "/articles/official";
    else if (id && options.official === undefined)
      this._path = `/articles/${id}`;
    else this.setData({ loading: false, error: "文章链接无效" });
    if (this._path) this.setData({ canRetry: true });
  },
  onShow() {
    enterPage(this);
    if (this._path) void this.load(!!this.data.article);
  },
  onHide() {
    this._epoch++;
    this.setData({ loading: false });
  },
  onUnload() {
    this._epoch++;
  },
  async load(background = false) {
    if (!this._path) return;
    const n = ++this._epoch;
    this.setData({ ...(background ? {} : { article: null, loading: true }), error: "", empty: "" });
    try {
      const article = await request<Article>(this._path);
      if (
        !article ||
        !safeId(article.id) ||
        !article.title ||
        !Array.isArray(article.contentNodes)
      )
        throw new Error("文章加载失败，请重试");
      if (n !== this._epoch) return;
      this.setData({
        article: {
          ...article,
          coverUrl: mediaUrl(article.coverUrl || ""),
          contentNodes: article.contentNodes.map((node) =>
            node && node.type === "image"
              ? { ...node, url: mediaUrl(node.url || "") }
              : node,
          ),
        },
      });
    } catch (e) {
      if (n !== this._epoch) return;
      if (e instanceof ApiError && e.status === 404)
        this.setData({
          article: null,
          empty:
            this._path === "/articles/official"
              ? "野小子官方介绍即将发布"
              : "文章尚未发布或已下架",
        });
      else if (!background) this.setData({ error: message(e) });
    } finally {
      if (n === this._epoch) this.setData({ loading: false });
    }
  },
  previewCover() {
    const cover = this.data.article?.coverUrl;
    if (cover) wx.previewImage({ urls: [cover] });
  },
  openActivity() {
    const id = safeId(this.data.article?.activityId);
    if (id) wx.navigateTo({ url: "/pages/detail/index?id=" + id });
  },
  openOriginal() {
    if (this.data.isAbout && this.data.originalUrl)
      openWechatOfficialArticle(this.data.originalUrl);
  },
  onShareAppMessage() {
    const article = this.data.article;
    if (this.data.isAbout && article) return {
      title: article.title,
      path: aboutArticlePath(this.data.originalUrl),
      imageUrl: article.coverUrl,
    };
    return article?.id ? {
      title: article.title,
      path: "/pages/article/index?id=" + encodeURIComponent(article.id),
      imageUrl: article.coverUrl,
    } : { path: "/pages/article/index?official=1" };
  },
  retry() {
    void this.load();
  },
});
