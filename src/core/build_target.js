// 빌드 대상 (앱 분리, 2026-11-18) — tools/deploy/build_web.mjs --target 이 build-info.js 의 window.__BN_BUILD.target 에 적는다.
//   'all' 개발 트리 · 기본 빌드 (target 이 없다): 예전 그대로 — 2D 게임 + 타이틀 「리빌드 시범」 줄
//   'v1'  2D 앱 「블러드 녹턴」 (com.bloodnocturne.game): 타이틀에서 「리빌드 시범」 줄을 숨긴다 (3D 파일이 없다)
//   '3d'  3D 앱 「블러드 녹턴 3D」 (com.bloodnocturne.game3d): 첫 장면이 3D 고르기 화면(v2pick) — 2D 타이틀·계정 화면 없음,
//         고르기 화면에 「돌아가기」 줄이 없고 안드로이드 뒤로 버튼은 종료 확인 (scene.exitOnBack → MainActivity BACK_PROBE_JS)
const B = typeof window !== 'undefined' ? window.__BN_BUILD : null;
export const BUILD_TARGET = B && (B.target === 'v1' || B.target === '3d') ? B.target : 'all';
export const APP_3D = BUILD_TARGET === '3d';
