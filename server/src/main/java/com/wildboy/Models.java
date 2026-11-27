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

  public record User(
      String id,
      String nickname,
      String role,
      UserModels.AccountSource accountSource,
      boolean wechatVerified,
      String realName,
      String phone,
      boolean profileCompleted,
      long version, String avatarUrl, boolean displayProfileCompleted) {}

  public record Login(String token, User user) {}

  public record NavigationPoint(
      @Size(max = 64) String id,
      @NotBlank @Pattern(regexp = "DESTINATION|MEETING|BOARDING") String kind,
      @NotBlank @Size(max = 200) String label,
      @Size(max = 300) String address,
      @DecimalMin("-90.0") @DecimalMax("90.0") Double latitude,
      @DecimalMin("-180.0") @DecimalMax("180.0") Double longitude) {}

  public record BoardingPointLocation(
      @NotBlank @Size(max = 200) String name,
      @Size(max = 300) String address,
      @DecimalMin("-90.0") @DecimalMax("90.0") Double latitude,
      @DecimalMin("-180.0") @DecimalMax("180.0") Double longitude,
      @Size(max = 200) String displayName) {
    public BoardingPointLocation(String name, String address, Double latitude, Double longitude) {
      this(name, address, latitude, longitude, null);
    }
  }

  public record AttendeeView(
      String nickname,
      String avatarUrl,
      int partySize,
      OffsetDateTime joinedAt) {}

  public record AttendeeSummary(
      List<AttendeeView> items,
      int totalParticipants,
      int totalUsers) {}

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
      OffsetDateTime updatedAt, boolean identityRequired,
      int confirmedCount, int pendingPaymentCount, List<String> boardingPoints,
      List<NavigationPoint> navigationPoints) {
    public Activity(
        String id, String title, Category category, String coverUrl, List<String> galleryUrls,
        String summary, String description, String location, String meetingPoint,
        OffsetDateTime startAt, OffsetDateTime endAt, OffsetDateTime registrationDeadline,
        int capacity, int registeredCount, String status, int priceCents, String currency,
        long version, OffsetDateTime createdAt, OffsetDateTime updatedAt, boolean identityRequired,
        int confirmedCount, int pendingPaymentCount, List<String> boardingPoints) {
      this(id, title, category, coverUrl, galleryUrls, summary, description, location, meetingPoint,
          startAt, endAt, registrationDeadline, capacity, registeredCount, status, priceCents,
          currency, version, createdAt, updatedAt, identityRequired, confirmedCount,
          pendingPaymentCount, boardingPoints, List.of());
    }
  }

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
      Long version, Boolean identityRequired,
      @Size(max = 20) List<@NotBlank @Size(max = 200) String> boardingPoints,
      @Size(max = 30) List<@Valid NavigationPoint> navigationPoints) {
    @com.fasterxml.jackson.annotation.JsonCreator
    public ActivityInput {}

    public ActivityInput(String title, Category category, String coverUrl, List<String> galleryUrls, String summary, String description, String location, String meetingPoint, OffsetDateTime startAt, OffsetDateTime endAt, OffsetDateTime registrationDeadline, int capacity, int priceCents, Long version, Boolean identityRequired, List<String> boardingPoints) {
      this(title, category, coverUrl, galleryUrls, summary, description, location, meetingPoint, startAt, endAt, registrationDeadline, capacity, priceCents, version, identityRequired, boardingPoints, null);
    }
    public ActivityInput(String title, Category category, String coverUrl, List<String> galleryUrls, String summary, String description, String location, String meetingPoint, OffsetDateTime startAt, OffsetDateTime endAt, OffsetDateTime registrationDeadline, int capacity, int priceCents, Long version, Boolean identityRequired) {
      this(title, category, coverUrl, galleryUrls, summary, description, location, meetingPoint, startAt, endAt, registrationDeadline, capacity, priceCents, version, identityRequired, null, null);
    }
    public ActivityInput(String title, Category category, String coverUrl, List<String> galleryUrls, String summary, String description, String location, String meetingPoint, OffsetDateTime startAt, OffsetDateTime endAt, OffsetDateTime registrationDeadline, int capacity, int priceCents, Long version) {
      this(title, category, coverUrl, galleryUrls, summary, description, location, meetingPoint, startAt, endAt, registrationDeadline, capacity, priceCents, version, false, null, null);
    }
  }

  public record BoardingPointInput(@NotBlank @Size(max = 200) String name) {}

  public record Participant(
      String id, String participantName, String idNumber, String phone, String boardingPoint) {
    public Participant(String id, String participantName, String idNumber, String phone) {
      this(id, participantName, idNumber, phone, null);
    }
  }

  public record ParticipantInput(
      @NotBlank @Size(min = 2, max = 80) String participantName,
      @Size(max = 18) String idNumber,
      @NotBlank @Pattern(regexp = "[+0-9][0-9 ()-]{5,28}") String phone,
      @Size(max = 200) String boardingPoint) {
    public ParticipantInput(String participantName, String idNumber, String phone) {
      this(participantName, idNumber, phone, null);
    }
  }

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
