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

@SpringBootTest @AutoConfigureMockMvc
class ArticleIntegrationTest {
 static final EmbeddedPostgres pg;
 static {try{pg=EmbeddedPostgres.builder().setServerConfig("unix_socket_directories","").start();}catch(Exception e){throw new ExceptionInInitializerError(e);}}
 @DynamicPropertySource static void properties(DynamicPropertyRegistry r){r.add("spring.datasource.url",()->pg.getJdbcUrl("postgres","postgres"));r.add("spring.datasource.username",()->"postgres");r.add("spring.datasource.password",()->"");}
 @Autowired AuthService auth; @Autowired JdbcTemplate db; @Autowired MockMvc mvc; @Autowired ObjectMapper json; @Autowired ArticleService articles;
 String admin,user,actor;
 @BeforeEach void setup(){var a=auth.user("article-admin:"+UUID.randomUUID(),"QA","ADMIN");actor=a.id();admin="Bearer "+auth.login(a).token();user="Bearer "+auth.login(auth.user("article-user:"+UUID.randomUUID(),"QA","USER")).token();db.update("UPDATE article_settings SET official_article_id=NULL");db.update("DELETE FROM article");}
 @AfterAll static void cleanup()throws Exception{pg.close();}
 ArticleModels.Article create(){return articles.create(new ArticleModels.Input("野小子文章","活动故事","/assets/equipment.jpg",null,null),actor);}
 ArticleModels.Article ready(){var a=create();articles.saveContent(a.id(),new ContentModels.Input(List.of(new ContentModels.Block("text","文章正文",null,null,null)),0L),actor);return articles.get(a.id(),true);}
 ArticleModels.Article published(){var a=ready();return articles.action(a.id(),a.version(),"publish",actor);}
 @Test void draftPrivateAndAdminRoleRequired()throws Exception{
  var a=create();
  mvc.perform(get("/api/v1/articles/"+a.id())).andExpect(status().isNotFound());
  mvc.perform(get("/api/v1/articles/official")).andExpect(status().isNotFound());
  mvc.perform(get("/api/v1/articles")).andExpect(status().isOk()).andExpect(jsonPath("$.total").value(0));
  mvc.perform(get("/api/v1/admin/articles")).andExpect(status().isUnauthorized());
  mvc.perform(get("/api/v1/admin/articles").header("Authorization",user)).andExpect(status().isForbidden());
  mvc.perform(post("/api/v1/admin/articles/"+a.id()+"/publish").header("Authorization",user).contentType("application/json").content("{\"version\":0}")).andExpect(status().isForbidden());
  mvc.perform(get("/api/v1/admin/articles/"+a.id()).header("Authorization",admin)).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("DRAFT"));
 }
 @Test void fullHttpPublicationAndOfficialReplacement()throws Exception{
  var a=ready();
  mvc.perform(post("/api/v1/admin/articles/"+a.id()+"/publish").header("Authorization",admin).contentType("application/json").content("{\"version\":1}")).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("PUBLISHED")).andExpect(jsonPath("$.version").value(2));
  mvc.perform(get("/api/v1/articles/"+a.id())).andExpect(status().isOk()).andExpect(jsonPath("$.blocks[0].text").value("文章正文"));
  mvc.perform(post("/api/v1/admin/articles/"+a.id()+"/official").header("Authorization",admin).contentType("application/json").content("{\"version\":2}")).andExpect(status().isOk()).andExpect(jsonPath("$.isOfficial").value(true));
  mvc.perform(get("/api/v1/articles/official")).andExpect(status().isOk()).andExpect(jsonPath("$.id").value(a.id()));
  mvc.perform(get("/api/v1/articles")).andExpect(status().isOk()).andExpect(jsonPath("$.total").value(0));
  var b=published();b=articles.action(b.id(),b.version(),"official",actor);
  assertThat(articles.official().id()).isEqualTo(b.id());assertThat(articles.get(a.id(),true).isOfficial()).isFalse();
  mvc.perform(get("/api/v1/articles")).andExpect(status().isOk()).andExpect(jsonPath("$.items[0].id").value(a.id()));
  articles.action(b.id(),b.version(),"unpublish",actor);
  mvc.perform(get("/api/v1/articles/official")).andExpect(status().isNotFound());
  mvc.perform(get("/api/v1/articles/"+b.id())).andExpect(status().isNotFound());
 }
 @Test void invalidUnsafeAndStaleWritesRejected()throws Exception{
  var a=create();String path="/api/v1/admin/articles/"+a.id();
  mvc.perform(post(path+"/publish").header("Authorization",admin).contentType("application/json").content("{\"version\":0}")).andExpect(status().isBadRequest());
  mvc.perform(post(path+"/official").header("Authorization",admin).contentType("application/json").content("{\"version\":0}")).andExpect(status().isConflict());
  mvc.perform(put(path+"/content").header("Authorization",admin).contentType("application/json").content("{\"version\":0,\"blocks\":[{\"type\":\"image\",\"url\":\"javascript:alert(1)\"}]}")).andExpect(status().isBadRequest());
  mvc.perform(put(path).header("Authorization",admin).contentType("application/json").content("{\"title\":\"更新\",\"coverUrl\":\"/assets/equipment.jpg\",\"version\":0}")).andExpect(status().isOk()).andExpect(jsonPath("$.version").value(1));
  mvc.perform(put(path+"/content").header("Authorization",admin).contentType("application/json").content("{\"version\":0,\"blocks\":[{\"type\":\"text\",\"text\":\"正文\"}]}")).andExpect(status().isConflict());
  mvc.perform(put(path+"/content").header("Authorization",admin).contentType("application/json").content("{\"version\":1,\"blocks\":[{\"type\":\"text\",\"text\":\"正文\"}]}")).andExpect(status().isOk()).andExpect(jsonPath("$.version").value(2));
  articles.action(a.id(),2L,"publish",actor);
  mvc.perform(put(path).header("Authorization",admin).contentType("application/json").content("{\"title\":\"非法改公开\",\"version\":3}")).andExpect(status().isConflict());
  mvc.perform(put(path+"/content").header("Authorization",admin).contentType("application/json").content("{\"version\":3,\"blocks\":[]}")).andExpect(status().isConflict());
 }
 @Test void competingOfficialSelectionsLeaveOneCanonicalPointer()throws Exception{
  var a=published();var b=published();
  try(var pool=Executors.newFixedThreadPool(2)){
   var start=new CountDownLatch(1);
   var x=pool.submit(()->{start.await();return articles.action(a.id(),a.version(),"official",actor);});
   var y=pool.submit(()->{start.await();try{return articles.action(b.id(),b.version(),"official",actor);}catch(ApiException e){return null;}});
   start.countDown();x.get(10,TimeUnit.SECONDS);y.get(10,TimeUnit.SECONDS);
  }
  assertThat(articles.list(0,20,true).items().stream().filter(ArticleModels.Article::isOfficial).count()).isEqualTo(1);
  assertThat(articles.official().id()).isIn(a.id(),b.id());
  assertThat(articles.list(0,20,false).total()).isEqualTo(1);
 }
}
