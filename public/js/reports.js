// Reports: four headline numbers, one breakdown at a time, extras on request.
(function () {
  const CRM = window.CRM;
  const { h } = CRM;

  let state = { period: 'month', date: null, month: null, from: null, to: null, location_id: '', brand_id: '', salesperson_id: '', breakdown: 'brand', attention: 'escalated', showMore: false };

  const PERIODS = [
    { value: 'day', label: 'Day' },
    { value: 'month', label: 'Month' },
    { value: 'year', label: 'Year to date' },
    { value: 'range', label: 'Date range' },
  ];

  CRM.route(/^\/reports$/, async (main, _, params) => {
    const ref = await CRM.loadRef();
    const t = CRM.today();
    state = { ...state, date: state.date || t, month: state.month || t.slice(0, 7), from: state.from || t.slice(0, 7) + '-01', to: state.to || t, ...(params.period ? { period: params.period } : {}) };

    const query = () => {
      const base = { location_id: state.location_id, brand_id: state.brand_id, salesperson_id: state.salesperson_id };
      if (state.period === 'day') return { ...base, period: 'day', date: state.date };
      if (state.period === 'month') return { ...base, period: 'month', date: state.month === t.slice(0, 7) ? t : `${state.month}-28` };
      if (state.period === 'year') return { ...base, period: 'year', date: t };
      return { ...base, period: 'range', from: state.from, to: state.to };
    };

    const body = h('div', null, h('div', { class: 'loading' }, 'Loading…'));
    const rerender = () => draw().catch(CRM.fail);
    let last = null;

    // Toolbar: period · date · filters · export
    const dateBox = h('div', { class: 'toolbar-dates' });
    const drawDates = () => {
      const inputs = [];
      if (state.period === 'day') inputs.push(h('input', { type: 'date', max: t, value: state.date, 'aria-label': 'Day', onchange: (e) => { state.date = e.target.value || t; rerender(); } }));
      if (state.period === 'month') inputs.push(h('input', { type: 'month', max: t.slice(0, 7), value: state.month, 'aria-label': 'Month', onchange: (e) => { state.month = e.target.value || t.slice(0, 7); rerender(); } }));
      if (state.period === 'range')
        inputs.push(
          h('input', { type: 'date', value: state.from, 'aria-label': 'From', onchange: (e) => { state.from = e.target.value; rerender(); } }),
          h('span', { class: 'muted' }, '–'),
          h('input', { type: 'date', value: state.to, 'aria-label': 'To', onchange: (e) => { state.to = e.target.value; rerender(); } })
        );
      dateBox.replaceChildren(...inputs);
      dateBox.hidden = !inputs.length;
    };
    const periodDd = CRM.dropdown({ options: PERIODS, value: state.period, label: 'Period', onChange: (v) => { state.period = v; drawDates(); rerender(); } });

    const pills = h('div', { class: 'pills' });
    const filterBtn = h('button', { type: 'button', class: 'filter-btn', 'aria-label': 'Filters', onclick: () => openFilters() });
    const active = () =>
      [
        state.location_id && { key: 'location_id', label: CRM.byId(ref.locations, state.location_id)?.name },
        state.brand_id && { key: 'brand_id', label: CRM.byId(ref.brands, state.brand_id)?.name },
        state.salesperson_id && { key: 'salesperson_id', label: ref.assignees.find((u) => u.id === Number(state.salesperson_id))?.name },
      ].filter((x) => x && x.label);
    const drawPills = () => {
      const f = active();
      pills.replaceChildren(...f.map((x) => h('button', { type: 'button', class: 'pill', onclick: () => { state[x.key] = ''; drawPills(); rerender(); } }, x.label, CRM.icon('x'))));
      pills.hidden = !f.length;
      filterBtn.replaceChildren(CRM.icon('filter'), h('span', { class: 'hide-sm' }, 'Filters'), f.length ? h('span', { class: 'count-dot' }, f.length) : null);
    };
    function openFilters() {
      const opt = (list, label) => [{ value: '', label }, ...list];
      const loc = CRM.select(opt(ref.locations.map((l) => ({ value: l.id, label: l.name })), 'All sites'), state.location_id);
      const brand = CRM.select(opt(ref.brands.map((b) => ({ value: b.id, label: b.name })), 'All brands'), state.brand_id);
      const sp = CRM.select(opt(ref.assignees.map((u) => ({ value: u.id, label: u.name })), 'Everyone'), state.salesperson_id);
      CRM.dialog({
        title: 'Filters',
        body: h('div', { class: 'stack' }, ref.locations.length > 1 ? CRM.field('Site', loc) : null, ref.brands.length > 1 ? CRM.field('Brand', brand) : null, CRM.isManager() && ref.assignees.length ? CRM.field('Salesperson', sp) : null),
        actions: [
          { label: 'Reset', class: 'btn-ghost', onClick: () => { state.location_id = state.brand_id = state.salesperson_id = ''; drawPills(); rerender(); } },
          { label: 'Show results', class: 'btn-primary', onClick: () => { state.location_id = loc.value; state.brand_id = brand.value; state.salesperson_id = sp.value; drawPills(); rerender(); } },
        ],
      });
    }
    const exportBtn = CRM.isManager()
      ? h('button', {
          type: 'button',
          class: 'icon-btn',
          'aria-label': 'More',
          onclick: (ev) =>
            CRM.menu(ev.currentTarget, [
              {
                label: 'Export to Excel',
                hint: 'Every enquiry in this period and filter',
                icon: 'download',
                onSelect: () => {
                  const q = query();
                  CRM.download(`/api/reports/export.csv${CRM.qs({ from: last?.period.from, to: last?.period.to, location_id: q.location_id, brand_id: q.brand_id, salesperson_id: q.salesperson_id })}`);
                },
              },
            ], { align: 'right' }),
        }, CRM.icon('dots'))
      : null;

    main.replaceChildren(
      h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Reports'), h('p', { class: 'muted' }, CRM.isManager() ? 'For the brands and sites you look after' : 'Your own figures'))),
      h('div', { class: 'list-toolbar', style: { marginBottom: '18px' } }, h('div', { class: 'toolbar' }, periodDd, dateBox, h('div', { class: 'spacer' }), filterBtn, exportBtn), pills),
      body
    );
    drawDates();
    drawPills();

    async function draw() {
      const r = await CRM.get(`/api/reports/summary${CRM.qs(query())}`);
      last = r;
      body.replaceChildren(...renderReport(r));
    }
    await draw();
  });

  function delta(cur, prev, { points } = {}) {
    if (prev == null || cur == null) return null;
    const d = Math.round((cur - prev) * 10) / 10;
    if (d === 0) return h('span', { class: 'delta' }, 'Same as last period');
    return h('span', { class: ['delta', d > 0 ? 'up' : 'down'] }, `${d > 0 ? '▲' : '▼'} ${Math.abs(d)}${points ? ' pts' : ''}`, h('span', { class: 'muted' }, ` vs ${prev}${points ? '%' : ''}`));
  }
  const kpi = (label, value, sub, opts = {}) => h('div', { class: ['kpi', opts.hero && 'hero'] }, h('div', { class: 'label' }, label), h('div', { class: 'value' }, value), sub ? h('div', { class: 'delta-row' }, sub) : null);

  function bar(v) {
    const w = v == null ? 0 : Math.max(0, Math.min(100, v));
    return h('div', { class: 'barcell' }, h('div', { class: 'bar', 'aria-hidden': 'true' }, h('i', { style: { width: `${w}%` } })), h('span', null, CRM.pct(v)));
  }

  const BREAKDOWNS = [
    { value: 'brand', label: 'By brand', key: 'by_brand', first: 'Brand' },
    { value: 'salesperson', label: 'By salesperson', key: 'by_salesperson', first: 'Salesperson' },
    { value: 'site', label: 'By site', key: 'by_location', first: 'Site' },
    { value: 'brandsite', label: 'By brand and site', key: 'by_location_brand', first: 'Brand · site' },
    { value: 'model', label: 'Top models', key: 'by_model', first: 'Model' },
    { value: 'source', label: 'By source', key: 'by_source', first: 'Source' },
    { value: 'lost', label: 'Lost reasons', key: 'lost_reasons', first: 'Reason' },
    { value: 'postcode', label: 'By postcode', key: 'by_postcode', first: 'Postcode' },
  ];

  function breakdownTable(r, def) {
    const rows = r[def.key];
    if (!rows.length) return CRM.empty('No data for this period', null, 'inbox');
    if (def.value === 'lost') {
      return h(
        'div',
        { class: 'table-wrap' },
        h('table', { class: 'data' }, h('thead', null, h('tr', null, h('th', null, def.first), h('th', { class: 'num' }, 'Lost'), h('th', null, 'Share'))), h('tbody', null, rows.map((x) => h('tr', null, h('td', null, x.label), h('td', { class: 'num' }, x.count), h('td', null, bar(x.share))))))
      );
    }
    return h(
      'div',
      { class: 'table-wrap' },
      h(
        'table',
        { class: 'data' },
        h('thead', null, h('tr', null, h('th', null, def.first), h('th', { class: 'num' }, 'Enquiries'), h('th', { class: 'num hide-sm' }, 'Test drives'), h('th', { class: 'num' }, 'Sold'), h('th', null, 'Conversion'))),
        h('tbody', null, rows.map((g) => h('tr', null, h('td', null, g.label), h('td', { class: 'num' }, g.enquiries), h('td', { class: 'num hide-sm' }, g.test_drives), h('td', { class: 'num' }, g.sold), h('td', null, bar(g.conversion)))))
      )
    );
  }

  function enquiryTable(rows, limit) {
    const shown = limit ? rows.slice(0, limit) : rows;
    return h(
      'div',
      { class: 'table-wrap' },
      h(
        'table',
        { class: 'data' },
        h('thead', null, h('tr', null, ['Customer', 'Vehicle', CRM.isManager() ? 'Salesperson' : null, 'Status'].filter(Boolean).map((x) => h('th', null, x)))),
        h(
          'tbody',
          null,
          shown.map((e) =>
            h(
              'tr',
              { class: 'clickable', onclick: () => CRM.go(`#/enquiries/${e.id}`) },
              h('td', null, h('a', { href: `#/enquiries/${e.id}` }, e.customer_name)),
              h('td', { class: 'muted' }, `${e.brand === 'Used Cars' ? 'Used' : e.brand} ${e.vehicle}`),
              CRM.isManager() ? h('td', { class: 'muted' }, e.salesperson) : null,
              h('td', null, e.outcome === 'open' ? `Follow up ${CRM.relDay(e.next_followup_at).toLowerCase()}` : e.outcome[0].toUpperCase() + e.outcome.slice(1))
            )
          )
        )
      )
    );
  }

  function renderReport(r) {
    const t = r.totals;
    const p = r.previous;
    const label =
      r.period.type === 'day'
        ? CRM.fmtDate(r.period.from, { weekday: true, year: true })
        : r.period.type === 'month'
          ? `${CRM.fmtMonth(r.period.from.slice(0, 7))}${r.period.to === r.period.today ? ' to date' : ''}`
          : `${CRM.fmtDate(r.period.from, { year: true })} – ${CRM.fmtDate(r.period.to, { year: true })}`;

    const extra = h(
      'div',
      { class: 'kpis kpis-small', hidden: !state.showMore },
      kpi('Open', t.open),
      kpi('Lost', t.lost),
      kpi('Trade-ins', h('span', null, t.trade_ins, h('small', null, ` ${CRM.pct(t.trade_in_rate)}`))),
      kpi('Finance', h('span', null, t.finance, h('small', null, ` ${CRM.pct(t.finance_rate)}`))),
      kpi('Conversion after test drive', CRM.pct(t.conversion_with_test_drive), h('span', { class: 'muted' }, `Without: ${CRM.pct(t.conversion_without_test_drive)}`)),
      kpi('Follow-ups on time', CRM.pct(r.followups.on_time_rate), h('span', { class: 'muted' }, `${r.followups.on_time} of ${r.followups.done}`))
    );
    const moreBtn = h('button', { type: 'button', class: 'reveal', onclick: () => { state.showMore = !state.showMore; extra.hidden = !state.showMore; moreBtn.textContent = state.showMore ? 'Fewer figures' : 'More figures'; } }, state.showMore ? 'Fewer figures' : 'More figures');

    // One breakdown at a time.
    const available = BREAKDOWNS.filter((b) => (b.value === 'site' || b.value === 'brandsite' ? r.by_location.length > 1 : true));
    if (!available.some((b) => b.value === state.breakdown)) state.breakdown = available[0].value;
    const tableBox = h('div');
    const drawTable = () => tableBox.replaceChildren(breakdownTable(r, available.find((b) => b.value === state.breakdown)));
    drawTable();
    const breakdown = h(
      'section',
      { class: 'card' },
      h('div', { class: 'card-head' }, h('h2', null, 'Breakdown'), CRM.dropdown({ options: available, value: state.breakdown, label: 'Breakdown', align: 'right', onChange: (v) => { state.breakdown = v; drawTable(); } })),
      tableBox
    );

    const out = [
      h('p', { class: 'period-label' }, label),
      h(
        'div',
        { class: 'kpis kpis-main' },
        kpi('Conversion', CRM.pct(t.conversion), [h('span', null, `${t.sold} sold of ${t.enquiries}`), ' ', delta(t.conversion, p.conversion, { points: true })], { hero: true }),
        kpi('Enquiries', t.enquiries, delta(t.enquiries, p.enquiries)),
        kpi('Cars sold', t.cars_sold, delta(t.cars_sold, p.cars_sold)),
        kpi('Test drives', h('span', null, t.test_drives, h('small', null, ` ${CRM.pct(t.test_drive_rate)}`)), delta(t.test_drive_rate, p.test_drive_rate, { points: true }))
      ),
      extra,
      h('div', { class: 'report-note' }, moreBtn, h('span', { class: 'muted small' }, 'Conversion = enquiries sold ÷ enquiries entered in the period.')),
    ];

    // Brand trends: general manager (and admins) only. Uses the Site filter; has its own months.
    if (CRM.isFull() && CRM.brandTrends) out.push(CRM.brandTrends({ location_id: state.location_id, brand_id: state.brand_id }));

    if (r.period.type === 'day') {
      out.push(h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', null, 'Walk-ins', h('span', { class: 'count-pill' }, r.enquiries.length))), r.enquiries.length ? enquiryTable(r.enquiries) : CRM.empty('No walk-ins on this day', null, 'inbox')));
    }
    out.push(breakdown);

    if (CRM.isManager()) {
      const lists = [
        { value: 'escalated', label: `Overdue ${r.followups.escalation_days}+ days`, rows: r.escalated },
        { value: 'stale', label: `No activity ${r.followups.stale_days}+ days`, rows: r.stale },
      ];
      const box = h('div');
      const drawList = () => {
        const l = lists.find((x) => x.value === state.attention);
        box.replaceChildren(l.rows.length ? enquiryTable(l.rows, 8) : CRM.empty('Nothing here', 'Everyone is on top of their follow-ups.', 'check'), l.rows.length > 8 ? h('a', { class: 'see-all', href: '#/enquiries?view=overdue' }, 'See all overdue', CRM.icon('arrow')) : null);
      };
      drawList();
      out.push(
        h(
          'section',
          { class: 'card' },
          h('div', { class: 'card-head' }, h('h2', null, 'Needs attention'), CRM.dropdown({ options: lists.map((l) => ({ value: l.value, label: `${l.label} (${l.rows.length})` })), value: state.attention, align: 'right', onChange: (v) => { state.attention = v; drawList(); } })),
          box
        )
      );
    }
    return out;
  }
})();
