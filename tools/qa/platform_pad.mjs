// Controller acceptance suite — platform.md §11 WP-1 (acceptance 1–8), §3, §4; MASTER_PLAN §1.4 arcade preset.
// Issues: P-05 glyph sets, P-06 input mode / pad visibility, P-07 mapping, P-14 sticks and triggers, P-15 hot-plug,
//         P-16 haptics, P-17 remap / confirm position.
//
//   node tools/qa/platform_pad.mjs [--only glyphs,mode,mapping,menus,stick,trigger,hotplug,haptics,confirm,remap,classic,nonstd]
//                                  [--strict] [--assume PLAT-INPUT] [--shots]
// Report: /tmp/claude-0/qa/platform/platform_pad.json
import { Suite, fmt } from './lib/suite.mjs';
import { openEnv } from './lib/server.mjs';
import { fakePadInit, PAD_IDS, BTN, press, axes, setButton, connect, disconnect, rumbleLog } from './lib/fakepad.mjs';
import { Touch, padVisible, waitPadVisible } from './lib/touch.mjs';
import { prepPlayer, refill, during } from './lib/play.mjs';

const suite = new Suite('platform_pad');
const env = await openEnv();

/** Stage page with a fake pad, dialogue skipped with the pad, player made invulnerable and resourced. */
async function stageWithPad(vp, stage = 's03', pad = {}, extra = {}) {
  const s = await env.page(vp, `index.html?scene=stage&stage=${stage}`, { initScripts: [fakePadInit(pad)], ...extra });
  await s.waitGame('!!g.world?.player');
  await connect(s.page);
  await s.wait(300);
  // skip the stage intro with the pad; the intro dialogue can start a moment after the stage, so wait for 1.2 s of stage time
  for (let i = 0; i < 60; i++) {
    const st = await s.eval(() => ({ top: window.__game.top?.name, t: window.__game.world?.time ?? 0 }));
    if (st.top === 'stage' && st.t >= 1.2) break;
    if (st.top === 'stage') { await s.wait(150); continue; }
    await press(s.page, BTN.A, 70, 120);
  }
  await s.wait(700);
  await prepPlayer(s);
  return s;
}

const settle = async (s) => { await axes(s.page, 0, 0); await s.wait(650); await refill(s); };

