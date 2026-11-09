// Builds the two training decks for the Sunco Motors Enquiry Management CRM:
//   Salesperson guide and Sales manager guide.
// Screenshots are light-mode captures of the trial build (SHOTS dir).
// Arial throughout so it looks the same in PowerPoint (Windows/Mac/iPad) and Keynote.
//
// Usage: SHOTS=/path/to/screenshots OUT=/path/to/output node build-decks.js
const path = require('path');
const pptxgen = require('pptxgenjs');
const sharp = require('sharp');
const React = require('react');
const ReactDOMServer = require('react-dom/server');
const Lu = require('react-icons/lu');

const APPLY_THEME = process.env.APPLY_THEME || '/mnt/skills/public/pptx/scripts/apply_theme.js';
let applyTheme = null;
try { ({ applyTheme } = require(APPLY_THEME)); } catch { /* optional */ }

const SHOTS = process.env.SHOTS || path.join(__dirname, 'shots');
const OUT = process.env.OUT || __dirname;
const LOGO = process.env.LOGO || path.join(__dirname, '..', '..', '..', 'public', 'sunco-logo.png');
const shot = (n) => path.join(SHOTS, n + '.png');

const PRODUCT = 'Sunco Motors Enquiry Management CRM';
const THEME = {
  name: 'Sunco Motors',
  headFontFace: 'Arial',
  bodyFontFace: 'Arial',
  colors: {
    dk1: '111827', lt1: 'FFFFFF', dk2: 'A31703', lt2: 'F5F6F8',
    accent1: 'D81E05', accent2: 'F7A21B', accent3: '16794A', accent4: 'A31703', accent5: '5B6472', accent6: 'FDECE9',
    hlink: 'D81E05', folHlink: '5B6472',
  },
};
const HEX = { red: 'D81E05', orange: 'F7A21B', ink: '111827', grey: '5B6472', white: 'FFFFFF', pale: 'FDECE9', soft: 'F5F6F8', line: 'E3E6EB', pink: 'FFD9D2', green: '16794A' };

// Grid: 13.333 x 7.5. Margins 0.6. Content band from y=1.6 to y=6.65.
const W = 13.333;
const M = 0.6;
const TOP = 1.6;
const BOTTOM = 6.65;
const LEFT_W = 7.6;
const RIGHT_X = M + LEFT_W + 0.55;
const RIGHT_W = W - M - RIGHT_X;

const iconCache = new Map();
async function icon(Comp, color = HEX.red) {
  const key = Comp.name + color;
  if (!iconCache.has(key)) {
    const svg = ReactDOMServer.renderToStaticMarkup(React.createElement(Comp, { color: '#' + color, size: '256', strokeWidth: 2 }));
    const buf = await sharp(Buffer.from(svg)).png().toBuffer();
    iconCache.set(key, 'image/png;base64,' + buf.toString('base64'));
  }
  return iconCache.get(key);
}
async function fit(file, box, { top = false, left = false } = {}) {
  const m = await sharp(file).metadata();
  const r = Math.min(box.w / m.width, box.h / m.height);
  const w = m.width * r;
  const h = m.height * r;
  return { x: left ? box.x : box.x + (box.w - w) / 2, y: top ? box.y : box.y + (box.h - h) / 2, w, h };
}

