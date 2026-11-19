// WORLD-2: the Ossuary of Farewell under the graveyard (GDD 4 dungeon 1, 9.1 minutes 68-114) - "the same room seen twice". docs/v2/AREA_FORMAT.md 13.
// One layout function for both nights: floors, walls, pillars, the gap, the bell posts, the altar, the statue and the sarcophagus are the SAME numbers.
//   'past' (1697): a candle-lit chapel cave in use - candelabra, chandeliers, a few new coffins on trestles, warm light.
//   'now'  (1797): the same rooms under a hundred years of coffins and bones - stacks against every wall, bone heaps, cold light, mist; the coffin
//                  corridor is walled up by coffins (cross at the room bell, walk through in 1697, cross back).
// One long hall into the screen (the camera rule: nothing tall between the camera and the hero): rooms are told apart by low banks, floor and dressing.
//   entry 0..400 · coffins 400..1000 · wedge 1000..1500 (the gap 1200..1400) · arena 1500..2100 · lamp 2100..2450 · riddle 2450..2800 · rest 2800..3000
//   · boss 3000..3700 (flat, 1000 x 700, pillars only at the far sides) · posts 3700..3900 (the four knell posts in a row before the sealed door)
// Section ids and labels are the story's (src/v2/data/text.js TEXT.sections.ossuary).
import { D, inChunk, rect } from './gen.js';

const X0 = 100, X1 = 1100, HW = 300;
const KP = [[250, 3872], [480, 3872], [720, 3872], [950, 3872]], KZ = 3760;   // the four knell posts (post 1..4, left to right). WORLD-3: the posts stand against the far wall (z 3872, were 3790 - the hero stood hidden in the strip behind them); their hot spots stay at z 3760
/**
 * flags (docs/v2/AREA_FORMAT.md 13): wedge_stone · wedge_wood (what was pushed into the gap in 1697) · knell_1..4 (1697) / knells_hung (tonight) ·
 * queen_fled (1697: the queen is here) · queen_sent (no boss) · elise_found (the sleeping girl is gone) · sera_follows is an actor `when`
 */
