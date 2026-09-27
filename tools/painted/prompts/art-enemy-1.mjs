// Kling prompts for ART-ENEMY-1 (painted enemy puppets, common + s01–s03): docs/art/ENEMY_PIPELINE.md §3.
// Model kling-image-v3_0_omni, img_resolution 2k. Step 1 = text_to_image design reference, Step 2 = image_to_image parts
// sheet with the chosen reference as 图片1, Step 3 = single part (图片1 reference [+ 图片2 sheet]).
// Shared suffixes (BG, STYLE) come from the enemy playbook so the whole cast matches the painted backgrounds.
// Print one prompt:   node tools/painted/prompts/art-enemy-1.mjs zombie ref|sheet|<extra key>
// Every call (kept and rejected) is logged in tools/kling/manifest_art-enemy-1.json.
//
// Rig reuse (0–2 images each): golden_bat = bat atlas recoloured gold offline (golden_bat/recolor.py, 0 images);
// bone_thrower / skeleton_archer = skeleton sources + extra parts (EXTRAS below); axe_armor = knight sources + extras;
// medusa_spawner is invisible (render 'none'): no art.
import { BG, STYLE, refPrompt, sheetPrompt } from '../enemies/prompts.mjs';

export { BG, STYLE };
const clean = (s) => s.replace(/\s+/g, ' ').trim();

