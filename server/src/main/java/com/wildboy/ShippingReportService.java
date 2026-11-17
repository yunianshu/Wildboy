package com.wildboy;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 微信发货上报状态落库：shipping_report 每个订单一条（source+order_id 唯一）。
 * register 在业务事务内建行（与发货/支付确认原子提交）；上报完成后 complete 记录结果，
 * 失败按退避计划 next_retry_at，由 ShippingReportRetryJob 自动补报，也可后台手动补报。
 */
@Service
public class ShippingReportService {
  private static final Logger log = LoggerFactory.getLogger(ShippingReportService.class);
  static final int MAX_ATTEMPTS = 8;
  private static final long[] BACKOFF_MINUTES = {1, 5, 15, 60, 240, 1440, 1440, 1440};
  private static final List<String> STATUSES = List.of("PENDING", "REPORTED", "FAILED", "SKIPPED");
  final JdbcTemplate db;
  final WechatShippingService wechat;
  ShippingReportService(JdbcTemplate db, WechatShippingService wechat) {
    this.db = db;
    this.wechat = wechat;
  }

  /** 业务事务内登记一条待上报记录；重复登记（幂等）会重置为待上报。 */
  @Transactional
  public String register(String source, String orderId, String orderNo, int logisticsType) {
    String id = UUID.randomUUID().toString();
    db.update(
        """
        INSERT INTO shipping_report(id,source,order_id,order_no,logistics_type) VALUES(?,?,?,?,?)
        ON CONFLICT(source,order_id) DO UPDATE SET status='PENDING',attempts=0,last_errcode=NULL,last_error='',
          next_retry_at=CURRENT_TIMESTAMP,reported_at=NULL,updated_at=CURRENT_TIMESTAMP
        """,
        id, source, orderId, orderNo, logisticsType);
    return id;
  }

  /** 记录一次上报外呼的结果；跳过表示该订单不需要/无法上报，不进入重试。 */
  public void complete(String reportId, WechatShippingService.UploadResult result) {
    if (!result.attempted()) {
      db.update(
          "UPDATE shipping_report SET status='SKIPPED',last_error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
          trim(result.error()), reportId);
      return;
    }
    if (result.errcode() == 0) {
      db.update(
          """
          UPDATE shipping_report SET status='REPORTED',reported_at=CURRENT_TIMESTAMP,attempts=attempts+1,
            last_errcode=0,last_error='',updated_at=CURRENT_TIMESTAMP WHERE id=?
          """,
          reportId);
      return;
    }
    Integer attempts = db.queryForObject("SELECT attempts FROM shipping_report WHERE id=?", Integer.class, reportId);
    if (attempts == null) return; // 记录已不存在（如被清理），忽略
    int next = attempts + 1;
    boolean exhausted = next >= MAX_ATTEMPTS;
    OffsetDateTime retryAt =
        exhausted ? null : OffsetDateTime.now().plusMinutes(BACKOFF_MINUTES[Math.min(attempts, BACKOFF_MINUTES.length - 1)]);
    db.update(
        """
        UPDATE shipping_report SET status='FAILED',attempts=?,last_errcode=?,last_error=?,next_retry_at=?,
          updated_at=CURRENT_TIMESTAMP WHERE id=?
        """,
        next, result.errcode(), trim(result.error()), retryAt, reportId);
  }

  /** 手动补报：REPORTED 之外的记录都可重新外呼一次。 */
  public Map<String, Object> retry(String id) {
    var rows = db.queryForList("SELECT id,source,order_id,status FROM shipping_report WHERE id=?", id);
    if (rows.isEmpty()) throw ApiException.notFound();
    var row = rows.getFirst();
    if ("REPORTED".equals(row.get("status")))
      throw ApiException.conflict("SHIPPING_ALREADY_REPORTED", "该订单已上报成功，无需补报");
    dispatch(id, (String) row.get("source"), (String) row.get("order_id"));
    return get(id);
  }

  /** 到期自动补报；上报未启用的环境（如测试）整体跳过，避免误标 SKIPPED。 */
  public void retryDue() {
    if (!wechat.shippingEnabled()) return;
    var due =
        db.queryForList(
            """
            SELECT id FROM shipping_report WHERE status IN ('PENDING','FAILED') AND next_retry_at IS NOT NULL
              AND next_retry_at<=CURRENT_TIMESTAMP AND attempts<? ORDER BY next_retry_at,id LIMIT 50
            """,
            String.class, MAX_ATTEMPTS);
    for (String id : due) {
      try {
        var row = db.queryForList("SELECT source,order_id FROM shipping_report WHERE id=?", id);
        if (row.isEmpty()) continue;
        dispatch(id, (String) row.getFirst().get("source"), (String) row.getFirst().get("order_id"));
      } catch (RuntimeException failure) {
        // 不记录响应体与收货人信息；下个扫描周期按退避计划继续。
        log.warn("发货信息补报延期 report={} ({})", id, failure.getClass().getSimpleName());
      }
    }
  }

