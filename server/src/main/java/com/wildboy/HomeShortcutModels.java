package com.wildboy;

import java.util.List;

public final class HomeShortcutModels {
  public record Item(Integer slot, String name, String icon, String type, String page,
      String articleId, String popupTitle, String popupText, String popupImageUrl) {}
  public record Configuration(Long version, List<Item> items) {}
}
