// 인게임 HUD: 초상화/HP/MP/EXP, 하트+보조무기, 스킬 슬롯, 필살 게이지, 점수/목숨/골드/시간, 보스 체력바, 버프, 배너 — owner: HUD-FINAL (W3)
// 모든 위치는 hud_layout.js 의 hudLayout() (MASTER_PLAN §1.8) 에서 받는다 — 여기서 좌표를 새로 정하지 말 것.
// 그리는 순서 (FEEL-HUD 계약, 요청 191): 초상화·체력·하트·스킬 → 1 필살(SP) 게이지 → 2 feel_hud.drawAwGauge (각성 게이지 + 준비 문구 칸
//  L.ready 전부; SP 막대 위에 빛을 겹치므로 반드시 SP 게이지 다음) → 3 companion_hud.drawCompanionHUD (동료 위젯 칸 + 스킬 카드 줄)
//  → 4 점수 → 5 feel_hud.drawComboHUD (콤보·스타일 열) → 6 보스 체력바 → 7 알림 칸: world.banner 가 있으면 배너, 없으면 feel_hud.drawAnnouncer.
//  기믹 게이지(gimmicks.drawScreen → hudLayout().meter(i))와 토스트(game.js → hudLayout().toast(i))는 각자 그린다.
// prompts.drawGlyph (PLAT-INPUT) — 스킬 슬롯·페이지 안내의 버튼 글리프 (기기별 키캡/패드/터치 아이콘; platform §4.5)
// 각성 컷인·연출 중(world.hudHidden)에는 HUD 전체를 그리지 않는다 (동료 위젯의 탭 판정 사각형도 비운다).
import { text, bar, bloodText, prewarmText, font, FONT, COLORS, fontEpoch } from '../core/ui.js';
import { assets } from '../core/assets.js';
import { fmt, fmtTime, TAU, clamp, rgba } from '../core/math.js';
import { faceRect } from './portrait.js';
import { drawIcon } from './icons.js';
import { drawHeart } from '../game/pickups.js';
import { SUBWEAPONS } from '../data/subweapons.js';
import { SKILLS } from '../data/skills.js';
import { POWERUPS } from '../data/powerups.js';
import { CHARACTERS } from '../data/characters.js';
import { classNameOf } from '../data/ascensions.js';   // 직업 이름: 초월·비전이면 그 이름 (classes_t3 §8.3)
import { expToNext } from '../game/stats.js';
import { hudLayout, hudTouch, vitalsFoldRows } from './hud_layout.js';
import { drawComboHUD, drawAnnouncer, drawAwGauge, hudOverflow } from './feel_hud.js'; // [hook:feel]
import { drawCompanionHUD } from './companion_hud.js'; // [hook:cmp]
import { drawGlyph, bindingOf, promptMode } from '../core/prompts.js'; // [hook:plat]
import { input } from '../core/input.js';
import { ASSET_ROOT } from '../core/assets.js';
import { PAD_LAYOUT_FOLD, planExtent, touchpad } from '../core/touchpad.js';
import { drawQuestTracker, toggleQuestTracker, questTrackerState } from './quest_tracker.js';   // [hudredo]
import { crisp, crispActive, hashStart, hashNum, hashStr } from './hud_crisp.js';   // [hudfix] 상시 HUD 를 기기 해상도 덧캔버스로
import { useItem } from '../game/inventory.js';   // [hudfix] 빠른 칸 탭 = 물약 사용
import { ITEMS } from '../data/items.js';
import { drawMinimap, drawMinimapRing, drawBigMap } from './minimap.js';
import { drawLockMarks, drawLockPlate, autoPill, autoPillW, autoLevelOf, autoHoldOf } from './hud_auto.js';   // [auto] 대상 고정 표적 고리 · 이름 옆 AUTO

// ── 그린 HUD 그림 (hud_mobile §4): 테(assets/ui/hud/*.webp) · 스킬/UI 아이콘(assets/icons/skills/<id>.webp 96 px, 48/<id>.webp 48 px) ──
// 이미지는 한 번 받아 두고 drawImage 만 한다 (원형 알파는 그림에 구워져 있다 — 클립 없음). 없는 아이콘은 요청하지 않는다(ICON_IDS).
const ICON_IDS = new Set('asc_azel_lullaby asc_bran_oathbanner asc_isolde_breath asc_kael_firstseal asc_lia_frostwing asc_sera_seventhbell asc_victor_silverbullet awaken_azel awaken_bran awaken_isolde awaken_kael awaken_lia awaken_sera awaken_victor azel_bat_storm azel_blood_lance azel_crimson_feast azel_dawn_rush azel_dawnbreaker azel_fallen_wings azel_moon_slash azel_phantom_blades bran_aegis bran_blood_frenzy bran_crusade_sword bran_ground_split bran_shield_charge bran_warcry bran_warlord_leap bran_whirlwind isolde_dragon_dive isolde_javelin isolde_piercing_gale isolde_storm_dragon isolde_thousand_thrusts isolde_thunder_lance isolde_valhalla isolde_wyrm_breath kael_autodafe kael_blood_hunt kael_holy_cross kael_raven_storm kael_sanctuary kael_silver_fan kael_tempest kael_vigilia lia_blade_waltz lia_cross_cut lia_kagerou lia_reaper_scythe lia_shadow_clones lia_shadow_step lia_shuriken lia_thousand_blades sera_archangel sera_chrono sera_fireball sera_heal sera_holy_bolt sera_light_pillar sera_meteor sera_thunderstorm ui_ach ui_bag ui_boss ui_door ui_guard ui_jump ui_lock ui_map ui_menu ui_mount ui_quest ui_swap ult_azel ult_bran ult_isolde ult_kael ult_lia ult_sera ult_victor victor_bullet_dance victor_dynamite victor_execution victor_fanning victor_gatling victor_hellfire_burst victor_phantom_bullet victor_pierce_shot'.split(' '));
const FRAME_NAMES = ['ring_map', 'stick_base', 'ring_attack', 'ring_small', 'frame_ult', 'frame_slot', 'ring_lock', 'gem'];
const UI_ICONS = ['ui_jump', 'ui_mount', 'ui_guard', 'ui_swap', 'ui_lock', 'ui_menu', 'ui_map', 'ui_bag', 'ui_quest'];
const ART = new Map();
const ART_FNS = [];
let artFrames = 0, artReady = false;
export const HUD_ART_STATS = { loaded: 0, failed: 0 };
function artImg(path) {
  let e = ART.get(path);
  if (!e) {
    e = { img: null, ok: false };
    ART.set(path, e);
    if (typeof Image !== 'undefined') {
      const img = new Image();
      img.decoding = 'async';
      const done = (ok) => {
        e.ok = ok; HUD_ART_STATS[ok ? 'loaded' : 'failed']++;
        if (path.startsWith('ui/hud/') && ++artFrames >= FRAME_NAMES.length) artReady = true;
        for (const f of ART_FNS) { try { f(path); } catch (er) { console.error('[hud] art', er); } }
      };
      img.onload = () => done(true);
      img.onerror = () => done(false);
      img.src = `${ASSET_ROOT}${path}.webp?v=${assets.version ?? ''}`;
      e.img = img;
    }
  }
  return e.ok ? e.img : null;
}
/** HUD 테 그림 (이름: ring_map stick_base ring_attack ring_small frame_ult frame_slot ring_lock gem) | null (아직·실패) */
export function hudArt(name) { return artImg('ui/hud/' + name); }
/** 테 그림을 다 받았나 (받은 뒤 패드가 버튼 그림을 다시 굽는다) */
export function hudArtReady() { return artReady; }
/** 테·UI 아이콘을 미리 받는다. fn(path) = 그림 하나가 올 때마다 (패드 다시 그리기) */
export function preloadHudArt(fn) {
  if (typeof fn === 'function' && !ART_FNS.includes(fn)) ART_FNS.push(fn);
  for (const f of FRAME_NAMES) hudArt(f);
  for (const u of UI_ICONS) artImg('icons/skills/' + u);
}
/** 아이콘 그림 (그릴 지름 d → 기기 px 60 이하면 48 px 판) | null */
function iconImg(id, d, ctx) {
  if (!id || !ICON_IDS.has(id)) return null;
  let a = 1;
  try { const m = ctx?.getTransform?.(); if (m) a = Math.hypot(m.a, m.b) || 1; } catch { /* 변환 없음 */ }
  if (d * a <= 60) return artImg('icons/skills/48/' + id) ?? artImg('icons/skills/' + id);
  return artImg('icons/skills/' + id) ?? artImg('icons/skills/48/' + id);
}
/** 그린 아이콘(원형)을 지름 d 로 (alpha 배) → 그렸으면 true */
export function drawArtIcon(c, id, cx, cy, d, alpha = 1) {
  const img = iconImg(id, d, c);
  if (!img) return false;
  if (alpha !== 1) { const a0 = c.globalAlpha; c.globalAlpha = a0 * alpha; c.drawImage(img, cx - d / 2, cy - d / 2, d, d); c.globalAlpha = a0; }
  else c.drawImage(img, cx - d / 2, cy - d / 2, d, d);
  return true;
}
/** UI·스킬 그림 아이콘을 받았나 (선명 칸 키용) */
export function artIconReady(id) { return !!iconImg(id, 100, null); }
/** 스킬 그림 아이콘 (스킬 id) → 그렸으면 true (없으면 부른 쪽이 drawSkillGlyph 로) */
export function drawSkillArt(c, sid, cx, cy, d, alpha = 1) { return drawArtIcon(c, sid, cx, cy, d, alpha); }
/** 스킬 아이콘: 그림이 있으면 그림, 없으면 벡터 문장 (예전 drawSkillGlyph 크기 s 기준) */
export function drawSkillIcon(c, sk, cx, cy, s) {
  if (sk?.id && drawArtIcon(c, sk.id, cx, cy, s * 1.1)) return;
  drawSkillGlyph(c, sk, cx, cy, s);
}

// 버프 칸 글자 (이름 첫 글자는 '무적의 물약'·'무기 강화'처럼 겹치므로 버프마다 고유하게)
const BUFF_GLYPH = { rage: '광', haste: '신', invincible: '무', magnet: '자', gunmode: '총', holyaura: '성', whipup: '강', double: 'Ⅱ', triple: 'Ⅲ' };
const NO_RECTS = [];

