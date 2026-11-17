# -*- coding: utf-8 -*-
"""将 B「莓果晴天」设计体系扩展到全部范围内页面（2026-11-17 交接执行）。

输入：design/设计图文件.pen（Pen v2.22 可读 JSON）
动作：
  1. 备份 .pen 到 design/backups/；
  2. 补齐 hd-b-* 生产语义变量（danger/info/导航/弹窗等，色值沿用 B 暖莓语系）；
  3. 复制 4 个柑橘代 reusable 组件定义为 B 版（Web 弹窗、小程序弹窗、移动主按钮、移动输入）；
  4. 逐页生成 B 画板：
     - Web：外壳由「侧栏」替换为 B 顶部横向导航（72px）+ 子导航行（44px），内容区保留原真实字段并整体换色；
     - 小程序/状态稿/窄屏/登录：整体换色，布局保留；
     - /activities 由既有 H3X2a 承担，不重复生成；
  5. 柑橘代画板重命名加「[历史·柑橘]」前缀（ID 不变，历史映射仍有效）；
  6. 结构校验：ID 全局唯一、ref 可解析、$变量存在、JSON 可回读；
  7. 输出 berry-artboard-map.json（旧画板 → 新 B 画板映射）。
约束：不触碰 Q78i6（首页保留参考）、A/C 提案画板、H3X2a/HyvJK（仅按要求去除设计预览标记）。
"""
import copy
import json
import random
import shutil
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
PEN = ROOT / "design" / "设计图文件.pen"
BACKUP_DIR = ROOT / "design" / "backups"
MAP_OUT = ROOT / "design" / "proposals" / "huashu-v3" / "berry-artboard-map.json"

MARKER = "B / 莓果晴天 · 全端扩展"

# ---------- B 变量扩展（补齐生产语义；色值延续 B 暖莓语系，与原型 15 变量一致推导） ----------
NEW_VARS = {
    "hd-b-danger": {"type": "color", "value": "#B03A2E"},
    "hd-b-danger-bg": {"type": "color", "value": "#FBEAE6"},
    "hd-b-info": {"type": "color", "value": "#6E4A63"},
    "hd-b-info-bg": {"type": "color", "value": "#F4EBF2"},
    "hd-b-on-primary": {"type": "color", "value": "#FFFFFF"},
    "hd-b-primary-text": {"type": "color", "value": "#9E2845"},
    "hd-b-accent": {"type": "color", "value": "#E7A5B5"},
    "hd-b-overlay": {"type": "color", "value": "#33242A66"},
    "hd-b-nav": {"type": "color", "value": "#FFFFFF"},
    "hd-b-nav-active": {"type": "color", "value": "#FDEEF1"},
    "hd-b-gap": {"type": "number", "value": 16},
    "hd-b-radius-block": {"type": "number", "value": 12},
    "hd-b-modal-radius": {"type": "number", "value": 16},
    "hd-b-web-control-height": {"type": "number", "value": 44},
    "hd-b-mini-control-height": {"type": "number", "value": 48},
    "hd-b-modal-padding": {"type": "number", "value": 24},
    "hd-b-dialog-gap": {"type": "number", "value": 16},
}

