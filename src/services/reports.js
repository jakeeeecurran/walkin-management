// Report figures. Conversion = enquiries sold ÷ enquiries, counted against the enquiries
// entered in the period. "Cars sold" is counted separately by the date the sale was recorded.
const scope = require('../lib/scope');
const { addDays, localDate } = require('../lib/time');
const { getSetting } = require('../lib/settings');

const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : null);

// Works out the date range for a period. period: day | month | year | range
function periodRange(period, ref, from, to) {
  if (period === 'range') {
    if (!from || !to || from > to) throw Object.assign(new Error('Choose a valid date range'), { status: 400 });
    const days = Math.round((Date.parse(to) - Date.parse(from)) / 86400e3) + 1;
    return { from, to, label: `${from} to ${to}`, prev: { from: addDays(from, -days), to: addDays(from, -1) } };
  }
  if (period === 'day') {
    return { from: ref, to: ref, label: ref, prev: { from: addDays(ref, -1), to: addDays(ref, -1) } };
  }
  if (period === 'year') {
    const y = ref.slice(0, 4);
    const last = String(Number(y) - 1);
    // Year to date, compared with the same part of last year.
    return { from: `${y}-01-01`, to: ref, label: `${y} year to date`, prev: { from: `${last}-01-01`, to: `${last}${ref.slice(4)}` } };
  }
  // month (default): month to date when it's the current month, else the whole month
  const m = ref.slice(0, 7);
  const monthEnd = lastDayOfMonth(m);
  const to2 = ref < monthEnd ? ref : monthEnd;
  const [yy, mm] = m.split('-').map(Number);
  const pm = mm === 1 ? `${yy - 1}-12` : `${yy}-${String(mm - 1).padStart(2, '0')}`;
  const prevTo = `${pm}-${String(Math.min(Number(to2.slice(8)), Number(lastDayOfMonth(pm).slice(8)))).padStart(2, '0')}`;
  return { from: `${m}-01`, to: to2, label: m, prev: { from: `${pm}-01`, to: prevTo } };
}

function lastDayOfMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

function filters(db, user, f) {
  const base = scope.enquiryFilter(db, user);
  const where = [base.sql, 'e.is_invalid = 0'];
  const params = [...base.params];
  if (f.location_id) {
    where.push('fr.location_id = ?');
    params.push(f.location_id);
  }
  if (f.brand_id) {
    where.push('fr.brand_id = ?');
    params.push(f.brand_id);
  }
  if (f.salesperson_id) {
    where.push('e.salesperson_id = ?');
    params.push(f.salesperson_id);
  }
  return { sql: where.join(' AND '), params };
}

const ROWS = `
  SELECT e.id, e.entry_date, e.outcome, e.closed_at, e.sold_at, e.test_drive, e.trade_in, e.finance, e.postcode, e.customer_name,
         e.salesperson_id, sp.name AS salesperson, fr.location_id, l.name AS location, fr.brand_id, b.name AS brand,
         COALESCE(m.name, CASE WHEN e.used_make_id IS NOT NULL THEN um.name || ' ' || COALESCE(ulm.name, uxm.name, e.used_model_other) END, 'Not recorded') AS vehicle,
         COALESCE(src.label, 'Not recorded') AS source, lr.label AS lost_reason, e.next_followup_at
  FROM enquiries e
  JOIN franchises fr ON fr.id = e.franchise_id
  JOIN locations l ON l.id = fr.location_id
  JOIN brands b ON b.id = fr.brand_id
  JOIN users sp ON sp.id = e.salesperson_id
  LEFT JOIN models m ON m.id = e.model_id
  LEFT JOIN used_makes um ON um.id = e.used_make_id
  LEFT JOIN models ulm ON ulm.id = e.used_model_id
  LEFT JOIN used_models uxm ON uxm.id = e.used_extra_model_id
  LEFT JOIN lookup_values src ON src.id = e.source_id
  LEFT JOIN lookup_values lr ON lr.id = e.lost_reason_id`;

