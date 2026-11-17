// 「먹과 달빛」 인터페이스 시안 (2차) — 1차 시안(tools/v2/ui_mock/shared/mock.js)의 내용 · 검사 함수를 가져와 새 재질로 다시 지었다.
//   ?view=play|dialog|menu   ?bg=yard|street|alley   ?shot=1 (캡처용)   ?press=attack (눌린 모습 보기)
import { paintButton, paintStick, paintKnob, installSprites, ic, fontsReady } from './ui.js';
const Q = new URLSearchParams(location.search);
const SHOT = Q.get('shot') === '1';
const dev = () => (innerHeight < 480 ? 'phone' : 'fold');

const T = {
  hero: { name: '카엘', lv: 12, cls: '바람길 추적자', hp: 1840, hpMax: 2400, st: 62 },
  stage: '잿빛 마을 · 마당',
  quest: { tag: '주 임무', name: '마당의 문을 열어라', lines: [['해골 병사 처치', '2/5']] },
  boss: { name: '돌날개 문지기', sub: '깨어난 석상', lv: 15, hp: 64 },
  toast: { name: '밤늑대 송곳니', n: 2, verb: '획득' },
  // id, 이름, 아이콘, 종류, 지름(폴드/휴대폰), 오른쪽 아래 구석에서 중심까지 x·y (폴드/휴대폰)
  acts: [
    ['attack', '공격', 'attack', 'main', [94, 72], [88, 96], [62, 66]], ['dash', '대시', 'dash', 'skill', [62, 50], [192, 84], [140, 58]], ['jump', '점프', 'jump', 'skill', [62, 50], [170, 162], [122, 116]],
    ['s1', '채찍 감기', 's1', 'skill', [62, 50], [90, 200], [64, 144]], ['s2', '세 갈래 베기', 's2', 'skill', [62, 50], [244, 190], [178, 138]], ['ult', '궁극기', 'ult', 'ult', [68, 52], [174, 252], [124, 186]],
    ['guard', '막기', 'guard', 'aux', [54, 46], [272, 110], [200, 82]], ['swap', '교대', 'swap', 'aux', [52, 46], [80, 276], [56, 202]], ['lock', '조준', 'lock', 'aux', [48, 44], [262, 44], [198, 30]], ['mount', '탑승', 'mount', 'aux', [48, 44], [318, 44], [248, 30]],
  ],
  sys: [['auto', '자동', 'auto'], ['map', '지도', 'map'], ['bag', '가방', 'bag'], ['menu', '메뉴', 'menu']],
  dlg: ['문이 잠겼군. 석상이 깨어나기 전에 열쇠부터 찾아야겠어.', '바람이 골목 안쪽에서 불어온다. 놈들이 지나간 길이 아직 식지 않았어.', '좋아, 붉은 달이 지기 전에 끝내자.'],
  tabs: ['장비', '가방', '기술', '임무', '설정'],
  eq: [['whip', '무기', '송곳니 채찍', '+3', 3], ['helm', '머리', '비어 있음', '', 0], ['armor', '몸통', '청록 비늘 조끼', '+1', 3], ['pauldron', '어깨', '뼈발톱 견갑', '+2', 2], ['boot', '다리', '추적자의 장화', '', 1], ['ring', '장신구', '달조각 반지', '', 4]],
  bag: [['whip', 3, ''], ['fang', 1, '12'], ['potion', 2, '5'], ['herb', 1, '23'], ['bone', 1, '8'], ['gem', 4, '1'], ['armor', 2, ''], ['key', 3, '1'], ['boot', 1, ''], ['ring', 2, ''], ['potion', 1, '9'], ['pauldron', 3, ''], ['helm', 2, ''], ['coin', 1, '40'], ['moon', 4, '36'], ['herb', 2, '4'], ['bone', 2, '2'], ['fang', 3, '3']],
  item: { name: '송곳니 채찍', rar: '희귀 · 채찍', stats: [['공격력', '+48', '▲12'], ['치명 확률', '+6%', ''], ['공격 속도', '빠름', '']], desc: '밤늑대의 송곳니를 박은 가죽 채찍. 휘두를 때마다 바람 가르는 소리가 난다.' },
  stats: [['공격력', '312'], ['방어력', '148'], ['생명력', '2,400'], ['치명', '18%']],
};
const num = (n) => n.toLocaleString('en-US');

