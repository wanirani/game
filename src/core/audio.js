// 오디오 시스템 — 절차적 WebAudio 엔진 (효과음 합성 + 룩어헤드 BGM 시퀀서 + 대성당 잔향)
//  audio.unlock()                   첫 사용자 입력 시 AudioContext 활성화
//  audio.sfx(name, {vol, pitch, pan})
//  audio.music(trackId, {fade})     BGM 전환 (같은 곡이면 무시)
//  audio.stopMusic(fade)
//  audio.duck(amount, time)         잠시 BGM 볼륨 낮춤
//  audio.setVolumes(music, sfx)
//  audio.suspend() / resume() / update(dt)
//  (추가) sfx 옵션 delay: 초 단위 지연 재생 / audio.current: 현재 곡 ID
//
// 신호 흐름: master → 컴프레서 → 리미터 → 출력
//   음악: 트랙(채널별 패너) → musicIn → duck → musicVol → master   (wet 송신 → 잔향, 리드 → 딜레이)
//   효과음: 인스턴스 out → sfxBus → master  (wet 송신 → 잔향)
// 악보 형식(MML + 코드 진행 + 패턴 생성 + 드럼 레인)은 data/music.js 상단 주석 참조.
import { TRACKS } from '../data/music.js';

const LOOKAHEAD = 0.16;          // 스케줄 선행 시간(초)
const TICK_MS = 25;              // 스케줄러 주기
const MUSIC_TRIM = 1.0, SFX_TRIM = 1.1;
const MAX_SFX = 26;              // 동시 효과음 인스턴스 상한
const MAX_MUSIC_VOICES = 90;     // 음악 동시 보이스 안전 상한
const E0 = {};
const R = Math.random;
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const BUILTIN = new Set(['sine', 'square', 'sawtooth', 'triangle']);

// ─────────────────────────────── 파형 테이블 ───────────────────────────────
function harmWave(h) { const re = new Float32Array(h.length), im = Float32Array.from(h); return [re, im]; }
function pulseWave(duty, N = 48) {
  const re = new Float32Array(N), im = new Float32Array(N);
  for (let n = 1; n < N; n++) { re[n] = Math.sin(2 * Math.PI * n * duty) / (Math.PI * n); im[n] = (1 - Math.cos(2 * Math.PI * n * duty)) / (Math.PI * n); }
  return [re, im];
}
const WAVES = {
  organ: () => harmWave([0, 1, 0.62, 0.36, 0.5, 0.1, 0.28, 0.03, 0.22, 0, 0.08, 0, 0.1, 0, 0, 0, 0.05]),
  flute: () => harmWave([0, 1, 0.28, 0.09, 0.04, 0.015]),
  reedorg: () => harmWave([0, 1, 0.5, 0.55, 0.3, 0.35, 0.18, 0.2, 0.1, 0.12, 0.05, 0.06]),
  harpsi: () => { const h = [0]; for (let n = 1; n < 40; n++) h.push(Math.abs(Math.sin(Math.PI * n * 0.137)) * Math.pow(n, -0.55)); return harmWave(h); },
  piano: () => harmWave([0, 1, 0.42, 0.2, 0.13, 0.075, 0.05, 0.03, 0.02, 0.012]),
  pulse25: () => pulseWave(0.25), pulse12: () => pulseWave(0.125), pulse35: () => pulseWave(0.35),
  bright: () => { const h = [0]; for (let n = 1; n < 32; n++) h.push((n % 2 ? 1 : 0.55) / n); return harmWave(h); },
};

// 대성당 잔향 임펄스 (시간이 지날수록 고역이 어두워지는 감쇠 노이즈 + 초기 반사)
function makeIR(c, sec) {
  const sr = c.sampleRate, n = Math.floor(sr * sec), b = c.createBuffer(2, n, sr), pre = Math.floor(sr * 0.022);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch); let lp = 0;
    for (let i = pre; i < n; i++) {
      const x = i / n, t = i / sr;
      const k = 0.88 - 0.78 * x;
      lp += (R() * 2 - 1 - lp) * k;
      d[i] = lp * Math.pow(1 - x, 2.0) * Math.exp(-t * 1.05);
    }
    for (let r = 0; r < 14; r++) { const i = pre + Math.floor(sr * (0.004 + R() * 0.085)); if (i < n) d[i] += (R() * 2 - 1) * 0.7 * (1 - r / 14); }
  }
  return b;
}
function shaperCurve(k) {
  const n = 1024, cv = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; cv[i] = Math.tanh(k * x) / Math.tanh(k); }
  return cv;
}

