package com.wildboy;

import java.io.*;
import java.nio.ByteBuffer;
import java.nio.file.*;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import javax.imageio.ImageIO;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class MediaService {
  static final int MAX_BYTES = 4 * 1024 * 1024;
  static final long MAX_VIDEO_BYTES = 30L * 1024 * 1024;
  static final Set<String> CATEGORIES = Set.of("ACTIVITY", "SHOP", "ARTICLE", "HOME", "UNCATEGORIZED");
  private static final Pattern MEDIA_FILE = Pattern.compile("[0-9a-f-]{36}\\.png");
  private static final Logger log = LoggerFactory.getLogger(MediaService.class);
  final Path root;
  private final JdbcTemplate db;

  public record MediaAsset(
      String id,
      String filename,
      String url,
      String name,
      String category,
      int width,
      int height,
      long sizeBytes,
      Instant createdAt,
      Instant updatedAt) {}

  public record MediaReference(String type, String id, String label) {}

  public record MediaReferenceCheck(boolean referenced, List<MediaReference> references) {}

  public record MediaPage(
      List<MediaAsset> items,
      long total,
      int page,
      int size,
      boolean hasMore,
      Map<String, Long> counts) {}

  public record VideoUploadResult(String url, String filename, long sizeBytes) {}

  @Autowired
  public MediaService(
      @Value("${wildboy.media-dir:./data/media}") String directory,
      JdbcTemplate db) {
    this.root = Path.of(directory).toAbsolutePath().normalize();
    this.db = db;
  }

  public MediaService(String directory) {
    this(directory, null);
  }

  Path root() {
    return root;
  }

  String storeImage(byte[] bytes) {
    return storeMedia(bytes, null, null).url();
  }

  MediaAsset storeMedia(byte[] bytes, String rawName, String rawCategory) {
    if (bytes.length == 0 || bytes.length > MAX_BYTES) throw invalid();
    String category = normalizeCategory(rawCategory);
    try (var stream = ImageIO.createImageInputStream(new ByteArrayInputStream(bytes))) {
      var readers = ImageIO.getImageReaders(stream);
      if (!readers.hasNext()) throw invalid();
      var reader = readers.next();
      try {
        String format = reader.getFormatName();
        if (!format.equalsIgnoreCase("png") && !format.equalsIgnoreCase("jpeg")) throw invalid();
        reader.setInput(stream, true, true);
        int w = reader.getWidth(0), h = reader.getHeight(0);
        if (w < 1 || h < 1 || w > 6000 || h > 6000 || (long) w * h > 16000000) throw invalid();
        var image = reader.read(0);
        var output = new ByteArrayOutputStream();
        if (!ImageIO.write(image, "png", output) || output.size() > MAX_BYTES) throw invalid();
        byte[] encoded = output.toByteArray();
        Files.createDirectories(root);
        String id = UUID.randomUUID().toString();
        String filename = id + ".png";
        String url = "/assets/uploads/" + filename;
        String name = normalizeName(rawName, "图片 " + id.substring(0, 8));
        Files.write(root.resolve(filename), encoded, StandardOpenOption.CREATE_NEW);
        Instant now = Instant.now();
        if (db != null) {
          try {
            db.update(
                "INSERT INTO media_asset(id, filename, url, name, category, width, height, size_bytes, created_at, updated_at) "
                    + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                id, filename, url, name, category, w, h, (long) encoded.length,
                Timestamp.from(now), Timestamp.from(now));
          } catch (RuntimeException e) {
            try { Files.deleteIfExists(root.resolve(filename)); } catch (IOException ignored) {}
            throw e;
          }
        }
        return new MediaAsset(id, filename, url, name, category, w, h, encoded.length, now, now);
      } finally { reader.dispose(); }
    } catch (IOException e) {
      log.error("图片保存失败 media-dir={}", root, e);
      throw new ApiException(503, "UPLOAD_FAILED", "图片保存失败，请重试");
    }
  }

  VideoUploadResult storeVideo(org.springframework.web.multipart.MultipartFile file) {
    if (file == null || file.isEmpty() || file.getSize() > MAX_VIDEO_BYTES) {
      throw invalidVideo();
    }
    byte[] head = new byte[12];
    int read;
    try (InputStream in = file.getInputStream()) {
      read = in.readNBytes(head, 0, head.length);
    } catch (IOException e) {
      throw invalidVideo();
    }
    String ext = detectVideoExtension(head, read);
    if (ext == null) throw invalidVideo();
    try {
      Files.createDirectories(root);
      String filename = "video-" + UUID.randomUUID() + "." + ext;
      Path dest = root.resolve(filename);
      try (InputStream in = file.getInputStream()) {
        Files.copy(in, dest, StandardCopyOption.REPLACE_EXISTING);
      }
      long sizeBytes = Files.size(dest);
      if (sizeBytes <= 0 || sizeBytes > MAX_VIDEO_BYTES) {
        Files.deleteIfExists(dest);
        throw invalidVideo();
      }
      return new VideoUploadResult("/assets/uploads/" + filename, filename, sizeBytes);
    } catch (ApiException e) {
      throw e;
    } catch (IOException e) {
      log.error("短视频保存失败 media-dir={}", root, e);
      throw new ApiException(503, "UPLOAD_FAILED", "短视频保存失败，请重试");
    }
  }

  private static String detectVideoExtension(byte[] head, int read) {
    if (read >= 12
        && head[4] == 'f'
        && head[5] == 't'
        && head[6] == 'y'
        && head[7] == 'p') {
      if (head[8] == 'q' && head[9] == 't' && head[10] == ' ' && head[11] == ' ') {
        return "mov";
      }
      return "mp4";
    }
    if (read >= 4
        && (head[0] & 0xFF) == 0x1A
        && (head[1] & 0xFF) == 0x45
        && (head[2] & 0xFF) == 0xDF
        && (head[3] & 0xFF) == 0xA3) {
      return "webm";
    }
    return null;
  }

  static ApiException invalidVideo() {
    return new ApiException(400, "INVALID_VIDEO", "请上传有效的 MP4 / MOV / WebM 短视频（最大 30 MB）");
  }

  public MediaPage list(String categoryFilter, String query, int page, int size) {
    syncExistingFiles();
    int safePage = Math.max(0, page);
    int safeSize = Math.min(60, Math.max(1, size));
    String category = (categoryFilter == null || categoryFilter.isBlank() || "ALL".equalsIgnoreCase(categoryFilter))
        ? null : normalizeCategory(categoryFilter);
    String q = query == null ? "" : query.strip();

    StringBuilder where = new StringBuilder(" WHERE 1=1");
    List<Object> params = new ArrayList<>();
    if (category != null) {
      where.append(" AND category = ?");
      params.add(category);
    }
    if (!q.isEmpty()) {
      where.append(" AND (LOWER(name) LIKE LOWER(?) OR LOWER(filename) LIKE LOWER(?))");
      String like = "%" + escapeLike(q) + "%";
      params.add(like);
      params.add(like);
    }

    Long totalObj = db.queryForObject("SELECT COUNT(*) FROM media_asset" + where, Long.class, params.toArray());
    long total = totalObj == null ? 0L : totalObj;

    List<Object> pageParams = new ArrayList<>(params);
    pageParams.add(safeSize + 1);
    pageParams.add((long) safePage * safeSize);
    List<MediaAsset> rows = db.query(
        "SELECT id, filename, url, name, category, width, height, size_bytes, created_at, updated_at "
            + "FROM media_asset" + where + " ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?",
        MediaService::mapAsset,
        pageParams.toArray());
    boolean hasMore = rows.size() > safeSize;
    List<MediaAsset> items = hasMore ? rows.subList(0, safeSize) : rows;

    Map<String, Long> counts = new LinkedHashMap<>();
    long allCount = 0L;
    for (String c : List.of("ACTIVITY", "SHOP", "ARTICLE", "HOME", "UNCATEGORIZED")) {
      counts.put(c, 0L);
    }
    for (var row : db.queryForList("SELECT category, COUNT(*) AS cnt FROM media_asset GROUP BY category")) {
      String c = String.valueOf(row.get("category"));
      long cnt = ((Number) row.get("cnt")).longValue();
      counts.put(c, cnt);
      allCount += cnt;
    }
    counts.put("ALL", allCount);

    return new MediaPage(items, total, safePage, safeSize, hasMore, counts);
  }

  @Transactional
  public MediaAsset update(String id, String rawName, String rawCategory) {
    MediaAsset existing = findById(id);
    String name = rawName == null ? existing.name() : requireValidName(rawName);
    String category = rawCategory == null || rawCategory.isBlank()
        ? existing.category() : normalizeCategory(rawCategory);
    Instant now = Instant.now();
    db.update(
        "UPDATE media_asset SET name = ?, category = ?, updated_at = ? WHERE id = ?",
        name, category, Timestamp.from(now), id);
    return new MediaAsset(
        existing.id(), existing.filename(), existing.url(), name, category,
        existing.width(), existing.height(), existing.sizeBytes(), existing.createdAt(), now);
  }

  public MediaReferenceCheck references(String id) {
    MediaAsset asset = findById(id);
    List<MediaReference> refs = findReferencesByUrl(asset.url());
    return new MediaReferenceCheck(!refs.isEmpty(), refs);
  }

  @Transactional
  public void delete(String id) {
    MediaAsset asset = findById(id);
    List<MediaReference> refs = findReferencesByUrl(asset.url());
    if (!refs.isEmpty()) {
      String preview = refs.stream().limit(3).map(MediaReference::label).collect(Collectors.joining("、"));
      String suffix = refs.size() > 3 ? " 等 " + refs.size() + " 处" : "";
      throw new ApiException(
          409,
          "MEDIA_IN_USE",
          "该图片正在被使用（" + preview + suffix + "），请先替换相关引用后再删除");
    }
    int deleted = db.update("DELETE FROM media_asset WHERE id = ?", id);
    if (deleted == 0) throw ApiException.notFound();
    try {
      Files.deleteIfExists(root.resolve(asset.filename()));
    } catch (IOException e) {
      log.warn("删除本地图片文件失败 file={}", asset.filename(), e);
    }
  }

  void syncExistingFiles() {
    if (db == null || !Files.isDirectory(root)) return;
    Set<String> known = new HashSet<>(db.queryForList("SELECT filename FROM media_asset", String.class));
    try (var stream = Files.list(root)) {
      for (Path path : stream.toList()) {
        String filename = path.getFileName().toString();
        if (known.contains(filename) || !MEDIA_FILE.matcher(filename).matches() || !Files.isRegularFile(path)) {
          continue;
        }
        try {
          long sizeBytes = Files.size(path);
          if (sizeBytes <= 0 || sizeBytes > MAX_BYTES) continue;
          int[] dims = readPngDimensions(path);
          Instant mtime = Files.getLastModifiedTime(path).toInstant();
          String id = filename.substring(0, filename.length() - 4);
          String url = "/assets/uploads/" + filename;
          String category = inferCategory(findReferencesByUrl(url));
          String name = "历史图片 " + id.substring(0, 8);
          db.update(
              "INSERT INTO media_asset(id, filename, url, name, category, width, height, size_bytes, created_at, updated_at) "
                  + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (filename) DO NOTHING",
              id, filename, url, name, category, dims[0], dims[1], sizeBytes,
              Timestamp.from(mtime), Timestamp.from(mtime));
        } catch (IOException e) {
          log.warn("索引历史图片失败 file={}", filename, e);
        }
      }
    } catch (IOException e) {
      log.warn("扫描图片目录失败 dir={}", root, e);
    }
  }

  private MediaAsset findById(String id) {
    if (db == null || id == null || id.isBlank()) throw ApiException.notFound();
    return db.query(
            "SELECT id, filename, url, name, category, width, height, size_bytes, created_at, updated_at "
                + "FROM media_asset WHERE id = ?",
            MediaService::mapAsset,
            id)
        .stream()
        .findFirst()
        .orElseThrow(ApiException::notFound);
  }

  List<MediaReference> findReferencesByUrl(String url) {
    if (db == null || url == null || url.isBlank()) return List.of();
    String like = "%" + url + "%";
    List<MediaReference> refs = new ArrayList<>();

    db.query(
        "SELECT id, title FROM activity WHERE cover_url = ? OR gallery_urls LIKE ? ORDER BY updated_at DESC LIMIT 20",
        rs -> { refs.add(new MediaReference("ACTIVITY", rs.getString("id"), "活动《" + rs.getString("title") + "》")); },
        url, like);

    db.query(
        "SELECT id, name FROM activity_template WHERE payload LIKE ? OR rich_blocks LIKE ? OR rich_markdown LIKE ? ORDER BY updated_at DESC LIMIT 20",
        rs -> { refs.add(new MediaReference("ACTIVITY_TEMPLATE", rs.getString("id"), "活动模板《" + rs.getString("name") + "》")); },
        like, like, like);

    db.query(
        "SELECT id, name FROM product WHERE image_url = ? ORDER BY updated_at DESC LIMIT 20",
        rs -> { refs.add(new MediaReference("PRODUCT", rs.getString("id"), "商品《" + rs.getString("name") + "》")); },
        url);

    db.query(
        "SELECT rc.entity_type, rc.entity_id, "
            + "CASE WHEN rc.entity_type = 'activity' THEN COALESCE(a.title, rc.entity_id) "
            + "WHEN rc.entity_type = 'product' THEN COALESCE(p.name, rc.entity_id) "
            + "ELSE rc.entity_id END AS label "
            + "FROM rich_content rc "
            + "LEFT JOIN activity a ON rc.entity_type = 'activity' AND a.id = rc.entity_id "
            + "LEFT JOIN product p ON rc.entity_type = 'product' AND p.id = rc.entity_id "
            + "WHERE rc.blocks LIKE ? OR rc.markdown LIKE ? LIMIT 20",
        rs -> {
          String entityType = rs.getString("entity_type");
          String entityId = rs.getString("entity_id");
          String label = rs.getString("label");
          if ("activity".equals(entityType)) {
            refs.add(new MediaReference("ACTIVITY_CONTENT", entityId, "活动图文《" + label + "》"));
          } else if ("product".equals(entityType)) {
            refs.add(new MediaReference("PRODUCT_CONTENT", entityId, "商品详情《" + label + "》"));
          } else {
            refs.add(new MediaReference("RICH_CONTENT", entityId, "图文内容《" + label + "》"));
          }
        },
        like, like);

    db.query(
        "SELECT id, title FROM article WHERE cover_url = ? OR blocks LIKE ? OR markdown LIKE ? ORDER BY updated_at DESC LIMIT 20",
        rs -> { refs.add(new MediaReference("ARTICLE", rs.getString("id"), "文章《" + rs.getString("title") + "》")); },
        url, like, like);

    db.query(
        "SELECT id FROM home_page_settings WHERE config_json LIKE ?",
        rs -> { refs.add(new MediaReference("HOME_LAYOUT", "1", "首页配置")); },
        like);

    db.query(
        "SELECT id FROM home_shortcut_settings WHERE items LIKE ?",
        rs -> { refs.add(new MediaReference("HOME_SHORTCUTS", "1", "首页快捷入口")); },
        like);

    return refs;
  }

  private static String inferCategory(List<MediaReference> refs) {
    for (MediaReference ref : refs) {
      switch (ref.type()) {
        case "ACTIVITY", "ACTIVITY_TEMPLATE", "ACTIVITY_CONTENT" -> { return "ACTIVITY"; }
        case "PRODUCT", "PRODUCT_CONTENT" -> { return "SHOP"; }
        case "ARTICLE" -> { return "ARTICLE"; }
        case "HOME_LAYOUT", "HOME_SHORTCUTS" -> { return "HOME"; }
        default -> {}
      }
    }
    return "UNCATEGORIZED";
  }

  private static int[] readPngDimensions(Path path) {
    try (var in = Files.newInputStream(path)) {
      byte[] header = in.readNBytes(24);
      if (header.length >= 24
          && (header[0] & 0xff) == 137 && header[1] == 80 && header[2] == 78 && header[3] == 71
          && header[12] == 'I' && header[13] == 'H' && header[14] == 'D' && header[15] == 'R') {
        ByteBuffer buf = ByteBuffer.wrap(header);
        int w = buf.getInt(16);
        int h = buf.getInt(20);
        if (w > 0 && h > 0) return new int[] {w, h};
      }
    } catch (IOException ignored) {}
    return new int[] {0, 0};
  }

  static String normalizeCategory(String raw) {
    if (raw == null || raw.isBlank()) return "UNCATEGORIZED";
    String upper = raw.strip().toUpperCase(Locale.ROOT);
    if (!CATEGORIES.contains(upper)) {
      throw new ApiException(400, "INVALID_MEDIA_CATEGORY", "不支持的素材分类");
    }
    return upper;
  }

  static String normalizeName(String raw, String fallback) {
    if (raw == null) return fallback;
    String cleaned = raw.strip().replaceAll("[\\p{Cntrl}]", "");
    if (cleaned.isEmpty()) return fallback;
    if (cleaned.length() > 120) cleaned = cleaned.substring(0, 120);
    return cleaned;
  }

  static String requireValidName(String raw) {
    String cleaned = raw.strip();
    if (cleaned.isEmpty() || cleaned.length() > 120 || cleaned.codePoints().anyMatch(Character::isISOControl)) {
      throw new ApiException(400, "INVALID_MEDIA_NAME", "图片名称需为 1-120 个有效字符");
    }
    return cleaned;
  }

  private static String escapeLike(String value) {
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
  }

  private static MediaAsset mapAsset(ResultSet rs, int rowNum) throws SQLException {
    return new MediaAsset(
        rs.getString("id"),
        rs.getString("filename"),
        rs.getString("url"),
        rs.getString("name"),
        rs.getString("category"),
        rs.getInt("width"),
        rs.getInt("height"),
        rs.getLong("size_bytes"),
        rs.getTimestamp("created_at").toInstant(),
        rs.getTimestamp("updated_at").toInstant());
  }

  static ApiException invalid() {
    return new ApiException(400, "INVALID_IMAGE", "仅支持 4MB 内的 JPG/PNG 图片，最大 1600 万像素");
  }
}