export function drawHUD(ctx, world, vw, vh) {
  if (world.hudHidden) { // [hook:awaken] 각성 컷인·연출 중: 동료 위젯·기믹 게이지까지 통째로 숨긴다
    if (world.game?.hudTaps?.length) world.game.hudTaps.length = 0;
    if (world.companions) { NO_RECTS.length = 0; try { world.companions.hudRects = NO_RECTS; } catch { /* 읽기 전용이면 동료 쪽이 직접 관리 */ } } // [hook:cmp] 보이지 않는 위젯 자리를 누른 탭이 탈것·수호신을 부르지 않게
    return;
  }
  const p = world.player;
  if (!p) return;
  const hero = world.hero, run = world.run, st = p.stats;
  const T = hudTouch();
  // 터치: 모든 글자는 L.textMin(= 11 CSS px 를 논리 px 로) 이상 — 휴대폰 캔버스는 0.67–0.72배로 줄어 보인다 (platform §6.2).
  // 휴대폰 배치(L.big)는 칸도 키우고 중복 문구(직업명 · 'SCORE')를 뺀다. 터치는 페이지 안내·슬롯 S1/S2 표시도 뺀다 (패드 버튼에 있다)
  const L = hudLayout(world, vw, vh);
  drawLockMarks(ctx, world);   // [auto] 월드 위 표적 고리 (HUD 칸보다 먼저 — HUD 가 위에 덮는다)
  if (L.fold) { drawFoldHUD(ctx, world, vw, vh, L, T); drawLockPlate(ctx, world, L); return; }   // 폴드·태블릿 배치 (hud_mobile §3) · [autofix] 고정 대상 이름판·버튼 밑 화살표
  const g0 = world.game;
  ctx.save();
  // 초상화+체력·점수 칸: 터치일 때 기기 해상도 덧캔버스로 (hud_crisp — hudfix)
  const po = L.portrait, vi = L.vitals;
  const vx = Math.min(po.x, vi.x) - 3, vy = Math.min(po.y, vi.y) - 3;
  crisp(ctx, world, 'vitals', crr(CRR.vit, vx, vy, Math.max(po.x + po.w, vi.x + vi.w) + 4 - vx, Math.max(po.y + po.h, vi.y + vi.h) + 4 - vy),
    vitalsKey(hero, p, st, L, vi.w), (c) => { drawPortrait(c, po, hero, p, L); drawVitals(c, vi, hero, p, st, T, L); });
  drawHeartsRow(ctx, L.hearts, world, run, p, L);
  drawSkills(ctx, L.skills, hero, p, T, L);
  drawUltGauge(ctx, L.ult, world, run, T, L);
  // 각성 게이지 + 준비 문구 칸 L.ready ('필살기 준비!' · '각성 가능!' 모두 FEEL-HUD). SP 막대 위에 빛을 겹치므로 필살 게이지 다음에
  drawAwGauge(ctx, world, L.awGauge.x, L.awGauge.y, L.awGauge.w, T); // [hook:feel]
  // 동료 위젯 (companions §7.1): 칸 L.companions 안쪽 사각형 L.companionsDraw 에 (탑승·기력 고리가 칸 밖 하트 줄을 덮지 않게).
  // 탭 판정용 사각형은 world.companions.hudRects 에 둔다
  const cr = drawCompanionHUD(ctx, world, cmpOpts(L, T)); // [hook:cmp]
  if (world.companions) { if (!cr) NO_RECTS.length = 0; try { world.companions.hudRects = cr || NO_RECTS; } catch { /* 읽기 전용이면 동료 쪽이 직접 관리 */ } } // [hook:cmp]
  const sc = L.score, pimg = assets.get(CHARACTERS[hero.charId]?.portrait), hi = world.game.meta?.highScores?.[0]?.score ?? 0;
  hashStart(); hashNum(world.state.gold); hashNum(run.score); hashNum(hi); hashNum(run.lives); hashNum(Math.floor(run.time ?? 0)); hashStr(hero.charId); hashStr(p.look?.primary); hashNum(pimg ? pimg.width : 0); hashNum(L.textMin);
  crisp(ctx, world, 'score', crr(CRR.score, sc.x - 4, sc.y - 12, sc.w + 8, sc.h + 16), hashNum(fontEpoch), (c) => drawScore(c, sc, world, hero, p, run, T, L));
  // 아래 띠의 빠른 칸 (hudfix: 버튼 배치 '아래 띠' — 띠의 스틱과 버튼 묶음 사이 빈 곳; 게임 캔버스 밖이라 덧캔버스로만 그린다)
  const qs = L.quick?.length ? consumables(world.state, world.time ?? 0) : null;
  if (qs && L.quickRow) {
    const qrow = L.quickRow, e = Math.ceil(qrow.h * 0.08) + 2;
    crisp(ctx, world, 'quick', crr(CRR.quick, qrow.x - e, qrow.y - e, qrow.w + 2 * e, qrow.h + 2 * e), quickKey(world, run, qs, L), (c) => drawQuick(c, L, world, run, T), ONLY);
  }
  if (g0) { // 탭 자리: 아래 띠 빠른 칸만 (넓은 배치의 다른 칸은 누르지 않는다)
    let n = 0;
    if (T && qs) { if (!g0.hudTapFn) g0.hudTapFn = hudTapAct; n = pushQuickTaps(n, L, run, qs); }
    if (T && autoInHud()) { const z = autoTapZone(ctx, L, world, g0); if (z) pushTap(n++, 'auto', z); }   // [autofix] 휴대폰: 이름 옆 AUTO 알약
    TAPS.length = n;
    if (n) { g0.hudTaps = TAPS; g0.hudTapsT = typeof performance !== 'undefined' ? performance.now() : Date.now(); } else if (g0.hudTaps?.length) g0.hudTaps.length = 0;
  }
  // 콤보·스타일 열 (L.combo). 랭크 글자 등장·이정표 박힘 첫 프레임은 칸 위·왼쪽으로 잠깐 넘치므로 그동안만 다른 영역(점수·동료 카드 줄
  // 등)을 빼고 자른다 (feel_hud.hudOverflow). 숫자 튀기기는 feel_hud 가 칸 안에 가두고(popFit), 쉬는 그림도 칸 안에 있으므로
  // 매 프레임 화면 크기 클립을 걸지 않는다 (R1-REQ-330)
  const cc = hudOverflow(world, 'combo') ? avoidClip(L, 'combo') : null; // [hook:feel]
  if (cc) { ctx.save(); ctx.clip(cc, 'evenodd'); }
  drawComboHUD(ctx, world, vw, vh, T); // [hook:feel]
  if (cc) ctx.restore();
  if (L.bossShown) drawBossBar(ctx, L.bossBar, world.boss, L);
  // 알림 칸 하나: 배너(스테이지 제목·STAGE CLEAR·LEVEL UP …)가 이긴다. 배너가 없을 때만 알림을 그린다
  // (알림 단어가 2.2배로 박히는 첫 프레임은 칸 위로 16 px 까지 넘친다 → 그동안만 토스트 줄·다른 영역은 빼고 자른다)
  if (world.banner) drawBanner(ctx, L.transient, world, world.banner, L);
  else if (world.style?.ann?.cur) { // [hook:feel]
    const ac = hudOverflow(world, 'transient') ? avoidClip(L, 'transient') : null;
    if (ac) { ctx.save(); ctx.clip(ac, 'evenodd'); }
    drawAnnouncer(ctx, world, vw, vh); // [hook:feel]
    if (ac) ctx.restore();
  }
  ctx.restore();
  drawLockPlate(ctx, world, L);   // [autofix] 고정 대상 이름판 · 버튼 밑 화살표
}

