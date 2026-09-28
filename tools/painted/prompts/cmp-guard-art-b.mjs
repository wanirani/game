// Kling prompts for CMP-GUARD-ART-B (painted guardian puppets: 틱톡 · 모르스 · 미라 · 루멘 · 모모).
// Pipeline = docs/art/ENEMY_PIPELINE.md §3, same as CMP-GUARD-ART-A (tools/painted/prompts/cmp-guard-art-a.mjs):
// Step 1 = text_to_image design reference, Step 2 = image_to_image parts sheet (图片1 = the chosen reference),
// Step 3/4 = single part or occluder-removal edit (EXTRAS below, added while cutting).
// Model kling-image-v3_0_omni, img_resolution 2k. The looks follow the companion portraits (assets/portraits/cmp_g_clock,
// cmp_g_reaper, cmp_gd_mirra, cmp_gd_lumen, cmp_gd_momo; companions §11.3/§11.5) so the in-game puppet matches the card art.
// Guardians are ALLIES: friendly / cute-but-gothic (big readable eyes, soft glow), never enemy-like.
// Print one prompt:   node tools/painted/prompts/cmp-guard-art-b.mjs gd_clock ref|sheet   (or an EXTRAS key)
// Every call (kept and rejected) is logged in tools/kling/manifest_cmp-guard-art-b.json.
import { BG, refPrompt, sheetPrompt } from '../enemies/prompts.mjs';

/** same painterly suffix as CMP-GUARD-ART-A (matches the portraits/backgrounds), worded for an allied companion */
export const STYLE = 'Dark gothic fantasy 2D action game companion creature art, highly detailed painterly digital illustration in the same style as dark gothic fantasy character art, clear readable silhouette with bold value contrast so it still reads when small, warm key light from the upper front, cool blue rim light from behind, no text, no letters, no numbers, no labels, no watermark.';
export { BG };
const clean = (s) => s.replace(/\s+/g, ' ').trim();
const withStyle = (p) => p.replace(/Dark gothic horror fantasy 2D action game enemy art[^]*?no watermark\./, STYLE);

