#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
#  블러드 녹턴 — 안드로이드 APK 빌드 (Gradle 없이: aapt2 + javac + d8 + zipalign + apksigner)
# ══════════════════════════════════════════════════════════════════════════════
#
#  사용법
#    tools/apk/build_apk.sh             빌드 → dist/BloodNocturne.apk (+ 서명/정렬/내용물 검증)
#    tools/apk/build_apk.sh --verify    빌드 후 헤드리스 부팅 검증(tools/apk/verify_apk.mjs)까지 실행
#    tools/apk/build_apk.sh --verify-only   이미 만든 APK 로 검증만
#
#  필요한 것: bash, curl, unzip, zip, python3(+Pillow), JDK 17+ (java/javac/jar/keytool), node(--verify 시)
#  Android SDK 가 없으면 $ANDROID_HOME(기본 /root/android-sdk)에 자동 설치한다:
#    commandlinetools → sdkmanager → platform-tools, build-tools;34.0.0, platforms;android-34 (라이선스 자동 동의)
#
#  결과물
#    dist/BloodNocturne.apk           서명(v2+v3)·zipalign 된 릴리스 APK (dist/ 는 git 무시)
#    dist/apk-build/                  중간 산출물 (매 빌드마다 새로 만든다)
#
#  서명 키 (git 에 올리지 않음 — .gitignore 에 등록됨)
#    tools/android/release.keystore       처음 빌드할 때 자동 생성 (PKCS12, RSA 4096, 별칭 bloodnocturne)
#    tools/android/keystore.properties    자동 생성된 비밀번호 (storePassword/keyPassword/keyAlias/storeFile)
#    ※ 이 두 파일을 잃어버리면 이미 설치된 앱 위에 업데이트 설치가 불가능하다(삭제 후 재설치 → 세이브 소실).
#      반드시 안전한 곳에 백업할 것.
#
#  버전
#    versionName = package.json 의 version (VERSION_NAME 으로 덮어쓰기)
#    versionCode = 마지막 git 커밋 시각(2026-01-01 부터 분 단위) → 커밋마다 증가 (VERSION_CODE 로 덮어쓰기)
#
#  설치/실행 (USB 디버깅 기기)
#    adb install -r dist/BloodNocturne.apk
#    adb shell am start -n com.bloodnocturne.game/.MainActivity
#    adb logcat -s BloodNocturne       # 게임 콘솔 오류 확인
#
#  환경 변수
#    ANDROID_HOME   SDK 위치 (기본 /root/android-sdk)     BUILD_TOOLS  (기본 34.0.0)
#    KEYSTORE       키스토어 경로                          KEYSTORE_PROPS  비밀번호 파일 경로
#    VERSION_NAME / VERSION_CODE
#
#  앱 구조: android/app/src/main/ (AndroidManifest.xml, java/…/MainActivity.java, AssetServer.java, res/, assets/app/)
#    게임 파일(index.html, manifest.webmanifest, sw.js, css/, src/, assets/)은 APK 의 assets/www/ 에 들어가고
#    WebView 가 https://appassets.androidplatform.net/index.html 가상 출처로 불러온다.
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-/root/android-sdk}}"
BT_VER="${BUILD_TOOLS:-34.0.0}"
PLATFORM="android-34"
BT="$SDK/build-tools/$BT_VER"
ANDROID_JAR="$SDK/platforms/$PLATFORM/android.jar"
CMDLINE_URL="https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip"
MIN_SDK=24
TARGET_SDK=34
APP_DIR="$ROOT/android/app/src/main"
OUT="$ROOT/dist"
B="$OUT/apk-build"
APK="$OUT/BloodNocturne.apk"
KS="${KEYSTORE:-$ROOT/tools/android/release.keystore}"
KS_PROPS="${KEYSTORE_PROPS:-$ROOT/tools/android/keystore.properties}"
# APK 에 넣을 웹 게임 파일 (tools/, docs/, node_modules/ 등은 제외)
WEB_FILES=(index.html manifest.webmanifest sw.js css src assets)
# 이미 압축된 형식은 무압축 저장 (빠른 읽기 + openFd 로 길이/Range 지원)
NO_COMPRESS=(png webp jpg jpeg gif avif mp3 ogg oga opus m4a aac mp4 webm woff woff2)

say() { printf '\033[1;31m▶\033[0m %s\n' "$*"; }
die() { printf '\033[1;41m 오류 \033[0m %s\n' "$*" >&2; exit 1; }

MODE="build"
case "${1:-}" in
  "") ;;
  --verify) MODE="build+verify" ;;
  --verify-only) MODE="verify" ;;
  -h|--help) sed -n '2,45p' "$0"; exit 0 ;;
  *) die "알 수 없는 옵션: $1 (--verify, --verify-only, --help)" ;;
