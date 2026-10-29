package com.wildboy;

import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class OperationsService {
  final JdbcTemplate db;
  public OperationsService(JdbcTemplate db){this.db=db;}
  @org.springframework.transaction.annotation.Transactional(readOnly=true,isolation=org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
  public Map<String,Object> dashboard(int days){
    if(!List.of(7,14,30).contains(days))throw new ApiException(400,"INVALID_RANGE","仅支持近 7、14、30 天");
    var result=new LinkedHashMap<String,Object>(); result.put("days",days);
    result.put("activities",db.queryForMap("SELECT COUNT(*) AS total,COALESCE(SUM(registered_count),0) AS registrations,COALESCE(SUM(capacity),0) AS capacity,COUNT(*) FILTER (WHERE registered_count>=capacity) AS full FROM activity WHERE status='PUBLISHED' AND start_at>=CURRENT_TIMESTAMP"));
    result.put("orders",db.queryForMap("SELECT COUNT(*) FILTER (WHERE status IN ('PAID','SHIPPED','REFUNDED')) AS paid_orders,COALESCE(SUM(total_cents) FILTER (WHERE status IN ('PAID','SHIPPED','REFUNDED')),0) AS gross_cents,COALESCE(SUM(total_cents) FILTER (WHERE status='REFUNDED'),0) AS refunded_cents FROM shop_order WHERE paid_at>=CURRENT_TIMESTAMP-(? * INTERVAL '1 day')",days));
    result.put("pendingShipping",db.queryForObject("SELECT COUNT(*) FROM shop_order WHERE status='PAID' AND NOT EXISTS(SELECT 1 FROM refund_request r WHERE r.order_id=shop_order.id AND r.status IN ('REQUESTED','PROCESSING','UNKNOWN','ABNORMAL'))",Long.class));
    result.put("lowStock",db.queryForList("SELECT id,name,stock FROM product WHERE status='ON_SALE' AND stock<=5 ORDER BY stock,id LIMIT 20"));
    result.put("trend",db.queryForList("SELECT to_char(paid_at AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD') AS day,COUNT(*) AS orders,COALESCE(SUM(total_cents),0) AS gross_cents,COALESCE(SUM(total_cents) FILTER(WHERE status='REFUNDED'),0) AS refunded_cents FROM shop_order WHERE paid_at>=CURRENT_TIMESTAMP-(? * INTERVAL '1 day') AND status IN ('PAID','SHIPPED','REFUNDED') GROUP BY 1 ORDER BY 1",days));
    return result;
  }
  static final String EXCEPTIONS="SELECT 'PAYMENT' AS kind,id AS id,id AS entity_id, '待核对支付' AS message,'UNKNOWN' AS status,version,updated_at FROM shop_order WHERE reconciliation_required=true UNION ALL SELECT 'REFUND',id,order_id,'退款待处理',status,version,updated_at FROM refund_request WHERE status IN ('REQUESTED','UNKNOWN','ABNORMAL') UNION ALL SELECT 'NOTIFICATION',id,activity_id,'通知未送达',status,0 AS version,created_at AS updated_at FROM notification_outbox WHERE status IN ('FAILED','UNCONFIGURED','UNKNOWN','NO_PERMISSION')";
  public Models.Page<Map<String,Object>> exceptions(int page,int size){ ActivityService.pageCheck(page,size);long total=db.queryForObject("SELECT COUNT(*) FROM ("+EXCEPTIONS+") q",Long.class);return new Models.Page<>(db.queryForList("SELECT * FROM ("+EXCEPTIONS+") q ORDER BY updated_at DESC,id LIMIT ? OFFSET ?",size,page*size),total,page,size,(long)(page+1)*size<total); }
  public Models.Page<Map<String,Object>> audit(int page,int size,String entityId){
    ActivityService.pageCheck(page,size); if(entityId!=null && (entityId.length()>80 || entityId.isBlank()))throw new ApiException(400,"INVALID_ENTITY","记录编号无效");
    String where=entityId==null?"":" WHERE a.entity_id=?"; var args=new ArrayList<Object>();if(entityId!=null)args.add(entityId);
    long total=db.queryForObject("SELECT COUNT(*) FROM audit_event a"+where,Long.class,args.toArray());args.add(size);args.add(page*size);
    return new Models.Page<>(db.queryForList("SELECT a.id,a.actor_id,a.entity_id,a.action,a.created_at,COALESCE(u.nickname,'系统') AS actor FROM audit_event a LEFT JOIN app_user u ON a.actor_id=u.id"+where+" ORDER BY a.created_at DESC,a.id LIMIT ? OFFSET ?",args.toArray()),total,page,size,(long)(page+1)*size<total);
  }
}
