const express = require('express');
const v = require('../lib/validate');
const scope = require('../lib/scope');
const { forbidden, badRequest } = require('../lib/http');
const { summary, trends } = require('../services/reports');
const { audit } = require('../lib/audit');
const { formatPhone } = require('../lib/validate');

function readFilters(q) {
  return {
    period: q.period ? v.oneOf(q.period, 'period', ['day', 'month', 'year', 'range']) : 'month',
    date: v.isoDate(q.date, 'date'),
    from: v.isoDate(q.from, 'from'),
    to: v.isoDate(q.to, 'to'),
    location_id: v.id(q.location_id, 'location_id'),
    brand_id: v.id(q.brand_id, 'brand_id'),
    salesperson_id: v.id(q.salesperson_id, 'salesperson_id'),
  };
}

function csvCell(value) {
  if (value == null) return '';
  let s = String(value);
  // Stop spreadsheet formula injection from customer-entered text.
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

module.exports = function reportRoutes({ db }) {
  const router = express.Router();

  router.get('/summary', (req, res) => {
    res.json(summary(db, req.user, readFilters(req.query)));
  });

  // Brand trends: general manager (and admins) only.
  router.get('/trends', (req, res) => {
    if (!scope.hasFullAccess(req.user)) throw forbidden('Only the general manager can see brand trends');
    const months = String(req.query.months || '').split(',').filter(Boolean);
    if (months.length > 24 || months.some((m) => !/^\d{4}-(0[1-9]|1[0-2])$/.test(m))) throw badRequest('Choose up to 24 months, as YYYY-MM');
    res.json(trends(db, req.user, { months, location_id: v.id(req.query.location_id, 'location_id') }));
  });

  // Excel-friendly CSV of enquiries in the user's scope (managers and GM).
  router.get('/export.csv', (req, res) => {
    if (!scope.isManager(req.user)) throw forbidden('Only managers can export');
    const f = readFilters(req.query);
    const base = scope.enquiryFilter(db, req.user);
    const where = [base.sql];
    const params = [...base.params];
    if (req.query.include_invalid !== '1') where.push('e.is_invalid = 0');
    if (f.from) {
      where.push('e.entry_date >= ?');
      params.push(f.from);
    }
    if (f.to) {
      where.push('e.entry_date <= ?');
      params.push(f.to);
    }
    for (const [k, col] of [['location_id', 'fr.location_id'], ['brand_id', 'fr.brand_id'], ['salesperson_id', 'e.salesperson_id']]) {
      if (f[k]) {
        where.push(`${col} = ?`);
        params.push(f[k]);
      }
    }
    const rows = db
      .prepare(
        `SELECT e.*, l.name AS location, b.name AS brand, sp.name AS salesperson, m.name AS model, um.name AS used_make,
                COALESCE(ulm.name, uxm.name, e.used_model_other) AS used_model, src.label AS source, lr.label AS lost_reason,
                (SELECT GROUP_CONCAT(a.local_date || ' ' || u.name || ': ' || a.body, ' | ')
                   FROM activities a JOIN users u ON u.id = a.user_id WHERE a.enquiry_id = e.id AND a.type = 'comment') AS comments
         FROM enquiries e
         JOIN franchises fr ON fr.id = e.franchise_id JOIN locations l ON l.id = fr.location_id JOIN brands b ON b.id = fr.brand_id
         JOIN users sp ON sp.id = e.salesperson_id
         LEFT JOIN models m ON m.id = e.model_id LEFT JOIN used_makes um ON um.id = e.used_make_id
         LEFT JOIN models ulm ON ulm.id = e.used_model_id LEFT JOIN used_models uxm ON uxm.id = e.used_extra_model_id
         LEFT JOIN lookup_values src ON src.id = e.source_id LEFT JOIN lookup_values lr ON lr.id = e.lost_reason_id
         WHERE ${where.join(' AND ')} ORDER BY e.entry_date, e.id`
      )
      .all(...params);
    const yn = (x) => (x ? 'Yes' : 'No');
    const header = [
      'Enquiry #', 'Date of entry', 'Month', 'Brand', 'Department', 'Salesperson', 'Customer name', 'Postcode', 'Phone', 'Email',
      'Model', 'Used make', 'Used model', 'Stock number', 'Source', 'Test drive', 'Trade-in', 'Finance', 'Outcome', 'Lost',
      'Lost reason', 'Sold', 'Sold date', 'Next follow-up', 'Comments', 'Duplicate/invalid',
    ];
    const lines = [header.map(csvCell).join(',')];
    for (const r of rows) {
      lines.push(
        [
          r.id, r.entry_date, r.entry_month, r.brand, r.location, r.salesperson, r.customer_name, r.postcode, formatPhone(r.phone), r.email,
          r.model, r.used_make, r.used_model, r.stock_number, r.source, yn(r.test_drive), yn(r.trade_in), yn(r.finance),
          r.outcome[0].toUpperCase() + r.outcome.slice(1), yn(r.outcome === 'lost'), r.lost_reason, yn(r.outcome === 'sold'),
          r.sold_date, r.next_followup_at, r.comments, r.is_invalid ? `Yes: ${r.invalid_reason || ''}` : 'No',
        ]
          .map(csvCell)
          .join(',')
      );
    }
    audit(db, { userId: req.user.id, action: 'export', entity: 'enquiry', after: { rows: rows.length, filters: f } });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="sunco-enquiries-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send('﻿' + lines.join('\r\n'));
  });

  return router;
};
