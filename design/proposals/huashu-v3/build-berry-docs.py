# -*- coding: utf-8 -*-
"""生成 B 代交付文档：
  - docs/ui-refactor/berry/design-map.json：页面 → B 画板/节点映射 + 变量集
  - docs/ui-refactor/berry/inventory.json：在柑橘代 51 页清单基础上替换画板引用并重置 B 状态
业务事实（路由/文件/接口/字段/处理器）沿用柑橘清单，仅设计引用与状态更新。
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
V3 = ROOT / "design" / "proposals" / "huashu-v3"
CITRUS = ROOT / "docs" / "ui-refactor" / "2026-11-17-citrus"
OUT = ROOT / "docs" / "ui-refactor" / "berry"

artmap = json.loads((V3 / "berry-artboard-map.json").read_text(encoding="utf-8"))
readback = json.loads((OUT / "pen-readback.json").read_text(encoding="utf-8"))
inv = json.loads((CITRUS / "inventory.json").read_text(encoding="utf-8"))

# ---------- design-map ----------
design_map = {
    "version": 1,
    "status": "berry-implementation",
    "selectedDirection": "B 莓果晴天",
    "approvalRecord": "design/proposals/huashu-v3/direction-approved.md",
    "pen": {
        "file": "design/设计图文件.pen",
        "savedSizeBytes": readback["penSizeBytes"],
        "method": "脚本编辑 + 备份 + 结构校验（本会话无 Pen MCP；沿用仓库 plan.md 约定）",
        "backupGlob": "design/backups/设计图文件.pen.*.bak",
    },
    "readback": {
        "file": "docs/ui-refactor/berry/pen-readback.json",
        "sha256": readback["readbackSha256"],
        "artboards": len(readback["counts"]),
        "variables": readback["variableCount"],
    },
    "variables": {k: v["value"] for k, v in readback["variables"].items()},
    "components": {
        "primary": "iLJFv", "secondary": "G36zmt", "quiet": "CG8d0",
        "field": "fsh8n", "status": "I8Qyzu", "empty": "M0fAx",
        "publishConfirm": "LhnkF", "groupMenu": "DxRMM",
        "webModal": artmap["components"]["rhqa8"],
        "miniModal": artmap["components"]["GiOGX"],
        "miniPrimaryButton": artmap["components"]["lrX3H"],
        "miniInput": artmap["components"]["C66TNf"],
    },
    "pages": [],
    "notes": [
        "Web 外壳：B 顶部横向导航（72px，五组业务大类）+ 子导航行（44px，标题 28px 主色 + 兄弟页/返回）。",
        "列表/表格/表单布局沿用各页真实任务结构，不强制卡片化；/activities 为两列左图右信息卡片（H3X2a）。",
        "窄屏/登录/小程序画板为整体换色 + 布局保留；小程序首页 Q78i6 不在 B 范围（保护对象）。",
        "危险/信息语义色为 B 扩展变量（hd-b-danger/info 等 17 项），延续 B 暖莓语系，见 variables。",
    ],
}

for old_id, info in artmap["web"].items():
    counts = readback["counts"].get(info["id"], {})
    design_map["pages"].append({
        "platform": "web", "route": info["route"], "sourceArtboard": old_id,
        "artboard": {"id": info["id"], "name": info["name"]},
        "nodes": counts.get("nodes"), "size": counts.get("size"),
        "status": "designed+read",
    })
for old_id, info in artmap["mini"].items():
    counts = readback["counts"].get(info["id"], {})
    design_map["pages"].append({
        "platform": "miniprogram", "route": info["route"], "sourceArtboard": old_id,
        "artboard": {"id": info["id"], "name": info["name"]},
        "nodes": counts.get("nodes"), "size": counts.get("size"),
        "status": "designed+read",
    })

OUT.mkdir(parents=True, exist_ok=True)
(OUT / "design-map.json").write_text(json.dumps(design_map, ensure_ascii=False, indent=1), encoding="utf-8")
print(f"design-map.json: {len(design_map['pages'])} 页")

# ---------- inventory ----------
# 旧画板 id → (platform, new artboard id)
old_to_new = {}
for old_id, info in artmap["web"].items():
    old_to_new[old_id] = ("web", info["id"])
for old_id, info in artmap["mini"].items():
    old_to_new[old_id] = ("mini", info["id"])
old_to_new["dxs6Q"] = ("web", "H3X2a")

SPECIAL = {
    # /activities 的发布确认：柑橘 jlF19 → B 组件 LhnkF（HyvJK 板内）
    "jlF19": ("web", "LhnkF"),
    # 首页保留参考画板：保护对象，不参与 B 重设计
    "Q78i6": ("mini", "Q78i6"),
}
old_to_new.update(SPECIAL)

updated = []
skipped_no_artboard = []
for page in inv["pages"]:
    p = json.loads(json.dumps(page))  # 深拷贝
    new_boards = []
    for ab in p.get("artboards", []):
        oid = ab.get("id")
        if oid in old_to_new:
            nid = old_to_new[oid][1]
            counts = readback["counts"].get(nid, {})
            entry = {
                "id": nid,
                "name": counts.get("name", ab.get("name")),
                "size": counts.get("size", ab.get("size")),
                "sourceCitrus": oid,
                "nodeCount": counts.get("nodes", ab.get("nodeCount")),
            }
            if oid == "Q78i6":
                entry["note"] = "首页保护基线画板，保留仅验证，不做 B 设计"
            new_boards.append(entry)
        else:
            skipped_no_artboard.append((p.get("route"), oid))
    if new_boards:
        p["artboards"] = new_boards
    if p.get("route") == "pages/home/index":
        p["designStatus"] = "preserved"
        p["readStatus"] = "preserved-baseline"
        p["implementationStatus"] = "not-in-scope"
        p["verificationStatus"] = "baseline-recheck-passed"
    else:
        p["designStatus"] = "designed-berry"
        p["readStatus"] = "read-berry-resolved"
        p["implementationStatus"] = "pending"
        p["verificationStatus"] = "pending"
    p["designFile"] = "design/设计图文件.pen"
    updated.append(p)

out_inv = {
    "date": "2026-11-17",
    "generation": "berry",
    "webRoot": "admin/src",
    "miniRoot": "miniprogram/src",
    "subPackages": inv.get("subPackages", []),
    "redirects": inv.get("redirects", []),
    "excluded": inv.get("excluded", []),
    "protectedHome": {
        "route": "pages/home/index",
        "baseline": "docs/ui-refactor/2026-11-17-citrus/home-baseline.json",
        "recheck": "81/81 SHA-256 一致（2026-11-17 本轮复核）",
    },
    "sourceInventory": "docs/ui-refactor/2026-11-17-citrus/inventory.json",
    "pages": updated,
}
(OUT / "inventory.json").write_text(json.dumps(out_inv, ensure_ascii=False, indent=1), encoding="utf-8")
print(f"inventory.json: {len(updated)} 页；未映射旧画板引用 {len(set(skipped_no_artboard))} 个")
for r in sorted(set(map(str, skipped_no_artboard))):
    print("  未映射:", r)
