// Restores the CRM from a backup file when the app can't be used (e.g. a new server after a failure).
//
//   npm run restore -- path/to/sunco-crm-backup-2026-11-08-0200.sunco-backup
//
// Works with an emailed .sunco-backup file (asks for the backup passphrase), a .gz, or a .db file.
// A safety copy of the current data is saved first. If the current database is damaged it is
// moved aside and replaced. Restart the app afterwards.
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const config = require('../src/config');
const { openDatabase } = require('../src/db');
const { createBackupService } = require('../src/services/backup');

function ask(question, hidden) {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      let buf = '';
      process.stdin.on('data', (d) => (buf += d));
      process.stdin.on('end', () => resolve(buf.split(/\r?\n/)[0] || ''));
      return;
    }
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    let muted = false;
    rl._writeToOutput = (s) => {
      if (!muted) rl.output.write(s);
    };
    rl.output.write(question);
    muted = hidden;
    rl.question('', (answer) => {
      muted = false;
      rl.output.write('\n');
      rl.close();
      resolve(answer);
    });
  });
}

async function main() {
  const file = process.argv[2];
  if (!file || !fs.existsSync(file)) throw new Error('Usage: npm run restore -- <backup file>');
  const buffer = fs.readFileSync(file);
  const encrypted = buffer.subarray(0, 8).toString() === 'SUNCOBK1';
  const passphrase = encrypted ? await ask('Backup passphrase: ', true) : '';

  let db;
  try {
    db = openDatabase(config.dbPath);
    db.prepare('SELECT COUNT(*) FROM enquiries').get();
  } catch (err) {
    // Damaged database: keep it for inspection and start from an empty one.
    const aside = `${config.dbPath}.damaged-${Date.now()}`;
    console.log(`Current database could not be opened (${err.message}). Moving it to ${aside}`);
    try {
      db?.close();
    } catch {
      /* ignore */
    }
    for (const ext of ['', '-wal', '-shm']) if (fs.existsSync(config.dbPath + ext)) fs.renameSync(config.dbPath + ext, aside + ext);
    db = openDatabase(config.dbPath);
  }
  const backups = createBackupService({ db, dir: config.backupDir });
  const result = backups.restoreFromBuffer(buffer, passphrase);
  db.close();
  console.log(`Restored ${result.restored.enquiries} enquiries and ${result.restored.users} users from ${path.basename(file)}.`);
  console.log(`A copy of the data from before the restore is in ${path.join(config.backupDir, result.safety_backup)}.`);
  console.log('Restart the app (npm start) if it is running.');
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