function makeDeck(audience) {
  const pres = new pptxgen();
  pres.layout = 'LAYOUT_WIDE';
  pres.title = `${PRODUCT}: ${audience} guide`;
  pres.author = 'Sunco Motors';
  pres.company = 'Sunco Motors';
  pres.theme = { headFontFace: 'Arial', bodyFontFace: 'Arial' };
  const C = pres.SchemeColor;

  pres.defineSlideMaster({
    title: 'Title',
    background: { color: C.background1 },
    objects: [
      { rect: { x: 0, y: 0, w: 0.22, h: 7.5, fill: { color: C.accent1 }, line: { color: C.accent1 } } },
      { image: { path: LOGO, x: M, y: 0.6, w: 1.9, h: 1.9 * 140 / 300 } },
      { placeholder: { options: { name: 'title', type: 'title', x: M, y: 2.35, w: 7.0, h: 1.9, fontSize: 44, bold: true, color: C.text1, valign: 'bottom', align: 'left', margin: 0 }, text: '' } },
      { placeholder: { options: { name: 'body', type: 'body', x: M, y: 4.5, w: 6.6, h: 1.3, fontSize: 20, color: C.accent5, valign: 'top', align: 'left', margin: 0 }, text: '' } },
    ],
  });
  pres.defineSlideMaster({
    title: 'Section',
    background: { color: C.accent1 },
    objects: [
      { placeholder: { options: { name: 'title', type: 'title', x: M, y: 2.55, w: 10.5, h: 1.3, fontSize: 44, bold: true, color: C.background1, valign: 'bottom', align: 'left', margin: 0 }, text: '' } },
      { placeholder: { options: { name: 'body', type: 'body', x: M, y: 4.05, w: 10.5, h: 0.9, fontSize: 20, color: HEX.pink, valign: 'top', align: 'left', margin: 0 }, text: '' } },
    ],
    slideNumber: { x: 12.3, y: 6.95, w: 0.45, h: 0.3, fontSize: 10, color: HEX.pink, align: 'right' },
  });
  pres.defineSlideMaster({
    title: 'Content',
    background: { color: C.background1 },
    objects: [
      { rect: { x: M, y: 1.3, w: 0.9, h: 0.06, fill: { color: C.accent1 }, line: { color: C.accent1 } } },
      { placeholder: { options: { name: 'title', type: 'title', x: M, y: 0.4, w: 12.1, h: 0.85, fontSize: 32, bold: true, color: C.text1, valign: 'middle', align: 'left', margin: 0 }, text: '' } },
      { text: { text: `${PRODUCT}  ·  ${audience} guide`, options: { x: M, y: 6.95, w: 8, h: 0.3, fontSize: 10, color: C.accent5, margin: 0 } } },
    ],
    slideNumber: { x: 12.3, y: 6.95, w: 0.45, h: 0.3, fontSize: 10, color: C.accent5, align: 'right' },
  });

  const shadow = () => ({ type: 'outer', color: '111827', opacity: 0.14, blur: 10, offset: 2, angle: 90 });

  // Screenshot in a white rounded frame, fitted in its box.
  async function framed(slide, file, box, name, opts = { top: true }) {
    const f = await fit(file, { x: box.x + 0.08, y: box.y + 0.08, w: box.w - 0.16, h: box.h - 0.16 }, opts);
    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: f.x - 0.08, y: f.y - 0.08, w: f.w + 0.16, h: f.h + 0.16, rectRadius: 0.1, fill: { color: C.background1 }, line: { color: HEX.line, width: 0.75 }, shadow: shadow(), objectName: `${name} frame` });
    slide.addImage({ path: file, ...f, altText: name, objectName: name });
    return f;
  }
  const leftShot = (slide, file, name, opts) => framed(slide, file, { x: M, y: TOP, w: LEFT_W, h: BOTTOM - TOP }, name, opts);

  // A column of points: marker (number or icon) + bold heading + one short line.
  async function points(slide, items, { x = RIGHT_X, w = RIGHT_W, top = TOP + 0.05, bottom = BOTTOM, numbered = false } = {}) {
    const slot = (bottom - top) / items.length;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const y = top + i * slot;
      const d = 0.5;
      if (numbered) {
        slide.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: C.accent1 }, line: { color: C.accent1 }, objectName: `Point ${i + 1} marker` });
        slide.addText(String(i + 1), { x, y, w: d, h: d, fontSize: 16, bold: true, color: C.background1, align: 'center', valign: 'middle', margin: 0, isTextBox: true, objectName: `Point ${i + 1} number` });
      } else {
        slide.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: C.accent6 }, line: { color: C.accent6 }, objectName: `Point ${i + 1} marker` });
        slide.addImage({ data: await icon(it.icon), x: x + 0.13, y: y + 0.13, w: 0.24, h: 0.24, altText: '', objectName: `Point ${i + 1} icon` });
      }
      slide.addText(it.head, { x: x + 0.72, y: y + 0.02, w: w - 0.72, h: 0.46, fontSize: 18, bold: true, color: C.text1, valign: 'middle', margin: 0, isTextBox: true, objectName: `Point ${i + 1} heading` });
      slide.addText(it.text, { x: x + 0.72, y: y + 0.52, w: w - 0.72, h: Math.max(0.6, slot - 0.65), fontSize: 14, color: C.accent5, valign: 'top', margin: 0, isTextBox: true, objectName: `Point ${i + 1} text` });
    }
  }

  // Cards with an icon, heading and short text. Rows of `cols`; a short last row is centred.
  async function cards(slide, items, { cols = 2, top = TOP, bottom = BOTTOM, iconFill = C.accent1, iconColor = HEX.white, numbered = false } = {}) {
    const gap = 0.35;
    const rows = Math.ceil(items.length / cols);
    const cw = (W - 2 * M - gap * (cols - 1)) / cols;
    const ch = (bottom - top - gap * (rows - 1)) / rows;
    const wide = cols === 2;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const row = Math.floor(i / cols);
      const inRow = Math.min(cols, items.length - row * cols);
      const offset = ((cols - inRow) * (cw + gap)) / 2;
      const x = M + offset + (i % cols) * (cw + gap);
      const y = top + row * (ch + gap);
      slide.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w: cw, h: ch, rectRadius: 0.14, fill: { color: C.background2 }, line: { color: C.background2 }, objectName: `Card ${i + 1}` });
      const d = wide ? 0.8 : 0.62;
      const pad = wide ? 0.45 : 0.35;
      slide.addShape(pres.shapes.OVAL, { x: x + pad, y: y + pad, w: d, h: d, fill: { color: iconFill }, line: { color: iconFill }, objectName: `Card ${i + 1} marker` });
      if (numbered) {
        slide.addText(String(i + 1), { x: x + pad, y: y + pad, w: d, h: d, fontSize: wide ? 22 : 18, bold: true, color: iconColor, align: 'center', valign: 'middle', margin: 0, isTextBox: true, objectName: `Card ${i + 1} number` });
      } else {
        const s = d / 2;
        slide.addImage({ data: await icon(it.icon, iconColor), x: x + pad + s / 2, y: y + pad + s / 2, w: s, h: s, altText: '', objectName: `Card ${i + 1} icon` });
      }
      if (wide) {
        slide.addText(it.head, { x: x + 1.55, y: y + 0.45, w: cw - 1.95, h: 0.8, fontSize: 20, bold: true, color: C.text1, valign: 'middle', margin: 0, isTextBox: true, objectName: `Card ${i + 1} heading` });
        slide.addText(it.text, { x: x + 1.55, y: y + 1.3, w: cw - 1.95, h: ch - 1.5, fontSize: 15, color: C.accent5, valign: 'top', margin: 0, isTextBox: true, objectName: `Card ${i + 1} text` });
      } else {
        slide.addText(it.head, { x: x + 0.35, y: y + 1.1, w: cw - 0.7, h: 0.5, fontSize: 17, bold: true, color: C.text1, valign: 'top', margin: 0, isTextBox: true, objectName: `Card ${i + 1} heading` });
        slide.addText(it.text, { x: x + 0.35, y: y + 1.62, w: cw - 0.7, h: ch - 1.75, fontSize: 14, color: C.accent5, valign: 'top', margin: 0, isTextBox: true, objectName: `Card ${i + 1} text` });
      }
    }
  }

  // Two screenshots side by side, each with an icon, heading and line of text underneath.
  async function twoUp(slide, cols, { shotH = 3.35 } = {}) {
    const colW = 5.85;
    const gap = W - 2 * M - 2 * colW;
    for (let i = 0; i < 2; i++) {
      const c = cols[i];
      const x = M + i * (colW + gap);
      await framed(slide, shot(c.file), { x, y: TOP, w: colW, h: shotH }, c.name);
      const ty = TOP + shotH + 0.25;
      slide.addShape(pres.shapes.OVAL, { x, y: ty, w: 0.5, h: 0.5, fill: { color: C.accent6 }, line: { color: C.accent6 }, objectName: `${c.head} marker` });
      slide.addImage({ data: await icon(c.icon), x: x + 0.13, y: ty + 0.13, w: 0.24, h: 0.24, altText: '', objectName: `${c.head} icon` });
      slide.addText(c.head, { x: x + 0.72, y: ty + 0.02, w: colW - 0.72, h: 0.46, fontSize: 18, bold: true, color: C.text1, valign: 'middle', margin: 0, isTextBox: true, objectName: `${c.head} heading` });
      slide.addText(c.text, { x: x + 0.72, y: ty + 0.52, w: colW - 0.72, h: BOTTOM - ty - 0.5, fontSize: 14, color: C.accent5, valign: 'top', margin: 0, isTextBox: true, objectName: `${c.head} text` });
    }
  }

  // Title / closing slide with a phone screenshot on the right.
  async function titleSlide(section, { title, body, eyebrow, phone, phoneName, notes, steps }) {
    const s = pres.addSlide({ masterName: 'Title', sectionTitle: section });
    if (eyebrow) s.addText(eyebrow, { x: M, y: 1.75, w: 7, h: 0.4, fontSize: 14, bold: true, charSpacing: 3, color: C.accent1, margin: 0, isTextBox: true, objectName: 'Eyebrow' });
    s.addText(title, { placeholder: 'title' });
    s.addText(body, { placeholder: 'body' });
    if (phone) {
      const f = await fit(shot(phone), { x: 8.85, y: 0.7, w: 3.6, h: 6.1 });
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: f.x - 0.14, y: f.y - 0.14, w: f.w + 0.28, h: f.h + 0.28, rectRadius: 0.28, fill: { color: HEX.ink }, line: { color: HEX.ink }, shadow: shadow(), objectName: 'Phone frame' });
      s.addImage({ path: shot(phone), ...f, altText: phoneName, objectName: 'Phone screenshot' });
    }
    if (steps) {
      const x = 8.4;
      const w = W - M - x;
      for (let i = 0; i < steps.length; i++) {
        const y = 2.0 + i * 1.3;
        s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h: 1.0, rectRadius: 0.14, fill: { color: C.accent6 }, line: { color: C.accent6 }, objectName: `Next step ${i + 1}` });
        s.addImage({ data: await icon(steps[i].icon), x: x + 0.32, y: y + 0.3, w: 0.4, h: 0.4, altText: '', objectName: `Next step ${i + 1} icon` });
        s.addText(steps[i].text, { x: x + 0.95, y, w: w - 1.15, h: 1.0, fontSize: 17, bold: true, color: C.text1, valign: 'middle', margin: 0, isTextBox: true, objectName: `Next step ${i + 1} text` });
      }
    }
    s.addNotes(notes);
    return s;
  }

  function section(name, title, body, notes) {
    pres.addSection({ title: name });
    const s = pres.addSlide({ masterName: 'Section', sectionTitle: name });
    s.addText(title, { placeholder: 'title' });
    s.addText(body, { placeholder: 'body' });
    s.addNotes(notes);
    return s;
  }
  function content(sectionName, title) {
    const s = pres.addSlide({ masterName: 'Content', sectionTitle: sectionName });
    s.addText(title, { placeholder: 'title' });
    return s;
  }
  // Phones in a row with labels.
  async function phones(slide, list) {
    const gap = 0.4;
    const bw = (W - 2 * M - gap * (list.length - 1)) / list.length;
    for (let i = 0; i < list.length; i++) {
      const [file, label] = list[i];
      const x = M + i * (bw + gap);
      await framed(slide, shot(file), { x, y: TOP, w: bw, h: 4.55 }, `${label} on phone`);
      slide.addText(label, { x, y: 6.25, w: bw, h: 0.4, fontSize: 16, bold: true, color: C.text1, align: 'center', valign: 'middle', margin: 0, isTextBox: true, objectName: `${label} label` });
    }
  }

  async function save(file) {
    const out = path.join(OUT, file);
    await pres.writeFile({ fileName: out });
    if (applyTheme) await applyTheme(out, THEME);
    console.log('Wrote', out);
  }

  return { pres, C, framed, leftShot, points, cards, twoUp, titleSlide, section, content, phones, save };
}

