// 직업(클래스) 계보: 캐릭터마다 기본(tier0) → 상급 2갈래(tier1, Lv10) → 최상급 각 2갈래(tier2, Lv25) — 7인 × 7 = 49종
// mult: 능력치 배율, flat: 고정 가산, look: 외형 덮어쓰기(render/hero.js 해석), perk: 직업 특성 설명
// 전직은 마을 성당(알베르토 신부)에서 가능
const C = {};
function def(id, o) { C[id] = { id, next: [], mult: {}, flat: {}, look: {}, ...o }; }

// ── 카엘: 채찍 ──
def('kael_hunter', { charId: 'kael', tier: 0, name: '헌터', eng: 'HUNTER', reqLevel: 1, next: ['kael_crusader', 'kael_stalker'],
  desc: '발크레인 가문의 정통 사냥꾼.', perk: '채찍 공격이 부서지는 벽을 한 번에 파괴한다.' });
def('kael_crusader', { charId: 'kael', tier: 1, parent: 'kael_hunter', name: '성광의 사냥꾼', eng: 'CRUSADER', reqLevel: 10, next: ['kael_templar', 'kael_inquisitor'],
  desc: '신성한 빛을 채찍에 두른 사냥꾼.', perk: '채찍 공격에 신성 속성 부여, 신성 피해 +20%',
  mult: { mag: 1.15, res: 1.1 }, flat: { holy: 20 },
  look: { primary: '#d8d0c0', secondary: '#c8a040', trim: '#e8c872', aura: { color: '#fff2b0', type: 'holy' }, headgear: 'circlet' } });
def('kael_templar', { charId: 'kael', tier: 2, parent: 'kael_crusader', name: '성전 기사', eng: 'TEMPLAR', reqLevel: 25,
  desc: '성전의 방패가 된 사냥꾼. 강철 갑주와 성광의 채찍.', perk: '받는 피해 -15%, 피격 시 20% 확률로 성광 폭발',
  mult: { hp: 1.25, def: 1.3, atk: 1.1 }, flat: { dmgReduce: 15, holy: 15 },
  look: { primary: '#e8e4d8', secondary: '#a01020', trim: '#ffd84a', armor: 'holy', armorColor: '#d8dce8', cape: { color: '#f0ece0', color2: '#a01020', len: 1.1 }, aura: { color: '#fff2b0', type: 'holy' }, headgear: 'helm' } });
def('kael_inquisitor', { charId: 'kael', tier: 2, parent: 'kael_crusader', name: '대심문관', eng: 'INQUISITOR', reqLevel: 25,
  desc: '이단을 태우는 심판자. 성화의 채찍이 불길을 남긴다.', perk: '채찍 끝에 성화 폭발, 신성·화염 피해 +25%',
  mult: { atk: 1.2, mag: 1.25 }, flat: { holy: 25, fire: 25, crit: 5 },
  look: { primary: '#1a1418', secondary: '#c01020', trim: '#e8c872', headgear: 'wide_hat', headColor: '#141014', cape: { color: '#1a1418', color2: '#c01020', len: 1.2 }, aura: { color: '#ff9a3a', type: 'fire' } } });
def('kael_stalker', { charId: 'kael', tier: 1, parent: 'kael_hunter', name: '그림자 추적자', eng: 'STALKER', reqLevel: 10, next: ['kael_bloodhunter', 'kael_nightraven'],
  desc: '어둠 속에서 사냥감을 쫓는 추적자.', perk: '이동 속도 +10%, 치명타 +8%',
  mult: { agi: 1.2, atk: 1.08 }, flat: { crit: 8, moveSpd: 10 },
  look: { primary: '#1c1a22', secondary: '#4a1a5a', trim: '#8a8a9a', headgear: 'hood', scarf: { color: '#3a1a4a' } } });
def('kael_bloodhunter', { charId: 'kael', tier: 2, parent: 'kael_stalker', name: '블러드 헌터', eng: 'BLOOD HUNTER', reqLevel: 25,
  desc: '흡혈귀의 피로 힘을 얻은 금기의 사냥꾼.', perk: '흡혈 5%, 체력 50% 이하에서 공격력 +30%',
  mult: { atk: 1.25, hp: 1.1 }, flat: { lifesteal: 5, crit: 6, critDmg: 20 },
  look: { primary: '#2a0a10', secondary: '#c0142a', trim: '#c0142a', eyes: '#ff2030', eyeGlow: true, aura: { color: '#ff2040', type: 'blood' }, headgear: 'hood', cape: { color: '#2a0a10', color2: '#c0142a', len: 1.2 } } });
