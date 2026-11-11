/* Startup guard — loaded first, written in plain ES5 so it runs on any phone browser.
 * Shows a loading screen right away, and if the app fails to start (script error, very old
 * browser, server not answering) replaces it with a readable message instead of a blank page. */
(function () {
  var app = document.getElementById('app');
  if (!app) return;
  var paw = '<svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="32" fill="#3D5C3A"/><g fill="#F5F2E4"><ellipse cx="32" cy="36" rx="9.5" ry="8"/><ellipse cx="21.5" cy="25" rx="3.6" ry="4.6"/><ellipse cx="28" cy="19.5" rx="3.6" ry="4.8"/><ellipse cx="36" cy="19.5" rx="3.6" ry="4.8"/><ellipse cx="42.5" cy="25" rx="3.6" ry="4.6"/></g></svg>';
  var box = 'min-height:80vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:32px 24px;font-family:Nunito,system-ui,sans-serif;color:#26231D';
  app.innerHTML = '<div class="boot" style="' + box + '">' + paw + '<div style="margin-top:14px;font-weight:800;color:#5B5A52">Loading FoodPeto…</div></div>';

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function fail(title, detail) {
    if (!app.querySelector('.boot')) return; // the app already started; leave it alone
    app.innerHTML = '<div style="' + box + '">' + paw +
      '<h2 style="font-family:Georgia,serif;font-size:24px;margin:16px 0 6px">' + esc(title) + '</h2>' +
      '<p style="color:#5B5A52;max-width:320px;margin:0 0 18px;line-height:1.5">' + detail + '</p>' +
      '<button onclick="location.reload()" style="background:#3D5C3A;color:#fff;border:0;border-radius:99px;padding:13px 28px;font-weight:800;font-size:15px">Try again</button></div>';
  }
  window.addEventListener('error', function (e) {
    var where = e.filename ? ' (' + e.filename.split('/').pop() + ':' + e.lineno + ')' : '';
    fail('FoodPeto couldn\'t start', 'Your browser may be out of date — update <b>Chrome</b> or <b>Android System WebView</b> from the Play Store, then try again.<br><small style="color:#8C8A7E">' + esc((e.message || 'Script error') + where) + '</small>');
  });
  setTimeout(function () {
    fail('Still connecting…', 'The FoodPeto server isn\'t answering. Check your internet / Wi-Fi connection and try again.');
  }, 20000);
})();
