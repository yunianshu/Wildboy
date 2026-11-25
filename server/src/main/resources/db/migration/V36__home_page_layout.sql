CREATE TABLE home_page_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0),
  config_json TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO home_page_settings (id, config_json) VALUES (
  1,
  '{
    "modules": [
      {"id": "HERO", "enabled": true},
      {"id": "SHORTCUTS", "enabled": true},
      {"id": "ACTIVITIES", "enabled": true},
      {"id": "SHOP", "enabled": true},
      {"id": "GALLERY", "enabled": true},
      {"id": "FOOTER", "enabled": true}
    ],
    "hero": {
      "imageUrl": "/assets/hero-hiking.jpg",
      "brandName": "野小子",
      "brandCaption": "野一点，自由一点",
      "kicker": "WILDBOY / OUTDOOR CLUB",
      "title": "去山野，找回自己。",
      "subtitle": "把日常留在身后 · 一起走出去",
      "action": {"type": "NONE", "page": "", "activityId": "", "articleId": "", "wechatArticleUrl": "", "popupTitle": "", "popupText": "", "popupImages": []}
    },
    "shortcuts": {
      "columns": 4,
      "items": [
        {"id": "slot-1", "name": "本周活动", "icon": "WEEKLY", "imageUrl": "", "type": "PAGE", "page": "WEEKLY", "activityId": "", "articleId": "", "wechatArticleUrl": "", "popupTitle": "", "popupText": "", "popupImageUrl": "", "popupImages": []},
        {"id": "slot-2", "name": "国内游行", "icon": "DOMESTIC", "imageUrl": "", "type": "PAGE", "page": "DOMESTIC", "activityId": "", "articleId": "", "wechatArticleUrl": "", "popupTitle": "", "popupText": "", "popupImageUrl": "", "popupImages": []},
        {"id": "slot-3", "name": "二维码", "icon": "QRCODE", "imageUrl": "", "type": "POPUP", "page": "", "activityId": "", "articleId": "", "wechatArticleUrl": "", "popupTitle": "二维码", "popupText": "", "popupImageUrl": "", "popupImages": []},
        {"id": "slot-4", "name": "野小子", "icon": "INTRO", "imageUrl": "", "type": "ARTICLE", "page": "", "activityId": "", "articleId": "OFFICIAL", "wechatArticleUrl": "", "popupTitle": "", "popupText": "", "popupImageUrl": "", "popupImages": []}
      ]
    },
    "activities": {
      "eyebrow": "FIND YOUR NEXT ADVENTURE",
      "title": "正在发生的山野",
      "showAllLink": true,
      "maxCount": 6,
      "autoFill": true,
      "featuredActivityIds": []
    },
    "shop": {
      "showBanner": true,
      "bannerImageUrl": "/assets/equipment-banner.jpg",
      "bannerTag": "山野好物 · 轻装出发",
      "bannerTitle": "把山野，装进行囊",
      "bannerCta": "去逛逛",
      "showProducts": true,
      "maxCount": 4,
      "autoFill": true,
      "featuredProductIds": []
    },
    "gallery": {
      "eyebrow": "MOMENTS OUTSIDE",
      "title": "山野之间",
      "mode": "AUTO_ARTICLES",
      "slides": []
    },
    "footer": {
      "followEnabled": false,
      "followTitle": "关注野小子",
      "followSubtitle": "长按识别二维码 · 获取最新山野路线与动态",
      "followQrcodes": [],
      "brandEnabled": true,
      "brandImageUrl": "/assets/platform-brand-original-transparent.png",
      "brandWidthPx": 216
    }
  }'
);
