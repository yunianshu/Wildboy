package com.wildboy;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import static com.wildboy.ContentModels.*;
@RestController @RequestMapping("/api/v1")
public class ContentController {
  final ContentService service;
  public ContentController(ContentService service){this.service=service;}
  @GetMapping("/activities/{id}/content") ContentService.PublicActivityContent activity(@PathVariable String id){return service.publicActivity(id);}
  @GetMapping("/shop/products/{id}/content") ProductDocument product(@PathVariable String id){return service.publicProduct(id);}
  @GetMapping("/admin/activities/{id}/content") Document adminActivity(@PathVariable String id){return service.get("activity",id,true);}
  @GetMapping("/admin/shop/products/{id}/content") Document adminProduct(@PathVariable String id){return service.get("product",id,true);}
  @PutMapping("/admin/activities/{id}/content") Document saveActivity(@PathVariable String id,@Valid @RequestBody Input in,@AuthenticationPrincipal Models.User user){return service.save("activity",id,in,user.id());}
  @PutMapping("/admin/shop/products/{id}/content") Document saveProduct(@PathVariable String id,@Valid @RequestBody Input in,@AuthenticationPrincipal Models.User user){return service.save("product",id,in,user.id());}
  @GetMapping("/admin/shop/products/{id}/content/markdown")
  MarkdownDocument productMarkdown(@PathVariable String id) {
    return service.productMarkdown(id);
  }
  @PutMapping("/admin/shop/products/{id}/content/markdown")
  MarkdownDocument saveProductMarkdown(@PathVariable String id, @Valid @RequestBody MarkdownInput input,
      @AuthenticationPrincipal Models.User user) {
    return service.saveProductMarkdown(id, input, user.id());
  }
}
