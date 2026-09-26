package com.bloodnocturne.game;

import android.annotation.SuppressLint;
import android.annotation.TargetApi;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.util.Log;
import android.view.Gravity;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.ServiceWorkerClient;
import android.webkit.ServiceWorkerController;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.TextView;

import org.json.JSONArray;

/**
 * 블러드 녹턴 안드로이드 앱: 가로 몰입형 전체화면 WebView 한 장.
 *
 * - 게임(index.html, css/, src/, assets/)은 APK assets/www 에 들어 있고 AssetServer 가
 *   https://appassets.androidplatform.net/ 가상 출처로 제공한다 (오프라인 동작, localStorage 세이브 유지).
 * - 게임패드: WebView(Chromium)가 Gamepad API 로 넘겨준다. 액티비티는 게임패드 키를 가로채지 않으며,
 *   처리되지 않은 B 버튼이 시스템 '뒤로'로 바뀌지 않도록 게임패드 이벤트는 소비 처리한다.
 * - 뒤로 버튼: 게임에 Escape 키(메뉴/취소)를 보낸다. 타이틀 화면에서는 종료 확인 창을 띄운다.
 */
public class MainActivity extends Activity {
    private static final String TAG = "BloodNocturne";
    private static final int BG = 0xFF050207;

    /** 뒤로 버튼을 눌렀을 때 게임 상태를 묻는 스크립트: 'exit' 이면 종료 확인, 'esc' 면 Escape 전달 */
    private static final String BACK_PROBE_JS =
            "(function(){try{var g=window.__game;if(!g||!g.scenes||!g.scenes.length)return 'exit';"
            + "var t=g.scenes[g.scenes.length-1];"
            + "if(g.scenes.length===1&&t&&t.name==='title'&&t.mode!=='menu')return 'exit';"
            + "return 'esc';}catch(e){return 'exit';}})()";

    /** 게임 입력(src/core/input.js)은 window 의 keydown/keyup 의 e.code 를 읽는다. 한 프레임 이상 눌린 상태를 유지한다 */
    private static final String ESCAPE_JS =
            "(function(){try{var o={key:'Escape',code:'Escape',keyCode:27,which:27,bubbles:true,cancelable:true};"
            + "var t=document.activeElement||document.body||document;"
            + "t.dispatchEvent(new KeyboardEvent('keydown',o));"
            + "setTimeout(function(){t.dispatchEvent(new KeyboardEvent('keyup',o));},120);}catch(e){}})()";

