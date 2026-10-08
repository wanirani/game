// 외형 꾸미기 — 대시 잔상 색 6종 (2026-10 벤치마크 5 최소판). 순수 데이터 + 작은 판정 함수 — import 없음 (node 에서 import 가능, DOM 없음)
// 능력치와 무관하다: 바뀌는 것은 대시 잔상(game/feel_move.js dashFx 의 ghost 색)뿐. 새 업적·새 기록 없음 — 해금은 이미 있는 기록에서 읽는다
//  - 저장: 계정 단위 meta.ach.cos = { trail: 'tr_…' | null } (core/ach_meta.js — 없거나 null = '직업 기본', 영웅마다의 원래 잔상)
//    서버는 모르는 필드를 그대로 받는다 (netlify/lib/validate.mts isValidAch). 병합은 mergeAch 의 모르는 필드 규칙 {...서버, ...기기} = 기기 우선
//  - 해금 need: { ach: 업적 id } meta.ach.got · { tower: n } 무한의 탑 어느 난이도든 n 층 (meta.towerBest[diff].floor) ·
//    { ng: n } 슬롯 1–3 중 하나가 지난 회차 n 이상 (state.ng.n — game/ngplus.js ngOf 와 같은 규칙: 아케이드 임시 세이브 제외)
//  - 고를 때만 확인한다 (업적처럼 거두지 않는다: 회차 슬롯을 지워도 이미 고른 잔상은 남는다). 런타임은 trailRamp 로 색만 읽는다
//  - ramp: 잔상 6단 (0 = 첫 잔상, 진한 색 → 5 = 마지막, 밝은 색). 직업 기본은 필살기 색 → 흰색 (feel_move.js 의 mix 와 같은 모양)
//  - 화면: front/achievements.js '이명 · 장식' 창의 '외형' 쪽 (잠긴 칸은 조건 글)

/** 잔상 색 (표 순서 = 화면 순서) */
export const TRAILS = Object.freeze({
  tr_blood: { name: '핏빛', desc: '선혈처럼 짙은 붉은 잔상', ramp: ['#c8102e', '#d32d47', '#de4a60', '#e9667a', '#f48393', '#ffa0ac'], need: { ach: 'cb_style_s' } },
  tr_moon: { name: '월광', desc: '백작의 성을 비추던 창백한 달빛', ramp: ['#8aa6e8', '#9fb6ed', '#b4c6f1', '#c8d6f6', '#dde6fa', '#f2f6ff'], need: { ach: 'st_dracula' } },
  tr_holy: { name: '성광', desc: '진 각성의 금빛 광휘', ramp: ['#f2b42a', '#f5c14a', '#f7ce69', '#fada89', '#fce7a8', '#fff4c8'], need: { ach: 'hr_true_awaken' } },
  tr_abyss: { name: '심연', desc: '균열 너머 이계의 보랏빛 어둠', ramp: ['#6a28c8', '#7f45d3', '#9462de', '#aa7ee9', '#bf9bf4', '#d4b8ff'], need: { ach: 'st_end2' } },
  tr_frost: { name: '혹한', desc: '탑 꼭대기의 얼어붙은 바람', ramp: ['#2ab0e0', '#4ebfe6', '#73ceec', '#97ddf3', '#bcecf9', '#e0fbff'], need: { tower: 30 } },
  tr_ember: { name: '잿불', desc: '윤회의 재 속에서 다시 타오르는 불씨', ramp: ['#e05a18', '#e67330', '#ec8c48', '#f3a660', '#f9bf78', '#ffd890'], need: { ng: 1 } },
});
export const TRAIL_IDS = Object.freeze(Object.keys(TRAILS));
/** '직업 기본' (id null) 칸의 이름·설명 */
export const TRAIL_DEFAULT = Object.freeze({ name: '직업 기본', desc: '영웅마다의 원래 잔상 (필살기 색)' });

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const own = (o, k) => typeof k === 'string' && Object.hasOwn(o, k);

