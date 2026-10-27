package com.wildboy;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.time.OffsetDateTime;
import java.util.List;

public final class ShopModels {
  public enum ProductStatus {
    ON_SALE,
    OFF_SHELF
  }

  public enum OrderStatus {
    PENDING_PAYMENT,
    PAID,
    CANCELLED,
    SHIPPED
  }

  public record Product(
      String id,
      String name,
      String description,
      String imageUrl,
      int priceCents,
      int stock,
      String status,
      long version,
      OffsetDateTime createdAt,
      OffsetDateTime updatedAt) {}

  public record ProductInput(
      @NotBlank @Size(max = 120) String name,
      @NotBlank @Size(max = 20000) String description,
      @NotBlank @Size(max = 2048) String imageUrl,
      @Min(1) @Max(100000000) int priceCents,
      @Min(0) @Max(1000000) int stock,
      @NotNull ProductStatus status,
      Long version) {}

  public record OrderItemInput(
      @NotBlank String productId, @Min(1) @Max(99) int quantity) {}

  public record OrderInput(
      @NotEmpty List<@Valid OrderItemInput> items,
      @NotBlank @Size(min = 2, max = 80) String recipientName,
      @NotBlank @Pattern(regexp = "[+0-9][0-9 ()-]{5,28}") String phone,
      @NotBlank @Size(min = 5, max = 300) String address,
      @NotNull @Min(1) Long privacyVersion,
      @NotNull @Min(1) Long termsVersion) {}

  public record OrderItem(
      String id,
      String productId,
      String productName,
      String imageUrl,
      int priceCents,
      int quantity) {}

  public record Order(
      String id,
      String orderNo,
      String userId,
      int totalCents,
      String status,
      String recipientName,
      String phone,
      String address,
      String paymentTransactionId,
      boolean paymentInitiated,
      OffsetDateTime paidAt,
      long version,
      OffsetDateTime createdAt,
      OffsetDateTime updatedAt,
      List<OrderItem> items) {}

  public record PaymentRequest(
      String timeStamp,
      String nonceStr,
      @com.fasterxml.jackson.annotation.JsonProperty("package") String packageValue,
      String signType,
      String paySign) {}

  public record ShipInput(@NotNull @Min(0) Long version) {}
}
