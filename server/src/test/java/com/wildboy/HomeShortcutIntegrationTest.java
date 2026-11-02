package com.wildboy;

import static com.wildboy.HomeShortcutModels.*;
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
class HomeShortcutIntegrationTest {
  static final EmbeddedPostgres pg;
  static {try {pg=EmbeddedPostgres.builder().setServerConfig("unix_socket_directories","").start();} catch(Exception e){throw new ExceptionInInitializerError(e);}}
  @DynamicPropertySource static void properties(DynamicPropertyRegistry r){r.add("spring.datasource.url",()->pg.getJdbcUrl("postgres","postgres"));r.add("spring.datasource.username",()->"postgres");r.add("spring.datasource.password",()->"");}
  @Autowired AuthService auth; @Autowired JdbcTemplate db; @Autowired MockMvc mvc;
  @Autowired ObjectMapper json; @Autowired HomeShortcutService shortcuts; @Autowired ArticleService articles;
  String admin,user,actor;
  @BeforeEach void setup() throws Exception {
    var a=auth.user("shortcut-admin:"+UUID.randomUUID(),"QA","ADMIN");actor=a.id();admin="Bearer "+auth.login(a).token();
    user="Bearer "+auth.login(auth.user("shortcut-user:"+UUID.randomUUID(),"QA","USER")).token();
    db.update("UPDATE home_shortcut_settings SET version=0,items=? WHERE id=1",json.writeValueAsString(List.of(
      new Item(1,"本周活动","WEEKLY","PAGE","WEEKLY","","","",""),
      new Item(2,"国内游行","DOMESTIC","PAGE","DOMESTIC","","","",""),
      new Item(3,"二维码","QRCODE","POPUP","","","二维码","",""),
      new Item(4,"野小子","INTRO","ARTICLE","","OFFICIAL","","",""))));
  }
  @AfterAll static void cleanup()throws Exception{pg.close();}
  Configuration replace(int slot, Item item) {
    var old=shortcuts.get(true);var list=new ArrayList<>(old.items());list.set(slot-1,item);return new Configuration(old.version(),list);
  }
  Item popup(String image){return new Item(3,"二维码","QRCODE","POPUP","/evil","private-id","二维码","请扫码",image);}
  void reject(Configuration config)throws Exception {
    mvc.perform(put("/api/v1/admin/home/shortcuts").header("Authorization",admin).contentType("application/json").content(json.writeValueAsString(config))).andExpect(status().isBadRequest());
  }
  @Test void publicDefaultsAndAuthorization()throws Exception {
    mvc.perform(get("/api/v1/home/shortcuts")).andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(4)).andExpect(jsonPath("$.items[2].name").value("二维码")).andExpect(jsonPath("$.items[2].popupImageUrl").value("")).andExpect(jsonPath("$.items[3].articleId").value("OFFICIAL"));
    mvc.perform(get("/api/v1/admin/home/shortcuts")).andExpect(status().isUnauthorized());
    mvc.perform(get("/api/v1/admin/home/shortcuts").header("Authorization",user)).andExpect(status().isForbidden());
    var body=json.writeValueAsString(shortcuts.get(true));
    mvc.perform(put("/api/v1/admin/home/shortcuts").contentType("application/json").content(body)).andExpect(status().isUnauthorized());
    mvc.perform(put("/api/v1/admin/home/shortcuts").header("Authorization",user).contentType("application/json").content(body)).andExpect(status().isForbidden());
  }
  @Test void savesPopupAndClearsInactiveFieldsWithConflictAndAudit()throws Exception {
    var input=replace(3,popup("/assets/equipment.jpg"));
    mvc.perform(put("/api/v1/admin/home/shortcuts").header("Authorization",admin).contentType("application/json").content(json.writeValueAsString(input)))
      .andExpect(status().isOk()).andExpect(jsonPath("$.version").value(input.version()+1)).andExpect(jsonPath("$.items[2].popupImageUrl").value("/assets/equipment.jpg"))
      .andExpect(jsonPath("$.items[2].page").value("")).andExpect(jsonPath("$.items[2].articleId").value(""));
    mvc.perform(put("/api/v1/admin/home/shortcuts").header("Authorization",admin).contentType("application/json").content(json.writeValueAsString(input))).andExpect(status().isConflict());
    assertThat(db.queryForObject("SELECT count(*) FROM audit_event WHERE actor_id=? AND action='HOME_SHORTCUTS_UPDATE'",Long.class,actor)).isEqualTo(1);
    assertThat(shortcuts.get(false).items().get(2).popupImageUrl()).isEqualTo("/assets/equipment.jpg");
  }
  @Test void rejectsInvalidSlotsRoutesTypesImagesAndLengths()throws Exception {
    var old=shortcuts.get(true);
    reject(new Configuration(old.version(),old.items().subList(0,3)));
    var duplicate=new ArrayList<>(old.items());duplicate.set(3,duplicate.getFirst());reject(new Configuration(old.version(),duplicate));
    reject(new Configuration(null,old.items()));
    reject(replace(3,new Item(3,"入口","INTRO","PAGE","/pages/admin/index","","","","")));
    reject(replace(3,new Item(3,"入口","UNKNOWN","PAGE","SHOP","","","","")));
    reject(replace(3,new Item(3,"入口","INTRO","SCRIPT","","","","","")));
    reject(replace(3,new Item(3,"一".repeat(13),"INTRO","PAGE","SHOP","","","","")));
    reject(replace(3,new Item(3,"入口","INTRO","POPUP","","","","一".repeat(2001),"")));
    for(String image:List.of("javascript:alert(1)","http://example.com/a.png","/assets/../secret.png","https://user@host/x.png","data:image/png;base64,abcd")) reject(replace(3,popup(image)));
  }
  @Test void acceptsAllAllowlistedPagesAndEmptyPopup() {
    for(String page:List.of("WEEKLY","DOMESTIC","ACTIVITIES","SHOP","PROFILE")) {
      var result=shortcuts.save(replace(1,new Item(1,"入口","WEEKLY","PAGE",page,"OFFICIAL","discard","discard","javascript:discard")),actor);
      assertThat(result.items().getFirst().page()).isEqualTo(page);
      assertThat(result.items().getFirst().popupText()).isEmpty();
    }
    assertThat(shortcuts.save(replace(3,popup("")),actor).items().get(2).popupImageUrl()).isEmpty();
  }
  @Test void onlyPublishedArticlesCanBeSelectedAndUnpublishSanitizesPublicReference()throws Exception {
    var a=articles.create(new ArticleModels.Input("Private draft","Secret summary","/assets/equipment.jpg",null,null),actor);
    var target=new Item(4,"文章","INTRO","ARTICLE","",a.id(),"","","");
    reject(replace(4,target));
    articles.saveContent(a.id(),new ContentModels.Input(List.of(new ContentModels.Block("text","文章正文",null,null,null)),0L),actor);
    a=articles.action(a.id(),1L,"publish",actor);
    shortcuts.save(replace(4,target),actor);
    assertThat(shortcuts.get(false).items().get(3).articleId()).isEqualTo(a.id());
    articles.action(a.id(),a.version(),"unpublish",actor);
    mvc.perform(get("/api/v1/home/shortcuts")).andExpect(status().isOk()).andExpect(jsonPath("$.items[3].articleId").value(""));
    assertThat(shortcuts.get(true).items().get(3).articleId()).isEqualTo(a.id());
    assertThat(shortcuts.save(replace(4,new Item(4,"野小子","INTRO","ARTICLE","","OFFICIAL","","","")),actor).items().get(3).articleId()).isEqualTo("OFFICIAL");
  }
  @Test void competingWritesCannotSilentlyOverwrite()throws Exception {
    var input=replace(3,popup(""));
    try(var pool=Executors.newFixedThreadPool(2)) {
      var start=new CountDownLatch(1);
      Callable<Boolean> save=()->{start.await();try{shortcuts.save(input,actor);return true;}catch(ApiException e){assertThat(e.code).isEqualTo("HOME_SHORTCUTS_CONFLICT");return false;}};
      var a=pool.submit(save);var b=pool.submit(save);start.countDown();
      assertThat(List.of(a.get(10,TimeUnit.SECONDS),b.get(10,TimeUnit.SECONDS))).containsExactlyInAnyOrder(true,false);
    }
  }
}
