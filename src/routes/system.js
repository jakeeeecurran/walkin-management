// Backups, spreadsheet import and test email (general manager / admin only).
const express = require('express');
const v = require('../lib/validate');
const scope = require('../lib/scope');
const { audit } = require('../lib/audit');
const { forbidden, notFound, badRequest } = require('../lib/http');

module.exports = function systemRoutes({ db, backups, importer, mailer }) {
  const router = express.Router();
  const upload = (limit) => express.raw({ type: 'application/octet-stream', limit });

  router.use((req, res, next) => {
    if (!scope.hasFullAccess(req.user)) return next(forbidden('Only the general manager or an admin can do that'));
    next();
  });
  const adminOnly = (req) => {
    if (req.user.is_admin !== 1) throw forbidden('Only an admin can do that');
  };

  // ---- Backups ----
  router.get('/backups', (req, res) => {
    const items = backups.list();
    const nightly = items.find((b) => b.kind === 'nightly');
    const failures = db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'backup_failed' AND created_at > datetime('now', '-2 days')").get().n;
    res.json({ items, last_nightly: nightly ?? null, recent_failures: failures, location: backups.dir });
  });

  router.post('/backups', (req, res) => {
    const b = backups.create('manual');
    audit(db, { userId: req.user.id, action: 'backup', entity: 'backup', after: { name: b.name } });
    res.status(201).json({ backup: b });
  });

  router.get('/backups/:name', (req, res) => {
    const file = backups.filePath(req.params.name);
    if (!file) throw notFound('Backup not found');
    audit(db, { userId: req.user.id, action: 'download_backup', entity: 'backup', after: { name: req.params.name } });
    res.download(file, req.params.name);
  });

  // Restore from a stored backup (by name) or an uploaded backup file.
  router.post('/backups/:name/restore', (req, res) => {
    adminOnly(req);
    if (req.body?.confirm !== 'RESTORE') throw badRequest('Type RESTORE to confirm');
    const file = backups.filePath(req.params.name);
    if (!file) throw notFound('Backup not found');
    const result = backups.restore(file);
    audit(db, { userId: req.user.id, action: 'restore', entity: 'backup', after: { name: req.params.name, ...result } });
    res.json(result);
  });

  // Restore from an uploaded file: an emailed .sunco-backup (passphrase in a header), .gz or .db.
  router.post('/backups-upload/restore', upload('200mb'), (req, res) => {
    adminOnly(req);
    if (req.get('x-confirm') !== 'RESTORE') throw badRequest('Type RESTORE to confirm');
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw badRequest('Choose a backup file');
    const passphrase = req.get('x-backup-passphrase') ? decodeURIComponent(req.get('x-backup-passphrase')) : '';
    const result = backups.restoreFromBuffer(req.body, passphrase);
    audit(db, { userId: req.user.id, action: 'restore', entity: 'backup', after: { name: 'uploaded file', ...result } });
    res.json(result);
  });

  router.post('/backups/:name/email', async (req, res, next) => {
    try {
      if (!backups.filePath(req.params.name)) throw notFound('Backup not found');
      const r = await mailer.sendBackup(backups, req.params.name, { force: true });
      if (r.skipped) throw badRequest(`Not sent: ${r.skipped}`);
      audit(db, { userId: req.user.id, action: 'email_backup', entity: 'backup', after: { name: req.params.name, recipients: r.sent } });
      res.json(r);
    } catch (err) {
      if (!err.status) err = Object.assign(new Error(`Could not send: ${err.message}`), { status: 400 });
      next(err);
    }
  });

  // ---- Spreadsheet import ----
  router.post('/import/preview', upload('20mb'), async (req, res, next) => {
    try {
      if (!Buffer.isBuffer(req.body) || !req.body.length) throw badRequest('Choose an Excel file');
      res.json(await importer.preview(req.body));
    } catch (err) {
      next(err);
    }
  });

  router.post('/import/run', (req, res) => {
    const token = v.text(req.body?.token, 'token', { required: true, max: 64 });
    res.json(importer.run(req.user, token, req.body?.sheets, req.body?.dry_run !== false));
  });

  // ---- Email ----
  router.post('/email/test', async (req, res, next) => {
    try {
      const to = v.email(req.body?.to ?? req.user.email, 'to');
      if (!to) throw new v.ValidationError('to', 'Enter an email address to send the test to');
      await mailer.sendTest(to);
      res.json({ ok: true });
    } catch (err) {
      if (!err.status) err = Object.assign(new Error(`Could not send: ${err.message}`), { status: 400 });
      next(err);
    }
  });

  router.post('/email/send-now', async (req, res, next) => {
    try {
      const kind = v.oneOf(req.body?.kind, 'kind', ['morning', 'eod']);
      res.json(await mailer.sendDigests(kind));
    } catch (err) {
      next(err);
    }
  });

  return router;
};
