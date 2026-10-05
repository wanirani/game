// 예약 함수: 매시 익명 통계 원본(bn-telemetry raw/…)을 시간·날 요약(hour/…, agg/<날>)으로 모은다 (netlify/lib/telemetry.mts, docs/TELEMETRY.md).
// 다시 돌려도 같은 원본을 두 번 세지 않는다. URL 로는 부를 수 없다 (Netlify 예약 함수 — cleanup.mts 와 같이 config.schedule 로 예약).
import type { Config, Context } from '@netlify/functions';
import { runAggregation } from '../lib/telemetry.mts';
import { Ctx } from '../lib/runtime.mts';

export default async (req: Request, context: Context): Promise<Response> => {
  try {
    const r = await runAggregation(new Ctx(req, context));
    console.log(`[telemetry] 시간 칸 ${r.hours}개 · 원본 ${r.raws}개 모음 · 날 ${r.days.join(',') || '-'} · 남은 칸 ${r.pending} (${r.ms}ms)`);
  } catch (e) {
    console.error(`[telemetry] 모으기 실패: ${e instanceof Error ? e.name : typeof e}`);
  }
  return new Response(null, { status: 204 });
};

export const config: Config = {
  schedule: '@hourly',
};
