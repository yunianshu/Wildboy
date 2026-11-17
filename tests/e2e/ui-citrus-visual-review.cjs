// Read-only final visual checks against the disposable QA backend.
const { chromium } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const web = 'http://127.0.0.1:15176';
const output = path.resolve(__dirname, '../../test-results/ui-citrus-2026-11-17');
(async () => {
  const browser = await chromium.launch({channel:'msedge',headless:true});
  const checks = [], errors = [];
  try {
    await fs.mkdir(output,{recursive:true});
    const page = await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
    page.setDefaultTimeout(10000);
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', route => new URL(route.request().url()).origin===web ? route.continue() : route.abort());
    await page.routeWebSocket('**/*', socket=>socket.close());
    await page.goto(web+'/#/login');
    await page.getByRole('button',{name:/演示登录/}).click();
    await page.getByRole('heading',{name:'活动管理',exact:true}).waitFor();
    for(const [width,height] of [[1440,900],[390,844],[320,700]]) {
      await page.setViewportSize({width,height});
      await page.goto(web+'/#/memberships');
      const opener=page.getByRole('button',{name:'新建等级',exact:true});
      await opener.click();
      const modal=page.getByRole('dialog',{name:'新建会员等级',exact:true});
      await modal.waitFor();
      const bounds=await modal.boundingBox();
      assert.ok(bounds.x>=15 && bounds.y>=15 && bounds.x+bounds.width<=width-15 && bounds.y+bounds.height<=height-15);
      assert.ok(await modal.getByRole('button',{name:'关闭弹窗'}).isVisible());
      await modal.locator('.form-modal-body').evaluate(el=>el.scrollTop=el.scrollHeight);
      const save=modal.getByRole('button',{name:'保存等级',exact:true});
      await save.scrollIntoViewIfNeeded();
      const saveBounds=await save.boundingBox();
      assert.ok(saveBounds.y+saveBounds.height<=height-15,'save remains reachable');
      await page.screenshot({path:path.join(output,`web-membership-dialog-${width}.png`)});
      await page.keyboard.press('Escape');
      await modal.waitFor({state:'detached'});
      await page.waitForFunction(()=>document.activeElement?.textContent?.includes('新建等级'));
      checks.push({name:'membership dialog viewport, scrolling, Escape and focus restoration',width,height,bounds,passed:true});
    }
    const prior=JSON.parse(await fs.readFile(path.resolve(__dirname,'../../test-results/admin-redesign-browser/1794894176044-3c6d6/report.json'),'utf8'));
    await page.setViewportSize({width:1440,height:900});
    await page.goto(web+'/#/articles/'+prior.fixtures.article+'/edit');
    await page.locator('.vditor-wysiwyg').waitFor();
    assert.equal((await page.locator('.doc-foot:visible').textContent()).trim(),'支持 Markdown 与图片上传');
    await page.screenshot({path:path.join(output,'web-article-concise.png')});
    checks.push({name:'article editor uses the concise copy from the Pen readback',passed:true});
    assert.equal(errors.length,0);
  } finally {
    await browser.close();
    await fs.writeFile(path.join(output,'web-visual-report.json'),JSON.stringify({checks,errors},null,2));
  }
  console.log('PASS '+checks.length+' final Web visual checks');
})().catch(e=>{console.error(e.stack);process.exitCode=1});
