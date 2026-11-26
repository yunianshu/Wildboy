const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path");
const root = path.resolve(__dirname, "../dist");
test("all registered native pages have compiled JS WXML WXSS JSON", () => {
  const app = JSON.parse(fs.readFileSync(path.join(root, "app.json")));
  assert.equal(app.pages.length, 21);
  assert.equal(new Set(app.pages).size, app.pages.length);
  assert.equal(app.pages.filter((route) => route.includes("admin")).length, 0);
  for (const route of [
    "article",
    "activity-orders",
    "notifications",
    "profile",
    "display-profile",
    "mine",
    "login",
    "registrations",
    "signup-success",
    "shop",
    "product",
    "checkout",
    "orders",
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
test("custom headers and shared status tabs retain native layout and touch targets", () => {
  for (const name of ["mine", "activities"]) {
    const config = JSON.parse(
      fs.readFileSync(path.join(root, "pages", name, "index.json"), "utf8"),
    );
    assert.equal(config.navigationStyle, "custom");
    assert.equal(config.navigationBarTitleText, undefined);
  }
  const styles = fs.readFileSync(path.join(root, "styles/section-tabs.wxss"), "utf8");
  assert.match(styles, /button\.section-tab\s*\{[^}]*min-height:\s*44px/s);
  assert.match(styles, /button\.section-tab\s*\{[^}]*align-items:\s*center/s);
  assert.match(styles, /button\.section-tab-current\s*\{[^}]*background:\s*var\(--rf-primary-text\)/s);
  assert.match(styles, /\.section-tab-panel\s*\{[^}]*border-top:\s*3px solid var\(--rf-primary-text\)/s);
  for (const page of ["activities", "shop", "orders", "activity-orders", "registrations"]) {
    const pageStyles = fs.readFileSync(path.join(root, "pages", page, "index.wxss"), "utf8");
    const markup = fs.readFileSync(path.join(root, "pages", page, "index.wxml"), "utf8");
    assert.match(pageStyles, /styles\/section-tabs\.wxss/, page);
    assert.match(markup, /section-tab-current/, page);
    assert.match(markup, /section-tab-panel/, page);
  }
});
test("production configuration uses the public HTTPS API and keeps domain validation enabled", () => {
  const config = require("../dist/config.js").config;
  assert.equal(config.apiOrigin, "https://api.wildboy.com.cn");
  assert.equal(config.devLogin, false);
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


test("product sharing stays in the padded content flow above the purchase bar", () => {
  const markup = fs.readFileSync(path.join(root, "pages/product/index.wxml"), "utf8");
  const content = markup.match(/<view class="page product-content">([\s\S]*)<\/view>\s*<view class="sticky-action purchase-bar">/);
  assert.ok(content, "product content must precede the purchase bar");
  assert.match(content[1], /<view class="product-share">[\s\S]*open-type="share"/);
  const styles = fs.readFileSync(path.join(root, "pages/product/index.wxss"), "utf8");
  assert.match(styles, /\.product-share\s*\{[^}]*padding-top:\s*16px/);
  assert.match(styles, /\.product-share button\s*\{[^}]*width:\s*100%/);
});

test("checkout quantity controls have a compact three-column layout", () => {
  const styles = fs.readFileSync(path.join(root, "pages/checkout/index.wxss"), "utf8");
  assert.match(styles, /\.order-product-info \.action-row\s*\{[^}]*display:\s*grid/);
  assert.match(styles, /\.order-product-info \.action-row\s*\{[^}]*grid-template-columns:\s*44px minmax\(0,1fr\) 44px/);
  assert.match(styles, /\.order-product-info \.action-row \.secondary\s*\{[^}]*min-height:\s*44px/);
  assert.match(styles, /\.order-product-info \.action-row text\s*\{[^}]*white-space:\s*nowrap/);
});

test("shared controls keep block actions and quiet text actions distinct", () => {
  const styles = fs.readFileSync(path.join(root, "styles/slate-components.wxss"), "utf8");
  assert.match(styles, /button\.ui-button-block\s*\{\s*width:\s*100%/);
  assert.match(styles, /\.page button\.text-button[^{]*\{[^}]*background:\s*transparent/);
  assert.match(styles, /\.page button\.text-button[^{]*\{[^}]*min-height:\s*44px/);
});

test("address selection separates maintenance from the primary choice", () => {
  const markup = fs.readFileSync(path.join(root, "pages/addresses/index.wxml"), "utf8");
  assert.match(markup, /class="address-secondary-actions"/);
  assert.match(markup, /class="text-button danger-text"[^>]*catchtap="remove"/);
  const styles = fs.readFileSync(path.join(root, "pages/addresses/index.wxss"), "utf8");
  assert.match(styles, /\.address-actions\s*\{[^}]*justify-content:\s*space-between/);
  assert.match(styles, /\.address-actions \.select-address\s*\{[^}]*min-height:\s*44px/);
});
