// Kling prompts for ART-ENEMY-5 (painted enemies of s12–s13, docs/art/ENEMY_PIPELINE.md §3):
//   s12 왕좌의 방:     vampire_bride demon_lord bat_swarm royal_guard
//   s13 심연의 역성:   chaos_spawn hellhound abyss_eye shadow_hunter void_demon
// Model kling-image-v3_0_omni, img_resolution 2k. The shared BG / STYLE suffixes are copied verbatim from
// tools/painted/enemies/prompts.mjs (identical across the cast = matches the portraits and the painted backdrops).
//
// Rig reuse (§6) keeps the budget small and keeps the cut coordinates: an "Edit 图片1" of a reference source keeps the
// composition, so the reference parts.json boxes/pivots still fit after a short check.
//   bat rig      → bat_swarm     (0 images: the bat atlas itself, one shared bake, instanced at LOD)
//   knight rig   → royal_guard   (edits of the cuirass, the limb sheet and the helm/sword sheet: crimson-and-gold
//                                 royal armour, plumed helm, the longsword becomes a halberd)
//   wolf rig     → hellhound     (edit of the body + edit of the legs/tail sheet: charred hound with lava cracks)
//   hero puppet  → shadow_hunter (the player's own painted puppet as a living shadow; own atlas = one painted shadow-smoke
//                                 FX sheet)
//   new creatures → reference + parts sheet(s): vampire_bride, chaos_spawn, abyss_eye, void_demon (T3), demon_lord (T3)
// Inputs (图片N) are uploaded JPG copies of the stored sources (manifest_art-enemy-5.json → uploads) or earlier results.
// Print one prompt:   node tools/painted/prompts/art-enemy-5.mjs <shot>
// Every call (kept and rejected images) is logged in tools/kling/manifest_art-enemy-5.json.

export const STYLE = 'Dark gothic horror fantasy 2D action game enemy art, highly detailed painterly digital illustration in the same style as dark gothic fantasy character art, clear readable silhouette with bold value contrast so it still reads when small, warm key light from the upper front, cool blue rim light from behind, no text, no letters, no numbers, no labels, no watermark.';
export const BG = 'Isolated on a plain flat uniform medium grey background (#808080), no floor, no ground, no cast shadow, no scenery, no border.';
const S = (s) => s.replace(/\s+/g, ' ').trim();
const SAME = 'Keep the exact same composition as 图片1: every piece stays in the same place with the same size, outline, pose and view, laid out apart on the same flat plain medium grey background, the same painting style and lighting.';
/** parts sheets (Step 2) — 图片1 = the chosen reference */
const sheet = (who, parts, extra = '') => S(`The same ${who} as in 图片1 (keep the identical design, proportions, colours, materials and painting style), redrawn as a cut-out puppet parts sheet for 2D skeletal animation: each piece painted separately and laid out apart in a loose grid with wide empty grey gaps between them, no piece touching or overlapping another. The ${parts.length} pieces are: ${parts.join('; ')}. Every piece is complete and whole, including the portions normally hidden behind other parts, all in the same strict side view facing right, same scale as each other. ${extra} ${BG} ${STYLE}`);

