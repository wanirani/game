// 무한의 탑 (아케이드 5번째 모드) — 층 규칙·난이도 곡선·축복·방 풀·층 계획 (순수 데이터 + 결정적 함수, 화면·월드 import 없음)
// 장면: scenes/front/arcade_tower.js · 서버 사본: netlify/lib/gamedata.mts TOWER_RULES (tools/online/test_online.mjs 가 대조)
//
// ── 층 ──
//  floorKind(f): 10의 배수 = 'rest'(안식처: 적 없음, 소량 회복 + 축복 1/3), 그 밖의 5의 배수 = 'boss', 나머지 = 'combat'.
//  전투 층 = 스테이지의 실제 방을 다시 쓴다 (towerRoom: 이야기·문·상자·NPC·세이브·기믹 표식을 걷어 내고 출구를 막은 사본).
//  적 배치는 원래 방의 숫자 표식 자리(spawn slot)에 층마다 새로 뽑은 적을 놓는다. 땅에 서는 적은 그 자리에서 아래로 떨어져
//  닿는 바닥(가시·액체·구덩이가 아닌 곳)이 있는 자리만, 나는 적은 아무 자리나. 보스·안식처 층은 투기장(arena r1).
//  방 풀(towerRooms): 1부 + (2부를 알면) 2부 방 중 — 보스방·아래 출구 방 제외, 거울·심장 박동·깊은 물·상승 기류 표식이 있는 방 제외,
//  땅 자리 4개 미만 제외, ROOM_DENY 제외. 기믹은 끈다(gimmick: null). 검증: node tools/tower_rooms.mjs (validate_maps --stages 로
//  땅 자리마다 문 'D' 를 두고 도달성 BFS) — 지금 풀 74방(1부 59·2부 15), 오류 0.
//  층 f 의 스테이지 단계 = floor((f-1)/2) (스테이지 순서대로 두 층씩), 순서를 다 지나면(1부 27층·전체 41층부터) 시드로 아무 단계.
//  스테이지 순서는 장면이 정한다 (2부를 알면 1·2부 이야기 순서. 외전 s21 은 넣지 않는다 — 순서 구간의 층 계획이 외전을 알든 모르든 같게).
//  보스: 순서 구간은 bosses 를 단계에 맞춰, 무작위 구간(순서를 다 지난 층)은 bosses + lateBosses(외전 보스, 41층 이후) 중 시드로.
//  방은 그 단계 ±1 의 방 중 최근 4층에 나오지 않은 것, 적 풀은 단계-1 ~ 단계 스테이지의 적 (서바이벌과 같은 제외 규칙).
//  풀 계단 상한(POOL_STEP, 첫 안식처 뒤 순서 구간): 풀의 평균 기본 체력이 앞 전투 층 풀의 1.25배를 넘으면 가장 무거운 적부터 뺀다.
//
// ── 시드 (재현) ── 런 시드(state.arcade.seed, 32비트) 하나로 층마다 따로 난수를 만든다 (rngOf(seed, f, 소금)):
//  같은 시드 + 같은 2부 여부 → 같은 방·적·정예·보스·축복 후보. 싸우는 동안의 난수(드롭 등)는 층 계획에 섞이지 않는다.
//
// ── 난이도 곡선 (P = 헌터 등급 레벨, f = 층) ── 적 능력치는 enemyStats(레벨) × 난이도 배율 × 아래 층 배율
//  적 레벨   L(f) = clamp(round(0.62·P + 1.1·(f-1)), 1, 99)      전설의 헌터(60): 1층 37 · 10층 47 · 20층 58 · 30층 69
//  체력 배율 1 + 0.03·(f-1) + 0.0008·(f-1)²                         10층 ×1.33 · 20층 ×1.86 · 30층 ×2.54
//  공격 배율 1 + 0.025·(f-1) + 0.0006·(f-1)²                        10층 ×1.27 · 20층 ×1.69 · 30층 ×2.23
//  속도 배율 min(1.3, 1 + 0.01·(f-1)) · 적 수 min(16, 5 + floor(0.4·(f-1))) · 정예 확률 min(0.45, 난이도 정예 + 0.012·(f-1))
//  보스: 레벨 L(f) − 2, 체력 = 난이도 보스 체력 × 체력 배율 × 0.85, 공격 = 공격 배율.
//  실측 (보통, 전설의 헌터 카엘 = 템플러 공 591·체 1760·방 403, 기본기 1타 배율 1.33, 중간 적 5종의 가운데 값, 축복 없음):
//    1층 3타·한 대에 체력 2.7 % · 10층 6타·5.2 % · 20층 10타·9.9 % · 25층 14타·13.5 % · 30층 18타·17.6 % (정예 39 %, 피해 ×1.5)
//    (이야기 모드 같은 레벨은 4~8타·5~8 %). → 전설의 헌터가 축복 4~6개로 20~30층에서 막히는 곡선 (견습은 10층 안팎)
//
// ── 축복 ── BLESSINGS: 보스 층을 깨거나 안식처에 오면 셋 중 하나를 고른다 (겹칠 수 있는 것은 max 까지).
//  능력치 축복은 stats(s, n) 로 플레이어 능력치를 고친다 (장면이 refreshStats 뒤에 덧씌운다 — stats.js 의 능력치 키 그대로),
//  나머지는 장면이 처리한다 (dash: 대시 뒤 무적, volley: 트리플 샷 버프, thorns: 피격 시 주변 피해, frenzy: 처치 가속, phoenix: 부활).

