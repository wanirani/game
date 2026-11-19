// Shops: what a keeper sells for silver (the coins of jars and crates - docs/v2/PLAY_API.md 13). Shape: docs/v2/DATA_FORMAT.md section 7b.
// One table, easy to change: the owner has not decided an economy. A good is `{ id, name, line, price, limit, icon, use }`:
//   price  silver                         limit  how many the hero may carry / keep lit at once (0 = no limit of its own)
//   icon   a name of src/v2/ui/icons.js   use    what it does (the scene's story host knows these three and nothing else):
//     'draught'  carried; when the hero would fall it is used by itself - he stands where he is with one candle of health, untouchable for 1.2 s
//                (rules: src/v2/play/sim.js _die; a draught used is not a fall)
//     'reso'     used at once: the resonance gauge is full (refused while it is full already, or before the hero carries the bell shard)
//     'guide'    lit at once: while the hero stays in this place (both its nights) a second line under the objective names where the nearest
//                blank of the chronicle can be filled (CHRONICLE[id].place; refused when no blank can be filled now)
// The story opens a shop with the step ['shop', id] (events.js ev_rook_shop: the spot rook_shop of both nights of Eshville).
// Prices against the jars (measured 2026-11-19, tools: the areas' breakables x DROP_TABLE): one pass through both nights of the village is 46 things,
// about 44 silver from coin drops (+ up to 2 for every heal / resonance piece taken while full) -> two or three goods in the first hour.

export const SHOP = {
  rook: {
    id: 'rook', keeper: 'rook', title: '로크의 보따리',
    // his line on the screen: one per night (he stands in both)
    line: {
      now: '불난 마을에서 물건 구하기가 어디 쉽습죠.\n값은 은화로만 받습니다요. 헤헤.',
      past: '역병 도는 마을에서 물건 구하기가 어디 쉽습죠.\n값은 은화로만 받습니다요. 헤헤.',
    },
    // what he says to a purchase and to each refusal (one short line, shown in place of his greeting)
    say: {
      bought: '헤헤, 잘 고르셨습죠, 나리.',
      poor: '은화가 모자랍니다요, 나리.',
      full: '그건 더 못 들고 가십니다요.',
      none: '지금은 쓸 데가 없는 물건입죠.',
    },
    goods: [
      { id: 'draught', name: '성수 한 병', line: '쓰러질 때 저절로 쓰인다. 촛불 한 자루로 다시 선다', price: 20, limit: 2, icon: 'draught', use: 'draught' },
      { id: 'bell_oil', name: '종 기름', line: '울림 눈금이 그 자리에서 가득 찬다', price: 12, limit: 0, icon: 'oil', use: 'reso' },
      { id: 'guide_candle', name: '길잡이 초', line: '이 고장에 머무는 동안 가까운 빈칸의 자리를 일러 준다', price: 8, limit: 1, icon: 'guide', use: 'guide' },
    ],
  },
};
