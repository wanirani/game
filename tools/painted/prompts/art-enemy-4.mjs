// Kling prompts for ART-ENEMY-4 (painted enemies of s10–s11, docs/art/ENEMY_PIPELINE.md §3):
//   s10 얼어붙은 첨탑: ice_golem frost_wraith snow_wolf frozen_knight ice_bat
//   s11 피의 예배당:   succubus blood_priest bone_angel death_knight cursed_nun
// Model kling-image-v3_0_omni, img_resolution 2k. The shared BG / STYLE suffixes are copied verbatim from
// tools/painted/enemies/prompts.mjs (identical across the cast = matches the portraits and the painted backdrops).
//
// Rig reuse (§6) keeps the budget small and — more important — keeps the cut coordinates: an "Edit 图片1" of a reference
// source keeps the composition, so the reference parts.json boxes/pivots still fit after a short check.
//   bat sources    → ice_bat       (edit of the flying body + edit of the wing/cocoon sheet; the bat renderer drawBat is reused)
//   wolf sources   → snow_wolf     (edit of the body + edit of the legs/tail sheet)
//   knight sources → frozen_knight (edits of the cuirass, the limb sheet and the helm/sword sheet: ice-bound armour + ice greatsword)
//                    death_knight  (same three edits: blackened armour, horned helm, soul fire, runed greatsword; T3 damage bake)
//   ghost sources  → frost_wraith  (edit of the ghost sheet: hooded frozen pilgrim with the ice crown)
//   skeleton edit  → bone_angel    (edit of the armless skeleton side view: rags + broken halo; wings/spear from a props sheet)
//   new creatures  → reference + parts sheet: ice_golem (T3), succubus, blood_priest, cursed_nun
// Inputs (图片N) are uploaded JPG copies of the stored sources (manifest_art-enemy-4.json → uploads).
// Print one prompt:   node tools/painted/prompts/art-enemy-4.mjs <shot>
// Every call (kept and rejected images) is logged in tools/kling/manifest_art-enemy-4.json.

export const STYLE = 'Dark gothic horror fantasy 2D action game enemy art, highly detailed painterly digital illustration in the same style as dark gothic fantasy character art, clear readable silhouette with bold value contrast so it still reads when small, warm key light from the upper front, cool blue rim light from behind, no text, no letters, no numbers, no labels, no watermark.';
export const BG = 'Isolated on a plain flat uniform medium grey background (#808080), no floor, no ground, no cast shadow, no scenery, no border.';
const S = (s) => s.replace(/\s+/g, ' ').trim();
const SAME = 'Keep the exact same composition as 图片1: every piece stays in the same place with the same size, outline, pose and view, laid out apart on the same flat plain medium grey background, the same painting style and lighting.';