// ───────────────────────── 폴드·태블릿 배치 (hud_mobile §1·§3) ─────────────────────────
// 그리는 순서는 넓은 배치와 같은 계약(필살 → 각성 게이지 → 동료 → 점수 자리 → 콤보 → 보스 → 알림)에 미니맵·이름판·큰 HP·빠른 칸·원호를 더한다.
// 탭 자리(미니맵 → 큰 지도, 빠른 칸 0 → 보조무기, 1–3 → 물약 사용·길게 = 가방, 퀘스트 칸 → 접기·길게 = 퀘스트 창)는 game.hudTaps 에 둔다 (터치일 때만; touchpad 가 판정).
const TAPS = [];
/** [autofix] 이름 옆 AUTO 알약 자리 (넓은 배치 drawVitals; 논리 px) — 그리기와 탭 자리가 같은 값을 쓴다 */
function vitPillBox(ctx, r, hero, L) {
  const bx = r.x, bw = r.w, y = r.y, F = L.textMin, name = CHARACTERS[hero.charId]?.name ?? '';
  if (L.big) {
    const v = L.rows.vit, fs = Math.max(13, F);
    ctx.font = font(fs, 700); const nw = Math.min(bw * 0.7, ctx.measureText(name).width);
    return { x: bx + nw + 6, y: y + v.name - Math.round(fs * 0.86), h: Math.round(fs * 1.05), size: Math.max(11, F), compact: bw - nw - 6 < 40 };   // 글자 ≥ L.textMin (11 CSS px)
  }
  ctx.font = font(Math.max(13, F), 700);
  return { x: bx + ctx.measureText(name).width + 6, y: y + 1, h: Math.max(14, F + 3), size: Math.max(11, F), compact: false };
}
/** [autofix] 휴대폰 두 줄 배치: AUTO 동그라미 대신 이름 옆 알약을 누른다 (touchpad 가 act 'auto' 를 누름·뗌으로 보낸다 — 짧게 켬/끔, 길게 단계) */
function autoInHud() { try { return !!touchpad.autoInHud?.(); } catch { return false; } }
function autoBlockedOf(world) { return !!world?.game?.autoHud?.blocked; }
const AZ = { x: 0, y: 0, w: 0, h: 0 };
function autoTapZone(ctx, L, world, g) {
  const hero = world.hero, p = world.player;
  if (!hero || !p || !L.vitals) return null;
  ctx.save();
  const pb = vitPillBox(ctx, L.vitals, hero, L), lv = autoLevelOf(world), hold = !!autoHoldOf(world);
  const w = autoPillW(ctx, lv, pb.size, { hold, compact: pb.compact, showOff: true });
  ctx.restore();
  const cs = g.canvasRect?.h > 0 && g.viewH > 0 ? g.canvasRect.h / g.viewH : 1, m = 44 / cs;   // 44 CSS px 이상
  const W = Math.max(w + 8, m), H = Math.max(pb.h + 8, m), cx = pb.x + w / 2, cy = pb.y + pb.h / 2;
  AZ.x = Math.max(0, cx - W / 2); AZ.y = Math.max(0, cy - H / 2); AZ.w = W; AZ.h = H;
  return AZ;
}
function pushTap(i, act, r, long = null) {
  let z = TAPS[i];
  if (!z) z = TAPS[i] = { act: '', long: null, x: 0, y: 0, w: 0, h: 0 };
  z.act = act; z.long = long; z.x = r.x; z.y = r.y; z.w = r.w; z.h = r.h;
}
// [hudfix] 선명 칸 사각형 (논리 px; 매 프레임 새 객체를 만들지 않는다)
const CRR = { mm: { x: 0, y: 0, w: 0, h: 0 }, stage: { x: 0, y: 0, w: 0, h: 0 }, vit: { x: 0, y: 0, w: 0, h: 0 }, cur: { x: 0, y: 0, w: 0, h: 0 }, quest: { x: 0, y: 0, w: 0, h: 0 }, quick: { x: 0, y: 0, w: 0, h: 0 }, score: { x: 0, y: 0, w: 0, h: 0 } };
function crr(o, x, y, w, h) { o.x = x; o.y = y; o.w = w; o.h = h; return o; }
/** 체력 칸(초상화 + 이름·HP·MP·EXP) 키: 숫자·막대 길이(반 px)·이름·직업·그림 준비 */
function vitalsKey(hero, p, st, L, bw) {
  const img = assets.get(CHARACTERS[hero.charId]?.portrait);
  hashStart(); hashStr(hero.charId); hashNum(hero.level); hashStr(p.look?.primary); hashNum(img ? img.width : 0); hashNum(fontEpoch); hashNum(L.textMin);
  hashNum(Math.ceil(p.hp)); hashNum(st.hp); hashNum(Math.round((p.hp / st.hp) * bw * 2)); hashNum(Math.round(((p.hpGhost ?? 0) / st.hp) * bw * 2));
  hashNum(Math.floor(p.mp)); hashNum(st.mp); hashNum(Math.round((p.mp / st.mp) * bw * 2)); hashNum(Math.round((hero.exp / expToNext(hero.level)) * bw * 2));
  hashStr(autoLevelOf(p.world)); hashStr(autoHoldOf(p.world) ?? ''); hashNum(autoInHud() ? 1 : 0); hashNum(autoBlockedOf(p.world) ? 1 : 0);   // [auto] 이름 옆 AUTO (단계 · 기다림 · [autofix] 휴대폰 알약 단추 · 막힘)
  return hashStr(classNameOf(hero));
}
function drawFoldHUD(ctx, world, vw, vh, L, T) {
  const p = world.player, hero = world.hero, run = world.run, st = p.stats, g = world.game;
  ctx.save();
  // 상시 칸(미니맵 테·이름판·체력·재화·퀘스트·빠른 칸)은 터치일 때 기기 해상도 덧캔버스로 (hud_crisp — 버튼과 같은 선명도)
  const ring = hudArt('ring_map'), crOn = crispActive(ctx, world), mm = L.minimap;
  drawMinimap(ctx, mm, world, crOn ? false : ring);
  if (crOn && world.stage) {
    const e = Math.ceil(Math.min(mm.w, mm.h) * 0.06) + 2;
    hashStart();
    crisp(ctx, world, 'mmring', crr(CRR.mm, mm.x - e, mm.y - e, mm.w + 2 * e, mm.h + 2 * e), hashNum(ring ? 1 : 0), (c) => drawMinimapRing(c, mm, ring));
  }
  const sg = L.stage, stg = world.stage;
  hashStart(); hashStr(stg?.chapter); hashStr(stg?.name); hashNum(L.textMin); hashNum(fontEpoch);
  crisp(ctx, world, 'stage', crr(CRR.stage, sg.x - 2, sg.y - 2, sg.w + 4, sg.h + 4), hashNum(sg.w), (c) => drawStagePlate(c, sg, world, L));
  const po = L.portrait, vi = L.vitals;
  const vx = Math.min(po.x, vi.x - 4) - 3, vy = Math.min(po.y, vi.y - 2) - 3;
  crisp(ctx, world, 'vitals', crr(CRR.vit, vx, vy, Math.max(po.x + po.w, vi.x + vi.w + 2) + 3 - vx, Math.max(po.y + po.h, vi.y + vi.h + 2) + 3 - vy),
    vitalsKey(hero, p, st, L, vi.w), (c) => { drawPortrait(c, po, hero, p, L); drawVitalsFold(c, vi, hero, p, st, L); });
  drawHeartsRow(ctx, L.hearts, world, run, p, L);
  drawUltGauge(ctx, L.ult, world, run, T, L);
  drawAwGauge(ctx, world, L.awGauge.x, L.awGauge.y, L.awGauge.w, T); // [hook:feel]
  const cr = drawCompanionHUD(ctx, world, cmpOpts(L, T)); // [hook:cmp]
  if (world.companions) { if (!cr) NO_RECTS.length = 0; try { world.companions.hudRects = cr || NO_RECTS; } catch { /* 읽기 전용 */ } } // [hook:cmp]
  const sc = L.score, pimg = assets.get(CHARACTERS[hero.charId]?.portrait);
  hashStart(); hashNum(world.state.gold); hashNum(run.score); hashNum(run.lives); hashStr(hero.charId); hashStr(p.look?.primary); hashNum(pimg ? pimg.width : 0); hashNum(L.textMin);
  crisp(ctx, world, 'currency', crr(CRR.cur, sc.x - 2, sc.y - 2, sc.w + 4, sc.h + 4), hashNum(fontEpoch), (c) => drawCurrency(c, sc, world, hero, p, run, L));
  // 퀘스트 칸 (HUD-REDO): 보스 바·연출 중에는 숨김
  let qr = null;
  const qst = L.quest && L.questShown && !world.cutscene ? questTrackerState(L.quest, world, L.textMin) : null;
  if (qst) {
    const q = L.quest;
    hashStart(); hashStr(qst.key); hashNum(artIconReady('ui_quest') ? 1 : 0);
    crisp(ctx, world, 'quest', crr(CRR.quest, q.x - 2, q.y - 2, q.w + 4, qst.h + 4), hashNum(fontEpoch), (c) => drawQuestTracker(c, q, world, L.textMin, qst, c !== ctx));
    qr = { x: q.x, y: q.y, w: q.w, h: qst.h, head: qst.M.head };
  }
  const qs = consumables(world.state, world.time ?? 0), qrow = L.quickRow;
  if (qrow) {
    const e = Math.ceil(qrow.h * 0.08) + 2;
    crisp(ctx, world, 'quick', crr(CRR.quick, qrow.x - e, qrow.y - e, qrow.w + 2 * e, qrow.h + 2 * e), quickKey(world, run, qs, L), (c) => drawQuick(c, L, world, run, T));
  }
  if (L.arc) drawArcHUD(ctx, L.arc, world, p, run, L);
  const cc = hudOverflow(world, 'combo') ? avoidClip(L, 'combo') : null; // [hook:feel]
  if (cc) { ctx.save(); ctx.clip(cc, 'evenodd'); }
  drawComboHUD(ctx, world, vw, vh, T); // [hook:feel]
  if (cc) ctx.restore();
  if (L.bossShown) drawBossBar(ctx, L.bossBar, world.boss, L);
  if (world.banner) drawBanner(ctx, L.transient, world, world.banner, L);
  else if (world.style?.ann?.cur) { // [hook:feel]
    const ac = hudOverflow(world, 'transient') ? avoidClip(L, 'transient') : null;
    if (ac) { ctx.save(); ctx.clip(ac, 'evenodd'); }
    drawAnnouncer(ctx, world, vw, vh); // [hook:feel]
    if (ac) ctx.restore();
  }
  let bigR = null;
  if (g?.hudMapBig) bigR = drawBigMap(ctx, world, vw, vh, ring);
  ctx.restore();
  // 탭 자리 (터치): 큰 지도가 열려 있으면 화면 전체가 '닫기'
  if (g) {
    if (!T) { if (g.hudTaps?.length) g.hudTaps.length = 0; return; }
    if (!g.hudTapFn) g.hudTapFn = hudTapAct;
    let n = 0;
    if (bigR) pushTap(n++, 'hudmap', { x: 0, y: 0, w: vw, h: vh });
    else {
      pushTap(n++, 'hudmap', L.minimap);
      n = pushQuickTaps(n, L, run, qs);
      if (qr) { // 퀘스트 칸 (hudfix): 탭 = 접기/펼치기, 길게 누르기 = 메뉴 › 퀘스트. 누르는 칸은 ≥ 44 CSS px 높이 (보이지 않는 여유)
        const h44 = 44 / (Number(g.cssScale) || 1), zh = Math.max(qr.h, h44);
        QT_TOG.x = qr.x; QT_TOG.y = qr.y - (zh - qr.h) / 2; QT_TOG.w = qr.w; QT_TOG.h = zh;
        pushTap(n++, 'qt_toggle', QT_TOG, 'qt_open');
      }
    }
    TAPS.length = n;
    g.hudTaps = TAPS; g.hudTapsT = typeof performance !== 'undefined' ? performance.now() : Date.now();
  }
}
const QT_TOG = { x: 0, y: 0, w: 0, h: 0 };
/** 빠른 칸 탭 자리 (hudfix): 0 = 보조무기 (누르는 동안 'sub'), 1–3 = 탭하면 그 칸의 소모품 사용 · 길게 누르면 가방 (예전: 탭 = 가방 열기). 빈 칸은 탭 자리 없음 */
function pushQuickTaps(n, L, run, qs) {
  if (!L.quick?.length) return n;
  if (SUBWEAPONS[run.sub]) pushTap(n++, 'sub', L.quick[0]);
  for (let i = 1; i < L.quick.length; i++) if (qs[i - 1]) pushTap(n++, QS_ACT[i], L.quick[i], 'bag');
  return n;
}
const QS_ACT = ['', 'qs1', 'qs2', 'qs3'];
const ONLY = Object.freeze({ only: true });
/** 빠른 칸 키: 보조무기·하트·소모품(아이콘·개수·그림 준비)·테 그림 */
function quickKey(world, run, qs, L) {
  const sw = SUBWEAPONS[run.sub];
  hashStart(); hashNum(hudArt('frame_slot') ? 1 : 0); hashStr(run.sub); hashNum(run.hearts); hashNum(sw && run.hearts < (sw.cost ?? 1) ? 1 : 0);
  hashNum(sw ? (assets.get('icons/' + sw.icon) ? 1 : 0) : 2); hashNum(L.textMin); hashNum(fontEpoch); hashNum(L.quick?.length ?? 0);
  for (let i = 0; i < 3; i++) { const it = qs[i]; hashStr(it?.icon); hashNum(it ? it.qty ?? 1 : -1); hashNum(it && assets.get('icons/' + it.icon) ? 1 : 0); }
  return H_();
}
const H_ = () => hashNum(0);
/** HUD 탭 자리 중 입력 액션이 아닌 것 (touchpad 가 손을 뗄 때 game.hudTapFn(act) 로 부른다; 길게 누르면 그 칸의 long 을) */
function hudTapAct(act) {
  const g = this && this.top ? this : null;
  const gm = g ?? globalThis.__game;
  const top = gm?.top;
  if (act === 'qt_toggle') { toggleQuestTracker(); try { gm?.audio?.sfx?.('menu_move'); } catch { /* 소리 없음 */ } return; }
  if (act === 'qt_open' || act === 'bag') {
    if (gm?.registry?.menu && top && (top.canPause?.() ?? true) && top.world) gm.push('menu', { world: top.world, tab: act === 'bag' ? 'inventory' : 'quests' });
    return;
  }
  const qi = QS_ACT.indexOf(act);
  if (qi > 0) { // 빠른 칸 소모품 사용 (그 칸에 보이는 물건 — 0.5초마다 다시 센 목록)
    const w = top?.world;
    if (!w?.player || !w.state) return;
    const it = consumables(w.state, w.time ?? 0)[qi - 1];
    if (!it) return;
    let r = null;
    try { r = useItem(w.state, w.hero, it.uid, w.player); } catch (e) { console.error('[hud] quick use', e); }
    QK.t = -1; // 개수가 바뀌었으니 다음 프레임에 다시 센다
    if (r && !r.ok && r.msg) { try { gm.toast?.(r.msg, '#ffd0a0', 1.8); gm.audio?.sfx?.('menu_ng'); } catch { /* 토스트 없음 */ } }
  }
}

/** 스테이지 이름판 (왼쪽 위, 미니맵 오른쪽): 어두운 판 + 핏빛 아랫줄 + 'n장 · 이름' */
function drawStagePlate(ctx, r, world, L) {
  const st = world.stage;
  if (!st || r.w < 40) return;
  ctx.fillStyle = 'rgba(10,4,10,0.72)'; ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.fillStyle = '#8a1424'; ctx.fillRect(r.x, r.y + r.h - 2, r.w, 2);
  ctx.strokeStyle = 'rgba(214,170,110,0.55)'; ctx.lineWidth = 1; ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
  const F = Math.max(13, L.textMin);
  const ch = st.chapter ? `${st.chapter}장 · ` : '';
  text(ctx, ch + (st.name ?? ''), r.x + 8, r.y + Math.round(r.h / 2 + F * 0.36), { size: F, weight: 800, family: FONT.title, color: '#f3d38a', maxWidth: r.w - 14 });
}

/** 재화 줄 (가운데 위): 골드 · 점수(라벨) · 목숨 — HUD-REDO: 점수에 '점수' 라벨 (예전엔 숫자만이라 무엇인지 몰랐다) */
function drawCurrency(ctx, r, world, hero, p, run, L) {
  ctx.fillStyle = 'rgba(10,4,10,0.7)'; ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = 'rgba(214,170,110,0.6)'; ctx.lineWidth = 1; ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
  ctx.fillStyle = '#8a1424'; ctx.fillRect(r.x + 4, r.y + r.h - 2, r.w - 8, 2);
  const F = Math.max(13, L.textMin), cy = r.y + r.h / 2, by = Math.round(cy + F * 0.36), ls = Math.max(11, F - 2);
  const w1 = r.w * 0.32, w2 = r.w * 0.46, w3 = r.w - w1 - w2;
  // 골드: 금화
  const gx = r.x + 14;
  ctx.fillStyle = '#c8962a'; ctx.beginPath(); ctx.arc(gx, cy, 7, 0, TAU); ctx.fill();
  ctx.fillStyle = '#ffe28a'; ctx.beginPath(); ctx.arc(gx - 1, cy - 1, 4.5, 0, TAU); ctx.fill();
  text(ctx, fmt(world.state.gold), gx + 11, by, { size: F, weight: 800, family: FONT.num, color: '#ffd84a', maxWidth: w1 - 28 });
  // 점수 (라벨 + 숫자)
  const sx = r.x + w1;
  ctx.fillStyle = 'rgba(214,170,110,0.35)'; ctx.fillRect(sx, r.y + 5, 1, r.h - 10);
  text(ctx, '점수', sx + 8, by, { size: ls, weight: 700, color: '#c8b8a0' });
  ctx.font = font(ls, 700); const lw = ctx.measureText('점수').width;
  text(ctx, fmt(run.score), sx + w2 - 6, by, { size: F, align: 'right', weight: 800, family: FONT.num, color: '#fff', maxWidth: w2 - lw - 22 });
  // 목숨
  const lx = r.x + w1 + w2;
  ctx.fillStyle = 'rgba(214,170,110,0.35)'; ctx.fillRect(lx, r.y + 5, 1, r.h - 10);
  drawLifeIcon(ctx, lx + 14, cy, 7.5, hero, p);
  text(ctx, `×${run.lives}`, lx + 25, by, { size: F, weight: 800, family: FONT.num, color: '#ff8a9a', maxWidth: w3 - 30 });
}

