/* Production admin artifact + isolated local API article acceptance.
   Serve admin/dist locally; set ADMIN_URL, ARTICLE_API_URL and fixture-only
   TEST_ADMIN_USERNAME / TEST_ADMIN_PASSWORD. Never target production data.
   文章编辑已迁移至独立页面 /articles/new 与 /articles/:id/edit（文档画布）。 */
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
    await page.getByRole('button',{name:'登录',exact:true}).click();
    await page.getByRole('link',{name:'文章管理'}).click();
    const title = '隔离浏览器文章验收 ' + Date.now();
    // 独立编辑页：新建 → 资料保存 → 跳转 /articles/:id/edit → 编辑器就绪
    await page.getByRole('button',{name:'新建文章',exact:true}).click();
    await page.getByLabel('文章标题').fill(title);
    await page.getByLabel('文章摘要').fill('只用于本地自动化测试，不是真实发布内容。');
    await page.getByRole('button',{name:'保存草稿',exact:true}).click();
    await page.waitForURL('**/articles/*/edit');
    const editor = page.locator('[aria-label="图文正文（Markdown 编辑器）"] .vditor-wysiwyg');
    await editor.waitFor();
    await editor.click();
    await editor.fill('普通文章的正文；可作为活动回顾，也可设置为官方介绍。');
    // 有未保存修改时发布被禁用；统一保存后解除并发布
    assert.ok(await page.getByRole('button',{name:'发布',exact:true}).isDisabled());
    await page.getByRole('button',{name:'保存',exact:true}).click();
    await page.getByRole('button',{name:'发布',exact:true}).isEnabled();
    await page.getByRole('button',{name:'发布',exact:true}).click();
    await page.getByRole('button',{name:'确认发布',exact:true}).click();
    await page.getByText('已发布 · 小程序可见').waitFor();
    assert.ok(await page.getByLabel('文章标题').isDisabled());
    await page.getByRole('button',{name:'设为官方介绍',exact:true}).click();
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button',{name:'确认设为官方介绍',exact:true}).click();
    await page.getByRole('button',{name:'当前官方介绍',exact:true}).waitFor();
    await page.screenshot({path:'/tmp/wildboy-articles-admin.png',fullPage:true});
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button',{name:'下架并编辑',exact:true}).click();
    await page.getByRole('button',{name:'发布',exact:true}).waitFor();
    assert.ok(await page.getByLabel('文章标题').isEnabled());
    // 脏状态离开独立页：浏览器原生 confirm 拦截一次，拒绝后留在编辑页，接受后放行
    await page.getByLabel('文章标题').fill(title + ' 未保存');
    page.once('dialog', dialog => dialog.dismiss());
    await page.getByRole('link',{name:'文章管理'}).click();
    await page.waitForTimeout(300);
    assert.ok(page.url().includes('#/articles/'), 'dirty navigation blocked, still on editor');
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('link',{name:'文章管理'}).click();
    await page.waitForURL('**/articles');
    assert.deepEqual(errors,[]);
    console.log('PASS production admin artifact + real local API: page-based create, unified save, publish confirm, official designation, unpublish, dirty leave guard; no page errors');
  } finally { await browser.close(); }
})().catch(e => {console.error(e); process.exit(1);});
