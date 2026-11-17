// 2026-11-16 读取已保存的 Pen 设计源数据，生成 docs/ui-refactor/design-map.json。
// 读取对象为保存后的设计图文件.pen（非生成时内存），输出每页画板的节点统计、
// 使用的变量/色板、文本采样与元数据，作为实现映射与版本锚点。
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PEN = path.join(__dirname, "..", "设计图文件.pen");
const OUT = path.join(__dirname, "..", "..", "docs", "ui-refactor", "design-map.json");
const raw = fs.readFileSync(PEN);
const doc = JSON.parse(raw.toString("utf8"));
const digest = crypto.createHash("sha256").update(raw).digest("hex").slice(0, 16);

// 页面 → 画板映射（与 docs/ui-refactor/plan.md 清单一致）
const MAP = {
  web: [
    ["登录", "/login", "admin/src/views/LoginView.vue", ["PoJPW"]],
    ["运营工作台", "/operations", "admin/src/views/OperationsView.vue", ["jooRk", "mS4Tg"]],
    ["活动管理", "/activities", "admin/src/views/ActivitiesView.vue", ["dxs6Q", "UFr8b"]],
    ["新建/编辑活动", "/activities/new|/activities/:id/edit", "admin/src/views/EditorView.vue", ["CCqVo", "afpqo", "jlF19", "AypoA"]],
    ["活动说明与图文", "/activities/:id/edit（图文分栏）", "admin/src/views/EditorView.vue", ["b5wac"]],
    ["报名名单", "/activities/:id/registrations", "admin/src/views/RosterView.vue", ["A7gFGK", "tSb5v"]],
    ["活动模板", "/templates", "admin/src/views/TemplatesView.vue", ["VZIjm", "AG35F", "dg1pU"]],
    ["活动订单", "/activity-orders", "admin/src/views/ActivityOrdersView.vue", ["xHqTA", "XErK6", "othlP", "D02kiL"]],
    ["商城管理", "/shop", "admin/src/views/ShopView.vue", ["jv8du", "jLyLI", "VrBZD", "irybD"]],
    ["商品分类", "/shop/categories", "admin/src/views/ProductCategoriesView.vue", ["Z4snv", "ie3cy"]],
    ["退款售后", "/refunds", "admin/src/views/RefundsView.vue", ["kc418", "pKPcb", "SLpMS"]],
    ["发货上报", "/shipping-reports", "admin/src/views/ShippingReportsView.vue", ["sPQxB", "MuHVO"]],
    ["用户管理", "/users", "admin/src/views/UsersView.vue", ["Nwr2l", "a35E2", "z7k8T", "wqrUO"]],
    ["会员管理", "/memberships", "admin/src/views/MembershipsView.vue", ["x9gG8s", "V6uBE", "vruDl", "Asyql"]],
    ["文章管理", "/articles", "admin/src/views/ArticlesView.vue", ["hSL6j"]],
    ["文章编辑", "/articles/new|/articles/:id/edit", "admin/src/views/ArticleEditorView.vue", ["Rkx83", "MYBYC", "LzCfb", "TNona", "P6RC06"]],
    ["协议管理", "/legal", "admin/src/views/LegalView.vue", ["Pr4cO", "y49HRk"]],
    ["消息管理", "/notifications", "admin/src/views/NotificationsView.vue", ["vMuxZ", "Sfyhp"]],
    ["基础配置", "/settings", "admin/src/views/SettingsView.vue", ["DbJts", "xNcp5", "k0nVX", "yJl1Q"]],
    ["管理员账号", "/settings/admin-account", "admin/src/views/AdminAccountView.vue", ["UHolL", "jwaEj"]],
  ],
  mini: [
    ["首页（保护）", "pages/home/index", "miniprogram/src/pages/home/*", ["Q78i6"]],
    ["活动列表", "pages/activities/index", "miniprogram/src/pages/activities/*", ["zdkYd"]],
    ["活动详情", "pages/detail/index", "miniprogram/src/pages/detail/*", ["mzsV1", "KGp4I"]],
    ["填写报名", "pages/register/index", "miniprogram/src/pages/register/*", ["v2aly"]],
    ["报名结果", "pages/signup-success/index", "miniprogram/src/pages/signup-success/*", ["ScdDU"]],
    ["我的报名", "pages/registrations/index", "miniprogram/src/pages/registrations/*", ["bVFjG"]],
    ["活动消息", "pages/notifications/index", "miniprogram/src/pages/notifications/*", ["fhwJH"]],
    ["我的活动订单", "pages/activity-orders/index", "miniprogram/src/pages/activity-orders/*", ["3yIfJ", "kx38q"]],
    ["商城", "pages/shop/index", "miniprogram/src/pages/shop/*", ["E7QA9", "mGkPt"]],
    ["商品详情", "pages/product/index", "miniprogram/src/pages/product/*", ["YbhOC"]],
    ["确认订单", "pages/checkout/index", "miniprogram/src/pages/checkout/*", ["KgWt0", "vaPck"]],
    ["我的订单", "pages/orders/index", "miniprogram/src/pages/orders/*", ["kD4zv", "Xwjvy"]],
    ["收货地址", "pages/addresses/index", "miniprogram/src/pages/addresses/*", ["AIEqe", "MJO4e"]],
    ["我的山野", "pages/mine/index", "miniprogram/src/pages/mine/*", ["asCpo", "tZwlR"]],
    ["联系资料", "pages/profile/index", "miniprogram/src/pages/profile/*", ["u9yYo", "CX7SL"]],
    ["微信登录", "pages/login/index", "miniprogram/src/pages/login/*", ["r2Vg3F", "KGIQF"]],
    ["文章", "pages/article/index", "miniprogram/src/pages/article/*", ["jy5Vc"]],
    ["隐私政策", "pages/privacy/index", "miniprogram/src/pages/privacy/*", ["r5wRDb"]],
    ["管理员验证", "pages/admin-login/index", "miniprogram/src/pages/admin-login/*", ["Jt0Pi", "r2Js0", "ouWUv"]],
    ["活动目录", "pages/admin-activities/index", "miniprogram/src/pages/admin-activities/*", ["hRh1p"]],
    ["活动编辑", "pages/admin-editor/index", "miniprogram/src/pages/admin-editor/*", ["yNHlA", "h50occ", "wfShm", "NFbtm", "YIDDP"]],
    ["报名名单", "pages/admin-roster/index", "miniprogram/src/pages/admin-roster/*", ["X6euG"]],
    ["协议管理", "pages/admin-legal/index", "miniprogram/src/pages/admin-legal/*", ["E7GexY", "oXo8G", "vm86H"]],
    ["商品库存", "pages/admin-shop/index", "miniprogram/src/pages/admin-shop/*", ["W9vBy"]],
    ["商品编辑", "pages/admin-product/index", "miniprogram/src/pages/admin-product/*", ["IWwi8", "L50wpo"]],
    ["订单发货", "pages/admin-orders/index", "miniprogram/src/pages/admin-orders/*", ["R9RNM", "p6tHR", "q9SqVI"]],
    ["图文编辑", "pages/admin-content/index", "miniprogram/src/pages/admin-content/*", ["qF4od", "yxY9p", "FGTf9"]],
    ["用户管理", "pages/admin-users/index", "miniprogram/src/pages/admin-users/*", ["gbfMY", "n2142A"]],
    ["活动订单与退款", "pages/admin-activity-orders/index", "miniprogram/src/pages/admin-activity-orders/*", ["sreFA"]],
    ["会员管理", "pages/admin-memberships/index", "miniprogram/src/pages/admin-memberships/*", ["aoeMz"]],
  ],
};

