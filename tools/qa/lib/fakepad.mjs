// Fake gamepad (platform.md §12): replaces Navigator.prototype.getGamepads with a mutable standard pad.
//
//   const s = await env.page('desk', 'index.html?scene=stage&stage=s03', { initScripts: [fakePadInit({ id: PAD_IDS.ps })] });
//   await connect(s.page);                    // pad appears + 'gamepadconnected'
//   await press(s.page, BTN.A);               // edge: down 90 ms, up
//   await axes(s.page, 0.55, 0);              // left stick
//   await setButton(s.page, BTN.RT, 0.3);     // analog trigger value (pressed = value > 0.12, like Chrome/XInput)
//   await disconnect(s.page);                 // pad gone + 'gamepaddisconnected'
//   await rumbleLog(s.page)                   // [{effect, params}] recorded from vibrationActuator.playEffect
//
// Page globals: __fakePad, __padOn, __padSet(i, v), __padAxes(x, y, rx, ry), __padConnect(), __padDisconnect(), __rumble[]

/** Standard-mapping button indices. */
export const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, SELECT: 8, START: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15, HOME: 16 };
/** Same indices by face position (S/E/W/N), used by the arcade preset tables. */
export const POS = { S: 0, E: 1, W: 2, N: 3 };

/** Real-world id strings per glyph set (platform §4.1). */
export const PAD_IDS = {
  xbox: 'Xbox 360 Controller (XInput STANDARD GAMEPAD)',
  ps: 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)',
  ps4: 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)',
  nintendo: 'Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)',
  generic: '8BitDo SN30 Pro (STANDARD GAMEPAD Vendor: 2dc8 Product: 6001)',
  fingerprint: 'uinput-fpc',
};

/**
 * Init script (pass to env.page initScripts). connected: pad visible from the start (no event).
 * mapping '' models a non-standard pad (Firefox/Linux, HID).
 */
export function fakePadInit({ id = PAD_IDS.xbox, mapping = 'standard', connected = false, buttons = 17 } = {}) {
  return {
    fn: ({ id, mapping, connected, buttons }) => {
      const pad = {
        id, index: 0, connected: true, mapping, timestamp: 0, axes: [0, 0, 0, 0],
        buttons: Array.from({ length: buttons }, () => ({ pressed: false, touched: false, value: 0 })),
        vibrationActuator: {
          type: 'dual-rumble', effects: ['dual-rumble', 'trigger-rumble'],
          playEffect: (type, params) => { (window.__rumble ||= []).push({ type, params, t: performance.now() }); return Promise.resolve('complete'); },
          reset: () => { (window.__rumbleResets = (window.__rumbleResets || 0) + 1); return Promise.resolve('complete'); },
        },
      };
      window.__fakePad = pad; window.__padOn = connected; window.__rumble = [];
      Navigator.prototype.getGamepads = function () { return [window.__padOn ? pad : null, null, null, null]; };
      window.__padSet = (i, v) => { const b = pad.buttons[i]; if (!b) return; b.value = v; b.pressed = v > 0.12; b.touched = v > 0; pad.timestamp = performance.now(); };
      window.__padAxes = (x, y, rx = 0, ry = 0) => { pad.axes = [x, y, rx, ry]; pad.timestamp = performance.now(); };
      const fire = (type) => { try { const e = new Event(type); Object.defineProperty(e, 'gamepad', { value: pad }); window.dispatchEvent(e); } catch { /* old engine */ } };
      window.__padConnect = () => { window.__padOn = true; pad.connected = true; fire('gamepadconnected'); };
      window.__padDisconnect = () => { window.__padOn = false; pad.connected = false; for (const b of pad.buttons) { b.pressed = false; b.value = 0; } pad.axes = [0, 0, 0, 0]; fire('gamepaddisconnected'); };
    },
    arg: { id, mapping, connected, buttons },
  };
}

export const connect = (page) => page.evaluate(() => window.__padConnect());
export const disconnect = (page) => page.evaluate(() => window.__padDisconnect());
export const setButton = (page, i, v) => page.evaluate(([i, v]) => window.__padSet(i, v), [i, v]);
export const axes = (page, x, y, rx = 0, ry = 0) => page.evaluate(([x, y, rx, ry]) => window.__padAxes(x, y, rx, ry), [x, y, rx, ry]);
export const rumbleLog = (page) => page.evaluate(() => window.__rumble || []);

export { waitFrames } from './server.mjs';
import { waitFrames } from './server.mjs';

/** Button edge: value 1 for ≥ ms (and ≥ 3 frames / 2 steps), then 0, then settle (≥ 2 frames). */
export async function press(page, i, ms = 90, settle = 90) {
  await setButton(page, i, 1);
  await waitFrames(page, { ms, frames: 3, ticks: 2 });
  await setButton(page, i, 0);
  await waitFrames(page, { ms: settle, frames: 2, ticks: 1 });
}
export async function hold(page, i, ms) { await press(page, i, ms, 60); }

/** Several buttons at once (e.g. a chord). */
export async function chord(page, list, ms = 90) {
  for (const i of list) await setButton(page, i, 1);
  await waitFrames(page, { ms, frames: 3, ticks: 2 });
  for (const i of list) await setButton(page, i, 0);
  await waitFrames(page, { ms: 90, frames: 2, ticks: 1 });
}
