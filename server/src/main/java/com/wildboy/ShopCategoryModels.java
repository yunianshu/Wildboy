package com.wildboy;

import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import jakarta.validation.constraints.*;

public final class ShopCategoryModels {
  private ShopCategoryModels() {}
  public record Category(String id, String name, int sortOrder, long version) {}
  public record AdminCategory(String id, String name, int sortOrder, long version, long productCount) {}
  public record CreateInput(@NotBlank @Size(max=40) String name,
      @NotNull @Min(0) @Max(9999) @JsonDeserialize(using=StrictIntegerDeserializer.class) Integer sortOrder) {}
  public record UpdateInput(@NotBlank @Size(max=40) String name,
      @NotNull @Min(0) @Max(9999) @JsonDeserialize(using=StrictIntegerDeserializer.class) Integer sortOrder,
      @NotNull @Min(0) Long version) {}
}
