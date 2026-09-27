// 흑묘 여관 미니게임 공용 모듈 — owner: PLAT-GAMES (platform §6.2/§6.3/§5.1, WP-7)
//  - 게임 목록/규칙(GAMES), 방문 세션(session: 무료 판, 수익, 전적, 흑묘의 가호)
//  - 판돈·보상: 금화 지급, 확률 드롭(강화석/주문서) → addByBase, 'minigame' 이벤트, 통계, 자동 저장
//  - 마르타 대사 풀, 고딕 카지노 UI(패널·버튼·칩·금화 카운터), 코인 분수, 촛불/테이블 배경
//  - MiniGame 기본 장면: HUD(뒤로/제목/금화/판돈), 판돈 선택, 결과 팝업, '그만두기' 확인 창, 흔들림/플래시, 탭 영역 관리
//
// 화면·입력 계약 (여관과 미니게임 5종 공통):
//  - uiScale 장면: game.uiW × game.uiH (UI px) 로 배치한다 (휴대폰 740×360 → 888×432, 844×390 → 1013×468, 최소 720×400).
//    this.vw / this.vh 가 UI 크기다. 포인터도 UI 좌표 (game.syncPointer).
//  - 가상 패드는 scene 플래그 hidePad 로 숨긴다 (game.syncPad 가 유일한 주인). padPush/padPop/padHide 는 아무것도 하지 않는 옛 이름.
//  - 탭 영역: render 에서 this.hits.add(id, rect, disabled, kind) → ui.taps (owner = 장면, 터치 여유 영역 포함),
//    update 에서 this.hits.tapped(). 주 버튼 높이는 this.bh(기본) (= 44 CSS px 이상, tapMin).
//  - 메뉴 의미 입력만 읽는다: 결정 confirm (Z·Enter·패드 A) · 취소 cancel (X·Esc·패드 B) · 보조 alt (A 키·패드 Y) / alt2 (C 키·패드 LT)
//    · 방향. 패드 B 는 게임에선 대시지만 여기선 취소다.
//  - B / Esc (또는 START, ◀ 여관 버튼) 는 어느 게임에서나 '그만두기' 확인 창을 연다. 판이 진행 중이면 걸어 둔 판돈을 잃는다고 알리고,
//    그만두면 패배로 정산한 뒤 여관으로 돌아간다. 확인 창이 떠 있는 동안 게임 진행(타이머·릴·딜러)은 멈춘다.
//    결과 팝업에서는 B 가 곧 '여관으로' 버튼이다.
//  - 키 안내는 지금 기기의 글리프 (prompts.drawGlyph/drawHints: 키캡 / 패드 버튼 / 터치에선 숨김).
import { Scene } from '../../core/game.js';
import { input } from '../../core/input.js';
import { audio } from '../../core/audio.js';
import { assets } from '../../core/assets.js';
import { bus } from '../../core/events.js';
import { saves } from '../../core/save.js';
import { Particles } from '../../core/particles.js';
import { text, FONT, wrap, taps } from '../../core/ui.js';
import { drawGlyph, glyphWidth, drawHints, legacyKey } from '../../core/prompts.js';
import { clamp, rand, ease, fmt, TAU, pick } from '../../core/math.js';
import { ITEMS } from '../../data/items.js';
import { CHARACTERS } from '../../data/characters.js';
import { addByBase } from '../../game/inventory.js';
import { newGameState } from '../../game/state.js';
import { drawIcon } from '../../render/icons.js';
import { rr, glow, drawCoin, drawChip } from './art.js';

export const GOLD = '#e8c872', BONE = '#efe4cf', CRIMSON = '#b3122e', DIM = '#9d8f80';
export const BETS = [50, 100, 500, 1000];

// ───────────────────────── 게임 목록 ─────────────────────────
export const GAME_ORDER = ['dice', 'blackjack', 'slot', 'duel', 'memory'];
export const GAMES = {
  dice: {
    id: 'dice', scene: 'minigame_dice', name: '해골 주사위', sub: '하이 & 로우', accent: '#ff5a5a',
    rules: '뼈로 깎은 주사위 세 개를 굴립니다. 다음 굴림의 합이 지금보다 높을지 낮을지 맞히세요. 맞힐수록 배당이 곱해지고, 언제든 거둘 수 있어요. 트리플(같은 눈 셋)을 맞히면 한 방에 30배!',
    pays: ['높게·낮게: 확률 따라 ×1.02~×99', '트리플 적중: ×30 잭팟', '같은 합: 무승부, 다시 굴림'],
  },
  blackjack: {
    id: 'blackjack', scene: 'minigame_blackjack', name: '악마의 21', sub: '블랙잭', accent: '#ff3a5a',
    rules: '악마 딜러 마몬과 21을 겨룹니다. 21을 넘지 않고 딜러보다 높으면 승리. 처음 두 장이 21이면 블랙잭! 딜러는 17 이상에서 멈추고, 더블은 판돈을 두 배로 올린 뒤 딱 한 장만 받습니다.',
    pays: ['승리: 2배 지급', '블랙잭: 2.5배 (3:2)', '무승부: 판돈 반환'],
  },
  slot: {
    id: 'slot', scene: 'minigame_slot', name: '블러드 슬롯', sub: '3릴 · 5라인', accent: '#ff2040',
    rules: '레버를 당기면 세 릴이 돌아갑니다. 버튼을 누를 때마다 릴이 하나씩 멈춰요. 가로 세 줄과 대각선 두 줄 위에 같은 문양 셋이 나란히 서면 당첨! 가운데 줄에 피의 7 셋이면 잭팟입니다.',
    pays: ['해골 ×2 · 박쥐 ×3 · 하트 ×6', '십자가 ×12 · 달 ×30 · 성배 ×80', '피의 7 ×100 · 가운데 줄 ×250'],
  },
  duel: {
    id: 'duel', scene: 'minigame_duel', name: '황혼의 결투', sub: '3판 2선승 속사', accent: '#ff8a3a',
    rules: "해 질 녘 총잡이와 3판 2선승 결투. '준비…' 뒤에 '발사!'가 뜨는 순간 결정 버튼(또는 화면)을 누르세요. 신호 전에 쏘면 반칙패! 이길수록 더 빠른 총잡이가 도전해 옵니다.",
    pays: ['승리: ×1.8~×4 (상대 등급)', '무실점 완승: 주문서 확률', '※ 첫 번째 결투자는 제외'],
  },
  memory: {
    id: 'memory', scene: 'minigame_memory', name: '영혼의 카드', sub: '짝 맞추기', accent: '#8ab0ff',
    rules: '16장의 영혼 카드에서 같은 그림 두 장씩을 찾아 뒤집으세요. 제한 시간은 75초. 빨리 끝낼수록 배당이 커지고, 완벽한 기억력에는 특별한 선물이 따릅니다.',
    pays: ['25초 이내 ×4 · 35초 ×3', '50초 ×2 · 75초 ×1.2'],
  },
};

// ───────────────────────── 방문 세션 ─────────────────────────
export const session = {
  visit: 0, freeUsed: false, games: 0, wins: 0, net: 0, drops: {}, loseStreak: 0, last: null,
  catLuck: 0, catTaps: 0, lastGame: 'dice', lastBet: 100,
};
/** 여관에 새로 들어올 때 호출 */
export function newVisit() {
  Object.assign(session, { visit: session.visit + 1, freeUsed: false, games: 0, wins: 0, net: 0, drops: {}, loseStreak: 0, last: null, catLuck: 0, catTaps: 0 });
}

// ───────────────────────── 세이브 상태 ─────────────────────────
const TEST_STATES = new WeakSet();
/** game.state 가 없으면(단독 테스트) 임시 세이브 생성. 여관 전용 기록 공간 보정 */
export function ensureState(game) {
  if (!game.state) {
    const s = newGameState({ slot: 1 });
    s.gold = Math.max(s.gold, 5000);
    TEST_STATES.add(s);
    game.state = s;
  }
  const st = game.state;
  st.gold ??= 0;
  st.stats ??= {};
  st.stats.minigameWins ??= 0;
  st.innGames ??= {};
  const ig = st.innGames;
  ig.best ??= {}; ig.duelRank ??= 0; ig.catGift ??= false; ig.plays ??= 0; ig.jackpots ??= 0;
  return st;
}
export function autosave(game) {
  const st = game.state;
  if (!st || TEST_STATES.has(st) || game.settings?.autoSave === false) return;
  try { saves.write(st.slot ?? 1, st); } catch (e) { console.warn('[inn] save', e); }
}
export function record(st, key, val, mode = 'max') {
  const b = st.innGames.best;
  const cur = b[key];
  if (cur === undefined || (mode === 'max' ? val > cur : val < cur)) { b[key] = val; return true; }
  return false;
}