function totals(rows) {
  const n = rows.length;
  const count = (fn) => rows.filter(fn).length;
  const sold = count((r) => r.outcome === 'sold');
  const lost = count((r) => r.outcome === 'lost');
  const td = rows.filter((r) => r.test_drive === 1);
  const noTd = rows.filter((r) => r.test_drive !== 1);
  return {
    enquiries: n,
    sold,
    lost,
    open: n - sold - lost,
    conversion: pct(sold, n),
    test_drives: td.length,
    test_drive_rate: pct(td.length, n),
    trade_ins: count((r) => r.trade_in === 1),
    trade_in_rate: pct(count((r) => r.trade_in === 1), n),
    finance: count((r) => r.finance === 1),
    finance_rate: pct(count((r) => r.finance === 1), n),
    conversion_with_test_drive: pct(td.filter((r) => r.outcome === 'sold').length, td.length),
    conversion_without_test_drive: pct(noTd.filter((r) => r.outcome === 'sold').length, noTd.length),
  };
}

function groupBy(rows, keyFn, labelFn, limit) {
  const groups = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (!groups.has(k)) groups.set(k, { key: k, label: labelFn(r), rows: [] });
    groups.get(k).rows.push(r);
  }
  let out = [...groups.values()].map((g) => {
    const t = totals(g.rows);
    return { key: g.key, label: g.label, enquiries: t.enquiries, sold: t.sold, lost: t.lost, open: t.open, test_drives: t.test_drives, conversion: t.conversion };
  });
  out.sort((a, b) => b.enquiries - a.enquiries || b.sold - a.sold || String(a.label).localeCompare(String(b.label)));
  if (limit) out = out.slice(0, limit);
  return out;
}

function summary(db, user, opts) {
  const timeZone = getSetting(db, 'timezone', 'Australia/Brisbane');
  const today = localDate(new Date(), timeZone);
  const ref = opts.date || today;
  const range = periodRange(opts.period || 'month', ref, opts.from, opts.to);
  const f = filters(db, user, opts);

  const rows = db.prepare(`${ROWS} WHERE ${f.sql} AND e.entry_date BETWEEN ? AND ? ORDER BY e.entry_date DESC, e.id DESC`).all(...f.params, range.from, range.to);
  const prevRows = db.prepare(`${ROWS} WHERE ${f.sql} AND e.entry_date BETWEEN ? AND ?`).all(...f.params, range.prev.from, range.prev.to);

  const soldBy = (from, to) =>
    db.prepare(`SELECT COUNT(*) AS n FROM enquiries e JOIN franchises fr ON fr.id = e.franchise_id WHERE ${f.sql} AND e.outcome = 'sold' AND e.sold_date BETWEEN ? AND ?`).get(...f.params, from, to).n;

  const followups = db
    .prepare(
      `SELECT
         SUM(CASE WHEN e.outcome = 'open' AND e.pending_outcome IS NULL AND e.next_followup_at < ? THEN 1 ELSE 0 END) AS overdue,
         SUM(CASE WHEN e.outcome = 'open' AND e.pending_outcome IS NULL AND e.next_followup_at = ? THEN 1 ELSE 0 END) AS due_today,
         SUM(CASE WHEN e.pending_outcome IS NOT NULL THEN 1 ELSE 0 END) AS awaiting_approval
       FROM enquiries e JOIN franchises fr ON fr.id = e.franchise_id WHERE ${f.sql}`
    )
    .get(today, today, ...f.params);

  const compliance = db
    .prepare(
      `SELECT COUNT(*) AS done, SUM(CASE WHEN a.local_date <= a.followup_due THEN 1 ELSE 0 END) AS on_time
       FROM activities a JOIN enquiries e ON e.id = a.enquiry_id JOIN franchises fr ON fr.id = e.franchise_id
       WHERE ${f.sql} AND a.followup_due IS NOT NULL AND a.local_date BETWEEN ? AND ?`
    )
    .get(...f.params, range.from, range.to);

  const escalationDays = Number(getSetting(db, 'followup.escalation_days', '3')) || 3;
  const staleDays = Number(getSetting(db, 'followup.stale_days', '45')) || 45;
  const escalated = db
    .prepare(
      `${ROWS} WHERE ${f.sql} AND e.outcome = 'open' AND e.pending_outcome IS NULL AND e.next_followup_at <= ? ORDER BY e.next_followup_at LIMIT 50`
    )
    .all(...f.params, addDays(today, -escalationDays));
  const stale = db
    .prepare(
      `${ROWS} WHERE ${f.sql} AND e.outcome = 'open'
       AND COALESCE((SELECT MAX(a.local_date) FROM activities a WHERE a.enquiry_id = e.id), e.entry_date) <= ?
       ORDER BY e.entry_date LIMIT 50`
    )
    .all(...f.params, addDays(today, -staleDays));

  const t = totals(rows);
  const p = totals(prevRows);
  const lostRows = rows.filter((r) => r.outcome === 'lost');

  return {
    period: { type: opts.period || 'month', from: range.from, to: range.to, label: range.label, previous: range.prev, today },
    totals: { ...t, cars_sold: soldBy(range.from, range.to) },
    previous: { ...p, cars_sold: soldBy(range.prev.from, range.prev.to) },
    followups: {
      overdue: followups.overdue || 0,
      due_today: followups.due_today || 0,
      awaiting_approval: followups.awaiting_approval || 0,
      done: compliance.done || 0,
      on_time: compliance.on_time || 0,
      on_time_rate: pct(compliance.on_time || 0, compliance.done || 0),
      escalation_days: escalationDays,
      stale_days: staleDays,
    },
    by_location: groupBy(rows, (r) => r.location_id, (r) => r.location),
    by_brand: groupBy(rows, (r) => r.brand_id, (r) => r.brand),
    by_location_brand: groupBy(rows, (r) => `${r.location_id}-${r.brand_id}`, (r) => `${r.brand} – ${r.location}`),
    by_salesperson: groupBy(rows, (r) => r.salesperson_id, (r) => r.salesperson),
    by_model: groupBy(rows, (r) => `${r.brand_id}|${r.vehicle}`, (r) => `${r.brand} ${r.vehicle}`.replace(/^Used Cars /, 'Used: '), 20),
    by_source: groupBy(rows, (r) => r.source, (r) => r.source),
    by_postcode: groupBy(rows, (r) => r.postcode || '—', (r) => r.postcode || 'Not recorded', 20),
    lost_reasons: groupBy(lostRows, (r) => r.lost_reason || 'Not recorded', (r) => r.lost_reason || 'Not recorded').map((g) => ({
      label: g.label,
      count: g.enquiries,
      share: pct(g.enquiries, lostRows.length),
    })),
    escalated: escalated.map(slim),
    stale: stale.map(slim),
    enquiries: (opts.period === 'day' ? rows : []).map(slim),
  };
}

