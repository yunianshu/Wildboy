const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const project = path.resolve(__dirname, '../..');
const repo = path.resolve(project, '../../..');
const readbackPath = path.join(project, 'design-readback-C.json');
const readbackText = fs.readFileSync(readbackPath, 'utf8');
const readback = JSON.parse(readbackText);
const readbackSha = crypto.createHash('sha256').update(readbackText).digest('hex');
const samples = JSON.parse(fs.readFileSync(path.join(project, 'sample-data.json'), 'utf8'));
const assetNames = ['platform-brand-original-transparent.png', ...new Set(samples.map(x => x.image))];
const assets = Object.fromEntries(assetNames.map(name => [name, `data:image/${name.endsWith('.png') ? 'png' : 'jpeg'};base64,${fs.readFileSync(path.join(repo, 'miniprogram/src/assets', name)).toString('base64')}`]));
const vue = fs.readFileSync(path.join(repo, 'admin/node_modules/vue/dist/vue.global.prod.js'), 'utf8').replace(/<\/script/gi, '<\\/script');
const tokens = Object.entries(readback.variables).map(([key, value]) => `--${key}:${value.type === 'string' ? JSON.stringify(value.value) : value.value}${value.type === 'number' ? 'px' : ''};`).join('\n');
const allNodes = [];
function walk(node) { allNodes.push(node); for (const child of node.children || []) walk(child); }
walk(readback.raw.M894N); walk(readback.raw.Nu5Gj);
const penRows = allNodes.filter(node => node.metadata?.type === 'activity-sample').map(node => node.metadata);
if (penRows.length !== 8 || penRows.some((node, i) => node.title !== samples[i].title || node.priceCents !== samples[i].priceCents || node.registeredCount !== samples[i].registeredCount || node.capacity !== samples[i].capacity || node.startAt !== samples[i].startAt)) throw new Error('Saved Pen data differs from shared samples');
const mapping = {
  direction: 'C 杏黄留白', readbackSha256: readbackSha, sourceSavedAt: readback.sourceSavedAt,
  roots: readback.roots, framework: 'Vue 3.5.44 (existing repository runtime, embedded)',
  fonts: ['Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', 'sans-serif'],
  desktopViewport: '1440x900', mobileViewport: '375x812',
  nodes: {
    topbar: 'Jn6DW', secondaryNavigation: 'zrpL7', categoryPanel: 'Mnw4g', main: 'mLe3F',
    title: 'Y88FJD', search: 'dnvn9', searchSubmit: 'OVL6B', status: 'cigHZ', refresh: 'WK090',
    list: 'QE804', pagination: 'Dv1y5', fixedPageSize: 'BWuPl', signOut: 'BeA2E',
    primary: 'SSYgy', secondary: 'R7IaYI', input: 'oiKfb', select: 'gejtk', textButton: 'yN8KC',
    tags: ['REFyz', 'OKILy', 'asRCP'], empty: 'lemCo', menu: 'o0TzXY', modal: 'q3sOy'
  },
  layout: { header: 72, subnav: 56, sidebar: 180, columnGap: 32, contentPadding: [24, 24, 40, 24], control: 44, radius: 4, tableHeader: 36, row: 60, capacityTrack: 160, modal: 520, modalPadding: 24 },
  dataChecks: { rows: 8, capacityRatios: samples.map(x => x.registeredCount / x.capacity), pageSize: 8, query: 'title only', status: ['DRAFT', 'PUBLISHED', 'CANCELLED'] },
  responsiveAdaptation: 'Below 900px: top navigation becomes the same grouped menu; category is a select; activity rows reflow to a two-column list without horizontal scrolling.',
  previewOnly: 'Preview tools sit outside product actions. Publish confirmation uses the saved Pen wording and only demonstrates the dialog; external navigation and actions display honest preview feedback.'
};
const template = String.raw`<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>C 杏黄留白 · 野小子后台设计预览</title>
<style>
:root { __TOKENS__ }
* { box-sizing:border-box; }
html { min-width:320px; background:var(--hd-c-bg); }
body { margin:0; color:var(--hd-c-ink); font-family:"Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif; font-size:14px; line-height:1.5; font-synthesis:none; }
button,input,select { font:inherit; color:inherit; }
button { cursor:pointer; }
button,select,input { border-radius:var(--hd-c-radius); }
button { border:0; background:none; }
button:disabled { cursor:not-allowed; }
button:focus-visible,input:focus-visible,select:focus-visible { outline:2px solid var(--hd-c-ink); outline-offset:3px; }
button, input, select { min-height:44px; }
button { transition:background-color .14s ease; }
button:hover:not(:disabled) { background-color:var(--hd-c-neutral); }
.icon { width:18px; height:18px; flex:none; display:block; }
[v-cloak],[hidden] { display:none !important; }
.sr-only { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
.topbar { display:flex; align-items:center; height:72px; padding:0 24px; gap:32px; border-bottom:1px solid var(--hd-c-line); }
.brand { display:flex; align-items:center; width:180px; gap:12px; flex:none; }
.brand img { width:84px; height:60px; object-fit:contain; }
.brand span { font-weight:600; white-space:nowrap; }
.global-nav { display:flex; align-items:center; flex:1; gap:8px; min-width:0; }
.nav-group { display:flex; align-items:center; justify-content:center; gap:8px; height:44px; width:84px; flex:none; font-weight:500; }
.nav-group.wide { width:136px; }
.nav-group.active { background:var(--hd-c-soft); font-weight:600; }
.nav-group .icon { width:14px; height:14px; }
.all-features { display:flex; align-items:center; justify-content:center; gap:8px; width:112px; height:44px; flex:none; color:var(--hd-c-muted); }
.all-features .icon { width:16px; height:16px; }
.account { display:flex; align-items:center; justify-content:flex-end; gap:12px; width:204px; flex:none; }
.account .icon { width:24px; height:24px; }
.account-name { font-weight:500; }
.sign-out { width:80px; height:44px; color:var(--hd-c-muted); }
.mobile-tools { display:none; }
.subnav { display:flex; align-items:center; height:56px; padding:0 24px 0 236px; gap:16px; border-bottom:1px solid var(--hd-c-line); }
.subnav button { width:104px; height:56px; border-radius:0; border-bottom:3px solid transparent; color:var(--hd-c-muted); }
.subnav button.active { color:var(--hd-c-ink); border-bottom-color:var(--hd-c-primary); font-weight:600; }
.workspace { display:grid; grid-template-columns:180px minmax(0,1fr); column-gap:32px; min-height:772px; padding:24px 24px 40px; }
.sidebar { border-right:1px solid var(--hd-c-line); padding-right:16px; }
.sidebar h2 { margin:0 0 12px; color:var(--hd-c-muted); font-size:12px; line-height:18px; font-weight:500; }
.category-list { display:flex; flex-direction:column; gap:4px; }
.category-list button { text-align:left; height:44px; padding:0 12px; }
.category-list button.active { background:var(--hd-c-soft); font-weight:600; }
.main { display:flex; flex-direction:column; gap:16px; min-width:0; }
.page-heading { display:flex; align-items:center; justify-content:space-between; height:44px; }
h1 { margin:0; font-size:28px; line-height:44px; font-weight:700; }
.button { display:inline-flex; align-items:center; justify-content:center; height:44px; padding:0 16px; gap:8px; white-space:nowrap; font-weight:500; }
.primary { background:var(--hd-c-primary); font-weight:600; }
.primary:hover:not(:disabled) { background-color:#E8C144; }
.secondary { background:var(--hd-c-bg); border:1px solid var(--hd-c-field); }
.new-activity { width:136px; }
.filterbar { display:flex; align-items:center; height:44px; gap:12px; }
.search-field { display:flex; align-items:center; width:360px; height:44px; gap:8px; padding:0 12px; border:1px solid var(--hd-c-field); border-radius:var(--hd-c-radius); }
.search-field .icon { color:var(--hd-c-muted); }
.search-field:focus-within { outline:2px solid var(--hd-c-ink); outline-offset:3px; }
.search-field input { border:0; outline:0; background:none; width:100%; min-width:0; padding:0; height:42px; min-height:42px; }
.search-field input:focus-visible { outline:none; }
input::placeholder { color:var(--hd-c-muted); opacity:1; }
.search-submit { width:84px; flex:none; }
.select-field { width:160px; height:44px; position:relative; }
.select-field select { width:100%; height:44px; appearance:none; border:1px solid var(--hd-c-field); padding:0 36px 0 12px; background:var(--hd-c-bg); cursor:pointer; }
.select-field .icon { position:absolute; right:12px; top:14px; width:16px; height:16px; pointer-events:none; color:var(--hd-c-muted); }
.mobile-category { display:none; }
.filter-spacer { flex:1; }
.reset-filters { height:44px; padding:0 12px; color:var(--hd-c-muted); white-space:nowrap; }
.refresh { width:96px; flex:none; }
.refresh .icon { width:16px; height:16px; }
.activity-table { width:100%; box-shadow:inset 0 1px var(--hd-c-line),inset 0 -1px var(--hd-c-line); }
.table-head,.activity-row { display:grid; grid-template-columns:minmax(220px,1fr) 168px 96px 176px 112px 196px; gap:16px; padding:0 16px; align-items:center; }
.table-head { height:36px; background:var(--hd-c-neutral); color:var(--hd-c-muted); font-size:12px; font-weight:500; }
.activity-row { height:60px; border-bottom:1px solid var(--hd-c-line); }
.activity-row:last-child { border-bottom:0; }
.entity { display:flex; align-items:center; gap:12px; min-width:0; }
.cover { width:44px; height:44px; object-fit:cover; border-radius:var(--hd-c-radius); flex:none; }
.entity-text { min-width:0; }
.activity-title { font-size:16px; font-weight:600; line-height:1.4; white-space:nowrap; }
.entity-meta { display:flex; align-items:center; gap:8px; color:var(--hd-c-muted); font-size:12px; line-height:18px; white-space:nowrap; }
.entity-meta .divider { width:1px; height:12px; background:var(--hd-c-line); }
.datetime { font-variant-numeric:tabular-nums; }
.date { font-weight:500; line-height:20px; }
.time { font-size:12px; line-height:18px; color:var(--hd-c-muted); }
.price { font-weight:600; white-space:nowrap; font-variant-numeric:tabular-nums; }
.capacity { width:160px; max-width:100%; }
.capacity-values { display:flex; justify-content:space-between; align-items:center; height:22px; font-weight:500; font-variant-numeric:tabular-nums; }
.pending { font-size:12px; font-weight:400; color:var(--hd-c-muted); }
.capacity-line { height:4px; margin-top:7px; width:100%; background:var(--hd-c-line); }
.capacity-line span { display:block; height:100%; width:var(--capacity-fill); background:var(--hd-c-ink); }
.status { display:inline-flex; align-items:center; justify-content:center; height:26px; width:68px; border-radius:var(--hd-c-radius); font-size:12px; font-weight:500; }
.status-PUBLISHED { background:var(--hd-c-success-bg); color:var(--hd-c-success); }
.status-DRAFT { background:var(--hd-c-neutral); color:var(--hd-c-muted); }
.status-CANCELLED { background:var(--hd-c-danger-bg); color:var(--hd-c-danger); }
.row-actions { display:flex; align-items:center; gap:16px; }
.text-action { width:64px; height:44px; padding:0; font-weight:500; }
.service-action { width:112px; }
.mobile-label { display:none; }
.empty-state { display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:300px; gap:8px; }
.empty-state .icon { width:24px; height:24px; color:var(--hd-c-muted); }
.empty-state h2 { font-size:16px; font-weight:600; margin:0; }
.empty-state button { height:44px; padding:0 16px; font-weight:500; }
.pagination { display:flex; align-items:center; gap:12px; height:44px; color:var(--hd-c-muted); font-variant-numeric:tabular-nums; }
.page-spacer { flex:1; }
.pagination .button { width:80px; padding:0; background:var(--hd-c-neutral); border:1px solid var(--hd-c-line); font-weight:500; color:var(--hd-c-muted); }
.nav-menu { position:fixed; z-index:50; top:64px; left:236px; width:488px; padding:16px; background:var(--hd-c-bg); border:1px solid var(--hd-c-line); border-radius:var(--hd-c-radius); box-shadow:0 8px 24px #302D231A; }
.menu-columns { display:grid; grid-template-columns:1fr 1fr; gap:24px; }
.menu-column { display:flex; flex-direction:column; gap:8px; }
.menu-group h2 { margin:0; font-size:12px; line-height:18px; color:var(--hd-c-muted); font-weight:500; }
.menu-group button { display:block; width:100%; height:44px; text-align:left; padding:0 8px; }
.menu-group button.active { background:var(--hd-c-soft); font-weight:600; }
.menu-mobile-footer { display:none; }
.preview-dock { position:fixed; bottom:12px; left:24px; z-index:45; }
.preview-trigger { background:white; border:1px solid var(--hd-c-line); height:44px; padding:0 12px; display:flex; gap:8px; align-items:center; color:var(--hd-c-muted); box-shadow:0 2px 8px #302D2308; }
.preview-trigger .icon { width:16px; height:16px; }
.preview-panel { position:fixed; z-index:60; bottom:68px; left:24px; width:304px; padding:16px; border:1px solid var(--hd-c-line); border-radius:var(--hd-c-radius); background:var(--hd-c-bg); box-shadow:0 8px 24px #302D231A; }
.preview-panel h2 { margin:0 0 8px; font-size:16px; }
.preview-panel p { margin:0 0 12px; font-size:12px; color:var(--hd-c-muted); }
.preview-panel button { width:100%; text-align:left; min-height:44px; padding:0 8px; }
.preview-panel button:hover { background:var(--hd-c-soft); }
dialog { width:520px; max-width:calc(100vw - 32px); padding:24px; border:1px solid var(--hd-c-line); border-radius:var(--hd-c-radius); color:var(--hd-c-ink); background:var(--hd-c-bg); box-shadow:0 8px 24px #302D231A; }
dialog::backdrop { background:#302D2366; }
.dialog-head { display:flex; align-items:center; justify-content:space-between; gap:16px; height:44px; }
.dialog-head h2 { margin:0; font-size:22px; line-height:1.5; font-weight:700; }
.dialog-close { width:44px; height:44px; display:flex; align-items:center; justify-content:center; flex:none; color:var(--hd-c-muted); }
.dialog-close .icon { width:20px; height:20px; }
.dialog-description { margin:16px 0 0; font-size:14px; line-height:1.7; color:var(--hd-c-muted); }
.dialog-actions { display:flex; align-items:flex-end; justify-content:flex-end; height:60px; margin-top:16px; gap:12px; }
.dialog-actions .button { width:116px; }
.dialog-actions .secondary:focus { outline:none; border:2px solid var(--hd-c-ink); }
.toast { position:fixed; z-index:100; right:24px; bottom:24px; max-width:min(400px,calc(100vw - 32px)); padding:12px 16px; border:1px solid var(--hd-c-field); border-radius:var(--hd-c-radius); background:var(--hd-c-bg); box-shadow:0 8px 24px #302D231A; font-size:14px; line-height:1.6; }
@media (min-width:1441px) { .workspace { min-height:calc(100vh - 128px); } }
@media (max-width:1330px) and (min-width:901px) {
 .topbar { gap:24px; } .account { width:168px; gap:8px; } .all-features { width:96px; }
 .workspace { grid-template-columns:160px minmax(0,1fr); gap:24px; } .subnav { padding-left:208px; }
 .table-head,.activity-row { grid-template-columns:minmax(180px,1fr) 130px 90px 150px 80px 154px; gap:12px; }
 .row-actions { gap:8px; } .text-action { width:48px; } .service-action { width:96px; }
 .capacity { width:138px; } .search-field { width:300px; }
 .global-nav { gap:0; } .nav-group { width:68px; } .nav-group.wide { width:124px; }
}
@media (max-width:1100px) and (min-width:901px) {
 .brand { width:152px; gap:8px; } .brand img { width:64px; } .global-nav .all-features { display:none; }
 .workspace { grid-template-columns:140px minmax(0,1fr); gap:20px; padding-right:16px; padding-left:16px; } .subnav { padding-left:176px; }
 .table-head,.activity-row { grid-template-columns:minmax(180px,1fr) 114px 86px 124px 68px 128px; gap:8px; padding-right:8px; padding-left:8px; }
 .row-actions { gap:0; } .text-action { width:44px; } .service-action { width:84px; } .capacity { width:116px; }
 .entity { gap:8px; } .entity-meta { gap:4px; } .pending { font-size:12px; } .search-field { width:260px; } .select-field { width:140px; }
}
@media (max-width:900px) {
 .topbar { height:64px; padding:0 16px; gap:8px; }
 .brand { width:auto; gap:8px; } .brand img { width:64px; height:48px; } .brand span { font-size:14px; }
 .global-nav,.account { display:none; } .mobile-tools { display:flex; align-items:center; margin-left:auto; gap:4px; }
 .mobile-tools button { height:44px; padding:0 10px; } .mobile-tools .mobile-menu-trigger { width:44px; padding:0; display:flex; align-items:center; justify-content:center; }
 .mobile-tools .mobile-preview-trigger { color:var(--hd-c-muted); font-size:12px; }
 .subnav { height:52px; padding:0 16px; gap:8px; } .subnav button { height:52px; width:104px; }
 .workspace { display:block; min-height:calc(100vh - 116px); padding:20px 16px 32px; }
 .sidebar { display:none; } .main { gap:16px; } h1 { font-size:28px; }
 .new-activity { width:112px; }
 .filterbar { height:auto; display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; }
 .search-field { width:100%; grid-column:1 / 4; } .search-submit { width:100%; grid-column:4 / 5; padding:0 10px; }
 .mobile-category { display:block; grid-column:1 / 3; grid-row:2; width:100%; } .status-select { grid-column:3 / 5; grid-row:2; width:100%; }
 .filter-spacer { display:none; } .reset-filters { grid-column:1 / 3; grid-row:3; justify-self:start; padding:0; }
 .refresh { width:96px; grid-column:3 / 5; grid-row:3; justify-self:end; }
 .table-head { display:none; }
 .activity-row { position:relative; height:auto; display:grid; grid-template-columns:1fr 1fr; gap:12px 16px; padding:16px 0; }
 .entity { grid-column:1 / 3; padding-right:80px; gap:12px; } .activity-title { font-size:16px; white-space:normal; }
 .entity-meta { flex-wrap:wrap; gap:4px 8px; } .entity-meta .divider { display:none; }
 .datetime { grid-column:1; } .price { grid-column:2; align-self:start; font-size:16px; }
 .mobile-label { display:block; color:var(--hd-c-muted); font-size:12px; font-weight:400; line-height:18px; margin-bottom:2px; }
 .date { display:inline; font-size:16px; } .time { display:inline; font-size:14px; margin-left:6px; }
 .button,.search-field input,.select-field select,.text-action,.subnav button { font-size:16px; }
 .capacity-values { font-size:16px; }
 .capacity { width:100%; } .capacity-cell { grid-column:1; align-self:center; }
 .status-cell { position:absolute; right:0; top:16px; }
 .row-actions { grid-column:2; align-self:center; gap:4px; justify-content:flex-end; } .text-action { width:44px; flex:none; } .service-action { width:96px; }
 .pagination { height:auto; display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); gap:12px; } .page-spacer { display:none; }
 .pagination > span:not(.page-spacer) { grid-column:span 2; white-space:nowrap; }
 .pagination .button { grid-column:span 3; width:100%; }
 .empty-state { min-height:280px; }
 .nav-menu { top:64px; left:16px; width:calc(100vw - 32px); max-height:calc(100dvh - 80px); overflow:auto; }
 .menu-columns { gap:20px; } .menu-mobile-footer { display:block; margin-top:12px; padding-top:12px; border-top:1px solid var(--hd-c-line); }
 .menu-mobile-footer button { width:100%; height:44px; text-align:left; padding:0 8px; color:var(--hd-c-muted); }
 .preview-dock { display:none; } .preview-panel { top:72px; bottom:auto; left:16px; width:calc(100vw - 32px); }
 .toast { right:16px; bottom:16px; }
}
@media (max-width:390px) { .subnav { gap:0; } .subnav button { flex:1; width:auto; } .brand span { font-size:12px; } .mobile-tools .mobile-preview-trigger { padding:0 8px; } .entity { padding-right:74px; } .date,.time { display:block; } .time { margin-left:0; font-size:12px; } }
@media (prefers-reduced-motion:reduce) { button { transition:none; } }
</style>
</head>
<body>
<div id="app" v-cloak>
 <header class="topbar" data-pen-id="Jn6DW">
  <div class="brand"><img :src="assets['platform-brand-original-transparent.png']" alt="野小子" width="84" height="60"><span>管理后台</span></div>
  <nav class="global-nav" aria-label="主导航">
   <button v-for="group in navigation" :key="group.name" :class="['nav-group',{active:group.name==='活动',wide:group.name==='内容与设置'}]" @click="toggleMenu($event)" :aria-expanded="menuOpen" aria-controls="all-functions">{{group.name}}<svg-icon name="down"></svg-icon></button>
   <button class="all-features" @click="toggleMenu($event)" :aria-expanded="menuOpen" aria-controls="all-functions"><svg-icon name="grid"></svg-icon>全部功能</button>
  </nav>
  <div class="account"><svg-icon name="user"></svg-icon><span class="account-name">管理员</span><button class="sign-out" data-pen-id="BeA2E" @click="previewAction('退出登录入口；此预览不会清除登录状态。')">退出登录</button></div>
  <div class="mobile-tools"><button class="mobile-preview-trigger" id="mobile-preview-trigger" @click="togglePreview($event)" :aria-expanded="previewOpen">设计预览</button><button class="mobile-menu-trigger" aria-label="全部功能" @click="toggleMenu($event)" :aria-expanded="menuOpen" aria-controls="all-functions"><svg-icon name="grid"></svg-icon></button></div>
 </header>
 <nav class="subnav" aria-label="活动导航" data-pen-id="zrpL7"><button class="active" aria-current="page" @click="resetFilters">活动管理</button><button @click="previewRoute('活动模板')">活动模板</button><button @click="previewRoute('活动订单')">活动订单</button></nav>
 <div class="workspace">
  <aside class="sidebar" data-pen-id="Mnw4g"><h2>活动分类</h2><nav class="category-list" aria-label="活动分类"><button v-for="item in categories" :key="item.value" :class="{active:category===item.value}" :aria-pressed="category===item.value" @click="category=item.value">{{item.label}}</button></nav></aside>
  <main class="main" data-pen-id="mLe3F">
   <div class="page-heading"><h1 data-pen-id="Y88FJD">活动管理</h1><button class="button primary new-activity" data-pen-id="SSYgy" @click="previewAction('新建活动入口；当前仅演示活动管理首页。')">新建活动</button></div>
   <form class="filterbar" aria-label="筛选活动" @submit.prevent="submitSearch">
    <label class="search-field" data-pen-id="dnvn9"><svg-icon name="search"></svg-icon><input id="activity-query" type="search" v-model="queryDraft" placeholder="搜索活动名称" aria-label="搜索活动名称" autocomplete="off"></label>
    <button class="button secondary search-submit" type="submit" data-pen-id="OVL6B">搜索</button>
    <label class="select-field mobile-category"><span class="sr-only">活动分类</span><select v-model="category" aria-label="活动分类"><option v-for="item in categories" :value="item.value">{{item.label}}</option></select><svg-icon name="down"></svg-icon></label>
    <label class="select-field status-select" data-pen-id="cigHZ"><span class="sr-only">活动状态</span><select v-model="status" aria-label="活动状态"><option value="ALL">全部状态</option><option value="DRAFT">草稿</option><option value="PUBLISHED">已发布</option><option value="CANCELLED">已取消</option></select><svg-icon name="down"></svg-icon></label>
    <span class="filter-spacer"></span><button v-if="filtersActive" type="button" class="reset-filters" @click="resetFilters">重置筛选</button>
    <button class="button secondary refresh" type="button" data-pen-id="WK090" @click="refresh"><svg-icon name="refresh"></svg-icon>刷新</button>
   </form>
   <section class="activity-table" role="table" aria-label="活动列表" data-pen-id="QE804" :aria-rowcount="filteredRows.length+1">
    <div class="table-head" role="row"><span v-for="name in ['活动','出发时间','价格','报名名额','状态','操作']" role="columnheader">{{name}}</span></div>
    <div role="rowgroup">
     <article v-for="activity in filteredRows" :key="activity.title" class="activity-row" role="row" :data-title="activity.title">
      <div class="entity" role="cell"><img class="cover" :src="assets[activity.image]" alt="" width="44" height="44"><div class="entity-text"><div class="activity-title">{{activity.title}}</div><div class="entity-meta"><span>{{activity.categoryLabel}}</span><span class="divider"></span><span>{{activity.location}}</span></div></div></div>
      <div class="datetime" role="cell"><span class="mobile-label">出发时间</span><div class="date">{{activity.startAt.split(' ')[0]}}</div><div class="time">{{activity.startAt.split(' ')[1]}}</div></div>
      <div class="price" role="cell"><span class="mobile-label">价格</span>{{activity.priceCents===0?'免费':'¥'+(activity.priceCents/100).toFixed(2)+' / 人'}}</div>
      <div class="capacity-cell" role="cell"><span class="mobile-label">报名名额</span><div class="capacity"><div class="capacity-values"><span>{{activity.registeredCount}} / {{activity.capacity}}</span><span class="pending" v-if="activity.priceCents>0 && activity.pendingPaymentCount>0">待支付 {{activity.pendingPaymentCount}}</span></div><div class="capacity-line" role="progressbar" :aria-label="activity.title+'报名名额'" :aria-valuenow="activity.registeredCount" :aria-valuemax="activity.capacity" aria-valuemin="0" :style="{'--capacity-fill':(activity.registeredCount/activity.capacity*100)+'%'}"><span></span></div></div></div>
      <div class="status-cell" role="cell"><span :class="['status','status-'+activity.status]">{{activity.statusLabel}}</span></div>
      <div class="row-actions" role="cell"><button class="text-action" :aria-label="'编辑'+activity.title" @click="previewAction('编辑「'+activity.title+'」入口；当前未连接后台。')">编辑</button><button class="text-action service-action" @click="previewOrders(activity)">{{activity.priceCents===0?'免费名单':'收费订单'}}</button></div>
     </article>
    </div>
    <div v-if="filteredRows.length===0" class="empty-state" data-pen-id="lemCo"><svg-icon name="search"></svg-icon><h2>没有找到活动</h2><button @click="resetFilters">清除筛选</button></div>
   </section>
   <footer class="pagination" data-pen-id="Dv1y5"><span class="total-count" aria-live="polite">共 {{filteredRows.length}} 条</span><span class="page-spacer"></span><span data-pen-id="BWuPl">8 条 / 页</span><span>第 1 / 1 页</span><button class="button" disabled>上一页</button><button class="button" disabled>下一页</button></footer>
  </main>
 </div>
 <nav v-if="menuOpen" id="all-functions" ref="menu" class="nav-menu" aria-label="全部功能菜单" data-pen-id="o0TzXY">
  <div class="menu-columns"><div v-for="column in menuColumns" class="menu-column"><section v-for="group in column" class="menu-group"><h2>{{group.name}}</h2><button v-for="entry in group.items" :data-route="entry.route" :class="{active:entry.route==='/activities'}" @click="previewRoute(entry.name)">{{entry.name}}</button></section></div></div>
  <div class="menu-mobile-footer"><button @click="previewAction('退出登录入口；此预览不会清除登录状态。');menuOpen=false">退出登录</button></div>
 </nav>
 <div class="preview-dock"><button class="preview-trigger" id="preview-trigger" @click="togglePreview($event)" :aria-expanded="previewOpen" aria-controls="preview-tools"><svg-icon name="grid"></svg-icon>设计预览</button></div>
 <section v-if="previewOpen" id="preview-tools" ref="previewPanel" class="preview-panel" aria-label="设计预览工具"><h2>C 杏黄留白</h2><p>使用示例数据，所有操作仅用于设计演示。</p><button id="preview-publish" @click="openPublish($event)">查看发布确认弹窗</button><button @click="resetFilters();previewOpen=false">重置演示</button></section>
 <dialog ref="publishDialog" aria-labelledby="publish-title" aria-describedby="publish-description" data-pen-id="q3sOy" @close="restoreDialogFocus" @keydown="trapDialogFocus">
  <div class="dialog-head"><h2 id="publish-title">发布这场活动？</h2><button class="dialog-close" aria-label="关闭发布确认" @click="closePublish"><svg-icon name="close"></svg-icon></button></div>
  <p id="publish-description" class="dialog-description">发布后活动将出现在小程序，请再次确认报名价格、时间、地点和人数限制。</p>
  <div class="dialog-actions"><button class="button secondary" ref="cancelPublish" autofocus @click="closePublish">返回检查</button><button class="button primary" @click="confirmPreview">确认发布</button></div>
 </dialog>
 <div class="toast" role="status" aria-live="polite" v-if="feedback">{{feedback}}</div>
</div>
<script id="source-manifest" type="application/json">__MANIFEST__</script>
<script>__VUE__</script>
<script>
const demoRows=__SAMPLES__;
const embeddedAssets=__ASSETS__;
const iconPaths={search:'<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',down:'<path d="m6 9 6 6 6-6"/>',grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',user:'<circle cx="12" cy="12" r="10"/><circle cx="12" cy="10" r="3"/><path d="M7 20v-1a5 5 0 0 1 10 0v1"/>',refresh:'<path d="M3 11a9 9 0 0 1 15.36-6.36L21 7M21 3v4h-4M21 13a9 9 0 0 1-15.36 6.36L3 17M7 17H3v4"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>'};
const navigation=[{name:'运营',items:[{name:'运营工作台',route:'/operations'},{name:'消息管理',route:'/notifications'}]},{name:'活动',items:[{name:'活动管理',route:'/activities'},{name:'活动模板',route:'/templates'},{name:'活动订单',route:'/activity-orders'}]},{name:'商城',items:[{name:'商城管理',route:'/shop'},{name:'商品分类',route:'/shop/categories'},{name:'退款售后',route:'/refunds'},{name:'发货上报',route:'/shipping-reports'}]},{name:'用户',items:[{name:'用户管理',route:'/users'},{name:'会员管理',route:'/memberships'}]},{name:'内容与设置',items:[{name:'文章管理',route:'/articles'},{name:'协议管理',route:'/legal'},{name:'基础配置',route:'/settings'},{name:'管理员账号',route:'/settings/admin-account'}]}];
const app=Vue.createApp({
 components:{SvgIcon:{props:['name'],template:'<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" v-html="paths[name]"></svg>',data:()=>({paths:iconPaths})}},
 data:()=>({assets:embeddedAssets,rows:demoRows,navigation,menuColumns:[[navigation[0],navigation[1],navigation[3]],[navigation[2],navigation[4]]],categories:[{value:'ALL',label:'全部活动'},{value:'WEEKLY',label:'本周活动'},{value:'DOMESTIC',label:'国内游行'},{value:'HOLIDAY',label:'假期活动'},{value:'LEISURE',label:'休闲活动'}],queryDraft:'',query:'',category:'ALL',status:'ALL',menuOpen:false,previewOpen:false,feedback:'',feedbackTimer:null,lastMenuTrigger:null,lastPreviewTrigger:null,lastDialogTrigger:null}),
 computed:{filteredRows(){return this.rows.filter(row=>(!this.query||row.title.toLocaleLowerCase().includes(this.query.toLocaleLowerCase()))&&(this.category==='ALL'||row.category===this.category)&&(this.status==='ALL'||row.status===this.status));},filtersActive(){return this.query!==''||this.category!=='ALL'||this.status!=='ALL';}},
 methods:{
  submitSearch(){this.query=this.queryDraft.trim();},
  resetFilters(){this.queryDraft='';this.query='';this.category='ALL';this.status='ALL';},
  refresh(){this.rows=[...demoRows];this.previewAction('已重新载入示例列表；未请求真实后台。');},
  previewAction(message){clearTimeout(this.feedbackTimer);this.feedback='设计预览：'+message;this.feedbackTimer=setTimeout(()=>{this.feedback='';},5000);},
  previewRoute(name){this.menuOpen=false;if(name==='活动管理'){this.resetFilters();return;}this.previewAction('「'+name+'」入口，当前尚未制作此页面。');},
  previewOrders(activity){this.previewAction('「'+activity.title+'」的'+(activity.priceCents===0?'免费名单':'收费订单')+'入口；未连接真实报名数据。');},
  toggleMenu(event){this.previewOpen=false;this.menuOpen=!this.menuOpen;this.lastMenuTrigger=event.currentTarget;},
  togglePreview(event){this.menuOpen=false;this.previewOpen=!this.previewOpen;this.lastPreviewTrigger=event.currentTarget;},
  openPublish(event){this.lastDialogTrigger=event.currentTarget;this.$refs.publishDialog.showModal();this.$nextTick(()=>this.$refs.cancelPublish.focus());},
  closePublish(){this.$refs.publishDialog.close();},
  trapDialogFocus(event){if(event.key!=='Tab')return;const buttons=[...this.$refs.publishDialog.querySelectorAll('button:not([disabled])')];const first=buttons[0],last=buttons[buttons.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}},
  restoreDialogFocus(){this.$nextTick(()=>this.lastDialogTrigger?.focus());},
  confirmPreview(){this.closePublish();this.previewAction('已演示确认操作；没有发布活动。');},
  handleDocumentClick(event){if(this.$refs.publishDialog.open)return;if(this.menuOpen&&!this.$refs.menu?.contains(event.target)&&!this.lastMenuTrigger?.contains(event.target))this.menuOpen=false;if(this.previewOpen&&!this.$refs.previewPanel?.contains(event.target)&&!this.lastPreviewTrigger?.contains(event.target))this.previewOpen=false;},
  handleEscape(event){if(event.key!=='Escape'||this.$refs.publishDialog.open)return;if(this.menuOpen){this.menuOpen=false;this.lastMenuTrigger?.focus();}else if(this.previewOpen){this.previewOpen=false;this.lastPreviewTrigger?.focus();}}
 },
 mounted(){document.addEventListener('click',this.handleDocumentClick);document.addEventListener('keydown',this.handleEscape);window.__C_PREVIEW__={rows:demoRows,pageSize:8,readbackSha256:'__READBACK_SHA__',vueVersion:Vue.version};}
});
app.mount('#app');
</script>
</body>
</html>`;
const html = template.replace('__TOKENS__', () => tokens).replace('__MANIFEST__', () => JSON.stringify(mapping)).replace('__VUE__', () => vue).replace('__SAMPLES__', () => JSON.stringify(samples)).replace('__ASSETS__', () => JSON.stringify(assets)).replace('__READBACK_SHA__', () => readbackSha);
const output = path.join(project, 'design-demos/dir-3.html');
fs.writeFileSync(output, html, 'utf8');
fs.writeFileSync(path.join(__dirname, 'design-mapping-C.json'), JSON.stringify(mapping, null, 2));
console.log(JSON.stringify({output,bytes:Buffer.byteLength(html),readbackSha256:readbackSha,rows:samples.length,assets:assetNames.length,vue:'3.5.44'},null,2));
