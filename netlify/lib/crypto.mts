// 암호 관련: scrypt 비밀번호/복구 코드 해시, 세션 토큰, 복구 코드 생성, IP 키.
// 선택 환경 변수 AUTH_PEPPER: 설정하면 비밀번호·복구 코드를 HMAC-SHA256(pepper) 한 뒤 scrypt 한다.
// (한 번 설정하면 바꾸거나 지우지 말 것 — 기존 계정이 로그인할 수 없게 된다)
import { scrypt, randomBytes, timingSafeEqual, createHash, createHmac } from 'node:crypto';
import { SCRYPT } from './config.mts';
import { env } from './runtime.mts';

export interface SecretHash {
  alg: 'scrypt';
  N: number;
  r: number;
  p: number;
  len: number;
  salt: string; // base64
  hash: string; // base64
  pep: 0 | 1; // AUTH_PEPPER 적용 여부
}

function derive(input: Buffer, salt: Buffer, len: number, N: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(input, salt, len, { N, r, p, maxmem: SCRYPT.maxmem }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

function prepare(secret: string, usePepper: boolean): Buffer | null {
  const s = secret.normalize('NFC');
  if (!usePepper) return Buffer.from(s, 'utf8');
  const pepper = env('AUTH_PEPPER');
  if (!pepper) return null;
  return createHmac('sha256', pepper).update(s, 'utf8').digest();
}

export async function hashSecret(secret: string): Promise<SecretHash> {
  const usePepper = !!env('AUTH_PEPPER');
  const salt = randomBytes(SCRYPT.saltLen);
  const key = await derive(prepare(secret, usePepper) as Buffer, salt, SCRYPT.keyLen, SCRYPT.N, SCRYPT.r, SCRYPT.p);
  return { alg: 'scrypt', N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, len: SCRYPT.keyLen, salt: salt.toString('base64'), hash: key.toString('base64'), pep: usePepper ? 1 : 0 };
}

function saneParams(h: SecretHash | undefined | null): h is SecretHash {
  if (!h || h.alg !== 'scrypt' || typeof h.salt !== 'string' || typeof h.hash !== 'string') return false;
  const powerOf2 = Number.isInteger(h.N) && h.N >= 1024 && h.N <= 1 << 20 && (h.N & (h.N - 1)) === 0;
  return powerOf2 && Number.isInteger(h.r) && h.r >= 1 && h.r <= 32 && Number.isInteger(h.p) && h.p >= 1 && h.p <= 8
    && Number.isInteger(h.len) && h.len >= 16 && h.len <= 128;
}

let warnedPepper = false;

/** 저장된 해시와 비교 (항상 scrypt 한 번 분량의 시간을 쓴다) */
export async function verifySecret(secret: string, h: SecretHash | undefined | null): Promise<boolean> {
  if (!saneParams(h)) { await burn(secret); return false; }
  const input = prepare(secret, h.pep === 1);
  if (!input) {
    if (!warnedPepper) { console.error('[accounts] AUTH_PEPPER 가 설정되지 않아 pepper 를 쓴 해시를 검증할 수 없습니다'); warnedPepper = true; }
    await burn(secret);
    return false;
  }
  const expected = Buffer.from(h.hash, 'base64');
  const actual = await derive(input, Buffer.from(h.salt, 'base64'), h.len, h.N, h.r, h.p);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

const DUMMY_SALT = Buffer.alloc(SCRYPT.saltLen, 7);
/** 없는 계정이나 형식이 틀린 코드에도 같은 시간을 쓰게 하는 가짜 검증 */
export async function burn(secret: string): Promise<void> {
  await derive(Buffer.from(String(secret).normalize('NFC'), 'utf8'), DUMMY_SALT, SCRYPT.keyLen, SCRYPT.N, SCRYPT.r, SCRYPT.p);
}

/** 매개변수·pepper 설정이 현재와 다르면 true (로그인 성공 시 재해시) */
export function needsRehash(h: SecretHash): boolean {
  return h.N !== SCRYPT.N || h.r !== SCRYPT.r || h.p !== SCRYPT.p || h.len !== SCRYPT.keyLen || h.pep !== (env('AUTH_PEPPER') ? 1 : 0);
}

// ── 세션 토큰 ──
/** 32바이트 난수 → base64url 43자 */
export function newToken(): string { return randomBytes(32).toString('base64url'); }
export const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
export function sha256hex(s: string): string { return createHash('sha256').update(s, 'utf8').digest('hex'); }

/** 계정 내부 식별자 (저장 데이터 키에 쓴다 — 같은 아이디로 재가입해도 이전 데이터와 섞이지 않는다) */
export function newUid(): string { return randomBytes(16).toString('hex'); }

// ── 복구 코드: Crockford Base32 16자 (80비트), XXXX-XXXX-XXXX-XXXX ──
const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export function newRecoveryCode(): string {
  const bytes = randomBytes(10);
  let bits = 0;
  let acc = 0;
  let out = '';
  for (const b of bytes) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(acc >>> (bits - 5)) & 31];
      bits -= 5;
    }
    acc &= (1 << bits) - 1;
  }
  return out.match(/.{4}/g)!.join('-');
}

/** 사용자가 입력한 복구 코드를 정규화 (대소문자·공백·하이픈 무시, O→0, I/L→1). 형식이 틀리면 null */
export function normalizeRecoveryCode(input: unknown): string | null {
  if (typeof input !== 'string' || input.length > 64) return null;
  const s = input.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  return /^[0-9A-HJKMNP-TV-Z]{16}$/.test(s) ? s : null;
}

/** IP 를 그대로 저장하지 않도록 키로 바꾼다 */
export function ipKey(ip: string): string {
  const pepper = env('AUTH_PEPPER');
  const h = pepper ? createHmac('sha256', pepper).update('ip:' + ip) : createHash('sha256').update('bn-ip:' + ip);
  return h.digest('hex').slice(0, 40);
}
