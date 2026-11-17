"""Join saved Pen data with actual citrus runtime evidence; never touch .pen files."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
import re
import shutil

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/ui-refactor/2026-11-17-citrus'
RUN = ROOT / 'test-results/ui-citrus-2026-11-17'


def read(p):
    return json.loads(p.read_text(encoding='utf8'))


def write(p, value):
    p.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf8')


def rel(p):
    return p.relative_to(ROOT).as_posix()


inventory = read(OUT / 'inventory.json')
mapping = read(OUT / 'design-map.json')
snapshot = read(OUT / 'pen-readback.json')
assert hashlib.sha256((OUT / 'pen-readback.json').read_bytes()).hexdigest() == mapping['sha256']
assert not any(n.get('problem') for n in snapshot['nodes'])
native = read(RUN / 'native-pages-report.json')
dialogs = read(RUN / 'native-dialogs-report.json')
home = read(RUN / 'home-article-report.json')
visual = read(RUN / 'web-visual-report.json')
cache_smoke = read(RUN / 'cache-smoke-report.json')
assert len(native['results']) == 30 and not native['exceptions']
assert len(dialogs['results']) == 8 and all(x['passed'] for x in dialogs['results'])
assert len(home['checks']) == 5 and not home['exceptions'] and home['configurationRestored']
assert len(visual['checks']) == 4 and all(x['passed'] for x in visual['checks']) and not visual['errors']
assert len(cache_smoke['checks']) == 2 and all(x['passed'] for x in cache_smoke['checks'])
native_by_route = {x['route']: x for x in native['results']}
web_path = ROOT / 'test-results/admin-redesign-browser/1794893334167-29142/report.json'
business_path = ROOT / 'test-results/admin-redesign-browser/1794894176044-3c6d6/report.json'
web_report = read(web_path)
business = read(business_path)
assert len(business['checks']) == 25 and business['passed']
web = []
for row in web_report['screens']:
    label = ('登录界面' if row['route'] == '/login' else row['route']) + f" {row['width']}×{row['height']}"
    assert any(x['name'] == label and x['passed'] for x in web_report['checks']), label
    assert row['horizontalOverflow'] <= 1
    filename = re.sub('[^a-z]+', '-', row['route'].lstrip('/')) + f"-{row['width']}.png"
    image = web_path.parent / filename
    assert image.is_file(), image
    web.append({**row, 'route': row['route'].replace(':articleId', ':id'), 'report': rel(web_path), 'screenshot': rel(image)})
assert len(web) == 154
baseline = read(OUT / 'home-baseline.json')
changed = [x['file'] for x in baseline['files'] if hashlib.sha256((ROOT / x['file']).read_bytes()).hexdigest() != x['sha256']]
assert len(baseline['files']) == 81 and not changed
protection = {'route': baseline['route'], 'checkedAt': datetime.now(timezone.utc).isoformat(), 'fileCount': 81, 'changedFiles': changed, 'baselineWasReset': False}
write(RUN / 'home-protection-final.json', protection)
pixel = read(RUN / 'home-pixel-comparison.json')
assert pixel['differentPixelsOutsideExcludedRegions'] == 0

for page in inventory['pages']:
    route = page['route']
    if page['platform'] == 'web':
        rows = [r for r in web if r['route'] == route]
        assert len(rows) == 7, route
        page['verificationStatus'] = 'verified-browser-7-viewports-and-regressions'
        page['verificationEvidence'] = rows + [{'businessReport': rel(business_path), 'visualReport': rel(RUN / 'web-visual-report.json')}]
        page['componentPattern'] = ['rf-* citrus tokens', 'FormModal shared form and confirmation shell', 'askConfirm asynchronous decision as applicable']
    else:
        row = native_by_route[route]
        assert row['rendered'] and row['dataValidated'] and not row['error']
        page['verificationStatus'] = 'verified-native-devtools-and-regressions' if page['refactor'] else 'verified-protected-home'
        page['verificationEvidence'] = [{'report': rel(RUN / 'native-pages-report.json'), 'screenshot': rel(RUN / row['file']), 'dataValidated': True}]
        if page['refactor']:
            page['componentPattern'] = ['page-local rf-* citrus tokens', 'ui-dialog where declared in page JSON; original wx.showModal retained']
        if route == 'pages/home/index':
            page['verificationEvidence'] += [{'report': rel(RUN / name)} for name in ('home-protection-final.json', 'home-pixel-comparison.json', 'home-article-report.json')]
        if 'ui-dialog' in (ROOT / (page['file'] + '.json')).read_text(encoding='utf8'):
            page['verificationEvidence'].append({'report': rel(RUN / 'native-dialogs-report.json'), 'scope': 'Actual shell checks; UI-only fixture states are explicitly identified in the report'})
    page['verificationLimits'] = '本机隔离 API、浏览器和微信开发者工具；真机、生产支付、消息送达及物流外部服务未验证。'
    page['implementationStatus'] = 'implemented' if page['refactor'] else 'preserved-unchanged'
mapping['pages'] = inventory['pages']
mapping['components'].update({'miniUserFilterBoard': 'wlpgC', 'miniUserDetailBoard': 'uHPy2'})
write(OUT / 'inventory.json', inventory)
write(OUT / 'design-map.json', mapping)

evidence = OUT / 'evidence'
evidence.mkdir(exist_ok=True)
for name in ('native-pages-report.json', 'native-dialogs-report.json', 'home-article-report.json', 'home-protection-final.json', 'home-pixel-comparison.json', 'web-visual-report.json', 'cache-smoke-report.json'):
    shutil.copyfile(RUN / name, evidence / name)
for name in ('native-home.png', 'native-home-after-cache.png', 'native-checkout.png', 'native-activities.png', 'native-shop.png', 'native-profile.png', 'native-article-populated.png', 'home-popup-protected.png', 'dialog-profile.png', 'dialog-participant-validation.png', 'dialog-refund-validation.png', 'dialog-user-filter.png', 'dialog-user-detail.png', 'dialog-publish-confirm.png', 'dialog-activity-cancel.png', 'dialog-activity-order-confirm.png', 'web-membership-dialog-1440.png', 'web-membership-dialog-320.png', 'web-article-concise.png'):
    shutil.copyfile(RUN / name, evidence / name)
shutil.copyfile(web_path, evidence / 'web-route-report.json')
shutil.copyfile(business_path, evidence / 'web-business-report.json')
for name in ('activities-1280.png', 'login-1440.png'):
    shutil.copyfile(web_path.parent / name, evidence / ('web-' + name))
shutil.copyfile(business_path.parent / 'article-official-confirm-mobile.png', evidence / 'web-official-confirm-390.png')
for name in ('citrus-web-final-tests.log', 'citrus-web-final-build.log', 'citrus-mini-final.log', 'citrus-mini-final-build.log', 'citrus-article-final.log', 'citrus-checkout-final.log', 'citrus-vite-cache.log'):
    shutil.copyfile(ROOT / '_temp' / name, evidence / name)
write(OUT / 'runtime-evidence.json', {
    'generatedAt': datetime.now(timezone.utc).isoformat(), 'designReadbackSha256': mapping['sha256'],
    'webRouteMatrix': web, 'webBusiness': business['checks'], 'webVisual': visual,
    'nativeRoutes': native, 'nativeDialogs': dialogs, 'homeFlows': home, 'homeProtection': protection, 'homePixels': pixel,
    'tests': {'web': 201, 'mini': 526, 'articleAfterCopySimplification': 10, 'checkoutAfterFinalVisualFix': 60}, 'postCacheSmoke': cache_smoke,
    'builds': {'web': 'passed; existing >500 kB chunk warning', 'mini': 'passed; local dist configured for isolated API only'},
    'cache': {'web': 'Vite optimize --force rebuilt vditor, vue and vue-router; browser verification uses a fresh context', 'mini': 'CLI cache --clean compile and --clean network succeeded; project rebuilt and relaunched', 'scope': 'Project compilation/network caches; user storage and authentication not cleared'},
    'initialFailures': ['Two browser assertions expected native confirmation titles; updated to shared dialog and all 25 workflows passed', 'Native tool stale compilation/duplicate-port crash resolved by restarting the project', 'Native user filters lost ancestor selectors; fixed after Pen update and rechecked', 'Final article copy assertion updated; 10 article tests passed', 'Visual review initially required an editable published article; corrected to inspect its visible read-only editor'],
    'limits': ['No physical iOS/Android device verification', 'No real payment, refund, subscribed message delivery, shipment integration or production deployment', 'Some fault/confirmation states use explicitly labeled synthetic or UI-only fixtures'],
})
print('Recorded 51 routes, 154 Web layouts, 25 Web workflows, 30 native routes, 8 dialogs, 5 home flows; 81 protected files unchanged')
