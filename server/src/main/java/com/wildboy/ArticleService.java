package com.wildboy;

import static com.wildboy.ArticleModels.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
import java.time.OffsetDateTime;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ArticleService {
  final JdbcTemplate db; final ObjectMapper json;
  static final String SELECT="SELECT a.*, (s.official_article_id=a.id) IS TRUE AS is_official FROM article a CROSS JOIN article_settings s ";
  public ArticleService(JdbcTemplate db,ObjectMapper json){this.db=db;this.json=json;}
  Article map(java.sql.ResultSet r,int n) throws java.sql.SQLException {
    try {return new Article(r.getString("id"),r.getString("title"),r.getString("summary"),r.getString("cover_url"),r.getString("activity_id"),r.getString("status"),r.getBoolean("is_official"),r.getLong("version"),r.getObject("published_at",OffsetDateTime.class),r.getObject("updated_at",OffsetDateTime.class),Arrays.asList(json.readValue(r.getString("blocks"),ContentModels.Block[].class)));}
    catch(com.fasterxml.jackson.core.JsonProcessingException e){throw new IllegalStateException("Invalid stored article",e);}
  }
  public Article get(String id,boolean admin){return db.query(SELECT+"WHERE a.id=?"+(admin?"":" AND a.status='PUBLISHED'"),this::map,id).stream().findFirst().orElseThrow(ApiException::notFound);}
  public Article official(){return db.query(SELECT+"WHERE a.id=s.official_article_id AND a.status='PUBLISHED'",this::map).stream().findFirst().orElseThrow(ApiException::notFound);}
  public Models.Page<Article> list(int page,int size,boolean admin){
    page=Math.max(0,page);size=Math.max(1,Math.min(100,size));
    String where=admin?"":"WHERE a.status='PUBLISHED' AND a.id IS DISTINCT FROM s.official_article_id ";
    long total=db.queryForObject("SELECT count(*) FROM article a CROSS JOIN article_settings s "+where,Long.class);
    var items=db.query(SELECT+where+" ORDER BY a.published_at DESC NULLS LAST,a.updated_at DESC,a.id LIMIT ? OFFSET ?",this::map,size,(long)page*size);
    return new Models.Page<>(items,total,page,size,((long)page+1)*size<total);
  }
  void lock(){db.queryForList("SELECT id FROM article_settings WHERE id=1 FOR UPDATE");}
  Article check(String id,Long version,boolean draft){
    var old=get(id,true);
    if(version==null || version!=old.version())throw ApiException.conflict("ARTICLE_CONFLICT","文章已更新，请刷新后重试");
    if(draft && !old.status().equals("DRAFT"))throw ApiException.conflict("ARTICLE_PUBLISHED","请先下架文章再编辑");
    return old;
  }
  String empty(String s){return s==null?"":s.strip();}
  void validate(Input in){
    if(in.title()==null || in.title().isBlank() || in.title().length()>120 || empty(in.summary()).length()>500)throw new ApiException(400,"INVALID_ARTICLE","文章标题或摘要无效");
    if(!empty(in.coverUrl()).isEmpty() && !ContentService.safeImage(in.coverUrl()))throw new ApiException(400,"INVALID_ARTICLE_COVER","封面地址无效");
    if(!empty(in.activityId()).isEmpty() && db.queryForObject("SELECT count(*) FROM activity WHERE id=?",Long.class,in.activityId())==0)throw new ApiException(400,"INVALID_ARTICLE_ACTIVITY","关联活动不存在");
  }
  void audit(String actor,String id,String action){db.update("INSERT INTO audit_event(id,actor_id,entity_id,action) VALUES(?,?,?,?)",UUID.randomUUID().toString(),actor,id,action);}
  @Transactional public Article create(Input in,String actor){
    validate(in);String id=UUID.randomUUID().toString();
    db.update("INSERT INTO article(id,title,summary,cover_url,activity_id) VALUES(?,?,?,?,?)",id,in.title().strip(),empty(in.summary()),empty(in.coverUrl()),empty(in.activityId()).isEmpty()?null:in.activityId());
    audit(actor,id,"ARTICLE_CREATE");return get(id,true);
  }
  @Transactional public Article update(String id,Input in,String actor){
    lock();check(id,in.version(),true);validate(in);
    db.update("UPDATE article SET title=?,summary=?,cover_url=?,activity_id=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?",in.title().strip(),empty(in.summary()),empty(in.coverUrl()),empty(in.activityId()).isEmpty()?null:in.activityId(),id);
    audit(actor,id,"ARTICLE_UPDATE");return get(id,true);
  }
  public ContentModels.Document content(String id){var a=get(id,true);return new ContentModels.Document(a.blocks(),a.version());}
  @Transactional public ContentModels.Document saveContent(String id,ContentModels.Input in,String actor){
    lock();check(id,in.version(),true);ContentService.validate(in.blocks());
    try {db.update("UPDATE article SET blocks=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?",json.writeValueAsString(in.blocks()),id);}catch(com.fasterxml.jackson.core.JsonProcessingException e){throw new IllegalArgumentException(e);}
    audit(actor,id,"ARTICLE_CONTENT_UPDATE");return content(id);
  }
  @Transactional public Article action(String id,Long version,String action,String actor){
    lock();var old=check(id,version,false);
    switch(action){
      case "publish" -> {
        if(!old.status().equals("DRAFT"))throw ApiException.conflict("ARTICLE_PUBLISHED","文章已发布");
        if(!ContentService.safeImage(old.coverUrl()) || old.blocks().isEmpty())throw new ApiException(400,"ARTICLE_INCOMPLETE","请先保存封面和文章正文");
        ContentService.validate(old.blocks());
        db.update("UPDATE article SET status='PUBLISHED',published_at=CURRENT_TIMESTAMP WHERE id=?",id);
      }
      case "unpublish" -> {
        if(!old.status().equals("PUBLISHED"))throw ApiException.conflict("ARTICLE_DRAFT","文章已下架");
        db.update("UPDATE article SET status='DRAFT' WHERE id=?",id);
        db.update("UPDATE article_settings SET official_article_id=NULL WHERE official_article_id=?",id);
      }
      case "official" -> {
        if(!old.status().equals("PUBLISHED"))throw ApiException.conflict("ARTICLE_NOT_PUBLISHED","请先发布文章");
        if(old.isOfficial())return old;
        db.update("UPDATE article SET version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=(SELECT official_article_id FROM article_settings WHERE id=1)");
        db.update("UPDATE article_settings SET official_article_id=? WHERE id=1",id);
      }
      default -> throw new IllegalArgumentException("Unknown article action");
    }
    db.update("UPDATE article SET version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?",id);
    audit(actor,id,"ARTICLE_"+action.toUpperCase(Locale.ROOT));return get(id,true);
  }
}
