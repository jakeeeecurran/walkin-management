const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer } = require('./helpers');
const v = require('../src/lib/validate');

let t;
before(async () => {
  t = await startTestServer();
});
after(async () => {
  await t.close();
});

function newEnquiry(overrides = {}) {
  return {
    location_id: t.ids.location('Caloundra'),
    brand_id: t.ids.brand('MG'),
    model_id: t.ids.model('MG', 'ZS'),
    customer_name: 'jane citizen',
    postcode: '4551',
    phone: '+61 412 345 678',
    test_drive: true,
    ...overrides,
  };
}

describe('seed data', () => {
  test('loads 4 locations, 21 brands and 33 brand-location combinations', () => {
    const count = (table) => t.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
    assert.equal(count('locations'), 4);
    assert.equal(count('brands'), 21);
    assert.equal(count('franchises'), 33);
    const caloundra = t.db
      .prepare('SELECT b.name FROM franchises f JOIN brands b ON b.id = f.brand_id JOIN locations l ON l.id = f.location_id WHERE l.name = ? ORDER BY b.name')
      .all('Caloundra')
      .map((r) => r.name)
      .sort((a, b) => a.localeCompare(b));
    assert.deepEqual(caloundra, ['Chery', 'GAC', 'Hyundai', 'Jeep', 'JMC', 'LDV', 'Leapmotor', 'MG', 'Nissan', 'Used Cars']);
  });

  test('every non-used brand has models', () => {
    const empty = t.db.prepare('SELECT b.name FROM brands b WHERE b.is_used = 0 AND NOT EXISTS (SELECT 1 FROM models m WHERE m.brand_id = b.id)').all();
    assert.deepEqual(empty, []);
  });
});

describe('validation helpers', () => {
  test('normalises Australian phone numbers', () => {
    assert.equal(v.phone('+61 412 345 678'), '0412345678');
    assert.equal(v.phone('(07) 5491 1234'), '0754911234');
    assert.equal(v.formatPhone('0412345678'), '0412 345 678');
    assert.throws(() => v.phone('12345'));
  });
  test('checks postcodes and capitalises names', () => {
    assert.equal(v.postcode(' 4551 '), '4551');
    assert.throws(() => v.postcode('455'));
    assert.throws(() => v.postcode('0500'));
    assert.equal(v.personName('jOHN'), 'jOHN');
    assert.equal(v.personName('mary-jane o\'brien'), "Mary-Jane O'Brien");
    assert.equal(v.personName('JOHN SMITH'), 'John Smith');
  });
});

describe('sign-in', () => {
  test('rejects a wrong password and accepts the right one', async () => {
    t.createUser({ username: 'signin.user' });
    const c = t.client();
    assert.equal((await c.post('/api/auth/login', { username: 'signin.user', password: 'wrong-password' })).status, 401);
    assert.equal((await c.get('/api/auth/me')).status, 401);
    await c.login('signin.user');
    const me = await c.get('/api/auth/me');
    assert.equal(me.status, 200);
    assert.equal(me.body.user.username, 'signin.user');
    assert.equal(me.body.user.password_hash, undefined);
  });

  test('a temporary password must be changed before anything else', async () => {
    t.createUser({ username: 'temp.user', mustChange: true, franchises: [['Caloundra', 'MG']] });
    const c = t.client();
    await c.login('temp.user');
    assert.equal((await c.get('/api/enquiries')).status, 403);
    const r = await c.post('/api/auth/change-password', { current_password: t.PASSWORD, new_password: 'a-brand-new-password' });
    assert.equal(r.status, 200);
    assert.equal((await c.get('/api/enquiries')).status, 200);
  });

  test('changes that need data must be JSON from the same site', async () => {
    const c = t.client();
    const form = await c.raw('POST', '/api/auth/logout', undefined, { 'content-type': 'application/x-www-form-urlencoded' });
    assert.equal(form.status, 415);
    const cross = await c.raw('POST', '/api/auth/logout', {}, { origin: 'https://evil.example' });
    assert.equal(cross.status, 403);
  });
});

