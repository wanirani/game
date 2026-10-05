// 공개 별명 (docs/specs/online.md §0·§2.6). 순위표에는 로그인 아이디 대신 이것만 보인다.
//  - 2~12자 한글·영문·숫자·_, 금칙어·운영자 사칭·자기 로그인 아이디가 들어간 별명 금지. 겹치면 '#숫자' 를 붙인다. 자동: '헌터#1234'
//  - 중복 방지: bn-nicks <소문자 별명 UTF-8 hex> = {uid, id, nick, at} 을 onlyIfNew 로 잡는다 (대소문자 무시).
//    주인 계정이 없거나 별명이 바뀐 항목(1분 넘게 지난 것)은 다른 계정이 가져갈 수 있고, 매일 정리 함수가 지운다.
// 계정 모듈을 import 하지 않는다 (탈퇴가 releaseNick 을 부른다). 사용자 레코드 수정은 부르는 쪽(online.mts)이 updateUser 로 한다.
import { randomInt } from 'node:crypto';
import { STORES } from './config.mts';
import { fail } from './http.mts';
import { now } from './runtime.mts';
import type { Ctx, KV } from './runtime.mts';

const NICK_RE = /^[가-힣A-Za-z0-9_]{2,12}$/;
/** 저장된 별명 (사용자가 정한 것 + 겹쳐서 붙은 '#숫자') */
export const STORED_NICK_RE = /^[가-힣A-Za-z0-9_]{2,12}(?:#\d{1,6})?$/;
export const AUTO_BASE = '헌터';

/** 들어 있으면 안 되는 말 (소문자, '_'·숫자를 뺀 뒤 부분 일치). 짧고 흔한 영어 조각(ass 등)은 정상 단어를 막아 넣지 않는다 */
const BANNED_PARTS: readonly string[] = [
  // 한국어 욕설·비하
  '시발', '씨발', '씨바', '시바', '씨팔', '시팔', '쓰발', '병신', '븅신', '빙신', '좆', '존나', '졸라', '개새', '새끼', '쌔끼',
  '미친놈', '미친년', '닥쳐', '꺼져', '엠창', '느금', '니미', '니애미', '애미', '애비', '창녀', '걸레', '보지', '자지', '섹스',
  '강간', '한남', '김치녀', '틀딱', '장애인', '정신병', '일베', '홍어', '쪽바리', '짱깨',
  // 영어
  'fuck', 'fuk', 'shit', 'bitch', 'cunt', 'nigger', 'nigga', 'faggot', 'retard', 'whore', 'slut', 'dick', 'pussy', 'penis',
  'vagina', 'rapist', 'nazi', 'hitler', 'porn', 'sex',
  // 운영자 사칭
  '운영자', '운영진', '관리자', '개발자', '공식', 'admin', 'official', 'moderator',
];
/** 정확히 같으면 안 되는 별명 (소문자) */
const BANNED_EXACT: readonly string[] = ['gm', 'staff', 'system', 'root', 'null', 'undefined', '시스템', '스태프', '지엠', 'guest', '게스트'];

export function isBannedNick(n: string): boolean {
  const low = n.toLowerCase();
  if (BANNED_EXACT.includes(low)) return true;
  const flat = low.replace(/[_0-9]/g, '');
  return BANNED_PARTS.some((p) => flat.includes(p));
}

/** PUT 으로 받은 별명 검사 → 정규화한 별명 (실패 시 400) */
export function checkNick(raw: unknown, id: string): string {
  if (typeof raw !== 'string' || raw.length > 64) fail('invalid_nick', 400);
  const n = (raw as string).normalize('NFC').trim();
  if (!NICK_RE.test(n)) fail('invalid_nick', 400);
  // 순위표는 공개다 — 로그인 아이디(비밀번호 추측의 절반)가 드러나지 않게
  if (id && n.toLowerCase().includes(id)) fail('nick_is_id', 400);
  if (isBannedNick(n)) fail('banned_nick', 400);
  return n;
}

/** 저장소 키: 소문자 별명의 UTF-8 hex (키에 '#'·한글을 쓰지 않는다 — 주소·파일 경로에 안전하게) */
export const nickKey = (nick: string): string => Buffer.from(nick.normalize('NFC').toLowerCase(), 'utf8').toString('hex');
export const nickOfKey = (key: string): string => Buffer.from(key, 'hex').toString('utf8');

interface NickRec { uid: string; id: string; nick: string; at: number }

/** 이 별명 항목이 버려졌는가: 주인 계정이 없거나, 주인의 지금 별명이 이것이 아님 (막 잡는 중인 것은 graceMs 동안 보호) */
export async function nickStale(c: Ctx, key: string, rec: NickRec | null, t: number, graceMs: number): Promise<boolean> {
  if (!rec || typeof rec.uid !== 'string' || typeof rec.id !== 'string') return true;
  if (!(t - Number(rec.at) > graceMs)) return false;
  const u = await c.store(STORES.users).get(rec.id, { type: 'json' });
  return !u || u.uid !== rec.uid || typeof u.nick !== 'string' || nickKey(u.nick) !== key;
}

/**
 * 별명 자리 잡기: 비었거나, 이미 내 것이거나, 버려진 항목이면 내 것으로 쓰고 true.
 * (사용자 레코드에 넣는 것은 부르는 쪽 — 실패하면 releaseNick 으로 돌려준다)
 */
export async function reserveNick(c: Ctx, nick: string, owner: { uid: string; id: string }): Promise<boolean> {
  const st: KV = c.store(STORES.nicks);
  const key = nickKey(nick);
  const t = now();
  const rec: NickRec = { uid: owner.uid, id: owner.id, nick, at: t };
  if ((await st.setJSON(key, rec, { onlyIfNew: true })).modified) return true;
  const cur = await st.getWithMetadata(key, { type: 'json' });
  if (!cur) return (await st.setJSON(key, rec, { onlyIfNew: true })).modified;
  const data = cur.data as NickRec | null;
  if (data?.uid === owner.uid || (await nickStale(c, key, data, t, 60_000))) {
    return (await st.setJSON(key, rec, cur.etag ? { onlyIfMatch: cur.etag } : {})).modified;
  }
  return false;
}

/** 내 별명 항목이면 지운다 */
export async function releaseNick(c: Ctx, nick: string | null | undefined, uid: string): Promise<void> {
  if (typeof nick !== 'string' || !nick) return;
  const st = c.store(STORES.nicks);
  const key = nickKey(nick);
  const cur = (await st.get(key, { type: 'json' })) as NickRec | null;
  if (cur && cur.uid === uid) await st.delete(key);
}

/** 별명 후보: 원하는 것 → (지금 별명이 '원하는 것#숫자' 면 그대로) → '#숫자 4자리' 20번 → 6자리 20번. 원하는 것이 없으면 '헌터#숫자' */
export function* nickCandidates(want: string | null, current: string | null): Generator<string> {
  const base = want ?? AUTO_BASE;
  if (want) yield want;
  if (current && current.toLowerCase().startsWith(`${base.toLowerCase()}#`)) yield current;
  for (let i = 0; i < 20; i++) yield `${base}#${randomInt(1000, 10000)}`;
  for (let i = 0; i < 20; i++) yield `${base}#${randomInt(100000, 1000000)}`;
}

/** 매일 정리 (cleanup.mts): 버려진 별명 항목 (주인이 탈퇴했거나 별명을 바꿨는데 지우지 못한 것, 1시간 지난 것) */
export async function sweepNicks(c: Ctx, t: number, maxPerRun: number, concurrency: number): Promise<{ seen: number; deleted: number }> {
  const st = c.store(STORES.nicks);
  const keys = (await st.list()).blobs.map((b) => b.key).slice(0, maxPerRun);
  let deleted = 0;
  for (let i = 0; i < keys.length; i += concurrency) {
    await Promise.all(keys.slice(i, i + concurrency).map(async (k) => {
      let rec: NickRec | null = null;
      try { rec = (await st.get(k, { type: 'json' })) as NickRec | null; } catch { rec = null; }
      if (await nickStale(c, k, rec, t, 3_600_000)) { await st.delete(k); deleted++; }
    }));
  }
  return { seen: keys.length, deleted };
}