function build() {
  const h = T.hero, q = T.quest, b = T.boss;
  const acts = T.acts.map(([id, lb]) => `<button class="abtn" id="b-${id}" data-k="${id}" aria-label="${lb}"><canvas></canvas></button>`).join('');
  const sys = T.sys.map(([id, lb]) => `<button class="sbtn" id="s-${id}" data-k="${id}"><canvas></canvas><span class="lb">${lb}</span>${id === 'bag' ? '<b class="bd">3</b>' : ''}</button>`).join('');
  const cells = Array.from({ length: 40 }, (_, i) => { const c = T.bag[i]; return c ? `<button class="cell r${c[1]}${i === 0 ? ' sel' : ''}"><i class="fr"></i>${ic(c[0])}${c[2] ? `<b>${c[2]}</b>` : ''}</button>` : '<button class="cell empty"><i class="fr"></i></button>'; }).join('');
  const eq = T.eq.map(([k, part, nm, plus, r]) => `<button class="slot r${r}${r ? '' : ' empty'}"><span class="si">${ic(k)}</span><span class="sp">${part}</span><span class="sn">${nm}</span>${plus ? `<b class="pl">${plus}</b>` : ''}</button>`).join('');
  return `
<div id="bg"></div><div id="shade"></div>
<div id="hud">
  <div id="hero"><div class="pt"><img src="img/kael3_face.webp" alt=""><i class="en"></i><b class="lv">${h.lv}</b></div>
    <div class="hi"><div class="hn"><b class="nm">${h.name}</b><span class="cls">${h.cls}</span><span class="num">${num(h.hp)}<em> / ${num(h.hpMax)}</em></span></div>
      <div class="hp bar"><i class="lag" style="width:${(h.hp / h.hpMax * 100 + 7).toFixed(1)}%"></i><i class="fill" style="width:${(h.hp / h.hpMax * 100).toFixed(1)}%"></i></div>
      <div class="st bar"><i class="fill" style="width:${h.st}%"></i></div></div></div>
  <div id="sys">${sys}</div>
  <div id="mini"><canvas></canvas><svg viewBox="0 0 100 100" class="mm"><path class="mf" d="M18 14h64v48H60v34H40V62H18z"/><path class="mw" d="M18 14h26M56 14h26v48H60v34M40 96V62H18V14"/><path class="mg" d="M44 14h12"/>
    <circle class="me" cx="36" cy="40" r="3.2"/><circle class="me" cx="64" cy="40" r="3.2"/><circle class="me" cx="50" cy="29" r="3.2"/><circle class="me" cx="28" cy="24" r="3.2"/><circle class="me" cx="72" cy="24" r="3.2"/>
    <path class="mo" d="M50 8l4.5 5.500-4.500 5.500-4.500-5.500z"/><path class="mh" d="M50 43l6 11-6-2.800-6 2.800z"/></svg><i class="north"></i><span class="mn">${T.stage}</span></div>
  <div id="quest"><b class="seal">狩</b><div class="qn">${q.name}</div>${q.lines.map(([t, c]) => `<div class="ql"><span>${t}</span><b>${c}</b></div>`).join('')}</div>
  <div id="boss"><div class="bn"><i class="orn">${ic('skull')}</i><b>${b.name}</b><span class="bs">${b.sub} · Lv.${b.lv}</span><span class="bp">${b.hp}<em>%</em></span></div><div class="bbar bar"><i class="lag" style="width:${b.hp + 6}%"></i><i class="fill" style="width:${b.hp}%"></i><i class="seg"></i></div></div>
  <div id="toast"><span class="ti">${ic('fang')}</span><span class="tt"><b>${T.toast.name}</b> ×${T.toast.n} <em>${T.toast.verb}</em></span></div>
  <span class="dmg d1">128</span><span class="dmg d2 crit"><em>치명</em>342</span><span class="dmg d3">96</span><span class="dmg d4 hurt">-45</span>
  <div id="stick"><canvas class="base"></canvas><canvas class="knob"></canvas></div>
  <div id="acts">${acts}</div>
</div>
<div id="dlg"><div class="dp"><img src="img/kael3_bust.webp" alt=""></div><div class="dbox"><div class="dn"><b>${h.name}</b><span>${h.cls}</span></div><p class="dt"></p><i class="dnext">${ic('next')}</i></div><button class="dskip"><span>건너뛰기</span></button></div>
<div id="menu"><i class="fr"></i>
  <div class="mh"><div class="mtitle"><b class="seal">狩</b>사냥 수첩</div><div class="mtabs">${T.tabs.map((t, i) => `<button class="${i === 0 ? 'on' : ''}"><span>${t}</span></button>`).join('')}</div>
    <div class="mcur"><span class="c1">${ic('coin')}12,480</span><span class="c2">${ic('moon')}36</span></div><button class="mclose" aria-label="닫기">${ic('x')}</button></div>
  <div class="mb">
    <div class="mchar"><div class="mpt"><img src="img/kael3_bust.webp" alt=""></div><div class="mcn"><b>${h.name}</b><span>Lv.${h.lv} · ${h.cls}</span></div><ul class="mstat">${T.stats.map(([k, v]) => `<li>${k}<i></i><b>${v}</b></li>`).join('')}</ul></div>
    <div class="meq"><h3>착용 중</h3><div class="slots">${eq}</div></div>
    <div class="mgrid"><h3>가방 <span>18/40</span></h3><div class="cells">${cells}</div></div>
    <div class="mdet"><div class="dh"><span class="di r3">${ic('whip')}</span><div><b>${T.item.name}</b><span class="rar">${T.item.rar}</span></div></div>
      <ul class="ds">${T.item.stats.map(([k, v, d]) => `<li>${k}<i></i><b>${v}</b>${d ? `<em>${d}</em>` : ''}</li>`).join('')}</ul><p class="dd">${T.item.desc}</p>
      <div class="dbtn"><button class="pri"><span>장착</span></button><button><span>강화</span></button><button class="ghost"><span>버리기</span></button></div></div>
  </div>
</div>
<div id="views"><button data-v="play">전투</button><button data-v="dialog">대화</button><button data-v="menu">가방</button></div>`;
}

