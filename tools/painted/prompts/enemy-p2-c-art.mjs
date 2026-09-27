// Kling prompts for ENEMY-P2-C-ART (painted Part 2 enemies of s14–s16, docs/art/ENEMY_PIPELINE.md §3, world2 §5.4):
//   s14 거울의 성      mirror_knight glass_wraith reflection chandelier_fiend
//   s15 영겁의 용광로  forge_imp slag_golem chain_warden bellows
//   s16 가라앉은 성소  abyss_angler sunken_priest coral_crab siren
// Model kling-image-v3_0_omni, img_resolution 2k (2 credits / image). The shared BG / STYLE suffixes are copied verbatim from
// tools/painted/enemies/prompts.mjs (identical across the cast = matches the portraits and the painted backdrops); Part 2
// adds OTHER (other-worldly, grotesque, readable on the dark Part 2 backdrops at phone size).
//
// Plan (budget ≤ 900 credits for the package; ≈ 2 images per call):
//   <id>_ref   text_to_image, the design reference (strict side view unless noted)        → tools/painted/enemies/<id>/src/<id>_ref.webp
//   <id>_sheet image_to_image (图片1 = chosen ref), cut-out parts sheet                    → <id>_sheet.webp
//   glass      text_to_image, loose mirror-glass shards + crack decal (shared by mirror_knight / glass_wraith / reflection)
//   reflection reuses the hero puppet (drawHero, PUPPET_PIPELINE) — its own atlas is only the glass sheet (0 own images)
// Inputs (图片N) are uploaded JPG copies of the stored sources (see manifest_enemy-p2-c-art.json → uploads).
// Print one prompt:   node tools/painted/prompts/enemy-p2-c-art.mjs <shot>
// Every call (kept and rejected images) is logged in tools/kling/manifest_enemy-p2-c-art.json.

export const STYLE = 'Dark gothic horror fantasy 2D action game enemy art, highly detailed painterly digital illustration in the same style as dark gothic fantasy character art, clear readable silhouette with bold value contrast so it still reads when small, warm key light from the upper front, cool blue rim light from behind, no text, no letters, no numbers, no labels, no watermark.';
export const BG = 'Isolated on a plain flat uniform medium grey background (#808080), no floor, no ground, no cast shadow, no scenery, no border.';
export const OTHER = 'An other-worldly grotesque creature from a nightmare realm beyond the castle, unsettling and detailed.';
const S = (s) => s.replace(/\s+/g, ' ').trim();
const SIDE = 'Strict side view in profile facing right, full body from head to feet.';
const SHEET = (who, n, pieces, view = 'strict side view facing right') => S(`The same ${who} as in 图片1 (keep the identical design, proportions, colours, materials and painting style), redrawn as a cut-out puppet parts sheet for 2D skeletal animation: each piece painted separately and laid out apart in a loose grid with wide empty grey gaps between them, no piece touching or overlapping another. The ${n} pieces are: ${pieces.join('; ')}. Every piece is complete and whole, including the portions normally hidden behind other parts, all in the same ${view}, same scale as each other. ${BG} ${STYLE}`);

