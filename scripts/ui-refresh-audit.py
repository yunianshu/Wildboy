"""Capture route coverage and the protected exploration-page dependency baseline."""
from pathlib import Path
import hashlib
import json
import re

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/ui-refactor/2026-11-17'
OUT.mkdir(parents=True, exist_ok=True)
old = json.loads((ROOT / 'docs/ui-refactor/design-map.json').read_text(encoding='utf-8-sig'))
previous = {p['路由']: p for values in old['pages'].values() for p in values}

def read(path):
    return path.read_text(encoding='utf-8-sig')

def evidence(source):
    apis = sorted(set(re.findall(r'["\'`]((?:/admin|/auth|/activities|/shop|/orders|/registrations|/me|/legal|/home|/articles|/membership|/notifications|/addresses)[^"\'`\n]*)', source)))
    links = sorted(set(re.findall(r'(?:pages/[\w-]+/index|/(?:activities|articles|shop|settings)[^"\'`\s<]*)', source)))
    fields = re.findall(r'<(?:th|h[1-3]|label)[^>]*>\s*([^<>{}\n]+)', source)
    controls = re.findall(r'<(?:FormModal|ConfirmDialog)\b[^>]*', source)
    controls += re.findall(r'wx:if="\{\{([^}]+)\}\}"[^>]*class="[^"]*(?:dialog|modal|overlay|confirm)[^"]*"', source)
    handlers = sorted(set(re.findall(r'(?:bindtap|bindsubmit|bindchange|@click|@submit|@change)="([^"]+)"', source)))
    return {'apiReferences': apis, 'relatedPages': links, 'fieldLabels': [x.strip() for x in fields], 'overlays': controls, 'handlers': handlers}

pages = []
router = read(ROOT / 'admin/src/router.ts')
imports = dict(re.findall(r'import (\w+) from "./views/([^"]+)"', router))
for route, component in re.findall(r'\{ path: "([^"]+)", component: (\w+) \}', router):
    file = 'admin/src/views/' + imports[component]
    source = read(ROOT / file)
    oldpage = previous.get(route, {})
    pages.append({'platform': 'web', 'route': route, 'file': file, 'module': oldpage.get('模块', component), 'role': '匿名登录' if route == '/login' else '服务端 ADMIN；数据及操作权限继续由原接口校验', 'refactor': True, 'designStatus': 'pending', 'readStatus': 'pending', 'implementationStatus': 'pending', 'verificationStatus': 'pending', **evidence(source)})

app = json.loads(read(ROOT / 'miniprogram/src/app.json'))
routes = app['pages'] + [p['root'] + '/' + x for p in app.get('subPackages', app.get('subpackages', [])) for x in p['pages']]
for route in routes:
    file = 'miniprogram/src/' + route
    source = read(ROOT / (file + '.ts')) + '\n' + read(ROOT / (file + '.wxml'))
    oldpage = previous.get(route, {})
    pages.append({'platform': 'mini', 'route': route, 'file': file, 'module': oldpage.get('模块', route.split('/')[1]), 'role': '服务端 ADMIN' if '/admin-' in route and '/admin-login/' not in route else '公开浏览；个人数据/报名/订单需登录；权限沿用页面守卫', 'refactor': route != 'pages/home/index', 'designStatus': 'preserved' if route == 'pages/home/index' else 'pending', 'readStatus': 'pending', 'implementationStatus': 'preserve' if route == 'pages/home/index' else 'pending', 'verificationStatus': 'pending', **evidence(source)})

manifest = {'date': '2026-11-17', 'webRoot': '/ → /activities', 'miniRoot': app['pages'][0], 'subPackages': app.get('subPackages', app.get('subpackages', [])), 'redirects': re.findall(r'\{ path: "([^"]+)", redirect: "([^"]+)" \}', router), 'excluded': ['admin/src/views/WaitlistView.vue（无有效路由，旧入口重定向）', 'miniprogram/src/pages/admin-editor/index.wxml.new（未注册备份）'], 'pages': pages}
(OUT / 'inventory.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

baseline_file = OUT / 'home-baseline.json'
if not baseline_file.exists():
    sources = []
    mini = ROOT / 'miniprogram/src'
    for path in mini.rglob('*'):
        if not path.is_file():
            continue
        rel = path.relative_to(mini).as_posix()
        if rel.startswith('pages/') and not rel.startswith('pages/home/'):
            continue
        if rel in ['styles/user-flow.wxss', 'styles/admin-flow.wxss']:
            continue
        sources.append({'file': path.relative_to(ROOT).as_posix(), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
    baseline_file.write_text(json.dumps({'route': app['pages'][0], 'evidence': ['app.json pages[0]', 'app.json tabBar.list 探索', 'utils/tab-bar.ts 与首页跳转实现'], 'files': sources}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

print(json.dumps({'web': sum(p['platform'] == 'web' for p in pages), 'mini': len(routes), 'protectedFiles': len(json.loads(read(baseline_file))['files']), 'inventory': str(OUT / 'inventory.json')}, ensure_ascii=False))