describe('permissions by brand and site', () => {
  let alice, bob, calManager, hbManager, gm;
  let aliceEnquiry, bobEnquiry;

  before(async () => {
    t.createUser({ username: 'alice', franchises: [['Caloundra', 'MG'], ['Caloundra', 'Used Cars']] });
    t.createUser({ username: 'bob', franchises: [['Caloundra', 'MG']] });
    t.createUser({
      username: 'cal.manager',
      role: 'sales_manager',
      franchises: [['Caloundra', 'MG'], ['Caloundra', 'LDV'], ['Caloundra', 'Used Cars']],
    });
    t.createUser({ username: 'hb.manager', role: 'sales_manager', franchises: [['Hervey Bay', 'Kia']] });
    t.createUser({ username: 'the.gm', role: 'general_manager' });
    [alice, bob, calManager, hbManager, gm] = [t.client(), t.client(), t.client(), t.client(), t.client()];
    await alice.login('alice');
    await bob.login('bob');
    await calManager.login('cal.manager');
    await hbManager.login('hb.manager');
    await gm.login('the.gm');

    const a = await alice.post('/api/enquiries', newEnquiry());
    assert.equal(a.status, 201, JSON.stringify(a.body));
    aliceEnquiry = a.body.enquiry;
    const b = await bob.post('/api/enquiries', newEnquiry({ customer_name: 'Bob Customer', phone: '0423456789' }));
    assert.equal(b.status, 201, JSON.stringify(b.body));
    bobEnquiry = b.body.enquiry;
  });

  test('new enquiry fills in salesperson, date, month, follow-up and tidies the input', () => {
    assert.equal(aliceEnquiry.customer_name, 'Jane Citizen');
    assert.equal(aliceEnquiry.phone, '0412345678');
    assert.equal(aliceEnquiry.phone_display, '0412 345 678');
    assert.equal(aliceEnquiry.salesperson, 'Alice');
    assert.equal(aliceEnquiry.location, 'Caloundra');
    assert.equal(aliceEnquiry.brand, 'MG');
    assert.equal(aliceEnquiry.vehicle, 'ZS');
    assert.equal(aliceEnquiry.outcome, 'open');
    assert.equal(aliceEnquiry.source, 'Walk-in');
    assert.equal(aliceEnquiry.test_drive, true);
    assert.equal(aliceEnquiry.entry_month, aliceEnquiry.entry_date.slice(0, 7));
    assert.ok(aliceEnquiry.next_followup_at > aliceEnquiry.entry_date);
  });

  test('a salesperson only sees their own enquiries', async () => {
    const list = await alice.get('/api/enquiries');
    assert.deepEqual(list.body.items.map((e) => e.id), [aliceEnquiry.id]);
    assert.equal((await alice.get(`/api/enquiries/${bobEnquiry.id}`)).status, 404);
    assert.equal((await alice.patch(`/api/enquiries/${bobEnquiry.id}`, { test_drive: true })).status, 404);
  });

  test('a salesperson cannot log enquiries for a brand or site they are not assigned to', async () => {
    const otherSite = await alice.post('/api/enquiries', newEnquiry({ location_id: t.ids.location('Maroochydore') }));
    assert.equal(otherSite.status, 400);
    assert.equal(otherSite.body.field, 'brand_id');
    const otherBrand = await alice.post('/api/enquiries', newEnquiry({ brand_id: t.ids.brand('LDV'), model_id: t.ids.model('LDV', 'D90') }));
    assert.equal(otherBrand.status, 400);
    const notSold = await alice.post('/api/enquiries', newEnquiry({ brand_id: t.ids.brand('Audi'), model_id: t.ids.model('Audi', 'Q5') }));
    assert.equal(notSold.status, 400);
    assert.match(notSold.body.error, /not sold at that location/);
  });

  test('a salesperson cannot assign an enquiry to someone else', async () => {
    const me = await bob.get('/api/auth/me');
    const r = await alice.patch(`/api/enquiries/${aliceEnquiry.id}`, { salesperson_id: me.body.user.id });
    assert.equal(r.status, 403);
  });

  test('a sales manager sees every enquiry in their brands and sites, and nothing else', async () => {
    const cal = await calManager.get('/api/enquiries');
    assert.deepEqual(cal.body.items.map((e) => e.id).sort(), [aliceEnquiry.id, bobEnquiry.id].sort());
    const hb = await hbManager.get('/api/enquiries');
    assert.equal(hb.body.total, 0);
    assert.equal((await hbManager.get(`/api/enquiries/${aliceEnquiry.id}`)).status, 404);
  });

  test('the general manager sees everything', async () => {
    const all = await gm.get('/api/enquiries');
    assert.ok(all.body.items.some((e) => e.id === aliceEnquiry.id));
    assert.ok(all.body.items.some((e) => e.id === bobEnquiry.id));
  });

  test('a manager can reassign within their team, but not to someone outside that brand/site', async () => {
    const bobId = (await bob.get('/api/auth/me')).body.user.id;
    const r = await calManager.patch(`/api/enquiries/${aliceEnquiry.id}`, { salesperson_id: bobId });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.enquiry.salesperson, 'Bob');
    const hbId = (await hbManager.get('/api/auth/me')).body.user.id;
    const bad = await calManager.patch(`/api/enquiries/${aliceEnquiry.id}`, { salesperson_id: hbId });
    assert.equal(bad.status, 400);
    // Alice no longer sees it; give it back.
    assert.equal((await alice.get(`/api/enquiries/${aliceEnquiry.id}`)).status, 404);
    const aliceId = (await alice.get('/api/auth/me')).body.user.id;
    assert.equal((await calManager.patch(`/api/enquiries/${aliceEnquiry.id}`, { salesperson_id: aliceId })).status, 200);
    const detail = await alice.get(`/api/enquiries/${aliceEnquiry.id}`);
    assert.ok(detail.body.activities.some((a) => a.type === 'reassigned'));
  });

  test('the model must belong to the chosen brand', async () => {
    const r = await alice.post('/api/enquiries', newEnquiry({ model_id: t.ids.model('Hyundai', 'Tucson') }));
    assert.equal(r.status, 400);
    assert.equal(r.body.field, 'model_id');
  });

  test('a phone number or email is required, and both are checked', async () => {
    const none = await alice.post('/api/enquiries', newEnquiry({ phone: '' }));
    assert.equal(none.status, 400);
    const badEmail = await alice.post('/api/enquiries', newEnquiry({ phone: '', email: 'not-an-email' }));
    assert.equal(badEmail.body.field, 'email');
    const badPostcode = await alice.post('/api/enquiries', newEnquiry({ postcode: 'ABCD' }));
    assert.equal(badPostcode.body.field, 'postcode');
  });

  test('lost needs a reason; sold and lost close the enquiry; only managers can re-open', async () => {
    const created = (await alice.post('/api/enquiries', newEnquiry({ customer_name: 'Outcome Test', phone: '0498765432' }))).body.enquiry;
    const noReason = await alice.patch(`/api/enquiries/${created.id}`, { outcome: 'lost' });
    assert.equal(noReason.body.field, 'lost_reason_id');
    const lost = await alice.patch(`/api/enquiries/${created.id}`, { outcome: 'lost', lost_reason_id: t.ids.lookup('lost_reason', 'Price') });
    assert.equal(lost.status, 200);
    assert.equal(lost.body.enquiry.lost_reason, 'Price');
    assert.equal(lost.body.enquiry.next_followup_at, null);
    assert.equal((await alice.patch(`/api/enquiries/${created.id}`, { outcome: 'sold' })).status, 403);
    const sold = await calManager.patch(`/api/enquiries/${created.id}`, { outcome: 'sold' });
    assert.equal(sold.status, 200);
    assert.ok(sold.body.enquiry.sold_at);
    const reopened = await calManager.patch(`/api/enquiries/${created.id}`, { outcome: 'open' });
    assert.equal(reopened.status, 400);
    assert.equal(reopened.body.field, 'next_followup_at');
  });

  test('only managers can back-date the date of entry', async () => {
    assert.equal((await alice.post('/api/enquiries', newEnquiry({ entry_date: '2026-01-15', phone: '0411111111' }))).status, 403);
    const r = await calManager.post('/api/enquiries', newEnquiry({ entry_date: '2026-01-15', phone: '0411111112' }));
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.enquiry.entry_month, '2026-01');
  });

  test('used cars take a make, a model and an optional stock number', async () => {
    const used = { brand_id: t.ids.brand('Used Cars'), model_id: undefined, phone: '0422222222' };
    const noMake = await alice.post('/api/enquiries', newEnquiry(used));
    assert.equal(noMake.body.field, 'used_make_id');
    const r = await alice.post(
      '/api/enquiries',
      newEnquiry({ ...used, used_make_id: t.ids.usedMake('Toyota'), used_extra_model_id: t.ids.usedModel('Toyota', 'HiLux'), stock_number: 'u 12345' })
    );
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.enquiry.vehicle, 'Toyota HiLux');
    assert.equal(r.body.enquiry.stock_number, 'U12345');
    // A make linked to a new-car brand reuses that brand's models.
    const linked = await alice.post(
      '/api/enquiries',
      newEnquiry({ ...used, phone: '0433333333', used_make_id: t.ids.usedMake('Nissan'), used_model_id: t.ids.model('Nissan', 'X-Trail') })
    );
    assert.equal(linked.status, 201, JSON.stringify(linked.body));
    assert.equal(linked.body.enquiry.vehicle, 'Nissan X-Trail');
    const wrong = await alice.post(
      '/api/enquiries',
      newEnquiry({ ...used, phone: '0433333334', used_make_id: t.ids.usedMake('Toyota'), used_model_id: t.ids.model('Nissan', 'X-Trail') })
    );
    assert.equal(wrong.status, 400);
    const found = await alice.get('/api/enquiries?q=u123');
    assert.equal(found.body.total, 1);
  });

  test('used car make and model can be typed; typos match existing names and new ones are added', async () => {
    const used = { brand_id: t.ids.brand('Used Cars'), model_id: undefined };
    const a = await alice.post('/api/enquiries', newEnquiry({ ...used, phone: '0455000001', used_make: 'hodna', used_model: 'civic', stock_number: 'u777' }));
    assert.equal(a.status, 201, JSON.stringify(a.body));
    assert.equal(a.body.enquiry.vehicle, 'Honda Civic');
    const b = await alice.post('/api/enquiries', newEnquiry({ ...used, phone: '0455000002', used_make: 'toyota', used_model: 'rav4' }));
    assert.equal(b.body.enquiry.vehicle, 'Toyota RAV4');
    const c = await alice.post('/api/enquiries', newEnquiry({ ...used, phone: '0455000003', used_make: 'cupra', used_model: 'formentor' }));
    assert.equal(c.status, 201);
    assert.equal(c.body.enquiry.vehicle, 'Cupra Formentor');
    assert.ok(t.db.prepare("SELECT 1 FROM used_makes WHERE name = 'Cupra'").get());
    const again = await alice.post('/api/enquiries', newEnquiry({ ...used, phone: '0455000004', used_make: 'Cupra', used_model: 'Formentor' }));
    assert.equal(again.body.enquiry.used_make_id, c.body.enquiry.used_make_id);
    assert.equal(t.db.prepare("SELECT COUNT(*) AS n FROM used_models WHERE name = 'Formentor'").get().n, 1);
    const noModel = await alice.post('/api/enquiries', newEnquiry({ ...used, phone: '0455000005', used_make: 'Mazda' }));
    assert.equal(noModel.status, 400);
    assert.equal(noModel.body.field, 'used_model_id');
    // A failed save doesn't leave a new make behind.
    const bad = await alice.post('/api/enquiries', newEnquiry({ ...used, phone: 'nope', used_make: 'Zzyzx Motors', used_model: 'One' }));
    assert.equal(bad.status, 400);
    assert.equal(t.db.prepare("SELECT 1 FROM used_makes WHERE name = 'Zzyzx Motors'").get(), undefined);
  });

  test('duplicate check finds open enquiries with the same phone across the dealership', async () => {
    const r = await hbManager.get('/api/enquiries/duplicates?phone=0412%20345%20678');
    assert.equal(r.body.matches.length, 1);
    assert.equal(r.body.matches[0].salesperson, 'Alice');
    assert.equal(r.body.matches[0].can_view, false);
    assert.equal(r.body.matches[0].id, null);
  });

  test('enquiries can be marked invalid by a manager, never deleted', async () => {
    assert.equal((await alice.post(`/api/enquiries/${bobEnquiry.id}/invalid`, { reason: 'dup' })).status, 404);
    assert.equal((await bob.post(`/api/enquiries/${bobEnquiry.id}/invalid`, { reason: 'dup' })).status, 403);
    const r = await calManager.post(`/api/enquiries/${bobEnquiry.id}/invalid`, { reason: 'Duplicate of Jane' });
    assert.equal(r.status, 200);
    assert.equal((await bob.get('/api/enquiries')).body.items.some((e) => e.id === bobEnquiry.id), false);
    assert.equal((await calManager.get('/api/enquiries?include_invalid=1')).body.items.some((e) => e.id === bobEnquiry.id), true);
    const del = await calManager.raw('DELETE', `/api/enquiries/${bobEnquiry.id}`, {});
    assert.equal(del.status, 404);
    assert.ok(t.db.prepare('SELECT 1 FROM enquiries WHERE id = ?').get(bobEnquiry.id));
  });

  test('reference lists only show the brands and sites a user works in', async () => {
    const ref = (await alice.get('/api/reference')).body;
    assert.deepEqual(ref.locations.map((l) => l.name), ['Caloundra']);
    assert.deepEqual(ref.brands.map((b) => b.name).sort(), ['MG', 'Used Cars']);
    assert.ok(ref.models.every((m) => m.brand_id === t.ids.brand('MG')));
    const all = (await gm.get('/api/reference')).body;
    assert.equal(all.franchises.length, 33);
  });

  test('every change is written to the audit log', () => {
    const n = t.db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE entity = 'enquiry' AND entity_id = ?").get(aliceEnquiry.id).n;
    assert.ok(n >= 3);
  });
});

