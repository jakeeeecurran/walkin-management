const express = require('express');
const crypto = require('node:crypto');
const v = require('../lib/validate');
const scope = require('../lib/scope');
const { audit } = require('../lib/audit');
const { notFound, forbidden } = require('../lib/http');
const { nowIso } = require('../lib/time');
const { transaction } = require('../db');
const { hashPassword, publicUser } = require('../auth');

// Readable temporary password (no look-alike characters), shown once to the manager who set it.
function temporaryPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(12);
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return `${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8)}`;
}

module.exports = function userRoutes({ db }) {
  const router = express.Router();

  router.use((req, res, next) => {
    if (!scope.isManager(req.user)) return next(forbidden());
    next();
  });

  function getManageable(req) {
    const id = v.id(req.params.id, 'id', { required: true });
    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!target || !scope.canManageUser(db, req.user, target)) throw notFound('User not found');
    return target;
  }

  // Works out the franchise list to save. A sales manager can only add or remove franchises
  // they hold themselves; anything else the user already has is left untouched.
  function resolveFranchises(actor, requested, currentIds) {
    if (!Array.isArray(requested)) throw new v.ValidationError('franchise_ids', 'franchise_ids must be a list');
    const ids = [...new Set(requested.map((x) => v.id(x, 'franchise_ids', { required: true })))];
    const known = new Set(db.prepare('SELECT id FROM franchises').all().map((r) => r.id));
    for (const id of ids) if (!known.has(id)) throw new v.ValidationError('franchise_ids', `Unknown franchise ${id}`);
    const actorScope = scope.franchiseIds(db, actor);
    if (actorScope === null) return ids;
    const mine = new Set(actorScope);
    for (const id of ids) {
      if (!mine.has(id) && !currentIds.includes(id)) throw new v.ValidationError('franchise_ids', 'You can only assign brands and sites you manage');
    }
    return [...new Set([...ids.filter((id) => mine.has(id)), ...currentIds.filter((id) => !mine.has(id))])];
  }

  function setFranchises(userId, ids) {
    db.prepare('DELETE FROM user_franchises WHERE user_id = ?').run(userId);
    const ins = db.prepare('INSERT INTO user_franchises (user_id, franchise_id) VALUES (?, ?)');
    for (const id of ids) ins.run(userId, id);
  }

  function currentFranchiseIds(userId) {
    return db.prepare('SELECT franchise_id FROM user_franchises WHERE user_id = ?').all(userId).map((r) => r.franchise_id);
  }

  function locationId(value) {
    const id = v.id(value, 'home_location_id');
    if (id != null && !db.prepare('SELECT 1 FROM locations WHERE id = ?').get(id)) throw new v.ValidationError('home_location_id', 'Unknown location');
    return id;
  }

  function activeAdminCount(excludingId) {
    return db.prepare('SELECT COUNT(*) AS n FROM users WHERE is_admin = 1 AND active = 1 AND id != ?').get(excludingId).n;
  }

  router.get('/', (req, res) => {
    const users = db
      .prepare('SELECT * FROM users ORDER BY active DESC, name')
      .all()
      .filter((u) => u.id === req.user.id || scope.canManageUser(db, req.user, u));
    res.json({
      users: users.map((u) => ({ ...publicUser(db, u), last_login_at: u.last_login_at, can_manage: u.id !== req.user.id })),
      assignable_roles: scope.assignableRoles(req.user),
      can_grant_admin: req.user.is_admin === 1,
    });
  });

  router.post('/', (req, res) => {
    const actor = req.user;
    const b = req.body || {};
    const role = v.oneOf(b.role ?? 'salesperson', 'role', scope.assignableRoles(actor));
    const isAdmin = v.bool(b.is_admin);
    if (isAdmin && actor.is_admin !== 1) throw forbidden('Only an admin can create another admin');
    const user = {
      name: v.text(b.name, 'name', { required: true, max: 100 }),
      username: v.username(b.username),
      email: v.email(b.email),
      role,
      is_admin: isAdmin,
      home_location_id: locationId(b.home_location_id),
    };
    if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(user.username)) throw new v.ValidationError('username', 'That username is already taken');
    if (user.email && db.prepare('SELECT 1 FROM users WHERE email = ?').get(user.email)) throw new v.ValidationError('email', 'That email is already used by another user');
    const franchiseIds = resolveFranchises(actor, b.franchise_ids ?? [], []);
    if (actor.role === 'sales_manager' && franchiseIds.length === 0) {
      throw new v.ValidationError('franchise_ids', 'Choose at least one brand/site for this salesperson');
    }
    const temp = b.temporary_password ? v.password(b.temporary_password, 'temporary_password') : temporaryPassword();

    const id = transaction(db, () => {
      const newId = Number(
        db
          .prepare(
            `INSERT INTO users (name, username, email, password_hash, role, is_admin, home_location_id, must_change_password)
             VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
          )
          .run(user.name, user.username, user.email, hashPassword(temp), user.role, user.is_admin, user.home_location_id).lastInsertRowid
      );
      setFranchises(newId, franchiseIds);
      audit(db, { userId: actor.id, action: 'create', entity: 'user', entityId: newId, after: { ...user, franchise_ids: franchiseIds } });
      return newId;
    });
    const created = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    res.status(201).json({ user: publicUser(db, created), temporary_password: temp });
  });

  router.patch('/:id', (req, res) => {
    const actor = req.user;
    const target = getManageable(req);
    const self = target.id === actor.id;
    const b = req.body || {};
    const has = (k) => Object.prototype.hasOwnProperty.call(b, k);

    const updates = {};
    if (has('name')) updates.name = v.text(b.name, 'name', { required: true, max: 100 });
    if (has('email')) {
      updates.email = v.email(b.email);
      if (updates.email && db.prepare('SELECT 1 FROM users WHERE email = ? AND id != ?').get(updates.email, target.id)) {
        throw new v.ValidationError('email', 'That email is already used by another user');
      }
    }
    if (has('home_location_id')) updates.home_location_id = locationId(b.home_location_id);
    if (has('role') && b.role !== target.role) {
      if (self) throw forbidden('You cannot change your own role');
      updates.role = v.oneOf(b.role, 'role', scope.assignableRoles(actor));
    }
    if (has('is_admin') && v.bool(b.is_admin) !== target.is_admin) {
      if (actor.is_admin !== 1) throw forbidden('Only an admin can change admin access');
      if (self) throw forbidden('You cannot remove your own admin access');
      updates.is_admin = v.bool(b.is_admin);
    }
    if (has('active') && v.bool(b.active) !== target.active) {
      if (self) throw forbidden('You cannot disable your own account');
      updates.active = v.bool(b.active);
      if (updates.active === 0) updates.token_version = target.token_version + 1; // sign them out everywhere
    }
    if ((updates.is_admin === 0 || updates.active === 0) && target.is_admin === 1 && activeAdminCount(target.id) === 0) {
      throw forbidden('There must always be at least one active admin');
    }
    const previousFranchiseIds = currentFranchiseIds(target.id);
    let franchiseIds = null;
    if (has('franchise_ids')) franchiseIds = resolveFranchises(actor, b.franchise_ids, previousFranchiseIds);

    transaction(db, () => {
      const cols = Object.keys(updates);
      if (cols.length) {
        db.prepare(`UPDATE users SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE id = ?`).run(
          ...cols.map((c) => updates[c]),
          nowIso(),
          target.id
        );
      }
      if (franchiseIds) setFranchises(target.id, franchiseIds);
      audit(db, {
        userId: actor.id,
        action: 'update',
        entity: 'user',
        entityId: target.id,
        before: { ...Object.fromEntries(cols.map((c) => [c, target[c]])), ...(franchiseIds ? { franchise_ids: previousFranchiseIds } : {}) },
        after: { ...updates, ...(franchiseIds ? { franchise_ids: franchiseIds } : {}) },
      });
    });
    res.json({ user: publicUser(db, db.prepare('SELECT * FROM users WHERE id = ?').get(target.id)) });
  });

  // Moves a person's open enquiries to someone else (e.g. when they leave). Only enquiries in brands/sites
  // the manager covers and the new person is assigned to are moved; the rest are reported back.
  router.post('/:id/reassign-open', (req, res) => {
    const from = getManageable(req);
    const toId = v.id(req.body?.to_user_id, 'to_user_id', { required: true });
    if (toId === from.id) throw new v.ValidationError('to_user_id', 'Choose a different person');
    const rows = db.prepare("SELECT id, franchise_id FROM enquiries WHERE salesperson_id = ? AND outcome = 'open' AND is_invalid = 0").all(from.id);
    const toName = db.prepare('SELECT name FROM users WHERE id = ?').get(toId)?.name;
    if (!toName) throw new v.ValidationError('to_user_id', 'Unknown user');
    let moved = 0;
    let notMoved = 0;
    transaction(db, () => {
      for (const r of rows) {
        if (!scope.canAssignTo(db, req.user, r.franchise_id, toId)) {
          notMoved++;
          continue;
        }
        db.prepare('UPDATE enquiries SET salesperson_id = ?, updated_at = ? WHERE id = ?').run(toId, nowIso(), r.id);
        db.prepare("INSERT INTO activities (enquiry_id, user_id, type, body) VALUES (?, ?, 'reassigned', ?)").run(r.id, req.user.id, `${from.name} → ${toName}`);
        moved++;
      }
      audit(db, { userId: req.user.id, action: 'reassign_open', entity: 'user', entityId: from.id, after: { to_user_id: toId, moved, not_moved: notMoved } });
    });
    res.json({ moved, not_moved: notMoved });
  });

  router.post('/:id/reset-password', (req, res) => {
    const target = getManageable(req);
    if (target.id === req.user.id) throw forbidden('Use "Change password" to change your own password');
    const temp = temporaryPassword();
    db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1, token_version = token_version + 1, updated_at = ? WHERE id = ?').run(
      hashPassword(temp),
      nowIso(),
      target.id
    );
    audit(db, { userId: req.user.id, action: 'reset_password', entity: 'user', entityId: target.id });
    res.json({ temporary_password: temp });
  });

  return router;
};
