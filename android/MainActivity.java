package __PACKAGE__;

// FoodPeto Android shell. Generated per app by tools/build-apk.js (placeholders __LIKE_THIS__ are filled in).
// It shows the live web app from the FoodPeto server, so most updates reach phones without a new APK.
// When a new APK is published, the web app asks the user and calls FoodPetoNative.installUpdate(url).

import android.app.Activity;
import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.Settings;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;
import java.io.File;

public class MainActivity extends Activity {
    static final String DEFAULT_SERVER = "__SERVER__";
    static final String START_PATH = "__PATH__";
    static final String FLAVOR = "__FLAVOR__";
    static final int VERSION_CODE = __VERSION_CODE__;
    static final String VERSION_NAME = "__VERSION_NAME__";
    static final int PINE = 0xFF25392A;

    private WebView web;
    private SharedPreferences prefs;
    private long downloadId = -1;
    private boolean showingOffline = false;
    private boolean pageLoaded = false;
    private final android.os.Handler handler = new android.os.Handler(android.os.Looper.getMainLooper());
    // If the server doesn't answer (e.g. a PC firewall silently drops the connection), don't sit on a blank screen.
    private final Runnable loadTimeout = () -> {
        if (!pageLoaded && !showingOffline) { web.stopLoading(); showOffline("The server didn't respond in time"); }
    };

    private final BroadcastReceiver downloadDone = new BroadcastReceiver() {
        @Override public void onReceive(Context ctx, Intent intent) {
            long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
            if (id == downloadId) installDownloaded(id);
        }
    };

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        prefs = getSharedPreferences("foodpeto", MODE_PRIVATE);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(PINE);
        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#F5F2E4"));
        root.addView(web, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);

