#!/usr/bin/env python3
"""Membership smoke on an isolated loopback API. Synthetic identities and no live payment."""
import copy, datetime, json, os, urllib.request, urllib.error, uuid
BASE = os.environ.get('BASE_URL', 'http://127.0.0.1:8080/api/v1').rstrip('/')
if not BASE.startswith(('http://127.0.0.1:', 'http://localhost:')):
    raise SystemExit('Only isolated loopback fixtures are supported')
count = 0

def req(method, path, data=None, token=None):
    h = {'Content-Type': 'application/json'}
    if token: h['Authorization'] = 'Bearer ' + token
    r = urllib.request.Request(BASE + path, data=json.dumps(data).encode() if data is not None else None, headers=h, method=method)
    try:
        with urllib.request.urlopen(r, timeout=20) as res:
            body = res.read()
            return res.status, json.loads(body) if body else None
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())

def check(name, condition):
    global count
    assert condition, name
    count += 1
    print('PASS', name, flush=True)

_, login = req('POST', '/auth/dev-login', {'role': 'ADMIN'})
admin = login['token']
_, legal = req('GET', '/legal/current')
versions = {'privacyVersion': legal['privacy']['version'], 'termsVersion': legal['terms']['version']}
_, login = req('POST', '/auth/dev-login', {'role': 'USER', **versions})
user = login['token']; uid = login['user']['id']
s, contact = req('PUT', '/me/profile', {'realName': '测试联系人', 'phone': '13800000000', **versions}, user)
check('contact profile can be saved before either kind of activity signup', s == 200 and contact['profileCompleted'])
_, profile = req('GET', '/me/membership', token=user)
check('owner membership endpoint returns stable ID without external identity', profile['id'] == uid and 'externalId' not in profile)
check('anonymous admin listing blocked', req('GET', '/admin/membership/users')[0] == 401)
check('user admin listing blocked', req('GET', '/admin/membership/tiers', token=user)[0] == 403)
rules = [{'scope': s, 'enabled': s == 'SHOP', 'pricingMode': 'DISCOUNT', 'pricingValue': 8000, 'participantPricing': None} for s in ('ACTIVITY', 'SHOP')]
body = {'name': 'Smoke ' + uuid.uuid4().hex[:8], 'sortOrder': 0, 'enabled': True, 'rules': rules, 'version': None}
s, tier = req('POST', '/admin/membership/tiers', body, admin)
check('admin creates independent rules', s == 201 and {r['scope'] for r in tier['rules']} == {'ACTIVITY', 'SHOP'} and len(tier['rules']) == 2)
invalid_scope = copy.deepcopy(body); invalid_scope['rules'][1]['scope'] = 'UNSUPPORTED'
check('unsupported pricing scope is rejected', req('POST', '/admin/membership/tiers', invalid_scope, admin)[0] == 400)
extra_scope = copy.deepcopy(body); extra_scope['rules'].append(copy.deepcopy(extra_scope['rules'][1]))
check('third pricing rule is rejected', req('POST', '/admin/membership/tiers', extra_scope, admin)[0] == 400)
missing_scope = copy.deepcopy(body); missing_scope['rules'].pop()
check('both activity and shop rules are required', req('POST', '/admin/membership/tiers', missing_scope, admin)[0] == 400)
check('user cannot assign own tier', req('PUT', '/admin/membership/users/' + uid, {'customerType': 'MEMBER', 'tierId': tier['id'], 'version': profile['version']}, user)[0] == 403)
s, assigned = req('PUT', '/admin/membership/users/' + uid, {'customerType': 'MEMBER', 'tierId': tier['id'], 'version': profile['version']}, admin)
check('admin assigns member with version', s == 200 and assigned['tierId'] == tier['id'])
check('stale assignment rejected', req('PUT', '/admin/membership/users/' + uid, {'customerType': 'GUEST', 'tierId': None, 'version': profile['version']}, admin)[0] == 409)
_, found = req('GET', '/admin/membership/users?query=' + uid, token=admin)
check('full user ID search isolates correct account', found['total'] == 1 and found['items'][0]['id'] == uid)
s, product = req('POST', '/admin/shop/products', {'name': 'Synthetic member gear', 'description': 'Not real merchandise', 'imageUrl': '/assets/equipment.jpg', 'priceCents': 1001, 'stock': 10, 'status': 'ON_SALE'}, admin)
check('synthetic product creation', s == 201)
path = '/shop/products/' + product['id'] + '/quote?quantity=2'
check('anonymous quote blocked', req('GET', path)[0] == 401)
_, quote = req('GET', path, token=user)
check('round each unit then multiply, original shown', quote['totalCents'] == 1602 and quote['originalTotalCents'] == 2002)
order_body = {'items': [{'productId': product['id'], 'quantity': 2}], 'recipientName': '测试收件人', 'phone': '13800000000', 'address': '仅测试的合成地址，不配送', **versions, 'requestId': 'member-' + uuid.uuid4().hex, 'expectedTotalCents': 1602}
bad = {**order_body, 'expectedTotalCents': 1}
check('tampered expected total fails closed', req('POST', '/orders', bad, user)[0] == 409)
_, after = req('GET', '/shop/products/' + product['id'])
check('rejected price does not reserve inventory', after['stock'] == 10)
s, order = req('POST', '/orders', order_body, user)
check('order freezes actual and original totals', s == 201 and order['totalCents'] == 1602 and order['originalTotalCents'] == 2002)
check('duplicate request returns original', req('POST', '/orders', order_body, user)[1]['id'] == order['id'])
changed = {k: v for k, v in tier.items() if k != 'id'}
changed['enabled'] = False
s, disabled = req('PUT', '/admin/membership/tiers/' + tier['id'], changed, admin)
check('tier disable succeeds', s == 200)
check('stale tier edit rejected', req('PUT', '/admin/membership/tiers/' + tier['id'], changed, admin)[0] == 409)
check('disabled tier new quote uses original', req('GET', path, token=user)[1]['totalCents'] == 2002)
check('disabled tier leaves order price frozen', req('GET', '/orders/' + order['id'], token=user)[1]['totalCents'] == 1602)
check('uninitiated order cancels without gateway', req('POST', '/orders/' + order['id'] + '/cancel', {}, user)[1]['status'] == 'CANCELLED')
changed = {k: v for k, v in disabled.items() if k != 'id'}; changed['enabled'] = True
for r in changed['rules']:
    if r['scope'] == 'SHOP': r.update(pricingMode='REDUCTION', pricingValue=1001)
    if r['scope'] == 'ACTIVITY': r.update(enabled=True, pricingMode='FIXED', pricingValue=0)
