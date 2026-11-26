package com.wildboy;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest @AutoConfigureMockMvc
class OperationsIntegrationTest {
 static final EmbeddedPostgres pg;
 static {try{pg=EmbeddedPostgres.builder().setServerConfig("unix_socket_directories","").start();}catch(Exception e){throw new ExceptionInInitializerError(e);}}
 @DynamicPropertySource static void props(DynamicPropertyRegistry r){r.add("spring.datasource.url",()->pg.getJdbcUrl("postgres","postgres"));r.add("spring.datasource.username",()->"postgres");r.add("spring.datasource.password",()->"");}
 @Autowired ActivityCopyService copies; @Autowired ActivityService activities; @Autowired OperationsService operations; @Autowired AuthService auth; @Autowired JdbcTemplate db; @Autowired MockMvc mvc; @Autowired ObjectMapper json;
 Models.User admin; Models.Activity source; String token;
 @BeforeEach void setup(){admin=auth.user("ops-qa:"+UUID.randomUUID(),"QA ADMIN","ADMIN");token="Bearer "+auth.login(admin).token();var start=OffsetDateTime.now().plusDays(7);source=activities.create(new Models.ActivityInput("QA路线",Models.Category.WEEKLY,"/assets/hiking.jpg",List.of(),"路线简介","路线说明","厦门","集合点",start,start.plusHours(4),start.minusDays(1),20,0,null,false),admin.id());}
 @Test void httpAuthorizationAndValidation() throws Exception {
   String normal="Bearer "+auth.login(auth.user("ops-user:"+UUID.randomUUID(),"USER","USER")).token();
   for(String path:List.of("/admin/dashboard","/admin/exceptions","/admin/audit")){
     mvc.perform(get("/api/v1"+path)).andExpect(status().isUnauthorized());mvc.perform(get("/api/v1"+path).header("Authorization",normal)).andExpect(status().isForbidden());mvc.perform(get("/api/v1"+path).header("Authorization",token)).andExpect(status().isOk());
   }
   mvc.perform(get("/api/v1/admin/dashboard?days=999").header("Authorization",token)).andExpect(status().isBadRequest());
   mvc.perform(get("/api/v1/admin/audit?page=-1").header("Authorization",token)).andExpect(status().isBadRequest());
 }
 @Test void migratesActivityRichContentOnSaveAndCopiesTheEditableSource() throws Exception {
   String base = "/api/v1/admin/activities/" + source.id() + "/content";
   String editor = base + "/markdown";
   var oldBlocks = List.of(
       new ContentModels.Block("text", "沿路注意 **石滑**", null, null, null),
       new ContentModels.Block("image", null, "/assets/hiking.jpg", "路线图", null),
       new ContentModels.Block("table", null, null, null, List.of(List.of("站点","时间"), List.of("入口","08:30"))),
       new ContentModels.Block("wechat", "<p style='color: #086'>公众号原文</p>", null, null, null));
   mvc.perform(put(base).header("Authorization",token).contentType("application/json")
       .content(json.writeValueAsString(new ContentModels.Input(oldBlocks,0L)))).andExpect(status().isOk());
   mvc.perform(get(editor)).andExpect(status().isUnauthorized());
   var response = mvc.perform(get(editor).header("Authorization",token))
       .andExpect(status().isOk()).andExpect(jsonPath("$.version").value(1)).andReturn();
   String converted = json.readTree(response.getResponse().getContentAsByteArray()).path("markdown").asText();
   assertThat(converted).contains("石滑","![路线图](/assets/hiking.jpg)","08\\:30","wildboy-wechat");
   assertThat(db.queryForObject("SELECT markdown FROM rich_content WHERE entity_id=?",String.class,source.id())).isNull();
   String markdown = "# 山脊线\n\n" + converted + "\n![不安全](javascript:alert%281%29)";
   String input = json.writeValueAsString(new ContentModels.MarkdownInput(markdown,1L));
   mvc.perform(put(editor).header("Authorization",token).contentType("application/json").content(input))
       .andExpect(status().isOk()).andExpect(jsonPath("$.version").value(2));
   mvc.perform(put(editor).header("Authorization",token).contentType("application/json").content(input))
       .andExpect(status().isConflict());
   mvc.perform(put(base).header("Authorization",token).contentType("application/json")
       .content(json.writeValueAsString(new ContentModels.Input(oldBlocks,2L)))).andExpect(status().isConflict());
   db.update("UPDATE activity SET status='PUBLISHED' WHERE id=?",source.id());
   var publicValue = mvc.perform(get("/api/v1/activities/"+source.id()+"/content"))
       .andExpect(status().isOk()).andExpect(jsonPath("$.blocks[0].type").value("wechat"))
       .andExpect(jsonPath("$.blocks[0].nodes").isArray()).andReturn().getResponse().getContentAsByteArray();
   assertThat(new String(publicValue, java.nio.charset.StandardCharsets.UTF_8))
       .contains("山脊线","石滑","08:30","公众号原文","/assets/hiking.jpg").doesNotContain("javascript:");
   var at = OffsetDateTime.now().plusDays(26);
   var copy = copies.copy(source.id(),new ActivityCopyService.Copy(at,"markdown-copy",source.version()),admin.id());
   String copyEditor = "/api/v1/admin/activities/" + copy.id() + "/content/markdown";
   mvc.perform(get(copyEditor).header("Authorization",token)).andExpect(status().isOk())
       .andExpect(jsonPath("$.markdown").value(markdown));
 }
 @Test void copyPreservesContentNotAttendeesAndIsIdempotent(){
   db.update("INSERT INTO rich_content(entity_type,entity_id,blocks) VALUES ('activity',?,?)",source.id(),"[{\"type\":\"text\",\"text\":\"集合说明\"}]");
   var at=OffsetDateTime.now().plusDays(21).truncatedTo(java.time.temporal.ChronoUnit.MICROS);var input=new ActivityCopyService.Copy(at,"test-copy-"+UUID.randomUUID(),source.version());var first=copies.copy(source.id(),input,admin.id());var second=copies.copy(source.id(),input,admin.id());
   assertThat(first.id()).isEqualTo(second.id()).isNotEqualTo(source.id());assertThat(first.status()).isEqualTo("DRAFT");assertThat(first.registeredCount()).isZero();assertThat(first.startAt().toInstant()).isEqualTo(at.toInstant());assertThat(Duration.between(first.startAt(),first.endAt()).toHours()).isEqualTo(4);assertThat(Duration.between(first.registrationDeadline(),first.startAt()).toDays()).isEqualTo(1);
   assertThat(db.queryForObject("SELECT blocks FROM rich_content WHERE entity_id=?",String.class,first.id())).contains("集合说明");
   assertThatThrownBy(()->copies.copy(source.id(),new ActivityCopyService.Copy(at.plusDays(1),input.requestId(),source.version()),admin.id())).isInstanceOf(ApiException.class);
 }
 @Test void copyRetryNormalizesNanosecondPrecision(){
   var at=OffsetDateTime.now().plusDays(21).withNano(123456789);
   var input=new ActivityCopyService.Copy(at,"nano-copy-"+UUID.randomUUID(),source.version());
   var first=copies.copy(source.id(),input,admin.id());
   var second=copies.copy(source.id(),input,admin.id());
   assertThat(second.id()).isEqualTo(first.id());
   assertThat(first.startAt().toInstant()).isEqualTo(at.toInstant().truncatedTo(java.time.temporal.ChronoUnit.MICROS));
 }
 @Test void auditDoesNotReturnPrivatePayloadsAndRangesAreBounded(){
   var page=operations.audit(0,20,source.id());
   assertThat(page.items()).hasSize(1);
   assertThat(operations.audit(0,20,source.id(),"ACTIVITY_CREATE").items()).hasSize(1);
   assertThat(operations.audit(0,20,source.id(),"ACTIVITY_COPY").items()).isEmpty();
   assertThat(page.items().getFirst()).containsKeys("actor","action","entity_id").doesNotContainKeys("phone","address","id_number","token");
   assertThat(operations.dashboard(7)).containsKeys("activities","orders","pendingShipping","lowStock","trend");assertThatThrownBy(()->operations.exceptions(0,501)).isInstanceOf(ApiException.class);
 }
 @Test void fullActivityCardScopesTheActivityList() throws Exception {
   db.update("UPDATE activity SET status='PUBLISHED',registered_count=capacity WHERE id=?",source.id());
   mvc.perform(get("/api/v1/admin/activities").param("upcomingFull","true")
       .param("title",source.title()).header("Authorization",token))
       .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].id").value(source.id()));
   db.update("UPDATE activity SET registered_count=0 WHERE id=?",source.id());
   mvc.perform(get("/api/v1/admin/activities").param("upcomingFull","true")
       .param("title",source.title()).header("Authorization",token))
       .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(0));
 }
 @Test void freeOrdersAwaitShippingWithoutChangingCashMetricsAndRetiredNoticesStayHidden() throws Exception {
   var before=operations.dashboard(7);
   String id=UUID.randomUUID().toString();
   db.update("INSERT INTO shop_order(id,order_no,user_id,original_total_cents,total_cents,status,recipient_name,phone,address) VALUES(?,?,?,100,0,'CONFIRMED_FREE','QA buyer','13800000000','Synthetic street')",
       id,id.replace("-",""),admin.id());
   var after=operations.dashboard(7);
   assertThat(after.get("pendingShipping")).isEqualTo((Long)before.get("pendingShipping")+1);
   mvc.perform(get("/api/v1/admin/orders").param("awaitingShipment","true")
       .param("query",id.replace("-","")).header("Authorization",token))
       .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].id").value(id));
   assertThat(after.get("orders")).isEqualTo(before.get("orders"));
   assertThat(after.get("trend")).isEqualTo(before.get("trend"));
   db.update("INSERT INTO notification_outbox(id,user_id,activity_id,kind,dedupe_key,title,detail,event_at,status,retired_at) VALUES(?,?,?,'WAITLIST_OFFER',?,'Fixture','Fixture',CURRENT_TIMESTAMP,'UNKNOWN',CURRENT_TIMESTAMP)",
       id,admin.id(),source.id(),"waitlist:"+id);
   assertThat(operations.exceptions(0,20).items()).noneMatch(row->id.equals(row.get("id")));
 }
 @Test void copiedPaidDraftPreservesBasePriceAndRemainsUnpublished(){
   db.update("UPDATE activity SET price_cents=3200 WHERE id=?",source.id());
   source=activities.get(source.id(),true);
   var copied=copies.copy(source.id(),new ActivityCopyService.Copy(OffsetDateTime.now().plusDays(21),"paid-copy-"+UUID.randomUUID(),source.version()),admin.id());
   assertThat(copied.priceCents()).isEqualTo(3200);assertThat(copied.status()).isEqualTo("DRAFT");assertThat(copied.registeredCount()).isZero();
 }
}
