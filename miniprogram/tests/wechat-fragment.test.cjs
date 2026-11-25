const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { config } = require("../dist/config.js");
const { prepareWechatNodes } = require("../dist/utils/wechat-rich-text.js");

test("WeChat fragments retain styled nested text and table geometry while resolving every image", () => {
  const text = { type: "text", text: "山风  与海盐" };
  const table = {
    name: "table",
    attrs: { style: "width:650px;border-collapse:collapse" },
    children: [{ name: "tr", children: [
      { name: "td", attrs: { colspan: "2", style: "color:#335533" }, children: [text] },
    ] }],
  };
  const sources = ["/assets/hero-hiking.jpg", "/assets/uploads/photo-1.jpg", "https://mmbiz.qpic.cn/a/0"];
  const input = [{ name: "div", attrs: { style: "width:640px;max-width:320px" }, children: [
    table, ...sources.map(src => ({ name: "img", attrs: { src, style: "width:45%" } })),
  ] }];
  const original = structuredClone(input);
  const [fragment] = prepareWechatNodes(input);
  assert.match(fragment.attrs.style, /max-width:min\(100%,320px\)/);
  assert.equal(fragment.children[0].attrs.style, table.attrs.style);
  const [cell] = fragment.children[0].children[0].children;
  assert.deepEqual(cell.attrs, table.children[0].children[0].attrs);
  assert.deepEqual(cell.children, [text]);
  assert.deepEqual(fragment.children.slice(1).map(node => node.attrs.src), [
    config.apiOrigin + sources[0], config.apiOrigin + sources[1], sources[2],
  ]);
  for (const image of fragment.children.slice(1)) {
    assert.match(image.attrs.style, /width:45%/);
    assert.match(image.attrs.style, /max-width:100%/);
  }
  assert.deepEqual(input, original);
});

test("readers pass native node arrays to the same scrollable renderer and ignore HTML strings", () => {
  for (const reader of ["markdown-view-slate", "content-view-slate"]) {
    const prefix = `dist/components/${reader}/index`;
    const config = JSON.parse(fs.readFileSync(prefix + ".json", "utf8"));
    assert.equal(config.usingComponents["wechat-fragment"], "../wechat-fragment/index");
    assert.match(fs.readFileSync(prefix + ".wxml", "utf8"), /<wechat-fragment[^>]+nodes="{{(?:item|block)\.nodes}}"/);
  }
  const markup = fs.readFileSync("dist/components/wechat-fragment/index.wxml", "utf8");
  assert.match(markup, /<scroll-view scroll-x/);
  assert.match(markup, /<rich-text[^>]+nodes="{{renderNodes}}"/);
  assert.deepEqual(prepareWechatNodes("<p>粘贴的原文</p>"), []);
  assert.deepEqual(prepareWechatNodes([{ name: "img", attrs: { src: "", alt: "路线示意图" } }]), [
    { type: "text", text: "路线示意图" },
  ]);
});
