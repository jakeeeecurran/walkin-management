const express = require('express');
const v = require('../lib/validate');
const scope = require('../lib/scope');
const { audit } = require('../lib/audit');
const { notFound, forbidden, badRequest } = require('../lib/http');
const { localDate, addDays, monthOf, nowIso } = require('../lib/time');
const { transaction } = require('../db');
const { fuzzyFind, tidyName } = require('../lib/fuzzy');

const OUTCOMES = ['open', 'sold', 'lost'];

// Fields stored on the enquiry that the API accepts.
const EDITABLE = [
  'location_id', 'brand_id', 'salesperson_id', 'customer_name', 'postcode', 'phone', 'email',
  'model_id', 'used_make_id', 'used_model_id', 'used_extra_model_id', 'used_model_other', 'stock_number', 'used_make', 'used_model',
  'source_id', 'test_drive', 'trade_in', 'finance', 'outcome', 'lost_reason_id', 'next_followup_at', 'entry_date',
];

const SELECT = `
  SELECT e.*,
    l.id AS location_id, l.name AS location, b.id AS brand_id, b.name AS brand, b.is_used AS brand_is_used, b.colour AS brand_colour,
    m.name AS model,
    um.name AS used_make,
    COALESCE(ulm.name, uxm.name, e.used_model_other) AS used_model,
    sp.name AS salesperson, cb.name AS created_by_name,
    src.label AS source, lr.label AS lost_reason
  FROM enquiries e
  JOIN franchises f ON f.id = e.franchise_id
  JOIN locations l ON l.id = f.location_id
  JOIN brands b ON b.id = f.brand_id
  LEFT JOIN models m ON m.id = e.model_id
  LEFT JOIN used_makes um ON um.id = e.used_make_id
  LEFT JOIN models ulm ON ulm.id = e.used_model_id
  LEFT JOIN used_models uxm ON uxm.id = e.used_extra_model_id
  JOIN users sp ON sp.id = e.salesperson_id
  JOIN users cb ON cb.id = e.created_by
  LEFT JOIN lookup_values src ON src.id = e.source_id
  LEFT JOIN lookup_values lr ON lr.id = e.lost_reason_id`;