// ─────────────────────────────── 악보 컴파일러 ───────────────────────────────
const PC = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const NAMEPC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const SCALES = { maj: [0, 2, 4, 5, 7, 9, 11], min: [0, 2, 3, 5, 7, 8, 10], hmin: [0, 2, 3, 5, 7, 8, 11], mmin: [0, 2, 3, 5, 7, 9, 11], dor: [0, 2, 3, 5, 7, 9, 10], phr: [0, 1, 3, 5, 7, 8, 10], mix: [0, 2, 4, 5, 7, 9, 10], lyd: [0, 2, 4, 6, 7, 9, 11] };
const QUAL = {
  '': [0, 4, 7], m: [0, 3, 7], 5: [0, 7], 7: [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11], M7: [0, 4, 7, 11], dim: [0, 3, 6], o: [0, 3, 6],
  dim7: [0, 3, 6, 9], o7: [0, 3, 6, 9], m7b5: [0, 3, 6, 10], aug: [0, 4, 8], '+': [0, 4, 8], sus4: [0, 5, 7], sus: [0, 5, 7], sus2: [0, 2, 7],
  '7sus4': [0, 5, 7, 10], add9: [0, 4, 7, 14], madd9: [0, 3, 7, 14], 6: [0, 4, 7, 9], m6: [0, 3, 7, 9], 9: [0, 4, 7, 10, 14], m9: [0, 3, 7, 10, 14],
  '7b9': [0, 4, 7, 10, 13], mM7: [0, 3, 7, 11], b5: [0, 4, 6],
};
const accOf = (s) => { let a = 0; for (const ch of s) a += ch === '-' ? -1 : 1; return a; };
const pcOf = (s) => (NAMEPC[s[0]] + (s[1] === '#' ? 1 : s[1] === 'b' ? -1 : 0) + 12) % 12;
function parseKey(k) { const [n, mode = 'min'] = String(k).split(' '); return { pc: pcOf(n), sc: SCALES[mode] || SCALES.min }; }
function diaShift(m, key, steps) {
  const rel = m - key.pc, o = Math.floor(rel / 12), r = rel - o * 12; let d = 0;
  for (let i = 0; i < 7; i++) if (key.sc[i] <= r) d = i;
  const co = r - key.sc[d], nd = d + steps;
  return key.pc + (o + Math.floor(nd / 7)) * 12 + key.sc[((nd % 7) + 7) % 7] + co;
}
function expandLoops(s) {
  const re = /\[([^[\]]*)\](\d*)/; let m, guard = 0;
  while ((m = re.exec(s)) && guard++ < 999) {
    const n = m[2] ? +m[2] : 2, i = m[1].indexOf(':');
    const a = i < 0 ? m[1] : m[1].slice(0, i), b = i < 0 ? '' : m[1].slice(i + 1);
    let out = ' ';
    for (let k = 0; k < n; k++) out += a + ' ' + (k < n - 1 ? b + ' ' : '');
    s = s.slice(0, m.index) + out + s.slice(m.index + m[0].length);
  }
  return s;
}
function lenOf(num, dots, def) { let l = num ? 4 / +num : def, add = l; for (let i = 0; i < dots.length; i++) { add /= 2; l += add; } return l; }
function tieLen(str, def) { let sum = 0; if (!str) return 0; for (const m of str.matchAll(/\^(\d*)(\.*)/g)) sum += lenOf(m[1], m[2], def); return sum; }
const MML_RE = /\s+|\||o(\d)|([<>])|l(\d+)(\.*)|v(\d+)|q(\d+)|k(-?\d+)|([a-g])([+#-]*)(\d*)(\.*)((?:\^\d*\.*)*)|r(\d*)(\.*)((?:\^\d*\.*)*)|\{([^}]*)\}(\d*)(\.*)((?:\^\d*\.*)*)|(.)/gy;
/** MML 한 줄 → { ev:[{t,d,m,v}], len(박), bad } — 박 단위(4분음표 = 1) */
export function parseMML(src) {
  const s = expandLoops(src), ev = [];
  let t = 0, oct = 4, def = 1, vel = 0.8, gate = 0.92, tr = 0, bad = 0, m;
  MML_RE.lastIndex = 0;
  while (MML_RE.lastIndex < s.length && (m = MML_RE.exec(s))) {
    if (m[1] !== undefined) oct = +m[1];
    else if (m[2]) oct += m[2] === '>' ? 1 : -1;
    else if (m[3] !== undefined) def = lenOf(m[3], m[4], def);
    else if (m[5] !== undefined) vel = Math.min(1, +m[5] / 15);
    else if (m[6] !== undefined) gate = Math.max(0.1, +m[6] / 8);
    else if (m[7] !== undefined) tr = +m[7];
    else if (m[8]) {
      const l = lenOf(m[10], m[11], def) + tieLen(m[12], def);
      ev.push({ t, d: l * gate, m: 12 * (oct + 1) + PC[m[8]] + accOf(m[9]) + tr, v: vel }); t += l;
    } else if (m[13] !== undefined) t += lenOf(m[13], m[14], def) + tieLen(m[15], def);
    else if (m[16] !== undefined) {
      const l = lenOf(m[17], m[18], def) + tieLen(m[19], def); let o2 = oct;
      for (const q of m[16].matchAll(/o(\d)|([<>])|([a-g])([+#-]*)/g)) {
        if (q[1]) o2 = +q[1]; else if (q[2]) o2 += q[2] === '>' ? 1 : -1;
        else ev.push({ t, d: l * gate, m: 12 * (o2 + 1) + PC[q[3]] + accOf(q[4]) + tr, v: vel * 0.85 });
      }
      t += l;
    } else if (m[20]) bad++;
  }
  return { ev, len: t, bad };
}
function parseChord(tok) {
  const m = /^([A-G][#b]?)([^/]*)(?:\/([A-G][#b]?))?$/.exec(tok);
  if (!m) return null;
  return { root: pcOf(m[1]), tones: QUAL[m[2]] ?? QUAL[''], bass: m[3] ? pcOf(m[3]) : null };
}
/** 'Am | F G | E7 | %' → [{t,d,root,tones,bass}] (마디당 여러 코드는 균등 분할, '.' = 앞 코드 연장, '%' = 앞 마디 반복) */
export function parseChords(str, beats, bpb) {
  const bars = String(str).trim().replace(/^\||\|$/g, '').split('|').map((b) => b.trim().split(/\s+/));
  const out = []; let prevBar = null;
  const nb = Math.round(beats / bpb);
  for (let b = 0; b < nb; b++) {
    let toks = bars[b % bars.length];
    if (toks.length === 1 && toks[0] === '%' && prevBar) toks = prevBar;
    prevBar = toks;
    const seg = bpb / toks.length;
    toks.forEach((tk, i) => {
      const t = b * bpb + i * seg;
      if ((tk === '.' || tk === '-') && out.length) { out[out.length - 1].d += seg; return; }
      const c = parseChord(tk) || (out.length ? { ...out[out.length - 1] } : parseChord('C'));
      out.push({ t, d: seg, ...c });
    });
  }
  return out;
}
function voiceChord(ch, center, prev, max = 4) {
  let pcs = [];
  for (const x of ch.tones) { const p = (ch.root + x) % 12; if (!pcs.includes(p)) pcs.push(p); }
  if (pcs.length > max) pcs = pcs.filter((p) => p !== (ch.root + 7) % 12).slice(0, max);
  let best = null, bs = 1e9;
  for (let inv = 0; inv < pcs.length; inv++) {
    const ord = pcs.slice(inv).concat(pcs.slice(0, inv)), lo = center - 5;
    const v = [lo + ((ord[0] - lo) % 12 + 12) % 12];
    for (let k = 1; k < ord.length; k++) { const last = v[k - 1]; v.push(last + 1 + ((ord[k] - last - 1) % 12 + 12) % 12); }
    let sc;
    if (prev && prev.length === v.length) { sc = 0; for (let k = 0; k < v.length; k++) sc += Math.abs(v[k] - prev[k]); }
    else sc = Math.abs(v.reduce((a, b) => a + b, 0) / v.length - center) * 2;
    if (sc < bs) { bs = sc; best = v; }
  }
  return best;
}
function chordTone(ch, c, base) {
  const T = ch.tones, rm = base + ch.root, ti = (i) => (i < T.length ? T[i] : T[i % T.length] + 12 * Math.floor(i / T.length));
  const bs = base + (ch.bass ?? ch.root);
  switch (c) {
    case 'R': return bs; case 'L': return bs - 12; case 'O': return rm + 12; case 'H': return rm + 24;
    case '3': return rm + ti(1); case '5': return rm + ti(2); case '7': return rm + (T.length > 3 ? T[3] : 12);
    case 'T': return rm + ti(1) + 12; case 'F': return rm + ti(2) + 12; case '9': return rm + 14; case 'S': return rm + (T.length > 3 ? T[3] : 12) + 12;
    case 'U': return rm + ti(1) + 24; case 'V': return rm + ti(2) - 12;
  }
  return null;
}
// 패턴 생성: R 루트(슬래시 베이스) L 한 옥타브 아래 O 옥타브 3 5 7 코드음 T F S 한 옥타브 위 3/5/7 9 나인스 V 5도 아래
//           x 코드 전체(보이싱) X 강세 코드 . 쉼 - 앞 음 연장.  pad = 코드 길이만큼 지속
function genPattern(g, chords, beats, bpb) {
  const out = [];
  if (!chords || !chords.length) return out;
  const base = 12 * ((g.oct ?? 3) + 1), gate = g.gate ?? 0.9, vel = g.v ?? 0.8;
  let prev = null;
  if (g.gen === 'pad') {
    for (const ch of chords) {
      if (ch.t >= beats) break;
      const v = g.pow ? [base + ch.root, base + ch.root + 7, base + ch.root + 12] : voiceChord(ch, base + 6, prev, g.max ?? 4);
      prev = v;
      for (const m of v) out.push({ t: ch.t, d: Math.min(ch.d, beats - ch.t) * (g.gate ?? 0.98), m, v: vel });
    }
    return out;
  }
  const pat = String(g.gen).replace(/[\s|]+/g, '');
  if (!pat.length) return out;
  const stepB = 4 / (g.step ?? 8), n = Math.round(beats / stepB);
  let ci = 0, last = null;
  for (let i = 0; i < n; i++) {
    const t = i * stepB;
    while (ci < chords.length - 1 && chords[ci + 1].t <= t + 1e-6) ci++;
    const ch = chords[ci], c = pat[i % pat.length];
    if (c === '.') { last = null; continue; }
    if (c === '-') { if (last) for (const e of last) e.d += stepB; continue; }
    const acc = Math.abs(t % bpb) < 1e-6 ? 1 : Math.abs(t % 1) < 1e-6 ? 0.88 : 0.74;
    last = [];
    if (c === 'x' || c === 'X') {
      const v = g.pow ? [base + ch.root, base + ch.root + 7, base + ch.root + 12] : voiceChord(ch, base + 6, prev, g.max ?? 4);
      prev = v;
      for (const m of v) { const e = { t, d: stepB, m, v: vel * (c === 'X' ? 1 : acc * 0.9) }; out.push(e); last.push(e); }
    } else {
      const m = chordTone(ch, c, base);
      if (m == null) { last = null; continue; }
      const e = { t, d: stepB, m, v: vel * acc }; out.push(e); last.push(e);
    }
  }
  for (const e of out) e.d *= gate;
  return out;
}
// 드럼 레인: { step:16, k:'x...', s:'....x...', h:'xxxx' } — x 보통, X 강세, g 고스트, 1~9 세기, . 쉼
function genDrums(lanes, beats) {
  const out = [], stepB = 4 / (lanes.step ?? 16), n = Math.round(beats / stepB);
  for (const k in lanes) {
    if (k === 'step') continue;
    const s = String(lanes[k]).replace(/[\s|]+/g, '');
    if (!s) continue;
    for (let i = 0; i < n; i++) {
      const c = s[i % s.length];
      if (c === '.' || c === '-') continue;
      const v = c === 'X' ? 1 : c === 'g' ? 0.34 : c >= '1' && c <= '9' ? (c.charCodeAt(0) - 48) / 9 : 0.74;
      out.push({ t: i * stepB, d: 0, m: k, v, c: -1 });
    }
  }
  return out;
}
function loopFit(ev, len, beats) {
  if (len <= 0) return [];
  const out = [];
  for (let off = 0; off < beats - 1e-6; off += len) for (const e of ev) { const t = e.t + off; if (t < beats - 1e-6) out.push(off ? { ...e, t } : e); }
  return out;
}
/** 트랙 정의 → 재생용 컴파일 결과 { bpm, bpb, chans, secs{name:{beats,bpm,ev}}, seq, loopAt, loop, gain, warn[] } */
export function compileTrack(def0, id = '?') {
  let def = def0;
  if (def.alias && TRACKS[def.alias]) { const { alias, ...rest } = def; def = { ...TRACKS[alias], ...rest }; }
  const bpb = def.sig ?? 4, chIds = Object.keys(def.ch), warn = [];
  const chans = chIds.map((k) => ({ id: k, ...def.ch[k] }));
  const secs = {};
  for (const [name, sec] of Object.entries(def.sec)) {
    const sbpb = sec.sig ?? bpb, beats = (sec.bars ?? 4) * sbpb;
    const chords = sec.chords ? parseChords(sec.chords, beats, sbpb) : null;
    const key = parseKey(sec.key ?? def.key ?? 'A min');
    const trans = (def.trans ?? 0) + (sec.trans ?? 0);
    const by = {};
    chIds.forEach((cid, ci) => {
      const cd = def.ch[cid]; if (cd.from) return;
      const v = sec[cid];
      if (v === null || v === false) return;
      let ev = [];
      if (cd.inst === 'kit') {
        const lanes = v ?? cd.pat; if (!lanes) return;
        ev = genDrums(lanes, beats);
      } else if (typeof v === 'string') {
        const p = parseMML(v);
        if (p.bad) warn.push(`${id}.${name}.${cid}: 알 수 없는 기호 ${p.bad}개`);
        if (Math.abs(p.len - beats) > 1e-3 && !(cd.loopOk || sec.loopOk)) warn.push(`${id}.${name}.${cid}: 길이 ${p.len.toFixed(2)}박 ≠ ${beats}박`);
        ev = p.len < beats - 1e-6 ? loopFit(p.ev, p.len, beats) : p.ev.filter((e) => e.t < beats - 1e-6);
      } else if ((v && v.gen) || cd.gen) {
        const g = { ...cd, ...(v || E0) };
        ev = genPattern(g, chords, beats, sbpb);
        if (!chords) warn.push(`${id}.${name}.${cid}: 코드 진행 없음`);
      }
      for (const e of ev) e.c = ci;
      by[cid] = ev;
    });
    chIds.forEach((cid, ci) => {
      const cd = def.ch[cid]; if (!cd.from) return;
      const v = sec[cid]; if (v === null || v === false) return;
      const g = { ...cd, ...(v || E0) }, src = by[g.from]; if (!src) return;
      const ev = [];
      for (const e of src) {
        const m = g.dia ? diaShift(e.m, key, g.dia) : e.m + (g.semi ?? 0);
        const t = e.t + (g.dly ?? 0);
        if (t < beats) ev.push({ t, d: e.d, m, v: e.v * (g.hv ?? 0.8), c: ci });
      }
      by[cid] = ev;
    });
    const ev = [];
    for (const cid in by) for (const e of by[cid]) { if (typeof e.m === 'number') e.m += trans; ev.push(e); }
    ev.sort((a, b) => a.t - b.t || a.c - b.c);
    secs[name] = { beats, bpm: sec.bpm ?? def.bpm, ev };
  }
  const intro = def.intro ? [].concat(def.intro) : [];
  const order = def.order ?? Object.keys(def.sec).filter((k) => !intro.includes(k));
  for (const s of intro.concat(order)) if (!secs[s]) warn.push(`${id}: 섹션 ${s} 없음`);
  return { id, bpm: def.bpm, bpb, chans, secs, seq: intro.concat(order).filter((s) => secs[s]), loopAt: intro.length, loop: def.loop !== false, gain: def.gain ?? 1, warn };
}

// ─────────────────────────────── 악기 ───────────────────────────────
// play(e, ch, m, t, d, v): e=엔진, ch=채널(in 노드 등), m=MIDI, t=시작, d=길이(초), v=세기
function lpFx(f, q = 0.5, rate, depth) {
  return (e, ch, n) => { const b = e.ctx.createBiquadFilter(); b.type = 'lowpass'; b.frequency.value = f; b.Q.value = q; n.connect(b); if (rate) ch.vib = e.lfo(rate, depth, ch); return b; };
}
function vibOn(ch, oscs) { if (!ch.vib) return; for (const o of oscs) ch.vib.connect(o.detune); }
function adsr(g, t, d, pk, a, dec, sus, rel) {
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(pk, t + a);
  if (sus < 1) g.gain.setTargetAtTime(pk * sus, t + a, dec);
  g.gain.setTargetAtTime(0, t + Math.max(d, a), rel / 3);
  return t + Math.max(d, a) + rel * 2;
}
function pluck(g, t, d, pk, tau, rel = 0.05) {
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(pk, t + 0.003);
  g.gain.setTargetAtTime(0, t + 0.003, tau);
  if (d < tau * 4) { g.gain.setTargetAtTime(0, t + d, rel); return t + d + rel * 5; }
  return t + tau * 5;
}
const INST = {
  organ: {
    rev: 0.45, norm: 2.76,
    fx(e, ch, n) { const tr = e.ctx.createGain(); tr.gain.value = 0.92; n.connect(tr); const l = e.lfo(5.6, 0.09, ch); l.connect(tr.gain); return tr; },
    play(e, ch, m, t, d, v) {
      const f = mtof(m), g = e.ctx.createGain(), a = e.osc('organ', f, t), b = e.osc('organ', f * 1.0032, t);
      const end = adsr(g, t, d, v * 0.16, 0.035, 0.1, 1, 0.22);
      a.connect(g); b.connect(g); g.connect(ch.in); a.stop(end); b.stop(end); e.fin(a, g);
    },
  },
  organ2: {
    rev: 0.45, norm: 1.95,
    fx(e, ch, n) { const tr = e.ctx.createGain(); tr.gain.value = 0.9; n.connect(tr); const l = e.lfo(5.2, 0.1, ch); l.connect(tr.gain); return tr; },
    play(e, ch, m, t, d, v) {
      const g = e.ctx.createGain(), a = e.osc('flute', mtof(m), t);
      const end = adsr(g, t, d, v * 0.26, 0.05, 0.1, 1, 0.25); a.connect(g); g.connect(ch.in); a.stop(end); e.fin(a, g);
    },
  },
  harpsi: {
    rev: 0.22, norm: 5.84,
    play(e, ch, m, t, d, v) {
      const f = mtof(m), tau = 0.22 + Math.max(0, 90 - m) * 0.012;
      const g = e.ctx.createGain(), g2 = e.ctx.createGain(), a = e.osc('harpsi', f, t), b = e.osc('piano', f * 1.002, t);
      pluck(g, t, d + 0.1, v * 0.16, tau * 0.35, 0.05); const end = pluck(g2, t, d + 0.1, v * 0.13, tau, 0.06);
      a.connect(g); b.connect(g2); g.connect(ch.in); g2.connect(ch.in); a.stop(end); b.stop(end); e.fin(a, g); e.fin(b, g2, true);
    },
  },
  piano: {
    rev: 0.32, norm: 2.12,
    play(e, ch, m, t, d, v) {
      const f = mtof(m), tau = Math.min(1.6, 0.3 + Math.max(0, 100 - m) * 0.022);
      const g = e.ctx.createGain(), a = e.osc('piano', f, t), b = e.osc('piano', f * 1.0025, t);
      const end = pluck(g, t, d, v * 0.2, tau, 0.09);
      a.connect(g); b.connect(g); g.connect(ch.in); a.stop(end); b.stop(end); e.fin(a, g);
    },
  },
  strings: {
    rev: 0.4, norm: 7.26, fx: lpFx(2500, 0.5, 5.3, 9),
    play(e, ch, m, t, d, v) {
      const f = mtof(m), g = e.ctx.createGain(), a = e.osc('sawtooth', f, t), b = e.osc('sawtooth', f, t);
      a.detune.value = -8; b.detune.value = 8; vibOn(ch, [a, b]);
      const end = adsr(g, t, d, v * 0.075, Math.min(0.2, d * 0.4 + 0.02), 0.2, 0.85, 0.38);
      a.connect(g); b.connect(g); g.connect(ch.in); a.stop(end); b.stop(end); e.fin(a, g, false, ch.vib, a, b);
    },
  },
  choir: {
    rev: 0.55, norm: 2.87,
    fx(e, ch, n) { return e.formants(ch, n, ch.def.vowel === 'o' ? [[380, 6, 1], [820, 8, 0.6], [2500, 10, 0.2]] : [[720, 6, 1], [1150, 8, 0.65], [2800, 10, 0.3]]); },
    play(e, ch, m, t, d, v) {
      const f = mtof(m), g = e.ctx.createGain(), a = e.osc('sawtooth', f, t), b = e.osc('sawtooth', f, t);
      a.detune.value = -11; b.detune.value = 11; vibOn(ch, [a, b]);
      const end = adsr(g, t, d, v * 0.2, Math.min(0.32, d * 0.4 + 0.03), 0.3, 0.9, 0.55);
      a.connect(g); b.connect(g); g.connect(ch.in); a.stop(end); b.stop(end); e.fin(a, g, false, ch.vib, a, b);
    },
  },
  lead: {
    rev: 0.25, dly: 0.2, norm: 4,
    fx(e, ch, n) { ch.lf = e.lfo(5.7, 1, ch, true); return n; },
    play(e, ch, m, t, d, v) {
      const c = e.ctx, f = mtof(m), g = c.createGain(), fl = c.createBiquadFilter(), a = e.osc(ch.def.wave || 'pulse25', f, t), b = e.osc('sawtooth', f, t);
      b.detune.value = 7; const bg = c.createGain(); bg.gain.value = 0.45;
      fl.type = 'lowpass'; fl.Q.value = 1.2; fl.frequency.setValueAtTime(5200, t); fl.frequency.setTargetAtTime(2300, t + 0.01, 0.12);
      const vg = c.createGain(); vg.gain.setValueAtTime(0, t);
      if (d > 0.22) { vg.gain.setValueAtTime(0, t + 0.16); vg.gain.linearRampToValueAtTime(ch.def.vib ?? 16, t + 0.42); }
      ch.lf.connect(vg); vg.connect(a.detune); vg.connect(b.detune);
      const end = adsr(g, t, d, v * 0.15, 0.006, 0.18, 0.78, 0.09);
      a.connect(fl); b.connect(bg); bg.connect(fl); fl.connect(g); g.connect(ch.in); a.stop(end); b.stop(end);
      e.fin(a, g, false, null, null, null, ch.lf, vg);
    },
  },
  lead2: {
    rev: 0.25, dly: 0.12, norm: 3.49,
    fx(e, ch, n) { ch.lf = e.lfo(5.5, 1, ch, true); const b = e.ctx.createBiquadFilter(); b.type = 'lowpass'; b.frequency.value = 3200; n.connect(b); return b; },
    play(e, ch, m, t, d, v) {
      const c = e.ctx, g = c.createGain(), a = e.osc(ch.def.wave || 'square', mtof(m), t), vg = c.createGain();
      vg.gain.setValueAtTime(0, t); if (d > 0.22) { vg.gain.setValueAtTime(0, t + 0.18); vg.gain.linearRampToValueAtTime(14, t + 0.45); }
      ch.lf.connect(vg); vg.connect(a.detune);
      const end = adsr(g, t, d, v * 0.12, 0.008, 0.2, 0.8, 0.08);
      a.connect(g); g.connect(ch.in); a.stop(end); e.fin(a, g, false, null, null, null, ch.lf, vg);
    },
  },
  sawlead: {
    rev: 0.3, dly: 0.2, norm: 5.19,
    fx(e, ch, n) { ch.lf = e.lfo(5.8, 1, ch, true); const b = e.ctx.createBiquadFilter(); b.type = 'lowpass'; b.frequency.value = 3600; b.Q.value = 0.8; n.connect(b); return b; },
    play(e, ch, m, t, d, v) {
      const c = e.ctx, f = mtof(m), g = c.createGain(), a = e.osc('sawtooth', f, t), b = e.osc('sawtooth', f, t), vg = c.createGain();
      a.detune.value = -7; b.detune.value = 7;
      vg.gain.setValueAtTime(0, t); if (d > 0.22) { vg.gain.setValueAtTime(0, t + 0.15); vg.gain.linearRampToValueAtTime(ch.def.vib ?? 18, t + 0.4); }
      ch.lf.connect(vg); vg.connect(a.detune); vg.connect(b.detune);
      const end = adsr(g, t, d, v * 0.1, 0.008, 0.2, 0.8, 0.1);
      a.connect(g); b.connect(g); g.connect(ch.in); a.stop(end); b.stop(end); e.fin(a, g, false, null, null, null, ch.lf, vg);
    },
  },
  fiddle: {
    rev: 0.3, norm: 4.34,
    fx(e, ch, n) { const c = e.ctx, lp = c.createBiquadFilter(), hp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3400; lp.Q.value = 1.5; hp.type = 'highpass'; hp.frequency.value = 350; n.connect(hp); hp.connect(lp); ch.vib = e.lfo(6.2, 20, ch); return lp; },
    play(e, ch, m, t, d, v) {
      const g = e.ctx.createGain(), a = e.osc('sawtooth', mtof(m), t); vibOn(ch, [a]);
      const end = adsr(g, t, d, v * 0.16, 0.035, 0.15, 0.8, 0.1);
      a.connect(g); g.connect(ch.in); a.stop(end); e.fin(a, g, false, ch.vib, a);
    },
  },
  reed: {
    rev: 0.2, norm: 4.73, fx: lpFx(3000, 0.7),
    play(e, ch, m, t, d, v) {
      const f = mtof(m), g = e.ctx.createGain(), a = e.osc('pulse35', f, t), b = e.osc('pulse35', f, t);
      a.detune.value = -13; b.detune.value = 13;
      const end = adsr(g, t, d, v * 0.08, 0.025, 0.1, 0.9, 0.07);
      a.connect(g); b.connect(g); g.connect(ch.in); a.stop(end); b.stop(end); e.fin(a, g);
    },
  },
  brass: {
    rev: 0.35, norm: 4.25,
    play(e, ch, m, t, d, v) {
      const c = e.ctx, f = mtof(m), g = c.createGain(), fl = c.createBiquadFilter(), a = e.osc('sawtooth', f, t), b = e.osc('sawtooth', f, t);
      a.detune.value = -6; b.detune.value = 6;
      fl.type = 'lowpass'; fl.Q.value = 0.9; fl.frequency.setValueAtTime(350, t); fl.frequency.linearRampToValueAtTime(1800 + v * 1600, t + 0.07); fl.frequency.setTargetAtTime(1500 + v * 600, t + 0.08, 0.2);
      const end = adsr(g, t, d, v * 0.12, 0.035, 0.2, 0.85, 0.14);
      a.connect(fl); b.connect(fl); fl.connect(g); g.connect(ch.in); a.stop(end); b.stop(end); e.fin(a, g);
    },
  },
  bass: {
    rev: 0.05, norm: 1.05,
    play(e, ch, m, t, d, v) {
      const c = e.ctx, f = mtof(m), g = c.createGain(), fl = c.createBiquadFilter(), a = e.osc('sawtooth', f, t), b = e.osc('sine', f, t);
      fl.type = 'lowpass'; fl.Q.value = 2.5; fl.frequency.setValueAtTime(260 + v * 1700, t); fl.frequency.setTargetAtTime(240, t + 0.005, 0.09);
      const sg = c.createGain(); sg.gain.value = 0.9;
      const end = adsr(g, t, d, v * 0.3, 0.004, 0.12, 0.62, 0.05);
      a.connect(fl); fl.connect(g); b.connect(sg); sg.connect(g); g.connect(ch.in); a.stop(end); b.stop(end); e.fin(a, g);
    },
  },
  fbass: {
    rev: 0.12, norm: 1.5,
    play(e, ch, m, t, d, v) {
      const f = mtof(m), g = e.ctx.createGain(), a = e.osc('triangle', f, t), b = e.osc('sine', f * 2, t), bg = e.ctx.createGain(); bg.gain.value = 0.18;
      const end = pluck(g, t, d, v * 0.42, 0.6, 0.06);
      a.connect(g); b.connect(bg); bg.connect(g); g.connect(ch.in); a.stop(end); b.stop(end); e.fin(a, g);
    },
  },
  pizz: {
    rev: 0.3, norm: 6, fx: lpFx(1700, 0.8),
    play(e, ch, m, t, d, v) {
      const g = e.ctx.createGain(), a = e.osc('sawtooth', mtof(m), t);
      const end = pluck(g, t, Math.min(d, 0.5), v * 0.22, 0.11, 0.05); a.connect(g); g.connect(ch.in); a.stop(end); e.fin(a, g);
    },
  },
  bells: {
    rev: 0.55, norm: 2.12,
    play(e, ch, m, t, d, v) {
      const c = e.ctx, f = mtof(m), g = c.createGain(), a = e.osc('sine', f, t), mo = e.osc('sine', f * 3.5, t), mg = c.createGain();
      mg.gain.setValueAtTime(f * 2.2, t); mg.gain.setTargetAtTime(f * 0.15, t, 0.5); mo.connect(mg); mg.connect(a.frequency);
      const tau = Math.min(1.4, 0.5 + Math.max(0, 96 - m) * 0.02), end = t + tau * 4.5;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v * 0.2, t + 0.002); g.gain.setTargetAtTime(0, t + 0.002, tau);
      a.connect(g); g.connect(ch.in); a.stop(end); mo.stop(end); e.fin(a, g);
    },
  },
  celesta: {
    rev: 0.45, dly: 0.15, norm: 2.66,
    play(e, ch, m, t, d, v) {
      const c = e.ctx, f = mtof(m), g = c.createGain(), g2 = c.createGain(), a = e.osc('sine', f, t), b = e.osc('sine', f * 4.01, t);
      const tau = ch.def.tau ?? 0.45;
      const end = pluck(g, t, d + 0.4, v * 0.26, tau, 0.1); pluck(g2, t, 0.1, v * 0.07, 0.07, 0.03);
      a.connect(g); b.connect(g2); g.connect(ch.in); g2.connect(ch.in); a.stop(end); b.stop(end); e.fin(a, g); e.fin(b, g2, true);
    },
  },
  timp: {
    rev: 0.4, norm: 0.8,
    fx(e, ch, n) { ch.lp = e.ctx.createBiquadFilter(); ch.lp.type = 'lowpass'; ch.lp.frequency.value = 320; ch.lp.connect(n); return n; },
    play(e, ch, m, t, d, v) {
      const c = e.ctx, f = mtof(m), g = c.createGain(), a = e.osc('sine', f * 1.05, t);
      a.frequency.exponentialRampToValueAtTime(f, t + 0.09);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v * 0.55, t + 0.004); g.gain.setTargetAtTime(0, t + 0.004, 0.42);
      a.connect(g); g.connect(ch.in); a.stop(t + 2); e.fin(a, g);
      e.noiseHit(ch.lp, t, 0.12, v * 0.45, 0.03);
    },
  },
  gtr: {
    rev: 0.12, norm: 0.47,
    fx(e, ch, n) {
      const c = e.ctx, pre = c.createGain(), ws = c.createWaveShaper(), lp = c.createBiquadFilter(), hp = c.createBiquadFilter(), post = c.createGain();
      pre.gain.value = 2.2; ws.curve = e.curve(7); lp.type = 'lowpass'; lp.frequency.value = 2900; lp.Q.value = 0.9; hp.type = 'highpass'; hp.frequency.value = 110; post.gain.value = 0.22;
      n.connect(pre); pre.connect(ws); ws.connect(hp); hp.connect(lp); lp.connect(post); return post;
    },
    play(e, ch, m, t, d, v) {
      const f = mtof(m), g = e.ctx.createGain(), a = e.osc('sawtooth', f, t), b = e.osc('sawtooth', f, t);
      a.detune.value = -9; b.detune.value = 9;
      const end = adsr(g, t, d, v * 0.3, 0.003, 0.25, 0.7, 0.05);
      a.connect(g); b.connect(g); g.connect(ch.in); a.stop(end); b.stop(end); e.fin(a, g);
    },
  },
  kit: {
    rev: 0.1, norm: 0.798,
    fx(e, ch, n) {
      const c = e.ctx, mk = (type, f, q) => { const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; b.connect(n); return b; };
      ch.hh = mk('highpass', 7200, 0.7); ch.cy = mk('highpass', 4200, 0.5); ch.sn = mk('highpass', 1100, 0.6); ch.bp = mk('bandpass', 1500, 1.2); ch.lo = mk('lowpass', 900, 0.7);
      return n;
    },
    play(e, ch, k, t, d, v) { const fn = DRUMS[k]; if (fn) fn(e, ch, t, v); },
  },
};
INST.musicbox = { ...INST.celesta };
// 드럼 합성 (채널 공유 필터 사용: hh 하이햇, cy 심벌, sn 스네어, bp 클랩, lo 저역)
const DRUMS = {
  k(e, ch, t, v) {
    const c = e.ctx, o = e.osc('sine', 150, t), g = c.createGain();
    o.frequency.exponentialRampToValueAtTime(44, t + 0.12);
    g.gain.setValueAtTime(v * 0.95, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.36);
    o.connect(g); g.connect(ch.in); o.stop(t + 0.38); e.fin(o, g);
    e.noiseHit(ch.cy, t, 0.012, v * 0.3, 0.004);
  },
  s(e, ch, t, v) {
    e.noiseHit(ch.sn, t, 0.22, v * 0.62, 0.05);
    const c = e.ctx, o = e.osc('triangle', 200, t), g = c.createGain();
    o.frequency.exponentialRampToValueAtTime(150, t + 0.07);
    g.gain.setValueAtTime(v * 0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    o.connect(g); g.connect(ch.in); o.stop(t + 0.12); e.fin(o, g);
  },
  h(e, ch, t, v) { e.noiseHit(ch.hh, t, 0.06, v * 0.3, 0.013); },
  o(e, ch, t, v) { e.noiseHit(ch.hh, t, 0.36, v * 0.26, 0.09); },
  c(e, ch, t, v) { e.noiseHit(ch.cy, t, 1.6, v * 0.2, 0.4, 0.002); },
  r(e, ch, t, v) {
    e.noiseHit(ch.hh, t, 0.4, v * 0.14, 0.12);
    const o = e.osc('square', 3150, t), g = e.ctx.createGain(); g.gain.setValueAtTime(v * 0.025, t); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.25);
    o.connect(g); g.connect(ch.hh); o.stop(t + 0.27); e.fin(o, g);
  },
  t(e, ch, t, v) { tom(e, ch, t, v, 230); }, m(e, ch, t, v) { tom(e, ch, t, v, 160); }, f(e, ch, t, v) { tom(e, ch, t, v, 100); },
  p(e, ch, t, v) {
    const c = e.ctx, s = c.createBufferSource(), g = c.createGain();
    s.buffer = e.noise; s.loop = true;
    g.gain.setValueAtTime(0, t);
    for (let i = 0; i < 3; i++) { g.gain.setValueAtTime(v * 0.5, t + i * 0.011); g.gain.exponentialRampToValueAtTime(0.05, t + i * 0.011 + 0.009); }
    g.gain.setValueAtTime(v * 0.45, t + 0.033); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    s.connect(g); g.connect(ch.bp); s.start(t, R()); s.stop(t + 0.21); e.fin(s, g);
  },
  j(e, ch, t, v) { e.noiseHit(ch.hh, t, 0.09, v * 0.28, 0.025, 0.004); e.noiseHit(ch.hh, t + 0.028, 0.08, v * 0.16, 0.025); },
  w(e, ch, t, v) {
    const c = e.ctx, o = e.osc('sine', 1650, t), g = c.createGain();
    g.gain.setValueAtTime(v * 0.42, t); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.06);
    o.connect(g); g.connect(ch.in); o.stop(t + 0.07); e.fin(o, g);
    e.noiseHit(ch.bp, t, 0.02, v * 0.15, 0.005);
  },
  a(e, ch, t, v) {
    const c = e.ctx, o = e.osc('sine', 1180, t), mo = e.osc('sine', 1180 * 2.41, t), mg = c.createGain(), g = c.createGain();
    mg.gain.setValueAtTime(1400, t); mg.gain.exponentialRampToValueAtTime(30, t + 0.3); mo.connect(mg); mg.connect(o.frequency);
    g.gain.setValueAtTime(v * 0.26, t); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.6);
    o.connect(g); g.connect(ch.in); o.stop(t + 0.62); mo.stop(t + 0.62); e.fin(o, g);
    e.noiseHit(ch.cy, t, 0.03, v * 0.3, 0.008);
  },
  z(e, ch, t, v) {
    const c = e.ctx, o = e.osc('sine', 72, t), g = c.createGain();
    o.frequency.exponentialRampToValueAtTime(28, t + 1.1);
    g.gain.setValueAtTime(v * 0.9, t); g.gain.setTargetAtTime(0, t + 0.02, 0.4);
    o.connect(g); g.connect(ch.in); o.stop(t + 1.9); e.fin(o, g);
    e.noiseHit(ch.lo, t, 1.0, v * 0.5, 0.3, 0.004);
  },
};
function tom(e, ch, t, v, f) {
  const c = e.ctx, o = e.osc('sine', f * 1.35, t), g = c.createGain();
  o.frequency.exponentialRampToValueAtTime(f * 0.78, t + 0.22);
  g.gain.setValueAtTime(v * 0.7, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.34);
  o.connect(g); g.connect(ch.in); o.stop(t + 0.36); e.fin(o, g);
  e.noiseHit(ch.lo, t, 0.05, v * 0.25, 0.015);
}

// ─────────────────────────────── 효과음 합성 ───────────────────────────────
// S = { e, c, t(시작), p(피치 배율), v(볼륨), out, end }
function filt(S, n, f, t, dur) {
  const b = S.c.createBiquadFilter(), p = S.p;
  b.type = f[0]; b.frequency.setValueAtTime(f[1] * p, t);
  if (f[2]) b.frequency.exponentialRampToValueAtTime(f[2] * p, t + (f[4] ?? dur));
  if (f[3]) b.Q.value = f[3];
  n.connect(b); return b;
}
// 톤: w 파형, f0→f1 스윕, at 지연, dur 길이, vol, o{a,hold,f:[type,f0,f1,q,sweep],vib:[rate,cents],fm:[ratio,index,decay],det,lin,sw}
function T(S, w, f0, f1, at, dur, vol, o = E0) {
  const c = S.c, t = S.t + at, os = c.createOscillator(), g = c.createGain(), p = S.p;
  if (BUILTIN.has(w)) os.type = w; else os.setPeriodicWave(S.e.wave(w));
  os.frequency.setValueAtTime(f0 * p, t);
  if (f1 && f1 !== f0) { const te = t + (o.sw ?? dur); if (o.lin) os.frequency.linearRampToValueAtTime(f1 * p, te); else os.frequency.exponentialRampToValueAtTime(f1 * p, te); }
  if (o.det) os.detune.value = o.det;
  const a = o.a ?? 0.002, pk = vol * S.v;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(pk, t + a);
  if (o.hold) g.gain.setValueAtTime(pk, t + a + o.hold);
  g.gain.exponentialRampToValueAtTime(0.0004, t + dur);
  let n = os;
  if (o.f) n = filt(S, n, o.f, t, dur);
  n.connect(g); g.connect(S.out);
  if (o.vib) { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = o.vib[0]; lg.gain.value = o.vib[1]; l.connect(lg); lg.connect(os.detune); l.start(t); l.stop(t + dur + 0.02); }
  if (o.fm) {
    const mo = c.createOscillator(), mg = c.createGain(), fb = f0 * p;
    mo.frequency.value = fb * o.fm[0]; mg.gain.setValueAtTime(fb * o.fm[1], t); mg.gain.exponentialRampToValueAtTime(fb * o.fm[1] * 0.02 + 0.01, t + (o.fm[2] ?? dur));
    mo.connect(mg); mg.connect(os.frequency); mo.start(t); mo.stop(t + dur + 0.02);
  }
  os.start(t); os.stop(t + dur + 0.02);
  if (at + dur > S.end) S.end = at + dur;
  return os;
}
// 노이즈: o{a,hold,f:[type,f0,f1,q,sweep],f2,rate}
function N(S, at, dur, vol, o = E0) {
  const c = S.c, t = S.t + at, s = c.createBufferSource(), g = c.createGain();
  s.buffer = S.e.noise; s.loop = true; if (o.rate) s.playbackRate.value = o.rate;
  const a = o.a ?? 0.001, pk = vol * S.v;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(pk, t + a);
  if (o.hold) g.gain.setValueAtTime(pk, t + a + o.hold);
  g.gain.exponentialRampToValueAtTime(0.0004, t + dur);
  let n = s;
  if (o.f) n = filt(S, n, o.f, t, dur);
  if (o.f2) n = filt(S, n, o.f2, t, dur);
  n.connect(g); g.connect(S.out); s.start(t, R() * 1.8); s.stop(t + dur + 0.02);
  if (at + dur > S.end) S.end = at + dur;
}
const ARP = (S, w, notes, step, dur, vol, o, at = 0) => notes.forEach((m, i) => { if (m != null) T(S, w, mtof(m), 0, at + i * step, dur, vol, o || E0); });
const FM = (S, f, ratio, idx, at, dur, vol, o = E0) => T(S, 'sine', f, o.f1 ?? 0, at, dur, vol, { ...o, fm: [ratio, idx, o.fd ?? dur * 0.5] });
const CRACKLE = (S, at, dur, n, vol, f = 2500) => { for (let i = 0; i < n; i++) N(S, at + R() * dur, 0.012 + R() * 0.02, vol * (0.4 + R() * 0.6), { f: ['bandpass', f * (0.6 + R() * 0.9), 0, 2] }); };
const BOOM = (S, at, dur, vol, f0 = 90) => { T(S, 'sine', f0, 28, at, dur, vol, { sw: dur * 0.7 }); N(S, at, dur * 1.1, vol * 0.8, { f: ['lowpass', 2600, 160, 0.7] }); };

// 각 효과음: { fn(S), max(동명 동시), rev(잔향 송신), vol, vary(피치 랜덤), gap(중복 억제 초), duck:[amount,time] }
const SFX = {
  _default: { max: 3, fn(S) { T(S, 'triangle', 700, 560, 0, 0.08, 0.2); } },
  // ── 무기 ──
  whip: { max: 3, rev: 0.1, fn(S) {
    N(S, 0, 0.15, 0.3, { f: ['bandpass', 520, 4200, 1.3], a: 0.07 });
    N(S, 0.105, 0.05, 0.6, { f: ['highpass', 2600] });
    T(S, 'square', 1900, 240, 0.105, 0.035, 0.1);
    T(S, 'sine', 180, 70, 0.105, 0.06, 0.22);
  } },
  whip_crack: { max: 3, rev: 0.16, fn(S) {
    N(S, 0, 0.1, 0.28, { f: ['bandpass', 800, 5200, 1.2], a: 0.05 });
    N(S, 0.08, 0.05, 0.85, { f: ['highpass', 2200] });
    N(S, 0.08, 0.16, 0.3, { f: ['bandpass', 1800, 500, 2.5] });
    T(S, 'square', 2600, 160, 0.08, 0.045, 0.15);
    T(S, 'sine', 200, 55, 0.08, 0.1, 0.35);
  } },
  slash: { max: 4, rev: 0.08, fn(S) {
    N(S, 0, 0.17, 0.42, { f: ['bandpass', 1300, 5600, 1.1], a: 0.035 });
    N(S, 0.03, 0.05, 0.18, { f: ['highpass', 6000] });
    T(S, 'sine', 3100, 2900, 0.03, 0.13, 0.04);
  } },
  slash_heavy: { max: 3, rev: 0.14, fn(S) {
    N(S, 0, 0.28, 0.52, { f: ['bandpass', 320, 2800, 0.9], a: 0.07 });
    T(S, 'sine', 120, 42, 0.05, 0.22, 0.5);
    T(S, 'sawtooth', 240, 70, 0.05, 0.16, 0.12, { f: ['lowpass', 900] });
    T(S, 'sine', 1900, 1750, 0.07, 0.22, 0.04);
  } },
  gun: { max: 4, rev: 0.18, fn(S) {
    N(S, 0, 0.018, 0.9, { f: ['highpass', 1800] });
    N(S, 0.003, 0.16, 0.7, { f: ['lowpass', 5200, 700, 0.8] });
    T(S, 'sine', 210, 55, 0, 0.12, 0.7);
    T(S, 'square', 900, 120, 0, 0.04, 0.12);
  } },
  shotgun: { max: 2, rev: 0.25, fn(S) {
    N(S, 0, 0.025, 1, { f: ['highpass', 1400] });
    N(S, 0.004, 0.34, 0.85, { f: ['lowpass', 4800, 420, 0.7] });
    T(S, 'sine', 140, 36, 0, 0.26, 0.9);
    CRACKLE(S, 0.02, 0.12, 5, 0.3, 3000);
    N(S, 0.3, 0.03, 0.35, { f: ['bandpass', 2500, 0, 3] }); N(S, 0.38, 0.035, 0.4, { f: ['bandpass', 1800, 0, 3] });
  } },
  dagger: { max: 4, rev: 0.08, fn(S) {
    N(S, 0, 0.09, 0.34, { f: ['bandpass', 2400, 6800, 1.5], a: 0.02 });
    T(S, 'sine', 3400, 3200, 0.03, 0.09, 0.05);
  } },
  axe: { max: 3, rev: 0.12, fn(S) {
    for (let i = 0; i < 4; i++) N(S, i * 0.085, 0.11, 0.3 - i * 0.05, { f: ['bandpass', 600, 1700, 1.6], a: 0.04 });
    T(S, 'sine', 160, 90, 0, 0.18, 0.25);
  } },
  cross: { max: 2, rev: 0.25, fn(S) {
    T(S, 'triangle', 820, 880, 0, 0.5, 0.14, { vib: [26, 90], a: 0.03 });
    N(S, 0, 0.45, 0.16, { f: ['bandpass', 2400, 1600, 3], a: 0.05 });
    T(S, 'sine', 1760, 1760, 0, 0.35, 0.06);
  } },
  holywater_burn: { max: 2, rev: 0.2, fn(S) {
    for (let i = 0; i < 5; i++) T(S, 'sine', 3000 + R() * 3500, 0, R() * 0.05, 0.08 + R() * 0.06, 0.07);
    N(S, 0, 0.06, 0.4, { f: ['highpass', 4000] });
    N(S, 0.04, 0.55, 0.42, { f: ['bandpass', 600, 2400, 0.8, 0.2], a: 0.06 });
    CRACKLE(S, 0.08, 0.45, 9, 0.22, 3200);
  } },
  stopwatch: { max: 1, rev: 0.4, duck: [0.3, 0.6], fn(S) {
    for (let i = 0; i < 3; i++) { T(S, 'sine', 2200, 0, i * 0.12, 0.05, 0.22); N(S, i * 0.12, 0.02, 0.15, { f: ['highpass', 5000] }); }
    T(S, 'sine', 1400, 120, 0.36, 0.7, 0.26, { a: 0.02 });
    T(S, 'triangle', 700, 60, 0.36, 0.8, 0.14, { a: 0.02, vib: [9, 40] });
  } },
  // ── 원소/마법 ──
  magic: { max: 3, rev: 0.3, fn(S) {
    T(S, 'sine', 620, 1850, 0, 0.3, 0.18, { a: 0.02, vib: [11, 30] });
    ARP(S, 'triangle', [84, 88, 91, 96], 0.04, 0.16, 0.08);
    N(S, 0, 0.3, 0.1, { f: ['highpass', 5000], a: 0.05 });
  } },
  holy: { max: 2, rev: 0.45, fn(S) {
    for (const [f, d] of [[880, 0], [1108.7, 0.03], [1318.5, 0.06], [1760, 0.09]]) T(S, 'triangle', f, 0, d, 0.7, 0.1, { a: 0.01 });
    T(S, 'sine', 440, 440, 0, 0.6, 0.12, { a: 0.02 });
    N(S, 0, 0.5, 0.12, { f: ['highpass', 6500], a: 0.06 });
  } },
  fire: { max: 3, rev: 0.12, fn(S) {
    N(S, 0, 0.42, 0.55, { f: ['lowpass', 380, 2600, 0.9, 0.12], a: 0.03 });
    N(S, 0, 0.3, 0.25, { f: ['bandpass', 1200, 500, 1] });
    CRACKLE(S, 0.03, 0.3, 6, 0.22, 2600);
    T(S, 'sine', 140, 70, 0, 0.2, 0.3);
  } },
  ice: { max: 3, rev: 0.35, fn(S) {
    for (let i = 0; i < 4; i++) T(S, 'sine', [2640, 3520, 3136, 4186][i], 0, i * 0.035, 0.3, 0.09);
    N(S, 0, 0.18, 0.25, { f: ['highpass', 6500] });
    T(S, 'triangle', 1320, 1100, 0, 0.12, 0.1);
  } },
  thunder: { max: 3, rev: 0.25, fn(S) {
    T(S, 'sawtooth', 1400, 90, 0, 0.26, 0.22, { f: ['lowpass', 5000, 900, 1] });
    N(S, 0, 0.3, 0.55, { f: ['bandpass', 3000, 900, 0.8] });
    CRACKLE(S, 0, 0.28, 10, 0.3, 4000);
    T(S, 'sine', 90, 45, 0.02, 0.2, 0.35);
  } },
  dark: { max: 3, rev: 0.4, fn(S) {
    T(S, 'sawtooth', 110, 52, 0, 0.55, 0.22, { a: 0.06, f: ['lowpass', 900, 300, 2] });
    T(S, 'sawtooth', 116, 55, 0, 0.55, 0.18, { a: 0.06, f: ['lowpass', 700, 250, 2] });
    T(S, 'sine', 55, 40, 0, 0.5, 0.3, { a: 0.03 });
    N(S, 0, 0.45, 0.14, { f: ['bandpass', 400, 1600, 3], a: 0.2 });
  } },
  // ── 타격 ──
  hit: { max: 4, gap: 0.035, rev: 0.05, fn(S) {
    N(S, 0, 0.022, 0.6, { f: ['highpass', 2600] });
    T(S, 'sine', 190, 58, 0, 0.1, 0.72);
    N(S, 0.004, 0.08, 0.34, { f: ['bandpass', 1300, 480, 1.4] });
    T(S, 'square', 560, 140, 0, 0.045, 0.1);
  } },
  hit_heavy: { max: 3, gap: 0.04, rev: 0.1, fn(S) {
    N(S, 0, 0.03, 0.75, { f: ['highpass', 1800] });
    T(S, 'sine', 130, 36, 0, 0.24, 0.95);
    N(S, 0.004, 0.2, 0.55, { f: ['lowpass', 3200, 280, 0.8] });
    T(S, 'sawtooth', 95, 40, 0, 0.16, 0.2, { f: ['lowpass', 700] });
  } },
  crit: { max: 2, gap: 0.05, rev: 0.22, fn(S) {
    N(S, 0, 0.03, 0.8, { f: ['highpass', 2000] });
    T(S, 'sine', 160, 40, 0, 0.22, 0.9);
    N(S, 0.004, 0.16, 0.45, { f: ['lowpass', 4000, 350, 0.8] });
    FM(S, 2350, 1.47, 1.6, 0.012, 0.42, 0.16, { fd: 0.2 });
    T(S, 'sine', 3520, 0, 0.012, 0.3, 0.06);
    N(S, 0.02, 0.2, 0.12, { f: ['highpass', 7000] });
  } },
  clang: { max: 3, rev: 0.25, fn(S) {
    N(S, 0, 0.025, 0.55, { f: ['highpass', 2500] });
    FM(S, 880, 1.41, 3, 0, 0.45, 0.26, { fd: 0.15 });
    FM(S, 1320, 2.76, 1.5, 0.002, 0.3, 0.12, { fd: 0.1 });
    T(S, 'sine', 180, 90, 0, 0.08, 0.3);
  } },
  enemy_die: { max: 4, gap: 0.03, rev: 0.12, fn(S) {
    N(S, 0, 0.26, 0.55, { f: ['bandpass', 1500, 180, 0.9] });
    T(S, 'square', 420, 50, 0, 0.22, 0.14, { f: ['lowpass', 2000] });
    T(S, 'sine', 150, 40, 0, 0.2, 0.45);
    CRACKLE(S, 0.02, 0.18, 5, 0.25, 1800);
  } },
  explode: { max: 3, gap: 0.05, rev: 0.3, duck: [0.25, 0.4], fn(S) {
    N(S, 0, 0.03, 0.9, { f: ['highpass', 1200] });
    BOOM(S, 0, 0.8, 0.9, 95);
    N(S, 0.01, 0.6, 0.45, { f: ['bandpass', 900, 200, 0.6] });
    CRACKLE(S, 0.05, 0.5, 10, 0.25, 1500);
  } },
  // ── 이동 ──
  jump: { max: 2, fn(S) {
    T(S, 'triangle', 300, 560, 0, 0.1, 0.16, { sw: 0.06 });
    N(S, 0, 0.1, 0.12, { f: ['bandpass', 900, 2400, 1.2], a: 0.01 });
  } },
  double_jump: { max: 2, rev: 0.12, fn(S) {
    T(S, 'triangle', 420, 980, 0, 0.14, 0.16, { sw: 0.1 });
    T(S, 'square', 840, 1960, 0.02, 0.1, 0.04, { sw: 0.08 });
    N(S, 0, 0.18, 0.2, { f: ['bandpass', 1400, 3600, 1.5], a: 0.02 });
  } },
  land: { max: 2, gap: 0.06, fn(S) {
    T(S, 'sine', 130, 48, 0, 0.1, 0.45);
    N(S, 0, 0.08, 0.28, { f: ['lowpass', 900, 200, 0.7] });
  } },
  footstep: { max: 2, gap: 0.08, vary: 0.12, fn(S) {
    N(S, 0, 0.05, 0.2, { f: ['lowpass', 700, 250, 1] });
    T(S, 'sine', 95, 60, 0, 0.05, 0.16);
    N(S, 0, 0.012, 0.06, { f: ['highpass', 3000] });
  } },
  dash: { max: 2, rev: 0.08, fn(S) {
    N(S, 0, 0.22, 0.45, { f: ['bandpass', 500, 2600, 1.1], a: 0.03 });
    T(S, 'sine', 200, 90, 0, 0.14, 0.22);
  } },
  mist: { max: 2, rev: 0.4, fn(S) {
    N(S, 0, 0.5, 0.28, { f: ['bandpass', 2600, 700, 1.5], a: 0.06 });
    T(S, 'sine', 660, 330, 0, 0.45, 0.08, { a: 0.05, vib: [7, 60] });
    T(S, 'sine', 990, 495, 0.02, 0.4, 0.05, { a: 0.05, vib: [8, 50] });
  } },
  splash: { max: 3, gap: 0.05, rev: 0.15, fn(S) {
    N(S, 0, 0.32, 0.45, { f: ['bandpass', 1400, 420, 0.8], a: 0.005 });
    N(S, 0, 0.1, 0.25, { f: ['highpass', 3500] });
    for (let i = 0; i < 5; i++) T(S, 'sine', 500 + R() * 700, 1400 + R() * 900, 0.03 + R() * 0.2, 0.05, 0.08);
  } },
  // ── 피격/사망 ──
  hurt: { max: 2, gap: 0.08, rev: 0.12, fn(S) {
    T(S, 'square', 520, 170, 0, 0.18, 0.16, { f: ['lowpass', 2600] });
    T(S, 'sawtooth', 260, 110, 0, 0.2, 0.14, { f: ['bandpass', 900, 500, 2] });
    N(S, 0, 0.09, 0.45, { f: ['bandpass', 2000, 600, 1] });
    T(S, 'sine', 150, 60, 0, 0.12, 0.45);
  } },
  death: { max: 1, rev: 0.5, duck: [0.6, 2], fn(S) {
    T(S, 'sawtooth', 440, 55, 0, 1.4, 0.2, { f: ['lowpass', 2400, 300, 1] });
    T(S, 'square', 330, 41, 0.05, 1.3, 0.1, { f: ['lowpass', 1800, 200] });
    FM(S, 110, 3.5, 2, 0.35, 2.2, 0.25);
    N(S, 0, 0.5, 0.35, { f: ['lowpass', 1500, 150] });
    T(S, 'sine', 90, 30, 0, 0.8, 0.5);
  } },
  // ── 획득 ──
  heart: { max: 3, gap: 0.04, rev: 0.12, fn(S) {
    T(S, 'triangle', 1318.5, 0, 0, 0.1, 0.2); T(S, 'triangle', 1760, 0, 0.06, 0.18, 0.2);
    T(S, 'square', 1760, 0, 0.06, 0.1, 0.035);
  } },
  coin: { max: 4, gap: 0.04, rev: 0.1, fn(S) {
    T(S, 'square', 987.8, 0, 0, 0.07, 0.11, { hold: 0.04 });
    T(S, 'square', 1318.5, 0, 0.07, 0.32, 0.11, { hold: 0.04 });
    T(S, 'triangle', 2637, 0, 0.07, 0.25, 0.06);
  } },
  item: { max: 2, rev: 0.25, fn(S) {
    ARP(S, 'square', [79, 83, 86, 91], 0.055, 0.14, 0.07, { hold: 0.02 });
    ARP(S, 'triangle', [79, 83, 86, 91], 0.055, 0.3, 0.14);
    T(S, 'sine', 3136, 0, 0.22, 0.4, 0.05);
  } },
  powerup: { max: 1, rev: 0.3, duck: [0.35, 0.7], fn(S) {
    ARP(S, 'square', [67, 71, 74, 79, 83, 86, 91], 0.05, 0.12, 0.07);
    ARP(S, 'triangle', [55, 59, 62, 67, 71, 74, 79], 0.05, 0.16, 0.16);
    for (const m of [79, 83, 86, 91]) T(S, 'triangle', mtof(m), 0, 0.36, 0.6, 0.07, { a: 0.01 });
    N(S, 0.3, 0.5, 0.08, { f: ['highpass', 7000], a: 0.05 });
  } },
  levelup: { max: 1, rev: 0.35, duck: [0.5, 1.1], fn(S) {
    ARP(S, 'square', [72, 76, 79], 0.08, 0.1, 0.1, { hold: 0.03 });
    for (const m of [72, 76, 79, 84]) T(S, 'square', mtof(m), 0, 0.26, 0.85, 0.055, { hold: 0.3 });
    for (const m of [60, 84, 88]) T(S, 'triangle', mtof(m), 0, 0.26, 0.9, 0.12, { hold: 0.3 });
    N(S, 0.26, 0.7, 0.07, { f: ['highpass', 7500], a: 0.05 });
    ARP(S, 'sine', [96, 100, 103, 108], 0.05, 0.25, 0.05, null, 0.5);
  } },
  extra_life: { max: 1, rev: 0.3, duck: [0.55, 1.1], fn(S) {
    ARP(S, 'square', [76, 79, 88, 84, 86, 91], 0.085, 0.12, 0.11, { hold: 0.04 });
    ARP(S, 'triangle', [64, 67, 76, 72, 74, 79], 0.085, 0.14, 0.18);
    T(S, 'triangle', mtof(96), 0, 0.51, 0.5, 0.08);
  } },
  chest: { max: 1, rev: 0.3, fn(S) {
    T(S, 'sawtooth', 90, 140, 0, 0.3, 0.12, { f: ['bandpass', 700, 1200, 4], vib: [22, 60], lin: true });
    N(S, 0.28, 0.08, 0.35, { f: ['lowpass', 900] });
    ARP(S, 'triangle', [84, 88, 91, 96, 100], 0.05, 0.4, 0.1, null, 0.32);
    N(S, 0.32, 0.6, 0.08, { f: ['highpass', 7000], a: 0.05 });
  } },
  heal: { max: 1, rev: 0.45, fn(S) {
    ARP(S, 'sine', [72, 76, 79, 84, 88], 0.07, 0.5, 0.12, { a: 0.02 });
    T(S, 'triangle', 523, 1046, 0, 0.6, 0.06, { a: 0.1 });
    N(S, 0, 0.6, 0.06, { f: ['highpass', 6000], a: 0.2 });
  } },
  save: { max: 1, rev: 0.55, fn(S) {
    FM(S, 523.3, 3.5, 1.2, 0, 1.6, 0.18); FM(S, 659.3, 3.5, 1.0, 0.12, 1.5, 0.14); FM(S, 784, 3.5, 0.9, 0.24, 1.6, 0.14);
    T(S, 'triangle', 1046.5, 0, 0.36, 1.2, 0.07, { a: 0.02 });
  } },
  candle: { max: 3, gap: 0.05, rev: 0.2, fn(S) {
    T(S, 'sine', 2600, 0, 0, 0.12, 0.12); T(S, 'sine', 3900, 0, 0.01, 0.08, 0.06);
    N(S, 0, 0.05, 0.3, { f: ['highpass', 4000] });
    N(S, 0.02, 0.28, 0.3, { f: ['lowpass', 500, 2200, 1, 0.1], a: 0.02 });
  } },
  // ── 환경 ──
  door: { max: 1, rev: 0.3, fn(S) {
    T(S, 'sawtooth', 70, 105, 0, 0.55, 0.1, { f: ['bandpass', 600, 900, 5], vib: [14, 80], a: 0.04, lin: true });
    T(S, 'sawtooth', 95, 80, 0.1, 0.4, 0.06, { f: ['bandpass', 1100, 700, 6], vib: [19, 60], a: 0.04 });
    T(S, 'sine', 90, 40, 0.55, 0.25, 0.55); N(S, 0.55, 0.2, 0.35, { f: ['lowpass', 700] });
  } },
  break_wall: { max: 2, rev: 0.3, duck: [0.2, 0.4], fn(S) {
    T(S, 'sine', 110, 35, 0, 0.35, 0.8);
    N(S, 0, 0.5, 0.6, { f: ['lowpass', 2400, 250, 0.8] });
    for (let i = 0; i < 8; i++) N(S, 0.05 + R() * 0.45, 0.05 + R() * 0.06, 0.25 + R() * 0.2, { f: ['bandpass', 500 + R() * 1400, 0, 1.5] });
  } },
  secret: { max: 1, rev: 0.5, duck: [0.45, 1.2], fn(S) {
    ARP(S, 'triangle', [74, 73, 70, 64, 75, 79, 86, 91], 0.085, 0.3, 0.12);
    ARP(S, 'square', [74, 73, 70, 64, 75, 79, 86, 91], 0.085, 0.08, 0.035);
    FM(S, 1174.7, 3.5, 0.9, 0.68, 1.3, 0.1);
  } },
  bell: { max: 2, rev: 0.6, fn(S) {
    FM(S, 196, 3.5, 2.2, 0, 3.5, 0.26, { fd: 1.2 }); FM(S, 392, 2.76, 0.8, 0, 2.5, 0.08, { fd: 0.8 });
    T(S, 'sine', 98, 0, 0, 3, 0.16, { a: 0.01 });
  } },
  clock_tick: { max: 2, gap: 0.05, rev: 0.15, fn(S) {
    T(S, 'sine', 1750, 0, 0, 0.05, 0.22); N(S, 0, 0.018, 0.12, { f: ['bandpass', 3500, 0, 3] });
  } },
  thunderclap: { max: 1, rev: 0.5, duck: [0.5, 1.5], fn(S) {
    N(S, 0, 0.08, 1, { f: ['highpass', 1500] });
    CRACKLE(S, 0, 0.25, 14, 0.45, 3500);
    N(S, 0.04, 2.4, 0.8, { f: ['lowpass', 1400, 90, 0.8, 1.6], a: 0.05 });
    T(S, 'sine', 60, 28, 0.02, 1.8, 0.7);
  } },
  bat: { max: 3, gap: 0.08, rev: 0.2, fn(S) {
    for (let i = 0; i < 3; i++) T(S, 'sine', 3600 + R() * 900, 2600, i * 0.07, 0.05, 0.08, { sw: 0.04 });
    N(S, 0, 0.22, 0.14, { f: ['bandpass', 900, 0, 2], rate: 0.5 });
  } },
  ghost: { max: 2, gap: 0.2, rev: 0.6, fn(S) {
    T(S, 'triangle', 520, 380, 0, 0.9, 0.12, { a: 0.25, vib: [5, 70] });
    T(S, 'sine', 780, 560, 0.08, 0.8, 0.07, { a: 0.3, vib: [4.3, 90] });
    N(S, 0, 0.9, 0.08, { f: ['bandpass', 1200, 700, 5], a: 0.3 });
  } },
  // ── 보스/경고 ──
  boss_roar: { max: 1, rev: 0.45, duck: [0.55, 1.6], fn(S) {
    T(S, 'sawtooth', 95, 62, 0, 1.5, 0.3, { a: 0.08, vib: [23, 120], f: ['lowpass', 1500, 500, 3] });
    T(S, 'square', 72, 48, 0, 1.4, 0.18, { a: 0.1, vib: [17, 90], f: ['lowpass', 900, 300, 2] });
    T(S, 'sawtooth', 190, 120, 0.05, 1.2, 0.1, { a: 0.1, vib: [31, 150], f: ['bandpass', 800, 450, 3] });
    N(S, 0, 1.4, 0.4, { f: ['bandpass', 500, 180, 1.4], a: 0.1 });
    T(S, 'sine', 55, 30, 0, 1.3, 0.55, { a: 0.06 });
  } },
  boss_die: { max: 1, rev: 0.55, duck: [0.7, 3], fn(S) {
    for (let i = 0; i < 6; i++) { const at = i * 0.28 + R() * 0.08; BOOM(S, at, 0.7, 0.55 + i * 0.05, 80 + R() * 40); CRACKLE(S, at, 0.3, 5, 0.2, 1600); }
    T(S, 'sawtooth', 160, 30, 0, 2.2, 0.18, { a: 0.1, vib: [18, 120], f: ['lowpass', 1200, 150] });
    BOOM(S, 1.75, 2.2, 1, 70);
    N(S, 1.75, 2.8, 0.25, { f: ['highpass', 3000, 800], a: 0.1 });
  } },
  warning: { max: 1, rev: 0.25, fn(S) {
    for (let i = 0; i < 3; i++) { T(S, 'square', 880, 0, i * 0.34, 0.16, 0.09, { hold: 0.12 }); T(S, 'square', 622, 0, i * 0.34 + 0.17, 0.16, 0.09, { hold: 0.12 }); T(S, 'sawtooth', 110, 0, i * 0.34, 0.32, 0.12, { hold: 0.25, f: ['lowpass', 800] }); }
  } },
  ult: { max: 1, rev: 0.45, duck: [0.6, 1.4], fn(S) {
    T(S, 'sawtooth', 110, 880, 0, 0.5, 0.12, { a: 0.2, f: ['lowpass', 600, 5000, 1.5] });
    N(S, 0, 0.5, 0.25, { f: ['bandpass', 500, 6000, 2], a: 0.3 });
    N(S, 0.5, 0.04, 1, { f: ['highpass', 1200] });
    BOOM(S, 0.5, 1.2, 1, 110);
    for (const m of [62, 69, 74, 78, 81]) T(S, 'sawtooth', mtof(m), 0, 0.5, 1.2, 0.045, { a: 0.03, f: ['lowpass', 3000, 1200], det: (R() - 0.5) * 16 });
    N(S, 0.5, 1.0, 0.12, { f: ['highpass', 6500], a: 0.05 });
  } },
  combo: { max: 2, gap: 0.03, fn(S) { T(S, 'square', 1046.5, 1568, 0, 0.07, 0.07, { sw: 0.04 }); T(S, 'triangle', 2093, 0, 0.03, 0.1, 0.06); } },
  charge_ready: { max: 1, rev: 0.3, fn(S) {
    T(S, 'sine', 1760, 0, 0, 0.3, 0.14); T(S, 'sine', 2637, 0, 0.05, 0.3, 0.1); T(S, 'triangle', 880, 1760, 0, 0.08, 0.1);
    N(S, 0, 0.2, 0.06, { f: ['highpass', 8000] });
  } },
  // ── 강화 ──
  enhance_hit: { max: 2, rev: 0.35, fn(S) {
    N(S, 0, 0.03, 0.8, { f: ['highpass', 1800] });
    FM(S, 1250, 2.41, 3.2, 0, 0.7, 0.24, { fd: 0.25 });
    FM(S, 1870, 1.41, 1.2, 0.003, 0.5, 0.1, { fd: 0.15 });
    T(S, 'sine', 140, 55, 0, 0.14, 0.6);
    for (let i = 0; i < 4; i++) T(S, 'sine', 4000 + R() * 3000, 0, 0.01 + R() * 0.05, 0.06, 0.04);
  } },
  enhance_success: { max: 1, rev: 0.5, duck: [0.6, 1.6], fn(S) {
    FM(S, 1250, 2.41, 2.5, 0, 0.6, 0.18, { fd: 0.2 });
    ARP(S, 'square', [72, 76, 79, 84, 88, 91], 0.06, 0.12, 0.07, { hold: 0.02 }, 0.08);
    for (const m of [72, 79, 84, 88, 91]) T(S, 'sawtooth', mtof(m), 0, 0.46, 1.3, 0.04, { a: 0.02, hold: 0.3, f: ['lowpass', 4500, 1800] });
    for (const m of [60, 67]) T(S, 'triangle', mtof(m), 0, 0.46, 1.2, 0.15, { hold: 0.3 });
    FM(S, 2093, 3.5, 0.8, 0.46, 1.4, 0.08);
    N(S, 0.46, 1, 0.1, { f: ['highpass', 7500], a: 0.05 });
  } },
  enhance_fail: { max: 1, rev: 0.35, duck: [0.4, 1.2], fn(S) {
    FM(S, 1250, 2.41, 2.5, 0, 0.5, 0.14, { fd: 0.2 });
    T(S, 'square', 392, 370, 0.12, 0.34, 0.1, { hold: 0.2, f: ['lowpass', 1800] });
    T(S, 'square', 330, 262, 0.48, 0.7, 0.1, { hold: 0.3, f: ['lowpass', 1500], vib: [6, 40] });
    T(S, 'triangle', 165, 131, 0.48, 0.8, 0.2, { hold: 0.3 });
    T(S, 'sine', 90, 40, 0.48, 0.2, 0.4);
  } },
  enhance_destroy: { max: 1, rev: 0.45, duck: [0.6, 2], fn(S) {
    FM(S, 1250, 2.41, 2.5, 0, 0.4, 0.14, { fd: 0.2 });
    N(S, 0.1, 0.1, 0.9, { f: ['highpass', 2500] });
    for (let i = 0; i < 16; i++) T(S, 'sine', 2500 + R() * 5500, 0, 0.1 + R() * 0.5, 0.08 + R() * 0.15, 0.06);
    for (let i = 0; i < 10; i++) N(S, 0.1 + R() * 0.55, 0.03 + R() * 0.05, 0.3, { f: ['bandpass', 3000 + R() * 4000, 0, 2] });
    BOOM(S, 0.1, 1.2, 0.8, 80);
    T(S, 'sawtooth', 220, 55, 0.2, 1.4, 0.1, { f: ['lowpass', 1500, 200] });
  } },
  // ── 미니게임 ──
  dice: { max: 2, fn(S) {
    let at = 0; for (let i = 0; i < 7; i++) { at += 0.035 + R() * 0.05; N(S, at, 0.025, 0.3 + R() * 0.2, { f: ['bandpass', 1800 + R() * 1800, 0, 3] }); T(S, 'sine', 900 + R() * 800, 0, at, 0.03, 0.06); }
  } },
  card: { max: 3, gap: 0.03, fn(S) { N(S, 0, 0.07, 0.3, { f: ['bandpass', 3000, 1500, 1.5], a: 0.01 }); N(S, 0.05, 0.02, 0.2, { f: ['highpass', 3000] }); } },
  slot_spin: { max: 1, fn(S) {
    for (let i = 0; i < 12; i++) { const at = i * 0.05 + i * i * 0.002; T(S, 'square', 1200 - i * 40, 0, at, 0.03, 0.06); N(S, at, 0.015, 0.1, { f: ['bandpass', 4000, 0, 3] }); }
  } },
  slot_win: { max: 1, rev: 0.3, duck: [0.5, 1.4], fn(S) {
    ARP(S, 'square', [72, 76, 79, 84, 79, 84, 88, 91, 96], 0.07, 0.12, 0.08, { hold: 0.03 });
    for (let i = 0; i < 6; i++) FM(S, 2093 + (i % 2) * 540, 3.5, 0.5, 0.63 + i * 0.08, 0.3, 0.06);
    for (const m of [72, 76, 79, 84]) T(S, 'triangle', mtof(m), 0, 0.63, 0.8, 0.08, { hold: 0.3 });
  } },
  win: { max: 1, rev: 0.3, duck: [0.5, 1], fn(S) {
    ARP(S, 'square', [67, 72, 76, 79], 0.08, 0.1, 0.09, { hold: 0.03 });
    for (const m of [72, 76, 79, 84]) T(S, 'square', mtof(m), 0, 0.32, 0.6, 0.05, { hold: 0.25 });
    T(S, 'triangle', mtof(48), 0, 0.32, 0.6, 0.2, { hold: 0.25 });
  } },
  lose: { max: 1, rev: 0.3, duck: [0.5, 1.2], fn(S) {
    ARP(S, 'square', [71, 70, 69], 0.2, 0.18, 0.08, { hold: 0.1, f: ['lowpass', 2000] });
    T(S, 'square', mtof(68), mtof(66), 0.6, 0.7, 0.08, { hold: 0.3, vib: [6, 50], f: ['lowpass', 1600] });
    T(S, 'triangle', mtof(44), 0, 0.6, 0.7, 0.2, { hold: 0.3 });
  } },
  coin_insert: { max: 1, rev: 0.25, fn(S) {
    T(S, 'sine', 3100, 0, 0, 0.06, 0.1); N(S, 0, 0.02, 0.3, { f: ['highpass', 5000] });
    T(S, 'sine', 2800, 0, 0.09, 0.05, 0.08); N(S, 0.09, 0.015, 0.2, { f: ['highpass', 5000] });
    T(S, 'square', 1046.5, 0, 0.2, 0.09, 0.1, { hold: 0.05 }); T(S, 'square', 2093, 0, 0.3, 0.3, 0.1, { hold: 0.08 });
  } },
  // ── 연출 ──
  ready: { max: 1, rev: 0.25, fn(S) { T(S, 'square', 523.3, 0, 0, 0.12, 0.1, { hold: 0.06 }); T(S, 'square', 523.3, 0, 0.18, 0.12, 0.1, { hold: 0.06 }); T(S, 'triangle', 261.6, 0, 0, 0.3, 0.18); } },
  go: { max: 1, rev: 0.3, fn(S) {
    T(S, 'square', 523.3, 1046.5, 0, 0.12, 0.1, { sw: 0.06 });
    for (const m of [72, 79, 84]) T(S, 'sawtooth', mtof(m), 0, 0.06, 0.55, 0.06, { hold: 0.2, f: ['lowpass', 4000, 1500] });
    N(S, 0.06, 0.2, 0.3, { f: ['highpass', 3000] });
    T(S, 'sine', 130, 50, 0.06, 0.2, 0.5);
  } },
  menu_move: { max: 2, gap: 0.03, fn(S) { T(S, 'square', 1320, 0, 0, 0.035, 0.06, { hold: 0.012 }); T(S, 'triangle', 2640, 0, 0, 0.03, 0.05); } },
  menu_ok: { max: 2, gap: 0.05, rev: 0.12, fn(S) { T(S, 'square', 880, 0, 0, 0.06, 0.08, { hold: 0.03 }); T(S, 'square', 1318.5, 0, 0.06, 0.16, 0.08, { hold: 0.04 }); T(S, 'triangle', 1760, 0, 0.06, 0.2, 0.08); } },
  menu_cancel: { max: 2, gap: 0.05, fn(S) { T(S, 'square', 660, 0, 0, 0.06, 0.07, { hold: 0.03 }); T(S, 'square', 440, 0, 0.06, 0.12, 0.07, { hold: 0.03 }); } },
  type: { max: 2, gap: 0.03, vary: 0.08, fn(S) { T(S, 'square', 880, 0, 0, 0.025, 0.05, { f: ['lowpass', 2500] }); N(S, 0, 0.012, 0.06, { f: ['highpass', 4000] }); } },
};

// 체감 음량 보정 (오프라인 렌더 단기 RMS 측정 기반) — 호출부 vol 과 곱해짐
const SFX_VOL = {
  hit: 1.2, whip: 1.25, whip_crack: 1.2, slash: 2.6, dagger: 3, cross: 1.6, axe: 1.3, holywater_burn: 1.6,
  magic: 1.5, holy: 1.3, ice: 1.6, jump: 1.6, double_jump: 1.4, land: 0.6, footstep: 0.8,
  heart: 1.4, coin: 1.3, item: 1.2, powerup: 2, extra_life: 1.5, chest: 2, heal: 1.3,
  menu_move: 2.2, menu_ok: 1.6, menu_cancel: 1.6, type: 9, candle: 1.5, door: 0.8, secret: 2, clock_tick: 1.5,
  bat: 2.5, ghost: 1.5, splash: 1.5, dice: 4, card: 4, slot_spin: 5, slot_win: 1.5, ready: 1.5, coin_insert: 1.5,
  charge_ready: 1.6, combo: 3, warning: 1.6, enhance_success: 1.4,
};
for (const k in SFX_VOL) if (SFX[k]) SFX[k].vol = SFX_VOL[k];

// ─────────────────────────────── 엔진 ───────────────────────────────
/** 한 AudioContext(실시간 또는 Offline) 위의 믹서·잔향·신스·시퀀서 */
export class Engine {
  constructor(ctx) {
    const c = this.ctx = ctx;
    this.waves = {}; this.voices = 0; this.live = []; this.lastT = {}; this.lastV = {}; this.players = []; this.compiled = {}; this._curves = {};
    const nb = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = R() * 2 - 1;
    this.noise = nb;
    this.master = c.createGain(); this.master.gain.value = 0.9;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -12; comp.knee.value = 12; comp.ratio.value = 2.6; comp.attack.value = 0.005; comp.release.value = 0.25;
    const lim = c.createDynamicsCompressor(); lim.threshold.value = -2.5; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.1;
    this.master.connect(comp); comp.connect(lim); lim.connect(c.destination);
    // 잔향
    this.revIn = c.createGain();
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 170;
    this.verb = c.createConvolver(); this.verb.buffer = makeIR(c, 3.3);
    const rv = c.createGain(); rv.gain.value = 0.85;
    this.revIn.connect(hp); hp.connect(this.verb); this.verb.connect(rv); rv.connect(this.master);
    // 음악 버스
    this.musicIn = c.createGain(); this.duckG = c.createGain(); this.musicG = c.createGain();
    this.musicIn.connect(this.duckG); this.duckG.connect(this.musicG); this.musicG.connect(this.master);
    this.musicRev = c.createGain(); this.duckR = c.createGain(); this.musicRevG = c.createGain();
    this.musicRev.connect(this.duckR); this.duckR.connect(this.musicRevG); this.musicRevG.connect(this.revIn);
    // 템포 동기 딜레이 (리드용)
    this.delayIn = c.createGain();
    this.delay = c.createDelay(2); this.delay.delayTime.value = 0.3;
    const fb = c.createGain(), dl = c.createBiquadFilter(), dout = c.createGain();
    fb.gain.value = 0.34; dl.type = 'lowpass'; dl.frequency.value = 2600; dout.gain.value = 0.55;
    this.delayIn.connect(this.delay); this.delay.connect(dl); dl.connect(fb); fb.connect(this.delay); dl.connect(dout); dout.connect(this.musicIn);
    const dr = c.createGain(); dr.gain.value = 0.3; dout.connect(dr); dr.connect(this.musicRev);
    // 효과음 버스
    this.sfxG = c.createGain(); this.sfxG.connect(this.master);
    this.sfxRev = c.createGain(); this.sfxRev.connect(this.revIn);
    this.setVolumes(0.6, 0.8);
  }
  wave(name) { return this.waves[name] || (this.waves[name] = this.ctx.createPeriodicWave(...(WAVES[name] || WAVES.bright)())); }
  curve(k) { return this._curves[k] || (this._curves[k] = shaperCurve(k)); }
  osc(w, f, t) {
    const o = this.ctx.createOscillator();
    if (BUILTIN.has(w)) o.type = w; else o.setPeriodicWave(this.wave(w));
    o.frequency.value = f; o.start(t); return o;
  }
  // 소스 종료 시 연결 해제 (LFO 연결까지 정리해 누수 방지)
  fin(src, g, noCount, vib, a, b, lf, vg) {
    if (!noCount) this.voices++;
    src.onended = () => {
      if (!noCount) this.voices--;
      g.disconnect();
      if (vib) { try { vib.disconnect(a.detune); if (b) vib.disconnect(b.detune); } catch { /* 이미 해제됨 */ } }
      if (lf) { try { lf.disconnect(vg); } catch { /* 이미 해제됨 */ } }
    };
  }
  // 채널 공유 LFO (raw=true면 ±1 원신호 → 노트별 깊이 게인 사용)
  lfo(rate, depth, ch, raw) {
    const o = this.ctx.createOscillator(); o.frequency.value = rate * (0.97 + R() * 0.06); o.start();
    ch.lfos.push(o);
    if (raw) return o;
    const g = this.ctx.createGain(); g.gain.value = depth; o.connect(g); return g;
  }
  formants(ch, n, fs) {
    const c = this.ctx, sum = c.createGain();
    for (const [f, q, a] of fs) { const b = c.createBiquadFilter(), g = c.createGain(); b.type = 'bandpass'; b.frequency.value = f; b.Q.value = q; g.gain.value = a * 3.2; n.connect(b); b.connect(g); g.connect(sum); }
    ch.vib = this.lfo(4.9, 13, ch);
    return sum;
  }
  noiseHit(dest, t, dur, v, tau, a = 0) {
    const c = this.ctx, s = c.createBufferSource(), g = c.createGain();
    s.buffer = this.noise; s.loop = true;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + a + 0.0008); g.gain.setTargetAtTime(0, t + a + 0.001, tau);
    s.connect(g); g.connect(dest); s.start(t, R() * 1.8); s.stop(t + dur); this.fin(s, g, true);
  }
  setVolumes(m, s) {
    const t = this.ctx.currentTime, mg = MUSIC_TRIM * Math.pow(Math.max(0, m), 1.5), sg = SFX_TRIM * Math.pow(Math.max(0, s), 1.5);
    this.musicG.gain.setTargetAtTime(mg, t, 0.03); this.musicRevG.gain.setTargetAtTime(mg, t, 0.03);
    this.sfxG.gain.setTargetAtTime(sg, t, 0.03); this.sfxRev.gain.setTargetAtTime(sg * 0.6, t, 0.03);
  }
  duck(amount = 0.5, time = 0.5) {
    const t = this.ctx.currentTime, lvl = Math.max(0.05, 1 - amount);
    for (const p of [this.duckG.gain, this.duckR.gain]) {
      if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t); else { p.cancelScheduledValues(t); p.setValueAtTime(p.value, t); }
      p.setTargetAtTime(lvl, t, 0.03); p.setTargetAtTime(1, t + time, 0.28);
    }
  }
  // ── 효과음 ──
  sfx(name, o = E0) {
    const c = this.ctx, now = c.currentTime, def = SFX[name] || SFX._default;
    const vol = o.vol ?? 1, pitch = o.pitch ?? 1;
    if (vol <= 0.001) return;
    const lt = this.lastT[name];
    if (lt !== undefined && now - lt < (def.gap ?? 0.025) && vol <= this.lastV[name]) return;
    this.lastT[name] = now; this.lastV[name] = vol;
    this.prune(now);
    let same = 0, oldest = null;
    for (const x of this.live) if (x.name === name && x.end > now) { same++; if (!oldest || x.st < oldest.st) oldest = x; }
    if (same >= (def.max ?? 4) && oldest) this.steal(oldest, now);
    if (this.live.length >= MAX_SFX) { let o2 = this.live[0]; for (const x of this.live) if (x.st < o2.st) o2 = x; this.steal(o2, now); this.prune(now); }
    const out = c.createGain(); let node = out;
    if (o.pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, o.pan)); out.connect(p); node = p; }
    node.connect(this.sfxG);
    let wet = null;
    if (def.rev) { wet = c.createGain(); wet.gain.value = def.rev; node.connect(wet); wet.connect(this.sfxRev); }
    const S = { e: this, c, t: now + 0.004 + (o.delay || 0), p: pitch * (1 + (R() * 2 - 1) * (def.vary ?? 0.035)), v: vol * (def.vol ?? 1), out, end: 0 };
    def.fn(S);
    this.live.push({ name, st: now, end: now + (o.delay || 0) + S.end + 0.05, out, node, wet });
    if (def.duck) this.duck(def.duck[0] * Math.min(1, vol), def.duck[1]);
  }
  steal(x, now) { x.out.gain.cancelScheduledValues(now); x.out.gain.setTargetAtTime(0, now, 0.012); x.end = Math.min(x.end, now + 0.06); }
  prune(now) {
    let j = 0;
    for (let i = 0; i < this.live.length; i++) {
      const x = this.live[i];
      if (x.end > now - 0.3) this.live[j++] = x;
      else { x.node.disconnect(); if (x.node !== x.out) x.out.disconnect(); if (x.wet) x.wet.disconnect(); }
    }
    this.live.length = j;
  }
  // ── 음악 ──
  compile(id) {
    if (this.compiled[id]) return this.compiled[id];
    const def = TRACKS[id];
    if (!def) return null;
    return (this.compiled[id] = compileTrack(def, id));
  }
  playTrack(id, when, fadeIn = 0.02) {
    const comp = this.compile(id);
    if (!comp) return null;
    const p = new Player(this, id, comp, when, fadeIn);
    this.players.push(p);
    return p;
  }
  tick(until) {
    const now = this.ctx.currentTime;
    if (this.live.length) this.prune(now);
    for (let i = this.players.length - 1; i >= 0; i--) {
      const p = this.players[i];
      if (p.deadAt && now > p.deadAt) { p.dispose(); this.players.splice(i, 1); continue; }
      if (p.done && now > p.endT + 4) { p.dispose(); this.players.splice(i, 1); continue; }
      if (!p.deadAt || until < p.deadAt + 0.05) { try { p.schedule(until); } catch { /* 한 트랙 오류가 다른 트랙을 막지 않게 */ } }
    }
  }
}

