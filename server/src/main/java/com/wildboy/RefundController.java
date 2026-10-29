package com.wildboy;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
public class RefundController {
  private final RefundService refunds; private final WechatPayService pay;
  public RefundController(RefundService refunds,WechatPayService pay){this.refunds=refunds;this.pay=pay;}
  @PostMapping("/orders/{id}/refund")
  RefundModels.Refund request(@PathVariable String id,@AuthenticationPrincipal Models.User user,@Valid @RequestBody RefundModels.RequestInput in){return refunds.request(id,user.id(),in.reason());}
  @GetMapping("/orders/{id}/refund")
  Object own(@PathVariable String id,@AuthenticationPrincipal Models.User user){var result=refunds.own(id,user.id());return result==null?com.fasterxml.jackson.databind.node.NullNode.getInstance():result;}
  @GetMapping("/me/refunds")
  Models.Page<RefundModels.Refund> mine(@AuthenticationPrincipal Models.User user,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size){return refunds.list(user.id(),page,size);}
  @GetMapping("/admin/refunds")
  Models.Page<RefundModels.Refund> list(@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size){return refunds.list(null,page,size);}
  @PostMapping("/admin/refunds/{id}/approve")
  RefundModels.Refund approve(@PathVariable String id,@AuthenticationPrincipal Models.User user,@Valid @RequestBody RefundModels.DecisionInput in){return refunds.approve(id,in.version(),user.id(),false);}
  @PostMapping("/admin/refunds/{id}/retry")
  RefundModels.Refund retry(@PathVariable String id,@AuthenticationPrincipal Models.User user,@Valid @RequestBody RefundModels.DecisionInput in){return refunds.approve(id,in.version(),user.id(),true);}
  @PostMapping("/admin/refunds/{id}/reject")
  RefundModels.Refund reject(@PathVariable String id,@AuthenticationPrincipal Models.User user,@Valid @RequestBody RefundModels.DecisionInput in){return refunds.reject(id,in.version(),in.note(),user.id());}
  @PostMapping("/admin/refunds/{id}/verify")
  RefundModels.Refund verify(@PathVariable String id,@AuthenticationPrincipal Models.User user,@Valid @RequestBody RefundModels.DecisionInput in){return refunds.verify(id,in.version(),user.id());}
  @PostMapping("/payments/wechat/refund-notify")
  Map<String,String> notify(@RequestBody String body,HttpServletRequest request){
    var headers=new java.util.HashMap<String,String>();
    for(String name:java.util.List.of("Wechatpay-Serial","Wechatpay-Nonce","Wechatpay-Signature","Wechatpay-Timestamp"))headers.put(name.toLowerCase(),request.getHeader(name));
    refunds.apply(pay.parseRefundNotification(headers,body),null);
    return Map.of("code","SUCCESS","message","成功");
  }
}