/** 체력 칸 (HUD-REDO: 왼쪽 위 열, 초상화 오른쪽): Lv·이름 / 직업 · HP(숫자 안) · MP(+숫자) · EXP — 어두운 판 위 */
function drawVitalsFold(ctx, r, hero, p, st, L) {
  const V = vitalsFoldRows(L.textMin), F = V.fs, x = r.x, w = r.w, y = r.y;
  ctx.fillStyle = 'rgba(8,3,8,0.62)'; ctx.fillRect(x - 4, y - 2, w + 6, r.h + 4);
  ctx.strokeStyle = 'rgba(214,170,110,0.45)'; ctx.lineWidth = 1; ctx.strokeRect(x - 3.5, y - 1.5, w + 5, r.h + 3);
  const nm = `Lv ${hero.level} ${CHARACTERS[hero.charId]?.name ?? ''}`;
  ctx.font = font(F, 800); const nw = Math.min(w * 0.66, ctx.measureText(nm).width);
  text(ctx, nm, x + 2, y + V.name, { size: F, weight: 800, color: '#f3e2b8', maxWidth: w * 0.66 });
  // [auto] 이름 옆 알약 — [autofix] 자리가 모자라면 「A」 하나로 줄이고, 그래도 직업명이 56 px 안 되면 AUTO 동안 직업명을 뺀다 (긴 이름 + 긴 직업명이 뭉개지던 문제)
  const alv = autoLevelOf(p.world), ahold = autoHoldOf(p.world), psz = Math.max(11, F - 3), cls = classNameOf(hero);
  let pillC = false, showCls = true;
  if (alv !== 'off') {
    ctx.font = font(Math.max(11, F - 2)); const cw = ctx.measureText(cls).width, room = w - nw - 12;
    if (autoPillW(ctx, alv, psz, { hold: !!ahold }) + 6 + Math.min(cw, 90) > room) pillC = true;
    if (room - autoPillW(ctx, alv, psz, { hold: !!ahold, compact: pillC }) - 6 < Math.min(cw, 56)) showCls = false;
  }
  const aw = autoPill(ctx, x + 2 + nw + 6, y + V.name - Math.round(F * 0.86), Math.round(F * 1.1), alv, psz, { compact: pillC, hold: !!ahold });
  if (showCls) text(ctx, cls, x + w - 2, y + V.name, { size: Math.max(11, F - 2), align: 'right', color: COLORS.dim, maxWidth: Math.max(10, w - nw - 10 - (aw ? aw + 6 : 0)) });
  const hy = y + V.hpTop, hh = V.hpH;
  bar(ctx, x, hy, w, hh, p.hp / st.hp, { color: '#d81c34', ghost: p.hpGhost / st.hp, edge: '#e8c872' });
  text(ctx, `${fmt(Math.ceil(p.hp))} / ${fmt(st.hp)}`, x + w / 2, hy + Math.round(hh / 2 + F * 0.36), { size: F, align: 'center', weight: 800, family: FONT.num, color: '#fff', ow: 3, maxWidth: w - 8 });
  const my = y + V.mpTop;
  bar(ctx, x, my, w * 0.74, V.mpH, p.mp / st.mp, { color: '#3a7aff' });
  text(ctx, `${Math.floor(p.mp)}`, x + w * 0.74 + 5, my + V.mpH / 2 + Math.round(F * 0.36), { size: Math.max(11, F - 1), weight: 700, family: FONT.num, color: '#8ac8ff', ow: 2, maxWidth: w * 0.26 - 5 });
  bar(ctx, x, y + V.expTop, w, V.expH, hero.exp / expToNext(hero.level), { color: '#e8c872', shine: false });
}

// 빠른 칸 내용: 0 = 보조무기(하트 수), 1–3 = 가방의 소모품 (많은 것부터; 0.5초마다 다시 센다)
const QK = { t: -1, inv: null, n: -1, list: [] };
function consumables(state, t) {
  const inv = state?.inventory;
  if (QK.inv === inv && QK.n === (inv?.length ?? 0) && t - QK.t < 0.5) return QK.list;
  QK.inv = inv; QK.n = inv?.length ?? 0; QK.t = t;
  const out = [];
  for (const it of inv ?? []) if (ITEMS[it.baseId]?.slot === 'consumable') out.push(it);
  out.sort((a, b) => (b.qty ?? 1) - (a.qty ?? 1));
  QK.list = out.slice(0, 3);
  return QK.list;
}
function drawQuick(ctx, L, world, run, T) {
  const fr = hudArt('frame_slot'), F = Math.max(12, L.textMin);
  const list = consumables(world.state, world.time ?? 0);
  for (let i = 0; i < L.quick.length; i++) {
    const r = L.quick[i], cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    let count = null, dim = false, empty = false;
    const sw = i === 0 ? SUBWEAPONS[run.sub] : null, it = i > 0 ? list[i - 1] : null;
    empty = i === 0 ? !sw : !it;
    // 빈 칸 (hudfix): 어두운 판 없이 테만 옅게 — 누를 것이 없다는 것이 보이게 (탭 자리도 없다)
    if (empty) ctx.globalAlpha = 0.35;
    else { ctx.fillStyle = 'rgba(10,4,10,0.72)'; ctx.fillRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6); }
    if (sw) { dim = run.hearts < (sw.cost ?? 1); if (dim) ctx.globalAlpha = 0.45; drawIcon(ctx, sw.icon, cx, cy - 2, r.w * 0.62); ctx.globalAlpha = 1; count = run.hearts; }
    else if (it) { drawIcon(ctx, it.icon, cx, cy - 2, r.w * 0.6, null, { glow: false }); count = it.qty ?? 1; }
    if (fr) ctx.drawImage(fr, r.x - r.w * 0.06, r.y - r.h * 0.06, r.w * 1.12, r.h * 1.12);
    else { ctx.strokeStyle = COLORS.goldDark; ctx.lineWidth = 1.5; ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1); }
    ctx.globalAlpha = 1;
    if (count != null) text(ctx, String(count), r.x + r.w - 4, r.y + r.h - 4, { size: F, align: 'right', weight: 800, family: FONT.num, color: i === 0 ? '#ffb0b8' : '#fff', ow: 3, maxWidth: r.w - 6 });
    if (!T && i === 0 && useGlyph('sub', T)) drawGlyph(ctx, 'sub', r.x + 2, r.y + 2, 13); // [hook:plat]
  }
}

/** 데스크톱·패드 폴드: 스킬 원호를 HUD 에 그린다 (패드 원호와 같은 자리·그림, 누르지 않고 키·버튼 글리프를 붙인다) */
const ARC_ACT = { attack: 'attack', jump: 'jump', dash: 'dash', sub: 'sub', skill1: 'skill1', skill2: 'skill2', ult: 'ult', swap: 'swap', mount: 'mount', guard: 'guard' };
function drawArcHUD(ctx, r, world, p, run, L) {
  const s = r.w / (planExtent(PAD_LAYOUT_FOLD).extent + 12), hero = world.hero;   // padPlan 표 범위 + 12 (hud_layout L.arc 와 같은 비율)
  for (const id in PAD_LAYOUT_FOLD) {
    const [rt, bt, d0] = PAD_LAYOUT_FOLD[id];
    const d = d0 * s * 0.92, cx = r.x + r.w - rt * s, cy = r.y + r.h - bt * s, rad = d / 2;
    ctx.fillStyle = 'rgba(14,4,10,0.78)'; ctx.beginPath(); ctx.arc(cx, cy, rad * 0.88, 0, TAU); ctx.fill();
    let alpha = 1;
    if (id === 'skill1' || id === 'skill2') {
      const sid = hero.slots?.[(p.skillPage ?? 0) * 2 + (id === 'skill2' ? 1 : 0)];
      const sk = SKILLS[sid];
      if (sk) {
        const cd = p.skillCd?.[sid] ?? 0, noMp = p.mp < (sk.cost ?? 0);
        if (!drawArtIcon(ctx, sid, cx, cy, d * 0.83, noMp && cd <= 0 ? 0.4 : 1)) drawSkillGlyph(ctx, sk, cx, cy, d * 0.7);
        if (cd > 0) {
          const f = clamp(cd / (sk.cd || 1), 0, 1);
          ctx.fillStyle = 'rgba(0,0,0,0.62)'; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, rad * 0.84, -Math.PI / 2, -Math.PI / 2 + TAU * f); ctx.fill();
          text(ctx, cd < 1 ? cd.toFixed(1) : String(Math.ceil(cd)), cx, cy + 6, { size: Math.max(14, d * 0.3), align: 'center', weight: 800, family: FONT.num, color: '#fff', ow: 3 });
        }
      } else drawArtIcon(ctx, 'ui_lock', cx, cy, d * 0.75, 0.55);
    } else if (id === 'ult') {
      const full = run.sp >= 100;
      drawArtIcon(ctx, (world.awakenState?.ready ? 'awaken_' : 'ult_') + hero.charId, cx, cy, d * 0.8, full ? 1 : 0.55);
      ctx.strokeStyle = full ? '#ffe070' : '#ff8a2a'; ctx.lineWidth = 3;
      if (run.sp > 0) { ctx.beginPath(); ctx.arc(cx, cy, rad * 0.8, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(run.sp / 100, 0, 1)); ctx.stroke(); }
    } else if (id === 'attack') {
      const uid = hero.equip?.weapon, it = uid ? world.state.inventory?.find?.((i) => i.uid === uid) : null;
      if (it?.icon) drawIcon(ctx, it.icon, cx, cy, d * 0.55, null, { glow: false });
    } else if (id === 'sub') {
      const sw = SUBWEAPONS[run.sub];
      if (sw) drawIcon(ctx, sw.icon, cx, cy, d * 0.5);
    } else if (id === 'mount') { const m = world.companions?.hudInfo?.()?.mount; alpha = m && !m.blocked ? 1 : 0.4; drawArtIcon(ctx, 'ui_mount', cx, cy, d * 0.83, alpha); }
    else if (id === 'guard') drawArtIcon(ctx, 'ui_guard', cx, cy, d * 0.83, world.companions?.hudInfo?.()?.guards?.length ? 1 : 0.4);
    else if (id === 'jump') drawArtIcon(ctx, 'ui_jump', cx, cy, d * 0.83);
    else if (id === 'swap') { drawArtIcon(ctx, 'ui_swap', cx, cy - d * 0.08, d * 0.62); text(ctx, '넘김', cx, cy + d * 0.3, { size: Math.max(11, d * 0.22), align: 'center', weight: 800, color: '#f3e2b8', ow: 3 }); }
    else if (id === 'dash') text(ctx, '≫', cx, cy + d * 0.14, { size: d * 0.42, align: 'center', weight: 900, color: '#e8c872' });
    const ring = hudArt(id === 'attack' ? 'ring_attack' : id === 'ult' ? 'frame_ult' : 'ring_small');
    if (ring) { const z = d * 1.16; ctx.drawImage(ring, cx - z / 2, cy - z / 2, z, z); }
    const act = ARC_ACT[id];
    if (act && useGlyph(act, false)) drawGlyph(ctx, act, cx + rad * 0.35, cy + rad * 0.35, 14); // [hook:plat]
  }
  void L;
}

/**
 * 연출이 칸 밖으로 잠깐 넘치는 위젯(콤보 열·알림)의 클립: 넘칠 수 있는 범위(REACH)에 걸리는 다른 영역(상시 영역·게이지 줄·토스트 줄·
 * 보스 바·알림 칸)만 화면 전체에서 뺀 경로 (evenodd; 영역끼리는 겹치지 않는다 — tools/test_hud_layout.mjs). 걸리는 영역이 없으면 null
 * (클립 없음). self 칸은 빼지 않으므로 평소 그림은 그대로이고, 넘친 부분 중 다른 영역에 닿는 곳만 잘린다.
 * (배치 L, self)마다 한 번 만든다 — 매 프레임 할당 없음. 넘치는 연출 중(feel_hud.hudOverflow)에만 건다: 화면 크기 evenodd 경로
 * 클립은 래스터가 비싸서(휴대폰 DPR 3 에서 프레임당 ~1 ms) 쉬는 프레임마다 걸지 않는다 (R1-REQ-330)
 *  combo: feel_hud 는 랭크 글자 등장·이정표 박힘을 칸 위·왼쪽으로 넘치게 둔다 (재 보니 ≤ 12 px) → 위·왼쪽 32 px, 오른쪽 6 px
 *  transient: 알림 단어 2.2배 박힘 — feel_hud 클립 (가로 ± 6, 위 16, 아래 6 px)
 */
