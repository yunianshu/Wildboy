package com.wildboy;

import com.fasterxml.jackson.databind.JsonNode;
import java.net.http.HttpClient;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

@Service
public class WechatNotificationGateway {
  final String appId,secret,template,titleKey,timeKey,detailKey,state; final boolean enabled; final RestClient client;
  private String token; private Instant expires=Instant.EPOCH;
  public record Result(String status,String error,boolean retryable) {}
  public WechatNotificationGateway(@Value("${wildboy.wechat.app-id:}")String appId,@Value("${wildboy.wechat.app-secret:}")String secret,
      @Value("${wildboy.notifications.enabled:false}")boolean enabled,@Value("${wildboy.notifications.template-id:}")String template,
      @Value("${wildboy.notifications.title-key:thing1}")String titleKey,@Value("${wildboy.notifications.time-key:time2}")String timeKey,
      @Value("${wildboy.notifications.detail-key:thing3}")String detailKey,@Value("${wildboy.notifications.state:formal}")String state) {
    this.appId=appId;this.secret=secret;this.enabled=enabled;this.template=template;this.titleKey=titleKey;this.timeKey=timeKey;this.detailKey=detailKey;this.state=state;
    var f=new JdkClientHttpRequestFactory(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build());f.setReadTimeout(Duration.ofSeconds(8));
    client=RestClient.builder().baseUrl("https://api.weixin.qq.com").requestFactory(f).build();
  }
  public boolean ready(){return enabled&&!appId.isBlank()&&!secret.isBlank()&&!template.isBlank()&&titleKey.matches("thing[0-9]+")&&timeKey.matches("time[0-9]+")&&detailKey.matches("thing[0-9]+")&&!titleKey.equals(detailKey)&&Set.of("formal","trial","developer").contains(state);}
  public String templateId(){return ready()?template:"";}
  synchronized String accessToken(){
    if(token!=null&&expires.isAfter(Instant.now()))return token;
    JsonNode r=client.get().uri(b->b.path("/cgi-bin/token").queryParam("grant_type","client_credential").queryParam("appid",appId).queryParam("secret",secret).build()).retrieve().body(JsonNode.class);
    if(r==null||!r.path("access_token").isTextual()||r.path("access_token").asText().isBlank()||r.path("expires_in").asInt()<60) throw new IllegalStateException("Token unavailable");
    token=r.path("access_token").asText();expires=Instant.now().plusSeconds(Math.max(1,r.path("expires_in").asInt()-120));return token;
  }
  static String shortText(String value){return value.codePointCount(0,value.length())<=20?value:value.substring(0,value.offsetByCodePoints(0,20));}
  public Result send(String openid,String activity,String title,String detail,OffsetDateTime at){
    if(!ready())return new Result("UNCONFIGURED","订阅消息尚未配置",false);
    String token;
    try {token=accessToken();}catch(RuntimeException e){return new Result("FAILED","微信凭据获取失败",true);}
    try {
      var data=Map.of(titleKey,Map.of("value",shortText(title)),timeKey,Map.of("value",at.atZoneSameInstant(ZoneId.of("Asia/Shanghai")).format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm"))),detailKey,Map.of("value",shortText(detail)));
      JsonNode r=client.post().uri(b->b.path("/cgi-bin/message/subscribe/send").queryParam("access_token",token).build()).body(Map.of("touser",openid,"template_id",template,"page","pages/detail/index?id="+activity,"miniprogram_state",state,"lang","zh_CN","data",data)).retrieve().body(JsonNode.class);
      if(r==null||!r.path("errcode").isIntegralNumber())return new Result("UNKNOWN","发送结果未确认，请勿重复发送",false);
      int code=r.path("errcode").asInt();
      if(code==0)return new Result("SENT","",false);
      if(code==43101)return new Result("NO_PERMISSION","用户未订阅或次数已用完",false);
      if(Set.of(40001,40014,42001).contains(code)){synchronized(this){this.token=null;this.expires=Instant.EPOCH;}}
      return new Result("FAILED","微信拒绝消息（"+code+"）",code==-1||Set.of(40001,40014,42001).contains(code));
    }catch(RuntimeException e){return new Result("UNKNOWN","发送结果未确认，请勿重复发送",false);}
  }
}
