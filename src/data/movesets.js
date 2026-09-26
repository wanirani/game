// 무기 계열별 공격 모션(콤보) 데이터
// move = {
//   id, anim(렌더러 포즈 이름), dur(초), hit:[시작,끝](초, 공격 판정 구간), box:{x,y,w,h}(발 중앙 기준, x는 전방),
//   mv(모션 배율), type:'phys'|'mag', kb:[x,y] 넉백, hitstop, shake, cancel(다음 입력 허용 시각), lunge(전진 속도),
//   vy(시작 시 수직 속도), airStall(공중 체공), launch(띄우기), pogo(맞히면 튀어오름), rehit(다단히트 간격),
//   fx:'whip'|'slash'|'heavy'|'thrust'|'shot'|'magic', slash:{r,arc,angle,width,color} 궤적,
//   sfx, proj:{render,speed,w,h,mv,count,spread,angle,behavior,life,pierce,offX,offY,color,type,homing}, finisher
// }
// 세트: ground[] (연속 콤보), air[], up, down(공중 하단), crouch, dash, charge(모아쏘기)
export const MOVESETS = {
  whip: {
    ground: [
      { id: 'whip1', anim: 'lash', dur: 0.34, hit: [0.1, 0.19], box: { x: 12, y: -66, w: 150, h: 26 }, mv: 1.0, kb: [170, -60], hitstop: 0.045, shake: 2, cancel: 0.2, fx: 'whip', sfx: 'whip' },
      { id: 'whip2', anim: 'lash_up', dur: 0.34, hit: [0.09, 0.18], box: { x: 6, y: -98, w: 140, h: 44 }, mv: 1.05, kb: [170, -140], hitstop: 0.05, shake: 2, cancel: 0.2, fx: 'whip', sfx: 'whip' },
      { id: 'whip3', anim: 'lash_low', dur: 0.36, hit: [0.1, 0.19], box: { x: 10, y: -46, w: 158, h: 30 }, mv: 1.1, kb: [200, -80], hitstop: 0.05, shake: 3, cancel: 0.22, fx: 'whip', sfx: 'whip' },
      { id: 'whip4', anim: 'spin', dur: 0.56, hit: [0.12, 0.36], rehit: 0.11, box: { x: -110, y: -104, w: 220, h: 84 }, mv: 0.85, kb: [340, -300], hitstop: 0.07, shake: 5, cancel: 0.45, fx: 'whip', sfx: 'whip_crack', finisher: true },
    ],
    air: [
      { id: 'whipA1', anim: 'lash', dur: 0.3, hit: [0.08, 0.17], box: { x: 10, y: -62, w: 140, h: 28 }, mv: 1.0, kb: [150, -80], hitstop: 0.045, cancel: 0.2, fx: 'whip', sfx: 'whip', airStall: 0.4 },
      { id: 'whipA2', anim: 'lash_down', dur: 0.34, hit: [0.09, 0.19], box: { x: 4, y: -40, w: 130, h: 60 }, mv: 1.1, kb: [200, 120], hitstop: 0.05, cancel: 0.24, fx: 'whip', sfx: 'whip_crack', airStall: 0.4 },
    ],
    up: { id: 'whipUp', anim: 'launch', dur: 0.42, hit: [0.1, 0.22], box: { x: -14, y: -210, w: 70, h: 190 }, mv: 1.2, kb: [40, -680], launch: true, hitstop: 0.06, shake: 3, cancel: 0.3, fx: 'whip', sfx: 'whip_crack' },
    down: { id: 'whipDown', anim: 'down', dur: 0.4, hit: [0.06, 0.3], box: { x: -30, y: -10, w: 80, h: 110 }, mv: 1.2, kb: [100, 300], pogo: 560, hitstop: 0.05, cancel: 0.25, fx: 'whip', sfx: 'whip' },
    crouch: { id: 'whipLow', anim: 'crouch_lash', dur: 0.32, hit: [0.09, 0.17], box: { x: 12, y: -30, w: 150, h: 24 }, mv: 1.0, kb: [150, -30], hitstop: 0.045, cancel: 0.2, fx: 'whip', sfx: 'whip' },
    dash: { id: 'whipDash', anim: 'lash', dur: 0.4, hit: [0.08, 0.2], box: { x: 10, y: -66, w: 180, h: 34 }, mv: 1.4, kb: [320, -180], lunge: 420, hitstop: 0.06, shake: 3, cancel: 0.28, fx: 'whip', sfx: 'whip_crack' },
    charge: { id: 'whipCharge', anim: 'spin', dur: 0.7, hit: [0.1, 0.5], rehit: 0.09, box: { x: -150, y: -120, w: 300, h: 110 }, mv: 1.1, kb: [420, -380], hitstop: 0.08, shake: 7, cancel: 0.6, fx: 'whip', sfx: 'whip_crack', element: 'holy', finisher: true },
  },

  sword: {
    ground: [
      { id: 'sw1', anim: 'slash_down', dur: 0.26, hit: [0.06, 0.13], box: { x: 0, y: -92, w: 96, h: 84 }, mv: 0.9, kb: [150, -60], hitstop: 0.045, shake: 2, cancel: 0.14, lunge: 120, fx: 'slash', slash: { r: 70, arc: 2.2, angle: 0.2, width: 18 }, sfx: 'slash' },
      { id: 'sw2', anim: 'slash_up', dur: 0.26, hit: [0.06, 0.13], box: { x: 0, y: -100, w: 96, h: 90 }, mv: 0.95, kb: [150, -120], hitstop: 0.045, shake: 2, cancel: 0.14, lunge: 120, fx: 'slash', slash: { r: 72, arc: 2.2, angle: -0.3, width: 18, dir: -1 }, sfx: 'slash' },
      { id: 'sw3', anim: 'thrust', dur: 0.3, hit: [0.07, 0.15], box: { x: 10, y: -62, w: 130, h: 24 }, mv: 1.1, kb: [220, -40], hitstop: 0.05, shake: 3, cancel: 0.17, lunge: 260, fx: 'thrust', sfx: 'slash' },
      { id: 'sw4', anim: 'slash_wide', dur: 0.46, hit: [0.1, 0.2], box: { x: -20, y: -110, w: 140, h: 108 }, mv: 1.8, kb: [360, -260], hitstop: 0.08, shake: 6, cancel: 0.36, lunge: 200, fx: 'slash', slash: { r: 95, arc: 3.2, angle: 0, width: 26 }, sfx: 'slash_heavy', finisher: true },
    ],
    air: [
      { id: 'swA1', anim: 'slash_down', dur: 0.26, hit: [0.06, 0.14], box: { x: -6, y: -96, w: 100, h: 96 }, mv: 0.95, kb: [150, -140], hitstop: 0.045, cancel: 0.16, fx: 'slash', slash: { r: 70, arc: 2.4, angle: 0.2, width: 18 }, sfx: 'slash', airStall: 0.5 },
      { id: 'swA2', anim: 'slash_up', dur: 0.26, hit: [0.06, 0.14], box: { x: -6, y: -104, w: 100, h: 96 }, mv: 0.95, kb: [150, -160], hitstop: 0.045, cancel: 0.16, fx: 'slash', slash: { r: 72, arc: 2.4, angle: -0.3, width: 18, dir: -1 }, sfx: 'slash', airStall: 0.5 },
      { id: 'swA3', anim: 'spin_blade', dur: 0.4, hit: [0.06, 0.3], rehit: 0.08, box: { x: -70, y: -110, w: 140, h: 120 }, mv: 0.7, kb: [240, -200], hitstop: 0.05, cancel: 0.32, fx: 'slash', slash: { r: 80, arc: 6.2, angle: 0, width: 16 }, sfx: 'slash', airStall: 0.6 },
    ],
    up: { id: 'swUp', anim: 'uppercut', dur: 0.4, hit: [0.07, 0.2], box: { x: -10, y: -170, w: 90, h: 170 }, mv: 1.3, kb: [60, -700], launch: true, vy: -520, hitstop: 0.06, shake: 3, cancel: 0.28, fx: 'slash', slash: { r: 90, arc: 2.4, angle: -1.3, width: 20, dir: -1 }, sfx: 'slash_heavy' },
    down: { id: 'swDown', anim: 'plunge', dur: 0.5, hit: [0.05, 0.45], box: { x: -24, y: -30, w: 48, h: 60 }, mv: 1.4, kb: [120, 360], vy: 900, pogo: 520, hitstop: 0.05, cancel: 0.3, fx: 'thrust', sfx: 'slash' },
    crouch: { id: 'swLow', anim: 'crouch_slash', dur: 0.28, hit: [0.06, 0.14], box: { x: 0, y: -40, w: 104, h: 40 }, mv: 1.0, kb: [150, -40], hitstop: 0.045, cancel: 0.16, fx: 'slash', slash: { r: 70, arc: 1.6, angle: 0.4, width: 14 }, sfx: 'slash' },
    dash: { id: 'swDash', anim: 'thrust', dur: 0.36, hit: [0.04, 0.2], box: { x: -10, y: -70, w: 150, h: 40 }, mv: 1.5, kb: [320, -160], lunge: 560, hitstop: 0.06, shake: 3, cancel: 0.26, fx: 'thrust', sfx: 'slash_heavy' },
    charge: { id: 'swCharge', anim: 'slash_wide', dur: 0.6, hit: [0.1, 0.24], box: { x: -20, y: -130, w: 220, h: 130 }, mv: 3.2, kb: [480, -380], hitstop: 0.1, shake: 9, cancel: 0.5, lunge: 300, fx: 'slash', slash: { r: 130, arc: 3.4, angle: 0, width: 34 }, sfx: 'slash_heavy', finisher: true,
      proj: { render: 'wave', speed: 900, w: 60, h: 90, mv: 1.6, life: 0.6, pierce: 99, color: '#ff4a6a', offX: 40, offY: -50 } },
  },

  greatsword: {
    ground: [
      { id: 'gs1', anim: 'heavy_down', dur: 0.5, hit: [0.17, 0.27], box: { x: -10, y: -130, w: 150, h: 130 }, mv: 1.6, kb: [240, -120], hitstop: 0.08, shake: 5, cancel: 0.34, lunge: 140, fx: 'heavy', slash: { r: 110, arc: 2.4, angle: 0.3, width: 28 }, sfx: 'slash_heavy' },
      { id: 'gs2', anim: 'heavy_up', dur: 0.5, hit: [0.15, 0.25], box: { x: -10, y: -140, w: 150, h: 140 }, mv: 1.7, kb: [240, -300], hitstop: 0.08, shake: 5, cancel: 0.34, lunge: 140, fx: 'heavy', slash: { r: 112, arc: 2.4, angle: -0.4, width: 28, dir: -1 }, sfx: 'slash_heavy' },
      { id: 'gs3', anim: 'heavy_spin', dur: 0.78, hit: [0.2, 0.46], rehit: 0.13, box: { x: -140, y: -130, w: 280, h: 128 }, mv: 1.4, kb: [460, -360], hitstop: 0.1, shake: 9, cancel: 0.64, fx: 'heavy', slash: { r: 130, arc: 6.2, angle: 0, width: 30 }, sfx: 'slash_heavy', finisher: true },
    ],
    air: [
      { id: 'gsA1', anim: 'heavy_down', dur: 0.46, hit: [0.14, 0.26], box: { x: -10, y: -130, w: 150, h: 150 }, mv: 1.6, kb: [240, 100], hitstop: 0.08, shake: 5, cancel: 0.34, fx: 'heavy', slash: { r: 110, arc: 2.6, angle: 0.4, width: 28 }, sfx: 'slash_heavy', airStall: 0.5 },
    ],
    up: { id: 'gsUp', anim: 'heavy_up', dur: 0.56, hit: [0.14, 0.28], box: { x: -20, y: -200, w: 140, h: 200 }, mv: 1.8, kb: [60, -760], launch: true, hitstop: 0.09, shake: 6, cancel: 0.42, fx: 'heavy', slash: { r: 120, arc: 2.6, angle: -1.2, width: 30, dir: -1 }, sfx: 'slash_heavy' },
    down: { id: 'gsDown', anim: 'plunge', dur: 0.6, hit: [0.05, 0.55], box: { x: -50, y: -40, w: 100, h: 80 }, mv: 2.2, kb: [300, -300], vy: 1100, groundPound: 110, hitstop: 0.1, shake: 10, cancel: 0.45, fx: 'heavy', sfx: 'slash_heavy' },
    crouch: { id: 'gsLow', anim: 'heavy_low', dur: 0.46, hit: [0.14, 0.24], box: { x: -10, y: -50, w: 170, h: 50 }, mv: 1.5, kb: [260, -200], hitstop: 0.08, shake: 4, cancel: 0.32, fx: 'heavy', slash: { r: 110, arc: 1.8, angle: 0.6, width: 22 }, sfx: 'slash_heavy' },
    dash: { id: 'gsDash', anim: 'heavy_spin', dur: 0.6, hit: [0.1, 0.4], rehit: 0.12, box: { x: -90, y: -120, w: 220, h: 120 }, mv: 1.3, kb: [380, -260], lunge: 420, hitstop: 0.08, shake: 6, cancel: 0.5, fx: 'heavy', slash: { r: 110, arc: 6.2, angle: 0, width: 26 }, sfx: 'slash_heavy' },
    charge: { id: 'gsCharge', anim: 'heavy_down', dur: 0.85, hit: [0.3, 0.44], box: { x: -30, y: -200, w: 240, h: 200 }, mv: 4.2, kb: [560, -460], hitstop: 0.14, shake: 14, cancel: 0.7, fx: 'heavy', slash: { r: 160, arc: 2.8, angle: 0.3, width: 44 }, sfx: 'slash_heavy', finisher: true, groundPound: 200 },
  },

  dagger: {
    ground: [
      { id: 'dg1', anim: 'stab', dur: 0.17, hit: [0.03, 0.09], box: { x: 4, y: -64, w: 66, h: 30 }, mv: 0.55, kb: [80, -20], hitstop: 0.03, shake: 1, cancel: 0.09, lunge: 90, fx: 'slash', slash: { r: 48, arc: 1.6, angle: 0.1, width: 10 }, sfx: 'slash' },
      { id: 'dg2', anim: 'stab_alt', dur: 0.17, hit: [0.03, 0.09], box: { x: 4, y: -60, w: 66, h: 34 }, mv: 0.55, kb: [80, -20], hitstop: 0.03, shake: 1, cancel: 0.09, lunge: 90, fx: 'slash', slash: { r: 48, arc: 1.6, angle: -0.2, width: 10, dir: -1 }, sfx: 'slash' },
      { id: 'dg3', anim: 'stab', dur: 0.17, hit: [0.03, 0.09], box: { x: 4, y: -70, w: 70, h: 34 }, mv: 0.6, kb: [90, -40], hitstop: 0.03, shake: 1, cancel: 0.09, lunge: 90, fx: 'slash', slash: { r: 50, arc: 1.8, angle: 0.3, width: 10 }, sfx: 'slash' },
      { id: 'dg4', anim: 'stab_alt', dur: 0.19, hit: [0.03, 0.1], box: { x: 4, y: -64, w: 74, h: 36 }, mv: 0.65, kb: [100, -60], hitstop: 0.035, shake: 2, cancel: 0.1, lunge: 110, fx: 'slash', slash: { r: 52, arc: 2, angle: -0.3, width: 11, dir: -1 }, sfx: 'slash' },
      { id: 'dg5', anim: 'spin_blade', dur: 0.4, hit: [0.05, 0.28], rehit: 0.06, box: { x: -60, y: -90, w: 130, h: 90 }, mv: 0.55, kb: [300, -280], hitstop: 0.06, shake: 4, cancel: 0.32, lunge: 160, fx: 'slash', slash: { r: 64, arc: 6.2, angle: 0, width: 14 }, sfx: 'slash_heavy', finisher: true },
    ],
    air: [
      { id: 'dgA1', anim: 'stab', dur: 0.16, hit: [0.03, 0.09], box: { x: 0, y: -70, w: 70, h: 44 }, mv: 0.55, kb: [80, -100], hitstop: 0.03, cancel: 0.09, fx: 'slash', slash: { r: 50, arc: 2, angle: 0.2, width: 10 }, sfx: 'slash', airStall: 0.7 },
      { id: 'dgA2', anim: 'stab_alt', dur: 0.16, hit: [0.03, 0.09], box: { x: 0, y: -70, w: 70, h: 44 }, mv: 0.55, kb: [80, -100], hitstop: 0.03, cancel: 0.09, fx: 'slash', slash: { r: 50, arc: 2, angle: -0.2, width: 10, dir: -1 }, sfx: 'slash', airStall: 0.7 },
      { id: 'dgA3', anim: 'spin_blade', dur: 0.36, hit: [0.04, 0.26], rehit: 0.06, box: { x: -60, y: -96, w: 130, h: 110 }, mv: 0.5, kb: [240, -200], hitstop: 0.05, cancel: 0.28, fx: 'slash', slash: { r: 64, arc: 6.2, angle: 0, width: 12 }, sfx: 'slash', airStall: 0.7 },
    ],
    up: { id: 'dgUp', anim: 'uppercut', dur: 0.34, hit: [0.05, 0.18], box: { x: -10, y: -170, w: 70, h: 170 }, mv: 1.0, kb: [40, -680], launch: true, vy: -560, hitstop: 0.05, cancel: 0.22, fx: 'slash', slash: { r: 70, arc: 2.4, angle: -1.3, width: 14, dir: -1 }, sfx: 'slash' },
    down: { id: 'dgDown', anim: 'dive_kick', dur: 0.5, hit: [0.03, 0.46], box: { x: -10, y: -30, w: 50, h: 44 }, mv: 1.1, kb: [160, -300], vy: 780, vx: 520, pogo: 600, hitstop: 0.05, cancel: 0.25, fx: 'thrust', sfx: 'dash' },
    crouch: { id: 'dgLow', anim: 'crouch_stab', dur: 0.16, hit: [0.03, 0.09], box: { x: 4, y: -34, w: 70, h: 30 }, mv: 0.6, kb: [80, -20], hitstop: 0.03, cancel: 0.09, fx: 'slash', slash: { r: 46, arc: 1.4, angle: 0.5, width: 10 }, sfx: 'slash' },
    dash: { id: 'dgDash', anim: 'thrust', dur: 0.3, hit: [0.03, 0.2], rehit: 0.07, box: { x: -20, y: -70, w: 140, h: 44 }, mv: 0.7, kb: [200, -100], lunge: 680, hitstop: 0.04, cancel: 0.22, fx: 'thrust', sfx: 'slash' },
    charge: { id: 'dgCharge', anim: 'spin_blade', dur: 0.6, hit: [0.06, 0.5], rehit: 0.05, box: { x: -110, y: -120, w: 220, h: 120 }, mv: 0.7, kb: [360, -320], hitstop: 0.06, shake: 5, cancel: 0.5, fx: 'slash', slash: { r: 100, arc: 6.2, angle: 0, width: 16 }, sfx: 'slash_heavy', finisher: true, element: 'dark' },
  },

  gun: {
    ground: [
      { id: 'gn1', anim: 'shoot', dur: 0.2, hit: [0.03, 0.04], box: null, mv: 0.62, kb: [90, -20], hitstop: 0.025, shake: 1, cancel: 0.1, fx: 'shot', sfx: 'gun', proj: { render: 'bullet', speed: 1600, w: 18, h: 8, life: 0.55, pierce: 1, offX: 44, offY: -60, color: '#fff0b0' } },
      { id: 'gn2', anim: 'shoot_alt', dur: 0.2, hit: [0.03, 0.04], box: null, mv: 0.62, kb: [90, -20], hitstop: 0.025, shake: 1, cancel: 0.1, fx: 'shot', sfx: 'gun', proj: { render: 'bullet', speed: 1600, w: 18, h: 8, life: 0.55, pierce: 1, offX: 44, offY: -56, color: '#fff0b0' } },
      { id: 'gn3', anim: 'shoot', dur: 0.2, hit: [0.03, 0.04], box: null, mv: 0.66, kb: [90, -20], hitstop: 0.025, shake: 1, cancel: 0.1, fx: 'shot', sfx: 'gun', proj: { render: 'bullet', speed: 1600, w: 18, h: 8, life: 0.55, pierce: 1, offX: 44, offY: -60, color: '#fff0b0' } },
      { id: 'gn4', anim: 'shoot_double', dur: 0.42, hit: [0.05, 0.06], box: null, mv: 0.9, kb: [260, -120], hitstop: 0.05, shake: 4, cancel: 0.3, fx: 'shot', sfx: 'shotgun', finisher: true, recoil: 220,
        proj: { render: 'bullet', speed: 1500, w: 20, h: 10, life: 0.4, pierce: 2, count: 5, spread: 0.12, offX: 44, offY: -58, color: '#ffd070' } },
    ],
    air: [
      { id: 'gnA1', anim: 'shoot', dur: 0.18, hit: [0.03, 0.04], box: null, mv: 0.6, kb: [80, -40], hitstop: 0.02, cancel: 0.09, fx: 'shot', sfx: 'gun', airStall: 0.6, proj: { render: 'bullet', speed: 1600, w: 18, h: 8, life: 0.5, pierce: 1, offX: 40, offY: -58 } },
      { id: 'gnA2', anim: 'shoot_alt', dur: 0.18, hit: [0.03, 0.04], box: null, mv: 0.6, kb: [80, -40], hitstop: 0.02, cancel: 0.09, fx: 'shot', sfx: 'gun', airStall: 0.6, proj: { render: 'bullet', speed: 1600, w: 18, h: 8, life: 0.5, pierce: 1, offX: 40, offY: -54 } },
    ],
    up: { id: 'gnUp', anim: 'shoot_up', dur: 0.3, hit: [0.04, 0.05], box: null, mv: 0.8, kb: [40, -300], hitstop: 0.03, cancel: 0.16, fx: 'shot', sfx: 'gun',
      proj: { render: 'bullet', speed: 1500, w: 14, h: 14, life: 0.5, pierce: 1, count: 3, spread: 0.18, angle: -1.05, offX: 20, offY: -90 } },
    down: { id: 'gnDown', anim: 'shoot_down', dur: 0.32, hit: [0.04, 0.05], box: null, mv: 0.8, kb: [60, 200], hitstop: 0.03, cancel: 0.16, fx: 'shot', sfx: 'shotgun', recoilY: -520,
      proj: { render: 'bullet', speed: 1400, w: 14, h: 14, life: 0.4, pierce: 1, count: 3, spread: 0.3, angle: Math.PI / 2, offX: 0, offY: -10 } },
    crouch: { id: 'gnLow', anim: 'crouch_shoot', dur: 0.2, hit: [0.03, 0.04], box: null, mv: 0.62, kb: [90, -10], hitstop: 0.025, cancel: 0.1, fx: 'shot', sfx: 'gun', proj: { render: 'bullet', speed: 1600, w: 18, h: 8, life: 0.55, pierce: 1, offX: 44, offY: -34 } },
    dash: { id: 'gnDash', anim: 'slide_shoot', dur: 0.36, hit: [0.04, 0.2], rehit: 0.06, box: null, mv: 0.5, kb: [120, -60], lunge: 520, hitstop: 0.02, cancel: 0.26, fx: 'shot', sfx: 'gun', multiShot: 4,
      proj: { render: 'bullet', speed: 1700, w: 18, h: 8, life: 0.5, pierce: 1, offX: 40, offY: -30 } },
    charge: { id: 'gnCharge', anim: 'shoot_double', dur: 0.6, hit: [0.08, 0.09], box: null, mv: 4.0, kb: [500, -300], hitstop: 0.12, shake: 10, cancel: 0.5, fx: 'shot', sfx: 'shotgun', finisher: true, recoil: 380,
      proj: { render: 'bolt', speed: 2000, w: 40, h: 30, life: 0.7, pierce: 99, offX: 50, offY: -58, color: '#ffe070', scale: 1.8 } },
  },

  staff: {
    ground: [
      { id: 'st1', anim: 'staff_swing', dur: 0.3, hit: [0.08, 0.16], box: { x: -4, y: -96, w: 98, h: 84 }, mv: 0.8, type: 'mag', kb: [150, -60], hitstop: 0.04, shake: 1, cancel: 0.18, lunge: 80, fx: 'slash', slash: { r: 70, arc: 2.2, angle: 0.2, width: 14, color: '#fff2b0' }, sfx: 'slash', element: 'holy' },
      { id: 'st2', anim: 'staff_swing_up', dur: 0.3, hit: [0.08, 0.16], box: { x: -4, y: -104, w: 98, h: 90 }, mv: 0.85, type: 'mag', kb: [150, -140], hitstop: 0.04, shake: 1, cancel: 0.18, lunge: 80, fx: 'slash', slash: { r: 72, arc: 2.2, angle: -0.3, width: 14, dir: -1, color: '#fff2b0' }, sfx: 'slash', element: 'holy' },
      { id: 'st3', anim: 'cast', dur: 0.42, hit: [0.12, 0.13], box: null, mv: 1.4, type: 'mag', kb: [260, -160], hitstop: 0.05, shake: 3, cancel: 0.3, fx: 'magic', sfx: 'holy', finisher: true, element: 'holy',
        proj: { render: 'bolt', speed: 820, w: 26, h: 26, life: 1.0, pierce: 3, offX: 40, offY: -62, color: '#fff2b0', count: 3, spread: 0.18, homing: true, trail: 'holy' } },
    ],
    air: [
      { id: 'stA1', anim: 'cast', dur: 0.3, hit: [0.08, 0.09], box: null, mv: 0.9, type: 'mag', kb: [140, -80], hitstop: 0.03, cancel: 0.18, fx: 'magic', sfx: 'magic', airStall: 0.6, element: 'holy',
        proj: { render: 'bolt', speed: 900, w: 20, h: 20, life: 0.8, pierce: 1, offX: 36, offY: -60, color: '#fff2b0', trail: 'holy' } },
    ],
    up: { id: 'stUp', anim: 'cast_up', dur: 0.5, hit: [0.14, 0.34], rehit: 0.08, box: { x: 10, y: -260, w: 70, h: 260 }, mv: 0.7, type: 'mag', kb: [30, -600], launch: true, hitstop: 0.04, shake: 3, cancel: 0.38, fx: 'magic', sfx: 'holy', element: 'holy', pillar: true },
    down: { id: 'stDown', anim: 'plunge', dur: 0.5, hit: [0.05, 0.45], box: { x: -50, y: -40, w: 100, h: 70 }, mv: 1.3, type: 'mag', kb: [200, -300], vy: 900, groundPound: 120, hitstop: 0.06, shake: 5, cancel: 0.36, fx: 'magic', sfx: 'holy', element: 'holy' },
    crouch: { id: 'stLow', anim: 'staff_swing', dur: 0.3, hit: [0.08, 0.16], box: { x: -4, y: -46, w: 104, h: 46 }, mv: 0.8, type: 'mag', kb: [150, -40], hitstop: 0.04, cancel: 0.18, fx: 'slash', slash: { r: 66, arc: 1.6, angle: 0.5, width: 12, color: '#fff2b0' }, sfx: 'slash', element: 'holy' },
    dash: { id: 'stDash', anim: 'cast', dur: 0.4, hit: [0.06, 0.07], box: null, mv: 1.1, type: 'mag', kb: [220, -120], lunge: 300, hitstop: 0.04, cancel: 0.28, fx: 'magic', sfx: 'holy', element: 'holy',
      proj: { render: 'orb', speed: 700, w: 30, h: 30, life: 0.8, pierce: 5, offX: 30, offY: -54, color: '#fff2b0', trail: 'holy' } },
    charge: { id: 'stCharge', anim: 'cast_up', dur: 0.8, hit: [0.2, 0.6], rehit: 0.1, box: { x: -140, y: -160, w: 280, h: 160 }, mv: 1.0, type: 'mag', kb: [300, -400], hitstop: 0.06, shake: 8, cancel: 0.7, fx: 'magic', sfx: 'holy', finisher: true, element: 'holy', nova: true },
  },
};