const AVOID = ['portrait', 'vitals', 'hearts', 'skills', 'ult', 'awGauge', 'ready', 'companions', 'callouts', 'score', 'combo', 'transient'];
const REACH = { combo: { l: 32, t: 32, r: 6, b: 0 }, transient: { l: 6, t: 16, r: 6, b: 6 } };
let acL = null;
const acPath = new Map();
function avoidClip(L, self) {
  if (L !== acL) { acL = L; acPath.clear(); }
  let p = acPath.get(self);
  if (p !== undefined) return p;
  p = null;
  const me = L[self], e = REACH[self];
  if (me && e && typeof Path2D === 'function') {
    const bx = me.x - e.l, by = me.y - e.t, bw = me.w + e.l + e.r, bh = me.h + e.t + e.b;
    const near = [];
    const add = (r) => { if (r && r.w > 0 && r.h > 0 && r.x < bx + bw && bx < r.x + r.w && r.y < by + bh && by < r.y + r.h) near.push(r); };
    for (const k of AVOID) if (k !== self) add(L[k]);
    for (let i = 0; i < (L.meterRows ?? 3); i++) add(L.meter(i));
    if (L.toastRows > 0) add(L.toastArea);
    if (L.bossShown) add(L.bossBar);
    if (near.length) {
      try {
        p = new Path2D();
        p.rect(0, 0, L.vw, L.vh);
        // 빼는 칸은 바깥쪽 정수 px 로 1 px 넓힌다 (칸 경계가 소수 px 이면 안티에일리어싱으로 넘친 글자가 몇 px 스며든다 — hudfix)
        for (const r of near) { const x0 = Math.floor(r.x) - 1, y0 = Math.floor(r.y) - 1; p.rect(x0, y0, Math.ceil(r.x + r.w) + 1 - x0, Math.ceil(r.y + r.h) + 1 - y0); }
      } catch { p = null; }
    }
  }
  acPath.set(self, p);
  return p;
}

/** companion_hud 에 넘기는 칸 (배치 L 이 바뀔 때만 새로 만든다 — 매 프레임 할당 없음) */
let cmpL = null, cmpT = false, cmpO = null;
function cmpOpts(L, T) {
  if (L !== cmpL || T !== cmpT || !cmpO) {
    const r = L.companionsDraw ?? L.companions;
    cmpO = { x: r.x, y: r.y, touch: T, rect: r, lane: L.callouts, layout: L };
    cmpL = L; cmpT = T;
  }
  return cmpO;
}

/**
 * 시험·도구용 (tools/test_hud_layout.mjs): drawHUD 의 한 부분만 같은 인자로 그린다 → 부분마다 실제로 칠한 픽셀이 제 칸 안에 있는지 잰다.
 * part: HUD_PARTS 중 하나. 'companions' 는 위젯과 스킬 카드 줄을 함께 그린다 (시험이 카드·위젯 중 하나만 켜서 잰다).
 */
export const HUD_PARTS = ['portrait', 'vitals', 'hearts', 'skills', 'ult', 'awGauge', 'companions', 'score', 'combo', 'boss', 'transient', 'minimap', 'stage', 'quick', 'arc', 'quest'];
export function drawHUDPart(ctx, world, vw, vh, part) {
  const p = world?.player;
  if (!p || world.hudHidden) return null;
  const hero = world.hero, run = world.run, st = p.stats, T = hudTouch();
  const L = hudLayout(world, vw, vh);
  ctx.save();
  let r = null;
  switch (part) {
    case 'portrait': drawPortrait(ctx, L.portrait, hero, p, L); break;
    case 'vitals': if (L.fold) drawVitalsFold(ctx, L.vitals, hero, p, st, L); else drawVitals(ctx, L.vitals, hero, p, st, T, L); break;
    case 'minimap': if (L.fold) drawMinimap(ctx, L.minimap, world, hudArt('ring_map')); break;
    case 'stage': if (L.fold) drawStagePlate(ctx, L.stage, world, L); break;
    case 'quick': if (L.fold) drawQuick(ctx, L, world, run, T); break;
    case 'arc': if (L.fold && L.arc) drawArcHUD(ctx, L.arc, world, p, run, L); break;
    case 'quest': if (L.fold && L.quest && L.questShown) r = drawQuestTracker(ctx, L.quest, world, L.textMin); break;
    case 'hearts': drawHeartsRow(ctx, L.hearts, world, run, p, L); break;
    case 'skills': if (!L.fold) drawSkills(ctx, L.skills, hero, p, T, L); break;
    case 'ult': drawUltGauge(ctx, L.ult, world, run, T, L); break;
    case 'awGauge': r = drawAwGauge(ctx, world, L.awGauge.x, L.awGauge.y, L.awGauge.w, T); break;
    case 'companions': r = drawCompanionHUD(ctx, world, cmpOpts(L, T)); break;
    case 'score': if (L.fold) drawCurrency(ctx, L.score, world, hero, p, run, L); else drawScore(ctx, L.score, world, hero, p, run, T, L); break;
    case 'combo': { const cc = hudOverflow(world, 'combo') ? avoidClip(L, 'combo') : null; if (cc) ctx.clip(cc, 'evenodd'); r = drawComboHUD(ctx, world, vw, vh, T); break; }
    case 'boss': if (L.bossShown) drawBossBar(ctx, L.bossBar, world.boss, L); break;
    case 'transient': {
      if (world.banner) { drawBanner(ctx, L.transient, world, world.banner, L); r = 'banner'; break; }
      const ac = hudOverflow(world, 'transient') ? avoidClip(L, 'transient') : null; if (ac) ctx.clip(ac, 'evenodd');
      r = drawAnnouncer(ctx, world, vw, vh); break;
    }
    default: break;
  }
  ctx.restore();
  return r;
}

// ── HUD 스프라이트 캐시 (R1-REQ-330) ──
// 초상화(800×1134 원본)를 매 프레임 원 클립 안에 줄여 그리면 save·clip·restore 와 큰 그림 축소가 프레임마다 든다 → 영웅·레벨·배율·
// 그림 준비 상태가 바뀔 때만 작은 캔버스에 구워 한 번에 붙인다. 목숨 아이콘·스킬 문장도 같은 방식.
// 캔버스는 이 모듈을 불러올 때 만든다 (스테이지 도중 새 캔버스 0, MASTER_PLAN §5.2). 굽는 배율 = 지금 HUD 변환의 기기 배율 (0.25 단위 올림).
const mkCanvas = () => { try { if (typeof document === 'undefined' || !document.createElement) return null; const c = document.createElement('canvas'); c.width = c.height = 1; return c; } catch { return null; } };
const PORT = { c: mkCanvas(), id: null, iw: 0, col: null, lv: -1, a: 0, ep: -1, f: -1 };   // 초상화 + 금테 + 레벨 배지 (칸 66×66 + 둘레 1 px)
const LIFE = { c: mkCanvas(), id: null, iw: 0, col: null, r: 0, a: 0 };           // 점수 칸의 목숨 아이콘
const SKG = { c: mkCanvas(), keys: ['', ''], a: 0 };  // 스킬 슬롯 2칸의 문장 (38×38 칸 두 개를 가로로)
export const HUD_SPRITE_STATS = { portraitBakes: 0, lifeBakes: 0, skillBakes: 0 };
/** 지금 ctx 변환에서 HUD 1 단위가 기기 픽셀 몇 개인가 (0.25 단위로 올림, 1 ~ 4) */
function hudScale(ctx) {
  let a = 1;
  try { const m = ctx.getTransform(); a = Math.hypot(m.a, m.b) || 1; } catch { /* 변환을 못 읽으면 1 */ }
  return Math.min(4, Math.max(1, Math.ceil(a * 4 - 0.01) / 4));
}
/** 캐시 캔버스를 (w×h 논리 px, 배율 a) 로 맞추고 지운 2D 문맥 (변환 = 배율 a) */
function prepSprite(c, w, h, a) {
  const W = Math.ceil(w * a), H = Math.ceil(h * a);
  if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
  const g = c.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H);
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';   // 큰 초상화를 한 번 줄일 때만 — 품질 우선
  g.setTransform(a, 0, 0, a, 0, 0);
  return g;
}

// ── 왼쪽 위: 초상화 + 레벨 배지 (66×66) ──
function drawPortrait(ctx, r, hero, p, L) {
  const img = assets.get(CHARACTERS[hero.charId]?.portrait);
  const c = PORT.c, F = L?.textMin ?? 0;
  if (!c) { paintPortrait(ctx, r.x, r.y, img, hero, p, F); return; }
  const a = hudScale(ctx), K = PORT, iw = img ? img.width * 65536 + img.height : 0, col = p.look?.primary ?? null;
  if (K.id !== hero.charId || K.iw !== iw || K.col !== col || K.lv !== hero.level || K.a !== a || K.ep !== fontEpoch || K.f !== F) {
    const g = prepSprite(c, 68, 68, a);
    paintPortrait(g, 1, 1, img, hero, p, F);
    K.id = hero.charId; K.iw = iw; K.col = col; K.lv = hero.level; K.a = a; K.ep = fontEpoch; K.f = F;
    HUD_SPRITE_STATS.portraitBakes++;
  }
  const z = (r.w || 66) / 66;   // 칸 크기에 맞춰 (폴드 왼쪽 위 열 48 px — HUD-REDO)
  ctx.drawImage(c, 0, 0, c.width, c.height, r.x - z, r.y - z, (c.width / a) * z, (c.height / a) * z);
}
/** 초상화 한 장을 (x, y) 칸(66×66)에 칠한다 (캐시에 굽거나, 캐시 캔버스가 없으면 화면에 바로). F = 터치 글자 하한 (배지 글자·원을 키운다) */
function paintPortrait(ctx, x, y, img, hero, p, F = 0) {
  const cx = x + 33, cy = y + 33;
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, 30, 0, TAU); ctx.closePath();
  ctx.fillStyle = '#12060c'; ctx.fill();
  ctx.clip();
  // 얼굴 중심 정사각 자르기 (애니메 흉상·예전 그림 모두 data/portrait_meta 의 얼굴 상자)
  const fr = img ? faceRect(img, CHARACTERS[hero.charId]?.portrait, 1.5) : null;
  if (fr) ctx.drawImage(img, fr.sx, fr.sy, fr.sw, fr.sh, cx - 30, cy - 30, 60, 60);
  else { ctx.fillStyle = p.look?.primary ?? '#444'; ctx.fillRect(x + 1, y + 1, 64, 64); }
  ctx.restore();
  ctx.strokeStyle = COLORS.gold; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(cx, cy, 31, 0, TAU); ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, 32.5, 0, TAU); ctx.stroke();
  // 레벨 배지 (영역 안쪽 오른쪽 아래). 글자 하한이 12 를 넘으면(휴대폰) 배지를 반지름 14 로 키워 칸 안(66)에 맞춘다
  const fs = Math.max(12, F), br = fs > 12 ? 14 : 12, bc = fs > 12 ? 52 : 53;
  ctx.fillStyle = '#5a0a18'; ctx.beginPath(); ctx.arc(x + bc, y + bc, br, 0, TAU); ctx.fill();
  ctx.strokeStyle = COLORS.gold; ctx.lineWidth = 1.5; ctx.stroke();
  text(ctx, hero.level, x + bc, y + bc + Math.round(fs * 0.42), { size: fs, align: 'center', weight: 800, family: FONT.num, color: '#fff', maxWidth: br * 2 - 3 });
}

