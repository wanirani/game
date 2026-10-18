// AUTO-QOL 시험 (자동 전투 · 대상 고정 · 바로 장착 바인딩 · 지도 가방 경고 · 마을 선명 칸) — 설계 /tmp/claude-0/s3/auto/auto_design.md
// 사용: node tools/test_autoplay.mjs [--node | --browser] [--only s01,s08,boss,override,lock,pause,touch,phonepill,equip,worldmap,town] [--shots dir]
//   노드: segmentAt · weaponReach · skillRange · decide · pickLock · autoSettings/setLevel · input 가상 입력원(사람 우선) · 패드 몸짓 · settings.auto 이관
//   브라우저 (데스크톱 1280×720, 터치는 fold_open; Math.random 고정; 게임 시간은 lib/step.mjs 로 한 스텝씩):
//     s01      s01 r1 — 「자동 전투」만으로 시작 구간의 닿는 적을 모두 처치 (게임 시간 90초 안), 방을 떠나지 않음 · 낙사 0 · 가시 피해 0 · 대화 0
//     s08      s08 r2 위층 회랑 (Lv 20, 같은 스테이지 적 3마리를 더 세움) — 같은 규칙, 물길로 떨어지지 않음
//     boss     s04 보스방 (Lv 10, 물약 3) — 보스전에서 30초 생존 + 보스에게 피해, 예고 공격 물러서기 기록
//     override 사람 ← 키가 즉시 이긴다 (자동은 → 쪽), 뗀 뒤 다시 자동
//     lock     T 키: 앞의 적 고정 → 다시 = 다음 적 → 두 번 빠르게 = 해제 · 길게 = 해제 · 대상이 죽으면 풀림 · 표적 고리 그림
//     pause    일시정지 동안 자동 입력 0 · 영웅이 움직이지 않음
//     touch    fold_open: AUTO 버튼 탭 = 다음 단계, 길게 = 끔 · 고정 버튼 · 마을에서는 둘 다 없음
//     equip    N 키 = 「바로 장착」 (▲ 토스트) · 안내 글자 기기별
//     worldmap 가방 남은 칸 ≤ 5 → 출발 전 확인 창 (그대로 출발 / 일괄 처분 → 메뉴 인벤토리 일괄 처분 창 / 취소)
//     town     fold_open 마을: 오른쪽 위 판이 선명 칸(town_tr)으로 붙는다
// 종료 코드: 실패가 있으면 1
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const NODE_ONLY = argv.includes('--node'), BROWSER_ONLY = argv.includes('--browser');
const ONLY = arg('--only') ? arg('--only').split(',').map((s) => s.trim()) : null;
const SHOTS = arg('--shots', '/tmp/claude-0/s3/auto/test_autoplay');
let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, info) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; fails.push(name); console.log(`  ✗ ${name}${info !== undefined ? ' — ' + (typeof info === 'string' ? info : JSON.stringify(info)) : ''}`); }
}

