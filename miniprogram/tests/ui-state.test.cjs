const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "../src");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const routes = JSON.parse(read("app.json")).pages;

test("shared native state component is global, visible by default and preserves caller slots", () => {
  assert.equal(JSON.parse(read("app.json")).usingComponents["ui-state"], "/components/ui-state/index");
  assert.equal(JSON.parse(read("components/ui-state/index.json")).component, true);
  const script = read("components/ui-state/index.ts");
  assert.match(script, /styleIsolation:\s*"apply-shared"/);
  assert.match(script, /kind:\s*{\s*type:\s*String,\s*value:\s*"empty"/);
  const markup = read("components/ui-state/index.wxml");
  assert.match(markup, /aria-role="status"/);
  assert.match(markup, /<slot\s*\/>/);
  assert.match(markup, /icons\/empty\.svg/);
  assert.match(markup, /icons\/error\.svg/);
  assert.doesNotMatch(markup, /wx:(?:if|elif)="[^"]*slot|\shidden=/);
});

test("user pages use shared states and preserve pagination as a compact region", () => {
  for (const route of routes) {
    const markup = read(route + ".wxml");
    for (const match of markup.matchAll(/class="([^"]*)"/g))
      assert.ok(!match[1].split(/\s+/).includes("state"), route + " retains a legacy state host");
    assert.match(markup, /<ui-state\b/, route);
  }
  for (const route of ["activities", "registrations"])
    assert.match(read(`pages/${route}/index.wxml`), /<ui-state[^>]*wx:if="{{loadingMore}}"[^>]*kind="loading"[^>]*compact="{{true}}"/);
  for (const route of ["notifications"])
    assert.match(read(`pages/${route}/index.wxml`), /<ui-state[^>]*wx:if="{{!items.length && !loading && !error}}"[^>]*kind="empty"/);
  assert.match(read("pages/activities/index.wxml"), /<ui-state[^>]*wx:elif="{{!items.length && !error}}"[^>]*kind="empty"/);
});

test("state spinner has one bounded speed, compact sizing and a reduced-motion fallback", () => {
  const css = read("components/ui-state/index.wxss");
  assert.match(css, /animation:\s*ui-state-spin\s+800ms\s+linear\s+infinite/);
  assert.match(css, /\.ui-state-compact \.ui-state-spinner\s*{[^}]*width:\s*16px/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*animation:\s*none/);
  assert.doesNotMatch(css, /min-height:\s*(?:100vh|100%)/);
  assert.doesNotMatch(css, /opacity:\s*0(?:;|\s|})|visibility:\s*hidden/);
});

test("user icon controls share assets and retain their accessible actions", () => {
  for (const route of routes) {
    const markup = read(route + ".wxml");
    assert.doesNotMatch(markup, /[↗›▣✓＋−→]|>W<|>×</, route);
    for (const match of markup.matchAll(/src="(\/assets\/icons(?:-slate)?\/[^"{}]+\.svg)"/g))
      assert.ok(fs.existsSync(path.join(root, match[1])), match[1]);
  }
  const product = read("pages/product/index.wxml");
  assert.match(product, /data-delta="-1"[\s\S]*?aria-label="减少购买数量"/);
  assert.match(product, /data-delta="1"[\s\S]*?aria-label="增加购买数量"/);
  assert.match(product, /icons-slate\/minus\.svg/);
  assert.match(product, /icons-slate\/plus\.svg/);
  for (const route of ["register", "orders"])
    assert.match(read(`pages/${route}/index.wxml`), /<ui-dialog /);
  assert.match(read("components/ui-dialog/index.wxml"), /class="ui-dialog-panel motion-dialog-enter"/);
});