export const ENEMIES = {
  zombie: {
    tier: 'T2', aspect: '3:4', sheetAspect: '4:3',
    who: 'ghoul zombie',
    subject: 'A shambling ghoul, the rotting corpse of a villager risen from a cursed grave: sickly grey-green decaying skin stretched over the bones, sunken eye sockets with small glowing yellow eyes, a slack jaw with broken teeth, lank matted black hair, a torn filthy dusky purple shirt ripped open on the side to show the ribs, ragged dark brown trousers torn at the knees, one bare bony foot and one rotten boot, long cracked yellow fingernails, dark dried blood stains.',
    pose: 'Hunched forward in a shambling step, both arms stretched straight forward at shoulder height reaching with clawed fingers, legs apart in mid step so both legs are clearly visible.',
    parts: [
      'the head with the matted hair and slack jaw (no neck below the chin)',
      'the torso in the torn shirt with the exposed ribs, from the neck down to the hips (no arms, no legs, no head)',
      'one arm in a torn sleeve from the shoulder to the clawed hand, held straight',
      'one thigh in ragged trousers',
      'one lower leg with the bare bony foot',
    ],
  },
  possessed: {
    tier: 'T2', aspect: '3:4', sheetAspect: '4:3',
    who: 'possessed peasant farmer',
    subject: 'A possessed peasant farmer from a burning village: a gaunt man with pale grey-tan skin and dark veins crawling up the neck and face, eyes glowing violet with no pupils, a battered wide-brimmed straw hat with a dark red band, a patched brown linen shirt with rolled sleeves under a dark leather vest with suspenders, dark brown trousers, worn leather boots, a faint violet smoke rising from his shoulders, gripping a long wooden pitchfork with three rusty iron tines.',
    pose: 'Standing slightly hunched, holding the long pitchfork level at waist height with both hands, the tines pointing forward to the right, arms held slightly away from the body, legs slightly apart.',
    parts: [
      'the head with the straw hat and glowing violet eyes (no neck below the chin)',
      'the torso with the leather vest and suspenders from the neck to the hips (no arms, no legs, no head)',
      'one upper arm in a rolled linen sleeve',
      'one forearm with the bare hand closed as if gripping a pole',
      'one leg in dark trousers from the hip to the boot',
      'the long wooden pitchfork alone, lying perfectly horizontal, the three iron tines at the right end',
    ],
  },
  wolf: {
    tier: 'T2', aspect: '4:3', sheetAspect: '4:3',
    who: 'starving cursed wolf',
    subject: 'A starving feral wolf driven mad by a curse: gaunt body with shaggy dark grey-violet fur, bristling hackles along the spine, ribs showing through mangy fur, a pale grey belly, old red scars on the flank, a long narrow muzzle with bared yellowed fangs and dripping saliva, burning amber eyes, torn pointed ears, a ragged bushy tail, large clawed paws.',
    view: 'Strict side view in profile facing right, the whole body from the nose to the tip of the tail.',
    pose: 'Standing on all four legs in a low stalking pose, head held level and forward, tail hanging behind, the four legs clearly separated.',
    parts: [
      'the body and chest alone with the mane and the hackles, WITHOUT the head, WITHOUT any legs and WITHOUT the tail',
      'the head with the ears and the mouth closed, cut off at the neck',
      'the same head snarling with the jaws wide open, bared fangs, cut off at the neck',
      'one front leg from the shoulder to the paw, held straight down',
      'one hind leg from the hip to the paw',
      'the bushy tail alone, stretched out horizontally',
    ],
  },
  crow: {
    tier: 'T1', aspect: '4:3', sheetAspect: '4:3',
    who: 'carrion crow',
    subject: 'A monstrous carrion crow that feeds on battlefield corpses: big as a hawk, ragged glossy blue-black feathers with a violet sheen, a heavy cracked black beak, glowing blood-red eyes, a bald patch of wrinkled grey skin on the neck, scaly grey legs with hooked black talons.',
    view: 'Strict side view in profile facing right.',
    pose: 'Flying with both wings raised and spread wide open.',
    parts: [
      'the crow\'s body in flight with the head, beak, tail feathers and the legs tucked under the belly, WITHOUT any wings',
      'one wing alone fully spread open flat with the long primary feathers fanning out, the shoulder joint at the left end of the piece',
      'the same crow perched standing on its talons with both wings folded against its body, head raised',
    ],
  },
  gargoyle: {
    tier: 'T2', aspect: '4:3', sheetAspect: '4:3',
    who: 'stone gargoyle',
    subject: 'A living stone gargoyle demon from a castle rampart: a hunched winged beast carved of weathered grey-violet stone with green moss patches and deep cracks glowing with inner orange fire, a snarling head with a long snout, fangs and small glowing orange eyes, two thick ram horns curling backwards, pointed ears, big bat-like stone wings with ribbed membranes, muscular arms with clawed hands, digitigrade hind legs with talons, a long thin tail ending in a spade tip.',
    pose: 'Hovering in the air with both wings spread wide open, arms held forward with claws open, legs hanging.',
    parts: [
      'the body and chest alone, WITHOUT head, WITHOUT wings, WITHOUT arms, WITHOUT legs and WITHOUT tail',
      'the horned head with the mouth closed, cut off at the neck',
      'the same horned head roaring with the jaws wide open and fire glowing in the throat, cut off at the neck',
      'one stone wing alone fully spread open, the shoulder joint at the left end of the piece',
      'one arm from the shoulder to the open clawed hand',
      'one hind leg from the hip to the taloned foot',
      'the long thin tail alone with the spade tip, stretched out horizontally',
    ],
  },
  medusa_head: {
    tier: 'T1', aspect: '1:1', sheetAspect: '4:3',
    who: 'severed head of Medusa',
    subject: 'The severed flying head of Medusa: a beautiful but monstrous woman\'s face with pale green scaly skin, glowing golden slit serpent eyes, a hissing open mouth with small fangs and a forked tongue, a ragged bloody torn neck stump at the bottom, and a writhing mass of green snakes with yellow bands growing from the scalp instead of hair, each snake with a small hissing head.',
    view: 'Strict side view in profile facing right.',
    pose: 'Floating in the air, the snakes spreading backwards and upwards.',
    parts: [
      'the head alone with the face, the scalp and the torn neck stump, bald, WITHOUT any snakes',
      'one single long green snake with yellow bands stretched out perfectly straight horizontally, the snake head with an open mouth at the right end, the thin tail tip at the left end',
      'a second single snake stretched out straight horizontally, slightly shorter and darker, head at the right end',
    ],
  },
  wisp: {
    tier: 'T1', aspect: '1:1',
    who: 'will-o-the-wisp',
    subject: 'A floating will-o-the-wisp soul fire: a ball of ghostly teal and pale cyan flame with long flame tongues licking upward and backward, a faint screaming skull face visible inside the bright white-hot core, a few small sparks. The flame is compact and fully inside the image. No glow or haze spilling onto the background.',
    view: 'Side view.',
    pose: 'The flame leans slightly to the left as if drifting to the right.',
  },
  mimic: {
    tier: 'T1', aspect: '4:3', sheetAspect: '4:3',
    who: 'mimic treasure chest monster',
    subject: 'A mimic treasure chest monster: an old dark oak treasure chest bound with black iron bands and gold corner fittings and a gold lock plate, its lid thrown open like a jaw revealing rows of long jagged yellowed teeth along both rims, a dark red fleshy mouth inside, a long slimy red tongue lolling out, a single glowing yellow eye inside the mouth, and four thin spindly dark red insect-like jointed legs sprouting from underneath.',
    view: 'Strict side view in profile facing right, the lid hinge at the left.',
    pose: 'Standing on its legs with the lid open wide.',
    parts: [
      'the chest box alone WITHOUT the lid, WITHOUT legs and WITHOUT tongue, seen from the side, with the lower row of jagged teeth along the top rim and the dark red mouth inside',
      'the lid alone, closed position, seen from the side, the curved top and the upper row of jagged teeth along its lower edge',
      'the long slimy red tongue alone stretched out straight horizontally',
      'one thin spindly jointed insect leg alone, hanging straight down',
    ],
  },
  mud_man: {
    tier: 'T2', aspect: '3:4', sheetAspect: '4:3',
    who: 'mud golem',
    subject: 'A mud golem, a lumpy hunched humanoid formed of wet dripping graveyard mud: dark brown glistening sludge with embedded stones, broken bones and roots, a lumpy head with two hollow eye holes glowing orange and a gaping dripping hole for a mouth, long thick dripping arms ending in blunt lumpy fists, no real legs, the lower body melting into a thick mound of mud.',
    pose: 'Standing hunched, both arms hanging away from the body, the fists near the knees.',
    parts: [
      'the body with the head and the melting mound at the bottom, WITHOUT any arms',
      'one long thick dripping mud arm from the shoulder to the lumpy fist, held straight',
      'a round ball of wet mud with a few stones in it',
    ],
  },
};

