# Archived design renderer; see README.md for scope and reproduction notes.
from PIL import Image,ImageDraw,ImageFont,ImageOps
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
P=OUTPUT;S=3
G='#193f34';M='#828b7d';BG='#e8eddf';PAPER='#f7f5ed';W='#fffef9'
def f(n,b=False):return ImageFont.truetype(BOLD if b else REG,int(n*S),index=FONT_INDEX)
def t(im,x,y,s,n=14,b=False,c=G):ImageDraw.Draw(im).text((int(x*S),int(y*S)),s,font=f(n,b),fill=c)
def r(im,box,c,radius=0,outline=None):ImageDraw.Draw(im).rounded_rectangle(tuple(int(v*S) for v in box),radius=int(radius*S),fill=c,outline=outline,width=S)
im=Image.new('RGB',(460*S,1100*S),BG)
t(im,26,20,'Wildboy · 微信登录',25,True);t(im,26,60,'独立登录页设计 · 等你走进山野',12,False,M)
x=35;y=100;phone=Image.new('RGB',(390*S,900*S),PAPER)
photo=ImageOps.fit(Image.open(ASSETS / 'hero-hiking.jpg').convert('RGB'),(390*S,425*S))
photo=photo.convert('RGBA'); overlay=Image.new('RGBA',photo.size,(0,0,0,0)); od=ImageDraw.Draw(overlay)
for yy in range(photo.height):
 a=int(30+75*(yy/photo.height));od.line((0,yy,photo.width,yy),fill=(13,36,26,a))
photo=Image.alpha_composite(photo,overlay).convert('RGB');phone.paste(photo,(0,0))
t(phone,20,12,'9:41',12,True,W)
t(phone,20,49,'‹',27,False,W)
r(phone,(298,48,374,78),'#234b3e',16);t(phone,311,51,'•••',13,True,W)
ImageDraw.Draw(phone).ellipse((351*S,57*S,363*S,69*S),outline=W,width=2*S)
t(phone,27,117,'wildboy.',38,True,W);t(phone,28,172,'野一点，自由一点',13,False,'#e8eddf')
t(phone,28,325,'把日常留在身后',24,True,W);t(phone,28,363,'下一程，和同频的人一起出发。',12,False,'#e8eddf')
r(phone,(0,405,390,900),PAPER,24)
t(phone,28,440,'欢迎加入 Wildboy',25,True);t(phone,28,484,'登录后报名活动，查看自己的出发记录。',12,False,M)
t(phone,28,529,'不需要输入微信账号或密码',11,False,M)
r(phone,(28,575,362,629),'#6d8679',9)
t(phone,165,591,'微信登录',16,True,W)
r(phone,(35,658,49,672),W,3,'#a6b09e');t(phone,59,654,'我已阅读并同意',11,False,M)
t(phone,59,679,'《隐私政策》',11,True,G);t(phone,143,679,'与',11,False,M);t(phone,163,679,'《用户协议》',11,True,G)
t(phone,59,705,'请阅读当前版本，勾选后继续。',10,False,M)
t(phone,151,765,'先逛逛山野 ↗',13,True)
t(phone,70,812,'你的出发，由自己决定。',11,False,M)
r(phone,(145,885,245,888),G,2)
im.paste(phone,(x*S,y*S))
t(im,35,1022,'默认不勾选 · 不自动获取头像、昵称或手机号',11,False,M)
t(im,35,1050,'设计预览 · 独立页面尚未实现 · 非微信真机截图',10,False,M)
im.save(P/'wildboy-wechat-login.png')
print(im.size)
