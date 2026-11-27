package com.wildboy;

import static org.assertj.core.api.Assertions.*;
import com.sun.net.httpserver.HttpServer;
import java.awt.image.BufferedImage;
import java.io.*;
import java.net.*;
import java.net.http.*;
import java.nio.file.*;
import java.time.Duration;
import java.util.List;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class WechatImageImporterTest {
  @TempDir Path directory;

  @Test void acceptsOnlyExplicitHttpsImageHosts() {
    assertThat(WechatImageImporter.supports("https://mmbiz.qpic.cn/mmbiz_png/id/640?wx_fmt=png")).isTrue();
    assertThat(WechatImageImporter.supports("https://mmbiz.qlogo.cn:443/pic/0")).isTrue();
    assertThat(WechatImageImporter.supports("https://mmecoa.qpic.cn/photo/0")).isTrue();
    assertThat(WechatImageImporter.supports("https://mmecoa.qpic.cn.example.com/photo/0")).isFalse();
    var importer = new WechatImageImporter(new MediaService(directory.toString()));
    for (String url : List.of("http://mmbiz.qpic.cn/0", "https://cdn.example.com/0",
        "https://sub.mmbiz.qpic.cn/0", "https://mmbiz.qpic.cn:444/0",
        "https://name@mmbiz.qpic.cn/0", "file:///tmp/image.png", "invalid")) {
      assertThatThrownBy(() -> importer.localize(url)).isInstanceOf(ApiException.class);
    }
  }

  @Test void readsBoundedChunksAndStoresOnlyDecodedImages() throws Exception {
    var png = new ByteArrayOutputStream();
    ImageIO.write(new BufferedImage(4, 5, BufferedImage.TYPE_INT_RGB), "png", png);
    byte[] good = png.toByteArray();
    var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    server.createContext("/good", exchange -> {
      exchange.sendResponseHeaders(200, 0); // no declared length
      try (var out = exchange.getResponseBody()) { out.write(good); }
    });
    server.createContext("/large", exchange -> {
      exchange.sendResponseHeaders(200, 0);
      try (var out = exchange.getResponseBody()) { out.write(new byte[MediaService.MAX_BYTES + 1]); }
      catch (IOException ignored) { /* The bounded subscriber may close early. */ }
    });
    server.createContext("/redirect", exchange -> {
      exchange.getResponseHeaders().set("Location", "/good");
      exchange.sendResponseHeaders(302, -1);
      exchange.close();
    });
    server.start();
    String origin = "http://127.0.0.1:" + server.getAddress().getPort();
    try (var client = HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NEVER).build()) {
      var media = new MediaService(directory.toString());
      var response = client.send(HttpRequest.newBuilder(URI.create(origin + "/good")).build(),
          WechatImageImporter.boundedBody());
      String path = media.storeImage(response.body());
      assertThat(path).startsWith("/assets/uploads/");
      var stored = ImageIO.read(directory.resolve(Path.of(path).getFileName()).toFile());
      assertThat(stored.getWidth()).isEqualTo(4);
      assertThat(stored.getHeight()).isEqualTo(5);
      assertThatThrownBy(() -> media.storeImage(new byte[] {1, 2})).isInstanceOf(ApiException.class);
      for (String endpoint : List.of("/large", "/redirect")) {
        var request = HttpRequest.newBuilder(URI.create(origin + endpoint)).timeout(Duration.ofSeconds(4)).build();
        assertThatThrownBy(() -> client.send(request, WechatImageImporter.boundedBody()))
            .hasRootCauseInstanceOf(ApiException.class);
      }
    } finally { server.stop(0); }
  }
}
