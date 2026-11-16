package com.wildboy;

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
import org.springframework.boot.test.autoconfigure.web.servlet.*;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.*;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.*;

@SpringBootTest
@AutoConfigureMockMvc(print=MockMvcPrint.NONE)
@DirtiesContext(classMode=DirtiesContext.ClassMode.AFTER_CLASS)
class ShopCategoryPriceIntegrationTest {
  static final EmbeddedPostgres pg;
  static {
    try { pg=EmbeddedPostgres.builder().setServerConfig("unix_socket_directories", "").start(); }
    catch(Exception e) { throw new ExceptionInInitializerError(e); }
  }
  @DynamicPropertySource static void properties(DynamicPropertyRegistry r) {
    r.add("spring.datasource.url",()->pg.getJdbcUrl("postgres","postgres"));
    r.add("spring.datasource.username",()->"postgres"); r.add("spring.datasource.password",()->"");
    r.add("wildboy.notifications.scan-ms",()->3600000); r.add("wildboy.orders.expiry-scan-ms",()->3600000);
  }
  @Autowired ShopService shop;
  @Autowired ShopCategoryService categories;
  @Autowired AuthService auth;
  @Autowired LegalService legal;
  @Autowired RefundService refunds;
  @Autowired JdbcTemplate db;
  @Autowired ObjectMapper json;
  @Autowired MockMvc mvc;
  @MockitoBean WechatPayService pay;
  Models.User admin, owner;
  String adminToken, ownerToken;

  @BeforeEach void setup() {
    db.execute("TRUNCATE app_user,product,activity,legal_consent,legal_document_version,audit_event CASCADE");
    db.update("INSERT INTO admin_account_configuration(id) VALUES(1)");
    db.update("DELETE FROM product_category WHERE id<>'uncategorized'");
    db.update("UPDATE product_category SET name='未分类',sort_order=9999,version=0 WHERE id='uncategorized'");
    db.update("UPDATE legal_document_state SET draft_title='',draft_content='',draft_revision=0,published_version=NULL");
    for(var kind:LegalModels.Kind.values()) {
      var draft=legal.save(kind,new LegalModels.DraftInput("Fixture "+kind,"Synthetic shop policy for local tests.",0L),"fixture");
      legal.publish(kind,draft.draft().revision(),"fixture");
    }
    // Standard ADMIN CRUD remains available independently of the stricter role-management API.
    admin=auth.user("category-fixture-admin","QA admin","ADMIN");
    owner=auth.user("wechat:category-fixture-owner","QA user","USER");
    adminToken="Bearer "+auth.login(admin).token(); ownerToken="Bearer "+auth.login(owner).token();
    reset(pay); when(pay.enabled()).thenReturn(true); when(pay.appId()).thenReturn("app"); when(pay.merchantId()).thenReturn("merchant");
    when(pay.prepay(any(),any())).thenReturn(new ShopModels.PaymentRequest("1","nonce","prepay_id=fixture","RSA","fixture"));
  }
  ShopCategoryModels.AdminCategory category(String name,int sort) {
    return categories.create(new ShopCategoryModels.CreateInput(name,sort),admin.id());
  }
  Map<String,Object> productBody(int price, Integer original, String category, Long version, String status) {
    var body=new LinkedHashMap<String,Object>();
    body.put("name","Local gear");body.put("description","Synthetic fixture");body.put("imageUrl","/assets/equipment.jpg");
    body.put("priceCents",price);body.put("stock",10);body.put("status",status);
    if(original!=null)body.put("originalPriceCents",original);
    if(category!=null)body.put("categoryId",category);
    if(version!=null)body.put("version",version);
    return body;
  }
  ShopModels.Product create(int price,Integer original,String category,String status) throws Exception {
    var response=mvc.perform(post("/api/v1/admin/shop/products").header("Authorization",adminToken)
        .contentType("application/json").content(json.writeValueAsBytes(productBody(price,original,category,null,status))))
        .andExpect(status().isCreated()).andReturn();
    return json.readValue(response.getResponse().getContentAsByteArray(),ShopModels.Product.class);
  }
  ResultActions edit(ShopModels.Product current,Map<String,Object> body) throws Exception {
    return mvc.perform(put("/api/v1/admin/shop/products/"+current.id()).header("Authorization",adminToken)
        .contentType("application/json").content(json.writeValueAsBytes(body)));
  }

