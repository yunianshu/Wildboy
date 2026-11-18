package com.wildboy;

import static org.assertj.core.api.Assertions.assertThat;

import com.zaxxer.hikari.HikariDataSource;
import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

/** Uses only a disposable embedded database; never starts the application or calls WeChat. */
class ShippingReportRecoveryMigrationTest {
  @Test
  void upgradeRecoversOnlyEligibleLegacySkipsAndPreservesAttemptsAndBusinessHistory() throws Exception {
    try (var pg = EmbeddedPostgres.builder().setServerConfig("unix_socket_directories", "").start();
         var source = dataSource(pg)) {
      Flyway.configure().dataSource(source).target("26").load().migrate();
      var db = new JdbcTemplate(source);
      seedCatalog(db);
      var recoverable = new ArrayList<Fixture>();
      var protectedRows = new ArrayList<Fixture>();

      for (String kind : List.of("shop", "activity")) {
        for (String reason : List.of("disabled", "not_trade_managed", "shipping_payload_unavailable", "no_wechat_identity"))
          recoverable.add(order(db, kind, reason));

        // A rejected/closed refund no longer prevents reporting a fulfilled order.
        for (String refundStatus : List.of("REJECTED", "CLOSED")) {
          var fixture = order(db, kind, "disabled");
          refund(db, fixture, refundStatus);
          recoverable.add(fixture);
        }

        var reported = order(db, kind, "disabled");
        db.update("UPDATE shipping_report SET status='REPORTED',last_errcode=0,reported_at=CURRENT_TIMESTAMP WHERE id=?",
            reported.reportId());
        protectedRows.add(reported);

        var ambiguous = order(db, kind, "disabled");
        db.update("UPDATE shipping_report SET reported_at=CURRENT_TIMESTAMP WHERE id=?", ambiguous.reportId());
        protectedRows.add(ambiguous);

        var exhausted = order(db, kind, "not_trade_managed");
        db.update("UPDATE shipping_report SET attempts=8 WHERE id=?", exhausted.reportId());
        protectedRows.add(exhausted);

        protectedRows.add(order(db, kind, "unknown_skip_reason"));
        protectedRows.add(order(db, kind, "missing_transaction"));

        var nonWechat = order(db, kind, "no_wechat_identity");
        db.update("UPDATE app_user SET external_id=? WHERE id=?", "fixture:" + nonWechat.userId(), nonWechat.userId());
        protectedRows.add(nonWechat);

        for (String transaction : new String[] {null, " "}) {
          var noTransaction = order(db, kind, "disabled");
          db.update("UPDATE " + noTransaction.table() + " SET payment_transaction_id=? WHERE id=?",
              transaction, noTransaction.orderId());
          protectedRows.add(noTransaction);
        }

        var unfulfilled = order(db, kind, "not_trade_managed");
        db.update("UPDATE " + unfulfilled.table() + " SET status=? WHERE id=?",
            "shop".equals(kind) ? "PAID" : "PENDING_PAYMENT", unfulfilled.orderId());
        protectedRows.add(unfulfilled);

        var refunded = order(db, kind, "disabled");
        db.update("UPDATE " + refunded.table() + " SET status='REFUNDED' WHERE id=?", refunded.orderId());
        protectedRows.add(refunded);

        for (String refundStatus : List.of("REQUESTED", "PROCESSING", "UNKNOWN", "SUCCESS", "ABNORMAL")) {
          var refundRisk = order(db, kind, "disabled");
          refund(db, refundRisk, refundStatus);
          protectedRows.add(refundRisk);
        }

        var removed = order(db, kind, "disabled");
        db.update("DELETE FROM " + removed.table() + " WHERE id=?", removed.orderId());
        protectedRows.add(removed);
      }

      for (String field : List.of("shipping_company", "shipping_tracking_no")) {
        var missingShipping = order(db, "shop", "shipping_payload_unavailable");
        db.update("UPDATE shop_order SET " + field + "=' ' WHERE id=?", missingShipping.orderId());
        protectedRows.add(missingShipping);
      }
      var missingItems = order(db, "shop", "shipping_payload_unavailable");
      db.update("DELETE FROM shop_order_item WHERE order_id=?", missingItems.orderId());
      protectedRows.add(missingItems);

      var organizerCancelled = order(db, "activity", "disabled");
      db.update("UPDATE activity_order SET organizer_cancelled=TRUE WHERE id=?", organizerCancelled.orderId());
      protectedRows.add(organizerCancelled);

      var refundPending = order(db, "activity", "disabled");
      db.update("UPDATE activity_order SET status='REFUND_PENDING' WHERE id=?", refundPending.orderId());
      protectedRows.add(refundPending);

      var emptyWechatIdentity = order(db, "shop", "no_wechat_identity");
      db.update("UPDATE app_user SET external_id='wechat:' WHERE id=?", emptyWechatIdentity.userId());
      protectedRows.add(emptyWechatIdentity);

      var beforeReports = db.queryForList("SELECT * FROM shipping_report ORDER BY id");
      var beforeOrders = db.queryForList("SELECT * FROM shop_order ORDER BY id");
      var beforeItems = db.queryForList("SELECT * FROM shop_order_item ORDER BY id");
      var beforeActivityOrders = db.queryForList("SELECT * FROM activity_order ORDER BY id");
      var beforeRefunds = db.queryForList("SELECT * FROM refund_request ORDER BY id");
      var beforeActivityRefunds = db.queryForList("SELECT * FROM activity_order_refund ORDER BY id");
      Integer originalChecksum = db.queryForObject(
          "SELECT checksum FROM flyway_schema_history WHERE version='25'", Integer.class);

      var migration = Flyway.configure().dataSource(source).target("27").load();
      assertThat(migration.migrate().migrationsExecuted).isEqualTo(1);
      migration.validate();

      for (Fixture fixture : recoverable) {
        var before = find(beforeReports, fixture.reportId());
        var current = report(db, fixture.reportId());
        assertThat(current).as("recoverable %s", fixture).containsEntry("status", "PENDING");
        assertThat(current.get("next_retry_at")).isNotNull();
        for (String field : List.of("id", "source", "order_id", "order_no", "logistics_type", "attempts",
            "last_errcode", "last_error", "reported_at", "created_at"))
          assertThat(current.get(field)).as("%s metadata %s", fixture.reportId(), field).isEqualTo(before.get(field));
        assertThat(current.get("attempt_token")).isNull();
        assertThat(current.get("lease_until")).isNull();
      }
      for (Fixture fixture : protectedRows)
        assertThat(report(db, fixture.reportId())).as("protected %s", fixture)
            .containsAllEntriesOf(find(beforeReports, fixture.reportId()));

      assertThat(db.queryForObject("SELECT COUNT(*) FROM shipping_report WHERE status='PENDING'", Integer.class))
          .isEqualTo(recoverable.size());
      assertThat(db.queryForObject("SELECT COUNT(*) FROM shipping_report", Integer.class)).isEqualTo(beforeReports.size());
      assertThat(db.queryForList("SELECT * FROM shop_order ORDER BY id")).isEqualTo(beforeOrders);
      assertThat(db.queryForList("SELECT * FROM shop_order_item ORDER BY id")).isEqualTo(beforeItems);
      assertThat(db.queryForList("SELECT * FROM activity_order ORDER BY id")).isEqualTo(beforeActivityOrders);
      assertThat(db.queryForList("SELECT * FROM refund_request ORDER BY id")).isEqualTo(beforeRefunds);
      assertThat(db.queryForList("SELECT * FROM activity_order_refund ORDER BY id")).isEqualTo(beforeActivityRefunds);
      assertThat(db.queryForObject("SELECT checksum FROM flyway_schema_history WHERE version='25'", Integer.class))
          .isEqualTo(originalChecksum);
      var afterReports = db.queryForList("SELECT * FROM shipping_report ORDER BY id");
      assertThat(migration.migrate().migrationsExecuted).isZero();
      assertThat(db.queryForList("SELECT * FROM shipping_report ORDER BY id")).isEqualTo(afterReports);
    }
  }