// ───────────────────────── 보상 ─────────────────────────
const DROP_INFO = {
  m_stone_1: ['하급 강화석', 'stone_1'], m_stone_2: ['중급 강화석', 'stone_2'], m_stone_3: ['상급 강화석', 'stone_3'],
  m_stone_4: ['최상급 강화석', 'stone_4'], m_stone_5: ['전설의 강화석', 'stone_5'], m_stone_6: ['신화의 강화석', 'stone_6'],
  m_scroll_protect: ['보호 주문서', 'scroll_protect'], m_scroll_bless: ['축복 주문서', 'scroll_bless'],
};
export const itemLabel = (id) => ITEMS[id]?.name ?? DROP_INFO[id]?.[0] ?? id;
export const itemIcon = (id) => ITEMS[id]?.icon ?? DROP_INFO[id]?.[1] ?? 'stone_1';
const betFactor = (bet) => (bet >= 1000 ? 1.8 : bet >= 500 ? 1.4 : bet >= 100 ? 1 : 0.6);

/**
 * 승리 시 드롭 추첨. tier: 'win' | 'big' | 'jackpot'
 * 기본(100G 기준): 20% 하급 · 10% 중급 · 4% 상급 · 1% 최상급 강화석. 판돈/큰 승리/흑묘의 가호로 배율.
 * 잭팟은 상급 이상 확정. perfect 는 보호 주문서 8%, 축복 주문서 5%.
 * scale: 일반 승리의 이익 비율(순이익/판돈, 0~1) — 거의 본전인 '안전한 승리'로 강화석을 캐는 것을 막는다.
 */
export function rollDrops({ tier = 'win', bet = 100, perfect = false, luck = 0, scale = 1 }) {
  const out = [];
  let m = betFactor(bet) * (1 + luck) * (tier === 'big' ? 1.7 : 1) * scale;
  if (tier === 'jackpot') {
    const r = Math.random();
    out.push(r < 0.08 ? 'm_stone_5' : r < 0.4 ? 'm_stone_4' : 'm_stone_3');
    m *= 1.5;
  }
  const r = Math.random();
  const p4 = 0.01 * m, p3 = p4 + 0.04 * m, p2 = p3 + 0.1 * m, p1 = p2 + 0.2 * m;
  if (r < p4) out.push('m_stone_4'); else if (r < p3) out.push('m_stone_3'); else if (r < p2) out.push('m_stone_2'); else if (r < p1) out.push('m_stone_1');
  if (perfect) {
    if (Math.random() < 0.08 * (1 + luck)) out.push('m_scroll_protect');
    if (Math.random() < 0.05 * (1 + luck)) out.push('m_scroll_bless');
  }
  return out;
}
/** 인벤토리에 지급 (아이템 정의가 없으면 건너뜀). 반환: [{id,name,icon,qty}] */
export function grantItems(st, ids) {
  const out = [];
  for (const id of ids) {
    let ok = null;
    try { ok = ITEMS[id] ? addByBase(st, id, 1) : null; } catch (e) { console.warn('[inn] addByBase', id, e); }
    if (!ok) continue;
    const ex = out.find((o) => o.id === id);
    if (ex) ex.qty++; else out.push({ id, name: itemLabel(id), icon: itemIcon(id), qty: 1 });
  }
  return out;
}
export function affordableBet(gold, pref = 100) {
  if (gold >= pref) return pref;
  for (let i = BETS.length - 1; i >= 0; i--) if (gold >= BETS[i]) return BETS[i];
  return BETS[0];
}

// ───────────────────────── 마르타 대사 ─────────────────────────
const LINES = {
  greet: [
    '어서 와요, {hero}! 오늘은 운이 따라 줄 얼굴인데요?',
    '흑묘 여관에 온 걸 환영해요. 술 한 잔? 아니면… 한 판?',
    '밖은 괴물 천지지만 여기선 주사위 소리뿐이죠. 편히 놀다 가요.',
    '까망이가 오늘따라 기분이 좋네요. 행운의 징조일지도?',
    '살아 돌아왔네요! 자, 긴장 풀고 한 판 어때요?',
  ],
  pick: {
    dice: ['해골 주사위는 간단해요. 높을까, 낮을까! 욕심만 조절하면 돼요.', '거둘 때를 아는 게 진짜 실력이랍니다.'],
    blackjack: ['저 딜러? 지옥에서 스카우트해 왔어요. 손버릇은 나빠도 규칙은 지켜요.', '17이면 멈추는 게 좋을걸요? …아마도요.'],
    slot: ['블러드 슬롯! 피의 7이 셋 뜨면 그날 밤은 제가 쏩니다!', '레버는 살살 당겨요. 저번에 누가 부러뜨렸거든요.'],
    duel: ["'발사!' 소리 전에 움직이면 끝이에요. 눈보다 손이 빨라야 해요.", '저 총잡이들, 다들 사연이 있어요. 이기면 들려줄게요.'],
    memory: ['영혼의 카드는 기억력 싸움! 빨리 맞출수록 보상이 커져요.', '카드마다 떠도는 영혼이 깃들어 있대요. 으스스하죠?'],
  },
  win: ['어머, 제법인데요?', '그 정도면 오늘 숙박비는 벌었네요!', '역시! 손끝에 감이 살아 있어요.', '호오~ 까망이도 박수 치는 중이에요.'],
  big: ['세상에! 오늘 제 금고가 울겠어요!', '와아, 소문나겠어요. 행운의 사냥꾼이 나타났다고!', '이 정도면 성 하나쯤 사도 되겠는데요?'],
  jackpot: ['잭팟이에요! 까망이도 벌떡 일어났다고요!', '말도 안 돼! 오늘 술값은 전부 제가 낼게요!'],
  lose: ['아이고, 아깝다! 다음 판엔 분명 올 거예요… 아마도?', '운도 체력처럼 회복된답니다. 한숨 돌려요.', '괜찮아요, 괴물 한 마리 더 잡으면 되죠!'],
  loseBy: {
    dice: ['주사위가 오늘 삐졌나 봐요. 살살 굴려 봐요.', '욕심은 해골도 삼킨답니다. 다음엔 일찍 거둬요!'],
    blackjack: ['마몬 녀석, 오늘 좀 독하네요. 제가 혼내 줄게요.', '21은 멀고 버스트는 가깝죠. 아깝다!'],
    slot: ['슬롯은 원래 밀당을 해요. 다음엔 올 거예요!', '릴이 한 칸만 더 돌았어도…!'],
    duel: ['손은 빨랐는데 운이 없었네요. 다시 겨뤄 봐요!', '총잡이들은 원래 성질이 급하답니다.'],
    memory: ['영혼들이 장난을 쳤나 봐요. 천천히, 차분하게!', '제 기억력도 요즘 깜빡깜빡해요. 호호.'],
  },
  forfeit: ['벌써 일어나요? 걸어 둔 금화는 제가 잘 챙겨 둘게요~', '중간에 그만두면 판돈은 여관 몫이에요. 다음엔 끝까지 해 봐요!'],
  push: ['비겼네요. 금화는 그대로! 한 판 더?'],
  streak: ['음… 오늘은 운이 영 아닌가 봐요. 무리하지 마요.', '잠깐 쉬어요. 따뜻한 수프라도 한 그릇 줄까요?'],
  free: ['첫 판은 제가 쏠게요! 대신 이겨도 돈은 안 나와요. 후훗.'],
  freeWin: ['잘했어요! 연습은 끝, 이제 진짜 금화를 걸어 볼까요?'],
  poor: ['어머, 주머니가 가벼워 보이네요. 성에서 금화 좀 주워 와요!', '외상은 안 돼요~ 금화가 모자라요.'],
  drop: ['그거 강화석 아니에요? 하드윈 영감이 보면 좋아하겠네요!', '반짝이는 게 나왔네요! 대장간에 들러 봐요.'],
  scroll: ['주문서까지?! 오늘 운이 하늘을 찌르네요!'],
  cat: ['어라, 까망이가 당신을 마음에 들어 하네요! 좋은 징조예요.', '까망이 괴롭히지 마요~ 할퀴어도 난 몰라요.', '그 녀석, 쓰다듬어 주면 행운을 물어 온대요.', '냐옹… 아, 제가 아니라 까망이가요!'],
  cat9: ['아홉 번이나?! 까망이가 뭘 물어 왔는데요… 이건 강화석이잖아요!'],
  catLuck: ['까망이의 가호! 다음 승리엔 뭔가 더 떨어질 거예요.'],
  leave: ['또 와요! 꼭 살아서 돌아와야 해요, 알았죠?'],
};
const lastLine = {};
export function line(kind, sub, state) {
  let pool = LINES[kind];
  if (sub && pool && !Array.isArray(pool)) pool = pool[sub];
  if (!Array.isArray(pool) || !pool.length) return '';
  let s = pick(pool);
  if (pool.length > 1 && s === lastLine[kind]) s = pool[(pool.indexOf(s) + 1) % pool.length];
  lastLine[kind] = s;
  const hero = CHARACTERS[state?.charId]?.name?.split(' ')[0] ?? '사냥꾼 양반';
  return s.replaceAll('{hero}', hero);
}
/** 결과 기록 → 마르타 반응 {text, mood} */
export function reactTo(rec, state) {
  if (!rec) return { text: line('greet', null, state), mood: 'idle' };
  if (rec.forfeit) return { text: line('forfeit'), mood: 'idle' };
  if (rec.items?.some((i) => i.id.startsWith('m_scroll'))) return { text: line('scroll'), mood: 'wow' };
  if (rec.free) return { text: rec.win ? line('freeWin') : line('lose'), mood: rec.win ? 'happy' : 'sad' };
  if (rec.tier === 'jackpot') return { text: line('jackpot'), mood: 'wow' };
  if (rec.tier === 'push') return { text: line('push'), mood: 'idle' };
  if (rec.win && rec.items?.length) return { text: line('drop'), mood: 'happy' };
  if (rec.tier === 'big') return { text: line('big'), mood: 'wow' };
  if (rec.win) return { text: line('win'), mood: 'happy' };
  if (session.loseStreak >= 3) return { text: line('streak'), mood: 'sad' };
  return { text: Math.random() < 0.6 ? line('loseBy', rec.game) || line('lose') : line('lose'), mood: 'sad' };
}

