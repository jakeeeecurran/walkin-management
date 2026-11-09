// Trial version: answers the app's API calls in the browser from demo data, so the real
// screens can be tried without a server. Changes are kept in this browser only.
(function () {
  const CRM = window.CRM;
  const SEED = window.DEMO_DATA;
  const PASSWORD = 'demo-password-123';
  const STORE = 'sunco-crm-demo-v4';
  const TZ = 'Australia/Brisbane';

  // ---------- Dates ----------
  const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const addDays = (iso, n) => {
    const d = new Date(iso + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const nowIso = () => new Date().toISOString();
  const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400e3);

  // Demo data was made on SEED.today; move every date forward so it always looks current.
  function shiftDates(data) {
    const delta = daysBetween(data.today, today());
    if (!delta) return data;
    const d = (v) => (v ? addDays(v.slice(0, 10), delta) + v.slice(10) : v);
    for (const e of data.enquiries) {
      e.entry_date = d(e.entry_date);
      e.entry_month = e.entry_date.slice(0, 7);
      e.next_followup_at = d(e.next_followup_at);
      e.sold_date = d(e.sold_date);
      e.sold_at = d(e.sold_at);
      e.closed_at = d(e.closed_at);
      e.created_at = d(e.created_at);
      e.updated_at = d(e.updated_at);
    }
    for (const a of data.activities) {
      a.created_at = d(a.created_at);
      a.local_date = d(a.local_date);
      a.followup_due = d(a.followup_due);
    }
    data.today = today();
    return data;
  }

  // ---------- State ----------
  let db;
  function fresh() {
    const data = shiftDates(JSON.parse(JSON.stringify(SEED)));
    data.passwords = Object.fromEntries(data.users.map((u) => [u.id, PASSWORD]));
    data.audit = [];
    data.backups = [{ name: `sunco-crm-${today()}-020000-nightly.db`, date: today(), time: '02:00', kind: 'nightly', size: 228000 }];
    data.session = null;
    return data;
  }
  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE) || 'null');
      if (saved && saved.version === 1) return shiftDates(saved.db);
    } catch {
      /* storage unavailable */
    }
    return fresh();
  }
  function save() {
    try {
      localStorage.setItem(STORE, JSON.stringify({ version: 1, db }));
    } catch {
      /* storage unavailable: changes last until the page is closed */
    }
  }
  db = load();
  CRM.resetDemo = () => {
    db = fresh();
    save();
    location.reload();
  };

  const nextId = (list) => list.reduce((m, x) => Math.max(m, x.id), 0) + 1;
  const byId = (list, id) => list.find((x) => x.id === Number(id));
  const clone = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
  const fail = (status, message, field) => {
    throw Object.assign(new Error(message), { status, field });
  };
  const bad = (field, message) => fail(400, message, field);
  const audit = (userId, action, entity, entityId, after) => db.audit.unshift({ id: db.audit.length + 1, user_id: userId, action, entity, entity_id: entityId ?? null, before_json: null, after_json: after ? JSON.stringify(after) : null, created_at: nowIso() });
  const setting = (k, d) => db.settings[k] ?? d;

  // ---------- Validation (same rules as the server) ----------
  const v = {
    text(x, field, { required, max = 200 } = {}) {
      const s = x == null ? '' : String(x).replace(/\s+/g, ' ').trim();
      if (!s) {
        if (required) bad(field, `${label(field)} is required`);
        return null;
      }
      if (s.length > max) bad(field, `${label(field)} must be ${max} characters or fewer`);
      return s;
    },
    personName(x) {
      const s = v.text(x, 'customer_name', { required: true, max: 100 });
      if (s !== s.toLowerCase() && s !== s.toUpperCase()) return s;
      return s.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase());
    },
    postcode(x) {
      const s = (v.text(x, 'postcode', { required: true, max: 10 }) || '').replace(/\s/g, '');
      if (!/^\d{4}$/.test(s)) bad('postcode', 'Postcode must be 4 digits');
      const n = Number(s);
      if (n < 200 || (n >= 300 && n < 800)) bad('postcode', 'That is not a valid Australian postcode');
      return s;
    },
    phone(x) {
      const s = v.text(x, 'phone', { max: 30 });
      if (!s) return null;
      let d = s.replace(/[\s()-.]/g, '');
      if (d.startsWith('+61')) d = '0' + d.slice(3);
      else if (d.startsWith('61') && d.length === 11) d = '0' + d.slice(2);
      if (/^0[23478]\d{8}$/.test(d)) return d;
      bad('phone', 'Enter an Australian mobile (04xx xxx xxx) or landline with area code (07 xxxx xxxx)');
    },
    email(x, field = 'email') {
      const s = v.text(x, field, { max: 254 });
      if (!s) return null;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.toLowerCase())) bad(field, 'Enter a valid email address');
      return s.toLowerCase();
    },
    stock(x) {
      const s = v.text(x, 'stock_number', { max: 20 });
      if (!s) return null;
      const u = s.toUpperCase().replace(/\s/g, '');
      if (!/^[A-Z0-9-/]+$/.test(u)) bad('stock_number', 'Stock number can only contain letters, numbers, - and /');
      return u;
    },
    date(x, field, required) {
      if (!x) {
        if (required) bad(field, `${label(field)} is required`);
        return null;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(x))) bad(field, `${label(field)} must be a valid date`);
      return String(x);
    },
    bool: (x) => (x === true || x === 1 || x === '1' || x === 'true' ? 1 : 0),
  };
  function label(f) {
    return f.replace(/_id$/, '').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
  }
  const formatPhone = (d) => (!d ? d : /^04\d{8}$/.test(d) ? `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}` : `${d.slice(0, 2)} ${d.slice(2, 6)} ${d.slice(6)}`);

  // Forgiving name match, as on the server.
  const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  function distance(a, b) {
    const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) dp[0][j] = j;
    for (let i = 1; i <= a.length; i++)
      for (let j = 1; j <= b.length; j++) {
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1);
      }
    return dp[a.length][b.length];
  }
  function fuzzyFind(list, raw, prefix = true) {
    const t = norm(raw);
    if (!t) return null;
    let best = null;
    let score = Infinity;
    for (const item of list) {
      const n = norm(item.name);
      if (n === t) return item;
      const sc = prefix && t.length >= 3 && (n.startsWith(t) || t.startsWith(n)) ? 1 : distance(n, t);
      if (sc < score) {
        score = sc;
        best = item;
      }
    }
    return score <= (t.length <= 3 ? 1 : Math.max(1, Math.floor(t.length / 3))) ? best : null;
  }
  function tidyName(raw) {
    const s = String(raw ?? '').replace(/\s+/g, ' ').trim();
    if (!s || s !== s.toLowerCase()) return s;
    return s.split(' ').map((w) => (/^[a-z]+$/.test(w) ? w[0].toUpperCase() + w.slice(1) : /^[a-z]{2,}[-\d]/.test(w) ? w.toUpperCase() : w)).join(' ');
  }

  // ---------- Who can see what (same rules as the server) ----------
  const full = (u) => u.role === 'general_manager' || u.is_admin === 1;
  const isManager = (u) => full(u) || u.role === 'sales_manager';
  const userFranchises = (u) => db.user_franchises.filter((x) => x.user_id === u.id).map((x) => x.franchise_id);
  const hasFranchise = (u, fid) => full(u) || userFranchises(u).includes(fid);
  const canView = (u, e) => full(u) || (hasFranchise(u, e.franchise_id) && (u.role !== 'salesperson' || e.salesperson_id === u.id));
  const canAssignTo = (actor, fid, targetId) => {
    const t = byId(db.users, targetId);
    if (!t || !t.active) return false;
    if (actor.role === 'salesperson') return t.id === actor.id;
    return hasFranchise(actor, fid) && hasFranchise(t, fid);
  };
  const canManageUser = (actor, t) => {
    if (full(actor)) return t.is_admin !== 1 || actor.is_admin === 1;
    if (actor.role !== 'sales_manager' || t.role !== 'salesperson') return false;
    const mine = userFranchises(actor);
    return userFranchises(t).some((f) => mine.includes(f));
  };
  const assignableRoles = (u) => (full(u) ? ['salesperson', 'sales_manager', 'general_manager'] : u.role === 'sales_manager' ? ['salesperson'] : []);

  // ---------- Shaping records ----------
  function franchiseInfo(fid) {
    const f = byId(db.franchises, fid);
    return { f, l: byId(db.locations, f.location_id), b: byId(db.brands, f.brand_id) };
  }
  function present(e, user) {
    const { f, l, b } = franchiseInfo(e.franchise_id);
    const make = e.used_make_id ? byId(db.used_makes, e.used_make_id) : null;
    const usedModel = e.used_model_id ? byId(db.models, e.used_model_id)?.name : e.used_extra_model_id ? byId(db.used_models, e.used_extra_model_id)?.name : e.used_model_other;
    const model = e.model_id ? byId(db.models, e.model_id)?.name : null;
    const out = {
      ...e,
      location_id: f.location_id,
      location: l.name,
      brand_id: f.brand_id,
      brand: b.name,
      brand_is_used: b.is_used === 1,
      brand_colour: b.colour,
      model,
      used_make: make?.name ?? null,
      used_model: usedModel ?? null,
      salesperson: byId(db.users, e.salesperson_id)?.name,
      created_by_name: byId(db.users, e.created_by)?.name,
      source: e.source_id ? byId(db.lookup_values, e.source_id)?.label : null,
      lost_reason: e.lost_reason_id ? byId(db.lookup_values, e.lost_reason_id)?.label : null,
      pending_outcome: e.pending_outcome || null,
      pending_lost_reason: e.pending_lost_reason_id ? byId(db.lookup_values, e.pending_lost_reason_id)?.label : null,
      pending_by_name: e.pending_by ? byId(db.users, e.pending_by)?.name : null,
      can_approve: !!e.pending_outcome && isManager(user) && hasFranchise(user, e.franchise_id),
      phone_display: formatPhone(e.phone),
      vehicle: b.is_used ? [make?.name, usedModel].filter(Boolean).join(' ') || null : model,
      overdue: e.outcome === 'open' && e.next_followup_at && e.next_followup_at < today(),
      can_edit: canView(user, e),
      test_drive: e.test_drive === 1,
      trade_in: e.trade_in === 1,
      finance: e.finance === 1,
      is_invalid: e.is_invalid === 1,
    };
    return out;
  }
  function publicUser(u) {
    return {
      id: u.id,
      name: u.name,
      username: u.username,
      email: u.email,
      role: u.role,
      is_admin: u.is_admin === 1,
      home_location_id: u.home_location_id,
      active: u.active === 1,
      must_change_password: u.must_change_password === 1,
      notify_email: u.notify_email !== 0,
      full_access: full(u),
      last_login_at: u.last_login_at,
      franchises: userFranchises(u)
        .map((fid) => {
          const { f, l, b } = franchiseInfo(fid);
          return { id: f.id, location_id: l.id, location: l.name, brand_id: b.id, brand: b.name, _s: l.sort_order * 100 + b.sort_order };
        })
        .sort((a, b) => a._s - b._s),
    };
  }
  const addActivity = (eid, uid, type, body, due) =>
    db.activities.push({ id: nextId(db.activities), enquiry_id: eid, user_id: uid, type, body: body ?? null, followup_due: due ?? null, local_date: today(), created_at: nowIso() });

  // ---------- Enquiry save (same rules as the server) ----------
  function build(user, input, existing) {
    const has = (k) => Object.prototype.hasOwnProperty.call(input, k);
    const pick = (k, d) => (has(k) ? input[k] : d);
    const isNew = !existing;
    const manager = isManager(user);
    const rec = {};
    const locationId = Number(pick('location_id', existing?.location_id));
    const brandId = Number(pick('brand_id', existing?.brand_id));
    if (!brandId) bad('brand_id', 'Brand is required');
    const f = db.franchises.find((x) => x.location_id === locationId && x.brand_id === brandId);
    if (!f) bad('brand_id', 'That brand is not sold at that location');
    const brand = byId(db.brands, brandId);
    const changedF = isNew || f.id !== existing.franchise_id;
    if (changedF) {
      if (!hasFranchise(user, f.id)) bad('brand_id', 'You are not assigned to that brand at that location');
      if (!(f.active && brand.active && byId(db.locations, locationId).active)) bad('brand_id', 'That brand is no longer active at that location');
    }
    rec.franchise_id = f.id;
    const spId = Number(pick('salesperson_id', existing?.salesperson_id ?? user.id)) || user.id;
    if (isNew || spId !== existing.salesperson_id || changedF) {
      if (!manager && spId !== user.id) fail(403, 'Only managers can assign enquiries to someone else');
      if (!canAssignTo(user, f.id, spId)) bad('salesperson_id', 'That person is not assigned to this brand at this site');
    }
    rec.salesperson_id = spId;
    rec.customer_name = v.personName(pick('customer_name', existing?.customer_name));
    rec.postcode = v.postcode(pick('postcode', existing?.postcode));
    rec.phone = v.phone(pick('phone', existing?.phone));
    rec.email = v.email(pick('email', existing?.email));
    if (!rec.phone && !rec.email) bad('phone', 'Enter a phone number or an email address');
    rec.model_id = rec.used_make_id = rec.used_model_id = rec.used_extra_model_id = rec.used_model_other = rec.stock_number = null;
    if (brand.is_used) {
      const makeText = v.text(pick('used_make', existing?.used_make), 'used_make_id', { required: true, max: 40 });
      let make = fuzzyFind(db.used_makes, makeText);
      if (!make) {
        make = { id: nextId(db.used_makes), name: tidyName(makeText), brand_id: null, sort_order: 0, active: 1 };
        db.used_makes.push(make);
      }
      rec.used_make_id = make.id;
      const modelText = v.text(pick('used_model', existing?.used_model), 'used_model_id', { required: true, max: 60 });
      const linked = make.brand_id ? fuzzyFind(db.models.filter((m) => m.brand_id === make.brand_id), modelText, false) : null;
      if (linked) rec.used_model_id = linked.id;
      else {
        let extra = fuzzyFind(db.used_models.filter((m) => m.make_id === make.id), modelText, false);
        if (!extra) {
          extra = { id: nextId(db.used_models), make_id: make.id, name: tidyName(modelText), active: 1 };
          db.used_models.push(extra);
        }
        rec.used_extra_model_id = extra.id;
      }
      rec.stock_number = v.stock(pick('stock_number', existing?.stock_number));
    } else {
      const mid = Number(pick('model_id', existing?.model_id));
      const m = byId(db.models, mid);
      if (!m || m.brand_id !== brandId || (!m.active && !(existing && existing.model_id === mid))) bad('model_id', 'Choose a model from the list for that brand');
      rec.model_id = mid;
    }
    let src = pick('source_id', existing?.source_id);
    if (src == null && isNew) src = db.lookup_values.find((x) => x.list_type === 'source' && x.active)?.id;
    rec.source_id = src ? Number(src) : null;
    for (const k of ['test_drive', 'trade_in', 'finance']) rec[k] = v.bool(pick(k, existing?.[k] ?? 0));
    let outcome = pick('outcome', existing?.outcome ?? 'open');
    if (!['open', 'sold', 'lost'].includes(outcome)) bad('outcome', 'Outcome must be open, sold or lost');
    let request = null;
    if (!manager && outcome !== 'open' && (isNew || existing.outcome === 'open')) {
      request = { outcome, lost_reason_id: null };
      if (outcome === 'lost') {
        const r = Number(pick('lost_reason_id', null));
        if (!r) bad('lost_reason_id', 'Lost reason is required');
        request.lost_reason_id = r;
      }
      outcome = 'open';
    }
    if (!isNew && outcome !== existing.outcome && existing.outcome !== 'open' && !manager) fail(403, 'Only a manager can re-open or change a sold or lost enquiry');
    Object.assign(rec, { outcome, lost_reason_id: null, next_followup_at: null, sold_at: null, sold_date: null, closed_at: null });
    if (outcome === 'open') {
      let fu = v.date(pick('next_followup_at', existing?.next_followup_at), 'next_followup_at');
      if (!fu && isNew) fu = addDays(today(), 1);
      if (!fu) bad('next_followup_at', 'Set the next follow-up date');
      if (fu < today() && (isNew || fu !== existing.next_followup_at)) bad('next_followup_at', 'Next follow-up cannot be in the past');
      rec.next_followup_at = fu;
    } else {
      rec.closed_at = !isNew && existing.outcome === outcome ? existing.closed_at : nowIso();
      if (outcome === 'sold') {
        const keep = !isNew && existing.outcome === 'sold';
        rec.sold_at = keep ? existing.sold_at : nowIso();
        rec.sold_date = keep ? existing.sold_date : today();
      } else {
        const r = Number(pick('lost_reason_id', existing?.lost_reason_id));
        if (!r) bad('lost_reason_id', 'Lost reason is required');
        rec.lost_reason_id = r;
      }
    }
    let ed = isNew ? today() : existing.entry_date;
    if (has('entry_date') && input.entry_date && input.entry_date !== ed) {
      if (!manager) fail(403, 'Only managers can change the date of entry');
      ed = v.date(input.entry_date, 'entry_date', true);
      if (ed > today()) bad('entry_date', 'Date of entry cannot be in the future');
    }
    rec.entry_date = ed;
    rec.entry_month = ed.slice(0, 7);
    if (request) Object.defineProperty(rec, 'approvalRequest', { value: request, enumerable: false });
    return rec;
  }

  function saveRequest(e, user, request, note) {
    Object.assign(e, { pending_outcome: request.outcome, pending_lost_reason_id: request.lost_reason_id, pending_note: note || null, pending_by: user.id, pending_at: nowIso(), pending_date: today() });
    const reason = request.lost_reason_id ? byId(db.lookup_values, request.lost_reason_id)?.label : null;
    addActivity(e.id, user.id, 'approval_requested', `${request.outcome === 'sold' ? 'Marked as sold' : `Marked as lost (${reason})`}. Waiting for sales manager approval.${note ? ` Note: ${note}` : ''}`);
  }
  const clearRequest = (e) => Object.assign(e, { pending_outcome: null, pending_lost_reason_id: null, pending_note: null, pending_by: null, pending_at: null, pending_date: null });

  // ---------- Reports (same maths as the server) ----------
  const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : null);
  function lastDay(ym) {
    const [y, m] = ym.split('-').map(Number);
    return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  }
  function periodRange(period, ref, from, to) {
    if (period === 'range') {
      if (!from || !to || from > to) bad('from', 'Choose a valid date range');
      const days = daysBetween(from, to) + 1;
      return { from, to, prev: { from: addDays(from, -days), to: addDays(from, -1) } };
    }
    if (period === 'day') return { from: ref, to: ref, prev: { from: addDays(ref, -1), to: addDays(ref, -1) } };
    if (period === 'year') {
      const y = ref.slice(0, 4);
      return { from: `${y}-01-01`, to: ref, prev: { from: `${y - 1}-01-01`, to: `${y - 1}${ref.slice(4)}` } };
    }
    const m = ref.slice(0, 7);
    const to2 = ref < lastDay(m) ? ref : lastDay(m);
    const [yy, mm] = m.split('-').map(Number);
    const pm = mm === 1 ? `${yy - 1}-12` : `${yy}-${String(mm - 1).padStart(2, '0')}`;
    const pto = `${pm}-${String(Math.min(Number(to2.slice(8)), Number(lastDay(pm).slice(8)))).padStart(2, '0')}`;
    return { from: `${m}-01`, to: to2, prev: { from: `${pm}-01`, to: pto } };
  }
  function totals(rows) {
    const n = rows.length;
    const c = (fn) => rows.filter(fn).length;
    const sold = c((r) => r.outcome === 'sold');
    const lost = c((r) => r.outcome === 'lost');
    const td = rows.filter((r) => r.test_drive);
    const ntd = rows.filter((r) => !r.test_drive);
    return {
      enquiries: n, sold, lost, open: n - sold - lost, conversion: pct(sold, n),
      test_drives: td.length, test_drive_rate: pct(td.length, n),
      trade_ins: c((r) => r.trade_in), trade_in_rate: pct(c((r) => r.trade_in), n),
      finance: c((r) => r.finance), finance_rate: pct(c((r) => r.finance), n),
      conversion_with_test_drive: pct(td.filter((r) => r.outcome === 'sold').length, td.length),
      conversion_without_test_drive: pct(ntd.filter((r) => r.outcome === 'sold').length, ntd.length),
    };
  }
  function groupBy(rows, key, labelFn, limit) {
    const g = new Map();
    for (const r of rows) {
      const k = key(r);
      if (!g.has(k)) g.set(k, { key: k, label: labelFn(r), rows: [] });
      g.get(k).rows.push(r);
    }
    let out = [...g.values()].map((x) => {
      const t = totals(x.rows);
      return { key: x.key, label: x.label, enquiries: t.enquiries, sold: t.sold, lost: t.lost, open: t.open, test_drives: t.test_drives, conversion: t.conversion };
    });
    out.sort((a, b) => b.enquiries - a.enquiries || b.sold - a.sold || String(a.label).localeCompare(String(b.label)));
    return limit ? out.slice(0, limit) : out;
  }
  const localDay = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));

  // Same rules as the server: managers only; by site for the GM, by salesperson otherwise.
  function daily(user) {
    if (!isManager(user)) fail(403, 'Only managers can see the daily summary');
    const t = today();
    const bySite = full(user) && db.locations.filter((l) => l.active).length > 1;
    const scoped = db.enquiries.filter((e) => !e.is_invalid && canView(user, e)).map((e) => present(e, user));
    const rows = new Map();
    const row = (key, label) => {
      if (!rows.has(key)) rows.set(key, { key, label, walk_ins: 0, test_drives: 0, sold: 0, lost: 0, followups: 0, overdue: 0 });
      return rows.get(key);
    };
    if (bySite) for (const l of db.locations.filter((x) => x.active)) row(l.id, l.name);
    else {
      const mine = full(user) ? null : new Set(db.user_franchises.filter((x) => x.user_id === user.id).map((x) => x.franchise_id));
      for (const u of db.users.filter((x) => x.active && x.role === 'salesperson' && (!mine || db.user_franchises.some((uf) => uf.user_id === x.id && mine.has(uf.franchise_id))))) row(u.id, u.name);
    }
    const keyOf = (e) => (bySite ? [e.location_id, e.location] : [e.salesperson_id, e.salesperson]);
    let onTime = 0;
    for (const e of scoped) {
      if (e.entry_date === t) { const r = row(...keyOf(e)); r.walk_ins++; if (e.test_drive) r.test_drives++; }
      if (e.outcome === 'sold' && e.sold_date === t) row(...keyOf(e)).sold++;
      if (e.outcome === 'lost' && e.closed_at && localDay(e.closed_at) === t) row(...keyOf(e)).lost++;
      if (e.outcome === 'open' && !e.pending_outcome && e.next_followup_at && e.next_followup_at < t) row(...keyOf(e)).overdue++;
    }
    const byId2 = new Map(scoped.map((e) => [e.id, e]));
    for (const a of db.activities.filter((x) => x.followup_due && x.local_date === t && byId2.has(x.enquiry_id))) {
      const e = byId2.get(a.enquiry_id);
      const r = bySite ? row(e.location_id, e.location) : row(a.user_id, byId(db.users, a.user_id)?.name);
      r.followups++;
      if (a.local_date <= a.followup_due) onTime++;
    }
    const list = [...rows.values()].sort((a, b) => b.sold - a.sold || b.walk_ins - a.walk_ins || b.overdue - a.overdue || String(a.label).localeCompare(String(b.label)));
    const total = (k) => list.reduce((n, r) => n + r[k], 0);
    return {
      date: t,
      group: bySite ? 'site' : 'salesperson',
      totals: {
        walk_ins: total('walk_ins'), test_drives: total('test_drives'), sold: total('sold'), lost: total('lost'), followups: total('followups'), followups_on_time: onTime, overdue: total('overdue'),
        due_today: scoped.filter((e) => e.outcome === 'open' && !e.pending_outcome && e.next_followup_at === t).length,
        awaiting_approval: scoped.filter((e) => e.pending_outcome).length,
      },
      rows: list,
    };
  }

  // Same rules as the server: GM/admin only.
  function salesBoard(user, q) {
    if (!full(user)) fail(403, 'Only the general manager can see the sales board');
    const t = today();
    const month = t.slice(0, 7);
    const scoped = db.enquiries.filter((e) => !e.is_invalid && canView(user, e)).map((e) => present(e, user)).filter((e) => !q.location_id || e.location_id === Number(q.location_id));
    const approver = (id) => {
      const a = db.activities.filter((x) => x.enquiry_id === id && x.type === 'approved').at(-1);
      return a ? byId(db.users, a.user_id)?.name : null;
    };
    const sales = scoped
      .filter((e) => e.outcome === 'sold' && e.sold_date && e.sold_date.slice(0, 7) === month)
      .sort((a, b) => String(b.sold_at).localeCompare(String(a.sold_at)) || b.id - a.id)
      .map((e) => ({ id: e.id, sold_at: e.sold_at, sold_date: e.sold_date, customer_name: e.customer_name, stock_number: e.stock_number, test_drive: e.test_drive, trade_in: e.trade_in, finance: e.finance, salesperson_id: e.salesperson_id, salesperson: e.salesperson, location: e.location, brand: e.brand, vehicle: e.vehicle || 'Model not recorded', approved_by: approver(e.id) }));
    const people = new Map();
    const person = (id, name) => {
      if (!people.has(id)) people.set(id, { id, name, sold_today: 0, sold_month: 0, walk_ins_today: 0, enquiries: 0, test_drives: 0, converted: 0, brands: {} });
      return people.get(id);
    };
    for (const e of scoped.filter((x) => x.entry_month === month)) {
      const p = person(e.salesperson_id, e.salesperson);
      p.enquiries++;
      if (e.entry_date === t) p.walk_ins_today++;
      if (e.test_drive) p.test_drives++;
      if (e.outcome === 'sold') p.converted++;
    }
    for (const sItem of sales) {
      const p = person(sItem.salesperson_id, sItem.salesperson);
      p.sold_month++;
      if (sItem.sold_date === t) p.sold_today++;
      p.brands[sItem.brand] = (p.brands[sItem.brand] || 0) + 1;
    }
    const all = [...people.values()].map((p) => {
      const u = byId(db.users, p.id);
      const out = { ...p, location: u?.home_location_id ? byId(db.locations, u.home_location_id)?.name : null, conversion: pct(p.converted, p.enquiries), top_brand: Object.entries(p.brands).sort((a, b) => b[1] - a[1])[0]?.[0] || null };
      delete out.brands;
      return out;
    });
    const rank = (key) => (a, b) => b[key] - a[key] || b.converted - a.converted || b.enquiries - a.enquiries || a.name.localeCompare(b.name);
    const brands = new Map();
    for (const sItem of sales) brands.set(sItem.brand, (brands.get(sItem.brand) || 0) + 1);
    const soldToday = sales.filter((x) => x.sold_date === t);
    return {
      date: t,
      month,
      today: soldToday,
      totals: { sold_today: soldToday.length, sold_month: sales.length, enquiries_month: all.reduce((n, p) => n + p.enquiries, 0) },
      leaders_today: all.filter((p) => p.sold_today || p.walk_ins_today).sort(rank('sold_today')),
      leaders_month: all.filter((p) => p.sold_month || p.enquiries).sort(rank('sold_month')),
      brands_month: [...brands].map(([brand, sold]) => ({ brand, sold })).sort((a, b) => b.sold - a.sold || a.brand.localeCompare(b.brand)),
    };
  }

  // Same rules as the server: GM/admin only; one month by day, several months by month.
  function trends(user, q) {
    if (!full(user)) fail(403, 'Only the general manager can see brand trends');
    const t = today();
    const asked = String(q.months || '').split(',').filter(Boolean);
    if (asked.length > 24 || asked.some((m) => !/^\d{4}-(0[1-9]|1[0-2])$/.test(m))) fail(400, 'Choose up to 24 months, as YYYY-MM');
    const months = [...new Set(asked.length ? asked : [t.slice(0, 7)])].filter((m) => m <= t.slice(0, 7)).sort();
    if (!months.length) fail(400, 'Choose a month that has started');
    const daily = months.length === 1;
    let buckets = months;
    if (daily) {
      const [y, m] = months[0].split('-').map(Number);
      const monthEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
      const end = months[0] === t.slice(0, 7) ? t : monthEnd;
      buckets = [];
      for (let d = `${months[0]}-01`; d <= end; d = addDays(d, 1)) buckets.push(d);
    }
    const index = new Map(buckets.map((k, i) => [k, i]));
    const keyOf = (d) => (daily ? d : d.slice(0, 7));
    const scoped = db.enquiries.filter((e) => !e.is_invalid && canView(user, e)).map((e) => present(e, user)).filter((e) => !q.location_id || e.location_id === Number(q.location_id));
    const brands = new Map();
    const brand = (e) => {
      if (!brands.has(e.brand_id)) {
        const zero = () => buckets.map(() => 0);
        brands.set(e.brand_id, { id: e.brand_id, name: e.brand, enquiries: zero(), test_drives: zero(), sold: zero(), total_converted: 0 });
      }
      return brands.get(e.brand_id);
    };
    for (const e of scoped) {
      if (months.includes(e.entry_date.slice(0, 7))) {
        const i = index.get(keyOf(e.entry_date));
        if (i != null) {
          const b = brand(e);
          b.enquiries[i]++;
          if (e.test_drive) b.test_drives[i]++;
          if (e.outcome === 'sold') b.total_converted++;
        }
      }
      if (e.outcome === 'sold' && e.sold_date && months.includes(e.sold_date.slice(0, 7))) {
        const i = index.get(keyOf(e.sold_date));
        if (i != null) brand(e).sold[i]++;
      }
    }
    const sum = (a) => a.reduce((x, y) => x + y, 0);
    const all = [...brands.values()].map((b) => ({ ...b, total_enquiries: sum(b.enquiries), total_test_drives: sum(b.test_drives), total_sold: sum(b.sold) }));
    const total = sum(all.map((b) => b.total_enquiries));
    for (const b of all) {
      b.share = pct(b.total_enquiries, total);
      b.conversion = pct(b.total_converted, b.total_enquiries);
    }
    all.sort((a, b) => b.total_enquiries - a.total_enquiries || b.total_sold - a.total_sold || a.name.localeCompare(b.name));
    return { granularity: daily ? 'day' : 'month', months, buckets, today: t, total_enquiries: total, brands: all };
  }

  function summary(user, q) {
    const t = today();
    const period = q.period || 'month';
    const range = periodRange(period, q.date || t, q.from, q.to);
    const scoped = db.enquiries
      .filter((e) => !e.is_invalid && canView(user, e))
      .map((e) => present(e, user))
      .filter((e) => (!q.location_id || e.location_id === Number(q.location_id)) && (!q.brand_id || e.brand_id === Number(q.brand_id)) && (!q.salesperson_id || e.salesperson_id === Number(q.salesperson_id)));
    const inRange = (e, r) => e.entry_date >= r.from && e.entry_date <= r.to;
    const rows = scoped.filter((e) => inRange(e, range)).sort((a, b) => b.entry_date.localeCompare(a.entry_date) || b.id - a.id);
    const prevRows = scoped.filter((e) => inRange(e, range.prev));
    const soldBy = (r) => scoped.filter((e) => e.outcome === 'sold' && e.sold_date >= r.from && e.sold_date <= r.to).length;
    const ids = new Set(scoped.map((e) => e.id));
    const fu = db.activities.filter((a) => a.followup_due && ids.has(a.enquiry_id) && a.local_date >= range.from && a.local_date <= range.to);
    const esc = Number(setting('followup.escalation_days', '3'));
    const stale = Number(setting('followup.stale_days', '45'));
    const lastAct = (e) => db.activities.filter((a) => a.enquiry_id === e.id).reduce((m, a) => (a.local_date > m ? a.local_date : m), e.entry_date);
    const slim = (e) => ({ id: e.id, customer_name: e.customer_name, entry_date: e.entry_date, location: e.location, brand: e.brand, vehicle: e.vehicle || 'Not recorded', salesperson: e.salesperson, outcome: e.outcome, test_drive: e.test_drive, next_followup_at: e.next_followup_at });
    const lostRows = rows.filter((e) => e.outcome === 'lost');
    return {
      period: { type: period, from: range.from, to: range.to, previous: range.prev, today: t },
      totals: { ...totals(rows), cars_sold: soldBy(range) },
      previous: { ...totals(prevRows), cars_sold: soldBy(range.prev) },
      followups: {
        overdue: scoped.filter((e) => e.outcome === 'open' && !e.pending_outcome && e.next_followup_at < t).length,
        due_today: scoped.filter((e) => e.outcome === 'open' && !e.pending_outcome && e.next_followup_at === t).length,
        awaiting_approval: scoped.filter((e) => e.pending_outcome).length,
        done: fu.length,
        on_time: fu.filter((a) => a.local_date <= a.followup_due).length,
        on_time_rate: pct(fu.filter((a) => a.local_date <= a.followup_due).length, fu.length),
        escalation_days: esc,
        stale_days: stale,
      },
      by_location: groupBy(rows, (r) => r.location_id, (r) => r.location),
      by_brand: groupBy(rows, (r) => r.brand_id, (r) => r.brand),
      by_location_brand: groupBy(rows, (r) => `${r.location_id}-${r.brand_id}`, (r) => `${r.brand} – ${r.location}`),
      by_salesperson: groupBy(rows, (r) => r.salesperson_id, (r) => r.salesperson),
      by_model: groupBy(rows, (r) => `${r.brand_id}|${r.vehicle}`, (r) => (r.brand_is_used ? `Used: ${r.vehicle || 'Not recorded'}` : `${r.brand} ${r.vehicle || 'Not recorded'}`), 20),
      by_source: groupBy(rows, (r) => r.source || 'Not recorded', (r) => r.source || 'Not recorded'),
      by_postcode: groupBy(rows, (r) => r.postcode || '—', (r) => r.postcode || 'Not recorded', 20),
      lost_reasons: groupBy(lostRows, (r) => r.lost_reason || 'Not recorded', (r) => r.lost_reason || 'Not recorded').map((g) => ({ label: g.label, count: g.enquiries, share: pct(g.enquiries, lostRows.length) })),
      escalated: scoped.filter((e) => e.outcome === 'open' && !e.pending_outcome && e.next_followup_at <= addDays(t, -esc)).sort((a, b) => a.next_followup_at.localeCompare(b.next_followup_at)).slice(0, 50).map(slim),
      stale: scoped.filter((e) => e.outcome === 'open' && lastAct(e) <= addDays(t, -stale)).slice(0, 50).map(slim),
      enquiries: period === 'day' ? rows.map(slim) : [],
    };
  }

  // ---------- Reference ----------
  function reference(user) {
    const mine = full(user) ? null : new Set(userFranchises(user));
    const franchises = db.franchises
      .filter((f) => !mine || mine.has(f.id))
      .map((f) => ({ id: f.id, location_id: f.location_id, brand_id: f.brand_id, active: f.active, can_create: !!(f.active && byId(db.locations, f.location_id).active && byId(db.brands, f.brand_id).active) }));
    const brandIds = new Set(franchises.map((f) => f.brand_id));
    const locIds = new Set(franchises.map((f) => f.location_id));
    const linked = new Set(db.used_makes.filter((m) => m.brand_id).map((m) => m.brand_id));
    let assignees = [];
    if (isManager(user)) {
      const map = new Map();
      for (const uf of db.user_franchises) {
        const u = byId(db.users, uf.user_id);
        if (!u || !u.active || (mine && !mine.has(uf.franchise_id))) continue;
        if (!map.has(u.id)) map.set(u.id, { id: u.id, name: u.name, role: u.role, franchise_ids: [] });
        map.get(u.id).franchise_ids.push(uf.franchise_id);
      }
      assignees = [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
    }
    const srt = (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.name ?? a.label).localeCompare(String(b.name ?? b.label));
    return {
      locations: db.locations.filter((l) => !mine || locIds.has(l.id)).sort(srt),
      brands: db.brands.filter((b) => !mine || brandIds.has(b.id)).sort(srt),
      franchises,
      models: db.models.filter((m) => brandIds.has(m.brand_id)).sort(srt),
      used_makes: [...db.used_makes].sort((a, b) => a.name.localeCompare(b.name)),
      used_models: db.used_models,
      used_linked_models: db.models.filter((m) => linked.has(m.brand_id)).sort(srt),
      sources: db.lookup_values.filter((x) => x.list_type === 'source').sort(srt),
      lost_reasons: db.lookup_values.filter((x) => x.list_type === 'lost_reason').sort(srt),
      assignees,
    };
  }

  // ---------- Routes ----------
  const routes = [];
  const on = (method, pattern, fn) => routes.push({ method, pattern, fn });
  const me = () => {
    const u = db.session && byId(db.users, db.session);
    if (!u || !u.active) fail(401, 'Please sign in');
    return u;
  };
  const meReady = () => {
    const u = me();
    if (u.must_change_password) fail(403, 'You need to set a new password first');
    return u;
  };
  const notInDemo = (what) => fail(400, `${what} isn't available in this trial version. It works in the full app.`);

  on('GET', /^\/api\/branding$/, () => Object.fromEntries(Object.entries(db.settings).filter(([k]) => k.startsWith('branding.')).map(([k, x]) => [k.slice(9), x])));
  on('POST', /^\/api\/auth\/login$/, (_, b) => {
    const name = String(b.username || '').trim().toLowerCase();
    const u = db.users.find((x) => x.username === name || (x.email && x.email === name));
    if (!u || db.passwords[u.id] !== String(b.password || '') || !u.active) fail(401, 'Incorrect username or password');
    db.session = u.id;
    u.last_login_at = nowIso();
    return { user: publicUser(u) };
  });
  on('POST', /^\/api\/auth\/logout$/, () => {
    db.session = null;
    return { ok: true };
  });
  on('GET', /^\/api\/auth\/me$/, () => ({ user: publicUser(me()) }));
  on('POST', /^\/api\/auth\/change-password$/, (_, b) => {
    const u = me();
    if (db.passwords[u.id] !== b.current_password) bad('current_password', 'Current password is incorrect');
    if (String(b.new_password || '').length < 10) bad('new_password', 'Password must be at least 10 characters');
    db.passwords[u.id] = b.new_password;
    u.must_change_password = 0;
    return { user: publicUser(u) };
  });
  on('PATCH', /^\/api\/auth\/me$/, (_, b) => {
    const u = meReady();
    if (b.email !== undefined) u.email = v.email(b.email);
    if (b.notify_email !== undefined) u.notify_email = v.bool(b.notify_email);
    return { user: publicUser(u) };
  });
  on('GET', /^\/api\/reference$/, () => reference(meReady()));

  on('GET', /^\/api\/enquiries$/, (q) => {
    const u = meReady();
    const t = today();
    let rows = db.enquiries.filter((e) => canView(u, e));
    if (!(q.include_invalid === '1' && isManager(u))) rows = rows.filter((e) => !e.is_invalid);
    rows = rows.map((e) => present(e, u));
    const f = (fn) => (rows = rows.filter(fn));
    if (q.outcome) f((e) => e.outcome === q.outcome);
    if (q.month) f((e) => e.entry_month === q.month);
    if (q.entry_date) f((e) => e.entry_date === q.entry_date);
    if (q.location_id) f((e) => e.location_id === Number(q.location_id));
    if (q.brand_id) f((e) => e.brand_id === Number(q.brand_id));
    if (q.salesperson_id) f((e) => e.salesperson_id === Number(q.salesperson_id));
    if (q.pending === '1') f((e) => !!e.pending_outcome);
    if (q.overdue === '1') f((e) => e.outcome === 'open' && !e.pending_outcome && e.next_followup_at < t);
    if (q.due === 'today') f((e) => e.outcome === 'open' && !e.pending_outcome && e.next_followup_at <= t);
    if (q.q) {
      const term = q.q.toLowerCase();
      const digits = q.q.replace(/\D/g, '');
      f((e) => e.customer_name.toLowerCase().includes(term) || (e.email || '').includes(term) || (e.stock_number || '').toLowerCase().includes(term) || (digits.length >= 3 && !/[a-z]/i.test(q.q) && (e.phone || '').includes(digits)) || String(e.id) === q.q.trim());
    }
    const sorts = {
      newest: (a, b) => b.entry_date.localeCompare(a.entry_date) || b.id - a.id,
      oldest: (a, b) => a.entry_date.localeCompare(b.entry_date) || a.id - b.id,
      followup: (a, b) => (a.outcome === 'open' ? 0 : 1) - (b.outcome === 'open' ? 0 : 1) || String(a.next_followup_at).localeCompare(String(b.next_followup_at)) || b.id - a.id,
      name: (a, b) => a.customer_name.localeCompare(b.customer_name),
    };
    rows.sort(sorts[q.sort] || sorts.newest);
    const limit = Math.min(Number(q.limit) || 50, 200);
    const offset = Number(q.offset) || 0;
    return { total: rows.length, limit, offset, items: rows.slice(offset, offset + limit) };
  });
  on('GET', /^\/api\/enquiries\/duplicates$/, (q) => {
    const u = meReady();
    const phone = q.phone ? v.phone(q.phone) : null;
    const email = q.email ? v.email(q.email) : null;
    const rows = db.enquiries.filter((e) => e.outcome === 'open' && !e.is_invalid && e.id !== Number(q.exclude_id || 0) && ((phone && e.phone === phone) || (email && e.email === email))).slice(0, 10);
    return {
      matches: rows.map((e) => {
        const p = present(e, u);
        const vis = canView(u, e);
        return { id: vis ? e.id : null, can_view: vis, salesperson: p.salesperson, location: p.location, brand: p.brand, entry_date: e.entry_date, match_on: phone && e.phone === phone ? 'phone' : 'email' };
      }),
    };
  });
  const visible = (u, id) => {
    const e = byId(db.enquiries, id);
    if (!e || !canView(u, e)) fail(404, 'Enquiry not found');
    return e;
  };
  on('GET', /^\/api\/enquiries\/(\d+)$/, (q, b, [id]) => {
    const u = meReady();
    const e = visible(u, id);
    const acts = db.activities
      .filter((a) => a.enquiry_id === e.id)
      .sort((a, b2) => b2.created_at.localeCompare(a.created_at) || b2.id - a.id)
      .map((a) => ({ id: a.id, type: a.type, body: a.body, created_at: a.created_at, user: byId(db.users, a.user_id)?.name }));
    return { enquiry: present(e, u), activities: acts };
  });
  on('POST', /^\/api\/enquiries$/, (q, b) => {
    const u = meReady();
    const before = JSON.stringify([db.used_makes, db.used_models]);
    try {
      const rec = build(u, b, null);
      const e = { id: nextId(db.enquiries), ...rec, is_invalid: 0, invalid_reason: null, created_by: u.id, created_at: nowIso(), updated_at: nowIso() };
      db.enquiries.push(e);
      addActivity(e.id, u.id, 'created');
      if (b.comment && String(b.comment).trim()) addActivity(e.id, u.id, 'comment', String(b.comment).trim());
      if (rec.approvalRequest) saveRequest(e, u, rec.approvalRequest, null);
      audit(u.id, 'create', 'enquiry', e.id, { customer: e.customer_name });
      return { enquiry: present(e, u) };
    } catch (err) {
      [db.used_makes, db.used_models] = JSON.parse(before);
      throw err;
    }
  });
  on('PATCH', /^\/api\/enquiries\/(\d+)$/, (q, b, [id]) => {
    const u = meReady();
    const e = visible(u, id);
    const existing = present(e, u);
    const rec = build(u, b, existing);
    const old = { ...e };
    Object.assign(e, rec, { updated_at: nowIso() });
    const cap = (s) => s[0].toUpperCase() + s.slice(1);
    if (old.outcome !== e.outcome) {
      addActivity(e.id, u.id, 'status_change', `${cap(old.outcome)} → ${cap(e.outcome)}`);
      clearRequest(e);
    }
    if (rec.approvalRequest) saveRequest(e, u, rec.approvalRequest, String(b.comment || '').trim());
    if (old.salesperson_id !== e.salesperson_id) addActivity(e.id, u.id, 'reassigned', `${byId(db.users, old.salesperson_id).name} → ${byId(db.users, e.salesperson_id).name}`);
    const labels = { customer_name: 'name', postcode: 'postcode', phone: 'phone', email: 'email', model_id: 'model', used_make_id: 'make', used_extra_model_id: 'model', used_model_id: 'model', stock_number: 'stock number', source_id: 'source', test_drive: 'test drive', trade_in: 'trade-in', finance: 'finance', next_followup_at: 'next follow-up', entry_date: 'date of entry', franchise_id: 'site/brand' };
    const changed = [...new Set(Object.entries(labels).filter(([k]) => old[k] !== e[k]).map(([, l]) => l))];
    if (changed.length) addActivity(e.id, u.id, 'edited', `Changed ${changed.join(', ')}`);
    if (b.comment && String(b.comment).trim() && !rec.approvalRequest) addActivity(e.id, u.id, 'comment', String(b.comment).trim());
    audit(u.id, 'update', 'enquiry', e.id);
    return { enquiry: present(e, u) };
  });
  on('POST', /^\/api\/enquiries\/(\d+)\/approval$/, (q, b, [id]) => {
    const u = meReady();
    const e = visible(u, id);
    if (!e.pending_outcome) bad(null, 'There is nothing waiting for approval on this enquiry');
    if (!(isManager(u) && hasFranchise(u, e.franchise_id))) fail(403, 'Only the sales manager for this brand and site can approve this');
    const reason = String(b.reason || '').trim();
    if (!reason) bad('reason', 'Reason is required');
    const what = e.pending_outcome === 'sold' ? 'sale' : 'lost enquiry';
    if (b.decision === 'approve') {
      Object.assign(e, {
        outcome: e.pending_outcome,
        lost_reason_id: e.pending_outcome === 'lost' ? Number(b.lost_reason_id) || e.pending_lost_reason_id : null,
        sold_at: e.pending_outcome === 'sold' ? e.pending_at : null,
        sold_date: e.pending_outcome === 'sold' ? e.pending_date : null,
        closed_at: e.pending_at,
        next_followup_at: null,
      });
      addActivity(e.id, u.id, 'approved', `Approved ${what}: ${reason}`);
    } else {
      if (!e.next_followup_at || e.next_followup_at < today()) e.next_followup_at = today();
      addActivity(e.id, u.id, 'declined', `Declined ${what}: ${reason}`);
    }
    clearRequest(e);
    return { enquiry: present(e, u) };
  });
  on('POST', /^\/api\/enquiries\/(\d+)\/withdraw$/, (q, b, [id]) => {
    const u = meReady();
    const e = visible(u, id);
    if (!e.pending_outcome) bad(null, 'There is nothing waiting for approval on this enquiry');
    addActivity(e.id, u.id, 'request_withdrawn', `Withdrew the ${e.pending_outcome} request`);
    clearRequest(e);
    return { enquiry: present(e, u) };
  });
  on('POST', /^\/api\/enquiries\/(\d+)\/followup$/, (q, b, [id]) => {
    const u = meReady();
    const e = visible(u, id);
    if (e.outcome !== 'open') bad(null, 'This enquiry is already closed');
    const next = v.date(b.next_followup_at, 'next_followup_at', true);
    if (next < today()) bad('next_followup_at', 'Next follow-up cannot be in the past');
    const labels = { call: 'Called', email: 'Emailed', sms: 'Sent SMS', followup_done: 'Followed up' };
    const body = [labels[b.type || 'followup_done'] + (b.no_answer ? ' (no answer)' : ''), (b.body || '').trim()].filter(Boolean).join(': ');
    addActivity(e.id, u.id, b.type || 'followup_done', `${body}. Next follow-up ${next}`, e.next_followup_at);
    e.next_followup_at = next;
    return { enquiry: present(e, u) };
  });
  on('POST', /^\/api\/enquiries\/(\d+)\/activities$/, (q, b, [id]) => {
    const u = meReady();
    const e = visible(u, id);
    const body = String(b.body || '').trim();
    if ((b.type || 'comment') === 'comment' && !body) bad('body', 'Body is required');
    addActivity(e.id, u.id, b.type || 'comment', body);
    return { ok: true };
  });
  on('POST', /^\/api\/enquiries\/(\d+)\/invalid$/, (q, b, [id]) => {
    const u = meReady();
    const e = visible(u, id);
    if (!isManager(u)) fail(403, 'Only managers can mark an enquiry as duplicate/invalid');
    const inv = b.invalid !== false;
    if (inv && !String(b.reason || '').trim()) bad('reason', 'Reason is required');
    e.is_invalid = inv ? 1 : 0;
    e.invalid_reason = inv ? String(b.reason).trim() : null;
    addActivity(e.id, u.id, 'invalid', inv ? `Marked duplicate/invalid: ${e.invalid_reason}` : 'Restored (no longer marked invalid)');
    return { enquiry: present(e, u) };
  });
  on('POST', /^\/api\/enquiries\/(\d+)\/remove-personal-details$/, (q, b, [id]) => {
    const u = meReady();
    const e = visible(u, id);
    if (!full(u)) fail(403, 'Only the general manager or an admin can do that');
    Object.assign(e, { customer_name: 'Removed at customer request', phone: null, email: null });
    for (const a of db.activities) if (a.enquiry_id === e.id && ['comment', 'call', 'email', 'sms', 'followup_done'].includes(a.type)) a.body = '[removed at customer request]';
    addActivity(e.id, u.id, 'edited', 'Customer contact details and comments removed at customer request');
    return { enquiry: present(e, u) };
  });

  on('GET', /^\/api\/reports\/summary$/, (q) => summary(meReady(), q));
  on('GET', /^\/api\/reports\/trends$/, (q) => trends(meReady(), q));
  on('GET', /^\/api\/reports\/daily$/, () => daily(meReady()));
  on('GET', /^\/api\/reports\/sales-board$/, (q) => salesBoard(meReady(), q));

  // Team
  on('GET', /^\/api\/users$/, () => {
    const u = meReady();
    if (!isManager(u)) fail(403, 'You do not have permission to do that');
    const list = db.users.filter((x) => x.id === u.id || canManageUser(u, x)).sort((a, b) => b.active - a.active || a.name.localeCompare(b.name));
    return { users: list.map((x) => ({ ...publicUser(x), can_manage: x.id !== u.id })), assignable_roles: assignableRoles(u), can_grant_admin: u.is_admin === 1 };
  });
  const tempPassword = () => {
    const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let s = '';
    for (let i = 0; i < 12; i++) s += abc[Math.floor(Math.random() * abc.length)];
    return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
  };
  function resolveFranchises(actor, requested, current) {
    const ids = [...new Set((requested || []).map(Number))];
    if (full(actor)) return ids;
    const mine = new Set(userFranchises(actor));
    for (const id of ids) if (!mine.has(id) && !current.includes(id)) bad('franchise_ids', 'You can only assign brands and sites you manage');
    return [...new Set([...ids.filter((id) => mine.has(id)), ...current.filter((id) => !mine.has(id))])];
  }
  const setFranchises = (uid, ids) => {
    db.user_franchises = db.user_franchises.filter((x) => x.user_id !== uid).concat(ids.map((f) => ({ user_id: uid, franchise_id: f })));
  };
  on('POST', /^\/api\/users$/, (q, b) => {
    const u = meReady();
    if (!isManager(u)) fail(403, 'You do not have permission to do that');
    const role = b.role || 'salesperson';
    if (!assignableRoles(u).includes(role)) bad('role', 'You cannot give that role');
    if (b.is_admin && u.is_admin !== 1) fail(403, 'Only an admin can create another admin');
    const name = v.text(b.name, 'name', { required: true, max: 100 });
    const username = (v.text(b.username, 'username', { required: true, max: 50 }) || '').toLowerCase();
    if (!/^[a-z0-9._-]{3,50}$/.test(username)) bad('username', 'Username must be 3-50 characters: letters, numbers, dot, dash or underscore');
    if (db.users.some((x) => x.username === username)) bad('username', 'That username is already taken');
    const fr = resolveFranchises(u, b.franchise_ids, []);
    if (u.role === 'sales_manager' && !fr.length) bad('franchise_ids', 'Choose at least one brand/site for this salesperson');
    const nu = { id: nextId(db.users), name, username, email: v.email(b.email), role, is_admin: v.bool(b.is_admin), home_location_id: b.home_location_id ? Number(b.home_location_id) : null, active: 1, must_change_password: 1, notify_email: 1, last_login_at: null };
    db.users.push(nu);
    setFranchises(nu.id, fr);
    const temp = tempPassword();
    db.passwords[nu.id] = temp;
    audit(u.id, 'create', 'user', nu.id, { username });
    return { user: publicUser(nu), temporary_password: temp };
  });
  const manageable = (u, id) => {
    const t = byId(db.users, id);
    if (!t || !canManageUser(u, t)) fail(404, 'User not found');
    return t;
  };
  on('PATCH', /^\/api\/users\/(\d+)$/, (q, b, [id]) => {
    const u = meReady();
    const t = manageable(u, id);
    const self = t.id === u.id;
    if (b.name !== undefined) t.name = v.text(b.name, 'name', { required: true, max: 100 });
    if (b.email !== undefined) t.email = v.email(b.email);
    if (b.home_location_id !== undefined) t.home_location_id = b.home_location_id ? Number(b.home_location_id) : null;
    if (b.role !== undefined && b.role !== t.role) {
      if (self) fail(403, 'You cannot change your own role');
      if (!assignableRoles(u).includes(b.role)) bad('role', 'You cannot give that role');
      t.role = b.role;
    }
    if (b.is_admin !== undefined && v.bool(b.is_admin) !== t.is_admin) {
      if (u.is_admin !== 1) fail(403, 'Only an admin can change admin access');
      t.is_admin = v.bool(b.is_admin);
    }
    if (b.active !== undefined && v.bool(b.active) !== t.active) {
      if (self) fail(403, 'You cannot disable your own account');
      t.active = v.bool(b.active);
    }
    if (b.franchise_ids) setFranchises(t.id, resolveFranchises(u, b.franchise_ids, userFranchises(t)));
    return { user: publicUser(t) };
  });
  on('POST', /^\/api\/users\/(\d+)\/reset-password$/, (q, b, [id]) => {
    const u = meReady();
    const t = manageable(u, id);
    const temp = tempPassword();
    db.passwords[t.id] = temp;
    t.must_change_password = 1;
    return { temporary_password: temp };
  });
  on('POST', /^\/api\/users\/(\d+)\/reassign-open$/, (q, b, [id]) => {
    const u = meReady();
    const from = manageable(u, id);
    const to = Number(b.to_user_id);
    let moved = 0;
    let notMoved = 0;
    for (const e of db.enquiries.filter((x) => x.salesperson_id === from.id && x.outcome === 'open' && !x.is_invalid)) {
      if (!canAssignTo(u, e.franchise_id, to)) {
        notMoved++;
        continue;
      }
      e.salesperson_id = to;
      addActivity(e.id, u.id, 'reassigned', `${from.name} → ${byId(db.users, to).name}`);
      moved++;
    }
    return { moved, not_moved: notMoved };
  });

  // Admin (general manager / admin)
  const admin = () => {
    const u = meReady();
    if (!full(u)) fail(403, 'Only the general manager or an admin can do that');
    return u;
  };
  on('GET', /^\/api\/admin\/settings$/, () => {
    admin();
    return { settings: { ...db.settings }, smtp_password_set: false, backup_passphrase_set: false };
  });
  on('PUT', /^\/api\/admin\/settings$/, (q, b) => {
    admin();
    for (const [k, x] of Object.entries(b)) {
      if (/^branding\.(primary|accent)_colour$/.test(k) && !/^#[0-9a-fA-F]{6}$/.test(String(x))) bad(k.split('.')[1], 'Colour must look like #0B3D91');
      if (/password|passphrase/.test(k) && !x) continue;
      if (/password|passphrase/.test(k)) continue; // not kept in the trial
      db.settings[k] = typeof x === 'boolean' ? (x ? '1' : '0') : String(x);
    }
    return { ok: true };
  });
  on('PUT', /^\/api\/admin\/logo$/, (q, b) => {
    admin();
    db.settings['branding.logo_url'] = String(b.data_url || '');
    return { ok: true };
  });
  const nameCheck = (list, name, extra = () => true, except = 0) => {
    if (list.some((x) => x.id !== except && extra(x) && String(x.name ?? x.label).toLowerCase() === name.toLowerCase())) bad('name', `"${name}" already exists`);
  };
  const patchItem = (list, id, b, nameKey = 'name', scopeFn = () => true) => {
    const it = byId(list, id);
    if (!it) fail(404, 'Not found');
    if (b[nameKey] !== undefined) {
      const n = v.text(b[nameKey], nameKey, { required: true, max: 60 });
      nameCheck(list, n, (x) => scopeFn(x, it), it.id);
      it[nameKey] = n;
    }
    if (b.active !== undefined) it.active = v.bool(b.active);
    if (b.colour !== undefined) it.colour = b.colour;
    if (b.brand_id !== undefined) it.brand_id = b.brand_id ? Number(b.brand_id) : null;
    return it;
  };
  const reorder = (list, ids, where = () => true) => ids.forEach((id, i) => { const it = byId(list, id); if (it && where(it)) it.sort_order = i; });
  on('POST', /^\/api\/admin\/locations$/, (q, b) => {
    admin();
    const n = v.text(b.name, 'name', { required: true, max: 60 });
    nameCheck(db.locations, n);
    const l = { id: nextId(db.locations), name: n, sort_order: db.locations.length, active: 1 };
    db.locations.push(l);
    return { location: l };
  });
  on('PATCH', /^\/api\/admin\/locations\/(\d+)$/, (q, b, [id]) => (admin(), { location: patchItem(db.locations, id, b) }));
  on('POST', /^\/api\/admin\/brands$/, (q, b) => {
    admin();
    const n = v.text(b.name, 'name', { required: true, max: 60 });
    nameCheck(db.brands, n);
    const br = { id: nextId(db.brands), name: n, colour: b.colour || '#5A6270', is_used: v.bool(b.is_used), sort_order: db.brands.length, active: 1 };
    db.brands.push(br);
    for (const l of b.location_ids || []) db.franchises.push({ id: nextId(db.franchises), location_id: Number(l), brand_id: br.id, active: 1 });
    return { brand: br };
  });
  on('PATCH', /^\/api\/admin\/brands\/(\d+)$/, (q, b, [id]) => (admin(), { brand: patchItem(db.brands, id, b) }));
  on('POST', /^\/api\/admin\/brands\/reorder$/, (q, b) => (admin(), reorder(db.brands, b.ids || []), { ok: true }));
  on('PUT', /^\/api\/admin\/franchises$/, (q, b) => {
    admin();
    const f = db.franchises.find((x) => x.location_id === Number(b.location_id) && x.brand_id === Number(b.brand_id));
    if (f) f.active = v.bool(b.active);
    else if (b.active) db.franchises.push({ id: nextId(db.franchises), location_id: Number(b.location_id), brand_id: Number(b.brand_id), active: 1 });
    return { ok: true };
  });
  on('GET', /^\/api\/admin\/models$/, (q) => (admin(), { models: db.models.filter((m) => m.brand_id === Number(q.brand_id)).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)) }));
  on('POST', /^\/api\/admin\/models$/, (q, b) => {
    admin();
    const bid = Number(b.brand_id);
    const n = v.text(b.name, 'name', { required: true, max: 60 });
    nameCheck(db.models, n, (x) => x.brand_id === bid);
    const m = { id: nextId(db.models), brand_id: bid, name: n, sort_order: db.models.filter((x) => x.brand_id === bid).length, active: 1 };
    db.models.push(m);
    return { model: m };
  });
  on('PATCH', /^\/api\/admin\/models\/(\d+)$/, (q, b, [id]) => (admin(), { model: patchItem(db.models, id, b, 'name', (x, it) => x.brand_id === it.brand_id) }));
  on('POST', /^\/api\/admin\/models\/reorder$/, (q, b) => (admin(), reorder(db.models, b.ids || [], (m) => m.brand_id === Number(b.brand_id)), { ok: true }));
  on('POST', /^\/api\/admin\/used-makes$/, (q, b) => {
    admin();
    const n = v.text(b.name, 'name', { required: true, max: 60 });
    nameCheck(db.used_makes, n);
    const m = { id: nextId(db.used_makes), name: n, brand_id: b.brand_id ? Number(b.brand_id) : null, sort_order: 0, active: 1 };
    db.used_makes.push(m);
    return { make: m };
  });
  on('PATCH', /^\/api\/admin\/used-makes\/(\d+)$/, (q, b, [id]) => (admin(), { make: patchItem(db.used_makes, id, b) }));
  on('POST', /^\/api\/admin\/used-models$/, (q, b) => {
    admin();
    const mk = Number(b.make_id);
    const n = v.text(b.name, 'name', { required: true, max: 60 });
    nameCheck(db.used_models, n, (x) => x.make_id === mk);
    const m = { id: nextId(db.used_models), make_id: mk, name: n, active: 1 };
    db.used_models.push(m);
    return { model: m };
  });
  on('PATCH', /^\/api\/admin\/used-models\/(\d+)$/, (q, b, [id]) => (admin(), { model: patchItem(db.used_models, id, b, 'name', (x, it) => x.make_id === it.make_id) }));
  on('POST', /^\/api\/admin\/lookups$/, (q, b) => {
    admin();
    const n = v.text(b.label, 'label', { required: true, max: 60 });
    nameCheck(db.lookup_values, n, (x) => x.list_type === b.list_type);
    const it = { id: nextId(db.lookup_values), list_type: b.list_type, label: n, sort_order: db.lookup_values.filter((x) => x.list_type === b.list_type).length, active: 1 };
    db.lookup_values.push(it);
    return { item: it };
  });
  on('PATCH', /^\/api\/admin\/lookups\/(\d+)$/, (q, b, [id]) => (admin(), { item: patchItem(db.lookup_values, id, b, 'label', (x, it) => x.list_type === it.list_type) }));
  on('POST', /^\/api\/admin\/lookups\/reorder$/, (q, b) => (admin(), reorder(db.lookup_values, b.ids || [], (x) => x.list_type === b.list_type), { ok: true }));
  on('GET', /^\/api\/admin\/audit$/, (q) => {
    admin();
    const items = db.audit.map((a) => ({ ...a, user: byId(db.users, a.user_id)?.name }));
    const off = Number(q.offset) || 0;
    return { total: items.length, items: items.slice(off, off + (Number(q.limit) || 50)) };
  });
  on('GET', /^\/api\/admin\/backups$/, () => (admin(), { items: db.backups, last_nightly: db.backups.find((b) => b.kind === 'nightly') || null, recent_failures: 0, location: '/srv/sunco-crm/backups (on the server)' }));
  on('POST', /^\/api\/admin\/backups$/, () => {
    admin();
    const t = new Date();
    const time = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(t);
    const b = { name: `sunco-crm-${today()}-${time.replace(':', '')}00-manual.db`, date: today(), time, kind: 'manual', size: 230000 };
    db.backups.unshift(b);
    return { backup: b };
  });
  on('POST', /^\/api\/admin\/backups\/.+\/email$/, () => notInDemo('Emailing backups'));
  on('POST', /^\/api\/admin\/backups\/.+\/restore$/, () => notInDemo('Restoring a backup'));
  on('POST', /^\/api\/admin\/backups-upload\/restore$/, () => notInDemo('Restoring a backup'));
  on('POST', /^\/api\/admin\/import\/preview$/, () => notInDemo('Importing a spreadsheet'));
  on('POST', /^\/api\/admin\/import\/run$/, () => notInDemo('Importing a spreadsheet'));
  on('POST', /^\/api\/admin\/email\/test$/, () => notInDemo('Sending email'));
  on('POST', /^\/api\/admin\/email\/send-now$/, () => notInDemo('Sending email'));

  // ---------- Replace the app's network calls ----------
  CRM.api = async function demoApi(method, url, body) {
    const [path, qs] = url.split('?');
    const query = Object.fromEntries(new URLSearchParams(qs || ''));
    const route = routes.find((r) => r.method === method && r.pattern.test(path));
    await new Promise((r) => setTimeout(r, 60)); // feel like a real request
    try {
      if (!route) fail(404, 'Not found');
      const m = route.pattern.exec(path);
      const payload = body instanceof Blob || body instanceof ArrayBuffer ? {} : body ? JSON.parse(JSON.stringify(body)) : {};
      const result = clone(route.fn(query, payload, m.slice(1)));
      if (method !== 'GET' || path === '/api/auth/me') save();
      return result;
    } catch (err) {
      if (err.status === 401 && !path.startsWith('/api/auth/')) {
        CRM.state.me = null;
        CRM.showLogin();
        throw Object.assign(new Error(err.message), { status: 401, silent: true });
      }
      throw Object.assign(new Error(err.status ? err.message : 'Something went wrong in the trial. Try "Reset demo".'), { status: err.status || 500, field: err.field });
    }
  };

  // ---------- Navigation inside the published page ----------
  let current = '#/today';
  CRM.location = {
    get: () => current,
    set: (hash) => {
      current = hash;
      CRM.closeMenu?.();
      CRM.render();
    },
    replace: (hash) => {
      current = hash;
    },
  };
  document.addEventListener(
    'click',
    (e) => {
      const a = e.target.closest && e.target.closest('a[href]');
      if (!a) return;
      const href = a.getAttribute('href');
      if (href.startsWith('#/')) {
        e.preventDefault();
        CRM.go(href);
      } else if (href.startsWith('/api/')) {
        e.preventDefault();
        CRM.toast("Downloads aren't available in the trial. They work in the full app.", 'error');
      }
    },
    true
  );
  CRM.download = () => CRM.toast("Exports aren't available in the trial. They work in the full app.", 'error');

  // ---------- Trial banner and quick sign-in ----------
  const origShowLogin = () => CRM.showLogin;
  window.addEventListener('DOMContentLoaded', () => {
    const real = origShowLogin();
    CRM.showLogin = function showLoginWithDemo() {
      real();
      const card = document.querySelector('#main .card.narrow');
      if (!card) return;
      const pick = (username) => {
        card.querySelector('input[name=username]').value = username;
        card.querySelector('input[name=password]').value = PASSWORD;
        card.querySelector('form').requestSubmit();
      };
      const btn = (username, title, sub) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'demo-account';
        b.innerHTML = '<b></b><span></span>';
        b.querySelector('b').textContent = title;
        b.querySelector('span').textContent = sub;
        b.addEventListener('click', () => pick(username));
        return b;
      };
      const box = document.createElement('div');
      box.className = 'demo-accounts';
      const h = document.createElement('p');
      h.className = 'demo-label';
      h.textContent = 'Trial version: tap a person to sign in';
      box.append(
        h,
        btn('demo.sales', 'Sam Seller', 'Salesperson · MG, LDV, Used Cars'),
        btn('demo.manager', 'Casey Morgan', 'Sales Manager · Caloundra'),
        btn('demo.gm', 'Jake Curran', 'General Manager · everything incl. Admin')
      );
      const note = document.createElement('p');
      note.className = 'muted small';
      note.style.margin = '12px 0 0';
      note.textContent = `Password for every account: ${PASSWORD}. Everything you change stays in this browser only. `;
      const reset = document.createElement('button');
      reset.type = 'button';
      reset.className = 'link-btn';
      reset.style.padding = '0';
      reset.textContent = 'Reset demo';
      reset.addEventListener('click', () => CRM.resetDemo());
      note.append(reset);
      box.append(note);
      card.querySelector('form').before(box);
    };
    const badge = document.createElement('button');
    badge.type = 'button';
    badge.className = 'demo-badge';
    badge.textContent = 'Trial';
    badge.title = 'Trial version: tap to reset the demo data';
    badge.addEventListener('click', () =>
      CRM.dialog({
        title: 'Trial version',
        body: Object.assign(document.createElement('p'), {
          textContent: 'This trial runs entirely in your browser with made-up data. Changes stay on this device. Emails, backups, exports and the spreadsheet import only work in the full app. Reset puts the demo data back to the start.',
        }),
        actions: [{ label: 'Close', class: 'btn-ghost' }, { label: 'Reset demo', class: 'btn-primary', onClick: () => CRM.resetDemo() }],
      })
    );
    document.querySelector('.topbar .brand').after(badge);
  });
})();