  @Test
  void upgradeSpreadsHistoricalRecoveryAcrossMinuteBatchesWithoutResettingBudgets() throws Exception {
    try (var pg = EmbeddedPostgres.builder().setServerConfig("unix_socket_directories", "").start();
         var source = dataSource(pg)) {
      Flyway.configure().dataSource(source).target("26").load().migrate();
      var db = new JdbcTemplate(source);
      seedCatalog(db);
      var originals = new ArrayList<Map<String, Object>>();
      for (int i = 0; i < 103; i++) {
        var fixture = order(db, i % 2 == 0 ? "shop" : "activity", "disabled");
        db.update("UPDATE shipping_report SET attempts=? WHERE id=?", i % 8, fixture.reportId());
        originals.add(report(db, fixture.reportId()));
      }
      Instant before = Instant.now();
      assertThat(Flyway.configure().dataSource(source).target("27").load().migrate().migrationsExecuted).isEqualTo(1);
      Instant after = Instant.now();

      var batches = db.query("""
          SELECT next_retry_at,COUNT(*) FROM shipping_report WHERE status='PENDING'
          GROUP BY next_retry_at ORDER BY next_retry_at
          """, (rs, n) -> new Batch(rs.getTimestamp(1).toInstant(), rs.getInt(2)));
      assertThat(batches).extracting(Batch::size).containsExactly(50, 50, 3);
      assertThat(batches.getFirst().time()).isBetween(before, after);
      assertThat(Duration.between(batches.get(0).time(), batches.get(1).time())).isEqualTo(Duration.ofMinutes(1));
      assertThat(Duration.between(batches.get(1).time(), batches.get(2).time())).isEqualTo(Duration.ofMinutes(1));
      for (var original : originals) {
        var current = report(db, (String) original.get("id"));
        assertThat(current.get("attempts")).isEqualTo(original.get("attempts"));
        assertThat(current.get("last_error")).isEqualTo(original.get("last_error"));
        assertThat(current.get("reported_at")).isNull();
      }
    }
  }

