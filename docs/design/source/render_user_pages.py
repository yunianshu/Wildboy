# Archived design renderer; see README.md for scope and reproduction notes.
from PIL import Image, ImageDraw, ImageFont, ImageOps
from pathlib import Path
import os
REPO = Path(__file__).resolve().parents[3]
ASSETS = REPO / 'miniprogram' / 'src' / 'assets'
OUTPUT = Path(os.environ.get('WILDBOY_DESIGN_OUTPUT', str(Path(__file__).resolve().parent / 'generated')))
OUTPUT.mkdir(parents=True, exist_ok=True)
FONT_DIR = Path(os.environ.get('WILDBOY_FONT_DIR', '/usr/share/fonts/opentype/noto'))
REG = os.environ.get('WILDBOY_FONT_REGULAR', str(FONT_DIR / 'NotoSansCJK-Regular.ttc'))
BOLD = os.environ.get('WILDBOY_FONT_BOLD', str(FONT_DIR / 'NotoSansCJK-Bold.ttc'))
FONT_INDEX = int(os.environ.get('WILDBOY_FONT_INDEX', '2'))
ROOT=OUTPUT
S=3
GREEN='#193f34'; MUTED='#858d80'; PAPER='#f7f5ed'; BG='#e8eddf'; LIGHT='#e7eddf'; WHITE='#fffef9'; LINE='#d8dece'
def font(n,b=False):return ImageFont.truetype(BOLD if b else REG,int(n*S),index=FONT_INDEX)
def txt(im,x,y,text,size=14,b=False,c=GREEN):
 ImageDraw.Draw(im).text((x*S,y*S),text,font=font(size,b),fill=c,spacing=6*S)
def rect(im,box,fill=WHITE,r=0,outline=None):
 ImageDraw.Draw(im).rounded_rectangle(tuple(int(x*S) for x in box),radius=int(r*S),fill=fill,outline=outline,width=S)
def line(im,x,y,w):ImageDraw.Draw(im).line((x*S,y*S,(x+w)*S,y*S),fill=LINE,width=S)
def photo(im,name,box):
 x,y,w,h=box;p=Image.open(ASSETS/name).convert('RGB');p=ImageOps.fit(p,(int(w*S),int(h*S)));im.paste(p,(int(x*S),int(y*S)))
def pill(im,x,y,w,t,active=False):
 rect(im,(x,y,x+w,y+26),GREEN if active else LIGHT,13);txt(im,x+12,y+4,t,11,active,WHITE if active else GREEN)
def button(im,x,y,w,t,secondary=False):
 rect(im,(x,y,x+w,y+45),LIGHT if secondary else GREEN,7);d=ImageDraw.Draw(im);tw=d.textlength(t,font=font(14,True));txt(im,x+(w*S-tw)/S/2,y+12,t,14,True,GREEN if secondary else WHITE)
def screen(title,back=False,h=920):
 im=Image.new('RGB',(390*S,h*S),PAPER)
 txt(im,20,12,'9:41',12,True);[rect(im,(308+i*7,23-i*3,313+i*7,26),GREEN) for i in range(3)];rect(im,(346,16,366,24),None,2,GREEN);rect(im,(349,18,362,22),GREEN,0)
 if back:txt(im,20,49,'‹',24)
 if title:txt(im,155 if len(title)<5 else 132,53,title,14,True)
 rect(im,(298,48,374,78),PAPER,16,LINE);txt(im,312,52,'•••',13,True);line(im,338,54,1);ImageDraw.Draw(im).ellipse((351*S,57*S,363*S,69*S),outline=GREEN,width=2*S)
 return im
def nav(im,selected,h=920):
 rect(im,(0,h-66,390,h),WHITE);line(im,0,h-66,390)
 for i,t in enumerate(['发现','活动','我的']):
  x=64+i*130;c=GREEN if i==selected else MUTED
  ImageDraw.Draw(im).ellipse(((x-6)*S,(h-53)*S,(x+6)*S,(h-41)*S),outline=c,width=S)
  txt(im,x-12,h-36,t,11,i==selected,c)
 rect(im,(145,h-9,245,h-6),GREEN,2)
def title(im,small,big,sub=None,y=109):
 txt(im,22,y,small,9,False,MUTED);txt(im,22,y+21,big,23,True)
 if sub:txt(im,22,y+59,sub,12,False,MUTED)
def activity_card(im,x,y,img,cat,name,location,date,seats):
 photo(im,img,(x,y,166,152));txt(im,x,y+161,cat,10,False,MUTED);txt(im,x,y+181,name,13,True);txt(im,x,y+204,location,11,False,MUTED);txt(im,x,y+225,date,11,False,MUTED);txt(im,x,y+251,'免费参与',12,True);txt(im,x+99,y+252,seats,10,False,MUTED)
def activities():
 im=screen('活动');title(im,'A LITTLE FURTHER. A LITTLE FREER.','总有一程，属于你。','选一种节奏，把自己交给山野。')
 pill(im,22,205,81,'全部活动',True);pill(im,110,205,81,'本周活动');pill(im,198,205,81,'国内游行');pill(im,286,205,81,'假期活动')
 activity_card(im,22,253,'category-weekly.jpg','本周活动','山脊日出 · 周末轻徒步','示例山野线路','11/07 周六','8 个余位')
 activity_card(im,202,253,'category-holiday.jpg','假期活动','湖畔露营 · 秋日慢生活','示例湖畔营地','11/14 周六','12 个余位')
 activity_card(im,22,550,'category-domestic.jpg','国内游行','山水之间 · 轻装漫游','示例山水路线','11/21 周六','6 个余位')
 activity_card(im,202,550,'category-leisure.jpg','休闲活动','海岸野餐 · 松弛一日','示例海岸草地','11/22 周日','15 个余位')
 nav(im,1);return im
