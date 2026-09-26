// Kling prompt templates for painted enemies (see docs/art/ENEMY_PIPELINE.md §3).
// Model: kling-image-v3_0_omni. Step 1 = text_to_image reference (design sheet), step 2 = image_to_image parts sheet
// with the chosen reference as 图片1. Print a filled prompt:  node tools/painted/enemies/prompts.mjs skeleton sheet
//
// Rules that make the cut pipeline (matte.py → build.py) work:
//  - flat uniform medium-grey background (matte keys it; rembg isnet refines the silhouette), no floor, no cast shadow
//  - strict side view facing RIGHT (renderers draw facing right and mirror by e.facing)
//  - parts sheet: every part whole (including the portion normally hidden), separated by wide grey gaps (connected
//    components = parts), no labels/numbers (Kling likes to add them)
//  - painterly style words shared with the portraits/backgrounds so the cast matches the painted world

export const STYLE = 'Dark gothic horror fantasy 2D action game enemy art, highly detailed painterly digital illustration in the same style as dark gothic fantasy character art, clear readable silhouette with bold value contrast so it still reads when small, warm key light from the upper front, cool blue rim light from behind, no text, no letters, no numbers, no labels, no watermark.';
export const BG = 'Isolated on a plain flat uniform medium grey background (#808080), no floor, no ground, no cast shadow, no scenery, no border.';

export const refPrompt = (e) => `${e.subject} ${e.view ?? 'Strict side view in profile facing right, full body from head to feet.'} ${e.pose ?? ''} ${BG} ${STYLE}`.replace(/\s+/g, ' ').trim();

export const sheetPrompt = (e) => `The same ${e.who} as in 图片1 (keep the identical design, proportions, colours, materials and painting style), redrawn as a cut-out puppet parts sheet for 2D skeletal animation: each piece painted separately and laid out apart in a loose grid with wide empty grey gaps between them, no piece touching or overlapping another. The ${e.parts.length} pieces are: ${e.parts.join('; ')}. Every piece is complete and whole, including the portions normally hidden behind other parts, all in the same ${e.sheetView ?? 'strict side view facing right'}, same scale as each other. ${BG} ${STYLE}`.replace(/\s+/g, ' ').trim();

