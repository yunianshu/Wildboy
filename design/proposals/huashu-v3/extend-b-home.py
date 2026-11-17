# -*- coding: utf-8 -*-
"""生成 B 版小程序首页画板：排版与 Q78i6 参考一致（真实首页结构），仅颜色换莓果。

依据（2026-11-17 用户新指令）：首页排版不变，颜色可换 B。
结构忠实映射 miniprogram/src/pages/home/index.wxml 的区块顺序与尺寸（rpx×0.52≈px）：
hero(229) → 四入口网格(77×4) → 活动区标题 → 活动卡 2 列(图 141) → 装备横幅(130)
→ 山野之间标题 → 轮播(172) → 平台标识 → 底部 TabBar(50) + 入口弹窗态。
颜色全部使用 hd-b-* 变量；照片用仓库真实资产；不改变任何业务文案。
"""
import copy
import json
import random
import time
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
PEN = ROOT / "design" / "设计图文件.pen"
NAME = "B / 小程序 / 首页（保排版 · 换莓果色）"
ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"

pen = json.loads(PEN.read_text(encoding="utf-8"))
if any(n.get("name") == NAME for n in pen["children"]):
    raise SystemExit("B 首页画板已存在，中止")

used = set()

def collect(n):
    used.add(n.get("id"))
    for c in n.get("children", []):
        collect(c)
for n in pen["children"]:
    collect(n)
rng = random.Random(20261117)


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


def T(name, content, size, weight=None, color="$hd-b-ink", opacity=None, extra=None):
    t = {"type": "text", "id": nid(), "name": name, "content": content,
         "fill": color, "fontFamily": "$hd-b-font", "fontSize": size,
         "lineHeight": 1.4, "textGrowth": "auto-width"}
    if weight: t["fontWeight"] = weight
    if opacity is not None: t["opacity"] = opacity
    if extra: t.update(extra)
    return t


def IMG(name, url, w=None, h=None, mode="cover"):
    r = {"type": "rectangle", "id": nid(), "name": name,
         "fill": {"type": "image", "enabled": True, "url": url, "mode": mode}}
    if w is not None: r["width"] = w
    if h is not None: r["height"] = h
    return r


ASSET = "../miniprogram/src/assets/"
board = F(NAME, w=390, h=2210, fill="$hd-b-bg",
          extra={"clip": True,"metadata": {"type": "berry-page", "platform": "miniprogram",
                              "route": "pages/home/index", "variant": "recolor-only",
                              "source": "Q78i6 参考排版 + pages/home/index.wxml 结构",
                              "generated": "2026-11-17", "note": "排版不变，仅颜色换 B"}})

# --- hero 440rpx ---
hero = F("hero 首屏大图", w="fill_container", h=229, fill="$hd-b-ink",
         extra={"children": [
             IMG("hero-image", ASSET + "hero-hiking.jpg", w="fill_container", h="fill_container"),
             F("hero-shade 压暗渐变", w="fill_container", h="fill_container",
               extra={"fill": {"type": "linear-gradient", "enabled": True, "angle": 180,
                               "stops": [{"color": "#1F1217", "opacity": 0.24, "position": 0},
                                         {"color": "#1F1217", "opacity": 0, "position": 0.32},
                                         {"color": "#1A0F13", "opacity": 0.72, "position": 1}]}}),
             F("brand 品牌区", w="fill_container", layout="vertical", gap=2,
               extra={"children": [
                   T("brand-name 野小子", "野小子", 24, 800, "$hd-b-on-primary"),
                   T("brand-caption", "野一点，自由一点", 9, None, "$hd-b-on-primary", 0.85),
               ]}),
             F("hero-copy 标语", w="fill_container", layout="vertical", gap=4,
               extra={"children": [
                   T("hero-kicker", "WILDBOY / OUTDOOR CLUB", 9, None, "$hd-b-on-primary", 0.8),
                   T("hero-title", "去山野，找回自己。", 24, 700, "$hd-b-on-primary"),
                   T("hero-sub", "把日常留在身后 · 一起走出去", 12, None, "$hd-b-on-primary", 0.9),
               ]}),
         ]})
