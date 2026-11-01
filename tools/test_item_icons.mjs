// 특별 아이템 전용 그림 아이콘 (Stage 7 icons) 시험 — owner: ICONS
// 사용: node tools/test_item_icons.mjs
//  1) 피의 유물 세트 부위(19) · 고유/신화(u_*) 베이스가 전용 키를 가리키고, assets/icons/<키>.png 가 128×128 PNG 로 있다 (작게: 하나 ≤ 12 KB)
//  2) data/item_icons.js ICON_FALLBACK (+ 재료 m_* · 중요 물품 k_*): 키마다 예전 일반 아이콘 파일이 있다 (전용 그림을 못 받을 때 render/icons.js 가 그린다) · 데이터 쪽과 1:1
//  3) 사냥 일지 등급 문장 hj_rank_1…6 (HUNT_RANKS 수와 같다) · huntRankIcon 범위 밖 값도 안전
//  4) 세이브 호환: 예전 일반 아이콘을 가진 인스턴스(가방 · 되사기)가 불러오기 뒤 베이스 아이콘으로 바뀐다 (멱등, 다른 필드는 그대로)
//  5) drawIcon 대체 경로: 전용 파일 없음 → 예전 키 그림 / 받는 중 → 예전 키 절차적 그림 (가짜 assets 로)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let fails = 0, passes = 0;
const ok = (cond, msg) => { if (cond) passes++; else { fails++; console.log('  ✗ ' + msg); } };
const section = (t) => console.log('▶ ' + t);
const LS = new Map();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (k) => (LS.has(k) ? LS.get(k) : null), setItem: (k, v) => LS.set(k, String(v)), removeItem: (k) => LS.delete(k) } });
const imp = (p) => import(path.join(ROOT, p));
const { ITEMS, UNIQUES } = await imp('src/data/items.js');
const { RELIC_SETS } = await imp('src/data/relic_sets.js');
const { ICON_FALLBACK, huntRankIcon } = await imp('src/data/item_icons.js');
const { HUNT_RANKS } = await imp('src/data/hunt_journal.js');
const { newGameState, migrateState } = await imp('src/game/state.js');
const INV = await imp('src/game/inventory.js');
const { makeItem } = await imp('src/data/items.js');

const iconFile = (k) => path.join(ROOT, 'assets/icons', k + '.png');
/** PNG 머리말 → {w, h} (아니면 null) */
function pngSize(f) {
  try {
    const b = fs.readFileSync(f);
    if (b.length < 24 || b.readUInt32BE(0) !== 0x89504e47 || b.toString('latin1', 12, 16) !== 'IHDR') return null;
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), bytes: b.length };
  } catch { return null; }
}

section('세트 부위 · 고유 아이템이 전용 키를 가리킨다');
const pieces = Object.values(RELIC_SETS).flatMap((S) => S.pieces.map((p) => p[0]));
ok(pieces.length === 19, `세트 부위 19개 (${pieces.length})`);
for (const id of pieces) ok(ITEMS[id]?.icon === id, `${id} 아이콘 = 자기 id (${ITEMS[id]?.icon})`);
// 고유: 7단계 icons 때 51개 전부 전용. 그 뒤에 새로 생긴 고유(다른 작업 줄의 새 보스 드롭 등)는 전용 그림이 생길 때까지 일반 아이콘이어도 된다 (알림만)
const OWN_U = UNIQUES.filter((id) => ITEMS[id]?.icon === id), NO_U = UNIQUES.filter((id) => ITEMS[id]?.icon !== id);
ok(OWN_U.length >= 51, `전용 아이콘 고유 ${OWN_U.length}개 (≥ 51)`);
if (NO_U.length) console.log(`  · 전용 아이콘이 아직 없는 고유 ${NO_U.length}개: ${NO_U.join(' ')} (일반 아이콘 그대로 — tools/higgsfield/README.md 순서로 만들 수 있다)`);
for (const id of NO_U) ok(fs.existsSync(iconFile(ITEMS[id]?.icon ?? '')), `${id} 일반 아이콘 ${ITEMS[id]?.icon}.png 있음`);
let bytes = 0;
for (const id of [...pieces, ...OWN_U]) {
  const s = pngSize(iconFile(id));
  ok(s && s.w === 128 && s.h === 128, `${id}.png 128×128 PNG`);
  ok(s && s.bytes <= 12 * 1024, `${id}.png ≤ 12 KB (${s?.bytes})`);
  bytes += s?.bytes ?? 0;
}
console.log(`  전용 아이콘 (세트 + 고유) ${pieces.length + OWN_U.length}개 · ${(bytes / 1024).toFixed(1)} KB`);

