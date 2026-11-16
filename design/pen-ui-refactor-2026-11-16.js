// 2026-11-16 全端重构设计补齐：
//  新增 小程序 / 活动订单、小程序管理 / 活动订单与退款、小程序管理 / 会员管理、
//      Web / 发货上报、Web / 发货上报 · 补报确认；
//  更新 Web / 运营工作台（补「发货上报待处理」指标卡）与全部 Web 画板侧栏
//      「商城」组的「发货上报」导航项（与 admin/src/App.vue 导航一致）。
// 约定与 pen-web-admin-recolor-v2 一致：先备份、只增不改既有节点（除两处注明更新）、
// 保存后做结构校验（JSON 可回读、id 全局唯一、新画板字段齐全）。
const fs = require("fs");
const path = require("path");

const PEN = path.join(__dirname, "设计图文件.pen");
const BACKUP = path.join(__dirname, "设计图文件.pen.bak-ui-refactor-2026-11-16");

const doc = JSON.parse(fs.readFileSync(PEN, "utf8"));

// ---------- id 生成与工具 ----------
const used = new Set();
(function collect(n) {
  used.add(n.id);
  for (const c of n.children || []) collect(c);
})(doc);
const CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
function nid() {
  for (;;) {
    let s = "";
    for (let i = 0; i < 5; i++) s += CHARS[(Math.random() * CHARS.length) | 0];
    if (!used.has(s)) { used.add(s); return s; }
  }
}
function reid(node) {
  // 深拷贝并重编全部 id（变量引用保持）
  const copy = JSON.parse(JSON.stringify(node));
  (function walk(n) { n.id = nid(); for (const c of n.children || []) walk(c); })(copy);
  return copy;
}
const T = (name, content, o = {}) => ({
  type: "text", id: nid(), name, content,
  fill: o.fill || "$wb-ink", lineHeight: o.lineHeight || 1.5,
  fontFamily: o.font || "$wb-font", fontSize: o.size || 14, fontWeight: o.weight || "normal",
  ...(o.width ? { width: o.width, textGrowth: "fixed-width" } : {}),
});
const F = (name, children, o = {}) => ({
  type: "frame", id: nid(), name, children: children || [],
  ...(o.w !== undefined ? { width: o.w } : {}),
  ...(o.h !== undefined ? { height: o.h } : {}),
  ...(o.fill ? { fill: o.fill } : {}),
  ...(o.stroke ? { stroke: o.stroke, strokeWidth: o.strokeWidth || 1 } : {}),
  ...(o.r !== undefined ? { cornerRadius: o.r } : {}),
  ...(o.gap !== undefined ? { gap: o.gap } : {}),
  ...(o.pad ? { padding: o.pad } : {}),
  ...(o.dir ? { layout: o.dir } : {}),
  ...(o.justify ? { justifyContent: o.justify } : {}),
  ...(o.align ? { alignItems: o.align } : {}),
  ...(o.clip ? { clip: true } : {}),
});
const I = (name, icon, o = {}) => ({
  type: "icon", id: nid(), name, icon, library: "lucide",
  width: o.s || 16, height: o.s || 16, fill: o.fill || "$wb-primary",
});
const pill = (label, tone) =>
  F("胶囊 / " + label, [T("文字", label, { size: 12, weight: "600", fill: "$wb-tone-" + tone + "-text", lineHeight: 1.2 })],
    { r: 999, fill: "$wb-tone-" + tone + "-bg", pad: [3, 10], align: "center", justify: "center" });

// ---------- 移动端骨架 ----------
function statusBar() {
  return F("系统状态栏", [
    T("系统时间", "9:41", { size: 14, weight: "600", fill: "$wb-ink", font: "Inter" }),
    F("系统信号", [I("系统 / signal", "signal"), I("系统 / wifi", "wifi"), I("系统 / battery-full", "battery-full")], { gap: 6, align: "center" }),
  ], { w: "fill_container", h: 62, gap: 12, pad: [0, 20], justify: "space_between", align: "center" });
}
function navBar(title) {
  return F("页面导航", [
    F("原生返回热区", [I("返回", "chevron-left", { s: 24 })], { w: 44, h: 44, justify: "center", align: "center" }),
    T("页面标题", title, { size: 20, weight: "600", fill: "$wb-primary", w: "fill_container" }),
    F("微信原生胶囊", [
      I("更多", "ellipsis", { s: 20 }),
      { type: "rectangle", id: nid(), name: "胶囊分隔", fill: "$wb-line", width: 1, height: 16 },
      I("微信退出", "circle", { s: 16 }),
    ], { w: 76, h: 32, r: 16, stroke: "$wb-line", gap: 10, justify: "center", align: "center" }),
  ], { w: "fill_container", h: 64, gap: 8, pad: [0, 16], align: "center" });
}
const mPrimary = (label) =>
  F("主按钮 / " + label, [T("文字", label, { size: 15, weight: "600", fill: "#FFFFFF" })],
    { w: "fill_container", h: 44, r: 10, fill: "$wb-primary", justify: "center", align: "center" });