// extra parts for the rig-reuse variants (image_to_image with the base enemy's reference as 图片1)
export const EXTRAS = {
  bone_thrower: {
    base: 'skeleton', aspect: '4:3',
    prompt: clean(`The same skeleton soldier as in 图片1 (identical bone colour, grime and painting style), shown as separate loose game sprite pieces laid out apart with wide empty grey gaps between them, no piece touching another: a small old leather sack stuffed with bones, tied with a rope, seen from the side; one thick thigh bone (femur) alone, lying horizontally; a tattered dark moss-green loincloth tied around a bony pelvis, seen from the side facing right. ${BG} ${STYLE}`),
  },
  skeleton_archer: {
    base: 'skeleton', aspect: '4:3',
    prompt: clean(`The same skeleton soldier as in 图片1 (identical bone colour, grime and painting style), now as a skeleton archer: separate loose game sprite pieces laid out apart with wide empty grey gaps between them, no piece touching another: the skull wearing a tattered dark green hooded cowl, strict side view facing right; an old wooden longbow alone, strung, standing upright, seen from the side; a worn leather quiver with red-fletched arrows alone, upright. ${BG} ${STYLE}`),
  },
  axe_armor: {
    base: 'armor_knight', aspect: '4:3',
    prompt: clean(`The same animated suit of armour as in 图片1 (identical blackened blue-grey steel, tarnished gold trim and painting style), shown as separate loose game sprite pieces laid out apart with wide empty grey gaps between them, no piece touching another: a closed great helm with two big curved bull horns and a visor slit glowing orange, strict side view facing right; a huge double-bitted battle axe alone with a long dark wooden haft, standing upright with the axe head at the top; the breastplate torso of the armour seen from the side facing right. ${BG} ${STYLE}`),
  },
};

