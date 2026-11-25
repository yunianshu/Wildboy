CREATE TABLE activity_boarding_point (
    name VARCHAR(200) PRIMARY KEY
);

INSERT INTO activity_boarding_point (name)
SELECT DISTINCT point.name
FROM activity
CROSS JOIN LATERAL json_array_elements_text(activity.boarding_points::json) AS point(name);
