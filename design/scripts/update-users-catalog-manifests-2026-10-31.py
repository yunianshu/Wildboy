"""Executed one-time manifest migration. Do not rerun; never reads/writes .pen."""
import hashlib
import json
from pathlib import Path
from PIL import Image

base = Path(__file__).resolve().parent
record = json.loads((base / 'users-catalog-design-2026-10-31.json').read_text(encoding='utf-8'))
mapping = record['rootReplacements']
roots = {r['id']: r for r in record['roots']}

def remap(value):
    if isinstance(value, dict): return {k: remap(v) for k, v in value.items()}
    if isinstance(value, list): return [remap(v) for v in value]
    if isinstance(value, str):
        if value in mapping: return mapping[value]
        for old, new in mapping.items():
            if value.endswith('/' + old + '.png'): return value[:-len(old + '.png')] + new + '.png'
    return value

def read(name): return remap(json.loads((base / name).read_text(encoding='utf-8')))
def write(name, data): (base / name).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
def upsert(items, item):
    for i, old in enumerate(items):
        if old['nodeId'] == item['nodeId']: items[i] = item; return
    items.append(item)

evidence = 'docs/users-categories-prices-2026-10-31.md'
design_evidence = 'design/users-catalog-design-2026-10-31.json'
users_api = ['GET /api/v1/admin/users?query=&profile=&role=&accountSource=&page=&size=8', 'GET /api/v1/admin/users/{id}?status=&page=&size=4', 'PUT /api/v1/admin/users/{id}/role']
category_api = ['GET /api/v1/admin/shop/categories', 'POST /api/v1/admin/shop/categories', 'PUT /api/v1/admin/shop/categories/{id}']
role_rules = ['账号来源由API返回WECHAT/PASSWORD/DEMO/OTHER，不靠昵称判断。', '只有已验证WECHAT目标可改角色；本人、密码、演示、其他来源目标不可写。操作者须为正式PASSWORD或已验证WECHAT的ADMIN；其他ADMIN仅此权限功能只读，原有活动/商品/订单管理保留。', 'PUT携带当前version，具体用户与权限影响确认后发送；角色改变使目标旧会话失效，需重新微信登录。', '默认脱敏；完整联系方式复用对应活动名单的用途确认，不新增用户资料代编辑。', '409停止旧版本重提，显式读取最新资料后核对；未知结果不自动重发，会话切换清空并拒绝迟到回填。']
category_rules = ['分类为单层，无删除、禁用或多级分类。稳定默认ID uncategorized；可改名和排序，历史商品与订单保留。', 'name去首尾空白后1–40字，无控制字符，名称忽略大小写唯一；sortOrder为0–9999整数，小的在前。', 'CATEGORY_NAME_EXISTS保留可修改草稿；STALE_VERSION锁定旧版本保存，确认重读成功才采用新version，取消或失败保留输入。', '创建结果未知时保留输入并禁止盲目重复创建，先核对最新列表。', '商品新UI明确提交categoryId、originalPriceCents与priceCents；原价和现价均1–100000000整数分，原价>=现价。只有原价更高才划线，不改变历史订单成交金额。']
extension = {'date': '2026-10-31', 'status': 'pen-layout-and-valid-png-verified', 'designEvidence': design_evidence, 'implementationEvidence': evidence, 'layoutScope': '99 canvas roots checked; 22 extension-related roots inspected in scope', 'rootReplacements': mapping, 'pngExportScale': 1, 'note': 'Pen screenshots and layout checks are design evidence. Runtime/API/payment assertions remain in their implementation reports; earlier test counts are historical batches.'}

admin = read('admin-manifest.json')
admin['domains']['users'] = {'bindings': users_api, 'implementationConstraints': role_rules, 'existingTests': ['admin/tests/users.test.ts']}
admin['domains']['product-categories'] = {'bindings': category_api, 'implementationConstraints': category_rules, 'existingTests': ['admin/tests/product-categories.test.ts', 'admin/tests/shop.test.ts', 'admin/tests/navigation.test.ts']}
for screen in admin['screens']:
    if screen['nodeId'] in ['UcBWH', 'AV1WF', 'irybD']:
        screen.setdefault('implementationConstraints', []).extend([r for r in category_rules if r not in screen.get('implementationConstraints', [])])
        screen['bindings'] = list(dict.fromkeys(screen.get('bindings', []) + category_api))
