package com.wildboy;

import static com.wildboy.HomeLayoutModels.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class HomeLayoutService {
  private static final List<String> MODULE_IDS =
      List.of("HERO", "SHORTCUTS", "ACTIVITIES", "SHOP", "GALLERY", "FOOTER");
  private static final Set<String> ICONS = Set.of("WEEKLY", "DOMESTIC", "QRCODE", "INTRO");
  private static final Set<String> PAGES =
      Set.of("WEEKLY", "DOMESTIC", "HOLIDAY", "LEISURE", "ACTIVITIES", "SHOP", "PROFILE");
  private static final String UUID_REGEX =
      "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
  private static final String DEFAULT_BRAND_IMAGE =
      "/assets/platform-brand-original-transparent.png";

  private final JdbcTemplate db;
  private final ObjectMapper json;
  private final ActivityService activities;
  private final ShopService shop;

  public HomeLayoutService(
      JdbcTemplate db, ObjectMapper json, ActivityService activities, ShopService shop) {
    this.db = db;
    this.json = json;
    this.activities = activities;
    this.shop = shop;
  }

  private static String clean(String s) {
    return s == null ? "" : s.strip();
  }

  private static void bad(String msg) {
    throw new ApiException(400, "INVALID_HOME_LAYOUT", msg);
  }

  static boolean validWechatArticleUrl(String value) {
    if (value == null || value.length() > 2048) return false;
    if (value.chars().anyMatch(c -> Character.isWhitespace(c) || c == '<' || c == '>' || c == '"' || c == '\'' || c == '\\' || c == '@'))
      return false;
    if (!(value.startsWith("https://mp.weixin.qq.com/s/")
        || value.startsWith("https://mp.weixin.qq.com/s?"))) return false;
    try {
      URI uri = URI.create(value);
      return "https".equals(uri.getScheme())
          && "mp.weixin.qq.com".equals(uri.getHost())
          && uri.getUserInfo() == null;
    } catch (IllegalArgumentException e) {
      return false;
    }
  }

  public LayoutConfig get(boolean admin) {
    var stored =
        db.queryForObject(
            "SELECT version, config_json FROM home_page_settings WHERE id=1",
            (r, n) -> {
              try {
                LayoutConfig raw = json.readValue(r.getString(2), LayoutConfig.class);
                return new LayoutConfig(
                    r.getLong(1),
                    raw.modules(),
                    raw.hero(),
                    raw.shortcuts(),
                    raw.activities(),
                    raw.shop(),
                    raw.gallery(),
                    raw.footer());
              } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
                throw new IllegalStateException("Invalid home_page_settings JSON", e);
              }
            });
    return admin ? stored : sanitizePublicLayout(stored);
  }

  public PublicHomeResponse publicHome() {
    LayoutConfig layout = get(false);
    List<Models.Activity> resolvedActivities = resolveFeaturedActivities(layout.activities());
    List<Map<String, Object>> resolvedEquipment = resolveFeaturedEquipment(layout.shop());
    return new PublicHomeResponse(layout, resolvedActivities, resolvedEquipment);
  }

  private List<Models.Activity> resolveFeaturedActivities(ActivitiesConfig cfg) {
    int maxCount = cfg == null || cfg.maxCount() == null ? 6 : Math.clamp(cfg.maxCount(), 1, 12);
    boolean autoFill = cfg == null || cfg.autoFill() == null || cfg.autoFill();
    List<String> featuredIds =
        cfg == null || cfg.featuredActivityIds() == null ? List.of() : cfg.featuredActivityIds();

    var result = new ArrayList<Models.Activity>();
    var seen = new HashSet<String>();

    for (String id : featuredIds) {
      if (result.size() >= maxCount) break;
      if (id == null || id.isBlank() || !seen.add(id)) continue;
      try {
        Models.Activity a = activities.get(id, false);
        if ("PUBLISHED".equals(a.status())) {
          result.add(a);
        }
      } catch (ApiException ignored) {
        // Skip unpublished or deleted activity safely
      }
    }

    if (autoFill && result.size() < maxCount) {
      // Prefer upcoming published activities first, then fallback to other published activities
      var upcoming =
          db.query(
              """
              SELECT a.*, COALESCE((SELECT SUM(o.party_size) FROM activity_order o
                WHERE o.activity_id=a.id AND o.status='PENDING_PAYMENT'), 0) AS pending_payment_count
              FROM activity a
              WHERE a.status='PUBLISHED'
              ORDER BY (a.start_at < CURRENT_TIMESTAMP) ASC, a.start_at ASC, a.id ASC
              LIMIT 24
              """,
              activities::map);
      for (Models.Activity a : upcoming) {
        if (result.size() >= maxCount) break;
        if (seen.add(a.id())) {
          result.add(a);
        }
      }
    }
    return result;
  }

  private List<Map<String, Object>> resolveFeaturedEquipment(ShopConfig cfg) {
    int maxCount = cfg == null || cfg.maxCount() == null ? 4 : Math.clamp(cfg.maxCount(), 1, 8);
    boolean autoFill = cfg == null || cfg.autoFill() == null || cfg.autoFill();
    List<String> featuredIds =
        cfg == null || cfg.featuredProductIds() == null ? List.of() : cfg.featuredProductIds();

    var onSale = shop.products(false);
    var byId = new LinkedHashMap<String, ShopModels.Product>();
    for (var p : onSale) byId.put(p.id(), p);

    var chosen = new ArrayList<ShopModels.Product>();
    var seen = new HashSet<String>();
    for (String id : featuredIds) {
      if (chosen.size() >= maxCount) break;
      var product = byId.get(id);
      if (product != null && seen.add(product.id())) {
        chosen.add(product);
      }
    }
    if (autoFill && chosen.size() < maxCount) {
      for (var product : onSale) {
        if (chosen.size() >= maxCount) break;
        if (seen.add(product.id())) {
          chosen.add(product);
        }
      }
    }
    return chosen.stream()
        .map(
            product ->
                Map.<String, Object>of(
                    "id", product.id(),
                    "name", product.name(),
                    "imageUrl", product.imageUrl(),
                    "description", product.description(),
                    "categoryName", product.categoryName() == null ? "" : product.categoryName(),
                    "priceCents", product.priceCents(),
                    "originalPriceCents", product.originalPriceCents(),
                    "priceLabel", String.format("¥%.2f", product.priceCents() / 100.0)))
        .toList();
  }

  private boolean isArticlePublished(String articleId) {
    if ("OFFICIAL".equals(articleId)) return true;
    if (articleId == null || !articleId.matches(UUID_REGEX)) return false;
    Long count =
        db.queryForObject(
            "SELECT count(*) FROM article WHERE id=? AND status='PUBLISHED'", Long.class, articleId);
    return count != null && count == 1L;
  }

  private boolean isActivityPublished(String activityId) {
    if (activityId == null || activityId.isBlank()) return false;
    Long count =
        db.queryForObject(
            "SELECT count(*) FROM activity WHERE id=? AND status='PUBLISHED'",
            Long.class,
            activityId);
    return count != null && count == 1L;
  }

  private ActionLink sanitizePublicAction(ActionLink action) {
    if (action == null) {
      return new ActionLink("NONE", "", "", "", "", "", "", List.of());
    }
    if ("ARTICLE".equals(action.type()) && !isArticlePublished(action.articleId())) {
      return new ActionLink("ARTICLE", "", "", "", "", "", "", List.of());
    }
    if ("ACTIVITY".equals(action.type()) && !isActivityPublished(action.activityId())) {
      return new ActionLink("ACTIVITY", "", "", "", "", "", "", List.of());
    }
    return action;
  }

  private LayoutConfig sanitizePublicLayout(LayoutConfig cfg) {
    HeroConfig hero =
        cfg.hero() == null
            ? null
            : new HeroConfig(
                cfg.hero().imageUrl(),
                cfg.hero().brandName(),
                cfg.hero().brandCaption(),
                cfg.hero().kicker(),
                cfg.hero().title(),
                cfg.hero().subtitle(),
                sanitizePublicAction(cfg.hero().action()));
    ShortcutsConfig shortcuts =
        cfg.shortcuts() == null
            ? null
            : new ShortcutsConfig(
                cfg.shortcuts().columns(),
                cfg.shortcuts().items() == null
                    ? List.of()
                    : cfg.shortcuts().items().stream()
                        .map(
                            item -> {
                              if ("ARTICLE".equals(item.type())
                                  && !isArticlePublished(item.articleId())) {
                                return new ShortcutItem(
                                    item.id(), item.name(), item.icon(), item.imageUrl(),
                                    item.type(), "", "", "", "", "", "", "", List.of());
                              }
                              if ("WECHAT_ARTICLE".equals(item.type())
                                  && "INTRO".equals(item.icon())
                                  && !clean(item.articleId()).isEmpty()
                                  && !isArticlePublished(item.articleId())) {
                                return new ShortcutItem(
                                    item.id(), item.name(), item.icon(), item.imageUrl(),
                                    item.type(), "", "", "", item.wechatArticleUrl(),
                                    "", "", "", List.of());
                              }
                              if ("ACTIVITY".equals(item.type())
                                  && !isActivityPublished(item.activityId())) {
                                return new ShortcutItem(
                                    item.id(), item.name(), item.icon(), item.imageUrl(),
                                    item.type(), "", "", "", "", "", "", "", List.of());
                              }
                              return item;
                            })
                        .toList());
    GalleryConfig gallery =
        cfg.gallery() == null
            ? null
            : new GalleryConfig(
                cfg.gallery().eyebrow(),
                cfg.gallery().title(),
                cfg.gallery().mode(),
                cfg.gallery().slides() == null
                    ? List.of()
                    : cfg.gallery().slides().stream()
                        .map(
                            s ->
                                new GallerySlide(
                                    s.id(), s.imageUrl(), s.title(), s.subtitle(),
                                    sanitizePublicAction(s.action())))
                        .toList());
    return new LayoutConfig(
        cfg.version(), cfg.modules(), hero, shortcuts, cfg.activities(), cfg.shop(), gallery, cfg.footer());
  }

  private List<QrImage> validateQrImages(List<QrImage> images, String legacySingle, int maxCount) {
    var source = new ArrayList<QrImage>();
    if (images != null) {
      source.addAll(images);
    } else if (legacySingle != null && !legacySingle.isBlank()) {
      source.add(new QrImage(legacySingle, ""));
    }
    if (source.size() > maxCount) {
      bad("二维码或弹窗图片数量超出上限（最多 " + maxCount + " 张）");
    }
    var result = new ArrayList<QrImage>();
    for (QrImage img : source) {
      if (img == null) bad("二维码图片配置无效");
      String url = clean(img.url());
      String label = clean(img.label());
      if (url.isEmpty()) continue;
      if (!ContentService.safeImage(url)) bad("图片地址无效，请上传图片或使用 HTTPS 地址");
      if (label.length() > 40) bad("二维码说明标题最多 40 个字");
      result.add(new QrImage(url, label));
    }
    return result;
  }

  private ActionLink validateAction(ActionLink in, boolean allowNone) {
    if (in == null) {
      if (!allowNone) bad("请选择跳转动作");
      return new ActionLink("NONE", "", "", "", "", "", "", List.of());
    }
    String type = clean(in.type());
    if (type.isEmpty() && allowNone) type = "NONE";
    String page = "", activityId = "", articleId = "", wechatUrl = "", popupTitle = "", popupText = "";
    List<QrImage> popupImages = List.of();
    switch (type) {
      case "NONE" -> {
        if (!allowNone) bad("请选择有效跳转类型");
      }
      case "PAGE" -> {
        page = clean(in.page());
        if (!PAGES.contains(page)) bad("请选择有效的小程序页面");
      }
      case "ACTIVITY" -> {
        activityId = clean(in.activityId());
        if (activityId.isEmpty()
            || db.queryForObject("SELECT count(*) FROM activity WHERE id=?", Long.class, activityId) == 0) {
          bad("所选活动不存在");
        }
      }
      case "ARTICLE" -> {
        articleId = clean(in.articleId());
        if (!"OFFICIAL".equals(articleId)) {
          if (!articleId.matches(UUID_REGEX) || !isArticlePublished(articleId)) {
            bad("请选择已发布的文章或官方介绍");
          }
        }
      }
      case "WECHAT_ARTICLE" -> {
        wechatUrl = clean(in.wechatArticleUrl());
        if (!validWechatArticleUrl(wechatUrl)) {
          bad("请填写以 https://mp.weixin.qq.com/s/ 或 https://mp.weixin.qq.com/s? 开头的公众号文章链接");
        }
      }
      case "POPUP" -> {
        popupTitle = clean(in.popupTitle());
        popupText = in.popupText() == null ? "" : in.popupText().strip();
        if (popupTitle.length() > 80 || popupText.length() > 2000) {
          bad("弹窗标题最多 80 字，正文最多 2000 字");
        }
        popupImages = validateQrImages(in.popupImages(), null, 8);
      }
      default -> bad("不支持的跳转类型");
    }
    return new ActionLink(type, page, activityId, articleId, wechatUrl, popupTitle, popupText, popupImages);
  }

  private List<ModuleEntry> validateModules(List<ModuleEntry> modules) {
    if (modules == null || modules.size() != MODULE_IDS.size()) {
      bad("首页模块列表须包含全部 6 个模块");
    }
    var seen = new HashSet<String>();
    var result = new ArrayList<ModuleEntry>();
    for (ModuleEntry m : modules) {
      if (m == null || m.id() == null) bad("模块配置无效");
      String id = clean(m.id());
      if (!MODULE_IDS.contains(id) || !seen.add(id)) {
        bad("首页模块标识重复或无效：" + id);
      }
      result.add(new ModuleEntry(id, m.enabled() == null || m.enabled()));
    }
    return result;
  }

  private HeroConfig validateHero(HeroConfig in) {
    if (in == null) bad("请提供顶部主视觉配置");
    String imageUrl = clean(in.imageUrl());
    if (imageUrl.isEmpty()) imageUrl = "/assets/hero-hiking.jpg";
    if (!ContentService.safeImage(imageUrl)) bad("顶部大图须为上传图片或有效 HTTPS 地址");
    String brandName = clean(in.brandName());
    String brandCaption = clean(in.brandCaption());
    String kicker = clean(in.kicker());
    String title = clean(in.title());
    String subtitle = clean(in.subtitle());
    if (brandName.length() > 24 || brandCaption.length() > 40
        || kicker.length() > 60 || title.length() > 60 || subtitle.length() > 80) {
      bad("顶部主视觉文案超出字数限制");
    }
    return new HeroConfig(
        imageUrl, brandName, brandCaption, kicker, title, subtitle, validateAction(in.action(), true));
  }

  private ShortcutsConfig validateShortcuts(ShortcutsConfig in) {
    if (in == null || in.items() == null || in.items().isEmpty() || in.items().size() > 8) {
      bad("快捷入口数量须在 1–8 个之间");
    }
    int columns = in.columns() == null ? 4 : in.columns();
    if (columns < 2 || columns > 4) bad("快捷入口每行列数须为 2、3 或 4");
    var items = new ArrayList<ShortcutItem>();
    int idx = 1;
    for (ShortcutItem item : in.items()) {
      if (item == null) bad("快捷入口项无效");
      String name = clean(item.name());
      if (name.isEmpty() || name.length() > 12) bad("快捷入口名称请填写 1–12 个字");
      String icon = clean(item.icon());
      if (icon.isEmpty()) icon = "WEEKLY";
      if (!ICONS.contains(icon)) bad("快捷入口预设图标无效");
      String imageUrl = clean(item.imageUrl());
      if (!imageUrl.isEmpty() && !ContentService.safeImage(imageUrl)) {
        bad("快捷入口自定义配图地址无效");
      }
      List<QrImage> mergedPopupImages =
          "POPUP".equals(clean(item.type()))
              ? validateQrImages(item.popupImages(), item.popupImageUrl(), 8)
              : List.of();
      ActionLink validated =
          validateAction(
              new ActionLink(
                  item.type(),
                  item.page(),
                  item.activityId(),
                  item.articleId(),
                  item.wechatArticleUrl(),
                  item.popupTitle(),
                  item.popupText(),
                  mergedPopupImages),
              false);
      String introArticleId = validated.articleId();
      if ("INTRO".equals(icon) && "WECHAT_ARTICLE".equals(validated.type())) {
        introArticleId = clean(item.articleId());
        // Older editors may carry the legacy official pointer over when switching types.
        if ("OFFICIAL".equals(introArticleId)) introArticleId = "";
        if (!introArticleId.isEmpty()
            && (!introArticleId.matches(UUID_REGEX) || !isArticlePublished(introArticleId))) {
          bad("请选择已发布的小程序介绍文章，或使用内置介绍");
        }
      }
      String id = clean(item.id());
      if (id.isEmpty() || !id.matches("[A-Za-z0-9_-]{1,64}")) id = "slot-" + idx;
      String firstPopupImg =
          validated.popupImages().isEmpty() ? "" : validated.popupImages().getFirst().url();
      items.add(
          new ShortcutItem(
              id,
              name,
              icon,
              imageUrl,
              validated.type(),
              validated.page(),
              validated.activityId(),
              introArticleId,
              validated.wechatArticleUrl(),
              validated.popupTitle(),
              validated.popupText(),
              firstPopupImg,
              validated.popupImages()));
      idx++;
    }
    return new ShortcutsConfig(columns, items);
  }

  private ActivitiesConfig validateActivities(ActivitiesConfig in) {
    if (in == null) bad("请提供首页活动板块配置");
    String eyebrow = clean(in.eyebrow());
    String title = clean(in.title());
    if (title.isEmpty() || title.length() > 40 || eyebrow.length() > 80) {
      bad("活动板块标题请填写 1–40 字，眉题最多 80 字");
    }
    int maxCount = in.maxCount() == null ? 6 : in.maxCount();
    if (maxCount < 1 || maxCount > 12) bad("首页展示活动数量须在 1–12 之间");
    boolean showAll = in.showAllLink() == null || in.showAllLink();
    boolean autoFill = in.autoFill() == null || in.autoFill();
    var ids = new ArrayList<String>();
    var seen = new HashSet<String>();
    if (in.featuredActivityIds() != null) {
      if (in.featuredActivityIds().size() > 12) bad("最多可手动精选 12 场活动");
      for (String raw : in.featuredActivityIds()) {
        String id = clean(raw);
        if (id.isEmpty() || !seen.add(id)) continue;
        Long exists = db.queryForObject("SELECT count(*) FROM activity WHERE id=?", Long.class, id);
        if (exists == null || exists == 0L) bad("精选列表中存在无效活动，请刷新后重选");
        ids.add(id);
      }
    }
    return new ActivitiesConfig(eyebrow, title, showAll, maxCount, autoFill, ids);
  }

  private ShopConfig validateShop(ShopConfig in) {
    if (in == null) bad("请提供首页装备板块配置");
    boolean showBanner = in.showBanner() == null || in.showBanner();
    String bannerImageUrl = clean(in.bannerImageUrl());
    if (bannerImageUrl.isEmpty()) bannerImageUrl = "/assets/equipment-banner.jpg";
    if (!ContentService.safeImage(bannerImageUrl)) bad("装备横幅图片地址无效");
    String bannerTag = clean(in.bannerTag());
    String bannerTitle = clean(in.bannerTitle());
    String bannerCta = clean(in.bannerCta());
    if (bannerTag.length() > 60 || bannerTitle.length() > 60 || bannerCta.length() > 24) {
      bad("装备横幅文案超出长度限制");
    }
    boolean showProducts = in.showProducts() == null || in.showProducts();
    int maxCount = in.maxCount() == null ? 4 : in.maxCount();
    if (maxCount < 1 || maxCount > 8) bad("首页装备展示数量须在 1–8 之间");
    boolean autoFill = in.autoFill() == null || in.autoFill();
    var ids = new ArrayList<String>();
    var seen = new HashSet<String>();
    if (in.featuredProductIds() != null) {
      if (in.featuredProductIds().size() > 8) bad("最多可手动精选 8 件商品");
      for (String raw : in.featuredProductIds()) {
        String id = clean(raw);
        if (id.isEmpty() || !seen.add(id)) continue;
        Long exists = db.queryForObject("SELECT count(*) FROM product WHERE id=?", Long.class, id);
        if (exists == null || exists == 0L) bad("精选商品列表中存在无效商品");
        ids.add(id);
      }
    }
    return new ShopConfig(
        showBanner, bannerImageUrl, bannerTag, bannerTitle, bannerCta,
        showProducts, maxCount, autoFill, ids);
  }

  private GalleryConfig validateGallery(GalleryConfig in) {
    if (in == null) bad("请提供山野轮播配置");
    String eyebrow = clean(in.eyebrow());
    String title = clean(in.title());
    if (title.isEmpty() || title.length() > 40 || eyebrow.length() > 80) {
      bad("山野轮播板块标题请填写 1–40 字");
    }
    String mode = clean(in.mode());
    if (!Set.of("AUTO_ARTICLES", "CUSTOM").contains(mode)) mode = "AUTO_ARTICLES";
    var slides = new ArrayList<GallerySlide>();
    if (in.slides() != null) {
      if (in.slides().size() > 10) bad("自定义轮播最多 10 张");
      int idx = 1;
      for (GallerySlide s : in.slides()) {
        if (s == null) bad("轮播项无效");
        String img = clean(s.imageUrl());
        String sTitle = clean(s.title());
        String sSub = clean(s.subtitle());
        if (!ContentService.safeImage(img)) bad("轮播图片地址无效");
        if (sTitle.isEmpty() || sTitle.length() > 80 || sSub.length() > 160) {
          bad("轮播标题请填写 1–80 字，副标题最多 160 字");
        }
        String sid = clean(s.id());
        if (sid.isEmpty() || !sid.matches("[A-Za-z0-9_-]{1,64}")) sid = "slide-" + idx;
        slides.add(new GallerySlide(sid, img, sTitle, sSub, validateAction(s.action(), true)));
        idx++;
      }
    }
    return new GalleryConfig(eyebrow, title, mode, slides);
  }

  private FooterConfig validateFooter(FooterConfig in) {
    if (in == null) bad("请提供底部关注与底图配置");
    boolean followEnabled = Boolean.TRUE.equals(in.followEnabled());
    String followTitle = clean(in.followTitle());
    String followSubtitle = clean(in.followSubtitle());
    if (followTitle.length() > 60 || followSubtitle.length() > 120) {
      bad("底部关注标题最多 60 字，副文案最多 120 字");
    }
    List<QrImage> followQrcodes = validateQrImages(in.followQrcodes(), null, 6);
    boolean brandEnabled = in.brandEnabled() == null || in.brandEnabled();
    String brandImageUrl = clean(in.brandImageUrl());
    if (brandImageUrl.isEmpty()) brandImageUrl = DEFAULT_BRAND_IMAGE;
    if (!DEFAULT_BRAND_IMAGE.equals(brandImageUrl) && !ContentService.safeImage(brandImageUrl)) {
      bad("野小子底图地址无效，请上传 PNG/JPG/WebP 图片");
    }
    int brandWidthPx = in.brandWidthPx() == null ? 216 : in.brandWidthPx();
    if (brandWidthPx < 80 || brandWidthPx > 360) {
      bad("野小子底图宽度须在 80–360px 之间");
    }
    return new FooterConfig(
        followEnabled, followTitle, followSubtitle, followQrcodes,
        brandEnabled, brandImageUrl, brandWidthPx);
  }

  @Transactional
  public LayoutConfig save(LayoutConfig input, String actor) {
    if (input == null || input.version() == null || input.version() < 0) {
      bad("首页配置版本号无效");
    }
    db.queryForList("SELECT id FROM article_settings WHERE id=1 FOR UPDATE");
    long version =
        db.queryForObject(
            "SELECT version FROM home_page_settings WHERE id=1 FOR UPDATE", Long.class);
    if (input.version() != version) {
      throw ApiException.conflict("HOME_LAYOUT_CONFLICT", "首页配置已被修改，请重新加载后再保存");
    }
    var normalized =
        new LayoutConfig(
            version + 1,
            validateModules(input.modules()),
            validateHero(input.hero()),
            validateShortcuts(input.shortcuts()),
            validateActivities(input.activities()),
            validateShop(input.shop()),
            validateGallery(input.gallery()),
            validateFooter(input.footer()));
    try {
      db.update(
          "UPDATE home_page_settings SET config_json=?, version=version+1, updated_at=CURRENT_TIMESTAMP WHERE id=1",
          json.writeValueAsString(normalized));
    } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
      throw new IllegalArgumentException(e);
    }
    db.update(
        "INSERT INTO audit_event(id,actor_id,entity_id,action) VALUES(?,?,?,?)",
        UUID.randomUUID().toString(),
        actor,
        "home-layout",
        "HOME_LAYOUT_UPDATE");
    return get(true);
  }
}
