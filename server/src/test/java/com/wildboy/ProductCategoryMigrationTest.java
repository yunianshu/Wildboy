package com.wildboy;

import static org.assertj.core.api.Assertions.*;
import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

class ProductCategoryMigrationTest {
  @Test void migrationBackfillsEqualOriginalPriceAndDefaultCategoryWithoutChangingOrdersOrStock() throws Exception {
    try (var pg=EmbeddedPostgres.builder().setServerConfig("unix_socket_directories", "").start()) {
      var source=new DriverManagerDataSource(pg.getJdbcUrl("postgres","postgres"),"postgres","");
      Flyway.configure().dataSource(source).target("16").load().migrate(); var db=new JdbcTemplate(source);
      db.update("INSERT INTO app_user(id,external_id,nickname,role) VALUES('owner','fixture:owner','QA','USER')");
      db.update("INSERT INTO product(id,name,description,image_url,price_cents,stock,status,version) VALUES('gear','Legacy gear','Fixture','/assets/a.jpg',199,8,'ON_SALE',3),('off','Legacy off','Fixture','/assets/a.jpg',400,0,'OFF_SHELF',2)");
      db.update("INSERT INTO shop_order(id,order_no,user_id,total_cents,status,recipient_name,phone,address) VALUES('order','FIXTURE_ORDER','owner',398,'PENDING_PAYMENT','QA buyer','13800000000','Synthetic street')");
      db.update("INSERT INTO shop_order_item(id,order_id,product_id,product_name,image_url,price_cents,quantity) VALUES('item','order','gear','Legacy gear','/assets/a.jpg',199,2)");
      var products=db.queryForList("SELECT * FROM product ORDER BY id");
      var order=db.queryForMap("SELECT * FROM shop_order WHERE id='order'");
      var item=db.queryForMap("SELECT * FROM shop_order_item WHERE id='item'");
      var migration=Flyway.configure().dataSource(source).target("17").load();
      assertThat(migration.migrate().migrationsExecuted).isEqualTo(1);
      migration.validate(); assertThat(migration.migrate().migrationsExecuted).isZero();
      for (var original:products) {
        var current=db.queryForMap("SELECT * FROM product WHERE id=?",original.get("id"));
        assertThat(current).containsAllEntriesOf(original);
        assertThat(current.get("category_id")).isEqualTo("uncategorized");
        assertThat(current.get("original_price_cents")).isEqualTo(original.get("price_cents"));
      }
      assertThat(db.queryForMap("SELECT * FROM shop_order WHERE id='order'")).isEqualTo(order);
      assertThat(db.queryForMap("SELECT * FROM shop_order_item WHERE id='item'")).isEqualTo(item);
      assertThat(db.queryForObject("SELECT name FROM product_category WHERE id='uncategorized'",String.class)).isEqualTo("未分类");
      assertThatThrownBy(() -> db.update("UPDATE product SET original_price_cents=1 WHERE id='gear'"))
          .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
    }
  }
}
