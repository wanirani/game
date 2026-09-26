// STUB (W0 SKEL) — owner: CMP-UI
// 메뉴 탭 「동료」 (companions §7.2; MENU_TABS 줄은 PLAT-MENU 가 'class' 다음에 추가한다).
// 스텁: '준비 중' 안내만 그린다.
import { Tab } from './base.js';
import { text, FONT } from '../../core/ui.js';

export class CompanionsTab extends Tab {
  get wantsFocus() { return false; }
  render(ctx, A) {
    const cx = A.x + A.w / 2, cy = A.y + A.h / 2;
    text(ctx, '동료', cx, cy - 12, { size: 22, align: 'center', weight: 800, family: FONT.title, color: '#e8c872' });
    text(ctx, '준비 중', cx, cy + 18, { size: 15, align: 'center', weight: 600, color: '#a89880' });
  }
}
