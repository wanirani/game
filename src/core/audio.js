// 오디오 (임시 구현 — 오디오 담당이 전면 교체 예정). 공개 API는 유지할 것.
//  audio.unlock()                   첫 사용자 입력 시 AudioContext 활성화
//  audio.sfx(name, {vol, pitch, pan})
//  audio.music(trackId, {fade})     BGM 전환 (같은 곡이면 무시)
//  audio.stopMusic(fade)
//  audio.duck(amount, time)         잠시 BGM 볼륨 낮춤
//  audio.setVolumes(music, sfx)
//  audio.suspend() / resume() / update(dt)
class AudioSystem {
  constructor() { this.ctx = null; this.musicVol = 0.6; this.sfxVol = 0.8; this.current = null; }
  unlock() {
    if (!this.ctx) {
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
      this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }
  suspend() { this.ctx?.suspend(); }
  resume() { this.ctx?.resume(); }
  setVolumes(m, s) { this.musicVol = m; this.sfxVol = s; }
  sfx(name, { vol = 1, pitch = 1 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'square'; o.frequency.setValueAtTime(220 * pitch * (1 + (name.length % 5) * 0.3), t);
    o.frequency.exponentialRampToValueAtTime(60, t + 0.12);
    g.gain.setValueAtTime(0.08 * vol * this.sfxVol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.13);
  }
  music(id) { this.current = id; }
  stopMusic() { this.current = null; }
  duck() {}
  update() {}
}
export const audio = new AudioSystem();