esac

run_verify() {
  [[ -f "$APK" ]] || die "$APK 가 없습니다. 먼저 빌드하세요."
  say "헤드리스 부팅 검증 (APK assets/www 를 https://appassets.androidplatform.net 로 에뮬레이션)"
  node "$ROOT/tools/apk/verify_apk.mjs" "$APK"
}
if [[ "$MODE" == "verify" ]]; then run_verify; exit 0; fi

# ─── 1. 도구 확인 · SDK 설치 ─────────────────────────────────────────────────
for t in java javac jar keytool python3 zip unzip curl; do command -v "$t" >/dev/null || die "'$t' 명령이 필요합니다"; done
python3 -c 'import PIL' 2>/dev/null || die "python3 Pillow 가 필요합니다 (pip install pillow)"

ensure_sdk() {
  if [[ -x "$BT/aapt2" && -x "$BT/d8" && -x "$BT/zipalign" && -x "$BT/apksigner" && -f "$BT/core-lambda-stubs.jar" && -f "$ANDROID_JAR" ]]; then return; fi
  say "Android SDK 설치 → $SDK"
  mkdir -p "$SDK/cmdline-tools"
  local sm="$SDK/cmdline-tools/latest/bin/sdkmanager"
  if [[ ! -x "$sm" ]]; then
    local tmp; tmp="$(mktemp -d)"
    curl -fsSL -o "$tmp/clt.zip" "$CMDLINE_URL"
    unzip -q "$tmp/clt.zip" -d "$tmp"
    rm -rf "$SDK/cmdline-tools/latest"
    mv "$tmp/cmdline-tools" "$SDK/cmdline-tools/latest"
    rm -rf "$tmp"
  fi
  mkdir -p "$OUT"
  (yes | "$sm" --sdk_root="$SDK" --licenses >"$OUT/sdkmanager.log" 2>&1) || true
  "$sm" --sdk_root="$SDK" "platform-tools" "build-tools;$BT_VER" "platforms;$PLATFORM" >>"$OUT/sdkmanager.log" 2>&1 \
    || { tail -20 "$OUT/sdkmanager.log"; die "sdkmanager 설치 실패 (로그: $OUT/sdkmanager.log)"; }
  [[ -x "$BT/aapt2" && -f "$ANDROID_JAR" ]] || die "SDK 설치 후에도 build-tools/platform 을 찾을 수 없습니다"
}
ensure_sdk

# ─── 2. 서명 키 (없으면 생성) ────────────────────────────────────────────────
prop() { sed -n "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*//p" "$KS_PROPS" | head -1 | tr -d '\r'; }

ensure_keystore() {
  if [[ -f "$KS" ]]; then
    [[ -f "$KS_PROPS" ]] || die "키스토어($KS)는 있는데 비밀번호 파일($KS_PROPS)이 없습니다"
    return
  fi
  [[ -f "$KS_PROPS" ]] && die "비밀번호 파일은 있는데 키스토어($KS)가 없습니다. 백업에서 복구하세요 (새 키를 만들면 기존 설치본 업데이트 불가)"
  say "릴리스 키스토어 생성 → $KS"
  mkdir -p "$(dirname "$KS")"
  local pw
  pw="$(python3 -c 'import secrets,string;a=string.ascii_letters+string.digits;print("".join(secrets.choice(a) for _ in range(32)))')"
  BN_NEW_PW="$pw" keytool -genkeypair -keystore "$KS" -storetype PKCS12 -alias bloodnocturne \
    -keyalg RSA -keysize 4096 -validity 10000 \
    -dname "CN=Blood Nocturne, OU=Game, O=Blood Nocturne, L=Seoul, C=KR" \
    -storepass:env BN_NEW_PW -keypass:env BN_NEW_PW >/dev/null 2>&1 || die "keytool 키 생성 실패"
  (umask 077; cat >"$KS_PROPS" <<EOF
# 블러드 녹턴 릴리스 서명 정보 — 절대 git 에 올리지 말 것 (.gitignore 등록됨). 키스토어와 함께 백업할 것.
storeFile=$(basename "$KS")
storePassword=$pw
keyAlias=bloodnocturne
keyPassword=$pw
EOF
  )
  chmod 600 "$KS" "$KS_PROPS"
}
ensure_keystore
KS_ALIAS="$(prop keyAlias)"; KS_ALIAS="${KS_ALIAS:-bloodnocturne}"
export BN_KS_PASS BN_KEY_PASS
BN_KS_PASS="$(prop storePassword)"
BN_KEY_PASS="$(prop keyPassword)"; BN_KEY_PASS="${BN_KEY_PASS:-$BN_KS_PASS}"
[[ -n "$BN_KS_PASS" ]] || die "$KS_PROPS 에 storePassword 가 없습니다"

