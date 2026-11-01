// 장비 탭 「피의 유물」 세트 줄 · 기록 탭 외전 칸 머리 (Stage 8 health — healthp)
//
//   node tools/qa/menu_setlines.mjs [--vp desk,fold_open,phone2] [--sizes normal,large,xlarge] [--only sets,record] [--shots]
//
// sets   : 장비 탭에 세트 부위를 끼운 두 경우 (공허 순례자 5/5 · 공허 3 + 성당 기사 2 — 단계 줄이 가장 긴 조합) × 글자 크기 3단계 × 보기
//          · 세트 줄(setLinesOf 의 글)이 말줄임 없이 모두 그려진다: 가운데 칸을 끝까지 스크롤하며 구운 글자를 모아(fillText) 줄마다
//            글이 통째로 들어 있는지 (공백 무시 — 접은 줄은 이어 붙여 본다), 세트 칸 글자에 「…」가 없는지
//          · 칸이 다른 판과 겹치지 않는다: 세트·능력치 칸이 영웅 무대 아래 · 가운데 판 안 · (터치) 「최적 장착」 단추 위에 있다
//          · 넘치면 스크롤 칸이 있고 (sumRect, 최대 > 0) 다 들어가면 없다
//          (예전: PC 「아주 크게」에서 4·5세트 줄이 「…」로 잘리거나 빠졌고, 휴대폰은 제목 옆 「세트 3/…」만 남았다)
// record : 기록 탭 「스테이지 기록」 — 2부를 알고 외전이 모두 열린 기록 (칸 27개) 에서 외전 칸 머리(「외전 Ⅰ」·「외전 Ⅱ」·「외전」)가
//          그 칸 폭에 그려지는 가로 배율 ≥ 0.85 (fillText maxWidth 로 눌린 비율) — phone1 · fold_open (예전 phone1 0.55 안팎)
// Report: /tmp/claude-0/qa/platform/menu_setlines.json
import path from 'node:path';
import fs from 'node:fs';
import { Suite } from './lib/suite.mjs';
import { openEnv, REPORT_DIR } from './lib/server.mjs';
import { VIEWPORTS } from './lib/viewports.mjs';
import { Touch, ensureTouchMode } from './lib/touch.mjs';

const suite = new Suite('menu_setlines');
const A = suite.args;
const SIZES = A.sizes && A.sizes !== true ? String(A.sizes).split(',') : ['normal', 'large', 'xlarge'];
const SHOTS = path.join(REPORT_DIR, 'shots/menu_setlines');
const env = await openEnv();

/** 기록용 fillText 가로채기 (메뉴 글자 캐시 레이어에 굽는 글자도) — window.__stl = [{s, w, mw, sx}] */
const HOOK = () => {
  if (window.__stlHook) return;
  window.__stlHook = true;
  window.__stl = null;
  for (const pr of [CanvasRenderingContext2D.prototype, window.OffscreenCanvasRenderingContext2D?.prototype].filter(Boolean)) {
    const o = pr.fillText;
    pr.fillText = function (s, x, y, mw) {
      if (window.__stl) {
        const w = this.measureText(String(s)).width;
        window.__stl.push({ s: String(s), w, mw: mw ?? null, sx: mw != null && w > mw ? mw / w : 1 });
      }
      return o.apply(this, arguments);
    };
  }
};

async function openMenu(vp, size) {
  const s = await env.page(vp, 'index.html?scene=stage&stage=s02', { settings: size !== 'normal' ? { textSize: size } : {} });
  await s.waitGame('!!g.world?.player');
  await s.wait(1200);
  await s.skipDialogue();
  if (VIEWPORTS[vp].touch) await ensureTouchMode(new Touch(s.cdp, s.page), s.page);
  await s.eval(HOOK);
  await s.eval(`import('/tools/menu_seed.js?seed=1&lv=60&n=${vp}${size}${Date.now()}')`);
  await s.wait(200);
  return s;
}

const SCEN = {
  void5: [['rs_void_head', 'head'], ['rs_void_body', 'body'], ['rs_void_cloak', 'cloak'], ['rs_void_amulet', 'acc1'], ['rs_void_ring', 'acc2']],
  mix: [['rs_void_head', 'head'], ['rs_void_body', 'body'], ['rs_void_cloak', 'cloak'], ['rs_cath_amulet', 'acc1'], ['rs_cath_ring', 'acc2']],
};

