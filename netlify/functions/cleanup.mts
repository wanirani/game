// 예약 함수: 하루 한 번 요청 제한·세션 기록 정리 (netlify/lib/cleanup.mts, docs/ACCOUNTS.md §4). URL 로는 부를 수 없다 (Netlify 예약 함수).
import type { Config, Context } from '@netlify/functions';
import { runCleanup } from '../lib/cleanup.mts';
import { Ctx } from '../lib/runtime.mts';

export default async (req: Request, context: Context): Promise<Response> => {
  try {
    const r = await runCleanup(new Ctx(req, context));
    console.log(`[cleanup] 제한 기록 ${r.limits.deleted}/${r.limits.seen} · 세션 ${r.sessions.deleted}/${r.sessions.seen} 삭제 (${r.ms}ms)`);
  } catch (e) {
    console.error(`[cleanup] 실패: ${e instanceof Error ? e.name : typeof e}`);
  }
  return new Response(null, { status: 204 });
};

export const config: Config = {
  schedule: '@daily',
};
