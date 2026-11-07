package com.wildboy;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.*;

public final class AdminAccountModels {
  public record Capabilities(boolean adminLoginEnabled) {}

  public record Settings(
      boolean configured,
      String username,
      long version,
      boolean canConfigure,
      String configurationBlockReason) {}

  public record UpdateInput(
      @NotBlank @Size(max = 100) String username,
      @NotBlank @Size(max = 200) @JsonProperty(access = JsonProperty.Access.WRITE_ONLY) String newPassword,
      @NotBlank @Size(max = 200) @JsonProperty(access = JsonProperty.Access.WRITE_ONLY) String currentPassword,
      @NotNull @Min(0) Long version) {
    @Override public String toString() { return "AdminAccountUpdate[credentials redacted]"; }
  }
}
