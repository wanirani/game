# 배경음악 오프라인 렌더 파이프라인 / Music render pipeline

게임 악보(`src/data/music.js`)를 **게임 자신의 컴파일러**(`compileTrack`, `src/core/audio.js` — 읽기/가져오기만, 수정 없음)로
펼친 뒤 표준 MIDI → FluidSynth(FluidR3_GM) 샘플 렌더 → 루프 가공 → AAC(.m4a) 로 만든다. 결과는
`assets/audio/music/<id>.m4a` + `assets/audio/music/index.json`. 중간 산출물(MIDI·WAV·스펙·측정값)은 저장소 밖
`$AUDIO_BUILD_DIR` (기본 `/tmp/claude-0/audio_build`).

```
node tools/audio/music/build_music.mjs                 # 전곡 (4코어 ≈ 6분)
node tools/audio/music/build_music.mjs --only title,s01
node tools/audio/music/build_music.mjs --check         # 렌더 없이 index.json ↔ 파일·루프·음량·용량 검증 (실패 시 exit 1)
node tools/audio/music/build_music.mjs --balance       # (선택) 원본 신스 대비 채널 균형 재측정 → balance.json
node tools/audio/music/build_music.mjs --bands         # (선택) 원본 신스 대비 옥타브 대역 비교 → 아래 표
python3 tools/audio/music/calibrate.py                 # (선택) GM 프로그램 음량 보정표 → gm_calib.json
```
필요: `fluidsynth` 라이브러리(libfluidsynth.so.3, ctypes 로 직접 호출), `/usr/share/sounds/sf2/FluidR3_GM.sf2`, `ffmpeg`(내장 aac),
python3 + numpy + scipy. `--balance/--bands` 만 추가로 `node-web-audio-api` 가 필요하다
(`npm i --prefix $AUDIO_BUILD_DIR/wa node-web-audio-api` — 저장소 의존성에 넣지 않음).

## 단계

| 파일 | 역할 |
|---|---|
| `build_music.mjs` | 곡 컴파일 → 파트(MIDI 채널) 구성·GM 매핑·음량/팬/송신 → SMF 작성 → `render.py` 병렬 호출 → `index.json`·QA 표 |
| `gm.mjs` | 게임 악기 → GM 프로그램 매핑, 드럼 레인 → GM 타악기 키, 코러스 송신, 곡별 덮어쓰기 |
| `smf.mjs` | 최소 SMF(format 1) 작성기 (포트 메타로 16채널 초과 지원 — nihil 은 24채널) |
| `fsynth.py` | libfluidsynth ctypes 래퍼 + SMF 리더. 이벤트를 64샘플 블록 격자에 결정적으로 적용 |
| `dsp.py` | BS.1770 라우드니스, 4× 트루 피크, 상태 없는 룩어헤드 리미터, 게임 딜레이·잔향 재현, 이음매 지표 |
| `render.py` | 곡 1개 렌더/가공/인코드/QA (`build`), 산출물 검증 (`check`), 파트 단독 측정 (`balance`) |
| `ref_synth.mjs` | 원본 절차적 신스(게임 `Engine`/`Player`)를 OfflineAudioContext 로 돌리는 기준 측정 도구 |
| `gm_calib.json` | GM 프로그램별 시험음 K-가중 음량 (calibrate.py 산출) |
| `balance.json` | 곡·채널별 균형 보정 dB (`--balance` 산출, 커밋됨 → 재빌드에 node-web-audio-api 불필요) |

1. **MIDI 내보내기** — `compileTrack` 결과(섹션별 bpm·조옮김·코드/패턴 생성·`from` 복제 채널·드럼 레인·세기)를
   도입 + 반복 순서 1회로 펼친다. PPQ 1920, 섹션마다 템포/박자/마커(`sec:A`), 루프 곡은 `loopStart`/`loopEnd` 마커.
   세기 = 127·√v (FluidSynth 세기 곡선이 진폭 ∝ (vel/127)² 이므로 게임의 선형 진폭 v 를 보존), 결정적 해시로 ±4 % 인간미
   (게임의 0.93–1.03 난수 흔들림 대신 — 패스마다 같아야 이음매가 맞는다). 같은 채널·같은 키 겹침은 정리(중복 제거 수는 QA 에 표시).
   CC7 = 127·√(A/Amax), A = vol × 10^(−L_prog/20) × 10^(balance/20); CC10 = 팬; CC91 = rev×140; CC93 = 코러스.
