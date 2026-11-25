package com.wildboy;

import static com.wildboy.HomeLayoutModels.*;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
public class HomeLayoutController {
  private final HomeLayoutService service;

  public HomeLayoutController(HomeLayoutService service) {
    this.service = service;
  }

  @GetMapping("/home/layout")
  public PublicHomeResponse publicLayout() {
    return service.publicHome();
  }

  @GetMapping("/admin/home/layout")
  public LayoutConfig adminLayout() {
    return service.get(true);
  }

  @PutMapping("/admin/home/layout")
  public LayoutConfig saveLayout(
      @RequestBody LayoutConfig input, @AuthenticationPrincipal Models.User user) {
    return service.save(input, user.id());
  }
}