body = F("home-body 内容区", w="fill_container", layout="vertical", gap=12, pad=[12, 16, 26])

cats = F("category-grid 四入口", w="fill_container", layout="horizontal", gap=12, children=[])
for img, label in [("category-weekly.jpg", "本周活动"), ("category-domestic.jpg", "国内游行"),
                   ("category-holiday.jpg", "假期活动"), ("category-leisure.jpg", "休闲活动")]:
    cats["children"].append(
        F(f"category {label}", w="fill_container", h=77, fill="$hd-b-ink", radius=12,
          extra={"clip": True, "children": [
              IMG(f"category-image {label}", ASSET + img, w="fill_container", h="fill_container"),
              F(f"category-shade {label}", w="fill_container", h="fill_container",
                extra={"fill": {"type": "linear-gradient", "enabled": True, "angle": 180,
                                "stops": [{"color": "#1A0F13", "opacity": 0, "position": 0},
                                          {"color": "#1A0F13", "opacity": 0.65, "position": 1}]}}),
              T(f"category-title {label}", label, 12, 650, "$hd-b-on-primary"),
          ]}))

head1 = F("section-head 活动区", w="fill_container", layout="horizontal",
          align="flex-end", justify="space_between", children=[
              F("活动区标题组", layout="vertical", gap=2, children=[
                  T("eyebrow", "FIND YOUR NEXT ADVENTURE", 10, 600, "$hd-b-muted"),
                  T("section-title", "正在发生的山野", 20, 650),
              ]),
              T("section-link 全部", "全部", 12, None, "$hd-b-muted"),
          ])

grid = F("grid 活动卡两列", w="fill_container", layout="horizontal", gap=12, children=[])
for title, meta, detail, price, left, img in [
    ("周末山脊徒步", "本周活动 · 11月21日", "山脊步道", "¥68.00", "8 个余位", "category-weekly.jpg"),
    ("溪谷自然观察", "休闲活动 · 11月23日", "溪谷营地", "免费报名", "12 个余位", "category-leisure.jpg"),
]:
    grid["children"].append(
        F(f"activity-card {title}", w="fill_container", fill="$hd-b-surface", layout="vertical",
          children=[
              IMG(f"activity-image {title}", ASSET + img, w="fill_container", h=141),
              T(f"card-meta {title}", meta, 10, None, "$hd-b-muted"),
              T(f"card-title {title}", title, 15, 650),
              T(f"card-detail {title}", detail, 11, None, "$hd-b-muted"),
              F(f"card-footer {title}", w="fill_container", layout="horizontal",
                justify="space_between", children=[
                    T(f"free {title}", price, 13, 650,
                      "$hd-b-primary" if price.startswith("¥") else "$hd-b-ink"),
                    T(f"muted {title}", left, 11, None, "$hd-b-muted"),
                ]),
          ]))

shop = F("shop 装备横幅", w="fill_container", h=130, fill="$hd-b-soft", radius=12,
         extra={"clip": True, "children": [
             IMG("shop-banner-image", ASSET + "equipment-banner.jpg", w="fill_container", h="fill_container"),
             F("shop-copy", layout="vertical", gap=6, children=[
                 F("shop-tag", h=25, fill="$hd-b-primary", radius=12, align="center", pad=[0, 8],
                   children=[T("shop-tag-text", "山野好物 · 轻装出发", 10, 600, "$hd-b-on-primary")]),
                 T("shop-title", "把山野，装进行囊", 16, 650, "$hd-b-on-primary"),
                 T("shop-cta", "去逛逛", 11, None, "$hd-b-on-primary"),
             ]),
         ]})

head2 = F("section-head 山野之间", w="fill_container", layout="vertical", gap=2, children=[
    T("eyebrow2", "MOMENTS OUTSIDE", 10, 600, "$hd-b-muted"),
    T("section-title2", "山野之间", 20, 650),
])

