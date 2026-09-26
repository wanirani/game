// [임시] 상점 데이터 — 아이템 담당이 구현
//  shopStock(chapter) → [{ baseId, rarity, price }]  (떠돌이 상인 로크)
//  smithStock(chapter) → [{ baseId, rarity, price }] (대장장이 하드윈: 무기·방어구)
export function shopStock(chapter) { return [{ baseId: 'c_potion', rarity: 0, price: 60 }]; }
export function smithStock(chapter) { return []; }
