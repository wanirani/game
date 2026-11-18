// v2g built-in HUD — the minimal stand-in until the UI lane delivers src/v2/ui (docs/v2/ENGINE_API.md 4).
// The scene calls exactly: hud.update(dt, state) per tick and hud.draw(ctx, state) per drawn frame.
// ctx is in logical px (state.viewW x state.viewH) on a transparent canvas above the 3D picture. Do not clear it.
import { text, FONT } from '../../core/ui.js';
import { input } from '../../core/input.js';

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
const O_ROW = { size: 19, weight: 700, align: 'center', color: '#efe4cf' }, O_ROWS = { size: 19, weight: 800, align: 'center', color: '#ffe9b0' };
const O_PR = { size: 16, weight: 700, align: 'center', color: '#fff3d4', ow: 4 }, O_WHO = { size: 17, weight: 800, color: '#e8c872' }, O_SAY = { size: 17, weight: 500, color: '#f2ead8' };

export function createBuiltinHud() {
  let secId = '', banner = 0, hpShown = 1, dbg = '', dbgN = 0, secLeft = -2, secLab = '', secStr = '';
  // the small things the scene needs from any HUD (docs/v2/ENGINE_API.md 4): a pause panel, one dialogue box, one prompt, short notices
  let pause = null, psel = 0, pt = 0, dlg = null, dlgT = 0, dlgState = null, note = '', noteT = 0, prT = 0;
  const PR = { x: 0, y: 0, w: 0, h: 0, p: null }, PB = { x: 0, y: 0, w: 300, rh: 50 };
  const closeDlg = () => { const d = dlg; dlg = null; try { d?.onDone?.(); } catch (e) { console.error('[v2g] dialogue callback', e); } };
  return {
    builtin: true,
    get modal() { return pause ? 'pause' : dlg ? 'dialog' : null; },
    /** rows: resume, the caller's extra rows ({label, onPick}), leave */
    openPause(o) { pause = [['이어 하기', o?.onResume ?? null], ...(o?.extra ?? []).map((x) => [String(x.label), x.onPick ?? null]), ['나가기', o?.onLeave ?? null]]; psel = 0; pt = 0; },
    closePause() { pause = null; },
    showDialog(d) { dlg = d ?? null; dlgT = 0; },
    closeDialog() { dlg = null; },
    toast(t) { note = String(t ?? ''); noteT = 2.6; },
    banner() {}, callout() {},
    /** QA: where the pause rows are (logical px) */
    metrics() { return { pad: null, modal: pause ? 'pause' : dlg ? 'dialog' : null, pause: pause ? { rows: pause.map((r, i) => ({ x: PB.x, y: PB.y + i * PB.rh, w: PB.w, h: PB.rh, label: r[0] })) } : null, prompts: PR.p ? [{ action: PR.p.action, x: PR.x, y: PR.y, w: PR.w, h: PR.h }] : [] }; },
    update(dt, s) {
      if (noteT > 0) noteT -= dt;
      if (s.dialog !== dlgState) { dlgState = s.dialog; dlg = s.dialog ?? null; dlgT = 0; }
      if (pause) {
        pt += dt; if (pt < 0.15) return;
        const n = pause.length; let pick = -1;
        if (input.pressed('up')) psel = (psel + n - 1) % n; else if (input.pressed('down')) psel = (psel + 1) % n;
        else if (input.pressed('confirm') || input.pressed('attack')) pick = psel; else if (input.pressed('cancel') || input.pressed('menu')) pick = 0;
        if (input.pointer.tapped) { const q = input.pointer; for (let i = 0; i < n; i++) if (q.x >= PB.x && q.x <= PB.x + PB.w && q.y >= PB.y + i * PB.rh && q.y < PB.y + (i + 1) * PB.rh) pick = i; }
        if (pick >= 0) { const f = pause[pick][1]; pause = null; try { f?.(); } catch (e) { console.error('[v2g] pause callback', e); } }
        return;
      }
      if (dlg) { dlgT += dt; if (dlgT > 0.25 && (input.pressed('confirm') || input.pressed('attack') || input.pressed('jump') || input.pointer.tapped)) closeDlg(); }
      else if (PR.p && input.pointer.tapped) { const q = input.pointer; if (q.x >= PR.x - 12 && q.x <= PR.x + PR.w + 12 && q.y >= PR.y - 12 && q.y <= PR.y + PR.h + 12) { try { PR.p.onTap?.(PR.p); } catch (e) { console.error(e); } } }
      prT += dt;
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
        const e = E[i], lock = h.lock != null && h.lock === e.id; if (e.dead || e.state === 'dead' || (e.hp >= e.hpMax && !lock) || !e._a3 || !e._a3.vis) continue;
        s.project(e.x, e.y + (e.h ?? 80) + 26, e.z, P); if (P.w <= 1) continue;
        const k = clamp(880 / P.w, 0.5, 1.4), w = 40 * k, hg = 4 * k;
        if (lock) { ctx.fillStyle = '#e8c872'; ctx.beginPath(); ctx.moveTo(P.x - 7 * k, P.y - 16 * k); ctx.lineTo(P.x + 7 * k, P.y - 16 * k); ctx.lineTo(P.x, P.y - 5 * k); ctx.closePath(); ctx.fill(); }   // lock-on mark
        if (e.hp >= e.hpMax) continue;
        ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(P.x - w / 2 - 1, P.y - 1, w + 2, hg + 2);
        ctx.fillStyle = '#e04a3a'; ctx.fillRect(P.x - w / 2, P.y, w * clamp(e.hp / e.hpMax, 0, 1), hg);
      }
      if (s.boss) {   // boss: name (+ what it is doing), health, stagger line, act marks — the fallback of the cut-glass bar
        const b = s.boss, bw = Math.min(360, Wv * 0.44), bx = Wv / 2 - bw / 2, by = (sf?.t ?? 0) + 34;
        text(ctx, b.name, Wv / 2, by - 12, O_TIP); if (b.sub) text(ctx, b.sub, Wv / 2, by + 26, O_DBG);
        ctx.fillStyle = 'rgba(8,4,12,0.74)'; ctx.fillRect(bx, by, bw, 9); ctx.fillStyle = '#e2364e'; ctx.fillRect(bx + 1, by + 1, (bw - 2) * clamp(b.hp / (b.hpMax || 1), 0, 1), 7);
        if (b.stagger > 0) { ctx.fillStyle = '#ffd870'; ctx.fillRect(bx + 1, by + 11, (bw - 2) * clamp(b.stagger, 0, 1), 2); }
        for (let i = 0; i < 2; i++) { ctx.fillStyle = i < (b.phase ?? 1) ? '#ffd870' : 'rgba(10,8,20,0.7)'; ctx.fillRect(bx + bw + 8 + i * 11, by + 1, 7, 7); }
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
      const left = s.section.id === 'yard' && !s.done ? s.yardLeft : -1;
      if (left !== secLeft || s.section.label !== secLab) { secLeft = left; secLab = s.section.label; secStr = secLab + (left >= 0 ? ' · 남은 적 ' + left : ''); }   // the line is rebuilt only when it changes
      text(ctx, secStr, x + 52, y + bh + 22, O_SEC);
      // section name banner when entering
      if (banner > 0 && !s.done && !h.dead && s.section.label) {
        ctx.globalAlpha = clamp(Math.min((2.6 - banner) / 0.35, banner / 0.7), 0, 1);
        text(ctx, s.section.label, Wv / 2, Hv * 0.2 + sf.t, O_BANNER);
        ctx.globalAlpha = 1;
      }
      if (s.time < 7 && !s.done && !h.dead) {
        ctx.globalAlpha = clamp(Math.min(s.time / 0.5, (7 - s.time) / 1), 0, 1);
        text(ctx, s.hero.guard !== undefined ? '대시: 밀면서 누르면 구르기 · 서서 누르고 있으면 막기' : '스틱 위 = 화면 안쪽 · 공격은 세 번 이어집니다 · 깊이가 맞아야 맞습니다', Wv / 2, Hv - 30 - sf.b, O_TIP);
        ctx.globalAlpha = 1;
      }
      if (s.done) {
        const a = clamp(s.doneT / 0.5, 0, 1);
        ctx.globalAlpha = a * 0.55; ctx.fillStyle = '#05020a'; ctx.fillRect(0, Hv * 0.34, Wv, 124); ctx.globalAlpha = a;
        text(ctx, '시범 구간 끝', Wv / 2, Hv * 0.34 + 62, O_BIG);
        if (s.doneT > 1.2) text(ctx, '공격 버튼을 누르면 처음부터 다시 시작합니다', Wv / 2, Hv * 0.34 + 100, O_SUB);
        ctx.globalAlpha = 1;
      } else if (h.dead) text(ctx, '쓰러졌습니다…', Wv / 2, Hv * 0.42, O_DEAD);
      // one prompt (person / usable spot): a labelled chip above it; a tap on it uses it
      PR.p = null;
      const pr = s.prompts && s.prompts.length && !dlg && !pause ? s.prompts[0] : null;
      if (pr && pr.x != null) {
        s.project(pr.x, pr.y ?? 0, pr.z ?? 0, P);
        if (P.w > 1) {
          const w = 30 + pr.label.length * 17, hh = 34, x0 = clamp(P.x - w / 2, sf.l + 4, Wv - sf.r - w - 4), y0 = P.y - hh - 6 + Math.sin(prT * 3) * 2;
          ctx.fillStyle = 'rgba(10,8,16,0.72)'; ctx.fillRect(x0, y0, w, hh); ctx.strokeStyle = 'rgba(232,200,114,0.85)'; ctx.lineWidth = 1.5; ctx.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, hh - 1);
          text(ctx, pr.label, x0 + w / 2, y0 + 23, O_PR);
          PR.p = pr; PR.x = x0; PR.y = y0; PR.w = w; PR.h = hh;
        }
      }
      if (noteT > 0 && note) { ctx.globalAlpha = clamp(noteT / 0.4, 0, 1); ctx.fillStyle = 'rgba(8,6,12,0.66)'; ctx.fillRect(Wv / 2 - 260, Hv * 0.27 + sf.t - 24, 520, 36); text(ctx, note, Wv / 2, Hv * 0.27 + sf.t, O_TIP); ctx.globalAlpha = 1; }
      if (dlg) {
        const w = Math.min(Wv - sf.l - sf.r - 40, 700), x0 = (Wv - w) / 2, hh = 112, y0 = Hv - sf.b - hh - 16;
        ctx.fillStyle = 'rgba(8,6,14,0.84)'; ctx.fillRect(x0, y0, w, hh); ctx.strokeStyle = 'rgba(232,200,114,0.8)'; ctx.lineWidth = 1.5; ctx.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, hh - 1);
        if (dlg.speaker) text(ctx, dlg.speaker, x0 + 20, y0 + 30, O_WHO);
        const lines = String(dlg.text ?? '').split('\n'); for (let i = 0; i < lines.length && i < 3; i++) text(ctx, lines[i], x0 + 20, y0 + (dlg.speaker ? 58 : 36) + i * 24, O_SAY);
      }
      if (pause) {
        const n = pause.length; PB.w = 320; PB.rh = 52; PB.x = Wv / 2 - PB.w / 2; PB.y = Hv / 2 - (n * PB.rh) / 2 + 14;
        ctx.fillStyle = 'rgba(4,5,12,0.6)'; ctx.fillRect(0, 0, Wv, Hv);
        ctx.fillStyle = 'rgba(14,10,20,0.92)'; ctx.fillRect(PB.x - 16, PB.y - 60, PB.w + 32, n * PB.rh + 76); ctx.strokeStyle = 'rgba(232,200,114,0.8)'; ctx.lineWidth = 1.5; ctx.strokeRect(PB.x - 15.5, PB.y - 59.5, PB.w + 31, n * PB.rh + 75);
        text(ctx, '잠시 멈춤', Wv / 2, PB.y - 22, O_BANNER);
        for (let i = 0; i < n; i++) { if (i === psel) { ctx.fillStyle = 'rgba(232,200,114,0.16)'; ctx.fillRect(PB.x, PB.y + i * PB.rh + 3, PB.w, PB.rh - 6); } text(ctx, pause[i][0], Wv / 2, PB.y + i * PB.rh + 33, i === psel ? O_ROWS : O_ROW); }
      }
      if (s.debug) {   // development line (address option v2dbg=1); the string is rebuilt twice a second
        if (dbgN-- <= 0) { dbgN = 30; dbg = s.debugLine(); }
        text(ctx, dbg, Wv / 2, Hv - 8 - sf.b, O_DBG);
      }
    },
    dispose() {},
  };
}
