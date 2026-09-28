// Kling prompts for CMP-MOUNT-ART-B (painted mounts: 스콜 mt_direwolf · 스칼렛 mt_wyvern · 녹티스 mt_giantbat · 게일 mt_gale).
// docs/specs/companions.md §11.1–11.2 (looks, rig templates wolf / wyvern / bat / griffin) · docs/specs/ART_DECISION.md
// (painted cut-out puppets) · the CMP-MOUNT-ART-A pipeline (tools/painted/prompts/cmp-mount-art-a.mjs: one strict side view
// per mount, every part cut from it; far legs = darkened near legs).
// Model kling-image-v3_0_omni (image_to_image), img_resolution 2k (2 credits / image). Package cap: 200 credits.
//
// Plan per mount:
//   <id>_ref    图片1 = the companion portrait (assets/portraits/cmp_*.webp → JPG, file_upload): a strict side view facing right,
//               nobody riding. Flyers raise both wings high above the back so the body, saddle and legs stay uncovered
//               (the body part is cut below the back line; the wing comes from <id>_wing).                → src/<id>_ref.webp
//   <id>_wing   图片1 = the chosen ref (its Kling result URL): one wing alone, fully spread flat, shoulder joint on the LEFT.
//               Cut into two puppet parts at the wrist (inner arm wing + outer hand wing) so the wing can flap and fold.
//                                                                                                          → src/<id>_wing.webp
// As generated: the <id>_wing shots were never sent (each kept reference already shows the near wing whole and uncovered, so
// wingIn/wingOut are cut from it and the far wing is the near one darkened at runtime). Two refs needed a retry and the wyvern
// an edit (mt_wyvern_ref2 · mt_gale_ref2 · mt_wyvern_saddle below, the exact prompts that were sent).
// Sources live in tools/painted/companions/<id>/src/ (q93 webp); the build config is tools/painted/companions/<id>/config.json;
// the build entry is tools/painted/companions/mt_direwolf/mounts_b_build.py.
// Every call (kept and rejected images) is logged in tools/kling/manifest_cmp-mount-art-b.json.
// Print one prompt:   node tools/painted/prompts/cmp-mount-art-b.mjs <shot>      (no argument = list the shots)

export const STYLE = 'Paint in exactly the same painterly dark-fantasy oil-painting style as 图片1: soft visible brush strokes, rich dark colours, dramatic lighting, highly detailed, no black outlines, not cartoon, not cel-shaded, not 3D render.';
export const BG = 'Flat uniform plain mid-grey studio background (#808080), no gradient, no floor, no ground, no cast shadow on the background, no scenery, no moon, no lightning, no chains in the background. Strong key light from the upper left, darker lower right, crisp readable silhouette. Isolated subject, nothing else in the image, no text, no letters, no numbers, no labels, no watermark.';
const S = (s) => s.replace(/\s+/g, ' ').trim();
const SIDE = 'Strict side view in profile facing RIGHT (the head on the right side of the image, looking forward to the right in the direction it faces, never turned back over the shoulder), the whole creature from the top of the head down to the feet and the end of the tail, centred with a wide empty margin all around.';
const NO_RIDER = 'Nobody is riding it: the saddle is empty, no rider, no person, no weapons.';
const WINGS_UP = 'Both wings are raised high and spread straight upward above its back like a heraldic dragon, the near wing in front of the far wing, so that the whole body, the saddle, the belly and the legs are completely visible and not covered by any wing.';

/** Step 1: side-view design reference from the portrait */
const REF = (who, look, stance) => S(`${STYLE} Subject: the same ${who} as in 图片1 (keep the identical design, colours, materials and harness of 图片1), now painted as a full-body game sprite reference. ${look} ${SIDE} ${stance} ${NO_RIDER} ${BG}`);
/** Step 2: one wing alone, spread flat (cut at the wrist into inner/outer puppet parts) */
const WING = (who, wing) => S(`${STYLE} Subject: one single wing of the same ${who} as in 图片1 (keep the identical colours, materials and painting style of the wing in 图片1), painted alone as a separate cut-out game sprite piece for a 2D skeletal animation puppet. ${wing} The wing is fully spread open and flat, seen straight on from the side, with the shoulder joint where it attaches to the body at the far LEFT end, the arm bone running along the top edge to the wrist, and the wing extending to the RIGHT and slightly upward, the whole wing visible with a wide empty margin all around. Only the wing, no body, no head, no legs. ${BG}`);

export const MOUNTS = {
  mt_direwolf: { who: 'frost dire wolf', portrait: 'assets/portraits/cmp_m_direwolf.webp' },
  mt_wyvern: { who: 'young crimson wyvern', portrait: 'assets/portraits/cmp_m_wyvern.webp' },
  mt_giantbat: { who: 'enormous vampire bat', portrait: 'assets/portraits/cmp_m_giantbat.webp' },
  mt_gale: { who: 'storm griffin', portrait: 'assets/portraits/cmp_mt_gale.webp' },
};

