package com.wildboy;

import static com.wildboy.Models.*;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/admin")
public class OperationsController {
  final ActivityCopyService copies; final OperationsService operations; final ShopService shop;
  public OperationsController(ActivityCopyService copies,OperationsService operations,ShopService shop){this.copies=copies;this.operations=operations;this.shop=shop;}
  @PostMapping("/activities/{id}/copy") Object copy(@PathVariable String id,@Valid @RequestBody ActivityCopyService.Copy in,@AuthenticationPrincipal User user){return copies.copy(id,in,user.id());}
  @PostMapping("/orders/{id}/verify") Object verify(@PathVariable String id){var order=shop.order(id,null,true);return shop.verifyPayment(id,order.userId());}
  @GetMapping("/dashboard") Object dashboard(@RequestParam(defaultValue="7") int days){return operations.dashboard(days);}
  @GetMapping("/exceptions") Object exceptions(@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size){return operations.exceptions(page,size);}
  @GetMapping("/audit") Object audit(@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size,@RequestParam(required=false) String entityId,@RequestParam(required=false) String action){return operations.audit(page,size,entityId,action);}
}
