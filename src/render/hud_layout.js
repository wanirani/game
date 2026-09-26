// STUB (W0 SKEL) — owner: HUD-LAYOUT
// HUD 영역 배치의 단일 출처 (MASTER_PLAN §1.8).
//  hudLayout(world, vw, vh, pad = touchpad.occupiedRects()) → {
//    portrait, vitals, hearts, skills, ult, awGauge, ready, companions, callouts, score, combo, bossBar, transient,  // {x,y,w,h} 논리 px
//    meter(i) → {x,y,w,h}          기믹 게이지 i번째 줄
//    toast(i) → {x,y}              토스트 i번째 줄 (x = 가운데, y = 글자 기준선)
//  }
// 스텁: 오늘 hud.js / game.js 가 실제로 그리는 위치를 돌려준다 (오늘 없는 영역은 §1.8 의 기본값). pad 는 무시한다.
import { input } from '../core/input.js';

const R = (x, y, w, h) => ({ x, y, w, h });

export function hudLayout(world, vw, vh, pad) {
  const T = !!input.touchMode;
  const bw = T ? Math.min(560, vw - 320) : Math.min(640, vw - 260);
  const gw = Math.min(vw, 760);
  return {
    portrait: R(14, 12, 66, 66),
    vitals: R(90, 12, 230, 50),
    hearts: R(90, 64, 290, 26),
    skills: R(14, 92, 88, 62),
    ult: R(106, 96, 120, 28),
    awGauge: R(106, 126, 120, 20),
    ready: R(106, 124, 130, 18),
    companions: R(244, 92, 128, 68),
    callouts: R(14, 176, 300, 52),
    score: R(vw - 164, 10, 150, T ? 70 : 62),
    combo: R(vw - 140, 106, 126, 124),
    bossBar: R((vw - bw) / 2, T ? 148 : vh - 62, bw, 32),
    transient: R((vw - gw) / 2, 126, gw, 108),
    meter(i) { return R(vw / 2 - 100, (T ? 76 : 12) + 20 * i, 200, 16); },
    toast(i) { return { x: vw / 2, y: 92 + 30 * i }; },
  };
}