function slim(r) {
  return {
    id: r.id,
    customer_name: r.customer_name,
    entry_date: r.entry_date,
    location: r.location,
    brand: r.brand,
    vehicle: r.vehicle,
    salesperson: r.salesperson,
    outcome: r.outcome,
    test_drive: r.test_drive === 1,
    next_followup_at: r.next_followup_at,
  };
}

// Brand trends for the general manager: enquiries, test drives and cars sold per brand.
// One month selected -> one point per day of that month (up to today). Several months ->
// one point per selected month. Enquiries and test drives count by the date the enquiry
// was entered; cars sold by the date the sale was recorded. Share and conversion cover
// the whole selection (conversion = enquiries sold ÷ enquiries, as elsewhere).
function trends(db, user, opts) {
  const timeZone = getSetting(db, 'timezone', 'Australia/Brisbane');
  const today = localDate(new Date(), timeZone);
  const months = [...new Set(opts.months && opts.months.length ? opts.months : [today.slice(0, 7)])].filter((m) => m <= today.slice(0, 7)).sort();
  if (!months.length) throw Object.assign(new Error('Choose a month that has started'), { status: 400 });
  const daily = months.length === 1;
  let buckets;
  if (daily) {
    const end = months[0] === today.slice(0, 7) ? today : lastDayOfMonth(months[0]);
    buckets = [];
    for (let d = `${months[0]}-01`; d <= end; d = addDays(d, 1)) buckets.push(d);
  } else {
    buckets = months;
  }
  const index = new Map(buckets.map((k, i) => [k, i]));
  const keyOf = (date) => (daily ? date : date.slice(0, 7));
  const f = filters(db, user, { location_id: opts.location_id });
  const inMonths = (col) => `substr(${col}, 1, 7) IN (${months.map(() => '?').join(', ')})`;

  const brands = new Map();
  const brand = (id, name) => {
    if (!brands.has(id)) {
      const zero = () => buckets.map(() => 0);
      brands.set(id, { id, name, enquiries: zero(), test_drives: zero(), sold: zero(), total_converted: 0 });
    }
    return brands.get(id);
  };
  const entered = db
    .prepare(
      `SELECT fr.brand_id AS id, b.name, e.entry_date AS date, COUNT(*) AS n,
              SUM(CASE WHEN e.test_drive = 1 THEN 1 ELSE 0 END) AS td,
              SUM(CASE WHEN e.outcome = 'sold' THEN 1 ELSE 0 END) AS converted
       FROM enquiries e JOIN franchises fr ON fr.id = e.franchise_id JOIN brands b ON b.id = fr.brand_id
       WHERE ${f.sql} AND ${inMonths('e.entry_date')} GROUP BY fr.brand_id, e.entry_date`
    )
    .all(...f.params, ...months);
  for (const r of entered) {
    const i = index.get(keyOf(r.date));
    if (i == null) continue;
    const b = brand(r.id, r.name);
    b.enquiries[i] += r.n;
    b.test_drives[i] += r.td;
    b.total_converted += r.converted;
  }
  const sold = db
    .prepare(
      `SELECT fr.brand_id AS id, b.name, e.sold_date AS date, COUNT(*) AS n
       FROM enquiries e JOIN franchises fr ON fr.id = e.franchise_id JOIN brands b ON b.id = fr.brand_id
       WHERE ${f.sql} AND e.outcome = 'sold' AND ${inMonths('e.sold_date')} GROUP BY fr.brand_id, e.sold_date`
    )
    .all(...f.params, ...months);
  for (const r of sold) {
    const i = index.get(keyOf(r.date));
    if (i != null) brand(r.id, r.name).sold[i] += r.n;
  }

  const sum = (a) => a.reduce((x, y) => x + y, 0);
  const all = [...brands.values()].map((b) => ({ ...b, total_enquiries: sum(b.enquiries), total_test_drives: sum(b.test_drives), total_sold: sum(b.sold) }));
  const total = sum(all.map((b) => b.total_enquiries));
  for (const b of all) {
    b.share = pct(b.total_enquiries, total);
    b.conversion = pct(b.total_converted, b.total_enquiries);
  }
  all.sort((a, b) => b.total_enquiries - a.total_enquiries || b.total_sold - a.total_sold || a.name.localeCompare(b.name));
  return { granularity: daily ? 'day' : 'month', months, buckets, today, total_enquiries: total, brands: all };
}

