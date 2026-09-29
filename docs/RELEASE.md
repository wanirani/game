# 출시 · 배포 절차 (블러드 녹턴)

웹(Netlify)과 안드로이드 APK 를 만들어 내보내는 순서, 그리고 **APK 서명 키**를 지키는 방법을 적는다.
자세한 빌드 옵션은 `tools/deploy/README.md`(웹)와 `tools/apk/build_apk.sh --help`(APK), 계정 서버는 `docs/ACCOUNTS.md` 가 기준이다.
이 문서에는 비밀 값(비밀번호·pepper·토큰)을 **절대** 적지 않는다 — 위치와 절차만 적는다.

## 1. 산출물

| 무엇 | 위치 | 만드는 명령 |
|---|---|---|
| 웹 게시 폴더 | `dist/web` | `node tools/deploy/build_web.mjs` |
| Netlify 업로드 묶음 | `dist/deploy` (`web/` + 계정 API 함수 + 고정된 `package.json`·`package-lock.json` + `netlify.toml`) | 위와 같은 명령 |
| 안드로이드 APK | `dist/BloodNocturne.apk` (+ `dist/BloodNocturne.apk.sha256.txt`) | `tools/apk/build_apk.sh --verify` |
| 배포 인증서 지문 (공개) | `tools/apk/release_cert.sha256` | 첫 배포 때 `build_apk.sh` 가 적는다 — git 에 올린다 |

`dist/` 는 git 에 올리지 않는다.

## 2. 배포 전 한 번: 계정 서버 환경 변수

1. **`AUTH_PEPPER` 를 첫 운영 배포 전에 넣는다.** Netlify 사이트 설정 → Environment variables → 범위 **Functions**, 32자 이상 무작위 값.
   만드는 법: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` — 출력은 곧바로 Netlify 설정과 비밀번호 관리자에만 붙여 넣고, 저장소·문서·채팅·이슈에는 적지 않는다.
2. 넣거나 바꾼 뒤에는 **다시 배포**해야 함수에 적용된다.
3. **한 번 넣은 뒤에는 바꾸거나 지우지 않는다** — 그 뒤로 해시된 계정이 로그인할 수 없게 된다(`docs/ACCOUNTS.md` §6). 값은 비밀번호 관리자에 함께 보관한다(운영 도구 `tools/accounts/admin.mjs` 도 같은 값을 쓴다).
4. 확인: 배포 뒤 Netlify 함수 로그에 `[api] 경고: AUTH_PEPPER 환경 변수가 없습니다` 가 **없어야** 한다. 있으면 값이 빠졌거나 범위가 Functions 가 아니다.

## 3. 웹 배포

1. `node tools/deploy/build_web.mjs` — 글꼴·맵·공개 금지 검사가 실패하면 멈춘다. 경고를 읽는다.
2. `dist/deploy/` 를 올린다 (`tools/deploy/README.md` §3). **저장소 루트는 절대 올리지 않는다.**
3. `node tools/deploy/smoke_deployed.mjs https://<사이트>` — 모두 ✓.

## 4. APK 출시

순서가 중요하다 (APK 는 `dist/web` 을 그대로 싣고, 웹 빌드는 **같은 웹 빌드를 실은 APK 만** `downloads/` 에 올린다):

1. `node tools/deploy/build_web.mjs` → `dist/web`
2. `tools/apk/build_apk.sh --check-key` — 서명 키가 제자리에 있고 배포 인증서와 같은지 (빌드·서명 없이 몇 초)
3. `tools/apk/build_apk.sh --verify` → `dist/BloodNocturne.apk` (서명 전·후 인증서를 `release_cert.sha256` 과 대조하고, 헤드리스 부팅·CSP 검증까지)
4. `node tools/deploy/build_web.mjs` 다시 → `dist/web/downloads/BloodNocturne-<버전>-<versionCode>.apk` + `latest.json`
   (게임 파일이 같으면 buildHash·버전 표시가 그대로라 APK 안의 웹 파일 = dist/web). 경고에 "APK 가 지금 웹 빌드와 다릅니다" 가 있으면 3 부터 다시.
5. §3 의 2–3 으로 올린다. 설치된 앱은 `downloads/latest.json` 의 `versionCode` 로 새 버전을 알린다.

`versionCode` 는 마지막 커밋 시각으로 정해지므로 **커밋한 뒤** 빌드한다(같은 커밋이면 같은 번호 → 업데이트로 보이지 않는다).

## 5. 서명 키

APK 는 한 번 배포한 키로만 업데이트할 수 있다. 다른 키로 서명한 APK 는 설치된 앱 위에 설치되지 않는다.

| 파일 | 위치 (이 컴퓨터) | git |
|---|---|---|
| 릴리스 키스토어 (PKCS12, RSA 4096, 별칭 `bloodnocturne`) | `tools/android/release.keystore` | **올리지 않는다** (.gitignore) |
| 비밀번호 파일 (`storeFile`·`storePassword`·`keyAlias`·`keyPassword`) | `tools/android/keystore.properties` | **올리지 않는다** (.gitignore) |
| 배포 인증서 SHA-256 지문 | `tools/apk/release_cert.sha256` | 올린다 (공개 값) |

