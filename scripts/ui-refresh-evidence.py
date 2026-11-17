"""Join actual route, Pen and runtime evidence for the 2026-11-17 refresh.

Does not edit or parse .pen files; all design data comes from the MCP readback.
Run after the isolated native/browser checks have produced their reports.
"""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
import re
import shutil

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/ui-refactor/2026-11-17"
RUN = ROOT / "test-results/ui-refresh-2026-11-17"


def read(p):
    return json.loads(p.read_text(encoding="utf-8"))


def write(p, value):
    p.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def rel(p):
    return p.relative_to(ROOT).as_posix()


def normalize(route):
    return route.replace(":articleId", ":id")


inventory = read(OUT / "inventory.json")
mapping = read(OUT / "design-map.json")
snapshot = read(OUT / "pen-readback.json")
assert len(snapshot["nodes"]) == 8331
assert not any(n.get("problems") for n in snapshot["nodes"])
assert hashlib.sha256((OUT / "pen-readback.json").read_bytes()).hexdigest() == mapping["sha256"]
native = read(RUN / "native-pages-report.json")
assert len(native["results"]) == 30 and not native["exceptions"]
native_by_route = {x["route"]: x for x in native["results"]}
user = read(RUN / "native-user-report.json")
admin = read(RUN / "admin-report.json")
home = read(RUN / "home-article-report.json")
assert user["status"] == admin["status"] == "passed"
assert len(home["checks"]) == 5 and not home["exceptions"] and home["configurationRestored"]

web_reports = [
    ROOT / "test-results/admin-redesign-browser/1794888983311-cbfc8/report.json",
    ROOT / "test-results/admin-redesign-browser/1794889134489-bd357/report.json",
]
web = {}
for p in web_reports:
    report = read(p)
    for row in report["screens"]:
        label = ("登录界面" if row["route"] == "/login" else row["route"]) + f' {row["width"]}×{row["height"]}'
        assert any(x["name"] == label and x["passed"] for x in report["checks"]), label
        assert row["horizontalOverflow"] <= 1
        filename = re.sub("[^a-z]+", "-", row["route"].lstrip("/")) + f'-{row["width"]}.png'
        image = p.parent / filename
        assert image.is_file(), image
        web[(normalize(row["route"]), row["width"])] = {**row, "report": rel(p), "screenshot": rel(image)}
workflows_path = ROOT / "test-results/admin-redesign-browser/1794889227661-b34c5/report.json"
workflows = read(workflows_path)
assert len(workflows["checks"]) == 25 and all(x["passed"] for x in workflows["checks"])

