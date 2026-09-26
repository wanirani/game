// STUB (W0 SKEL) — owner: PLAT-TOUCH
// 캔버스 가상 패드 (platform.md §5.2–5.4; MASTER_PLAN §1.8, §1.10 P-18).
//  initTouchPad(input) → 패드 객체 | null   (null = 실패 → input.js 는 기존 DOM 패드 setupTouchPad() 로 되돌아간다)
//  touchpad.setVisible(on)          표시 여부 (game.syncPad 만 호출)
//  touchpad.openEditor() / closeEditor()   배치 편집기 (옵션 › 터치)
//  touchpad.occupiedRects() → [{x,y,w,h}] 논리 px (HUD 배치가 피해야 할 영역)
//  touchpad.stickZone() → {x,y,w,h} | null  떠 있는 스틱 영역 (null 이면 world 는 기존 영역을 쓴다)
// 스텁: 아무것도 하지 않는다.
export function initTouchPad(input) { return null; }
export const touchpad = {
  setVisible(on) {},
  openEditor() {},
  closeEditor() {},
  occupiedRects() { return []; },
  stickZone() { return null; },
};
