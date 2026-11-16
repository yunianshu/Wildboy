package com.wildboy;

import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
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
    SHIPPED,
    REFUNDED,
    CONFIRMED_FREE
  }

  public record Product(
      String id,
      String name,
      String description,
      String imageUrl,
      String categoryId,
      String categoryName,
      int priceCents,
      int originalPriceCents,
      int stock,
      String status,
      long version,
      OffsetDateTime createdAt,
      OffsetDateTime updatedAt) {}

  public record ProductInput(
      @NotBlank @Size(max = 120) String name,
      @NotBlank @Size(max = 20000) String description,
      @NotBlank @Size(max = 2048) String imageUrl,
      @Size(max = 36) String categoryId,
      @Min(1) @Max(100000000) @JsonDeserialize(using = StrictIntegerDeserializer.class) int priceCents,
      @Min(1) @Max(100000000) @JsonDeserialize(using = StrictIntegerDeserializer.class) Integer originalPriceCents,
      @Min(0) @Max(1000000) @JsonDeserialize(using = StrictIntegerDeserializer.class) int stock,
      @NotNull ProductStatus status,
      Long version) {
    // Legacy shape used by demo seeding: no category, strikethrough price defaults to the price.
    public ProductInput(String name, String description, String imageUrl, int priceCents,
        int stock, ProductStatus status, Long version) {
      this(name, description, imageUrl, null, priceCents, null, stock, status, version);
    }
  }

  public record OrderItemInput(
      @NotBlank String productId, @Min(1) @Max(99) int quantity) {}

  public record OrderInput(
      @NotEmpty List<@Valid OrderItemInput> items,
      @NotBlank @Size(min = 2, max = 80) String recipientName,
      @NotBlank @Pattern(regexp = "[+0-9][0-9 ()-]{5,28}") String phone,
      @NotBlank @Size(min = 5, max = 300) String address,
      @NotNull @Min(1) Long privacyVersion,
      @NotNull @Min(1) Long termsVersion,
      @Size(max = 80) String requestId,
      @JsonDeserialize(using = StrictIntegerDeserializer.class) @Min(0) @Max(100000000) Integer expectedTotalCents) {
    public OrderInput(List<OrderItemInput> items, String recipientName, String phone, String address,
        Long privacyVersion, Long termsVersion, String requestId) {
      this(items, recipientName, phone, address, privacyVersion, termsVersion, requestId, null);
    }
    public OrderInput(List<OrderItemInput> items, String recipientName, String phone, String address,
        Long privacyVersion, Long termsVersion) {
      this(items, recipientName, phone, address, privacyVersion, termsVersion, null);
    }
  }

  public record OrderItem(
      String id,
      String productId,
      String productName,
      String imageUrl,
      int priceCents,
      int quantity,
      int originalPriceCents,
      String tierName) {}

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
      OffsetDateTime expiresAt,
      boolean reconciliationRequired,
      List<OrderItem> items,
      int originalTotalCents) {}

  public record Quote(String productId, int quantity, int originalTotalCents, int totalCents, MembershipModels.Pricing pricing) {}

  public record PaymentRequest(
      String timeStamp,
      String nonceStr,
      @com.fasterxml.jackson.annotation.JsonProperty("package") String packageValue,
      String signType,
      String paySign) {}

  public record ShipInput(
      @NotNull @Min(0) Long version,
      @Size(max = 64) String company,
      @Size(max = 64) String trackingNo) {}
}