/** 장비 탭: 세트 끼우기 → 탭 열기 → 스크롤 끝까지 가며 구운 글자 모으기 → 기대 줄 · 배치 */
async function measureSets(s, scen) {
  await s.eval(async (pieces) => {
    const g = window.__game, st = g.state, hero = st.heroes[st.charId];
    const { makeItem } = await import('/src/data/items.js');
    const inv = await import('/src/game/inventory.js');
    for (const k of ['head', 'body', 'cloak', 'acc1', 'acc2']) hero.equip[k] = null;
    for (const [id, slot] of pieces) { const it = makeItem(id, { rarity: 3, affixes: [] }); inv.addItem(st, it, { silent: true }); hero.equip[slot] = it.uid; }
    g.world?.player?.refreshStats?.();
  }, SCEN[scen]);
  await s.eval(`import('/tools/menu_seed.js?tab=equip&n=${scen}${Date.now()}')`);
  await s.wait(900);
  return s.eval(async () => {
    const g = window.__game, t = g.top?.tabs?.equip;
    if (!t) return { error: 'no equip tab' };
    const M = await import('/src/scenes/menu/tab_equip.js');
    const st = g.state, hero = st.heroes[st.charId];
    const lines = M.setLinesOf(st, hero, null).map((l) => l.text);
    const frames = (n) => new Promise((res) => { let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); });
    const got = [];
    const grab = async () => { window.__stl = []; t.txt.free(); await frames(3); got.push(...window.__stl); window.__stl = null; };
    await grab();
    const max = t.ssc?.max ?? 0, sum = t.sumRect ? { ...t.sumRect } : null;
    // 끝까지 스크롤하며 칸 높이의 반씩 내려 모은다 (스크롤 칸의 위아래 흐림 밑 글자도 한 번은 칸 가운데를 지나게)
    if (max > 0 && sum) {
      for (let y = sum.h / 2; ; y += sum.h / 2) {
        t.ssc.target = t.ssc.y = Math.min(max, y);
        await grab();
        if (y >= max) break;
      }
      t.ssc.target = t.ssc.y = 0;
      await frames(2);
    }
    const norm = (x) => x.replace(/\s+/g, '');
    const flat = norm(got.map((e) => e.s).join(''));
    const missing = lines.filter((l) => !flat.includes(norm(l)));
    // 세트 칸의 글자 조각 (기대 줄의 일부인 것) 중 「…」로 끝나는 것
    const setBits = got.filter((e) => e.s.trim() && lines.some((l) => norm(l).includes(norm(e.s).replace(/…$/, '')) && norm(e.s).length > 1));
    const ell = setBits.filter((e) => /…/.test(e.s)).map((e) => e.s);
    // 배치: 무대(heroRect) 아래 · 가운데 판 안 · 터치면 「최적 장착」 위
    const hr = t.heroRect, opt = t.optRect;
    const lay = t._layM?.v;
    const area = lay ? (lay.VR && lay.mode !== 'pin' ? lay.VR : null) : null;
    return { lines: lines.length, missing, ell, max: Math.round(max), sum, hero: hr ? { ...hr } : null, opt: opt ? { x: opt.x, y: opt.y, w: opt.w, h: opt.h } : null, mode: lay?.mode ?? null, floor: g.textFloor, area };
  });
}

