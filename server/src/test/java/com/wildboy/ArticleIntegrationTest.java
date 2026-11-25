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
 ArticleModels.Article ready(){var a=create();articles.saveContent(a.id(),new ArticleModels.ArticleContentInput("文章正文",0L),actor);return articles.get(a.id(),true);}
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
  mvc.perform(get("/api/v1/articles/"+a.id())).andExpect(status().isOk()).andExpect(jsonPath("$.contentNodes[0].type").value("paragraph")).andExpect(jsonPath("$.contentNodes[0].spans[0].s").value("文章正文"));
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
  mvc.perform(put(path).header("Authorization",admin).contentType("application/json").content("{\"title\":\"更新\",\"coverUrl\":\"/assets/equipment.jpg\",\"version\":0}")).andExpect(status().isOk()).andExpect(jsonPath("$.version").value(1));
  mvc.perform(put(path+"/content").header("Authorization",admin).contentType("application/json").content("{\"version\":0,\"markdown\":\"正文\"}")).andExpect(status().isConflict());
  mvc.perform(put(path+"/content").header("Authorization",admin).contentType("application/json").content("{\"version\":1,\"markdown\":\"正文\"}")).andExpect(status().isOk()).andExpect(jsonPath("$.version").value(2));
  articles.action(a.id(),2L,"publish",actor);
  mvc.perform(put(path).header("Authorization",admin).contentType("application/json").content("{\"title\":\"非法改公开\",\"version\":3}")).andExpect(status().isConflict());
  mvc.perform(put(path+"/content").header("Authorization",admin).contentType("application/json").content("{\"version\":3,\"markdown\":\"\"}")).andExpect(status().isConflict());
 }
 @Test void publishedArticleUpdatesAtomicallyAndKeepsItsOfficialEntry() throws Exception {
  var published = published();
  var official = articles.action(published.id(), published.version(), "official", actor);
  String adminPath = "/api/v1/admin/articles/" + official.id();
  String publicPath = "/api/v1/articles/" + official.id();
  var update = new ArticleModels.Input(
      "更新标题", "新版摘要", "/assets/updated.jpg", null, official.version(), "新版正文");
  String payload = json.writeValueAsString(update);

  mvc.perform(put(adminPath).header("Authorization", user).contentType("application/json").content(payload))
      .andExpect(status().isForbidden());
  mvc.perform(put(adminPath).header("Authorization", admin).contentType("application/json")
      .content(json.writeValueAsString(new ArticleModels.Input(
          "未保存的标题", "未保存的摘要", "/assets/updated.jpg", null, official.version(), " "))))
      .andExpect(status().isBadRequest());
  mvc.perform(get(publicPath))
      .andExpect(status().isOk()).andExpect(jsonPath("$.title").value(official.title()))
      .andExpect(jsonPath("$.version").value(official.version()))
      .andExpect(jsonPath("$.contentNodes[0].spans[0].s").value("文章正文"));

  mvc.perform(put(adminPath).header("Authorization", admin).contentType("application/json").content(payload))
      .andExpect(status().isOk())
      .andExpect(jsonPath("$.status").value("PUBLISHED"))
      .andExpect(jsonPath("$.isOfficial").value(true))
      .andExpect(jsonPath("$.version").value(official.version() + 1));
  mvc.perform(get("/api/v1/articles/official"))
      .andExpect(status().isOk())
      .andExpect(jsonPath("$.id").value(official.id()))
      .andExpect(jsonPath("$.title").value("更新标题"))
      .andExpect(jsonPath("$.summary").value("新版摘要"))
      .andExpect(jsonPath("$.coverUrl").value("/assets/updated.jpg"))
      .andExpect(jsonPath("$.contentNodes[0].spans[0].s").value("新版正文"));
  assertThat(articles.get(official.id(), false).publishedAt()).isEqualTo(official.publishedAt());
  mvc.perform(put(adminPath).header("Authorization", admin).contentType("application/json").content(payload))
      .andExpect(status().isConflict());
  mvc.perform(get(publicPath)).andExpect(status().isOk())
      .andExpect(jsonPath("$.version").value(official.version() + 1))
      .andExpect(jsonPath("$.contentNodes[0].spans[0].s").value("新版正文"));
 }
 @Test void markdownRendersSafeNodesOnly()throws Exception{
  var a=create();
  String md="# 标题\n\n**加粗** 与 [外链](https://example.com)\n\n<script>alert(1)</script>\n\n![坏图](javascript:alert(1))\n";
  articles.saveContent(a.id(),new ArticleModels.ArticleContentInput(md,0L),actor);
  var nodes=articles.get(a.id(),true).contentNodes();
  String rendered=json.writeValueAsString(nodes);
  assertThat(rendered).contains("\"type\":\"heading\"").contains("\"t\":\"bold\"").contains("https://example.com");
  assertThat(rendered).doesNotContain("alert(1)").contains("图片已移除");
  assertThat(nodes.stream().map(n->((java.util.Map<?,?>)n).get("type")).noneMatch("html"::equals)).isTrue();
 }
 @Test void createsDraftWithItsFirstMarkdownBodyInOneRequest() throws Exception {
  for (String markdown : List.of("", "# 出发前\n\n携带饮水")) {
   var payload = new ArticleModels.Input("出发指南", "", "", null, null, markdown);
   var response = mvc.perform(post("/api/v1/admin/articles").header("Authorization", admin)
       .contentType("application/json").content(json.writeValueAsString(payload)))
       .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("DRAFT"))
       .andExpect(jsonPath("$.version").value(0)).andReturn().getResponse();
   String id = json.readTree(response.getContentAsByteArray()).get("id").asText();
   assertThat(db.queryForObject("SELECT markdown FROM article WHERE id=?", String.class, id))
       .isEqualTo(markdown);
  }
 }
 @Test void copiesOfficialArticleIntoIndependentDraftAndRetriesSafely() throws Exception {
  var source = published();
  var official = articles.action(source.id(), source.version(), "official", actor);
  String path = "/api/v1/admin/articles/" + official.id() + "/copy";
  var input = new ArticleModels.CopyInput("下期活动回顾", official.version(), UUID.randomUUID().toString());
  String body = json.writeValueAsString(input);
  mvc.perform(post(path).header("Authorization", user).contentType("application/json").content(body))
      .andExpect(status().isForbidden());
  var response = mvc.perform(post(path).header("Authorization", admin).contentType("application/json").content(body))
      .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("DRAFT"))
      .andExpect(jsonPath("$.isOfficial").value(false)).andExpect(jsonPath("$.version").value(0))
      .andExpect(jsonPath("$.title").value(input.title())).andExpect(jsonPath("$.coverUrl").value(source.coverUrl()))
      .andExpect(jsonPath("$.summary").value(source.summary())).andExpect(jsonPath("$.contentNodes[0].spans[0].s").value("文章正文"))
      .andReturn().getResponse();
  String id = json.readTree(response.getContentAsByteArray()).get("id").asText();
  assertThat(id).isNotEqualTo(source.id());
  mvc.perform(post(path).header("Authorization", admin).contentType("application/json").content(body))
      .andExpect(status().isOk()).andExpect(jsonPath("$.id").value(id));
  assertThat(articles.list(0,20,true).total()).isEqualTo(2);
  articles.saveContent(id, new ArticleModels.ArticleContentInput("只编辑副本", 0L), actor);
  assertThat(articles.content(source.id()).markdown()).isEqualTo("文章正文");
  assertThat(articles.official().id()).isEqualTo(source.id());
  mvc.perform(get("/api/v1/articles/" + id)).andExpect(status().isNotFound());
  mvc.perform(post(path).header("Authorization", admin).contentType("application/json")
      .content(json.writeValueAsString(new ArticleModels.CopyInput("过时副本", 0L, "stale"))))
      .andExpect(status().isConflict());
 }
 @Test void legacyBlocksLazilyConvertToMarkdown()throws Exception{
  var a=create();
  String blocks=json.writeValueAsString(List.of(
    java.util.Map.of("type","text","text","旧正文段落"),
    java.util.Map.of("type","image","url","/assets/equipment.jpg","caption","装备图"),
    java.util.Map.of("type","table","rows",List.of(List.of("日期","集合"),List.of("11/21","东直门")))));
  db.update("UPDATE article SET blocks=? WHERE id=?",blocks,a.id());
  var content=articles.content(a.id());
  var copied=articles.copy(a.id(), new ArticleModels.CopyInput("旧文副本", a.version(), "legacy"), actor);
  assertThat(articles.content(copied.id()).markdown()).isEqualTo(content.markdown());
  assertThat(content.markdown()).contains("旧正文段落").contains("![装备图](/assets/equipment.jpg)").contains("*装备图*").contains("| 日期 | 集合 |");
  // 旧正文可直接发布（effectiveMarkdown 懒转换），公开页拿到结构化节点
  articles.action(a.id(),content.version(),"publish",actor);
  var nodes=articles.get(a.id(),true).contentNodes();
  String rendered=json.writeValueAsString(nodes);
  assertThat(rendered).contains("旧正文段落").contains("/assets/equipment.jpg").contains("装备图").contains("\"type\":\"table\"").contains("东直门");
  // 编辑中的草稿保存 markdown 后固化，blocks 不再参与
  var b=create();
  db.update("UPDATE article SET blocks=? WHERE id=?",blocks,b.id());
  var bc=articles.content(b.id());
  articles.saveContent(b.id(),new ArticleModels.ArticleContentInput("新正文",bc.version()),actor);
  assertThat(articles.content(b.id()).markdown()).isEqualTo("新正文");
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