def row(im,y,t,sub=None):
 rect(im,(22,y,368,y+72),WHITE,9);txt(im,38,y+15,t,15,True);txt(im,345,y+20,'›',21)
 if sub:txt(im,38,y+42,sub,10,False,MUTED)
def mine():
 im=screen('我的');title(im,'YOUR NEXT CHAPTER OUTSIDE','我的山野',y=105)
 rect(im,(22,184,368,350),GREEN,11)
 ImageDraw.Draw(im).ellipse((40*S,207*S,95*S,262*S),fill=LIGHT);txt(im,55,214,'W',26,True)
 txt(im,111,210,'山野同行者',20,True,WHITE);pill(im,111,249,84,'微信用户')
 txt(im,40,302,'把每一次出发，收进自己的故事。',12,False,'#c8d5c2')
 txt(im,22,386,'我的活动',17,True);row(im,424,'我的报名','查看已报名、已取消的活动');row(im,508,'发现下一次出发','本周活动、山水旅行与休闲时光')
 txt(im,38,630,'隐私说明',13);txt(im,345,625,'›',21);line(im,22,669,346)
 txt(im,38,690,'退出当前账号',13);txt(im,345,685,'›',21);line(im,22,729,346)
 txt(im,22,758,'管理员身份验证 ↗',12,False,MUTED)
 txt(im,22,796,'管理权由服务器确认；普通用户不可访问',10,False,MUTED);txt(im,22,815,'活动管理或报名名单。',10,False,MUTED)
 nav(im,2);return im
def enroll_card(im,y,state,name,date,active):
 rect(im,(22,y,368,y+176),WHITE,10);pill(im,38,y+16,86,state,active);txt(im,38,y+55,name,16,True);txt(im,38,y+89,'报名时间 '+date,11,False,MUTED);line(im,38,y+120,314);txt(im,38,y+137,'查看安排与报名状态',11);txt(im,339,y+131,'↗',19)
def registrations():
 im=screen('我的报名',True);title(im,'YOUR NEXT OUTDOOR CHAPTER','每一程，都留有回忆。','只显示当前账号的报名记录。')
 pill(im,22,208,72,'全部',True);pill(im,103,208,83,'已报名');pill(im,195,208,83,'已取消')
 enroll_card(im,260,'报名成功','山脊日出 · 周末轻徒步','10/26 15:20',True)
 enroll_card(im,451,'报名成功','湖畔露营 · 秋日慢生活','10/25 19:35',True)
 enroll_card(im,642,'已取消','海岸野餐 · 松弛一日','10/20 08:16',False)
 txt(im,143,858,'已显示全部报名',11,False,MUTED);return im
def success():
 im=screen('报名结果',True)
 ImageDraw.Draw(im).ellipse((159*S,112*S,231*S,184*S),fill=LIGHT)
 d=ImageDraw.Draw(im);d.line([(180*S,148*S),(191*S,159*S),(214*S,135*S)],fill=GREEN,width=4*S)
 txt(im,151,205,'山野见！',25,True);txt(im,89,247,'名额已确认，下一站山野见。',12,False,MUTED)
 rect(im,(22,295,368,580),WHITE,11);photo(im,'category-weekly.jpg',(38,311,314,126));txt(im,38,454,'山脊日出 · 周末轻徒步',17,True);txt(im,38,490,'11/07 周六 06:30—12:00',12);txt(im,38,518,'示例集合点 · 地铁站 A 出口',12,False,MUTED);txt(im,38,546,'已锁定 1 个名额  ·  免费无需支付',12,True)
 rect(im,(22,608,368,709),LIGHT,10);txt(im,38,625,'出发前，再确认一下',13,True);txt(im,38,654,'查看活动安排与集合地点。若计划有变，',11,False,MUTED);txt(im,38,674,'请在报名截止前到活动详情取消报名。',11,False,MUTED)
 button(im,22,751,346,'查看活动安排');button(im,22,810,346,'我的报名',True);txt(im,147,875,'继续发现活动 ↗',11);return im
def board(name,headline,sub,left,lefttitle,right,righttitle):
 im=Image.new('RGB',(864*S,1080*S),BG);txt(im,24,19,headline,25,True);txt(im,24,60,sub,12,False,MUTED);txt(im,24,91,lefttitle,12,True);txt(im,450,91,righttitle,12,True);im.paste(left,(24*S,120*S));im.paste(right,(450*S,120*S));txt(im,24,1054,'设计预览 · 示例数据 · 非微信真机截图',11,False,MUTED);im.save(ROOT/name)
board('01-list-and-my.png','继续发现，也管理自己的出发','新增用户页面 · 延续已确认的户外风格',activities(),'01 / 活动列表',mine(),'02 / 我的 · 普通用户')
board('02-enrollments-and-success.png','从报名记录，到确认出发','成功页面仅用于接口确认成功后的状态；图中为演示数据',registrations(),'03 / 我的报名',success(),'04 / 报名成功 · 示例状态')
print('rendered')