// ───────────────────────── 노드 ─────────────────────────
async function nodeTests() {
  const A = await import(path.join(ROOT, 'src/game/autoplay.js'));
  const { T } = await import(path.join(ROOT, 'src/core/physics.js'));
  const { MOVESETS } = await import(path.join(ROOT, 'src/data/movesets.js'));
  const { SKILLS } = await import(path.join(ROOT, 'src/data/skills.js'));
  const TILE = 48;
  /** ASCII 지도: '#' 벽 '=' 발판 '^' 가시 '~' 액체 'h' 가짜 벽, 나머지 빈칸. 위·옆 밖은 벽 */
  const mapOf = (rows) => {
    const h = rows.length, w = rows[0].length;
    const C = { '#': T.SOLID, '=': T.ONEWAY, '^': T.SPIKE, '~': T.LIQUID, h: T.FAKE };
    return { w, h, typeAt: (x, y) => (y < 0 ? T.EMPTY : y >= h ? T.EMPTY : x < 0 || x >= w ? T.SOLID : C[rows[y][x]] ?? T.EMPTY) };
  };
  const at = (tx) => tx * TILE + TILE / 2;
  const foot = (row) => row * TILE;   // 발 y = 바닥 줄 위
  console.log('\n[node] segmentAt');
  {
    const m = mapOf(['                    ', '                    ', '                    ', '####################']);
    const s = A.segmentAt(m, at(10), foot(3), { halfW: 16 });
    ok(s && s.why0 === 'edge' && s.why1 === 'edge', '평평한 바닥: 양쪽 끝은 방 끝', s);
    ok(s && Math.abs(s.x0 - (16 + A.K.EDGE + A.K.EXIT)) < 0.01 && Math.abs(s.x1 - (20 * TILE - 16 - A.K.EDGE - A.K.EXIT)) < 0.01, '방 끝(출구)에서 몸 반폭 + 여백 + 한 칸 더 떨어진다', s);
    ok(A.segmentAt(m, at(10), foot(2), { halfW: 16 }) === null, '공중(발밑이 빈칸) → null');
  }
  {
    const m = mapOf(['                    ', '                    ', '                    ', '#######   ##########']);
    const s = A.segmentAt(m, at(3), foot(3), { halfW: 16 });
    ok(s && s.why1 === 'pit' && s.x1 <= 7 * TILE - 16, '구덩이(3칸 넘게 빔) 앞에서 멈춘다', s);
  }
  {
    const m = mapOf(['                    ', '                    ', '                    ', '#######^^^##########']);
    const s = A.segmentAt(m, at(3), foot(3), { halfW: 16 });
    ok(s && s.why1 === 'spike' && s.x1 <= 7 * TILE - 16, '가시 바닥 앞에서 멈춘다', s);
  }
  {
    const m = mapOf(['                    ', '                    ', '       ~~~          ', '####################']);
    const s = A.segmentAt(m, at(3), foot(3), { halfW: 16 });
    ok(s && s.why1 === 'liquid', '몸 높이의 물(얕은 물웅덩이) 앞에서 멈춘다', s);
  }
  {
    const m = mapOf(['                    ', '        #           ', '        #           ', '        #           ', '####################']);
    const s = A.segmentAt(m, at(3), foot(4), { halfW: 16 });
    ok(s && s.why1 === 'wall', '3칸 벽 앞에서 멈춘다 (넘지 않는다)', s);
  }
  {
    const m = mapOf(['                    ', '                    ', '        ###         ', '####################']);
    const s = A.segmentAt(m, at(3), foot(3), { halfW: 16 });
    ok(s && s.why1 === 'edge' && s.links.length === 2, '1칸 턱은 오르내려 잇는다 (링크 2개)', s?.links);
    ok(A.stepAhead(s, 8 * TILE - 26, 16, 1, 26) === 1 && A.stepAhead(s, 3 * TILE, 16, 1, 26) === 0, 'stepAhead: 턱 바로 앞에서만 1');
    ok(A.floorAt(s, at(9)) === foot(2) && A.floorAt(s, at(4)) === foot(3), 'floorAt: 턱 위는 한 칸 높다');
  }
  {
    const m = mapOf(['                    ', '                    ', '        #           ', '        #           ', '####################'.slice(0, 20)]);
    const s = A.segmentAt(m, at(3), foot(4), { halfW: 16 });
    ok(s && s.links.length === 2 && Math.min(...s.rows) === 2, '2칸 턱(머리 위가 비었음)도 잇는다', s?.rows);
  }
  {
    const m = mapOf(['                    ', '                    ', '                    ', '######              ', '######              ', '######              ', '####################']);
    const s = A.segmentAt(m, at(2), foot(3), { halfW: 16 });
    ok(s && s.why1 === 'pit' && s.x1 < 6 * TILE, '3칸 낭떠러지는 내려가지 않는다', s);
  }
  {
    const m = mapOf(['                    ', '                    ', '      #             ', '####### ^^^#########']);
    const s = A.segmentAt(m, at(2), foot(3), { halfW: 16 });
    ok(s && s.x1 < 6 * TILE, '턱 너머 안전한 바닥이 3칸 안 되면 턱 앞에서 끊는다', s);
  }
  {
    const m = mapOf(['                    ', '                    ', '                    ', '####################']);
    const s = A.segmentAt(m, at(10), foot(3), { halfW: 16, blocks: [{ x0: 14 * TILE, x1: 15 * TILE, why: 'story' }, { x0: -1e9, x1: 5 * TILE, why: 'arena' }] });
    ok(s && s.why1 === 'story' && s.x1 <= 14 * TILE - 16 && s.why0 === 'arena' && s.x0 >= 5 * TILE + 16, '이야기 트리거·경기장 벽 기둥은 넘지 않는다', s);
  }
  {
    const m = mapOf(['                    ', '                    ', '      ###           ', '####################']);
    const s = A.segmentAt(m, 9 * TILE + 13, foot(2), { halfW: 14 });
    ok(!!s, '턱 끝에 몇 px 걸쳐 서도 구간이 나온다 (멈춰 서지 않게)', s);
  }
  console.log('\n[node] weaponReach · skillRange');
  {
    const w = A.weaponReach(MOVESETS.whip, { reach: 0 });
    ok(w.bx === 12 && w.bw === 150 && !w.ranged && w.up, '채찍: 앞 12..162, 위 공격 상자', w);
    const g = A.weaponReach(MOVESETS.gun, {});
    ok(g.ranged && g.bw > 500, '총: 탄 사거리 (speed × life × 0.8)', g);
    const r = A.weaponReach(MOVESETS.whip, { reach: 20 });
    ok(Math.abs(r.bw - 180) < 0.01, 'reach 20% → 사거리 ×1.2');
    const sk = A.skillRange(SKILLS.kael_vigilia, 3);
    ok(sk.fx === 380, `v.r 레벨 반영 (300 + 40×2 = 380): ${sk.fx}`);
    ok(A.skillRange({}, 1).fx === 300, 'v.r 없으면 앞 300');
  }
  console.log('\n[node] decide');
  const W = A.weaponReach(MOVESETS.whip, {});
  const base = (o = {}) => ({
    t: 10, level: 'battle', cfg: { ...A.DEFAULTS, level: 'battle' },
    p: { cx: 500, bottom: 600, halfW: 16, facing: 1, onGround: true, hpFrac: 1, mp: 50, sp: 0, awReady: false, dashReady: true, moving: false, dead: false, hurt: false, riding: false, noMove: false, inBoss: false, ...(o.p ?? {}) },
    w: W, skills: o.skills ?? [], page: 0, seg: o.seg ?? { x0: 100, x1: 1500, why0: 'edge', why1: 'edge', ty: 12, c0: 0, rows: Array(40).fill(12), links: [] },
    foes: o.foes ?? [], propsNear: !!o.propsNear, pickups: o.pickups ?? [], potion: o.potion ?? null, guardReady: !!o.guardReady,
    ...(o.top ?? {}),
  });
  const foe = (cx, o = {}) => ({ id: o.id ?? 'zombie', cx, bottom: o.bottom ?? 600, x0: cx - 14, x1: cx + 14, y0: (o.bottom ?? 600) - 80, y1: o.bottom ?? 600, boss: !!o.boss, elite: !!o.elite, flying: !!o.flying, tele: !!o.tele, windup: !!o.windup, invuln: !!o.invuln, locked: !!o.locked });
  const run = (snap, mem = A.newMem(), n = 1) => { let r; for (let i = 0; i < n; i++) { r = A.decide(snap, mem); snap.t += 1 / 60; } return r; };
  {
    const r = A.decide({ ...base(), level: 'off' }, A.newMem());
    ok(Object.keys(r.act).length === 0, '끔 → 입력 없음');
  }
  {
    const s = base({ foes: [foe(600)] });
    const mem = A.newMem();
    const a1 = A.decide(s, mem), a2 = A.decide(s, mem);
    ok((a1.act.attack ? 1 : 0) + (a2.act.attack ? 1 : 0) === 1, '사거리 안 앞의 적: 공격을 스텝마다 번갈아 누름 (모아베기 아님)', [a1.act, a2.act]);
    ok(!a1.act.left && !a1.act.right, '이미 닿으면 다가가지 않는다', a1.act);
  }
  {
    const r = run(base({ foes: [foe(1100)] }));
    ok(r.act.right && !r.act.attack && r.why === 'approach', '「자동 전투」: 같은 바닥의 먼 적에게 다가간다', r);
  }
  {
    const s = base({ foes: [foe(1100)] }); s.level = 'skill';
    const r = A.decide(s, A.newMem());
    ok(!r.act.right && !r.act.left, '「자동 스킬」: 이동하지 않는다 (먼 적)', r.act);
  }
  {
    const s = base({ foes: [foe(420)] }); s.level = 'skill';
    const r = A.decide(s, A.newMem());
    ok(r.act.left, '「자동 스킬」: 뒤의 적이 사거리 안이면 한 스텝 돌아선다', r.act);
  }
  {
    const s = base({ foes: [foe(1700)], seg: { x0: 100, x1: 900, why0: 'edge', why1: 'pit', ty: 12, c0: 0, rows: Array(40).fill(12), links: [] } });
    s.p.cx = 899;
    const r = A.decide(s, A.newMem());
    ok(!r.act.right, '구간 끝(구덩이)에서는 대상이 건너편이어도 더 가지 않는다', r);
    s.p.cx = 700;
    const r2 = A.decide(s, A.newMem());
    ok(!r2.act.right && r2.why !== 'approach', '닿을 수 없는 적(구덩이 너머)은 대상으로 삼지 않는다', r2);
  }
  {
    const r = A.decide(base({ foes: [foe(700, { boss: true, tele: true })] }), A.newMem());
    ok(r.act.left && r.why === 'retreat', '보스 예고 (300 px 안): 반대쪽으로 물러선다', r);
    const r2 = A.decide(base({ foes: [foe(590, { boss: true, tele: true })] }), A.newMem());
    ok(r2.act.left && r2.act.dash && r2.why === 'dodge', '아주 가까우면(< 130 px) 뒤로 대시 (무적)', r2);
    const s3 = base({ foes: [foe(590, { boss: true, tele: true })] }); s3.seg.x0 = 450;
    const r3 = A.decide(s3, A.newMem());
    ok(!r3.act.left && !r3.act.dash, '뒤가 막혔으면(< 90 px) 물러서지 않는다 (낭떠러지로 가지 않음)', r3);
    const s4 = base({ foes: [foe(700, { boss: true, tele: true })] }); s4.cfg = { ...s4.cfg, dodge: false };
    ok(!A.decide(s4, A.newMem()).act.left, '설정 「큰 공격 피하기」 끔 → 물러서지 않음');
  }
  {
    const s = base({ foes: [foe(600)], potion: 'u1' }); s.p.hpFrac = 0.2;
    const mem = A.newMem();
    const r1 = A.decide(s, mem); s.t += 1; const r2 = A.decide(s, mem); s.t += 4; const r3 = A.decide(s, mem);
    ok(r1.potion === 'u1' && !r2.potion && r3.potion === 'u1', 'HP 35% 아래: 물약, 4초 간격', [r1.potion, r2.potion, r3.potion]);
    const s2 = base({ potion: 'u1' }); s2.p.hpFrac = 0.4;
    ok(!A.decide(s2, A.newMem()).potion, 'HP 40% → 물약 안 씀');
    s2.p.inBoss = true;
    ok(A.decide(s2, A.newMem()).potion === 'u1', '보스전은 문턱 +10% (40% < 45%)');
    const s3 = base({ potion: 'u1' }); s3.p.hpFrac = 0.1; s3.level = 'skill';
    ok(!A.decide(s3, A.newMem()).potion, '「자동 스킬」은 물약을 쓰지 않는다');
  }
  {
    const s = base({ foes: [foe(600, { boss: true })] }); s.p.hpFrac = 0.2; s.p.inBoss = true;
    const mem = A.newMem(); let hr = null, atk = 0;
    for (let i = 0; i < 70 && !hr; i++) { const r = A.decide(s, mem); if (r.act.attack) atk++; if (r.why === 'hit-run') hr = r; s.t += 1 / 60; }
    ok(hr && hr.act.left && !hr.act.attack && atk > 0, '보스전 · 체력 20%: 0.7초 붙어 친 뒤 물러선다 (치고 빠지기)', hr && { why: hr.why, act: hr.act, atk });
    const s2 = base({ foes: [foe(600, { boss: true })] }); s2.p.inBoss = true; s2.p.hpFrac = 0.8;
    const m2 = A.newMem(); let any = false;
    for (let i = 0; i < 70; i++) { if (A.decide(s2, m2).why === 'hit-run') any = true; s2.t += 1 / 60; }
    ok(!any, '보스전 · 체력 80%: 치고 빠지지 않는다');
  }
  {
    const sk = (ready, page = 0) => ({ key: 'skill1', page, id: 'x', cost: 10, ready, range: { fx: 300, back: 40, up: 160, dn: 60 } });
    ok(A.decide(base({ foes: [foe(700)], skills: [sk(true)] }), A.newMem()).act.skill1, '대기 끝난 스킬: 사거리 안 대상 → 시전');
    ok(!A.decide(base({ foes: [foe(700)], skills: [sk(false)] }), A.newMem()).act.skill1, '대기 중·MP 부족(ready=false) → 시전 안 함');
    ok(!A.decide(base({ foes: [foe(1300)], skills: [sk(true)] }), A.newMem()).act.skill1, '사거리 밖 → 시전 안 함');
    const r = A.decide(base({ foes: [foe(700)], skills: [sk(true, 1)] }), A.newMem());
    ok(r.act.swap && !r.act.skill1, '「자동 전투」: 다른 쪽 스킬만 준비 → 넘김(⇄)', r.act);
    const s = base({ foes: [foe(700)], skills: [sk(true, 1)] }); s.level = 'skill';
    ok(!A.decide(s, A.newMem()).act.swap, '「자동 스킬」: 쪽은 넘기지 않는다');
  }
  {
    const s = base({ foes: [foe(800)] }); s.p.sp = 100;
    ok(!A.decide(s, A.newMem()).act.awaken, '필살 정책 boss: 일반 적에게는 쓰지 않는다');
    const s2 = base({ foes: [foe(800, { boss: true })] }); s2.p.sp = 100;
    ok(A.decide(s2, A.newMem()).act.awaken, '보스가 앞에 있으면 필살/각성 (awaken 액션)');
    const s3 = base({ foes: [foe(800, { boss: true })] }); s3.p.sp = 100; s3.cfg = { ...s3.cfg, ult: 'never' };
    ok(!A.decide(s3, A.newMem()).act.awaken, '필살 정책 never');
    const s4 = base({ foes: [foe(700), foe(760), foe(820)] }); s4.p.sp = 100; s4.cfg = { ...s4.cfg, ult: 'always' };
    ok(A.decide(s4, A.newMem()).act.awaken, '필살 정책 always: 3마리 이상 모이면');
    const s5 = base({ foes: [foe(800, { boss: true, tele: true })] }); s5.p.sp = 100;
    ok(!A.decide(s5, A.newMem()).act.awaken, '보스 예고 중에는 쓰지 않는다');
  }
  {
    const s = base({ foes: [foe(520, { flying: true, bottom: 450 })] });
    s.foes[0].y0 = 400; s.foes[0].y1 = 450;
    const r = A.decide(s, A.newMem());
    ok(r.act.up, '머리 위 날짐승 + 근처 상호작용 없음 → 위 공격', r.act);
    s.propsNear = true;
    const r2 = A.decide(s, A.newMem());
    ok(!r2.act.up, '문·상자·NPC 근처에서는 ↑ 를 절대 누르지 않는다', r2.act);
  }
  {
    const s = base({ pickups: [{ cx: 700, bottom: 600 }] });
    const mem = A.newMem(); mem.lastDanger = 0;
    ok(A.decide(s, mem).act.right, '적이 없고 0.8초 안전 → 근처 전리품으로');
    const s2 = base({ pickups: [{ cx: 700, bottom: 600 }] }); s2.cfg = { ...s2.cfg, pickup: false };
    ok(!A.decide(s2, A.newMem()).act.right, '설정 「전리품 줍기」 끔');
  }
  {
    ok(A.decide(base({ foes: [foe(700)], guardReady: true }), A.newMem()).act.guard, '수호신 대기 끝 + 적 300 px 안 → 수호');
  }
  {
    const seg = { x0: 100, x1: 1500, why0: 'edge', why1: 'edge', ty: 12, c0: 0, rows: [...Array(12).fill(12), ...Array(28).fill(11)], links: [{ x: 576, rowL: 12, rowR: 11 }] };
    const s = base({ foes: [foe(1100, { bottom: 528 })], seg }); s.p.cx = 545;
    const mem = A.newMem();
    const r = A.decide(s, mem);
    ok(r.act.right && r.act.jump && r.why === 'step', '오르는 턱 바로 앞: 짧게 뛴다 (누르고 있기)', r);
    s.p.onGround = false;
    const r2 = A.decide(s, mem);
    ok(r2.act.right && r2.act.jump, '공중에서도 뛴 쪽으로 계속 · 점프 누름 유지', r2.act);
  }
  {
    const s = base({ foes: [foe(1100)] }); s.p.noMove = true;
    ok(!A.decide(s, A.newMem()).act.right, '나는 탈것·헤엄 중 → 이동 끔 (공격·스킬만)');
    const s2 = base({ foes: [foe(600)] }); s2.p.hurt = true;
    ok(Object.keys(A.decide(s2, A.newMem()).act).length === 0, '경직 중 → 입력 없음');
    const s3 = base({ foes: [foe(600, { invuln: true })] });
    ok(!A.decide(s3, A.newMem()).act.attack, '무적(보스 등장 연출) 대상은 치지 않는다');
  }
  // ── [autofix] 리뷰 지적 회귀 시험 ──
  console.log('\n[node] autofix: 모든 땅 적 × 모든 무기');
  {
    const { ENEMIES } = await import(path.join(ROOT, 'src/data/enemies.js'));
    const bad = [];
    let n = 0;
    for (const [wk, ms] of Object.entries(MOVESETS)) {
      const Wk = A.weaponReach(ms, {});
      for (const [id, d] of Object.entries(ENEMIES)) {
        if (d.flying || !d.size) continue;
        n++;
        const w = d.size.w, h = d.size.h, bottom = 600;
        // 영웅 앞, 첫 타·앉아 공격이 가로로 닿는 거리 (가까운 끝이 몸 앞 +8)
        const x0 = 500 + Math.max(0, Wk.bx, Wk.low?.bx ?? 0) + 8;
        const f = { id, cx: x0 + w / 2 - 2, bottom: bottom - 2, x0: x0 + 2, x1: x0 + w - 2, y0: bottom - h + 2, y1: bottom - 2, hp: 50 };
        const s = base({ foes: [f] }); s.w = Wk;
        const mem = A.newMem();
        let atk = false, down = false, away = false;
        for (let i = 0; i < 6; i++) { const r = A.decide(s, mem); if (r.act.attack) atk = true; if (r.act.down) down = true; if (r.act.left) away = true; s.t += 1 / 60; }
        const low = !(Math.min(bottom + Wk.y1, f.y1) - Math.max(bottom + Wk.y0, f.y0) >= 6);
        if (!atk || away || (low && !Wk.ranged && Wk.low && !down)) bad.push(`${wk}×${id}(${f.y0 - bottom}..${f.y1 - bottom})${atk ? '' : ' 공격 없음'}${away ? ' 물러섬' : ''}${low && !down && !Wk.ranged ? ' ↓ 없음' : ''}`);
      }
    }
    ok(n > 300 && bad.length === 0, `땅 적 ${n / Object.keys(MOVESETS).length}종 × 무기 ${Object.keys(MOVESETS).length}개: 앞에 있으면 친다 (낮은 적은 ↓+공격)`, bad.slice(0, 12));
  }
  console.log('\n[node] autofix: 상자 위 막힘 (s01 r1 17–22열)');
  {
    // 2칸 상자 (줄 11–12) 위에 선 영웅, 오른쪽 아래 땅(줄 13)에 좀비
    const m = mapOf(['                              ', '                              ', '                              ', '                              ', '                              ', '                              ', '                              ', '                              ', '                              ', '                              ', '                              ', '                 ######       ', '                 ######       ', '##############################']);
    for (const cx of [22 * TILE + 24, 23 * TILE + 10]) {   // 상자 끝 칸 · 중심이 낭떠러지 칸에 걸침 (리뷰 재현: tx23 ty11)
      const seg = A.segmentAt(m, cx, foot(11), { halfW: 16 });
      const f = { id: 'zombie', cx: 25 * TILE, bottom: foot(13), x0: 25 * TILE - 18, x1: 25 * TILE + 18, y0: foot(13) - 78, y1: foot(13), hp: 30 };
      const s = base({ foes: [f], seg }); s.p.cx = cx; s.p.bottom = foot(11);
      const r = A.decide(s, A.newMem());
      ok(seg && r.act.right && !r.act.attack, `상자 위 (cx ${cx}): 아래 좀비 쪽으로 걸어 내려선다 (도착은 같은 바닥에서만)`, { why: r.why, act: r.act, seg: seg && [seg.x0, seg.x1] });
    }
    // 같은 줄에서 걸어 오다가 상자 너머 적: 상자 위에서 멈추지 않는다
    const seg = A.segmentAt(m, 15 * TILE, foot(13), { halfW: 16 });
    const f = { id: 'zombie', cx: 24 * TILE, bottom: foot(13), x0: 24 * TILE - 18, x1: 24 * TILE + 18, y0: foot(13) - 78, y1: foot(13), hp: 30 };
    const s = base({ foes: [f], seg }); s.p.cx = 21 * TILE; s.p.bottom = foot(11);
    const r = A.decide(s, A.newMem());
    ok(r.act.right, '상자 위 가운데: 상자 너머 같은 바닥으로 간다', { why: r.why, act: r.act });
    // 막힘 감시: 닿는 대상인데 2.5초 동안 공격이 없으면 밀고 간다
    const seg2 = { x0: 100, x1: 1500, why0: 'edge', why1: 'edge', ty: 12, c0: 0, rows: Array(40).fill(12), links: [] };
    const tiny = { id: 'x', cx: 560, bottom: 600, x0: 556, x1: 564, y0: 596, y1: 600, hp: 10 };   // 어느 상자에도 높이가 안 닿는 아주 작은 적
    const s2 = base({ foes: [tiny], seg: seg2 }); s2.w = { ...W, low: null };
    const mem = A.newMem(); let push = null;
    for (let i = 0; i < 60 * 6 && !push; i++) { const q = A.decide(s2, mem); if (q.why === 'push') push = q; s2.p.cx += q.act.right ? 3 : q.act.left ? -3 : 0; s2.t += 1 / 60; }
    ok(push && push.act.right, '막힘 감시: 공격이 2.5초 없으면 대상 쪽으로 밀고 들어간다', push);
  }
  console.log('\n[node] autofix: 보스 · 키 큰 적 · 나는 보스 · 경기장 벽');
  {
    const seg = { x0: 100, x1: 1500, why0: 'arena', why1: 'arena', ty: 12, c0: 0, rows: Array(40).fill(12), links: [] };
    // 말 탄 듀라한: 피격 상자 발 위 -236..-85 (리뷰 p12_dull)
    const dull = { id: 'b_dullahan', boss: true, cx: 900, bottom: 600, x0: 840, x1: 960, y0: 600 - 236, y1: 600 - 85, hp: 4000 };
    const s = base({ foes: [dull], seg }); s.p.inBoss = true;
    const r = A.decide(s, A.newMem());
    ok(r.target === dull && r.act.right, '말 탄 보스(발 위 85–236): 닿는 대상 — 다가간다 (예전: 발 높이로 보아 못 닿음 → idle)', { why: r.why, act: r.act });
    s.p.cx = dull.x0 + 4;
    const mem = A.newMem(); let up = false;
    for (let i = 0; i < 4; i++) { const q = A.decide(s, mem); if (q.act.up && q.act.attack) up = true; s.t += 1 / 60; }
    ok(up, '말 탄 보스 바로 앞: 위 공격(↑+공격)으로 친다', s.p.cx);
    // 높이 뜬 나는 보스 (밴시): 밑으로 가서 기다린다
    const ban = { id: 'b_banshee', boss: true, flying: true, cx: 1100, bottom: 330, x0: 1060, x1: 1140, y0: 230, y1: 330, hp: 3000 };
    const s3 = base({ foes: [ban], seg }); s3.p.inBoss = true;
    const r3 = A.decide(s3, A.newMem());
    ok(r3.target === ban && r3.act.right && r3.why === 'approach', '높이 뜬 나는 보스: 밑으로 다가간다 (내려올 때 위 공격)', { why: r3.why, act: r3.act });
    // 경기장 벽 여백 안으로 밀려남: 그 자리에 얼어붙지 않는다 (리뷰: seg=[591,591,'arena','arena'])
    const m = mapOf(['                    ', '                    ', '                    ', '####################']);
    const wallX = 5 * TILE;
    const seg4 = A.segmentAt(m, wallX + 10, foot(3), { halfW: 16, blocks: [{ x0: -1e9, x1: wallX + 20, why: 'arena' }, { x0: 18 * TILE, x1: 1e9, why: 'arena' }] });
    ok(seg4 && seg4.x1 - seg4.x0 > 200 && seg4.x0 > wallX + 10, '경기장 벽 여백 안: 구간이 열린 쪽(오른쪽)으로 남는다', seg4 && [seg4.x0, seg4.x1, seg4.why0, seg4.why1]);
    const fb = foot(3);
    const s4 = base({ foes: [{ ...dull, cx: 12 * TILE, x0: 12 * TILE - 60, x1: 12 * TILE + 60, bottom: fb, y0: fb - 236, y1: fb - 85 }], seg: seg4 }); s4.p.cx = wallX + 10; s4.p.bottom = fb; s4.p.inBoss = true;
    ok(A.decide(s4, A.newMem()).act.right, '경기장 벽 여백 안: 보스 쪽으로 걸어 나온다');
  }
  console.log('\n[node] autofix: 스킬 헛시전 · 돌아서기 떨림 · 닿지 않는 적 · 기다림 표시');
  {
    const sk = { key: 'skill1', page: 0, id: 'x', cost: 10, ready: true, range: A.skillRange({}, 1) };
    // 두 칸 아래 적 (상자 위 막힘의 MP 40→2)
    const below = { id: 'zombie', cx: 640, bottom: 696, x0: 622, x1: 658, y0: 696 - 78, y1: 696, hp: 30 };
    ok(!A.decide(base({ foes: [below], skills: [sk] }), A.newMem()).act.skill1, '두 칸(96 px) 아래 적에게는 스킬을 쓰지 않는다');
    const deep = { id: 'mud_man', cx: 640, bottom: 744, x0: 620, x1: 660, y0: 744 - 74, y1: 744, hp: 30 };
    ok(!A.decide(base({ foes: [deep], skills: [sk] }), A.newMem()).act.skill1, '늪 바닥 아래(세 칸) 진흙 인간에게도 쓰지 않는다');
    // 시전 뒤 1.2초에 피해가 없으면 4초 쉰다
    const f = { id: 'z', cx: 700, bottom: 600, x0: 686, x1: 714, y0: 520, y1: 600, hp: 30 };
    const s = base({ foes: [f], skills: [sk] }); s.level = 'skill';
    const mem = A.newMem(); let casts = 0;
    for (let i = 0; i < 60 * 5; i++) { if (A.decide(s, mem).act.skill1) casts++; s.t += 1 / 60; }
    ok(casts >= 1 && casts <= 2, `피해 없는 시전 뒤 쉰다 (5초에 ${casts}번 — 예전 0.35초마다)`);
    const s2 = base({ foes: [{ ...f }], skills: [sk] }); s2.level = 'skill';
    const mem2 = A.newMem(); let casts2 = 0;
    for (let i = 0; i < 60 * 5; i++) { if (A.decide(s2, mem2).act.skill1) { casts2++; s2.foes[0].hp -= 5; } s2.t += 1 / 60; }
    ok(casts2 >= 5, `피해가 들어가면 계속 쓴다 (${casts2}번)`);
    // 돌아서기 떨림: 대상이 뒤, 선 자리는 구간 끝에 눌림 (p4_worm: cx 262, seg.x1 273)
    const seg = { x0: 81, x1: 273, why0: 'edge', why1: 'story', ty: 12, c0: 0, rows: Array(40).fill(12), links: [] };
    const worm = { id: 'corpse_worm', cx: 200, bottom: 600, x0: 176, x1: 224, y0: 580, y1: 598, hp: 30 };
    const s3 = base({ foes: [worm], seg }); s3.p.cx = 262; s3.p.facing = 1;
    const mem3 = A.newMem(); let flips = 0, last = s3.p.facing;
    for (let i = 0; i < 60 * 2; i++) {
      const q = A.decide(s3, mem3);
      const mv = q.act.right ? 1 : q.act.left ? -1 : 0;
      if (mv) { s3.p.facing = mv; s3.p.cx += mv; }
      if (s3.p.facing !== last) { flips++; last = s3.p.facing; }
      s3.t += 1 / 60;
    }
    ok(flips <= 1 && s3.p.facing === -1, `대상이 뒤 + 구간 끝: 한 번 돌아서고 그대로 (2초에 방향 바뀜 ${flips}번)`);
    // 닿지 않는 적에게 두 번 맞음 → 물러서기 + 「도달 불가」
    const imp = { id: 'forge_imp', flying: true, cx: 560, bottom: 300, x0: 540, x1: 580, y0: 260, y1: 300, hp: 30 };
    const s4 = base({ foes: [imp] });
    const mem4 = A.newMem();
    const hit = () => { s4.p.hurt = true; A.decide(s4, mem4); s4.t += 0.3; s4.p.hurt = false; return A.decide(s4, mem4); };
    hit(); s4.t += 1; const r4 = hit();
    ok(r4.hold === 'unreach' && r4.act.left, '닿지 않는 적에게 8초 안 두 번 맞음: 물러서고 HUD 「도달 불가」', { hold: r4.hold, act: r4.act, why: r4.why });
    // 기다림 표시: 이야기 트리거 앞 (적은 트리거 너머)
    const segS = { x0: 100, x1: 400, why0: 'edge', why1: 'story', ty: 12, c0: 0, rows: Array(40).fill(12), links: [] };
    const far = { id: 'zombie', cx: 900, bottom: 600, x0: 880, x1: 920, y0: 520, y1: 600, hp: 30 };
    const s5 = base({ foes: [far], seg: segS }); s5.p.cx = 300;
    ok(A.decide(s5, A.newMem()).hold === 'forward', '이야기 트리거 앞, 적은 그 너머: hold = forward (「대기 · 앞으로 이동」)');
    ok(A.decide(base({ seg: segS }), A.newMem()).hold === 'forward', '적이 안 보여도 트리거 앞이면 forward');
    ok(A.decide(base({}), A.newMem()).hold === 'idle', '적 없음 · 막힘 없음: idle');
  }
  console.log('\n[node] autofix: 단추 · 기록 모드');
  {
    const g = { settings: { auto: { level: 'off' } }, state: {}, toast() {} };
    A.toggleLevel(g, { toast: false });
    ok(A.levelOf(g) === 'battle', '탭: 끔 → 「자동 전투」 (처음 켤 때 기본)');
    A.toggleLevel(g, { toast: false });
    ok(A.levelOf(g) === 'off', '탭: 켜짐 → 끔 (한 번)');
    A.switchLevel(g, { toast: false });
    ok(A.levelOf(g) === 'skill', '길게: 단계 바꾸기 (끔이면 마지막 단계의 반대 = 스킬)');
    A.toggleLevel(g, { toast: false });
    A.toggleLevel(g, { toast: false });
    ok(A.levelOf(g) === 'skill', '탭 두 번: 끔 → 마지막 단계(스킬) 그대로');
    const ts = []; const g2 = { settings: {}, state: {}, toast: (t) => ts.push(t) };
    A.setLevel(g2, 'battle'); A.setLevel(g2, 'skill'); A.setLevel(g2, 'off');
    ok(ts.join('|') === 'AUTO: 전투|AUTO: 스킬|AUTO 끔', `토스트 글자 (${ts.join(' | ')})`);
    for (const m of ['practice', 'bossrush', 'survival', 'tower', 'trial']) ok(!!A.autoBlockedIn({ mode: m }), `기록 모드 ${m}: AUTO 막힘`);
    ok(!A.autoBlockedIn({ mode: 'story' }) && !!A.autoBlockedIn({ mode: 'story', arcade: {} }) && !!A.autoBlockedIn({ mode: 'story', trial: {} }), '이야기 모드만 허용 (arcade·trial 표시가 있으면 막힘)');
  }

  console.log('\n[node] pickLock');
  {
    const p = { cx: 500, cy: 560, facing: 1 };
    const c = (id, cx) => ({ e: { id }, cx, cy: 560, d: Math.abs(cx - 500) });
    const list = [c('back', 420), c('f1', 700), c('f2', 900)];
    ok(A.pickLock(list, p, null)?.id === 'f1', '처음: 앞쪽 가장 가까운 적 (뒤가 더 가까워도)');
    ok(A.pickLock([c('back', 420)], p, null)?.id === 'back', '앞에 없으면 양쪽 600 px 안');
    const cur = list[1].e;
    const nx = A.pickLock(list, p, cur);
    ok(nx && nx !== cur && nx.id === 'f2', '다시 누름: 거리 순 다음 대상', nx);
    ok(A.pickLock(list, p, list[2].e)?.id === 'back', '마지막 다음은 처음으로 돈다');
    ok(A.pickLock(list, p, cur, -1)?.id === 'back', '패드 스틱 튕긴 쪽(왼쪽)의 대상');
  }
  console.log('\n[node] 설정 · 단계');
  {
    ok(A.autoSettings({ auto: { level: 'battle', potion: 5, ult: 'x' } }).potion === 0.9 && A.autoSettings({ auto: { level: 'battle', ult: 'x' } }).ult === 'boss', 'autoSettings: 범위 밖 값 정리');
    const g = { settings: { auto: { level: 'skill' } }, state: {}, toast() {} };
    ok(A.levelOf(g) === 'skill', '슬롯 값이 없으면 설정 기본값');
    A.cycleLevel(g, { toast: false });
    ok(g.state.auto.level === 'battle' && A.levelOf(g) === 'battle', '단계 바꾸기는 세이브 슬롯(state.auto)에');
    A.cycleLevel(g, { toast: false });
    ok(A.levelOf(g) === 'off', '자동 전투 → 끔 (순환)');
    const { migrateSettings, DEFAULT_SETTINGS } = await import(path.join(ROOT, 'src/core/save.js'));
    const m = migrateSettings({ settingsVersion: 2, auto: { level: 'nope', potion: 0.5, future: 1 } }).settings.auto;
    ok(m.level === 'off' && m.potion === 0.5 && m.future === 1 && DEFAULT_SETTINGS.auto.level === 'off', 'settings.auto 이관: 잘못된 값은 기본, 모르는 키 보존', m);
  }
  console.log('\n[node] input 가상 입력원');
  {
    const { input } = await import(path.join(ROOT, 'src/core/input.js'));
    let out = { right: true, attack: true, jump: true };
    input.setAutoSource(() => out);
    input.sources.key = {}; input.update(1 / 60);
    ok(input.state.right && input.state.attack && input.autoActive, '자동 입력이 액션이 된다');
    ok(input.mode !== 'touch', '자동 입력은 기기 모드를 바꾸지 않는다');
    input.sources.key = { left: true }; input.update(1 / 60);
    ok(input.state.left && !input.state.right && !input.state.jump && input.state.attack, '사람 ← 가 즉시 이긴다 (자동 이동·점프 버림, 공격은 그대로)');
    input.sources.key = {}; input.update(1 / 60);
    ok(!input.state.right, '사람이 뗀 직후 0.25초는 자동 이동 쉼');
    for (let i = 0; i < 20; i++) input.update(1 / 60);
    ok(input.state.right, '그 뒤 다시 자동 이동');
    const h0 = input.history.length;
    out = { right: false, attack: false }; input.update(1 / 60); out = { right: true, attack: true }; input.update(1 / 60);
    ok(!input.history.slice(h0).some((e) => e.dir === 'btn:attack' || e.dir === 'r'), '자동 이동·공격은 커맨드 이력에 들어가지 않는다');
    input.setAutoSource(null); input.update(1 / 60);
    ok(!input.state.right && !input.autoActive, 'setAutoSource(null) → 자동 입력 0');
    // 패드 몸짓
    input.refreshBindings();
    const src = {};
    let tms = 0;
    const G = (on) => { for (const k in src) delete src[k]; if (on) src.map = true; input._padGestures(src, tms, 0, 0); return src.map; };
    G(true); const hid = G(true);
    ok(!hid, '빠른 메뉴 버튼을 누르는 동안 map 은 감춘다 (길게/짧게를 가린다)');
    G(false); input.update(1 / 60);
    ok(input.state.map, '짧게 떼면 map 한 번 (빠른 메뉴)');
    input.update(1 / 60); input.update(1 / 60);
    tms = 1000; G(true); tms = 1500; G(true); input.update(1 / 60);
    ok(input.state.auto, '0.45초 넘게 누르면 auto 한 번 (자동 전투 단계)');
    G(false); input.update(1 / 60); input.update(1 / 60);
    ok(!input.state.map, '길게 누른 뒤 뗄 때는 map 을 보내지 않는다');
    const s2 = {}; input._padGestures(s2, 2000, 0.9, 0);
    ok(s2.lock && input.lockFlick === 1, '오른쪽 스틱 튕기기 → lock 눌림 + 튕긴 쪽');
    const s3 = {}; input._padGestures(s3, 2010, 0.5, 0);
    ok(s3.lock, '0.4 와 0.7 사이: 그대로 (히스테리시스)');
    const s4 = {}; input._padGestures(s4, 2020, 0.2, 0);
    ok(!s4.lock, '0.4 아래 → 뗌');
    const s5 = { up: true }; input._padGestures(s5, 3000, 0, 0); const s6 = { up: true }; input._padGestures(s6, 3450, 0, 0); input.update(1 / 60);
    ok(input.state.equipNow && s6.up, '↑ 0.4초 길게 → equipNow (↑ 는 그대로 지나간다)');
  }
}

