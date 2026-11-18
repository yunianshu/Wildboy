"""Prepare functional design trees for official Pencil MCP. Never reads/writes .pen files."""
from pathlib import Path
import json, re, math
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'docs/ui-refactor/dawn-a'
ASSET='../miniprogram/src/assets/'
V={'primary':'#247A52','soft':'#EAF4E7','ink':'#20372C','muted':'#5D7064','line':'#E2E9E1','field':'#7B8D80','surface':'#FFFFFF','bg':'#F6F8F3','success':'#4C5F28','success-bg':'#F1F4DE','warning':'#74603C','warning-bg':'#F6F0E3','danger':'#9F4C46','danger-bg':'#FAECE9','info':'#466454','info-bg':'#EFF5F0'}
def frame(name,w,h,children=(),layout='vertical',gap=0,pad=0,fill=None,**kw):
 d=dict(type='frame',name=name,width=w,height=h,layout=layout,gap=gap,padding=pad,children=list(children));d.update(kw)
 if fill:d['fill']=fill
 return d
def text(content,w='fill_container',size=14,color='$hd-a-ink',bold=False,h=None,name=None):
 s=str(content);h=h or max(round(size*1.55),math.ceil(len(s)*size/(w if isinstance(w,(int,float)) else 300))*round(size*1.55))
 return dict(type='text',name=name or s[:35],content=s,width=w,height=h,textGrowth='fixed-width',fontFamily='Noto Sans SC',fontSize=size,fontWeight='600' if bold else 'normal',lineHeight=1.45,fill=color)
def button(label,primary=False,w=112):
 return frame('操作 / '+label,w,44,[text(label,w-24,14,'#FFFFFF' if primary else '$hd-a-primary',True,22)],layout='horizontal',pad=[0,12],fill='$hd-a-primary' if primary else '$hd-a-soft',cornerRadius=8,alignItems='center',justifyContent='center')
def field(label,value='',w=320):
 return frame('字段 / '+str(label),w,78,[text(label,w,13,'$hd-a-muted',h=22),frame('输入 / '+str(label),w,44,[text(value or '请输入'+str(label),w-24,14,'$hd-a-ink' if value else '$hd-a-muted',h=22)],layout='horizontal',pad=[0,12],fill='$hd-a-surface',cornerRadius=8,stroke='$hd-a-field',strokeWidth=1,alignItems='center')],gap=8)
def image(name,file,w,h):
 return dict(type='rectangle',name=name,width=w,height=h,fill=dict(type='image',enabled=True,url=ASSET+file,mode='cover'),cornerRadius=8)
def row(name,children,w,h,gap=12,pad=0,fill=None,**kw):return frame(name,w,h,children,'horizontal',gap,pad,fill,**kw)
def label(v):
 if isinstance(v,str):return v
 if isinstance(v,dict):return str(v.get('label') or v.get('name') or v.get('title') or v.get('field') or v.get('text') or next(iter(v.values()),''))
 return str(v)
def action(v):return label(v) if v else ''
def items(s,k):
 v=s.get(k,[])
 return v if isinstance(v,list) else [v] if v else []
NAV=[('今日处理',[('运营工作台','/operations'),('消息管理','/notifications')]),('活动管理',[('活动','/activities'),('活动模板','/templates'),('活动订单','/activity-orders')]),('交易履约',[('商品与订单','/shop'),('商品分类','/shop/categories'),('退款售后','/refunds'),('发货上报','/shipping-reports')]),('用户权益',[('用户管理','/users'),('会员定价','/memberships')]),('内容与平台',[('文章','/articles'),('协议','/legal'),('基础配置','/settings'),('管理员账号','/settings/admin-account')])]
def sidebar(route,h):
 ch=[frame('品牌',172,72,[image('野小子原始标志','platform-brand-original-transparent.png',126,62)],pad=[0,22])]
 matches=[p for _,li in NAV for _,p in li if route==p or route.startswith(p+'/')];current=max(matches,key=len) if matches else ''
 for group,li in NAV:
  ch.append(text(group,172,11,'$hd-a-muted',h=20))
  for title,p in li:
   ch.append(frame('导航 / '+title,172,36,[text(title,148,13,'$hd-a-primary' if p==current else '$hd-a-ink',p==current,22)],layout='horizontal',pad=[0,12],fill='$hd-a-soft' if p==current else '$hd-a-surface',cornerRadius=8,alignItems='center'))
 ch +=[text('管理员 · 退出登录',172,12,'$hd-a-muted',h=24)]
 return frame('A 任务导航',196,h,ch,gap=4,pad=[20,12],fill='$hd-a-surface',stroke='$hd-a-line',strokeWidth={'right':1})