/** 층 규칙 (서버 사본: netlify/lib/gamedata.mts TOWER_RULES — 바꾸면 같이 바꾼다) */
export const TOWER_RULES = Object.freeze({
  bossEvery: 5,              // 5의 배수 층 = 보스 (10의 배수는 안식처가 이긴다)
  restEvery: 10,             // 10의 배수 층 = 안식처
  // 온라인 기록 검사: 걸린 시간 ≥ 돌파한 층 × 3초. 층마다 건너뛸 수 없는 연출(등장 1.2초 + 돌파 뒤 1초 + 출구 열림 0.8초 = 3초,
  // 보스 4.8초·안식처 3.2초)만큼 — 실측 보스 층 5초대·안식처 3.2초라 8초는 빠른 진짜 기록(특히 안식처에서 끝난 10층)을 거절했다
  minFloorSec: 3,
  maxScorePerFloor: 5000000, // 온라인 기록 검사: 점수 ≤ (돌파한 층 + 1) × 이 값
});

/** 층 종류: 'combat' | 'boss' | 'rest' */
export function floorKind(f) {
  if (f % TOWER_RULES.restEvery === 0) return 'rest';
  if (f % TOWER_RULES.bossEvery === 0) return 'boss';
  return 'combat';
}

// ───────────────────────── 난이도 곡선 ─────────────────────────
const k1 = (f) => Math.max(0, f - 1);
export const TOWER_CURVE = Object.freeze({
  level: (P, f) => Math.max(1, Math.min(99, Math.round(0.62 * P + 1.1 * k1(f)))),
  hp: (f) => 1 + 0.03 * k1(f) + 0.0008 * k1(f) ** 2,
  atk: (f) => 1 + 0.025 * k1(f) + 0.0006 * k1(f) ** 2,
  speed: (f) => Math.min(1.3, 1 + 0.01 * k1(f)),
  count: (f) => Math.min(16, 5 + Math.floor(0.4 * k1(f))),
  elite: (base, f) => Math.min(0.45, (base ?? 0) + 0.012 * k1(f)),
  bossHp: 0.85,
  bossLevelDrop: 2,
});
/** 층 f 의 난이도 객체 (data/difficulty.js 의 난이도에 층 배율을 곱한 사본 — world.diff 로 쓴다) */
export function towerDiff(base, f) {
  const h = TOWER_CURVE.hp(f), a = TOWER_CURVE.atk(f), s = TOWER_CURVE.speed(f);
  return {
    ...base,
    enemyHp: (base.enemyHp ?? 1) * h, enemyAtk: (base.enemyAtk ?? 1) * a, enemySpeed: (base.enemySpeed ?? 1) * s,
    bossHp: (base.bossHp ?? base.enemyHp ?? 1) * h * TOWER_CURVE.bossHp,
    elite: TOWER_CURVE.elite(base.elite, f),
  };
}

