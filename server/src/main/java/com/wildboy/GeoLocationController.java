package com.wildboy;

import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/admin/geo")
public class GeoLocationController {
  private final GeoLocationService geo;

  public GeoLocationController(GeoLocationService geo) {
    this.geo = geo;
  }

  @GetMapping("/status")
  public Map<String, Object> status() {
    return Map.of("tencentMapConfigured", geo.tencentConfigured());
  }

  @GetMapping("/search")
  public Map<String, Object> search(
      @RequestParam String keyword, @RequestParam(required = false) String region) {
    List<GeoLocationService.PlaceCandidate> items = geo.search(keyword, region);
    return Map.of("tencentMapConfigured", geo.tencentConfigured(), "items", items);
  }
}