  public Models.Page<Map<String, Object>> list(int page, int size, String status) {
    ActivityService.pageCheck(page, size);
    boolean filtered = status != null && !status.isBlank();
    if (filtered && !STATUSES.contains(status))
      throw new ApiException(400, "INVALID_STATUS", "上报状态无效");
    String where = filtered ? " WHERE r.status=?" : "";
    var args = new java.util.ArrayList<Object>();
    if (filtered) args.add(status);
    long total =
        db.queryForObject("SELECT COUNT(*) FROM shipping_report r" + where, Long.class, args.toArray());
    var queryArgs = new java.util.ArrayList<Object>(args);
    queryArgs.add(size);
    queryArgs.add(page * size);
    return new Models.Page<>(
        db.queryForList(
            """
            SELECT r.id,r.source,r.order_id,r.order_no,r.logistics_type,r.status,r.attempts,r.last_errcode,
              r.last_error,r.next_retry_at,r.reported_at,r.created_at,r.updated_at
            FROM shipping_report r""" + where + " ORDER BY r.updated_at DESC,r.id LIMIT ? OFFSET ?",
            queryArgs.toArray()),
        total,
        page,
        size,
        (long) (page + 1) * size < total);
  }

  public Map<String, Object> get(String id) {
    var rows =
        db.queryForList(
            """
            SELECT id,source,order_id,order_no,logistics_type,status,attempts,last_errcode,last_error,
              next_retry_at,reported_at,created_at,updated_at FROM shipping_report WHERE id=?
            """,
            id);
    if (rows.isEmpty()) throw ApiException.notFound();
    return rows.getFirst();
  }

  /** 按订单类型重建上报 payload 并外呼；结果经 complete 落库。 */
  private void dispatch(String reportId, String source, String orderId) {
    if ("shop".equals(source)) {
      var o =
          db.queryForMap(
              """
              SELECT order_no,user_id,phone,payment_transaction_id,shipping_company,shipping_tracking_no
              FROM shop_order WHERE id=?
              """,
              orderId);
      var items =
          db.queryForList(
                  "SELECT product_name,quantity FROM shop_order_item WHERE order_id=? ORDER BY id",
                  orderId)
              .stream()
              .map(
                  item ->
                      new ShopModels.OrderItem(
                          "", "", (String) item.get("product_name"), "", 0,
                          ((Number) item.get("quantity")).intValue(), 0, null))
              .toList();
      var order =
          new ShopModels.Order(
              orderId, (String) o.get("order_no"), (String) o.get("user_id"), 0, "", "",
              (String) o.get("phone"), "", (String) o.get("payment_transaction_id"), false, null, 0,
              null, null, null, false, items, 0, null, null, "", "");
      wechat.uploadShopShipment(
          order,
          (String) o.get("shipping_company"),
          (String) o.get("shipping_tracking_no"),
          r -> complete(reportId, r));
      return;
    }
    var o =
        db.queryForMap(
            """
            SELECT order_no,activity_id,activity_title,user_id,party_size,original_total_cents,total_cents,
              currency,payment_transaction_id FROM activity_order WHERE id=?
            """,
            orderId);
    var order =
        new ActivityOrderModels.Order(
            orderId,
            (String) o.get("order_no"),
            (String) o.get("activity_id"),
            (String) o.get("activity_title"),
            (String) o.get("user_id"),
            "PAID",
            ((Number) o.get("party_size")).intValue(),
            ((Number) o.get("original_total_cents")).intValue(),
            ((Number) o.get("total_cents")).intValue(),
            (String) o.get("currency"),
            null,
            (String) o.get("payment_transaction_id"),
            false,
            null, // 上报 payload 只用活动标题与人数，快照字段无需重建
            0);
    wechat.uploadActivityFulfillment(order, (String) o.get("payment_transaction_id"), r -> complete(reportId, r));
  }

  private static String trim(String value) {
    if (value == null) return "";
    return value.length() <= 200 ? value : value.substring(0, 200);
  }
}
