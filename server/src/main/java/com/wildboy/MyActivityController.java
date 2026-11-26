package com.wildboy;

import com.wildboy.Models.Page;
import com.wildboy.Models.User;
import java.time.OffsetDateTime;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/me")
public class MyActivityController {
  private final JdbcTemplate db;

  public MyActivityController(JdbcTemplate db) {
    this.db = db;
  }

  public record Entry(
      String kind, String id, String activityId, String title, String status,
      Integer totalCents, OffsetDateTime createdAt) {}

  private static final String RECORDS = """
      SELECT 'FREE' AS kind, r.id, r.activity_id, a.title, r.status,
             NULL::integer AS total_cents, r.created_at
        FROM registration r JOIN activity a ON a.id = r.activity_id
       WHERE r.user_id = ?
      UNION ALL
      SELECT 'ORDER', o.id, o.activity_id, o.activity_title, o.status,
             o.total_cents, o.created_at
        FROM activity_order o
       WHERE o.user_id = ?
      """;

  @GetMapping("/activity-records")
  @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
  public Page<Entry> records(
      @AuthenticationPrincipal User user,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "20") int size) {
    ActivityService.pageCheck(page, size);
    var rows = db.query(
        "SELECT * FROM (" + RECORDS + ") records"
            + " ORDER BY created_at DESC, kind, id LIMIT ? OFFSET ?",
        (r, n) -> new Entry(r.getString("kind"), r.getString("id"), r.getString("activity_id"),
            r.getString("title"), r.getString("status"), r.getObject("total_cents", Integer.class),
            r.getObject("created_at", OffsetDateTime.class)),
        user.id(), user.id(), size, (long) page * size);
    long total = db.queryForObject("""
        SELECT (SELECT COUNT(*) FROM registration WHERE user_id = ?)
             + (SELECT COUNT(*) FROM activity_order WHERE user_id = ?)
        """, Long.class, user.id(), user.id());
    return new Page<>(rows, total, page, size, (long) (page + 1) * size < total);
  }
}
