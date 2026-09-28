// Kling prompts for ART-ENEMY-3 (painted enemy puppets, s07–s09): docs/art/ENEMY_PIPELINE.md §3.
//   s07 연금술 연구소: slime homunculus flesh_golem plague_doctor acid_turret
//   s08 지하 수로:     merman killer_fish frog_demon drowned water_spirit
//   s09 시계탑:        gear_golem harpy clockwork_soldier cog_wheel
// Model kling-image-v3_0_omni, img_resolution 2k. Step 1 = text_to_image design reference (imageCount 2), Step 2 =
// image_to_image parts sheet with the chosen reference as 图片1 (imageCount 2). T1 sprites are cut straight from the
// reference (no sheet). Shared suffixes (BG, STYLE) come from the enemy playbook so the whole cast matches the painted
// backgrounds and portraits.
// Print one prompt:   node tools/painted/prompts/art-enemy-3.mjs <id> ref|sheet|<extra key>
// Every call (kept and rejected) is logged in tools/kling/manifest_art-enemy-3.json.
import { BG, STYLE, refPrompt, sheetPrompt } from '../enemies/prompts.mjs';

export { BG, STYLE };
const clean = (s) => s.replace(/\s+/g, ' ').trim();

export const ENEMIES = {
  // ───────────────────────── s07 연금술 연구소 ─────────────────────────
  slime: {
    tier: 'T1', aspect: '1:1',
    who: 'alchemical slime',
    subject: 'A living alchemical slime, a failed transmutation that crawls on its own: a glossy translucent acid-green jelly blob, wider than tall with a flat underside, a half-dissolved small skull and a few bones floating inside it, little bubbles rising through the jelly, darker murky sediment at the bottom, one glowing yellow alchemical core eye with a black vertical slit pupil near the front, a bright glossy white highlight on the top, thick slime dripping at the base.',
    view: 'Strict side view, the whole blob, the eye on the right side.',
    pose: 'Resting in a relaxed round dome shape.',
  },
  homunculus: {
    tier: 'T2', aspect: '3:4', sheetAspect: '4:3',
    who: 'homunculus',
    subject: 'A homunculus, an artificial man born in an alchemist\'s glass flask, the size of a small child: hairless pale pinkish-grey skin with purple veins and black surgical stitches, an oversized bulbous head with a stitched seam across the skull, big sunken eye sockets with large glowing yellow eyes, a small jutting jaw full of needle teeth, a thin bony hunched body with spine knobs and visible ribs, long spindly arms with long clawed fingers, thin crooked legs with bony feet, a pink umbilical feeding tube trailing from its back.',
    pose: 'Standing hunched forward on its two thin legs with the knees bent, the long arms hanging down in front slightly away from the body, legs slightly apart so both legs are clearly visible.',
    parts: [
      'the oversized bald head with the glowing yellow eyes and the needle teeth (no neck below the jaw)',
      'the thin hunched torso with the spine knobs, the ribs and the stitches, from the neck down to the hips (no head, no arms, no legs)',
      'one thin upper arm',
      'one thin forearm with the long clawed hand',
      'one thin thigh',
      'one thin lower leg with the bony foot',
      'the pink umbilical feeding tube alone, lying horizontally',
    ],
  },
  flesh_golem: {
    tier: 'T3', aspect: '3:4', sheetAspect: '4:3',
    who: 'flesh golem',
    subject: 'A hulking flesh golem stitched together from dozens of corpses and brought to life by lightning: a huge hunched body made of mismatched patches of pale pink, grey-violet and sallow brown skin joined by thick black surgical stitches and iron staples, a riveted iron band clamped around the belly, three glass vials of glowing green alchemical fluid stuck into its hunched back, a tiny bald head sunk between massive shoulders with one eye sewn shut and one glowing green eye, an iron jaw bolted onto the lower face, copper electrodes on the neck, enormous long arms ending in huge clenched fists with iron bands around the forearms, short thick legs with big bare feet.',
    pose: 'Standing hunched forward, the huge arms hanging down slightly away from the body, the legs apart so both legs are clearly visible.',
    parts: [
      'the huge hunched torso with the iron belly band and the glowing vials in the back, from the shoulders down to the hips (no head, no arms, no legs)',
      'the small bald head with the iron jaw, the sewn eye and the glowing green eye (no neck)',
      'one huge upper arm',
      'one huge forearm with the iron band and the enormous clenched fist',
      'one thick thigh',
      'one thick lower leg with the big bare foot',
    ],
  },
  plague_doctor: {
    tier: 'T2', aspect: '3:4', sheetAspect: '4:3',
    who: 'plague doctor',
    subject: 'A sinister plague doctor: a long dark charcoal-purple waxed leather greatcoat reaching down to the ankles, a short brown leather shoulder cape, a wide-brimmed black hat with a dark red band, a pale ivory bird-beak mask with round glowing green glass goggles, black leather gloves, a belt with small round glass flasks of glowing green, violet and orange potions, black leather boots, a thin dark wooden cane with a brass knob.',
    pose: 'Standing upright and slightly stooped, the arms held slightly away from the body, the cane planted in the far hand, the legs slightly apart. No smoke.',
    parts: [
      'the head with the wide-brimmed hat and the bird-beak mask with the glowing green goggles (no neck)',
      'the body in the long greatcoat with the shoulder cape and the potion belt, from the neck down to the hem of the coat at the ankles (no head, no arms, no boots)',
      'one upper arm in a greatcoat sleeve',
      'one forearm in the greatcoat sleeve with the black gloved hand open',
      'one black leather boot with the lower part of the trouser leg',
      'one small round glass flask of glowing green poison with a cork',
      'the thin dark wooden cane alone, standing straight up',
    ],
  },
  acid_turret: {
    tier: 'T1', aspect: '3:4',
    who: 'acid distillery',
    subject: 'A monstrous alchemical acid distillery apparatus that boils on its own: a squat brick furnace base with a glowing orange fire mouth on its front, a round riveted copper boiler on top of it with a small pressure gauge and a red valve wheel on a brass pipe, above the boiler a big round glass distilling flask full of bubbling glowing acid-green liquid, its long curved glass neck bending forward to the right and down into a copper nozzle that drips green acid.',
    view: 'Strict side view, the whole apparatus from the furnace base to the top of the glass neck, the nozzle pointing to the right.',
    pose: 'No steam.',
  },

  // ───────────────────────── s08 지하 수로 ─────────────────────────
  merman: {
    tier: 'T2', aspect: '3:4', sheetAspect: '4:3',
    who: 'merman',
    subject: 'A savage merman, a fish-man from black sewer waters: slimy dark teal-green scales, a pale yellow-green scaled belly, a fish head with huge round glowing yellow eyes, a wide mouth with rows of needle teeth, red gill slits, a tall spiny red-orange crest fin on top of the head, a red spiny dorsal fin along the back, small red fins on the forearms, long webbed hands with claws, lean muscular legs with webbed red-finned feet, glistening wet.',
    pose: 'Standing hunched forward, the arms held slightly away from the body, the legs slightly apart so both legs are clearly visible.',
    parts: [
      'the fish head with the crest fin and the mouth closed (no neck)',
      'the same fish head with the jaws gaping wide open showing the needle teeth (no neck)',
      'the torso with the scaled belly and the red dorsal fin, from the neck down to the hips (no head, no arms, no legs)',
      'one upper arm',
      'one forearm with the red fin and the clawed webbed hand',
      'one thigh',
      'one lower leg with the webbed red-finned foot',
    ],
  },
  killer_fish: {
    tier: 'T1', aspect: '4:3',
    who: 'killer piranha',
    subject: 'A killer piranha fish grown fat on the corpses of the sewer: a short deep body, dark navy-blue back fading to steel-blue scaled sides and a blood-red belly, a huge underbite jaw wide open with rows of jagged white teeth, a small furious glowing red eye, a spiny dorsal fin, ragged red pectoral fins, a forked tail fin.',
    view: 'Strict side view in profile facing right, the whole fish from the jaws to the tail fin, horizontal.',
    pose: '',
  },
  frog_demon: {
    tier: 'T2', aspect: '4:3', sheetAspect: '4:3',
    who: 'demon toad',
    subject: 'A demon toad from the swamps of hell, as big as a boar: a fat squat body with warty dark olive-green skin, a pale cream belly, glowing orange pustule warts on the back, two bulging golden eyes with slit pupils on top of the head, two short curved ivory horns behind the eyes, a very wide lipless mouth, a pink throat sac under the chin, short clawed front legs, huge folded muscular hind legs with webbed feet.',
    view: 'Strict side view in profile facing right, the whole body.',
    pose: 'Sitting squat on the ground, ready to leap.',
    parts: [
      'the fat body with the head, the bulging eyes and the horns, WITHOUT the hind legs and WITHOUT the front legs',
      'one huge hind leg folded as when sitting',
      'the same hind leg fully stretched out straight backwards as when leaping',
      'one short front leg with the clawed hand',
      'the long pink sticky tongue alone, stretched out straight horizontally with a round sticky bulb at the right end',
    ],
  },
  drowned: {
    tier: 'T2', aspect: '3:4', sheetAspect: '4:3',
    who: 'drowned corpse',
    subject: 'A drowned corpse risen from a sewer canal: bloated waterlogged grey-blue skin with dark mottled bruises, a swollen distended belly, milky glowing pale-cyan dead eyes, a slack open jaw, long dripping dark seaweed-green hair, a torn dark blue-grey shirt, ragged dark trousers, bare swollen feet, dripping water and strands of weed.',
    pose: 'Standing slumped and hunched forward, the arms hanging slightly away from the body, the legs slightly apart so both legs are clearly visible.',
    parts: [
      'the head with the seaweed hair and the slack jaw (no neck)',
      'the bloated torso with the swollen belly and the torn shirt, from the neck down to the hips (no head, no arms, no legs)',
      'one bloated upper arm in a torn sleeve',
      'one bloated forearm with the swollen hand',
      'one thigh in ragged trousers',
      'one lower leg in ragged trousers with the bare swollen foot',
    ],
  },
  water_spirit: {
    tier: 'T1', aspect: '3:4', sheetAspect: '4:3',
    who: 'water spirit',
    subject: 'A sorrowful water spirit, the soul of a drowned woman made of living water: a translucent glowing blue body of flowing water, a graceful slender female upper body in a flowing gown of water, a pale luminous face with white glowing eyes, long hair made of streaming ribbons of water flowing behind her, below the waist the gown becomes a swirling whirlpool vortex instead of legs, a small bright white glowing heart of light in the chest.',
    pose: 'Floating upright, the arms held slightly away from the body. No mist and no glow on the background.',
    parts: [
      'the body with the head, the water hair and the whirlpool gown, WITHOUT any arms',
      'one slender arm of flowing water from the shoulder to the open hand, held straight',
    ],
  },

  // ───────────────────────── s09 시계탑 ─────────────────────────
  gear_golem: {
    tier: 'T3', aspect: '3:4', sheetAspect: '4:3',
    who: 'clockwork golem',
    subject: 'A towering clockwork steam golem guarding a clock tower: a massive barrel-shaped brass chest with rows of rivets and a round barred furnace window glowing orange-hot, a short iron chimney on its back, a low domed brass helmet head with a single glowing orange visor slit, a big bronze cogwheel mounted on its back, jointed brass arms with small cogs at the shoulders, the forearms steel pistons ending in heavy iron fists, thick brass-and-iron legs with piston rods and heavy iron feet.',
    pose: 'Standing heavy and upright, the arms held slightly away from the body, the legs apart so both legs are clearly visible. No steam.',
    parts: [
      'the barrel-shaped brass chest with the furnace window and the chimney, from the neck down to the hips (no head, no arms, no legs, no back cogwheel)',
      'the domed brass helmet head with the glowing visor slit (no neck)',
      'the big bronze cogwheel alone, seen flat from the front',
      'one brass upper arm with the shoulder cog',
      'one steel piston forearm with the heavy iron fist',
      'one thick brass thigh',
      'one lower leg with the piston rod and the heavy iron foot',
    ],
  },
  harpy: {
    tier: 'T2', aspect: '4:3', sheetAspect: '4:3',
    who: 'harpy',
    subject: 'A savage harpy, a bird-woman nesting at the top of a clock tower: a wild pale face with glowing golden eyes and a snarling mouth with small fangs, a mane of tangled black hair, a lean pale body covered on the chest by a breastplate of rust-brown plumage, arms that are great rust-brown feathered wings with dark tips, a skirt of brown feathers from the waist, scaly yellow bird legs with long black talons, a fan of long tail feathers.',
    pose: 'Hovering in the air, both wings spread wide open, the talons hanging below.',
    parts: [
      'the head with the tangled black hair (no neck)',
      'the body with the plumage breastplate, the feather skirt and the tail feathers, from the neck down (no head, no wings, no legs)',
      'one feathered wing alone, fully spread flat, the shoulder joint at the left end of the piece',
      'one scaly bird leg with the long black talons',
    ],
  },
  clockwork_soldier: {
    tier: 'T2', aspect: '3:4', sheetAspect: '4:3',
    who: 'clockwork toy soldier',
    subject: 'A clockwork toy soldier the size of a man: a cracked white porcelain doll face with painted rosy cheeks, a painted black moustache and glowing red button eyes, a tall black shako hat with a gold badge and a white plume, a scarlet red military coat with white cross belts, gold buttons and gold epaulettes, a black belt with a gold buckle, dark navy trousers with red stripes, shiny black boots, brass joints at the knees and elbows, a big brass wind-up key sticking out of its back, an old musket rifle with a long bayonet.',
    pose: 'Standing stiffly at attention, the musket held upright at its side, the arms slightly away from the body, the legs slightly apart.',
    parts: [
      'the porcelain head with the tall shako hat (no neck)',
      'the torso in the scarlet coat with the white cross belts and the epaulettes, from the neck down to the hips (no head, no arms, no legs, no key)',
      'one upper arm in a scarlet sleeve',
      'one forearm in a scarlet sleeve with a white gloved hand closed as if gripping',
      'one thigh in navy trousers with the red stripe',
      'one lower leg with the black boot',
      'the musket rifle with the bayonet alone, lying perfectly horizontal, the bayonet at the right end',
      'the big brass wind-up key alone, seen from the side',
    ],
  },
  cog_wheel: {
    tier: 'T1', aspect: '1:1',
    who: 'cogwheel monster',
    subject: 'A living sawblade cogwheel monster escaped from a clock tower mechanism: a heavy bronze-brass cogwheel with ten square teeth and five spokes, a ring of sharp polished steel saw teeth around its rim, and in its hub a single burning orange mechanical eye with a black slit pupil set in a dark iron socket.',
    view: 'Seen flat from the front, perfectly circular, centred with a wide margin.',
    pose: '',
  },
};

// extra single parts / edits (image_to_image, 图片1 = the chosen reference unless noted); filled in as they are sent
export const EXTRAS = {};

export const ref = (id) => refPrompt(ENEMIES[id]);
export const sheet = (id) => sheetPrompt(ENEMIES[id]);

if (process.argv[1]?.endsWith('art-enemy-3.mjs')) {
  const [id, kind = 'ref'] = process.argv.slice(2);
  if (EXTRAS[kind]) console.log(EXTRAS[kind].prompt);
  else if (ENEMIES[id]) console.log(kind === 'sheet' ? sheet(id) : ref(id));
  else console.log([...Object.keys(ENEMIES), ...Object.keys(EXTRAS)].join(' '));
}
export { clean };