export const GUARDIANS = {
  gd_clock: {
    tier: 'T1', aspect: '3:4', sheetAspect: '4:3',
    who: 'porcelain clockwork doll',
    subject: 'A small floating porcelain clockwork doll (a loyal guardian spirit): a round bald glossy white porcelain head with a thin dark crack running over the forehead and down one cheek, big shining amber-brown glass eyes with long lashes, painted rosy cheeks and small red lips, a tiny brass gear screwed to the side of the head, a dark navy-blue Victorian dress with puffed sleeves, gold filigree embroidery and a white lace collar and petticoat, white porcelain arms and legs with visible brass ball joints at the shoulders, elbows and knees, little black strap shoes, a large ornate golden wind-up key sticking out of the middle of its back, holding up a small parasol whose round canopy is a brass cogwheel.',
    view: 'Front three-quarter view turned to the right, the whole doll from the top of the head to the shoes.',
    pose: 'Hovering in the air with the legs dangling, the right arm raised holding the little cogwheel parasol above its head, the left arm at its side, the wind-up key clearly visible behind its back.',
    // sheet parts follow the kept reference (ref #1: a dark navy umbrella with a brass cog on top instead of a cog canopy)
    parts: [
      'the doll\'s whole body and head with the navy dress, the lace, the legs and the free arm with the open hand, WITHOUT the wind-up key, WITHOUT the umbrella and WITHOUT the arm that holds the umbrella',
      'the arm that holds the umbrella alone, from the shoulder ball joint to the white glove closed as if gripping a handle, with the brass elbow joint, the arm stretched out straight to the right',
      'the small open dark navy umbrella alone with the brass cogwheel on top and the curved brass hook handle, standing upright',
      'the large ornate golden wind-up key alone, seen from the side, the shaft pointing to the left',
      'one single brass cogwheel alone, seen flat from the front',
    ],
    sheetView: 'front three-quarter view turned to the right',
  },
  gd_reaper: {
    tier: 'T1', aspect: '3:4', sheetAspect: '4:3',
    who: 'little reaper',
    subject: 'A tiny cute hooded skeleton reaper child (a mischievous guardian spirit): a small round ivory skull face peeking from a deep black hood, glowing bright green pinpoint eyes in the eye sockets, a tattered black robe with ragged sleeves and small bony white hands, the bottom of the robe fraying into black smoky wisps instead of feet, holding with both hands an oversized scythe twice its own height with a long dark wooden shaft and a big curved silver blade, a small old iron lantern glowing with green soul-fire hanging from the scythe just below the blade.',
    view: 'Three-quarter side view facing right, the whole figure from the tip of the scythe blade to the smoky bottom of the robe.',
    pose: 'Floating upright, the scythe held upright in front of the body with both bony hands gripping the shaft at chest height, the blade high above the head curving forward to the right.',
    // sheet parts follow the kept reference (ref #0: blade curving forward to the right, lantern carried in the free hand)
    parts: [
      'the reaper\'s hooded body with the skull face, the tattered black robe and the smoky bottom, both bony hands held together in front of the chest as if gripping a pole, WITHOUT the scythe and WITHOUT the lantern',
      'the oversized scythe alone: the long dark wooden shaft standing straight upright and the big curved silver blade at the top curving out to the right',
      'the small old iron lantern alone with its hanging ring on top, glowing green soul-fire inside',
      'a small old leather-bound ledger book alone, lying open with yellowed pages',
    ],
    sheetView: 'three-quarter side view facing right',
  },
  gd_mirra: {
    tier: 'T1', aspect: '3:4', sheetAspect: '4:3',
    who: 'little mirror fairy girl',
    subject: 'A little floating mirror fairy girl (a gentle guardian spirit): very long flowing silver-white hair, pale porcelain skin, small pointed ears, big shining pale ice-blue eyes, a thin crack like broken glass on one cheek, a white and silver dress with puffed sleeves and a glassy pearly sheen, bare small feet, holding a small ornate silver hand mirror, a few sharp shards of mirror glass glinting and floating around her, a faint cold silver glow.',
    view: 'Front three-quarter view turned to the right, the whole girl from the top of the hair to the toes.',
    pose: 'Floating in the air, the feet pointing down, the right hand holding the silver hand mirror out in front of her, the left arm at her side, the long hair flowing behind her.',
    // sheet parts follow the kept reference (ref #1: faces right, two pointed crystal-shard wings on her back)
    parts: [
      'the girl\'s whole body and head with the long silver hair, the white dress, the bare legs and the free arm, WITHOUT the arm that holds the mirror, WITHOUT the crystal wings and WITHOUT any loose glass shards',
      'the arm that holds the ornate silver hand mirror alone, from the shoulder to the hand gripping the mirror handle, the arm stretched out straight to the right',
      'one pointed crystal-glass fairy wing alone, clear and glinting, fully spread, the wing root at the left end of the piece',
      'one long sharp shard of mirror glass alone, clear silvery glass reflecting light, pointing up',
    ],
    sheetView: 'front three-quarter view turned to the right',
  },
  gd_lumen: {
    tier: 'T1', aspect: '3:4', sheetAspect: '4:3',
    who: 'lantern jellyfish',
    subject: 'A glowing lantern jellyfish spirit (a friendly guardian): a translucent dome-shaped bell of pale cyan and pearly gold glass-like jelly with soft glowing ribs, a small old brass lantern with a warm golden flame hanging inside the bell, a frilly ruffled skirt edge, a bundle of frilly ruffled oral arms and many long thin trailing tentacles hanging below, glowing cyan with pink tips, tiny bioluminescent specks sparkling in the jelly.',
    view: 'Side view, the whole jellyfish from the top of the bell to the ends of the tentacles.',
    pose: 'Floating upright, the tentacles hanging down and trailing slightly to the left.',
    parts: [
      'the jellyfish bell alone with the brass lantern glowing inside and the frilly skirt edge, WITHOUT any tentacles and WITHOUT the oral arms',
      'the bundle of frilly ruffled oral arms alone, hanging straight down',
      'one long thin trailing tentacle alone, hanging straight down, glowing cyan with a pink tip',
    ],
    sheetView: 'side view',
  },
  gd_momo: {
    tier: 'T1', aspect: '4:3', sheetAspect: '4:3',
    who: 'dream-eating tapir',
    subject: 'A small chubby dream-eating tapir spirit, a baku (a sleepy friendly guardian): a round dark indigo-navy body with glowing golden star and crescent moon markings on its fur, fluffy cream-coloured chest fur and cheek tufts, sleepy half-closed violet eyes with long lashes and a soft smile, small round ears, a short flexible curled trunk, short stubby legs with little dark hooves, a small tufted curly tail, floating on a small puffy purple dream cloud.',
    view: 'Strict side view in profile facing right, the whole tapir from the trunk tip to the tail, standing on the cloud.',
    pose: 'Floating calmly on the little cloud, the trunk curled slightly downward.',
    parts: [
      'the tapir\'s body with the head, the ears, the stubby legs and the curly tail, WITHOUT the trunk and WITHOUT the cloud',
      'the short flexible trunk alone, stretched out straight to the right, the thick base at the left end of the piece',
      'the small puffy purple dream cloud alone',
    ],
  },
};

/** single-part / edit prompts (Step 3/4) added while cutting: key → { guardian, aspect, inputs, prompt } */
export const EXTRAS = {
  reaper_edit: { guardian: 'gd_reaper', aspect: '3:4', inputs: ['ref (gd_reaper_ref.webp)'],
    prompt: 'Edit 图片1: remove the oversized scythe completely (the long wooden shaft and the big curved silver blade) and remove the green lantern completely; the two bony hands stay exactly where they are, closed as empty fists held in front of the chest as if gripping an invisible pole; repaint the black robe, the hood and the smoky wisps that were hidden behind the shaft and the lantern. Keep everything else exactly identical: the same tiny hooded skeleton reaper, same skull face with glowing green eyes, same tattered black robe and smoky bottom, same three-quarter side view facing right, same size and position, same painting style and lighting, on a plain flat uniform medium grey background (#808080) with no cast shadow and no floor.' },
};

export const ref = (id) => clean(withStyle(refPrompt(GUARDIANS[id])));
export const sheet = (id) => clean(withStyle(sheetPrompt(GUARDIANS[id])));

if (process.argv[1]?.endsWith('cmp-guard-art-b.mjs')) {
  const [id, kind] = process.argv.slice(2);
  if (!GUARDIANS[id] && !EXTRAS[id]) { console.log(Object.keys(GUARDIANS).join(' ') + ' | extras: ' + Object.keys(EXTRAS).join(' ')); process.exit(0); }
  if (EXTRAS[id]) console.log(clean(EXTRAS[id].prompt));
  else console.log(kind === 'sheet' ? sheet(id) : ref(id));
}
