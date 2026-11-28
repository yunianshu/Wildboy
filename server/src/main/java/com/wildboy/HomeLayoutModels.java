package com.wildboy;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.util.List;
import java.util.Map;

public final class HomeLayoutModels {
  @JsonIgnoreProperties(ignoreUnknown = true)
  public record QrImage(String url, String label) {}

  @JsonIgnoreProperties(ignoreUnknown = true)
  public record ActionLink(
      String type,
      String page,
      String activityId,
      String articleId,
      String wechatArticleUrl,
      String popupTitle,
      String popupText,
      List<QrImage> popupImages) {}

  @JsonIgnoreProperties(ignoreUnknown = true)
  public record HeroConfig(
      String imageUrl,
      String brandName,
      String brandCaption,
      String kicker,
      String title,
      String subtitle,
      ActionLink action) {}

  @JsonIgnoreProperties(ignoreUnknown = true)
  public record ShortcutItem(
      String id,
      String name,
      String icon,
      String imageUrl,
      String type,
      String page,
      String activityId,
      String articleId,
      String wechatArticleUrl,
      String popupTitle,
      String popupText,
      String popupImageUrl,
      List<QrImage> popupImages) {}

  @JsonIgnoreProperties(ignoreUnknown = true)
  public record ShortcutsConfig(
      Integer columns,
      List<ShortcutItem> items) {}

  @JsonIgnoreProperties(ignoreUnknown = true)
  public record ActivitiesConfig(
      String eyebrow,
      String title,
      Boolean showAllLink,
      Integer maxCount,
      Boolean autoFill,
      List<String> featuredActivityIds) {}

  @JsonIgnoreProperties(ignoreUnknown = true)
  public record ShopConfig(
      Boolean showBanner,
      String bannerImageUrl,
      String bannerTag,
      String bannerTitle,
      String bannerCta,
      Boolean showProducts,
      Integer maxCount,
      Boolean autoFill,
      List<String> featuredProductIds) {}

  @JsonIgnoreProperties(ignoreUnknown = true)
  public record GallerySlide(
      String id,
      String mediaType,
      String imageUrl,
      String videoUrl,
      String title,
      String subtitle,
      ActionLink action) {
    public GallerySlide(
        String id, String imageUrl, String title, String subtitle, ActionLink action) {
      this(id, "IMAGE", imageUrl, "", title, subtitle, action);
    }
  }

  @JsonIgnoreProperties(ignoreUnknown = true)
  public record GalleryConfig(
      String eyebrow,
      String title,
      String mode,
      List<GallerySlide> slides) {}

  @JsonIgnoreProperties(ignoreUnknown = true)
  public record FooterBlock(
      String id,
      String name,
      Boolean enabled,
      Integer colSpan,
      Integer rowSpan,
      String topType,
      String topText,
      String topImageUrl,
      Integer topImageWidthPx,
      Boolean topPreviewable,
      String bottomType,
      String bottomText,
      String bottomImageUrl,
      Integer bottomImageWidthPx,
      Boolean bottomPreviewable) {}

  @JsonIgnoreProperties(ignoreUnknown = true)
  public record FooterConfig(
      Boolean followEnabled,
      String followTitle,
      String followSubtitle,
      List<QrImage> followQrcodes,
      Boolean brandEnabled,
      String brandImageUrl,
      Integer brandWidthPx,
      List<String> cellOrder,
      String layoutPreset,
      Integer colRatio,
      Integer rowRatio,
      Integer columns,
      List<Integer> colRatios,
      List<FooterBlock> blocks) {}

  @JsonIgnoreProperties(ignoreUnknown = true)
  public record ModuleEntry(
      String id,
      Boolean enabled) {}

  @JsonIgnoreProperties(ignoreUnknown = true)
  public record LayoutConfig(
      Long version,
      List<ModuleEntry> modules,
      HeroConfig hero,
      ShortcutsConfig shortcuts,
      ActivitiesConfig activities,
      ShopConfig shop,
      GalleryConfig gallery,
      FooterConfig footer) {}

  public record PublicHomeResponse(
      LayoutConfig layout,
      List<Models.Activity> featuredActivities,
      List<Map<String, Object>> featuredEquipment) {}
}
