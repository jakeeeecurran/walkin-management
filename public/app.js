// Foundations UI: sign in, set a new password, and show the signed-in user's access.
(function () {
  const views = ['login', 'password', 'home'];
  const $ = (sel, root = document) => root.querySelector(sel);
  const ROLE_NAMES = { salesperson: 'Salesperson', sales_manager: 'Sales Manager', general_manager: 'General Manager' };

  async function api(method, path, body) {
    const res = await fetch(path, {
      method,
      headers: body !== undefined ? { 'content-type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || 'Something went wrong');
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function show(name) {
    for (const v of views) $(`#view-${v}`).hidden = v !== name;
    $('#logout').hidden = name === 'login';
  }

  function showError(form, message) {
    const el = $('.error', form);
    el.textContent = message || '';
    el.hidden = !message;
  }

  function renderHome(user) {
    $('[data-field="first-name"]').textContent = user.name.split(' ')[0];
    $('[data-field="role"]').textContent = (ROLE_NAMES[user.role] || user.role) + (user.is_admin ? ' · Admin' : '');
    const scope = $('#scope');
    scope.replaceChildren();
    if (user.full_access) {
      const p = document.createElement('p');
      p.textContent = 'You have access to every brand at all locations.';
      scope.append(p);
      return;
    }
    if (!user.franchises.length) {
      const p = document.createElement('p');
      p.textContent = "You haven't been assigned any brands yet. Ask your sales manager to set this up.";
      scope.append(p);
      return;
    }
    const bySite = new Map();
    for (const f of user.franchises) {
      if (!bySite.has(f.location)) bySite.set(f.location, []);
      bySite.get(f.location).push(f.brand);
    }
    for (const [site, brands] of bySite) {
      const block = document.createElement('div');
      block.className = 'scope-site';
      const h = document.createElement('h3');
      h.textContent = site;
      const ul = document.createElement('ul');
      ul.className = 'chips';
      for (const b of brands) {
        const li = document.createElement('li');
        li.textContent = b;
        ul.append(li);
      }
      block.append(h, ul);
      scope.append(block);
    }
  }

  function route(user) {
    if (!user) return show('login');
    if (user.must_change_password) return show('password');
    renderHome(user);
    show('home');
  }

  async function loadBranding() {
    try {
      const b = await api('GET', '/api/branding');
      if (b.name) {
        $('#dealer-name').textContent = b.name;
        document.title = `${b.name} Walk-In CRM`;
      }
      if (b.primary_colour) document.documentElement.style.setProperty('--primary', b.primary_colour);
      if (b.accent_colour) document.documentElement.style.setProperty('--accent', b.accent_colour);
    } catch {
      /* default branding */
    }
  }

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const btn = $('button', form);
    showError(form, '');
    btn.disabled = true;
    try {
      const { user } = await api('POST', '/api/auth/login', {
        username: form.username.value,
        password: form.password.value,
        remember: form.remember.checked,
      });
      form.reset();
      route(user);
    } catch (err) {
      showError(form, err.message);
    } finally {
      btn.disabled = false;
    }
  });

  $('#password-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    showError(form, '');
    if (form.new_password.value !== form.confirm.value) return showError(form, 'The new passwords do not match');
    try {
      const { user } = await api('POST', '/api/auth/change-password', {
        current_password: form.current_password.value,
        new_password: form.new_password.value,
      });
      form.reset();
      route(user);
    } catch (err) {
      showError(form, err.message);
    }
  });

  $('#logout').addEventListener('click', async () => {
    await api('POST', '/api/auth/logout', {}).catch(() => {});
    route(null);
  });

  loadBranding();
  api('GET', '/api/auth/me')
    .then(({ user }) => route(user))
    .catch(() => route(null));
})();
