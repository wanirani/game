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

export const ref = (id) => refPrompt(ENEMIES[id]);
export const sheet = (id) => sheetPrompt(ENEMIES[id]);

if (process.argv[1]?.endsWith('art-enemy-1.mjs')) {
  const [id, kind = 'ref'] = process.argv.slice(2);
  if (EXTRAS[id]) console.log(EXTRAS[id].prompt);
  else if (ENEMIES[id]) console.log(kind === 'sheet' ? sheet(id) : ref(id));
  else console.log([...Object.keys(ENEMIES), ...Object.keys(EXTRAS)].join(' '));
}
