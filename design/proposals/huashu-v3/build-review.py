from pathlib import Path
import base64

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'design-demos'
OPTIONS = [
    ('A', '晨光绿白', '紧凑表格', 'n2cQ6B.png', 'O79Ql.png', '#247A52', '#EAF4E7', 'dir-1.html'),
    ('B', '莓果晴天', '图片卡片', 'B-final/H3X2a.png', 'B-final/HyvJK.png', '#B93858', '#FDEEF1', 'dir-2.html'),
    ('C', '杏黄留白', '分类列表', 'M894N.png', 'Nu5Gj.png', '#F1CC56', '#FFF5CE', 'dir-3.html'),
]

def data(path):
    return 'data:image/png;base64,' + base64.b64encode((OUT / path).read_bytes()).decode()

CSS = '''*{box-sizing:border-box}body{margin:0;color:#242521;background:#fafbf8;font:16px/1.5 "Noto Sans SC","Microsoft YaHei",sans-serif}a{color:inherit}button{font:inherit;cursor:pointer}button:focus-visible,a:focus-visible{outline:3px solid #685728;outline-offset:4px}h1,h2,p{margin:0}h1{font-size:28px;font-weight:650}h2{font-size:21px;font-weight:650}.muted{color:#61665b;font-size:14px}.review-header{max-width:1504px;margin:auto;padding:28px 32px 22px;display:flex;justify-content:space-between;align-items:center;gap:24px}.review-nav{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.review-nav button,.preview-link{min-height:44px;padding:10px 20px;border:1px solid #d3d7ce;border-radius:6px;background:#fff;text-decoration:none;display:inline-flex;align-items:center;justify-content:center}.review-nav button[aria-selected=true]{background:#252820;color:white;border-color:#252820}.swatches{display:flex;gap:6px;align-items:center}.swatches i{display:block;width:22px;height:22px;border-radius:50%;border:1px solid #00000012}.screen{display:block;width:100%;height:auto;border:1px solid #e4e6df;background:white}.panel{max-width:1504px;margin:auto;padding:0 32px 48px}.panel[hidden]{display:none}.panel-heading{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:16px}.panel-heading p{margin-top:2px}.kit-heading{margin:28px 0 12px;font-size:18px}.footer{max-width:1504px;margin:auto;padding:0 32px 32px;color:#61665b;font-size:14px}.footer a{margin-right:24px}.overview{padding:40px;background:#f5f6f2}.overview header{display:flex;align-items:center;justify-content:space-between;margin-bottom:30px}.overview .grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:28px}.overview figure{margin:0;min-width:0}.overview figcaption{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}.overview .kit-heading{font-size:14px;margin:18px 0 8px}.overview .foot{margin-top:24px;color:#61665b;font-size:14px}.overview .sub{font-size:14px;color:#61665b;margin-top:4px}@media(max-width:760px){.review-header{align-items:flex-start;flex-direction:column;padding:20px 16px}.panel{padding:0 16px 32px}.panel-heading{align-items:flex-start;flex-wrap:wrap}h1{font-size:24px}.footer{padding:0 16px 28px}.overview{padding:20px}.overview .grid{grid-template-columns:1fr}.overview header{display:block}.overview header p{margin-top:6px}}'''
head = '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Cache-Control" content="no-store"><title>野小子 · 三套首页提案</title><style>' + CSS + '</style></head>'

panels = []
cards = []
for i, (key,title,desc,screen,kit,primary,soft,demo) in enumerate(OPTIONS):
    swatches=f'<span class="swatches" aria-label="主色和浅色"><i style="background:{primary}"></i><i style="background:{soft}"></i><i style="background:#fff"></i></span>'
    screen_img=f'<img class="screen" src="{data(screen)}" alt="{key} {title}活动首页，{desc}">'
    kit_img=f'<img class="screen" src="{data(kit)}" alt="{title}统一组件与发布确认弹窗">'
    panels.append(f'<section class="panel" role="tabpanel" id="panel-{key}" aria-labelledby="tab-{key}" {"hidden" if i else ""}><div class="panel-heading"><div><h2>{key} {title}</h2><p class="muted">{desc}</p></div><a class="preview-link" href="{demo}" target="_blank" rel="noopener">打开可点击预览</a></div>{screen_img}<h3 class="kit-heading">组件与弹窗</h3>{kit_img}</section>')
    cards.append(f'<figure><figcaption><div><h2>{key} {title}</h2><p class="sub">{desc}</p></div>{swatches}</figcaption>{screen_img}<p class="kit-heading">组件与弹窗</p>{kit_img}</figure>')

tabs=''.join(f'<button role="tab" id="tab-{key}" aria-controls="panel-{key}" aria-selected="{"true" if i==0 else "false"}" tabindex="{0 if i==0 else -1}" data-key="{key}">{key} {title}</button>' for i,(key,title,*_) in enumerate(OPTIONS))
js='''<script>const tabs=[...document.querySelectorAll('[role=tab]')];function choose(key){tabs.forEach(t=>{const yes=t.dataset.key===key;t.setAttribute('aria-selected',yes);t.tabIndex=yes?0:-1;document.getElementById(t.getAttribute('aria-controls')).hidden=!yes});history.replaceState(null,'','#'+key)}tabs.forEach((t,i)=>{t.addEventListener('click',()=>choose(t.dataset.key));t.addEventListener('keydown',e=>{let j;if(e.key==='ArrowRight')j=(i+1)%tabs.length;if(e.key==='ArrowLeft')j=(i+tabs.length-1)%tabs.length;if(e.key==='Home')j=0;if(e.key==='End')j=tabs.length-1;if(j!==undefined){e.preventDefault();choose(tabs[j].dataset.key);tabs[j].focus()}})});if(['A','B','C'].includes(location.hash.slice(1)))choose(location.hash.slice(1));</script>'''
(OUT/'index.html').write_text(head+'<body><header class="review-header"><div><h1>三套首页提案</h1><p class="muted">野小子管理后台</p></div><nav class="review-nav" role="tablist" aria-label="设计方向">'+tabs+'</nav></header>'+''.join(panels)+'<footer class="footer"><a href="overview.html">三套并排对比</a><a href="thumbs.html">六个方向小样</a><a href="before-after.html">打磨前后</a></footer>'+js+'</body></html>',encoding='utf-8')
(OUT/'overview.html').write_text(head+'<body class="overview"><header><h1>野小子首页提案</h1><p class="muted">同一功能，不同排版</p></header><main class="grid">'+''.join(cards)+'</main><p class="foot">统一按钮、输入、状态与弹窗。全部为设计预览。</p></body></html>',encoding='utf-8')
print('Generated index.html and overview.html from saved Pen exports.')
