#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
#  블러드 녹턴 — 안드로이드 APK 빌드 (Gradle 없이: aapt2 + javac + d8 + zipalign + apksigner)
# ══════════════════════════════════════════════════════════════════════════════
#
#  사용법 (먼저 웹 배포 빌드: node tools/deploy/build_web.mjs → dist/web)
#    tools/apk/build_apk.sh             빌드 → dist/BloodNocturne.apk (+ 서명/정렬/권한/크기/내용물 검증)
#    tools/apk/build_apk.sh --verify    빌드 후 헤드리스 부팅 검증(tools/apk/verify_apk.mjs)까지 실행
#    tools/apk/build_apk.sh --verify-only   이미 만든 APK 로 검증만
#    tools/apk/build_apk.sh --check-key     서명 키 점검만 (빌드·서명 없음): 키스토어·비밀번호 파일이 있고, 인증서가
#                                           tools/apk/release_cert.sha256 에 적힌 배포 인증서와 같은지
#    tools/apk/build_apk.sh --new-key       키스토어·비밀번호 파일이 둘 다 없을 때만 새 릴리스 키를 만든다 (처음 배포할 때만!
#                                           배포 인증서가 적혀 있으면 거부 — 새 키 APK 는 설치된 앱을 업데이트하지 못한다)
#    옵션은 함께 쓸 수 있다 (예: --new-key --verify)
#
#  필요한 것: bash, curl, unzip, zip, python3(+Pillow), JDK 17+ (java/javac/jar/keytool), node(--verify 시)
#
#  APK 에 들어가는 웹 파일 = dist/web (tools/deploy/build_web.mjs 결과: 번들·lo/ 변형·글꼴) − sw.js − downloads/ − _redirects
#    (platform §9.4-4, MASTER_PLAN §1.20). tools/apk/pack_web.py 가 꾸린다.
#  크기 예산 95 MB (채색 그림·소리 포함, MASTER_PLAN §1.20 — 2026-10-08 75→95, GitHub 파일 한도 100 MB 아래). 그림 단계는 소리를 뺀 크기로 70 MB 기준: 넘으면 휴대폰 밀도 단계로 —
#    lo (bg/cg/portraits 원본 대신 assets/lo 사본) → lo+td (채색 아틀라스 0.75배). 효과음 샘플은 늘 싣고, 녹음 음악은 95 MB 안에서
#    우선순위대로 (pack_web.py MUSIC_PRIORITY; 빠진 곡은 앱에서 합성 음원). 서명한 APK 가 예산을 넘으면 빌드 실패.
#  계정 API: 앱 안의 /api/* 는 AssetServer 프록시가 tools/apk/api_origin.txt 의 사이트로 보낸다 (docs/ACCOUNTS.md §1).
#  Android SDK 가 없으면 $ANDROID_HOME(기본 /root/android-sdk)에 자동 설치한다:
#    commandlinetools → sdkmanager → platform-tools, build-tools;34.0.0, platforms;android-34 (라이선스 자동 동의)
#
#  결과물
#    dist/BloodNocturne.apk           서명(v2+v3)·zipalign 된 릴리스 APK (dist/ 는 git 무시)
#    dist/apk-build/                  중간 산출물 (매 빌드마다 새로 만든다)
#
#  서명 키 (git 에 올리지 않음 — .gitignore 에 등록됨). 백업·복구·분실 시 대처: docs/RELEASE.md
#    tools/android/release.keystore       릴리스 키스토어 (PKCS12, RSA 4096, 별칭 bloodnocturne)
#    tools/android/keystore.properties    비밀번호 파일 (storePassword/keyPassword/keyAlias/storeFile)
#    tools/apk/release_cert.sha256        배포 인증서 SHA-256 지문 (공개 값, git 에 올린다)
#    · 두 파일이 없으면 빌드는 실패한다 (예전처럼 조용히 새 키를 만들지 않는다). 백업에서 복구하거나,
#      정말 처음 배포하는 경우에만 --new-key 로 만든다 (그때 release_cert.sha256 이 없으면 새 지문을 적는다).
#    · 키스토어 인증서(서명 전)와 서명한 APK 인증서(서명 후)가 release_cert.sha256 과 다르면 빌드 실패.
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
#    WEB_DIR        웹 배포 빌드 폴더 (기본 dist/web)
#    APK_BUDGET_MB  APK 크기 예산 (기본 95)                APK_ASSETS  auto(기본) | full | lo | lo+td (단계 강제)
#    APK_IMAGE_BUDGET_MB  그림 단계 기준 (기본 70, 소리 제외)  APK_MUSIC  auto(기본) | all | none (녹음 음악)
#    API_ORIGIN     계정 서버 주소 (기본: tools/apk/api_origin.txt)
#
#  앱 구조: android/app/src/main/ (AndroidManifest.xml, java/…/MainActivity.java, AssetServer.java, ApiProxy.java, WebViewCheck.java, res/, assets/app/)
#    게임 파일은 APK 의 assets/www/ 에 들어가고 WebView 가 https://appassets.androidplatform.net/index.html 가상 출처로 불러온다.
#    assets/app/head_inject.html (앱 전용 조각) · assets/app/apk.json (계정 서버 주소, 에셋 단계 — pack_web.py 가 쓴다)
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
# 배포 인증서 지문 (공개 값). RELEASE_CERT_FILE 로 바꿀 수 있다
CERT_FILE="${RELEASE_CERT_FILE:-$ROOT/tools/apk/release_cert.sha256}"
# APK 에 넣을 웹 게임 파일: 웹 배포 빌드 결과 (sw.js · downloads/ · _redirects 는 pack_web.py 가 뺀다)
WEB_DIR="${WEB_DIR:-$ROOT/dist/web}"
BUDGET_MB="${APK_BUDGET_MB:-95}"
IMAGE_BUDGET_MB="${APK_IMAGE_BUDGET_MB:-70}"
ASSET_STAGE="${APK_ASSETS:-auto}"
MUSIC_MODE="${APK_MUSIC:-auto}"
# 이미 압축된 형식은 무압축 저장 (빠른 읽기 + openFd 로 길이/Range 지원) — pack_web.py 의 NO_COMPRESS 와 같게
NO_COMPRESS=(png webp jpg jpeg gif avif mp3 ogg oga opus m4a aac mp4 webm woff woff2)
# 허용 권한 (platform WP-9 acceptance 1)
ALLOWED_PERMS=("android.permission.INTERNET" "android.permission.VIBRATE")

