// Database backups: full copies of the database file, made with SQLite's VACUUM INTO
// (safe while the app is running). Nightly copies are pruned to N daily + M monthly.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { pack, unpack, EXTENSION } = require('../lib/backupfile');
const { getSetting } = require('../lib/settings');
const { transaction, migrate } = require('../db');

const NAME = /^sunco-crm-(\d{4}-\d{2}-\d{2})-(\d{6})-(nightly|manual|pre-restore)\.db$/;

// Tables restored from a backup, in an order that respects foreign keys.
const TABLES = [
  'locations', 'brands', 'franchises', 'models', 'used_makes', 'used_models', 'users', 'user_franchises',
  'lookup_values', 'enquiries', 'activities', 'settings', 'audit_log', 'email_log',
];

function createBackupService({ db, dir }) {
  fs.mkdirSync(dir, { recursive: true });

  function stamp() {
    const tz = getSetting(db, 'timezone', 'Australia/Brisbane');
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
        .formatToParts(new Date())
        .map((p) => [p.type, p.value])
    );
    return `${parts.year}-${parts.month}-${parts.day}-${parts.hour}${parts.minute}${parts.second}`;
  }

  function create(kind = 'manual') {
    let name = `sunco-crm-${stamp()}-${kind}.db`;
    let file = path.join(dir, name);
    for (let i = 1; fs.existsSync(file); i++) {
      // Two backups in the same second: nudge the time part.
      name = name.replace(/-(\d{6})-/, (_, t) => `-${String(Number(t) + i).padStart(6, '0')}-`);
      file = path.join(dir, name);
    }
    db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
    if (kind === 'nightly') prune();
    return info(name);
  }

  function info(name) {
    const m = NAME.exec(name);
    const stat = fs.statSync(path.join(dir, name));
    return { name, date: m[1], time: `${m[2].slice(0, 2)}:${m[2].slice(2, 4)}`, kind: m[3], size: stat.size };
  }

  function list() {
    return fs
      .readdirSync(dir)
      .filter((n) => NAME.test(n))
      .sort()
      .reverse()
      .map(info);
  }

  // Keep the newest `keep_daily` nightly backups, plus the newest nightly backup of each of the last
  // `keep_monthly` months. Manual and pre-restore backups: keep the newest 20 of each.
  function prune() {
    const keepDaily = Number(getSetting(db, 'backup.keep_daily', '30'));
    const keepMonthly = Number(getSetting(db, 'backup.keep_monthly', '12'));
    const all = list();
    const keep = new Set();
    const nightly = all.filter((b) => b.kind === 'nightly');
    nightly.slice(0, keepDaily).forEach((b) => keep.add(b.name));
    const months = new Map();
    for (const b of nightly) if (!months.has(b.date.slice(0, 7))) months.set(b.date.slice(0, 7), b.name);
    [...months.values()].slice(0, keepMonthly).forEach((n) => keep.add(n));
    for (const kind of ['manual', 'pre-restore']) all.filter((b) => b.kind === kind).slice(0, 20).forEach((b) => keep.add(b.name));
    for (const b of all) if (!keep.has(b.name)) fs.unlinkSync(path.join(dir, b.name));
  }

  function filePath(name) {
    if (!NAME.test(name)) return null;
    const file = path.join(dir, name);
    return fs.existsSync(file) ? file : null;
  }

  function currentVersion() {
    return db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get().v;
  }

  // Checks an uploaded or stored backup file is a Sunco CRM database of the same version.
  function inspect(file) {
    let bk;
    try {
      bk = new DatabaseSync(file, { readOnly: true });
      const version = bk.prepare('SELECT MAX(version) AS v FROM schema_migrations').get().v;
      const counts = Object.fromEntries(['enquiries', 'users'].map((t) => [t, bk.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n]));
      return { version, counts };
    } catch {
      throw Object.assign(new Error('That file is not a Sunco CRM backup'), { status: 400 });
    } finally {
      bk?.close();
    }
  }

  // Replaces all data with the backup's contents. A safety backup is taken first.
  // Backups from an older version of the app are upgraded (on a temporary copy) first.
  function restore(file) {
    const { version } = inspect(file);
    if (version > currentVersion()) {
      throw Object.assign(new Error(`That backup is from a newer version of the app (v${version}, this is v${currentVersion()}). Update the app first.`), { status: 400 });
    }
    if (version < currentVersion()) {
      const tmp = path.join(os.tmpdir(), `sunco-upgrade-${crypto.randomBytes(6).toString('hex')}.db`);
      fs.copyFileSync(file, tmp);
      try {
        const old = new DatabaseSync(tmp);
        migrate(old);
        old.close();
        return restore(tmp);
      } finally {
        fs.rmSync(tmp, { force: true });
      }
    }
    const { counts } = inspect(file);
    const safety = create('pre-restore');
    db.exec('PRAGMA foreign_keys = OFF');
    try {
      db.prepare('ATTACH DATABASE ? AS bk').run(file);
      try {
        transaction(db, () => {
          for (const t of [...TABLES].reverse()) db.exec(`DELETE FROM main.${t}`);
          for (const t of TABLES) db.exec(`INSERT INTO main.${t} SELECT * FROM bk.${t}`);
        });
      } finally {
        db.exec('DETACH DATABASE bk');
      }
    } finally {
      db.exec('PRAGMA foreign_keys = ON');
    }
    return { restored: counts, safety_backup: safety.name };
  }

  // Restores from an uploaded file: an emailed .sunco-backup (needs the passphrase), a .gz, or a .db.
  function restoreFromBuffer(buffer, passphrase) {
    const data = unpack(buffer, passphrase);
    const tmp = path.join(os.tmpdir(), `sunco-restore-${crypto.randomBytes(6).toString('hex')}.db`);
    fs.writeFileSync(tmp, data);
    try {
      return restore(tmp);
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  }

  // The encrypted, compressed copy of a stored backup that goes out by email.
  function packed(name, passphrase) {
    const file = filePath(name);
    if (!file) throw new Error('Backup not found');
    const b = info(name);
    return { filename: `sunco-crm-backup-${b.date}-${b.time.replace(':', '')}${EXTENSION}`, content: pack(fs.readFileSync(file), passphrase) };
  }

  return { dir, create, list, prune, filePath, restore, restoreFromBuffer, packed, inspect };
}

module.exports = { createBackupService };
