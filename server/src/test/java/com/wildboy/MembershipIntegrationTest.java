package com.wildboy;

import static com.wildboy.MembershipModels.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wechat.pay.java.service.payments.model.*;
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
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@SpringBootTest @AutoConfigureMockMvc
class MembershipIntegrationTest {
  static final EmbeddedPostgres pg;
  static {try {pg=EmbeddedPostgres.builder().setServerConfig("unix_socket_directories","").start();}catch(Exception e){throw new ExceptionInInitializerError(e);}}
  @DynamicPropertySource static void properties(DynamicPropertyRegistry r){r.add("spring.datasource.url",()->pg.getJdbcUrl("postgres","postgres"));r.add("spring.datasource.username",()->"postgres");r.add("spring.datasource.password",()->"");r.add("wildboy.orders.expiry-scan-ms",()->3600000);}
  @AfterAll static void close() throws Exception {pg.close();}
  @Autowired MembershipService memberships; @Autowired AuthService auth;
  @Autowired LegalService legal; @Autowired JdbcTemplate db;
  @Autowired MockMvc mvc; @Autowired ObjectMapper json; @Autowired PlatformTransactionManager manager;
  @MockitoBean WechatPayService pay;
  Models.User user,admin; String token,adminToken;
  @BeforeEach void setup() {
    user=auth.user("wechat:member-"+UUID.randomUUID(),"Member QA","USER");
    admin=auth.user("membership-admin:"+UUID.randomUUID(),"Admin QA","ADMIN");
    token="Bearer "+auth.login(user).token();adminToken="Bearer "+auth.login(admin).token();
    if(db.queryForObject("SELECT COUNT(*) FROM legal_document_version",Integer.class)==0) {
      for(var kind:LegalModels.Kind.values()){var d=legal.save(kind,new LegalModels.DraftInput("QA "+kind,"Synthetic legal fixture only.",0L),admin.id());legal.publish(kind,d.draft().revision(),admin.id());}
    }
    when(pay.enabled()).thenReturn(true);when(pay.appId()).thenReturn("app");when(pay.merchantId()).thenReturn("merchant");
  }
  List<PricingRule> rules(PricingMode mode,int value) {return List.of(new PricingRule(Scope.ACTIVITY,false,PricingMode.DISCOUNT,9000),new PricingRule(Scope.SHOP,true,mode,value));}
  Tier tier(PricingMode mode,int value) {return memberships.create(new TierInput("QA "+UUID.randomUUID(),0,true,rules(mode,value),null),admin.id());}
  void assign(Tier tier) {memberships.assign(user.id(),new Assignment(CustomerType.MEMBER,tier.id(),memberships.me(user.id()).version()),admin.id());}
  @Test void identityIsPrivateAndAdminSearchUsesStableId() throws Exception {
    var tier=tier(PricingMode.FIXED,700);assign(tier);
    mvc.perform(get("/api/v1/me/membership")).andExpect(status().isUnauthorized());
    mvc.perform(get("/api/v1/me/membership").header("Authorization",token)).andExpect(status().isOk()).andExpect(jsonPath("$.id").value(user.id())).andExpect(jsonPath("$.tierName").value(tier.name())).andExpect(jsonPath("$.externalId").doesNotExist());
    mvc.perform(get("/api/v1/admin/membership/users").param("query",user.id()).header("Authorization",adminToken)).andExpect(jsonPath("$.total").value(1)).andExpect(jsonPath("$.items[0].id").value(user.id()));
    assertThat(memberships.users("%",null,0,20).total()).isZero();
    assertThat(memberships.users(admin.id(),null,0,20).total()).isZero();
    assertThatThrownBy(()->memberships.assign(admin.id(),new Assignment(CustomerType.LEADER,null,0L),admin.id())).isInstanceOf(ApiException.class);
  }
  @Test void fixedPriceMustBeExplicitAndZeroIsValid() throws Exception {
    var draft=json.valueToTree(new TierInput("Explicit amount",0,true,rules(PricingMode.FIXED,0),null));
    var shopRule=(com.fasterxml.jackson.databind.node.ObjectNode)draft.path("rules").get(1);
    String endpoint="/api/v1/admin/membership/tiers";
    shopRule.remove("pricingValue");
    mvc.perform(post(endpoint).header("Authorization",adminToken).contentType("application/json").content(draft.toString()))
        .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    shopRule.putNull("pricingValue");
    mvc.perform(post(endpoint).header("Authorization",adminToken).contentType("application/json").content(draft.toString()))
        .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    shopRule.put("pricingValue",0);
    mvc.perform(post(endpoint).header("Authorization",adminToken).contentType("application/json").content(draft.toString()))
        .andExpect(status().isCreated()).andExpect(jsonPath("$.rules[1].pricingValue").value(0));
  }