def section(s,w,mobile=False,kind=''):
 title=label(s.get('title') or s.get('name') or '内容')
 ch=[text(title,w-32,16,'$hd-a-ink',True,h=26)]
 cols=items(s,'columns');rows=items(s,'rows');fields=items(s,'fields');entries=items(s,'items')
 if cols and not mobile:
  widths=[int((w-32)/len(cols))]*len(cols)
  ch.append(row('列表表头',[text(label(c),cw-12,12,'$hd-a-muted',True,h=24) for c,cw in zip(cols,widths)],w-32,42,gap=12,pad=8,fill='$hd-a-bg'))
  for idx,r in enumerate(rows[:6]):
   cells=r if isinstance(r,list) else list(r.values()) if isinstance(r,dict) else [r]
   ch.append(row('记录 '+str(idx+1),[text(label(cells[i]) if i<len(cells) else '—',cw-12,13,h=36) for i,cw in enumerate(widths)],w-32,58,gap=12,pad=8,stroke='$hd-a-line',strokeWidth={'bottom':1}))
 elif rows:
  for idx,r in enumerate(rows[:4]):
   cells=r if isinstance(r,list) else list(r.values()) if isinstance(r,dict) else [r]
   ls=[text(label(v),w-56,14 if j==0 else 12,'$hd-a-ink' if j==0 else '$hd-a-muted',j==0) for j,v in enumerate(cells[:6])]
   h=sum(x['height'] for x in ls)+12*(len(ls)-1)+24
   ch.append(frame('记录 '+str(idx+1),w-32,h,ls,gap=8,pad=12,fill='$hd-a-bg',cornerRadius=8))
 if fields:
  ncols=1 if mobile else 2
  fw=(w-32-16*(ncols-1))/ncols
  for start in range(0,len(fields),ncols):
   fs=[]
   for f in fields[start:start+ncols]:
    value=f.get('value','') if isinstance(f,dict) else ''
    fs.append(field(label(f),str(value),fw))
   ch.append(row('输入分组',fs,w-32,78,gap=16))
 for entry in entries:
  if isinstance(entry,dict):
   lab=label(entry); val=entry.get('value') or entry.get('description') or ''
   content=lab+('  '+str(val) if val else '')
  else:content=str(entry)
  ch.append(text(content,w-32,14,h=max(24,math.ceil(len(content)*14/(w-32))*22)))
 for k in ['description','notice']:
  if s.get(k):ch.append(text(s[k],w-32,12,'$hd-a-muted'))
 acts=items(s,'actions')
 if acts:
  if mobile:
   for act in acts[:3]:ch.append(button(action(act),False,w-32))
  else:ch.append(row('区域操作',[button(action(a),False,min(180,max(100,len(action(a))*14+28))) for a in acts[:5]],w-32,44))
 if len(ch)==1:ch.append(text('按当前权限查看与处理',w-32,13,'$hd-a-muted'))
 h=sum(x['height'] for x in ch)+12*(len(ch)-1)+32
 return frame('区域 / '+title,w,h,ch,gap=12,pad=16,fill='$hd-a-surface',cornerRadius=8,stroke='$hd-a-line',strokeWidth=1)
def web_screen(p):
 title=p['title'];route=p['route'];w=1180
 head=row('任务标题',[text(title,820,28,bold=True,h=44),button(action(p.get('primaryAction')) or '刷新',True,200)],w,64,alignItems='center',justifyContent='space_between')
 sections=p.get('sections',[])
 cards=[section(s,w,False,p.get('kind','')) for s in sections]
 bodyh=64+24+sum(c['height'] for c in cards)+16*max(0,len(cards)-1)+64
 h=max(960,bodyh)
 body=frame('任务内容',1244,h,[head]+cards,gap=16,pad=32,fill='$hd-a-bg')
 return frame('A 功能设计 / Web / '+title+' / '+route,1440,h,[sidebar(route,h),body],'horizontal',fill='$hd-a-surface')