// ── 이름 / HP / MP / EXP (230×50; 휴대폰 배치 260×(F 기준, phone2 53)) ──
function drawVitals(ctx, r, hero, p, st, T, L) {
  const bx = r.x, bw = r.w, y = r.y, F = L.textMin;
  if (L.big) {
    // 휴대폰: 직업명은 뺀다 (메뉴에 있다). HP 숫자는 F+1 px 막대 안에 F px, MP 숫자는 MP 막대 오른쪽에 F px
    const v = L.rows.vit;
    text(ctx, CHARACTERS[hero.charId].name, bx, y + v.name, { size: Math.max(13, F), weight: 700, color: '#f3e2b8', maxWidth: bw });
    { const pb = vitPillBox(ctx, r, hero, L); autoPill(ctx, pb.x, pb.y, pb.h, autoLevelOf(p.world), pb.size, { hold: !!autoHoldOf(p.world), compact: pb.compact, showOff: autoInHud(), blocked: autoBlockedOf(p.world) }); }   // [auto] · [autofix] 휴대폰은 이 알약이 AUTO 단추
    bar(ctx, bx, y + v.hpTop, bw, v.hpH, p.hp / st.hp, { color: '#d81c34', ghost: p.hpGhost / st.hp });
    text(ctx, `${Math.ceil(p.hp)} / ${st.hp}`, bx + bw - 4, y + v.hpTop + Math.round((v.hpH + F * 0.7) / 2), { size: F, align: 'right', weight: 700, color: '#fff', ow: 3, maxWidth: bw - 8 });
    bar(ctx, bx, y + v.mpTop, bw * 0.8, v.mpH, p.mp / st.mp, { color: '#3a7aff' });
    text(ctx, `${Math.floor(p.mp)}`, bx + bw * 0.8 + 6, y + v.mpTop + Math.round(v.mpH / 2 + F * 0.36), { size: F, weight: 700, color: '#8ac8ff', ow: 3, maxWidth: bw * 0.2 - 6 });
    bar(ctx, bx, y + v.expTop, bw * 0.8, v.expH, hero.exp / expToNext(hero.level), { color: '#e8c872', shine: false });
    return;
  }
  const s = Math.max(T ? 12 : 10, F);
  text(ctx, CHARACTERS[hero.charId].name, bx, y + 12, { size: Math.max(13, F), weight: 700, color: '#f3e2b8' });
  const pb = vitPillBox(ctx, r, hero, L);
  const aw = autoPill(ctx, pb.x, pb.y, pb.h, autoLevelOf(p.world), pb.size, { hold: !!autoHoldOf(p.world), showOff: autoInHud(), blocked: autoBlockedOf(p.world) });   // [auto] · [autofix]
  text(ctx, classNameOf(hero), bx + bw, y + 12, { size: Math.max(T ? 12 : 11, F), align: 'right', color: COLORS.dim, ...(aw ? { maxWidth: Math.max(10, bw * 0.45) } : {}) });
  bar(ctx, bx, y + 18, bw, 13, p.hp / st.hp, { color: '#d81c34', ghost: p.hpGhost / st.hp });
  text(ctx, `${Math.ceil(p.hp)} / ${st.hp}`, bx + bw - 4, y + 29, { size: s, align: 'right', weight: 700, color: '#fff', ow: 2 });
  bar(ctx, bx, y + 34, bw * 0.8, 8, p.mp / st.mp, { color: '#3a7aff' });
  text(ctx, `${Math.floor(p.mp)}`, bx + bw * 0.8 + 6, y + 42, { size: s, weight: 700, color: '#8ac8ff', ow: 2 });
  bar(ctx, bx, y + 46, bw * 0.8, 3, hero.exp / expToNext(hero.level), { color: '#e8c872', shine: false });
}

// ── 하트 + 보조무기 + 버프 (260×26, 휴대폰 배치 290×(버프 칸 + 4); 버프 아이콘은 칸 오른쪽 끝에서 자른다) ──
function drawHeartsRow(ctx, r, world, run, p, L) {
  const sx = r.x, sy = r.y + 2, F = L.textMin, bs = L.rows?.buff ?? 22, gs = Math.max(12, F);
  drawHudHeart(ctx, sx + 8, sy + 10, world.time);
  text(ctx, `× ${run.hearts}`, sx + 20, sy + 15, { size: Math.max(14, F), weight: 800, family: FONT.num, color: '#ffb0b8', maxWidth: 48 });
  // 보조무기 프레임 (클래식)
  const fx = sx + 70, fy = r.y;
  ctx.fillStyle = 'rgba(10,4,12,0.8)'; ctx.fillRect(fx, fy, 44, 26);
  ctx.strokeStyle = COLORS.goldDark; ctx.lineWidth = 1.5; ctx.strokeRect(fx + 0.5, fy + 0.5, 43, 25);
  const sw = SUBWEAPONS[run.sub];
  if (sw) drawIcon(ctx, sw.icon, fx + 22, fy + 13, 24);
  const multi = p.buffs.triple ? 'III' : p.buffs.double ? 'II' : '';
  if (multi) text(ctx, multi, fx + 48, fy + Math.round(13 + gs * 0.4), { size: gs, weight: 900, family: FONT.num, color: '#8ac8ff', maxWidth: L.big ? 18 : undefined });
  // 버프 아이콘 (휴대폰 배치: 칸 bs = F + 6, 'III' 가 커진 만큼 8 px 오른쪽에서 시작)
  let bi = 0;
  const xMax = r.x + r.w, x0 = sx + (L.big ? 138 : 130), gy = Math.round(bs / 2 + gs * 0.4);
  for (const k in p.buffs) {
    const pu = POWERUPS[k];
    if (!pu) continue;
    const x = x0 + bi * (bs + 4), y = sy + 1;
    if (x + bs > xMax) break;
    ctx.fillStyle = rgba(pu.color, 0.25); ctx.fillRect(x, y, bs, bs);
    ctx.strokeStyle = pu.color; ctx.lineWidth = 1.5; ctx.strokeRect(x + 0.5, y + 0.5, bs - 1, bs - 1);
    text(ctx, BUFF_GLYPH[k] ?? pu.name[0], x + bs / 2, y + gy, { size: gs, align: 'center', weight: 800, color: '#fff' });
    const left = p.buffs[k];
    if (left < 9000) { const f = clamp(left / (pu.time || 1), 0, 1); ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(x, y + bs * f, bs, bs * (1 - f)); }
    bi++;
  }
}

/** HUD 하트: 그림자 흐림(shadowBlur)이 비싸므로 한 번 구운 그림을 맥박에 맞춰 늘였다 줄인다 */
let heartSpr = null;
function drawHudHeart(ctx, x, y, t) {
  if (heartSpr === null) {
    heartSpr = false;
    try {
      const c = document.createElement('canvas');
      c.width = c.height = 64; // 2배 해상도, 논리 32×32
      const g = c.getContext('2d');
      g.translate(32, 32); g.scale(2, 2);
      drawHeart(g, 7, 0);
      heartSpr = c;
    } catch { heartSpr = false; }
  }
  if (heartSpr) {
    const s = 16 * (1 + Math.sin(t * 8) * 0.06);
    ctx.drawImage(heartSpr, x - s, y - s, s * 2, s * 2);
  } else { ctx.save(); ctx.translate(x, y); drawHeart(ctx, 7, t); ctx.restore(); }
}

/**
 * 이 기기에서 글리프를 쓸 수 있나: 터치 모드는 prompts 가 터치 아이콘을 줄 때만 (없으면 기존 한글·기호 표시).
 * bindingOf 는 부를 때마다 배열을 만들므로 (안내 기기, 바인딩 객체)가 같은 동안 답을 기억한다 (매 프레임 3번 부른다)
 */
const GLYPH_OK = new Map();
let glyphB = null, glyphM = '';
function useGlyph(action, T) {
  if (!T) return true;
  let b = null, m = '';
  try { b = input.bindings; m = promptMode(); } catch { /* 기본값 */ }
  if (b !== glyphB || m !== glyphM) { GLYPH_OK.clear(); glyphB = b; glyphM = m; }
  let ok = GLYPH_OK.get(action);
  if (ok === undefined) {
    try { ok = !!bindingOf(action)?.some?.((x) => x?.type === 'touch'); } catch { ok = false; }
    GLYPH_OK.set(action, ok);
  }
  return ok;
}

// ── 스킬 슬롯 2칸 + 페이지 안내 (88×62; 터치 88×40 — 슬롯 S1/S2 표시와 페이지 안내는 패드 버튼(S1·S2·⇄ n/2)에 있으므로 뺀다) ──
function drawSkills(ctx, r, hero, p, T, L) {
  const kx = r.x, ky = r.y, cs = Math.max(11, L.textMin);
  for (let i = 0; i < 2; i++) {
    const sid = hero.slots?.[p.skillPage * 2 + i];
    const x = kx + i * 44, y = ky;
    ctx.fillStyle = 'rgba(10,4,12,0.8)'; ctx.fillRect(x, y, 38, 38);
    ctx.strokeStyle = COLORS.goldDark; ctx.lineWidth = 1.5; ctx.strokeRect(x + 0.5, y + 0.5, 37, 37);
    const sk = SKILLS[sid];
    if (sk) {
      drawSlotGlyph(ctx, i, sid, sk, x, y);
      const cd = p.skillCd[sid] ?? 0;
      if (cd > 0) {
        const f = clamp(cd / (sk.cd || 1), 0, 1);
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.beginPath(); ctx.moveTo(x + 19, y + 19); ctx.arc(x + 19, y + 19, 26, -Math.PI / 2, -Math.PI / 2 + TAU * f); ctx.fill();
        text(ctx, cd.toFixed(1), x + 19, y + 19 + Math.round(cs * 0.42), { size: cs, align: 'center', weight: 800, color: '#fff', maxWidth: 36 });
      } else if (p.mp < (sk.cost ?? 0)) { ctx.fillStyle = 'rgba(20,40,120,0.5)'; ctx.fillRect(x, y, 38, 38); }
    }
    if (T) continue;   // 터치: 패드의 S1·S2 버튼이 같은 문장과 이름을 보여 준다 (13 px 글리프 안 글자는 6 CSS px — 하한 미만)
    const act = i ? 'skill2' : 'skill1';
    if (useGlyph(act, T)) drawGlyph(ctx, act, x + 1, y + 24, 13); // [hook:plat]
    else text(ctx, i ? 'S2' : 'S1', x + 3, y + 36, { size: 12, weight: 800, color: '#e8c872' });
  }
  if (T) return;   // 터치: 스킬 페이지는 패드의 ⇄ 버튼이 'n/2' 로 보여 준다
  // 스킬 페이지: [swap] 페이지 n/2 — 슬롯 바로 아래
  const hy = ky + 51, size = 10;
  const label = `페이지 ${p.skillPage + 1}/2`;
  if (useGlyph('swap', T)) {
    const gw = drawGlyph(ctx, 'swap', kx, hy - 12, 14); // [hook:plat]
    text(ctx, label, kx + (gw || 14) + 4, hy, { size, weight: 700, color: COLORS.dim });
  } else text(ctx, `⇄ ${label}`, kx, hy, { size, weight: 700, color: COLORS.dim });
}

// ── 필살(SP) 게이지 (120×28) ──
// 그라데이션: 평소 1개 + 가득 찼을 때 색이 도는 36단계(10°)를 위치별로 한 번씩만 만든다 (매 프레임 새 그라데이션 없음)
let spGrad = null, spFull = null, spX = NaN, spW = NaN;
function spGradient(ctx, ux, uw, step) {
  if (ux !== spX || uw !== spW) { spX = ux; spW = uw; spGrad = null; spFull = null; }
  if (step < 0) {
    if (!spGrad) { spGrad = ctx.createLinearGradient(ux, 0, ux + uw, 0); spGrad.addColorStop(0, '#ff8a2a'); spGrad.addColorStop(1, '#ffe070'); }
    return spGrad;
  }
  spFull ??= new Array(36).fill(null);
  let g = spFull[step];
  if (!g) { g = spFull[step] = ctx.createLinearGradient(ux, 0, ux + uw, 0); g.addColorStop(0, '#ff8a2a'); g.addColorStop(1, `hsl(${step * 10},90%,60%)`); }
  return g;
}
function drawUltGauge(ctx, r, world, run, T, L) {
  // 막대 = L.spBar (feel_hud 의 각성 게이지가 그 14 px 아래, SP 막대 위에 빛을 겹친다). 라벨은 막대 위 (휴대폰 배치는 F px)
  const sb = L.spBar, ux = sb.x, uy = sb.y, uw = sb.w;
  const full = run.sp >= 100;
  const ly = L.big ? r.y + L.rows.ult.label : uy - 6, ls = Math.max(T ? 12 : 10, L.textMin);
  text(ctx, '필살', ux, ly, { size: ls, weight: 700, color: COLORS.dim });
  text(ctx, `${Math.floor(run.sp)}%`, ux + uw, ly, { size: ls, align: 'right', weight: 700, family: FONT.num, color: full ? '#ffe070' : COLORS.dim });
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(ux, uy, uw, 10);
  const g = spGradient(ctx, ux, uw, full ? Math.floor(Math.abs(world.time * 30)) % 36 || 0 : -1); // 가득 차면 색이 돈다 (300°/s)
  ctx.fillStyle = g; ctx.fillRect(ux, uy, uw * clamp(run.sp / 100, 0, 1), 10);
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  for (let i = 1; i < 4; i++) ctx.fillRect(ux + uw * i / 4, uy, 1.5, 10);
  ctx.strokeStyle = full ? '#fff' : COLORS.goldDark; ctx.lineWidth = 1.5; ctx.strokeRect(ux - 0.5, uy - 0.5, uw + 1, 11);
}