function analyze(id) {
  const art = doc.children.find((c) => c.id === id);
  if (!art) return { id, missing: true };
  let nodes = 0, texts = 0, icons = 0;
  const vars = new Set(), hexes = new Set(), samples = [];
  (function walk(n) {
    nodes++;
    if (n.type === "text") { texts++; if (samples.length < 6 && n.content) samples.push(n.content.slice(0, 22)); }
    if (n.type === "icon") icons++;
    if (typeof n.fill === "string" && n.fill.startsWith("$")) vars.add(n.fill);
    if (typeof n.fill === "string" && n.fill.startsWith("#")) hexes.add(n.fill);
    for (const c of n.children || []) walk(c);
  })(art);
  return {
    id, name: art.name, w: art.width, h: art.height,
    route: art.metadata && art.metadata.route,
    state: art.metadata && art.metadata.state,
    nodes, texts, icons,
    vars: [...vars].sort(),
    hexTop: [...hexes].sort().slice(0, 8),
    textSamples: samples,
  };
}

const result = {
  generatedAt: "2026-11-16",
  sourceFile: "design/设计图文件.pen",
  penVersion: doc.version,
  designDigest: "sha256:" + digest + "（前 16 位，锚定本次读取的文件版本）",
  artboardTotal: doc.children.length,
  variables: Object.keys(doc.variables),
  pages: {
    web: MAP.web.map(([module, route, file, ids]) => ({
      端: "web", 模块: module, 路由: route, 实现文件: file,
      画板: ids.map(analyze),
      数据来源: "/api/v1/admin/**（管理鉴权）", 验证方式: "vitest + npm run build + 人工对照",
    })),
    mini: MAP.mini.map(([module, route, file, ids]) => ({
      端: "mini", 模块: module, 路由: route, 实现文件: file,
      画板: ids.map(analyze),
      数据来源: "/api/v1/**（用户态）或 /admin/**（管理页）", 验证方式: "node --test 源码断言 + 构建",
    })),
  },
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(result, null, 1));
const missing = [...result.pages.web, ...result.pages.mini]
  .flatMap((p) => p.画板.filter((a) => a.missing).map((a) => p.模块 + ":" + a.id));
console.log("design-map.json 写入完成；缺失画板:", missing.length ? missing : "无");
console.log("设计版本锚点:", result.designDigest, "| 画板总数:", result.artboardTotal);
