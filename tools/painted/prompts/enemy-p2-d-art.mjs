// Kling prompts for ENEMY-P2-D-ART (painted enemy puppets, Part 2 s17–s20): docs/art/ENEMY_PIPELINE.md §3.
// Model kling-image-v3_0_omni, img_resolution 2k. Step 1 = text_to_image design reference, Step 2 = image_to_image parts
// sheet with the chosen reference as 图片1, Step 3 = single part (图片1 reference [+ 图片2 sheet]).
// Shared suffixes (BG, STYLE) come from the enemy playbook so the whole cast matches the painted backgrounds.
// Part 2 creatures are other-worldly (storm garden, nightmare labyrinth, rotting forest, primordial void — world2 §5.4):
// grotesque, detailed, with a bright accent (glow, rim, pale fungus, starlight) so they read on the dark Part 2 stages.
// Print one prompt:   node tools/painted/prompts/enemy-p2-d-art.mjs gale_knight ref|sheet|<extra key>
// Every call (kept and rejected) is logged in tools/kling/manifest_enemy-p2-d-art.json.
import { BG, STYLE, refPrompt, sheetPrompt } from '../enemies/prompts.mjs';

export { BG, STYLE };
const clean = (s) => s.replace(/\s+/g, ' ').trim();

export const ENEMIES = {
  // ───────────────────────── s17 폭풍의 공중정원 ─────────────────────────
  storm_harpy: {
    tier: 'T2', aspect: '4:3', sheetAspect: '4:3',
    who: 'storm harpy',
    subject: 'A storm harpy, a gaunt monstrous bird-woman of the thunder clouds: a withered grey-skinned hag face with a hooked black beak-like nose, a wide screaming mouth full of needle teeth and glowing pale blue eyes, a wild crest of slate-blue feathers instead of hair, a scrawny feathered torso of storm-grey and blue-grey plumage crackling with tiny white-blue sparks, huge feathered wings instead of arms with long blue-grey flight feathers whose tips glow with electric blue light, a fan of long storm-grey tail feathers, scaly yellow-grey bird legs with long black hooked talons.',
    view: 'Strict side view in profile facing right, the whole body from the crest to the talons.',
    pose: 'Flying with both wings raised and spread wide open, legs hanging below with the talons open.',
    parts: [
      'the harpy\'s body in flight with the head, the feather crest, the feathered torso and the tail feathers, WITHOUT any wings and WITHOUT legs',
      'one feathered wing alone fully spread open flat with the long flight feathers fanning out, the shoulder joint at the left end of the piece',
      'one scaly bird leg alone from the feathered thigh to the open hooked talons, hanging straight down',
    ],
  },
  gale_knight: {
    tier: 'T2', aspect: '3:4', sheetAspect: '4:3',
    who: 'winged lancer knight',
    subject: 'A winged gale lancer knight of a sky citadel, eerie and inhuman: slender ornate white-and-gold plate armour with engraved wind swirls, a tall pointed closed helm with a narrow T-shaped visor glowing pale cyan from within and a crest of long white feathers, two large white feathered wings growing from the back of the cuirass with gold-tipped flight feathers, a long streaming pale blue cape, a very long slender gold lance with a leaf-shaped steel blade and a small pale blue pennant, armoured legs with pointed sabatons.',
    pose: 'Hovering in the air leaning slightly forward, the long lance held level at the hip pointing forward to the right, wings spread up behind the back, legs hanging slightly apart, the cape streaming back.',
    parts: [
      'the tall pointed helm with the glowing visor and the feather crest',
      'the breastplate torso with the gorget and the short skirt of waist plates (no arms, no legs, no wings, no head)',
      'one shoulder pauldron with the upper arm armour',
      'one forearm vambrace with an armoured gauntlet closed as if gripping a pole',
      'one armoured leg from the hip to the pointed sabaton, held straight',
      'the very long gold lance alone, lying perfectly horizontal, the leaf-shaped blade at the right end',
      'one large white feathered wing alone fully spread open flat, the shoulder joint at the left end of the piece',
      'the long pale blue cape alone, hanging straight down',
    ],
  },
  thunder_roc: {
    tier: 'T3', aspect: '4:3', sheetAspect: '4:3',
    who: 'thunder roc',
    subject: 'A colossal thunder roc, a monstrous storm bird: a bare bleached skull for a head with a long cracked hooked beak and pale blue lightning burning in the empty eye sockets, a hunched powerful body of ragged soot-black and slate-grey feathers, enormous wings whose dark feathers are split by glowing blue-white lightning veins, wisps of grey storm cloud trailing from the wing tips and the long ragged tail, thick scaly black legs with huge hooked talons.',
    view: 'Strict side view in profile facing right, the whole bird from the beak to the tail.',
    pose: 'Flying with both huge wings raised and spread wide open, the talons hanging below.',
    parts: [
      'the roc\'s body in flight with the neck and the long ragged tail feathers, WITHOUT the head, WITHOUT any wings and WITHOUT legs',
      'the bare skull head with the beak closed, cut off at the neck',
      'the same skull head screeching with the beak wide open and lightning in the throat, cut off at the neck',
      'one enormous wing alone fully spread open flat with the lightning veins, the shoulder joint at the left end of the piece',
      'one thick scaly leg alone with the huge hooked talons, hanging straight down',
    ],
  },
  cloud_jelly: {
    tier: 'T1', aspect: '1:1', sheetAspect: '4:3',
    who: 'thundercloud jellyfish',
    subject: 'A thundercloud jellyfish, a small living storm cloud shaped like a jellyfish: a puffy billowing dome bell of soft grey-white cloud with darker grey undersides, pale blue electric light flickering inside the cloud, two small glowing cyan eyes and a tiny downturned mouth in the rim, many long thin dangling tendrils beneath made of twisting pale cloud wisps and crackling blue-white lightning.',
    view: 'Side view.',
    pose: 'Floating in the air, the tendrils hanging straight down.',
    parts: [
      'the puffy cloud dome bell alone with the glowing eyes, WITHOUT any tendrils',
      'one single long tendril of cloud wisp and lightning alone, hanging perfectly straight down',
      'a second single tendril alone, shorter and thinner, hanging straight down',
    ],
  },
  // ───────────────────────── s18 악몽의 미궁 ─────────────────────────
  puppeteer: {
    tier: 'T2', aspect: '3:4', sheetAspect: '4:3',
    who: 'nightmare puppeteer',
    subject: 'A nightmare puppeteer, a gaunt unnaturally tall floating figure: a cracked white porcelain half-mask covering the upper face with empty black eye holes weeping violet light, a lipless grey mouth with stitched corners below the mask, a battered tall black top hat with a violet ribbon, a long tattered black-violet tailcoat whose ragged coat tails hang far below where the legs should be, no legs, thin arms in tight black sleeves, pale grey hands with impossibly long thin jointed fingers tipped with silver thimbles, fine glowing silver-white threads trailing from every fingertip.',
    pose: 'Floating upright in the air, both long-fingered hands held forward at chest height with the fingers spread like a puppet master working strings.',
    parts: [
      'the head with the porcelain half-mask and the tall top hat, cut off at the neck',
      'the torso in the black-violet tailcoat from the neck down to the long ragged coat tails, with the thin legs inside the coat (no arms, no head)',
      'one arm in a tight black sleeve from the shoulder to the wrist, held straight',
      'one pale grey hand alone with the impossibly long spread jointed fingers and silver thimbles',
    ],
  },
  faceless: {
    tier: 'T2', aspect: '2:3', sheetAspect: '4:3',
    who: 'faceless tall man',
    subject: 'The Faceless One, a very tall impossibly thin man-shaped horror: a perfectly smooth blank pale grey face with no eyes, no nose and no mouth, only faint bruised hollows where features should be, a long thin neck, a tight black funeral suit with a white shirt and a narrow black tie, extremely long thin arms reaching down to the knees, pale grey hands with long spindly fingers, very long thin legs in black trousers, polished black shoes.',
    pose: 'Standing upright and stiff, arms hanging down at the sides slightly away from the body, legs slightly apart.',
    parts: [
      'the smooth blank faceless head with the long thin neck',
      'the torso in the black suit jacket with the white shirt and tie, from the neck to the hips (no arms, no legs, no head)',
      'one upper arm in the black suit sleeve',
      'one forearm in the black sleeve with the pale grey hand and long spindly fingers, held straight',
      'one thigh in black trousers',
      'one lower leg in black trousers with the polished black shoe',
    ],
  },
  dream_eater: {
    tier: 'T3', aspect: '4:3', sheetAspect: '4:3',
    who: 'dream eater tapir nightmare',
    subject: 'A dream eater, a nightmare shaped like a tapir: a bloated floating body made of swirling deep purple and indigo nebula smoke with tiny stars inside, a dozen closed human eyes with long lashes scattered along the flank, a heavy tapir head with a long prehensile trunk ending in a round sucking mouth ringed with small teeth, small closed eyes and drooping ears, four tiny stubby hoofed legs dangling under the huge belly, wisps of violet smoke trailing from the back.',
    view: 'Strict side view in profile facing right, the whole body from the trunk tip to the tail wisps.',
    pose: 'Floating in the air, the trunk hanging and curling down, the tiny legs dangling.',
    parts: [
      'the bloated nebula body with the closed eyes along the flank and the smoke wisps, WITHOUT the head and WITHOUT any legs',
      'the tapir head with the ears, the closed eyes and the tusks, WITHOUT the trunk, cut off at the neck',
      'the long prehensile trunk alone stretched out perfectly straight horizontally, the round toothed sucking mouth at the right end',
      'one tiny stubby hoofed leg alone hanging straight down',
      'the same bloated body with all the eyes along the flank wide open, glowing violet, WITHOUT head and WITHOUT legs',
    ],
  },
  // ───────────────────────── s19 썩어가는 숲 ─────────────────────────
  rot_treant: {
    tier: 'T3', aspect: '3:4', sheetAspect: '4:3',
    who: 'rotten treant',
    subject: 'A rotten treant, a hunched walking dead oak eaten by fungus: a split blackened trunk with peeling bark and a skull-like knot face with two deep hollow eye pits glowing sickly yellow-green and a gaping splintered maw, pale white and cream shelf fungi growing in tiers from the trunk, clusters of swollen glowing yellow-green spore sacs bulging from cracks in the bark, grey mycelium threads, long gnarled branch arms ending in clawed twig fingers, thick twisted root legs, a crown of broken dead branches with hanging grey moss.',
    pose: 'Standing hunched forward, both long branch arms hanging slightly away from the trunk, the root legs apart.',
    parts: [
      'the hunched trunk body with the skull-like knot face, the shelf fungi, the glowing spore sacs and the crown of dead branches, WITHOUT arms and WITHOUT legs',
      'one gnarled branch upper arm from the shoulder to the elbow',
      'one gnarled branch forearm alone with the clawed twig fingers, held straight',
      'one thick twisted root thigh alone from the hip to the knee',
      'one twisted lower root leg alone from the knee to the spreading root foot',
    ],
  },
  plague_moth: {
    tier: 'T1', aspect: '4:3', sheetAspect: '4:3',
    who: 'plague moth',
    subject: 'A giant plague moth: a fat furry segmented body of dirty ochre and brown fur, a head with big glossy black compound eyes, feathery antennae and a curled proboscis, thin hairy legs, two pairs of large ragged wings of dusty brown and bone-white with huge staring eye-spots in sickly yellow-green and black on the forewings, the wing edges tattered and dripping glowing yellow-green spore dust.',
    view: 'Strict side view in profile facing right.',
    pose: 'Flying with the wings raised and spread wide open.',
    parts: [
      'the moth\'s furry body with the head, antennae, proboscis and the hairy legs, WITHOUT any wings',
      'one large forewing alone spread flat with the staring eye-spot, the wing root at the left end of the piece',
      'one smaller hindwing alone spread flat, the wing root at the left end of the piece',
    ],
  },
  fungal_husk: {
    tier: 'T2', aspect: '3:4', sheetAspect: '4:3',
    who: 'fungal husk corpse',
    subject: 'A fungal husk, a shambling corpse overgrown by a parasitic fungus: a huge pale cream and ochre mushroom cap with glowing yellow-green gills bursting out of the split top of its skull, the grey-green rotting face below with one milky eye and a slack jaw leaking spores, thin white mycelium threads sprouting from the cheeks, neck and wrists, a torn muddy peasant tunic and trousers, small mushrooms sprouting from the shoulders and back, grey bony hands with long nails, bare rotting feet.',
    pose: 'Hunched forward in a shambling step, both arms reaching forward at chest height, legs apart in mid step so both legs are clearly visible.',
    parts: [
      'the head with the huge mushroom cap bursting from the skull (no neck below the chin)',
      'the torso in the torn tunic with the small mushrooms, from the neck down to the hips (no arms, no legs, no head)',
      'one upper arm in a torn sleeve from the shoulder to the elbow',
      'one forearm with the grey bony clawed hand, held straight',
      'one thigh in the torn trousers',
      'one lower leg with the bare rotting foot',
    ],
  },
  // ───────────────────────── s20 태초의 공허 ─────────────────────────
  void_herald: {
    tier: 'T2', aspect: '2:3', sheetAspect: '4:3',
    who: 'void herald',
    subject: 'A void herald, a tall floating robed priest of the primordial void: a long hooded robe of matte black cloth with thin silver embroidery whose open front and inner lining show a deep starfield of tiny white stars and violet nebula, the hood hiding a face of pure darkness with two small white star-like eyes, a thin prismatic rainbow halo ring floating behind the head, long wide sleeves ending in hands made of pure white light, the robe hem dissolving into black smoke and drifting stars instead of feet.',
    pose: 'Floating upright in the air, arms held slightly forward and away from the body.',
    parts: [
      'the hooded robe body with the starfield interior, the smoke hem and the halo behind the hood, including the hooded head, WITHOUT any arms or sleeves',
      'one long wide robe sleeve alone from the shoulder to the cuff, held straight, the glowing white hand coming out of the cuff',
    ],
  },
  nihil_spawn: {
    tier: 'T1', aspect: '1:1', sheetAspect: '4:3',
    who: 'cluster of black void crystals',
    subject: 'A nihil spawn, a floating cluster of jagged obsidian-black void crystals: sharp shards of glossy black crystal bristling outward from a dense core, every crystal edge refracting a thin prismatic rainbow line of light, a cold white light glowing deep inside the cracks of the core like a pupil, a few small loose black shards hovering around it.',
    view: 'Side view.',
    pose: 'Floating in the air.',
    parts: [
      'the crystal cluster core alone with the glowing cracks, WITHOUT the loose shards',
      'one single long jagged black crystal shard alone with a prismatic edge, pointing up',
      'one single small black crystal shard alone, pointing up',
    ],
  },
};