def mini_screen(p):
 title=p['title'];w=358
 status=row('系统状态栏',[text('9:41',180,11,h=18),text('···  ◉',150,11,h=18)],390,26,pad=[4,16])
 nav=row('页面导航',[text('‹',30,24,h=34),text(title,250,18,bold=True,h=34),text('···',46,16,h=34)],390,56,pad=[10,16],alignItems='center')
 cards=[section(s,w,True,p.get('kind','')) for s in p.get('sections',[])]
 if not cards:cards=[section({'title':title,'items':[p.get('task','')]},w,True)]
 bodyh=sum(c['height'] for c in cards)+12*max(0,len(cards)-1)+32
 body=frame('页面内容',390,bodyh,cards,gap=12,pad=16,fill='$hd-a-bg')
 primary=action(p.get('primaryAction'))
 footer=frame('主要下一步',390,80,[button(primary,True,358)],pad=[12,16,24,16],fill='$hd-a-surface') if primary else frame('底部安全区',390,24,[],fill='$hd-a-surface')
 h=status['height']+nav['height']+bodyh+footer['height']
 return frame('A 功能设计 / 小程序 / '+title+' / '+p['route'],390,h,[status,nav,body,footer],fill='$hd-a-surface')
if __name__=='__main__':
 print('Functional design kit ready; build commands are prepared only after blueprint validation.')

def overlay(name,file,w,h,title,subtitle=''):
 pic=image(name+'照片',file,w,h);pic.update(x=0,y=0,cornerRadius=0)
 shade=dict(type='rectangle',name=name+'文字底色',x=0,y=h-85,width=w,height=85,fill='#20372CB3')
 cap=text(title,w-32,22,'#FFFFFF',True,34);cap.update(x=16,y=h-73)
 sub=text(subtitle,w-32,12,'#FFFFFF',False,24);sub.update(x=16,y=h-35)
 return frame(name,w,h,[pic,shade,cap,sub],layout='none',clip=True,cornerRadius=8)