module.exports = function enquiryRoutes({ db, timeZone }) {
  const router = express.Router();
  const today = () => localDate(new Date(), timeZone);

  function load(id) {
    return db.prepare(`${SELECT} WHERE e.id = ?`).get(id);
  }

  function present(row, user) {
    const out = { ...row };
    out.phone_display = v.formatPhone(row.phone);
    out.vehicle = row.brand_is_used
      ? [row.used_make, row.used_model].filter(Boolean).join(' ') || null
      : row.model;
    out.overdue = row.outcome === 'open' && row.next_followup_at && row.next_followup_at < today();
    out.can_edit = scope.canEditEnquiry(db, user, row);
    for (const k of ['test_drive', 'trade_in', 'finance', 'is_invalid', 'brand_is_used']) out[k] = row[k] === 1;
    return out;
  }

  function getVisible(req) {
    const id = v.id(req.params.id, 'id', { required: true });
    const row = load(id);
    if (!row || !scope.canViewEnquiry(db, req.user, row)) throw notFound('Enquiry not found');
    return row;
  }

  function addActivity(enquiryId, userId, type, body, followupDue = null) {
    db.prepare('INSERT INTO activities (enquiry_id, user_id, type, body, followup_due, local_date) VALUES (?, ?, ?, ?, ?, ?)').run(
      enquiryId,
      userId,
      type,
      body ?? null,
      followupDue,
      today()
    );
  }

  // Validates input against the current record (if editing) and the user's permissions,
  // returning the full set of column values to store.
  function build(user, input, existing) {
    const has = (k) => Object.prototype.hasOwnProperty.call(input, k);
    const pick = (k, fallback) => (has(k) ? input[k] : fallback);
    const isNew = !existing;
    const manager = scope.isManager(user);
    const rec = {};

    // --- Site and brand (franchise) ---
    const locationId = v.id(pick('location_id', existing?.location_id), 'location_id', { required: true });
    const brandId = v.id(pick('brand_id', existing?.brand_id), 'brand_id', { required: true });
    const franchise = db
      .prepare(
        `SELECT f.id, f.active, l.active AS location_active, b.active AS brand_active, b.is_used
         FROM franchises f JOIN locations l ON l.id = f.location_id JOIN brands b ON b.id = f.brand_id
         WHERE f.location_id = ? AND f.brand_id = ?`
      )
      .get(locationId, brandId);
    if (!franchise) throw new v.ValidationError('brand_id', 'That brand is not sold at that location');
    const franchiseChanged = isNew || franchise.id !== existing.franchise_id;
    if (franchiseChanged) {
      if (!scope.hasFranchise(db, user, franchise.id)) throw new v.ValidationError('brand_id', 'You are not assigned to that brand at that location');
      if (!(franchise.active && franchise.location_active && franchise.brand_active)) {
        throw new v.ValidationError('brand_id', 'That brand is no longer active at that location');
      }
    }
    rec.franchise_id = franchise.id;

    // --- Salesperson ---
    const salespersonId = v.id(pick('salesperson_id', existing?.salesperson_id ?? user.id), 'salesperson_id', { required: true });
    const salespersonChanged = isNew || salespersonId !== existing.salesperson_id;
    if (salespersonChanged || franchiseChanged) {
      if (!manager && salespersonId !== user.id) throw forbidden('Only managers can assign enquiries to someone else');
      if (!scope.canAssignTo(db, user, franchise.id, salespersonId)) {
        throw new v.ValidationError('salesperson_id', 'That person is not assigned to this brand at this location');
      }
    }
    rec.salesperson_id = salespersonId;

    // --- Customer ---
    rec.customer_name = v.personName(pick('customer_name', existing?.customer_name));
    rec.postcode = v.postcode(pick('postcode', existing?.postcode));
    rec.phone = v.phone(pick('phone', existing?.phone));
    rec.email = v.email(pick('email', existing?.email));
    if (!rec.phone && !rec.email) throw new v.ValidationError('phone', 'Enter a phone number or an email address');

    // --- Vehicle ---
    const unchanged = (k, value) => !isNew && existing[k] === value; // retired list items may stay on old enquiries
    rec.model_id = rec.used_make_id = rec.used_model_id = rec.used_extra_model_id = rec.used_model_other = rec.stock_number = null;
    if (franchise.is_used) {
      resolveTypedUsedVehicle(input);
      const makeId = v.id(pick('used_make_id', existing?.used_make_id), 'used_make_id', { required: true });
      const make = db.prepare('SELECT * FROM used_makes WHERE id = ?').get(makeId);
      if (!make || (!make.active && !unchanged('used_make_id', makeId))) throw new v.ValidationError('used_make_id', 'Choose a make from the list');
      rec.used_make_id = makeId;

      const linkedId = v.id(pick('used_model_id', existing?.used_model_id), 'used_model_id');
      const extraId = v.id(pick('used_extra_model_id', existing?.used_extra_model_id), 'used_extra_model_id');
      const other = v.text(pick('used_model_other', existing?.used_model_other), 'used_model_other', { max: 60 });
      if ([linkedId, extraId, other].filter((x) => x != null).length !== 1) {
        throw new v.ValidationError('used_model_id', 'Enter the model');
      }
      if (linkedId) {
        const m = db.prepare('SELECT * FROM models WHERE id = ?').get(linkedId);
        if (!m || m.brand_id !== make.brand_id || (!m.active && !unchanged('used_model_id', linkedId))) {
          throw new v.ValidationError('used_model_id', 'Choose a model from the list for that make');
        }
        rec.used_model_id = linkedId;
      } else if (extraId) {
        const m = db.prepare('SELECT * FROM used_models WHERE id = ?').get(extraId);
        if (!m || m.make_id !== makeId || (!m.active && !unchanged('used_extra_model_id', extraId))) {
          throw new v.ValidationError('used_model_id', 'Choose a model from the list for that make');
        }
        rec.used_extra_model_id = extraId;
      } else {
        rec.used_model_other = other;
      }
      rec.stock_number = v.stockNumber(pick('stock_number', existing?.stock_number));
    } else {
      const modelId = v.id(pick('model_id', existing?.model_id), 'model_id', { required: true });
      const m = db.prepare('SELECT * FROM models WHERE id = ?').get(modelId);
      if (!m || m.brand_id !== brandId || (!m.active && !unchanged('model_id', modelId))) {
        throw new v.ValidationError('model_id', 'Choose a model from the list for that brand');
      }
      rec.model_id = modelId;
    }

    // --- Source ---
    let sourceId = v.id(pick('source_id', existing?.source_id), 'source_id');
    if (sourceId == null && isNew) {
      sourceId = db.prepare("SELECT id FROM lookup_values WHERE list_type = 'source' AND active = 1 ORDER BY sort_order LIMIT 1").get()?.id ?? null;
    }
    if (sourceId != null) {
      const s = db.prepare("SELECT * FROM lookup_values WHERE id = ? AND list_type = 'source'").get(sourceId);
      if (!s || (!s.active && !unchanged('source_id', sourceId))) throw new v.ValidationError('source_id', 'Choose a source from the list');
    }
    rec.source_id = sourceId;

    // --- Test drive / trade / finance ---
    for (const k of ['test_drive', 'trade_in', 'finance']) rec[k] = v.bool(pick(k, existing?.[k] ?? 0));

    // --- Outcome ---
    const outcome = v.oneOf(pick('outcome', existing?.outcome ?? 'open'), 'outcome', OUTCOMES);
    const outcomeChanged = !isNew && outcome !== existing.outcome;
    if (outcomeChanged && existing.outcome !== 'open' && !manager) {
      throw forbidden('Only a manager can re-open or change a sold or lost enquiry');
    }
    rec.outcome = outcome;
    rec.lost_reason_id = null;
    rec.next_followup_at = null;
    rec.sold_at = null;
    rec.sold_date = null;
    rec.closed_at = null;
    if (outcome === 'open') {
      let follow = v.isoDate(pick('next_followup_at', existing?.next_followup_at), 'next_followup_at');
      if (!follow && isNew) follow = addDays(today(), 1);
      if (!follow) throw new v.ValidationError('next_followup_at', 'Set the next follow-up date');
      if (follow < today() && (isNew || follow !== existing.next_followup_at)) {
        throw new v.ValidationError('next_followup_at', 'Next follow-up cannot be in the past');
      }
      rec.next_followup_at = follow;
    } else {
      rec.closed_at = !isNew && existing.outcome === outcome ? existing.closed_at : nowIso();
      if (outcome === 'sold') {
        const keep = !isNew && existing.outcome === 'sold';
        rec.sold_at = keep ? existing.sold_at : nowIso();
        rec.sold_date = keep ? existing.sold_date : today();
      } else {
        const reasonId = v.id(pick('lost_reason_id', existing?.lost_reason_id), 'lost_reason_id', { required: true });
        const r = db.prepare("SELECT * FROM lookup_values WHERE id = ? AND list_type = 'lost_reason'").get(reasonId);
        if (!r || (!r.active && !unchanged('lost_reason_id', reasonId))) throw new v.ValidationError('lost_reason_id', 'Choose a lost reason from the list');
        rec.lost_reason_id = reasonId;
      }
    }

    // --- Date of entry (managers can back-date) ---
    let entryDate = isNew ? today() : existing.entry_date;
    if (has('entry_date') && input.entry_date !== entryDate) {
      if (!manager) throw forbidden('Only managers can change the date of entry');
      entryDate = v.isoDate(input.entry_date, 'entry_date', { required: true });
      if (entryDate > today()) throw new v.ValidationError('entry_date', 'Date of entry cannot be in the future');
    }
    rec.entry_date = entryDate;
    rec.entry_month = monthOf(entryDate);

    return rec;
  }

  // Used cars: the make and model are typed freely ("honda", "civic"). They're matched to the
  // existing lists, allowing small typos; anything new is added to the lists so reports stay tidy.
  // Runs inside the save transaction, so a failed save adds nothing.
  function resolveTypedUsedVehicle(input) {
    if (input.used_make === undefined && input.used_model === undefined) return;
    if (input.used_make !== undefined) {
      const typed = v.text(input.used_make, 'used_make_id', { required: true, max: 40 });
      const makes = db.prepare('SELECT * FROM used_makes').all();
      let make = fuzzyFind(makes, typed);
      if (!make) {
        const name = tidyName(typed);
        const id = Number(db.prepare('INSERT INTO used_makes (name, sort_order) VALUES (?, 0)').run(name).lastInsertRowid);
        make = db.prepare('SELECT * FROM used_makes WHERE id = ?').get(id);
      } else if (!make.active) {
        db.prepare('UPDATE used_makes SET active = 1 WHERE id = ?').run(make.id);
      }
      input.used_make_id = make.id;
    }
    const makeId = input.used_make_id;
    const make = makeId ? db.prepare('SELECT * FROM used_makes WHERE id = ?').get(makeId) : null;
    if (input.used_model !== undefined && make) {
      const typed = v.text(input.used_model, 'used_model_id', { required: true, max: 60 });
      input.used_model_id = null;
      input.used_extra_model_id = null;
      input.used_model_other = null;
      const linked = make.brand_id ? db.prepare('SELECT * FROM models WHERE brand_id = ?').all(make.brand_id) : [];
      const extra = db.prepare('SELECT * FROM used_models WHERE make_id = ?').all(make.id);
      const hitLinked = fuzzyFind(linked, typed, 'name', { prefix: false });
      const hitExtra = hitLinked ? null : fuzzyFind(extra, typed, 'name', { prefix: false });
      if (hitLinked) input.used_model_id = hitLinked.id;
      else if (hitExtra) {
        if (!hitExtra.active) db.prepare('UPDATE used_models SET active = 1 WHERE id = ?').run(hitExtra.id);
        input.used_extra_model_id = hitExtra.id;
      } else {
        input.used_extra_model_id = Number(db.prepare('INSERT INTO used_models (make_id, name) VALUES (?, ?)').run(make.id, tidyName(typed)).lastInsertRowid);
      }
    }
  }

  function describeChanges(before, after) {
    const labels = {
      franchise_id: 'site/brand', salesperson_id: 'salesperson', customer_name: 'name', postcode: 'postcode', phone: 'phone',
      email: 'email', model_id: 'model', used_make_id: 'make', used_model_id: 'model', used_extra_model_id: 'model',
      used_model_other: 'model', stock_number: 'stock number', source_id: 'source', test_drive: 'test drive',
      trade_in: 'trade-in', finance: 'finance', next_followup_at: 'next follow-up', entry_date: 'date of entry',
    };
    const changed = new Set();
    for (const [k, name] of Object.entries(labels)) if (before[k] !== after[k]) changed.add(name);
    return [...changed];
  }

  // ---- Routes ----

  router.get('/', (req, res) => {
    const user = req.user;
    const filter = scope.enquiryFilter(db, user);
    const where = [filter.sql];
    const params = [...filter.params];
    const q = req.query;

    if (!(q.include_invalid === '1' && scope.isManager(user))) where.push('e.is_invalid = 0');
    if (q.outcome) {
      where.push('e.outcome = ?');
      params.push(v.oneOf(q.outcome, 'outcome', OUTCOMES));
    }
    if (q.month) {
      if (!/^\d{4}-\d{2}$/.test(q.month)) throw badRequest('month must be YYYY-MM');
      where.push('e.entry_month = ?');
      params.push(q.month);
    }
    if (q.entry_date) {
      where.push('e.entry_date = ?');
      params.push(v.isoDate(q.entry_date, 'entry_date'));
    }
    if (q.from) {
      where.push('e.entry_date >= ?');
      params.push(v.isoDate(q.from, 'from'));
    }
    if (q.to) {
      where.push('e.entry_date <= ?');
      params.push(v.isoDate(q.to, 'to'));
    }
    if (q.location_id) {
      where.push('f.location_id = ?');
      params.push(v.id(q.location_id, 'location_id'));
    }
    if (q.brand_id) {
      where.push('f.brand_id = ?');
      params.push(v.id(q.brand_id, 'brand_id'));
    }
    if (q.salesperson_id) {
      where.push('e.salesperson_id = ?');
      params.push(v.id(q.salesperson_id, 'salesperson_id'));
    }
    if (q.overdue === '1') {
      where.push("e.outcome = 'open' AND e.next_followup_at < ?");
      params.push(today());
    }
    if (q.due === 'today') {
      where.push("e.outcome = 'open' AND e.next_followup_at <= ?");
      params.push(today());
    }
    if (q.q) {
      const term = String(q.q).trim().slice(0, 100);
      const digits = term.replace(/\D/g, '');
      const like = `%${term.replace(/[%_\\]/g, (c) => '\\' + c)}%`;
      const parts = ["e.customer_name LIKE ? ESCAPE '\\'", "e.email LIKE ? ESCAPE '\\'", "e.stock_number LIKE ? ESCAPE '\\'"];
      const p = [like, like, like.toUpperCase()];
      if (digits.length >= 3 && !/\p{L}/u.test(term)) {
        parts.push('e.phone LIKE ?');
        p.push(`%${digits}%`);
      }
      if (/^\d+$/.test(term)) {
        parts.push('e.id = ?');
        p.push(Number(term));
      }
      where.push(`(${parts.join(' OR ')})`);
      params.push(...p);
    }

    const limit = Math.min(Math.max(parseInt(q.limit, 10) || 50, 1), 200);
    const offset = Math.max(parseInt(q.offset, 10) || 0, 0);
    const sorts = {
      newest: 'e.entry_date DESC, e.id DESC',
      oldest: 'e.entry_date ASC, e.id ASC',
      followup: "CASE WHEN e.outcome = 'open' THEN 0 ELSE 1 END, e.next_followup_at ASC, e.id DESC",
      name: 'e.customer_name COLLATE NOCASE ASC',
    };
    const order = sorts[q.sort] || sorts.newest;
    const whereSql = where.join(' AND ');
    const total = db.prepare(`SELECT COUNT(*) AS n FROM enquiries e JOIN franchises f ON f.id = e.franchise_id WHERE ${whereSql}`).get(...params).n;
    const rows = db.prepare(`${SELECT} WHERE ${whereSql} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...params, limit, offset);
    res.json({ total, limit, offset, items: rows.map((r) => present(r, user)) });
  });

  // Open enquiries anywhere in the dealership with the same phone or email.
  router.get('/duplicates', (req, res) => {
    const phone = req.query.phone ? v.phone(req.query.phone) : null;
    const email = req.query.email ? v.email(req.query.email) : null;
    if (!phone && !email) return res.json({ matches: [] });
    const exclude = req.query.exclude_id ? v.id(req.query.exclude_id, 'exclude_id') : 0;
    const rows = db
      .prepare(
        `${SELECT} WHERE e.outcome = 'open' AND e.is_invalid = 0 AND e.id != ?
         AND ((? IS NOT NULL AND e.phone = ?) OR (? IS NOT NULL AND e.email = ?))
         ORDER BY e.entry_date DESC LIMIT 10`
      )
      .all(exclude, phone, phone, email, email);
    res.json({
      matches: rows.map((r) => {
        const visible = scope.canViewEnquiry(db, req.user, r);
        return {
          id: visible ? r.id : null,
          can_view: visible,
          salesperson: r.salesperson,
          location: r.location,
          brand: r.brand,
          entry_date: r.entry_date,
          match_on: phone && r.phone === phone ? 'phone' : 'email',
        };
      }),
    });
  });

  router.get('/:id', (req, res) => {
    const row = getVisible(req);
    const activities = db
      .prepare(
        `SELECT a.id, a.type, a.body, a.created_at, u.name AS user FROM activities a JOIN users u ON u.id = a.user_id
         WHERE a.enquiry_id = ? ORDER BY a.created_at DESC, a.id DESC`
      )
      .all(row.id);
    res.json({ enquiry: present(row, req.user), activities });
  });

  router.post('/', (req, res) => {
    const user = req.user;
    const input = pickInput(req.body);
    const comment = v.multilineText(req.body?.comment, 'comment');
    const id = transaction(db, () => {
      const rec = build(user, input, null);
      const cols = Object.keys(rec);
      const newId = Number(
        db
          .prepare(`INSERT INTO enquiries (${cols.join(', ')}, created_by) VALUES (${cols.map(() => '?').join(', ')}, ?)`)
          .run(...cols.map((c) => rec[c]), user.id).lastInsertRowid
      );
      addActivity(newId, user.id, 'created', null);
      if (comment) addActivity(newId, user.id, 'comment', comment);
      audit(db, { userId: user.id, action: 'create', entity: 'enquiry', entityId: newId, after: rec });
      return newId;
    });
    res.status(201).json({ enquiry: present(load(id), user) });
  });

  router.patch('/:id', (req, res) => {
    const user = req.user;
    const existing = getVisible(req);
    if (!scope.canEditEnquiry(db, user, existing)) throw forbidden();
    const input = pickInput(req.body);
    const comment = v.multilineText(req.body?.comment, 'comment');

    transaction(db, () => {
      const rec = build(user, input, existing);
      const before = Object.fromEntries(Object.keys(rec).map((k) => [k, existing[k]]));
      const cols = Object.keys(rec);
      db.prepare(`UPDATE enquiries SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE id = ?`).run(
        ...cols.map((c) => rec[c]),
        nowIso(),
        existing.id
      );
      if (before.outcome !== rec.outcome) {
        const cap = (s) => s[0].toUpperCase() + s.slice(1);
        addActivity(existing.id, user.id, 'status_change', `${cap(before.outcome)} → ${cap(rec.outcome)}`);
      }
      if (before.salesperson_id !== rec.salesperson_id) {
        const to = db.prepare('SELECT name FROM users WHERE id = ?').get(rec.salesperson_id).name;
        addActivity(existing.id, user.id, 'reassigned', `${existing.salesperson} → ${to}`);
      }
      const changed = describeChanges(before, rec).filter((c) => c !== 'salesperson');
      if (changed.length) addActivity(existing.id, user.id, 'edited', `Changed ${changed.join(', ')}`);
      if (comment) addActivity(existing.id, user.id, 'comment', comment);
      audit(db, { userId: user.id, action: 'update', entity: 'enquiry', entityId: existing.id, before, after: rec });
    });
    res.json({ enquiry: present(load(existing.id), user) });
  });

  // Add a comment or log a contact (call / email / SMS / follow-up done).
  router.post('/:id/activities', (req, res) => {
    const row = getVisible(req);
    if (!scope.canEditEnquiry(db, req.user, row)) throw forbidden();
    const type = v.oneOf(req.body?.type ?? 'comment', 'type', ['comment', 'call', 'email', 'sms', 'followup_done']);
    const body = v.multilineText(req.body?.body, 'body', { required: type === 'comment' });
    addActivity(row.id, req.user.id, type, body);
    db.prepare('UPDATE enquiries SET updated_at = ? WHERE id = ?').run(nowIso(), row.id);
    res.status(201).json({ ok: true });
  });

  // Log a follow-up (call, email, SMS, no answer...) and set the next follow-up date in one step.
  router.post('/:id/followup', (req, res) => {
    const row = getVisible(req);
    if (!scope.canEditEnquiry(db, req.user, row)) throw forbidden();
    if (row.outcome !== 'open') throw badRequest('This enquiry is already closed');
    const type = v.oneOf(req.body?.type ?? 'followup_done', 'type', ['call', 'email', 'sms', 'followup_done']);
    const noAnswer = req.body?.no_answer === true;
    const note = v.multilineText(req.body?.body, 'body');
    const next = v.isoDate(req.body?.next_followup_at, 'next_followup_at', { required: true });
    if (next < today()) throw new v.ValidationError('next_followup_at', 'Next follow-up cannot be in the past');
    const labels = { call: 'Called', email: 'Emailed', sms: 'Sent SMS', followup_done: 'Followed up' };
    const body = [labels[type] + (noAnswer ? ' (no answer)' : ''), note].filter(Boolean).join(': ');
    transaction(db, () => {
      addActivity(row.id, req.user.id, type, `${body}. Next follow-up ${next}`, row.next_followup_at);
      db.prepare('UPDATE enquiries SET next_followup_at = ?, updated_at = ? WHERE id = ?').run(next, nowIso(), row.id);
    });
    res.json({ enquiry: present(load(row.id), req.user) });
  });

  // Privacy request: blank the customer's contact details but keep the enquiry for reporting.
  router.post('/:id/remove-personal-details', (req, res) => {
    const row = getVisible(req);
    if (!scope.hasFullAccess(req.user)) throw forbidden('Only the general manager or an admin can do that');
    if (req.body?.confirm !== true) throw badRequest('Confirmation required');
    transaction(db, () => {
      db.prepare("UPDATE enquiries SET customer_name = 'Removed at customer request', phone = NULL, email = NULL, updated_at = ? WHERE id = ?").run(nowIso(), row.id);
      // Comments may hold personal details too.
      db.prepare("UPDATE activities SET body = '[removed at customer request]' WHERE enquiry_id = ? AND type IN ('comment', 'call', 'email', 'sms', 'followup_done')").run(row.id);
      // The audit log's before/after copies hold the same details.
      db.prepare("UPDATE audit_log SET before_json = NULL, after_json = NULL WHERE entity = 'enquiry' AND entity_id = ?").run(row.id);
      addActivity(row.id, req.user.id, 'edited', 'Customer contact details and comments removed at customer request');
      audit(db, { userId: req.user.id, action: 'remove_personal_details', entity: 'enquiry', entityId: row.id });
    });
    res.json({ enquiry: present(load(row.id), req.user) });
  });

  // Mark as duplicate/invalid (or undo). Enquiries are never deleted.
  router.post('/:id/invalid', (req, res) => {
    const row = getVisible(req);
    if (!scope.isManager(req.user)) throw forbidden('Only managers can mark an enquiry as duplicate/invalid');
    const invalid = req.body?.invalid !== false;
    const reason = invalid ? v.text(req.body?.reason, 'reason', { required: true, max: 200 }) : null;
    transaction(db, () => {
      db.prepare('UPDATE enquiries SET is_invalid = ?, invalid_reason = ?, updated_at = ? WHERE id = ?').run(invalid ? 1 : 0, reason, nowIso(), row.id);
      addActivity(row.id, req.user.id, 'invalid', invalid ? `Marked duplicate/invalid: ${reason}` : 'Restored (no longer marked invalid)');
      audit(db, {
        userId: req.user.id,
        action: invalid ? 'mark_invalid' : 'restore_valid',
        entity: 'enquiry',
        entityId: row.id,
        before: { is_invalid: row.is_invalid, invalid_reason: row.invalid_reason },
        after: { is_invalid: invalid ? 1 : 0, invalid_reason: reason },
      });
    });
    res.json({ enquiry: present(load(row.id), req.user) });
  });

  return router;
};

function pickInput(body) {
  const input = {};
  for (const k of EDITABLE) if (body && Object.prototype.hasOwnProperty.call(body, k)) input[k] = body[k];
  return input;
}
