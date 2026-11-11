// Every state change goes through one of these actions. The server checks the caller's role,
// validates input and recomputes prices — clients are never trusted with totals.
const L = require('../shared/logic');
const P = require('./passwords');

const fail = (msg, status = 400) => { const e = new Error(msg); e.status = status; throw e; };
const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v, min, max, def = 0) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def; };
const strList = (v, maxItems = 12, maxLen = 60) => (Array.isArray(v) ? v.map((x) => str(x, maxLen)).filter(Boolean).slice(0, maxItems) : []);
const ACTIVE = ['placed', 'cooking', 'ready', 'out'];
const VET_SPECIALTIES = ['Dogs', 'Cats', 'Nutrition', 'Vaccination', 'Skin & allergy', 'Surgery', 'Dental', 'Emergency 24×7'];
const VET_MODES = ['clinic', 'home', 'video'];

const findOrder = (st, id) => st.orders.find((o) => o.id === id) || fail('Order not found', 404);
const me = (st, ctx) => st.customers.find((c) => c.id === ctx.sub) || fail('Please complete sign-up first', 403);
const meRider = (st, ctx) => {
  const r = st.riders.find((x) => x.id === ctx.sub) || fail('Partner account not found', 403);
  if ((r.status || 'approved') !== 'approved') fail(r.status === 'pending' ? 'Your application is still under review' : 'Your partner account is not active — contact FoodPeto', 403);
  return r;
};
const phoneOf = (v) => { const p = String(v || '').replace(/\D/g, '').replace(/^91(?=\d{10}$)/, ''); return /^[6-9]\d{9}$/.test(p) ? p : fail('Enter a valid 10-digit mobile number'); };
function credentials(st, role, p) {
  const email = P.normEmail(p.email); if (!P.emailOk(email)) fail('Enter a valid email address');
  const prob = P.passwordProblem(p.password); if (prob) fail(prob);
  if (P.findAccount(st, role, email)) fail('An account with this email already exists — try logging in', 409);
  return email;
}

/** Public sign-up for pet parents. Creates the customer profile and their login together. */
function signupCustomer(st, p = {}) {
  const email = credentials(st, 'customer', p);
  const name = str(p.name, 60) || fail('Name is required');
  const phone = phoneOf(p.phone);
  if (st.customers.some((c) => c.phone === phone)) fail('This mobile number is already registered — try logging in', 409);
  let referredBy = null; const code = str(p.ref, 20).toUpperCase();
  if (code) { const ref = st.customers.find((c) => c.referralCode === code); if (!ref) fail('That referral code is not valid'); referredBy = ref.id; }
  let referralCode; do { referralCode = L.referralCode(name); } while (st.customers.some((c) => c.referralCode === referralCode));
  const c = { id: L.uid('c'), name, phone, email, joined: Date.now(), addresses: [cleanAddress({ label: 'Home', area: p.area, line: p.line })], pets: [], referralCode, referredBy, referralQualified: null, rewards: { earned: 0, used: 0 } };
  st.customers.push(c); P.createAccount(st, { role: 'customer', email, sub: c.id, password: p.password });
  return c.id;
}
/** Public "apply to join" for delivery partners. They can log in but stay pending until approved. */
function applyRider(st, p = {}) {
  const email = credentials(st, 'rider', p);
  const name = str(p.name, 60) || fail('Name is required');
  const phone = phoneOf(p.phone);
  if (st.riders.some((r) => r.phone === phone)) fail('A partner with this mobile number already exists', 409);
  const vehicle = str(p.vehicle, 80) || fail('Tell us your vehicle (e.g. Honda Activa · RJ14 AB 1234)');
  const licence = str(p.licence, 30) || fail('Driving licence number is required');
  const area = L.AREAS.some((a) => a.name === p.area) ? p.area : L.AREAS[0].name;
  const r = { id: L.uid('d'), name, phone, email, vehicle, licence, area, rating: 5, online: false, status: 'pending', appliedAt: Date.now(), joined: new Date().toISOString().slice(0, 7) };
  st.riders.push(r); P.createAccount(st, { role: 'rider', email, sub: r.id, password: p.password });
  return r.id;
}
const recipe = (st, id) => st.recipes.find((r) => r.id === id);
const rewards = (c) => (c.rewards = c.rewards || { earned: 0, used: 0 });

