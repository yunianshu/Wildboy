/* Production admin artifact + isolated local API article acceptance.
   Serve admin/dist locally; set ADMIN_URL, ARTICLE_API_URL and fixture-only
   TEST_ADMIN_USERNAME / TEST_ADMIN_PASSWORD. Never target production data.
   文章编辑已迁移至独立页面 /articles/new 与 /articles/:id/edit（文档画布）。 */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
(async () => {
  const origin = process.env.ADMIN_URL || 'http://127.0.0.1:5190';
  const api = process.env.ARTICLE_API_URL || 'http://127.0.0.1:8080';
  for (const url of [origin, api]) assert.ok(['127.0.0.1', 'localhost'].includes(new URL(url).hostname), 'isolated local servers only');
  assert.ok(process.env.TEST_ADMIN_USERNAME && process.env.TEST_ADMIN_PASSWORD, 'fixture-only admin credentials required');
  const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',headless:true});
  const page = await browser.newPage({viewport:{width:1440,height:1000}});
  page.setDefaultTimeout(15000);
  const errors = []; page.on('pageerror',e => errors.push(e.message));
  try {
    await page.route(/\/(?:api\/v1|assets\/uploads)\//, async route => {
      const url = new URL(route.request().url());
      const headers = await route.request().allHeaders();
      delete headers.origin; // This route acts as the same-origin proxy for the isolated fixture.
      const response = await route.fetch({url: api + url.pathname + url.search, headers});
      await route.fulfill({response});
    });
    await page.goto(`${origin}/#/login`);
    await page.getByLabel('管理员账号').fill(process.env.TEST_ADMIN_USERNAME);
    await page.getByLabel('登录密码').fill(process.env.TEST_ADMIN_PASSWORD);
    await page.getByRole('button',{name:'登录',exact:true}).click();
    await page.getByRole('link',{name:'文章管理'}).click();
    const title = '隔离浏览器文章验收 ' + Date.now();
    // 独立编辑页：新建 → 资料保存 → 跳转 /articles/:id/edit → 编辑器就绪
    await page.getByRole('button',{name:'新建文章',exact:true}).click();
    await page.getByLabel('文章标题').fill(title);
    await page.getByLabel('文章摘要').fill('只用于本地自动化测试，不是真实发布内容。');
    await page.locator('input[type="file"]').first().setInputFiles({
      name: 'cover.png', mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
    });
    await page.getByAltText('文章封面').waitFor();
    await page.getByRole('button',{name:'保存草稿',exact:true}).click();
    await page.waitForURL('**/articles/*/edit');
    const editor = page.locator('[data-vditor-ready="1"] .vditor-wysiwyg pre[contenteditable="true"]').first();
    await editor.waitFor();
    await editor.click();
    await editor.fill('普通文章的正文；可作为活动回顾，也可设置为官方介绍。');
    await page.getByText('有未保存修改', {exact:true}).waitFor();
    // 有未保存修改时发布被禁用；统一保存后解除并发布
    assert.ok(await page.getByRole('button',{name:'发布',exact:true}).isDisabled());
    await page.getByRole('button',{name:'保存',exact:true}).click();
    await page.getByRole('button',{name:'发布',exact:true}).click();
    await page.getByRole('button',{name:'确认发布',exact:true}).click();
    await page.getByText('已发布', {exact:true}).waitFor();
    assert.ok(await page.getByLabel('文章标题').isEnabled());
    const articleId = new URL(page.url()).hash.split('/')[2];
    assert.ok(articleId);
    const publicUrl = `${api}/api/v1/articles/${articleId}`;
    await page.getByRole('button',{name:'设为官方介绍',exact:true}).click();
    await page.getByRole('button',{name:'确认设为官方介绍',exact:true}).click();
    await page.getByRole('button',{name:'当前官方介绍',exact:true}).waitFor();
    const published = await (await page.request.get(publicUrl)).json();
    const newTitle = title + ' 新版';
    await page.getByLabel('文章标题').fill(newTitle);
    await editor.fill('在线更新后的正文。');
    await page.getByText(/修改待发布/).waitFor();
    const beforeUpdate = await (await page.request.get(publicUrl)).json();
    assert.equal(beforeUpdate.title, title);
    assert.deepEqual(beforeUpdate.contentNodes, published.contentNodes);
    await page.getByRole('button',{name:'发布更新',exact:true}).click();
    await page.getByText('更新已发布，小程序将展示新版。', {exact:true}).waitFor();
    const updated = await (await page.request.get(`${api}/api/v1/articles/official`)).json();
    assert.equal(updated.id, articleId);
    assert.equal(updated.title, newTitle);
    assert.equal(updated.status, 'PUBLISHED');
    assert.equal(updated.publishedAt, published.publishedAt);
    assert.ok(JSON.stringify(updated.contentNodes).includes('在线更新后的正文。'));
    await page.screenshot({path:path.join(os.tmpdir(), 'wildboy-articles-admin.png'),fullPage:true});
    await page.getByRole('button',{name:'下架',exact:true}).click();
    await page.getByRole('button',{name:'确认下架',exact:true}).click();
    await page.getByRole('button',{name:'发布',exact:true}).waitFor();
    assert.equal((await page.request.get(publicUrl)).status(), 404);
    assert.ok(await page.getByLabel('文章标题').isEnabled());
    // 未保存修改离开独立页时，由后台的确认弹窗拦截。
    await page.getByLabel('文章标题').fill(title + ' 未保存');
    await page.getByRole('link',{name:'文章管理'}).click();
    await page.getByRole('dialog').getByRole('button',{name:'取消',exact:true}).click();
    assert.ok(page.url().includes('#/articles/'), 'dirty navigation blocked, still on editor');
    await page.getByRole('link',{name:'文章管理'}).click();
    await page.getByRole('button',{name:'放弃修改',exact:true}).click();
    await page.waitForURL('**/articles');
    assert.deepEqual(errors,[]);
    console.log('PASS production admin artifact + real local API: drafts, publication, live revision, official entry, explicit unpublish, dirty leave guard');
  } finally { await browser.close(); }
})().catch(e => {console.error(e); process.exit(1);});
