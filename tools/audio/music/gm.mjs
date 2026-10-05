// 게임 악기(INST) → General MIDI 프로그램 매핑 (FluidR3_GM, 0 기반 프로그램 번호)
// pick(inst, cd, stats, track) — 음역(stats.min/med)·패턴(gen)·트랙 성격(기타 유무)을 보고 고른다.
// 트랙/채널별 덮어쓰기: OVERRIDE['트랙.채널'] = { prog, vol(배율), rev, cho }
export const GM_NAME = {
  0: 'Acoustic Grand Piano', 6: 'Harpsichord', 8: 'Celesta', 10: 'Music Box', 14: 'Tubular Bells', 19: 'Church Organ',
  29: 'Overdriven Guitar', 30: 'Distortion Guitar', 32: 'Acoustic Bass', 33: 'Electric Bass (finger)', 35: 'Fretless Bass',
  40: 'Violin', 41: 'Viola', 42: 'Cello', 45: 'Pizzicato Strings', 47: 'Timpani', 48: 'String Ensemble 1', 49: 'String Ensemble 2 (slow)',
  52: 'Choir Aahs', 53: 'Voice Oohs', 56: 'Trumpet', 57: 'Trombone', 60: 'French Horn', 61: 'Brass Section',
  68: 'Oboe', 70: 'Bassoon', 71: 'Clarinet', 73: 'Flute', 110: 'Fiddle', 116: 'Taiko Drum',
};
export const KIT_NAME = { 0: 'Standard Kit', 16: 'Power Kit', 48: 'Orchestra Kit' };

// 현악 리드 음역 선택 (바이올린 G3↑ / 비올라 C3↑ / 첼로)
const bowed = (s, top = 40) => (s.min >= 55 && top === 40 ? 40 : s.min >= 48 ? 41 : 42);

export function pick(inst, cd, s, track) {
  switch (inst) {
    case 'organ': return 19;
    case 'organ2': return 73;
    case 'harpsi': return 6;
    case 'piano': return 0;
    case 'strings': return cd.gen === 'pad' ? 49 : 48;
    case 'choir': return cd.vowel === 'o' ? 53 : 52;
    case 'lead': case 'sawlead': return bowed(s, 40);
    case 'lead2': return s.med >= 76 && s.min >= 55 ? 40 : bowed(s, 41);
    case 'fiddle': return 110;
    case 'reed': return s.med >= 64 ? 68 : s.med >= 50 ? 71 : 70;
    case 'brass': return cd.gen ? 61 : s.med >= 70 ? 56 : s.med < 50 ? 57 : 61;
    case 'bass': return 33;
    case 'fbass': return 35;
    case 'pizz': return 45;
    case 'bells': return 14;
    case 'celesta': return 8;
    case 'musicbox': return 10;
    case 'timp': return 47;
    case 'gtr': return 30;
    default: return 40;
  }
}

// 코러스 송신 (CC93) — 패드류만 넉넉히
export const CHORUS = { 49: 48, 48: 36, 52: 44, 53: 44, 19: 24, 73: 16, 40: 14, 41: 14, 42: 12, 110: 10, 61: 18, 60: 18, 56: 10, 57: 10, 0: 8, 6: 10, 8: 14, 10: 14, 45: 10, 68: 10, 71: 10, 70: 8 };

// 드럼 레인 → GM 타악기 키 (ch10). z(심저음 붐)는 Taiko 채널로 따로 보낸다
export const LANE_KEY = { k: 36, s: 38, h: 42, o: 46, c: 49, r: 51, t: 50, m: 47, f: 43, p: 39, j: 70, w: 76, a: 53 };
// 레인별 세기 배율 (게임 킷의 상대 음량: 하이햇·심벌은 GM 킷보다 작게 섞여 있다)
export const LANE_VEL = { k: 1, s: 0.92, h: 0.62, o: 0.62, c: 0.72, r: 0.62, t: 0.85, m: 0.85, f: 0.85, p: 0.8, j: 0.55, w: 0.7, a: 0.75, z: 1 };

// 드럼 킷: 기타가 있는 록/메탈 곡 → Power, 킥·스네어·심벌·붐만 쓰는 관현악 곡 → Orchestra, 그 밖 → Standard
export function pickKit(lanes, hasGtr) {
  if (hasGtr) return 16;
  if ([...lanes].every((l) => 'kscz'.includes(l))) return 48;
  return 0;
}

// 곡별 손질 (스펙트로그램/음량 점검 결과 반영)
export const OVERRIDE = {
};