function makeOrder(st, { customer, address, items, petId, slot, payment, coupon, freeMeal, instructions, forDate }) {
  const q = L.quote(st, items, coupon, { freeMeal });
  const pet = customer.pets.find((p) => p.id === petId) || customer.pets[0] || {};
  const km = address.km || 4; const now = Date.now();
  return {
    id: 'FP' + st.meta.seq++, customerId: customer.id, customerName: customer.name, phone: customer.phone,
    petId: pet.id, petName: pet.name, petSpecies: pet.species, petAllergies: pet.allergies || [],
    address: { label: address.label, line: address.line, area: address.area, km },
    items, slot, payment, instructions: instructions || {}, ...q, freeMealUsed: q.freeMeal > 0,
    status: 'placed', otp: String(1000 + Math.floor(Math.random() * 9000)), otpTries: 0,
    riderId: null, declinedBy: [], arrivedAt: null, riderPay: Math.round(30 + km * 8), tip: 0,
    forDate: forDate || now, createdAt: now, timeline: [{ s: 'placed', at: now }], rating: null,
  };
}

// Referral: a friend counts once their first order is delivered. Every N friends → 1 free meal.
function qualifyReferral(st, o) {
  const c = st.customers.find((x) => x.id === o.customerId); if (!c || !c.referredBy || c.referralQualified) return;
  c.referralQualified = Date.now();
  const ref = st.customers.find((x) => x.id === c.referredBy); if (!ref) return;
  const n = st.customers.filter((x) => x.referredBy === ref.id && x.referralQualified).length;
  const r = rewards(ref); r.earned = Math.max(r.earned, Math.floor(n / (st.settings.referralsPerReward || 5)));
}
function setStatus(st, o, s) {
  o.status = s; o.timeline.push({ s, at: Date.now() });
  if (s === 'delivered') qualifyReferral(st, o);
  if (s === 'cancelled' && o.freeMealUsed) { const c = st.customers.find((x) => x.id === o.customerId); if (c) rewards(c).used = Math.max(0, rewards(c).used - 1); o.freeMealUsed = false; }
}
function cleanPet(p) {
  const species = p.species === 'cat' ? 'cat' : 'dog';
  return { id: str(p.id, 40) || L.uid('p'), name: str(p.name, 40) || fail('Pet name is required'), breed: str(p.breed, 60) || fail('Breed is required'), species,
    ageY: num(p.ageY, 0, 30), ageM: num(p.ageM, 0, 11), weight: num(p.weight, 0.5, 100, species === 'cat' ? 4 : 15),
    allergies: strList(p.allergies), diet: ['veg', 'nonveg', 'custom'].includes(p.diet) ? p.diet : 'nonveg' };
}
function cleanAddress(a) {
  const area = L.AREAS.find((x) => x.name === a.area) || fail('We don\'t deliver to that area yet');
  const line = str(a.line, 160) || fail('Street address is required');
  return { id: str(a.id, 40) || L.uid('a'), label: str(a.label, 30) || 'Other', line: line.includes(area.name) ? line : `${line}, ${area.name}`, area: area.name, km: area.km };
}
function isOnMenu(st, week, day, recipeId) {
  const m = st.menus[week]; if (!m || m.status !== 'published') return false;
  return L.SLOTS.some((s) => m.days[day][s].nonveg === recipeId || m.days[day][s].veg === recipeId);
}