describe('managing users', () => {
  let gm, manager;
  before(async () => {
    t.createUser({ username: 'admin.gm', role: 'general_manager', isAdmin: true });
    t.createUser({ username: 'kin.manager', role: 'sales_manager', franchises: [['Kingaroy', 'Ford'], ['Kingaroy', 'GWM']] });
    gm = t.client();
    manager = t.client();
    await gm.login('admin.gm');
    await manager.login('kin.manager');
  });

  test('a sales manager can add salespeople only in their own brands and sites', async () => {
    const ok = await manager.post('/api/users', {
      name: 'Kim Seller',
      username: 'kim.seller',
      franchise_ids: [t.ids.franchise('Kingaroy', 'Ford')],
    });
    assert.equal(ok.status, 201, JSON.stringify(ok.body));
    assert.equal(ok.body.user.role, 'salesperson');
    assert.ok(ok.body.temporary_password.length >= 12);
    assert.equal(ok.body.user.must_change_password, true);

    const outside = await manager.post('/api/users', { name: 'X', username: 'x.seller', franchise_ids: [t.ids.franchise('Caloundra', 'MG')] });
    assert.equal(outside.status, 400);
    const asManager = await manager.post('/api/users', {
      name: 'Y',
      username: 'y.manager',
      role: 'sales_manager',
      franchise_ids: [t.ids.franchise('Kingaroy', 'Ford')],
    });
    assert.equal(asManager.status, 400);
  });

  test('a sales manager cannot remove brands outside their own scope', async () => {
    const id = t.createUser({ username: 'split.seller', franchises: [['Kingaroy', 'Ford'], ['Caloundra', 'MG']] });
    const r = await manager.patch(`/api/users/${id}`, { franchise_ids: [t.ids.franchise('Kingaroy', 'GWM')] });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const names = r.body.user.franchises.map((f) => `${f.location} ${f.brand}`).sort();
    assert.deepEqual(names, ['Caloundra MG', 'Kingaroy GWM']);
  });

  test('the GM can add and remove sales managers and assign their brands', async () => {
    const r = await gm.post('/api/users', {
      name: 'Hervey Manager',
      username: 'hervey.manager2',
      role: 'sales_manager',
      home_location_id: t.ids.location('Hervey Bay'),
      franchise_ids: [t.ids.franchise('Hervey Bay', 'Kia'), t.ids.franchise('Hervey Bay', 'Honda')],
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const id = r.body.user.id;
    const disabled = await gm.patch(`/api/users/${id}`, { active: false });
    assert.equal(disabled.body.user.active, false);
  });

  test('disabling a user signs them out straight away', async () => {
    const id = t.createUser({ username: 'leaving.seller', franchises: [['Kingaroy', 'Ford']] });
    const c = t.client();
    await c.login('leaving.seller');
    assert.equal((await c.get('/api/enquiries')).status, 200);
    assert.equal((await manager.patch(`/api/users/${id}`, { active: false })).status, 200);
    assert.equal((await c.get('/api/enquiries')).status, 401);
  });

  test('salespeople cannot manage users; nobody can lock themselves out', async () => {
    const s = t.client();
    await s.login('kim.seller', t.PASSWORD).catch(() => {});
    t.createUser({ username: 'plain.seller', franchises: [['Kingaroy', 'Ford']] });
    const p = t.client();
    await p.login('plain.seller');
    assert.equal((await p.get('/api/users')).status, 403);
    const meId = (await gm.get('/api/auth/me')).body.user.id;
    assert.equal((await gm.patch(`/api/users/${meId}`, { active: false })).status, 403);
    assert.equal((await gm.patch(`/api/users/${meId}`, { role: 'salesperson' })).status, 403);
  });

  test('only an admin can create another admin', async () => {
    t.createUser({ username: 'non.admin.gm', role: 'general_manager' });
    const c = t.client();
    await c.login('non.admin.gm');
    const r = await c.post('/api/users', { name: 'Z', username: 'z.admin', role: 'general_manager', is_admin: true });
    assert.equal(r.status, 403);
  });

  test('a password reset issues a temporary password and signs the user out', async () => {
    const id = t.createUser({ username: 'forgetful', franchises: [['Kingaroy', 'GWM']] });
    const c = t.client();
    await c.login('forgetful');
    const r = await manager.post(`/api/users/${id}/reset-password`);
    assert.equal(r.status, 200);
    assert.equal((await c.get('/api/auth/me')).status, 401);
    await c.login('forgetful', r.body.temporary_password);
    assert.equal((await c.get('/api/auth/me')).body.user.must_change_password, true);
  });
});
