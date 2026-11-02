package com.wildboy;

import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import java.nio.file.Path;
import java.nio.file.Files;
import java.util.Comparator;
import java.util.concurrent.TimeUnit;

/** Starts the exact built JAR against a temporary real PostgreSQL database. */
public class PackagedSmokeServer {
  private static void cleanMedia(Path directory) {
    if (!Files.exists(directory)) return;
    try (var paths = Files.walk(directory)) {
      for (var path : paths.sorted(Comparator.reverseOrder()).toList()) Files.deleteIfExists(path);
    } catch (java.io.IOException e) {
      System.err.println("Temporary smoke media cleanup failed: " + directory);
    }
  }
  public static void main(String[] args) throws Exception {
    Path media = Files.createTempDirectory("wildboy-packaged-smoke-media-");
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
      builder.environment().put("SERVER_ADDRESS", "127.0.0.1");
      builder.environment().put("MEDIA_DIR", media.toString());
      // Synthetic encryption key for this disposable local fixture only.
      builder.environment().put("IDENTITY_ENCRYPTION_KEY", java.util.Base64.getEncoder().encodeToString(new byte[32]));
      var child = builder.inheritIO().start();
      Runtime.getRuntime().addShutdownHook(new Thread(() -> {
        child.destroy();
        try {
          if (!child.waitFor(10, TimeUnit.SECONDS)) { child.destroyForcibly(); child.waitFor(); }
        } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
        cleanMedia(media);
      }));
      int status = child.waitFor();
      if (status != 0) throw new IllegalStateException("Packaged server exited with " + status);
    } finally { cleanMedia(media); }
  }
}
