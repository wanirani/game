// v2g built-in HUD — the minimal stand-in until the UI lane delivers src/v2/ui (docs/v2/ENGINE_API.md 4).
// The scene calls exactly: hud.update(dt, state) per tick and hud.draw(ctx, state) per drawn frame.
// ctx is in logical px (state.viewW x state.viewH) on a transparent canvas above the 3D picture. Do not clear it.
import { text, FONT } from '../../core/ui.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
// text options are built once (text() only reads them)
const O_NAME = { size: 15, weight: 700, color: '#e8d8c0' }, O_SEC = { size: 15, weight: 600, color: '#e8c872' };
const O_DBG = { size: 11, weight: 500, align: 'center', color: 'rgba(220,210,200,0.62)', ow: 2 };
const O_TIP = { size: 15, weight: 600, align: 'center', color: '#efe4cf' };
const O_BIG = { size: 44, weight: 900, align: 'center', color: '#e8c872', family: FONT.title, ow: 5 };
const O_SUB = { size: 17, weight: 600, align: 'center', color: '#efe4cf' };
const O_DEAD = { size: 34, weight: 900, align: 'center', color: '#ff8a80', family: FONT.title, ow: 5 };
const O_BANNER = { size: 30, weight: 800, align: 'center', color: '#f0e2c4', family: FONT.title, ow: 5 };
const O_MSG = { size: 22, weight: 700, align: 'center', color: '#e8d8c0' }, O_MSG2 = { size: 14, align: 'center', color: '#b8a890' };
const O_NUM = { size: 24, weight: 900, align: 'center', color: '#fff', family: FONT.num, ow: 4 };
const P = { x: 0, y: 0, w: 0 };

export function createBuiltinHud() {
  let secId = '', banner = 0, hpShown = 1, dbg = '', dbgN = 0;
  return {
    builtin: true,
    update(dt, s) {
      if (s.section.id !== secId) { secId = s.section.id; banner = 2.6; }
      banner = Math.max(0, banner - dt);
      const k = clamp(s.hero.hp / s.heroHpMax, 0, 1);
      hpShown += (k - hpShown) * Math.min(1, dt * 6);
    },
    draw(ctx, s) {
      const Wv = s.viewW, Hv = s.viewH, sf = s.safe;
      if (s.message) {   // error / loading: the only opaque screen
        ctx.fillStyle = '#0b0710'; ctx.fillRect(0, 0, Wv, Hv);
        text(ctx, s.message, Wv / 2, Hv / 2 - 10, O_MSG);
        if (s.message2) text(ctx, s.message2, Wv / 2, Hv / 2 + 22, O_MSG2);
        return;
      }
      const h = s.hero;
      // damage numbers
      for (let i = 0; i < s.numbers.length; i++) {
        const n = s.numbers[i]; if (!n.on) continue;
        s.project(n.x, n.y + n.t * 70, n.z, P); if (P.w <= 1) continue;
        const k = clamp(880 / P.w, 0.6, 1.5), pop = n.t < 0.1 ? 1 + (0.1 - n.t) * 5 : 1;
        ctx.globalAlpha = clamp((0.8 - n.t) / 0.25, 0, 1);
        O_NUM.size = Math.round((n.big ? 32 : 24) * k * pop); O_NUM.color = n.color;
        text(ctx, n.str, P.x, P.y, O_NUM);
      }
      ctx.globalAlpha = 1;
      // hurt enemies: small health bars
      const E = s.enemies;
      for (let i = 0; i < E.length; i++) {
        const e = E[i]; if (e.dead || e.state === 'dead' || e.hp >= e.hpMax || !e._a3 || !e._a3.vis) continue;
        s.project(e.x, e.y + (e.h ?? 80) + 26, e.z, P); if (P.w <= 1) continue;
        const k = clamp(880 / P.w, 0.5, 1.4), w = 40 * k, hg = 4 * k;
        ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(P.x - w / 2 - 1, P.y - 1, w + 2, hg + 2);
        ctx.fillStyle = '#e04a3a'; ctx.fillRect(P.x - w / 2, P.y, w * clamp(e.hp / e.hpMax, 0, 1), hg);
      }
      // hero health
      const x = 18 + sf.l, y = 16 + sf.t, bw = 230, bh = 16, k = clamp(h.hp / s.heroHpMax, 0, 1);
      ctx.fillStyle = 'rgba(8,4,10,0.6)'; ctx.fillRect(x - 3, y - 3, bw + 6, bh + 6);
      ctx.fillStyle = '#3a0c14'; ctx.fillRect(x, y, bw, bh);
      if (hpShown > k) { ctx.fillStyle = '#f0d9a0'; ctx.fillRect(x, y, bw * hpShown, bh); }
      ctx.fillStyle = '#d8283a'; ctx.fillRect(x, y, bw * k, bh);
      ctx.fillStyle = 'rgba(255,255,255,0.16)'; ctx.fillRect(x, y, bw * k, bh * 0.4);
      ctx.strokeStyle = 'rgba(232,200,114,0.8)'; ctx.lineWidth = 1.5; ctx.strokeRect(x - 2.5, y - 2.5, bw + 5, bh + 5);
      text(ctx, '카엘', x + 4, y + bh + 22, O_NAME);
      text(ctx, s.section.label + (s.section.id === 'yard' && !s.done ? ' · 남은 적 ' + s.yardLeft : ''), x + 52, y + bh + 22, O_SEC);
      // section name banner when entering
      if (banner > 0 && !s.done && !h.dead && s.section.label) {
        ctx.globalAlpha = clamp(Math.min((2.6 - banner) / 0.35, banner / 0.7), 0, 1);
        text(ctx, s.section.label, Wv / 2, Hv * 0.2 + sf.t, O_BANNER);
        ctx.globalAlpha = 1;
      }
      if (s.time < 7 && !s.done && !h.dead) {
        ctx.globalAlpha = clamp(Math.min(s.time / 0.5, (7 - s.time) / 1), 0, 1);
        text(ctx, '스틱 위 = 화면 안쪽 · 공격은 세 번 이어집니다 · 깊이가 맞아야 맞습니다', Wv / 2, Hv - 30 - sf.b, O_TIP);
        ctx.globalAlpha = 1;
      }
      if (s.done) {
        const a = clamp(s.doneT / 0.5, 0, 1);
        ctx.globalAlpha = a * 0.55; ctx.fillStyle = '#05020a'; ctx.fillRect(0, Hv * 0.34, Wv, 124); ctx.globalAlpha = a;
        text(ctx, '시범 구간 끝', Wv / 2, Hv * 0.34 + 62, O_BIG);
        if (s.doneT > 1.2) text(ctx, '공격 버튼을 누르면 처음부터 다시 시작합니다', Wv / 2, Hv * 0.34 + 100, O_SUB);
        ctx.globalAlpha = 1;
      } else if (h.dead) text(ctx, '쓰러졌습니다…', Wv / 2, Hv * 0.42, O_DEAD);
      if (s.debug) {   // development line (address option v2dbg=1); the string is rebuilt twice a second
        if (dbgN-- <= 0) { dbgN = 30; dbg = s.debugLine(); }
        text(ctx, dbg, Wv / 2, Hv - 8 - sf.b, O_DBG);
      }
    },
    dispose() {},
  };
}
