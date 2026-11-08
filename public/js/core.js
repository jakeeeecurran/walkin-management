// Shared helpers: API calls, safe element building, routing, dialogs, toasts, formatting.
(function () {
  const CRM = (window.CRM = { state: { me: null, ref: null, branding: {} }, views: {} });

  // Let replaceChildren skip null/false (used for optional sections) instead of printing "null".
  const nativeReplace = Element.prototype.replaceChildren;
  Element.prototype.replaceChildren = function (...children) {
    return nativeReplace.apply(this, children.flat(Infinity).filter((c) => c != null && c !== false));
  };

  // ---- API ----
  CRM.api = async function api(method, path, body, opts = {}) {
    const headers = {};
    let payload;
    if (body instanceof Blob || body instanceof ArrayBuffer) {
      headers['content-type'] = 'application/octet-stream';
      headers['x-sunco-upload'] = '1';
      payload = body;
    } else if (body !== undefined) {
      headers['content-type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    Object.assign(headers, opts.headers || {});
    const res = await fetch(path, { method, headers, body: payload, credentials: 'same-origin' });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && !path.startsWith('/api/auth/')) {
      CRM.state.me = null;
      CRM.showLogin();
      throw Object.assign(new Error(data.error || 'Please sign in'), { status: 401, silent: true });
    }
    if (!res.ok) throw Object.assign(new Error(data.error || 'Something went wrong'), { status: res.status, field: data.field });
    return data;
  };
  CRM.get = (p) => CRM.api('GET', p);
  CRM.post = (p, b = {}) => CRM.api('POST', p, b);
  CRM.patch = (p, b = {}) => CRM.api('PATCH', p, b);
  CRM.put = (p, b = {}) => CRM.api('PUT', p, b);
  CRM.qs = (obj) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(obj)) if (v !== undefined && v !== null && v !== '' && v !== false) p.set(k, v);
    const s = p.toString();
    return s ? `?${s}` : '';
  };

  // ---- Element builder (never uses innerHTML for data) ----
  function h(tag, attrs, ...children) {
    const el = tag === 'svg' || attrs?.svg ? document.createElementNS('http://www.w3.org/2000/svg', tag) : document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false || k === 'svg') continue;
        if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'class') el.setAttribute('class', Array.isArray(v) ? v.filter(Boolean).join(' ') : v);
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k in el && !(el instanceof SVGElement) && k !== 'list' && k !== 'form') {
          try {
            el[k] = v;
          } catch {
            el.setAttribute(k, v === true ? '' : v);
          }
        } else el.setAttribute(k, v === true ? '' : v);
      }
    }
    append(el, children);
    return el;
  }
  function append(el, children) {
    for (const c of children.flat(Infinity)) {
      if (c == null || c === false) continue;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
  }
  CRM.h = h;

  // Small inline icons (paths only, drawn with currentColor).
  const ICONS = {
    today: 'M8 2v3M16 2v3M3.5 9h17M5 4.5h14a1.5 1.5 0 0 1 1.5 1.5v13A1.5 1.5 0 0 1 19 20.5H5A1.5 1.5 0 0 1 3.5 19V6A1.5 1.5 0 0 1 5 4.5ZM8 13h3v3H8z',
    list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
    plus: 'M12 5v14M5 12h14',
    chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
    team: 'M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM20 20v-1.5a3.5 3.5 0 0 0-2.5-3.35M15.5 4.2a3.5 3.5 0 0 1 0 6.6',
    cog: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z',
    user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
    more: 'M5 12h.01M12 12h.01M19 12h.01',
    phone: 'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2Z',
    sms: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z',
    mail: 'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2ZM22 6l-10 7L2 6',
    search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM21 21l-4.3-4.3',
    back: 'M15 18l-6-6 6-6',
    alert: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z',
    clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 6v6l4 2',
    walk: 'M13 4a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM9 21l2-6 2 2v4M7 12l3-4 4 1 2 3M11 15l-1-4',
    inbox: 'M22 12h-6l-2 3h-4l-2-3H2M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1Z',
    check: 'M20 6 9 17l-5-5',
    shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z',
    chevron: 'm6 9 6 6 6-6',
    filter: 'M3 6h18M6 12h12M10 18h4',
    dots: 'M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM19 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM5 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
    x: 'M18 6 6 18M6 6l12 12',
    edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z',
    swap: 'M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5',
    undo: 'M3 7v6h6M21 17a9 9 0 0 0-15-6.7L3 13',
    ban: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM4.9 4.9l14.2 14.2',
    trash: 'M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6',
    download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
    arrow: 'M5 12h14M13 6l6 6-6 6',
  };
  CRM.icon = function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', ICONS[name] || '');
    svg.append(p);
    return svg;
  };

  // ---- Formatting ----
  const TZ = 'Australia/Brisbane';
  CRM.today = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  CRM.addDays = (iso, n) => {
    const d = new Date(iso + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  CRM.fmtDate = (iso, opts = {}) => {
    if (!iso) return '';
    const d = new Date(iso.length === 10 ? iso + 'T00:00:00Z' : iso);
    return new Intl.DateTimeFormat('en-AU', { timeZone: iso.length === 10 ? 'UTC' : TZ, day: 'numeric', month: 'short', ...(opts.year ? { year: 'numeric' } : {}), ...(opts.weekday ? { weekday: 'short' } : {}) }).format(d);
  };
  CRM.fmtDateTime = (iso) =>
    iso ? new Intl.DateTimeFormat('en-AU', { timeZone: TZ, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(iso)) : '';
  CRM.fmtMonth = (ym) => new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(ym + '-01T00:00:00Z'));
  CRM.relDay = (iso) => {
    if (!iso) return '';
    const t = CRM.today();
    if (iso === t) return 'Today';
    if (iso === CRM.addDays(t, 1)) return 'Tomorrow';
    if (iso === CRM.addDays(t, -1)) return 'Yesterday';
    const diff = Math.round((Date.parse(iso) - Date.parse(t)) / 86400e3);
    if (diff < 0) return `${-diff} days ago`;
    if (diff < 7) return CRM.fmtDate(iso, { weekday: true });
    return CRM.fmtDate(iso);
  };
  CRM.ROLE = { salesperson: 'Salesperson', sales_manager: 'Sales Manager', general_manager: 'General Manager' };
  CRM.initials = (name) => (name || '?').split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  CRM.pct = (x) => (x == null ? '–' : `${x}%`);
  CRM.avatar = (name, colour) => h('span', { class: 'avatar', style: { background: colour || 'var(--primary)' }, 'aria-hidden': 'true' }, CRM.initials(name));
  CRM.empty = (title, text, icon = 'inbox') => h('div', { class: 'empty' }, h('div', { class: 'ico' }, CRM.icon(icon)), h('b', null, title), text ? h('div', { class: 'small' }, text) : null);

  // ---- Reference data helpers ----
  CRM.isManager = () => CRM.state.me && (CRM.state.me.full_access || CRM.state.me.role === 'sales_manager');
  CRM.isFull = () => CRM.state.me && CRM.state.me.full_access;
  CRM.isAdmin = () => CRM.state.me && CRM.state.me.is_admin;
  CRM.loadRef = async (force) => {
    if (!CRM.state.ref || force) CRM.state.ref = await CRM.get('/api/reference');
    return CRM.state.ref;
  };
  CRM.byId = (list, id) => list.find((x) => x.id === Number(id));

  // ---- Toasts ----
  CRM.toast = function toast(message, kind) {
    const el = h('div', { class: ['toast', kind === 'error' && 'error'] }, message);
    document.getElementById('toasts').append(el);
    setTimeout(() => el.remove(), kind === 'error' ? 6000 : 3000);
  };
  CRM.fail = (err) => {
    if (err && err.silent) return;
    CRM.toast(err?.message || 'Something went wrong', 'error');
  };

  // ---- Dialog ----
  // CRM.dialog({ title, body: Node, actions: [{label, class, onClick(close) -> bool|Promise}] })
  CRM.dialog = function dialog({ title, body, actions = [], wide }) {
    const dlg = document.getElementById('dialog');
    const id = String((Number(dlg.dataset.id) || 0) + 1);
    dlg.dataset.id = id;
    dlg.style.width = wide ? 'min(860px, calc(100vw - 24px))' : '';
    const close = () => dlg.close();
    const head = h('div', { class: 'dlg-head' }, h('h2', null, title), h('button', { class: 'btn-ghost btn-sm', type: 'button', 'aria-label': 'Close', onclick: close }, '✕'));
    const buttons = actions.map((a) =>
      h(
        'button',
        {
          type: 'button',
          class: a.class || '',
          onclick: async (e) => {
            const btn = e.currentTarget;
            btn.disabled = true;
            try {
              const keepOpen = await a.onClick?.(close);
              // Don't close if the action opened a new dialog in its place.
              if (keepOpen !== true && dlg.dataset.id === id) close();
            } catch (err) {
              CRM.fail(err);
            } finally {
              btn.disabled = false;
            }
          },
        },
        a.label
      )
    );
    dlg.replaceChildren(h('div', { class: 'dlg' }, head, body, buttons.length ? h('div', { class: 'dlg-actions' }, buttons) : null));
    if (!dlg.open) dlg.showModal();
    return { close, el: dlg };
  };
  CRM.confirm = (title, message, label = 'Confirm', cls = 'btn-primary') =>
    new Promise((resolve) => {
      let answered = false;
      const { el } = CRM.dialog({
        title,
        body: h('p', null, message),
        actions: [
          { label: 'Cancel', onClick: () => resolve(false) },
          { label, class: cls, onClick: () => { answered = true; resolve(true); } },
        ],
      });
      el.addEventListener('close', () => answered || resolve(false), { once: true });
    });

  // ---- Dropdown menus ----
  // CRM.menu(anchorEl, [{ label, hint, icon, danger, checked, onSelect }|'divider'], { align: 'left'|'right' })
  let openMenu = null;
  function closeMenu() {
    if (!openMenu) return;
    openMenu.el.remove();
    openMenu.anchor.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', openMenu.outside, true);
    document.removeEventListener('keydown', openMenu.keys, true);
    window.removeEventListener('resize', closeMenu);
    window.removeEventListener('scroll', openMenu.scroll, true);
    const a = openMenu.anchor;
    openMenu = null;
    return a;
  }
  CRM.closeMenu = closeMenu;
  CRM.menu = function menu(anchor, items, { align = 'left', width } = {}) {
    if (openMenu && openMenu.anchor === anchor) return closeMenu();
    closeMenu();
    const el = h(
      'div',
      { class: 'menu', role: 'menu', style: width ? { minWidth: `${width}px` } : null },
      items.filter(Boolean).map((it) =>
        it === 'divider'
          ? h('div', { class: 'menu-divider', role: 'separator' })
          : h(
              'button',
              {
                type: 'button',
                role: it.checked !== undefined ? 'menuitemradio' : 'menuitem',
                'aria-checked': it.checked !== undefined ? String(!!it.checked) : null,
                class: ['menu-item', it.danger && 'danger', it.checked && 'checked'],
                onclick: () => { closeMenu(); it.onSelect?.(); },
              },
              it.icon ? CRM.icon(it.icon) : null,
              h('span', { class: 'menu-label' }, it.label, it.hint ? h('small', null, it.hint) : null),
              it.checked ? h('span', { class: 'menu-check', 'aria-hidden': 'true' }, CRM.icon('check')) : null
            )
      )
    );
    document.body.append(el);
    const r = anchor.getBoundingClientRect();
    const mw = el.offsetWidth;
    const left = align === 'right' ? r.right - mw : r.left;
    el.style.left = `${Math.max(8, Math.min(left, window.innerWidth - mw - 8))}px`;
    const below = r.bottom + 6;
    const fitsBelow = below + el.offsetHeight < window.innerHeight - 8;
    el.style.top = `${fitsBelow ? below : Math.max(8, r.top - el.offsetHeight - 6)}px`;
    anchor.setAttribute('aria-expanded', 'true');
    const buttons = [...el.querySelectorAll('.menu-item')];
    (buttons.find((b) => b.classList.contains('checked')) || buttons[0])?.focus();
    const outside = (e) => { if (!el.contains(e.target) && !anchor.contains(e.target)) closeMenu(); };
    const keys = (e) => {
      const i = buttons.indexOf(document.activeElement);
      if (e.key === 'Escape') { e.preventDefault(); closeMenu()?.focus(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); buttons[(i + 1) % buttons.length]?.focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); buttons[(i - 1 + buttons.length) % buttons.length]?.focus(); }
      else if (e.key === 'Tab') closeMenu();
    };
    const scroll = (e) => { if (!el.contains(e.target)) closeMenu(); };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', keys, true);
    window.addEventListener('resize', closeMenu);
    window.addEventListener('scroll', scroll, true);
    openMenu = { el, anchor, outside, keys, scroll };
  };
  window.addEventListener('hashchange', closeMenu);

  // A button that looks like a select and opens a menu of options.
  // options: [{ value, label, hint }]
  CRM.dropdown = function dropdown({ options, value, onChange, label, prefix, icon, align }) {
    const current = () => options.find((o) => String(o.value) === String(value)) || options[0];
    const btn = h('button', { type: 'button', class: 'dropdown', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': label || null });
    const draw = () =>
      btn.replaceChildren(icon ? CRM.icon(icon) : null, prefix ? h('span', { class: 'dropdown-prefix' }, prefix) : null, h('span', { class: 'dropdown-value' }, current().label), CRM.icon('chevron'));
    draw();
    btn.addEventListener('click', () =>
      CRM.menu(
        btn,
        options.map((o) => ({ label: o.label, hint: o.hint, checked: String(o.value) === String(value), onSelect: () => { value = o.value; draw(); onChange(o.value); } })),
        { align, width: btn.offsetWidth }
      )
    );
    return btn;
  };

  // ---- Form error display ----
  CRM.clearErrors = (root) => {
    root.querySelectorAll('.has-error').forEach((el) => el.classList.remove('has-error'));
    root.querySelectorAll('.field-error, .form-error').forEach((el) => el.remove());
  };
  CRM.showError = (root, err) => {
    CRM.clearErrors(root);
    const target = err.field && root.querySelector(`[data-field="${err.field}"]`);
    if (target) {
      target.classList.add('has-error');
      target.append(h('div', { class: 'field-error', role: 'alert' }, err.message));
      target.scrollIntoView({ block: 'center', behavior: 'smooth' });
      target.querySelector('input, select, textarea, button')?.focus({ preventScroll: true });
    } else {
      root.prepend(h('div', { class: 'form-error', role: 'alert' }, err.message));
      root.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  };

  // ---- Field builders ----
  CRM.field = (label, control, { name, hint, required } = {}) =>
    h('div', { class: 'field', dataset: name ? { field: name } : undefined }, h('label', { class: 'field', for: control.id || undefined }, h('span', { class: required ? 'req' : '' }, label), control), hint ? h('small', null, hint) : null);
  CRM.select = (options, value, attrs = {}) =>
    h(
      'select',
      attrs,
      options.map((o) => h('option', { value: o.value, selected: String(o.value) === String(value ?? ''), disabled: o.disabled }, o.label))
    );

  // ---- Router ----
  const routes = [];
  CRM.route = (pattern, handler) => routes.push({ pattern, handler });
  // Where the current page is kept. Normally the address bar; the published demo swaps in an in-memory one.
  CRM.location = {
    get: () => location.hash,
    set: (hash) => { location.hash = hash; },
    replace: (hash) => history.replaceState(null, '', hash),
  };
  CRM.go = (hash) => {
    if (CRM.location.get() === hash) CRM.render();
    else CRM.location.set(hash);
  };
  // File downloads (exports, backups). The demo replaces this.
  CRM.download = (url) => { window.location.href = url; };
  CRM.parseHash = () => {
    const raw = CRM.location.get().replace(/^#/, '') || '/today';
    const [path, query] = raw.split('?');
    return { path, params: Object.fromEntries(new URLSearchParams(query || '')) };
  };
  CRM.setQuery = (params) => {
    const { path } = CRM.parseHash();
    CRM.location.replace(`#${path}${CRM.qs(params)}`);
  };
  CRM.render = async function render() {
    if (!CRM.state.me) return;
    const { path, params } = CRM.parseHash();
    const main = document.getElementById('main');
    for (const r of routes) {
      const m = r.pattern.exec(path);
      if (m) {
        CRM.markNav(path);
        // Each page draws into its own container, so a slow page that finishes after the
        // user has moved on can't overwrite the newer page.
        const view = h('div', { class: 'view' }, h('div', { class: 'loading' }, 'Loading…'));
        main.replaceChildren(view);
        try {
          await r.handler(view, m.slice(1), params);
        } catch (err) {
          if (!err.silent) view.replaceChildren(h('div', { class: 'card' }, h('h1', null, 'Something went wrong'), h('p', null, err.message)));
        }
        return;
      }
    }
    CRM.go('#/today');
  };
  window.addEventListener('hashchange', () => CRM.render());
})();
