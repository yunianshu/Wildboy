package com.wildboy;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.nio.file.*;
import java.util.*;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.*;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.*;
import org.springframework.test.web.servlet.*;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
@SpringBootTest
@AutoConfigureMockMvc(print=MockMvcPrint.NONE)
@DirtiesContext(classMode=DirtiesContext.ClassMode.AFTER_CLASS)
class DisplayProfileIntegrationTest {
 static final EmbeddedPostgres pg; static final Path media;
 static {try{pg=EmbeddedPostgres.builder().setServerConfig("unix_socket_directories", "").start();media=Files.createTempDirectory("wildboy-avatar-test-");}catch(Exception e){throw new ExceptionInInitializerError(e);}}
 @DynamicPropertySource static void properties(DynamicPropertyRegistry r){
  r.add("spring.datasource.url",()->pg.getJdbcUrl("postgres","postgres"));r.add("spring.datasource.username",()->"postgres");r.add("spring.datasource.password",()->"");
  r.add("wildboy.media-dir",()->media.toString());r.add("wildboy.identity.encryption-key",()->Base64.getEncoder().encodeToString(new byte[32]));
  r.add("wildboy.notifications.scan-ms",()->3600000);r.add("wildboy.orders.expiry-scan-ms",()->3600000);
 }
 @Autowired AuthService auth; @Autowired JdbcTemplate db; @Autowired MockMvc mvc; @Autowired ObjectMapper json;
 @Autowired DisplayProfileService profiles; @Autowired PlatformTransactionManager manager;
 Models.User user; String bearer;
 @BeforeEach void setup(){user=auth.user("wechat:avatar-test-"+UUID.randomUUID(),"微信用户","USER");db.update("UPDATE app_user SET wechat_verified_at=CURRENT_TIMESTAMP WHERE id=?",user.id());user=auth.byId(user.id());bearer="Bearer "+auth.login(user).token();}
 @AfterAll static void cleanup()throws Exception{pg.close();try(var files=Files.list(media)){for(var file:files.toList())Files.deleteIfExists(file);}Files.deleteIfExists(media);}
 ResultActions save(Object input)throws Exception{return mvc.perform(put("/api/v1/me/display-profile").header("Authorization",bearer).contentType("application/json").content(json.writeValueAsString(input)));}
 static String png(int w,int h)throws Exception{var out=new ByteArrayOutputStream();ImageIO.write(new BufferedImage(w,h,BufferedImage.TYPE_INT_RGB),"png",out);return Base64.getEncoder().encodeToString(out.toByteArray());}
 @Test void persistsDisplayFieldsWithoutChangingIdentityOrPhone()throws Exception{
  save(Map.of("nickname"," 新昵称 ","avatarBase64",png(3,2))).andExpect(status().isOk()).andExpect(jsonPath("$.id").value(user.id())).andExpect(jsonPath("$.nickname").value("新昵称")).andExpect(jsonPath("$.displayProfileCompleted").value(true)).andExpect(jsonPath("$.profileCompleted").value(false));
  var saved=auth.byId(user.id());assertThat(saved.phone()).isEqualTo(user.phone());assertThat(saved.realName()).isEqualTo(user.realName());assertThat(saved.avatarUrl()).matches("/assets/uploads/avatar-[0-9a-f-]{36}\\.png");
  mvc.perform(get(saved.avatarUrl())).andExpect(status().isOk()).andExpect(content().contentType("image/png"));
  assertThat(auth.login(auth.byId(user.id())).user().avatarUrl()).isEqualTo(saved.avatarUrl());
  assertThat(db.queryForObject("SELECT COUNT(*) FROM audit_event WHERE entity_id=? AND action='PROFILE_DISPLAY_AVATAR'",Integer.class,user.id())).isEqualTo(1);
  save(Map.of("nickname","只改昵称")).andExpect(status().isOk());
  assertThat(db.queryForObject("SELECT COUNT(*) FROM audit_event WHERE entity_id=? AND action='PROFILE_DISPLAY_UPDATE'",Integer.class,user.id())).isEqualTo(1);
 }
 @Test void blankOrOmittedFieldsNeverEraseExistingData()throws Exception{
  save(Map.of("nickname","Saved","avatarBase64",png(2,2))).andExpect(status().isOk());var saved=auth.byId(user.id());
  save(Map.of("nickname"," ","avatarBase64","")).andExpect(status().isOk());assertThat(auth.byId(user.id())).isEqualTo(saved);
  save(Map.of("nickname","Edited")).andExpect(status().isOk());assertThat(auth.byId(user.id()).avatarUrl()).isEqualTo(saved.avatarUrl());
 }
 @Test void skippingIsNoopAndAvatarAloneCompletesOptionalProfile()throws Exception{
  save(Map.of()).andExpect(status().isOk()).andExpect(jsonPath("$.displayProfileCompleted").value(false));
  save(Map.of("avatarBase64",png(2,2))).andExpect(status().isOk()).andExpect(jsonPath("$.nickname").value("微信用户")).andExpect(jsonPath("$.displayProfileCompleted").value(true));
 }
 @Test void requiresWechatAuthenticationAndRejectsForeignFields()throws Exception{
  mvc.perform(put("/api/v1/me/display-profile").contentType("application/json").content("{}")).andExpect(status().isUnauthorized());
  save(Map.of("userId","another","nickname","Bad")).andExpect(status().isBadRequest());save(Map.of("avatarUrl","https://foreign.example/a.png")).andExpect(status().isBadRequest());
  bearer="Bearer "+auth.login(auth.user("dev:avatar-test-"+UUID.randomUUID(),"Demo","USER")).token();save(Map.of("nickname","Demo")).andExpect(status().isForbidden());
 }
 @Test void rejectsInvalidImageDimensionsSizeAndNicknameWithoutPartialSave()throws Exception{
  for(String avatar:List.of("bad###",Base64.getEncoder().encodeToString("<svg/>".getBytes()),png(4097,1),png(1025,1),png(1,1025),"A".repeat(2796205)))save(Map.of("nickname","MustNotPersist","avatarBase64",avatar)).andExpect(status().isBadRequest());
  for(String name:List.of("a".repeat(41),"bad\nname"))save(Map.of("nickname",name)).andExpect(status().isBadRequest());
  assertThat(auth.byId(user.id()).nickname()).isEqualTo("微信用户");assertThat(auth.byId(user.id()).avatarUrl()).isNull();
  // 尺寸上限边界（1024 宽）内仍然可用
  save(Map.of("avatarBase64",png(1024,64))).andExpect(status().isOk());
 }
 @Test void replacementRemovesOwnOldAvatarAfterCommit()throws Exception{
  save(Map.of("avatarBase64",png(2,2))).andExpect(status().isOk());String old=auth.byId(user.id()).avatarUrl();save(Map.of("avatarBase64",png(3,2))).andExpect(status().isOk());
  assertThat(Files.exists(media.resolve(old.substring(old.lastIndexOf('/')+1)))).isFalse();mvc.perform(get(auth.byId(user.id()).avatarUrl())).andExpect(status().isOk());
 }
 @Test void rollbackKeepsOldAvatarAndRemovesUncommittedFile()throws Exception{
  save(Map.of("avatarBase64",png(2,2))).andExpect(status().isOk());var before=auth.byId(user.id());String image=png(3,2);List<Path> filesBefore;
  try(var files=Files.list(media)){filesBefore=files.sorted().toList();}
  new TransactionTemplate(manager).executeWithoutResult(status->{profiles.update(user,new DisplayProfileController.Input("Rollback",image));status.setRollbackOnly();});
  assertThat(auth.byId(user.id())).isEqualTo(before);try(var files=Files.list(media)){assertThat(files.sorted().toList()).isEqualTo(filesBefore);}
 }
}