// =====================================================================
// Salesperson guide
// =====================================================================
async function salesDeck() {
  const d = makeDeck('Salesperson');
  const { pres, C } = d;
  let s;

  pres.addSection({ title: 'Welcome' });
  await d.titleSlide('Welcome', {
    eyebrow: 'ENQUIRY MANAGEMENT CRM',
    title: [{ text: 'Salesperson guide', options: { breakLine: true } }, { text: 'Using the CRM well' }],
    body: 'Log every walk-in in 30 seconds, follow up on time and see your own numbers.',
    phone: 'sp-phone-today',
    phoneName: 'The Today screen on a phone',
    notes: 'Welcome. This guide shows salespeople how to use the Sunco Motors Enquiry Management CRM, which replaces the walk-in spreadsheet: logging a walk-in, working follow-ups, closing a deal and reading your own numbers. Every screen shown is the real system with demo data.',
  });

  s = d.content('Welcome', 'Why we use the CRM');
  await d.cards(s, [
    { icon: Lu.LuTimer, head: 'Log a walk-in in 30 seconds', text: 'Mostly taps. The date, your name and the site fill themselves in.' },
    { icon: Lu.LuBellRing, head: 'Never miss a follow-up', text: 'Every open enquiry has a next date. Today shows who to contact.' },
    { icon: Lu.LuCalendarCheck, head: 'No more month-end tabs', text: 'One list. Enquiries stay open until they are sold or lost.' },
    { icon: Lu.LuChartColumn, head: 'Your numbers, any time', text: 'Enquiries, test drives and conversion for the day, month or year.' },
  ]);
  s.addNotes('The spreadsheet made people type the same things over and over, and enquiries got lost between monthly tabs. The CRM fixes both: entry is mostly taps, follow-ups are tracked for you, and there is no month-end carry-over.');

  s = d.content('Welcome', 'Your day starts on the Today screen');
  await d.leftShot(s, shot('sp-today'), 'Today screen');
  await d.points(s, [
    { head: 'New walk-in', text: 'Tap it when a customer arrives.' },
    { head: 'To follow up today', text: 'Everyone to contact today, oldest first.' },
    { head: 'Days late', text: 'An amber badge means it was due earlier.' },
    { head: 'Walk-ins today', text: 'Everyone you have logged today.' },
  ], { numbered: true });
  s.addNotes('Sign in with your own username and password. Today is home: work down To follow up today; anything due on an earlier day is listed first with a days-late badge. Each list shows the first few, with See all for the rest. The moon button at the top switches between light and dark.');

  d.section('Logging a walk-in', 'Logging a walk-in', 'Three steps, about 30 seconds, while the customer is still with you',
    'Open the form from New walk-in on Today, the + in the phone menu, or New walk-in at the top of any page. The form has three numbered steps: vehicle, customer and visit.');

  s = d.content('Logging a walk-in', 'Step 1: pick the brand and model');
  await d.leftShot(s, shot('sp-step1'), 'Vehicle step');
  await d.points(s, [
    { icon: Lu.LuCarFront, head: 'Tap the brand', text: 'Only the brands you sell appear.' },
    { icon: Lu.LuList, head: 'Choose the model', text: 'From the list, so every model is spelt the same.' },
    { icon: Lu.LuCircleHelp, head: 'Model missing?', text: 'Ask your sales manager to add it.' },
  ]);
  s.addNotes('Brand buttons only show the brands you are assigned to at your site. Models come from a fixed list per brand, which keeps the reports accurate. New models are added in Admin and appear straight away.');

  s = d.content('Logging a walk-in', 'Step 2: who is the customer?');
  await d.leftShot(s, shot('sp-step2'), 'Customer step with duplicate warning');
  await d.points(s, [
    { icon: Lu.LuUser, head: 'Name and postcode', text: 'Both required. Type it any way; it is tidied for you.' },
    { icon: Lu.LuPhone, head: 'Phone or email', text: 'At least one, so you can follow up.' },
    { icon: Lu.LuTriangleAlert, head: 'Already enquiring?', text: 'You are warned if they are open with someone else.' },
  ]);
  s.addNotes('"emma walsh" is saved as "Emma Walsh" and phone numbers are formatted for you. The duplicate warning checks every site, so two salespeople do not chase the same customer. If you see it, speak to that colleague or your manager instead of adding a second enquiry.');

  s = d.content('Logging a walk-in', 'Step 3: the visit and next follow-up');
  await d.leftShot(s, shot('sp-step3'), 'Visit step');
  await d.points(s, [
    { head: 'Test drive, trade-in, finance', text: 'Tap each one that applies. Green means yes.' },
    { head: 'Leave it Open', text: 'Unless they bought or walked away today.' },
    { head: 'Pick the next follow-up', text: 'Tap a quick date such as 3 days.' },
    { head: 'Add a comment, then Save', text: 'One line on budget, timing or trade.' },
  ], { numbered: true });
  s.addNotes('Every open enquiry needs a next follow-up date. That date drives the Today screen and the morning reminder email. Saving takes you back to Today.');

  s = d.content('Logging a walk-in', 'Used cars: type the make and model');
  await d.leftShot(s, shot('sp-used'), 'Used car step');
  await d.points(s, [
    { icon: Lu.LuKeyboard, head: 'Type it as you say it', text: '"toyota hilux" is saved as Toyota HiLux.' },
    { icon: Lu.LuSpellCheck, head: 'Typos are matched', text: '"hodna" is saved as Honda.' },
    { icon: Lu.LuTag, head: 'Stock number', text: 'Optional. You can search by it later.' },
  ]);
  s.addNotes('Choose Used Cars as the brand. Suggestions appear as you type. A make that has never been entered before is added for next time. Typing is only for used cars; new-car brands always use the model list.');

  d.section('Working your enquiries', 'Working your enquiries', 'Find a customer, log what happened, close it off',
    'This section covers the Enquiries list, the enquiry page, follow-ups, and marking an enquiry sold or lost, which your sales manager then approves.');

  s = d.content('Working your enquiries', 'Find any enquiry in seconds');
  await d.leftShot(s, shot('sp-list-menu'), 'Enquiries list with the Show menu open');
  await d.points(s, [
    { icon: Lu.LuSearch, head: 'Search', text: 'By name, phone, email or stock number.' },
    { icon: Lu.LuChevronDown, head: 'Show', text: 'Open, Due today, Running late, Awaiting approval and more.' },
    { icon: Lu.LuListFilter, head: 'Filters', text: 'Narrow by brand or change the order.' },
  ]);
  s.addNotes('Open is the default: everything still in progress, soonest follow-up first. You only see your own enquiries; managers see their whole team. On a tablet the enquiry opens beside the list.');

  s = d.content('Working your enquiries', 'Everything about a customer on one page');
  await d.leftShot(s, shot('sp-detail'), 'Enquiry page');
  await d.points(s, [
    { head: 'Call, SMS or Email', text: 'One tap from your phone.' },
    { head: 'Log follow-up', text: 'Record what happened and the next date.' },
    { head: 'Sold or Lost', text: 'Close it when the customer decides.' },
    { head: 'More (···)', text: 'Edit the details if something changed.' },
  ], { numbered: true });
  s.addNotes('The top of the page shows only what you need to act. More details shows the postcode, source and date of entry. History at the bottom lists every call, comment and change, newest first.');

  s = d.content('Working your enquiries', 'Log a follow-up in one step');
  {
    const fu = await d.framed(s, shot('sp-followup'), { x: M, y: TOP, w: 3.4, h: BOTTOM - TOP }, 'Log follow-up panel', { top: true, left: true });
    const x = fu.x + fu.w + 0.9;
    await d.points(s, [
      { head: 'Tap Log follow-up', text: 'On the customer’s page.' },
      { head: 'What happened?', text: 'Called, No answer, SMS, Email or Other.' },
      { head: 'Pick the next date', text: 'Tomorrow, 3 days, 1 week, 2 weeks or a date.' },
      { head: 'Add a note and Save', text: 'It goes into the history with your name.' },
    ], { x, w: 7.2, numbered: true });
  }
  s.addNotes('Log every contact, even when there is no answer. It keeps the follow-up date current and shows your manager the work you have put in. Reports count how many follow-ups were done on time.');

  s = d.content('Working your enquiries', 'Sold or Lost goes to your manager');
  await d.twoUp(s, [
    { file: 'sp-sold-dialog', name: 'Mark as sold', head: 'Sold', icon: Lu.LuBadgeCheck, text: 'Tap Sold, add a short note such as "deposit taken", then Send for approval.' },
    { file: 'sp-lost-dialog', name: 'Why was it lost', head: 'Lost', icon: Lu.LuCircleX, text: 'Pick the reason, add any detail, then Send for approval.' },
  ]);
  s.addNotes('Salespeople do not close enquiries on their own. Sold or Lost is sent to your sales manager, who approves or declines it with a reason. Do it the day it happens so the numbers stay true. A good note gets a quicker approval.');

  s = d.content('Working your enquiries', 'While you wait for approval');
  {
    const f = await d.framed(s, shot('sp-waiting'), { x: M, y: TOP, w: 3.4, h: BOTTOM - TOP }, 'Enquiry waiting for approval', { top: true, left: true });
    const x = f.x + f.w + 0.9;
    await d.points(s, [
      { icon: Lu.LuHourglass, head: 'Marked "Sold · approval"', text: 'It stays open until your manager decides.' },
      { icon: Lu.LuUndo2, head: 'Changed your mind?', text: 'Tap Withdraw request.' },
      { icon: Lu.LuCircleCheck, head: 'Approved', text: 'It closes and counts in your numbers.' },
      { icon: Lu.LuMessageSquareWarning, head: 'Declined', text: 'It stays open. Read the reason and follow up.' },
    ], { x, w: 7.2 });
  }
  s.addNotes('Find everything you have sent with Show, then Awaiting approval. If the manager declines, their reason shows on the enquiry and in the history, and the follow-up date is set to today so it lands on your Today screen.');

  s = d.content('Working your enquiries', 'It works the same on your phone');
  await d.phones(s, [
    ['sp-phone-today', 'Today'],
    ['sp-phone-list', 'Enquiries'],
    ['sp-phone-detail', 'A customer'],
    ['sp-phone-new', 'New walk-in'],
  ]);
  s.addNotes('Add it to your home screen so it opens like an app: in Safari tap Share then Add to Home Screen; in Chrome open the menu and tap Add to Home screen. The bottom bar has Today, Enquiries, + for a new walk-in, Reports and More (Help, Account and Sign out).');

  pres.addSection({ title: 'Your numbers' });
  s = d.content('Your numbers', 'See your own numbers any time');
  await d.leftShot(s, shot('sp-reports'), 'Reports page');
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: RIGHT_X, y: TOP, w: RIGHT_W, h: 2.2, rectRadius: 0.14, fill: { color: C.accent1 }, line: { color: C.accent1 }, objectName: 'Conversion card' });
  s.addText('33%', { x: RIGHT_X + 0.35, y: TOP + 0.25, w: RIGHT_W - 0.7, h: 0.9, fontSize: 48, bold: true, color: C.background1, valign: 'middle', margin: 0, isTextBox: true, objectName: 'Conversion figure' });
  s.addText('Conversion: 20 sold from 60 enquiries', { x: RIGHT_X + 0.35, y: TOP + 1.2, w: RIGHT_W - 0.7, h: 0.75, fontSize: 15, color: C.background1, valign: 'top', margin: 0, isTextBox: true, objectName: 'Conversion explanation' });
  await d.points(s, [
    { icon: Lu.LuCalendarRange, head: 'Day, month or year', text: 'Choose the period at the top.' },
    { icon: Lu.LuChartColumn, head: 'Breakdowns', text: 'By brand, model, source or lost reason.' },
  ], { top: TOP + 2.6 });
  s.addNotes('Conversion is enquiries sold divided by enquiries entered in the period: 20 sold from 60 enquiries is 33%. A sale only counts once your manager approves it. Salespeople see only their own figures, with the change from the previous period.');

  pres.addSection({ title: 'Habits' });
  s = d.content('Habits', 'Five habits that make it work');
  await d.cards(s, [
    { icon: Lu.LuUserCheck, head: 'Log it on the spot', text: 'While the customer is still with you.' },
    { icon: Lu.LuCalendarClock, head: 'Always set a follow-up', text: 'No date means no reminder.' },
    { icon: Lu.LuSunrise, head: 'Follow up every day', text: 'Open Today each morning and work down the list.' },
    { icon: Lu.LuPhoneCall, head: 'Log every call', text: 'Even no answer. It shows the work you put in.' },
    { icon: Lu.LuCircleCheckBig, head: 'Close it off promptly', text: 'Send Sold or Lost the day it happens.' },
  ], { cols: 3, iconFill: C.accent2, iconColor: HEX.ink });
  s.addNotes('These habits are what make the CRM useful. Your sales manager can see follow-ups running late and how many walk-ins each person logs, so keeping it current protects you as well as the dealership.');

  s = d.content('Habits', 'Help is built in');
  await d.leftShot(s, shot('sp-help'), 'Help page for a salesperson');
  await d.points(s, [
    { icon: Lu.LuCircleHelp, head: 'Help in the menu', text: 'On a phone: More, then Help.' },
    { icon: Lu.LuUserCheck, head: 'Just what applies to you', text: 'Your brands and your how-tos.' },
    { icon: Lu.LuSearch, head: 'Search it', text: 'Try "used car" or "password".' },
    { icon: Lu.LuMessageSquare, head: 'Still stuck?', text: 'Ask your sales manager.' },
  ]);
  s.addNotes('Help shows the brands and sites you can log, short how-tos for everything in this guide, and who to ask. It only shows what a salesperson can do, so it stays short.');

  pres.addSection({ title: 'Wrap-up' });
  await d.titleSlide('Wrap-up', {
    title: [{ text: 'Every walk-in.', options: { breakLine: true } }, { text: 'Every time.' }],
    body: 'Questions about access, brands or models? Ask your sales manager.',
    steps: [
      { icon: Lu.LuLogIn, text: 'Sign in with your own login' },
      { icon: Lu.LuSmartphone, text: 'Add it to your phone' },
      { icon: Lu.LuCircleHelp, text: 'Unsure? Open Help' },
    ],
    notes: 'Close by asking everyone to sign in today, add the CRM to their phone and log their next walk-in in the CRM instead of the spreadsheet. Forgotten passwords are reset by a sales manager.',
  });

  await d.save('Sunco-Motors-Enquiry-CRM-Salesperson-Guide.pptx');
}

