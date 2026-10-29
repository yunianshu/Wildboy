package com.wildboy;

import static com.wildboy.Models.Page;
import static com.wildboy.ShopModels.*;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
public class ShopController {
  private final ShopService shop;
  private final WechatPayService pay;

  public ShopController(ShopService shop, WechatPayService pay) {
    this.shop = shop;
    this.pay = pay;
  }

  @GetMapping("/shop/products")
  java.util.List<Product> products() {
    return shop.products(false);
  }

  @GetMapping("/shop/products/{id}")
  Product product(@PathVariable String id) {
    return shop.product(id, false);
  }

  @PostMapping("/orders")
  ResponseEntity<Order> createOrder(
      @AuthenticationPrincipal Models.User user, @Valid @RequestBody OrderInput input) {
    return ResponseEntity.status(201).body(shop.createOrder(user.id(), input));
  }

  @GetMapping("/orders")
  Page<Order> orders(
      @AuthenticationPrincipal Models.User user,
      @RequestParam(required = false) OrderStatus status,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "20") int size) {
    return shop.orders(user.id(), status, page, size);
  }

  @GetMapping("/orders/by-request/{requestId}")
  Order orderByRequest(@PathVariable String requestId, @AuthenticationPrincipal Models.User user) {
    return shop.orderByRequest(requestId, user.id());
  }

  @GetMapping("/orders/{id}")
  Order order(@PathVariable String id, @AuthenticationPrincipal Models.User user) {
    return shop.order(id, user.id(), false);
  }

  @PostMapping("/orders/{id}/pay")
  PaymentRequest pay(@PathVariable String id, @AuthenticationPrincipal Models.User user) {
    return shop.payment(id, user.id());
  }

  @PostMapping("/orders/{id}/verify")
  Order verifyPayment(@PathVariable String id, @AuthenticationPrincipal Models.User user) {
    return shop.verifyPayment(id, user.id());
  }

  @PostMapping("/orders/{id}/cancel")
  Order cancel(@PathVariable String id, @AuthenticationPrincipal Models.User user) {
    return shop.cancelOrder(id, user.id());
  }

  @GetMapping("/admin/shop/products")
  java.util.List<Product> adminProducts() {
    return shop.products(true);
  }

  @PostMapping("/admin/shop/products")
  ResponseEntity<Product> createProduct(
      @AuthenticationPrincipal Models.User user, @Valid @RequestBody ProductInput input) {
    return ResponseEntity.status(201).body(shop.createProduct(input, user.id()));
  }

  @PutMapping("/admin/shop/products/{id}")
  Product editProduct(
      @PathVariable String id,
      @AuthenticationPrincipal Models.User user,
      @Valid @RequestBody ProductInput input) {
    return shop.editProduct(id, input, user.id());
  }

  @GetMapping("/admin/orders")
  Page<Order> adminOrders(
      @RequestParam(required = false) OrderStatus status,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "20") int size) {
    return shop.orders(null, status, page, size);
  }

  @PostMapping("/admin/orders/{id}/ship")
  Order ship(
      @PathVariable String id,
      @AuthenticationPrincipal Models.User user,
      @Valid @RequestBody ShipInput input) {
    return shop.ship(id, input.version(), user.id());
  }

  @PostMapping("/payments/wechat/notify")
  Map<String, String> paymentNotification(
      @RequestBody String body, HttpServletRequest request) {
    var transaction =
        pay.parseNotification(
            Map.of(
                "wechatpay-serial", nullToEmpty(request.getHeader("Wechatpay-Serial")),
                "wechatpay-nonce", nullToEmpty(request.getHeader("Wechatpay-Nonce")),
                "wechatpay-signature", nullToEmpty(request.getHeader("Wechatpay-Signature")),
                "wechatpay-timestamp", nullToEmpty(request.getHeader("Wechatpay-Timestamp"))),
            body);
    shop.completePayment(transaction);
    return Map.of("code", "SUCCESS", "message", "成功");
  }

  private static String nullToEmpty(String value) {
    return value == null ? "" : value;
  }
}