# 柑橘 rf-* / 字面色 → B 语义
VAR_MAP = {
    "rf-bg": "hd-b-bg", "rf-surface": "hd-b-surface", "rf-primary": "hd-b-primary",
    "rf-ink": "hd-b-ink", "rf-muted": "hd-b-muted", "rf-line": "hd-b-line",
    "rf-soft": "hd-b-soft", "rf-danger": "hd-b-danger", "rf-success": "hd-b-success",
    "rf-success-bg": "hd-b-success-bg", "rf-warning": "hd-b-warning",
    "rf-warning-bg": "hd-b-warning-bg", "rf-danger-bg": "hd-b-danger-bg",
    "rf-info": "hd-b-info", "rf-info-bg": "hd-b-info-bg", "rf-neutral": "hd-b-neutral",
    "rf-neutral-bg": "hd-b-neutral-bg", "rf-sidebar": "hd-b-nav",
    "rf-sidebar-active": "hd-b-nav-active", "rf-accent": "hd-b-accent",
    "rf-on-primary": "hd-b-on-primary", "rf-primary-text": "hd-b-primary-text",
    "rf-primary-hover": "hd-b-primary-hover", "rf-field-line": "hd-b-field",
    "rf-overlay": "hd-b-overlay", "rf-font": "hd-b-font",
}
HEX_MAP = {
    "#fff8ee": "#FFFAFB", "#ff8a2c": "#B93858", "#332c24": "#33242A",
    "#756657": "#755E67", "#e7dccb": "#E8DCE0", "#fff0d6": "#FDEEF1",
    "#b63d31": "#B03A2E", "#426b37": "#286747", "#edf5e6": "#EAF5EE",
    "#855800": "#7D5A1B", "#fff1c7": "#FFF5DF", "#fff0ec": "#FBEAE6",
    "#62602f": "#6E4A63", "#f5f3de": "#F4EBF2", "#f3eee6": "#F1ECEE",
    "#ffd163": "#E7A5B5", "#33251c": "#33242A", "#9a430c": "#9E2845",
    "#f47a20": "#9E2845", "#a48d73": "#A98D97", "#33251c66": "#33242A66",
}

MODULES = {
    "ops": [("运营工作台", "/operations"), ("消息管理", "/notifications")],
    "activity": [("活动管理", "/activities"), ("活动模板", "/templates"), ("活动订单", "/activity-orders")],
    "shop": [("商城管理", "/shop"), ("商品分类", "/shop/categories"), ("退款售后", "/refunds"), ("发货上报", "/shipping-reports")],
    "user": [("用户管理", "/users"), ("会员管理", "/memberships")],
    "content": [("文章管理", "/articles"), ("协议管理", "/legal"), ("基础配置", "/settings"), ("管理员账号", "/settings/admin-account")],
}
GROUP_LABELS = {"ops": "运营", "activity": "活动", "shop": "商城", "user": "用户", "content": "内容与设置"}
GROUP_WIDTH = {"ops": 96, "activity": 96, "shop": 96, "user": 96, "content": 144}

