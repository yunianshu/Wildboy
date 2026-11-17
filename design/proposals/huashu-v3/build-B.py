from pathlib import Path
import base64, hashlib, json, mimetypes

BASE = Path(__file__).resolve().parent
PROJECT = BASE.parents[2]
readback_path = BASE / 'design-readback-B.json'
readback = json.loads(readback_path.read_text(encoding='utf-8'))
sha = hashlib.sha256(readback_path.read_bytes()).hexdigest()

def walk(node):
    yield node
    for child in node.get('children', []):
        if isinstance(child, dict):
            yield from walk(child)

nodes = {n['id']: n for root in readback['resolved'].values() for n in walk(root)}
raw_nodes = {n['id']: n for root in readback['raw'].values() for n in walk(root)}
cards = [n for n in walk(readback['raw']['H3X2a']) if n.get('metadata', {}).get('type') == 'activity-card']
sample = json.loads((BASE / 'sample-data.json').read_text(encoding='utf-8'))
data = []
for index, node in enumerate(cards):
    m = node['metadata']
    s = sample[index]
    assert (m['title'], m['category'], m['location'], m['startAt'], m['price'] * 100, m['count'], m['capacity'], m['pending'], m['status'], m['image']) == (s['title'], s['categoryLabel'], s['location'], s['startAt'], s['priceCents'], s['registeredCount'], s['capacity'], s['pendingPaymentCount'], s['statusLabel'], s['image'])
    data.append(dict(s, penId=node['id']))
groups = []
for group in raw_nodes['DxRMM']['children']:
    label = group['name'].replace('B导航分组 ', '')
    items = []
    for node in group['children']:
        if node.get('metadata', {}).get('type') == 'navigation-link':
            items.append({'label': node['name'].replace('B导航入口 ', ''), 'route': node['metadata']['route'], 'penId': node['id']})
    groups.append({'label': label, 'items': items})
assert len(data) == 8 and sum(len(g['items']) for g in groups) == 15

assets = {}
for name in {d['image'] for d in data} | {'platform-brand-original-transparent.png'}:
    path = PROJECT / 'miniprogram' / 'src' / 'assets' / name
    assets[name] = 'data:' + (mimetypes.guess_type(name)[0] or 'image/jpeg') + ';base64,' + base64.b64encode(path.read_bytes()).decode()
variables = '\n'.join('  --' + k.removeprefix('hd-b-') + ': ' + (str(v['value']) + 'px' if v['type'] == 'number' else str(v['value'])) + ';' for k, v in readback['variables'].items())