        getWindow().setStatusBarColor(PINE);
        getWindow().setNavigationBarColor(PINE);
        if (Build.VERSION.SDK_INT >= 30) {
            // Android 15 draws apps edge-to-edge: pad for the status bar, nav bar and keyboard.
            root.setOnApplyWindowInsetsListener((v, insets) -> {
                Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.ime() | WindowInsets.Type.displayCutout());
                v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                return WindowInsets.CONSUMED;
            });
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) c.setSystemBarsAppearance(0, WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS);
        }

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setUserAgentString(s.getUserAgentString() + " FoodPetoApp/" + VERSION_CODE + " (" + FLAVOR + "; " + VERSION_NAME + ")");
        web.addJavascriptInterface(new Bridge(), "FoodPetoNative");
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                Uri home = Uri.parse(server());
                boolean sameSite = ("http".equals(u.getScheme()) || "https".equals(u.getScheme())) && u.getHost() != null && u.getHost().equals(home.getHost()) && u.getPort() == home.getPort();
                if (sameSite && !u.getPath().endsWith(".apk")) return false;
                if (sameSite) { startUpdate(u.toString()); return true; }
                openExternal(u);
                return true;
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
                if (req.isForMainFrame()) showOffline(String.valueOf(err.getDescription()));
            }
            @Override public void onPageFinished(WebView view, String url) {
                if (url != null && url.startsWith("http") && !showingOffline) { pageLoaded = true; handler.removeCallbacks(loadTimeout); }
            }
        });
        web.setDownloadListener((url, ua, disposition, mime, length) -> startUpdate(url));

        registerReceiver(downloadDone, new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE), Build.VERSION.SDK_INT >= 33 ? Context.RECEIVER_EXPORTED : 0);

        if (state != null) web.restoreState(state); else load();
    }

    String server() {
        String s = prefs.getString("server", DEFAULT_SERVER);
        return s.endsWith("/") ? s.substring(0, s.length() - 1) : s;
    }

    void load() {
        showingOffline = false; pageLoaded = false;
        handler.removeCallbacks(loadTimeout); handler.postDelayed(loadTimeout, 15000);
        web.loadUrl(server() + START_PATH);
    }

    void openExternal(Uri u) {
        try { startActivity(new Intent(Intent.ACTION_VIEW, u).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); }
        catch (Exception e) { Toast.makeText(this, "No app found to open this link", Toast.LENGTH_SHORT).show(); }
    }

    void showOffline(String why) {
        if (showingOffline) return; showingOffline = true; handler.removeCallbacks(loadTimeout);
        boolean local = server().matches("https?://(192\\.168|10\\.|172\\.(1[6-9]|2\\d|3[01])|localhost).*");
        String html = "<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'><style>"
            + "body{font-family:sans-serif;background:#F5F2E4;color:#26231D;margin:0;padding:40px 22px;text-align:center}"
            + "h1{font-family:serif;font-size:26px;margin:10px 0 6px}p{color:#5B5A52}input{width:100%;box-sizing:border-box;padding:14px;border-radius:12px;border:1.5px solid #E1DEC7;font-size:16px;margin-top:6px}"
            + "button{width:100%;padding:15px;border-radius:99px;border:0;font-weight:800;font-size:16px;margin-top:12px}.p{background:#3D5C3A;color:#fff}.g{background:#fff;border:1.5px solid #E1DEC7}"
            + "label{display:block;text-align:left;font-weight:800;font-size:13px;color:#5B5A52;margin-top:26px}small{color:#8C8A7E}</style></head><body>"
            + "<div style='font-size:60px'>🐾</div><h1>Can't reach FoodPeto</h1><p>Check your internet / Wi-Fi connection and try again.</p>"
            + (local ? "<p style='text-align:left;font-size:14px;background:#fff;border:1px solid #E1DEC7;border-radius:12px;padding:12px 14px'><b>Using the test server on a PC?</b><br>• Phone and PC must be on the <b>same Wi-Fi</b><br>• <code>node server.js</code> must be running on the PC<br>• Windows Firewall must allow Node.js / port 5173</p>" : "")
            + "<button class='p' onclick='FoodPetoNative.retry()'>Try again</button>"
            + "<label>Server address</label><input id='s' value='" + server().replace("'", "") + "' inputmode='url' autocapitalize='off'>"
            + "<button class='g' onclick='FoodPetoNative.setServer(document.getElementById(\"s\").value)'>Save & connect</button>"
            + "<p><small>App v" + VERSION_NAME + " · " + why.replace("<", "") + "</small></p></body></html>";
        web.loadDataWithBaseURL(null, html, "text/html", "utf-8", null);
    }

    // ----- APK self-update -----
    void startUpdate(String url) {
        if (Build.VERSION.SDK_INT >= 26 && !getPackageManager().canRequestPackageInstalls()) {
            Toast.makeText(this, "Allow FoodPeto to install updates, then tap Update again", Toast.LENGTH_LONG).show();
            try { startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getPackageName()))); } catch (Exception e) { openExternal(Uri.parse(url)); }
            return;
        }
        try {
            File old = new File(getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "foodpeto-update.apk");
            if (old.exists()) old.delete();
            DownloadManager dm = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
            DownloadManager.Request r = new DownloadManager.Request(Uri.parse(url))
                .setTitle("FoodPeto update")
                .setDescription("Downloading the latest version")
                .setMimeType("application/vnd.android.package-archive")
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                .setDestinationInExternalFilesDir(this, Environment.DIRECTORY_DOWNLOADS, "foodpeto-update.apk");
            downloadId = dm.enqueue(r);
            Toast.makeText(this, "Downloading update…", Toast.LENGTH_SHORT).show();
        } catch (Exception e) {
            openExternal(Uri.parse(url)); // fall back to the browser's downloader
        }
    }

    void installDownloaded(long id) {
        DownloadManager dm = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
        Uri apk = dm.getUriForDownloadedFile(id);
        if (apk == null) { Toast.makeText(this, "Update download failed — try again", Toast.LENGTH_LONG).show(); return; }
        Intent i = new Intent(Intent.ACTION_VIEW);
        i.setDataAndType(apk, "application/vnd.android.package-archive");
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        try { startActivity(i); } catch (Exception e) { Toast.makeText(this, "Open the downloaded update from your notifications to install", Toast.LENGTH_LONG).show(); }
    }

    class Bridge {
        @JavascriptInterface public void installUpdate(String url) { runOnUiThread(() -> startUpdate(url)); }
        @JavascriptInterface public void retry() { runOnUiThread(MainActivity.this::load); }
        @JavascriptInterface public void setServer(String url) {
            String u = url == null ? "" : url.trim();
            if (!u.startsWith("http://") && !u.startsWith("https://")) u = "http://" + u;
            prefs.edit().putString("server", u).apply();
            runOnUiThread(MainActivity.this::load);
        }
        @JavascriptInterface public String info() {
            return "{\"versionCode\":" + VERSION_CODE + ",\"versionName\":\"" + VERSION_NAME + "\",\"flavor\":\"" + FLAVOR + "\",\"server\":\"" + server() + "\"}";
        }
    }

    @Override public void onBackPressed() {
        if (web.canGoBack() && !showingOffline) web.goBack(); else super.onBackPressed();
    }
    @Override protected void onSaveInstanceState(Bundle out) { super.onSaveInstanceState(out); web.saveState(out); }
    @Override protected void onDestroy() { handler.removeCallbacks(loadTimeout); try { unregisterReceiver(downloadDone); } catch (Exception e) { /* not registered */ } super.onDestroy(); }
}
