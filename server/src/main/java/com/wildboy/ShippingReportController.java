package com.wildboy;

import static com.wildboy.Models.*;

import java.util.Map;
import org.springframework.web.bind.annotation.*;

/** 后台发货上报管理：查询各订单上报状态，对失败/待上报记录手动补报。 */
@RestController
@RequestMapping("/api/v1/admin")
public class ShippingReportController {
  final ShippingReportService reports;
  public ShippingReportController(ShippingReportService reports) { this.reports = reports; }

  @GetMapping("/shipping-reports")
  Models.Page<Map<String, Object>> list(
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "20") int size,
      @RequestParam(required = false) String status) {
    return reports.list(page, size, status);
  }

  @PostMapping("/shipping-reports/{id}/retry")
  Map<String, Object> retry(@PathVariable String id) {
    return reports.retry(id);
  }
}
