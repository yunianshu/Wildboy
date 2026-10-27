package com.wildboy;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.time.OffsetDateTime;
import java.util.List;

public final class Models {
  public enum Category {
    WEEKLY,
    DOMESTIC,
    HOLIDAY,
    LEISURE
  }

  public enum ActivityStatus {
    DRAFT,
    PUBLISHED,
    CANCELLED
  }

  public enum RegistrationStatus {
    CONFIRMED,
    CANCELLED
  }

  public record User(String id, String nickname, String role) {}

  public record Login(String token, User user) {}

  public record Activity(
      String id,
      String title,
      Category category,
      String coverUrl,
      List<String> galleryUrls,
      String summary,
      String description,
      String location,
      String meetingPoint,
      OffsetDateTime startAt,
      OffsetDateTime endAt,
      OffsetDateTime registrationDeadline,
      int capacity,
      int registeredCount,
      String status,
      int priceCents,
      String currency,
      long version,
      OffsetDateTime createdAt,
      OffsetDateTime updatedAt) {}

  public record ActivityInput(
      @NotBlank @Size(max = 120) String title,
      @NotNull Category category,
      @NotBlank @Size(max = 2048) String coverUrl,
      @Size(max = 12) List<@NotBlank @Size(max = 2048) String> galleryUrls,
      @NotBlank @Size(max = 300) String summary,
      @NotBlank @Size(max = 20000) String description,
      @NotBlank @Size(max = 200) String location,
      @NotBlank @Size(max = 200) String meetingPoint,
      @NotNull OffsetDateTime startAt,
      @NotNull OffsetDateTime endAt,
      @NotNull OffsetDateTime registrationDeadline,
      @Min(1) @Max(10000) int capacity,
      @Min(0) @Max(0) int priceCents,
      Long version) {}

  public record Participant(
      String id, String participantName, String idNumber, String phone) {}

  public record ParticipantInput(
      @NotBlank @Size(min = 2, max = 80) String participantName,
      @NotBlank @Pattern(regexp = "[0-9]{17}[0-9Xx]") String idNumber,
      @NotBlank @Pattern(regexp = "[+0-9][0-9 ()-]{5,28}") String phone) {}

  public record Registration(
      String id,
      String activityId,
      String activityTitle,
      String status,
      OffsetDateTime createdAt,
      List<Participant> participants) {}

  public record RegistrationInput(
      @NotEmpty List<@Valid ParticipantInput> participants,
      @NotNull @Min(1) Long privacyVersion,
      @NotNull @Min(1) Long termsVersion) {}

  public record VersionInput(@NotNull @Min(0) Long version) {}

  public record Page<T>(List<T> items, long total, int page, int size, boolean hasMore) {}

  public record RegisterResult(Registration registration, boolean created) {}

  public record WechatInput(
      @NotBlank @Size(max = 512) String code,
      @NotNull @Min(1) Long privacyVersion,
      @NotNull @Min(1) Long termsVersion) {}

  public record AdminInput(
      @NotBlank @Size(max = 100) String username, @NotBlank @Size(max = 200) String password) {}

  public record DevInput(
      @NotBlank @Pattern(regexp = "USER|ADMIN") String role,
      @Min(1) Long privacyVersion,
      @Min(1) Long termsVersion) {}
}
