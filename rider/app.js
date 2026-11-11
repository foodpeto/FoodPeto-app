/* FoodPeto Partner — delivery app */
(function () {
  const { api } = FP;
  const { esc, money, icons, toast, sheet, closeSheet, fmtTime, fmtDay, vmark } = UI;
  const app = document.getElementById('app');
  const OFFER_SECONDS = 30;
  const S = { offerId: null, offerLeft: OFFER_SECONDS, checked: {} };
  const me = () => { const s = api.session; return s && s.riderId ? api.rider(s.riderId) : null; };
  const myId = () => (me() || {}).id;
  const kitchen = () => api.db.settings.kitchen || 'FoodPeto Kitchen · Jaipur';
  const ACTIVE = ['placed', 'cooking', 'ready', 'out'];

  const myActive = () => api.db.orders.find((o) => o.riderId === myId() && ACTIVE.includes(o.status));
  const last = (o) => (o.timeline.find((t) => t.s === 'delivered') || o.timeline[o.timeline.length - 1]).at;
  const myDone = () => api.db.orders.filter((o) => o.riderId === myId() && o.status === 'delivered').sort((a, b) => last(b) - last(a));
  const offers = () => api.db.orders.filter((o) => !o.riderId && ['cooking', 'ready'].includes(o.status)).sort((a, b) => a.createdAt - b.createdAt);
  const pay = (o) => o.riderPay + (o.tip || 0);
  const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
  const todayStats = () => { const list = myDone().filter((o) => sameDay(last(o), Date.now())); return { trips: list.length, earned: list.reduce((a, o) => a + pay(o), 0) }; };
  const mapsLink = (q) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  function insNotes(o, forRider) {
    const i = o.instructions || {}; const out = [];
    const allergies = [...new Set([...(i.allergies || []), ...(o.petAllergies || [])])];
    if (!forRider) {
      if (allergies.length || i.allergyText) out.push(`<div class="note danger">⚠ Allergies: ${esc([...allergies, i.allergyText].filter(Boolean).join(', '))}</div>`);
      if ((i.customization || []).length || i.customText) out.push(`<div class="note">🎯 ${esc([...(i.customization || []), i.customText].filter(Boolean).join(', '))}</div>`);
    }
    if (i.request) out.push(`<div class="note">✨ ${esc(i.request)}</div>`);
    if (i.comment) out.push(`<div class="note">💬 ${esc(i.comment)}</div>`);
    return out.join('');
  }

  // ---------------- screens ----------------
  function Login() {
    return `<div class="r-top" style="padding:28px 20px 40px;border-radius:0 0 30px 30px;position:relative">${UI.logo('Partner')}
      <h1 style="font-size:32px;margin-top:34px">Deliver fresh.<br><i style="color:#E8C27E">Earn more.</i></h1>
      <p style="opacity:.8;margin-top:8px;font-weight:700">Flexible hours · Weekly payouts · Short trips within ${esc(api.db.settings.city || 'Jaipur')}</p></div>
      <div id="auth-box" style="padding:22px 18px 36px"></div>`;
  }
  const AUTH_CFG = () => ({
    forced: !!(api.session && api.session.mustChange),
    signup: {
      cta: 'Want to deliver with FoodPeto?', link: 'Apply to join', title: 'Apply to become a partner', submit: 'Submit application',
      intro: 'Our team reviews applications within 24–48 hours. You can log in to check your status.',
      fields: (v) => `<div class="field"><label for="ap-name">Full name (as on licence)</label><input class="input" id="ap-name" name="name" autocomplete="name" required value="${esc(v.name || '')}"></div>
        <div class="field"><label for="ap-phone">Mobile number</label><div class="phone-in"><span>+91</span><input id="ap-phone" name="phone" inputmode="numeric" maxlength="10" autocomplete="tel-national" required value="${esc(v.phone || '')}"></div></div>
        <div class="field"><label for="ap-vehicle">Vehicle & number</label><input class="input" id="ap-vehicle" name="vehicle" required value="${esc(v.vehicle || '')}" placeholder="e.g. Honda Activa · RJ14 AB 1234"></div>
        <div class="row" style="gap:10px;align-items:flex-end"><div class="field grow"><label for="ap-licence">Driving licence no.</label><input class="input" id="ap-licence" name="licence" required value="${esc(v.licence || '')}" style="text-transform:uppercase"></div>
        <div class="field" style="width:42%"><label for="ap-area">Preferred area</label><select class="input" id="ap-area" name="area">${FP.AREAS.map((a) => `<option ${v.area === a.name ? 'selected' : ''}>${a.name}</option>`).join('')}</select></div></div>`,
      collect: (d) => {
        if (!String(d.name || '').trim()) throw new Error('Enter your full name');
        const phone = String(d.phone || '').replace(/\D/g, ''); if (!/^[6-9]\d{9}$/.test(phone)) throw new Error('Enter a valid 10-digit mobile number');
        if (!String(d.vehicle || '').trim()) throw new Error('Enter your vehicle and number');
        if (!String(d.licence || '').trim()) throw new Error('Enter your driving licence number');
        return { name: d.name, phone, vehicle: d.vehicle, licence: d.licence, area: d.area };
      },
    },
  });
  function Review(r) {
    const st = r.status || 'approved';
    const view = { pending: ['📝', 'Application under review', 'Thanks for applying! Our team checks your details and licence, usually within 24–48 hours. This page updates automatically once you\'re approved.', 'b-mustard', 'Under review'],
      rejected: ['🙏', 'Application not approved', 'We couldn\'t approve your application this time.', 'b-danger', 'Not approved'],
      suspended: ['⏸️', 'Account paused', 'Your partner account is paused. Please contact FoodPeto support.', 'b-danger', 'Paused'] }[st];
    return `<div class="r-top">${UI.logo('Partner')}</div>
      <div class="empty" style="padding:36px 22px 10px"><div class="big">${view[0]}</div><h2 style="font-size:24px;color:var(--ink)">${view[1]}</h2><p class="small" style="margin-top:8px">${view[2]}</p>
        ${r.statusReason ? `<p class="small" style="margin-top:8px"><b>Reason:</b> ${esc(r.statusReason)}</p>` : ''}</div>
      <div class="section"><div class="card" style="padding:16px">
        <div class="row between"><b>${esc(r.name)}</b><span class="badge ${view[3]}">${view[4]}</span></div><div class="divider"></div>
        <div class="kv"><span class="muted">Email</span><span>${esc(r.email || '')}</span></div>
        <div class="kv"><span class="muted">Mobile</span><span>+91 ${esc(r.phone)}</span></div>
        <div class="kv"><span class="muted">Vehicle</span><span>${esc(r.vehicle)}</span></div>
        ${r.licence ? `<div class="kv"><span class="muted">Licence</span><span>${esc(r.licence)}</span></div>` : ''}
        ${r.appliedAt ? `<div class="kv"><span class="muted">Applied</span><span>${fmtDay(r.appliedAt)}</span></div>` : ''}</div></div>
      <div class="section col"><a class="btn btn-ghost btn-block" href="https://wa.me/91${esc(api.db.settings.phone)}?text=${encodeURIComponent('Hi FoodPeto, about my partner application (' + (r.email || r.phone) + ')')}" target="_blank" rel="noopener" style="color:#1C8A4A">${icons.whatsapp} Contact support</a>
        <button class="btn btn-ghost btn-block" data-act="logout">${icons.logout} Log out</button></div>`;
  }
  function passwordSheet() {
    const el = sheet(`<h3 style="font-size:20px;margin-bottom:12px">Change password</h3>
      <form id="cpw" class="col" style="gap:12px"><div class="field"><label>Current password</label><input class="input" type="password" name="current" autocomplete="current-password" required></div>
      <div class="field"><label>New password</label><input class="input" type="password" name="next" autocomplete="new-password" required><span class="tiny muted">At least 8 characters, with a letter and a number</span></div>
      <div class="field"><label>Confirm new password</label><input class="input" type="password" name="confirm" autocomplete="new-password" required></div>
      <button class="btn btn-primary btn-block btn-lg">Update password</button></form>`);
    el.querySelector('#cpw').addEventListener('submit', async (e) => {
      e.preventDefault(); const f = new FormData(e.target);
      if (f.get('next') !== f.get('confirm')) return toast('The new passwords don\'t match');
      try { await api.auth.changePassword(f.get('current'), f.get('next')); closeSheet(); toast('Password updated ✓'); } catch (err) { toast(err.message, 3200); }
    });
  }
  function Top() {
    const r = me(); const t = todayStats();
    return `${api.online ? '' : '<div class="offline">Reconnecting…</div>'}<div class="r-top"><div class="row between">${UI.logo('Partner')}<button class="duty ${r.online ? 'on' : ''}" data-act="duty">${r.online ? 'ON DUTY' : 'OFF DUTY'}<span class="switch ${r.online ? 'on' : ''}"></span></button></div>
      <div class="earn"><div><b>${money(t.earned)}</b><span>Today's earnings</span></div><div><b>${t.trips}</b><span>Trips</span></div><div><b>${r.rating}★</b><span>Rating</span></div></div></div>`;
  }
  function Home() {
    const r = me(); const active = myActive();
    if (active) return Top() + Task(active);
    if (!r.online) return Top() + `<div class="empty" style="padding-top:36px"><div class="big">😴</div><h2 style="font-size:22px;color:var(--ink)">You're off duty</h2><p class="small" style="margin:6px 0 18px">Go on duty to receive delivery requests from the FoodPeto kitchen.</p><button class="btn btn-primary btn-lg" data-act="duty">Go on duty</button></div>${Tips()}`;
    const waiting = offers();
    return Top() + `<div class="radar"><div class="core">🛵</div></div>
      <div class="center"><h2 style="font-size:21px">Looking for orders…</h2><p class="small muted" style="margin-top:4px">Stay near ${esc(kitchen().split('·')[1] || 'the kitchen')} for faster pickups</p></div>
      ${waiting.length ? `<div class="section"><div class="eyebrow" style="margin-bottom:8px">Waiting for a partner (${waiting.length})</div></div>${waiting.map((o) => `<button class="card waiting" style="width:calc(100% - 32px);text-align:left" data-act="show-offer" data-id="${o.id}"><span style="font-size:24px">${FP.STATUS[o.status].icon}</span><div class="grow"><b>#${o.id} · ${esc(o.address.area)}</b><div class="small muted">${o.address.km} km · ${o.items.reduce((a, i) => a + i.qty, 0)} items · ${FP.STATUS[o.status].short}</div></div><b style="color:var(--pine)">${money(pay(o))}</b></button>`).join('')}` : ''}
      ${Tips()}`;
  }
  function Tips() {
    return `<div class="section"><div class="card" style="padding:14px 16px;background:var(--mustard-soft);border:0"><b>🧊 Fresh-food handling</b><div class="small muted" style="margin-top:4px">Keep bowls upright in the insulated bag. Never stack heavy items on top. Deliver within 30 minutes of pickup.</div></div></div>`;
  }
  function Task(o) {
    const step = o.status === 'out' ? 3 : o.arrivedAt ? 2 : 1;
    const bar = `<div class="steps">${[1, 2, 3].map((n) => `<span class="${n < step ? 'done' : n === step ? 'on' : ''}"></span>`).join('')}</div>`;
    const header = (t, sub) => `<div class="row between"><div><div class="eyebrow">Step ${step} of 3 · #${o.id}</div><h2>${t}</h2><div class="small muted">${sub}</div></div><span class="badge b-mustard">${money(pay(o))}</span></div>`;
    if (step === 1) return bar + `<div class="card task">${header('Go to the kitchen', 'Pick up a fresh FoodPeto order')}
      <div class="route"><div class="stop"><b>${esc(kitchen())}</b><div class="small muted">Pickup · ${FP.STATUS[o.status].label}</div></div><div class="stop drop"><b>${esc(o.address.area)}</b><div class="small muted">Drop · ${o.address.km} km</div></div></div>
      <div class="row"><a class="btn btn-ghost grow" href="${mapsLink(kitchen())}" target="_blank" rel="noopener">${icons.nav} Navigate</a><button class="btn btn-primary grow" data-act="arrive" data-id="${o.id}">Arrived at kitchen</button></div></div>`;
    if (step === 2) {
      const ready = o.status === 'ready'; const ck = S.checked[o.id] || {}; const all = o.items.every((_, i) => ck[i]);
      return bar + `<div class="card task">${header(ready ? 'Pick up the order' : 'Food is being cooked', ready ? 'Check every item before leaving' : 'The kitchen is finishing your order — hang tight')}
        ${!ready ? `<div class="cash" style="background:var(--sage);color:var(--pine);margin-top:12px">🧑‍🍳 ${FP.STATUS[o.status].label} · usually ready in 10–15 min</div>` : ''}
        <div style="margin-top:12px">${o.items.map((i, k) => `<button class="check-item ${ck[k] ? 'on' : ''}" data-act="check" data-id="${o.id}" data-k="${k}" ${ready ? '' : 'disabled'}><span class="cbox">${ck[k] ? '✓' : ''}</span>${vmark(i.diet)}<div class="grow"><b>${esc(i.name)}</b><div class="tiny muted">${esc(i.portion)} · ${i.slot}</div></div><b>× ${i.qty}</b></button>`).join('')}</div>
        ${insNotes(o, false)}
        <button class="btn btn-primary btn-block btn-lg" style="margin-top:14px" data-act="pickup" data-id="${o.id}" ${ready && all ? '' : 'disabled'}>${ready ? (all ? 'Confirm pickup' : 'Tick all items to continue') : 'Waiting for kitchen…'}</button></div>`;
    }
    return bar + `<div class="card task">${header('Deliver to customer', `${esc(o.slot)} · ${o.address.km} km`)}
      <div class="row" style="margin-top:14px"><span class="avatar" style="background:var(--mustard)">${esc((o.customerName || '?')[0])}</span><div class="grow"><b>${esc(o.customerName)}</b><div class="small muted">For ${o.petSpecies === 'cat' ? '🐱' : '🐶'} ${esc(o.petName || 'their pet')}</div></div>${o.phone ? `<a class="icon-btn" href="tel:${esc(o.phone)}" aria-label="Call customer">${icons.phone}</a>` : ''}</div>
      <div class="route" style="margin-bottom:6px"><div class="stop drop"><b>${esc(o.address.label)}</b><div class="small muted">${esc(o.address.line)}</div></div></div>
      ${insNotes(o, true)}
      <a class="btn btn-ghost btn-block" style="margin-top:8px" href="${mapsLink(o.address.line + ', ' + api.db.settings.city)}" target="_blank" rel="noopener">${icons.nav} Navigate to drop</a>
      ${o.payment === 'Cash on delivery' ? `<div class="cash" style="margin-top:12px">💵 Collect ${money(o.total)} in cash or UPI</div>` : `<div class="cash" style="margin-top:12px;background:var(--sage);color:var(--pine)">✅ Prepaid via ${esc(o.payment)} — nothing to collect</div>`}
      <div class="divider"></div>
      <b>Enter the 4-digit OTP from the customer</b>
      <div class="otp-in">${[0, 1, 2, 3].map((i) => `<input inputmode="numeric" maxlength="1" data-oninput="otp" aria-label="OTP digit ${i + 1}">`).join('')}</div>
      <button class="btn btn-primary btn-block btn-lg" data-act="deliver" data-id="${o.id}">Mark as delivered</button></div>`;
  }
  function Earnings() {
    const done = myDone(); const days = [...Array(7)].map((_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (6 - i)); return d; });
    const per = days.map((d) => done.filter((o) => sameDay(last(o), d)).reduce((a, o) => a + pay(o), 0)); const max = Math.max(...per, 1);
    const recent = done.filter((o) => Date.now() - last(o) < 7 * 864e5);
    return Top() + `<div class="section"><div class="card" style="padding:16px">
      <div class="row between"><div><div class="eyebrow">This week</div><div class="pay-big">${money(per.reduce((a, b) => a + b, 0))}</div></div><div style="text-align:right"><b>${recent.length}</b><div class="small muted">trips</div></div></div>
      <div class="bars">${per.map((v, i) => `<div class="bar ${i === 6 ? 'today' : ''}"><em>${v ? money(v) : ''}</em><i style="height:${(v / max) * 100}%"></i><small>${days[i].toLocaleDateString('en-IN', { weekday: 'short' }).slice(0, 2)}</small></div>`).join('')}</div></div></div>
      <div class="section"><div class="card" style="padding:4px 16px">
        <div class="kv" style="padding:12px 0;border-bottom:1px solid var(--line)"><span>Trip pay (₹30 base + ₹8/km)</span><b>${money(recent.reduce((a, o) => a + o.riderPay, 0))}</b></div>
        <div class="kv" style="padding:12px 0;border-bottom:1px solid var(--line)"><span>Customer tips</span><b>${money(recent.reduce((a, o) => a + (o.tip || 0), 0))}</b></div>
        <div class="kv" style="padding:12px 0"><span>Next payout</span><b>Monday · bank transfer</b></div></div></div>`;
  }
  function History() {
    const done = myDone();
    return Top() + `<div class="section"><div class="section-title"><h2>Trip history</h2><span class="small muted">${done.length} deliveries</span></div>
      <div class="card" style="padding:4px 16px">${done.length ? done.slice(0, 40).map((o) => `<div class="trip"><span class="ti">✅</span><div class="grow"><b>#${o.id} · ${esc(o.address.area)}</b><div class="small muted">${fmtDay(last(o))}, ${fmtTime(last(o))} · ${o.address.km} km</div></div><b style="color:var(--pine)">+${money(pay(o))}</b></div>`).join('') : '<div class="empty">No trips yet.</div>'}</div></div>`;
  }
  function Profile() {
    const r = me();
    return Top() + `<div class="section"><div class="card" style="padding:16px"><div class="row" style="gap:14px"><span class="avatar" style="width:56px;height:56px;font-size:24px">${esc(r.name[0])}</span><div><h2 style="font-size:22px">${esc(r.name)}</h2><div class="small muted">${esc(r.email || '')}</div><div class="small muted">+91 ${esc(r.phone)} · Partner since ${esc(r.joined)}</div></div></div>
      <div class="divider"></div>
      <div class="kv"><span class="muted">Vehicle</span><b>${esc(r.vehicle)}</b></div>
      <div class="kv"><span class="muted">Zone</span><b>${esc(api.db.settings.city)} Central</b></div>
      <div class="kv"><span class="muted">Driving licence</span><span class="badge b-sage">Verified</span></div>
      <div class="kv"><span class="muted">Aadhaar KYC</span><span class="badge b-sage">Verified</span></div>
      <div class="kv"><span class="muted">Food-safety training</span><span class="badge b-sage">Completed</span></div></div></div>
      <div class="section col"><a class="btn btn-ghost btn-block" href="https://wa.me/91${esc(api.db.settings.phone)}" target="_blank" rel="noopener" style="color:#1C8A4A">${icons.whatsapp} Partner support · ${esc(api.db.settings.phone)}</a><button class="btn btn-ghost btn-block" data-act="change-pw">🔒 Change password</button><button class="btn btn-ghost btn-block" data-act="logout">${icons.logout} Log out</button></div>`;
  }
  function nav(active) {
    const tab = (id, label, icon) => `<a href="#/${id}" class="${active === id ? 'on' : ''}">${icon}${label}</a>`;
    return `<nav class="bottom-nav">${tab('home', 'Home', icons.bike)}${tab('earnings', 'Earnings', icons.wallet)}${tab('history', 'Trips', icons.orders)}${tab('profile', 'Profile', icons.user)}</nav>`;
  }

  // ---------------- offer popup (kept outside #app so live re-renders don't reset it) ----------------
  let timer = null;
  function offerRoot() { let el = document.getElementById('offer-root'); if (!el) { el = document.createElement('div'); el.id = 'offer-root'; document.body.appendChild(el); } return el; }
  function closeOffer() { clearInterval(timer); timer = null; S.offerId = null; offerRoot().innerHTML = ''; }
  function showOffer(o) {
    S.offerId = o.id; S.offerLeft = OFFER_SECONDS; const C = 2 * Math.PI * 28;
    offerRoot().innerHTML = `<div class="offer"><div class="offer-card">
      <div class="row between"><div><div class="eyebrow">New delivery request</div><h2 style="font-size:24px;margin-top:2px">#${o.id}</h2></div>
        <div class="ring"><svg width="64" height="64"><circle cx="32" cy="32" r="28" stroke="var(--line)" stroke-width="5" fill="none"/><circle id="ring-c" cx="32" cy="32" r="28" stroke="var(--mustard)" stroke-width="5" fill="none" stroke-dasharray="${C}" stroke-dashoffset="0" stroke-linecap="round" style="transition:stroke-dashoffset 1s linear"/></svg><b id="ring-t">${OFFER_SECONDS}</b></div></div>
      <div class="row" style="align-items:baseline;gap:10px;margin-top:10px"><span class="pay-big">${money(pay(o))}</span><span class="small muted">est. earnings · ${(o.address.km * 2).toFixed(1)} km round trip</span></div>
      <div class="route"><div class="stop"><b>Pickup · ${esc(kitchen())}</b><div class="small muted">${FP.STATUS[o.status].label}</div></div><div class="stop drop"><b>Drop · ${esc(o.address.area)}</b><div class="small muted">${o.address.km} km · ${esc(o.slot)}</div></div></div>
      <div class="row wrap" style="margin-bottom:14px"><span class="chip">${o.items.reduce((a, i) => a + i.qty, 0)} items</span><span class="chip">${o.payment === 'Cash on delivery' ? '💵 Collect cash' : '✅ Prepaid'}</span><span class="chip">🧊 Keep upright</span></div>
      <div class="row"><button class="btn btn-ghost btn-lg" data-act="reject" data-id="${o.id}">Reject</button><button class="btn btn-primary btn-lg grow" data-act="accept" data-id="${o.id}" style="animation:pulse 1.6s infinite">Accept order</button></div>
    </div></div>`;
    clearInterval(timer);
    timer = setInterval(() => {
      S.offerLeft -= 1; const t = document.getElementById('ring-t'); const c = document.getElementById('ring-c');
      if (t) t.textContent = S.offerLeft; if (c) c.style.strokeDashoffset = C * (1 - S.offerLeft / OFFER_SECONDS);
      if (S.offerLeft <= 0) { closeOffer(); api.call('declineOrder', o.id); toast('Request timed out'); }
    }, 1000);
  }
  function checkOffers() {
    const r = me(); if (!r || !r.online || myActive()) { if (S.offerId) closeOffer(); return; }
    if (S.offerId) { const o = api.order(S.offerId); if (!o || o.riderId || !['cooking', 'ready'].includes(o.status)) { closeOffer(); if (!o) toast('Order taken by another partner'); } else return; }
    const next = offers()[0]; if (next) { showOffer(next); try { if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate([200, 100, 200]); } catch (e) { /* noop */ } }
  }

  // ---------------- render ----------------
  function route() { return (location.hash.slice(2) || 'home').split('/')[0]; }
  function render(keep) {
    const y = window.scrollY; const r = me(); const name = route();
    if (!r || api.session.mustChange) { closeOffer(); app.innerHTML = Login(); AuthUI.mount(document.getElementById('auth-box'), AUTH_CFG()); return; }
    if ((r.status || 'approved') !== 'approved') { closeOffer(); app.innerHTML = Review(r); return; }
    const screens = { home: Home, earnings: Earnings, history: History, profile: Profile };
    const otpVals = [...app.querySelectorAll('.otp-in input')].map((i) => i.value);
    app.innerHTML = `<main class="scroll-area">${(screens[name] || Home)()}</main>${nav(screens[name] ? name : 'home')}`;
    const ins = app.querySelectorAll('.otp-in input'); if (ins.length && otpVals.length === ins.length) ins.forEach((i, k) => { i.value = otpVals[k]; });
    if (keep) window.scrollTo(0, y);
    checkOffers();
  }

  const A = {
    'change-pw'() { passwordSheet(); },
    async logout() { await api.auth.logout(); render(); },
    async duty() { const r = me(); if (await api.call('setOnline', !r.online)) toast(r.online ? 'You are off duty' : 'You are on duty — looking for orders 🛵'); },
    'show-offer'(el) { const o = api.order(el.dataset.id); if (o) showOffer(o); },
    async accept(el) { closeOffer(); if (await api.call('acceptOrder', el.dataset.id)) toast('✅ Order accepted — head to the kitchen'); },
    reject(el) { closeOffer(); api.call('declineOrder', el.dataset.id); },
    async arrive(el) { if (await api.call('markArrived', el.dataset.id)) toast('Marked arrived at the kitchen'); },
    check(el) { const id = el.dataset.id; S.checked[id] = S.checked[id] || {}; S.checked[id][el.dataset.k] = !S.checked[id][el.dataset.k]; render(true); },
    async pickup(el) { if (await api.call('pickUp', el.dataset.id)) { toast('🛵 Picked up — customer notified'); window.scrollTo(0, 0); } },
    async deliver(el) {
      const code = [...app.querySelectorAll('.otp-in input')].map((i) => i.value).join('');
      if (code.length < 4) return toast('Enter the 4-digit OTP');
      const o = api.order(el.dataset.id); const res = await api.call('deliver', el.dataset.id, code);
      if (!res) { app.querySelectorAll('.otp-in input').forEach((i) => { i.value = ''; }); return; }
      sheet(`<div class="center" style="padding:16px 0"><div style="font-size:64px">🎉</div><h2 style="font-size:26px">Delivered!</h2><p class="muted" style="margin:6px 0 4px">#${o.id} to ${esc(o.customerName)}</p><div class="pay-big" style="margin:10px 0">+${money(res.pay || pay(o))}</div><p class="small muted">Added to today's earnings</p><button class="btn btn-primary btn-block btn-lg" style="margin-top:16px" onclick="UI.closeSheet()">Find next order</button></div>`);
    },
  };
  UI.delegate(document.body, A);
  document.body.addEventListener('input', (e) => {
    const t = e.target; const k = t.dataset.oninput; if (!k) return;
    t.value = t.value.replace(/\D/g, ''); if (t.value && t.nextElementSibling) t.nextElementSibling.focus();
  });
  document.body.addEventListener('keydown', (e) => { const t = e.target; if (t.dataset && /otp/.test(t.dataset.oninput || '') && e.key === 'Backspace' && !t.value && t.previousElementSibling) t.previousElementSibling.focus(); });
  window.addEventListener('hashchange', () => { window.scrollTo(0, 0); render(); });
  api.subscribe(() => render(true));
  FP.ready.then(() => render()).catch(() => { app.innerHTML = `<div class="empty" style="padding-top:120px"><div class="big">🔌</div><h2 style="color:var(--ink)">Can't reach FoodPeto</h2><p class="small" style="margin:8px 0 16px">Start the server with <code>node server.js</code>, then reload.</p><button class="btn btn-primary" onclick="location.reload()">Retry</button></div>`; });
})();
