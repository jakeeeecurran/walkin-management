// Brand trends (general manager only): enquiries, test drives and cars sold per brand.
// One month -> a point per day; several months -> a point per month.
// Any number of brands can be chosen:
//   - "Together": up to five brands on shared charts, one colour per brand (a brand keeps
//     its colour while it stays selected).
//   - "Per brand": one small chart per brand, any number of brands, the three measures in
//     the same three colours on every chart and one shared scale so brands compare fairly.
// The bubbles show each brand's share of all enquiries in the chosen months.
(function () {
  const CRM = window.CRM;
  const { h } = CRM;
  const TOGETHER_MAX = 5;
  const METRICS = [
    { key: 'enquiries', title: 'Enquiries', short: 'Enq', slot: 1 },
    { key: 'test_drives', title: 'Test drives', short: 'TD', slot: 2 },
    { key: 'sold', title: 'Cars sold', short: 'Sold', slot: 3 },
  ];

  // Kept while the app is open, so the choice survives moving between pages.
  const state = { months: null, selected: [], slots: new Map(), touched: false, view: 'together' };

  const s = (tag, attrs, ...kids) => h(tag, { ...attrs, svg: true }, ...kids);
  const shortMonth = (ym, withYear) => new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', month: 'short', ...(withYear ? { year: '2-digit' } : {}) }).format(new Date(ym + '-01T00:00:00Z'));
  const dayLabel = (d) => new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(d + 'T00:00:00Z'));
  const lastMonths = (n) => {
    const [y, m] = CRM.today().slice(0, 7).split('-').map(Number);
    return Array.from({ length: n }, (_, i) => new Date(Date.UTC(y, m - 1 - i, 1)).toISOString().slice(0, 7));
  };
  const sum = (a) => a.reduce((x, y) => x + y, 0);

  function periodLabel(months) {
    const t = CRM.today().slice(0, 7);
    if (months.length === 1) return `${CRM.fmtMonth(months[0])}${months[0] === t ? ' to date' : ''} · by day`;
    const sorted = [...months].sort();
    const contiguous = sorted.every((m, i) => i === 0 || nextMonth(sorted[i - 1]) === m);
    const range = contiguous ? `${shortMonth(sorted[0], true)} – ${shortMonth(sorted.at(-1), true)}` : `${sorted.length} chosen months`;
    return `${range} · ${sorted.length} months · by month`;
  }
  function nextMonth(a) {
    const [y, m] = a.split('-').map(Number);
    return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
  }

  // ---------- Selection and colour slots ----------
  // Colours only apply in the "Together" view. A brand keeps its slot while selected;
  // brands without one get the lowest free slot when the view needs colours.
  function giveSlots() {
    const used = new Set(state.slots.values());
    for (const id of state.selected) {
      if (state.slots.has(id)) continue;
      let slot = 1;
      while (used.has(slot)) slot++;
      if (slot > TOGETHER_MAX) break;
      state.slots.set(id, slot);
      used.add(slot);
    }
  }
  function select(id) {
    if (!state.selected.includes(id)) state.selected.push(id);
  }
  function unselect(id) {
    state.selected = state.selected.filter((x) => x !== id);
    state.slots.delete(id);
  }
  const view = () => (state.selected.length > TOGETHER_MAX ? 'perbrand' : state.view);

  // ---------- Scales ----------
  function niceTicks(max, count = 4) {
    if (max <= 0) return [0, 1];
    const raw = max / count;
    const mag = 10 ** Math.floor(Math.log10(raw));
    const step = Math.max(1, [1, 2, 5, 10].map((x) => x * mag).find((x) => x >= raw));
    const top = Math.ceil(max / step) * step;
    const ticks = [];
    for (let v = 0; v <= top + 1e-9; v += step) ticks.push(Math.round(v));
    return ticks;
  }

  CRM.brandTrends = function brandTrends({ location_id, brand_id } = {}) {
    if (!state.months) state.months = [CRM.today().slice(0, 7)];
    const tooltip = h('div', { class: 'trend-tip', role: 'status', hidden: true });
    const sub = h('p', { class: 'muted small trend-sub' });
    const monthsBtn = h('button', { type: 'button', class: 'filter-btn', onclick: () => pickMonths() }, CRM.icon('today'), h('span', null, 'Months'));
    const chips = h('div', { class: 'chips trend-brands', role: 'group', 'aria-label': 'Brands to compare' });
    const quick = h('div', { class: 'trend-quick' });
    const hint = h('p', { class: 'muted small trend-hint' });
    const viewSeg = h('div', { class: 'segmented trend-view', role: 'group', 'aria-label': 'Chart layout' });
    const legend = h('div', { class: 'trend-legend' });
    const charts = h('div', { class: 'trend-charts' });
    const bubbles = h('figure', { class: 'trend-bubbles' });
    const table = h('div', { class: 'trend-table' });
    const body = h('div', { class: 'trend-body' }, h('div', { class: 'trend-bar' }, viewSeg, legend), charts, h('div', { class: 'trend-lower' }, bubbles, table));
    const card = h(
      'section',
      { class: 'card trends' },
      h('div', { class: 'card-head' }, h('div', null, h('h2', null, 'Brand trends'), sub), monthsBtn),
      chips,
      h('div', { class: 'trend-pickrow' }, quick, hint),
      body,
      tooltip
    );

    let data = null;
    let hoverIdx = null;
    let lastWidth = 0;

    async function load() {
      body.classList.add('refreshing');
      try {
        data = await CRM.get(`/api/reports/trends${CRM.qs({ months: state.months.join(','), location_id })}`);
      } finally {
        body.classList.remove('refreshing');
      }
      if (!state.touched) {
        // First view: the brand filtered on the page, else the three busiest brands.
        state.selected = [];
        state.slots.clear();
        const first = brand_id && data.brands.some((b) => b.id === Number(brand_id)) ? [Number(brand_id)] : data.brands.slice(0, 3).map((b) => b.id);
        first.forEach(select);
      }
      draw();
    }

    const names = new Map();
    // Selected brands with their figures, busiest first (zeros if quiet in these months).
    function series() {
      const order = new Map(data.brands.map((b, i) => [b.id, i]));
      return [...state.selected]
        .sort((a, b) => (order.get(a) ?? 1e9) - (order.get(b) ?? 1e9))
        .map((id) => {
          const b = data.brands.find((x) => x.id === id);
          if (b) names.set(id, b.name);
          const zero = data.buckets.map(() => 0);
          return { id, name: names.get(id) || 'Brand', slot: state.slots.get(id), enquiries: b?.enquiries || zero, test_drives: b?.test_drives || zero, sold: b?.sold || zero, b };
        });
    }

    function changed() {
      state.touched = true;
      hideHover();
      draw();
    }
    function toggle(id) {
      if (state.selected.includes(id)) unselect(id);
      else select(id);
      changed();
    }

    function draw() {
      if (view() === 'together') giveSlots();
      const together = view() === 'together';
      sub.textContent = periodLabel(data.months);
      const list = [...data.brands];
      for (const id of state.selected) if (!list.some((b) => b.id === id)) list.push({ id, name: names.get(id) || 'Brand', total_enquiries: 0 });
      chips.replaceChildren(
        ...list.map((b) => {
          const on = state.selected.includes(b.id);
          return h(
            'button',
            { type: 'button', class: 'chip small', 'aria-pressed': String(on), onclick: () => toggle(b.id) },
            on && together ? h('span', { class: `key s${state.slots.get(b.id)}`, 'aria-hidden': 'true' }) : on ? CRM.icon('check') : null,
            b.name
          );
        })
      );
      const ids = data.brands.map((b) => b.id);
      const all = ids.length > 0 && ids.every((id) => state.selected.includes(id));
      quick.replaceChildren(
        h('button', { type: 'button', class: 'btn-sm btn-ghost', disabled: all, onclick: () => { ids.forEach(select); changed(); } }, 'All brands'),
        h('button', { type: 'button', class: 'btn-sm btn-ghost', onclick: () => { state.selected = []; state.slots.clear(); ids.slice(0, 5).forEach(select); changed(); } }, 'Top 5'),
        h('button', { type: 'button', class: 'btn-sm btn-ghost', disabled: !state.selected.length, onclick: () => { state.selected = []; state.slots.clear(); changed(); } }, 'Clear')
      );
      const n = state.selected.length;
      hint.textContent = !data.brands.length
        ? 'No enquiries in these months.'
        : !n
          ? 'Tap brands to compare them.'
          : `${n} brand${n === 1 ? '' : 's'} chosen.${n > TOGETHER_MAX ? ` Over ${TOGETHER_MAX}, each brand gets its own chart.` : ''}`;
      viewSeg.replaceChildren(
        ...[
          ['together', 'Together'],
          ['perbrand', 'Per brand'],
        ].map(([v, label]) =>
          h(
            'button',
            {
              type: 'button',
              'aria-pressed': String(view() === v),
              disabled: v === 'together' && n > TOGETHER_MAX,
              title: v === 'together' && n > TOGETHER_MAX ? `Together shows up to ${TOGETHER_MAX} brands` : null,
              onclick: () => { state.view = v; hideHover(); draw(); },
            },
            label
          )
        )
      );
      legend.replaceChildren(...(together ? [] : METRICS.map((m) => h('span', null, h('span', { class: `key s${m.slot}`, 'aria-hidden': 'true' }), m.title))));
      drawCharts();
      drawBubbles();
      drawTable();
    }

    // ---------- Line charts ----------
    function drawCharts() {
      const width = Math.max(260, charts.clientWidth || card.clientWidth - 40 || 640);
      lastWidth = width;
      const ser = series();
      charts.classList.toggle('per-brand', view() === 'perbrand');
      if (!ser.length) {
        charts.replaceChildren(CRM.empty('Choose brands to see their trends', 'Tap the brands above, or All brands.', 'chart'));
        return;
      }
      if (view() === 'together') {
        const labelled = ser.length <= 4 && width >= 420;
        charts.replaceChildren(
          ...METRICS.map((m) => {
            const lines = ser.map((sr) => ({ cls: `s${sr.slot}`, name: sr.name, values: sr[m.key] }));
            const total = sum(lines.map((l) => sum(l.values)));
            return lineChart({
              W: width,
              H: 170,
              lines,
              labelled,
              aria: `${m.title} per ${data.granularity} for ${ser.map((x) => x.name).join(', ')}. Values are in the table below.`,
              caption: [h('strong', null, m.title), h('span', { class: 'muted' }, ` ${total} in total`)],
              tip: (i) => tipTable(i, ser),
            });
          })
        );
      } else {
        // One chart per brand, all on the same scale.
        const gap = 16;
        const cols = Math.max(1, Math.floor((width + gap) / (300 + gap)));
        const pw = Math.floor((width - gap * (cols - 1)) / cols) - 22; // less the panel border and padding
        const max = Math.max(1, ...ser.flatMap((sr) => METRICS.flatMap((m) => sr[m.key])));
        charts.replaceChildren(
          ...ser.map((sr) => {
            const b = sr.b;
            return lineChart({
              W: pw,
              H: 132,
              max,
              compact: true,
              lines: METRICS.map((m) => ({ cls: `s${m.slot}`, name: m.title, values: sr[m.key] })),
              aria: `${sr.name}: enquiries, test drives and cars sold per ${data.granularity}. Values are in the table below.`,
              caption: [
                h('strong', null, sr.name),
                h('span', { class: 'muted' }, b ? ` ${b.total_enquiries} enq · ${b.total_test_drives} TD · ${b.total_sold} sold · ${CRM.pct(b.conversion)}` : ' no enquiries'),
              ],
              tip: (i) => tipTable(i, [sr], true),
            });
          })
        );
      }
      if (hoverIdx != null) showHover(hoverIdx);
    }

    // A line chart. lines: [{ cls, name, values }]. max: shared top value (optional).
    function lineChart({ W, H, lines, max, labelled, compact, aria, caption, tip }) {
      const n = data.buckets.length;
      const m = { l: 30, r: labelled ? 104 : compact ? 8 : 14, t: 10, b: 24 };
      const pw = W - m.l - m.r;
      const ph = H - m.t - m.b;
      const ticks = niceTicks(max ?? Math.max(1, ...lines.flatMap((l) => l.values)), compact ? 2 : 4);
      const top = ticks.at(-1);
      const x = (i) => m.l + (n === 1 ? pw / 2 : (i * pw) / (n - 1));
      const y = (v) => m.t + ph - (v / top) * ph;

      const svg = s('svg', { class: 'trend-svg', viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', tabindex: '0', 'aria-label': aria });
      for (const tv of ticks) {
        svg.append(s('line', { class: tv === 0 ? 'axis' : 'grid', x1: m.l, x2: W - m.r, y1: y(tv), y2: y(tv) }));
        svg.append(s('text', { class: 'tick', x: m.l - 7, y: y(tv) + 4, 'text-anchor': 'end' }, tv));
      }
      // X labels spaced to the width: days 1, 8, 15…; months as many as fit.
      const room = Math.max(1, Math.floor(pw / (data.granularity === 'day' ? 34 : 44)));
      const every = data.granularity === 'day' ? Math.max(7, Math.ceil(n / room / 7) * 7) : Math.ceil(n / room);
      data.buckets.forEach((k, i) => {
        if (i % every !== 0 && i !== n - 1) return;
        if (i === n - 1 && i % every !== 0 && n > 1 && x(i) - x(i - (i % every)) < 30) return;
        const label = data.granularity === 'day' ? String(Number(k.slice(8))) : shortMonth(k, i === 0 || k.endsWith('-01'));
        svg.append(s('text', { class: 'tick', x: x(i), y: H - 7, 'text-anchor': 'middle' }, label));
      });

      const cross = s('line', { class: 'cross', x1: 0, x2: 0, y1: m.t, y2: m.t + ph, visibility: 'hidden' });
      svg.append(cross);
      const dotsAt = [];
      for (const l of lines) {
        const d = l.values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
        svg.append(s('path', { class: `line ${l.cls}`, d }));
        if (n <= 12 && pw / Math.max(1, n) >= 14) l.values.forEach((v, i) => svg.append(s('circle', { class: `dot ${l.cls}`, cx: x(i), cy: y(v), r: compact ? 3 : 4 })));
        const hd = s('circle', { class: `dot hot ${l.cls}`, r: 5, visibility: 'hidden' });
        svg.append(hd);
        dotsAt.push({ el: hd, vals: l.values });
      }
      // Direct labels at the line ends, nudged apart so they never overlap.
      if (labelled) {
        const ends = lines.map((l) => ({ l, y: y(l.values[n - 1]) })).sort((a, b) => a.y - b.y);
        for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 14) ends[i].y = ends[i - 1].y + 14;
        const over = ends.length ? ends.at(-1).y - (m.t + ph) : 0;
        if (over > 0) ends.forEach((e) => (e.y -= over));
        for (const e of ends) {
          svg.append(s('line', { class: `key-line ${e.l.cls}`, x1: W - m.r + 8, x2: W - m.r + 18, y1: e.y, y2: e.y }));
          const t = s('text', { class: 'end-label', x: W - m.r + 22, y: e.y + 4 });
          t.textContent = e.l.name.length > 12 ? e.l.name.slice(0, 11) + '…' : e.l.name;
          svg.append(t);
        }
      }
      // Hit area: the whole plot, snapping to the nearest day or month.
      const hit = s('rect', { class: 'hit', x: m.l - 6, y: 0, width: pw + 12, height: H });
      const idxAt = (ev) => {
        const r = svg.getBoundingClientRect();
        const px = ((ev.clientX - r.left) / r.width) * W;
        return n === 1 ? 0 : Math.max(0, Math.min(n - 1, Math.round(((px - m.l) / pw) * (n - 1))));
      };
      const move = (ev) => { hoverIdx = idxAt(ev); showHover(hoverIdx, ev, svg); };
      hit.addEventListener('pointermove', move);
      hit.addEventListener('pointerdown', move);
      hit.addEventListener('pointerleave', (ev) => { if (ev.pointerType === 'mouse') hideHover(); });
      svg.append(hit);
      svg.addEventListener('keydown', (ev) => {
        if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
        ev.preventDefault();
        hoverIdx = Math.max(0, Math.min(n - 1, (hoverIdx ?? n - 1) + (ev.key === 'ArrowRight' ? 1 : -1)));
        showHover(hoverIdx, null, svg);
      });
      svg.addEventListener('blur', hideHover);
      svg._tip = tip;
      svg._hover = (i) => {
        if (i == null) {
          cross.setAttribute('visibility', 'hidden');
          dotsAt.forEach((d) => d.el.setAttribute('visibility', 'hidden'));
          return;
        }
        cross.setAttribute('x1', x(i));
        cross.setAttribute('x2', x(i));
        cross.setAttribute('visibility', 'visible');
        for (const d of dotsAt) {
          d.el.setAttribute('cx', x(i));
          d.el.setAttribute('cy', y(d.vals[i]));
          d.el.setAttribute('visibility', 'visible');
        }
      };
      svg._x = (i) => x(i) / W;
      return h('figure', { class: 'trend-chart' }, h('figcaption', null, caption), svg);
    }

    // Tooltip body: every chosen brand (or one brand) with all three measures.
    function tipTable(i, ser, single) {
      const k = data.buckets[i];
      const when = data.granularity === 'day' ? dayLabel(k) : CRM.fmtMonth(k);
      if (single) {
        const sr = ser[0];
        return [
          h('div', { class: 'tip-title' }, `${sr.name} · ${when}`),
          h('table', null, h('tbody', null, METRICS.map((mm) => h('tr', null, h('td', null, h('span', { class: `key s${mm.slot}`, 'aria-hidden': 'true' }), mm.title), h('td', { class: 'num' }, h('strong', null, sr[mm.key][i])))))),
        ];
      }
      return [
        h('div', { class: 'tip-title' }, when),
        h(
          'table',
          null,
          h('thead', null, h('tr', null, h('th', null, ''), ...METRICS.map((mm) => h('th', { class: 'num' }, mm.short)))),
          h('tbody', null, ser.map((sr) => h('tr', null, h('td', null, h('span', { class: `key s${sr.slot}`, 'aria-hidden': 'true' }), sr.name), ...METRICS.map((mm) => h('td', { class: 'num' }, h('strong', null, sr[mm.key][i]))))))
        ),
      ];
    }

    // The crosshair moves on every chart together; the tooltip belongs to the chart pointed at.
    function showHover(i, ev, from) {
      const svgs = [...charts.querySelectorAll('svg')];
      if (!svgs.length) return;
      svgs.forEach((svg) => svg._hover?.(i));
      const svg = from && svgs.includes(from) ? from : svgs[0];
      if (!svg._tip) return hideTip();
      tooltip.replaceChildren(...svg._tip(i));
      tooltip.hidden = false;
      const cr = card.getBoundingClientRect();
      const sr = svg.getBoundingClientRect();
      const px = ev ? ev.clientX - cr.left : sr.left - cr.left + svg._x(i) * sr.width;
      const py = ev ? ev.clientY - cr.top : sr.top - cr.top + 20;
      const tw = tooltip.offsetWidth;
      const left = px + 16 + tw > cr.width - 8 ? px - 16 - tw : px + 16;
      tooltip.style.left = `${Math.max(8, left)}px`;
      tooltip.style.top = `${Math.max(8, py - 20)}px`;
    }
    function hideTip() {
      tooltip.hidden = true;
    }
    function hideHover() {
      hoverIdx = null;
      charts.querySelectorAll('svg').forEach((svg) => svg._hover?.(null));
      hideTip();
    }

    // ---------- Share of enquiries: packed bubbles ----------
    function drawBubbles() {
      const brands = data.brands.filter((b) => b.total_enquiries > 0);
      if (!brands.length) {
        bubbles.replaceChildren(h('figcaption', null, h('strong', null, 'Share of enquiries')), CRM.empty('No enquiries in these months', null, 'inbox'));
        return;
      }
      // Every brand gets a bubble so any of them can be tapped (more than 24 fold into "Other").
      let items = brands.map((b) => ({ id: b.id, name: b.name, n: b.total_enquiries, share: b.share }));
      if (items.length > 24) {
        const rest = items.slice(23);
        const n = rest.reduce((a, b) => a + b.n, 0);
        items = [...items.slice(0, 23), { id: null, name: `Other (${rest.length})`, n, share: Math.round((n / data.total_enquiries) * 1000) / 10 }];
      }
      const placed = pack(items.map((it) => Math.sqrt(it.n)));
      const W = Math.max(260, bubbles.clientWidth || 360);
      const H = Math.min(340, Math.max(240, W * 0.62));
      const minX = Math.min(...placed.map((p) => p.x - p.r));
      const maxX = Math.max(...placed.map((p) => p.x + p.r));
      const minY = Math.min(...placed.map((p) => p.y - p.r));
      const maxY = Math.max(...placed.map((p) => p.y + p.r));
      const k = Math.min((W - 8) / (maxX - minX), (H - 8) / (maxY - minY));
      const ox = (W - (maxX - minX) * k) / 2 - minX * k;
      const oy = (H - (maxY - minY) * k) / 2 - minY * k;

      const svg = s('svg', { class: 'bubble-svg', viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': `Share of enquiries: ${items.map((it) => `${it.name} ${it.share}%`).join(', ')}` });
      items.forEach((it, i) => {
        const p = placed[i];
        const cx = ox + p.x * k;
        const cy = oy + p.y * k;
        const r = Math.max(3, p.r * k - 1);
        const on = it.id != null && state.selected.includes(it.id);
        const slot = on && view() === 'together' ? state.slots.get(it.id) : null;
        const g = s('g', { class: ['bubble', slot ? `s${slot}` : on ? 'chosen' : 'plain', it.id != null && 'pick'].filter(Boolean).join(' '), tabindex: it.id != null ? '0' : null, role: it.id != null ? 'button' : null, 'aria-label': `${it.name}: ${it.share}% of enquiries (${it.n})${it.id != null ? (on ? ', comparing' : ', tap to compare') : ''}` });
        g.append(s('circle', { cx, cy, r: Math.max(r, 12), class: 'bubble-hit' }));
        g.append(s('circle', { cx, cy, r }));
        if (r >= 28) {
          const name = s('text', { class: 'b-name', x: cx, y: cy - 2, 'text-anchor': 'middle' });
          name.textContent = it.name.length > 11 ? it.name.slice(0, 10) + '…' : it.name;
          g.append(name, s('text', { class: 'b-val', x: cx, y: cy + 14, 'text-anchor': 'middle' }, `${Math.round(it.share)}%`));
        } else if (r >= 15) {
          g.append(s('text', { class: 'b-val', x: cx, y: cy + 4, 'text-anchor': 'middle' }, `${Math.round(it.share)}%`));
        }
        const tip = (ev) => {
          tooltip.replaceChildren(h('div', { class: 'tip-title' }, it.name), h('div', null, h('strong', null, `${it.share}%`), ` of enquiries · ${it.n}`));
          tooltip.hidden = false;
          const cr = card.getBoundingClientRect();
          const br = svg.getBoundingClientRect();
          const px = ev?.clientX != null ? ev.clientX - cr.left : br.left - cr.left + (cx / W) * br.width;
          const py = ev?.clientY != null ? ev.clientY - cr.top : br.top - cr.top + (cy / H) * br.height;
          tooltip.style.left = `${Math.max(8, Math.min(cr.width - tooltip.offsetWidth - 8, px + 14))}px`;
          tooltip.style.top = `${Math.max(8, py - 44)}px`;
        };
        g.addEventListener('pointermove', tip);
        g.addEventListener('pointerleave', hideTip);
        g.addEventListener('focus', () => tip());
        g.addEventListener('blur', hideTip);
        if (it.id != null) {
          g.addEventListener('click', () => toggle(it.id));
          g.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggle(it.id); } });
        }
        svg.append(g);
      });
      bubbles.replaceChildren(
        h('figcaption', null, h('strong', null, 'Share of enquiries'), h('span', { class: 'muted' }, ` ${data.total_enquiries} in total`)),
        svg,
        h('p', { class: 'muted small' }, 'Bigger bubble, bigger share. Filled bubbles are the brands you are comparing; tap a bubble to add or remove it.')
      );
    }

    // Places circles (radii in any unit) close together around the centre, 2% gap between them.
    function pack(radii) {
      const out = [];
      const gap = Math.max(...radii) * 0.04;
      radii.forEach((r, i) => {
        if (i === 0) return out.push({ x: 0, y: 0, r });
        let best = null;
        for (const p of out) {
          for (let a = 0; a < 48; a++) {
            const ang = (a / 48) * Math.PI * 2;
            const c = { x: p.x + Math.cos(ang) * (p.r + r + gap), y: p.y + Math.sin(ang) * (p.r + r + gap), r };
            if (out.some((q) => Math.hypot(q.x - c.x, q.y - c.y) < q.r + r + gap - 1e-6)) continue;
            const dist = Math.hypot(c.x * 0.75, c.y); // a little wider than tall
            if (!best || dist < best.d) best = { ...c, d: dist };
          }
        }
        out.push({ x: best.x, y: best.y, r });
      });
      return out;
    }

    // ---------- Table view: every value, without hovering ----------
    function drawTable() {
      if (!data.brands.length) return table.replaceChildren();
      table.replaceChildren(
        h(
          'div',
          { class: 'table-wrap' },
          h(
            'table',
            { class: 'data' },
            h('thead', null, h('tr', null, h('th', null, 'Brand'), h('th', { class: 'num' }, 'Enquiries'), h('th', { class: 'num hide-sm' }, 'Test drives'), h('th', { class: 'num' }, 'Sold'), h('th', { class: 'num' }, 'Conv.'), h('th', { class: 'num hide-sm' }, 'Share'))),
            h(
              'tbody',
              null,
              data.brands.map((b) => {
                const on = state.selected.includes(b.id);
                return h(
                  'tr',
                  { class: on ? 'picked' : null },
                  h('td', null, h('span', { class: on && view() === 'together' ? `key s${state.slots.get(b.id)}` : on ? 'key chosen' : 'key none', 'aria-hidden': 'true' }), b.name),
                  h('td', { class: 'num' }, b.total_enquiries),
                  h('td', { class: 'num hide-sm' }, b.total_test_drives),
                  h('td', { class: 'num' }, b.total_sold),
                  h('td', { class: 'num' }, CRM.pct(b.conversion)),
                  h('td', { class: 'num hide-sm' }, CRM.pct(b.share))
                );
              })
            )
          )
        ),
        h('p', { class: 'muted small' }, 'Sold counts cars sold in these months. Conversion = enquiries from these months that were sold ÷ those enquiries.')
      );
    }

    // ---------- Month picker ----------
    function pickMonths() {
      const options = lastMonths(12);
      const chosen = new Set(state.months);
      const boxes = options.map((ym) => {
        const input = h('input', { type: 'checkbox', checked: chosen.has(ym), onchange: (e) => (e.target.checked ? chosen.add(ym) : chosen.delete(ym)) });
        return { ym, input, el: h('label', { class: 'check' }, input, CRM.fmtMonth(ym)) };
      });
      const quick = (n) => () => {
        chosen.clear();
        options.slice(0, n).forEach((m) => chosen.add(m));
        boxes.forEach((b) => (b.input.checked = chosen.has(b.ym)));
      };
      CRM.dialog({
        title: 'Months to show',
        body: h(
          'div',
          { class: 'stack' },
          h('div', { class: 'chips' }, [['This month', 1], ['Last 3 months', 3], ['Last 6 months', 6], ['Last 12 months', 12]].map(([l, n]) => h('button', { type: 'button', class: 'chip small', onclick: quick(n) }, l))),
          h('p', { class: 'muted small' }, 'One month shows a point per day. Two or more show a point per month.'),
          h('div', { class: 'month-grid' }, boxes.map((b) => b.el))
        ),
        actions: [
          { label: 'Cancel', class: 'btn-ghost' },
          {
            label: 'Show',
            class: 'btn-primary',
            onClick: async () => {
              if (!chosen.size) {
                CRM.toast('Choose at least one month');
                return true;
              }
              state.months = [...chosen].sort();
              hideHover();
              await load();
            },
          },
        ],
      });
    }

    // Redraw when the card changes width (rotate a tablet, resize a window).
    if (window.ResizeObserver) {
      let timer;
      new ResizeObserver(() => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          if (data && Math.abs((charts.clientWidth || 0) - lastWidth) > 8) draw();
        }, 120);
      }).observe(card);
    }

    load().catch(CRM.fail);
    return card;
  };
})();
