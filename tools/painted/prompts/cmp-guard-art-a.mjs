// Kling prompts for CMP-GUARD-ART-A (painted guardian puppets: 아리아 · 하티 · 핌 · 가웨인 · 크론 · 미네르바).
// Pipeline = docs/art/ENEMY_PIPELINE.md §3 (the guardians are small T1/T2 creatures): Step 1 = text_to_image design reference,
// Step 2 = image_to_image parts sheet (图片1 = the chosen reference), Step 3 = single part (图片1 reference [+ 图片2 sheet]).
// Model kling-image-v3_0_omni, img_resolution 2k. The looks follow the companion portraits (assets/portraits/cmp_g_*.webp,
// companions §11.3/§11.5) so the in-game puppet matches the card art: same palette, same silhouette details.
// Guardians are ALLIES: they read as friendly/cute-but-gothic (big readable eyes, soft glow), not as enemies.
// Print one prompt:   node tools/painted/prompts/cmp-guard-art-a.mjs gd_fairy ref|sheet   (or an EXTRAS key)
// Every call (kept and rejected) is logged in tools/kling/manifest_cmp-guard-art-a.json.
import { BG, refPrompt, sheetPrompt } from '../enemies/prompts.mjs';

/** same painterly suffix as the enemy cast (matches the portraits/backgrounds), worded for an allied companion */
export const STYLE = 'Dark gothic fantasy 2D action game companion creature art, highly detailed painterly digital illustration in the same style as dark gothic fantasy character art, clear readable silhouette with bold value contrast so it still reads when small, warm key light from the upper front, cool blue rim light from behind, no text, no letters, no numbers, no labels, no watermark.';
export { BG };
const clean = (s) => s.replace(/\s+/g, ' ').trim();
const withStyle = (p) => p.replace(/Dark gothic horror fantasy 2D action game enemy art[^]*?no watermark\./, STYLE);

