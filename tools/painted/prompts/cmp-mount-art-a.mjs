// Kling prompts for CMP-MOUNT-ART-A (painted mounts: 그림메인 mt_warhorse · 바르그 mt_boar · 코슈타 mt_skelsteed ·
// 이그니스 mt_ignis · 실바 mt_silva). docs/specs/companions.md §11.2 (looks) · docs/art/ENEMY_PIPELINE.md §3 (Step 1 / Step 4
// edit / parts sheet) · docs/art/BOSS_PIPELINE.md §3 (style clause first) · docs/specs/ART_DECISION.md (painted cut-out puppets).
// Model kling-image-v3_0_omni (image_to_image), img_resolution 2k (2 credits / image).
//
// Plan per mount (6 images):
//   <id>_ref    图片1 = the companion portrait (assets/portraits/cmp_*.webp → JPG, file_upload): a strict side view of the same
//               creature standing on all four legs, saddle on, nobody riding                     → src/<id>_ref.webp
//   <id>_body   图片1 = the chosen ref (its Kling result URL): the four legs and the tail removed, belly/chest/haunches repainted
//               (body + neck + head of the puppet, same size and position as the ref)            → src/<id>_body.webp
//   <id>_legs   图片1 = the chosen ref: the near fore leg, the near hind leg and the tail painted separately, straight, whole
//                                                                                                  → src/<id>_legs.webp
// Sources live in tools/painted/companions/<id>/src/ (q93 webp); the build config is tools/painted/companions/<id>/config.json.
// Every call (kept and rejected images) is logged in tools/kling/manifest_cmp-mount-art-a.json.
// Print one prompt:   node tools/painted/prompts/cmp-mount-art-a.mjs <shot>      (no argument = list the shots)

export const STYLE = 'Paint in exactly the same painterly dark-fantasy oil-painting style as 图片1: soft visible brush strokes, rich dark colours, dramatic lighting, highly detailed, no black outlines, not cartoon, not cel-shaded, not 3D render.';
export const BG = 'Flat uniform plain mid-grey studio background (#808080), no gradient, no floor, no ground, no cast shadow on the background, no scenery. Strong key light from the upper left, darker lower right, crisp readable silhouette. Isolated subject, nothing else in the image, no text, no letters, no numbers, no labels, no watermark.';
const S = (s) => s.replace(/\s+/g, ' ').trim();
const SIDE = 'Strict side view in profile facing RIGHT (the head on the right side of the image), the whole animal from the tips of the ears down to the hooves and the end of the tail, centred with a wide empty margin all around.';
const STAND = 'Standing calmly on all four legs, the legs slightly apart so that all four legs are clearly separated and fully visible: the near front leg and the near hind leg straight and vertical, the far legs visible just behind them, the head held up naturally, the tail hanging down loosely.';
const NO_RIDER = 'Nobody is riding it: the saddle is empty, no rider, no person.';

/** Step 1: side-view design reference from the portrait */
const REF = (who, look) => S(`${STYLE} Subject: the same ${who} as in 图片1 (keep the identical design, colours, materials, armour and harness of 图片1), now painted as a full-body game sprite reference. ${look} ${SIDE} ${STAND} ${NO_RIDER} ${BG}`);
/** Step 4-style edit: remove the legs and the tail, repaint what they covered */
const BODY = (who, keep) => S(`Edit 图片1: remove all four legs completely below the body (both front legs and both hind legs, including the hooves) and remove the whole tail, then repaint the underside of the ${who} that was hidden behind them: the rounded chest, the belly and the rounded haunches end cleanly in a smooth closed body outline, no leg stumps. ${keep} Keep everything else exactly identical: the same ${who}, the same strict side view facing right, the same head, neck, mane, saddle and harness, the same size and position in the image, the same painting style and lighting, the same flat plain mid-grey background (#808080), no cast shadow.`);
/** Step 2/3: the near legs and the tail as separate pieces */
const LEGS = (who, fore, hind, tail) => S(`${STYLE} Subject: the same ${who} as in 图片1 (keep the identical design, proportions, colours, materials and painting style of 图片1), painted separately as three cut-out game sprite pieces for a 2D skeletal animation puppet, laid out apart side by side from left to right with wide empty grey gaps between them, no piece touching or overlapping another: on the left (1) ${fore}; in the middle (2) ${hind}; on the right (3) ${tail}. Each leg is complete and whole from the top of the leg where it joins the body down to the hoof, standing straight and vertical exactly like the near legs in 图片1, in the same strict side view facing right and at the same scale as 图片1. ${BG}`);