# 旧 Web 画板 → B 页面元数据（kind: list=模块列表页 / editor=返回+标题）
WEB_PAGES = {
    "jooRk": ("list", "ops", "运营工作台", "/operations", "运营工作台"),
    "mS4Tg": ("list", "ops", "运营工作台", "/operations", "运营工作台 · 列表状态"),
    "vMuxZ": ("list", "ops", "消息管理", "/notifications", "消息管理"),
    "Sfyhp": ("list", "ops", "消息管理", "/notifications", "消息管理 · 恢复通知"),
    "VZIjm": ("list", "activity", "活动模板", "/templates", "活动模板"),
    "xHqTA": ("list", "activity", "活动订单", "/activity-orders", "活动订单 · 全部订单"),
    "XErK6": ("list", "activity", "活动订单", "/activity-orders", "活动订单 · 待支付详情"),
    "othlP": ("list", "activity", "活动订单", "/activity-orders", "活动订单 · 退款审核"),
    "CCqVo": ("editor", "activity", "新建活动", "/activities/new", "新建活动"),
    "afpqo": ("editor", "activity", "编辑活动", "/activities/:id/edit", "编辑活动"),
    "A7gFGK": ("editor", "activity", "报名名单", "/activities/:id/registrations", "报名名单"),
    "tSb5v": ("editor", "activity", "报名名单", "/activities/:id/registrations", "报名名单 · 查看资料确认"),
    "jv8du": ("list", "shop", "商城管理", "/shop", "商城管理"),
    "jLyLI": ("list", "shop", "商城管理", "/shop", "商城管理 · 装备订单"),
    "Z4snv": ("list", "shop", "商品分类", "/shop/categories", "商品分类"),
    "kc418": ("list", "shop", "退款售后", "/refunds", "退款售后"),
    "pKPcb": ("list", "shop", "退款售后", "/refunds", "退款售后 · 申请审核"),
    "sPQxB": ("list", "shop", "发货上报", "/shipping-reports", "发货上报"),
    "MuHVO": ("list", "shop", "发货上报", "/shipping-reports", "发货上报 · 补报确认"),
    "udj84": ("list", "user", "用户管理", "/users", "用户管理"),
    "x9gG8s": ("list", "user", "会员管理", "/memberships", "会员管理 · 等级列表"),
    "V6uBE": ("list", "user", "会员管理", "/memberships", "会员管理 · 用户业务身份"),
    "vruDl": ("list", "user", "会员管理", "/memberships", "会员管理 · 等级编辑"),
    "Asyql": ("list", "user", "会员管理", "/memberships", "会员管理 · 分配业务身份"),
    "hSL6j": ("list", "content", "文章管理", "/articles", "文章管理 · 文章列表"),
    "LzCfb": ("editor", "content", "新建文章", "/articles/new", "文章编辑 · 新建草稿"),
    "Rkx83": ("editor", "content", "编辑文章", "/articles/:id/edit", "文章编辑 · 工作台"),
    "MYBYC": ("editor", "content", "编辑文章", "/articles/:id/edit", "文章编辑 · 文档"),
    "P6RC06": ("editor", "content", "编辑文章", "/articles/:id/edit", "文章编辑 · 设为官方介绍确认"),
    "Pr4cO": ("list", "content", "协议管理", "/legal", "协议管理"),
    "DbJts": ("list", "content", "基础配置", "/settings", "基础配置 · 四入口与目标页"),
    "xNcp5": ("list", "content", "基础配置", "/settings", "基础配置 · 弹窗内容配置"),
    "k0nVX": ("list", "content", "基础配置", "/settings", "基础配置 · 版本冲突恢复"),
    "UHolL": ("list", "content", "管理员账号", "/settings/admin-account", "管理员账号"),
    "jwaEj": ("list", "content", "管理员账号", "/settings/admin-account", "管理员账号 · 修改"),
}
WEB_PLAIN = {  # 无外壳替换：登录与窄屏（换色 + 改名）
    "PoJPW": ("B / Web / 管理员登录", "/login", "login"),
    "UFr8b": ("B / Web / 活动管理 · 窄屏", "/activities", "narrow"),
    "YcrPD": ("B / Web / 编辑活动 · 窄屏", "/activities/:id/edit", "narrow"),
    "yJl1Q": ("B / Web / 基础配置 · 窄屏", "/settings", "narrow"),
    "D02kiL": ("B / Web / 活动订单 · 窄屏", "/activity-orders", "narrow"),
    "TNona": ("B / Web / 文章编辑 · 窄屏", "/articles/:id/edit", "narrow"),
}
MINI_ROUTES = {
    "zdkYd": "pages/activities/index", "mzsV1": "pages/detail/index",
    "KGp4I": "pages/detail/index", "v2aly": "pages/register/index",
    "ScdDU": "pages/signup-success/index", "bVFjG": "pages/registrations/index",
    "fhwJH": "pages/notifications/index", "3yIfJ": "pages/activity-orders/index",
    "E7QA9": "pages/shop/index", "YbhOC": "pages/product/index",
    "KgWt0": "pages/checkout/index", "kD4zv": "pages/orders/index",
    "AIEqe": "pages/addresses/index", "asCpo": "pages/mine/index",
    "u9yYo": "pages/profile/index", "CX7SL": "pages/profile/index",
    "r2Vg3F": "pages/login/index", "jy5Vc": "pages/article/index",
    "r5wRDb": "pages/privacy/index",
    "Jt0Pi": "pages/admin-login/index", "r2Js0": "pages/admin-login/index",
    "ouWUv": "pages/admin-login/index", "hRh1p": "pages/admin-activities/index",
    "yNHlA": "pages/admin-editor/index", "h50occ": "pages/admin-editor/index",
    "wfShm": "pages/admin-editor/index", "NFbtm": "pages/admin-editor/index",
    "YIDDP": "pages/admin-editor/index", "ACw3S": "pages/admin-editor/index",
    "X6euG": "pages/admin-roster/index", "E7GexY": "pages/admin-legal/index",
    "oXo8G": "pages/admin-legal/index", "vm86H": "pages/admin-legal/index",
    "W9vBy": "pages/admin-shop/index", "IWwi8": "pages/admin-product/index",
    "L50wpo": "pages/admin-product/index", "yxY9p": "pages/admin-product/index",
    "FGTf9": "pages/admin-product/index", "P9Nefw": "pages/admin-product/index",
    "R9RNM": "pages/admin-orders/index", "p6tHR": "pages/admin-orders/index",
    "q9SqVI": "pages/admin-orders/index", "qF4od": "pages/admin-content/index",
    "gbfMY": "pages/admin-users/index", "uHPy2": "pages/admin-users/index",
    "wlpgC": "pages/admin-users/index",
    "sreFA": "pages/admin-activity-orders/index", "aoeMz": "pages/admin-memberships/index",
    "JLFre": "state:activities-register", "hlmk3": "state:participants-legal",
    "mGkPt": "state:shop-loading", "vaPck": "state:checkout-pay",
    "kx38q": "state:order-refund", "MJO4e": "state:address-edit",
    "tZwlR": "state:mine-identity", "KGIQF": "state:login-consent",
    "FKrkZ": "state:list-product", "Xwjvy": "state:order-result",
}
CITRUS_RENAME_PREFIX = "[历史·柑橘] "
CITRUS_ROOTS = set(WEB_PAGES) | set(WEB_PLAIN) | set(MINI_ROUTES) | {"dxs6Q", "iSDAE", "VI3Sz"}
LEGACY_RENAME = {"bi8Au": "[历史·初代] 野小子 / 重设计范围", "KN18e": "[历史·初代] 设计系统 / 按钮、字段与状态"}

ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"


