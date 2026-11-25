package com.wildboy;

import static org.assertj.core.api.Assertions.assertThat;

import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

class HomeShortcutMigrationTest {
  @Test void importsLegacySlotsIndependentlyOfOtherLayoutEditsAndKeepsModernSlotEdits() throws Exception {
    try (var pg = EmbeddedPostgres.builder().setServerConfig("unix_socket_directories", "").start()) {
      var source = new DriverManagerDataSource(pg.getJdbcUrl("postgres","postgres"), "postgres", "");
      for (String schema : new String[]{"edited_hero", "different_slots", "same_slot"}) {
        Flyway.configure().dataSource(source).schemas(schema).target("37").load().migrate();
        var database = new JdbcTemplate(source);
        String layout = schema + ".home_page_settings";
        String legacy = schema + ".home_shortcut_settings";
        database.update("UPDATE " + legacy + """
             SET version=5, items=jsonb_set(items::jsonb, '{2,popupImageUrl}', '"/assets/legacy.jpg"')::text
            """);
        database.update("UPDATE " + layout + """
             SET version=2, config_json=jsonb_set(config_json::jsonb, '{hero,title}', '"新首页"')::text
            """);
        if (!schema.equals("edited_hero")) {
          database.update("UPDATE " + layout + """
               SET config_json=jsonb_set(config_json::jsonb, '{shortcuts,items}', jsonb_build_array(
                 (config_json::jsonb #> '{shortcuts,items,3}') || '{"id":"new-slot","name":"新增入口"}'::jsonb,
                 config_json::jsonb #> '{shortcuts,items,2}',
                 (config_json::jsonb #> '{shortcuts,items,0}') || '{"name":"新入口"}'::jsonb
               ))::text
              """);
          if (schema.equals("same_slot")) {
            database.update("UPDATE " + layout + """
                 SET config_json=jsonb_set(config_json::jsonb, '{shortcuts,items,1,popupText}', '"新版内容"')::text
                """);
          }
        }
        Flyway.configure().dataSource(source).schemas(schema).target("38").load().migrate();
        String query = "SELECT config_json::jsonb #>> ?::text[] FROM " + layout;
        assertThat(database.queryForObject(query, String.class, "{hero,title}")).isEqualTo("新首页");
        assertThat(database.queryForObject("SELECT version FROM " + layout, Long.class)).isGreaterThan(5L);
        String qrSlot = schema.equals("edited_hero") ? "2" : "1";
        assertThat(database.queryForObject(query, String.class, "{shortcuts,items," + qrSlot + ",id}")).isEqualTo("slot-3");
        assertThat(database.queryForObject(query, String.class, "{shortcuts,items," + qrSlot + ",popupImageUrl}"))
            .isEqualTo(schema.equals("same_slot") ? "" : "/assets/legacy.jpg");
        if (!schema.equals("same_slot")) {
          assertThat(database.queryForObject(query, String.class, "{shortcuts,items," + qrSlot + ",popupImages,0,url}"))
              .isEqualTo("/assets/legacy.jpg");
        }
        if (!schema.equals("edited_hero")) {
          assertThat(database.queryForObject(query, String.class, "{shortcuts,items,0,id}")).isEqualTo("new-slot");
          assertThat(database.queryForObject(query, String.class, "{shortcuts,items,2,name}")).isEqualTo("新入口");
          assertThat(database.queryForObject("SELECT jsonb_array_length(config_json::jsonb #> '{shortcuts,items}') FROM " + layout, Integer.class)).isEqualTo(3);
        }
      }
    }
  }
}
