package com.wildboy;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.time.OffsetDateTime;
import java.util.List;

public final class MembershipModels {
  public enum CustomerType { GUEST, MEMBER, LEADER }
  public enum Scope { ACTIVITY, SHOP }
  public enum PricingMode { DISCOUNT, FIXED, REDUCTION }
  public record PricingRule(@NotNull Scope scope, boolean enabled,
      @NotNull PricingMode pricingMode, @Min(0) @Max(100000000) int pricingValue,
      @Pattern(regexp="ACCOUNT_ALL|ONE_BENEFIT") String participantPricing) {
    public PricingRule(Scope scope, boolean enabled, PricingMode pricingMode, int pricingValue) {
      this(scope, enabled, pricingMode, pricingValue, null);
    }
  }
  public record Tier(String id, String name, int sortOrder, boolean enabled,
      List<PricingRule> rules, long version) {}
  public record TierInput(@NotBlank @Size(max=40) String name, @Min(0) @Max(10000) int sortOrder,
      boolean enabled, @NotNull @Size(min=2,max=2) List<@NotNull @Valid PricingRule> rules, @Min(0) Long version) {}
  public record MembershipUser(String id, String nickname, String customerType, String tierId,
      String tierName, boolean tierEnabled, long version, OffsetDateTime createdAt) {}
  public record Assignment(@NotNull CustomerType customerType, @Size(max=36) String tierId,
      @NotNull @Min(0) Long version) {}
  // Immutable per-unit quotation, copied to each order item before any payment can start.
  public record Pricing(int originalPriceCents, int priceCents, String tierId, String tierName,
      Long tierVersion, String pricingMode, Integer pricingValue) {}
}
