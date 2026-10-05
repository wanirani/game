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
//  방은 그 단계 ±1 의 방 중 최근 4층에 나오지 않은 것, 적 풀은 단계-1 ~ 단계 스테이지의 적 (서바이벌과 같은 제외 규칙).
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
  minFloorSec: 8,            // 온라인 기록 검사: 걸린 시간 ≥ 돌파한 층 × 8초
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
  constructor(seed, { stages, order, enemies, bosses = [], P = 25, eliteBase = 0 } = {}) {
    this.seed = seed >>> 0;
    this.stages = stages; this.order = order ?? []; this.enemies = enemies; this.bosses = bosses; this.P = P; this.eliteBase = eliteBase;
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
    while (this.plans.length < f) this.plans.push(this.make(this.plans.length + 1));
    return this.plans[f - 1];
  }
  make(f) {
    const kind = floorKind(f), tier = this.tierOf(f), level = TOWER_CURVE.level(this.P, f);
    if (kind === 'rest') return { f, kind, tier, level, enemies: [] };
    if (kind === 'boss') {
      const B = this.bosses;
      let bossId = null;
      if (B.length) {
        const n = this.order.length || 1;
        let i = Math.floor((f - 1) / 2) < n ? Math.min(B.length - 1, Math.round((tier / Math.max(1, n - 1)) * (B.length - 1))) : rngOf(this.seed, 'boss', f).int(0, B.length - 1);
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