# ─── 3. 버전 ────────────────────────────────────────────────────────────────
VN="${VERSION_NAME:-$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["version"])' "$ROOT/package.json" 2>/dev/null || echo 1.0.0)}"
if [[ -n "${VERSION_CODE:-}" ]]; then
  VC="$VERSION_CODE"
else
  CT="$(git -C "$ROOT" log -1 --format=%ct 2>/dev/null || date +%s)"
  VC=$(( (CT - 1767225600) / 60 ))   # 2026-01-01T00:00Z 부터 분
  (( VC >= 1 )) || VC=1
fi
[[ "$VC" =~ ^[0-9]+$ ]] || die "VERSION_CODE 는 정수여야 합니다: $VC"
say "버전 $VN (code $VC) · build-tools $BT_VER · $PLATFORM · minSdk $MIN_SDK · targetSdk $TARGET_SDK"

# ─── 4. 작업 폴더 초기화 · 웹 게임 파일 복사 ────────────────────────────────
rm -rf "${B:?}"
mkdir -p "$B/assets/www" "$B/res-gen" "$B/compiled" "$B/gen" "$B/classes" "$B/dex"
present=()
for f in "${WEB_FILES[@]}"; do
  if [[ -e "$ROOT/$f" ]]; then present+=("$f")
  elif [[ "$f" == "sw.js" ]]; then :
  else die "웹 게임 파일이 없습니다: $f"; fi
done
say "웹 게임 파일 복사: ${present[*]}"
tar -C "$ROOT" -h \
  --exclude='.*' --exclude='__pycache__' --exclude='*.py' --exclude='*.pyc' \
  --exclude='*.blend' --exclude='*.blend1' --exclude='*.psd' --exclude='*.kra' --exclude='*.xcf' \
  --exclude='*.md' --exclude='*.log' --exclude='Thumbs.db' --exclude='desktop.ini' \
  -cf - "${present[@]}" | tar -C "$B/assets/www" -xf -
cp -R "$APP_DIR/assets/." "$B/assets/"          # app/head_inject.html (앱 전용 조각)
[[ -f "$B/assets/www/index.html" ]] || die "index.html 복사 실패"
WWW_COUNT="$(find "$B/assets/www" -type f | wc -l)"
WWW_SIZE="$(du -sh "$B/assets/www" | cut -f1)"
say "  → 파일 ${WWW_COUNT}개, ${WWW_SIZE}"

# ─── 5. 런처 아이콘 생성 (assets/ui/icon-512.png) ───────────────────────────
say "런처 아이콘 생성"
python3 "$ROOT/tools/apk/make_icons.py" "$ROOT/assets/ui/icon-512.png" "$B/res-gen" >/dev/null

# ─── 6. 리소스 컴파일 · 링크 (aapt2) ─────────────────────────────────────────
say "aapt2 compile/link"
"$BT/aapt2" compile --dir "$APP_DIR/res" -o "$B/compiled/res-main.zip"
"$BT/aapt2" compile --dir "$B/res-gen" -o "$B/compiled/res-icons.zip"
NC_ARGS=(); for e in "${NO_COMPRESS[@]}"; do NC_ARGS+=(-0 "$e"); done
"$BT/aapt2" link -o "$B/base.apk" \
  -I "$ANDROID_JAR" \
  --manifest "$APP_DIR/AndroidManifest.xml" \
  --min-sdk-version "$MIN_SDK" --target-sdk-version "$TARGET_SDK" \
  --version-code "$VC" --version-name "$VN" \
  --java "$B/gen" \
  -A "$B/assets" \
  "${NC_ARGS[@]}" \
  "$B/compiled/res-main.zip" "$B/compiled/res-icons.zip"

# ─── 7. 자바 컴파일 · DEX (javac + d8) ───────────────────────────────────────
say "javac + d8"
find "$APP_DIR/java" "$B/gen" -name '*.java' | sort >"$B/sources.txt"
javac -encoding UTF-8 -source 8 -target 8 -Xlint:-options -nowarn -XDsuppressNotes \
  -bootclasspath "$ANDROID_JAR:$BT/core-lambda-stubs.jar" -classpath "$ANDROID_JAR" \
  -d "$B/classes" @"$B/sources.txt"
jar cf "$B/classes.jar" -C "$B/classes" .
"$BT/d8" --release --min-api "$MIN_SDK" --lib "$ANDROID_JAR" --output "$B/dex" "$B/classes.jar"
[[ -f "$B/dex/classes.dex" ]] || die "d8 가 classes.dex 를 만들지 못했습니다"

