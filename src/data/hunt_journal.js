// 「사냥 일지」 (Stage 6 HUNT) — 깬 스테이지를 다시 도는 이유: 날마다 3장 · 주마다 1장 바뀌는 사냥 계약. 순수 데이터 + 작은 계산 — import 없음 (node 에서 import 가능)
//  - 계약 종류 (kind): kill(스테이지에서 적 N 처치) · swift(스테이지를 T초 안에 클리어) · boss(보스를 쓰러지지 않고 처치) ·
//    hero(정한 영웅으로 보스 처치) · candle(스테이지에서 촛대 N개 부수기) · nm(주간: 악몽 토벌 한 줄 격파) · sweep(주간 예비: 이야기 스테이지 N번 클리어 — 같은 스테이지도 센다)
//  - 진행은 이야기 스테이지(world.mode 'story', 시련·아케이드·일일 도전 제외)와 악몽 토벌(nm)만 센다 — game/hunt_journal.js
//  - 보상 크기: data/quests.js 의 같은 장 부가 의뢰와 비슷하게 (골드 · 강화석 · 경험치), 주간은 약 2.5배
//  - 일지 점수(pts) → 사냥꾼 등급. 등급 4 「명사냥꾼」은 K1 장부(data/cosmetics.js need { hj: 500 } — 등급 문턱 점수)의 잔상 「사냥꾼」을 연다

/** 하루 일지 계약 수 · 주간 1 */
export const HUNT_DAILY = 3;
/** 계약 한 장의 일지 점수 */
export const HUNT_PTS = Object.freeze({ daily: 10, weekly: 40 });
/** 사냥꾼 등급 (점수 문턱 오름차순 — 첫 칸은 0) */
export const HUNT_RANKS = Object.freeze([
  { name: '견습 사냥꾼', pts: 0 },
  { name: '사냥꾼', pts: 50 },
  { name: '숙련 사냥꾼', pts: 150 },
  { name: '노련한 사냥꾼', pts: 300 },
  { name: '명사냥꾼', pts: 500 },
  { name: '전설의 사냥꾼', pts: 800 },
]);
/** 잔상 보상이 열리는 등급 (data/cosmetics.js tr_hunter need { hj }) */
export const HUNT_TRAIL_RANK = 4;
/** 일지 색 (토스트 · 게시판 강조) */
export const HUNT_COLOR = '#9fd86a';

/** 일일 계약 종류와 뽑기 무게 (주간은 nm → 없으면 sweep) */
export const HUNT_DAILY_KINDS = Object.freeze([['kill', 4], ['swift', 2], ['boss', 2], ['hero', 1], ['candle', 2]]);

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const fin = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
/** game/stats.js expToNext 와 같은 공식 (data/quests.js 처럼 사본 — 순환 import 회피) */
const expToNext = (l) => Math.floor(30 * Math.pow(l, 1.65) + 20 * l);
const round10 = (v) => Math.round(v / 10) * 10;
const stoneOf = (lv) => `m_stone_${Math.min(6, Math.max(1, Math.ceil(lv / 14)))}`;

/** 점수 → 등급 번호 (0 …) */
export function huntRankOf(pts) {
  const p = fin(pts);
  let r = 0;
  for (let i = 0; i < HUNT_RANKS.length; i++) if (p >= HUNT_RANKS[i].pts) r = i;
  return r;
}
/** 다음 등급까지 { cur, need, next: 이름|null } (마지막 등급이면 next null) */
export function huntRankNext(pts) {
  const r = huntRankOf(pts), n = HUNT_RANKS[r + 1];
  return n ? { cur: fin(pts) - HUNT_RANKS[r].pts, need: n.pts - HUNT_RANKS[r].pts, next: n.name } : { cur: 1, need: 1, next: null };
}

/**
 * 계약 보상 { gold, exp, items:[{id,qty}], pts } — lv = 계약 스테이지의 적 레벨 (STAGES[id].level)
 *  일일: 금화 200 + 레벨×40 · 경험치 = 다음 레벨까지의 30% · 강화석 1 / 주간: 금화 2.5배 · 경험치 80% · 강화석 2 + 축복 주문서 1
 */
export function huntReward(c) {
  const lv = Math.max(1, Math.min(120, Math.floor(fin(c?.lv, 1))));
  const weekly = c?.slot === 'w';
  const gold = round10((200 + lv * 40) * (weekly ? 2.5 : 1));
  const exp = round10(expToNext(lv) * (weekly ? 0.8 : 0.3));
  const items = [{ id: stoneOf(lv), qty: weekly ? 2 : 1 }];
  if (weekly) items.push({ id: 'm_scroll_bless', qty: 1 });
  return { gold, exp, items, pts: weekly ? HUNT_PTS.weekly : HUNT_PTS.daily };
}

/** 계약 목표 수 (need) — 진행이 need 이상이면 달성 */
export function huntNeed(c) {
  if (!isObj(c)) return 1;
  if (c.kind === 'kill' || c.kind === 'candle' || c.kind === 'sweep') return Math.max(1, Math.floor(fin(c.n, 1)));
  return 1;
}

/** 계약 제목 (짧게) · 목표 한 줄 — names = { stage(id), enemy(id), boss(id), hero(id) } 이름 찾기 (없으면 id) */
export function huntTitle(c) {
  switch (c?.kind) {
    case 'kill': return '토벌 계약';
    case 'swift': return '질주 계약';
    case 'boss': return '불굴의 계약';
    case 'hero': return '지명 계약';
    case 'candle': return '촛불 사냥';
    case 'nm': return '악몽 토벌 계약';
    case 'sweep': return '순회 계약';
  }
  return '사냥 계약';
}
export function huntGoal(c, names = {}) {
  const st = (id) => names.stage?.(id) ?? id;
  switch (c?.kind) {
    case 'kill': return `「${st(c.stage)}」에서 ${names.enemy?.(c.enemy) ?? c.enemy} ${c.n}마리 처치`;
    case 'swift': return `「${st(c.stage)}」${josa(st(c.stage), '을', '를')} ${fmtSec(c.t)} 안에 클리어`;
    case 'boss': return `「${st(c.stage)}」 보스를 한 번도 쓰러지지 않고 처치`;
    case 'hero': { const h = names.hero?.(c.hero) ?? c.hero; return `${h}${josaRo(h)} 「${st(c.stage)}」 보스 처치`; }
    case 'candle': return `「${st(c.stage)}」에서 촛대 ${c.n}개 부수기`;
    case 'nm': return `악몽 토벌 「${st(c.stage)}」 격파`;
    case 'sweep': return `이야기 스테이지 ${c.n}번 클리어`;   // [verifyA] 같은 스테이지를 다시 깨도 센다 → 「곳」이 아니라 「번」
  }
  return '';
}
/** 받침 있음 → a, 없음 → b (한글이 아니면 b) */
function josa(w, a, b) {
  const c = String(w ?? '').charCodeAt(String(w ?? '').length - 1);
  return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 ? a : b;
}
/** '으로/로' — ㄹ 받침도 '로' */
function josaRo(w) {
  const c = String(w ?? '').charCodeAt(String(w ?? '').length - 1);
  const j = c >= 0xac00 && c <= 0xd7a3 ? (c - 0xac00) % 28 : 0;
  return j && j !== 8 ? '으로' : '로';
}
/** 230 → '3분 50초' (질주 계약) */
export function fmtSec(t) {
  const s = Math.max(0, Math.round(fin(t)));
  const m = Math.floor(s / 60), r = s % 60;
  return m ? (r ? `${m}분 ${r}초` : `${m}분`) : `${r}초`;
}
