-- Follow-up tracking, email preferences and email/backup bookkeeping.

ALTER TABLE users ADD COLUMN notify_email INTEGER NOT NULL DEFAULT 1 CHECK (notify_email IN (0, 1));

-- Local (dealership time zone) date the enquiry was marked sold, for "cars sold this month".
ALTER TABLE enquiries ADD COLUMN sold_date TEXT;
CREATE INDEX idx_enquiries_sold_date ON enquiries (sold_date);
CREATE INDEX idx_enquiries_entry_date ON enquiries (entry_date);

-- For follow-up activities: the date the follow-up was due, so on-time compliance can be reported.
ALTER TABLE activities ADD COLUMN followup_due TEXT;
-- Local date the activity happened.
ALTER TABLE activities ADD COLUMN local_date TEXT;

-- One row per email sent (or attempted), so each digest goes out once per day per person.
CREATE TABLE email_log (
  id         INTEGER PRIMARY KEY,
  kind       TEXT NOT NULL,
  user_id    INTEGER REFERENCES users(id),
  day        TEXT NOT NULL,
  status     TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
  detail     TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE UNIQUE INDEX idx_email_log_once ON email_log (kind, IFNULL(user_id, 0), day) WHERE status = 'sent';

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('email.enabled', '0'),
  ('email.smtp_host', ''),
  ('email.smtp_port', '587'),
  ('email.smtp_secure', '0'),
  ('email.smtp_user', ''),
  ('email.smtp_password', ''),
  ('email.from', ''),
  ('email.morning_time', '07:30'),
  ('email.eod_time', '18:00'),
  ('email.app_url', ''),
  ('backup.time', '02:00'),
  ('backup.keep_daily', '30'),
  ('backup.keep_monthly', '12');
