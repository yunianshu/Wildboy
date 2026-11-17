const wb = {
  bg: "#F6F4ED", surface: "#FFFFFF", ink: "#203E34", muted: "#596A60",
  primary: "#193F34", soft: "#E8EEDF", line: "#D7DED5",
  danger: "#923B31", dangerBg: "#F7E8E2",
};
const wbNav = [
  ["运营", [["运营工作台", "layout-dashboard"], ["消息管理", "bell"]]],
  ["活动", [["活动管理", "mountain"], ["活动模板", "layers"], ["活动订单", "receipt-text"]]],
  ["商城", [["商城管理", "shopping-bag"], ["商品分类", "tags"], ["退款售后", "rotate-ccw"]]],
  ["用户", [["用户管理", "users"], ["会员管理", "contact"]]],
  ["内容与设置", [["文章管理", "newspaper"], ["协议管理", "file-text"], ["基础配置", "settings"], ["管理员账号", "shield"]]],
];
const wbText = (content, size = 14, fill = wb.ink, weight = "400") =>
  ({ type: "text", name: content, content, fontFamily: "Noto Sans SC", fontSize: size, fontWeight: weight, fill });
const wbRow = (children, opts = {}) =>
  ({ type: "frame", name: "横向排列", layout: "horizontal", alignItems: "center", gap: 8, children, ...opts });
const wbStack = (children, opts = {}) =>
  ({ type: "frame", name: "纵向排列", layout: "vertical", gap: 12, children, ...opts });
const wbIcon = (icon, fill = wb.primary, size = 16) =>
  ({ type: "icon", name: icon, library: "lucide", icon, width: size, height: size, fill });
const wbBorder = { stroke: wb.line, strokeWidth: 1 };
const wbButton = (label, kind = "secondary") => {
  const solid = kind === "primary";
  const danger = kind === "danger";
  return wbRow([wbText(label, 13, solid ? wb.surface : danger ? wb.danger : wb.primary, "600")], {
    name: label, height: 36, padding: [0, 12], cornerRadius: 8,
    fill: solid ? wb.primary : danger ? wb.dangerBg : wb.surface,
    ...(solid || danger ? {} : wbBorder),
  });
};
const wbTag = (label, tone = "neutral") => wbRow([
  wbText(label, 12, tone === "danger" ? wb.danger : wb.primary, "600"),
], { padding: [3, 8], cornerRadius: 6, fill: tone === "danger" ? wb.dangerBg : wb.soft });
const wbField = (label, value, width = "fill_container") => wbStack([
  wbText(label, 12, wb.muted, "600"),
  wbRow([wbText(value, 13)], { width: "fill_container", height: 36, padding: [0, 10], cornerRadius: 8, fill: wb.surface, ...wbBorder }),
], { width, gap: 6 });
const wbBox = (children, opts = {}) => wbStack(children, {
  width: "fill_container", padding: 16, cornerRadius: 8, fill: wb.surface, ...wbBorder, ...opts,
});
const wbTable = (columns, rows, footer = "") => {
  const cells = (items, head = false) => columns.map(({ width }, i) => wbRow(
    [typeof items[i] === "object" ? items[i] : wbText(String(items[i] ?? ""), head ? 12 : 13, head ? wb.muted : wb.ink, head ? "600" : "400")],
    { width: width ?? "fill_container", clip: true },
  ));
  const rule = () => ({ type: "rectangle", name: "行分隔线", width: "fill_container", height: 1, fill: wb.line });
  const line = (items, head = false) => wbRow(cells(items, head), {
    width: "fill_container", height: head ? 38 : 44, padding: [0, 14], gap: 12, fill: head ? wb.soft : wb.surface,
  });
  return wbBox([
    line(columns.map((column) => column.label), true),
    ...rows.flatMap((row) => [rule(), line(row)]),
    ...(footer ? [rule(), wbRow([
      wbText(footer, 12, wb.muted), wbRow([wbButton("上一页"), wbButton("下一页")]),
    ], { width: "fill_container", height: 48, padding: [0, 14], justifyContent: "space_between" })] : []),
  ], { padding: 0, gap: 0, clip: true });
};
const wbTabs = (labels, selected = 0) => wbRow(labels.map((label, index) => wbRow([
  wbText(label, 13, index === selected ? wb.primary : wb.muted, index === selected ? "700" : "500"),
], { height: 36, padding: [0, 12], fill: index === selected ? wb.soft : wb.surface, cornerRadius: 8 })), {
  padding: 4, gap: 4, cornerRadius: 8, fill: wb.surface, ...wbBorder,
});
const wbBrand = () => wbStack([
  wbText("WILDBOY", 23, "#FFFDF4", "800"),
  wbText("OUTDOOR CLUB", 11, "#B9CBBF", "700"),
], { gap: 3 });
const wbSidebar = (section) => wbStack([
  wbRow([wbBrand()], { padding: [0, 8, 13, 8] }),
  ...wbNav.map(([name, items]) => wbStack([
    wbRow([wbText(name, 11, "#B9CBBF", "600")], { padding: [0, 8, 2, 8] }),
    ...items.map(([label, icon]) => wbRow([
      wbIcon(icon, "#CAD9CD"), wbText(label, 13, label === section ? "#FFFFFF" : "#D9E3D9", label === section ? "700" : "400"),
    ], { width: "fill_container", height: 32, padding: [0, 8], gap: 10, cornerRadius: 7,
      fill: label === section ? "#345A4C" : wb.primary })),
  ], { width: "fill_container", gap: 2 })),
], { width: 200, height: "fill_container", padding: [20, 12], gap: 10, fill: wb.primary });

