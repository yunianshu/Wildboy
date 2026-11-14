# -*- coding: utf-8 -*-
"""Web 后台画板配色 v2（清爽浅色 SaaS 风，2026-11-14）。

在 v1 基础上整体换肤：中性冷灰 chrome + 高饱和语义/模块色板。
对 38 张 `Web /` 画板做上下文感知映射：
- 侧栏（含登录页品牌分栏）→ 墨绿近黑 #101613；
- 主按钮/选中态 → 翡翠绿 #047857，品牌文字 → #065f46；
- 表头/提示 → 中性 #f9fafb；v1 模块 soft 全部退场；
- 状态胶囊 → 高饱和语义色；模块色只保留在分组标签与页题标记。

只改 fill/stroke 颜色与 variables，不增删节点、不改 id 与布局。
运行前生成 .bak 备份，运行后做结构一致性校验。
"""
import json
import shutil
import sys
from collections import Counter
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
PEN = REPO / "design" / "设计图文件.pen"
MANIFEST = REPO / "design" / "web-admin-manifest.json"
BACKUP = REPO / "design" / "设计图文件.pen.bak-recolor-v2-2026-11-14"

V2_SIDEBAR = "#101613"
V2_SIDEBAR_ACTIVE = "#22332B"
V2_BRAND_BTN = "#047857"
V2_BRAND_TEXT = "#065F46"
V2_BRAND_SOFT = "#ECFDF5"
V2_INK = "#1F2937"
V2_MUTED = "#6B7280"
V2_LINE = "#E5E8EC"
V2_APPBG = "#F6F7F9"
V2_TH = "#F9FAFB"
V2_TAG = "#F3F4F6"

# 状态胶囊语义色 v2（文字 / 底）
TONES2 = {
    "success": ("#047857", "#ECFDF5"),
    "warning": ("#92400E", "#FFFbeb"),
    "danger": ("#B91C1C", "#FEF2F2"),
    "info": ("#1D4ED8", "#EFF6FF"),
    "neutral": ("#374151", "#F3F4F6"),
    "user": ("#6D28D9", "#F5F3FF"),
}
LABEL_TONE = {
    "已支付": "success", "免支付已确认": "success", "已发布": "success",
    "启用": "success", "已完成": "success", "已发货": "success",
    "待支付": "warning", "退款待审核": "warning", "退款处理中": "warning",
    "待发送": "warning", "等待授权": "warning", "排队中": "warning",
    "处理中": "warning",
    "已退款": "info",
    "失败": "danger", "已拒绝": "danger", "错误": "danger",
    "已取消": "neutral", "已关闭": "neutral", "草稿": "neutral",
    "停用": "neutral", "散客": "neutral", "领队": "neutral",
    "会员": "user",
}
# v1 侧栏分组标签 onDark → v2 高饱和模块点色
GROUP_LABEL_V1 = {
    "#9CC9E9": "#60A5FA", "#E9AF85": "#FB923C", "#E4C87F": "#FBBF24",
    "#C6ABE3": "#A78BFA", "#92C9C2": "#2DD4BF",
}
V1_MODULE_SOFTS = {"#E4EFF7", "#FAE9DD", "#F7EDD6", "#F0EAF7", "#E1F0EE"}

TEXT_MAP = {
    "#D9E3D9": "#C4CDC7",
    "#203E34": V2_INK,
    "#596A60": V2_MUTED,
    "#B9CBBF": "#74857B",
    "#FFFDF4": "#FFFFFF",
    "#F7F6ED": "#E5E7EB",
}


def walk(node, inside_sidebar=False, parents=None):
    parents = parents or []
    yield node, inside_sidebar, parents
    name = node.get("name", "")
    fill = node.get("fill")
    child_sidebar = inside_sidebar or (
        isinstance(fill, str)
        and fill.upper() in ("#193F34", "#101613")
        and node.get("width") == 200
    )
    # 登录页品牌分栏（宽 490 的纯色深绿面板）
    if (
        not inside_sidebar
        and isinstance(fill, str)
        and fill.upper() == "#193F34"
        and isinstance(node.get("width"), int)
        and node["width"] >= 400
    ):
        child_sidebar = True
    for child in node.get("children") or []:
        yield from walk(child, child_sidebar, parents + [node])


def texts_in(frame):
    return [n for n in walk(frame)[0] if n.get("type") == "text"]


def iter_texts(frame):
    if frame.get("type") == "text":
        yield frame
    for child in frame.get("children") or []:
        yield from iter_texts(child)


