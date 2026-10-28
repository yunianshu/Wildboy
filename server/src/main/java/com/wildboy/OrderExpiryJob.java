package com.wildboy;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

@Configuration
@EnableScheduling
public class OrderExpiryJob {
  private static final Logger log = LoggerFactory.getLogger(OrderExpiryJob.class);
  private final ShopService shop;
  public OrderExpiryJob(ShopService shop) { this.shop = shop; }

  @Scheduled(fixedDelayString="${wildboy.orders.expiry-scan-ms:60000}", initialDelayString="${wildboy.orders.expiry-scan-ms:60000}")
  public void expire() {
    for (String id : shop.expiredOrderIds()) {
      try { shop.expireOrder(id); }
      catch (RuntimeException failure) {
        // Do not log gateway bodies, buyer details or credentials. Retry on the next scan.
        log.warn("Order expiry deferred for order {} ({})", id, failure.getClass().getSimpleName());
      }
    }
  }
}