check('enabled activity discount cannot omit party policy', req('PUT', '/admin/membership/tiers/' + tier['id'], changed, admin)[0] == 400)
for r in changed['rules']:
    if r['scope'] == 'ACTIVITY': r['participantPricing'] = 'ACCOUNT_ALL'
s, tier = req('PUT', '/admin/membership/tiers/' + tier['id'], changed, admin)
check('explicit activity party policy accepted', s == 200)
free_body = {**order_body, 'requestId': 'free-' + uuid.uuid4().hex, 'expectedTotalCents': 0}
s, free = req('POST', '/orders', free_body, user)
check('zero merchandise order is confirmed without fake payment', s == 201 and free['status'] == 'CONFIRMED_FREE' and free['paymentTransactionId'] is None and free['paidAt'] is None and not free['paymentInitiated'])
check('free merchandise cancellation restores stock', req('POST', '/orders/' + free['id'] + '/cancel', {}, user)[1]['status'] == 'CANCELLED')
now = datetime.datetime.now(datetime.timezone.utc)
date = lambda days: (now + datetime.timedelta(days=days)).isoformat()
activity_input = {'title': 'Synthetic member outing', 'category': 'WEEKLY', 'coverUrl': '/assets/category-weekly.jpg', 'galleryUrls': [], 'summary': 'Not a real outing', 'description': 'Synthetic API smoke fixture', 'location': '测试地点', 'meetingPoint': '测试集合点', 'startAt': date(14), 'endAt': date(15), 'registrationDeadline': date(13), 'capacity': 4, 'priceCents': 0}
s, a = req('POST', '/admin/activities', activity_input, admin)
check('activity draft created', s == 201)
s, a = req('POST', '/admin/activities/' + a['id'] + '/price', {'priceCents': 2000, 'version': a['version']}, admin)
check('explicit draft price saved', s == 200 and a['priceCents'] == 2000)
s, a = req('POST', '/admin/activities/' + a['id'] + '/publish', {'version': a['version']}, admin)
check('paid activity published', s == 200)
s, aq = req('GET', '/activities/' + a['id'] + '/quote?participants=2', token=user)
check('activity own policy independent from merchandise', s == 200 and aq['totalCents'] == 0 and aq['originalTotalCents'] == 4000)
registration = {'participants': [{'participantName': '测试甲', 'phone': '13800000000'}, {'participantName': '测试乙', 'phone': '13800000001'}], **versions}
key = 'activity-' + uuid.uuid4().hex
s, ao = req('POST', '/activities/' + a['id'] + '/orders', {'requestKey': key, 'registration': registration, 'expectedTotalCents': 0}, user)
check('discounted free activity reserves honest confirmed state', s == 200 and ao['status'] == 'CONFIRMED_FREE' and ao['totalCents'] == 0 and ao['paymentTransactionId'] is None)
check('activity request recovery is owner scoped', req('GET', '/activity-orders/by-request/' + key, token=user)[1]['id'] == ao['id'])
check('activity capacity counts participants', req('GET', '/activities/' + a['id'])[1]['registeredCount'] == 2)
check('free activity cancellation closes without refund claim', req('POST', '/activity-orders/' + ao['id'] + '/cancel', {}, user)[1]['status'] == 'CLOSED')
check('activity cancellation releases capacity once', req('GET', '/activities/' + a['id'])[1]['registeredCount'] == 0)
_, profile = req('GET', '/me/membership', token=user)
req('PUT', '/admin/membership/users/' + uid, {'customerType': 'LEADER', 'tierId': None, 'version': profile['version']}, admin)
check('leader still has no admin access', req('GET', '/admin/activity-orders', token=user)[0] == 403)
check('leader retains USER security role', req('GET', '/me', token=user)[1]['role'] == 'USER')
paid_attempt = {'requestKey': 'unconfigured-' + uuid.uuid4().hex, 'registration': registration, 'expectedTotalCents': 4000}
check('paid activity without merchant configuration fails explicitly', req('POST', '/activities/' + a['id'] + '/orders', paid_attempt, user)[0] == 503)
check('missing payment config does not consume places', req('GET', '/activities/' + a['id'])[1]['registeredCount'] == 0)

print(f'PASS {count} independent HTTP checks; no real payment, credentials, or user data used')