# Human-reviewed task/context descriptions supplement the code-derived handler,
# field, interface and related-page lists; they do not redefine business rules.
intents = {
    "/login": ("管理员登录", "账号密码登录、开发身份入口和失败恢复", "受保护路由重定向或直接打开；成功继续管理工作台"),
    "/activities": ("活动管理", "活动搜索、分类/状态筛选、分页、新建、编辑、名单入口", "后台根路由 / 的实际首页；列表入口携带活动 id"),
    "/shop": ("商城管理", "商品/订单双视图，分类筛选、双价库存编辑、图文、资料揭示、发货确认", "侧栏或 ?tab=orders；订单和商品 id/版本来自真实列表"),
    "/shop/categories": ("商品分类", "查看、新建及编辑分类名称和排序", "商城分类入口；不恢复删除或多级分类等不存在的功能"),
    "/users": ("用户管理", "查询筛选、资料与权限、报名历史、授权确认和按需揭示", "侧栏或关联用户；详情保存用户 id、版本及分页筛选"),
    "/memberships": ("会员管理", "等级、两类业务优惠规则、用户身份查询和分配", "侧栏；等级与用户独立选择，服务端决定资格和优惠"),
    "/activity-orders": ("活动订单", "订单查询、参与人脱敏/揭示、支付核对、退款处理", "侧栏或名单/用户历史活动上下文；使用订单 id/版本"),
    "/templates": ("活动模板", "从已有活动保存模板、编辑模板、按安排生成草稿", "侧栏；源活动和模板 id，生成后进入真实活动草稿"),
    "/operations": ("运营工作台", "日期范围统计、异常待办、支付核对、审计筛选与分页", "侧栏及旧 /waitlist 重定向；业务动作继续访问原对应页面"),
    "/refunds": ("退款售后", "退款列表、审核确认、拒绝、失败核对及重试", "侧栏；退款 id/版本，金额以订单与服务端返回为准"),
    "/shipping-reports": ("发货上报", "上报状态筛选、订单上下文和补报确认", "侧栏；原物流上报记录 id，不创建新发货语义"),
    "/notifications": ("消息管理", "通知列表、配置状态、受条件限制的重排确认与错误恢复", "侧栏；只有原逻辑允许的通知状态可以重排"),
    "/legal": ("协议管理", "协议类型、草稿编辑、预览、发布确认和版本历史", "侧栏；kind、revision 和当前发布版本分别保持"),
    "/articles": ("文章管理", "文章列表、发布状态和新建/编辑入口", "侧栏；真实文章 id 进入独立编辑路由"),
    "/articles/new": ("新建文章", "标题、摘要、封面、关联活动、Markdown 草稿与两种布局", "文章列表新建；首次保存后取得服务端 id 并进入编辑页"),
    "/articles/:id/edit": ("编辑文章", "基本资料、Markdown、预览、发布/下架/官方介绍确认", "文章列表或直接链接 id；草稿、版本和布局切换规则保留"),
    "/settings": ("基础配置", "四个首页入口，页面/文章/弹窗及图片内容配置", "侧栏；按入口 slot 和配置 version 保存，首页实时读取"),
    "/settings/admin-account": ("管理员账号", "配置能力读取、当前密码校验、新账号及密码设置", "侧栏；演示身份只读，确认密码仅留前端"),
    "/activities/new": ("新建活动", "活动信息、时间地点、定价、封面、内容分组与保存草稿", "活动列表或模板创建；未保存表单受离开保护"),
    "/activities/:id/edit": ("编辑活动", "分组编辑、定价更新、图文编辑、发布/取消确认", "列表 id 或草稿保存跳转；实体版本和已发布限制保留"),
    "/activities/:id/registrations": ("报名名单", "活动摘要、参与人列表、分页、脱敏资料和确认揭示", "活动列表/编辑/用户历史；活动 id 与名单状态关联"),
    "home": ("首页（保护）", "真实首页入口、活动、装备、文章轮播、弹窗和原 TabBar", "启动 pages 首项与探索 Tab；保留布局、代码与数据加载"),
    "activities": ("活动列表", "分类定位、活动列表、加载更多与详情入口", "首页分类参数或活动 Tab；wildboy-category 仍按原规则消费"),
    "shop": ("商城", "商品分类、双列商品、双价和库存、刷新与详情入口", "商城 Tab 或首页装备入口；分类缓存与身份隔离保留"),
    "product": ("商品详情", "商品图片、内容、双价、数量报价和购买入口", "首页/商城传 id；报价与库存以真实接口为准"),
    "checkout": ("确认订单", "商品数量、地址选择、协议、报价、幂等下单与支付恢复", "商品详情传 id/quantity；登录/选址返回原结算上下文"),
    "orders": ("我的订单", "状态筛选、订单记录、支付/取消/退款/核对及物流", "我的入口或结算结果；未知支付结果继续核对原订单"),
    "detail": ("活动详情", "活动封面、时间地点、正文、报名状态、分享和报名入口", "首页/列表/分享传 id；按已有报名和订单显示真实动作"),
    "register": ("活动报名", "参与人、必要身份证、报价、协议、免费确认或付费下单", "活动详情传 id；登录后继续原活动，保留草稿及重复提交保护"),
    "mine": ("我的", "账号身份、报名/订单、资料、协议、地址及管理入口", "我的 Tab；身份与能力接口决定管理入口可用性"),
    "privacy": ("协议详情", "当前或指定版本协议正文和失败恢复", "登录/报名/我的传 kind、可选 version；不改变同意语义"),
    "registrations": ("我的报名", "报名状态列表、活动详情及活动订单入口", "我的入口或报名结果；筛选分页与取消期限按原规则"),
    "signup-success": ("报名结果", "确认报名、活动摘要、参与人及后续入口", "报名成功传活动 id/registrationId；必须重新读取真实报名"),
    "admin-login": ("管理员登录", "管理员账号密码、错误反馈和返回我的", "能力判断允许时由登录或我的进入；成功由服务端授予身份"),
    "admin-activities": ("活动管理", "状态筛选、活动新增/编辑/名单和取消确认", "我的管理入口；ADMIN 校验与真实活动版本"),
    "admin-editor": ("活动编辑", "活动分段表单、时间地点、收费、封面/图文和保存/发布", "活动管理传可选 id；分段共享草稿，冲突暂停覆盖"),
    "admin-roster": ("报名名单", "已报名/已取消筛选、参与人、隐私确认及 CSV 导出", "活动传 id；导出沿用真实筛选范围与敏感字段规则"),
    "login": ("微信登录", "当前协议主动同意、微信登录、先逛逛和管理员入口", "受保护操作携带原返回目标；不自动勾选或更换身份"),
    "admin-legal": ("协议管理", "协议草稿、预览、发布确认与历史版本", "我的管理入口；kind、revision 与发布版本独立"),
    "admin-shop": ("商品管理", "商品列表、新增/编辑及订单管理入口", "我的管理入口；真实商品 id 进入表单"),
    "admin-product": ("商品编辑", "名称分类、原价现价、库存、封面、说明、状态、分类维护和确认", "商品管理传可选 id；类别版本与商品草稿相互独立"),
    "admin-orders": ("订单发货", "订单状态筛选、资料揭示、物流信息和发货确认", "商品管理入口；订单 id 与发货前提不变"),
    "addresses": ("收货地址", "地址新增/编辑、默认地址、删除和结算选择返回", "我的或结算选择模式；保留调用方上下文及选中地址"),
    "notifications": ("活动消息", "本人消息、加载更多及原订阅提醒入口", "我的或报名相关入口；订阅授权继续依赖原生平台"),
    "profile": ("联系资料", "本人姓名手机、协议、会员身份和保存返回", "我的/报名资料完善入口；不增加头像昵称等授权门槛"),
    "admin-users": ("用户管理", "查询过滤、资料/报名历史、角色操作与隐私说明", "我的管理入口；id/version 和后端 canChangeRole 控制动作"),
    "admin-content": ("图文内容", "活动/商品文字、图片、表格块的增改、排序及保存", "编辑页传 id/kind；保留本地块、冲突与未保存离开保护"),
    "article": ("文章详情", "公开文章或官方介绍、Markdown 渲染、空态与重试", "首页/分享传 id 或 official=1；无效参数与下架状态明确"),
    "admin-memberships": ("会员管理", "等级规则、启停、排序、用户身份筛选与分配", "我的管理入口；服务端版本控制优惠与会员变更"),
    "activity-orders": ("活动订单", "本人订单、参与人、付款/核对/取消/退款及记录", "我的/报名/详情入口，可携带活动上下文；金额按服务端快照"),
    "admin-activity-orders": ("活动订单与退款", "管理订单、参与人、支付核对、退款审核和确认面板", "我的管理或活动上下文；订单/退款版本及禁止条件保持"),
}

