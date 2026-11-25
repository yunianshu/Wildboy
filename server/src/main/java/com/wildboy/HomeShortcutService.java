package com.wildboy;

import static com.wildboy.HomeShortcutModels.*;
import com.wildboy.HomeLayoutModels.QrImage;
import com.wildboy.HomeLayoutModels.ShortcutItem;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class HomeShortcutService {
  private final JdbcTemplate db;
  private final ObjectMapper json;
  private final HomeLayoutService layouts;
  private static final Set<String> ICONS = Set.of("WEEKLY", "DOMESTIC", "QRCODE", "INTRO");
  private static final Set<String> PAGES = Set.of("WEEKLY", "DOMESTIC", "ACTIVITIES", "SHOP", "PROFILE");
  public HomeShortcutService(JdbcTemplate db, ObjectMapper json, HomeLayoutService layouts) {
    this.db = db;
    this.json = json;
    this.layouts = layouts;
  }

  public Configuration get(boolean admin) {
    var layout = layouts.get(admin);
    var visible = admin || layout.modules().stream()
        .anyMatch(module -> module.id().equals("SHORTCUTS") && Boolean.TRUE.equals(module.enabled()));
    var source = visible ? layout.shortcuts().items() : List.<ShortcutItem>of();
    var slots = new ArrayList<Item>(4);
    for (int i = 0; i < 4; i++) slots.add(project(i+1, i < source.size() ? source.get(i) : null));
    return new Configuration(layout.version(), slots);
  }

  // Released mini programs require exactly four slots and only understand these three actions.
  private static Item project(int slot, ShortcutItem item) {
    if (item == null) return new Item(slot, "暂无入口", "INTRO", "POPUP", "", "", "暂无入口", "", "");
    if ("PAGE".equals(item.type()) && PAGES.contains(item.page())
        || "ARTICLE".equals(item.type()) || "POPUP".equals(item.type())) {
      return new Item(slot, item.name(), item.icon(), item.type(), item.page(), item.articleId(),
          item.popupTitle(), item.popupText(), item.popupImageUrl());
    }
    return new Item(slot, item.name(), item.icon(), "POPUP", "", "", item.name(), "请更新小程序后查看此入口", "");
  }

  private static ShortcutItem merge(ShortcutItem current, Item edit) {
    var previous = project(edit.slot(), current);
    var sameAction = new Item(edit.slot(), edit.name(), edit.icon(), previous.type(), previous.page(),
        previous.articleId(), previous.popupTitle(), previous.popupText(), previous.popupImageUrl()).equals(edit);
    if (current != null && sameAction) {
      return new ShortcutItem(current.id(), edit.name(), edit.icon(), current.imageUrl(), current.type(),
          current.page(), current.activityId(), current.articleId(), current.wechatArticleUrl(),
          current.popupTitle(), current.popupText(), current.popupImageUrl(), current.popupImages());
    }
    // The legacy form can edit only the first QR image. Keep labels and additional images.
    var images = new ArrayList<QrImage>();
    if ("POPUP".equals(edit.type())) {
      if (current != null && "POPUP".equals(current.type()) && current.popupImages() != null) {
        images.addAll(current.popupImages());
      }
      var first = images.isEmpty() ? null : images.removeFirst();
      if (!edit.popupImageUrl().isEmpty()) {
        images.addFirst(new QrImage(edit.popupImageUrl(), first == null ? "" : first.label()));
      }
    }
    return new ShortcutItem(current == null ? "slot-" + UUID.randomUUID() : current.id(),
        edit.name(), edit.icon(), current == null ? "" : current.imageUrl(), edit.type(), edit.page(),
        "", edit.articleId(), "", edit.popupTitle(), edit.popupText(),
        images.isEmpty() ? "" : images.getFirst().url(), images);
  }
  private static String clean(String s) { return s == null ? "" : s.strip(); }
  private static void bad() { throw new ApiException(400,"INVALID_HOME_SHORTCUTS","首页入口配置无效，请检查名称、类型和目标"); }
  private List<Item> validate(List<Item> items) {
    if (items == null || items.size()!=4) bad();
    var slots = new HashSet<Integer>();
    var result = new ArrayList<Item>();
    for (var i : items) {
      if(i==null || i.slot()==null || i.slot()<1 || i.slot()>4 || !slots.add(i.slot())) bad();
      String name=clean(i.name()), icon=clean(i.icon()), type=clean(i.type());
      if(name.isEmpty() || name.length()>12 || !ICONS.contains(icon)) bad();
      String page="", article="", title="", text="", image="";
      switch(type) {
        case "PAGE" -> {page=clean(i.page()); if(!PAGES.contains(page)) bad();}
        case "ARTICLE" -> {
          article=clean(i.articleId());
          if(!article.equals("OFFICIAL")) {
            if(!article.matches("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")) bad();
            if(db.queryForObject("SELECT count(*) FROM article WHERE id=? AND status='PUBLISHED'",Long.class,article)!=1) bad();
          }
        }
        case "POPUP" -> {
          title=clean(i.popupTitle());text=clean(i.popupText());image=clean(i.popupImageUrl());
          if(title.length()>80 || text.length()>2000 || !image.isEmpty() && !ContentService.safeImage(image)) bad();
        }
        default -> bad();
      }
      result.add(new Item(i.slot(),name,icon,type,page,article,title,text,image));
    }
    result.sort(Comparator.comparing(Item::slot));
    return result;
  }
  @Transactional
  public Configuration save(Configuration input, String actor) {
    if(input==null || input.version()==null || input.version()<0) bad();
    // Share the article publication lock so validation cannot race an unpublish operation.
    db.queryForList("SELECT id FROM article_settings WHERE id=1 FOR UPDATE");
    long version = db.queryForObject("SELECT version FROM home_page_settings WHERE id=1 FOR UPDATE",Long.class);
    if(input.version()!=version) throw ApiException.conflict("HOME_SHORTCUTS_CONFLICT","首页入口已被修改，请重新加载后再保存");
    var edits=validate(input.items());
    var items = new ArrayList<>(layouts.get(true).shortcuts().items());
    for (var edit : edits) {
      int index = edit.slot() - 1;
      var current = index < items.size() ? items.get(index) : null;
      if (edit.equals(project(edit.slot(), current))) continue;
      while (items.size() <= index) {
        items.add(merge(null, project(items.size() + 1, null)));
      }
      items.set(index, merge(current, edit));
    }
    try {
      db.update("""
          UPDATE home_page_settings
          SET config_json=jsonb_set(config_json::jsonb, '{shortcuts,items}', ?::jsonb)::text,
              version=version+1, updated_at=CURRENT_TIMESTAMP WHERE id=1
          """, json.writeValueAsString(items));
    } catch(com.fasterxml.jackson.core.JsonProcessingException e) {throw new IllegalArgumentException(e);}
    db.update("INSERT INTO audit_event(id,actor_id,entity_id,action) VALUES(?,?,?,?)",UUID.randomUUID().toString(),actor,"home-shortcuts","HOME_SHORTCUTS_UPDATE");
    return get(true);
  }
}