/** single-part / edit prompts (Step 3/4) added while cutting: key → { enemy, prompt } */
export const EXTRAS = {
  // thunder_roc: neither sheet painted a loose wing or a wingless body (both came back as full figures) → Step 3 singles.
  // 图片1 = the chosen reference, 图片2 = sheet 1 (side-view figure with the closed skull, loose leg).
  roc_body: {
    enemy: 'thunder_roc', aspect: '16:9', inputs: ['ref', 'sheet1'],
    prompt: `Only one object in the whole image: the body of the same thunder roc as in 图片1 and 图片2 (identical design, proportions, colours, ragged soot-black and slate-grey feathers, materials and painting style) painted alone as a separate cut-out game sprite piece: the hunched powerful feathered body in flight with the feathered neck stump and the long ragged tail feathers trailing to the left, WITHOUT the skull head (the neck ends in a clean feathered stump at the right), WITHOUT any wings (smooth feathered back where the wings join) and WITHOUT legs. Strict side view in profile facing right, exactly like the side-view roc in 图片2, centred with a wide empty margin around it. ${BG} No other objects. ${STYLE}`,
  },
  roc_wing: {
    enemy: 'thunder_roc', aspect: '16:9', inputs: ['ref', 'sheet1'],
    prompt: `Only one object in the whole image: one enormous wing of the same thunder roc as in 图片1 and 图片2 (identical design, colours, soot-black feathers split by glowing blue-white lightning veins, materials and painting style) painted alone as a separate cut-out game sprite piece: the wing fully spread open flat and seen from the side, the shoulder joint at the far left end of the piece, the long ragged flight feathers fanning out to the right, WITHOUT the body, WITHOUT the head, WITHOUT the other wing. Centred with a wide empty margin around it. ${BG} No other objects. ${STYLE}`,
  },
  // rot_treant: the sheets painted full figures and loose limbs but no limbless trunk → Step 3 (图片1 ref, 图片2 sheet 2).
  treant_body: {
    enemy: 'rot_treant', aspect: '3:4', inputs: ['ref', 'sheet2'],
    prompt: `Only one object in the whole image: the trunk body of the same rotten treant as in 图片1 and 图片2 (identical design, proportions, colours, peeling blackened bark, materials and painting style) painted alone as a separate cut-out game sprite piece: the hunched split trunk with the skull-like knot face glowing sickly yellow-green in the eye pits, the pale shelf fungi, the swollen glowing yellow-green spore sacs, the grey hanging moss and the crown of broken dead branches, WITHOUT any arms (the shoulders end in short broken bark stumps) and WITHOUT legs (the trunk ends at the hips in a ragged split root base). Three-quarter view facing right exactly like the treant in 图片2, centred with a wide empty margin around it. ${BG} No other objects. ${STYLE}`,
  },
};

export const ref = (id) => clean(refPrompt(ENEMIES[id]));
export const sheet = (id) => clean(sheetPrompt(ENEMIES[id]));

if (process.argv[1]?.endsWith('enemy-p2-d-art.mjs')) {
  const [id, kind] = process.argv.slice(2);
  if (!ENEMIES[id] && !EXTRAS[id]) { console.log(Object.keys(ENEMIES).join(' ') + ' | extras: ' + Object.keys(EXTRAS).join(' ')); process.exit(0); }
  if (EXTRAS[id]) console.log(clean(EXTRAS[id].prompt));
  else console.log(kind === 'sheet' ? sheet(id) : ref(id));
}
