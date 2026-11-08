// Salesperson guide deck for the Sunco Walk-In CRM.
// Arial throughout so it looks the same in PowerPoint on Windows, Mac and iPad, and in Keynote.
const path = require('path');
const pptxgen = require('pptxgenjs');
const sharp = require('sharp');
const React = require('react');
const ReactDOMServer = require('react-dom/server');
const Lu = require('react-icons/lu');
const { applyTheme } = require('/root/.claude/skills/synced/43e264a4-a330-4b4f-b11f-3bf40a6c7606_839fa6c8-5966-4637-82bb-0236b61d5690/pptx/scripts/apply_theme.js');

const SHOTS = path.join(__dirname, '..', 'trial', 'shots');
const shot = (n) => path.join(SHOTS, n);

const THEME = {
  name: 'Sunco Walk-In',
  headFontFace: 'Arial',
  bodyFontFace: 'Arial',
  colors: {
    dk1: '0F172A', lt1: 'FFFFFF', dk2: '0B3D91', lt2: 'F1F4F8',
    accent1: '0B3D91', accent2: 'F5A623', accent3: '16794A', accent4: 'C0352B', accent5: '5B6578', accent6: 'E7EEFB',
    hlink: '0B3D91', folHlink: '334155',
  },
};
const HEX = { navy: '0B3D91', amber: 'F5A623', ink: '0F172A', white: 'FFFFFF', deep: '0A2A63', line: '4C6FB5' };

// Grid: 13.333 x 7.5. Margins 0.6. Content band from y=1.6 to y=6.65.
const M = 0.6;
const TOP = 1.6;
const BOTTOM = 6.65;
const LEFT_W = 7.6; // screenshot column
const RIGHT_X = M + LEFT_W + 0.55; // 8.75
const RIGHT_W = 13.333 - M - RIGHT_X; // 3.98

async function icon(Comp, color = HEX.navy) {
  const svg = ReactDOMServer.renderToStaticMarkup(React.createElement(Comp, { color: '#' + color, size: '256', strokeWidth: 2 }));
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  return 'image/png;base64,' + buf.toString('base64');
}
async function fit(file, box, { top = false, left = false } = {}) {
  const m = await sharp(file).metadata();
  const r = Math.min(box.w / m.width, box.h / m.height);
  const w = m.width * r;
  const h = m.height * r;
  return { x: left ? box.x : box.x + (box.w - w) / 2, y: top ? box.y : box.y + (box.h - h) / 2, w, h };
}

