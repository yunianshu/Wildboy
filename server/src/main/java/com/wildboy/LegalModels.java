package com.wildboy;

import jakarta.validation.constraints.*;
import java.time.OffsetDateTime;

public final class LegalModels {
  public enum Kind {
    PRIVACY,
    TERMS
  }

  public record Document(
      Kind kind, long version, String title, String content, OffsetDateTime publishedAt) {}

  public record Draft(String title, String content, long revision) {}

  public record AdminDocument(Kind kind, Draft draft, Document published) {}

  public record Current(boolean ready, Document privacy, Document terms) {}

  public record DraftInput(
      @NotBlank @Size(max = 120) String title,
      @NotBlank @Size(min = 10, max = 50000) String content,
      @NotNull @Min(0) Long revision) {}

  public record PublishInput(@NotNull @Min(0) Long revision) {}

  public record ConsentInput(
      @NotNull @Min(1) Long privacyVersion, @NotNull @Min(1) Long termsVersion) {}

  public record Versions(Long privacyVersion, Long termsVersion) {}

  public record Accepted(long privacyVersion, long termsVersion, OffsetDateTime acceptedAt) {}

  public record ConsentState(
      boolean ready, Versions current, Accepted accepted, boolean requiresConsent) {}
}