/** 고른 잔상 id (없음·모르는 id → null) */
export function trailId(meta) {
  const id = meta?.ach?.cos?.trail;
  return own(TRAILS, id) ? id : null;
}
/** 런타임 (feel_move.js dashFx): 고른 잔상의 6단 색 배열 또는 null (직업 기본). 할당 없음 — 대시 중 프레임마다 불러도 된다 */
export function trailRamp(meta) {
  const id = meta?.ach?.cos?.trail;
  return own(TRAILS, id) ? TRAILS[id].ramp : null;
}

/** 슬롯 세이브 하나의 지난 회차 수 (ngplus.js ngOf 와 같은 규칙 — 그 모듈을 끌어오지 않으려고 줄만 옮겼다) */
function ngOfState(s) {
  if (!isObj(s) || s.arcade || !isObj(s.ng)) return 0;
  const n = s.ng.n;
  return Number.isInteger(n) && n > 0 ? n : 0;
}
/**
 * 해금 판정 문맥 (화면을 열 때 한 번): meta + 슬롯 세이브들(saves.read(1..3) · 지금 game.state — null 이어도 된다)
 * → { got: {업적 id: ts}, tower: 탑 최고 층(난이도 중 최대), ng: 지난 회차 최대 }
 */
export function cosContext(meta, states = []) {
  const got = isObj(meta?.ach?.got) ? meta.ach.got : {};
  let tower = 0, ng = 0;
  const tb = isObj(meta?.towerBest) ? meta.towerBest : {};
  for (const k of Object.keys(tb)) { const f = tb[k]?.floor; if (typeof f === 'number' && Number.isFinite(f) && f > tower) tower = f; }
  for (const s of Array.isArray(states) ? states : []) ng = Math.max(ng, ngOfState(s));
  return { got, tower, ng };
}
/** need 가 참인가 */
export function needMet(need, ctx) {
  if (!isObj(need) || !ctx) return false;
  if (typeof need.ach === 'string') return own(ctx.got ?? {}, need.ach);
  if (typeof need.tower === 'number') return (ctx.tower ?? 0) >= need.tower;
  if (typeof need.ng === 'number') return (ctx.ng ?? 0) >= need.ng;
  return false;
}
/** 잔상을 쓸 수 있나 (null = 직업 기본은 늘 참) */
export function ownsTrail(id, ctx) {
  if (id === null) return true;
  return own(TRAILS, id) && needMet(TRAILS[id].need, ctx);
}
/**
 * 조건 글: short = 칸 오른쪽(짧게), long = 잠긴 칸을 골랐을 때 한 줄. achName(id) → 업적 이름 | null (숨긴 업적이면 '???' 를 돌려줄 것)
 */
export function needText(need, achName = () => null) {
  if (isObj(need) && typeof need.ach === 'string') {
    const n = achName(need.ach) ?? need.ach;
    return n === '???' ? { short: '숨겨진 업적', long: '숨겨진 업적을 달성하면 쓸 수 있습니다' } : { short: `업적 「${n}」`, long: `「${n}」 업적을 달성하면 쓸 수 있습니다` };
  }
  if (isObj(need) && typeof need.tower === 'number') return { short: `무한의 탑 ${need.tower}층`, long: `무한의 탑 ${need.tower}층을 돌파하면 쓸 수 있습니다` };
  if (isObj(need) && typeof need.ng === 'number') return { short: `${need.ng + 1}회차 시작`, long: `「피의 윤회」로 ${need.ng + 1}회차를 시작하면 쓸 수 있습니다` };
  return { short: '', long: '아직 얻지 못했습니다' };
}
/** meta.ach 에 고른 잔상을 적는다 (id: 'tr_…' | null). 모르는 id 면 false. 다른 외형 칸(앞으로의 망토 등)은 그대로 둔다 */
export function setTrail(ach, id) {
  if (!isObj(ach) || (id !== null && !own(TRAILS, id))) return false;
  if (!isObj(ach.cos)) ach.cos = {};
  ach.cos.trail = id;
  return true;
}