const app = document.getElementById('app');
await fontsReady();
installSprites();
app.innerHTML = build();
let view = Q.get('view') || 'play', line = 0;
const $ = (s) => app.querySelector(s);

// 보여 주기용 상태: 기술 2 = 재사용 대기(테가 차오름), 궁극기 = 가득 참, 탑승 = 잠김, 조준 = 켜짐, 기술 1 = 지금 쓰면 좋음
const state = { s2: { cool: 0.58, ct: '3' }, ult: { chg: 100 }, mount: { off: 1 }, lock: { on: 1 }, s1: { rdy: 1 } };
if (Q.get('ult')) state.ult = { chg: +Q.get('ult'), ct: Q.get('ult') + '%' };
if (Q.get('press')) state[Q.get('press')] = { ...(state[Q.get('press')] || {}), pr: 1 };
function paint() {
  const d = dev() === 'fold' ? 0 : 1;
  for (const [id, , icon, kind, ss, pf, pp] of T.acts) { const e = $('#b-' + id), s = ss[d], [px, py] = d ? pp : pf; e.style.cssText = `--x:${px};--y:${py};--s:${s}`; paintButton(e.firstChild, { s, kind, icon, ...(state[id] || {}) }); e.classList.toggle('pr', !!(state[id] || {}).pr); }
  for (const [id, , icon] of T.sys) paintButton($('#s-' + id).firstChild, { s: d ? 34 : 38, kind: 'sys', icon, ...(state['sys-' + id] || {}) });
  const ms = d ? 78 : 112; paintButton($('#mini canvas'), { s: ms, kind: 'map' });
  const st = d ? 112 : 150; paintStick($('#stick .base'), st); paintKnob($('#stick .knob'), d ? 44 : 58);
}
function setView(v) {
  view = v; const d = dev(), bg = Q.get('bg') || (v === 'dialog' ? 'street' : 'yard');
  app.className = `v-${v} ${d} bg-${bg}${SHOT ? ' shot' : ''}`;
  $('#bg').style.backgroundImage = `url(img/${d === 'fold' ? 'fold_open' : 'phone2'}_${bg}.webp)`;
  if (v === 'dialog') $('.dt').textContent = T.dlg[line % T.dlg.length];
  paint();
}
setView(view);
addEventListener('resize', () => setView(view));