const mSecondary = (label, w) =>
  F("次按钮 / " + label, [T("文字", label, { size: 14, weight: "600", fill: "$wb-primary" })],
    { w: w || "fill_container", h: 40, r: 10, fill: "$wb-surface", stroke: "$wb-line", justify: "center", align: "center" });
const mInput = (placeholder, h) =>
  F("输入 / " + placeholder, [T("占位", placeholder, { size: 14, fill: "$wb-muted" })],
    { w: "fill_container", h: h || 44, r: 8, fill: "$wb-surface", stroke: "$wb-line", pad: [0, 12], align: "center" });
const mCard = (name, children, o = {}) =>
  F(name, children, { w: "fill_container", r: 12, fill: "$wb-surface", stroke: "$wb-line", pad: 14, gap: 10, dir: "vertical", ...o });

// ---------- 画板 A：小程序 / 活动订单 ----------
function artActivityOrders() {
  const orderPending = mCard("订单 / 待支付 · 龙门山周末徒步", [
    F("标题行", [
      T("活动标题", "龙门山周末徒步", { size: 16, weight: "600", w: "fill_container" }),
      pill("待支付", "warning"),
    ], { gap: 8, align: "center" }),
    T("人数与合计", "2 人 · 合计 ¥200.00", { size: 14, fill: "$wb-ink" }),
    T("原价", "原价 ¥240.00", { size: 12, fill: "$wb-muted" }),
    T("价格明细", "银卡会员价 ¥100.00 × 2 人", { size: 12, fill: "$wb-muted" }),
    T("订单号", "订单号 A404a66a09a7a4447", { size: 12, fill: "$wb-muted" }),
    F("付款提示", [T("文字", "付款截止 11-17 12:00。未确认付款不代表报名成功；支付结果未知时请刷新核对，勿重复报名。", { size: 12, fill: "$wb-ink" })],
      { w: "fill_container", r: 8, fill: "$wb-soft", pad: 10 }),
    F("操作行 / 支付", [
      mPrimary("确认支付 ¥200.00"),
      mSecondary("刷新付款结果", 120),
    ], { gap: 8, align: "center" }),
    mSecondary("取消本单全部报名"),
  ]);
  const orderPaid = mCard("订单 / 已支付 · 假日星空露营", [
    F("标题行", [
      T("活动标题", "假日星空露营", { size: 16, weight: "600", w: "fill_container" }),
      pill("已支付", "success"),
    ], { gap: 8, align: "center" }),
    T("人数与合计", "2 人 · 合计 ¥160.00", { size: 14, fill: "$wb-ink" }),
    T("价格明细", "标准价 ¥80.00 × 2 人", { size: 12, fill: "$wb-muted" }),
    T("订单号", "订单号 A60b1f0c3d8e92a4b", { size: 12, fill: "$wb-muted" }),
    F("操作行 / 售后", [
      mSecondary("退款申请 / 查看进度", 150),
      mSecondary("查看本单参与人", 130),
    ], { gap: 8, align: "center" }),
    F("参与人展开", [
      T("参与人 1", "张三 · 138****5678 · 证件 3502**********1234", { size: 12, fill: "$wb-muted" }),
      T("参与人 2", "李四 · 139****1234 · 证件 未提供", { size: 12, fill: "$wb-muted" }),
    ], { w: "fill_container", r: 8, fill: "$wb-soft", pad: 10, gap: 6, dir: "vertical" }),
  ]);
  const refundPanel = mCard("退款面板 / 待审核", [
    T("状态", "退款待审核 · ¥160.00", { size: 14, weight: "600" }),
    T("原因", "申请原因：行程冲突无法参加", { size: 12, fill: "$wb-muted" }),
    mInput("退款原因（200 字内）", 64),
    mPrimary("申请整单退款"),
    mSecondary("关闭"),
  ]);
  const empty = F("状态 / 暂无记录", [
    I("空态 / inbox", "inbox", { s: 28, fill: "$wb-muted" }),
    T("文字", "暂无活动订单。免费活动记录在“我的报名”。", { size: 13, fill: "$wb-muted" }),
  ], { w: "fill_container", h: 88, gap: 8, dir: "vertical", justify: "center", align: "center" });
  return {
    type: "frame", id: nid(), x: 1910, y: 2800, name: "小程序 / 活动订单", clip: true,
    width: 390, height: 1160, fill: "$wb-bg", layout: "vertical",
    metadata: { type: "screen", route: "pages/activity-orders/index", illustrative: true },
    children: [
      statusBar(), navBar("我的活动订单"),
      F("页面内容", [
        T("说明", "登录后展示本人全部收费活动订单；待付款单提供支付、核对、取消，已支付单提供退款申请。", { size: 12, fill: "$wb-muted" }),
        orderPending, orderPaid, refundPanel, empty,
        mSecondary("加载更多"),
      ], { w: "fill_container", layout: "vertical", pad: [16, 14, 24, 14], gap: 12 }),
    ],
  };
}

