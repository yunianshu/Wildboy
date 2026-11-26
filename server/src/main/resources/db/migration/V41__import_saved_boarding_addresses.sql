-- Recover addresses picked in the former activity editor under its default meeting label.
-- Leave signed-up participants and the original activity and template snapshots intact.
WITH snapshots AS (
  SELECT navigation_points::jsonb AS points, updated_at, id FROM activity
  UNION ALL
  SELECT payload::jsonb -> 'navigationPoints', updated_at, id FROM activity_template
), locations AS (
  SELECT btrim(point ->> 'address') AS address,
         (point ->> 'latitude')::double precision AS latitude,
         (point ->> 'longitude')::double precision AS longitude,
         updated_at, id, position
  FROM snapshots
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(points) = 'array' THEN points ELSE '[]'::jsonb END
  ) WITH ORDINALITY AS entry(point, position)
  WHERE point ->> 'kind' = 'MEETING' AND point ->> 'label' = '示例集合点'
)
INSERT INTO activity_boarding_point(name, address, latitude, longitude)
SELECT DISTINCT ON (address)
       CASE WHEN char_length(address) <= 200 THEN address ELSE left(address, 160) || '…' || md5(address) END,
       address, latitude, longitude
FROM locations
WHERE char_length(address) BETWEEN 1 AND 300 AND address <> '示例集合点'
  AND NOT EXISTS (SELECT 1 FROM activity_boarding_point saved WHERE saved.address = locations.address)
ORDER BY address, (latitude IS NOT NULL AND longitude IS NOT NULL) DESC, updated_at DESC, id, position
ON CONFLICT (name) DO UPDATE SET
  address = EXCLUDED.address, latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude
WHERE activity_boarding_point.address = '' AND activity_boarding_point.latitude IS NULL;