const wbOrigin = { x: 13770, y: 0 };
function wbScreen({name, route, index, width = 1280, height = 800, section = name, children, actions = [], overlay}) {
  const narrow = width < 720;
  const title = name.split(" · ")[0];
  const workspace = wbStack([
    ...(narrow ? [wbRow([wbBrand(), wbRow([
      wbText(section, 13, "#F7F6ED"), wbIcon("chevron-down", "#D9E3D9"),
    ])], { name: "窄屏导航", width: "fill_container", height: 64, padding: [0, 14], justifyContent: "space_between", fill: wb.primary })] : []),
    wbRow([wbText("工作后台", 12, wb.muted), wbRow([
      wbText("管理员", 12, wb.muted), wbText("退出登录", 12, wb.primary, "600"),
    ], { gap: 16 })], { name: "顶栏", width: "fill_container", height: narrow ? 42 : 52, padding: [0, narrow ? 14 : 24], justifyContent: "space_between", fill: wb.surface }),
    wbStack([
      wbRow([wbText(title, 24, wb.ink, "700"), ...(actions.length ? [wbRow(actions)] : [])], {
        width: "fill_container", height: narrow ? 44 : 40, justifyContent: "space_between",
      }), ...children,
    ], { name: "页面内容", width: "fill_container", gap: 14, padding: [16, narrow ? 14 : 24, 24, narrow ? 14 : 24] }),
  ], { width: "fill_container", height: "fill_container", gap: 0 });
  const screen = Insert(document, {
    type: "frame", layout: "none", name: "Web / " + name,
    x: wbOrigin.x + (index % 4) * 1350,
    y: wbOrigin.y + Math.floor(index / 4) * 890 - (height === 900 ? 32 : 0), width, height,
    fill: wb.bg, clip: true, metadata: { type: "screen", route },
    children: [wbRow([...(narrow ? [] : [wbSidebar(section)]), workspace], {
      name: "管理后台外壳", x: 0, y: 0, width, height, gap: 0,
    }), ...(overlay ? [overlay] : [])],
  });
  Print("SCREEN", route, screen, name);
  return screen;
}

