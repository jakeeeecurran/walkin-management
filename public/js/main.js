// Start-up: branding, sign-in, set-password, navigation.
(function () {
  const CRM = window.CRM;
  const { h } = CRM;
  const main = () => document.getElementById('main');

  CRM.applyBranding = async function applyBranding() {
    try {
      const b = await CRM.get('/api/branding');
      CRM.state.branding = b;
      const root = document.documentElement.style;
      if (b.primary_colour) root.setProperty('--primary', b.primary_colour);
      if (b.accent_colour) root.setProperty('--accent', b.accent_colour);
      if (b.primary_colour) document.querySelector('meta[name="theme-color"]').setAttribute('content', b.primary_colour);
      document.getElementById('dealer-name').textContent = b.name || 'Sunco Motors';
      document.getElementById('brand-mark').textContent = (b.name || 'S')[0];
      const logo = document.getElementById('brand-logo');
      logo.hidden = !b.logo_url;
      document.getElementById('brand-mark').hidden = !!b.logo_url;
      document.getElementById('dealer-name').hidden = !!b.logo_url; // the logo already shows the name
      logo.alt = b.name || 'Sunco Motors';
      if (b.logo_url) logo.src = b.logo_url;
      document.title = `${b.name || 'Sunco Motors'} Enquiry Management CRM`;
    } catch {
      /* keep defaults */
    }
  };

  CRM.theme.apply();
  document.getElementById('theme-btn').addEventListener('click', () => CRM.theme.toggle());

  function setChrome(signedIn) {
    document.getElementById('user-chip').hidden = !signedIn;
    document.getElementById('nav').hidden = !signedIn;
    document.getElementById('tabbar').hidden = !signedIn;
    document.getElementById('topbar-right').hidden = !signedIn;
    document.querySelector('.shell').style.display = signedIn ? '' : 'block';
  }

  function buildNav() {
    const me = CRM.state.me;
    document.getElementById('user-chip').textContent = CRM.initials(me.name);
    document.getElementById('user-chip').title = `${me.name} – account`;
    const items = [
      ['today', '#/today', 'Today', 'today'],
      ['enquiries', '#/enquiries', 'Enquiries', 'list'],
      ['new', '#/new', 'New walk-in', 'plus'],
      ['reports', '#/reports', 'Reports', 'chart'],
      CRM.isManager() ? ['team', '#/team', 'Team', 'team'] : null,
      CRM.isFull() ? ['admin', '#/admin', 'Admin', 'cog'] : null,
      ['account', '#/account', 'Account', 'user'],
    ].filter(Boolean);
    const link = ([key, href, label, icon]) => h('a', { href, dataset: { nav: key } }, CRM.icon(icon), label);
    const work = items.filter(([k]) => ['today', 'enquiries', 'new', 'reports'].includes(k));
    const manage = items.filter(([k]) => ['team', 'admin'].includes(k));
    document.getElementById('nav').replaceChildren(
      h('div', { class: 'nav-label' }, 'Sales'),
      work.map(link),
      manage.length ? [h('div', { class: 'nav-label' }, 'Manage'), manage.map(link)] : null,
      h('div', { class: 'spacer' }),
      link(['account', '#/account', 'Account', 'user']),
      h('a', { href: '#', onclick: (e) => { e.preventDefault(); CRM.logout(); } }, CRM.icon('back'), 'Sign out'),
      h('div', { class: 'me' }, CRM.avatar(me.name), h('div', null, h('b', null, me.name), h('span', null, CRM.ROLE[me.role])))
    );
    // Phone tab bar: Today, Enquiries, +New, Reports, More (team/admin/account)
    const more = CRM.isFull() ? '#/admin' : CRM.isManager() ? '#/team' : '#/account';
    document.getElementById('tabbar').replaceChildren(
      h('a', { href: '#/today', dataset: { nav: 'today' } }, CRM.icon('today'), 'Today'),
      h('a', { href: '#/enquiries', dataset: { nav: 'enquiries' } }, CRM.icon('list'), 'Enquiries'),
      h('a', { href: '#/new', class: 'tab-new', dataset: { nav: 'new' }, 'aria-label': 'New walk-in' }, h('span', { class: 'plus' }, '+'), 'New'),
      h('a', { href: '#/reports', dataset: { nav: 'reports' } }, CRM.icon('chart'), 'Reports'),
      h('a', { href: more, dataset: { nav: 'more' } }, CRM.icon(CRM.isManager() ? 'more' : 'user'), CRM.isManager() ? 'More' : 'Account')
    );
    if (CRM.isManager()) {
      // "More" opens a small menu of the remaining pages.
      const moreLink = document.querySelector('#tabbar [data-nav="more"]');
      moreLink.addEventListener('click', (e) => {
        e.preventDefault();
        CRM.dialog({
          title: 'More',
          body: h(
            'div',
            { class: 'stack' },
            h('a', { class: 'btn btn-block', href: '#/team', onclick: () => document.getElementById('dialog').close() }, 'Team'),
            CRM.isFull() ? h('a', { class: 'btn btn-block', href: '#/admin', onclick: () => document.getElementById('dialog').close() }, 'Admin') : null,
            h('a', { class: 'btn btn-block', href: '#/account', onclick: () => document.getElementById('dialog').close() }, 'Account'),
            h('button', { class: 'btn-block', onclick: () => { document.getElementById('dialog').close(); CRM.logout(); } }, 'Sign out')
          ),
        });
      });
    }
  }

  CRM.markNav = (path) => {
    const key = path.startsWith('/enquiries') ? 'enquiries' : path.split('/')[1];
    const moreKeys = ['team', 'admin', 'account'];
    document.querySelectorAll('[data-nav]').forEach((a) => {
      const active = a.dataset.nav === key || (a.dataset.nav === 'more' && moreKeys.includes(key));
      a.classList.toggle('active', active);
      if (active) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    document.getElementById('main').focus({ preventScroll: true });
    window.scrollTo(0, 0);
  };

  CRM.logout = async () => {
    await CRM.post('/api/auth/logout', {}).catch(() => {});
    CRM.state.me = null;
    CRM.state.ref = null;
    CRM.location.replace('#/today'); // the next person starts on Today, not the last page viewed
    CRM.showLogin();
  };

  CRM.showLogin = function showLogin() {
    setChrome(false);
    const username = h('input', { name: 'username', autocomplete: 'username', autocapitalize: 'none', spellcheck: false, required: true });
    const password = h('input', { name: 'password', type: 'password', autocomplete: 'current-password', required: true });
    const remember = h('input', { type: 'checkbox' });
    const form = h(
      'form',
      {
        class: 'stack',
        novalidate: true,
        onsubmit: async (e) => {
          e.preventDefault();
          const btn = form.querySelector('button');
          btn.disabled = true;
          try {
            const { user } = await CRM.post('/api/auth/login', { username: username.value, password: password.value, remember: remember.checked });
            signedIn(user);
          } catch (err) {
            CRM.showError(form, err);
          } finally {
            btn.disabled = false;
          }
        },
      },
      CRM.field('Username or email', username),
      CRM.field('Password', password),
      h('label', { class: 'check' }, remember, 'Keep me signed in on this device (30 days)'),
      h('button', { type: 'submit', class: 'btn-primary btn-big' }, 'Sign in')
    );
    const b = CRM.state.branding || {};
    main().replaceChildren(
      h(
        'div',
        { class: 'auth-wrap' },
        h(
          'section',
          { class: 'card narrow' },
          b.logo_url ? h('img', { class: 'auth-logo', src: b.logo_url, alt: b.name || 'Sunco Motors' }) : h('div', { class: 'brand-mark' }, (b.name || 'S')[0]),
          h('p', { class: 'auth-product' }, 'Enquiry Management CRM'),
          h('h1', null, 'Welcome back'),
          h('p', { class: 'muted', style: { margin: '6px 0 22px' } }, `Sign in to the ${b.name || 'Sunco Motors'} Enquiry Management CRM`),
          form,
          h('p', { class: 'muted small', style: { margin: '18px 0 0', textAlign: 'center' } }, 'Forgotten your password? Ask your sales manager to reset it.')
        )
      )
    );
    username.focus();
  };

  function showSetPassword() {
    setChrome(false);
    const cur = h('input', { type: 'password', autocomplete: 'current-password' });
    const nw = h('input', { type: 'password', autocomplete: 'new-password' });
    const nw2 = h('input', { type: 'password', autocomplete: 'new-password' });
    const form = h(
      'form',
      {
        class: 'stack',
        onsubmit: async (e) => {
          e.preventDefault();
          if (nw.value !== nw2.value) return CRM.showError(form, { field: 'confirm', message: 'The new passwords do not match' });
          try {
            const { user } = await CRM.post('/api/auth/change-password', { current_password: cur.value, new_password: nw.value });
            signedIn(user);
          } catch (err) {
            CRM.showError(form, err);
          }
        },
      },
      CRM.field('Temporary password', cur, { name: 'current_password' }),
      CRM.field('New password', nw, { name: 'new_password', hint: 'At least 10 characters' }),
      CRM.field('Confirm new password', nw2, { name: 'confirm' }),
      h('button', { type: 'submit', class: 'btn-primary btn-big' }, 'Save password'),
      h('button', { type: 'button', class: 'btn-ghost', onclick: () => CRM.logout() }, 'Sign out')
    );
    main().replaceChildren(h('div', { class: 'auth-wrap' }, h('section', { class: 'card narrow' }, h('h1', null, 'Set your password'), h('p', { class: 'muted', style: { margin: '6px 0 22px' } }, "You're signed in with a temporary password. Choose your own to continue."), form)));
    cur.focus();
  }

  async function signedIn(user) {
    CRM.state.me = user;
    if (user.must_change_password) return showSetPassword();
    CRM.state.ref = null;
    setChrome(true);
    buildNav();
    const cur = CRM.location.get();
    if (!cur || cur === '#' || cur === '#/') CRM.location.replace('#/today');
    await CRM.render();
  }

  CRM.applyBranding();
  CRM.get('/api/auth/me')
    .then(({ user }) => signedIn(user))
    .catch(() => CRM.showLogin());
})();