def('kael_nightraven', { charId: 'kael', tier: 2, parent: 'kael_stalker', name: '나이트 레이븐', eng: 'NIGHT RAVEN', reqLevel: 25,
  desc: '까마귀의 날개를 얻은 공중전의 달인.', perk: '공중 점프 +1, 공중 공격 피해 +30%',
  mult: { agi: 1.3, atk: 1.15 }, flat: { airJumps: 1, moveSpd: 12, crit: 10 },
  look: { primary: '#0e0c14', secondary: '#2a2a44', trim: '#6a6a8a', wings: 'crow', headgear: 'hood', scarf: { color: '#1a1a2a', long: true }, aura: { color: '#6a6aff', type: 'dark' } } });

// ── 세라: 지팡이/성서 ──
def('sera_exorcist', { charId: 'sera', tier: 0, name: '퇴마사', eng: 'EXORCIST', reqLevel: 1, next: ['sera_priestess', 'sera_elementalist'],
  desc: '마를 쫓는 전투 수녀.', perk: '언데드에게 주는 피해 +15%' });
def('sera_priestess', { charId: 'sera', tier: 1, parent: 'sera_exorcist', name: '대사제', eng: 'HIGH PRIESTESS', reqLevel: 10, next: ['sera_saint', 'sera_oracle'],
  desc: '치유와 축복의 권능.', perk: 'HP 재생 +2/초, 회복량 +30%',
  mult: { mag: 1.15, res: 1.2, hp: 1.1 }, flat: { hpRegen: 2, holy: 15 },
  look: { primary: '#ffffff', secondary: '#c8a040', trim: '#ffd84a', headgear: 'tiara', aura: { color: '#fff8d0', type: 'holy' } } });
def('sera_saint', { charId: 'sera', tier: 2, parent: 'sera_priestess', name: '성녀', eng: 'SAINT', reqLevel: 25,
  desc: '천사의 날개가 돋아난 살아있는 성인.', perk: '치명상 1회 무효(스테이지당), 신성 피해 +40%',
  mult: { mag: 1.35, hp: 1.2, res: 1.3 }, flat: { holy: 40, hpRegen: 3 },
  look: { primary: '#ffffff', secondary: '#ffe7a0', trim: '#ffd84a', wings: 'angel', halo: true, headgear: 'tiara', aura: { color: '#fff8d0', type: 'holy' }, cape: { color: '#ffffff', color2: '#ffd84a', len: 1.0 } } });
def('sera_oracle', { charId: 'sera', tier: 2, parent: 'sera_priestess', name: '신탁의 무녀', eng: 'ORACLE', reqLevel: 25,
  desc: '시간의 흐름을 읽는 예언자.', perk: '재사용 대기 -25%, MP 재생 2배',
  mult: { mag: 1.3, mp: 1.4 }, flat: { cdr: 25, mpRegen: 3, luck: 10 },
  look: { primary: '#2a2a5a', secondary: '#e8c872', trim: '#8ac8ff', headgear: 'veil', aura: { color: '#8ac8ff', type: 'ice' }, halo: true } });
def('sera_elementalist', { charId: 'sera', tier: 1, parent: 'sera_exorcist', name: '원소술사', eng: 'ELEMENTALIST', reqLevel: 10, next: ['sera_archmage', 'sera_stormcaller'],
  desc: '화염·냉기·번개를 다루는 전투 마도사.', perk: '원소 피해 +15%',
  mult: { mag: 1.25 }, flat: { fire: 15, ice: 15, thunder: 15 },
  look: { primary: '#3a1a4a', secondary: '#c8a040', trim: '#e8c872', headgear: 'hat', headColor: '#2a1238', aura: { color: '#b98cff', type: 'dark' } } });
