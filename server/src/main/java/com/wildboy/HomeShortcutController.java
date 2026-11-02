package com.wildboy;

import static com.wildboy.HomeShortcutModels.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
public class HomeShortcutController {
  private final HomeShortcutService service;
  public HomeShortcutController(HomeShortcutService service) {this.service=service;}
  @GetMapping("/home/shortcuts") public Configuration get() {return service.get(false);}
  @GetMapping("/admin/home/shortcuts") public Configuration adminGet() {return service.get(true);}
  @PutMapping("/admin/home/shortcuts") public Configuration save(@RequestBody Configuration input,@AuthenticationPrincipal Models.User user) {return service.save(input,user.id());}
}
