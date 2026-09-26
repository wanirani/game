// 보스 기본 클래스. 각 보스는 이를 상속해 patterns 를 구현한다 (game/bosses/<id>.js).
// 데이터: data/bosses.js BOSSES[id] = { id, name, title, hp, atk, def, res, exp, score, size:{w,h}, weak, resist, material,
//   music, portrait, stageId, drops:[itemId], phases:[체력비율 경계 ...] 예) [0.6, 0.3], intro: '대사', flying }
// 서브클래스 훅:
//   init()                   생성 직후
//   think(dt, world)         패턴 상태기계 (this.state / this.stateT 사용, this.setState(name))
//   onPhase(n, world)        페이즈 전환 시 (n = 1, 2, ...)
//   render(ctx, world)       그리기 (render/bosses.js 의 함수 호출 권장)
//   hurtboxes()              [rect...] 여러 개의 피격 판정 (기본: 몸통 1개)
// 타격감 훅 (feel §2.1, §4.6; MASTER_PLAN §1.14):
//   world.freezeEnemies      true 인 동안 AI·이동·접촉 피해·자체 공격 시계를 멈춘다 (timeStop 처럼, 회색 화면 없이).
//                            피격·피격 섬광·체력바 잔상과 사망 연출은 계속된다. 공격 개체는 heldByFreeze() 로 함께 멈춘다.
//   boss.telegraph           예고(윈드업) 중이면 true → impact.js 카운터 판정. 경고 도우미(a_common/b_common)가 켜고,
//                            보스 파일은 자기 윈드업에서 this.telegraphFor(초) 또는 this.telegraph = true/false 로 켜고 끈다.
import { Entity } from '../entity.js';
import { moveBody, isSolidType } from '../../core/physics.js';
import { enemyStrike } from '../combat.js';
import { enemyStats } from '../enemy.js';
import { rand, clamp, angleTo } from '../../core/math.js';
import { audio } from '../../core/audio.js';

/** 경고 하나가 켜는 예고(카운터) 창의 최대 길이 (초) — 긴 연속 패턴 내내 카운터가 되지 않게 */
const TG_MAX = 1.5;
/**
 * 적 정지(world.freezeEnemies) 중 보스와 보스 소유 공격 개체(예고·광선·고리·지대·분출)를 붙잡아 둘지.
 * 주인이 죽는 중이면 붙잡지 않는다 (사망 연출이 흐르고 공격 개체가 스스로 정리되게). c_common.js 도 이것을 쓰면 된다.
 */
export function heldByFreeze(world, owner) {   // [hook:feel]
  return !!world?.freezeEnemies && !(owner && (owner.dead || owner.dying > 0));
}

