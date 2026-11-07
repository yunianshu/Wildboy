const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
let context, modules, definition, storage, requests, renders, queries, updates, nativeLeft, viewportWidth, contentWidth, queryFailure;
const slots = { all:[0,52], WEEKLY:[60,80], DOMESTIC:[148,80], HOLIDAY:[236,80], LEISURE:[324,80] };
function source(relative) {
 const filename=path.resolve(__dirname,'../src',relative);if(modules.has(filename))return modules.get(filename).exports;
 const module={exports:{}};modules.set(filename,module);
 const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText;
 const loader=request=>{
  for(const [suffix,file] of [['/domain','domain'],['/filter-scroll','filter-scroll'],['/capsule-header','capsule-header']])if(request.endsWith(suffix))return source('utils/'+file+'.ts');
  if(request.endsWith('/page-motion'))return {enterPage(){}};if(request.endsWith('/tab-bar'))return {syncTabBar(){}};
  if(request.endsWith('/api'))return {request:async url=>{requests.push(url);return {items:[],page:0,hasMore:false}},mediaUrl:x=>x};return {};
 };
 vm.runInContext(`(function(require,module,exports){${code}\n})`,context,{filename})(loader,module,module.exports);return module.exports;
}
function page(){source('pages/activities/index.ts');return {...definition,data:structuredClone(definition.data),setData(update,callback){updates.push(update);Object.assign(this.data,update);renders.push(()=>{if('filterScrollLeft'in update)nativeLeft=update.filterScrollLeft;callback?.()})}}}
const event=code=>({currentTarget:{dataset:{code}}});
function rendered(){while(renders.length)renders.shift()()}
function measured(query,override){const slot=slots[query.selected];query.done(override||[{left:16,width:viewportWidth},slot?{left:16+slot[0]-nativeLeft,width:slot[1]}:null,{left:16-nativeLeft,width:contentWidth}])}
function positioned(){rendered();while(queries.length){measured(queries.shift());rendered()}}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const offsetUpdates=start=>updates.slice(start).filter(x=>'filterScrollLeft'in x).map(x=>x.filterScrollLeft);
beforeEach(()=>{modules=new Map();storage='';requests=[];renders=[];queries=[];updates=[];nativeLeft=0;viewportWidth=358;contentWidth=404;queryFailure=false;
 context=vm.createContext({Page:d=>{definition=d},wx:{getStorageSync:()=>storage,removeStorageSync(){storage=''},createSelectorQuery(){if(queryFailure)throw Error('native query unavailable');const q={in(){return q},select(s){if(s.startsWith('#activity-category-'))q.selected=s.slice('#activity-category-'.length);return q},boundingClientRect(){return q},scrollOffset(){throw Error('raw offset is not a visual-frame measurement')},exec(done){q.done=done;queries.push(q)}};return q}}})
});
test('measured 404px strip reverses through middle categories rather than staying at its 46px end',async()=>{
 const p=page();p.onShow();positioned();assert.equal(nativeLeft,0);
 for(const [code,target]of [['LEISURE',46],['HOLIDAY',46],['DOMESTIC',9],['WEEKLY',0],['',0]]){p.select(event(code));positioned();assert.equal(nativeLeft,target,code||'All')}
 await settle();assert.equal(requests.length,6);
});
test('geometry uses track-relative content coordinates, clamps both edges, and supports wider viewports',()=>{
 const {centeredFilterScroll:center}=source('utils/filter-scroll.ts'),v={left:16,width:300};
 assert.equal(center(v,{left:94,width:80},{left:-54,width:404}).target,38);
 assert.equal(center(v,{left:-54,width:52},{left:-54,width:404}).target,0);
 assert.equal(center(v,{left:270,width:80},{left:-54,width:404}).target,104);
 assert.equal(center({left:16,width:468},{left:340,width:80},{left:16,width:404}).target,0);
});
test('missing, invalid or inconsistent native measurements never invent an offset',()=>{
 const {centeredFilterScroll:center}=source('utils/filter-scroll.ts'),g=[{left:16,width:358},{left:164,width:80},{left:16,width:404}];
 for(const bad of [null,undefined,{}, {left:NaN,width:44},{left:16,width:0},{left:Infinity,width:80},{left:16,width:-1}]){assert.equal(center(bad,g[1],g[2]),null);assert.equal(center(g[0],bad,g[2]),null)}
 for(const bad of [null,{}, {left:NaN,width:404},{left:16,width:Infinity},{left:16,width:0},{left:16,width:70}])assert.equal(center(g[0],g[1],bad),null);
 assert.equal(center(g[0],{left:0,width:80},g[2]),null);
 assert.equal(center(g[0],{left:400,width:80},g[2]),null);
});
test('captured animation-frame rects keep the middle target stable despite stale raw offset and inflated scrollWidth',()=>{
 const p=page();p.onShow();positioned();p.select(event('LEISURE'));positioned();assert.equal(p.data.filterScrollLeft,46);
 p.select(event('DOMESTIC'));rendered();const start=updates.length;
 measured(queries.shift(),[{left:16,width:358},{left:154.99998474121094,width:80},{left:6.99998474121094,width:404,scrollLeft:46,scrollWidth:441}]);rendered();
 assert.equal(p.data.filterScrollLeft,9);assert.deepEqual(offsetUpdates(start),[9]);assert.equal(nativeLeft,9);
});
test('repeated animated target uses visual position rather than stale offset and stops restarting once centered',async()=>{
 const p=page();p.onShow();positioned();p.select(event('DOMESTIC'));positioned();await settle();const count=requests.length;
 p.select(event('DOMESTIC'));rendered();let start=updates.length;
 measured(queries.shift(),[{left:16,width:358},{left:149.22,width:80},{left:1.22,width:404,scrollLeft:46,scrollWidth:435}]);rendered();
 const sequence=offsetUpdates(start);assert.ok(Math.abs(sequence[0]-14.78)<0.001);assert.equal(sequence[1],9);
 nativeLeft=9.00002;start=updates.length;p.select(event('DOMESTIC'));positioned();assert.deepEqual(offsetUpdates(start),[]);assert.equal(requests.length,count);
});
test('Explore category and All are consumed before measuring the selected item',async()=>{
 const p=page();storage='DOMESTIC';p.onShow();positioned();assert.equal(p.data.selected,'DOMESTIC');assert.equal(storage,'');assert.equal(nativeLeft,9);assert.ok(requests[0].endsWith('&category=DOMESTIC'));
 p.onHide();storage='ALL';p.onShow();positioned();await settle();assert.equal(p.data.selected,'');assert.equal(nativeLeft,0);assert.equal(requests[1],'/activities?page=0&size=10');
});
test('same item after a manual drag commits measured current then target without HTTP',async()=>{
 const p=page();p.onShow();positioned();p.select(event('DOMESTIC'));positioned();await settle();assert.equal(p.data.filterScrollLeft,9);nativeLeft=0;
 const count=requests.length,start=updates.length;p.select(event('DOMESTIC'));positioned();assert.equal(nativeLeft,9);assert.deepEqual(offsetUpdates(start),[0,9]);assert.equal(requests.length,count);
});
test('late query cannot move the strip to a previous selection',async()=>{
 const p=page();p.onShow();positioned();p.select(event('LEISURE'));rendered();const old=queries.shift();p.select(event('DOMESTIC'));rendered();const current=queries.shift();
 measured(current);rendered();assert.equal(nativeLeft,9);const start=updates.length;measured(old);rendered();assert.equal(nativeLeft,9);assert.deepEqual(offsetUpdates(start),[]);await settle();
});
test('out-of-order renderer callbacks cannot issue an old query or second-stage target',()=>{
 const p=page();p.onShow();positioned();p.select(event('LEISURE'));const oldSelection=renders.shift();p.select(event('DOMESTIC'));oldSelection();positioned();assert.equal(nativeLeft,9);
 nativeLeft=0;p.select(event('DOMESTIC'));rendered();measured(queries.shift());const oldPosition=renders.shift();p.select(event('WEEKLY'));oldPosition();positioned();assert.equal(nativeLeft,0);assert.equal(p.data.selected,'WEEKLY');
});
test('touch invalidates pending queries and second-stage callbacks without selecting or fetching',async()=>{
 const p=page();p.onShow();positioned();p.select(event('LEISURE'));rendered();const q=queries.shift(),count=requests.length,start=updates.length;
 p.onFilterTouchStart();nativeLeft=20;measured(q);rendered();assert.equal(nativeLeft,20);assert.deepEqual(offsetUpdates(start),[]);assert.equal(p.data.selected,'LEISURE');assert.equal(requests.length,count);
 p.select(event('DOMESTIC'));positioned();nativeLeft=20;p.revealSelectedFilter();rendered();measured(queries.shift());const pending=renders.shift();p.onFilterTouchStart();const before=updates.length;pending();assert.deepEqual(offsetUpdates(before),[]);await settle();
});
test('hide and unload invalidate queries while hidden selections cannot fetch',async()=>{
 for(const leave of ['onHide','onUnload']){const p=page();p.onShow();positioned();p.select(event('LEISURE'));rendered();const q=queries.shift(),start=updates.length,count=requests.length;p[leave]();measured(q);p.select(event('HOLIDAY'));rendered();assert.deepEqual(offsetUpdates(start),[]);assert.equal(requests.length,count)}await settle();
});
test('a pre-hide query cannot override the category restored on the next show',async()=>{
 const p=page();p.onShow();positioned();p.select(event('LEISURE'));rendered();const old=queries.shift();p.onHide();storage='DOMESTIC';p.onShow();positioned();measured(old);rendered();await settle();assert.equal(p.data.selected,'DOMESTIC');assert.equal(nativeLeft,9);
});
test('resize invalidates old geometry, remeasures and never reloads activities',async()=>{
 const p=page();p.onShow();positioned();p.select(event('LEISURE'));positioned();p.revealSelectedFilter();rendered();const old=queries.shift(),count=requests.length;
 viewportWidth=468;p.onResize();measured(old);positioned();assert.equal(nativeLeft,0);assert.equal(requests.length,count);p.onHide();const start=updates.length;p.onResize();positioned();assert.deepEqual(offsetUpdates(start),[]);assert.equal(requests.length,count);await settle();
});
test('a touch during pending resize prevents delayed repositioning',()=>{
 const p=page();p.onShow();positioned();p.onResize();p.onFilterTouchStart();nativeLeft=23;positioned();assert.equal(nativeLeft,23);assert.equal(queries.length,0);
});
test('empty or unavailable queries do not move or fetch and positioning can recover',async()=>{
 const p=page();p.onShow();positioned();nativeLeft=20;const count=requests.length,start=updates.length;p.revealSelectedFilter();rendered();measured(queries.shift(),[null,null,null]);rendered();assert.equal(nativeLeft,20);assert.deepEqual(offsetUpdates(start),[]);
 queryFailure=true;p.revealSelectedFilter();positioned();assert.equal(nativeLeft,20);assert.equal(requests.length,count);queryFailure=false;p.revealSelectedFilter();positioned();assert.equal(nativeLeft,0);assert.equal(requests.length,count);await settle();
});
test('invalid category does not reposition or fetch',async()=>{
 const p=page();p.onShow();positioned();await settle();const count=requests.length,start=updates.length;for(const code of ['NOT_A_CATEGORY','LEISURE?x=1','__proto__'])p.select(event(code));positioned();assert.equal(p.data.selected,'');assert.deepEqual(offsetUpdates(start),[]);assert.equal(requests.length,count);
});
