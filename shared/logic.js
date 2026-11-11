/* FoodPeto shared business logic — loaded by the browser apps AND the Node server,
 * so prices, weeks and bills are computed identically on both sides. Pure functions only. */
(function (root, factory) {
  const L = factory();
  if (typeof module === 'object' && module.exports) module.exports = L; else root.FPLogic = L;
})(typeof self !== 'undefined' ? self : this, function () {
  const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const DAY_NAMES = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
  const SLOTS = ['morning', 'evening'];
  const DELIVERY_SLOTS = ['Morning · 8–10 AM', 'Lunch · 12–2 PM', 'Evening · 6–8 PM'];
  const AREAS = [
    { name: 'Malviya Nagar', km: 2.1 }, { name: 'C-Scheme', km: 4.6 }, { name: 'Vaishali Nagar', km: 7.8 },
    { name: 'Mansarovar', km: 6.2 }, { name: 'Raja Park', km: 3.4 }, { name: 'Jagatpura', km: 5.5 }, { name: 'Bani Park', km: 6.9 },
  ];
  const PORTIONS = [
    { id: 'Small', label: 'Small · 250 g', hint: 'Cats & pets under 10 kg', mult: 1 },
    { id: 'Regular', label: 'Regular · 400 g', hint: 'Pets 10–25 kg', mult: 1.4 },
    { id: 'Large', label: 'Large · 600 g', hint: 'Pets over 25 kg', mult: 1.9 },
  ];
  const CUSTOMIZATIONS = ['Mashed / smooth texture', 'Chunky pieces', 'Boneless only', 'Extra protein', 'Less carbs', 'Grain-free', 'Less ghee / oil', 'Serve lukewarm'];
  const ALLERGENS = ['Chicken', 'Fish', 'Dairy', 'Egg', 'Wheat', 'Mutton', 'Rice', 'Peas'];
  const STATUS = {
    placed: { label: 'Order placed', short: 'New', tone: 'b-info', icon: '🧾', cust: 'Waiting for the kitchen to confirm' },
    cooking: { label: 'Cooking fresh', short: 'Cooking', tone: 'b-mustard', icon: '🧑‍🍳', cust: 'Our chefs are cooking your bowl right now' },
    ready: { label: 'Packed & ready', short: 'Ready', tone: 'b-sage', icon: '📦', cust: 'Sealed fresh and waiting for pickup' },
    out: { label: 'Out for delivery', short: 'On the way', tone: 'b-sage', icon: '🛵', cust: 'Your delivery partner is on the way' },
    delivered: { label: 'Delivered', short: 'Delivered', tone: 'b-line', icon: '✅', cust: 'Delivered. Happy tail wags!' },
    cancelled: { label: 'Cancelled', short: 'Cancelled', tone: 'b-danger', icon: '✕', cust: 'This order was cancelled' },
  };
  const FLOW = ['placed', 'cooking', 'ready', 'out', 'delivered'];

  // ---------- dates & ISO weeks ----------
  function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function mondayOf(d) { const x = startOfDay(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
  function weekKey(d = new Date()) {
    const t = startOfDay(d); t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7));
    const y = t.getFullYear(); const jan4 = new Date(y, 0, 4);
    const wk = 1 + Math.round(((t - jan4) / 864e5 - 3 + ((jan4.getDay() + 6) % 7)) / 7);
    return `${y}-W${String(wk).padStart(2, '0')}`;
  }
  const isWeekKey = (k) => typeof k === 'string' && /^\d{4}-W\d{2}$/.test(k);
  function weekStart(key) { const [y, w] = key.split('-W').map(Number); const mon = mondayOf(new Date(y, 0, 4)); mon.setDate(mon.getDate() + (w - 1) * 7); return mon; }
  function addWeeks(key, n) { const d = weekStart(key); d.setDate(d.getDate() + 7 * n); return weekKey(d); }
  function dateOf(key, day) { const d = weekStart(key); d.setDate(d.getDate() + DAYS.indexOf(day)); return d; }
  function todayDay() { return DAYS[(new Date().getDay() + 6) % 7]; }
  function weekLabel(key) {
    const s = weekStart(key), e = new Date(s); e.setDate(e.getDate() + 6);
    const f = (d) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    return `${f(s)} – ${f(e)}`;
  }

  function uid(p) { return p + Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 6); }
  function referralCode(name) {
    const base = String(name || 'PAW').replace(/[^a-z]/gi, '').toUpperCase().slice(0, 5) || 'PAW';
    return base + Math.random().toString(36).slice(2, 5).toUpperCase().replace(/[^A-Z0-9]/g, 'X');
  }
  function emptyMenu() { const days = {}; DAYS.forEach((d) => { days[d] = { morning: { nonveg: null, veg: null }, evening: { nonveg: null, veg: null } }; }); return { status: 'draft', publishedAt: null, days, note: '' }; }

  // ---------- pricing ----------
  function portionPrice(base, portion) { const p = PORTIONS.find((x) => x.id === portion); return Math.round(base * (p ? p.mult : 1)); }
  const isMeal = (state, i) => (i.course ? i.course === 'meal' : ((state.recipes || []).find((r) => r.id === i.recipeId) || {}).course === 'meal');
  /** Bill for a cart. opts.freeMeal → one meal bowl free (the priciest one, up to settings.freeMealCap). */
  function quote(state, items, couponCode, opts = {}) {
    const s = state.settings || {}; const subtotal = items.reduce((a, i) => a + i.price * i.qty, 0);
    const delivery = subtotal >= s.freeAbove || subtotal === 0 ? 0 : s.deliveryFee;
    const packing = subtotal ? s.packing : 0;
    let freeMeal = 0;
    if (opts.freeMeal) { const meals = items.filter((i) => isMeal(state, i)); if (meals.length) freeMeal = Math.min(Math.max(...meals.map((i) => i.price)), s.freeMealCap || 300); }
    let discount = 0; let couponError = null; let coupon = null;
    if (couponCode) {
      coupon = (state.coupons || []).find((c) => c.code === String(couponCode).toUpperCase() && c.active);
      if (!coupon) couponError = 'Invalid or expired code';
      else if (subtotal < coupon.min) { couponError = `Add ₹${coupon.min - subtotal} more to use ${coupon.code}`; coupon = null; }
      else if (coupon.type === 'pct') discount = Math.min(Math.round(((subtotal - freeMeal) * coupon.value) / 100), coupon.max);
      else if (coupon.type === 'flat') discount = Math.min(coupon.value, subtotal - freeMeal);
      else if (coupon.type === 'delivery') discount = delivery;
    }
    const taxable = Math.max(0, subtotal - freeMeal - (coupon && coupon.type !== 'delivery' ? discount : 0));
    const taxes = Math.round((taxable * (s.gstPct || 0)) / 100);
    const total = Math.max(0, subtotal + delivery + packing + taxes - discount - freeMeal);
    return { subtotal, delivery, packing, taxes, discount, freeMeal, total, coupon: coupon ? coupon.code : null, couponError };
  }
  function status(o) { return STATUS[o.status] || STATUS.placed; }

  return { DAYS, DAY_NAMES, SLOTS, DELIVERY_SLOTS, AREAS, PORTIONS, CUSTOMIZATIONS, ALLERGENS, STATUS, FLOW,
    startOfDay, weekKey, isWeekKey, weekStart, addWeeks, dateOf, todayDay, weekLabel, uid, referralCode, emptyMenu, portionPrice, quote, status };
});
