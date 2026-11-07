package com.wildboy;

import static com.wildboy.AdminAccountModels.*;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
public class AdminAccountController {
  private final AdminAccountService accounts;
  public AdminAccountController(AdminAccountService accounts) { this.accounts = accounts; }

  @GetMapping("/auth/capabilities")
  Capabilities capabilities() { return accounts.capabilities(); }

  @GetMapping("/admin/settings/admin-account")
  Settings settings(@AuthenticationPrincipal Models.User actor) { return accounts.settings(actor); }

  @PutMapping("/admin/settings/admin-account")
  Settings update(@AuthenticationPrincipal Models.User actor,
      @RequestHeader(value = "Authorization", required = false) String bearer,
      @Valid @RequestBody UpdateInput input) {
    return accounts.update(actor, bearer, input);
  }
}