section('대체 아이콘 표 (data/item_icons.js)');
const keys = Object.keys(ICON_FALLBACK);
const extra = keys.filter((k) => !pieces.includes(k) && !OWN_U.includes(k));
ok(keys.length >= pieces.length + OWN_U.length && extra.every((k) => /^[mkc]_/.test(k)), `대체 표 ${keys.length} = 세트 ${pieces.length} + 고유 ${OWN_U.length} + 재료·중요 물품·소모품 ${extra.length}`);
for (const k of extra) {
  ok(ITEMS[k]?.icon === k, `${k} 아이콘 = 자기 id (${ITEMS[k]?.icon})`);
  const s = pngSize(iconFile(k));
  ok(s && s.w === 128 && s.h === 128 && s.bytes <= 12 * 1024, `${k}.png 128×128 · ≤ 12 KB (${s?.bytes})`);
}
// 다른 아이템의 전용 아이콘을 빌려 쓰는 베이스가 없다 (전용 키는 그 아이템만)
for (const b of Object.values(ITEMS)) if (Object.hasOwn(ICON_FALLBACK, b.icon)) ok(b.icon === b.id, `${b.id} 가 남의 전용 아이콘 ${b.icon} 을 쓰지 않는다`);
for (const id of [...pieces, ...OWN_U]) ok(Object.hasOwn(ICON_FALLBACK, id), `${id} 대체 아이콘 있음`);
for (const [k, v] of Object.entries(ICON_FALLBACK)) {
  ok(typeof v === 'string' && !Object.hasOwn(ICON_FALLBACK, v), `${k} → ${v} (일반 키)`);
  ok(fs.existsSync(iconFile(v)), `${k} 의 대체 ${v}.png 있음`);
  const it = ITEMS[k];
  if (it) ok(it.slot !== 'weapon' || v.startsWith(it.wtype + '_'), `${k} 대체 아이콘이 같은 무기 계열 (${v})`);
}
// 일반 장비(세트·고유 아님)는 그대로 일반 키
const plain = Object.values(ITEMS).filter((b) => !b.unique && !b.set && ['weapon', 'head', 'body', 'cloak', 'acc'].includes(b.slot));
ok(plain.length > 50 && plain.every((b) => !Object.hasOwn(ICON_FALLBACK, b.icon)), `일반 장비 ${plain.length}개는 일반 아이콘 그대로`);

section('사냥 일지 등급 문장');
ok(HUNT_RANKS.length === 6, `등급 6개 (${HUNT_RANKS.length})`);
for (let r = 0; r < HUNT_RANKS.length; r++) {
  const k = huntRankIcon(r), s = pngSize(iconFile(k));
  ok(k === `hj_rank_${r + 1}`, `등급 ${r} → ${k}`);
  ok(s && s.w === 128 && s.h === 128 && s.bytes <= 12 * 1024, `${k}.png 128×128 · ≤ 12 KB (${s?.bytes})`);
}
ok(huntRankIcon(-3) === 'hj_rank_1' && huntRankIcon(99) === 'hj_rank_6' && huntRankIcon(undefined) === 'hj_rank_1', 'huntRankIcon 범위 밖 → 끝 값');

