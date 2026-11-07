const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { enterPage } = require("../dist/utils/page-motion.js");

function page() {
  return {
    data: { pageMotionClass: "", privateDraft: "keep", busy: true },
    updates: [],
    setData(update) { this.updates.push(update); Object.assign(this.data, update); },
  };
}

test("every native page shares the arrival helper without replacing navigation semantics", () => {
  const root = path.resolve(__dirname, "../src");
  const routes = JSON.parse(fs.readFileSync(path.join(root, "app.json"))).pages;
  for (const route of routes) {
    const source = fs.readFileSync(path.join(root, route + ".ts"), "utf8");
    const markup = fs.readFileSync(path.join(root, route + ".wxml"), "utf8");
    assert.match(source, /import\s*{\s*enterPage\s*}\s*from\s*["']\.\.\/\.\.\/utils\/page-motion["']/);
    assert.match(source, /pageMotionClass:\s*["']["']/);
    assert.match(source, /onShow\(\)\s*{\s*enterPage\(this\);/);
    assert.equal((source.match(/enterPage\(this\)/g) || []).length, 1, route);
    assert.match(markup.match(/^\s*<view\b[^>]*>/)?.[0] || "",
      /class="[^"]*\bpage-motion\b[^\"]*{{pageMotionClass}}/);
  }
});

test("repeat shows alternate animation names and preserve business state", () => {
  const p = page();
  assert.equal(p.data.pageMotionClass, "");
  enterPage(p); enterPage(p); enterPage(p);
  assert.deepEqual(p.updates, [
    {pageMotionClass: "motion-enter-a"},
    {pageMotionClass: "motion-enter-b"},
    {pageMotionClass: "motion-enter-a"},
  ]);
  assert.equal(p.data.privateDraft, "keep");
  assert.equal(p.data.busy, true);
});

test("different page instances restart independently and an optional effect cannot block a page", () => {
  const first = page(), second = page();
  enterPage(first); enterPage(first); enterPage(second);
  assert.equal(second.data.pageMotionClass, "motion-enter-a");
  assert.doesNotThrow(() => enterPage({setData() { throw new Error("view unavailable"); }}));
});

test("arrival motion stays visible, bounded and disabled when the host reports reduced motion", () => {
  const css = fs.readFileSync(path.resolve(__dirname, "../src/styles/motion.wxss"), "utf8");
  assert.match(css, /animation-duration:\s*170ms/);
  assert.match(css, /\.page-motion\s*{\s*opacity:\s*1/);
  const arrivals = [...css.matchAll(/@keyframes wildboy-page-enter-[ab]\s*{\s*from\s*{([^}]+)}\s*to\s*{([^}]+)}/g)];
  assert.equal(arrivals.length, 2);
  for (const arrival of arrivals) {
    assert.match(arrival[1], /opacity:\s*\.92/);
    assert.doesNotMatch(arrival[0], /transform:/);
  }
  assert.doesNotMatch(css, /opacity:\s*0(?:[;\s}]|$)|visibility:\s*hidden|display:\s*none/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*animation:\s*none\s*!important/);
});

test("dialog damping is bounded to panels and has a reduced-motion alternative", () => {
  const css = fs.readFileSync(path.resolve(__dirname, "../src/styles/motion.wxss"), "utf8");
  assert.match(css, /\.motion-dialog-enter\s*{[^}]*opacity:\s*1;[^}]*180ms/);
  assert.match(css, /@keyframes wildboy-dialog-enter\s*{\s*from\s*{[^}]*scale\(\.98\)/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*\.motion-dialog-enter[^}]*animation:\s*none/);
});
