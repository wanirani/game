// 테스트용 메모리 Netlify Blobs 저장소 (netlify/lib/runtime.mts 의 KV 인터페이스).
// 실제 Blobs 와 같은 제약을 흉내 낸다: 저장소 이름 64바이트, 키 600바이트, 메타데이터 2KB, 조건부 쓰기(onlyIfNew / onlyIfMatch).
// 모든 연산은 한 번 양보(setImmediate)한 뒤 실행되어 동시 요청이 실제처럼 섞인다.

const enc = new TextEncoder();
const tick = () => new Promise((r) => setImmediate(r));

export function createMemoryBackend() {
  /** fullKey `${scope}\u0000${store}\u0000${key}` → { body: string, metadata: object, etag: string } */
  const data = new Map();
  let seq = 0;
  const backend = {
    data,
    failAll: false, // true(또는 오류 문구 문자열)면 모든 연산이 예외 (내부 오류 처리 확인용)
    ops: 0,
    /** 테스트용 가로채기: 각 연산 직전에 await hook(op, store, key) — 경합 순서를 결정적으로 재현할 때 쓴다 */
    hook: null,
    factory(name, deployContext) {
      if (typeof name !== 'string' || name === '' || name.includes('/') || enc.encode(name).length > 64) throw new Error(`bad store name ${name}`);
      const scope = deployContext === 'production' ? 'site' : `deploy:${deployContext ?? 'none'}`;
      return new MemStore(backend, scope, name, () => `"m${++seq}"`);
    },
    /** 저장된 모든 값과 메타데이터를 문자열로 (평문 비밀 검사용) */
    dump() {
      return [...data.entries()].map(([k, v]) => `${k}\n${v.body}\n${JSON.stringify(v.metadata)}`).join('\n');
    },
    keys(scope = 'site', store) {
      return [...data.keys()].map((k) => k.split('\u0000')).filter(([s, st]) => s === scope && (!store || st === store)).map(([, st, key]) => `${st}/${key}`);
    },
  };
  return backend;
}

function checkKey(key) {
  if (typeof key !== 'string' || key === '') throw new Error('Blob key must not be empty.');
  if (key.startsWith('/') || key.startsWith('%2F')) throw new Error('Blob key must not start with forward slash (/).');
  if (enc.encode(key).length > 600) throw new Error('Blob key must be at most 600 bytes.');
}

class MemStore {
  constructor(backend, scope, name, nextEtag) {
    this.b = backend;
    this.name = name;
    this.prefix = `${scope}\u0000${name}\u0000`;
    this.nextEtag = nextEtag;
  }
  async op(key, name = 'op') {
    await tick();
    if (this.b.hook) await this.b.hook(name, this.name, key);
    this.b.ops++;
    if (this.b.failAll) throw new Error(typeof this.b.failAll === 'string' ? this.b.failAll : 'simulated storage outage');
    if (key !== undefined) checkKey(key);
  }
  async get(key, opts = {}) {
    await this.op(key, 'get');
    const e = this.b.data.get(this.prefix + key);
    if (!e) return null;
    return opts.type === 'json' ? JSON.parse(e.body) : e.body;
  }
  async getWithMetadata(key, opts = {}) {
    await this.op(key, 'getWithMetadata');
    const e = this.b.data.get(this.prefix + key);
    if (!e) return null;
    return { data: opts.type === 'json' ? JSON.parse(e.body) : e.body, etag: e.etag, metadata: structuredClone(e.metadata) };
  }
  async getMetadata(key) {
    await this.op(key, 'getMetadata');
    const e = this.b.data.get(this.prefix + key);
    return e ? { etag: e.etag, metadata: structuredClone(e.metadata) } : null;
  }
  async setJSON(key, value, opts = {}) {
    await this.op(key, 'setJSON');
    const metadata = opts.metadata ?? {};
    const encoded = 'b64;' + Buffer.from(JSON.stringify(metadata)).toString('base64');
    if ('netlify-blobs-metadata'.length + encoded.length > 2048) throw new Error('Metadata object exceeds the maximum size');
    const cur = this.b.data.get(this.prefix + key);
    if (opts.onlyIfNew && cur) return { modified: false };
    if (opts.onlyIfMatch !== undefined && (!cur || cur.etag !== opts.onlyIfMatch)) return { modified: false };
    const etag = this.nextEtag();
    this.b.data.set(this.prefix + key, { body: JSON.stringify(value), metadata: structuredClone(metadata), etag });
    return { modified: true, etag };
  }
  async delete(key) {
    await this.op(key, 'delete');
    this.b.data.delete(this.prefix + key);
  }
  async list(opts = {}) {
    await this.op(undefined, 'list');
    const p = this.prefix + (opts.prefix ?? '');
    const blobs = [...this.b.data.entries()].filter(([k]) => k.startsWith(p)).map(([k, v]) => ({ key: k.slice(this.prefix.length), etag: v.etag }));
    return { blobs, directories: [] };
  }
}