def('sera_archmage', { charId: 'sera', tier: 2, parent: 'sera_elementalist', name: '대마법사', eng: 'ARCHMAGE', reqLevel: 25,
  desc: '금서의 비밀을 푼 마법의 정점.', perk: '스킬 피해 +35%, 마법탄 관통',
  mult: { mag: 1.45, mp: 1.3 }, flat: { skillDmg: 35, fire: 20, ice: 20 },
  look: { primary: '#1a0a2a', secondary: '#ff6a2a', trim: '#ffd84a', headgear: 'hat', headColor: '#1a0a2a', aura: { color: '#ff7a2a', type: 'fire' }, cape: { color: '#1a0a2a', color2: '#ff6a2a', len: 1.1 } } });
def('sera_stormcaller', { charId: 'sera', tier: 2, parent: 'sera_elementalist', name: '폭풍의 소환사', eng: 'STORMCALLER', reqLevel: 25,
  desc: '뇌운을 부르는 무녀.', perk: '공격 시 15% 확률로 낙뢰, 번개 피해 +40%',
  mult: { mag: 1.35, agi: 1.2 }, flat: { thunder: 40, moveSpd: 10 },
  look: { primary: '#1a2a4a', secondary: '#bfe0ff', trim: '#bfe0ff', headgear: 'circlet', aura: { color: '#bfe0ff', type: 'thunder' }, eyes: '#bfe0ff', eyeGlow: true } });

// ── 빅터: 총 ──
def('victor_gunslinger', { charId: 'victor', tier: 0, name: '건슬링어', eng: 'GUNSLINGER', reqLevel: 1, next: ['victor_deadeye', 'victor_desperado'],
  desc: '은탄환 쌍권총의 사냥꾼.', perk: '보조무기 권총 탄약 소모 없음' });
def('victor_deadeye', { charId: 'victor', tier: 1, parent: 'victor_gunslinger', name: '데드아이', eng: 'DEADEYE', reqLevel: 10, next: ['victor_phantom', 'victor_executioner'],
  desc: '백발백중의 저격수.', perk: '치명타 +10%, 치명타 피해 +25%',
  mult: { atk: 1.15 }, flat: { crit: 10, critDmg: 25 },
  look: { primary: '#3a3a44', secondary: '#1a1a20', trim: '#c8ccd4', scarf: { color: '#2a2a3a' }, eyes: '#ff4040', eyeGlow: true } });
def('victor_phantom', { charId: 'victor', tier: 2, parent: 'victor_deadeye', name: '팬텀 스나이퍼', eng: 'PHANTOM', reqLevel: 25,
  desc: '유령처럼 사라지는 저격수.', perk: '관통 탄환, 대시 후 1초간 피해 2배',
  mult: { atk: 1.35, agi: 1.2 }, flat: { crit: 12, critDmg: 40, reach: 20 },
  look: { primary: '#141418', secondary: '#4a4a6a', trim: '#9ab0ff', headgear: 'hood', aura: { color: '#9ab0ff', type: 'ice' }, cape: { color: '#141418', color2: '#4a4a6a', len: 1.1 } } });
def('victor_executioner', { charId: 'victor', tier: 2, parent: 'victor_deadeye', name: '처형인', eng: 'EXECUTIONER', reqLevel: 25,
  desc: '약한 적을 확정 처형하는 냉혹한 사냥꾼.', perk: '체력 25% 이하 적에게 피해 +60%',
  mult: { atk: 1.3, hp: 1.1 }, flat: { crit: 8, lifesteal: 3 },
  look: { primary: '#1a0a0a', secondary: '#8a0a0a', trim: '#8a8a8a', headgear: 'mask', aura: { color: '#ff2030', type: 'blood' } } });
def('victor_desperado', { charId: 'victor', tier: 1, parent: 'victor_gunslinger', name: '데스페라도', eng: 'DESPERADO', reqLevel: 10, next: ['victor_hellfire', 'victor_gunlord'],
  desc: '산탄총까지 꺼내 든 무법자.', perk: '마무리 사격이 산탄으로 변화, 공격 속도 +10%',
  mult: { atk: 1.12, hp: 1.1 }, flat: { atkSpd: 10 },
  look: { primary: '#7a3a1a', secondary: '#2a1a10', trim: '#d8a040', scarf: { color: '#b02a1a' }, headgear: 'wide_hat', headColor: '#3a2014' } });
