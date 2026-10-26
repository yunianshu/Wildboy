package com.wildboy;

import static com.wildboy.LegalModels.*;

import jakarta.validation.Valid;
import java.util.List;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
public class LegalController {
  private final LegalService legal;

  public LegalController(LegalService legal) {
    this.legal = legal;
  }

  @GetMapping("/legal/current")
  Current current() {
    return legal.current();
  }

  @GetMapping("/legal/{kind}/versions/{version}")
  Document version(@PathVariable Kind kind, @PathVariable long version) {
    return legal.version(kind, version);
  }

  @GetMapping("/admin/legal/{kind}")
  AdminDocument admin(@PathVariable Kind kind) {
    return legal.admin(kind);
  }

  @PutMapping("/admin/legal/{kind}/draft")
  AdminDocument save(
      @PathVariable Kind kind,
      @Valid @RequestBody DraftInput in,
      @AuthenticationPrincipal Models.User user) {
    return legal.save(kind, in, user.id());
  }

  @PostMapping("/admin/legal/{kind}/publish")
  Document publish(
      @PathVariable Kind kind,
      @Valid @RequestBody PublishInput in,
      @AuthenticationPrincipal Models.User user) {
    return legal.publish(kind, in.revision(), user.id());
  }

  @GetMapping("/admin/legal/{kind}/versions")
  List<Document> versions(@PathVariable Kind kind) {
    return legal.versions(kind);
  }

  @GetMapping("/me/consents")
  ConsentState state(@AuthenticationPrincipal Models.User user) {
    return legal.consentState(user.id());
  }

  @PostMapping("/me/consents")
  ConsentState accept(
      @AuthenticationPrincipal Models.User user, @Valid @RequestBody ConsentInput in) {
    legal.accept(user.id(), in.privacyVersion(), in.termsVersion(), "ACCEPT");
    return legal.consentState(user.id());
  }
}
