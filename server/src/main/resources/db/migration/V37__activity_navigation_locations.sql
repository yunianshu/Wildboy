ALTER TABLE activity
  ADD COLUMN navigation_points TEXT NOT NULL DEFAULT '[]';

ALTER TABLE activity_boarding_point
  ADD COLUMN address VARCHAR(300) NOT NULL DEFAULT '',
  ADD COLUMN latitude DOUBLE PRECISION,
  ADD COLUMN longitude DOUBLE PRECISION;

ALTER TABLE activity_template
  ADD COLUMN navigation_points TEXT NOT NULL DEFAULT '[]';