class IdGen:
    def __init__(self, used):
        self.used = set(used)
        self.rng = random.Random(20261117)

    def next(self):
        while True:
            nid = "b" + "".join(self.rng.choice(ALPHABET) for _ in range(4))
            if nid not in self.used:
                self.used.add(nid)
                return nid


def collect_ids(node, out):
    out.add(node.get("id"))
    for c in node.get("children", []):
        collect_ids(c, out)


def recolor(value):
    """递归替换颜色引用与已知字面色。"""
    if isinstance(value, str):
        if value.startswith("$"):
            name = value[1:]
            return "$" + VAR_MAP.get(name, name)
        low = value.lower()
        if low in HEX_MAP:
            return HEX_MAP[low]
        return value
    if isinstance(value, list):
        return [recolor(v) for v in value]
    if isinstance(value, dict):
        return {k: recolor(v) for k, v in value.items()}
    return value


def recolor_node(node):
    for key in ("fill", "stroke", "effect", "color", "textColor"):
        if key in node:
            node[key] = recolor(node[key])
    for c in node.get("children", []):
        recolor_node(c)


class Copier:
    """深拷贝子树并重分配 ID；ref 指向的柑橘组件改写到 B 组件，descendants 键随组件内部 ID 映射改写。"""

    def __init__(self, idgen, comp_remap):
        self.idgen = idgen
        self.comp_remap = comp_remap  # oldCompId -> (newCompId, oldChildId->newChildId)

    def copy(self, node):
        new = copy.deepcopy(node)
        self._walk(new)
        return new

    def _walk(self, node):
        node["id"] = self.idgen.next()
        if node.get("type") == "ref":
            old_ref = node.get("ref")
            if old_ref in self.comp_remap:
                new_ref, child_map = self.comp_remap[old_ref]
                node["ref"] = new_ref
                desc = node.get("descendants")
                if desc:
                    node["descendants"] = {child_map.get(k, k): recolor(v) for k, v in desc.items()}
        for c in node.get("children", []):
            self._walk(c)


