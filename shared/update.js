/* FoodPeto update checker — loaded by every app.
 *  • Web update: the server's file fingerprint changed → "New version ready · Update" bar → reload.
 *  • App update (Android APK): a newer build is listed in downloads/releases.json →
 *    "Update available" dialog → the app downloads and opens the installer.
 *    Builds older than minVersionCode get a dialog that can't be dismissed.
 */
(function () {
  const FLAVOR_BY_ROLE = { customer: 'customer', rider: 'partner', admin: 'admin' };
  const m = navigator.userAgent.match(/FoodPetoApp\/(\d+) \((\w+); ([^)]+)\)/);
  const native = m ? { code: +m[1], flavor: m[2], name: m[3] } : null;
  const flavor = native ? native.flavor : FLAVOR_BY_ROLE[window.FP_ROLE];
  let loadedWeb = null; let dismissedCode = 0; let shown = null;
  window.FP_APP = { native, flavor };

  const esc = (s) => String((s == null ? '' : s)).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function css() {
    if (document.getElementById('upd-css')) return;
    const s = document.createElement('style'); s.id = 'upd-css';
    s.textContent = `.upd-bar{position:fixed;left:50%;transform:translateX(-50%);top:10px;z-index:200;width:calc(100% - 24px);max-width:456px;background:var(--ink,#26231D);color:#F5F2E4;border-radius:14px;padding:10px 10px 10px 16px;display:flex;align-items:center;gap:10px;box-shadow:0 10px 30px rgba(0,0,0,.25);font-weight:800;font-size:14px;animation:pop .3s}
      .upd-bar button{background:#E8C27E;color:#25392A;border:0;border-radius:99px;padding:8px 14px;font-weight:900;cursor:pointer}
      .upd-bar .x{background:none;color:#F5F2E4;padding:6px;opacity:.7}
      .upd-modal{position:fixed;inset:0;z-index:210;background:rgba(20,30,22,.6);display:flex;align-items:flex-end;justify-content:center}
      .upd-card{width:100%;max-width:480px;background:var(--cream-soft,#FAF8F0);border-radius:24px 24px 0 0;padding:24px 20px 28px;text-align:center;animation:pop .3s}
      .upd-card h2{font-size:24px;margin:8px 0 4px}.upd-card ul{text-align:left;margin:14px 0;padding-left:20px;color:var(--ink-soft,#5B5A52);font-weight:700;font-size:14px;line-height:1.6}`;
    document.head.appendChild(s);
  }
  function webBar() {
    if (shown) return; shown = 'web'; css();
    const b = document.createElement('div'); b.className = 'upd-bar'; b.setAttribute('role', 'status');
    b.innerHTML = `<span style="flex:1">✨ A new version of FoodPeto is ready</span><button data-u="go">Update</button><button class="x" data-u="x" aria-label="Later">✕</button>`;
    b.onclick = (e) => { const k = e.target.dataset.u; if (k === 'go') location.reload(); if (k === 'x') { b.remove(); shown = null; loadedWeb = null; setTimeout(check, 10 * 6e4); } };
    document.body.appendChild(b);
  }
  function appModal(rel, forced) {
    if (shown === 'app') return; document.querySelectorAll('.upd-bar').forEach((x) => x.remove()); shown = 'app'; css();
    const url = new URL(rel.url, location.origin).href;
    const el = document.createElement('div'); el.className = 'upd-modal';
    el.innerHTML = `<div class="upd-card" role="dialog" aria-label="App update"><div style="font-size:54px">🐾</div>
      <h2 style="font-family:var(--font-display,serif)">${forced ? 'Update required' : 'Update available'}</h2>
      <div style="color:var(--ink-soft,#5B5A52);font-weight:700">Version ${esc(rel.versionName)} · you have ${esc(native.name)}</div>
      ${rel.notes && rel.notes.length ? `<ul>${rel.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : '<p style="margin:14px 0">Bug fixes and improvements.</p>'}
      <button class="btn btn-primary btn-block btn-lg" data-u="go">Update now${rel.sizeMB ? ` · ${rel.sizeMB} MB` : ''}</button>
      ${forced ? '' : '<button class="btn btn-ghost btn-block" style="margin-top:8px" data-u="later">Later</button>'}
      <p style="font-size:12px;color:var(--ink-faint,#8C8A7E);margin-top:12px">If Android asks, allow FoodPeto to install apps — this is only used for FoodPeto updates.</p></div>`;
    el.onclick = (e) => {
      const k = e.target.dataset.u;
      if (k === 'go') { if (window.FoodPetoNative && window.FoodPetoNative.installUpdate) window.FoodPetoNative.installUpdate(url); else location.href = url; if (!forced) { el.remove(); shown = null; } }
      if (k === 'later') { dismissedCode = rel.versionCode; el.remove(); shown = null; }
    };
    document.body.appendChild(el);
  }
  async function check() {
    try {
      const v = await (await fetch('/api/version', { cache: 'no-store' })).json();
      if (native) {
        const rel = v.apps && v.apps[native.flavor];
        if (rel && rel.versionCode > native.code) {
          const forced = (rel.minVersionCode || 0) > native.code;
          if (forced || rel.versionCode !== dismissedCode) return appModal(rel, forced);
        }
      }
      if (loadedWeb === null) loadedWeb = v.web; else if (v.web !== loadedWeb) webBar();
    } catch (e) { /* offline — try again later */ }
  }
  window.FP_checkForUpdates = check;
  window.addEventListener('load', () => setTimeout(check, 1500));
  setInterval(check, 2 * 6e4);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
})();