// ---------- Daily summary (managers) ----------
// Today's numbers for the brands and sites the manager looks after, split by site for the
// general manager (when there is more than one) or by salesperson for a sales manager.
function daily(db, user) {
  const timeZone = getSetting(db, 'timezone', 'Australia/Brisbane');
  const today = localDate(new Date(), timeZone);
  const f = filters(db, user, {});
  const bySite = scope.hasFullAccess(user) && db.prepare('SELECT COUNT(*) AS n FROM locations WHERE active = 1').get().n > 1;
  const groupCol = bySite ? 'fr.location_id' : 'e.salesperson_id';
  const groupName = bySite ? '(SELECT name FROM locations WHERE id = fr.location_id)' : '(SELECT name FROM users WHERE id = e.salesperson_id)';

  const rows = new Map();
  const row = (key, label) => {
    if (!rows.has(key)) rows.set(key, { key, label, walk_ins: 0, test_drives: 0, sold: 0, lost: 0, followups: 0, overdue: 0 });
    return rows.get(key);
  };
  const base = `FROM enquiries e JOIN franchises fr ON fr.id = e.franchise_id WHERE ${f.sql}`;
  for (const r of db.prepare(`SELECT ${groupCol} AS k, ${groupName} AS label, COUNT(*) AS n, SUM(CASE WHEN e.test_drive = 1 THEN 1 ELSE 0 END) AS td ${base} AND e.entry_date = ? GROUP BY k`).all(...f.params, today)) {
    Object.assign(row(r.k, r.label), { walk_ins: r.n, test_drives: r.td });
  }
  for (const r of db.prepare(`SELECT ${groupCol} AS k, ${groupName} AS label, COUNT(*) AS n ${base} AND e.outcome = 'sold' AND e.sold_date = ? GROUP BY k`).all(...f.params, today)) row(r.k, r.label).sold = r.n;
  // Lost: closed today (local time) as lost.
  const since = new Date(Date.now() - 2 * 86400e3).toISOString();
  for (const r of db.prepare(`SELECT ${groupCol} AS k, ${groupName} AS label, e.closed_at ${base} AND e.outcome = 'lost' AND e.closed_at >= ?`).all(...f.params, since)) {
    if (localDate(new Date(r.closed_at), timeZone) === today) row(r.k, r.label).lost++;
  }
  const fuGroup = bySite ? 'fr.location_id' : 'a.user_id';
  const fuName = bySite ? '(SELECT name FROM locations WHERE id = fr.location_id)' : '(SELECT name FROM users WHERE id = a.user_id)';
  let onTime = 0;
  for (const r of db
    .prepare(
      `SELECT ${fuGroup} AS k, ${fuName} AS label, COUNT(*) AS n, SUM(CASE WHEN a.local_date <= a.followup_due THEN 1 ELSE 0 END) AS on_time
       FROM activities a JOIN enquiries e ON e.id = a.enquiry_id JOIN franchises fr ON fr.id = e.franchise_id
       WHERE ${f.sql} AND a.followup_due IS NOT NULL AND a.local_date = ? GROUP BY k`
    )
    .all(...f.params, today)) {
    row(r.k, r.label).followups = r.n;
    onTime += r.on_time || 0;
  }
  for (const r of db.prepare(`SELECT ${groupCol} AS k, ${groupName} AS label, COUNT(*) AS n ${base} AND e.outcome = 'open' AND e.pending_outcome IS NULL AND e.next_followup_at < ? GROUP BY k`).all(...f.params, today)) {
    row(r.k, r.label).overdue = r.n;
  }
  const counts = db
    .prepare(
      `SELECT SUM(CASE WHEN e.pending_outcome IS NOT NULL THEN 1 ELSE 0 END) AS awaiting,
              SUM(CASE WHEN e.outcome = 'open' AND e.pending_outcome IS NULL AND e.next_followup_at = ? THEN 1 ELSE 0 END) AS due_today
       ${base}`
    )
    .get(today, ...f.params);

  // Everyone (or every site) shows, so a quiet day stands out.
  if (bySite) {
    for (const l of db.prepare('SELECT id, name FROM locations WHERE active = 1').all()) row(l.id, l.name);
  } else {
    const ids = scope.franchiseIds(db, user);
    const team = ids === null
      ? db.prepare("SELECT id, name FROM users WHERE active = 1 AND role = 'salesperson'").all()
      : ids.length
        ? db.prepare(`SELECT DISTINCT u.id, u.name FROM users u JOIN user_franchises uf ON uf.user_id = u.id WHERE u.active = 1 AND u.role = 'salesperson' AND uf.franchise_id IN (${ids.map(() => '?').join(', ')})`).all(...ids)
        : [];
    for (const u of team) row(u.id, u.name);
  }
  const list = [...rows.values()].sort((a, b) => b.sold - a.sold || b.walk_ins - a.walk_ins || b.overdue - a.overdue || String(a.label).localeCompare(String(b.label)));
  const total = (k) => list.reduce((n, r) => n + r[k], 0);
  return {
    date: today,
    group: bySite ? 'site' : 'salesperson',
    totals: {
      walk_ins: total('walk_ins'),
      test_drives: total('test_drives'),
      sold: total('sold'),
      lost: total('lost'),
      followups: total('followups'),
      followups_on_time: onTime,
      overdue: total('overdue'),
      due_today: counts.due_today || 0,
      awaiting_approval: counts.awaiting || 0,
    },
    rows: list,
  };
}

