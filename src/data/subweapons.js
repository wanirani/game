// 보조무기 (하트 소모). 클래식 악마성 스타일: ▲+공격 또는 A키
// fire(player, world, n) : n = 동시 발사 수(더블/트리플 파워업)
import { audio } from '../core/audio.js';
import { rand, TAU } from '../core/math.js';
import { Hitbox, explode } from '../game/projectiles.js';

const base = (p) => ({ stats: p.stats, type: 'phys', tags: ['sub'], hitstop: 0.04, shake: 2 });

// ── 연금 플라스크 (외전 26장 보상, docs/specs/ex_s26.md §3.1) — 던질 때마다 불 → 얼음 → 독 차례. 그림은 납작한 채움만 (그라디언트·Math.random 없음, hook_tags).
const FLASK_EL = [{ id: 'fire', col: '#ff7a2a' }, { id: 'ice', col: '#9fe8ff' }, { id: 'poison', col: '#7cff5a' }];
/** 남은 수명 비율 0–1 (끝 0.25 초 동안 사라진다) */
const fade = (hb) => Math.max(0, Math.min(1, hb.life / 0.25, hb.t / 0.08));
function flaskFlames(ctx, hb, world) {
  const f = fade(hb), t = world.time, fy = hb.bottom, n = 6;
  if (f <= 0.01) return;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    const fx = hb.x + (i + 0.5) * (hb.w / n), h = (18 + 11 * Math.sin(t * 17 + i * 2.1 + hb.x * 0.05)) * f;
    ctx.fillStyle = `rgba(255,122,42,${0.7 * f})`; ctx.beginPath(); ctx.ellipse(fx, fy - h / 2, 7, h / 2 + 2, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = `rgba(255,224,150,${0.6 * f})`; ctx.beginPath(); ctx.ellipse(fx, fy - h / 3, 3, h / 3 + 1, 0, 0, TAU); ctx.fill();
  }
  ctx.restore();
}
function flaskSpikes(ctx, hb, world) {
  const f = fade(hb), rise = Math.min(1, hb.t / 0.08), fy = hb.bottom, cx = hb.cx;
  if (f <= 0.01) return;
  ctx.save(); ctx.globalAlpha *= f; ctx.lineJoin = 'round';
  for (let i = -2; i <= 2; i++) {
    const hx = cx + i * 14, hh = hb.h * rise * (1 - Math.abs(i) * 0.22) + Math.sin(world.time * 3 + i + hb.x * 0.03) * 1.5;
    ctx.beginPath(); ctx.moveTo(hx - 9, fy); ctx.lineTo(hx + (i % 2) * 2, fy - hh); ctx.lineTo(hx + 9, fy); ctx.closePath();
    ctx.fillStyle = 'rgba(159,232,255,0.85)'; ctx.fill();
    ctx.lineWidth = 1.6; ctx.strokeStyle = '#2a6a88'; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.moveTo(hx - 3, fy - 4); ctx.lineTo(hx + (i % 2) * 2, fy - hh + 6); ctx.lineTo(hx, fy - 4); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}
function flaskPuddle(ctx, hb, world) {
  const f = fade(hb), t = world.time, fy = hb.bottom, x = hb.cx, rx = hb.w / 2, seed = hb.x * 0.07, n = 9;
  if (f <= 0.01) return;
  ctx.save(); ctx.globalAlpha *= f;
  ctx.beginPath(); ctx.moveTo(x - rx, fy);
  for (let i = 0; i <= n; i++) {
    const u = i / n, wob = Math.sin(t * 3 + seed + i * 1.7) * 1.2;
    ctx.lineTo(x - rx + u * rx * 2, fy - 3 - Math.sin(u * Math.PI) * 8 + wob);
  }
  ctx.lineTo(x + rx, fy); ctx.closePath();
  ctx.fillStyle = 'rgba(92,200,64,0.82)'; ctx.fill();
  ctx.lineWidth = 1.4; ctx.strokeStyle = '#1f5a14'; ctx.stroke();
  ctx.fillStyle = 'rgba(200,255,170,0.6)'; ctx.beginPath(); ctx.ellipse(x - rx * 0.3, fy - 7, rx * 0.25, 2, 0, 0, TAU); ctx.fill();
  for (let i = 0; i < 3; i++) {   // 거품 (시간 + 자리로만 움직인다)
    const u = (t * 0.8 + i * 0.33 + (seed % 1)) % 1, bx = x + (((i * 0.37 + seed) % 1) - 0.5) * rx * 1.4;
    ctx.strokeStyle = `rgba(200,255,170,${0.8 * (1 - u)})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(bx, fy - 5 - u * 8, 1.5 + u * 2, 0, TAU); ctx.stroke();
  }
  ctx.restore();
}
const FLASK_HIT = {
  fire(p, w, x, y) {
    explode(w, x, y - 12, { r: 76, attack: { stats: p.stats, mv: 1.9, element: 'fire', tags: ['sub'] } });
    w.add(new Hitbox({ x: x - 48, y: y - 40, w: 96, h: 40, life: 0.9, attack: { ...base(p), mv: 0.22, element: 'fire', rehit: 0.2, kb: [30, -60], hitstop: 0.02 },
      light: { r: 90, color: '#ff7a2a', i: 0.8 }, render: flaskFlames }));
  },
  ice(p, w, x, y) {
    audio.sfx('ice', { pitch: 1.1 });
    w.fx.burst('ice', x, y - 20, 14, { speed: 220 });
    w.add(new Hitbox({ x: x - 42, y: y - 100, w: 84, h: 100, life: 0.3, attack: { ...base(p), mv: 1.5, element: 'ice', stun: 0.45, kb: [80, -200] }, render: flaskSpikes }));
  },
  poison(p, w, x, y) {
    audio.sfx('splash', { pitch: 1.2, vol: 0.6 });
    w.fx.burst('goo', x, y - 6, 10, { color: '#7cff5a', speed: 160 });
    w.add(new Hitbox({ x: x - 55, y: y - 28, w: 110, h: 28, life: 2.4, attack: { ...base(p), mv: 0.28, rehit: 0.3, kb: [20, -40], hitstop: 0.01 }, render: flaskPuddle }));
  },
};

export const SUBWEAPONS = {
  dagger: {
    id: 'dagger', name: '투척 단검', desc: '빠르게 직선으로 날아가는 단검. 연사가 쉽다.', cost: 1, cd: 0.16, icon: 'sub_dagger',
    fire(p, w, n) {
      for (let i = 0; i < n; i++) {
        w.spawnProjectile({ x: p.cx + p.facing * 20, y: p.y + 30 + i * 10, vx: p.facing * 1100, vy: 0, w: 26, h: 10, render: 'knife', life: 0.8, owner: p,
          attack: { ...base(p), mv: 0.9, kb: [120, -40] } });
      }
      audio.sfx('dagger');
    },
  },
  axe: {
    id: 'axe', name: '투척 도끼', desc: '높은 포물선을 그리며 날아가 위쪽 적을 노린다. 관통.', cost: 1, cd: 0.4, icon: 'sub_axe',
    fire(p, w, n) {
      for (let i = 0; i < n; i++) {
        w.spawnProjectile({ x: p.cx, y: p.y + 20, vx: p.facing * (330 + i * 70), vy: -900, w: 34, h: 34, behavior: 'arc', gravity: 0.85, collideWalls: false, render: 'axe', spin: 16 * p.facing, life: 2, pierce: 99, owner: p,
          attack: { ...base(p), mv: 1.6, kb: [200, -200], rehit: 0.3 } });
      }
      audio.sfx('axe');
    },
  },
  holywater: {
    id: 'holywater', name: '성수', desc: '땅에 닿으면 푸른 성화가 솟아 적을 지속적으로 태운다.', cost: 1, cd: 0.45, icon: 'sub_holywater',
    fire(p, w, n) {
      for (let i = 0; i < n; i++) {
        w.spawnProjectile({ x: p.cx + p.facing * 16, y: p.y + 24, vx: p.facing * (300 + i * 90), vy: -260, w: 14, h: 14, behavior: 'fall', render: 'flask', spin: 10, life: 2, pierce: 99, owner: p, attack: { ...base(p), mv: 0 , flat: 0},
          onLand(pr, world) {
            pr.dead = true;
            audio.sfx('holywater_burn');
            world.fx.burst('water', pr.cx, pr.cy, 10);
            world.add(new Hitbox({ x: pr.cx - 40, y: pr.bottom - 56, w: 80, h: 56, life: 1.3, attack: { ...base(p), mv: 0.35, element: 'holy', rehit: 0.15, kb: [40, -80], stun: 0.1, hitstop: 0.02 },
              light: { r: 110, color: '#6ab8ff', i: 0.9 },
              render(ctx, hb, world) {
                ctx.save(); ctx.globalCompositeOperation = 'lighter';
                for (let k = 0; k < 5; k++) {
                  const fx = hb.x + 8 + k * 16 + Math.sin(world.time * 20 + k) * 2;
                  const h = 30 + Math.sin(world.time * 17 + k * 2) * 12;
                  const g = ctx.createLinearGradient(0, hb.bottom - h, 0, hb.bottom);
                  g.addColorStop(0, 'rgba(120,200,255,0)'); g.addColorStop(0.4, 'rgba(90,170,255,0.8)'); g.addColorStop(1, 'rgba(220,240,255,0.95)');
                  ctx.fillStyle = g;
                  ctx.beginPath(); ctx.ellipse(fx, hb.bottom - h / 2, 8, h / 2, 0, 0, TAU); ctx.fill();
                }
                ctx.restore();
              } }));
          } });
      }
      audio.sfx('dagger', { pitch: 0.7 });
    },
  },
  cross: {
    id: 'cross', name: '부메랑 십자가', desc: '앞으로 날아갔다가 되돌아오는 성스러운 십자가. 왕복하며 두 번 벤다.', cost: 1, cd: 0.5, icon: 'sub_cross',
    fire(p, w, n) {
      for (let i = 0; i < n; i++) {
        w.spawnProjectile({ x: p.cx + p.facing * 20, y: p.y + 30 - i * 16, vx: p.facing * 820, vy: 0, w: 34, h: 34, behavior: 'boomerang', returnTo: p, turnTime: 0.42, render: 'cross', spin: 18, life: 2.4, pierce: 99, collideWalls: false, owner: p,
          light: { r: 70, color: '#ffe080', i: 0.7 }, attack: { ...base(p), mv: 1.2, element: 'holy', rehit: 0.35, kb: [160, -80] } });
      }
      audio.sfx('cross');
    },
  },
  stopwatch: {
    id: 'stopwatch', name: '회중시계', desc: '잠시 시간을 멈춘다. 보스에게는 효과가 약하다.', cost: 5, cd: 6, icon: 'sub_stopwatch',
    fire(p, w, n) {
      w.timeStop = 2.2 + n * 0.8;
      w.game.flash('#b0c8ff', 0.5, 3);
      audio.sfx('stopwatch');
    },
  },
  pistol: {
    id: 'pistol', name: '은탄 권총', desc: '누구나 쓸 수 있는 은탄 권총. 빠른 탄속과 넉백.', cost: 1, cd: 0.28, icon: 'sub_pistol',
    fire(p, w, n) {
      for (let i = 0; i < n; i++) {
        w.spawnProjectile({ x: p.cx + p.facing * 30, y: p.y + 32 + (i - (n - 1) / 2) * 8, vx: p.facing * 1500, vy: (i - (n - 1) / 2) * 90, w: 18, h: 8, render: 'bullet', life: 0.6, owner: p,
          attack: { ...base(p), mv: 1.1, kb: [260, -60], hitstop: 0.05 } });
      }
      w.fx.flash(p.cx + p.facing * 40, p.y + 32, { color: '#ffd070', size: 40 });
      w.fx.burst('smoke', p.cx + p.facing * 40, p.y + 32, 3);
      w.camera.shake(2, 0.08);
      audio.sfx('gun');
    },
  },
  bible: {
    id: 'bible', name: '성서', desc: '몸 주위를 도는 성서가 닿는 적을 계속 공격한다.', cost: 2, cd: 1.2, icon: 'sub_bible',
    fire(p, w, n) {
      for (let i = 0; i < n; i++) {
        w.spawnProjectile({ x: p.cx, y: p.cy, vx: 0, vy: 0, w: 28, h: 30, behavior: 'orbit', orbitR: 80, orbitSpeed: 5.5, orbitA: (i / n) * TAU, render: 'book', life: 4, pierce: 999, collideWalls: false, owner: p,
          light: { r: 60, color: '#ffe8b0', i: 0.6 }, attack: { ...base(p), mv: 0.8, element: 'holy', rehit: 0.4, kb: [200, -120] } });
      }
      audio.sfx('holy');
    },
  },
  bomb: {
    id: 'bomb', name: '화염병', desc: '포물선으로 던져 폭발시킨다. 넓은 범위 화염 피해.', cost: 2, cd: 0.7, icon: 'sub_bomb',
    fire(p, w, n) {
      for (let i = 0; i < n; i++) {
        w.spawnProjectile({ x: p.cx, y: p.y + 20, vx: p.facing * (420 + i * 80), vy: -520, w: 16, h: 16, behavior: 'bounce', bounciness: 0.3, render: 'flask', color: '#ff7a2a', spin: 10, life: 0.9, owner: p, pierce: 1,
          attack: { ...base(p), mv: 0.5, element: 'fire' },
          onExpire(pr, world) { explode(world, pr.cx, pr.cy, { r: 80, attack: { stats: p.stats, mv: 2.2, element: 'fire', tags: ['sub'] } }); } });
      }
      audio.sfx('dagger', { pitch: 0.6 });
    },
  },
  flask: {
    id: 'flask', name: '연금 플라스크', desc: '던질 때마다 불, 얼음, 독 차례로 바뀌는 플라스크. 불은 터지고, 얼음은 얼리고, 독은 고인다.', cost: 2, cd: 0.55, icon: 'sub_holywater',
    // 외전 26장 보상 (docs/specs/ex_s26.md §3.1). p.flaskI = 다음 원소 (0 불 · 1 얼음 · 2 독, 저장 안 함)
    fire(p, w, n) {
      for (let i = 0; i < n; i++) {
        const k = (p.flaskI = ((p.flaskI ?? -1) + 1) % 3), el = FLASK_EL[k];
        w.spawnProjectile({ x: p.cx + p.facing * 14, y: p.y + 22, vx: p.facing * (380 + i * 80), vy: -460, w: 14, h: 14, behavior: 'fall', render: 'flask', color: el.col, spin: 12, life: 1.6, pierce: 99, owner: p,
          attack: { ...base(p), mv: 0 },
          onLand(pr, world) { pr.dead = true; FLASK_HIT[el.id](p, world, pr.cx, pr.bottom); } });
      }
      audio.sfx('dagger', { pitch: 0.75 });
    },
  },
};
export const SUB_ORDER = ['dagger', 'axe', 'holywater', 'cross', 'stopwatch', 'pistol', 'bible', 'bomb', 'flask'];   // flask = 외전 26장 보상 (상점·드롭 무작위에도 든다)