for node, state, domain, action in [('Nwr2l','users-list','users','筛选用户'), ('a35E2','user-profile-role','users','设为管理员'), ('z7k8T','user-registration-history','users','查看活动名单'), ('wqrUO','user-role-confirm','users','确认设为管理员'), ('a4YnM8','category-list','product-categories','新分类'), ('ie3cy','category-editor','product-categories','保存分类'), ('oi0IF','category-price-role-recovery','product-categories','按状态核对与重试')]:
    upsert(admin['screens'], {'route': '/users' if domain == 'users' else '/shop/categories', 'nodeId': node, 'state': state, 'title': roots[node]['name'], 'primaryAction': action, 'domain': domain, 'width': 1440, 'height': 900, 'png': f'design/exports/admin/{node}.png', 'newRoute': state in ['users-list','category-list'], 'implementationConstraints': role_rules if domain == 'users' else category_rules, 'bindings': users_api if domain == 'users' else category_api, 'examples': 'Illustrative data only; masked identities, prices and counts are not business writes.'})
admin['validation']['screenCount'] = len(admin['screens'])
admin['validation']['resolvedInstanceLayoutAudit'] = '2026-10-31: all 99 current roots, zero resolved-instance layout problems; see current extension evidence.'
admin['validation']['extension'] = extension
admin['reviewStatus'] = '43-current-design-frames; users-categories-prices-extension-layout-verified'
admin['sourceImplementationStatus']['usersCatalogEvidence'] = evidence
admin['sourceImplementationStatus']['historicalCountNote'] = 'Existing 96-test/browser-batch entries describe the earlier redesign batch; current integrated verification is in usersCatalogEvidence.'
admin['revisions'].append({'date': '2026-10-31', 'change': '用户管理、商品分类、原价现价及第三商城任务入口；按当前Pen根ID重新导出43张有效PNG。', 'evidence': design_evidence})
admin['currentExtension'] = extension
write('admin-manifest.json', admin)

user = read('mobile-user-manifest.json')
profile_rules = ['默认显示当前账号活动联系人摘要，修改在编辑弹层中完成；不把整页表单当默认页面。', '姓名/手机号由本人填写。默认consent=false；无需打开协议阅读器即可主动勾选；未同意或legal缺失时保存禁用。', '法律版本变化/未就绪后重取失败，保留姓名和手机号草稿、清除同意并提供独立重新获取协议入口，沿用epoch/session守卫。', '当前版本主动同意后才提交/me/profile。阅读器返回不自动同意，隐藏、离页和身份变化不能触发旧提交。', '我的新增活动联系人入口；删除旧Continue操作。仅从报名进入且资料完善时显示返回报名，不无条件展示继续报名。']
profile = {'key':'profile','route':'pages/profile/index','nodeId':'u9yYo','title':'活动联系人','group':'个人联系资料','position':{'x':9430,'y':5600},'export':'design/exports/mobile-user/u9yYo.png','majorStates':['当前账号资料摘要','修改联系资料弹层','默认未勾选与保存禁用','资料加载失败','协议独立重试保留草稿'],'implementationConstraints':profile_rules,'api':['GET /me','GET /legal/current','PUT /me/profile'],'existingTests':['miniprogram/tests/user-management.test.cjs'],'stateBoards':['CX7SL']}
upsert(user['screens'], profile)
upsert(user['stateBoards'], {'key':'profile-editor-unchecked','route':'pages/profile/index','nodeId':'CX7SL','kind':'screen-variant','title':'活动联系人编辑 · 默认未同意','position':{'x':roots['CX7SL'].get('x',9430),'y':6524},'export':'design/exports/mobile-user/CX7SL.png','majorStates':['预填本人联系资料','主动协议勾选，默认false','保存禁用','协议缺失独立重试保留draft'],'implementationConstraints':profile_rules,'illustrative':True})
for screen in user['screens']:
    if screen['key'] in ['shop','product']:
        screen.setdefault('implementationConstraints', []).extend(['分类API返回真实ID/名称；商品按categoryId筛选，分类失败可独立重读并保留商品。', 'originalPriceCents只在高于priceCents时显示划线原价；成交现价仍来自priceCents，不能伪造折扣。'])
    if screen['key'] == 'shop': screen['api'].append('GET /shop/categories')
    if screen['key'] == 'mine': screen.setdefault('implementationConstraints', []).extend(profile_rules[-1:])
