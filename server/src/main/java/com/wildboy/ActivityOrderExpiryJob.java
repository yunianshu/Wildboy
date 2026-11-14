package com.wildboy;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class ActivityOrderExpiryJob {
  private static final org.slf4j.Logger log=org.slf4j.LoggerFactory.getLogger(ActivityOrderExpiryJob.class);
  private final ActivityOrderService orders;
  public ActivityOrderExpiryJob(ActivityOrderService orders){this.orders=orders;}
  @Scheduled(fixedDelayString="${wildboy.activity-orders.expiry-scan-ms:60000}",initialDelayString="${wildboy.activity-orders.expiry-scan-ms:60000}")
  public void reconcile(){try{orders.closeExpired();}catch(Exception e){log.warn("Activity order reconciliation deferred; reservations retained");}}
}