// ───────────────────────── 가상 패드 (옛 이름) ─────────────────────────
// 예전에는 DOM #touch 를 직접 숨겼다. 이제 가상 패드 표시는 game.syncPad 가 유일한 주인이고 장면은 this.hidePad = true 로 알린다
// (여관·미니게임 장면은 생성자에서 켠다; platform §5.1). 아래 셋은 옛 호출부 호환용으로 아무것도 하지 않는다.
export function padPush() { /* no-op: scene.hidePad */ }
export function padPop() { /* no-op: scene.hidePad */ }
export function padHide() { /* no-op: scene.hidePad */ }

// ───────────────────────── 화면 크기 도우미 ─────────────────────────
/** 장면 좌표 1 px 이 몇 CSS px 인가 (uiScale 이면 uiK 포함) */
export function cssPer(sc) {
  const g = sc.game;
  return Math.max(0.2, (g.cssScale || 1) * (sc.uiScale ? g.uiK || 1 : 1));
}
/** 44 CSS px (+2 여유) 를 이 장면 좌표로 — 주 버튼 최소 높이 (platform §6.3) */
export function tapMinOf(sc) { return Math.ceil(46 / cssPer(sc)); }

// ───────────────────────── 탭 영역 ─────────────────────────
/**
 * 장면 하나의 탭 영역. render 에서 add → ui.taps (owner = 장면; 터치 여유 영역·?debug=taps·QA 감사), update 에서 tapped().
 * kind: 'primary' 주 버튼 44 · 'list' 36 · 'icon' 44×44 · 'dense' 28 (CSS px, platform §6.3)
 */
export class Hits {
  constructor(owner = null) { this.owner = owner; this.rects = new Map(); }
  clear() { /* ui.taps 는 그리기(rAF)마다 새 묶음이다 */ }
  /** 재사용 사각형 */
  rect(id, x, y, w, h) {
    let r = this.rects.get(id);
    if (!r) { r = { x, y, w, h }; this.rects.set(id, r); }
    r.x = x; r.y = y; r.w = w; r.h = h;
    return r;
  }
  add(id, r, disabled = false, kind = 'primary') {
    if (r && r.w > 0 && r.h > 0) taps.add(id, r, { owner: this.owner, kind, disabled: !!disabled, src: 'games' });
    return r;
  }
  /** 이번 스텝에 탭된 id (나중에 등록된 것이 위) */
  tapped() { return taps.hit(this.owner); }
  over(r) { const p = input.pointer; return p.active && !input.touchMode && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h; }
  pressed(r) { const p = input.pointer; return p.down && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h; }
}

/** 키 안내 줄 (지금 기기의 글리프; 터치 모드에서는 그리지 않는다). items = [[액션|액션[]|'dpadH'…, '라벨'], …] */
export function keyHints(ctx, items, x, y, { align = 'left', size = 12, color = '#c8b490' } = {}) {
  if (input.touchMode) return x;
  try { return drawHints(ctx, items, x, y, { align, size, color }); } catch (e) { return x; }
}
/** 버튼 모서리 글리프 (없거나 터치 모드면 0) */
function keyBadge(c, key, right, top) {
  if (!key || input.touchMode) return 0;
  const act = legacyKey(key);
  let w = 0;
  try { w = glyphWidth(act, 18); } catch { w = 0; }
  if (!(w > 0)) return 0;
  drawGlyph(c, act, right - w + 5, top - 9, 18);
  return w;
}

// ───────────────────────── UI 위젯 ─────────────────────────
/** 금빛 그라데이션 제목 글자 */
export function goldText(c, str, x, y, size, { align = 'center', family = FONT.title, weight = 800, glowCol = null, ow = 5, top = '#fff6d0', mid = '#e8c872', bot = '#9a7030', maxWidth } = {}) {
  c.save();
  c.font = `${weight} ${size}px ${family}`;
  c.textAlign = align; c.textBaseline = 'alphabetic';
  c.lineJoin = 'round';
  if (maxWidth) {
    // 너무 길면 가로로만 줄인다 (정렬 기준점 x 를 중심으로)
    const w = c.measureText(str).width;
    if (w > maxWidth) { c.translate(x, y); c.scale(maxWidth / w, 1); c.translate(-x, -y); }
  }
  if (glowCol) { c.shadowColor = glowCol; c.shadowBlur = size * 0.5; }
  c.lineWidth = ow; c.strokeStyle = '#1a0a06'; c.strokeText(str, x, y);
  c.shadowBlur = 0;
  const g = c.createLinearGradient(0, y - size * 0.85, 0, y + size * 0.1);
  g.addColorStop(0, top); g.addColorStop(0.55, mid); g.addColorStop(1, bot);
  c.fillStyle = g; c.fillText(str, x, y);
  c.restore();
}

