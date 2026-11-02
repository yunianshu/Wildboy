package com.wildboy;

import static com.wildboy.HomeShortcutModels.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class HomeShortcutService {
  private final JdbcTemplate db;
  private final ObjectMapper json;
  private static final Set<String> ICONS = Set.of("WEEKLY", "DOMESTIC", "QRCODE", "INTRO");
  private static final Set<String> PAGES = Set.of("WEEKLY", "DOMESTIC", "ACTIVITIES", "SHOP", "PROFILE");
  public HomeShortcutService(JdbcTemplate db, ObjectMapper json) { this.db=db; this.json=json; }

  public Configuration get(boolean admin) {
    var configuration = db.queryForObject("SELECT version,items FROM home_shortcut_settings WHERE id=1", (r,n) -> {
      try { return new Configuration(r.getLong(1), Arrays.asList(json.readValue(r.getString(2), Item[].class))); }
      catch (com.fasterxml.jackson.core.JsonProcessingException e) { throw new IllegalStateException("Invalid homepage configuration", e); }
    });
    if (admin) return configuration;
    // A referenced article can be unpublished later. Do not expose its draft metadata or ID.
    return new Configuration(configuration.version(), configuration.items().stream().map(i ->
        i.type().equals("ARTICLE") && !i.articleId().equals("OFFICIAL") && db.queryForObject("SELECT count(*) FROM article WHERE id=? AND status='PUBLISHED'", Long.class, i.articleId()) == 0
          ? new Item(i.slot(),i.name(),i.icon(),i.type(),"","","","","") : i).toList());
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
    long version = db.queryForObject("SELECT version FROM home_shortcut_settings WHERE id=1 FOR UPDATE",Long.class);
    if(input.version()!=version) throw ApiException.conflict("HOME_SHORTCUTS_CONFLICT","首页入口已被修改，请重新加载后再保存");
    var items=validate(input.items());
    try {
      db.update("UPDATE home_shortcut_settings SET items=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=1",json.writeValueAsString(items));
    } catch(com.fasterxml.jackson.core.JsonProcessingException e) {throw new IllegalArgumentException(e);}
    db.update("INSERT INTO audit_event(id,actor_id,entity_id,action) VALUES(?,?,?,?)",UUID.randomUUID().toString(),actor,"home-shortcuts","HOME_SHORTCUTS_UPDATE");
    return get(true);
  }
}
