package com.wildboy;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import static com.wildboy.ContentModels.*;

@Service
public class ContentService {
  final JdbcTemplate db; final ObjectMapper json; final ActivityService activities; final ShopService shop;
  public ContentService(JdbcTemplate db,ObjectMapper json,ActivityService activities,ShopService shop) {
    this.db=db;this.json=json;this.activities=activities;this.shop=shop;
  }
  private record StoredContent(Document document, String markdown) {}

  public Document get(String type,String id,boolean admin) {
    if(type.equals("activity")) activities.get(id,admin); else shop.product(id,admin);
    return stored(type, id).document();
  }

  record PublicActivityContent(List<Object> blocks, long version) {}
  PublicActivityContent publicActivity(String id) {
    var document = get("activity", id, false);
    List<Object> blocks = new ArrayList<>();
    for (var block : document.blocks()) {
      if ("wechat".equals(block.type()))
        blocks.add(Map.of("type", "wechat", "nodes", new WechatFragment(block.text()).nodes()));
      else blocks.add(block);
    }
    return new PublicActivityContent(blocks, document.version());
  }

  private StoredContent stored(String type, String id) {
    var found=db.query("SELECT blocks,version,markdown FROM rich_content WHERE entity_type=? AND entity_id=?",(r,n)-> {
      try {
        var document = new Document(Arrays.asList(json.readValue(r.getString("blocks"), Block[].class)), r.getLong("version"));
        return new StoredContent(document, r.getString("markdown"));
      }
      catch(Exception e){throw new IllegalStateException("Invalid stored content",e);}
    },type,id);
    return found.isEmpty() ? new StoredContent(new Document(List.of(), 0), null) : found.getFirst();
  }

  public ProductDocument publicProduct(String id) {
    shop.product(id, false);
    var stored = stored("product", id);
    var document = stored.document();
    return new ProductDocument(document.blocks(), document.version(),
        stored.markdown() == null ? null : ArticleMarkdown.toNodes(stored.markdown()));
  }

  public MarkdownDocument productMarkdown(String id) {
    shop.product(id, true);
    var stored = stored("product", id);
    return new MarkdownDocument(stored.markdown() == null
        ? ArticleMarkdown.fromProductBlocks(stored.document().blocks()) : stored.markdown(),
        stored.document().version());
  }

  @Transactional
  public MarkdownDocument saveProductMarkdown(String id, MarkdownInput in, String actor) {
    lockEntity("product", id);
    var old = stored("product", id).document();
    checkVersion(in.version(), old.version());
    var nodes = ArticleMarkdown.toNodes(in.markdown());
    saveContent("product", id, legacyProductBlocks(json.valueToTree(nodes)), in.markdown(), actor);
    return new MarkdownDocument(in.markdown(), old.version() + 1);
  }

  private static List<Block> legacyProductBlocks(JsonNode nodes) {
    var blocks = new ArrayList<Block>();
    for (var node : nodes) {
      switch (node.path("type").asText()) {
        case "image" -> blocks.add(new Block("image", null, node.path("url").asText(), node.path("caption").asText(), null));
        case "table" -> {
          var rows = new ArrayList<List<String>>();
          rows.add(tableCells(node.path("head")));
          for (var row : node.path("rows")) rows.add(tableCells(row));
          blocks.add(new Block("table", null, null, null, rows));
        }
        case "heading", "paragraph" -> addLegacyText(blocks, spanText(node.path("spans")));
        case "code" -> addLegacyText(blocks, node.path("text").asText());
        case "list" -> {
          var lines = new ArrayList<String>();
          boolean ordered = node.path("ordered").asBoolean();
          for (var item : node.path("items")) {
            lines.add((ordered ? (lines.size() + 1) + ". " : "• ") + spanText(item.path("spans")));
          }
          addLegacyText(blocks, String.join("\n", lines));
        }
        default -> { }
      }
    }
    return blocks;
  }

  private static List<String> tableCells(JsonNode row) {
    var cells = new ArrayList<String>();
    for (var cell : row) cells.add(spanText(cell));
    return cells;
  }

  private static String spanText(JsonNode spans) {
    var text = new StringBuilder();
    for (var span : spans) text.append(span.path("s").asText());
    return text.toString();
  }

