const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const base=__dirname;
const readbackPath=path.join(base,'design-readback-A.json');
const readbackBytes=fs.readFileSync(readbackPath);
const readback=JSON.parse(readbackBytes);
const lucide=require('C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1112-611-0_26.1112.611.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules/lucide');
const nodes=[];
function walk(n){nodes.push(n);(n.children||[]).forEach(walk);}
walk(readback.resolved.n2cQ6B);
const assetRoot=path.resolve(base,'../../../miniprogram/src/assets');
function inlineAsset(p){const ext=path.extname(p).slice(1);return 'data:'+(ext==='png'?'image/png':ext==='woff2'?'font/woff2':'image/jpeg')+';base64,'+fs.readFileSync(p).toString('base64');}
const rows=nodes.filter(n=>n.metadata?.type==='activity-row').map(n=>{const image=n.children[0].children.find(c=>c.fill?.type==='image');return {id:n.id,...n.metadata,cover:inlineAsset(path.join(assetRoot,path.basename(image.fill.url)))};});
const nav=nodes.filter(n=>n.metadata?.type==='navigation').map(n=>({id:n.id,label:n.name.replace('导航 / ',''),route:n.metadata.route,icon:n.children[0].icon}));
const iconNames=[...new Set([...nodes.filter(n=>n.type==='icon').map(n=>n.icon),'menu','search-x','x','chevron-left','chevron-right'])];
const xml=s=>String(s).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
function icon(name){const key=name.split('-').map(x=>x[0].toUpperCase()+x.slice(1)).join('');const paths=lucide.icons[key];if(!paths)throw new Error('Missing Lucide icon '+name);return '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paths.map(([tag,attrs])=>'<'+tag+' '+Object.entries(attrs).map(([k,v])=>k+'="'+xml(v)+'"').join(' ')+'/>').join('')+'</svg>';}
const icons=Object.fromEntries(iconNames.map(name=>[name,icon(name)]));
const tokens=Object.entries(readback.variables).map(([k,v])=>'--'+k+':'+(v.type==='string'?'"'+v.value+'"':v.type==='number'?v.value+'px':v.value)).join(';');
let html=fs.readFileSync(path.join(base,'source-A.html'),'utf8');
html=html.replace('__TOKENS__',tokens).replace('__FONT__',inlineAsset(path.join(base,'assets-A','noto-sans-sc.woff2'))).replaceAll('__LOGO__',inlineAsset(path.join(assetRoot,'platform-brand-original-transparent.png'))).replace('__DATA__',JSON.stringify(rows)).replace('__NAV__',JSON.stringify(nav)).replace('__ICONS__',JSON.stringify(icons)).replace(/__ICON_([a-z-]+)__/g,(_,name)=>icons[name]||icon(name));
if(/__[A-Z][A-Z_-]+__/.test(html))throw new Error('Unresolved template token');
const output=path.join(base,'design-demos','dir-1.html');fs.writeFileSync(output,html);
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const mapping={direction:'A 晨光绿白',readbackSHA256:sha(readbackBytes),htmlSHA256:sha(html),sourceRoots:readback.roots,output,framework:'Standalone semantic HTML/CSS/JavaScript preview; production Vue untouched',variables:Object.keys(readback.variables),navigation:nav,rows:rows.map(({cover,...r})=>r),mapping:{cSgya:'.sidebar',L2MKvv:'.workspace',hyUXL:'.page-header',KZzrz:'.filters',JnD9P:'.activity-table',GlzVc:'.pager',GCIUe:'#feedbackDialog (publish mode)',lBpug:'#emptyState',AYzxR:'.btn.primary',gHFFL:'.btn',uimmZ:'.search-field',ZJcSD:'.select-field'},responsive:'At <=1199px, sidebar becomes a drawer and table records become a responsive data grid; 375px uses one column.',assets:'Logo, route covers, subset Noto Sans SC and Lucide icons are embedded; no runtime network required.'};
fs.writeFileSync(path.join(base,'design-mapping-A.json'),JSON.stringify(mapping,null,2)+'\n');
console.log(JSON.stringify({output,bytes:Buffer.byteLength(html),sha256:mapping.htmlSHA256,readbackSHA256:mapping.readbackSHA256,rows:rows.length,nav:nav.length}));
