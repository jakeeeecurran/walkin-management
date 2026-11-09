// Sales board (general manager only): every car sold today with who sold it, and
// leaderboards for today and the month. Refreshes itself every minute while open.
(function () {
  const CRM = window.CRM;
  const { h } = CRM;
  const state = { location_id: '' };
  const REFRESH_MS = 60000;

  const time = (iso) => (iso ? new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Brisbane', hour: 'numeric', minute: '2-digit' }).format(new Date(iso)) : '');

  CRM.route(/^\/sales-board$/, async (main) => {
    if (!CRM.isFull()) return CRM.go('#/today');
    const ref = await CRM.loadRef();
    const body = h('div', { class: 'board-body' }, h('div', { class: 'loading' }, 'Loading…'));
    const updated = h('span', { class: 'live' }, h('i', { 'aria-hidden': 'true' }), 'Live');
    const siteDd =
      ref.locations.length > 1
        ? CRM.dropdown({ label: 'Site', options: [{ value: '', label: 'All sites' }, ...ref.locations.map((l) => ({ value: String(l.id), label: l.name }))], value: state.location_id, align: 'right', onChange: (v) => { state.location_id = v; load().catch(CRM.fail); } })
        : null;
    const view = h(
      'div',
      { class: 'board' },
      h('div', { class: 'page-head' }, h('div', null, h('p', { class: 'eyebrow' }, CRM.fmtDate(CRM.today(), { weekday: true, year: true })), h('h1', null, 'Sales board'), h('p', { class: 'muted small' }, 'Every car sold today and who is leading the day and the month. Sales count once a manager approves them.')), h('div', { class: 'board-tools' }, updated, siteDd)),
      body
    );
    main.replaceChildren(view);

    async function load() {
      body.classList.add('refreshing');
      try {
        const b = await CRM.get(`/api/reports/sales-board${CRM.qs({ location_id: state.location_id })}`);
        body.replaceChildren(...render(b));
        updated.title = `Updated ${time(new Date().toISOString())}`;
      } finally {
        body.classList.remove('refreshing');
      }
    }
    await load();
    const timer = setInterval(() => {
      if (!document.body.contains(view)) return clearInterval(timer);
      if (document.visibilityState === 'visible') load().catch(() => {});
    }, REFRESH_MS);
  });

  function render(b) {
    const conv = b.totals.enquiries_month ? Math.round((b.leaders_month.reduce((n, p) => n + p.converted, 0) / b.totals.enquiries_month) * 1000) / 10 : null;
    const kpi = (label, value, sub, hero) => h('div', { class: ['kpi', hero && 'hero'] }, h('div', { class: 'label' }, label), h('div', { class: 'value' }, value), sub ? h('div', { class: 'delta-row' }, sub) : null);
    return [
      h(
        'div',
        { class: 'kpis kpis-main' },
        kpi('Sold today', b.totals.sold_today, h('span', null, `${b.leaders_today.filter((p) => p.sold_today).length} salespeople`), true),
        kpi('Sold this month', b.totals.sold_month, h('span', { class: 'muted' }, CRM.fmtMonth(b.month))),
        kpi('Enquiries this month', b.totals.enquiries_month),
        kpi('Month conversion', CRM.pct(conv), h('span', { class: 'muted' }, 'Of this month’s enquiries'))
      ),
      h('div', { class: 'grid-2 board-leaders' }, leaderboard('Today', b.leaders_today, 'sold_today', 'No sales or walk-ins yet today'), leaderboard('This month', b.leaders_month, 'sold_month', 'No sales yet this month')),
      salesToday(b.today),
      brandsMonth(b.brands_month),
    ];
  }

  function leaderboard(title, people, key, emptyText) {
    const top = Math.max(1, ...people.map((p) => p[key]));
    return h(
      'section',
      { class: 'card' },
      h('div', { class: 'card-head' }, h('h2', null, `Leaderboard · ${title}`)),
      people.length
        ? h(
            'ol',
            { class: 'leaders' },
            people.slice(0, 10).map((p, i) =>
              h(
                'li',
                { class: ['leader', i < 3 && p[key] > 0 && `place-${i + 1}`] },
                h('span', { class: 'rank', 'aria-label': `Rank ${i + 1}` }, i + 1),
                CRM.avatar(p.name, '#475569'),
                h(
                  'div',
                  { class: 'who' },
                  h('b', null, p.name),
                  h('span', { class: 'muted small' }, key === 'sold_today' ? [p.location, `${p.walk_ins_today} walk-in${p.walk_ins_today === 1 ? '' : 's'} today`].filter(Boolean).join(' · ') : [p.location, `${p.enquiries} enq`, `${CRM.pct(p.conversion)} conv`, p.top_brand ? `mostly ${p.top_brand}` : null].filter(Boolean).join(' · ')),
                  h('div', { class: 'bar', 'aria-hidden': 'true' }, h('i', { style: { width: `${(p[key] / top) * 100}%` } }))
                ),
                h('div', { class: 'score' }, h('b', null, p[key]), h('span', null, 'sold'))
              )
            )
          )
        : CRM.empty(emptyText, null, 'chart'),
      people.length > 10 ? h('p', { class: 'muted small' }, `Top 10 of ${people.length} shown.`) : null
    );
  }

  function salesToday(list) {
    const flags = (s) => [s.test_drive && 'Test drive', s.trade_in && 'Trade-in', s.finance && 'Finance'].filter(Boolean);
    return h(
      'section',
      { class: 'card' },
      h('div', { class: 'card-head' }, h('h2', null, 'Sold today', list.length ? h('span', { class: 'count-pill' }, list.length) : null)),
      list.length
        ? [
            h(
              'div',
              { class: 'table-wrap only-wide' },
              h(
                'table',
                { class: 'data' },
                h('thead', null, h('tr', null, ['Time', 'Salesperson', 'Vehicle', 'Site', 'Customer', 'Stock #', 'Approved by'].map((x) => h('th', null, x)))),
                h(
                  'tbody',
                  null,
                  list.map((s) =>
                    h(
                      'tr',
                      { class: 'clickable', onclick: () => CRM.go(`#/enquiries/${s.id}`) },
                      h('td', { class: 'nowrap' }, time(s.sold_at)),
                      h('td', null, h('b', null, s.salesperson)),
                      h('td', null, h('span', { class: 'badge badge-brand' }, s.brand), ' ', s.vehicle, flags(s).length ? h('div', { class: 'muted small' }, flags(s).join(' · ')) : null),
                      h('td', null, s.location),
                      h('td', null, h('a', { href: `#/enquiries/${s.id}`, onclick: (e) => e.stopPropagation() }, s.customer_name)),
                      h('td', null, s.stock_number || '–'),
                      h('td', { class: 'muted' }, s.approved_by || '–')
                    )
                  )
                )
              )
            ),
            h(
              'ul',
              { class: 'elist only-narrow' },
              list.map((s) =>
                h(
                  'li',
                  null,
                  h(
                    'a',
                    { class: 'erow', href: `#/enquiries/${s.id}` },
                    CRM.avatar(s.salesperson, '#475569'),
                    h('div', { class: 'erow-main' }, h('div', { class: 'name' }, `${s.salesperson} · ${s.brand} ${s.vehicle}`), h('div', { class: 'sub' }, [s.location, s.customer_name, s.stock_number && `Stock ${s.stock_number}`].filter(Boolean).join(' · '))),
                    h('div', { class: 'right muted small' }, time(s.sold_at))
                  )
                )
              )
            ),
          ]
        : CRM.empty('No sales yet today', 'Sales appear here as soon as a manager approves them.', 'chart')
    );
  }

  function brandsMonth(list) {
    if (!list.length) return null;
    const top = Math.max(...list.map((b) => b.sold));
    return h(
      'section',
      { class: 'card' },
      h('div', { class: 'card-head' }, h('h2', null, 'Sold this month by brand')),
      h('div', { class: 'brand-bars' }, list.map((b) => h('div', { class: 'brand-bar' }, h('span', { class: 'name' }, b.brand), h('div', { class: 'bar', 'aria-hidden': 'true' }, h('i', { style: { width: `${(b.sold / top) * 100}%` } })), h('b', null, b.sold))))
    );
  }
})();