export const ENEMIES = {
  bat: {
    tier: 'T1', aspect: '4:3', sheetAspect: '4:3',
    who: 'vampire bat',
    subject: 'A vampire bat monster the size of a cat: sooty black-brown fur, huge torn leathery wings with visible finger bones and dark crimson membranes lit from behind, tall pointed ears with pink insides, a snub pig-like nose, small glowing red eyes, open mouth with tiny white fangs, small clawed hind feet.',
    view: 'Front three-quarter view, the body turned slightly to the right, both wings spread wide open to the sides.',
    parts: [
      'the bat\'s furry body with head, ears, face and small hind feet, WITHOUT any wings',
      'its left wing alone, fully spread, with the shoulder joint at the right end of the piece',
      'the same bat hanging upside down asleep with both wings wrapped tightly around its body like a cloak',
    ],
    sheetView: 'front three-quarter view',
  },
  ghost: {
    tier: 'T1', aspect: '1:1', sheetAspect: '1:1',
    who: 'ghost',
    subject: 'A wailing ghost, the vengeful spirit of a hanged villager: a pale blue-white translucent spectral figure wrapped in a torn burial shroud with a deep hood, a gaunt skull-like face with hollow glowing cyan eyes and a gaping mouth, long thin bony arms with clawed fingers reaching forward, the lower body dissolving into long trailing tatters of cloth and mist that stream backwards, faint inner glow.',
    pose: 'Floating, leaning forward toward the right.',
    parts: [
      'the ghost\'s hooded head and shroud body with the long trailing tattered tail, WITHOUT any arms',
      'one long reaching skeletal arm in a torn sleeve with a clawed hand, the shoulder at the left end of the piece',
      'the hooded head alone, screaming with the jaw stretched wide open',
    ],
  },
  skeleton: {
    tier: 'T2', aspect: '3:4', sheetAspect: '4:3',
    who: 'skeleton soldier',
    subject: 'A skeleton soldier, the reanimated remains of an old castle guard: aged ivory bones with dark cracks and grime, a grinning skull with glowing red eye sockets, a tattered dark red loincloth tied at the pelvis, a notched rusty iron shortsword in its right hand and a small round wooden buckler shield with an iron rim on its left arm.',
    pose: 'Standing upright in a relaxed walking stance, arms held slightly away from the ribcage, legs slightly apart.',
    parts: [
      'the skull with its lower jaw',
      'the ribcage with spine, collarbones and shoulder blades (no arms, no pelvis)',
      'the pelvis with the tattered dark red loincloth',
      'one upper arm bone (humerus)',
      'one forearm (radius and ulna) with a bony hand closed as if gripping a hilt',
      'one thigh bone (femur)',
      'one shin (tibia and fibula) with a bony foot',
      'the notched rusty shortsword alone, pointing up',
      'the round wooden buckler shield alone, seen from the front',
    ],
  },
  armor_knight: {
    tier: 'T2', aspect: '3:4', sheetAspect: '4:3',
    who: 'animated suit of armor',
    subject: 'A hollow animated suit of dark gothic plate armor that guards a castle gate: blackened blue-grey fluted steel plates with tarnished gold trim, a closed great helm with a narrow visor slit glowing red from the darkness inside, heavy pauldrons, a tattered dark crimson cape, a broad longsword in its right hand and a tall crimson tower shield with a gold border and rivets on its left arm.',
    pose: 'Standing heavy and upright, sword lowered, shield held at its side.',
    parts: [
      'the great helm with the glowing visor slit',
      'the breastplate torso with gorget and a short skirt of waist plates (no arms, no legs)',
      'one shoulder pauldron with the upper arm armor',
      'one forearm vambrace with an armored gauntlet closed as if gripping',
      'one thigh armor piece with the knee cop',
      'one lower leg greave with an armored sabaton foot',
      'the broad longsword alone, pointing up',
      'the tall crimson tower shield alone, seen from the front',
      'the tattered crimson cape alone, hanging straight down',
    ],
  },
  gravedigger: {
    tier: 'T3', aspect: '3:4', sheetAspect: '4:3',
    who: 'undead gravedigger',
    subject: 'A hulking hunchbacked undead gravedigger giant: grey dead skin, a battered wide-brimmed black hat, glowing amber eyes under the brim, a mouth sewn shut with black thread, a scraggly grey beard, a long tattered brown-black greatcoat with patched sleeves and a hump on the back, heavy muddy boots, huge grey hands gripping a big rusted iron shovel, an oil lantern hanging from the belt glowing warm orange.',
    pose: 'Hunched forward, standing with knees bent, the shovel held diagonally in front.',
    parts: [
      'the head with the wide-brimmed hat, glowing eyes, sewn mouth and beard',
      'the hunched torso in the greatcoat with the hump (no arms, no legs, no coat tails)',
      'the long tattered coat tails hanging from the waist',
      'one upper arm in a patched coat sleeve',
      'one forearm with a huge grey hand closed as if gripping a handle',
      'one thigh in dark trousers',
      'one lower leg with a heavy muddy boot',
      'the big rusted iron shovel alone, blade down',
      'the oil lantern alone, glowing',
    ],
  },
};

if (process.argv[1]?.endsWith('prompts.mjs')) {
  const [id, kind] = process.argv.slice(2);
  const e = ENEMIES[id];
  if (!e) { console.log(Object.keys(ENEMIES).join(' ')); process.exit(0); }
  console.log(kind === 'sheet' ? sheetPrompt(e) : refPrompt(e));
}
