// ART-BOSS-8 Kling 프롬프트 (2부 최종 보스: 니힐 b_nihil — 네 형태 전부)
// 모델 kling-image-v3_0_omni · image_to_image · img_resolution 2k. 图片1 = 보스 초상화 (assets/portraits/b_nihil.webp 또는 b_nihil2.webp → PNG 업로드).
// 템플릿: docs/art/BOSS_PIPELINE.md §3 (스타일 문구를 맨 앞에, 평평한 중간 회색 배경 + 왼쪽 위 키라이트 공통 꼬리말).
// 퍼핏 방향: 정면 (두건 · 가면 · 두 손 모두 정면. 몸이 돌아설 때는 약한 가로 눌림만 — 원본이 좌우 대칭이라 뒤집어도 티가 나지 않는다).
// 가산(발광) 부품(강착원반 · 검은 태양 코로나)은 회색 대신 순검정 배경에서 뽑는다 → 매트 없이 'lighter' 로 그린다.
// 결과(생성 ID · 채택/기각 이유)는 tools/kling/manifest_art-boss-8.json 과 configs/b_nihil.json 의 kling 블록에 기록한다.
// 사용: node tools/painted/prompts/art-boss-8.mjs [shotId]  → 프롬프트 출력 (Kling 호출은 에이전트가 MCP 로 한다)

export const SUFFIX = 'Flat uniform plain mid-grey studio background (#808080), no gradient, no floor, no cast shadow on the background. Strong key light from the upper left, darker lower right, crisp readable silhouette. Isolated object, nothing else in the image, no text, no labels.';
/** 가산 부품용 꼬리말: 순검정 배경 (검정 = 가산 합성에서 0) */
export const SUFFIX_BLACK = 'Pure solid black background (#000000) everywhere around it, no stars far from the object, no frame, no text, no labels, nothing else in the image.';
const NOFX = 'No smoke, no mist, no fog, no fire, no sparks, no lightning, no particles, no glow haze, no magic effects around the object.';
const NOHALO = 'No glowing outline, no light halo and no bright rim around the silhouette; the object edge meets the flat grey background directly.';

const NH = 'Paint in exactly the same painterly dark-fantasy style as 图片1: soft visible brush strokes, cold pale lavender-white porcelain with violet shadows, pitch-black tattered cloth with a faint violet sheen, deep violet, magenta and cyan cosmic nebula with tiny stars, thin iridescent prismatic cracks like shattered glass, no black outlines, not cartoon, not cel-shaded, not anime, not 3D render. Game asset for a 2D cut-out puppet.';
/** 메아리 (쓰러뜨린 보스의 그림자) 공통 */
const ECHO = (who, rim) => `Paint in a painterly dark-fantasy style with soft visible brush strokes, not cartoon, not anime, not 3D render. A ghostly shadow apparition of ${who} from 图片1, full body, seen from the front, filling most of the image: the whole figure is one flat solid silhouette of pitch-black void, inside it only a faint dark ${rim} smoky texture and a few thin glowing ${rim} cracks, its eyes glowing bright ${rim}, a thin glowing ${rim} rim line along the whole outline. Game asset for a 2D cut-out puppet. ${SUFFIX}`;
/** 가면 변형 (앞선 보스의 얼굴로 번지는 도자기 가면) — 图片1 = 그 보스의 초상화, 图片2 = 채택한 기본 가면 */
const FACE = (what) => `${NH} The same porcelain mask as 图片2: exactly the same outline, size, front view and pale lavender-white porcelain with black tear streaks, but its features are morphing into the face of the creature in 图片1: ${what}. It is still a cracked porcelain mask, seen alone, no hood, no hair outside the mask outline, no body. ${NOFX} ${NOHALO} ${SUFFIX}`;

