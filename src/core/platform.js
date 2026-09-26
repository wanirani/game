// STUB (W0 SKEL) — owner: PLAT-BOOT
// 플랫폼 셸 (platform.md §6.1, §6.6, §6.7, §9.3): 안전 영역, 전체 화면, 화면 켜짐 유지, 커서 숨김, 서비스 워커 갱신.
//  safeInsets() → {l,r,t,b} 논리 px     initPlatform(game)     onUpdateReady(cb)     isStandalone() → bool
// 스텁: 인셋 0, 아무것도 하지 않는다 (index.html 의 기존 인라인 스크립트가 계속 담당).
export function safeInsets() { return { l: 0, r: 0, t: 0, b: 0 }; }
export function initPlatform(game) {}
export function onUpdateReady(cb) {}
export function isStandalone() { return false; }