export class Boss extends Entity {
  constructor(world, def, x, y) {
    const w = def.size?.w ?? 120, h = def.size?.h ?? 140;
    super(x - w / 2, y - h, w, h);
    this.kind = 'boss';
    this.world = world;
    this.def = def; this.id = def.id;
    const diff = world.diff;
    const s = enemyStats({ ...def, lv: world.stage.level }, world.stage.level, { ...diff, enemyHp: (diff.bossHp ?? diff.enemyHp) }, false);
    // 초반 보스는 짧게 끝나지 않도록 보정 (레벨 1: ×2.0 → 레벨 11 이상: ×1.0)
    const early = 1 + Math.max(0, 10 - (world.stage.level - 1)) * 0.1;
    // 후반(Lv25~) 보스는 체력 곡선이 가팔라 전투가 늘어지므로 완만하게 깎는다 (목표: 기본기 100~160타)
    const late = 1 / (1 + Math.max(0, world.stage.level - 24) * 0.035);
    s.maxHp = Math.round(s.maxHp * (def.hpMul ?? 1) * early * late);
    s.hp = s.maxHp;
    s.exp = Math.round((def.exp ?? 400) * (1 + world.stage.level * 0.35) * (diff.exp ?? 1));
    this.stats = s;
    this.hp = s.maxHp;
    this.hpGhost = this.hp;
    this.phase = 0;
    this.state = 'intro'; this.stateT = 0;
    this.flashT = 0; this.invuln = false;
    this.noGravity = !!def.flying;
    this.facing = -1;
    this.z = 4;
    this.aggro = diff.aggro ?? 1;
    this.inferno = world.state.difficulty === 'inferno' || world.state.difficulty === 'nightmare';
    this.anim = 'idle'; this.animT = 0;
    this.dying = 0;
    this._tgT = 0; this._tgOn = false;   // [hook:feel] 예고(윈드업) 창 — get telegraph
    this.init?.();
  }
  get player() { return this.world.player; }
  /** 예고(윈드업) 중인가 — 카운터 판정 (feel §4.6). 죽는 중·무적(변신)·무해 상태에서는 false */
  get telegraph() { return (this._tgOn || this._tgT > 0) && !(this.dying > 0) && !this.invuln && !this.harmless; }   // [hook:feel]
  /** true: 끌 때까지 예고 중 / false: 예고 창을 모두 끈다 */
  set telegraph(v) { this._tgOn = !!v; if (!v) this._tgT = 0; }   // [hook:feel]
  /** sec 초 동안 예고 중 (최대 TG_MAX). 보스 시계와 같이 흐른다 (시간 정지 ×0.25, 적 정지 중 멈춤) */
  telegraphFor(sec) { if (sec > 0) this._tgT = Math.max(this._tgT, Math.min(sec, TG_MAX)); }   // [hook:feel]
  setState(s) { this.state = s; this.stateT = 0; this.didAct = false; }
  facePlayer() { const p = this.player; if (p) this.facing = Math.sign(p.cx - this.cx) || this.facing; }
  hurtboxes() { return [{ x: this.x + 6, y: this.y + 6, w: this.w - 12, h: this.h - 12 }]; }
  hurtbox() { const hb = this.hurtboxes(); return hb[0]; }
  /** 근접 판정 (월드 사각형) */
  strikeRect(rect, mv = 1, extra = {}) {
    return enemyStrike(this.world, rect, { owner: this, stats: this.stats, mv, dir: Math.sign(this.player.cx - this.cx) || this.facing, kb: [320, -360], ...extra });
  }
  shoot(o) {
    return this.world.spawnProjectile({ team: 'enemy', owner: this, ...o, attack: { stats: this.stats, mv: 1, kb: [260, -240], dir: Math.sign(o.vx ?? this.facing) || 1, ...(o.attack || {}) } });
  }
  aimAt(x, y, speed) { const a = angleTo(x, y, this.player.cx, this.player.cy); return { vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, a }; }

  update(dt, world) {
    if (heldByFreeze(world, this)) { this._freezeTick(dt); return; }   // [hook:feel] 적 정지: AI·이동·접촉·패턴 시계 정지 (사망 연출은 계속)
    this.t += dt; this.stateT += dt; this.animT += dt;
    if (this.flashT > 0) this.flashT -= dt;
    this.hpGhost = this.hpGhost > this.hp ? Math.max(this.hp, this.hpGhost - this.stats.maxHp * 0.25 * dt) : this.hp;
    if (this.dying > 0) {
      this.dying -= dt;
      if (Math.random() < 0.5) world.fx.burst('fire', this.cx + rand(-this.w / 2, this.w / 2), this.cy + rand(-this.h / 2, this.h / 2), 4, { speed: 160 });
      if (this.dying <= 0) { this.dead = true; }
      return;
    }
    if (world.cutscene) return;
    const ts = world.timeStop > 0 ? 0.25 : 1;
    if (this._tgT > 0) this._tgT -= dt * ts;   // [hook:feel]
    this.think?.(dt * ts, world);
    if (!this.noGravity) moveBody(this, dt * ts, world.map, world.platforms);
    else { this.x += this.vx * dt * ts; this.y += this.vy * dt * ts; }
    // 경기장 안에 유지
    const a = world.arena;
    if (a) {
      if (this.x < a.x0) { this.x = a.x0; this.vx = Math.abs(this.vx) * (this.bounceWalls ? 1 : 0); }
      if (this.x + this.w > a.x1) { this.x = a.x1 - this.w; this.vx = -Math.abs(this.vx) * (this.bounceWalls ? 1 : 0); }
    }
    // 접촉 피해
    if ((this.def.contact ?? 1) > 0 && !this.harmless) {
      for (const hb of this.hurtboxes()) enemyStrike(world, hb, { owner: this, stats: this.stats, mv: this.def.contact ?? 0.8, dir: Math.sign(world.player.cx - this.cx) || 1, kb: [340, -380], tags: ['contact'] });
    }
  }

