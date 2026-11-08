// Reports: end-of-day, month-to-date and year-to-date figures with breakdowns.
(function () {
  const CRM = window.CRM;
  const { h } = CRM;

  let state = { period: 'day', date: null, month: null, from: null, to: null, location_id: '', brand_id: '', salesperson_id: '' };

  CRM.route(/^\/reports$/, async (main, _, params) => {
    const ref = await CRM.loadRef();
    const t = CRM.today();
    state = {
      ...state,
      date: state.date || t,
      month: state.month || t.slice(0, 7),
      from: state.from || t.slice(0, 7) + '-01',
      to: state.to || t,
      ...(params.period ? { period: params.period } : {}),
    };

    const query = () => {
      const base = { location_id: state.location_id, brand_id: state.brand_id, salesperson_id: state.salesperson_id };
      if (state.period === 'day') return { ...base, period: 'day', date: state.date };
      if (state.period === 'month') return { ...base, period: 'month', date: state.month === t.slice(0, 7) ? t : `${state.month}-28` };
      if (state.period === 'year') return { ...base, period: 'year', date: t };
      return { ...base, period: 'range', from: state.from, to: state.to };
    };

    const body = h('div', null, h('div', { class: 'loading' }, 'Loading…'));
    const rerender = () => draw().catch(CRM.fail);

    const tabs = h(
      'div',
      { class: 'chips', role: 'group', 'aria-label': 'Period' },
      [['day', 'Day'], ['month', 'Month'], ['year', 'Year to date'], ['range', 'Date range']].map(([k, l]) =>
        h('button', { type: 'button', class: 'chip', 'aria-pressed': String(state.period === k), onclick: () => { state.period = k; CRM.render(); } }, l)
      )
    );
    const periodInputs = [];
    if (state.period === 'day') periodInputs.push(h('input', { type: 'date', max: t, value: state.date, 'aria-label': 'Day', onchange: (e) => { state.date = e.target.value || t; rerender(); } }));
    if (state.period === 'month') periodInputs.push(h('input', { type: 'month', max: t.slice(0, 7), value: state.month, 'aria-label': 'Month', onchange: (e) => { state.month = e.target.value || t.slice(0, 7); rerender(); } }));
    if (state.period === 'range') {
      periodInputs.push(
        h('input', { type: 'date', value: state.from, 'aria-label': 'From', onchange: (e) => { state.from = e.target.value; rerender(); } }),
        h('span', { class: 'muted' }, 'to'),
        h('input', { type: 'date', value: state.to, 'aria-label': 'To', onchange: (e) => { state.to = e.target.value; rerender(); } })
      );
    }
    const sel = (label, key, options) =>
      options.length > 1 ? CRM.select([{ value: '', label }, ...options], state[key], { 'aria-label': label, onchange: (e) => { state[key] = e.target.value; rerender(); } }) : null;
    const filters = [
      ...periodInputs,
      sel('All sites', 'location_id', ref.locations.map((l) => ({ value: l.id, label: l.name }))),
      sel('All brands', 'brand_id', ref.brands.map((b) => ({ value: b.id, label: b.name }))),
      CRM.isManager() ? sel('All salespeople', 'salesperson_id', ref.assignees.map((u) => ({ value: u.id, label: u.name }))) : null,
    ].filter(Boolean);

    const exportBtn = CRM.isManager()
      ? h('button', {
          type: 'button',
          onclick: () => {
            const q = query();
            const s = window.__lastReport?.period;
            const p = CRM.qs({ from: s?.from, to: s?.to, location_id: q.location_id, brand_id: q.brand_id, salesperson_id: q.salesperson_id });
            window.location.href = `/api/reports/export.csv${p}`;
          },
        }, 'Export to Excel (CSV)')
      : null;

    main.replaceChildren(
      h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Reports'), h('p', { class: 'muted small' }, CRM.isManager() ? 'Figures for the brands and sites you look after.' : 'Your own figures.')), exportBtn),
      h('div', { class: 'stack', style: { marginBottom: '16px' } }, tabs, h('div', { class: 'filters' }, filters)),
      body
    );

    async function draw() {
      const r = await CRM.get(`/api/reports/summary${CRM.qs(query())}`);
      window.__lastReport = r;
      body.replaceChildren(...renderReport(r));
    }
    await draw();
  });

  function delta(cur, prev, { suffix = '', points } = {}) {
    if (prev == null || cur == null) return '';
    const d = Math.round((cur - prev) * 10) / 10;
    const prevLabel = `${prev}${points ? '%' : suffix}`;
    if (d === 0) return `Same as previous period (${prevLabel})`;
    return `${d > 0 ? '▲' : '▼'} ${Math.abs(d)}${points ? ' pts' : suffix} vs ${prevLabel} previous`;
  }

  function kpi(label, value, sub, opts = {}) {
    return h('div', { class: ['kpi', opts.hero && 'hero'] }, h('div', { class: 'label' }, label), h('div', { class: 'value' }, value), sub ? h('div', { class: 'delta' }, sub) : null);
  }

  function bar(pctValue) {
    const v = pctValue == null ? 0 : Math.max(0, Math.min(100, pctValue));
    return h('div', { class: 'barcell', title: `${pctValue ?? 0}%` }, h('div', { class: 'bar', 'aria-hidden': 'true' }, h('i', { style: { width: `${v}%` } })), h('span', null, CRM.pct(pctValue)));
  }

  function groupTable(title, rows, { first = 'Name', note } = {}) {
    if (!rows.length) return null;
    return h(
      'section',
      { class: 'card' },
      h('div', { class: 'card-head' }, h('h2', null, title), note ? h('span', { class: 'muted small' }, note) : null),
      h(
        'div',
        { class: 'table-wrap' },
        h(
          'table',
          { class: 'data' },
          h('thead', null, h('tr', null, h('th', null, first), h('th', { class: 'num' }, 'Enquiries'), h('th', { class: 'num' }, 'Test drives'), h('th', { class: 'num' }, 'Sold'), h('th', { class: 'num' }, 'Lost'), h('th', null, 'Conversion'))),
          h(
            'tbody',
            null,
            rows.map((g) =>
              h('tr', null, h('td', null, g.label), h('td', { class: 'num' }, g.enquiries), h('td', { class: 'num' }, g.test_drives), h('td', { class: 'num' }, g.sold), h('td', { class: 'num' }, g.lost), h('td', null, bar(g.conversion)))
            )
          )
        )
      )
    );
  }

  function enquiryLinks(title, rows, emptyText, extra) {
    return h(
      'section',
      { class: 'card' },
      h('div', { class: 'card-head' }, h('h2', null, `${title} (${rows.length})`), extra ? h('span', { class: 'muted small' }, extra) : null),
      rows.length
        ? h(
            'div',
            { class: 'table-wrap' },
            h(
              'table',
              { class: 'data' },
              h('thead', null, h('tr', null, ['Customer', 'Brand · site', 'Vehicle', 'Salesperson', 'Entered', 'Follow-up', 'Status'].map((x) => h('th', null, x)))),
              h(
                'tbody',
                null,
                rows.map((e) =>
                  h(
                    'tr',
                    { class: 'clickable', onclick: () => CRM.go(`#/enquiries/${e.id}`) },
                    h('td', null, h('a', { href: `#/enquiries/${e.id}` }, e.customer_name)),
                    h('td', null, `${e.brand} · ${e.location}`),
                    h('td', null, e.vehicle),
                    h('td', null, e.salesperson),
                    h('td', null, CRM.fmtDate(e.entry_date)),
                    h('td', null, e.outcome === 'open' ? CRM.relDay(e.next_followup_at) : ''),
                    h('td', null, e.outcome[0].toUpperCase() + e.outcome.slice(1) + (e.test_drive ? ' · TD' : ''))
                  )
                )
              )
            )
          )
        : h('p', { class: 'empty' }, emptyText)
    );
  }

  function renderReport(r) {
    const t = r.totals;
    const p = r.previous;
    const periodName = { day: 'day', month: 'month', year: 'year to date', range: 'range' }[r.period.type];
    const label =
      r.period.type === 'day'
        ? CRM.fmtDate(r.period.from, { weekday: true, year: true })
        : r.period.type === 'month'
          ? `${CRM.fmtMonth(r.period.from.slice(0, 7))}${r.period.to === r.period.today ? ' (to date)' : ''}`
          : `${CRM.fmtDate(r.period.from, { year: true })} – ${CRM.fmtDate(r.period.to, { year: true })}`;

    const out = [
      h('p', { class: 'muted' }, h('b', null, label), ` · compared with the previous ${periodName} (${CRM.fmtDate(r.period.previous.from)} – ${CRM.fmtDate(r.period.previous.to)})`),
      h(
        'div',
        { class: 'kpis' },
        kpi('Conversion', h('span', null, CRM.pct(t.conversion)), `${t.sold} sold of ${t.enquiries} enquiries · ${delta(t.conversion, p.conversion, { points: true })}`, { hero: true }),
        kpi('Enquiries', t.enquiries, delta(t.enquiries, p.enquiries)),
        kpi('Cars sold', t.cars_sold, `By sale date · ${delta(t.cars_sold, p.cars_sold)}`),
        kpi('Test drives', h('span', null, t.test_drives, ' ', h('small', null, CRM.pct(t.test_drive_rate))), delta(t.test_drive_rate, p.test_drive_rate, { points: true })),
        kpi('Open / lost', h('span', null, t.open, h('small', null, ' / '), t.lost), `${CRM.pct(t.lost ? Math.round((t.lost / t.enquiries) * 1000) / 10 : 0)} lost`),
        kpi('Trade-ins', h('span', null, t.trade_ins, ' ', h('small', null, CRM.pct(t.trade_in_rate)))),
        kpi('Finance', h('span', null, t.finance, ' ', h('small', null, CRM.pct(t.finance_rate)))),
        kpi('Conversion with test drive', CRM.pct(t.conversion_with_test_drive), `Without: ${CRM.pct(t.conversion_without_test_drive)}`),
        kpi('Overdue follow-ups', h('span', { style: { color: r.followups.overdue ? 'var(--danger)' : '' } }, r.followups.overdue), `${r.followups.due_today} due today`),
        kpi('Follow-ups on time', CRM.pct(r.followups.on_time_rate), `${r.followups.on_time} of ${r.followups.done} done this ${periodName === 'year to date' ? 'year' : periodName}`)
      ),
      h('p', { class: 'muted small' }, 'Conversion = enquiries sold ÷ enquiries entered in the period. "Cars sold" counts sales recorded in the period, whenever the enquiry came in.'),
    ];

    if (r.period.type === 'day') out.push(enquiryLinks('Walk-ins', r.enquiries, 'No walk-ins recorded on this day.'));

    out.push(
      h(
        'div',
        { class: 'grid-2' },
        r.by_location.length > 1 ? groupTable('By site', r.by_location, { first: 'Site' }) : null,
        groupTable('By brand', r.by_brand, { first: 'Brand' }),
        groupTable(CRM.isManager() ? 'By salesperson' : 'Salesperson', r.by_salesperson, { first: 'Salesperson' }),
        r.by_location.length > 1 ? groupTable('By brand and site', r.by_location_brand, { first: 'Brand · site' }) : null,
        groupTable('Top models', r.by_model, { first: 'Model', note: 'Top 20' }),
        groupTable('By source', r.by_source, { first: 'Source' }),
        r.lost_reasons.length
          ? h(
              'section',
              { class: 'card' },
              h('h2', null, 'Why enquiries were lost'),
              h(
                'div',
                { class: 'table-wrap' },
                h(
                  'table',
                  { class: 'data' },
                  h('thead', null, h('tr', null, h('th', null, 'Reason'), h('th', { class: 'num' }, 'Count'), h('th', null, 'Share of lost'))),
                  h('tbody', null, r.lost_reasons.map((x) => h('tr', null, h('td', null, x.label), h('td', { class: 'num' }, x.count), h('td', null, bar(x.share)))))
                )
              )
            )
          : null,
        groupTable('Customer postcodes', r.by_postcode, { first: 'Postcode', note: 'Top 20' })
      )
    );

    if (CRM.isManager()) {
      out.push(
        enquiryLinks(`Overdue ${r.followups.escalation_days}+ days`, r.escalated, 'Nothing seriously overdue.', 'Needs a manager’s attention'),
        enquiryLinks(`No activity for ${r.followups.stale_days}+ days`, r.stale, 'No stale enquiries.', 'Consider closing as lost')
      );
    }
    return out;
  }
})();
