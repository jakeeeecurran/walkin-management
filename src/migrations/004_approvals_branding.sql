-- Sold/Lost by a salesperson waits for their sales manager's approval.
ALTER TABLE enquiries ADD COLUMN pending_outcome TEXT CHECK (pending_outcome IN ('sold', 'lost'));
ALTER TABLE enquiries ADD COLUMN pending_lost_reason_id INTEGER REFERENCES lookup_values(id);
ALTER TABLE enquiries ADD COLUMN pending_note TEXT;
ALTER TABLE enquiries ADD COLUMN pending_by INTEGER REFERENCES users(id);
ALTER TABLE enquiries ADD COLUMN pending_at TEXT;
ALTER TABLE enquiries ADD COLUMN pending_date TEXT;
CREATE INDEX idx_enquiries_pending ON enquiries (pending_outcome);

-- Activity types for the approval steps (SQLite can't change a CHECK, so the table is rebuilt).
CREATE TABLE activities_new (
  id           INTEGER PRIMARY KEY,
  enquiry_id   INTEGER NOT NULL REFERENCES enquiries(id),
  user_id      INTEGER NOT NULL REFERENCES users(id),
  type         TEXT NOT NULL CHECK (type IN ('created', 'comment', 'call', 'email', 'sms', 'followup_done', 'status_change', 'edited', 'reassigned', 'invalid', 'approval_requested', 'approved', 'declined', 'request_withdrawn')),
  body         TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  followup_due TEXT,
  local_date   TEXT
);
INSERT INTO activities_new (id, enquiry_id, user_id, type, body, created_at, followup_due, local_date)
  SELECT id, enquiry_id, user_id, type, body, created_at, followup_due, local_date FROM activities;
DROP TABLE activities;
ALTER TABLE activities_new RENAME TO activities;
CREATE INDEX idx_activities_enquiry ON activities (enquiry_id, created_at);

-- Sunco Motors logo and colours (only where still on the original defaults).
UPDATE settings SET value = '/sunco-logo.png' WHERE key = 'branding.logo_url' AND value = '';
UPDATE settings SET value = '#D81E05' WHERE key = 'branding.primary_colour' AND value IN ('#0B3D91', '#0b3d91');
UPDATE settings SET value = '#F7A21B' WHERE key = 'branding.accent_colour' AND value IN ('#F5A623', '#f5a623');