export const SHOTS = {
  // ── s10: ice bat (bat rig) ─────────────────────────────────────────────────────────────────────────────────────
  icebat_fly: {
    tool: 'image_to_image', aspect: '1:1', n: 2, inputs: ['bat_body_fly'], for: ['ice_bat'],
    prompt: S(`Edit 图片1: turn this bat into a frost bat from a frozen mountain spire. Its fur becomes pale frosty blue-white with frozen tips and tiny icicles, the big ears become translucent pale blue ice crystal with sharp facets, the eyes glow icy white-cyan, the nose and mouth are pale blue-grey with white fangs and a thin frost breath, a small icicle hangs from its chin. ${SAME} No cast shadow under it. ${BG} ${STYLE}`),
  },
  icebat_sheet: {
    tool: 'image_to_image', aspect: '4:3', n: 2, inputs: ['bat_sheet1'], for: ['ice_bat'],
    prompt: S(`Edit 图片1: turn all three pieces into a frost bat from a frozen mountain spire. The sitting bat and the bat wrapped in its wings get pale frosty blue-white fur with frozen tips, translucent pale blue ice crystal ears and icy white-cyan eyes. The wing membrane becomes translucent frosted pale blue ice with glowing cracks and frost patterns, the finger bones become pale blue-white bone crusted with ice crystals, small icicles hang from the lower edge of the membrane. The wrapping wings of the hanging bat become frosted pale blue with icicles. ${SAME} No cast shadow. ${BG} ${STYLE}`),
  },
  // ── s10: snow wolf (wolf rig) ──────────────────────────────────────────────────────────────────────────────────
  snowwolf_body: {
    tool: 'image_to_image', aspect: '4:3', n: 2, inputs: ['wolf_body'], for: ['snow_wolf'],
    prompt: S(`Edit 图片1: turn this wolf into a silver snow wolf from a frozen mountain spire. Thick shaggy silver-white fur with pale blue-grey shadows, frost and small icicles hanging from the belly and the hackles, glowing icy cyan eyes, a pale grey muzzle with white fangs and a frosty breath, no blood at all, the inside of the ears pale grey-pink. ${SAME} ${BG} ${STYLE}`),
  },
  snowwolf_legs: {
    tool: 'image_to_image', aspect: '16:9', n: 2, inputs: ['wolf_legs'], for: ['snow_wolf'],
    prompt: S(`Edit 图片1: turn every piece into the legs and tail of a silver snow wolf from a frozen mountain spire: thick shaggy silver-white fur with pale blue-grey shadows, frost crystals and small icicles in the fur, pale grey claws, no blood. ${SAME} ${BG} ${STYLE}`),
  },
  // ── s10: frozen knight (knight rig) ────────────────────────────────────────────────────────────────────────────
  fk_torso: {
    tool: 'image_to_image', aspect: '3:4', n: 2, inputs: ['knight_torso'], for: ['frozen_knight'],
    prompt: S(`Edit 图片1: this is now the armour of a knight who froze to death climbing an icy spire. The steel plates become frost-covered pale blue-grey steel, the gold trim becomes tarnished silver-blue, thick clear blue ice crusts grow over the pauldrons and the plates with sharp ice crystal spikes jutting up from the shoulders, small icicles hang from every lower edge, the red tabard becomes a stiff frozen dark navy blue cloth rimed with white frost and icicles. ${SAME} ${BG} ${STYLE}`),
  },
  fk_sheet1: {
    tool: 'image_to_image', aspect: '4:3', n: 2, inputs: ['knight_sheet1'], for: ['frozen_knight'],
    prompt: S(`Edit 图片1: every knight and every armour piece becomes the armour of a knight who froze to death climbing an icy spire: frost-covered pale blue-grey steel plates, tarnished silver-blue trim instead of gold, thick clear blue ice crusts with sharp ice crystal spikes on the pauldrons, gauntlets and greaves, small icicles hanging from the lower edges, glowing icy white-cyan eyes in the visor instead of red, the red cloth and cape become stiff frozen dark navy blue cloth rimed with white frost, the shield becomes frosted dark blue wood. ${SAME} ${BG} ${STYLE}`),
  },
  fk_sheet2: {
    tool: 'image_to_image', aspect: '4:3', n: 2, inputs: ['knight_sheet2'], for: ['frozen_knight'],
    prompt: S(`Edit 图片1: the two knights become a knight who froze to death climbing an icy spire: frost-covered pale blue-grey steel plates, tarnished silver-blue trim instead of gold, thick clear blue ice crusts with sharp ice crystal spikes jutting from the helmet crest and the pauldrons, icicles hanging from the lower edges, glowing icy white-cyan eyes in the visor instead of red, the red cloth becomes frozen dark navy blue cloth rimed with frost. The longsword becomes a huge two-handed greatsword with a long broad blade of translucent glowing pale blue ice with jagged crystal edges, a silver-blue crossguard crusted with ice and a long frost-wrapped grip. ${SAME} ${BG} ${STYLE}`),
  },
  // ── s11: death knight (knight rig, T3) ─────────────────────────────────────────────────────────────────────────
  dk_torso: {
    tool: 'image_to_image', aspect: '3:4', n: 2, inputs: ['knight_torso'], for: ['death_knight'],
    prompt: S(`Edit 图片1: this is now the armour of a death knight who sold his soul to Death: blackened gunmetal plates with a faint green sheen, the gold trim becomes dull bone-white and tarnished bronze, jagged bone spikes jut up from both pauldrons, a small grinning skull emblem riveted to the centre of the breastplate with its eye sockets glowing sickly green, thin cracks in the plates leak a faint green soul glow, the red tabard becomes a tattered black cloth with a dark green hem. ${SAME} ${BG} ${STYLE}`),
  },
  dk_sheet1: {
    tool: 'image_to_image', aspect: '4:3', n: 2, inputs: ['knight_sheet1'], for: ['death_knight'],
    prompt: S(`Edit 图片1: every knight and every armour piece becomes the armour of a death knight who sold his soul to Death: blackened gunmetal plates with a faint green sheen, dull bone-white and tarnished bronze trim instead of gold, jagged bone spikes on the pauldrons, gauntlets and greaves, eerie green soul fire glowing inside the visor slit instead of red eyes, a small skull emblem on the breastplate, the red cloth, cape and shield face become tattered black cloth and black wood with a dark green trim. ${SAME} ${BG} ${STYLE}`),
  },
  dk_sheet2: {
    tool: 'image_to_image', aspect: '4:3', n: 2, inputs: ['knight_sheet2'], for: ['death_knight'],
    prompt: S(`Edit 图片1: the two knights become a death knight who sold his soul to Death: blackened gunmetal plates with a faint green sheen, dull bone-white and tarnished bronze trim instead of gold, two long curved black horns sweeping back from the helmet, eerie green soul fire glowing inside the visor slit instead of red eyes, jagged bone spikes on the pauldrons, tattered black cloth with a dark green trim instead of red. The longsword becomes a huge two-handed black greatsword with a broad dark steel blade engraved with glowing green runes along its fuller, a bone-white crossguard shaped like ribs and a pommel with a glowing green gem. ${SAME} ${BG} ${STYLE}`),
  },
  // ── s10: frost wraith (ghost pipeline) ─────────────────────────────────────────────────────────────────────────
  fw_sheet: {
    tool: 'image_to_image', aspect: '4:3', n: 2, inputs: ['ghost_sheet1'], for: ['frost_wraith'],
    prompt: S(`Edit 图片1: all three pieces become a frost wraith, the vengeful ghost of a pilgrim who froze to death in a blizzard. The shroud becomes a tattered pale blue-grey hooded pilgrim robe crusted with frost and hung with small icicles, fading to translucent icy mist at the hem. Inside the deep hood the face is a black void with two glowing icy white-cyan eyes and a faint skull jaw. A jagged crown of sharp clear blue ice crystals rises from the top of the hood. The bony hands are pale blue-white with long icicle claws. ${SAME} There is no mist on the background. ${BG} ${STYLE}`),
  },
  // ── s11: bone angel (skeleton rig) ─────────────────────────────────────────────────────────────────────────────
  angel_body: {
    tool: 'image_to_image', aspect: '3:4', n: 2, inputs: ['skeleton_edit'], for: ['bone_angel'],
    prompt: S(`Edit 图片1: turn this skeleton into a fallen bone angel of a desecrated chapel. The bones become old ivory with gilded cracks, the skull wears a broken golden halo floating just above its crown (a thin ring of gold light cracked into pieces) and its eye sockets glow pale gold, the loincloth becomes long tattered ivory-white temple rags hanging from the hips down past the knees, a golden sash across the ribs, the legs end in bony feet. Keep everything else exactly identical to 图片1: the same skeleton, the same pose, the same position and size in the frame, the same strict side view facing right, the same painting style and lighting, the same flat plain medium grey background. No arms, no wings.`),
  },
  angel_props: {
    tool: 'image_to_image', aspect: '4:3', n: 2, inputs: ['skeleton_ref'], for: ['bone_angel'],
    prompt: S(`Game prop sheet painted in exactly the same style, bone colour and lighting as the skeleton in 图片1: separate objects laid out apart with wide empty grey gaps between them, no object touching or overlapping another, every object complete and whole. Across the upper half: one huge angel wing made of old ivory bones, a long arm-like bone spar along the top edge with a jointed bony wrist, and long ragged white feathers yellowed at the tips hanging from it, some feathers torn and missing, spread flat and seen from the side, the shoulder joint at the left end of the object. Below it: a long bone lance lying perfectly horizontal across the width of the image with the point to the right, a shaft of fused vertebrae, a long sharp polished bone spearhead with gold filigree. In the lower right corner: one skeletal upper arm bone and one skeletal forearm with an open bony hand, both old ivory with gilded cracks, lying straight and vertical. ${BG} ${STYLE}`),
  },
  // ── s10: ice golem (new, T3) ───────────────────────────────────────────────────────────────────────────────────
  golem_ref: {
    tool: 'text_to_image', aspect: '3:4', n: 2, for: ['ice_golem'],
    prompt: S(`A hulking ice golem giant from a frozen mountain spire, built of huge jagged blocks of clear blue glacier ice and white packed snow: a massive hunched crystal torso, a small head sunk between enormous shoulders with a crown of ice shards and two glowing white-cyan eyes in a dark crack, a glowing pale cyan crystal heart shining through the chest, enormous long arms ending in heavy fists of spiked ice crystals, short thick legs of stacked ice blocks, frost and snow clinging in the cracks, icicles hanging from the arms. Strict side view in profile facing right, full body from head to feet, standing hunched forward, the arms held slightly away from the body, the legs slightly apart. ${BG} ${STYLE}`),
  },
  // ── s11: succubus (new) ────────────────────────────────────────────────────────────────────────────────────────
  succ_ref: {
    tool: 'text_to_image', aspect: '3:4', n: 2, for: ['succubus'],
    prompt: S(`A succubus demoness of a blood chapel, a slender winged female demon: pale rose-grey skin, long flowing dark plum-purple hair, two curved black horns sweeping back from her forehead, glowing pink eyes, dark crimson lips with small fangs, a fully covering black and crimson gothic leather armoured bodysuit with a laced corset, high black boots with crimson trim and long black gloves with sharp clawed fingertips, large dark crimson bat wings with black bones on her back, a thin black demon tail ending in a small heart-shaped spade tip. Strict side view in profile facing right, full body from head to feet, hovering in the air, the arms held slightly away from the body, the wings spread behind, the near knee slightly raised. ${BG} ${STYLE}`),
  },
  // the first succ_ref came back far too revealing (and posed from behind): the retake asks for a covered battle gown
  succ_ref_b: {
    tool: 'text_to_image', aspect: '3:4', n: 2, for: ['succubus'],
    prompt: S(`A winged demoness of a blood chapel, tall and slender: pale ashen-rose skin, long flowing dark plum-purple hair, two curved black ram-like horns, glowing pink eyes, a cruel stern face with dark crimson lips. She wears a long high-collared black gothic battle gown with a crimson lining that covers her from the neck down to the ankles, ornate crimson-lacquered armour plates on the shoulders, the bodice and the forearms, the skirt split at the front and flaring behind, high black armoured boots, long black gauntlets ending in sharp claws, huge dark crimson bat wings with black bones, a thin black demon tail with a heart-shaped spade tip. Strict side view in profile facing right, full body from head to feet, hovering in the air, the arms held slightly away from the body, the wings spread behind her, the near knee slightly raised. ${BG} ${STYLE}`),
  },
  // ── s11: blood priest (new) ────────────────────────────────────────────────────────────────────────────────────
  priest_ref: {
    tool: 'text_to_image', aspect: '3:4', n: 2, for: ['blood_priest'],
    prompt: S(`A corrupt blood priest of a vampire lord's chapel: a gaunt pale old man with sunken cheeks, glowing red eyes and a thin bloody smile, a tall pointed deep crimson bishop's mitre with gold trim and a blood-drop emblem, a long heavy deep crimson liturgical robe with gold embroidery reaching the floor, a black stole with gold crosses hanging down the front, a white fur-trimmed shoulder cape, the hem of the robe soaked dark with blood. In his near hand he raises a golden chalice overflowing with blood, from his far hand hangs a golden rosary. Strict side view in profile facing right, full body from head to feet, standing upright, the arms held slightly away from the body. ${BG} ${STYLE}`),
  },
  // ── s11: cursed nun (new) ──────────────────────────────────────────────────────────────────────────────────────
  nun_ref: {
    tool: 'text_to_image', aspect: '3:4', n: 2, for: ['cursed_nun'],
    prompt: S(`A cursed nun of a desecrated chapel floating above the floor: a long black nun's habit whose hem dissolves into ragged tatters and dark purple mist, a white coif and collar, a long black veil flowing behind her, a pale gaunt face with a white cloth blindfold over her eyes stained with a single tear of blood, dark lips, strands of black hair escaping the veil, her pale hands pressed together in an inverted prayer holding a rosary with an upside-down cross that glows violet. Strict side view in profile facing right, full body, floating upright, the head bowed slightly, the arms held slightly away from the body. ${BG} ${STYLE}`),
  },
};

