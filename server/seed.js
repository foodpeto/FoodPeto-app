// Sample data used the first time the server starts (and on "Reset demo data").
const L = require('../shared/logic');
const { makeOrder } = require('./actions');
const P = require('./passwords');

// Demo logins (sample data only — removed when you stop using the demo data). Real users sign up themselves.
const DEMO_PASSWORD = 'pawsome123';

function R(id, name, ingredients, diet, price, kcal, art, extra = {}) {
  return Object.assign({ id, name, ingredients, diet, price, kcal, art, species: ['dog', 'cat'], tags: [], rating: +(4.3 + Math.random() * 0.6).toFixed(1), ratings: 40 + Math.floor(Math.random() * 400), available: true, course: 'meal' }, extra);
}
function recipes() {
  return [
    R('r1', 'Chicken & Rice Bowl', 'Chicken breast, brown rice, carrots, flaxseed oil', 'nonveg', 179, 420, ['🍗', '🍚', '🥕', '#F4EAD5', '#E9D3A8'], { tags: ['Bestseller'] }),
    R('r2', 'Egg & Oats Breakfast', 'Scrambled eggs, rolled oats, banana, coconut oil', 'nonveg', 149, 360, ['🍳', '🥣', '🍌', '#FFF3D6', '#F6DE9C']),
    R('r3', 'Mutton & Veggie Stew', 'Slow-cooked mutton, sweet potato, green beans, turmeric', 'nonveg', 229, 510, ['🍖', '🍠', '🫘', '#F3E0D2', '#E2BFA4'], { species: ['dog'], tags: ['Chef special'] }),
    R('r4', 'Puppy Power Bowl', 'Salmon, quinoa, spinach, calcium broth', 'nonveg', 249, 450, ['🐟', '🥬', '🌾', '#E3EEF0', '#BFD8DD'], { species: ['dog'], tags: ['Puppy'] }),
    R('r5', 'Tuna & Pumpkin Delight', 'Ocean tuna, pumpkin, spinach, omega-3', 'nonveg', 219, 380, ['🐟', '🎃', '🥬', '#FCE8D4', '#F2C79B'], { tags: ['Cat favourite'] }),
    R('r6', 'Chicken Liver Pâté', 'Chicken liver, carrots, peas, probiotics', 'nonveg', 199, 340, ['🍗', '🫛', '🥕', '#F2E3DC', '#DDBBAA'], { species: ['cat', 'dog'], tags: ['Kitten'] }),
    R('r7', 'Mini Meat Bites', 'Chicken, carrot, oats', 'nonveg', 99, 180, ['🍢', '🥕', '🌾', '#F4EAD5', '#E7CF9F'], { course: 'treat', tags: ['Treat'] }),
    R('r8', 'Sardine & Sweet Potato', 'Wild sardines, sweet potato, parsley', 'nonveg', 209, 400, ['🐠', '🍠', '🌿', '#E6EEF2', '#C5D6DF']),
    R('r9', 'Fish & Rice Congee', 'Rohu fish, white rice, pumpkin, ginger broth', 'nonveg', 199, 390, ['🐟', '🍚', '🎃', '#E8F0EA', '#C9DBCC'], { tags: ['Gentle tummy'] }),
    R('r10', 'Chicken Bone Broth', 'Slow-simmered chicken bones, turmeric, parsley', 'nonveg', 89, 90, ['🥣', '🦴', '🌿', '#F5EBDD', '#E5D0B0'], { course: 'addon', tags: ['Add-on'] }),
    R('v1', 'Moong Dal & Rice Khichdi', 'Moong dal, rice, carrot, pumpkin, ghee, turmeric', 'veg', 139, 380, ['🍲', '🫘', '🎃', '#FBF0D2', '#F0D98F'], { tags: ['Bestseller'], species: ['dog'] }),
    R('v2', 'Paneer & Sweet Potato Mash', 'Paneer, sweet potato, spinach, ghee, nutritional yeast', 'veg', 169, 410, ['🧀', '🍠', '🥬', '#F7EEDC', '#E8D3AC'], { species: ['dog'] }),
    R('v3', 'Masoor Dal & Oats Porridge', 'Masoor dal, rolled oats, carrot, pumpkin, coconut oil', 'veg', 139, 350, ['🥣', '🫘', '🥕', '#FBE7D7', '#F0C6A4'], { species: ['dog'] }),
    R('v4', 'Curd Rice with Vegetables', 'Curd, cooked rice, cucumber, carrot, ghee', 'veg', 129, 330, ['🍚', '🥒', '🥛', '#EEF4EC', '#D3E2CE'], { species: ['dog'], tags: ['Summer cool'] }),
    R('v5', 'Egg & Ragi Breakfast Bowl', 'Scrambled egg, ragi flour, spinach, ghee, pumpkin', 'egg', 149, 370, ['🍳', '🌾', '🥬', '#FFF3D6', '#F3D98E'], { species: ['dog'] }),
    R('v6', 'Rajma & Sweet Potato Stew', 'Rajma, sweet potato, green beans, turmeric, flaxseed oil', 'veg', 159, 400, ['🫘', '🍠', '🫛', '#F5E1DA', '#E3B8A9'], { species: ['dog'] }),
    R('v7', 'Moong Dal & Barley Khichdi', 'Moong dal, barley, carrot, sweet potato, ghee', 'veg', 139, 380, ['🍲', '🌾', '🥕', '#FBF0D2', '#EDD593'], { species: ['dog'] }),
    R('v8', 'Paneer & Pumpkin Mash', 'Paneer, pumpkin, green beans, flaxseed oil, nutritional yeast', 'veg', 169, 400, ['🧀', '🎃', '🫛', '#FCEBD6', '#F1C894'], { species: ['dog'] }),
    R('v9', 'Egg & Oats Breakfast Bowl', 'Scrambled egg, rolled oats, carrot, coconut oil', 'egg', 139, 350, ['🍳', '🥣', '🥕', '#FFF4DA', '#F4DC9A'], { species: ['dog'] }),
    R('v10', 'Chickpea & Vegetable Stew', 'Chickpeas, sweet potato, green beans, turmeric, ghee', 'veg', 159, 410, ['🫘', '🥘', '🫛', '#F4EAD5', '#E2CC9C'], { species: ['dog'] }),
    R('v11', 'Curd & Quinoa Bowl', 'Curd, quinoa, carrot, pumpkin, flaxseed oil', 'veg', 159, 360, ['🥛', '🌾', '🎃', '#EEF4EC', '#CFE0C9'], { species: ['dog'] }),
    R('v12', 'Moong Dal & Spinach Rice', 'Moong dal, rice, spinach, pumpkin, ghee', 'veg', 139, 370, ['🍚', '🥬', '🫘', '#E9F2E4', '#C8DDBE'], { species: ['dog'] }),
    R('v13', 'Paneer & Vegetable Scramble', 'Paneer, egg, carrot, spinach, ghee', 'egg', 169, 420, ['🧀', '🍳', '🥕', '#FFF1D9', '#F1D39C'], { species: ['dog'] }),
    R('v14', 'Masoor Dal & Sweet Potato Bowl', 'Masoor dal, sweet potato, green beans, flaxseed oil, nutritional yeast', 'veg', 149, 390, ['🥘', '🍠', '🫛', '#F7E6D8', '#E8C3A5'], { species: ['dog'] }),
    R('v15', 'Pumpkin Pupcakes', 'Pumpkin, oat flour, curd, honey-free', 'veg', 79, 140, ['🧁', '🎃', '🐾', '#FCEBD6', '#F2C894'], { course: 'treat', tags: ['Treat'], species: ['dog'] }),
  ];
}
function menuFrom(nv, v) { const days = {}; L.DAYS.forEach((d, i) => { days[d] = { morning: { nonveg: nv[i][0], veg: v[i][0] }, evening: { nonveg: nv[i][1], veg: v[i][1] } }; }); return days; }
const MENU_A = () => menuFrom([['r1', 'r2'], ['r3', 'r4'], ['r5', 'r6'], ['r1', 'r7'], ['r3', 'r8'], ['r5', 'r2'], ['r6', 'r8']], [['v1', 'v2'], ['v3', 'v4'], ['v5', 'v6'], ['v7', 'v8'], ['v9', 'v10'], ['v11', 'v12'], ['v13', 'v14']]);
const MENU_B = () => menuFrom([['r2', 'r9'], ['r1', 'r5'], ['r8', 'r3'], ['r6', 'r4'], ['r9', 'r1'], ['r2', 'r8'], ['r4', 'r3']], [['v9', 'v6'], ['v1', 'v8'], ['v11', 'v14'], ['v5', 'v2'], ['v3', 'v10'], ['v13', 'v4'], ['v7', 'v12']]);

