package com.wildboy;

import static com.wildboy.HomeLayoutModels.*;
import static com.wildboy.Models.*;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import java.time.OffsetDateTime;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
class HomeLayoutAndActivityUpgradeTest {
  static final EmbeddedPostgres pg;

  static {
    try {
      pg = EmbeddedPostgres.builder().setServerConfig("unix_socket_directories", "").start();
    } catch (Exception e) {
      throw new ExceptionInInitializerError(e);
    }
  }

  @DynamicPropertySource
  static void properties(DynamicPropertyRegistry r) {
    r.add("spring.datasource.url", () -> pg.getJdbcUrl("postgres", "postgres"));
    r.add("spring.datasource.username", () -> "postgres");
    r.add("spring.datasource.password", () -> "");
    r.add(
        "wildboy.identity.encryption-key",
        () -> Base64.getEncoder().encodeToString(new byte[32]));
  }

  @Autowired AuthService auth;
  @Autowired JdbcTemplate db;
  @Autowired MockMvc mvc;
  @Autowired ObjectMapper json;
  @Autowired HomeLayoutService homeLayout;
  @Autowired ActivityService activities;
  @Autowired ActivityOrderService activityOrders;
  @Autowired TemplateService templates;
  @Autowired LegalService legal;
  @Autowired GeoLocationService geo;

  String adminHeader;
  String actorId;

  @BeforeEach
  void setup() {
    var adminUser = auth.user("upgrade-admin:" + UUID.randomUUID(), "Admin", "ADMIN");
    actorId = adminUser.id();
    adminHeader = "Bearer " + auth.login(adminUser).token();
    for (var kind : LegalModels.Kind.values()) {
      var state = legal.admin(kind);
      if (state.published() == null) {
        var draft =
            legal.save(
                kind,
                new LegalModels.DraftInput("Policy " + kind, "Synthetic policy text", state.draft().revision()),
                actorId);
        legal.publish(kind, draft.draft().revision(), actorId);
      }
    }
  }

  @AfterAll
  static void cleanup() throws Exception {
    pg.close();
  }

  Activity createPublished(String title, int daysAhead, List<NavigationPoint> navPoints) {
    var start = OffsetDateTime.now().plusDays(daysAhead);
    var draft =
        activities.create(
            new ActivityInput(
                title,
                Category.WEEKLY,
                "/assets/category-weekly.jpg",
                List.of(),
                "Summary " + title,
                "Desc " + title,
                "厦门山野",
                "地铁口集合",
                start,
                start.plusHours(5),
                start.minusHours(12),
                20,
                0,
                null,
                false,
                navPoints.stream()
                    .filter(p -> "BOARDING".equals(p.kind()))
                    .map(NavigationPoint::label)
                    .toList(),
                navPoints),
            actorId);
    return activities.publish(draft.id(), draft.version(), actorId);
  }

