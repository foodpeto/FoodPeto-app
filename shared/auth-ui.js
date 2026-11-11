/* Shared login / sign-up / forgot-password / change-password UI for all three FoodPeto apps.
 *
 *   AuthUI.mount(container, cfg)  — renders into container (call after every app render; values are preserved)
 *   cfg = {
 *     signup: { cta, title, intro, submit, fields(values) → html, collect(formData) → object } | null,
 *     forced: true when the user must replace a temporary password,
 *     note: optional html under the form,
 *   }
 */
(function () {
  const { esc, toast } = UI;
  const S = { mode: 'login', values: {}, devCode: null, busy: false, cfg: null, box: null };
  const v = (k) => esc(S.values[k] || '');

  function strength(pw) { let n = 0; if (pw.length >= 8) n++; if (pw.length >= 12) n++; if (/[a-z]/i.test(pw) && /\d/.test(pw)) n++; if (/[^a-z0-9]/i.test(pw) || /[A-Z]/.test(pw) && /[a-z]/.test(pw)) n++; return n; }
  const pwProblem = (pw) => (pw.length < 8 ? 'Password must be at least 8 characters' : !/[a-z]/i.test(pw) || !/\d/.test(pw) ? 'Use at least one letter and one number' : null);
  const pw = (name, label, { meter = false, ac = 'current-password' } = {}) => `<div class="field"><label for="au-${name}">${label}</label>
    <div class="pw"><input class="input" id="au-${name}" type="password" name="${name}" autocomplete="${ac}" required value="${v(name)}"><button type="button" class="pw-eye" data-auth="eye" aria-label="Show password">Show</button></div>
    ${meter ? `<div class="pw-meter" aria-hidden="true"><span></span></div><div class="tiny muted">At least 8 characters, with a letter and a number</div>` : ''}</div>`;
  const email = () => `<div class="field"><label for="au-email">Email</label><input class="input" id="au-email" type="email" name="email" autocomplete="email" inputmode="email" required value="${v('email')}" placeholder="you@example.com"></div>`;
  const btn = (label) => `<button class="btn btn-primary btn-block btn-lg" type="submit" ${S.busy ? 'disabled' : ''}>${S.busy ? 'Please wait…' : label}</button>`;
  const link = (mode, text) => `<button type="button" class="link small" data-auth="mode" data-mode="${mode}">${text}</button>`;

  function html() {
    const c = S.cfg;
    if (c.forced) return `<h2 class="au-title">Choose a new password</h2><p class="muted small au-intro">You signed in with a temporary password. Set your own to continue.</p>
      <form id="auth-form" class="col au-form" data-kind="change" novalidate>${pw('current', 'Temporary password')}${pw('next', 'New password', { meter: true, ac: 'new-password' })}${pw('confirm', 'Confirm new password', { ac: 'new-password' })}${btn('Save password')}</form>
      <div class="au-switch">${link('logout', 'Sign out')}</div>`;
    if (S.mode === 'signup' && c.signup) return `<h2 class="au-title">${c.signup.title}</h2>${c.signup.intro ? `<p class="muted small au-intro">${c.signup.intro}</p>` : ''}
      <form id="auth-form" class="col au-form" data-kind="signup" novalidate>${c.signup.fields(S.values)}${email()}${pw('password', 'Create a password', { meter: true, ac: 'new-password' })}
        <label class="au-terms"><input type="checkbox" name="terms" ${S.values.terms ? 'checked' : ''} required> <span>I agree to FoodPeto's Terms of Service and Privacy Policy</span></label>
        ${btn(c.signup.submit)}</form>
      <div class="au-switch">Already have an account? ${link('login', 'Log in')}</div>`;
    if (S.mode === 'forgot') return `<h2 class="au-title">Forgot your password?</h2><p class="muted small au-intro">Enter your account email and we'll send you a 6-digit code to reset it.</p>
      <form id="auth-form" class="col au-form" data-kind="forgot" novalidate>${email()}${btn('Send reset code')}</form>
      <div class="au-switch">${link('login', '← Back to log in')}</div>`;
    if (S.mode === 'reset') return `<h2 class="au-title">Reset your password</h2><p class="muted small au-intro">If <b>${v('email')}</b> has an account, a code is on its way. It expires in 15 minutes.</p>
      ${S.devCode ? `<button type="button" class="badge b-mustard au-dev" data-auth="fill">Test mode · code ${esc(S.devCode)} — tap to fill</button>` : ''}
      <form id="auth-form" class="col au-form" data-kind="reset" novalidate>
        <div class="field"><label for="au-code">6-digit code</label><input class="input au-code" id="au-code" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required value="${v('code')}"></div>
        ${pw('password', 'New password', { meter: true, ac: 'new-password' })}${btn('Set new password')}</form>
      <div class="au-switch">${link('forgot', 'Resend code')} · ${link('login', 'Back to log in')}</div>`;
    return `<h2 class="au-title">Log in</h2>
      <form id="auth-form" class="col au-form" data-kind="login" novalidate>${email()}${pw('password', 'Password')}
        <div style="text-align:right;margin-top:-4px">${link('forgot', 'Forgot password?')}</div>${btn('Log in')}</form>
      ${c.signup ? `<div class="au-switch">${c.signup.cta} ${link('signup', c.signup.link || 'Sign up')}</div>` : ''}`;
  }

  function capture() { const f = S.box && S.box.querySelector('#auth-form'); if (!f) return; new FormData(f).forEach((val, k) => { S.values[k] = val; }); const t = f.querySelector('[name=terms]'); if (t) S.values.terms = t.checked; }
  function draw() {
    const focused = document.activeElement && document.activeElement.id;
    S.box.innerHTML = `<div class="au">${html()}${S.cfg.note || ''}</div>`;
    S.box.querySelectorAll('input[name=password], input[name=next]').forEach(meter);
    const el = focused && document.getElementById(focused); if (el && S.box.contains(el)) el.focus();
  }
  function meter(input) { const m = input.closest('.field').querySelector('.pw-meter span'); if (!m) return; const n = strength(input.value); m.style.width = `${n * 25}%`; m.style.background = ['#B4452F', '#B4452F', '#C98A2E', '#7E9B74', '#3D5C3A'][n]; }
  function setMode(m) { capture(); S.mode = m; draw(); const first = S.box.querySelector('input:not([type=checkbox])'); if (first) first.focus(); }

  async function submit(form) {
    capture(); const d = S.values; const kind = form.dataset.kind; const api = FP.api;
    const need = (k, msg) => { if (!String(d[k] || '').trim()) throw new Error(msg); };
    try {
      if (kind === 'login') { need('email', 'Enter your email'); need('password', 'Enter your password'); }
      if (kind === 'signup') { const extra = S.cfg.signup.collect(d); need('email', 'Enter your email'); const p = pwProblem(d.password || ''); if (p) throw new Error(p); if (!d.terms) throw new Error('Please accept the Terms to continue'); S._signup = extra; }
      if (kind === 'forgot') need('email', 'Enter your email');
      if (kind === 'reset') { if (!/^\d{6}$/.test(String(d.code || '').trim())) throw new Error('Enter the 6-digit code'); const p = pwProblem(d.password || ''); if (p) throw new Error(p); }
      if (kind === 'change') { const p = pwProblem(d.next || ''); if (p) throw new Error(p); if (d.next !== d.confirm) throw new Error('The new passwords don\'t match'); }
    } catch (e) { return toast(e.message, 3200); }
    S.busy = true; draw();
    try {
      if (kind === 'login') { const r = await api.auth.login(d.email, d.password); S.values = {}; if (!r.mustChange) toast('Welcome back! 🐾'); }
      if (kind === 'signup') { await api.auth.signup({ ...S._signup, email: d.email, password: d.password }); S.values = {}; S.mode = 'login'; toast('Account created 🎉'); }
      if (kind === 'forgot') { const r = await api.auth.forgot(d.email); S.devCode = r.devCode || null; S.mode = 'reset'; S.values = { email: d.email }; }
      if (kind === 'reset') { await api.auth.reset(d.email, String(d.code).trim(), d.password); S.mode = 'login'; S.devCode = null; S.values = { email: d.email }; toast('Password updated — log in with your new password'); }
      if (kind === 'change') { await api.auth.changePassword(d.current, d.next); S.values = {}; toast('Password saved ✓'); }
    } catch (e) { toast(e.message, 3600); if (kind === 'login' || kind === 'change') { S.values.password = ''; S.values.current = ''; } }
    S.busy = false; if (S.box && document.body.contains(S.box)) draw();
  }

  document.addEventListener('submit', (e) => { if (e.target.id === 'auth-form') { e.preventDefault(); submit(e.target); } });
  document.addEventListener('input', (e) => { if (e.target.closest && e.target.closest('#auth-form') && /^(password|next)$/.test(e.target.name)) meter(e.target); });
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-auth]'); if (!b || !S.box || !S.box.contains(b)) return;
    const k = b.dataset.auth;
    if (k === 'mode') { if (b.dataset.mode === 'logout') FP.api.auth.logout(); else setMode(b.dataset.mode); }
    if (k === 'eye') { const i = b.previousElementSibling; const show = i.type === 'password'; i.type = show ? 'text' : 'password'; b.textContent = show ? 'Hide' : 'Show'; b.setAttribute('aria-label', show ? 'Hide password' : 'Show password'); }
    if (k === 'fill') { const c = S.box.querySelector('[name=code]'); if (c) { c.value = S.devCode; S.box.querySelector('[name=password]').focus(); } }
  });

  window.AuthUI = {
    mount(container, cfg) { if (S.box && S.box !== container) capture(); S.box = container; S.cfg = cfg; if (!cfg.signup && S.mode === 'signup') S.mode = 'login'; draw(); },
    setMode(m) { S.mode = m; },
    get mode() { return S.mode; },
  };
})();
