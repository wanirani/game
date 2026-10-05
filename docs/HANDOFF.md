# 블러드 녹턴 인수인계 (2026-10-05)

## 1. 배포 결과

| 항목 | 값 |
|---|---|
| 웹 게임 | https://blood-nocturne.netlify.app |
| 안드로이드 APK 내려받기 | https://blood-nocturne.netlify.app/apk |
| 버전 | 1.0.0 (versionCode 399774), 웹 빌드 `bn-8805896e5192` (`1.0.0+20261005T1457.ed6c9674`) |
| APK 파일 | `BloodNocturne-1.0.0-399774.apk` (65.4 MB, 음악 포함) |
| APK SHA-256 | `4ead3d7840a1bf5bef85398d35e3167c0b62cf98b74425cb938cc32736f80d21` |
| 서명 인증서 SHA-256 (공개 값) | `8c437fd7feabc6de3b03fb60fe3db46d4725b930e9d6e25f7215f4b10bc21412` |
| Netlify 배포 ID | `6ac3bc89d908dda0a44b6138` (사이트 `blood-nocturne`) |

이번 배포에 새로 들어간 것 (2026-10-05):
- 익명 통계·오류 보내기: 옵션에서 끌 수 있음, 브라우저 GPC 신호가 있으면 기본 꺼짐 (`docs/TELEMETRY.md`)
- 녹음 음악 44곡·효과음 72종: 게임 악보를 실제 악기 음원으로 렌더링. 옵션 "음악 음원"에서 합성음으로 되돌릴 수 있음
- 온라인 기록: 모드별 순위표(최고 기록만), 상위 20위 유령 재생, 매일 바뀌는 "오늘의 도전", 공개 별명 (`docs/ONLINE.md`)
- 무한의 탑은 아직 개발 중이라 이번 배포에서 뺐다

- APK 는 이전 배포와 같은 키로 서명했다. 이미 설치된 앱 위에 업데이트로 설치된다.
- 설치된 앱은 `downloads/latest.json` 의 versionCode 를 보고 새 버전을 알린다.

확인 결과:
- 배포된 사이트 스모크 17/17 통과
  - 보안·캐시 헤더, 서비스 워커(음악 캐시 `bn-audio-v1` 포함), 설치 가능 여부, `/apk`, `/api/health`
  - 타이틀·마을·1장·4장 보스방 페이지 오류 0
  - 배포 후 `/api/daily`, `/api/boards/…`, 음악·효과음 목록 응답 확인
- APK 검증 81/81 통과
  - 헤드리스 부팅, CSP 위반 0, 에셋·소리 404 0
- 출시 전 시험: 계정 API, 온라인 서버·클라이언트, 통계 서버·클라이언트, 녹음 음악 재생, 효과음, 설정, 지도 검증, 통합 시험(데스크톱 8 · 모바일 3) 모두 통과

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
