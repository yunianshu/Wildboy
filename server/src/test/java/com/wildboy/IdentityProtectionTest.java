package com.wildboy;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;
class IdentityProtectionTest {
  @Test void authenticatedEncryptionUsesFreshNonceAndRoundTrips() {
    var service = new IdentityProtection(java.util.Base64.getEncoder().encodeToString(new byte[32]));
    String a=service.encrypt("11010519491231002X"), b=service.encrypt("11010519491231002X");
    assertThat(a).isNotEqualTo(b).doesNotContain("11010519491231002X");
    assertThat(service.reveal(a)).isEqualTo("11010519491231002X");
    assertThat(service.masked(a)).isEqualTo("******************");
    assertThatThrownBy(() -> service.reveal(a.substring(0,a.length()-4)+"AAAA")).isInstanceOf(ApiException.class);
  }
  @Test void missingKeyFailsClosedButListsAndEmptyIdsRemainAvailable() {
    var service=new IdentityProtection("");
    assertThatThrownBy(() -> service.encrypt("11010519491231002X")).isInstanceOf(ApiException.class);
    assertThat(service.masked("11010519491231002X")).doesNotContain("19491231");
    assertThat(service.encrypt("")).isEmpty();
    assertThat(service.masked("enc:v1:unavailable:key")).isEqualTo("******************");
  }
}
