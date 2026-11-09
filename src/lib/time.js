// Dates are worked out in the dealership's time zone so "today" and "this month" match the showroom clock.
const DEFAULT_TZ = 'Australia/Brisbane';

function localDate(date = new Date(), timeZone = DEFAULT_TZ) {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function addDays(isoDate, days) {
  const d = new Date(isoDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function monthOf(isoDate) {
  return isoDate.slice(0, 7);
}

function nowIso() {
  return new Date().toISOString();
}

module.exports = { DEFAULT_TZ, localDate, addDays, monthOf, nowIso };