def main() -> int:
    data = json.loads(PEN.read_text(encoding="utf-8"))
    boards = {b["id"]: b for b in json.loads(MANIFEST.read_text(encoding="utf-8"))["boards"]}
    before = json.dumps(data, ensure_ascii=False)
    stats = Counter()

    def set_fill(node, new, tag):
        old = node.get("fill")
        if old != new:
            node["fill"] = new
            stats[tag] += 1

    def set_text_color(node, new, tag):
        if node.get("fill") != new:
            node["fill"] = new
            stats[tag] += 1

    # 描边统一归一化（fill 之外的线色）
    for top in data["children"]:
        if top.get("id") not in boards:
            continue
        for node, _inside, _parents in walk(top):
            if isinstance(node.get("stroke"), str) and node["stroke"].upper() == "#D7DED5":
                node["stroke"] = V2_LINE
                stats["stroke-line"] += 1

    for top in data["children"]:
        if top.get("id") not in boards:
            continue
        # 画板底色
        if top.get("fill") == "#F6F4ED":
            set_fill(top, V2_APPBG, "screen-bg")
        for node, in_sidebar, parents in walk(top):
            name = node.get("name", "")
            fill = node.get("fill")
            if not isinstance(fill, str):
                continue
            f = fill.upper()

            # 0) 主按钮（深绿底 + 白字，按钮高度）→ 翡翠绿。
            #    放在侧栏规则之前：登录页品牌分栏内的登录按钮需要保持品牌色。
            if f == "#193F34" and node.get("height") == 36:
                kids = list(iter_texts(node))
                if kids and all((t.get("fill") or "").upper() == "#FFFFFF" for t in kids):
                    set_fill(node, V2_BRAND_BTN, "primary-btn")
                    continue

            # 1) 状态胶囊（v1 语义色 / 更早的琥珀、纸底中性）→ v2 语义色
            if name.startswith("状态 / "):
                label = name[len("状态 / "):]
                tone = LABEL_TONE.get(label)
                if tone:
                    text2, bg2 = TONES2[tone]
                    set_fill(node, bg2, f"badge/{label}")
                    for t in iter_texts(node):
                        set_text_color(t, text2, f"badge-text/{label}")
                    continue

            if in_sidebar:
                # 2) 侧栏上下文
                if f == "#193F34":
                    set_fill(node, V2_SIDEBAR, "sidebar-bg")
                elif f == "#345A4C":
                    set_fill(node, V2_SIDEBAR_ACTIVE, "sidebar-active")
                elif f == "#CAD9CD":
                    set_fill(node, "#94A39B", "sidebar-icon")
                elif f in TEXT_MAP:
                    set_fill(node, TEXT_MAP[f], "sidebar-text")
                elif f in GROUP_LABEL_V1:
                    set_fill(node, GROUP_LABEL_V1[f], "navlabel-v2")
                continue

            # 4) 表头（v1 模块 soft）→ 中性
            if f in V1_MODULE_SOFTS and name in ("表头", "横向排列"):
                set_fill(node, V2_TH, "header-v2")
                continue
            # 4b) 其余 v1 模块 soft（如金色的操作提示）→ 中性浅底
            if f in V1_MODULE_SOFTS:
                set_fill(node, V2_TH, "soft-misc")
                continue

            # 5) 品牌绿交互面（选中页签/分页/入口，含旧 soft 绿）
            if f == "#E8EEDF" and node.get("height") == 36:
                set_fill(node, V2_BRAND_SOFT, "selected-36")
                continue
            if f == "#E8EEDF" and name == "横向排列":
                set_fill(node, V2_TAG, "tag")
                continue
            if f == "#E8EEDF":
                set_fill(node, V2_TH, "soft-rest")
                continue

            # 6) 通用文字
            if node.get("type") in ("text", "icon") and f in TEXT_MAP:
                set_fill(node, TEXT_MAP[f], "text")
                continue
            if node.get("type") == "text" and f == "#193F34":
                set_fill(node, V2_BRAND_TEXT, "brand-text")
                continue

            # 7) 通用面
            if f == "#193F34":
                set_fill(node, V2_SIDEBAR, "solid-primary-rest")
            elif f == "#345A4C":
                set_fill(node, V2_SIDEBAR_ACTIVE, "solid-active-rest")
            elif f == "#D7DED5":
                set_fill(node, V2_LINE, "line")
            elif f == "#11291F80":
                set_fill(node, "#11182766", "overlay")

    # 8) variables 更新为 v2 令牌（保留既有键名，新增补充键）
    variables = data.setdefault("variables", {})
    v2_tokens = {
        "wb-bg": V2_APPBG, "wb-surface": "#FFFFFF", "wb-primary": V2_BRAND_BTN,
        "wb-ink": V2_INK, "wb-muted": V2_MUTED, "wb-line": V2_LINE,
        "wb-soft": V2_BRAND_SOFT, "wb-danger": "#B91C1C",
        "wb-sidebar": V2_SIDEBAR, "wb-sidebar-active": V2_SIDEBAR_ACTIVE,
        "wb-brand-text": V2_BRAND_TEXT, "wb-accent": "#059669",
        "wb-th": V2_TH, "wb-tag": V2_TAG,
        "wb-acc-ops": "#2563EB", "wb-acc-activity": "#C2410C",
        "wb-acc-shop": "#B45309", "wb-acc-user": "#7C3AED",
        "wb-acc-content": "#0F766E",
        "wb-dot-ops": "#60A5FA", "wb-dot-activity": "#FB923C",
        "wb-dot-shop": "#FBBF24", "wb-dot-user": "#A78BFA",
        "wb-dot-content": "#2DD4BF",
    }
    for key, value in v2_tokens.items():
        variables[key] = {"type": "color", "value": value}

    after = json.dumps(data, ensure_ascii=False)

    def strip_colors(payload: dict) -> dict:
        clone = json.loads(json.dumps(payload, ensure_ascii=False))
        clone.pop("variables", None)

        def clean(node):
            if isinstance(node, dict):
                node.pop("fill", None)
                node.pop("stroke", None)
                for value in node.values():
                    clean(value)
            elif isinstance(node, list):
                for item in node:
                    clean(item)

        clean(clone)
        return clone

    if strip_colors(json.loads(before)) != strip_colors(json.loads(after)):
        print("结构校验失败：存在颜色以外的改动，已放弃写回。", file=sys.stderr)
        return 1

    BACKUP.write_bytes(PEN.read_bytes())
    PEN.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"备份：{BACKUP}")
    for key, count in sorted(stats.items()):
        print(f"  {count:4d} × {key}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