def text_node(idgen, content, size, weight, color, name, extra=None):
    t = {
        "type": "text", "id": idgen.next(), "name": name,
        "fill": color, "content": content,
        "fontFamily": "$hd-b-font", "fontSize": size, "fontWeight": weight,
        "lineHeight": 1.4, "textGrowth": "auto-width",
    }
    if extra:
        t.update(extra)
    return t


def frame_node(idgen, name, width=None, height=None, fill=None, layout="horizontal",
               gap=None, padding=None, align=None, justify=None, radius=None,
               stroke=None, stroke_width=None, metadata=None, children=None, extra=None):
    f = {"type": "frame", "id": idgen.next(), "name": name, "layout": layout}
    if width is not None:
        f["width"] = width
    if height is not None:
        f["height"] = height
    if fill is not None:
        f["fill"] = fill
    if gap is not None:
        f["gap"] = gap
    if padding is not None:
        f["padding"] = padding
    if align is not None:
        f["alignItems"] = align
    if justify is not None:
        f["justifyContent"] = justify
    if radius is not None:
        f["cornerRadius"] = radius
    if stroke is not None:
        f["stroke"] = stroke
    if stroke_width is not None:
        f["strokeWidth"] = stroke_width
    if metadata is not None:
        f["metadata"] = metadata
    if children is not None:
        f["children"] = children
    if extra:
        f.update(extra)
    return f


def build_topnav(idgen, active_module, admin_name="管理员"):
    """按 H3X2a p5wPY 的几何生成 B 顶部导航（active_module 高亮）。"""
    nav = frame_node(idgen, "B顶部业务导航", width="fill_container", height=72,
                     fill="$hd-b-nav", stroke="$hd-b-line",
                     stroke_width={"bottom": 1}, gap=24, padding=[0, 32], align="center")
    brand = frame_node(idgen, "B原始品牌", width=192, height="fill_container",
                       layout="vertical", gap=2, justify="center", children=[
                           frame_node(idgen, "B野小子原始标志", width=100, height=64, extra={
                               "fill": {"type": "image", "enabled": True,
                                        "url": "../miniprogram/src/assets/platform-brand-original-transparent.png",
                                        "mode": "contain"}}),
                           text_node(idgen, "管理后台", 12, 500, "$hd-b-muted", "B管理后台标签"),
                       ])
    groups = frame_node(idgen, "B五个业务大类", width="fill_container", height="fill_container",
                        layout="horizontal", gap=8, align="center", children=[])
    for key in ("ops", "activity", "shop", "user", "content"):
        active = key == active_module
        g = frame_node(idgen, f"B顶部导航 {GROUP_LABELS[key]}", width=GROUP_WIDTH[key], height=44,
                       fill="$hd-b-nav-active" if active else "$hd-b-nav", radius=10,
                       layout="horizontal", gap=6, justify="center", align="center",
                       metadata={"type": "navigation-group", "module": key}, children=[
                           text_node(idgen, GROUP_LABELS[key], 14, 600 if active else 500,
                                     "$hd-b-primary" if active else "$hd-b-ink",
                                     f"B顶部导航文字 {GROUP_LABELS[key]}"),
                           {"type": "icon", "id": idgen.next(), "name": f"B导航展开 {GROUP_LABELS[key]}",
                            "icon": "chevron-down", "width": 14, "height": 14,
                            "fill": "$hd-b-primary" if active else "$hd-b-muted"},
                       ])
        groups["children"].append(g)
    admin = frame_node(idgen, "B管理员区", width=272, height="fill_container",
                       layout="horizontal", gap=12, align="center", justify="flex-end", children=[
                           {"type": "icon", "id": idgen.next(), "name": "B管理员图标", "icon": "user",
                            "width": 24, "height": 24, "fill": "$hd-b-ink"},
                           frame_node(idgen, "B当前管理员", layout="vertical", children=[
                               text_node(idgen, admin_name, 14, 600, "$hd-b-ink", "B当前管理员文字"),
                               text_node(idgen, "后台版本 v1.0.3", 11, 400, "$hd-b-muted", "B后台版本文字"),
                           ]),
                           frame_node(idgen, "B退出登录", width=72, height=44, radius=10,
                                      layout="horizontal", justify="center", align="center",
                                      stroke="$hd-b-field", stroke_width=1, children=[
                                          text_node(idgen, "退出登录", 13, 500, "$hd-b-muted", "B退出登录文字"),
                                      ]),
                       ])
    nav["children"] = [brand, groups, admin]
    return nav


