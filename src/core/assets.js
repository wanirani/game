// 이미지 에셋 로더 (지연 로딩). 파일이 없으면 null을 돌려주므로 호출 측은 절차적 대체 그림을 그린다.
//  assets.get('bg/s01_village')      → HTMLImageElement | null (로드 전/실패 시 null)
//  assets.preload(['bg/hub', ...])  → Promise (실패해도 resolve)
//  assets.pattern(ctx, 'tex/tex_castle_stone') → CanvasPattern | null
// 폴더별 확장자: bg/portraits/tex = .webp, icons/props = .png
const EXT = { bg: 'webp', portraits: 'webp', tex: 'webp', cg: 'webp', icons: 'png', props: 'png', ui: 'png' };
export const ASSET_ROOT = 'assets/';

class Assets {
  constructor() {
    this.cache = new Map();   // key -> {img, ok, failed, promise}
    this.patterns = new Map();
    this.version = 1;
  }
  url(key) {
    const folder = key.split('/')[0];
    const ext = EXT[folder] || 'png';
    return `${ASSET_ROOT}${key}.${ext}?v=${this.version}`;
  }
  load(key) {
    let e = this.cache.get(key);
    if (e) return e.promise;
    const img = new Image();
    img.decoding = 'async';
    e = { img, ok: false, failed: false };
    e.promise = new Promise((res) => {
      img.onload = () => { e.ok = true; res(img); };
      img.onerror = () => { e.failed = true; res(null); };
    });
    img.src = this.url(key);
    this.cache.set(key, e);
    return e.promise;
  }
  get(key) {
    const e = this.cache.get(key);
    if (!e) { this.load(key); return null; }
    return e.ok ? e.img : null;
  }
  has(key) { return !!this.cache.get(key)?.ok; }
  failed(key) { return !!this.cache.get(key)?.failed; }
  preload(keys) { return Promise.all(keys.map((k) => this.load(k))); }
  pattern(ctx, key) {
    if (this.patterns.has(key)) return this.patterns.get(key);
    const img = this.get(key);
    if (!img) return null;
    const p = ctx.createPattern(img, 'repeat');
    this.patterns.set(key, p);
    return p;
  }
}
export const assets = new Assets();