section('세이브 호환 (예전 일반 아이콘 인스턴스)');
{
  const st = newGameState({ slot: 1 });
  const a = makeItem('rs_void_head', 2), b = makeItem('u_paracel', 4), c = makeItem('w_sword_3', 1), d = makeItem('rs_blood_ring', 2);
  a.icon = 'head_7'; b.icon = 'amulet_5'; a.level = 5; a.locked = true;
  const cIcon = c.icon;
  st.inventory.push(a, b, c);
  st.buyback = [{ item: { ...d, icon: 'ring_6' }, price: 100, left: 3 }];
  const s2 = migrateState(JSON.parse(JSON.stringify(st)));
  const f = (id) => s2.inventory.find((i) => i.uid === id);
  ok(f(a.uid)?.icon === 'rs_void_head' && f(a.uid)?.level === 5 && f(a.uid)?.locked === true, '가방 세트 부위 → 전용 아이콘 (강화·잠금 그대로)');
  ok(f(b.uid)?.icon === 'u_paracel', '가방 고유 → 전용 아이콘');
  ok(f(c.uid)?.icon === cIcon, '일반 무기 아이콘 그대로');
  const s3 = migrateState(JSON.parse(JSON.stringify(s2)));
  ok(JSON.stringify(s3.inventory) === JSON.stringify(s2.inventory), '멱등');
  const bb = INV.buybackList(s2);
  ok(bb.length === 1 && bb[0].item.icon === 'rs_blood_ring', '되사기 목록도 전용 아이콘');
  const odd = makeItem('u_nyx', 5); delete odd.icon;
  const s4 = migrateState({ ...JSON.parse(JSON.stringify(st)), inventory: [odd] });
  ok(s4.inventory[0]?.icon === 'u_nyx', '아이콘 없는 옛 인스턴스도 채운다');
}

section('drawIcon 대체 경로 (가짜 assets)');
{
  const { assets } = await imp('src/core/assets.js');
  const { drawIcon } = await imp('src/render/icons.js');
  const fakeImg = (k) => ({ k, width: 128, height: 128 });
  const state = { have: new Set(), failed: new Set() };
  const orig = { get: assets.get, failed: assets.failed };
  const asked = [];
  assets.get = (key) => { asked.push(key); return state.have.has(key) ? fakeImg(key) : null; };
  assets.failed = (key) => state.failed.has(key);
  const drawn = [];
  const ctx = new Proxy({}, { get: (t, p) => (p in t ? t[p] : p === 'drawImage' ? (img) => drawn.push(img.k) : p === 'measureText' ? () => ({ width: 10 }) : p.startsWith('create') ? () => ({ addColorStop() {} }) : () => {}), set: (t, p, v) => { t[p] = v; return true; } });
  try {
    state.have.add('icons/u_nyx');
    drawIcon(ctx, 'u_nyx', 0, 0, 40);
    ok(drawn.at(-1) === 'icons/u_nyx', '전용 파일이 있으면 전용 그림');
    state.have.delete('icons/u_nyx'); state.have.add('icons/dagger_5'); asked.length = 0; drawn.length = 0;
    drawIcon(ctx, 'u_nyx', 0, 0, 40);
    ok(drawn.length === 0 && !asked.includes('icons/dagger_5'), '받는 중: 예전 그림 파일을 요청하지 않고 절차적 그림');
    state.failed.add('icons/u_nyx');
    drawIcon(ctx, 'u_nyx', 0, 0, 40);
    ok(drawn.at(-1) === 'icons/dagger_5', '전용 파일을 못 받으면 예전 일반 아이콘 그림');
    drawn.length = 0; state.have.clear();
    let threw = false; try { drawIcon(ctx, 'u_nyx', 0, 0, 40); drawIcon(ctx, 'no_such_icon', 0, 0, 40); drawIcon(ctx, undefined, 0, 0, 40); } catch (e) { threw = e; }
    ok(!threw, `둘 다 없으면 절차적 그림 (예외 없음${threw ? ': ' + threw.message : ''})`);
  } finally { assets.get = orig.get; assets.failed = orig.failed; }
}

console.log(`\n${fails ? '✗' : '✓'} test_item_icons: ${passes} 통과, ${fails} 실패`);
process.exit(fails ? 1 : 0);
