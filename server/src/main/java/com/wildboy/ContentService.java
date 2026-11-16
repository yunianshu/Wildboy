package com.wildboy;

import com.fasterxml.jackson.databind.ObjectMapper;
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
  public Document get(String type,String id,boolean admin) {
    if(type.equals("activity")) activities.get(id,admin); else shop.product(id,admin);
    var found=db.query("SELECT blocks,version FROM rich_content WHERE entity_type=? AND entity_id=?",(r,n)-> {
      try { return new Document(Arrays.asList(json.readValue(r.getString(1),Block[].class)),r.getLong(2)); }
      catch(Exception e){throw new IllegalStateException("Invalid stored content",e);}
    },type,id);
    return found.isEmpty()?new Document(List.of(),0):found.getFirst();
  }
  static boolean safeImage(String value) {
    if(value==null || value.length()>2048) return false;
    return value.matches("/assets/[A-Za-z0-9_-]+(?:/[A-Za-z0-9_-]+)*\\.(?:png|jpg|jpeg|webp)")
      || value.matches("https://[^\\s<>\\\"'\\\\]+") && !value.contains("@");
  }
  static void validate(List<Block> blocks) {
    if(blocks==null || blocks.size()>30) bad();
    int chars=0;
    for(var b:blocks) {
      if(b==null || b.type()==null) bad();
      switch(b.type()) {
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
    if(chars>30000) bad();
  }
  static void bad(){throw new ApiException(400,"INVALID_CONTENT","图文内容格式或长度无效");}
  @Transactional public Document save(String type,String id,Input in,String actor) {
    validate(in.blocks());
    String table=type.equals("activity")?"activity":"product";
    if(db.queryForList("SELECT id FROM "+table+" WHERE id=? FOR UPDATE",String.class,id).isEmpty()) throw ApiException.notFound();
    var old=get(type,id,true);
    if(in.version()==null || in.version()!=old.version()) throw ApiException.conflict("CONTENT_CONFLICT","图文已更新，请重新加载");
    try {
      String value=json.writeValueAsString(in.blocks());
      db.update("INSERT INTO rich_content(entity_type,entity_id,blocks,version) VALUES(?,?,?,1) ON CONFLICT(entity_type,entity_id) DO UPDATE SET blocks=EXCLUDED.blocks,version=rich_content.version+1,updated_at=CURRENT_TIMESTAMP",type,id,value);
    }catch(com.fasterxml.jackson.core.JsonProcessingException e){throw new IllegalArgumentException(e);}
    db.update("INSERT INTO audit_event(id,actor_id,entity_id,action) VALUES(?,?,?,?)",UUID.randomUUID().toString(),actor,id,"CONTENT_UPDATE");
    return get(type,id,true);
  }
}
