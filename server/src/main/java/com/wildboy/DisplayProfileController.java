package com.wildboy;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/me/display-profile")
public class DisplayProfileController {
  private final DisplayProfileService profiles;
  public DisplayProfileController(DisplayProfileService profiles) { this.profiles = profiles; }
  public record Input(@Size(max=80) String nickname, @Size(max=2796204) String avatarBase64) {}
  @PutMapping
  Models.User update(@AuthenticationPrincipal Models.User user, @Valid @RequestBody Input input) {
    return profiles.update(user, input);
  }
}