/** shot → { aspect, count, refs (image_1 …), prompt } */
export const SHOTS = {
  // ───────── 몸 (두건 · 수의) ─────────
  nh_robe: { aspect: '3:4', count: 2, refs: ['portrait'], prompt: `${NH} The colossal hooded shroud of the void entity from 图片1 alone, WITHOUT the white mask and WITHOUT any hands, strict front view, symmetric: a tall pointed hood with an empty pitch-black face opening (a pure black hollow, nothing inside), broad drooping shoulders, two long wide empty sleeves hanging down at both sides and ending in torn rags (no hands, no arms visible), the front of the robe split open in a tall narrow pointed triangle from the neck down to the hem and inside that opening a deep cosmic void: violet and cyan nebula clouds with countless tiny stars and one bright white star in the middle, the black cloth itself woven from the night sky with faint tiny stars in its folds, the hem torn into long ragged pointed tatters and thin black root-like tendrils at the bottom, thin glowing iridescent prismatic cracks run across the black cloth like shattered glass. The whole shroud fits inside the image with empty grey margin on all sides. ${NOFX} ${NOHALO} ${SUFFIX}` },

  // ───────── 가면 ─────────
  nh_mask: { aspect: '1:1', count: 2, refs: ['portrait'], prompt: `${NH} The white porcelain mask of the void entity from 图片1 alone, front view facing the viewer, centered: a smooth elongated pale lavender-white porcelain face mask shaped like a long narrow shield that tapers into a pointed chin, two narrow slanted almond-shaped eye holes that are completely pitch black, a small mouth seam sewn shut with crude black stitches, one fine hairline crack running down from the top of the forehead, thin streaks of black tears running down from each eye hole, cold violet shading at the edges, a faint iridescent sheen. The mask alone, no hood, no head or hair behind it. ${NOFX} ${NOHALO} ${SUFFIX}` },
  nh_grin: { aspect: '1:1', count: 2, refs: ['portrait2', 'nh_mask'], prompt: `${NH} The same porcelain mask as 图片2: exactly the same outline, size, front view and pale porcelain, but torn open into a huge jagged grin like the mask in 图片1: the lower half split by a wide crescent mouth full of long needle-sharp pale teeth with pitch-black gaps between them, the eye holes narrowed into angry slanted black slits, fresh cracks spreading from the mouth corners, black tears. The mask alone, no hood, no body. ${NOFX} ${NOHALO} ${SUFFIX}` },

  // 가면 위로 스치는 얼굴 7 (로직 faceIdx 순서: 드라큘라 · 혼돈 · 나르키사 · 지즈 · 몰록 · 마라 · 사신)
  nh_face_dracula: { aspect: '1:1', count: 1, refs: ['b_dracula', 'nh_mask'], prompt: FACE('two glowing blood-red eyes in the eye holes, a sharp black widow\'s peak painted on the forehead, thin cruel pale lips parted to show two long white fangs, thin trickles of blood from the fangs') },
  nh_face_chaos: { aspect: '1:1', count: 1, refs: ['b_chaos', 'nh_mask'], prompt: FACE('many small open violet eyes with black slit pupils bursting through the porcelain all over the mask, a large third eye splitting open vertically on the forehead, violet-glowing cracks between the eyes') },
  nh_face_narkissa: { aspect: '1:1', count: 1, refs: ['b_narkissa', 'nh_mask'], prompt: FACE('the porcelain turning into cracked mirror glass with pale icy-blue reflections, a small crown of sharp glass shards along the top edge of the mask, pale icy-blue glowing eyes, glass-crack lines radiating from one eye') },
  nh_face_ziz: { aspect: '1:1', count: 1, refs: ['b_ziz', 'nh_mask'], prompt: FACE('a short hooked grey bird-skull beak growing out of the middle of the mask, ragged storm-grey feathers sprouting along the edges of the mask, pale-blue lightning-glowing eyes, a jagged crack like a lightning bolt') },
  nh_face_moloch: { aspect: '1:1', count: 1, refs: ['b_moloch', 'nh_mask'], prompt: FACE('two short curved dark bull horns breaking out of the top corners of the mask, glowing orange ember eyes, black soot smears and thin glowing molten-orange cracks') },
  nh_face_mara: { aspect: '1:1', count: 1, refs: ['b_mara', 'nh_mask'], prompt: FACE('faded pink doll cheeks, a long vertical mouth sewn shut with crude black thread, closed painted doll eyelids over the eye holes, a few black thread-like hair strands crossing the forehead') },
  nh_face_death: { aspect: '1:1', count: 1, refs: ['b_death', 'nh_mask'], prompt: FACE('the mask becoming a skull: deep round black eye sockets, a black triangular nose hole, a row of clenched skeleton teeth where the mouth is, grey bone shading') },

  // ───────── 손 (손바닥 눈) ─────────
  nh_hand: { aspect: '3:4', count: 2, refs: ['portrait'], prompt: `${NH} A single giant pale porcelain-white hand of the void entity from 图片1 alone, seen straight from the palm side, perfectly flat and upright, fingers pointing up: the four long fingers perfectly straight and spread slightly apart like a fan, the thumb spread straight out to the RIGHT side of the image, every finger with clearly visible knuckle creases at its three joints and a long pointed glossy black obsidian nail at the tip, in the middle of the palm one large CLOSED eye: a horizontal almond seam of heavy puffy eyelids with long dark lashes, thin iridescent prismatic cracks across the porcelain skin, the wrist at the bottom wrapped in torn black cloth that ends in a flat cut at the bottom edge. ${NOFX} ${NOHALO} ${SUFFIX}` },
  nh_eyes: { aspect: '16:9', count: 2, refs: ['portrait'], prompt: `${NH} Three separate flat objects in one row with wide empty space between them, no piece touches another, all seen straight from the front: 1) a single wide-open huge eye set in a flat horizontal almond-shaped patch of pale porcelain skin with heavy eyelids and long dark lashes, a glowing violet-pink iris ringed with gold and a black pupil, bloodshot white, NOT a round eyeball; 2) a round loose eyeball, bloodshot white with the same violet-pink and gold iris, looking at the viewer; 3) a tall narrow vertical slit eye glowing white-gold with a thin black vertical pupil, pointed at the top and the bottom, set in black. ${NOFX} ${NOHALO} ${SUFFIX}` },

  // ───────── 메아리 (P2): 쓰러뜨린 보스의 그림자 ─────────
  nh_echo_dracula: { aspect: '1:1', count: 1, refs: ['b_dracula2'], prompt: ECHO('the winged vampire demon (huge bat wings spread wide, horned head, clawed arms)', 'blood-red') },
  nh_echo_chaos: { aspect: '1:1', count: 1, refs: ['b_chaos'], prompt: ECHO('the eldritch chaos lord (a huge round mass with one giant central eye and many long writhing tentacles radiating outward, each ending in a small eye)', 'violet') },
  nh_echo_narkissa: { aspect: '1:1', count: 1, refs: ['b_narkissa'], prompt: ECHO('the glass empress (a tall regal woman with a crown of sharp glass spikes, a wide flaring gown of jagged mirror shards, long arms)', 'pale icy-blue') },
  nh_echo_ziz: { aspect: '1:1', count: 1, refs: ['b_ziz'], prompt: ECHO('the giant storm bird (wings spread wide and ragged, hooked skull beak, talons)', 'pale electric-blue') },

  // ───────── P3 아가리 · P4 검은 태양 ─────────
  nh_teeth: { aspect: '9:16', count: 2, refs: ['portrait'], prompt: `${NH} A single tall vertical strip from the top to the bottom of the image: the ragged torn edge of a rip in pitch-black void cloth, and growing out of that edge along its whole length a dense row of long crooked fangs made of pale glowing star crystal and bone, all pointing to the RIGHT, different lengths, some broken, some doubled, faint violet glints on the crystal. The black cloth is only on the left side of the strip, the teeth stick out into empty grey space on the right. ${NOFX} ${NOHALO} ${SUFFIX}` },
  nh_disk: { aspect: '16:9', count: 1, refs: ['portrait'], prompt: `Painterly cosmic illustration in the same style as the nebula in 图片1, soft brush strokes. A black hole seen at a slight angle, centered: a thin bright elliptical accretion disk of glowing violet, magenta and white-hot plasma swirling around a perfectly black round centre, a few thin streams of tiny stars spiralling inward. ${SUFFIX_BLACK}` },
  nh_sun: { aspect: '1:1', count: 2, refs: ['portrait'], prompt: `Painterly cosmic illustration in the same style as 图片1, soft brush strokes. A total eclipse of a black sun, centered: a perfectly round pitch-black disk filling about a third of the image, ringed by a blazing corona of white and pale-gold fire with long curling flame prominences and wispy streamers radiating outward in every direction. ${SUFFIX_BLACK}` },

  // ───────── 파편 (사망 · 월드 파편) ─────────
  nh_debris: { aspect: '16:9', count: 1, refs: ['portrait'], prompt: `${NH} About ten separate broken fragments arranged in a loose grid with wide empty space between pieces, no piece touches another: shards of the white porcelain mask from 图片1 (one with a black almond eye hole and a black tear streak), two broken porcelain finger joints with black obsidian nails, torn scraps of black cloth with a starry violet lining, jagged pieces of pale glowing star crystal, a broken porcelain eyelid with lashes. ${NOFX} ${NOHALO} ${SUFFIX}` },
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const id = process.argv[2];
  for (const [k, s] of Object.entries(SHOTS)) if (!id || k === id) console.log(`\n# ${k} (${s.aspect}, ×${s.count}, refs ${s.refs.join('+')})\n${s.prompt}`);
}