// ── 움직임 (실제로 눌리는지 보기 위한 최소한) ──
const stick = $('#stick'), knob = $('#stick .knob');
let sid = null;
const moveKnob = (e) => { const r = stick.getBoundingClientRect(), R = r.width * 0.3; let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2); const m = Math.hypot(dx, dy); if (m > R) { dx *= R / m; dy *= R / m; } knob.style.transform = `translate(${dx}px,${dy}px)`; };
stick.addEventListener('pointerdown', (e) => { sid = e.pointerId; try { stick.setPointerCapture(sid); } catch { /* 합성 이벤트 */ } moveKnob(e); });
stick.addEventListener('pointermove', (e) => { if (e.pointerId === sid) moveKnob(e); });
const up = (e) => { if (e.pointerId === sid) { sid = null; knob.style.transform = ''; } };
stick.addEventListener('pointerup', up); stick.addEventListener('pointercancel', up);
app.addEventListener('pointerdown', (e) => {
  const b = e.target.closest('.abtn,.sbtn,.cell,.slot,.mtabs button,.dbtn button,.mclose,#views button,.dskip');
  if (!b) { if (view === 'dialog' && e.target.closest('#dlg')) { line++; if (line >= T.dlg.length) { line = 0; setView('play'); } else setView('dialog'); } return; }
  if (b.matches('#views button')) setView(b.dataset.v);
  else if (b.matches('.sbtn')) { const k = b.dataset.k; if (k === 'bag' || k === 'menu') setView('menu'); else { state['sys-' + k] = state['sys-' + k] ? null : { on: 1 }; paint(); } }
  else if (b.matches('.mclose')) setView('play');
  else if (b.matches('.dskip')) { line = 0; setView('play'); }
  else if (b.matches('.mtabs button')) app.querySelectorAll('.mtabs button').forEach((x) => x.classList.toggle('on', x === b));
  else if (b.matches('.cell')) app.querySelectorAll('.cell').forEach((x) => x.classList.toggle('sel', x === b));
  else if (b.matches('.abtn')) {
    const k = b.dataset.k, s0 = state[k] || {};
    if (s0.off) return;
    if (k === 'lock' || k === 'guard') s0.on = s0.on ? 0 : 1;
    state[k] = { ...s0, pr: 1 }; paint(); setTimeout(() => { state[k] = { ...state[k], pr: 0 }; paint(); }, 150);
    if ((k === 's1' || k === 's2') && !(s0.cool > 0)) { const t0 = performance.now(), D = 4000; const step = (t) => { const p = 1 - (t - t0) / D; if (p <= 0) { state[k] = {}; paint(); return; } state[k] = { cool: p, ct: String(Math.ceil(p * D / 1000)) }; paint(); requestAnimationFrame(step); }; requestAnimationFrame(step); }
  } else { b.classList.add('pr'); setTimeout(() => b.classList.remove('pr'), 160); }
});