def('victor_hellfire', { charId: 'victor', tier: 2, parent: 'victor_desperado', name: '헬파이어', eng: 'HELLFIRE', reqLevel: 25,
  desc: '지옥불 탄환을 쏘는 총잡이.', perk: '모든 탄환에 화염 폭발, 화염 피해 +40%',
  mult: { atk: 1.3, mag: 1.2 }, flat: { fire: 40 },
  look: { primary: '#2a0a04', secondary: '#ff5a1a', trim: '#ffb040', headgear: 'wide_hat', headColor: '#1a0a04', aura: { color: '#ff7a2a', type: 'fire' }, eyes: '#ff9a3a', eyeGlow: true } });
def('victor_gunlord', { charId: 'victor', tier: 2, parent: 'victor_desperado', name: '건로드', eng: 'GUN LORD', reqLevel: 25,
  desc: '총의 군주. 연사 속도의 극한.', perk: '공격 속도 +30%, 연사 시 탄환 추가',
  mult: { atk: 1.2, agi: 1.35 }, flat: { atkSpd: 30, luck: 10 },
  look: { primary: '#3a3020', secondary: '#c8a040', trim: '#ffd84a', headgear: 'wide_hat', headColor: '#c8a040', cape: { color: '#3a3020', color2: '#c8a040', len: 1.0 }, aura: { color: '#ffd84a', type: 'holy' } } });

// ── 브란: 대검 ──
def('bran_knight', { charId: 'bran', tier: 0, name: '기사', eng: 'KNIGHT', reqLevel: 1, next: ['bran_paladin', 'bran_berserker'],
  desc: '멸망한 은빛 기사단의 기사.', perk: '공격 중 경직 저항' });
def('bran_paladin', { charId: 'bran', tier: 1, parent: 'bran_knight', name: '성기사', eng: 'PALADIN', reqLevel: 10, next: ['bran_guardian', 'bran_crusader'],
  desc: '신의 가호를 받은 기사.', perk: '받는 피해 -10%, 신성 피해 +15%',
  mult: { hp: 1.15, def: 1.2 }, flat: { dmgReduce: 10, holy: 15 },
  look: { primary: '#e8e4d8', secondary: '#2a4a8a', trim: '#e8c872', armor: 'holy', armorColor: '#d8dce8', headgear: 'helm', cape: { color: '#2a4a8a', color2: '#e8c872', len: 1.0 } } });
def('bran_guardian', { charId: 'bran', tier: 2, parent: 'bran_paladin', name: '수호성기사', eng: 'GUARDIAN', reqLevel: 25,
  desc: '결코 쓰러지지 않는 성벽.', perk: '받는 피해 -25%, HP +40%',
  mult: { hp: 1.4, def: 1.5 }, flat: { dmgReduce: 25, hpRegen: 2 },
  look: { primary: '#f0ece0', secondary: '#1a3a7a', trim: '#ffd84a', armor: 'holy', armorColor: '#f0f0f8', headgear: 'helm', halo: true, aura: { color: '#fff2b0', type: 'holy' }, cape: { color: '#1a3a7a', color2: '#ffd84a', len: 1.2 } } });
def('bran_crusader', { charId: 'bran', tier: 2, parent: 'bran_paladin', name: '십자군 총사령', eng: 'CRUSADER LORD', reqLevel: 25,
  desc: '성전의 선봉. 대검에 성광을 두른다.', perk: '대검 공격 시 성광 충격파, 신성 피해 +35%',
  mult: { atk: 1.3, hp: 1.2 }, flat: { holy: 35, reach: 15 },
  look: { primary: '#f0ece0', secondary: '#c01020', trim: '#ffd84a', armor: 'holy', armorColor: '#e8e8f0', headgear: 'crown', aura: { color: '#fff2b0', type: 'holy' }, cape: { color: '#c01020', color2: '#f0ece0', len: 1.2 } } });
def('bran_berserker', { charId: 'bran', tier: 1, parent: 'bran_knight', name: '광전사', eng: 'BERSERKER', reqLevel: 10, next: ['bran_warlord', 'bran_bloodrage'],
  desc: '분노를 힘으로 바꾸는 전사.', perk: '체력이 낮을수록 공격력 증가 (최대 +40%)',
  mult: { atk: 1.2, agi: 1.1 }, flat: { crit: 5 },
  look: { primary: '#4a2a1a', secondary: '#8a1a10', trim: '#8a8a8a', armor: 'leather', armorColor: '#5a3a24', headgear: 'horns', eyes: '#ff4020', eyeGlow: true } });
