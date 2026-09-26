// (작성 중) 임시 탭
import { Tab } from './base.js';
import { frame } from './common.js';
export class SkillsTab extends Tab {
  get wantsFocus() { return false; }
  render(ctx, A) { frame(ctx, A.x, A.y, A.w, A.h); }
}