export const SHOTS = {
  // ── s14 거울의 성 ────────────────────────────────────────────────────────────────────────────────────────────────
  mirror_knight_ref: {
    tool: 'text_to_image', aspect: '3:4', n: 2, for: ['mirror_knight'],
    prompt: S(`${OTHER} A tall gaunt knight whose whole armour is made of faceted silver mirror glass: sharp angular crystalline plates like shattered mirror panes, reflecting cold blue and pale violet light, thin blackened iron seams and rivets holding the glass plates together, hairline cracks across the plates and a dark empty void visible through the gaps between them. A tall faceted great helm whose visor is a single cracked mirror pane with a spider-web crack and a pale cold glow behind it. From the shoulders hangs a long cape made of hundreds of small jagged mirror shards strung on thin silver chains. In the near hand a long straight sword with a blade of clear blue-white glass with a jagged fractured edge. No shield. ${SIDE} Standing upright, the arms held slightly away from the body, the sword held low and pointing forward, the legs slightly apart. ${BG} ${STYLE}`),
  },
  mirror_knight_sheet: {
    tool: 'image_to_image', aspect: '4:3', n: 2, inputs: ['mirror_knight_ref'], for: ['mirror_knight'],
    prompt: SHEET('mirror-glass knight', 8, [
      'the faceted glass great helm with the cracked mirror visor',
      'the torso: the glass breastplate with the faulds and the hip plates (no head, no arms, no legs, no cape)',
      'one glass pauldron with the upper arm',
      'one forearm with the glass vambrace and the gauntlet, the hand closed as if gripping a hilt',
      'one armoured thigh',
      'one armoured lower leg with the glass sabaton',
      'the long glass sword alone, standing straight up with the point up',
      'the cape of hanging mirror shards alone, hanging straight down flat',
    ]),
  },
  glass: {
    tool: 'text_to_image', aspect: '4:3', n: 2, for: ['glass_wraith', 'mirror_knight', 'reflection'],
    prompt: S(`Cut-out game sprite pieces of broken magic mirror glass, each piece painted separately and laid out apart in a loose grid with wide empty grey gaps between them, no piece touching another: eight sharp jagged triangular and splinter-shaped shards of silvered mirror glass of different sizes, each reflecting cold blue and violet light with a bright white edge highlight and a dark silver backing; one round spider-web crack pattern of white glowing cracks on dark glass seen from the front; one long thin curved glass splinter. ${BG} ${STYLE}`),
  },
  glass_wraith_ref: {
    tool: 'text_to_image', aspect: '1:1', n: 2, for: ['glass_wraith'],
    prompt: S(`${OTHER} A glass wraith: the soul of a woman trapped inside a broken mirror. A floating torso built out of jagged broken mirror panes and glass splinters held together by threads of cold blue-white light, dark hollow gaps between the panes, the lower body dissolves into a trail of loose floating glass shards and pale mist. Its face is only a reflection on a cracked pane: a screaming mouth stretched far too wide and two empty white eyes. Long thin arms made of glass splinters ending in long needle-like glass fingers. Cold blue-white glow from inside. Strict side view in profile facing right, floating and leaning forward toward the right, one arm reaching forward. The wraith glows but there is no mist on the background. ${BG} ${STYLE}`),
  },
  glass_wraith_sheet: {
    tool: 'image_to_image', aspect: '4:3', n: 2, inputs: ['glass_wraith_ref'], for: ['glass_wraith'],
    prompt: SHEET('glass wraith', 3, [
      'the floating glass torso with the head and the trailing shard tail, WITHOUT any arms',
      'one long reaching arm made of glass splinters with the needle-like fingers, the shoulder at the left end of the piece',
      'the head alone with the reflected face screaming with the mouth stretched even wider',
    ]),
  },
  chandelier_ref: {
    tool: 'text_to_image', aspect: '4:3', n: 2, for: ['chandelier_fiend'],
    prompt: S(`${OTHER} A demon possessing an inverted crystal chandelier: a bulbous tarnished gilded brass hub like a swollen body with a small grotesque face in its centre — bulging bloodshot eyes, a lipless grin full of needle teeth; six long curved brass candle arms spread out from the hub like spider legs, each ending in a lit dripping red wax candle with a small flame; long strings of cut crystal drops and prisms dangling below the hub; a short heavy iron chain on top. Seen from the side, symmetrical, the arms spread wide to both sides. ${BG} ${STYLE}`),
  },
  chandelier_sheet: {
    tool: 'image_to_image', aspect: '4:3', n: 2, inputs: ['chandelier_ref'], for: ['chandelier_fiend'],
    // chosen ref (chandelier_ref_1): a fleshy sac hub with a skull face, black spider legs AND brass candle arms
    prompt: SHEET('spider chandelier demon', 6, [
      'the fleshy sac hub body with the skull face, the brass cap on top and the crystal drops hanging below it, WITHOUT any legs and WITHOUT any candle arms',
      'one long jointed black spider leg alone lying horizontally, the joint to the body at the left end, the sharp claw tip at the right end',
      'one curved brass candle arm alone lying horizontally, the joint to the body at the left end, the lit dripping red candle standing up at the right end',
      'one long string of cut crystal drops hanging straight down',
      'one large cut crystal prism',
      'a short piece of heavy iron chain hanging straight down',
    ], 'side view'),
  },
  // ── s15 영겁의 용광로 ────────────────────────────────────────────────────────────────────────────────────────────
  forge_imp_ref: {
    tool: 'text_to_image', aspect: '1:1', n: 2, for: ['forge_imp'],
    prompt: S(`${OTHER} A forge imp born from furnace embers, the size of a child: a wiry soot-black body with glowing orange molten cracks running across its skin like cooling lava, a mean horned head with a wide grin of glowing teeth and burning yellow eyes, ragged bat wings of charred leather with glowing edges, clawed hands, bent goat legs, a long thin tail tipped with a glowing ember, a leather satchel of red-hot iron rivets on a strap across its chest. ${SIDE} Hovering in the air, the wings raised and spread, the arms slightly away from the body, the legs dangling. ${BG} ${STYLE}`),
  },
  forge_imp_sheet: {
    tool: 'image_to_image', aspect: '4:3', n: 2, inputs: ['forge_imp_ref'], for: ['forge_imp'],
    prompt: SHEET('forge imp', 5, [
      'the imp\'s head, torso, rivet satchel and both goat legs in one piece, WITHOUT the wings, WITHOUT the arms and WITHOUT the tail',
      'one ragged bat wing alone fully spread flat, the shoulder joint at the left end of the piece',
      'one whole arm from the shoulder to the clawed hand, hanging straight down',
      'the long thin tail with the glowing ember tip lying horizontally, the root at the left end',
      'one red-hot iron rivet',
    ]),
  },
  slag_golem_ref: {
    tool: 'text_to_image', aspect: '3:4', n: 2, for: ['slag_golem'],
    prompt: S(`${OTHER} A hulking slag golem: a giant made of half-cooled molten iron and slag, a dark cracked black crust with bright orange-yellow molten metal glowing through every crack and dripping from its body, rusted iron plates and broken chains fused into its shoulders and chest, a blazing molten core in the chest, a small head sunk between huge shoulders with two white-hot eyes and a molten mouth, enormous arms ending in massive club-like molten fists, short thick legs. ${SIDE} Standing hunched forward, the arms hanging slightly away from the body, the legs apart. ${BG} ${STYLE}`),
  },
  slag_golem_sheet: {
    tool: 'image_to_image', aspect: '4:3', n: 2, inputs: ['slag_golem_ref'], for: ['slag_golem'],
    prompt: SHEET('slag golem', 5, [
      'the hunched torso with the sunken head, the iron plates and the molten core (no arms, no legs)',
      'one huge upper arm',
      'one huge forearm with the massive molten fist',
      'one thick thigh',
      'one thick lower leg with the foot',
    ]),
  },
  chain_warden_ref: {
    tool: 'text_to_image', aspect: '3:4', n: 2, for: ['chain_warden'],
    prompt: S(`${OTHER} A chain warden, the brutish horned jailer of a hellish foundry: a tall heavily muscled grey-skinned brute with burn scars, a heavy stained leather apron over the belly and legs, two curved black horns growing through an iron cage mask that hides the whole face except two glowing red eyes, a thick iron collar, a heavy iron chain wound many times around the near forearm, the loose end of the chain hanging down to a huge rusty barbed iron meat hook, heavy boots. ${SIDE} Standing, the arms held slightly away from the body, the legs slightly apart. ${BG} ${STYLE}`),
  },
  chain_warden_sheet: {
    tool: 'image_to_image', aspect: '4:3', n: 2, inputs: ['chain_warden_ref'], for: ['chain_warden'],
    prompt: SHEET('horned chain warden', 8, [
      'the horned head in the iron cage mask with the iron collar',
      'the muscled torso with the leather apron hanging down to the knees (no head, no arms, no legs)',
      'one muscled upper arm',
      'one forearm wrapped in the iron chain with the clenched fist',
      'one thigh',
      'one lower leg with the heavy boot',
      'the huge rusty barbed iron meat hook alone',
      'a straight length of heavy iron chain lying horizontally',
    ]),
  },
  bellows_ref: {
    tool: 'text_to_image', aspect: '1:1', n: 2, for: ['bellows'],
    prompt: S(`${OTHER} A living forge bellows monster: a huge blacksmith's bellows made of two heavy scorched oak boards bound with iron bands and a bulging leather bag of stitched hide between them with folds like a lung, the long iron nozzle at the front ends in a grotesque brass idol face with an open round mouth glowing with fire inside, four short stubby clawed iron legs under the lower board, a pair of wooden handles at the back, soot and glowing embers. ${SIDE} Standing on its legs, the nozzle pointing to the right. ${BG} ${STYLE}`),
  },
  bellows_sheet: {
    tool: 'image_to_image', aspect: '4:3', n: 2, inputs: ['bellows_ref'], for: ['bellows'],
    // chosen ref (bellows_ref_1): stitched leather bag with wooden handles at the back, a board wall at the front, nozzle + idol face
    prompt: SHEET('living bellows', 5, [
      'the bulging stitched leather bag alone with its iron bands, fully inflated, WITHOUT the wooden boards, WITHOUT the nozzle and WITHOUT the legs',
      'the front wall of scorched wooden boards with the iron bands and the round iron socket, alone',
      'the iron nozzle pipe with the brass idol face at its end, lying horizontally, alone',
      'the pair of wooden handles at the back, alone',
      'one clawed iron leg alone',
    ]),
  },
  // ── s16 가라앉은 성소 ────────────────────────────────────────────────────────────────────────────────────────────
  abyss_angler_ref: {
    tool: 'text_to_image', aspect: '16:9', n: 2, for: ['abyss_angler'],
    prompt: S(`${OTHER} An abyss anglerfish from a drowned sanctuary: a fat pale fish body with sickly translucent skin showing the ribs and bones inside, a gigantic head with an enormous underbite jaw lined with long crooked glass-like needle teeth, tiny milky eyes, ragged fins, a whip-thin tail with a torn fin, a long thin stalk growing from its forehead curving forward and ending in a glowing cyan lure bulb. ${SIDE} Swimming, the mouth slightly open. ${BG} ${STYLE}`),
  },
  abyss_angler_sheet: {
    tool: 'image_to_image', aspect: '4:3', n: 2, inputs: ['abyss_angler_ref'], for: ['abyss_angler'],
    prompt: SHEET('abyss anglerfish', 5, [
      'the fish body with the head and the upper jaw with its teeth, WITHOUT the lower jaw and WITHOUT the lure',
      'the huge lower jaw alone with its needle teeth, the hinge at the left end',
      'the glowing lure bulb alone',
      'one ragged pectoral fin alone',
      'the tail fin alone',
    ]),
  },
  sunken_priest_ref: {
    tool: 'text_to_image', aspect: '3:4', n: 2, for: ['sunken_priest'],
    prompt: S(`${OTHER} A sunken priest, a bloated drowned cleric of a flooded sanctuary: pale grey-green swollen waterlogged skin, a puffy face with milky white eyes and a swollen open mouth letting out bubbles, a tall mitre encrusted with barnacles and small shells, a long rotting deep teal robe with tarnished gold trim hanging to the ground, a slimy seaweed stole draped over the shoulders, bloated hands, a staff of pale coral with a glowing pearl at the top in the far hand. ${SIDE} Standing hunched, the near arm held slightly away from the body. ${BG} ${STYLE}`),
  },
  sunken_priest_sheet: {
    tool: 'image_to_image', aspect: '4:3', n: 2, inputs: ['sunken_priest_ref'], for: ['sunken_priest'],
    prompt: SHEET('drowned priest', 6, [
      'the bloated head with the barnacled mitre',
      'the body in the long robe with the seaweed stole, from the neck down to the hem on the ground (no head, no arms)',
      'one upper arm in the wide robe sleeve',
      'one forearm in the sleeve with the bloated open hand',
      'the pale coral staff with the glowing pearl alone, standing straight up',
      'one long strand of seaweed hanging straight down',
    ]),
  },
  coral_crab_ref: {
    tool: 'text_to_image', aspect: '16:9', n: 2, for: ['coral_crab'],
    prompt: S(`${OTHER} A giant armoured coral crab: a broad dark red crab carapace overgrown with branching pink and orange coral, barnacles and sea anemones, a tiny crumbling stone shrine with a small glowing lantern growing on its back, two eyes on long stalks, one enormous oversized crushing claw on the near side and one small claw on the far side, eight spiky jointed legs. ${SIDE} Standing, the big claw raised slightly. ${BG} ${STYLE}`),
  },
  coral_crab_sheet: {
    tool: 'image_to_image', aspect: '4:3', n: 2, inputs: ['coral_crab_ref'], for: ['coral_crab'],
    prompt: SHEET('coral crab', 6, [
      'the carapace body with the coral, the shrine and the eye stalks (no legs, no claws)',
      'the enormous claw arm from the shoulder to the wrist',
      'the enormous pincer with the fixed finger, WITHOUT the movable finger',
      'the movable finger of the enormous pincer alone',
      'the small claw with its arm',
      'one spiky jointed walking leg alone',
    ]),
  },
  siren_ref: {
    tool: 'text_to_image', aspect: '3:4', n: 2, for: ['siren'],
    prompt: S(`${OTHER} A siren of the sunken sanctuary swimming through the air: a gaunt woman with pale blue-grey skin and luminous cyan gill lines along the neck and ribs, hair made of long translucent fins, large black eyes, a mouth split far too wide from ear to ear with rows of small needle teeth, webbed clawed hands, from the hips down a long muscular fish tail with iridescent teal scales ending in a large torn fin. ${SIDE} Floating upright as if swimming, the tail curving down and back, the arms held slightly away from the body. ${BG} ${STYLE}`),
  },
  siren_sheet: {
    tool: 'image_to_image', aspect: '4:3', n: 2, inputs: ['siren_ref'], for: ['siren'],
    prompt: SHEET('siren', 5, [
      'the head with the fin hair and the upper body down to the hips, WITHOUT the arms',
      'the head alone singing with the too-wide mouth stretched wide open',
      'one whole arm from the shoulder to the webbed clawed hand',
      'the long fish tail from the hips to the torn fin, lying horizontally with the hips at the left end',
      'one long translucent fin of hair alone',
    ]),
  },
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const s = SHOTS[process.argv[2]];
  console.log(s ? JSON.stringify(s, null, 1) : Object.keys(SHOTS).join(' '));
}