def('bran_warlord', { charId: 'bran', tier: 2, parent: 'bran_berserker', name: '전쟁군주', eng: 'WARLORD', reqLevel: 25,
  desc: '전장을 지배하는 폭군.', perk: '콤보 10마다 공격력 +5% (최대 +50%)',
  mult: { atk: 1.35, hp: 1.25, def: 1.15 }, flat: { crit: 8, critDmg: 30 },
  look: { primary: '#2a2a2a', secondary: '#a02010', trim: '#c8a040', armor: 'dark', armorColor: '#3a3a40', headgear: 'horns', cape: { color: '#5a0a0a', color2: '#2a0a0a', len: 1.2 }, aura: { color: '#ff5020', type: 'fire' } } });
def('bran_bloodrage', { charId: 'bran', tier: 2, parent: 'bran_berserker', name: '혈귀 광전사', eng: 'BLOODRAGE', reqLevel: 25,
  desc: '악마의 피에 잠식된 광전사.', perk: '흡혈 8%, 공격 속도 +20%',
  mult: { atk: 1.4, agi: 1.2 }, flat: { lifesteal: 8, atkSpd: 20 },
  // cape: null — 브란의 푸른 망토(characters.js)가 악마 날개 위에 그려지지 않게 (HERO-REVIEW #225 / 요청 #349)
  look: { primary: '#1a0a0a', secondary: '#ff1a2a', trim: '#ff1a2a', armor: 'dark', armorColor: '#2a0a0e', headgear: 'horns', wings: 'demon', cape: null, eyes: '#ff1a2a', eyeGlow: true, aura: { color: '#ff1a2a', type: 'blood' }, markings: 'runes' } });

// ── 리아: 단검 ──
def('lia_assassin', { charId: 'lia', tier: 0, name: '암살자', eng: 'ASSASSIN', reqLevel: 1, next: ['lia_ninja', 'lia_dancer'],
  desc: '까마귀 결사의 칼날.', perk: '적의 등 뒤를 공격하면 치명타 확정' });
def('lia_ninja', { charId: 'lia', tier: 1, parent: 'lia_assassin', name: '닌자', eng: 'NINJA', reqLevel: 10, next: ['lia_shadowmaster', 'lia_kunoichi'],
  desc: '동방의 인술을 익힌 그림자.', perk: '대시 거리 +30%, 대시 중 표창 투척',
  mult: { agi: 1.25 }, flat: { moveSpd: 12, crit: 5 },
  look: { primary: '#141420', secondary: '#2a2a4a', trim: '#8a8aa0', headgear: 'mask', scarf: { color: '#2a2a6a', long: true } } });
def('lia_shadowmaster', { charId: 'lia', tier: 2, parent: 'lia_ninja', name: '그림자 군주', eng: 'SHADOW LORD', reqLevel: 25,
  desc: '그림자 분신을 거느린 인술의 정점.', perk: '공격 시 그림자 분신이 따라 벤다',
  mult: { agi: 1.4, atk: 1.25 }, flat: { crit: 10, moveSpd: 15, airJumps: 1 },
  look: { primary: '#0a0a10', secondary: '#4a2a8a', trim: '#b060ff', headgear: 'mask', scarf: { color: '#4a2a8a', long: true }, aura: { color: '#b060ff', type: 'dark' }, eyes: '#b060ff', eyeGlow: true } });
def('lia_kunoichi', { charId: 'lia', tier: 2, parent: 'lia_ninja', name: '카게로우', eng: 'KAGEROU', reqLevel: 25,
  desc: '아지랑이처럼 흔들리는 환영술사.', perk: '피격 시 25% 확률로 환영 회피',
  mult: { agi: 1.35, mag: 1.3 }, flat: { crit: 8, fire: 20 },
  look: { primary: '#2a0a1a', secondary: '#ff4a6a', trim: '#ffb0c0', headgear: 'circlet', scarf: { color: '#ff4a6a', long: true }, aura: { color: '#ff7a9a', type: 'fire' } } });
def('lia_dancer', { charId: 'lia', tier: 1, parent: 'lia_assassin', name: '칼날 무희', eng: 'BLADE DANCER', reqLevel: 10, next: ['lia_bladedancer', 'lia_reaper'],
  desc: '춤추듯 연속 베기를 잇는 검무가.', perk: '콤보 지속 시간 +1초, 공격 속도 +10%',
  mult: { atk: 1.15 }, flat: { atkSpd: 10, critDmg: 15 },
  look: { primary: '#3a0a1a', secondary: '#e8c872', trim: '#e8c872', headgear: null, scarf: { color: '#e8c872', long: true } } });