function cust(id, name, phone, area, line, pets, extra = {}) {
  const a = L.AREAS.find((x) => x.name === area);
  return Object.assign({ id, name, phone, email: name.split(' ')[0].toLowerCase() + '@example.com', joined: Date.now() - 864e5 * 30, addresses: [{ id: 'a' + id, label: 'Home', line: `${line}, ${area}`, area, km: a.km }], pets, referralCode: name.split(' ')[0].toUpperCase().slice(0, 5) + id.toUpperCase(), referredBy: null, referralQualified: null, rewards: { earned: 0, used: 0 } }, extra);
}

function seed() {
  const now = Date.now(); const wk = L.weekKey();
  const customers = [
    cust('c1', 'Aarav Sharma', '9876543210', 'Malviya Nagar', 'B-42, Shivalik Apartments', [
      { id: 'p1', name: 'Bruno', species: 'dog', breed: 'Labrador', ageY: 3, ageM: 2, weight: 28, allergies: ['Wheat'], diet: 'nonveg' },
      { id: 'p2', name: 'Mishti', species: 'cat', breed: 'Indian Shorthair', ageY: 1, ageM: 6, weight: 4, allergies: [], diet: 'nonveg' }], { joined: now - 864e5 * 60, referralCode: 'AARAV7Q2', rewards: { earned: 1, used: 0 } }),
    cust('c2', 'Priya Mehta', '9812345678', 'Raja Park', '14, Raja Park Main Rd', [{ id: 'p3', name: 'Coco', species: 'dog', breed: 'Shih Tzu', ageY: 5, ageM: 0, weight: 7, allergies: ['Chicken'], diet: 'veg' }], { referredBy: 'c1', referralQualified: now - 864e5 * 20 }),
    cust('c3', 'Rohan Gupta', '9898989898', 'Vaishali Nagar', '221, Sector 8', [{ id: 'p4', name: 'Simba', species: 'dog', breed: 'Golden Retriever', ageY: 0, ageM: 8, weight: 14, allergies: [], diet: 'nonveg' }], { referredBy: 'c1', referralQualified: now - 864e5 * 12 }),
    cust('c4', 'Ananya Rathore', '9765432109', 'Mansarovar', '9, Gopalpura Bypass', [{ id: 'p5', name: 'Luna', species: 'cat', breed: 'Persian', ageY: 2, ageM: 3, weight: 4, allergies: ['Fish'], diet: 'nonveg' }], { referredBy: 'c1', referralQualified: now - 864e5 * 8 }),
    cust('c5', 'Kabir Malhotra', '9811122233', 'C-Scheme', '7, Prithviraj Road', [{ id: 'p6', name: 'Rocky', species: 'dog', breed: 'Beagle', ageY: 4, ageM: 1, weight: 12, allergies: [], diet: 'nonveg' }], { referredBy: 'c1', referralQualified: now - 864e5 * 5 }),
    cust('c6', 'Meera Joshi', '9822233344', 'Jagatpura', '55, Mahal Road', [{ id: 'p7', name: 'Oreo', species: 'cat', breed: 'Siamese', ageY: 3, ageM: 0, weight: 4, allergies: ['Dairy'], diet: 'nonveg' }], { referredBy: 'c1', referralQualified: now - 864e5 * 2 }),
    cust('c7', 'Ishaan Verma', '9833344455', 'Bani Park', '3, Kabir Marg', [{ id: 'p8', name: 'Bholu', species: 'dog', breed: 'Indie', ageY: 2, ageM: 0, weight: 18, allergies: [], diet: 'veg' }], { referredBy: 'c1', joined: now - 864e5 }),
  ];
  const riders = [
    { id: 'd1', name: 'Vikram Singh', phone: '9001100110', email: 'vikram@example.com', status: 'approved', vehicle: 'Honda Activa · RJ14 CX 2231', rating: 4.9, online: false, joined: '2025-08' },
    { id: 'd2', name: 'Sameer Khan', phone: '9001100220', email: 'sameer@example.com', status: 'approved', vehicle: 'TVS Jupiter · RJ14 DA 8812', rating: 4.8, online: true, joined: '2025-11' },
    { id: 'd3', name: 'Neha Choudhary', phone: '9001100330', email: 'neha@example.com', status: 'approved', vehicle: 'Ather 450X · RJ14 EV 0042', rating: 4.9, online: true, joined: '2026-02' },
    { id: 'd4', name: 'Arjun Meena', phone: '9001100440', email: 'arjun@example.com', status: 'approved', vehicle: 'Hero Splendor · RJ14 BT 5120', rating: 4.7, online: false, joined: '2026-05' },
  ];
  const st = {
    meta: { seq: 1040, rev: 1, seededAt: now },
    recipes: recipes(),
    menus: {
      [L.addWeeks(wk, -1)]: { status: 'published', publishedAt: now - 864e5 * 9, days: MENU_B(), note: '' },
      [wk]: { status: 'published', publishedAt: now - 864e5 * 3, days: MENU_A(), note: 'Diwali week special — extra paneer & pumpkin bowls 🪔' },
      [L.addWeeks(wk, 1)]: { status: 'draft', publishedAt: null, days: MENU_B(), note: '' },
    },
    plans: [
      { id: 'pl1', name: 'Trial Pack', days: 3, mealsPerDay: 2, price: 899, mrp: 1074, badge: 'Try first', desc: '6 fresh meals across 3 days. Perfect to see if your pet loves it.', active: true },
      { id: 'pl2', name: 'Weekly Fresh', days: 7, mealsPerDay: 2, price: 2099, mrp: 2506, badge: 'Most popular', desc: 'Morning + evening bowls from the weekly menu, every day.', active: true },
      { id: 'pl3', name: 'Monthly Care', days: 30, mealsPerDay: 2, price: 7999, mrp: 10740, badge: 'Best value', desc: '60 meals, a free nutrition consult and priority delivery.', active: true },
    ],
    coupons: [
      { code: 'WELCOME50', desc: '50% off your first order, up to ₹100', type: 'pct', value: 50, max: 100, min: 199, active: true },
      { code: 'FRESHPAW', desc: 'Flat ₹75 off on orders above ₹399', type: 'flat', value: 75, max: 75, min: 399, active: true },
      { code: 'FREEDEL', desc: 'Free delivery on any order', type: 'delivery', value: 0, max: 0, min: 0, active: true },
    ],
    banners: [
      { id: 'b1', title: 'Diwali week menu is live', sub: 'Paneer, pumpkin & slow-cooked mutton', cta: 'See menu', tone: 'pine', emoji: '🪔' },
      { id: 'b4', title: 'Refer 5 friends, get a meal free', sub: 'Share your code — every 5 friends who order = 1 free bowl', cta: 'Invite friends', tone: 'sage', emoji: '🎁' },
      { id: 'b2', title: '50% OFF your first bowl', sub: 'Use code WELCOME50', cta: 'Order now', tone: 'mustard', emoji: '🐾' },
      { id: 'b3', title: 'Puppy Power Bowl', sub: 'Salmon + quinoa for growing pups', cta: 'Add', tone: 'sage', emoji: '🐶' },
    ],
    customers, riders, orders: [], accounts: [], staff: [],
    subscriptions: [
      { id: 'S1001', customerId: 'c2', planId: 'pl2', petId: 'p3', start: now - 864e5 * 2, status: 'active', diet: 'veg', slot: 'Morning · 8–10 AM' },
      { id: 'S1002', customerId: 'c3', planId: 'pl3', petId: 'p4', start: now - 864e5 * 8, status: 'active', diet: 'nonveg', slot: 'Evening · 6–8 PM' },
    ],
    settings: { city: 'Jaipur', deliveryFee: 29, freeAbove: 499, packing: 10, gstPct: 5, kitchenOpen: true, phone: '8209976467', kitchen: 'FoodPeto Kitchen · Tonk Road, Jaipur', cutoff: 'Order by 11 AM for same-day lunch, by 4 PM for dinner', referralsPerReward: 5, freeMealCap: 300 },
  };
  // order history for the dashboards (customers c1–c6; c7 has signed up but not ordered yet)
  const pool = st.recipes.filter((r) => r.course === 'meal');
  for (let i = 0; i < 36; i++) {
    const c = customers[i % 6]; const at = now - 864e5 * (i % 7) - 3600e3 * (2 + ((i * 7) % 9));
    const items = [pool[(i * 3) % pool.length], pool[(i * 5 + 1) % pool.length]].slice(0, 1 + (i % 2)).map((r) => ({ recipeId: r.id, name: r.name, diet: r.diet, course: 'meal', price: L.portionPrice(r.price, 'Regular'), qty: i % 3 === 0 ? 2 : 1, portion: 'Regular', day: L.DAYS[(new Date(at).getDay() + 6) % 7], slot: 'morning' }));
    const o = makeOrder(st, { customer: c, address: c.addresses[0], items, petId: c.pets[0].id, slot: 'Evening · 6–8 PM', payment: i % 3 ? 'UPI' : 'Cash on delivery', forDate: at });
    o.createdAt = at; o.status = 'delivered'; o.riderId = riders[i % 4].id;
    o.timeline = [{ s: 'placed', at }, { s: 'cooking', at: at + 6e5 }, { s: 'ready', at: at + 24e5 }, { s: 'out', at: at + 3e6 }, { s: 'delivered', at: at + 4.5e6 }];
    if (i % 4 !== 3) o.rating = i % 5 !== 0 ? 5 : 4;
    st.orders.push(o);
  }
  [['c2', 'placed', ['v1', 'v15']], ['c3', 'cooking', ['r4', 'r10']], ['c4', 'ready', ['r5']]].forEach(([cid, s, ids], k) => {
    const c = customers.find((x) => x.id === cid);
    const items = ids.map((id) => { const r = st.recipes.find((x) => x.id === id); return { recipeId: id, name: r.name, diet: r.diet, course: r.course, price: L.portionPrice(r.price, r.course === 'meal' ? 'Regular' : 'Pack'), qty: 1, portion: r.course === 'meal' ? 'Regular' : 'Pack', day: L.todayDay(), slot: r.course === 'meal' ? 'evening' : 'anytime' }; });
    const o = makeOrder(st, { customer: c, address: c.addresses[0], items, petId: c.pets[0].id, slot: 'Evening · 6–8 PM', payment: 'UPI',
      instructions: k === 0 ? { comment: 'Please ring the bell twice', customization: ['Mashed / smooth texture'], customText: '', request: 'Pack the pupcakes separately', allergies: ['Chicken'], allergyText: '' } : {} });
    const t0 = now - (25 - k * 8) * 6e4; o.createdAt = t0; o.status = s;
    o.timeline = [{ s: 'placed', at: t0 }]; if (s !== 'placed') o.timeline.push({ s: 'cooking', at: t0 + 3e5 }); if (s === 'ready') o.timeline.push({ s: 'ready', at: t0 + 9e5 });
    st.orders.push(o);
  });
  // a partner application waiting for approval
  st.riders.push({ id: 'd5', name: 'Ravi Kumar', phone: '9001100550', email: 'ravi@example.com', vehicle: 'Bajaj Pulsar · RJ14 GH 7781', licence: 'RJ14 20240012345', area: 'Mansarovar', rating: 5, online: false, status: 'pending', appliedAt: now - 3 * 3600e3, joined: '2026-11' });
  ensureDemoAccounts(st);
  ensureVets(st);
  return st;
}

