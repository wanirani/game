// STUB (W0 SKEL) — owner: STORY-P2-A
// 2부 스토리 A: 프롤로그, 14~17장, 엔딩, 크레딧 (world2 §1.3–1.7). story.js 를 import 하지 않는다 (순환 금지).
//  SCRIPTS_P2 = { ...이 파일의 스크립트, ...SCRIPTS_P2B }   → data/story.js 끝에서 SCRIPTS 에 합쳐진다
//  CREDITS_P2 = [...]                                     → story.js 의 creditsFor 가 읽는다 (STORY-P2-A)
// 스텁: 스크립트 없음.
import { SCRIPTS_P2B } from './story_p2b.js';

export const SCRIPTS_P2 = { ...SCRIPTS_P2B };
export const CREDITS_P2 = [];
