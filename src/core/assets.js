// 이미지 에셋 로더 (지연 로딩). 파일이 없으면 null을 돌려주므로 호출 측은 절차적 대체 그림을 그린다.
//  assets.get('bg/s01_village')      → HTMLImageElement | null (로드 전/실패 시 null)
//  assets.preload(['bg/hub', ...])  → Promise (실패해도 resolve)
//  assets.pattern(ctx, 'tex/tex_castle_stone') → CanvasPattern | null
// 폴더별 확장자: bg/portraits/tex/painted = .webp, icons/props = .png (painted = 채색 퍼핏 부품 아틀라스, render/painted/kit.js)
const EXT = { bg: 'webp', portraits: 'webp', tex: 'webp', cg: 'webp', icons: 'png', props: 'png', ui: 'png', painted: 'webp', puppets: 'webp' };
// puppets = 영웅 채색 컷아웃 퍼펫(render/hero_puppet.js). get/load 의 두 번째 인자 ver 는 선택(파일 해시 → 캐시 무효화), json() 은 리그 데이터용
export const ASSET_ROOT = 'assets/';

class Assets {
  constructor() {
    this.cache = new Map();   // key -> {img, ok, failed, promise}
    this.patterns = new Map();
    this.version = 2;
  }
  url(key, ver) {
    const folder = key.split('/')[0];
    const ext = EXT[folder] || 'png';
    return `${ASSET_ROOT}${key}.${ext}?v=${this.version}${ver ? '&h=' + ver : ''}`;
  }
  load(key, ver) {
    let e = this.cache.get(key);
    if (e) return e.promise;
    const img = new Image();
    img.decoding = 'async';
    e = { img, ok: false, failed: false };
    e.promise = new Promise((res) => {
      img.onload = () => { e.ok = true; res(img); };
      img.onerror = () => { e.failed = true; res(null); };
    });
    img.src = this.url(key, ver);
    this.cache.set(key, e);
    return e.promise;
  }
  get(key, ver) {
    const e = this.cache.get(key);
    if (!e) { this.load(key, ver); return null; }
    return e.ok ? e.img : null;
  }
  /** JSON 데이터 (예: 'puppets/kael/kael_hunter/rig') → Promise<object|null>. 실패해도 resolve(null) */
  json(key, ver) {
    this.jcache ??= new Map();
    let e = this.jcache.get(key);
    if (e) return e.promise;
    e = { data: null, failed: false };
    e.promise = (typeof fetch === 'function' ? fetch(`${ASSET_ROOT}${key}.json?v=${this.version}${ver ? '&h=' + ver : ''}`) : Promise.reject(new Error('no fetch')))
      .then((r) => (r.ok ? r.json() : null)).catch(() => null)
      .then((d) => { e.data = d; e.failed = !d; return d; });
    this.jcache.set(key, e);
    return e.promise;
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
