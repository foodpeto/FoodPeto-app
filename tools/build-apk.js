#!/usr/bin/env node
// Builds signed Android APKs for the FoodPeto customer and partner apps — no Gradle, no npm packages.
// Uses the Android SDK (build-tools + platform) and the JDK that are already installed.
//
//   node tools/build-apk.js                       → build both apps, next version (1.0.0 the first time)
//   node tools/build-apk.js --app customer        → just one app (customer | partner)
//   node tools/build-apk.js --version 1.2.0 --notes "New referral screen|Faster checkout"
//   node tools/build-apk.js --server https://app.foodpeto.com   → point the app at a hosted server
//   node tools/build-apk.js --min 3                → force everyone below build 3 to update
//
// Output: downloads/foodpeto-<app>-<version>.apk and downloads/releases.json.
// The running server announces releases.json to installed apps, which then offer the update.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const ANDROID = path.join(ROOT, 'android');
const OUT = path.join(ROOT, 'downloads');
const BUILD = path.join(ROOT, 'build', 'android');
const APPS = {
  customer: { pkg: 'com.foodpeto.customer', label: 'FoodPeto', path: '/customer/', bg: '#3D5C3A', paw: '#F5F2E4' },
  partner: { pkg: 'com.foodpeto.partner', label: 'FoodPeto Partner', path: '/rider/', bg: '#25392A', paw: '#E8C27E' },
};

// ---------- args ----------
const argv = process.argv.slice(2); const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const targets = arg('app', 'all') === 'all' ? Object.keys(APPS) : [arg('app')];
targets.forEach((t) => { if (!APPS[t]) fail(`Unknown app "${t}". Use customer, partner or all.`); });