// ───────────────────────── 브라우저 ─────────────────────────
const SEED_JS = `(() => { let s = 0x9e3779b9; Math.random = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; })();`;
async function browserTests() {
  const { openEnv } = await import(path.join(ROOT, 'tools/qa/lib/server.mjs'));
  const { freeze, step } = await import(path.join(ROOT, 'tools/qa/lib/step.mjs'));
  fs.mkdirSync(SHOTS, { recursive: true });
  const env = await openEnv();
  const want = (k) => !ONLY || ONLY.includes(k);
  const open = async (dev, url) => {
    const s = await env.page(dev, url, { initScripts: [SEED_JS] });
    await s.waitGame('g.top?.name === "worldmap" || (g.world?.player && (g.top?.name === "stage" || g.top?.name === "hub"))', 60000);
    await s.wait(1200);
    await freeze(s.page);
    await step(s.page, 30);
    return s;
  };
  /** 자동 전투로 방 하나: 시작 구간의 닿는(땅) 적을 모두 처치하는지 */
  const roomClear = async (key, stage, room, { tx = null, level = null, maxSec = 90, spawn = null } = {}) => {
    console.log(`\n[browser] ${key}: ${stage} ${room} 「자동 전투」`);
    const s = await open('desk', `index.html?scene=stage&stage=${stage}&room=${room}`);
    const init = await s.eval(async ({ tx, level, spawn }) => {
      const m = await import('/src/game/autoplay.js');
      const g = window.__game, w = g.world, p = w.player;
      if (tx != null) { p.x = tx * 48; p.y -= 4; p.vx = 0; }
      if (level) { p.hero.level = level; p.refreshStats(); p.hp = p.stats.hp; p.mp = p.stats.mp; }
      window.__T = { fell: 0, spike: 0, rooms: new Set([w.roomId]), tops: new Set(), doors: 0 };
      const of = w.onPlayerFell.bind(w); w.onPlayerFell = (q) => { window.__T.fell++; return of(q); };
      const th = p.takeHit.bind(p); p.takeHit = (d, a, ww, i) => { if (a && a.flat === 1 && !a.owner) window.__T.spike++; return th(d, a, ww, i); };
      const ed = w.enterDoor?.bind(w); if (ed) w.enterDoor = (t) => { window.__T.doors++; return ed(t); };
      g.state.auto = { level: 'battle' };
      // 시작 구간의 닿는 적 (땅 위 · 같은 구간) — 날짐승은 다가올 때만 치므로 세지 않는다
      for (let i = 0; i < 20; i++) window.__qaStep(1, false);
      for (const sp of spawn ?? []) w.spawnEnemy(sp.id, sp.tx * 48 + 24, sp.row * 48, { facing: -1 });
      const snap = m.snapshot(w, 'battle', m.autoSettings(g.settings));
      const seg = snap.seg;
      const targets = w.enemies().filter((e) => !e.noGravity && !e.invuln && seg && e.cx > seg.x0 - 170 && e.cx < seg.x1 + 170 && Math.abs(e.bottom - m.floorAt(seg, Math.min(seg.x1, Math.max(seg.x0, e.cx)))) <= 62);
      window.__targets = targets;
      return { seg: seg && [Math.round(seg.x0), Math.round(seg.x1), seg.why0, seg.why1], n: targets.length, ids: targets.map((e) => e.id) };
    }, { tx, level, spawn });
    console.log('    시작 구간', JSON.stringify(init));
    let t = 0, left = init.n;
    for (; t < maxSec; t += 2) {
      await step(s.page, 120, false);
      left = await s.eval(() => { const g = window.__game; window.__T.rooms.add(g.world?.roomId); window.__T.tops.add(g.top?.name); return window.__targets.filter((e) => !e.dead && !(e.dying > 0)).length; });
      if (!left) break;
    }
    const r = await s.eval(() => { const g = window.__game, T = window.__T; return { fell: T.fell, spike: T.spike, doors: T.doors, rooms: [...T.rooms], tops: [...T.tops], hp: Math.round(g.world.player.hp), dead: g.world.player.dead }; });
    await step(s.page, 1);
    await s.page.screenshot({ path: path.join(SHOTS, `${key}.png`) });
    ok(init.n >= 3, `${key}: 시작 구간에 닿는 적이 3마리 이상 (${init.n}: ${init.ids.join(',')})`);
    ok(left === 0, `${key}: 게임 시간 ${maxSec}초 안에 닿는 적 모두 처치 (${t}초, 남음 ${left})`);
    ok(r.rooms.length === 1 && r.doors === 0, `${key}: 방을 떠나지 않음 · 문 0`, r);
    ok(r.fell === 0 && r.spike === 0, `${key}: 낙사 0 · 가시 피해 0`, r);
    ok(!r.dead && r.tops.every((n) => n === 'stage'), `${key}: 살아 있고 대화·상점 장면 0`, r);
    ok(!s.errs.length, `${key}: 페이지 오류 0`, s.errs.slice(0, 3));
    await s.close();
  };
  if (want('s01')) await roomClear('s01', 's01', 'r1', { tx: 23 });
  // s08 r2 위층 회랑은 원래 개구리 악마 1마리 — 같은 스테이지의 적(익사체 2 · 개구리 악마 1)을 그 회랑에 더 세운다
  if (want('s08')) await roomClear('s08', 's08', 'r2', { level: 20, spawn: [{ id: 'drowned', tx: 12, row: 6 }, { id: 'frog_demon', tx: 21, row: 6 }, { id: 'drowned', tx: 23, row: 6 }] });

  if (want('boss')) {
    console.log('\n[browser] boss: s04 보스방 「자동 전투」 30초');
    const s = await open('desk', 'index.html?scene=stage&stage=s04&room=boss');
    await s.eval(() => { const g = window.__game, p = g.world.player; p.hero.level = 10; p.refreshStats(); p.hp = p.stats.hp; p.mp = p.stats.mp; });
    // 보스방 문턱은 자동이 넘지 않는다 → 사람이 걸어 들어가고, 등장 연출을 넘긴다
    await s.page.keyboard.down('ArrowRight');
    let n = 0;
    for (; n < 40; n++) { await step(s.page, 15, false); if (await s.eval(() => !!window.__game.world.bossActive)) break; }
    await s.page.keyboard.up('ArrowRight');
    for (let i = 0; i < 60; i++) {
      const st = await s.eval(() => { const g = window.__game; return { top: g.top?.name, intro: g.world.boss?.state === 'intro', ready: g.world.bossReady?.() }; });
      if (st.top === 'stage' && !st.intro && st.ready !== false) break;
      if (st.top !== 'stage') { await s.page.keyboard.press('Enter'); }
      await step(s.page, 20, false);
    }
    const st0 = await s.eval(() => { const g = window.__game, w = g.world, b = w.boss; g.state.auto = { level: 'battle' }; window.__R = { retreat: 0, hp0: b?.hp ?? 0, max: b?.maxHp ?? b?.stats?.hp ?? 0 }; return { boss: b?.id, hp: b?.hp, active: w.bossActive }; });
    console.log('    보스', JSON.stringify(st0));
    let dead = false;
    for (let i = 0; i < 30; i++) {
      await step(s.page, 60, false);
      const q = await s.eval(() => { const g = window.__game, w = g.world; if (g.autoHud?.why === 'retreat' || g.autoHud?.why === 'dodge') window.__R.retreat++; return { dead: w.player.dead, top: g.top?.name }; });
      if (q.dead) { dead = true; break; }
      if (q.top !== 'stage') await step(s.page, 30, false);
    }
    const r = await s.eval(() => { const w = window.__game.world, b = w.boss; return { hp: b?.hp, hp0: window.__R.hp0, cleared: w.cleared, php: Math.round(w.player.hp), retreat: window.__R.retreat }; });
    console.log('    결과', JSON.stringify(r));
    await step(s.page, 1);
    await s.page.screenshot({ path: path.join(SHOTS, 'boss.png') });
    ok(st0.active, 'boss: 보스전 시작');
    ok(!dead, 'boss: 30초 생존 (보수적 자동 전투)', r);
    ok(r.cleared || (r.hp0 > 0 && r.hp < r.hp0), 'boss: 보스에게 피해를 줌', r);
    ok(!s.errs.length, 'boss: 페이지 오류 0', s.errs.slice(0, 3));
    await s.close();
  }

  // ── [autofix] s01 처음부터 (순간 이동 없음): AUTO 한 번 탭 → 트리거 앞 「대기」 → 사람이 트리거를 지나 걸어 줌 → AUTO 혼자 상자(17–22열)를 넘어 싸운다
  if (want('s01walk')) {
    console.log('\n[browser] s01walk: s01 r1 시작 자리에서 (폴드 터치) — 상자 위 막힘 · 트리거 앞 기다림 표시');
    const s = await open('fold_open', 'index.html?scene=stage&stage=s01');
    const skip = async () => { for (let i = 0; i < 60; i++) { const top = await s.eval(() => window.__game.top?.name); if (top === 'stage') return; await s.page.keyboard.press('Enter'); await step(s.page, 8, false); } };
    await skip();
    await s.eval(() => { const g = window.__game, w = g.world, p = w.player; g.state.auto = { level: 'off' };
      window.__T = { fell: 0, spike: 0, doors: 0 }; const of = w.onPlayerFell.bind(w); w.onPlayerFell = (q) => { window.__T.fell++; return of(q); };
      const th = p.takeHit.bind(p); p.takeHit = (d, a, ww, i) => { if (a && a.flat === 1 && !a.owner) window.__T.spike++; return th(d, a, ww, i); };
      const ed = w.enterDoor?.bind(w); if (ed) w.enterDoor = (t) => { window.__T.doors++; return ed(t); }; });
    const au = await s.eval(() => window.__game.input.pad.buttons().find((b) => b.id === 'auto') ?? null);
    await s.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: au.cx, y: au.cy, id: 3 }] });
    await step(s.page, 3, false);
    await s.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await step(s.page, 60, false);
    const h0 = await s.eval(() => ({ lv: window.__game.autoHud.level, hold: window.__game.autoHud.hold, tx: Math.floor(window.__game.world.player.cx / 48) }));
    await step(s.page, 1); await s.page.screenshot({ path: path.join(SHOTS, 's01walk_hold.png') });
    await step(s.page, 90, false);   // [autofix] 2초 넘게 기다리면 방마다 한 번 「AUTO 대기 — 앞으로는 직접 이동하세요」 (PLAY-B 요청 16 의 알림 부분)
    const holdToast = await s.eval(() => (window.__game.toasts || []).map((t) => t.text).filter((t) => /^AUTO 대기/.test(t)));
    // 사람: 트리거(7열)를 지나 12열까지
    await s.page.keyboard.down('ArrowRight');
    for (let i = 0; i < 40; i++) { await step(s.page, 10, false); const q = await s.eval(() => ({ top: window.__game.top?.name, tx: Math.floor(window.__game.world.player.cx / 48) })); if (q.top !== 'stage') { await s.page.keyboard.up('ArrowRight'); await skip(); await s.page.keyboard.down('ArrowRight'); } if (q.tx >= 12) break; }
    await s.page.keyboard.up('ArrowRight');
    await skip();
    const k0 = await s.eval(() => window.__game.world.run.kills ?? 0);
    const whys = {}; let maxTx = 0, stuck = 0, last = null;
    for (let i = 0; i < 40; i++) {
      await step(s.page, 60, false);
      const q = await s.eval(() => { const g = window.__game, p = g.world.player; return { why: g.autoHud.why, tx: Math.floor(p.cx / 48), ty: Math.floor(p.bottom / 48), top: g.top?.name, dead: p.dead }; });
      whys[q.why] = (whys[q.why] ?? 0) + 1; maxTx = Math.max(maxTx, q.tx);
      // 막힘 = 닿는 대상이 있는데(wait) 같은 자리. idle 은 대상이 없을 때(가시 구덩이 앞 등 — hold 로 사람에게 넘긴다)
      const key = `${q.tx},${q.ty},${q.why}`; if (key === last && q.why === 'wait') stuck++; else stuck = 0; last = key;
      if (q.top !== 'stage' || q.dead || stuck >= 12) break;
    }
    const r = await s.eval(() => ({ kills: window.__game.world.run.kills ?? 0, T: window.__T, room: window.__game.world.roomId, top: window.__game.top?.name, assisted: !!window.__game.world.run.assisted, why: window.__game.autoHud.why, hold: window.__game.autoHud.hold }));
    await step(s.page, 1); await s.page.screenshot({ path: path.join(SHOTS, 's01walk_end.png') });
    console.log('    ', JSON.stringify({ h0, whys, maxTx, kills: r.kills - k0, T: r.T }));
    ok(h0.lv === 'battle' && h0.hold === 'forward', `s01walk: 처음 탭 = 「자동 전투」, 트리거 앞에서 hold 'forward' (버튼 「대기」) — ${JSON.stringify(h0)}`);
    ok(maxTx >= 30 && r.kills - k0 >= 4, `s01walk: 상자(17–22열)를 넘어 싸운다 (가장 먼 열 ${maxTx}, 처치 ${r.kills - k0})`);
    ok(stuck < 12, 's01walk: 같은 자리에서 12초 넘게 wait/idle 하지 않는다 (예전 47초)', { stuck, last });
    ok(r.T.fell === 0 && r.T.spike === 0 && r.T.doors === 0 && r.room === 'r1', 's01walk: 낙사·가시·문 0 · 방 그대로', r);
    ok(r.assisted, 's01walk: AUTO 가 입력을 낸 판은 world.run.assisted (공정성 표시)');
    ok(holdToast.length === 1, `s01walk: 트리거 앞 2초 기다림 → 「AUTO 대기」 알림 한 번 (${holdToast.join(' / ')})`, holdToast);
    ok(r.why !== 'idle' || r.hold === 'forward' || r.hold === 'idle', `s01walk: 할 일이 없으면 HUD 에 이유가 보인다 (why ${r.why}, hold ${r.hold} — 가시 구덩이 너머 적이면 forward)`);
    ok(!s.errs.length, 's01walk: 페이지 오류 0', s.errs.slice(0, 3));
    await s.close();
  }

  // ── [autofix] 보스 s01·s02·s03 (리뷰: 밴시 45초 피해 0, 듀라한 idle 39/45, 벽에 밀린 뒤 얼어붙음) ──
  for (const [key, stg, lv] of [['boss1', 's01', 6], ['boss2', 's02', 10], ['boss3', 's03', 14]]) {
    if (!want(key) && !want('bosses')) continue;
    console.log(`\n[browser] ${key}: ${stg} 보스 「자동 전투」 45초 (Lv ${lv}, 물약 3)`);
    const s = await open('desk', `index.html?scene=stage&stage=${stg}&room=boss`);
    const skip = async () => { for (let i = 0; i < 80; i++) { const st = await s.eval(() => { const g = window.__game; return { top: g.top?.name, intro: g.world.boss?.state === 'intro' }; }); if (st.top === 'stage' && !st.intro) return; if (st.top !== 'stage') await s.page.keyboard.press('Enter'); await step(s.page, 15, false); } };
    await skip();
    await s.eval((lv) => { const g = window.__game, w = g.world, p = w.player; p.hero.level = lv; p.refreshStats(); p.hp = p.stats.hp; p.mp = p.stats.mp; g.state.auto = { level: 'off' };
      // s01 성당: 시작 자리 앞 3–4칸 벽(파쿠르)은 이 시험의 대상이 아니다 → 벽 너머 경기장 입구 두 칸 앞에 세운다
      if (w.stage?.id === 's01' && Number.isFinite(w.arenaX)) { p.x = w.arenaX - 3 * 48; p.y = 12 * 48 - p.h - 2; p.vx = 0; p.vy = 0; } }, lv);
    await s.page.keyboard.down('ArrowRight');
    for (let n = 0; n < 60; n++) {
      if (n % 3 === 0) { await s.page.keyboard.down('KeyZ'); await step(s.page, 12, false); await s.page.keyboard.up('KeyZ'); }
      await step(s.page, 10, false);
      const q = await s.eval(() => ({ a: !!window.__game.world.bossActive, top: window.__game.top?.name }));
      if (q.a) break;
      if (q.top !== 'stage') { await s.page.keyboard.up('ArrowRight'); await skip(); await s.page.keyboard.down('ArrowRight'); }
    }
    await s.page.keyboard.up('ArrowRight');
    await skip();
    const b0 = await s.eval(() => { const g = window.__game, w = g.world, b = w.boss; g.state.auto = { level: 'battle' }; return { id: b?.id, hp: b?.hp ?? 0, max: b?.maxHp ?? b?.hp ?? 0, active: !!w.bossActive }; });
    const whys = {}; const xs = new Set(); let dead = false, hp = b0.hp;
    for (let i = 0; i < 45; i++) {   // 45초: 밴시는 예고(비명)마다 물러서서 30초 피해가 2–13% 로 흔들린다 → 길게 재서 평균을 본다
      await step(s.page, 60, false);
      const q = await s.eval(() => { const g = window.__game, w = g.world, p = w.player; return { why: g.autoHud.why, x: Math.round(p.cx / 24), dead: p.dead, top: g.top?.name, hp: w.boss?.hp ?? 0, cleared: w.cleared }; });
      whys[q.why] = (whys[q.why] ?? 0) + 1; xs.add(q.x); hp = q.hp;
      if (q.dead) { dead = true; break; }
      if (q.cleared) break;
      if (q.top !== 'stage') await skip();
    }
    await step(s.page, 1); await s.page.screenshot({ path: path.join(SHOTS, `${key}.png`) });
    const dmgPct = b0.max > 0 ? Math.round(1000 * (b0.hp - hp) / b0.max) / 10 : 0;
    console.log('    ', JSON.stringify({ b0, hp, dmgPct, whys, spots: xs.size, dead }));
    ok(b0.active && !!b0.id, `${key}: 보스전 시작 (${b0.id})`, b0);
    ok(dmgPct >= 3, `${key}: 45초에 보스 HP ${dmgPct}% 깎음 (≥ 3% — 예전 밴시 0%)`);
    ok((whys.idle ?? 0) <= 9, `${key}: idle ${whys.idle ?? 0}/45 (예전 듀라한 39/45)`, whys);
    ok(xs.size >= 4, `${key}: 얼어붙지 않는다 (서로 다른 자리 ${xs.size}곳)`);
    ok(!s.errs.length, `${key}: 페이지 오류 0`, s.errs.slice(0, 3));
    await s.close();
  }

  // ── [autofix] 기록 모드: 연습(일일 도전)·보스 러시에서는 AUTO 가 입력을 내지 않는다 (순위표·고스트 공정성) ──
  if (want('ranked')) {
    console.log('\n[browser] ranked: 연습 · 보스 러시에서 AUTO 막힘');
    for (const sc of ['practice', 'bossrush']) {
      const s = await env.page('desk', `index.html?scene=${sc}`, { initScripts: [SEED_JS] });
      try {
        await s.waitGame(`g.world?.player && g.top?.name === "${sc}"`, 60000);
        await s.wait(1000); await freeze(s.page); await step(s.page, 30);
        // 실제 세션은 이야기 스테이지(stage.js → autoplay.js)를 먼저 거친다 — 아케이드를 바로 연 페이지에서도 같은 상태로
        await s.eval(async () => { await import('/src/game/autoplay.js'); });
        const r = await s.eval(() => {
          const g = window.__game; g.state.auto = { level: 'battle' };
          let any = false; for (let i = 0; i < 240; i++) { window.__qaStep(1, false); if (g.input.autoActive) any = true; }
          return { on: !!g.autoHud?.on, blocked: g.autoHud?.blocked ?? null, any, assisted: !!g.world.run?.assisted, mode: g.world.mode };
        });
        await s.page.keyboard.down('KeyB'); await step(s.page, 3, false); await s.page.keyboard.up('KeyB'); await step(s.page, 3, false);
        const toasts = await s.eval(() => window.__game.toasts.map((t) => t.text));
        ok(!r.on && !r.any && r.blocked === 'ranked' && !r.assisted, `ranked ${sc} (mode ${r.mode}): AUTO 입력 0 · blocked`, r);
        ok(toasts.some((t) => /기록 모드에서는 AUTO/.test(t)), `ranked ${sc}: AUTO 를 누르면 「기록 모드에서는 AUTO 를 쓸 수 없다」`, toasts);
        ok(!s.errs.length, `ranked ${sc}: 페이지 오류 0`, s.errs.slice(0, 3));
      } finally { await s.close(); }
    }
  }

  // ── [autofix] 대상 고정 이름판 · 버튼 밑 화살표 (폴드: 오른쪽 버튼 묶음이 앞쪽 땅을 덮는다) ──
  if (want('lockplate')) {
    console.log('\n[browser] lockplate: 폴드 — 고정 대상 이름판');
    const s = await open('fold_open', 'index.html?scene=stage&stage=s01&room=r1');
    await s.eval(() => { const g = window.__game, w = g.world, p = w.player; p.x = 26 * 48; p.y -= 4; p.facing = 1; g.state.auto = { level: 'off' }; });
    await step(s.page, 10, false);
    const lk = await s.eval(() => window.__game.input.pad.buttons().find((b) => b.id === 'lock') ?? null);
    await s.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: lk.cx, y: lk.cy, id: 4 }] });
    await step(s.page, 3, false);
    await s.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await step(s.page, 20, false);
    const r = await s.eval(async () => {
      const { hudLayout } = await import('/src/render/hud_layout.js');
      const g = window.__game, w = g.world, L = hudLayout(w, g.viewW, g.viewH), e = w.lockTarget;
      const m = L.meter((w.gimmick?.meterRows) || 0);
      return { lock: e?.id ?? null, meter: m && { x: m.x, y: m.y, w: m.w }, viewW: g.viewW };
    });
    await step(s.page, 1); await s.page.screenshot({ path: path.join(SHOTS, 'lockplate.png') });
    ok(!!r.lock, `lockplate: 고정 대상 (${r.lock})`, r);
    ok(!s.errs.length, 'lockplate: 페이지 오류 0', s.errs.slice(0, 3));
    await s.close();
  }

  if (want('phonepill')) {
    // [autofix] 휴대폰 두 줄 배치: AUTO 동그라미 대신 이름 옆 알약이 단추 (HUD 탭 자리 act 'auto' ≥ 44 CSS px, 짧게 켬/끔 · 길게 단계)
    console.log('\n[browser] phonepill: 휴대폰 이름 옆 AUTO 알약');
    const s = await open('phone2', 'index.html?scene=stage&stage=s01&room=r1');
    await s.eval(() => { window.__game.state.auto = { level: 'off' }; window.__game.input.setMode?.('touch'); });
    await step(s.page, 4);
    const zone = async () => s.eval(() => { const g = window.__game, z = (g.hudTaps || []).find((t) => t && t.act === 'auto'), cr = g.canvasRect, k = cr.h / g.viewH; return z ? { cx: cr.x + (z.x + z.w / 2) * k, cy: cr.y + (z.y + z.h / 2) * k, w: z.w * k, h: z.h * k } : null; });
    const z = await zone();
    const ids = await s.eval(() => window.__game.input.pad.buttons().map((b) => b.id));
    ok(!!z && z.w >= 43.5 && z.h >= 43.5, `phonepill: 알약 탭 자리 ≥ 44 CSS px (${z && Math.round(z.w)}×${z && Math.round(z.h)})`, z);
    ok(!ids.includes('auto') && !ids.includes('lock'), 'phonepill: AUTO·고정 동그라미 없음 (두 줄)', ids);
    const tap = async (ms = 0) => {
      const q = await zone(); if (!q) return;
      await s.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: q.cx, y: q.cy, id: 9 }] });
      await step(s.page, Math.max(2, Math.round(ms / (1000 / 60))), false);
      await s.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await step(s.page, 3);
    };
    if (z) {
      await tap(); const l1 = await s.eval(() => window.__game.autoHud?.level);
      await tap(); const l2 = await s.eval(() => window.__game.autoHud?.level);
      await tap(600); const l3 = await s.eval(() => window.__game.autoHud?.level);
      const st = await s.eval(() => ({ jumpHeld: !!window.__game.input.state?.jump, attack: !!window.__game.input.state?.attack, toasts: window.__game.toasts.map((t) => t.text) }));
      ok(l1 === 'battle' && l2 === 'off' && l3 === 'skill', `phonepill: 탭 = 켬/끔, 길게 = 단계 (${l1} → ${l2} → ${l3})`, st.toasts);
      await step(s.page, 1);
      await s.page.screenshot({ path: path.join(SHOTS, 'phonepill.png') });
    }
    ok(!s.errs.length, 'phonepill: 페이지 오류 0', s.errs.slice(0, 3));
    await s.close();
  }

  if (want('override')) {
    console.log('\n[browser] override: 사람 입력이 이긴다');
    const s = await open('desk', 'index.html?scene=stage&stage=s01&room=r1');
    await s.eval(() => { const g = window.__game, w = g.world, p = w.player; p.x = 26 * 48; p.y -= 4; g.state.auto = { level: 'battle' }; });
    // 자동은 뒤에서 솟은 좀비를 먼저 처리할 수 있다 (처치 경직 + 채찍 마무리 ≈ 0.7 초) → → 로 달릴 때까지 최대 2 초
    let a = null;
    for (let i = 0; i < 40; i++) { await step(s.page, 3, false); a = await s.eval(() => ({ vx: window.__game.world.player.vx, why: window.__game.autoHud.why })); if (a.vx > 0) break; }
    await s.page.keyboard.down('ArrowLeft');
    await step(s.page, 2, false);
    const b = await s.eval(() => ({ left: window.__game.input.state.left, right: window.__game.input.state.right, vx: window.__game.world.player.vx }));
    await step(s.page, 20, false);
    const c = await s.eval(() => ({ vx: window.__game.world.player.vx, x: window.__game.world.player.x }));
    await s.page.keyboard.up('ArrowLeft');
    // autoActive 는 '이번 스텝에 자동 입력이 있었나' — 공격 연타 사이 빈 스텝이 있으니 45 스텝 안에 한 번이라도
    let d = null;
    for (let i = 0; i < 45; i++) { await step(s.page, 1, false); d = await s.eval(() => ({ vx: window.__game.world.player.vx, why: window.__game.autoHud.why, auto: window.__game.input.autoActive })); if (d.auto && i >= 10) break; }
    ok(a.vx > 0, 'override: 자동이 → 로 간다', a);
    ok(b.left && !b.right, 'override: ← 를 누르는 즉시 자동 → 는 사라진다 (같은 스텝)', b);
    ok(c.vx < 0, 'override: 사람이 누르는 쪽으로 움직인다', c);
    ok(d.auto, 'override: 뗀 뒤 자동 입력이 돌아온다', d);
    await s.close();
  }

  if (want('lock')) {
    console.log('\n[browser] lock: 대상 고정 (키보드 T)');
    const s = await open('desk', 'index.html?scene=stage&stage=s01&room=r1');
    await s.eval(() => { const g = window.__game, w = g.world, p = w.player; p.x = 26 * 48; p.y -= 4; p.facing = 1; g.state.auto = { level: 'off' }; });
    await step(s.page, 10, false);
    const key = async (code, steps = 3) => { await s.page.keyboard.down(code); await step(s.page, steps, false); await s.page.keyboard.up(code); await step(s.page, 2, false); };
    await key('KeyT');
    const a = await s.eval(() => { const w = window.__game.world, e = w.lockTarget, p = w.player; return { id: e?.id, front: e ? Math.sign(e.cx - p.cx) === p.facing : false }; });
    await step(s.page, 30, false);
    await key('KeyT');
    const b = await s.eval(() => ({ id: window.__game.world.lockTarget?.id, same: window.__game.world.lockTarget === window.__lk }));
    await s.eval(() => { window.__lk = window.__game.world.lockTarget; });
    await step(s.page, 30, false);
    await key('KeyT');
    const b2 = await s.eval(() => ({ changed: window.__game.world.lockTarget !== window.__lk && !!window.__game.world.lockTarget }));
    await step(s.page, 30, false);
    await key('KeyT', 2); await key('KeyT', 2);   // 0.3초 안 두 번 (첫 번은 다음 대상, 둘째 = 풀기)
    const c = await s.eval(() => ({ lock: !!window.__game.world.lockTarget }));
    await key('KeyT'); await step(s.page, 30, false);
    await key('KeyT', 35);   // 길게 (0.58초)
    const d = await s.eval(() => ({ lock: !!window.__game.world.lockTarget }));
    await key('KeyT');
    const e1 = await s.eval(() => { const w = window.__game.world, e = w.lockTarget; if (e) { e.hp = 1; e.takeHit?.(999, { owner: w.player, team: 'player', dir: 1, kb: [10, -10], stats: w.player.stats, mv: 9 }, w, {}); e.dead = e.dead || e.hp <= 0; } return !!e; });
    await step(s.page, 90, false);
    const e2 = await s.eval(() => ({ lock: !!window.__game.world.lockTarget }));
    // 표적 고리 그림 (화면에 그려지는지: 고정하고 한 프레임 그린 뒤 그 자리 화소)
    await key('KeyT');
    await step(s.page, 1);
    await s.page.screenshot({ path: path.join(SHOTS, 'lock.png') });
    ok(!!a.id && a.front, 'lock: T → 앞쪽 적 고정', a);
    ok(b2.changed, 'lock: 다시 T → 다른 대상 (거리 순 다음)', b2);
    ok(!c.lock, 'lock: 두 번 빠르게 → 해제', c);
    ok(!d.lock, 'lock: 길게 → 해제', d);
    ok(e1 && !e2.lock, 'lock: 대상이 죽으면 저절로 풀림', { e1, e2 });
    ok(!s.errs.length, 'lock: 페이지 오류 0', s.errs.slice(0, 3));
    await s.close();
  }

  if (want('pause')) {
    console.log('\n[browser] pause: 일시정지 중 자동 입력 0');
    const s = await open('desk', 'index.html?scene=stage&stage=s01&room=r1');
    await s.eval(() => { const g = window.__game, w = g.world, p = w.player; p.x = 26 * 48; p.y -= 4; g.state.auto = { level: 'battle' }; });
    await step(s.page, 20, false);
    await s.page.keyboard.down('Escape'); await step(s.page, 2, false); await s.page.keyboard.up('Escape'); await step(s.page, 10, false);
    const a = await s.eval(() => ({ top: window.__game.top?.name, x: window.__game.world.player.x }));
    await step(s.page, 60, false);
    const b = await s.eval(() => ({ top: window.__game.top?.name, x: window.__game.world.player.x, auto: window.__game.input.autoActive, on: window.__game.autoHud?.on }));
    ok(a.top === 'pause' && b.top === 'pause', 'pause: 일시정지 장면', { a, b });
    ok(!b.auto && !b.on && a.x === b.x, 'pause: 자동 입력 0 · 영웅 멈춤', { a, b });
    await s.close();
  }

  if (want('touch')) {
    console.log('\n[browser] touch: fold_open AUTO · 고정 버튼');
    const s = await open('fold_open', 'index.html?scene=stage&stage=s01&room=r1');
    await s.eval(() => { window.__game.state.auto = { level: 'off' }; });
    const btn = async (id) => s.eval((id) => window.__game.input.pad.buttons().find((b) => b.id === id) ?? null, id);
    const au = await btn('auto'), lk = await btn('lock');
    ok(!!au && !!lk, 'touch: AUTO·고정 버튼이 있다', { au, lk });
    const tap = async (b, ms = 0) => {
      const cdp = s.cdp;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.cx, y: b.cy, id: 7 }] });
      await step(s.page, Math.max(2, Math.round(ms / (1000 / 60))), false);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await step(s.page, 3, false);
    };
    if (au) {
      // [autofix] 탭 = 끔 ↔ 마지막 단계 (처음은 「자동 전투」), 길게 = 단계 바꾸기 — 켜진 상태에서 탭 한 번이면 언제나 끔
      await tap(au);
      const l1 = await s.eval(() => window.__game.autoHud?.level);
      await tap(au);
      const l2 = await s.eval(() => window.__game.autoHud?.level);
      await tap(au, 600);
      const l3 = await s.eval(() => window.__game.autoHud?.level);
      await tap(au);
      const l4 = await s.eval(() => window.__game.autoHud?.level);
      await tap(au);
      const l5 = await s.eval(() => window.__game.autoHud?.level);
      const toasts = await s.eval(() => window.__game.toasts.map((t) => t.text));
      ok(l1 === 'battle' && l2 === 'off', `touch: AUTO 탭 = 켬(자동 전투) → 탭 = 끔 (${l1} → ${l2})`);
      ok(l3 === 'skill', `touch: AUTO 길게 = 단계 바꾸기 (끔 → 자동 스킬: ${l3})`);
      ok(l4 === 'off' && l5 === 'skill', `touch: 스킬에서 탭 = 끔, 다시 탭 = 마지막 단계(스킬) (${l4} → ${l5})`);
      ok(toasts.some((t) => /^AUTO: (전투|스킬)/.test(t)) && toasts.some((t) => t === 'AUTO 끔') && !toasts.some((t) => /자동 전투: 자동 전투/.test(t)), 'touch: 토스트 「AUTO: 전투」·「AUTO 끔」 (되풀이 문구 없음)', toasts);
      const g = await s.eval(() => ({ hud: window.__game.state.auto?.level }));
      ok(g.hud === 'skill', 'touch: 단계는 세이브 슬롯(state.auto)에 남는다', g);
      await tap(au); await step(s.page, 2, false);
    }
    if (lk) {
      await s.eval(() => { const w = window.__game.world, p = w.player; p.x = 26 * 48; p.y -= 4; p.facing = 1; });
      await step(s.page, 5, false);
      await tap(lk);
      const l = await s.eval(() => !!window.__game.world.lockTarget);
      ok(l, 'touch: 고정 버튼 탭 → 대상 고정');
    }
    const lay = await s.eval(() => { const t = window.__game.input.pad, L = t.buttons(); const g = (id) => L.find((b) => b.id === id); return { j: g('jump'), a: g('attack'), d: g('dash'), lock: g('lock'), auto: g('auto'), W: innerWidth, H: innerHeight }; });
    ok(lay.j.cx < lay.a.cx && lay.a.cx < lay.d.cx && Math.abs(lay.j.cy - lay.a.cy) <= 2 && Math.abs(lay.a.cy - lay.d.cy) <= 2, 'touch: 아랫줄 점프–공격–대시 그대로', lay);
    ok(lay.lock && lay.lock.d >= 44 && lay.auto.d >= 44, 'touch: 새 버튼 ≥ 44 dp', lay);
    await s.close();
    const t = await open('fold_open', 'index.html?scene=hub');
    await step(s.page ? t.page : t.page, 30);
    const town = await t.eval(() => window.__game.input.pad.buttons().map((b) => b.id));
    ok(!town.includes('auto') && !town.includes('lock'), 'touch: 마을에는 AUTO·고정 없음', town);
    await t.close();
  }

  if (want('equip')) {
    console.log('\n[browser] equip: N = 바로 장착');
    const s = await open('desk', 'index.html?scene=stage&stage=s01&room=r1');
    const r = await s.eval(async () => {
      const g = window.__game, st = g.state, hero = st.heroes[st.charId];
      const { makeItem, ITEMS } = await import('/src/data/items.js');
      const { addItem, isEquipped } = await import('/src/game/inventory.js');
      const { bus } = await import('/src/core/events.js');
      // 지금 무기보다 좋은 같은 종류 무기 하나
      const wt = g.world.player.stats.weaponType;
      const base = Object.values(ITEMS).filter((b) => b.slot === 'weapon' && b.wtype === wt && !b.unique && (b.lvReq ?? 1) <= hero.level).sort((a, b) => (b.stats?.atk ?? 0) - (a.stats?.atk ?? 0))[0];
      if (!base) return { err: 'no base' };
      const it = makeItem(base.id); it.rarity = 3;
      addItem(st, it);
      bus.emit('itemPicked', { item: it });
      window.__eq = it.uid;
      // 적을 멀리 (안전 판정)
      for (const e of g.world.enemies()) e.dead = true;
      return { uid: it.uid, name: base.id };
    });
    await step(s.page, 4);
    const toast = await s.eval(() => window.__game.toasts.map((t) => t.text).find((x) => x.startsWith('획득')) ?? null);
    await step(s.page, 130);   // 안전 2초
    await s.page.keyboard.down('KeyN'); await step(s.page, 3); await s.page.keyboard.up('KeyN'); await step(s.page, 140);
    const eq = await s.eval(async () => { const { isEquipped } = await import('/src/game/inventory.js'); return !!isEquipped(window.__game.state, window.__eq); });
    ok(!r.err, 'equip: 시험 무기 준비', r);
    ok(!!toast && /N: 장착/.test(toast), `equip: 토스트 안내에 키보드 글자 ('${toast}')`);
    ok(eq, 'equip: N → 장착됨');
    await s.close();
  }

  if (want('worldmap')) {
    console.log('\n[browser] worldmap: 가방 경고');
    const s = await open('desk', 'index.html?scene=worldmap');
    const fillTo = async (free) => s.eval(async (free) => {
      const g = window.__game, st = g.state;
      const { freeSlots, addItem } = await import('/src/game/inventory.js');
      const { makeItem, ITEMS } = await import('/src/data/items.js');
      const base = Object.values(ITEMS).find((b) => b.slot === 'armor' || b.slot === 'body') ?? Object.values(ITEMS).find((b) => b.slot === 'weapon');
      let guard = 0;
      while (freeSlots(st) > free && guard++ < 400) addItem(st, makeItem(base.id));
      return freeSlots(st);
    }, free);
    const f = await fillTo(3);
    const press = async (code) => { await s.page.keyboard.down(code); await step(s.page, 2); await s.page.keyboard.up(code); await step(s.page, 4); };
    await press('Enter');
    const a = await s.eval(() => ({ ask: !!window.__game.top?.bagAsk, depart: !!window.__game.top?.depart }));
    await s.page.screenshot({ path: path.join(SHOTS, 'worldmap_bag.png') });
    await press('Escape');
    const b = await s.eval(() => ({ ask: !!window.__game.top?.bagAsk, top: window.__game.top?.name }));
    await press('Enter'); await press('ArrowRight'); await press('Enter');
    const c = await s.eval(() => ({ depart: !!window.__game.top?.depart }));
    ok(f === 3, `worldmap: 남은 칸 3 으로 채움 (${f})`);
    ok(a.ask && !a.depart, 'worldmap: 출발 전 확인 창', a);
    ok(!b.ask && b.top === 'worldmap', 'worldmap: 취소 → 지도 그대로', b);
    ok(c.depart, 'worldmap: 「그대로 출발」 → 출발', c);
    await s.close();
    const s2 = await open('desk', 'index.html?scene=worldmap');
    await s2.eval(async () => {
      const st = window.__game.state; const { freeSlots, addItem } = await import('/src/game/inventory.js'); const { makeItem, ITEMS } = await import('/src/data/items.js');
      const base = Object.values(ITEMS).find((b) => b.slot === 'weapon'); let n = 0; while (freeSlots(st) > 1 && n++ < 400) addItem(st, makeItem(base.id));
    });
    const press2 = async (code) => { await s2.page.keyboard.down(code); await step(s2.page, 2); await s2.page.keyboard.up(code); await step(s2.page, 6); };
    await press2('Enter'); await press2('Enter');
    await step(s2.page, 30);
    const d = await s2.eval(() => { const g = window.__game, top = g.top; return { top: top?.name, tab: top?.tabs ? Object.keys(top.tabs) : null, modal: !!(top?.modal || top?.tabs?.inventory?.modal || top?.tabs?.inventory?.dispose) }; });
    await s2.page.screenshot({ path: path.join(SHOTS, 'worldmap_dispose.png') });
    ok(d.top === 'menu', 'worldmap: 「일괄 처분」 → 메뉴 › 인벤토리', d);
    ok(!s.errs.length && !s2.errs.length, 'worldmap: 페이지 오류 0', [...s.errs, ...s2.errs].slice(0, 3));
    await s2.close();
  }

  if (want('town')) {
    console.log('\n[browser] town: 마을 오른쪽 위 선명 칸');
    const s = await open('fold_open', 'index.html?scene=hub');
    await step(s.page, 20);
    await s.wait(300);
    const r = await s.eval(async () => { const { touchpad: tp } = await import('/src/core/touchpad.js'); return { shown: tp?.hudLayerShown?.('town_tr') ?? null, dpr: tp?.crispDpr?.() }; });
    await s.page.screenshot({ path: path.join(SHOTS, 'town.png') });
    ok(r.shown === true && r.dpr >= 2, 'town: 오른쪽 위 판이 기기 해상도 덧캔버스 칸(town_tr)으로 붙는다', r);
    ok(!s.errs.length, 'town: 페이지 오류 0', s.errs.slice(0, 3));
    await s.close();
  }
  await env.close();
}

if (!BROWSER_ONLY) await nodeTests();
if (!NODE_ONLY) await browserTests();
console.log(`\n결과: ${pass} 통과 · ${fail} 실패${fails.length ? '\n  ' + fails.join('\n  ') : ''}`);
process.exit(fail ? 1 : 0);