user['scope']['mainScreens'] = len(user['screens'])
user['scope']['stateBoards'] = len(user['stateBoards'])
user['revision'] = max(4, user.get('revision', 0))
user['updatedAt'] = '2026-10-31'
user['exportScale'] = 1
user['currentExtension'] = extension
user['userAmendments'].append({'id':'users-categories-prices-contact','date':'2026-10-31','requirements':['活动联系人摘要与编辑弹层，默认未勾选保存禁用、协议失败独立重试','商城分类筛选、卡片两行标题与底部对齐、原价仅更高时划线','我的活动联系人入口与管理员用户管理入口'],'evidence':evidence})
write('mobile-user-manifest.json', user)

native = read('mobile-admin-manifest.json')
for node, route, variant, purpose in [('gbfMY','pages/admin-users/index','users-list','账号来源、角色、资料状态、搜索与脱敏列表'), ('n2142A','pages/admin-users/index','profile-role','只读来源与脱敏资料、正式管理员授撤权及版本恢复'), ('L50wpo','pages/admin-product/index','inline-category-editor','同页分类管理，独立管理对象不改变商品分类，保留商品草稿'), ('P9Nefw','pages/admin-product/index','category-recovery','独立分类读取失败、版本冲突与未知创建核对')]:
    upsert(native['screens'], {'route':route,'nodeId':node,'variant':variant,'purpose':purpose,'export':f'design/exports/mobile-admin/{node}.png','implementationConstraints':role_rules if 'users' in route else category_rules})
for screen in native['screens']:
    screen['export'] = f"design/exports/mobile-admin/{screen['nodeId']}.png"
    if screen['nodeId'] == 'IWwi8': screen['purpose'] = '商品分类、原价与现价、库存、封面及上架状态；分类失败独立恢复'
native['implementationConstraints'].extend([r for r in category_rules if r not in native['implementationConstraints']])
native['implementation']['sourcePages'] = len({s['route'] for s in native['screens']})
native['implementation']['designFrames'] = len(native['screens'])
native['currentExtension'] = extension
native['exportScale'] = 1
write('mobile-admin-manifest.json', native)

entries = []
for name, doc, directory, sections in [('admin',admin,'admin',['screens']),('mobile-user',user,'mobile-user',['screens','stateBoards']),('mobile-admin',native,'mobile-admin',['screens'])]:
    for section in sections:
        for screen in doc[section]:
            node = screen['nodeId']; path = base / 'exports' / directory / (node + '.png')
            assert node in roots, (name, node)
            assert path.stat().st_size > 8 and path.read_bytes().startswith(b'\x89PNG\r\n\x1a\n'), str(path)
            with Image.open(path) as image: width, height = image.size; image.verify()
            entries.append({'surface':name,'nodeId':node,'route':screen['route'],'path':path.relative_to(base.parent).as_posix(),'bytes':path.stat().st_size,'width':width,'height':height,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
write('users-catalog-export-index-2026-10-31.json', {'date':'2026-10-31','scale':1,'validPNGCount':len(entries),'layoutRootCount':99,'layoutProblems':[],'note':'Only manifest-indexed files are current. Unindexed former root PNG names are historical artifacts. PNG integrity checks do not establish runtime behavior.','entries':entries})
print(json.dumps({'admin':len(admin['screens']),'mobileUser':len(user['screens']),'mobileUserStates':len(user['stateBoards']),'mobileAdmin':len(native['screens']),'validPNGs':len(entries)},ensure_ascii=True))