function fail(msg) { console.error('\n✖ ' + msg + '\n'); process.exit(1); }
function q(s) { return `"${s}"`; }
function run(cmd, cwd) {
  try { return execSync(cmd, { cwd, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' }); }
  catch (e) { fail(`Command failed:\n  ${cmd}\n\n${(e.stdout || '') + (e.stderr || '')}`); }
}

// ---------- toolchain ----------
const SDK = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || path.join(process.env.LOCALAPPDATA || os.homedir(), 'Android', 'Sdk');
const latest = (dir) => { try { return fs.readdirSync(dir).filter((x) => /^[\d.]+$|^android-\d+$/.test(x)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).pop(); } catch (e) { return null; } };
const btVer = latest(path.join(SDK, 'build-tools')); const plat = latest(path.join(SDK, 'platforms'));
if (!btVer || !plat) fail(`Android SDK not found at ${SDK}. Install build-tools and a platform (Android Studio → SDK Manager), or set ANDROID_HOME.`);
const BT = path.join(SDK, 'build-tools', btVer); const ANDROID_JAR = path.join(SDK, 'platforms', plat, 'android.jar');
const exe = (n) => { const w = process.platform === 'win32'; const f = ['', '.exe', '.bat'].map((e) => path.join(BT, n + (w ? e : ''))).find((p) => fs.existsSync(p)); if (!f) fail(`${n} missing in ${BT}`); return q(f); };
const JAVA_BIN = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin') : '';
const jdk = (n) => q(JAVA_BIN ? path.join(JAVA_BIN, n + (process.platform === 'win32' ? '.exe' : '')) : n);

// ---------- config: server URL + signing key ----------
fs.mkdirSync(ANDROID, { recursive: true }); fs.mkdirSync(OUT, { recursive: true });
const cfgFile = path.join(ANDROID, 'build.json'); const cfg = fs.existsSync(cfgFile) ? JSON.parse(fs.readFileSync(cfgFile, 'utf8')) : {};
const lan = Object.values(os.networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal);
const server = (arg('server') || cfg.server || `http://${lan ? lan.address : 'localhost'}:5173`).replace(/\/$/, '');
cfg.server = server; fs.writeFileSync(cfgFile, JSON.stringify(cfg, null, 2));

const ksFile = path.join(ANDROID, 'foodpeto-release.jks'); const ksProps = path.join(ANDROID, 'keystore.json');
if (!fs.existsSync(ksFile)) {
  const pw = crypto.randomBytes(12).toString('hex');
  run(`${jdk('keytool')} -genkeypair -keystore ${q(ksFile)} -storetype PKCS12 -alias foodpeto -keyalg RSA -keysize 2048 -validity 10000 -storepass ${pw} -keypass ${pw} -dname "CN=FoodPeto, O=FoodPeto, L=Jaipur, C=IN"`);
  fs.writeFileSync(ksProps, JSON.stringify({ storePassword: pw, alias: 'foodpeto' }, null, 2));
  console.log('🔑 Created signing key android/foodpeto-release.jks — BACK IT UP. Updates must be signed with this same key.');
}
const ks = JSON.parse(fs.readFileSync(ksProps, 'utf8'));

// ---------- versions ----------
const relFile = path.join(OUT, 'releases.json'); const releases = fs.existsSync(relFile) ? JSON.parse(fs.readFileSync(relFile, 'utf8')) : {};
const bump = (v) => { const p = v.split('.').map(Number); p[2] = (p[2] || 0) + 1; return p.join('.'); };
const notes = (arg('notes', '') || '').split('|').map((s) => s.trim()).filter(Boolean);

// ---------- resources ----------
function ellipse(cx, cy, rx, ry, rot) {
  const d = `M${cx - rx},${cy} a${rx},${ry} 0 1,0 ${2 * rx},0 a${rx},${ry} 0 1,0 ${-2 * rx},0 z`;
  return `<group android:rotation="${rot}" android:pivotX="${cx}" android:pivotY="${cy}"><path android:fillColor="@color/paw" android:pathData="${d}"/></group>`;
}
function writeRes(dir, app) {
  const w = (p, s) => { fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true }); fs.writeFileSync(path.join(dir, p), s); };
  const ns = 'xmlns:android="http://schemas.android.com/apk/res/android"';
  w('values/colors.xml', `<resources><color name="bg">${app.bg}</color><color name="paw">${app.paw}</color></resources>`);
  w('drawable/ic_paw.xml', `<vector ${ns} android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108">
  <group android:scaleX="1.5" android:scaleY="1.5" android:translateX="6" android:translateY="9.75">
    ${ellipse(32, 36, 9.5, 8, 0)}${ellipse(21.5, 25, 3.6, 4.6, -18)}${ellipse(28, 19.5, 3.6, 4.8, -6)}${ellipse(36, 19.5, 3.6, 4.8, 6)}${ellipse(42.5, 25, 3.6, 4.6, 18)}
  </group></vector>`);
  const adaptive = `<adaptive-icon ${ns}><background android:drawable="@color/bg"/><foreground android:drawable="@drawable/ic_paw"/><monochrome android:drawable="@drawable/ic_paw"/></adaptive-icon>`;
  w('mipmap-anydpi-v26/ic_launcher.xml', adaptive); w('mipmap-anydpi-v26/ic_launcher_round.xml', adaptive);
}
function manifest(app, code, name) {
  return `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="${app.pkg}" android:versionCode="${code}" android:versionName="${name}">
  <uses-sdk android:minSdkVersion="26" android:targetSdkVersion="35"/>
  <uses-permission android:name="android.permission.INTERNET"/>
  <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE"/>
  <uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES"/>
  <uses-permission android:name="android.permission.VIBRATE"/>
  <application android:label="${app.label}" android:icon="@mipmap/ic_launcher" android:roundIcon="@mipmap/ic_launcher_round"
      android:usesCleartextTraffic="true" android:allowBackup="false" android:hardwareAccelerated="true"
      android:theme="@android:style/Theme.Material.Light.NoActionBar">
    <activity android:name=".MainActivity" android:exported="true" android:launchMode="singleTask"
        android:configChanges="orientation|screenSize|screenLayout|smallestScreenSize|keyboardHidden|keyboard|uiMode|density"
        android:windowSoftInputMode="adjustResize">
      <intent-filter><action android:name="android.intent.action.MAIN"/><category android:name="android.intent.category.LAUNCHER"/></intent-filter>
    </activity>
  </application>
</manifest>`;
}

// ---------- build ----------
console.log(`\n📦 FoodPeto APK build · server ${server} · build-tools ${btVer} · ${plat}\n`);
const template = fs.readFileSync(path.join(ANDROID, 'MainActivity.java'), 'utf8');
for (const key of targets) {
  const app = APPS[key]; const prev = releases[key];
  const versionName = arg('version') || (prev ? bump(prev.versionName) : '1.0.0');
  const versionCode = arg('code') ? +arg('code') : (prev ? prev.versionCode + 1 : 1);
  const dir = path.join(BUILD, key); fs.rmSync(dir, { recursive: true, force: true });
  const res = path.join(dir, 'res'); const srcDir = path.join(dir, 'src', ...app.pkg.split('.')); const classes = path.join(dir, 'classes'); const dex = path.join(dir, 'dex');
  [res, srcDir, classes, dex].forEach((d) => fs.mkdirSync(d, { recursive: true }));
  process.stdout.write(`  ${app.label} v${versionName} (build ${versionCode}) … `);

  writeRes(res, app);
  fs.writeFileSync(path.join(dir, 'AndroidManifest.xml'), manifest(app, versionCode, versionName));
  const java = template.replace(/__PACKAGE__/g, app.pkg).replace(/__SERVER__/g, server).replace(/__PATH__/g, app.path)
    .replace(/__FLAVOR__/g, key).replace(/__VERSION_CODE__/g, String(versionCode)).replace(/__VERSION_NAME__/g, versionName);
  const javaFile = path.join(srcDir, 'MainActivity.java'); fs.writeFileSync(javaFile, java);

  const unsigned = path.join(dir, 'unsigned.apk'); const aligned = path.join(dir, 'aligned.apk');
  run(`${exe('aapt2')} compile --dir ${q(res)} -o ${q(path.join(dir, 'res.zip'))}`);
  run(`${exe('aapt2')} link -o ${q(unsigned)} -I ${q(ANDROID_JAR)} --manifest ${q(path.join(dir, 'AndroidManifest.xml'))} ${q(path.join(dir, 'res.zip'))}`);
  run(`${jdk('javac')} -encoding UTF-8 -source 11 -target 11 -Xlint:-options -classpath ${q(ANDROID_JAR)} -d ${q(classes)} ${q(javaFile)}`);
  const classFiles = []; (function walk(d) { fs.readdirSync(d, { withFileTypes: true }).forEach((e) => { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (p.endsWith('.class')) classFiles.push(q(p)); }); })(classes);
  run(`${exe('d8')} --release --min-api 26 --lib ${q(ANDROID_JAR)} --output ${q(dex)} ${classFiles.join(' ')}`);
  run(`${exe('aapt')} add ${q(unsigned)} classes.dex`, dex);
  run(`${exe('zipalign')} -f -p 4 ${q(unsigned)} ${q(aligned)}`);
  const file = `foodpeto-${key}-${versionName}.apk`; const outApk = path.join(OUT, file);
  run(`${exe('apksigner')} sign --ks ${q(ksFile)} --ks-pass pass:${ks.storePassword} --ks-key-alias ${ks.alias} --key-pass pass:${ks.storePassword} --out ${q(outApk)} ${q(aligned)}`);
  run(`${exe('apksigner')} verify ${q(outApk)}`);
  fs.rmSync(outApk + '.idsig', { force: true });

  const sizeMB = +(fs.statSync(outApk).size / 1048576).toFixed(2);
  releases[key] = { versionCode, versionName, url: `/downloads/${file}`, sizeMB, notes: notes.length ? notes : (prev ? ['Bug fixes and improvements'] : ['First release']),
    minVersionCode: arg('min') ? +arg('min') : (prev ? prev.minVersionCode || 0 : 0), package: app.pkg, server, builtAt: new Date().toISOString() };
  console.log(`✓ downloads/${file} (${sizeMB} MB)`);
}
fs.writeFileSync(relFile, JSON.stringify(releases, null, 2));
// a simple download page at /downloads/
const card = (k) => { const r = releases[k]; if (!r) return ''; return `<a class="card" href="${r.url}"><span class="ic" style="background:${APPS[k].bg}">🐾</span><span class="grow"><b>${APPS[k].label}</b><small>Version ${r.versionName} · ${r.sizeMB} MB · Android 8+</small></span><span class="btn">Download</span></a>`; };
fs.writeFileSync(path.join(OUT, 'index.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Get the FoodPeto apps</title><link rel="icon" href="../shared/favicon.svg">
<style>body{font-family:system-ui,sans-serif;background:#F5F2E4;color:#26231D;margin:0;padding:32px 16px}main{max-width:460px;margin:0 auto}h1{font-family:Georgia,serif;font-size:30px;margin:0 0 6px}p{color:#5B5A52}
.card{display:flex;align-items:center;gap:14px;background:#fff;border:1px solid #E1DEC7;border-radius:18px;padding:14px;margin-top:12px;text-decoration:none;color:inherit}.ic{width:48px;height:48px;border-radius:14px;display:grid;place-items:center;font-size:24px}
.grow{flex:1;display:flex;flex-direction:column}small{color:#8C8A7E;margin-top:2px}.btn{background:#3D5C3A;color:#fff;border-radius:99px;padding:9px 14px;font-weight:800;font-size:14px}ol{color:#5B5A52;line-height:1.7;padding-left:20px}</style></head>
<body><main><h1>Get the FoodPeto apps</h1><p>Fresh food for pets. Happy paws. 🐾</p>${Object.keys(APPS).map(card).join('')}
<h3 style="margin-top:28px">How to install</h3><ol><li>Tap <b>Download</b> and open the file.</li><li>If Android asks, allow your browser to <b>install unknown apps</b>.</li><li>Tap <b>Install</b>. Future updates are offered inside the app.</li></ol></main></body></html>`);
console.log(`\n✅ Done. Installed apps will offer the update automatically (downloads/releases.json).`);
console.log(`   Download on a phone: ${server}/downloads/\n`);
