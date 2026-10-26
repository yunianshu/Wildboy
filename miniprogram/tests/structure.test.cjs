const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path");
const root = path.resolve(__dirname, "../dist");
test("all six registered native pages have compiled JS WXML WXSS JSON", () => {
  const app = JSON.parse(fs.readFileSync(path.join(root, "app.json")));
  assert.equal(app.pages.length, 6);
  for (const page of app.pages)
    for (const ext of ["js", "json", "wxss", "wxml"])
      assert.ok(
        fs.existsSync(path.join(root, page + "." + ext)),
        page + "." + ext,
      );
});
test("native pages have no unsupported HTML tags or direct payment API", () => {
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
    assert.doesNotMatch(script, /requestPayment|AppSecret|session_key/);
  }
});
test("production configuration fails closed and domain validation stays enabled", () => {
  const config = require("../dist/config.js").config;
  assert.equal(config.devLogin, false);
  const project = require("../project.config.json");
  assert.equal(project.setting.urlCheck, true);
  assert.equal(project.appid, "touristappid");
});