// ---------- 画板 B：小程序管理 / 活动订单与退款 ----------
function artAdminActivityOrders() {
  const gate = F("身份与范围提示", [
    I("图标 / shield-check", "shield-check", { s: 16 }),
    T("文字", "已验证管理员 · 仅显示当前收费活动的订单", { size: 12, fill: "$wb-ink" }),
  ], { w: "fill_container", r: 8, fill: "$wb-soft", pad: 10, gap: 8, align: "center" });
  const orderPending = mCard("订单 / 待支付", [
    F("标题行", [T("活动标题", "龙门山周末徒步", { size: 16, weight: "600", w: "fill_container" }), pill("待支付", "warning")], { gap: 8, align: "center" }),
    T("订单号", "订单号 A404a66a09a7a4447", { size: 12, fill: "$wb-muted" }),
    T("人数金额", "2 人 · ¥200.00", { size: 14 }),
    F("操作行", [
      mPrimary("核对支付结果"),
      mSecondary("关闭待付款订单", 130),
    ], { gap: 8, align: "center" }),
    mSecondary("查看本单参与者"),
    F("参与者（脱敏）", [
      T("状态提示", "待付款，报名尚未确认", { size: 12, fill: "$wb-muted" }),
      T("参与人 1", "姓名：张** · 证件：3502**********1234 · 电话：138****5678", { size: 12, fill: "$wb-muted" }),
      mSecondary("查看完整姓名与手机号"),
    ], { w: "fill_container", r: 8, fill: "$wb-soft", pad: 10, gap: 6, dir: "vertical" }),
  ]);
  const orderFree = mCard("订单 / 免支付已确认", [
    F("标题行", [T("活动标题", "城市夜走 · 会员免费", { size: 16, weight: "600", w: "fill_container" }), pill("免支付已确认", "success")], { gap: 8, align: "center" }),
    T("订单号", "订单号 A712c88e21b4f0a63", { size: 12, fill: "$wb-muted" }),
    T("人数金额", "1 人 · 免支付", { size: 14 }),
    mSecondary("取消免付报名"),
  ]);
  const refundCard = mCard("退款处理 / 待审核", [
    T("标题", "退款对应订单：A60b1f0c3d92e0b4c", { size: 14, weight: "600" }),
    T("状态", "退款待审核 · ¥160.00", { size: 13 }),
    T("原因", "申请原因：行程冲突无法参加", { size: 12, fill: "$wb-muted" }),
    mInput("拒绝退款时必须填写原因", 56),
    F("操作行", [
      mPrimary("批准退款"),
      F("危险按钮 / 拒绝退款", [T("文字", "拒绝退款", { size: 14, weight: "600", fill: "$wb-danger" })],
        { w: "fill_container", h: 40, r: 10, fill: "$wb-tone-danger-bg", stroke: "$wb-line", justify: "center", align: "center" }),
    ], { gap: 8, align: "center" }),
    F("操作行 / 兜底", [mSecondary("核对退款结果"), mSecondary("原退款单号重试", 130)], { gap: 8, align: "center" }),
    T("发起说明", "管理员也可在无用户申请时直接发起全额退款（同样进入审核）。", { size: 12, fill: "$wb-muted" }),
  ]);
  const confirmLayer = mCard("确认弹层 / 关闭待付款订单", [
    T("标题", "确认关闭该待付款订单？", { size: 15, weight: "600" }),
    T("内容", "订单 A404a66a09a7a4447 将被关闭并释放名额；仅服务端确认成功后生效。", { size: 13, fill: "$wb-muted" }),
    F("操作行", [mSecondary("返回检查"), mPrimary("确认执行")], { gap: 8, align: "center" }),
  ]);
  return {
    type: "frame", id: nid(), x: 3790, y: 4200, name: "小程序管理 / 活动订单与退款", clip: true,
    width: 390, height: 1210, fill: "$wb-bg", layout: "vertical",
    metadata: { type: "screen", route: "pages/admin-activity-orders/index", illustrative: true },
    children: [
      statusBar(), navBar("活动订单与退款管理"),
      F("页面内容", [
        gate, orderPending, orderFree, refundCard, confirmLayer,
        T("备注", "支持从活动详情带 activityId 进入过滤；参与人完整信息须二次确认后揭示，仅用于履约联系。", { size: 12, fill: "$wb-muted" }),
      ], { w: "fill_container", layout: "vertical", pad: [16, 14, 24, 14], gap: 12 }),
    ],
  };
}

