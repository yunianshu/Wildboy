// Real public article / protected homepage flows against the disposable QA API.
// Restores the homepage configuration and the fixture article's publication state.
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { connectWeChat } = require('./wechat-session.cjs');
process.env.WILDBOY_LOCAL_API ||= 'http://127.0.0.1:19082';
process.env.WILDBOY_WECHAT_PORT ||= '9423';
assert.equal(process.env.WILDBOY_LOCAL_API, 'http://127.0.0.1:19082');
const base = process.env.WILDBOY_LOCAL_API + '/api/v1';
const out = process.env.WILDBOY_EVIDENCE_DIR || path.resolve(__dirname, '../../test-results/ui-refresh-2026-11-17');
const delay = ms => new Promise(r => setTimeout(r, ms));
let token;
async function api(url, method = 'GET', body) {
  const response = await fetch(base + url, { method, headers: {
    'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {})
  }, ...(body ? { body: JSON.stringify(body) } : {}) });
  assert.ok(response.ok, method + ' ' + url + ': ' + response.status);
  return response.status === 204 ? null : response.json();
}
async function waitPage(m, route, valid = d => !d.loading) {
  for (let i = 0; i < 80; i++) {
    const p = await m.currentPage();
    if (p?.path === route && valid(await p.data())) return p;
    await delay(150);
  }
  throw new Error('Page state timeout: ' + route);
}
(async () => {
  const checks = [], exceptions = [];
  const web = JSON.parse(await fs.readFile(path.resolve(out, '../admin-redesign-browser/1794889227661-b34c5/report.json'), 'utf8'));
  const articleId = web.fixtures.article;
  assert.ok(articleId, 'Published article fixture is required');
  token = (await api('/auth/admin', 'POST', { username: 'smoke-admin', password: 'smoke-only-password-123!' })).token;
  const originalArticle = await api('/admin/articles/' + articleId);
  const shortcuts = await api('/admin/home/shortcuts');
  let m, changedConfig = false;
  try {
    if (originalArticle.status !== 'PUBLISHED') await api('/admin/articles/' + articleId + '/publish', 'POST', { version: originalArticle.version });
    const items = shortcuts.items.map((x, i) => i === 0 ? { ...x, type: 'ARTICLE', articleId } :
      i === 1 ? { ...x, type: 'POPUP', popupTitle: '原生首页保护验证', popupText: '仅隔离测试数据，关闭后恢复原入口配置。', popupImageUrl: '' } :
      i === 2 ? { ...x, type: 'PAGE', page: 'WEEKLY' } : x);
    await api('/admin/home/shortcuts', 'PUT', { version: shortcuts.version, items });
    changedConfig = true;
    m = await connectWeChat();
    m.on('exception', e => exceptions.push(String(e?.message || e)));
    await m.reLaunch('/pages/home/index');
    let home = await waitPage(m, 'pages/home/index', d => !d.loading && !d.shortcutLoading && !d.shortcutError);
    const categories = await home.data('categories');
    assert.equal(categories[0].articleId, articleId);
    checks.push('Native homepage reads updated administrator configuration from the real public API');
    await (await home.$('.category[data-slot="' + items[0].slot + '"]')).tap();
    const article = await waitPage(m, 'pages/article/index', d => !d.loading && !!d.article);
    const articleData = await article.data('article');
    assert.equal(articleData.id, articleId);
    assert.ok(articleData.contentNodes.length > 0);
    await m.screenshot({ path: path.join(out, 'native-article-populated.png') });
    checks.push('Homepage article entry preserves id and renders real published Markdown content');
    await m.callWxMethod('navigateBack', { delta: 1 });
    home = await waitPage(m, 'pages/home/index', d => !d.shortcutLoading);
    await (await home.$('.category[data-slot="' + items[1].slot + '"]')).tap();
    assert.equal((await home.data('popup')).title, '原生首页保护验证');
    await m.screenshot({ path: path.join(out, 'home-popup-protected.png') });
    await (await home.$('.shortcut-dialog button')).tap();
    assert.equal((await home.data()).popup, null);
    assert.equal(await home.$('.shortcut-dialog'), null);
    checks.push('Protected homepage popup opens, displays server text and closes with the original handler');
    await (await home.$('.category[data-slot="' + items[2].slot + '"]')).tap();
    const activities = await waitPage(m, 'pages/activities/index', d => !d.loading);
    assert.equal(await activities.data('selected'), 'WEEKLY');
    checks.push('Homepage category entry reaches redesigned activity list with WEEKLY context');
    await m.switchTab('/pages/home/index');
    home = await waitPage(m, 'pages/home/index', d => !d.loading);
    await (await home.$('.shop')).tap();
    await waitPage(m, 'pages/shop/index');
    await m.switchTab('/pages/home/index');
    home = await waitPage(m, 'pages/home/index', d => !d.loading);
    const id = (await home.data('items'))[0].id;
    await (await home.$('.activity-card')).tap();
    const detail = await waitPage(m, 'pages/detail/index', d => !d.loading && !!d.activity);
    assert.equal((await detail.data('activity')).id, id);
    await m.callWxMethod('navigateBack', { delta: 1 });
    await waitPage(m, 'pages/home/index');
    checks.push('Homepage equipment and activity entries keep tab/detail navigation and return behavior');
  } finally {
    if (changedConfig) {
      const current = await api('/admin/home/shortcuts');
      await api('/admin/home/shortcuts', 'PUT', { version: current.version, items: shortcuts.items });
    }
    if (originalArticle.status !== 'PUBLISHED') {
      const current = await api('/admin/articles/' + articleId);
      if (current.status === 'PUBLISHED') await api('/admin/articles/' + articleId + '/unpublish', 'POST', { version: current.version });
    }
    if (m) {
      await m.reLaunch('/pages/home/index');
      await waitPage(m, 'pages/home/index', d => !d.loading && !d.shortcutLoading);
      await m.disconnect();
    }
    await fs.writeFile(path.join(out, 'home-article-report.json'), JSON.stringify({ checks, exceptions, configurationRestored: true, scope: 'Disposable loopback API and native WeChat DevTools only' }, null, 2));
  }
  assert.equal(checks.length, 5); assert.equal(exceptions.length, 0);
  console.log('PASS protected homepage and published article: 5 native checks');
})().catch(e => { console.error(e.message); process.exitCode = 1; });
