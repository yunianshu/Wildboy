package com.wildboy;

import java.io.*;
import java.nio.file.*;
import java.util.UUID;
import javax.imageio.ImageIO;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class MediaService {
  static final int MAX_BYTES = 4 * 1024 * 1024;
  private static final Logger log = LoggerFactory.getLogger(MediaService.class);
  final Path root;

  public MediaService(@Value("${wildboy.media-dir:./data/media}") String directory) {
    root = Path.of(directory).toAbsolutePath().normalize();
  }

  String storeImage(byte[] bytes) {
    if (bytes.length == 0 || bytes.length > MAX_BYTES) throw invalid();
    try (var stream = ImageIO.createImageInputStream(new ByteArrayInputStream(bytes))) {
      var readers = ImageIO.getImageReaders(stream);
      if (!readers.hasNext()) throw invalid();
      var reader = readers.next();
      try {
        String format = reader.getFormatName();
        if (!format.equalsIgnoreCase("png") && !format.equalsIgnoreCase("jpeg")) throw invalid();
        reader.setInput(stream, true, true);
        int w = reader.getWidth(0), h = reader.getHeight(0);
        if (w < 1 || h < 1 || w > 6000 || h > 6000 || (long) w * h > 16000000) throw invalid();
        var image = reader.read(0);
        var output = new ByteArrayOutputStream();
        if (!ImageIO.write(image, "png", output) || output.size() > MAX_BYTES) throw invalid();
        Files.createDirectories(root);
        String name = UUID.randomUUID() + ".png";
        Files.write(root.resolve(name), output.toByteArray(), StandardOpenOption.CREATE_NEW);
        return "/assets/uploads/" + name;
      } finally { reader.dispose(); }
    } catch (IOException e) {
      log.error("图片保存失败 media-dir={}", root, e);
      throw new ApiException(503, "UPLOAD_FAILED", "图片保存失败，请重试");
    }
  }

  static ApiException invalid() {
    return new ApiException(400, "INVALID_IMAGE", "仅支持 4MB 内的 JPG/PNG 图片，最大 1600 万像素");
  }
}
