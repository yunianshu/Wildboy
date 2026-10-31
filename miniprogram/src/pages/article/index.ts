import { ApiError, mediaUrl, request } from "../../utils/api";
import { Article } from "../../utils/articles";
import { message, safeId } from "../../utils/domain";
Page({
  data: {
    article: null as Article | null,
    loading: true,
    error: "",
    empty: "",
  },
  _epoch: 0,
  _path: "",
  onLoad(options) {
    const id = safeId(options.id);
    if (options.official === "1" && options.id === undefined)
      this._path = "/articles/official";
    else if (id && options.official === undefined)
      this._path = `/articles/${id}`;
    else this.setData({ loading: false, error: "文章链接无效" });
  },
  onShow() {
    if (this._path) void this.load();
  },
  onHide() {
    this._epoch++;
    this.setData({ article: null });
  },
  onUnload() {
    this._epoch++;
  },
  async load() {
    if (!this._path) return;
    const n = ++this._epoch;
    this.setData({ article: null, loading: true, error: "", empty: "" });
    try {
      const article = await request<Article>(this._path);
      if (
        !article ||
        !safeId(article.id) ||
        !article.title ||
        !Array.isArray(article.blocks)
      )
        throw new Error("文章加载失败，请重试");
      if (n !== this._epoch) return;
      this.setData({
        article: {
          ...article,
          coverUrl: mediaUrl(article.coverUrl || ""),
          blocks: article.blocks.map((block) =>
            block.type === "image"
              ? { ...block, url: mediaUrl(block.url || "") }
              : block,
          ),
        },
      });
    } catch (e) {
      if (n !== this._epoch) return;
      if (e instanceof ApiError && e.status === 404)
        this.setData({
          empty:
            this._path === "/articles/official"
              ? "野小子官方介绍即将发布"
              : "文章尚未发布或已下架",
        });
      else this.setData({ error: message(e) });
    } finally {
      if (n === this._epoch) this.setData({ loading: false });
    }
  },
  retry() {
    void this.load();
  },
});
