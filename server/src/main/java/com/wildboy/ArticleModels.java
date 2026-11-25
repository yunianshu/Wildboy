package com.wildboy;

import jakarta.validation.constraints.*;
import java.time.OffsetDateTime;
import java.util.List;

public final class ArticleModels {
  public record Article(String id, String title, String summary, String coverUrl,
      String activityId, String status, boolean isOfficial, long version,
      OffsetDateTime publishedAt, OffsetDateTime updatedAt, List<Object> contentNodes) {}
  public record ArticleContent(String markdown, long version) {}
  public record ArticleContentInput(@NotNull @Size(max=200000) String markdown, @NotNull @Min(0) Long version) {}
  public record Input(@NotBlank @Size(max=120) String title, @Size(max=500) String summary,
      @Size(max=2048) String coverUrl, @Size(max=36) String activityId, @Min(0) Long version,
      @Size(max=200000) String markdown) {
    public Input(String title, String summary, String coverUrl, String activityId, Long version) {
      this(title, summary, coverUrl, activityId, version, null);
    }
  }
  public record VersionInput(@NotNull @Min(0) Long version) {}
}