// ---------- 画板 C：小程序管理 / 会员管理 ----------
function artAdminMemberships() {
  const tabs = F("分栏", [
    F("分栏 / 会员等级（选中）", [T("文字", "会员等级", { size: 14, weight: "600", fill: "$wb-primary" })],
      { w: "fill_container", h: 40, r: 10, fill: "$wb-soft", justify: "center", align: "center" }),
    F("分栏 / 用户身份", [T("文字", "用户身份", { size: 14, fill: "$wb-muted" })],
      { w: "fill_container", h: 40, r: 10, justify: "center", align: "center" }),
  ], { w: "fill_container", gap: 8 });
  const chips = F("等级快捷切换", [
    F("新等级", [T("文字", "＋新等级", { size: 13, weight: "600", fill: "$wb-primary" })],
      { h: 32, r: 999, fill: "$wb-surface", stroke: "$wb-line", strokeDash: true, pad: [0, 14], align: "center", justify: "center" }),
    F("胶囊 / 银卡（选中）", [T("文字", "银卡", { size: 13, weight: "600", fill: "#FFFFFF" })], { h: 32, r: 999, fill: "$wb-primary", pad: [0, 14], align: "center", justify: "center" }),
    F("胶囊 / 金卡", [T("文字", "金卡", { size: 13, fill: "$wb-ink" })], { h: 32, r: 999, fill: "$wb-surface", stroke: "$wb-line", pad: [0, 14], align: "center", justify: "center" }),
    F("胶囊 / 钻石（停用）", [T("文字", "钻石（停用）", { size: 13, fill: "$wb-muted" })], { h: 32, r: 999, fill: "$wb-surface", stroke: "$wb-line", pad: [0, 14], align: "center", justify: "center" }),
  ], { w: "fill_container", gap: 8 });
  const switchOn = () =>
    F("开关 / 开", [
      { type: "rectangle", id: nid(), name: "轨道", fill: "$wb-primary", width: 40, height: 22, cornerRadius: 999 },
      { type: "rectangle", id: nid(), name: "滑块", fill: "#FFFFFF", width: 18, height: 18, cornerRadius: 999 },
    ], { w: 40, h: 22, r: 999, justify: "space_between", align: "center", pad: [2, 2] });
  const ruleRow = (label, value, unit) =>
    F("规则 / " + label, [
      F("标题行", [T("文字", label, { size: 13, weight: "600", w: "fill_container" }), switchOn()], { align: "center" }),
      F("选择行", [
        F("选择器", [T("文字", value + " ▾", { size: 13, fill: "$wb-primary" })], { w: "fill_container", h: 36, r: 8, fill: "$wb-surface", stroke: "$wb-line", pad: [0, 10], align: "center" }),
        F("数值输入", [T("文字", unit[0], { size: 13, fill: "$wb-ink" })], { w: 76, h: 36, r: 8, fill: "$wb-surface", stroke: "$wb-line", pad: [0, 10], align: "center", justify: "center" }),
        T("单位", unit[1], { size: 12, fill: "$wb-muted" }),
      ], { gap: 8, align: "center" }),
    ], { w: "fill_container", gap: 6, dir: "vertical" });
  const tierForm = mCard("等级表单 / 编辑银卡", [
    T("表单标题", "编辑等级", { size: 14, weight: "600" }),
    mInput("等级名称，如银卡"),
    F("启用行", [T("文字", "启用等级", { size: 14, w: "fill_container" }), switchOn()], { align: "center" }),
    T("停用说明", "停用后已有会员保留身份，但不享受该等级优惠。", { size: 12, fill: "$wb-muted" }),
    F("排序行", [T("文字", "排序", { size: 14, w: 60 }), F("数值输入", [T("文字", "1", { size: 14 })], { w: 76, h: 36, r: 8, fill: "$wb-surface", stroke: "$wb-line", pad: [0, 10], align: "center", justify: "center" })], { gap: 8, align: "center" }),
    ruleRow("活动优惠", "固定折扣", ["8", "折（8 即八折）"]),
    ruleRow("商城优惠", "立减", ["20", "元"]),
    mPrimary("保存等级"),
  ]);
  const userSection = mCard("分栏 / 用户身份", [
    T("提示", "昵称可能重复，请核对完整用户编号。领队仅为业务身份，不获得管理权限。", { size: 12, fill: "$wb-muted" }),
    F("搜索行", [
      mInput("昵称或完整用户编号"),
      mSecondary("搜索", 72),
    ], { gap: 8, align: "center" }),
    F("过滤行", [
      F("选择器", [T("文字", "全部身份 ▾", { size: 13, fill: "$wb-primary" })], { w: "fill_container", h: 36, r: 8, fill: "$wb-surface", stroke: "$wb-line", pad: [0, 10], align: "center" }),
    ], { w: "fill_container" }),
    F("用户卡 / 李四", [
      F("标题行", [T("昵称与身份", "李四 · 领队", { size: 14, weight: "600", w: "fill_container" }), pill("会员", "user")], { align: "center" }),
      T("编号", "编号：c3d4e5f6-a7b8-49c0-8d1e-2f3a4b5c6d7e", { size: 12, fill: "$wb-muted" }),
      T("当前等级", "当前等级：银卡", { size: 12, fill: "$wb-muted" }),
      F("选择行", [
        F("选择器", [T("文字", "身份：会员 ▾", { size: 13, fill: "$wb-primary" })], { w: "fill_container", h: 36, r: 8, fill: "$wb-surface", stroke: "$wb-line", pad: [0, 10], align: "center" }),
        F("选择器", [T("文字", "分配等级：银卡 ▾", { size: 13, fill: "$wb-primary" })], { w: "fill_container", h: 36, r: 8, fill: "$wb-surface", stroke: "$wb-line", pad: [0, 10], align: "center" }),
      ], { gap: 8 }),
      mSecondary("保存身份"),
    ], { w: "fill_container", r: 10, fill: "$wb-soft", pad: 12, gap: 8, dir: "vertical" }),
    T("空态", "暂无用户，请调整搜索条件", { size: 12, fill: "$wb-muted" }),
  ]);
  return {
    type: "frame", id: nid(), x: 4260, y: 4200, name: "小程序管理 / 会员管理", clip: true,
    width: 390, height: 1330, fill: "$wb-bg", layout: "vertical",
    metadata: { type: "screen", route: "pages/admin-memberships/index", illustrative: true },
    children: [
      statusBar(), navBar("会员管理"),
      F("页面内容", [
        tabs,
        T("提示", "活动、商品优惠分别设置，未开启优惠按原价。", { size: 12, fill: "$wb-muted" }),
        chips, tierForm, userSection,
      ], { w: "fill_container", layout: "vertical", pad: [16, 14, 24, 14], gap: 12 }),
    ],
  };
}