2. **렌더** (FluidSynth 2.3, 44.1 kHz, 7차 sinc 보간, 폴리포니 2048, 48채널) — 세 번:
   마른 신호(코러스 포함) / 잔향 송신 버스(채널별 rev 가중) / 리드 딜레이 송신(채널별 dly 가중).
   - **잔향은 FluidSynth 내장 잔향 대신 컨볼루션**: FluidSynth 2.3 의 FDN 잔향은 지연선이 변조돼 시불변이 아니다
     — 본문 1회째와 2회째의 꼬리가 달라 (일치도 ≈ 3 dB) 루프 이음매가 맞지 않는다. 대신 게임 엔진의 대성당 IR(`makeIR`,
     3.3 s, 시드 고정)을 그대로 옮겨 송신 버스 → 170 Hz 고역 통과 → 컨볼루션 → ×0.85 (게임과 같은 신호 흐름).
     rev 0.45 ≈ 젖은/마른 −12 dB, RT60 ≈ 3 s.
   - 코러스 LFO 속도는 루프 길이의 정수 분의 1 (≈0.3 Hz) → 2회째와 위상 일치 (일치도 3–12 dB → 65 dB).
   - 딜레이: 게임 엔진과 같게 0.75박(곡 기본 bpm, ≤1.5 s) · 귀환 0.34 · LP 2.6 kHz · 출력 0.55, 출력의 30 % 는 잔향으로.
3. **루프 가공** — 도입 + 본문 2회를 렌더한다. 2회째 본문은 정확히 `L`(= 템포 계산 길이를 64 배수로 반올림, 오차 ≤ 0.73 ms)
   뒤에 같은 블록 위상으로 시작하므로 마른 신호는 비트 단위로 같다(측정 164 dB). `LS` = 본문 시작 + x, x 는 1–6 s 중
   1회째와 2회째의 차(= 서로 다른 앞선 잔향 꼬리)가 음악 대비 −50 dB 아래로 떨어지는 첫 지점(대개 ≈2 s), `LE = LS + L`.
   파일 = `R[0:LE]` + `R[LS:]` 가드(≥0.25 s, 길이를 1024 배수로). 즉 루프 구간 머리에는 직전 패스 끝의 잔향이 이미 섞여 있고,
   첫 재생의 도입 → 본문 전환도 원래 꼬리 그대로다. 이음매 직전 46 ms 는 `R[LS−46ms:LS]` 쪽으로 코사인 크로스페이드
   (남은 −50 dB 차이만 덮음). 비루프 곡(victory, gameover)은 1회 + 자연 꼬리(−72 dBFS 까지 + 0.2 s, 끝 0.15 s 페이드).
4. **음량** — BS.1770 통합 라우드니스 −16 LUFS (징글 −15), 트루 피크 리미터(4× 오버샘플, 대칭 창 → 같은 입력 = 같은 이득이라
   이음매 안전) 천장 −2 dBTP, 이득 감소 최대 3 dB (그 이상 필요한 곡은 목표보다 조금 조용하게 둔다). 인코드 후 디코드 트루 피크 ≤ −1 dBTP.
5. **AAC 인코드** — `ffmpeg -c:a aac` (기본 96 kbps, 조용/단순한 곡 80–88 kbps), `+faststart`. 디코드해 원본 PCM 과 프레임별
   SNR 을 비교해 **인코더 글리치**(내장 인코더가 드물게 원본보다 수 dB 큰 순간 피크를 내는 프레임 — boss 에서 +5.5 dB 관측)를
   잡으면 다른 코더(`fast`)/비트레이트로 다시 인코드한다.
6. **프라이밍 측정** — ffmpeg 기본 디코드(edit list 적용)와 `-ignore_editlist 1` 디코드를 각각 인코드 전 PCM 과 교차상관:
   전곡에서 기본 디코드 오프셋 0, edit list 무시 시 1024 샘플(=AAC 인코더 지연). 파일 길이를 1024 배수로 맞춰 디코드 길이는
   정확히 `samples` (프라이밍을 안 자르는 디코더는 `samples + 1024`).

## GM 매핑

