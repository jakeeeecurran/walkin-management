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
const scripts = ['public/js/core.js', 'demo/demo-api.js', 'public/js/enquiries.js', 'public/js/reports.js', 'public/js/admin.js', 'public/js/main.js'];
const data = fs.readFileSync(dataFile, 'utf8');

const page = `<title>Sunco Walk-In CRM</title>
<meta name="theme-color" content="#0B3D91">
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
