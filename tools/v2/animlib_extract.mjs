// v2 animlib: 캐릭터 GLB 에 든 애니메이션 하나를 "뼈대 + 그 클립"만 든 작은 GLB 로 꺼낸다 (메시 · 그림 없음).
//   node tools/v2/animlib_extract.mjs <캐릭터.glb> <애니메이션 이름> <out.glb>
// 쓰임: 다른 캐릭터를 리깅할 때 끼워 산 클립(그 캐릭터 GLB 안에 들어 있다)을 공용 라이브러리의 원본으로 삼을 때.
//   꺼낸 파일을 RAW_DIR 에 <번호>_<이름>.glb 로 두면 animlib_spec.mjs 에서 산 클립과 똑같이 쓴다 (원본 캐릭터 파일이 바뀌어도 영향 없음).
import { readGLB } from './char3d_glbio.mjs';
import * as C from './animlib_core.mjs';
const [src, anim, out] = process.argv.slice(2);
if (!src || !anim || !out) { console.error('usage: animlib_extract.mjs char.glb AnimName out.glb'); process.exit(2); }
const F = C.rawFrames(src, anim), { rig } = C.loadRig(src);
const bytes = C.writeClipGLB(out, readGLB(src).json, [{ name: F.srcName, L: C.toLocal(F, rig) }]);
console.log(`${out}: ${F.srcName} ${F.srcDur.toFixed(2)}초 ${F.n}프레임 · ${bytes} bytes`);
