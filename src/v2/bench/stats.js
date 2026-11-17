// v2bench — 순수 계산: 시험 목록 · 통계 · 가장 좋은 설정 고르기 · 복사용 글 (node 에서도 돈다). docs/v2/PERF_NOTES.md §3
// 낱말: 화면 간격 = 화면이 한 번 갱신되는 간격(rAF 간격), 그림 간격 = 실제로 새 그림이 올라간 간격.

/** 「이 설정으로 하기」가 쓰는 localStorage 키. 값 = JSON {v, present, resK, cap, chars, hz, at} — docs/v2/PERF_NOTES.md §5 */
export const STORE_KEY = 'bn.v2.perf';
export const STORE_VER = 1;

export const PRESENT_KO = { layer: '겹쳐 얹기', blit: '옮겨 그리기' };
export const CHARS_KO = { card: '납작 그림', none: '캐릭터 없음', '3d': '입체 캐릭터' };
export const PACE_KO = { every: '매 화면', cap60: '초당 60' };

/**
 * 시험 목록. main = 본편이 실제로 쓸 캐릭터 방식(입체가 되면 입체, 아니면 납작 그림) — 이 줄들만 「가장 좋은 설정」 후보(pick)다.
 * 나머지는 원인을 가르는 진단용: 납작 그림(= 지금 시범판 B 그대로) · 캐릭터 없음(= 세계만 그릴 때의 바닥값).
 */
export function buildMatrix(has3d, audioOn = false) {
  const main = has3d ? '3d' : 'card', T = [];
  const add = (present, resK, chars, pace, pick, why, mute = false) => {
    if (T.some((t) => t.present === present && t.resK === resK && t.chars === chars && t.pace === pace && t.mute === mute)) return;
    T.push({ id: T.length + 1, present, resK, chars, pace, pick, why, mute });
  };
  add('blit', 1, 'card', 'cap60', main === 'card', '지금 시범판 B 그대로');
  add('layer', 1, 'card', 'cap60', main === 'card', '겹치는 법만 바꿈');
  add('layer', 1, 'card', 'every', main === 'card', '매 화면 그리기');
  add('layer', 1, main, 'every', true, '');
  add('layer', 0.75, main, 'every', true, '');
  add('layer', 0.5, main, 'every', true, '');
  add('blit', 1, main, 'every', true, '');
  add('layer', 1, main, 'cap60', true, '');
  add('blit', 1, main, 'cap60', true, '');
  add('layer', 1, 'none', 'every', false, '세계만');
  add('blit', 1, 'none', 'every', false, '세계만');
  add('layer', 0.5, 'none', 'every', false, '세계만 · 절반 해상도');
  if (audioOn) add('layer', 1, main, 'every', false, '소리 끔', true);   // 소리가 나고 있을 때만: 같은 설정을 소리를 멈추고 한 번 더
  return T;
}

const sortedCopy = (a, n) => Array.prototype.slice.call(a, 0, n).sort((p, q) => p - q);
const pct = (s, k) => (s.length ? s[Math.min(s.length - 1, Math.floor(s.length * k))] : 0);
const r1 = (v) => Math.round(v * 10) / 10;

/** 간격 목록(ms) → {n, p50, p95, max, mean} */
export function dist(a, n = a.length) {
  const s = sortedCopy(a, n); let sum = 0; for (const v of s) sum += v;
  return { n: s.length, p50: pct(s, 0.5), p95: pct(s, 0.95), max: s.length ? s[s.length - 1] : 0, mean: s.length ? sum / s.length : 0 };
}
/** 화면 간격 중앙값 → 흔한 주사율에 붙인다 (4 % 안이면) */
export function snapRefresh(ms) {
  if (!(ms > 0)) return { ms: 16.667, hz: 60, exact: false };
  for (const hz of [240, 165, 144, 120, 96, 90, 72, 60, 48, 40, 30, 24]) if (Math.abs(ms - 1000 / hz) / (1000 / hz) < 0.04) return { ms: 1000 / hz, hz, exact: true };
  return { ms, hz: Math.round(1000 / ms), exact: false };
}

/**
 * 시험 한 줄의 요약. raw = {iv(화면 간격), ivN, ci(그림 간격), ciN, js(프레임당 스크립트 시간), jsN, ...}
 * slow   = 화면 간격이 주사율 간격의 1.5배를 넘은 비율 (과제 정의)
 * uneven = 그림 간격이 그 시험의 중앙값에서 35 % 넘게 벗어난 비율 → 눈에 보이는 '끊김' (60 으로 고르게 가는 것은 끊김이 아니다)
 */
export function summarize(raw, refreshMs) {
  const f = dist(raw.iv, raw.ivN), c = dist(raw.ci, raw.ciN), j = dist(raw.js, raw.jsN);
  let slow = 0; for (let i = 0; i < raw.ivN; i++) if (raw.iv[i] > refreshMs * 1.5) slow++;
  let un = 0; const med = c.p50 || refreshMs; for (let i = 0; i < raw.ciN; i++) if (Math.abs(raw.ci[i] - med) > med * 0.35) un++;
  return {
    frames: f.n, seen: r1(f.p50), p50: r1(f.p50), p95: r1(f.p95), max: r1(f.max), slow: f.n ? slow / f.n : 1, stall: r1(f.max),
    draws: c.n, c50: r1(c.p50), c95: r1(c.p95), cmax: r1(c.max), uneven: c.n ? un / c.n : 1, fps: c.mean > 0 ? Math.round(1000 / c.mean) : 0,
    js50: r1(j.p50), js95: r1(j.p95), jsMax: r1(j.max),
  };
}

