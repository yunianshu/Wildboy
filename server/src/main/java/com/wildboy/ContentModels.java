package com.wildboy;

import java.util.List;
import jakarta.validation.constraints.*;
public final class ContentModels {
  public record Block(String type, String text, String url, String caption, List<List<String>> rows) {}
  public record Document(List<Block> blocks, long version) {}
  public record Input(@NotNull @Size(max=30) List<Block> blocks, @NotNull @Min(0) Long version) {}
}
