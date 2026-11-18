package com.wildboy;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

/** 登记与业务状态原子提交；初次、手动和定时补报共用持久化领取、资格复核和退避。 */
@Service
public class ShippingReportService {
  private static final Logger log = LoggerFactory.getLogger(ShippingReportService.class);
  static final int MAX_ATTEMPTS = 8;
  private static final long[] BACKOFF_MINUTES = {1, 5, 15, 60, 240, 1440, 1440, 1440};
  private static final List<String> STATUSES = List.of("PENDING", "REPORTED", "FAILED", "SKIPPED");
  final JdbcTemplate db;
  final WechatShippingService wechat;
  private final TransactionTemplate tx;

  ShippingReportService(JdbcTemplate db, WechatShippingService wechat, PlatformTransactionManager manager) {
    this.db = db;
    this.wechat = wechat;
    tx = new TransactionTemplate(manager);
    // afterCommit 时原连接仍可能绑定；领取和完成必须使用新的、真正提交的事务。
    tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    tx.setTimeout(75);
  }

  /** 重复登记返回真实 ID，保留已有状态、次数和时间。 */
  @Transactional
  public String register(String source, String orderId, String orderNo, int logisticsType) {
    db.update("""
        INSERT INTO shipping_report(id,source,order_id,order_no,logistics_type) VALUES(?,?,?,?,?)
        ON CONFLICT(source,order_id) DO NOTHING
        """, UUID.randomUUID().toString(), source, orderId, orderNo, logisticsType);
    // 独立 SELECT 在 READ COMMITTED 下可看到并发 INSERT 的获胜行。
    return db.queryForObject("SELECT id FROM shipping_report WHERE source=? AND order_id=?",
        String.class, source, orderId);
  }

  /** 只接受当前领取者的一次完成；旧回调、重复回调和成功后的失败回调均无效。 */
  public void complete(String reportId, String token, WechatShippingService.UploadResult result) {
    if (token == null) return;
    var attempts = db.queryForList("SELECT attempts FROM shipping_report WHERE id=? AND attempt_token=? AND status<>'REPORTED' AND reported_at IS NULL",
        Integer.class, reportId, token);
    if (attempts.isEmpty()) return;
    if (result == null) result = WechatShippingService.UploadResult.failed(-1, "empty_upload_result");
    int count = attempts.getFirst();
    String status = switch (result.outcome()) {
      case REPORTED -> "REPORTED";
      case INAPPLICABLE -> "SKIPPED";
      case DISABLED -> "PENDING";
      case NOT_OPEN, RETRYABLE -> "FAILED";
    };
    OffsetDateTime next = null;
    if ("PENDING".equals(status)) {
      count = Math.max(0, count - 1);
      next = OffsetDateTime.now();
    } else if ("FAILED".equals(status) && count < MAX_ATTEMPTS) {
      long delay = BACKOFF_MINUTES[Math.min(count - 1, BACKOFF_MINUTES.length - 1)];
      if (result.outcome() == WechatShippingService.Outcome.NOT_OPEN) delay = Math.max(delay, 360);
      next = OffsetDateTime.now().plusMinutes(delay);
    }
    db.update("""
        UPDATE shipping_report SET status=?,attempts=?,last_errcode=?,last_error=?,next_retry_at=?,
          reported_at=CASE WHEN ?='REPORTED' THEN CURRENT_TIMESTAMP ELSE reported_at END,
          attempt_token=NULL,lease_until=NULL,updated_at=CURRENT_TIMESTAMP
        WHERE id=? AND attempt_token=? AND status<>'REPORTED' AND reported_at IS NULL
        """, status, count, result.errcode(), trim(result.error()), next, status, reportId, token);
  }

