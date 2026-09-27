// T2 painted puppet: 사슬 간수 (chain_warden) — 작업 중 (ENEMY-P2-C-ART). 아직 등록 전: drawHookZone 은 벡터 사슬을 쓰게 false.
export const spec = { id: 'chain_warden', tier: 'T2', src: 'chain_warden', bake: { outline: 0.45 } };
export function draw() {}
export function drawHookZone() { return false; }
