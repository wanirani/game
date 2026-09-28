package com.bloodnocturne.game;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * WebView 버전 관문 (platform §9.4-1): Android System WebView(Chromium) 주 버전이 98 보다 낮으면 게임 대신 업데이트 안내를 띄운다.
 * 게임 코드는 Chrome 98 이상의 기능(structuredClone, Object.hasOwn, Array.prototype.at 등)을 쓰므로 낮은 버전에서는 검은 화면이 된다.
 * android.* 를 쓰지 않는 순수 자바 (tools/apk/ApiProxyCheck.java 가 호스트 JVM 에서 시험한다).
 */
final class WebViewCheck {
    static final int MIN_MAJOR = 98;
    /** WebView 제공 패키지를 모를 때 Play 스토어에서 열 패키지 */
    static final String DEFAULT_PACKAGE = "com.google.android.webview";
    private static final Pattern LEADING = Pattern.compile("^\\s*(\\d{1,5})");
    private static final Pattern CHROME = Pattern.compile("Chrome/(\\d{1,5})");

    private WebViewCheck() {
    }

    /** "120.0.6099.230" → 120, 알 수 없으면 -1 */
    static int majorOf(String versionName) {
        if (versionName == null) return -1;
        Matcher m = LEADING.matcher(versionName);
        if (!m.find()) return -1;
        try {
            return Integer.parseInt(m.group(1));
        } catch (NumberFormatException e) {
            return -1;
        }
    }

    /** WebView 기본 User-Agent 의 "Chrome/120.0…" → 120, 알 수 없으면 -1 */
    static int chromeMajorFromUa(String ua) {
        if (ua == null) return -1;
        Matcher m = CHROME.matcher(ua);
        if (!m.find()) return -1;
        try {
            return Integer.parseInt(m.group(1));
        } catch (NumberFormatException e) {
            return -1;
        }
    }

    /**
     * 판단에 쓸 주 버전: 기본 User-Agent 의 Chrome/NN (실제 엔진 버전)이 있으면 그것, 없으면 제공 패키지 versionName 의 주 버전.
     * 일부 제공자는 versionName 이 Chromium 버전이 아니다 (예: 화웨이 com.huawei.webview "12.1.2.322" = Chromium 99) →
     * 패키지 번호만 보면 멀쩡한 기기를 막게 된다.
     */
    static int effectiveMajor(int packageMajor, int uaMajor) {
        return uaMajor > 0 ? uaMajor : packageMajor;
    }

    /** 실행해도 되는가: 버전을 알아냈고 98 미만일 때만 막는다 (알아내지 못하면 막지 않는다) */
    static boolean ok(int major) {
        return major < 0 || major >= MIN_MAJOR;
    }

    /** Play 스토어에서 열 패키지 (WebView 를 제공하는 패키지가 Chrome 인 안드로이드 7~9 도 있다) */
    static String playPackage(String providerPackage) {
        if (providerPackage == null || !providerPackage.matches("^[A-Za-z][A-Za-z0-9_]*(\\.[A-Za-z][A-Za-z0-9_]*)+$")) return DEFAULT_PACKAGE;
        return providerPackage;
    }
}
