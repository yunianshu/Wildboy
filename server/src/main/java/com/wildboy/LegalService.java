package com.wildboy;

import static com.wildboy.LegalModels.*;

import java.time.OffsetDateTime;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class LegalService {
  private final JdbcTemplate db;

  public LegalService(JdbcTemplate db) {
    this.db = db;
  }

  Document map(java.sql.ResultSet r, int n) throws java.sql.SQLException {
    return new Document(
        Kind.valueOf(r.getString("kind")),
        r.getLong("version"),
        r.getString("title"),
        r.getString("content"),
        r.getObject("published_at", OffsetDateTime.class));
  }

  public Document version(Kind kind, long version) {
    return db
        .query(
            "SELECT * FROM legal_document_version WHERE kind=? AND version=?",
            this::map,
            kind.name(),
            version)
        .stream()
        .findFirst()
        .orElseThrow(ApiException::notFound);
  }

  private Document published(Kind kind) {
    return db
        .query(
            "SELECT v.* FROM legal_document_version v JOIN legal_document_state s ON s.kind=v.kind"
                + " AND s.published_version=v.version WHERE v.kind=?",
            this::map,
            kind.name())
        .stream()
        .findFirst()
        .orElse(null);
  }

  public Current current() {
    var rows =
        db.query(
            "SELECT v.* FROM legal_document_version v JOIN legal_document_state s ON s.kind=v.kind"
                + " AND s.published_version=v.version",
            this::map);
    Document p = rows.stream().filter(d -> d.kind() == Kind.PRIVACY).findFirst().orElse(null),
        t = rows.stream().filter(d -> d.kind() == Kind.TERMS).findFirst().orElse(null);
    return new Current(p != null && t != null, p, t);
  }

  public AdminDocument admin(Kind kind) {
    Draft d =
        db.queryForObject(
            "SELECT * FROM legal_document_state WHERE kind=?",
            (r, n) ->
                new Draft(
                    r.getString("draft_title"),
                    r.getString("draft_content"),
                    r.getLong("draft_revision")),
            kind.name());
    return new AdminDocument(kind, d, published(kind));
  }

  public List<Document> versions(Kind kind) {
    return db.query(
        "SELECT * FROM legal_document_version WHERE kind=? ORDER BY version DESC",
        this::map,
        kind.name());
  }

  private void plain(String text) {
    if (text.indexOf('\0') >= 0
        || java.util.regex.Pattern.compile("<\\s*/?\\s*[a-zA-Z][^>]*>").matcher(text).find())
      throw new ApiException(400, "PLAIN_TEXT_ONLY", "协议仅支持纯文本，不支持 HTML 标签");
  }

  @Transactional
  public AdminDocument save(Kind kind, DraftInput in, String actor) {
    plain(in.title());
    plain(in.content());
    if (in.title().isBlank() || in.content().strip().length() < 10)
      throw new ApiException(400, "EMPTY_LEGAL_DOCUMENT", "请先保存完整协议草稿");
    int changed =
        db.update(
            "UPDATE legal_document_state SET"
                + " draft_title=?,draft_content=?,draft_revision=draft_revision+1,updated_at=CURRENT_TIMESTAMP"
                + " WHERE kind=? AND draft_revision=?",
            in.title().strip(),
            in.content().strip(),
            kind.name(),
            in.revision());
    if (changed != 1) throw ApiException.conflict("STALE_VERSION", "草稿已被修改，请刷新后重试");
    audit(actor, kind, "LEGAL_DRAFT_SAVE");
    return admin(kind);
  }

  @Transactional
  public Document publish(Kind kind, long revision, String actor) {
    var row =
        db.queryForMap("SELECT * FROM legal_document_state WHERE kind=? FOR UPDATE", kind.name());
    long rev = ((Number) row.get("draft_revision")).longValue();
    if (rev != revision) throw ApiException.conflict("STALE_VERSION", "草稿已被修改，请刷新后重试");
    String title = (String) row.get("draft_title"), content = (String) row.get("draft_content");
    if (title.isBlank() || content.strip().length() < 10)
      throw new ApiException(400, "EMPTY_LEGAL_DOCUMENT", "请先保存完整协议草稿");
    Document previous = published(kind);
    if (previous != null && previous.title().equals(title) && previous.content().equals(content))
      throw ApiException.conflict("NO_LEGAL_CHANGES", "当前草稿与已发布版本相同");
    long next = previous == null ? 1 : previous.version() + 1;
    db.update(
        "INSERT INTO legal_document_version(kind,version,title,content,published_by)"
            + " VALUES(?,?,?,?,?)",
        kind.name(),
        next,
        title,
        content,
        actor);
    db.update(
        "UPDATE legal_document_state SET"
            + " published_version=?,draft_revision=draft_revision+1,updated_at=CURRENT_TIMESTAMP"
            + " WHERE kind=?",
        next,
        kind.name());
    audit(actor, kind, "LEGAL_PUBLISH");
    return version(kind, next);
  }

  private void audit(String actor, Kind kind, String action) {
    db.update(
        "INSERT INTO audit_event(id,actor_id,entity_id,action) VALUES(?,?,?,?)",
        UUID.randomUUID().toString(),
        actor,
        kind.name(),
        action);
  }

  // A shared lock remains until the caller transaction commits. Publication cannot race past
  // consent/registration.
  public void requireCurrent(Long privacy, Long terms) {
    db.queryForList("SELECT kind FROM legal_document_state ORDER BY kind FOR SHARE");
    Current c = current();
    if (!c.ready()) throw new ApiException(503, "LEGAL_NOT_READY", "隐私政策与用户协议尚未发布，请稍后重试");
    if (privacy == null
        || terms == null
        || privacy != c.privacy().version()
        || terms != c.terms().version())
      throw ApiException.conflict("LEGAL_VERSION_CHANGED", "协议已更新，请重新阅读并确认");
  }

  @Transactional
  public void accept(String user, Long privacy, Long terms, String source) {
    requireCurrent(privacy, terms);
    db.update(
        "INSERT INTO legal_consent(id,user_id,privacy_version,terms_version,source)"
            + " VALUES(?,?,?,?,?) ON CONFLICT(user_id,privacy_version,terms_version) DO NOTHING",
        UUID.randomUUID().toString(),
        user,
        privacy,
        terms,
        source);
  }

  public ConsentState consentState(String user) {
    Current c = current();
    Accepted a =
        db
            .query(
                "SELECT privacy_version,terms_version,accepted_at FROM legal_consent WHERE"
                    + " user_id=? ORDER BY accepted_at DESC,id DESC LIMIT 1",
                (r, n) ->
                    new Accepted(r.getLong(1), r.getLong(2), r.getObject(3, OffsetDateTime.class)),
                user)
            .stream()
            .findFirst()
            .orElse(null);
    return new ConsentState(
        c.ready(),
        new Versions(
            c.privacy() == null ? null : c.privacy().version(),
            c.terms() == null ? null : c.terms().version()),
        a,
        !c.ready()
            || a == null
            || a.privacyVersion() != c.privacy().version()
            || a.termsVersion() != c.terms().version());
  }
}