// ───────────────────────── 축복 ─────────────────────────
/** 축복 목록 (id 는 기록·시험에 쓰인다 — 바꾸지 않는다). icon = assets/icons/<id>.png (render/icons.js drawIcon) */
export const BLESSINGS = [
  { id: 'might', name: '공격력 +15%', desc: '공격력과 마력이 15% 오른다', icon: 'sword_4', color: '#ff7a5a', max: 5, w: 10,
    stats: (s, n) => { s.atk = Math.round(s.atk * (1 + 0.15 * n)); s.mag = Math.round(s.mag * (1 + 0.15 * n)); } },
  { id: 'crit', name: '치명타 확률 +8%', desc: '치명타가 더 자주 터진다', icon: 'dagger_5', color: '#ffd070', max: 4, w: 9,
    stats: (s, n) => { s.crit = Math.min(90, (s.crit ?? 0) + 8 * n); } },
  { id: 'leech', name: '흡혈 3%', desc: '준 피해의 3%만큼 체력을 회복한다', icon: 'wheart_1', color: '#ff4a6a', max: 3, w: 8,
    stats: (s, n) => { s.lifesteal = (s.lifesteal ?? 0) + 3 * n; } },
  { id: 'vigor', name: '최대 체력 +20%', desc: '최대 체력이 20% 늘고 늘어난 만큼 회복한다', icon: 'heart_l', color: '#ff6a7a', max: 4, w: 10,
    stats: (s, n) => { s.hp = Math.round(s.hp * (1 + 0.2 * n)); } },
  { id: 'mana', name: '마나 재생', desc: '초당 MP 회복 +3', icon: 'potion_mp', color: '#6aa8ff', max: 3, w: 7,
    stats: (s, n) => { s.mpRegen = (s.mpRegen ?? 0) + 3 * n; } },
  { id: 'wings', name: '이단 점프 +1', desc: '공중에서 한 번 더 뛸 수 있다', icon: 'cloak_3', color: '#a8e0ff', max: 2, w: 6,
    stats: (s, n) => { s.airJumps = (s.airJumps ?? 0) + n; } },
  { id: 'dash', name: '대시 무적 시간 증가', desc: '대시가 끝난 뒤에도 0.25초 동안 무적', icon: 'scroll_protect', color: '#c8b8ff', max: 2, w: 7, dashGuard: 0.25 },
  { id: 'volley', name: '보조 무기 탄수 +2', desc: '보조 무기를 한 번에 세 발씩 던진다', icon: 'sub_axe', color: '#c07cff', max: 1, w: 6 },
  { id: 'magnet', name: '골드 자석', desc: '멀리 있는 아이템을 끌어당기고 하트를 더 얻는다', icon: 'moneybag', color: '#ffd84a', max: 1, w: 6,
    stats: (s) => { s.magnet = Math.max(1, s.magnet ?? 0); s.heartBonus = (s.heartBonus ?? 0) + 50; s.goldBonus = (s.goldBonus ?? 0) + 50; } },
  { id: 'thorns', name: '가시 반사', desc: '피해를 받으면 주변 적에게 가시 피해를 돌려준다', icon: 'body_5', color: '#9ae070', max: 3, w: 7 },
  { id: 'frenzy', name: '처치 시 가속', desc: '적을 쓰러뜨리면 3초 동안 이동·공격 속도 +25%', icon: 'powerup', color: '#6affb0', max: 2, w: 7,
    hasted: (s, n) => { s.moveSpd = (s.moveSpd ?? 0) + 25 * n; s.atkSpd = (s.atkSpd ?? 0) + 20 * n; } },
  { id: 'phoenix', name: '부활 1회', desc: '쓰러지면 한 번, 체력 절반으로 되살아난다', icon: 'oneup', color: '#ffb040', max: 1, w: 5 },
];
export const BLESSING = Object.freeze(Object.fromEntries(BLESSINGS.map((b) => [b.id, b])));
/** 능력치 축복을 적용한다 (taken = {id: 겹친 수}, hasted = 처치 가속 중인가). s 를 고쳐 돌려준다 */
export function applyBlessingStats(s, taken, hasted = false) {
  for (const b of BLESSINGS) {
    const n = taken?.[b.id] | 0;
    if (n <= 0) continue;
    b.stats?.(s, n);
    if (hasted) b.hasted?.(s, n);
  }
  return s;
}