export const GUARDIANS = {
  gd_fairy: {
    tier: 'T1', aspect: '1:1', sheetAspect: '4:3',
    who: 'tiny light fairy girl',
    subject: 'A tiny glowing light fairy girl (a friendly guardian spirit): short fluffy golden blonde hair, pointed elf ears, big bright amber-green eyes and a gentle smile, a dress made of layered green leaf petals, bare arms and legs, two pairs of long iridescent dragonfly wings on her back (clear glassy membranes with fine veins shimmering pale blue, pink and gold), holding a slender golden wand with a glowing five-pointed star at its tip, a soft warm golden glow around her body.',
    view: 'Front three-quarter view turned slightly to the right, the whole figure from the hair to the toes.',
    pose: 'Hovering in the air, the legs bent slightly back, the wand held up in her right hand, both pairs of wings spread open behind her.',
    parts: [
      'the fairy girl\'s whole body and head with the leaf-petal dress and the golden hair, her left arm resting at her side, WITHOUT any wings and WITHOUT the right arm',
      'her right arm alone from the shoulder to the hand, the hand holding the slender golden star wand, the arm stretched out straight to the right',
      'one long dragonfly wing alone, fully spread flat, clear glassy iridescent membrane with fine veins, the wing root at the left end of the piece',
    ],
    sheetView: 'front three-quarter view turned to the right',
  },
  gd_spiritwolf: {
    tier: 'T2', aspect: '4:3', sheetAspect: '4:3',
    who: 'spectral spirit wolf',
    subject: 'A translucent spectral spirit wolf (a friendly guardian spirit): a lean wolf made of glowing pale cyan and turquoise ghost-light, soft wispy fur, tiny white stars and starlight specks shining inside its semi-transparent body, glowing pure white eyes, pale cyan flame-like wisps rising from the ear tips, a long bushy tail that turns into streaming cyan spirit flames at its end, faint misty paws.',
    view: 'Strict side view in profile facing right, the whole wolf from the nose to the tail tip.',
    pose: 'Standing on all four legs in a relaxed alert stance, the head up, the tail held out behind.',
    parts: [
      'the wolf\'s body with the neck, WITHOUT the head, WITHOUT any legs and WITHOUT the tail',
      'the wolf head with the mouth closed, cut off at the neck',
      'the same wolf head howling, muzzle raised and the jaws wide open, cut off at the neck',
      'one front leg alone from the shoulder to the paw, hanging straight down',
      'one hind leg alone from the hip to the paw, hanging straight down',
      'the long bushy tail with the spirit-flame end alone, stretched out straight to the left',
    ],
  },
  gd_imp: {
    tier: 'T1', aspect: '1:1', sheetAspect: '4:3',
    who: 'small imp mage',
    subject: 'A small mischievous imp mage (a friendly but cheeky guardian): red-violet purple skin, a big head with large pointed ears, two small curled black horns, big round glowing orange eyes and a wide toothy grin full of little sharp teeth, a ragged dark purple-black hooded cloak over a small pot-bellied body, skinny limbs with clawed fingers and toes, small leathery bat wings on the back, a long thin pointed tail with a spade tip, holding a gnarled wooden staff topped with a little grinning skull that burns with an orange flame.',
    view: 'Front three-quarter view turned to the right, the whole figure from the horns to the toes.',
    pose: 'Hovering in the air with the legs dangling, holding the skull staff upright in its right hand, the wings spread.',
    parts: [
      'the imp\'s body and head with the cloak, the grin, the horns and the legs, its left arm at its side, WITHOUT any wings, WITHOUT the tail and WITHOUT the right arm',
      'its right arm alone from the shoulder to the clawed hand, the hand gripping the gnarled skull staff, the arm stretched straight out to the right',
      'one small leathery bat wing alone, fully spread flat, the wing root at the left end of the piece',
      'the long thin tail alone with the spade tip, stretched out straight to the left',
    ],
    sheetView: 'front three-quarter view turned to the right',
  },
  gd_knight: {
    tier: 'T2', aspect: '3:4', sheetAspect: '4:3',
    who: 'ghost knight',
    subject: 'A translucent ghost knight (a loyal guardian spirit): full plate armour made of glowing pale blue spectral light with darker steel-blue shading and white highlights, a closed great helm with a narrow eye slit glowing bright white from within, a tattered dark blue cape, a large kite shield with a faded dark cross painted on it, a long straight longsword glowing pale blue, NO legs: below the waist the armoured body dissolves into swirling pale blue mist.',
    view: 'Three-quarter side view facing right, the whole figure from the helm to the misty lower end.',
    pose: 'Floating upright, the longsword held in the right hand pointing up, the kite shield held in front on the left arm, the cape hanging behind.',
    parts: [
      'the armoured torso with the great helm, the shoulder plates and the misty lower body fading into swirling mist, WITHOUT the arms, WITHOUT the shield, WITHOUT the sword and WITHOUT the cape',
      'the right arm in plate armour from the shoulder to the gauntlet, the gauntlet closed as if gripping a hilt, the arm hanging straight down',
      'the long glowing longsword alone, pointing straight up',
      'the large kite shield alone with the faded dark cross, seen from the front',
      'the tattered dark blue cape alone, hanging straight down',
    ],
  },
  gd_whelp: {
    tier: 'T1', aspect: '4:3', sheetAspect: '4:3',
    who: 'baby skeletal dragon',
    subject: 'A cute baby skeletal bone dragon (a friendly guardian hatchling): an oversized rounded dragon skull of ivory bone with small curved horns and big dark eye sockets glowing violet, a small toothy grin, a little ribcage and spine of ivory bones with bright purple soulfire burning inside the ribcage, short bony legs with tiny claws, tiny bone wings with torn dusky purple membranes, a long thin wiggly bone tail made of small vertebrae.',
    view: 'Strict side view in profile facing right, the whole dragon from the snout to the tail tip.',
    pose: 'Flying with the little wings raised and spread, the legs tucked under the body, the tail trailing behind.',
    parts: [
      'the whelp\'s oversized skull with the upper teeth and the horns, WITHOUT the lower jaw, cut off at the neck',
      'the lower jaw bone alone with its little teeth',
      'the ribcage body with the purple soulfire inside, the neck bones and the four short bony legs, WITHOUT the skull, WITHOUT the wings and WITHOUT the tail',
      'one tiny bone wing alone with the torn purple membrane, fully spread flat, the wing root at the left end of the piece',
      'the long thin bone tail alone, stretched out straight to the left',
    ],
  },
  gd_owl: {
    tier: 'T1', aspect: '3:4', sheetAspect: '4:3',
    who: 'holy barn owl',
    subject: 'A holy white-and-gold barn owl (a wise guardian spirit): a heart-shaped white facial disc, large glowing golden eyes, a small pale beak, soft white breast feathers with fine golden speckles, wings of layered white and golden-brown feathers with gold-tipped primaries, short feathered legs with dark talons, a thin glowing golden halo ring floating behind its head.',
    view: 'Front three-quarter view turned to the right, the whole owl from the halo to the talons.',
    pose: 'Perched upright with the wings folded neatly against the body, the talons gripping nothing (no perch, no branch).',
    parts: [
      'the owl perched upright with the wings folded against its body and the halo, the whole bird',
      'the owl\'s body in flight with the head, the facial disc and the talons stretched down, WITHOUT any wings',
      'one feathered wing alone, fully spread open flat with the layered white and golden flight feathers fanning out, the wing root at the left end of the piece',
    ],
    sheetView: 'front three-quarter view turned to the right',
  },
};

/** single-part / edit prompts (Step 3/4) added while cutting: key → { guardian, aspect, inputs, prompt } */
export const EXTRAS = {};

export const ref = (id) => clean(withStyle(refPrompt(GUARDIANS[id])));
export const sheet = (id) => clean(withStyle(sheetPrompt(GUARDIANS[id])));

if (process.argv[1]?.endsWith('cmp-guard-art-a.mjs')) {
  const [id, kind] = process.argv.slice(2);
  if (!GUARDIANS[id] && !EXTRAS[id]) { console.log(Object.keys(GUARDIANS).join(' ') + ' | extras: ' + Object.keys(EXTRAS).join(' ')); process.exit(0); }
  if (EXTRAS[id]) console.log(clean(EXTRAS[id].prompt));
  else console.log(kind === 'sheet' ? sheet(id) : ref(id));
}
