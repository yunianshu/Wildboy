ALTER TABLE activity ADD COLUMN identity_required BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE activity ALTER COLUMN identity_required SET DEFAULT FALSE;
ALTER TABLE registration_participant ALTER COLUMN id_number TYPE VARCHAR(512);
ALTER TABLE registration_participant DROP CONSTRAINT registration_participant_registration_id_id_number_key;
CREATE INDEX participant_registration_idx ON registration_participant(registration_id);
