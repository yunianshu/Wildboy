package com.wildboy;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.Base64;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.config.annotation.*;

@RestController @RequestMapping("/api/v1/admin/media")
public class MediaController implements WebMvcConfigurer {
  private final MediaService media;
  public MediaController(MediaService media) { this.media = media; }

  public record Upload(@NotBlank @Size(max=5592408) String dataBase64) {}

  @PostMapping ResponseEntity<Map<String, String>> upload(@Valid @RequestBody Upload input) {
    byte[] bytes;
    try { bytes = Base64.getDecoder().decode(input.dataBase64()); }
    catch (IllegalArgumentException e) { throw MediaService.invalid(); }
    return ResponseEntity.status(201).body(Map.of("url", media.storeImage(bytes)));
  }

  @Override public void addResourceHandlers(ResourceHandlerRegistry registry) {
    registry.addResourceHandler("/assets/uploads/**")
        .addResourceLocations(media.root.toUri().toString() + "/").setCachePeriod(86400);
  }
}
