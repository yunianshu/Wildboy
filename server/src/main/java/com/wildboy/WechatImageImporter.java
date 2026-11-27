package com.wildboy;

import java.io.ByteArrayOutputStream;
import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.*;
import org.springframework.stereotype.Service;

@Service
public class WechatImageImporter {
  private static final Set<String> HOSTS = Set.of("mmbiz.qpic.cn", "mmbiz.qlogo.cn", "mmecoa.qpic.cn");
  private static final Duration TIMEOUT = Duration.ofSeconds(5);
  private final HttpClient client = HttpClient.newBuilder()
      .connectTimeout(Duration.ofSeconds(3)).followRedirects(HttpClient.Redirect.NEVER).build();
  private final MediaService media;

  public WechatImageImporter(MediaService media) { this.media = media; }

  public static boolean supports(String url) {
    if (url == null || url.length() > 4096) return false;
    try {
      URI uri = URI.create(url);
      return "https".equalsIgnoreCase(uri.getScheme()) && uri.getHost() != null
          && HOSTS.contains(uri.getHost().toLowerCase(Locale.ROOT))
          && uri.getRawUserInfo() == null && (uri.getPort() == -1 || uri.getPort() == 443);
    } catch (IllegalArgumentException e) { return false; }
  }

  public String localize(String httpsUrl) {
    if (!supports(httpsUrl)) {
      throw new ApiException(400, "INVALID_WECHAT_IMAGE_URL", "请选择微信公众号原文中的图片");
    }
    return media.storeImage(download(URI.create(httpsUrl)));
  }

  private byte[] download(URI uri) {
    var request = HttpRequest.newBuilder(uri).GET().timeout(TIMEOUT)
        .header("Accept", "image/jpeg, image/png")
        .header("Referer", "https://mp.weixin.qq.com/").build();
    var future = client.sendAsync(request, boundedBody());
    try {
      return future.get(TIMEOUT.toMillis(), TimeUnit.MILLISECONDS).body();
    } catch (TimeoutException e) {
      future.cancel(true);
      throw unavailable();
    } catch (InterruptedException e) {
      future.cancel(true);
      Thread.currentThread().interrupt();
      throw unavailable();
    } catch (ExecutionException e) {
      for (Throwable cause = e.getCause(); cause != null; cause = cause.getCause()) {
        if (cause instanceof ApiException api) throw api;
      }
      throw unavailable();
    }
  }

  // Check each delivered chunk as well as Content-Length, including chunked CDN responses.
  static HttpResponse.BodyHandler<byte[]> boundedBody() {
    return info -> {
      if (info.statusCode() != 200) throw unavailable();
      if (info.headers().firstValueAsLong("Content-Length").orElse(-1) > MediaService.MAX_BYTES)
        throw MediaService.invalid();
      var output = new ByteArrayOutputStream();
      var subscriber = HttpResponse.BodySubscribers.ofByteArrayConsumer(chunk -> chunk.ifPresent(bytes -> {
        if (bytes.length > MediaService.MAX_BYTES - output.size()) throw MediaService.invalid();
        output.writeBytes(bytes);
      }));
      return HttpResponse.BodySubscribers.mapping(subscriber, done -> output.toByteArray());
    };
  }

  private static ApiException unavailable() {
    return new ApiException(502, "WECHAT_IMAGE_UNAVAILABLE", "公众号图片下载失败，请重新导入或上传图片");
  }
}
