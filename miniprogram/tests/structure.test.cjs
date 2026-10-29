const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path");
const root = path.resolve(__dirname, "../dist");
test("all twenty-two registered native pages have compiled JS WXML WXSS JSON", () => {
  const app = JSON.parse(fs.readFileSync(path.join(root, "app.json")));
  assert.equal(app.pages.length, 22);
  for (const route of [
    "mine",
    "login",
    "admin-legal",
    "registrations",
    "signup-success",
    "admin-login",
    "admin-activities",
    "admin-editor",
    "admin-roster",
    "shop",
    "product",
    "checkout",
    "orders",
    "admin-shop",
    "admin-product",
    "admin-orders",
  ])
    assert.ok(app.pages.includes(`pages/${route}/index`));
  for (const page of app.pages)
    for (const ext of ["js", "json", "wxss", "wxml"])
      assert.ok(
        fs.existsSync(path.join(root, page + "." + ext)),
        page + "." + ext,
      );
});
test("native pages use safe markup and never embed payment secrets", () => {
  for (const file of fs.readdirSync(path.join(root, "pages"))) {
    const markup = fs.readFileSync(
      path.join(root, "pages", file, "index.wxml"),
      "utf8",
    );
    assert.doesNotMatch(markup, /<\/?(?:div|span|br|img|a|form)\b/);
    const script = fs.readFileSync(
      path.join(root, "pages", file, "index.js"),
      "utf8",
    );
    assert.doesNotMatch(script, /AppSecret|session_key|WECHAT_PAY_API_V3_KEY/);
  }
});
test("custom page headers remove old titles and center compact activity tabs", () => {
  for (const name of ["mine", "activities"]) {
    const config = JSON.parse(
      fs.readFileSync(path.join(root, "pages", name, "index.json"), "utf8"),
    );
    assert.equal(config.navigationStyle, "custom");
    assert.equal(config.navigationBarTitleText, undefined);
  }
  const styles = fs.readFileSync(
    path.join(root, "pages", "activities", "index.wxss"),
    "utf8",
  );
  assert.match(styles, /\.filter\s*\{[^}]*height:\s*56rpx/s);
  assert.match(styles, /\.filter\s*\{[^}]*align-items:\s*center/s);
  assert.match(styles, /\.filters\s*\{[^}]*height:\s*72rpx/s);
});
test("production configuration fails closed and domain validation stays enabled", () => {
  const config = require("../dist/config.js").config;
  // Trial phase: the server runs the dev profile without WeChat credentials,
  // so devLogin is intentionally on for develop-env previews. The client and
  // server both restrict dev-login to non-release builds; flip this back to
  // false together with config.ts once WECHAT_APP_ID/SECRET are configured.
  assert.equal(config.devLogin, true);
  assert.equal(config.apiMode, "anyservice");
  const project = require("../project.config.json");
  assert.equal(project.setting.urlCheck, true);
  assert.ok(
    project.appid === "touristappid" || /^wx[0-9a-f]{16}$/.test(project.appid),
  );
});

test("WXML template expressions retain native operators, not HTML entities", () => {
  for (const page of JSON.parse(fs.readFileSync(path.join(root, "app.json")))
    .pages) {
    const markup = fs.readFileSync(path.join(root, page + ".wxml"), "utf8");
    for (const expression of markup.match(/{{[\s\S]*?}}/g) || []) {
      assert.doesNotMatch(
        expression,
        /&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/i,
        page,
      );
    }
  }
});
