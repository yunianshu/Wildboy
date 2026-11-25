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
  static final String PUBLISHED_UPDATE_REQUIRED = "请通过发布更新一次保存文章信息和正文";
  public ArticleService(JdbcTemplate db,ObjectMapper json){this.db=db;this.json=json;}
  Article map(java.sql.ResultSet r,int n,boolean withNodes) throws java.sql.SQLException {
    String markdown=r.getString("markdown");
    List<Object> nodes=withNodes?ArticleMarkdown.toNodes(markdown==null
      ?ArticleMarkdown.fromBlocksJson(json,r.getString("blocks")):markdown):null;
    return new Article(r.getString("id"),r.getString("title"),r.getString("summary"),r.getString("cover_url"),r.getString("activity_id"),r.getString("status"),r.getBoolean("is_official"),r.getLong("version"),r.getObject("published_at",OffsetDateTime.class),r.getObject("updated_at",OffsetDateTime.class),nodes);
  }
  /** 正文端点用：返回原始 markdown（旧文章由 blocks 懒转换，保存时固化）。 */
  public ArticleContent content(String id){
    return db.query("SELECT markdown,blocks,version FROM article WHERE id=?",(r,n)->{
      String markdown=r.getString("markdown");
      if(markdown==null) markdown=ArticleMarkdown.fromBlocksJson(json,r.getString("blocks"));
      return new ArticleContent(markdown,r.getLong("version"));
    },id).stream().findFirst().orElseThrow(ApiException::notFound);
  }
  public Article get(String id,boolean admin){return db.query(SELECT+"WHERE a.id=?"+(admin?"":" AND a.status='PUBLISHED'"),(r,n)->map(r,n,true),id).stream().findFirst().orElseThrow(ApiException::notFound);}
  public Article official(){return db.query(SELECT+"WHERE a.id=s.official_article_id AND a.status='PUBLISHED'",(r,n)->map(r,n,true)).stream().findFirst().orElseThrow(ApiException::notFound);}
  public Models.Page<Article> list(int page,int size,boolean admin){
    page=Math.max(0,page);size=Math.max(1,Math.min(100,size));
    String where=admin?"":"WHERE a.status='PUBLISHED' AND a.id IS DISTINCT FROM s.official_article_id ";
    long total=db.queryForObject("SELECT count(*) FROM article a CROSS JOIN article_settings s "+where,Long.class);
    var items=db.query(SELECT+where+" ORDER BY a.published_at DESC NULLS LAST,a.updated_at DESC,a.id LIMIT ? OFFSET ?",(r,n)->map(r,n,false),size,(long)page*size);
    return new Models.Page<>(items,total,page,size,((long)page+1)*size<total);
  }
  void lock(){db.queryForList("SELECT id FROM article_settings WHERE id=1 FOR UPDATE");}
  Article checkVersion(String id, Long version){
    var old=get(id,true);
    if(version==null || version!=old.version())throw ApiException.conflict("ARTICLE_CONFLICT","文章已更新，请刷新后重试");
    return old;
  }
  /** 生效正文：markdown 列为空时从旧版 blocks 懒转换（读路径不落库，保存时固化）。 */
  String effectiveMarkdown(String id){
    return db.query("SELECT markdown,blocks FROM article WHERE id=?",(r,n)->{
      String markdown=r.getString("markdown");
      return markdown==null?ArticleMarkdown.fromBlocksJson(json,r.getString("blocks")):markdown;
    },id).stream().findFirst().orElseThrow(ApiException::notFound);
  }
  String empty(String s){return s==null?"":s.strip();}
  void validate(Input in){
    if(in.title()==null || in.title().isBlank() || in.title().length()>120 || empty(in.summary()).length()>500)throw new ApiException(400,"INVALID_ARTICLE","文章标题或摘要无效");
    if(!empty(in.coverUrl()).isEmpty() && !ContentService.safeImage(in.coverUrl()))throw new ApiException(400,"INVALID_ARTICLE_COVER","封面地址无效");
    if(!empty(in.activityId()).isEmpty() && db.queryForObject("SELECT count(*) FROM activity WHERE id=?",Long.class,in.activityId())==0)throw new ApiException(400,"INVALID_ARTICLE_ACTIVITY","关联活动不存在");
  }
  void requirePublishable(String coverUrl, String markdown) {
    if (!ContentService.safeImage(coverUrl) || markdown == null || markdown.isBlank()) {
      throw new ApiException(400, "ARTICLE_INCOMPLETE", "请填写封面和文章正文");
    }
  }
  void audit(String actor,String id,String action){db.update("INSERT INTO audit_event(id,actor_id,entity_id,action) VALUES(?,?,?,?)",UUID.randomUUID().toString(),actor,id,action);}
  @Transactional public Article create(Input in,String actor){
    validate(in);String id=UUID.randomUUID().toString();
    db.update("INSERT INTO article(id,title,summary,cover_url,activity_id) VALUES(?,?,?,?,?)",id,in.title().strip(),empty(in.summary()),empty(in.coverUrl()),empty(in.activityId()).isEmpty()?null:in.activityId());
    audit(actor,id,"ARTICLE_CREATE");return get(id,true);
  }
  @Transactional public Article update(String id,Input in,String actor){
    lock();
    var old = checkVersion(id, in.version());
    validate(in);
    if (old.status().equals("PUBLISHED")) {
      if (in.markdown() == null) throw ApiException.conflict("ARTICLE_PUBLISHED", PUBLISHED_UPDATE_REQUIRED);
      requirePublishable(empty(in.coverUrl()), in.markdown());
    }
    db.update("""
      UPDATE article SET title=?, summary=?, cover_url=?, activity_id=?,
        markdown=COALESCE(?, markdown), version=version+1, updated_at=CURRENT_TIMESTAMP
      WHERE id=?
      """, in.title().strip(), empty(in.summary()), empty(in.coverUrl()),
      empty(in.activityId()).isEmpty() ? null : in.activityId(), in.markdown(), id);
    audit(actor,id,"ARTICLE_UPDATE");return get(id,true);
  }
  @Transactional public ArticleContent saveContent(String id,ArticleContentInput in,String actor){
    lock();
    var old = checkVersion(id, in.version());
    if (!old.status().equals("DRAFT")) {
      throw ApiException.conflict("ARTICLE_PUBLISHED", PUBLISHED_UPDATE_REQUIRED);
    }
    db.update("UPDATE article SET markdown=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?",in.markdown()==null?"":in.markdown(),id);
    audit(actor,id,"ARTICLE_CONTENT_UPDATE");return content(id);
  }
  @Transactional public Article action(String id,Long version,String action,String actor){
    lock();var old=checkVersion(id,version);
    switch(action){
      case "publish" -> {
        if(!old.status().equals("DRAFT"))throw ApiException.conflict("ARTICLE_PUBLISHED","文章已发布");
        requirePublishable(old.coverUrl(), effectiveMarkdown(id));
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
