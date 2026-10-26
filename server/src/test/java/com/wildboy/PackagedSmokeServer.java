package com.wildboy;

import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import java.nio.file.Path;

/** Starts the exact built JAR against a temporary real PostgreSQL database. */
public class PackagedSmokeServer {
  public static void main(String[] args) throws Exception {
    try (var pg =
        EmbeddedPostgres.builder().setServerConfig("unix_socket_directories", "").start()) {
      var builder =
          new ProcessBuilder(
              Path.of(System.getProperty("java.home"), "bin", "java").toString(),
              "-jar",
              "target/wildboy-server-0.1.0.jar");
      builder.environment().put("DATABASE_URL", pg.getJdbcUrl("postgres", "postgres"));
      builder.environment().put("DATABASE_USER", "postgres");
      builder.environment().put("DATABASE_PASSWORD", "");
      builder.environment().put("SPRING_PROFILES_ACTIVE", "dev");
      builder.environment().put("PORT", "8081");
      var child = builder.inheritIO().start();
      Runtime.getRuntime().addShutdownHook(new Thread(() -> child.destroy()));
      int status = child.waitFor();
      if (status != 0) throw new IllegalStateException("Packaged server exited with " + status);
    }
  }
}