// ---------- Web 骨架 ----------
const W = { sidebar: "#101613", sidebarActive: "#22332B", brandBtn: "#047857", brandText: "#065F46", brandSoft: "#ECFDF5", ink: "#1F2937", muted: "#6B7280", line: "#E5E8EC", appbg: "#F6F7F9", th: "#F9FAFB", tag: "#F3F4F6", dimIcon: "#94A39B", dimText: "#C4CDC7" };
const wT = (content, o = {}) => ({
  type: "text", id: nid(), name: o.name || "文字", content,
  fill: o.fill || W.ink, lineHeight: o.lh || 1.5, fontFamily: "Noto Sans SC",
  fontSize: o.size || 14, fontWeight: o.weight || "normal",
  ...(o.width ? { width: o.width, textGrowth: "fixed-width" } : {}),
});
function navItem(label, icon, active) {
  return F("导航项", [
    I("图标 / " + icon, icon, { fill: W.dimIcon }),
    wT(label, { size: 13, fill: active ? "#FFFFFF" : W.dimText, weight: active ? "700" : "normal" }),
  ], { w: "fill_container", h: 32, fill: active ? W.sidebarActive : W.sidebar, r: 7, pad: [0, 8], gap: 10, align: "center" });
}
function navGroup(label, color, items, extra) {
  const g = F("导航分组", [
    F("分组标签", [wT(label, { size: 11, weight: "600", fill: color })], { pad: [0, 8, 2, 8], gap: 8 }),
    ...items.map((it) => navItem(it[0], it[1], it[2])),
    ...(extra || []),
  ], { w: "fill_container", gap: 2, dir: "vertical" });
  return g;
}
function webSidebar(activeLabel) {
  const item = (label, icon) => navItem(label, icon, label === activeLabel);
  const shopItems = [["商城管理", "shopping-bag"], ["商品分类", "tags"], ["退款售后", "rotate-ccw"], ["发货上报", "truck"]];
  return F("管理侧栏", [
    F("品牌区", [
      F("品牌字", [wT("WILDBOY", { size: 23, weight: "800", fill: "#FFFFFF", lh: 1.2 }), wT("OUTDOOR CLUB", { size: 11, weight: "700", fill: "#74857B", lh: 1.2 })], { dir: "vertical", gap: 3 }),
    ], { pad: [0, 8, 13, 8], gap: 8 }),
    navGroup("运营", "#60A5FA", [["运营工作台", "layout-dashboard"], ["消息管理", "bell"]].map(([l, i]) => [l, i, l === activeLabel])),
    navGroup("活动", "#FB923C", [["活动管理", "mountain"], ["活动模板", "layers"], ["活动订单", "receipt-text"]].map(([l, i]) => [l, i, l === activeLabel])),
    navGroup("商城", "#FBBF24", shopItems.map(([l, i]) => [l, i, l === activeLabel])),
    navGroup("用户", "#A78BFA", [["用户管理", "users"], ["会员管理", "contact"]].map(([l, i]) => [l, i, l === activeLabel])),
    navGroup("内容与设置", "#2DD4BF", [["文章管理", "newspaper"], ["协议管理", "file-text"], ["基础配置", "settings"], ["管理员账号", "shield"]].map(([l, i]) => [l, i, l === activeLabel])),
    F("侧栏底部", [wT("管理员登录中", { size: 11, fill: "#74857B" })], { w: "fill_container", pad: [10, 8, 0, 8] }),
  ], { w: 200, h: "fill_container", fill: W.sidebar, pad: [20, 12], gap: 10, dir: "vertical" });
}
function webTopbar(pageTitle) {
  return F("顶栏", [
    wT("工作后台", { size: 12, fill: W.muted }),
    F("右侧", [
      wT("管理员", { size: 12, fill: W.muted }),
      wT("退出登录", { size: 12, weight: "600", fill: W.brandText }),
    ], { gap: 16 }),
  ], { w: "fill_container", h: 52, fill: "#FFFFFF", pad: [0, 24], gap: 8, justify: "space_between", align: "center" });
}
const wShell = (pageTitle, contentChildren, activeLabel) => ({
  type: "frame", id: nid(), name: "管理后台外壳", width: 1280, height: 800, fill: W.appbg, gap: 0,
  children: [
    webSidebar(activeLabel),
    F("主区域", [
      webTopbar(pageTitle),
      F("页面内容", contentChildren, { w: "fill_container", pad: [16, 24, 24, 24], gap: 14, dir: "vertical" }),
    ], { w: "fill_container", h: "fill_container", dir: "vertical" }),
  ],
});
const wStatusPill = (label, tone) => {
  const tones = {
    success: ["#047857", "#ECFDF5"], warning: ["#92400E", "#FFFbeb"],
    danger: ["#B91C1C", "#FEF2F2"], info: ["#1D4ED8", "#EFF6FF"], neutral: ["#374151", "#F3F4F6"],
  };
  const [fg, bg] = tones[tone];
  return F("状态胶囊 / " + label, [wT(label, { size: 12, weight: "600", fill: fg, lh: 1.2 })],
    { r: 999, fill: bg, pad: [2, 10], align: "center", justify: "center" });
};
const wCellHead = (label, w) =>
  F("单元格 / " + label, [wT(label, { size: 12, weight: "600", fill: W.muted })],
    { w: w || "fill_container", h: "fill_container", gap: 8, pad: [0, 12], align: "center" });
