package com.wildboy;

import java.io.*;
import java.nio.file.*;
import java.util.*;
import javax.imageio.ImageIO;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Service
public class DisplayProfileService {
  static final int MAX_BYTES = 2 * 1024 * 1024;
  /** 头像按 56px 展示；更大的解码只会放大每请求的内存/CPU 开销，无显示收益。 */
  static final int MAX_SIDE = 1024;
  static final long MAX_PIXELS = (long) MAX_SIDE * MAX_SIDE;
  private final JdbcTemplate db;
  private final AuthService auth;
  private final ActivityService activities;
  private final Path root;
  public DisplayProfileService(JdbcTemplate db, AuthService auth, ActivityService activities, MediaService media) {
    this.db = db; this.auth = auth; this.activities = activities; this.root = media.root;
  }

  @Transactional
  public Models.User update(Models.User actor, DisplayProfileController.Input input) {
    if (actor == null) throw new ApiException(401, "UNAUTHENTICATED", "请先登录");
    // Serialize concurrent edits and reload authoritative provenance, never trust client account IDs.
    var current = db.query("SELECT * FROM app_user WHERE id=? FOR UPDATE", AuthService::mapUser, actor.id())
        .stream().findFirst().orElseThrow(() -> new ApiException(401, "UNAUTHENTICATED", "请重新登录"));
    if (current.accountSource() != UserModels.AccountSource.WECHAT || !current.wechatVerified())
      throw new ApiException(403, "WECHAT_PROFILE_ONLY", "请使用微信账号编辑头像昵称");
    String nickname = nickname(input.nickname());
    String encoded = input.avatarBase64();
    boolean hasAvatar = encoded != null && !encoded.isBlank();
    if (nickname == null && !hasAvatar) return current;
    String avatar = null;
    if (hasAvatar) {
      byte[] image = image(encoded);
      String filename = "avatar-" + UUID.randomUUID() + ".png";
      Path path = root.resolve(filename);
      try {
        Files.createDirectories(root);
        Files.write(path, image, StandardOpenOption.CREATE_NEW);
      } catch (IOException e) { remove(path); throw new ApiException(503, "AVATAR_SAVE_FAILED", "头像保存失败，请重试"); }
      avatar = "/assets/uploads/" + filename;
      final String old = current.avatarUrl();
      TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
        @Override public void afterCompletion(int status) {
          if (status != STATUS_COMMITTED) remove(path);
          else if (old != null && old.matches("/assets/uploads/avatar-[0-9a-f-]{36}\\.png"))
            remove(root.resolve(old.substring("/assets/uploads/".length())));
        }
      });
    }
    db.update("UPDATE app_user SET nickname=COALESCE(?,nickname),avatar_url=COALESCE(?,avatar_url),display_profile_updated_at=CURRENT_TIMESTAMP WHERE id=?",
        nickname, avatar, current.id());
    activities.audit(current.id(), current.id(), hasAvatar ? "PROFILE_DISPLAY_AVATAR" : "PROFILE_DISPLAY_UPDATE");
    return auth.byId(current.id());
  }

  static String nickname(String value) {
    if (value == null || value.isBlank()) return null;
    String name = value.strip();
    if (name.codePointCount(0, name.length()) > 40 || name.codePoints().anyMatch(Character::isISOControl))
      throw new ApiException(400, "INVALID_NICKNAME", "昵称最多40个字，不能含控制字符");
    return name;
  }

  static byte[] image(String encoded) {
    if (encoded.length() > 2796204) throw invalidImage();
    final byte[] bytes;
    try { bytes = Base64.getDecoder().decode(encoded); }
    catch (IllegalArgumentException e) { throw invalidImage(); }
    if (bytes.length == 0 || bytes.length > MAX_BYTES) throw invalidImage();
    try (var stream = ImageIO.createImageInputStream(new ByteArrayInputStream(bytes))) {
      var readers = ImageIO.getImageReaders(stream);
      if (!readers.hasNext()) throw invalidImage();
      var reader = readers.next();
      try {
        String format = reader.getFormatName();
        if (!format.equalsIgnoreCase("png") && !format.equalsIgnoreCase("jpeg")) throw invalidImage();
        reader.setInput(stream, true, true);
        int w = reader.getWidth(0), h = reader.getHeight(0);
        // Check dimensions before decoding: compact image bombs must not allocate huge rasters.
        if (w < 1 || h < 1 || w > MAX_SIDE || h > MAX_SIDE || (long) w * h > MAX_PIXELS) throw invalidImage();
        var image = reader.read(0);
        var output = new ByteArrayOutputStream();
        if (image == null || !ImageIO.write(image, "png", output) || output.size() > MAX_BYTES) throw invalidImage();
        return output.toByteArray(); // Strip metadata and trailing/polyglot content.
      } finally { reader.dispose(); }
    } catch (IOException | IllegalArgumentException e) { throw invalidImage(); }
  }
  static ApiException invalidImage() { return new ApiException(400, "INVALID_AVATAR", "头像需为2MB以内、不超过1024×1024的JPG/PNG图片"); }
  private static void remove(Path path) {
    try { Files.deleteIfExists(path); }
    catch (IOException ignored) { /* An orphan is preferable to failing an already committed profile. */ }
  }
}