def build_subnav(idgen, kind, module, title, route):
    """列表页：标题(28/主色) + 兄弟页胶囊；编辑页：返回胶囊 + 标题。"""
    row = frame_node(idgen, "B标题与子导航", width="fill_container", height=44,
                     gap=12, align="center", children=[])
    if kind == "editor":
        is_article = module == "content"
        back_label = "文章管理" if is_article else "活动管理"
        back_route = "/articles" if is_article else "/activities"
        back = frame_node(idgen, f"B返回 {back_label}", height=44, gap=4, align="center",
                          metadata={"type": "navigation-link", "route": back_route}, children=[
                              {"type": "icon", "id": idgen.next(), "name": "B返回图标",
                               "icon": "arrow-left", "width": 16, "height": 16, "fill": "$hd-b-muted"},
                              text_node(idgen, back_label, 14, 500, "$hd-b-muted", f"B返回文字 {back_label}"),
                          ])
        row["children"] = [back, text_node(idgen, title, 28, 700, "$hd-b-primary", "B页面标题",
                                          {"metadata": {"type": "page-title", "route": route}})]
    else:
        row["children"] = [text_node(idgen, title, 28, 700, "$hd-b-primary", "B页面标题",
                                     {"metadata": {"type": "page-title", "route": route}})]
        for label, path in MODULES[module]:
            if label == title:
                continue
            row["children"].append(
                frame_node(idgen, f"B子导航 {label}", height=44, align="center",
                           metadata={"type": "navigation-link", "route": path}, children=[
                               text_node(idgen, label, 14, 500, "$hd-b-muted", f"B子导航文字 {label}"),
                           ]))
    return row


def transform_web(artboard, meta, copier, idgen):
    kind, module, title, route, name_suffix = meta
    new = copier.copy(artboard)
    recolor_node(new)
    new["name"] = f"B / Web / {name_suffix}"
    new["metadata"] = {"type": "berry-page", "platform": "web", "route": route,
                       "source": artboard["id"], "generated": "2026-11-17"}
    shell = next((c for c in new.get("children", []) if "外壳" in c.get("name", "")), None)
    if shell is not None:
        side = next((c for c in shell["children"] if c.get("name", "").startswith("侧栏")), None)
        content = next((c for c in shell["children"] if c is not side), None)
        keep = [c for c in content.get("children", []) if not c.get("name", "").startswith("顶栏")]
        for c in keep:  # B 主区自带内边距，原页面内容框的内外边距归零
            if c.get("name", "").startswith(("页面内容", "主区域")) and "padding" in c:
                c["padding"] = 0
        main = frame_node(idgen, "B页面主区", width="fill_container", height="fill_container",
                          layout="vertical", gap=16, padding=[20, 32, 16, 32],
                          children=[build_subnav(idgen, kind, module, title, route)] + keep)
        shell["children"] = [build_topnav(idgen, module), main]
        shell["name"] = "B后台外壳"
        shell["layout"] = "vertical"
        shell.pop("alignItems", None)
    return new


def find_node(pen, nid):
    result = None

    def dfs(n):
        nonlocal result
        if result is not None:
            return
        if n.get("id") == nid:
            result = n
            return
        for c in n.get("children", []):
            dfs(c)

    for root in pen["children"]:
        dfs(root)
    return result


