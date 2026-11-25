-- V36 seeded a new layout without importing the four existing shortcut slots.
-- Match each surviving slot by stable ID. The new editor wins when both
-- editors changed the same slot, and retains its order, removals and additions.
WITH seeded_shortcuts AS (
  SELECT n, jsonb_build_object(
    'id', 'slot-' || n, 'name', name, 'icon', icon, 'type', kind, 'page', page,
    'articleId', article, 'popupTitle', title, 'imageUrl', '', 'activityId', '',
    'wechatArticleUrl', '', 'popupText', '', 'popupImageUrl', '', 'popupImages', '[]'::jsonb
  ) AS item
  FROM (VALUES
    (1, '本周活动', 'WEEKLY', 'PAGE', 'WEEKLY', '', ''),
    (2, '国内游行', 'DOMESTIC', 'PAGE', 'DOMESTIC', '', ''),
    (3, '二维码', 'QRCODE', 'POPUP', '', '', '二维码'),
    (4, '野小子', 'INTRO', 'ARTICLE', '', 'OFFICIAL', '')
  ) AS slots(n, name, icon, kind, page, article, title)
)
UPDATE home_page_settings AS layout
SET config_json = jsonb_set(layout.config_json::jsonb, '{shortcuts,items}', (
        SELECT jsonb_agg(
          CASE WHEN slot IS NULL THEN modern.item ELSE
            (slot - 'slot') || jsonb_build_object(
            'id', 'slot-' || (slot->>'slot'),
            'imageUrl', '', 'activityId', '', 'wechatArticleUrl', '',
            'popupImages', CASE WHEN COALESCE(slot->>'popupImageUrl', '') <> ''
              THEN jsonb_build_array(jsonb_build_object('url', slot->>'popupImageUrl', 'label', ''))
              ELSE '[]'::jsonb END)
          END ORDER BY modern.position)
        FROM jsonb_array_elements(layout.config_json::jsonb #> '{shortcuts,items}')
          WITH ORDINALITY AS modern(item, position)
        LEFT JOIN seeded_shortcuts AS seed ON seed.item = modern.item
        LEFT JOIN jsonb_array_elements(legacy.items::jsonb) AS entries(slot)
          ON seed.n = (slot->>'slot')::integer
      ))::text,
    version = GREATEST(layout.version, legacy.version) + 1,
    updated_at = CURRENT_TIMESTAMP
FROM home_shortcut_settings AS legacy
WHERE layout.id = legacy.id AND (legacy.version > 0 OR layout.version > 0);
