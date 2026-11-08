const { openDatabase } = require('../src/db');
const { createApp } = require('../src/app');
const { hashPassword } = require('../src/auth');

const PASSWORD = 'correct-horse-battery';

async function startTestServer() {
  const db = openDatabase(':memory:');
  const app = createApp({ db, secret: 'x'.repeat(48), cookieSecure: false, logErrors: false });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const hash = hashPassword(PASSWORD);

  const ids = {
    location: (name) => db.prepare('SELECT id FROM locations WHERE name = ?').get(name).id,
    brand: (name) => db.prepare('SELECT id FROM brands WHERE name = ?').get(name).id,
    franchise: (location, brand) =>
      db
        .prepare('SELECT f.id FROM franchises f JOIN locations l ON l.id = f.location_id JOIN brands b ON b.id = f.brand_id WHERE l.name = ? AND b.name = ?')
        .get(location, brand).id,
    model: (brand, name) => db.prepare('SELECT m.id FROM models m JOIN brands b ON b.id = m.brand_id WHERE b.name = ? AND m.name = ?').get(brand, name).id,
    lookup: (type, label) => db.prepare('SELECT id FROM lookup_values WHERE list_type = ? AND label = ?').get(type, label).id,
    usedMake: (name) => db.prepare('SELECT id FROM used_makes WHERE name = ?').get(name).id,
    usedModel: (make, name) =>
      db.prepare('SELECT um.id FROM used_models um JOIN used_makes mk ON mk.id = um.make_id WHERE mk.name = ? AND um.name = ?').get(make, name).id,
  };

  // Creates a user directly in the database. franchises: [[location, brand], ...]
  function createUser({ username, role = 'salesperson', isAdmin = false, franchises = [], mustChange = false }) {
    const id = Number(
      db
        .prepare('INSERT INTO users (name, username, password_hash, role, is_admin, must_change_password) VALUES (?, ?, ?, ?, ?, ?)')
        .run(username.replace(/^./, (c) => c.toUpperCase()), username, hash, role, isAdmin ? 1 : 0, mustChange ? 1 : 0).lastInsertRowid
    );
    for (const [loc, brand] of franchises) {
      db.prepare('INSERT INTO user_franchises (user_id, franchise_id) VALUES (?, ?)').run(id, ids.franchise(loc, brand));
    }
    return id;
  }

  // A minimal client that keeps the session cookie.
  function client() {
    let cookie = '';
    async function request(method, path, body, headers = {}) {
      const res = await fetch(base + path, {
        method,
        headers: {
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
          ...(cookie ? { cookie } : {}),
          ...headers,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const set = res.headers.get('set-cookie');
      if (set) cookie = set.split(';')[0];
      const text = await res.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = text;
      }
      return { status: res.status, body: json };
    }
    return {
      get: (p) => request('GET', p),
      post: (p, b = {}, h) => request('POST', p, b, h),
      patch: (p, b = {}) => request('PATCH', p, b),
      raw: request,
      async login(username, password = PASSWORD) {
        const r = await request('POST', '/api/auth/login', { username, password });
        if (r.status !== 200) throw new Error(`login ${username} failed: ${r.status} ${JSON.stringify(r.body)}`);
        return r;
      },
    };
  }

  async function close() {
    await new Promise((r) => server.close(r));
    db.close();
  }

  return { db, base, ids, createUser, client, close, PASSWORD };
}

module.exports = { startTestServer };