/** parts sheets (Step 2) — written after the reference is chosen (图片1 = the chosen reference) */
const sheet = (who, parts) => S(`The same ${who} as in 图片1 (keep the identical design, proportions, colours, materials and painting style), redrawn as a cut-out puppet parts sheet for 2D skeletal animation: each piece painted separately and laid out apart in a loose grid with wide empty grey gaps between them, no piece touching or overlapping another. The ${parts.length} pieces are: ${parts.join('; ')}. Every piece is complete and whole, including the portions normally hidden behind other parts, all in the same strict side view facing right, same scale as each other. ${BG} ${STYLE}`);
Object.assign(SHOTS, {
  golem_sheet: {
    tool: 'image_to_image', aspect: '4:3', n: 2, inputs: ['golem_ref'], for: ['ice_golem'],
    prompt: sheet('ice golem', [
      'the hunched crystal torso with the glowing cyan crystal heart and the shoulders (no head, no arms, no legs)',
      'the small head with the crown of ice shards and the glowing eyes',
      'one massive upper arm of ice blocks',
      'one forearm ending in the huge fist of spiked ice crystals',
      'one thick thigh of stacked ice blocks',
      'one lower leg with a broad flat foot of ice',
    ]),
  },
  succ_sheet: {
    tool: 'image_to_image', aspect: '4:3', n: 2, inputs: ['succ_ref_b'], for: ['succubus'],
    prompt: sheet('winged demoness', [
      'the head with the curved horns, the face and the long flowing hair',
      'the torso: the bodice of the black gown with the crimson trim from the neck to the waist (no head, no arms, no wings, no skirt)',
      'the long flowing split skirt of the gown from the waist to the ragged hem, black outside with the crimson lining (no legs)',
      'one bat wing alone fully spread flat with the black finger bones fanning out, the shoulder joint at the left end of the piece',
      'one upper arm in a long black glove',
      'one forearm in a long black glove with the clawed hand open',
      'one whole leg in the high black heeled boot, from the hip to the toe',
      'the thin black demon tail with the spade tip lying straight and horizontal',
    ]),
  },
  priest_sheet: {
    tool: 'image_to_image', aspect: '4:3', n: 2, inputs: ['priest_ref'], for: ['blood_priest'],
    prompt: sheet('blood priest', [
      'the head with the tall crimson mitre and the gaunt face',
      'the long crimson robe body with the black stole and the white fur shoulder cape, from the neck down to the bloody hem touching the floor (no head, no arms)',
      'one upper arm in a wide crimson sleeve',
      'one forearm in the wide crimson sleeve with a pale bony hand gripping the stem of the golden chalice full of blood',
      'one forearm in the wide crimson sleeve with a pale bony hand holding the hanging golden rosary',
    ]),
  },
  nun_sheet: {
    tool: 'image_to_image', aspect: '4:3', n: 2, inputs: ['nun_ref'], for: ['cursed_nun'],
    prompt: sheet('cursed nun', [
      'the head with the white coif, the blindfold and the black veil hanging behind',
      'the black habit body with the white collar from the neck down to the tattered misty hem (no head, no arms)',
      'one upper arm in a wide black sleeve',
      'one forearm in the wide black sleeve with a pale hand, the fingers straight',
      'the rosary alone with the glowing upside-down cross hanging straight down',
    ]),
  },
});

if (import.meta.url === `file://${process.argv[1]}`) {
  const s = SHOTS[process.argv[2]];
  console.log(s ? JSON.stringify(s, null, 1) : Object.keys(SHOTS).join(' '));
}
