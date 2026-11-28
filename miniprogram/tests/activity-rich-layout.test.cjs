const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { prepareWechatNodes } = require("../dist/utils/wechat-rich-text.js");

test("native activity detail connects formatted content through the active reader", () => {
  const dir = path.join(__dirname, "../dist");
  const detail = require(path.join(dir, "pages/detail/index.json"));
  assert.match(detail.usingComponents["content-view"], /content-view-slate/);
  assert.match(fs.readFileSync(path.join(dir, "pages/detail/index.wxml"), "utf8"), /activity-layout="{{true}}"/);
  assert.match(fs.readFileSync(path.join(dir, "components/content-view-slate/index.wxml"), "utf8"), /activity-layout="{{activityLayout}}"/);
});

test("activity itinerary preserves line breaks, bold text and code without changing other content", () => {
  const text = (text) => ({ type: "text", text });
  const lines = text("集合时间：07:30\n集合地点：北门");
  const code = text("first\nsecond");
  const nodes = [
    { name: "p", attrs: { style: "margin:22px" }, children: [lines, { name: "strong", children: [text("请准时\n到场")] }] },
    { name: "pre", children: [{ name: "code", children: [code] }] },
    { name: "p", children: [{ name: "img", attrs: { src: "https://example.com/photo.jpg" } }] },
  ];
  const [p, pre, picture] = prepareWechatNodes(nodes, true);
  assert.deepEqual(p.children.slice(0,3), [text("集合时间：07:30"), { name:"br" }, text("集合地点：北门")]);
  assert.deepEqual(p.children[3].children.map((x) => x.name || x.text), ["请准时", "br", "到场"]);
  assert.match(p.attrs.style, /margin:22px/);
  assert.deepEqual(pre.children[0].children, [code]);
  assert.match(picture.children[0].attrs.style, /max-width:100%/);
  assert.deepEqual(prepareWechatNodes(nodes)[0].children[0], lines);
});
