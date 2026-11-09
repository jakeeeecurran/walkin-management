// Creates a user from the command line, mainly for the first admin account.
//
//   npm run create-user -- --admin --role general_manager --username jake --name "Jake Curran" [--email jake@example.com]
//
// The password is typed in at the prompt (never passed on the command line). Further users
// are normally added in the app by a manager or admin.
const readline = require('node:readline');
const config = require('../src/config');
const { openDatabase } = require('../src/db');
const { hashPassword } = require('../src/auth');
const v = require('../src/lib/validate');
const { ROLES } = require('../src/lib/scope');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    if (key === 'admin') out.admin = true;
    else out[key] = argv[++i];
  }
  return out;
}

// Asks for the password twice on one prompt session, without echoing what's typed.
function promptPasswords() {
  if (!process.stdin.isTTY) {
    // Piped input (e.g. from a setup script): first two lines.
    return new Promise((resolve) => {
      let buf = '';
      process.stdin.on('data', (d) => (buf += d));
      process.stdin.on('end', () => {
        const [first = '', second = ''] = buf.split(/\r?\n/);
        resolve([first, second]);
      });
    });
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  let muted = false;
  rl._writeToOutput = (s) => {
    if (!muted) rl.output.write(s);
  };
  const ask = (q) =>
    new Promise((resolve) => {
      muted = false;
      rl.output.write(q);
      muted = true;
      rl.question('', (answer) => {
        muted = false;
        rl.output.write('\n');
        resolve(answer);
      });
    });
  return (async () => {
    const first = await ask('Password (min 10 characters): ');
    const second = await ask('Confirm password: ');
    rl.close();
    return [first, second];
  })();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const role = args.role || 'general_manager';
  if (!ROLES.includes(role)) throw new Error(`--role must be one of ${ROLES.join(', ')}`);
  const username = v.username(args.username);
  const name = v.text(args.name, 'name', { required: true, max: 100 });
  const email = v.email(args.email);

  const db = openDatabase(config.dbPath);
  if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) throw new Error(`Username "${username}" already exists`);

  let location = null;
  if (args.location) {
    location = db.prepare('SELECT id FROM locations WHERE name = ?').get(args.location);
    if (!location) throw new Error(`Unknown location "${args.location}"`);
  }

  const [typed, confirm] = await promptPasswords();
  const password = v.password(typed);
  if (password !== confirm) throw new Error('Passwords do not match');

  db.prepare(
    'INSERT INTO users (name, username, email, password_hash, role, is_admin, home_location_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(name, username, email, hashPassword(password), role, args.admin ? 1 : 0, location?.id ?? null);
  db.close();
  console.log(`Created ${role.replace('_', ' ')}${args.admin ? ' (admin)' : ''} "${username}".`);
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
