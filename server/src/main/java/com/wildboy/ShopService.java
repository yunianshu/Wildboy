package com.wildboy;

import static com.wildboy.Models.Page;
import static com.wildboy.ShopModels.*;

import com.wechat.pay.java.service.payments.model.Transaction;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ShopService {
  private final JdbcTemplate db;
  private final LegalService legal;
  private final AuthService auth;
  private final ActivityService activities;
  private final WechatPayService pay;
  private final TransactionTemplate transactions;

  public ShopService(
      JdbcTemplate db,
      LegalService legal,
      AuthService auth,
      ActivityService activities,
      WechatPayService pay, PlatformTransactionManager transactionManager) {
    this.db = db;
    this.legal = legal;
    this.auth = auth;
    this.activities = activities;
    this.pay = pay;
    this.transactions = new TransactionTemplate(transactionManager);
  }

  private final RowMapper<Product> productMapper =
      (r, n) ->
          new Product(
              r.getString("id"),
              r.getString("name"),
              r.getString("description"),
              r.getString("image_url"),
              r.getInt("price_cents"),
              r.getInt("stock"),
              r.getString("status"),
              r.getLong("version"),
              r.getObject("created_at", OffsetDateTime.class),
              r.getObject("updated_at", OffsetDateTime.class));

  private final RowMapper<Order> orderMapper =
      (r, n) ->
          new Order(
              r.getString("id"),
              r.getString("order_no"),
              r.getString("user_id"),
              r.getInt("total_cents"),
              r.getString("status"),
              r.getString("recipient_name"),
              r.getString("phone"),
              r.getString("address"),
              r.getString("payment_transaction_id"),
              r.getBoolean("payment_initiated"),
              r.getObject("paid_at", OffsetDateTime.class),
              r.getLong("version"),
              r.getObject("created_at", OffsetDateTime.class),
              r.getObject("updated_at", OffsetDateTime.class),
              r.getObject("expires_at", OffsetDateTime.class),
              r.getBoolean("reconciliation_required"),
              List.of());

  public List<Product> products(boolean admin) {
    return db.query(
        "SELECT * FROM product" + (admin ? "" : " WHERE status='ON_SALE'") + " ORDER BY created_at,id",
        productMapper);
  }

  public Product product(String id, boolean admin) {
    var result =
        db.query(
            "SELECT * FROM product WHERE id=?" + (admin ? "" : " AND status='ON_SALE'"),
            productMapper,
            id);
    if (result.isEmpty()) throw ApiException.notFound();
    return result.getFirst();
  }

  private void validateProduct(ProductInput input) {
    activities.validateUrl(input.imageUrl());
    if (input.priceCents() < 1 || input.priceCents() > 100000000)
      throw new ApiException(400, "INVALID_PRICE", "商品价格超出范围");
    if (input.stock() < 0 || input.stock() > 1000000)
      throw new ApiException(400, "INVALID_STOCK", "商品库存超出范围");
  }

  @Transactional
  public Product createProduct(ProductInput input, String actor) {
    validateProduct(input);
    String id = UUID.randomUUID().toString();
    db.update(
        "INSERT INTO product(id,name,description,image_url,price_cents,stock,status) VALUES(?,?,?,?,?,?,?)",
        id,
        input.name().strip(),
        input.description(),
        input.imageUrl(),
        input.priceCents(),
        input.stock(),
        input.status().name());
    activities.audit(actor, id, "PRODUCT_CREATE");
    return product(id, true);
  }

  @Transactional
  public Product editProduct(String id, ProductInput input, String actor) {
    validateProduct(input);
    var current =
        db.query("SELECT * FROM product WHERE id=? FOR UPDATE", productMapper, id).stream()
            .findFirst()
            .orElseThrow(ApiException::notFound);
    if (input.version() == null || input.version() != current.version())
      throw ApiException.conflict("STALE_VERSION", "商品已被修改，请刷新后重试");
    db.update(
        "UPDATE product SET name=?,description=?,image_url=?,price_cents=?,stock=?,status=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?",
        input.name().strip(),
        input.description(),
        input.imageUrl(),
        input.priceCents(),
        input.stock(),
        input.status().name(),
        id);
    activities.audit(actor, id, "PRODUCT_EDIT");
    return product(id, true);
  }

  private Order withItems(Order order) {
    var items =
        db.query(
            "SELECT * FROM shop_order_item WHERE order_id=? ORDER BY id",
            (r, n) ->
                new OrderItem(
                    r.getString("id"),
                    r.getString("product_id"),
                    r.getString("product_name"),
                    r.getString("image_url"),
                    r.getInt("price_cents"),
                    r.getInt("quantity")),
            order.id());
    return new Order(
        order.id(),
        order.orderNo(),
        order.userId(),
        order.totalCents(),
        order.status(),
        order.recipientName(),
        order.phone(),
        order.address(),
        order.paymentTransactionId(),
        order.paymentInitiated(),
        order.paidAt(),
        order.version(),
        order.createdAt(),
        order.updatedAt(),
        order.expiresAt(),
        order.reconciliationRequired(),
        items);
  }

  public Order order(String id, String userId, boolean admin) {
    var result =
        db.query(
            "SELECT * FROM shop_order WHERE id=?" + (admin ? "" : " AND user_id=?"),
            orderMapper,
            admin ? new Object[] {id} : new Object[] {id, userId});
    if (result.isEmpty()) throw ApiException.notFound();
    return withItems(result.getFirst());
  }

  public Order orderByRequest(String requestId, String userId) {
    var result = db.query("SELECT * FROM shop_order WHERE user_id=? AND request_id=?", orderMapper, userId, requestId);
    if (result.isEmpty()) throw ApiException.notFound();
    return withItems(result.getFirst());
  }

  private Order lockOrder(String id, String userId, boolean admin) {
    var result =
        db.query(
            "SELECT * FROM shop_order WHERE id=?" + (admin ? "" : " AND user_id=?") + " FOR UPDATE",
            orderMapper,
            admin ? new Object[] {id} : new Object[] {id, userId});
    if (result.isEmpty()) throw ApiException.notFound();
    return result.getFirst();
  }

  public Page<Order> orders(String userId, OrderStatus status, int page, int size) {
    ActivityService.pageCheck(page, size);
    var args = new ArrayList<>();
    String where = userId == null ? "1=1" : "user_id=?";
    if (userId != null) args.add(userId);
    if (status != null) {
      where += " AND status=?";
      args.add(status.name());
    }
    long total =
        db.queryForObject("SELECT COUNT(*) FROM shop_order WHERE " + where, Long.class, args.toArray());
    args.add(size);
    args.add(page * size);
    var items =
        db.query(
            "SELECT * FROM shop_order WHERE " + where + " ORDER BY created_at DESC,id LIMIT ? OFFSET ?",
            orderMapper,
            args.toArray());
    return new Page<>(
        items.stream().map(this::withItems).toList(),
        total,
        page,
        size,
        (long) (page + 1) * size < total);
  }

  @Transactional
  public Order createOrder(String userId, OrderInput input) {
    legal.requireCurrent(input.privacyVersion(), input.termsVersion());
    if (input.items() == null || input.items().isEmpty())
      throw new ApiException(400, "ORDER_ITEMS_REQUIRED", "请选择要购买的商品");
    String recipient = input.recipientName() == null ? "" : input.recipientName().strip();
    String phone = input.phone() == null ? "" : input.phone().strip();
    String address = input.address() == null ? "" : input.address().strip();
    if (recipient.length() < 2 || recipient.length() > 80)
      throw new ApiException(400, "INVALID_RECIPIENT", "收货人姓名须为 2–80 字");
    if (!phone.matches("[+0-9][0-9 ()-]{5,28}"))
      throw new ApiException(400, "INVALID_PHONE", "收货手机号格式不正确");
    if (address.length() < 5 || address.length() > 300)
      throw new ApiException(400, "INVALID_ADDRESS", "请填写完整收货地址");
    var quantities = new LinkedHashMap<String, Integer>();
    for (OrderItemInput item : input.items()) {
      if (item == null || item.productId() == null || item.quantity() < 1 || item.quantity() > 99)
        throw new ApiException(400, "INVALID_ORDER_ITEM", "商品数量无效");
      int quantity = quantities.getOrDefault(item.productId(), 0) + item.quantity();
      if (quantity > 99) throw new ApiException(400, "INVALID_ORDER_ITEM", "单种商品最多购买 99 件");
      quantities.put(item.productId(), quantity);
    }
    // A per-owner lock serializes retries and the pending-order limit, including concurrent requests.
    db.queryForObject("SELECT id FROM app_user WHERE id=? FOR UPDATE", String.class, userId);
    String requestId = input.requestId();
    if (requestId != null && (!requestId.matches("[A-Za-z0-9_-]{8,80}")))
      throw new ApiException(400, "INVALID_REQUEST_ID", "下单请求号格式无效");
    String fingerprint = fingerprint(quantities, recipient, phone, address, input);
    if (requestId != null) {
      var previous = db.query("SELECT * FROM shop_order WHERE user_id=? AND request_id=?", orderMapper, userId, requestId);
      if (!previous.isEmpty()) {
        String oldFingerprint = db.queryForObject("SELECT request_fingerprint FROM shop_order WHERE id=?", String.class, previous.getFirst().id());
        if (!fingerprint.equals(oldFingerprint))
          throw ApiException.conflict("IDEMPOTENCY_CONFLICT", "同一请求号对应的订单内容已改变");
        return withItems(previous.getFirst());
      }
    }
    if (db.queryForObject("SELECT COUNT(*) FROM shop_order WHERE user_id=? AND status='PENDING_PAYMENT'", Integer.class, userId) >= 10)
      throw ApiException.conflict("TOO_MANY_PENDING_ORDERS", "待支付订单过多，请先完成或取消已有订单");
    var productIds = quantities.keySet().stream().sorted().toList();
    var products = new HashMap<String, Product>();
    for (String productId : productIds) {
      var product =
          db.query("SELECT * FROM product WHERE id=? FOR UPDATE", productMapper, productId).stream()
              .findFirst()
              .orElseThrow(ApiException::notFound);
      if (!product.status().equals("ON_SALE"))
        throw ApiException.conflict("PRODUCT_OFF_SHELF", "商品已下架，请刷新后重试");
      int quantity = quantities.get(productId);
      if (product.stock() < quantity)
        throw ApiException.conflict("INSUFFICIENT_STOCK", "商品库存不足，请调整数量后重试");
      products.put(productId, product);
    }
    long total = 0;
    for (String productId : productIds)
      total += (long) products.get(productId).priceCents() * quantities.get(productId);
    if (total > 100000000) throw new ApiException(400, "INVALID_ORDER_TOTAL", "订单金额超出范围");
    String id = UUID.randomUUID().toString();
    String orderNo = UUID.randomUUID().toString().replace("-", "");
    db.update(
        "INSERT INTO shop_order(id,order_no,user_id,total_cents,status,recipient_name,phone,address,request_id,request_fingerprint) VALUES(?,?,?,?,'PENDING_PAYMENT',?,?,?,?,?)",
        id,
        orderNo,
        userId,
        (int) total,
        recipient,
        phone,
        address,
        requestId,
        fingerprint);
    for (String productId : productIds) {
      Product product = products.get(productId);
      int quantity = quantities.get(productId);
      db.update(
          "INSERT INTO shop_order_item(id,order_id,product_id,product_name,image_url,price_cents,quantity) VALUES(?,?,?,?,?,?,?)",
          UUID.randomUUID().toString(),
          id,
          productId,
          product.name(),
          product.imageUrl(),
          product.priceCents(),
          quantity);
      db.update("UPDATE product SET stock=stock-?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?", quantity, productId);
    }
    legal.accept(userId, input.privacyVersion(), input.termsVersion(), "ORDER");
    activities.audit(userId, id, "ORDER_CREATE");
    return order(id, userId, false);
  }

  private String fingerprint(Map<String, Integer> quantities, String recipient, String phone,
      String address, OrderInput input) {
    try {
      // Length-prefixed fields avoid delimiter collisions and do not retain extra address copies.
      var fields = new ArrayList<String>();
      new TreeMap<>(quantities).forEach((id, quantity) -> { fields.add(id); fields.add(quantity.toString()); });
      fields.addAll(List.of(recipient, phone, address, String.valueOf(input.privacyVersion()), String.valueOf(input.termsVersion())));
      StringBuilder canonical = new StringBuilder();
      fields.forEach(value -> canonical.append(value.length()).append(':').append(value));
      return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(canonical.toString().getBytes(StandardCharsets.UTF_8)));
    } catch (java.security.NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
  }

  private void requirePayable(Order order) {
    if (!order.status().equals("PENDING_PAYMENT"))
      throw ApiException.conflict("ORDER_NOT_PAYABLE", "当前订单状态不可支付");
    if (!order.expiresAt().isAfter(OffsetDateTime.now()))
      throw ApiException.conflict("ORDER_EXPIRED", "订单支付期限已过，正在安全关闭，请重新下单");
  }

  public PaymentRequest payment(String id, String userId) {
    // Commit intent BEFORE the external call. A timeout/crash must never erase the possibility
    // that WeChat created the order; cancellation must close it before releasing stock.
    String openid = auth.wechatOpenid(userId);
    pay.requireConfigured();
    transactions.executeWithoutResult(status -> {
      requirePayable(lockOrder(id, userId, false));
      db.update("UPDATE shop_order SET payment_initiated=TRUE,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?", id);
    });
    try {
      return transactions.execute(status -> {
      Order order = lockOrder(id, userId, false);
      requirePayable(order);
      // The same row lock is used by cancellation, expiry and payment notifications.
      return pay.prepay(withItems(order), openid);
      });
    } catch (RuntimeException failure) {
      markReconciliation(id);
      throw failure;
    }
  }

  /** Reconcile a customer-owned order after client payment or a missed callback. */
  @Transactional
  public Order verifyPayment(String id, String userId) {
    Order order = lockOrder(id, userId, false);
    if (!order.status().equals("PENDING_PAYMENT") || !order.paymentInitiated())
      return withItems(order);
    Transaction remote = pay.queryOrder(order.orderNo());
    if (remote == null || remote.getTradeState() == null)
      throw new ApiException(502, "WECHAT_QUERY_FAILED", "微信订单状态暂无法确认，请稍后重试");
    if (!Objects.equals(remote.getOutTradeNo(), order.orderNo())
        || !Objects.equals(remote.getMchid(), pay.merchantId())
        || !Objects.equals(remote.getAppid(), pay.appId()))
      throw new ApiException(400, "PAYMENT_ORDER_MISMATCH", "支付查询订单信息不匹配");
    if (remote.getTradeState() == Transaction.TradeStateEnum.SUCCESS) {
      completePayment(remote);
      return order(id, userId, false);
    }
    // NOTPAY/USERPAYING/CLOSED are not proof of payment and never release stock here.
    // Cancellation and expiry own the safe gateway-close/restock workflow.
    return withItems(order);
  }

  @Transactional
  public Order cancelOrder(String id, String userId) {
    return closePending(lockOrder(id, userId, false), userId, "ORDER_CANCEL");
  }

  public void expireOrder(String id) {
    // This retry delay is committed independently: a failed gateway reconciliation must not
    // roll it back and starve later expired orders behind the same first batch forever.
    transactions.executeWithoutResult(status -> db.update(
        "UPDATE shop_order SET expiry_retry_at=CURRENT_TIMESTAMP+INTERVAL '5 minutes' WHERE id=? AND status='PENDING_PAYMENT'", id));
    try {
      transactions.executeWithoutResult(status -> {
      Order order = lockOrder(id, null, true);
      if (order.status().equals("PENDING_PAYMENT") && !order.expiresAt().isAfter(OffsetDateTime.now()))
        closePending(order, "system", "ORDER_EXPIRE");
      });
    } catch (RuntimeException failure) {
      markReconciliation(id);
      throw failure;
    }
  }

  private void markReconciliation(String id) {
    transactions.executeWithoutResult(status -> db.update("UPDATE shop_order SET reconciliation_required=TRUE WHERE id=? AND status='PENDING_PAYMENT' AND payment_initiated=TRUE", id));
  }

  public List<String> expiredOrderIds() {
    return db.queryForList("SELECT id FROM shop_order WHERE status='PENDING_PAYMENT' AND expires_at<=CURRENT_TIMESTAMP AND expiry_retry_at<=CURRENT_TIMESTAMP ORDER BY expiry_retry_at,expires_at LIMIT 100", String.class);
  }

  private Order closePending(Order order, String actor, String action) {
    if (order.status().equals("CANCELLED")) return withItems(order);
    if (!order.status().equals("PENDING_PAYMENT"))
      throw ApiException.conflict("ORDER_NOT_CANCELLABLE", "当前订单不能取消");
    if (order.paymentInitiated()) {
      try {
        pay.closeOrder(order.orderNo());
      } catch (ApiException closeFailure) {
        // An uncertain close is not permission to restock. Query only reconciles a verified
        // successful payment or an explicitly CLOSED gateway order. NOT_EXIST is uncertain
        // after a timed-out prepay and must retain stock until a later safe reconciliation.
        Transaction remote = pay.queryOrder(order.orderNo());
        if (remote != null && Objects.equals(remote.getOutTradeNo(), order.orderNo())
            && Objects.equals(remote.getMchid(), pay.merchantId())
            && Objects.equals(remote.getAppid(), pay.appId())
            && remote.getTradeState() == Transaction.TradeStateEnum.SUCCESS) {
          completePayment(remote);
          return order(order.id(), order.userId(), false);
        }
        if (remote == null || remote.getTradeState() != Transaction.TradeStateEnum.CLOSED
            || !Objects.equals(remote.getOutTradeNo(), order.orderNo())
            || !Objects.equals(remote.getMchid(), pay.merchantId())
            || !Objects.equals(remote.getAppid(), pay.appId())) throw closeFailure;
      }
    }
    db.update("UPDATE shop_order SET status='CANCELLED',reconciliation_required=FALSE,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?", order.id());
    // Deterministic lock order prevents deadlocks for carts with more than one product.
    var items = withItems(order).items().stream().sorted(Comparator.comparing(OrderItem::productId)).toList();
    for (OrderItem item : items)
      db.update("UPDATE product SET stock=stock+?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?", item.quantity(), item.productId());
    activities.audit(actor, order.id(), action);
    return order(order.id(), order.userId(), false);
  }

  @Transactional
  public void completePayment(Transaction transaction) {
    if (transaction == null || transaction.getTradeState() != Transaction.TradeStateEnum.SUCCESS)
      throw new ApiException(400, "INVALID_PAYMENT_STATE", "支付通知状态无效");
    if (!pay.enabled() || !Objects.equals(transaction.getMchid(), pay.merchantId())
        || !Objects.equals(transaction.getAppid(), pay.appId()))
      throw new ApiException(400, "PAYMENT_MERCHANT_MISMATCH", "支付通知商户不匹配");
    var order =
        db.query(
                "SELECT * FROM shop_order WHERE order_no=? FOR UPDATE",
                orderMapper,
                transaction.getOutTradeNo())
            .stream()
            .findFirst()
            .orElseThrow(() -> new ApiException(400, "PAYMENT_ORDER_MISMATCH", "支付通知订单不存在"));
    if (transaction.getTransactionId() == null || transaction.getTransactionId().isBlank())
      throw new ApiException(400, "PAYMENT_TRANSACTION_REQUIRED", "支付通知缺少交易号");
    if (transaction.getAmount() == null
        || !Objects.equals(transaction.getAmount().getTotal(), order.totalCents())
        || !"CNY".equals(transaction.getAmount().getCurrency()))
      throw new ApiException(400, "PAYMENT_AMOUNT_MISMATCH", "支付通知金额不匹配");
    if (transaction.getTradeType() != Transaction.TradeTypeEnum.JSAPI
        || transaction.getPayer() == null
        || !Objects.equals(transaction.getPayer().getOpenid(), auth.wechatOpenid(order.userId())))
      throw new ApiException(400, "PAYMENT_PAYER_MISMATCH", "支付类型或付款账号不匹配");
    if (!order.status().equals("PENDING_PAYMENT")) {
      if (Objects.equals(order.paymentTransactionId(), transaction.getTransactionId())) return;
      throw ApiException.conflict("PAYMENT_ORDER_STATE_CONFLICT", "订单状态与支付通知冲突，请人工核对");
    }
    db.update(
        "UPDATE shop_order SET status='PAID',reconciliation_required=FALSE,payment_transaction_id=?,paid_at=CURRENT_TIMESTAMP,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?",
        transaction.getTransactionId(),
        order.id());
    activities.audit(order.userId(), order.id(), "ORDER_PAID");
  }

  @Transactional
  public Order ship(String id, long version, String actor) {
    Order order = lockOrder(id, null, true);
    if (order.version() != version)
      throw ApiException.conflict("STALE_VERSION", "订单已被修改，请刷新后重试");
    if (!order.status().equals("PAID"))
      throw ApiException.conflict("ORDER_NOT_SHIPPABLE", "只有已支付订单可以发货");
    db.update(
        "UPDATE shop_order SET status='SHIPPED',version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?",
        id);
    activities.audit(actor, id, "ORDER_SHIP");
    return order(id, null, true);
  }
}
