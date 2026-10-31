package com.wildboy;

import static com.wildboy.ArticleModels.*;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController @RequestMapping("/api/v1")
public class ArticleController {
  final ArticleService service;
  public ArticleController(ArticleService service){this.service=service;}
  @GetMapping("/articles") Models.Page<Article> list(@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="10") int size){return service.list(page,size,false);}
  @GetMapping("/articles/official") Article official(){return service.official();}
  @GetMapping("/articles/{id}") Article get(@PathVariable String id){return service.get(id,false);}
  @GetMapping("/admin/articles") Models.Page<Article> adminList(@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size){return service.list(page,size,true);}
  @GetMapping("/admin/articles/{id}") Article adminGet(@PathVariable String id){return service.get(id,true);}
  @PostMapping("/admin/articles") Article create(@Valid @RequestBody Input in,@AuthenticationPrincipal Models.User user){return service.create(in,user.id());}
  @PutMapping("/admin/articles/{id}") Article update(@PathVariable String id,@Valid @RequestBody Input in,@AuthenticationPrincipal Models.User user){return service.update(id,in,user.id());}
  @GetMapping("/admin/articles/{id}/content") ContentModels.Document content(@PathVariable String id){return service.content(id);}
  @PutMapping("/admin/articles/{id}/content") ContentModels.Document saveContent(@PathVariable String id,@Valid @RequestBody ContentModels.Input in,@AuthenticationPrincipal Models.User user){return service.saveContent(id,in,user.id());}
  @PostMapping("/admin/articles/{id}/publish") Article publish(@PathVariable String id,@Valid @RequestBody VersionInput in,@AuthenticationPrincipal Models.User user){return service.action(id,in.version(),"publish",user.id());}
  @PostMapping("/admin/articles/{id}/unpublish") Article unpublish(@PathVariable String id,@Valid @RequestBody VersionInput in,@AuthenticationPrincipal Models.User user){return service.action(id,in.version(),"unpublish",user.id());}
  @PostMapping("/admin/articles/{id}/official") Article setOfficial(@PathVariable String id,@Valid @RequestBody VersionInput in,@AuthenticationPrincipal Models.User user){return service.action(id,in.version(),"official",user.id());}
}
