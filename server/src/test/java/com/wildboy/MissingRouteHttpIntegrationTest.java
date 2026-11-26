package com.wildboy;

import static org.assertj.core.api.Assertions.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.*;

/** Real Tomcat requests exercise error dispatch, which MockMvc does not reproduce. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class MissingRouteHttpIntegrationTest {
  static final EmbeddedPostgres pg;
  static {
    try { pg = EmbeddedPostgres.builder().setServerConfig("unix_socket_directories", "").start(); }
    catch (Exception e) { throw new ExceptionInInitializerError(e); }
  }
  @DynamicPropertySource static void properties(DynamicPropertyRegistry r) {
    r.add("spring.datasource.url", () -> pg.getJdbcUrl("postgres", "postgres"));
    r.add("spring.datasource.username", () -> "postgres");
    r.add("spring.datasource.password", () -> "");
    r.add("wildboy.notifications.scan-ms", () -> 3600000);
    r.add("wildboy.orders.expiry-scan-ms", () -> 3600000);
  }
  @LocalServerPort int port;
  @Autowired AuthService auth;
  @Autowired ObjectMapper json;
  final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
  Models.User user;
  String userToken, adminToken;

  @BeforeEach void users() {
    user = auth.user("missing-route:user:" + UUID.randomUUID(), "HTTP fixture", "USER");
    userToken = auth.login(user).token();
    adminToken = auth.login(auth.user("missing-route:admin:" + UUID.randomUUID(), "HTTP admin fixture", "ADMIN")).token();
  }

  HttpResponse<String> request(String method, String path, String token) throws Exception {
    var request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path))
        .timeout(Duration.ofSeconds(5)).header("Accept", "application/json");
    if (token != null) request.header("Authorization", "Bearer " + token);
    request.method(method, HttpRequest.BodyPublishers.noBody());
    return client.send(request.build(), HttpResponse.BodyHandlers.ofString());
  }

  void missing(String method, String path, String token) throws Exception {
    var response = request(method, path, token);
    assertThat(response.statusCode()).as(method + " " + path).isEqualTo(404);
    assertThat(json.readTree(response.body()).path("code").asText()).isEqualTo("NOT_FOUND");
    assertThat(response.headers().firstValue("Cache-Control")).contains("no-store");
  }

  @Test void authenticatedRemovedRoutesReturn404AndKeepTheSessionUsable() throws Exception {
    var before = request("GET", "/api/v1/me", userToken);
    assertThat(before.statusCode()).isEqualTo(200);
    assertThat(json.readTree(before.body()).path("id").asText()).isEqualTo(user.id());
    missing("GET", "/api/v1/me/waitlist", userToken);
    missing("GET", "/api/v1/admin/waitlist", adminToken);
    missing("POST", "/api/v1/activities/retired/waitlist", userToken);
    missing("POST", "/api/v1/waitlist/retired/confirm", userToken);
    missing("DELETE", "/api/v1/waitlist/retired", userToken);
    missing("GET", "/api/v1/admin/templates", adminToken);
    missing("POST", "/api/v1/admin/templates", adminToken);
    missing("PUT", "/api/v1/admin/templates/retired/content", adminToken);
    missing("PUT", "/api/v1/admin/templates/retired", adminToken);
    missing("POST", "/api/v1/admin/templates/retired/generate", adminToken);
    missing("DELETE", "/api/v1/admin/templates/retired", adminToken);
    missing("GET", "/api/v1/admin/missing-fixture-route", adminToken);
    var after = request("GET", "/api/v1/me", userToken);
    assertThat(after.statusCode()).isEqualTo(200);
    assertThat(json.readTree(after.body()).path("id").asText()).isEqualTo(user.id());
  }

  @Test void missingRoutesDoNotBypassAuthenticationOrAdminAuthorization() throws Exception {
    assertThat(request("GET", "/api/v1/me/waitlist", null).statusCode()).isEqualTo(401);
    assertThat(request("GET", "/api/v1/me/waitlist", "invalid-fixture-token").statusCode()).isEqualTo(401);
    assertThat(request("GET", "/api/v1/admin/waitlist", userToken).statusCode()).isEqualTo(403);
    assertThat(request("GET", "/api/v1/admin/shop/products", userToken).statusCode()).isEqualTo(403);
    assertThat(request("GET", "/error", null).statusCode()).isEqualTo(401);
    missing("GET", "/assets/missing-fixture-image.png", null);
  }
}
