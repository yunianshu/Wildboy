package com.wildboy;

import static com.wildboy.Models.*;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
public class NotificationController {
  private final NotificationService notifications;

  public NotificationController(NotificationService notifications) {
    this.notifications = notifications;
  }

  @GetMapping("/notifications/config")
  Object config() { return notifications.config(); }

  public record SubscribeInput(boolean accepted) {}

  @PostMapping("/me/notifications/subscribe")
  void subscribe(@AuthenticationPrincipal User user, @RequestBody(required = false) SubscribeInput in) {
    notifications.subscribe(user.id(), in != null && in.accepted());
  }

  @GetMapping("/me/notifications")
  Page<NotificationService.Notice> notices(@AuthenticationPrincipal User user,
      @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
    return notifications.list(user.id(), page, size);
  }

  @GetMapping("/admin/notifications")
  Page<NotificationService.Notice> adminNotices(@RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "20") int size, @RequestParam(required = false) String status) {
    return notifications.list(null, page, size, status);
  }

  @PostMapping("/admin/notifications/{id}/retry")
  void retry(@PathVariable String id, @AuthenticationPrincipal User user) {
    notifications.retry(id, user.id());
  }
}
