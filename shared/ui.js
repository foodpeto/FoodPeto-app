/* Shared UI helpers for all three FoodPeto apps */
(function () {
  const esc = (s) => String((s == null ? '' : s)).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => '₹' + Math.round(n).toLocaleString('en-IN');
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  const LOGO_MARK = `<svg class="mark" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="32" fill="#3D5C3A"/>
    <g fill="#F5F2E4"><ellipse cx="32" cy="36" rx="9.5" ry="8"/><ellipse cx="21.5" cy="25" rx="3.6" ry="4.6" transform="rotate(-18 21.5 25)"/>
    <ellipse cx="28" cy="19.5" rx="3.6" ry="4.8" transform="rotate(-6 28 19.5)"/><ellipse cx="36" cy="19.5" rx="3.6" ry="4.8" transform="rotate(6 36 19.5)"/>
    <ellipse cx="42.5" cy="25" rx="3.6" ry="4.6" transform="rotate(18 42.5 25)"/></g></svg>`;
  const logo = (suffix = '') => `<span class="logo">${LOGO_MARK}<span>Food<b>Peto</b>${suffix ? `<small style="font-family:var(--font-body);font-size:11px;font-weight:800;color:var(--mustard-deep);margin-left:6px;letter-spacing:.08em;text-transform:uppercase">${suffix}</small>` : ''}</span></span>`;

  const I = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20" ${extra}>${d}</svg>`;
  const icons = {
    home: I('<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>'),
    menu: I('<path d="M4 6h16M4 12h16M4 18h10"/>'),
    bowl: I('<path d="M3 11h18a9 9 0 0 1-18 0z"/><path d="M8 7c0-1.5 1-2 1-3.5M12 7c0-1.5 1-2 1-3.5M16 7c0-1.5 1-2 1-3.5"/>'),
    plans: I('<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>'),
    orders: I('<path d="M6 2h12l2 4v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6z"/><path d="M4 6h16M9 11h6M9 15h6"/>'),
    user: I('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>'),
    search: I('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
    pin: I('<path d="M12 22s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>'),
    back: I('<path d="M15 18l-6-6 6-6"/>'),
    chev: I('<path d="m9 18 6-6-6-6"/>'),
    down: I('<path d="m6 9 6 6 6-6"/>'),
    close: I('<path d="M18 6 6 18M6 6l12 12"/>'),
    star: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="m12 2 3 6.6 7 .8-5.2 4.8 1.4 7L12 17.6 5.8 21.2l1.4-7L2 9.4l7-.8z"/></svg>',
    phone: I('<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>'),
    clock: I('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    tag: I('<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/>'),
    bike: I('<circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 6h2l3 11.5M5.5 17.5 9 10h6l3.5 7.5M9 10 7.5 6H5"/>'),
    wallet: I('<rect x="2" y="6" width="20" height="14" rx="2"/><path d="M2 10h20M16 15h2"/>'),
    chart: I('<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>'),
    grid: I('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'),
    cal: I('<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4M8 13h3v3H8z"/>'),
    book: I('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>'),
    users: I('<circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-6 7-6s7 2 7 6M16 3.5a4 4 0 0 1 0 8M22 21c0-3-1.5-5-4-5.7"/>'),
    gift: I('<rect x="3" y="8" width="18" height="13" rx="1"/><path d="M12 8v13M3 12h18M12 8S10 3 7.5 4 9 8 12 8zM12 8s2-5 4.5-4S15 8 12 8z"/>'),
    cog: I('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
    plus: I('<path d="M12 5v14M5 12h14"/>'),
    edit: I('<path d="M12 20h9M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z"/>'),
    trash: I('<path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15"/>'),
    check: I('<path d="M20 6 9 17l-5-5"/>'),
    nav: I('<path d="m3 11 19-9-9 19-2-8z"/>'),
    logout: I('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>'),
    whatsapp: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.8 14.2c-.2.7-1.4 1.3-2 1.4-.5.1-1.1.1-1.8-.1a16 16 0 0 1-1.6-.6 12.6 12.6 0 0 1-4.9-4.3c-.4-.5-1-1.5-1-2.8 0-1.3.7-2 1-2.3.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.3 0 .5l-.3.5-.4.4c-.1.2-.3.3-.1.6.2.3.7 1.2 1.6 2 1.1 1 2 1.3 2.3 1.4.3.2.5.1.6 0l.9-1c.2-.3.4-.2.6-.1l1.9.9c.3.1.5.2.5.3.1.2.1.7-.1 1.3z"/></svg>',
  };

  function foodArt(r, size = 96) {
    const [a, b, c, c1, c2] = r.art || ['🍲', '', '', '#F4EAD5', '#E7CF9F'];
    return `<div class="food" style="width:${size}px;height:${size}px;background:radial-gradient(circle at 30% 25%, ${c1}, ${c2})">
      ${size >= 70 && c ? `<span class="em3" style="font-size:${size * 0.17}px">${c}</span>` : ''}
      <span class="em" style="font-size:${size * 0.46}px">${a}</span>
      ${size >= 56 && b ? `<span class="em2" style="font-size:${size * 0.22}px">${b}</span>` : ''}</div>`;
  }
  const vmark = (diet) => `<span class="vmark ${diet === 'nonveg' ? 'nv' : diet === 'egg' ? 'egg' : ''}" title="${diet === 'nonveg' ? 'Non-veg' : diet === 'egg' ? 'Contains egg' : 'Veg'}"></span>`;

  function toast(msg, ms = 2200) {
    let box = $('#toasts'); if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
    const t = document.createElement('div'); t.className = 'toast'; t.innerHTML = msg; box.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 300); }, ms);
  }

  // Bottom sheet / modal. Returns the root element. Content is rendered once (not touched by live re-renders).
  function sheet(html, { modal = false, onClose } = {}) {
    closeSheet();
    const s = document.createElement('div'); s.className = 'scrim'; s.id = 'scrim';
    s.innerHTML = modal ? `<div class="modal" role="dialog">${html}</div>` : `<div class="sheet" role="dialog"><div class="grab"></div>${html}</div>`;
    s.addEventListener('click', (e) => { if (e.target === s) closeSheet(); });
    s._onClose = onClose; document.body.appendChild(s); requestAnimationFrame(() => s.classList.add('show'));
    const f = s.querySelector('[autofocus]'); if (f) setTimeout(() => f.focus(), 60);
    return s;
  }
  function closeSheet() { const s = $('#scrim'); if (!s) return; if (s._onClose) s._onClose(); s.remove(); if (window.UI && typeof window.UI.onSheetClosed === 'function') window.UI.onSheetClosed(); }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

  // event delegation: data-act="name" → handlers.name(el, event)
  function delegate(root, handlers, events = ['click']) {
    events.forEach((type) => root.addEventListener(type, (e) => {
      const el = e.target.closest(`[data-${type === 'click' ? 'act' : 'on' + type}]`);
      if (!el || !root.contains(el)) return;
      const name = el.dataset[type === 'click' ? 'act' : 'on' + type];
      if (handlers[name]) handlers[name](el, e);
    }));
  }

  function timeAgo(t) {
    const s = Math.round((Date.now() - t) / 1000); if (s < 60) return 'just now';
    const m = Math.round(s / 60); if (m < 60) return `${m} min ago`; const h = Math.round(m / 60); if (h < 24) return `${h} hr ago`;
    const d = Math.round(h / 24); return d === 1 ? 'yesterday' : `${d} days ago`;
  }
  const fmtTime = (t) => new Date(t).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  const fmtDate = (t) => new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  const fmtDay = (t) => new Date(t).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  const statusBadge = (o) => { const s = FP.status(o); return `<span class="badge ${s.tone}">${s.short}</span>`; };
  const stars = (n) => `<span style="color:var(--mustard)">${'★'.repeat(Math.round(n))}${'☆'.repeat(5 - Math.round(n))}</span>`;
  const lsGet = (k, d) => { try { const v = localStorage.getItem('foodpeto.' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem('foodpeto.' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } };

  window.UI = { esc, money, $, $$, logo, LOGO_MARK, icons, foodArt, vmark, toast, sheet, closeSheet, delegate, timeAgo, fmtTime, fmtDate, fmtDay, statusBadge, stars, lsGet, lsSet };
})();
