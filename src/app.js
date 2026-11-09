const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const { createAuth } = require('./auth');
const { HttpError } = require('./lib/http');
const { DEFAULT_TZ } = require('./lib/time');
const referenceRoutes = require('./routes/reference');
const enquiryRoutes = require('./routes/enquiries');
const userRoutes = require('./routes/users');
const reportRoutes = require('./routes/reports');
const adminRoutes = require('./routes/admin');
const systemRoutes = require('./routes/system');
const { createBackupService } = require('./services/backup');
const { createImporter } = require('./services/importer');
const { createMailer } = require('./services/mailer');

function createApp({ db, secret, backupDir, cookieSecure = false, trustProxy = false, logErrors = true, transportFactory }) {
  const app = express();
  if (trustProxy) app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: cookieSecure ? [] : null,
        },
      },
    })
  );
  app.use(cookieParser());
  app.use(express.json({ limit: '100kb' }));

  // CSRF protection: session cookies are SameSite=Strict, and any request that changes data
  // must be JSON (or a file upload carrying the X-Sunco-Upload header) from this same site.
  app.use('/api', (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const isUpload = req.is('application/octet-stream') && req.get('x-sunco-upload') === '1';
    if (!req.is('application/json') && !isUpload) return next(new HttpError(415, 'Requests must be sent as JSON'));
    const origin = req.get('origin');
    if (origin) {
      let host;
      try {
        host = new URL(origin).host;
      } catch {
        host = null;
      }
      if (host !== req.get('host')) return next(new HttpError(403, 'Cross-site request blocked'));
    }
    next();
  });

  const timeZone = db.prepare("SELECT value FROM settings WHERE key = 'timezone'").get()?.value || DEFAULT_TZ;
  const auth = createAuth({ db, secret, cookieSecure });
  const services = {
    backups: createBackupService({ db, dir: backupDir }),
    importer: createImporter({ db }),
    mailer: createMailer({ db, ...(transportFactory ? { transportFactory } : {}) }),
  };
  app.locals.services = services;

  app.get('/api/health', (req, res) => res.json({ ok: true }));

  // Branding is public so the sign-in page can show the dealership name and colours.
  app.get('/api/branding', (req, res) => {
    const rows = db.prepare("SELECT key, value FROM settings WHERE key LIKE 'branding.%'").all();
    res.json(Object.fromEntries(rows.map((r) => [r.key.replace('branding.', ''), r.value])));
  });

  app.use('/api/auth', auth.router);
  app.use('/api', auth.authenticate, auth.requirePasswordCurrent);
  app.use('/api/reference', referenceRoutes({ db }));
  app.use('/api/enquiries', enquiryRoutes({ db, timeZone }));
  app.use('/api/users', userRoutes({ db }));
  app.use('/api/reports', reportRoutes({ db }));
  app.use('/api/admin', adminRoutes({ db }));
  app.use('/api/admin', systemRoutes({ db, backups: services.backups, importer: services.importer, mailer: services.mailer }));

  app.use('/api', (req, res, next) => next(new HttpError(404, 'Not found')));

  app.use(express.static(path.join(__dirname, '..', 'public'), { index: 'index.html' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') err = new HttpError(400, 'Invalid JSON');
    const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
    if (status >= 500 && logErrors) console.error(err);
    res.status(status).json({
      error: status >= 500 ? 'Something went wrong. Please try again.' : err.message,
      ...(err.field ? { field: err.field } : {}),
    });
  });

  return app;
}

module.exports = { createApp };