// ───────────────────────── 결정적 난수 ─────────────────────────
function h32(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
/** 시드 + 키들 → 난수 { next(), int(a,b), pick(arr), shuffle(arr) } (mulberry32) */
export function rngOf(seed, ...keys) {
  let s = h32(`${seed >>> 0}|${keys.join('|')}`);
  const next = () => {
    let t = (s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (a, b) => Math.floor(a + next() * (b - a + 1));
  return {
    next, int,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    shuffle: (arr) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = int(0, i); [a[i], a[j]] = [a[j], a[i]]; } return a; },
  };
}

/**
 * 축복 후보 셋 (가득 찬 것 제외, 가중치 w). salt = 그 층에서 몇 번째 고르기인가 → 같은 시드·층·고른 것이면 같은 후보
 */
export function blessingOffer(seed, f, taken = {}, salt = 0, n = 3) {
  const r = rngOf(seed, 'bless', f, salt);
  let pool = BLESSINGS.filter((b) => (taken[b.id] | 0) < b.max);
  const out = [];
  while (out.length < n && pool.length) {
    const tot = pool.reduce((a, b) => a + b.w, 0);
    let x = r.next() * tot, i = 0;
    for (; i < pool.length - 1; i++) { x -= pool[i].w; if (x < 0) break; }
    out.push(pool[i].id);
    pool = pool.filter((_, j) => j !== i);
  }
  return out;
}

// ───────────────────────── 방 풀 ─────────────────────────
/** 기믹 전용 표식 — 하나라도 있으면 그 방은 풀에서 뺀다 (거울 a·b·Q, 심장 박동 z·Z, 깊은 물 기포 u, 상승 기류 U) */
const PUZZLE_CH = /[abQzZuU]/;
/** 걷어 내는 표식 → 바꿀 글자 (이야기·NPC·문·상자·배치 아이템·세이브·여신상·보스 트리거·포자 주머니 → 빈칸, 비전서·상자 벽 → 보통 부서지는 벽) */
const STRIP = { '!': ' ', N: ' ', D: ' ', $: ' ', '@': ' ', S: ' ', G: ' ', X: ' ', y: ' ', H: 'B', K: 'B' };
const STAND = new Set(['#', '%', '=', 'B']);
/** 검증에서 걸러 낸 방 (도달할 수 없는 땅 자리가 많거나 전투 공간이 아님) — tools/tower_rooms.mjs 결과 */
export const ROOM_DENY = new Set([]);
/** 탑 적 풀 계단 상한: 순서 구간에서 층 풀의 평균 기본 체력 ≤ 앞 전투 층 풀 × 이 값 (TowerPlanner.make) */
export const POOL_STEP = 1.25;
/** 이 방의 적 금지 자리 (key → 숫자 표식 순번 목록; 검증이 도달 불가로 본 땅 자리) */
export const SLOT_DENY = {};
/** 이런 적은 탑에 나오지 않는다 (서바이벌과 같음: 생성기·위장·보너스 적·물이 있어야 하는 적) + def.noArena */
export const NO_SPAWN = new Set(['medusa_spawner', 'mimic', 'golden_bat', 'killer_fish']);

const roomMemo = new Map();
/**
 * 방 사본 + 적 자리. 같은 방이면 같은 객체 (읽기 전용으로 쓴다).
 * → { key, sid, rid, room, slots: [{ tx, ty, gy, ground }], ground: 땅 자리 수 } | null (풀에 넣을 수 없는 방)
 *   slot.ty = 표식 칸, gy = 땅에 서는 적의 발 칸 (아래 바닥 위), ground = 땅 적을 놓을 수 있는가
 */
export function towerRoom(stages, sid, rid) {
  const key = `${sid}:${rid}`;
  if (roomMemo.has(key)) return roomMemo.get(key);
  const out = buildRoom(stages, sid, rid, key);
  roomMemo.set(key, out);
  return out;
}
function buildRoom(stages, sid, rid, key) {
  const st = stages?.[sid], src = st?.rooms?.[rid];
  if (!src || !Array.isArray(src.map) || src.boss || src.exitDown || ROOM_DENY.has(key)) return null;
  const rows0 = src.map;
  if (rows0.some((r) => PUZZLE_CH.test(r))) return null;
  const liq = src.liquid ?? st.liquid ?? 'water';
  if (liq === 'deep') return null;
  const H = rows0.length, W = Math.max(...rows0.map((r) => r.length));
  const grid = rows0.map((r) => [...r.padEnd(W, ' ')]);
  let ps = 0;
  const marks = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = grid[y][x];
    if (c === 'P') ps++;
    if (c >= '1' && c <= '9') { marks.push([x, y]); grid[y][x] = ' '; }
    else if (Object.hasOwn(STRIP, c)) grid[y][x] = STRIP[c];
  }
  if (ps !== 1) return null;
  // 위 출구로 뚫린 천장은 막는다 (방 밖 지붕 위로 올라가지 않게)
  if (src.exitUp) grid[0] = grid[0].map((c) => (c === ' ' || c === '.' ? '#' : c));
  const at = (x, y) => (y < 0 || y >= H || x < 0 || x >= W ? null : grid[y][x]);
  const deny = new Set(SLOT_DENY[key] ?? []);
  const slots = marks.map(([tx, ty], i) => {
    if (deny.has(i)) return { tx, ty, gy: ty, ground: false };
    if (at(tx, ty) === '~') return { tx, ty, gy: ty, ground: false };
    let y = ty;
    while (y + 1 < H && !STAND.has(at(tx, y + 1))) {
      const c = at(tx, y + 1);
      if (c === '~' || c === '^' || c === 'M' || c === 'V' || c === 'F') return { tx, ty, gy: ty, ground: false };   // 액체·가시·움직이는 발판 위
      y++;
    }
    const ground = y + 1 < H && at(tx, y) !== '^' && at(tx, y - 1) !== '#' && at(tx, y - 1) !== '%';
    return { tx, ty, gy: y, ground };
  });
  const nGround = slots.filter((s) => s.ground).length;
  if (nGround < 4) return null;
  const room = {
    name: src.name, map: grid.map((r) => r.join('')), theme: src.theme, bg: src.bg, darkness: src.darkness,
    liquid: src.liquid, facing: src.facing, platRange: src.platRange, platSpeed: src.platSpeed, platforms: src.platforms,
    gimmick: null, enemies: null,
  };
  return { key, sid, rid, room, slots, ground: nGround };
}

/** 풀에 들어가는 방 키 목록 (order = 스테이지 순서) → [{key, sid, rid, tier(스테이지 순번)}] */
export function towerRooms(stages, order) {
  const out = [];
  order.forEach((sid, tier) => {
    for (const rid of Object.keys(stages?.[sid]?.rooms ?? {})) {
      const r = towerRoom(stages, sid, rid);
      if (r) out.push({ key: r.key, sid, rid, tier });
    }
  });
  return out;
}