def('lia_bladedancer', { charId: 'lia', tier: 2, parent: 'lia_dancer', name: '블레이드 댄서', eng: 'BLADE DANCER+', reqLevel: 25,
  desc: '칼날의 폭풍.', perk: '연속 공격 4타째마다 칼날 회오리',
  mult: { atk: 1.35, agi: 1.3 }, flat: { atkSpd: 25, crit: 10 },
  look: { primary: '#5a0a2a', secondary: '#ffd84a', trim: '#ffd84a', headgear: 'tiara', scarf: { color: '#ffd84a', long: true }, aura: { color: '#ffd84a', type: 'holy' } } });
def('lia_reaper', { charId: 'lia', tier: 2, parent: 'lia_dancer', name: '사신의 낫', eng: 'REAPER', reqLevel: 25,
  desc: '죽음과 계약한 자.', perk: '처치 시 HP 3% 회복, 암흑 피해 +40%',
  mult: { atk: 1.4, hp: 1.15 }, flat: { dark: 40, critDmg: 40, lifesteal: 3 },   // hp ×1.15: BAL-TUNE (bal_audit.md 권고 6) — 리아의 여섯 직업 중 유일한 방어 선택지
  // scarf 짧게 — 칼날 무희의 긴 금빛 스카프가 뼈 날개 사이로 흘러내리지 않게 (HERO-REVIEW #225 / 요청 #349)
  look: { primary: '#0a0a0a', secondary: '#3a8a5a', trim: '#6affb0', headgear: 'hood', wings: 'bone', scarf: { color: '#e8c872', long: false }, aura: { color: '#6affb0', type: 'dark' }, eyes: '#6affb0', eyeGlow: true } });

// ── 아젤: 장검 ──
def('azel_dhampir', { charId: 'azel', tier: 0, name: '담피르', eng: 'DHAMPIR', reqLevel: 1, next: ['azel_vampire', 'azel_holyblade'],
  desc: '인간과 흡혈귀의 혼혈.', perk: '흡혈 2%, 안개 대시 중 무적' });
def('azel_vampire', { charId: 'azel', tier: 1, parent: 'azel_dhampir', name: '진조의 후예', eng: 'TRUE BLOOD', reqLevel: 10, next: ['azel_nosferatu', 'azel_bloodking'],
  desc: '흡혈귀의 피를 받아들인 자.', perk: '흡혈 +3%, 암흑 피해 +20%',
  mult: { atk: 1.15, mag: 1.15 }, flat: { lifesteal: 3, dark: 20 },
  look: { primary: '#0e0a12', secondary: '#b00a24', trim: '#c8a040', eyes: '#ff2040', eyeGlow: true, cape: { color: '#0e0a12', color2: '#b00a24', len: 1.3 } } });
def('azel_nosferatu', { charId: 'azel', tier: 2, parent: 'azel_vampire', name: '노스페라투', eng: 'NOSFERATU', reqLevel: 25,
  desc: '박쥐의 날개를 펼친 밤의 귀족.', perk: '공중 점프 +2, 박쥐 떼가 적을 추적',
  mult: { atk: 1.3, mag: 1.3, agi: 1.2 }, flat: { airJumps: 2, lifesteal: 3, dark: 25 },
  look: { primary: '#0a0610', secondary: '#8a0a1e', trim: '#ffd84a', wings: 'bat', eyes: '#ff2040', eyeGlow: true, aura: { color: '#b0103a', type: 'blood' }, cape: { color: '#0a0610', color2: '#8a0a1e', len: 1.4 } } });
def('azel_bloodking', { charId: 'azel', tier: 2, parent: 'azel_vampire', name: '혈왕', eng: 'BLOOD KING', reqLevel: 25,
  desc: '피의 왕관을 쓴 새로운 군주.', perk: '흡혈 +6%, 치명타 피해 +50%',
  mult: { atk: 1.45, hp: 1.2 }, flat: { lifesteal: 6, critDmg: 50, crit: 8 },
  look: { primary: '#2a0006', secondary: '#ff1a2a', trim: '#ffd84a', headgear: 'crown', eyes: '#ff2040', eyeGlow: true, aura: { color: '#ff1a2a', type: 'blood' }, cape: { color: '#5a0010', color2: '#1a0004', len: 1.5 } } });
