/* FoodPeto — Customer ordering app */
(function () {
  const { api, DAYS, DAY_NAMES, DELIVERY_SLOTS, CUSTOMIZATIONS, ALLERGENS } = FP;
  const { esc, money, icons, foodArt, vmark, toast, sheet, closeSheet, lsGet, lsSet, fmtTime, fmtDay, fmtDate, statusBadge } = UI;
  const app = document.getElementById('app');
  const emptyCart = () => ({ week: null, day: null, items: [], coupon: null });
  const blankIns = () => ({ comment: '', customization: [], customText: '', request: '', allergies: null, allergyText: '' });

  const S = {
    cart: lsGet('cart', emptyCart()), petId: lsGet('cust.pet', null), addrId: lsGet('cust.addr', null),
    vegOnly: false, weekOffset: 0, day: FP.todayDay(), query: '', payment: 'UPI', deliverySlot: null,
    ins: blankIns(), useFreeMeal: false, busy: false,
    login: { ref: (new URLSearchParams(location.search).get('ref') || '').toUpperCase() },
  };
  const ALLERGEN_RX = { Chicken: /chicken/i, Fish: /fish|tuna|salmon|sardine|rohu/i, Dairy: /paneer|curd|ghee|milk/i, Egg: /egg/i, Wheat: /wheat/i, Mutton: /mutton/i, Rice: /rice/i, Peas: /peas/i };

  const session = () => api.session;
  const me = () => { const s = session(); return s && s.customerId ? api.customer(s.customerId) : null; };
  const pet = () => { const c = me(); return c ? c.pets.find((p) => p.id === S.petId) || c.pets[0] || null : null; };
  const addr = () => { const c = me(); return c ? c.addresses.find((a) => a.id === S.addrId) || c.addresses[0] || null : null; };
  const ref = () => api.db.referral || { code: '', per: 5, qualified: 0, pending: 0, towardNext: 0, earned: 0, used: 0, available: 0, friends: [] };
  const petEmoji = (p) => (p && p.species === 'cat' ? '🐱' : '🐶');
  const saveCart = () => lsSet('cart', S.cart);
  const thisWeek = () => FP.weekKey();
  const weekAt = (off) => FP.addWeeks(thisWeek(), off);
  const isActive = (o) => !['delivered', 'cancelled'].includes(o.status);
  const myOrders = () => api.db.orders.slice().sort((a, b) => b.createdAt - a.createdAt);
  const shareLink = () => `${location.origin}/customer/?ref=${ref().code}`;

  function dayState(week, day) {
    const d = FP.dateOf(week, day); const t = new Date(); t.setHours(0, 0, 0, 0);
    return +d < +t ? 'past' : +d === +t ? 'today' : 'future';
  }
  function dishesFor(week, day, slot) {
    const m = api.publishedMenu(week); if (!m) return [];
    const s = m.days[day] && m.days[day][slot]; if (!s) return [];
    return ['nonveg', 'veg'].map((k) => s[k] && api.recipe(s[k])).filter((r) => r && r.available && fitsPet(r));
  }
  function onMenu(week, day, id) { const m = api.publishedMenu(week); return !!m && FP.SLOTS.some((s) => m.days[day][s].nonveg === id || m.days[day][s].veg === id); }
  function allergyHit(r) {
    const p = pet(); if (!p || !p.allergies) return null;
    return p.allergies.find((a) => (ALLERGEN_RX[a] || new RegExp(a.replace(/[^\w ]/g, ''), 'i')).test(r.ingredients + ' ' + r.name)) || null;
  }
  /** Only show food made for the selected pet: right species, and no non-veg for veg pets. */
  const fitsPet = (r, p = pet()) => !p || (r.species.includes(p.species) && !(p.diet === 'veg' && r.diet === 'nonveg'));
  const petKind = (p = pet()) => (p ? (p.species === 'cat' ? 'cat' : 'dog') : 'pet');
  const whyNot = (r, p = pet()) => (!r.species.includes(p.species) ? `made for ${r.species.join(' & ')}s only` : `it's non-veg and ${esc(p.name)} eats veg`);
  function recommendedPortion() { const p = pet(); if (!p) return 'Regular'; return p.weight < 10 ? 'Small' : p.weight <= 25 ? 'Regular' : 'Large'; }

  // ---------------- cart ----------------
  const cartCount = () => S.cart.items.reduce((a, i) => a + i.qty, 0);
  const qtyOf = (rid, slot, week, day) => (S.cart.week === week && S.cart.day === day ? S.cart.items.filter((i) => i.recipeId === rid && i.slot === slot).reduce((a, i) => a + i.qty, 0) : 0);
  function addLine(r, portion, slot, week, day, qty = 1) {
    if (!S.cart.items.length) { S.cart.week = week; S.cart.day = day; }
    const key = `${r.id}|${portion}|${slot}`;
    const line = S.cart.items.find((i) => i.key === key);
    if (line) line.qty += qty;
    else S.cart.items.push({ key, recipeId: r.id, name: r.name, diet: r.diet, course: r.course, price: FP.portionPrice(r.price, portion), qty, portion, slot, day });
    saveCart();
  }
  function clearCart() { S.cart = emptyCart(); S.ins = blankIns(); S.useFreeMeal = false; S.deliverySlot = null; saveCart(); }
  function bump(rid, slot, delta) {
    const lines = S.cart.items.filter((i) => i.recipeId === rid && i.slot === slot); const line = lines[lines.length - 1]; if (!line) return;
    line.qty += delta; if (line.qty <= 0) S.cart.items = S.cart.items.filter((i) => i !== line);
    if (!S.cart.items.length) clearCart(); else saveCart();
    render(true);
  }

  // ---------------- shared bits ----------------
  function addControl(r, slot, week, day, compact) {
    if (dayState(week, day) === 'past') return `<div class="closed">Served</div>`;
    const q = qtyOf(r.id, slot, week, day);
    const data = `data-id="${r.id}" data-slot="${slot}" data-week="${week}" data-day="${day}"`;
    const style = compact ? 'style="min-width:80px;height:32px;margin:0"' : '';
    if (q) return `<div class="add-btn solid" ${style}><button data-act="dec" ${data} aria-label="Remove one">−</button><span>${q}</span><button data-act="inc" ${data} aria-label="Add one">+</button></div>`;
    return `<button class="add-btn single" ${style} data-act="add" ${data}>ADD</button>`;
  }
  function dishRow(r, slot, week, day, badge = '') {
    const hit = allergyHit(r); const p = pet();
    return `<div class="dish">
      <div class="grow">${badge}
        <div class="row" style="gap:6px">${vmark(r.diet)}${r.tags.slice(0, 1).map((t) => `<span class="badge b-mustard">★ ${esc(t)}</span>`).join('')}</div>
        <h4>${esc(r.name)}</h4>
        <div class="price">${money(r.price)} <span class="faint small" style="font-weight:700">${r.course === 'meal' ? '· from 250 g' : '· per pack'}</span></div>
        <div class="row" style="margin-top:4px"><span class="rate">${icons.star} ${r.rating}</span><span class="faint small">(${r.ratings}) · ${r.kcal} kcal</span></div>
        <div class="ing">${esc(r.ingredients)}</div>
        ${hit ? `<div class="warn">⚠ Contains ${esc(hit.toLowerCase())} — ${esc(p.name)} is allergic</div>` : ''}
      </div>
      <div class="dish-img">${foodArt(r, 118)}${addControl(r, slot, week, day)}${r.course === 'meal' ? '<span class="cust">Customisable</span>' : ''}</div>
    </div>`;
  }
  function bottomNav(active) {
    const n = myOrders().filter(isActive).length;
    const tab = (id, label, icon, badge) => `<a href="#/${id}" class="${active === id ? 'on' : ''}">${icon}${label}${badge ? `<span class="nav-dot">${badge}</span>` : ''}</a>`;
    return `<nav class="bottom-nav">${tab('home', 'Home', icons.home)}${tab('menu', 'Weekly menu', icons.bowl)}${tab('refer', 'Refer & earn', icons.gift, ref().available ? '🎁' : '')}${tab('orders', 'Orders', icons.orders, n)}${tab('profile', 'Account', icons.user)}</nav>`;
  }
  function floating(screen) {
    let html = '';
    const live = myOrders().find(isActive);
    if (live && screen !== 'track') {
      const s = FP.status(live);
      html += `<a class="track-bar" href="#/track/${live.id}"><div class="ti">${s.icon}</div><div class="grow"><div class="bold">${s.label}</div><div class="small muted ellipsis">${esc(s.cust)}</div></div><span class="link small">Track ${icons.chev}</span></a>`;
    }
    if (cartCount() && screen !== 'cart') {
      const q = api.quote(S.cart.items, null);
      html += `<a class="cart-bar" href="#/cart"><div class="ct">${cartCount()} item${cartCount() > 1 ? 's' : ''} | ${money(q.subtotal)}<small>For ${DAY_NAMES[S.cart.day]} · ${fmtDay(FP.dateOf(S.cart.week, S.cart.day))}</small></div><div class="row bold">View cart ${icons.chev}</div></a>`;
    }
    return html;
  }
  function pawProgress(n, per) { return `<div class="paws">${[...Array(per)].map((_, i) => `<span class="${i < n ? 'on' : ''}">🐾</span>`).join('')}</div>`; }

  // ---------------- screens ----------------
  function Login() {
    return `<div class="login-hero">
        ${UI.logo()}
        <span class="floaty" style="right:24px;top:22px">🍗</span><span class="floaty" style="right:78px;top:62px;animation-delay:1s">🥕</span><span class="floaty" style="right:132px;top:24px;animation-delay:2s">🐟</span>
        <h1>Fresh food for pets.<br><i>Happy paws.</i></h1>
        <p style="opacity:.85;margin-top:8px;font-weight:700">Cooked fresh daily in ${esc(api.db.settings.city || 'Jaipur')}. Zero preservatives.</p>
      </div>
      ${S.login.ref ? `<div class="card" style="margin:16px 20px 0;padding:12px 14px;background:var(--sage);border:0"><b>🎁 Invited by a friend</b><div class="small muted">Create an account — code ${esc(S.login.ref)} is already filled in.</div></div>` : ''}
      <div id="auth-box" style="padding:20px 20px 36px"></div>`;
  }
  const AUTH_CFG = () => ({
    forced: !!(session() && session().mustChange),
    signup: {
      cta: 'New to FoodPeto?', link: 'Create an account', title: 'Create your account', submit: 'Create account',
      intro: `Fresh, vet-balanced meals for your dog or cat, delivered in ${esc(api.db.settings.city || 'Jaipur')}.`,
      fields: (v) => `<div class="field"><label for="su-name">Your name</label><input class="input" id="su-name" name="name" autocomplete="name" required value="${esc(v.name || '')}" placeholder="Name of paw parent"></div>
        <div class="field"><label for="su-phone">Mobile number</label><div class="phone-in"><span>+91</span><input id="su-phone" name="phone" inputmode="numeric" maxlength="10" autocomplete="tel-national" required value="${esc(v.phone || '')}" placeholder="For delivery updates"></div></div>
        <div class="row" style="gap:10px;align-items:flex-end"><div class="field" style="width:44%"><label for="su-area">Area</label><select class="input" id="su-area" name="area">${FP.AREAS.map((a) => `<option ${v.area === a.name ? 'selected' : ''}>${a.name}</option>`).join('')}</select></div>
        <div class="field grow"><label for="su-line">House / flat, street</label><input class="input" id="su-line" name="line" autocomplete="street-address" required value="${esc(v.line || '')}" placeholder="e.g. B-42, Shivalik Apts"></div></div>
        <div class="field"><label for="su-ref">Referral code <span class="faint">(optional)</span></label><input class="input" id="su-ref" name="ref" value="${esc(v.ref !== undefined ? v.ref : S.login.ref)}" placeholder="Got a code from a friend?" style="text-transform:uppercase"></div>`,
      collect: (d) => {
        if (!String(d.name || '').trim()) throw new Error('Enter your name');
        const phone = String(d.phone || '').replace(/\D/g, ''); if (!/^[6-9]\d{9}$/.test(phone)) throw new Error('Enter a valid 10-digit mobile number');
        if (!String(d.line || '').trim()) throw new Error('Enter your street address');
        return { name: d.name, phone, area: d.area, line: d.line, ref: d.ref };
      },
    },
  });

  function PetForm(p = {}, { onboarding = false } = {}) {
    const allergies = p.allergies || [];
    return `<div ${onboarding ? 'style="padding:20px"' : ''}>
      ${onboarding ? `<div class="eyebrow">Step 2 of 2</div><h1 style="font-size:28px;margin:6px 0 4px">Tell us about your pet</h1><p class="muted small" style="margin-bottom:18px">We use this to suggest portions and flag allergens on every dish.</p>` : `<h2 style="font-size:22px;margin-bottom:14px">${p.id ? 'Edit' : 'Add'} pet</h2>`}
      <form class="col" style="gap:14px" id="petform" data-id="${p.id || ''}">
        <div class="field"><label>Pet *</label><div class="seg" data-group="species">${['dog', 'cat'].map((s) => `<button type="button" data-act="seg" data-v="${s}" class="${(p.species || 'dog') === s ? 'on' : ''}">${s === 'dog' ? '🐶 Dog' : '🐱 Cat'}</button>`).join('')}</div></div>
        <div class="field"><label>Name of pet *</label><input class="input" name="name" required value="${esc(p.name || '')}" placeholder="e.g. Bruno"></div>
        <div class="row" style="gap:10px;align-items:flex-end">
          <div class="field grow"><label>Age *</label><div class="row"><input class="input" name="ageY" type="number" min="0" max="25" value="${(p.ageY == null ? '' : p.ageY)}" placeholder="Years"><input class="input" name="ageM" type="number" min="0" max="11" value="${(p.ageM == null ? '' : p.ageM)}" placeholder="Months"></div></div>
          <div class="field" style="width:96px"><label>Weight (kg)</label><input class="input" name="weight" type="number" min="0.5" step="0.5" value="${(p.weight == null ? '' : p.weight)}" placeholder="kg"></div>
        </div>
        <div class="field"><label>Breed *</label><input class="input" name="breed" required value="${esc(p.breed || '')}" placeholder="e.g. Labrador, Indie, Persian"></div>
        <div class="field"><label>Allergies</label><div class="tag-pick" data-group="allergies">${ALLERGENS.map((a) => `<button type="button" class="chip ${allergies.includes(a) ? 'on' : ''}" data-act="tog" data-v="${a}">${a}</button>`).join('')}</div></div>
        <div class="field"><label>Food choice *</label><div class="seg" data-group="diet">${[['veg', '🥦 Veg'], ['nonveg', '🍗 Non-veg'], ['custom', '🎯 Customised']].map(([v, l]) => `<button type="button" data-act="seg" data-v="${v}" class="${(p.diet || 'nonveg') === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>
        <button class="btn btn-primary btn-block btn-lg" type="submit">${onboarding ? 'Start ordering 🐾' : 'Save pet'}</button>
        ${p.id && !onboarding ? `<button type="button" class="btn btn-danger btn-block" data-act="del-pet" data-id="${p.id}">Remove pet</button>` : ''}
      </form></div>`;
  }

  function Home() {
    const c = me(); const p = pet(); const a = addr(); const db = api.db; const R = ref();
    const wk = thisWeek(); const today = FP.todayDay(); const menu = api.publishedMenu(wk);
    const banners = db.banners.map((b) => `<button class="banner ${b.tone}" data-act="banner" data-id="${b.id}"><div><h3>${esc(b.title)}</h3><p style="opacity:.9;font-weight:700;margin-top:6px;font-size:13.5px">${esc(b.sub)}</p></div><span class="cta">${esc(b.cta)} →</span><span class="be">${b.emoji}</span></button>`).join('');
    const slotCard = (slot) => dishesFor(wk, today, slot)
      .map((r) => `<div class="card today-card">${foodArt(r, 76)}<div class="grow"><div class="slot-pill">${slot === 'morning' ? '☀️ Morning' : '🌙 Evening'}</div><div class="row" style="gap:6px;margin-top:2px">${vmark(r.diet)}<b class="ellipsis">${esc(r.name)}</b></div><div class="small muted ellipsis">${esc(r.ingredients)}</div><div class="row between" style="margin-top:6px"><b>${money(r.price)}</b>${addControl(r, slot, wk, today, true)}</div></div></div>`).join('');
    const isCat = petKind(p) === 'cat';
    const cats = (isCat ? [['cat', '🐱', 'Cat meals'], ['kitten', '🐈', 'Kitten']] : [['dog', '🐶', 'Dog meals'], ['puppy', '🐕', 'Puppy'], ['veg', '🥦', 'Veg bowls']])
      .concat([['treat', isCat ? '🐟' : '🦴', 'Treats'], ['addon', '🥣', 'Add-ons'], ['gentle', '🌿', 'Gentle tummy'], ['best', '⭐', 'Bestsellers']])
      .filter(([id]) => catList(id).length > 0);
    const todays = menu ? slotCard('morning') + slotCard('evening') : '';
    return `
      <header class="appbar">
        <button class="loc-btn grow" data-act="pick-addr"><span class="l1">${icons.pin} ${esc(a ? a.label : 'Add address')} ${icons.down}</span><span class="l2 ellipsis">${esc(a ? `${a.line}, ${db.settings.city}` : '')}</span></button>
        <a href="#/profile" class="avatar" aria-label="Account">${esc(c.name[0])}</a>
      </header>
      <div style="padding:0 16px"><a class="search" href="#/search">${icons.search} Search “chicken bowl”, “khichdi”…</a></div>
      <div class="section" style="margin-top:16px">
        <div class="small semibold muted" style="margin-bottom:8px">Cooking for</div>
        <div class="pets-row">${c.pets.map((x) => `<button class="pet-chip ${p && p.id === x.id ? 'on' : ''}" data-act="pet" data-id="${x.id}"><span class="pe">${petEmoji(x)}</span>${esc(x.name)}</button>`).join('')}<button class="pet-chip" data-act="add-pet"><span class="pe">＋</span>Add pet</button></div>
      </div>
      ${R.available ? `<div class="section"><a href="#/cart" class="card row free-ready"><span style="font-size:34px">🎁</span><div class="grow"><b>You have ${R.available} free meal${R.available > 1 ? 's' : ''}!</b><div class="small">Switch it on at checkout — one bowl is on us.</div></div>${icons.chev}</a></div>` : ''}
      <div class="section"><div class="hscroll snap">${banners}</div></div>
      ${!db.settings.kitchenOpen ? `<div class="section"><div class="card" style="padding:14px;background:var(--danger-soft);color:var(--danger);font-weight:800">🧑‍🍳 The kitchen is closed right now. You can still browse and schedule for upcoming days.</div></div>` : ''}
      <div class="section">
        <div class="section-title"><div><div class="eyebrow">Today · ${DAY_NAMES[today]}</div><h2>Fresh from the kitchen</h2></div><a class="link small" href="#/menu">Full week →</a></div>
        ${menu ? (todays ? `<div class="col" style="gap:10px">${todays}</div>` : `<div class="card empty small">No ${petKind(p)} bowls on today's menu. <a class="link" href="#/menu">See the rest of the week →</a></div>`) : `<div class="card empty"><div class="big">🍳</div>This week's menu is being finalised. Check back soon!</div>`}
        ${menu && menu.note ? `<div class="small semibold" style="margin-top:10px;color:var(--mustard-deep)">${esc(menu.note)}</div>` : ''}
      </div>
      <div class="section">
        <div class="section-title"><h2>What's ${esc(p ? p.name : 'your pet')} craving?</h2></div>
        <div class="cats">${cats.map(([id, e, l]) => `<a class="cat" href="#/search/${id}"><span class="ci">${e}</span>${l}</a>`).join('')}</div>
      </div>
      <div class="section">
        <a href="#/refer" class="card refer-card"><div class="grow"><div class="eyebrow" style="color:#E8C27E">Refer & earn</div><h3 style="font-size:21px;margin:4px 0">Invite ${R.per} friends, get 1 meal free</h3>
          ${pawProgress(R.towardNext, R.per)}<div class="small" style="opacity:.85;margin-top:6px">${R.towardNext}/${R.per} friends have ordered · ${R.per - R.towardNext} to go</div></div><span style="font-size:52px">🎁</span></a>
      </div>
      <div class="section">
        <div class="section-title"><h2>Meal plans</h2><a class="link small" href="#/plans">See all →</a></div>
        <a href="#/plans" class="card row" style="padding:16px;gap:14px;background:linear-gradient(120deg,var(--mustard-soft),#fff)"><span style="font-size:40px">📅</span><div class="grow"><b>Never run out of fresh food</b><div class="small muted">Weekly & monthly plans from ${money(db.plans.length ? Math.min(...db.plans.map((x) => x.price)) : 0)}. Pause or skip anytime.</div></div>${icons.chev}</a>
      </div>
      <div class="section">
        <div class="section-title"><h2>Why pet parents switch</h2></div>
        <div class="trust"><div><b>🍳</b>Cooked fresh daily</div><div><b>✅</b>Zero preservatives</div><div><b>🎯</b>100% customised</div><div><b>🩺</b>Vet-balanced recipes</div></div>
      </div>
      <div class="sign-off">Fresh food for pets.<br>Happy paws. 🐾<small>Made with love in ${esc(db.settings.city)} · ${esc(db.settings.phone)}</small></div>`;
  }

  function Refer() {
    const R = ref(); const db = api.db; const msg = `My pet loves FoodPeto — fresh home-cooked meals for dogs & cats 🐾 Sign up with my code ${R.code} and order your first bowl: ${shareLink()}`;
    return `<div class="week-head" style="padding-bottom:24px">
        <div class="row between"><a href="#/home" class="row semibold" style="color:var(--sage-deep)">${icons.back} Home</a></div>
        <div class="eyebrow" style="color:#E8C27E;margin-top:12px">Refer & earn</div>
        <h1>Invite ${R.per} friends,<br>get 1 meal free 🎁</h1>
        <p class="small" style="opacity:.85;margin-top:6px">Every ${R.per} friends who sign up with your code and get their first order delivered = one free bowl for your pet.</p>
      </div>
      <div class="c-section center">
        ${R.available ? `<div class="free-badge">🎁 ${R.available} free meal${R.available > 1 ? 's' : ''} ready to use</div>` : ''}
        <div class="eyebrow" style="margin-top:6px">Progress to your next free meal</div>
        ${pawProgress(R.towardNext, R.per).replace('class="paws"', 'class="paws big"')}
        <b style="font-size:17px">${R.towardNext} of ${R.per} friends</b>
        <div class="small muted">${R.per - R.towardNext} more to go${R.pending ? ` · ${R.pending} friend${R.pending > 1 ? 's' : ''} joined but haven't ordered yet` : ''}</div>
      </div>
      <div class="c-section">
        <div class="small bold muted">YOUR CODE</div>
        <div class="code-box"><span>${esc(R.code)}</span><button class="btn btn-ghost btn-sm" data-act="copy" data-v="${esc(R.code)}">Copy</button></div>
        <div class="col" style="margin-top:12px">
          <a class="btn btn-block" style="background:#1C8A4A;color:#fff" href="https://wa.me/?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">${icons.whatsapp} Share on WhatsApp</a>
          <div class="row"><button class="btn btn-ghost grow" data-act="share" data-v="${esc(msg)}">Share…</button><button class="btn btn-ghost grow" data-act="copy" data-v="${esc(shareLink())}">Copy invite link</button></div>
        </div>
      </div>
      <div class="c-section">
        <b>How it works</b>
        <div class="how"><span>1</span><div><b>Share your code</b><div class="small muted">Send it to friends with dogs or cats.</div></div></div>
        <div class="how"><span>2</span><div><b>They sign up & order</b><div class="small muted">A friend counts once their first order is delivered.</div></div></div>
        <div class="how"><span>3</span><div><b>Every ${R.per} friends = 1 free meal</b><div class="small muted">Switch it on at checkout. Covers one meal bowl, up to ${money(db.settings.freeMealCap || 300)}.</div></div></div>
      </div>
      <div class="c-section">
        <div class="row between"><b>Your friends</b><span class="small muted">${R.qualified} ordered · ${R.earned} meal${R.earned === 1 ? '' : 's'} earned · ${R.used} used</span></div>
        ${R.friends.length ? R.friends.slice().sort((a, b) => b.joined - a.joined).map((f) => `<div class="trip"><span class="li" style="width:36px;height:36px;border-radius:50%;background:var(--sage);display:grid;place-items:center;font-weight:900;color:var(--pine)">${esc(f.name[0])}</span><div class="grow"><b>${esc(f.name)}</b><div class="tiny muted">Joined ${fmtDate(f.joined)}</div></div>${f.qualified ? '<span class="badge b-sage">✓ Ordered</span>' : '<span class="badge b-mustard">Joined · no order yet</span>'}</div>`).join('') : '<div class="empty small" style="padding:20px">No friends yet — share your code to get started.</div>'}
      </div>
      <div class="sign-off" style="font-size:30px">More friends, more free bowls. 🐾</div>`;
  }

  function Menu() {
    const wk = weekAt(S.weekOffset); const menu = api.publishedMenu(wk); const db = api.db;
    if (S.weekOffset === 0 && dayState(wk, S.day) === 'past' && !S._dayTouched) S.day = FP.todayDay();
    const days = DAYS.map((d) => { const dt = FP.dateOf(wk, d); const st = dayState(wk, d); return `<button class="day ${S.day === d ? 'on' : ''} ${st === 'past' ? 'past' : ''}" data-act="day" data-d="${d}"><div class="dn">${d}</div><div class="dd">${dt.getDate()}</div>${st === 'today' ? '<div class="today-dot"></div>' : ''}</button>`; }).join('');
    const filt = (list) => list.filter((r) => !S.vegOnly || r.diet !== 'nonveg');
    const slotBlock = (slot, title, time) => {
      const list = filt(dishesFor(wk, S.day, slot));
      return `<div class="slot-head"><span style="font-size:24px">${slot === 'morning' ? '☀️' : '🌙'}</span><div><h3>${title}</h3><div class="sub">${time}</div></div></div>
        <div class="menu-card">${list.length ? list.map((r) => dishRow(r, slot, wk, S.day)).join('') : `<div class="empty small">No ${S.vegOnly ? 'veg ' : ''}${petKind()} bowl in this slot — try another day.</div>`}</div>`;
    };
    const extras = db.recipes.filter((r) => r.course !== 'meal' && r.available && fitsPet(r));
    const c = me(); const p = pet();
    const st = dayState(wk, S.day);
    return `
      <div class="week-head">
        <div class="row between"><a href="#/home" class="row semibold" style="color:var(--sage-deep)">${icons.back} Home</a><span class="badge" style="background:rgba(255,255,255,.14);color:#fff">${menu ? '● Published' : 'Coming soon'}</span></div>
        <div class="eyebrow" style="color:#E8C27E;margin-top:12px">Weekly menu · ${FP.weekLabel(wk)}</div>
        <h1>A new menu every week</h1>
        <p class="small" style="opacity:.85;margin-top:4px">${esc(db.settings.cutoff)}</p>
        <div class="week-toggle">${[[0, 'This week'], [1, 'Next week']].map(([o, l]) => `<button class="${S.weekOffset === o ? 'on' : ''}" data-act="week" data-o="${o}">${l}</button>`).join('')}</div>
      </div>
      ${!menu ? `<div class="empty"><div class="big">👩‍🍳</div><h3>Next week's menu drops soon</h3><p class="small" style="margin-top:6px">Our chefs are planning fresh recipes. It'll appear here the moment it's published.</p><button class="btn btn-ghost" style="margin-top:16px" data-act="week" data-o="0">Back to this week</button></div>` : `
      <div class="days">${days}</div>
      <div class="filters">
        ${c.pets.map((x) => `<button class="chip ${p && p.id === x.id ? 'on' : ''}" data-act="pet" data-id="${x.id}" aria-pressed="${p && p.id === x.id}">${petEmoji(x)} ${esc(x.name)}</button>`).join('')}
        ${p && p.diet === 'veg' ? '<span class="chip">🥦 Veg only</span>' : `<button class="veg-toggle" data-act="veg"><span class="switch ${S.vegOnly ? 'on' : ''}"></span>Veg only</button>`}
        <span class="chip">${recommendedPortion()} portion</span>
      </div>
      ${menu.note ? `<div style="margin:6px 16px 0" class="small semibold"><span style="color:var(--mustard-deep)">${esc(menu.note)}</span></div>` : ''}
      ${st === 'past' ? `<div class="card" style="margin:12px 16px 0;padding:12px 14px;font-weight:700;font-size:13.5px">⏱ ${DAY_NAMES[S.day]}'s bowls have been served. Pick today or an upcoming day to order.</div>` : st === 'future' ? `<div class="card" style="margin:12px 16px 0;padding:12px 14px;font-weight:700;font-size:13.5px;background:var(--sage)">📅 Pre-order for ${fmtDay(FP.dateOf(wk, S.day))} — cooked fresh that morning.</div>` : ''}
      ${slotBlock('morning', 'Morning bowl', 'Delivered 8–10 AM or with lunch')}
      ${slotBlock('evening', 'Evening bowl', 'Delivered 6–8 PM')}
      ${filt(extras).length ? `<div class="slot-head"><span style="font-size:24px">${petKind(p) === 'cat' ? '🐟' : '🦴'}</span><div><h3>Treats & add-ons</h3><div class="sub">Available every day</div></div></div>
      <div class="menu-card">${filt(extras).map((r) => dishRow(r, 'anytime', wk, S.day)).join('')}</div>` : ''}
      <div class="card" style="margin:20px 16px 0;padding:14px 16px;background:var(--mustard-soft);border:0"><b>🥗 Nutrition split</b><div class="small muted" style="margin-top:4px">Non-veg bowls: 50% protein · 25% carbs · 20% veg · 5% fat. Veg bowls: 30% protein · 30% carbs · 30% veg · 10% fat. Vegetarian diets can run short on taurine, L-carnitine & B12 — ask your vet about a supplement.</div></div>`}
      <div class="sign-off" style="font-size:30px">Every recipe is human-grade. 🐾</div>`;
  }

  /** Recipes in a category — only ones suitable for the selected pet. */
  function catList(cat) {
    let list = api.db.recipes.filter((r) => r.available && fitsPet(r));
    if (cat === 'dog' || cat === 'cat') list = list.filter((r) => r.course === 'meal');
    if (cat === 'puppy') list = list.filter((r) => r.course === 'meal' && (r.tags.includes('Puppy') || /egg|curd|khichdi/i.test(r.name)));
    if (cat === 'kitten') list = list.filter((r) => r.course === 'meal' && (r.tags.includes('Kitten') || /pâté|tuna|fish/i.test(r.name)));
    if (cat === 'veg') list = list.filter((r) => r.diet !== 'nonveg' && r.course === 'meal');
    if (cat === 'treat') list = list.filter((r) => r.course === 'treat');
    if (cat === 'addon') list = list.filter((r) => r.course === 'addon');
    if (cat === 'gentle') list = list.filter((r) => /khichdi|congee|curd|pâté|rice/i.test(r.name));
    if (cat === 'best') list = list.filter((r) => r.rating >= 4.6 || r.tags.includes('Bestseller'));
    return list;
  }
  function Search(cat) {
    const q = S.query.trim().toLowerCase(); const wk = thisWeek(); const day = FP.todayDay();
    const titles = { dog: 'Dog meals', cat: 'Cat meals', puppy: 'For puppies', kitten: 'For kittens', veg: 'Veg & egg bowls', treat: 'Treats', addon: 'Add-ons', gentle: 'Gentle on tummies', best: 'Bestsellers' };
    let list = catList(cat);
    if (q) list = list.filter((r) => (r.name + ' ' + r.ingredients).toLowerCase().includes(q));
    const menu = api.publishedMenu(wk);
    const nextServing = (r) => {
      if (r.course !== 'meal') return { day, slot: 'anytime' };
      if (!menu) return null;
      for (let i = DAYS.indexOf(day); i < 7; i++) for (const slot of FP.SLOTS) { const s = menu.days[DAYS[i]][slot]; if (s.nonveg === r.id || s.veg === r.id) return { day: DAYS[i], slot }; }
      return null;
    };
    return `<header class="appbar"><a class="icon-btn" href="#/home">${icons.back}</a><label class="search" style="padding:9px 12px">${icons.search}<input id="q" placeholder="Search dishes or ingredients" value="${esc(S.query)}" data-oninput="q" autofocus></label></header>
      ${cat ? `<div style="padding:4px 16px 0"><span class="chip on">${titles[cat] || esc(cat)} <a href="#/search" aria-label="Clear">✕</a></span></div>` : ''}
      <div class="menu-card" style="margin-top:12px">${list.length ? list.map((r) => {
        const ns = nextServing(r);
        if (!ns) return `<div class="dish" style="opacity:.75"><div class="grow"><div class="row" style="gap:6px">${vmark(r.diet)}</div><h4>${esc(r.name)}</h4><div class="small muted">${esc(r.ingredients)}</div><div class="badge b-line" style="margin-top:6px">Not on this week's menu</div></div><div class="dish-img">${foodArt(r, 90)}</div></div>`;
        return dishRow(r, ns.slot, wk, ns.day, `<div class="badge b-sage" style="margin-bottom:4px">${ns.slot === 'anytime' ? 'Available today' : `${ns.day === day ? 'Today' : DAY_NAMES[ns.day]} · ${ns.slot}`}</div>`);
      }).join('') : '<div class="empty"><div class="big">🔍</div>No dishes found.</div>'}</div>`;
  }

  function Instructions() {
    const p = pet(); const I = S.ins;
    if (I.allergies === null) I.allergies = p ? [...p.allergies] : [];
    return `<div class="c-section before">
      <div class="eyebrow">Before you order</div>
      <h3 style="font-size:19px;margin:2px 0 10px">Tell the kitchen about ${esc(p ? p.name : 'your pet')}'s bowl</h3>
      <div class="ins-block"><div class="ins-h">💬 Comment</div><textarea class="input" id="ins-comment" data-oninput="ins" data-k="comment" placeholder="Anything we should know? e.g. Bruno has been a bit fussy this week">${esc(I.comment)}</textarea></div>
      <div class="ins-block"><div class="ins-h">🎯 Customization</div>
        <div class="tag-pick">${CUSTOMIZATIONS.map((c) => `<button type="button" class="chip ${I.customization.includes(c) ? 'on' : ''}" data-act="ins-tog" data-k="customization" data-v="${esc(c)}">${esc(c)}</button>`).join('')}</div>
        <input class="input" id="ins-customText" style="margin-top:8px" data-oninput="ins" data-k="customText" value="${esc(I.customText)}" placeholder="Other customization (e.g. no carrots, extra pumpkin)"></div>
      <div class="ins-block"><div class="ins-h">✨ Any special request</div><textarea class="input" id="ins-request" data-oninput="ins" data-k="request" placeholder="e.g. Pack treats separately, leave with the guard, birthday note 🎂">${esc(I.request)}</textarea></div>
      <div class="ins-block"><div class="ins-h">⚠️ Any allergies</div>
        <div class="tag-pick">${ALLERGENS.map((a) => `<button type="button" class="chip allergy-chip ${I.allergies.includes(a) ? 'on' : ''}" data-act="ins-tog" data-k="allergies" data-v="${a}">${a}</button>`).join('')}</div>
        <input class="input" id="ins-allergyText" style="margin-top:8px" data-oninput="ins" data-k="allergyText" value="${esc(I.allergyText)}" placeholder="Other allergies or medical conditions">
        <div class="tiny muted" style="margin-top:6px">${I.allergies.length || I.allergyText ? '✅ The kitchen checks every bowl against this list before packing.' : 'No allergies selected — tap any that apply.'}</div></div>
    </div>`;
  }

  function Cart() {
    const c = me(); const p = pet(); const a = addr(); const db = api.db; const R = ref();
    if (!S.cart.items.length) return `<header class="appbar"><a class="icon-btn" href="#/home">${icons.back}</a><b>Cart</b></header><div class="empty"><div class="big">🥣</div><h3>Your bowl is empty</h3><p class="small" style="margin:6px 0 16px">Fresh meals for ${esc(p ? p.name : 'your pet')} are a tap away.</p>${R.available ? `<p class="small" style="margin:-6px 0 14px;color:var(--pine);font-weight:800">🎁 You have ${R.available} free meal${R.available > 1 ? 's' : ''} to use</p>` : ''}<a href="#/menu" class="btn btn-primary">Browse this week's menu</a></div>`;
    const hasMeal = S.cart.items.some((i) => i.course === 'meal');
    if (S.useFreeMeal && (!R.available || !hasMeal)) S.useFreeMeal = false;
    const q = api.quote(S.cart.items, S.cart.coupon, { freeMeal: S.useFreeMeal });
    if (!S.deliverySlot) S.deliverySlot = S.cart.items.some((i) => i.slot === 'morning') ? DELIVERY_SLOTS[0] : DELIVERY_SLOTS[2];
    const toFree = db.settings.freeAbove - q.subtotal;
    const slotLabel = { morning: '☀️ Morning bowl', evening: '🌙 Evening bowl', anytime: '🦴 Treat / add-on' };
    return `
      <header class="appbar"><a class="icon-btn" href="#/menu">${icons.back}</a><div class="grow"><b>FoodPeto Kitchen</b><div class="tiny muted">Delivering ${fmtDay(FP.dateOf(S.cart.week, S.cart.day))} · ${esc(a ? a.area : '')}</div></div></header>
      ${toFree > 0 ? `<div class="c-section" style="background:var(--sage)"><div class="small bold">Add ${money(toFree)} more for FREE delivery 🛵</div><div class="progress"><span style="width:${Math.min(100, (q.subtotal / db.settings.freeAbove) * 100)}%"></span></div></div>` : `<div class="c-section" style="background:var(--sage)"><div class="small bold">🎉 Yay! You get free delivery on this order</div></div>`}
      <div class="c-section">
        ${S.cart.items.map((i) => { const r = api.recipe(i.recipeId); const hit = r && allergyHit(r); return `<div class="c-line">${vmark(i.diet)}<div class="grow"><div class="semibold">${esc(i.name)}</div><div class="tiny muted">${slotLabel[i.slot]} · ${esc(i.portion)}</div></div>
          <div class="add-btn solid"><button data-act="line" data-k="${esc(i.key)}" data-d="-1">−</button><span>${i.qty}</span><button data-act="line" data-k="${esc(i.key)}" data-d="1">+</button></div><b style="width:62px;text-align:right">${money(i.price * i.qty)}</b></div>${hit ? `<div class="warn" style="margin:0 0 6px 24px">⚠ Contains ${esc(hit.toLowerCase())}</div>` : ''}${r && p && !fitsPet(r) ? `<div class="warn" style="margin:0 0 6px 24px">✕ Not for ${esc(p.name)} — ${whyNot(r)}. Remove it or switch pet.</div>` : ''}`; }).join('')}
        <div class="dashed"></div>
        <div class="row between"><a class="link small" href="#/menu">+ Add more items</a><button class="small semibold muted" data-act="clear-cart">Clear cart</button></div>
      </div>
      <div class="c-section">
        <div class="small bold muted" style="margin-bottom:8px">COOKING FOR</div>
        <div class="pets-row">${c.pets.map((x) => `<button class="pet-chip ${p && p.id === x.id ? 'on' : ''}" data-act="pet" data-id="${x.id}"><span class="pe">${petEmoji(x)}</span>${esc(x.name)}</button>`).join('')}</div>
      </div>
      ${Instructions()}
      ${R.available ? `<button class="c-section row free-toggle ${S.useFreeMeal ? 'on' : ''}" data-act="free-meal" ${hasMeal ? '' : 'disabled'}><span style="font-size:26px">🎁</span><div class="grow" style="text-align:left"><b>Use a free meal</b><div class="small muted">${hasMeal ? `You have ${R.available} from referrals · saves ${money(api.quote(S.cart.items, null, { freeMeal: true }).freeMeal)}` : 'Add a meal bowl to use it'}</div></div><span class="switch ${S.useFreeMeal ? 'on' : ''}"></span></button>` : `<a class="c-section row" href="#/refer" style="display:flex"><span style="font-size:22px">🎁</span><div class="grow"><b>Get a free meal</b><div class="small muted">Invite ${R.per} friends · ${R.towardNext}/${R.per} done</div></div>${icons.chev}</a>`}
      <button class="c-section row" style="width:calc(100% - 32px);text-align:left" data-act="coupons">
        <span style="color:var(--mustard);font-size:22px">%</span><div class="grow">${q.coupon ? `<b>'${q.coupon}' applied</b><div class="small" style="color:var(--pine);font-weight:700">You saved ${money(q.discount)} 🎉</div>` : '<b>Apply coupon</b><div class="small muted">View all offers</div>'}</div>${q.coupon ? `<span class="link small" data-act="rm-coupon">Remove</span>` : icons.chev}
      </button>
      ${q.couponError && S.cart.coupon ? `<div class="small" style="color:var(--danger);margin:-4px 20px 0;font-weight:700">${esc(q.couponError)}</div>` : ''}
      <div class="c-section">
        <div class="small bold muted" style="margin-bottom:8px">DELIVERY SLOT · ${fmtDay(FP.dateOf(S.cart.week, S.cart.day)).toUpperCase()}</div>
        <div class="row wrap">${DELIVERY_SLOTS.map((s) => `<button class="chip ${S.deliverySlot === s ? 'on' : ''}" data-act="dslot" data-v="${s}">${s}</button>`).join('')}</div>
        <div class="divider"></div>
        <button class="row" style="width:100%;text-align:left" data-act="pick-addr"><span class="li" style="color:var(--mustard)">${icons.pin}</span><div class="grow"><b>Deliver to ${esc(a.label)}</b><div class="small muted ellipsis">${esc(a.line)}, ${esc(db.settings.city)}</div></div><span class="link small">Change</span></button>
      </div>
      <div class="c-section bill">
        <div class="bold" style="margin-bottom:6px">Bill details</div>
        <div class="kv"><span>Item total</span><span>${money(q.subtotal)}</span></div>
        <div class="kv"><span>Delivery fee · ${a.km} km</span><span>${q.delivery ? money(q.delivery) : '<s class="faint">' + money(db.settings.deliveryFee) + '</s> <b style="color:var(--pine)">FREE</b>'}</span></div>
        <div class="kv"><span>Eco-friendly packing</span><span>${money(q.packing)}</span></div>
        <div class="kv"><span>GST (${db.settings.gstPct}%)</span><span>${money(q.taxes)}</span></div>
        ${q.freeMeal ? `<div class="kv" style="color:var(--pine);font-weight:800"><span>🎁 Free meal (referral reward)</span><span>−${money(q.freeMeal)}</span></div>` : ''}
        ${q.discount ? `<div class="kv" style="color:var(--pine);font-weight:800"><span>Coupon ${q.coupon}</span><span>−${money(q.discount)}</span></div>` : ''}
        <div class="dashed"></div>
        <div class="kv total"><span>To pay</span><span>${money(q.total)}</span></div>
      </div>
      <div class="c-section">
        <div class="bold" style="margin-bottom:4px">Pay with</div>
        ${[['UPI', '📱', 'Google Pay, PhonePe, Paytm'], ['Card', '💳', 'Credit / debit card'], ['Cash on delivery', '💵', 'Pay cash or UPI at your door']].map(([v, e, d]) => `<button class="pay-opt" data-act="pay" data-v="${v}"><span style="font-size:22px">${e}</span><div class="grow"><b>${v}</b><div class="tiny muted">${d}</div></div><span class="radio ${S.payment === v ? 'on' : ''}"></span></button>`).join('')}
      </div>
      <p class="tiny faint center" style="padding:6px 30px 120px">Review your order and address details to avoid cancellations. Orders can be cancelled until the kitchen starts cooking.</p>
      <div class="checkout-bar"><div><div class="bold" style="font-size:18px">${money(q.total)}</div><a class="tiny link" href="#bill" onclick="document.querySelector('.bill').scrollIntoView({behavior:'smooth'});return false">View detailed bill</a></div>
        <button class="btn btn-primary btn-lg grow" data-act="place" ${S.busy ? 'disabled' : ''}>${S.busy ? 'Placing order…' : S.payment === 'Cash on delivery' ? 'Place order' : `Pay ${money(q.total)}`} ${icons.chev}</button></div>`;
  }

  function mapSvg(o) {
    const pos = o.status === 'delivered' ? 'home' : o.status === 'out' ? 'moving' : 'kitchen';
    return `<svg viewBox="0 0 440 190" width="100%" style="display:block" role="img" aria-label="Delivery route">
      <rect width="440" height="190" fill="#EFEBD8"/>
      <g stroke="#E2DCC0" stroke-width="14" fill="none"><path d="M0 60 H440"/><path d="M0 150 H440"/><path d="M150 0 V190"/><path d="M320 0 V190"/></g>
      <g fill="#DCE8D5"><rect x="170" y="78" width="60" height="50" rx="8"/><rect x="20" y="10" width="80" height="34" rx="8"/><rect x="340" y="110" width="80" height="30" rx="8"/></g>
      <path id="route" d="M60,130 C120,40 200,170 260,90 S360,40 380,70" fill="none" stroke="#3D5C3A" stroke-width="4" stroke-dasharray="8 7" stroke-linecap="round"/>
      <g transform="translate(60,130)"><circle r="20" fill="#fff" stroke="#3D5C3A" stroke-width="3"/><text text-anchor="middle" dy="7" font-size="20">🧑‍🍳</text></g>
      <g transform="translate(380,70)"><circle r="20" fill="#fff" stroke="#C98A2E" stroke-width="3"/><text text-anchor="middle" dy="7" font-size="20">🏠</text></g>
      ${pos === 'moving' ? `<g><circle r="17" fill="#C98A2E"/><text text-anchor="middle" dy="6" font-size="17">🛵</text><animateMotion dur="14s" repeatCount="indefinite" keyPoints="0;0.95" keyTimes="0;1" calcMode="linear"><mpath href="#route"/></animateMotion></g>` : ''}
      ${pos === 'home' ? `<g transform="translate(350,48)"><circle r="14" fill="#3D5C3A"/><text text-anchor="middle" dy="5" font-size="14" fill="#fff">✓</text></g>` : ''}
    </svg>`;
  }
  function insSummary(ins) {
    if (!ins) return '';
    const rows = [['💬 Comment', ins.comment], ['🎯 Customization', [...(ins.customization || []), ins.customText].filter(Boolean).join(', ')], ['✨ Special request', ins.request], ['⚠️ Allergies', [...(ins.allergies || []), ins.allergyText].filter(Boolean).join(', ')]].filter((r) => r[1]);
    return rows.length ? `<div class="c-section"><b>Your instructions</b>${rows.map(([k, v]) => `<div class="kv"><span class="muted">${k}</span><span style="text-align:right;max-width:62%">${esc(v)}</span></div>`).join('')}</div>` : '';
  }

  function Track(id) {
    const o = api.order(id); if (!o) return `<div class="empty">Order not found. <a class="link" href="#/orders">My orders</a></div>`;
    const s = FP.status(o); const r = o.riderId && api.rider(o.riderId); const p = me().pets.find((x) => x.id === o.petId) || { name: o.petName, species: o.petSpecies };
    const eta = { placed: '~45 min', cooking: '~35 min', ready: '~25 min', out: '~12 min' }[o.status];
    const steps = FP.FLOW.map((k) => { const t = o.timeline.find((x) => x.s === k); const i = FP.FLOW.indexOf(o.status); const done = FP.FLOW.indexOf(k) < i || o.status === 'delivered'; const now = k === o.status && o.status !== 'delivered'; return `<div class="tl-step ${done ? 'done' : ''} ${now ? 'now' : ''}"><span class="dot">${done ? '✓' : ''}</span><div><div class="t">${FP.STATUS[k].label}</div><div class="small muted">${t ? fmtTime(t.at) : k === 'out' && r && o.status !== 'out' ? `${esc(r.name.split(' ')[0])} is heading to the kitchen` : ''}</div></div></div>`; }).join('');
    return `
      <div class="track-hero">
        <div class="row between"><a href="#/orders" class="row semibold" style="color:var(--sage-deep)">${icons.back} Orders</a><span class="tiny" style="opacity:.8">#${o.id}</span></div>
        <h1>${o.status === 'cancelled' ? 'Order cancelled' : o.status === 'delivered' ? `Delivered to ${esc(p.name || 'your pet')}! 🐾` : esc(s.label)}</h1>
        <p style="opacity:.85;font-weight:700">${eta ? `Arriving in ${eta} · ${esc(o.slot)}` : esc(s.cust)}</p>
      </div>
      <div class="map-card">${mapSvg(o)}</div>
      ${isActive(o) ? `<div class="c-section row between"><div><b>Share OTP at delivery</b><div class="small muted">Only share once your order is in hand</div></div><div class="otp-box">${String(o.otp).split('').map((d) => `<span>${d}</span>`).join('')}</div></div>` : ''}
      ${r ? `<div class="c-section row"><span class="avatar" style="background:var(--mustard)">${esc(r.name[0])}</span><div class="grow"><b>${esc(r.name)}</b><div class="small muted">${icons.star} ${r.rating} · ${esc(r.vehicle.split(' · ')[0])}</div><div class="tiny muted">${o.status === 'out' ? 'On the way to you' : o.status === 'delivered' ? 'Delivered your order' : 'Assigned · will pick up when packed'}</div></div><a class="icon-btn" href="tel:${r.phone}" aria-label="Call">${icons.phone}</a></div>` : isActive(o) ? `<div class="c-section row"><span class="li" style="font-size:24px">🛵</span><div class="small muted">We'll assign a delivery partner as soon as your food is nearly ready.</div></div>` : ''}
      ${o.status !== 'cancelled' ? `<div class="c-section"><div class="timeline">${steps}</div></div>` : ''}
      ${o.status === 'delivered' && !o.rating ? `<div class="c-section center"><b>How did ${esc(p.name || 'your pet')} like it?</b><div class="star-pick" style="margin-top:6px">${[1, 2, 3, 4, 5].map((n) => `<button data-act="rate" data-n="${n}" data-id="${o.id}" aria-label="${n} stars">★</button>`).join('')}</div></div>` : o.rating ? `<div class="c-section row between"><b>You rated</b>${UI.stars(o.rating)}</div>` : ''}
      ${insSummary(o.instructions)}
      <div class="c-section">
        <div class="row between"><b>Order summary</b><span class="small muted">${fmtDay(o.forDate)}</span></div>
        <div class="small muted" style="margin:2px 0 8px">For ${petEmoji(p)} ${esc(p.name || '')} · ${esc(o.address.label)} · ${esc(o.payment)}</div>
        ${o.items.map((i) => `<div class="kv"><span class="row" style="gap:6px">${vmark(i.diet)} ${esc(i.name)} × ${i.qty} <span class="tiny faint">${esc(i.portion)}</span></span><span>${money(i.price * i.qty)}</span></div>`).join('')}
        ${o.freeMeal ? `<div class="kv" style="color:var(--pine);font-weight:800"><span>🎁 Free meal</span><span>−${money(o.freeMeal)}</span></div>` : ''}
        ${o.discount ? `<div class="kv" style="color:var(--pine);font-weight:800"><span>Coupon ${esc(o.coupon || '')}</span><span>−${money(o.discount)}</span></div>` : ''}
        <div class="dashed"></div>
        <div class="kv bold"><span>Total ${o.payment === 'Cash on delivery' ? 'to pay' : 'paid'}</span><span>${money(o.total)}</span></div>
      </div>
      <div style="padding:6px 16px 120px" class="col">
        ${o.status === 'placed' ? `<button class="btn btn-danger btn-block" data-act="cancel" data-id="${o.id}">Cancel order</button>` : ''}
        <a class="btn btn-ghost btn-block" href="https://wa.me/91${api.db.settings.phone}?text=${encodeURIComponent('Hi FoodPeto, I need help with order #' + o.id)}" target="_blank" rel="noopener" style="color:#1C8A4A">${icons.whatsapp} Chat with us on WhatsApp</a>
      </div>`;
  }

  function Orders() {
    const list = myOrders();
    if (!list.length) return `<header class="appbar"><h2>Your orders</h2></header><div class="empty"><div class="big">🧾</div>No orders yet.<br><a class="btn btn-primary" style="margin-top:14px" href="#/menu">Order fresh food</a></div>`;
    const card = (o) => { const names = o.items.map((i) => i.name).join(', '); return `<div class="card" style="padding:14px 16px;margin-bottom:12px">
      <a href="#/track/${o.id}" class="row between"><div><b>${esc(names.slice(0, 52))}${names.length > 52 ? '…' : ''}</b><div class="small muted">#${o.id} · ${fmtDay(o.createdAt)} · ${money(o.total)}</div></div>${statusBadge(o)}</a>
      <div class="dashed" style="margin:10px 0"></div>
      <div class="row between">${o.rating ? `<span class="small">${UI.stars(o.rating)}</span>` : isActive(o) ? `<a class="link small" href="#/track/${o.id}">Track order →</a>` : '<span class="small muted">Not rated</span>'}
      ${!isActive(o) ? `<button class="btn btn-ghost btn-sm" data-act="reorder" data-id="${o.id}">↻ Reorder</button>` : ''}</div></div>`; };
    const act = list.filter(isActive); const past = list.filter((o) => !isActive(o));
    return `<header class="appbar"><h2 style="font-size:24px">Your orders</h2></header>
      <div style="padding:0 16px">${act.length ? `<div class="eyebrow" style="margin:6px 0 10px">Active</div>${act.map(card).join('')}` : ''}
      <div class="eyebrow" style="margin:14px 0 10px">Past orders</div>${past.map(card).join('') || '<p class="muted small">None yet.</p>'}</div>`;
  }

  function Plans() {
    const db = api.db; const c = me(); const subs = db.subscriptions;
    return `<div class="week-head"><div class="row between"><a href="#/home" class="row semibold" style="color:var(--sage-deep)">${icons.back} Home</a></div><div class="eyebrow" style="color:#E8C27E;margin-top:12px">Flexible meal plans</div><h1>Fresh bowls on autopilot</h1><p class="small" style="opacity:.85;margin-top:4px">Daily, weekly, or monthly. Pause, skip, or change meals anytime.</p></div>
      ${subs.length ? `<div class="section"><div class="section-title"><h2>Your subscriptions</h2></div>${subs.map((s) => { const pl = db.plans.find((x) => x.id === s.planId) || { name: 'Plan', days: 1 }; const p = c.pets.find((x) => x.id === s.petId); const left = Math.max(0, Math.ceil((s.start + pl.days * 864e5 - Date.now()) / 864e5)); return `<div class="card" style="padding:14px 16px;margin-bottom:10px"><div class="row between"><b>${esc(pl.name)} · ${petEmoji(p)} ${esc(p ? p.name : '')}</b><span class="badge ${s.status === 'active' ? 'b-sage' : 'b-mustard'}">${s.status}</span></div><div class="small muted">${s.diet === 'veg' ? 'Veg' : 'Non-veg'} · ${esc(s.slot)} · ${left} days left</div><div class="progress"><span style="width:${100 - (left / pl.days) * 100}%"></span></div><div class="row" style="margin-top:10px">${s.status === 'active' ? `<button class="btn btn-ghost btn-sm" data-act="sub" data-id="${s.id}" data-v="paused">Pause</button>` : `<button class="btn btn-primary btn-sm" data-act="sub" data-id="${s.id}" data-v="active">Resume</button>`}</div></div>`; }).join('')}</div>` : ''}
      <div class="section"><div class="col" style="gap:14px">${db.plans.map((pl, i) => `<div class="card plan ${i === 1 ? 'feature' : ''}"><span class="ribbon">${esc(pl.badge)}</span>
        <div class="eyebrow">${pl.days} days · ${pl.days * pl.mealsPerDay} meals</div><h3 style="font-size:22px;margin:4px 0">${esc(pl.name)}</h3>
        <div class="row" style="align-items:baseline;gap:8px"><span class="pp">${money(pl.price)}</span><s class="faint">${money(pl.mrp)}</s><span class="badge b-sage">Save ${Math.round((1 - pl.price / pl.mrp) * 100)}%</span></div>
        <div class="small muted" style="margin:4px 0 10px">${money(Math.round(pl.price / (pl.days * pl.mealsPerDay)))} per meal · ${esc(pl.desc)}</div>
        <div class="col" style="gap:4px;margin-bottom:14px"><span class="perk">Follows the weekly menu</span><span class="perk">Allergen-safe swaps included</span><span class="perk">Free delivery on every drop</span></div>
        <button class="btn ${i === 1 ? 'btn-primary' : 'btn-ghost'} btn-block" data-act="plan" data-id="${pl.id}">Choose ${esc(pl.name)}</button></div>`).join('')}</div></div>
      <div class="sign-off" style="font-size:30px">Pause, skip or cancel anytime. 🐾</div>`;
  }

  const VET_MODES = { clinic: '🏥 At clinic', home: '🏠 Home visit', video: '📹 Video call' };
  const VET_REQ = { new: ['Request sent', 'b-mustard'], contacted: ['Clinic contacted you', 'b-info'], booked: ['Appointment booked', 'b-sage'], closed: ['Closed', 'b-line'] };
  function Vets() {
    const vets = api.db.vets || []; const reqs = (api.db.vetRequests || []).slice().sort((a, b) => b.createdAt - a.createdAt); const p = pet();
    const fitting = vets.filter((v) => !p || !v.specialties.some((s) => s === 'Dogs' || s === 'Cats') || v.specialties.includes(p.species === 'cat' ? 'Cats' : 'Dogs'));
    return `<div class="week-head" style="padding-bottom:22px"><div class="row between"><a href="#/profile" class="row semibold" style="color:var(--sage-deep)">${icons.back} Account</a></div>
        <div class="eyebrow" style="color:#E8C27E;margin-top:12px">Vet care</div><h1>Trusted vets for ${esc(p ? p.name : 'your pet')}</h1>
        <p class="small" style="opacity:.85;margin-top:4px">FoodPeto partner clinics — with a discount for our pet parents.</p></div>
      ${reqs.length ? `<div class="section"><div class="section-title"><h2 style="font-size:19px">Your requests</h2></div>${reqs.map((r) => `<div class="card" style="padding:12px 14px;margin-bottom:8px"><div class="row between"><b>${esc(r.vetName)}</b><span class="badge ${VET_REQ[r.status][1]}">${VET_REQ[r.status][0]}</span></div><div class="small muted">${r.petSpecies === 'cat' ? '🐱' : '🐶'} ${esc(r.petName)} · ${VET_MODES[r.mode] || ''} · ${fmtDate(r.createdAt)}</div></div>`).join('')}</div>` : ''}
      <div class="section">${fitting.length ? fitting.map((v) => `<div class="card" style="padding:16px;margin-bottom:12px">
        <div class="row" style="gap:12px"><span class="avatar" style="width:48px;height:48px;background:var(--sage);font-size:24px">🩺</span><div class="grow"><b style="font-size:16px">${esc(v.name)}</b><div class="small muted">${esc(v.clinic)}${v.area ? ` · ${esc(v.area)}` : ''}</div></div>${v.discountPct ? `<span class="badge b-mustard">${v.discountPct}% off</span>` : ''}</div>
        <div class="row wrap" style="gap:4px;margin-top:10px">${v.specialties.map((s) => `<span class="badge b-line">${esc(s)}</span>`).join('')}</div>
        <div class="small" style="margin-top:10px">${v.modes.map((m) => VET_MODES[m]).join(' · ')}</div>
        ${v.hours ? `<div class="small muted">🕒 ${esc(v.hours)}</div>` : ''}
        <div class="row between" style="margin-top:10px"><div><span class="small muted">Consultation </span>${v.discountPct ? `<s class="faint small">${money(v.consultFee)}</s> ` : ''}<b>${money(Math.round(v.consultFee * (1 - v.discountPct / 100)))}</b></div><span class="tiny muted">FoodPeto member price</span></div>
        <div class="row" style="margin-top:12px"><a class="btn btn-ghost btn-sm" href="tel:+91${esc(v.phone)}">${icons.phone} Call</a><button class="btn btn-primary btn-sm grow" data-act="vet-req" data-id="${v.id}">Request consultation</button></div></div>`).join('') : `<div class="card empty"><div class="big">🩺</div>Partner vets are coming soon to your area.</div>`}</div>
      <p class="tiny faint center" style="padding:0 30px">Consultations are provided by the clinic, not FoodPeto. In an emergency, call the clinic directly.</p>
      <div class="sign-off" style="font-size:30px">Healthy food, healthy paws. 🐾</div>`;
  }
  function vetRequestSheet(v) {
    const c = me(); let petId = (pet() || c.pets[0]).id; let mode = v.modes[0];
    const draw = () => `<h3 style="font-size:20px">Request a consultation</h3><p class="small muted" style="margin:2px 0 12px">${esc(v.name)} · ${esc(v.clinic)} will call you on +91 ${esc(c.phone)} to confirm a time.</p>
      <div class="field"><label>For</label><div class="pets-row">${c.pets.map((x) => `<button class="pet-chip ${petId === x.id ? 'on' : ''}" data-x="pet" data-v="${x.id}"><span class="pe">${petEmoji(x)}</span>${esc(x.name)}</button>`).join('')}</div></div>
      <div class="field" style="margin-top:12px"><label>Visit type</label><div class="row wrap">${v.modes.map((m) => `<button class="chip ${mode === m ? 'on' : ''}" data-x="mode" data-v="${m}">${VET_MODES[m]}</button>`).join('')}</div></div>
      <div class="field" style="margin-top:12px"><label>What's it about? *</label><textarea class="input" id="vr-msg" placeholder="e.g. vaccination due, itchy skin, diet advice">${esc(S._vrMsg || '')}</textarea></div>
      <div class="field" style="margin-top:12px"><label>Preferred time (optional)</label><input class="input" id="vr-time" value="${esc(S._vrTime || '')}" placeholder="e.g. Saturday morning"></div>
      <button class="btn btn-primary btn-block btn-lg" style="margin-top:14px" data-x="send">Send request</button>`;
    const el = sheet(`<div id="vrs">${draw()}</div>`);
    el.addEventListener('input', (e) => { if (e.target.id === 'vr-msg') S._vrMsg = e.target.value; if (e.target.id === 'vr-time') S._vrTime = e.target.value; });
    el.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-x]'); if (!b) return;
      if (b.dataset.x === 'pet') petId = b.dataset.v;
      if (b.dataset.x === 'mode') mode = b.dataset.v;
      if (b.dataset.x === 'send') {
        if (!(S._vrMsg || '').trim()) return toast('Tell the vet briefly what the visit is about');
        if (await api.call('requestVet', { vetId: v.id, petId, mode, message: S._vrMsg, preferred: S._vrTime })) { S._vrMsg = ''; S._vrTime = ''; closeSheet(); toast('Request sent — the clinic will call you 🩺'); }
        return;
      }
      el.querySelector('#vrs').innerHTML = draw();
    });
  }
  function Profile() {
    const c = me(); const db = api.db; const R = ref();
    return `<div class="week-head" style="padding-bottom:22px"><div class="row" style="gap:14px"><span class="avatar" style="width:56px;height:56px;font-size:24px;background:var(--cream-soft);color:var(--pine)">${esc(c.name[0])}</span><div><h1 style="font-size:24px">${esc(c.name)}</h1><div class="small" style="opacity:.85">${esc(c.email || '')}</div><div class="small" style="opacity:.85">+91 ${esc(c.phone)}</div></div></div></div>
      <div class="section"><div class="section-title"><h2>My pets</h2><button class="link small" data-act="add-pet">+ Add pet</button></div>
        <div class="col" style="gap:10px">${c.pets.map((p) => `<button class="card row" style="padding:12px 14px;text-align:left" data-act="edit-pet" data-id="${p.id}"><span class="avatar" style="background:var(--sage);font-size:22px">${petEmoji(p)}</span><div class="grow"><b>${esc(p.name)}</b><div class="small muted">${esc(p.breed)} · ${p.ageY}y ${p.ageM}m · ${p.weight || '?'} kg · ${p.diet === 'veg' ? 'Veg' : p.diet === 'custom' ? 'Customised' : 'Non-veg'}</div>${p.allergies.length ? `<div class="tiny" style="color:var(--danger);font-weight:800">Allergic to ${esc(p.allergies.join(', '))}</div>` : ''}</div>${icons.edit}</button>`).join('')}</div></div>
      <div class="section"><div class="card" style="padding:4px 16px">
        <a class="list-row" href="#/refer"><span class="li">🎁</span><div class="grow"><b>Refer & earn</b><div class="small muted">Code ${esc(R.code)} · ${R.available} free meal${R.available === 1 ? '' : 's'} available</div></div>${icons.chev}</a>
        <a class="list-row" href="#/vets"><span class="li">🩺</span><div class="grow"><b>Vet care</b><div class="small muted">Partner vets · member discounts</div></div>${icons.chev}</a>
        <button class="list-row" data-act="pick-addr"><span class="li">${icons.pin}</span><div class="grow"><b>Addresses</b><div class="small muted">${c.addresses.length} saved</div></div>${icons.chev}</button>
        <a class="list-row" href="#/orders"><span class="li">${icons.orders}</span><div class="grow"><b>Your orders</b><div class="small muted">${myOrders().length} orders</div></div>${icons.chev}</a>
        <a class="list-row" href="#/plans"><span class="li">${icons.plans}</span><div class="grow"><b>Meal plans</b><div class="small muted">Manage subscriptions</div></div>${icons.chev}</a>
        <a class="list-row" href="https://wa.me/91${db.settings.phone}" target="_blank" rel="noopener"><span class="li" style="color:#1C8A4A">${icons.whatsapp}</span><div class="grow"><b>Help & support</b><div class="small muted">Chat on WhatsApp · ${esc(db.settings.phone)}</div></div>${icons.chev}</a>
        <a class="list-row" href="tel:+91${db.settings.phone}"><span class="li">${icons.phone}</span><div class="grow"><b>Call us</b><div class="small muted">+91 ${esc(db.settings.phone)}</div></div>${icons.chev}</a>
        <button class="list-row" data-act="change-pw"><span class="li">🔒</span><div class="grow"><b>Change password</b><div class="small muted">${esc(c.email || '')}</div></div>${icons.chev}</button>
        <button class="list-row" data-act="logout"><span class="li">${icons.logout}</span><div class="grow"><b>Log out</b></div></button>
      </div></div>
      <p class="tiny faint center" style="margin-top:20px">FoodPeto ${window.FP_APP && FP_APP.native ? `app v${esc(FP_APP.native.name)}` : 'web'} · <button class="tiny link" onclick="FP_checkForUpdates().then(()=>{ if(!document.querySelector('.upd-modal,.upd-bar')) UI.toast('You\\'re up to date ✓'); })">Check for updates</button></p>
      <div class="sign-off" style="font-size:30px">Happy paws. 🐾</div>`;
  }

  // ---------------- render ----------------
  function route() { const [name, arg] = (location.hash.slice(2) || 'home').split('/'); return { name, arg }; }
  function render(keepScroll) {
    const y = window.scrollY; const { name, arg } = route(); const c = me();
    const focused = document.activeElement && document.activeElement.id;
    let html; let nav = null;
    if (!session() || session().mustChange) html = Login();
    else if (!c) html = `<div class="empty"><div class="big">🐾</div>Loading…</div>`;
    else if (!c.pets.length) html = PetForm({}, { onboarding: true });
    else switch (name) {
      case 'menu': html = Menu(); nav = 'menu'; break;
      case 'search': html = Search(arg); break;
      case 'cart': html = Cart(); break;
      case 'track': html = Track(arg); break;
      case 'orders': html = Orders(); nav = 'orders'; break;
      case 'plans': html = Plans(); break;
      case 'refer': html = Refer(); nav = 'refer'; break;
      case 'profile': html = Profile(); nav = 'profile'; break;
      case 'vets': html = Vets(); break;
      default: html = Home(); nav = 'home';
    }
    app.className = 'phone-app' + (cartCount() && nav ? ' has-cart' : '');
    const ready = c && c.pets.length;
    app.innerHTML = `${api.online ? '' : '<div class="offline">Reconnecting to FoodPeto…</div>'}<main class="scroll-area">${html}</main>${ready && nav ? floating(name) + bottomNav(nav) : ready && ['search', 'plans'].includes(name) ? floating(name) : ''}`;
    const box = document.getElementById('auth-box'); if (box) AuthUI.mount(box, AUTH_CFG());
    if (keepScroll) window.scrollTo(0, y);
    const keep = focused && document.getElementById(focused);
    if (keep && /INPUT|TEXTAREA/.test(keep.tagName)) { keep.focus(); try { keep.setSelectionRange(keep.value.length, keep.value.length); } catch (e) { /* number inputs */ } }
    else if (!keepScroll && !document.getElementById('scrim')) { const af = app.querySelector('[autofocus]'); if (af) af.focus({ preventScroll: true }); }
  }

  // ---------------- sheets ----------------
  function portionSheet(r, slot, week, day) {
    if (r.course !== 'meal') { addLine(r, 'Pack', slot, week, day, 1); toast(`Added ${esc(r.name)} 🐾`); render(true); return; }
    const rec = recommendedPortion(); let pick = rec; let qty = 1;
    const draw = () => `<div class="row" style="gap:14px;margin-bottom:14px">${foodArt(r, 64)}<div><div class="row" style="gap:6px">${vmark(r.diet)}<b style="font-size:17px">${esc(r.name)}</b></div><div class="small muted">${esc(r.ingredients)}</div></div></div>
        <div class="bold" style="margin-bottom:8px">Choose portion <span class="faint small">· required</span></div>
        ${FP.PORTIONS.map((p) => `<button class="portion ${pick === p.id ? 'on' : ''}" data-act="ps-pick" data-v="${p.id}"><span class="radio ${pick === p.id ? 'on' : ''}"></span><div class="grow"><b>${p.label}</b> ${p.id === rec && pet() ? `<span class="badge b-mustard">Best for ${esc(pet().name)}</span>` : ''}<div class="tiny muted">${p.hint}</div></div><b>${money(FP.portionPrice(r.price, p.id))}</b></button>`).join('')}
        <p class="tiny muted" style="margin:4px 0 0">You can add comments, customizations and allergies at checkout.</p>
        <div class="row" style="margin-top:14px;gap:12px"><div class="add-btn" style="min-width:110px;height:48px"><button data-act="ps-q" data-d="-1">−</button><span>${qty}</span><button data-act="ps-q" data-d="1">+</button></div>
        <button class="btn btn-primary btn-lg grow" data-act="ps-add">Add item · ${money(FP.portionPrice(r.price, pick) * qty)}</button></div>`;
    const el = sheet(`<div id="ps">${draw()}</div>`); const box = el.querySelector('#ps');
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]'); if (!b) return; e.stopPropagation();
      if (b.dataset.act === 'ps-pick') pick = b.dataset.v;
      if (b.dataset.act === 'ps-q') qty = Math.max(1, Math.min(20, qty + +b.dataset.d));
      if (b.dataset.act === 'ps-add') { addLine(r, pick, slot, week, day, qty); closeSheet(); toast(`Added ${esc(r.name)} 🐾`); render(true); return; }
      box.innerHTML = draw();
    });
  }
  function startAdd(r, slot, week, day) {
    if (S.cart.items.length && (S.cart.week !== week || S.cart.day !== day)) {
      const el = sheet(`<h3 style="font-size:20px">Replace cart items?</h3><p class="muted" style="margin:8px 0 16px">Your cart has meals for <b>${DAY_NAMES[S.cart.day]}</b>. Each delivery is cooked for one day — discard those and add meals for <b>${DAY_NAMES[day]}</b> instead?</p><div class="row"><button class="btn btn-ghost grow" data-x="no">No</button><button class="btn btn-primary grow" data-x="yes">Replace</button></div>`);
      el.addEventListener('click', (e) => { const b = e.target.closest('[data-x]'); if (!b) return; closeSheet(); if (b.dataset.x === 'yes') { clearCart(); render(true); portionSheet(r, slot, week, day); } });
      return;
    }
    portionSheet(r, slot, week, day);
  }
  function addrSheet() {
    const c = me();
    const el = sheet(`<h3 style="font-size:20px;margin-bottom:10px">Choose a delivery address</h3>
      ${c.addresses.map((a) => `<button class="list-row" data-x="${a.id}"><span class="li">${a.label === 'Home' ? '🏠' : a.label === 'Work' ? '🏢' : '📍'}</span><div class="grow"><b>${esc(a.label)}</b><div class="small muted">${esc(a.line)} · ${a.km} km from kitchen</div></div>${addr() && addr().id === a.id ? '<span class="badge b-sage">Selected</span>' : ''}</button>`).join('')}
      <div class="divider"></div><b>Add new address</b>
      <div class="col" style="margin-top:8px"><div class="row"><input class="input" id="al" placeholder="Label (e.g. Mom's)" style="width:40%"><select class="input" id="aa">${FP.AREAS.map((x) => `<option>${x.name}</option>`).join('')}</select></div><input class="input" id="ad" placeholder="House / flat, street"><button class="btn btn-primary" data-x="new">Save address</button></div>`);
    el.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-x]'); if (!b) return;
      if (b.dataset.x === 'new') {
        const line = el.querySelector('#ad').value.trim(); if (!line) return toast('Enter the street address');
        const ok = await api.call('updateProfile', { addresses: [...c.addresses, { label: el.querySelector('#al').value.trim() || 'Other', area: el.querySelector('#aa').value, line }] });
        if (!ok) return; const list = me().addresses; S.addrId = list[list.length - 1].id;
      } else S.addrId = b.dataset.x;
      lsSet('cust.addr', S.addrId); closeSheet(); render(true);
    });
  }
  function couponSheet() {
    const sub = api.quote(S.cart.items, null).subtotal;
    const el = sheet(`<h3 style="font-size:20px">Offers for you</h3>
      <div class="row" style="margin:12px 0"><input class="input" id="cc" placeholder="Enter coupon code" style="text-transform:uppercase"><button class="btn btn-primary" data-x="typed">Apply</button></div>
      ${api.db.coupons.map((c) => `<div class="card" style="padding:14px;margin-bottom:10px"><div class="row between"><span class="badge b-mustard" style="font-size:13px">${icons.tag} ${esc(c.code)}</span><button class="link" data-x="${esc(c.code)}" ${sub < c.min ? 'disabled style="opacity:.4"' : ''}>APPLY</button></div><div class="semibold" style="margin-top:8px">${esc(c.desc)}</div>${sub < c.min ? `<div class="tiny muted">Add ${money(c.min - sub)} more to unlock</div>` : ''}</div>`).join('')}`);
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-x]'); if (!b || b.disabled) return;
      const code = b.dataset.x === 'typed' ? el.querySelector('#cc').value.trim().toUpperCase() : b.dataset.x; if (!code) return;
      const q = api.quote(S.cart.items, code); if (q.couponError) return toast(q.couponError);
      S.cart.coupon = code; saveCart(); closeSheet(); render(true); toast(`🎉 ${esc(code)} applied — you save ${money(q.discount)}`);
    });
  }
  function passwordSheet() {
    const el = sheet(`<h3 style="font-size:20px;margin-bottom:4px">Change password</h3><p class="small muted" style="margin-bottom:12px">You'll stay logged in here; other devices will be signed out.</p>
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
  function petSheet(p) { const el = sheet(PetForm(p || {})); wirePetForm(el, () => closeSheet()); }
  function wirePetForm(root, done) {
    const form = root.querySelector('#petform'); if (!form || form._wired) return; form._wired = true;
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); const f = new FormData(form); const c = me();
      const group = (g) => form.querySelector(`[data-group="${g}"]`);
      if (!f.get('name').trim() || !f.get('breed').trim()) return toast('Please fill the required fields');
      const id = form.dataset.id || FP.uid('p');
      const p = { id, name: f.get('name').trim(), breed: f.get('breed').trim(), species: group('species').querySelector('.on').dataset.v, diet: group('diet').querySelector('.on').dataset.v,
        allergies: [...group('allergies').querySelectorAll('.on')].map((b) => b.dataset.v), ageY: +f.get('ageY') || 0, ageM: +f.get('ageM') || 0, weight: +f.get('weight') || undefined };
      const pets = c.pets.some((x) => x.id === id) ? c.pets.map((x) => (x.id === id ? p : x)) : [...c.pets, p];
      const btn = form.querySelector('[type=submit]'); btn.disabled = true;
      const ok = await api.call('updateProfile', { pets }); btn.disabled = false; if (!ok) return;
      S.petId = id; lsSet('cust.pet', id); S.ins.allergies = null; toast(`${esc(p.name)} saved 🐾`); if (done) done(); render(true);
    });
  }

  // ---------------- actions ----------------
  const A = {
    seg(el) { el.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === el)); },
    tog(el) { el.classList.toggle('on'); },
    async logout() { await api.auth.logout(); clearCart(); S.login.ref = ''; AuthUI.setMode('login'); location.hash = '#/home'; render(); },
    'change-pw'() { passwordSheet(); },
    'vet-req'(el) { const v = (api.db.vets || []).find((x) => x.id === el.dataset.id); if (v) vetRequestSheet(v); },
    pet(el) { S.petId = el.dataset.id; lsSet('cust.pet', S.petId); S.ins.allergies = null; render(true); },
    'add-pet'() { petSheet(null); },
    'edit-pet'(el) { petSheet(me().pets.find((p) => p.id === el.dataset.id)); },
    async 'del-pet'(el) { const c = me(); if (await api.call('updateProfile', { pets: c.pets.filter((p) => p.id !== el.dataset.id) })) closeSheet(); },
    'pick-addr'() { addrSheet(); },
    banner(el) { const b = el.dataset.id; if (b === 'b2') { S.cart.coupon = 'WELCOME50'; saveCart(); toast('WELCOME50 will be applied at checkout'); location.hash = '#/menu'; } else if (b === 'b3') location.hash = '#/search/puppy'; else if (b === 'b4') location.hash = '#/refer'; else location.hash = '#/menu'; },
    day(el) { S.day = el.dataset.d; S._dayTouched = true; render(true); },
    week(el) { S.weekOffset = +el.dataset.o; S.day = S.weekOffset ? 'mon' : FP.todayDay(); S._dayTouched = false; render(); },
    veg() { S.vegOnly = !S.vegOnly; render(true); },
    add(el) { startAdd(api.recipe(el.dataset.id), el.dataset.slot, el.dataset.week, el.dataset.day); },
    inc(el) { bump(el.dataset.id, el.dataset.slot, 1); },
    dec(el) { bump(el.dataset.id, el.dataset.slot, -1); },
    line(el) { const l = S.cart.items.find((i) => i.key === el.dataset.k); if (l) bump(l.recipeId, l.slot, +el.dataset.d); },
    'clear-cart'() { clearCart(); render(); },
    'ins-tog'(el) { const list = S.ins[el.dataset.k]; const v = el.dataset.v; const i = list.indexOf(v); if (i >= 0) list.splice(i, 1); else list.push(v); render(true); },
    'free-meal'() { S.useFreeMeal = !S.useFreeMeal; render(true); if (S.useFreeMeal) toast('🎁 Free meal applied'); },
    coupons() { couponSheet(); },
    'rm-coupon'(el, e) { e.stopPropagation(); S.cart.coupon = null; saveCart(); render(true); },
    dslot(el) { S.deliverySlot = el.dataset.v; render(true); },
    pay(el) { S.payment = el.dataset.v; render(true); },
    copy(el) { const v = el.dataset.v; (navigator.clipboard ? navigator.clipboard.writeText(v) : Promise.reject()).then(() => toast('Copied ✓')).catch(() => { prompt('Copy this:', v); }); },
    share(el) { const text = el.dataset.v; if (navigator.share) navigator.share({ title: 'FoodPeto', text }).catch(() => {}); else A.copy({ dataset: { v: text } }); },
    place() {
      const bad = S.cart.items.find((i) => { const r = api.recipe(i.recipeId); return r && !fitsPet(r); });
      if (bad) return toast(`${esc(bad.name)} isn't suitable for ${esc(pet().name)} — remove it or switch pet`, 3500);
      const go = async () => {
        S.busy = true; render(true);
        const res = await api.call('placeOrder', { addressId: addr().id, petId: pet().id, week: S.cart.week, day: S.cart.day, slot: S.deliverySlot, payment: S.payment, coupon: S.cart.coupon, useFreeMeal: S.useFreeMeal,
          items: S.cart.items.map((i) => ({ recipeId: i.recipeId, portion: i.portion, slot: i.slot, qty: i.qty })), instructions: S.ins });
        S.busy = false;
        if (!res) return render(true);
        clearCart(); render(true);
        sheet(`<div class="center" style="padding:20px 0"><div style="font-size:72px;animation:pulse 1s infinite">🐾</div><h2 style="font-size:26px;margin-top:8px">Order placed!</h2><p class="muted" style="margin:6px 0 18px">#${res.id} · ${money(res.total)} · ${esc(res.slot)}<br>Our kitchen will start cooking shortly.</p><button class="btn btn-primary btn-block btn-lg" id="tk">Track order</button></div>`);
        document.getElementById('tk').onclick = () => { closeSheet(); location.hash = `#/track/${res.id}`; };
      };
      if (S.payment === 'Cash on delivery') return go();
      const q = api.quote(S.cart.items, S.cart.coupon, { freeMeal: S.useFreeMeal });
      const el = sheet(`<div class="center"><div class="eyebrow">Test payment · no money is charged</div><h3 style="font-size:22px;margin:8px 0">${S.payment === 'UPI' ? 'Pay via UPI' : 'Pay by card'}</h3><div class="display" style="font-size:36px;color:var(--pine)">${money(q.total)}</div><p class="small muted" style="margin:8px 0 18px">A payment gateway (e.g. Razorpay) plugs in here.</p><button class="btn btn-primary btn-block btn-lg" data-x="ok">Simulate successful payment</button><button class="btn btn-ghost btn-block" style="margin-top:8px" data-x="no">Cancel</button></div>`);
      el.addEventListener('click', (e) => { const b = e.target.closest('[data-x]'); if (!b) return; closeSheet(); if (b.dataset.x === 'ok') go(); });
    },
    async cancel(el) { if (confirm('Cancel this order?') && await api.call('cancelOrder', el.dataset.id)) toast('Order cancelled. Refund initiated.'); },
    rate(el) {
      const id = el.dataset.id; const n = +el.dataset.n;
      const sh = sheet(`<div class="center"><h3 style="font-size:20px">Thanks for rating!</h3><div class="star-pick" style="margin:8px 0">${[1, 2, 3, 4, 5].map((k) => `<button class="${k <= n ? 'on' : ''}">★</button>`).join('')}</div><textarea class="input" id="rv" placeholder="Tell us what your pet thought (optional)"></textarea><button class="btn btn-primary btn-block" style="margin-top:12px" id="rvb">Submit</button></div>`);
      sh.querySelector('#rvb').onclick = async () => { if (await api.call('rateOrder', id, n, sh.querySelector('#rv').value)) { closeSheet(); toast('Thank you! 🐾'); } };
    },
    reorder(el) {
      const o = api.order(el.dataset.id); const wk = thisWeek(); const day = FP.todayDay(); let skipped = 0;
      clearCart();
      o.items.forEach((i) => { const r = api.recipe(i.recipeId); if (r && r.available && fitsPet(r) && (r.course !== 'meal' || onMenu(wk, day, r.id))) addLine(r, i.portion, i.slot, wk, day, i.qty); else skipped += 1; });
      if (!S.cart.items.length) { toast('Those dishes aren\'t on today\'s menu — pick from this week\'s menu'); location.hash = '#/menu'; return; }
      if (skipped) toast(`${skipped} item${skipped > 1 ? 's aren\'t' : ' isn\'t'} on today's menu and ${skipped > 1 ? 'were' : 'was'} skipped`);
      location.hash = '#/cart';
    },
    plan(el) {
      const pl = api.plan(el.dataset.id); const c = me(); let p = pet(); let diet = p.diet === 'veg' ? 'veg' : 'nonveg'; let slot = DELIVERY_SLOTS[2];
      const draw = () => `<div class="eyebrow">${pl.days} days · ${pl.days * pl.mealsPerDay} meals</div><h3 style="font-size:22px;margin:4px 0 14px">${esc(pl.name)} — ${money(pl.price)}</h3>
        <div class="field"><label>For</label><div class="pets-row">${c.pets.map((x) => `<button class="pet-chip ${p.id === x.id ? 'on' : ''}" data-x="pet" data-v="${x.id}"><span class="pe">${petEmoji(x)}</span>${esc(x.name)}</button>`).join('')}</div></div>
        <div class="field" style="margin-top:12px"><label>Diet</label><div class="seg">${[['nonveg', '🍗 Non-veg'], ['veg', '🥦 Veg']].map(([v, l]) => `<button data-x="diet" data-v="${v}" class="${diet === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>
        <div class="field" style="margin-top:12px"><label>Delivery time</label><div class="row wrap">${DELIVERY_SLOTS.map((s) => `<button class="chip ${slot === s ? 'on' : ''}" data-x="slot" data-v="${s}">${s}</button>`).join('')}</div></div>
        <div class="card" style="padding:12px;margin-top:14px;background:var(--sage);border:0"><b>Starts tomorrow</b><div class="small muted">Delivered to ${esc(addr().label)} · ${esc(addr().line)}</div></div>
        <button class="btn btn-primary btn-block btn-lg" style="margin-top:14px" data-x="go">Subscribe · ${money(pl.price)}</button>
        <p class="tiny faint center" style="margin-top:8px">Test mode — no payment is taken.</p>`;
      const el2 = sheet(`<div id="pls">${draw()}</div>`);
      el2.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-x]'); if (!b) return;
        if (b.dataset.x === 'pet') p = c.pets.find((x) => x.id === b.dataset.v);
        if (b.dataset.x === 'diet') diet = b.dataset.v;
        if (b.dataset.x === 'slot') slot = b.dataset.v;
        if (b.dataset.x === 'go') { if (await api.call('subscribePlan', { planId: pl.id, petId: p.id, diet, slot })) { closeSheet(); toast(`🎉 ${esc(pl.name)} activated for ${esc(p.name)}`); } return; }
        el2.querySelector('#pls').innerHTML = draw();
      });
    },
    async sub(el) { if (await api.call('setSubStatus', el.dataset.id, el.dataset.v)) toast(el.dataset.v === 'paused' ? 'Plan paused — no deliveries until you resume' : 'Plan resumed 🐾'); },
  };
  UI.delegate(document.body, A);
  document.body.addEventListener('input', (e) => {
    const t = e.target; const k = t.dataset.oninput; if (!k) return;
    if (k === 'ins') S.ins[t.dataset.k] = t.value;
    if (k === 'q') { S.query = t.value; render(true); }
  });
  new MutationObserver(() => { const f = app.querySelector('#petform'); if (f) wirePetForm(app); }).observe(app, { childList: true });

  window.addEventListener('hashchange', () => { closeSheet(); window.scrollTo(0, 0); render(); });
  let statuses = {};
  const snapStatuses = () => Object.fromEntries(api.db.orders.map((o) => [o.id, o.status]));
  api.subscribe((db, src) => {
    if (src === 'remote') {
      Object.entries(snapStatuses()).forEach(([id, s]) => { if (statuses[id] && statuses[id] !== s) toast(`${FP.STATUS[s].icon} #${id}: ${FP.STATUS[s].label}`, 3500); });
      if (ref().available > (S._freeMeals || 0) && S._freeMeals !== undefined) toast('🎁 You earned a free meal from referrals!', 4000);
    }
    statuses = snapStatuses(); S._freeMeals = ref().available;
    const who = JSON.stringify(api.session); const switched = who !== S._who; S._who = who;
    render(!switched); if (switched) window.scrollTo(0, 0);
  });
  if (S.login.ref) AuthUI.setMode('signup');
  FP.ready.then(() => { statuses = snapStatuses(); S._freeMeals = ref().available; render(); })
    .catch(() => { app.innerHTML = `<div class="empty" style="padding-top:120px"><div class="big">🔌</div><h2 style="color:var(--ink)">Can't reach FoodPeto</h2><p class="small" style="margin:8px 0 16px">Start the server with <code>node server.js</code>, then reload.</p><button class="btn btn-primary" onclick="location.reload()">Retry</button></div>`; });
})();
