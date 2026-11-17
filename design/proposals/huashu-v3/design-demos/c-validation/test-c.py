import hashlib
import json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

HERE = Path(__file__).resolve().parent
OUT = HERE / 'final'
OUT.mkdir(exist_ok=True)
URL = 'http://127.0.0.1:15483/dir-3.html'
samples = json.loads((HERE.parent.parent / 'sample-data.json').read_text(encoding='utf-8'))
checks = []
errors = []
api_requests = []

def record(name, detail=True):
    checks.append({'name': name, 'passed': True, 'detail': detail})

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=1)
    page = context.new_page()
    page.on('pageerror', lambda err: errors.append(str(err)))
    page.on('console', lambda msg: errors.append(msg.text) if msg.type == 'error' else None)
    page.on('request', lambda req: api_requests.append(req.url) if '/api/' in req.url else None)
    page.goto(URL, wait_until='networkidle')
    page.evaluate('document.fonts.ready')
    expect(page.locator('.activity-row')).to_have_count(8)
    assert page.evaluate('window.__C_PREVIEW__.rows') == samples
    record('All eight sample records match shared data exactly')
    record('Embedded runtime', page.evaluate('window.__C_PREVIEW__.vueVersion'))
    assert page.evaluate("[...document.images].every(i=>i.complete&&i.naturalWidth>0&&i.src.startsWith('data:'))")
    record('Original logo and all covers load from embedded data URLs')
    fonts = page.evaluate("({available:document.fonts.check('16px \"Noto Sans SC\"'),stack:getComputedStyle(document.body).fontFamily})")
    record('Local font stack inspected', fonts)
    assert page.locator('.pending').all_text_contents() == ['待支付 2', '待支付 1']
    record('Pending-payment labels appear only for paid nonzero records')
    expected_prices = ['免费' if row['priceCents'] == 0 else '¥' + format(row['priceCents']/100, '.2f') + ' / 人' for row in samples]
    actual_prices = page.locator('.price').evaluate_all("nodes=>nodes.map(n=>[...n.childNodes].filter(x=>x.nodeType===Node.TEXT_NODE).map(x=>x.textContent).join('').trim())")
    assert actual_prices == expected_prices, actual_prices
    record('Prices have two decimals and per-person units; free stays free')
    ratios = page.locator('.capacity-line').evaluate_all("nodes=>nodes.map(n=>({ratio:n.firstElementChild.getBoundingClientRect().width/n.getBoundingClientRect().width,width:n.getBoundingClientRect().width,value:+n.getAttribute('aria-valuenow'),max:+n.getAttribute('aria-valuemax')}))")
    for actual, expected in zip(ratios, samples):
        assert abs(actual['ratio'] - expected['registeredCount']/expected['capacity']) < .001
        assert actual['width'] == 160
    record('All capacity widths match actual counts on 160px tracks', ratios)
    assert page.locator('[data-pen-id="BWuPl"]').inner_text() == '8 条 / 页'
    assert page.locator('.pagination select').count() == 0
    assert page.locator('.pagination button:disabled').count() == 2
    record('Page size is static 8, page 1/1, both paging buttons disabled')
    page.screenshot(path=str(OUT / 'desktop-1440x900.png'))
    page.get_by_role('searchbox', name='搜索活动名称').fill('徒步')
    expect(page.locator('.activity-row')).to_have_count(8)
    page.get_by_role('button', name='搜索', exact=True).click()
    expect(page.locator('.activity-row')).to_have_count(3)
    record('Title query applies on explicit search submission')
    page.get_by_role('searchbox', name='搜索活动名称').fill('山脊步道')
    page.get_by_role('searchbox', name='搜索活动名称').press('Enter')
    expect(page.locator('.activity-row')).to_have_count(0)
    expect(page.get_by_text('没有找到活动', exact=True)).to_be_visible()
    page.screenshot(path=str(OUT / 'empty-state.png'))
    record('Location-only query produces no results; title-only contract preserved')
    page.get_by_role('button', name='清除筛选', exact=True).click()
    expect(page.locator('.activity-row')).to_have_count(8)
    page.locator('.category-list').get_by_role('button', name='本周活动', exact=True).click()
    expect(page.locator('.activity-row')).to_have_count(2)
    page.get_by_role('combobox', name='活动状态').select_option('DRAFT')
    expect(page.locator('.activity-row')).to_have_count(0)
    page.locator('.category-list').get_by_role('button', name='假期活动', exact=True).click()
    expect(page.locator('.activity-row')).to_have_count(2)
    record('Category and status filters compose correctly')
    page.get_by_role('button', name='刷新', exact=True).click()
    expect(page.locator('.activity-row')).to_have_count(2)
    expect(page.locator('.toast')).to_contain_text('示例列表')
    record('Refresh keeps filters and reports local demo reload honestly')
    page.get_by_role('button', name='重置筛选', exact=True).click()
    expect(page.locator('.activity-row')).to_have_count(8)
    record('Reset clears query, category, and status')
    page.locator('.all-features').click()
    expect(page.locator('#all-functions [data-route]')).to_have_count(15)
    page.screenshot(path=str(OUT / 'all-functions-desktop.png'))
    routes = page.locator('#all-functions [data-route]').evaluate_all("nodes=>nodes.map(n=>({name:n.textContent,route:n.dataset.route}))")
    for entry in routes:
        if not page.locator('#all-functions').count(): page.locator('.all-features').click()
        page.locator('#all-functions').get_by_role('button', name=entry['name'], exact=True).click()
        assert page.url == URL
        if entry['route'] != '/activities': expect(page.locator('.toast')).to_contain_text('尚未制作此页面')
    record('All fifteen navigation entries work with honest preview feedback', routes)
    page.locator('.activity-row').nth(0).locator('.service-action').click()
    expect(page.locator('.toast')).to_contain_text('收费订单')
    page.locator('.activity-row').nth(1).locator('.service-action').click()
    expect(page.locator('.toast')).to_contain_text('免费名单')
    record('Paid orders and free attendee-list actions are distinguished')
    page.get_by_role('button', name='编辑周末山脊徒步', exact=True).click()
    expect(page.locator('.toast')).to_contain_text('未连接后台')
    page.get_by_role('button', name='新建活动', exact=True).click()
    expect(page.locator('.toast')).to_contain_text('当前仅演示')
    page.locator('.sign-out').click()
    expect(page.locator('.toast')).to_contain_text('不会清除登录状态')
    record('Edit, create and sign-out provide accurate demo-only feedback')
    expect(page.locator('.toast')).to_have_count(0, timeout=6000)
    page.locator('#preview-trigger').click()
    page.locator('#preview-publish').click()
    expect(page.locator('dialog')).to_be_visible()
    expect(page.locator('dialog .secondary')).to_be_focused()
    assert page.locator('dialog .secondary').evaluate("n=>getComputedStyle(n).borderTopWidth") == '2px'
    assert page.locator('dialog').bounding_box()['width'] == 520
    for _ in range(6):
        page.keyboard.press('Tab')
        assert page.evaluate('document.querySelector("dialog").contains(document.activeElement)')
    page.locator('dialog .secondary').focus()
    page.screenshot(path=str(OUT / 'publish-dialog-desktop.png'))
    page.keyboard.press('Escape')
    expect(page.locator('dialog')).not_to_be_visible()
    expect(page.locator('#preview-publish')).to_be_focused()
    record('Publish dialog is 520px, initially focuses cancel, traps Tab, Escape restores trigger')
    page.locator('#preview-publish').click()
    page.get_by_role('button', name='确认发布', exact=True).click()
    expect(page.locator('.toast')).to_contain_text('没有发布活动')
    assert page.evaluate('window.__C_PREVIEW__.rows') == samples
    record('Confirmation never mutates or publishes sample activity data')
    page.set_viewport_size({'width': 375, 'height': 812})
    page.reload(wait_until='networkidle')
    page.evaluate('document.fonts.ready')
    expect(page.locator('.activity-row')).to_have_count(8)
    overflow = page.evaluate('({viewport:innerWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth})')
    assert overflow['document'] <= 375 and overflow['body'] <= 375, overflow
    record('375px viewport has no horizontal overflow', overflow)
    small_controls = page.locator('button,input,select').evaluate_all("nodes=>nodes.filter(n=>n.getBoundingClientRect().width>0&&n.getBoundingClientRect().height>0).filter(n=>(n.closest('.search-field')||n).getBoundingClientRect().height<44).map(n=>({tag:n.tagName,text:n.textContent,height:n.getBoundingClientRect().height}))")
    assert small_controls == [], small_controls
    record('All visible mobile control heights meet 44px, input inner field is 42px inside 44px shell')
    page.screenshot(path=str(OUT / 'mobile-375x812.png'))
    page.screenshot(path=str(OUT / 'mobile-375-full.png'), full_page=True)
    page.locator('.pagination').screenshot(path=str(OUT / 'mobile-pagination.png'))
    page.locator('.mobile-category select').select_option('DOMESTIC')
    expect(page.locator('.activity-row')).to_have_count(2)
    page.get_by_role('combobox', name='活动状态').select_option('CANCELLED')
    expect(page.locator('.activity-row')).to_have_count(1)
    record('Mobile category and status select filters work')
    page.get_by_role('button', name='重置筛选', exact=True).click()
    page.locator('.mobile-menu-trigger').click()
    expect(page.locator('#all-functions [data-route]')).to_have_count(15)
    menu_box = page.locator('#all-functions').bounding_box()
    assert menu_box['x'] >= 0 and menu_box['x'] + menu_box['width'] <= 375
    page.screenshot(path=str(OUT / 'all-functions-mobile.png'))
    page.keyboard.press('Escape')
    expect(page.locator('#all-functions')).to_have_count(0)
    page.locator('#mobile-preview-trigger').click()
    page.locator('#preview-publish').click()
    expect(page.locator('dialog .secondary')).to_be_focused()
    assert page.locator('dialog .secondary').evaluate("n=>getComputedStyle(n).borderTopWidth") == '2px'
    page.screenshot(path=str(OUT / 'publish-dialog-mobile.png'))
    dialog_box = page.locator('dialog').bounding_box()
    assert dialog_box['x'] >= 0 and dialog_box['x'] + dialog_box['width'] <= 375
    page.keyboard.press('Escape')
    expect(page.locator('#preview-publish')).to_be_focused()
    record('Mobile menu and dialog fit viewport; Escape restores mobile dialog trigger')
    assert errors == [], errors
    assert api_requests == [], api_requests
    record('No browser errors or backend API calls', {'errors': errors, 'apiRequests': api_requests})
    result = {'url': URL, 'browser': browser.version, 'passed': len(checks), 'checks': checks, 'consoleErrors': errors, 'backendRequests': api_requests, 'htmlSha256': hashlib.sha256((HERE.parent / 'dir-3.html').read_bytes()).hexdigest()}
    (HERE / 'interaction-results-C.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    browser.close()
    print(json.dumps({'passed': len(checks), 'screenshots': str(OUT), 'errors': errors}, ensure_ascii=False, indent=2))
