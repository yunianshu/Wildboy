package com.wildboy;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;
import java.time.OffsetDateTime;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
class WechatNotificationGatewayTest {
  WechatNotificationGateway gateway(){return new WechatNotificationGateway("synthetic-app","synthetic-secret",true,"synthetic-template","thing1","time2","thing3","trial");}
  @Test void realAdapterUsesTokenTemplateAndStrictProviderOutcome(){
    var b=RestClient.builder().baseUrl("https://api.weixin.qq.com");var mock=MockRestServiceServer.bindTo(b).build();var g=gateway();ReflectionTestUtils.setField(g,"client",b.build());
    mock.expect(requestTo("https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=synthetic-app&secret=synthetic-secret")).andExpect(method(HttpMethod.GET)).andRespond(withSuccess("{\"access_token\":\"synthetic-token\",\"expires_in\":7200}",MediaType.APPLICATION_JSON));
    mock.expect(requestTo("https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=synthetic-token")).andExpect(method(HttpMethod.POST)).andExpect(jsonPath("$.touser").value("qa-openid")).andExpect(jsonPath("$.template_id").value("synthetic-template")).andExpect(jsonPath("$.miniprogram_state").value("trial")).andExpect(jsonPath("$.data.thing1.value").value("Synthetic hike")).andRespond(withSuccess("{\"errcode\":0}",MediaType.APPLICATION_JSON));
    assertThat(g.send("qa-openid","qa-activity","Synthetic hike","Meet at gate",OffsetDateTime.now()).status()).isEqualTo("SENT");mock.verify();
  }
  @Test void missingConsentAndMalformedResponseAreNeverSent(){
    var b=RestClient.builder().baseUrl("https://api.weixin.qq.com");var mock=MockRestServiceServer.bindTo(b).build();var g=gateway();ReflectionTestUtils.setField(g,"client",b.build());
    mock.expect(requestTo(org.hamcrest.Matchers.containsString("/cgi-bin/token?"))).andRespond(withSuccess("{\"access_token\":\"synthetic-token\",\"expires_in\":7200}",MediaType.APPLICATION_JSON));
    mock.expect(requestTo(org.hamcrest.Matchers.containsString("/subscribe/send?"))).andRespond(withSuccess("{\"errcode\":43101}",MediaType.APPLICATION_JSON));
    mock.expect(requestTo(org.hamcrest.Matchers.containsString("/subscribe/send?"))).andRespond(withSuccess("{}",MediaType.APPLICATION_JSON));
    assertThat(g.send("qa","id","Title","Detail",OffsetDateTime.now()).status()).isEqualTo("NO_PERMISSION");assertThat(g.send("qa","id","Title","Detail",OffsetDateTime.now()).status()).isEqualTo("UNKNOWN");mock.verify();
  }
  @Test void disabledConfigurationFailsClosed(){var g=new WechatNotificationGateway("","",false,"","thing1","time2","thing3","formal");assertThat(g.ready()).isFalse();assertThat(g.templateId()).isEmpty();assertThat(g.send("qa","id","Title","Detail",OffsetDateTime.now()).status()).isEqualTo("UNCONFIGURED");}
}
