package com.wildboy;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import java.time.*;
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

@SpringBootTest @AutoConfigureMockMvc
class OperationsIntegrationTest {
 static final EmbeddedPostgres pg;
 static {try{pg=EmbeddedPostgres.builder().setServerConfig("unix_socket_directories","").start();}catch(Exception e){throw new ExceptionInInitializerError(e);}}
 @DynamicPropertySource static void props(DynamicPropertyRegistry r){r.add("spring.datasource.url",()->pg.getJdbcUrl("postgres","postgres"));r.add("spring.datasource.username",()->"postgres");r.add("spring.datasource.password",()->"");}
 @Autowired TemplateService templates; @Autowired ActivityService activities; @Autowired OperationsService operations; @Autowired AuthService auth; @Autowired JdbcTemplate db; @Autowired MockMvc mvc; @Autowired ObjectMapper json;
 Models.User admin; Models.Activity source; String token;
 @BeforeEach void setup(){admin=auth.user("ops-qa:"+UUID.randomUUID(),"QA ADMIN","ADMIN");token="Bearer "+auth.login(admin).token();var start=OffsetDateTime.now().plusDays(7);source=activities.create(new Models.ActivityInput("QA路线",Models.Category.WEEKLY,"/assets/hiking.jpg",List.of(),"路线简介","路线说明","厦门","集合点",start,start.plusHours(4),start.minusDays(1),20,0,null,false),admin.id());}
 TemplateService.Template template(){return templates.save(null,new TemplateService.Input("每周徒步",source.id(),source.version(),null),admin.id());}
 @Test void httpAuthorizationAndValidation() throws Exception {
   String normal="Bearer "+auth.login(auth.user("ops-user:"+UUID.randomUUID(),"USER","USER")).token();
   for(String path:List.of("/admin/templates","/admin/dashboard","/admin/exceptions","/admin/audit")){
     mvc.perform(get("/api/v1"+path)).andExpect(status().isUnauthorized());mvc.perform(get("/api/v1"+path).header("Authorization",normal)).andExpect(status().isForbidden());mvc.perform(get("/api/v1"+path).header("Authorization",token)).andExpect(status().isOk());
   }
   mvc.perform(get("/api/v1/admin/dashboard?days=999").header("Authorization",token)).andExpect(status().isBadRequest());
   mvc.perform(get("/api/v1/admin/audit?page=-1").header("Authorization",token)).andExpect(status().isBadRequest());
   mvc.perform(post("/api/v1/admin/templates").header("Authorization",token).contentType("application/json").content("{\"name\":\"\",\"sourceId\":\"a\",\"sourceVersion\":0}")).andExpect(status().isBadRequest());
   var response=mvc.perform(post("/api/v1/admin/templates").header("Authorization",token).contentType("application/json").content(json.writeValueAsString(new TemplateService.Input("模板",source.id(),source.version(),null)))).andExpect(status().isOk()).andReturn();
   String id=json.readTree(response.getResponse().getContentAsString()).get("id").asText();
   mvc.perform(post("/api/v1/admin/templates/"+id+"/generate").header("Authorization",token).contentType("application/json").content(json.writeValueAsString(new TemplateService.Generate(List.of(OffsetDateTime.now().plusDays(14)),0L)))).andExpect(status().isOk()).andExpect(jsonPath("$[0].status").value("DRAFT")).andExpect(jsonPath("$[0].registeredCount").value(0));
 }
 @Test void editsTemplateContentWithoutChangingSourceOrExistingDrafts() throws Exception {
   db.update("INSERT INTO rich_content(entity_type,entity_id,blocks) VALUES ('activity',?,?)",
       source.id(), "[{\"type\":\"text\",\"text\":\"原集合说明\"}]");
   var template = template();
   var start = OffsetDateTime.now().plusDays(28);
   var original = templates.generate(template.id(),new TemplateService.Generate(List.of(start),template.version()),admin.id()).getFirst();
   var update = new TemplateService.ContentInput("新模板名", template.version(), "新路线", Models.Category.DOMESTIC,
       "新摘要", "新活动说明", "泉州", "南门", "/assets/new-cover.jpg", List.of("/assets/photo.jpg"),
       30, 12550, true, 180, 60);
   String path = "/api/v1/admin/templates/"+template.id()+"/content";
   String payload = json.writeValueAsString(update);
   String normal = "Bearer "+auth.login(auth.user("ops-user:"+UUID.randomUUID(),"USER","USER")).token();
   mvc.perform(put(path).header("Authorization",normal).contentType("application/json").content(payload))
       .andExpect(status().isForbidden());
   mvc.perform(put(path).header("Authorization",token).contentType("application/json")
       .content(payload.replace("/assets/new-cover.jpg", "http://invalid.example/cover.jpg")))
       .andExpect(status().isBadRequest());
   mvc.perform(put(path).header("Authorization",token).contentType("application/json").content(payload))
       .andExpect(status().isOk()).andExpect(jsonPath("$.name").value("新模板名"))
       .andExpect(jsonPath("$.version").value(template.version()+1))
       .andExpect(jsonPath("$.activity.title").value("新路线"))
       .andExpect(jsonPath("$.activity.priceCents").value(12550));
   mvc.perform(put(path).header("Authorization",token).contentType("application/json").content(payload))
       .andExpect(status().isConflict());
   assertThat(activities.get(source.id(),true).title()).isEqualTo(source.title());
   assertThat(activities.get(original.id(),true).title()).isEqualTo(source.title());
   var generated = templates.generate(template.id(),
       new TemplateService.Generate(List.of(start.plusDays(7)),template.version()+1),admin.id()).getFirst();
   assertThat(generated.title()).isEqualTo("新路线");
   assertThat(generated.description()).isEqualTo("新活动说明");
   assertThat(generated.priceCents()).isEqualTo(12550);
   assertThat(generated.status()).isEqualTo("DRAFT");
   assertThat(Duration.between(generated.startAt(),generated.endAt()).toMinutes()).isEqualTo(180);
   assertThat(Duration.between(generated.registrationDeadline(),generated.startAt()).toMinutes()).isEqualTo(60);
   assertThat(db.queryForObject("SELECT blocks FROM rich_content WHERE entity_id=?",String.class,generated.id()))
       .contains("原集合说明");
 }
 @Test void copyPreservesContentNotAttendeesAndIsIdempotent(){
   db.update("INSERT INTO rich_content(entity_type,entity_id,blocks) VALUES ('activity',?,?)",source.id(),"[{\"type\":\"text\",\"text\":\"集合说明\"}]");
   var at=OffsetDateTime.now().plusDays(21).truncatedTo(java.time.temporal.ChronoUnit.MICROS);var input=new TemplateService.Copy(at,"test-copy-"+UUID.randomUUID(),source.version());var first=templates.copy(source.id(),input,admin.id());var second=templates.copy(source.id(),input,admin.id());
   assertThat(first.id()).isEqualTo(second.id()).isNotEqualTo(source.id());assertThat(first.status()).isEqualTo("DRAFT");assertThat(first.registeredCount()).isZero();assertThat(first.startAt().toInstant()).isEqualTo(at.toInstant());assertThat(Duration.between(first.startAt(),first.endAt()).toHours()).isEqualTo(4);assertThat(Duration.between(first.registrationDeadline(),first.startAt()).toDays()).isEqualTo(1);
   assertThat(db.queryForObject("SELECT blocks FROM rich_content WHERE entity_id=?",String.class,first.id())).contains("集合说明");
   assertThatThrownBy(()->templates.copy(source.id(),new TemplateService.Copy(at.plusDays(1),input.requestId(),source.version()),admin.id())).isInstanceOf(ApiException.class);
 }
 @Test void generationIsAtomicConcurrentAndSnapshotBased() throws Exception {
   var t=template();var at=OffsetDateTime.now().plusDays(28);var in=new TemplateService.Generate(List.of(at,at.plusDays(7)),t.version());
   try(var pool=Executors.newFixedThreadPool(3)){var results=pool.invokeAll(List.<Callable<List<Models.Activity>>>of(()->templates.generate(t.id(),in,admin.id()),()->templates.generate(t.id(),in,admin.id()),()->templates.generate(t.id(),in,admin.id())));var ids=results.getFirst().get().stream().map(Models.Activity::id).toList();for(var f:results)assertThat(f.get().stream().map(Models.Activity::id)).containsExactlyElementsOf(ids);}
   assertThat(db.queryForObject("SELECT COUNT(*) FROM activity_generation WHERE template_id=?",Integer.class,t.id())).isEqualTo(2);
   assertThatThrownBy(()->templates.generate(t.id(),new TemplateService.Generate(List.of(at.plusDays(14),OffsetDateTime.now().minusDays(1)),t.version()),admin.id())).isInstanceOf(ApiException.class);
   assertThat(db.queryForObject("SELECT COUNT(*) FROM activity_generation WHERE template_id=?",Integer.class,t.id())).isEqualTo(2);
   assertThatThrownBy(()->templates.generate(t.id(),new TemplateService.Generate(List.of(at),99L),admin.id())).isInstanceOf(ApiException.class);
 }
 @Test void copyRetryNormalizesNanosecondPrecision(){
   var at=OffsetDateTime.now().plusDays(21).withNano(123456789);
   var input=new TemplateService.Copy(at,"nano-copy-"+UUID.randomUUID(),source.version());
   var first=templates.copy(source.id(),input,admin.id());
   var second=templates.copy(source.id(),input,admin.id());
   assertThat(second.id()).isEqualTo(first.id());
   assertThat(first.startAt().toInstant()).isEqualTo(at.toInstant().truncatedTo(java.time.temporal.ChronoUnit.MICROS));
 }
 @Test void generationRetryUsesReturnedMicrosecondPrecision(){
   var t=template();var at=OffsetDateTime.now().plusDays(28).withNano(123456789);
   var first=templates.generate(t.id(),new TemplateService.Generate(List.of(at),t.version()),admin.id()).getFirst();
   var retried=templates.generate(t.id(),new TemplateService.Generate(List.of(first.startAt()),t.version()),admin.id()).getFirst();
   assertThat(retried.id()).isEqualTo(first.id());
   assertThat(db.queryForObject("SELECT COUNT(*) FROM activity_generation WHERE template_id=?",Integer.class,t.id())).isEqualTo(1);
 }
 @Test void auditDoesNotReturnPrivatePayloadsAndRangesAreBounded(){
   var t=template();var page=operations.audit(0,20,t.id());assertThat(page.items()).hasSize(1); assertThat(operations.audit(0,20,t.id(),"TEMPLATE_SAVE").items()).hasSize(1); assertThat(operations.audit(0,20,t.id(),"TEMPLATE_DELETE").items()).isEmpty();assertThat(page.items().getFirst()).containsKeys("actor","action","entity_id").doesNotContainKeys("phone","address","id_number","token");
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
 @Test void copiedAndGeneratedPaidDraftsPreserveBasePriceAndRemainUnpublished(){
   db.update("UPDATE activity SET price_cents=3200 WHERE id=?",source.id());
   source=activities.get(source.id(),true);
   var copied=templates.copy(source.id(),new TemplateService.Copy(OffsetDateTime.now().plusDays(21),"paid-copy-"+UUID.randomUUID(),source.version()),admin.id());
   assertThat(copied.priceCents()).isEqualTo(3200);assertThat(copied.status()).isEqualTo("DRAFT");assertThat(copied.registeredCount()).isZero();
   var template=template();assertThat(template.activity().priceCents()).isEqualTo(3200);
   db.update("UPDATE activity SET price_cents=9900 WHERE id=?",source.id());
   var generated=templates.generate(template.id(),new TemplateService.Generate(List.of(OffsetDateTime.now().plusDays(28)),template.version()),admin.id()).getFirst();
   assertThat(generated.priceCents()).isEqualTo(3200);assertThat(generated.status()).isEqualTo("DRAFT");assertThat(generated.registeredCount()).isZero();
 }

}