swiper = F("scenery-swiper 轮播", w="fill_container", h=172, fill="$hd-b-ink", radius=12,
           extra={"clip": True, "children": [
               IMG("scenery-image", ASSET + "category-holiday.jpg", w="fill_container", h="fill_container"),
               F("scenery-shade", w="fill_container", h="fill_container",
                 extra={"fill": {"type": "linear-gradient", "enabled": True, "angle": 180,
                                 "stops": [{"color": "#1A0F13", "opacity": 0, "position": 0.2},
                                           {"color": "#1A0F13", "opacity": 0.75, "position": 1}]}}),
               F("scenery-copy", w="fill_container", layout="vertical", gap=2, children=[
                   T("scenery-title", "山野之间 · 秋日风景", 19, 650, "$hd-b-on-primary"),
                   T("scenery-sub", "把日常留在身后，一起去山野", 11, None, "$hd-b-on-primary"),
               ]),
           ]})

brand_foot = F("platform-brand 平台标识", w="fill_container", align="center", children=[
    IMG("platform-brand-image", ASSET + "platform-brand-original-transparent.png", w=140, mode="contain"),
])

tabbar = F("custom-tab-bar 四标签", w="fill_container", h=50, fill="$hd-b-nav",
           stroke="$hd-b-line", layout="horizontal",
           extra={"strokeWidth": {"top": 1}}, children=[])
for label, active in [("探索", True), ("活动", False), ("商城", False), ("我的", False)]:
    tabbar["children"].append(
        F(f"tab-item {label}", w="fill_container", h="fill_container", layout="vertical",
          gap=2, align="center", justify="center", children=[
              {"type": "icon", "id": nid(), "name": f"tab-icon {label}", "icon": "mountain",
               "width": 24, "height": 24,
               "fill": "$hd-b-primary" if active else "$hd-b-muted"},
              T(f"tab-label {label}", label, 10, 600 if active else None,
                "$hd-b-primary" if active else "$hd-b-muted"),
          ]))

body["children"] = [cats, head1, grid, shop, head2, swiper, brand_foot]
board["children"] = [hero, body, tabbar]

# 入口弹窗态（shortcut 弹窗，遮罩保持中性黑）
popup = F("B / 小程序 / 首页 · 入口弹窗态", w=390, h=420, fill="$hd-b-overlay",
          extra={"clip": True,"metadata": {"type": "berry-page", "platform": "miniprogram",
                              "route": "pages/home/index", "variant": "shortcut-popup",
                              "generated": "2026-11-17"}}, children=[
              F("shortcut-mask 弹窗", w=300, h=300, fill="$hd-b-surface", radius=12, pad=16,
                layout="vertical", gap=12, children=[
                    T("shortcut-title", "二维码", 17, 650),
                    IMG("shortcut-image", ASSET + "category-domestic.jpg", w="fill_container", h=160),
                    F("secondary 关闭", h=44, fill="$hd-b-soft", radius=10, align="center",
                      justify="center", w="fill_container",
                      children=[T("关闭文字", "关闭", 13, 600, "$hd-b-primary-text")]),
                ]),
          ])

# 结构校验
seen = set()

def validate(n):
    assert n["id"] not in seen, "重复 ID"
    seen.add(n["id"])
    for k in ("fill", "stroke"):
        v = n.get(k)
        if isinstance(v, str) and v.startswith("$") and v[1:] not in pen["variables"]:
            raise AssertionError(f"变量缺失 {v}")
    for c in n.get("children", []):
        validate(c)
validate(board)
validate(popup)

backup = ROOT / "design" / "backups" / f"设计图文件.pen.{time.strftime('%Y%m%d-%H%M%S')}.bak"
shutil.copy2(PEN, backup)
pen["children"].extend([board, popup])
PEN.write_text(json.dumps(pen, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"已生成并校验 2 个画板；备份 {backup.name}；文件 {PEN.stat().st_size:,} 字节")
