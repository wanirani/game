// s23 늑대 고개 (외전 「빈칸의 현상금」) — 작업 중 (EX3-MAP): 곧 실제 방으로 바뀐다
export const ROOMS = {
  r1: { name: '늑대 고개 들머리', map: ['#    ', '# P  ', '#####'], exitRight: 'boss' },
  boss: { name: '얼음 수도원 앞뜰', map: ['#     #', '# P X #', '#######'], gimmick: null, boss: true, bossId: 'b_hagen' },
};
