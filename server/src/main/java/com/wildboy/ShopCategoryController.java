package com.wildboy;

import static com.wildboy.ShopCategoryModels.*;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
public class ShopCategoryController {
  private final ShopCategoryService categories;
  public ShopCategoryController(ShopCategoryService categories) { this.categories=categories; }
  @GetMapping("/shop/categories") List<Category> categories() { return categories.categories(); }
  @GetMapping("/admin/shop/categories") List<AdminCategory> adminCategories() { return categories.adminCategories(); }
  @PostMapping("/admin/shop/categories") ResponseEntity<AdminCategory> create(
      @AuthenticationPrincipal Models.User actor, @Valid @RequestBody CreateInput input) {
    return ResponseEntity.status(201).body(categories.create(input,actor.id()));
  }
  @PutMapping("/admin/shop/categories/{id}") AdminCategory update(@PathVariable String id,
      @AuthenticationPrincipal Models.User actor, @Valid @RequestBody UpdateInput input) {
    return categories.update(id,input,actor.id());
  }
}
