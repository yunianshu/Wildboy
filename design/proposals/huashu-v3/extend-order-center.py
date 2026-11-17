# -*- coding: utf-8 -*-
"""微信电商订单（订单中心）接入的 B 设计扩展：3 个画板。

1. B / 小程序 / 订单详情 · 装备订单（已发货态 + 确认收货按钮）
2. B / 小程序 / 订单详情 · 活动订单（虚拟履约，无收货组件）
3. B / Web / 基础设置 · 微信电商订单卡片（状态徽章 + 路径配置弹窗）
沿用 extend-b 模式：备份 → 追加 → 结构校验 → 保存。
"""
import json
import random
import shutil
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
PEN = ROOT / "design" / "设计图文件.pen"
ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
NAMES = {
    "mini_shop": "B / 小程序 / 订单详情 · 装备订单",
    "mini_activity": "B / 小程序 / 订单详情 · 活动订单",
    "web_card": "B / Web / 基础设置 · 微信电商订单卡片",
}

pen = json.loads(PEN.read_text(encoding="utf-8"))
if any(n.get("name") == n2 for n in pen["children"] for n2 in NAMES.values()):
    raise SystemExit("订单中心画板已存在，中止")

used = set()


def collect(n):
    used.add(n.get("id"))
    for c in n.get("children", []):
        collect(c)
for n in pen["children"]:
    collect(n)
rng = random.Random(20261118)


def nid():
    while True:
        v = "b" + "".join(rng.choice(ALPHABET) for _ in range(4))
        if v not in used:
            used.add(v)
            return v


def F(name, w=None, h=None, fill=None, layout="vertical", gap=None, pad=None,
      align=None, justify=None, radius=None, stroke=None, extra=None, children=None):
    f = {"type": "frame", "id": nid(), "name": name, "layout": layout}
    if w is not None: f["width"] = w
    if h is not None: f["height"] = h
    if fill is not None: f["fill"] = fill
    if gap is not None: f["gap"] = gap
    if pad is not None: f["padding"] = pad
    if align is not None: f["alignItems"] = align
    if justify is not None: f["justifyContent"] = justify
    if radius is not None: f["cornerRadius"] = radius
    if stroke is not None: f["stroke"] = stroke
    if extra: f.update(extra)
    if children is not None: f["children"] = children
    return f


def T(name, content, size, weight=None, color="$hd-b-ink", extra=None):
    t = {"type": "text", "id": nid(), "name": name, "content": content,
         "fill": color, "fontFamily": "$hd-b-font", "fontSize": size,
         "lineHeight": 1.4, "textGrowth": "auto-width"}
    if weight: t["fontWeight"] = weight
    if extra: t.update(extra)
    return t


def ROW(label, value, vcolor="$hd-b-ink", vweight=None):
    return F(f"详情行 {label}", w="fill_container", layout="horizontal",
             justify="space_between", align="center", gap=12, children=[
                 T(f"行标签 {label}", label, 13, None, "$hd-b-muted"),
                 T(f"行取值 {label}", value, 13, vweight, vcolor),
             ])


def CARD(name, children, pad=16):
    return F(name, w="fill_container", fill="$hd-b-surface", stroke="$hd-b-line",
             radius=12, layout="vertical", gap=10, pad=pad, children=children)


META = {"type": "berry-page", "generated": "2026-11-18", "feature": "wechat-order-center"}

# ---------- 1. 小程序 · 装备订单详情（390×812，B 移动语言） ----------
shop = F(NAMES["mini_shop"], w=390, h=812, fill="$hd-b-bg",
         extra={"metadata": {**META, "platform": "miniprogram", "route": "pages/order-detail/index?type=shop"}}, children=[])
