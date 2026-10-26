package com.wildboy;

import static com.wildboy.Models.*;

import java.time.OffsetDateTime;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

@Component
public class DemoData implements ApplicationRunner {
  final ActivityService activities;
  final AuthService auth;
  final boolean enabled;
  final LegalService legal;

  public DemoData(
      ActivityService activities,
      AuthService auth,
      LegalService legal,
      @Value("${wildboy.demo-data:false}") boolean enabled) {
    this.activities = activities;
    this.auth = auth;
    this.legal = legal;
    this.enabled = enabled;
  }

  @Override
  public void run(ApplicationArguments args) {
    if (!enabled || !auth.isDev()) return;
    for (LegalModels.Kind kind : LegalModels.Kind.values()) {
      var state = legal.admin(kind);
      if (state.published() == null && state.draft().revision() == 0) {
        var draft =
            legal.save(
                kind,
                new LegalModels.DraftInput(
                    "【开发演示】" + (kind == LegalModels.Kind.PRIVACY ? "隐私政策" : "用户协议"),
                    "仅供开发环境流程演示，非正式法律条款。请勿作为真实运营协议；上线前由运营方审核并发布适用文本。",
                    0L),
                "demo-seed");
        legal.publish(kind, draft.draft().revision(), "demo-seed");
      }
    }
    if (activities.list(null, 0, 1, true).total() > 0) return;
    String[] titles = {"【演示】周末山野徒步", "【演示】山海国内旅行", "【演示】假日星空露营", "【演示】林间休闲野餐"};
    String[] covers = {
      "/assets/category-weekly.jpg",
      "/assets/category-domestic.jpg",
      "/assets/category-holiday.jpg",
      "/assets/category-leisure.jpg"
    };
    int index = 0;
    for (Category category : Category.values()) {
      OffsetDateTime start =
          OffsetDateTime.now()
              .plusDays(7 + index * 2)
              .withHour(9)
              .withMinute(0)
              .withSecond(0)
              .withNano(0);
      var in =
          new ActivityInput(
              titles[index],
              category,
              covers[index],
              List.of(covers[index]),
              "示例活动，请勿作为真实出行安排",
              "仅供界面与流程演示。实际活动路线、风险告知与装备要求由组织者填写。",
              "示例目的地",
              "示例集合点",
              start,
              start.plusHours(6),
              start.minusDays(1),
              20,
              0,
              null);
      Activity a = activities.create(in, "demo-seed");
      activities.publish(a.id(), a.version(), "demo-seed");
      index++;
    }
  }
}
