const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const v = require('./lib/validate');
const { HttpError } = require('./lib/http');
const { audit } = require('./lib/audit');
const { nowIso } = require('./lib/time');
const scope = require('./lib/scope');

const COOKIE = 'sunco_session';
const SHORT_SESSION_HOURS = 12;
const REMEMBER_DAYS = 30;
const BCRYPT_ROUNDS = 12;

// A real hash to compare against when the username doesn't exist, so response time doesn't reveal valid usernames.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_ROUNDS);

function hashPassword(plain) {
  return bcrypt.hashSync(plain, BCRYPT_ROUNDS);
}

function publicUser(db, user) {
  const franchises = db
    .prepare(
      `SELECT f.id, f.location_id, l.name AS location, f.brand_id, b.name AS brand
       FROM user_franchises uf
       JOIN franchises f ON f.id = uf.franchise_id
       JOIN locations l ON l.id = f.location_id
       JOIN brands b ON b.id = f.brand_id
       WHERE uf.user_id = ?
       ORDER BY l.sort_order, b.sort_order`
    )
    .all(user.id);
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    role: user.role,
    is_admin: user.is_admin === 1,
    home_location_id: user.home_location_id,
    active: user.active === 1,
    must_change_password: user.must_change_password === 1,
    full_access: scope.hasFullAccess(user),
    franchises,
  };
}

function createAuth({ db, secret, cookieSecure }) {
  function issue(res, user, remember) {
    const maxAgeMs = remember ? REMEMBER_DAYS * 86400e3 : SHORT_SESSION_HOURS * 3600e3;
    const token = jwt.sign({ sub: user.id, tv: user.token_version }, secret, {
      expiresIn: Math.floor(maxAgeMs / 1000),
      algorithm: 'HS256',
    });
    res.cookie(COOKIE, token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: cookieSecure,
      path: '/',
      ...(remember ? { maxAge: maxAgeMs } : {}), // without maxAge it's a browser-session cookie
    });
  }

  // Loads the signed-in user fresh from the database on every request, so role changes,
  // disabling and password resets take effect immediately.
  function authenticate(req, res, next) {
    const token = req.cookies?.[COOKIE];
    if (!token) return next(new HttpError(401, 'Please sign in'));
    let payload;
    try {
      payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
    } catch {
      res.clearCookie(COOKIE, { path: '/' });
      return next(new HttpError(401, 'Your session has expired. Please sign in again'));
    }
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.sub);
    if (!user || user.active !== 1 || user.token_version !== payload.tv) {
      res.clearCookie(COOKIE, { path: '/' });
      return next(new HttpError(401, 'Please sign in'));
    }
    req.user = user;
    next();
  }

  // Blocks everything except changing the password until a temporary password has been replaced.
  function requirePasswordCurrent(req, res, next) {
    if (req.user.must_change_password === 1) return next(new HttpError(403, 'You need to set a new password first'));
    next();
  }

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: { error: 'Too many sign-in attempts. Please wait 15 minutes and try again.' },
  });

  const router = express.Router();

  router.post('/login', loginLimiter, (req, res) => {
    const usernameOrEmail = String(req.body?.username ?? '').trim().toLowerCase();
    const plain = String(req.body?.password ?? '');
    const user = usernameOrEmail
      ? db.prepare('SELECT * FROM users WHERE username = ? OR (email IS NOT NULL AND email = ?)').get(usernameOrEmail, usernameOrEmail)
      : undefined;
    const ok = bcrypt.compareSync(plain, user ? user.password_hash : DUMMY_HASH);
    if (!user || !ok || user.active !== 1) {
      throw new HttpError(401, 'Incorrect username or password');
    }
    db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(nowIso(), user.id);
    issue(res, user, req.body?.remember === true);
    res.json({ user: publicUser(db, user) });
  });

  router.post('/logout', (req, res) => {
    res.clearCookie(COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  router.get('/me', authenticate, (req, res) => {
    res.json({ user: publicUser(db, req.user) });
  });

  router.post('/change-password', authenticate, (req, res) => {
    const current = String(req.body?.current_password ?? '');
    if (!bcrypt.compareSync(current, req.user.password_hash)) {
      throw new v.ValidationError('current_password', 'Current password is incorrect');
    }
    const next = v.password(req.body?.new_password, 'new_password');
    if (next === current) throw new v.ValidationError('new_password', 'New password must be different from the current one');
    const tokenVersion = req.user.token_version + 1; // signs out other devices
    db.prepare(
      'UPDATE users SET password_hash = ?, must_change_password = 0, token_version = ?, updated_at = ? WHERE id = ?'
    ).run(hashPassword(next), tokenVersion, nowIso(), req.user.id);
    audit(db, { userId: req.user.id, action: 'password_changed', entity: 'user', entityId: req.user.id });
    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    issue(res, updated, req.body?.remember === true);
    res.json({ user: publicUser(db, updated) });
  });

  return { router, authenticate, requirePasswordCurrent };
}

module.exports = { createAuth, hashPassword, publicUser, COOKIE };
