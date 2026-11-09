// Today screen, enquiry list, enquiry detail and the new/edit enquiry form.
// Design rule: show only what's needed to act; everything else is one tap away.
(function () {
  const CRM = window.CRM;
  const { h } = CRM;

  // ---------- Shared bits ----------
  function statusBadge(e) {
    if (e.is_invalid) return h('span', { class: 'badge badge-invalid' }, 'Invalid');
    if (e.pending_outcome) return h('span', { class: 'badge badge-pending' }, e.pending_outcome === 'sold' ? 'Sold · approval' : 'Lost · approval');
    if (e.outcome === 'sold') return h('span', { class: 'badge badge-sold' }, 'Sold');
    if (e.outcome === 'lost') return h('span', { class: 'badge badge-lost' }, 'Lost');
    const t = CRM.today();
    if (e.next_followup_at < t) {
      const days = Math.round((Date.parse(t) - Date.parse(e.next_followup_at)) / 86400e3);
      return h('span', { class: 'badge badge-due', title: `Follow-up was due ${CRM.fmtDate(e.next_followup_at)}` }, `${days} day${days === 1 ? '' : 's'} late`);
    }
    if (e.next_followup_at === t) return h('span', { class: 'badge badge-open' }, 'Today');
    return h('span', { class: 'badge badge-open' }, CRM.relDay(e.next_followup_at));
  }

  const vehicleLine = (e) => [e.brand_is_used ? 'Used' : e.brand, e.vehicle].filter(Boolean).join(' ');

  function enquiryRow(e, { selected } = {}) {
    const sub = [vehicleLine(e), e.location, CRM.isManager() ? e.salesperson : null].filter(Boolean).join(' · ');
    return h(
      'li',
      null,
      h(
        'a',
        { class: ['erow', selected && 'selected'], href: `#/enquiries/${e.id}` },
        CRM.avatar(e.customer_name, e.brand_colour),
        h('div', { class: 'erow-main' }, h('div', { class: 'name' }, e.customer_name), h('div', { class: 'sub' }, sub)),
        h('div', { class: 'right' }, statusBadge(e))
      )
    );
  }

  // ---------- Today ----------
  CRM.route(/^\/today$/, async (main) => {
    const me = CRM.state.me;
    const today = CRM.today();
    const [due, mine, pending, day] = await Promise.all([
      CRM.get(`/api/enquiries${CRM.qs({ due: 'today', sort: 'followup', limit: 200 })}`),
      CRM.get(`/api/enquiries${CRM.qs({ entry_date: today, limit: 6 })}`),
      CRM.get(`/api/enquiries${CRM.qs({ pending: '1', sort: 'oldest', limit: 6 })}`),
      CRM.isManager() ? CRM.get('/api/reports/daily').catch(() => null) : null,
    ]);
    const toApprove = pending.items.filter((e) => e.can_approve);
    const followUp = due.items; // due today or earlier, oldest first
    const gm = CRM.isFull();
    const SHOW = 5;

    const section = (title, items, total, view, emptyTitle, emptyText) =>
      h(
        'section',
        { class: 'card' },
        h('div', { class: 'card-head' }, h('h2', null, title, total ? h('span', { class: 'count-pill' }, total) : null)),
        items.length ? h('ul', { class: 'elist' }, items.slice(0, SHOW).map((e) => enquiryRow(e))) : CRM.empty(emptyTitle, emptyText, 'check'),
        total > SHOW ? h('a', { class: 'see-all', href: `#/enquiries?view=${view}` }, `See all ${total}`, CRM.icon('arrow')) : null
      );
    const stat = (href, icon, value, label, tone) => h('a', { class: ['stat', tone], href }, h('div', { class: 'ico' }, CRM.icon(icon)), h('b', null, value), h('span', null, label));
    const walkIns = section(CRM.isManager() ? "Today's walk-ins" : 'My walk-ins today', mine.items, mine.total, 'today', 'No walk-ins yet today', 'Tap New walk-in when a customer comes in.');

    // The general manager sees sales and approvals; follow-ups are for salespeople and their managers.
    const stats = gm
      ? [stat('#/enquiries?view=today', 'walk', mine.total, 'Walk-ins today'), stat('#/sales-board', 'trophy', day ? day.totals.sold : '–', 'Sold today'), stat('#/enquiries?view=pending', 'check', pending.total, 'To approve')]
      : [
          stat('#/enquiries?view=due', 'clock', followUp.length, 'To follow up', followUp.length ? 'warn' : null),
          stat('#/enquiries?view=today', 'walk', mine.total, 'Walk-ins today'),
          stat('#/enquiries?view=pending', 'check', pending.total, CRM.isManager() ? 'To approve' : 'Awaiting approval'),
        ];

    main.replaceChildren(
      h('div', { class: 'page-head' }, h('div', null, h('p', { class: 'eyebrow' }, CRM.fmtDate(today, { weekday: true, year: true })), h('h1', null, `G'day ${me.name.split(' ')[0]}`))),
      h(
        'div',
        { class: 'today-hero' },
        h('a', { class: 'new-cta', href: '#/new' }, h('div', null, h('b', null, 'New walk-in'), h('span', null, 'Log a customer in under 30 seconds')), h('span', { class: 'plus', 'aria-hidden': 'true' }, '+')),
        h('div', { class: 'stat-row' }, stats)
      ),
      CRM.isManager() ? h('a', { class: 'meeting-cta', href: '#/meeting' }, CRM.icon('meeting'), h('div', null, h('b', null, 'Morning meeting'), h('span', null, 'Hit list, yesterday’s results and today’s follow-ups')), CRM.icon('arrow')) : null,
      day ? dailySummary(day) : null,
      toApprove.length ? h('div', { class: 'approvals-card' }, section(CRM.isManager() ? 'Waiting for your approval' : 'Awaiting approval', toApprove, pending.total, 'pending', '', '')) : null,
      gm
        ? walkIns
        : h(
            'div',
            { class: 'grid-2' },
            section('To follow up today', followUp, followUp.length, 'due', "You're all caught up", 'Nothing to follow up today.'),
            walkIns
          ),
    );
  });

  // Managers: today's numbers at a glance, split by salesperson (or by site for the GM).
  function dailySummary(d) {
    const t = d.totals;
    const tile = (label, value, opts = {}) =>
      h(opts.href ? 'a' : 'div', { class: ['glance-tile', opts.tone], href: opts.href || null }, h('b', null, value), h('span', null, label), opts.sub ? h('small', null, opts.sub) : null);
    const SHOW = 8;
    let all = false;
    const tableBox = h('div');
    const cols = [
      ['walk_ins', 'Walk-ins'],
      ['test_drives', 'Test drives'],
      ['sold', 'Sold'],
      ['followups', 'Follow-ups'],
      ...(CRM.isFull() ? [] : [['overdue', 'Late']]),
    ];
    const drawTable = () => {
      const rows = all ? d.rows : d.rows.slice(0, SHOW);
      tableBox.replaceChildren(
        h(
          'div',
          { class: 'table-wrap' },
          h(
            'table',
            { class: 'data glance-table' },
            h('thead', null, h('tr', null, h('th', null, d.group === 'site' ? 'Site' : 'Salesperson'), cols.map(([k, l]) => h('th', { class: ['num', k === 'test_drives' && 'hide-sm'] }, l)))),
            h(
              'tbody',
              null,
              rows.map((r) =>
                h(
                  'tr',
                  { class: !r.walk_ins && !r.followups && !r.sold ? 'quiet' : null },
                  h('td', null, r.label),
                  cols.map(([k]) => h('td', { class: ['num', k === 'test_drives' && 'hide-sm', k === 'sold' && r.sold ? 'good' : null] }, r[k] || '–'))
                )
              )
            )
          )
        ),
        d.rows.length > SHOW && !all ? h('button', { type: 'button', class: 'reveal', onclick: () => { all = true; drawTable(); } }, `Show all ${d.rows.length}`) : null
      );
    };
    drawTable();
    return h(
      'section',
      { class: 'card glance' },
      h('div', { class: 'card-head' }, h('h2', null, 'Today at a glance'), h('a', { class: 'see-all', href: '#/reports?period=day' }, 'Full report', CRM.icon('arrow'))),
      h(
        'div',
        { class: 'glance-tiles' },
        // Walk-ins and approvals are already at the top of Today (and Sold too, for the GM).
        tile('Test drives', t.test_drives),
        CRM.isFull() ? null : tile('Sold', t.sold, { tone: t.sold ? 'good' : null }),
        tile('Follow-ups done', t.followups, { sub: t.followups ? `${t.followups_on_time} on time` : null }),
        CRM.isFull() ? null : tile('Running late', t.overdue, { href: '#/enquiries?view=overdue' })
      ),
      d.rows.length ? tableBox : null,
      d.rows.some((r) => !r.walk_ins && !r.followups && !r.sold) ? h('p', { class: 'muted small' }, 'Faded rows have nothing logged yet today.') : null
    );
  }

  // ---------- Enquiry list ----------
  const VIEWS = [
    { value: 'open', label: 'Open', hint: 'Everything still in progress', params: { outcome: 'open', sort: 'followup' } },
    { value: 'overdue', label: 'Running late', hint: 'Follow-up date has passed', params: { overdue: '1', sort: 'followup' } },
    { value: 'due', label: 'Due today', hint: 'Overdue and due today', params: { due: 'today', sort: 'followup' } },
    { value: 'pending', label: 'Awaiting approval', hint: 'Sold or lost, waiting for a sales manager', params: { pending: '1', sort: 'oldest' } },
    { value: 'today', label: 'Added today', params: () => ({ entry_date: CRM.today() }) },
    { value: 'month', label: 'This month', params: () => ({ month: CRM.today().slice(0, 7) }) },
    { value: 'sold', label: 'Sold', params: { outcome: 'sold' } },
    { value: 'lost', label: 'Lost', params: { outcome: 'lost' } },
    { value: 'all', label: 'All enquiries', params: {} },
  ];
  const SORTS = [
    { value: '', label: 'Best order', hint: 'Follow-up date for open, newest otherwise' },
    { value: 'newest', label: 'Newest first' },
    { value: 'oldest', label: 'Oldest first' },
    { value: 'name', label: 'Name A–Z' },
  ];

  let listState = { view: 'open', q: '', location_id: '', brand_id: '', salesperson_id: '', sort: '', items: [], total: 0 };

  async function renderList(main, selectedId, params) {
    const ref = await CRM.loadRef();
    if (params && Object.keys(params).length) {
      listState = { ...listState, view: params.view || 'open', q: params.q || '', location_id: params.location_id || '', brand_id: params.brand_id || '', salesperson_id: params.salesperson_id || '', sort: params.sort || '' };
    }
    const viewDef = () => VIEWS.find((v) => v.value === listState.view) || VIEWS[0];
    const query = () => {
      const base = typeof viewDef().params === 'function' ? viewDef().params() : { ...viewDef().params };
      if (listState.sort) base.sort = listState.sort;
      return { ...base, q: listState.q, location_id: listState.location_id, brand_id: listState.brand_id, salesperson_id: listState.salesperson_id };
    };
    const syncQuery = () =>
      CRM.setQuery({ view: listState.view === 'open' ? '' : listState.view, q: listState.q, location_id: listState.location_id, brand_id: listState.brand_id, salesperson_id: listState.salesperson_id, sort: listState.sort });

    const split = h('div', { class: ['split', selectedId && 'has-detail'] });
    const listCol = h('div', { class: 'split-list' });
    const detailCol = h('div', { class: 'split-detail' });
    split.append(listCol, detailCol);
    const results = h('div');
    const countEl = h('div', { class: 'list-count' });
    const pills = h('div', { class: 'pills' });

    async function load(more) {
      const data = await CRM.get(`/api/enquiries${CRM.qs({ ...query(), limit: 50, offset: more ? listState.items.length : 0 })}`);
      listState.items = more ? [...listState.items, ...data.items] : data.items;
      listState.total = data.total;
      draw();
    }

    function draw() {
      const n = listState.total;
      const noun = `enquir${n === 1 ? 'y' : 'ies'}`;
      const before = { open: 'open', overdue: 'overdue', sold: 'sold', lost: 'lost' }[viewDef().value];
      const after = { due: 'due today', pending: 'awaiting approval', today: 'added today', month: 'this month' }[viewDef().value];
      countEl.textContent = [n, before, noun, after].filter(Boolean).join(' ');
      if (!listState.items.length) {
        results.replaceChildren(h('div', { class: 'card' }, CRM.empty('Nothing here', listState.q || activeFilters().length ? 'Try a different search or clear the filters.' : 'No enquiries in this view.', 'search')));
        return;
      }
      const cards = h('ul', { class: 'elist only-narrow' }, listState.items.map((e) => enquiryRow(e, { selected: e.id === Number(selectedId) })));
      const cols = ['Customer', 'Vehicle', 'Site', CRM.isManager() ? 'Salesperson' : null, 'Entered', 'Status'].filter(Boolean);
      const table = h(
        'div',
        { class: 'table-wrap only-wide' },
        h(
          'table',
          { class: 'data' },
          h('thead', null, h('tr', null, cols.map((x) => h('th', null, x)))),
          h(
            'tbody',
            null,
            listState.items.map((e) =>
              h(
                'tr',
                { class: 'clickable', onclick: () => CRM.go(`#/enquiries/${e.id}`) },
                h('td', null, h('div', { class: 'cell-person' }, CRM.avatar(e.customer_name, e.brand_colour), h('a', { href: `#/enquiries/${e.id}` }, e.customer_name))),
                h('td', null, vehicleLine(e)),
                h('td', { class: 'muted' }, e.location),
                CRM.isManager() ? h('td', { class: 'muted' }, e.salesperson) : null,
                h('td', { class: 'muted' }, CRM.fmtDate(e.entry_date)),
                h('td', null, statusBadge(e))
              )
            )
          )
        )
      );
      results.replaceChildren(
        cards,
        table,
        listState.items.length < listState.total ? h('div', { style: { textAlign: 'center', marginTop: '14px' } }, h('button', { onclick: () => load(true).catch(CRM.fail) }, `Show more (${listState.total - listState.items.length})`)) : null
      );
    }

    function activeFilters() {
      const out = [];
      if (listState.location_id) out.push({ key: 'location_id', label: CRM.byId(ref.locations, listState.location_id)?.name });
      if (listState.brand_id) out.push({ key: 'brand_id', label: CRM.byId(ref.brands, listState.brand_id)?.name });
      if (listState.salesperson_id) out.push({ key: 'salesperson_id', label: ref.assignees.find((u) => u.id === Number(listState.salesperson_id))?.name });
      if (listState.sort) out.push({ key: 'sort', label: SORTS.find((s) => s.value === listState.sort)?.label });
      return out.filter((f) => f.label);
    }

    function drawPills() {
      const f = activeFilters();
      pills.replaceChildren(
        ...f.map((x) => h('button', { type: 'button', class: 'pill', 'aria-label': `Remove ${x.label}`, onclick: () => { listState[x.key] = ''; afterFilter(); } }, x.label, CRM.icon('x'))),
        f.length > 1 ? h('button', { type: 'button', class: 'link-btn', onclick: () => { listState.location_id = listState.brand_id = listState.salesperson_id = listState.sort = ''; afterFilter(); } }, 'Clear all') : null
      );
      pills.hidden = !f.length;
      filterBtn.replaceChildren(CRM.icon('filter'), h('span', { class: 'hide-sm' }, 'Filters'), f.length ? h('span', { class: 'count-dot' }, f.length) : null);
    }

    function afterFilter() {
      syncQuery();
      drawPills();
      load().catch(CRM.fail);
    }

    function openFilters() {
      const opts = (list, label) => [{ value: '', label }, ...list];
      const loc = CRM.select(opts(ref.locations.map((l) => ({ value: l.id, label: l.name })), 'All sites'), listState.location_id);
      const brand = CRM.select(opts(ref.brands.map((b) => ({ value: b.id, label: b.name })), 'All brands'), listState.brand_id);
      const sp = CRM.select(opts(ref.assignees.map((u) => ({ value: u.id, label: u.name })), 'Everyone'), listState.salesperson_id);
      const sort = CRM.select(SORTS, listState.sort);
      CRM.dialog({
        title: 'Filters',
        body: h(
          'div',
          { class: 'stack' },
          ref.locations.length > 1 ? CRM.field('Site', loc) : null,
          ref.brands.length > 1 ? CRM.field('Brand', brand) : null,
          CRM.isManager() && ref.assignees.length ? CRM.field('Salesperson', sp) : null,
          CRM.field('Sort', sort)
        ),
        actions: [
          { label: 'Reset', class: 'btn-ghost', onClick: () => { listState.location_id = listState.brand_id = listState.salesperson_id = listState.sort = ''; afterFilter(); } },
          { label: 'Show results', class: 'btn-primary', onClick: () => { listState.location_id = loc.value; listState.brand_id = brand.value; listState.salesperson_id = sp.value; listState.sort = sort.value; afterFilter(); } },
        ],
      });
    }

    let timer;
    const search = h('input', {
      type: 'search',
      placeholder: 'Search name, phone, email or stock #',
      value: listState.q,
      'aria-label': 'Search enquiries',
      oninput: (e) => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          listState.q = e.target.value.trim();
          syncQuery();
          load().catch(CRM.fail);
        }, 250);
      },
    });
    const statusDd = CRM.dropdown({ options: VIEWS, value: listState.view, label: 'Show', onChange: (v) => { listState.view = v; syncQuery(); load().catch(CRM.fail); } });
    const filterBtn = h('button', { type: 'button', class: 'filter-btn', onclick: openFilters, 'aria-label': 'Filters' });

    listCol.append(
      h('div', { class: 'page-head' }, h('h1', null, 'Enquiries'), h('a', { class: 'btn btn-primary', href: '#/new' }, CRM.icon('plus'), 'New')),
      h('div', { class: 'list-toolbar' }, h('div', { class: 'toolbar' }, h('div', { class: 'search' }, CRM.icon('search'), search), statusDd, filterBtn), pills),
      countEl,
      results
    );
    drawPills();
    main.replaceChildren(split);
    await load();
    if (selectedId) await renderDetail(detailCol, Number(selectedId), { inSplit: true });
  }

  CRM.route(/^\/enquiries$/, (main, _, params) => renderList(main, null, params));
  CRM.route(/^\/enquiries\/(\d+)$/, (main, [id]) => renderList(main, id));

  // ---------- Enquiry detail ----------
  async function renderDetail(container, id, { inSplit } = {}) {
    container.replaceChildren(h('div', { class: 'loading' }, 'Loading…'));
    const [{ enquiry: e, activities }, ref] = await Promise.all([CRM.get(`/api/enquiries/${id}`), CRM.loadRef()]);
    const refresh = () => {
      const idx = listState.items.findIndex((x) => x.id === id);
      return CRM.get(`/api/enquiries/${id}`).then(({ enquiry }) => {
        if (idx >= 0) listState.items[idx] = enquiry;
        return renderList(document.querySelector('#main > .view'), id);
      });
    };

    const isSms = e.phone && e.phone.startsWith('04');
    const contact = h(
      'div',
      { class: 'contact-row' },
      h('a', { href: e.phone ? `tel:${e.phone}` : '#', 'aria-disabled': String(!e.phone) }, CRM.icon('phone'), 'Call'),
      h('a', { href: isSms ? `sms:${e.phone}` : '#', 'aria-disabled': String(!isSms) }, CRM.icon('sms'), 'SMS'),
      h('a', { href: e.email ? `mailto:${e.email}` : '#', 'aria-disabled': String(!e.email) }, CRM.icon('mail'), 'Email')
    );

    // "More" menu holds everything that isn't an everyday action.
    const more = [];
    if (e.can_edit) more.push({ label: 'Edit details', icon: 'edit', onSelect: () => CRM.go(`#/enquiries/${e.id}/edit`) });
    if (CRM.isManager()) more.push({ label: 'Reassign', icon: 'swap', onSelect: () => reassign(e, ref, refresh) });
    if (CRM.isManager() && e.outcome !== 'open') more.push({ label: 'Re-open', icon: 'undo', onSelect: () => reopen(e, refresh) });
    if (CRM.isManager()) more.push('divider', { label: e.is_invalid ? 'Restore (not invalid)' : 'Mark duplicate/invalid', icon: 'ban', onSelect: () => toggleInvalid(e, refresh) });
    if (CRM.isFull() && (e.phone || e.email)) more.push({ label: 'Remove personal details', icon: 'trash', danger: true, onSelect: () => removeDetails(e, refresh) });
    const moreItems = more.filter((x, i, arr) => !(x === 'divider' && (i === 0 || i === arr.length - 1)));
    const moreBtn = moreItems.length
      ? h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'More actions', 'aria-haspopup': 'menu', onclick: (ev) => CRM.menu(ev.currentTarget, moreItems, { align: 'right' }) }, CRM.icon('dots'))
      : null;

    const panel = h('div');
    let actions;
    let approval = null;
    if (e.pending_outcome) {
      // Waiting for the sales manager: show the request, with Approve/Decline for whoever can decide.
      const sold = e.pending_outcome === 'sold';
      approval = h(
        'div',
        { class: ['approval', sold ? 'sold' : 'lost'] },
        h('div', { class: 'approval-head' }, CRM.icon(sold ? 'check' : 'ban'), h('b', null, sold ? 'Marked as sold' : `Marked as lost: ${e.pending_lost_reason}`)),
        h('p', null, `${e.pending_by_name} on ${CRM.fmtDate(e.pending_date, { weekday: true })}. ${e.can_approve ? 'Approve or decline it, with a reason.' : 'Waiting for a sales manager to approve it.'}`),
        e.pending_note ? h('p', { class: 'approval-note' }, `“${e.pending_note}”`) : null,
        h(
          'div',
          { class: 'btn-row' },
          e.can_approve ? h('button', { class: sold ? 'btn-good' : 'btn-primary', onclick: () => decide(e, ref, 'approve', refresh) }, sold ? 'Approve sale' : 'Approve lost') : null,
          e.can_approve ? h('button', { onclick: () => decide(e, ref, 'decline', refresh) }, 'Decline') : null,
          !e.can_approve && e.can_edit ? h('button', { class: 'btn-ghost', onclick: () => withdraw(e, refresh) }, 'Withdraw request') : null
        )
      );
    }
    if (e.can_edit && e.outcome === 'open' && !e.is_invalid && !e.pending_outcome) {
      actions = h(
        'div',
        { class: 'primary-actions' },
        h('button', { class: 'btn-primary btn-log', onclick: () => followupPanel(panel, e, refresh) }, 'Log follow-up'),
        h('button', { class: 'btn-good', onclick: () => markSold(e, refresh) }, 'Sold'),
        h('button', { class: 'btn-danger', onclick: () => markLost(e, ref, refresh) }, 'Lost'),
        moreBtn
      );
    } else if (e.can_edit && e.pending_outcome && !e.is_invalid) {
      actions = h('div', { class: 'primary-actions solo' }, h('button', { class: 'btn-log', onclick: () => followupPanel(panel, e, refresh) }, 'Log follow-up'), moreBtn);
    } else if (moreBtn) {
      actions = h('div', { class: 'btn-row', style: { justifyContent: 'flex-end' } }, moreBtn);
    }

    // Key facts first; the rest behind "More details".
    const fact = (label, value) => (value === null || value === undefined || value === '' ? null : h('div', null, h('dt', null, label), h('dd', null, value)));
    const followCallout =
      e.outcome === 'open' && !e.is_invalid && !e.pending_outcome
        ? h('div', { class: ['next-up', e.overdue && 'overdue', e.next_followup_at === CRM.today() && 'today'] }, CRM.icon('clock'), h('div', null, h('span', null, 'Next follow-up'), h('b', null, `${CRM.relDay(e.next_followup_at)} · ${CRM.fmtDate(e.next_followup_at, { weekday: true })}`)))
        : null;
    const flag = (on, label) => h('span', { class: ['flag', on && 'on'] }, on ? CRM.icon('check') : null, label);
    const keyFacts = h(
      'dl',
      { class: 'facts' },
      fact('Phone', e.phone_display),
      fact('Email', e.email),
      fact('Salesperson', e.salesperson),
      e.outcome === 'sold' ? fact('Sold', CRM.fmtDate(e.sold_date, { year: true })) : null,
      e.outcome === 'lost' ? fact('Lost reason', e.lost_reason || 'Not recorded') : null,
      e.is_invalid ? fact('Marked invalid', e.invalid_reason) : null
    );
    const extraFacts = h(
      'dl',
      { class: 'facts', hidden: true, style: { marginTop: '14px' } },
      fact('Postcode', e.postcode),
      fact('Site', e.location),
      fact('Brand', e.brand),
      fact('Stock #', e.stock_number),
      fact('Source', e.source),
      fact('Date of entry', CRM.fmtDate(e.entry_date, { year: true })),
      fact('Enquiry #', String(e.id))
    );
    const revealBtn = h('button', { type: 'button', class: 'reveal', onclick: () => { extraFacts.hidden = !extraFacts.hidden; revealBtn.textContent = extraFacts.hidden ? 'More details' : 'Fewer details'; } }, 'More details');

    // History: newest few, the rest on request.
    const LABELS = { created: 'Created', comment: 'Comment', call: 'Call', email: 'Email', sms: 'SMS', followup_done: 'Follow-up', status_change: 'Status', edited: 'Edited', reassigned: 'Reassigned', invalid: 'Invalid' };
    const item = (a) => h('li', { class: `t-${a.type}` }, h('div', { class: 'when' }, `${CRM.fmtDateTime(a.created_at)} · ${a.user} · ${LABELS[a.type] || a.type}`), a.body ? h('div', { class: 'body' }, a.body) : null);
    const timeline = h('ul', { class: 'timeline' }, activities.slice(0, 4).map(item));
    const showAll =
      activities.length > 4
        ? h('button', { type: 'button', class: 'reveal', onclick: (ev) => { timeline.replaceChildren(...activities.map(item)); ev.currentTarget.remove(); } }, `Show all ${activities.length}`)
        : null;
    const comment = h('input', { placeholder: 'Add a comment…', 'aria-label': 'Comment', maxLength: 4000 });
    const commentForm = e.can_edit
      ? h(
          'form',
          {
            class: 'add-row',
            style: { marginTop: 0, marginBottom: '16px' },
            onsubmit: async (ev) => {
              ev.preventDefault();
              if (!comment.value.trim()) return;
              try {
                await CRM.post(`/api/enquiries/${e.id}/activities`, { type: 'comment', body: comment.value });
                CRM.toast('Comment added');
                await refresh();
              } catch (err) {
                CRM.fail(err);
              }
            },
          },
          comment,
          h('button', { type: 'submit' }, 'Add')
        )
      : null;

    container.replaceChildren(
      h(
        'article',
        { class: 'card' },
        inSplit ? h('a', { class: 'btn btn-ghost btn-sm back-link', href: '#/enquiries', style: { marginBottom: '10px', marginLeft: '-8px' } }, CRM.icon('back'), 'Back') : null,
        h(
          'div',
          { class: 'detail-head' },
          CRM.avatar(e.customer_name, e.brand_colour),
          h('div', { style: { minWidth: 0, flex: 1 } }, h('h1', null, e.customer_name), h('div', { class: 'muted' }, `${vehicleLine(e)} · ${e.location}`), h('div', { class: 'badges' }, statusBadge(e)))
        ),
        contact,
        approval,
        actions,
        panel,
        followCallout,
        h('div', { class: 'chip-flags', style: { margin: '14px 0' } }, flag(e.test_drive, 'Test drive'), flag(e.trade_in, 'Trade-in'), flag(e.finance, 'Finance')),
        keyFacts,
        extraFacts,
        revealBtn
      ),
      h('section', { class: 'card' }, h('h2', null, 'History'), commentForm, timeline, showAll)
    );
  }

  function quickDates(input) {
    const t = CRM.today();
    const opts = [['Tomorrow', 1], ['3 days', 3], ['1 week', 7], ['2 weeks', 14]];
    const wrap = h('div', { class: 'chips' });
    const mark = () => wrap.querySelectorAll('button[data-date]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.date === input.value)));
    for (const [label, days] of opts) {
      const d = CRM.addDays(t, days);
      wrap.append(h('button', { type: 'button', class: 'chip small', dataset: { date: d }, onclick: () => { input.value = d; mark(); } }, label));
    }
    input.classList.add('date-compact');
    wrap.append(input);
    input.addEventListener('change', mark);
    setTimeout(mark);
    return wrap;
  }

  function followupPanel(panel, e, refresh) {
    if (panel.firstChild) return panel.replaceChildren();
    const t = CRM.today();
    let type = 'call';
    let noAnswer = false;
    const date = h('input', { type: 'date', min: t, value: CRM.addDays(t, 3), required: true, 'aria-label': 'Next follow-up date' });
    const note = h('input', { placeholder: 'Note (optional)', maxLength: 4000 });
    const typeChips = h('div', { class: 'chips' });
    const TYPES = [['call', 'Called', false], ['noanswer', 'No answer', true], ['sms', 'SMS', false], ['email', 'Email', false], ['followup_done', 'Other', false]];
    const drawTypes = () =>
      typeChips.replaceChildren(
        ...TYPES.map(([k, label, na]) =>
          h('button', { type: 'button', class: 'chip small', 'aria-pressed': String(na ? noAnswer : !noAnswer && type === k), onclick: () => { type = na ? 'call' : k; noAnswer = na; drawTypes(); } }, label)
        )
      );
    drawTypes();
    const form = h(
      'form',
      {
        class: 'panel stack',
        onsubmit: async (ev) => {
          ev.preventDefault();
          try {
            await CRM.post(`/api/enquiries/${e.id}/followup`, { type, no_answer: noAnswer, body: note.value, next_followup_at: date.value });
            CRM.toast('Follow-up logged');
            await refresh();
          } catch (err) {
            CRM.showError(form, err);
          }
        },
      },
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'What happened?'), typeChips),
      h('div', { class: 'field', dataset: { field: 'next_followup_at' } }, h('span', { class: 'field-label' }, 'Next follow-up'), quickDates(date)),
      note,
      h('div', { class: 'btn-row' }, h('button', { type: 'submit', class: 'btn-primary' }, 'Save'), h('button', { type: 'button', class: 'btn-ghost', onclick: () => panel.replaceChildren() }, 'Cancel'))
    );
    panel.replaceChildren(form);
    form.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  async function markSold(e, refresh) {
    const needsApproval = !CRM.isManager();
    const note = h('input', { placeholder: 'Deposit taken, delivery date… (optional)', maxLength: 500 });
    CRM.dialog({
      title: 'Mark as sold?',
      body: h(
        'div',
        { class: 'stack' },
        h('p', { class: 'muted', style: { margin: 0 } }, needsApproval ? `Your sales manager will be asked to approve ${e.customer_name} as sold.` : `Record ${e.customer_name} as sold today.`),
        needsApproval ? note : null
      ),
      actions: [
        { label: 'Cancel', class: 'btn-ghost' },
        {
          label: needsApproval ? 'Send for approval' : 'Mark sold',
          class: 'btn-good',
          onClick: async () => {
            await CRM.patch(`/api/enquiries/${e.id}`, { outcome: 'sold', comment: needsApproval ? note.value : undefined });
            CRM.toast(needsApproval ? 'Sent to your sales manager for approval' : 'Marked as sold 🎉');
            await refresh();
          },
        },
      ],
    });
  }

  // Sales manager: approve or decline a Sold/Lost, with a reason.
  function decide(e, ref, decision, refresh) {
    const sold = e.pending_outcome === 'sold';
    const reason = h('textarea', { rows: 3, maxLength: 500, placeholder: decision === 'approve' ? (sold ? 'e.g. Deposit received, delivery booked for Friday' : 'e.g. Confirmed bought elsewhere') : 'e.g. Follow up with the revised trade-in offer first' });
    let lostReason = e.pending_lost_reason_id;
    const chips =
      decision === 'approve' && !sold
        ? h(
            'div',
            { class: 'chips' },
            ref.lost_reasons.filter((r) => r.active).map((r) =>
              h('button', { type: 'button', class: 'chip small', 'aria-pressed': String(r.id === lostReason), onclick: (ev) => { lostReason = r.id; ev.currentTarget.parentElement.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === ev.currentTarget))); } }, r.label)
            )
          )
        : null;
    const body = h(
      'div',
      { class: 'stack' },
      h('p', { class: 'muted', style: { margin: 0 } }, decision === 'approve' ? `${e.customer_name} will be recorded as ${sold ? 'sold' : 'lost'}.` : `${e.customer_name} stays open with ${e.salesperson}. They will see your reason.`),
      chips ? h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Lost reason'), chips) : null,
      h('div', { class: 'field', dataset: { field: 'reason' } }, h('span', { class: 'field-label req' }, decision === 'approve' ? 'Why are you approving it?' : 'Why are you declining it?'), reason)
    );
    CRM.dialog({
      title: decision === 'approve' ? (sold ? 'Approve sale' : 'Approve lost') : 'Decline',
      body,
      actions: [
        { label: 'Cancel', class: 'btn-ghost' },
        {
          label: decision === 'approve' ? 'Approve' : 'Decline',
          class: decision === 'approve' ? 'btn-good' : 'btn-danger',
          onClick: async () => {
            try {
              await CRM.post(`/api/enquiries/${e.id}/approval`, { decision, reason: reason.value, lost_reason_id: lostReason });
            } catch (err) {
              if (err.field) {
                CRM.showError(body, err);
                return true;
              }
              throw err;
            }
            CRM.toast(decision === 'approve' ? 'Approved' : 'Declined: it stays open');
            await refresh();
          },
        },
      ],
    });
  }

  async function withdraw(e, refresh) {
    try {
      await CRM.post(`/api/enquiries/${e.id}/withdraw`, {});
      CRM.toast('Request withdrawn');
      await refresh();
    } catch (err) {
      CRM.fail(err);
    }
  }

  function markLost(e, ref, refresh) {
    const reasons = ref.lost_reasons.filter((r) => r.active);
    let chosen = null;
    const chips = h(
      'div',
      { class: 'chips' },
      reasons.map((r) =>
        h('button', { type: 'button', class: 'chip', 'aria-pressed': 'false', onclick: (ev) => { chosen = r.id; chips.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === ev.currentTarget))); } }, r.label)
      )
    );
    const note = h('input', { placeholder: 'Any detail (optional)' });
    CRM.dialog({
      title: 'Why was it lost?',
      body: h('div', { class: 'stack' }, chips, note),
      actions: [
        { label: 'Cancel', class: 'btn-ghost' },
        {
          label: CRM.isManager() ? 'Mark lost' : 'Send for approval',
          class: 'btn-primary',
          onClick: async () => {
            if (!chosen) {
              CRM.toast('Choose a reason', 'error');
              return true;
            }
            await CRM.patch(`/api/enquiries/${e.id}`, { outcome: 'lost', lost_reason_id: chosen, comment: note.value });
            CRM.toast(CRM.isManager() ? 'Marked as lost' : 'Sent to your sales manager for approval');
            await refresh();
          },
        },
      ],
    });
  }

  function reopen(e, refresh) {
    const date = h('input', { type: 'date', min: CRM.today(), value: CRM.addDays(CRM.today(), 1) });
    CRM.dialog({
      title: 'Re-open enquiry',
      body: h('div', { class: 'stack' }, h('p', { class: 'muted' }, `${e.customer_name} goes back to open.`), CRM.field('Next follow-up', date)),
      actions: [
        { label: 'Cancel', class: 'btn-ghost' },
        { label: 'Re-open', class: 'btn-primary', onClick: async () => { await CRM.patch(`/api/enquiries/${e.id}`, { outcome: 'open', next_followup_at: date.value }); CRM.toast('Re-opened'); await refresh(); } },
      ],
    });
  }

  function reassign(e, ref, refresh) {
    const people = ref.assignees.filter((u) => u.franchise_ids.includes(e.franchise_id));
    const sel = CRM.select(people.map((u) => ({ value: u.id, label: `${u.name} (${CRM.ROLE[u.role]})` })), e.salesperson_id);
    CRM.dialog({
      title: 'Reassign enquiry',
      body: people.length ? CRM.field(`Who should look after ${e.customer_name}?`, sel) : h('p', null, 'Nobody else is assigned to this brand at this site.'),
      actions: [
        { label: 'Cancel', class: 'btn-ghost' },
        people.length ? { label: 'Reassign', class: 'btn-primary', onClick: async () => { await CRM.patch(`/api/enquiries/${e.id}`, { salesperson_id: Number(sel.value) }); CRM.toast('Reassigned'); await refresh(); } } : null,
      ].filter(Boolean),
    });
  }

  function toggleInvalid(e, refresh) {
    if (e.is_invalid) {
      return CRM.post(`/api/enquiries/${e.id}/invalid`, { invalid: false }).then(() => { CRM.toast('Restored'); return refresh(); }).catch(CRM.fail);
    }
    const reason = h('input', { placeholder: 'e.g. Duplicate of #123, test entry', maxLength: 200 });
    CRM.dialog({
      title: 'Mark as duplicate/invalid',
      body: h('div', { class: 'stack' }, h('p', { class: 'muted' }, 'It will be hidden from lists and reports but kept on record. You can restore it later.'), CRM.field('Reason', reason)),
      actions: [
        { label: 'Cancel', class: 'btn-ghost' },
        { label: 'Mark invalid', class: 'btn-primary', onClick: async () => { await CRM.post(`/api/enquiries/${e.id}/invalid`, { reason: reason.value }); CRM.toast('Marked invalid'); await refresh(); } },
      ],
    });
  }

  async function removeDetails(e, refresh) {
    if (!(await CRM.confirm('Remove personal details?', `Use this if ${e.customer_name} asks to be removed. Their name, phone, email and comments are permanently blanked; the enquiry stays in reports. This cannot be undone.`, 'Remove details', 'btn-danger'))) return;
    try {
      await CRM.post(`/api/enquiries/${e.id}/remove-personal-details`, { confirm: true });
      CRM.toast('Personal details removed');
      await refresh();
    } catch (err) {
      CRM.fail(err);
    }
  }

  // ---------- New / edit form ----------
  CRM.route(/^\/new$/, (main) => renderForm(main, null));
  CRM.route(/^\/enquiries\/(\d+)\/edit$/, async (main, [id]) => {
    const { enquiry } = await CRM.get(`/api/enquiries/${id}`);
    return renderForm(main, enquiry);
  });

  async function renderForm(main, existing) {
    const ref = await CRM.loadRef(true);
    const me = CRM.state.me;
    const t = CRM.today();
    const creatable = ref.franchises.filter((f) => f.can_create || (existing && f.id === existing.franchise_id));
    if (!creatable.length) {
      main.replaceChildren(h('div', { class: 'card' }, CRM.empty('No brands assigned yet', 'Ask your sales manager to add you to a brand and site.', 'alert')));
      return;
    }
    const locIds = [...new Set(creatable.map((f) => f.location_id))];
    const s = {
      location_id: existing?.location_id ?? (locIds.includes(me.home_location_id) ? me.home_location_id : locIds[0]),
      brand_id: existing?.brand_id ?? null,
      model_id: existing?.model_id ?? '',
      test_drive: existing?.test_drive ?? false,
      trade_in: existing?.trade_in ?? false,
      finance: existing?.finance ?? false,
      outcome: existing?.outcome ?? 'open',
      lost_reason_id: existing?.lost_reason_id ?? null,
    };
    const brandsAt = (locId) => creatable.filter((f) => f.location_id === Number(locId)).map((f) => CRM.byId(ref.brands, f.brand_id)).filter(Boolean);
    if (!s.brand_id) {
      const b = brandsAt(s.location_id);
      if (b.length === 1) s.brand_id = b[0].id;
    }

    const form = h('form', { class: 'stack', novalidate: true });
    const name = h('input', { id: 'f-name', autocomplete: 'off', autocapitalize: 'words', value: existing?.customer_name ?? '', maxLength: 100, placeholder: 'e.g. Sam Smith' });
    const postcode = h('input', { id: 'f-postcode', inputMode: 'numeric', pattern: '[0-9]*', maxLength: 4, autocomplete: 'off', value: existing?.postcode ?? '', placeholder: '4551' });
    const phone = h('input', { id: 'f-phone', type: 'tel', inputMode: 'tel', autocomplete: 'off', value: existing?.phone_display ?? '', placeholder: '04xx xxx xxx' });
    const email = h('input', { id: 'f-email', type: 'email', inputMode: 'email', autocomplete: 'off', autocapitalize: 'none', value: existing?.email ?? '', placeholder: 'name@example.com' });
    const followup = h('input', { id: 'f-follow', type: 'date', min: t, value: existing?.next_followup_at ?? CRM.addDays(t, 1), 'aria-label': 'Next follow-up date' });
    const comment = h('textarea', { id: 'f-comment', rows: 3, placeholder: existing ? 'Add a comment (optional)' : 'Budget, timing, trade details… (optional)' });
    const source = CRM.select(
      ref.sources.filter((x) => x.active || x.id === existing?.source_id).map((x) => ({ value: x.id, label: x.label })),
      existing?.source_id ?? ref.sources.find((x) => x.active)?.id,
      { id: 'f-source' }
    );
    const entryDate = h('input', { id: 'f-entry', type: 'date', max: t, value: existing?.entry_date ?? t });
    const salespersonSel = h('select', { id: 'f-sp' });

    // Used cars: typed make and model, with suggestions from what's been used before.
    const makeList = h('datalist', { id: 'dl-makes' }, ref.used_makes.filter((m) => m.active).map((m) => h('option', { value: m.name })));
    const modelList = h('datalist', { id: 'dl-models' });
    const usedMake = h('input', { id: 'f-make', list: 'dl-makes', autocomplete: 'off', autocapitalize: 'words', placeholder: 'e.g. Toyota', value: existing?.used_make ?? '', maxLength: 40 });
    const usedModel = h('input', { id: 'f-used-model', list: 'dl-models', autocomplete: 'off', autocapitalize: 'words', placeholder: 'e.g. HiLux', value: existing?.used_model ?? '', maxLength: 60 });
    const stock = h('input', { id: 'f-stock', autocomplete: 'off', autocapitalize: 'characters', value: existing?.stock_number ?? '', maxLength: 20, placeholder: 'Optional' });
    const fillModels = () => {
      const make = ref.used_makes.find((m) => m.name.toLowerCase() === usedMake.value.trim().toLowerCase());
      const names = make
        ? [
            ...ref.used_linked_models.filter((x) => make.brand_id && x.brand_id === make.brand_id && x.active).map((x) => x.name),
            ...ref.used_models.filter((x) => x.make_id === make.id && x.active).map((x) => x.name),
          ].sort((a, b) => a.localeCompare(b))
        : [];
      modelList.replaceChildren(...names.map((n) => h('option', { value: n })));
    };
    usedMake.addEventListener('input', fillModels);
    fillModels();

    const siteField = h('div');
    const brandField = h('div', { class: 'field', dataset: { field: 'brand_id' } });
    const vehicleField = h('div');
    const outcomeField = h('div', { class: 'stack' });
    const dupBox = h('div');

    function drawSite() {
      if (locIds.length <= 1) return siteField.replaceChildren();
      siteField.replaceChildren(
        h(
          'div',
          { class: 'field', dataset: { field: 'location_id' } },
          h('span', { class: 'field-label req' }, 'Site'),
          h(
            'div',
            { class: 'chips' },
            locIds.map((lid) =>
              h('button', { type: 'button', class: 'chip', 'aria-pressed': String(Number(s.location_id) === lid), onclick: () => { s.location_id = lid; const b = brandsAt(lid); s.brand_id = b.some((x) => x.id === s.brand_id) ? s.brand_id : b.length === 1 ? b[0].id : null; drawSite(); drawBrands(); drawVehicle(); drawSalesperson(); } }, CRM.byId(ref.locations, lid)?.name)
            )
          )
        )
      );
    }

    function drawBrands() {
      const list = brandsAt(s.location_id);
      brandField.replaceChildren(
        h('span', { class: 'field-label req' }, 'Brand'),
        h(
          'div',
          { class: 'chips' },
          list.map((b) =>
            h('button', { type: 'button', class: 'chip', 'aria-pressed': String(s.brand_id === b.id), onclick: () => { s.brand_id = b.id; s.model_id = ''; drawBrands(); drawVehicle(); drawSalesperson(); } }, h('span', { class: 'dot', style: { background: b.colour || 'var(--muted)' } }), b.name)
          )
        )
      );
    }

    function drawVehicle() {
      const brand = CRM.byId(ref.brands, s.brand_id);
      if (!brand) return vehicleField.replaceChildren();
      if (!brand.is_used) {
        const models = ref.models.filter((m) => m.brand_id === brand.id && (m.active || m.id === existing?.model_id));
        const sel = CRM.select([{ value: '', label: 'Choose model…' }, ...models.map((m) => ({ value: m.id, label: m.name }))], s.model_id, { id: 'f-model', onchange: (e) => (s.model_id = e.target.value) });
        return vehicleField.replaceChildren(CRM.field('Model', sel, { name: 'model_id', required: true }));
      }
      vehicleField.replaceChildren(
        makeList,
        modelList,
        h(
          'div',
          { class: 'form-grid cols-3' },
          CRM.field('Make', usedMake, { name: 'used_make_id', required: true }),
          CRM.field('Model', usedModel, { name: 'used_model_id', required: true }),
          CRM.field('Stock number', stock, { name: 'stock_number' })
        )
      );
    }

    function toggle(key, label) {
      const btn = h('button', { type: 'button', class: 'toggle', 'aria-pressed': String(!!s[key]), onclick: () => { s[key] = !s[key]; btn.setAttribute('aria-pressed', String(s[key])); btn.querySelector('small').textContent = s[key] ? 'Yes' : 'No'; } }, label, h('small', null, s[key] ? 'Yes' : 'No'));
      return btn;
    }

    function drawOutcome() {
      const seg = h(
        'div',
        { class: 'segmented', role: 'group', 'aria-label': 'Outcome' },
        [['open', 'Open'], ['sold', 'Sold'], ['lost', 'Lost']].map(([v, l]) =>
          h('button', { type: 'button', dataset: { value: v }, 'aria-pressed': String(s.outcome === v), disabled: existing && existing.outcome !== 'open' && !CRM.isManager() && v !== existing.outcome, onclick: () => { s.outcome = v; drawOutcome(); } }, l)
        )
      );
      const reasons = ref.lost_reasons.filter((r) => r.active || r.id === existing?.lost_reason_id);
      outcomeField.replaceChildren(
        h('div', { class: 'field', dataset: { field: 'outcome' } }, h('span', { class: 'field-label' }, 'Outcome'), seg),
        s.outcome !== 'open' && !CRM.isManager() ? h('p', { class: 'hint', style: { margin: 0 } }, 'Your sales manager will be asked to approve this. Until then it stays open.') : null,
        s.outcome === 'open' || !CRM.isManager() ? h('div', { class: 'field', dataset: { field: 'next_followup_at' } }, h('span', { class: 'field-label req' }, 'Next follow-up'), quickDates(followup)) : null,
        s.outcome === 'lost'
          ? h(
              'div',
              { class: 'field', dataset: { field: 'lost_reason_id' } },
              h('span', { class: 'field-label req' }, 'Why was it lost?'),
              h('div', { class: 'chips' }, reasons.map((r) => h('button', { type: 'button', class: 'chip small', 'aria-pressed': String(s.lost_reason_id === r.id), onclick: () => { s.lost_reason_id = r.id; drawOutcome(); } }, r.label)))
            )
          : null
      );
    }

    function drawSalesperson() {
      if (!CRM.isManager()) return;
      const f = creatable.find((x) => x.location_id === Number(s.location_id) && x.brand_id === s.brand_id);
      const people = f ? ref.assignees.filter((u) => u.franchise_ids.includes(f.id)) : [];
      if (CRM.isFull() && !people.some((u) => u.id === me.id)) people.unshift({ id: me.id, name: me.name });
      const current = salespersonSel.value || existing?.salesperson_id || me.id;
      salespersonSel.replaceChildren(...people.map((u) => h('option', { value: u.id, selected: Number(current) === u.id }, u.id === me.id ? `${u.name} (me)` : u.name)));
    }

    // Duplicate check as the phone/email is entered.
    async function checkDuplicates() {
      const p = phone.value.trim();
      const em = email.value.trim();
      if (p.replace(/\D/g, '').length < 8 && !/@.+\./.test(em)) return dupBox.replaceChildren();
      try {
        const { matches } = await CRM.get(`/api/enquiries/duplicates${CRM.qs({ phone: p.replace(/\D/g, '').length >= 8 ? p : '', email: /@.+\./.test(em) ? em : '', exclude_id: existing?.id })}`);
        dupBox.replaceChildren(
          ...(matches.length
            ? [
                h(
                  'div',
                  { class: 'dup-warning', role: 'status' },
                  h('b', null, 'Already enquiring: '),
                  matches.map((m, i) => [i ? '; ' : '', m.can_view ? h('a', { href: `#/enquiries/${m.id}` }, `${m.brand} at ${m.location}`) : `${m.brand} at ${m.location}`, ` with ${m.salesperson} since ${CRM.fmtDate(m.entry_date)}`]),
                  '. Check before adding another.'
                ),
              ]
            : [])
        );
      } catch {
        /* ignore */
      }
    }
    phone.addEventListener('blur', checkDuplicates);
    email.addEventListener('blur', checkDuplicates);

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      const brand = CRM.byId(ref.brands, s.brand_id);
      const body = {
        location_id: s.location_id,
        brand_id: s.brand_id,
        customer_name: name.value,
        postcode: postcode.value,
        phone: phone.value,
        email: email.value,
        test_drive: s.test_drive,
        trade_in: s.trade_in,
        finance: s.finance,
        source_id: source.value ? Number(source.value) : null,
        outcome: s.outcome,
        comment: comment.value,
      };
      if (brand && brand.is_used) {
        body.used_make = usedMake.value;
        body.used_model = usedModel.value;
        body.stock_number = stock.value;
      } else {
        body.model_id = s.model_id ? Number(s.model_id) : null;
      }
      if (s.outcome === 'open' || !CRM.isManager()) body.next_followup_at = followup.value;
      if (s.outcome === 'lost') body.lost_reason_id = s.lost_reason_id;
      if (CRM.isManager()) {
        body.salesperson_id = Number(salespersonSel.value) || undefined;
        body.entry_date = entryDate.value;
      }
      try {
        const res = existing ? await CRM.patch(`/api/enquiries/${existing.id}`, body) : await CRM.post('/api/enquiries', body);
        CRM.toast(res.enquiry.pending_outcome && (!existing || !existing.pending_outcome) ? 'Saved and sent to your sales manager for approval' : existing ? 'Saved' : 'Walk-in saved');
        await CRM.loadRef(true);
        CRM.go(existing ? `#/enquiries/${res.enquiry.id}` : '#/today');
      } catch (err) {
        if (err.silent) return;
        if (['source_id', 'salesperson_id', 'entry_date'].includes(err.field)) moreOpts.open = true;
        CRM.showError(form, err);
      } finally {
        btn.disabled = false;
      }
    });

    const moreOpts = h(
      'details',
      { class: 'more-options' },
      h('summary', null, 'More options', h('small', null, CRM.isManager() ? 'Source, salesperson, date' : 'Source')),
      h(
        'div',
        { class: 'form-grid cols-3', style: { marginTop: '14px' } },
        CRM.field('Source', source, { name: 'source_id' }),
        CRM.isManager() ? CRM.field('Salesperson', salespersonSel, { name: 'salesperson_id' }) : null,
        CRM.isManager() ? CRM.field('Date of entry', entryDate, { name: 'entry_date' }) : null
      )
    );

    form.append(
      h('div', { class: 'card stack' }, h('h2', { class: 'step' }, h('span', null, '1'), 'Vehicle'), siteField, brandField, vehicleField),
      h(
        'div',
        { class: 'card stack' },
        h('h2', { class: 'step' }, h('span', null, '2'), 'Customer'),
        h('div', { class: 'form-grid cols-2' }, CRM.field('Name', name, { name: 'customer_name', required: true }), CRM.field('Postcode', postcode, { name: 'postcode', required: true })),
        h('div', { class: 'form-grid cols-2' }, CRM.field('Phone', phone, { name: 'phone' }), CRM.field('Email', email, { name: 'email', hint: 'Phone or email needed' })),
        dupBox
      ),
      h(
        'div',
        { class: 'card stack' },
        h('h2', { class: 'step' }, h('span', null, '3'), 'Visit'),
        h('div', { class: 'toggles' }, toggle('test_drive', 'Test drive'), toggle('trade_in', 'Trade-in'), toggle('finance', 'Finance')),
        outcomeField,
        CRM.field('Comments', comment, { name: 'comment' }),
        moreOpts
      ),
      h(
        'div',
        { class: 'form-actions' },
        h('a', { class: 'btn btn-ghost btn-big', href: existing ? `#/enquiries/${existing.id}` : '#/today' }, 'Cancel'),
        h('button', { type: 'submit', class: 'btn-primary btn-big', style: { flex: '1' } }, existing ? 'Save changes' : 'Save walk-in')
      )
    );

    drawSite();
    drawBrands();
    drawVehicle();
    drawOutcome();
    drawSalesperson();
    main.replaceChildren(
      h('div', { class: 'form-wrap' }, h('div', { class: 'page-head' }, h('div', null, h('h1', null, existing ? `Edit ${existing.customer_name}` : 'New walk-in'), existing ? h('p', { class: 'muted' }, `Enquiry #${existing.id}`) : null)), form)
    );
    if (!existing) (s.brand_id ? brandField.closest('.card').querySelector('select, input') || name : brandField.querySelector('button'))?.focus();
  }
})();
