package com.wildboy;

import static com.wildboy.MembershipModels.*;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
public class MembershipController {
  private final MembershipService memberships;
  public MembershipController(MembershipService memberships) { this.memberships=memberships; }
  @GetMapping("/me/membership") MembershipUser me(@AuthenticationPrincipal Models.User user) { return memberships.me(user.id()); }
  @GetMapping("/admin/membership/tiers") List<Tier> tiers() { return memberships.tiers(); }
  @PostMapping("/admin/membership/tiers") ResponseEntity<Tier> create(@Valid @RequestBody TierInput input,@AuthenticationPrincipal Models.User user) { return ResponseEntity.status(201).body(memberships.create(input,user.id())); }
  @PutMapping("/admin/membership/tiers/{id}") Tier edit(@PathVariable String id,@Valid @RequestBody TierInput input,@AuthenticationPrincipal Models.User user) { return memberships.edit(id,input,user.id()); }
  @GetMapping("/admin/membership/users") Models.Page<MembershipUser> users(@RequestParam(required=false) String query,@RequestParam(required=false) CustomerType customerType,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size) { return memberships.users(query,customerType,page,size); }
  @PutMapping("/admin/membership/users/{id}") MembershipUser assign(@PathVariable String id,@Valid @RequestBody Assignment input,@AuthenticationPrincipal Models.User user) { return memberships.assign(id,input,user.id()); }
}
