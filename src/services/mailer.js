// Email reminders and summaries. Nothing is sent until SMTP details are entered in
// Admin → Settings and email is switched on.
const nodemailer = require('nodemailer');
const { getSettings } = require('../lib/settings');
const scope = require('../lib/scope');
const { summary } = require('./reports');
const { addDays, localDate } = require('../lib/time');
const { formatPhone } = require('../lib/validate');

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function createMailer({ db, transportFactory = nodemailer.createTransport }) {
  function config() {
    const s = getSettings(db);
    return {
      enabled: s['email.enabled'] === '1' && !!s['email.smtp_host'] && !!s['email.from'],
      host: s['email.smtp_host'],
      port: Number(s['email.smtp_port'] || 587),
      secure: s['email.smtp_secure'] === '1',
      user: s['email.smtp_user'],
      pass: s['email.smtp_password'],
      from: s['email.from'],
      appUrl: s['email.app_url'] || '',
      dealer: s['branding.name'] || 'Sunco Motors',
      colour: s['branding.primary_colour'] || '#0B3D91',
      tz: s.timezone || 'Australia/Brisbane',
    };
  }

  async function send(to, subject, html, text, cfg = config()) {
    const transport = transportFactory({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
    });
    await transport.sendMail({ from: cfg.from, to, subject, html, text });
  }

  function wrap(cfg, title, bodyHtml) {
    return `<!doctype html><html><body style="margin:0;background:#f4f6f9;font-family:Segoe UI,Arial,sans-serif;color:#1a1f2b">
<div style="max-width:640px;margin:0 auto;padding:16px">
<div style="background:${esc(cfg.colour)};color:#fff;padding:14px 18px;border-radius:10px 10px 0 0;font-weight:700">${esc(cfg.dealer)} Walk-In CRM</div>
<div style="background:#fff;padding:18px;border-radius:0 0 10px 10px;border:1px solid #d9dee7;border-top:0">
<h2 style="margin:0 0 12px;font-size:18px">${esc(title)}</h2>${bodyHtml}
${cfg.appUrl ? `<p style="margin-top:20px"><a href="${esc(cfg.appUrl)}" style="background:${esc(cfg.colour)};color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;display:inline-block">Open the CRM</a></p>` : ''}
<p style="color:#5d6677;font-size:12px;margin-top:20px">You can turn these emails off under Account in the CRM.</p>
</div></div></body></html>`;
  }

  function enquiryTable(cfg, rows) {
    if (!rows.length) return '<p>None.</p>';
    const link = (r) => (cfg.appUrl ? `<a href="${esc(cfg.appUrl)}/#/enquiries/${r.id}">${esc(r.customer_name)}</a>` : esc(r.customer_name));
    return `<table style="border-collapse:collapse;width:100%;font-size:14px">
<tr style="text-align:left;color:#5d6677"><th style="padding:6px 4px">Customer</th><th style="padding:6px 4px">Phone</th><th style="padding:6px 4px">Vehicle</th><th style="padding:6px 4px">Due</th></tr>
${rows
  .map(
    (r) => `<tr style="border-top:1px solid #e6e9ef"><td style="padding:6px 4px">${link(r)}</td><td style="padding:6px 4px">${esc(formatPhone(r.phone) || r.email || '')}</td>
<td style="padding:6px 4px">${esc(r.brand)} ${esc(r.vehicle || '')}${r.salesperson_name ? ` <span style="color:#5d6677">· ${esc(r.salesperson_name)}</span>` : ''}</td>
<td style="padding:6px 4px">${esc(r.next_followup_at)}</td></tr>`
  )
  .join('')}</table>`;
  }

  const FOLLOWUPS = `
    SELECT e.id, e.customer_name, e.phone, e.email, e.next_followup_at, b.name AS brand, sp.name AS salesperson_name,
           COALESCE(m.name, um.name || ' ' || COALESCE(ulm.name, uxm.name, e.used_model_other), '') AS vehicle
    FROM enquiries e JOIN franchises fr ON fr.id = e.franchise_id JOIN brands b ON b.id = fr.brand_id JOIN users sp ON sp.id = e.salesperson_id
    LEFT JOIN models m ON m.id = e.model_id LEFT JOIN used_makes um ON um.id = e.used_make_id
    LEFT JOIN models ulm ON ulm.id = e.used_model_id LEFT JOIN used_models uxm ON uxm.id = e.used_extra_model_id`;

  // Builds the morning email for one user, or null if there's nothing to say.
  function morningEmail(cfg, user, today) {
    const f = scope.enquiryFilter(db, user);
    if (user.role === 'salesperson') {
      const rows = db
        .prepare(`${FOLLOWUPS} WHERE ${f.sql} AND e.is_invalid = 0 AND e.outcome = 'open' AND e.salesperson_id = ? AND e.next_followup_at <= ? ORDER BY e.next_followup_at`)
        .all(...f.params, user.id, today);
      if (!rows.length) return null;
      const overdue = rows.filter((r) => r.next_followup_at < today);
      const due = rows.filter((r) => r.next_followup_at === today);
      const title = `You have ${due.length} follow-up${due.length === 1 ? '' : 's'} today${overdue.length ? `, ${overdue.length} overdue` : ''}`;
      const html = `${overdue.length ? `<h3 style="color:#b42318;font-size:15px">Overdue</h3>${enquiryTable(cfg, overdue)}` : ''}
<h3 style="font-size:15px">Due today</h3>${enquiryTable(cfg, due)}`;
      const text = rows.map((r) => `${r.next_followup_at}  ${r.customer_name}  ${formatPhone(r.phone) || r.email || ''}  ${r.brand} ${r.vehicle}`).join('\n');
      return { subject: title, html: wrap(cfg, title, html), text: `${title}\n\n${text}` };
    }
    // Managers and GM: team overdue follow-ups (escalated ones highlighted) and yesterday's walk-ins.
    const s = summary(db, user, { period: 'day', date: addDays(today, -1) });
    const overdue = db
      .prepare(`${FOLLOWUPS} WHERE ${f.sql} AND e.is_invalid = 0 AND e.outcome = 'open' AND e.next_followup_at < ? ORDER BY e.next_followup_at LIMIT 100`)
      .all(...f.params, today);
    const escalationDays = s.followups.escalation_days;
    const escalated = overdue.filter((r) => r.next_followup_at <= addDays(today, -escalationDays));
    const title = `Morning summary: ${s.totals.enquiries} walk-in${s.totals.enquiries === 1 ? '' : 's'} yesterday, ${overdue.length} overdue follow-up${overdue.length === 1 ? '' : 's'}`;
    const brandRows = s.by_location_brand.map((g) => `<tr><td style="padding:4px">${esc(g.label)}</td><td style="padding:4px;text-align:right">${g.enquiries}</td><td style="padding:4px;text-align:right">${g.test_drives}</td><td style="padding:4px;text-align:right">${g.sold}</td></tr>`).join('');
    const html = `<h3 style="font-size:15px">Yesterday (${esc(s.period.from)})</h3>
${s.totals.enquiries ? `<table style="border-collapse:collapse;font-size:14px"><tr style="color:#5d6677;text-align:left"><th style="padding:4px">Brand</th><th style="padding:4px">Walk-ins</th><th style="padding:4px">Test drives</th><th style="padding:4px">Sold</th></tr>${brandRows}</table>` : '<p>No walk-ins recorded.</p>'}
${escalated.length ? `<h3 style="color:#b42318;font-size:15px">Overdue by ${escalationDays}+ days (${escalated.length})</h3>${enquiryTable(cfg, escalated)}` : ''}
<h3 style="font-size:15px">All overdue follow-ups (${overdue.length})</h3>${enquiryTable(cfg, overdue.filter((r) => !escalated.includes(r)))}`;
    return { subject: title, html: wrap(cfg, title, html), text: title };
  }

  function endOfDayEmail(cfg, user, today) {
    const s = summary(db, user, { period: 'day', date: today });
    const m = summary(db, user, { period: 'month', date: today });
    const t = s.totals;
    const title = `End of day ${today}: ${t.enquiries} walk-in${t.enquiries === 1 ? '' : 's'}, ${t.test_drives} test drive${t.test_drives === 1 ? '' : 's'}, ${s.totals.cars_sold} sold`;
    const rows = s.by_salesperson.map((g) => `<tr><td style="padding:4px">${esc(g.label)}</td><td style="padding:4px;text-align:right">${g.enquiries}</td><td style="padding:4px;text-align:right">${g.test_drives}</td><td style="padding:4px;text-align:right">${g.sold}</td></tr>`).join('');
    const html = `<p><b>Today:</b> ${t.enquiries} walk-ins · ${t.test_drives} test drives · ${s.totals.cars_sold} cars sold · follow-ups done ${s.followups.done} (${s.followups.on_time} on time) · ${s.followups.overdue} overdue</p>
${rows ? `<table style="border-collapse:collapse;font-size:14px"><tr style="color:#5d6677;text-align:left"><th style="padding:4px">Salesperson</th><th style="padding:4px">Walk-ins</th><th style="padding:4px">Test drives</th><th style="padding:4px">Sold</th></tr>${rows}</table>` : ''}
<p><b>Month to date:</b> ${m.totals.enquiries} enquiries · ${m.totals.sold} sold · conversion ${m.totals.conversion ?? 0}% · ${m.totals.cars_sold} cars sold this month</p>`;
    return { subject: title, html: wrap(cfg, title, html), text: title };
  }

  function alreadySent(kind, userId, day) {
    return !!db.prepare("SELECT 1 FROM email_log WHERE kind = ? AND IFNULL(user_id, 0) = ? AND day = ? AND status = 'sent'").get(kind, userId ?? 0, day);
  }
  function record(kind, userId, day, status, detail) {
    db.prepare('INSERT INTO email_log (kind, user_id, day, status, detail) VALUES (?, ?, ?, ?, ?)').run(kind, userId ?? null, day, status, detail ?? null);
  }

  // Sends one kind of digest to everyone who should get it today (once per person per day).
  async function sendDigests(kind) {
    const cfg = config();
    if (!cfg.enabled) return { sent: 0, skipped: 'email not configured' };
    const today = localDate(new Date(), cfg.tz);
    const users = db.prepare("SELECT * FROM users WHERE active = 1 AND notify_email = 1 AND email IS NOT NULL AND email != ''").all();
    let sent = 0;
    for (const user of users) {
      if (kind === 'eod' && !scope.isManager(user)) continue;
      if (alreadySent(kind, user.id, today)) continue;
      const msg = kind === 'morning' ? morningEmail(cfg, user, today) : endOfDayEmail(cfg, user, today);
      if (!msg) continue;
      try {
        await send(user.email, msg.subject, msg.html, msg.text, cfg);
        record(kind, user.id, today, 'sent');
        sent++;
      } catch (err) {
        record(kind, user.id, today, 'failed', String(err.message).slice(0, 300));
      }
    }
    return { sent };
  }

  async function sendAdminAlert(subject, message) {
    const cfg = config();
    if (!cfg.enabled) return;
    const admins = db.prepare("SELECT email FROM users WHERE active = 1 AND is_admin = 1 AND email IS NOT NULL AND email != ''").all();
    for (const a of admins) {
      await send(a.email, subject, wrap(cfg, subject, `<p>${esc(message)}</p>`), message, cfg).catch(() => {});
    }
  }

  async function sendTest(to) {
    const cfg = config();
    if (!cfg.host || !cfg.from) throw Object.assign(new Error('Enter the SMTP server and From address first'), { status: 400 });
    await send(to, 'Test email from the Walk-In CRM', wrap(cfg, 'Email is working', '<p>This is a test email. Reminders will be sent from this address.</p>'), 'Email is working.', cfg);
  }

  return { config, sendDigests, sendAdminAlert, sendTest, morningEmail, endOfDayEmail };
}

module.exports = { createMailer };