// 트랙 재생 인스턴스 — 섹션 순서대로 이벤트를 룩어헤드 스케줄
class Player {
  constructor(eng, id, comp, when, fadeIn) {
    const c = eng.ctx;
    this.eng = eng; this.id = id; this.comp = comp; this.si = 0; this.ei = 0; this.st = when; this.done = false; this.deadAt = 0; this.endT = 0; this.notes = 0;
    this.out = c.createGain(); this.wet = c.createGain(); this.dly = c.createGain();
    const lvl = comp.gain;
    for (const g of [this.out, this.wet, this.dly]) { g.gain.setValueAtTime(fadeIn > 0.03 ? 0 : lvl, when); if (fadeIn > 0.03) g.gain.linearRampToValueAtTime(lvl, when + fadeIn); }
    this.out.connect(eng.musicIn); this.wet.connect(eng.musicRev); this.dly.connect(eng.delayIn);
    eng.delay.delayTime.setTargetAtTime(Math.min(1.5, (60 / comp.bpm) * 0.75), c.currentTime, 0.05);
    this.lfos = [];
    this.chans = comp.chans.map((cd) => this.makeChannel(cd));
  }
  makeChannel(cd) {
    const e = this.eng, c = e.ctx, inst = INST[cd.inst] || INST.lead;
    const ch = { def: cd, inst, in: c.createGain(), lfos: this.lfos, nodes: [] };
    ch.in.gain.value = (cd.vol ?? 0.5) * (inst.norm ?? 1);
    let tail = ch.in;
    if (inst.fx) tail = inst.fx(e, ch, tail);
    let pan = tail;
    if (c.createStereoPanner) { pan = c.createStereoPanner(); pan.pan.value = cd.pan ?? 0; tail.connect(pan); }
    pan.connect(this.out);
    const rev = cd.rev ?? inst.rev ?? 0.2, dly = cd.dly ?? inst.dly ?? 0;
    if (rev > 0) { const g = c.createGain(); g.gain.value = rev; pan.connect(g); g.connect(this.wet); ch.nodes.push(g); }
    if (dly > 0) { const g = c.createGain(); g.gain.value = dly; pan.connect(g); g.connect(this.dly); ch.nodes.push(g); }
    ch.nodes.push(ch.in, tail, pan);
    return ch;
  }
  schedule(until) {
    const comp = this.comp, e = this.eng, now = e.ctx.currentTime;
    while (!this.done) {
      const sec = comp.secs[comp.seq[this.si]], spb = 60 / sec.bpm, ev = sec.ev;
      while (this.ei < ev.length) {
        const x = ev[this.ei], t = this.st + x.t * spb;
        if (t >= until) return;
        this.ei++;
        if (t < now - 0.03) continue;
        const ch = this.chans[x.c];
        if (!ch) continue;
        if (x.c >= 0 && ch.inst !== INST.kit && e.voices > MAX_MUSIC_VOICES) continue;
        ch.inst.play(e, ch, x.m, t < now ? now : t, Math.max(0.03, x.d * spb), x.v * (0.93 + R() * 0.1)); // 세기 미세 흔들림(인간미)
        this.notes++;
      }
      const end = this.st + sec.beats * spb;
      if (end >= until) return;
      this.si++; this.ei = 0; this.st = end;
      if (this.si >= comp.seq.length) {
        if (!comp.loop) { this.done = true; this.endT = end; return; }
        this.si = comp.loopAt; this.loops = (this.loops || 0) + 1;
      }
    }
  }
  kill(fade = 1) {
    const t = this.eng.ctx.currentTime, f = Math.max(0.02, fade);
    for (const g of [this.out, this.wet, this.dly]) { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + f); }
    this.deadAt = t + f + 0.05;
  }
  dispose() {
    for (const o of this.lfos) { try { o.stop(); } catch { /* 무시 */ } o.disconnect(); }
    for (const ch of this.chans) for (const n of ch.nodes) n.disconnect();
    this.out.disconnect(); this.wet.disconnect(); this.dly.disconnect();
  }
}
// 트랙 구조 조회용 (검증 도구)
export { INST, SFX };