  @Test void duplicateTierNamesAreEditableConflictsAndDoNotReplaceExistingRules() throws Exception {
    var existing=tier(PricingMode.FIXED,700);
    var target=tier(PricingMode.DISCOUNT,8000);
    String endpoint="/api/v1/admin/membership/tiers";
    String duplicate=existing.name().toLowerCase(Locale.ROOT);
    var create=new TierInput(duplicate,0,true,rules(PricingMode.FIXED,0),null);
    mvc.perform(post(endpoint).header("Authorization",adminToken).contentType("application/json").content(json.writeValueAsString(create)))
        .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("TIER_NAME_EXISTS"));
    var edit=new TierInput(duplicate,0,true,rules(PricingMode.FIXED,0),target.version());
    mvc.perform(put(endpoint+"/"+target.id()).header("Authorization",adminToken).contentType("application/json").content(json.writeValueAsString(edit)))
        .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("TIER_NAME_EXISTS"));
    assertThat(memberships.tiers()).contains(existing,target);
    assertThat(db.queryForObject("SELECT COUNT(*) FROM audit_event WHERE entity_id=? AND action='MEMBERSHIP_TIER_EDIT'",Integer.class,target.id())).isZero();
  }
  @Test void allPricingModesAreIntegerBoundedAndNeverSurcharge() {
    var tier=tier(PricingMode.DISCOUNT,8000);assign(tier);
    assertThat(memberships.price(user.id(),Scope.SHOP,1001).priceCents()).isEqualTo(801);
    tier=memberships.edit(tier.id(),new TierInput(tier.name(),0,true,rules(PricingMode.FIXED,700),tier.version()),admin.id());
    assertThat(memberships.price(user.id(),Scope.SHOP,1001).priceCents()).isEqualTo(700);
    assertThat(memberships.price(user.id(),Scope.SHOP,400).priceCents()).isEqualTo(400);
    tier=memberships.edit(tier.id(),new TierInput(tier.name(),0,true,rules(PricingMode.REDUCTION,301),tier.version()),admin.id());
    assertThat(memberships.price(user.id(),Scope.SHOP,1001).priceCents()).isEqualTo(700);
    assertThat(memberships.price(user.id(),Scope.SHOP,300).priceCents()).isZero();
    memberships.edit(tier.id(),new TierInput(tier.name(),0,true,rules(PricingMode.DISCOUNT,9999),tier.version()),admin.id());
    assertThat(memberships.price(user.id(),Scope.SHOP,100000000).priceCents()).isEqualTo(99990000);
  }
  @Test void rulesCanIndependentlyEnableActivityAndShop() {
    var tier=memberships.create(new TierInput("Independent "+UUID.randomUUID().toString().substring(0,12),0,true,List.of(new PricingRule(Scope.ACTIVITY,true,PricingMode.DISCOUNT,5000,"ACCOUNT_ALL"),new PricingRule(Scope.SHOP,true,PricingMode.FIXED,750)),null),admin.id());assign(tier);
    assertThat(memberships.price(user.id(),Scope.ACTIVITY,1000).priceCents()).isEqualTo(500);
    assertThat(memberships.price(user.id(),Scope.SHOP,1000).priceCents()).isEqualTo(750);
    memberships.edit(tier.id(),new TierInput(tier.name(),0,true,List.of(new PricingRule(Scope.ACTIVITY,true,PricingMode.DISCOUNT,5000,"ACCOUNT_ALL"),new PricingRule(Scope.SHOP,true,PricingMode.REDUCTION,100)),tier.version()),admin.id());
    assertThat(memberships.price(user.id(),Scope.ACTIVITY,1000).priceCents()).isEqualTo(500);
    assertThat(memberships.price(user.id(),Scope.SHOP,1000).priceCents()).isEqualTo(900);
  }
  @Test void onlyActivityAndShopRulesAreAcceptedByApiAndDatabase() throws Exception {
    assertThat(Scope.values()).containsExactly(Scope.ACTIVITY,Scope.SHOP);
    var tier=tier(PricingMode.FIXED,500);
    mvc.perform(get("/api/v1/admin/membership/tiers").header("Authorization",adminToken))
        .andExpect(status().isOk()).andExpect(jsonPath("$[0].rules.length()").value(2));
    var input=new TierInput("Invalid scopes",0,true,rules(PricingMode.FIXED,500),null);
    String valid=json.writeValueAsString(input);
    mvc.perform(post("/api/v1/admin/membership/tiers").header("Authorization",adminToken).contentType("application/json")
        .content(valid.replace("\"scope\":\"SHOP\"","\"scope\":\"UNSUPPORTED\""))).andExpect(status().isBadRequest());
    for(var invalid:List.of(List.of(tier.rules().getFirst()),List.of(tier.rules().getFirst(),tier.rules().getLast(),tier.rules().getLast()))) {
      mvc.perform(post("/api/v1/admin/membership/tiers").header("Authorization",adminToken).contentType("application/json")
          .content(json.writeValueAsString(new TierInput("Invalid length",0,true,invalid,null)))).andExpect(status().isBadRequest());
    }
    assertThatThrownBy(()->db.update("INSERT INTO membership_pricing_rule(tier_id,scope,enabled,pricing_mode,pricing_value) VALUES(?,'OTHER',FALSE,'FIXED',0)",tier.id()))
        .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
    assertThat(db.queryForList("SELECT scope FROM membership_pricing_rule WHERE tier_id=? ORDER BY scope",String.class,tier.id())).containsExactly("ACTIVITY","SHOP");
  }
  @Test void ruleEditCannotRaceAnOrderSnapshot() throws Exception {
    var tier=tier(PricingMode.FIXED,600);assign(tier);
    var entered=new CountDownLatch(1);var release=new CountDownLatch(1);
    try(var pool=Executors.newFixedThreadPool(2)) {
      var pricing=pool.submit(()->new TransactionTemplate(manager).execute(status->{var p=memberships.price(user.id(),Scope.SHOP,1001);entered.countDown();try{assertThat(release.await(10,TimeUnit.SECONDS)).isTrue();}catch(InterruptedException e){throw new RuntimeException(e);}return p;}));
      assertThat(entered.await(10,TimeUnit.SECONDS)).isTrue();
      var editing=pool.submit(()->memberships.edit(tier.id(),new TierInput(tier.name(),0,true,rules(PricingMode.FIXED,800),tier.version()),admin.id()));
      assertThatThrownBy(()->editing.get(150,TimeUnit.MILLISECONDS)).isInstanceOf(TimeoutException.class);
      release.countDown();assertThat(pricing.get(10,TimeUnit.SECONDS).priceCents()).isEqualTo(600);editing.get(10,TimeUnit.SECONDS);
      assertThat(memberships.price(user.id(),Scope.SHOP,1001).priceCents()).isEqualTo(800);
    }finally{release.countDown();}
  }
  @Test void invalidRulesAndAssignmentsNeverPersist() throws Exception {
    for(var rule:List.of(new PricingRule(Scope.SHOP,true,PricingMode.DISCOUNT,0),new PricingRule(Scope.SHOP,true,PricingMode.DISCOUNT,10001),new PricingRule(Scope.SHOP,true,PricingMode.FIXED,-1))) {
      var bad=List.of(new PricingRule(Scope.ACTIVITY,false,PricingMode.DISCOUNT,10000),rule);
      mvc.perform(post("/api/v1/admin/membership/tiers").header("Authorization",adminToken).contentType("application/json").content(json.writeValueAsString(new TierInput("Bad",0,true,bad,null)))).andExpect(status().isBadRequest());
    }
    var duplicate=List.of(new PricingRule(Scope.SHOP,true,PricingMode.FIXED,100),new PricingRule(Scope.SHOP,true,PricingMode.FIXED,200));
    assertThatThrownBy(()->memberships.create(new TierInput("Bad",0,true,duplicate,null),admin.id())).isInstanceOf(ApiException.class);
    assertThatThrownBy(()->memberships.assign(user.id(),new Assignment(CustomerType.MEMBER,null,0L),admin.id())).isInstanceOf(ApiException.class);
    var tier=tier(PricingMode.FIXED,500);
    assertThatThrownBy(()->memberships.assign(user.id(),new Assignment(CustomerType.LEADER,tier.id(),0L),admin.id())).isInstanceOf(ApiException.class);
    assertThat(memberships.me(user.id()).customerType()).isEqualTo("GUEST");
  }
  @Test void fractionalCentsAndNumericEnumsAreRejectedRatherThanCoerced() throws Exception {
    var body=json.writeValueAsString(new TierInput("Precision",0,true,rules(PricingMode.FIXED,123),null));
    for(String bad:List.of(body.replace("\"pricingValue\":123","\"pricingValue\":123.5"),body.replace("\"scope\":\"SHOP\"","\"scope\":1")))
      mvc.perform(post("/api/v1/admin/membership/tiers").header("Authorization",adminToken).contentType("application/json").content(bad)).andExpect(status().isBadRequest());
    var activityRule=List.of(new PricingRule(Scope.ACTIVITY,true,PricingMode.FIXED,0),new PricingRule(Scope.SHOP,false,PricingMode.FIXED,0));
    assertThatThrownBy(()->memberships.create(new TierInput("Unspecified party",0,true,activityRule,null),admin.id())).hasMessageContaining("明确选择");
  }
  @Test void competingAssignmentVersionsHaveOneWinner() throws Exception {
    try(var pool=Executors.newFixedThreadPool(2)) {
      var start=new CountDownLatch(1);
      Callable<Boolean> edit=()->{start.await();try{memberships.assign(user.id(),new Assignment(CustomerType.LEADER,null,0L),admin.id());return true;}catch(ApiException e){assertThat(e.code).isEqualTo("STALE_VERSION");return false;}};
      var a=pool.submit(edit);var b=pool.submit(edit);start.countDown();
      assertThat(List.of(a.get(10,TimeUnit.SECONDS),b.get(10,TimeUnit.SECONDS))).containsExactlyInAnyOrder(true,false);
    }
    assertThat(memberships.me(user.id()).version()).isEqualTo(1);
  }
  @Test void failedAuditRollsBackTierAndUserWrites() {
    var tier=tier(PricingMode.FIXED,500);
    db.execute("CREATE FUNCTION fail_membership_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action IN ('MEMBERSHIP_TIER_EDIT','MEMBERSHIP_ASSIGN') THEN RAISE EXCEPTION 'QA rollback'; END IF; RETURN NEW; END $$");
    db.execute("CREATE TRIGGER qa_membership_failure BEFORE INSERT ON audit_event FOR EACH ROW EXECUTE FUNCTION fail_membership_audit()");
    try {
      assertThatThrownBy(()->memberships.edit(tier.id(),new TierInput(tier.name(),0,false,rules(PricingMode.FIXED,700),tier.version()),admin.id())).isInstanceOf(RuntimeException.class);
      assertThatThrownBy(()->memberships.assign(user.id(),new Assignment(CustomerType.MEMBER,tier.id(),0L),admin.id())).isInstanceOf(RuntimeException.class);
    }finally{db.execute("DROP TRIGGER qa_membership_failure ON audit_event");db.execute("DROP FUNCTION fail_membership_audit()");}
    assertThat(memberships.tiers().stream().filter(t->t.id().equals(tier.id())).findFirst().orElseThrow()).isEqualTo(tier);
    assertThat(memberships.me(user.id()).customerType()).isEqualTo("GUEST");
  }

}