// ── 오른쪽 위: 점수/목숨/골드/시간 (150×62, 터치 150×70, 휴대폰 배치 170×70 — 이름표 '점수' + 숫자) ──
function drawScore(ctx, r, world, hero, p, run, T, L) {
  const F = L.textMin;
  const rx = r.x + r.w, lx = r.x, y0 = r.y - 10, s1 = Math.max(T ? 13 : 11, F), s2 = Math.max(T ? 14 : 12, F), ly = T ? 3 : 0;
  // 이름표 '점수' (hudfix: 폴드 재화 줄과 같은 말 — 예전엔 넓은 배치 'SCORE', 휴대폰은 이름표 없이 숫자만)
  text(ctx, '점수', lx, y0 + 26, { size: s1, weight: 700, color: COLORS.dim });
  ctx.font = font(s1, 700); const labelW = ctx.measureText('점수').width;
  text(ctx, fmt(run.score), rx, y0 + 28, { size: Math.max(20, F), align: 'right', weight: 800, family: FONT.num, color: '#fff', maxWidth: r.w - labelW - 6 });
  const hi = Math.max(world.game.meta?.highScores?.[0]?.score ?? 0, run.score);
  // 목숨: 하트(보조무기 탄약)와 헷갈리지 않도록 영웅 얼굴 아이콘 × 남은 목숨
  drawLifeIcon(ctx, lx + 8, y0 + 41 + ly, T ? 8.5 : 7.5, hero, p);
  const lives = `×${run.lives}`;
  text(ctx, lives, lx + 19, y0 + 46 + ly, { size: s2, weight: 800, family: FONT.num, color: '#ff8a9a' });
  const livesW = ctx.measureText(lives).width;
  text(ctx, `HI ${fmt(hi)}`, rx, y0 + 46 + ly, { size: s1, align: 'right', weight: 700, family: FONT.num, color: '#e8c872', maxWidth: r.w - 19 - livesW - 8 });
  const time = fmtTime(run.time);
  text(ctx, time, lx, y0 + 64 + ly * 2, { size: s2, weight: 700, family: FONT.num, color: '#c8c0b0' });
  const tw = ctx.measureText(time).width;
  text(ctx, `${fmt(world.state.gold)} G`, rx, y0 + 64 + ly * 2, { size: s2, align: 'right', weight: 700, color: '#ffd84a', maxWidth: r.w - tw - 8 });
}

// ── 보스 체력바 (아래 칸 48 px / 위쪽 칸 36 px): 이름 왼쪽, 칭호 오른쪽 (칸이 360 px 보다 좁으면 칭호 숨김;
//    터치는 칭호가 하한 크기로 제 몫(38 %)에 다 들어갈 때만 — 가로로 눌러 줄이지 않는다) ──
const BT = { title: '', size: 0, ep: -1, w: 0 };   // 칭호 너비 기억 (매 프레임 재지 않게; 글꼴이 늦게 오면 다시 잰다)
function drawBossBar(ctx, r, b, L) {
  if (!b || r.w < 60) return;
  const F = L?.textMin ?? 0, ts = Math.max(11, F);
  const x = r.x, w = r.w;
  let title = w >= 360 ? b.def.title : null;
  if (title && F > 0) {
    if (BT.title !== title || BT.size !== ts || BT.ep !== fontEpoch) { ctx.font = font(ts, 500); BT.title = title; BT.size = ts; BT.ep = fontEpoch; BT.w = ctx.measureText(title).width; }
    if (BT.w > w * 0.38) title = null;
  }
  const ny = r.y + 15, by = r.y + r.h - 16;
  text(ctx, b.def.name, x, ny, { size: Math.max(16, F), weight: 800, family: FONT.title, color: '#ffd0d0', maxWidth: title ? w * 0.6 : w });
  if (title) text(ctx, title, x + w, ny, { size: ts, align: 'right', color: COLORS.dim, maxWidth: w * 0.38 });
  bar(ctx, x, by, w, 14, b.hp / b.stats.maxHp, { color: '#b0102a', ghost: b.hpGhost / b.stats.maxHp, edge: '#e8c872' });
  ctx.fillStyle = '#e8c872';
  for (const ph of b.def.phases || []) ctx.fillRect(x + w * ph - 1, by - 2, 2, 18);
}

// ── 배너 (알림 칸 안): 스테이지 제목은 피 글씨, STAGE CLEAR 는 금박 글씨, 나머지는 기존 글씨. 칸보다 길면 75 % 까지 줄이고 말줄임 (fitText) ──
let bandG = null, bandKey = '';
function bandGradient(ctx, r) {
  const key = `${r.x}|${r.w}`;
  if (!bandG || bandKey !== key) {
    bandG = ctx.createLinearGradient(r.x, 0, r.x + r.w, 0);
    bandG.addColorStop(0, 'rgba(0,0,0,0)'); bandG.addColorStop(0.2, 'rgba(0,0,0,0.62)');
    bandG.addColorStop(0.8, 'rgba(0,0,0,0.62)'); bandG.addColorStop(1, 'rgba(0,0,0,0)');
    bandKey = key;
  }
  return bandG;
}
/**
 * 칸 너비(maxW)에 맞춰 글자 크기를 줄여 그린다: 원래 크기의 75 % 까지 (터치는 글자 하한 F 아래로는 줄이지 않는다),
 * 그래도 넘치면 뒤를 말줄임(…)으로 자른다. 말줄임 결과는 (글자, 크기, 너비)마다 한 번만 계산한다 (배너는 몇 초 동안 매 프레임 그린다)
 */
// 줄마다 따로 기억한다 (배너 글자와 부제가 둘 다 넘치면 한 칸을 번갈아 덮어써 매 프레임 다시 재게 되므로). 글꼴 세대도 키에 넣는다
const FIT = [0, 1].map(() => ({ str: '', size: 0, maxW: 0, font: '', ep: -1, out: '' }));
function fitText(ctx, str, x, y, maxW, o, F = 0, line = 0) {
  ctx.font = font(o.size, o.weight, o.family);
  const w = ctx.measureText(str).width;
  if (w <= maxW) { text(ctx, str, x, y, o); return; }
  const size = Math.max(Math.ceil(o.size * 0.75), Math.min(o.size, F), Math.floor(o.size * maxW / w));
  const f = font(size, o.weight, o.family), C = FIT[line];
  if (C.str !== str || C.size !== size || C.maxW !== maxW || C.font !== f || C.ep !== fontEpoch) {
    ctx.font = f;
    let s = str;
    if (ctx.measureText(s).width > maxW) {
      while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
      s = s.trimEnd() + '…';
    }
    C.str = str; C.size = size; C.maxW = maxW; C.font = f; C.ep = fontEpoch; C.out = s;
  }
  text(ctx, C.out, x, y, { ...o, size, maxWidth: maxW });
}
const STAGE_CARD = { size: 40, style: 'blood', drips: 0.6, t: 0 };
const CLEAR_CARD = { size: 40, style: 'gold' };
function drawBanner(ctx, r, world, bn, L) {
  if (r.w < 40) return;
  const F = L?.textMin ?? 0;
  if (bn._t0 == null) bn._t0 = bn.t; // 배너 객체는 남은 시간만 가지므로 처음 본 값을 적어 둔다 (등장 연출용)
  const age = bn._t0 - bn.t;
  const a = clamp(Math.min(bn.t * 2, age * 5 + 0.2, 1), 0, 1);
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha *= a;
  ctx.fillStyle = bandGradient(ctx, r); ctx.fillRect(r.x, r.y, r.w, r.h);
  const cx = r.x + r.w / 2, maxW = r.w - 16;
  const stageCard = bn.kind === 'stage' || (bn.big && bn.text === world.stage?.name);
  const clear = !stageCard && bn.text === 'STAGE CLEAR';
  let subY = r.y + 57;
  if (stageCard || clear) {
    // 피 글씨 (스테이지 제목 카드: 부제를 위에, 제목 아래로 핏방울이 흘러내린다)
    const opts = stageCard ? STAGE_CARD : CLEAR_CARD;
    if (stageCard) STAGE_CARD.t = age;
    const tw = prewarmText(ctx, bn.text, opts);
    // 피 글씨는 말줄임 없이 줄이기만 한다 (40 %까지, 터치는 글자 하한 F px 아래로는 줄이지 않는다 — 스테이지 이름은 짧다)
    const k = clamp(maxW / (tw || 1), Math.min(1, Math.max(0.4, F / opts.size)), 1);
    const ty = stageCard ? r.y + 56 : r.y + 40;
    if (stageCard) subY = r.y + 15;
    ctx.save(); ctx.translate(cx, ty); ctx.scale(k, k);
    bloodText(ctx, bn.text, 0, 0, opts);
    ctx.restore();
  } else {
    fitText(ctx, bn.text, cx, r.y + (bn.big ? 36 : 34), maxW, { size: bn.big ? 38 : 30, align: 'center', weight: 800, family: bn.big ? FONT.title : FONT.logo, color: bn.color, ow: 5 }, F);
  }
  if (bn.sub) fitText(ctx, bn.sub, cx, subY, maxW, { size: Math.max(stageCard ? 13 : 14, F), align: 'center', weight: 600, color: '#e8dcc8' }, F, 1);
  ctx.restore();
}

/** 목숨 아이콘: 영웅 초상화를 작은 원에 (LIFE 캐시; 영웅·반지름·배율·그림 준비 상태가 바뀔 때만 굽는다) */
function drawLifeIcon(ctx, x, y, r, hero, p) {
  const img = assets.get(CHARACTERS[hero.charId]?.portrait);
  const c = LIFE.c;
  if (!c) { paintLifeIcon(ctx, x, y, r, img, p, CHARACTERS[hero.charId]?.portrait); return; }
  const a = hudScale(ctx), m = r + 1.5, d = m * 2, K = LIFE, iw = img ? img.width * 65536 + img.height : 0, col = p.look?.primary ?? null;
  if (K.id !== hero.charId || K.iw !== iw || K.col !== col || K.r !== r || K.a !== a) {
    const g = prepSprite(c, d, d, a);
    paintLifeIcon(g, m, m, r, img, p, CHARACTERS[hero.charId]?.portrait);
    K.id = hero.charId; K.iw = iw; K.col = col; K.r = r; K.a = a;
    HUD_SPRITE_STATS.lifeBakes++;
  }
  ctx.drawImage(c, 0, 0, c.width, c.height, x - m, y - m, c.width / a, c.height / a);
}
function paintLifeIcon(ctx, x, y, r, img, p, key = null) {
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = '#12060c'; ctx.fill();
  ctx.save(); ctx.clip();
  const fr = img ? faceRect(img, key, 1.4) : null;   // 얼굴 중심 정사각 (portrait_meta)
  if (fr) ctx.drawImage(img, fr.sx, fr.sy, fr.sw, fr.sh, x - r, y - r, r * 2, r * 2);
  else { ctx.fillStyle = p.look?.primary ?? '#844'; ctx.fillRect(x - r, y - r, r * 2, r * 2); }
  ctx.restore();
  ctx.strokeStyle = '#ff8a9a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
  ctx.restore();
}

