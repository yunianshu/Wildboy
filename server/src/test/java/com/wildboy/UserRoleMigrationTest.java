package com.wildboy;

import static org.assertj.core.api.Assertions.*;

import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

class UserRoleMigrationTest {
  @Test void existingProfilesRolesAndSessionsRemainAndWechatPrefixDoesNotImplyVerification() throws Exception {
    try (var pg = EmbeddedPostgres.builder().setServerConfig("unix_socket_directories", "").start()) {
      var source = new DriverManagerDataSource(pg.getJdbcUrl("postgres", "postgres"), "postgres", "");
      Flyway.configure().dataSource(source).target("15").load().migrate();
      var db = new JdbcTemplate(source);
      db.update("INSERT INTO app_user(id,external_id,nickname,role,real_name,phone,profile_completed_at) VALUES('wechat','wechat:historical','Fixture','ADMIN','历史姓名','13800000000',CURRENT_TIMESTAMP),('password','admin:historical','Admin','ADMIN','','',NULL),('demo','smoke:historical','Demo','USER','','',NULL)");
      db.update("INSERT INTO auth_session(token_hash,user_id,expires_at) VALUES(repeat('a',64),'wechat',CURRENT_TIMESTAMP+INTERVAL '1 day')");
      var users = db.queryForList("SELECT * FROM app_user ORDER BY id");
      var sessions = db.queryForList("SELECT * FROM auth_session");
      var migration = Flyway.configure().dataSource(source).target("16").load();
      assertThat(migration.migrate().migrationsExecuted).isEqualTo(1);
      migration.validate(); assertThat(migration.migrate().migrationsExecuted).isZero();
      for (var original : users) {
        var current = db.queryForMap("SELECT * FROM app_user WHERE id=?", original.get("id"));
        assertThat(current).containsAllEntriesOf(original);
        assertThat(current.get("role_version")).isEqualTo(0L);
        assertThat(current.get("wechat_verified_at")).isNull();
      }
      assertThat(db.queryForList("SELECT * FROM auth_session")).isEqualTo(sessions);
    }
  }
}
