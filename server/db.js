// Persistence: SQLite via Node's built-in node:sqlite (Node 22.5+), falling back to a JSON file.
// Every record is stored as a JSON document in `docs(coll, id, data)`. The server keeps the live
// state in memory and writes back only the records that changed after each action.
const fs = require('fs');
const path = require('path');

const COLLS = { recipes: 'id', plans: 'id', coupons: 'code', banners: 'id', customers: 'id', riders: 'id', orders: 'id', subscriptions: 'id', accounts: 'id', staff: 'id', vets: 'id', vetRequests: 'id' };

function openStore(dir) {
  fs.mkdirSync(dir, { recursive: true });
  let sqlite = null;
  try { sqlite = require('node:sqlite'); } catch (e) { /* older Node */ }
  return sqlite ? sqliteStore(sqlite, path.join(dir, 'foodpeto.db')) : jsonStore(path.join(dir, 'foodpeto.json'));
}

function sqliteStore({ DatabaseSync }, file) {
  const db = new DatabaseSync(file);
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS docs (coll TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, updated INTEGER NOT NULL, PRIMARY KEY (coll, id));`);
  const qAll = db.prepare('SELECT id, data FROM docs WHERE coll = ? ORDER BY rowid');
  const qGet = db.prepare('SELECT data FROM docs WHERE coll = ? AND id = ?');
  const qPut = db.prepare('INSERT INTO docs (coll, id, data, updated) VALUES (?, ?, ?, ?) ON CONFLICT(coll, id) DO UPDATE SET data = excluded.data, updated = excluded.updated');
  const qDel = db.prepare('DELETE FROM docs WHERE coll = ? AND id = ?');
  return {
    kind: `SQLite (${file})`,
    all: (coll) => qAll.all(coll).map((r) => ({ id: r.id, data: JSON.parse(r.data) })),
    get: (coll, id) => { const r = qGet.get(coll, id); return r ? JSON.parse(r.data) : null; },
    put: (coll, id, data) => qPut.run(coll, id, typeof data === 'string' ? data : JSON.stringify(data), Date.now()),
    del: (coll, id) => qDel.run(coll, id),
    batch(fn) { db.exec('BEGIN'); try { fn(); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; } },
    wipe() { db.exec('DELETE FROM docs'); },
  };
}

function jsonStore(file) {
  let data = {}; try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { /* new file */ }
  const flush = () => { fs.writeFileSync(file + '.tmp', JSON.stringify(data)); fs.renameSync(file + '.tmp', file); };
  let inBatch = false;
  const s = {
    kind: `JSON file (${file})`,
    all: (coll) => Object.entries(data[coll] || {}).map(([id, d]) => ({ id, data: d })),
    get: (coll, id) => (data[coll] || {})[id] || null,
    put: (coll, id, d) => { (data[coll] = data[coll] || {})[id] = typeof d === 'string' ? JSON.parse(d) : d; if (!inBatch) flush(); },
    del: (coll, id) => { if (data[coll]) delete data[coll][id]; if (!inBatch) flush(); },
    batch(fn) { inBatch = true; try { fn(); } finally { inBatch = false; flush(); } },
    wipe() { data = {}; flush(); },
  };
  return s;
}

/** Loads app state from the store, or returns null if the store has never been seeded. */
function loadState(store) {
  const meta = store.get('meta', 'main'); if (!meta) return null;
  const state = { meta, settings: store.get('settings', 'main') || {}, menus: {} };
  for (const c of Object.keys(COLLS)) state[c] = store.all(c).map((r) => r.data);
  store.all('menus').forEach((r) => { state.menus[r.id] = r.data; });
  return state;
}

/** Writes only changed/removed records. `cache` remembers what is already on disk. */
function makeSaver(store) {
  const cache = new Map();
  return function save(state, { full = false } = {}) {
    if (full) for (const k of cache.keys()) cache.set(k, null); // force rewrite, but still delete records that disappeared
    const seen = new Set();
    store.batch(() => {
      const put = (coll, id, obj) => { const k = coll + '\u0000' + id; const json = JSON.stringify(obj); seen.add(k); if (cache.get(k) !== json) { store.put(coll, id, json); cache.set(k, json); } };
      put('meta', 'main', state.meta); put('settings', 'main', state.settings);
      for (const [c, key] of Object.entries(COLLS)) state[c].forEach((r) => put(c, String(r[key]), r));
      Object.entries(state.menus).forEach(([wk, m]) => put('menus', wk, m));
      for (const k of [...cache.keys()]) if (!seen.has(k)) { const [coll, id] = k.split('\u0000'); store.del(coll, id); cache.delete(k); }
    });
  };
}

module.exports = { openStore, loadState, makeSaver, COLLS };
