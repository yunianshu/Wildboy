const {test,beforeEach,afterEach}=require('node:test'),assert=require('node:assert/strict');
const api=require('../dist/utils/api.js'),prices=require('../dist/utils/product-prices.js'),home=require('../dist/utils/home.js');
let definition,calls,nav,handler,now;const actualNow=Date.now;global.Page=d=>{definition=d};
const cats=[{id:'c1',name:'徒步装备',sortOrder:1,version:0},{id:'c2',name:'露营用品',sortOrder:2,version:0}];
const product=(id,categoryId='c1')=>({id,name:'真实装备 '+id,description:'商品说明',imageUrl:'/assets/equipment.jpg',priceCents:1299,originalPriceCents:1699,stock:3,status:'ON_SALE',version:0,categoryId,categoryName:cats.find(c=>c.id===categoryId)?.name||'未分类'});
function page(name='shop'){const f=require.resolve('../dist/pages/'+name+'/index.js');delete require.cache[f];require(f);return {...definition,data:structuredClone(definition.data),updates:[],setData(v,done){this.updates.push(v);Object.assign(this.data,v);done?.()}}}
const flush=()=>new Promise(r=>setImmediate(r)),event=id=>({currentTarget:{dataset:{id}}});
beforeEach(()=>{calls=[];nav=[];now=0;Date.now=()=>now;global.wx={getStorageSync:()=>undefined,navigateTo:o=>nav.push(o.url),stopPullDownRefresh(){}};handler=async url=>url==='/shop/categories'?cats:[product(url.includes('c2')?'p2':url.includes('c1')?'p1':'all',url.includes('c2')?'c2':'c1')];api.request=async url=>{calls.push(url);return handler(url)}});
afterEach(()=>{Date.now=actualNow});
test('first catalog and independent public categories each request once and retain real IDs and prices',async()=>{
 const p=page();p.onShow();await Promise.all([p._flight,p._categoryFlight]);assert.deepEqual(calls.sort(),['/shop/categories','/shop/products']);assert.equal(p.data.categories.length,2);assert.equal(p.data.items[0].id,'all');assert.equal(p.data.items[0].priceText,'¥12.99');assert.equal(p.data.items[0].originalPriceText,'¥16.99');
});
test('a late other-category result cannot replace current rows but is reused when returning to its cache',async()=>{
 const p=page();p.onShow();await Promise.all([p._flight,p._categoryFlight]);let finishA;handler=url=>url.includes('c1')?new Promise(r=>finishA=r):Promise.resolve([product('B','c2')]);
 p.selectCategory(event('c1'));const first=p._flight;await flush();p.selectCategory(event('c2'));await p._flight;assert.equal(p.data.items[0].id,'B');finishA([product('A')]);await first;assert.equal(p.data.items[0].id,'B');const count=calls.length;p.selectCategory(event('c1'));await flush();assert.equal(p.data.items[0].id,'A');assert.equal(calls.length,count);
});
test('concurrent refreshes and A-B-A switching share the original per-category flight',async()=>{
 const p=page();p._visible=true;p.setData({categories:cats});const finishes={};handler=url=>new Promise(r=>finishes[url]=r);
 p.selectCategory(event('c1'));const a=p._flight;assert.equal(p.load(true),a);await flush();p.selectCategory(event('c2'));const b=p._flight;await flush();p.selectCategory(event('c1'));assert.equal(p._flight,a);assert.equal(p.retry(),a);assert.equal(calls.length,2);finishes['/shop/products?categoryId=c2']([product('B','c2')]);await b;assert.equal(p.data.selectedCategory,'c1');assert.equal(p.data.items.length,0);finishes['/shop/products?categoryId=c1']([product('A')]);await a;assert.equal(p.data.items[0].id,'A');
});
test('TTL is independent per category and expired refresh preserves the selected category cards and navigation',async()=>{
 const p=page();p.onShow();await Promise.all([p._flight,p._categoryFlight]);p.selectCategory(event('c1'));await p._flight;now=3000;p.selectCategory(event('c2'));await p._flight;now=30000;let finish;handler=()=>new Promise(r=>finish=r);p.selectCategory(event('c1'));assert.equal(p.data.loaded,true);assert.equal(p.data.refreshing,true);p.open(event('p1'));assert.equal(nav[0],'/pages/product/index?id=p1');await flush();finish([product('fresh')]);await p._flight;const count=calls.length;p.selectCategory(event('c2'));assert.equal(p.data.items[0].id,'p2');assert.equal(calls.length,count);
});
test('category loading failure leaves all products usable and retries categories without reloading products',async()=>{
 const p=page();handler=async url=>{if(url==='/shop/categories')throw Error('分类暂不可用');return[product('all')]};p.onShow();await Promise.all([p._flight,p._categoryFlight]);assert.equal(p.data.loaded,true);assert.equal(p.data.categoriesError,'分类暂不可用');const count=calls.filter(x=>x==='/shop/products').length;handler=async()=>cats;await p.retryCategories();assert.equal(p.data.categoriesError,'');assert.equal(calls.filter(x=>x==='/shop/products').length,count);
});
test('empty selected-category results are cached and a failed refresh retains only that category with recovery',async()=>{
 const p=page();p._visible=true;p.setData({categories:cats});handler=async()=>[];p.selectCategory(event('c1'));await p._flight;assert.equal(p.data.loaded,true);assert.deepEqual(p.data.items,[]);const count=calls.length;p.selectCategory(event('c1'));assert.equal(calls.length,count);handler=async()=>{throw Error('更新失败')};await p.retry();assert.equal(p.data.loaded,true);assert.deepEqual(p.data.items,[]);assert.equal(p.data.error,'更新失败');handler=async()=>[product('recovered')];await p.retry();assert.equal(p.data.items[0].id,'recovered');assert.equal(p.data.error,'');
});
test('unload blocks late category and catalog results and new instances have independent caches',async()=>{
 const finish={};handler=url=>new Promise(r=>finish[url]=r);const p=page();p.onShow();await flush();p.onUnload();const count=p.updates.length;finish['/shop/categories'](cats);finish['/shop/products']([product('late')]);await flush();assert.equal(p.updates.length,count);const fresh=page();assert.equal(fresh._catalogs,undefined);assert.equal(fresh.data.categoriesLoaded,false);
});
test('unknown category selection cannot request an API and the selected category does not refetch',async()=>{
 const p=page();p.onShow();await Promise.all([p._flight,p._categoryFlight]);const count=calls.length;p.selectCategory(event('../bad'));p.selectCategory(event('unlisted'));p.selectCategory(event(''));assert.equal(calls.length,count);assert.equal(p.data.selectedCategory,'');
});
test('original price is only displayed for a valid genuine discount, never derived from labels',()=>{
 assert.equal(prices.originalPriceText(1299,1699),'¥16.99');for(const original of [undefined,null,1299,1200,0,-1,1699.1,NaN,Infinity,100000001])assert.equal(prices.originalPriceText(1299,original),'');assert.equal(prices.originalPriceText(undefined,1699),'');
 const base={id:'real',name:'商品',priceLabel:'¥12.99',priceCents:1299,originalPriceCents:1699};const slots=home.homeEquipmentSlots([base]);assert.equal(slots[0].id,'real');assert.equal(slots[0].priceLabel,'¥12.99');assert.equal(slots[0].originalPriceText,'¥16.99');assert.equal(home.homeEquipmentSlots([{id:'legacy',priceLabel:'¥12.99'}])[0].originalPriceText,undefined);
});
test('product quantity and checkout navigation use current price while the higher original stays display-only',async()=>{
 const p=page('product');p.setData({id:'p1'});handler=async()=>product('p1');await p.load();assert.equal(p.data.originalPriceText,'¥16.99');p.changeQuantity({currentTarget:{dataset:{delta:1}}});assert.equal(p.data.totalText,'¥25.98');p.buy();assert.equal(nav[0],'/pages/checkout/index?id=p1&quantity=2');
});

