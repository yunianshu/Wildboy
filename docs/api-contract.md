# Wildboy API contract
Base /api/v1. JSON responses directly; errors {code,message,fieldErrors?}. Dates ISO-8601 with offset; display Asia/Shanghai. IDs strings. Page {items,total,page,size,hasMore}; page 0-based, size <=50.

Activity: {id,title,category,coverUrl,galleryUrls,summary,description,location,meetingPoint,startAt,endAt,registrationDeadline,capacity,registeredCount,status,priceCents,currency,version,createdAt,updatedAt}. category WEEKLY,DOMESTIC,HOLIDAY,LEISURE. status DRAFT,PUBLISHED,CANCELLED. priceCents=0 for current free registration, currency=CNY. Do not take payment or pretend paid. Upload only trusted https image URLs or local /assets URLs for now.
Registration: {id,activityId,activityTitle,status,createdAt,participants:[{id,participantName,idNumber,phone}]}; status CONFIRMED,CANCELLED. One registration is a group order and consumes participants.length seats. Private participant info never in public feed. Legacy records migrated before identity collection may have an empty idNumber.
Home: {banners:[{id,title,subtitle,imageUrl,activityId}],categories:[{code,name}],equipment:[{id,name,imageUrl,description,priceLabel}],paymentEnabled:boolean}. Equipment links to real products; paymentEnabled reflects complete server merchant configuration.

GET /home public
GET /activities?category=&page=0&size=10 public published only
GET /activities/{id} public published/cancelled
POST /auth/wechat {code,privacyVersion,termsVersion} -> {token,user:{id,nickname,role}}; actual server code2session only, no trusting openid from client.
POST /auth/dev-login {role:USER|ADMIN,privacyVersion?,termsVersion?} -> same; explicitly dev/test-only disabled prod, admin protected by dev environment.
GET /me -> {id,nickname,role}
GET /me/registrations?page=0&size=20 -> Page registration
POST /activities/{id}/registrations {participants:[{participantName,idNumber,phone}],privacyVersion,termsVersion} auth; at least one participant, transactional group capacity, duplicate-safe. 201 new /200 idempotent existing.
DELETE /activities/{id}/registrations/me auth; cancel own enrollment idempotently, deadline/start policy enforced; no personal data in logs.
GET /admin/activities?page=0&size=20 admin
GET /admin/activities/{id} admin
POST /admin/activities admin activity input, creates DRAFT
PUT /admin/activities/{id} admin activity input incl version; optimistic concurrency; no reducing capacity below confirmed count
POST /admin/activities/{id}/publish {version} admin
POST /admin/activities/{id}/cancel {version} admin
GET /admin/activities/{id}/registrations?page=0&size=20 admin
POST /auth/admin {username,password} -> token; configured server admin hash or safe environment config, no production default credentials.

Activity input fields title,category,coverUrl,galleryUrls,summary,description,location,meetingPoint,startAt,endAt,registrationDeadline,capacity,priceCents=0. Errors 400 validation,401 unauthenticated,403 forbidden,404 absent,409 full/closed/stale/duplicate conflict. Never physical-delete registrations or published activity history. Public demo seed clearly labeled demonstration, separate from prod.
GET /activities/{id}/registrations/me auth -> active Registration|null, exact enrollment lookup.

## Shop and WeChat Pay

Product: {id,name,description,imageUrl,priceCents,stock,status,version,createdAt,updatedAt}; status ON_SALE|OFF_SHELF.
Order: {id,orderNo,userId,totalCents,status,recipientName,phone,address,paymentTransactionId,paymentInitiated,paidAt,version,createdAt,updatedAt,items:[{id,productId,productName,imageUrl,priceCents,quantity}]}; status PENDING_PAYMENT|PAID|CANCELLED|SHIPPED.

- GET `/shop/products`, GET `/shop/products/{id}` public on-sale catalog.
- POST `/orders` auth `{items:[{productId,quantity}],recipientName,phone,address,privacyVersion,termsVersion}`; transactional server pricing and stock, 201.
- GET `/orders`, GET `/orders/{id}` own orders only.
- POST `/orders/{id}/pay` -> `{timeStamp,nonceStr,package,signType,paySign}`; real JSAPI prepay, real WeChat identity required.
- POST `/orders/{id}/cancel` pending own order; closes WeChat order first when prepay was initiated, then restocks.
- POST `/payments/wechat/notify` public WeChat callback only; raw-body official SDK verification/decryption, merchant/amount/order validation and idempotent PAID transition.
- GET/POST `/admin/shop/products`, PUT `/admin/shop/products/{id}` admin catalog with optimistic version.
- GET `/admin/orders`, POST `/admin/orders/{id}/ship` admin; only PAID can become SHIPPED.

## Mobile management filtering
- GET /admin/activities accepts optional status=DRAFT|PUBLISHED|CANCELLED, composable with category/page/size. Omit status for all. Invalid enum -> 400.
- GET /me/registrations accepts optional status=CONFIRMED|CANCELLED, always scoped to authenticated user. Omit status for all. Invalid enum -> 400.
- Filtering is applied in PostgreSQL before pagination; total and hasMore describe the whole filtered dataset.
- Mobile admin authentication reuses POST /auth/admin and GET /me. Every /admin route requires server-validated ADMIN. WeChat sign-in remains USER; client role values cannot elevate permissions.

## Versioned legal documents
See [legal-api.md](legal-api.md) for draft, publication, historical versions and consent endpoints. WeChat login, USER dev login and new registrations must submit the two positive integer published versions explicitly read and accepted by the user. Missing publications return 503 LEGAL_NOT_READY; stale versions return 409 LEGAL_VERSION_CHANGED. Admin login, browsing, historical registrations and cancellation remain available. Draft edits alone never invalidate consent.
