CREATE TABLE home_shortcut_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0),
  items TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO home_shortcut_settings(id,items) VALUES (1,'[
 {"slot":1,"name":"本周活动","icon":"WEEKLY","type":"PAGE","page":"WEEKLY","articleId":"","popupTitle":"","popupText":"","popupImageUrl":""},
 {"slot":2,"name":"国内游行","icon":"DOMESTIC","type":"PAGE","page":"DOMESTIC","articleId":"","popupTitle":"","popupText":"","popupImageUrl":""},
 {"slot":3,"name":"二维码","icon":"QRCODE","type":"POPUP","page":"","articleId":"","popupTitle":"二维码","popupText":"","popupImageUrl":""},
 {"slot":4,"name":"野小子","icon":"INTRO","type":"ARTICLE","page":"","articleId":"OFFICIAL","popupTitle":"","popupText":"","popupImageUrl":""}
]');
