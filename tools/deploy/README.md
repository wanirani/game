# 배포 도구 (tools/deploy) — owner: DELIVERY-WEB

웹(Netlify)·claude.ai 아티팩트 배포물을 **허용 목록**으로 만들고 검사하는 도구다. 여기 있는 도구는 배포 호출을 하지 않는다
(실제 배포는 W6 DELIVER-WEB / DELIVER-ARTIFACT 가 한다). 근거: platform.md §9.1–9.3·§6.7, MASTER_PLAN §1.20, docs/ACCOUNTS.md.

| 파일 | 하는 일 |
|---|---|
| `build_web.mjs` | `dist/web` (게시 폴더) + `dist/deploy` (Netlify 업로드 묶음) 만들기, 공개 금지 검사, 번들, 서비스 워커 주입, 크기 보고 |
| `serve_dist.mjs` | `dist/web` 로컬 서버: netlify.toml 헤더·`_redirects`·brotli/gzip·ETag (Netlify 흉내) |
| `smoke_deployed.mjs` | 배포된 사이트(또는 `--local`) 확인: 헤더, 빌드 일치, 공개 금지 파일 404, APK, API, 워커·설치 가능, 페이지 오류 0 |
| `test_sw.mjs` | 서비스 워커 수명 주기 시험: 설치·미리 받기, /api 미캐시, 서버를 내린 진짜 오프라인(타이틀·마을·s01), 옛 워커 아래 새 빌드 페이지가 새 리그·fonts.json 을 받음, 새 빌드 대기·적용·옛 캐시 삭제·바뀐 그림만 무효화 |
| `build_artifact.mjs` | `dist/web` → `dist/artifact` (claude.ai 아티팩트: 조각 ≤ 8, 그림 팩 ≤ 40, 한도 검사, 올리기 계획) |
| `lib/bundle.mjs` · `lib/scope.mjs` · `lib/minify.mjs` · `lib/acorn.mjs` | 의존성 없는 ES 모듈 번들러 (Node 내장 acorn 사용) |
| `../assets/make_variants.py` | `assets/lo/` 저사양 그림 (bg·cg·portraits 60 %, webp q72) — 증분·멱등 |

## 1. 웹 빌드

```bash
python3 tools/assets/make_variants.py          # 그림이 바뀌었으면 (build_web 도 낡았으면 알아서 부른다)
node tools/deploy/build_web.mjs                # → dist/web, dist/deploy, dist/build_web_report.json
node tools/deploy/build_web.mjs --selftest-deny # 공개 금지 검사가 빌드를 막는지 자체 시험 (exit 0 = 통과)
```

- **허용 목록만 복사**: `index.html manifest.webmanifest sw.js robots.txt css/ src/boot-gate.js assets/ (lo/·fonts/ 포함) downloads/`.
  `tools/ docs/ android/ netlify/ node_modules/ dist/ .git/`, `*.keystore *.jks *.p12 *.properties .env*` 등이 들어가면 **빌드 실패 + 출력 폴더 삭제**.
  서명 키(`tools/android/release.keystore`, `keystore.properties`)는 절대 올라가지 않는다.
- **번들**: `src/main.js` 에서 **정적으로** 닿는 모듈(타이틀·부팅, 20여 개) → `src/bundle/<내용 해시>/app.js` (첫 화면 조각). 나머지(장면 등록부·퀘스트·동료,
  채색 보스·적 그림, 보스 로직 등 `import()` 로 부르는 모듈)는 `lazy-1…7.js` 조각 (R1-REQ-229). 첫 방문 요청은 부팅 관문 + app.js 2개.
  lazy 진입점이 다른 lazy 묶음 안에서 정적으로도 쓰이면 그 모듈은 '소유 묶음 집합'이 같은 것끼리 공유 조각에 들어가고(조각끼리 import 는
  더 큰 집합 쪽으로만 → 순환 없음), 조각 수가 `--max-lazy`(기본 7, main 포함 8 = 아티팩트 한도)를 넘으면 한 조각과 그 조각이 import 하는
  조각 전부를 합친다 (그 조각을 받을 때 어차피 함께 받던 것이라 비용 없음, 순환 없음). 해시 폴더라 1년 캐시(immutable).
  개발 트리(`node tools/serve.mjs`)는 번들 없이 그대로 돈다. 번들러 문제가 의심되면 `--no-bundle` (모듈 그대로 + `<link rel=modulepreload>` 전부) 로 비교할 수 있다.
- `index.html` 고침: `build-info.js` (window.__BN_BUILD — 부팅 진행률 분모, lo/ 목록) 를 부팅 관문보다 먼저, main 조각 modulepreload,
  CSS·부팅 관문·글꼴 주소에 `?v=<내용 해시>` (css 의 @font-face 도 같은 값).