/** 이 적을 탑에 낼 수 있는가 */
export function towerFoeOk(enemies, id) {
  const d = enemies?.[id];
  return !!d && !NO_SPAWN.has(id) && !d.noArena;
}

// ───────────────────────── 층 계획 ─────────────────────────
/**
 * 런 하나의 층 계획 (결정적). new TowerPlanner(seed, { stages, order, enemies, bosses, P })
 *  plan(f) → { f, kind, tier, sid?, rid?, key?, level, enemies: [{ id, slot, elite }], bossId? }
 *  층은 1부터 차례로 만들어 기억한다 (최근 방 피하기가 앞 층에 기댄다). eliteBase = 난이도 정예 확률
 */
export class TowerPlanner {
  constructor(seed, { stages, order, enemies, bosses = [], lateBosses = [], P = 25, eliteBase = 0 } = {}) {
    this.seed = seed >>> 0;
    this.stages = stages; this.order = order ?? []; this.enemies = enemies; this.bosses = bosses; this.P = P; this.eliteBase = eliteBase;
    this.lateBosses = lateBosses ?? [];   // 무작위 구간에만 섞는 보스 (외전 아르겐 — 장면이 외전을 알 때만 준다)
    this.rooms = towerRooms(stages, this.order);
    this.plans = [];
    this.lastBoss = null;
  }
  /** 층 f 의 스테이지 단계 (순서를 다 지나면 시드로 아무 단계) */
  tierOf(f) {
    const n = this.order.length, t = Math.floor((f - 1) / 2);
    return t < n ? t : rngOf(this.seed, 'tier', f).int(0, n - 1);
  }
  plan(f) {
    f = Math.max(1, Math.floor(f));
    while (this.plans.length < f) { const p = this.make(this.plans.length + 1); this.season2(p); this.plans.push(p); }
    return this.plans[f - 1];
  }
  /**
   * 시즌 2 층 계획 (아래 '시즌 2' 절): 전투 층 = 변이(평탄한 길 mut · 피의 길 mutBlood) + 질주의 계약용 추가 적 셋(extra),
   * 안식처 = 피의 계약 후보 둘(pacts — 아무 계약도 맺지 않았을 때), 보스 층 = 갈림길(route) · 상인(merchant).
   * 새 난수는 따로 뽑는다 (rngOf(seed,'mut',f) 등) → 시즌 1 의 방·적·정예·보스 계획은 그대로
   */
  season2(p) {
    const f = p.f;
    if (p.kind === 'combat') {
      const prev = this.plans.slice().reverse().find((q) => q.kind === 'combat');
      p.mut = mutatorOf(this.seed, f, false, prev?.mut ?? null);
      p.mutBlood = mutatorOf(this.seed, f, true, prev?.mutBlood ?? null);
      const room = towerRoom(this.stages, p.sid, p.rid), r = rngOf(this.seed, 'extra', f), pool = p.pool?.length ? p.pool : p.enemies.map((e) => e.id);
      const ground = room.slots.map((s, i) => i).filter((i) => room.slots[i].ground), eliteP = TOWER_CURVE.elite(this.eliteBase, f);
      p.extra = Array.from({ length: PACT.swift.extraFoes }, () => {
        const id = r.pick(pool), def = this.enemies?.[id];
        return { id, slot: def?.flying ? r.int(0, room.slots.length - 1) : r.pick(ground), elite: r.next() < eliteP && def?.elite !== false };
      });
    } else if (p.kind === 'rest') p.pacts = pactOffer(this.seed, f, {});
    else { p.route = true; p.merchant = merchantAt(f); }
  }
  make(f) {
    const kind = floorKind(f), tier = this.tierOf(f), level = TOWER_CURVE.level(this.P, f);
    if (kind === 'rest') return { f, kind, tier, level, enemies: [] };
    if (kind === 'boss') {
      const n = this.order.length || 1, ordered = Math.floor((f - 1) / 2) < n;
      const B = ordered || !this.lateBosses.length ? this.bosses : [...this.bosses, ...this.lateBosses];
      let bossId = null;
      if (B.length) {
        let i = ordered ? Math.min(B.length - 1, Math.round((tier / Math.max(1, n - 1)) * (B.length - 1))) : rngOf(this.seed, 'boss', f).int(0, B.length - 1);
        if (B[i] === this.lastBoss) i = (i + 1) % B.length;
        bossId = B[i];
        this.lastBoss = bossId;
      }
      return { f, kind, tier, level: Math.max(1, level - TOWER_CURVE.bossLevelDrop), bossId, enemies: [] };
    }
    const r = rngOf(this.seed, 'floor', f);
    const recent = new Set(this.plans.slice(-4).map((p) => p.key).filter(Boolean));
    let cands = [];
    for (let span = 1; span <= this.order.length && !cands.length; span++) cands = this.rooms.filter((x) => Math.abs(x.tier - tier) <= span && !recent.has(x.key));
    if (!cands.length) cands = this.rooms.filter((x) => !recent.has(x.key));
    if (!cands.length) cands = this.rooms;
    const pick = r.pick(cands);
    const room = towerRoom(this.stages, pick.sid, pick.rid);
    // 적 풀: 단계-1 ~ 단계 스테이지
    const ids = new Set();
    for (let i = Math.max(0, tier - 1); i <= tier; i++) for (const id of this.stages[this.order[i]]?.enemies ?? []) if (towerFoeOk(this.enemies, id)) ids.add(id);
    let pool = [...ids];
    if (!pool.length) pool = Object.keys(this.enemies ?? {}).filter((id) => towerFoeOk(this.enemies, id));
    // 풀 계단 상한 (POLISH-6, BAL-AUDIT 권고 8): 순서 구간(첫 안식처 뒤)에서 풀의 평균 기본 체력이 앞 전투 층 풀의 POOL_STEP 배를 넘으면 가장 무거운 적부터
    // 뺀다 (다음 층에 상한이 다시 오르므로 무거운 적은 한두 층 늦게 들어올 뿐). s12/s13 중량급이 한꺼번에 들어오던 26층 같은 한 층 튐을 막는다
    const bh = (id) => this.enemies[id]?.hp ?? 0, avg = (a) => a.reduce((x, id) => x + bh(id), 0) / a.length;
    const prevC = this.plans.slice().reverse().find((p) => p.pool);
    if (f > TOWER_RULES.restEvery && Math.floor((f - 1) / 2) < this.order.length && prevC) {   // 첫 안식처까지(1–3타 구간)는 그대로
      const keep = pool.slice().sort((a, b) => bh(a) - bh(b) || (a < b ? -1 : 1));   // 남는 적의 순서(= 시드별 뽑기)는 그대로
      while (keep.length > 1 && avg(keep) > POOL_STEP * avg(prevC.pool)) keep.pop();
      if (keep.length < pool.length) pool = pool.filter((id) => keep.includes(id));
    }
    const n = TOWER_CURVE.count(f), eliteP = TOWER_CURVE.elite(this.eliteBase, f);
    const ground = r.shuffle(room.slots.map((s, i) => i).filter((i) => room.slots[i].ground));
    const any = r.shuffle(room.slots.map((s, i) => i));
    const foes = [];
    let gi = 0, ai = 0;
    for (let k = 0; k < n; k++) {
      const id = r.pick(pool), def = this.enemies[id];
      const slot = def?.flying ? any[ai++ % any.length] : ground[gi++ % ground.length];
      const elite = r.next() < eliteP && def?.elite !== false;
      foes.push({ id, slot, elite });
    }
    return { f, kind, tier, sid: pick.sid, rid: pick.rid, key: pick.key, level, enemies: foes, pool };
  }
}

