const config = require('./config');
const { openDatabase } = require('./db');
const { createApp } = require('./app');
const { createScheduler } = require('./services/scheduler');

const db = openDatabase(config.dbPath);
const app = createApp({
  db,
  secret: config.loadSecret(),
  cookieSecure: config.cookieSecure,
  trustProxy: config.trustProxy,
  backupDir: config.backupDir,
});
const { backups, mailer } = app.locals.services;
const scheduler = createScheduler({ db, backups, mailer });
scheduler.start();

const userCount = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;

const server = app.listen(config.port, () => {
  console.log(`Sunco Walk-In CRM running at http://localhost:${config.port}`);
  console.log(`Database: ${config.dbPath}`);
  console.log(`Backups:  ${config.backupDir}`);
  if (userCount === 0) {
    console.log('\nNo users yet. Create the first admin account with:');
    console.log('  npm run create-user -- --admin --role general_manager --username <name> --name "<Full Name>"\n');
  }
});

function shutdown() {
  scheduler.stop();
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
