const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const api = require("../dist/utils/api.js");
let definition, calls;
global.Page = (d) => {
  definition = d;
};
function page(options = { id: "article-1" }) {
  const path = require.resolve("../dist/pages/article/index.js");
  delete require.cache[path];
  require(path);
  const p = {
    ...definition,
    data: structuredClone(definition.data),
    setData(d) {
      Object.assign(this.data, d);
    },
  };
  for (const k of Object.keys(p))
    if (typeof p[k] === "function") p[k] = p[k].bind(p);
  p.onLoad(options);
  return p;
}
const article = {
  id: "article-1",
  title: "真实文章",
  summary: "简介",
  coverUrl: "/assets/category-weekly.jpg",
  blocks: [
    { type: "text", text: "<script>不会作为HTML运行</script>" },
    { type: "image", url: "/assets/category-weekly.jpg" },
  ],
};
beforeEach(() => {
  calls = [];
  api.request = async (path) => {
    calls.push(path);
    return article;
  };
});
test("official shortcut resolves published pointer", async () => {
  const p = page({ official: "1" });
  await p.load();
  assert.deepEqual(calls, ["/articles/official"]);
  assert.equal(p.data.article.title, article.title);
});
test("article detail uses safe native blocks and id route", async () => {
  const p = page();
  await p.load();
  assert.deepEqual(calls, ["/articles/article-1"]);
  assert.deepEqual(p.data.article.blocks, article.blocks);
  const markup = require("node:fs").readFileSync(
    "dist/pages/article/index.wxml",
    "utf8",
  );
  assert.match(markup, /<content-view blocks=/);
  assert.doesNotMatch(markup, /rich-text|web-view/);
});
test("invalid and ambiguous links make no request", async () => {
  for (const o of [
    {},
    { id: "../admin" },
    { official: "no" },
    { official: "1", id: "a" },
  ]) {
    const p = page(o);
    await p.load();
    assert.equal(p.data.error, "文章链接无效");
  }
  assert.deepEqual(calls, []);
});
test("missing intro and unpublished article show empty states without old content", async () => {
  const p = page();
  await p.load();
  api.request = async () => {
    throw new api.ApiError("missing", 404, "NOT_FOUND");
  };
  await p.load();
  assert.equal(p.data.article, null);
  assert.equal(p.data.empty, "文章尚未发布或已下架");
  const intro = page({ official: "1" });
  await intro.load();
  assert.equal(intro.data.empty, "野小子官方介绍即将发布");
});
test("failure clears content and retry recovers", async () => {
  const p = page();
  await p.load();
  api.request = async () => {
    throw new Error("网络失败");
  };
  await p.load();
  assert.equal(p.data.article, null);
  assert.equal(p.data.error, "网络失败");
  api.request = async () => article;
  await p.load();
  assert.equal(p.data.error, "");
  assert.equal(p.data.loading, false);
});
test("older loads hide and unload cannot restore stale article", async () => {
  const p = page();
  let finish;
  api.request = () => new Promise((r) => (finish = r));
  const old = p.load();
  api.request = async () => ({ ...article, title: "新文章" });
  await p.load();
  finish(article);
  await old;
  assert.equal(p.data.article.title, "新文章");
  api.request = () => new Promise((r) => (finish = r));
  const hidden = p.load();
  p.onHide();
  finish(article);
  await hidden;
  assert.equal(p.data.article, null);
  const unloaded = p.load();
  p.onUnload();
  finish(article);
  await unloaded;
  assert.equal(p.data.article, null);
});
