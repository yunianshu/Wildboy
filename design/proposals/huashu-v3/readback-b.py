# -*- coding: utf-8 -*-
"""从已保存的 .pen 实际读回 B「莓果晴天」全部画板的结构化数据。

输出 docs/ui-refactor/berry/pen-readback.json：
  - variables：全部 hd-b-* 变量（类型 + 值）；
  - artboards：每个 B 画板的 raw 树（原样）与 resolved 树（$变量解析为字面值）；
  - layout：每画板按深度优先展开的节点摘要（id/type/name/尺寸/间距/字体/颜色/圆角/资源/ref 覆盖）；
  - readbackSha256：本文件内容摘要（不是 .pen 文件摘要）。
读取发生在 .pen 写入之后（保存后回读），非凭记忆或截图。
"""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
PEN = ROOT / "design" / "设计图文件.pen"
OUT = ROOT / "docs" / "ui-refactor" / "berry" / "pen-readback.json"
MAP = ROOT / "design" / "proposals" / "huashu-v3" / "berry-artboard-map.json"

RESOLVE_KEYS = ("fill", "stroke", "fontFamily", "color")
KEEP_NODE_KEYS = (
    "type", "id", "name", "x", "y", "width", "height", "fill", "stroke", "strokeWidth",
    "cornerRadius", "layout", "gap", "padding", "alignItems", "justifyContent",
    "fontFamily", "fontSize", "fontWeight", "lineHeight", "content", "icon",
    "ref", "descendants", "reusable", "metadata", "clip", "effect", "textGrowth",
    "letterSpacing", "textAlign", "opacity", "visible", "rotation",
)


def resolve(value, variables):
    if isinstance(value, str) and value.startswith("$"):
        name = value[1:]
        if name in variables:
            v = variables[name]
            return v.get("value")
        return value
    if isinstance(value, dict):
        return {k: resolve(v, variables) for k, v in value.items()}
    if isinstance(value, list):
        return [resolve(v, variables) for v in value]
    return value


def resolve_tree(node, variables):
    out = {k: resolve(v, variables) if k in RESOLVE_KEYS else v
           for k, v in node.items() if k != "children"}
    if "children" in node:
        out["children"] = [resolve_tree(c, variables) for c in node["children"]]
    return out


def layout_rows(node, depth, artboard_pos, rows):
    ox, oy = artboard_pos
    row = {"depth": depth}
    for k in KEEP_NODE_KEYS:
        if k in node:
            row[k] = node[k]
    if "x" in node or "y" in node:
        row["abs"] = [ox + node.get("x", 0), oy + node.get("y", 0)]
    rows.append(row)
    for c in node.get("children", []):
        layout_rows(c, depth + 1, artboard_pos, rows)


def count_nodes(node):
    return 1 + sum(count_nodes(c) for c in node.get("children", []))


def main():
    pen = json.loads(PEN.read_text(encoding="utf-8"))
    artmap = json.loads(MAP.read_text(encoding="utf-8"))
    variables = {k: v for k, v in pen["variables"].items() if k.startswith("hd-b-")}
    b_ids = {v["id"] for section in ("web", "mini") for v in artmap[section].values()}
    b_ids |= set(artmap["components"].values())
    # 附加 berry-page 元数据画板（如后补的 B 首页换色板）
    for root in pen["children"]:
        meta = root.get("metadata") or {}
        if meta.get("type") == "berry-page":
            b_ids.add(root["id"])

    artboards = {}
    layout = {}
    for root in pen["children"]:
        if root["id"] not in b_ids:
            continue
        artboards[root["id"]] = root
        layout[root["id"]] = None  # 占位保持顺序

    payload = {
        "generated": "2026-11-17",
        "source": "design/设计图文件.pen",
        "penSizeBytes": PEN.stat().st_size,
        "variableCount": len(variables),
        "variables": variables,
        "artboards": {},
        "layout": {},
        "counts": {},
    }
    for aid, root in artboards.items():
        payload["artboards"][aid] = root
        rows = []
        layout_rows(root, 0, (root.get("x", 0), root.get("y", 0)), rows)
        layout[aid] = rows
        payload["counts"][aid] = {
            "nodes": count_nodes(root),
            "name": root.get("name"),
            "size": [root.get("width"), root.get("height")],
            "metadata": root.get("metadata"),
        }
    payload["layout"] = layout
    # raw 之外附 resolved 树
    payload["resolved"] = {aid: resolve_tree(root, pen["variables"]) for aid, root in artboards.items()}

    text = json.dumps(payload, ensure_ascii=False, sort_keys=True)
    digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
    final = dict(payload)
    final["readbackSha256"] = digest
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(final, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"读回 {len(artboards)} 个 B 画板，{len(variables)} 个 hd-b 变量")
    print(f"readbackSha256 = {digest}")
    print(f"写入 {OUT.relative_to(ROOT)}（{OUT.stat().st_size:,} 字节）")


if __name__ == "__main__":
    main()