  private static void addLegacyText(List<Block> blocks, String text) {
    if (!text.isBlank()) blocks.add(new Block("text", text, null, null, null));
  }
  static boolean safeImage(String value) {
    if(value==null || value.length()>2048) return false;
    return value.matches("/assets/[A-Za-z0-9_-]+(?:/[A-Za-z0-9_-]+)*\\.(?:png|jpg|jpeg|webp)")
      || value.matches("https://[^\\s<>\\\"'\\\\]+") && !value.contains("@");
  }
  static void validate(List<Block> blocks) {
    if(blocks==null || blocks.size()>30) bad();
    int chars=0, formattedChars=0;
    for(var b:blocks) {
      if(b==null || b.type()==null) bad();
      switch(b.type()) {
        case "wechat" -> {
          if (b.text()==null || b.text().isBlank() || b.text().length()>WechatFragment.MAX_HTML ||
              b.url()!=null || b.caption()!=null || b.rows()!=null) bad();
          formattedChars += b.text().length();
        }
        case "text" -> { if(b.text()==null || b.text().isBlank() || b.text().length()>10000 || b.url()!=null || b.rows()!=null) bad(); chars+=b.text().length(); }
        case "image" -> { if(!safeImage(b.url()) || b.caption()!=null && b.caption().length()>300 || b.text()!=null || b.rows()!=null) bad(); }
        case "table" -> { if(b.rows()==null || b.rows().isEmpty() || b.rows().size()>30 || b.url()!=null || b.text()!=null) bad();
          int width=b.rows().getFirst()==null?0:b.rows().getFirst().size();
          if(width<1 || width>8) bad();
          for(var row:b.rows()) { if(row==null || row.size()!=width) bad(); for(var cell:row) {if(cell==null || cell.length()>300) bad();chars+=cell.length();} }
        }
        default -> bad();
      }
    }
    if(chars>30000 || formattedChars>ArticleMarkdown.MAX_LENGTH) bad();
  }
  static void bad(){throw new ApiException(400,"INVALID_CONTENT","图文内容格式或长度无效");}
  @Transactional public Document save(String type,String id,Input in,String actor) {
    validate(in.blocks());
    List<Block> blocks = new ArrayList<>();
    for (var block : in.blocks()) {
      if ("wechat".equals(block.type())) {
        if (!"activity".equals(type)) bad();
        var fragment = new WechatFragment(block.text());
        if (!fragment.hasContent()) throw WechatFragment.invalid("公众号排版块为空，请补充内容或移除");
        blocks.add(new Block("wechat", fragment.html(), null, null, null));
      } else blocks.add(block);
    }
    lockEntity(type, id);
    var old = stored(type, id);
    checkVersion(in.version(), old.document().version());
    if (old.markdown() != null)
      throw ApiException.conflict("CONTENT_CONFLICT", "请使用商品图文工作台编辑此内容");
    saveContent(type, id, blocks, null, actor);
    return new Document(blocks, old.document().version() + 1);
  }

  private void lockEntity(String type, String id) {
    String table=type.equals("activity")?"activity":"product";
    if(db.queryForList("SELECT id FROM "+table+" WHERE id=? FOR UPDATE",String.class,id).isEmpty()) throw ApiException.notFound();
  }

  private static void checkVersion(Long expected, long actual) {
    if (expected == null || expected != actual)
      throw ApiException.conflict("CONTENT_CONFLICT", "图文已更新，请重新加载");
  }

  private void saveContent(String type, String id, List<Block> blocks, String markdown, String actor) {
    try {
      String value=json.writeValueAsString(blocks);
      db.update("""
          INSERT INTO rich_content(entity_type,entity_id,blocks,markdown,version) VALUES(?,?,?,?,1)
          ON CONFLICT(entity_type,entity_id) DO UPDATE SET blocks=EXCLUDED.blocks,
            markdown=EXCLUDED.markdown,version=rich_content.version+1,updated_at=CURRENT_TIMESTAMP
          """, type, id, value, markdown);
    }catch(com.fasterxml.jackson.core.JsonProcessingException e){throw new IllegalArgumentException(e);}
    db.update("INSERT INTO audit_event(id,actor_id,entity_id,action) VALUES(?,?,?,?)",UUID.randomUUID().toString(),actor,id,"CONTENT_UPDATE");
  }
}
