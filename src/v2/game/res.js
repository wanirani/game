// v2g render resolution (docs/v2/ENGINE_API.md 7). The 3D canvas has its own pixel size: it does not follow the 2D game canvas.
//   size = CSS size x min(device pixel ratio, tier cap, sqrt(tier pixel budget / CSS area)) x saved factor (bn.v2.perf resK) x governor level
//   tier (bn.v2.perf tier, default 'mid'):   low  ratio <= 1.25, <= 1.1 MP, no antialiasing
//                                            mid  ratio <= 2.0,  <= 2.4 MP, antialiasing (MSAA of the context)
//                                            high ratio <= 3.0,  <= 4.2 MP, antialiasing
// Governor: when most frames of one second take longer than the budget (1.25 x the display interval), render one level lower
// (1 -> 0.85 -> 0.72 -> 0.6 of the size above). It goes back up one level only after a long quiet stretch, and every time a step up
// has to be taken back the wait before the next try doubles (12 s -> 24 s -> ... -> 5 min): it cannot oscillate.
export const RES_TIERS = { low: { dpr: 1.25, px: 1.1e6, aa: false }, mid: { dpr: 2, px: 2.4e6, aa: true }, high: { dpr: 3, px: 4.2e6, aa: true } };
const LEVELS = [1, 0.85, 0.72, 0.6];

export class Res {
  /** perf = readPerf() result ({ tier, resK, hz, auto }) */
  constructor(perf) {
    this.T = RES_TIERS[perf.tier] ?? RES_TIERS.mid; this.tier = RES_TIERS[perf.tier] ? perf.tier : 'mid'; this.perf = perf; this.resK = perf.resK ?? 1; this.auto = perf.auto !== false; this.aaOn = perf.aa !== false;
    this.budget = 1000 / (perf.hz > 30 ? Math.min(perf.hz, 120) : 60) * 1.25;
    this.level = 0; this.w = 2; this.h = 2; this.dpr = 1; this.cssW = 0; this.cssH = 0; this.devDpr = 0;
    this.winT = 0; this.winN = 0; this.winOver = 0; this.quiet = 0; this.wait = 12; this.cool = 0; this.sinceUp = 99; this.downs = 0; this.ups = 0;
  }
  get aa() { return this.T.aa && this.aaOn; }
  /** pixel size for a CSS box; recomputed only when the box, the device ratio or the level changed */
  size(cssW, cssH, devDpr) {
    const rk = this.perf.resK ?? 1;   // read live: the saved factor may be changed while the scene runs (checks shrink the picture to measure JS only)
    if (cssW === this.cssW && cssH === this.cssH && devDpr === this.devDpr && this._lv === this.level && rk === this.resK) return this;
    this.cssW = cssW; this.cssH = cssH; this.devDpr = devDpr; this._lv = this.level; this.resK = rk;
    const T = this.T, d = Math.max(0.5, Math.min(devDpr || 1, T.dpr, Math.sqrt(T.px / Math.max(1, cssW * cssH)))) * this.resK * LEVELS[this.level];
    this.dpr = d; this.w = Math.max(2, Math.round(cssW * d)); this.h = Math.max(2, Math.round(cssH * d));
    return this;
  }
  /** once per drawn frame: ms = real time since the previous drawn frame. Returns true when the level changed. */
  frame(ms) {
    if (!this.auto || !(ms > 0) || ms > 250) return false;   // a hidden tab, a load hitch: not a measurement
    const s = ms / 1000;
    this.sinceUp += s;
    if (this.cool > 0) { this.cool -= s; return false; }
    this.winT += s; this.winN++; if (ms > this.budget) this.winOver++;
    if (this.winT < 1) return false;
    const over = this.winOver / this.winN; this.winT = 0; this.winN = 0; this.winOver = 0;
    if (over >= 0.8) {   // a whole second above budget
      this.quiet = 0;
      if (this.level < LEVELS.length - 1) {
        if (this.sinceUp < 8) this.wait = Math.min(300, this.wait * 2);   // the last step up was a mistake: wait twice as long next time
        this.level++; this.downs++; this.cool = 2; return true;
      }
      return false;
    }
    if (over <= 0.05) this.quiet++; else this.quiet = 0;
    if (this.level > 0 && this.quiet >= this.wait) { this.level--; this.ups++; this.quiet = 0; this.sinceUp = 0; this.cool = 2; return true; }
    return false;
  }
  info() { return { tier: this.tier, aa: this.aa, dpr: +this.dpr.toFixed(3), w: this.w, h: this.h, px: this.w * this.h, level: this.level, scale: LEVELS[this.level], auto: this.auto, budgetMs: +this.budget.toFixed(1), downs: this.downs, ups: this.ups, waitS: this.wait }; }
}
