package com.wildboy;

import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import java.nio.file.*;
import org.springframework.boot.SpringApplication;

/** Local-only QA runner. Not packaged into the executable application. */
public class LocalSmokeServer {
  public static void main(String[] args) throws Exception {
    var pg = EmbeddedPostgres.builder().setServerConfig("unix_socket_directories", "").start();
    System.setProperty("spring.datasource.url", pg.getJdbcUrl("postgres", "postgres"));
    System.setProperty("spring.datasource.username", "postgres");
    System.setProperty("spring.datasource.password", "");
    System.setProperty("spring.profiles.active", "dev");
    var context = SpringApplication.run(WildboyApplication.class, args);
    var auth = context.getBean(AuthService.class);
    String admin = auth.dev("ADMIN", null, null).token();
    String user = auth.dev("USER", 1L, 1L).token();
    String user2 = auth.login(auth.user("smoke:user2", "Smoke second user", "USER")).token();
    Path path = Path.of("/tmp/wildboy-smoke-env");
    Files.writeString(
        path, "ADMIN_TOKEN=" + admin + "\nUSER_TOKEN=" + user + "\nUSER_TOKEN_2=" + user2 + "\n");
    try {
      Files.setPosixFilePermissions(
          path, java.nio.file.attribute.PosixFilePermissions.fromString("rw-------"));
    } catch (UnsupportedOperationException ignored) {
    }
    Runtime.getRuntime()
        .addShutdownHook(
            new Thread(
                () -> {
                  context.close();
                  try {
                    pg.close();
                    Files.deleteIfExists(path);
                  } catch (Exception ignored) {
                  }
                }));
  }
}
