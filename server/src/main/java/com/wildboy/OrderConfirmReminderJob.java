package com.wildboy;

import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 微信确认收货提醒：发货 72 小时后仍未确认收货的微信支付装备订单，
 * 调用 notify_confirm_receive 提醒用户（微信限制每支付单一次）。
 * 结算兜底仍在微信侧：用户未确认时发货后 T+10 自动确认并结算。
 */
@Component
public class OrderConfirmReminderJob {
  private static final Logger log = LoggerFactory.getLogger(OrderConfirmReminderJob.class);
  /** 发货后多少小时发送提醒；与微信 T+10 自动确认窗口保持充分距离。 */
  static final int REMIND_AFTER_HOURS = 72;

  private final JdbcTemplate db;
  private final WechatOrderCenterService wechatOrders;

  public OrderConfirmReminderJob(JdbcTemplate db, WechatOrderCenterService wechatOrders) {
    this.db = db;
    this.wechatOrders = wechatOrders;
  }

  @Scheduled(
      fixedDelayString = "${wildboy.shipping.retry-scan-ms:60000}",
      initialDelayString = "${wildboy.shipping.retry-scan-ms:60000}")
  public void remindDue() {
    try {
      remind();
    } catch (RuntimeException failure) {
      log.warn("Order confirm reminder deferred ({})", failure.getClass().getSimpleName());
    }
  }

  void remind() {
    List<String> due = db.query(
        "SELECT id FROM shop_order WHERE status='SHIPPED'"
            + " AND payment_transaction_id IS NOT NULL AND payment_transaction_id <> ''"
            + " AND receipt_confirmed_at IS NULL AND confirm_reminded_at IS NULL"
            + " AND shipped_at < CURRENT_TIMESTAMP - INTERVAL '" + REMIND_AFTER_HOURS + " hours'"
            + " ORDER BY shipped_at LIMIT 50",
        (r, n) -> r.getString("id"));
    for (String id : due) {
      String transactionId = db.queryForObject(
          "SELECT payment_transaction_id FROM shop_order WHERE id=?", String.class, id);
      var result = wechatOrders.notifyConfirmReceive(transactionId);
      // 未外呼（未启用/缺配置）不落库：环境开启后仍可补发。
      // 网络异常（errcode<0，请求未到达微信）与凭据类错误（token 无效/过期，提醒未送达）
      // 都不消耗「每支付单一次」的机会，下轮扫描重试；其余微信明确应答才记录。
      if (result.attempted() && result.errcode() >= 0
          && !WechatOrderCenterService.CREDENTIAL_ERRORS.contains(result.errcode())) {
        db.update(
            "UPDATE shop_order SET confirm_reminded_at=CURRENT_TIMESTAMP,"
                + "version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?",
            id);
        log.info("确认收货提醒已处理 order={} errcode={}", id, result.errcode());
      } else if (result.attempted()) {
        log.warn("Order confirm reminder deferred for order {}", id);
      }
    }
  }
}
