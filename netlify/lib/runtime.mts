// 실행 환경 추상화: Blobs 저장소, 시계, 환경 변수, 요청 정보.
// 운영 배포(production)는 사이트 전역 저장소(getStore), 그 밖의 배포(미리보기·브랜치·로컬 dev)는
// 배포별 저장소(getDeployStore)를 써서 테스트 데이터가 운영 데이터에 섞이지 않게 한다.
// 테스트는 setStoreFactory / setClock 으로 메모리 저장소와 가짜 시계를 주입한다.
import { getStore, getDeployStore } from '@netlify/blobs';
import type { Context } from '@netlify/functions';

/** 이 API 가 쓰는 Blobs Store 메서드만 추린 형태 (테스트용 메모리 저장소도 이것만 구현하면 된다) */
export interface KV {
  get(key: string, options: { type: 'json' }): Promise<any>;
  getWithMetadata(key: string, options: { type: 'json' }): Promise<{ data: any; etag?: string; metadata: Record<string, unknown> } | null>;
  getMetadata(key: string): Promise<{ etag?: string; metadata: Record<string, unknown> } | null>;
  setJSON(key: string, data: unknown, options?: { metadata?: Record<string, unknown>; onlyIfNew?: boolean; onlyIfMatch?: string }): Promise<{ modified: boolean; etag?: string }>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string }): Promise<{ blobs: { key: string; etag: string }[]; directories: string[] }>;
}

export type StoreFactory = (name: string, deployContext: string | undefined) => KV;

let storeFactory: StoreFactory | null = null;
let clock: () => number = () => Date.now();

/** 테스트 전용: 저장소 생성 함수를 바꾼다 (null 이면 실제 Netlify Blobs) */
export function setStoreFactory(f: StoreFactory | null): void { storeFactory = f; }
/** 테스트 전용: 현재 시각(ms) 함수를 바꾼다 */
export function setClock(f: (() => number) | null): void { clock = f ?? (() => Date.now()); }
export function now(): number { return clock(); }

/** 환경 변수 (비밀 값은 반드시 Netlify.env 로만 읽는다) */
export function env(name: string): string | undefined {
  try {
    const v = globalThis.Netlify?.env?.get(name);
    return typeof v === 'string' && v !== '' ? v : undefined;
  } catch {
    return undefined;
  }
}

function openStore(name: string, deployContext: string | undefined): KV {
  if (storeFactory) return storeFactory(name, deployContext);
  if (deployContext === 'production') return getStore(name, { consistency: 'strong' }) as unknown as KV;
  return getDeployStore(name, { consistency: 'strong' }) as unknown as KV;
}

/** 요청 하나의 처리 문맥 */
export class Ctx {
  req: Request;
  ip: string;
  deployContext: string | undefined;
  cache: Map<string, KV>;
  constructor(req: Request, context: Context | undefined) {
    this.req = req;
    const nc = (globalThis.Netlify?.context ?? context) as Context | null | undefined;
    this.deployContext = nc?.deploy?.context ?? context?.deploy?.context;
    // context.ip 는 Netlify 가 채우는 실제 접속 IP. 클라이언트가 보낸 X-Forwarded-For 는 믿지 않는다.
    this.ip = (context?.ip || nc?.ip || req.headers.get('x-nf-client-connection-ip') || 'unknown').slice(0, 64);
    this.cache = new Map();
  }
  store(name: string): KV {
    let s = this.cache.get(name);
    if (!s) { s = openStore(name, this.deployContext); this.cache.set(name, s); }
    return s;
  }
}
