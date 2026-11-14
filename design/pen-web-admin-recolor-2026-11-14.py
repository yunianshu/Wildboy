# -*- coding: utf-8 -*-
"""Web 后台画板配色扩展脚本（2026-11-14）。

对 design/设计图文件.pen 中 38 张 `Web /` 画板做逐节点颜色替换：
- 状态胶囊（名称以 `状态 / ` 开头的 frame）按标签映射到语义色；
- 数据表表头（`表头` 或高 38 的旧版表头行）映射到画板所属模块色 soft；
- 侧栏五个分组标签文字映射到各自模块 onDark 色；
- 其余节点（品牌绿交互、选中页签、操作提示、危险色）保持不变。

只修改 fill / stroke 颜色字符串与 variables 色板登记，不增删节点、
不改 id、布局与文字。运行前自动生成 .bak 备份，运行后做结构一致性校验。

用法：python design/pen-web-admin-recolor-2026-11-14.py
"""
import json
import shutil
import sys
from collections import Counter
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
PEN = REPO / "design" / "设计图文件.pen"
MANIFEST = REPO / "design" / "web-admin-manifest.json"
BACKUP = REPO / "design" / "设计图文件.pen.bak-recolor-2026-11-14"

# ---- 新色彩系统（docs/redesign/web-admin-color-expansion-2026-11-14.md）----
MODULES = {
    # strong, soft, border, onDark（侧栏深绿底上的分组标签文字）
    "ops": {"strong": "#1D5F8A", "soft": "#E4EFF7", "border": "#C6DBEA", "onDark": "#9CC9E9"},
    "activity": {"strong": "#A05118", "soft": "#FAE9DD", "border": "#ECD2BE", "onDark": "#E9AF85"},
    "shop": {"strong": "#8A6410", "soft": "#F7EDD6", "border": "#E7D6A9", "onDark": "#E4C87F"},
    "user": {"strong": "#6C4E8C", "soft": "#F0EAF7", "border": "#DCCDEC", "onDark": "#C6ABE3"},
    "content": {"strong": "#1F6E68", "soft": "#E1F0EE", "border": "#C0DFDB", "onDark": "#92C9C2"},
}
TONES = {
    "success": {"bg": "#E7F2E4", "text": "#2E6B3F"},
    "warning": {"bg": "#FBF1D9", "text": "#8A5A10"},
    "danger": {"bg": "#F7E8E2", "text": "#923B31"},
    "info": {"bg": "#E4EFF7", "text": "#1D5F8A"},
    "neutral": {"bg": "#EFF1EB", "text": "#596A60"},
    # 业务身份标签复用模块色（会员属用户模块）
    "user": {"bg": "#F0EAF7", "text": "#6C4E8C"},
}
# 状态胶囊标签 → 语义；未列出的标签维持原色并在日志中提示。
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
GROUP_MODULE = {"运营": "ops", "活动": "activity", "商城": "shop", "用户": "user", "内容与设置": "content"}


def module_of_route(route: str) -> str:
    if route.startswith("/operations") or route.startswith("/notifications"):
        return "ops"
    if route.startswith("/shop") or route.startswith("/refunds"):
        return "shop"
    if route.startswith("/users") or route.startswith("/memberships"):
        return "user"
    if route.startswith("/articles") or route.startswith("/legal") or route.startswith("/settings"):
        return "content"
    if route == "/login":
        return "login"
    return "activity"


def walk(node):
    yield node
    for child in node.get("children") or []:
        yield from walk(child)


def texts_in(frame):
    return [n for n in walk(frame) if n.get("type") == "text"]


def main() -> int:
    data = json.loads(PEN.read_text(encoding="utf-8"))
    boards = {b["id"]: b for b in json.loads(MANIFEST.read_text(encoding="utf-8"))["boards"]}

    before = json.dumps(data, ensure_ascii=False, sort_keys=False)
    stats = Counter()
    unknown_badges = Counter()

    for top in data["children"]:
        board_id = top.get("id")
        if board_id not in boards:
            continue
        module = module_of_route(boards[board_id]["route"])
        for node in walk(top):
            name = node.get("name", "")
            fill = node.get("fill")

            # 1) 状态胶囊 → 语义色
            if name.startswith("状态 / ") and isinstance(fill, str):
                label = name[len("状态 / "):]
                tone = LABEL_TONE.get(label)
                if tone is None:
                    unknown_badges[label] += 1
                    continue
                node["fill"] = TONES[tone]["bg"]
                for text in texts_in(node):
                    if text.get("fill") in ("#193F34", "#6D4B18", "#596A60", "#923B31"):
                        text["fill"] = TONES[tone]["text"]
                stats[f"badge/{label}→{tone}"] += 1
                continue

            # 2) 数据表表头 → 模块 soft（login 画板无表头，跳过）
            if (
                module != "login"
                and fill == "#E8EEDF"
                and (name == "表头" or (name == "横向排列" and node.get("height") == 38))
            ):
                node["fill"] = MODULES[module]["soft"]
                stats[f"header→{module}"] += 1
                continue

            # 3) 侧栏分组标签 → 各自模块 onDark
            if name in GROUP_MODULE and fill == "#B9CBBF":
                node["fill"] = MODULES[GROUP_MODULE[name]]["onDark"]
                stats["navlabel/" + GROUP_MODULE[name]] += 1

    # 4) variables 色板登记（仅新增，不改既有键）
    variables = data.setdefault("variables", {})
    added = []
    for mod, colors in MODULES.items():
        for key, value in colors.items():
            var = f"wb-acc-{mod}-{key}"
            if var not in variables:
                variables[var] = {"type": "color", "value": value}
                added.append(var)
    for tone, colors in TONES.items():
        for key in ("bg", "text"):
            var = f"wb-tone-{tone}-{key}"
            if var not in variables:
                variables[var] = {"type": "color", "value": colors[key]}
                added.append(var)

    after = json.dumps(data, ensure_ascii=False, sort_keys=False)

    # ---- 结构一致性校验：除颜色字符串与 variables 外，其余必须逐字节一致 ----
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

    before_obj, after_obj = json.loads(before), json.loads(after)
    if strip_colors(before_obj) != strip_colors(after_obj):
        print("结构校验失败：存在颜色以外的改动，已放弃写回。", file=sys.stderr)
        return 1
    if len(before_obj["children"]) != len(after_obj["children"]):
        print("结构校验失败：顶层节点数量变化。", file=sys.stderr)
        return 1

    BACKUP.write_bytes(PEN.read_bytes())
    PEN.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"备份：{BACKUP}")
    print(f"画板：{len(boards)} 张；variables 新增 {len(added)} 个色板键")
    for key, count in sorted(stats.items()):
        print(f"  {count:4d} × {key}")
    if unknown_badges:
        print("未映射的状态标签（保持原色，需人工确认）：")
        for label, count in unknown_badges.items():
            print(f"  {count} × {label}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