/** 스킬 슬롯 i 의 문장을 (x + 19, y + 19) 에 30 px 로 — SKG 캐시 (스킬·배율이 바뀔 때만 굽는다; 페이지를 넘기면 다시 굽는다) */
function drawSlotGlyph(ctx, i, sid, sk, x, y) {
  const c = SKG.c;
  if (!c) { drawSkillGlyph(ctx, sk, x + 19, y + 19, 30); return; }
  const a = hudScale(ctx);
  if (a !== SKG.a) { SKG.a = a; SKG.keys[0] = SKG.keys[1] = ''; prepSprite(c, 76, 38, a); }
  if (SKG.keys[i] !== sid) {
    const g = c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(Math.floor(i * 38 * a), 0, Math.ceil(38 * a) + 1, c.height);
    g.setTransform(a, 0, 0, a, 0, 0);
    drawSkillGlyph(g, sk, i * 38 + 19, 19, 30);
    SKG.keys[i] = sid; HUD_SPRITE_STATS.skillBakes++;
  }
  const sx = Math.round(i * 38 * a), sw = Math.round((i + 1) * 38 * a) - sx;
  ctx.drawImage(c, sx, 0, sw, c.height, x, y, sw / a, c.height / a);
}

// ── 스킬 문양: 이름의 핵심어로 문장(紋章)을 고르고, 액티브는 원형·패시브는 마름모 바탕 ──
const EMBLEM_RULES = [
  ['whip', /채찍/], ['clock', /시간|신탁|호흡/], ['shield', /방벽|수호|방패|가호|철심|철벽|강철|체력|육체/],
  ['heal', /치유|자애|축복|회복/], ['star', /표창|단검|비연|찌르기/], ['cross', /십자|크로스|퇴마|성서|기도|신앙/],
  ['spiral', /무도|난사/], ['moon', /팬텀/], ['bullet', /탄$|탄환|사격|저격|불릿|샷|개틀링|속사|데드아이/],
  ['burst', /폭발|폭탄|폭파|폭쇄|다이너마이트|헬파이어|화약|메테오|함성/],
  ['flame', /화염|불|화둔|화형|원소/], ['bolt', /뇌|번개|천뢰/], ['drop', /피|블러드|혈|흡혈|뱀파이어|진조|굶주림|갈증/],
  ['wing', /박쥐|까마귀|날개|천사/], ['eye', /감각|눈|집중|급소|사냥꾼의/],
  ['swift', /발놀림|보법|경공|신속|무희|리듬|연무|우아/], ['crown', /귀족|품격|군주|긍지|검성|기사|성녀|자질|배짱|현상금|도박|운/],
  ['moon', /월광|밤|그림자|분신|환영|사신|암살|인술|낫/], ['spiral', /폭풍|회전|원무|난무|광란|함성|분노|광기|진격/],
  ['sun', /성광|빛|여명|새벽|성역|성전|성검|서약|권능|강림/], ['sword', /검|참|베기|일섬|칼날|가르기|일격|킬러|헌트|처형|숙련|훈련|팔/],
];
function emblemOf(sk) {
  if (sk.icon && EMBLEM_DRAW[sk.icon]) return sk.icon;
  for (const [id, re] of EMBLEM_RULES) if (re.test(sk.name ?? '')) return id;
  return 'star';
}
const EMBLEM_DRAW = {
  // 모두 반지름 1 기준 좌표 (호출 측에서 scale)
  cross(c) { c.fillRect(-0.16, -0.8, 0.32, 1.6); c.fillRect(-0.55, -0.42, 1.1, 0.3); },
  sun(c) { c.beginPath(); c.arc(0, 0, 0.36, 0, TAU); c.fill(); for (let i = 0; i < 8; i++) { const a = i * TAU / 8; c.beginPath(); c.moveTo(Math.cos(a - 0.14) * 0.48, Math.sin(a - 0.14) * 0.48); c.lineTo(Math.cos(a) * 0.86, Math.sin(a) * 0.86); c.lineTo(Math.cos(a + 0.14) * 0.48, Math.sin(a + 0.14) * 0.48); c.fill(); } },
  shield(c) { c.beginPath(); c.moveTo(-0.6, -0.62); c.lineTo(0.6, -0.62); c.lineTo(0.6, -0.05); c.quadraticCurveTo(0.55, 0.55, 0, 0.82); c.quadraticCurveTo(-0.55, 0.55, -0.6, -0.05); c.closePath(); c.rect(-0.08, -0.5, 0.16, 1.05); c.fill('evenodd'); },
  flame(c) { c.beginPath(); c.moveTo(0, -0.85); c.bezierCurveTo(0.35, -0.35, 0.65, -0.05, 0.5, 0.35); c.quadraticCurveTo(0.35, 0.8, 0, 0.8); c.quadraticCurveTo(-0.35, 0.8, -0.5, 0.35); c.bezierCurveTo(-0.6, 0, -0.25, -0.2, -0.15, -0.5); c.quadraticCurveTo(0.05, -0.3, 0, -0.85); c.fill(); },
  burst(c) { c.beginPath(); for (let i = 0; i < 16; i++) { const a = i * TAU / 16, r = i % 2 ? 0.38 : 0.86; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.closePath(); c.fill(); },
  bolt(c) { c.beginPath(); c.moveTo(0.18, -0.88); c.lineTo(-0.42, 0.08); c.lineTo(-0.02, 0.08); c.lineTo(-0.2, 0.88); c.lineTo(0.45, -0.18); c.lineTo(0.05, -0.18); c.closePath(); c.fill(); },
  drop(c) { c.beginPath(); c.moveTo(0, -0.85); c.bezierCurveTo(0.2, -0.45, 0.62, -0.05, 0.62, 0.3); c.arc(0, 0.3, 0.62, 0, Math.PI); c.bezierCurveTo(-0.62, -0.05, -0.2, -0.45, 0, -0.85); c.fill(); },
  wing(c) { for (const sx of [-1, 1]) { c.save(); c.scale(sx, 1); c.beginPath(); c.moveTo(0.08, -0.1); c.quadraticCurveTo(0.5, -0.7, 0.92, -0.35); c.quadraticCurveTo(0.8, -0.05, 0.9, 0.25); c.quadraticCurveTo(0.68, 0.08, 0.55, 0.3); c.quadraticCurveTo(0.4, 0.12, 0.3, 0.32); c.quadraticCurveTo(0.2, 0.1, 0.08, 0.2); c.closePath(); c.fill(); c.restore(); } c.beginPath(); c.arc(0, 0.02, 0.14, 0, TAU); c.fill(); },
  heal(c) { c.fillRect(-0.18, -0.66, 0.36, 1.32); c.fillRect(-0.66, -0.18, 1.32, 0.36); },
  eye(c) { c.beginPath(); c.moveTo(-0.85, 0); c.quadraticCurveTo(0, -0.75, 0.85, 0); c.quadraticCurveTo(0, 0.75, -0.85, 0); c.closePath(); c.moveTo(0.3, 0); c.arc(0, 0, 0.3, 0, TAU); c.fill('evenodd'); c.beginPath(); c.arc(0, 0, 0.15, 0, TAU); c.fill(); },
  star(c) { c.beginPath(); for (let i = 0; i < 8; i++) { const a = -Math.PI / 2 + i * TAU / 8, r = i % 2 ? 0.26 : 0.86; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.closePath(); c.fill(); },
  swift(c) { for (const ox of [-0.42, 0.12]) { c.beginPath(); c.moveTo(ox - 0.2, -0.62); c.lineTo(ox + 0.32, 0); c.lineTo(ox - 0.2, 0.62); c.lineTo(ox, 0); c.closePath(); c.fill(); } },
  crown(c) { c.beginPath(); c.moveTo(-0.72, 0.5); c.lineTo(-0.78, -0.45); c.lineTo(-0.38, -0.05); c.lineTo(0, -0.7); c.lineTo(0.38, -0.05); c.lineTo(0.78, -0.45); c.lineTo(0.72, 0.5); c.closePath(); c.fill(); },
  moon(c) { c.save(); c.beginPath(); c.arc(0, 0, 0.75, 0, TAU); c.clip(); c.beginPath(); c.rect(-1, -1, 2, 2); c.moveTo(0.96, -0.18); c.arc(0.34, -0.18, 0.62, 0, TAU); c.fill('evenodd'); c.restore(); },
  spiral(c) { c.lineWidth = 0.17; c.lineCap = 'round'; c.beginPath(); for (let i = 0; i <= 40; i++) { const a = i / 40 * TAU * 2.1, r = 0.08 + i / 40 * 0.72; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.stroke(); },
  sword(c) { c.rotate(-Math.PI / 4); c.beginPath(); c.moveTo(0, -0.92); c.lineTo(0.13, -0.72); c.lineTo(0.13, 0.36); c.lineTo(-0.13, 0.36); c.lineTo(-0.13, -0.72); c.closePath(); c.fill(); c.fillRect(-0.42, 0.36, 0.84, 0.13); c.fillRect(-0.08, 0.49, 0.16, 0.34); },
  bullet(c) { c.lineWidth = 0.13; c.beginPath(); c.arc(0, 0, 0.55, 0, TAU); c.stroke(); c.fillRect(-0.06, -0.9, 0.12, 0.5); c.fillRect(-0.06, 0.4, 0.12, 0.5); c.fillRect(-0.9, -0.06, 0.5, 0.12); c.fillRect(0.4, -0.06, 0.5, 0.12); c.beginPath(); c.arc(0, 0, 0.14, 0, TAU); c.fill(); },
  whip(c) { c.lineWidth = 0.16; c.lineCap = 'round'; c.beginPath(); c.moveTo(-0.62, 0.72); c.lineTo(-0.35, 0.42); c.stroke(); c.lineWidth = 0.1; c.beginPath(); c.moveTo(-0.35, 0.42); c.bezierCurveTo(0.6, 0.3, -0.4, -0.3, 0.3, -0.5); c.quadraticCurveTo(0.65, -0.6, 0.75, -0.85); c.stroke(); },
  clock(c) { c.lineWidth = 0.13; c.beginPath(); c.arc(0, 0, 0.7, 0, TAU); c.stroke(); c.lineCap = 'round'; c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -0.48); c.moveTo(0, 0); c.lineTo(0.34, 0.14); c.stroke(); },
};

/** 문장 바탕 그라데이션: 원점 기준이라 (색, 크기)별로 한 번 만들어 계속 쓴다 (HUD 는 매 프레임 그린다) */
const GLYPH_GRAD = new WeakMap();
function glyphGradient(ctx, col, s) {
  let m = GLYPH_GRAD.get(ctx);
  if (!m) GLYPH_GRAD.set(ctx, (m = new Map()));
  const key = `${col}|${s}`;
  let g = m.get(key);
  if (!g) {
    g = ctx.createRadialGradient(0, 0, 2, 0, 0, s * 0.6);
    g.addColorStop(0, rgba(col, 0.85)); g.addColorStop(1, rgba(col, 0.12));
    if (m.size >= 96) m.clear();
    m.set(key, g);
  }
  return g;
}

/** 스킬 아이콘 (절차적 문장) */
export function drawSkillGlyph(ctx, sk, x, y, s) {
  const col = sk.color ?? '#e8c872';
  const passive = sk.type === 'passive';
  ctx.save();
  ctx.translate(x, y);
  const R = s * 0.45;
  ctx.fillStyle = glyphGradient(ctx, col, s); ctx.beginPath();
  if (passive) { ctx.moveTo(0, -R); ctx.lineTo(R, 0); ctx.lineTo(0, R); ctx.lineTo(-R, 0); ctx.closePath(); } else ctx.arc(0, 0, R, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = rgba('#ffffff', 0.55); ctx.lineWidth = 1.2; ctx.stroke();
  // 문장 (그림자 → 본체)
  const k = s * (passive ? 0.25 : 0.3);
  const draw = EMBLEM_DRAW[emblemOf(sk)];
  for (const [ox, oy, c] of [[s * 0.03, s * 0.04, 'rgba(0,0,0,0.55)'], [0, 0, '#fffaf0']]) {
    ctx.save();
    ctx.translate(ox, oy); ctx.scale(k, k);
    ctx.fillStyle = c; ctx.strokeStyle = c;
    draw(ctx);
    ctx.restore();
  }
  ctx.restore();
}
