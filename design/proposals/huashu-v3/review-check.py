from pathlib import Path
import json
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'design-demos'
evidence = OUT / 'review-check'
evidence.mkdir(exist_ok=True)
checks = []

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={'width':1440, 'height':900}, device_scale_factor=1)
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    response = page.goto('http://127.0.0.1:15483/', wait_until='networkidle')
    assert response.status == 200
    assert 'no-store' in response.headers.get('cache-control','')
    checks.append({'check':'fresh preview response','status':'passed','http':response.status,'cacheControl':response.headers['cache-control']})
    page.get_by_role('tab',name='A 晨光绿白').focus()
    page.keyboard.press('ArrowRight')
    assert page.get_by_role('tab',name='B 莓果晴天').get_attribute('aria-selected') == 'true'
    assert page.locator('#panel-B').is_visible()
    page.keyboard.press('End')
    assert page.locator('#panel-C').is_visible()
    page.keyboard.press('Home')
    assert page.locator('#panel-A').is_visible()
    checks.append({'check':'A/B/C tabs, arrow keys, Home, End','status':'passed'})
    for key in 'ABC':
        page.get_by_role('tab',name={'A':'A 晨光绿白','B':'B 莓果晴天','C':'C 杏黄留白'}[key]).click()
        assert page.locator(f'#panel-{key} img').evaluate_all('(images)=>images.every(i=>i.complete && i.naturalWidth>0)')
    page.get_by_role('tab',name='A 晨光绿白').click()
    page.screenshot(path=str(evidence/'desktop.png'))
    page.set_viewport_size({'width':375,'height':812})
    page.screenshot(path=str(evidence/'mobile.png'))
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    checks.append({'check':'three panels images loaded and 375px overflow','status':'passed'})
    assert not errors, errors
    checks.append({'check':'browser runtime errors','status':'passed','errors':errors})
    browser.close()

(ROOT/'review-check.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(checks,ensure_ascii=False,indent=2))