// ---------- Sales board (general manager) ----------
// Every car sold today with who sold it, plus leaderboards for today and the month.
function salesBoard(db, user, opts = {}) {
  const timeZone = getSetting(db, 'timezone', 'Australia/Brisbane');
  const today = localDate(new Date(), timeZone);
  const month = today.slice(0, 7);
  const f = filters(db, user, { location_id: opts.location_id });

  const sales = db
    .prepare(
      `SELECT e.id, e.sold_at, e.sold_date, e.customer_name, e.stock_number, e.test_drive, e.trade_in, e.finance,
              e.salesperson_id, sp.name AS salesperson, l.name AS location, b.name AS brand,
              COALESCE(m.name, CASE WHEN e.used_make_id IS NOT NULL THEN um.name || ' ' || COALESCE(ulm.name, uxm.name, e.used_model_other, '') END, 'Model not recorded') AS vehicle,
              (SELECT u.name FROM activities a JOIN users u ON u.id = a.user_id WHERE a.enquiry_id = e.id AND a.type = 'approved' ORDER BY a.id DESC LIMIT 1) AS approved_by
       FROM enquiries e
       JOIN franchises fr ON fr.id = e.franchise_id JOIN locations l ON l.id = fr.location_id JOIN brands b ON b.id = fr.brand_id
       JOIN users sp ON sp.id = e.salesperson_id
       LEFT JOIN models m ON m.id = e.model_id LEFT JOIN used_makes um ON um.id = e.used_make_id
       LEFT JOIN models ulm ON ulm.id = e.used_model_id LEFT JOIN used_models uxm ON uxm.id = e.used_extra_model_id
       WHERE ${f.sql} AND e.outcome = 'sold' AND substr(e.sold_date, 1, 7) = ?
       ORDER BY e.sold_at DESC, e.id DESC`
    )
    .all(...f.params, month)
    .map((r) => ({ ...r, vehicle: r.vehicle.trim(), test_drive: r.test_drive === 1, trade_in: r.trade_in === 1, finance: r.finance === 1 }));

  const entered = db
    .prepare(
      `SELECT e.salesperson_id AS id, sp.name, COUNT(*) AS enquiries,
              SUM(CASE WHEN e.entry_date = ? THEN 1 ELSE 0 END) AS walk_ins_today,
              SUM(CASE WHEN e.test_drive = 1 THEN 1 ELSE 0 END) AS test_drives,
              SUM(CASE WHEN e.outcome = 'sold' THEN 1 ELSE 0 END) AS converted
       FROM enquiries e JOIN franchises fr ON fr.id = e.franchise_id JOIN users sp ON sp.id = e.salesperson_id
       WHERE ${f.sql} AND e.entry_month = ? GROUP BY e.salesperson_id`
    )
    .all(today, ...f.params, month);

  // One row per salesperson who sold or took enquiries this month.
  const people = new Map();
  const person = (id, name) => {
    if (!people.has(id)) people.set(id, { id, name, sold_today: 0, sold_month: 0, walk_ins_today: 0, enquiries: 0, test_drives: 0, converted: 0, brands: {} });
    return people.get(id);
  };
  for (const r of entered) Object.assign(person(r.id, r.name), { enquiries: r.enquiries, walk_ins_today: r.walk_ins_today, test_drives: r.test_drives, converted: r.converted });
  for (const s of sales) {
    const p = person(s.salesperson_id, s.salesperson);
    p.sold_month++;
    if (s.sold_date === today) p.sold_today++;
    p.brands[s.brand] = (p.brands[s.brand] || 0) + 1;
  }
  const site = new Map(db.prepare('SELECT id, home_location_id AS loc, (SELECT name FROM locations WHERE id = home_location_id) AS location FROM users').all().map((u) => [u.id, u.location]));
  const all = [...people.values()].map((p) => ({ ...p, location: site.get(p.id) || null, conversion: pct(p.converted, p.enquiries), top_brand: Object.entries(p.brands).sort((a, b) => b[1] - a[1])[0]?.[0] || null }));
  for (const p of all) delete p.brands;
  const rank = (key) => (a, b) => b[key] - a[key] || b.converted - a.converted || b.enquiries - a.enquiries || a.name.localeCompare(b.name);
  const brandsMonth = new Map();
  for (const s of sales) brandsMonth.set(s.brand, (brandsMonth.get(s.brand) || 0) + 1);

  return {
    date: today,
    month,
    today: sales.filter((s) => s.sold_date === today),
    totals: { sold_today: sales.filter((s) => s.sold_date === today).length, sold_month: sales.length, enquiries_month: all.reduce((n, p) => n + p.enquiries, 0) },
    leaders_today: all.filter((p) => p.sold_today || p.walk_ins_today).sort(rank('sold_today')),
    leaders_month: all.filter((p) => p.sold_month || p.enquiries).sort(rank('sold_month')),
    brands_month: [...brandsMonth].map(([brand, sold]) => ({ brand, sold })).sort((a, b) => b.sold - a.sold || a.brand.localeCompare(b.brand)),
  };
}