shop["children"] = [
    F("状态卡", w="fill_container", fill="$hd-b-surface", stroke="$hd-b-line", radius=12,
      layout="vertical", gap=6, pad=16, children=[
          T("状态标题", "已发货", 20, 700, "$hd-b-ink"),
          T("状态说明", "快递正在派送，确认收货后交易完成", 12, None, "$hd-b-muted"),
          F("收货标记行", w="fill_container", layout="horizontal", gap=6, align="center", children=[
              {"type": "icon", "id": nid(), "name": "收货图标", "icon": "check", "width": 14, "height": 14, "fill": "$hd-b-success"},
              T("收货标记", "尚未确认收货 · 微信将在发货后 10 天自动确认", 11, None, "$hd-b-muted"),
          ]),
      ]),
    CARD("订单商品卡", [
        F("商品行 登山杖", w="fill_container", layout="horizontal", gap=10, align="center", children=[
            F("商品图 登山杖", w=64, h=64, fill="$hd-b-soft", radius=8),
            F("商品信息 登山杖", layout="vertical", gap=2, children=[
                T("商品名 登山杖", "碳素登山杖", 14, 600),
                T("商品规格 登山杖", "标准款 × 2", 12, None, "$hd-b-muted"),
            ]),
            T("商品金额 登山杖", "¥396.00", 14, 600),
        ]),
        ROW("订单金额", "¥396.00", "$hd-b-primary", 600),
        ROW("订单号", "8f3c…（微信深链 no 参数）", "$hd-b-muted"),
        ROW("微信支付单号", "42000…（transaction_id）", "$hd-b-muted"),
        ROW("下单时间", "2026-11-16 14:32", "$hd-b-muted"),
    ]),
    CARD("物流卡", [
        T("物流标题", "物流信息", 14, 600),
        ROW("快递公司", "顺丰速运", "$hd-b-muted"),
        ROW("运单号", "SF1234567890", "$hd-b-muted"),
        ROW("发货时间", "2026-11-17 10:05", "$hd-b-muted"),
    ]),
    CARD("收货地址卡", [
        T("收件人", "张三 138****5678", 14, 600),
        T("地址", "福建省厦门市思明区 ……（地址快照）", 12, None, "$hd-b-muted"),
    ]),
    F("操作区", w="fill_container", layout="vertical", gap=10, pad=[4, 0, 0], children=[
        F("确认收货主按钮", w="fill_container", h=48, fill="$hd-b-primary", radius=10,
          align="center", justify="center",
          extra={"metadata": {"type": "wechat-open-business-view", "businessType": "weappOrderConfirm"}},
          children=[T("确认收货文字", "确认收货", 14, 600, "$hd-b-on-primary")]),
        T("按钮说明", "由微信官方组件发起，确认后同步微信订单状态", 11, None, "$hd-b-muted"),
    ]),
]

# ---------- 2. 小程序 · 活动订单详情 ----------
act = F(NAMES["mini_activity"], w=390, h=760, fill="$hd-b-bg",
        extra={"metadata": {**META, "platform": "miniprogram", "route": "pages/order-detail/index?type=activity"}}, children=[
    F("状态卡 活动", w="fill_container", fill="$hd-b-surface", stroke="$hd-b-line", radius=12,
      layout="vertical", gap=6, pad=16, children=[
          T("状态标题 活动", "已支付 · 待出行", 20, 700, "$hd-b-ink"),
          T("状态说明 活动", "报名成功，按集合信息准时出发", 12, None, "$hd-b-muted"),
      ]),
    CARD("活动信息卡", [
        F("活动行 周末山脊徒步", w="fill_container", layout="horizontal", gap=10, align="center", children=[
            F("活动图", w=64, h=64, fill="$hd-b-soft", radius=8),
            F("活动信息", layout="vertical", gap=2, children=[
                T("活动名", "周末山脊徒步", 14, 600),
                T("出行人数", "2 人", 12, None, "$hd-b-muted"),
            ]),
        ]),
        ROW("订单金额", "¥136.00", "$hd-b-primary", 600),
        ROW("出发时间", "2026-11-21 08:00", "$hd-b-muted"),
        ROW("订单号", "9a21…（微信深链 no 参数）", "$hd-b-muted"),
        ROW("微信支付单号", "42000…（transaction_id）", "$hd-b-muted"),
    ]),
    F("虚拟履约说明卡", w="fill_container", fill="$hd-b-soft", radius=12,
      layout="vertical", gap=4, pad=14, children=[
          T("虚拟履约标题", "虚拟商品订单", 13, 600, "$hd-b-primary-text"),
          T("虚拟履约说明", "无需物流与确认收货，微信按虚拟商品规则结算", 11, None, "$hd-b-muted"),
      ]),
    F("操作区 活动", w="fill_container", layout="vertical", gap=10, children=[
        F("查看报名按钮", w="fill_container", h=48, fill="$hd-b-primary", radius=10,
          align="center", justify="center",
          children=[T("查看报名文字", "查看我的报名", 14, 600, "$hd-b-on-primary")]),
    ]),
])

