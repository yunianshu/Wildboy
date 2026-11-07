package com.wildboy;

import jakarta.validation.constraints.*;
import java.time.OffsetDateTime;

public final class UserModels {
  private UserModels() {}

  public enum Role { USER, ADMIN }
  public enum AccountSource { WECHAT, PASSWORD, DEMO, OTHER }

  static AccountSource accountSource(String external) {
    if (external != null && external.startsWith("wechat:")) return AccountSource.WECHAT;
    if (external != null && external.startsWith("admin:")) return AccountSource.PASSWORD;
    if (external != null && (external.startsWith("dev:") || external.startsWith("smoke:"))) return AccountSource.DEMO;
    return AccountSource.OTHER;
  }

  public record RoleInput(@NotNull Role role, @NotNull @Min(0) Long version) {}

  public enum ProfileStatus {
    COMPLETE,
    INCOMPLETE
  }

  public record ProfileInput(
      @NotBlank @Size(max = 40) String realName,
      @NotBlank @Pattern(regexp = "1[3-9][0-9]{9}") String phone,
      @NotNull @Min(1) Long privacyVersion,
      @NotNull @Min(1) Long termsVersion) {}

  public record AdminUser(
      String id,
      String nickname,
      String realName,
      String phone,
      boolean profileCompleted,
      OffsetDateTime createdAt,
      OffsetDateTime profileUpdatedAt,
      long registrationCount,
      long confirmedRegistrationCount,
      OffsetDateTime lastRegistrationAt,
      String role,
      AccountSource accountSource,
      boolean wechatVerified,
      boolean canChangeRole,
      String roleChangeBlockReason,
      long version) {}

  public record AdminUserDetail(
      AdminUser user, Models.Page<Models.Registration> registrations) {}
}
