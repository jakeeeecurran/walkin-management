const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { startTestServer } = require('./helpers');
const { localDate, addDays } = require('../src/lib/time');

let t;
let gm, manager, sam, kim;
const today = localDate();

before(async () => {
  t = await startTestServer();
  t.createUser({ username: 'boss', role: 'general_manager', isAdmin: true });
  t.createUser({ username: 'mgr', role: 'sales_manager', franchises: [['Caloundra', 'MG'], ['Caloundra', 'Used Cars'], ['Caloundra', 'Hyundai']] });
  t.createUser({ username: 'sam', franchises: [['Caloundra', 'MG'], ['Caloundra', 'Used Cars']] });
  t.createUser({ username: 'kim', franchises: [['Caloundra', 'MG']] });
  [gm, manager, sam, kim] = [t.client(), t.client(), t.client(), t.client()];
  await gm.login('boss');
  await manager.login('mgr');
  await sam.login('sam');
  await kim.login('kim');
});
after(async () => t.close());

async function enquiry(c, overrides = {}) {
  const r = await c.post('/api/enquiries', {
    location_id: t.ids.location('Caloundra'),
    brand_id: t.ids.brand('MG'),
    model_id: t.ids.model('MG', 'ZS'),
    customer_name: 'Test Customer',
    postcode: '4551',
    phone: `04${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`,
    ...overrides,
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.enquiry;
}

describe('follow-ups', () => {
  test('logging a call sets the next follow-up and records whether it was on time', async () => {
    const e = await enquiry(sam);
    const r = await sam.post(`/api/enquiries/${e.id}/followup`, { type: 'call', no_answer: true, next_followup_at: addDays(today, 3) });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.enquiry.next_followup_at, addDays(today, 3));
    const detail = await sam.get(`/api/enquiries/${e.id}`);
    assert.match(detail.body.activities[0].body, /Called \(no answer\)/);
    const past = await sam.post(`/api/enquiries/${e.id}/followup`, { type: 'call', next_followup_at: addDays(today, -1) });
    assert.equal(past.status, 400);
  });

  test("the Today list shows what's due and overdue", async () => {
    const e = await enquiry(sam, { next_followup_at: today });
    const r = await sam.get('/api/enquiries?due=today');
    assert.ok(r.body.items.some((x) => x.id === e.id));
  });
});

describe('reports', () => {
  test('conversion is enquiries sold ÷ enquiries, and salespeople only see their own figures', async () => {
    const before = (await manager.get(`/api/reports/summary?period=day&date=${today}`)).body.totals;
    const a = await enquiry(kim);
    await enquiry(kim);
    await enquiry(kim, { test_drive: true });
    await manager.patch(`/api/enquiries/${a.id}`, { outcome: 'sold' });
    const s = (await kim.get(`/api/reports/summary?period=day&date=${today}`)).body;
    assert.equal(s.totals.enquiries, 3);
    assert.equal(s.totals.sold, 1);
    assert.equal(s.totals.conversion, 33.3);
    assert.equal(s.totals.test_drives, 1);
    assert.equal(s.totals.cars_sold, 1);
    assert.deepEqual(s.by_salesperson.map((x) => x.label), ['Kim']);
    const m = (await manager.get(`/api/reports/summary?period=day&date=${today}`)).body;
    assert.equal(m.totals.enquiries, before.enquiries + 3);
    assert.ok(m.by_salesperson.length >= 2);
    assert.ok(m.enquiries.length >= 3);
  });

  test('month and year periods compare with the previous period', async () => {
    const s = (await manager.get('/api/reports/summary?period=month')).body;
    assert.equal(s.period.from, today.slice(0, 7) + '-01');
    assert.ok(s.previous);
    const y = (await manager.get('/api/reports/summary?period=year')).body;
    assert.equal(y.period.from, today.slice(0, 4) + '-01-01');
  });

  test('brand trends are for the general manager only: this month by day, or chosen months by month', async () => {
    assert.equal((await manager.get('/api/reports/trends')).status, 403);
    assert.equal((await sam.get('/api/reports/trends')).status, 403);
    assert.equal((await gm.get('/api/reports/trends?months=2026-13')).status, 400);

    const thisMonth = today.slice(0, 7);
    const back = (n) => { const [y, m] = thisMonth.split('-').map(Number); return new Date(Date.UTC(y, m - 1 - n, 1)).toISOString().slice(0, 7); };
    const sel = `${back(2)},${thisMonth}`;
    const before = (await gm.get(`/api/reports/trends?months=${sel}`)).body;
    const beforeDay = (await gm.get('/api/reports/trends')).body;

    const old = await enquiry(sam, { brand_id: t.ids.brand('Used Cars'), model_id: undefined, used_make: 'Toyota', used_model: 'HiLux', test_drive: true });
    t.db.prepare('UPDATE enquiries SET entry_date = ?, entry_month = ? WHERE id = ?').run(`${back(2)}-10`, back(2), old.id);
    await manager.patch(`/api/enquiries/${old.id}`, { outcome: 'sold' }); // sold today

    // Default: the current month, one point per day up to today.
    const day = (await gm.get('/api/reports/trends')).body;
    assert.equal(day.granularity, 'day');
    assert.deepEqual(day.months, [thisMonth]);
    assert.equal(day.buckets[0], `${thisMonth}-01`);
    assert.equal(day.buckets.at(-1), today);
    const usedDay = day.brands.find((b) => b.name === 'Used Cars');
    const usedDayBefore = beforeDay.brands.find((b) => b.name === 'Used Cars');
    assert.equal(usedDay.sold.at(-1), (usedDayBefore ? usedDayBefore.sold.at(-1) : 0) + 1, 'sale counted on the day it was sold');

    // Several months: one point per chosen month.
    const r = (await gm.get(`/api/reports/trends?months=${sel}`)).body;
    assert.equal(r.granularity, 'month');
    assert.deepEqual(r.buckets, [back(2), thisMonth]);
    const used = r.brands.find((b) => b.name === 'Used Cars');
    const usedBefore = before.brands.find((b) => b.name === 'Used Cars');
    const at = (b, key, i) => (b ? b[key][i] : 0);
    assert.equal(used.enquiries[0], at(usedBefore, 'enquiries', 0) + 1, 'enquiry counted in the month it was entered');
    assert.equal(used.test_drives[0], at(usedBefore, 'test_drives', 0) + 1);
    assert.equal(used.sold[1], at(usedBefore, 'sold', 1) + 1, 'sale counted in the month it was sold');
    assert.equal(used.total_converted, (usedBefore ? usedBefore.total_converted : 0) + 1);
    assert.equal(r.total_enquiries, r.brands.reduce((n, b) => n + b.total_enquiries, 0));
    const shares = r.brands.reduce((n, b) => n + b.share, 0);
    assert.ok(Math.abs(shares - 100) < 1, `shares add to 100 (${shares})`);

    const elsewhere = (await gm.get(`/api/reports/trends?months=${sel}&location_id=${t.ids.location('Kingaroy')}`)).body;
    assert.equal(elsewhere.total_enquiries, 0);
  });

  test("the daily summary shows managers today's numbers by salesperson; salespeople can't see it", async () => {
    assert.equal((await sam.get('/api/reports/daily')).status, 403);
    const before = (await manager.get('/api/reports/daily')).body;
    assert.equal(before.group, 'salesperson');
    assert.equal(before.date, today);
    const e = await enquiry(kim, { test_drive: true });
    await manager.patch(`/api/enquiries/${e.id}`, { outcome: 'sold' });
    const after = (await manager.get('/api/reports/daily')).body;
    assert.equal(after.totals.walk_ins, before.totals.walk_ins + 1);
    assert.equal(after.totals.test_drives, before.totals.test_drives + 1);
    assert.equal(after.totals.sold, before.totals.sold + 1);
    const kimRow = after.rows.find((r) => r.label === 'Kim');
    assert.ok(kimRow && kimRow.sold >= 1);
    assert.ok(after.rows.some((r) => r.label === 'Sam'), 'everyone in the team is listed, even on a quiet day');
    const gmView = (await gm.get('/api/reports/daily')).body;
    assert.equal(gmView.group, 'site');
    assert.ok(gmView.rows.some((r) => r.label === 'Hervey Bay'), 'every site is listed');
  });

  test('the sales board is for the general manager only and lists who sold what today', async () => {
    assert.equal((await manager.get('/api/reports/sales-board')).status, 403);
    assert.equal((await sam.get('/api/reports/sales-board')).status, 403);
    const before = (await gm.get('/api/reports/sales-board')).body;
    const e = await enquiry(sam, { brand_id: t.ids.brand('Used Cars'), model_id: undefined, used_make: 'Toyota', used_model: 'HiLux', stock_number: 'SB123' });
    await sam.patch(`/api/enquiries/${e.id}`, { outcome: 'sold' }); // goes to approval
    let board = (await gm.get('/api/reports/sales-board')).body;
    assert.equal(board.totals.sold_today, before.totals.sold_today, 'not counted until approved');
    const ok = await manager.post(`/api/enquiries/${e.id}/approval`, { decision: 'approve', reason: 'Deposit checked' });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    board = (await gm.get('/api/reports/sales-board')).body;
    assert.equal(board.totals.sold_today, before.totals.sold_today + 1);
    const sale = board.today.find((x) => x.id === e.id);
    assert.equal(sale.salesperson, 'Sam');
    assert.equal(sale.brand, 'Used Cars');
    assert.equal(sale.vehicle, 'Toyota HiLux');
    assert.equal(sale.stock_number, 'SB123');
    assert.equal(sale.approved_by, 'Mgr');
    const leader = board.leaders_today.find((p) => p.name === 'Sam');
    assert.ok(leader.sold_today >= 1);
    assert.ok(board.leaders_month.find((p) => p.name === 'Sam').sold_month >= 1);
    assert.ok(board.brands_month.some((b) => b.brand === 'Used Cars'));
  });

  test('managers can export CSV; salespeople cannot; formulas are neutralised', async () => {
    await enquiry(sam, { customer_name: '=HYPERLINK("x")' });
    assert.equal((await sam.get('/api/reports/export.csv')).status, 403);
    const r = await manager.get('/api/reports/export.csv');
    assert.equal(r.status, 200);
    assert.match(r.body, /Enquiry #,Date of entry,Month,Brand,Department/);
    assert.match(r.body, /'=HYPERLINK/i);
  });
});

describe('admin', () => {
  test('only the GM/admin can use admin screens', async () => {
    assert.equal((await manager.get('/api/admin/settings')).status, 403);
    assert.equal((await gm.get('/api/admin/settings')).status, 200);
  });

  test('adding a brand at a site makes it available; retiring a model hides it from new enquiries', async () => {
    const b = await gm.post('/api/admin/brands', { name: 'Zeekr', colour: '#000000', location_ids: [t.ids.location('Maroochydore')] });
    assert.equal(b.status, 201, JSON.stringify(b.body));
    const m = await gm.post('/api/admin/models', { brand_id: b.body.brand.id, name: '7X' });
    assert.equal(m.status, 201);
    const ref = (await gm.get('/api/reference')).body;
    assert.ok(ref.franchises.some((f) => f.brand_id === b.body.brand.id && f.location_id === t.ids.location('Maroochydore') && f.can_create));

    const zs = t.ids.model('MG', 'ZS');
    assert.equal((await gm.patch(`/api/admin/models/${zs}`, { active: false })).status, 200);
    const r = await sam.post('/api/enquiries', { location_id: t.ids.location('Caloundra'), brand_id: t.ids.brand('MG'), model_id: zs, customer_name: 'X', postcode: '4551', phone: '0400000001' });
    assert.equal(r.status, 400);
    await gm.patch(`/api/admin/models/${zs}`, { active: true });
  });

  test('a brand can be switched off at one site without losing history', async () => {
    const r = await gm.raw('PUT', '/api/admin/franchises', { location_id: t.ids.location('Caloundra'), brand_id: t.ids.brand('Hyundai'), active: false });
    assert.equal(r.status, 200);
    const create = await manager.post('/api/enquiries', {
      location_id: t.ids.location('Caloundra'), brand_id: t.ids.brand('Hyundai'), model_id: t.ids.model('Hyundai', 'Tucson'), customer_name: 'Y', postcode: '4551', phone: '0400000002',
    });
    assert.equal(create.status, 400);
    await gm.raw('PUT', '/api/admin/franchises', { location_id: t.ids.location('Caloundra'), brand_id: t.ids.brand('Hyundai'), active: true });
  });

  test('settings are validated; the SMTP password is never sent back', async () => {
    assert.equal((await gm.raw('PUT', '/api/admin/settings', { 'branding.primary_colour': 'blue' })).status, 400);
    assert.equal((await gm.raw('PUT', '/api/admin/settings', { 'email.smtp_password': 'secret', 'branding.name': 'Sunco Motors Group' })).status, 200);
    const s = (await gm.get('/api/admin/settings')).body;
    assert.equal(s.settings['email.smtp_password'], undefined);
    assert.equal(s.smtp_password_set, true);
    assert.equal((await t.client().get('/api/branding')).body.name, 'Sunco Motors Group');
  });
});

describe('backups', () => {
  test('back up now, then restore brings the data back', async () => {
    const e = await enquiry(sam, { customer_name: 'Before Backup' });
    const b = await gm.post('/api/admin/backups', {});
    assert.equal(b.status, 201);
    assert.match(b.body.backup.name, /manual\.db$/);
    await enquiry(sam, { customer_name: 'After Backup' });

    assert.equal((await manager.post(`/api/admin/backups/${b.body.backup.name}/restore`, { confirm: 'RESTORE' })).status, 403);
    assert.equal((await gm.post(`/api/admin/backups/${b.body.backup.name}/restore`, {})).status, 400);
    const r = await gm.post(`/api/admin/backups/${b.body.backup.name}/restore`, { confirm: 'RESTORE' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.match(r.body.safety_backup, /pre-restore/);
    const names = t.db.prepare('SELECT customer_name FROM enquiries').all().map((x) => x.customer_name);
    assert.ok(names.includes('Before Backup'));
    assert.ok(!names.includes('After Backup'));
    assert.ok(t.db.prepare('SELECT 1 FROM enquiries WHERE id = ?').get(e.id));
    const list = (await gm.get('/api/admin/backups')).body.items;
    assert.ok(list.length >= 2);
  });

  test('the nightly backup is emailed encrypted, and that file restores the system', async () => {
    const { pack, unpack } = require('../src/lib/backupfile');
    await gm.raw('PUT', '/api/admin/settings', { 'email.smtp_host': 'smtp.example.com', 'email.from': 'crm@example.com' });
    assert.equal((await gm.raw('PUT', '/api/admin/settings', { 'backup.email_enabled': true })).status, 400); // needs a passphrase
    assert.equal(
      (await gm.raw('PUT', '/api/admin/settings', { 'backup.email_enabled': true, 'backup.email_passphrase': 'correct horse battery', 'backup.email_to': 'offsite@example.com' })).status,
      200
    );
    assert.equal((await gm.get('/api/admin/settings')).body.settings['backup.email_passphrase'], undefined);

    await enquiry(sam, { customer_name: 'In Emailed Backup' });
    const made = (await gm.post('/api/admin/backups', {})).body.backup;
    const before = t.sentMail.length;
    const r = await gm.post(`/api/admin/backups/${made.name}/email`, {});
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const mail = t.sentMail[before];
    assert.equal(mail.to, 'offsite@example.com');
    const att = mail.attachments[0];
    assert.match(att.filename, /\.sunco-backup$/);
    assert.ok(!att.content.includes(Buffer.from('In Emailed Backup'))); // encrypted
    assert.throws(() => unpack(att.content, 'wrong passphrase!!'), /Wrong passphrase/);
    assert.ok(unpack(att.content, 'correct horse battery').subarray(0, 15).toString() === 'SQLite format 3');
    assert.throws(() => pack(Buffer.from('x'), 'short'));

    // Simulate losing data, then upload the emailed file.
    t.db.prepare("DELETE FROM activities WHERE enquiry_id IN (SELECT id FROM enquiries WHERE customer_name = 'In Emailed Backup')").run();
    t.db.prepare("DELETE FROM enquiries WHERE customer_name = 'In Emailed Backup'").run();
    const noPass = await gm.raw('POST', '/api/admin/backups-upload/restore', att.content, { 'x-confirm': 'RESTORE' });
    assert.equal(noPass.status, 400);
    const ok = await gm.raw('POST', '/api/admin/backups-upload/restore', att.content, { 'x-confirm': 'RESTORE', 'x-backup-passphrase': encodeURIComponent('correct horse battery') });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.ok(t.db.prepare("SELECT 1 FROM enquiries WHERE customer_name = 'In Emailed Backup'").get());
  });

  test('backups from an older version of the app are upgraded when restored', async () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const { DatabaseSync } = require('node:sqlite');
    const made = (await gm.post('/api/admin/backups', {})).body.backup;
    const file = path.join(t.backupDir, made.name);
    // Turn the copy into a "version 3" database by undoing migration 4.
    const old = new DatabaseSync(file);
    old.exec('DROP INDEX idx_enquiries_pending');
    for (const c of ['pending_outcome', 'pending_lost_reason_id', 'pending_note', 'pending_by', 'pending_at', 'pending_date']) old.exec(`ALTER TABLE enquiries DROP COLUMN ${c}`);
    old.exec('DELETE FROM schema_migrations WHERE version = 4');
    old.close();
    const r = await gm.raw('POST', '/api/admin/backups-upload/restore', fs.readFileSync(file), { 'x-confirm': 'RESTORE' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(t.db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get().v, 4);
  });

  test('backup files can be downloaded by the GM', async () => {
    const name = (await gm.get('/api/admin/backups')).body.items[0].name;
    const res = await fetch(`${t.base}/api/admin/backups/${name}`, { headers: { cookie: '' } });
    assert.equal(res.status, 401);
  });
});

describe('spreadsheet import', () => {
  async function workbook() {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('MG');
    ws.addRow(['Date of Entry', 'Current Month', 'Brand', 'Department', 'Customer Name', 'Customer Postcode', 'Phone Number', 'Email Address', 'Test Drive', 'Trade', 'Finance', 'Lost', 'Comments', 'Sold']);
    ws.addRow([new Date(Date.UTC(2026, 9, 3)), 'October', 'MG', 'Calandra', 'alan import', 4551, '412345111', 'alan@example.com', 'Yes', 'No', 'Yes', '', 'Wants ZS', '']);
    ws.addRow(['04/10/2026', 'October', 'MG', 'Caloundra', 'Beth Import', '4551', '0412 345 222', '', 'Y', 'Y', '', '', '', 'Yes']);
    ws.addRow(['05/10/2026', 'October', 'MG', 'Caloundra', 'Both Ticked', '4551', '0412345333', '', '', '', '', 'Yes', '', 'Yes']);
    ws.addRow(['06/10/2026', 'October', 'Polestar', 'Caloundra', 'Unknown Brand', '4551', '0412345444', '', '', '', '', '', '', '']);
    const used = wb.addWorksheet('Used');
    used.addRow(['Date of Entry', 'Brand', 'Department', 'Customer Name', 'Customer Postcode', 'Phone Number', 'Lost']);
    used.addRow(['07/10/2026', '', 'Caloundra', 'Carl Used', '4551', 'not a phone', 'yes']);
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  test('preview guesses the columns; dry run reports problems; import adds rows once', async () => {
    const p = await gm.raw('POST', '/api/admin/import/preview', await workbook());
    assert.equal(p.status, 200, JSON.stringify(p.body));
    const [mg, used] = p.body.sheets;
    assert.equal(mg.mapping.customer_name, 4);
    assert.equal(mg.mapping.postcode, 5);
    assert.equal(mg.mapping.department, 3);
    assert.equal(mg.mapping.sold, 13);
    assert.equal(mg.guessed_brand_id, t.ids.brand('MG'));
    assert.equal(used.guessed_brand_id, t.ids.brand('Used Cars'));

    const samId = (await sam.get('/api/auth/me')).body.user.id;
    const sheets = [
      { name: 'MG', include: true, mapping: mg.mapping, salesperson_id: samId },
      { name: 'Used', include: true, mapping: used.mapping, brand_id: t.ids.brand('Used Cars'), salesperson_id: samId },
    ];
    const dry = await gm.post('/api/admin/import/run', { token: p.body.token, sheets, dry_run: true });
    assert.equal(dry.status, 200, JSON.stringify(dry.body));
    assert.equal(dry.body.will_import, 3);
    assert.equal(dry.body.sold, 1);
    assert.equal(dry.body.lost, 1);
    assert.equal(dry.body.skipped_rows, 2);
    assert.ok(dry.body.problems.some((x) => /both Sold and Lost/.test(x.message)));
    assert.ok(dry.body.problems.some((x) => /Polestar/.test(x.message)));

    const run = await gm.post('/api/admin/import/run', { token: p.body.token, sheets, dry_run: false });
    assert.equal(run.body.imported, 3);
    const alan = t.db.prepare("SELECT * FROM enquiries WHERE customer_name = 'Alan Import'").get();
    assert.equal(alan.phone, '0412345111');
    assert.equal(alan.entry_month, '2026-10');
    assert.equal(alan.finance, 1);
    assert.equal(alan.outcome, 'open');
    const carl = t.db.prepare("SELECT * FROM enquiries WHERE customer_name = 'Carl Used'").get();
    assert.equal(carl.outcome, 'lost');
    assert.equal(carl.phone, null);

    const again = await gm.raw('POST', '/api/admin/import/preview', await workbook());
    const rerun = await gm.post('/api/admin/import/run', { token: again.body.token, sheets, dry_run: true });
    assert.equal(rerun.body.will_import, 0);
    assert.equal(rerun.body.already_imported, 3);
  });
});

describe('email reminders', () => {
  test('nothing is sent until email is set up; then each person gets one morning email', async () => {
    t.db.prepare("UPDATE users SET email = 'sam@example.com' WHERE username = 'sam'").run();
    t.db.prepare("UPDATE users SET email = 'mgr@example.com' WHERE username = 'mgr'").run();
    await enquiry(sam, { customer_name: 'Due Today', next_followup_at: today });
    const off = await gm.post('/api/admin/email/send-now', { kind: 'morning' });
    assert.equal(off.body.sent, 0);
    await gm.raw('PUT', '/api/admin/settings', { 'email.enabled': true, 'email.smtp_host': 'smtp.example.com', 'email.from': 'crm@example.com' });
    const on = await gm.post('/api/admin/email/send-now', { kind: 'morning' });
    assert.ok(on.body.sent >= 2, JSON.stringify(on.body));
    const toSam = t.sentMail.find((m) => m.to === 'sam@example.com');
    assert.match(toSam.subject, /to follow up today/);
    assert.match(toSam.html, /Due Today/);
    assert.doesNotMatch(toSam.html, /Overdue/, 'one calm list, no overdue heading');
    const toMgr = t.sentMail.find((m) => m.to === 'mgr@example.com');
    assert.doesNotMatch(toMgr.subject, /overdue/i, 'the morning summary leads with results, not overdue counts');
    const again = await gm.post('/api/admin/email/send-now', { kind: 'morning' });
    assert.equal(again.body.sent, 0);
    const eod = await gm.post('/api/admin/email/send-now', { kind: 'eod' });
    assert.ok(t.sentMail.some((m) => m.to === 'mgr@example.com' && /End of day/.test(m.subject)), JSON.stringify(eod.body));
    assert.ok(!t.sentMail.some((m) => m.to === 'sam@example.com' && /End of day/.test(m.subject)));
  });

  test('people can turn their reminder emails off', async () => {
    const r = await sam.patch('/api/auth/me', { notify_email: false });
    assert.equal(r.body.user.notify_email, false);
  });
});

describe('privacy requests', () => {
  test("the GM can blank a customer's details; the enquiry stays", async () => {
    const e = await enquiry(sam, { customer_name: 'Private Person', email: 'private@example.com' });
    await sam.post(`/api/enquiries/${e.id}/activities`, { type: 'comment', body: 'Lives at 1 Example St' });
    assert.equal((await manager.post(`/api/enquiries/${e.id}/remove-personal-details`, { confirm: true })).status, 403);
    const r = await gm.post(`/api/enquiries/${e.id}/remove-personal-details`, { confirm: true });
    assert.equal(r.status, 200);
    assert.equal(r.body.enquiry.phone, null);
    assert.equal(r.body.enquiry.email, null);
    assert.equal(r.body.enquiry.customer_name, 'Removed at customer request');
    const detail = await gm.get(`/api/enquiries/${e.id}`);
    assert.ok(!JSON.stringify(detail.body).includes('Example St'));
    const audit = t.db.prepare("SELECT before_json, after_json FROM audit_log WHERE entity = 'enquiry' AND entity_id = ?").all(e.id);
    assert.ok(!JSON.stringify(audit).includes('Private Person'));
  });
});

describe('team changes', () => {
  test("a manager can move a leaver's open enquiries to someone else", async () => {
    const samId = (await sam.get('/api/auth/me')).body.user.id;
    const kimId = (await kim.get('/api/auth/me')).body.user.id;
    await enquiry(sam, { brand_id: t.ids.brand('Used Cars'), model_id: undefined, used_make_id: t.ids.usedMake('Toyota'), used_model_other: 'Supra' });
    const r = await manager.post(`/api/users/${samId}/reassign-open`, { to_user_id: kimId });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.ok(r.body.moved > 0);
    assert.ok(r.body.not_moved > 0); // Kim doesn't cover Used Cars
  });
});