  private static HikariDataSource dataSource(EmbeddedPostgres pg) {
    var source = new HikariDataSource();
    source.setJdbcUrl(pg.getJdbcUrl("postgres", "postgres"));
    source.setUsername("postgres");
    source.setPassword("");
    source.setMaximumPoolSize(2);
    source.setMinimumIdle(1);
    return source;
  }

  private static void seedCatalog(JdbcTemplate db) {
    db.update("""
        INSERT INTO product(id,name,description,image_url,price_cents,original_price_cents,stock,status)
        VALUES('migration-product','Fixture gear','Synthetic','/assets/fixture.jpg',100,100,1000,'ON_SALE')
        """);
    db.update("""
        INSERT INTO activity(id,title,category,cover_url,summary,description,location,meeting_point,
          start_at,end_at,registration_deadline,capacity,status,price_cents)
        VALUES('migration-activity','Fixture activity','WEEKLY','/assets/fixture.jpg','Synthetic','Synthetic','Local','Gate',
          CURRENT_TIMESTAMP+INTERVAL '2 days',CURRENT_TIMESTAMP+INTERVAL '3 days',
          CURRENT_TIMESTAMP+INTERVAL '1 day',1000,'PUBLISHED',100)
        """);
  }

  private static Fixture order(JdbcTemplate db, String source, String reason) {
    String orderId = UUID.randomUUID().toString();
    String userId = UUID.randomUUID().toString();
    String reportId = UUID.randomUUID().toString();
    String orderNo = orderId.replace("-", "");
    db.update("INSERT INTO app_user(id,external_id,nickname,role) VALUES(?,?,'Migration fixture','USER')",
        userId, "wechat:fixture-" + userId);
    if ("shop".equals(source)) {
      db.update("""
          INSERT INTO shop_order(id,order_no,user_id,total_cents,original_total_cents,status,
            recipient_name,phone,address,payment_transaction_id,shipping_company,shipping_tracking_no)
          VALUES(?,?,?,100,100,'SHIPPED','Synthetic buyer','13800000000','Synthetic address',?,'SF','fixture-tracking')
          """, orderId, orderNo, userId, "fixture-transaction-" + orderNo);
      db.update("""
          INSERT INTO shop_order_item(id,order_id,product_id,product_name,image_url,price_cents,quantity,original_price_cents)
          VALUES(?,?,'migration-product','Fixture gear','/assets/fixture.jpg',100,1,100)
          """, UUID.randomUUID().toString(), orderId);
    } else {
      db.update("""
          INSERT INTO activity_order(id,order_no,activity_id,activity_title,user_id,request_key,request_fingerprint,
            status,party_size,original_total_cents,total_cents,currency,quote_json,payment_transaction_id,expires_at)
          VALUES(?,?,'migration-activity','Fixture activity',?,?,'fixture-fingerprint',
            'PAID',1,100,100,'CNY','{}',?,CURRENT_TIMESTAMP+INTERVAL '1 day')
          """, orderId, orderNo, userId, orderNo, "fixture-transaction-" + orderNo);
    }
    db.update("""
        INSERT INTO shipping_report(id,source,order_id,order_no,logistics_type,status,attempts,last_errcode,last_error,
          next_retry_at,created_at,updated_at)
        VALUES(?,?,?,?,?,'SKIPPED',3,-1,?,NULL,TIMESTAMPTZ '2025-01-01 00:00:00+00',TIMESTAMPTZ '2025-01-02 00:00:00+00')
        """, reportId, source, orderId, orderNo, "shop".equals(source) ? 1 : 3, reason);
    return new Fixture(reportId, orderId, userId, source);
  }

  private static void refund(JdbcTemplate db, Fixture fixture, String status) {
    String refundId = UUID.randomUUID().toString();
    String refundNo = refundId.replace("-", "");
    if ("shop".equals(fixture.source())) {
      db.update("""
          INSERT INTO refund_request(id,order_id,user_id,out_refund_no,amount_cents,reason,status)
          VALUES(?,?,?,?,100,'Synthetic refund',?)
          """, refundId, fixture.orderId(), fixture.userId(), refundNo, status);
    } else {
      db.update("""
          INSERT INTO activity_order_refund(id,order_id,out_refund_no,amount_cents,reason,status)
          VALUES(?,?,?,100,'Synthetic refund',?)
          """, refundId, fixture.orderId(), refundNo, status);
    }
  }

  private static Map<String, Object> report(JdbcTemplate db, String id) {
    return db.queryForMap("SELECT * FROM shipping_report WHERE id=?", id);
  }

  private static Map<String, Object> find(List<Map<String, Object>> reports, String id) {
    return reports.stream().filter(row -> id.equals(row.get("id"))).findFirst().orElseThrow();
  }

  private record Fixture(String reportId, String orderId, String userId, String source) {
    String table() { return "shop".equals(source) ? "shop_order" : "activity_order"; }
  }

  private record Batch(Instant time, int size) {}
}