try {
  // ── 1. glyph sets per pad id (P-05) ───────────────────────────────────────────
  await suite.group('glyphs', async () => {
    for (const [set, id] of [['xbox', PAD_IDS.xbox], ['ps', PAD_IDS.ps], ['nintendo', PAD_IDS.nintendo], ['generic', PAD_IDS.generic]]) {
      const s = await env.page('desk', 'index.html', { initScripts: [fakePadInit({ id })] });
      await s.wait(1500);
      await connect(s.page);
      await press(s.page, BTN.DOWN);
      await s.wait(250);
      await suite.check({ id: `glyphs.${set}`, group: 'glyphs', issue: 'P-05', pkg: 'PLAT-INPUT', title: `pad id → glyph set '${set}' (title)`, session: s }, async () => {
        const r = await s.eval(async () => {
          const i = window.__game.input;
          let glyphFor = null, binding = null;
          try {
            const P = await import('/src/core/prompts.js');
            if (typeof P.glyphFor === 'function') glyphFor = P.glyphFor('jump');
            binding = P.bindingOf?.('confirm', 'pad') ?? null;
          } catch (e) { glyphFor = 'ERR ' + e.message; }
          return { mode: i.mode ?? null, padInfo: i.padInfo ?? null, glyphFor, binding };
        });
        const got = r.padInfo?.glyphs ?? null;
        return { pass: got === set && r.mode === 'pad', detail: `input.padInfo.glyphs=${fmt(got)} mode=${fmt(r.mode)}${r.glyphFor ? ' glyphFor(jump)=' + fmt(r.glyphFor) : ''}`, metrics: r };
      });
      await suite.errors({ id: `glyphs.${set}.errors`, group: 'glyphs' }, s);
      await s.close();
    }
    // a fingerprint sensor exposed as a gamepad must be ignored (§4.1 filtering)
    const s = await env.page('desk', 'index.html', { initScripts: [fakePadInit({ id: PAD_IDS.fingerprint, buttons: 4 })] });
    await s.wait(1500);
    await connect(s.page);
    await press(s.page, BTN.A);
    await suite.check({ id: 'glyphs.filter', group: 'glyphs', issue: '§4.1', gate: 'PLAT-INPUT', title: "'uinput-fpc' pads are ignored" }, async () => {
      const r = await s.eval(() => ({ mode: window.__game.input.mode ?? null, padInfo: window.__game.input.padInfo ?? null }));
      if (typeof r.mode !== 'string') return { pass: false, detail: 'input.mode missing (no device model yet)' };
      return { pass: r.mode !== 'pad' && !r.padInfo, detail: fmt(r) };
    });
    await s.close();
  }, env);

  // ── 6. input mode on a touch device: pad press hides the virtual pad, touch shows it (P-06) ──
  await suite.group('mode', async () => {
    for (const vp of suite.vps(['phone1', 'tablet'])) {
      const s = await env.page(vp, 'index.html?scene=stage&stage=s01', { initScripts: [fakePadInit({ id: PAD_IDS.xbox })] });
      await s.waitGame('!!g.world?.player');
      await s.wait(1500);
      await s.skipDialogue();
      await s.wait(300);
      const t = new Touch(s.cdp, s.page);
      const [W, H] = await s.eval(() => [innerWidth, innerHeight]);
      await t.tap(W * 0.5, H * 0.3);
      await s.wait(400);
      const before = await padVisible(s.page);
      await connect(s.page);
      await setButton(s.page, BTN.RIGHT, 1);
      const hide = await waitPadVisible(s.page, false, 1500);
      await setButton(s.page, BTN.RIGHT, 0);
      const mode1 = await s.eval(() => window.__game.input.mode ?? null);
      await s.wait(200);
      const tt = t.tap(W * 0.5, H * 0.3, 60);
      const show = await waitPadVisible(s.page, true, 1500);
      await tt;
      const mode2 = await s.eval(() => window.__game.input.mode ?? null);
      // 300 ms of wall time, or 18 game steps (300 ms of simulated time) when the machine is loaded
      const quick = (r) => r.ok && (r.ms <= 300 || r.ticks <= 18);
      await suite.check({ id: `mode.${vp}`, group: 'mode', issue: 'P-06', pkg: 'PLAT-INPUT', title: 'pad press hides the virtual pad within 300 ms; a touch shows it again', session: s }, async () => ({
        pass: before.visible && quick(hide) && show.ok,
        detail: `touch→visible ${before.visible}; pad press→hidden ${hide.ok ? `after ${hide.ms} ms / ${hide.ticks} steps` : 'never (1.5 s)'} (mode ${mode1}); touch→visible ${show.ok ? `after ${show.ms} ms` : 'never'} (mode ${mode2}) [${before.source}]`,
        metrics: { before, hide, show, mode1, mode2 },
      }));
      await suite.errors({ id: `mode.${vp}.errors`, group: 'mode' }, s);
      await s.close();
    }
  }, env);

  // ── 4. arcade preset rows in stage s03 (P-07) ───────────────────────────────────
  await suite.group('mapping', async () => {
    const s = await stageWithPad('desk', 's03', { id: PAD_IDS.xbox });
    const row = async (id, title, btn, judge, { ms = 90, tail = 450, pre = null } = {}) => {
      await settle(s);
      if (pre) await pre();
      const p0 = await s.player();
      const fr = await during(s, () => press(s.page, btn, ms, 0), tail);
      await suite.check({ id: `mapping.${id}`, group: 'mapping', issue: 'P-07', pkg: 'PLAT-INPUT', title, session: s }, async () => judge(fr, p0));
    };
    const any = (fr, f) => fr.some(f);
    await row('jump', 'S (A/✕) → jump (vy < 0)', BTN.A, (fr, p0) => { const minY = Math.min(...fr.map((f) => f.y)); return { pass: any(fr, (f) => f.vy < -100) || minY < p0.y - 20, detail: `min vy ${Math.min(...fr.map((f) => f.vy)).toFixed(0)}, rise ${(p0.y - minY).toFixed(0)} px` }; });
    await row('attack', 'W (X/□) → attack (p.move set)', BTN.X, (fr) => { const m = fr.find((f) => f.move); return { pass: !!m, detail: m ? `move ${m.move}` : 'no attack move' }; });
    await row('dash', 'E (B/○) → dash (anim dash)', BTN.B, (fr) => { const anims = [...new Set(fr.map((f) => f.move || f.anim))]; return { pass: fr.some((f) => f.anim === 'dash'), detail: `anims ${anims.join(',')}` }; });
    await row('sub', 'N (Y/△) → sub-weapon (hearts spent)', BTN.Y, (fr, p0) => { const h = Math.min(...fr.map((f) => f.hearts)); return { pass: h < p0.hearts, detail: `hearts ${p0.hearts} → ${h}` }; });
    await row('skill1', 'LB → skill 1 (MP spent)', BTN.LB, (fr, p0) => { const m = Math.min(...fr.map((f) => f.mp)); return { pass: m < p0.mp - 0.5, detail: `mp ${Math.round(p0.mp)} → ${Math.round(m)}` }; }, { tail: 700 });
    await row('skill2', 'RB → skill 2 (MP spent)', BTN.RB, (fr, p0) => { const m = Math.min(...fr.map((f) => f.mp)); return { pass: m < p0.mp - 0.5, detail: `mp ${Math.round(p0.mp)} → ${Math.round(m)}` }; }, { tail: 700 });
    await row('swap', 'LT → skill page swap', BTN.LT, (fr, p0) => { const pages = [...new Set(fr.map((f) => f.page))]; const dash = fr.some((f) => f.anim === 'dash'); return { pass: fr.some((f) => f.page !== p0.page), detail: `page ${p0.page} → ${pages.join(',')}${dash ? ' (dashed instead)' : ''}` }; });
    await row('ult', 'RT (≥ 0.5) → ultimate', BTN.RT, (fr, p0) => { const sp = Math.min(...fr.map((f) => f.sp)); const cut = fr.some((f) => f.top === 'ultCutin'); return { pass: sp < 100 || cut, detail: `sp 100 → ${sp}${cut ? ', ult cut-in' : ''}` }; }, { pre: () => s.eval(() => { __game.world.run.sp = 100; }), tail: 600 });
    await s.wait(1500);
    for (let i = 0; i < 12 && (await s.top()) !== 'stage'; i++) await s.wait(250);
    await settle(s);
    await press(s.page, BTN.SELECT, 90, 500);
    await suite.check({ id: 'mapping.map', group: 'mapping', issue: 'P-07', pkg: 'PLAT-INPUT', title: 'SELECT → menu on the inventory tab', session: s }, async () => {
      const r = await s.eval(async () => { const g = window.__game; let tab = null; try { const M = await import('/src/scenes/menu/menu.js'); tab = g.top?.name === 'menu' ? M.MENU_TABS?.[g.top.ti]?.id ?? null : null; } catch { tab = null; } return { scenes: g.scenes.map((x) => x.name).join('>'), tab }; });
      return { pass: /menu$/.test(r.scenes) && r.tab === 'inventory', detail: `${r.scenes}${r.tab ? ' tab ' + r.tab : ''}` };
    });
    for (let i = 0; i < 4 && (await s.top()) !== 'stage'; i++) { await press(s.page, BTN.START); await s.wait(300); }
    await settle(s);
    await press(s.page, BTN.START);
    await s.wait(500);
    await suite.check({ id: 'mapping.start', group: 'mapping', issue: 'P-07', pkg: 'PLAT-INPUT', title: 'START → pause', session: s }, async () => { const sc = await s.scenes(); return { pass: /pause$/.test(sc), detail: sc }; });
    await suite.errors({ id: 'mapping.errors', group: 'mapping' }, s);
    await s.close();
  }, env);

  // ── menus with the pad: LB/RB tabs, B closes (P-07) ────────────────────────────
  await suite.group('menus', async () => {
    const s = await stageWithPad('desk', 's02', { id: PAD_IDS.xbox });
    await s.eval(() => __game.push('menu', { world: __game.world, tab: 'status' }));
    await s.wait(700);
    const ti0 = await s.eval(() => __game.top.ti);
    await press(s.page, BTN.RB); await s.wait(250);
    const ti1 = await s.eval(() => __game.top.ti);
    await press(s.page, BTN.LB); await s.wait(250);
    const ti2 = await s.eval(() => __game.top.ti);
    await suite.check({ id: 'menus.tabs', group: 'menus', issue: 'P-07', pkg: 'PLAT-INPUT', title: 'RB / LB switch menu tabs', session: s }, async () => ({ pass: ti1 === ti0 + 1 && ti2 === ti0, detail: `ti ${ti0} → RB ${ti1} → LB ${ti2}` }));
    for (let i = 0; i < 4 && /menu/.test(await s.scenes()); i++) { await press(s.page, BTN.B); await s.wait(300); }
    await suite.check({ id: 'menus.close', group: 'menus', issue: 'P-07', pkg: 'PLAT-INPUT', title: 'B backs out of the menu', session: s }, async () => { const sc = await s.scenes(); return { pass: !/menu/.test(sc), detail: sc }; });
    await suite.errors({ id: 'menus.errors', group: 'menus' }, s);
    await s.close();
  }, env);

  // ── 2. sticks: radial deadzone, run threshold, release, diagonal stability (P-14) ─
  await suite.group('stick', async () => {
    const s = await stageWithPad('desk', 's03', { id: PAD_IDS.xbox });
    const moveBy = async (x, y, ms) => { const a = await s.player(); await axes(s.page, x, y); await s.wait(ms); const b = await s.player(); return b.x - a.x; };
    const d015 = await moveBy(0.15, 0, 500);
    await axes(s.page, 0, 0); await s.wait(300);
    const d055 = await moveBy(0.55, 0, 500);
    await axes(s.page, 0.3, 0); await s.wait(250);
    const d030 = await moveBy(0.3, 0, 350);
    await axes(s.page, 0, 0); await s.wait(300);
    await suite.check({ id: 'stick.deadzone', group: 'stick', issue: 'P-14', gate: 'PLAT-INPUT', title: 'stick 0.15 → no movement', session: s }, async () => ({ pass: Math.abs(d015) < 3, detail: `dx ${d015.toFixed(1)} px in 0.5 s` }));
    await suite.check({ id: 'stick.run', group: 'stick', issue: 'P-14', gate: 'PLAT-INPUT', title: 'stick 0.55 → moves right', session: s }, async () => ({ pass: d055 > 20, detail: `dx ${d055.toFixed(1)} px in 0.5 s` }));
    await suite.check({ id: 'stick.release', group: 'stick', issue: 'P-14', gate: 'PLAT-INPUT', title: 'back to 0.30 → stops', session: s }, async () => ({ pass: Math.abs(d030) < 6, detail: `dx ${d030.toFixed(1)} px in 0.35 s after easing to 0.30` }));
    // diagonal: direction state must not flicker across 60 frames
    const flick = await s.eval(async () => {
      window.__padAxes(0.64, 0.64);
      const i = window.__game.input; const seen = []; let changes = 0, last = null;
      await new Promise((res) => { let n = 0; const f = () => { const k = ['left', 'right', 'up', 'down'].filter((a) => i.down(a)).join('+'); if (last !== null && k !== last) changes++; last = k; seen.push(k); if (++n < 60) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
      window.__padAxes(0, 0);
      return { changes, states: [...new Set(seen)] };
    });
    await suite.check({ id: 'stick.diagonal', group: 'stick', issue: 'P-14', gate: 'PLAT-INPUT', title: '45° diagonal does not flicker over 60 frames', session: s }, async () => ({ pass: flick.changes <= 1, detail: `${flick.changes} changes, states ${flick.states.join(' / ')}` }));
    const tilt = await s.eval(async () => {
      window.__padAxes(0.95, -0.28);
      await new Promise((r) => setTimeout(r, 200));
      const i = window.__game.input; const r = { up: i.down('up'), right: i.down('right') };
      window.__padAxes(0, 0); return r;
    });
    await suite.check({ id: 'stick.tilt', group: 'stick', issue: 'P-14', gate: 'PLAT-INPUT', title: 'running with a slight upward tilt does not hold up', session: s }, async () => ({ pass: tilt.right && !tilt.up, detail: fmt(tilt) }));
    await suite.errors({ id: 'stick.errors', group: 'stick' }, s);
    await s.close();
  }, env);

  // ── 3. triggers use value with 0.5 / 0.35 (P-14) ─────────────────────────────────
  await suite.group('trigger', async () => {
    const s = await stageWithPad('desk', 's03', { id: PAD_IDS.xbox });
    await s.eval(() => { __game.world.run.sp = 100; });
    const fr1 = await during(s, async () => { await setButton(s.page, BTN.RT, 0.3); await s.wait(350); await setButton(s.page, BTN.RT, 0); }, 300);
    const fired1 = fr1.some((f) => f.sp < 100 || f.top === 'ultCutin');
    await suite.check({ id: 'trigger.rest', group: 'trigger', issue: 'P-14', gate: 'PLAT-INPUT', title: 'RT 0.3 → no ultimate', session: s }, async () => ({ pass: !fired1, detail: fired1 ? 'ultimate fired at RT 0.3' : 'no ultimate' }));
    await s.wait(1500);
    for (let i = 0; i < 12 && (await s.top()) !== 'stage'; i++) await s.wait(250);
    await s.eval(() => { __game.world.run.sp = 100; });
    const fr2 = await during(s, async () => { await setButton(s.page, BTN.RT, 0.6); await s.wait(250); await setButton(s.page, BTN.RT, 0); }, 500);
    const fired2 = fr2.some((f) => f.sp < 100 || f.top === 'ultCutin');
    await suite.check({ id: 'trigger.press', group: 'trigger', issue: 'P-14', gate: 'PLAT-INPUT', title: 'RT 0.6 → ultimate', session: s }, async () => ({ pass: fired2, detail: fired2 ? 'ultimate fired' : 'no ultimate at RT 0.6' }));
    await suite.errors({ id: 'trigger.errors', group: 'trigger' }, s);
    await s.close();
  }, env);

  // ── 5. hot-plug: disconnect pauses and toasts, reconnect toasts (P-15) ──────────
  await suite.group('hotplug', async () => {
    const s = await stageWithPad('desk', 's03', { id: PAD_IDS.ps });
    const fr = await during(s, () => disconnect(s.page), 700);
    const paused = fr.some((f) => f.top === 'pause');
    const toastOff = fr.map((f) => f.toasts).find((t) => /끊어|연결/.test(t)) || '';
    await suite.check({ id: 'hotplug.disconnect', group: 'hotplug', issue: 'P-15', gate: 'PLAT-INPUT', title: 'disconnect in a stage → pause + toast', session: s }, async () => ({ pass: paused && !!toastOff, detail: `pause ${paused}, toast ${fmt(toastOff)}` }));
    const fr2 = await during(s, () => connect(s.page), 500);
    const toastOn = fr2.map((f) => f.toasts).find((t) => /연결됨|연결/.test(t) && !/끊어/.test(t)) || '';
    await suite.check({ id: 'hotplug.reconnect', group: 'hotplug', issue: 'P-15', gate: 'PLAT-INPUT', title: 'reconnect → "연결됨" toast', session: s }, async () => ({ pass: !!toastOn, detail: `toast ${fmt(toastOn)}` }));
    await suite.errors({ id: 'hotplug.errors', group: 'hotplug' }, s);
    await s.close();
  }, env);

  // ── 7. haptics: playerHurt → dual-rumble with the §4.6 magnitudes; ctrlRumble 0 → none (P-16) ─
  await suite.group('haptics', async () => {
    for (const rumble of [0.8, 0]) {
      const s = await stageWithPad('desk', 's03', { id: PAD_IDS.xbox }, { settings: { ctrlRumble: rumble } });
      await press(s.page, BTN.RIGHT, 60);
      await s.eval(() => { window.__rumble.length = 0; });
      await s.eval(async () => { const E = await import('/src/core/events.js'); const p = __game.world.player; E.bus.emit('playerHurt', { dmg: 5, hp: p.hp, max: p.stats?.hp ?? 100 }); });
      await s.wait(400);
      const log = await rumbleLog(s.page);
      await suite.check({ id: `haptics.hurt.${rumble}`, group: 'haptics', issue: 'P-16', gate: 'PLAT-INPUT', title: rumble ? 'playerHurt → dual-rumble 0.55/0.25 × 140 ms (× ctrlRumble)' : 'ctrlRumble 0 → no rumble', session: s }, async () => {
        if (!rumble) return { pass: log.length === 0, detail: `${log.length} playEffect call(s)` };
        const e = log.find((x) => x.type === 'dual-rumble');
        if (!e) return { pass: false, detail: `${log.length} playEffect call(s), none dual-rumble` };
        const P = e.params || {};
        const ratio = P.weakMagnitude > 0 ? P.strongMagnitude / P.weakMagnitude : 0;
        const ok = Math.abs((P.duration ?? 0) - 140) <= 15 && P.strongMagnitude > 0 && P.strongMagnitude <= 0.56 && Math.abs(ratio - 2.2) < 0.25;
        return { pass: ok, detail: fmt(P) };
      });
      await suite.errors({ id: `haptics.${rumble}.errors`, group: 'haptics' }, s);
      await s.close();
    }
  }, env);

  // ── confirm position: Nintendo pads confirm with east in menus (§4.2, P-17); Xbox with south ──
  await suite.group('confirm', async () => {
    for (const [set, id, yesBtn, noBtn] of [['xbox', PAD_IDS.xbox, BTN.A, BTN.B], ['nintendo', PAD_IDS.nintendo, BTN.B, BTN.A]]) {
      const s = await env.page('desk', 'index.html', { initScripts: [fakePadInit({ id })] });
      await s.wait(1500);
      await connect(s.page);
      const ask = async (btn) => {
        await s.eval(() => { window.__ans = null; __game.push('frontConfirm', { title: '확인', message: 'QA', defaultYes: true, onYes() { window.__ans = 'yes'; }, onNo() { window.__ans = 'no'; } }); });
        await s.wait(500);
        await press(s.page, btn, 90, 250);
        const a = await s.eval(() => window.__ans);
        for (let i = 0; i < 3 && (await s.top()) === 'frontConfirm'; i++) await s.eval(() => __game.pop());
        return a;
      };
      const yes = await ask(yesBtn), no = await ask(noBtn);
      await suite.check({ id: `confirm.${set}`, group: 'confirm', issue: 'P-17', gate: 'PLAT-INPUT', title: `${set}: confirm = ${set === 'nintendo' ? 'east' : 'south'}, cancel = the other`, session: s }, async () => ({ pass: yes === 'yes' && no === 'no', detail: `confirm button → ${yes}, cancel button → ${no}` }));
      await suite.errors({ id: `confirm.${set}.errors`, group: 'confirm' }, s);
      await s.close();
    }
  }, env);

  // ── 8. remap model: swap on conflict, START and D-pad rejected (P-17) ───────────
  await suite.group('remap', async () => {
    const s = await stageWithPad('desk', 's03', { id: PAD_IDS.xbox });
    const r = await s.eval(() => {
      const i = window.__game.input;
      const fn = i.remap || i.setBinding || null;
      if (typeof fn !== 'function') return { api: false };
      const call = (...a) => { try { return fn.apply(i, a); } catch (e) { return { ok: false, err: e.message }; } };
      const swap = call('pad', 'jump', 1);
      const b = i.bindings?.pad || {};
      const start = call('pad', 'jump', 9);
      const dpad = call('pad', 'left', 3);
      return { api: true, swap, start, dpad, jump: b.jump ?? null, dash: b.dash ?? null };
    });
    await suite.check({ id: 'remap.model', group: 'remap', issue: 'P-17', gate: 'PLAT-INPUT', title: 'input.remap: conflict swaps, START and movement rejected', session: s }, async () => {
      if (!r.api) return { pass: false, detail: "no remap API (expected input.remap(device, action, codeOrIndex) → {ok, swapped})" };
      const has = (a, v) => Array.isArray(a) && a.includes(v);
      const ok = r.swap?.ok !== false && has(r.jump, 1) && has(r.dash, 0) && r.start?.ok === false && r.dpad?.ok === false;
      return { pass: ok, detail: fmt(r) };
    });
    if (r.api) {
      await settle(s);
      const p0 = await s.player();
      const fr = await during(s, () => press(s.page, BTN.B, 90, 0), 450);
      await suite.check({ id: 'remap.play', group: 'remap', issue: 'P-17', gate: 'PLAT-INPUT', title: 'after jump→B the jump happens on B', session: s }, async () => { const minY = Math.min(...fr.map((f) => f.y)); return { pass: fr.some((f) => f.vy < -100) || minY < p0.y - 20, detail: `rise ${(p0.y - minY).toFixed(0)} px` }; });
    }
    await suite.errors({ id: 'remap.errors', group: 'remap' }, s);
    await s.close();
  }, env);

  // ── classic preset keeps today's layout (§4.2, P-17) ─────────────────────────────
  await suite.group('classic', async () => {
    const s = await stageWithPad('desk', 's03', { id: PAD_IDS.xbox }, { settings: { ctrlPreset: 'classic' } });
    const rows = [];
    for (const [name, btn, judge] of [
      ['B→attack', BTN.B, (fr) => fr.some((f) => f.move)],
      ['LT→dash', BTN.LT, (fr) => fr.some((f) => f.anim === 'dash')],
      ['SELECT→swap', BTN.SELECT, (fr, p0) => fr.some((f) => f.page !== p0.page) && !fr.some((f) => f.top === 'menu')],
    ]) {
      await settle(s);
      const p0 = await s.player();
      const fr = await during(s, () => press(s.page, btn, 90, 0), 450);
      rows.push([name, judge(fr, p0)]);
      for (let i = 0; i < 3 && (await s.top()) !== 'stage'; i++) { await s.eval(() => __game.pop()); await s.wait(200); }
    }
    await suite.check({ id: 'classic.rows', group: 'classic', issue: 'P-17', gate: 'PLAT-INPUT', title: 'ctrlPreset classic: B attack, LT dash, SELECT swap', session: s }, async () => ({ pass: rows.every((r) => r[1]), detail: rows.map((r) => `${r[0]} ${r[1] ? 'ok' : 'NO'}`).join(', ') }));
    await suite.errors({ id: 'classic.errors', group: 'classic' }, s);
    await s.close();
  }, env);

  // ── non-standard mapping: hat D-pad on axis 9 + toast (§4.2) ────────────────────
  await suite.group('nonstd', async () => {
    const s = await env.page('desk', 'index.html?scene=stage&stage=s03', { initScripts: [fakePadInit({ id: 'USB Gamepad (Vendor: 0079 Product: 0011)', mapping: '' })] });
    await s.waitGame('!!g.world?.player');
    await s.eval(() => { window.__fakePad.axes = [0, 0, 0, 0, 0, 0, 0, 0, 0, 3.2857]; });
    const fr0 = await during(s, () => connect(s.page), 600);
    for (let i = 0; i < 30 && (await s.top()) !== 'stage'; i++) await press(s.page, BTN.A, 70, 120);
    await prepPlayer(s);
    const a = await s.player();
    await s.eval(() => { window.__fakePad.axes[9] = -0.43; });
    await s.wait(500);
    await s.eval(() => { window.__fakePad.axes[9] = 3.2857; });
    const b = await s.player();
    const toast = fr0.map((f) => f.toasts).find((t) => /표준/.test(t)) || '';
    await suite.check({ id: 'nonstd.hat', group: 'nonstd', issue: 'P-14', gate: 'PLAT-INPUT', title: 'non-standard pad: hat on axis 9 moves right; "표준 배치가 아닙니다" toast', session: s }, async () => ({ pass: b.x - a.x > 20 && !!toast, detail: `dx ${(b.x - a.x).toFixed(0)} px, toast ${fmt(toast)}` }));
    await suite.errors({ id: 'nonstd.errors', group: 'nonstd' }, s);
    await s.close();
  }, env);
} catch (e) {
  await suite.check({ id: 'harness', group: 'harness', title: 'suite ran to completion' }, async () => { throw e; });
} finally {
  await env.close();
}
process.exit(await suite.finish());
