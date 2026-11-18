package com.wildboy;

import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 微信支付单「超时未发货」本地预警。
 *
 * <p>微信发货信息管理平台对超过 48 小时未发货的订单会通过消息推送催办
 * （trade_manage_remind_shipping，见 WechatMessagePushController）。在推送配置
 * 生效前后，本地都在 24 小时/40 小时两级提前落 audit_event 告警，与官方催办
 * 互补兜底；告警在运营异常列表（kind=SHIPPING）与审计流可见。
 *
 * <p>只针对有微信交易号的实物订单（免支付单无 48 小时约束）；退款处理中的订单
 * 由退款流程跟进，不重复告警。
 */
@Component
public class OrderShippingOverdueJob {
  private static final Logger log = LoggerFactory.getLogger(OrderShippingOverdueJob.class);
  /** 首级告警提前量（小时），给打包发货留足缓冲。 */
  static final int FIRST_WARNING_HOURS = 24;
  /** 第二级告警（小时），距平台 48 小时催办仅剩一个工作日内的缓冲。 */
  static final int FINAL_WARNING_HOURS = 40;

  private final JdbcTemplate db;

  public OrderShippingOverdueJob(JdbcTemplate db) {
    this.db = db;
  }

  @Scheduled(
      fixedDelayString = "${wildboy.orders.shipping-due-scan-ms:600000}",
      initialDelayString = "${wildboy.orders.shipping-due-scan-ms:600000}")
  public void scan() {
    try {
      warn();
    } catch (RuntimeException failure) {
      // 不输出订单或买家数据；下轮扫描继续。
      log.warn("Shipping overdue scan deferred ({})", failure.getClass().getSimpleName());
    }
  }

  void warn() {
    escalate(FIRST_WARNING_HOURS, "SHIPPING_DUE_" + FIRST_WARNING_HOURS + "H");
    escalate(FINAL_WARNING_HOURS, "SHIPPING_DUE_" + FINAL_WARNING_HOURS + "H");
  }

  /** 每个订单每级只告警一次；扫描到告警之间发货的订单由条件自然排除。 */
  private void escalate(int hours, String action) {
    var ids =
        db.queryForList(
            """
            SELECT id FROM shop_order
            WHERE status='PAID' AND payment_transaction_id IS NOT NULL
              AND paid_at<=CURRENT_TIMESTAMP-(? * INTERVAL '1 hour')
              AND NOT EXISTS(SELECT 1 FROM refund_request r WHERE r.order_id=shop_order.id
                AND r.status NOT IN ('REJECTED','CLOSED'))
              AND NOT EXISTS(SELECT 1 FROM audit_event a WHERE a.entity_id=shop_order.id AND a.action=?)
            ORDER BY paid_at LIMIT 50
            """,
            String.class, hours, action);
    for (String id : ids)
      db.update(
          """
          INSERT INTO audit_event(id,actor_id,entity_id,action)
          SELECT ?,'system',?,? WHERE NOT EXISTS(SELECT 1 FROM audit_event WHERE entity_id=? AND action=?)
          """,
          UUID.randomUUID().toString(), id, action, id, action);
  }
}