test('product quantity respects the 99-item limit before checkout so the quantity and total do not change across pages', async () => {
 const p=page('product');p.setData({id:'p1'});handler=async()=>({...product('p1'),stock:150});await p.load();
 for(let count=0;count<100;count++)p.changeQuantity({currentTarget:{dataset:{delta:1}}});
 assert.equal(p.data.quantity,99);assert.equal(p.data.totalText,prices.priceText(1299*99));
 p.buy();const target=new URL(nav.at(-1),'https://local.test');
 const checkout=page('checkout');checkout.load=async()=>{};
 checkout.onLoad(Object.fromEntries(target.searchParams));
 assert.equal(checkout.data.quantity,p.data.quantity);
 p.changeQuantity({currentTarget:{dataset:{delta:-1}}});assert.equal(p.data.quantity,98);
 p.setData({quantity:1,product:{...p.data.product,stock:2}});
 p.changeQuantity({currentTarget:{dataset:{delta:1}}});p.changeQuantity({currentTarget:{dataset:{delta:1}}});
 assert.equal(p.data.quantity,2);
});
test('category metadata retry is deduplicated and forced refresh never discards the active catalog',async()=>{
 const p=page();await p.load();let finish;handler=url=>url==='/shop/categories'?new Promise(r=>finish=r):Promise.resolve([product('all')]);const first=p.loadCategories(true);assert.equal(p.retryCategories(),first);assert.equal(p.loadCategories(),first);await flush();assert.equal(p.data.items[0].id,'all');finish(cats);await first;const count=calls.filter(x=>x==='/shop/products').length;now=1000;await p.loadCategories();assert.equal(calls.filter(x=>x==='/shop/categories').length,1);assert.equal(calls.filter(x=>x==='/shop/products').length,count);
});
test('shop track positioning rejects stale category queries and touch starts while same-category reselect restores a manual move',async()=>{
 const p=page();p._visible=true;p.setData({categories:[...cats,{id:'c3',name:'三',version:0,sortOrder:3},{id:'c4',name:'四',version:0,sortOrder:4}]});const queries=[];
 wx.createSelectorQuery=()=>{const q={in(){return q},select(s){if(s.startsWith('#shop-category-'))q.target=s;return q},boundingClientRect(){return q},exec(done){q.done=done;queries.push(q)}};return q};
 p.selectCategory(event('c4'));const old=queries.shift();p.selectCategory(event('c2'));const current=queries.shift();current.done([{left:16,width:358},{left:164,width:80},{left:16,width:404}]);assert.equal(p.data.categoryScrollLeft,9);old.done([{left:16,width:358},{left:340,width:80},{left:16,width:404}]);assert.equal(p.data.categoryScrollLeft,9);
 await p._flight;await flush();const count=calls.length,start=p.updates.length;p.selectCategory(event('c2'));queries.shift().done([{left:16,width:358},{left:164,width:80},{left:16,width:404}]);assert.equal(p.data.categoryScrollLeft,9);assert.equal(calls.length,count);assert.deepEqual(p.updates.slice(start).filter(x=>'categoryScrollLeft'in x).map(x=>x.categoryScrollLeft),[0,9]);
 p.revealSelectedCategory();const pending=queries.shift();p.onCategoryTouchStart();pending.done([{left:16,width:300},{left:164,width:80},{left:16,width:404}]);assert.equal(p.data.categoryScrollLeft,9);
});
test('returning to a category with an active background refresh keeps its cards and compact refresh state',async()=>{
 const p=page();p.onShow();await Promise.all([p._flight,p._categoryFlight]);p.selectCategory(event('c1'));await p._flight;p.selectCategory(event('c2'));await p._flight;now=30000;let finish;handler=url=>url.includes('c1')?new Promise(r=>finish=r):Promise.resolve([product('B','c2')]);p.selectCategory(event('c1'));const a=p._flight;await flush();p.selectCategory(event('c2'));await p._flight;p.selectCategory(event('c1'));assert.equal(p._flight,a);assert.equal(p.data.loaded,true);assert.equal(p.data.loading,false);assert.equal(p.data.refreshing,true);assert.equal(p.data.items[0].id,'p1');finish([product('fresh')]);await a;assert.equal(p.data.refreshing,false);assert.equal(p.data.items[0].id,'fresh');
});