(async () => {
  const pres = new pptxgen();
  pres.layout = 'LAYOUT_WIDE';
  pres.title = 'Walk-In CRM: Salesperson Guide';
  pres.author = 'Sunco Motors';
  pres.company = 'Sunco Motors';
  pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
  const C = pres.SchemeColor;

  // ---------- Layouts ----------
  pres.defineSlideMaster({
    title: 'Title Dark',
    background: { color: C.accent1 },
    objects: [
      { placeholder: { options: { name: 'title', type: 'title', x: M, y: 2.0, w: 6.9, h: 2.0, fontSize: 46, bold: true, color: C.background1, valign: 'bottom', align: 'left', margin: 0 }, text: '' } },
      { placeholder: { options: { name: 'body', type: 'body', x: M, y: 4.25, w: 6.4, h: 1.3, fontSize: 20, color: C.accent6, valign: 'top', align: 'left', margin: 0 }, text: '' } },
    ],
  });
  pres.defineSlideMaster({
    title: 'Section Dark',
    background: { color: C.accent1 },
    objects: [
      { placeholder: { options: { name: 'title', type: 'title', x: M, y: 2.55, w: 9.5, h: 1.3, fontSize: 44, bold: true, color: C.background1, valign: 'bottom', align: 'left', margin: 0 }, text: '' } },
      { placeholder: { options: { name: 'body', type: 'body', x: M, y: 4.05, w: 9.5, h: 0.9, fontSize: 20, color: C.accent6, valign: 'top', align: 'left', margin: 0 }, text: '' } },
    ],
    slideNumber: { x: 12.3, y: 6.95, w: 0.45, h: 0.3, fontSize: 10, color: C.accent6, align: 'right' },
  });
  pres.defineSlideMaster({
    title: 'Content',
    background: { color: C.background1 },
    objects: [
      { placeholder: { options: { name: 'title', type: 'title', x: M, y: 0.45, w: 12.1, h: 0.85, fontSize: 32, bold: true, color: C.text1, valign: 'middle', align: 'left', margin: 0 }, text: '' } },
      { text: { text: 'Sunco Walk-In CRM  ·  Salesperson guide', options: { x: M, y: 6.95, w: 6, h: 0.3, fontSize: 10, color: C.accent5, margin: 0 } } },
    ],
    slideNumber: { x: 12.3, y: 6.95, w: 0.45, h: 0.3, fontSize: 10, color: C.accent5, align: 'right' },
  });

  const shadow = () => ({ type: 'outer', color: '0F172A', opacity: 0.16, blur: 10, offset: 2, angle: 90 });
  // Screenshot in a white rounded frame, fitted and centred in its box.
  async function framed(slide, file, box, name, opts = { top: true }) {
    const f = await fit(file, { x: box.x + 0.08, y: box.y + 0.08, w: box.w - 0.16, h: box.h - 0.16 }, opts);
    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: f.x - 0.08, y: f.y - 0.08, w: f.w + 0.16, h: f.h + 0.16, rectRadius: 0.1, fill: { color: C.background1 }, line: { color: 'DDE2EA', width: 0.75 }, shadow: shadow(), objectName: `${name} frame` });
    slide.addImage({ path: file, ...f, altText: name, objectName: name });
    return f;
  }
  const leftShot = (slide, file, name) => framed(slide, file, { x: M, y: TOP, w: LEFT_W, h: BOTTOM - TOP }, name);

  // Right-hand column of points. Each point: marker (number or icon) + bold heading + one short line.
  // Rows share the column height evenly, and every text box has room for an extra line of wrap.
  async function points(slide, items, { x = RIGHT_X, w = RIGHT_W, top = TOP + 0.05, bottom = BOTTOM, numbered = false } = {}) {
    const slot = (bottom - top) / items.length;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const y = top + i * slot;
      const d = 0.5;
      if (numbered) {
        slide.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: C.accent2 }, line: { color: C.accent2 }, objectName: `Point ${i + 1} marker` });
        slide.addText(String(i + 1), { x, y, w: d, h: d, fontSize: 16, bold: true, color: C.text1, align: 'center', valign: 'middle', margin: 0, isTextBox: true, objectName: `Point ${i + 1} number` });
      } else {
        slide.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: C.accent6 }, line: { color: C.accent6 }, objectName: `Point ${i + 1} marker` });
        slide.addImage({ data: await icon(it.icon), x: x + 0.13, y: y + 0.13, w: 0.24, h: 0.24, altText: '', objectName: `Point ${i + 1} icon` });
      }
      slide.addText(it.head, { x: x + 0.72, y: y + 0.02, w: w - 0.72, h: 0.46, fontSize: 18, bold: true, color: C.text1, valign: 'middle', margin: 0, isTextBox: true, objectName: `Point ${i + 1} heading` });
      slide.addText(it.text, { x: x + 0.72, y: y + 0.52, w: w - 0.72, h: Math.max(0.6, slot - 0.65), fontSize: 14, color: C.accent5, valign: 'top', margin: 0, isTextBox: true, objectName: `Point ${i + 1} text` });
    }
  }

  // ================= Welcome =================
  pres.addSection({ title: 'Welcome' });
  let s = pres.addSlide({ masterName: 'Title Dark', sectionTitle: 'Welcome' });
  s.addText('SUNCO MOTORS', { x: M, y: 1.4, w: 6, h: 0.4, fontSize: 14, bold: true, charSpacing: 4, color: C.accent2, margin: 0, isTextBox: true, objectName: 'Eyebrow' });
  s.addText([{ text: 'Walk-In CRM', options: { breakLine: true } }, { text: 'Salesperson guide' }], { placeholder: 'title' });
  s.addText('Log every walk-in in 30 seconds, follow up on time and see your own numbers.', { placeholder: 'body' });
  {
    const f = await fit(shot('phone-today.png'), { x: 8.7, y: 0.75, w: 3.5, h: 6.0 });
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: f.x - 0.14, y: f.y - 0.14, w: f.w + 0.28, h: f.h + 0.28, rectRadius: 0.28, fill: { color: HEX.deep }, line: { color: HEX.line, width: 1.25 }, shadow: shadow(), objectName: 'Phone frame' });
    s.addImage({ path: shot('phone-today.png'), ...f, altText: 'The Today screen on a phone', objectName: 'Phone screenshot' });
  }
  s.addNotes('Welcome. This guide shows salespeople how to use the new Walk-In CRM that replaces the walk-in spreadsheet: logging a walk-in, working follow-ups, finding enquiries and reading your own numbers. Everything shown is the real app with demo data.');

  s = pres.addSlide({ masterName: 'Content', sectionTitle: 'Welcome' });
  s.addText('Why we are moving off the spreadsheet', { placeholder: 'title' });
  {
    const cards = [
      { icon: Lu.LuTimer, head: 'Log a walk-in in 30 seconds', text: 'Mostly taps. The date, your name and the site fill themselves in.' },
      { icon: Lu.LuBellRing, head: 'Never miss a follow-up', text: 'Every open enquiry has a next date. Overdue ones go to the top.' },
      { icon: Lu.LuCalendarCheck, head: 'No more month-end tabs', text: 'One list. Enquiries stay open until they are sold or lost.' },
      { icon: Lu.LuChartColumn, head: 'Your numbers, any time', text: 'Enquiries, test drives and conversion for today, the month or the year.' },
    ];
    const gap = 0.4;
    const cw = (13.333 - 2 * M - gap) / 2;
    const ch = (BOTTOM - TOP - gap) / 2;
    for (let i = 0; i < 4; i++) {
      const c = cards[i];
      const x = M + (i % 2) * (cw + gap);
      const y = TOP + Math.floor(i / 2) * (ch + gap);
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w: cw, h: ch, rectRadius: 0.14, fill: { color: C.background2 }, line: { color: C.background2 }, objectName: `Card ${i + 1}` });
      s.addShape(pres.shapes.OVAL, { x: x + 0.45, y: y + 0.45, w: 0.8, h: 0.8, fill: { color: C.accent1 }, line: { color: C.accent1 }, objectName: `Card ${i + 1} icon circle` });
      s.addImage({ data: await icon(c.icon, HEX.white), x: x + 0.65, y: y + 0.65, w: 0.4, h: 0.4, altText: '', objectName: `Card ${i + 1} icon` });
      s.addText(c.head, { x: x + 1.55, y: y + 0.45, w: cw - 1.95, h: 0.6, fontSize: 20, bold: true, color: C.text1, valign: 'middle', margin: 0, isTextBox: true, objectName: `Card ${i + 1} heading` });
      s.addText(c.text, { x: x + 1.55, y: y + 1.12, w: cw - 1.95, h: ch - 1.4, fontSize: 15, color: C.accent5, valign: 'top', margin: 0, isTextBox: true, objectName: `Card ${i + 1} text` });
    }
  }
  s.addNotes('The spreadsheet made people type the same things over and over, and enquiries got lost between monthly tabs. The CRM fixes both: entry is mostly taps, follow-ups are tracked for you, and there is no month-end carry-over.');

  s = pres.addSlide({ masterName: 'Content', sectionTitle: 'Welcome' });
  s.addText('Your day starts on the Today screen', { placeholder: 'title' });
  await leftShot(s, shot('today.png'), 'Today screen');
  await points(s, [
    { head: 'New walk-in', text: 'Tap it when a customer arrives.' },
    { head: 'Overdue', text: 'Follow-ups you missed. Clear these first.' },
    { head: 'Due today', text: 'The people to contact today.' },
    { head: 'Walk-ins today', text: 'Everyone you have logged today.' },
  ], { numbered: true });
  s.addNotes('Sign in with your own username and password. Today is home: work top to bottom, overdue first, then due today. Each list shows the first five, with See all for the rest.');

  // ================= Logging a walk-in =================
  pres.addSection({ title: 'Logging a walk-in' });
  s = pres.addSlide({ masterName: 'Section Dark', sectionTitle: 'Logging a walk-in' });
  s.addText('Logging a walk-in', { placeholder: 'title' });
  s.addText('Three steps, about 30 seconds, while the customer is still with you', { placeholder: 'body' });
  s.addNotes('Open the form from the New walk-in button on Today, the + in the phone menu, or New walk-in at the top of any page. The form has three numbered steps: vehicle, customer and visit.');

  s = pres.addSlide({ masterName: 'Content', sectionTitle: 'Logging a walk-in' });
  s.addText('Step 1: pick the brand and model', { placeholder: 'title' });
  await leftShot(s, shot('step1.png'), 'Vehicle step');
  await points(s, [
    { icon: Lu.LuCarFront, head: 'Tap the brand', text: 'Only the brands you sell appear. One brand is picked for you.' },
    { icon: Lu.LuList, head: 'Choose the model', text: 'From the list, so every model is spelt the same.' },
    { icon: Lu.LuCircleHelp, head: 'Model missing?', text: 'Ask your sales manager to add it.' },
  ]);
  s.addNotes('Brand buttons only show the brands you are assigned to at your site. Models come from a fixed list per brand, which keeps the reports accurate. Managers add new models in Admin and they appear straight away.');

  s = pres.addSlide({ masterName: 'Content', sectionTitle: 'Logging a walk-in' });
  s.addText('Step 2: who is the customer?', { placeholder: 'title' });
  await leftShot(s, shot('step2.png'), 'Customer step with duplicate warning');
  await points(s, [
    { icon: Lu.LuUser, head: 'Name and postcode', text: 'Both required. Type it any way; it is tidied for you.' },
    { icon: Lu.LuPhone, head: 'Phone or email', text: 'At least one. Numbers are checked as you go.' },
    { icon: Lu.LuTriangleAlert, head: 'Already enquiring?', text: 'You are warned if they are already open with someone.' },
  ]);
  s.addNotes('"emma walsh" is saved as "Emma Walsh" and phone numbers are formatted as 0412 345 678. The duplicate warning checks every site, so two salespeople do not chase the same customer. If you see it, speak to that colleague or your manager instead of adding a second enquiry.');

  s = pres.addSlide({ masterName: 'Content', sectionTitle: 'Logging a walk-in' });
  s.addText('Step 3: the visit and next follow-up', { placeholder: 'title' });
  await leftShot(s, shot('step3.png'), 'Visit step');
  await points(s, [
    { head: 'Test drive, trade-in, finance', text: 'Tap each one that applies. Green means yes.' },
    { head: 'Leave it Open', text: 'Unless they bought or walked away today.' },
    { head: 'Pick the next follow-up', text: 'Tap a quick date such as 3 days.' },
    { head: 'Add a comment, then Save', text: 'One line on budget, timing or trade.' },
  ], { numbered: true });
  s.addNotes('Every open enquiry needs a next follow-up date. That date drives the Today screen and the morning email. Saving takes you back to Today.');

  s = pres.addSlide({ masterName: 'Content', sectionTitle: 'Logging a walk-in' });
  s.addText('Used cars: type the make and model', { placeholder: 'title' });
  await leftShot(s, shot('used.png'), 'Used car step');
  await points(s, [
    { icon: Lu.LuKeyboard, head: 'Type it as you say it', text: '"toyota hilux" is saved as Toyota HiLux.' },
    { icon: Lu.LuSpellCheck, head: 'Typos are matched', text: '"hodna" is saved as Honda.' },
    { icon: Lu.LuTag, head: 'Stock number', text: 'Optional. You can search by it later.' },
  ]);
  s.addNotes('Choose Used Cars as the brand. Suggestions appear as you type. A make that has never been entered before is added for next time. Typing is only for used cars; new-car brands always use the model list.');

  // ================= Working your enquiries =================
  pres.addSection({ title: 'Working your enquiries' });
  s = pres.addSlide({ masterName: 'Section Dark', sectionTitle: 'Working your enquiries' });
  s.addText('Working your enquiries', { placeholder: 'title' });
  s.addText('Find a customer, log what happened, close it off', { placeholder: 'body' });
  s.addNotes('This section covers the Enquiries list, the enquiry page, follow-ups, and marking an enquiry sold or lost.');

  s = pres.addSlide({ masterName: 'Content', sectionTitle: 'Working your enquiries' });
  s.addText('Find any enquiry in seconds', { placeholder: 'title' });
  await leftShot(s, shot('list-menu.png'), 'Enquiries list with status menu');
  await points(s, [
    { icon: Lu.LuSearch, head: 'Search', text: 'By name, phone, email or stock number.' },
    { icon: Lu.LuChevronDown, head: 'Show', text: 'Open, Overdue, Due today, Sold, Lost and more.' },
    { icon: Lu.LuListFilter, head: 'Filters', text: 'Narrow by brand or change the order.' },
  ]);
  s.addNotes('Open is the default: everything still in progress, soonest follow-up first. You only see your own enquiries; managers see their whole team. On a tablet the enquiry opens beside the list.');

  s = pres.addSlide({ masterName: 'Content', sectionTitle: 'Working your enquiries' });
  s.addText('Everything about a customer on one page', { placeholder: 'title' });
  await leftShot(s, shot('detail-tablet.png'), 'Enquiry page');
  await points(s, [
    { head: 'Call or SMS', text: 'One tap from your phone.' },
    { head: 'Log follow-up', text: 'Record what happened and the next date.' },
    { head: 'Sold or Lost', text: 'Close it when the customer decides.' },
    { head: 'More (···)', text: 'Edit the details if something changed.' },
  ], { numbered: true });
  s.addNotes('The top of the page shows only what you need to act. More details shows the postcode, source and date of entry. History at the bottom lists every call, comment and change, newest first.');

  s = pres.addSlide({ masterName: 'Content', sectionTitle: 'Working your enquiries' });
  s.addText('Log a follow-up in one step', { placeholder: 'title' });
  const fu = await framed(s, shot('followup.png'), { x: M, y: TOP, w: 5.0, h: BOTTOM - TOP }, 'Log follow-up panel', { top: true, left: true });
  await points(s, [
    { head: 'Tap Log follow-up', text: 'On the customer’s page.' },
    { head: 'What happened?', text: 'Called, No answer, SMS, Email or Other.' },
    { head: 'Pick the next date', text: 'Tap Tomorrow, 3 days, 1 week or 2 weeks.' },
    { head: 'Add a note and Save', text: 'It goes into the history with your name.' },
  ], { x: fu.x + fu.w + 0.9, w: 13.333 - M - (fu.x + fu.w + 0.9), numbered: true });
  s.addNotes('Log every contact, even when there is no answer. It keeps the follow-up date current and shows your manager the work you have put in. The reports count how many follow-ups were done on time.');

  s = pres.addSlide({ masterName: 'Content', sectionTitle: 'Working your enquiries' });
  s.addText('Close it off: Sold or Lost', { placeholder: 'title' });
  {
    const colW = 5.85;
    const gap = 13.333 - 2 * M - 2 * colW;
    const cols = [
      { file: 'sold.png', name: 'Mark as sold', head: 'Sold', icon: Lu.LuBadgeCheck, text: 'Tap Sold, then Mark sold. Today is recorded as the sale date.' },
      { file: 'lost.png', name: 'Why was it lost', head: 'Lost', icon: Lu.LuCircleX, text: 'Pick a reason. Management uses this to see why deals are lost.' },
    ];
    for (let i = 0; i < 2; i++) {
      const c = cols[i];
      const x = M + i * (colW + gap);
      await framed(s, shot(c.file), { x, y: TOP, w: colW, h: 3.35 }, c.name);
      s.addShape(pres.shapes.OVAL, { x, y: 5.2, w: 0.5, h: 0.5, fill: { color: C.accent6 }, line: { color: C.accent6 }, objectName: `${c.head} marker` });
      s.addImage({ data: await icon(c.icon), x: x + 0.13, y: 5.33, w: 0.24, h: 0.24, altText: '', objectName: `${c.head} icon` });
      s.addText(c.head, { x: x + 0.72, y: 5.22, w: colW - 0.72, h: 0.46, fontSize: 18, bold: true, color: C.text1, valign: 'middle', margin: 0, isTextBox: true, objectName: `${c.head} heading` });
      s.addText(c.text, { x: x + 0.72, y: 5.72, w: colW - 0.72, h: 0.85, fontSize: 14, color: C.accent5, valign: 'top', margin: 0, isTextBox: true, objectName: `${c.head} text` });
    }
  }
  s.addNotes('Mark Sold or Lost the day it happens so the numbers stay true. Lost always needs a reason. If an enquiry was closed by mistake, your sales manager can re-open it.');

  s = pres.addSlide({ masterName: 'Content', sectionTitle: 'Working your enquiries' });
  s.addText('It works the same on your phone', { placeholder: 'title' });
  {
    const phones = [
      ['phone-today.png', 'Today'],
      ['phone-list.png', 'Enquiries'],
      ['phone-detail.png', 'A customer'],
      ['phone-new.png', 'New walk-in'],
    ];
    const gap = 0.4;
    const bw = (13.333 - 2 * M - gap * 3) / 4;
    for (let i = 0; i < phones.length; i++) {
      const [file, label] = phones[i];
      const x = M + i * (bw + gap);
      await framed(s, shot(file), { x, y: TOP, w: bw, h: 4.55 }, `${label} on phone`);
      s.addText(label, { x, y: 6.25, w: bw, h: 0.4, fontSize: 16, bold: true, color: C.text1, align: 'center', valign: 'middle', margin: 0, isTextBox: true, objectName: `${label} label` });
    }
  }
  s.addNotes('Add it to your home screen so it opens like an app: in Safari tap Share then Add to Home Screen; in Chrome open the menu and tap Add to Home screen. The bottom bar has Today, Enquiries, + for a new walk-in, Reports and Account.');

  // ================= Your numbers =================
  pres.addSection({ title: 'Your numbers' });
  s = pres.addSlide({ masterName: 'Content', sectionTitle: 'Your numbers' });
  s.addText('See your own numbers any time', { placeholder: 'title' });
  await leftShot(s, shot('reports.png'), 'Reports page');
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: RIGHT_X, y: TOP, w: RIGHT_W, h: 2.2, rectRadius: 0.14, fill: { color: C.accent1 }, line: { color: C.accent1 }, objectName: 'Conversion card' });
  s.addText('33%', { x: RIGHT_X + 0.35, y: TOP + 0.25, w: RIGHT_W - 0.7, h: 0.9, fontSize: 48, bold: true, color: C.background1, valign: 'middle', margin: 0, isTextBox: true, objectName: 'Conversion figure' });
  s.addText('Conversion: 20 sold from 60 enquiries', { x: RIGHT_X + 0.35, y: TOP + 1.2, w: RIGHT_W - 0.7, h: 0.75, fontSize: 15, color: C.accent6, valign: 'top', margin: 0, isTextBox: true, objectName: 'Conversion explanation' });
  await points(s, [
    { icon: Lu.LuCalendarRange, head: 'Day, month or year', text: 'Choose the period at the top.' },
    { icon: Lu.LuChartColumn, head: 'Breakdowns', text: 'By brand, model, source or lost reason.' },
  ], { top: TOP + 2.6 });
  s.addNotes('Conversion is enquiries sold divided by enquiries entered in the period: 20 sold from 60 enquiries is 33%. Salespeople see only their own figures. Each number shows the change from the previous period. More figures shows trade-in and finance rates and follow-ups done on time.');

  // ================= Habits =================
  pres.addSection({ title: 'Habits' });
  s = pres.addSlide({ masterName: 'Content', sectionTitle: 'Habits' });
  s.addText('Five habits that make it work', { placeholder: 'title' });
  {
    const habits = [
      { icon: Lu.LuUserCheck, head: 'Log it on the spot', text: 'While the customer is still with you.' },
      { icon: Lu.LuCalendarClock, head: 'Always set a follow-up', text: 'No date means no reminder.' },
      { icon: Lu.LuSunrise, head: 'Clear overdue first', text: 'Open Today each morning and work down.' },
      { icon: Lu.LuPhoneCall, head: 'Log every call', text: 'Even no answer. It shows the work you put in.' },
      { icon: Lu.LuCircleCheckBig, head: 'Close it off promptly', text: 'Mark Sold or Lost the day it happens.' },
    ];
    const gap = 0.35;
    const cw = (13.333 - 2 * M - gap * 2) / 3;
    const ch = (BOTTOM - TOP - gap) / 2;
    const pos = [
      [M, TOP], [M + cw + gap, TOP], [M + 2 * (cw + gap), TOP],
      [M + (cw + gap) / 2, TOP + ch + gap], [M + (cw + gap) * 1.5, TOP + ch + gap],
    ];
    for (let i = 0; i < habits.length; i++) {
      const hb = habits[i];
      const [x, y] = pos[i];
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w: cw, h: ch, rectRadius: 0.14, fill: { color: C.background2 }, line: { color: C.background2 }, objectName: `Habit ${i + 1}` });
      s.addShape(pres.shapes.OVAL, { x: x + 0.35, y: y + 0.35, w: 0.62, h: 0.62, fill: { color: C.accent2 }, line: { color: C.accent2 }, objectName: `Habit ${i + 1} icon circle` });
      s.addImage({ data: await icon(hb.icon, HEX.ink), x: x + 0.5, y: y + 0.5, w: 0.32, h: 0.32, altText: '', objectName: `Habit ${i + 1} icon` });
      s.addText(hb.head, { x: x + 0.35, y: y + 1.12, w: cw - 0.7, h: 0.45, fontSize: 17, bold: true, color: C.text1, valign: 'top', margin: 0, isTextBox: true, objectName: `Habit ${i + 1} heading` });
      s.addText(hb.text, { x: x + 0.35, y: y + 1.65, w: cw - 0.7, h: ch - 1.8, fontSize: 14, color: C.accent5, valign: 'top', margin: 0, isTextBox: true, objectName: `Habit ${i + 1} text` });
    }
  }
  s.addNotes('These habits are what make the CRM useful. If everyone logs every walk-in and keeps follow-up dates current, nobody has to rebuild a spreadsheet at month end.');

  // ================= Close =================
  pres.addSection({ title: 'Wrap-up' });
  s = pres.addSlide({ masterName: 'Title Dark', sectionTitle: 'Wrap-up' });
  s.addText([{ text: 'Every walk-in.', options: { breakLine: true } }, { text: 'Every time.' }], { placeholder: 'title' });
  s.addText('Questions about access, brands or models? Ask your sales manager.', { placeholder: 'body' });
  {
    const items = [
      { icon: Lu.LuLogIn, text: 'Sign in with your own login' },
      { icon: Lu.LuSmartphone, text: 'Add it to your phone' },
      { icon: Lu.LuMail, text: 'Watch for the morning email' },
    ];
    const x = 8.4;
    const w = 13.333 - M - x;
    for (let i = 0; i < items.length; i++) {
      const y = 2.0 + i * 1.3;
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h: 1.0, rectRadius: 0.14, fill: { color: HEX.deep }, line: { color: HEX.line, width: 0.75 }, objectName: `Next step ${i + 1}` });
      s.addImage({ data: await icon(items[i].icon, HEX.amber), x: x + 0.32, y: y + 0.3, w: 0.4, h: 0.4, altText: '', objectName: `Next step ${i + 1} icon` });
      s.addText(items[i].text, { x: x + 0.95, y, w: w - 1.15, h: 1.0, fontSize: 17, bold: true, color: C.background1, valign: 'middle', margin: 0, isTextBox: true, objectName: `Next step ${i + 1} text` });
    }
  }
  s.addNotes('Close by asking everyone to sign in today, add the app to their phone and log their next walk-in in the CRM instead of the spreadsheet. Forgotten passwords are reset by a sales manager.');

  const out = path.join(__dirname, 'Sunco-Walk-In-CRM-Salesperson-Guide.pptx');
  await pres.writeFile({ fileName: out });
  await applyTheme(out, THEME);
  console.log('Wrote', out);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