  /** 적 정지 중 한 프레임: 피격 섬광과 체력바 잔상만 흐른다 (그림은 멈춘 자세 그대로) */
  _freezeTick(dt) {   // [hook:feel]
    if (this.flashT > 0) this.flashT -= dt;
    this.hpGhost = this.hpGhost > this.hp ? Math.max(this.hp, this.hpGhost - this.stats.maxHp * 0.25 * dt) : this.hp;
  }

  takeHit(dmg, attack, world, info) {
    if (this.dying > 0 || this.invuln) return false;
    this.hp -= dmg;
    this.flashT = 0.1;
    const ratio = this.hp / this.stats.maxHp;
    const phases = this.def.phases || [0.5];
    while (this.phase < phases.length && ratio <= phases[this.phase]) {
      this.phase++;
      world.camera.shake(10, 0.5);
      world.game.flash('#ff2040', 0.4, 3);
      audio.sfx('boss_roar');
      this.onPhase?.(this.phase, world);
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.dying = 2.4;
      this.invuln = true;
      this.harmless = true;
      this.onDeath?.(world);
      world.onBossDefeated(this);
      return true;
    }
    return false;
  }

  lights(L) { if (this.def.light) L.add(this.cx, this.cy, this.def.light.r ?? 200, this.def.light.color ?? '#ff4060', this.def.light.i ?? 0.8); }
  draw(ctx, world) {
    ctx.save();
    if (this.dying > 0) ctx.globalAlpha = clamp(this.dying / 2.4, 0, 1);
    this.render ? this.render(ctx, world) : this.defaultRender(ctx, world);
    ctx.restore();
    if (world.game.debug) { ctx.strokeStyle = '#0ff'; for (const hb of this.hurtboxes()) ctx.strokeRect(hb.x, hb.y, hb.w, hb.h); }
  }
  defaultRender(ctx, world) {
    const flash = this.flashT > 0;
    ctx.fillStyle = flash ? '#fff' : '#5a1020';
    ctx.beginPath(); ctx.ellipse(this.cx, this.cy, this.w / 2, this.h / 2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff3040';
    ctx.beginPath(); ctx.arc(this.cx + this.facing * this.w * 0.2, this.cy - this.h * 0.15, 8, 0, Math.PI * 2); ctx.fill();
  }
}

/** 범용 보스 (전용 구현이 없을 때): 돌진 / 탄막 / 도약 패턴 */
export class GenericBoss extends Boss {
  think(dt, world) {
    const p = this.player;
    switch (this.state) {
      case 'intro': this.setState('idle'); break;
      case 'idle':
        this.vx *= 0.9; this.facePlayer();
        if (this.stateT > 1.2 / this.aggro) this.setState(['charge', 'shoot', 'leap'][Math.floor(Math.random() * 3)]);
        break;
      case 'charge':
        if (this.stateT < 0.5) { this.vx = 0; break; }
        this.vx = this.facing * 520;
        if (this.stateT > 1.5) this.setState('idle');
        break;
      case 'shoot':
        if (!this.didAct && this.stateT > 0.4) {
          this.didAct = true;
          for (let i = -2; i <= 2; i++) {
            const v = this.aimAt(this.cx, this.cy, 320);
            const a = v.a + i * 0.2;
            this.shoot({ x: this.cx, y: this.cy, vx: Math.cos(a) * 320, vy: Math.sin(a) * 320, w: 18, h: 18, render: 'fireball', color: '#ff5a4a', life: 3, light: { r: 60, color: '#ff5a4a' } });
          }
          audio.sfx('fire');
        }
        if (this.stateT > 1) this.setState('idle');
        break;
      case 'leap':
        if (!this.didAct && (this.onGround || this.noGravity)) { this.didAct = true; this.vy = -900; this.vx = (p.cx - this.cx) * 1.2; }
        if (this.stateT > 0.3 && this.onGround) { world.camera.shake(8, 0.3); this.vx = 0; this.setState('idle'); }
        if (this.stateT > 2.5) this.setState('idle');
        break;
    }
  }
}