const customer = {
  updateProfile(st, ctx, p = {}) {
    const c = me(st, ctx);
    if (p.name !== undefined) c.name = str(p.name, 60) || c.name;
    if (p.phone !== undefined) { const ph = phoneOf(p.phone); if (st.customers.some((x) => x.id !== c.id && x.phone === ph)) fail('That number is used by another account'); c.phone = ph; }
    if (p.pets !== undefined) { const pets = (Array.isArray(p.pets) ? p.pets : []).slice(0, 10).map(cleanPet); if (!pets.length) fail('Keep at least one pet on your profile'); c.pets = pets; }
    if (p.addresses !== undefined) { const a = (Array.isArray(p.addresses) ? p.addresses : []).slice(0, 10).map(cleanAddress); if (!a.length) fail('Keep at least one address'); c.addresses = a; }
    return { ok: true };
  },
  placeOrder(st, ctx, p = {}) {
    const c = me(st, ctx);
    const address = c.addresses.find((a) => a.id === p.addressId) || fail('Choose a delivery address');
    const pet = c.pets.find((x) => x.id === p.petId) || fail('Choose which pet this is for');
    if (!L.isWeekKey(p.week) || !L.DAYS.includes(p.day)) fail('Invalid delivery day');
    const date = L.dateOf(p.week, p.day); const today = L.startOfDay(new Date());
    if (date < today) fail('That day has already passed — pick today or a later day');
    if (+date === +today && !st.settings.kitchenOpen) fail('The kitchen is closed for today — pick an upcoming day');
    if (!L.DELIVERY_SLOTS.includes(p.slot)) fail('Choose a delivery slot');
    if (!['UPI', 'Card', 'Cash on delivery'].includes(p.payment)) fail('Choose a payment method');
    if (!Array.isArray(p.items) || !p.items.length || p.items.length > 30) fail('Your cart is empty');
    const items = p.items.map((i) => {
      const r = recipe(st, i.recipeId) || fail('A dish in your cart no longer exists');
      if (!r.available) fail(`${r.name} is sold out`);
      if (!r.species.includes(pet.species)) fail(`${r.name} is made for ${r.species.join(' & ')}s — not suitable for ${pet.name}`);
      if (pet.diet === 'veg' && r.diet === 'nonveg') fail(`${r.name} is non-veg — ${pet.name}'s profile is set to veg`);
      if (r.course === 'meal' && !isOnMenu(st, p.week, p.day, r.id)) fail(`${r.name} isn't on ${L.DAY_NAMES[p.day]}'s menu`);
      const portion = r.course === 'meal' ? (L.PORTIONS.some((x) => x.id === i.portion) ? i.portion : 'Small') : 'Pack';
      const slot = ['morning', 'evening', 'anytime'].includes(i.slot) ? i.slot : 'anytime';
      return { recipeId: r.id, name: r.name, diet: r.diet, course: r.course, price: L.portionPrice(r.price, portion), qty: Math.round(num(i.qty, 1, 20, 1)), portion, slot, day: p.day };
    });
    if (p.coupon) { const q = L.quote(st, items, p.coupon); if (q.couponError) fail(q.couponError); }
    const r = rewards(c); const freeMeal = !!p.useFreeMeal;
    if (freeMeal && r.earned - r.used <= 0) fail('You have no free meals left');
    if (freeMeal && !items.some((i) => i.course === 'meal')) fail('Add a meal bowl to use your free meal');
    const ins = p.instructions || {};
    const instructions = { comment: str(ins.comment, 500), customization: strList(ins.customization).filter((x) => L.CUSTOMIZATIONS.includes(x)), customText: str(ins.customText, 300), request: str(ins.request, 500), allergies: strList(ins.allergies), allergyText: str(ins.allergyText, 300) };
    const o = makeOrder(st, { customer: c, address, items, petId: pet.id, slot: p.slot, payment: p.payment, coupon: p.coupon || null, freeMeal, instructions, forDate: +date });
    if (o.freeMealUsed) r.used += 1;
    st.orders.push(o); return { id: o.id, total: o.total, slot: o.slot };
  },
  cancelOrder(st, ctx, id) { const o = findOrder(st, id); if (o.customerId !== ctx.sub) fail('Not your order', 403); if (o.status !== 'placed') fail('The kitchen has started cooking — contact support to cancel'); setStatus(st, o, 'cancelled'); return { ok: true }; },
  rateOrder(st, ctx, id, stars, text) { const o = findOrder(st, id); if (o.customerId !== ctx.sub) fail('Not your order', 403); if (o.status !== 'delivered') fail('You can rate after delivery'); o.rating = Math.round(num(stars, 1, 5, 5)); o.review = str(text, 500); return { ok: true }; },
  subscribePlan(st, ctx, p = {}) {
    const c = me(st, ctx); const plan = st.plans.find((x) => x.id === p.planId && x.active) || fail('Plan not available');
    const pet = c.pets.find((x) => x.id === p.petId) || fail('Choose a pet');
    if (!L.DELIVERY_SLOTS.includes(p.slot)) fail('Choose a delivery time');
    const s = { id: 'S' + (1000 + st.subscriptions.length + 1), customerId: c.id, planId: plan.id, petId: pet.id, diet: p.diet === 'veg' ? 'veg' : 'nonveg', slot: p.slot, start: Date.now(), status: 'active' };
    st.subscriptions.push(s); return { id: s.id };
  },
  requestVet(st, ctx, p = {}) {
    const c = me(st, ctx);
    const vet = st.vets.find((v) => v.id === p.vetId && v.status === 'active' && v.visible) || fail('This vet is not available right now');
    const pet = c.pets.find((x) => x.id === p.petId) || fail('Choose which pet needs the consultation');
    const mode = VET_MODES.includes(p.mode) && vet.modes.includes(p.mode) ? p.mode : vet.modes[0];
    if (st.vetRequests.filter((r) => r.customerId === c.id && r.status === 'new').length >= 3) fail('You already have open requests — the clinic will contact you soon');
    const r = { id: L.uid('vr'), customerId: c.id, customerName: c.name, phone: c.phone, email: c.email, petId: pet.id, petName: pet.name, petSpecies: pet.species, petBreed: pet.breed,
      vetId: vet.id, vetName: vet.name, clinic: vet.clinic, mode, preferred: str(p.preferred, 60), message: str(p.message, 500) || fail('Tell the vet briefly what the visit is about'), status: 'new', createdAt: Date.now() };
    st.vetRequests.push(r); return { id: r.id };
  },
  setSubStatus(st, ctx, id, status) { const s = st.subscriptions.find((x) => x.id === id && x.customerId === ctx.sub) || fail('Subscription not found', 404); s.status = status === 'paused' ? 'paused' : 'active'; return { ok: true }; },
};

