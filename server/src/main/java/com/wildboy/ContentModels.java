package com.wildboy;

import java.util.List;
import jakarta.validation.constraints.*;
public final class ContentModels {
  public record Block(String type, String text, String url, String caption, List<List<String>> rows) {}
  public record Document(List<Block> blocks, long version) {}
  public record Input(@NotNull @Size(max=30) List<Block> blocks, @NotNull @Min(0) Long version) {}
  public record ProductDocument(List<Block> blocks, long version, List<Object> contentNodes) {}
  public record MarkdownDocument(String markdown, long version) {}
  public record MarkdownInput(@NotNull @Size(max=ArticleMarkdown.MAX_LENGTH) String markdown,
                              @NotNull @Min(0) Long version) {}
}
