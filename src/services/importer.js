// Imports the old Excel walk-in workbook. Step 1 (preview) reads the file and guesses which
// column is which; step 2 (run) imports with the admin's choices, as a dry run first.
const crypto = require('node:crypto');
const ExcelJS = require('exceljs');
const v = require('../lib/validate');
const { monthOf, localDate, nowIso } = require('../lib/time');
const { getSetting } = require('../lib/settings');
const { transaction } = require('../db');

const FIELDS = {
  entry_date: { label: 'Date of entry', match: /\bdate\b|entry/i },
  month: { label: 'Month (ignored, worked out from date)', match: /month/i },
  brand: { label: 'Brand', match: /brand|make|franchise/i },
  department: { label: 'Department / location', match: /dep(ar)?t|location|site|branch|dealer|yard/i },
  customer_name: { label: 'Customer name', match: /name|customer|client/i },
  postcode: { label: 'Postcode', match: /post\s*code|p\/?code|\bpc\b/i },
  phone: { label: 'Phone', match: /phone|mobile|\bmob\b|\bph\b|contact\s*n/i },
  email: { label: 'Email', match: /e-?mail/i },
  test_drive: { label: 'Test drive (yes/no)', match: /test|\bt\/?d\b/i },
  trade_in: { label: 'Trade-in (yes/no)', match: /trade/i },
  finance: { label: 'Finance (yes/no)', match: /financ/i },
  lost: { label: 'Lost (yes/no)', match: /\blost\b/i },
  sold: { label: 'Sold (yes/no)', match: /\bsold\b|deliver/i },
  comments: { label: 'Comments', match: /comment|note|remark/i },
  salesperson: { label: 'Salesperson', match: /sales\s*(person|man|exec)?|consultant|\brep\b|staff/i },
  model: { label: 'Model', match: /model|vehicle|\bcar\b/i },
};

const uploads = new Map(); // token -> { sheets, expires }
const TTL = 60 * 60 * 1000;

function cellValue(c) {
  if (c == null) return null;
  if (c instanceof Date) return c;
  if (typeof c === 'object') {
    if (c.text != null) return String(c.text);
    if (c.result != null) return c.result instanceof Date ? c.result : String(c.result);
    if (c.richText) return c.richText.map((t) => t.text).join('');
    if (c.hyperlink) return String(c.text ?? c.hyperlink).replace(/^mailto:/, '');
    return null;
  }
  return c;
}

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

function distance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

// Finds the closest name in a list, allowing small misspellings ("Calandra" -> Caloundra).
function fuzzyFind(list, raw, nameKey = 'name') {
  const target = norm(raw);
  if (!target) return null;
  const aliases = { used: 'usedcars', usedcar: 'usedcars', cherry: 'chery', greatwall: 'gwm', haval: 'gwm' };
  const t = aliases[target] || target;
  let best = null;
  let bestScore = Infinity;
  for (const item of list) {
    const n = norm(item[nameKey]);
    if (n === t) return item;
    const score = n.startsWith(t) || t.startsWith(n) ? 1 : distance(n, t);
    if (score < bestScore) {
      bestScore = score;
      best = item;
    }
  }
  const allowed = Math.max(1, Math.floor(t.length / 3));
  return bestScore <= allowed ? best : null;
}

function yes(value) {
  const s = String(value ?? '').trim().toLowerCase();
  return ['y', 'yes', 'true', '1', 'x', '✓', '✔', 'sold', 'lost', 'td'].includes(s) ? 1 : 0;
}

function parseDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const s = String(value ?? '').trim();
  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s); // Australian day/month/year
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const iso = `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    try {
      return v.isoDate(iso, 'entry_date');
    } catch {
      return null;
    }
  }
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) {
    try {
      return v.isoDate(`${m[1]}-${m[2]}-${m[3]}`, 'entry_date');
    } catch {
      return null;
    }
  }
  if (/^\d{5}$/.test(s)) {
    // Excel serial date
    const d = new Date(Date.UTC(1899, 11, 30) + Number(s) * 86400e3);
    return d.toISOString().slice(0, 10);
  }
  return null;
}

function guessHeader(rows) {
  let best = { index: 0, score: -1 };
  rows.slice(0, 10).forEach((row, i) => {
    const score = row.filter((c) => typeof c === 'string' && Object.values(FIELDS).some((f) => f.match.test(c))).length;
    if (score > best.score) best = { index: i, score };
  });
  return best.index;
}

function guessMapping(headers) {
  const mapping = {};
  const used = new Set();
  // Most specific fields first so e.g. "Customer postcode" maps to postcode, not name.
  const order = ['email', 'postcode', 'phone', 'test_drive', 'trade_in', 'finance', 'lost', 'sold', 'month', 'entry_date', 'department', 'brand', 'model', 'salesperson', 'comments', 'customer_name'];
  for (const field of order) {
    const idx = headers.findIndex((h, i) => !used.has(i) && typeof h === 'string' && FIELDS[field].match.test(h));
    if (idx >= 0) {
      mapping[field] = idx;
      used.add(idx);
    }
  }
  return mapping;
}

function createImporter({ db }) {
  async function preview(buffer) {
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(buffer);
    } catch {
      throw Object.assign(new Error('Could not read that file. Save it as an Excel workbook (.xlsx) and try again.'), { status: 400 });
    }
    const brands = db.prepare('SELECT id, name FROM brands').all();
    const sheets = [];
    wb.eachSheet((ws) => {
      const rows = [];
      ws.eachRow({ includeEmpty: false }, (row) => {
        const values = row.values.slice(1).map(cellValue);
        if (values.some((x) => x != null && String(x).trim() !== '')) rows.push(values);
      });
      if (!rows.length) return;
      const headerRow = guessHeader(rows);
      const headers = rows[headerRow].map((h) => (h == null ? '' : String(h).trim()));
      const brand = fuzzyFind(brands, ws.name.replace(/\b(new|cars?|enquir(y|ies)|walk-?ins?|\d{4})\b/gi, ''));
      sheets.push({ name: ws.name, rows, headerRow, headers, mapping: guessMapping(headers), guessed_brand_id: brand?.id ?? null });
    });
    if (!sheets.length) throw Object.assign(new Error('That workbook has no data'), { status: 400 });

    const token = crypto.randomBytes(16).toString('hex');
    for (const [k, u] of uploads) if (u.expires < Date.now()) uploads.delete(k);
    uploads.set(token, { sheets, expires: Date.now() + TTL });
    return {
      token,
      fields: Object.fromEntries(Object.entries(FIELDS).map(([k, f]) => [k, f.label])),
      sheets: sheets.map((s) => ({
        name: s.name,
        header_row: s.headerRow + 1,
        headers: s.headers,
        row_count: s.rows.length - s.headerRow - 1,
        sample: s.rows.slice(s.headerRow + 1, s.headerRow + 4).map((r) => r.map((c) => (c instanceof Date ? c.toISOString().slice(0, 10) : c))),
        mapping: s.mapping,
        guessed_brand_id: s.guessed_brand_id,
      })),
    };
  }

  // configs: [{ name, include, mapping, brand_id, location_id, salesperson_id }]
  function run(actor, token, configs, dryRun) {
    const upload = uploads.get(token);
    if (!upload) throw Object.assign(new Error('The upload has expired. Please upload the file again.'), { status: 400 });
    const tz = getSetting(db, 'timezone', 'Australia/Brisbane');
    const today = localDate(new Date(), tz);
    const brands = db.prepare('SELECT id, name, is_used FROM brands').all();
    const locations = db.prepare('SELECT id, name FROM locations').all();
    const users = db.prepare('SELECT id, name FROM users').all();
    const models = db.prepare('SELECT id, brand_id, name FROM models').all();
    const franchiseOf = db.prepare('SELECT id FROM franchises WHERE location_id = ? AND brand_id = ?');
    const otherReason = db.prepare("SELECT id FROM lookup_values WHERE list_type = 'lost_reason' AND label = 'Other'").get()?.id ?? null;
    const exists = db.prepare(
      'SELECT 1 FROM enquiries WHERE franchise_id = ? AND entry_date = ? AND customer_name = ? COLLATE NOCASE AND IFNULL(phone, \'\') = IFNULL(?, \'\')'
    );

    const toInsert = [];
    const problems = [];
    let skippedDuplicates = 0;

    for (const cfg of configs || []) {
      if (!cfg.include) continue;
      const sheet = upload.sheets.find((s) => s.name === cfg.name);
      if (!sheet) continue;
      const map = cfg.mapping || {};
      const col = (row, field) => (map[field] == null || map[field] === '' ? null : row[Number(map[field])]);
      const defaultBrand = cfg.brand_id ? brands.find((b) => b.id === Number(cfg.brand_id)) : null;
      const defaultLocation = cfg.location_id ? locations.find((l) => l.id === Number(cfg.location_id)) : null;
      const defaultSalesperson = cfg.salesperson_id ? users.find((u) => u.id === Number(cfg.salesperson_id)) : null;

      sheet.rows.slice(sheet.headerRow + 1).forEach((row, i) => {
        const rowNo = sheet.headerRow + i + 2;
        const issue = (msg, fatal = false) => problems.push({ sheet: sheet.name, row: rowNo, message: msg, skipped: fatal });
        const rawName = col(row, 'customer_name');
        if (!rawName || !String(rawName).trim()) {
          if (row.some((c) => c != null && String(c).trim() !== '')) issue('No customer name, row skipped', true);
          return;
        }
        const notes = [];
        let name;
        try {
          name = v.personName(String(rawName));
        } catch (e) {
          return issue(e.message, true);
        }
        const rawDate = col(row, 'entry_date');
        const entryDate = parseDate(rawDate);
        if (!entryDate) return issue(`Date "${rawDate ?? ''}" not recognised, row skipped`, true);
        if (entryDate > today) return issue(`Date ${entryDate} is in the future, row skipped`, true);

        const rawBrand = col(row, 'brand');
        const brand = (rawBrand && fuzzyFind(brands, rawBrand)) || defaultBrand;
        if (!brand) return issue(`Brand "${rawBrand ?? ''}" not recognised and no default brand chosen, row skipped`, true);
        const rawDept = col(row, 'department');
        const location = (rawDept && fuzzyFind(locations, rawDept)) || defaultLocation;
        if (!location) return issue(`Department "${rawDept ?? ''}" not recognised and no default location chosen, row skipped`, true);
        const franchise = franchiseOf.get(location.id, brand.id);
        if (!franchise) return issue(`${brand.name} is not set up at ${location.name}, row skipped`, true);

        const rawSp = col(row, 'salesperson');
        let sp = rawSp ? fuzzyFind(users, rawSp) || users.find((u) => norm(u.name).startsWith(norm(rawSp))) : null;
        if (rawSp && !sp) notes.push(`Salesperson in spreadsheet: ${rawSp}`);
        sp = sp || defaultSalesperson;
        if (!sp) return issue(`Salesperson "${rawSp ?? ''}" not found and no default salesperson chosen, row skipped`, true);

        let phone = null;
        const rawPhone = col(row, 'phone');
        if (rawPhone != null && String(rawPhone).trim()) {
          let p = String(rawPhone).trim();
          if (/^4\d{8}$/.test(p)) p = '0' + p; // Excel drops the leading 0
          try {
            phone = v.phone(p);
          } catch {
            issue(`Phone "${rawPhone}" not valid, kept in comments`);
            notes.push(`Phone in spreadsheet: ${rawPhone}`);
          }
        }
        let email = null;
        const rawEmail = col(row, 'email');
        if (rawEmail != null && String(rawEmail).trim()) {
          try {
            email = v.email(String(rawEmail));
          } catch {
            issue(`Email "${rawEmail}" not valid, kept in comments`);
            notes.push(`Email in spreadsheet: ${rawEmail}`);
          }
        }
        let postcode = '';
        const rawPc = col(row, 'postcode');
        if (rawPc != null && String(rawPc).trim()) {
          try {
            postcode = v.postcode(String(rawPc));
          } catch {
            issue(`Postcode "${rawPc}" not valid, left blank`);
          }
        }

        let modelId = null;
        const rawModel = col(row, 'model');
        if (rawModel && !brand.is_used) {
          const m = fuzzyFind(models.filter((x) => x.brand_id === brand.id), rawModel);
          if (m) modelId = m.id;
          else notes.push(`Model in spreadsheet: ${rawModel}`);
        } else if (rawModel) {
          notes.push(`Vehicle in spreadsheet: ${rawModel}`);
        }

        const sold = yes(col(row, 'sold'));
        const lost = yes(col(row, 'lost'));
        if (sold && lost) return issue('Marked both Sold and Lost, row skipped (fix in the spreadsheet or enter by hand)', true);
        const outcome = sold ? 'sold' : lost ? 'lost' : 'open';

        if (exists.get(franchise.id, entryDate, name, phone)) {
          skippedDuplicates++;
          return;
        }
        const comment = col(row, 'comments');
        toInsert.push({
          rec: {
            franchise_id: franchise.id,
            salesperson_id: sp.id,
            customer_name: name,
            postcode,
            phone,
            email,
            model_id: modelId,
            test_drive: yes(col(row, 'test_drive')),
            trade_in: yes(col(row, 'trade_in')),
            finance: yes(col(row, 'finance')),
            outcome,
            lost_reason_id: outcome === 'lost' ? otherReason : null,
            sold_at: outcome === 'sold' ? `${entryDate}T00:00:00.000Z` : null,
            sold_date: outcome === 'sold' ? entryDate : null,
            closed_at: outcome === 'open' ? null : nowIso(),
            next_followup_at: outcome === 'open' ? today : null,
            entry_date: entryDate,
            entry_month: monthOf(entryDate),
            created_by: actor.id,
          },
          comments: [comment != null && String(comment).trim() ? String(comment).trim() : null, ...notes].filter(Boolean),
          sheet: sheet.name,
        });
      });
    }

    const summary = {
      dry_run: dryRun,
      will_import: toInsert.length,
      open: toInsert.filter((r) => r.rec.outcome === 'open').length,
      sold: toInsert.filter((r) => r.rec.outcome === 'sold').length,
      lost: toInsert.filter((r) => r.rec.outcome === 'lost').length,
      skipped_rows: problems.filter((p) => p.skipped).length,
      already_imported: skippedDuplicates,
      problems: problems.slice(0, 500),
      problem_count: problems.length,
    };
    if (dryRun) return summary;

    transaction(db, () => {
      for (const { rec, comments } of toInsert) {
        const cols = Object.keys(rec);
        const id = Number(db.prepare(`INSERT INTO enquiries (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...cols.map((c) => rec[c])).lastInsertRowid);
        db.prepare("INSERT INTO activities (enquiry_id, user_id, type, body, local_date) VALUES (?, ?, 'created', 'Imported from spreadsheet', ?)").run(id, actor.id, today);
        for (const c of comments) db.prepare("INSERT INTO activities (enquiry_id, user_id, type, body, local_date) VALUES (?, ?, 'comment', ?, ?)").run(id, actor.id, c.slice(0, 4000), today);
      }
      db.prepare('INSERT INTO audit_log (user_id, action, entity, after_json) VALUES (?, ?, ?, ?)').run(
        actor.id,
        'import',
        'enquiry',
        JSON.stringify({ imported: toInsert.length, open: summary.open, sold: summary.sold, lost: summary.lost })
      );
    });
    uploads.delete(token);
    return { ...summary, imported: toInsert.length };
  }

  return { preview, run, FIELDS };
}

module.exports = { createImporter, fuzzyFind, parseDate };
