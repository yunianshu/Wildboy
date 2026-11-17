# -*- coding: utf-8 -*-
"""设计源清理：只保留当前 B 莓果世代，删除历史代画板与未使用变量。

删除（2026-11-18 用户指令「设计图只需要保留最新的」）：
  - [历史·柑橘] 102 板 + 遗漏未改名的 jlF19（Web / 活动管理 · 发布确认）
  - [历史·初代] 2 板（bi8Au、KN18e）
  - A/C 提案 6 板（n2cQ6B、O79Ql、M894N、Nu5Gj、m1HOo、pcVOv）
保留：
  - 全部 B 画板（B / 前缀 108 板：Web/小程序/状态稿/组件定义/首页换色/订单中心/分区标题）
  - Q78i6 首页基线占位（保护对象标记，空板零成本）
随后清理未被保留树引用的变量，并做完整结构校验。
旧版本已在 git 历史（97060bd）与 design/backups/ 双重留档。
"""
import json
import shutil
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
PEN = ROOT / "design" / "设计图文件.pen"

KEEP_EXPLICIT = {"Q78i6"}


def keep_root(n):
    name = n.get("name", "")
    return (
        name.startswith("B / ")
        or name.startswith("Huashu / B")   # HyvJK 组件与弹窗板
        or n.get("id") in KEEP_EXPLICIT
    )


def _scan_vars(value, used):
    if isinstance(value, str):
        if value.startswith("$"):
            used.add(value[1:])
    elif isinstance(value, dict):
        for v in value.values():
            _scan_vars(v, used)
    elif isinstance(value, list):
        for v in value:
            _scan_vars(v, used)


def collect_used_vars(node, used):
    for k, v in node.items():
        if k == "children":
            continue
        _scan_vars(v, used)
    for c in node.get("children", []):
        collect_used_vars(c, used)


def collect_ids(node, ids):
    ids.add(node.get("id"))
    for c in node.get("children", []):
        collect_ids(c, ids)


def collect_refs(node, refs):
    if node.get("type") == "ref" and node.get("ref"):
        refs.add(node["ref"])
    for c in node.get("children", []):
        collect_refs(c, refs)


pen = json.loads(PEN.read_text(encoding="utf-8"))

# ── 前置修复：B 化弹窗组件内部的「保存/取消」按钮仍引用初代 B4F5UB。
# 在 B 组件定义区内造一个 B 色副本（弹窗操作按钮，B 规格 44px 高）并重挂引用，
# 使删除初代/柑橘画板后无悬空组件。
def find_id(n, nid):
    if n.get("id") == nid:
        return n
    for c in n.get("children", []):
        r = find_id(c, nid)
        if r:
            return r
    return None


old_btn = None
for root in pen["children"]:
    old_btn = find_id(root, "B4F5UB")
    if old_btn:
        break
comp_frame = next(n for n in pen["children"] if n.get("name", "").startswith("B / 组件定义（"))
new_btn = json.loads(json.dumps(old_btn, ensure_ascii=False))
new_btn["id"] = "bDlgb"  # B 弹窗操作按钮
new_btn["name"] = "B组件 / 弹窗操作按钮"
new_btn["height"] = 44
new_btn["fill"] = "$hd-b-primary"
new_btn["cornerRadius"] = "$hd-b-radius"
new_btn["children"][0].update({
    "fill": "$hd-b-on-primary", "fontFamily": "$hd-b-font",
})
comp_frame["children"].append(new_btn)


def remap_refs(node):
    if node.get("type") == "ref" and node.get("ref") == "B4F5UB":
        node["ref"] = "bDlgb"
    for c in node.get("children", []):
        remap_refs(c)
    desc = node.get("descendants")
    if isinstance(desc, dict):
        node["descendants"] = {k: remap_desc(v) for k, v in desc.items()}


def remap_desc(v):
    # descendants 覆盖值里引用的是 B4F5UB 子节点 id（如改文案），键不变、仅值递归处理
    return v


remapped = [0]


def count_remap(node):
    if node.get("type") == "ref" and node.get("ref") == "bDlgb":
        remapped[0] += 1
    for c in node.get("children", []):
        count_remap(c)


for root in pen["children"]:
    remap_refs(root)
for root in [comp_frame]:
    count_remap(root)

before = len(pen["children"])
kept = [n for n in pen["children"] if keep_root(n)]
removed = [n for n in pen["children"] if not keep_root(n)]
assert len(kept) + len(removed) == before

# 校验 1：保留树中的 ref 目标必须仍存在（B 组件定义在保留区内）
all_ids = set()
for n in kept:
    collect_ids(n, all_ids)
refs = set()
for n in kept:
    collect_refs(n, refs)
dangling = refs - all_ids
assert not dangling, f"悬空 ref: {dangling}"

# 校验 2：删除后不再引用已删画板内的组件（refs 已由上一步保证）

# 变量清理：先把 B 组件副本内部残留的 rf-* 引用映射为等价 hd-b-*
# （早期补丁未扫到嵌套在「B / 组件定义」区内的组件定义），再删除历史前缀变量；
# hd-b-* 是当前体系规范（含令牌生成链路依赖的几何变量），全家保留。
RF_TO_HDB = {
    "rf-font": "hd-b-font",
    "rf-modal-radius": "hd-b-modal-radius",
    "rf-on-primary": "hd-b-on-primary",
    "rf-primary-text": "hd-b-primary-text",
    "rf-primary": "hd-b-primary",
    "rf-control-radius": "hd-b-radius",
}


def remap_legacy_vars(node):
    for k, v in node.items():
        if k == "children":
            continue
        if isinstance(v, str) and v.startswith("$"):
            mapped = RF_TO_HDB.get(v[1:])
            if mapped:
                node[k] = "$" + mapped
        elif isinstance(v, dict):
            remap_legacy_vars(v)
        elif isinstance(v, list):
            for item in v:
                if isinstance(item, dict):
                    remap_legacy_vars(item)
                elif isinstance(item, str) and item.startswith("$"):
                    pass
    for c in node.get("children", []):
        remap_legacy_vars(c)


for n in kept:
    remap_legacy_vars(n)

used = set()
for n in kept:
    collect_used_vars(n, used)
removed_vars = sorted(
    v for v in set(pen["variables"]) - used if not v.startswith("hd-b-"))
kept_vars = sorted(set(pen["variables"]) - set(removed_vars))
assert used <= set(pen["variables"]), f"引用了不存在的变量: {used - set(pen['variables'])}"
assert all(v.startswith("hd-b-") for v in kept_vars), kept_vars
for v in removed_vars:
    del pen["variables"][v]

backup = ROOT / "design" / "backups" / f"设计图文件.pen.{time.strftime('%Y%m%d-%H%M%S')}.pre-cleanup.bak"
backup.parent.mkdir(parents=True, exist_ok=True)
shutil.copy2(PEN, backup)

pen["children"] = kept
PEN.write_text(json.dumps(pen, ensure_ascii=False, indent=2), encoding="utf-8")

print(f"根画板: {before} → {len(kept)}（删除 {len(removed)}）")
print(f"删除示例: {[n['name'][:20] for n in removed[:5]]} …")
print(f"变量: 删除 {len(removed_vars)} 个（{'、'.join(removed_vars[:8])}…），保留 {len(kept_vars)} 个（{'、'.join(kept_vars[:5])}…）")
print(f"备份: {backup.name}")
print(f"文件大小: {backup.stat().st_size:,} → {PEN.stat().st_size:,} 字节")
