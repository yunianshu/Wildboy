-- Preserve all historical queue, registration and notification records. The retired feature
-- must neither deliver pending messages nor turn old records into current activity notices.
ALTER TABLE notification_outbox ADD COLUMN retired_at TIMESTAMPTZ;

UPDATE notification_outbox
SET retired_at = CURRENT_TIMESTAMP,
    status = CASE WHEN status IN ('PENDING','SENDING','FAILED','NO_PERMISSION','UNCONFIGURED','UNKNOWN')
                  THEN 'OBSOLETE' ELSE status END,
    last_error = CASE WHEN status IN ('PENDING','SENDING','FAILED','NO_PERMISSION','UNCONFIGURED','UNKNOWN')
                      THEN '功能已停用，不再发送' ELSE last_error END,
    updated_at = CURRENT_TIMESTAMP
WHERE LEFT(kind, 9) = 'WAITLIST_'
   OR dedupe_key LIKE 'waitlist:%'
   OR dedupe_key LIKE 'cancel-wait:%';
