// 매일 도는 정리 (netlify/functions/cleanup.mts, PS-05). Netlify Blobs 에는 만료(TTL)가 없어서 지우지 않으면 무기한 쌓인다:
//  - bn-ratelimit: 창이 끝나고 잠금도 풀린 카운터(ip/auth·ip/signup·lock/…), 90일이 지난 믿는 망 기록(lock/login/<id>/ok/…)
//  - bn-sessions : 만료된 지 30일이 지난 세션 저장값 (사용자 기록의 세션 목록은 다음 로그인 때 정리된다)
// 한 번에 저장소마다 CLEANUP.maxPerRun 개까지만 읽고(함수 시간 제한), 시작 위치를 날마다 바꿔 남은 것은 다음 날 이어 간다.
import { CLEANUP, STORES } from './config.mts';
import { limitRecordExpired } from './ratelimit.mts';
import { now } from './runtime.mts';
import type { Ctx, KV } from './runtime.mts';

export interface CleanupReport { limits: { seen: number; deleted: number }; sessions: { seen: number; deleted: number }; ms: number }

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
  return { limits, sessions, ms: now() - t0 };
}
