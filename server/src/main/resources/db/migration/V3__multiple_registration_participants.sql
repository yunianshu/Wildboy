CREATE TABLE registration_participant (
  id VARCHAR(36) PRIMARY KEY,
  registration_id VARCHAR(36) NOT NULL REFERENCES registration(id) ON DELETE CASCADE,
  participant_name VARCHAR(80) NOT NULL,
  id_number VARCHAR(18) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  position INTEGER NOT NULL CHECK(position >= 0),
  UNIQUE(registration_id, id_number),
  UNIQUE(registration_id, position)
);
INSERT INTO registration_participant(id,registration_id,participant_name,id_number,phone,position)
SELECT id,id,participant_name,'',phone,0 FROM registration;
ALTER TABLE registration DROP COLUMN participant_name;
ALTER TABLE registration DROP COLUMN phone;