- 다른 곳에 두었다면 `KEYSTORE=<경로> KEYSTORE_PROPS=<경로> tools/apk/build_apk.sh …` 로 알려 준다.
- 두 파일은 `chmod 600` 으로 둔다. 채팅·이슈·메일·클라우드 드라이브(암호화하지 않은)에 올리지 않는다.
- `build_apk.sh` 는 **두 파일이 없으면 실패한다** (예전처럼 조용히 새 키를 만들지 않는다). 새 키는 `--new-key` 를 줄 때만, 그리고 `release_cert.sha256` 이 없을 때만(= 한 번도 배포하지 않았을 때) 만든다.
- **지문 확인**: `release_cert.sha256` 은 첫 배포 APK 의 서명 인증서 SHA-256 이다. `build_apk.sh` 는 서명 전에 키스토어 인증서를, 서명 뒤에 APK 인증서를 이 값과 비교해 다르면 멈춘다. 손으로 볼 때:
  - 키스토어: `tools/apk/build_apk.sh --check-key` (비밀번호는 출력하지 않고 지문만 보여 준다)
  - 배포된 APK: `apksigner verify --print-certs <APK>` 의 `Signer #1 certificate SHA-256 digest`

### 5.1 백업 (첫 배포 직후, 그리고 키를 옮길 때마다)

1. 두 파일(`release.keystore`, `keystore.properties`)을 **오프라인 사본 두 개**로 만든다 — 예: 암호화한 USB 저장 장치 두 개를 서로 다른 곳에 보관. 한쪽이 망가지거나 잃어버려도 다른 쪽이 남게 한다.
2. **비밀번호 관리자**에 `keystore.properties` 의 내용(비밀번호·별칭)과 키스토어 파일(첨부 가능하면)을 함께 넣는다. 항목 이름에 인증서 지문 앞 16자리를 적어 두면 어느 키인지 헷갈리지 않는다.
3. 백업이 쓸 만한지 확인: 사본을 임시 폴더에 풀고
   `KEYSTORE=<사본>/release.keystore KEYSTORE_PROPS=<사본>/keystore.properties tools/apk/build_apk.sh --check-key`
   → "서명 키 확인: … = 배포 인증서" 가 나와야 한다. 확인한 뒤 임시 폴더를 지운다.
4. 작업 컴퓨터·컨테이너를 정리하기 전에는 반드시 백업이 있는지 먼저 본다 (`tools/android/` 는 git 에 없어서 작업 폴더를 지우면 함께 사라진다).

### 5.2 키 복구 (새 컴퓨터·새 클론)

1. 백업에서 두 파일을 `tools/android/release.keystore`, `tools/android/keystore.properties` 로 복사한다.
2. `chmod 600 tools/android/release.keystore tools/android/keystore.properties`
3. `tools/apk/build_apk.sh --check-key` → 배포 인증서와 같다고 나오면 끝. 다르면 다른 키다 — 다른 백업을 찾는다. **절대 `--new-key` 로 대신하지 않는다.**

### 5.3 키를 잃었을 때

백업이 모두 없으면 같은 앱의 업데이트는 더 이상 만들 수 없다. 새 키로 서명한 APK 는 설치된 앱 위에 설치되지 않으므로:

- 사용자는 **기존 앱을 지우고 새로 설치**해야 한다. 앱을 지우면 기기 안의 세이브(앱 WebView 저장소)도 함께 지워진다.
- 그래서 새 APK 를 내기 **전에** 사용자에게 알린다: 게임 안 **계정 저장(클라우드)** 에 로그인해 슬롯을 올리거나 **저장 코드**를 적어 두라고. 새 앱에서 로그인하거나 저장 코드를 넣으면 이어 할 수 있다.
- 절차: 공지 → `tools/apk/release_cert.sha256` 을 지우고 `tools/apk/build_apk.sh --new-key --verify` → 새 지문이 `release_cert.sha256` 에 적힌다 → 새 키를 §5.1 대로 **즉시 백업** → 커밋 → §4 의 4–5.
- 웹 게임(Netlify)은 서명 키와 상관없이 그대로 동작한다.

## 6. 확인 명령 모음

```
node tools/deploy/build_web.mjs                 # 웹 빌드 (+ 배포 묶음)
node tools/deploy/build_web.mjs --selftest-deny # 공개 금지 검사 자체 시험
node tools/deploy/test_sw.mjs                   # 서비스 워커
node tools/qa/platform_load.mjs --dist          # 게시 폴더 부팅·크기
tools/apk/build_apk.sh --check-key              # 서명 키 = 배포 인증서 (빌드 없음)
tools/apk/build_apk.sh --verify                 # APK 빌드 + 검증
npm run test:api && npm run test:client         # 계정 서버
node tools/deploy/smoke_deployed.mjs https://<사이트>   # 배포 뒤
```