// =====================================================================
// Sales manager guide
// =====================================================================
async function managerDeck() {
  const d = makeDeck('Sales manager');
  const { pres, C } = d;
  let s;

  pres.addSection({ title: 'Welcome' });
  await d.titleSlide('Welcome', {
    eyebrow: 'ENQUIRY MANAGEMENT CRM',
    title: [{ text: 'Sales manager guide', options: { breakLine: true } }, { text: 'Running your team' }],
    body: 'Approve sales, keep follow-ups on track, coach with the numbers and look after your team.',
    phone: 'm-phone-today',
    phoneName: 'The manager Today screen on a phone',
    notes: 'This guide is for sales managers and general managers. It covers approving sold and lost enquiries, checking that salespeople are using the CRM properly, reports, and managing your team. Every screen shown is the real system with demo data.',
  });

  s = d.content('Welcome', 'Your four jobs in the CRM');
  await d.cards(s, [
    { icon: Lu.LuBadgeCheck, head: 'Approve sold and lost', text: 'Nothing closes until you approve it. Always give a reason.' },
    { icon: Lu.LuBellRing, head: 'Keep follow-ups on time', text: 'Check what is running late and chase the right person.' },
    { icon: Lu.LuChartColumn, head: 'Coach with the numbers', text: 'Compare walk-ins, test drives and conversion by salesperson.' },
    { icon: Lu.LuUsers, head: 'Look after your team', text: 'Add people, reset passwords and hand over enquiries.' },
  ]);
  s.addNotes('You see every enquiry for the brands and sites you manage. Salespeople see only their own. Your approval is what makes the sold and lost numbers trustworthy.');

  s = d.content('Welcome', 'Your Today screen');
  await d.leftShot(s, shot('m-today'), 'Manager Today screen');
  await d.points(s, [
    { head: 'Three numbers', text: 'To follow up, walk-ins today, to approve.' },
    { head: 'Today at a glance', text: 'The day’s numbers for your whole team.' },
    { head: 'Waiting for your approval', text: 'Sold and lost requests from your team.' },
    { head: 'To follow up today', text: 'Further down: who your team should contact.' },
  ], { numbered: true });
  s.addNotes('Managers see the whole team on Today, not just their own enquiries. The morning email lists the same things, including what is waiting for your approval.');

  s = d.content('Welcome', 'Today at a glance');
  await d.leftShot(s, shot('m-glance'), 'Today at a glance');
  await d.points(s, [
    { icon: Lu.LuLayoutGrid, head: 'The day at a glance', text: 'Test drives, sold, follow-ups done and running late.' },
    { icon: Lu.LuUsers, head: 'By salesperson', text: 'Everyone is listed, even on a quiet day.' },
    { icon: Lu.LuEyeOff, head: 'Faded row?', text: 'Nothing logged yet today. Have a word.' },
    { icon: Lu.LuMousePointerClick, head: 'Tap a number', text: 'Opens the list behind it.' },
  ]);
  s.addNotes('Today at a glance sits at the top of Today for sales managers and the general manager. The general manager sees it split by site. Sold counts approved sales only. Full report opens Reports for today.');

  s = d.content('Welcome', 'Your morning meeting');
  await d.leftShot(s, shot('m-hitlist-crop'), 'Morning meeting hit list');
  await d.points(s, [
    { head: 'Yesterday and the month', text: 'Who sold what, what was lost and why.' },
    { head: 'Hit list', text: 'The 10 hottest customers, with the last note on each.' },
    { head: 'Round the room', text: 'Each salesperson’s follow-ups, hot customers and sales.' },
    { head: 'Today’s follow-ups', text: 'Who each person should contact. Tap Print for paper.' },
  ], { numbered: true });
  s.addNotes('Open Morning meeting (in the menu, or the link on Today) before the sales meeting and work down the page. The hit list ranks open customers by test drive, finance, trade-in, how new they are and whether they are due today. On a Monday it shows the last trading day instead of Sunday.');

  d.section('Approvals', 'Approving sold and lost', 'Nothing closes until you say so',
    'When a salesperson marks an enquiry Sold or Lost it goes to pending. The sales manager for that brand and site approves or declines it, always with a reason.');

  s = d.content('Approvals', 'How a request reaches you');
  await d.leftShot(s, shot('m-approval'), 'Enquiry waiting for approval');
  await d.points(s, [
    { icon: Lu.LuHourglass, head: 'Marked "Sold · approval"', text: 'Or "Lost · approval" in every list.' },
    { icon: Lu.LuListFilter, head: 'Awaiting approval', text: 'Show this view to see every request.' },
    { icon: Lu.LuMessageSquare, head: 'Read their note', text: 'The salesperson says why it is sold or lost.' },
    { icon: Lu.LuMousePointerClick, head: 'Approve or Decline', text: 'On the yellow card on the enquiry.' },
  ]);
  s.addNotes('Requests appear on Today, in the Awaiting approval view of Enquiries, and in your morning email. Only managers who look after that brand at that site can approve it.');

  s = d.content('Approvals', 'Always give a reason');
  await d.twoUp(s, [
    { file: 'm-approve-dialog', name: 'Approve sale', head: 'Approve', icon: Lu.LuCircleCheck, text: 'Say what you checked, e.g. "Deposit receipt checked". The sale counts from the day it was sent.' },
    { file: 'm-decline-dialog', name: 'Decline', head: 'Decline', icon: Lu.LuCircleX, text: 'Say what to do next. It stays open and lands on their Today screen.' },
  ], { shotH: 3.2 });
  s.addNotes('A reason is required both ways and is kept in the history. When approving a sale, check there is a deposit or signed contract. When approving a lost, check the reason makes sense and that the customer really has been contacted.');

  s = d.content('Approvals', 'Fix or hand over an enquiry');
  await d.leftShot(s, shot('m-more-menu'), 'Enquiry with the More menu open');
  await d.points(s, [
    { icon: Lu.LuPencil, head: 'Edit details', text: 'Correct a wrong model, phone or postcode.' },
    { icon: Lu.LuArrowLeftRight, head: 'Reassign', text: 'Give it to another salesperson.' },
    { icon: Lu.LuCopyX, head: 'Duplicate or invalid', text: 'Hides it from reports. Nothing is deleted.' },
    { icon: Lu.LuUndo2, head: 'Re-open', text: 'If a sold or lost was closed by mistake.' },
  ]);
  s.addNotes('These are on the ··· button on any enquiry. Enquiries are never deleted: duplicates and test entries are marked invalid so they drop out of the numbers but stay in the history.');

  d.section('Using it properly', 'Keeping your team on track', 'Ten minutes a day keeps the CRM true',
    'This section is about making sure every salesperson logs every walk-in, follows up on time and closes enquiries promptly.');

  s = d.content('Using it properly', 'Your 10-minute daily routine');
  await d.cards(s, [
    { head: 'Run the morning meeting', text: 'Work down the hit list and round the room.' },
    { head: 'Clear approvals', text: 'Approve or decline everything waiting, with a reason.' },
    { head: 'Check running late', text: 'Filter by salesperson and ask about anything 3+ days late.' },
    { head: 'Spot-check notes', text: 'Open two or three enquiries and read the history.' },
  ], { numbered: true });
  s.addNotes('Do this first thing each morning, ideally before the sales meeting. The morning email gives you the same list if you are not at a desk.');

  s = d.content('Using it properly', 'Check one salesperson’s work');
  {
    const f = await d.framed(s, shot('m-filters'), { x: M, y: TOP, w: 4.4, h: 3.0 }, 'Filters with a salesperson chosen', { top: true, left: true });
    await d.framed(s, shot('m-list-salesperson'), { x: M + 4.75, y: TOP, w: W - 2 * M - 4.75, h: BOTTOM - TOP }, 'Running late enquiries for one salesperson', { top: true });
    await d.points(s, [
      { head: 'Show Running late', text: 'Then tap Filters.' },
      { head: 'Pick the salesperson', text: 'And Show results.' },
    ], { x: M, w: 4.4, top: f.y + f.h + 0.4, bottom: BOTTOM, numbered: true });
  }
  s.addNotes('The same filter works with any view: Open, Due today, Sold, Lost or Awaiting approval. The red pill shows the filter is on; tap the x to clear it. Use this in one-on-ones.');

  s = d.content('Using it properly', 'Compare salespeople in Reports');
  await d.leftShot(s, shot('m-reports'), 'Reports by salesperson');
  await d.points(s, [
    { icon: Lu.LuCalendarRange, head: 'Day, month or year', text: 'Pick the period at the top.' },
    { icon: Lu.LuUsers, head: 'Breakdown by salesperson', text: 'Enquiries, test drives, sold and conversion.' },
    { icon: Lu.LuFileSpreadsheet, head: 'Export to Excel', text: 'The ··· button, top right.' },
  ]);
  s.addNotes('Conversion is enquiries sold divided by enquiries entered in the period. The breakdown can also be by brand, model, source or lost reason. Export gives every enquiry in the period and filter as a spreadsheet.');

  s = d.content('Using it properly', 'See who needs a hand');
  {
    const f = await d.framed(s, shot('m-attention'), { x: M, y: TOP, w: 6.6, h: BOTTOM - TOP }, 'Needs attention list', { top: true, left: true });
    const x = f.x + f.w + 0.7;
    await d.points(s, [
      { icon: Lu.LuTriangleAlert, head: 'Needs attention', text: 'Follow-ups 3+ days late, at the bottom of Reports.' },
      { icon: Lu.LuUser, head: 'Look for a pattern', text: 'One name keeps appearing? Have a chat.' },
      { icon: Lu.LuArrowLeftRight, head: 'Act on it', text: 'Ask them to follow up today, or reassign.' },
    ], { x, w: W - M - x });
  }
  s.addNotes('Needs attention lists follow-ups running late, longest first. Sales managers see it; the general manager does not. Customers who have not been contacted for days are the most likely to buy elsewhere.');

  s = d.content('Using it properly', 'Signs the CRM is not being used properly');
  await d.cards(s, [
    { icon: Lu.LuFootprints, head: 'Low walk-in count', text: 'Fewer logged than you saw on the floor.' },
    { icon: Lu.LuAlarmClock, head: 'Running late piling up', text: 'Follow-ups days late, or pushed back again and again.' },
    { icon: Lu.LuMessageSquareOff, head: 'Empty history', text: 'No comments, or only "No answer".' },
    { icon: Lu.LuCircleHelp, head: 'Vague lost reasons', text: 'Everything "Other", with no detail.' },
    { icon: Lu.LuReceipt, head: 'Sales missing', text: 'A delivery booked but never sent for approval.' },
    { icon: Lu.LuCopy, head: 'Duplicates', text: 'The same customer entered twice.' },
  ], { cols: 3, iconFill: C.accent6, iconColor: HEX.red });
  s.addNotes('Any of these is a coaching conversation, not a telling-off. The fix is nearly always the five salesperson habits: log it on the spot, always set a follow-up, follow up every day, log every call, close it off promptly.');

  d.section('Your team', 'Managing your team', 'Add people, reset passwords, hand over enquiries',
    'The Team page lists everyone in your brands and sites. Managers can add salespeople and change which brands they work on.');

  s = d.content('Your team', 'The Team page');
  await d.leftShot(s, shot('m-team'), 'Team page');
  await d.points(s, [
    { icon: Lu.LuSearch, head: 'Search', text: 'Name, email or brand.' },
    { icon: Lu.LuListFilter, head: 'Filter', text: 'By role, and by site for the GM.' },
    { icon: Lu.LuClock, head: 'Not signed in yet', text: 'They have not started using it.' },
    { icon: Lu.LuMousePointerClick, head: 'Tap a person', text: 'To change brands or use More.' },
  ]);
  s.addNotes('One short row per person: their brands and when they last signed in. Disabled people are hidden; tap Show disabled to see them. Brands and sites decide what each person can see and log.');

  s = d.content('Your team', 'Add a new salesperson');
  await d.twoUp(s, [
    { file: 'm-add-person', name: 'Add a person', head: 'Name, username, brands', icon: Lu.LuUserPlus, text: 'Open their site and tap the brands they sell, then Add person.' },
    { file: 'm-temp-password', name: 'Temporary password', head: 'Temporary password', icon: Lu.LuKeyRound, text: 'Give it to them in person. They choose their own when they first sign in.' },
  ], { shotH: 3.2 });
  s.addNotes('Add an email address so they get the morning reminder. The temporary password is only shown once; if it is lost, use Reset password.');

  s = d.content('Your team', 'When someone leaves or goes on leave');
  await d.twoUp(s, [
    { file: 'm-edit-more', name: 'The More menu on a person', head: 'Tap the person, then More', icon: Lu.LuEllipsis, text: 'Reset password, Move open enquiries or Disable.' },
    { file: 'm-move-open', name: 'Move open enquiries', head: 'Move open enquiries', icon: Lu.LuArrowLeftRight, text: 'Choose who takes their customers. Then More, Disable.' },
  ], { shotH: 3.0 });
  s.addNotes('Disabling someone signs them out straight away. Their enquiries and history are kept and still count in the reports for the period they worked. To hand over a single customer, use Reassign on the ··· button of that enquiry.');

  s = d.content('Your team', 'Help for your role');
  {
    const f = await d.framed(s, shot('m-help'), { x: M, y: TOP, w: 6.4, h: BOTTOM - TOP }, 'Help page for a sales manager', { top: true, left: true });
    const x = f.x + f.w + 0.7;
    await d.points(s, [
      { icon: Lu.LuCircleHelp, head: 'Help in the menu', text: 'Every how-to in this guide.' },
      { icon: Lu.LuUserCheck, head: 'Only your role', text: 'Salespeople see their own version.' },
      { icon: Lu.LuSearch, head: 'Search it', text: 'Try "approve" or "leaves".' },
    ], { x, w: W - M - x });
  }
  s.addNotes('Point new salespeople to Help: it shows them only what they can do. Managers also see approvals, the team and the daily routine; the general manager also sees Admin, backups and the sales board.');

  d.section('General manager', 'General manager', 'The sales board, brand trends and Admin',
    'These screens are only for the general manager (and anyone given the admin flag).');

  s = d.content('General manager', 'Your Today screen');
  await d.leftShot(s, shot('gm-today'), 'General manager Today screen');
  await d.points(s, [
    { icon: Lu.LuTrophy, head: 'Results first', text: 'Walk-ins today, sold today and to approve.' },
    { icon: Lu.LuMapPin, head: 'By site', text: 'Today at a glance, split by site.' },
    { icon: Lu.LuBellOff, head: 'No follow-up lists', text: 'Those are for salespeople and their managers.' },
  ]);
  s.addNotes('The general manager’s Today stays on results: sales, walk-ins and approvals. Follow-ups running late are for sales managers to chase; they also stay out of the general manager’s morning email and Reports.');

  s = d.content('General manager', 'Sales board: who is selling today');
  await d.leftShot(s, shot('gm-board'), 'Sales board');
  await d.points(s, [
    { icon: Lu.LuTrophy, head: 'Leaderboards', text: 'Cars sold today and this month, by salesperson.' },
    { icon: Lu.LuGauge, head: 'The day at the top', text: 'Sold today, this month and conversion.' },
    { icon: Lu.LuRefreshCw, head: 'Live', text: 'Refreshes itself every minute.' },
    { icon: Lu.LuMapPin, head: 'Any site', text: 'All sites, or pick one.' },
  ]);
  s.addNotes('Sales board is in the menu for the general manager only. A sale appears once a manager approves it, at the time the salesperson marked it sold. It is a good screen to leave open on an office display.');

  s = d.content('General manager', 'Every car sold today');
  await d.leftShot(s, shot('gm-board-sold'), 'Sold today list');
  await d.points(s, [
    { icon: Lu.LuClock, head: 'When', text: 'The time it was marked sold.' },
    { icon: Lu.LuUser, head: 'Who and what', text: 'Salesperson, brand, model and site.' },
    { icon: Lu.LuBadgeCheck, head: 'Approved by', text: 'The manager who signed it off.' },
    { icon: Lu.LuMousePointerClick, head: 'Tap a row', text: 'Opens the enquiry.' },
  ]);
  s.addNotes('Test drive, trade-in and finance show under the vehicle. Below this list the board also shows cars sold this month by brand.');

  s = d.content('General manager', 'Brand trends in Reports');
  await d.twoUp(s, [
    { file: 'gm-trends-crop', name: 'Brand trends, brands together', head: 'Together', icon: Lu.LuChartLine, text: 'Up to five brands on one chart. The current month shows by day; tap Months for up to a year.' },
    { file: 'gm-trends-perbrand', name: 'Brand trends, one chart per brand', head: 'Per brand', icon: Lu.LuLayoutGrid, text: 'All brands, one chart each, on the same scale: enquiries, test drives and sold.' },
  ], { shotH: 3.4 });
  s.addNotes('Brand trends is at the top of Reports for the general manager. Tap brands to compare them, or All brands. The bubbles underneath show each brand’s share of enquiries, and the table lists every value.');

  s = d.content('General manager', 'Admin: brands and models');
  await d.twoUp(s, [
    { file: 'gm-sites-crop', name: 'Sites and brands admin', head: 'Sites & brands', icon: Lu.LuStore, text: 'Admin, Sites & brands. Tick which brands each site sells, or add a new brand.' },
    { file: 'gm-models-crop', name: 'Models admin', head: 'Models', icon: Lu.LuCarFront, text: 'Add a model the day it launches. Retire old ones; past enquiries keep them.' },
  ], { shotH: 3.6 });
  s.addNotes('Admin is only for people with the admin flag, normally the general manager. Salespeople can only pick from this model list, which keeps the reports clean. Use the arrows to put the most popular models at the top.');

  s = d.content('General manager', 'Admin: backups and email');
  await d.twoUp(s, [
    { file: 'gm-backups-crop', name: 'Backups admin', head: 'Backups', icon: Lu.LuDatabaseBackup, text: 'A backup runs every night. Check the last one is OK, and email a copy off-site.' },
    { file: 'gm-email', name: 'Email reminder settings', head: 'Email reminders', icon: Lu.LuMail, text: 'Turn on the morning reminders and end-of-day summary for the team.' },
  ], { shotH: 3.6 });
  s.addNotes('If the server ever fails, a backup file can be uploaded on a new server to restore every enquiry. Email settings come from your IT provider; use Send test to check them.');

  pres.addSection({ title: 'Wrap-up' });
  await d.titleSlide('Wrap-up', {
    title: [{ text: 'Approve daily.', options: { breakLine: true } }, { text: 'Coach weekly.' }],
    body: 'If it is not in the CRM, it did not happen.',
    steps: [
      { icon: Lu.LuBadgeCheck, text: 'Clear approvals every morning' },
      { icon: Lu.LuAlarmClock, text: 'Keep follow-ups on time' },
      { icon: Lu.LuChartColumn, text: 'Review Reports in your weekly meeting' },
    ],
    notes: 'Wrap up by agreeing a daily approval time and a weekly review of the Reports page with each salesperson.',
  });

  await d.save('Sunco-Motors-Enquiry-CRM-Sales-Manager-Guide.pptx');
}

(async () => {
  await salesDeck();
  await managerDeck();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
