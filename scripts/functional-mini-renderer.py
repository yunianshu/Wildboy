"""Build editable 390px mini-program Pencil trees from functional sample blueprints.
No .pen access, network, or production edits. Pass the functional-design module as kit.
"""
from pathlib import PurePosixPath
import math

W = 358
LABELS = {'date':'出发','location':'地点','price':'现价','originalPrice':'原价','stock':'库存','availability':'名额','status':'状态','registration':'报名','participants':'参与人','total':'实付','createdAt':'下单时间','expiresAt':'保留至','quantity':'数量','orderNumber':'订单号','id':'用户编号','source':'来源','role':'角色','profile':'资料','phone':'手机号','address':'地址','recipient':'收货人','time':'时间','publishedAt':'发布时间','version':'版本','name':'姓名'}
PRIMARY_KEYS = ('title','label','name','recipient','text')
META_KEYS = ('date','location','quantity','registration','participants','availability','stock','price','originalPrice','total','status','orderNumber','expiresAt','createdAt','phone','address','id','source','role','profile','time','version','publishedAt')

def build(p, kit):
    if p.get('kind') == 'home':
        return home_screen(p, kit)
    f, t, row, image = kit.frame, kit.text, kit.row, kit.image
    def text(s, width, size=14, color='$hd-a-ink', bold=False):
        # Count full-width CJK and Latin separately; reserve one additional line only
        # when needed. Height is explicit so label/value rows never overlap.
        s=str(s)
        units=sum(1 if ord(c)>255 else .55 for c in s)
        lines=max(1,sum(max(1,math.ceil(sum(1 if ord(c)>255 else .55 for c in line)*size/width)) for line in s.split('\n')))
        return t(s,width,size,color,bold,h=math.ceil(size*1.5)*lines)
    def stack(name,width,children,gap=8,pad=0,fill=None,**kw):
        if isinstance(pad,list): top,bottom=(pad[0],pad[2]) if len(pad)==4 else (pad[0],pad[0])
        else:top=bottom=pad
        height=sum(c['height'] for c in children)+gap*max(0,len(children)-1)+top+bottom
        return f(name,width,height,children,gap=gap,pad=pad,fill=fill,**kw)
    def btn(label,primary=False,width=326):
        label=str(label)
        line=text(label,width-24,14,'#FFFFFF' if primary else '$hd-a-primary',True)
        return f('操作 / '+label,width,max(44,line['height']+20),[line],layout='horizontal',pad=[10,12],fill='$hd-a-primary' if primary else '$hd-a-soft',cornerRadius=8,alignItems='center',justifyContent='center')
    def picture(filename,width,height):
        node=image('内容图片 / '+PurePosixPath(filename).name,PurePosixPath(filename).name,width,height)
        return node
    def chip(label,width=None,active=False):
        width=width or min(326,max(58,len(str(label))*14+24))
        return f('选项 / '+str(label),width,38,[text(label,width-20,13,'$hd-a-primary' if active else '$hd-a-muted',active)],layout='horizontal',pad=[8,10],fill='$hd-a-soft' if active else '$hd-a-bg',cornerRadius=8,alignItems='center')
    def choice_rows(entries,width):
        result=[];current=[];used=0
        for i,e in enumerate(entries):
            label=e.get('label','') if isinstance(e,dict) else str(e)
            if isinstance(e,dict) and 'checked' in e:
                line=text(('☑ ' if e['checked'] else '□ ')+label,width-24,13)
                result.append(f('协议主动同意',width,line['height']+24,[line],pad=12,fill='$hd-a-bg',cornerRadius=8));continue
            c=chip(label,min(width,max(58,len(label)*13+24)),i==0)
            if current and used+8+c['width']>width:
                result.append(row('可选项',current,width,38,gap=8));current=[];used=0
            current.append(c);used+=c['width']+(8 if len(current)>1 else 0)
        if current: result.append(row('可选项',current,width,38,gap=8))
        return result
    def record(item,width):
        if not isinstance(item,dict):return text(item,width)
        if item.get('type')=='表格' and item.get('rows'):
            table=[]
            for i,cells in enumerate(item['rows']):
                cw=(width-16)/len(cells)
                labels=[text(c,cw,12,bold=i==0) for c in cells]
                table.append(row('表格行 '+str(i+1),labels,width,max(c['height'] for c in labels)+16,gap=8,pad=[8,0],fill='$hd-a-bg' if i==0 else '$hd-a-surface'))
            return stack('图文表格',width,table,gap=0)
        title=next((item[k] for k in PRIMARY_KEYS if item.get(k)),None)
        parts=[]
        if title:parts.append(text(title,width if not item.get('image') else width-94,15,bold=True))
        tw=width-94 if item.get('image') else width
        if item.get('description'):parts.append(text(item['description'],tw,13,'$hd-a-muted'))
        if item.get('caption'):parts.append(text(item['caption'],tw,12,'$hd-a-muted'))
        for key in META_KEYS:
            if key not in item or item[key]==title:continue
            value=str(item[key])
            prefix=LABELS.get(key,'')
            content=(prefix+'  '+value) if key in ('phone','address','orderNumber','expiresAt','id','source','role','profile','originalPrice','createdAt','publishedAt') else value
            parts.append(text(content,tw,12,'$hd-a-primary' if key in ('price','total','status') else '$hd-a-muted',key in ('price','total')))
        if not parts:parts=[text('内容',tw,13)]
        detail=stack('记录信息',tw,parts,gap=4)
        if item.get('image'):
            return row('图文记录', [picture(item['image'],82,82),detail],width,max(82,detail['height']),gap=12,alignItems='start')
        return detail
    def section(s):
        kind=s.get('kind','notice');inner=W-32
        ch=[text(s.get('title',''),inner,16,bold=True)]
        entries=s.get('sampleItems',s.get('displayItems',[]))
        if kind=='form':
            for field in s.get('fields',[]):
                label,value=field.get('label',''),field.get('value','')
                control=field.get('control','text')
                if control=='readonly':
                    label_node=text(label,96,12,'$hd-a-muted');value_node=text(value,inner-108,14)
                    ch.append(row('只读 / '+label,[label_node,value_node],inner,max(label_node['height'],value_node['height']),gap=12))
                    continue
                if control in ('select','datetime'):value=str(value)+'  ›'
                elif control=='switch':value=('● 开启' if str(value) in ('开启','开','是') else '○ 关闭')
                elif control=='checkbox':value='□ '+str(value)
                elif control=='stepper':value='−     '+str(value)+'     ＋'
                cap=text(label,inner,12,'$hd-a-muted')
                if control=='switch':
                    enabled='开启' in str(value)
                    knob=f('开关圆点',22,22,fill='#FFFFFF',cornerRadius=11);knob.update(x=24 if enabled else 2,y=2)
                    toggle=f('开启' if enabled else '关闭',48,26,[knob],layout='none',fill='$hd-a-primary' if enabled else '$hd-a-line',cornerRadius=13)
                    ch.append(row('开关 / '+label,[text(label,inner-60,14),toggle],inner,44,gap=12,alignItems='center'))
                    continue
                val=text(value,inner-24,14)
                input_node=f(control+' / '+label,inner,max(90 if control=='textarea' else 46,val['height']+24),[val],pad=12,fill='$hd-a-soft' if control=='switch' else '$hd-a-surface',cornerRadius=8,stroke='$hd-a-line' if control in ('switch','checkbox') else '$hd-a-field',strokeWidth=1)
                ch.append(stack('字段 / '+label,inner,[cap,input_node],gap=6))
        elif kind=='summary':
            for field in s.get('fields',[]):
                label=text(field.get('label',''),96,12,'$hd-a-muted')
                value=text(field.get('value',''),inner-108,14,bold=field.get('label') in ('应付金额','应付','实付'))
                ch.append(row('摘要 / '+field.get('label',''),[label,value],inner,max(label['height'],value['height']),gap=12))
        elif kind=='choice':
            image_entries=[e for e in entries if isinstance(e,dict) and e.get('image')]
            for e in image_entries:
                ch += [picture(e['image'],inner,150),text(e.get('label','当前图片'),inner,12,'$hd-a-muted')]
            action_labels=set([s.get('primaryAction','')]+s.get('secondaryActions',[]))
            ch += choice_rows([e for e in entries if e not in image_entries and (e.get('label','') if isinstance(e,dict) else str(e)) not in action_labels],inner)
        elif kind=='image':
            for e in entries:
                if not isinstance(e,dict):continue
                if e.get('image'):ch.append(picture(e['image'],inner,190))
                for key in ('brand','title','price','originalPrice','stock','summary','caption'):
                    if e.get(key) and not (key=='title' and e[key]==s.get('title')):ch.append(text(e[key],inner,18 if key in ('brand','title') else 14,'$hd-a-primary' if key=='price' else '$hd-a-muted' if key in ('summary','caption','originalPrice','stock') else '$hd-a-ink',key in ('brand','title','price')))
        elif kind=='list':
            for i,e in enumerate(entries):
                item_children=[record(e,inner)]
                item_actions=e.get('actions', [s.get('primaryAction','')]+s.get('secondaryActions',[])) if isinstance(e,dict) else [s.get('primaryAction','')]+s.get('secondaryActions',[])
                item_actions=[a for a in item_actions if a]
                if item_actions:item_children.append(text('  ·  '.join(item_actions),inner,13,'$hd-a-primary'))
                item_card=stack('记录及专属操作 / '+str(i+1),inner,item_children,gap=10)
                item_card['metadata']={'target':e.get('orderNumber',e.get('id',e.get('title',e.get('name',str(i+1))))) if isinstance(e,dict) else str(e)}
                ch.append(item_card)
                if i<len(entries)-1:ch.append(f('记录分隔线',inner,1,fill='$hd-a-line'))
        if s.get('displayNotice'):ch.append(text(s['displayNotice'],inner,12,'$hd-a-muted'))
        actions=[]
        if kind!='list' and s.get('primaryAction'):actions.append((s['primaryAction'],True))
        if kind!='list':actions += [(a,False) for a in s.get('secondaryActions',[]) if a!=s.get('primaryAction')]
        # Each action stays readable at mobile width. More than two secondary actions
        # become a short text-action list rather than a wall of identical filled buttons.
        for i,(label,primary) in enumerate(actions):
            if primary or i<2:ch.append(btn(label,primary,inner))
            else:ch.append(text('› '+label,inner,13,'$hd-a-primary'))
        return stack('任务区 / '+s.get('title',''),W,ch,gap=12,pad=16,fill='$hd-a-surface',cornerRadius=8,stroke='$hd-a-line',strokeWidth=1)
    route=p.get('route','');title=p['title']
    tabs={'pages/activities/index':'活动','pages/shop/index':'商城','pages/mine/index':'我的'}
    status=row('系统状态栏',[text('9:41',250,11),text('●  ▰',96,11)],390,28,gap=12,pad=[5,16],fill='$hd-a-surface')
    nav=row('原生导航栏',[(text('‹',24,24) if route not in tabs else f('导航对齐留位',24,36)),text(title,276,18,bold=True),text('•••',34,10)],390,56,gap=12,pad=[10,16],fill='$hd-a-surface',alignItems='center')
    cards=[section(s) for s in p.get('sections',[]) if not s.get('hiddenByDefault')]
    body=stack('页面任务内容',390,cards,gap=12,pad=16,fill='$hd-a-bg')
    tail=f('底部安全区',390,24,fill='$hd-a-bg')
    if route in tabs:
        labels=[text(n,81.5,14,'$hd-a-primary' if n==tabs[route] else '$hd-a-muted',n==tabs[route]) for n in ['探索','活动','商城','我的']]
        tail=row('文字TabBar',labels,390,64,gap=8,pad=[18,20],fill='$hd-a-surface')
    screen=stack('A 功能重设计 / 小程序 / '+title+' / '+route,390,[status,nav,body,tail],gap=0,fill='$hd-a-bg')
    screen['metadata']={'type':'functional-mini-design','route':route,'kind':p.get('kind'),'sampleData':True,'source':'functional-mini-blueprints.json','note':'虚构设计演示；界面动作受业务状态约束；长画板为完整滚动内容'}
    return screen



