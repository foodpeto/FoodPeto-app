// HTTP API: email/password auth, role-filtered state, actions (RPC) and live events (SSE).
const crypto = require('crypto');
const { openStore, loadState, makeSaver } = require('./db');
const { ACTIONS, signupCustomer, applyRider } = require('./actions');
const { seed, ensureDemoAccounts, ensureVets } = require('./seed');
const P = require('./passwords');

const SESSION_TTL = 30 * 864e5;
const RESET_TTL = 15 * 6e4;
const LOCK_AFTER = 8; const LOCK_FOR = 15 * 6e4;
const err = (msg, status = 400) => Object.assign(new Error(msg), { status });

function createApi({ dataDir, emailMode = 'dev', ownerEmail, ownerPassword }) {
  const store = openStore(dataDir);
  const save = makeSaver(store);
  let state = loadState(store) || seed();
  ensureDemoAccounts(state);
  ensureVets(state);

  // ---------- first owner account ----------
  const notices = [];
  if (!state.staff.some((s) => s.role === 'owner' && s.active)) {
    const legacy = store.get('secrets', 'admin'); // password from before staff accounts existed
    const email = P.normEmail(ownerEmail || 'admin@foodpeto.com');
    const password = ownerPassword || (legacy && legacy.password) || P.tempPassword();
    const s = { id: 's_owner', name: 'Owner', email, role: 'owner', active: true, createdAt: Date.now() };
    state.staff.push(s);
    const existing = P.findAccount(state, 'admin', email);
    if (existing) { existing.sub = s.id; P.setPassword(existing, password, { mustChange: !ownerPassword }); }
    else P.createAccount(state, { role: 'admin', email, sub: s.id, password, mustChange: !ownerPassword });
    notices.push(`Owner account created → ${email} / ${password}  (you'll be asked to choose a new password)`);
  }
  save(state, { full: true });

  // ---------- realtime ----------
  const clients = new Set();
  function broadcast() { const msg = `data: ${state.meta.rev}\n\n`; clients.forEach((res) => res.write(msg)); }
  setInterval(() => clients.forEach((res) => res.write(': ping\n\n')), 25000).unref();
  function commit() { state.meta.rev += 1; save(state); broadcast(); }

  // ---------- sessions ----------
  function newSession(acc) { const token = crypto.randomBytes(24).toString('hex'); store.put('sessions', token, { role: acc.role, sub: acc.sub, email: acc.email, created: Date.now() }); return token; }
  function revokeSessions(role, sub, exceptToken) {
    store.all('sessions').forEach(({ id, data }) => { if (data.role === role && data.sub === sub && id !== exceptToken) store.del('sessions', id); });
  }
  function sessionOf(req) {
    const h = req.headers.authorization || ''; const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!token) return null; const s = store.get('sessions', token);
    if (!s || Date.now() - s.created > SESSION_TTL) { if (s) store.del('sessions', token); return null; }
    const acc = P.accountOf(state, s.role, s.sub);
    if (!acc) { store.del('sessions', token); return null; }
    const sess = { ...s, token, mustChange: !!acc.mustChange };
    if (s.role === 'admin') { const st = state.staff.find((x) => x.id === s.sub); if (!st || !st.active) { store.del('sessions', token); return null; } sess.staffRole = st.role; sess.staffName = st.name; }
    return sess;
  }

  // ---------- email (password reset codes) ----------
  async function sendEmail(to, subject, text) {
    // Plug an email service in here (Resend, SendGrid, Amazon SES, Gmail SMTP) and run with EMAIL_MODE=live.
    throw err('Email service not configured yet — ask FoodPeto support to reset your password', 503);
  }

  // ---------- login throttling ----------
  function checkLock(key) {
    const a = store.get('logins', key); if (!a) return;
    if (a.lockedUntil && Date.now() < a.lockedUntil) throw err(`Too many attempts. Try again in ${Math.ceil((a.lockedUntil - Date.now()) / 6e4)} min.`, 429);
  }
  function failed(key) {
    const a = store.get('logins', key) || { count: 0 }; if (a.lockedUntil && Date.now() >= a.lockedUntil) a.count = 0;
    a.count += 1; a.lockedUntil = a.count >= LOCK_AFTER ? Date.now() + LOCK_FOR : null; store.put('logins', key, a);
  }
  const signupHits = new Map();
  function limitSignup(ip) {
    const now = Date.now(); const list = (signupHits.get(ip) || []).filter((t) => now - t < 3600e3);
    if (list.length >= 10) throw err('Too many sign-ups from this network — try again later', 429);
    list.push(now); signupHits.set(ip, list);
  }
  const roleOk = (r) => { if (!['customer', 'rider', 'admin'].includes(r)) throw err('Invalid app'); return r; };

  /** Runs fn on a copy of the state; only a successful run is kept. */
  function transact(fn) { const draft = JSON.parse(JSON.stringify(state)); const result = fn(draft); state = draft; commit(); return result; }

  const auth = {
    login({ role, email, password }) {
      roleOk(role); const e = P.normEmail(email); const key = `${role}:${e}`;
      if (!e || !password) throw err('Enter your email and password');
      checkLock(key);
      const acc = P.findAccount(state, role, e);
      if (!P.verifyPassword(password, acc)) { failed(key); throw err('Wrong email or password', 401); }
      if (role === 'admin') { const s = state.staff.find((x) => x.id === acc.sub); if (!s || !s.active) throw err('This staff account has been deactivated', 403); }
      store.del('logins', key);
      transact((d) => { const a = P.accountOf(d, role, acc.sub); a.lastLoginAt = Date.now(); });
      return { token: newSession(acc), mustChange: !!acc.mustChange };
    },
    signup(body, ip) {
      const role = roleOk(body.role); if (role === 'admin') throw err('Staff accounts are created by the owner', 403);
      limitSignup(ip);
      const sub = transact((d) => (role === 'customer' ? signupCustomer(d, body) : applyRider(d, body)));
      return { token: newSession(P.accountOf(state, role, sub)) };
    },
    async forgot({ role, email }) {
      roleOk(role); const e = P.normEmail(email); if (!P.emailOk(e)) throw err('Enter a valid email address');
      const key = `${role}:${e}`; const prev = store.get('resets', key);
      if (prev && Date.now() - prev.sentAt < 30e3) throw err('Please wait a moment before requesting another code', 429);
      const acc = P.findAccount(state, role, e);
      const code = String(crypto.randomInt(100000, 1000000));
      if (acc) store.put('resets', key, { code, expires: Date.now() + RESET_TTL, tries: 0, sentAt: Date.now() });
      if (emailMode === 'live') { if (acc) await sendEmail(e, 'Your FoodPeto password reset code', `Your code is ${code}. It expires in 15 minutes.`); return { sent: true }; }
      if (acc) console.log(`  [reset] ${role} ${e} → ${code}`);
      return { sent: true, devCode: acc ? code : null }; // test mode: show the code on screen
    },
    reset({ role, email, code, password }) {
      roleOk(role); const e = P.normEmail(email); const key = `${role}:${e}`; const r = store.get('resets', key);
      if (!r || Date.now() > r.expires) throw err('This code has expired — request a new one');
      if (r.tries >= 5) { store.del('resets', key); throw err('Too many wrong codes — request a new one', 429); }
      if (String(code).trim() !== r.code) { r.tries += 1; store.put('resets', key, r); throw err('Incorrect code'); }
      const prob = P.passwordProblem(password); if (prob) throw err(prob);
      store.del('resets', key); store.del('logins', key);
      const acc = P.findAccount(state, role, e); if (!acc) throw err('Account not found', 404);
      transact((d) => P.setPassword(P.findAccount(d, role, e), password));
      revokeSessions(role, acc.sub);
      return { ok: true };
    },
    changePassword(sess, { current, next }) {
      if (!sess) throw err('Please log in again', 401);
      const acc = P.accountOf(state, sess.role, sess.sub);
      if (!P.verifyPassword(current, acc)) throw err('Your current password is incorrect');
      const prob = P.passwordProblem(next); if (prob) throw err(prob);
      if (current === next) throw err('Choose a password different from the current one');
      transact((d) => P.setPassword(P.accountOf(d, sess.role, sess.sub), next));
      revokeSessions(sess.role, sess.sub, sess.token); // sign out other devices
      return { ok: true };
    },
    logout(sess) { if (sess) store.del('sessions', sess.token); return { ok: true }; },
  };

  // ---------- role-filtered state ----------
  function snapshot(sess) {
    const base = { rev: state.meta.rev, serverTime: Date.now(), settings: state.settings, recipes: state.recipes, banners: state.banners, plans: state.plans.filter((p) => p.active),
      coupons: state.coupons.filter((c) => c.active), menus: {}, customers: [], riders: [], orders: [], subscriptions: [], session: sess ? { role: sess.role, email: sess.email, mustChange: sess.mustChange } : null };
    const published = () => Object.fromEntries(Object.entries(state.menus).filter(([, m]) => m.status === 'published'));
    if (!sess) return { ...base, menus: published() };
    if (sess.role === 'admin') {
      const { accounts, meta, ...rest } = state; // password hashes never leave the server
      const lastLogin = (role, sub) => { const a = P.accountOf(state, role, sub); return a ? a.lastLoginAt || null : null; };
      return { ...base, ...rest, session: { ...base.session, staffId: sess.sub, staffRole: sess.staffRole, staffName: sess.staffName },
        staff: state.staff.map((s) => ({ ...s, lastLoginAt: lastLogin('admin', s.id) })),
        riders: state.riders.map((r) => ({ ...r, hasLogin: !!P.accountOf(state, 'rider', r.id) })),
        customers: state.customers.map((c) => ({ ...c, hasLogin: !!P.accountOf(state, 'customer', c.id), lastLoginAt: lastLogin('customer', c.id),
          referralCount: state.customers.filter((x) => x.referredBy === c.id && x.referralQualified).length, referralPending: state.customers.filter((x) => x.referredBy === c.id && !x.referralQualified).length })) };
    }
    if (sess.role === 'customer') {
      const c = state.customers.find((x) => x.id === sess.sub);
      base.menus = published(); base.session.customerId = c ? c.id : null;
      if (!c) return base;
      const orders = state.orders.filter((o) => o.customerId === c.id);
      const riderIds = new Set(orders.map((o) => o.riderId).filter(Boolean));
      const friends = state.customers.filter((x) => x.referredBy === c.id);
      const r = c.rewards || { earned: 0, used: 0 }; const per = state.settings.referralsPerReward || 5;
      const qualified = friends.filter((x) => x.referralQualified).length;
      return { ...base, customers: [c], orders, subscriptions: state.subscriptions.filter((s) => s.customerId === c.id),
        vets: state.vets.filter((v) => v.status === 'active' && v.visible).map(({ id, name, clinic, phone, area, address, specialties, modes, consultFee, discountPct, hours }) => ({ id, name, clinic, phone, area, address, specialties, modes, consultFee, discountPct, hours })),
        vetRequests: state.vetRequests.filter((r) => r.customerId === c.id),
        riders: state.riders.filter((x) => riderIds.has(x.id)).map(({ id, name, rating, vehicle, phone }) => ({ id, name, rating, vehicle, phone })),
        referral: { code: c.referralCode, per, qualified, pending: friends.length - qualified, towardNext: qualified % per, earned: r.earned, used: r.used, available: Math.max(0, r.earned - r.used),
          friends: friends.map((x) => ({ name: x.name.split(' ')[0] + ' ' + (x.name.split(' ')[1] || '').slice(0, 1) + '.', joined: x.joined, qualified: x.referralQualified })) } };
    }
    if (sess.role === 'rider') {
      const me = state.riders.find((x) => x.id === sess.sub); base.session.riderId = me ? me.id : null;
      const approved = me && (me.status || 'approved') === 'approved';
      const mine = state.orders.filter((o) => o.riderId === sess.sub).map(({ otp, otpTries, ...o }) => o);
      const offers = !approved ? [] : state.orders.filter((o) => !o.riderId && ['cooking', 'ready'].includes(o.status) && !(o.declinedBy || []).includes(sess.sub))
        .map((o) => ({ id: o.id, status: o.status, createdAt: o.createdAt, address: { area: o.address.area, km: o.address.km }, items: o.items, slot: o.slot, payment: o.payment, total: o.total, riderPay: o.riderPay, tip: o.tip, timeline: o.timeline, riderId: null }));
      return { ...base, recipes: [], banners: [], plans: [], coupons: [], riders: me ? [me] : [], orders: [...mine, ...offers] };
    }
    return base;
  }

  // ---------- HTTP ----------
  async function readJson(req) {
    return new Promise((resolve, reject) => {
      let size = 0; const chunks = [];
      req.on('data', (c) => { size += c.length; if (size > 1e6) { reject(err('Request too large', 413)); req.destroy(); } else chunks.push(c); });
      req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch (e) { reject(err('Invalid JSON')); } });
      req.on('error', reject);
    });
  }
  const send = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };

  async function handle(req, res, pathname) {
    try {
      const sess = sessionOf(req);
      if (pathname === '/api/health') return send(res, 200, { ok: true, rev: state.meta.rev, storage: store.kind });
      if (pathname === '/api/events' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
        res.write(`retry: 2000\ndata: ${state.meta.rev}\n\n`); clients.add(res); req.on('close', () => clients.delete(res)); return;
      }
      if (pathname === '/api/state' && req.method === 'GET') return send(res, 200, snapshot(sess));
      if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
      const body = await readJson(req);
      const ip = req.socket.remoteAddress || '';
      if (pathname === '/api/auth/login') return send(res, 200, auth.login(body));
      if (pathname === '/api/auth/signup') return send(res, 200, auth.signup(body, ip));
      if (pathname === '/api/auth/forgot') return send(res, 200, await auth.forgot(body));
      if (pathname === '/api/auth/reset') return send(res, 200, auth.reset(body));
      if (pathname === '/api/auth/password') return send(res, 200, auth.changePassword(sess, body));
      if (pathname === '/api/auth/logout') return send(res, 200, auth.logout(sess));
      if (pathname === '/api/rpc') {
        if (!sess) return send(res, 401, { error: 'Please log in again' });
        if (sess.mustChange) return send(res, 403, { error: 'Please set a new password first' });
        const a = ACTIONS[body.method];
        if (!a) return send(res, 404, { error: 'Unknown action' });
        if (!a.roles.includes(sess.role) || (a.staff && !a.staff.includes(sess.staffRole))) return send(res, 403, { error: 'Your account doesn\'t have permission to do that' });
        const ctx = { ...sess };
        let result = transact((d) => a.fn(d, ctx, ...(Array.isArray(body.args) ? body.args : [])));
        if (result && result._revoke) { const r = result._revoke; revokeSessions(r.role, r.sub); }
        if (result && typeof result === 'object') { const { _revoke, ...clean } = result; result = clean; }
        return send(res, 200, { result: result || { ok: true }, rev: state.meta.rev });
      }
      if (pathname === '/api/admin/reset') {
        if (!sess || sess.role !== 'admin' || sess.staffRole !== 'owner') return send(res, 403, { error: 'Only the owner can reset data' });
        const keepStaff = state.staff; const keepAdmins = state.accounts.filter((x) => x.role === 'admin'); const rev = state.meta.rev;
        state = seed(); state.staff = keepStaff; state.accounts = [...state.accounts, ...keepAdmins]; state.meta.rev = rev;
        save(state, { full: true }); commit();
        return send(res, 200, { ok: true });
      }
      return send(res, 404, { error: 'Not found' });
    } catch (e) {
      if (!e.status) console.error(e);
      return send(res, e.status || 500, { error: e.status ? e.message : 'Something went wrong on the server' });
    }
  }

  /** CLI helper: node server.js --reset-owner-password */
  function resetOwnerPassword() {
    const owner = state.staff.find((s) => s.role === 'owner' && s.active); const acc = owner && P.accountOf(state, 'admin', owner.id);
    if (!acc) return null; const temp = P.tempPassword(); P.setPassword(acc, temp, { mustChange: true }); save(state); revokeSessions('admin', owner.id);
    return { email: acc.email, password: temp };
  }

  const owner = state.staff.find((s) => s.role === 'owner' && s.active);
  return { handle, resetOwnerPassword, info: { storage: store.kind, emailMode, owner: owner ? owner.email : '-', notices } };
}

module.exports = { createApi };
