package com.wildboy;

import static com.wildboy.Models.*;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/admin")
public class OperationsController {
  final TemplateService templates; final OperationsService operations; final ShopService shop;
  public OperationsController(TemplateService templates,OperationsService operations,ShopService shop){this.templates=templates;this.operations=operations;this.shop=shop;}
  @GetMapping("/templates") Object templates(@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size){return templates.list(page,size);}
  @PostMapping("/templates") Object create(@Valid @RequestBody TemplateService.Input in,@AuthenticationPrincipal User user){return templates.save(null,in,user.id());}
  @PutMapping("/templates/{id}") Object edit(@PathVariable String id,@Valid @RequestBody TemplateService.Input in,@AuthenticationPrincipal User user){return templates.save(id,in,user.id());}
  @PostMapping("/templates/{id}/generate") Object generate(@PathVariable String id,@Valid @RequestBody TemplateService.Generate in,@AuthenticationPrincipal User user){return templates.generate(id,in,user.id());}
  @PostMapping("/activities/{id}/copy") Object copy(@PathVariable String id,@Valid @RequestBody TemplateService.Copy in,@AuthenticationPrincipal User user){return templates.copy(id,in,user.id());}
  @PostMapping("/orders/{id}/verify") Object verify(@PathVariable String id){var order=shop.order(id,null,true);return shop.verifyPayment(id,order.userId());}
  @GetMapping("/dashboard") Object dashboard(@RequestParam(defaultValue="7") int days){return operations.dashboard(days);}
  @GetMapping("/exceptions") Object exceptions(@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size){return operations.exceptions(page,size);}
  @GetMapping("/audit") Object audit(@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size,@RequestParam(required=false) String entityId){return operations.audit(page,size,entityId);}
}