export const SHOTS = {
  // ── s12: royal guard (knight rig) ──────────────────────────────────────────────────────────────────────────────
  rg_torso: {
    tool: 'image_to_image', aspect: '3:4', n: 2, inputs: ['knight_torso'], for: ['royal_guard'],
    prompt: S(`Edit 图片1: this is now the ceremonial armour of a royal guard of a vampire king's throne room. The steel plates become deep crimson lacquered plate armour with polished bright gold filigree trim and gold rivets, a gold sunburst crest with a small red gem in the middle of the breastplate, and the tabard becomes a rich dark navy blue velvet cloth with a gold embroidered border and gold fringe. ${SAME} ${BG} ${STYLE}`),
  },
  rg_sheet1: {
    tool: 'image_to_image', aspect: '4:3', n: 2, inputs: ['knight_sheet1'], for: ['royal_guard'],
    prompt: S(`Edit 图片1: every knight and every armour piece becomes the ceremonial armour of a royal guard of a vampire king's throne room: deep crimson lacquered plate armour with polished bright gold filigree trim and gold rivets, glowing golden eyes in the visor instead of red, the cape becomes a dark navy blue velvet royal cape with a gold embroidered hem, the shield becomes a crimson tower shield with a raised gold cross and a gold rim. ${SAME} ${BG} ${STYLE}`),
  },
  rg_sheet2: {
    tool: 'image_to_image', aspect: '4:3', n: 2, inputs: ['knight_sheet2'], for: ['royal_guard'],
    prompt: S(`Edit 图片1: the two knights become a royal guard of a vampire king's throne room: deep crimson lacquered plate armour with polished bright gold filigree trim, a tall flowing crimson horsehair plume on top of the helmet, glowing golden eyes in the visor instead of red, the cloth becomes dark navy blue velvet with gold trim, the shield becomes a crimson tower shield with a raised gold cross and a gold rim. The longsword becomes a royal halberd standing straight up in the same place: a long straight dark wooden shaft with gold bands, at the top a broad crescent axe blade of polished steel with gold inlay on one side, a sharp back hook on the other side and a long spear point on top, a crimson tassel tied below the head. ${SAME} ${BG} ${STYLE}`),
  },
  // ── s13: hellhound (wolf rig) ──────────────────────────────────────────────────────────────────────────────────
  hh_body: {
    tool: 'image_to_image', aspect: '4:3', n: 2, inputs: ['wolf_body'], for: ['hellhound'],
    prompt: S(`Edit 图片1: turn this wolf into a hellhound born in lava: charred black and dark ember-red fur with glowing orange lava cracks in the skin between the tufts, the bristling mane and hackles along the neck and back are made of flickering orange and yellow flames, a short curved black horn on the forehead, blazing yellow-orange eyes, the open jaws glow orange-hot inside with molten metal drool dripping instead of blood. ${SAME} ${BG} ${STYLE}`),
  },
  hh_legs: {
    tool: 'image_to_image', aspect: '16:9', n: 2, inputs: ['wolf_legs'], for: ['hellhound'],
    prompt: S(`Edit 图片1: turn every piece into the legs and tail of a hellhound born in lava: charred black and dark ember-red fur with glowing orange lava cracks, black claws glowing red-hot at the tips, the bushy tail ends in a tuft of flickering orange and yellow flames. ${SAME} ${BG} ${STYLE}`),
  },
  // ── s13: shadow hunter (hero puppet reuse): painted shadow FX sheet ────────────────────────────────────────────
  shadow_fx: {
    tool: 'text_to_image', aspect: '16:9', n: 2, for: ['shadow_hunter'],
    prompt: S(`Game visual effect sprite sheet: separate pieces of living shadow laid out apart in a loose row with wide empty grey gaps between them, no piece touching or overlapping another. The pieces are: three tall curling wisps of thick inky black shadow smoke rising upward, each with a violet glowing rim and small purple sparks; one wide flat pool of black shadow liquid seen from the side with short tendrils clawing upward; two long thin shadow tendrils curling like reaching fingers, black with violet glowing edges. ${BG} ${STYLE}`),
  },
  // ── s12: vampire bride (new, T2) ───────────────────────────────────────────────────────────────────────────────
  bride_ref: {
    tool: 'text_to_image', aspect: '3:4', n: 2, for: ['vampire_bride'],
    prompt: S(`A vampire bride of Dracula floating above the floor of a gothic throne room: a slender undead woman with pale ashen-white skin, long straight black hair flowing down her back, glowing red eyes, dark red lips with small fangs and a trickle of blood at the corner of the mouth, a silver tiara with a red gem, a long torn white lace bridal veil trailing far behind her, a tattered white and pale grey wedding gown with a high lace collar and long sleeves, the skirt stained with blood and its hem torn into ragged strips that dissolve into red mist, long black claw-like fingernails, in her far hand a small bouquet of withered black roses. Strict side view in profile facing right, full body, floating upright, the arms held slightly away from the body. ${BG} ${STYLE}`),
  },
  // ── s12: demon lord (new, T3) ──────────────────────────────────────────────────────────────────────────────────
  dl_ref: {
    tool: 'text_to_image', aspect: '3:4', n: 2, for: ['demon_lord'],
    prompt: S(`A towering demon lord of hell guarding a vampire king's throne: a huge muscular demon with dark maroon-black skin split by glowing orange lava cracks, two enormous curled ram horns, blazing amber eyes and a fanged snarl, black plate armour with gold trim on the chest, spiked black pauldrons and an armoured belt with a glowing orange gem, a tattered black and crimson cape, large leathery bat wings folded behind the back, a thick demon tail, digitigrade goat legs ending in black cloven hooves. In his near hand he holds a huge jagged black greatsword wreathed in flames pointing down and forward. Strict side view in profile facing right, full body from horns to hooves, standing, the arms held slightly away from the body, the legs slightly apart. ${BG} ${STYLE}`),
  },
  // ── s13: chaos spawn (new, T1) ─────────────────────────────────────────────────────────────────────────────────
  chaos_ref: {
    tool: 'text_to_image', aspect: '1:1', n: 2, for: ['chaos_spawn'],
    prompt: S(`A chaos spawn, a horrible lump of living chaos flesh: a squat round blob of glistening dark purple and black flesh with pulsing magenta veins, covered with many mismatched eyes of different sizes (bloodshot red and amber irises with slit pupils) and two wide mouths full of crooked teeth, several short slimy tentacles sprouting from its sides and top. Seen from the side facing right, resting on its flat underside. ${BG} ${STYLE}`),
  },
  // ── s13: abyss eye (new, T1) ───────────────────────────────────────────────────────────────────────────────────
  eye_ref: {
    tool: 'text_to_image', aspect: '1:1', n: 2, for: ['abyss_eye'],
    prompt: S(`An abyss eye, a huge floating eyeball demon from the bottom of the abyss: one giant bloodshot eye with a fiery red-orange iris and a black slit pupil, set in a round wrinkled sac of dark purple-red flesh with heavy fleshy eyelids, thick veins crawling over the flesh, many long writhing tentacles hanging below it with glowing red tips. Front view, the eye looking straight at the viewer, floating. ${BG} ${STYLE}`),
  },
  // ── s13: void demon (new, T3) ──────────────────────────────────────────────────────────────────────────────────
  void_ref: {
    tool: 'text_to_image', aspect: '3:4', n: 2, for: ['void_demon'],
    prompt: S(`A void demon floating in the air: a tall gaunt demonic figure whose whole body is a window into a starless night sky, black and deep indigo skin filled with purple nebula clouds and tiny glittering stars, a crown of long black horns on its head, two blank glowing white eyes, long thin arms with long black clawed fingers, the lower body has no legs and trails away below the waist into long tattered wisps of dark violet void mist, a thin ring of violet light hovering behind its head. Strict side view in profile facing right, full body, floating upright, the arms held slightly away from the body. ${BG} ${STYLE}`),
  },
};

