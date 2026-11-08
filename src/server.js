const config = require('./config');
const { openDatabase } = require('./db');
const { createApp } = require('./app');

const db = openDatabase(config.dbPath);
const app = createApp({
  db,
  secret: config.loadSecret(),
  cookieSecure: config.cookieSecure,
  trustProxy: config.trustProxy,
});

const userCount = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;

const server = app.listen(config.port, () => {
  console.log(`Sunco Walk-In CRM running at http://localhost:${config.port}`);
  console.log(`Database: ${config.dbPath}`);
  if (userCount === 0) {
    console.log('\nNo users yet. Create the first admin account with:');
    console.log('  npm run create-user -- --admin --role general_manager --username <name> --name "<Full Name>"\n');
  }
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
