package com.wildboy;

import static com.wildboy.Models.*;

import jakarta.validation.Valid;
import java.util.*;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
public class ApiController {
  final ActivityService activities;
  final AuthService auth;
  final ShopService shop;
  final WechatPayService pay;

  public ApiController(
      ActivityService activities, AuthService auth, ShopService shop, WechatPayService pay) {
    this.activities = activities;
    this.auth = auth;
    this.shop = shop;
    this.pay = pay;
  }

  @PostMapping("/auth/wechat")
  Login wechat(@Valid @RequestBody WechatInput in) {
    return auth.wechat(in.code(), in.privacyVersion(), in.termsVersion());
  }

  @PostMapping("/auth/admin")
  Login admin(@Valid @RequestBody AdminInput in) {
    return auth.admin(in.username(), in.password());
  }

  @PostMapping("/auth/dev-login")
  Login dev(@Valid @RequestBody DevInput in) {
    return auth.dev(in.role(), in.privacyVersion(), in.termsVersion());
  }

  @GetMapping("/me")
  User me(@AuthenticationPrincipal User user) {
    return user;
  }

  @GetMapping("/activities")
  Page<Activity> list(
      @RequestParam(required = false) Category category,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "10") int size,
      @RequestParam(required = false) String title) {
    return activities.list(category, null, title, page, size, false);
  }

  @GetMapping("/activities/{id}")
  Activity get(@PathVariable String id) {
    return activities.get(id, false);
  }

  @GetMapping("/activities/{id}/attendees")
  AttendeeSummary attendeesPublic(@PathVariable String id) {
    return activities.publicAttendees(id);
  }

  @GetMapping("/me/registrations")
  Page<Registration> mine(
      @AuthenticationPrincipal User user,
      @RequestParam(required = false) RegistrationStatus status,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "20") int size) {
    return activities.registrations(user.id(), null, status, page, size);
  }

  @GetMapping("/activities/{id}/registrations/me")
  Object own(@PathVariable String id, @AuthenticationPrincipal User user) {
    activities.get(id, false);
    var result = activities.own(id, user.id());
    return result == null ? com.fasterxml.jackson.databind.node.NullNode.getInstance() : result;
  }

  @PostMapping("/activities/{id}/registrations")
  ResponseEntity<Registration> register(
      @PathVariable String id,
      @AuthenticationPrincipal User user,
      @Valid @RequestBody RegistrationInput input) {
    var r = activities.register(id, user.id(), input);
    return ResponseEntity.status(r.created() ? 201 : 200).body(r.registration());
  }

  @DeleteMapping("/activities/{id}/registrations/me")
  ResponseEntity<Void> cancelOwn(@PathVariable String id, @AuthenticationPrincipal User user) {
    activities.cancelOwn(id, user.id());
    return ResponseEntity.noContent().build();
  }

  @GetMapping("/admin/activities")
  Page<Activity> adminList(
      @RequestParam(required = false) Category category,
      @RequestParam(required = false) ActivityStatus status,
      @RequestParam(required = false) String title,
      @RequestParam(required = false) String keyword,
      @RequestParam(defaultValue = "false") boolean upcomingFull,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "20") int size) {
    return activities.list(category, status, title, keyword, page, size, true, upcomingFull);
  }

  @GetMapping("/admin/activities/{id}")
  Activity adminGet(@PathVariable String id) {
    return activities.get(id, true);
  }

  @GetMapping("/admin/activity-boarding-points")
  List<String> adminBoardingPoints() {
    return activities.listBoardingPoints();
  }

  @PostMapping("/admin/activity-boarding-points")
  Map<String, String> saveBoardingPoint(@Valid @RequestBody BoardingPointInput input) {
    return Map.of("name", activities.saveBoardingPoint(input.name()));
  }

  @GetMapping("/admin/activity-boarding-point-locations")
  List<BoardingPointLocation> adminBoardingPointLocations() {
    return activities.listBoardingPointLocations();
  }

  @PostMapping("/admin/activity-boarding-point-locations")
  BoardingPointLocation saveBoardingPointLocation(@Valid @RequestBody BoardingPointLocation input) {
    return activities.saveBoardingPointLocation(input);
  }

  @PostMapping("/admin/activities")
  ResponseEntity<Activity> create(
      @Valid @RequestBody ActivityInput input, @AuthenticationPrincipal User user) {
    return ResponseEntity.status(201).body(activities.create(input, user.id()));
  }

  @PutMapping("/admin/activities/{id}")
  Activity edit(
      @PathVariable String id,
      @Valid @RequestBody ActivityInput input,
      @AuthenticationPrincipal User user) {
    return activities.edit(id, input, user.id());
  }

  @PostMapping("/admin/activities/{id}/publish")
  Activity publish(
      @PathVariable String id,
      @Valid @RequestBody VersionInput input,
      @AuthenticationPrincipal User user) {
    return activities.publish(id, input.version(), user.id());
  }

  @PostMapping("/admin/activities/{id}/cancel")
  Activity cancel(
      @PathVariable String id,
      @Valid @RequestBody VersionInput input,
      @AuthenticationPrincipal User user) {
    return activities.cancel(id, input.version(), user.id());
  }

  @PostMapping("/admin/activities/{id}/reopen")
  Activity reopen(
      @PathVariable String id,
      @Valid @RequestBody VersionInput input,
      @AuthenticationPrincipal User user) {
    return activities.reopenToDraft(id, input.version(), user.id());
  }

  @GetMapping("/admin/activities/{id}/registrations")
  Page<Registration> attendees(
      @PathVariable String id,
      @RequestParam(required = false) RegistrationStatus status,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "20") int size,
      @RequestParam(required = false) String query) {
    activities.get(id, true);
    return activities.registrations(null, id, status, page, size, query);
  }

  @GetMapping("/admin/activities/{id}/registrations/export")
  ResponseEntity<List<ActivityService.RosterExportRow>> exportAttendees(
      @PathVariable String id, @RequestParam(required = false) RegistrationStatus status,
      @RequestParam(required = false) String query) {
    return ResponseEntity.ok().cacheControl(org.springframework.http.CacheControl.noStore())
        .body(activities.exportRoster(id, status, query));
  }

  @PostMapping("/admin/privacy/encrypt-legacy-identities")
  Map<String, Integer> encryptLegacyIdentities(@AuthenticationPrincipal User user) {
    return activities.encryptLegacyIdentities(user.id());
  }

  @PostMapping("/admin/activities/{id}/participants/{participantId}/reveal")
  Participant revealParticipant(@PathVariable String id, @PathVariable String participantId, @AuthenticationPrincipal User user) {
    return activities.revealParticipant(id, participantId, user.id());
  }

  @GetMapping("/home")
  Map<String, Object> home() {
    var featured = activities.list(null, 0, 3, false).items();
    var banners =
        featured.stream()
            .map(
                a ->
                    Map.of(
                        "id",
                        a.id(),
                        "title",
                        a.title(),
                        "subtitle",
                        a.summary(),
                        "imageUrl",
                        a.coverUrl(),
                        "activityId",
                        a.id()))
            .toList();
    return Map.of(
        "banners",
        banners,
        "categories",
        List.of(
            Map.of("code", "WEEKLY", "name", "户外活动"),
            Map.of("code", "DOMESTIC", "name", "户外旅行"),
            Map.of("code", "HOLIDAY", "name", "重装露营"),
            Map.of("code", "LEISURE", "name", "休闲活动")),
        "equipment",
        shop.products(false).stream()
            .limit(6)
            .map(
                product ->
                    Map.of(
                        "id", product.id(),
                        "name", product.name(),
                        "imageUrl", product.imageUrl(),
                        "description", product.description(),
                        "categoryName", product.categoryName() == null ? "" : product.categoryName(),
                        "priceCents", product.priceCents(),
                        "originalPriceCents", product.originalPriceCents(),
                        "priceLabel", String.format("¥%.2f", product.priceCents() / 100.0)))
            .toList(),
        "paymentEnabled",
        pay.enabled());
  }
}