template = r'''<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="design-source" content="H3X2a / HyvJK; SHA256 __SHA__">
<title>野小子管理后台 — B 莓果晴天设计预览</title>
<style>
__FONT__
:root {
__VARS__
  font-family:"Noto Sans SC","Microsoft YaHei",sans-serif;
  color:var(--ink);background:var(--bg);font-synthesis:none;
}
*{box-sizing:border-box}body{margin:0;min-width:320px;font-size:14px;line-height:1.4}button,input,select{font:inherit}button,a,input,select{-webkit-tap-highlight-color:transparent}button{cursor:pointer}button:disabled{cursor:default}button,a{touch-action:manipulation}a{color:inherit;text-decoration:none}button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid var(--primary);outline-offset:3px}button:disabled{color:var(--muted)}svg{display:block;flex:none;width:18px;height:18px;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round;fill:none}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.topbar{height:72px;padding:0 32px;display:flex;align-items:center;gap:24px;border-bottom:1px solid var(--line);background:var(--surface);position:relative;z-index:5}
.brand{width:192px;flex:none;display:flex;align-items:center;gap:12px;color:var(--muted);font-weight:500}.brand img{width:100px;height:64px;object-fit:contain}.brand span{white-space:nowrap}
.business-nav{display:flex;justify-content:center;align-items:center;gap:8px;flex:1;min-width:0;height:100%}.nav-group{position:relative}.nav-button{height:44px;width:96px;display:flex;align-items:center;justify-content:center;gap:8px;background:transparent;border:0;border-radius:10px;font-size:16px;font-weight:500;color:var(--ink)}.nav-group:last-child .nav-button{width:144px}.nav-button svg{width:14px;height:14px;color:var(--muted)}.nav-button.current,.nav-button[aria-expanded=true]{background:var(--soft);color:var(--primary)}.nav-button.current{font-weight:600}.nav-button:hover{background:var(--soft)}
.nav-menu{position:absolute;top:54px;left:0;min-width:216px;padding:8px;border:1px solid var(--line);border-radius:12px;background:var(--surface);box-shadow:0 8px 28px #33242a14}.nav-menu[hidden]{display:none}.nav-group:last-child .nav-menu{left:auto;right:0}.nav-menu a{display:flex;align-items:center;min-height:44px;padding:0 12px;border-radius:8px;font-size:14px;white-space:nowrap}.nav-menu a:hover,.nav-menu a.current{background:var(--soft);color:var(--primary)}
.account{width:272px;flex:none;display:flex;justify-content:flex-end;align-items:center;gap:12px;white-space:nowrap}.preview-trigger{padding:0;border:0;height:44px;background:none;color:var(--muted)}.preview-trigger span{display:block;padding:5px 8px;background:var(--neutral-bg);border-radius:6px;font-size:12px;line-height:18px}.account-icon,.account-icon svg{width:24px;height:24px}.logout{height:44px;width:72px;padding:0;background:none;color:var(--muted);border:0;border-radius:10px}
main{padding:20px 32px 16px;display:flex;flex-direction:column;gap:16px}.titlebar{height:44px;display:flex;align-items:center;gap:12px}.heading{display:flex;align-items:center;gap:24px;flex:1;min-width:0}h1{margin:0;color:var(--primary);font-size:28px;font-weight:700;line-height:1.4;white-space:nowrap}.subnav{display:flex;align-items:center;gap:24px}.subnav a{height:44px;display:flex;align-items:center;font-weight:500;color:var(--muted);white-space:nowrap}.subnav a:hover{color:var(--primary)}.title-actions{display:flex;gap:12px}
.button{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:44px;border-radius:10px;padding:0 16px;border:1px solid var(--field);background:var(--surface);font-weight:500;line-height:1;white-space:nowrap;color:var(--ink)}.button:hover:not(:disabled){background:var(--bg)}.primary{background:var(--primary);color:#fff;border-color:var(--primary)}.primary:hover:not(:disabled){background:var(--primary-hover);border-color:var(--primary-hover)}.quiet{background:var(--soft);color:var(--primary);border-color:var(--soft)}.quiet:hover:not(:disabled){background:#f9e1e7}.ghost{background:none;border-color:transparent;color:var(--muted)}.refresh{width:88px}.create{width:128px}
.filters{display:flex;align-items:center;gap:12px;height:44px;position:relative}.search-field{position:relative;width:320px;flex:none;height:44px}.search-field svg{position:absolute;left:12px;top:13px;color:var(--muted);pointer-events:none}.search-field input{width:100%;height:44px;border:1px solid var(--field);border-radius:10px;padding:0 12px 0 38px;background:var(--surface);color:var(--ink)}input::placeholder{color:var(--muted);opacity:1}input[type=search]::-webkit-search-cancel-button{cursor:pointer}.select-field{position:relative;width:168px;flex:none;height:44px}.select-field select{appearance:none;width:100%;height:44px;padding:0 36px 0 12px;border:1px solid var(--field);border-radius:10px;background:var(--surface);color:var(--ink);cursor:pointer}.select-field svg{position:absolute;right:12px;top:14px;width:16px;height:16px;pointer-events:none;color:var(--muted)}.query-button,.reset-button{width:88px}.reset-button{border-color:var(--line);color:var(--muted)}.result-count{margin-left:auto;white-space:nowrap;color:var(--muted)}
.activity-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 16px;min-height:612px;align-content:start}.activity-card{display:grid;grid-template-columns:176px minmax(0,1fr);height:144px;background:var(--surface);border-radius:12px;outline:1px solid var(--line);outline-offset:-1px;overflow:hidden}.cover{width:176px;height:144px;display:block;object-fit:cover}.card-content{padding:12px 16px;display:grid;grid-template-rows:24px 20px 20px 44px;gap:4px;min-width:0}.card-top{display:flex;align-items:center;gap:8px;min-width:0}.card-title{font-size:18px;line-height:1.3;font-weight:600;margin:0;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.status{height:24px;display:inline-flex;align-items:center;padding:0 8px;border-radius:6px;font-size:12px;font-weight:500;white-space:nowrap}.status.published{background:var(--success-bg);color:var(--success)}.status.draft{background:var(--warning-bg);color:var(--warning)}.status.cancelled{background:var(--neutral-bg);color:var(--neutral)}.meta-row{display:flex;align-items:center;gap:12px;color:var(--muted);white-space:nowrap}.location{display:flex;align-items:center;gap:4px;min-width:0}.location svg,.date-row svg{width:14px;height:14px}.date-row{display:flex;align-items:center;gap:6px;min-width:0;font-variant-numeric:tabular-nums}.date-row>svg{color:var(--muted)}time{white-space:nowrap}.price{margin-left:auto;color:var(--primary);font-size:18px;line-height:1.1;font-weight:600;white-space:nowrap}.price.free{color:var(--ink)}.card-actions{display:flex;align-items:center;gap:8px;min-width:0}.registration{flex:1;min-width:0;font-variant-numeric:tabular-nums}.registration p{margin:0;white-space:nowrap}.pending{font-size:12px;color:var(--warning)}.edit{width:64px;padding:0}.orders{width:96px;padding:0}.pagination{height:44px;display:flex;align-items:center;gap:8px;color:var(--muted)}.pagination .range{flex:1}.pagination .button{border-color:var(--line);width:88px}.pagination .page-number{width:44px;border-color:var(--soft)}
.empty-state{grid-column:1/-1;min-height:360px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;background:var(--surface);border:1px solid var(--line);border-radius:12px}.empty-state h2{font-size:16px;font-weight:600;margin:0}.empty-state p{margin:0;color:var(--muted);font-size:14px}.empty-state .button{margin-top:4px}
dialog{width:520px;max-width:calc(100vw - 32px);border:0;border-radius:16px;padding:24px;background:var(--surface);color:var(--ink);box-shadow:0 8px 28px #33242a1a}dialog::backdrop{background:#33242a66}.dialog-content{display:flex;flex-direction:column;gap:16px}.dialog-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;height:44px}.dialog-heading h2{font-size:22px;font-weight:600;line-height:1.45;margin:0}.close{width:44px;height:44px;display:flex;align-items:center;justify-content:center;border:0;background:none;border-radius:10px;color:var(--muted)}.close svg{width:20px;height:20px}.dialog-description{font-size:16px;line-height:1.6;color:var(--muted);margin:0}.dialog-actions{display:flex;justify-content:flex-end;gap:12px;padding-top:4px;height:48px}.dialog-actions .button{width:112px}.dialog-actions .cancel:focus{outline:2px solid var(--primary);outline-offset:1px}
.toast{position:fixed;z-index:20;bottom:24px;left:50%;transform:translateX(-50%);max-width:calc(100vw - 32px);width:max-content;border:1px solid var(--line);border-radius:12px;padding:14px 20px;background:var(--surface);box-shadow:0 8px 28px #33242a1a;color:var(--ink);font-size:14px;line-height:1.5}.toast[hidden]{display:none}
@media(min-width:1600px){main{max-width:1600px;margin:auto}.topbar{padding-left:max(32px,calc((100vw - 1536px)/2));padding-right:max(32px,calc((100vw - 1536px)/2))}}
@media(max-width:1180px){.brand{width:150px;gap:8px}.brand img{width:84px}.account{width:224px;gap:8px}.account-label{display:none}.topbar{gap:16px;padding:0 24px}.nav-button{width:80px}.nav-group:last-child .nav-button{width:124px}.activity-card{grid-template-columns:144px minmax(0,1fr)}.cover{width:144px}.search-field{width:260px}.select-field{width:148px}.card-content{padding-left:12px;padding-right:12px}.price{font-size:16px}.meta-row{font-size:13px;gap:8px}}
@media(max-width:960px){.topbar{height:116px;display:grid;grid-template-columns:1fr auto;grid-template-rows:64px 52px;padding:0 24px;gap:0}.brand{width:auto}.brand img{height:60px}.business-nav{grid-column:1/-1;grid-row:2;justify-content:flex-start}.account{grid-column:2;grid-row:1;width:auto}.nav-menu{top:48px}.activity-grid{grid-template-columns:1fr;min-height:0}.activity-card{grid-template-columns:176px minmax(0,1fr)}.cover{width:176px}.card-content{padding-left:16px;padding-right:16px}.meta-row{font-size:14px;gap:12px}.price{font-size:18px}.filters{flex-wrap:wrap;height:auto}.search-field{flex:1;min-width:220px}.result-count{flex:1;text-align:right}.query-button,.reset-button{width:80px}}
@media(max-width:600px){.topbar{padding:0 16px}.brand img{width:84px;height:56px}.brand span{display:none}.account{gap:8px}.account-icon{width:24px;height:24px}.account-label{display:none}.business-nav{display:grid;grid-template-columns:repeat(4,minmax(0,1fr)) 1.7fr;gap:4px}.nav-button,.nav-group:last-child .nav-button{width:100%;font-size:14px;gap:4px;padding:0}.nav-group:last-child .nav-button{font-size:12px}.nav-button svg{width:12px;height:12px}.nav-menu{left:0;position:fixed;top:112px;margin:0 16px;width:calc(100vw - 32px);max-width:none;min-width:0}.nav-group:last-child .nav-menu{left:0;right:auto}.nav-menu a{font-size:16px}.logout{width:64px}.preview-trigger span{padding:5px 6px}
main{padding:16px;gap:16px}.titlebar{height:auto;display:flex;flex-wrap:wrap;gap:8px}.heading{display:contents}h1{font-size:24px;flex:1;order:1}.title-actions{order:2;gap:8px}.refresh{width:60px}.create{width:104px}.subnav{order:3;width:100%;gap:24px}.subnav a{height:40px}.filters{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 12px}.search-field{grid-column:1/-1;min-width:0;width:calc(100% - 88px);height:44px;flex:none}.query-button{position:absolute;right:0;top:0;width:76px}.select-field{width:100%;min-width:0}.reset-button{width:88px}.result-count{font-size:14px;grid-column:2;justify-self:end;margin:0}.activity-grid{gap:12px}.activity-card{grid-template-columns:104px minmax(0,1fr);height:224px}.cover{width:104px;height:224px}.card-content{padding:12px;grid-template-rows:24px 36px 40px 72px;gap:8px}.card-title{font-size:16px}.status{padding:0 6px;font-size:12px}.meta-row{display:flex;flex-wrap:wrap;align-content:center;gap:0 8px;font-size:14px}.location{width:100%}.date-row{display:flex;align-content:center;flex-wrap:wrap;gap:3px 5px;font-size:14px}.date-row time{font-size:13px}.price{font-size:16px;margin-left:19px;width:100%}.card-actions{display:grid;grid-template-columns:64px 1fr;grid-template-rows:20px 44px;gap:8px}.registration{grid-column:1/-1;display:flex;align-items:center;gap:8px;font-size:13px}.registration .pending{font-size:12px}.edit{width:64px}.orders{width:100%}.pagination{height:auto;min-height:44px;flex-wrap:wrap;gap:8px}.pagination .range{font-size:12px}.pagination .button{width:68px;padding:0 8px}.pagination .page-number{width:44px}.empty-state{min-height:280px}dialog{padding:24px}.dialog-heading h2{font-size:22px}.dialog-actions{justify-content:stretch}.dialog-actions .button{flex:1;min-width:0}.toast{bottom:16px;padding:12px 16px}}
@media(prefers-reduced-motion:no-preference){button,a{transition:background-color .15s,color .15s}}
</style>
</head>
<body>
<header class="topbar" data-pen-id="p5wPY">
  <div class="brand" data-pen-id="Y70oGe"><img id="brand-logo" alt="野小子" width="100" height="64"><span>管理后台</span></div>
  <nav class="business-nav" id="business-nav" aria-label="业务导航"></nav>
  <div class="account" data-pen-id="igtH4">
    <button id="preview-trigger" class="preview-trigger" aria-label="设计预览：打开发布确认弹窗" title="设计预览：发布确认弹窗" aria-haspopup="dialog" data-pen-id="wtX9a"><span>设计预览</span></button>
    <span class="account-icon" aria-hidden="true" data-icon="user"></span><span class="account-label">管理员</span>
    <button class="logout" id="logout" data-pen-id="b1coPL">退出登录</button>
  </div>
</header>
<main data-pen-id="LKyvm">
  <div class="titlebar" data-pen-id="eybj4"><div class="heading"><h1>活动管理</h1><nav class="subnav" aria-label="活动导航"><a href="/templates" data-route="/templates">活动模板</a><a href="/activity-orders" data-route="/activity-orders">活动订单</a></nav></div><div class="title-actions"><button class="button refresh" id="refresh">刷新</button><button class="button primary create" id="create">新建活动</button></div></div>
  <form class="filters" id="filters" aria-label="活动查询" data-pen-id="K7Ulh3">
    <label class="search-field"><span class="sr-only">搜索活动名称</span><span data-icon="search" aria-hidden="true"></span><input id="search" name="title" type="search" placeholder="搜索活动名称" autocomplete="off"></label>
    <label class="select-field"><span class="sr-only">活动分类</span><select id="category" name="category" aria-label="活动分类"><option value="">全部分类</option><option value="WEEKLY">本周活动</option><option value="DOMESTIC">国内游行</option><option value="HOLIDAY">假期活动</option><option value="LEISURE">休闲活动</option></select><span data-icon="chevron" aria-hidden="true"></span></label>
    <label class="select-field"><span class="sr-only">活动状态</span><select id="status" name="status" aria-label="活动状态"><option value="">全部状态</option><option value="DRAFT">草稿</option><option value="PUBLISHED">已发布</option><option value="CANCELLED">已取消</option></select><span data-icon="chevron" aria-hidden="true"></span></label>
    <button class="button quiet query-button" type="submit">查询</button><button class="button reset-button" type="reset">重置</button><output class="result-count" id="result-count" aria-live="polite">8 场活动</output>
  </form>
  <section class="activity-grid" id="activities" aria-label="活动列表" data-pen-id="KQirF"></section>
  <nav class="pagination" aria-label="活动分页" data-pen-id="l6Jc56"><span class="range" id="range">显示 1–8 项</span><button class="button" disabled>上一页</button><button class="button quiet page-number" aria-current="page">1</button><button class="button" disabled>下一页</button></nav>
</main>
<dialog id="publish-dialog" aria-labelledby="dialog-title" aria-describedby="dialog-description" data-pen-id="LhnkF">
  <div class="dialog-content"><div class="dialog-heading"><h2 id="dialog-title">发布这场活动？</h2><button class="close" aria-label="关闭弹窗" id="dialog-close"><span data-icon="close" aria-hidden="true"></span></button></div><p id="dialog-description" class="dialog-description">发布后活动将出现在小程序，请再次确认报名价格、时间、地点和人数限制。</p><div class="dialog-actions"><button class="button cancel" id="dialog-cancel" autofocus>返回检查</button><button class="button primary" id="dialog-confirm">确认发布</button></div></div>
</dialog>
<div class="toast" id="toast" role="status" aria-live="polite" hidden></div>
<script>
'use strict';
const hdBData = __DATA__;
const hdBGroups = __GROUPS__;
const hdBAssets = __ASSETS__;
const hdBIcons = {
  search:'<circle cx="10.8" cy="10.8" r="7.3"/><path d="m16.2 16.2 4.6 4.6"/>',
  chevron:'<path d="m6 9 6 6 6-6"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18M8 15h2M14 15h2"/>',
  map:'<path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  user:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="9" r="3"/><path d="M5.8 18.2a6.4 6.4 0 0 1 12.4 0"/>',
  close:'<path d="m6 6 12 12M18 6 6 18"/>'
};
const hdBIcon = name => '<svg viewBox="0 0 24 24" aria-hidden="true">'+hdBIcons[name]+'</svg>';
const hdBEscape = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const hdBForm = document.getElementById('filters');
const hdBDialog = document.getElementById('publish-dialog');
const hdBTrigger = document.getElementById('preview-trigger');
let hdBToastTimer;
document.getElementById('brand-logo').src=hdBAssets['platform-brand-original-transparent.png'];
document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=hdBIcon(el.dataset.icon));
document.getElementById('business-nav').innerHTML = hdBGroups.map((g,i)=>'<div class="nav-group"><button class="nav-button '+(g.label==='活动'?'current':'')+'" aria-expanded="false" aria-controls="nav-menu-'+i+'">'+g.label+hdBIcon('chevron')+'</button><div class="nav-menu" id="nav-menu-'+i+'" hidden>'+g.items.map(item=>'<a href="'+item.route+'" data-route="'+item.route+'" data-pen-id="'+item.penId+'" class="'+(item.route==='/activities'?'current':'')+'">'+item.label+'</a>').join('')+'</div></div>').join('');
function hdBCloseMenus(){document.querySelectorAll('.nav-button').forEach(button=>{button.setAttribute('aria-expanded','false');document.getElementById(button.getAttribute('aria-controls')).hidden=true;});}
function hdBNotify(message){clearTimeout(hdBToastTimer);const toast=document.getElementById('toast');toast.textContent=message;toast.hidden=false;hdBToastTimer=setTimeout(()=>toast.hidden=true,5500);}
function hdBRender(){
 const query=document.getElementById('search').value.trim().toLocaleLowerCase('zh-CN');
 const category=document.getElementById('category').value;
 const status=document.getElementById('status').value;
 const filtered=hdBData.filter(item=>(!query||item.title.toLocaleLowerCase('zh-CN').includes(query))&&(!category||item.category===category)&&(!status||item.status===status));
 document.getElementById('result-count').textContent=filtered.length+' 场活动';
 document.getElementById('range').textContent=filtered.length?'显示 1–'+filtered.length+' 项':'显示 0 项';
 document.getElementById('activities').innerHTML=filtered.length?filtered.map(item=>{
  const tone={PUBLISHED:'published',DRAFT:'draft',CANCELLED:'cancelled'}[item.status];
  const price=item.priceCents===0?'免费':'¥ '+(item.priceCents/100).toFixed(2)+' / 人';
  return '<article class="activity-card" data-pen-id="'+item.penId+'" data-title="'+hdBEscape(item.title)+'"><img class="cover" src="'+hdBAssets[item.image]+'" alt="'+hdBEscape(item.title)+'的示例封面" width="176" height="144"><div class="card-content"><div class="card-top"><h2 class="card-title">'+hdBEscape(item.title)+'</h2><span class="status '+tone+'">'+item.statusLabel+'</span></div><div class="meta-row"><span>'+item.categoryLabel+'</span><span class="location">'+hdBIcon('map')+hdBEscape(item.location)+'</span></div><div class="date-row">'+hdBIcon('calendar')+'<time datetime="'+item.startAt.replace(' ','T')+'+08:00">'+item.startAt+'</time><span class="price '+(item.priceCents===0?'free':'')+'">'+price+'</span></div><div class="card-actions"><div class="registration"><p>报名 '+item.registeredCount+' / '+item.capacity+' 人</p>'+(item.priceCents>0&&item.pendingPaymentCount>0?'<p class="pending">待支付 '+item.pendingPaymentCount+' 人</p>':'')+'</div><button class="button ghost edit" data-action="edit" data-title="'+hdBEscape(item.title)+'">编辑</button><button class="button quiet orders" data-action="'+(item.priceCents?'orders':'roster')+'" data-title="'+hdBEscape(item.title)+'">'+(item.priceCents?'收费订单':'免费名单')+'</button></div></div></article>';
 }).join(''):'<div class="empty-state" data-pen-id="M0fAx"><h2>没有找到活动</h2><p>试试其他关键词或筛选</p><button class="button" id="empty-reset">重置筛选</button></div>';
}
function hdBReset(){hdBForm.reset();hdBRender();}
hdBForm.addEventListener('submit',event=>{event.preventDefault();hdBRender();});
hdBForm.addEventListener('reset',()=>setTimeout(hdBRender,0));
document.getElementById('category').addEventListener('change',hdBRender);
document.getElementById('status').addEventListener('change',hdBRender);
document.addEventListener('click',event=>{
 const groupButton=event.target.closest('.nav-button');
 if(groupButton){const open=groupButton.getAttribute('aria-expanded')==='true';hdBCloseMenus();if(!open){groupButton.setAttribute('aria-expanded','true');document.getElementById(groupButton.getAttribute('aria-controls')).hidden=false;}return;}
 if(!event.target.closest('.nav-group'))hdBCloseMenus();
 const link=event.target.closest('[data-route]');
 if(link){event.preventDefault();hdBCloseMenus();if(link.dataset.route==='/activities'){hdBNotify('当前为活动管理设计预览。');}else{hdBNotify(link.textContent.trim()+'（'+link.dataset.route+'）仅展示入口，本预览未连接该页面。');}return;}
 const action=event.target.closest('[data-action]');
 if(action){const label={edit:'编辑',orders:'收费订单',roster:'免费名单'}[action.dataset.action];hdBNotify('「'+action.dataset.title+'」'+label+'入口预览，未连接后台数据。');return;}
 if(event.target.closest('#empty-reset'))hdBReset();
});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!hdBDialog.open){const open=document.querySelector('.nav-button[aria-expanded=true]');hdBCloseMenus();if(open)open.focus();}});
document.getElementById('refresh').addEventListener('click',()=>{hdBRender();hdBNotify('设计样例已重新显示。');});
document.getElementById('create').addEventListener('click',()=>hdBNotify('新建活动入口预览，未创建活动。'));
document.getElementById('logout').addEventListener('click',()=>hdBNotify('设计预览未连接登录会话，无需退出。'));
hdBTrigger.addEventListener('click',()=>{hdBCloseMenus();hdBDialog.showModal();document.getElementById('dialog-cancel').focus();});
document.getElementById('dialog-close').addEventListener('click',()=>hdBDialog.close());
document.getElementById('dialog-cancel').addEventListener('click',()=>hdBDialog.close());
document.getElementById('dialog-confirm').addEventListener('click',()=>{hdBDialog.close();hdBNotify('发布确认交互预览结束，样例活动未发布。');});
hdBDialog.addEventListener('click',event=>{if(event.target===hdBDialog){const r=hdBDialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)hdBDialog.close();}});
hdBDialog.addEventListener('close',()=>hdBTrigger.focus());
hdBDialog.addEventListener('keydown',event=>{if(event.key!=='Tab')return;const items=Array.from(hdBDialog.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),[tabindex="0"]'));const first=items[0],last=items[items.length-1];if(event.shiftKey&&(document.activeElement===first||!hdBDialog.contains(document.activeElement))){event.preventDefault();last.focus();}else if(!event.shiftKey&&(document.activeElement===last||!hdBDialog.contains(document.activeElement))){event.preventDefault();first.focus();}});
hdBRender();
window.hdBPreview={sourceSHA:'__SHA__',roots:['H3X2a','HyvJK'],dataCount:hdBData.length,routeCount:hdBGroups.reduce((n,g)=>n+g.items.length,0)};
</script>
</body>
</html>'''

