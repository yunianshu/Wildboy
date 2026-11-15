package com.wildboy;

import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
public class ActivityOrderController {
  private final ActivityOrderService orders;
  private final WechatPayService pay;
  public ActivityOrderController(ActivityOrderService orders,WechatPayService pay){this.orders=orders;this.pay=pay;}
  public record CreateInput(@NotBlank @Size(min=8,max=80) String requestKey,@NotNull @Valid Models.RegistrationInput registration,
      @JsonDeserialize(using=StrictIntegerDeserializer.class) @NotNull @Min(0) @Max(100000000) Integer expectedTotalCents) {}
  public record PriceInput(@JsonDeserialize(using=StrictIntegerDeserializer.class) @NotNull @Min(0) @Max(100000000) Integer priceCents,
      @NotNull @Min(0) Long version) {}
  public record RefundActionInput(@NotBlank @Size(max=36) String refundId, @NotNull @Min(0) Long version,
      @Size(max=200) String note) {}
  @PostMapping("/activities/{id}/orders")
  ActivityOrderModels.Order create(@PathVariable String id,@AuthenticationPrincipal Models.User user,@Valid @RequestBody CreateInput in) {
    return orders.create(id,user.id(),in.registration(),in.requestKey(),in.expectedTotalCents());
  }
  @GetMapping("/activities/{id}/quote")
  ActivityOrderModels.Preview quote(@PathVariable String id,@AuthenticationPrincipal Models.User user,@RequestParam int participants){return orders.preview(id,user.id(),participants);}
  @GetMapping("/activity-orders/by-request/{key}")
  ActivityOrderModels.Order byRequest(@PathVariable String key,@AuthenticationPrincipal Models.User user){return orders.byRequest(key,user.id());}
  @GetMapping("/activity-orders/{id}")
  ActivityOrderModels.Order get(@PathVariable String id,@AuthenticationPrincipal Models.User user){return orders.get(id,user.id());}
  @GetMapping("/activity-orders/{id}/participants")
  List<Models.Participant> participants(@PathVariable String id,@AuthenticationPrincipal Models.User user){return orders.participants(id,user.id());}
  @GetMapping("/admin/activity-orders/{id}/participants")
  List<Models.Participant> adminParticipants(@PathVariable String id){return orders.maskedParticipants(id);}
  @PostMapping("/admin/activity-orders/{id}/participants/reveal")
  List<Models.Participant> revealParticipants(@PathVariable String id,@AuthenticationPrincipal Models.User user){return orders.revealParticipants(id,user.id());}
  @PostMapping("/activity-orders/{id}/pay")
  WechatPayService.PaymentRequest prepay(@PathVariable String id,@AuthenticationPrincipal Models.User user){return orders.prepay(id,user.id());}
  @PostMapping("/activity-orders/{id}/cancel")
  ActivityOrderModels.Order cancel(@PathVariable String id,@AuthenticationPrincipal Models.User user){return orders.cancel(id,user.id());}
  @GetMapping("/activity-orders/{id}/refund")
  Map<String,Object> ownRefund(@PathVariable String id,@AuthenticationPrincipal Models.User user){return orders.refundStatus(id,user.id());}
  @GetMapping("/admin/activity-orders/{id}/refund")
  Map<String,Object> adminRefund(@PathVariable String id){return orders.refundStatus(id,null);}
  @PostMapping("/activity-orders/{id}/refund")
  Map<String,Object> refund(@PathVariable String id,@AuthenticationPrincipal Models.User user,@Valid @RequestBody RefundModels.RequestInput in){return orders.refund(id,user.id(),in.reason());}
  @PostMapping("/admin/activity-orders/{id}/refund")
  Map<String,Object> adminRequestRefund(@PathVariable String id,@AuthenticationPrincipal Models.User user,@Valid @RequestBody RefundModels.RequestInput in){return orders.adminRefund(id,user.id(),in.reason());}
  @PostMapping("/admin/activity-orders/{id}/refund/approve")
  Map<String,Object> approve(@PathVariable String id,@AuthenticationPrincipal Models.User user,@Valid @RequestBody RefundActionInput in){return orders.decideRefund(id,in.refundId(),in.version(),user.id(),true,null);}
  @PostMapping("/admin/activity-orders/{id}/refund/reject")
  Map<String,Object> reject(@PathVariable String id,@AuthenticationPrincipal Models.User user,@Valid @RequestBody RefundActionInput in){return orders.decideRefund(id,in.refundId(),in.version(),user.id(),false,in.note());}
  @PostMapping("/admin/activity-orders/{id}/refund/verify")
  Map<String,Object> verify(@PathVariable String id,@AuthenticationPrincipal Models.User user,@Valid @RequestBody RefundActionInput in){return orders.verifyRefund(id,in.refundId(),in.version(),user.id());}
  @PostMapping("/admin/activities/{id}/price")
  Models.Activity price(@PathVariable String id,@AuthenticationPrincipal Models.User user,@Valid @RequestBody PriceInput in){return orders.setPrice(id,in.priceCents(),in.version(),user.id());}
  @GetMapping("/me/activity-orders")
  Models.Page<ActivityOrderModels.Order> mine(@AuthenticationPrincipal Models.User user,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size,@RequestParam(required=false) String activityId){return orders.list(user.id(),activityId,page,size);}
  @GetMapping("/admin/activity-orders")
  Models.Page<ActivityOrderModels.Order> list(@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size,@RequestParam(required=false) String activityId,@RequestParam(required=false) String orderId){return orders.list(null,activityId,orderId,page,size);}
  @PostMapping("/activity-orders/{id}/verify")
  ActivityOrderModels.Order verifyPayment(@PathVariable String id,@AuthenticationPrincipal Models.User user){return orders.verifyPayment(id,user.id());}
  @PostMapping("/admin/activity-orders/{id}/verify")
  ActivityOrderModels.Order adminVerify(@PathVariable String id){return orders.verifyPayment(id,null);}
  @PostMapping("/admin/activity-orders/{id}/cancel")
  ActivityOrderModels.Order adminCancel(@PathVariable String id,@AuthenticationPrincipal Models.User user){return orders.cancelAdmin(id,user.id());}
  @PostMapping("/admin/activity-orders/{id}/refund/retry")
  Map<String,Object> retryRefund(@PathVariable String id,@AuthenticationPrincipal Models.User user,@Valid @RequestBody RefundActionInput in){return orders.retryRefund(id,in.refundId(),in.version(),user.id());}
  @PostMapping("/admin/activity-orders/close-expired")
  Map<String,Integer> closeExpired(){return orders.closeExpired();}
  @PostMapping("/payments/wechat/activity-notify")
  Map<String,String> paid(@RequestBody String body,HttpServletRequest request){orders.completePayment(pay.parseNotification(headers(request),body));return Map.of("code","SUCCESS","message","成功");}
  @PostMapping("/payments/wechat/activity-refund-notify")
  Map<String,String> refunded(@RequestBody String body,HttpServletRequest request){orders.applyRefund(pay.parseRefundNotification(headers(request),body));return Map.of("code","SUCCESS","message","成功");}
  private Map<String,String> headers(HttpServletRequest request){var h=new HashMap<String,String>();for(String name:List.of("Wechatpay-Serial","Wechatpay-Nonce","Wechatpay-Signature","Wechatpay-Timestamp"))h.put(name.toLowerCase(Locale.ROOT),request.getHeader(name));return h;}
}