widths = {1440, 1280, 1024, 721, 720, 390, 320}
for p in inventory["pages"]:
    route = p["route"]
    key = route if p["platform"] == "web" else route.split("/")[1]
    p["pageName"], p["mainFunctions"], p["entryContext"] = intents[key]
    p["module"] = p["pageName"]
    if p["platform"] == "web":
        p["role"] = "未登录可进入；凭据由真实后端验证，成功须为 ADMIN" if route == "/login" else "服务端 ADMIN；数据范围、可操作条件及版本由原接口校验"
    elif key.startswith("admin-") and key != "admin-login":
        p["role"] = "服务端 ADMIN；页面守卫和后端鉴权同时保留"
    elif key in {"home", "activities", "shop", "product", "detail", "privacy", "article"}:
        p["role"] = "公开浏览；个人报名/订单状态及受保护动作需登录"
    elif key in {"login", "admin-login"}:
        p["role"] = "未登录可进入；微信同意/管理员凭据验证沿用各自流程"
    elif key == "mine":
        p["role"] = "访客可进入；个人信息需登录，管理入口按真实能力与 ADMIN 身份显示"
    else:
        p["role"] = "本人数据与提交需有效用户会话；不以本地缓存替代服务端数据范围校验"
    p["failureAndRecovery"] = "沿用本页错误、重试、校验与权限处理；不清空有效草稿，不把请求未知结果当作成功。具体恢复事件见 handlers 和实际源文件。"
    p["successAndReturn"] = "沿用本页成功回填/刷新及原返回入口；筛选、分页、滚动或草稿的保留与重置按原实现，不新增恢复规则。"
    p["dataSourceFiles"] = [p["file"], "admin/src/api.ts"] if p["platform"] == "web" else [p["file"] + ".ts", "miniprogram/src/utils/api.ts"]
    p["apiReferencesNote"] = "代码提取的调用字符串索引，可能含导航或动态片段；完整参数、方法、权限以 dataSourceFiles 的真实实现为准。"
    if p["platform"] == "web":
        evidence = [web[(route, w)] for w in sorted(widths)]
        p["implementationFiles"] = [p["file"], "admin/src/main.ts", "admin/src/style.css", "admin/src/styles/tokens.css", "admin/src/styles/slate.css"]
        p["verificationStatus"] = "verified-browser-7-viewports-and-existing-regressions"
        p["verificationEvidence"] = evidence + [{"businessReport": rel(workflows_path), "scope": "按报告逐项区分真实 API 与合成故障响应"}]
        p["componentPattern"] = ["Web sidebar/header", "existing FormModal/ConfirmDialog/UiState/AppIcon as used by source"]
    else:
        n = native_by_route[route]
        assert n["rendered"] and n["dataValidated"] and not n["error"]
        p["implementationFiles"] = [p["file"] + ext for ext in (".wxml", ".wxss", ".json")]
        if p["refactor"]:
            p["implementationFiles"] += ["miniprogram/src/styles/slate-theme.wxss", "miniprogram/src/styles/slate-components.wxss", "miniprogram/src/styles/slate-tokens.wxss"]
        p["verificationStatus"] = "verified-native-devtools-and-existing-regressions" if p["refactor"] else "verified-protected-home"
        p["verificationEvidence"] = [{**n, "screenshot": rel(RUN / n["file"]), "report": rel(RUN / "native-pages-report.json")}]
        p["componentPattern"] = ["page-local slate theme", "page-specific *-slate components declared in JSON"] if p["refactor"] else ["original home and shared dependencies unchanged"]
        if key == "article":
            p["verificationEvidence"].append({"screenshot": rel(RUN / "native-article-populated.png"), "report": rel(RUN / "home-article-report.json"), "state": "published real API article and protected homepage navigation"})
        if key == "home":
            p["verificationEvidence"] += [{"report": rel(RUN / x)} for x in ("home-protection-final.json", "home-pixel-comparison.json", "home-article-report.json")]
    p["implementationStatus"] = "implemented" if p["refactor"] else "preserved-unchanged"
    p["verificationLimits"] = "本地隔离后端与运行环境证据；未替代真机、生产微信支付/通知/物流外部服务验收。"

