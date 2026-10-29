#!/usr/bin/env python3
"""Run against an isolated dev server only; creates and cancels test activities.
BASE_URL defaults to localhost:8080/api/v1. Distinct USER_TOKEN_2 optional.
Use ADMIN_TOKEN / USER_TOKEN or explicitly enabled dev-login. Never production.
"""
import concurrent.futures
import datetime as dt
import json
import os
import urllib.error
import urllib.request
import uuid

BASE = os.getenv('BASE_URL', 'http://localhost:8080/api/v1').rstrip('/')
if not BASE.startswith(('http://localhost:', 'http://127.0.0.1:')):
    raise SystemExit('This destructive fixture test permits loopback dev servers only.')
checks = []

def request(method, path, data=None, token=None):
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    req = urllib.request.Request(BASE + path, data=None if data is None else json.dumps(data).encode(), headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            raw = response.read()
            return response.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raw = e.read()
        try: body = json.loads(raw)
        except ValueError: body = raw.decode()
        return e.code, body

def check(name, condition, detail=None):
    if not condition:
        raise AssertionError(f'{name}: {detail}')
    checks.append(name)
    print('PASS', name, flush=True)

def token(role):
    supplied = os.getenv(role + '_TOKEN')
    if supplied: return supplied
    payload = {'role': role}
    if role == 'USER':
        status, published = request('GET', '/legal/current')
        check('dev login has published legal versions', status == 200 and published.get('ready') is True, published)
        payload.update(privacyVersion=published['privacy']['version'], termsVersion=published['terms']['version'])
    status, body = request('POST', '/auth/dev-login', payload)
    check('dev test login ' + role, status == 200 and bool(body.get('token')), body)
    return body['token']

admin = token('ADMIN')
user = token('USER')
user2 = os.getenv('USER_TOKEN_2')
status, legal = request('GET', '/legal/current')
check('isolated dev has explicit published legal documents', status == 200 and legal.get('ready') is True, legal)
consent = {'privacyVersion': legal['privacy']['version'], 'termsVersion': legal['terms']['version']}
status, home = request('GET', '/home')
check('public home payments disabled', status == 200 and home['paymentEnabled'] is False, home)
check('four named categories', [x['name'] for x in home['categories']] == ['本周活动','国内游行','假期活动','休闲活动'], home)
status, body = request('GET', '/admin/activities')
check('anonymous admin denied', status == 401, body)
status, body = request('GET', '/admin/activities', token=user)
check('ordinary user admin denied', status == 403, body)
now = dt.datetime.now(dt.timezone.utc)
iso = lambda days: (now + dt.timedelta(days=days)).isoformat()
fixture = dict(title='E2E ' + str(uuid.uuid4())[:8], category='WEEKLY', coverUrl='/assets/category-weekly.jpg', galleryUrls=[], summary='自动验收测试活动', description='仅用于隔离环境验收，不是真实活动。', location='厦门', meetingPoint='测试集合点', startAt=iso(10), endAt=iso(11), registrationDeadline=iso(9), capacity=2, priceCents=0, identityRequired=True)
participant = {'participants': [
    {'participantName':'验收用户一','idNumber':'11010519491231002X','phone':'13800000000'},
    {'participantName':'验收用户二','idNumber':'110105194912310038','phone':'13800000001'},
], **consent}
status, body = request('POST', '/admin/activities', fixture, user)
check('ordinary user cannot create', status == 403, body)
paid = {**fixture, 'priceCents': 100}
status, body = request('POST', '/admin/activities', paid, admin)
check('nonzero fees rejected', status == 400, body)
status, activity = request('POST', '/admin/activities', fixture, admin)
check('admin creates draft', status == 201 and activity['status'] == 'DRAFT', activity)
aid = activity['id']
status, body = request('GET', '/activities/' + aid)
check('draft not publicly readable', status == 404, body)
status, body = request('POST', f'/activities/{aid}/registrations', participant, user)
check('draft registration forbidden', status == 404, body)
updated = {**fixture, 'title': fixture['title']+' edited', 'version': activity['version']}
status, activity = request('PUT', '/admin/activities/'+aid, updated, admin)
check('edit succeeds with current version', status == 200 and activity['title'].endswith(' edited'), activity)
status, body = request('PUT', '/admin/activities/'+aid, updated, admin)
check('stale edit rejected', status == 409, body)
status, activity = request('POST', f'/admin/activities/{aid}/publish', {'version':activity['version']}, admin)
check('publish succeeds', status == 200 and activity['status']=='PUBLISHED', activity)
status, body = request('GET', '/activities/'+aid)
check('published publicly visible and PII absent', status == 200 and not any(k in body for k in ['phone','idNumber','participantName','participants','registrations']), body)
status, body = request('POST', f'/activities/{aid}/registrations', participant)
check('anonymous cannot register', status == 401, body)
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
    results = list(pool.map(lambda _: request('POST', f'/activities/{aid}/registrations', participant, user), range(8)))
check('duplicate concurrent registration idempotent', all(s in (200,201) for s,_ in results) and len({b['id'] for _,b in results}) == 1, results)
status, activity = request('GET', '/activities/'+aid)
check('duplicate retries occupy two seats once', status == 200 and activity['registeredCount']==2, activity)
status, own = request('GET', f'/activities/{aid}/registrations/me', token=user)
check('own group enrollment lookup', status == 200 and own['status']=='CONFIRMED' and len(own['participants'])==2, own)
if user2:
    duplicate = {**participant, 'participants':[participant['participants'][0], participant['participants'][0]]}
    status, body = request('POST', f'/activities/{aid}/registrations', duplicate, user2)
    check('duplicate identity in one group rejected', status == 400, body)
    status, body = request('POST', f'/activities/{aid}/registrations', participant, user2)
    check('second group cannot exceed capacity', status == 409, body)
    status, body = request('DELETE', f'/activities/{aid}/registrations/me', token=user2)
    check('unregistered user cancel does not alter other enrollment', status in (200,204), body)
    status, activity = request('GET', '/activities/'+aid)
    check('cross-user isolation retains both seats', activity['registeredCount']==2, activity)
status, body = request('GET', f'/admin/activities/{aid}/registrations', token=user)
check('ordinary user cannot access roster', status == 403, body)
status, body = request('GET', f'/admin/activities/{aid}/registrations', token=admin)
check('admin roster masks identity by default', status == 200 and body['total']==1 and len(body['items'][0]['participants'])==2 and body['items'][0]['participants'][0]['idNumber']=='******************', body)
status, body = request('DELETE', f'/activities/{aid}/registrations/me', token=user)
check('self cancellation succeeds', status in (200,204), body)
status, activity = request('GET', '/activities/'+aid)
check('cancellation releases seat', activity['registeredCount']==0, activity)
status, body = request('POST', f'/activities/{aid}/registrations', participant, user)
check('cancelled user can re-register', status == 201 and body['status']=='CONFIRMED', body)
# Versioned policy lifecycle uses only synthetic text in this isolated fixture.
status, previous_consent = request('GET', '/me/consents', token=user)
check('registration recorded current legal consent', status == 200 and previous_consent['requiresConsent'] is False, previous_consent)
status, state = request('GET', '/admin/legal/PRIVACY', token=admin)
check('admin reads policy draft', status == 200 and 'draft' in state, state)
draft = {'title':'独立验收隐私示例', 'content':'仅用于隔离环境测试，不是正式法律文本。测试内容不用于实际运营。', 'revision':state['draft']['revision']}
status, body = request('PUT', '/admin/legal/PRIVACY/draft', draft, user)
check('ordinary user cannot edit legal policy', status == 403, body)
status, body = request('PUT', '/admin/legal/PRIVACY/draft', {**draft, 'content':'<script>synthetic</script>'}, admin)
check('HTML legal content rejected', status == 400, body)
status, saved = request('PUT', '/admin/legal/PRIVACY/draft', draft, admin)
check('admin saves legal draft', status == 200, saved)
status, body = request('PUT', '/admin/legal/PRIVACY/draft', draft, admin)
check('stale draft revision rejected', status == 409, body)
status, unchanged = request('GET', '/legal/current')
check('saving draft leaves published document unchanged', status == 200 and unchanged == legal, unchanged)
status, state = request('GET', '/admin/legal/PRIVACY', token=admin)
status, body = request('POST', '/admin/legal/PRIVACY/publish', {'revision':state['draft']['revision']}, user)
check('ordinary user cannot publish legal policy', status == 403, body)
status, published = request('POST', '/admin/legal/PRIVACY/publish', {'revision':state['draft']['revision']}, admin)
check('admin explicitly publishes new policy version', status == 200, published)
status, latest = request('GET', '/legal/current')
check('publication increments policy version only', status == 200 and latest['privacy']['version'] > consent['privacyVersion'] and latest['terms']['version'] == consent['termsVersion'], latest)
status, historical = request('GET', f"/legal/PRIVACY/versions/{consent['privacyVersion']}")
check('published historical document immutable', status == 200 and historical == legal['privacy'], historical)
status, body = request('GET', '/me/consents', token=user)
check('new policy requires fresh user consent', status == 200 and body['requiresConsent'] is True, body)
status, body = request('POST', '/me/consents', consent, user)
check('old policy versions cannot be accepted as current', status == 409, body)
status, body = request('DELETE', f'/activities/{aid}/registrations/me', token=user)
check('policy update does not block self cancellation', status in (200,204), body)
status, body = request('POST', f'/activities/{aid}/registrations', participant, user)
check('old policy versions cannot re-register', status == 409, body)
consent = {'privacyVersion':latest['privacy']['version'], 'termsVersion':latest['terms']['version']}
status, body = request('POST', '/me/consents', consent, user)
check('explicit latest legal consent accepted', status in (200,201,204), body)
participant = {**participant, **consent}
status, body = request('POST', f'/activities/{aid}/registrations', participant, user)
check('current policy versions permit re-registration', status == 201, body)
status, body = request('GET', '/me/consents', token=user)
check('current legal consent status is retained', status == 200 and body['requiresConsent'] is False, body)
status, activity = request('GET', '/admin/activities/'+aid, token=admin)
status, body = request('POST', f'/admin/activities/{aid}/cancel', {'version':activity['version']}, admin)
check('admin cancels activity', status == 200 and body['status']=='CANCELLED', body)
status, body = request('POST', f'/activities/{aid}/registrations', participant, user)
check('cancelled activity cannot accept registration', status == 409, body)
status, body = request('GET', '/activities?page=-1&size=10')
check('invalid pagination rejected', status == 400, body)
status, body = request('GET', '/activities?page=0&size=1')
check('page shape valid', status==200 and len(body['items'])<=1 and isinstance(body['hasMore'],bool), body)
status, products = request('GET', '/shop/products')
check('public shop returns real products', status == 200 and len(products) > 0, products)
product = next(item for item in products if item['stock'] > 0)
original_stock = product['stock']
order_input = {'items':[{'productId':product['id'],'quantity':1}], 'recipientName':'商城验收', 'phone':'13800000000', 'address':'厦门市隔离测试地址', **consent}
status, order = request('POST', '/orders', order_input, user)
check('order uses server product price and pending state', status == 201 and order['status']=='PENDING_PAYMENT' and order['totalCents']==product['priceCents'], order)
status, body = request('POST', f"/orders/{order['id']}/pay", token=user)
check('development identity cannot invoke real payment', status == 409 and body.get('code')=='WECHAT_IDENTITY_REQUIRED', body)
status, body = request('GET', f"/orders/{order['id']}", token=user)
check('failed payment invocation leaves pending order', status == 200 and body['status']=='PENDING_PAYMENT', body)
if user2:
    status, body = request('GET', f"/orders/{order['id']}", token=user2)
    check('other user cannot read shop order', status == 404, body)
status, body = request('POST', f"/admin/orders/{order['id']}/ship", {'version':order['version']}, admin)
check('pending order cannot be marked shipped', status == 409, body)
status, cancelled = request('POST', f"/orders/{order['id']}/cancel", token=user)
check('unpaid order cancellation succeeds', status == 200 and cancelled['status']=='CANCELLED', cancelled)
status, after = request('GET', f"/shop/products/{product['id']}")
check('cancellation restores product stock', status == 200 and after['stock']==original_stock, after)
status, body = request('GET', '/home')
check('home payment flag reflects missing merchant config', status == 200 and body['paymentEnabled'] is False, body)
# Operations batch: real HTTP routing, persisted content/templates and fail-closed adapters.
for path in ['/admin/dashboard', '/admin/templates', '/admin/exceptions', '/admin/audit', '/admin/refunds', '/admin/notifications', '/admin/waitlist']:
    status, body = request('GET', path, token=user)
    check('user cannot access ' + path, status == 403, body)
    status, body = request('GET', path, token=admin)
    check('admin can access ' + path, status == 200, body)
status, draft = request('POST', '/admin/activities', fixture, admin)
check('operations source created', status == 201, draft)
source = draft['id']
blocks = [{'type':'text', 'text':'隔离环境内容快照'}]
status, content = request('PUT', f'/admin/activities/{source}/content', {'blocks':blocks, 'version':0}, admin)
check('structured content persists', status == 200 and content['version']==1, content)
status, body = request('GET', f'/activities/{source}/content')
check('draft content remains private', status == 404, body)
status, template = request('POST', '/admin/templates', {'name':'HTTP fixture', 'sourceId':source, 'sourceVersion':draft['version']}, admin)
check('template snapshot created', status == 200, template)
payload = {'starts':[iso(30)], 'version':template['version']}
status, generated = request('POST', f"/admin/templates/{template['id']}/generate", payload, admin)
check('template creates only empty draft', status == 200 and generated[0]['status']=='DRAFT' and generated[0]['registeredCount']==0, generated)
status, repeated = request('POST', f"/admin/templates/{template['id']}/generate", payload, admin)
check('template HTTP replay is idempotent', status == 200 and repeated[0]['id']==generated[0]['id'], repeated)
status, body = request('GET', f"/admin/activities/{generated[0]['id']}/content", token=admin)
check('generated draft carries safe content snapshot', status == 200 and body['blocks'][0]['text']==blocks[0]['text'], body)
status, body = request('GET', '/notifications/config', token=user)
check('notifications fail closed without real configuration', status == 200 and body.get('ready') is False, body)
status, body = request('POST', f"/orders/{order['id']}/refund", {'reason':'隔离验收'}, user)
check('cancelled unpaid order cannot refund', status == 409, body)
print(json.dumps({'passed':len(checks),'distinct_user_capacity_checked':bool(user2),'fixture_id':aid}, ensure_ascii=False))
