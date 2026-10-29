/* Local isolated admin UI acceptance, with a real local API behind Vite proxy.
   Run NODE_PATH as needed if Playwright is installed outside this package.
   Requires dev build with VITE_ENABLE_DEV_LOGIN=true and backend dev profile.
*/
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.ADMIN_URL||'http://127.0.0.1:5173');
 await page.getByRole('button',{name:'开发环境 · 演示登录'}).click();
 await page.getByRole('link',{name:'＋ 新建活动'}).waitFor();
 await page.getByRole('link',{name:'＋ 新建活动'}).click();
 const name='浏览器验收 '+Date.now();
 await page.getByLabel('活动标题').fill(name);
 await page.getByLabel('活动摘要').fill('仅用于隔离环境端到端验证');
 await page.getByLabel('封面图片地址').fill('/assets/category-weekly.jpg');
 const base=new Date(Date.now()+14*86400000);
 const format=d=>d.toISOString().slice(0,16);
 await page.getByLabel('开始时间',{exact:false}).fill(format(base));
 await page.getByLabel('结束时间',{exact:false}).fill(format(new Date(+base+3600000)));
 await page.getByLabel('报名截止时间',{exact:false}).fill(format(new Date(+base-86400000)));
 await page.getByLabel('活动目的地').fill('厦门测试山径');
 await page.getByLabel('具体集合地点').fill('测试入口');
 await page.getByLabel('活动说明（纯文本）').fill('测试行程与安全说明。不是实际可报名活动。');
 await page.getByRole('button',{name:'保存草稿',exact:true}).click();
 await page.getByRole('button',{name:'发布活动 ↗',exact:true}).waitFor();
 assert.match(page.url(),/\/activities\/[^/]+\/edit/);
 await page.getByRole('button',{name:'发布活动 ↗',exact:true}).click();
 await page.getByRole('dialog').waitFor();
 await page.getByRole('button',{name:'返回检查',exact:true}).click();
 await page.getByRole('dialog').waitFor({state:'detached'});
 await page.getByRole('button',{name:'发布活动 ↗',exact:true}).click();
 await page.getByRole('button',{name:'确认发布',exact:true}).click();
 await page.getByText('活动已发布，用户现在可以报名。',{exact:true}).waitFor();
 await page.getByLabel('活动标题').fill(name+' edited');
 await page.getByRole('button',{name:'保存修改',exact:true}).click();
 await page.getByText('已保存。未发布的草稿不会展示给用户。',{exact:true}).waitFor();
 await page.getByRole('button',{name:'取消活动',exact:true}).click();
 await page.getByRole('button',{name:'确认取消活动',exact:true}).click();
 await page.getByText('活动已取消，停止接受新报名。',{exact:true}).waitFor();
 await page.getByRole('link',{name:'← 返回活动目录',exact:true}).click();
 await page.getByRole('textbox',{name:'搜索标题',exact:true}).fill(name);
 await page.getByRole('button',{name:'筛选当前页',exact:true}).click();
 await page.getByRole('link',{name:name+' edited',exact:true}).waitFor();
 await page.screenshot({path:'/tmp/wildboy-admin-acceptance.png',fullPage:true});
 assert.deepEqual(errors,[]);
 await browser.close();
 console.log('PASS real browser login/create/edit/publish/cancel-dialog/cancel/filter flow; no page errors');
})().catch(e=>{console.error(e);process.exit(1)});
