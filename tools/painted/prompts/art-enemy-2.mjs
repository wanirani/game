// Kling prompts for ART-ENEMY-2 (painted enemies of s04–s06, docs/art/ENEMY_PIPELINE.md §3):
//   blood_skeleton phantom_sword lesser_demon spear_guard puppet_maiden bone_pillar mummy skeleton_knight corpse_worm
//   bone_scimitar book_fiend flea_man skeleton_mage scholar_ghost ectoplasm
// Model kling-image-v3_0_omni, img_resolution 2k. The shared BG / STYLE suffixes are copied verbatim from
// tools/painted/enemies/prompts.mjs (identical across the cast = matches the portraits and the painted backdrops).
//
// Rig reuse (§6) keeps the budget small:
//   skeleton rig  → blood_skeleton (recoloured at cut time, 0 images), bone_scimitar / skeleton_knight / skeleton_mage
//                   (one Step-4 edit of the armless skeleton side view each: same pose, same scale → the skeleton cut
//                   coordinates still fit), weapons from the shared props sheet
//   knight rig    → spear_guard (plumed helm + spear from the props sheet, 0 own images)
//   new creatures → reference + parts sheet (T2) or one parts/pose sheet (T1)
// Inputs (图片N) are uploaded JPG copies of the stored sources (see manifest_art-enemy-2.json → uploads).
// Print one prompt:   node tools/painted/prompts/art-enemy-2.mjs <shot>
// Every call (kept and rejected images) is logged in tools/kling/manifest_art-enemy-2.json.

export const STYLE = 'Dark gothic horror fantasy 2D action game enemy art, highly detailed painterly digital illustration in the same style as dark gothic fantasy character art, clear readable silhouette with bold value contrast so it still reads when small, warm key light from the upper front, cool blue rim light from behind, no text, no letters, no numbers, no labels, no watermark.';
export const BG = 'Isolated on a plain flat uniform medium grey background (#808080), no floor, no ground, no cast shadow, no scenery, no border.';
const S = (s) => s.replace(/\s+/g, ' ').trim();
const KEEP = 'Keep everything else exactly identical to 图片1: the same skeleton, the same pose, the same position and size in the frame, the same strict side view facing right, the same bones, painting style and lighting, the same flat plain medium grey background. No arms.';