# ---------- 3. Web · 设置页卡片 + 弹窗 ----------
card = F(NAMES["web_card"], w=560, h=560, fill="$hd-b-bg",
         extra={"metadata": {**META, "platform": "web", "route": "/settings"}}, children=[
    T("卡片标题", "微信电商订单", 16, 700),
    T("卡片说明", "订单数据由微信支付交易自动同步；配置订单详情路径后，用户可在微信订单中心跳回小程序", 12, None, "$hd-b-muted"),
    CARD("状态徽章卡", [
        F("徽章 发货管理", h=28, fill="$hd-b-success-bg", radius=8, align="center", pad=[0, 8],
          children=[T("徽章文字 发货管理", "发货信息管理 · 已开通", 12, 500, "$hd-b-success")]),
        F("徽章 结算确认", h=28, fill="$hd-b-warning-bg", radius=8, align="center", pad=[0, 8],
          children=[T("徽章文字 结算确认", "交易结算管理确认 · 未完成", 12, 500, "$hd-b-warning")]),
        F("徽章 订单路径", h=28, fill="$hd-b-neutral-bg", radius=8, align="center", pad=[0, 8],
          children=[T("徽章文字 订单路径", "订单详情路径 · 未配置", 12, 500, "$hd-b-neutral")]),
    ]),
    F("配置路径按钮", w=128, h=44, fill="$hd-b-primary", radius=10, align="center", justify="center",
      children=[T("配置路径文字", "配置订单路径", 13, 600, "$hd-b-on-primary")]),
    F("路径配置弹窗", w=420, fill="$hd-b-surface", radius=16, stroke="$hd-b-line",
      layout="vertical", gap=16, pad=24,
      extra={"effect": {"type": "shadow", "shadowType": "outer", "color": "#33242A1A",
                        "offset": {"x": 0, "y": 8}, "blur": 28},
             "metadata": {"type": "form-modal", "title": "配置订单详情路径"}},
      children=[
          T("弹窗标题", "配置订单详情路径", 18, 600),
          T("弹窗说明", "需包含 ${商品订单号} 占位符；提交前请先在小程序后台签署订单中心授权协议", 12, None, "$hd-b-muted"),
          F("路径输入框", w="fill_container", h=44, fill="$hd-b-surface", stroke="$hd-b-field",
            radius=10, align="center", pad=[0, 12],
            children=[T("路径占位", "pages/order-detail/index?no=${商品订单号}", 13, None, "$hd-b-muted")]),
          F("弹窗按钮行", w="fill_container", layout="horizontal", justify="flex_end", gap=12, children=[
              F("取消按钮", w=88, h=44, fill="$hd-b-surface", stroke="$hd-b-field", radius=10,
                align="center", justify="center",
                children=[T("取消文字", "取消", 13, 500, "$hd-b-muted")]),
              F("保存按钮", w=88, h=44, fill="$hd-b-primary", radius=10,
                align="center", justify="center",
                children=[T("保存文字", "保存", 13, 600, "$hd-b-on-primary")]),
          ]),
      ]),
])

# 结构校验
def validate(n, seen):
    assert n["id"] not in seen, "重复 ID"
    seen.add(n["id"])
    for k in ("fill", "stroke"):
        v = n.get(k)
        if isinstance(v, str) and v.startswith("$") and v[1:] not in pen["variables"]:
            raise AssertionError(f"变量缺失 {v}")
    for c in n.get("children", []):
        validate(c, seen)

boards = [shop, act, card]
seen = set()
for b in boards:
    validate(b, seen)

backup = ROOT / "design" / "backups" / f"设计图文件.pen.{time.strftime('%Y%m%d-%H%M%S')}.bak"
shutil.copy2(PEN, backup)
# 摆放到 B 小程序区下方（y=60000 一带空置区）
for i, b in enumerate(boards):
    b["x"] = i * 460
    b["y"] = 60000
pen["children"].extend(boards)
PEN.write_text(json.dumps(pen, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"已生成 3 个订单中心画板并校验；备份 {backup.name}；文件 {PEN.stat().st_size:,} 字节")
