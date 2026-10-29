const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const page = (name) => fs.readFileSync(path.join(__dirname, "../dist/pages", name, "index.wxml"), "utf8");

test("consent links stay inline and outside native labels to avoid checkbox activation", () => {
  for (const name of ["login", "register", "checkout"]) {
    const markup = page(name);
    const group = markup.match(/<checkbox-group\b[^>]*>([\s\S]*?)<\/checkbox-group>/)?.[1];
    assert.ok(group, name);
    assert.doesNotMatch(group, /<label\b|<[^>]+\sbindtap=/);
    assert.match(group, /<checkbox\b[^>]*aria-label="[^"]+"/);
    assert.match(group, /我已阅读并同意当前版本/);
    for (const [text, handler, field] of [
      ["隐私政策", name === "login" ? "readPrivacy" : "privacy", "privacy"],
      ["用户协议", name === "login" ? "readTerms" : "terms", "terms"],
    ]) {
      assert.match(group, new RegExp(`<text\\b[^>]*class="legal-link"[^>]*catchtap="${handler}"[^>]*aria-role="link"[^>]*${field}\\.version[^>]*>《${text}》<\\/text>`));
      assert.equal((markup.match(new RegExp(`catchtap="${handler}"`, "g")) || []).length, 1);
      assert.doesNotMatch(markup, new RegExp(`bindtap="${handler}"`));
    }
    assert.doesNotMatch(markup, /class="documents"|点击阅读|阅读隐私政策（版本|阅读用户协议（版本/);
  }
});

test("concise forms retain personal-data purposes and financial uncertainty warnings", () => {
  assert.match(page("register"), /所有参与人的姓名、{{activity.identityRequired/);
  assert.match(page("register"), /身份核验、组织与联系/);
  assert.match(page("checkout"), /订单履约处理收货与支付信息/);
  assert.match(page("checkout"), /支付状态待核对，库存暂时保留/);
  assert.match(page("checkout"), /已付款请刷新结果，勿重复下单/);
  assert.match(page("orders"), /暂不支持在线退款或修改地址/);
  assert.match(page("detail"), /天气、路况可能变化/);
  assert.match(page("privacy"), /document.content/);
});
