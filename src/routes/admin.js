const express = require('express');
const v = require('../lib/validate');
const scope = require('../lib/scope');
const { audit } = require('../lib/audit');
const { notFound, forbidden, badRequest } = require('../lib/http');
const { getSettings, setSetting } = require('../lib/settings');
const { transaction } = require('../db');

const COLOUR = /^#[0-9a-fA-F]{6}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

// Settings an admin can change, with their validation.
const SETTING_RULES = {
  'branding.name': (x) => v.text(x, 'name', { required: true, max: 60 }),
  'branding.primary_colour': (x) => colour(x, 'primary_colour'),
  'branding.accent_colour': (x) => colour(x, 'accent_colour'),
  'followup.escalation_days': (x) => intRange(x, 'escalation_days', 1, 60),
  'followup.stale_days': (x) => intRange(x, 'stale_days', 7, 365),
  'email.enabled': (x) => String(v.bool(x)),
  'email.smtp_host': (x) => v.text(x, 'smtp_host', { max: 200 }) || '',
  'email.smtp_port': (x) => intRange(x, 'smtp_port', 1, 65535),
  'email.smtp_secure': (x) => String(v.bool(x)),
  'email.smtp_user': (x) => v.text(x, 'smtp_user', { max: 200 }) || '',
  'email.smtp_password': (x) => (x == null ? '' : String(x).slice(0, 500)),
  'email.from': (x) => v.text(x, 'from', { max: 200 }) || '',
  'email.morning_time': (x) => time(x, 'morning_time'),
  'email.eod_time': (x) => time(x, 'eod_time'),
  'email.app_url': (x) => {
    const t = v.text(x, 'app_url', { max: 200 }) || '';
    if (t && !/^https?:\/\/[^\s]+$/.test(t)) throw new v.ValidationError('app_url', 'Enter the full web address, e.g. https://crm.example.com.au');
    return t.replace(/\/$/, '');
  },
  'backup.time': (x) => time(x, 'backup_time'),
  'backup.keep_daily': (x) => intRange(x, 'keep_daily', 7, 365),
  'backup.keep_monthly': (x) => intRange(x, 'keep_monthly', 0, 120),
  'backup.email_enabled': (x) => String(v.bool(x)),
  'backup.email_to': (x) => {
    const list = String(x ?? '').split(/[,;\s]+/).filter(Boolean);
    for (const e of list) v.email(e, 'backup_email_to');
    return list.join(', ');
  },
  'backup.email_passphrase': (x) => {
    const p = String(x ?? '');
    if (p.length < 12) throw new v.ValidationError('backup_email_passphrase', 'Backup passphrase must be at least 12 characters');
    return p;
  },
  'backup.email_max_mb': (x) => intRange(x, 'backup_email_max_mb', 1, 50),
};

function colour(x, field) {
  if (!COLOUR.test(String(x))) throw new v.ValidationError(field, 'Colour must look like #0B3D91');
  return String(x).toUpperCase();
}
function time(x, field) {
  if (!TIME.test(String(x))) throw new v.ValidationError(field, 'Time must be HH:MM (24-hour)');
  return String(x);
}
function intRange(x, field, min, max) {
  const n = Number(x);
  if (!Number.isInteger(n) || n < min || n > max) throw new v.ValidationError(field, `Must be a whole number from ${min} to ${max}`);
  return String(n);
}

