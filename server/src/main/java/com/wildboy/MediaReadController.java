package com.wildboy;
import java.nio.file.*;
import java.util.*;
import org.springframework.web.bind.annotation.*;
@RestController @RequestMapping("/api/v1/media")
public class MediaReadController {
 final MediaController media;
 public MediaReadController(MediaController media){this.media=media;}
 @GetMapping("/{name}") Map<String,String> read(@PathVariable String name) {
  if(!name.matches("[0-9a-f-]{36}\\.png"))throw ApiException.notFound();
  try{Path file=media.root.resolve(name);if(!Files.isRegularFile(file)||Files.size(file)>MediaController.MAX_BYTES)throw ApiException.notFound();return Map.of("dataBase64",Base64.getEncoder().encodeToString(Files.readAllBytes(file)));}
  catch(java.io.IOException e){throw ApiException.notFound();}
 }
}
