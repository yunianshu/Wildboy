package com.wildboy;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import java.util.*;
import java.nio.file.*;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
@SpringBootTest @AutoConfigureMockMvc
class ContentMediaIntegrationTest {
 static final EmbeddedPostgres pg; static final Path media;
 static {try{pg=EmbeddedPostgres.builder().setServerConfig("unix_socket_directories","").start();media=Files.createTempDirectory("wildboy-media-qa");}catch(Exception e){throw new ExceptionInInitializerError(e);}}
 @DynamicPropertySource static void properties(DynamicPropertyRegistry r){r.add("spring.datasource.url",()->pg.getJdbcUrl("postgres","postgres"));r.add("spring.datasource.username",()->"postgres");r.add("spring.datasource.password",()->"");r.add("wildboy.media-dir",()->media.toString());}
 @Autowired AuthService auth; @Autowired JdbcTemplate db; @Autowired MockMvc mvc; @Autowired ObjectMapper json; @Autowired ContentService content;
 String admin,user,id;
 @BeforeEach void setup(){admin="Bearer "+auth.login(auth.user("content-admin:"+UUID.randomUUID(),"QA","ADMIN")).token();user="Bearer "+auth.login(auth.user("content-user:"+UUID.randomUUID(),"QA","USER")).token();id=UUID.randomUUID().toString();db.update("INSERT INTO product(id,name,description,image_url,price_cents,stock,status) VALUES(?,?,?,?,?,?,?)",id,"测试装备","说明","/assets/equipment.jpg",100,3,"ON_SALE");}
 @AfterAll static void cleanup()throws Exception{pg.close();try(var files=Files.list(media)){for(var p:files.toList())Files.deleteIfExists(p);}Files.deleteIfExists(media);}
 String path(){return "/api/v1/admin/shop/products/"+id+"/content";}
 @Test void publicReadRequiresPublicEntityAndWriteIsAdminOnly()throws Exception{
  mvc.perform(get("/api/v1/shop/products/"+id+"/content")).andExpect(status().isOk()).andExpect(jsonPath("$.version").value(0));
  String input="{\"version\":0,\"blocks\":[{\"type\":\"text\",\"text\":\"<script>alert(1)</script>\"}]}";
  mvc.perform(put(path()).contentType("application/json").content(input)).andExpect(status().isUnauthorized());
  mvc.perform(put(path()).header("Authorization",user).contentType("application/json").content(input)).andExpect(status().isForbidden());
  mvc.perform(put(path()).header("Authorization",admin).contentType("application/json").content(input)).andExpect(status().isOk()).andExpect(jsonPath("$.version").value(1));
  mvc.perform(put(path()).header("Authorization",admin).contentType("application/json").content(input)).andExpect(status().isConflict());
  mvc.perform(get("/api/v1/shop/products/"+id+"/content")).andExpect(jsonPath("$.blocks[0].text").value("<script>alert(1)</script>"));
  db.update("UPDATE product SET status='OFF_SHELF' WHERE id=?",id);
  mvc.perform(get("/api/v1/shop/products/"+id+"/content")).andExpect(status().isNotFound());
 }
 @Test void validatesBlocksAndKeepsOldDataOnFailure()throws Exception{
  var cases=List.of("{\"type\":\"html\",\"text\":\"bad\"}","{\"type\":\"image\",\"url\":\"javascript:alert(1)\"}","{\"type\":\"image\",\"url\":\"/assets/../private.png\"}","{\"type\":\"table\",\"rows\":[[\"a\",\"b\"],[\"c\"]]}","{\"type\":\"text\",\"text\":\" \"}");
  for(String b:cases)mvc.perform(put(path()).header("Authorization",admin).contentType("application/json").content("{\"version\":0,\"blocks\":["+b+"]}")).andExpect(status().isBadRequest());
  assertThat(content.get("product",id,true).version()).isZero();
  var blocks=List.of(new ContentModels.Block("table",null,null,null,List.of(List.of("行程","时间"),List.of("集合","08:00"))),new ContentModels.Block("image",null,"/assets/equipment.jpg","装备",null));
  mvc.perform(put(path()).header("Authorization",admin).contentType("application/json").content(json.writeValueAsString(new ContentModels.Input(blocks,0L)))).andExpect(status().isOk());
 }
 @Test void uploadAuthenticatesValidatesReencodesAndServes()throws Exception{
  var out=new ByteArrayOutputStream();ImageIO.write(new BufferedImage(3,2,BufferedImage.TYPE_INT_RGB),"png",out);
  String input=json.writeValueAsString(Map.of("dataBase64",Base64.getEncoder().encodeToString(out.toByteArray())));
  mvc.perform(post("/api/v1/admin/media").contentType("application/json").content(input)).andExpect(status().isUnauthorized());
  mvc.perform(post("/api/v1/admin/media").header("Authorization",user).contentType("application/json").content(input)).andExpect(status().isForbidden());
  var response=mvc.perform(post("/api/v1/admin/media").header("Authorization",admin).contentType("application/json").content(input)).andExpect(status().isCreated()).andReturn();
  String url=json.readTree(response.getResponse().getContentAsString()).get("url").asText();
  assertThat(url).matches("/assets/uploads/[0-9a-f-]{36}\\.png");
  mvc.perform(get(url)).andExpect(status().isOk()).andExpect(content().contentType("image/png"));
  mvc.perform(get("/api/v1/media/"+url.substring(url.lastIndexOf('/')+1))).andExpect(status().isOk()).andExpect(jsonPath("$.dataBase64").isString());
  mvc.perform(get("/api/v1/media/not-an-image.txt")).andExpect(status().isNotFound());
  for(String invalid:List.of("invalid###",Base64.getEncoder().encodeToString("<svg onload='bad'/>".getBytes()),""))mvc.perform(post("/api/v1/admin/media").header("Authorization",admin).contentType("application/json").content(json.writeValueAsString(Map.of("dataBase64",invalid)))).andExpect(status().isBadRequest());
 }
 @Test void rejectsOversizedDataAndDimensions()throws Exception{
  mvc.perform(post("/api/v1/admin/media").header("Authorization",admin).contentType("application/json").content(json.writeValueAsString(Map.of("dataBase64","A".repeat(5592409))))).andExpect(status().isBadRequest());
  var out=new ByteArrayOutputStream();ImageIO.write(new BufferedImage(6001,1,BufferedImage.TYPE_INT_RGB),"png",out);
  mvc.perform(post("/api/v1/admin/media").header("Authorization",admin).contentType("application/json").content(json.writeValueAsString(Map.of("dataBase64",Base64.getEncoder().encodeToString(out.toByteArray()))))).andExpect(status().isBadRequest());
 }
}
