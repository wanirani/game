// 계정 운영 도구 (운영 사이트의 Netlify Blobs 에 Netlify API 토큰으로 직접 접근한다. HTTP API 에는 관리자 기능이 없다)
//
//   NETLIFY_SITE_ID=<사이트 ID> NETLIFY_AUTH_TOKEN=<개인 액세스 토큰> [AUTH_PEPPER=<운영과 같은 값>] \
//     node tools/accounts/admin.mjs <명령> <아이디>
//
// 명령:
//   show   <아이디>  계정 상태 (생성일, 세션 수, 잠금, 슬롯 요약) — 해시·토큰은 표시하지 않음
//   unlock <아이디>  로그인·복구 코드 잠금 해제
//   revoke <아이디>  모든 기기에서 로그아웃
//   reset  <아이디>  임시 비밀번호 + 새 복구 코드 발급 (모든 세션 폐기). 반드시 본인 확인 뒤 사용자에게만 전달
//   delete <아이디>  계정과 저장 데이터 전부 삭제 (되돌릴 수 없음, --yes 필요)
//
// 운영(production) 저장소(getStore)만 다룬다. 미리보기 배포의 데이터는 배포별 저장소라 배포를 지우면 함께 사라진다.
// AUTH_PEPPER 를 운영에서 쓰고 있다면 reset 때 같은 값을 넣는다 (넣지 않아도 첫 로그인 때 자동으로 다시 해시된다).
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const [cmd, id, ...rest] = process.argv.slice(2);
const USAGE = '사용법: node tools/accounts/admin.mjs <show|unlock|revoke|reset|delete> <아이디> [--yes]';
if (!cmd || !id) { console.error(USAGE); process.exit(2); }
const siteID = process.env.NETLIFY_SITE_ID;
const token = process.env.NETLIFY_AUTH_TOKEN;
if (!siteID || !token) { console.error('NETLIFY_SITE_ID 와 NETLIFY_AUTH_TOKEN 환경 변수가 필요합니다.'); process.exit(2); }

// lib 는 Netlify.env 로만 환경 변수를 읽으므로 process.env 를 연결한다
globalThis.Netlify = {
  context: null,
  env: {
    get: (k) => process.env[k], set: (k, v) => { process.env[k] = v; }, has: (k) => k in process.env,
    delete: (k) => { delete process.env[k]; }, toObject: () => ({ ...process.env }),
  },
};

const { getStore } = await import('@netlify/blobs');
const rt = await import(path.join(ROOT, 'netlify/lib/runtime.mts'));
const admin = await import(path.join(ROOT, 'netlify/lib/admin.mts'));
rt.setStoreFactory((name) => getStore({ name, siteID, token }));
const c = new rt.Ctx(new Request('https://admin.local/'), { ip: 'admin', deploy: { context: 'production' } });

try {
  switch (cmd) {
    case 'show':
      console.log(JSON.stringify(await admin.adminShow(c, id), null, 2));
      break;
    case 'unlock':
      await admin.adminUnlock(c, id);
      console.log('잠금을 해제했습니다.');
      break;
    case 'revoke':
      console.log(`세션 ${await admin.adminRevokeSessions(c, id)}개를 폐기했습니다.`);
      break;
    case 'reset': {
      const r = await admin.adminResetPassword(c, id);
      console.log(`아이디: ${r.id}\n임시 비밀번호: ${r.tempPassword}\n새 복구 코드: ${r.recoveryCode}\n(이 값은 다시 볼 수 없습니다. 사용자에게 로그인 후 비밀번호를 바꾸라고 안내하세요.)`);
      break;
    }
    case 'delete':
      if (!rest.includes('--yes')) { console.error('정말 지우려면 --yes 를 붙이세요. 되돌릴 수 없습니다.'); process.exit(2); }
      await admin.adminDelete(c, id);
      console.log('계정과 저장 데이터를 삭제했습니다.');
      break;
    default:
      console.error(USAGE);
      process.exit(2);
  }
} catch (e) {
  console.error(`실패: ${e?.message ?? e}`);
  process.exit(1);
}
