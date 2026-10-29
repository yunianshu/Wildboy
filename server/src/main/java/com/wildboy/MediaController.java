package com.wildboy;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.io.*;
import java.nio.file.*;
import java.util.*;
import javax.imageio.ImageIO;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.config.annotation.*;

@RestController @RequestMapping("/api/v1/admin/media")
public class MediaController implements WebMvcConfigurer {
  static final int MAX_BYTES=4*1024*1024;
  final Path root;
  public MediaController(@Value("${wildboy.media-dir:./data/media}") String directory){root=Path.of(directory).toAbsolutePath().normalize();}
  public record Upload(@NotBlank @Size(max=5592408) String dataBase64) {}
  @PostMapping ResponseEntity<Map<String,String>> upload(@Valid @RequestBody Upload input) {
    byte[] bytes;
    try {bytes=Base64.getDecoder().decode(input.dataBase64());}catch(IllegalArgumentException e){throw invalid();}
    if(bytes.length==0 || bytes.length>MAX_BYTES) throw invalid();
    try(var stream=ImageIO.createImageInputStream(new ByteArrayInputStream(bytes))) {
      var readers=ImageIO.getImageReaders(stream);
      if(!readers.hasNext()) throw invalid();
      var reader=readers.next();
      try {
        String format=reader.getFormatName();
        if(!format.equalsIgnoreCase("png") && !format.equalsIgnoreCase("jpeg")) throw invalid();
        reader.setInput(stream,true,true);
        int w=reader.getWidth(0),h=reader.getHeight(0);
        if(w<1 || h<1 || w>6000 || h>6000 || (long)w*h>16000000) throw invalid();
        var image=reader.read(0);
        var output=new ByteArrayOutputStream();
        ImageIO.write(image,"png",output);
        if(output.size()>MAX_BYTES) throw invalid();
        Files.createDirectories(root);
        String name=UUID.randomUUID()+".png";
        Files.write(root.resolve(name),output.toByteArray(),StandardOpenOption.CREATE_NEW);
        return ResponseEntity.status(201).body(Map.of("url","/assets/uploads/"+name));
      }finally{reader.dispose();}
    }catch(ApiException e){throw e;}catch(IOException e){throw new ApiException(503,"UPLOAD_FAILED","图片保存失败，请重试");}
  }
  static ApiException invalid(){return new ApiException(400,"INVALID_IMAGE","仅支持 4MB 内的 JPG/PNG 图片，最大 1600 万像素");}
  @Override public void addResourceHandlers(ResourceHandlerRegistry registry){
    registry.addResourceHandler("/assets/uploads/**").addResourceLocations(root.toUri().toString()+"/").setCachePeriod(86400);
  }
}
