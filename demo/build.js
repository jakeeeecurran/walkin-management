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
const scripts = ['public/js/theme-boot.js', 'public/js/core.js', 'demo/demo-api.js', 'public/js/enquiries.js', 'public/js/reports.js', 'public/js/admin.js', 'public/js/main.js'];
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