module.exports = function adminRoutes({ db }) {
  const router = express.Router();

  router.use((req, res, next) => {
    if (!scope.hasFullAccess(req.user)) return next(forbidden('Only the general manager or an admin can do that'));
    next();
  });

  const log = (req, action, entity, entityId, before, after) => audit(db, { userId: req.user.id, action, entity, entityId, before, after });

  // ---- Settings & branding ----
  router.get('/settings', (req, res) => {
    const s = getSettings(db);
    const hasPassword = !!s['email.smtp_password'];
    const hasPassphrase = !!s['backup.email_passphrase'];
    delete s['email.smtp_password'];
    delete s['backup.email_passphrase'];
    res.json({ settings: s, smtp_password_set: hasPassword, backup_passphrase_set: hasPassphrase });
  });

  router.put('/settings', (req, res) => {
    const body = req.body || {};
    const changes = {};
    if (v.bool(body['backup.email_enabled']) && !body['backup.email_passphrase'] && !getSettings(db)['backup.email_passphrase']) {
      throw new v.ValidationError('backup_email_passphrase', 'Set a backup passphrase before switching on backup emails');
    }
    for (const [key, value] of Object.entries(body)) {
      const rule = SETTING_RULES[key];
      if (!rule) throw badRequest(`Unknown setting ${key}`);
      if ((key === 'email.smtp_password' || key === 'backup.email_passphrase') && (value === '' || value == null)) continue; // blank = keep current
      changes[key] = rule(value);
    }
    transaction(db, () => {
      for (const [k, val] of Object.entries(changes)) setSetting(db, k, val);
      log(req, 'update', 'settings', null, null, Object.fromEntries(Object.entries(changes).map(([k, x]) => [k, /password|passphrase/.test(k) ? '***' : x])));
    });
    res.json({ ok: true });
  });

  router.put('/logo', (req, res) => {
    const data = String(req.body?.data_url ?? '');
    if (data && data !== '/sunco-logo.png' && !/^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(data)) {
      throw new v.ValidationError('logo', 'Logo must be a PNG, JPG, WebP or SVG image');
    }
    if (data.length > 400_000) throw new v.ValidationError('logo', 'Logo must be under about 300 KB');
    setSetting(db, 'branding.logo_url', data);
    log(req, 'update', 'settings', null, null, { 'branding.logo_url': data ? 'uploaded' : 'removed' });
    res.json({ ok: true });
  });

  // ---- Generic helpers for simple named lists ----
  function nameExists(table, name, extraWhere = '', extraParams = [], excludeId = 0) {
    return !!db.prepare(`SELECT 1 FROM ${table} WHERE name = ? ${extraWhere} AND id != ?`).get(name, ...extraParams, excludeId);
  }
  function nextSort(table, where = '1=1', params = []) {
    return (db.prepare(`SELECT MAX(sort_order) AS m FROM ${table} WHERE ${where}`).get(...params).m ?? -1) + 1;
  }
  function getRow(table, id) {
    const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(v.id(id, 'id', { required: true }));
    if (!row) throw notFound();
    return row;
  }
  // Applies name / active / sort_order (and extra fields) to a row.
  function patchRow(req, table, row, extra = {}, uniqueScope = { where: '', params: [] }, nameField = 'name') {
    const b = req.body || {};
    const updates = { ...extra };
    if (b[nameField] !== undefined) {
      const name = v.text(b[nameField], nameField, { required: true, max: 60 });
      const where = table === 'lookup_values' ? `label = ? ${uniqueScope.where} AND id != ?` : `name = ? ${uniqueScope.where} AND id != ?`;
      if (db.prepare(`SELECT 1 FROM ${table} WHERE ${where}`).get(name, ...uniqueScope.params, row.id)) {
        throw new v.ValidationError(nameField, `"${name}" already exists`);
      }
      updates[nameField] = name;
    }
    if (b.active !== undefined) updates.active = v.bool(b.active);
    if (b.sort_order !== undefined) updates.sort_order = intRange(b.sort_order, 'sort_order', 0, 10000) * 1;
    const cols = Object.keys(updates);
    if (cols.length) {
      db.prepare(`UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...cols.map((c) => updates[c]), row.id);
      log(req, 'update', table, row.id, Object.fromEntries(cols.map((c) => [c, row[c]])), updates);
    }
    return db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(row.id);
  }
  function reorder(req, table, ids, where = '1=1', params = []) {
    if (!Array.isArray(ids)) throw badRequest('ids must be a list');
    const valid = new Set(db.prepare(`SELECT id FROM ${table} WHERE ${where}`).all(...params).map((r) => r.id));
    transaction(db, () => {
      ids.forEach((id, i) => {
        if (valid.has(Number(id))) db.prepare(`UPDATE ${table} SET sort_order = ? WHERE id = ?`).run(i, Number(id));
      });
      log(req, 'reorder', table, null, null, { ids });
    });
  }

  // ---- Locations ----
  router.post('/locations', (req, res) => {
    const name = v.text(req.body?.name, 'name', { required: true, max: 60 });
    if (nameExists('locations', name)) throw new v.ValidationError('name', `"${name}" already exists`);
    const id = Number(db.prepare('INSERT INTO locations (name, sort_order) VALUES (?, ?)').run(name, nextSort('locations')).lastInsertRowid);
    log(req, 'create', 'locations', id, null, { name });
    res.status(201).json({ location: getRow('locations', id) });
  });
  router.patch('/locations/:id', (req, res) => {
    res.json({ location: patchRow(req, 'locations', getRow('locations', req.params.id)) });
  });

  // ---- Brands ----
  router.post('/brands', (req, res) => {
    const b = req.body || {};
    const name = v.text(b.name, 'name', { required: true, max: 60 });
    if (nameExists('brands', name)) throw new v.ValidationError('name', `"${name}" already exists`);
    const colourValue = b.colour ? colour(b.colour, 'colour') : '#5A6270';
    const locationIds = Array.isArray(b.location_ids) ? b.location_ids.map((x) => v.id(x, 'location_ids', { required: true })) : [];
    const id = transaction(db, () => {
      const newId = Number(
        db.prepare('INSERT INTO brands (name, colour, is_used, sort_order) VALUES (?, ?, ?, ?)').run(name, colourValue, v.bool(b.is_used), nextSort('brands')).lastInsertRowid
      );
      for (const loc of locationIds) {
        if (!db.prepare('SELECT 1 FROM locations WHERE id = ?').get(loc)) throw new v.ValidationError('location_ids', 'Unknown location');
        db.prepare('INSERT INTO franchises (location_id, brand_id) VALUES (?, ?)').run(loc, newId);
      }
      log(req, 'create', 'brands', newId, null, { name, colour: colourValue, location_ids: locationIds });
      return newId;
    });
    res.status(201).json({ brand: getRow('brands', id) });
  });
  router.patch('/brands/:id', (req, res) => {
    const row = getRow('brands', req.params.id);
    const extra = {};
    if (req.body?.colour !== undefined) extra.colour = colour(req.body.colour, 'colour');
    res.json({ brand: patchRow(req, 'brands', row, extra) });
  });
  router.post('/brands/reorder', (req, res) => {
    reorder(req, 'brands', req.body?.ids);
    res.json({ ok: true });
  });

  // Turn a brand on/off at a location (creates the franchise the first time).
  router.put('/franchises', (req, res) => {
    const locationId = v.id(req.body?.location_id, 'location_id', { required: true });
    const brandId = v.id(req.body?.brand_id, 'brand_id', { required: true });
    const active = v.bool(req.body?.active);
    if (!db.prepare('SELECT 1 FROM locations WHERE id = ?').get(locationId)) throw notFound('Unknown location');
    if (!db.prepare('SELECT 1 FROM brands WHERE id = ?').get(brandId)) throw notFound('Unknown brand');
    const existing = db.prepare('SELECT * FROM franchises WHERE location_id = ? AND brand_id = ?').get(locationId, brandId);
    if (existing) {
      db.prepare('UPDATE franchises SET active = ? WHERE id = ?').run(active, existing.id);
    } else if (active) {
      db.prepare('INSERT INTO franchises (location_id, brand_id) VALUES (?, ?)').run(locationId, brandId);
    }
    log(req, 'update', 'franchises', existing?.id ?? null, existing ? { active: existing.active } : null, { location_id: locationId, brand_id: brandId, active });
    res.json({ franchise: db.prepare('SELECT * FROM franchises WHERE location_id = ? AND brand_id = ?').get(locationId, brandId) ?? null });
  });

  // ---- Models ----
  router.get('/models', (req, res) => {
    const brandId = v.id(req.query.brand_id, 'brand_id', { required: true });
    res.json({ models: db.prepare('SELECT * FROM models WHERE brand_id = ? ORDER BY sort_order, name').all(brandId) });
  });
  router.post('/models', (req, res) => {
    const brandId = v.id(req.body?.brand_id, 'brand_id', { required: true });
    const brand = getRow('brands', brandId);
    if (brand.is_used) throw badRequest('Used Cars uses makes and models instead (see Used car makes)');
    const name = v.text(req.body?.name, 'name', { required: true, max: 60 });
    if (nameExists('models', name, 'AND brand_id = ?', [brandId])) throw new v.ValidationError('name', `"${name}" already exists for ${brand.name}`);
    const id = Number(db.prepare('INSERT INTO models (brand_id, name, sort_order) VALUES (?, ?, ?)').run(brandId, name, nextSort('models', 'brand_id = ?', [brandId])).lastInsertRowid);
    log(req, 'create', 'models', id, null, { brand_id: brandId, name });
    res.status(201).json({ model: getRow('models', id) });
  });
  router.patch('/models/:id', (req, res) => {
    const row = getRow('models', req.params.id);
    res.json({ model: patchRow(req, 'models', row, {}, { where: 'AND brand_id = ?', params: [row.brand_id] }) });
  });
  router.post('/models/reorder', (req, res) => {
    const brandId = v.id(req.body?.brand_id, 'brand_id', { required: true });
    reorder(req, 'models', req.body?.ids, 'brand_id = ?', [brandId]);
    res.json({ ok: true });
  });

  // ---- Used car makes and models ----
  router.post('/used-makes', (req, res) => {
    const name = v.text(req.body?.name, 'name', { required: true, max: 60 });
    if (nameExists('used_makes', name)) throw new v.ValidationError('name', `"${name}" already exists`);
    const brandId = v.id(req.body?.brand_id, 'brand_id');
    if (brandId) getRow('brands', brandId);
    const id = Number(db.prepare('INSERT INTO used_makes (name, brand_id, sort_order) VALUES (?, ?, ?)').run(name, brandId, nextSort('used_makes')).lastInsertRowid);
    log(req, 'create', 'used_makes', id, null, { name, brand_id: brandId });
    res.status(201).json({ make: getRow('used_makes', id) });
  });
  router.patch('/used-makes/:id', (req, res) => {
    const row = getRow('used_makes', req.params.id);
    const extra = {};
    if (req.body?.brand_id !== undefined) {
      extra.brand_id = v.id(req.body.brand_id, 'brand_id');
      if (extra.brand_id) getRow('brands', extra.brand_id);
    }
    res.json({ make: patchRow(req, 'used_makes', row, extra) });
  });
  router.post('/used-models', (req, res) => {
    const makeId = v.id(req.body?.make_id, 'make_id', { required: true });
    getRow('used_makes', makeId);
    const name = v.text(req.body?.name, 'name', { required: true, max: 60 });
    if (db.prepare('SELECT 1 FROM used_models WHERE make_id = ? AND name = ?').get(makeId, name)) throw new v.ValidationError('name', `"${name}" already exists`);
    const id = Number(db.prepare('INSERT INTO used_models (make_id, name) VALUES (?, ?)').run(makeId, name).lastInsertRowid);
    log(req, 'create', 'used_models', id, null, { make_id: makeId, name });
    res.status(201).json({ model: getRow('used_models', id) });
  });
  router.patch('/used-models/:id', (req, res) => {
    const row = getRow('used_models', req.params.id);
    const b = req.body || {};
    const updates = {};
    if (b.name !== undefined) {
      updates.name = v.text(b.name, 'name', { required: true, max: 60 });
      if (db.prepare('SELECT 1 FROM used_models WHERE make_id = ? AND name = ? AND id != ?').get(row.make_id, updates.name, row.id)) {
        throw new v.ValidationError('name', `"${updates.name}" already exists`);
      }
    }
    if (b.active !== undefined) updates.active = v.bool(b.active);
    const cols = Object.keys(updates);
    if (cols.length) {
      db.prepare(`UPDATE used_models SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...cols.map((c) => updates[c]), row.id);
      log(req, 'update', 'used_models', row.id, Object.fromEntries(cols.map((c) => [c, row[c]])), updates);
    }
    res.json({ model: getRow('used_models', row.id) });
  });

  // ---- Lists: sources and lost reasons ----
  router.post('/lookups', (req, res) => {
    const type = v.oneOf(req.body?.list_type, 'list_type', ['source', 'lost_reason']);
    const label = v.text(req.body?.label, 'label', { required: true, max: 60 });
    if (db.prepare('SELECT 1 FROM lookup_values WHERE list_type = ? AND label = ?').get(type, label)) throw new v.ValidationError('label', `"${label}" already exists`);
    const id = Number(
      db.prepare('INSERT INTO lookup_values (list_type, label, sort_order) VALUES (?, ?, ?)').run(type, label, nextSort('lookup_values', 'list_type = ?', [type])).lastInsertRowid
    );
    log(req, 'create', 'lookup_values', id, null, { list_type: type, label });
    res.status(201).json({ item: getRow('lookup_values', id) });
  });
  router.patch('/lookups/:id', (req, res) => {
    const row = getRow('lookup_values', req.params.id);
    res.json({ item: patchRow(req, 'lookup_values', row, {}, { where: 'AND list_type = ?', params: [row.list_type] }, 'label') });
  });
  router.post('/lookups/reorder', (req, res) => {
    const type = v.oneOf(req.body?.list_type, 'list_type', ['source', 'lost_reason']);
    reorder(req, 'lookup_values', req.body?.ids, 'list_type = ?', [type]);
    res.json({ ok: true });
  });

  // ---- Audit log ----
  router.get('/audit', (req, res) => {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const where = [];
    const params = [];
    if (req.query.entity) {
      where.push('a.entity = ?');
      params.push(String(req.query.entity));
    }
    if (req.query.entity_id) {
      where.push('a.entity_id = ?');
      params.push(v.id(req.query.entity_id, 'entity_id'));
    }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = db.prepare(`SELECT COUNT(*) AS n FROM audit_log a ${w}`).get(...params).n;
    const items = db
      .prepare(`SELECT a.*, u.name AS user FROM audit_log a LEFT JOIN users u ON u.id = a.user_id ${w} ORDER BY a.id DESC LIMIT ? OFFSET ?`)
      .all(...params, limit, offset);
    res.json({ total, items });
  });

  return router;
};
