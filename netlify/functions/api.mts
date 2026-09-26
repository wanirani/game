// 블러드 녹턴 계정·클라우드 저장 API (Netlify Functions + Netlify Blobs).
// 경로·데이터 모델·보안 설계는 docs/ACCOUNTS.md 참고. 공용 코드는 netlify/lib/*.mts (함수로 배포되지 않는다).
import type { Config, Context } from '@netlify/functions';
import { handle } from '../lib/router.mts';

export default async (req: Request, context: Context): Promise<Response> => handle(req, context);

export const config: Config = {
  path: '/api/*',
};
