// FoodPeto server: serves the three apps and the backend API from one origin.
// Zero dependencies — uses Node's built-in SQLite (Node 22.5+), else a JSON file.
//
//   node server.js                 → http://localhost:5173
//   PORT=8080 node server.js       → custom port
//   OWNER_EMAIL=you@x.com OWNER_PASSWORD=secret node server.js   → first owner login (only used when no owner exists yet)
//   EMAIL_MODE=live node server.js → email password-reset codes (wire a provider in server/api.js → sendEmail)
//   node server.js --reset-owner-password   → print a new temporary owner password and exit
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createApi } = require('./server/api');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 5173;
const PUBLIC = ['/shared/', '/customer/', '/rider/', '/admin/', '/downloads/']; // only these folders (+ /index.html) are public
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.apk': 'application/vnd.android.package-archive' };

// ---------- update checks ----------
// web: a fingerprint of every public file — changes whenever you edit the apps, so open apps offer a refresh.
// apps: the latest APK per app, from downloads/releases.json (written by tools/build-apk.js).
const crypto = require('crypto');
let versionCache = { at: 0, web: '' };
function webFingerprint() {
  if (Date.now() - versionCache.at < 3000) return versionCache.web;
  const h = crypto.createHash('sha1');
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).forEach((e) => {
    const p = path.join(dir, e.name); if (e.isDirectory()) return walk(p);
    const st = fs.statSync(p); h.update(`${path.relative(ROOT, p)}:${st.size}:${st.mtimeMs}\n`);
  });
  ['shared', 'customer', 'rider', 'admin'].forEach((d) => walk(path.join(ROOT, d)));
  h.update(String(fs.statSync(path.join(ROOT, 'index.html')).mtimeMs));
  versionCache = { at: Date.now(), web: h.digest('hex').slice(0, 12) };
  return versionCache.web;
}
function versionInfo() {
  let apps = {}; try { apps = JSON.parse(fs.readFileSync(path.join(ROOT, 'downloads', 'releases.json'), 'utf8')); } catch (e) { /* no APKs built yet */ }
  return { web: webFingerprint(), apps };
}

process.removeAllListeners('warning'); // silence the node:sqlite "experimental" notice
const api = createApi({ dataDir: path.join(ROOT, 'data'), emailMode: process.env.EMAIL_MODE || 'dev', ownerEmail: process.env.OWNER_EMAIL, ownerPassword: process.env.OWNER_PASSWORD });
if (process.argv.includes('--reset-owner-password')) {
  const r = api.resetOwnerPassword();
  console.log(r ? `\n  New temporary owner password → ${r.email} / ${r.password}\n  You'll be asked to choose a new one when you log in.\n` : '\n  No owner account found.\n');
  process.exit(0);
}

function serveStatic(req, res, p) {
  if (p === '/') p = '/index.html';
  if (/^\/(customer|rider|admin)$/.test(p)) { res.writeHead(301, { Location: p + '/' }); return res.end(); }
  if (p.endsWith('/')) p += 'index.html';
  if (p !== '/index.html' && !PUBLIC.some((d) => p.startsWith(d))) { res.writeHead(404); return res.end('Not found'); }
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('Not found'); }
    const ext = path.extname(file);
    res.writeHead(200, { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff',
      ...(ext === '.apk' ? { 'Content-Disposition': `attachment; filename="${path.basename(file)}"` } : {}) });
    fs.createReadStream(file).pipe(res);
  });
}

http.createServer((req, res) => {
  let p; try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch (e) { res.writeHead(400); return res.end(); }
  if (p === '/api/version') { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); return res.end(JSON.stringify(versionInfo())); }
  if (p.startsWith('/api/')) return api.handle(req, res, p);
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  return serveStatic(req, res, p);
}).listen(PORT, '0.0.0.0', () => {
  const lan = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
  console.log('\n  🐾 FoodPeto is running\n');
  console.log(`  This computer   http://localhost:${PORT}/`);
  lan.forEach((ip) => console.log(`  Phones on Wi-Fi http://${ip}:${PORT}/`));
  console.log(`\n  Customer app  /customer/    Partner app  /rider/    Admin  /admin/`);
  console.log(`  Storage       ${api.info.storage}`);
  console.log(`  Admin owner   ${api.info.owner}   (forgot the password? run: node server.js --reset-owner-password)`);
  console.log(`  Email mode    ${api.info.emailMode === 'dev' ? 'test — password-reset codes are shown on screen and printed here' : 'live'}`);
  api.info.notices.forEach((n) => console.log(`\n  ⚠ ${n}`));
  console.log('');
});
