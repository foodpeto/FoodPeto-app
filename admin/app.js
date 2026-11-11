/* FoodPeto Admin — kitchen operations + weekly-menu publisher */
(function () {
  const { api, DAYS, DAY_NAMES } = FP;
  const { esc, money, icons, foodArt, vmark, toast, sheet, closeSheet, timeAgo, fmtTime, fmtDay, statusBadge } = UI;
  const app = document.getElementById('app');
  const S = { week: FP.weekKey(), draft: null, draftWeek: null, dirty: false, rq: '', rdiet: 'all', seen: null };

  const isToday = (t) => new Date(t).toDateString() === new Date().toDateString();
  const live = () => api.db.orders.filter((o) => !['delivered', 'cancelled'].includes(o.status));
  const fitsSlot = (r, slotDiet) => (slotDiet === 'veg' ? r.diet !== 'nonveg' : r.diet === 'nonveg');
  const petLabel = (o) => (o.petName ? `${o.petSpecies === 'cat' ? '🐱' : '🐶'} ${o.petName}` : '');
  const per = () => api.db.settings.referralsPerReward || 5;

  const NAV = [
    ['Operations', [['dashboard', 'Dashboard', icons.chart], ['orders', 'Live orders', icons.orders, () => live().length], ['riders', 'Delivery partners', icons.bike]]],
    ['Publishing', [['menu', 'Weekly menu', icons.cal, () => { const m = api.menu(FP.addWeeks(FP.weekKey(), 1)); return m && m.status === 'published' ? 0 : '!'; }], ['recipes', 'Recipe library', icons.book], ['offers', 'Offers & banners', icons.gift]]],
    ['Business', [['referrals', 'Referrals', icons.gift], ['plans', 'Meal plans', icons.plans], ['customers', 'Customers & pets', icons.user], ['vets', 'Vet partners', icons.users, () => (api.db.vetRequests || []).filter((r) => r.status === 'new').length], ['staff', 'Staff & access', icons.users], ['settings', 'Settings', icons.cog]]],
  ];
  const TITLES = { dashboard: 'Dashboard', orders: 'Live orders', riders: 'Delivery partners', menu: 'Weekly menu publisher', recipes: 'Recipe library', offers: 'Offers & banners', referrals: 'Referral program', plans: 'Meal plans & subscriptions', customers: 'Customers & pets', vets: 'Vet partners', staff: 'Staff & access', settings: 'Settings' };
  // What each staff role can open (the server enforces the same rules on every action).
  const ROLE_INFO = { owner: 'Everything, including staff accounts', manager: 'Everything except staff accounts', kitchen: 'Orders, partners on duty, weekly menu and recipes' };
  const KITCHEN_PAGES = ['dashboard', 'orders', 'riders', 'menu', 'recipes', 'settings'];
  const myRole = () => (api.session && api.session.staffRole) || 'kitchen';
  const canSee = (page) => myRole() === 'owner' || (myRole() === 'manager' ? page !== 'staff' : KITCHEN_PAGES.includes(page));
  const isManager = () => myRole() === 'owner' || myRole() === 'manager';

  function insBlock(o) {
    const i = o.instructions || {}; const allergies = [...new Set([...(i.allergies || []), ...(o.petAllergies || [])])];
    const rows = [];
    if (allergies.length || i.allergyText) rows.push(`<div class="allergy">⚠ Allergies: ${esc([...allergies, i.allergyText].filter(Boolean).join(', '))}</div>`);
    if ((i.customization || []).length || i.customText) rows.push(`<div class="ins">🎯 ${esc([...(i.customization || []), i.customText].filter(Boolean).join(' · '))}</div>`);
    if (i.request) rows.push(`<div class="ins">✨ ${esc(i.request)}</div>`);
    if (i.comment) rows.push(`<div class="ins">💬 ${esc(i.comment)}</div>`);
    return rows.join('');
  }

  // ---------------- pages ----------------
  function Login() {
    return `<div class="admin-login"><div class="card" style="padding:28px;width:min(420px,calc(100% - 32px))">${UI.logo('Admin')}
      <p class="small muted" style="margin:14px 0 4px">Kitchen & publisher console</p>
      <div id="auth-box"></div></div></div>`;
  }
  const AUTH_CFG = () => ({ forced: !!(api.session && api.session.mustChange), signup: null,
    note: '<p class="tiny muted" style="margin-top:16px;text-align:center">Staff accounts are created by the owner under <b>Staff & access</b>.</p>' });
  function showTemp(title, email, temp, who) {
    const el = sheet(`<h2 style="font-size:22px">${title}</h2><p class="small muted" style="margin:6px 0 14px">Share these with ${esc(who)} privately. They'll be asked to choose their own password at first login. This password is shown only once.</p>
      <div class="card" style="padding:14px"><div class="kv"><span class="muted">Email</span><b>${esc(email)}</b></div><div class="kv"><span class="muted">Temporary password</span><b style="font-family:monospace;font-size:17px">${esc(temp)}</b></div></div>
      <div class="row" style="margin-top:16px;justify-content:flex-end"><button class="btn btn-ghost" data-x="copy">Copy</button><button class="btn btn-primary" data-x="done">Done</button></div>`, { modal: true });
    el.addEventListener('click', (e) => { const b = e.target.closest('[data-x]'); if (!b) return; if (b.dataset.x === 'copy') { navigator.clipboard.writeText(`Email: ${email}\nTemporary password: ${temp}`).then(() => toast('Copied ✓'), () => toast('Copy failed — select the text instead')); } else closeSheet(); });
  }
  function passwordModal() {
    formModal(`<h2 style="font-size:24px;margin-bottom:6px">Change my password</h2><p class="small muted" style="margin-bottom:14px">Other devices will be signed out.</p><div class="col" style="gap:12px">
      <div class="field"><label>Current password</label><input class="input" type="password" name="current" autocomplete="current-password" required autofocus></div>
      <div class="field"><label>New password</label><input class="input" type="password" name="next" autocomplete="new-password" required><span class="tiny muted">At least 8 characters, with a letter and a number</span></div>
      <div class="field"><label>Confirm new password</label><input class="input" type="password" name="confirm" autocomplete="new-password" required></div></div>`,
    async (f) => { if (f.get('next') !== f.get('confirm')) { toast('The new passwords don\'t match'); return false; } try { await api.auth.changePassword(f.get('current'), f.get('next')); toast('Password updated ✓'); return true; } catch (e) { toast(e.message, 3200); return false; } });
  }

  function Dashboard() {
    const db = api.db; const today = db.orders.filter((o) => isToday(o.createdAt) && o.status !== 'cancelled');
    const days = [...Array(7)].map((_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (6 - i)); return d; });
    const rev = days.map((d) => db.orders.filter((o) => o.status !== 'cancelled' && new Date(o.createdAt).toDateString() === d.toDateString()).reduce((a, o) => a + o.total, 0));
    const max = Math.max(...rev, 1); const week = rev.reduce((a, b) => a + b, 0);
    const rated = db.orders.filter((o) => o.rating); const avg = rated.length ? (rated.reduce((a, o) => a + o.rating, 0) / rated.length).toFixed(2) : '—';
    const dishCount = {}; db.orders.filter((o) => Date.now() - o.createdAt < 7 * 864e5 && o.status !== 'cancelled').forEach((o) => o.items.forEach((i) => { dishCount[i.name] = (dishCount[i.name] || 0) + i.qty; }));
    const top = Object.entries(dishCount).sort((a, b) => b[1] - a[1]).slice(0, 6); const topMax = top.length ? top[0][1] : 1;
    const next = FP.addWeeks(FP.weekKey(), 1); const nm = api.menu(next); const cur = api.menu(FP.weekKey());
    const kpi = (l, v, d, tone = 'var(--pine)') => `<div class="card kpi"><div class="l">${l}</div><div class="v">${v}</div><div class="d" style="color:${tone}">${d}</div></div>`;
    const refs = db.customers.filter((c) => c.referredBy);
    return `
      ${!cur || cur.status !== 'published' ? `<div class="alert warn" style="margin-bottom:16px">⚠ This week's menu isn't published — customers can't order. <a class="link" href="#/menu">Publish now →</a></div>` : ''}
      ${!nm || nm.status !== 'published' ? `<div class="alert warn" style="margin-bottom:16px">🗓 Next week's menu (${FP.weekLabel(next)}) is ${nm ? 'still a draft' : 'not started'}. Publish it before Sunday so customers can pre-order. <a class="link" href="#/menu/${next}" style="margin-left:auto">Open planner →</a></div>` : `<div class="alert ok" style="margin-bottom:16px">✅ Next week's menu is published and visible to customers.</div>`}
      <div class="kpis">
        ${kpi("Today's orders", today.length, `${live().length} in progress`)}
        ${kpi("Today's revenue", money(today.reduce((a, o) => a + o.total, 0)), `AOV ${money(today.length ? today.reduce((a, o) => a + o.total, 0) / today.length : 0)}`)}
        ${kpi('7-day revenue', money(week), `${db.orders.filter((o) => Date.now() - o.createdAt < 7 * 864e5).length} orders`)}
        ${kpi('Partners online', db.riders.filter((r) => r.online).length + ' / ' + db.riders.length, `${db.orders.filter((o) => o.status === 'out').length} on the road`)}
        ${kpi('Referral sign-ups', refs.length, `${refs.filter((c) => c.referralQualified).length} ordered · ${db.customers.reduce((a, c) => a + ((c.rewards || {}).used || 0), 0)} free meals used`)}
        ${kpi('Avg rating', avg + ' ★', `${rated.length} reviews`, 'var(--mustard-deep)')}
      </div>
      <div class="grid2">
        <div class="card panel"><div class="row between"><h3>Revenue · last 7 days</h3><span class="badge b-sage">${money(week)}</span></div>
          <div class="chart">${rev.map((v, i) => `<div class="c ${i === 6 ? 'today' : ''}" title="${money(v)}"><em>${v ? '₹' + (v / 1000).toFixed(1) + 'k' : ''}</em><i style="height:${(v / max) * 100}%"></i><small>${days[i].toLocaleDateString('en-IN', { weekday: 'short' })}</small></div>`).join('')}</div></div>
        <div class="card panel"><h3>Top dishes this week</h3>${top.map(([n, c]) => `<div class="hbar"><span class="t ellipsis">${esc(n)}</span><span class="b"><span style="width:${(c / topMax) * 100}%"></span></span><b>${c}</b></div>`).join('') || '<p class="muted">No orders yet.</p>'}</div>
      </div>
      <div class="card panel" style="margin-top:16px"><div class="row between"><h3>Recent orders</h3><a class="link small" href="#/orders">Open live board →</a></div>
        <div class="tbl-wrap"><table class="table"><thead><tr><th>Order</th><th>Customer</th><th>Pet</th><th>Items</th><th>Area</th><th>Total</th><th>Status</th><th>Placed</th></tr></thead><tbody>
        ${db.orders.slice().sort((a, b) => b.createdAt - a.createdAt).slice(0, 8).map((o) => `<tr><td><b>#${o.id}</b></td><td>${esc(o.customerName)}</td><td>${esc(petLabel(o))}</td><td class="small">${o.items.map((i) => `${esc(i.name)} ×${i.qty}`).join(', ')}</td><td>${esc(o.address.area)}</td><td><b>${money(o.total)}</b>${o.freeMeal ? ' <span class="badge b-mustard">🎁</span>' : ''}</td><td>${statusBadge(o)}</td><td class="small muted">${timeAgo(o.createdAt)}</td></tr>`).join('')}
        </tbody></table></div></div>`;
  }

  function Orders() {
    const db = api.db;
    const lanes = [['placed', 'New', '🧾'], ['cooking', 'Cooking', '🧑‍🍳'], ['ready', 'Ready for pickup', '📦'], ['out', 'Out for delivery', '🛵'], ['delivered', 'Delivered today', '✅']];
    const riderOpts = (o) => `<select data-onchange="assign" data-id="${o.id}"><option value="">${o.riderId ? 'Unassign' : 'Assign partner…'}</option>${db.riders.map((r) => { const busy = db.orders.some((x) => x.riderId === r.id && x.id !== o.id && ['placed', 'cooking', 'ready', 'out'].includes(x.status)); return `<option value="${r.id}" ${o.riderId === r.id ? 'selected' : ''} ${busy && o.riderId !== r.id ? 'disabled' : ''}>${esc(r.name)} ${r.online ? '· online' : '· offline'}${busy ? ' · busy' : ''}</option>`; }).join('')}</select>`;
    const card = (o) => {
      const r = o.riderId && api.rider(o.riderId); const isNew = o.status === 'placed' && Date.now() - o.createdAt < 5 * 6e4;
      const action = { placed: `<button class="btn btn-primary btn-sm grow" data-act="advance" data-id="${o.id}">Accept & cook</button><button class="btn btn-danger btn-sm" data-act="cancel" data-id="${o.id}">Reject</button>`, cooking: `<button class="btn btn-primary btn-sm grow" data-act="advance" data-id="${o.id}">Mark packed</button>` }[o.status];
      return `<div class="card ocard ${isNew ? 'new' : ''}">
        <div class="row between"><b>#${o.id}</b><span class="tiny muted">${timeAgo(o.createdAt)}</span></div>
        <div class="small semibold">${esc(o.customerName)} · ${esc(petLabel(o))}</div>
        <div class="tiny muted">${esc(o.address.area)} · ${o.address.km} km · ${esc(o.slot)}</div>
        <div class="items">${o.items.map((i) => `<div class="row" style="gap:6px">${vmark(i.diet)} ${esc(i.name)} <span class="faint">${esc(i.portion)}</span> <b style="margin-left:auto">×${i.qty}</b></div>`).join('')}</div>
        ${o.status !== 'delivered' ? insBlock(o) : ''}
        <div class="row between" style="margin-top:8px"><b>${money(o.total)}${o.freeMeal ? ' <span class="badge b-mustard">🎁 free meal</span>' : ''}</b><span class="tiny muted">${esc(o.payment)}</span></div>
        ${o.status !== 'delivered' ? `<div style="margin-top:10px">${o.status === 'out' ? `<div class="small">🛵 <b>${esc(r ? r.name : '—')}</b> · OTP ${o.otp}</div>` : riderOpts(o)}</div>` : r ? `<div class="tiny muted" style="margin-top:6px">by ${esc(r.name)} · ${fmtTime(o.timeline[o.timeline.length - 1].at)}</div>` : ''}
        ${o.status === 'ready' && r ? `<div class="tiny muted" style="margin-top:6px">Waiting for ${esc(r.name.split(' ')[0])} to pick up</div>` : ''}
        ${o.status === 'ready' && !r ? `<div class="tiny" style="margin-top:6px;color:var(--mustard-deep);font-weight:800">Broadcasting to online partners…</div>` : ''}
        ${action ? `<div class="row" style="margin-top:10px">${action}</div>` : ''}</div>`;
    };
    return `<div class="toolbar"><span class="small muted">Orders flow left → right. Allergies, customizations and special requests from checkout show on each card. Partners see “Cooking” and “Ready” orders as delivery requests.</span></div>
      <div class="kanban">${lanes.map(([s, l, e]) => { const list = db.orders.filter((o) => o.status === s && (s !== 'delivered' || isToday(o.timeline[o.timeline.length - 1].at))).sort((a, b) => (s === 'delivered' ? b.createdAt - a.createdAt : a.createdAt - b.createdAt)); return `<div class="lane"><div class="lane-h"><span>${e} ${l}</span><span class="n">${list.length}</span></div>${list.map(card).join('') || '<div class="empty small" style="padding:30px 10px">Nothing here</div>'}</div>`; }).join('')}</div>`;
  }

  function Menu(weekArg) {
    if (weekArg && weekArg !== S.week) { S.week = weekArg; S.draft = null; }
    if (S.draftWeek !== S.week || !S.draft) { const m = api.menu(S.week); S.draft = JSON.parse(JSON.stringify(m || FP.emptyMenu())); S.draftWeek = S.week; S.dirty = false; }
    const m = api.menu(S.week); const d = S.draft; const recipes = api.db.recipes.filter((r) => r.course === 'meal');
    const cols = [['morning', 'nonveg', '☀️ Morning · Non-veg'], ['morning', 'veg', '☀️ Morning · Veg'], ['evening', 'nonveg', '🌙 Evening · Non-veg'], ['evening', 'veg', '🌙 Evening · Veg']];
    const filled = DAYS.reduce((a, day) => a + cols.filter(([s, k]) => d.days[day][s][k]).length, 0);
    const isCur = S.week === FP.weekKey(); const past = FP.weekStart(S.week) < FP.weekStart(FP.weekKey());
    const st = m ? m.status : 'none';
    const cell = (day, slot, k) => { const id = d.days[day][slot][k]; const r = id && api.recipe(id); return `<div class="cell">${r ? foodArt(r, 40) : '<div class="food" style="width:40px;height:40px;background:var(--cream-soft);border:1.5px dashed var(--line)"></div>'}<select class="${id ? '' : 'empty'}" data-onchange="cell" data-day="${day}" data-slot="${slot}" data-k="${k}" ${past ? 'disabled' : ''} aria-label="${DAY_NAMES[day]} ${slot} ${k}"><option value="">— Choose dish —</option>${recipes.filter((x) => fitsSlot(x, k)).map((x) => `<option value="${x.id}" ${x.id === id ? 'selected' : ''}>${esc(x.name)}${x.available ? '' : ' (unavailable)'}</option>`).join('')}</select></div>`; };
    return `
      <div class="card panel" style="margin-bottom:16px"><div class="row between wrap" style="gap:14px">
        <div class="week-nav"><button class="icon-btn" data-act="wk" data-d="-1" aria-label="Previous week">${icons.back}</button><div><div class="eyebrow">${S.week}${isCur ? ' · this week' : past ? ' · past' : ''}</div><h2 style="font-size:24px">${FP.weekLabel(S.week)}</h2></div><button class="icon-btn" data-act="wk" data-d="1" aria-label="Next week">${icons.chev}</button>${!isCur ? `<button class="btn btn-ghost btn-sm" data-act="wk" data-d="0">Today</button>` : ''}</div>
        <div class="row wrap">
          <span class="status-pill ${st === 'published' ? 'pub' : st === 'draft' ? 'draft' : 'none'}"><span class="dot"></span>${st === 'published' ? `Published ${m.publishedAt ? fmtDay(m.publishedAt) : ''}` : st === 'draft' ? 'Draft' : 'Not created'}</span>
          ${S.dirty ? '<span class="dirty">● Unsaved changes</span>' : ''}
          <span class="small muted">${filled}/28 slots filled</span>
        </div></div>
        <div class="row wrap" style="margin-top:14px">
          ${past ? '<span class="small muted">Past weeks are read-only.</span>' : `
          <button class="btn btn-ghost btn-sm" data-act="copy-prev">⧉ Copy previous week</button>
          <button class="btn btn-ghost btn-sm" data-act="shuffle">🔀 Auto-fill & rotate</button>
          <button class="btn btn-ghost btn-sm" data-act="clear-menu">Clear</button>
          <span class="grow"></span>
          <button class="btn btn-ghost" data-act="save-menu" ${S.dirty ? '' : 'disabled'}>Save ${st === 'published' ? 'changes' : 'draft'}</button>
          ${st === 'published' ? `<button class="btn btn-danger" data-act="unpublish">Unpublish</button>` : ''}
          <button class="btn btn-primary" data-act="publish" ${st === 'published' && !S.dirty ? 'disabled' : ''}>${st === 'published' ? 'Publish changes' : '🚀 Publish to customers'}</button>`}
        </div>
        <div class="field" style="margin-top:14px"><label>Announcement shown on the customer menu (optional)</label><input class="input" id="menu-note" data-oninput="note" value="${esc(d.note || '')}" placeholder="e.g. Diwali week special — extra paneer & pumpkin bowls 🪔" ${past ? 'disabled' : ''}></div>
      </div>
      <div class="tbl-wrap"><table class="planner"><thead><tr><th>Day</th>${cols.map((c) => `<th>${c[2]}</th>`).join('')}</tr></thead><tbody>
        ${DAYS.map((day) => { const dt = FP.dateOf(S.week, day); const tdy = dt.toDateString() === new Date().toDateString(); return `<tr class="${tdy ? 'today' : ''}"><td><b>${DAY_NAMES[day]}</b><div class="small muted">${dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</div>${tdy ? '<span class="badge b-mustard">Today</span>' : ''}</td>${cols.map(([s, k]) => `<td>${cell(day, s, k)}</td>`).join('')}</tr>`; }).join('')}
      </tbody></table></div>
      <p class="small muted" style="margin-top:8px">Tip: non-veg bowls follow the 50/25/20/5 protein–carb–veg–fat split; veg bowls 30/30/30/10. Egg bowls appear under veg with an amber marker.</p>`;
  }

  function Recipes() {
    const q = S.rq.toLowerCase();
    const list = api.db.recipes.filter((r) => (S.rdiet === 'all' || (S.rdiet === 'treat' ? r.course !== 'meal' : r.diet === S.rdiet && r.course === 'meal')) && (!q || (r.name + r.ingredients).toLowerCase().includes(q)));
    const m = api.menu(FP.weekKey());
    const usage = (id) => (m ? DAYS.reduce((a, d) => a + FP.SLOTS.filter((s) => m.days[d][s].nonveg === id || m.days[d][s].veg === id).length, 0) : 0);
    return `<div class="toolbar"><input class="input" placeholder="Search recipes or ingredients" data-oninput="rq" value="${esc(S.rq)}" id="rq">
      <div class="seg" style="width:auto">${[['all', 'All'], ['nonveg', 'Non-veg'], ['veg', 'Veg'], ['egg', 'Egg'], ['treat', 'Treats & add-ons']].map(([v, l]) => `<button data-act="rdiet" data-v="${v}" class="${S.rdiet === v ? 'on' : ''}">${l}</button>`).join('')}</div>
      <span class="grow"></span><button class="btn btn-primary" data-act="new-recipe">${icons.plus} New recipe</button></div>
      <div class="grid3">${list.map((r) => `<div class="card rcard ${r.available ? '' : 'off'}">${foodArt(r, 78)}<div class="grow" style="min-width:0">
        <div class="row" style="gap:6px">${vmark(r.diet)}<b class="ellipsis">${esc(r.name)}</b></div>
        <div class="tiny muted" style="margin:3px 0 6px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(r.ingredients)}</div>
        <div class="row wrap" style="gap:4px"><b>${money(r.price)}</b><span class="tiny muted">· ${r.kcal} kcal · ★ ${r.rating}</span></div>
        <div class="row wrap" style="gap:4px;margin-top:6px">${r.species.map((s) => `<span class="badge b-line">${s === 'cat' ? '🐱' : '🐶'} ${s}</span>`).join('')}${r.course !== 'meal' ? `<span class="badge b-mustard">${r.course}</span>` : ''}${usage(r.id) ? `<span class="badge b-sage">${usage(r.id)}× this week</span>` : ''}</div>
        <div class="row" style="margin-top:10px"><button class="btn btn-ghost btn-sm" data-act="edit-recipe" data-id="${r.id}">${icons.edit} Edit</button><button class="btn btn-sm ${r.available ? 'btn-ghost' : 'btn-mustard'}" data-act="toggle-recipe" data-id="${r.id}">${r.available ? 'Mark sold out' : 'Make available'}</button></div>
      </div></div>`).join('') || '<div class="empty">No recipes match.</div>'}</div>`;
  }

  function Riders() {
    const db = api.db; const apps = db.riders.filter((r) => r.status === 'pending'); const inactive = db.riders.filter((r) => ['rejected', 'suspended'].includes(r.status));
    const appCard = (r) => `<div class="card rider-card" style="border:1.5px solid var(--mustard)"><div class="row"><span class="avatar" style="background:var(--mustard)">${esc(r.name[0])}</span><div class="grow"><b>${esc(r.name)}</b><div class="small muted">${esc(r.email || '')}</div></div><span class="badge b-mustard">New application</span></div>
        <div class="divider"></div>
        <div class="kv"><span class="muted">Mobile</span><span>+91 ${esc(r.phone)}</span></div><div class="kv"><span class="muted">Vehicle</span><span class="small semibold">${esc(r.vehicle)}</span></div>
        <div class="kv"><span class="muted">Licence</span><span>${esc(r.licence || '—')}</span></div><div class="kv"><span class="muted">Preferred area</span><span>${esc(r.area || '—')}</span></div>
        <div class="kv"><span class="muted">Applied</span><span>${r.appliedAt ? timeAgo(r.appliedAt) : '—'}</span></div>
        ${isManager() ? `<div class="row" style="margin-top:12px"><button class="btn btn-primary btn-sm grow" data-act="rider-status" data-id="${r.id}" data-v="approved">✓ Approve</button><button class="btn btn-danger btn-sm" data-act="rider-status" data-id="${r.id}" data-v="rejected">Reject</button></div>` : '<p class="tiny muted" style="margin-top:10px">A manager or owner can approve this.</p>'}</div>`;
    return `${apps.length ? `<h3 style="margin-bottom:10px">📝 Applications waiting (${apps.length})</h3><div class="grid3" style="margin-bottom:24px">${apps.map(appCard).join('')}</div>` : ''}
      <div class="toolbar"><span class="small muted">Partners log in to the partner app with their email and password. New partners can apply from the app, or you can add them here.</span><span class="grow"></span>${isManager() ? `<button class="btn btn-primary" data-act="new-rider">${icons.plus} Add partner</button>` : ''}</div>
      <div class="grid3">${db.riders.filter((r) => (r.status || 'approved') === 'approved').map((r) => {
      const active = db.orders.find((o) => o.riderId === r.id && ['placed', 'cooking', 'ready', 'out'].includes(o.status));
      const done = db.orders.filter((o) => o.riderId === r.id && o.status === 'delivered');
      const today = done.filter((o) => isToday(o.timeline[o.timeline.length - 1].at));
      const st = active ? ['On a delivery', 'var(--mustard)'] : r.online ? ['Online · idle', 'var(--veg)'] : ['Offline', 'var(--ink-faint)'];
      return `<div class="card rider-card"><div class="row"><span class="avatar">${esc(r.name[0])}</span><div class="grow"><b>${esc(r.name)}</b><div class="small muted">+91 ${esc(r.phone)}</div></div><span class="row small semibold"><span class="on-dot" style="background:${st[1]}"></span>${st[0]}</span></div>
        <div class="divider"></div>
        <div class="kv"><span class="muted">Vehicle</span><span class="small semibold">${esc(r.vehicle)}</span></div>
        <div class="kv"><span class="muted">Today</span><b>${today.length} trips · ${money(today.reduce((a, o) => a + o.riderPay + (o.tip || 0), 0))}</b></div>
        <div class="kv"><span class="muted">All time</span><b>${done.length} trips</b></div>
        <div class="kv"><span class="muted">Rating</span><b>${r.rating} ★</b></div>
        ${active ? `<div class="alert warn" style="margin-top:10px;padding:10px 12px;font-size:13px">#${active.id} → ${esc(active.address.area)} · ${FP.STATUS[active.status].short}</div>` : ''}
        <div class="kv"><span class="muted">Login</span><span class="small">${r.hasLogin ? esc(r.email || '') : '<span class="badge b-line">No login</span>'}</span></div>
        <div class="row wrap" style="margin-top:10px"><button class="btn btn-ghost btn-sm grow" data-act="rider-toggle" data-id="${r.id}">${r.online ? 'Set offline' : 'Set online'}</button>
        ${isManager() ? `${r.hasLogin ? `<button class="btn btn-ghost btn-sm" data-act="reset-pw" data-role="rider" data-id="${r.id}" data-name="${esc(r.name)}">Reset password</button>` : ''}<button class="btn btn-ghost btn-sm" data-act="rider-status" data-id="${r.id}" data-v="suspended">Pause</button>` : ''}</div></div>`;
    }).join('')}</div>
      ${inactive.length ? `<h3 style="margin:24px 0 10px">Paused & rejected</h3><div class="card panel"><table class="table"><tbody>${inactive.map((r) => `<tr><td><b>${esc(r.name)}</b><div class="tiny muted">${esc(r.email || '')} · +91 ${esc(r.phone)}</div></td><td><span class="badge ${r.status === 'rejected' ? 'b-danger' : 'b-mustard'}">${r.status}</span>${r.statusReason ? `<div class="tiny muted">${esc(r.statusReason)}</div>` : ''}</td><td style="text-align:right">${isManager() ? `<button class="btn btn-ghost btn-sm" data-act="rider-status" data-id="${r.id}" data-v="approved">${r.status === 'rejected' ? 'Approve' : 'Reactivate'}</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : ''}`;
  }

  const VET_SPECIALTIES = ['Dogs', 'Cats', 'Nutrition', 'Vaccination', 'Skin & allergy', 'Surgery', 'Dental', 'Emergency 24×7'];
  const VET_MODES = { clinic: '🏥 At clinic', home: '🏠 Home visit', video: '📹 Video call' };
  const REQ_STATUS = { new: ['New', 'b-mustard'], contacted: ['Contacted', 'b-info'], booked: ['Booked', 'b-sage'], closed: ['Closed', 'b-line'] };
  function Vets() {
    const db = api.db; const vets = db.vets || []; const reqs = (db.vetRequests || []).slice().sort((a, b) => b.createdAt - a.createdAt);
    const open = reqs.filter((r) => r.status === 'new').length; const month = reqs.filter((r) => Date.now() - r.createdAt < 30 * 864e5);
    const kpi = (l, v, d) => `<div class="card kpi"><div class="l">${l}</div><div class="v">${v}</div><div class="d" style="color:var(--pine)">${d}</div></div>`;
    const expiring = (v) => v.contractEnd && (new Date(v.contractEnd) - Date.now()) < 30 * 864e5;
    return `<div class="alert ok" style="margin-bottom:16px">🩺 <span>Partner vets appear in the customer app under <b>Account → Vet care</b>. Pet parents see the clinic, fee and FoodPeto discount and can request a consultation — requests land here for your team to follow up.</span></div>
      <div class="kpis">${kpi('Active partners', vets.filter((v) => v.status === 'active').length, `${vets.filter((v) => v.status === 'active' && v.visible).length} shown to customers`)}${kpi('New requests', open, 'waiting for a call back')}${kpi('Requests (30 days)', month.length, `${month.filter((r) => r.status === 'booked').length} booked`)}${kpi('Avg customer discount', vets.length ? Math.round(vets.reduce((a, v) => a + v.discountPct, 0) / vets.length) + '%' : '—', 'on consultation fees')}</div>
      <div class="card panel" style="margin-top:16px"><div class="row between"><h3>Consultation requests</h3><span class="small muted">Call the pet parent, then update the status</span></div>
        <div class="tbl-wrap"><table class="table"><thead><tr><th>Pet parent</th><th>Pet</th><th>Vet</th><th>Visit</th><th>Message</th><th>Requested</th><th>Status</th></tr></thead><tbody>
        ${reqs.map((r) => `<tr><td><b>${esc(r.customerName)}</b><div class="tiny muted"><a class="link" href="tel:+91${esc(r.phone)}">+91 ${esc(r.phone)}</a></div></td><td>${r.petSpecies === 'cat' ? '🐱' : '🐶'} ${esc(r.petName)}<div class="tiny muted">${esc(r.petBreed || '')}</div></td>
          <td class="small"><b>${esc(r.vetName)}</b><div class="tiny muted">${esc(r.clinic)}</div></td><td class="small">${VET_MODES[r.mode] || esc(r.mode)}${r.preferred ? `<div class="tiny muted">${esc(r.preferred)}</div>` : ''}</td>
          <td class="small" style="max-width:260px">${esc(r.message)}</td><td class="small muted">${timeAgo(r.createdAt)}</td>
          <td><select class="input" style="padding:6px 8px;width:auto" data-onchange="vet-req" data-id="${r.id}" aria-label="Status">${Object.entries(REQ_STATUS).map(([k, [l]]) => `<option value="${k}" ${r.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select></td></tr>`).join('') || '<tr><td colspan="7" class="muted">No requests yet.</td></tr>'}
        </tbody></table></div></div>
      <div class="toolbar" style="margin-top:22px"><h3 style="margin:0">Partner vets</h3><span class="grow"></span><button class="btn btn-primary" data-act="new-vet">${icons.plus} Add vet partner</button></div>
      <div class="grid3">${vets.map((v) => `<div class="card rider-card" style="${v.status === 'paused' ? 'opacity:.6' : ''}">
        <div class="row"><span class="avatar" style="background:var(--sage);color:var(--pine)">🩺</span><div class="grow"><b>${esc(v.name)}</b><div class="small muted">${esc(v.clinic)}</div></div>
          <span class="badge ${v.status === 'active' ? (v.visible ? 'b-sage' : 'b-line') : 'b-mustard'}">${v.status === 'active' ? (v.visible ? 'Live' : 'Hidden') : 'Paused'}</span></div>
        <div class="row wrap" style="gap:4px;margin-top:8px">${v.specialties.map((s) => `<span class="badge b-line">${esc(s)}</span>`).join('')}</div>
        <div class="divider"></div>
        <div class="kv"><span class="muted">Area</span><span>${esc(v.area || '—')}</span></div>
        <div class="kv"><span class="muted">Phone</span><a class="link" href="tel:+91${esc(v.phone)}">+91 ${esc(v.phone)}</a></div>
        <div class="kv"><span class="muted">Visits</span><span class="small">${v.modes.map((m) => VET_MODES[m]).join(' · ')}</span></div>
        <div class="kv"><span class="muted">Fee · customer discount</span><b>${money(v.consultFee)} · ${v.discountPct}% off</b></div>
        <div class="kv"><span class="muted">FoodPeto commission</span><b>${v.commissionPct}%</b></div>
        <div class="kv"><span class="muted">Contract</span><span class="small ${expiring(v) ? '' : 'muted'}" style="${expiring(v) ? 'color:var(--danger);font-weight:800' : ''}">${esc(v.partnerSince || '?')} → ${esc(v.contractEnd || 'open')}${expiring(v) ? ' · renew soon' : ''}</span></div>
        <div class="kv"><span class="muted">Requests</span><span>${reqs.filter((r) => r.vetId === v.id).length} total · ${reqs.filter((r) => r.vetId === v.id && r.status === 'booked').length} booked</span></div>
        ${v.notes ? `<div class="tiny muted" style="margin-top:6px">📝 ${esc(v.notes)}</div>` : ''}
        <div class="row wrap" style="margin-top:10px"><button class="btn btn-ghost btn-sm" data-act="edit-vet" data-id="${v.id}">${icons.edit} Edit</button>
          <button class="btn btn-ghost btn-sm" data-act="vet-toggle" data-id="${v.id}" data-k="visible">${v.visible ? 'Hide from app' : 'Show in app'}</button>
          <button class="btn btn-ghost btn-sm" data-act="vet-toggle" data-id="${v.id}" data-k="status">${v.status === 'active' ? 'Pause' : 'Activate'}</button>
          <button class="btn btn-ghost btn-sm" data-act="del-vet" data-id="${v.id}" data-name="${esc(v.name)}" aria-label="Remove ${esc(v.name)}">${icons.trash}</button></div></div>`).join('') || '<div class="empty">No vet partners yet — add your first one.</div>'}</div>`;
  }
  function vetModal(id) {
    const v = (api.db.vets || []).find((x) => x.id === id) || { id: '', name: '', clinic: '', phone: '', email: '', area: '', address: '', specialties: ['Dogs', 'Cats'], modes: ['clinic'], consultFee: 500, discountPct: 10, commissionPct: 10, partnerSince: new Date().toISOString().slice(0, 10), contractEnd: '', hours: '', notes: '', status: 'active', visible: true };
    formModal(`<h2 style="font-size:24px;margin-bottom:14px">${id ? 'Edit vet partner' : 'Add vet partner'}</h2><div class="form-grid">
      <div class="field"><label>Vet's name *</label><input class="input" name="name" value="${esc(v.name)}" required autofocus placeholder="Dr. …"></div>
      <div class="field"><label>Clinic / practice *</label><input class="input" name="clinic" value="${esc(v.clinic)}" required></div>
      <div class="field"><label>Mobile *</label><input class="input" name="phone" value="${esc(v.phone)}" inputmode="numeric" maxlength="10" required></div>
      <div class="field"><label>Email</label><input class="input" type="email" name="email" value="${esc(v.email)}"></div>
      <div class="field"><label>Area</label><input class="input" name="area" value="${esc(v.area)}" placeholder="e.g. Malviya Nagar"></div>
      <div class="field"><label>Opening hours</label><input class="input" name="hours" value="${esc(v.hours)}" placeholder="e.g. Mon–Sat · 10 AM – 8 PM"></div>
      <div class="field full"><label>Clinic address</label><input class="input" name="address" value="${esc(v.address)}"></div>
      <div class="field full"><label>Specialties</label><div class="row wrap">${VET_SPECIALTIES.map((s) => `<label class="chip"><input type="checkbox" name="sp" value="${esc(s)}" ${v.specialties.includes(s) ? 'checked' : ''}> ${esc(s)}</label>`).join('')}</div></div>
      <div class="field full"><label>Consultation types</label><div class="row wrap">${Object.entries(VET_MODES).map(([k, l]) => `<label class="chip"><input type="checkbox" name="md" value="${k}" ${v.modes.includes(k) ? 'checked' : ''}> ${l}</label>`).join('')}</div></div>
      <div class="field"><label>Consultation fee (₹)</label><input class="input" type="number" min="0" name="consultFee" value="${v.consultFee}"></div>
      <div class="field"><label>Discount for FoodPeto customers (%)</label><input class="input" type="number" min="0" max="100" name="discountPct" value="${v.discountPct}"></div>
      <div class="field"><label>FoodPeto commission (%)</label><input class="input" type="number" min="0" max="100" name="commissionPct" value="${v.commissionPct}"><span class="tiny muted">Private — never shown to customers</span></div>
      <div class="field"><label>Status</label><select class="input" name="status"><option value="active" ${v.status === 'active' ? 'selected' : ''}>Active</option><option value="paused" ${v.status === 'paused' ? 'selected' : ''}>Paused</option></select></div>
      <div class="field"><label>Partner since</label><input class="input" type="date" name="partnerSince" value="${esc(v.partnerSince)}"></div>
      <div class="field"><label>Contract ends</label><input class="input" type="date" name="contractEnd" value="${esc(v.contractEnd)}"></div>
      <div class="field full"><label class="row" style="gap:8px"><input type="checkbox" name="visible" ${v.visible ? 'checked' : ''}> Show this vet to customers in the app</label></div>
      <div class="field full"><label>Internal notes</label><textarea class="input" name="notes" placeholder="Agreement terms, contact person… (staff only)">${esc(v.notes)}</textarea></div></div>`,
    async (f) => {
      const d = Object.fromEntries(f);
      const ok = await api.call('saveVet', { ...d, id: v.id, specialties: f.getAll('sp'), modes: f.getAll('md'), visible: f.get('visible') === 'on' });
      if (ok) toast(id ? 'Vet partner updated' : 'Vet partner added 🩺'); return !!ok;
    });
  }
  function Staff() {
    const db = api.db; const meId = api.session.staffId;
    return `<div class="toolbar"><span class="small muted">Everyone who uses this console gets their own login. New staff receive a temporary password and choose their own when they first sign in.</span><span class="grow"></span><button class="btn btn-primary" data-act="new-staff">${icons.plus} Add staff</button></div>
      <div class="card panel"><div class="tbl-wrap"><table class="table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Last sign-in</th><th></th></tr></thead><tbody>
      ${db.staff.map((s) => `<tr><td><b>${esc(s.name)}</b>${s.id === meId ? ' <span class="badge b-sage">You</span>' : ''}</td><td class="small">${esc(s.email)}</td>
        <td><select class="input" style="padding:7px 10px;width:auto" data-onchange="staff-role" data-id="${s.id}" aria-label="Role for ${esc(s.name)}">${['owner', 'manager', 'kitchen'].map((r) => `<option value="${r}" ${s.role === r ? 'selected' : ''}>${r[0].toUpperCase() + r.slice(1)}</option>`).join('')}</select></td>
        <td>${s.active ? '<span class="badge b-sage">Active</span>' : '<span class="badge b-danger">Deactivated</span>'}</td>
        <td class="small muted">${s.lastLoginAt ? timeAgo(s.lastLoginAt) : 'Never'}</td>
        <td style="text-align:right;white-space:nowrap"><button class="btn btn-ghost btn-sm" data-act="staff-reset" data-id="${s.id}" data-name="${esc(s.name)}">Reset password</button>
          ${s.id !== meId ? `<button class="btn btn-sm ${s.active ? 'btn-danger' : 'btn-ghost'}" data-act="staff-active" data-id="${s.id}" data-v="${s.active ? '0' : '1'}">${s.active ? 'Deactivate' : 'Reactivate'}</button><button class="btn btn-ghost btn-sm" data-act="staff-remove" data-id="${s.id}" data-name="${esc(s.name)}" aria-label="Remove ${esc(s.name)}">${icons.trash}</button>` : ''}</td></tr>`).join('')}
      </tbody></table></div></div>
      <div class="card panel" style="margin-top:16px"><h3>Roles</h3>${Object.entries(ROLE_INFO).map(([r, d]) => `<div class="kv"><b style="text-transform:capitalize">${r}</b><span class="muted">${d}</span></div>`).join('')}</div>`;
  }

  function Referrals() {
    const db = api.db; const P = per();
    const rows = db.customers.filter((c) => c.referralCount || c.referralPending || (c.rewards && c.rewards.earned)).sort((a, b) => (b.referralCount || 0) - (a.referralCount || 0));
    const referred = db.customers.filter((c) => c.referredBy);
    const earned = db.customers.reduce((a, c) => a + ((c.rewards || {}).earned || 0), 0); const used = db.customers.reduce((a, c) => a + ((c.rewards || {}).used || 0), 0);
    const freeOrders = db.orders.filter((o) => o.freeMeal); const cost = freeOrders.reduce((a, o) => a + o.freeMeal, 0);
    const kpi = (l, v, d) => `<div class="card kpi"><div class="l">${l}</div><div class="v">${v}</div><div class="d" style="color:var(--pine)">${d}</div></div>`;
    return `<div class="alert ok" style="margin-bottom:16px">🎁 <span>Every <b>${P}</b> friends who sign up with a customer's code and get their first order delivered earns that customer <b>1 free meal</b> (one bowl, up to ${money(db.settings.freeMealCap || 300)}). Change the rules in <a class="link" href="#/settings">Settings</a>.</span></div>
      <div class="kpis">${kpi('Referred sign-ups', referred.length, `${referred.filter((c) => !c.referralQualified).length} yet to order`)}${kpi('Qualified referrals', referred.filter((c) => c.referralQualified).length, 'first order delivered')}${kpi('Free meals earned', earned, `${earned - used} unused`)}${kpi('Free meals redeemed', used, `${money(cost)} in rewards`)}</div>
      <div class="card panel" style="margin-top:16px"><h3>Top referrers</h3><div class="tbl-wrap"><table class="table"><thead><tr><th>Customer</th><th>Code</th><th>Friends ordered</th><th>Joined, not ordered</th><th>Progress to next</th><th>Meals earned</th><th>Used</th><th></th></tr></thead><tbody>
      ${rows.map((c) => { const n = c.referralCount || 0; const r = c.rewards || { earned: 0, used: 0 }; return `<tr><td><b>${esc(c.name)}</b><div class="tiny muted">+91 ${esc(c.phone)}</div></td><td><span class="badge b-mustard">${esc(c.referralCode || '')}</span></td><td><b>${n}</b></td><td>${c.referralPending || 0}</td>
        <td><div class="hbar" style="margin:0"><span class="b" style="min-width:90px"><span style="width:${((n % P) / P) * 100}%"></span></span><b class="small">${n % P}/${P}</b></div></td><td>${r.earned}</td><td>${r.used}</td><td><button class="btn btn-ghost btn-sm" data-act="grant" data-id="${c.id}" title="Give one free meal manually">+1 meal</button></td></tr>`; }).join('') || '<tr><td colspan="8" class="muted">No referrals yet.</td></tr>'}
      </tbody></table></div></div>
      <div class="card panel" style="margin-top:16px"><h3>Referred customers</h3><div class="tbl-wrap"><table class="table"><thead><tr><th>Customer</th><th>Referred by</th><th>Joined</th><th>Status</th></tr></thead><tbody>
      ${referred.slice().sort((a, b) => b.joined - a.joined).map((c) => { const by = api.customer(c.referredBy); return `<tr><td><b>${esc(c.name)}</b></td><td>${esc(by ? by.name : '—')}</td><td class="small">${fmtDay(c.joined)}</td><td>${c.referralQualified ? `<span class="badge b-sage">✓ Ordered ${fmtDay(c.referralQualified)}</span>` : '<span class="badge b-mustard">Joined · no delivered order</span>'}</td></tr>`; }).join('')}
      </tbody></table></div></div>`;
  }

  function Offers() {
    const db = api.db;
    return `<div class="grid2" style="margin-top:0">
      <div class="card panel"><div class="row between"><h3>Coupons</h3><button class="btn btn-primary btn-sm" data-act="new-coupon">${icons.plus} New coupon</button></div>
        <div class="tbl-wrap"><table class="table"><thead><tr><th>Code</th><th>Offer</th><th>Min order</th><th>Used</th><th>Active</th></tr></thead><tbody>
        ${db.coupons.map((c) => `<tr><td><span class="badge b-mustard">${esc(c.code)}</span></td><td class="small">${esc(c.desc)}</td><td>${c.min ? money(c.min) : '—'}</td><td>${db.orders.filter((o) => o.coupon === c.code).length}</td><td><button class="switch ${c.active ? 'on' : ''}" data-act="coupon-toggle" data-code="${esc(c.code)}" aria-label="Toggle coupon"></button></td></tr>`).join('')}
        </tbody></table></div></div>
      <div class="card panel"><h3>Home banners</h3><p class="small muted" style="margin:-6px 0 12px">Shown as the carousel on the customer home screen.</p>
        <div class="col" style="gap:12px">${db.banners.map((b) => `<div class="banner-prev ${b.tone}"><b style="font-family:var(--font-display);font-size:18px">${esc(b.title)}</b><div class="small" style="opacity:.9;max-width:70%">${esc(b.sub)}</div><span class="be">${esc(b.emoji)}</span><div class="row" style="margin-top:10px"><button class="btn btn-ghost btn-sm" data-act="edit-banner" data-id="${b.id}">${icons.edit} Edit</button><button class="btn btn-ghost btn-sm" data-act="del-banner" data-id="${b.id}" aria-label="Delete banner">${icons.trash}</button></div></div>`).join('')}
        <button class="btn btn-ghost" data-act="edit-banner" data-id="">${icons.plus} Add banner</button></div></div></div>`;
  }

  function Plans() {
    const db = api.db;
    return `<div class="grid3">${db.plans.map((p) => `<div class="card panel"><div class="row between"><span class="badge b-mustard">${esc(p.badge)}</span><button class="switch ${p.active ? 'on' : ''}" data-act="plan-toggle" data-id="${p.id}" aria-label="Toggle plan"></button></div>
      <h3 style="margin:10px 0 2px">${esc(p.name)}</h3><div class="small muted">${p.days} days · ${p.mealsPerDay} meals/day · ${esc(p.desc)}</div>
      <div class="row" style="margin-top:12px"><div class="field grow"><label>Price (₹)</label><input class="input" type="number" value="${p.price}" data-onchange="plan" data-id="${p.id}" data-k="price"></div><div class="field grow"><label>MRP (₹)</label><input class="input" type="number" value="${p.mrp}" data-onchange="plan" data-id="${p.id}" data-k="mrp"></div></div>
      <div class="small muted" style="margin-top:8px">${db.subscriptions.filter((s) => s.planId === p.id && s.status === 'active').length} active subscribers</div></div>`).join('')}</div>
      <div class="card panel" style="margin-top:16px"><h3>Subscriptions</h3><div class="tbl-wrap"><table class="table"><thead><tr><th>ID</th><th>Customer</th><th>Pet</th><th>Plan</th><th>Diet</th><th>Slot</th><th>Started</th><th>Days left</th><th>Status</th></tr></thead><tbody>
      ${db.subscriptions.slice().reverse().map((s) => { const c = api.customer(s.customerId); const p = c && c.pets.find((x) => x.id === s.petId); const pl = db.plans.find((x) => x.id === s.planId) || { name: '?', days: 0 }; const left = Math.max(0, Math.ceil((s.start + pl.days * 864e5 - Date.now()) / 864e5)); return `<tr><td><b>${s.id}</b></td><td>${esc(c ? c.name : '?')}</td><td>${p ? (p.species === 'cat' ? '🐱 ' : '🐶 ') + esc(p.name) : ''}</td><td>${esc(pl.name)}</td><td>${s.diet === 'veg' ? 'Veg' : 'Non-veg'}</td><td class="small">${esc(s.slot)}</td><td class="small">${fmtDay(s.start)}</td><td>${left}</td><td><span class="badge ${s.status === 'active' ? 'b-sage' : 'b-mustard'}">${s.status}</span></td></tr>`; }).join('')}
      </tbody></table></div></div>`;
  }

  function Customers() {
    const db = api.db;
    return `<div class="card panel"><div class="tbl-wrap"><table class="table"><thead><tr><th>Customer</th><th>Phone</th><th>Area</th><th>Pets</th><th>Allergies</th><th>Orders</th><th>Lifetime value</th><th>Referrals</th><th>Joined</th><th>Login</th></tr></thead><tbody>
      ${db.customers.map((c) => { const os = db.orders.filter((o) => o.customerId === c.id && o.status !== 'cancelled'); return `<tr><td><b>${esc(c.name)}</b>${c.referredBy ? '<div class="tiny muted">via referral</div>' : ''}</td><td class="small">+91 ${esc(c.phone)}</td><td>${esc(c.addresses[0] ? c.addresses[0].area : '')}</td>
        <td>${c.pets.map((p) => `<div class="small">${p.species === 'cat' ? '🐱' : '🐶'} <b>${esc(p.name)}</b> · ${esc(p.breed)} · ${p.ageY}y ${p.ageM}m · ${p.diet === 'veg' ? 'Veg' : p.diet === 'custom' ? 'Custom' : 'Non-veg'}</div>`).join('')}</td>
        <td>${c.pets.some((p) => p.allergies.length) ? c.pets.filter((p) => p.allergies.length).map((p) => `<span class="badge b-danger">${esc(p.name)}: ${esc(p.allergies.join(', '))}</span>`).join(' ') : '<span class="faint small">None</span>'}</td>
        <td>${os.length}</td><td><b>${money(os.reduce((a, o) => a + o.total, 0))}</b></td><td>${c.referralCount || 0}<span class="tiny muted"> · ${(c.rewards || {}).earned || 0} meals</span></td><td class="small muted">${fmtDay(c.joined)}</td>
        <td class="small">${c.hasLogin ? `${esc(c.email || '')}<div class="tiny muted">Last sign-in ${c.lastLoginAt ? timeAgo(c.lastLoginAt) : 'never'}</div><button class="link tiny" data-act="reset-pw" data-role="customer" data-id="${c.id}" data-name="${esc(c.name)}">Reset password</button>` : '<span class="faint">No login</span>'}</td></tr>`; }).join('')}
      </tbody></table></div></div>`;
  }

  function Settings() {
    const s = api.db.settings; const me = api.db.staff.find((x) => x.id === api.session.staffId) || {};
    const account = `<div class="card panel"><h3>My account</h3><div class="kv"><span class="muted">Name</span><b>${esc(me.name || '')}</b></div><div class="kv"><span class="muted">Email</span><span>${esc(me.email || api.session.email)}</span></div>
      <div class="kv"><span class="muted">Role</span><span class="badge b-sage" style="text-transform:capitalize">${esc(myRole())}</span></div>
      <div class="row" style="margin-top:12px"><button class="btn btn-ghost btn-sm" data-act="change-pw">🔒 Change password</button><button class="btn btn-ghost btn-sm" data-act="logout">${icons.logout} Sign out</button></div></div>`;
    if (!isManager()) return `<div class="grid2" style="margin-top:0">${account}<div class="card panel"><h3>Business settings</h3><p class="small muted">Only managers and the owner can change delivery fees, kitchen hours and the referral program.</p></div></div>`;
    const f = (k, l, type = 'number', hint = '') => `<div class="field"><label>${l}</label><input class="input" type="${type}" value="${esc((s[k] == null ? '' : s[k]))}" data-onchange="setting" data-k="${k}">${hint ? `<span class="tiny muted">${hint}</span>` : ''}</div>`;
    return `<div class="grid2" style="margin-top:0"><div class="card panel"><h3>Kitchen & delivery</h3>
      <div class="row between" style="padding:6px 0 14px"><div><b>Kitchen accepting orders</b><div class="small muted">Turn off to pause same-day orders (pre-orders still allowed)</div></div><button class="switch ${s.kitchenOpen ? 'on' : ''}" data-act="kitchen" aria-label="Kitchen open"></button></div>
      <div class="form-grid">${f('deliveryFee', 'Delivery fee (₹)')}${f('freeAbove', 'Free delivery above (₹)')}${f('packing', 'Packing charge (₹)')}${f('gstPct', 'GST (%)')}${f('city', 'City', 'text')}${f('phone', 'WhatsApp / support number', 'text', 'Shown to customers and partners')}<div class="full">${f('kitchen', 'Kitchen pickup address', 'text')}</div><div class="full">${f('cutoff', 'Ordering cut-off message', 'text')}</div></div></div>
      <div class="col" style="gap:16px"><div class="card panel"><h3>Referral program</h3><div class="form-grid">${f('referralsPerReward', 'Friends needed per free meal', 'number', 'A friend counts once their first order is delivered')}${f('freeMealCap', 'Free meal value cap (₹)', 'number', 'Covers one meal bowl up to this amount')}</div></div>
      ${account}
      ${myRole() === 'owner' ? `<div class="card panel"><h3>Demo data</h3><p class="small muted">Restores the sample menu, customers, partners and order history on the server for everyone. Staff accounts are kept.</p><button class="btn btn-danger" style="margin-top:12px" data-act="reset">Reset demo data</button></div>` : ''}</div></div>`;
  }

  // ---------------- modals ----------------
  const ART = [['🍗', '🍚', '🥕', '#F4EAD5', '#E9D3A8'], ['🐟', '🎃', '🥬', '#FCE8D4', '#F2C79B'], ['🍖', '🍠', '🫘', '#F3E0D2', '#E2BFA4'], ['🍲', '🫘', '🎃', '#FBF0D2', '#F0D98F'], ['🧀', '🍠', '🥬', '#F7EEDC', '#E8D3AC'], ['🍳', '🥣', '🍌', '#FFF3D6', '#F6DE9C'], ['🥛', '🌾', '🎃', '#EEF4EC', '#CFE0C9'], ['🐠', '🍠', '🌿', '#E6EEF2', '#C5D6DF'], ['🦴', '🥣', '🌿', '#F5EBDD', '#E5D0B0'], ['🧁', '🎃', '🐾', '#FCEBD6', '#F2C894']];
  function recipeModal(r) {
    const isNew = !r; r = r || { id: '', name: '', ingredients: '', diet: 'nonveg', price: 179, kcal: 400, art: ART[0], species: ['dog', 'cat'], tags: [], available: true, course: 'meal' };
    let art = r.art;
    const el = sheet(`<form id="rf"><div class="row between"><h2 style="font-size:24px">${isNew ? 'New recipe' : 'Edit recipe'}</h2><button type="button" class="icon-btn" data-x="close" aria-label="Close">${icons.close}</button></div>
      <div class="row" style="gap:16px;margin:14px 0"><div id="artp">${foodArt(r, 84)}</div><div class="grow"><label class="small bold muted">Illustration</label><div class="swatches" style="margin-top:6px">${ART.map((a, i) => `<button type="button" class="swatch ${a[0] === art[0] && a[3] === art[3] ? 'on' : ''}" data-x="art" data-i="${i}" style="background:${a[3]};font-size:16px">${a[0]}</button>`).join('')}</div></div></div>
      <div class="form-grid">
        <div class="field full"><label>Name *</label><input class="input" name="name" value="${esc(r.name)}" required autofocus></div>
        <div class="field full"><label>Ingredients *</label><input class="input" name="ingredients" value="${esc(r.ingredients)}" required placeholder="Comma separated — shown to customers & used for allergen warnings"></div>
        <div class="field"><label>Diet</label><select class="input" name="diet">${[['nonveg', 'Non-veg'], ['veg', 'Veg'], ['egg', 'Egg (veg + egg)']].map(([v, l]) => `<option value="${v}" ${r.diet === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label>Type</label><select class="input" name="course">${[['meal', 'Meal (goes on weekly menu)'], ['treat', 'Treat (always available)'], ['addon', 'Add-on (always available)']].map(([v, l]) => `<option value="${v}" ${r.course === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label>Base price for 250 g (₹)</label><input class="input" type="number" name="price" value="${r.price}" min="1" required></div>
        <div class="field"><label>Calories per 250 g</label><input class="input" type="number" name="kcal" value="${r.kcal}" min="0"></div>
        <div class="field"><label>Suitable for</label><div class="row"><label class="chip"><input type="checkbox" name="dog" ${r.species.includes('dog') ? 'checked' : ''}> 🐶 Dogs</label><label class="chip"><input type="checkbox" name="cat" ${r.species.includes('cat') ? 'checked' : ''}> 🐱 Cats</label></div></div>
        <div class="field"><label>Tag (optional)</label><input class="input" name="tag" value="${esc(r.tags[0] || '')}" placeholder="e.g. Bestseller, Puppy, Chef special"></div>
      </div>
      <div class="row" style="margin-top:20px">${!isNew ? `<button type="button" class="btn btn-danger" data-x="del">${icons.trash} Delete</button>` : ''}<span class="grow"></span><button type="button" class="btn btn-ghost" data-x="close">Cancel</button><button class="btn btn-primary" type="submit">${isNew ? 'Add recipe' : 'Save changes'}</button></div></form>`, { modal: true });
    el.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-x]'); if (!b) return;
      if (b.dataset.x === 'close') closeSheet();
      if (b.dataset.x === 'art') { art = ART[+b.dataset.i]; el.querySelectorAll('.swatch').forEach((s) => s.classList.toggle('on', s === b)); el.querySelector('#artp').innerHTML = foodArt({ art }, 84); }
      if (b.dataset.x === 'del' && confirm(`Delete “${r.name}”? It will be removed from any menus that use it.`) && await api.call('deleteRecipe', r.id)) { S.draft = null; closeSheet(); toast('Recipe deleted'); }
    });
    el.querySelector('#rf').addEventListener('submit', async (e) => {
      e.preventDefault(); const f = new FormData(e.target); const tag = f.get('tag').trim();
      const ok = await api.call('saveRecipe', { ...r, name: f.get('name'), ingredients: f.get('ingredients'), diet: f.get('diet'), course: f.get('course'), price: +f.get('price'), kcal: +f.get('kcal'), species: ['dog', 'cat'].filter((s) => f.get(s)), tags: tag ? [tag] : [], art });
      if (ok) { closeSheet(); toast(isNew ? 'Recipe added to the library' : 'Recipe saved'); }
    });
  }
  function formModal(html, onSubmit) {
    const el = sheet(`<form id="mf">${html}<div class="row" style="margin-top:18px;justify-content:flex-end"><button type="button" class="btn btn-ghost" data-x="close">Cancel</button><button class="btn btn-primary">Save</button></div></form>`, { modal: true });
    el.addEventListener('click', (e) => { if (e.target.closest('[data-x="close"]')) closeSheet(); });
    el.querySelector('#mf').addEventListener('submit', async (e) => { e.preventDefault(); if (await onSubmit(new FormData(e.target))) closeSheet(); });
  }
  const couponModal = () => formModal(`<h2 style="font-size:24px;margin-bottom:14px">New coupon</h2><div class="form-grid">
      <div class="field"><label>Code *</label><input class="input" name="code" required style="text-transform:uppercase" autofocus></div>
      <div class="field"><label>Type</label><select class="input" name="type"><option value="pct">% off</option><option value="flat">Flat ₹ off</option><option value="delivery">Free delivery</option></select></div>
      <div class="field"><label>Value (% or ₹)</label><input class="input" type="number" name="value" value="20"></div>
      <div class="field"><label>Max discount (₹)</label><input class="input" type="number" name="max" value="100"></div>
      <div class="field"><label>Minimum order (₹)</label><input class="input" type="number" name="min" value="299"></div>
      <div class="field"><label>Description *</label><input class="input" name="desc" required placeholder="Shown to customers"></div></div>`,
    async (f) => { const ok = await api.call('addCoupon', Object.fromEntries(f)); if (ok) toast(`Coupon ${esc(String(f.get('code')).toUpperCase())} is live`); return ok; });
  function bannerModal(id) {
    const b = api.db.banners.find((x) => x.id === id) || { id: '', title: '', sub: '', cta: 'Order now', tone: 'pine', emoji: '🐾' };
    formModal(`<h2 style="font-size:24px;margin-bottom:14px">${id ? 'Edit' : 'New'} banner</h2><div class="form-grid">
      <div class="field full"><label>Headline *</label><input class="input" name="title" value="${esc(b.title)}" required autofocus></div>
      <div class="field full"><label>Sub-text</label><input class="input" name="sub" value="${esc(b.sub)}"></div>
      <div class="field"><label>Button label</label><input class="input" name="cta" value="${esc(b.cta)}"></div>
      <div class="field"><label>Emoji</label><input class="input" name="emoji" value="${esc(b.emoji)}" maxlength="4"></div>
      <div class="field full"><label>Colour</label><select class="input" name="tone">${['pine', 'mustard', 'sage'].map((t) => `<option ${b.tone === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div></div>`,
    async (f) => { const ok = await api.call('saveBanner', { id: b.id, ...Object.fromEntries(f) }); if (ok) toast('Banner published to the customer app'); return ok; });
  }
  const riderModal = () => formModal(`<h2 style="font-size:24px;margin-bottom:14px">Add delivery partner</h2><div class="form-grid">
      <div class="field full"><label>Full name *</label><input class="input" name="name" required autofocus></div>
      <div class="field"><label>Email *</label><input class="input" type="email" name="email" required placeholder="Used to log in"></div>
      <div class="field"><label>Mobile number *</label><input class="input" name="phone" inputmode="numeric" maxlength="10" required placeholder="10 digits"></div>
      <div class="field"><label>Vehicle</label><input class="input" name="vehicle" placeholder="e.g. Honda Activa · RJ14 AB 1234"></div>
      <div class="field"><label>Driving licence no.</label><input class="input" name="licence"></div></div>
      <p class="small muted" style="margin-top:10px">You'll get a temporary password to share with them. They're approved straight away.</p>`,
    async (f) => { const r = await api.call('addRider', Object.fromEntries(f)); if (r) setTimeout(() => showTemp('Partner added', r.email, r.tempPassword, f.get('name')), 50); return !!r; });
  const staffModal = () => formModal(`<h2 style="font-size:24px;margin-bottom:14px">Add staff member</h2><div class="form-grid">
      <div class="field full"><label>Full name *</label><input class="input" name="name" required autofocus></div>
      <div class="field"><label>Email *</label><input class="input" type="email" name="email" required placeholder="Used to sign in"></div>
      <div class="field"><label>Role</label><select class="input" name="role">${Object.keys(ROLE_INFO).map((r) => `<option value="${r}" ${r === 'kitchen' ? 'selected' : ''}>${r[0].toUpperCase() + r.slice(1)}</option>`).join('')}</select></div></div>
      <div class="col" style="gap:4px;margin-top:10px">${Object.entries(ROLE_INFO).map(([r, d]) => `<span class="tiny muted"><b style="text-transform:capitalize">${r}</b> — ${d}</span>`).join('')}</div>`,
    async (f) => { const r = await api.call('addStaff', Object.fromEntries(f)); if (r) setTimeout(() => showTemp('Staff member added', r.email, r.tempPassword, f.get('name')), 50); return !!r; });

  // ---------------- render ----------------
  function route() { const [name, arg] = (location.hash.slice(2) || 'dashboard').split('/'); return { name: TITLES[name] ? name : 'dashboard', arg }; }
  function render(keep) {
    const s = api.session;
    if (!s || s.role !== 'admin' || s.mustChange) {
      if (!document.getElementById('auth-box')) app.innerHTML = Login();
      AuthUI.mount(document.getElementById('auth-box'), AUTH_CFG()); return;
    }
    if (!S.seen) S.seen = new Set(api.db.orders.map((o) => o.id));
    let { name, arg } = route(); if (!canSee(name)) name = 'dashboard';
    const y = window.scrollY; const focused = document.activeElement && document.activeElement.id;
    const pages = { dashboard: Dashboard, orders: Orders, riders: Riders, menu: () => Menu(arg), recipes: Recipes, offers: Offers, referrals: Referrals, plans: Plans, customers: Customers, vets: Vets, staff: Staff, settings: Settings };
    const st = api.db.settings; const pendingApps = api.db.riders.filter((r) => r.status === 'pending').length;
    app.innerHTML = `<div class="shell"><aside class="side">${UI.logo('Admin')}
      ${NAV.map(([g, items]) => { const vis = items.filter(([id]) => canSee(id)); return vis.length ? `<div class="grp">${g}</div>${vis.map(([id, l, ic, cnt]) => { const c = id === 'riders' ? pendingApps : cnt && cnt(); return `<a href="#/${id}" class="${name === id ? 'on' : ''}">${ic}${l}${c ? `<span class="cnt">${c}</span>` : ''}</a>`; }).join('')}` : ''; }).join('')}
      <div class="foot"><b>${esc(s.staffName || 'Staff')}</b><div style="opacity:.7;text-transform:capitalize">${esc(myRole())} · ${esc(st.city)}</div><button class="link" style="color:#E8C27E;font-size:12.5px;margin-top:4px" data-act="logout">Sign out</button></div></aside>
      <div class="main">${api.online ? '' : '<div class="offline">Connection lost — reconnecting…</div>'}<header class="topbar"><h1>${TITLES[name]}</h1><span class="grow"></span>
        <span class="small muted">${new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
        <button class="row small semibold chip ${st.kitchenOpen ? 'on' : ''}" data-act="kitchen">${st.kitchenOpen ? '● Kitchen open' : '○ Kitchen closed'}</button></header>
      <div class="content">${pages[name]()}</div></div></div>`;
    if (keep) window.scrollTo(0, y);
    if (focused) { const el = document.getElementById(focused); if (el && el.tagName === 'INPUT') { el.focus(); try { el.setSelectionRange(el.value.length, el.value.length); } catch (e) { /* noop */ } } }
  }

  // ---------------- actions ----------------
  const markDirty = () => { S.dirty = true; };
  const menuComplete = () => DAYS.every((d) => FP.SLOTS.every((s) => S.draft.days[d][s].nonveg && S.draft.days[d][s].veg));
  const A = {
    async kitchen() { const open = !api.db.settings.kitchenOpen; if (await api.call('updateSettings', { kitchenOpen: open })) toast(open ? 'Kitchen is open for orders' : 'Kitchen closed — same-day orders paused'); },
    async advance(el) { const r = await api.call('advance', el.dataset.id); if (r) toast(r.status === 'cooking' ? `#${el.dataset.id} accepted — cooking started` : `#${el.dataset.id} packed & ready for pickup`); },
    async cancel(el) { if (confirm('Reject this order? The customer will be refunded.') && await api.call('setOrderStatus', el.dataset.id, 'cancelled')) toast('Order rejected'); },
    'rider-toggle'(el) { const r = api.rider(el.dataset.id); api.call('setRiderOnline', r.id, !r.online); },
    'new-rider'() { riderModal(); },
    wk(el) { const d = +el.dataset.d; if (S.dirty && !confirm('Discard unsaved menu changes?')) return; S.draft = null; location.hash = `#/menu/${d === 0 ? FP.weekKey() : FP.addWeeks(S.week, d)}`; },
    'copy-prev'() { const prev = api.menu(FP.addWeeks(S.week, -1)); if (!prev) return toast('No menu for the previous week'); S.draft.days = JSON.parse(JSON.stringify(prev.days)); markDirty(); render(true); toast('Copied last week — tweak a few dishes so it feels fresh'); },
    shuffle() {
      const meals = api.db.recipes.filter((r) => r.course === 'meal' && r.available); const nv = meals.filter((r) => r.diet === 'nonveg'); const v = meals.filter((r) => r.diet !== 'nonveg');
      if (!nv.length || !v.length) return toast('Add veg and non-veg recipes first');
      const seed = parseInt(S.week.split('W')[1], 10);
      DAYS.forEach((d, i) => { S.draft.days[d].morning.nonveg = nv[(i * 2 + seed) % nv.length].id; S.draft.days[d].evening.nonveg = nv[(i * 2 + 1 + seed) % nv.length].id; S.draft.days[d].morning.veg = v[(i * 2 + seed) % v.length].id; S.draft.days[d].evening.veg = v[(i * 2 + 1 + seed) % v.length].id; });
      markDirty(); render(true); toast('Filled with a rotation of available recipes');
    },
    'clear-menu'() { if (!confirm('Clear all slots for this week?')) return; S.draft.days = FP.emptyMenu().days; markDirty(); render(true); },
    async 'save-menu'() { if (await api.call('saveMenu', S.week, S.draft)) { S.dirty = false; S.draft = null; render(true); toast('Menu saved'); } },
    async publish() {
      if (!menuComplete() && !confirm('Some slots are empty. Customers will see fewer dishes on those days. Publish anyway?')) return;
      if (await api.call('saveMenu', S.week, S.draft, true)) { S.dirty = false; S.draft = null; render(true); toast(`🚀 Menu for ${FP.weekLabel(S.week)} is live in the customer app`); }
    },
    async unpublish() { if (confirm('Unpublish? Customers will no longer see or order from this week\'s menu.') && await api.call('unpublishMenu', S.week)) { S.draft = null; render(true); toast('Menu moved back to draft'); } },
    rdiet(el) { S.rdiet = el.dataset.v; render(true); },
    'new-recipe'() { recipeModal(null); },
    'edit-recipe'(el) { recipeModal(api.recipe(el.dataset.id)); },
    async 'toggle-recipe'(el) { const r = api.recipe(el.dataset.id); if (await api.call('saveRecipe', { ...r, available: !r.available })) toast(r.available ? `${esc(r.name)} marked sold out` : `${esc(r.name)} is available again`); },
    'new-coupon'() { couponModal(); },
    'coupon-toggle'(el) { api.call('toggleCoupon', el.dataset.code); },
    'edit-banner'(el) { bannerModal(el.dataset.id); },
    'del-banner'(el) { if (confirm('Remove this banner?')) api.call('deleteBanner', el.dataset.id); },
    'plan-toggle'(el) { const p = api.plan(el.dataset.id); api.call('updatePlan', p.id, { active: !p.active }); },
    async grant(el) { if (confirm('Give this customer one free meal?') && await api.call('grantFreeMeal', el.dataset.id)) toast('Free meal added 🎁'); },
    async reset() { if (confirm('Reset ALL data on the server to the demo sample? This affects every app and device.') && await api.resetDemo()) { S.draft = null; toast('Demo data restored'); } },
    async logout() { await api.auth.logout(); S.seen = null; location.hash = '#/dashboard'; render(); },
    'change-pw'() { passwordModal(); },
    'new-staff'() { staffModal(); },
    'new-vet'() { vetModal(null); },
    'edit-vet'(el) { vetModal(el.dataset.id); },
    async 'vet-toggle'(el) { const v = api.db.vets.find((x) => x.id === el.dataset.id); const patch = el.dataset.k === 'visible' ? { visible: !v.visible } : { status: v.status === 'active' ? 'paused' : 'active' }; if (await api.call('saveVet', { ...v, ...patch })) toast(el.dataset.k === 'visible' ? (patch.visible ? 'Now shown to customers' : 'Hidden from customers') : (patch.status === 'active' ? 'Vet partner activated' : 'Vet partner paused')); },
    async 'del-vet'(el) { if (confirm(`Remove ${el.dataset.name} as a partner?`) && await api.call('deleteVet', el.dataset.id)) toast('Vet partner removed'); },
    async 'rider-status'(el) {
      const r = api.rider(el.dataset.id); const v = el.dataset.v; let reason = '';
      if (v !== 'approved') { reason = prompt(v === 'rejected' ? `Reason for rejecting ${r.name} (shown to them):` : `Reason for pausing ${r.name} (shown to them):`, ''); if (reason === null) return; }
      if (await api.call('setRiderStatus', r.id, v, reason)) toast(v === 'approved' ? `${esc(r.name)} approved — they can go on duty now 🎉` : v === 'rejected' ? 'Application rejected' : 'Partner paused');
    },
    async 'reset-pw'(el) {
      if (!confirm(`Reset the password for ${el.dataset.name}? They'll be signed out and must use the temporary password.`)) return;
      const r = await api.call('resetUserPassword', el.dataset.role, el.dataset.id); if (r) showTemp('Password reset', r.email, r.tempPassword, el.dataset.name);
    },
    async 'staff-reset'(el) {
      if (!confirm(`Reset the password for ${el.dataset.name}?`)) return;
      const r = await api.call('resetStaffPassword', el.dataset.id); if (r) showTemp('Password reset', r.email, r.tempPassword, el.dataset.name);
    },
    async 'staff-remove'(el) { if (confirm(`Remove ${el.dataset.name} permanently? Their login stops working immediately.`) && await api.call('removeStaff', el.dataset.id)) toast('Staff member removed'); },
    async 'staff-active'(el) { const on = el.dataset.v === '1'; if ((on || confirm('Deactivate this staff member? They will be signed out immediately.')) && await api.call('updateStaff', el.dataset.id, { active: on })) toast(on ? 'Staff member reactivated' : 'Staff member deactivated'); },
  };
  UI.delegate(document.body, A);
  document.body.addEventListener('change', async (e) => {
    const t = e.target; const k = t.dataset.onchange; if (!k) return;
    if (k === 'assign' && await api.call('assignRider', t.dataset.id, t.value || null)) toast(t.value ? `Assigned to ${esc(api.rider(t.value).name)}` : 'Partner unassigned');
    if (k === 'cell') { S.draft.days[t.dataset.day][t.dataset.slot][t.dataset.k] = t.value || null; markDirty(); render(true); }
    if (k === 'setting' && await api.call('updateSettings', { [t.dataset.k]: t.type === 'number' ? +t.value : t.value })) toast('Setting saved');
    if (k === 'plan' && await api.call('updatePlan', t.dataset.id, { [t.dataset.k]: +t.value })) toast('Plan updated');
    if (k === 'vet-req' && await api.call('setVetRequestStatus', t.dataset.id, t.value)) toast('Request updated');
    if (k === 'staff-role') { if (await api.call('updateStaff', t.dataset.id, { role: t.value })) toast('Role updated'); else render(true); }
  });
  document.body.addEventListener('input', (e) => {
    const t = e.target; const k = t.dataset.oninput; if (!k) return;
    if (k === 'rq') { S.rq = t.value; render(true); }
    if (k === 'note') { S.draft.note = t.value; if (!S.dirty) { S.dirty = true; const sv = document.querySelector('[data-act="save-menu"]'); if (sv) sv.disabled = false; } }
  });
  window.addEventListener('beforeunload', (e) => { if (S.dirty) { e.preventDefault(); e.returnValue = ''; } });
  window.addEventListener('hashchange', () => { window.scrollTo(0, 0); render(); });
  api.subscribe((db) => {
    if (S.seen && api.session && api.session.role === 'admin') db.orders.forEach((o) => { if (!S.seen.has(o.id)) { S.seen.add(o.id); toast(`🔔 New order #${o.id} from ${esc(o.customerName)} · ${money(o.total)}`, 4000); } });
    if (document.getElementById('scrim') && document.querySelector('#scrim form')) { S.deferred = true; return; } // don't disturb an open form; redraw when it closes
    render(true);
  });
  UI.onSheetClosed = () => { if (S.deferred) { S.deferred = false; setTimeout(() => render(true), 0); } };
  FP.ready.then(() => render())
    .catch(() => { app.innerHTML = `<div class="empty" style="padding-top:120px"><div class="big">🔌</div><h2>Can't reach the FoodPeto server</h2><p class="small" style="margin:8px 0 16px">Start it with <code>node server.js</code>, then reload.</p><button class="btn btn-primary" onclick="location.reload()">Retry</button></div>`; });
})();
