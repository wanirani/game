# 블러드 녹턴 인수인계 (2026-10-05)

## 1. 배포 결과

| 항목 | 값 |
|---|---|
| 웹 게임 | https://blood-nocturne.netlify.app |
| 안드로이드 APK 내려받기 | https://blood-nocturne.netlify.app/apk |
| 버전 | 1.0.0 (versionCode 400106), 웹 빌드 `bn-ce25b8722f61` (`1.0.0+20261005T2041.078005e0`) |
| APK 파일 | `BloodNocturne-1.0.0-400106.apk` (68.7 MB, 음악 포함) |
| APK SHA-256 | `7746220ca120428a9e3e8e2fa6239dad03ea1542776884c03d4e4a3d68152369` |
| 서명 인증서 SHA-256 (공개 값) | `8c437fd7feabc6de3b03fb60fe3db46d4725b930e9d6e25f7215f4b10bc21412` |
| Netlify 배포 ID | `6ac40c7a7e293b9fd24d0ed4` (사이트 `blood-nocturne`) |

이번 배포에 새로 들어간 것 (2026-10-05):
- 익명 통계·오류 보내기: 옵션에서 끌 수 있음, 브라우저 GPC 신호가 있으면 기본 꺼짐 (`docs/TELEMETRY.md`)
- 녹음 음악 44곡·효과음 72종: 게임 악보를 실제 악기 음원으로 렌더링. 옵션 "음악 음원"에서 합성음으로 되돌릴 수 있음
- 온라인 기록: 모드별 순위표(최고 기록만), 상위 20위 유령 재생, 매일 바뀌는 "오늘의 도전", 공개 별명 (`docs/ONLINE.md`)
- 무한의 탑 (아케이드 5번째 모드): 층마다 방·적이 바뀌고, 5층마다 보스, 10층마다 쉼터·축복. 난이도별 온라인 순위표 `tower:<난이도>`
- 7번째 영웅 이졸데 드라켄 (용창 기사, 창): 2부 14장 보스 처치 후 합류, 직업 7개, 각성·궁극기, 창 무기 14종 (`docs/specs/hero7.md`)
- 오늘의 도전 영웅 후보가 7명이 되어, 날짜별로 정해지는 영웅이 이전과 달라졌다 (기록에는 영향 없음)
- 외전 21장 「하늘 정원의 둥지」: 2부 엔딩을 본 세이브에서 세계 지도에 열림. 보스 '공허에 물든 은룡' 아르겐을 정화하면 탈것 아르겐이 합류. 장 진행도(20장)는 바뀌지 않음 (`docs/specs/ex_s21.md`)
- 아케이드: 보스 러시 코스 2개 추가(이계편·외전 8연전, 21연전). 외전을 아는 세이브는 무한의 탑 45층 이후·서바이벌 105웨이브 이후 보스 구성에 아르겐이 섞인다

- APK 는 이전 배포와 같은 키로 서명했다. 이미 설치된 앱 위에 업데이트로 설치된다.
- 설치된 앱은 `downloads/latest.json` 의 versionCode 를 보고 새 버전을 알린다.

확인 결과:
- 배포된 사이트 스모크 17/17 통과
  - 보안·캐시 헤더, 서비스 워커(음악 캐시 `bn-audio-v1` 포함), 설치 가능 여부, `/apk`, `/api/health`
  - 타이틀·마을·1장·4장 보스방 페이지 오류 0
  - 배포 후 `/api/daily`, `/api/boards/…`, 음악·효과음 목록 응답 확인
- APK 검증 81/81 통과
  - 헤드리스 부팅, CSP 위반 0, 에셋·소리 404 0
- 출시 전 시험: 계정 API, 온라인 서버·클라이언트, 통계, 세이브 호환, 무한의 탑, 탈것, 동료, 아르겐 보스, 녹음 음악, 설정, 지도 검증, 채색 등록, 2부 정적 검사, 통합 시험(데스크톱 13 · 모바일 5) 모두 통과
- APK 그림 용량(lo 단계) 45.02 MB / 48 MB — 외전 추가로 기준을 45 → 48 MB 로 올렸다(APK 전체 상한 75 MB 는 그대로, MASTER_PLAN §1.20)

## 2. 사용자가 할 일

1. **`AUTH_PEPPER` 설정 (이제 필수)**
   - Netlify 사이트 설정 → Environment variables 에 범위 **Functions** 로 32자 이상 무작위 값을 넣고, 다시 배포한다.
   - 값은 비밀번호 관리자에만 보관한다. 한 번 넣은 뒤에는 바꾸거나 지우지 않는다.
   - 자세한 절차는 `docs/RELEASE.md` §2.
   - 이 값이 없으면 계정 보안이 약해지고, 순위표 기록을 위조할 수 있으며 "오늘의 도전" 내용을 미리 알 수 있다 (`docs/ONLINE.md`).
   - 나중에 처음 넣는 것은 안전하다(다음 로그인 때 옮겨짐). 넣는 날의 "오늘의 도전" 내용만 한 번 바뀐다.
2. **APK 서명 키 백업 (필수)**
   - 백업할 파일: `tools/android/release.keystore`, `tools/android/keystore.properties`
   - 두 파일은 git 에 없고 이 작업 환경에만 있다. 작업 환경이 정리되면 함께 사라진다.
   - `docs/RELEASE.md` §5.1 대로 오프라인 사본 두 곳과 비밀번호 관리자에 보관한다.
   - 키를 잃으면 이후 업데이트는 재설치가 필요하고, 재설치하면 앱 안의 세이브가 지워진다.
3. **(선택) Netlify 도구 모음 끄기**
   - Netlify 가 배포 페이지에 자체 도구 스크립트를 끼워 넣는다.
   - 우리 보안 정책(CSP)이 이를 막아 게임에는 영향이 없고, 브라우저 콘솔에 오류 한 줄만 남는다.
   - 없애려면 Netlify 사이트 설정에서 도구 모음(Netlify Drawer/툴바)을 끈다.

## 3. 문서 안내

| 문서 | 내용 |
|---|---|
| `docs/AUDIT_REPORT.md` | 출시 전 감사 결과 (치명적 0 · 높음 6 · 보통 15, 모두 수정), 알려진 문제, 최종 회귀 시험 |
| `docs/RELEASE.md` | 웹·APK 빌드와 배포 순서, 서명 키 백업·복구 |
| `docs/ACCOUNTS.md` | 계정 서버 설계와 운영 (잠금 규칙, 정리 함수, `AUTH_PEPPER`) |
| `docs/ONLINE.md` | 온라인 기록 서버 (순위표, 유령, 오늘의 도전, 별명, 운영 도구) |
| `docs/TELEMETRY.md` | 익명 통계·오류 수집 (무엇을 보내고 안 보내는지, 보관 기간, 끄는 법, `tools/telemetry/report.mjs` 보고서 읽기) |
| `docs/ARCHITECTURE.md` | 코드 구조 |
| `tools/deploy/README.md` | 빌드 옵션, 배포 확인(스모크) |

## 4. 다시 빌드·배포할 때

`docs/RELEASE.md` §4 순서를 따른다.

```
node tools/deploy/build_web.mjs
tools/apk/build_apk.sh --check-key
tools/apk/build_apk.sh --verify
node tools/deploy/build_web.mjs --strict
# dist/deploy 를 Netlify 사이트 344c289d-84c8-446a-8f4e-acc8485359ff 에 올린다
node tools/deploy/smoke_deployed.mjs https://blood-nocturne.netlify.app
```

음악을 다시 만들 때는 `tools/audio/music/README.md` 를 따른다.