const wCell = (child, w, o = {}) =>
  F("单元格", Array.isArray(child) ? child : [child],
    { w: w || "fill_container", h: "fill_container", gap: 8, pad: [0, 12], align: "center", ...(o.justify ? { justify: o.justify } : {}) });
const wTextBtn = (label, disabled) =>
  wT(label, { size: 13, weight: "600", fill: disabled ? "#9CA3AF" : W.brandText });

// ---------- 画板 D：Web / 发货上报 ----------
function artShippingReports() {
  const COLS = { src: 64, order: "fill", type: 96, status: 110, tries: 64, result: 190, time: 150, op: 88 };
  const header = F("表头", [
    wCellHead("来源", COLS.src), wCellHead("订单号", COLS.order), wCellHead("类型", COLS.type),
    wCellHead("状态", COLS.status), wCellHead("尝试", COLS.tries), wCellHead("最近结果", COLS.result),
    wCellHead("上报时间", COLS.time), wCellHead("操作", COLS.op),
  ], { w: "fill_container", h: 40, fill: W.th, align: "center" });
  const row = (cells, name) =>
    F(name, cells, { w: "fill_container", h: 48, fill: "#FFFFFF", stroke: W.line, strokeWidth: { top: 1 }, align: "center" });
  const rows = [
    row([
      wCell(wT("商城", { size: 13 }), COLS.src),
      wCell([F("订单号文字", [wT("10000000000000000000000000000001", { size: 13 })], { w: "fill_container" })], COLS.order),
      wCell(wT("实体物流", { size: 13 }), COLS.type),
      wCell(wStatusPill("上报失败", "danger"), COLS.status),
      wCell(wT("3", { size: 13, weight: "600" }), COLS.tries),
      wCell(wT("errcode 9400001", { size: 13, fill: W.muted }), COLS.result),
      wCell(wT("—", { size: 13, fill: W.muted }), COLS.time),
      wCell(wTextBtn("补报"), COLS.op),
    ], "数据行 / 商城失败"),
    row([
      wCell(wT("活动", { size: 13 }), COLS.src),
      wCell([F("订单号文字", [wT("20000000000000000000000000000002", { size: 13 })], { w: "fill_container" })], COLS.order),
      wCell(wT("虚拟发货", { size: 13 }), COLS.type),
      wCell(wStatusPill("待上报", "warning"), COLS.status),
      wCell(wT("0", { size: 13 }), COLS.tries),
      wCell(wT("—", { size: 13, fill: W.muted }), COLS.result),
      wCell(wT("—", { size: 13, fill: W.muted }), COLS.time),
      wCell(wTextBtn("补报"), COLS.op),
    ], "数据行 / 活动待上报"),
    row([
      wCell(wT("活动", { size: 13 }), COLS.src),
      wCell([F("订单号文字", [wT("20000000000000000000000000000003", { size: 13 })], { w: "fill_container" })], COLS.order),
      wCell(wT("虚拟发货", { size: 13 }), COLS.type),
      wCell(wStatusPill("已上报", "success"), COLS.status),
      wCell(wT("1", { size: 13 }), COLS.tries),
      wCell(wT("—", { size: 13, fill: W.muted }), COLS.result),
      wCell(wT("2026-11-16 15:04", { size: 13, fill: W.muted }), COLS.time),
      wCell(wT("—", { size: 13, fill: "#D1D5DB" }), COLS.op),
    ], "数据行 / 已上报"),
    row([
      wCell(wT("商城", { size: 13 }), COLS.src),
      wCell([F("订单号文字", [wT("30000000000000000000000000000004", { size: 13 })], { w: "fill_container" })], COLS.order),
      wCell(wT("实体物流", { size: 13 }), COLS.type),
      wCell(wStatusPill("无需上报", "neutral"), COLS.status),
      wCell(wT("0", { size: 13 }), COLS.tries),
      wCell(wT("非微信支付订单，无交易记录", { size: 13, fill: W.muted }), COLS.result),
      wCell(wT("—", { size: 13, fill: W.muted }), COLS.time),
      wCell(wTextBtn("补报", true), COLS.op),
    ], "数据行 / 无需上报"),
  ];
  const filterTab = (label, active) =>
    F("筛选 / " + label, [wT(label, { size: 13, weight: active ? "600" : "normal", fill: active ? W.brandText : "#374151" })],
      { h: 32, r: 8, fill: active ? W.brandSoft : W.tag, pad: [0, 14], align: "center", justify: "center" });
  return {
    type: "frame", id: nid(), x: 13770, y: 9790, name: "Web / 发货上报", clip: true,
    width: 1280, height: 800, fill: W.appbg,
    metadata: { type: "screen", route: "/shipping-reports", illustrative: true },
    children: [wShell("发货上报", [
      F("页头", [
        wT("发货上报", { size: 24, weight: "700" }),
        F("刷新按钮", [wT("刷新", { size: 13, weight: "600", fill: W.ink })], { h: 32, r: 8, fill: "#FFFFFF", stroke: W.line, pad: [0, 14], align: "center", justify: "center" }),
      ], { w: "fill_container", h: 40, justify: "space_between", align: "center" }),
      wT("微信「发货信息管理」要求交易订单发货后上报履约信息。上报失败会自动退避重试，次数耗尽后可在此手动补报；标记“无需上报”的订单（如免支付单）不参与重试。", { size: 13, fill: W.muted }),
      F("筛选", [
        filterTab("全部", false), filterTab("上报失败", true), filterTab("待上报", false),
        filterTab("已上报", false), filterTab("无需上报", false),
      ], { gap: 8 }),
      F("数据表 / 发货上报", [
        F("表格容器", [header, ...rows], { w: "fill_container", r: 8, fill: "#FFFFFF", stroke: W.line, dir: "vertical" }),
      ], { w: "fill_container", dir: "vertical" }),
      F("加载更多", [wT("加载更多", { size: 13, fill: W.muted })], { h: 32, r: 8, fill: "#FFFFFF", stroke: W.line, pad: [0, 16], align: "center", justify: "center" }),
    ], "发货上报")],
  };
}

