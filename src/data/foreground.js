// 전경 (Stage 6 FORE): 플레이 층 앞에 그리는 가까운 실루엣 — 깊이감용. 그리기는 src/render/foreground.js.
//
// FG_THEMES[theme] = { top: [모양…], bottom: [모양…], par, alpha, gap }
//   top     화면 위 가장자리에 매달리는 모양 (사슬·덩굴·깃발·마른 가지·관·다시마·떠 있는 돌)
//   bottom  화면 아래 가장자리에서 솟는 모양 (묘비·잔해·관·산호·다시마·톱니바퀴·그루터기)
//   par     가로 패럴랙스 배율 (> 1: 플레이 층보다 빨리 흐른다 = 카메라에 더 가깝다)
//   alpha   가장 짙을 때의 알파 (주인공·보스·적과 겹치면 render 가 더 옅게 한다)
//   gap     조각 사이 평균 간격 (화면 px) — 클수록 드문드문
// 색은 원경 팔레트(render/background.js THEMES)에서 가져온다: 몸 = sky[2](가장 어두운 하늘)를 더 어둡게, 테두리 빛 = fog.
// FG_STAGES[id] = 그 스테이지의 테마(방 테마가 다르면 그 테마의 기본값) + 선택 extra (2부 균열 스테이지의 잔해 등).
// 모양 이름은 render/foreground.js 의 SHAPES 에 있어야 한다 (tools/test_foreground.mjs 가 확인).

export const FG_SHAPES = ['chain', 'vine', 'banner', 'branch', 'grave', 'rubble', 'pipe', 'coral', 'kelp', 'gear', 'rock'];

export const FG_THEMES = {
  village:   { top: ['banner', 'branch'],      bottom: ['rubble', 'grave'],  par: 1.35, alpha: 0.82, gap: 520 },
  graveyard: { top: ['branch', 'vine'],        bottom: ['grave', 'branch'],  par: 1.35, alpha: 0.85, gap: 460 },
  gate:      { top: ['chain', 'banner'],       bottom: ['rubble'],           par: 1.3,  alpha: 0.8,  gap: 520 },
  hall:      { top: ['chain', 'banner'],       bottom: ['rubble'],           par: 1.3,  alpha: 0.8,  gap: 500 },
  catacombs: { top: ['vine', 'chain'],         bottom: ['grave', 'rubble'],  par: 1.3,  alpha: 0.82, gap: 480 },
  library:   { top: ['chain', 'banner'],       bottom: ['rubble'],           par: 1.3,  alpha: 0.78, gap: 540 },
  alchemy:   { top: ['pipe', 'chain'],         bottom: ['pipe'],             par: 1.3,  alpha: 0.8,  gap: 500 },
  waterway:  { top: ['chain', 'vine'],         bottom: ['kelp', 'rubble'],   par: 1.3,  alpha: 0.8,  gap: 500 },
  clock:     { top: ['chain'],                 bottom: ['gear', 'rubble'],   par: 1.3,  alpha: 0.8,  gap: 520 },
  spire:     { top: ['chain', 'banner'],       bottom: ['rubble'],           par: 1.35, alpha: 0.75, gap: 560 },
  chapel:    { top: ['banner', 'chain'],       bottom: ['rubble', 'grave'],  par: 1.3,  alpha: 0.8,  gap: 520 },
  throne:    { top: ['banner', 'chain'],       bottom: ['rubble'],           par: 1.3,  alpha: 0.8,  gap: 520 },
  abyss:     { top: ['vine', 'rock'],          bottom: ['rubble'],           par: 1.35, alpha: 0.8,  gap: 520 },
  arena:     { top: ['chain', 'banner'],       bottom: ['rubble'],           par: 1.3,  alpha: 0.78, gap: 560 },
  mirror:    { top: ['chain'],                 bottom: ['rubble'],           par: 1.3,  alpha: 0.72, gap: 580 },
  forge:     { top: ['chain', 'pipe'],         bottom: ['rubble', 'gear'],   par: 1.3,  alpha: 0.82, gap: 500 },
  sunken:    { top: ['kelp', 'chain'],         bottom: ['coral', 'kelp'],    par: 1.35, alpha: 0.8,  gap: 460 },
  sky:       { top: ['banner', 'vine'],        bottom: ['rubble'],           par: 1.4,  alpha: 0.7,  gap: 600 },
  nightmare: { top: ['vine', 'chain'],         bottom: ['rubble', 'branch'], par: 1.35, alpha: 0.8,  gap: 500 },
  blight:    { top: ['vine', 'branch'],        bottom: ['branch', 'rubble'], par: 1.35, alpha: 0.82, gap: 480 },
  void:      { top: ['rock'],                  bottom: ['rock', 'rubble'],   par: 1.4,  alpha: 0.75, gap: 600 },
};
/** 표에 없는 테마의 기본값 (성 안) */
export const FG_DEFAULT = FG_THEMES.hall;

// 2부 균열 스테이지(s21–s25, 하늘의 균열 뒤 다시 찾는 곳): 무너진 잔해를 섞는다
const RIFT = { extraBottom: ['rubble'], extraTop: ['rock'] };
export const FG_STAGES = {
  s01: { theme: 'village' },   s02: { theme: 'graveyard' }, s03: { theme: 'gate' },     s04: { theme: 'hall' },
  s05: { theme: 'catacombs' }, s06: { theme: 'library' },   s07: { theme: 'alchemy' },  s08: { theme: 'waterway' },
  s09: { theme: 'clock' },     s10: { theme: 'spire' },     s11: { theme: 'chapel' },   s12: { theme: 'throne' },
  s13: { theme: 'abyss' },     s14: { theme: 'mirror' },    s15: { theme: 'forge' },    s16: { theme: 'sunken' },
  s17: { theme: 'sky' },       s18: { theme: 'nightmare' }, s19: { theme: 'blight' },   s20: { theme: 'void' },
  s21: { theme: 'sky', ...RIFT },      s22: { theme: 'graveyard', ...RIFT }, s23: { theme: 'spire', ...RIFT },
  s24: { theme: 'chapel', ...RIFT },   s25: { theme: 'village', ...RIFT },   s26: { theme: 'alchemy' },
  s27: { theme: 'waterway' },   // 외전 Ⅱ (1부 — 균열 잔해 없음, s08 수로와 같다)
  arena: { theme: 'arena' },
};

/** 스테이지 id + (방 덮어쓰기 포함) 테마 → { top, bottom, par, alpha, gap } (늘 값이 있다; 마을 'town' 은 null = 그리지 않음) */
export function fgSpec(stageId, theme) {
  if (theme === 'town') return null;
  const st = Object.prototype.hasOwnProperty.call(FG_STAGES, stageId) ? FG_STAGES[stageId] : null;
  const th = theme || st?.theme;
  const base = (th && Object.prototype.hasOwnProperty.call(FG_THEMES, th)) ? FG_THEMES[th] : FG_DEFAULT;
  const same = st && st.theme === th;   // 방 테마가 스테이지 테마와 다르면 스테이지 extra 는 쓰지 않는다
  return {
    top: [...base.top, ...(same && st.extraTop ? st.extraTop : [])],
    bottom: [...base.bottom, ...(same && st.extraBottom ? st.extraBottom : [])],
    par: base.par, alpha: base.alpha, gap: base.gap,
  };
}