  @Test void categoriesArePublicButCreationAndEditingRequireAdminAndUseVersionedUniqueNames() throws Exception {
    mvc.perform(get("/api/v1/shop/categories")).andExpect(status().isOk())
        .andExpect(jsonPath("$[0].id").value("uncategorized")).andExpect(jsonPath("$[0].name").value("未分类"))
        .andExpect(jsonPath("$[0].productCount").doesNotExist());
    String body="{\"name\":\"  Gear  \",\"sortOrder\":5}";
    mvc.perform(post("/api/v1/admin/shop/categories").contentType("application/json").content(body)).andExpect(status().isUnauthorized());
    mvc.perform(post("/api/v1/admin/shop/categories").header("Authorization",ownerToken).contentType("application/json").content(body)).andExpect(status().isForbidden());
    var response=mvc.perform(post("/api/v1/admin/shop/categories").header("Authorization",adminToken).contentType("application/json").content(body))
        .andExpect(status().isCreated()).andExpect(jsonPath("$.name").value("Gear")).andExpect(jsonPath("$.productCount").value(0)).andReturn();
    var made=json.readValue(response.getResponse().getContentAsByteArray(),ShopCategoryModels.AdminCategory.class);
    mvc.perform(post("/api/v1/admin/shop/categories").header("Authorization",adminToken).contentType("application/json")
        .content("{\"name\":\"gear\",\"sortOrder\":1}")) .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("CATEGORY_NAME_EXISTS"));
    mvc.perform(put("/api/v1/admin/shop/categories/"+made.id()).header("Authorization",adminToken).contentType("application/json")
        .content("{\"name\":\"Equipment\",\"sortOrder\":2,\"version\":0}"))
        .andExpect(status().isOk()).andExpect(jsonPath("$.version").value(1));
    mvc.perform(put("/api/v1/admin/shop/categories/missing").header("Authorization",adminToken).contentType("application/json")
        .content("{\"name\":\"Missing\",\"sortOrder\":1,\"version\":0}"))
        .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("CATEGORY_NOT_FOUND"));
    mvc.perform(delete("/api/v1/admin/shop/categories/"+made.id()).header("Authorization",adminToken)).andExpect(status().isMethodNotAllowed());
  }

  @Test void categoryValidationRejectsBlankControlCharactersOutOfRangeAndDecimalOrdering() throws Exception {
    for(var bad:List.of(Map.of("name"," ","sortOrder",1),Map.of("name","A\nB","sortOrder",1),
        Map.of("name","A\u200bB","sortOrder",1),Map.of("name","A".repeat(41),"sortOrder",1),
        Map.of("name","Gear","sortOrder",-1),Map.of("name","Gear","sortOrder",10000),
        Map.of("name","Gear","sortOrder",1.5),Map.of("name","Gear","sortOrder","1")))
      mvc.perform(post("/api/v1/admin/shop/categories").header("Authorization",adminToken).contentType("application/json")
          .content(json.writeValueAsBytes(bad))).andExpect(status().isBadRequest());
    assertThat(categories.categories()).hasSize(1);
  }

  @Test void categoryOptimisticEditsAndConcurrentDuplicateCreatesApplyOnce() throws Exception {
    var c=category("Gear",1);
    try(var pool=Executors.newFixedThreadPool(2)) {
      var jobs=List.<Callable<Integer>>of(
          ()->categoryEditStatus(c.id(),"Gear A",0),()->categoryEditStatus(c.id(),"Gear B",0));
      var statuses=new ArrayList<Integer>();for(var r:pool.invokeAll(jobs))statuses.add(r.get(10,TimeUnit.SECONDS));
      assertThat(statuses).containsExactlyInAnyOrder(200,409);
      var creates=List.<Callable<Integer>>of(()->categoryCreateStatus("New Gear"),()->categoryCreateStatus("new gear"));
      statuses.clear();for(var r:pool.invokeAll(creates))statuses.add(r.get(10,TimeUnit.SECONDS));
      assertThat(statuses).containsExactlyInAnyOrder(201,409);
    }
    assertThat(db.queryForObject("SELECT COUNT(*) FROM audit_event WHERE entity_id=? AND action='PRODUCT_CATEGORY_EDIT'",Integer.class,c.id())).isEqualTo(1);
  }
  int categoryEditStatus(String id,String name,long version) throws Exception {
    return mvc.perform(put("/api/v1/admin/shop/categories/"+id).header("Authorization",adminToken).contentType("application/json")
        .content(json.writeValueAsBytes(Map.of("name",name,"sortOrder",2,"version",version)))).andReturn().getResponse().getStatus();
  }
  int categoryCreateStatus(String name) throws Exception {
    return mvc.perform(post("/api/v1/admin/shop/categories").header("Authorization",adminToken).contentType("application/json")
        .content(json.writeValueAsBytes(Map.of("name",name,"sortOrder",2)))).andReturn().getResponse().getStatus();
  }

  @Test void categoryFiltersKeepCatalogArrayShapeExcludeOffShelfAndRefreshNamesAndCounts() throws Exception {
    var a=category("A",1);var b=category("B",2);var empty=category("Empty",3);
    var visible=create(100,200,a.id(),"ON_SALE");create(100,100,a.id(),"OFF_SHELF");create(100,null,b.id(),"ON_SALE");
    mvc.perform(get("/api/v1/shop/products?categoryId="+a.id())).andExpect(status().isOk())
        .andExpect(jsonPath("$.length()").value(1)).andExpect(jsonPath("$[0].id").value(visible.id()));
    mvc.perform(get("/api/v1/admin/shop/products?categoryId="+a.id()).header("Authorization",adminToken))
        .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(2));
    mvc.perform(get("/api/v1/shop/products?categoryId="+empty.id())).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
    mvc.perform(get("/api/v1/shop/products?categoryId=missing")).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("CATEGORY_NOT_FOUND"));
    categories.update(a.id(),new ShopCategoryModels.UpdateInput("Renamed A",10,0L),admin.id());
    mvc.perform(get("/api/v1/shop/products/"+visible.id())).andExpect(status().isOk()).andExpect(jsonPath("$.categoryName").value("Renamed A"));
    assertThat(categories.adminCategories().stream().filter(c->c.id().equals(a.id())).findFirst().orElseThrow().productCount()).isEqualTo(2);
    mvc.perform(get("/api/v1/home")).andExpect(status().isOk())
        .andExpect(jsonPath("$.equipment[0].priceCents").value(100)).andExpect(jsonPath("$.equipment[0].originalPriceCents").value(200))
        .andExpect(jsonPath("$.equipment[0].categoryName").value("Renamed A"));
  }

  @Test void legacyProductBodiesPreserveCategoryAndOriginalPriceWithoutManufacturingDiscounts() throws Exception {
    var p=create(100,null,null,"ON_SALE");assertThat(p.categoryId()).isEqualTo("uncategorized");assertThat(p.originalPriceCents()).isEqualTo(100);
    var c=category("Gear",1);
    edit(p,productBody(100,300,c.id(),p.version(),"ON_SALE")).andExpect(status().isOk());p=shop.product(p.id(),true);
    edit(p,productBody(150,null,null,p.version(),"ON_SALE")).andExpect(status().isOk())
        .andExpect(jsonPath("$.categoryId").value(c.id())).andExpect(jsonPath("$.originalPriceCents").value(300));p=shop.product(p.id(),true);
    edit(p,productBody(350,null,null,p.version(),"ON_SALE")).andExpect(status().isOk()).andExpect(jsonPath("$.originalPriceCents").value(350));
    categories.update("uncategorized",new ShopCategoryModels.UpdateInput("其他装备",99,0L),admin.id());
    var next=create(100,null,null,"ON_SALE");assertThat(next.categoryId()).isEqualTo("uncategorized");assertThat(next.categoryName()).isEqualTo("其他装备");
  }

  @Test void invalidCategoryAndOriginalPricesNeverModifyProductOrTruncateMoney() throws Exception {
    var p=create(100,200,null,"ON_SALE");
    edit(p,productBody(100,99,null,p.version(),"ON_SALE")).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("ORIGINAL_PRICE_BELOW_CURRENT"));
    edit(p,productBody(100,200,"missing",p.version(),"ON_SALE")).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("CATEGORY_NOT_FOUND"));
    for(var field:List.of("priceCents","originalPriceCents")) {
      var body=productBody(100,200,null,p.version(),"ON_SALE");body.put(field,100.5);
      edit(p,body).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("BAD_REQUEST"));
    }
    var body=productBody(100,100000001,null,p.version(),"ON_SALE");edit(p,body).andExpect(status().isBadRequest());
    var unchanged=shop.product(p.id(),true);assertThat(unchanged).isEqualTo(p);
  }

  @Test void orderPaymentAndRefundUseSalePriceSnapshotAfterProductPriceChanges() throws Exception {
    var p=create(100,500,null,"ON_SALE");
    var order=shop.createOrder(owner.id(),new ShopModels.OrderInput(List.of(new ShopModels.OrderItemInput(p.id(),2)),
        "QA buyer","13800000000","Synthetic street",1L,1L,"snapshot-request"));
    assertThat(order.totalCents()).isEqualTo(200);p=shop.product(p.id(),true);
    var body=productBody(300,500,null,p.version(),"ON_SALE");body.put("stock",8);edit(p,body).andExpect(status().isOk());
    mvc.perform(post("/api/v1/orders/"+order.id()+"/pay").header("Authorization",ownerToken)).andExpect(status().isOk());
    var sent=org.mockito.ArgumentCaptor.forClass(ShopModels.Order.class);verify(pay).prepay(sent.capture(),eq("category-fixture-owner"));
    assertThat(sent.getValue().totalCents()).isEqualTo(200);assertThat(sent.getValue().items().getFirst().priceCents()).isEqualTo(100);
    var transaction=new Transaction();transaction.setAppid("app");transaction.setMchid("merchant");transaction.setOutTradeNo(order.orderNo());
    transaction.setTransactionId("fixture-transaction");transaction.setTradeState(Transaction.TradeStateEnum.SUCCESS);transaction.setTradeType(Transaction.TradeTypeEnum.JSAPI);
    var amount=new TransactionAmount();amount.setTotal(200);amount.setCurrency("CNY");transaction.setAmount(amount);
    var payer=new TransactionPayer();payer.setOpenid("category-fixture-owner");transaction.setPayer(payer);
    when(pay.queryOrder(order.orderNo())).thenReturn(transaction);
    mvc.perform(post("/api/v1/orders/"+order.id()+"/verify").header("Authorization",ownerToken))
        .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("PAID")).andExpect(jsonPath("$.totalCents").value(200));
    var r=refunds.request(order.id(),owner.id(),"Synthetic local refund");
    when(pay.createRefund(any(),any())).thenReturn(new RefundModels.GatewayResult(r.outRefundNo(),order.orderNo(),"fixture-transaction","fixture-refund",200,200,"CNY","PROCESSING"));
    mvc.perform(post("/api/v1/admin/refunds/"+r.id()+"/approve").header("Authorization",adminToken)
        .contentType("application/json").content("{\"version\":0}"))
        .andExpect(status().isOk()).andExpect(jsonPath("$.amountCents").value(200));
    verify(pay).createRefund(argThat(o->o.totalCents()==200),argThat(value->value.amountCents()==200));
    assertThat(shop.order(order.id(),owner.id(),false).items().getFirst().priceCents()).isEqualTo(100);
    assertThat(shop.product(p.id(),true).stock()).isEqualTo(8);
  }

  @Test void categoryAuditFailureRollsBackNameVersionAndVisibleProductLabel() throws Exception {
    var c=category("Gear",1);var p=create(100,100,c.id(),"ON_SALE");
    db.execute("CREATE FUNCTION fail_category_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='PRODUCT_CATEGORY_EDIT' THEN RAISE EXCEPTION 'synthetic rollback'; END IF; RETURN NEW; END $$");
    db.execute("CREATE TRIGGER category_audit_failure BEFORE INSERT ON audit_event FOR EACH ROW EXECUTE FUNCTION fail_category_audit()");
    try {assertThatThrownBy(()->categories.update(c.id(),new ShopCategoryModels.UpdateInput("Changed",2,0L),admin.id())).isInstanceOf(RuntimeException.class);}
    finally {db.execute("DROP TRIGGER category_audit_failure ON audit_event");db.execute("DROP FUNCTION fail_category_audit()");}
    assertThat(shop.product(p.id(),true).categoryName()).isEqualTo("Gear");
    assertThat(categories.categories().stream().filter(v->v.id().equals(c.id())).findFirst().orElseThrow().version()).isZero();
  }
}