def home_screen(p, kit):
    """Preserve the existing native homepage geometry, not the former design template."""
    f,t,row,image=kit.frame,kit.text,kit.row,kit.image
    def tx(value,w,size=14,color='$hd-a-ink',bold=False,h=None):
        return t(value,w,size,color,bold,h=h or math.ceil(size*1.5))
    def stack(name,w,cs,gap=0,pad=0,fill=None):
        v=pad*2 if isinstance(pad,(int,float)) else pad[0]+(pad[2] if len(pad)==4 else pad[0])
        return f(name,w,sum(c['height'] for c in cs)+gap*max(0,len(cs)-1)+v,cs,gap=gap,pad=pad,fill=fill)
    def pic(name,file,w,h):return image(name,PurePosixPath(file).name,w,h)
    def at(n,x,y):n.update(x=x,y=y);return n
    def shade(w,h):return dict(type='rectangle',name='图片文字衬底',x=0,y=0,width=w,height=h,fill='#20372C55')
    secs=p['sections'];get=lambda title:next(s for s in secs if s['title']==title)
    heroimg=get('去山野，找回自己。')['sampleItems'][0]
    hero=f('首页大图 / 源码440rpx',390,229,[at(pic('登山者主图',heroimg['image'],390,229),0,0),shade(390,229),at(tx('野小子',220,24,'#FFFFFF',True,36),16,44),at(tx('野一点，自由一点',220,10,'#FFFFFF',False,16),16,80),at(tx('WILDBOY / OUTDOOR CLUB',358,9,'#FFFFFF',False,14),16,140),at(tx('去山野，找回自己。',358,24,'#FFFFFF',True,36),16,159),at(tx('把日常留在身后 · 一起走出去',358,12,'#FFFFFF',False,18),16,200)],layout='none',fill='$hd-a-ink',clip=True)
    cats=[]
    for e in get('四个入口')['sampleItems']:
        cats.append(f('入口 / '+e['label'],80.5,77,[at(pic('入口图片',e['image'],80.5,77),0,0),shade(80.5,77),at(tx(e['label'],76,12,'#FFFFFF',True,20),3,49)],layout='none',cornerRadius=12,clip=True))
    before=[row('四个入口',cats,358,77,gap=12),row('活动标题',[tx('正在发生的山野',290,20,bold=True,h=30),tx('全部',56,12,'$hd-a-primary',h=30)],358,30,gap=12)]
    acts=get('正在发生的山野')['sampleItems']
    for start in range(0,len(acts),2):
        cards=[]
        for e in acts[start:start+2]:
            cs=[pic(e['title']+'封面',e['image'],173,110),tx(e['date'],173,10,'$hd-a-muted',h=16),tx(e['title'],173,15,bold=True,h=24),tx(e['location'],173,12,'$hd-a-muted',h=18),row('价格与名额',[tx(e['price'],80,12,'$hd-a-primary',True,20),tx(e['availability'],81,12,'$hd-a-muted',h=20)],173,20,gap=12)]
            cards.append(stack('活动 / '+e['title'],173,cs,gap=6))
        before.append(row('两列活动 '+str(start//2+1),cards,358,max(c['height'] for c in cards),gap=12))
    activities=stack('首页入口与活动',390,before,gap=24,pad=[24,16,24,16],fill='$hd-a-bg')
    banner=f('装备通栏 / 源码250rpx',390,130,[at(pic('装备横幅','equipment-banner.jpg',390,130),0,0),at(tx('山野好物 · 轻装出发',358,12,'$hd-a-muted',h=18),16,8),at(tx('把山野，装进行囊',358,19,'$hd-a-primary',True,29),16,30),at(f('去逛逛',116,48,[tx('去逛逛  ›',84,15,'#FFFFFF',True,24)],layout='horizontal',pad=[12,16],fill='$hd-a-primary',cornerRadius=12,alignItems='center'),16,66)],layout='none',clip=True)
    after=[];products=get('把山野，装进行囊')['sampleItems']
    for start in range(0,len(products),2):
        cards=[]
        for e in products[start:start+2]:
            cs=[pic(e['title']+'示例图',e['image'],173,149),tx(e['title'],173,14,bold=True,h=24),tx('原价 '+e['originalPrice'],173,12,'$hd-a-muted',h=18),tx(e['price'],173,15,'$hd-a-primary',True,23)]
            cards.append(stack('商品 / '+e['title'],173,cs,gap=6))
        after.append(row('两列装备 '+str(start//2+1),cards,358,max(c['height'] for c in cards),gap=12))
    after.append(tx('山野之间',358,20,bold=True,h=30))
    e=get('山野之间')['sampleItems'][0]
    after.append(f('文章轮播 / 源码330rpx',358,172,[at(pic('文章封面',e['image'],358,172),0,0),shade(358,172),at(tx(e['title'],326,19,'#FFFFFF',True,28),16,104),at(tx(e['summary'],326,11,'#FFFFFF',False,18),16,134),at(tx('●  ·  ·',60,10,'#FFFFFF',False,15),155,154)],layout='none',cornerRadius=12,clip=True))
    logo=pic('原始透明平台标识','platform-brand-original-transparent.png',216,70);logo['fill']['mode']='contain'
    after.append(f('平台标识',358,90,[logo],pad=[8,71,12,71]))
    remaining=stack('首页装备与文章',390,after,gap=24,pad=[24,16,16,16],fill='$hd-a-bg')
    tabs=row('原生文字TabBar',[tx(n,81.5,14,'$hd-a-primary' if i==0 else '$hd-a-muted',i==0,22) for i,n in enumerate(['探索','活动','商城','我的'])],390,64,gap=8,pad=[18,20],fill='$hd-a-bg')
    screen=stack('A 功能重设计 / 小程序 / 探索 / pages/home/index',390,[hero,activities,banner,remaining,tabs],fill='$hd-a-bg')
    screen['metadata']={'route':'pages/home/index','sampleData':True,'source':'Current home WXML/WXSS + functional-mini-blueprints.json','note':'品牌位于顶部安全区，通栏装备横幅390px，最多6活动4商品，文字TabBar；长画板展示完整滚动内容'}
    return screen


def selftest():
    import importlib.util
    import json
    from pathlib import Path
    root=Path(__file__).resolve().parents[1]
    spec=importlib.util.spec_from_file_location('functional_kit',root/'scripts/functional-design.py')
    kit=importlib.util.module_from_spec(spec);spec.loader.exec_module(kit)
    pages=json.loads((root/'docs/ui-refactor/dawn-a/functional-mini-blueprints.json').read_text(encoding='utf8'))['pages']
    nodes=0
    def check(n):
        nonlocal nodes
        nodes+=1
        assert n.get('name') and n.get('type'),n
        assert isinstance(n.get('width'),(int,float)) and n['width']>0,n['name']
        assert isinstance(n.get('height'),(int,float)) and n['height']>0,n['name']
        if n['type']=='text':assert n.get('content','').strip(),n['name']
        p=n.get('padding',0)
        p=[p]*4 if isinstance(p,(int,float)) else p*2 if len(p)==2 else p
        a,b,c,d=p;cs=n.get('children',[]);gap=n.get('gap',0)
        if cs and n.get('layout')=='horizontal':
            assert sum(x['width'] for x in cs)+gap*(len(cs)-1)+b+d<=n['width']+.01,(n['name'],'width')
            assert max(x['height'] for x in cs)+a+c<=n['height']+.01,(n['name'],'height')
        if cs and n.get('layout')=='vertical':
            assert sum(x['height'] for x in cs)+gap*(len(cs)-1)+a+c<=n['height']+.01,(n['name'],'height')
            assert max(x['width'] for x in cs)+b+d<=n['width']+.01,(n['name'],'width')
        for child in cs:check(child)
    results=[]
    for p in pages:
        tree=build(p,kit);assert tree['width']==390
        check(tree);results.append({'route':p['route'],'width':390,'height':tree['height']})
    assert len(results)==31
    print(json.dumps({'passed':True,'pages':len(results),'editableNodes':nodes,'geometryIssues':0,'results':results},ensure_ascii=False))

if __name__=='__main__':
    selftest()