- `build.json` = 파일별 `{hash8, bytes}` (서비스 워커가 그림 캐시를 검증), `_redirects` = `/apk`·`/download` → 최신 APK.
  **buildHash·build.json 에는 `downloads/`·`_redirects` 를 넣지 않는다** (APK 에 들어가지 않는 배포 전용 파일). 게임 파일이 이전 `dist/web` 과 같으면
  (buildHash 같음, package.json version 도 같음) 이전 version·built·commit 을 그대로 써서 `build-info.js`·`build.json`·`index.html`·`sw.js` 가 바이트까지 같다 →
  DELIVER 흐름(build_web → build_apk.sh --verify → 새 APK 를 downloads/ 에 넣으려고 build_web 다시)에서도 APK `assets/www` = dist/web 해시 비교
  (tools/apk/verify_apk.mjs, platform WP-9 수락 3) 가 맞는다 (R1-REQ-324). 내용이 같아도 새로 찍으려면 `--restamp`.
- 검사: `python3 tools/fonts/build_fonts.py --check` (실패하면 빌드 실패 — 임시 빌드만 `--allow-font-gaps`), `node tools/validate_maps.mjs`,
  netlify.toml 헤더 규칙 겹침·CSP, 크기 예산.
- **크기 예산**: 사이트(dist/web − downloads) ≤ 90 MB (실패), APK 입력 ≤ 45 MB (넘으면 "APK 는 bg/cg/portraits 원본 대신 assets/lo 만" 크기를 알리고
  그것도 넘으면 실패 — 정해진 경로라 경고가 아니다: `tools/apk/pack_web.py --assets auto` 가 lo 단계를 고른다, APK 어림 ≈ 38 MB),
  첫 화면 경로 brotli ≤ 1.6 MB (경고, `--strict` 면 실패).
- APK: `dist/BloodNocturne.apk` 가 있으면 (또는 `--apk <파일>`) `downloads/BloodNocturne-<versionName>-<versionCode>.apk` + `downloads/latest.json`.
  `/downloads/BloodNocturne.apk`·`/apk`·`/download` 는 리디렉트로 이 파일을 가리킨다 (같은 APK 를 두 번 올리지 않는다). `--no-apk` 로 뺀다.

## 2. 로컬 확인

```bash
node tools/deploy/serve_dist.mjs --port 8090           # http://localhost:8090/
node tools/deploy/smoke_deployed.mjs --local           # dist/web 에 배포 스모크 (API 검사 제외)
node tools/deploy/test_sw.mjs                          # 서비스 워커 (오프라인·업데이트)
node tools/qa/platform_load.mjs --dist                 # 느린 4G·빠른 4G·Wi-Fi 첫 화면 시간 (platform §11 WP-8)
```

## 3. Netlify 배포 (W6 DELIVER-WEB)

**절대 저장소 루트를 올리지 않는다** (`netlify deploy --dir .` 금지).

1. `node tools/deploy/build_web.mjs` (경고 확인 — 글꼴·맵 검사 실패면 멈춘다).
2. 올리기: **`dist/deploy/` 폴더**를 올린다. 그 안에 `web/`(= dist/web), `netlify/functions`·`netlify/lib`(계정 API), 개발 의존성을 뺀 `package.json`,
   `publish = "web"` 이고 빌드 명령이 없는 `netlify.toml` 이 들어 있다. Netlify 가 함수 의존성(@netlify/blobs 등)을 설치하고 함수를 묶는다.
   - Netlify MCP: 사이트 ID `344c289d-84c8-446a-8f4e-acc8485359ff` 에 `dist/deploy` 를 배포 폴더로 넘긴다.
   - CLI: `cd dist/deploy && npx netlify deploy --prod --dir web --functions netlify/functions --site <사이트 ID>`
   - Git 연동 빌드를 쓰면 저장소의 netlify.toml 이 `node tools/deploy/build_web.mjs --no-apk --no-deploy-bundle` 로 dist/web 을 만든다
     (그 빌드 환경에 python3 fontTools 가 없으면 글꼴 검사는 경고로 건너뛴다).
3. **환경 변수 `AUTH_PEPPER`** (선택, 강력 권장): Netlify 사이트 설정 → Environment variables 에 범위 **Functions** 로 32자 이상 무작위 문자열.
   `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` 로 만든다. 저장소·문서·채팅에 값을 적지 않는다.
   **한 번 넣은 뒤 바꾸거나 지우면 그 뒤로 해시된 계정은 로그인할 수 없다** (docs/ACCOUNTS.md §6). 처음 넣는 것은 언제든 괜찮다(다음 로그인 때 옮겨짐).
   값을 넣거나 바꾼 뒤에는 다시 배포해야 함수에 적용된다. 운영 도구(`tools/accounts/admin.mjs`)도 같은 값을 쓴다.