say() { printf '\033[1;31m▶\033[0m %s\n' "$*"; }
die() { printf '\033[1;41m 오류 \033[0m %s\n' "$*" >&2; exit 1; }

MODE="build"
NEW_KEY=0
for arg in "$@"; do
  case "$arg" in
    --verify) MODE="build+verify" ;;
    --verify-only) MODE="verify" ;;
    --check-key) MODE="check-key" ;;
    --new-key|--new-release-key) NEW_KEY=1 ;;
    -h|--help) sed -n '2,/^set -euo/p' "$0" | sed '$d'; exit 0 ;;
    *) die "알 수 없는 옵션: $arg (--verify, --verify-only, --check-key, --new-key, --help)" ;;
  esac
done

run_verify() {
  [[ -f "$APK" ]] || die "$APK 가 없습니다. 먼저 빌드하세요."
  say "헤드리스 부팅 검증 (APK assets/www 를 https://appassets.androidplatform.net 로 에뮬레이션)"
  node "$ROOT/tools/apk/verify_apk.mjs" "$APK"
}
if [[ "$MODE" == "verify" ]]; then run_verify; exit 0; fi

# ─── 1. 도구 확인 · SDK 설치 ─────────────────────────────────────────────────
if [[ "$MODE" == "check-key" ]]; then
  command -v keytool >/dev/null || die "'keytool' 명령이 필요합니다"