  /** 业务回滚不外呼；提交后的失败仅影响补报记录。 */
  public void submitAfterCommit(String id) {
    Runnable work = () -> {
      try { dispatch(id, false); }
      catch (RuntimeException e) { log.warn("Shipping report deferred report={} type={}", id, e.getClass().getSimpleName()); }
    };
    if (!TransactionSynchronizationManager.isSynchronizationActive()) { work.run(); return; }
    TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
      @Override public void afterCommit() { work.run(); }
    });
  }

  /** 人工补报也遵守正在执行的租约和冷却；耗尽后可在至少一分钟冷却后人工尝试。 */
  public Map<String, Object> retry(String id) {
    var row = get(id);
    if ("REPORTED".equals(row.get("status")) || row.get("reported_at") != null)
      throw ApiException.conflict("SHIPPING_ALREADY_REPORTED", "该订单已上报成功，无需补报");
    dispatch(id, true);
    return get(id);
  }

  public void retryDue() {
    if (!wechat.shippingEnabled()) return;
    var due = db.queryForList("""
        SELECT id FROM shipping_report WHERE status IN ('PENDING','FAILED') AND reported_at IS NULL
          AND next_retry_at<=CURRENT_TIMESTAMP AND attempts<?
          AND (lease_until IS NULL OR lease_until<=CURRENT_TIMESTAMP)
        ORDER BY next_retry_at,id LIMIT 50
        """, String.class, MAX_ATTEMPTS);
    for (String id : due) {
      try { dispatch(id, false); }
      catch (RuntimeException e) { log.warn("Shipping report deferred report={} type={}", id, e.getClass().getSimpleName()); }
    }
  }

  record Claim(String id, String source, String orderId, String token) {}

  /** 领取单独提交：进程中断仍保留次数和退避，租约到期后恢复。 */
  Claim claim(String id, boolean manual) {
    if (!wechat.shippingEnabled()) return null;
    return tx.execute(s -> {
      var rows = db.queryForList("SELECT * FROM shipping_report WHERE id=? FOR UPDATE", id);
      if (rows.isEmpty()) return null;
      var row = rows.getFirst();
      if ("REPORTED".equals(row.get("status")) || row.get("reported_at") != null) return null;
      String condition = manual
          ? "AND (next_retry_at<=CURRENT_TIMESTAMP OR (next_retry_at IS NULL AND updated_at<=CURRENT_TIMESTAMP-INTERVAL '1 minute'))"
          : "AND status IN ('PENDING','FAILED') AND attempts<" + MAX_ATTEMPTS + " AND next_retry_at<=CURRENT_TIMESTAMP";
      var token = UUID.randomUUID().toString();
      int count = ((Number) row.get("attempts")).intValue() + 1;
      OffsetDateTime next = count >= MAX_ATTEMPTS ? null
          : OffsetDateTime.now().plusMinutes(Math.max(2, BACKOFF_MINUTES[Math.min(count - 1, BACKOFF_MINUTES.length - 1)]));
      int changed = db.update("""
          UPDATE shipping_report SET attempt_token=?,lease_until=CURRENT_TIMESTAMP+INTERVAL '2 minutes',
            status='FAILED',attempts=attempts+1,last_errcode=-1,last_error='attempt_interrupted',
            next_retry_at=?,updated_at=CURRENT_TIMESTAMP
          WHERE id=? AND (lease_until IS NULL OR lease_until<=CURRENT_TIMESTAMP)
          """ + condition, token, next, id);
      return changed == 0 ? null : new Claim(id, (String) row.get("source"), (String) row.get("order_id"), token);
    });
  }

  private void dispatch(String id, boolean manual) {
    Claim claim = claim(id, manual);
    if (claim == null) return;
    try {
      tx.executeWithoutResult(s -> {
        // 与业务端一致，先锁订单再锁报告；同步外呼期间退款不能越过资格检查。
        String table = "shop".equals(claim.source()) ? "shop_order" : "activity_order";
        var orders = db.queryForList("SELECT * FROM " + table + " WHERE id=? FOR UPDATE", claim.orderId());
        var current = db.queryForList("SELECT id FROM shipping_report WHERE id=? AND attempt_token=? AND status<>'REPORTED' AND reported_at IS NULL FOR UPDATE",
            claim.id(), claim.token());
        if (current.isEmpty()) return;
        if (orders.isEmpty()) {
          complete(claim.id(), claim.token(), WechatShippingService.UploadResult.skipped("order_missing"));
          return;
        }
        var order = orders.getFirst();
        var blocked = ineligible(claim, order);
        var result = blocked != null ? blocked : upload(claim, order);
        complete(claim.id(), claim.token(), result);
      });
    } catch (RuntimeException e) {
      // 不输出异常 message/stack 或订单/收货数据；持久化领取保证数据库失败后仍会退避。
      tx.executeWithoutResult(s -> complete(claim.id(), claim.token(), WechatShippingService.UploadResult.failed(-1, "dispatch_failed")));
      log.warn("Shipping report attempt failed report={} type={}", id, e.getClass().getSimpleName());
    }
  }

  private WechatShippingService.UploadResult ineligible(Claim claim, Map<String, Object> order) {
    String status = (String) order.get("status");
    if (List.of("REFUNDED", "CANCELLED", "CLOSED").contains(status)
        || Boolean.TRUE.equals(order.get("organizer_cancelled")))
      return WechatShippingService.UploadResult.skipped("order_ineligible");
    String transaction = (String) order.get("payment_transaction_id");
    if (transaction == null || transaction.isBlank())
      return WechatShippingService.UploadResult.skipped("missing_transaction");
    String refundTable = "shop".equals(claim.source()) ? "refund_request" : "activity_order_refund";
    if (db.queryForObject("SELECT COUNT(*) FROM " + refundTable + " WHERE order_id=? AND status NOT IN ('REJECTED','CLOSED')",
        Integer.class, claim.orderId()) > 0 || "REFUND_PENDING".equals(status))
      return WechatShippingService.UploadResult.failed(-1, "refund_pending");
    if (!("shop".equals(claim.source()) ? "SHIPPED" : "PAID").equals(status))
      return WechatShippingService.UploadResult.failed(-1, "not_fulfilled");
    return null;
  }

  private WechatShippingService.UploadResult upload(Claim claim, Map<String, Object> o) {
    if ("shop".equals(claim.source())) {
      var items = db.queryForList("SELECT product_name,quantity FROM shop_order_item WHERE order_id=? ORDER BY id", claim.orderId())
          .stream().map(item -> new ShopModels.OrderItem("", "", (String) item.get("product_name"), "", 0,
              ((Number) item.get("quantity")).intValue(), 0, null)).toList();
      if (items.isEmpty()) return WechatShippingService.UploadResult.failed(-1, "shipping_payload_unavailable");
      var order = new ShopModels.Order(claim.orderId(), (String) o.get("order_no"), (String) o.get("user_id"),
          ((Number) o.get("total_cents")).intValue(), (String) o.get("status"), "", (String) o.get("phone"), "",
          (String) o.get("payment_transaction_id"), false, null, 0, null, null, null, false, items, 0, null, null, "", "");
      return wechat.uploadShopShipmentNow(order, (String) o.get("shipping_company"), (String) o.get("shipping_tracking_no"));
    }
    var order = new ActivityOrderModels.Order(claim.orderId(), (String) o.get("order_no"), (String) o.get("activity_id"),
        (String) o.get("activity_title"), (String) o.get("user_id"), (String) o.get("status"),
        ((Number) o.get("party_size")).intValue(), ((Number) o.get("original_total_cents")).intValue(),
        ((Number) o.get("total_cents")).intValue(), (String) o.get("currency"), null,
        (String) o.get("payment_transaction_id"), false, null, 0);
    return wechat.uploadActivityFulfillmentNow(order, (String) o.get("payment_transaction_id"));
  }

  public Models.Page<Map<String, Object>> list(int page, int size, String status) {
    ActivityService.pageCheck(page, size);
    boolean filtered = status != null && !status.isBlank();
    if (filtered && !STATUSES.contains(status)) throw new ApiException(400, "INVALID_STATUS", "上报状态无效");
    String where = filtered ? " WHERE r.status=?" : "";
    var args = new java.util.ArrayList<Object>();
    if (filtered) args.add(status);
    long total = db.queryForObject("SELECT COUNT(*) FROM shipping_report r" + where, Long.class, args.toArray());
    var queryArgs = new java.util.ArrayList<Object>(args);
    queryArgs.add(size);
    queryArgs.add(page * size);
    return new Models.Page<>(db.queryForList("""
        SELECT r.id,r.source,r.order_id,r.order_no,r.logistics_type,r.status,r.attempts,r.last_errcode,
          r.last_error,r.next_retry_at,r.reported_at,r.created_at,r.updated_at
        FROM shipping_report r""" + where + " ORDER BY r.updated_at DESC,r.id LIMIT ? OFFSET ?", queryArgs.toArray()),
        total, page, size, (long) (page + 1) * size < total);
  }

  public Map<String, Object> get(String id) {
    var rows = db.queryForList("""
        SELECT id,source,order_id,order_no,logistics_type,status,attempts,last_errcode,last_error,
          next_retry_at,reported_at,created_at,updated_at FROM shipping_report WHERE id=?
        """, id);
    if (rows.isEmpty()) throw ApiException.notFound();
    return rows.getFirst();
  }

  private static String trim(String value) {
    if (value == null) return "";
    return value.length() <= 200 ? value : value.substring(0, 200);
  }
}