# ─── 8. DEX 추가 → zipalign → 서명 ──────────────────────────────────────────
say "zipalign + apksigner (v2+v3)"
cp "$B/base.apk" "$B/unsigned.apk"
(cd "$B/dex" && zip -q -X -9 "$B/unsigned.apk" classes.dex)
"$BT/zipalign" -f -p 4 "$B/unsigned.apk" "$B/aligned.apk"
"$BT/apksigner" sign \
  --ks "$KS" --ks-key-alias "$KS_ALIAS" \
  --ks-pass env:BN_KS_PASS --key-pass env:BN_KEY_PASS \
  --v1-signing-enabled false --v2-signing-enabled true --v3-signing-enabled true \
  --out "$B/signed.apk" "$B/aligned.apk"
mkdir -p "$OUT"
cp "$B/signed.apk" "$APK.tmp" && mv -f "$APK.tmp" "$APK"
rm -f "$B/unsigned.apk" "$B/aligned.apk" "$B/base.apk"

# ─── 9. 검증 ────────────────────────────────────────────────────────────────
say "검증: apksigner verify / zipalign -c / aapt2 dump badging / 내용물 비교"
"$BT/apksigner" verify --verbose --print-certs "$APK" >"$B/apksigner-verify.txt" 2>&1 \
  || { cat "$B/apksigner-verify.txt"; die "apksigner verify 실패"; }
grep -q "Verified using v2 scheme (APK Signature Scheme v2): true" "$B/apksigner-verify.txt" || die "v2 서명 없음"
grep -q "Verified using v3 scheme (APK Signature Scheme v3): true" "$B/apksigner-verify.txt" || die "v3 서명 없음"
"$BT/zipalign" -c -p 4 "$APK" || die "zipalign 검사 실패"
"$BT/aapt2" dump badging "$APK" >"$B/badging.txt" 2>&1 || { cat "$B/badging.txt"; die "aapt2 dump badging 실패"; }
grep -q "package: name='com.bloodnocturne.game' versionCode='$VC' versionName='$VN'" "$B/badging.txt" || die "패키지/버전 정보 불일치"
grep -q "sdkVersion:'$MIN_SDK'" "$B/badging.txt" || die "minSdk 불일치"
grep -q "targetSdkVersion:'$TARGET_SDK'" "$B/badging.txt" || die "targetSdk 불일치"
grep -q "launchable-activity: name='com.bloodnocturne.game.MainActivity'" "$B/badging.txt" || die "런처 액티비티 없음"
# APK 안의 assets/www 목록이 복사한 웹 게임 파일과 정확히 같은지 (aapt2 가 빠뜨린 파일이 없는지)
(cd "$B/assets/www" && find . -type f | sed 's#^\./##' | LC_ALL=C sort) >"$B/expected-files.txt"
unzip -Z1 "$APK" >"$B/apk-all.txt"
sed -n 's#^assets/www/##p' "$B/apk-all.txt" | grep -v '/$' | LC_ALL=C sort >"$B/apk-files.txt"
if ! diff -u "$B/expected-files.txt" "$B/apk-files.txt" >"$B/files.diff"; then
  head -40 "$B/files.diff"; die "APK 의 게임 파일 목록이 원본과 다릅니다 ($B/files.diff)"
fi
for must in index.html src/main.js css/style.css assets/ui/icon-512.png; do
  grep -qx "$must" "$B/apk-files.txt" || die "APK 에 $must 가 없습니다"
done
for must in assets/app/head_inject.html classes.dex AndroidManifest.xml resources.arsc; do
  grep -qx "$must" "$B/apk-all.txt" || die "APK 에 $must 가 없습니다"
done

SIZE_B="$(stat -c %s "$APK")"
SIZE_H="$(python3 -c "print(f'{$SIZE_B/1048576:.1f} MB')")"
SHA="$(sha256sum "$APK" | cut -d' ' -f1)"
CERT="$(sed -n 's/^Signer #1 certificate SHA-256 digest: //p' "$B/apksigner-verify.txt" | head -1)"
echo
say "완료: $APK"
echo "    크기        $SIZE_H ($SIZE_B bytes)"
echo "    패키지      com.bloodnocturne.game  $VN (versionCode $VC)"
echo "    게임 파일   ${WWW_COUNT}개 (${WWW_SIZE}, 압축 전)"
echo "    SHA-256     $SHA"
echo "    서명 인증서 SHA-256  $CERT"
printf '%s\n' "$APK $SIZE_B $SHA" >"$OUT/BloodNocturne.apk.sha256.txt"

if [[ "$MODE" == "build+verify" ]]; then run_verify; fi
