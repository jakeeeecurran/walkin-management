// Morning meeting (sales managers and the general manager): everything to talk about first
// thing. Yesterday, the month so far, a ranked hit list, each salesperson's day and today's
// follow-ups. Printable.
(function () {
  const CRM = window.CRM;
  const { h } = CRM;
  const state = { location_id: '' };

  const addDay = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 86400e3).toISOString().slice(0, 10);
  const vehicle = (e) => [e.brand === 'Used Cars' ? 'Used' : e.brand, e.vehicle].filter(Boolean).join(' ');

  CRM.route(/^\/meeting$/, async (main) => {
    if (!CRM.isManager()) return CRM.go('#/today');
    const ref = await CRM.loadRef();
    const body = h('div', { class: 'meeting-body' }, h('div', { class: 'loading' }, 'Loading…'));
    const siteDd =
      CRM.isFull() && ref.locations.length > 1
        ? CRM.dropdown({ label: 'Site', options: [{ value: '', label: 'All sites' }, ...ref.locations.map((l) => ({ value: String(l.id), label: l.name }))], value: state.location_id, align: 'right', onChange: (v) => { state.location_id = v; load().catch(CRM.fail); } })
        : null;
    main.replaceChildren(
      h(
        'div',
        { class: 'meeting' },
        h(
          'div',
          { class: 'page-head' },
          h('div', null, h('p', { class: 'eyebrow' }, CRM.fmtDate(CRM.today(), { weekday: true, year: true })), h('h1', null, 'Morning meeting'), h('p', { class: 'muted small' }, 'Your hit list for this morning: yesterday, the hottest customers, and who each salesperson is seeing today.')),
          h('div', { class: 'board-tools no-print' }, siteDd, h('button', { type: 'button', class: 'btn-sm', onclick: () => window.print() }, CRM.icon('print'), 'Print'))
        ),
        body
      )
    );
    async function load() {
      body.classList.add('refreshing');
      try {
        const m = await CRM.get(`/api/reports/meeting${CRM.qs({ location_id: state.location_id })}`);
        body.replaceChildren(...render(m));
      } finally {
        body.classList.remove('refreshing');
      }
    }
    await load();
  });

  function render(m) {
    const y = m.yesterday;
    const diff = m.month.sold - m.month.sold_last_month_same_point;
    const num = (value, label, sub) => h('div', { class: 'meet-num' }, h('b', null, value), h('span', null, label), sub ? h('small', null, sub) : null);
    return [
      // 1. Results
      h(
        'div',
        { class: 'grid-2 meet-top' },
        h(
          'section',
          { class: 'card' },
          h('div', { class: 'card-head' }, h('h2', null, `${y.date === addDay(CRM.today(), -1) ? 'Yesterday' : 'Last trading day'} · ${CRM.fmtDate(y.date, { weekday: true })}`)),
          h('div', { class: 'meet-nums' }, num(y.walk_ins, 'Walk-ins'), num(y.test_drives, 'Test drives'), num(y.sold.length, 'Sold'), num(y.lost.length, 'Lost')),
          y.sold.length ? h('div', { class: 'meet-list' }, h('h3', null, 'Sold'), h('ul', null, y.sold.map((e) => h('li', null, h('b', null, e.salesperson), ` · ${vehicle(e)} · ${e.customer_name}`)))) : null,
          y.lost.length ? h('div', { class: 'meet-list' }, h('h3', null, 'Lost'), h('ul', null, y.lost.map((e) => h('li', null, h('b', null, e.salesperson), ` · ${vehicle(e)} · `, h('span', { class: 'muted' }, e.lost_reason))))) : null
        ),
        h(
          'section',
          { class: 'card' },
          h('div', { class: 'card-head' }, h('h2', null, 'Month so far')),
          h(
            'div',
            { class: 'meet-nums' },
            num(m.month.sold, 'Cars sold', diff === 0 ? 'Same as last month' : `${diff > 0 ? '▲' : '▼'} ${Math.abs(diff)} on last month`),
            num(m.month.enquiries, 'Enquiries'),
            num(CRM.pct(m.month.conversion), 'Conversion')
          ),
          m.approvals ? h('a', { class: 'see-all', href: '#/enquiries?view=pending' }, `${m.approvals} sale${m.approvals === 1 ? '' : 's'} or loss${m.approvals === 1 ? '' : 'es'} waiting for approval`, CRM.icon('arrow')) : null
        )
      ),
      // 2. Hit list
      h(
        'section',
        { class: 'card' },
        h('div', { class: 'card-head' }, h('h2', null, 'Hit list', m.hit_list.length ? h('span', { class: 'count-pill' }, m.hit_list.length) : null), h('span', { class: 'muted small' }, 'Hottest open customers: test drives, finance, trade-ins, new this week, due today')),
        m.hit_list.length
          ? h(
              'ol',
              { class: 'hit-list' },
              m.hit_list.map((e, i) =>
                h(
                  'li',
                  null,
                  h(
                    'a',
                    { class: 'hit', href: `#/enquiries/${e.id}` },
                    h('span', { class: 'hit-rank' }, i + 1),
                    h(
                      'div',
                      { class: 'hit-main' },
                      h('div', { class: 'hit-line' }, h('b', null, e.customer_name), h('span', { class: 'muted' }, ` · ${vehicle(e)}`)),
                      h('div', { class: 'hit-tags' }, e.reasons.filter((r) => !(CRM.isFull() && /late/.test(r))).map((r) => h('span', { class: ['tag', /late/.test(r) && 'tag-late', r === 'Due today' && 'tag-due'] }, r))),
                      e.last_note ? h('div', { class: 'hit-note' }, `“${e.last_note}”`) : null
                    ),
                    h('div', { class: 'hit-who' }, h('b', null, e.salesperson), h('span', { class: 'muted small' }, e.next_followup_at ? `Next: ${CRM.relDay(e.next_followup_at)}` : ''))
                  )
                )
              )
            )
          : CRM.empty('No hot customers right now', 'Customers with a test drive, finance or a trade-in, or new this week, appear here.', 'check')
      ),
      // 3. Round the room
      h(
        'section',
        { class: 'card' },
        h('div', { class: 'card-head' }, h('h2', null, 'Round the room')),
        m.people.length
          ? h(
              'div',
              { class: 'table-wrap' },
              h(
                'table',
                { class: 'data meet-table' },
                h('thead', null, h('tr', null, h('th', null, 'Salesperson'), h('th', { class: 'num' }, 'To follow up today'), h('th', { class: 'num' }, 'Hot'), h('th', { class: 'num hide-sm' }, 'Walk-ins yesterday'), h('th', { class: 'num' }, 'Sold this month'), m.show_late ? h('th', { class: 'num hide-sm' }, 'Running late') : null)),
                h(
                  'tbody',
                  null,
                  m.people.map((p) =>
                    h(
                      'tr',
                      null,
                      h('td', null, h('b', null, p.name), CRM.isFull() && p.location ? h('div', { class: 'muted small' }, p.location) : null),
                      h('td', { class: 'num' }, p.due_today || '–'),
                      h('td', { class: 'num' }, p.hot || '–'),
                      h('td', { class: 'num hide-sm' }, p.walk_ins_yesterday || '–'),
                      h('td', { class: 'num' }, p.sold_month || '–'),
                      m.show_late ? h('td', { class: 'num hide-sm' }, p.late || '–') : null
                    )
                  )
                )
              )
            )
          : CRM.empty('No salespeople yet', null, 'team')
      ),
      // 4. Today's follow-ups by salesperson
      h(
        'section',
        { class: 'card' },
        h('div', { class: 'card-head' }, h('h2', null, 'Today’s follow-ups', m.due_today_total ? h('span', { class: 'count-pill' }, m.due_today_total) : null)),
        m.due_today.length
          ? h(
              'div',
              { class: 'meet-people' },
              m.due_today.map((g) =>
                h(
                  'div',
                  { class: 'meet-person' },
                  h('h3', null, g.name, h('span', { class: 'count-pill' }, g.items.length)),
                  h(
                    'ul',
                    null,
                    g.items.slice(0, 8).map((e) => h('li', null, h('a', { href: `#/enquiries/${e.id}` }, e.customer_name), h('span', { class: 'muted' }, ` · ${vehicle(e)}`), e.hot ? h('span', { class: 'tag tag-hot' }, 'Hot') : null))
                  ),
                  g.items.length > 8 ? h('p', { class: 'muted small' }, `+ ${g.items.length - 8} more`) : null
                )
              )
            )
          : CRM.empty('Nothing to follow up today', null, 'check')
      ),
    ];
  }
})();
