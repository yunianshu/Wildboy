package com.wildboy;

import jakarta.validation.constraints.*;
import java.util.List;

public final class AddressModels {
  private AddressModels() {}

  public record Address(String id, String recipientName, String phone, String address, boolean isDefault) {}
  public record AddressList(List<Address> items) {}
  public record AddressInput(
      @NotBlank @Size(min = 2, max = 40) String recipientName,
      @NotBlank @Pattern(regexp = "1[3-9][0-9]{9}") String phone,
      @NotBlank @Size(min = 5, max = 300) String address,
      boolean isDefault) {}
}