// ───────────────────────── 시즌 2 (무한의 탑 2.0, Stage 5 P1a) ─────────────────────────
// 층 종류·곡선·축복·방 풀·TOWER_RULES 는 시즌 1 그대로 (서버 사본도 그대로). 더해지는 것:
//  - 변이(MUTATORS): MUT_FROM 층부터 전투 층마다 하나 (rngOf(seed,'mut',f)). 층 시작에 알림 카드. 피의 길이면 '센' 변이(tier 2)만
//  - 갈림길(BLOOD_PATH): 보스 층을 깨면 출구 둘 — 「안전한 길」(영웅 발밑, 시즌 1 과 같은 출구) · 「피의 길」(붉은 문, 몇 칸 옆).
//    피의 길: 다음 전투 층 넷이 센 변이 + 층 돌파 보너스·골드 ×2 + 정예 확률 +0.15, 그다음 안식처에서 축복 하나 더
//  - 피의 계약(PACTS): 안식처에서 축복을 고른 뒤 계약 둘 중 하나를 맺거나 거절 (계약마다 큰 이득 + 진짜 손해, 한 판에 한 번씩)
//  - 상인(MERCHANT): 15·35·55…층 보스를 깨면 떠돌이 상인 로크 (런 골드로 치료 · 축복 · 다시 뽑기)
//  - 이정표: data/cosmetics.js TOWER_MILESTONES (10·20·30·40·50층 → 잔상, K1 장부)
//  - 기록: 결과·온라인 제출에 v: 2 (서버는 모르는 필드를 버린다), 기기 기록에 「시즌 2」 표시 (v 가 없는 옛 기록 = 시즌 1)
//  - 층 점수 상한: 한 층에서 오르는 점수는 TOWER_RULES.maxScorePerFloor 를 넘지 않는다 (장면이 world.addScore 를 감싼다) →
//    어떤 판이든 서버 검사 '점수 ≤ (돌파한 층 + 1) × maxScorePerFloor' 를 넘지 않는다. 층마다 건너뛸 수 없는 연출(TOWER_PHASE)은 그대로라
//    변이·계약·갈림길·상인이 한 층을 minFloorSec 보다 빨리 끝내게 하지 않는다 (tools/test_tower.mjs '욕심 판' 이 둘 다 잰다)

