package com.wildboy;

import static com.wildboy.AddressModels.*;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/me/addresses")
public class AddressController {
  private final AddressService addresses;
  public AddressController(AddressService addresses) { this.addresses = addresses; }
  @GetMapping AddressList list(@AuthenticationPrincipal Models.User user) {
    return addresses.list(user.id());
  }
  @PostMapping ResponseEntity<Address> create(@AuthenticationPrincipal Models.User user,
      @Valid @RequestBody AddressInput input) {
    return ResponseEntity.status(201).body(addresses.create(user.id(), input));
  }
  @PutMapping("/{id}") Address update(@AuthenticationPrincipal Models.User user,
      @PathVariable String id, @Valid @RequestBody AddressInput input) {
    return addresses.update(user.id(), id, input);
  }
  @DeleteMapping("/{id}") ResponseEntity<Void> delete(@AuthenticationPrincipal Models.User user,
      @PathVariable String id) {
    addresses.delete(user.id(), id);
    return ResponseEntity.noContent().build();
  }
}
