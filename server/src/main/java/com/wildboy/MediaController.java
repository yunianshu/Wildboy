package com.wildboy;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.Base64;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.config.annotation.*;

@RestController @RequestMapping("/api/v1/admin/media")
public class MediaController implements WebMvcConfigurer {
  private final MediaService media;
  public MediaController(MediaService media) { this.media = media; }

  public record Upload(
      @NotBlank @Size(max = 5592408) String dataBase64,
      @Size(max = 120) String name,
      @Size(max = 20) String category) {}

  public record UpdateInput(
      @Size(max = 120) String name,
      @Size(max = 20) String category) {}

  @GetMapping
  MediaService.MediaPage list(
      @RequestParam(required = false) String category,
      @RequestParam(required = false) String q,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "24") int size) {
    return media.list(category, q, page, size);
  }

  @PostMapping
  ResponseEntity<MediaService.MediaAsset> upload(@Valid @RequestBody Upload input) {
    byte[] bytes;
    try { bytes = Base64.getDecoder().decode(input.dataBase64()); }
    catch (IllegalArgumentException e) { throw MediaService.invalid(); }
    return ResponseEntity.status(201).body(media.storeMedia(bytes, input.name(), input.category()));
  }

  @PutMapping("/{id}")
  MediaService.MediaAsset update(@PathVariable String id, @Valid @RequestBody UpdateInput input) {
    return media.update(id, input.name(), input.category());
  }

  @GetMapping("/{id}/references")
  MediaService.MediaReferenceCheck references(@PathVariable String id) {
    return media.references(id);
  }

  @DeleteMapping("/{id}")
  ResponseEntity<Void> delete(@PathVariable String id) {
    media.delete(id);
    return ResponseEntity.noContent().build();
  }

  @Override public void addResourceHandlers(ResourceHandlerRegistry registry) {
    registry.addResourceHandler("/assets/uploads/**")
        .addResourceLocations(media.root().toUri().toString() + "/").setCachePeriod(86400);
  }
}