  @Test
  void modularHomeLayoutSupportsDragOrderedActivitiesMultiQrWechatArticleAndFooterBrand()
      throws Exception {
    var a1 = createPublished("第一场山野", 10, List.of());
    var a2 = createPublished("第二场山野", 3, List.of());
    var a3 = createPublished("第三场山野", 6, List.of());

    LayoutConfig current = homeLayout.get(true);
    // Reorder modules + pin [a1, a3] in custom order + configure multi-QR popup + WeChat OA link + footer follow & brand size
    var modules =
        List.of(
            new ModuleEntry("HERO", true),
            new ModuleEntry("ACTIVITIES", true),
            new ModuleEntry("SHORTCUTS", true),
            new ModuleEntry("SHOP", false),
            new ModuleEntry("GALLERY", true),
            new ModuleEntry("FOOTER", true));
    var shortcuts =
        new ShortcutsConfig(
            3,
            List.of(
                new ShortcutItem(
                    "s1",
                    "扫码进群",
                    "QRCODE",
                    "/assets/category-holiday.jpg",
                    "POPUP",
                    "",
                    "",
                    "",
                    "",
                    "扫码联系我们",
                    "欢迎添加领队与活动群",
                    "",
                    List.of(
                        new QrImage("/assets/equipment.jpg", "领队微信"),
                        new QrImage("/assets/hero-hiking.jpg", "山野交流群"))),
                new ShortcutItem(
                    "s2",
                    "关于野小子",
                    "INTRO",
                    "",
                    "WECHAT_ARTICLE",
                    "",
                    "",
                    "",
                    "https://mp.weixin.qq.com/s/AbCdEfGh123456",
                    "",
                    "",
                    "",
                    List.of()),
                new ShortcutItem(
                    "s3", "本周山野", "WEEKLY", "", "PAGE", "WEEKLY", "", "", "", "", "", "", List.of())));
    var actCfg =
        new ActivitiesConfig(
            "FEATURED", "精选六场路线", true, 6, true, List.of(a1.id(), a3.id()));
    var footer =
        new FooterConfig(
            true,
            "扫码关注野小子公众号",
            "第一时间获取周末路线",
            List.of(
                new QrImage("/assets/equipment.jpg", "公众号"),
                new QrImage("/assets/category-leisure.jpg", "客服二维码")),
            true,
            "/assets/hero-hiking.jpg",
            280);
    var updated =
        new LayoutConfig(
            current.version(),
            modules,
            current.hero(),
            shortcuts,
            actCfg,
            current.shop(),
            current.gallery(),
            footer);

    mvc.perform(
            put("/api/v1/admin/home/layout")
                .header("Authorization", adminHeader)
                .contentType("application/json")
                .content(json.writeValueAsString(updated)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.version").value(current.version() + 1))
        .andExpect(jsonPath("$.modules[1].id").value("ACTIVITIES"))
        .andExpect(jsonPath("$.shortcuts.items[0].popupImages.length()").value(2))
        .andExpect(
            jsonPath("$.shortcuts.items[1].wechatArticleUrl")
                .value("https://mp.weixin.qq.com/s/AbCdEfGh123456"))
        .andExpect(jsonPath("$.footer.brandWidthPx").value(280));

    // Verify public layout resolves pinned activities first (a1 before a3, then auto-filled a2!)
    var publicResp = homeLayout.publicHome();
    assertThat(publicResp.featuredActivities().stream().map(Activity::id).toList())
        .startsWith(a1.id(), a3.id())
        .contains(a2.id());

    // Reject non-mp.weixin.qq.com URLs for WECHAT_ARTICLE
    var badShortcuts =
        new ShortcutsConfig(
            4,
            List.of(
                new ShortcutItem(
                    "bad",
                    "野小子",
                    "INTRO",
                    "",
                    "WECHAT_ARTICLE",
                    "",
                    "",
                    "",
                    "https://evil.example.com/s/123",
                    "",
                    "",
                    "",
                    List.of())));
    var latest = homeLayout.get(true);
    var invalid =
        new LayoutConfig(
            latest.version(),
            latest.modules(),
            latest.hero(),
            badShortcuts,
            latest.activities(),
            latest.shop(),
            latest.gallery(),
            latest.footer());
    mvc.perform(
            put("/api/v1/admin/home/layout")
                .header("Authorization", adminHeader)
                .contentType("application/json")
                .content(json.writeValueAsString(invalid)))
        .andExpect(status().isBadRequest());
  }

  @Test
  void navigationPointsAttendeesCancelledEditAndOneClickCopyPublishWork() throws Exception {
    var navs =
        List.of(
            new NavigationPoint(
                "n1", "DESTINATION", "天竺山森林公园", "厦门市海沧区天竺山路1号", 24.581234, 117.921234),
            new NavigationPoint(
                "n2", "BOARDING", "岛内SM城市广场", "厦门市湖里区嘉禾路468号", 24.501111, 118.126666),
            new NavigationPoint(
                "n3", "BOARDING", "海沧阿罗海广场", "厦门市海沧区滨湖北二路", 24.484444, 118.033333));
    var published = createPublished("多上车点徒步", 5, navs);
    assertThat(published.navigationPoints()).hasSize(3);

    // Boarding point locations catalog automatically remembered coordinates
    var savedCatalog = activities.listBoardingPointLocations();
    assertThat(savedCatalog)
        .anySatisfy(
            loc -> {
              assertThat(loc.name()).isEqualTo("岛内SM城市广场");
              assertThat(loc.latitude()).isEqualTo(24.501111);
            });

    // Coordinate & link parser works without external API key
    assertThat(geo.parseCoordinateOrLink("24.479834, 118.089425"))
        .isPresent()
        .get()
        .satisfies(
            c -> {
              assertThat(c.latitude()).isEqualTo(24.479834);
              assertThat(c.longitude()).isEqualTo(118.089425);
            });

    // Register user with avatar & nickname and verify public attendees endpoint hides PII
    var hiker = auth.user("fixture:hiker-" + UUID.randomUUID(), "山野阿哲", "USER");
    db.update(
        "UPDATE app_user SET avatar_url='/assets/hero-hiking.jpg', real_name='张三隐私姓名', phone='13912345678' WHERE id=?",
        hiker.id());
    long pVer = legal.current().privacy().version();
    long tVer = legal.current().terms().version();
    activities.register(
        published.id(),
        hiker.id(),
        new RegistrationInput(
            List.of(
                new ParticipantInput("张三隐私姓名", "", "13912345678", "岛内SM城市广场"),
                new ParticipantInput("李四同行", "", "13987654321", "海沧阿罗海广场")),
            pVer,
            tVer));

    String body =
        mvc.perform(get("/api/v1/activities/" + published.id() + "/attendees"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.totalParticipants").value(2))
            .andExpect(jsonPath("$.totalUsers").value(1))
            .andExpect(jsonPath("$.items[0].nickname").value("山野阿哲"))
            .andExpect(jsonPath("$.items[0].avatarUrl").value("/assets/hero-hiking.jpg"))
            .andExpect(jsonPath("$.items[0].partySize").value(2))
            .andReturn()
            .getResponse()
            .getContentAsString();
    assertThat(body).doesNotContain("张三隐私姓名").doesNotContain("13912345678").doesNotContain(hiker.id());

    // One-click copy & publishImmediately for reusing an activity on a new date
    var current = activities.get(published.id(), true);
    var nextWeek = OffsetDateTime.now().plusDays(14);
    var reopened =
        templates.copy(
            current.id(),
            new TemplateService.Copy(nextWeek, "reuse-req-1", current.version(), true),
            actorId);
    assertThat(reopened.status()).isEqualTo("PUBLISHED");
    assertThat(reopened.navigationPoints()).hasSize(3);
    assertThat(reopened.registeredCount()).isZero();

    // Cancelled activity can still be edited anytime and reopened to draft
    var toCancel = createPublished("可编辑取消活动", 4, List.of());
    var cancelled = activities.cancel(toCancel.id(), toCancel.version(), actorId);
    var editedCancelled =
        activities.edit(
            cancelled.id(),
            new ActivityInput(
                "取消后修改标题",
                cancelled.category(),
                cancelled.coverUrl(),
                cancelled.galleryUrls(),
                cancelled.summary(),
                cancelled.description(),
                cancelled.location(),
                cancelled.meetingPoint(),
                cancelled.startAt(),
                cancelled.endAt(),
                cancelled.registrationDeadline(),
                cancelled.capacity(),
                0,
                cancelled.version(),
                cancelled.identityRequired(),
                cancelled.boardingPoints(),
                cancelled.navigationPoints()),
            actorId);
    assertThat(editedCancelled.title()).isEqualTo("取消后修改标题");
    var reopenedDraft = activities.reopenToDraft(editedCancelled.id(), editedCancelled.version(), actorId);
    assertThat(reopenedDraft.status()).isEqualTo("DRAFT");

    // Price can also be edited on published activity with 0 registrations
    var zeroSignupPub = createPublished("可改价已发布活动", 8, List.of());
    var repriced = activityOrders.setPrice(zeroSignupPub.id(), 8800, zeroSignupPub.version(), actorId);
    assertThat(repriced.priceCents()).isEqualTo(8800);
  }
}
