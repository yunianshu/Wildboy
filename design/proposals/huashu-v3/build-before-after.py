from pathlib import Path
import base64

ROOT=Path(__file__).resolve().parent/'design-demos'
items=[
    ('A 晨光绿白','polish/dir-1/round-1/桌面-01.png','qa-A/desktop-1440x900.png'),
    ('B 莓果晴天','polish/dir-2/round-1/桌面-01.png','B-html/final/home-1440x900.png'),
    ('C 杏黄留白','polish/dir-3/round-1/桌面-01.png','c-validation/final/desktop-1440x900.png'),
]
def img(path,alt):
    uri='data:image/png;base64,'+base64.b64encode((ROOT/path).read_bytes()).decode()
    return f'<img src="{uri}" alt="{alt}">'
sections=[]
for title,before,after in items:
    sections.append('<section><h2>'+title+'</h2><div class="pair"><figure><figcaption>首次浏览器截图</figcaption>'+img(before,title+'首次截图')+'</figure><figure><figcaption>当前预览</figcaption>'+img(after,title+'最终截图')+'</figure></div></section>')
html='''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>打磨前后</title><style>*{box-sizing:border-box}body{margin:0;padding:32px;color:#242521;background:#fafbf8;font:16px/1.5 "Noto Sans SC","Microsoft YaHei",sans-serif}header{display:flex;justify-content:space-between;align-items:center;margin-bottom:28px}h1{font-size:28px;margin:0}h2{font-size:20px;margin:0 0 16px}section{margin-bottom:36px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:24px}figure{margin:0;min-width:0}figcaption{font-size:14px;color:#61665b;margin-bottom:10px}img{width:100%;height:auto;display:block;border:1px solid #e4e6df}a{color:inherit;min-height:44px;display:inline-flex;align-items:center}a:focus-visible{outline:3px solid #685728;outline-offset:4px}@media(max-width:760px){body{padding:18px}.pair{grid-template-columns:1fr}header{align-items:flex-start;flex-direction:column}h1{font-size:24px}}</style><header><h1>打磨前后</h1><a href="index.html">返回方案</a></header>'''+''.join(sections)+'</html>'
(ROOT/'before-after.html').write_text(html,encoding='utf-8')
print('Built real first/final browser screenshot comparisons for A/B/C.')