def('azel_holyblade', { charId: 'azel', tier: 1, parent: 'azel_dhampir', name: '성검사', eng: 'HOLY BLADE', reqLevel: 10, next: ['azel_dawnbringer', 'azel_seraph'],
  desc: '어둠의 피를 빛으로 억누른 검사.', perk: '신성 피해 +20%, 받는 신성 피해 무효',
  mult: { atk: 1.12, res: 1.2 }, flat: { holy: 20, resHoly: 100 },
  look: { primary: '#e8e4f0', secondary: '#5a7aff', trim: '#ffd84a', eyes: '#8ac8ff', cape: { color: '#e8e4f0', color2: '#5a7aff', len: 1.2 } } });
def('azel_dawnbringer', { charId: 'azel', tier: 2, parent: 'azel_holyblade', name: '여명의 검', eng: 'DAWNBRINGER', reqLevel: 25,
  desc: '밤을 끝내는 새벽의 검.', perk: '검기 발사, 신성 피해 +40%',
  mult: { atk: 1.35, mag: 1.2 }, flat: { holy: 40, reach: 20 },
  look: { primary: '#fff8e8', secondary: '#ffb040', trim: '#ffd84a', halo: true, aura: { color: '#ffd070', type: 'holy' }, cape: { color: '#fff8e8', color2: '#ffb040', len: 1.3 } } });
def('azel_seraph', { charId: 'azel', tier: 2, parent: 'azel_holyblade', name: '타천사', eng: 'FALLEN SERAPH', reqLevel: 25,
  desc: '빛과 어둠의 날개를 모두 지닌 자.', perk: '신성·암흑 피해 +30%, 공중 점프 +1',
  mult: { atk: 1.3, mag: 1.3, agi: 1.15 }, flat: { holy: 30, dark: 30, airJumps: 1 },
  look: { primary: '#1a1a2a', secondary: '#ffffff', trim: '#b060ff', wings: 'seraph', halo: true, eyes: '#ffd84a', eyeGlow: true, aura: { color: '#b98cff', type: 'dark' } } });

// ── 이졸데: 창 (docs/specs/hero7.md §2) ──
// 특성 동작은 game/skills.js 의 __onSwing(투창·용염·천 번 찌르기)과 __onPound(급강하 충격파·낙뢰)
def('isolde_lancer', { charId: 'isolde', tier: 0, name: '창기사', eng: 'LANCER', reqLevel: 1, next: ['isolde_dragoon', 'isolde_valkyrie'],
  desc: '하늘 기사단의 마지막 창.', perk: '공중에서 ↓+공격: 급강하 찌르기 — 착지하면 주변에 충격파' });
def('isolde_dragoon', { charId: 'isolde', tier: 1, parent: 'isolde_lancer', name: '용기사', eng: 'DRAGOON', reqLevel: 10, next: ['isolde_stormlord', 'isolde_wyrmknight'],
  desc: '잃어버린 용의 날개 대신 제 다리로 하늘을 걷는 기사.', perk: '점프력 +10%, 급강하 충격파 범위 +40%, 번개 피해 +15%',
  mult: { atk: 1.15, agi: 1.1 }, flat: { jumpPow: 10, thunder: 15 },
  look: { primary: '#22304e', secondary: '#7ad8ff', trim: '#e8ecf4', armorColor: '#9aaccc', armorTrim: '#7ad8ff', aura: { color: '#9ae0ff', type: 'thunder' }, cape: { color: '#162036', color2: '#7ad8ff', len: 0.9 } } });
def('isolde_stormlord', { charId: 'isolde', tier: 2, parent: 'isolde_dragoon', name: '뇌룡기사', eng: 'STORMLORD', reqLevel: 25,
  desc: '뇌룡의 숨결을 창에 깃들인 폭풍의 기사.', perk: '공중 점프 +1, 급강하 착지 때 낙뢰가 떨어진다, 번개 피해 +35%',
  mult: { atk: 1.3, agi: 1.2 }, flat: { airJumps: 1, thunder: 35, moveSpd: 8 },
  look: { primary: '#141c34', secondary: '#bfe8ff', trim: '#ffe070', armorColor: '#c4d2ec', armorTrim: '#ffe070', eyes: '#bfe8ff', eyeGlow: true, aura: { color: '#bfe0ff', type: 'thunder' }, cape: { color: '#101830', color2: '#bfe8ff', len: 1.1 } } });
