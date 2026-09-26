// 메뉴 탭 공통 기반 클래스
//  update(dt, nav, ges, focused) : 매 틱 호출 (focused=false 면 포인터 입력만 처리 권장)
//  render(ctx, A)                : A = 본문 영역 {x,y,w,h}
//  hints(focused)                : 하단 키 안내 [[키, 설명], ...]
//  wantsFocus                    : false 면 ↓/확인으로 본문 진입하지 않음
export class Tab {
  constructor(m) { this.m = m; this.t = 0; }
  get game() { return this.m.game; }
  get state() { return this.m.state; }
  get hero() { return this.m.hero; }
  get world() { return this.m.world; }
  get wantsFocus() { return true; }
  onShow() {}
  onHide() {}
  update(dt, nav, ges, focused) {}
  render(ctx, A) {}
  hints(focused) { return []; }
  free() {}
}