/** 고딕 유리 패널 (둥근 모서리, 금 이중 테두리, 모서리 장식) */
export function gPanel(c, x, y, w, h, { a = 0.84, edge = '#8a6a34', glowCol = null, r = 10, orn = true } = {}) {
  c.save();
  const g = c.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, `rgba(30,14,30,${a})`); g.addColorStop(1, `rgba(8,4,10,${Math.min(1, a + 0.08)})`);
  rr(c, x, y, w, h, r);
  if (glowCol) { c.shadowColor = glowCol; c.shadowBlur = 18; }
  c.fillStyle = g; c.fill();
  c.shadowBlur = 0;
  c.lineWidth = 2; c.strokeStyle = edge; c.stroke();
  rr(c, x + 5, y + 5, w - 10, h - 10, Math.max(2, r - 4));
  c.lineWidth = 1; c.strokeStyle = 'rgba(232,200,114,0.2)'; c.stroke();
  // 위쪽 은은한 광택
  c.globalCompositeOperation = 'lighter';
  const sh = c.createLinearGradient(0, y, 0, y + Math.min(40, h * 0.3));
  sh.addColorStop(0, 'rgba(255,220,160,0.08)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = sh; rr(c, x + 2, y + 2, w - 4, Math.min(40, h * 0.3), r); c.fill();
  c.globalCompositeOperation = 'source-over';
  if (orn) {
    c.fillStyle = GOLD;
    for (const [cx, cy, sx, sy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) {
      c.save(); c.translate(cx + sx * 3, cy + sy * 3);
      c.beginPath(); c.moveTo(0, -4); c.lineTo(4, 0); c.lineTo(0, 4); c.lineTo(-4, 0); c.fill();
      c.strokeStyle = 'rgba(232,200,114,0.55)'; c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(sx * 7, 0); c.quadraticCurveTo(sx * 14, sy * 1, sx * 20, sy * 5); c.moveTo(0, sy * 7); c.quadraticCurveTo(sx * 1, sy * 14, sx * 5, sy * 20); c.stroke();
      c.restore();
    }
  }
  c.restore();
}

const TONES = {
  crimson: ['#a0142e', '#4a0612', '#ff5060'],
  gold: ['#c8962a', '#5a3a0a', '#ffe070'],
  dark: ['#2a1a30', '#0c060e', '#c8a0ff'],
  teal: ['#1a6a60', '#062a26', '#6affd8'],
  purple: ['#5a2a8a', '#1a0a2a', '#c080ff'],
  blue: ['#244a8a', '#0a1830', '#8ac8ff'],
};
/**
 * 큰 버튼 (터치 우선). 반환 없음 — 탭 판정은 Hits 로.
 * o: {tone, hot, pressed, disabled, size, sub, key, t, pulse}
 *    key: 모서리에 그릴 글리프 — 액션 이름('confirm'·'cancel'·'alt'…) 또는 예전 키 글자('Z'·'X'…; legacyKey 로 액션이 된다)
 */
export function drawBtn(c, r, label, o = {}) {
  const tone = TONES[o.tone || 'crimson'];
  const hot = !!o.hot && !o.disabled, pr = !!o.pressed && !o.disabled;
  c.save();
  if (o.disabled) c.globalAlpha *= 0.45;
  const y = r.y + (pr ? 2 : 0);
  // 그림자
  c.fillStyle = 'rgba(0,0,0,0.5)'; rr(c, r.x + 1, r.y + 4, r.w, r.h, 9); c.fill();
  if (hot || o.pulse) {
    const k = o.pulse ? 0.45 + 0.35 * Math.sin((o.t ?? 0) * 6) : 0.7;
    c.save(); c.shadowColor = tone[2]; c.shadowBlur = 16; c.globalAlpha *= k;
    rr(c, r.x, y, r.w, r.h, 9); c.fillStyle = tone[0]; c.fill(); c.restore();
  }
  const g = c.createLinearGradient(0, y, 0, y + r.h);
  g.addColorStop(0, pr ? tone[1] : tone[0]); g.addColorStop(1, pr ? tone[0] : tone[1]);
  rr(c, r.x, y, r.w, r.h, 9); c.fillStyle = g; c.fill();
  c.lineWidth = hot ? 2.2 : 1.6; c.strokeStyle = hot ? '#ffe7a0' : '#8a6a34'; c.stroke();
  // 윗면 광택
  c.fillStyle = 'rgba(255,240,220,0.12)'; rr(c, r.x + 3, y + 3, r.w - 6, r.h * 0.42, 7); c.fill();
  const size = o.size ?? 18;
  const ly = y + r.h / 2 + (o.sub ? -4 : size * 0.36);
  text(c, label, r.x + r.w / 2, ly, { size, align: 'center', weight: 800, color: hot ? '#fff8e0' : '#f3e6cc', ow: 3, maxWidth: r.w - 10 });
  if (o.sub) text(c, o.sub, r.x + r.w / 2, ly + size * 0.5 + 9, { size: 12, align: 'center', weight: 700, color: hot ? '#ffe7a0' : '#c8b490', ow: 2, maxWidth: r.w - 8 });
  keyBadge(c, o.key, r.x + r.w, y);
  c.restore();
}

/** 금화 수치 표시 판 */
export function goldPlaque(c, x, y, w, value, t = 0, flash = 0) {
  gPanel(c, x, y, w, 40, { a: 0.8, r: 20, orn: false, edge: flash > 0 ? '#ffe7a0' : '#8a6a34' });
  drawCoin(c, x + 22, y + 20, 11, t * 2.2);
  if (flash > 0) glow(c, x + w / 2, y + 20, w * 0.6, '#ffd060', flash * 0.5);
  text(c, fmt(value), x + w - 34, y + 28, { size: 21, align: 'right', weight: 900, family: FONT.num, color: '#ffe7a0', ow: 4 });
  text(c, 'G', x + w - 16, y + 28, { size: 14, align: 'right', weight: 800, family: FONT.num, color: '#c8a050', ow: 3 });
}

/** 금화 카운터 (굴러 올라가는 숫자) */
export class Roller {
  constructor(v = 0) { this.shown = v; this.tick = 0; this.flash = 0; }
  update(dt, target, sfx = true) {
    const d = target - this.shown;
    this.flash = Math.max(0, this.flash - dt * 2);
    if (Math.abs(d) < 0.5) { this.shown = target; return; }
    const step = Math.sign(d) * Math.max(Math.abs(d) * Math.min(1, dt * 5), Math.min(Math.abs(d), 60 * dt));
    this.shown += step;
    if (d > 0) {
      this.flash = 1;
      if (sfx) { this.tick -= dt; if (this.tick <= 0) { audio.sfx('coin', { vol: 0.3, pitch: 1 + Math.random() * 0.3 }); this.tick = 0.075; } }
    }
  }
  get value() { return Math.round(this.shown); }
}

// ───────────────────────── 코인 분수 ─────────────────────────
export class Coins {
  constructor(max = 150) { this.list = []; this.max = max; }
  clear() { this.list.length = 0; }
  burst(x, y, n, { spread = 1, up = 760, floor = null, delay = 0 } = {}) {
    for (let i = 0; i < n && this.list.length < this.max; i++) {
      this.list.push({ x, y, vx: rand(-280, 280) * spread, vy: -rand(up * 0.55, up), s: rand(0, TAU), vs: rand(9, 18) * (Math.random() < 0.5 ? -1 : 1), r: rand(6.5, 10.5), life: rand(1.5, 2.3), max: 2.3, floor, bounce: 0, wait: delay * Math.random() });
    }
  }
  rain(w, n, floor = null) {
    for (let i = 0; i < n && this.list.length < this.max; i++) {
      this.list.push({ x: rand(0, w), y: rand(-160, -20), vx: rand(-40, 40), vy: rand(100, 300), s: rand(0, TAU), vs: rand(8, 16), r: rand(7, 11), life: rand(2, 2.8), max: 2.8, floor, bounce: 0, wait: rand(0, 0.8) });
    }
  }
  update(dt) {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      if (p.wait > 0) { p.wait -= dt; continue; }
      p.life -= dt;
      if (p.life <= 0 || p.y > 700) { L[i] = L[L.length - 1]; L.pop(); continue; }
      p.vy += 1500 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.s += p.vs * dt;
      if (p.floor !== null && p.y > p.floor && p.vy > 0 && p.bounce < 2) { p.y = p.floor; p.vy *= -0.38; p.vx *= 0.6; p.bounce++; }
    }
  }
  draw(c) {
    for (const p of this.list) {
      if (p.wait > 0) continue;
      c.globalAlpha = clamp(p.life / 0.4, 0, 1);
      drawCoin(c, p.x, p.y, p.r, p.s);
    }
    c.globalAlpha = 1;
  }
}

