package com.wildboy;

import jakarta.validation.constraints.*;
import java.time.OffsetDateTime;

public final class RefundModels {
  public record RequestInput(@NotBlank @Size(max=200) String reason) {}
  public record DecisionInput(@NotNull @Min(0) Long version, @Size(max=200) String note) {}
  public record Refund(String id, String orderId, String orderNo, String userId, String outRefundNo,
      int amountCents, String reason, String status, String decisionNote, String lastError,
      String gatewayRefundId, long version, OffsetDateTime createdAt, OffsetDateTime updatedAt) {}
  public record GatewayResult(String outRefundNo, String orderNo, String transactionId, String refundId,
      long total, long refund, String currency, String status) {}
}
