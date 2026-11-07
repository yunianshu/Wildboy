package com.wildboy;

import static org.assertj.core.api.Assertions.*;

import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import java.util.*;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

class WaitlistRetirementMigrationTest {
  @Test void upgradePreservesHistoricalDataAndOnlyRetiresRemovedFeatureNotifications() throws Exception {
    try (var pg = EmbeddedPostgres.builder().setServerConfig("unix_socket_directories", "").start()) {
      var source = new DriverManagerDataSource(pg.getJdbcUrl("postgres", "postgres"), "postgres", "");
      var before = Flyway.configure().dataSource(source).target("18").load(); before.migrate();
      var db = new JdbcTemplate(source);
      Integer originalChecksum = db.queryForObject("SELECT checksum FROM flyway_schema_history WHERE version='11'", Integer.class);
      for (String user : List.of("owner", "waiting-user", "offered-user"))
        db.update("INSERT INTO app_user(id,external_id,nickname,role) VALUES(?,?,?,'USER')", user, "fixture:" + user, user);
      db.update("INSERT INTO activity(id,title,category,cover_url,summary,description,location,meeting_point,start_at,end_at,registration_deadline,capacity,registered_count,status) VALUES('activity','Fixture','WEEKLY','/assets/a.jpg','Fixture','Fixture','Local','Gate',CURRENT_TIMESTAMP+INTERVAL '2 days',CURRENT_TIMESTAMP+INTERVAL '3 days',CURRENT_TIMESTAMP+INTERVAL '1 day',5,1,'PUBLISHED')");
      db.update("INSERT INTO registration(id,activity_id,user_id,status) VALUES('registration','activity','owner','CONFIRMED')");
      db.update("INSERT INTO registration_participant(id,registration_id,participant_name,id_number,phone,position) VALUES('participant','registration','QA fixture','','13800000000',0)");
      db.update("INSERT INTO activity_waitlist(id,activity_id,user_id,status,party_size,participants_json,privacy_version,terms_version) VALUES('waiting','activity','waiting-user','WAITING',2,'preserved waiting payload',1,1),('offered','activity','offered-user','OFFERED',2,'preserved offered payload',1,1),('confirmed','activity','waiting-user','CONFIRMED',1,'[]',1,1)");
      db.update("INSERT INTO notification_permission(user_id,credits) VALUES('owner',2)");
      var historicalQueue = db.queryForList("SELECT * FROM activity_waitlist ORDER BY id");
      var historicalRegistration = db.queryForMap("SELECT * FROM registration WHERE id='registration'");
      var historicalParticipant = db.queryForMap("SELECT * FROM registration_participant WHERE id='participant'");
      for (String state : List.of("PENDING", "SENDING", "FAILED", "NO_PERMISSION", "UNCONFIGURED", "UNKNOWN", "SENT", "OBSOLETE"))
        notice(db, "old-" + state, "WAITLIST_OFFER", "waitlist:" + state, state);
      notice(db, "old-cancel", "ACTIVITY_CANCELLED", "cancel-wait:activity", "PENDING");
      notice(db, "old-cancel-sent", "ACTIVITY_CANCELLED", "cancel-wait:activity:sent", "SENT");
      notice(db, "changed", "ACTIVITY_CHANGED", "ACTIVITY_CHANGED:activity:owner", "PENDING");
      notice(db, "pretrip", "PRETRIP", "PRETRIP:activity:owner", "FAILED");
      notice(db, "cancelled", "ACTIVITY_CANCELLED", "ACTIVITY_CANCELLED:activity:owner", "PENDING");
      var after = Flyway.configure().dataSource(source).target("19").load();
      assertThat(after.migrate().migrationsExecuted).isEqualTo(1);
      after.validate(); assertThat(after.migrate().migrationsExecuted).isZero();
      assertThat(db.queryForObject("SELECT checksum FROM flyway_schema_history WHERE version='11'", Integer.class)).isEqualTo(originalChecksum);
      assertThat(db.queryForList("SELECT * FROM activity_waitlist ORDER BY id")).isEqualTo(historicalQueue);
      assertThat(db.queryForMap("SELECT * FROM registration WHERE id='registration'")).isEqualTo(historicalRegistration);
      assertThat(db.queryForMap("SELECT * FROM registration_participant WHERE id='participant'")).isEqualTo(historicalParticipant);
      assertThat(db.queryForObject("SELECT registered_count FROM activity WHERE id='activity'", Integer.class)).isEqualTo(1);
      assertThat(db.queryForObject("SELECT credits FROM notification_permission WHERE user_id='owner'", Integer.class)).isEqualTo(2);
      assertThat(db.queryForObject("SELECT COUNT(*) FROM notification_outbox", Integer.class)).isEqualTo(13);
      assertThat(db.queryForObject("SELECT COUNT(*) FROM notification_outbox WHERE retired_at IS NOT NULL", Integer.class)).isEqualTo(10);
      assertThat(db.queryForObject("SELECT COUNT(*) FROM notification_outbox WHERE retired_at IS NOT NULL AND status='OBSOLETE'", Integer.class)).isEqualTo(8);
      assertThat(db.queryForObject("SELECT COUNT(*) FROM notification_outbox WHERE retired_at IS NOT NULL AND status='SENT' AND last_error='original metadata'", Integer.class)).isEqualTo(2);
      assertThat(db.queryForObject("SELECT COUNT(*) FROM notification_outbox WHERE retired_at IS NULL AND last_error='original metadata' AND status IN ('PENDING','FAILED')", Integer.class)).isEqualTo(3);
      assertThat(db.queryForObject("SELECT COUNT(*) FROM notification_outbox WHERE title='Historical title' AND detail='Historical detail'", Integer.class)).isEqualTo(13);
    }
  }

  void notice(JdbcTemplate db, String id, String kind, String key, String status) {
    db.update("INSERT INTO notification_outbox(id,user_id,activity_id,kind,dedupe_key,title,detail,event_at,status,last_error) VALUES(?,'owner','activity',?,?,'Historical title','Historical detail',CURRENT_TIMESTAMP+INTERVAL '1 day',?,'original metadata')", id, kind, key, status);
  }
}