function wbLogin() {
  const screen = Insert(document, wbRow([
    wbStack([wbBrand(), wbText("野小子运营后台", 31, "#FFFDF4", "700")], {
      width: 490, height: "fill_container", padding: 56, gap: 28, justifyContent: "center", fill: wb.primary,
    }),
    wbRow([wbBox([
      wbText("管理员登录", 24, wb.ink, "700"),
      wbField("账号", "请输入管理员账号"), wbField("密码", "请输入密码"),
      wbButton("登录", "primary"),
    ], { width: 360, padding: 24, gap: 18 })], { width: "fill_container", height: "fill_container", justifyContent: "center" }),
  ], { name: "Web / 管理员登录", x: wbOrigin.x, y: wbOrigin.y, width: 1280, height: 800, gap: 0, fill: wb.bg, metadata: { type: "screen", route: "/login" } }));
  Print("SCREEN", "/login", screen, "管理员登录");
  return screen;
}

const wbColumns = (...names) => names.map((item) => Array.isArray(item) ? { label: item[0], width: item[1] } : { label: item });
const wbSearch = (value, ...filters) => wbRow([
  wbRow([wbIcon("search"), wbText(value, 13, wb.muted)], {
    height: 36, padding: [0, 12], cornerRadius: 8, fill: wb.surface, ...wbBorder, width: 250,
  }),
  ...filters.map((filter) => wbButton(filter)),
], { name: "筛选工具栏", width: "fill_container" });
const wbList = (name, route, index, filters, columns, rows, action, section = name) =>
  wbScreen({ name, route, index, section, actions: action ? [wbButton(action, "primary")] : [],
    children: [wbSearch(...filters), wbTable(columns, rows, "第 1 页")],
  });
const wbMetric = (label, amount) => wbBox([
  wbText(label, 12, wb.muted, "500"), wbText(amount, 24, wb.ink, "700"),
], { gap: 4, padding: 14 });
const wbSection = (name, children) => wbStack([
  wbText(name, 16, wb.ink, "700"), ...children,
], { width: "fill_container", gap: 8 });
const wbStatus = (icon, title, detail, action) => wbBox([
  wbIcon(icon, wb.primary, 22), wbText(title, 15, wb.ink, "700"), wbText(detail, 13, wb.muted),
  ...(action ? [wbButton(action)] : []),
], { alignItems: "center", padding: 20 });
const wbPanel = (title, children, actions = []) => wbBox([
  wbText(title, 17, wb.ink, "700"), ...children,
  ...(actions.length ? [wbRow(actions, { justifyContent: "end", width: "fill_container" })] : []),
], { gap: 14 });
const wbActivityRows = [
  ["周末山脊徒步", "11月21日 08:00", "¥68.00 / 人", "12 / 20", wbTag("已发布"), wbRow([wbButton("编辑"), wbButton("订单")])],
  ["溪谷自然观察", "11月22日 09:30", "免费", "6 / 16", wbTag("已发布"), wbRow([wbButton("编辑"), wbButton("名单")])],
  ["冬季露营入门", "11月28日 10:00", "¥158.00 / 人", "0 / 12", wbTag("草稿"), wbRow([wbButton("编辑"), wbButton("发布")])],
];
const wbActivityColumns = wbColumns("活动", ["开始时间", 150], ["报名价格", 118], ["已确认 / 名额", 108], ["状态", 78], ["操作", 148]);
const wbActivityEditor = (name, route, index, width = 1280) => {
  const narrow = width < 720;
  const fields = wbPanel("基本信息", [
    wbField("活动名称", "周末山脊徒步"),
    narrow ? wbField("活动分类", "本周活动") : wbRow([wbField("活动分类", "本周活动"), wbField("报名名额", "20 人")], { width: "fill_container" }),
    wbField("活动摘要", "森林缓坡环线，预计五小时"),
    wbRow([wbButton("选择封面")]),
  ]);
  const pricing = wbPanel("报名价格", [
    wbField("每人报名价格", "¥68.00"),
    wbText("保存价格后按收费活动处理", 12, wb.muted),
  ], [wbButton("保存报名价格")]);
  return wbScreen({ name, route, index, width, height: narrow ? 900 : 800, section: "活动管理",
    children: [
      wbTabs(narrow ? ["基本", "时间地点", "详情", "价格"] : ["基本信息", "时间与地点", "活动详情"]),
      narrow ? wbStack([fields, pricing], { width: "fill_container" }) :
        wbRow([fields, wbStack([pricing, wbButton("查看活动订单")], { width: 266 })], { alignItems: "start", width: "fill_container", gap: 14 }),
      wbRow([wbButton("返回活动管理"), wbButton("保存草稿", "primary")], { width: "fill_container", justifyContent: "end" }),
    ],
  });
};

