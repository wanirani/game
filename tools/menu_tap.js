// 스모크 테스트용 탭/드래그 시뮬레이션: eval=import('/tools/menu_tap.js?x=480&y=300&n=1')  (논리 좌표 기준)
//  dy=<px> 이면 (x,y)에서 세로로 끌기 / touch=1 이면 터치 모드로 전환 / n 은 캐시 회피용
const q = new URL(import.meta.url).searchParams;
const g = window.__game;
const cv = document.getElementById('screen');
const r = cv.getBoundingClientRect();
const toClient = (x, y) => ({ clientX: r.left + (x / g.viewW) * r.width, clientY: r.top + (y / g.viewH) * r.height, bubbles: true, pointerId: 1, pointerType: 'touch', isPrimary: true });
if (q.get('touch')) g.input.setTouchMode(true);
const x = Number(q.get('x') ?? 480), y = Number(q.get('y') ?? 270), dy = Number(q.get('dy') ?? 0);
const wait = (ms) => new Promise((res) => setTimeout(res, ms));
if (q.has('x')) {
  cv.dispatchEvent(new PointerEvent('pointerdown', toClient(x, y)));
  await wait(40);
  if (dy) {
    const steps = 8;
    for (let i = 1; i <= steps; i++) { cv.dispatchEvent(new PointerEvent('pointermove', toClient(x, y + (dy * i) / steps))); await wait(20); }
  }
  window.dispatchEvent(new PointerEvent('pointerup', toClient(x, y + dy)));
}
