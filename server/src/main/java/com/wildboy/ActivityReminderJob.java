package com.wildboy;
import org.springframework.stereotype.Component;
import org.springframework.scheduling.annotation.Scheduled;
@Component
public class ActivityReminderJob {
  private String waitlistCursor="", reminderCursor="";
  final org.springframework.jdbc.core.JdbcTemplate db;final WaitlistService waitlists;final ActivityService activities;final NotificationService notifications;
  public ActivityReminderJob(WaitlistService w,ActivityService a,NotificationService n,org.springframework.jdbc.core.JdbcTemplate db){this.db=db;waitlists=w;activities=a;notifications=n;}
  @Scheduled(fixedDelayString="${wildboy.notifications.scan-ms:60000}",initialDelayString="${wildboy.notifications.scan-ms:60000}")
  public void scan(){
    var queued=db.queryForList("SELECT DISTINCT activity_id FROM activity_waitlist WHERE status IN ('WAITING','OFFERED') AND activity_id>? ORDER BY activity_id LIMIT 100",String.class,waitlistCursor);
    for(String id:queued) {try{waitlists.promote(id);}catch(RuntimeException ignored){}}
    waitlistCursor=queued.size()<100?"":queued.getLast();
    var upcoming=db.queryForList("SELECT id FROM activity WHERE status='PUBLISHED' AND start_at>CURRENT_TIMESTAMP AND start_at<=CURRENT_TIMESTAMP+INTERVAL '24 hours' AND id>? ORDER BY id LIMIT 100",String.class,reminderCursor);
    for(String id:upcoming) {
      var a=activities.get(id,true); notifications.activityNotice(a,"PRETRIP","活动即将开始，请确认集合安排");
    }
    reminderCursor=upcoming.size()<100?"":upcoming.getLast();
    notifications.scan();
  }
}
