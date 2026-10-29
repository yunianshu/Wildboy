package com.wildboy;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
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

@SpringBootTest @AutoConfigureMockMvc
class RefundIntegrationTest {
 static final EmbeddedPostgres pg;
 static {try{pg=EmbeddedPostgres.builder().setServerConfig("unix_socket_directories", "").start();}catch(Exception e){throw new ExceptionInInitializerError(e);}}
 @DynamicPropertySource static void properties(DynamicPropertyRegistry r){r.add("spring.datasource.url",()->pg.getJdbcUrl("postgres","postgres"));r.add("spring.datasource.username",()->"postgres");r.add("spring.datasource.password",()->"");}
 @Autowired RefundService refunds;@Autowired ShopService shop;@Autowired AuthService auth;@Autowired JdbcTemplate db;@Autowired MockMvc mvc;
 @MockitoBean WechatPayService pay;
 String user,order,product,orderNo,transaction,token;
 @BeforeEach void setup(){reset(pay);var owner=auth.user("refund-test:"+UUID.randomUUID(),"Refund QA","USER");user=owner.id();token="Bearer "+auth.login(owner).token();order=UUID.randomUUID().toString();product=UUID.randomUUID().toString();orderNo=UUID.randomUUID().toString().replace("-","");transaction="tx-"+UUID.randomUUID();
  db.update("INSERT INTO product(id,name,description,image_url,price_cents,stock,status) VALUES(?,'测试商品','描述','/assets/a.jpg',100,2,'ON_SALE')",product);
  db.update("INSERT INTO shop_order(id,order_no,user_id,total_cents,status,recipient_name,phone,address,payment_transaction_id,paid_at) VALUES(?,?,?,100,'PAID','测试收件人','13800000000','测试完整地址',?,CURRENT_TIMESTAMP)",order,orderNo,user,transaction);
  db.update("INSERT INTO shop_order_item(id,order_id,product_id,product_name,image_url,price_cents,quantity) VALUES(?,?,?,'测试商品','/assets/a.jpg',100,1)",UUID.randomUUID().toString(),order,product);
 }
 RefundModels.GatewayResult result(RefundModels.Refund r,String status){return new RefundModels.GatewayResult(r.outRefundNo(),orderNo,transaction,"wx-refund-test",100,100,"CNY",status);}
 RefundModels.Refund requested(){return refunds.request(order,user,"不再需要");}
 @Test void ownHttpRequestIsIdempotentAndRoleProtected() throws Exception {
  mvc.perform(post("/api/v1/orders/"+order+"/refund").contentType("application/json").content("{\"reason\":\"不再需要\"}")).andExpect(status().isUnauthorized());
  mvc.perform(post("/api/v1/orders/"+order+"/refund").header("Authorization",token).contentType("application/json").content("{\"reason\":\"不再需要\"}")).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("REQUESTED"));
  var a=requested();assertThat(requested().id()).isEqualTo(a.id());
  mvc.perform(get("/api/v1/orders/"+order+"/refund").header("Authorization",token)).andExpect(jsonPath("$.id").value(a.id()));
  String other="Bearer "+auth.login(auth.user("refund-other:"+UUID.randomUUID(),"Other","USER")).token();
  mvc.perform(get("/api/v1/orders/"+order+"/refund").header("Authorization",other)).andExpect(status().isNotFound());
  mvc.perform(post("/api/v1/admin/refunds/"+a.id()+"/approve").header("Authorization",token).contentType("application/json").content("{\"version\":0}")).andExpect(status().isForbidden());
 }
 @Test void requestedBlocksShippingAndRejectedDoesNot(){var r=requested();var o=shop.order(order,user,false);
  assertThatThrownBy(()->shop.ship(order,o.version(),"admin")).hasMessageContaining("退款");
  refunds.reject(r.id(),r.version(),"已沟通保留商品","admin");
  assertThat(shop.ship(order,o.version(),"admin").status()).isEqualTo("SHIPPED");
 }
 @Test void onlyPaidUnshippedEligibleAndReasonRequired(){
  assertThatThrownBy(()->refunds.request(order,user," ")).isInstanceOf(ApiException.class);
  db.update("UPDATE shop_order SET status='SHIPPED' WHERE id=?",order);
  assertThatThrownBy(this::requested).hasMessageContaining("已发货");
 }
 @Test void missingConfigurationLeavesRequestActionable(){var r=requested();doThrow(new ApiException(503,"PAYMENT_NOT_CONFIGURED","未配置")).when(pay).requireConfigured();
  assertThatThrownBy(()->refunds.approve(r.id(),r.version(),"admin",false)).isInstanceOf(ApiException.class);
  assertThat(refunds.get(r.id()).status()).isEqualTo("REQUESTED");
 }
 @Test void processingIsNotSuccessAndConfirmationRestocksExactlyOnce() throws Exception {
  var r=requested();when(pay.createRefund(any(),any())).thenReturn(result(r,"PROCESSING"));
  var processing=refunds.approve(r.id(),r.version(),"admin",false);
  assertThat(processing.status()).isEqualTo("PROCESSING");assertThat(shop.order(order,user,false).status()).isEqualTo("PAID");
  try(var pool=Executors.newFixedThreadPool(3)){var jobs=new ArrayList<Callable<Void>>();for(int i=0;i<3;i++)jobs.add(()->{refunds.apply(result(r,"SUCCESS"),null);return null;});for(var f:pool.invokeAll(jobs))f.get();}
  assertThat(shop.order(order,user,false).status()).isEqualTo("REFUNDED");
  assertThat(db.queryForObject("SELECT stock FROM product WHERE id=?",Integer.class,product)).isEqualTo(3);
  assertThat(refunds.get(r.id()).status()).isEqualTo("SUCCESS");
 }
 @Test void unknownGatewayDoesNotFreeStockAndRetryReusesIdentifier(){var r=requested();when(pay.createRefund(any(),any())).thenThrow(new ApiException(502,"REFUND_UNCERTAIN","未知"));
  var unknown=refunds.approve(r.id(),r.version(),"admin",false);assertThat(unknown.status()).isEqualTo("UNKNOWN");
  assertThat(db.queryForObject("SELECT stock FROM product WHERE id=?",Integer.class,product)).isEqualTo(2);
  doReturn(result(r,"PROCESSING")).when(pay).createRefund(any(),any());
  var retry=refunds.approve(r.id(),unknown.version(),"admin",true);assertThat(retry.outRefundNo()).isEqualTo(r.outRefundNo());
  when(pay.queryRefund(r.outRefundNo())).thenReturn(result(r,"SUCCESS"));
  assertThat(refunds.verify(r.id(),retry.version(),"admin").status()).isEqualTo("SUCCESS");
 }
 @Test void wrongAmountOrUnapprovedCallbackRollsBack(){var r=requested();assertThatThrownBy(()->refunds.apply(result(r,"SUCCESS"),null)).hasMessageContaining("状态");
  when(pay.createRefund(any(),any())).thenReturn(result(r,"PROCESSING"));refunds.approve(r.id(),r.version(),"admin",false);
  var wrong=new RefundModels.GatewayResult(r.outRefundNo(),orderNo,transaction,"wx-refund-test",100,99,"CNY","SUCCESS");
  assertThatThrownBy(()->refunds.apply(wrong,null)).hasMessageContaining("金额");assertThat(refunds.get(r.id()).status()).isEqualTo("PROCESSING");
  assertThat(db.queryForObject("SELECT stock FROM product WHERE id=?",Integer.class,product)).isEqualTo(2);
 }
}
