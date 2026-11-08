// Runs timed jobs once a minute: nightly backup, morning reminders, end-of-day summary.
// Each job runs once per day, at or after its set time (so a restart doesn't skip it).
const { getSettings } = require('../lib/settings');
const { localDate } = require('../lib/time');

function localTime(tz) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
}

function createScheduler({ db, backups, mailer, log = console }) {
  const lastRun = {};
  let timer = null;
  let running = false;

  async function tick() {
    if (running) return;
    running = true;
    try {
      const s = getSettings(db);
      const tz = s.timezone || 'Australia/Brisbane';
      const today = localDate(new Date(), tz);
      const now = localTime(tz);
      const mins = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
      // window: how long after the set time a missed job may still run (e.g. after a restart).
      const due = (job, at, window = 24 * 60) => at && now >= at && mins(now) - mins(at) <= window && lastRun[job] !== today;

      if (due('backup', s['backup.time'] || '02:00')) {
        lastRun.backup = today;
        const already = backups.list().some((b) => b.kind === 'nightly' && b.date === today);
        if (!already) {
          let made = null;
          try {
            made = backups.create('nightly');
          } catch (err) {
            log.error('Nightly backup failed:', err);
            db.prepare("INSERT INTO audit_log (action, entity, after_json) VALUES ('backup_failed', 'backup', ?)").run(JSON.stringify({ error: String(err.message) }));
            await mailer.sendAdminAlert('Nightly backup FAILED', `The nightly database backup failed: ${err.message}`);
          }
          if (made) {
            try {
              await mailer.sendBackup(backups, made.name);
            } catch (err) {
              log.error('Emailing the nightly backup failed:', err);
              db.prepare("INSERT INTO audit_log (action, entity, after_json) VALUES ('backup_email_failed', 'backup', ?)").run(JSON.stringify({ error: String(err.message) }));
            }
          }
        }
      }
      if (due('morning', s['email.morning_time'], 180)) {
        lastRun.morning = today;
        await mailer.sendDigests('morning');
      }
      if (due('eod', s['email.eod_time'], 180)) {
        lastRun.eod = today;
        await mailer.sendDigests('eod');
      }
    } catch (err) {
      log.error('Scheduler error:', err);
    } finally {
      running = false;
    }
  }

  return {
    start() {
      timer = setInterval(tick, 60_000);
      timer.unref();
      setTimeout(tick, 5_000).unref();
    },
    stop() {
      clearInterval(timer);
    },
    tick,
  };
}

module.exports = { createScheduler };
