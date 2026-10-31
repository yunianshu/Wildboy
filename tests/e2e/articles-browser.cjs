/* Production admin artifact + isolated local API article acceptance.
   Serve admin/dist locally; set ADMIN_URL, ARTICLE_API_URL and fixture-only
   TEST_ADMIN_USERNAME / TEST_ADMIN_PASSWORD. Never target production data. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const origin = process.env.ADMIN_URL || 'http://127.0.0.1:5190';
  const api = process.env.ARTICLE_API_URL || 'http://127.0.0.1:8080';
  for (const url of [origin, api]) assert.ok(['127.0.0.1', 'localhost'].includes(new URL(url).hostname), 'isolated local servers only');
  assert.ok(process.env.TEST_ADMIN_USERNAME && process.env.TEST_ADMIN_PASSWORD, 'fixture-only admin credentials required');
  const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',headless:true});
  const page = await browser.newPage({viewport:{width:1440,height:1000}});
  const errors = []; page.on('pageerror',e => errors.push(e.message));
  try {
    await page.route('**/api/v1/**', async route => {
      const url = new URL(route.request().url());
      const response = await route.fetch({url: api + url.pathname + url.search});
      await route.fulfill({response});
    });
    await page.goto(origin);
    await page.getByLabel('管理员账号').fill(process.env.TEST_ADMIN_USERNAME);
    await page.getByLabel('登录密码').fill(process.env.TEST_ADMIN_PASSWORD);
    await page.getByRole('button',{name:'进入工作台 →'}).click();
    await page.getByRole('link',{name:'文章管理'}).click();
    const title = '隔离浏览器文章验收 ' + Date.now();
    await page.getByRole('button',{name:'新建文章',exact:true}).click();
    await page.getByLabel('文章标题').fill(title);
    await page.getByLabel('文章摘要').fill('只用于本地自动化测试，不是真实发布内容。');
    await page.getByLabel('文章封面').fill('/assets/category-weekly.jpg');
    await page.getByRole('button',{name:'保存文章信息',exact:true}).click();
    await page.getByRole('button',{name:'＋ 文字',exact:true}).click();
    await page.getByLabel('图文文字').fill('普通文章的正文；可作为活动回顾，也可设置为官方介绍。');
    assert.ok(await page.getByRole('button',{name:'发布文章',exact:true}).isDisabled());
    await page.getByRole('button',{name:'保存图文',exact:true}).click();
    await page.getByRole('button',{name:'发布文章',exact:true}).waitFor();
    await page.getByRole('button',{name:'关闭',exact:true}).click();
    await page.getByRole('row').filter({hasText:title}).getByRole('button',{name:'查看 / 编辑'}).click();
    page.once('dialog', dialog => dialog.dismiss());
    await page.getByRole('button',{name:'发布文章',exact:true}).click();
    assert.ok(await page.getByRole('button',{name:'发布文章',exact:true}).isVisible());
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button',{name:'发布文章',exact:true}).click();
    await page.getByRole('button',{name:'设为官方介绍',exact:true}).waitFor();
    assert.ok(await page.getByLabel('文章标题').isDisabled());
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button',{name:'设为官方介绍',exact:true}).click();
    await page.getByRole('button',{name:'当前官方介绍',exact:true}).waitFor();
    await page.screenshot({path:'/tmp/wildboy-articles-admin.png',fullPage:true});
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button',{name:'下架并编辑',exact:true}).click();
    await page.getByRole('button',{name:'发布文章',exact:true}).waitFor();
    await page.getByLabel('文章标题').fill(title + ' 未保存');
    page.once('dialog', dialog => dialog.dismiss());
    await page.getByRole('button',{name:'关闭',exact:true}).click();
    assert.ok(await page.getByRole('dialog').isVisible());
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button',{name:'关闭',exact:true}).click();
    await page.getByRole('dialog').waitFor({state:'detached'});
    assert.deepEqual(errors,[]);
    console.log('PASS production admin artifact + real local API: create, save blocks, close/reopen, cancel/confirm publish, official designation, unpublish, dirty close; no page errors');
  } finally { await browser.close(); }
})().catch(e => {console.error(e); process.exit(1);});
