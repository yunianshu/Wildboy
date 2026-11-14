package com.wildboy;

import static com.wildboy.Models.*;
import static com.wildboy.UserModels.*;

import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
public class UserController {
  private final UserService users;

  public UserController(UserService users) {
    this.users = users;
  }

  @PutMapping("/me/profile")
  User updateProfile(@AuthenticationPrincipal User user, @Valid @RequestBody ProfileInput input) {
    return users.updateProfile(user, input);
  }

  @GetMapping("/admin/users")
  Page<AdminUser> list(
      @AuthenticationPrincipal User actor,
      @RequestParam(required = false) String query,
      @RequestParam(required = false) ProfileStatus profile,
      @RequestParam(required = false) Role role,
      @RequestParam(required = false) AccountSource accountSource,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "20") int size) {
    return users.list(actor, query, profile, role, accountSource, page, size);
  }

  @GetMapping("/admin/users/{id}")
  AdminUserDetail detail(
      @AuthenticationPrincipal User actor,
      @PathVariable String id,
      @RequestParam(required = false) AdminRegistrationStatus status,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "20") int size) {
    return users.detail(actor, id, status, page, size);
  }

  @PutMapping("/admin/users/{id}/role")
  AdminUser changeRole(@PathVariable String id, @AuthenticationPrincipal User actor,
      @RequestHeader("Authorization") String bearer, @Valid @RequestBody RoleInput input) {
    return users.changeRole(actor, bearer, id, input);
  }
}