const rider = {
  setOnline(st, ctx, on) { const r = meRider(st, ctx); if (!on && st.orders.some((o) => o.riderId === r.id && ACTIVE.includes(o.status))) fail('Finish your current delivery first'); r.online = !!on; return { ok: true }; },
  acceptOrder(st, ctx, id) {
    const r = meRider(st, ctx); const o = findOrder(st, id);
    if (!r.online) fail('Go on duty to accept orders');
    if (st.orders.some((x) => x.riderId === r.id && ACTIVE.includes(x.status))) fail('Finish your current delivery first');
    if (o.riderId) fail('Sorry, this order was already taken');
    if (!['cooking', 'ready'].includes(o.status)) fail('This order is no longer available');
    o.riderId = r.id; o.acceptedAt = Date.now(); return { ok: true };
  },
  declineOrder(st, ctx, id) { const o = findOrder(st, id); o.declinedBy = [...new Set([...(o.declinedBy || []), ctx.sub])]; return { ok: true }; },
  markArrived(st, ctx, id) { const o = findOrder(st, id); if (o.riderId !== ctx.sub) fail('Not your order', 403); o.arrivedAt = o.arrivedAt || Date.now(); return { ok: true }; },
  pickUp(st, ctx, id) { const o = findOrder(st, id); if (o.riderId !== ctx.sub) fail('Not your order', 403); if (o.status !== 'ready') fail('The kitchen hasn\'t packed this order yet'); setStatus(st, o, 'out'); return { ok: true }; },
  deliver(st, ctx, id, code) {
    const o = findOrder(st, id); if (o.riderId !== ctx.sub) fail('Not your order', 403); if (o.status !== 'out') fail('Order is not out for delivery');
    if ((o.otpTries || 0) >= 8) fail('Too many wrong attempts — call FoodPeto support');
    if (String(code) !== o.otp) { o.otpTries = (o.otpTries || 0) + 1; fail('Wrong OTP. Ask the customer again.'); }
    setStatus(st, o, 'delivered'); return { ok: true, pay: o.riderPay + (o.tip || 0) };
  },
};

