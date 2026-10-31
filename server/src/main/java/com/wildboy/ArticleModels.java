package com.wildboy;

import jakarta.validation.constraints.*;
import java.time.OffsetDateTime;
import java.util.List;

public final class ArticleModels {
  public record Article(String id, String title, String summary, String coverUrl,
      String activityId, String status, boolean isOfficial, long version,
      OffsetDateTime publishedAt, OffsetDateTime updatedAt, List<ContentModels.Block> blocks) {}
  public record Input(@NotBlank @Size(max=120) String title, @Size(max=500) String summary,
      @Size(max=2048) String coverUrl, @Size(max=36) String activityId, @Min(0) Long version) {}
  public record VersionInput(@NotNull @Min(0) Long version) {}
}
