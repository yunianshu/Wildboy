"""Independent functional state boards, generated solely from application workflows."""
def build(kit):
 f,t,r,b=kit.frame,kit.text,kit.row,kit.button
 def card(title,lines,primary,secondary='',mobile=False):
  width=358 if mobile else 560;inner=width-48
  nodes=[t(title,inner,22,bold=True,h=62 if mobile else 36)]+[t(x,inner,14,h=48 if len(x)>25 else 24) for x in lines]
  nodes.append(b(primary,True,inner))
  if secondary:nodes.append(b(secondary,False,inner))
  height=sum(x['height'] for x in nodes)+16*(len(nodes)-1)+48
  return f(title,width,height,nodes,gap=16,pad=24,fill='$hd-a-surface',cornerRadius=12,stroke='$hd-a-line',strokeWidth=1)
 specs=[
 ('version-conflict','内容已更新',['你正在编辑的活动已由另一位管理员更新。','当前填写内容仍保留，尚未覆盖服务器版本。','重新读取前，请核对并保留需要的修改。'],'重新读取并复核','继续查看草稿'),
 ('privacy-reveal','查看参与人资料',['演示活动：周末山脊徒步','为联系参与人和核验保险信息，将显示电话及证件资料。','请仅用于活动服务，离开页面后资料将隐藏。'],'确认查看','取消'),
 ('activity-publish','发布活动？',['周末山脊徒步 · 11 月 21 日 09:00','报名价 ¥68.00 / 人 · 限 20 人','发布后，用户可在小程序浏览并报名。'],'确认发布','返回检查'),
 ('refund-action','批准整单退款？',['演示订单 DEMO-A-001 · 2 位参与人','实付 ¥122.40 · 整单退款 ¥122.40','批准后由微信处理退款，到账以渠道确认结果为准。'],'确认批准退款','返回'),
 ('role-change','变更管理员权限？',['演示账号：运营小野','当前：管理员 → 调整为：普通用户','变更后原登录会话失效，对方需要重新登录。'],'确认变更','取消')]
 result=[]
 for key,title,lines,primary,secondary in specs:
  c=card(title,lines,primary,secondary);c.update(x=440,y=180)
  root=f('A 功能设计 / Web 状态 / '+title,1440,960,[t('管理操作确认',1200,28,bold=True,h=44),c],layout='none',fill='$hd-a-bg')
  result.append(dict(key='web-state:'+key,node=root))
 mini=[
 ('auth-required','暂无管理权限',['你当前的账号还没有管理权限。','如已获得授权，请先验证管理员身份。'],'验证管理员身份','返回'),
 ('quote-changed','费用有变化',['已保留你当前填写的内容。','请重新获取并核对费用，再确认提交。'],'重新获取费用','返回检查'),
 ('payment-unknown','付款结果待核对',['DEMO-A-001 · 周末山脊徒步','应付 ¥122.40','付款结果尚未确认，请勿重复下单。'],'刷新付款结果','查看原订单'),
 ('version-conflict','内容已被更新',['你的修改尚未保存，填写内容仍保留。','重新加载前，请确认是否放弃当前修改。'],'重新加载','继续检查修改'),
 ('refund-confirmation','确认整单退款',['DEMO-A-001 · 周末山脊徒步','本单 2 人 · 实付 ¥122.40','退款原因：行程有变','本次申请涵盖整单全部参与人，提交后仍需等待审核及微信退款结果。'],'确认提交','返回')]
 for key,title,lines,primary,secondary in mini:
  c=card(title,lines,primary,secondary,True)
  root=f('A 功能设计 / 小程序状态 / '+title,390,max(844,c['height']+140),[t('9:41',358,12,h=24),t('‹  返回',358,15,h=36),c],gap=16,pad=16,fill='$hd-a-bg')
  result.append(dict(key='mini-state:'+key,node=root))
 colors=[]
 for name,value in [('森林绿','#247A52'),('浅草绿','#EAF4E7'),('正文','#20372C'),('说明','#5D7064'),('页面底色','#F6F8F3'),('边界','#E2E9E1')]:
  colors.append(f(name,160,132,[f(name+'色板',128,64,fill=value,cornerRadius=8),t(name+' '+value,128,12,h=20)],gap=8,pad=16,fill='$hd-a-surface'))
 nodes=[t('WildBoy / 晨光绿白',1280,36,bold=True,h=60),t('从真实业务出发，让出发、交易与管理更清楚。',1280,20,h=40),r('颜色',colors,1280,132,gap=16),t('界面原则',1280,24,bold=True,h=40),t('活动与商品分别定价；用户身份不等于管理权限；确认前展示可靠报价；未知支付结果先核对原订单。',1280,18,h=60),r('主要动作',[b('确认报名',True,180),b('返回检查',False,180)],1280,44),kit.field('示例字段：参与人','小野（演示）',480),t('所有页面中的姓名、金额、订单、地址均为虚构演示数据；设计稿不会修改业务数据。',1280,16,h=48)]
 root=f('A 功能设计 / 设计系统与业务原则',1440,920,nodes,gap=28,pad=64,fill='$hd-a-bg')
 result.insert(0,dict(key='system:principles',node=root))
 return result

_base_build = build

def build(kit):
    """Return the principles board, business states and list recovery examples."""
    parts=[]
    for title,copy,action in [('正在加载活动','正在获取最新活动信息，请稍候。',''),('还没有活动','创建第一个活动后，用户就能开始报名。','新建活动'),('没有符合条件的活动','试试更换关键词或清除筛选条件。','清除筛选'),('活动加载失败','暂时无法连接，请保留当前筛选后重试。','重试')]:
        children=[kit.text(title,496,22,bold=True,h=36),kit.text(copy,496,16,h=54)]
        if action: children.append(kit.button(action,True,160))
        parts.append(kit.frame(title,560,240,children,gap=20,pad=32,fill='$hd-a-surface',cornerRadius=8))
    node=kit.frame('A 功能设计 / Web 状态 / 列表恢复与空态',1440,920,[kit.text('列表状态与恢复入口',1280,30,bold=True,h=48),kit.row('加载与空数据',parts[:2],1280,240,gap=32),kit.row('筛选与错误',parts[2:],1280,240,gap=32),kit.text('提交中保留内容并锁定重复操作；失败不同时展示空态；取消回到原页面与筛选。',1280,18,h=60)],gap=32,pad=64,fill='$hd-a-bg')
    return _base_build(kit)+[dict(key='web-state:list-recovery',node=node)]
