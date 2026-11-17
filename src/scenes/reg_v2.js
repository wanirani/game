// 리빌드(v2) 시범 장면 등록부 — docs/v2/README.md · docs/v2/SLICE0.md
// 본편(v1) 장면과 분리한다: 각 시범판은 src/v2/<a|b>/index.js 가 `export default class extends Scene` 을 내보낸다.
// 여기서는 '불러오는 중' 자리 장면만 등록하고, 들어갈 때 동적 import 로 진짜 장면을 받는다
//   → 한쪽 시범판 파일이 깨져 있어도 본편과 다른 시범판은 그대로 돈다 (정적 import 금지).
// 바로 열기: index.html?scene=v2a · v2b · v2c · v2bench
import { Scene } from '../core/game.js';
import { input } from '../core/input.js';

const LOADERS = {
  v2a: () => import('../v2/a/index.js'),
  v2b: () => import('../v2/b/index.js'),
  v2c: () => import('../v2/env/index.js'),       // 꾸민 배경 시범 (B 의 세계 + 세밀한 건물·소품 키트)
  v2bench: () => import('../v2/bench/index.js'), // 기기 성능 진단 (방식·해상도별 프레임 시간 표)
};

function lazyScene(id, load) {
  return class V2Pending extends Scene {
    constructor(game) { super(game); this.hidePad = true; this.hideToasts = true; this.err = null; }
    enter(params) {
      const g = this.game;
      load().then((m) => {
        const S = m.default;
        if (typeof S !== 'function') throw new Error(id + ': default export 가 장면 클래스가 아닙니다');
        g.register(id, S);
        if (g.scenes[g.scenes.length - 1] === this) g.go(id, params ?? {}, { fade: false });
      }).catch((e) => { this.err = e; console.error('[v2]', id, e); });
    }
    update(dt) {
      this.t += dt;
      if (this.err && (input.pressed('cancel') || input.pressed('confirm') || input.pointer.tapped) && this.game.registry.title) this.game.go('title', {}, { fade: false });
    }
    render(ctx) {
      const g = this.game, W = g.viewW, H = 540;
      ctx.fillStyle = '#07030a'; ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'center'; ctx.fillStyle = this.err ? '#ff9a90' : '#e8d8c0'; ctx.font = '600 20px sans-serif';
      ctx.fillText(this.err ? 'v2 load failed: ' + String(this.err?.message ?? this.err).slice(0, 80) : 'Loading…', W / 2, H / 2);
    }
  };
}

export function register(game) {
  for (const [id, load] of Object.entries(LOADERS)) game.register(id, lazyScene(id, load));
}