baseline = read(OUT / "home-baseline.json")
changed = [r["file"] for r in baseline["files"] if hashlib.sha256((ROOT / r["file"]).read_bytes()).hexdigest() != r["sha256"]]
assert not changed, changed
write(RUN / "home-protection-final.json", {"checked": len(baseline["files"]), "unchanged": len(baseline["files"]), "changed": changed})
pixel = read(RUN / "home-pixel-comparison.json")
assert pixel["differentPixelsOutsideExcludedRegions"] == 0
mapping["pages"] = inventory["pages"]
mapping["componentCatalog"] = [{"id": n["id"], "name": n["name"]} for n in snapshot["nodes"] if n.get("reusable")]
mapping["componentCatalogNote"] = "可复用组件真实节点目录；展开后的实例最终样式在 pen-readback.json。目录不冒充每个页面的原始 ref 链。"
mapping["verificationUpdatedAt"] = datetime.now(timezone.utc).isoformat()
mapping["verificationScope"] = "All routes designed/read/implemented; local browser/native checks passed. External services and physical devices not claimed."
write(OUT / "inventory.json", inventory)
write(OUT / "design-map.json", mapping)
write(OUT / "runtime-evidence.json", {
    "webRouteMatrix": list(web.values()),
    "webBusiness": {"report": rel(workflows_path), "checks": workflows["checks"], "browserErrors": workflows["browserErrors"]},
    "nativePages": native, "nativeUser": user, "nativeAdmin": admin, "homeAndArticle": home,
    "homeProtection": read(RUN / "home-protection-final.json"), "homePixelComparison": pixel,
    "limitations": ["Native DevTools is not a physical device.", "Actual payment, WeChat notification delivery, file sending and external shipping reconciliation are not exercised."],
})

