package com.wildboy;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
class AddressIntegrationTest {
  static final EmbeddedPostgres pg;
  static { try { pg = EmbeddedPostgres.builder().setServerConfig("unix_socket_directories", "").start(); }
    catch (Exception e) { throw new ExceptionInInitializerError(e); } }
  @DynamicPropertySource static void properties(DynamicPropertyRegistry r) {
    r.add("spring.datasource.url", () -> pg.getJdbcUrl("postgres", "postgres"));
    r.add("spring.datasource.username", () -> "postgres");
    r.add("spring.datasource.password", () -> "");
  }
  @Autowired AddressService addresses;
  @Autowired AuthService auth;
  @Autowired JdbcTemplate db;
  @Autowired MockMvc mvc;
  @Autowired ObjectMapper json;
  Models.User owner;
  String token;
  AddressModels.AddressInput input(boolean def) {
    return new AddressModels.AddressInput("测试收件人", "13800000000", "厦门市测试路 123 号", def);
  }
  @BeforeEach void setup() {
    db.update("DELETE FROM shipping_address");
    owner = auth.user("address-qa:" + UUID.randomUUID(), "QA", "USER");
    token = "Bearer " + auth.login(owner).token();
  }
  @Test void authenticatedHttpCrudAndOwnership() throws Exception {
    mvc.perform(get("/api/v1/me/addresses")).andExpect(status().isUnauthorized());
    mvc.perform(post("/api/v1/me/addresses").contentType("application/json").content(json.writeValueAsString(input(false))))
        .andExpect(status().isUnauthorized());
    var response = mvc.perform(post("/api/v1/me/addresses").header("Authorization", token)
        .contentType("application/json").content(json.writeValueAsString(input(false))))
        .andExpect(status().isCreated()).andExpect(jsonPath("$.isDefault").value(true)).andReturn();
    String id = json.readTree(response.getResponse().getContentAsString()).get("id").asText();
    String other = "Bearer " + auth.login(auth.user("address-qa:other" + UUID.randomUUID(), "Other", "USER")).token();
    mvc.perform(get("/api/v1/me/addresses").header("Authorization", other))
        .andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(0));
    mvc.perform(put("/api/v1/me/addresses/" + id).header("Authorization", other)
        .contentType("application/json").content(json.writeValueAsString(input(true)))).andExpect(status().isNotFound());
    mvc.perform(delete("/api/v1/me/addresses/" + id).header("Authorization", other)).andExpect(status().isNotFound());
    var edited = new AddressModels.AddressInput("新收件人", "13900000000", "厦门市另一条路 456 号", false);
    mvc.perform(put("/api/v1/me/addresses/" + id).header("Authorization", token)
        .contentType("application/json").content(json.writeValueAsString(edited)))
        .andExpect(status().isOk()).andExpect(jsonPath("$.recipientName").value("新收件人"));
    mvc.perform(get("/api/v1/me/addresses").header("Authorization", token))
        .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].phone").value("13900000000"));
    mvc.perform(delete("/api/v1/me/addresses/" + id).header("Authorization", token)).andExpect(status().isNoContent());
    assertThat(addresses.list(owner.id()).items()).isEmpty();
  }
  @Test void validatesEmptyAndBoundaryInputsWithoutSaving() throws Exception {
    for (var value : List.of(
        new AddressModels.AddressInput(" ", "13800000000", "完整的测试地址", false),
        new AddressModels.AddressInput("姓名", "123", "完整的测试地址", false),
        new AddressModels.AddressInput("姓名", "13800000000", "短", false),
        new AddressModels.AddressInput("名".repeat(41), "13800000000", "完整的测试地址", false),
        new AddressModels.AddressInput("姓名", "13800000000", "址".repeat(301), false),
        new AddressModels.AddressInput("姓名", "13800000000", "     ", false))) {
      mvc.perform(post("/api/v1/me/addresses").header("Authorization", token)
          .contentType("application/json").content(json.writeValueAsString(value))).andExpect(status().isBadRequest());
    }
    assertThat(addresses.list(owner.id()).items()).isEmpty();
  }
  @Test void defaultsRemainUniqueAndDeletePromotesRemaining() {
    var first = addresses.create(owner.id(), input(false));
    var second = addresses.create(owner.id(), input(true));
    var third = addresses.create(owner.id(), input(false));
    assertThat(first.isDefault()).isTrue();
    assertThat(addresses.list(owner.id()).items()).filteredOn(AddressModels.Address::isDefault).extracting(AddressModels.Address::id).containsExactly(second.id());
    addresses.update(owner.id(), first.id(), input(true));
    addresses.delete(owner.id(), first.id());
    assertThat(addresses.list(owner.id()).items()).hasSize(2).filteredOn(AddressModels.Address::isDefault).hasSize(1);
    addresses.delete(owner.id(), second.id());
    assertThat(addresses.list(owner.id()).items()).singleElement().satisfies(a -> { assertThat(a.id()).isEqualTo(third.id()); assertThat(a.isDefault()).isTrue(); });
  }
  @Test void concurrentCreatesRespectLimitAndOneDefault() throws Exception {
    for (int i = 0; i < 19; i++) addresses.create(owner.id(), input(false));
    try (var executor = Executors.newFixedThreadPool(5)) {
      List<Callable<Boolean>> tasks = new ArrayList<>();
      for (int i = 0; i < 5; i++) tasks.add(() -> {
        try { addresses.create(owner.id(), input(true)); return true; }
        catch (ApiException e) { assertThat(e.code).isEqualTo("ADDRESS_LIMIT"); return false; }
      });
      int succeeded = 0;
      for (var f : executor.invokeAll(tasks)) if (f.get(10, TimeUnit.SECONDS)) succeeded++;
      assertThat(succeeded).isEqualTo(1);
    }
    assertThat(addresses.list(owner.id()).items()).hasSize(20).filteredOn(AddressModels.Address::isDefault).hasSize(1);
  }
  @Test void failedInsertRollsBackDefaultChange() {
    var first = addresses.create(owner.id(), input(false));
    db.execute("CREATE FUNCTION fail_address_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'QA rollback'; END $$");
    db.execute("CREATE TRIGGER address_failure BEFORE INSERT ON shipping_address FOR EACH ROW EXECUTE FUNCTION fail_address_insert()");
    try { assertThatThrownBy(() -> addresses.create(owner.id(), input(true))).isInstanceOf(RuntimeException.class); }
    finally { db.execute("DROP TRIGGER address_failure ON shipping_address"); db.execute("DROP FUNCTION fail_address_insert()"); }
    assertThat(addresses.list(owner.id()).items()).singleElement().satisfies(a -> { assertThat(a.id()).isEqualTo(first.id()); assertThat(a.isDefault()).isTrue(); });
  }
}