// 검사용 (render.mjs 가 부른다): 눌리는 것의 크기 · 겹침 · 화면 밖 · 엄지 거리 · 가리는 넓이
window.__ui = {
  measure() {
    const vis = (e) => { const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false; let p = e.parentElement; while (p && p !== app) { if (getComputedStyle(p).display === 'none') return false; p = p.parentElement; } const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const R = (e) => { const r = e.getBoundingClientRect(); return { id: e.id || e.className.split(' ')[0] + (e.dataset.k ? ':' + e.dataset.k : ''), x: +r.left.toFixed(1), y: +r.top.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };
    const touch = [...app.querySelectorAll('.abtn,.sbtn,.cell,.slot,.mtabs button,.dbtn button,.mclose,.dskip,#stick')].filter(vis).map(R);
    const blocks = [...app.querySelectorAll('#hero,#sys,#mini,#quest,#boss,#toast,#stick,.abtn,.dbox,.dskip')].filter(vis).map(R);
    const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    const isBtn = (r) => /^b-/.test(r.id), overlaps = [];
    for (let i = 0; i < blocks.length; i++) for (let j = i + 1; j < blocks.length; j++) {
      const a = blocks[i], b = blocks[j];
      if (isBtn(a) && isBtn(b)) { const d = Math.hypot(a.x + a.w / 2 - b.x - b.w / 2, a.y + a.h / 2 - b.y - b.h / 2); if (d < (a.w + b.w) / 2 + 2) overlaps.push([a.id, b.id, +d.toFixed(1)]); } else if (hit(a, b)) overlaps.push([a.id, b.id]);
    }
    const W = innerWidth, H = innerHeight;
    const reach = touch.filter(isBtn).map((r) => ({ id: r.id, d: +Math.hypot(W - (r.x + r.w / 2), H - (r.y + r.h / 2)).toFixed(0) }));
    const out = blocks.filter((r) => r.x < 0 || r.y < 0 || r.x + r.w > W || r.y + r.h > H).map((r) => r.id);
    const cx0 = W * 0.2, cy0 = H * 0.2, cw = W * 0.6, ch = H * 0.6; let cover = 0, area = 0, disc = 0;
    for (const r of blocks) { const ox = Math.max(0, Math.min(r.x + r.w, cx0 + cw) - Math.max(r.x, cx0)), oy = Math.max(0, Math.min(r.y + r.h, cy0 + ch) - Math.max(r.y, cy0)); cover += ox * oy; area += r.w * r.h; disc += isBtn(r) || r.id === 'stick' || r.id === 'mini' ? Math.PI * r.w * r.h / 4 : r.w * r.h; }
    let minFont = 99, minFontWho = '';
    for (const e of app.querySelectorAll('*')) { if (![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue; if (!vis(e)) continue; const f = parseFloat(getComputedStyle(e).fontSize); if (f > 0 && f < minFont) { minFont = f; minFontWho = (e.className || e.tagName) + ':' + e.textContent.trim().slice(0, 8); } }
    return { W, H, minTouch: Math.min(...touch.map((r) => Math.min(r.w, r.h))), touch: touch.filter((r) => isBtn(r) || /^s-|stick/.test(r.id)).map((r) => `${r.id} ${r.w}`), small: touch.filter((r) => Math.min(r.w, r.h) < 44).map((r) => `${r.id} ${r.w}x${r.h}`), overlaps, out, reachMax: Math.max(0, ...reach.map((r) => r.d)), reachWho: (reach.sort((a, b) => b.d - a.d)[0] || {}).id, centerCoverPct: +(cover / (cw * ch) * 100).toFixed(1), hudAreaPct: +(area / (W * H) * 100).toFixed(1), hudDrawnPct: +(disc / (W * H) * 100).toFixed(1), n: touch.length, minFont, minFontWho };
  },
  setView,
};
