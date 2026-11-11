/* FoodPeto client data layer.
 * Each app sets window.FP_ROLE ('customer' | 'rider' | 'admin') before loading this file.
 * Reads are synchronous from the latest server snapshot (FP.api.db); writes go to the server
 * with FP.api.call(action, ...args). The server pushes a "changed" event to every open app
 * (Server-Sent Events) and each app re-fetches the part of the data it is allowed to see.
 */
(function () {
  const L = window.FPLogic;
  const ROLE = window.FP_ROLE || 'customer';
  const TOKEN_KEY = 'foodpeto.token.' + ROLE;
  const blank = () => ({ rev: -1, recipes: [], menus: {}, plans: [], coupons: [], banners: [], customers: [], riders: [], orders: [], subscriptions: [], vets: [], vetRequests: [], settings: {}, session: null });
  let token = null; try { token = localStorage.getItem(TOKEN_KEY); } catch (e) { /* storage blocked */ }
  let db = blank(); let online = true;
  const listeners = new Set();

  function setToken(t) { token = t; try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch (e) { /* ignore */ } }
  function emit(src) { listeners.forEach((fn) => { try { fn(db, src); } catch (e) { console.error(e); } }); }

  async function http(method, path, body) {
    let res;
    try {
      res = await fetch('/api' + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
    } catch (e) { throw new Error('Can\'t reach FoodPeto — check your connection'); }
    let data = null; try { data = await res.json(); } catch (e) { /* empty */ }
    if (res.status === 401 && token && (path === '/rpc' || path === '/auth/password')) { if (!(data && /current password/i.test(data.error || ''))) { setToken(null); await refresh(); emit('auth'); } }
    if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
    return data;
  }
  async function refresh() {
    const snap = await http('GET', '/state');
    const changed = snap.rev !== db.rev || JSON.stringify(snap.session) !== JSON.stringify(db.session);
    if (snap.session === null && token) setToken(null); // expired session
    db = snap; return changed;
  }
  // live updates — coalesce bursts of events into one fetch
  let pending = null;
  function onServerChange() {
    if (pending) return; pending = setTimeout(async () => { pending = null; try { if (await refresh()) emit('remote'); } catch (e) { /* retry on next event */ } }, 60);
  }
  function connect() {
    if (!('EventSource' in window)) { setInterval(onServerChange, 5000); return; }
    const es = new EventSource('/api/events');
    es.onmessage = (e) => { if (!online) { online = true; emit('online'); } if (+e.data !== db.rev) onServerChange(); };
    es.onerror = () => { if (online) { online = false; emit('offline'); } };
  }

  const api = {
    get db() { return db; },
    get online() { return online; },
    get session() { return db.session; },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    refresh,
    /** Run a server action. Shows the error as a toast and resolves to null on failure. */
    async call(method, ...args) {
      try { const r = await http('POST', '/rpc', { method, args }); await refresh(); emit('local'); return r.result; }
      catch (e) { if (window.UI) window.UI.toast(e.message, 3200); return null; }
    },
    async resetDemo() { try { await http('POST', '/admin/reset'); await refresh(); emit('local'); return true; } catch (e) { if (window.UI) window.UI.toast(e.message); return false; } },
    /** Email + password auth. Every method throws an Error with a friendly message on failure. */
    auth: {
      async login(email, password) { const r = await http('POST', '/auth/login', { role: ROLE, email, password }); setToken(r.token); await refresh(); emit('local'); return r; },
      async signup(fields) { const r = await http('POST', '/auth/signup', { ...fields, role: ROLE }); setToken(r.token); await refresh(); emit('local'); return r; },
      forgot: (email) => http('POST', '/auth/forgot', { role: ROLE, email }),
      reset: (email, code, password) => http('POST', '/auth/reset', { role: ROLE, email, code, password }),
      async changePassword(current, next) { const r = await http('POST', '/auth/password', { current, next }); await refresh(); emit('local'); return r; },
      async logout() { try { await http('POST', '/auth/logout'); } catch (e) { /* ignore */ } setToken(null); await refresh(); emit('local'); },
    },
    recipe: (id) => db.recipes.find((r) => r.id === id),
    customer: (id) => db.customers.find((c) => c.id === id),
    rider: (id) => db.riders.find((r) => r.id === id),
    order: (id) => db.orders.find((o) => o.id === id),
    plan: (id) => db.plans.find((p) => p.id === id),
    menu: (key) => db.menus[key],
    publishedMenu: (key) => { const m = db.menus[key]; return m && m.status === 'published' ? m : null; },
    quote: (items, code, opts) => L.quote(db, items, code, opts),
  };

  const ready = refresh().then(() => { connect(); return db; });
  window.FP = Object.assign({}, L, { api, ready, ROLE });
})();