export const TOWER_VERSION = 2;
export const TOWER_SEASON = '시즌 2';
/** 층마다 건너뛸 수 없는 연출 (초): 등장(전투·보스·안식처) · 돌파 뒤 출구까지 · 출구 열림 — 장면(arcade_tower.js)이 이 값을 쓴다 */
export const TOWER_PHASE = Object.freeze({ enter: 1.2, bossEnter: 1.6, restEnter: 1.0, clear: 1.0, gateOpen: 0.8 });
/** 변이가 시작되는 층 (피의 길은 그 앞이라도 — 보스 층 5 다음이 6 이라 같은 값) */
export const MUT_FROM = 6;

/**
 * 변이 (id 는 기록·시험에 쓰인다). tier 1 = 순한 것(+ 황금·속공 같은 상), tier 2 = 센 것 (피의 길은 이것만). w = 뽑기 가중치.
 * 장면 쪽 효과: rules(월드 규칙 — dark), count(적 수 배율), scale·hp·foeAtk(적 하나하나의 크기·체력·공격), atk(층 전체 적 공격 — 난이도 배율),
 * allElite, gold(골드 배율), split(분열 수),
 * bomb(시체 폭발), rushSec(속공 초), killHeal·bleed·bleedFloor(흡혈의 밤), every·warn(낙뢰 간격·예고), heroAtk(영웅 공격 배율).
 * 피해를 주는 변이(시체 폭발·낙뢰)는 늘 0.6초 이상 바닥 표식을 먼저 보인다 (warn)
 */
export const MUTATORS = [
  { id: 'fog', name: '피의 안개', desc: '짙은 안개 · 영웅 곁만 보인다', icon: 'rift_lantern', color: '#d04a6a', tier: 1, w: 10, rules: { dark: true } },
  { id: 'giant', name: '거인의 층', desc: '적이 절반만 나오지만 크고 단단하다', icon: 'greatsword_7', color: '#d08a4a', tier: 1, w: 9, count: 0.5, scale: 1.4, hp: 2.4, foeAtk: 1.25 },
  { id: 'split', name: '분열', desc: '쓰러진 적이 작은 둘로 갈라진다', icon: 'gem_crystal', color: '#8ad04a', tier: 2, w: 8, split: 2, splitScale: 0.7, splitHp: 0.35 },
  { id: 'bomb', name: '폭발하는 시체', desc: '쓰러진 적이 잠시 뒤 터진다 · 붉은 원을 피하라', icon: 'sub_bomb', color: '#ff7a3a', tier: 2, w: 8, warn: 0.9, radius: 84, frac: 0.08 },
  { id: 'gold', name: '황금 층', desc: '골드를 세 배로 얻는다', icon: 'coin', color: '#ffd84a', tier: 1, w: 6, gold: 3 },
  { id: 'elite', name: '정예 무리', desc: '모든 적이 정예 · 대신 수가 줄어든다', icon: 'head_7', color: '#ffd070', tier: 2, w: 8, count: 0.6, allElite: true },
  { id: 'rush', name: '속공', desc: '30초 안에 돌파하면 축복 하나', icon: 'sub_stopwatch', color: '#7ae0ff', tier: 1, w: 8, rushSec: 30 },
  { id: 'vamp', name: '흡혈의 밤', desc: '처치하면 체력을 빨아들이지만 체력이 서서히 마른다', icon: 'wheart_3', color: '#e0405a', tier: 1, w: 7, killHeal: 0.04, bleed: 0.012, bleedFloor: 0.25 },
  { id: 'bolt', name: '낙뢰', desc: '벼락이 떨어진다 · 바닥의 표식을 피하라', icon: 'star_shard', color: '#e8f070', tier: 2, w: 8, every: 2.4, warn: 0.9, half: 34, frac: 0.1 },
  { id: 'mad', name: '광기의 층', desc: '적도 영웅도 주는 피해가 1.5배', icon: 'dagger_7', color: '#ff4a8a', tier: 2, w: 7, atk: 1.5, heroAtk: 1.5 },
];
export const MUTATOR = Object.freeze(Object.fromEntries(MUTATORS.map((m) => [m.id, m])));
/** 층 f 의 변이 (결정적). blood = 피의 길(센 변이만), prev = 앞 전투 층의 같은 길 변이 (연달아 같은 변이는 피한다). 변이 없음 = null */
export function mutatorOf(seed, f, blood = false, prev = null) {
  if (floorKind(f) !== 'combat' || f < MUT_FROM) return null;
  const pool = MUTATORS.filter((m) => (!blood || m.tier === 2) && m.id !== prev);
  const r = blood ? rngOf(seed, 'mut', f, 'blood') : rngOf(seed, 'mut', f);
  const tot = pool.reduce((a, m) => a + m.w, 0);
  let x = r.next() * tot;
  for (const m of pool) { x -= m.w; if (x < 0) return m.id; }
  return pool[pool.length - 1]?.id ?? null;
}