else
  for t in java javac jar keytool python3 zip unzip curl; do command -v "$t" >/dev/null || die "'$t' 명령이 필요합니다"; done
  python3 -c 'import PIL' 2>/dev/null || die "python3 Pillow 가 필요합니다 (pip install pillow)"
fi

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
[[ "$MODE" == "check-key" ]] || ensure_sdk

# ─── 2. 서명 키 (복구된 키만 쓴다. 새 키는 --new-key 일 때만) ──────────────────
prop() { sed -n "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*//p" "$KS_PROPS" | head -1 | tr -d '\r'; }
# 인증서 지문 정규화: 소문자 16진수 64자 (콜론·공백 제거)
norm_fp() { tr -d ': \t\r' | tr 'A-F' 'a-f'; }
# 배포 인증서 지문 (주석·빈 줄 제외 첫 줄) — 없으면 빈 값
expected_cert() { [[ -f "$CERT_FILE" ]] && grep -v '^[[:space:]]*#' "$CERT_FILE" | grep -m1 -E '[0-9A-Fa-f]' | norm_fp || true; }

ensure_keystore() {
  if [[ -f "$KS" ]]; then
    [[ -f "$KS_PROPS" ]] || die "키스토어($KS)는 있는데 비밀번호 파일($KS_PROPS)이 없습니다. 백업에서 복구하세요 (docs/RELEASE.md)"
    if (( NEW_KEY )); then die "--new-key 인데 키스토어($KS)가 이미 있습니다. 기존 키를 덮어쓰지 않습니다"; fi
    return 0
  fi
  [[ -f "$KS_PROPS" ]] && die "비밀번호 파일은 있는데 키스토어($KS)가 없습니다. 백업에서 복구하세요 (새 키를 만들면 기존 설치본 업데이트 불가, docs/RELEASE.md)"
  if (( ! NEW_KEY )); then
    die "릴리스 키스토어가 없습니다: ${KS#$ROOT/} · ${KS_PROPS#$ROOT/}
       새 키를 만들지 않습니다 — 새 키로 서명한 APK 는 이미 설치된 앱을 업데이트하지 못합니다(삭제·재설치 → 기기 세이브 소실).
       백업(오프라인 사본·비밀번호 관리자)에서 두 파일을 제자리에 복구한 뒤 다시 실행하세요: docs/RELEASE.md '키 복구'.
       정말 처음 배포하는 경우에만: tools/apk/build_apk.sh --new-key"
  fi
  local want; want="$(expected_cert)"
  [[ -z "$want" ]] || die "--new-key 거부: 배포 인증서가 이미 적혀 있습니다 (${CERT_FILE#$ROOT/}).
       새 키 APK 는 설치된 앱을 업데이트하지 못합니다. 키를 잃어 서명 키를 바꾸기로 했다면 docs/RELEASE.md '키를 잃었을 때'를 따라
       사용자 안내 후 ${CERT_FILE#$ROOT/} 를 지우고 다시 실행하세요"
  say "릴리스 키스토어 생성 (--new-key) → $KS"
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

# 키스토어 인증서 지문 (비밀번호는 환경 변수로만 넘기고, 출력에서는 SHA256 줄만 읽는다)
KS_CERT="$(keytool -list -v -keystore "$KS" -alias "$KS_ALIAS" -storepass:env BN_KS_PASS 2>/dev/null \
  | sed -n 's/^[[:space:]]*SHA256:[[:space:]]*//p' | head -1 | norm_fp || true)"
[[ "$KS_CERT" =~ ^[0-9a-f]{64}$ ]] || die "키스토어에서 별칭 '$KS_ALIAS' 의 인증서를 읽지 못했습니다 (비밀번호·별칭 확인: ${KS_PROPS#$ROOT/})"
WANT_CERT="$(expected_cert)"
if [[ -n "$WANT_CERT" ]]; then
  [[ "$WANT_CERT" =~ ^[0-9a-f]{64}$ ]] || die "${CERT_FILE#$ROOT/} 의 지문 형식이 틀렸습니다 (16진수 64자)"
  [[ "$KS_CERT" == "$WANT_CERT" ]] || die "키스토어 인증서가 배포 인증서와 다릅니다 — 이 키로 서명한 APK 는 설치된 앱을 업데이트하지 못합니다.
       키스토어 ${KS_CERT:0:16}… ≠ 배포 ${WANT_CERT:0:16}… (${CERT_FILE#$ROOT/}). 백업에서 원래 키를 복구하세요 (docs/RELEASE.md)"
  say "서명 키 확인: 인증서 SHA-256 ${KS_CERT:0:16}… = 배포 인증서"
else
  printf '\033[1;33m  경고\033[0m 배포 인증서 지문 파일이 없습니다 (%s) — 이번 서명 인증서를 적습니다. git 에 올리세요\n' "${CERT_FILE#$ROOT/}"
fi
if [[ "$MODE" == "check-key" ]]; then
  say "서명 키 점검 끝 (빌드·서명 없음): ${KS#$ROOT/} · 별칭 $KS_ALIAS · 인증서 SHA-256 $KS_CERT"
  exit 0
fi

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

# ─── 4. 작업 폴더 초기화 · 웹 배포 빌드(dist/web) 꾸리기 ────────────────────
[[ -f "$WEB_DIR/index.html" && -f "$WEB_DIR/build-info.js" ]] \
  || die "웹 배포 빌드가 없습니다: $WEB_DIR (먼저 node tools/deploy/build_web.mjs)"
# 소스가 웹 빌드보다 새로우면 알린다 (APK 가 낡은 게임을 싣지 않게)
NEWER="$(find "$ROOT/src" "$ROOT/css" "$ROOT/assets" "$ROOT/index.html" -type f -newer "$WEB_DIR/build-info.js" \
  ! -path '*/.*' ! -name '*.md' ! -name '*.py' 2>/dev/null | head -3 || true)"
if [[ -n "$NEWER" ]]; then
  printf '\033[1;33m  경고\033[0m 웹 빌드보다 새로운 소스가 있습니다 (예: %s) — 최신 게임을 넣으려면 node tools/deploy/build_web.mjs 를 다시 실행하세요\n' \
    "$(echo "$NEWER" | head -1 | sed "s#^$ROOT/##")"
fi
rm -rf "${B:?}"
mkdir -p "$B/assets" "$B/res-gen" "$B/compiled" "$B/gen" "$B/classes" "$B/dex"
cp -R "$APP_DIR/assets/." "$B/assets/"          # app/head_inject.html (앱 전용 조각)
say "웹 파일 꾸리기: $(sed -n 's/.*"version":"\([^"]*\)".*/\1/p' "$WEB_DIR/build-info.js" | head -1) ← ${WEB_DIR#$ROOT/} (예산 ${BUDGET_MB} MB, 단계 ${ASSET_STAGE})"
PACK_ARGS=(--web "$WEB_DIR" --out "$B/assets" --budget-mb "$BUDGET_MB" --image-budget-mb "$IMAGE_BUDGET_MB" --assets "$ASSET_STAGE" --music "$MUSIC_MODE"
  --origin-file "$ROOT/tools/apk/api_origin.txt" --cloud-js "$ROOT/src/core/cloud.js" --report "$B/pack_report.json")
[[ -n "${API_ORIGIN:-}" ]] && PACK_ARGS+=(--origin "$API_ORIGIN")
python3 "$ROOT/tools/apk/pack_web.py" "${PACK_ARGS[@]}" || die "웹 파일 꾸리기 실패 (tools/apk/pack_web.py)"
[[ -f "$B/assets/www/index.html" && -f "$B/assets/app/apk.json" ]] || die "index.html / apk.json 이 없습니다"
STAGE_USED="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["assets"])' "$B/assets/app/apk.json")"
API_USED="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["api"]["origin"])' "$B/assets/app/apk.json")"
WWW_COUNT="$(find "$B/assets/www" -type f | wc -l)"
WWW_SIZE="$(du -sh "$B/assets/www" | cut -f1)"
say "  → 파일 ${WWW_COUNT}개, ${WWW_SIZE} (에셋 단계 ${STAGE_USED})"

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
rm -f "$B/unsigned.apk" "$B/aligned.apk" "$B/base.apk"
# 검사는 작업 폴더의 서명본(CAND)에 한다. 모두 통과해야 dist/BloodNocturne.apk 로 바꿔 놓는다
# (예산 초과·검사 실패 APK 가 그 자리에 남으면 build_web.mjs 가 그것을 downloads/ 로 내보낸다)
CAND="$B/signed.apk"

# ─── 9. 검증 ────────────────────────────────────────────────────────────────
say "검증: apksigner verify / zipalign -c / aapt2 dump badging / 내용물 비교"
"$BT/apksigner" verify --verbose --print-certs "$CAND" >"$B/apksigner-verify.txt" 2>&1 \
  || { cat "$B/apksigner-verify.txt"; die "apksigner verify 실패"; }
grep -q "Verified using v2 scheme (APK Signature Scheme v2): true" "$B/apksigner-verify.txt" || die "v2 서명 없음"
grep -q "Verified using v3 scheme (APK Signature Scheme v3): true" "$B/apksigner-verify.txt" || die "v3 서명 없음"
"$BT/zipalign" -c -p 4 "$CAND" || die "zipalign 검사 실패"
"$BT/aapt2" dump badging "$CAND" >"$B/badging.txt" 2>&1 || { cat "$B/badging.txt"; die "aapt2 dump badging 실패"; }
grep -q "package: name='com.bloodnocturne.game' versionCode='$VC' versionName='$VN'" "$B/badging.txt" || die "패키지/버전 정보 불일치"
grep -q "sdkVersion:'$MIN_SDK'" "$B/badging.txt" || die "minSdk 불일치"
grep -q "targetSdkVersion:'$TARGET_SDK'" "$B/badging.txt" || die "targetSdk 불일치"
grep -q "launchable-activity: name='com.bloodnocturne.game.MainActivity'" "$B/badging.txt" || die "런처 액티비티 없음"
# 권한: INTERNET, VIBRATE 만 (platform WP-9 acceptance 1)
sed -n "s/^uses-permission: name='\([^']*\)'.*/\1/p" "$B/badging.txt" | LC_ALL=C sort -u >"$B/perms.txt"
while read -r perm; do
  ok=0; for a in "${ALLOWED_PERMS[@]}"; do [[ "$perm" == "$a" ]] && ok=1; done
  (( ok )) || die "허용하지 않은 권한이 들어 있습니다: $perm"
done <"$B/perms.txt"
for a in "${ALLOWED_PERMS[@]}"; do grep -qx "$a" "$B/perms.txt" || die "권한이 빠졌습니다: $a"; done
# APK 안의 assets/www 목록이 복사한 웹 게임 파일과 정확히 같은지 (aapt2 가 빠뜨린 파일이 없는지)
(cd "$B/assets/www" && find . -type f | sed 's#^\./##' | LC_ALL=C sort) >"$B/expected-files.txt"
unzip -Z1 "$CAND" >"$B/apk-all.txt"
sed -n 's#^assets/www/##p' "$B/apk-all.txt" | grep -v '/$' | LC_ALL=C sort >"$B/apk-files.txt"
if ! diff -u "$B/expected-files.txt" "$B/apk-files.txt" >"$B/files.diff"; then
  head -40 "$B/files.diff"; die "APK 의 게임 파일 목록이 원본과 다릅니다 ($B/files.diff)"
fi
for must in index.html build-info.js src/boot-gate.js css/style.css assets/ui/icon-512.png; do
  grep -qx "$must" "$B/apk-files.txt" || die "APK 에 $must 가 없습니다"
done
for must in sw.js _redirects; do
  grep -qx "$must" "$B/apk-files.txt" && die "APK 에 $must 가 들어 있습니다 (앱에서는 쓰지 않음)"
done
grep -q '^downloads/' "$B/apk-files.txt" && die "APK 에 downloads/ 가 들어 있습니다"
for must in assets/app/head_inject.html assets/app/apk.json classes.dex AndroidManifest.xml resources.arsc; do
  grep -qx "$must" "$B/apk-all.txt" || die "APK 에 $must 가 없습니다"
done

# 서명 인증서 = 키스토어 인증서 = 배포 인증서 (다르면 설치된 앱을 업데이트하지 못하는 APK 다)
CERT="$(sed -n 's/^Signer #1 certificate SHA-256 digest: //p' "$B/apksigner-verify.txt" | head -1 | norm_fp)"
grep -q '^Signer #2' "$B/apksigner-verify.txt" && die "서명자가 둘 이상입니다"
[[ "$CERT" == "$KS_CERT" ]] || die "APK 서명 인증서(${CERT:0:16}…)가 키스토어 인증서(${KS_CERT:0:16}…)와 다릅니다"
if [[ -n "$WANT_CERT" ]]; then
  [[ "$CERT" == "$WANT_CERT" ]] || die "APK 서명 인증서가 배포 인증서(${CERT_FILE#$ROOT/})와 다릅니다 — ${APK#$ROOT/} 는 바꾸지 않았습니다"
fi

SIZE_B="$(stat -c %s "$CAND")"
SIZE_H="$(python3 -c "print(f'{$SIZE_B/1048576:.1f} MB')")"
BUDGET_B="$(python3 -c "print(int(float('$BUDGET_MB')*1048576))")"
(( SIZE_B <= BUDGET_B )) || die "APK 가 크기 예산을 넘습니다: $SIZE_H > ${BUDGET_MB} MB (에셋 단계 ${STAGE_USED}; APK_ASSETS=lo+td 로 더 줄일 수 있습니다) — ${APK#$ROOT/} 는 바꾸지 않았습니다"
mkdir -p "$OUT"
cp "$CAND" "$APK.tmp" && mv -f "$APK.tmp" "$APK"
SHA="$(sha256sum "$APK" | cut -d' ' -f1)"
echo
say "완료: $APK"
echo "    크기        $SIZE_H ($SIZE_B bytes, 예산 ${BUDGET_MB} MB)"
echo "    패키지      com.bloodnocturne.game  $VN (versionCode $VC)"
echo "    게임 파일   ${WWW_COUNT}개 (${WWW_SIZE}, 압축 전) · 에셋 단계 ${STAGE_USED}"
echo "    계정 API    /api/* → ${API_USED}"
echo "    SHA-256     $SHA"
echo "    서명 인증서 SHA-256  $CERT"
printf '%s\n' "$APK $SIZE_B $SHA" >"$OUT/BloodNocturne.apk.sha256.txt"
if [[ -z "$WANT_CERT" ]]; then
  (umask 022; {
    echo "# 블러드 녹턴 릴리스 서명 인증서 SHA-256 지문 (공개 값 — 비밀이 아니다). build_apk.sh 가 이 값과 대조한다 (docs/RELEASE.md)"
    echo "# $(date -u +%Y-%m-%d) versionName $VN versionCode $VC 에서 기록"
    echo "$CERT"
  } >"$CERT_FILE")
  say "배포 인증서 지문을 적었습니다: ${CERT_FILE#$ROOT/} (git 에 올리세요)"
fi

if [[ "$MODE" == "build+verify" ]]; then run_verify; fi