// ─────────────────────────────── 공개 API ───────────────────────────────
class AudioSystem {
  constructor() {
    this.ctx = null; this.eng = null; this.musicVol = 0.6; this.sfxVol = 0.8;
    this.want = null; this.player = null; this.hidden = false; this.timer = 0;
    // iOS 사파리 등: touchend/click 제스처에서만 오디오가 풀리는 환경 대비 (한 번 풀리면 해제)
    if (typeof window !== 'undefined' && window.addEventListener) {
      const evs = ['touchend', 'click', 'keydown', 'pointerup'];
      const h = () => { this.unlock(); if (this.ctx && this.ctx.state === 'running') for (const ev of evs) window.removeEventListener(ev, h, true); };
      for (const ev of evs) window.addEventListener(ev, h, { capture: true, passive: true });
    }
  }
  get current() { return this.want; }
  unlock() {
    if (this.ctx && this.ctx.state === 'running') return;
    if (!this.ctx) {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC({ latencyHint: 'interactive' });
        this.eng = new Engine(this.ctx);
        this.eng.setVolumes(this.musicVol, this.sfxVol);
        // iOS 사파리 잠금 해제용 무음 버퍼
        const b = this.ctx.createBuffer(1, 1, 22050), s = this.ctx.createBufferSource(); s.buffer = b; s.connect(this.ctx.destination); s.start(0);
        this.timer = setInterval(() => this._tick(), TICK_MS);
      } catch { this.ctx = null; this.eng = null; return; }
    }
    if (this.ctx.state !== 'running' && !this.hidden) { const p = this.ctx.resume(); if (p && p.then) p.then(() => this._sync(), () => {}); }
    this._sync();
  }
  suspend() { this.hidden = true; if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {}); }
  resume() { this.hidden = false; if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().then(() => this._sync(), () => {}); }
  setVolumes(m, s) {
    this.musicVol = m ?? this.musicVol; this.sfxVol = s ?? this.sfxVol;
    this.eng?.setVolumes(this.musicVol, this.sfxVol);
    // 음악 음량 0 → 시퀀서 정지(모바일 CPU 절약), 다시 올리면 원하던 곡 재개
    if (this.musicVol <= 0.001) { if (this.player) { this.player.kill(0.2); this.player = null; } }
    else this._sync();
  }
  sfx(name, opts) {
    if (!this.eng || this.ctx.state !== 'running') return;
    try { this.eng.sfx(name, opts || E0); } catch { /* 효과음 실패는 무시 */ }
  }
  music(id, opts = E0) {
    if (!id) { this.stopMusic(opts.fade ?? 1); return; }
    id = String(id);
    if (!TRACKS[id]) id = id.startsWith('minigame') ? 'minigame' : id.startsWith('boss') ? 'boss' : id.startsWith('ending') ? 'ending' : null;
    if (!id || !TRACKS[id]) return; // 알 수 없는 곡 → 현재 곡 유지
    if (id === this.want) return;
    this.want = id; this.fade = opts.fade;
    this._sync();
  }
  stopMusic(fade = 1) {
    this.want = null;
    if (this.player) { this.player.kill(fade); this.player = null; }
  }
  duck(amount = 0.5, time = 0.5) { this.eng?.duck(amount, time); }
  update() { this._tick(); }
  _sync() {
    if (!this.eng || this.ctx.state !== 'running') return;
    if (!this.want || this.musicVol <= 0.001) return;
    if (this.player && this.player.id === this.want) return;
    // 전환: 기본은 이전 곡을 빠르게 페이드아웃하고 새 곡은 첫 박부터 온전히 (아케이드식 컷),
    //       fade 를 지정하면 그 시간만큼 교차 페이드
    const now = this.ctx.currentTime, f = this.fade, prev = this.player;
    let at = now + 0.06, fin = 0.02;
    if (prev) { prev.kill(f ?? 0.6); if (f == null) at = now + 0.25; else fin = f * 0.7; }
    try { this.player = this.eng.playTrack(this.want, at, fin); }
    catch { this.player = null; }
    this.fade = undefined;
    this._tick();
  }
  _tick() {
    if (!this.eng || this.ctx.state !== 'running') return;
    try { this.eng.tick(this.ctx.currentTime + LOOKAHEAD); } catch { /* 스케줄 오류 무시 */ }
    if (this.player && this.player.done && this.ctx.currentTime > this.player.endT) { if (this.want === this.player.id) this.want = null; this.player = null; }
  }
}
export const audio = new AudioSystem();