// ---------- Morning meeting (managers) ----------
// Everything to talk about first thing: yesterday's results, the month so far, a ranked hit
// list of the hottest open enquiries, each salesperson's day, and today's follow-ups.
function meeting(db, user, opts = {}) {
  const timeZone = getSetting(db, 'timezone', 'Australia/Brisbane');
  const today = localDate(new Date(), timeZone);
  const f = filters(db, user, { location_id: opts.location_id });
  const isGm = scope.hasFullAccess(user);
  // "Yesterday" is the last day anything happened (up to 3 days back), so a Monday meeting
  // shows Saturday if the yard was shut on Sunday.
  let yesterday = addDays(today, -1);
  for (let back = 1; back <= 3; back++) {
    const d = addDays(today, -back);
    const n = db.prepare(`SELECT COUNT(*) AS n FROM enquiries e JOIN franchises fr ON fr.id = e.franchise_id WHERE ${f.sql} AND (e.entry_date = ? OR e.sold_date = ?)`).get(...f.params, d, d).n;
    if (n) { yesterday = d; break; }
  }
  const escalationDays = Number(getSetting(db, 'followup.escalation_days', '3')) || 3;

  // Yesterday
  const y = db.prepare(`${ROWS} WHERE ${f.sql} AND e.entry_date = ?`).all(...f.params, yesterday);
  const soldRows = (from, to) =>
    db.prepare(`${ROWS} WHERE ${f.sql} AND e.outcome = 'sold' AND e.sold_date BETWEEN ? AND ? ORDER BY e.sold_at`).all(...f.params, from, to);
  const soldYesterday = soldRows(yesterday, yesterday);
  const since = new Date(Date.now() - 3 * 86400e3).toISOString();
  const lostYesterday = db
    .prepare(`${ROWS} WHERE ${f.sql} AND e.outcome = 'lost' AND e.closed_at >= ?`)
    .all(...f.params, since)
    .filter((r) => r.closed_at && localDate(new Date(r.closed_at), timeZone) === yesterday);

  // Month so far, and the same point last month
  const month = summary(db, user, { period: 'month', date: today, location_id: opts.location_id });

  // Open enquiries, scored for the hit list
  const open = db
    .prepare(`${ROWS} WHERE ${f.sql} AND e.outcome = 'open' AND e.pending_outcome IS NULL ORDER BY e.next_followup_at`)
    .all(...f.params);
  const daysAgo = (d) => Math.round((Date.parse(today) - Date.parse(d)) / 86400e3);
  const scored = open.map((r) => {
    const reasons = [];
    let score = 0;
    if (r.test_drive === 1) { score += 3; reasons.push('Test drive'); }
    if (r.finance === 1) { score += 1; reasons.push('Finance'); }
    if (r.trade_in === 1) { score += 1; reasons.push('Trade-in'); }
    const age = daysAgo(r.entry_date);
    if (age <= 7) { score += 2; reasons.push(age === 0 ? 'New today' : 'New this week'); }
    else if (age > 45) score -= 2;
    if (r.next_followup_at === today) { score += 2; reasons.push('Due today'); }
    else if (r.next_followup_at && r.next_followup_at < today) { score += 1; reasons.push(`${daysAgo(r.next_followup_at)} days late`); }
    return { r, score, reasons };
  });
  const hit = scored.filter((x) => x.score >= 4).sort((a, b) => b.score - a.score || String(a.r.next_followup_at).localeCompare(String(b.r.next_followup_at))).slice(0, 10);
  const lastNote = db.prepare("SELECT body, local_date FROM activities WHERE enquiry_id = ? AND body IS NOT NULL AND body <> '' AND type IN ('comment', 'call', 'email', 'sms', 'followup_done', 'created') ORDER BY id DESC LIMIT 1");
  const slimHit = (x) => {
    const n = lastNote.get(x.r.id);
    return { ...slim(x.r), trade_in: x.r.trade_in === 1, finance: x.r.finance === 1, reasons: x.reasons, score: x.score, last_note: n ? n.body.slice(0, 160) : null, last_note_date: n ? n.local_date : null };
  };

  // Round the room: one row per salesperson in scope
  const people = new Map();
  const ids = scope.franchiseIds(db, user);
  const team = ids === null
    ? db.prepare("SELECT id, name, home_location_id FROM users WHERE active = 1 AND role = 'salesperson'").all()
    : ids.length
      ? db.prepare(`SELECT DISTINCT u.id, u.name, u.home_location_id FROM users u JOIN user_franchises uf ON uf.user_id = u.id WHERE u.active = 1 AND u.role = 'salesperson' AND uf.franchise_id IN (${ids.map(() => '?').join(', ')})`).all(...ids)
      : [];
  const locName = new Map(db.prepare('SELECT id, name FROM locations').all().map((l) => [l.id, l.name]));
  for (const u of team) {
    if (opts.location_id && u.home_location_id && u.home_location_id !== Number(opts.location_id)) continue;
    people.set(u.id, { id: u.id, name: u.name, location: locName.get(u.home_location_id) || null, due_today: 0, late: 0, hot: 0, walk_ins_yesterday: 0, sold_month: 0, open: 0 });
  }
  const person = (r) => people.get(r.salesperson_id) || (people.set(r.salesperson_id, { id: r.salesperson_id, name: r.salesperson, location: r.location, due_today: 0, late: 0, hot: 0, walk_ins_yesterday: 0, sold_month: 0, open: 0 }), people.get(r.salesperson_id));
  for (const x of scored) {
    const p = person(x.r);
    p.open++;
    if (x.r.next_followup_at && x.r.next_followup_at <= today) p.due_today++;
    if (x.r.next_followup_at && x.r.next_followup_at <= addDays(today, -escalationDays)) p.late++;
    if (x.score >= 4) p.hot++;
  }
  for (const r of y) person(r).walk_ins_yesterday++;
  for (const r of soldRows(`${today.slice(0, 7)}-01`, today)) person(r).sold_month++;

  // Today's follow-ups, by salesperson
  const dueToday = scored.filter((x) => x.r.next_followup_at && x.r.next_followup_at <= today);
  const byPerson = new Map();
  for (const x of dueToday) {
    if (!byPerson.has(x.r.salesperson_id)) byPerson.set(x.r.salesperson_id, { id: x.r.salesperson_id, name: x.r.salesperson, items: [] });
    byPerson.get(x.r.salesperson_id).items.push({ ...slim(x.r), hot: x.score >= 4 });
  }

  const approvals = db.prepare(`SELECT COUNT(*) AS n FROM enquiries e JOIN franchises fr ON fr.id = e.franchise_id WHERE ${f.sql} AND e.pending_outcome IS NOT NULL`).get(...f.params).n;
  const lostOut = lostYesterday.map((r) => ({ ...slim(r), lost_reason: r.lost_reason || 'Not recorded' }));

  return {
    date: today,
    yesterday: {
      date: yesterday,
      walk_ins: y.length,
      test_drives: y.filter((r) => r.test_drive === 1).length,
      sold: soldYesterday.map(slim),
      lost: lostOut,
    },
    month: {
      enquiries: month.totals.enquiries,
      sold: month.totals.cars_sold,
      conversion: month.totals.conversion,
      sold_last_month_same_point: month.previous.cars_sold,
    },
    approvals,
    hit_list: hit.map(slimHit),
    people: [...people.values()].map((p) => (isGm ? { ...p, late: undefined } : p)).sort((a, b) => b.hot - a.hot || b.due_today - a.due_today || a.name.localeCompare(b.name)),
    show_late: !isGm,
    due_today: [...byPerson.values()].sort((a, b) => b.items.length - a.items.length || a.name.localeCompare(b.name)),
    due_today_total: dueToday.length,
  };
}

module.exports = { summary, periodRange, trends, daily, salesBoard, meeting };
