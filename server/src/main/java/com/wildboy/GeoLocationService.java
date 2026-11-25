package com.wildboy;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class GeoLocationService {
  public record PlaceCandidate(
      String title, String address, double latitude, double longitude) {}

  private static final Pattern COORD_PAIR =
      Pattern.compile("(-?\\d{1,3}\\.\\d{3,10})\\s*[,，\\s]\\s*(-?\\d{1,3}\\.\\d{3,10})");
  private static final Pattern LAT_PARAM =
      Pattern.compile("(?:lat|latitude)=?(-?\\d{1,3}\\.\\d{3,10})", Pattern.CASE_INSENSITIVE);
  private static final Pattern LNG_PARAM =
      Pattern.compile("(?:lng|lon|longitude)=?(-?\\d{1,3}\\.\\d{3,10})", Pattern.CASE_INSENSITIVE);

  private final String tencentKey;
  private final ObjectMapper json;
  private final HttpClient http;

  public GeoLocationService(
      @Value("${wildboy.map.tencent-key:}") String tencentKey, ObjectMapper json) {
    this.tencentKey = tencentKey == null ? "" : tencentKey.strip();
    this.json = json;
    this.http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(4)).build();
  }

  public boolean tencentConfigured() {
    return !tencentKey.isEmpty();
  }

  public Optional<PlaceCandidate> parseCoordinateOrLink(String raw) {
    if (raw == null || raw.isBlank()) return Optional.empty();
    String text = raw.strip();
    Matcher latM = LAT_PARAM.matcher(text);
    Matcher lngM = LNG_PARAM.matcher(text);
    if (latM.find() && lngM.find()) {
      double lat = Double.parseDouble(latM.group(1));
      double lng = Double.parseDouble(lngM.group(1));
      if (validCoord(lat, lng)) {
        return Optional.of(new PlaceCandidate(extractLabel(text), "", lat, lng));
      }
    }
    Matcher pair = COORD_PAIR.matcher(text);
    if (pair.find()) {
      double a = Double.parseDouble(pair.group(1));
      double b = Double.parseDouble(pair.group(2));
      // Auto-detect (lng, lat) vs (lat, lng): latitude must be [-90, 90]; in China lng is [73, 136], lat is [3, 54]
      if (Math.abs(a) > 90 && Math.abs(b) <= 90 && validCoord(b, a)) {
        return Optional.of(new PlaceCandidate(extractLabel(text), "", b, a));
      }
      if (a >= 70 && a <= 138 && b >= 3 && b <= 55) {
        return Optional.of(new PlaceCandidate(extractLabel(text), "", b, a));
      }
      if (validCoord(a, b)) {
        return Optional.of(new PlaceCandidate(extractLabel(text), "", a, b));
      }
    }
    return Optional.empty();
  }

  private static boolean validCoord(double lat, double lng) {
    return Double.isFinite(lat) && Double.isFinite(lng)
        && lat >= -90.0 && lat <= 90.0 && lng >= -180.0 && lng <= 180.0;
  }

  private static String extractLabel(String text) {
    Matcher titleParam =
        Pattern.compile("(?:title|name|q)=([^&#\\s]+)", Pattern.CASE_INSENSITIVE).matcher(text);
    if (titleParam.find()) {
      try {
        String decoded = java.net.URLDecoder.decode(titleParam.group(1), StandardCharsets.UTF_8).strip();
        if (!decoded.isEmpty()) return decoded.length() > 80 ? decoded.substring(0, 80) : decoded;
      } catch (IllegalArgumentException ignored) {
      }
    }
    return "";
  }

  public List<PlaceCandidate> search(String keyword, String region) {
    if (keyword == null || keyword.isBlank() || keyword.strip().length() > 100) {
      throw new ApiException(400, "INVALID_KEYWORD", "请输入 1–100 字的搜索地点关键词");
    }
    String q = keyword.strip();
    var parsed = parseCoordinateOrLink(q);
    var results = new ArrayList<PlaceCandidate>();
    parsed.ifPresent(
        p ->
            results.add(
                new PlaceCandidate(
                    p.title().isEmpty() ? "解析坐标点" : p.title(),
                    String.format("纬度 %.6f, 经度 %.6f", p.latitude(), p.longitude()),
                    p.latitude(),
                    p.longitude())));
    if (!tencentConfigured()) {
      return results;
    }
    try {
      String url =
          "https://apis.map.qq.com/ws/place/v1/suggestion?keyword="
              + URLEncoder.encode(q, StandardCharsets.UTF_8)
              + (region != null && !region.isBlank()
                  ? "&region=" + URLEncoder.encode(region.strip(), StandardCharsets.UTF_8)
                  : "")
              + "&key="
              + URLEncoder.encode(tencentKey, StandardCharsets.UTF_8);
      HttpRequest req =
          HttpRequest.newBuilder(URI.create(url))
              .timeout(Duration.ofSeconds(5))
              .GET()
              .build();
      HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString());
      if (resp.statusCode() != 200) {
        return results;
      }
      JsonNode root = json.readTree(resp.body());
      if (root.path("status").asInt(-1) != 0) {
        throw new ApiException(
            502,
            "MAP_PROVIDER_ERROR",
            "地图搜索服务返回异常：" + root.path("message").asText("请检查 TENCENT_MAP_KEY 配置"));
      }
      for (JsonNode item : root.path("data")) {
        String title = item.path("title").asText("").strip();
        String addr = item.path("address").asText("").strip();
        JsonNode loc = item.path("location");
        if (!title.isEmpty() && loc.hasNonNull("lat") && loc.hasNonNull("lng")) {
          double lat = loc.path("lat").asDouble();
          double lng = loc.path("lng").asDouble();
          if (validCoord(lat, lng)) {
            results.add(new PlaceCandidate(title, addr, lat, lng));
          }
        }
        if (results.size() >= 12) break;
      }
    } catch (ApiException e) {
      throw e;
    } catch (Exception e) {
      if (results.isEmpty()) {
        throw new ApiException(503, "MAP_UNAVAILABLE", "暂时无法连接腾讯地图搜索，可直接粘贴经纬度或地图链接");
      }
    }
    return results;
  }
}