def('isolde_wyrmknight', { charId: 'isolde', tier: 2, parent: 'isolde_dragoon', name: '흑룡기사', eng: 'WYRM KNIGHT', reqLevel: 25,
  desc: '균열에 삼켜진 용의 검은 불꽃을 이어받은 기사.', perk: '흡혈 3%, 창끝에 용염 — 마무리 찌르기가 불꽃을 뿜는다, 화염·암흑 피해 +25%',
  mult: { atk: 1.4, hp: 1.15 }, flat: { lifesteal: 3, fire: 25, dark: 25, critDmg: 15 },
  look: { primary: '#1a1016', secondary: '#ff6a2a', trim: '#c8a040', armor: 'dark', armorColor: '#2a2430', armorTrim: '#ff6a2a', headgear: 'horns', headColor: '#3a2a30', wings: 'demon', eyes: '#ffb040', eyeGlow: true, aura: { color: '#ff7a2a', type: 'fire' }, cape: null } });
def('isolde_valkyrie', { charId: 'isolde', tier: 1, parent: 'isolde_lancer', name: '발키리', eng: 'VALKYRIE', reqLevel: 10, next: ['isolde_einherjar', 'isolde_spearsaint'],
  desc: '전사자의 길을 비추는 빛의 창잡이.', perk: '마무리 찌르기와 돌진 찌르기에 빛의 투창을 함께 던진다, 신성 피해 +15%',
  mult: { atk: 1.12, res: 1.15 }, flat: { holy: 15, reach: 5 },
  look: { primary: '#e6eaf2', secondary: '#ffd870', trim: '#ffe8a0', armor: 'holy', armorColor: '#e2e8f2', armorTrim: '#ffd870', headColor: '#e8ecf4', cape: { color: '#f0ece0', color2: '#ffd870', len: 0.95 } } });
def('isolde_einherjar', { charId: 'isolde', tier: 2, parent: 'isolde_valkyrie', name: '전장의 여신', eng: 'EINHERJAR', reqLevel: 25,
  desc: '쓰러진 용사들의 영혼을 이끄는 신성한 날개.', perk: '받는 피해 -15%, 투창이 세 갈래로 흩어져 날아간다, 신성 피해 +30%',
  mult: { atk: 1.25, hp: 1.2, res: 1.2 }, flat: { dmgReduce: 15, holy: 30, hpRegen: 1 },
  look: { primary: '#fff8ec', secondary: '#ffd84a', trim: '#ffd84a', armor: 'holy', armorColor: '#f2f0ea', armorTrim: '#ffd84a', headColor: '#f4f0e6', wings: 'angel', halo: true, aura: { color: '#fff2b0', type: 'holy' }, cape: null } });
def('isolde_spearsaint', { charId: 'isolde', tier: 2, parent: 'isolde_valkyrie', name: '창성', eng: 'SPEAR SAINT', reqLevel: 25,
  desc: '천 번을 찔러 천 번 모두 급소를 꿰는 창의 성인.', perk: '치명타 +12%, 치명타 피해 +30%, 마무리 찌르기 뒤 천 번 찌르기가 이어진다',
  mult: { atk: 1.35, agi: 1.25 }, flat: { crit: 12, critDmg: 30, atkSpd: 10 },
  look: { primary: '#ece6dc', secondary: '#d02040', trim: '#ffd070', armor: 'holy', armorColor: '#e8e4dc', armorTrim: '#d02040', headgear: 'circlet', scarf: { color: '#d02040', long: true }, eyes: '#ff8a9a', aura: { color: '#ffd0d8', type: 'holy' }, cape: null } });

export const CLASSES = C;

/** 루트부터 해당 클래스까지 계보 배열 */
export function classChain(classId) {
  const out = [];
  let c = C[classId];
  while (c) { out.unshift(c); c = c.parent ? C[c.parent] : null; }
  return out;
}
export function classesOf(charId) { return Object.values(C).filter((c) => c.charId === charId); }
