// Builds the single-page trial version: the real app screens plus demo/demo-api.js and demo data.
//   node demo/build.js <demo-data.json> <output.html>
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const [dataFile, outFile] = process.argv.slice(2);
if (!dataFile || !outFile) throw new Error('Usage: node demo/build.js <demo-data.json> <output.html>');

const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const html = read('public/index.html');
const body = html
  .slice(html.indexOf('<body>') + 6, html.indexOf('</body>'))
  .replace(/<script[\s\S]*?<\/script>/g, '')
  .trim();
const safe = (js) => js.replace(/<\/(script)/gi, '<\\/$1');
const scripts = ['public/js/theme-boot.js', 'public/js/core.js', 'demo/demo-api.js', 'public/js/enquiries.js', 'public/js/trends.js', 'public/js/reports.js', 'public/js/admin.js', 'public/js/board.js', 'public/js/help.js', 'public/js/main.js'];
// Sunco branding (the logo is embedded, as the trial page can't load other files) and a few
// sold/lost requests waiting for approval, so the approval step can be tried straight away.
const demo = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
demo.settings['branding.logo_url'] = 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'public', 'sunco-logo.png')).toString('base64');
demo.settings['branding.primary_colour'] = '#D81E05';
demo.settings['branding.accent_colour'] = '#F7A21B';
const userId = (u) => demo.users.find((x) => x.username === u)?.id;
const lostReason = demo.lookup_values.find((x) => x.list_type === 'lost_reason' && x.label === 'Bought elsewhere')?.id;
const requests = [
  ['demo.sales', 'sold', null, 'Deposit paid, delivery Friday'],
  ['demo.tom', 'lost', lostReason, 'Went with a competitor on price'],
  ['demo.priya', 'sold', null, 'Finance approved this morning'],
];
for (const [user, outcome, reason, note] of requests) {
  const e = demo.enquiries.find((x) => x.salesperson_id === userId(user) && x.outcome === 'open' && !x.pending_outcome && x.entry_date < demo.today);
  if (!e) continue;
  Object.assign(e, { pending_outcome: outcome, pending_lost_reason_id: reason, pending_note: note, pending_by: e.salesperson_id, pending_at: demo.today + 'T01:30:00.000Z', pending_date: demo.today });
  demo.activities.push({ id: Math.max(...demo.activities.map((a) => a.id)) + 1, enquiry_id: e.id, user_id: e.salesperson_id, type: 'approval_requested', body: `${outcome === 'sold' ? 'Marked as sold' : 'Marked as lost (Bought elsewhere)'}. Waiting for sales manager approval. Note: ${note}`, followup_due: null, local_date: demo.today, created_at: demo.today + 'T01:30:00.000Z' });
}
// A year of closed history before the sample data starts, so the brand trends have something
// to show. Deterministic (seeded), with a seasonal pattern and some brands growing faster.
{
  let seed = 20261108;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const addDays = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 86400e3).toISOString().slice(0, 10);
  const firsts = ['Liam', 'Olivia', 'Noah', 'Charlotte', 'Jack', 'Amelia', 'William', 'Isla', 'Leo', 'Mia', 'Oliver', 'Ava', 'Henry', 'Grace', 'Lucas', 'Chloe', 'Thomas', 'Zoe', 'James', 'Ruby', 'Ethan', 'Sophie', 'Mason', 'Ella', 'Cooper', 'Harper', 'Hudson', 'Matilda'];
  const lasts = ['Smith', 'Jones', 'Williams', 'Brown', 'Wilson', 'Taylor', 'Johnson', 'White', 'Martin', 'Anderson', 'Thompson', 'Nguyen', 'Walker', 'Harris', 'Lee', 'Ryan', 'Robinson', 'Kelly', 'King', 'Campbell', 'Mitchell', 'Young'];
  const brandName = (fid) => demo.brands.find((b) => b.id === demo.franchises.find((f) => f.id === fid).brand_id).name;
  // weight = walk-ins a month at the start; growth = change across the year; conv = share sold.
  const plan = { MG: [9, 1.1, 0.34], Hyundai: [8, 0.95, 0.38], Nissan: [7, 0.9, 0.33], LDV: [6, 1.05, 0.3], Chery: [4, 1.8, 0.29], Jeep: [4, 0.8, 0.22], Leapmotor: [2, 2.4, 0.25], GAC: [3, 1.5, 0.24], JMC: [3, 1.2, 0.27], 'Used Cars': [7, 1, 0.42] };
  const season = [0.8, 0.9, 1.0, 1.0, 0.95, 1.25, 0.9, 0.95, 1.0, 1.05, 1.0, 0.75]; // Jan..Dec (EOFY in June)
  const lostReasons = demo.lookup_values.filter((x) => x.list_type === 'lost_reason').map((x) => x.id);
  const firstMonth = demo.enquiries.reduce((m, e) => (e.entry_date < m ? e.entry_date : m), demo.today).slice(0, 7);
  const [fy, fm] = firstMonth.split('-').map(Number);
  let id = Math.max(...demo.enquiries.map((e) => e.id));
  const templates = new Map();
  for (const e of demo.enquiries) if (!templates.has(e.franchise_id)) templates.set(e.franchise_id, e);
  for (let back = 9; back >= 1; back--) {
    const start = new Date(Date.UTC(fy, fm - 1 - back, 1));
    const ym = start.toISOString().slice(0, 7);
    const days = new Date(Date.UTC(fy, fm - back, 0)).getUTCDate();
    const progress = (9 - back) / 9;
    for (const [fid, tpl] of templates) {
      const p = plan[brandName(fid)];
      if (!p) continue;
      const [weight, growth, conv] = p;
      const n = Math.max(0, Math.round(weight * (1 + (growth - 1) * progress) * season[start.getUTCMonth()] * (0.8 + rnd() * 0.4)));
      for (let i = 0; i < n; i++) {
        const entry = `${ym}-${String(1 + Math.floor(rnd() * days)).padStart(2, '0')}`;
        const sold = rnd() < conv;
        const closed = addDays(entry, 2 + Math.floor(rnd() * 24));
        const first = pick(firsts);
        const last = pick(lasts);
        demo.enquiries.push({
          ...tpl,
          id: ++id,
          customer_name: `${first} ${last}`,
          phone: `04${String(Math.floor(rnd() * 1e8)).padStart(8, '0')}`,
          email: rnd() < 0.5 ? `${first}.${last}@example.com`.toLowerCase() : null,
          test_drive: rnd() < (sold ? 0.8 : 0.45) ? 1 : 0,
          trade_in: rnd() < 0.4 ? 1 : 0,
          finance: rnd() < 0.35 ? 1 : 0,
          outcome: sold ? 'sold' : 'lost',
          lost_reason_id: sold ? null : pick(lostReasons),
          sold_date: sold ? closed : null,
          sold_at: sold ? `${closed}T03:00:00.000Z` : null,
          closed_at: `${closed}T03:00:00.000Z`,
          next_followup_at: null,
          pending_outcome: null,
          pending_lost_reason_id: null,
          pending_note: null,
          pending_by: null,
          pending_at: null,
          pending_date: null,
          is_invalid: 0,
          invalid_reason: null,
          entry_date: entry,
          entry_month: ym,
          created_at: `${entry}T01:00:00.000Z`,
          updated_at: `${closed}T03:00:00.000Z`,
        });
      }
    }
  }
}
// Placeholder names for the trial people.
for (const [username, name] of [['demo.gm', 'Jake Curran'], ['demo.manager', 'Brad Rac'], ['demo.sales', 'Noah Belk'], ['demo.priya', 'Jason Bull']]) {
  const u = demo.users.find((x) => x.username === username);
  if (u) u.name = name;
}