try {
  if (suite.wants('sets')) await suite.group('sets', async () => {
    for (const vp of suite.vps(['desk', 'fold_open', 'phone2'])) {
      for (const size of SIZES) {
        const s = await openMenu(vp, size);
        for (const scen of Object.keys(SCEN)) {
          const r = await measureSets(s, scen);
          if (A.shots) { fs.mkdirSync(SHOTS, { recursive: true }); await s.screenshot(path.join(SHOTS, `${scen}_${vp}_${size}.png`)); }
          await suite.check({ id: `sets.${scen}.${vp}.${size}`, group: 'sets', title: `equip tab: every relic set line drawn in full, no '…' (${scen}, ${vp}, text ${size})`, session: s }, async () => {
            if (r.error) return { pass: false, detail: r.error };
            const bad = [];
            if (r.missing.length) bad.push(`missing ${r.missing.map((x) => `「${x}」`).join(' ')}`);
            if (r.ell.length) bad.push(`ellipsized ${r.ell.join(' | ')}`);
            return { pass: !bad.length, detail: `${r.lines} lines, mode ${r.mode}, scroll max ${r.max} (floor ${r.floor})${bad.length ? ' — ' + bad.join('; ') : ''}`, metrics: r };
          });
          await suite.check({ id: `sets.layout.${scen}.${vp}.${size}`, group: 'sets', title: `equip tab: set/stat area below the hero stage, above the touch 「최적 장착」 button (${scen}, ${vp}, ${size})`, session: s }, async () => {
            if (r.error) return { pass: false, detail: r.error };
            const bad = [];
            const sum = r.sum;
            if (sum && r.hero && sum.y < r.hero.y + r.hero.h - 0.5) bad.push(`scroll area top ${sum.y.toFixed(1)} above the stage bottom ${(r.hero.y + r.hero.h).toFixed(1)}`);
            if (sum && VIEWPORTS[vp].touch && r.opt && sum.y + sum.h > r.opt.y + 0.5) bad.push(`scroll area bottom ${(sum.y + sum.h).toFixed(1)} below the 최적 장착 top ${r.opt.y.toFixed(1)}`);
            if (r.max > 0 && !sum) bad.push('content overflows but no scroll area');
            return { pass: !bad.length, detail: `${sum ? `scroll area ${Object.values(sum).map((v) => Math.round(v)).join(',')}` : 'no scroll (fits)'}; stage ${r.hero ? Math.round(r.hero.h) : '?'} px${bad.length ? ' — ' + bad.join('; ') : ''}`, metrics: r };
          });
        }
        await s.close?.();
      }
    }
  });
  if (suite.wants('record')) await suite.group('record', async () => {
    for (const vp of suite.vps(['phone1', 'fold_open'])) {
      for (const size of SIZES.filter((x) => x !== 'large')) {
        const s = await openMenu(vp, size);
        await s.eval(async () => {
          const st = window.__game.state, S = await import('/src/data/stages.js');
          st.progress.unlocked = Object.keys(S.STAGES);
          st.progress.chapter = Math.max(st.progress.chapter ?? 0, 15);
          for (const id of ['s05', 's06', 's07', 's08', 's09', 's10', 's11', 's12', 's13', 's14', 's15', 's21', 's22', 's23', 's26', 's27']) st.progress.cleared[id] ??= { rank: 'A', time: 300, score: 30000 };
        });
        await s.eval(`import('/tools/menu_seed.js?tab=system&n=rec${Date.now()}')`);
        await s.wait(900);
        const r = await s.eval(async () => {
          const frames = (n) => new Promise((res) => { let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); });
          window.__stl = []; await frames(2);
          const got = window.__stl; window.__stl = null;
          const S = (await import('/src/data/stages.js')).STAGES;
          const labels = new Set(Object.values(S).filter((x) => x.side).map((x) => x.sideLabel ?? '외전'));
          const side = got.filter((e) => labels.has(e.s));
          return { n: side.length, min: side.length ? Math.min(...side.map((e) => e.sx)) : null, worst: side.sort((a, b) => a.sx - b.sx).slice(0, 3).map((e) => `${e.s}@${e.sx.toFixed(2)}`) };
        });
        if (A.shots) { fs.mkdirSync(SHOTS, { recursive: true }); await s.screenshot(path.join(SHOTS, `record_${vp}_${size}.png`)); }
        await suite.check({ id: `record.side.${vp}.${size}`, group: 'record', title: `record tab: side-story cell labels (외전 Ⅰ/Ⅱ) drawn at ≥ 0.85 of their width (${vp}, text ${size})`, session: s }, async () => {
          if (!r.n) return { pass: false, detail: 'no side-story cell label drawn (2부 known, all side stages open)' };
          return { pass: r.min >= 0.85, detail: `${r.n} side labels, narrowest horizontal scale ${r.min.toFixed(2)} (${r.worst.join(', ')})`, metrics: r };
        });
        await s.close?.();
      }
    }
  });
} finally {
  await env.close();
}
process.exit(await suite.finish());
