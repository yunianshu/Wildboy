package com.wildboy;

import java.time.OffsetDateTime;
import java.util.List;

/** Activity transactions are independent from merchandise orders and inventory. */
public final class ActivityOrderModels {
  private ActivityOrderModels() {}

  public record PriceLine(int unitPriceCents, int quantity, int chargedUnitPriceCents,
                          String tierId, String tierName, Long tierVersion,
                          String pricingMode, Integer pricingValue) {
    public PriceLine {
      if (unitPriceCents < 0 || chargedUnitPriceCents < 0 || chargedUnitPriceCents > unitPriceCents || quantity < 1)
        throw new IllegalArgumentException("Invalid activity price line");
    }
    public int originalTotal() { return Math.multiplyExact(unitPriceCents, quantity); }
    public int total() { return Math.multiplyExact(chargedUnitPriceCents, quantity); }
  }

  /** Created by server pricing only. Never deserialize an order's price from the client. */
  public record Quote(List<PriceLine> lines, String policyVersion) {
    public Quote {
      lines = List.copyOf(lines);
      if (lines.isEmpty() || policyVersion == null || policyVersion.isBlank())
        throw new IllegalArgumentException("Activity pricing policy required");
    }
    public int count() { return lines.stream().map(PriceLine::quantity).reduce(0, Math::addExact); }
    public int originalTotal() { return lines.stream().map(PriceLine::originalTotal).reduce(0, Math::addExact); }
    public int total() { return lines.stream().map(PriceLine::total).reduce(0, Math::addExact); }
  }

  public record Preview(int participants, int originalTotalCents, int totalCents, String currency, String participantPricing, Quote quote) {}

  public record Order(String id, String orderNo, String activityId, String activityTitle,
                      String userId, String status, int partySize, int originalTotalCents,
                      int totalCents, String currency, Quote quote, String paymentTransactionId,
                      boolean paymentAttempted, OffsetDateTime expiresAt, long version,
                      OffsetDateTime createdAt, String refundStatus) {
    public Order(String id, String orderNo, String activityId, String activityTitle,
        String userId, String status, int partySize, int originalTotalCents, int totalCents,
        String currency, Quote quote, String paymentTransactionId, boolean paymentAttempted,
        OffsetDateTime expiresAt, long version) {
      this(id, orderNo, activityId, activityTitle, userId, status, partySize, originalTotalCents,
          totalCents, currency, quote, paymentTransactionId, paymentAttempted, expiresAt, version, null, null);
    }
  }
}