// A realistic team across all four sites (managers, salespeople, one leaver), so the Team
// page looks like it will with the whole dealership on it.
{
  const siteId = (name) => demo.locations.find((l) => l.name === name).id;
  const fr = (site, brands) =>
    demo.franchises.filter((f) => f.location_id === siteId(site) && (!brands || brands.includes(demo.brands.find((b) => b.id === f.brand_id).name))).map((f) => f.id);
  let uid = Math.max(...demo.users.map((u) => u.id));
  const ago = (days, hour = 8) => (days == null ? null : new Date(Date.parse(demo.today + 'T00:00:00Z') - days * 86400e3 + (hour - 10) * 3600e3).toISOString());
  const staff = [
    ['Mia Collins', 'mia.collins', 'sales_manager', 'Maroochydore', null, 0],
    ['Ryan Fletcher', 'ryan.fletcher', 'sales_manager', 'Hervey Bay', null, 1],
    ['Jordan Lee', 'jordan.lee', 'salesperson', 'Caloundra', ['MG', 'LDV', 'Used Cars'], 0],
    ['Ella Brooks', 'ella.brooks', 'salesperson', 'Caloundra', ['Chery', 'GAC', 'Leapmotor', 'JMC'], 2],
    ['Lucas Patel', 'lucas.patel', 'salesperson', 'Maroochydore', ['Hyundai', 'Nissan', 'Used Cars'], 0],
    ['Grace Kim', 'grace.kim', 'salesperson', 'Maroochydore', ['Audi', 'Volvo'], 1],
    ['Lachlan Ross', 'lachlan.ross', 'salesperson', 'Maroochydore', ['MG', 'LDV', 'GMSV', 'GAC'], 3],
    ['Chloe Martin', 'chloe.martin', 'salesperson', 'Maroochydore', ['Hyundai', 'Nissan', 'MG'], null],
    ['Ben Walsh', 'ben.walsh', 'salesperson', 'Kingaroy', ['Ford', 'Mitsubishi', 'Used Cars'], 0],
    ['Hannah Doyle', 'hannah.doyle', 'salesperson', 'Kingaroy', ['Hyundai', 'Nissan', 'Geely', 'GWM'], 1],
    ['Cooper Hayes', 'cooper.hayes', 'salesperson', 'Hervey Bay', ['Kia', 'Honda', 'Isuzu'], 0],
    ['Ruby Taylor', 'ruby.taylor', 'salesperson', 'Hervey Bay', ['Nissan', 'XPeng', 'GWM', 'Used Cars'], 4],
    ['Max Turner', 'max.turner', 'salesperson', 'Hervey Bay', ['Kia', 'Nissan'], 12],
  ];
  for (const [name, username, role, site, brands, seen] of staff) {
    const id = ++uid;
    demo.users.push({ id, name, username, email: `${username}@example.com`, role, is_admin: 0, home_location_id: siteId(site), active: username === 'max.turner' ? 0 : 1, must_change_password: 0, last_login_at: ago(seen), created_at: ago(60), updated_at: ago(5), notify_email: 1 });
    for (const f of fr(site, brands)) demo.user_franchises.push({ user_id: id, franchise_id: f });
  }
}
// Sample-data tidy-up: lost enquiries get a close date a few days after they came in (the
// sample marked them all closed on the day it was made), keeping two lost today; and some
// follow-ups are logged today, a few of them late.
{
  const addDays = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 86400e3).toISOString().slice(0, 10);
  const yesterday = addDays(demo.today, -1);
  let keepToday = 2;
  for (const e of demo.enquiries.filter((x) => x.outcome === 'lost' && x.closed_at && x.closed_at.slice(0, 10) >= yesterday)) {
    if (keepToday-- > 0 && e.entry_date < demo.today) continue;
    const day = addDays(e.entry_date, 3) < demo.today ? addDays(e.entry_date, 3) : yesterday;
    e.closed_at = `${day}T04:00:00.000Z`;
  }
  let actId = Math.max(...demo.activities.map((a) => a.id));
  const open = demo.enquiries.filter((x) => x.outcome === 'open' && !x.pending_outcome && x.entry_date < demo.today).slice(0, 9);
  open.forEach((e, i) => {
    const late = i % 4 === 3;
    demo.activities.push({ id: ++actId, enquiry_id: e.id, user_id: e.salesperson_id, type: 'call', body: late ? 'Called (no answer)' : 'Called. Still deciding, sent the updated quote.', followup_due: late ? addDays(demo.today, -2) : demo.today, local_date: demo.today, created_at: `${demo.today}T0${i % 6}:15:00.000Z` });
  });
}
// Cars sold today, spread through the day and approved by the Caloundra sales manager, so
// the Sales board and the daily summary have something to show.
{
  const user = (u) => demo.users.find((x) => x.username === u);
  const approver = user('demo.manager');
  const plan = [['09:20', 'demo.sales'], ['10:05', 'jordan.lee'], ['11:40', 'demo.priya'], ['13:15', 'ella.brooks'], ['14:30', 'demo.sales'], ['15:50', 'demo.tom']];
  let actId = Math.max(...demo.activities.map((a) => a.id));
  const used = new Set();
  for (const [hhmm, username] of plan) {
    const u = user(username);
    const theirs = new Set(demo.user_franchises.filter((x) => x.user_id === u.id).map((x) => x.franchise_id));
    const e = demo.enquiries
      .filter((x) => x.outcome === 'open' && !x.pending_outcome && x.entry_date < demo.today && theirs.has(x.franchise_id) && !used.has(x.id))
      .sort((a, b) => b.entry_date.localeCompare(a.entry_date))[0];
    if (!e) continue;
    used.add(e.id);
    const at = new Date(Date.parse(`${demo.today}T${hhmm}:00+10:00`)).toISOString();
    Object.assign(e, { salesperson_id: u.id, outcome: 'sold', sold_date: demo.today, sold_at: at, closed_at: at, next_followup_at: null, updated_at: at });
    demo.activities.push({ id: ++actId, enquiry_id: e.id, user_id: u.id, type: 'approval_requested', body: 'Marked as sold. Waiting for sales manager approval. Note: Deposit paid', followup_due: null, local_date: demo.today, created_at: at });
    demo.activities.push({ id: ++actId, enquiry_id: e.id, user_id: approver.id, type: 'approved', body: 'Approved: sold. Reason: Deposit receipt checked', followup_due: null, local_date: demo.today, created_at: at });
  }
}
const data = JSON.stringify(demo);

const page = `<title>Sunco Motors Enquiry Management CRM</title>
<meta name="theme-color" content="#D81E05">
<style>
${read('public/styles.css')}
${read('demo/demo.css')}
</style>
${body}
<script>window.DEMO_DATA = ${safe(data)};</script>
${scripts.map((s) => `<script>\n${safe(read(s))}\n</script>`).join('\n')}
`;
fs.writeFileSync(outFile, page);
console.log(`Wrote ${outFile} (${Math.round(page.length / 1024)} KB)`);
