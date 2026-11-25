package com.wildboy;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.*;
import java.util.concurrent.TimeUnit;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/admin/content")
class WechatImportController {
  record Input(@NotBlank @Size(max = 1_000_000) String html) {}
  record Result(String html, List<String> warnings) {}
  private final WechatImageImporter images;

  WechatImportController(WechatImageImporter images) { this.images = images; }

  @PostMapping("/wechat-import")
  Result importFragment(@Valid @RequestBody Input input) {
    var fragment = new WechatFragment(input.html());
    if (!fragment.hasContent()) throw WechatFragment.invalid("未找到可粘贴的正文，请在公众号文章中选中文字或图片");
    Map<String, String> imported = new HashMap<>();
    int remote = 0;
    long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(18);
    for (var img : fragment.images()) {
      String src = img.attr("src");
      if (!WechatImageImporter.supports(src)) continue;
      if (!imported.containsKey(src)) {
        String local = src;
        if (imported.size() < 50 && System.nanoTime() < deadline) {
          try { local = images.localize(src); }
          catch (ApiException e) { /* Keep the original usable URL and report the fallback. */ }
        }
        imported.put(src, local);
        if (local.equals(src)) remote++;
      }
      img.attr("src", imported.get(src));
    }
    if (remote > 0) fragment.warnings().add(remote + " 张微信图片仍使用原链接，可在预览中核对或替换");
    return new Result(fragment.html(), fragment.warnings());
  }
}