export const MOUNTS = {
  mt_warhorse: { who: 'black warhorse', portrait: 'assets/portraits/cmp_m_warhorse.webp' },
  mt_boar: { who: 'giant battle boar', portrait: 'assets/portraits/cmp_m_boar.webp' },
  mt_skelsteed: { who: 'skeletal undead horse', portrait: 'assets/portraits/cmp_m_skelsteed.webp' },
  mt_ignis: { who: 'flaming warhorse', portrait: 'assets/portraits/cmp_mt_ignis.webp' },
  mt_silva: { who: 'white stag spirit', portrait: 'assets/portraits/cmp_mt_silva.webp' },
};

export const SHOTS = {
  // ── 그림메인: 흑철 군마 ──────────────────────────────────────────────────────────────────────────
  mt_warhorse_ref: {
    tool: 'image_to_image', aspect: '4:3', n: 2, inputs: ['portrait:mt_warhorse'], for: 'mt_warhorse',
    prompt: REF('black armoured warhorse', 'A muscular black destrier with a blue-steel sheen on its coat, a long flowing crimson mane and a long crimson tail, a riveted steel chanfron face plate covering the face, glowing ember-red eyes, a riveted steel breastplate on the chest, a crimson saddle cloth with gold fringe under a black studded leather war saddle with stirrups, a black leather bridle with the reins resting on the neck, feathered fetlocks and iron-shod hooves.'),
  },
  mt_warhorse_body: {
    tool: 'image_to_image', aspect: '4:3', n: 2, inputs: ['mt_warhorse_ref'], for: 'mt_warhorse',
    prompt: BODY('black warhorse', 'The crimson saddle cloth with the gold fringe may hang a little lower over the side.'),
  },
  mt_warhorse_legs: {
    tool: 'image_to_image', aspect: '16:9', n: 2, inputs: ['mt_warhorse_ref'], for: 'mt_warhorse',
    prompt: LEGS('black warhorse', 'one front leg: the black muscular forearm, the knee, the cannon, the feathered fetlock and the iron-shod hoof', 'one hind leg: the black muscular thigh and gaskin, the hock bending backwards, the cannon, the feathered fetlock and the iron-shod hoof', 'the long flowing crimson horse tail alone, hanging straight down'),
  },
  // ── 바르그: 철엄니 멧돼지 ───────────────────────────────────────────────────────────────────────
  mt_boar_ref: {
    tool: 'image_to_image', aspect: '4:3', n: 2, inputs: ['portrait:mt_boar'], for: 'mt_boar',
    prompt: REF('giant battle boar', 'A huge heavy battle boar with a dark-brown bristled hide with old scars, a spiky ridge of stiff dark bristles along the spine, huge curved ivory tusks capped with riveted steel, an iron ring through the snout, small furious glowing red eyes, a riveted leather harness with iron rings across the chest and shoulders and a brown leather riding saddle with stirrups on its back, short stubby powerful legs with dark cloven hooves, a short thin tail with a tuft.'),
  },
  mt_boar_body: {
    tool: 'image_to_image', aspect: '4:3', n: 2, inputs: ['mt_boar_ref'], for: 'mt_boar',
    prompt: BODY('battle boar', 'The heavy bristled belly hangs low.'),
  },
  mt_boar_legs: {
    tool: 'image_to_image', aspect: '16:9', n: 2, inputs: ['mt_boar_ref'], for: 'mt_boar',
    prompt: LEGS('battle boar', 'one short stubby bristled front leg with the dark cloven hoof', 'one short stubby bristled hind leg with the hock and the dark cloven hoof', 'the short thin boar tail with the bristle tuft, hanging down'),
  },
  // ── 코슈타: 망령 해골마 ─────────────────────────────────────────────────────────────────────────
  mt_skelsteed_ref: {
    tool: 'image_to_image', aspect: '4:3', n: 2, inputs: ['portrait:mt_skelsteed'], for: 'mt_skelsteed',
    prompt: REF('skeletal undead horse', 'A skeletal undead horse made of bone-white and ash-grey bones: a horse skull with a glowing blue soul-fire eye, bared teeth, the neck vertebrae visible, an open ribcage with blue soul-fire glowing inside it, a mane and a tail made of wild blue ghost flames instead of hair, tattered black leather harness straps, a worn black leather saddle with stirrups and iron chain reins, bony grey legs with cracked hooves.'),
  },
  mt_skelsteed_body: {
    tool: 'image_to_image', aspect: '4:3', n: 2, inputs: ['mt_skelsteed_ref'], for: 'mt_skelsteed',
    prompt: BODY('skeletal horse', 'The ribcage with the blue soul-fire inside stays, the pelvis bones end cleanly.'),
  },
  mt_skelsteed_legs: {
    tool: 'image_to_image', aspect: '16:9', n: 2, inputs: ['mt_skelsteed_ref'], for: 'mt_skelsteed',
    prompt: LEGS('skeletal horse', 'one bony front leg: the long grey leg bones, the knee joint and the cracked hoof', 'one bony hind leg: the thigh bone, the hock joint bending backwards, the cannon bone and the cracked hoof', 'the horse tail made of blue ghost flames alone, hanging down'),
  },
  // ── 이그니스: 화염 군마 ─────────────────────────────────────────────────────────────────────────
  mt_ignis_ref: {
    tool: 'image_to_image', aspect: '4:3', n: 2, inputs: ['portrait:mt_ignis'], for: 'mt_ignis',
    prompt: REF('flaming warhorse', 'A powerful black-and-charcoal warhorse whose hide is cracked with glowing molten orange lava veins, a mane and a long tail made of roaring orange and yellow flames, blazing yellow eyes, broken iron shackles with short chain ends on its neck, a dark leather saddle with iron fittings and stirrups, fetlocks and hooves glowing like hot embers.'),
  },
  mt_ignis_body: {
    tool: 'image_to_image', aspect: '4:3', n: 2, inputs: ['mt_ignis_ref'], for: 'mt_ignis',
    prompt: BODY('flaming warhorse', 'The glowing lava veins continue over the repainted belly and chest.'),
  },
  mt_ignis_legs: {
    tool: 'image_to_image', aspect: '16:9', n: 2, inputs: ['mt_ignis_ref'], for: 'mt_ignis',
    prompt: LEGS('flaming warhorse', 'one front leg: the dark muscular forearm with glowing lava veins, the knee, the cannon, the ember-glowing fetlock and hoof', 'one hind leg: the dark muscular thigh and gaskin with glowing lava veins, the hock bending backwards, the cannon, the ember-glowing fetlock and hoof', 'the long horse tail made of roaring flames alone, hanging down'),
  },
  // ── 실바: 백록 신령 ─────────────────────────────────────────────────────────────────────────────
  mt_silva_ref: {
    tool: 'image_to_image', aspect: '4:3', n: 2, inputs: ['portrait:mt_silva'], for: 'mt_silva',
    prompt: REF('white stag spirit', 'A tall slender majestic white stag spirit with pure white fur and a soft pale glow, a thick long white ruff on the neck and chest, large branching antlers glowing a pale luminous green with small green leaves and thin vines wound around them, gentle glowing green eyes, a green leaf garland across the chest, a small brown leather saddle with gold fittings and stirrups, long slender white legs with dark hooves, a short fluffy white tail.'),
  },
  mt_silva_body: {
    tool: 'image_to_image', aspect: '4:3', n: 2, inputs: ['mt_silva_ref'], for: 'mt_silva',
    prompt: BODY('white stag', 'The long white neck ruff and the glowing antlers stay.'),
  },
  mt_silva_legs: {
    tool: 'image_to_image', aspect: '16:9', n: 2, inputs: ['mt_silva_ref'], for: 'mt_silva',
    prompt: LEGS('white stag', 'one long slender white front leg with the dark hoof', 'one long slender white hind leg with the hock bending backwards and the dark hoof', 'the short fluffy white deer tail alone'),
  },
};

if (typeof process !== 'undefined' && process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const k = process.argv[2];
  if (!k || !SHOTS[k]) { console.log(Object.keys(SHOTS).join('\n')); }
  else console.log(SHOTS[k].prompt);
}
