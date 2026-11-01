// 「피의 유물」 장비 세트 (Stage 6 — owner: RELIC). 순수 데이터 + 순수 함수 (DOM·게임 상태 접근 없음, 아무것도 import 하지 않는다)
//  같은 세트(base.set === 세트 id) 부위를 여러 개 끼우면 2/4/5개째에 보너스가 붙는다 (game/stats.js computeStats 가 더한다).
//  · 세는 법: 한 영웅이 끼운 장비 중 같은 세트의 '서로 다른 베이스' 수 (같은 장신구 두 개는 1개로 센다)
//  · 보너스는 능력치(stats.js STAT_INFO 키)만 — 새 전투 시스템 없음. 가장 높은 단계의 특수 효과도 기존 능력치(공중 점프·필살 게이지 등)로만
//  · 외전 신화 「사냥꾼의 달」(set:'hunt', 무기 일곱 자루)은 한 번에 하나만 들 수 있어 여기 없다 → 세트 보너스 없음 (기존 그대로)
//  · 부위 베이스는 data/items.js 가 아래 PIECES 로 만든다 (일반 장비처럼 희귀도·추가 옵션·강화가 붙는다; 무작위 장비 풀에는 안 들어간다)
//  · 드롭: game/loot.js 가 drop.stages(스테이지 적: 정예 1.5% · 일반 0.15%) / drop.bosses(보스 12%) 로 낮은 확률로 떨어뜨린다
//  공개: RELIC_SETS, RELIC_SET_IDS, SET_PIECES(세트 id → 베이스 id 목록), setOfBase(base), countSets(bases), setBonusStats(counts), setBonusLines(setId, n)
//        setDropFor(stageId, bossId) → 그 스테이지/보스에서 나올 수 있는 세트 id 목록

/**
 * 세트 정의. tier = 아이템 단계(1~7), band = 레벨대 설명, bonus = [{n, stats, label?}] (n개 이상 끼우면 적용, 누적)
 * pieces: [id, slot('head'|'body'|'cloak'|'acc'), 이름, 아이콘, 외형, 능력치(방어구는 추가분 — 기본 방어/저항은 단계에서), 설명]
 */
