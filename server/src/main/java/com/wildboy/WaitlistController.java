package com.wildboy;
import static com.wildboy.Models.*;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
@RestController @RequestMapping("/api/v1")
public class WaitlistController {
  final WaitlistService waitlists;final NotificationService notifications;
  public WaitlistController(WaitlistService w,NotificationService n){waitlists=w;notifications=n;}
  @PostMapping("/activities/{id}/waitlist") WaitlistService.Entry join(@PathVariable String id,@AuthenticationPrincipal User user,@Valid @RequestBody RegistrationInput in){return waitlists.join(id,user.id(),in);}
  @GetMapping("/admin/waitlist") Page<WaitlistService.Entry> adminWaitlist(@RequestParam(defaultValue="0")int page,@RequestParam(defaultValue="20")int size){return waitlists.admin(page,size);}
  @GetMapping("/me/waitlist") Page<WaitlistService.Entry> mine(@AuthenticationPrincipal User user,@RequestParam(defaultValue="0")int page,@RequestParam(defaultValue="20")int size){return waitlists.mine(user.id(),page,size);}
  @PostMapping("/waitlist/{id}/confirm") Registration confirm(@PathVariable String id,@AuthenticationPrincipal User user,@Valid @RequestBody LegalModels.ConsentInput in){return waitlists.confirm(id,user.id(),in);}
  @DeleteMapping("/waitlist/{id}") void cancel(@PathVariable String id,@AuthenticationPrincipal User user){waitlists.cancel(id,user.id());}
  @GetMapping("/notifications/config") Object config(){return notifications.config();}
  public record SubscribeInput(boolean accepted){}
  @PostMapping("/me/notifications/subscribe") void subscribe(@AuthenticationPrincipal User user,@RequestBody SubscribeInput in){notifications.subscribe(user.id(),in.accepted());}
  @GetMapping("/me/notifications") Page<NotificationService.Notice> notices(@AuthenticationPrincipal User user,@RequestParam(defaultValue="0")int page,@RequestParam(defaultValue="20")int size){return notifications.list(user.id(),page,size);}
  @GetMapping("/admin/notifications") Page<NotificationService.Notice> adminNotices(@RequestParam(defaultValue="0")int page,@RequestParam(defaultValue="20")int size){return notifications.list(null,page,size);}
  @PostMapping("/admin/notifications/{id}/retry") void retry(@PathVariable String id,@AuthenticationPrincipal User user){notifications.retry(id,user.id());}
}
