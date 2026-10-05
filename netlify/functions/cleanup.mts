// 예약 함수: 하루 한 번 요청 제한·세션 기록·30일 지난 익명 통계 원본·제출한 런·지난 일일 도전·버려진 별명 정리
// (netlify/lib/cleanup.mts, docs/ACCOUNTS.md §4, docs/TELEMETRY.md, docs/ONLINE.md). URL 로는 부를 수 없다 (Netlify 예약 함수).
import type { Config, Context } from '@netlify/functions';
import { runCleanup } from '../lib/cleanup.mts';
import { Ctx } from '../lib/runtime.mts';

export default async (req: Request, context: Context): Promise<Response> => {
  try {
    const r = await runCleanup(new Ctx(req, context));
    console.log(`[cleanup] 제한 기록 ${r.limits.deleted}/${r.limits.seen} · 세션 ${r.sessions.deleted}/${r.sessions.seen} · 통계 원본 ${r.telemetry.deleted}/${r.telemetry.seen} · 런 ${r.runs.deleted}/${r.runs.seen} · 순위 ${r.boards.deleted}/${r.boards.seen} · 별명 ${r.nicks.deleted}/${r.nicks.seen} 삭제 (${r.ms}ms)`);
  } catch (e) {
    console.error(`[cleanup] 실패: ${e instanceof Error ? e.name : typeof e}`);
  }
  return new Response(null, { status: 204 });
};

export const config: Config = {
  schedule: '@daily',
};
