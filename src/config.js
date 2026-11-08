const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const isProduction = process.env.NODE_ENV === 'production';
const dataDir = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));

// The signing secret comes from JWT_SECRET. If it isn't set (local install), a random one is
// generated once and kept in the data folder, so logins survive restarts. It is never logged.
function loadSecret() {
  if (process.env.JWT_SECRET) {
    if (process.env.JWT_SECRET.length < 32) throw new Error('JWT_SECRET must be at least 32 characters');
    return process.env.JWT_SECRET;
  }
  fs.mkdirSync(dataDir, { recursive: true });
  const file = path.join(dataDir, '.session-secret');
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  const secret = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

module.exports = {
  isProduction,
  dataDir,
  port: Number(process.env.PORT) || 3000,
  dbPath: process.env.DB_PATH || path.join(dataDir, 'sunco-crm.db'),
  // Put this on a different drive or a synced cloud folder so backups survive a server failure.
  backupDir: path.resolve(process.env.BACKUP_DIR || path.join(dataDir, 'backups')),
  loadSecret,
  // Secure (HTTPS-only) cookies in production unless explicitly turned off for a plain-HTTP local network.
  cookieSecure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : isProduction,
  trustProxy: process.env.TRUST_PROXY === 'true',
};