// ── Step 2 parts sheets (written after the references were chosen; 图片1 = the chosen reference) ─────────────────
Object.assign(SHOTS, {
  bride_sheet: {
    tool: 'image_to_image', aspect: '4:3', n: 2, inputs: ['bride_ref'], for: ['vampire_bride'],
    prompt: sheet('vampire bride', [
      'the head with the silver tiara, the calm face with closed lips and the long black hair falling behind the head',
      'the same head screaming, the mouth wide open showing the fangs, the eyes glowing brighter',
      'the torso and the whole gown from the neck down to the ragged bloody hem that dissolves into red mist (no head, no arms)',
      'the long torn white lace veil alone, flowing out horizontally',
      'one upper arm in the long lace sleeve',
      'one forearm in the lace sleeve with the pale hand open and the long black claws spread',
      'the small bouquet of withered black roses',
    ]),
  },
  dl_sheet: {
    tool: 'image_to_image', aspect: '4:3', n: 2, inputs: ['dl_ref'], for: ['demon_lord'],
    prompt: sheet('demon lord', [
      'the head with the two enormous curled ram horns and the snarling face',
      'the massive torso with the black-and-gold breastplate, the spiked pauldrons and the armoured belt with the glowing gem (no head, no arms, no legs, no wings, no cape)',
      'one huge muscular upper arm',
      'one forearm with the clawed hand clenched in a fist',
      'one forearm with the clawed hand open, palm forward, fingers spread',
      'one thick muscular thigh',
      'one digitigrade goat lower leg from the knee down to the black cloven hoof',
    ]),
  },
  dl_props: {
    tool: 'image_to_image', aspect: '4:3', n: 2, inputs: ['dl_ref'], for: ['demon_lord'],
    prompt: S(`Game prop sheet painted in exactly the same style, colours, materials and lighting as the demon lord in 图片1: separate objects laid out apart with wide empty grey gaps between them, no object touching or overlapping another, every object complete and whole, nothing held by anybody. Across the top: one of his leathery bat wings alone, fully spread flat and seen from the side, the dark maroon membrane stretched between long black finger bones, the shoulder joint at the left end of the object. In the middle: his huge jagged black greatsword wreathed in orange flames lying perfectly horizontal with the point to the right and the hilt to the left. At the bottom left: his tattered black and crimson cape hanging straight down. At the bottom right: his thick demon tail with an arrowhead spade tip lying horizontal with the root on the left. ${BG} ${STYLE}`),
  },
  chaos_sheet: {
    tool: 'image_to_image', aspect: '4:3', n: 2, inputs: ['chaos_ref'], for: ['chaos_spawn'],
    prompt: sheet('chaos spawn', [
      'the round blob body with all its eyes and its two mouths closed, without any tentacles',
      'the same blob body swollen bigger and rounder with both mouths gaping wide open and all eyes bulging, without any tentacles',
      'one long slimy tentacle alone lying straight and horizontal with the thick root on the left and the thin tip on the right',
    ], 'The tentacle is as long as the blob is wide.'),
  },
  eye_sheet: {
    tool: 'image_to_image', aspect: '4:3', n: 2, inputs: ['eye_ref'], for: ['abyss_eye'],
    prompt: S(`The same abyss eye as in 图片1 (keep the identical design, colours, materials and painting style), redrawn as a cut-out puppet parts sheet for 2D animation: each piece painted separately and laid out apart with wide empty grey gaps between them, no piece touching or overlapping another. The 4 pieces are: the round flesh sac with the heavy eyelids around the eye, the eyeball inside is a plain white bloodshot eyeball WITHOUT any iris and without any pupil (blank white eye), front view; the iris alone as a flat round disc, fiery red-orange with a black vertical slit pupil, front view; the heavy fleshy upper eyelid alone as one curved piece; one long tentacle alone lying straight and horizontal with the thick root on the left and the glowing red tip on the right. Every piece is complete and whole. ${BG} ${STYLE}`),
  },
  void_sheet: {
    tool: 'image_to_image', aspect: '4:3', n: 2, inputs: ['void_ref'], for: ['void_demon'],
    prompt: sheet('void demon', [
      'the head with the crown of long black horns and the two glowing white eyes',
      'the torso from the neck down to the long tattered wisps of violet void mist trailing below the waist (no head, no arms)',
      'one long thin upper arm',
      'one long thin forearm with the hand open and the long black clawed fingers spread',
    ], 'The body is filled with the purple nebula and tiny stars everywhere.'),
  },
});

if (process.argv[1]?.endsWith('art-enemy-5.mjs') && process.argv[2]) console.log(SHOTS[process.argv[2]]?.prompt ?? `unknown shot ${process.argv[2]}`);