export const SHOTS = {
  // ── 스콜: 서리 늑대 ──────────────────────────────────────────────────────────────────────────
  mt_direwolf_ref: {
    tool: 'image_to_image', aspect: '4:3', n: 2, inputs: ['portrait:mt_direwolf'], for: 'mt_direwolf',
    prompt: REF('frost dire wolf', 'A huge powerful dire wolf with thick layered frost-white fur, a blue-grey saddle patch of darker fur along the back, glowing icy-blue eyes, a long muzzle with the mouth closed, a thick fur mantle behind the saddle, a dark leather riding saddle decorated with small bone ornaments and a little skull, leather straps across the chest, long strong legs with big paws and dark claws, a long bushy tail.',
      'Standing calmly on all four legs, the legs slightly apart so that all four legs are clearly separated and fully visible: the near front leg straight and vertical, the near hind leg standing with the hock bent like a real wolf, the far legs visible just behind them, the head held level and forward, the ears up, the bushy tail hanging down and back loosely.'),
  },
  // ── 스칼렛: 진홍 와이번 ───────────────────────────────────────────────────────────────────────
  mt_wyvern_ref: {
    tool: 'image_to_image', aspect: '4:3', n: 2, inputs: ['portrait:mt_wyvern'], for: 'mt_wyvern',
    prompt: REF('young crimson wyvern', 'A young crimson wyvern with deep crimson scales, orange-gold belly scales, dark curved horns and dark spinal ridges, glowing ember light in its throat, veined crimson wing membranes, a brown leather war saddle with straps on its back just behind the wing shoulders, strong digitigrade hind legs with dark talons, a long tail ending in a spade tip. A wyvern has no front legs: its arms are its wings.',
      `Standing on its two hind legs, the body leaning forward at about thirty degrees, the long neck curving up and forward with the head looking ahead to the right, the long tail stretched straight back behind it and off the ground. ${WINGS_UP}`),
  },
  // retry: #1 stood upright, #2 had four legs → image_2 = the upright result #1 as design ref (both results copied its upright
  // posture and were rejected; the kept wyvern is ref #2 mirrored + mt_wyvern_saddle)
  mt_wyvern_ref2: {
    tool: 'image_to_image', aspect: '4:3', n: 2, inputs: ['portrait:mt_wyvern', 'mt_wyvern_ref#1'], for: 'mt_wyvern',
    prompt: S(`${STYLE.replace('图片1', '图片2')} Subject: the same young crimson wyvern as in 图片2 (identical head, horns, crimson scales, orange-gold belly scales, dark spinal ridges, veined crimson wings, spade-tipped tail; the design comes from 图片1), painted as a full-body game sprite reference in a strict flat side view in profile facing RIGHT, the head on the right looking forward to the right. It stands in a level horizontal posture like a raptor: the body level and horizontal, balanced on its two strong digitigrade hind legs placed slightly apart so both legs are clearly visible, the long tail stretched straight back behind it as a counterbalance and off the ground, the long neck curving up and forward. It has NO front legs: its arms are its wings. A brown leather riding saddle with a high back, stirrups and straps is strapped on the middle of its level back, just behind the wing shoulders, the saddle clearly visible. ${WINGS_UP.replace('the legs', 'both legs')} ${NO_RIDER} The whole creature from the wing tips down to the feet and the end of the tail, centred with a wide empty margin all around. Flat uniform plain mid-grey studio background (#808080), no gradient, no floor, no ground, no cast shadow on the background, no scenery. Strong key light from the upper left, darker lower right, crisp readable silhouette. Isolated subject, nothing else in the image, no text, no letters, no numbers, no labels, no watermark.`),
  },
  // edit of ref #2 (mirrored to face right, Kling logo painted out): add a riding saddle, keep the pose → kept result #2
  mt_wyvern_saddle: {
    tool: 'image_to_image', aspect: '4:3', n: 2, inputs: ['mt_wyvern_ref#2(mirrored, logo painted out)'], for: 'mt_wyvern',
    prompt: S(`Edit 图片1: add a brown leather riding saddle with a high back, a front pommel, stirrups hanging on straps and a girth strap, strapped on the middle of the wyvern's level back just behind the wing shoulders, the saddle clearly visible and not covered by the wing, painted in exactly the same painterly style and lighting. Keep everything else exactly identical: the same crimson wyvern, the same pose, the same strict side view facing right, the same raised wings, legs, neck, head and tail, the same size and position in the image, the same flat plain mid-grey background, no cast shadow, no rider, no text, no watermark.`),
  },
  mt_wyvern_wing: {
    tool: 'image_to_image', aspect: '16:9', n: 2, inputs: ['mt_wyvern_ref'], for: 'mt_wyvern',
    prompt: WING('young crimson wyvern', 'A dragon wing: a scaled crimson arm bone with a small clawed thumb at the wrist, three long finger bones fanning out from the wrist, and the translucent veined crimson membrane stretched between them with a scalloped trailing edge.'),
  },
  // ── 녹티스: 거대 박쥐 ─────────────────────────────────────────────────────────────────────────
  mt_giantbat_ref: {
    tool: 'image_to_image', aspect: '4:3', n: 2, inputs: ['portrait:mt_giantbat'], for: 'mt_giantbat',
    prompt: REF('enormous vampire bat', 'An enormous vampire bat with a big furry black-brown body, huge pointed ears, glowing red eyes, a wrinkled snout with long white fangs, a silver riding saddle with hanging silver chains on its back between the shoulders, small strong hind legs with curved black claws, crimson-veined wing membranes and hooked wing-thumb claws.',
      `Flying horizontally: the furry body level, the head at the front on the right looking forward, the small clawed hind feet hanging below the rear of the body. ${WINGS_UP}`),
  },
  mt_giantbat_wing: {
    tool: 'image_to_image', aspect: '16:9', n: 2, inputs: ['mt_giantbat_ref'], for: 'mt_giantbat',
    prompt: WING('enormous vampire bat', 'A bat wing: a dark furry arm bone with a hooked thumb claw at the wrist, four long thin finger bones fanning out from the wrist, and the thin dark membrane stretched between them with glowing crimson veins and a scalloped trailing edge.'),
  },
  // ── 게일: 폭풍 그리핀 ─────────────────────────────────────────────────────────────────────────
  mt_gale_ref: {
    tool: 'image_to_image', aspect: '4:3', n: 2, inputs: ['portrait:mt_gale'], for: 'mt_gale',
    prompt: REF('storm griffin', 'A storm griffin: a white eagle head with a golden hooked beak and a glowing icy-blue eye, a white feathered neck ruff, a silver-grey lion body, front legs of an eagle with scaly skin and big talons, hind legs of a lion with paws, a long lion tail ending in a white tuft, a brown leather saddle with gold fittings and straps on its back, big white and grey feathered wings with golden tips.',
      `Standing calmly on all four legs, the legs slightly apart so that all four legs are clearly separated and fully visible, the head held up and looking ahead to the right, the tail hanging down and back. ${WINGS_UP}`),
  },
  // retry: both first results were three-quarter leaping poses → image_2 = the kept wolf side view as camera/pose reference
  mt_gale_ref2: {
    tool: 'image_to_image', aspect: '4:3', n: 2, inputs: ['portrait:mt_gale', 'mt_direwolf_ref#1'], for: 'mt_gale',
    prompt: S(`${STYLE} Subject: the same storm griffin as in 图片1 (identical design and colours: a white eagle head with a golden hooked beak and a glowing icy-blue eye, a white feathered neck ruff, a silver-grey lion body, front legs of an eagle with scaly skin and big talons, hind legs of a lion with paws, a long lion tail ending in a white tuft, a brown leather saddle with gold fittings and straps on its back, big white and grey feathered wings with golden tips), painted as a full-body game sprite reference with exactly the same camera, strict flat side view and standing pose as the wolf in 图片2: strict side view in profile facing RIGHT, not three-quarter, the head on the right looking forward to the right; standing calmly with all four feet flat on the ground, the legs slightly apart so that all four legs are clearly separated and fully visible, the near front leg straight and vertical, the tail hanging down and back. ${WINGS_UP.replace('heraldic dragon', 'heraldic griffin').replace('the legs', 'all four legs')} ${NO_RIDER} The whole creature from the wing tips down to the feet and the end of the tail, centred with a wide empty margin all around. Flat uniform plain mid-grey studio background (#808080), no gradient, no floor, no ground, no cast shadow on the background, no scenery, no lightning. Strong key light from the upper left, darker lower right, crisp readable silhouette. Isolated subject, nothing else in the image, no text, no letters, no numbers, no labels, no watermark.`),
  },
  mt_gale_wing: {
    tool: 'image_to_image', aspect: '16:9', n: 2, inputs: ['mt_gale_ref'], for: 'mt_gale',
    prompt: WING('storm griffin', 'A big eagle wing: white covert feathers along the top edge, long white and grey flight feathers with golden tips fanning out, the long primary feathers at the right end, the secondary feathers underneath the arm.'),
  },
};

if (typeof process !== 'undefined' && process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const k = process.argv[2];
  if (!k || !SHOTS[k]) { console.log(Object.keys(SHOTS).join('\n')); }
  else console.log(SHOTS[k].prompt);
}