/** 피의 길: 보스 층 다음 floors 개의 전투 층에 센 변이 + 보너스·골드 배율 + 정예 확률, 그다음 안식처에서 축복 extraBless 개 더 */
export const BLOOD_PATH = Object.freeze({ floors: 4, bonusMul: 2, goldMul: 2, eliteAdd: 0.15, extraBless: 1 });

/**
 * 피의 계약 (안식처, 한 판에 계약마다 한 번). up = 이득 글, down = 손해 글. 장면 쪽 효과: stats(s) 능력치 (축복처럼 refreshStats 뒤),
 * rules(월드 규칙 — noPotion), noRestHeal(안식처 회복 없음), bless(지금 축복 하나 더), bossHp(다음 보스 체력 배율, 한 번), extraFoes(층마다 적 더)
 */
export const PACTS = [
  { id: 'fury', name: '광기의 계약', up: '공격력·마력 +40%', down: '물약을 쓸 수 없다', icon: 'sword_7', color: '#ff5a4a', rules: { noPotion: true },
    stats: (s) => { s.atk = Math.round(s.atk * 1.4); s.mag = Math.round(s.mag * 1.4); } },
  { id: 'edge', name: '칼날의 계약', up: '치명타 피해 +80%', down: '방어력·마법 저항이 절반', icon: 'dagger_5', color: '#ffd070',
    stats: (s) => { s.critDmg = (s.critDmg ?? 0) + 80; s.def = Math.round((s.def ?? 0) * 0.5); s.res = Math.round((s.res ?? 0) * 0.5); } },
  { id: 'greed', name: '탐욕의 계약', up: '골드 획득 2배', down: '안식처에서 회복하지 못한다', icon: 'moneybag', color: '#ffd84a', noRestHeal: true,
    stats: (s) => { s.goldBonus = (s.goldBonus ?? 0) + 100; } },
  { id: 'oath', name: '맹세의 계약', up: '지금 축복 하나를 더 받는다', down: '다음 군주의 체력 +50%', icon: 'scroll_bless', color: '#c8b8ff', bless: 1, bossHp: 1.5 },
  { id: 'thirst', name: '갈증의 계약', up: '흡혈 +5%', down: '최대 MP 가 절반', icon: 'wheart_5', color: '#e0405a',
    stats: (s) => { s.lifesteal = (s.lifesteal ?? 0) + 5; s.mp = Math.max(1, Math.round(s.mp * 0.5)); } },
  { id: 'swift', name: '질주의 계약', up: '이동·공격 속도 +20%', down: '층마다 적이 셋 더', icon: 'cloak_5', color: '#6affb0', extraFoes: 3,
    stats: (s) => { s.moveSpd = (s.moveSpd ?? 0) + 20; s.atkSpd = (s.atkSpd ?? 0) + 20; } },
];
export const PACT = Object.freeze(Object.fromEntries(PACTS.map((p) => [p.id, p])));
/** 안식처 f 의 계약 후보 (맺은 것 제외, 둘 — 결정적) */
export function pactOffer(seed, f, taken = {}, n = 2) {
  return rngOf(seed, 'pact', f).shuffle(PACTS.map((p) => p.id)).filter((id) => !taken[id]).slice(0, n);
}
/** 계약 능력치를 덧씌운다 (taken = {id: true}) */
export function applyPactStats(s, taken) {
  for (const p of PACTS) if (taken?.[p.id]) p.stats?.(s);
  return s;
}

/**
 * 떠돌이 상인 (로크 — data/npcs.js npc_rook): first 층부터 every 층마다의 보스 층을 깨고 축복을 고른 뒤. 값 = 기본값 × (1 + (층 레벨 − 1) × 0.3)
 * (적이 떨어뜨리는 골드와 같은 레벨 배율 — game/loot.js). heal = 체력 healFrac + MP 가득, bless = 카드 셋 중 하나 (한 번에 한 장), reroll = 카드 다시 뽑기
 */
export const MERCHANT = Object.freeze({ npc: 'npc_rook', first: 15, every: 20, heal: 30, bless: 70, reroll: 20, healFrac: 0.6 });
export const merchantAt = (f) => floorKind(f) === 'boss' && f >= MERCHANT.first && (f - MERCHANT.first) % MERCHANT.every === 0;
export function merchantPrice(base, level) { return Math.max(10, Math.round((base * (1 + (Math.max(1, level | 0) - 1) * 0.3)) / 10) * 10); }