4. 확인: `node tools/deploy/smoke_deployed.mjs https://blood-nocturne.netlify.app` (모두 ✓ 이어야 한다 — `/api/health`, 앱 출처 CORS 포함).
   APK 없이 배포했다면 `--no-apk`.

## 4. 서비스 워커 (sw.js)

- 빌드가 `BUILD = {hash, version, precache, assets, manifest}` 를 넣는다. 캐시 `bn-<buildHash>` (코드·CSS·글꼴·index.html, 캐시 우선) +
  `bn-assets-v1` (그림, 경로 키 + build.json 해시 검증, 오래된 것부터 최대 800개).
- `/api/`, `/downloads/`, `build.json`, `sw.js`, Range 요청, 다른 출처, GET 이 아닌 요청은 건드리지 않는다.
- 페이지 이동: 네트워크 우선 3초 → 캐시한 index.html. 새 워커는 설치 뒤 **대기**하고, 타이틀의 [업데이트](platform.applyUpdate → `SKIP_WAITING`)
  때만 켜진다. 켜지면 옛 `bn-<hash>` 를 지우고 해시가 바뀐 그림을 캐시에서 뺀다.
- 개발 서버에서는(BUILD 없음) 네트워크 우선 + 오프라인 대비 캐시만 한다 (`?nosw` 면 등록하지 않음).

## 5. claude.ai 아티팩트 (W6 DELIVER-ARTIFACT)

```bash
node tools/deploy/build_artifact.mjs --smoke    # dist/web → dist/artifact, 로컬에서 타이틀·마을·스테이지·보스(데스크톱) + 스테이지(휴대폰 844×390 터치) 확인
node tools/deploy/build_artifact.mjs --check    # 한도 검사 (파일 ≤ 511·256 MB, 한 번 올리기 ≤ 255개·64 MB, 텍스트 16 MB·그 밖 15 MB)
```

- `dist/artifact/index.html` 이 페이지(조각 — 문서 뼈대는 올릴 때 씌워진다), 나머지는 `files` 로 올린다. 경로·형식·묶음은
  `dist/artifact_publish.json` 의 `batches` 에 있다 (첫 묶음에 페이지 포함, `contentType` 을 그대로 넘긴다; `.bin` 팩은 `application/octet-stream`).
- 그림은 `assets/packs/<n>.bin` + `index.json` (assets.js 가 읽는다). assets.js 는 파일 하나가 필요해도 그 팩 전체를 받고 팩 조각을 최대 6개
  메모리에 두므로, 팩은 약 4 MB (`--pack-mb`) 로 작게, 한 화면이 함께 쓰는 그림끼리 묶는다: 0 = 타이틀(배경·UI, 0.6 MB), 1 = 캐릭터 고르기
  (영웅 초상화·기본 직업 퍼펫·아이콘), 2 = 마을, 그다음 질감·소품 / 배경 / 채색 보스 / 초상화 / 영웅별 퍼펫 / CG, 맨 뒤에 `lo/` (휴대폰만).
  `--smoke` 가 장면마다 받은 팩 바이트(`packMB`)를 보여 준다 (2026-09-28: 스테이지 약 16 MB, 보스방 18 MB, 휴대폰 스테이지 14 MB —
  8 MB 팩을 경로 순으로 채우던 때는 32·41·31 MB).
  assets.js 를 거치지 않고 주소로 직접 받는 파일(글꼴, `painted/enemies/**`, `painted/**/manifest.json`)은 파일로 둔다.
- 서비스 워커는 등록하지 않고(`sw:false`), 계정은 CSP 로 막혀 숨겨지며 저장은 기기에만 남는다.

## 6. 알려진 한계 (2026-09-28)

- 첫 화면 경로가 brotli 약 1.7 MB (JS 1.17 MB + 글꼴 0.46 MB) 라 느린 4G 9초·빠른 4G 2.5초 예산을 넘는다(측정 약 11.5초·2.7초, 하네스의
  새 창 시작 약 1초 포함). 모듈 폭포는 없어졌고(요청 2개), 남은 것은 바이트다. 식별자 줄이기(맹글링)는 brotli 기준 2 % 뿐이라 넣지 않았다.
  더 줄이려면 앱 쪽에서 보스·벡터 괴물 그림·각성 연출·스토리 데이터를 동적 import 로 나눠야 한다 (요청 기록: /tmp/claude-0/plan/requests.jsonl).