def main():
    pen = json.loads(PEN.read_text(encoding="utf-8"))
    roots = {n["id"]: n for n in pen["children"]}
    if any(n.get("name") == MARKER for n in pen["children"]):
        print("B 扩展区已存在，中止。")
        sys.exit(1)

    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    backup = BACKUP_DIR / f"设计图文件.pen.{time.strftime('%Y%m%d-%H%M%S')}.bak"
    shutil.copy2(PEN, backup)
    print(f"备份: {backup.name}")

    # 1) 变量扩展
    variables = pen["variables"]
    added = [k for k, v in NEW_VARS.items() if k not in variables]
    for k in added:
        variables[k] = NEW_VARS[k]
    print(f"新增变量 {len(added)} 个")

    # 2) 组件定义 B 化
    used_ids = set()
    for n in pen["children"]:
        collect_ids(n, used_ids)
    idgen = IdGen(used_ids)
    comp_defs = []
    comp_remap = {}
    for old_cid, new_name in [
        ("rhqa8", "B组件 / Web 通用弹窗"),
        ("GiOGX", "B组件 / 小程序弹窗"),
        ("lrX3H", "B组件 / 移动主按钮"),
        ("C66TNf", "B组件 / 移动输入"),
    ]:
        src = find_node(pen, old_cid)
        if src is None:
            print(f"警告: 组件 {old_cid} 未找到，跳过")
            continue
        dup = copy.deepcopy(src)
        child_map = {}

        def reid(n):
            old = n["id"]
            n["id"] = idgen.next()
            child_map[old] = n["id"]
            for c in n.get("children", []):
                reid(c)

        reid(dup)
        recolor_node(dup)
        dup["name"] = new_name
        dup["reusable"] = True
        dup["metadata"] = {"type": "berry-component", "source": old_cid}
        comp_defs.append(dup)
        comp_remap[old_cid] = (dup["id"], child_map)
    print(f"B 组件定义 {len(comp_defs)} 个")

    copier = Copier(idgen, comp_remap)
    artboard_map = {"generated": "2026-11-17", "marker": MARKER, "web": {}, "mini": {},
                    "components": {k: v[0] for k, v in comp_remap.items()}}

    new_children = []

    # 3) Web 页面（外壳替换）
    section_y = 24500
    new_children.append({"type": "text", "id": idgen.next(), "name": MARKER,
                         "fill": "$hd-b-primary", "content": MARKER,
                         "fontFamily": "$hd-b-font", "fontSize": 32, "fontWeight": 700,
                         "lineHeight": 1.4, "x": 0, "y": section_y})
    comp_frame = {"type": "frame", "id": idgen.next(),
                  "name": "B / 组件定义（Web 弹窗 · 小程序弹窗 · 移动主按钮 · 移动输入）",
                  "x": 0, "y": section_y + 90, "width": 1280, "clip": True,
                  "layout": "horizontal", "gap": 24, "padding": 24,
                  "fill": "$hd-b-bg", "children": comp_defs}
    new_children.append(comp_frame)

    web_x, web_y = 0, section_y + 620
    max_row_h = 0
    for i, (old_id, meta) in enumerate(WEB_PAGES.items()):
        src = roots[old_id]
        new = transform_web(src, meta, copier, idgen)
        if i and i % 3 == 0:
            web_y += max_row_h + 100
            max_row_h = 0
        new["x"] = web_x + (i % 3) * 1360
        new["y"] = web_y
        max_row_h = max(max_row_h, new.get("height") or 900)
        new_children.append(new)
        artboard_map["web"][old_id] = {"id": new["id"], "name": new["name"], "route": meta[3]}
    web_y += max_row_h + 100

    # H3X2a 作为 /activities 的 B 设计（改名 + 去设计预览标记）
    home = roots["H3X2a"]
    home["name"] = "B / Web / 活动管理"
    home["metadata"] = {"type": "berry-page", "platform": "web", "route": "/activities",
                        "source": "H3X2a", "generated": "2026-11-17"}
    artboard_map["web"]["dxs6Q"] = {"id": "H3X2a", "name": home["name"], "route": "/activities"}

    def strip_preview(node):
        node["children"] = [c for c in node.get("children", []) if c.get("name") != "B设计预览标记"]
        for c in node.get("children", []):
            strip_preview(c)

    strip_preview(home)

    # 窄屏与登录（换色保留布局）
    plain_y = web_y
    plain_x, plain_row_h = 0, 0
    for j, (old_id, (new_name, route, kind)) in enumerate(WEB_PLAIN.items()):
        src = roots[old_id]
        new = copier.copy(src)
        recolor_node(new)
        new["name"] = new_name
        new["metadata"] = {"type": "berry-page", "platform": "web", "route": route,
                           "source": old_id, "generated": "2026-11-17", "variant": kind}
        if j and j % 3 == 0:
            plain_y += plain_row_h + 100
            plain_x, plain_row_h = 0, 0
        new["x"] = plain_x
        new["y"] = plain_y
        plain_x += (new.get("width") or 390) + 40
        plain_row_h = max(plain_row_h, new.get("height") or 900)
        new_children.append(new)
        artboard_map["web"][old_id] = {"id": new["id"], "name": new_name, "route": route}
    plain_y += plain_row_h + 200

    # 4) 小程序与状态稿（换色保留布局）
    mini_y = plain_y
    mini_x, row_max = 0, 0
    count = 0
    for old_id, route in MINI_ROUTES.items():
        src = roots.get(old_id)
        if src is None:
            print(f"警告: 小程序画板 {old_id} 不存在，跳过")
            continue
        new = copier.copy(src)
        recolor_node(new)
        new_name = "B / " + src.get("name", "")
        new["name"] = new_name
        new["metadata"] = {"type": "berry-page", "platform": "miniprogram", "route": route,
                           "source": old_id, "generated": "2026-11-17"}
        if count and count % 8 == 0:
            mini_y += row_max + 100
            mini_x, row_max = 0, 0
        new["x"] = mini_x
        new["y"] = mini_y
        mini_x += (new.get("width") or 390) + 40
        row_max = max(row_max, new.get("height") or 900)
        new_children.append(new)
        artboard_map["mini"][old_id] = {"id": new["id"], "name": new_name, "route": route}
        count += 1
    print(f"新增 B 画板：Web {len(WEB_PAGES) + len(WEB_PLAIN)} + 小程序 {count}，/activities 复用 H3X2a")

    # 5) 柑橘与初代重命名
    renamed = 0
    for n in pen["children"]:
        if n["id"] in CITRUS_ROOTS and not n.get("name", "").startswith(CITRUS_RENAME_PREFIX):
            n["name"] = CITRUS_RENAME_PREFIX + n.get("name", "")
            renamed += 1
        elif n["id"] in LEGACY_RENAME:
            n["name"] = LEGACY_RENAME[n["id"]]
    print(f"历史画板重命名 {renamed} 个")

    pen["children"].extend(new_children)

    # 6) 结构校验
    seen = set()
    dup = [0]

    def validate(node):
        nid = node.get("id")
        if nid in seen:
            dup[0] += 1
        seen.add(nid)
        for c in node.get("children", []):
            validate(c)

    for n in pen["children"]:
        validate(n)
    assert dup[0] == 0, f"重复 ID {dup[0]} 个"

    def check_refs(node):
        if node.get("type") == "ref" and node.get("ref") not in seen:
            raise AssertionError(f"ref 目标缺失 {node.get('ref')}")
        for s in (node.get("fill"), node.get("stroke")):
            if isinstance(s, str) and s.startswith("$") and s[1:] not in pen["variables"]:
                raise AssertionError(f"变量缺失 {s}")
        for c in node.get("children", []):
            check_refs(c)

    for n in pen["children"]:
        check_refs(n)
    json.loads(json.dumps(pen, ensure_ascii=False))  # 回读校验
    print("结构校验通过：ID 唯一、ref/变量可解析、JSON 可回读")

    PEN.write_text(json.dumps(pen, ensure_ascii=False, indent=2), encoding="utf-8")
    MAP_OUT.write_text(json.dumps(artboard_map, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"已写入 {PEN.name}（{PEN.stat().st_size:,} 字节）与 {MAP_OUT.name}")


if __name__ == "__main__":
    main()