const wbScreens = [
  wbLogin(),
  wbScreen({ name: "运营工作台", route: "/operations", index: 1, actions: [wbButton("刷新")], children: [
    wbRow([wbTabs(["概览", "异常待办", "操作历史"]), wbButton("近 7 天")], { width: "fill_container", justifyContent: "space_between" }),
    wbRow([wbMetric("未来活动报名", "18 / 48"), wbMetric("满员活动", "0 / 4"), wbMetric("付款订单", "9"), wbMetric("实收净额", "¥1,286.00"), wbMetric("待发货", "2")], { width: "fill_container", gap: 12 }),
    wbRow([
      wbSection("低库存", [wbTable(wbColumns("商品", ["库存", 64]), [["轻量折叠椅", "2"], ["折叠登山杖", "0"]])]),
      wbSection("付款趋势", [wbTable(wbColumns("付款日期", ["订单数", 62], ["净额", 100]), [["11月13日", "3", "¥309.00"], ["11月12日", "4", "¥598.00"], ["11月11日", "2", "¥379.00"]])]),
    ], { width: "fill_container", gap: 16, alignItems: "start" }),
  ] }),
  wbList("活动管理", "/activities", 2, ["输入活动名称", "全部分类", "全部状态"], wbActivityColumns, wbActivityRows, "新建活动"),
  wbActivityEditor("新建活动", "/activities/new", 3),
  wbActivityEditor("编辑活动", "/activities/:id/edit", 4),
  wbScreen({ name: "报名名单", route: "/activities/:id/registrations", index: 5, section: "活动管理", actions: [wbButton("返回活动")], children: [
    wbBox([wbText("溪谷自然观察", 17, wb.ink, "700"), wbText("已确认 6 人 · 名额 16 人", 13, wb.muted)]),
    wbTable(wbColumns("参加者", ["联系方式", 180], ["状态", 110], ["操作", 138]), [
      ["陈*", "138****5203", wbTag("已确认"), wbButton("查看参加者")],
      ["林*", "137****6182", wbTag("已确认"), wbButton("查看参加者")],
    ], "第 1 页 · 默认脱敏"),
  ] }),
  wbList("活动模板", "/templates", 6, ["搜索模板"], wbColumns("模板", ["来源", 160], ["报名价格", 110], ["操作", 264]), [
    ["山脊徒步复用模板", "周末山脊徒步", "¥68.00 / 人", wbRow([wbButton("编辑"), wbButton("复制"), wbButton("生成草稿", "primary")])],
    ["溪谷自然观察模板", "溪谷自然观察", "免费", wbRow([wbButton("编辑"), wbButton("复制"), wbButton("生成草稿", "primary")])],
  ], "创建模板"),
  wbScreen({ name: "商城管理", route: "/shop", index: 7, actions: [wbButton("创建商品", "primary")], children: [
    wbTabs(["商品目录", "装备订单"]), wbSearch("搜索商品", "全部分类", "全部状态"),
    wbTable(wbColumns("商品", ["分类", 130], ["原价", 95], ["现价", 95], ["库存", 70], ["状态", 82], ["操作", 166]), [
      ["折叠登山杖", "徒步装备", "¥329.00", "¥259.00", "0", wbTag("已上架"), wbRow([wbButton("编辑"), wbButton("下架")])],
      ["轻量折叠椅", "露营装备", "¥199.00", "¥169.00", "2", wbTag("已上架"), wbRow([wbButton("编辑"), wbButton("下架")])],
    ], "第 1 页"),
  ] }),
  wbList("商品分类", "/shop/categories", 8, ["搜索分类"], wbColumns("分类名称", ["排序", 100], ["关联商品", 140], ["操作", 174]), [
    ["徒步装备", "10", "3 件", wbRow([wbButton("编辑"), wbButton("查看商品")])],
    ["露营装备", "20", "2 件", wbRow([wbButton("编辑"), wbButton("查看商品")])],
  ], "创建分类"),
  wbList("退款售后", "/refunds", 9, ["搜索订单编号", "全部状态"], wbColumns("订单 / 原因", ["实付金额", 110], ["申请时间", 165], ["状态", 100], ["操作", 130]), [
    ["WB2611130148 · 行程变更", "¥169.00", "11月13日 15:22", wbTag("待审核", "danger"), wbButton("查看申请")],
    ["WB2611120153 · 重复购买", "¥259.00", "11月12日 18:10", wbTag("退款完成"), wbButton("查看详情")],
  ]),
  wbList("消息管理", "/notifications", 10, ["搜索活动", "全部状态"], wbColumns("活动 / 消息内容", ["尝试次数", 105], ["更新时间", 160], ["状态", 105], ["操作", 155]), [
    ["周末山脊徒步 · 集合点变更", "1 次", "11月13日 09:20", wbTag("待恢复", "danger"), wbButton("查看恢复条件")],
    ["溪谷自然观察 · 开始时间调整", "1 次", "11月12日 14:10", wbTag("已送达"), wbButton("查看记录")],
  ]),
  wbList("用户管理", "/users", 11, ["搜索姓名或手机号", "全部角色", "全部来源", "资料状态"], wbColumns("用户", ["来源", 112], ["角色", 104], ["报名资料", 120], ["操作", 142]), [
    ["陈* · 138****5203", "微信", wbTag("普通用户"), "已完善", wbButton("查看详情")],
    ["林* · 137****6182", "微信", wbTag("管理员"), "已完善", wbButton("查看详情")],
  ]),
  wbScreen({ name: "协议管理", route: "/legal", index: 12, actions: [wbButton("确认发布", "primary")], children: [
    wbRow([wbTabs(["用户协议", "隐私政策"]), wbTabs(["草稿", "历史版本"])], { width: "fill_container", justifyContent: "space_between" }),
    wbPanel("编辑草稿", [wbField("标题", "野小子用户服务协议"), wbField("正文", "欢迎使用野小子户外俱乐部。")], [wbButton("预览"), wbButton("保存草稿")]),
  ] }),
  wbScreen({ name: "管理员账号", route: "/settings/admin-account", index: 13, actions: [wbButton("修改管理员账号", "primary")], children: [
    wbPanel("登录账号", [wbRow([wbText("当前账号", 13, wb.muted), wbText("admin", 14, wb.ink, "600"), wbTag("已配置")]),
      wbText("修改时需要验证当前密码，保存后其他管理员会话将失效。", 13, wb.muted)]),
  ] }),
  wbScreen({ name: "活动管理 · 窄屏", route: "/activities", index: 27, width: 390, height: 900, actions: [wbButton("新建活动", "primary")], children: [
    wbField("活动名称", "输入活动名称"), wbRow([wbButton("全部分类"), wbButton("全部状态")]),
    ...wbActivityRows.map((row) => wbPanel(row[0], [wbText(row[1] + " · " + row[2], 13, wb.muted), wbRow([row[4], wbText(row[3], 13, wb.muted)])], [row[5]])),
  ] }),
  wbActivityEditor("编辑活动 · 窄屏", "/activities/:id/edit", 28, 390),
  wbScreen({ name: "运营工作台 · 列表状态", route: "/operations", index: 29, section: "运营工作台", children: [
    wbStatus("loader-circle", "正在加载", "正在读取后台数据"),
    wbStatus("inbox", "暂无符合条件的记录", "可以清除筛选条件后再查看", "清除筛选"),
    wbStatus("triangle-alert", "加载失败", "连接异常，请稍后再试", "重试"),
  ] }),
  wbScreen({ name: "活动管理 · 发布确认", route: "/activities", index: 30, section: "活动管理", children: [
    wbBox([wbText("发布「周末山脊徒步」？", 18, wb.ink, "700"),
      wbText("发布后，小程序将显示此活动并开放报名。", 14, wb.muted),
      wbRow([wbButton("返回编辑"), wbButton("确认发布", "primary")], { width: "fill_container", justifyContent: "end" }),
    ], { width: 500, padding: 20, gap: 16 }),
  ] }),
  wbScreen({ name: "商城管理 · 装备订单", route: "/shop", index: 31, section: "商城管理", actions: [wbButton("刷新")], children: [
    wbTabs(["商品目录", "装备订单"], 1),
    wbBox([wbText("收货资料仅用于订单履约", 12, wb.muted)], { padding: 12, fill: wb.soft }),
    wbPanel("已支付 · ¥169.00", [
      wbText("订单号 WB2611130148", 12, wb.muted), wbText("轻量折叠椅 × 1", 14),
      wbText("收货人 陈* · 手机号 138****5203 · 地址 ••••••••", 12, wb.muted),
    ], [wbButton("查看"), wbButton("查看收货信息"), wbButton("确认发货", "primary")]),
  ] }),
  wbScreen({ name: "退款售后 · 申请审核", route: "/refunds", index: 32, section: "退款售后", actions: [wbButton("刷新")], children: [
    wbPanel("WB2611130148 · 退款申请", [
      wbRow([wbTag("待审核", "danger"), wbText("¥169.00", 20, wb.ink, "700")]),
      wbField("申请原因", "行程变更"), wbField("审批说明", "填写拒绝原因"),
    ], [wbButton("返回列表"), wbButton("拒绝退款", "danger"), wbButton("同意退款", "primary")]),
  ] }),
  wbScreen({ name: "报名名单 · 查看资料确认", route: "/activities/:id/registrations", index: 33, section: "活动管理", children: [
    wbBox([wbText("查看参加者资料？", 18, wb.ink, "700"),
      wbText("仅用于报名核验及联系，操作会写入审计记录。"),
      wbRow([wbButton("返回检查"), wbButton("确认查看", "primary")], { width: "fill_container", justifyContent: "end" }),
    ], { width: 480, padding: 20, gap: 16 }),
  ] }),
  wbScreen({ name: "消息管理 · 恢复通知", route: "/notifications", index: 34, section: "消息管理", children: [
    wbPanel("集合点变更", [
      wbTag("待恢复", "danger"), wbField("恢复条件", "微信订阅授权与模板配置就绪"),
      wbText("重试会重新排队，实际送达以服务端状态为准。", 13, wb.muted),
    ], [wbButton("刷新恢复条件"), wbButton("重试原通知", "primary")]),
  ] }),
  wbScreen({ name: "管理员账号 · 修改", route: "/settings/admin-account", index: 35, section: "管理员账号", children: [
    wbPanel("修改管理员账号", [
      wbRow([wbField("新管理员账号", "admin"), wbField("当前管理员密码", "请输入当前密码")], { width: "fill_container" }),
      wbRow([wbField("新密码", "12–72 字符，至少包含英文字母与数字"), wbField("确认新密码", "再次输入新密码")], { width: "fill_container" }),
      wbText("保存后，其他管理员会话将失效。", 13, wb.muted),
    ], [wbButton("取消"), wbButton("验证并保存", "primary")]),
  ] }),
];

Print("WEB_ADMIN_BASE", wbScreens.length);