// ───────────────────────── 배경 · 소품 ─────────────────────────
/** 여관 그림을 어둡게 깔고 난롯불 일렁임 + 비네팅 */
export function innBackdrop(c, vw, vh, t, dim = 0.62, oy = 0.72) {
  const img = assets.get('bg/inn');
  if (img) {
    const s = Math.max(vw / img.width, vh / img.height);
    const dw = img.width * s, dh = img.height * s;
    c.drawImage(img, (vw - dw) / 2, (vh - dh) * oy, dw, dh);
  } else {
    const g = c.createLinearGradient(0, 0, 0, vh);
    g.addColorStop(0, '#1a0c10'); g.addColorStop(1, '#060208');
    c.fillStyle = g; c.fillRect(0, 0, vw, vh);
  }
  c.fillStyle = `rgba(6,2,8,${dim})`; c.fillRect(0, 0, vw, vh);
  const fl = 0.8 + 0.12 * Math.sin(t * 7.3) + 0.08 * Math.sin(t * 13.1);
  glow(c, vw * 0.42, vh * 0.55, vh * 0.7, '#ff7a2a', 0.12 * fl);
  vignetteSoft(c, vw, vh, 0.75);
}
export function vignetteSoft(c, w, h, a = 0.7) {
  const g = c.createRadialGradient(w / 2, h * 0.5, h * 0.3, w / 2, h * 0.5, h * 0.95);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${a})`);
  c.fillStyle = g; c.fillRect(0, 0, w, h);
}
/** 펠트 테이블 (위에서 비스듬히 본 둥근 사각형: 나무 테두리 + 펠트) */
export function feltTable(c, x, y, w, h, { felt = '#5a0a1c', felt2 = '#22040c', wood = '#4a2a16', r = 60 } = {}) {
  c.save();
  c.fillStyle = 'rgba(0,0,0,0.55)'; rr(c, x - 4, y + 10, w + 8, h + 8, r + 6); c.fill();
  const wg = c.createLinearGradient(0, y - 16, 0, y + h + 16);
  wg.addColorStop(0, '#8a5a30'); wg.addColorStop(0.15, wood); wg.addColorStop(1, '#1a0c06');
  rr(c, x - 16, y - 16, w + 32, h + 32, r + 14); c.fillStyle = wg; c.fill();
  c.lineWidth = 2; c.strokeStyle = '#0c0604'; c.stroke();
  c.strokeStyle = 'rgba(232,200,114,0.45)'; c.lineWidth = 1.5;
  rr(c, x - 9, y - 9, w + 18, h + 18, r + 8); c.stroke();
  const fg = c.createRadialGradient(x + w / 2, y + h * 0.35, 10, x + w / 2, y + h * 0.5, Math.max(w, h) * 0.7);
  fg.addColorStop(0, felt); fg.addColorStop(1, felt2);
  rr(c, x, y, w, h, r); c.fillStyle = fg; c.fill();
  // 펠트 결
  c.save(); rr(c, x, y, w, h, r); c.clip();
  c.globalAlpha = 0.05; c.strokeStyle = '#fff'; c.lineWidth = 1;
  c.beginPath();
  for (let i = -h; i < w; i += 9) { c.moveTo(x + i, y); c.lineTo(x + i + h, y + h); }
  c.stroke();
  c.restore();
  c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,0.5)'; rr(c, x + 1, y + 1, w - 2, h - 2, r); c.stroke();
  c.restore();
}
/** 촛불 (x,y = 초 바닥) */
export function candle(c, x, y, h, t, seed = 0) {
  const w = h * 0.26;
  const g = c.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
  g.addColorStop(0, '#b8a888'); g.addColorStop(0.4, '#f4ecd8'); g.addColorStop(1, '#8a7a60');
  c.fillStyle = g; rr(c, x - w / 2, y - h, w, h, w * 0.3); c.fill();
  c.fillStyle = '#f4ecd8';
  c.beginPath(); c.ellipse(x + w * 0.3, y - h * 0.7, w * 0.12, h * 0.16, 0, 0, TAU); c.fill();
  const fl = Math.sin(t * 9 + seed) * 0.5 + Math.sin(t * 17 + seed * 2) * 0.3;
  const fx = x + fl * 1.2, fy = y - h - 2;
  glow(c, fx, fy - h * 0.2, h * 2.2, '#ff9a3a', 0.28 + fl * 0.04);
  c.save(); c.globalCompositeOperation = 'lighter';
  const fg = c.createRadialGradient(fx, fy - h * 0.12, 0, fx, fy - h * 0.12, h * 0.34);
  fg.addColorStop(0, '#fffbe0'); fg.addColorStop(0.5, '#ffb040'); fg.addColorStop(1, 'rgba(255,80,0,0)');
  c.fillStyle = fg;
  c.beginPath(); c.moveTo(fx, fy - h * 0.46); c.quadraticCurveTo(fx + h * 0.16, fy - h * 0.08, fx, fy + h * 0.02); c.quadraticCurveTo(fx - h * 0.16, fy - h * 0.08, fx, fy - h * 0.46); c.fill();
  c.restore();
}

/** 마르타 얼굴 원형 초상 (결과 팝업·말풍선용) */
export function martaFace(c, x, y, r, mood = 'idle', t = 0) {
  const img = assets.get('portraits/npc_marta');
  c.save();
  const bob = mood === 'happy' || mood === 'wow' ? Math.abs(Math.sin(t * 8)) * -3 : 0;
  c.translate(x, y + bob);
  c.fillStyle = 'rgba(0,0,0,0.5)'; c.beginPath(); c.arc(1, 3, r + 3, 0, TAU); c.fill();
  c.beginPath(); c.arc(0, 0, r, 0, TAU); c.save(); c.clip();
  if (img) {
    const sw = img.width * 0.42, sx = img.width * 0.47 - sw / 2, sy = img.height * 0.33 - sw / 2;
    c.drawImage(img, sx, sy, sw, sw, -r, -r, r * 2, r * 2);
  } else { c.fillStyle = '#3a2418'; c.fillRect(-r, -r, r * 2, r * 2); }
  c.restore();
  c.lineWidth = 3; c.strokeStyle = GOLD; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.stroke();
  c.lineWidth = 1; c.strokeStyle = '#3a2408'; c.beginPath(); c.arc(0, 0, r + 2, 0, TAU); c.stroke();
  c.restore();
}

/** 말풍선 (꼬리 방향 tail: 'left'|'right'|'up'|'down', tx,ty 꼬리 끝) */
export function bubble(c, x, y, w, h, tail, tx, ty) {
  c.save();
  c.fillStyle = 'rgba(0,0,0,0.4)'; rr(c, x + 2, y + 4, w, h, 12); c.fill();
  const g = c.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, '#f8f0dc'); g.addColorStop(1, '#e0d0ae');
  c.fillStyle = g;
  rr(c, x, y, w, h, 12); c.fill();
  c.beginPath();
  if (tail === 'left') { c.moveTo(x + 2, y + h * 0.4); c.lineTo(tx, ty); c.lineTo(x + 2, y + h * 0.4 + 16); }
  else if (tail === 'right') { c.moveTo(x + w - 2, y + h * 0.4); c.lineTo(tx, ty); c.lineTo(x + w - 2, y + h * 0.4 + 16); }
  else if (tail === 'up') { c.moveTo(tx - 10, y + 2); c.lineTo(tx, ty); c.lineTo(tx + 10, y + 2); }
  else { c.moveTo(tx - 10, y + h - 2); c.lineTo(tx, ty); c.lineTo(tx + 10, y + h - 2); }
  c.fill();
  c.lineWidth = 2; c.strokeStyle = '#6a4a24'; rr(c, x, y, w, h, 12); c.stroke();
  c.restore();
}
/** 말풍선 안 글자 (줄바꿈, 타자 효과 n글자까지). 줄 수가 넘치면 마지막 줄 끝을 '…' 로 */
export function bubbleText(c, str, x, y, maxW, size = 15, n = 9999, maxLines = 4) {
  const lines = wrap(c, str, maxW, size, 600);
  let left = n;
  const cut = lines.length > maxLines;
  for (let i = 0; i < Math.min(lines.length, maxLines); i++) {
    let l = lines[i];
    if (cut && i === maxLines - 1) l = l.replace(/.$/, '…');
    const s = left >= l.length ? l : l.slice(0, Math.max(0, left));
    left -= l.length;
    if (s) text(c, s, x, y + i * size * 1.42, { size, weight: 600, color: '#2a1408', ow: 0 });
    if (left <= 0) break;
  }
}

// ───────────────────────── 기본 장면 ─────────────────────────
/**
 * 미니게임 공통 장면. 하위 클래스가 구현:
 *  init(params) · step(dt, tap)(입력·진행) · animate(dt)(연출 타이머, 결과 팝업 중에도 호출) · draw(ctx) · startRound() · onAgain()
 *  (선택) quitNote() → 그만두기 확인 창에 덧붙일 한 줄 · backBlocked() → 이번 취소 입력이 게임 조작이기도 하면 true (결투의 X = 발사)
 *  this.phase: 'ready'(판돈 선택) | 게임별 진행 단계 | 'result'
 * 정산: this.settle({win, payout, tier, perfect, title, sub, popup})
 * 배치: UI 좌표 (this.vw × this.vh). 주 버튼 높이는 this.bh(기본).
 */
export class MiniGame extends Scene {
  constructor(g, id) {
    super(g);
    this.id = id; this.info = GAMES[id];
    this.uiScale = true;   // platform §6.2: game.render 가 ctx.scale(uiK) 안에서 그린다
    this.hidePad = true;   // platform §5.1: 가상 패드 숨김 (화면 버튼·탭으로 조작)
    this.hits = new Hits(this);
    this.fx = new Particles(600);
    this.coins = new Coins(160);
    this.quit = null;
  }
  get st() { return this.game.state; }
  /** UI 좌표 화면 크기 */
  get vw() { return this.game.uiW || this.game.viewW; }
  get vh() { return this.game.uiH || this.game.viewH; }
  /** 주 버튼 최소 높이 (44 CSS px) */
  get tapMin() { return tapMinOf(this); }
  bh(base = 46) { return Math.max(base, this.tapMin); }
  /** 좁은 화면 (UI 높이 500 미만: 휴대폰) */
  get compact() { return this.vh < 500; }
  /** 판이 진행 중인가 (판돈이 걸려 있다) */
  get inRound() { return !this.result && this.phase !== 'ready' && this.phase !== 'result'; }
  enter(p = {}) {
    ensureState(this.game);
    this.fromInn = !!p.fromInn;
    this.bet = affordableBet(this.st.gold, p.bet ?? session.lastBet ?? 100);
    this.free = !!p.free && !session.freeUsed;
    this.roundFree = false; this.roundBet = 0;
    this.goldR = new Roller(this.st.gold);
    this.phase = 'ready';
    this.result = null;
    this.quit = null;
    this.shakeT = 0; this.shakeMag = 0; this.flashA = 0; this.flashCol = '#fff';
    this.leaving = false;
    this.clock = 0;
    this.betPop = null;
    audio.music('minigame');
    assets.preload(['bg/inn', 'portraits/npc_marta']);
    this.init?.(p);
  }
  exit() { this.quit = null; }

  // ── 판돈 ──
  betOptions() { return !session.freeUsed ? [0, ...BETS] : BETS; }
  get betValue() { return this.free ? 0 : this.bet; }
  setBet(v) {
    if (v === 0) { if (session.freeUsed) return; this.free = true; }
    else { if (this.st.gold < v) { this.poor(); return; } this.free = false; this.bet = v; session.lastBet = v; }
    audio.sfx('menu_move');
  }
  cycleBet(d) {
    const opts = this.betOptions();
    let i = opts.indexOf(this.betValue);
    for (let k = 0; k < opts.length; k++) {
      i = clamp(i + d, 0, opts.length - 1);
      const v = opts[i];
      if (v === 0 || this.st.gold >= v) { this.setBet(v); return; }
    }
  }
  poor() { this.game.toast('금화가 모자라요!', '#ff8080'); audio.sfx('menu_cancel'); }
  /** 판돈 차감. 성공 여부 */
  takeBet() {
    if (this.free && !session.freeUsed) {
      session.freeUsed = true; this.roundFree = true; this.roundBet = 0;
      audio.sfx('coin_insert');
      return true;
    }
    this.free = false; this.roundFree = false;
    if (this.st.gold < this.bet) { this.poor(); return false; }
    this.st.gold -= this.bet; session.net -= this.bet; this.roundBet = this.bet;
    this.st.innGames.plays++;
    audio.sfx('coin_insert');
    // 차감 표시는 금화 판 바로 왼쪽에서 살짝 떠올랐다 사라진다 (파티클 글자는 중력으로 흘러내려 옆 패널 제목을 가렸다)
    this.betPop = { str: `-${fmt(this.bet)}`, t: 0 };
    return true;
  }
  /** 추가 판돈 (블랙잭 더블 등) */
  takeExtra(n) {
    if (this.roundFree) return true;
    if (this.st.gold < n) { this.poor(); return false; }
    this.st.gold -= n; session.net -= n; this.roundBet += n;
    audio.sfx('coin_insert');
    return true;
  }

  // ── 정산 ──
  settle({ win, payout = 0, tier, perfect = false, title, sub, popup = true, delay = 0.5, cx, cy, quiet = false, forfeit = false } = {}) {
    tier ??= win ? 'win' : 'lose';
    const st = this.st, free = this.roundFree;
    const gold = free ? 0 : Math.max(0, Math.round(payout));
    if (gold > 0) { st.gold += gold; session.net += gold; }
    let items = [];
    if (win && !free) {
      const luck = session.catLuck;
      const scale = tier === 'win' ? clamp(gold / Math.max(1, this.roundBet) - 1, 0, 1) : 1;
      items = grantItems(st, rollDrops({ tier, bet: this.roundBet, perfect, luck, scale }));
      session.catLuck = 0;
    }
    if (win) { st.stats.minigameWins = (st.stats.minigameWins ?? 0) + 1; session.wins++; session.loseStreak = 0; }
    else if (tier !== 'push') session.loseStreak++;
    if (tier === 'jackpot') st.innGames.jackpots++;
    session.games++;
    for (const it of items) session.drops[it.id] = (session.drops[it.id] ?? 0) + it.qty;
    const rec = { game: this.id, win: !!win, tier, payout: gold, bet: this.roundBet, net: gold - this.roundBet, items, free, perfect, forfeit: !!forfeit };
    session.last = rec;
    bus.emit('minigame', { game: this.id, win: !!win, reward: { gold, items: items.map((i) => i.id), tier, perfect, free } });
    autosave(this.game);
    this.roundFree = false; this.roundBet = forfeit ? 0 : this.roundBet;
    if (free) this.free = false;
    this.bet = affordableBet(st.gold, this.bet);
    const react = reactTo(rec, st);
    rec.line = react.text; rec.mood = react.mood;
    this.result = popup ? { ...rec, title: title ?? DEFAULT_TITLE[tier], sub, t: -delay, shown: 0, line: react.text, mood: react.mood } : null;
    if (popup) this.phase = 'result';
    if (forfeit) return rec;
    // 연출
    const x = cx ?? this.vw / 2, y = cy ?? this.vh * 0.45;
    if (tier === 'jackpot') {
      this.flash('#fff2b0', 0.9); this.shake(12, 0.6);
      audio.sfx('slot_win'); audio.sfx('extra_life', { vol: 0.8 });
      this.coins.burst(x, y, 70, { spread: 1.4, up: 1000 }); this.coins.rain(this.vw, 50);
      this.fx.burst('holy', x, y, 40, { speed: 380 }); this.fx.ring(x, y, { color: '#fff2b0', r0: 20, r1: 320, life: 0.7, width: 8 });
    } else if (win) {
      audio.sfx('win');
      const n = clamp(Math.round((gold / Math.max(1, this.roundBet)) * 7), 8, 55);
      if (gold > 0) this.coins.burst(x, y, n, { up: tier === 'big' ? 950 : 760 }); else this.fx.burst('gold', x, y, 24, { speed: 260 });
      this.fx.burst('gold', x, y, 20, { speed: 300 });
      if (tier === 'big') { this.flash('#ffe7a0', 0.5); this.shake(7, 0.4); this.fx.ring(x, y, { color: '#ffd060', r0: 20, r1: 240, life: 0.5, width: 6 }); }
    } else if (tier === 'push') {
      audio.sfx('menu_ok');
    } else if (!quiet) {
      audio.sfx('lose'); this.shake(5, 0.3);
      this.fx.burst('smoke', x, y, 10, { speed: 60 });
    }
    if (!popup) for (const it of items) this.game.toast(`획득: ${it.name} ×${it.qty}`, '#ffe070');
    return rec;
  }
  shake(m, t) { this.shakeMag = Math.max(this.shakeMag, m * (this.game.settings?.screenShake ?? 1)); this.shakeT = Math.max(this.shakeT, t); }
  /** 화면 번쩍임 — 설정 flashFx(0/0.5/1)와 상한 0.7 을 따른다 (feel §4.9 광과민 대책) */
  flash(col, a) {
    const k = Number(this.game.settings?.flashFx ?? 1);
    const v = Math.min(0.7, a * (Number.isFinite(k) ? clamp(k, 0, 1) : 1));
    if (!(v > 0)) return;
    this.flashCol = col; this.flashA = Math.max(this.flashA, v);
  }

  // ── 나가기 ──
  canLeave() { return !this.inRound; }
  /** 취소 입력 (B·X·Esc·Backspace, 또는 START·Esc 의 menu — Enter 는 결정이라 제외) */
  backPressed() { return input.pressed('cancel') || (input.pressed('menu') && !input.pressed('confirm')); }
  /** 이번 취소 입력이 게임 조작이기도 한가 (하위 클래스: 결투의 X 키 = 발사) */
  backBlocked() { return false; }
  /** '그만두기' 확인 창을 연다 */
  openQuit() {
    if (this.leaving || this.quit) return;
    const stake = this.inRound;
    this.quit = { t: 0, sel: stake ? 1 : 0, stake };
    audio.sfx('menu_move');
  }
  closeQuit(yes) {
    const Q = this.quit;
    this.quit = null;
    if (!Q) return;
    if (!yes) { audio.sfx('menu_cancel'); return; }
    if (Q.stake && this.inRound) this.forfeit();
    this.leave();
  }
  /** 진행 중인 판을 그만둔다: 걸어 둔 판돈은 잃고(패배로 기록) 판을 정리한다 */
  forfeit() {
    this.onForfeit?.();
    if (this.roundBet > 0 || this.roundFree) this.settle({ win: false, tier: 'lose', popup: false, quiet: true, forfeit: true });
  }
  /** 확인 창에 덧붙일 한 줄 (하위 클래스) */
  quitNote() { return null; }
  stepQuit(dt) {
    const Q = this.quit;
    Q.t += dt;
    const tap = this.hits.tapped();
    const ov = taps.over(this);
    if (ov === 'q_quit') Q.sel = 0; else if (ov === 'q_stay') Q.sel = 1;
    if (Q.t < 0.1) return; // 창을 연 입력이 바로 결정되지 않게
    if (tap === 'q_quit') { this.closeQuit(true); return; }
    if (tap === 'q_stay') { this.closeQuit(false); return; }
    if (input.pressed('left') || input.pressed('right') || input.pressed('up') || input.pressed('down')) { Q.sel = 1 - Q.sel; audio.sfx('menu_move'); }
    if (input.pressed('confirm')) { this.closeQuit(Q.sel === 0); return; }
    if (input.pressed('cancel') || input.pressed('menu')) this.closeQuit(false);
  }
  leave() {
    if (this.leaving) return;
    this.leaving = true;
    this.quit = null;
    audio.sfx('menu_cancel');
    if (this.fromInn && this.game.scenes.length > 1) this.game.fadeOut(() => this.game.pop({ game: this.id }), 0.3);
    else this.game.go(this.game.registry.inn ? 'inn' : 'title', {});
  }
  canAgain() { return this.free || this.st.gold >= this.bet; }
  again() {
    this.result = null;
    this.phase = 'ready';
    this.onAgain?.();
  }

  // ── 루프 ──
  update(dt) {
    this.clock += dt;
    this.goldR.update(dt, this.st.gold);
    this.fx.update(dt);
    this.coins.update(dt);
    this.shakeT = Math.max(0, this.shakeT - dt);
    if (this.shakeT <= 0) this.shakeMag = 0;
    this.flashA = Math.max(0, this.flashA - dt * 2.5);
    if (this.betPop && (this.betPop.t += dt) > 1.1) this.betPop = null;
    // '그만두기' 확인 창이 떠 있으면 게임은 멈춘다 (타이머·릴·딜러·결투 신호)
    if (this.quit && !this.leaving) { this.stepQuit(dt); return; }
    this.animate?.(dt);
    if (this.leaving) return;
    const tap = this.hits.tapped();
    this._tap = tap;
    if (this.result) {
      const R = this.result;
      R.t += dt;
      if (R.t > 0) R.shown = Math.min(R.payout, R.shown + Math.max(R.payout * dt * 1.6, 60 * dt));
      if (R.t > 0.35) {
        if (tap === 'again' || input.pressed('confirm')) {
          // 버튼이 비활성(금화 부족)이면 키 입력도 막는다 — 판돈 차감 실패로 지난 판 화면이 남는 일이 없도록
          if (!this.canAgain()) this.poor();
          else { audio.sfx('menu_ok'); this.again(); return; }
        }
        if (tap === 'inn' || tap === 'back' || this.backPressed()) { this.leave(); return; }
      }
      this.stepResult?.(dt);
      return;
    }
    if (tap === 'back' || (this.backPressed() && !this.backBlocked())) { this.openQuit(); return; }
    if (this.phase === 'ready') {
      if (tap && tap.startsWith('bet:')) this.setBet(+tap.slice(4));
      if (this.betKeys !== false) {
        if (input.pressed('left')) this.cycleBet(-1);
        if (input.pressed('right')) this.cycleBet(1);
      }
    }
    this.step(dt, tap);
  }
  render(ctx) {
    this.hits.clear();
    const vw = this.vw, vh = this.vh;
    ctx.save();
    if (this.shakeT > 0) ctx.translate(rand(-1, 1) * this.shakeMag, rand(-1, 1) * this.shakeMag);
    this.draw(ctx);
    this.fx.draw(ctx, 'back');
    this.fx.draw(ctx, 'front');
    ctx.restore();
    this.coins.draw(ctx);
    this.fx.draw(ctx, 'top');
    this.drawHUD(ctx);
    if (this.result && this.result.t > 0) this.drawResult(ctx);
    if (this.flashA > 0) { ctx.globalAlpha = Math.min(0.7, this.flashA); ctx.fillStyle = this.flashCol; ctx.fillRect(0, 0, vw, vh); ctx.globalAlpha = 1; }
    if (this.quit) this.drawQuit(ctx);
  }

  // ── HUD ──
  drawHUD(ctx) {
    const vw = this.vw;
    const back = this.hits.rect('back', 12, 10, 104, 40);
    // 탭 영역은 버튼 그대로 (모자란 크기는 ui.taps 여유 영역이 채운다; 결투의 '화면 누르기' 제외 영역 x<130·y<60 과 맞춤)
    this.hits.add('back', back, !!this.quit, 'icon');
    drawBtn(ctx, back, '◀ 여관', { tone: 'dark', size: 16, hot: this.hits.over(back), pressed: this.hits.pressed(back), key: 'cancel' });
    // 제목 (titleLeft: 가운데를 비워야 하는 장면용)
    if (this.titleLeft) {
      goldText(ctx, this.info.name, 130, 38, 24, { align: 'left', glowCol: this.info.accent });
      text(ctx, this.info.sub, 132, 54, { size: 11, weight: 700, color: '#b8a080', ow: 2 });
    } else {
      const tw = 300;
      ctx.save();
      const g = ctx.createLinearGradient(vw / 2 - tw / 2, 0, vw / 2 + tw / 2, 0);
      g.addColorStop(0, 'rgba(10,4,12,0)'); g.addColorStop(0.2, 'rgba(10,4,12,0.78)'); g.addColorStop(0.8, 'rgba(10,4,12,0.78)'); g.addColorStop(1, 'rgba(10,4,12,0)');
      ctx.fillStyle = g; ctx.fillRect(vw / 2 - tw / 2, 6, tw, 50);
      ctx.fillStyle = 'rgba(232,200,114,0.5)'; ctx.fillRect(vw / 2 - tw * 0.35, 55, tw * 0.7, 1);
      ctx.restore();
      goldText(ctx, this.info.name, vw / 2, 36, 26, { glowCol: this.info.accent });
      text(ctx, this.info.sub, vw / 2, 51, { size: 11, align: 'center', weight: 700, color: '#b8a080', ow: 2 });
    }
    // 금화 + 판돈
    goldPlaque(ctx, vw - 196, 10, 184, this.goldR.value, this.clock, this.goldR.flash);
    if (this.betPop) {
      const k = this.betPop.t;
      ctx.globalAlpha = clamp((1.1 - k) / 0.35, 0, 1) * clamp(k / 0.08, 0, 1);
      text(ctx, this.betPop.str, vw - 206, 38 - ease.outCubic(clamp(k / 0.6, 0, 1)) * 12, { size: 18, align: 'right', weight: 900, family: FONT.num, color: '#ff9a9a', ow: 4 });
      ctx.globalAlpha = 1;
    }
    const inRound = this.phase !== 'ready' && this.phase !== 'result';
    const bt = this.roundBet > 0 && inRound ? `판돈 ${fmt(this.roundBet)} G` : this.free ? '무료 판' : `판돈 ${fmt(this.bet)} G`;
    text(ctx, inRound && this.roundFree ? '무료 판 진행 중' : bt, vw - 20, 68, { size: 13, align: 'right', weight: 700, color: this.free || this.roundFree ? '#7affd8' : '#e8d8b0', ow: 3 });
    if (session.games > 0) text(ctx, `오늘 ${session.net >= 0 ? '+' : ''}${fmt(session.net)} G`, vw - 20, 86, { size: 12, align: 'right', weight: 700, color: session.net >= 0 ? '#9af09a' : '#ff9a9a', ow: 3 });
  }
  /** 판돈 칩 하나의 칸 폭 (= 탭 영역 폭; 터치·휴대폰은 44 CSS px 이상) */
  chipGap(r = 23) {
    const big = input.touchMode || this.tapMin > 44;
    return Math.max(r * 2 + (big ? 10 : 12), big ? this.tapMin : 0);
  }
  /** 판돈 칩 줄 전체 폭 */
  betBarW(r = 23) { return this.betOptions().length * this.chipGap(r); }
  /** 판돈 칩 줄 (ready 단계용). cx 중심, y 칩 중심. 반환: 칩 줄이 차지한 폭 */
  drawBetBar(ctx, cx, y, { r = 24, label = true, maxW = Infinity } = {}) {
    const opts = this.betOptions();
    // 칩 사이 = 탭 영역 폭. 손가락 크기(44 CSS px) 이상이 되게 넓히되, 주어진 폭(maxW)은 넘지 않는다
    const big = input.touchMode || this.tapMin > 44;
    let gap = this.chipGap(r);
    if (opts.length * gap > maxW) gap = Math.max(r * 2 + 6, maxW / opts.length);
    const x0 = cx - ((opts.length - 1) * gap) / 2;
    if (label) {
      if (input.touchMode) text(ctx, '판돈을 고르세요', cx, y - r - 12, { size: 12, align: 'center', weight: 700, color: '#c8b490', ow: 3 });
      else keyHints(ctx, [['dpadH', '판돈 선택']], cx, y - r - 12, { align: 'center', size: 12 });
    }
    const hh = Math.max(r * 2 + 20, big ? this.tapMin : 0);
    opts.forEach((v, i) => {
      const x = x0 + i * gap;
      const hr = this.hits.rect('bet:' + v, x - gap / 2, y - hh / 2, gap, hh);
      const dis = v > 0 && this.st.gold < v;
      this.hits.add('bet:' + v, hr, false, 'icon');
      drawChip(ctx, x, y, r, v, { selected: this.betValue === v, disabled: dis, t: this.clock });
    });
    return opts.length * gap;
  }

  // ── 결과 팝업 ──
  drawResult(ctx) {
    const R = this.result, vw = this.vw, vh = this.vh;
    const k = ease.outBack(clamp(R.t / 0.4, 0, 1));
    const fa = clamp(R.t / 0.25, 0, 1);
    ctx.fillStyle = `rgba(4,1,6,${0.42 * fa})`; ctx.fillRect(0, 0, vw, vh);
    const hasItems = R.items.length > 0;
    const bh = this.bh(46);
    const w = Math.min(520, vw - 32), h = (hasItems ? 322 : 262) + (bh - 46), x = vw / 2 - w / 2;
    const y = Math.max(58, this.resultTop ?? vh - h - 10);
    const rowY = y + (hasItems ? 228 : 172);
    const win = R.win, jp = R.tier === 'jackpot';
    ctx.save();
    ctx.translate(vw / 2, y + h / 2); ctx.scale(0.7 + 0.3 * k, 0.7 + 0.3 * k); ctx.translate(-vw / 2, -(y + h / 2));
    ctx.globalAlpha = fa;
    if (win) {
      // 뒤쪽 광선
      ctx.save(); ctx.translate(vw / 2, y + 30); ctx.rotate(this.clock * 0.3); ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = jp ? 'rgba(255,230,140,0.12)' : 'rgba(255,200,120,0.08)';
      for (let i = 0; i < 12; i++) { ctx.rotate(TAU / 12); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-30, -300); ctx.lineTo(30, -300); ctx.fill(); }
      ctx.restore();
    }
    gPanel(ctx, x, y, w, h, { a: 0.93, glowCol: win ? (jp ? '#ffe070' : '#e8a040') : R.tier === 'push' ? null : '#801020', edge: win ? '#e8c872' : '#8a6a34' });
    // 제목
    const tcol = jp ? { top: '#ffffff', mid: '#ffe070', bot: '#ff8a2a' } : win ? {} : R.tier === 'push' ? { top: '#ffffff', mid: '#d8d0c0', bot: '#8a8070' } : { top: '#ffd0d0', mid: '#c83040', bot: '#5a0a14' };
    const ts = jp ? 50 + Math.sin(this.clock * 10) * 3 : 44;
    goldText(ctx, R.title, vw / 2, y + 60, ts, { family: FONT.title, glowCol: win ? '#ffb040' : '#ff2040', maxWidth: w - 40, ...tcol });
    if (R.sub) text(ctx, R.sub, vw / 2, y + 88, { size: 15, align: 'center', weight: 700, color: '#e8d8c0', ow: 3, maxWidth: w - 30 });
    // 금화
    if (R.free) {
      text(ctx, '무료 판 — 보상은 없어요', vw / 2, y + 128, { size: 17, align: 'center', weight: 800, color: '#7affd8', ow: 3 });
    } else if (R.payout > 0) {
      drawCoin(ctx, vw / 2 - 92, y + 119, 13, this.clock * 3);
      text(ctx, `+${fmt(R.shown)} G`, vw / 2 + 12, y + 129, { size: 30, align: 'center', weight: 900, family: FONT.num, color: '#ffe070', ow: 5 });
      const net = R.net;
      text(ctx, `순이익 ${net >= 0 ? '+' : ''}${fmt(net)} G`, vw / 2, y + 151, { size: 13, align: 'center', weight: 700, color: net >= 0 ? '#9af09a' : '#ff9a9a', ow: 3 });
    } else {
      text(ctx, `-${fmt(R.bet)} G`, vw / 2, y + 131, { size: 28, align: 'center', weight: 900, family: FONT.num, color: '#ff7a7a', ow: 5 });
    }
    // 드롭
    if (R.items.length) {
      const n = R.items.length, iw = Math.min(150, (w - 40) / n);
      const x0 = vw / 2 - ((n - 1) * iw) / 2;
      R.items.forEach((it, i) => {
        const kk = ease.outBack(clamp((R.t - 0.5 - i * 0.25) / 0.35, 0, 1));
        if (kk <= 0) return;
        const ix = x0 + i * iw, iy = y + 184;
        ctx.save(); ctx.translate(ix - 44, iy); ctx.scale(kk, kk);
        glow(ctx, 0, 0, 34, it.id.includes('scroll') ? '#8ac8ff' : '#ffd060', 0.55 + 0.2 * Math.sin(this.clock * 5));
        drawIcon(ctx, it.icon, 0, 0, 40);
        ctx.restore();
        ctx.globalAlpha = fa * clamp(kk, 0, 1);
        text(ctx, it.name, ix - 18, iy - 2, { size: 13, weight: 800, color: '#ffe7a0', ow: 3, maxWidth: iw - 30 });
        text(ctx, `×${it.qty} 획득!`, ix - 18, iy + 15, { size: 12, weight: 700, color: '#c8e8a0', ow: 3 });
        ctx.globalAlpha = fa;
      });
    }
    // 마르타 한마디
    martaFace(ctx, x + 40, rowY, 19, R.mood, this.clock);
    text(ctx, R.line, x + 68, rowY + 5, { size: 13, weight: 600, color: '#e8dcc8', ow: 2, maxWidth: w - 88 });
    // 버튼
    const bw = Math.min(190, (w - 44) / 2), by = y + h - bh - 12;
    const ra = this.hits.rect('again', vw / 2 - bw - 8, by, bw, bh), rb = this.hits.rect('inn', vw / 2 + 8, by, bw, bh);
    const canAgain = this.canAgain();
    if (R.t > 0.3) { this.hits.add('again', ra, !canAgain); this.hits.add('inn', rb); }
    ctx.globalAlpha = fa;
    drawBtn(ctx, ra, '한 판 더', { tone: 'crimson', hot: this.hits.over(ra), pressed: this.hits.pressed(ra), sub: this.free ? '무료 판' : `판돈 ${fmt(this.bet)} G`, key: 'confirm', disabled: !canAgain, pulse: canAgain, t: this.clock });
    drawBtn(ctx, rb, '여관으로', { tone: 'dark', hot: this.hits.over(rb), pressed: this.hits.pressed(rb), key: 'cancel' });
    ctx.restore();
  }

  // ── '그만두기' 확인 창 ──
  drawQuit(ctx) {
    const Q = this.quit, W = this.vw, H = this.vh;
    const fa = clamp(Q.t / 0.15, 0, 1), k = ease.outBack(clamp(Q.t / 0.2, 0, 1));
    ctx.fillStyle = `rgba(4,1,6,${0.62 * fa})`; ctx.fillRect(0, 0, W, H);
    const w = Math.min(470, W - 40), bh = this.bh(48);
    let msg;
    if (!Q.stake) msg = '여관으로 돌아갈까요?';
    else if (this.roundFree) msg = '지금 그만두면 진행 중인 무료 판은 사라져요.';
    else msg = `지금 그만두면 걸어 둔 판돈 ${fmt(this.roundBet)} G를 잃어요.`;
    const note = Q.stake ? this.quitNote?.() : null;
    const lines = wrap(ctx, msg, w - 48, 15, 700);
    const nLines = note ? wrap(ctx, note, w - 48, 13, 600) : [];
    const touch = input.touchMode;
    const h = 64 + lines.length * 22 + (nLines.length ? nLines.length * 19 + 4 : 0) + 18 + bh + (touch ? 18 : 40);
    const x = W / 2 - w / 2, y = clamp(H / 2 - h / 2, 8, Math.max(8, H - h - 8));
    ctx.save();
    ctx.globalAlpha = fa;
    ctx.translate(W / 2, y + h / 2); ctx.scale(0.85 + 0.15 * k, 0.85 + 0.15 * k); ctx.translate(-W / 2, -(y + h / 2));
    gPanel(ctx, x, y, w, h, { a: 0.95, glowCol: Q.stake ? '#801020' : null, edge: '#c8a050' });
    goldText(ctx, '그만두기', W / 2, y + 42, 28, { glowCol: '#ff2040' });
    let ty = y + 72;
    for (const l of lines) { text(ctx, l, W / 2, ty, { size: 15, align: 'center', weight: 700, color: Q.stake ? '#ffb0a0' : '#efe4cf', ow: 3 }); ty += 22; }
    for (const l of nLines) { text(ctx, l, W / 2, ty + 2, { size: 13, align: 'center', weight: 600, color: '#c8e8a0', ow: 2 }); ty += 19; }
    const by = ty + 8, bw = Math.min(190, (w - 52) / 2);
    const rq = this.hits.rect('q_quit', W / 2 - bw - 8, by, bw, bh), rs = this.hits.rect('q_stay', W / 2 + 8, by, bw, bh);
    this.hits.add('q_quit', rq); this.hits.add('q_stay', rs);
    drawBtn(ctx, rq, '그만두기', { tone: 'crimson', size: 18, hot: !touch && Q.sel === 0, pressed: this.hits.pressed(rq), sub: Q.stake ? (this.roundFree ? '무료 판 포기' : '판돈 포기') : '여관으로' });
    drawBtn(ctx, rs, '계속하기', { tone: 'dark', size: 18, hot: !touch && Q.sel === 1, pressed: this.hits.pressed(rs), sub: Q.stake ? '판을 이어서' : '여기 남기' });
    if (!touch) keyHints(ctx, [['dpadH', '선택'], ['confirm', '결정'], ['cancel', '계속하기']], W / 2, by + bh + 26, { align: 'center', size: 12 });
    ctx.restore();
  }
}
const DEFAULT_TITLE = { win: '승리!', big: '대승리!', jackpot: '잭팟!!', lose: '패배…', push: '무승부' };