test('returning within the category TTL does not prevent later expiry or forced refresh', async () => {
 const p=page();p.onShow();await Promise.all([p._flight,p._categoryFlight]);
 now=1000;p.onHide();p.onShow();await Promise.all([p._flight,p._categoryFlight]);
 assert.equal(p._categoryFlight,undefined);
 const updated=[{...cats[0],name:'更新后的分类'}];
 handler=async url=>url==='/shop/categories'?updated:[product('fresh')];
 now=31000;p.onHide();p.onShow();await Promise.all([p._flight,p._categoryFlight]);
 assert.deepEqual(p.data.categories,updated);
 assert.equal(calls.filter(url=>url==='/shop/categories').length,2);
 await p.retryCategories();
 assert.equal(calls.filter(url=>url==='/shop/categories').length,3);
});

test('late failure from a previous category cannot end the current loading state or add an error', async () => {
 const p=page();p._visible=true;p.setData({categories:cats});let rejectA,finishB;
 handler=url=>url.includes('c1')?new Promise((_,reject)=>rejectA=reject):new Promise(resolve=>finishB=resolve);
 p.selectCategory(event('c1'));const a=p._flight;
 p.selectCategory(event('c2'));const b=p._flight;
 rejectA(Error('旧分类请求失败'));await a;
 assert.equal(p.data.loading,true);assert.equal(p.data.error,'');
 finishB([product('B','c2')]);await b;
 assert.equal(p.data.items[0].id,'B');assert.equal(p.data.error,'');
});

test('a selected category missing from a refreshed response restores all products without a category bar', async () => {
 const p=page();p._visible=true;p.setData({categories:cats});
 p.selectCategory(event('c1'));await p._flight;
 handler=async url=>url==='/shop/categories'?[]:[product('uncategorized')];
 await p.retryCategories();await p._flight;
 assert.deepEqual(p.data.categories,[]);assert.equal(p.data.selectedCategory,'all');
 assert.equal(p.data.items[0].id,'uncategorized');assert.equal(calls.at(-1),'/shop/products');
});
