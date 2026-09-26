// 보조무기 (하트 소모). 클래식 악마성 스타일: ▲+공격 또는 A키
// fire(player, world, n) : n = 동시 발사 수(더블/트리플 파워업)
import { audio } from '../core/audio.js';
import { rand, TAU } from '../core/math.js';
import { Hitbox, explode } from '../game/projectiles.js';

const base = (p) => ({ stats: p.stats, type: 'phys', tags: ['sub'], hitstop: 0.04, shake: 2 });

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
};
export const SUB_ORDER = ['dagger', 'axe', 'holywater', 'cross', 'stopwatch', 'pistol', 'bible', 'bomb'];