// ── prompts actually sent for the Step-3 single parts and the Step-4 edits (image_to_image, 图片1 = the input listed) ──
// SINGLES: one clean part per image where the parts sheet could not give it. EDITS: occluder removal on the chosen figure
// (Kling refused twice to drop the zombie's baked-in arms: prep.py paints them out instead). Aspect 'auto' unless noted.
export const SINGLES = [
  { id: 'skeleton_archer', step: 'hood_single', input: "skeleton_ref + sa_parts", kept: "sa_hood.webp", aspect: 'auto',
    prompt: "Only one object in the whole image: the skull of the same skeleton archer as in 图片1 and 图片2 (identical bone colour, red glowing eye socket, grime and painting style) wearing the same tattered dark green hooded cowl as in 图片2, painted alone as a separate cut-out game sprite piece: the hood drapes over the top and back of the skull and ends in a short ragged capelet at the neck, WITHOUT any body, WITHOUT shoulders, WITHOUT arms. Strict side view in profile facing right, exactly like the side-view skull of 图片1, centred with a wide empty margin around it. Isolated on a plain flat uniform medium grey background (#808080), no floor, no ground, no cast shadow, no scenery, no border, no other objects. Dark gothic horror fantasy 2D action game enemy art, highly detailed painterly digital illustration in the same style as dark gothic fantasy character art, clear readable silhouette with bold value contrast so it still reads when small, warm key light from the upper front, cool blue rim light from behind, no text, no letters, no numbers, no labels, no watermark." },
  { id: 'wisp', step: 'frame2', input: "wisp_ref.webp", kept: "wisp_frame2.webp", aspect: 'auto',
    prompt: "The same will-o-the-wisp soul fire as in 图片1 (identical teal and dark cyan colours, identical skull design, same size, same framing and the same painting style), shown one moment later: the flame tongues flicker into a different shape and lick further up and to the left, and the skull's jaw is opened wider in a scream. Nothing else changes. Isolated on a plain flat uniform medium grey background (#808080), no glow or haze on the background, no floor, no ground, no cast shadow, no scenery, no border. Dark gothic horror fantasy 2D action game enemy art, highly detailed painterly digital illustration, no text, no letters, no numbers, no labels, no watermark." },
  { id: 'crow', step: 'fly_body', input: "crow_ref + crow_sheet1", kept: "crow_fly.webp", aspect: 'auto',
    prompt: "Only one object in the whole image: the body of the same carrion crow as in 图片1 and 图片2 (identical ragged blue-black feathers with violet sheen, glowing red eye, heavy cracked black beak, same painting style) in flight, painted alone as a separate cut-out game sprite piece: the head with the beak, the body, the fanned tail feathers and the scaly legs with talons tucked back under the belly, WITHOUT ANY WINGS (no wing at all, the shoulders are bare and smooth). Strict side view in profile facing right, the body horizontal, centred with a wide empty margin around it. Isolated on a plain flat uniform medium grey background (#808080), no floor, no cast shadow, no scenery, no other objects. Dark gothic horror fantasy 2D action game enemy art, highly detailed painterly digital illustration, clear readable silhouette, warm key light from the upper front, cool blue rim light from behind, no text, no letters, no numbers, no labels, no watermark." },
  { id: 'crow', step: 'wing', input: "crow_ref.webp", kept: "crow_wing.webp", aspect: 'auto',
    prompt: "Only one object in the whole image: one single wing of the same carrion crow as in 图片1 (identical ragged blue-black feathers with a violet sheen, same painting style), painted alone as a separate cut-out game sprite piece, fully spread open and lying flat horizontally like an open hand: the shoulder joint at the far LEFT end, the leading edge along the top, the long primary flight feathers fanning out to the RIGHT end, the secondary feathers hanging along the bottom edge. No body, no head, no other wing. Seen from directly above the wing, flat, centred with a wide empty margin around it. Isolated on a plain flat uniform medium grey background (#808080), no cast shadow, no other objects. Dark gothic horror fantasy 2D action game enemy art, highly detailed painterly digital illustration, no text, no letters, no numbers, no labels, no watermark." },
  { id: 'mimic', step: 'closed_chest', input: "mimic_ref.webp", kept: "mimic_closed.webp", aspect: 'auto',
    prompt: "Only one object in the whole image: the same treasure chest as in 图片1 (identical dark oak planks, black iron bands, gold corner fittings and gold lock plate, same painting style and the same three-quarter view and lighting) but completely innocent looking: the lid is CLOSED and locked, no teeth, no tongue, no eye, no mouth, NO LEGS, the chest simply stands on its flat wooden bottom. Centred with a wide empty margin around it. Isolated on a plain flat uniform medium grey background (#808080), no floor, no cast shadow, no scenery, no other objects. Dark gothic horror fantasy 2D action game art, highly detailed painterly digital illustration, no text, no letters, no numbers, no labels, no watermark." },
];
export const EDITS = [
  { id: 'zombie', step: 'edit_noarms', input: "the Step-1 side figure (zombie_side crop of sheet 2)", kept: "zombie_edit.webp", aspect: 'auto',
    prompt: "Edit 图片1: remove BOTH arms of the zombie completely (the near arm hanging along the side from the torn sleeve down to the clawed hand, and the far hand with yellow claws visible in front of the belly), and repaint the torn dusky purple shirt and the dark brown trousers that were hidden behind the arms, so the torn short sleeve is left as an empty ragged stump at the shoulder. Also remove the blue glow around the head. Keep everything else exactly identical: the head, the matted hair, the skull face with glowing eyes and broken teeth, the shirt, the trousers torn at the knees, the bare legs and feet, same strict side view in profile facing left, same size and position, same painting style and lighting, same flat plain uniform medium grey background, no shadow." },
  { id: 'wolf', step: 'edit_nolegs', input: "wolf_ref.webp", kept: "wolf_body.webp", aspect: 'auto',
    prompt: "Edit 图片1: remove all four legs of the wolf completely, from the shoulders and the hips down, and remove the bushy tail; repaint the shaggy fur of the chest, the belly, the shoulders and the haunches that were hidden, so the body ends in a smooth shaggy furry underside and a rounded furry rump. Remove the blood pool, the dirt and the shadow on the ground. Keep the head, the snarling jaws with the fangs and the dripping blood, the amber eyes, the ears, the neck, the mane, the bristling hackles, the scars on the flank, the colours and the lighting exactly identical, same pose and view facing right, same size and position, same painting style, same flat plain uniform medium grey background, no ground." },
  { id: 'mud_man', step: 'edit_noarms', input: "mud_man_ref.webp", kept: "mud_body.webp", aspect: 'auto',
    prompt: "Edit 图片1: remove BOTH arms of the mud golem completely, from the shoulders down to the lumpy fists, and repaint the glistening dripping mud body that was hidden behind them, with the same embedded stones and roots and the same folds of wet sludge. Keep the lumpy head, the two glowing orange eyes, the gaping dripping mouth with teeth, the stones and roots on the back, the body and the melting mud mound at the bottom exactly identical, same size and position, same painting style and lighting, same flat plain uniform medium grey background." },
  { id: 'gargoyle', step: 'edit_nowings', input: "gargoyle_ref.webp", kept: "gargoyle_body.webp", aspect: 'auto',
    prompt: "Edit 图片1: remove BOTH stone wings of the gargoyle completely (the near wing and the far wing behind it, including the wing bones and the membranes), and repaint the back, the shoulders and the spikes along the spine that were hidden behind the wings. Keep the horned head, the roaring mouth with the glowing throat, the arms and claws, the hind legs, the tail with the spade tip, the moss patches, the glowing orange cracks and all the colours exactly identical, same pose and view facing right, same size and position, same painting style and lighting, same flat plain uniform medium grey background." },
  { id: 'wolf', step: 'legs_tail', input: "wolf_body.webp", kept: "wolf_legs.webp", aspect: '16:9',
    prompt: "The same starving cursed wolf as in 图片1 (identical shaggy dark grey-violet fur, pale grey belly fur, big dark clawed paws, colours, lighting and painting style), redrawn as separate cut-out game sprite pieces for 2D skeletal animation, laid out apart in a loose row with wide empty grey gaps between them, no piece touching or overlapping another: one front leg alone from the shoulder down to the clawed paw, standing straight, seen strictly from the side facing right; one hind leg alone from the hip down to the clawed paw, with the backward-bent hock, seen strictly from the side facing right; the ragged bushy tail alone stretched out horizontally, its base at the left end and the tip at the right end. Every piece complete, no blue glow, no rim light halo around the pieces. Isolated on a plain flat uniform medium grey background (#808080), no floor, no ground, no cast shadow, no scenery, no border. Dark gothic horror fantasy 2D action game enemy art, highly detailed painterly digital illustration, clear readable silhouette, warm key light from the upper front, no text, no letters, no numbers, no labels, no watermark." },
  { id: 'zombie', step: 'parts_noarms', input: "zombie_edit.webp", kept: "zombie_parts2.webp (thigh only; Kling kept the arms)", aspect: '4:3',
    prompt: "The same ghoul zombie as in 图片1 (identical rotting grey-green skin, torn dusky purple shirt with the ripped shoulder, dark brown trousers torn at the knee, colours, lighting and painting style), redrawn as separate cut-out game sprite pieces for 2D skeletal animation, laid out apart in a loose row with wide empty grey gaps between them, no piece touching or overlapping another: the torso alone in the torn purple shirt from the neck down to the hips, strict side view facing left, WITHOUT any arms (the short torn sleeves are empty stumps at the shoulders), WITHOUT head and WITHOUT legs; one leg alone from the hip down to the bare bony foot, in the torn brown trousers, standing straight, strict side view facing left; one thigh alone in the torn brown trousers from the hip to the knee, strict side view. Every piece complete and whole. Isolated on a plain flat uniform medium grey background (#808080), no floor, no ground, no cast shadow, no scenery, no border, no glow. Dark gothic horror fantasy 2D action game enemy art, highly detailed painterly digital illustration, clear readable silhouette, warm key light from the upper front, no text, no letters, no numbers, no labels, no watermark." },
];

export const ref = (id) => refPrompt(ENEMIES[id]);
export const sheet = (id) => sheetPrompt(ENEMIES[id]);

if (process.argv[1]?.endsWith('art-enemy-1.mjs')) {
  const [id, kind = 'ref'] = process.argv.slice(2);
  const one = [...SINGLES, ...EDITS].find((r) => r.id === id && r.step === kind);
  if (one) console.log(one.prompt);
  else if (EXTRAS[id]) console.log(EXTRAS[id].prompt);
  else if (ENEMIES[id]) console.log(kind === 'sheet' ? sheet(id) : ref(id));
  else console.log([...Object.keys(ENEMIES), ...Object.keys(EXTRAS)].join(' '));
}