def home_screen(p):
 hero=overlay('探索首图','hero-hiking.jpg',390,229,'去山野，找回自己。','野小子 · 野一点，自由一点')
 entry=[]
 for title,img in [('本周活动','category-weekly.jpg'),('国内游行','category-domestic.jpg'),('假期活动','category-holiday.jpg'),('休闲活动','category-leisure.jpg')]:
  pic=image(title+'入口图',img,80.5,77);lab=text(title,76,12,'#FFFFFF',True,22);lab.update(x=3,y=48)
  entry.append(frame(title+'入口',80.5,77,[pic,dict(type='rectangle',name='文字底',x=0,y=44,width=80.5,height=33,fill='#20372C99'),lab],layout='none',cornerRadius=8,clip=True))
 body=[row('四个入口',entry,358,77,gap=12),row('活动区标题',[text('正在发生的山野',270,18,bold=True,h=30),text('全部',76,13,'$hd-a-primary',h=30)],358,30)]
 activities=[('周末山脊徒步','category-weekly.jpg','11月21日 · 本周活动','¥68.00 · 余8位'),('溪谷自然观察','category-leisure.jpg','11月22日 · 休闲活动','免费 · 余10位'),('冬季露营入门','category-holiday.jpg','11月28日 · 假期活动','¥158.00 · 余12位'),('城市绿道轻徒步','category-leisure.jpg','11月29日 · 休闲活动','免费 · 余12位'),('山野日落摄影','category-domestic.jpg','12月5日 · 本周活动','¥98.00 · 已满员'),('亲子森林探索','category-holiday.jpg','12月12日 · 假期活动','¥128.00 · 余16位')]
 for i in range(0,6,2):
  cards=[]
  for title,img,meta,price in activities[i:i+2]:
   cards.append(frame(title,173,205,[image(title+'封面',img,173,110),text(meta,157,11,'$hd-a-muted',h=20),text(title,157,15,bold=True,h=25),text(price,157,12,'$hd-a-primary',h=24)],gap=6,fill='$hd-a-surface',cornerRadius=8))
  body.append(row('活动双列 '+str(i//2+1),cards,358,205))
 body.append(overlay('装备通栏入口','equipment-banner.jpg',358,130,'山野好物','去逛逛'))
 for i in range(2):
  cards=[]
  for title,price in ([('轻量户外背包','¥198.00'),('便携登山杖','¥89.00')] if i==0 else [('户外便携水壶','¥69.00'),('露营收纳包','¥59.00')]):
   cards.append(frame(title,173,213,[image(title+'商品图','equipment.jpg',173,149),text(title,173,14,bold=True,h=25),text(price,173,15,'$hd-a-primary',True,25)],gap=6))
  body.append(row('装备双列 '+str(i+1),cards,358,213))
 body += [text('山野之间',358,18,bold=True,h=30),overlay('图文轮播','category-domestic.jpg',358,172,'出发前的准备','轻装上路，安心走进自然。'),frame('平台原始标识',358,90,[image('原始标识','platform-brand-original-transparent.png',140,80)],pad=[5,109])]
 bh=sum(n['height'] for n in body)+12*(len(body)-1)+28
 content=frame('首页真实内容顺序',390,bh,body,gap=12,pad=[12,16,16,16],fill='$hd-a-bg')
 tabs=row('文字TabBar',[text(t,81.5,13,'$hd-a-primary' if i==0 else '$hd-a-muted',i==0,24) for i,t in enumerate(['探索','活动','商城','我的'])],390,64,gap=16,pad=[16,8,24,8],fill='$hd-a-surface')
 return frame('A 功能设计 / 小程序 / 探索 / pages/home/index',390,229+bh+64,[hero,content,tabs],fill='$hd-a-bg')

def normalize_page(p,mobile=False):
 p=json.loads(json.dumps(p))
 for s in p.get('sections',[]):
  if s.get('sampleRows'):s['rows']=s['sampleRows']
  if s.get('displayItems'):s['items']=s['displayItems']
  if s.get('displayNotice'):s['notice']=s['displayNotice']
  s['actions']=s.get('actions',[])+s.get('secondaryActions',[])
  if s.get('primaryAction'):s['actions'].insert(0,s['primaryAction'])
  fs=s.get('fields',[])
  if not mobile and p.get('kind') in ['table','workbench']:
   summary=[];editable=[]
   for f in fs:
    lab=label(f);v=f.get('value','') if isinstance(f,dict) else ''
    if any(k in lab for k in ['搜索','筛选','分类','发布状态','days']):
     if lab=='days':f=dict(f,label='统计范围')
     if v=='按当前对象显示':f=dict(f,value='全部' if '状态' in lab else '')
     editable.append(f)
    elif p.get('kind')=='workbench' and v and v!='按当前对象显示':summary.append(dict(label=lab,value=v))
   s['fields']=editable;s['items']=s.get('items',[])+summary
  if p.get('kind')=='table' and s.get('title')=='对象定位与字段对比':
   s['actions']=[a for a in s['actions'] if action(a) in ['筛选','重置']]
 return p
_original_web=web_screen
_original_mini=mini_screen
def web_screen(p):
 p=normalize_page(p)
 if p.get('kind')=='login':
  f=[field('账号','admin-demo',368),field('密码','••••••••',368),button('登录',True,368)]
  card=frame('登录',432,360,[text('管理员登录',368,26,bold=True,h=44)]+f,gap=16,pad=32,fill='$hd-a-surface',cornerRadius=12,stroke='$hd-a-line',strokeWidth=1);card.update(x=504,y=280)
  logo=image('野小子品牌','platform-brand-original-transparent.png',140,76);logo['fill']['mode']='contain';logo.update(x=650,y=160)
  return frame('A 功能设计 / Web / 管理员登录 / /login',1440,960,[logo,card],layout='none',fill='$hd-a-bg')
 return _original_web(p)
def mini_screen(p):
 if p.get('kind')=='home':return home_screen(p)
 p=normalize_page(p,True)
 if p.get('kind')=='list':p['primaryAction']=''
 screen=_original_mini(p)
 if p['route'] in ['pages/activities/index','pages/shop/index','pages/mine/index']:
  tabnames=['探索','活动','商城','我的'];selected={'pages/activities/index':1,'pages/shop/index':2,'pages/mine/index':3}[p['route']]
  tabs=row('文字TabBar',[text(t,81.5,13,'$hd-a-primary' if i==selected else '$hd-a-muted',i==selected,24) for i,t in enumerate(tabnames)],390,64,gap=16,pad=[16,8,24,8],fill='$hd-a-surface')
  screen['height']-=screen['children'][-1]['height'];screen['children'][-1]=tabs;screen['height']+=64
 return screen

def make_request(pages,path,description):
 payload=[{'key':p['key'],'node':p['node']} for p in pages]
 js='const pages='+json.dumps(payload,ensure_ascii=False,separators=(',',':'))+';function add(parent,n){const {children,metadata,...props}=n;const id=Insert(parent,props);for(const c of children||[])add(id,c);return id;}if(typeof functionalDesignIds==="undefined")functionalDesignIds=[];const made=[];for(const p of pages){const pos=FindEmptySpace({width:p.node.width,height:p.node.height,direction:"right",padding:160});const id=add(document,{...p.node,x:pos.x,y:pos.y});functionalDesignIds.push({key:p.key,id});made.push({key:p.key,id});}Print(made);TakeScreenshot(made.slice(0,2).map(p=>p.id));'
 Path(path).write_text(json.dumps({'name':'execute','arguments':{'filePath':'D:/AiProject/Wildboy/design/设计图文件.pen','description':description,'input':js}},ensure_ascii=False),encoding='utf-8')