    private FrameLayout root;
    private WebView web;
    private AssetServer server;
    private AlertDialog exitDialog;
    private boolean backPending;
    private final Handler ui = new Handler(Looper.getMainLooper());

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Window w = getWindow();
        w.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                | WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED
                | WindowManager.LayoutParams.FLAG_FULLSCREEN);
        if (Build.VERSION.SDK_INT >= 28) {
            WindowManager.LayoutParams lp = w.getAttributes();
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            w.setAttributes(lp);
        }
        if (Build.VERSION.SDK_INT >= 30) w.setDecorFitsSystemWindows(false);
        w.getDecorView().setBackgroundColor(BG);
        setVolumeControlStream(AudioManager.STREAM_MUSIC);

        server = new AssetServer(getAssets(), versionName());
        root = new FrameLayout(this);
        root.setBackgroundColor(BG);
        setContentView(root, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        if (Build.VERSION.SDK_INT >= 24) {
            try {
                ServiceWorkerController.getInstance().setServiceWorkerClient(new SwClient(server));
            } catch (Throwable t) {
                Log.w(TAG, "service worker client unavailable", t);
            }
        }
        if (!createWebView()) return;
        web.loadUrl(AssetServer.START_URL);
        hideSystemUi();
    }

    /** WebView 생성 (렌더러가 죽었을 때 재생성에도 사용). WebView 가 없는 기기면 안내문 표시 */
    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    private boolean createWebView() {
        try {
            web = new WebView(this);
        } catch (Throwable t) {
            Log.e(TAG, "WebView unavailable", t);
            TextView tv = new TextView(this);
            tv.setText(getString(R.string.no_webview));
            tv.setTextColor(Color.rgb(232, 200, 114));
            tv.setTextSize(18);
            tv.setGravity(Gravity.CENTER);
            tv.setPadding(48, 48, 48, 48);
            root.addView(tv, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
            return false;
        }
        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) WebView.setWebContentsDebuggingEnabled(true);

        web.setBackgroundColor(BG);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        web.setFocusable(true);
        web.setFocusableInTouchMode(true);
        web.setKeepScreenOn(true);
        web.setHapticFeedbackEnabled(false);
        web.setLongClickable(false);
        web.setOnLongClickListener(v -> true); // 길게 눌러 텍스트 선택/컨텍스트 메뉴가 뜨지 않게
        if (Build.VERSION.SDK_INT >= 26) web.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, true);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        s.setSupportMultipleWindows(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setTextZoom(100); // 시스템 글꼴 크기 설정이 게임 UI 를 깨지 않도록
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setOffscreenPreRaster(true);
        s.setUserAgentString(s.getUserAgentString() + " BloodNocturneApp/" + versionName());

        web.addJavascriptInterface(new Bridge(this), "BNAndroid");
        web.setWebViewClient(new Client(this));
        web.setWebChromeClient(new Chrome());
        root.addView(web, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        web.requestFocus();
        return true;
    }

    private String versionName() {
        try {
            PackageInfo pi = getPackageManager().getPackageInfo(getPackageName(), 0);
            return pi.versionName == null ? "" : pi.versionName;
        } catch (Exception e) {
            return "";
        }
    }

    // ───────────────────────── 몰입형 전체화면 ─────────────────────────

    @SuppressWarnings("deprecation")
    private void hideSystemUi() {
        Window w = getWindow();
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController c = w.getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            w.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_FULLSCREEN);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            hideSystemUi();
            if (web != null && !web.hasFocus()) web.requestFocus();
        }
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig); // 게임패드 연결/회전으로 액티비티가 다시 만들어지지 않게 manifest configChanges 로 받는다
        hideSystemUi();
    }

    // ───────────────────────── 입력 (뒤로 버튼 · 게임패드) ─────────────────────────

    private static boolean isGamepadEvent(KeyEvent e) {
        int src = e.getSource();
        return KeyEvent.isGamepadButton(e.getKeyCode())
                || (src & InputDevice.SOURCE_GAMEPAD) == InputDevice.SOURCE_GAMEPAD
                || (src & InputDevice.SOURCE_JOYSTICK) == InputDevice.SOURCE_JOYSTICK;
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        int kc = e.getKeyCode();
        if (kc == KeyEvent.KEYCODE_BACK) {
            // 휴대폰 뒤로 버튼/제스처(및 일부 패드의 BACK): 게임 메뉴/취소(Escape) 또는 타이틀에서 종료 확인
            if (e.getAction() == KeyEvent.ACTION_UP && !e.isCanceled()) onGameBack();
            return true;
        }
        if (web != null && isGamepadEvent(e)) {
            // WebView 로 그대로 보내고(→ Gamepad API), 처리 여부와 상관없이 소비해 시스템이 B 버튼을 '뒤로'로 바꾸지 않게 한다
            if (!web.hasFocus()) web.requestFocus();
            super.dispatchKeyEvent(e);
            return true;
        }
        return super.dispatchKeyEvent(e);
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        onGameBack(); // dispatchKeyEvent 를 거치지 않는 뒤로 제스처 대비
    }

    private void onGameBack() {
        if (web == null) {
            finish();
            return;
        }
        if (exitDialog != null && exitDialog.isShowing()) return;
        if (backPending) return;
        backPending = true;
        ui.postDelayed(() -> backPending = false, 1500); // 스크립트 응답이 오지 않는 경우 대비
        web.evaluateJavascript(BACK_PROBE_JS, value -> {
            backPending = false;
            if (value != null && value.contains("esc")) {
                if (web != null) web.evaluateJavascript(ESCAPE_JS, null);
            } else {
                confirmExit();
            }
        });
    }

    private void confirmExit() {
        if (isFinishing() || (exitDialog != null && exitDialog.isShowing())) return;
        exitDialog = new AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                .setTitle(R.string.exit_title)
                .setMessage(R.string.exit_message)
                .setPositiveButton(R.string.exit_ok, (d, which) -> finishApp())
                .setNegativeButton(R.string.exit_cancel, null)
                .setOnDismissListener(d -> {
                    hideSystemUi();
                    if (web != null) web.requestFocus();
                })
                .create();
        Window dw = exitDialog.getWindow();
        if (dw != null) {
            // 대화상자가 뜰 때 시스템 바가 튀어나오지 않도록 잠시 포커스를 받지 않게 띄운 뒤 되돌린다
            dw.setFlags(WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE, WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE);
        }
        exitDialog.show();
        if (dw != null) {
            if (Build.VERSION.SDK_INT < 30) {
                dw.getDecorView().setSystemUiVisibility(getWindow().getDecorView().getSystemUiVisibility());
            } else {
                WindowInsetsController c = dw.getInsetsController();
                if (c != null) {
                    c.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                    c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                }
            }
            dw.clearFlags(WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE);
        }
    }

    private void finishApp() {
        if (Build.VERSION.SDK_INT >= 21) finishAndRemoveTask();
        else finish();
    }

    // ───────────────────────── 생명주기 ─────────────────────────

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) {
            web.onResume();
            web.resumeTimers();
            web.requestFocus();
        }
        hideSystemUi();
    }

    @Override
    protected void onPause() {
        // 페이지에 visibilitychange(hidden) 가 전달되어 게임이 자동 일시정지 · 오디오 정지한다
        if (web != null) {
            web.onPause();
            web.pauseTimers();
        }
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (exitDialog != null) {
            exitDialog.dismiss();
            exitDialog = null;
        }
        ui.removeCallbacksAndMessages(null);
        if (web != null) {
            root.removeView(web);
            web.stopLoading();
            web.setWebChromeClient(null);
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    // ───────────────────────── WebView 클라이언트 ─────────────────────────

    // ※ 내부 클래스는 모두 static + 명시적 생성자로 둔다. JDK 21 javac 가 익명/내부 클래스 생성자에 붙이는
    //   MethodParameters(이름 없는 mandated 인자)를 build-tools 34 의 d8 이 처리하지 못하고 NPE 로 죽기 때문.
    //   콜백은 람다를 쓴다 (d8 이 디슈가링).

    /** 서비스 워커가 보내는 요청도 같은 가상 출처로 처리 */
    private static final class SwClient extends ServiceWorkerClient {
        private final AssetServer server;

        SwClient(AssetServer server) {
            this.server = server;
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebResourceRequest request) {
            return server.serve(request);
        }
    }

    private static final class Client extends WebViewClient {
        private final MainActivity a;

        Client(MainActivity a) {
            this.a = a;
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            return a.server.serve(request);
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri u = request.getUrl();
            if (AssetServer.isLocal(u)) return false;
            // 외부 링크는 브라우저로
            try {
                a.startActivity(new Intent(Intent.ACTION_VIEW, u).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            } catch (ActivityNotFoundException ignored) {
            }
            return true;
        }

        @TargetApi(26)
        @Override
        public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            // 메모리 부족 등으로 렌더러가 종료되면 앱이 죽지 않도록 WebView 를 새로 만들어 다시 불러온다 (세이브는 localStorage 에 남아 있음)
            Log.w(TAG, "renderer gone, crashed=" + detail.didCrash());
            if (view == a.web) {
                a.root.removeView(a.web);
                a.web.destroy();
                a.web = null;
                if (a.createWebView()) a.web.loadUrl(AssetServer.START_URL);
            } else {
                view.destroy();
            }
            return true;
        }
    }

    private static final class Chrome extends WebChromeClient {
        @Override
        public boolean onConsoleMessage(ConsoleMessage m) {
            if (m.messageLevel() == ConsoleMessage.MessageLevel.ERROR) {
                Log.e(TAG, m.message() + " @" + m.sourceId() + ":" + m.lineNumber());
            } else {
                Log.d(TAG, m.message());
            }
            return true;
        }

        @Override
        public void onShowCustomView(View view, CustomViewCallback callback) {
            // 앱은 이미 전체화면이므로 페이지의 전체화면 요청은 바로 되돌린다
            callback.onCustomViewHidden();
        }

        @Override
        public void onPermissionRequest(PermissionRequest request) {
            request.deny();
        }

        @Override
        public Bitmap getDefaultVideoPoster() {
            // <video> 기본 회색 재생 아이콘 대신 투명 1px
            return Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888);
        }
    }

    // ───────────────────────── JS 브리지 (window.BNAndroid) ─────────────────────────

    private static final class Bridge {
        private final MainActivity a;

        Bridge(MainActivity a) {
            this.a = a;
        }

        @JavascriptInterface
        public boolean isApp() {
            return true;
        }

        @JavascriptInterface
        public String version() {
            return a.versionName();
        }

        @JavascriptInterface
        public void exitApp() {
            a.ui.post(a::finishApp);
        }

        /** 진동: 숫자(ms) 또는 [진동, 쉼, 진동, …] 패턴의 JSON 문자열 */
        @JavascriptInterface
        @SuppressWarnings("deprecation")
        public void vibrate(String json) {
            try {
                Vibrator v = (Vibrator) a.getSystemService(Context.VIBRATOR_SERVICE);
                if (v == null || !v.hasVibrator()) return;
                String s = json == null ? "0" : json.trim();
                if (s.startsWith("[")) {
                    JSONArray a = new JSONArray(s);
                    if (a.length() == 0) {
                        v.cancel();
                        return;
                    }
                    long[] pattern = new long[a.length() + 1];
                    pattern[0] = 0;
                    for (int i = 0; i < a.length(); i++) pattern[i + 1] = Math.max(0, Math.min(5000, a.optLong(i)));
                    if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createWaveform(pattern, -1));
                    else v.vibrate(pattern, -1);
                } else {
                    long ms = Math.max(0, Math.min(5000, (long) Double.parseDouble(s)));
                    if (ms <= 0) {
                        v.cancel();
                        return;
                    }
                    if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE));
                    else v.vibrate(ms);
                }
            } catch (Throwable t) {
                Log.w(TAG, "vibrate failed", t);
            }
        }
    }
}
