package com.wildboy;

import static com.wildboy.MembershipModels.*;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class MembershipService {
  private final JdbcTemplate db;
  private final ActivityService activities;
  public MembershipService(JdbcTemplate db, ActivityService activities) { this.db=db; this.activities=activities; }

  private Tier mapTier(ResultSet r, int n) throws SQLException {
    String id=r.getString("id");
    var rules=db.query("SELECT * FROM membership_pricing_rule WHERE tier_id=? ORDER BY scope",
        (row,index)->new PricingRule(Scope.valueOf(row.getString("scope")),row.getBoolean("enabled"),
            PricingMode.valueOf(row.getString("pricing_mode")),row.getInt("pricing_value"),row.getString("participant_pricing")),id);
    return new Tier(id,r.getString("name"),r.getInt("sort_order"),r.getBoolean("enabled"),rules,r.getLong("version"));
  }
  private MembershipUser mapUser(ResultSet r, int n) throws SQLException {
    return new MembershipUser(r.getString("id"),r.getString("nickname"),r.getString("customer_type"),
        r.getString("membership_tier_id"),r.getString("tier_name"),r.getBoolean("tier_enabled"),
        r.getLong("membership_version"),r.getObject("created_at",OffsetDateTime.class));
  }
  private static final String USER_SELECT="SELECT u.*,t.name AS tier_name,COALESCE(t.enabled,FALSE) AS tier_enabled FROM app_user u LEFT JOIN membership_tier t ON t.id=u.membership_tier_id";
  @Transactional(readOnly=true, isolation=org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
  public List<Tier> tiers() { return db.query("SELECT * FROM membership_tier ORDER BY sort_order,name,id",this::mapTier); }
  private Tier tier(String id, boolean lock) {
    return db.query("SELECT * FROM membership_tier WHERE id=?"+(lock?" FOR SHARE":""),this::mapTier,id)
        .stream().findFirst().orElseThrow(ApiException::notFound);
  }
  private void validate(TierInput input) {
    if(input.name()==null || input.name().strip().isEmpty() || input.name().strip().length()>40 || input.sortOrder()<0 || input.sortOrder()>10000)
      throw new ApiException(400,"INVALID_TIER","请填写1–40字等级名称和有效排序");
    if(input.rules()==null || input.rules().size()!=Scope.values().length) throw new ApiException(400,"INVALID_PRICING_RULES","活动和商品须分别设置");
    var scopes=EnumSet.noneOf(Scope.class);
    for(var rule:input.rules()) {
      if(rule==null || rule.scope()==null || !scopes.add(rule.scope()) || rule.pricingMode()==null || rule.pricingValue()<0 || rule.pricingValue()>100000000
          || (rule.pricingMode()==PricingMode.DISCOUNT && (rule.pricingValue()<1 || rule.pricingValue()>10000)))
        throw new ApiException(400,"INVALID_PRICING_RULES","优惠数值或业务范围无效，折扣须在0.001至10折之间");
      if ((rule.participantPricing()!=null && (rule.scope()!=Scope.ACTIVITY || !Set.of("ACCOUNT_ALL","ONE_BENEFIT").contains(rule.participantPricing())))
          || (rule.scope()==Scope.ACTIVITY && rule.enabled() && rule.participantPricing()==null))
        throw new ApiException(400,"PARTICIPANT_PRICING_REQUIRED","启用活动优惠时，请明确选择每单1个优惠名额或同行全部享优惠");
    }
  }
  @Transactional
  public Tier create(TierInput input,String actor) {
    validate(input);
    String id=UUID.randomUUID().toString();
    db.update("INSERT INTO membership_tier(id,name,sort_order,enabled) VALUES(?,?,?,?)",id,input.name().strip(),input.sortOrder(),input.enabled());
    saveRules(id,input.rules()); activities.audit(actor,id,"MEMBERSHIP_TIER_CREATE"); return tier(id,false);
  }
  @Transactional
  public Tier edit(String id,TierInput input,String actor) {
    validate(input);
    Long version=db.query("SELECT version FROM membership_tier WHERE id=? FOR UPDATE",(r,n)->r.getLong(1),id).stream().findFirst().orElseThrow(ApiException::notFound);
    if(input.version()==null || !input.version().equals(version)) throw ApiException.conflict("STALE_VERSION","等级已被修改，请重新加载后保存");
    db.update("UPDATE membership_tier SET name=?,sort_order=?,enabled=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?",input.name().strip(),input.sortOrder(),input.enabled(),id);
    saveRules(id,input.rules()); activities.audit(actor,id,"MEMBERSHIP_TIER_EDIT"); return tier(id,false);
  }
  private void saveRules(String id,List<PricingRule> rules) {
    for(var rule:rules) db.update("INSERT INTO membership_pricing_rule(tier_id,scope,enabled,pricing_mode,pricing_value,participant_pricing) VALUES(?,?,?,?,?,?) ON CONFLICT(tier_id,scope) DO UPDATE SET enabled=EXCLUDED.enabled,pricing_mode=EXCLUDED.pricing_mode,pricing_value=EXCLUDED.pricing_value,participant_pricing=EXCLUDED.participant_pricing",
        id,rule.scope().name(),rule.enabled(),rule.pricingMode().name(),rule.pricingValue(),rule.participantPricing());
  }
  public MembershipUser me(String id) {
    return db.query(USER_SELECT+" WHERE u.id=?",this::mapUser,id).stream().findFirst().orElseThrow(ApiException::notFound);
  }
  public Models.Page<MembershipUser> users(String query,CustomerType type,int page,int size) {
    ActivityService.pageCheck(page,size);
    if(query!=null && query.length()>80) throw new ApiException(400,"INVALID_SEARCH","搜索最多80字");
    String where=" WHERE u.role='USER'"; var args=new ArrayList<Object>();
    if(query!=null && !query.isBlank()) {
      where+=" AND (u.id=? OR u.nickname ILIKE ? ESCAPE '!')";
      args.add(query.strip());args.add("%"+query.strip().replace("!","!!").replace("%","!%").replace("_","!_")+"%");
    }
    if(type!=null) {where+=" AND u.customer_type=?";args.add(type.name());}
    long total=db.queryForObject("SELECT COUNT(*) FROM app_user u"+where,Long.class,args.toArray());
    args.add(size);args.add((long)page*size);
    var items=db.query(USER_SELECT+where+" ORDER BY u.created_at DESC,u.id LIMIT ? OFFSET ?",this::mapUser,args.toArray());
    return new Models.Page<>(items,total,page,size,(long)(page+1)*size<total);
  }
  @Transactional
  public MembershipUser assign(String id,Assignment input,String actor) {
    var current=db.query("SELECT membership_version FROM app_user WHERE id=? AND role='USER' FOR UPDATE",(r,n)->r.getLong(1),id).stream().findFirst().orElseThrow(ApiException::notFound);
    if(input.version()==null || !input.version().equals(current)) throw ApiException.conflict("STALE_VERSION","用户身份已被修改，请重新加载后保存");
    if(input.customerType()==null) throw new ApiException(400,"INVALID_MEMBERSHIP","请选择用户身份");
    String tierId=input.tierId();
    if(input.customerType()==CustomerType.MEMBER) {
      if(tierId==null || tierId.isBlank()) throw new ApiException(400,"TIER_REQUIRED","会员必须选择等级");
      if(!tier(tierId,true).enabled()) throw ApiException.conflict("TIER_DISABLED","该会员等级已停用");
    } else if(tierId!=null && !tierId.isBlank()) throw new ApiException(400,"INVALID_MEMBERSHIP","仅会员可以设置会员等级");
    else tierId=null;
    db.update("UPDATE app_user SET customer_type=?,membership_tier_id=?,membership_version=membership_version+1 WHERE id=?",input.customerType().name(),tierId,id);
    activities.audit(actor,id,"MEMBERSHIP_ASSIGN");return me(id);
  }
  @Transactional
  public String activityParticipantPricing(String userId) {
    var user=db.query("SELECT customer_type,membership_tier_id FROM app_user WHERE id=? FOR SHARE",(r,n)->new String[]{r.getString(1),r.getString(2)},userId).stream().findFirst().orElseThrow(ApiException::notFound);
    if(!"MEMBER".equals(user[0]) || user[1]==null) return null;
    var tier=tier(user[1],true);
    if(!tier.enabled()) return null;
    return tier.rules().stream().filter(r->r.scope()==Scope.ACTIVITY && r.enabled()).map(PricingRule::participantPricing).findFirst().orElse(null);
  }

  // Lock order: app_user -> membership_tier -> commerce resource. Admin edits never lock in reverse.
  // Public quotations are estimates; order creation always re-runs this inside its own transaction.
  @Transactional
  public Pricing price(String userId,Scope scope,int basePriceCents) {
    if(scope==null || basePriceCents<0 || basePriceCents>100000000) throw new ApiException(400,"INVALID_PRICE","金额或业务范围无效");
    var user=db.query("SELECT customer_type,membership_tier_id FROM app_user WHERE id=? FOR SHARE",(r,n)->new String[]{r.getString(1),r.getString(2)},userId).stream().findFirst().orElseThrow(ApiException::notFound);
    var original=new Pricing(basePriceCents,basePriceCents,null,null,null,null,null);
    if(!"MEMBER".equals(user[0]) || user[1]==null) return original;
    var tier=tier(user[1],true);
    if(!tier.enabled()) return original;
    var rule=tier.rules().stream().filter(r->r.scope()==scope && r.enabled()).findFirst().orElse(null);
    if(rule==null) return original;
    long price=switch(rule.pricingMode()) {
      case DISCOUNT -> ((long)basePriceCents*rule.pricingValue()+5000)/10000;
      case FIXED -> Math.min(basePriceCents,rule.pricingValue());
      case REDUCTION -> Math.max(0,basePriceCents-rule.pricingValue());
    };
    return new Pricing(basePriceCents,(int)price,tier.id(),tier.name(),tier.version(),rule.pricingMode().name(),rule.pricingValue());
  }
}