// ---------- 画板 E：Web / 发货上报 · 补报确认 ----------
function artShippingRetry() {
  const dimContent = F("置底页面", [
    wT("（底层为发货上报列表，弹窗打开时禁止重复提交）", { size: 12, fill: W.muted }),
  ], { w: "fill_container", h: "fill_container", justify: "center", align: "center" });
  const dialog = F("补报确认弹窗", [
    F("弹窗标题", [wT("确认补报发货信息", { size: 16, weight: "700" })], { w: "fill_container" }),
    wT("将向微信重新上报订单 10000000000000000000000000000001 的发货信息。请先确认物流信息无误；微信受理结果以最近结果列与上报时间为准。", { size: 13, fill: W.muted }),
    F("弹窗操作", [
      F("取消", [wT("取消", { size: 13, weight: "600", fill: W.ink })], { w: "fill_container", h: 36, r: 8, fill: "#FFFFFF", stroke: W.line, justify: "center", align: "center" }),
      F("确认补报", [wT("确认补报", { size: 13, weight: "600", fill: "#FFFFFF" })], { w: "fill_container", h: 36, r: 8, fill: W.brandBtn, justify: "center", align: "center" }),
    ], { w: "fill_container", gap: 8 }),
  ], { w: 420, r: 12, fill: "#FFFFFF", stroke: W.line, pad: 20, gap: 12, dir: "vertical" });
  return {
    type: "frame", id: nid(), x: 15120, y: 9790, name: "Web / 发货上报 · 补报确认", clip: true,
    width: 1280, height: 800, fill: W.appbg,
    metadata: { type: "screen", route: "/shipping-reports", state: "retry-confirm", illustrative: true },
    children: [{
      type: "frame", id: nid(), name: "管理后台外壳", width: 1280, height: 800, fill: "#00000033", gap: 0,
      children: [
        webSidebar("发货上报"),
        F("主区域", [
          webTopbar("发货上报"),
          F("页面内容", [dimContent], { w: "fill_container", pad: [16, 24, 24, 24], dir: "vertical", justify: "center", align: "center", gap: 16 }),
        ], { w: "fill_container", h: "fill_container", dir: "vertical" }),
      ],
    }, dialog],
  };
}