| 게임 악기 | GM (0 기반) | 비고 |
|---|---|---|
| organ | 19 Church Organ | 패드·페달·선율 모두 |
| organ2 | 73 Flute | 게임 organ2 = 플루트 음색 |
| harpsi | 6 Harpsichord | |
| piano | 0 Acoustic Grand | |
| strings | 49 String Ensemble 2 (slow) — `gen:'pad'` / 48 String Ensemble 1 — 그 밖 | |
| choir | 52 Choir Aahs / `vowel:'o'` → 53 Voice Oohs | |
| lead, sawlead | 40 Violin (최저음 ≥ G3) / 41 Viola (≥ C3) / 42 Cello | 고딕 액션: 현악 리드 |
| lead2 | 41 Viola (화성·대선율), 높은 음역(중앙값 ≥ E5, 최저 ≥ G3) → 40 Violin, 낮으면 42 Cello | |
| fiddle | 110 Fiddle | |
| reed | 68 Oboe (중앙값 ≥ E4) / 71 Clarinet (≥ D3) / 70 Bassoon | |
| brass | 61 Brass Section (패턴·패드), 선율: 56 Trumpet (중앙값 ≥ A#4) / 57 Trombone (< D3) | |
| bass | 33 Electric Bass (finger) | |
| fbass | 35 Fretless Bass | |
| pizz | 45 Pizzicato Strings | |
| bells | 14 Tubular Bells | |
| celesta | 8 Celesta | |
| musicbox | 10 Music Box | |
| timp | 47 Timpani | |
| gtr | 30 Distortion Guitar | pow 보이싱 그대로(근음·5도·옥타브) |
| kit | ch10: 기타가 있는 곡 Power Kit(16), 킥·스네어·심벌·붐만 쓰는 곡 Orchestra Kit(48), 그 밖 Standard(0) | |
| kit 레인 | k 36 · s 38 · h 42 · o 46 · c 49 · r 51 · t 50 · m 47 · f 43 · p 39 · j 70 · w 76 · a 53 | 드럼 노트오프는 무시(원샷) |
| kit `z`(붐) | 116 Taiko Drum, 별도 채널, 키 36 | |

## 채널 균형 (balance.json)

1차: GM 프로그램별 시험음 음량(`gm_calib.json`)으로 게임 `inst.norm` 처럼 악기 음량을 고르게 한 뒤 `vol` 비율을 적용.
2차(`--balance`): 원본 절차적 신스를 OfflineAudioContext(node-web-audio-api)로 **채널 단독·마른 신호**로 렌더해 K-가중 에너지를
재고, GM 파트 단독 렌더와 비교해 채널별 상대 음량 차(±15 dB 제한)를 `balance.json` 에 저장 → 빌드가 CC7 에 반영한다.
node-web-audio-api 1.x 는 `setTargetAtTime` 앞에 틈이 있으면 대기 구간 값이 깨지는 결함이 있어(예: 0.5 → 44088)
`ref_synth.mjs` 가 AudioParam 자동화를 해석적으로 추적해 목표 시작 시각에 정확한 값을 넣어 우회한다(측정값 이상 감지 포함).

## index.json 계약

```jsonc
{
  "version": 1, "rate": 44100, "format": "m4a", "generated": "…", "totalBytes": 0,
  "tracks": {
    "title": {
      "file": "title.m4a",          // assets/audio/music/ 기준
      "bytes": 0, "kbps": 96,
      "duration": 65.49,            // = samples / rate (프라이밍 제외한 실제 내용 길이)
      "samples": 2888274,           // 1024 의 배수
      "loop": true,
      "loopStart": 14.717, "loopEnd": 65.244,             // 초 (rate 기준, 프라이밍 제거된 디코드 기준)
      "loopStartSample": 649025, "loopEndSample": 2877249, // 같은 값의 샘플 위치 (정확)
      "priming": 1024,              // edit list 를 무시하는 디코더가 앞에 붙이는 샘플 수
      "lufs": -16.0, "peak": -1.2   // 디코드 측정: 통합 라우드니스, 트루 피크(dBTP)
    }
  },
  "alias": {}                       // { 별칭 id: 실제 id } — 현재 없음
}
```
런타임 규칙: `decodeAudioData` 결과 버퍼 길이로 프라이밍 제거 여부를 판단한다 —
`extra = buffer.duration − duration` 이 `priming/rate − 0.5 ms` 이상이면 오프셋 `off = priming/rate`, 아니면 0.
재생은 `start(when, off)`, 루프 곡은 `loop = true; loopStart = loopStart + off; loopEnd = loopEnd + off` (AudioContext 가
48 kHz 로 리샘플해도 초 단위라 그대로 맞다). 비루프 곡은 끝까지 1회. 모든 곡은 이미 −16 LUFS(징글 −15)로 맞춰져 있으므로
`TRACKS[id].gain`(절차적 신스용 보정)을 다시 곱하지 말 것.

## 옥타브 대역 비교 (GM 마른 믹스 − 원본 신스 마른 믹스, 총 K 음량을 맞춘 뒤 dB)

<!-- BANDS:BEGIN -->
<!-- BANDS:END -->

## QA

열: `Δtempo` = max(|도입 샘플 길이 − 템포 계산|, |본문 루프 길이 − 템포 계산|) ms; `limiter` = 최대 이득 감소;
`clip` = 디코드 |x| ≥ 0.9999 샘플 수; `seam jump / hf` = 디코드 PCM 의 이음매 1차/2차 차분 ÷ 루프 내부 99.9 백분위
(1 미만이면 이음매가 루프 안의 흔한 순간보다 매끈함); `match` = 이음매 직전 0.2 s 의 `y[LE−W:LE]` 대 `y[LS−W:LS]` SNR
(디코드 기준 — AAC 부호화 잡음이 상한, 인코드 전 기준은 41–50 dB); `notes` = 채널별 컴파일 음표 수 = MIDI 음표 수(+겹침 정리)
= MIDI 파일에서 다시 읽은 수.

<!-- QA:BEGIN -->
<!-- QA:END -->