export const RELIC_SETS = {
  bloodmoon: {
    id: 'bloodmoon', name: '혈월 사냥꾼', tier: 2, lv: 6, band: '1부 초반', color: '#ff5a6a',
    drop: { stages: ['s02', 's03', 's04', 's05'], bosses: ['b_banshee', 'b_dullahan', 'b_crimson', 'b_bonedragon'] },
    bonus: [
      { n: 2, stats: { atk: 2, crit: 3 } },
      { n: 4, stats: { atk: 2, lifesteal: 1.5, moveSpd: 4 } },
    ],
    pieces: [
      ['rs_blood_head', 'head', '혈월 사냥꾼의 두건', 'head_1', { headgear: 'hood', color: '#4a1018' }, { agi: 2 }, '붉은 달이 뜨는 밤에만 쓰던 사냥꾼의 두건. 피 냄새가 배어 있다.'],
      ['rs_blood_body', 'body', '혈월 사냥꾼의 가죽옷', 'body_2', { armor: 'leather', color: '#4a1420', trim: '#c8a040' }, { agi: 2, hp: 10 }, '흡혈귀의 피를 먹여 무두질한 가죽옷. 달빛 아래서 검붉게 빛난다.'],
      ['rs_blood_cloak', 'cloak', '혈월 사냥꾼의 망토', 'cloak_3', { cape: 'tattered', color: '#7a0a1e', color2: '#2a0610', len: 1.05 }, { moveSpd: 3 }, '핏빛 달을 수놓은 망토. 사냥꾼들은 이 망토를 보고 서로를 알아봤다.'],
      ['rs_blood_ring', 'acc', '혈월 사냥꾼의 반지', 'ring_6', null, { atk: 2, crit: 2 }, '붉은 달을 닮은 보석 반지. 끼면 맥박이 조금 빨라진다.'],
    ],
  },
  cathedral: {
    id: 'cathedral', name: '성당 기사', tier: 4, lv: 21, band: '1부 중반', color: '#ffe08a',
    drop: { stages: ['s08', 's09', 's10', 's11'], bosses: ['b_leviathan', 'b_colossus', 'b_frostqueen', 'b_death'] },
    bonus: [
      { n: 2, stats: { def: 8, res: 6 } },
      { n: 4, stats: { hp: 60, dmgReduce: 3, holy: 8, resDark: 10 } },
    ],
    pieces: [
      ['rs_cath_head', 'head', '성당 기사의 투구', 'head_3', { headgear: 'helm', color: '#d8d4c8' }, { hp: 15 }, '성당 기사단이 쓰던 흰 투구. 이마에 작은 성호가 새겨져 있다.'],
      ['rs_cath_body', 'body', '성당 기사의 갑옷', 'body_5', { armor: 'holy', color: '#e8e4d8', trim: '#c8a040' }, { resDark: 6 }, '종소리가 울리면 빛난다는 기사단의 갑옷. 무겁지만 마음이 놓인다.'],
      ['rs_cath_cloak', 'cloak', '성당 기사의 망토', 'cloak_5', { cape: 'royal', color: '#efe6d0', color2: '#8a1426', len: 1.15 }, { hpRegen: 0.4 }, '기사단장이 손수 성호를 수놓은 망토. 안감은 순교자의 피처럼 붉다.'],
      ['rs_cath_amulet', 'acc', '성당 기사의 묵주', 'amulet_1', { color: '#fff2b0', type: 'holy' }, { res: 6, holy: 8, resDark: 6 }, '기사들이 출정 전에 쥐던 묵주. 알 하나하나에 기도가 담겨 있다.'],
      ['rs_cath_ring', 'acc', '성당 기사의 인장', 'ring_1', null, { atk: 8, def: 4 }, '기사단 문장이 새겨진 인장 반지. 성당 문을 여는 열쇠이기도 했다.'],
    ],
  },
  alchemist: {
    id: 'alchemist', name: '연금술사', tier: 5, lv: 30, band: '1부 후반 · 파라켈의 공방', color: '#7ee0c0',
    drop: { stages: ['s26', 's11', 's12'], bosses: ['b_paracel'] },
    bonus: [
      { n: 2, stats: { mag: 10, mpRegen: 0.8 } },
      { n: 4, stats: { skillDmg: 10, subDmg: 12, cdr: 5 } },
    ],
    pieces: [
      ['rs_alch_head', 'head', '연금술사의 고글 모자', 'head_2', { headgear: 'wide_hat', color: '#3a3020' }, { mag: 3 }, '파라켈 공방의 견습생이 쓰던 모자. 챙에 깨진 렌즈가 매달려 있다.'],
      ['rs_alch_body', 'body', '연금술사의 작업복', 'body_1', { armor: 'leather', color: '#4a3a24', trim: '#7ee0c0' }, { mp: 25, resFire: 8 }, '약품에 그을린 두꺼운 작업복. 주머니마다 빈 플라스크가 들어 있다.'],
      ['rs_alch_cloak', 'cloak', '연금술사의 망토', 'cloak_2', { cape: 'plain', color: '#2a4a3a', color2: '#10201a', len: 1 }, { mp: 15, cdr: 3 }, '수은 얼룩이 별자리처럼 번진 망토. 불에 잘 타지 않는다.'],
      ['rs_alch_flask', 'acc', '연금술사의 플라스크', 'potion_mp', { color: '#7ee0c0', type: 'ice' }, { mag: 8, subDmg: 8 }, '끝없이 끓는 초록 물약이 든 작은 병. 마개를 열면 안 된다.'],
      ['rs_alch_ring', 'acc', '연금술사의 반지', 'ring_3', null, { mag: 6, mp: 20, mpRegen: 0.4 }, '현자의 돌 부스러기를 박았다는 반지. 진짜인지는 아무도 모른다.'],
    ],
  },
  void: {
    id: 'void', name: '공허 순례자', tier: 7, lv: 52, band: '2부', color: '#c07cff',
    drop: { stages: ['s15', 's16', 's17', 's18', 's19', 's20'], bosses: ['b_moloch', 'b_dagon', 'b_ziz', 'b_mara', 'b_behemoth', 'b_nihil'] },
    bonus: [
      { n: 2, stats: { hp: 60, res: 10 } },
      { n: 4, stats: { atk: 12, mag: 12, critDmg: 12 } },
      { n: 5, stats: { airJumps: 1, ultGain: 15 }, label: '공허 걸음' },
    ],
    pieces: [
      ['rs_void_head', 'head', '공허 순례자의 두건', 'head_7', { headgear: 'hood', color: '#1a0a24' }, { mag: 8 }, '공허를 걸어 건넌 순례자의 두건. 안쪽에 별이 하나 떠 있다.'],
      ['rs_void_body', 'body', '공허 순례자의 법의', 'body_7', { armor: 'dark', color: '#24102e', trim: '#c07cff' }, { resDark: 12 }, '빛이 스며들지 않는 천으로 지은 법의. 입으면 발소리가 사라진다.'],
      ['rs_void_cloak', 'cloak', '공허 순례자의 망토', 'cloak_7', { cape: 'tattered', color: '#140a1e', color2: '#6a2a8a', len: 1.2 }, { moveSpd: 4 }, '끝자락이 허공에 녹아드는 망토. 바람이 없어도 펄럭인다.'],
      ['rs_void_amulet', 'acc', '공허 순례자의 나침반', 'amulet_7', { color: '#c07cff', type: 'dark' }, { mag: 16, ultGain: 6, mp: 30 }, '바늘이 늘 아무것도 없는 쪽을 가리키는 나침반.'],
      ['rs_void_ring', 'acc', '공허 순례자의 반지', 'ring_7', null, { atk: 18, crit: 5, hp: 40 }, '가운데가 텅 빈 반지. 들여다보면 반대편이 아니라 밤하늘이 보인다.'],
    ],
  },
};
export const RELIC_SET_IDS = Object.keys(RELIC_SETS);
/** 세트 id → 부위 베이스 id 목록 */
export const SET_PIECES = Object.fromEntries(RELIC_SET_IDS.map((k) => [k, RELIC_SETS[k].pieces.map((p) => p[0])]));
const PIECE_SET = {};
for (const k of RELIC_SET_IDS) for (const id of SET_PIECES[k]) PIECE_SET[id] = k;