// ---------- 更新 1：jooRk 指标卡 ----------
function updateOperationsDashboard() {
  const j = doc.children.find((c) => c.id === "jooRk");
  if (!j) throw new Error("jooRk 不存在");
  let metricsRow = null, shipCard = null;
  (function walk(n) {
    for (const c of n.children || []) {
      if ((c.type === "frame") && (c.name || "").startsWith("横向排列")) {
        const texts = [];
        (function t(x) { for (const k of x.children || []) { if (k.type === "text") texts.push(k.content); t(k); } })(c);
        if (texts.includes("待发货") && texts.includes("实收净额") && texts.includes("付款订单")) {
          metricsRow = c;
          for (const card of c.children || []) {
            const ct = [];
            (function t2(x) { for (const k of x.children || []) { if (k.type === "text") ct.push(k.content); t2(k); } })(card);
            if (ct.includes("待发货")) shipCard = card;
          }
        }
      }
      walk(c);
    }
  })(j);
  if (!metricsRow || !shipCard) throw new Error("运营工作台指标区未找到");
  if (metricsRow.children.some((card) => {
    const ct = [];
    (function t3(x) { for (const k of x.children || []) { if (k.type === "text") ct.push(k.content); t3(k); } })(card);
    return ct.includes("发货上报待处理");
  })) return "已存在，跳过";
  const clone = reid(shipCard);
  (function rewrite(n) {
    if (n.type === "text" && n.content === "待发货") n.content = "发货上报待处理";
    if (n.type === "text" && n.content === "2") n.content = "1";
    for (const c of n.children || []) rewrite(c);
  })(clone);
  metricsRow.children.push(clone);
  return "已新增指标卡";
}

// ---------- 更新 2：全部 Web 画板侧栏补「发货上报」 ----------
function updateWebSidebars() {
  let added = 0, skipped = 0;
  for (const art of doc.children) {
    if (!(art.name || "").startsWith("Web /") || art.id === "13770x") continue;
    // 定位含「退款售后」导航项的分组
    let refundItem = null, parent = null;
    (function walk(n, p) {
      for (const c of n.children || []) {
        const texts = [];
        (function t(x) { for (const k of x.children || []) { if (k.type === "text") texts.push(k.content); t(k); } })(c);
        if (c.type === "frame" && texts.includes("退款售后") && texts.includes("商城管理")) { refundItem = c; parent = n; }
        walk(c, c);
      }
    })(art, null);
    if (!refundItem) { skipped++; continue; }
    const already = (function has(n) {
      let found = false;
      (function t(x) { for (const k of x.children || []) { if (k.type === "text" && k.content === "发货上报") found = true; t(k); } })(n);
      return found;
    })(parent);
    if (already) { skipped++; continue; }
    const idx = parent.children.indexOf(refundItem);
    parent.children.splice(idx + 1, 0, navItem("发货上报", "truck", false));
    added++;
  }
  return { added, skipped };
}

// ---------- 执行 ----------
fs.copyFileSync(PEN, BACKUP);
const before = (function count(n) { return 1 + (n.children || []).reduce((s, c) => s + count(c), 0); })(doc);

const arts = [artActivityOrders(), artAdminActivityOrders(), artAdminMemberships(), artShippingReports(), artShippingRetry()];
for (const a of arts) doc.children.push(a);
console.log("新增画板:", arts.map((a) => a.name + "(" + a.id + ")").join("、"));
console.log("运营工作台:", updateOperationsDashboard());
console.log("Web 侧栏:", JSON.stringify(updateWebSidebars()));

// 结构校验
const out = JSON.stringify(doc, null, 1);
const reparsed = JSON.parse(out);
const after = (function count(n) { return 1 + (n.children || []).reduce((s, c) => s + count(c), 0); })(reparsed);
const ids = new Set();
const dupInfo = [];
(function collect(n, path) {
  if (ids.has(n.id)) dupInfo.push(n.id + "@" + path);
  ids.add(n.id);
  for (const c of n.children || []) collect(c, path + "/" + String(n.name || n.type || "?").slice(0, 14));
})(reparsed, "root");
if (dupInfo.length) throw new Error("存在重复 id: " + JSON.stringify(dupInfo));
for (const a of arts) {
  if (!a.width || !a.height || !a.fill || !a.metadata) throw new Error("画板字段不全: " + a.name);
}
fs.writeFileSync(PEN, out);
console.log("节点数:", before, "→", after, "| 新增", after - before, "| 校验通过，已保存");