const SETTINGS_SCHEMA = { city: 'str', deliveryFee: 'num', freeAbove: 'num', packing: 'num', gstPct: 'num', phone: 'str', kitchen: 'str', cutoff: 'str', referralsPerReward: 'num', freeMealCap: 'num', kitchenOpen: 'bool' };
const admin = {
  advance(st, ctx, id) { const o = findOrder(st, id); const i = L.FLOW.indexOf(o.status); if (i < 0 || i > 1) fail('Only new or cooking orders can be advanced here'); setStatus(st, o, L.FLOW[i + 1]); return { status: o.status }; },
  setOrderStatus(st, ctx, id, s) { const o = findOrder(st, id); if (!L.STATUS[s]) fail('Unknown status'); setStatus(st, o, s); return { ok: true }; },
  assignRider(st, ctx, id, riderId) { const o = findOrder(st, id); if (o.status === 'out' || o.status === 'delivered') fail('Order already picked up'); if (riderId && !st.riders.some((r) => r.id === riderId)) fail('Unknown partner'); o.riderId = riderId || null; return { ok: true }; },
  setRiderOnline(st, ctx, riderId, on) { const r = st.riders.find((x) => x.id === riderId) || fail('Unknown partner'); r.online = !!on; return { ok: true }; },
  addRider(st, ctx, p = {}) {
    const phone = phoneOf(p.phone);
    if (st.riders.some((r) => r.phone === phone)) fail('A partner with this number already exists');
    const email = P.normEmail(p.email); if (!P.emailOk(email)) fail('Enter a valid email address');
    const temp = P.tempPassword();
    const r = { id: L.uid('d'), name: str(p.name, 60) || fail('Name is required'), phone, email, vehicle: str(p.vehicle, 80) || 'Two-wheeler', licence: str(p.licence, 30), area: L.AREAS[0].name, rating: 5, online: false, status: 'approved', joined: new Date().toISOString().slice(0, 7) };
    P.createAccount(st, { role: 'rider', email, sub: r.id, password: temp, mustChange: true });
    st.riders.push(r); return { tempPassword: temp, email };
  },
  setRiderStatus(st, ctx, id, status, reason) {
    const r = st.riders.find((x) => x.id === id) || fail('Unknown partner');
    if (!['approved', 'rejected', 'suspended'].includes(status)) fail('Unknown status');
    if (status !== 'approved' && st.orders.some((o) => o.riderId === id && ACTIVE.includes(o.status))) fail('This partner has an active delivery — reassign it first');
    r.status = status; r.statusReason = str(reason, 200); r.reviewedAt = Date.now(); r.reviewedBy = ctx.staffName || 'Admin';
    if (status !== 'approved') r.online = false;
    return { ok: true, _revoke: status === 'approved' ? null : { role: 'rider', sub: id, keepSessions: status === 'rejected' } };
  },
  resetUserPassword(st, ctx, role, sub) {
    if (!['customer', 'rider'].includes(role)) fail('Use the Staff page for staff passwords');
    const acc = P.accountOf(st, role, sub) || fail('This user has no login yet');
    const temp = P.tempPassword(); P.setPassword(acc, temp, { mustChange: true });
    return { tempPassword: temp, email: acc.email, _revoke: { role, sub } };
  },
  addStaff(st, ctx, p = {}) {
    const email = P.normEmail(p.email); if (!P.emailOk(email)) fail('Enter a valid email address');
    const role = ['owner', 'manager', 'kitchen'].includes(p.role) ? p.role : 'kitchen';
    const s = { id: L.uid('s'), name: str(p.name, 60) || fail('Name is required'), email, role, active: true, createdAt: Date.now(), createdBy: ctx.staffName };
    const temp = P.tempPassword(); P.createAccount(st, { role: 'admin', email, sub: s.id, password: temp, mustChange: true });
    st.staff.push(s); return { tempPassword: temp, email };
  },
  updateStaff(st, ctx, id, patch = {}) {
    const s = st.staff.find((x) => x.id === id) || fail('Unknown staff member');
    const next = { role: ['owner', 'manager', 'kitchen'].includes(patch.role) ? patch.role : s.role, active: patch.active === undefined ? s.active : !!patch.active };
    const ownersLeft = st.staff.filter((x) => x.active && x.role === 'owner' && !(x.id === id && (next.role !== 'owner' || !next.active))).length;
    if (!ownersLeft) fail('Keep at least one active owner');
    if (id === ctx.sub && !next.active) fail('You can\'t deactivate yourself');
    Object.assign(s, next); return { ok: true, _revoke: next.active ? null : { role: 'admin', sub: id } };
  },
  saveVet(st, ctx, v = {}) {
    const clean = {
      id: str(v.id, 40) || L.uid('v'), name: str(v.name, 80) || fail('Vet\'s name is required'), clinic: str(v.clinic, 100) || fail('Clinic name is required'),
      phone: phoneOf(v.phone), email: str(v.email, 120), area: str(v.area, 60), address: str(v.address, 200),
      specialties: strList(v.specialties, 10, 30).filter((s) => VET_SPECIALTIES.includes(s)), modes: strList(v.modes, 3, 20).filter((m) => VET_MODES.includes(m)),
      consultFee: Math.round(num(v.consultFee, 0, 100000)), discountPct: Math.round(num(v.discountPct, 0, 100)), commissionPct: Math.round(num(v.commissionPct, 0, 100)),
      partnerSince: str(v.partnerSince, 10), contractEnd: str(v.contractEnd, 10), hours: str(v.hours, 80), notes: str(v.notes, 500),
      status: v.status === 'paused' ? 'paused' : 'active', visible: v.visible !== false, updatedAt: Date.now(),
    };
    if (!clean.modes.length) clean.modes = ['clinic'];
    if (clean.email && !P.emailOk(P.normEmail(clean.email))) fail('Enter a valid email or leave it blank');
    const i = st.vets.findIndex((x) => x.id === clean.id);
    if (i >= 0) st.vets[i] = { ...st.vets[i], ...clean }; else st.vets.push({ ...clean, createdAt: Date.now() });
    return { id: clean.id };
  },
  deleteVet(st, ctx, id) {
    if (st.vetRequests.some((r) => r.vetId === id && r.status === 'new')) fail('This vet has open requests — close them or pause the vet instead');
    st.vets = st.vets.filter((v) => v.id !== id); return { ok: true };
  },
  setVetRequestStatus(st, ctx, id, status) {
    const r = st.vetRequests.find((x) => x.id === id) || fail('Request not found');
    if (!['new', 'contacted', 'booked', 'closed'].includes(status)) fail('Unknown status');
    r.status = status; r.updatedAt = Date.now(); r.updatedBy = ctx.staffName; return { ok: true };
  },
  removeStaff(st, ctx, id) {
    const s = st.staff.find((x) => x.id === id) || fail('Unknown staff member');
    if (id === ctx.sub) fail('You can\'t remove yourself');
    if (s.role === 'owner' && st.staff.filter((x) => x.active && x.role === 'owner').length < 2) fail('Keep at least one active owner');
    st.staff = st.staff.filter((x) => x.id !== id); st.accounts = st.accounts.filter((a) => !(a.role === 'admin' && a.sub === id));
    return { ok: true, _revoke: { role: 'admin', sub: id } };
  },
  resetStaffPassword(st, ctx, id) {
    const s = st.staff.find((x) => x.id === id) || fail('Unknown staff member');
    const acc = P.accountOf(st, 'admin', s.id) || fail('No login for this staff member');
    const temp = P.tempPassword(); P.setPassword(acc, temp, { mustChange: true });
    return { tempPassword: temp, email: acc.email, _revoke: { role: 'admin', sub: id } };
  },
  saveMenu(st, ctx, week, menu, publish) {
    if (!L.isWeekKey(week)) fail('Invalid week');
    const clean = L.emptyMenu(); const ids = new Set(st.recipes.map((r) => r.id));
    L.DAYS.forEach((d) => L.SLOTS.forEach((s) => ['nonveg', 'veg'].forEach((k) => { const v = menu && menu.days && menu.days[d] && menu.days[d][s] && menu.days[d][s][k]; clean.days[d][s][k] = ids.has(v) ? v : null; })));
    const prev = st.menus[week];
    clean.note = str(menu && menu.note, 200);
    clean.status = publish === undefined ? (prev ? prev.status : 'draft') : publish ? 'published' : 'draft';
    clean.publishedAt = publish ? Date.now() : prev ? prev.publishedAt : null;
    st.menus[week] = clean; return { ok: true };
  },
  unpublishMenu(st, ctx, week) { const m = st.menus[week] || fail('No menu for that week', 404); m.status = 'draft'; return { ok: true }; },
  saveRecipe(st, ctx, r = {}) {
    const clean = { id: str(r.id, 40) || L.uid('x'), name: str(r.name, 80) || fail('Name is required'), ingredients: str(r.ingredients, 300) || fail('Ingredients are required'),
      diet: ['veg', 'nonveg', 'egg'].includes(r.diet) ? r.diet : 'nonveg', course: ['meal', 'treat', 'addon'].includes(r.course) ? r.course : 'meal',
      price: Math.round(num(r.price, 1, 10000, 100)), kcal: Math.round(num(r.kcal, 0, 5000)), species: strList(r.species, 2).filter((s) => ['dog', 'cat'].includes(s)),
      tags: strList(r.tags, 3, 30), art: Array.isArray(r.art) ? r.art.slice(0, 5).map((x) => str(x, 12)) : ['🍲', '', '', '#F4EAD5', '#E7CF9F'], available: r.available !== false };
    if (!clean.species.length) fail('Pick at least one species');
    const i = st.recipes.findIndex((x) => x.id === clean.id);
    if (i >= 0) st.recipes[i] = { ...st.recipes[i], ...clean }; else st.recipes.push({ ...clean, rating: 4.5, ratings: 0 });
    return { id: clean.id };
  },
  deleteRecipe(st, ctx, id) {
    st.recipes = st.recipes.filter((r) => r.id !== id);
    Object.values(st.menus).forEach((m) => L.DAYS.forEach((d) => L.SLOTS.forEach((s) => ['nonveg', 'veg'].forEach((k) => { if (m.days[d][s][k] === id) m.days[d][s][k] = null; }))));
    return { ok: true };
  },
  updateSettings(st, ctx, patch = {}) {
    for (const [k, v] of Object.entries(patch)) {
      const t = SETTINGS_SCHEMA[k]; if (!t) continue;
      st.settings[k] = t === 'num' ? num(v, 0, 100000) : t === 'bool' ? !!v : str(v, 200);
    }
    st.settings.referralsPerReward = Math.max(1, st.settings.referralsPerReward || 5);
    return { ok: true };
  },
  addCoupon(st, ctx, c = {}) {
    const code = str(c.code, 20).toUpperCase().replace(/[^A-Z0-9]/g, ''); if (!code) fail('Code is required');
    if (st.coupons.some((x) => x.code === code)) fail('That code already exists');
    const type = ['pct', 'flat', 'delivery'].includes(c.type) ? c.type : 'pct'; const value = num(c.value, 0, 10000);
    st.coupons.push({ code, desc: str(c.desc, 120) || fail('Description is required'), type, value, max: type === 'flat' ? value : num(c.max, 0, 10000), min: num(c.min, 0, 100000), active: true });
    return { ok: true };
  },
  toggleCoupon(st, ctx, code) { const c = st.coupons.find((x) => x.code === code) || fail('Unknown coupon'); c.active = !c.active; return { ok: true }; },
  saveBanner(st, ctx, b = {}) {
    const clean = { id: str(b.id, 40) || L.uid('b'), title: str(b.title, 80) || fail('Headline is required'), sub: str(b.sub, 120), cta: str(b.cta, 30) || 'Order now', emoji: str(b.emoji, 8) || '🐾', tone: ['pine', 'mustard', 'sage'].includes(b.tone) ? b.tone : 'pine' };
    const i = st.banners.findIndex((x) => x.id === clean.id); if (i >= 0) st.banners[i] = clean; else st.banners.push(clean); return { ok: true };
  },
  deleteBanner(st, ctx, id) { st.banners = st.banners.filter((b) => b.id !== id); return { ok: true }; },
  updatePlan(st, ctx, id, patch = {}) {
    const p = st.plans.find((x) => x.id === id) || fail('Unknown plan');
    if (patch.price !== undefined) p.price = Math.round(num(patch.price, 1, 100000, p.price));
    if (patch.mrp !== undefined) p.mrp = Math.round(num(patch.mrp, 1, 100000, p.mrp));
    if (patch.active !== undefined) p.active = !!patch.active; return { ok: true };
  },
  grantFreeMeal(st, ctx, customerId) { const c = st.customers.find((x) => x.id === customerId) || fail('Unknown customer'); rewards(c).earned += 1; return { ok: true }; },
};

const ACTIONS = {};
Object.entries(customer).forEach(([k, fn]) => { ACTIONS[k] = { roles: ['customer'], fn }; });
Object.entries(rider).forEach(([k, fn]) => { ACTIONS[k] = { roles: ['rider'], fn }; });
// Staff permissions: owner → everything; manager → everything except staff accounts; kitchen → orders, menus, recipes.
const OWNER_ONLY = new Set(['addStaff', 'updateStaff', 'resetStaffPassword', 'removeStaff']);
const KITCHEN = new Set(['advance', 'setOrderStatus', 'assignRider', 'setRiderOnline', 'saveMenu', 'unpublishMenu', 'saveRecipe']);
Object.entries(admin).forEach(([k, fn]) => { ACTIONS[k] = { roles: ['admin'], staff: OWNER_ONLY.has(k) ? ['owner'] : KITCHEN.has(k) ? ['owner', 'manager', 'kitchen'] : ['owner', 'manager'], fn }; });

module.exports = { ACTIONS, makeOrder, setStatus, fail, signupCustomer, applyRider, VET_SPECIALTIES, VET_MODES };