/** 베이스(또는 베이스 id) → 세트 정의 (없으면 null; 'hunt' 같은 보너스 없는 표식은 null) */
export function setOfBase(b) {
  const id = typeof b === 'string' ? PIECE_SET[b] : b?.set;
  return (id && RELIC_SETS[id]) || null;
}
/** 끼운 장비 베이스 목록 → { 세트 id: 서로 다른 부위 수 } */
export function countSets(bases) {
  const seen = {};
  for (const b of bases || []) {
    const S = setOfBase(b);
    if (!S) continue;
    (seen[S.id] ??= new Set()).add(typeof b === 'string' ? b : b.id);
  }
  const out = {};
  for (const k in seen) out[k] = seen[k].size;
  return out;
}
/** 세트별 부위 수 → 합친 보너스 능력치 (단계는 누적) */
export function setBonusStats(counts) {
  const out = {};
  for (const k in counts || {}) {
    const S = RELIC_SETS[k];
    if (!S) continue;
    for (const t of S.bonus) if ((counts[k] | 0) >= t.n) for (const s in t.stats) out[s] = (out[s] ?? 0) + t.stats[s];
  }
  return out;
}
/** 보너스 단계 설명 줄: [{n, text, on}] — fmt(stat, v) 는 능력치 문구 함수 (items.js fmtStat) */
export function setBonusLines(setId, n, fmt) {
  const S = RELIC_SETS[setId];
  if (!S) return [];
  return S.bonus.map((t) => ({
    n: t.n, on: (n | 0) >= t.n,
    text: `${t.n}세트: ${t.label ? t.label + ' — ' : ''}${Object.entries(t.stats).map(([k, v]) => (fmt ? fmt(k, v) : `${k} +${v}`)).join(', ')}`,
  }));
}
/** 이 스테이지 / 보스에서 나올 수 있는 세트 id 목록 */
export function setDropFor(stageId, bossId) {
  const out = [];
  for (const k of RELIC_SET_IDS) {
    const d = RELIC_SETS[k].drop;
    if ((bossId && d.bosses.includes(bossId)) || (!bossId && stageId && d.stages.includes(stageId))) out.push(k);
  }
  return out;
}
