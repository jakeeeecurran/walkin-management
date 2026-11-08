// Today screen, enquiry list, enquiry detail and the new/edit enquiry form.
(function () {
  const CRM = window.CRM;
  const { h } = CRM;

  // ---------- Shared bits ----------
  function outcomeBadge(e) {
    const out = [];
    if (e.is_invalid) out.push(h('span', { class: 'badge badge-invalid' }, 'Duplicate/invalid'));
    if (e.outcome === 'sold') out.push(h('span', { class: 'badge badge-sold' }, 'Sold'));
    else if (e.outcome === 'lost') out.push(h('span', { class: 'badge badge-lost' }, 'Lost'));
    else if (e.overdue) out.push(h('span', { class: 'badge badge-overdue' }, `Overdue · ${CRM.relDay(e.next_followup_at)}`));
    else if (e.next_followup_at === CRM.today()) out.push(h('span', { class: 'badge badge-due' }, 'Follow up today'));
    else out.push(h('span', { class: 'badge badge-open' }, `Open · ${CRM.relDay(e.next_followup_at)}`));
    return out;
  }
  function brandBadge(e) {
    return h('span', { class: 'badge badge-brand' }, h('i', { style: { background: e.brand_colour || 'var(--muted)' } }), `${e.brand} · ${e.location}`);
  }

  function enquiryRow(e, { selected, compact } = {}) {
    return h(
      'li',
      null,
      h(
        'a',
        { class: ['erow', selected && 'selected'], href: `#/enquiries/${e.id}` },
        CRM.avatar(e.customer_name, e.brand_colour),
        h('div', null, h('div', { class: 'name' }, e.customer_name), h('div', { class: 'sub' }, [e.brand, e.vehicle].filter(Boolean).join(' '))),
        h('div', { class: 'right' }, outcomeBadge(e)),
        compact
          ? null
          : h(
              'div',
              { class: 'meta' },
              h('span', null, e.phone_display || e.email || ''),
              h('span', { class: 'wide-only' }, e.location),
              CRM.isManager() ? h('span', null, e.salesperson) : null,
              h('span', null, `In ${CRM.fmtDate(e.entry_date)}`),
              e.test_drive ? h('span', null, '✓ Test drive') : null
            )
      )
    );
  }

  // ---------- Today ----------
  CRM.route(/^\/today$/, async (main) => {
    const me = CRM.state.me;
    const today = CRM.today();
    main.replaceChildren(h('div', { class: 'loading' }, 'Loading…'));
    const [due, mine] = await Promise.all([
      CRM.get(`/api/enquiries${CRM.qs({ due: 'today', sort: 'followup', limit: 200 })}`),
      CRM.get(`/api/enquiries${CRM.qs({ entry_date: today, limit: 200 })}`),
    ]);
    const overdue = due.items.filter((e) => e.next_followup_at < today);
    const dueToday = due.items.filter((e) => e.next_followup_at === today);

    const section = (title, items, emptyText, cls) =>
      h(
        'section',
        { class: 'card' },
        h('div', { class: 'card-head' }, h('h2', { class: cls }, `${title} (${items.length})`)),
        items.length ? h('ul', { class: 'elist' }, items.map((e) => enquiryRow(e))) : CRM.empty(emptyText, null, 'check')
      );

    main.replaceChildren(
      h('div', { class: 'page-head' }, h('div', null, h('p', { class: 'muted small', style: { margin: '0 0 4px', fontWeight: 600 } }, CRM.fmtDate(today, { weekday: true, year: true })), h('h1', null, `G'day ${me.name.split(' ')[0]}`))),
      h(
        'div',
        { class: 'today-hero' },
        h('a', { class: 'new-cta', href: '#/new' }, h('div', null, h('b', null, 'New walk-in'), h('span', null, 'Log a customer in under 30 seconds')), h('span', { class: 'plus', 'aria-hidden': 'true' }, '+')),
        h(
          'div',
          { class: 'stat-row' },
          h('a', { class: ['stat', overdue.length && 'alert'], href: '#/enquiries?view=overdue' }, h('div', { class: 'ico' }, CRM.icon('alert')), h('b', null, overdue.length), h('span', null, 'Overdue')),
          h('a', { class: ['stat', dueToday.length && 'warn'], href: '#/enquiries?view=due' }, h('div', { class: 'ico' }, CRM.icon('clock')), h('b', null, dueToday.length), h('span', null, 'Follow up today')),
          h('a', { class: 'stat', href: `#/enquiries?view=today` }, h('div', { class: 'ico' }, CRM.icon('walk')), h('b', null, mine.total), h('span', null, CRM.isManager() ? 'Walk-ins today' : 'My walk-ins today'))
        )
      ),
      overdue.length ? section('Overdue follow-ups', overdue, '', '') : null,
      section('Follow up today', dueToday, overdue.length ? 'Nothing else due today.' : "You're all caught up. Nothing due today."),
      section(CRM.isManager() ? "Today's walk-ins" : 'My walk-ins today', mine.items, 'No walk-ins logged yet today.')
    );
  });

  // ---------- Enquiry list (with detail panel on tablet/desktop) ----------
  const VIEWS = {
    open: { label: 'Open', params: { outcome: 'open', sort: 'followup' } },
    overdue: { label: 'Overdue', params: { overdue: '1', sort: 'followup' } },
    due: { label: 'Due today', params: { due: 'today', sort: 'followup' } },
    today: { label: 'Today', params: () => ({ entry_date: CRM.today() }) },
    month: { label: 'This month', params: () => ({ month: CRM.today().slice(0, 7) }) },
    sold: { label: 'Sold', params: { outcome: 'sold' } },
    lost: { label: 'Lost', params: { outcome: 'lost' } },
    all: { label: 'All', params: {} },
  };

  let listState = { view: 'open', q: '', location_id: '', brand_id: '', salesperson_id: '', items: [], total: 0, key: '' };

  async function renderList(main, selectedId, params) {
    const ref = await CRM.loadRef();
    if (params && Object.keys(params).length) {
      listState = { ...listState, view: params.view || 'open', q: params.q || '', location_id: params.location_id || '', brand_id: params.brand_id || '', salesperson_id: params.salesperson_id || '' };
    }
    const query = () => {
      const v = VIEWS[listState.view] || VIEWS.open;
      const base = typeof v.params === 'function' ? v.params() : v.params;
      return { ...base, q: listState.q, location_id: listState.location_id, brand_id: listState.brand_id, salesperson_id: listState.salesperson_id };
    };

    const split = h('div', { class: ['split', selectedId && 'has-detail'] });
    const listCol = h('div', { class: 'split-list' });
    const detailCol = h('div', { class: 'split-detail' });
    split.append(listCol, detailCol);

    const results = h('div');
    const countEl = h('span', { class: 'muted small' });

    async function load(more) {
      const q = query();
      const key = JSON.stringify(q);
      if (!more && key === listState.key && listState.items.length && main.dataset.keep === '1') {
        draw();
        return;
      }
      const data = await CRM.get(`/api/enquiries${CRM.qs({ ...q, limit: 50, offset: more ? listState.items.length : 0 })}`);
      listState.items = more ? [...listState.items, ...data.items] : data.items;
      listState.total = data.total;
      listState.key = key;
      draw();
    }

    function draw() {
      countEl.textContent = `${listState.total} enquir${listState.total === 1 ? 'y' : 'ies'}`;
      if (!listState.items.length) {
        results.replaceChildren(h('div', { class: 'card' }, CRM.empty('No enquiries match', 'Try a different filter or search.', 'search')));
        return;
      }
      const cards = h('ul', { class: 'elist only-narrow' }, listState.items.map((e) => enquiryRow(e, { selected: e.id === Number(selectedId) })));
      const table = h(
        'div',
        { class: 'table-wrap only-wide' },
        h(
          'table',
          { class: 'data' },
          h('thead', null, h('tr', null, ['#', 'Date', 'Customer', 'Phone', 'Brand', 'Site', 'Vehicle', CRM.isManager() ? 'Salesperson' : null, 'TD', 'Status'].filter(Boolean).map((x) => h('th', null, x)))),
          h(
            'tbody',
            null,
            listState.items.map((e) =>
              h(
                'tr',
                { class: 'clickable', onclick: () => CRM.go(`#/enquiries/${e.id}`) },
                h('td', { class: 'muted' }, e.id),
                h('td', null, CRM.fmtDate(e.entry_date)),
                h('td', null, h('a', { href: `#/enquiries/${e.id}` }, e.customer_name)),
                h('td', null, e.phone_display || e.email || ''),
                h('td', null, e.brand),
                h('td', null, e.location),
                h('td', null, e.vehicle || ''),
                CRM.isManager() ? h('td', null, e.salesperson) : null,
                h('td', null, e.test_drive ? '✓' : ''),
                h('td', null, outcomeBadge(e))
              )
            )
          )
        )
      );
      results.replaceChildren(
        cards,
        table,
        listState.items.length < listState.total ? h('p', { style: { textAlign: 'center', marginTop: '12px' } }, h('button', { onclick: () => load(true).catch(CRM.fail) }, 'Load more')) : null
      );
    }

    const syncQuery = () =>
      CRM.setQuery({ view: listState.view === 'open' ? '' : listState.view, q: listState.q, location_id: listState.location_id, brand_id: listState.brand_id, salesperson_id: listState.salesperson_id });

    let timer;
    const search = h('input', {
      type: 'search',
      placeholder: 'Search name, phone, email, stock # or enquiry #',
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

    const chips = h(
      'div',
      { class: 'chips', role: 'group', 'aria-label': 'Show' },
      Object.entries(VIEWS).map(([k, v]) =>
        h('button', { type: 'button', class: 'chip small', 'aria-pressed': String(listState.view === k), onclick: () => { listState.view = k; syncQuery(); renderList(main, selectedId).catch(CRM.fail); } }, v.label)
      )
    );

    const sel = (label, key, options) =>
      CRM.select([{ value: '', label }, ...options], listState[key], {
        'aria-label': label,
        onchange: (e) => {
          listState[key] = e.target.value;
          syncQuery();
          load().catch(CRM.fail);
        },
      });
    const filters = [];
    if (ref.locations.length > 1) filters.push(sel('All sites', 'location_id', ref.locations.map((l) => ({ value: l.id, label: l.name }))));
    if (ref.brands.length > 1) filters.push(sel('All brands', 'brand_id', ref.brands.map((b) => ({ value: b.id, label: b.name }))));
    if (CRM.isManager() && ref.assignees.length) filters.push(sel('All salespeople', 'salesperson_id', ref.assignees.map((u) => ({ value: u.id, label: u.name }))));

    listCol.append(
      h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Enquiries'), countEl), h('a', { class: 'btn btn-accent', href: '#/new' }, '+ New')),
      h('div', { class: 'list-toolbar' }, h('div', { class: 'search' }, CRM.icon('search'), search), chips, filters.length ? h('div', { class: 'row' }, filters) : null),
      results
    );
    main.replaceChildren(split);
    main.dataset.keep = '0';
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

    const tel = e.phone ? `tel:${e.phone}` : null;
    const contact = h(
      'div',
      { class: 'contact-row' },
      h('a', { href: tel || '#', 'aria-disabled': String(!tel) }, CRM.icon('phone'), 'Call'),
      h('a', { href: e.phone && e.phone.startsWith('04') ? `sms:${e.phone}` : '#', 'aria-disabled': String(!(e.phone && e.phone.startsWith('04'))) }, CRM.icon('sms'), 'SMS'),
      h('a', { href: e.email ? `mailto:${e.email}` : '#', 'aria-disabled': String(!e.email) }, CRM.icon('mail'), 'Email')
    );

    const fact = (label, value) => (value === null || value === undefined || value === '' ? null : h('div', null, h('dt', null, label), h('dd', null, value)));
    const yn = (x) => (x ? 'Yes' : 'No');
    const facts = h(
      'dl',
      { class: 'facts' },
      fact('Phone', e.phone_display),
      fact('Email', e.email),
      fact('Postcode', e.postcode),
      fact('Brand · site', `${e.brand} · ${e.location}`),
      fact(e.brand_is_used ? 'Vehicle' : 'Model', e.vehicle || 'Not recorded'),
      fact('Stock #', e.stock_number),
      fact('Salesperson', e.salesperson),
      fact('Date of entry', CRM.fmtDate(e.entry_date, { year: true })),
      fact('Source', e.source),
      fact('Test drive', yn(e.test_drive)),
      fact('Trade-in', yn(e.trade_in)),
      fact('Finance', yn(e.finance)),
      e.outcome === 'open' ? fact('Next follow-up', `${CRM.relDay(e.next_followup_at)} (${CRM.fmtDate(e.next_followup_at)})`) : null,
      e.outcome === 'sold' ? fact('Sold', CRM.fmtDate(e.sold_date, { year: true })) : null,
      e.outcome === 'lost' ? fact('Lost reason', e.lost_reason || 'Not recorded') : null,
      e.is_invalid ? fact('Marked invalid', e.invalid_reason) : null
    );

    const panel = h('div');
    const actions = [];
    if (e.can_edit && e.outcome === 'open' && !e.is_invalid) {
      actions.push(
        h('button', { class: 'btn-primary', onclick: () => followupPanel(panel, e, refresh) }, 'Log follow-up'),
        h('button', { class: 'btn-good', onclick: () => markSold(e, refresh) }, 'Sold'),
        h('button', { class: 'btn-danger', onclick: () => markLost(e, ref, refresh) }, 'Lost')
      );
    }
    if (e.can_edit) actions.push(h('a', { class: 'btn', href: `#/enquiries/${e.id}/edit` }, 'Edit'));
    if (CRM.isManager() && e.outcome !== 'open') actions.push(h('button', { onclick: () => reopen(e, refresh) }, 'Re-open'));
    if (CRM.isManager()) {
      actions.push(
        h('button', { onclick: () => reassign(e, ref, refresh) }, 'Reassign'),
        h('button', { class: 'btn-ghost', onclick: () => toggleInvalid(e, refresh) }, e.is_invalid ? 'Restore' : 'Mark duplicate/invalid')
      );
    }
    if (CRM.isFull() && (e.phone || e.email)) {
      actions.push(
        h('button', {
          class: 'btn-ghost',
          onclick: async () => {
            if (!(await CRM.confirm('Remove personal details?', `Use this if ${e.customer_name} asks to be removed. Their name, phone, email and comments are permanently blanked; the enquiry stays in reports. This cannot be undone.`, 'Remove details', 'btn-danger'))) return;
            try {
              await CRM.post(`/api/enquiries/${e.id}/remove-personal-details`, { confirm: true });
              CRM.toast('Personal details removed');
              await refresh();
            } catch (err) {
              CRM.fail(err);
            }
          },
        }, 'Remove personal details')
      );
    }

    const comment = h('textarea', { placeholder: 'Add a comment…', rows: 2, 'aria-label': 'Comment' });
    const commentForm = e.can_edit
      ? h(
          'form',
          {
            class: 'stack',
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
          h('div', null, h('button', { type: 'submit' }, 'Add comment'))
        )
      : null;

    const LABELS = { created: 'Created', comment: 'Comment', call: 'Call', email: 'Email', sms: 'SMS', followup_done: 'Follow-up', status_change: 'Status', edited: 'Edited', reassigned: 'Reassigned', invalid: 'Invalid' };
    const timeline = h(
      'ul',
      { class: 'timeline' },
      activities.map((a) =>
        h('li', { class: `t-${a.type}` }, h('div', { class: 'when' }, `${CRM.fmtDateTime(a.created_at)} · ${a.user} · ${LABELS[a.type] || a.type}`), a.body ? h('div', { class: 'body' }, a.body) : null)
      )
    );

    container.replaceChildren(
      h(
        'article',
        { class: 'card' },
        inSplit ? h('a', { class: 'btn btn-ghost btn-sm back-link', href: '#/enquiries', style: { marginBottom: '10px', marginLeft: '-8px' } }, CRM.icon('back'), 'Back to list') : null,
        h(
          'div',
          { class: 'detail-head' },
          CRM.avatar(e.customer_name, e.brand_colour),
          h('div', null, h('h1', null, e.customer_name), h('div', { class: 'muted small' }, `Enquiry #${e.id} · ${[e.brand, e.vehicle].filter(Boolean).join(' ')}`), h('div', { class: 'badges' }, outcomeBadge(e), brandBadge(e)))
        ),
        contact,
        actions.length ? h('div', { class: 'actions' }, actions) : null,
        panel,
        h('hr', { class: 'divider' }),
        facts
      ),
      h('section', { class: 'card' }, h('h2', null, 'History'), commentForm, h('div', { style: { height: '12px' } }), timeline)
    );
  }

  function quickDates(input) {
    const t = CRM.today();
    const opts = [['Tomorrow', 1], ['3 days', 3], ['1 week', 7], ['2 weeks', 14], ['1 month', 30]];
    const wrap = h('div', { class: 'chips' });
    const mark = () => wrap.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.date === input.value)));
    for (const [label, days] of opts) {
      const d = CRM.addDays(t, days);
      wrap.append(h('button', { type: 'button', class: 'chip small', dataset: { date: d }, onclick: () => { input.value = d; mark(); } }, label));
    }
    input.addEventListener('change', mark);
    setTimeout(mark);
    return wrap;
  }

  function followupPanel(panel, e, refresh) {
    const t = CRM.today();
    let type = 'call';
    let noAnswer = false;
    const date = h('input', { type: 'date', min: t, value: CRM.addDays(t, 3), required: true });
    const note = h('textarea', { rows: 2, placeholder: 'What happened? (optional)' });
    const typeChips = h('div', { class: 'chips' });
    const TYPES = [['call', 'Called', false], ['noanswer', 'No answer', true], ['sms', 'SMS', false], ['email', 'Email', false], ['followup_done', 'Other', false]];
    const drawTypes = () =>
      typeChips.replaceChildren(
        ...TYPES.map(([k, label, na]) =>
          h('button', { type: 'button', class: 'chip', 'aria-pressed': String((na ? noAnswer : !noAnswer && type === k)), onclick: () => { type = na ? 'call' : k; noAnswer = na; drawTypes(); } }, label)
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
      h('fieldset', null, h('legend', null, 'What did you do?'), typeChips),
      h('div', { class: 'field', dataset: { field: 'next_followup_at' } }, h('span', { class: 'field-label req' }, 'Next follow-up'), quickDates(date), date),
      CRM.field('Note', note),
      h('div', { class: 'btn-row' }, h('button', { type: 'submit', class: 'btn-primary' }, 'Save follow-up'), h('button', { type: 'button', onclick: () => panel.replaceChildren() }, 'Cancel'))
    );
    panel.replaceChildren(form);
    form.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  async function markSold(e, refresh) {
    if (!(await CRM.confirm('Mark as sold?', `Record ${e.customer_name} as sold today.`, 'Mark sold', 'btn-good'))) return;
    try {
      await CRM.patch(`/api/enquiries/${e.id}`, { outcome: 'sold' });
      CRM.toast('Marked as sold 🎉');
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
    const note = h('textarea', { rows: 2, placeholder: 'Any detail (optional)' });
    CRM.dialog({
      title: 'Mark as lost',
      body: h('div', { class: 'stack' }, h('div', { class: 'field' }, h('span', { class: 'field-label req' }, 'Why was it lost?'), chips), CRM.field('Comment', note)),
      actions: [
        { label: 'Cancel' },
        {
          label: 'Mark lost',
          class: 'btn-primary',
          onClick: async () => {
            if (!chosen) {
              CRM.toast('Choose a reason', 'error');
              return true;
            }
            await CRM.patch(`/api/enquiries/${e.id}`, { outcome: 'lost', lost_reason_id: chosen, comment: note.value });
            CRM.toast('Marked as lost');
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
      body: h('div', { class: 'stack' }, h('p', null, `This changes ${e.customer_name} from ${e.outcome} back to open.`), CRM.field('Next follow-up', date)),
      actions: [
        { label: 'Cancel' },
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
        { label: 'Cancel' },
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
        { label: 'Cancel' },
        { label: 'Mark invalid', class: 'btn-primary', onClick: async () => { await CRM.post(`/api/enquiries/${e.id}/invalid`, { reason: reason.value }); CRM.toast('Marked invalid'); await refresh(); } },
      ],
    });
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
      main.replaceChildren(h('div', { class: 'card' }, h('h1', null, 'No brands assigned'), h('p', null, "You haven't been assigned to any brand at any site yet. Ask your sales manager to set this up.")));
      return;
    }
    const locIds = [...new Set(creatable.map((f) => f.location_id))];
    const s = {
      location_id: existing?.location_id ?? (locIds.includes(me.home_location_id) ? me.home_location_id : locIds[0]),
      brand_id: existing?.brand_id ?? null,
      model_id: existing?.model_id ?? '',
      used_make_id: existing?.used_make_id ?? '',
      used_model: existing ? (existing.used_model_id ? `b:${existing.used_model_id}` : existing.used_extra_model_id ? `u:${existing.used_extra_model_id}` : existing.used_model_other ? 'other' : '') : '',
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
    const name = h('input', { id: 'f-name', autocomplete: 'off', autocapitalize: 'words', value: existing?.customer_name ?? '', maxLength: 100 });
    const postcode = h('input', { id: 'f-postcode', inputMode: 'numeric', pattern: '[0-9]*', maxLength: 4, autocomplete: 'off', value: existing?.postcode ?? '' });
    const phone = h('input', { id: 'f-phone', type: 'tel', inputMode: 'tel', autocomplete: 'off', value: existing?.phone_display ?? '' });
    const email = h('input', { id: 'f-email', type: 'email', inputMode: 'email', autocomplete: 'off', autocapitalize: 'none', value: existing?.email ?? '' });
    const stock = h('input', { id: 'f-stock', autocomplete: 'off', autocapitalize: 'characters', value: existing?.stock_number ?? '', maxLength: 20 });
    const usedOther = h('input', { id: 'f-used-other', maxLength: 60, placeholder: 'e.g. Pajero (1998)', value: existing?.used_model_other ?? '' });
    const followup = h('input', { id: 'f-follow', type: 'date', min: t, value: existing?.next_followup_at ?? CRM.addDays(t, 1) });
    const comment = h('textarea', { id: 'f-comment', rows: 3, placeholder: existing ? 'Add a comment (optional)' : 'What are they after? Budget, timing, trade details… (optional)' });
    const source = CRM.select(
      ref.sources.filter((x) => x.active || x.id === existing?.source_id).map((x) => ({ value: x.id, label: x.label })),
      existing?.source_id ?? ref.sources.find((x) => x.active)?.id,
      { id: 'f-source' }
    );
    const entryDate = h('input', { id: 'f-entry', type: 'date', max: t, value: existing?.entry_date ?? t });
    const salespersonSel = h('select', { id: 'f-sp' });

    const siteField = h('div');
    const brandField = h('div', { class: 'field', dataset: { field: 'brand_id' } });
    const vehicleField = h('div');
    const outcomeField = h('div');
    const spField = h('div');
    const dupBox = h('div');

    function drawSite() {
      if (locIds.length <= 1) {
        siteField.replaceChildren();
        return;
      }
      siteField.replaceChildren(
        h(
          'div',
          { class: 'field', dataset: { field: 'location_id' } },
          h('span', { class: 'field-label req' }, 'Site'),
          h(
            'div',
            { class: 'chips' },
            locIds.map((id) =>
              h('button', { type: 'button', class: 'chip', 'aria-pressed': String(Number(s.location_id) === id), onclick: () => { s.location_id = id; const b = brandsAt(id); s.brand_id = b.some((x) => x.id === s.brand_id) ? s.brand_id : b.length === 1 ? b[0].id : null; drawSite(); drawBrands(); drawVehicle(); drawSalesperson(); } }, CRM.byId(ref.locations, id)?.name)
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
      if (!brand) {
        vehicleField.replaceChildren();
        return;
      }
      if (!brand.is_used) {
        const models = ref.models.filter((m) => m.brand_id === brand.id && (m.active || m.id === existing?.model_id));
        const sel = CRM.select([{ value: '', label: 'Choose model…' }, ...models.map((m) => ({ value: m.id, label: m.name }))], s.model_id, { id: 'f-model', onchange: (e) => (s.model_id = e.target.value) });
        vehicleField.replaceChildren(CRM.field('Model', sel, { name: 'model_id', required: true }));
        return;
      }
      const makes = ref.used_makes.filter((m) => m.active || m.id === existing?.used_make_id);
      const makeSel = CRM.select([{ value: '', label: 'Choose make…' }, ...makes.map((m) => ({ value: m.id, label: m.name }))], s.used_make_id, {
        id: 'f-make',
        onchange: (e) => { s.used_make_id = e.target.value; s.used_model = ''; drawVehicle(); },
      });
      const make = CRM.byId(ref.used_makes, s.used_make_id);
      const opts = [];
      if (make) {
        for (const m of ref.used_linked_models.filter((x) => make.brand_id && x.brand_id === make.brand_id && (x.active || `b:${x.id}` === s.used_model))) opts.push({ value: `b:${m.id}`, label: m.name });
        for (const m of ref.used_models.filter((x) => x.make_id === make.id && (x.active || `u:${x.id}` === s.used_model))) opts.push({ value: `u:${m.id}`, label: m.name });
        opts.sort((a, b) => a.label.localeCompare(b.label));
      }
      const modelSel = CRM.select([{ value: '', label: make ? 'Choose model…' : 'Choose a make first' }, ...opts, ...(make ? [{ value: 'other', label: 'Other (type it in)…' }] : [])], s.used_model, {
        id: 'f-used-model',
        disabled: !make,
        onchange: (e) => { s.used_model = e.target.value; drawVehicle(); },
      });
      vehicleField.replaceChildren(
        h(
          'div',
          { class: 'form-grid cols-3' },
          CRM.field('Make', makeSel, { name: 'used_make_id', required: true }),
          CRM.field('Model', modelSel, { name: 'used_model_id', required: true }),
          CRM.field('Stock number', stock, { name: 'stock_number', hint: 'Optional' })
        ),
        s.used_model === 'other' ? CRM.field('Model (other)', usedOther, { name: 'used_model_other', required: true }) : null
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
        s.outcome === 'open' ? h('div', { class: 'field', dataset: { field: 'next_followup_at' } }, h('span', { class: 'field-label req' }, 'Next follow-up'), quickDates(followup), followup) : null,
        s.outcome === 'lost'
          ? h(
              'div',
              { class: 'field', dataset: { field: 'lost_reason_id' } },
              h('span', { class: 'field-label req' }, 'Lost reason'),
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
      spField.replaceChildren(
        h(
          'div',
          { class: 'form-grid cols-2' },
          CRM.field('Salesperson', salespersonSel, { name: 'salesperson_id' }),
          CRM.field('Date of entry', entryDate, { name: 'entry_date', hint: 'Change only to back-date an enquiry' })
        )
      );
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
                  h('b', null, 'Possible duplicate: '),
                  matches.map((m, i) => [i ? '; ' : '', m.can_view ? h('a', { href: `#/enquiries/${m.id}` }, `#${m.id}`) : '', ` open ${m.brand} enquiry at ${m.location} with ${m.salesperson} (${CRM.fmtDate(m.entry_date)}, same ${m.match_on})`]),
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
        body.used_make_id = s.used_make_id || null;
        body.used_model_id = s.used_model.startsWith('b:') ? Number(s.used_model.slice(2)) : null;
        body.used_extra_model_id = s.used_model.startsWith('u:') ? Number(s.used_model.slice(2)) : null;
        body.used_model_other = s.used_model === 'other' ? usedOther.value : null;
        body.stock_number = stock.value;
      } else {
        body.model_id = s.model_id ? Number(s.model_id) : null;
      }
      if (s.outcome === 'open') body.next_followup_at = followup.value;
      if (s.outcome === 'lost') body.lost_reason_id = s.lost_reason_id;
      if (CRM.isManager()) {
        body.salesperson_id = Number(salespersonSel.value) || undefined;
        body.entry_date = entryDate.value;
      }
      try {
        const res = existing ? await CRM.patch(`/api/enquiries/${existing.id}`, body) : await CRM.post('/api/enquiries', body);
        CRM.toast(existing ? 'Saved' : `Walk-in saved (#${res.enquiry.id})`);
        main.dataset.keep = '0';
        listState.key = '';
        CRM.go(existing ? `#/enquiries/${res.enquiry.id}` : '#/today');
      } catch (err) {
        if (err.silent) return;
        CRM.showError(form, err);
      } finally {
        btn.disabled = false;
      }
    });

    form.append(
      h('div', { class: 'card stack' }, h('h2', null, 'Vehicle'), siteField, brandField, vehicleField),
      h(
        'div',
        { class: 'card stack' },
        h('h2', null, 'Customer'),
        h('div', { class: 'form-grid cols-2' }, CRM.field('Customer name', name, { name: 'customer_name', required: true }), CRM.field('Postcode', postcode, { name: 'postcode', required: true })),
        h('div', { class: 'form-grid cols-2' }, CRM.field('Phone', phone, { name: 'phone', hint: 'Phone or email required' }), CRM.field('Email', email, { name: 'email' })),
        dupBox
      ),
      h(
        'div',
        { class: 'card stack' },
        h('h2', null, 'The visit'),
        h('div', { class: 'toggles' }, toggle('test_drive', 'Test drive'), toggle('trade_in', 'Trade-in'), toggle('finance', 'Finance')),
        CRM.field('Source', source, { name: 'source_id' }),
        outcomeField,
        spField,
        CRM.field(existing ? 'Add a comment' : 'Comments', comment, { name: 'comment' })
      ),
      h(
        'div',
        { class: 'form-actions' },
        h('button', { type: 'submit', class: 'btn-primary btn-big', style: { flex: '1' } }, existing ? 'Save changes' : 'Save walk-in'),
        h('a', { class: 'btn btn-big', href: existing ? `#/enquiries/${existing.id}` : '#/today' }, 'Cancel')
      )
    );

    drawSite();
    drawBrands();
    drawVehicle();
    drawOutcome();
    drawSalesperson();
    main.replaceChildren(
      h('div', { style: { maxWidth: '780px' } }, h('div', { class: 'page-head' }, h('div', null, h('h1', null, existing ? `Edit ${existing.customer_name}` : 'New walk-in'), h('p', { class: 'muted' }, existing ? `Enquiry #${existing.id}` : 'Fields marked * are required. Everything else is optional.'))), form)
    );
    if (!existing) (s.brand_id ? name : brandField.querySelector('button'))?.focus();
  }
})();
