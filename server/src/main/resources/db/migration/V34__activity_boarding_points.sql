ALTER TABLE activity ADD COLUMN boarding_points TEXT NOT NULL DEFAULT '[]';
ALTER TABLE registration_participant ADD COLUMN boarding_point VARCHAR(200);
ALTER TABLE activity_order_participant ADD COLUMN boarding_point VARCHAR(200);
