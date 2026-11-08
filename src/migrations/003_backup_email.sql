-- Emailing the nightly backup off-site.
INSERT OR IGNORE INTO settings (key, value) VALUES
  ('backup.email_enabled', '0'),
  ('backup.email_to', ''),
  ('backup.email_passphrase', ''),
  ('backup.email_max_mb', '20');
