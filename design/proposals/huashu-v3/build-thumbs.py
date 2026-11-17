from pathlib import Path
import base64, json

root=Path(__file__).resolve().parent
items=[('OVwQn','晨光绿白','A 完整方案'),('cW5cX','莓果晴天','B 完整方案'),('R7LbJa','透明目录','备选'),('g83es','柔紫工作台','备选'),('w950X','杏黄留白','C 完整方案'),('LPkh9','红白标志','备选')]
cards=[]
for i,(node,title,kind) in enumerate(items,1):
    raw=(root/'design-demos'/f'{node}.png').read_bytes()
    uri='data:image/png;base64,'+base64.b64encode(raw).decode()
    cards.append(f'<figure data-thumb="{i}"><figcaption><strong>{title}</strong><span>{kind}</span></figcaption><img src="{uri}" alt="{title}后台首页设计小样"></figure>')
html='''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>野小子 · 六个方向</title><style>*{box-sizing:border-box}body{margin:0;padding:28px;background:#eeefea;color:#20372c;font-family:"Noto Sans SC","Microsoft YaHei",sans-serif;font-size:16px}header{display:flex;align-items:center;justify-content:space-between;margin-bottom:24px}h1{margin:0;font-size:26px}header p{margin:0;color:#576157;font-size:14px}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px}figure{margin:0;min-width:0}figcaption{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;font-size:16px}figcaption span{font-size:12px;color:#536250}img{display:block;width:100%;height:auto;background:white}@media(max-width:850px){body{padding:18px}.grid{grid-template-columns:1fr}header{display:block}header p{margin-top:10px}}</style><header><h1>野小子 / 六个方向</h1><p>同一活动首页 · 设计预览</p></header><main class="grid">'''+''.join(cards)+'</main></html>'
(root/'design-demos'/'thumbs.html').write_text(html,encoding='utf-8')
report=json.loads(Path('D:/AiProject/Wildboy/_temp/huashu-install-verification.json').read_text(encoding='utf-8'))
summary={k:v for k,v in report.items() if k!='entries'}
summary.update({'installation':'fresh installation; no previous huashu skill found','fileCount':len(report['entries']),'verifiedFileCount':sum(x['status'] in ['downloaded-verified','verified-existing'] for x in report['entries']),'localSkill':'C:/Users/59290/.codex/skills/huashu-design/SKILL.md'})
(root/'skill-install.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
print('Wrote six real Pen thumbnails and verified skill installation metadata.')
