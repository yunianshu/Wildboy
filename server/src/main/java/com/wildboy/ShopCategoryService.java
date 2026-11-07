package com.wildboy;

import static com.wildboy.ShopCategoryModels.*;

import java.util.*;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ShopCategoryService {
  public static final String DEFAULT_ID = "uncategorized";
  private final JdbcTemplate db;
  private final ActivityService audit;
  private static final String SELECT = "SELECT c.*,(SELECT COUNT(*) FROM product p WHERE p.category_id=c.id) AS product_count FROM product_category c";
  private final RowMapper<AdminCategory> mapper = (r,n) -> new AdminCategory(r.getString("id"),
      r.getString("name"), r.getInt("sort_order"), r.getLong("version"), r.getLong("product_count"));

  public ShopCategoryService(JdbcTemplate db, ActivityService audit) { this.db=db; this.audit=audit; }

  public List<Category> categories() {
    return db.query("SELECT * FROM product_category ORDER BY sort_order,lower(name),id",
        (r,n) -> new Category(r.getString("id"), r.getString("name"), r.getInt("sort_order"), r.getLong("version")));
  }
  public List<AdminCategory> adminCategories() {
    return db.query(SELECT + " ORDER BY c.sort_order,lower(c.name),c.id", mapper);
  }
  public void requireExists(String id) {
    if (id == null || id.isBlank() || !Boolean.TRUE.equals(db.queryForObject(
        "SELECT EXISTS(SELECT 1 FROM product_category WHERE id=?)", Boolean.class, id)))
      throw new ApiException(400, "CATEGORY_NOT_FOUND", "商品分类不存在，请重新选择");
  }
  private AdminCategory get(String id) {
    return db.query(SELECT + " WHERE c.id=?", mapper, id).stream().findFirst()
        .orElseThrow(() -> new ApiException(400, "CATEGORY_NOT_FOUND", "商品分类不存在，请刷新"));
  }
  private String name(String value) {
    String clean = value == null ? "" : value.strip();
    if (clean.isEmpty() || clean.length()>40 || clean.codePoints().anyMatch(c ->
        Character.isISOControl(c) || Character.getType(c)==Character.FORMAT))
      throw new ApiException(400,"INVALID_CATEGORY_NAME","分类名称须为1–40字且不含控制字符");
    return clean;
  }
  private void sort(Integer value) {
    if (value == null || value<0 || value>9999)
      throw new ApiException(400,"INVALID_CATEGORY_SORT_ORDER","分类排序须为0–9999的整数");
  }

  @Transactional public AdminCategory create(CreateInput input, String actor) {
    String name=name(input.name()); sort(input.sortOrder()); String id=UUID.randomUUID().toString();
    try { db.update("INSERT INTO product_category(id,name,sort_order) VALUES(?,?,?)", id,name,input.sortOrder()); }
    catch (DuplicateKeyException e) { throw ApiException.conflict("CATEGORY_NAME_EXISTS","分类名称已存在"); }
    audit.audit(actor,id,"PRODUCT_CATEGORY_CREATE"); return get(id);
  }

  @Transactional public AdminCategory update(String id, UpdateInput input, String actor) {
    String name=name(input.name()); sort(input.sortOrder());
    var versions=db.queryForList("SELECT version FROM product_category WHERE id=? FOR UPDATE",Long.class,id);
    if (versions.isEmpty()) throw new ApiException(400,"CATEGORY_NOT_FOUND","商品分类不存在，请刷新");
    if (input.version()==null || !input.version().equals(versions.getFirst()))
      throw ApiException.conflict("STALE_VERSION","分类已更新，请刷新后核对");
    try { db.update("UPDATE product_category SET name=?,sort_order=?,version=version+1 WHERE id=?",name,input.sortOrder(),id); }
    catch (DuplicateKeyException e) { throw ApiException.conflict("CATEGORY_NAME_EXISTS","分类名称已存在"); }
    audit.audit(actor,id,"PRODUCT_CATEGORY_EDIT"); return get(id);
  }
}
