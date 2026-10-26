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

  public ApiController(ActivityService activities, AuthService auth) {
    this.activities = activities;
    this.auth = auth;
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
      @RequestParam(defaultValue = "10") int size) {
    return activities.list(category, page, size, false);
  }

  @GetMapping("/activities/{id}")
  Activity get(@PathVariable String id) {
    return activities.get(id, false);
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
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "20") int size) {
    return activities.list(category, status, page, size, true);
  }

  @GetMapping("/admin/activities/{id}")
  Activity adminGet(@PathVariable String id) {
    return activities.get(id, true);
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

  @GetMapping("/admin/activities/{id}/registrations")
  Page<Registration> attendees(
      @PathVariable String id,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "20") int size) {
    activities.get(id, true);
    return activities.registrations(null, id, page, size);
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
            Map.of("code", "WEEKLY", "name", "本周活动"),
            Map.of("code", "DOMESTIC", "name", "国内游行"),
            Map.of("code", "HOLIDAY", "name", "假期活动"),
            Map.of("code", "LEISURE", "name", "休闲活动")),
        "equipment",
        List.of(
            Map.of(
                "id",
                "pack",
                "name",
                "轻量徒步装备",
                "imageUrl",
                "/assets/equipment.jpg",
                "description",
                "装备小店筹备中，仅作展示",
                "priceLabel",
                "敬请期待")),
        "paymentEnabled",
        false);
  }
}