lines = ["## 逐页完成清单", "", "下列状态表示设计、结构化回读、实现和本地运行验证；外部服务与真机范围见验证报告。完整字段、接口、附属画板、事件及证据路径保存在 inventory.json / design-map.json。", ""]
for platform, label in (("web", "Web 管理后台"), ("mini", "小程序")):
    lines += ["### " + label, "", "| 页面 / 路由 | 主要功能 | Pen 主节点 | 设计 / 回读 / 实现 / 验证 |", "| --- | --- | --- | --- |"]
    for p in inventory["pages"]:
        if p["platform"] != platform:
            continue
        status = "保留 / 已读 / 未改 / 首页专项通过" if not p["refactor"] else "已设计 / 已读 / 已实现 / 本地通过"
        lines.append(f'| {p["pageName"]} · {p["route"]} | {p["mainFunctions"]} | {p["artboards"][0]["id"]} | {status} |')
    lines.append("")
plan = OUT / "plan.md"
body = plan.read_text(encoding="utf-8").split("\n## 逐页完成清单")[0]
plan.write_text(body.rstrip() + "\n\n" + "\n".join(lines) + "\n", encoding="utf-8")

evidence = OUT / "evidence"
evidence.mkdir(exist_ok=True)
for file in ["native-home.png", "native-activities.png", "native-shop.png", "native-mine.png", "native-admin-product.png", "native-article-populated.png", "home-popup-protected.png", "native-contact-1.jpg", "native-contact-2.jpg", "native-contact-3.jpg"]:
    shutil.copy2(RUN / file, evidence / file)
for route, name in [("/activities", "web-activities.png"), ("/login", "web-login.png"), ("/articles/:id/edit", "web-article-editor.png")]:
    shutil.copy2(ROOT / web[(route, 1440)]["screenshot"], evidence / name)
print(f'Finalized {len(inventory["pages"])} routes; {len(web)} browser route/viewport cases, 30 native pages, 81 protected files.')