font_css = '@font-face{font-family:"Noto Sans SC";src:local("Noto Sans SC");font-weight:100 900;font-display:swap}'
try:
    from fontTools import subset
    from fontTools.ttLib import TTFont
    from io import BytesIO
    chars = ''.join(sorted(set(template + json.dumps(data, ensure_ascii=False) + json.dumps(groups, ensure_ascii=False))))
    options = subset.Options()
    options.flavor = 'woff2'
    font = TTFont('C:/Windows/Fonts/NotoSansSC-VF.ttf')
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(text=chars)
    subsetter.subset(font)
    font.flavor = 'woff2'
    buffer = BytesIO()
    font.save(buffer)
    encoded = base64.b64encode(buffer.getvalue()).decode()
    font_css = '@font-face{font-family:"Noto Sans SC";src:url(data:font/woff2;base64,' + encoded + ') format("woff2");font-weight:100 900;font-display:swap}'
except ImportError:
    pass

template = template.replace('.subnav a{height:40px}', '.subnav a{height:44px}').replace('.meta-row{font-size:13px;gap:8px}', '.meta-row{font-size:14px;gap:8px}').replace('.date-row time{font-size:13px}', '.date-row time{font-size:14px}').replace('gap:8px;font-size:13px}.registration', 'gap:8px;font-size:14px}.registration').replace('.nav-menu{left:0;position:fixed;top:112px;margin:0 16px;width:calc(100vw - 32px);max-width:none;min-width:0}', '.business-nav{position:relative}.nav-group{position:static}.nav-menu{left:0;position:absolute;top:52px;margin:0;width:100%;max-width:none;min-width:0}')
html = template.replace('__FONT__', font_css).replace('__VARS__', variables).replace('__SHA__', sha).replace('__DATA__', json.dumps(data, ensure_ascii=False, separators=(',', ':'))).replace('__GROUPS__', json.dumps(groups, ensure_ascii=False, separators=(',', ':'))).replace('__ASSETS__', json.dumps(assets, separators=(',', ':')))
output = BASE / 'design-demos' / 'dir-2.html'
output.write_text(html, encoding='utf-8')
mapping = {'readbackSHA256':sha,'html':'design-demos/dir-2.html','roots':['H3X2a','HyvJK'],'variables':list(readback['variables']),'components':{'primary':'iLJFv','secondary':'G36zmt','quiet':'CG8d0','field':'fsh8n','status':'I8Qyzu','empty':'M0fAx','modal':'LhnkF','menu':'DxRMM'},'cardPenIds':[c['id'] for c in cards],'embeddedImageCount':len(assets),'embeddedFont':'base64' in font_css,'dataContractMatchesSample':True,'navigationCount':15,'responsiveAdaptation':'375px：五类导航保留、活动子导航换行、单列左图右字段卡片，控件最小44px。'}
(BASE / 'design-mapping-B.json').write_text(json.dumps(mapping, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'html':str(output),'bytes':output.stat().st_size,'sourceSHA256':sha,'embeddedFont':mapping['embeddedFont']},ensure_ascii=False))
