// Team (users), Admin (branding, sites & brands, models, used cars, lists, settings & email,
// backups, import, audit log) and Account screens.
(function () {
  const CRM = window.CRM;
  const { h } = CRM;

  // ======================= Team =======================
  CRM.route(/^\/team$/, async (main) => {
    if (!CRM.isManager()) return CRM.go('#/today');
    const [{ users, assignable_roles: roles, can_grant_admin: canAdmin }, ref] = await Promise.all([CRM.get('/api/users'), CRM.loadRef(true)]);
    const me = CRM.state.me;
    const managers = users.filter((u) => u.role !== 'salesperson');
    const sales = users.filter((u) => u.role === 'salesperson');

    const scopeText = (u) => {
      if (u.full_access) return 'All brands, all sites';
      if (!u.franchises.length) return 'No brands assigned';
      const bySite = new Map();
      for (const f of u.franchises) bySite.set(f.location, [...(bySite.get(f.location) || []), f.brand]);
      return [...bySite].map(([site, brands]) => `${site}: ${brands.join(', ')}`).join(' · ');
    };

    const table = (list) =>
      h(
        'div',
        { class: 'table-wrap' },
        h(
          'table',
          { class: 'data' },
          h('thead', null, h('tr', null, ['Name', 'Role', 'Brands & sites', 'Last sign-in', ''].map((x) => h('th', null, x)))),
          h(
            'tbody',
            null,
            list.map((u) =>
              h(
                'tr',
                { class: u.can_manage ? 'clickable' : '', onclick: u.can_manage ? () => editUser(u) : null, style: { opacity: u.active ? 1 : 0.55 } },
                h('td', null, h('b', null, u.name), h('div', { class: 'muted small' }, u.username, u.email ? ` · ${u.email}` : '')),
                h('td', null, CRM.ROLE[u.role], u.is_admin ? ' · Admin' : '', !u.active ? h('div', null, h('span', { class: 'badge badge-lost' }, 'Disabled')) : null),
                h('td', { class: 'small' }, scopeText(u)),
                h('td', { class: 'small' }, u.last_login_at ? CRM.fmtDateTime(u.last_login_at) : 'Never'),
                h('td', null, u.can_manage ? h('button', { class: 'btn-sm', onclick: (e) => { e.stopPropagation(); editUser(u); } }, 'Edit') : h('span', { class: 'muted small' }, u.id === me.id ? 'You' : ''))
              )
            )
          )
        )
      );

    main.replaceChildren(
      h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Team'), h('p', { class: 'muted small' }, CRM.isFull() ? 'Add and remove sales managers and salespeople, and choose which brands at which sites they work on.' : 'Add and manage salespeople in your brands and sites.')), h('button', { class: 'btn-accent', onclick: () => editUser(null) }, '+ Add person')),
      managers.length ? h('section', { class: 'card' }, h('h2', null, `Managers (${managers.length})`), table(managers)) : null,
      h('section', { class: 'card' }, h('h2', null, `Salespeople (${sales.length})`), sales.length ? table(sales) : h('p', { class: 'empty' }, 'No salespeople yet.'))
    );

    function franchisePicker(selected) {
      const chosen = new Set(selected);
      const sites = ref.locations.map((l) => ({ l, fs: ref.franchises.filter((f) => f.location_id === l.id && (f.can_create || chosen.has(f.id))) })).filter((x) => x.fs.length);
      const wrap = h('div', { class: 'franchise-picker' });
      const draw = () =>
        wrap.replaceChildren(
          ...sites.map(({ l, fs }) => {
            const all = fs.every((f) => chosen.has(f.id));
            return h(
              'div',
              { class: 'site' },
              h('div', { class: 'site-head' }, h('b', null, l.name), h('button', { type: 'button', class: 'btn-sm btn-ghost', onclick: () => { fs.forEach((f) => (all ? chosen.delete(f.id) : chosen.add(f.id))); draw(); } }, all ? 'Clear site' : 'Whole site')),
              h(
                'div',
                { class: 'brands' },
                fs.map((f) =>
                  h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: chosen.has(f.id), onchange: (e) => { e.target.checked ? chosen.add(f.id) : chosen.delete(f.id); draw(); } }), CRM.byId(ref.brands, f.brand_id)?.name)
                )
              )
            );
          })
        );
      draw();
      wrap.getValue = () => [...chosen];
      return wrap;
    }

    function editUser(u) {
      const isNew = !u;
      const name = h('input', { value: u?.name ?? '', maxLength: 100 });
      const username = h('input', { value: u?.username ?? '', autocapitalize: 'none', spellcheck: false, disabled: !isNew });
      const email = h('input', { type: 'email', value: u?.email ?? '' });
      const role = CRM.select(roles.map((r) => ({ value: r, label: CRM.ROLE[r] })), u?.role ?? 'salesperson');
      const admin = h('input', { type: 'checkbox', checked: !!u?.is_admin });
      const home = CRM.select([{ value: '', label: '—' }, ...ref.locations.map((l) => ({ value: l.id, label: l.name }))], u?.home_location_id ?? '');
      const picker = franchisePicker(u ? u.franchises.map((f) => f.id) : []);
      const pickerField = h('div', { class: 'field', dataset: { field: 'franchise_ids' } }, h('span', { class: 'field-label' }, 'Brands and sites they work on'), picker);
      const syncRole = () => (pickerField.hidden = role.value === 'general_manager');
      role.addEventListener('change', syncRole);
      syncRole();

      const body = h(
        'div',
        { class: 'stack' },
        h('div', { class: 'form-grid cols-2' }, CRM.field('Full name', name, { name: 'name', required: true }), CRM.field('Username', username, { name: 'username', required: true, hint: isNew ? 'Used to sign in, e.g. sam.smith' : 'Cannot be changed' })),
        h('div', { class: 'form-grid cols-2' }, CRM.field('Email', email, { name: 'email', hint: 'For reminders; can also sign in with it' }), CRM.field('Home site', home, { name: 'home_location_id' })),
        roles.length > 1 ? CRM.field('Role', role, { name: 'role' }) : null,
        canAdmin ? h('label', { class: 'check' }, admin, 'Admin (can manage backups and other admins)') : null,
        pickerField
      );

      const actions = [{ label: 'Cancel' }];
      if (!isNew) {
        actions.push(
          { label: 'Reset password', onClick: async () => { const r = await CRM.post(`/api/users/${u.id}/reset-password`); showTemp(u.name, r.temporary_password); } },
          { label: 'Move open enquiries', onClick: () => { moveOpen(u); return true; } },
          {
            label: u.active ? 'Disable' : 'Enable',
            class: u.active ? 'btn-danger' : '',
            onClick: async () => {
              if (u.active && !(await CRM.confirm(`Disable ${u.name}?`, 'They will be signed out and can no longer sign in. Their enquiries are kept. Use "Move open enquiries" to hand them to someone else.', 'Disable', 'btn-danger'))) return;
              await CRM.patch(`/api/users/${u.id}`, { active: !u.active });
              CRM.toast(u.active ? 'Disabled' : 'Enabled');
              CRM.render();
            },
          }
        );
      }
      actions.push({
        label: isNew ? 'Add person' : 'Save',
        class: 'btn-primary',
        onClick: async () => {
          const payload = { name: name.value, email: email.value, home_location_id: home.value || null, franchise_ids: role.value === 'general_manager' ? [] : picker.getValue() };
          if (roles.length > 1) payload.role = role.value;
          if (canAdmin) payload.is_admin = admin.checked;
          try {
            if (isNew) {
              const r = await CRM.post('/api/users', { ...payload, username: username.value });
              await CRM.loadRef(true);
              showTemp(r.user.name, r.temporary_password, r.user.username);
            } else {
              await CRM.patch(`/api/users/${u.id}`, payload);
              await CRM.loadRef(true);
              CRM.toast('Saved');
              CRM.render();
            }
          } catch (err) {
            CRM.showError(body, err);
            return true;
          }
        },
      });
      CRM.dialog({ title: isNew ? 'Add a person' : `Edit ${u.name}`, body, actions, wide: true });
    }

    function showTemp(name, password, uname) {
      CRM.dialog({
        title: 'Temporary password',
        body: h(
          'div',
          { class: 'stack' },
          h('p', null, `Give ${name} this temporary password${uname ? ` and their username "${uname}"` : ''}. They'll be asked to choose their own the first time they sign in. It won't be shown again.`),
          h('div', { class: 'temp-password' }, password)
        ),
        actions: [{ label: 'Done', class: 'btn-primary', onClick: () => CRM.render() }],
      });
    }

    function moveOpen(u) {
      const others = users.filter((x) => x.id !== u.id && x.active);
      const sel = CRM.select(others.map((x) => ({ value: x.id, label: `${x.name} (${CRM.ROLE[x.role]})` })), '');
      CRM.dialog({
        title: `Move ${u.name}'s open enquiries`,
        body: h('div', { class: 'stack' }, h('p', { class: 'muted' }, 'Only enquiries in brands/sites the new person covers are moved. You will see how many could not be moved.'), CRM.field('Move to', sel)),
        actions: [
          { label: 'Cancel' },
          { label: 'Move', class: 'btn-primary', onClick: async () => { const r = await CRM.post(`/api/users/${u.id}/reassign-open`, { to_user_id: Number(sel.value) }); CRM.toast(`Moved ${r.moved}${r.not_moved ? `; ${r.not_moved} not moved (different brand/site)` : ''}`); } },
        ],
      });
    }
  });

  // ======================= Admin =======================
  const SECTIONS = [
    ['branding', 'Branding'],
    ['sites', 'Sites & brands'],
    ['models', 'Models'],
    ['used', 'Used car makes'],
    ['lists', 'Lists'],
    ['settings', 'Email & settings'],
    ['backups', 'Backups'],
    ['import', 'Import spreadsheet'],
    ['audit', 'Audit log'],
  ];

  CRM.route(/^\/admin(?:\/(\w+))?$/, async (main, [section = 'branding']) => {
    if (!CRM.isFull()) return CRM.go('#/today');
    const body = h('div', null, h('div', { class: 'loading' }, 'Loading…'));
    main.replaceChildren(
      h('div', { class: 'page-head' }, h('h1', null, 'Admin')),
      h('nav', { class: 'tabs', 'aria-label': 'Admin sections' }, SECTIONS.map(([k, l]) => h('a', { href: `#/admin/${k}`, class: k === section ? 'active' : '', 'aria-current': k === section ? 'page' : null }, l))),
      body
    );
    const fn = ADMIN[section];
    if (!fn) return CRM.go('#/admin/branding');
    await fn(body);
  });

  const ADMIN = {};
  const reload = () => CRM.render();

  // ---- Branding ----
  ADMIN.branding = async (el) => {
    const { settings } = await CRM.get('/api/admin/settings');
    const name = h('input', { value: settings['branding.name'], maxLength: 60 });
    const primary = h('input', { type: 'color', value: settings['branding.primary_colour'] });
    const accent = h('input', { type: 'color', value: settings['branding.accent_colour'] });
    const preview = () => {
      document.documentElement.style.setProperty('--primary', primary.value);
      document.documentElement.style.setProperty('--accent', accent.value);
    };
    primary.addEventListener('input', preview);
    accent.addEventListener('input', preview);
    const logo = settings['branding.logo_url'];
    const file = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/svg+xml' });
    const form = h(
      'form',
      {
        class: 'card stack',
        onsubmit: async (e) => {
          e.preventDefault();
          try {
            await CRM.put('/api/admin/settings', { 'branding.name': name.value, 'branding.primary_colour': primary.value, 'branding.accent_colour': accent.value });
            CRM.toast('Branding saved');
            await CRM.applyBranding();
          } catch (err) {
            CRM.showError(form, err);
          }
        },
      },
      h('h2', null, 'Name and colours'),
      CRM.field('Dealership name', name, { name: 'name' }),
      h('div', { class: 'btn-row' }, CRM.field('Main colour', primary, { name: 'primary_colour' }), CRM.field('Accent colour', accent, { name: 'accent_colour' })),
      h('p', { class: 'muted small' }, 'Colours preview straight away. Pick a main colour dark enough for white text on top.'),
      h('div', null, h('button', { type: 'submit', class: 'btn-primary' }, 'Save'))
    );
    const logoCard = h(
      'div',
      { class: 'card stack' },
      h('h2', null, 'Logo'),
      logo ? h('img', { class: 'logo-preview', src: logo, alt: 'Current logo' }) : h('p', { class: 'muted' }, 'No logo uploaded. The first letter of the name is shown instead.'),
      CRM.field('Upload a logo', file, { hint: 'PNG, JPG, WebP or SVG, under 300 KB. A wide logo on a white or transparent background works best.' }),
      h(
        'div',
        { class: 'btn-row' },
        h('button', {
          class: 'btn-primary',
          onclick: async () => {
            const f = file.files[0];
            if (!f) return CRM.toast('Choose a file first', 'error');
            if (f.size > 300_000) return CRM.toast('That image is over 300 KB', 'error');
            const dataUrl = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(f); });
            try {
              await CRM.put('/api/admin/logo', { data_url: dataUrl });
              CRM.toast('Logo uploaded');
              await CRM.applyBranding();
              reload();
            } catch (err) {
              CRM.fail(err);
            }
          },
        }, 'Upload'),
        logo ? h('button', { onclick: async () => { await CRM.put('/api/admin/logo', { data_url: '' }); await CRM.applyBranding(); reload(); } }, 'Remove logo') : null
      )
    );
    el.replaceChildren(h('div', { class: 'grid-2' }, form, logoCard));
  };

  // ---- Sites & brands ----
  ADMIN.sites = async (el) => {
    const ref = await CRM.loadRef(true);
    const fr = (l, b) => ref.franchises.find((f) => f.location_id === l.id && f.brand_id === b.id);
    const grid = h(
      'div',
      { class: 'table-wrap' },
      h(
        'table',
        { class: 'data grid-table' },
        h('thead', null, h('tr', null, h('th', null, 'Brand'), ref.locations.map((l) => h('th', { class: 'center' }, l.name, !l.active ? ' (off)' : '')), h('th', null, ''))),
        h(
          'tbody',
          null,
          ref.brands.map((b) =>
            h(
              'tr',
              { style: { opacity: b.active ? 1 : 0.55 } },
              h('td', null, h('span', { class: 'swatch', style: { background: b.colour } }), ' ', h('b', null, b.name), b.is_used ? h('span', { class: 'muted small' }, ' (used cars)') : null),
              ref.locations.map((l) => {
                const f = fr(l, b);
                return h(
                  'td',
                  { class: 'center' },
                  h('input', {
                    type: 'checkbox',
                    'aria-label': `${b.name} at ${l.name}`,
                    checked: !!(f && f.active),
                    onchange: async (e) => {
                      try {
                        await CRM.put('/api/admin/franchises', { location_id: l.id, brand_id: b.id, active: e.target.checked });
                        CRM.toast(`${b.name} ${e.target.checked ? 'on' : 'off'} at ${l.name}`);
                        await CRM.loadRef(true);
                      } catch (err) {
                        e.target.checked = !e.target.checked;
                        CRM.fail(err);
                      }
                    },
                  })
                );
              }),
              h('td', null, h('button', { class: 'btn-sm', onclick: () => editBrand(b) }, 'Edit'))
            )
          )
        )
      )
    );

    function editBrand(b) {
      const name = h('input', { value: b?.name ?? '', maxLength: 60 });
      const colour = h('input', { type: 'color', value: b?.colour ?? '#5A6270' });
      const isUsed = h('input', { type: 'checkbox' });
      const locs = ref.locations.map((l) => ({ l, cb: h('input', { type: 'checkbox' }) }));
      const body = h(
        'div',
        { class: 'stack' },
        CRM.field('Brand name', name, { name: 'name', required: true }),
        CRM.field('Colour', colour, { name: 'colour', hint: 'Used for badges' }),
        b ? null : h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Sold at'), h('div', { class: 'brands btn-row' }, locs.map(({ l, cb }) => h('label', { class: 'check' }, cb, l.name)))),
        b ? null : h('label', { class: 'check' }, isUsed, 'This is a used-car department (make/model/stock number instead of a model list)')
      );
      const actions = [{ label: 'Cancel' }];
      if (b) actions.push({ label: b.active ? 'Switch off brand' : 'Switch brand back on', class: b.active ? 'btn-danger' : '', onClick: async () => { await CRM.patch(`/api/admin/brands/${b.id}`, { active: !b.active }); CRM.toast('Saved'); reload(); } });
      actions.push({
        label: b ? 'Save' : 'Add brand',
        class: 'btn-primary',
        onClick: async () => {
          try {
            if (b) await CRM.patch(`/api/admin/brands/${b.id}`, { name: name.value, colour: colour.value });
            else await CRM.post('/api/admin/brands', { name: name.value, colour: colour.value, is_used: isUsed.checked, location_ids: locs.filter((x) => x.cb.checked).map((x) => x.l.id) });
            CRM.toast('Saved');
            reload();
          } catch (err) {
            CRM.showError(body, err);
            return true;
          }
        },
      });
      CRM.dialog({ title: b ? `Edit ${b.name}` : 'Add a brand', body, actions });
    }

    el.replaceChildren(
      h(
        'section',
        { class: 'card' },
        h('div', { class: 'card-head' }, h('h2', null, 'Which brands each site sells'), h('button', { class: 'btn-accent', onclick: () => editBrand(null) }, '+ Add brand')),
        h('p', { class: 'muted small' }, 'Tick to sell a brand at a site. Unticking hides it from new enquiries; past enquiries and reports are kept. Then add the brand’s models under Models.'),
        grid
      ),
      h('section', { class: 'card' }, h('h2', null, 'Sites'), editableList(ref.locations.map((l) => ({ ...l, label: l.name })), {
        add: (v) => CRM.post('/api/admin/locations', { name: v }),
        rename: (item, v) => CRM.patch(`/api/admin/locations/${item.id}`, { name: v }),
        toggle: (item) => CRM.patch(`/api/admin/locations/${item.id}`, { active: !item.active }),
        placeholder: 'New site name',
      }))
    );
  };

  // Reusable list with rename / on-off / reorder / add.
  function editableList(items, { add, rename, toggle, reorder, placeholder }) {
    const ul = h('ul', { class: 'list-edit' });
    const order = items.map((i) => i.id);
    items.forEach((item, idx) => {
      const input = h('input', { value: item.label, 'aria-label': 'Name', maxLength: 60 });
      const save = h('button', { class: 'btn-sm', hidden: true, onclick: async () => { try { await rename(item, input.value); CRM.toast('Renamed'); reload(); } catch (e) { CRM.fail(e); } } }, 'Save');
      input.addEventListener('input', () => (save.hidden = input.value === item.label));
      ul.append(
        h(
          'li',
          { class: item.active ? '' : 'inactive' },
          reorder ? h('button', { class: 'btn-sm btn-ghost', 'aria-label': 'Move up', disabled: idx === 0, onclick: async () => { [order[idx - 1], order[idx]] = [order[idx], order[idx - 1]]; await reorder(order); reload(); } }, '↑') : null,
          reorder ? h('button', { class: 'btn-sm btn-ghost', 'aria-label': 'Move down', disabled: idx === items.length - 1, onclick: async () => { [order[idx + 1], order[idx]] = [order[idx], order[idx + 1]]; await reorder(order); reload(); } }, '↓') : null,
          h('div', { class: 'grow' }, input),
          save,
          h('button', { class: ['btn-sm', item.active ? 'btn-ghost' : ''], onclick: async () => { try { await toggle(item); reload(); } catch (e) { CRM.fail(e); } } }, item.active ? 'Retire' : 'Restore')
        )
      );
    });
    const newInput = h('input', { placeholder: placeholder || 'Add new…', maxLength: 60 });
    const addForm = h(
      'form',
      { class: 'add-row', onsubmit: async (e) => { e.preventDefault(); if (!newInput.value.trim()) return; try { await add(newInput.value); CRM.toast('Added'); reload(); } catch (err) { CRM.fail(err); } } },
      newInput,
      h('button', { type: 'submit', class: 'btn-primary' }, 'Add')
    );
    return h('div', null, items.length ? ul : h('p', { class: 'muted' }, 'Nothing here yet.'), addForm, h('p', { class: 'muted small', style: { marginTop: '8px' } }, 'Retired items are hidden from new enquiries but stay on old ones and in reports.'));
  }

  // ---- Models ----
  let modelBrand = null;
  ADMIN.models = async (el) => {
    const ref = await CRM.loadRef(true);
    const brands = ref.brands.filter((b) => !b.is_used);
    modelBrand = modelBrand && brands.some((b) => b.id === modelBrand) ? modelBrand : brands[0]?.id;
    const { models } = await CRM.get(`/api/admin/models?brand_id=${modelBrand}`);
    const sel = CRM.select(brands.map((b) => ({ value: b.id, label: b.name + (b.active ? '' : ' (off)') })), modelBrand, { onchange: (e) => { modelBrand = Number(e.target.value); reload(); }, 'aria-label': 'Brand' });
    el.replaceChildren(
      h(
        'section',
        { class: 'card' },
        h('div', { class: 'card-head' }, h('h2', null, 'Models'), h('div', { style: { minWidth: '220px' } }, sel)),
        h('p', { class: 'muted small' }, 'These are the only models salespeople can pick for this brand. The list is shared by every site that sells the brand. Use the arrows to put the most popular first.'),
        editableList(models.map((m) => ({ ...m, label: m.name })), {
          add: (v) => CRM.post('/api/admin/models', { brand_id: modelBrand, name: v }),
          rename: (m, v) => CRM.patch(`/api/admin/models/${m.id}`, { name: v }),
          toggle: (m) => CRM.patch(`/api/admin/models/${m.id}`, { active: !m.active }),
          reorder: (ids) => CRM.post('/api/admin/models/reorder', { brand_id: modelBrand, ids }),
          placeholder: 'New model name',
        })
      )
    );
  };

  // ---- Used car makes ----
  let usedMake = null;
  ADMIN.used = async (el) => {
    const ref = await CRM.loadRef(true);
    const makes = ref.used_makes;
    usedMake = usedMake && makes.some((m) => m.id === usedMake) ? usedMake : makes[0]?.id;
    const make = CRM.byId(makes, usedMake);
    const linked = make?.brand_id ? ref.used_linked_models.filter((m) => m.brand_id === make.brand_id) : [];
    const extra = ref.used_models.filter((m) => m.make_id === usedMake);
    const sel = CRM.select(makes.map((m) => ({ value: m.id, label: m.name + (m.active ? '' : ' (retired)') })), usedMake, { onchange: (e) => { usedMake = Number(e.target.value); reload(); }, 'aria-label': 'Make' });
    const linkSel = CRM.select([{ value: '', label: 'Not linked' }, ...ref.brands.filter((b) => !b.is_used).map((b) => ({ value: b.id, label: b.name }))], make?.brand_id ?? '', {
      onchange: async (e) => { await CRM.patch(`/api/admin/used-makes/${usedMake}`, { brand_id: e.target.value ? Number(e.target.value) : null }); CRM.toast('Saved'); reload(); },
    });
    el.replaceChildren(
      h(
        'div',
        { class: 'grid-2' },
        h('section', { class: 'card' }, h('h2', null, 'Makes'), editableList(makes.map((m) => ({ ...m, label: m.name })), {
          add: (v) => CRM.post('/api/admin/used-makes', { name: v }),
          rename: (m, v) => CRM.patch(`/api/admin/used-makes/${m.id}`, { name: v }),
          toggle: (m) => CRM.patch(`/api/admin/used-makes/${m.id}`, { active: !m.active }),
          placeholder: 'New make',
        })),
        make
          ? h(
              'section',
              { class: 'card stack' },
              h('div', { class: 'card-head' }, h('h2', null, 'Models for'), h('div', { style: { minWidth: '200px' } }, sel)),
              CRM.field('Also use the new-car model list from', linkSel, { hint: 'For makes Sunco also sells new, so the model names match.' }),
              linked.length ? h('p', { class: 'muted small' }, `From the ${CRM.byId(ref.brands, make.brand_id)?.name} model list: ${linked.map((m) => m.name).join(', ')}`) : null,
              h('h3', null, 'Extra used-only models'),
              editableList(extra.map((m) => ({ ...m, label: m.name })), {
                add: (v) => CRM.post('/api/admin/used-models', { make_id: usedMake, name: v }),
                rename: (m, v) => CRM.patch(`/api/admin/used-models/${m.id}`, { name: v }),
                toggle: (m) => CRM.patch(`/api/admin/used-models/${m.id}`, { active: !m.active }),
                placeholder: 'e.g. older model names',
              })
            )
          : null
      )
    );
  };

  // ---- Lists ----
  ADMIN.lists = async (el) => {
    const ref = await CRM.loadRef(true);
    const block = (title, type, items, hint) =>
      h('section', { class: 'card' }, h('h2', null, title), h('p', { class: 'muted small' }, hint), editableList(items.map((i) => ({ ...i })), {
        add: (v) => CRM.post('/api/admin/lookups', { list_type: type, label: v }),
        rename: (i, v) => CRM.patch(`/api/admin/lookups/${i.id}`, { label: v }),
        toggle: (i) => CRM.patch(`/api/admin/lookups/${i.id}`, { active: !i.active }),
        reorder: (ids) => CRM.post('/api/admin/lookups/reorder', { list_type: type, ids }),
      }));
    el.replaceChildren(
      h('div', { class: 'grid-2' }, block('Lost reasons', 'lost_reason', ref.lost_reasons, 'Salespeople must pick one of these when an enquiry is lost.'), block('Sources', 'source', ref.sources, 'Where the customer came from. The first one is the default.'))
    );
  };

  // ---- Settings & email ----
  ADMIN.settings = async (el) => {
    const { settings: s, smtp_password_set: pwSet, backup_passphrase_set: ppSet } = await CRM.get('/api/admin/settings');
    const inp = (key, attrs = {}) => h('input', { value: s[key] ?? '', ...attrs });
    const f = {
      'followup.escalation_days': inp('followup.escalation_days', { type: 'number', min: 1, max: 60 }),
      'followup.stale_days': inp('followup.stale_days', { type: 'number', min: 7, max: 365 }),
      'email.enabled': h('input', { type: 'checkbox', checked: s['email.enabled'] === '1' }),
      'email.smtp_host': inp('email.smtp_host', { placeholder: 'e.g. smtp.office365.com' }),
      'email.smtp_port': inp('email.smtp_port', { type: 'number' }),
      'email.smtp_secure': h('input', { type: 'checkbox', checked: s['email.smtp_secure'] === '1' }),
      'email.smtp_user': inp('email.smtp_user', { autocomplete: 'off' }),
      'email.smtp_password': h('input', { type: 'password', autocomplete: 'new-password', placeholder: pwSet ? '•••••••• (saved, leave blank to keep)' : '' }),
      'email.from': inp('email.from', { placeholder: 'e.g. Sunco CRM <crm@suncomotors.com.au>' }),
      'email.app_url': inp('email.app_url', { placeholder: 'e.g. https://crm.suncomotors.com.au' }),
      'email.morning_time': inp('email.morning_time', { type: 'time' }),
      'email.eod_time': inp('email.eod_time', { type: 'time' }),
      'backup.time': inp('backup.time', { type: 'time' }),
      'backup.keep_daily': inp('backup.keep_daily', { type: 'number', min: 7 }),
      'backup.keep_monthly': inp('backup.keep_monthly', { type: 'number', min: 0 }),
      'backup.email_enabled': h('input', { type: 'checkbox', checked: s['backup.email_enabled'] === '1' }),
      'backup.email_to': inp('backup.email_to', { placeholder: 'Leave blank to send to all admins' }),
      'backup.email_passphrase': h('input', { type: 'password', autocomplete: 'new-password', placeholder: ppSet ? '•••••••• (saved, leave blank to keep)' : 'At least 12 characters' }),
    };
    const form = h(
      'form',
      {
        class: 'stack',
        onsubmit: async (e) => {
          e.preventDefault();
          const payload = {};
          for (const [k, input] of Object.entries(f)) payload[k] = input.type === 'checkbox' ? input.checked : input.value;
          try {
            await CRM.put('/api/admin/settings', payload);
            CRM.toast('Settings saved');
            reload();
          } catch (err) {
            CRM.showError(form, err);
          }
        },
      },
      h(
        'section',
        { class: 'card stack' },
        h('h2', null, 'Follow-ups'),
        h('div', { class: 'form-grid cols-2' }, CRM.field('Escalate to manager when overdue by (days)', f['followup.escalation_days'], { name: 'escalation_days' }), CRM.field('Flag as stale after no activity for (days)', f['followup.stale_days'], { name: 'stale_days' }))
      ),
      h(
        'section',
        { class: 'card stack' },
        h('h2', null, 'Email reminders'),
        h('p', { class: 'muted small' }, 'Use the dealership’s email account details (from your IT provider or email host). Nothing is sent until this is switched on.'),
        h('label', { class: 'check' }, f['email.enabled'], 'Send email reminders'),
        h('div', { class: 'form-grid cols-2' }, CRM.field('SMTP server', f['email.smtp_host'], { name: 'smtp_host' }), CRM.field('Port', f['email.smtp_port'], { name: 'smtp_port', hint: 'Usually 587, or 465 with SSL ticked' })),
        h('label', { class: 'check' }, f['email.smtp_secure'], 'Use SSL (port 465)'),
        h('div', { class: 'form-grid cols-2' }, CRM.field('Username', f['email.smtp_user'], { name: 'smtp_user' }), CRM.field('Password', f['email.smtp_password'], { name: 'smtp_password' })),
        h('div', { class: 'form-grid cols-2' }, CRM.field('Send from', f['email.from'], { name: 'from' }), CRM.field('CRM web address (for links)', f['email.app_url'], { name: 'app_url' })),
        h('div', { class: 'form-grid cols-2' }, CRM.field('Morning reminders at', f['email.morning_time'], { name: 'morning_time', hint: 'Follow-ups due (salespeople); overdue + yesterday (managers)' }), CRM.field('End-of-day summary at', f['email.eod_time'], { name: 'eod_time', hint: 'To sales managers and the GM' }))
      ),
      h(
        'section',
        { class: 'card stack' },
        h('h2', null, 'Nightly backup'),
        h('div', { class: 'form-grid cols-3' }, CRM.field('Run at', f['backup.time'], { name: 'backup_time' }), CRM.field('Keep daily copies', f['backup.keep_daily'], { name: 'keep_daily' }), CRM.field('Keep monthly copies', f['backup.keep_monthly'], { name: 'keep_monthly' })),
        h('div', { class: 'callout' }, CRM.icon('shield'), h('p', { class: 'small' }, 'Email the nightly backup off-site, so the CRM can be rebuilt even if the server is lost. The attachment is encrypted with the passphrase below and can be uploaded straight back in under Admin → Backups. ', h('b', null, 'Write the passphrase down and keep it somewhere safe. Without it the backup cannot be opened.'))),
        h('label', { class: 'check' }, f['backup.email_enabled'], 'Email the backup every night'),
        h('div', { class: 'form-grid cols-2' }, CRM.field('Send backups to', f['backup.email_to'], { name: 'backup_email_to', hint: 'One or more addresses, comma-separated. Use an address that is NOT on the same server.' }), CRM.field('Backup passphrase', f['backup.email_passphrase'], { name: 'backup_email_passphrase', hint: 'Needed to restore an emailed backup' }))
      ),
      h('div', { class: 'btn-row' }, h('button', { type: 'submit', class: 'btn-primary' }, 'Save settings'))
    );
    const testTo = h('input', { type: 'email', value: CRM.state.me.email || '', placeholder: 'you@example.com' });
    const tools = h(
      'section',
      { class: 'card stack' },
      h('h2', null, 'Test email'),
      h('p', { class: 'muted small' }, 'Save the settings first, then send a test.'),
      h('div', { class: 'add-row' }, testTo, h('button', { onclick: async (e) => { e.target.disabled = true; try { await CRM.post('/api/admin/email/test', { to: testTo.value }); CRM.toast('Test email sent'); } catch (err) { CRM.fail(err); } finally { e.target.disabled = false; } } }, 'Send test')),
      h('div', { class: 'btn-row' }, h('button', { onclick: async () => { try { const r = await CRM.post('/api/admin/email/send-now', { kind: 'morning' }); CRM.toast(r.skipped ? `Not sent: ${r.skipped}` : `Sent ${r.sent} morning emails`); } catch (err) { CRM.fail(err); } } }, 'Send morning reminders now'), h('button', { onclick: async () => { try { const r = await CRM.post('/api/admin/email/send-now', { kind: 'eod' }); CRM.toast(r.skipped ? `Not sent: ${r.skipped}` : `Sent ${r.sent} summaries`); } catch (err) { CRM.fail(err); } } }, 'Send end-of-day now'))
    );
    el.replaceChildren(h('div', { style: { maxWidth: '860px' } }, form, tools));
  };

  // ---- Backups ----
  ADMIN.backups = async (el) => {
    const data = await CRM.get('/api/admin/backups');
    const fmtSize = (n) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`);
    const last = data.last_nightly;
    const status = last
      ? h('p', null, h('span', { class: 'badge badge-sold' }, 'OK'), ` Last nightly backup ${CRM.fmtDate(last.date, { year: true })} at ${last.time} (${fmtSize(last.size)}).`)
      : h('p', null, h('span', { class: 'badge badge-due' }, 'Waiting'), ' No nightly backup yet. It runs at the time set under Email & settings.');
    const { settings: st } = await CRM.get('/api/admin/settings');
    const emailOn = st['backup.email_enabled'] === '1';
    const emailStatus = h(
      'div',
      { class: ['callout', emailOn ? 'good' : 'warn'] },
      CRM.icon('shield'),
      h('p', { class: 'small' }, emailOn ? `Nightly backups are emailed to ${st['backup.email_to'] || 'all admins'} as an encrypted file you can upload below to restore.` : 'Backups are only stored on this server. Turn on "Email the backup every night" under Email & settings so a copy is kept off-site in case the server fails.', ' ', h('a', { href: '#/admin/settings' }, 'Settings'))
    );
    const emailNow = async (name) => {
      try {
        const r = await CRM.post(`/api/admin/backups/${encodeURIComponent(name)}/email`, {});
        CRM.toast(`Backup emailed to ${r.sent} recipient${r.sent === 1 ? '' : 's'}`);
      } catch (e) {
        CRM.fail(e);
      }
    };
    const restore = async (name) => {
      if (!CRM.isAdmin()) return CRM.toast('Only an admin can restore', 'error');
      const typed = h('input', { placeholder: 'Type RESTORE' });
      CRM.dialog({
        title: 'Restore this backup?',
        body: h('div', { class: 'stack' }, h('p', null, `All current data will be replaced with the backup ${name}. A safety copy of the current data is saved first.`), CRM.field('Type RESTORE to confirm', typed)),
        actions: [{ label: 'Cancel' }, { label: 'Restore', class: 'btn-danger', onClick: async () => { const r = await CRM.post(`/api/admin/backups/${encodeURIComponent(name)}/restore`, { confirm: typed.value }); CRM.toast(`Restored. Safety copy: ${r.safety_backup}`); await CRM.loadRef(true); reload(); } }],
      });
    };
    const upload = h('input', { type: 'file', accept: '.sunco-backup,.db,.gz' });
    const passphrase = h('input', { type: 'password', autocomplete: 'off', placeholder: 'Only needed for an emailed backup' });
    el.replaceChildren(
      h(
        'section',
        { class: 'card stack' },
        h('div', { class: 'card-head' }, h('h2', null, 'Backups'), h('button', { class: 'btn-primary', onclick: async () => { try { const r = await CRM.post('/api/admin/backups'); CRM.toast(`Backed up: ${r.backup.name}`); reload(); } catch (e) { CRM.fail(e); } } }, 'Back up now')),
        status,
        emailStatus,
        data.recent_failures ? h('p', { class: 'form-error' }, 'A nightly backup failed in the last 2 days. Check the server has disk space.') : null,
        h('p', { class: 'muted small' }, `Backups are stored in ${data.location}. Keep this folder on a different drive or a synced cloud folder, and download a copy regularly. For a readable copy of every enquiry, use Reports → Export.`),
        data.items.length
          ? h(
              'div',
              { class: 'table-wrap' },
              h(
                'table',
                { class: 'data' },
                h('thead', null, h('tr', null, ['Date', 'Time', 'Type', 'Size', ''].map((x) => h('th', null, x)))),
                h(
                  'tbody',
                  null,
                  data.items.map((b) =>
                    h(
                      'tr',
                      null,
                      h('td', null, CRM.fmtDate(b.date, { year: true })),
                      h('td', null, b.time),
                      h('td', null, { nightly: 'Nightly', manual: 'Manual', 'pre-restore': 'Before restore' }[b.kind]),
                      h('td', null, fmtSize(b.size)),
                      h('td', null, h('div', { class: 'btn-row' }, h('a', { class: 'btn btn-sm', href: `/api/admin/backups/${encodeURIComponent(b.name)}`, download: b.name }, 'Download'), h('button', { class: 'btn-sm', onclick: () => emailNow(b.name) }, 'Email'), CRM.isAdmin() ? h('button', { class: 'btn-sm btn-ghost', onclick: () => restore(b.name) }, 'Restore') : null))
                    )
                  )
                )
              )
            )
          : h('p', { class: 'empty' }, 'No backups yet.')
      ),
      CRM.isAdmin()
        ? h(
            'section',
            { class: 'card stack' },
            h('h2', null, 'Restore from a backup file'),
            h('p', { class: 'muted small' }, 'Use this if something has gone wrong, or after setting the CRM up on a new server: choose the file from the backup email (.sunco-backup) or a downloaded backup (.db), then enter the passphrase if asked. A safety copy of the current data is taken first.'),
            h('div', { class: 'form-grid cols-2' }, CRM.field('Backup file', upload), CRM.field('Backup passphrase', passphrase, { name: 'passphrase' })),
            h('div', null, h('button', {
              class: 'btn-danger',
              onclick: async () => {
                const f = upload.files[0];
                if (!f) return CRM.toast('Choose a file', 'error');
                if (!(await CRM.confirm('Replace all data?', `All current data will be replaced with ${f.name}. A safety copy is saved first.`, 'Restore', 'btn-danger'))) return;
                try {
                  const r = await CRM.api('POST', '/api/admin/backups-upload/restore', f, { headers: { 'x-confirm': 'RESTORE', 'x-backup-passphrase': encodeURIComponent(passphrase.value) } });
                  CRM.toast(`Restored. Safety copy: ${r.safety_backup}`);
                  await CRM.loadRef(true);
                  reload();
                } catch (e) {
                  CRM.fail(e);
                }
              },
            }, 'Upload and restore'))
          )
        : null
    );
  };

  // ---- Import ----
  ADMIN.import = async (el) => {
    const ref = await CRM.loadRef(true);
    const { users } = await CRM.get('/api/users');
    const file = h('input', { type: 'file', accept: '.xlsx' });
    const out = h('div');
    el.replaceChildren(
      h(
        'section',
        { class: 'card stack' },
        h('h2', null, 'Import the walk-in spreadsheet'),
        h('p', null, 'Upload the Excel workbook (.xlsx). You’ll check which column is which for each tab and see a preview of any problems before anything is saved. Rows already imported are skipped, so it’s safe to run again.'),
        CRM.field('Workbook', file),
        h('div', null, h('button', {
          class: 'btn-primary',
          onclick: async (e) => {
            const f = file.files[0];
            if (!f) return CRM.toast('Choose a file', 'error');
            e.target.disabled = true;
            try {
              const p = await CRM.api('POST', '/api/admin/import/preview', f);
              drawMapping(p);
            } catch (err) {
              CRM.fail(err);
            } finally {
              e.target.disabled = false;
            }
          },
        }, 'Read workbook'))
      ),
      out
    );

    function drawMapping(p) {
      const configs = p.sheets.map((s) => ({ name: s.name, include: s.row_count > 0, mapping: { ...s.mapping }, brand_id: s.guessed_brand_id || '', location_id: '', salesperson_id: '' }));
      const colOptions = (s) => [{ value: '', label: '— not in this sheet —' }, ...s.headers.map((hd, i) => ({ value: i, label: `${String.fromCharCode(65 + (i % 26))}${i >= 26 ? Math.floor(i / 26) : ''}: ${hd || '(no heading)'}` }))];
      const result = h('div');
      const cards = p.sheets.map((s, idx) => {
        const cfg = configs[idx];
        const include = h('input', { type: 'checkbox', checked: cfg.include, onchange: (e) => (cfg.include = e.target.checked) });
        const brandSel = CRM.select([{ value: '', label: 'Use Brand column' }, ...ref.brands.map((b) => ({ value: b.id, label: b.name }))], cfg.brand_id, { onchange: (e) => (cfg.brand_id = e.target.value) });
        const locSel = CRM.select([{ value: '', label: 'Use Department column' }, ...ref.locations.map((l) => ({ value: l.id, label: l.name }))], '', { onchange: (e) => (cfg.location_id = e.target.value) });
        const spSel = CRM.select([{ value: '', label: 'Choose…' }, ...users.filter((u) => u.active).map((u) => ({ value: u.id, label: u.name }))], '', { onchange: (e) => (cfg.salesperson_id = e.target.value) });
        const mapGrid = h(
          'div',
          { class: 'form-grid cols-3' },
          Object.entries(p.fields).map(([field, label]) =>
            CRM.field(label, CRM.select(colOptions(s), cfg.mapping[field] ?? '', { onchange: (e) => { if (e.target.value === '') delete cfg.mapping[field]; else cfg.mapping[field] = Number(e.target.value); } }))
          )
        );
        return h(
          'section',
          { class: 'card stack' },
          h('div', { class: 'card-head' }, h('label', { class: 'check' }, include, h('b', null, `Tab "${s.name}"`)), h('span', { class: 'muted small' }, `${s.row_count} rows · headings on row ${s.header_row}`)),
          h('div', { class: 'form-grid cols-3' }, CRM.field('Brand if not in a column', brandSel), CRM.field('Site if not in a column', locSel), CRM.field('Salesperson if not in a column', spSel, { hint: 'Needed when there is no salesperson column' })),
          h('details', null, h('summary', null, 'Column matching (checked automatically; adjust if needed)'), h('div', { style: { marginTop: '12px' } }, mapGrid))
        );
      });
      const run = async (dry) => {
        try {
          const r = await CRM.post('/api/admin/import/run', { token: p.token, sheets: configs, dry_run: dry });
          result.replaceChildren(
            h(
              'section',
              { class: 'card stack' },
              h('h2', null, dry ? 'Preview' : 'Import complete'),
              h('p', null, h('b', null, dry ? `${r.will_import} enquiries ready to import` : `${r.imported} enquiries imported`), ` (${r.open} open, ${r.sold} sold, ${r.lost} lost). ${r.skipped_rows} rows skipped, ${r.already_imported} already imported.`),
              r.open ? h('p', { class: 'muted small' }, 'Open enquiries get a follow-up date of today so they show on everyone’s Today screen.') : null,
              r.problems.length
                ? h('div', { class: 'table-wrap' }, h('table', { class: 'data' }, h('thead', null, h('tr', null, ['Tab', 'Row', 'Issue', ''].map((x) => h('th', null, x)))), h('tbody', null, r.problems.map((x) => h('tr', null, h('td', null, x.sheet), h('td', null, x.row), h('td', null, x.message), h('td', null, x.skipped ? h('span', { class: 'badge badge-overdue' }, 'Skipped') : h('span', { class: 'badge badge-due' }, 'Imported')))))))
                : null,
              dry && r.will_import ? h('div', null, h('button', { class: 'btn-primary', onclick: () => run(false) }, `Import ${r.will_import} enquiries`)) : null
            )
          );
          result.scrollIntoView({ behavior: 'smooth' });
        } catch (err) {
          CRM.fail(err);
        }
      };
      out.replaceChildren(...cards, h('div', { class: 'btn-row', style: { marginBottom: '16px' } }, h('button', { class: 'btn-primary', onclick: () => run(true) }, 'Check for problems')), result);
    }
  };

  // ---- Audit log ----
  ADMIN.audit = async (el) => {
    let offset = 0;
    const tbody = h('tbody');
    const more = h('button', { onclick: () => load() }, 'Load more');
    const load = async () => {
      const r = await CRM.get(`/api/admin/audit?limit=100&offset=${offset}`);
      offset += r.items.length;
      more.hidden = offset >= r.total;
      const summarise = (a) => {
        try {
          const after = a.after_json ? JSON.parse(a.after_json) : null;
          if (!after) return '';
          return Object.entries(after)
            .filter(([k]) => !['franchise_id', 'entry_month', 'created_by'].includes(k))
            .slice(0, 6)
            .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
            .join(', ');
        } catch {
          return '';
        }
      };
      tbody.append(
        ...r.items.map((a) =>
          h('tr', null, h('td', { class: 'small' }, CRM.fmtDateTime(a.created_at)), h('td', null, a.user || 'System'), h('td', null, a.action), h('td', null, a.entity, a.entity_id ? ` #${a.entity_id}` : ''), h('td', { class: 'small muted' }, summarise(a)))
        )
      );
    };
    el.replaceChildren(h('section', { class: 'card' }, h('h2', null, 'Audit log'), h('p', { class: 'muted small' }, 'Every change, export, backup and restore.'), h('div', { class: 'table-wrap' }, h('table', { class: 'data' }, h('thead', null, h('tr', null, ['When', 'Who', 'Action', 'What', 'Details'].map((x) => h('th', null, x)))), tbody)), h('p', { style: { marginTop: '12px' } }, more)));
    await load();
  };

  // ======================= Account =======================
  CRM.route(/^\/account$/, async (main) => {
    const me = CRM.state.me;
    const email = h('input', { type: 'email', value: me.email || '' });
    const notify = h('input', { type: 'checkbox', checked: me.notify_email });
    const prefs = h(
      'form',
      {
        class: 'card stack',
        onsubmit: async (e) => {
          e.preventDefault();
          try {
            const r = await CRM.patch('/api/auth/me', { email: email.value, notify_email: notify.checked });
            CRM.state.me = r.user;
            CRM.toast('Saved');
          } catch (err) {
            CRM.showError(prefs, err);
          }
        },
      },
      h('h2', null, 'Email reminders'),
      CRM.field('Your email', email, { name: 'email' }),
      h('label', { class: 'check' }, notify, me.role === 'salesperson' ? 'Email me my follow-ups each morning' : 'Email me the morning and end-of-day summaries'),
      h('div', null, h('button', { type: 'submit', class: 'btn-primary' }, 'Save'))
    );
    const cur = h('input', { type: 'password', autocomplete: 'current-password' });
    const nw = h('input', { type: 'password', autocomplete: 'new-password' });
    const nw2 = h('input', { type: 'password', autocomplete: 'new-password' });
    const pw = h(
      'form',
      {
        class: 'card stack',
        onsubmit: async (e) => {
          e.preventDefault();
          if (nw.value !== nw2.value) return CRM.showError(pw, { field: 'confirm', message: 'The new passwords do not match' });
          try {
            const r = await CRM.post('/api/auth/change-password', { current_password: cur.value, new_password: nw.value });
            CRM.state.me = r.user;
            pw.reset();
            CRM.toast('Password changed. Other devices have been signed out.');
          } catch (err) {
            CRM.showError(pw, err);
          }
        },
      },
      h('h2', null, 'Change password'),
      CRM.field('Current password', cur, { name: 'current_password' }),
      CRM.field('New password', nw, { name: 'new_password', hint: 'At least 10 characters' }),
      CRM.field('Confirm new password', nw2, { name: 'confirm' }),
      h('div', null, h('button', { type: 'submit', class: 'btn-primary' }, 'Change password'))
    );
    const scope = me.full_access ? 'All brands at all sites' : me.franchises.map((f) => `${f.brand} – ${f.location}`).join(', ') || 'None yet';
    main.replaceChildren(
      h('div', { class: 'page-head' }, h('div', null, h('h1', null, me.name), h('p', { class: 'muted' }, `${CRM.ROLE[me.role]}${me.is_admin ? ' · Admin' : ''} · ${me.username}`)), h('button', { onclick: () => CRM.logout() }, 'Sign out')),
      h('section', { class: 'card' }, h('h2', null, 'Your brands and sites'), h('p', null, scope)),
      h('div', { class: 'grid-2' }, prefs, pw)
    );
  });
})();