export const SHOTS = {
  // ── shared props (skeleton family + spear guard) ──────────────────────────────────────────────────────────────
  props: {
    tool: 'image_to_image', aspect: '4:3', n: 2, inputs: ['skeleton_ref', 'knight_sheet2'], for: ['bone_scimitar', 'blood_skeleton', 'skeleton_mage', 'skeleton_knight', 'spear_guard'],
    prompt: S(`Game prop sheet painted in exactly the same style, materials and lighting as 图片1 and 图片2: separate objects laid out apart with wide empty grey gaps between them, no object touching or overlapping another, every object complete and whole, nothing held by anybody. In a row across the upper two thirds, each one standing straight up: a long curved desert scimitar with a notched steel blade and a bone hilt wrapped in faded red cloth, point up; a crude war club made from a huge thigh bone studded with rusty iron spikes and caked with dried blood, thick end up; a gnarled black wooden sorcerer's staff topped with a bony claw gripping a glowing violet crystal; a kite shield of blackened iron with a dark crimson field, tarnished gold trim and a small skull emblem, seen from the front; a closed steel knight helmet with a narrow visor slit glowing red and a tall crimson horsehair plume on top, in strict side view facing right. Below them a long war spear with a dark wooden shaft, gold bands and a long leaf-shaped steel spearhead, lying perfectly horizontal across the width of the image with the point to the right. ${BG} ${STYLE}`),
  },
  // ── skeleton variants: Step-4 edits of the armless side view (图片1 = skeleton_edit) ─────────────────────────────
  sk_knight: {
    tool: 'image_to_image', aspect: '3:4', n: 2, inputs: ['skeleton_edit'], for: ['skeleton_knight'],
    prompt: S(`Edit 图片1: armour this skeleton as a fallen skeleton knight captain. Add a blackened dark iron breastplate with tarnished gold trim and a spiked gorget strapped over the ribcage (the spine still visible below it), a dark iron shoulder guard, a skirt of overlapping dark iron tasset plates over the hips instead of the red loincloth, a dark iron knee cop and greave on the leg, and an open-faced black iron helmet with two curved horns sweeping back, the grinning skull face with glowing red eye sockets still visible under the brim. ${KEEP}`),
  },
  sk_knight_legs: {
    tool: 'image_to_image', aspect: '3:4', n: 2, inputs: ['sk_knight_1'], for: ['skeleton_knight'],
    prompt: S(`Edit 图片1: remove the skirt of overlapping tasset plates at the hips completely, so that the bony pelvis and the whole armoured thigh are visible: a black iron cuisse plate with gold trim covering the thigh from the hip joint down to the knee cop. Keep everything else exactly identical: the same helmet, skull, breastplate, spine, knee cop, greave and sabaton, the same pose, position and size in the frame, the same strict side view facing right, the same painting style and lighting, the same flat plain medium grey background. No arms.`),
  },
  sk_scim: {
    tool: 'image_to_image', aspect: '3:4', n: 2, inputs: ['skeleton_edit'], for: ['bone_scimitar'],
    prompt: S(`Edit 图片1: turn this skeleton into the remains of a desert mercenary. Wrap the skull in a crimson and cream desert turban with a long tail of cloth hanging down behind the head, add a gold hoop earring, replace the loincloth with a wide crimson silk sash knotted at the hip with two long hanging ends over short ragged cream trousers, make the bones sun-bleached and slightly yellow, the eye sockets glowing amber. ${KEEP}`),
  },
  sk_mage: {
    tool: 'image_to_image', aspect: '3:4', n: 2, inputs: ['skeleton_edit'], for: ['skeleton_mage'],
    prompt: S(`Edit 图片1: dress this skeleton as a skeletal sorcerer. A long tattered deep purple robe with gold embroidered trim covers the body from the neck down to the ankles, only the bony feet show below the ragged hem, a rope belt with a small hanging skull charm, a short hooded shoulder mantle, and a pointed purple hood pulled over the skull, the grinning skull with glowing violet eye sockets clearly visible inside the hood. The robe has no sleeves and no arms. ${KEEP}`),
  },
  // ── lesser demon (T2 flying imp) ──────────────────────────────────────────────────────────────────────────────
  demon_ref: {
    tool: 'text_to_image', aspect: '1:1', n: 2, for: ['lesser_demon'],
    prompt: S(`A lesser demon imp the size of a child: lean muscular blood-red skin with dark crimson shadows, a mean horned head with two curved ivory horns sweeping back, long pointed ears, glowing yellow eyes, a wide fanged grin, bat-like leathery wings with dark crimson membranes, goat-like hind legs bent backwards with black hooves, long arms with black clawed hands, a thin whip tail ending in an arrowhead spike, faint glowing orange rune tattoos on the chest. Strict side view in profile facing right, full body, hovering in the air with the wings raised and spread, the arms held slightly away from the body, the legs dangling. ${BG} ${STYLE}`),
  },
  demon_sheet: {
    tool: 'image_to_image', aspect: '4:3', n: 2, inputs: ['demon_ref'], for: ['lesser_demon'],
    prompt: S(`The same lesser demon imp as in 图片1 (keep the identical design, proportions, colours, materials and painting style), redrawn as a cut-out puppet parts sheet for 2D skeletal animation: each piece painted separately and laid out apart in a loose grid with wide empty grey gaps between them, no piece touching or overlapping another. The 8 pieces are: the horned head with ears and fanged grin; the torso with chest, belly and hips (no head, no arms, no legs, no wings, no tail); one bat wing alone fully spread flat with the finger bones fanning out, the shoulder joint at the left end of the piece; one upper arm; one forearm with a clawed hand; one goat thigh; one goat lower leg with the black hoof; the whip tail with the arrowhead spike. Every piece is complete and whole, including the portions normally hidden behind other parts, all in the same strict side view facing right, same scale as each other. ${BG} ${STYLE}`),
  },
  demon_side: {
    tool: 'image_to_image', aspect: '1:1', n: 2, inputs: ['demon_ref'], for: ['lesser_demon'],
    prompt: S(`The same lesser demon imp as in 图片1 (keep the identical design, proportions, colours, materials and painting style), redrawn in strict side view in profile facing right, full body, hovering upright: both bat wings raised and spread wide behind the back, the near arm hanging down slightly away from the body with the clawed hand open, the goat legs dangling with the hooves pointing down, the whip tail curling down behind. ${BG} ${STYLE}`),
  },
  // ── cursed porcelain doll (T2) ────────────────────────────────────────────────────────────────────────────────
  doll_ref: {
    tool: 'text_to_image', aspect: '3:4', n: 2, for: ['puppet_maiden'],
    prompt: S(`A cursed porcelain ball-jointed doll the size of a small child: a cracked white porcelain face with faded rosy cheeks, one blue glass eye and one glowing red eye, a small painted mouth, curly golden ringlet hair with a crimson ribbon bow, a black gothic lolita dress with a crimson front panel and white lace frills, a corset bodice, visible spherical ball joints at the shoulders, elbows and knees, white porcelain arms and legs, black mary-jane shoes. Strict side view in profile facing right, full body from head to feet, standing stiffly like a marionette, the arms held slightly away from the body, the legs slightly apart. No strings. ${BG} ${STYLE}`),
  },
  doll_sheet: {
    tool: 'image_to_image', aspect: '4:3', n: 2, inputs: ['doll_ref'], for: ['puppet_maiden'],
    prompt: S(`The same cursed porcelain doll as in 图片1 (keep the identical design, proportions, colours, materials and painting style), redrawn as a cut-out puppet parts sheet for 2D skeletal animation: each piece painted separately and laid out apart in a loose grid with wide empty grey gaps between them, no piece touching or overlapping another. The 6 pieces are: the porcelain head with the golden ringlet hair and the crimson bow; the torso with the corset bodice and the full black and crimson lace skirt (no head, no arms, no legs); one porcelain upper arm with ball joints at both ends; one porcelain forearm with an open hand; one porcelain thigh with the ball-jointed knee; one porcelain lower leg with a black mary-jane shoe. Every piece is complete and whole, including the portions normally hidden behind other parts, all in the same strict side view facing right, same scale as each other. ${BG} ${STYLE}`),
  },
  doll_side: {
    tool: 'image_to_image', aspect: '3:4', n: 2, inputs: ['doll_ref'], for: ['puppet_maiden'],
    prompt: S(`The same cursed porcelain doll as in 图片1 (keep the identical design, proportions, colours, materials and painting style), redrawn in strict side view in profile facing right, full body from head to feet, standing stiffly upright like a marionette, the near arm hanging straight down slightly away from the body, the legs straight and slightly apart. No strings. ${BG} ${STYLE}`),
  },
  // ── mummy (T2) ────────────────────────────────────────────────────────────────────────────────────────────────
  mummy_ref: {
    tool: 'text_to_image', aspect: '3:4', n: 2, for: ['mummy'],
    prompt: S(`An ancient mummified priest risen from a catacomb: a tall gaunt figure wrapped from head to toe in yellowed, dirt-stained linen bandages, several bandages torn loose and trailing, dark withered brown skin showing through the tears, a hollow face with one glowing green eye visible between the wrappings, a gold scarab amulet on the chest glowing faint green, a tattered faded blue and gold striped cloth over the shoulders. Strict side view in profile facing right, full body from head to feet, standing hunched forward, the arms held slightly away from the body, the legs slightly apart. ${BG} ${STYLE}`),
  },
  mummy_sheet: {
    tool: 'image_to_image', aspect: '4:3', n: 2, inputs: ['mummy_ref'], for: ['mummy'],
    prompt: S(`The same mummy as in 图片1 (keep the identical design, proportions, colours, materials and painting style), redrawn as a cut-out puppet parts sheet for 2D skeletal animation: each piece painted separately and laid out apart in a loose grid with wide empty grey gaps between them, no piece touching or overlapping another. The 7 pieces are: the bandaged head with the glowing green eye; the torso with the scarab amulet and the shoulder cloth (no head, no arms, no legs); one bandaged upper arm; one bandaged forearm with a withered clawed hand; one bandaged thigh; one bandaged lower leg with a wrapped foot; one long loose strip of bandage cloth lying straight and horizontal. Every piece is complete and whole, including the portions normally hidden behind other parts, all in the same strict side view facing right, same scale as each other. ${BG} ${STYLE}`),
  },
  mummy_side: {
    tool: 'image_to_image', aspect: '3:4', n: 2, inputs: ['mummy_ref'], for: ['mummy'],
    prompt: S(`The same mummy as in 图片1 (keep the identical design, proportions, colours, materials and painting style), redrawn in strict side view in profile facing right, full body from head to feet, standing hunched forward, the near arm hanging down slightly away from the body, the legs slightly apart. ${BG} ${STYLE}`),
  },
  staff: {
    tool: 'text_to_image', aspect: '9:16', n: 2, for: ['skeleton_mage'],
    prompt: S(`A single sorcerer's staff standing perfectly straight and vertical in the centre, the whole staff inside the frame with an empty margin: a long gnarled black wooden shaft wrapped with a strip of purple cloth and small bone charms, the top ends in a bony claw gripping a glowing violet crystal, an iron-shod foot at the bottom. Nothing else. ${BG} ${STYLE}`),
  },
  book_front: {
    tool: 'image_to_image', aspect: '4:3', n: 2, inputs: ['book'], for: ['book_fiend'],
    prompt: S(`Edit 图片1: show the same demonic grimoire seen perfectly straight from the front and perfectly symmetrical: the spine vertical in the exact centre, both halves flung open equally to the left and to the right like spread wings, the covers tilted slightly back, the pages fanning out on both sides, the huge fanged eye in the centre gutter, the torn red ribbon bookmark hanging straight down from the bottom of the spine. Keep the identical design, colours, materials and painting style. ${BG} ${STYLE}`),
  },
  // ── T1 creatures (one image each, imageCount 2 to pick from) ─────────────────────────────────────────────────
  phantom: {
    tool: 'text_to_image', aspect: '21:9', n: 2, for: ['phantom_sword'],
    prompt: S(`A single haunted cursed longsword floating alone: a long straight steel blade engraved with glowing violet runes along the fuller, a gold crossguard shaped like spread bat wings, a grip wrapped in dark purple leather, a gold pommel set with a single bloodshot red eye gem. The sword lies perfectly horizontal across the image with the point to the right, strict side view, nothing else, no hand, no aura. ${BG} ${STYLE}`),
  },
  pillar: {
    tool: 'text_to_image', aspect: '4:3', n: 2, for: ['bone_pillar'],
    prompt: S(`Cut-out game sprite pieces of a cursed bone pillar, each piece painted separately and laid out apart with wide empty grey gaps, no piece touching another: a horned dragon skull without its lower jaw in strict side view facing right, aged ivory bone scorched black around the nostrils and the teeth, dark empty eye sockets; the separate lower jaw of the same dragon skull with jagged teeth, in the same side view; a tall straight vertical column of stacked giant vertebrae; a low heap of broken bones and small human skulls forming a base. ${BG} ${STYLE}`),
  },
  worm: {
    tool: 'text_to_image', aspect: '16:9', n: 2, for: ['corpse_worm'],
    prompt: S(`A giant corpse maggot as long as a man's arm, strict side view in profile facing right, lying flat and perfectly straight and horizontal: a fat pale sickly yellow-white segmented body with translucent wet skin showing dark rotten guts inside, deep creases between the segments, rows of tiny bristly legs underneath, slimy sheen, blood stains, the head at the right end with a round gaping lamprey mouth ringed with hooked yellow teeth and two tiny red eyes, the tail tapering at the left end. ${BG} ${STYLE}`),
  },
  book: {
    tool: 'text_to_image', aspect: '4:3', n: 2, for: ['book_fiend'],
    prompt: S(`A flying demonic grimoire seen straight from the front, perfectly symmetrical: an ancient thick book bound in cracked blood-red leather with tarnished gold corner guards, flung wide open like spread wings, yellowed pages fanning out on both sides covered in faded red runes, in the centre gutter a single huge bloodshot eye with a slit pupil and rows of small sharp fangs along the spine, a torn red ribbon bookmark hanging down from the bottom. ${BG} ${STYLE}`),
  },
  flea: {
    tool: 'text_to_image', aspect: '16:9', n: 2, for: ['flea_man'],
    prompt: S(`Three poses of the same tiny hunchbacked flea-man goblin standing apart side by side with wide empty grey gaps, all in strict side view in profile facing right: a tiny hunched wiry man with a huge bald head, bulging yellow eyes, a wide grin of pointed teeth, huge bat-like ears, a tattered purple hooded cloak, thin frog-like legs, holding a small rusty knife. Left: crouched low, coiled and ready to leap. Middle: standing hunched and giggling. Right: leaping in mid-air, the body stretched out forward and the legs extended back. ${BG} ${STYLE}`),
  },
  scholar: {
    tool: 'text_to_image', aspect: '4:3', n: 2, for: ['scholar_ghost'],
    prompt: S(`Cut-out game sprite pieces of the ghost of an old scholar, each piece painted separately and laid out apart with wide empty grey gaps, no piece touching another: the floating ghost body in strict side view facing right, a translucent pale blue spectral old man with a long white beard, round spectacles, a square black scholar's cap with a gold tassel, a flowing scholar's robe that dissolves into wisps of mist at the bottom, no arms; one ghostly arm in a wide robe sleeve reaching out with an open hand, the shoulder at the left end of the piece; an old open book with yellowed pages floating. The ghost glows softly but there is no mist on the background. ${BG} ${STYLE}`),
  },
  ecto: {
    tool: 'text_to_image', aspect: '1:1', n: 2, for: ['ectoplasm'],
    prompt: S(`A floating blob of glowing green ectoplasm: a round translucent jelly-like mass of ghost slime, several anguished pale human faces with hollow eyes and open mouths pressing out from inside it, dripping tendrils at the bottom, glossy highlights, luminous core. The blob glows but there is no mist on the background. ${BG} ${STYLE}`),
  },
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const s = SHOTS[process.argv[2]];
  console.log(s ? JSON.stringify(s, null, 1) : Object.keys(SHOTS).join(' '));
}