export function ossuary(era = 'now', flags = {}) {
  const now = era === 'now', past = !now, P = [], anchors = [], enemies = [], actors = [], interact = [], triggers = [];
  const add = (chunk, ...parts) => P.push(...inChunk(chunk, parts.flat()));
  const stone = !!flags.wedge_stone, woodW = !!flags.wedge_wood && !stone, WARM = [1, 0.66, 0.3], COLD = [0.55, 0.78, 1];
  // ───────────── floors (same in both nights) ─────────────
  const FL = (z, d, strips = [], mat = 'cellar') => ({ t: 'floor', x: X0, z, w: X1 - X0, d, mat: 'stone', kit: { mat, cell: 44, rag: 26, strips } });
  add('c1', FL(0, 400, [{ x0: 380, x1: 620, mat: 'flags' }]), FL(400, 600, [{ x0: 280, x1: 720, mat: 'slabs' }]), { t: 'blocker', x: 0, z: -60, w: 1200, d: 60, y: -300, h: 1500 });
  add('c2', FL(1000, 200, [{ x0: 380, x1: 620, mat: 'flags' }]), FL(1400, 100, [{ x0: 380, x1: 620, mat: 'flags' }]),
    { t: 'floor', x: X0, z: 1200, w: X1 - X0, d: 200, y: -240, walk: false, mat: 'stone', kit: { mat: 'slabs', cell: 60 } },   // the bottom of the gap (drawn only: a fall is the pit rule - 8 damage and back to the last safe ground)
    FL(1500, 600, [{ x0: 300, x1: 700, z0: 80, z1: 520, mat: 'flags' }]));
  add('c3', FL(2100, 350, [{ x0: 380, x1: 620, mat: 'flags' }]), FL(2450, 350, [{ x0: 300, x1: 700, z0: 60, z1: 300, mat: 'flags' }]), FL(2800, 200, [{ x0: 340, x1: 660, mat: 'slabs' }]));
  add('c4', FL(3000, 700, [{ x0: 200, x1: 800, z0: 100, z1: 600, mat: 'flags' }, { x0: 420, x1: 580, z0: 0, z1: 100, mat: 'slabs' }]), FL(3700, 200, [], 'flags'));
  // ───────────── walls (same in both nights) ─────────────
  const SCN = (side, us, len) => (past ? us.map((u) => ({ type: 'sconce', side, u: side === 'R' ? u : len - u, y: 140, lr: 300, li: 1.4 })) : []);
  const sideWalls = (chunk, z, d, butt, sc, B = { h: 230, d: 22, w: 44 }) => add(chunk,
    { t: 'wall', x: 0, z, w: 100, d, h: HW, mat: 'facade', kit: { style: 'rubble', lower: 'fieldstone', cell: 70, faces: 'R', cornice: true, loculi: { every: 230 }, buttress: butt.map((u) => ({ side: 'R', u, ...B })), hang: SCN('R', sc, d) } },   // loculi (DETAIL): burial niches with dressed frames in the side walls
    { t: 'wall', x: X1, z, w: 100, d, h: HW, mat: 'facade', kit: { style: 'rubble', lower: 'fieldstone', cell: 70, faces: 'L', cornice: true, loculi: { every: 230 }, buttress: butt.map((u) => ({ side: 'L', u: d - u, ...B })), hang: SCN('L', sc, d) } });
  // rock beyond the wall tops (drawn only): without it the raised camera looked over the side walls into black
  const rock = (chunk, z, d) => add(chunk, { t: 'floor', x: -1500, z, w: 1502, d, y: HW - 2, walk: false, mat: 'stone', kit: { mat: 'cellar', cell: 420 } }, { t: 'floor', x: X1 + 98, z, w: 1502, d, y: HW - 2, walk: false, mat: 'stone', kit: { mat: 'cellar', cell: 420 } });   // WORLD-LOOK: 1,500 wide (was 262: beyond it the picture was black)
  rock('c1', -60, 1060); rock('c2', 1000, 1100); rock('c3', 2100, 900); rock('c4', 3000, 990);
  // WORLD-LOOK: the rock the hall is cut into, left and right of the open front (it was empty there: the clear colour beside the side walls)
  add('far', { t: 'deco', mesh: 'farwall', x: -1100, y: -520, z: -60, x1: X0, z1: -60, h: HW + 1200, mat: 'fieldstone', piers: 520, k: 1.5, cell: 300 }, { t: 'deco', mesh: 'farwall', x: X1, y: -520, z: -60, x1: X1 + 1200, z1: -60, h: HW + 1200, mat: 'fieldstone', piers: 520, k: 1.5, cell: 300 },
    { t: 'deco', mesh: 'apron', x: 0, y: -4, z: 0.6, w: X1 + X0, d: 3, mat: 'fieldstone', k: 0.5, skirt: 520 });   // (a chunk of its own with one texture: the hall's four chunks keep their boxes)
  sideWalls('c1', -60, 1060, [460, 1060], [250, 760]); sideWalls('c2', 1000, 1100, [500, 1100], [120, 800]); sideWalls('c3', 2100, 900, [350, 700], [180, 540]); sideWalls('c4', 3000, 990, [150, 350, 550, 750], past ? [100, 250, 450, 650, 850] : [250, 650], { h: 292, d: 14, w: 84 });   // the last hall: four flat wall piers a side. WORLD-3: 14 deep instead of 40 - the hero (r 14) stood hidden in the bay behind a 40-deep pier, and pier + heap made nooks
  add('c4', { t: 'wall', x: 0, z: 3900, w: 1200, d: 90, h: HW + 60, mat: 'facade', kit: { style: 'stone', cell: 60, faces: 'F', plinth: 34, quoins: false, courses: [250], slits: false, mend: false, buttress: [{ u: 330, h: 300, d: 26, w: 40 }, { u: 870, h: 300, d: 26, w: 40 }] } });
  // the coffin corridor: low banks left and right (same walls both nights: candles and new coffins on them in 1697, a hundred years of coffins tonight)
  add('c1', { t: 'wall', x: X0, z: 400, w: 280, d: 600, h: 56, collideH: 800, mat: 'stone', kit: { style: 'low', faces: 'FR', coping: true } },
    { t: 'wall', x: 820, z: 400, w: 280, d: 600, h: 56, collideH: 800, mat: 'stone', kit: { style: 'low', faces: 'FL', coping: true } });
  // the door of the last hall: two tall pillars with fire bowls and low walls to the sides (a wall across would hide the hall)
  add('c3', { t: 'wall', x: X0, z: 2970, w: 320, d: 30, h: 56, collideH: 800, mat: 'stone', kit: { style: 'low', faces: 'F', coping: true, rail: 'F', piers: 106 } },
    { t: 'wall', x: 780, z: 2970, w: 320, d: 30, h: 56, collideH: 800, mat: 'stone', kit: { style: 'low', faces: 'F', coping: true, rail: 'F', piers: 106 } },
    { t: 'pillar', x: 450, z: 2985, r: 26, h: 80 }, { t: 'pillar', x: 750, z: 2985, r: 26, h: 80 },
    // WORLD-3: the bays between the corner statues and the outer knell posts are filled by a low bank (78 wide, they shut the hero in with the boss at the mouth)
    { t: 'wall', x: 158, z: 3846, w: 78, d: 54, h: 44, collideH: 800, mat: 'stone', kit: { style: 'low', faces: 'FLR', coping: true } }, { t: 'wall', x: 964, z: 3846, w: 78, d: 54, h: 44, collideH: 800, mat: 'stone', kit: { style: 'low', faces: 'FLR', coping: true } });   // waist-high fire posts (WORLD-3: 80, was 118 - seven cells of the fight floor behind each were hidden; nothing on or at the fight floor is taller than 104)
  // ───────────── things that stand in both nights at the same spots ─────────────
  const mute = past && woodW;   // WORLD-3 (AREA_FORMAT 14): the crate bridges the gap in 1697, but wood rots - the bells beyond it stay unlit and locked until the statue stands there
  const bell = (chunk, id, x, z, h = 136, ox = 26, far = false, seal = false) => {   // WORLD-3: 136 high (was 160: the strip hidden behind a post reached 140 into the next room)
    const off = far && mute;
    add(chunk, { t: 'prop', mesh: 'roadbell', x, z, h, solid: 14, solidZ: 12, solidH: h * 0.85, state: off ? 'empty' : now ? 'rusty' : 'hung', old: now || off, light: off ? null : { r: 190, i: 0.8, y: h * 0.7, c: now ? [0.6, 0.86, 0.9] : [1, 0.82, 0.5] } });
    interact.push({ id, kind: 'bell', x: x + ox, z: z - 28, r: 76, label: '종 치기', event: off ? 'bell.locked' : seal ? 'bell.sealed' : 'bell.ring', ...(off ? { locked: 'wedge_stone' } : {}) });   // CHAPTER: seal = the bell hangs and shines but the story answers its long ring with the dull toll (event bell.sealed)
  };
  bell('c1', 'bell_entry', 880, 300); bell('c1', 'bell_coffins', 760, 950); bell('c3', 'bell_riddle', 890, 2570, 136, 26, true); bell('c4', 'bell_arena', 1082, 3250, 104, -30, true, past && !flags.queen_fled);   // three room bells and the arena bell. CHAPTER: in 1697 the arena bell is sealed until the queen has fled through it - a crossing there used to set the hero down tonight inside her hall, behind the bread and her entrance (audit blocker 5). WORLD-3: the arena bell stands against the right wall of the last hall (it stood in the middle of the fight floor at (600, 3350)): a low standing bell between two piers, nothing behind it
  add('c1', { t: 'prop', mesh: 'mourner', x: 190, z: 350, h: 200, solid: 28, solidZ: 24 }, { t: 'prop', mesh: 'mourner', x: 1010, z: 350, h: 200, solid: 28, solidZ: 24, flip: true },
    { t: 'deco', mesh: 'skullwall', x: X0 + 8, z: 520, h: 170, rot: -Math.PI / 2 }, { t: 'deco', mesh: 'skullwall', x: X1 - 8, z: 780, h: 170, rot: Math.PI / 2 },   // skull niches set into the side walls above the banks (at the banks' far end they hid the hero in the room behind: 260 cells)
    { t: 'deco', mesh: 'cryptdoor', x: X0 + 4, z: 190, h: 200, rot: -Math.PI / 2 }, { t: 'deco', mesh: 'cryptdoor', x: X1 - 4, z: 150, h: 200, rot: Math.PI / 2 });
  add('c2', { t: 'prop', mesh: 'altar', x: 600, z: 2040, h: 104, solid: 100, solidZ: 40, solidH: 90, lit: past, light: past ? { r: 260, i: 1.2, y: 120, c: WARM } : null },
    { t: 'deco', mesh: 'cryptdoor', x: X0 + 4, z: 1760, h: 200, rot: -Math.PI / 2 }, { t: 'deco', mesh: 'cryptdoor', x: X1 - 4, z: 1820, h: 200, rot: Math.PI / 2 });
  add('c3', { t: 'prop', mesh: 'sarcophagus', x: 600, z: 2660, h: 100, solid: 100, solidZ: 46, solidH: 90 },
    { t: 'prop', mesh: 'sarcophagus', x: 190, z: 2620, h: 92, rot: Math.PI / 2, solid: 44, solidZ: 96, solidH: 84 }, { t: 'prop', mesh: 'sarcophagus', x: 1010, z: 2620, h: 92, rot: -Math.PI / 2, solid: 44, solidZ: 96, solidH: 84 },
    { t: 'prop', mesh: 'candelabrum', x: 780, z: 2280, h: 150, solid: 22, solidZ: 22, lit: true, light: { r: 360, i: 1.5, y: 142, c: now ? [0.9, 0.8, 0.6] : WARM } },   // the lantern stand (Sera stands here tonight)
    { t: 'block', x: 730, z: 2240, w: 100, d: 80, h: 10, kit: { mat: 'ashlar', top: 'flags' } });
  add('c4', { t: 'prop', mesh: 'cryptdoor', x: 600, z: 3884, h: 250, solid: 96, solidZ: 16 }, { t: 'deco', mesh: 'skullwall', x: 300, z: 3880, h: 170 }, { t: 'deco', mesh: 'skullwall', x: 900, z: 3880, h: 170, flip: true },
    { t: 'prop', mesh: 'mourner', x: 130, z: 3860, h: 210, solid: 28, solidZ: 24 }, { t: 'prop', mesh: 'mourner', x: 1070, z: 3860, h: 210, solid: 28, solidZ: 24, flip: true },
    ...KP.map(([x, z], i) => ({ t: 'prop', mesh: 'roadbell', x, z, h: 168, solid: 14, solidZ: 12, solidH: 140, state: (now ? flags.knells_hung : flags['knell_' + (i + 1)]) ? (now ? 'rusty' : 'hung') : 'empty', old: now })));
  // two chandeliers over the bell-post corridor, the same in both nights (lit in 1697, dead iron tonight). Only here: the camera is never closer than 650 to
  // them and the hero can never be 500 or more beyond them, so they cannot come between the camera and the hero (one over the arena filled the screen)
  for (const x of [365, 835]) add('c4', { t: 'deco', mesh: 'chandelier', x, y: 236, z: 3744, h: 120, lit: past, light: past ? { r: 480, i: 1.5, y: 20, c: WARM } : null },
    { t: 'deco', mesh: 'rope', x, y: 236 + 112, z: 3744, len: 190, chain: true });
  // ───────────── the gap: a stone statue or a wooden crate pushed in, in 1697 (GDD 2.3: stone stays, wood rots) ─────────────
  if (stone) add('c2', { t: 'prop', mesh: 'stoneblock', x: 600, z: 1300, y: -200, w: 170, d: 180, h: 200, solid: 85, solidZ: 90, solidH: 200, walk: true },     // the statue's plinth fills the gap: step across beside the figure
    { t: 'prop', mesh: 'mourner', x: 600, z: 1300, y: 0, h: 136, solid: 24, solidZ: 20 });
  else add('c2', { t: 'prop', mesh: 'stoneblock', x: 290, z: 1130, w: 84, d: 70, h: 30, solid: 42, solidZ: 35, solidH: 130 }, { t: 'deco', mesh: 'mourner', x: 290, y: 30, z: 1130, h: 170 });
  if (past) add('c2', woodW ? { t: 'prop', mesh: 'crate', x: 600, z: 1300, y: -200, w: 170, d: 180, h: 200, solid: 85, solidZ: 90, solidH: 200, walk: true, tint: [1.2, 0.98, 0.78] }
    : { t: 'prop', mesh: 'crate', x: 910, z: 1130, w: 120, d: 100, h: 104, solid: 60, solidZ: 50, solidH: 104 });
  else add('c2', woodW ? { t: 'deco', mesh: 'debris', x: 600, y: -240, z: 1300, w: 170 } : { t: 'deco', mesh: 'debris', x: 910, y: 0, z: 1130, w: 110 });   // a hundred years later the crate is a heap of rot (in the gap if it was pushed in)
  // CHAPTER: in 1697 a wooden screen shuts the inner chapel off behind the gap (wood rots: tonight only its rot is left). Without it the whole dungeon could be
  // walked in the empty night once the statue stood in the gap - past the wailing room's fight and Sera's lamp. The inner rooms of 1697 are reached by the bells beyond it.
  // (Two stone stubs stand at the sides in both nights; the wooden middle is 680 long: with more the chunk's wood would no longer fold into its oak texture - mats.js FOLDS.)
  add('c2', { t: 'wall', x: X0, z: 1484, w: 160, d: 20, h: 56, collideH: 800, mat: 'stone', kit: { style: 'low', faces: 'FR', coping: true } },
    { t: 'wall', x: X1 - 160, z: 1484, w: 160, d: 20, h: 56, collideH: 800, mat: 'stone', kit: { style: 'low', faces: 'FL', coping: true } });
  if (past) add('c2', { t: 'fence', kind: 'screen', x0: X0 + 160, z0: 1494, x1: X1 - 160, z1: 1494, h: 52 });   // DETAIL: kind 'screen' = the carpenter's panelled screen (kit.js woodScreen) - the same line, height and collision box as the wooden fence it was
  if (past) interact.push({ id: 'oss_wedge', kind: 'pull', x: 600, z: 1150, r: 120, label: '밀어 넣기', event: 'oss.wedge' });
  else triggers.push({ id: 'oss_gap', ...rect(300, 1110, 600, 70), event: 'oss.gap', once: false });
  // ───────────── the two nights ─────────────
  const cand = (chunk, x, z, o = {}) => add(chunk, { t: 'prop', mesh: 'candelabrum', x, z, h: 124, solid: 16, solidZ: 16, light: { r: 320, i: 1.5, y: 118, c: WARM }, ...o });   // WORLD-3: 124 high (was 170): a tall one hid the hero in a strip 140 long behind it
  if (past) {   // a chapel in use
    for (const [c, x, z] of [['c1', 150, 120], ['c1', 1050, 120], ['c2', 150, 1060], ['c2', 1050, 1060], ['c2', 150, 1560], ['c2', 1050, 1560], ['c2', 360, 2050], ['c2', 840, 2050], ['c3', 150, 2160], ['c3', 1050, 2400], ['c3', 150, 2840], ['c3', 1050, 2840]]) cand(c, x, z);
    // the last hall in 1697: nothing tall on the floor (WORLD-3: four candelabra stood here - a 30-wide slot to the wall, a dead-end nook, hidden cells). Low rows of
    // candles flush against the side walls between the piers instead (solid, 26 high), and more sconces on the walls
    for (const [x, z] of [[113, 3050], [1087, 3050], [113, 3250], [113, 3450], [1087, 3450], [113, 3650], [1087, 3650]]) add('c4', { t: 'prop', mesh: 'candles', x, z, n: 6, h: 26, solid: 13, solidZ: 30, solidH: 26, light: { r: 300, i: 1.3, y: 30, c: WARM } });
    add('c1', { t: 'deco', mesh: 'coffin', x: 240, y: 62, z: 560, h: 60 }, { t: 'deco', mesh: 'coffin', x: 250, y: 62, z: 760, h: 60, flip: true }, { t: 'deco', mesh: 'coffin', x: 950, y: 62, z: 640, h: 60 },
      { t: 'deco', mesh: 'candles', x: 330, y: 62, z: 470, n: 5, light: { r: 200, i: 1.0, y: 20 } }, { t: 'deco', mesh: 'candles', x: 870, y: 62, z: 820, n: 5, light: { r: 200, i: 1.0, y: 20 } }, { t: 'deco', mesh: 'candles', x: 340, y: 62, z: 900, n: 4, light: { r: 200, i: 1.0, y: 20 } });
    add('c2', { t: 'prop', mesh: 'coffin', x: 240, z: 1900, h: 62, solid: 58, solidZ: 22, solidH: 46 });
    add('c4', { t: 'deco', mesh: 'candles', x: 520, z: 3850, n: 6, light: { r: 220, i: 1.1, y: 20 } }, { t: 'deco', mesh: 'candles', x: 690, z: 3850, n: 6, light: { r: 220, i: 1.1, y: 20 } });
    add('c3', { t: 'deco', mesh: 'candles', x: 340, z: 2900, n: 6, light: { r: 220, i: 1.1, y: 20 } }, { t: 'deco', mesh: 'candles', x: 560, z: 2600, n: 3, light: { r: 180, i: 0.9, y: 20 } });
    anchors.push({ id: 'mist_low', kind: 'mist', x: 600, y: 0, z: 3300, size: 1.2 });
  } else {      // a hundred years of coffins and bones
    const ST = (chunk, x, z, o = {}) => { const h = Math.min(o.h ?? 104, 104); add(chunk, { t: 'prop', mesh: 'coffinstack', x, z, solid: h * 0.64, solidZ: h * 0.36, solidH: h * 0.87, ...o, h }); },   // WORLD-3: no stack on the floor is taller than 104 (150-170 hid the hero behind it: the camera's ray to his head clears 100 + 0.49 x distance)
      BP = (chunk, x, z, h = 56, o = {}) => add(chunk, { t: o.deco ? 'deco' : 'prop', mesh: 'bonepile', x, z, h, ...(o.deco ? {} : { solid: h * 1.1, solidZ: h * 0.8, solidH: h * 0.7 }), ...o });
    // the corridor is walled up: three stacks across the walk + stacks on both banks
    for (const [x, z, h, f] of [[450, 712, 110, 0], [600, 716, 110, 1], [750, 712, 110, 0], [525, 668, 96, 1], [675, 668, 96, 0]]) add('c1', { t: 'deco', mesh: 'coffinstack', x, z, h, flip: !!f });   // two low rows (WORLD-3: three stacks 150-170 high hid 73-80 cells right behind the wall, where a crossing at the corridor bell lands)
    add('c1', { t: 'blocker', x: 380, z: 640, w: 440, d: 130, h: 800 });
    for (const [x, z, f, hh] of [[230, 520, 0], [260, 700, 1], [215, 850, 0, 100], [960, 500, 1], [950, 670, 0], [970, 830, 1, 100]]) add('c1', { t: 'deco', mesh: 'coffinstack', x, y: 62, z, h: hh ?? 140, flip: !!f });   // the last one on each bank is low and stands back from the bank's end (it hid the hero in the next room)
    BP('c1', 170, 240); BP('c1', 1020, 250, 50); BP('c1', 440, 590, 44); BP('c1', 760, 830, 44, { deco: true });
    ST('c2', 190, 1050, { h: 130 }); ST('c2', 1010, 1460, { h: 130, flip: true }); BP('c2', 170, 1460); BP('c2', 1030, 1040, 50);
    ST('c2', 190, 1640); ST('c2', 1010, 1960, { flip: true }); ST('c2', 200, 2040, { h: 130 }); BP('c2', 1020, 1600, 60); BP('c2', 180, 1820, 52); BP('c2', 860, 2060, 46); BP('c2', 370, 2070, 40, { deco: true });
    ST('c3', 190, 2180); ST('c3', 1010, 2420, { flip: true }); BP('c3', 1020, 2180, 54); BP('c3', 180, 2420, 48); BP('c3', 1010, 2860, 56); ST('c3', 200, 2880, { h: 130 });
    ST('c4', 162, 3035, { h: 96 }); ST('c4', 1038, 3035, { h: 96, flip: true }); BP('c4', 146, 3450, 40); BP('c4', 1054, 3450, 40);   // flush in the corners and against the walls (no slot behind, nothing over 104) BP('c4', 420, 3860, 44, { deco: true }); BP('c4', 790, 3860, 44, { deco: true });
    add('c1', { t: 'light', x: 600, y: 150, z: 200, r: 420, c: COLD, i: 0.7 }, { t: 'light', x: 600, y: 140, z: 860, r: 380, c: COLD, i: 0.6 });
    add('c2', { t: 'light', x: 600, y: 160, z: 1300, r: 460, c: COLD, i: 0.7 }, { t: 'light', x: 600, y: 180, z: 1800, r: 560, c: COLD, i: 0.75 });
    add('c3', { t: 'light', x: 400, y: 150, z: 2640, r: 420, c: COLD, i: 0.7 }, { t: 'deco', mesh: 'candles', x: 340, z: 2900, n: 6, light: { r: 220, i: 1.1, y: 20 } });
    add('c4', { t: 'light', x: 600, y: 220, z: 3350, r: 700, c: COLD, i: 0.8 }, { t: 'light', x: 600, y: 160, z: 3780, r: 420, c: [0.7, 0.6, 1], i: 0.8 });
    for (const [x, z, s] of [[600, 500, 2], [600, 1300, 2.4], [600, 1800, 2.4], [600, 2600, 2], [600, 3350, 3]]) anchors.push({ id: 'mist_' + z, kind: 'mist', x, y: 0, z, size: s });
    anchors.push({ id: 'gap_fog', kind: 'fog_bank', x: 600, y: -120, z: 1300, size: 4 });
  }
  // DETAIL: the rest spot before the last hall is a place someone keeps (GDD: Lotte's bread) - a folded blanket and a kneeling board at the foot of the rail wall,
  // the bread basket, a jug and a bowl on its top. Flat things inside the wall's own collision skin: nothing to catch on (ENV_KIT 24)
  add('c3', { t: 'deco', mesh: 'keptplace', x: 322, z: 2966, w: 208, shelf: 62, back: 9, old: now });
  anchors.push({ id: 'door_fire_l', kind: 'fire', x: 450, y: 82, z: 2980, size: 0.65, light: true }, { id: 'door_fire_r', kind: 'fire', x: 750, y: 82, z: 2980, size: 0.65, light: true });   // size 0.65: a fire bowl on a pillar (the particle fire is the only flame here)
  add('c3', { t: 'deco', mesh: 'fire', x: 450, y: 80, z: 2978, w: 34, h: 44, n: 3, embers: false, light: { r: 420, i: 1.5, y: 20, c: now ? [0.7, 0.8, 1] : [1, 0.5, 0.2] } }, { t: 'deco', mesh: 'fire', x: 750, y: 80, z: 2978, w: 34, h: 44, n: 3, embers: false, light: { r: 420, i: 1.5, y: 20, c: now ? [0.7, 0.8, 1] : [1, 0.5, 0.2] } });
  // ───────────── people, enemies, hot spots ─────────────
  const N = [0, 1], S = [0, -1];
  if (now) {
    enemies.push(...[[520, 520], [690, 560]].map(([x, z]) => ({ kind: 'skeleton_soldier', x, z, group: 'oss_hall', rise: true })),
      ...[[350, 1800], [850, 1800], [600, 1930]].map(([x, z]) => ({ kind: 'grave_ghost', x, z, group: 'oss_arena', yard: true })), ...[[300, 1650], [900, 1650]].map(([x, z]) => ({ kind: 'skeleton_mage', x, z, group: 'oss_arena', yard: true })));
    if (!flags.queen_sent) enemies.push({ kind: 'banshee_queen', x: 600, z: 3600, group: 'boss', yard: true, face: S });
    actors.push({ id: 'sera', model: 'sera', x: 716, z: 2296, face: S, talk: 'sera.ossuary', pose: 'lantern', when: 'sera_follows' });
    triggers.push({ id: 'oss_coffins', ...rect(380, 500, 440, 60), event: 'oss.coffins', wake: 'oss_hall' }, { id: 'oss_arena', ...rect(X0, 1510, 1000, 50), event: 'oss.arena', wake: 'oss_arena' },
      { id: 'oss_lamp', ...rect(X0, 2110, 1000, 50), event: 'oss.lamp', once: false }, ...(flags.queen_sent ? [] : [{ id: 'boss_enter', ...rect(X0, 3010, 1000, 690), event: 'boss.enter', wake: 'boss', once: false }]));   // CHAPTER: the whole hall, every time the hero comes in (it was the doorway only: a hero set down inside by the arena bell got no entrance, and a queen put back to sleep by a fall or a crossing was not woken)
    interact.push({ id: 'oss_riddle', kind: 'sign', x: 600, z: 2600, r: 80, label: '닳은 석관', event: 'oss.riddle' }, { id: 'boss_rest', kind: 'rest', x: 340, z: 2890, r: 70, label: '촛불', event: 'rest' });
  } else {
    if (flags.queen_fled && !flags.queen_sent) { enemies.push({ kind: 'banshee_queen', x: 600, z: 3600, group: 'boss', yard: true, phase: 2, face: S }); triggers.push({ id: 'boss_hall', ...rect(X0, 3010, 1000, 690), event: 'boss.hall', wake: 'boss', once: false }); }   // CHAPTER: second act, asleep in her hall until the hero is there (she used to start awake and at full health: the scene carries her health over and takes her out again when she is driven - src/v2/game/chapter.js)
    interact.push(...KP.map(([x], i) => ({ id: 'knell_' + (i + 1), kind: 'bell', x, z: KZ, r: 110, label: '조종 걸기', event: 'oss.knell', data: { post: i + 1 } })), { id: 'past_rest', kind: 'rest', x: 340, z: 2890, r: 70, label: '촛불', event: 'rest' });
    if (!flags.elise_found) { actors.push({ id: 'elise', model: 'elise', x: 600, z: 3836, face: S, talk: 'elise.asleep', pose: 'sit', label: '살핀다', solid: false }); interact.push({ id: 'oss_elise', kind: 'sign', x: 600, z: 3810, r: 80, label: '엘리제', event: 'oss.elise' }); }   // CHAPTER: she sleeps under the altar of 1697 from the first visit (she was shown only after the queen was sent, while the lines of the chase speak of her)
  }
  const cam = (o = {}) => ({ yaw: 0, pitch: 26 * D, dist: 860, lookY: 34, leadX: 0, leadZ: 70, minX: 420, maxX: 780, zFollow: 1, tallK: 0.12, ...o });
  const SEC = [['entry', '납골당 어귀', -100, 400], ['coffins', '관의 복도', 400, 1000], ['wedge', '틈의 방', 1000, 1500], ['arena', '곡하는 방', 1500, 2100], ['lamp', '등불대의 방', 2100, 2450], ['riddle', '석관의 방', 2450, 2800], ['rest', '문 앞', 2800, 3000], ['boss', '맨 안', 3000, 3700], ['posts', '종대의 회랑', 3700, 4000]];
  return {
    id: 'ossuary_' + era, name: '배웅의 납골당', era, twin: 'ossuary_' + (now ? 'past' : 'now'),
    room: 'crypt', rooms: { boss: 'hall', posts: 'hall', arena: 'hall' }, music: 'ossuary_' + era,
    stage: {
      id: 'ossuary_' + era, name: '배웅의 납골당', wear: era,   // DETAIL: relief and wear of the walls in this night (ENV_KIT 24)
      sky: { img: 'bg/s02_graveyard', crop: 0.66, span: 84 * D, bottom: -7 * D, top: now ? [0.012, 0.016, 0.022] : [0.03, 0.02, 0.016] },
      fog: now ? { color: [0.035, 0.05, 0.065], near: 500, far: 2200, max: 0.97 } : { color: [0.07, 0.045, 0.03], near: 700, far: 2800, max: 0.94 },
      light: now ? { ambient: [0.25, 0.31, 0.38], moon: [0.3, 0.4, 0.5], moonDir: [-0.3, 0.9, -0.3], key: [0.26, 0.34, 0.46, 1.6], rimK: 1.8 } : { ambient: [0.34, 0.28, 0.24], moon: [0.4, 0.33, 0.28], moonDir: [-0.3, 0.9, -0.3], key: [0.3, 0.26, 0.22, 1.5], rimK: 1.6 },   // key / rimK: WORLD-LOOK (charr.js)
      sections: SEC.map(([id, label, z0, z1]) => ({ id, label, x0: 0, x1: 1200, z0, z1, cam: cam(id === 'boss' || id === 'posts' ? { pitch: 28 * D, dist: 940, minX: 380, maxX: 820, leadZ: 40 } : id === 'coffins' ? { minX: 560, maxX: 640 } : {}) })),
      chunks: [{ id: 'c1', z1: 1000 }, { id: 'c2', z1: 2100 }, { id: 'c3', z1: 3000 }, { id: 'c4', z1: Infinity }],
      parts: P,
      decals: [[600, 200, 'stain', 120, 70], [600, 800, 'crack', 80, 50], [420, 1100, 'puddle', 60, 36], [600, 1700, 'stain', 160, 100], [800, 1900, 'crack', 80, 50], [500, 2300, 'puddle', 54, 30], [600, 2740, 'stain', 110, 60], [600, 3200, 'crack', 110, 70], [400, 3500, 'stain', 150, 90], [800, 3560, 'puddle', 60, 40],
        ...(now ? [[300, 300, 'moss', 90, 50], [900, 1560, 'moss', 90, 60], [300, 2500, 'ash', 80, 50], [900, 3100, 'moss', 100, 60], [600, 3760, 'ash', 120, 50]] : [[600, 500, 'straw', 70, 40], [600, 3760, 'straw', 110, 40]])].map(([x, z, k, rx, rz]) => ({ k, x, z, rx, rz })),
    },
    spawns: {
      default: { x: 600, z: 110, face: N, section: 'entry' }, entry: { x: 600, z: 110, face: N, section: 'entry' }, wedge_far: { x: 600, z: 1450, face: N, section: 'wedge' },
      lamp: { x: 600, z: 2200, face: N, section: 'lamp' }, rest: { x: 600, z: 2880, face: N, section: 'rest' }, boss: { x: 600, z: 3120, face: N, section: 'boss' },
    },
    exits: [{ id: 'to_graveyard', ...rect(520, 0, 160, 40), to: 'graveyard_' + era, spawn: 'from_ossuary', label: '안개의 묘지', locked: null }],
    actors, enemies, triggers, interact, anchors,
    // BREAK (AREA_FORMAT 15): offering urns by the mourners, at the altar and beside the sarcophagi, a jar and a pot against the walls (never on the fight floor of the last hall)
    breakables: [
      { kind: 'urn', x: 248, z: 356 }, { kind: 'urn', x: 952, z: 356 },
      { kind: 'urn', x: 468, z: 2012 }, { kind: 'urn', x: 732, z: 2012 },
      { kind: 'jar', x: 140, z: 2330 }, { kind: 'urn', x: 178, z: 2356 },
      { kind: 'urn', x: 262, z: 2560 }, { kind: 'urn', x: 262, z: 2690 }, { kind: 'urn', x: 938, z: 2690 },
      { kind: 'pot', x: 1052, z: 2290 },
    ],
    knells: KP.map(([x, z], i) => ({ post: i + 1, x, z, y: 0, h: 120, hung: !!(now ? flags.knells_hung : flags['knell_' + (i + 1)]) })),   // the knell bells the whip strikes in the fight (PLAY / ENGINE)
    entry: stone ? [] : past ? (woodW ? ['lamp'] : ['wedge_far', 'lamp']) : ['wedge_far'],   // nothing in the gap yet (or only rot tonight): what lies beyond is reached by crossing at a bell further in, or not at all in this state. CHAPTER: in 1697 the rooms behind the wooden screen are reached only by those bells (with the statue in the gap the two nights' floods find them by themselves)
  };
}
