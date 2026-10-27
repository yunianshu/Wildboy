package com.wildboy;

import static com.wildboy.Models.Page;
import static com.wildboy.ShopModels.*;

import com.wechat.pay.java.service.payments.model.Transaction;
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

  public ShopService(
      JdbcTemplate db,
      LegalService legal,
      AuthService auth,
      ActivityService activities,
      WechatPayService pay) {
    this.db = db;
    this.legal = legal;
    this.auth = auth;
    this.activities = activities;
    this.pay = pay;
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
        "INSERT INTO shop_order(id,order_no,user_id,total_cents,status,recipient_name,phone,address) VALUES(?,?,?,?,'PENDING_PAYMENT',?,?,?)",
        id,
        orderNo,
        userId,
        (int) total,
        recipient,
        phone,
        address);
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

  public ShopModels.PaymentRequest payment(String id, String userId) {
    Order order = order(id, userId, false);
    if (!order.status().equals("PENDING_PAYMENT"))
      throw ApiException.conflict("ORDER_NOT_PAYABLE", "当前订单状态不可支付");
    String openid = auth.wechatOpenid(userId);
    var payment = pay.prepay(order, openid);
    db.update(
        "UPDATE shop_order SET payment_initiated=TRUE,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='PENDING_PAYMENT'",
        id);
    return payment;
  }

  @Transactional
  public Order cancelOrder(String id, String userId) {
    Order order = lockOrder(id, userId, false);
    if (order.status().equals("CANCELLED")) return withItems(order);
    if (!order.status().equals("PENDING_PAYMENT"))
      throw ApiException.conflict("ORDER_NOT_CANCELLABLE", "当前订单不能取消");
    if (order.paymentInitiated()) pay.closeOrder(order.orderNo());
    db.update(
        "UPDATE shop_order SET status='CANCELLED',version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?",
        id);
    db.update(
        "UPDATE product SET stock=stock+oi.quantity,version=product.version+1,updated_at=CURRENT_TIMESTAMP FROM shop_order_item oi WHERE product.id=oi.product_id AND oi.order_id=?",
        id);
    activities.audit(userId, id, "ORDER_CANCEL");
    return order(id, userId, false);
  }

  @Transactional
  public void completePayment(Transaction transaction) {
    if (transaction.getTradeState() != Transaction.TradeStateEnum.SUCCESS) return;
    if (!pay.enabled() || !Objects.equals(transaction.getMchid(), pay.merchantId()))
      throw new ApiException(400, "PAYMENT_MERCHANT_MISMATCH", "支付通知商户不匹配");
    var order =
        db.query(
                "SELECT * FROM shop_order WHERE order_no=? FOR UPDATE",
                orderMapper,
                transaction.getOutTradeNo())
            .stream()
            .findFirst()
            .orElseThrow(() -> new ApiException(400, "PAYMENT_ORDER_MISMATCH", "支付通知订单不存在"));
    if (transaction.getAmount() == null
        || transaction.getAmount().getTotal() != order.totalCents())
      throw new ApiException(400, "PAYMENT_AMOUNT_MISMATCH", "支付通知金额不匹配");
    if (!order.status().equals("PENDING_PAYMENT")) {
      if (Objects.equals(order.paymentTransactionId(), transaction.getTransactionId())) return;
      throw ApiException.conflict("PAYMENT_ORDER_STATE_CONFLICT", "订单状态与支付通知冲突，请人工核对");
    }
    db.update(
        "UPDATE shop_order SET status='PAID',payment_transaction_id=?,paid_at=CURRENT_TIMESTAMP,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?",
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
