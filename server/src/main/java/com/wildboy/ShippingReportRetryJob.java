package com.wildboy;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** 微信发货上报自动补报：按退避计划扫描到期记录，重试耗尽后仅剩后台手动补报。 */
@Component
public class ShippingReportRetryJob {
  private static final Logger log = LoggerFactory.getLogger(ShippingReportRetryJob.class);
  private final ShippingReportService reports;
  public ShippingReportRetryJob(ShippingReportService reports) { this.reports = reports; }

  @Scheduled(
      fixedDelayString = "${wildboy.shipping.retry-scan-ms:60000}",
      initialDelayString = "${wildboy.shipping.retry-scan-ms:60000}")
  public void retryDue() {
    try {
      reports.retryDue();
    } catch (RuntimeException failure) {
      // Do not log gateway bodies or receiver details. Retry on the next scan.
      log.warn("Shipping report retry deferred ({})", failure.getClass().getSimpleName());
    }
  }
}
