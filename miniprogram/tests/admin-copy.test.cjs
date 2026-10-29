const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function source(page, extension = "wxml") {
  return fs.readFileSync(
    path.join(__dirname, `../src/pages/${page}/index.${extension}`),
    "utf8",
  );
}

test("compact admin pages keep privacy and account-switch notices", () => {
  const login = source("admin-login");
  assert.match(login, /切换为管理身份/);
  assert.match(login, /不改变微信账号权限/);
  assert.match(login, /密码不保存到设备/);
  assert.match(source("admin-roster"), /仅用于本次活动核验与联系，请勿外传/);
  assert.match(source("admin-editor"), /仅必要时开启，并在活动说明中写明用途/);
});

test("compact admin pages retain publication and stock consequences", () => {
  assert.match(source("admin-activities"), /取消所有已确认报名并保留记录/);
  assert.match(source("admin-activities"), /不会自动通知/);
  const legal = source("admin-legal");
  assert.match(legal, /草稿不公开，发布后生效/);
  assert.match(legal, /微信隐私声明需另行配置/);
  assert.match(source("admin-legal", "ts"), /用户需重新确认。旧版本与同意记录保留/);
  assert.match(source("admin-product"), /可售库存不含待付款订单占用数量/);
  const orders = source("admin-orders");
  assert.match(orders, /库存暂保留，请勿手动回库/);
  assert.match(orders, /确认订单 {{item.orderNo}} 已实际发货/);
  assert.match(orders, /item.status === 'PAID'/);
});

test("admin headings and field labels stand without redundant introductions", () => {
  assert.match(source("admin-activities"), /class="title">活动管理/);
  assert.doesNotMatch(source("admin-activities"), /管理活动内容与报名情况/);
  assert.doesNotMatch(source("admin-shop"), /服务器核验管理身份/);
  const login = source("admin-login");
  assert.match(login, /class="label">管理员账号/);
  assert.match(login, /class="label">密码/);
  assert.doesNotMatch(login, /placeholder="请输入/);
});
