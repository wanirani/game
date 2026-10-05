// 매일 도는 정리 (netlify/functions/cleanup.mts, PS-05). Netlify Blobs 에는 만료(TTL)가 없어서 지우지 않으면 무기한 쌓인다:
//  - bn-ratelimit: 창이 끝나고 잠금도 풀린 카운터(ip/auth·ip/signup·lock/…), 90일이 지난 믿는 망 기록(lock/login/<id>/ok/…)
//  - bn-sessions : 만료된 지 30일이 지난 세션 저장값 (사용자 기록의 세션 목록은 다음 로그인 때 정리된다)
//  - bn-telemetry: 30일이 지난 익명 통계 원본 raw/… 과 시간 요약 hour/… (날 요약 agg/… 은 남긴다 — telemetry.mts sweepTelemetry)
//  - bn-runs     : 가장 긴 유효 기간(서바이벌·무한의 탑 30시간)이 끝나고 1시간 지난 '제출한 런' 기록 used/<시작 시각>/… (키만 보고 지운다 —
//                  키에는 보드가 없으므로 모든 런을 가장 긴 기간으로 본다: 일찍 지우면 아직 유효한 런을 다시 낼 수 있다)
//  - bn-boards·bn-ghosts: 61일 지난 일일 도전 보드(순위 목록·기록·표시·고스트), 순위 목록에 표시가 없는 고스트 (boards.mts sweepBoards)
//  - bn-nicks    : 주인 계정이 없거나 별명이 바뀐 별명 항목 (nick.mts sweepNicks)
// 한 번에 저장소마다 CLEANUP.maxPerRun 개까지만 읽고(함수 시간 제한), 시작 위치를 날마다 바꿔 남은 것은 다음 날 이어 간다.
import { CLEANUP, ONLINE, STORES } from './config.mts';
import { limitRecordExpired } from './ratelimit.mts';
import { sweepTelemetry } from './telemetry.mts';
import { sweepBoards } from './boards.mts';
import { sweepNicks } from './nick.mts';
import { now } from './runtime.mts';
import type { Ctx, KV } from './runtime.mts';

type Count = { seen: number; deleted: number };
export interface CleanupReport { limits: Count; sessions: Count; telemetry: Count; runs: Count; boards: Count; nicks: Count; ms: number }

/** 제출한 런 기록: 키의 시작 시각(UTC 시) + 가장 긴 유효 기간 + 1시간이 지났으면 지운다 (읽지 않는다) */
async function sweepRuns(st: KV, t: number): Promise<Count> {
  const { blobs } = await st.list({ prefix: 'used/' });
  const old = blobs.map((b) => b.key).filter((k) => {
    const m = /^used\/(\d{4})(\d{2})(\d{2})(\d{2})\//.exec(k);
    return !m || Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4]) + 3_600_000 + Math.max(ONLINE.runTtlMs, ONLINE.endlessRunTtlMs) + 3_600_000 <= t;
  }).slice(0, CLEANUP.maxPerRun);
  for (let i = 0; i < old.length; i += CLEANUP.concurrency) await Promise.all(old.slice(i, i + CLEANUP.concurrency).map((k) => st.delete(k)));
  return { seen: blobs.length, deleted: old.length };
}

async function sweep(st: KV, expired: (key: string, rec: unknown) => boolean, offset: number): Promise<{ seen: number; deleted: number }> {
  const { blobs } = await st.list();
  const keys = blobs.map((b) => b.key);
  const n = Math.min(keys.length, CLEANUP.maxPerRun);
  const start = keys.length > n ? offset % keys.length : 0;
  const pick = Array.from({ length: n }, (_, i) => keys[(start + i) % keys.length]);
  let deleted = 0;
  for (let i = 0; i < pick.length; i += CLEANUP.concurrency) {
    await Promise.all(pick.slice(i, i + CLEANUP.concurrency).map(async (key) => {
      let rec: unknown = null;
      try { rec = await st.get(key, { type: 'json' }); } catch { rec = null; /* 깨진 JSON → 지운다 */ }
      if (expired(key, rec)) { await st.delete(key); deleted++; }
    }));
  }
  return { seen: pick.length, deleted };
}

export async function runCleanup(c: Ctx): Promise<CleanupReport> {
  const t0 = now();
  const t = t0;
  const offset = Math.floor(t / 86_400_000) * 7919; // 날마다 다른 시작 위치
  const limits = await sweep(c.store(STORES.limits), (key, rec) => limitRecordExpired(key, rec, t, CLEANUP.limitIdleMs), offset);
  const sessions = await sweep(c.store(STORES.sessions), (_key, rec) => {
    const exp = (rec as { expiresAt?: unknown } | null)?.expiresAt;
    return !(typeof exp === 'number' && Number.isFinite(exp)) || exp + CLEANUP.sessionGraceMs <= t;
  }, offset);
  const telemetry = await sweepTelemetry(c.store(STORES.telemetry), t, CLEANUP.maxPerRun, CLEANUP.concurrency);
  const runs = await sweepRuns(c.store(STORES.runs), t);
  const boards = await sweepBoards(c, t);
  const nicks = await sweepNicks(c, t, CLEANUP.maxPerRun, CLEANUP.concurrency);
  return { limits, sessions, telemetry, runs, boards, nicks, ms: now() - t0 };
}
