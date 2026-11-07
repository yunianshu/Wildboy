package com.wildboy;

import static org.assertj.core.api.Assertions.*;

import java.nio.file.Path;
import org.junit.jupiter.api.Test;

class LocalSmokeServerTest {
  @Test void defaultCredentialFileRemainsCompatibleWithExistingSmokeTools() {
    assertThat(LocalSmokeServer.envFilePath(null))
        .isEqualTo(Path.of(System.getProperty("java.io.tmpdir"), "wildboy-smoke-env"));
  }

  @Test void explicitlyIsolatedCredentialFileNeverFallsBackToTheLegacyPath() {
    Path isolated = Path.of(System.getProperty("java.io.tmpdir"), "wildboy-redesign-smoke-env");
    assertThat(LocalSmokeServer.envFilePath(isolated.toString())).isEqualTo(isolated.toAbsolutePath().normalize())
        .isNotEqualTo(LocalSmokeServer.envFilePath(null).toAbsolutePath().normalize());
    assertThat(LocalSmokeServer.envFilePath("isolated-qa/credentials"))
        .isEqualTo(Path.of("isolated-qa/credentials").toAbsolutePath().normalize());
  }

  @Test void blankOverrideFailsInsteadOfAccidentallyOverwritingDefaultCredentials() {
    assertThatThrownBy(() -> LocalSmokeServer.envFilePath(" "))
        .isInstanceOf(IllegalArgumentException.class);
  }
}