/**
 * 가장 좋은 설정. 후보(pick) 가운데:
 *  1) 끊김(uneven) 2 % 단위 등급이 낮은 것 → 2) 초당 그림 수가 많은 것(10 단위) → 3) 해상도가 높은 것 → 4) 겹쳐 얹기 → 5) 매 화면.
 *  절반 해상도(0.5)는 0.75 이상에서 부드러운 것(끊김 4 % 미만)이 하나도 없을 때만 고른다 (너무 흐리다).
 */
export function pickBest(rows) {
  const ok = rows.filter((r) => r.pick && r.valid && r.draws >= 2);
  if (!ok.length) return null;
  const band = (r) => Math.floor(r.uneven / 0.02 + 1e-9), fb = (r) => Math.round(r.fps / 10);
  const key = (a, b) => band(a) - band(b) || fb(b) - fb(a) || b.resK - a.resK || (a.present === 'layer' ? 0 : 1) - (b.present === 'layer' ? 0 : 1) || (a.pace === 'every' ? 0 : 1) - (b.pace === 'every' ? 0 : 1);
  const sharp = ok.filter((r) => r.resK >= 0.75 && band(r) < 2);
  return [...(sharp.length ? sharp : ok)].sort(key)[0];
}
export const settingKo = (r) => `${PRESENT_KO[r.present]} · 해상도 ${Math.round(r.resK * 100)}% · ${PACE_KO[r.pace]}`;
/** 한 줄 판정 (소유자가 읽는 말) */
export function verdict(best) {
  if (!best) return '측정한 시험이 없습니다';
  const head = `이 기기에서는 「${settingKo(best)}」 방식이 가장 부드럽습니다`, num = `초당 ${best.fps}장, 끊김 ${(best.uneven * 100).toFixed(1)}%`;
  if (best.fps < 40) return `${head}만 그래도 느립니다 (${num})`;
  if (best.uneven < 0.02) return `${head} (${num})`;
  return best.uneven < 0.08 ? `${head} (${num} — 가끔 끊깁니다)` : `${head}만 그래도 끊깁니다 (${num})`;
}
/** 판정의 등급: 0 부드러움 · 1 가끔 끊김 · 2 끊김/느림 (결과 화면의 색) */
export const verdictLevel = (best) => (!best || best.fps < 40 || best.uneven >= 0.08 ? 2 : best.uneven >= 0.02 ? 1 : 0);
/** localStorage 에 넣는 값 */
export function storeValue(best, env) {
  return { v: STORE_VER, present: best.present, resK: best.resK, cap: best.pace === 'cap60' ? 60 : 0, chars: best.chars, hz: env.refresh?.hz ?? 0, at: env.at ?? '' };
}

/** 복사용 글 (한 화면에 들어가는 짧은 표). 기계가 다시 읽기 쉽게 숫자 줄은 영문 약어를 쓴다 */
export function compactText(rep) {
  const e = rep.env, L = [];
  L.push(`[BN v2bench ${rep.ver}] ${e.at}`);
  L.push(`UA ${e.ua}`);
  L.push(`GL ${e.gl.api} | ${e.gl.renderer} | maxTex ${e.gl.maxTex} | lost ${e.ctxLost} restored ${e.ctxRestored}`);
  L.push(`SCR dpr ${e.dpr} | win ${e.win[0]}x${e.win[1]} | css ${e.css[0]}x${e.css[1]} | canvas ${e.canvas[0]}x${e.canvas[1]} | view ${e.view[0]}x${e.view[1]} | tier ${e.tier}${e.auto ? '(auto)' : ''} | fpsCap ${e.fpsCap} | saver ${e.saver}`);
  L.push(`DEV mem ${e.mem ?? '?'}GB | cores ${e.cores ?? '?'} | touch ${e.touch} | refresh ${e.refresh.ms.toFixed(2)}ms (${e.refresh.hz}Hz${e.refresh.exact ? '' : '?'}) | calib p50 ${e.calib.p50} p95 ${e.calib.p95} max ${e.calib.max}`);
  L.push(`CHR 3d ${e.char3d} | first-use world ${e.warm.world}ms card ${e.warm.card}ms 3d ${e.warm.c3d}ms | warmed ${e.warm.again}ms | after-resize ${e.warm.resize}ms | load ${e.loadMs}ms`);
  L.push(`AUD ${e.audio} | touchEv ${e.touchEv} | sec ${e.sec}/${e.skip}`);
  L.push('# present res chars pace | raf p50 p95 max slow% | draw p50 p95 max uneven% fps | js p50 p95 max | up blit glsync | heapMB/s gc gcStall long | px tris dc');
  for (const r of rep.rows) {
    if (!r.valid) { L.push(`${r.id} ${r.present} ${r.resK} ${r.chars} ${r.pace} | INVALID ${r.note ?? ''}`); continue; }
    L.push(`${r.id}${r.best ? '*' : ''} ${r.present} ${r.resK} ${r.chars} ${r.pace}${r.mute ? '+mute' : ''} | ${r.p50} ${r.p95} ${r.max} ${(r.slow * 100).toFixed(1)} | ${r.c50} ${r.c95} ${r.cmax} ${(r.uneven * 100).toFixed(1)} ${r.fps} | ${r.js50} ${r.js95} ${r.jsMax} | ${r.upMs} ${r.blitMs} ${r.glSync} | ${r.heapRate} ${r.gc} ${r.gcStall} ${r.longTasks} | ${r.px[0]}x${r.px[1]} ${r.tris} ${r.dc}`);
  }
  L.push(rep.best ? `BEST ${rep.best.present} ${rep.best.resK} ${rep.best.pace} (${rep.best.chars}) fps ${rep.best.fps} uneven ${(rep.best.uneven * 100).toFixed(1)}%` : 'BEST none');
  if (rep.note) L.push('NOTE ' + rep.note);
  return L.join('\n');
}
