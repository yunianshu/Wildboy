package com.wildboy;

import static org.assertj.core.api.Assertions.assertThat;

import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Set;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationVersion;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

class MembershipMergeMigrationTest {
  @TempDir Path legacyMigrations;

  @Test void version22WithoutMembershipCanUpgradeWithoutRepricingOrChangingHistoricalRecords()
      throws Exception {
    var membershipVersions = Set.of("V15__memberships.sql", "V16__shop_membership_prices.sql",
        "V17__activity_orders.sql", "V23__activity_payment_recovery.sql");
    var boardingVersion = MigrationVersion.fromVersion("34");
    try (var files = Files.list(Path.of("src/main/resources/db/migration"))) {
      for (var file : files.toList()) {
        String name = file.getFileName().toString();
        int separator = name.indexOf("__");
        boolean afterMerge = name.startsWith("V") && separator > 1
            && MigrationVersion.fromVersion(name.substring(1, separator)).compareTo(boardingVersion) >= 0;
        if (!membershipVersions.contains(name) && !afterMerge) {
          Files.copy(file, legacyMigrations.resolve(file.getFileName()));
        }
      }
    }
    try (var pg = EmbeddedPostgres.builder().setServerConfig("unix_socket_directories", "").start()) {
      var source = new DriverManagerDataSource(pg.getJdbcUrl("postgres", "postgres"), "postgres", "");
      Flyway.configure().dataSource(source).locations("filesystem:" + legacyMigrations.toAbsolutePath())
          .load().migrate();
      var db = new JdbcTemplate(source);
      db.update("""
          INSERT INTO app_user(id,external_id,nickname,role,role_version,wechat_verified_at,real_name,phone,profile_completed_at)
          VALUES('owner','wechat:merge-fixture','QA','ADMIN',3,CURRENT_TIMESTAMP,'QA Contact','13800000000',CURRENT_TIMESTAMP)
          """);
      db.update("""
          INSERT INTO product(id,name,description,image_url,category_id,price_cents,original_price_cents,stock,status,version)
          VALUES('gear','QA gear','Fixture','/assets/a.jpg','uncategorized',499,799,8,'ON_SALE',4)
          """);
      db.update("""
          INSERT INTO shop_order(id,order_no,user_id,total_cents,status,recipient_name,phone,address,payment_transaction_id,paid_at)
          VALUES('order','FIXTURE_MERGE','owner',398,'PAID','QA buyer','13800000000','Synthetic street','fixture-tx',CURRENT_TIMESTAMP)
          """);
      db.update("""
          INSERT INTO shop_order_item(id,order_id,product_id,product_name,image_url,price_cents,quantity)
          VALUES('item','order','gear','Old QA gear','/assets/b.jpg',199,2)
          """);
      db.update("""
          INSERT INTO refund_request(id,order_id,user_id,out_refund_no,amount_cents,reason,status)
          VALUES('refund','order','owner','FIXTURE_REFUND',398,'QA fixture','REQUESTED')
          """);
      var user = db.queryForMap("SELECT * FROM app_user WHERE id='owner'");
      var product = db.queryForMap("SELECT * FROM product WHERE id='gear'");
      var order = db.queryForMap("SELECT * FROM shop_order WHERE id='order'");
      var item = db.queryForMap("SELECT * FROM shop_order_item WHERE id='item'");
      var refund = db.queryForMap("SELECT * FROM refund_request WHERE id='refund'");

      var upgrade = Flyway.configure().dataSource(source).outOfOrder(true).target("34").load();
      assertThat(upgrade.migrate().migrationsExecuted).isEqualTo(5);
      assertThat(db.queryForObject("""
          SELECT COUNT(*) FROM information_schema.columns
          WHERE table_name = 'activity_order_participant' AND column_name = 'boarding_point'
          """, Integer.class)).isEqualTo(1);
      assertThat(db.queryForMap("SELECT * FROM app_user WHERE id='owner'"))
          .containsAllEntriesOf(user).containsEntry("customer_type", "GUEST");
      assertThat(db.queryForMap("SELECT * FROM product WHERE id='gear'")).isEqualTo(product);
      assertThat(db.queryForMap("SELECT * FROM shop_order WHERE id='order'"))
          .containsAllEntriesOf(order).containsEntry("original_total_cents", 398);
      assertThat(db.queryForMap("SELECT * FROM shop_order_item WHERE id='item'"))
          .containsAllEntriesOf(item).containsEntry("original_price_cents", 199);
      assertThat(db.queryForMap("SELECT * FROM refund_request WHERE id='refund'")).isEqualTo(refund);

      db.update("""
          INSERT INTO activity(id,title,category,cover_url,summary,description,location,meeting_point,
              start_at,end_at,registration_deadline,capacity,status,boarding_points)
          SELECT id,'QA hike','WEEKLY','/assets/a.jpg','Summary','Description','City','Gate',
              CURRENT_TIMESTAMP,CURRENT_TIMESTAMP+INTERVAL '1 hour',CURRENT_TIMESTAMP,20,'PUBLISHED',points
          FROM (VALUES ('first','["North station","South gate"]'), ('second','["South gate"]')) AS saved(id,points)
          """);
      var normal = Flyway.configure().dataSource(source).target("35").load();
      assertThat(normal.migrate().migrationsExecuted).isEqualTo(1);
      assertThat(db.queryForList("SELECT name FROM activity_boarding_point ORDER BY name", String.class))
          .containsExactly("North station", "South gate");
      String legacyBlocks = "[{\"type\":\"text\",\"text\":\"Legacy template\"}]";
      db.update("INSERT INTO activity_template(id,name,payload,rich_blocks) VALUES (?,?,?,?)",
          "legacy-template", "Legacy name", "{}", legacyBlocks);
      var previous = Flyway.configure().dataSource(source).target("40").load();
      assertThat(previous.migrate().migrationsExecuted).isEqualTo(5);
      db.update("UPDATE activity SET navigation_points=? WHERE id='first'", """
          [{"kind":"MEETING","label":"示例集合点","address":"厦门北站南广场","latitude":24.6,"longitude":118.1},
           {"kind":"MEETING","label":"示例集合点","address":"厦门北站南广场"},
           {"kind":"MEETING","label":"集合处","address":"景区大门"}]
          """);
      var latest = Flyway.configure().dataSource(source).load();
      assertThat(latest.migrate().migrationsExecuted).isEqualTo(3);
      assertThat(db.queryForObject("SELECT count(*) FROM media_asset", Integer.class)).isZero();
      assertThat(db.queryForMap("SELECT address, latitude, display_name FROM activity_boarding_point WHERE name='厦门北站南广场'"))
          .containsEntry("address", "厦门北站南广场").containsEntry("latitude", 24.6).containsEntry("display_name", null);
      assertThat(db.queryForObject("SELECT COUNT(*) FROM activity_boarding_point WHERE address='景区大门'", Integer.class)).isZero();
      assertThat(db.queryForMap("SELECT rich_blocks,rich_markdown FROM activity_template WHERE id='legacy-template'"))
          .containsEntry("rich_blocks",legacyBlocks).containsEntry("rich_markdown",null);
      assertThat(db.queryForList("SELECT draft_contact FROM legal_document_state", String.class))
          .containsExactly("", "");
      latest.validate();
      assertThat(latest.migrate().migrationsExecuted).isZero();
    }
  }
}
