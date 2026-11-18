"""Function-first editable Web trees; no .pen access and no dependency on B UI.
build(page_blueprint, kit) returns one named tree. /shop?tab=orders is a distinct
presentation of the existing /shop mode. All samples below are design fixtures.
"""
import importlib.util
import json
from pathlib import Path

def build(p, kit):
    route = p["route"]
    title = p["title"]
    W = 1180
    def t(s,w=1100,size=14,color="$hd-a-ink",bold=False,h=24):
        return kit.text(s,w,size,color,bold,h)
    def box(name,children,w=W,pad=20,gap=14,fill="$hd-a-surface",border=True):
        height=sum(c["height"] for c in children)+gap*max(0,len(children)-1)+pad*2
        opts={"cornerRadius":8}
        if border:opts.update(stroke="$hd-a-line",strokeWidth=1)
        return kit.frame(name,w,height,children,gap=gap,pad=pad,fill=fill,**opts)
    def row(name,children,w=W,gap=16):
        return kit.row(name,children,w,max(c["height"] for c in children),gap=gap,alignItems="start")
    def buttons(labels,primary=None,w=W):
        return kit.row("动作", [kit.button(s,s==primary,max(88,min(220,len(s)*14+28))) for s in labels],w,44,gap=10)
    def info(name,pairs,w=W):
        iw=w-40
        nodes=[t(name,iw,17,bold=True,h=28)]
        for label,value in pairs:
            nodes.append(kit.row("只读 / "+label,[t(label,132,13,"$hd-a-muted"),t(value,iw-148,14,h=max(24,((len(str(value))*14)//max(100,iw-148)+1)*23))],iw,max(24,((len(str(value))*14)//max(100,iw-148)+1)*23),gap=16))
        return box(name,nodes,w)
    def form(name,fields,w=W,cols=2,actions=()):
        inner=w-40;fw=(inner-(cols-1)*16)/cols
        nodes=[t(name,inner,17,bold=True,h=28)]
        for i in range(0,len(fields),cols):
            nodes.append(row("输入分组",[kit.field(a,b,fw) for a,b in fields[i:i+cols]],inner))
        if actions:nodes.append(buttons(actions,actions[0],inner))
        return box(name,nodes,w)
    def table(name,cols,rows,w=W,weights=None):
        inner=w-40;n=len(cols);g=12;avail=inner-g*(n-1)
        weights=weights or [1]*n;cw=[avail*x/sum(weights) for x in weights]
        nodes=[t(name,inner,17,bold=True,h=28)]
        nodes.append(kit.row("表头",[t(c,cw[i],12,"$hd-a-muted",True,26) for i,c in enumerate(cols)],inner,42,gap=g,pad=[8,0],fill="$hd-a-bg"))
        for j,data in enumerate(rows):
            h=max(44,max(((len(str(value))*13)//max(1,cw[i])+1)*22+12 for i,value in enumerate(data)))
            nodes.append(kit.row("演示记录 "+str(j+1),[t(str(v),cw[i],13,h=h-12) for i,v in enumerate(data)],inner,h,gap=g,pad=[6,0],stroke="$hd-a-line",strokeWidth={"bottom":1},alignItems="center"))
        nodes.append(kit.row("分页",[t("第 1 页 · 演示记录",inner-220,12,"$hd-a-muted"),kit.button("上一页",False,90),kit.button("下一页",False,90)],inner,44,gap=12,alignItems="center"))
        return box(name,nodes,w)
    def textarea(name,value,w=W,h=180):
        inner=w-40
        return box(name,[t(name,inner,17,bold=True,h=28),kit.frame("文本编辑区 / "+name,inner,h,[t(value,inner-28,14,h=h-28)],pad=14,fill="$hd-a-surface",stroke="$hd-a-field",strokeWidth=1,cornerRadius=8)],w)
    def alert(message,action=None,w=W):
        nodes=[t(message,w-(196 if action else 40),13,"$hd-a-muted",h=44)]
        if action:nodes.append(kit.button(action,False,140))
        return kit.row("提示",nodes,w,68,gap=16,pad=[12,20],fill="$hd-a-bg",cornerRadius=8,alignItems="center")
    def tabs(names,selected,w=W):
        return buttons(names,selected,w)
    def split(left,right):
        return row("任务主次区域",[left,right])
    def stats():
        pairs=[("待发货","3 笔"),("支付待核对","2 笔"),("上报失败","1 笔"),("低库存","2 件")]
        return row("待处理事项",[box(a,[t(a,235,13,"$hd-a-muted"),t(b,235,28,bold=True,h=44),t("查看并处理 →",235,13,"$hd-a-primary")],283) for a,b in pairs])
    def sample_table():
        for s in p.get("sections",[]):
            if s.get("columns") and (s.get("sampleRows") or s.get("rows")):
                return table(s.get("title","记录"),s["columns"],s.get("sampleRows") or s["rows"])
        return None
    def field_filter(fields):
        return form("定位记录",fields,cols=min(4,len(fields)),actions=["筛选","重置"])
    sections=[];primary=p.get("primaryAction","")
    if route=="/login":
        logo=kit.image("原始品牌标识","platform-brand-original-transparent.png",140,76)
        logo["fill"]["mode"]="contain";logo.update(x=650,y=140)
        card=form("管理员登录",[("账号","admin-demo"),("密码","••••••••")],432,1,["登录"])
        card["children"].append(t("刷新后重新登录。请勿在公共设备展示个人资料。",392,12,"$hd-a-muted",h=44));card["height"]+=58
        card.update(x=504,y=260)
        return kit.frame("A 功能设计 / Web / 登录",1440,960,[logo,card],layout="none",fill="$hd-a-bg")
    if route=="/operations":
        primary="刷新"
        sections=[stats(),
          split(info("近 7 天经营概况",[("活动报名","48 人 · 已占名额 52 / 80"),("支付订单","26 笔"),("销售 / 退款","¥4,180.00 / ¥159.00")],582),
                table("每日金额",["日期","订单","成交","退款"],[["11/16","8","¥1,360","¥0"],["11/17","6","¥980","¥159"],["11/18","12","¥1,840","¥0"]],582)),
          table("需要核对的对象",["事项","对象","当前情况","下一步"],[["支付核对","SHOP-DEMO-003","支付渠道结果待确认","核对订单"],["履约上报","AC-DEMO-006","上报失败，已尝试2次","打开上报记录"]],weights=[1,1.5,2,1]),
          form("审计定位",[("对象ID","输入订单或活动ID")],actions=["查询"]),
          table("近期操作",["时间","管理员","动作","对象"],[["11/18 09:30","管理员","更新商品","轻量登山杖"],["11/18 09:10","管理员","发布活动","周末山脊徒步"]])]
    elif route=="/activities":
        primary="新建活动"
        sections=[field_filter([("活动标题","输入活动名称"),("分类","全部分类 ▾"),("状态","全部状态 ▾")]),sample_table()]
    elif route in ("/activities/new","/activities/:id/edit"):
        primary="创建草稿" if route.endswith("/new") else "保存修改"
        if not route.endswith("/new"):
            sections.append(info("当前活动",[("活动","周末山脊徒步"),("状态","草稿 · 有未保存修改")]))
        sections += [
            form("基本信息",[("活动名称","周末山脊徒步"),("分类","本周活动 ▾"),("摘要","森林缓坡环线，预计五小时"),("封面","已选择步道照片")]),
            row("行程与报名",[form("行程安排",[("开始时间","2026-12-05 08:00"),("结束时间","2026-12-05 16:00"),("地点","山脊步道"),("集合点","公园南门")],582,1),
                form("报名约束",[("报名截止","2026-12-04 18:00"),("人数上限","20"),("身份证要求","不要求 ▾"),("每人价格（元）","68.00")],582,1,["保存报名价格"] if not route.endswith("/new") else [])]),
            textarea("活动说明","请穿防滑鞋，自备饮水。遇恶劣天气将另行通知。",h=120),
            alert("创建并保存后可编辑图文正文。" if route.endswith("/new") else "正文与活动资料分别保存。",None if route.endswith("/new") else "编辑正文")]
        if not route.endswith("/new"):sections.append(buttons(["发布活动","取消活动"],"发布活动"))
    elif route=="/activities/:id/registrations":
        primary="刷新名单"
        sections=[info("出发活动",[("活动","周末山脊徒步"),("出发","12/05 08:00 · 公园南门"),("报名","12 / 20 人")]),sample_table(),alert("电话与证件默认隐藏。查看前需确认具体参与人和用途。","查看所选参与人")]
    elif route=="/templates":
        primary="新建模板"
        sections=[sample_table(),split(form("模板编辑",[("模板名称","周末轻徒步"),("来源活动","周末山脊徒步 ▾")],582,1,["保存模板"]),
             form("生成未来排期",[("开始时间","2026-12-05 08:00"),("次数","3"),("间隔（天）","7")],582,1,["生成草稿排期"])),alert("生成的活动仍需检查并发布，不会自动成为已发布活动。")]
    elif route=="/activity-orders":
        primary="刷新订单"
        sections=[field_filter([("活动","周末山脊徒步 ▾"),("订单","输入订单号")]),
          table("活动订单",["订单","活动","人数","应付 / 实付","状态","操作"],[["AC-DEMO-001","周末山脊徒步","2","¥122.40 / ¥0.00","待支付","查看订单"],["AC-DEMO-002","溪谷自然观察","1","¥0.00 / ¥0.00","免支付已确认","查看订单"],["AC-DEMO-003","周末山脊徒步","2","¥122.40 / ¥122.40","已支付","查看 / 退款"]]),
          split(info("订单详情",[("订单","AC-DEMO-001"),("活动","周末山脊徒步"),("状态","待支付 · 保留 2 个名额"),("人数 / 应付","2 人 / ¥122.40"),("实付","¥0.00"),("原价","¥136.00"),("支付交易","尚未支付")],582),
                box("当前可用动作",[t("支付待核对",542,17,bold=True,h=28),t("先核对微信结果，避免错误释放名额。",542,13,"$hd-a-muted"),buttons(["核对支付","关闭未付订单"],"核对支付",542)],582)),
          table("参与人",["姓名","手机","证件","操作"],[["王*","138****0000","已隐藏","确认查看"],["李*","139****0000","已隐藏","确认查看"]]),
          split(info("另一订单状态演示 · 已支付",[("订单","AC-DEMO-003"),("状态","已支付"),("实付 / 可退","¥122.40 / ¥122.40")],582),
                form("AC-DEMO-003 · 申请全额退款",[("退款原因","用户行程变更"),("全额退款确认","确认退还 ¥122.40")],582,1,actions=["申请全额退款"])),
          alert("退款申请、审核、核对与重试按实际状态出现；不能在待支付单上执行退款。")]
    elif route=="/shop":
        primary="新建商品"
        sections=[tabs(["商品与库存","订单与发货"],"商品与库存"),field_filter([("商品分类","全部分类 ▾")]),sample_table(),
          form("商品编辑",[("商品名称","轻量登山杖"),("分类","户外装备 ▾"),("原价（元）","199.00"),("现价（元）","159.00"),("库存","18"),("销售状态","上架 ▾"),("封面","已上传商品图片"),("商品描述","轻量折叠，适合日间徒步")],actions=["保存商品"]),
          alert("图文内容独立保存；分类维护不会隐式保存商品草稿。","编辑图文")]
    elif route=="/shop?tab=orders":
        title="商城订单与发货";primary="刷新订单"
        sections=[tabs(["商品与库存","订单与发货"],"订单与发货"),
          table("商城履约订单",["订单","商品","数量","实付","状态","操作"],[["SHOP-DEMO-001","轻量登山杖","1","¥159.00","已支付","查看 / 发货"],["SHOP-DEMO-002","折叠坐垫","2","¥58.00","已发货","查看"]],weights=[1.6,1.6,.6,1,1,1.2]),
          split(info("订单详情",[("订单","SHOP-DEMO-001"),("商品","轻量登山杖 × 1"),("实付","¥159.00"),("支付状态","已支付"),("收件人","王* · 138****0000"),("地址","默认隐藏")],582),
            form("实际发货",[("物流公司","顺丰"),("运单号","SF-DEMO-001")],582,1,["确认发货"])),
          alert("先完成实际履约，再确认发货。查看地址前需确认用途。","查看收件资料")]
    elif route=="/shop/categories":
        primary="新分类";sections=[sample_table(),form("分类编辑",[("名称","户外装备"),("排序","10")],actions=["保存分类"]),alert("只维护一级分类；已有商品不会因分类编辑被自动下架。")]
    elif route=="/refunds":
        primary="刷新退款";sections=[sample_table(),split(info("选中退款",[("订单","SHOP-DEMO-001"),("退款金额","¥159.00"),("原因","用户取消行程"),("状态","待审核")],582),
             form("审核决定",[("处理备注","填写审核说明")],582,1,["批准退款","拒绝退款"])),alert("退款处理中仅提供核对；失败时按可用状态重试，不重复申请。")]
    elif route=="/shipping-reports":
        primary="刷新上报";sections=[field_filter([("上报状态","全部 ▾")]),sample_table(),info("失败详情",[("订单","SHOP-DEMO-001"),("最近结果","平台暂不可用"),("已尝试","2 次"),("下次自动重试","11/18 10:00")]),buttons(["重试本条"],"重试本条"),alert("这里只上报履约结果，不会替代实际发货。")]
    elif route=="/users":
        primary="刷新用户";sections=[field_filter([("搜索","姓名或手机号"),("资料","全部 ▾"),("角色","全部 ▾"),("来源","微信 ▾")]),sample_table(),
          split(info("用户资料",[("姓名","王*"),("手机号","138****0000"),("账号来源","微信 · 已验证"),("角色","普通用户"),("资料状态","已完善")],582),
                box("账号授权",[t("管理员权限",542,17,bold=True,h=28),t("可调整此微信账号角色。业务会员等级不授予后台权限。",542,13,"$hd-a-muted",h=44),buttons(["授予管理员"],None,542)],582)),
          table("报名历史",["活动","来源","状态","人数","时间"],[["周末山脊徒步","活动订单","已支付","2","11/18"],["溪谷自然观察","免费报名","已确认","1","11/10"]])]
    elif route=="/memberships":
        primary="新建等级"
        sections=[table("等级",["名称","排序","状态","活动优惠","商品优惠","操作"],[["山野会员","10","启用","9折 / 最多1人","每件减10元","编辑"],["资深会员","20","启用","固定¥60 / 全部参与人","9折","编辑"]],weights=[1.3,.5,.7,1.8,1.5,.7]),
           form("等级基本信息",[("等级名称","山野会员"),("排序","10"),("启用","已启用 ▾")],cols=3),
           row("活动与商品独立规则",[form("活动优惠",[("启用","已启用 ▾"),("方式","折扣 ▾"),("折扣","9 折"),("适用参与人","同单最多一人 ▾")],582,1),
               form("商品优惠",[("启用","已启用 ▾"),("方式","减价 ▾"),("每件减免","10.00 元")],582,1)]),
           buttons(["保存等级"],"保存等级"),
           form("指定用户身份",[("搜索用户","王*"),("业务身份","会员 ▾"),("会员等级","山野会员 ▾")],cols=3,actions=["保存用户身份"])]
    elif route=="/notifications":
        primary="刷新消息";sections=[alert("微信消息配置可用。重排队列不代表已经送达。","核对配置"),sample_table(),info("失败消息",[("标题","周末活动出发提醒"),("状态","发送失败"),("原因","平台暂不可用"),("次数","1")]),buttons(["重试原通知"],"重试原通知"),alert("缺订阅授权时，先核实用户已在小程序重新同意，再重试。")]
    elif route=="/articles":
        primary="新建文章";sections=[sample_table()]
    elif route in ("/articles/new","/articles/:id/edit"):
        primary="保存草稿"
        sections=[tabs(["工作台","文档"],"工作台"),
           split(box("写作主区",[kit.field("标题","冬季徒步装备清单",720),textarea("Markdown 正文","## 出发准备\n检查登山鞋、饮水与天气。\n\n## 装备清单\n- 防滑徒步鞋\n- 雨衣与保暖层",720,330)],760),
                 form("文章资料",[("摘要","出发前检查装备与天气"),("封面","已上传装备图片"),("关联活动","冬季露营入门 ▾")],404,1)),
           alert("先保存文章资料取得ID，再启用正文编辑。" if route.endswith("/new") else "正文和资料均已保存，才可发布。"),
           buttons(["发布文章","设为官方文章","撤回发布"],"发布文章") if not route.endswith("/new") else alert("新草稿尚未发布。")]
        if route.endswith("/new"):
            sections=[form("文章资料",[("标题","冬季徒步装备清单"),("摘要","出发前检查装备与天气"),("封面","已上传装备图片"),("关联活动","冬季露营入门 ▾")]),alert("先保存草稿，取得文章ID后再编写正文。")]
    elif route=="/legal":
        primary="保存草稿";sections=[tabs(["隐私政策","用户协议"],"隐私政策"),
           split(box("协议草稿",[kit.field("标题","隐私政策",720),textarea("正文","我们仅在提供活动报名与订单服务所需范围处理资料。\n\n姓名与手机号用于报名联系。身份证号仅在活动要求时收集。",720,280)],760),
                 info("版本记录",[("当前发布","v2 · 2026-10-31"),("编辑草稿","未发布"),("历史 v1","2026-10-01 · 只读")],404)),
           buttons(["发布新版本"],"发布新版本"),alert("发布前确认正文已保存；历史版本只读，不覆盖用户已确认记录。")]
    elif route=="/settings":
        primary="保存四个入口";sections=[
           tabs(["入口 1","入口 2","入口 3","入口 4"],"入口 1"),
           split(form("入口设置",[("名称","本周活动"),("图标","本周山野 ▾"),("跳转类型","已有页面 ▾"),("目标页面","本周活动 ▾")],582,1),
                 info("当前入口预览",[("入口 1","本周活动 → 本周活动页"),("入口 2","国内游行 → 国内游行页"),("入口 3","联系我们 → 弹窗"),("入口 4","野小子 → 官方文章")],582)),
           alert("四个入口使用同一份草稿。切换入口不会自动保存。"),
           split(info("微信订单中心",[("启用状态","已启用"),("详情路径","尚未配置"),("平台确认","未完成"),("最近结果","尚未请求")],582),
                 form("订单详情路径",[("路径","pages/order-detail/index")],582,1,["设置路径"]))]
    elif route=="/settings/admin-account":
        primary="修改账号";sections=[info("账号能力",[("账号","admin-demo"),("状态","已配置"),("操作权限","允许配置")]),
           form("修改管理员账号",[("账号","admin-demo"),("当前密码","••••••••"),("新密码","••••••••"),("确认新密码","••••••••")],actions=["保存账号设置"]),
           alert("需验证当前密码。保存后其他管理会话失效，密码字段立即清空。")]
    else:
        raise ValueError("Unmapped functional route: "+route)
    sections=[s for s in sections if s]
    header=kit.row("任务标题",[t(title,830,28,bold=True,h=44),kit.button(primary or "刷新",True,220)],W,64,alignItems="center",justifyContent="space_between")
    footer=t("示例数据 · 功能设计稿",W,12,"$hd-a-muted",h=24)
    bodychildren=[header]+sections+[footer]
    h=max(960,sum(n["height"] for n in bodychildren)+16*(len(bodychildren)-1)+64)
    body=kit.frame("功能任务内容",1244,h,bodychildren,gap=16,pad=32,fill="$hd-a-bg")
    return kit.frame("A 功能设计 / Web / "+title+" / "+route,1440,h,[kit.sidebar(route.split("?")[0],h),body],"horizontal",fill="$hd-a-surface")

def self_test():
    root=Path(__file__).resolve().parents[1]
    spec=importlib.util.spec_from_file_location("functional_kit",root/"scripts/functional-design.py")
    kit=importlib.util.module_from_spec(spec);spec.loader.exec_module(kit)
    blue=json.loads((root/"docs/ui-refactor/dawn-a/functional-web-blueprints.json").read_text("utf-8-sig"))
    pages=blue["pages"]+[dict(next(p for p in blue["pages"] if p["route"]=="/shop"),route="/shop?tab=orders",title="商城订单与发货")]
    report=[]
    def walk(n):
        yield n
        for c in n.get("children",[]):yield from walk(c)
    for p in pages:
        tree=build(p,kit);nodes=list(walk(tree))
        assert tree["width"]==1440
        assert all(n.get("name") for n in nodes)
        assert all(n["type"] in {"frame","text","rectangle"} for n in nodes)
        assert all(isinstance(n.get("height"),(int,float)) and n["height"]>0 for n in nodes)
        for n in nodes:
            children=n.get("children",[]);pad=n.get("padding",0)
            pad=[pad]*4 if isinstance(pad,(int,float)) else (pad*2 if len(pad)==2 else pad)
            if children and n.get("layout")=="vertical":
                used=sum(c["height"] for c in children)+n.get("gap",0)*(len(children)-1)+pad[0]+pad[2]
                assert used <= n["height"]+1, (p["route"],n["name"],"height",used,n["height"])
            if children and n.get("layout")=="horizontal" and all(isinstance(c.get("width"),(int,float)) for c in children):
                used=sum(c["width"] for c in children)+n.get("gap",0)*(len(children)-1)+pad[1]+pad[3]
                assert used <= n["width"]+1, (p["route"],n["name"],"width",used,n["width"])
        content=" ".join(n.get("content","") for n in nodes)
        assert not any(x in content for x in ["DISCOUNT","FIXED","REDUCTION","ACCOUNT_ALL","ONE_BENEFIT","GUEST","MEMBER","LEADER"])
        report.append(dict(route=p["route"],kind=p["kind"],height=tree["height"],nodes=len(nodes),named=True,enumLabelsChinese=True))
    return report

if __name__=="__main__":
    print(json.dumps({"passed":True,"pages":self_test()},ensure_ascii=False,indent=2))