/** Vet partnership data (also adds the sample partners to databases created before this feature). */
function ensureVets(st) {
  st.vets = st.vets || []; st.vetRequests = st.vetRequests || [];
  if (st.meta.vetsSeeded) return; st.meta.vetsSeeded = true;
  const now = Date.now();
  st.vets.push(
    { id: 'v1', name: 'Dr. Meghna Rao', clinic: 'Happy Tails Vet Clinic (sample)', phone: '9001200110', email: '', area: 'Malviya Nagar', address: 'Sample address — edit me', specialties: ['Dogs', 'Cats', 'Vaccination', 'Nutrition'], modes: ['clinic', 'video'], consultFee: 500, discountPct: 15, commissionPct: 10, partnerSince: '2026-10-01', contractEnd: '2027-09-30', hours: 'Mon–Sat · 10 AM – 8 PM', notes: 'Sample partner — replace with your real vet details.', status: 'active', visible: true, createdAt: now },
    { id: 'v2', name: 'Dr. Arvind Shekhawat', clinic: 'PetWell Home Vets (sample)', phone: '9001200220', email: '', area: 'C-Scheme', address: 'Sample address — edit me', specialties: ['Dogs', 'Skin & allergy', 'Dental'], modes: ['home', 'clinic'], consultFee: 800, discountPct: 10, commissionPct: 12, partnerSince: '2026-11-01', contractEnd: '2027-10-31', hours: 'All days · 9 AM – 9 PM', notes: 'Sample partner — replace with your real vet details.', status: 'active', visible: true, createdAt: now });
  const c = st.customers.find((x) => x.id === 'c2');
  if (c) st.vetRequests.push({ id: 'vr1', customerId: c.id, customerName: c.name, phone: c.phone, email: c.email, petId: c.pets[0].id, petName: c.pets[0].name, petSpecies: c.pets[0].species, petBreed: c.pets[0].breed, vetId: 'v1', vetName: 'Dr. Meghna Rao', clinic: 'Happy Tails Vet Clinic (sample)', mode: 'clinic', preferred: 'Saturday morning', message: 'Coco has itchy skin since last week — could it be the chicken?', status: 'new', createdAt: now - 2 * 3600e3 });
}

const DEMO_IDS = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'd1', 'd2', 'd3', 'd4', 'd5'];
/** Gives the sample customers/partners an email login (also upgrades databases created before logins existed). */
function ensureDemoAccounts(st) {
  st.accounts = st.accounts || []; st.staff = st.staff || [];
  st.riders.forEach((r) => { if (!r.status) r.status = 'approved'; });
  [...st.customers.map((c) => ['customer', c]), ...st.riders.map((r) => ['rider', r])].forEach(([role, u]) => {
    if (!DEMO_IDS.includes(u.id)) return;
    if (!u.email) u.email = u.name.split(' ')[0].toLowerCase() + '@example.com';
    if (!P.accountOf(st, role, u.id) && !P.findAccount(st, role, u.email)) P.createAccount(st, { role, email: u.email, sub: u.id, password: DEMO_PASSWORD });
  });
}

module.exports = { seed, ensureDemoAccounts, ensureVets, DEMO_PASSWORD };
