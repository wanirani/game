// 「붉은밤」 인터페이스 시안 — 세 스타일이 함께 쓰는 뼈대.
// 같은 내용(영웅·버튼·퀘스트·보스·가방)을 같은 DOM 으로 만들고, 생김새·배치는 스타일별 style.css 가 전부 정한다.
//   ?view=play|dialog|menu   ?bg=yard|street|alley   ?shot=1 (캡처용: 보기 전환 칩 숨김·움직임 끔)
const Q = new URLSearchParams(location.search);
const root = document.documentElement;
const SHOT = Q.get('shot') === '1';
const dev = () => (innerHeight < 480 ? 'phone' : 'fold');

// ── 아이콘 (24×24, 선 그림. 굵기·끝 모양·색은 스타일 CSS 가 정한다) ─────────────────────
const I = {
  attack: '<path d="M20 4l-1.2 5.2L9 19l-4-4 9.8-9.8z"/><path d="M4.5 12.5l7 7"/><path d="M3.5 20.5L7 17"/>',
  jump: '<path d="M12 15V4"/><path d="M6.5 9.5L12 4l5.5 5.5"/><path d="M6 20h12"/>',
  dash: '<path d="M4.5 6l6 6-6 6"/><path d="M12.5 6l6 6-6 6"/>',
  s1: '<path d="M4 19C4 10 10 4.500 16 5.500c4 .7 5 5 2 7-2.500 1.600-5.500.2-5-2.300"/><path d="M4 19l-1.200 2.500"/>',
  s2: '<path d="M7 3.500c1.200 6 .2 11.500-2.500 17"/><path d="M12.500 3c1.500 6 .5 12.500-2.500 18"/><path d="M18 3.500c1.200 6 .2 11.500-2.500 17"/>',
  ult: '<path d="M15.500 3a9 9 0 1 0 5.500 12.500A7.500 7.500 0 0 1 15.500 3z"/><path class="f" d="M17.500 7.500l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
  swap: '<path d="M4 9h14"/><path d="M15 5.500L18.500 9 15 12.500"/><path d="M20 15H6"/><path d="M9 11.500L5.500 15 9 18.500"/>',
  mount: '<path d="M7.500 20.500v-3.200C5.300 15.800 4 13.300 4 10.500a8 8 0 0 1 16 0c0 2.800-1.300 5.300-3.500 6.800v3.200h-3v-4.700c1.800-.9 3-2.900 3-5.300a4.500 4.500 0 0 0-9 0c0 2.400 1.200 4.400 3 5.300v4.700z"/>',
  guard: '<path d="M12 3l8 3v6c0 4.500-3.200 8-8 9.500C7.200 20 4 16.500 4 12V6z"/><path d="M12 7.500v9"/>',
  lock: '<circle cx="12" cy="12" r="6"/><path d="M12 2.500V7"/><path d="M12 17v4.500"/><path d="M2.500 12H7"/><path d="M17 12h4.500"/><circle class="f" cx="12" cy="12" r="1.300"/>',
  map: '<path d="M3 6.500l6-2.500 6 2.500 6-2.500v13.500L15 20l-6-2.500L3 20z"/><path d="M9 4v13.500"/><path d="M15 6.500V20"/>',
  bag: '<path d="M6.500 9h11l1.500 9.500a2 2 0 0 1-2 2.300H7a2 2 0 0 1-2-2.300z"/><path d="M9 9V7.500a3 3 0 0 1 6 0V9"/><path d="M10 13.500h4"/>',
  menu: '<path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/>',
  auto: '<path d="M20 12a8 8 0 1 1-2.400-5.700"/><path d="M20 3.500V8h-4.500"/><path d="M9.300 15.500L12 9l2.700 6.500"/><path d="M10.200 13.500h3.600"/>',
  potion: '<path d="M9.500 3h5"/><path d="M10.500 3v4.500L6.300 14.500A4.200 4.200 0 0 0 10 21h4a4.200 4.200 0 0 0 3.700-6.500L13.500 7.500V3"/><path d="M7.500 14h9"/>',
  fang: '<path d="M8 3c4.500 0 8.500 2 8.500 6.200 0 4.800-3 8.800-5.200 11.800-1-4-4.300-7-4.300-12 0-2.200.3-4.200 1-6z"/>',
  coin: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/>',
  moon: '<path d="M15.500 3a9 9 0 1 0 5.500 12.500A7.500 7.500 0 0 1 15.500 3z"/>',
  helm: '<path d="M5 14.500a7 7 0 0 1 14 0V19h-5v-4.500h-4V19H5z"/><path d="M12 7.500V4"/>',
  armor: '<path d="M8 4l4 2 4-2 4 3.500-2.200 2.500V20H6.200V10L4 7.500z"/><path d="M12 6v14"/>',
  pauldron: '<path d="M4 15.500a8 8 0 0 1 16 0v3H4z"/><path d="M8 18.500v-4.500"/><path d="M12 18.500V12"/><path d="M16 18.500v-4.500"/>',
  boot: '<path d="M8 3h6v10l5 3v4.500H8z"/><path d="M8 16.500h11"/>',
  ring: '<circle cx="12" cy="14.500" r="5.500"/><path d="M9.500 6.500L12 3.500l2.500 3L12 9z"/>',
  whip: '<path d="M4 20l4.500-4.500"/><path d="M8.500 15.500c6 2.200 11.500-2 9.500-7-1.500-3.500-6-3-6 0 0 2 2.500 2.600 3.600 1"/>',
  herb: '<path d="M12 21V10"/><path d="M12 13C8 13 6 10.500 6 7c4 0 6 2.500 6 6z"/><path d="M12 10c0-3.500 2-6 6-6 0 3.500-2 6-6 6z"/>',
  key: '<circle cx="8" cy="8" r="4"/><path d="M11 11l9 9"/><path d="M16 16l2.500-2.500"/><path d="M18.500 18.500L20.500 16.500"/>',
  bone: '<path d="M7.500 4.500a2.200 2.200 0 0 0-3 3 2.200 2.200 0 0 0 2 3.200l6.800 6.800a2.200 2.200 0 0 0 3.200 2 2.200 2.200 0 0 0 3-3 2.200 2.200 0 0 0-2-3.200L10.700 6.500a2.200 2.200 0 0 0-3.200-2z"/>',
  gem: '<path d="M7 4h10l4 5.500L12 21 3 9.500z"/><path d="M3 9.500h18"/><path d="M9.500 9.500L12 21l2.500-11.500"/>',
  x: '<path d="M6 6l12 12"/><path d="M18 6L6 18"/>',
  skull: '<path d="M5 11a7 7 0 0 1 14 0v3.500l-2 1.500V19H7v-3L5 14.500z"/><circle class="f" cx="9.300" cy="11.500" r="1.500"/><circle class="f" cx="14.700" cy="11.500" r="1.500"/><path d="M10.500 19v-2.500"/><path d="M13.500 19v-2.500"/>',
};
// 숫자 표기를 줄여 쓴 것(2.500 등)을 그대로 두면 SVG 가 받아들이므로 손대지 않는다.
const ic = (k, cls = 'ic') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${I[k] || ''}</svg>`;

// ── 내용 (세 스타일 공통) ───────────────────────────────────────────────
const T = {
  hero: { name: '카엘', lv: 12, cls: '바람길 추적자', hp: 1840, hpMax: 2400, st: 62 },
  stage: '잿빛 마을 · 마당',
  quest: { tag: '주 임무', name: '마당의 문을 열어라', lines: [['해골 병사 처치', '2/5'], ['문지기의 열쇠 찾기', '0/1']] },
  boss: { name: '돌날개 문지기', sub: '깨어난 석상', lv: 15, hp: 64 },
  toast: { name: '밤늑대 송곳니', n: 2, verb: '획득' },
  acts: [
    ['attack', '공격', 'attack'], ['jump', '점프', 'jump'], ['dash', '대시', 'dash'],
    ['s1', '채찍 감기', 's1'], ['s2', '세 갈래 베기', 's2'], ['ult', '궁극기', 'ult'],
    ['swap', '교대', 'swap'], ['mount', '탑승', 'mount'], ['guard', '막기', 'guard'], ['lock', '조준', 'lock'],
  ],
  sys: [['auto', '자동', 'auto'], ['map', '지도', 'map'], ['bag', '가방', 'bag'], ['menu', '메뉴', 'menu']],
  dlg: [
    '문이 잠겼군. 석상이 깨어나기 전에 열쇠부터 찾아야겠어.',
    '바람이 골목 안쪽에서 불어온다. 놈들이 지나간 길이 아직 식지 않았어.',
    '좋아, 붉은 달이 지기 전에 끝내자.',
  ],
  tabs: ['장비', '가방', '기술', '임무', '설정'],
  eq: [['whip', '무기', '송곳니 채찍', '+3', 3], ['helm', '머리', '비어 있음', '', 0], ['armor', '몸통', '청록 비늘 조끼', '+1', 3],
    ['pauldron', '어깨', '뼈발톱 견갑', '+2', 2], ['boot', '다리', '추적자의 장화', '', 1], ['ring', '장신구', '달조각 반지', '', 4]],
  bag: [['whip', 3, ''], ['fang', 1, '12'], ['potion', 2, '5'], ['herb', 1, '23'], ['bone', 1, '8'], ['gem', 4, '1'], ['armor', 2, ''], ['key', 3, '1'],
    ['boot', 1, ''], ['ring', 2, ''], ['potion', 1, '9'], ['pauldron', 3, ''], ['helm', 2, ''], ['coin', 1, '40'], ['moon', 4, '36'], ['herb', 2, '4'], ['bone', 2, '2'], ['fang', 3, '3']],
  item: { name: '송곳니 채찍', rar: '희귀 · 채찍', stats: [['공격력', '+48', '▲12'], ['치명 확률', '+6%', ''], ['공격 속도', '빠름', '']],
    desc: '밤늑대의 송곳니를 박은 가죽 채찍. 휘두를 때마다 바람 가르는 소리가 난다.' },
  stats: [['공격력', '312'], ['방어력', '148'], ['생명력', '2,400'], ['치명', '18%']],
};
const num = (n) => n.toLocaleString('en-US');

function build() {
  const h = T.hero, q = T.quest, b = T.boss;
  const acts = T.acts.map(([id, lb, k]) => `<button class="abtn" id="b-${id}" data-k="${id}"><i class="fr"></i><i class="fc"></i>${ic(k)}<i class="cd"></i><b class="ct"></b><span class="lb">${lb}</span></button>`).join('');
  const sys = T.sys.map(([id, lb, k]) => `<button class="sbtn" id="s-${id}" data-k="${id}"><i class="fr"></i>${ic(k)}<span class="lb">${lb}</span>${id === 'bag' ? '<b class="bd">3</b>' : ''}</button>`).join('');
  const cells = Array.from({ length: 40 }, (_, i) => { const c = T.bag[i]; return c ? `<button class="cell r${c[1]}${i === 0 ? ' sel' : ''}"><i class="fr"></i>${ic(c[0])}${c[2] ? `<b>${c[2]}</b>` : ''}</button>` : '<button class="cell empty"><i class="fr"></i></button>'; }).join('');
  const eq = T.eq.map(([k, part, nm, plus, r]) => `<button class="slot r${r}${r ? '' : ' empty'}"><i class="fr"></i><span class="si">${ic(k)}</span><span class="sp">${part}</span><span class="sn">${nm}</span>${plus ? `<b class="pl">${plus}</b>` : ''}</button>`).join('');
  return `
<div id="bg"></div><div id="shade"></div>
<div id="hud">
  <div id="hero"><i class="fr"></i><div class="pt"><img src="../shared/kael3_face.webp" alt=""></div>
    <div class="hi"><div class="hn"><b class="nm">${h.name}</b><span class="lv">Lv.${h.lv}</span><span class="cls">${h.cls}</span></div>
      <div class="hp bar"><i class="lag" style="width:${(h.hp / h.hpMax * 100 + 7).toFixed(1)}%"></i><i class="fill" style="width:${(h.hp / h.hpMax * 100).toFixed(1)}%"></i><span class="num">${num(h.hp)}<em> / ${num(h.hpMax)}</em></span></div>
      <div class="st bar"><i class="fill" style="width:${h.st}%"></i></div></div></div>
  <div id="sys">${sys}</div>
  <div id="mini"><i class="fr"></i><svg viewBox="0 0 100 100" class="mm"><path class="mf" d="M18 14h64v48H60v34H40V62H18z"/><path class="mw" d="M18 14h26M56 14h26v48H60v34M40 96V62H18V14"/><path class="mg" d="M44 14h12"/>
    <circle class="me" cx="36" cy="40" r="3"/><circle class="me" cx="64" cy="40" r="3"/><circle class="me" cx="50" cy="29" r="3"/><circle class="me" cx="28" cy="24" r="3"/><circle class="me" cx="72" cy="24" r="3"/>
    <path class="mo" d="M50 9l4 5-4 5-4-5z"/><path class="mh" d="M50 44l5.500 10-5.500-2.500-5.500 2.500z"/></svg><span class="mn">${T.stage}</span></div>
  <div id="quest"><i class="fr"></i><div class="qt">${q.tag}</div><div class="qn">${q.name}</div>${q.lines.map(([t, c]) => `<div class="ql"><i class="qc"></i><span>${t}</span><b>${c}</b></div>`).join('')}</div>
  <div id="boss"><i class="orn">${ic('skull')}</i><div class="bn"><b>${b.name}</b><span class="bs">${b.sub} · Lv.${b.lv}</span><span class="bp">${b.hp}%</span></div><div class="bbar bar"><i class="lag" style="width:${b.hp + 6}%"></i><i class="fill" style="width:${b.hp}%"></i><i class="seg"></i></div></div>
  <div id="toast"><i class="fr"></i><span class="ti">${ic('fang')}</span><span class="tt"><b>${T.toast.name}</b> ×${T.toast.n} <em>${T.toast.verb}</em></span></div>
  <span class="dmg d1">128</span><span class="dmg d2 crit"><em>치명</em>342</span><span class="dmg d3">96</span><span class="dmg d4 hurt">-45</span>
  <div id="stick"><i class="fr"></i><i class="ar"></i><i class="knob"></i></div>
  <div id="acts">${acts}</div>
</div>
<div id="dlg"><div class="dp"><img src="../shared/kael3_bust.webp" alt=""></div><div class="dbox"><i class="fr"></i><div class="dn"><b>${h.name}</b><span>${h.cls}</span></div><p class="dt"></p><i class="dnext"></i></div><button class="dskip">건너뛰기</button></div>
<div id="menu"><i class="fr"></i>
  <div class="mh"><div class="mtitle">사냥 수첩</div><div class="mtabs">${T.tabs.map((t, i) => `<button class="${i === 0 ? 'on' : ''}"><span>${t}</span></button>`).join('')}</div>
    <div class="mcur"><span class="c1">${ic('coin')}12,480</span><span class="c2">${ic('moon')}36</span></div><button class="mclose" aria-label="닫기">${ic('x')}</button></div>
  <div class="mb">
    <div class="mchar"><i class="fr"></i><div class="mpt"><img src="../shared/kael3_bust.webp" alt=""></div><div class="mcn"><b>${h.name}</b><span>Lv.${h.lv} · ${h.cls}</span></div><ul class="mstat">${T.stats.map(([k, v]) => `<li>${k}<b>${v}</b></li>`).join('')}</ul></div>
    <div class="meq"><i class="fr"></i><h3>착용 중</h3><div class="slots">${eq}</div></div>
    <div class="mgrid"><i class="fr"></i><h3>가방 <span>18/40</span></h3><div class="cells">${cells}</div></div>
    <div class="mdet"><i class="fr"></i><div class="dh"><span class="di r3">${ic('whip')}</span><div><b>${T.item.name}</b><span class="rar">${T.item.rar}</span></div></div>
      <ul class="ds">${T.item.stats.map(([k, v, d]) => `<li>${k}<b>${v}</b>${d ? `<em>${d}</em>` : ''}</li>`).join('')}</ul><p class="dd">${T.item.desc}</p>
      <div class="dbtn"><button class="pri"><span>장착</span></button><button><span>강화</span></button><button class="ghost"><span>버리기</span></button></div></div>
  </div>
</div>
<div id="views"><button data-v="play">전투</button><button data-v="dialog">대화</button><button data-v="menu">가방</button></div>`;
}

const app = document.getElementById('app');
app.innerHTML = build();
let view = Q.get('view') || 'play', line = 0;
const $ = (s) => app.querySelector(s);
function setView(v) {
  view = v;
  const d = dev();
  app.className = `v-${v} ${d}${SHOT ? ' shot' : ''}`;
  const bg = Q.get('bg') || (v === 'dialog' ? 'street' : 'yard');
  $('#bg').style.backgroundImage = `url(../bg/${d === 'fold' ? 'fold_open' : 'phone2'}_${bg}.webp)`;
  if (v === 'dialog') $('.dt').textContent = T.dlg[line % T.dlg.length];
}
setView(view);
addEventListener('resize', () => setView(view));

// 보여 주기용 상태: 기술 2는 재사용 대기, 궁극기는 80% 충전, 탑승은 쓸 수 없음, 자동은 꺼짐, 조준은 켜짐
const set = (id, cdp, ct) => { const e = $('#b-' + id); e.style.setProperty('--cdp', cdp); e.querySelector('.ct').textContent = ct; e.classList.toggle('cool', cdp > 0); };
set('s2', 58, '3'); $('#b-ult').style.setProperty('--chg', 80); $('#b-ult').querySelector('.ct').textContent = '80%';
$('#b-mount').classList.add('off'); $('#b-lock').classList.add('on');

// ── 움직임 (시안이 실제로 눌리는지 보기 위한 최소한) ─────────────────────────────
const stick = $('#stick'), knob = $('#stick .knob');
let sid = null;
const moveKnob = (e) => { const r = stick.getBoundingClientRect(), R = r.width * 0.3; let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2); const m = Math.hypot(dx, dy); if (m > R) { dx *= R / m; dy *= R / m; } knob.style.transform = `translate(${dx}px,${dy}px)`; };
stick.addEventListener('pointerdown', (e) => { sid = e.pointerId; stick.setPointerCapture(sid); stick.classList.add('pr'); moveKnob(e); });
stick.addEventListener('pointermove', (e) => { if (e.pointerId === sid) moveKnob(e); });
const up = (e) => { if (e.pointerId === sid) { sid = null; stick.classList.remove('pr'); knob.style.transform = ''; } };
stick.addEventListener('pointerup', up); stick.addEventListener('pointercancel', up);
app.addEventListener('pointerdown', (e) => {
  const b = e.target.closest('.abtn,.sbtn,.cell,.slot,.mtabs button,.dbtn button,.mclose,#views button,.dskip');
  if (!b) { if (view === 'dialog' && e.target.closest('#dlg')) { line++; if (line >= T.dlg.length) { line = 0; setView('play'); } else setView('dialog'); } return; }
  b.classList.add('pr'); setTimeout(() => b.classList.remove('pr'), 160);
  if (b.matches('#views button')) setView(b.dataset.v);
  else if (b.matches('.sbtn')) { if (b.dataset.k === 'bag' || b.dataset.k === 'menu') setView('menu'); else b.classList.toggle('on'); }
  else if (b.matches('.mclose')) setView('play');
  else if (b.matches('.dskip')) { line = 0; setView('play'); }
  else if (b.matches('.mtabs button')) { app.querySelectorAll('.mtabs button').forEach((x) => x.classList.toggle('on', x === b)); }
  else if (b.matches('.cell')) { app.querySelectorAll('.cell').forEach((x) => x.classList.toggle('sel', x === b)); }
  else if (b.matches('.abtn')) {
    const k = b.dataset.k;
    if (k === 'lock' || k === 'guard') b.classList.toggle('on');
    if ((k === 's1' || k === 's2') && !b.classList.contains('cool')) { const t0 = performance.now(), D = 4000; const step = (t) => { const p = 1 - (t - t0) / D; if (p <= 0) { set(k, 0, ''); return; } set(k, p * 100, String(Math.ceil(p * D / 1000))); requestAnimationFrame(step); }; requestAnimationFrame(step); }
  }
});

// 검사용: 눌리는 것들의 크기·겹침을 잰다 (tools/v2/ui_mock/render.mjs 가 부른다)
window.__ui = {
  measure() {
    const vis = (e) => { const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false; let p = e.parentElement; while (p && p !== app) { if (getComputedStyle(p).display === 'none') return false; p = p.parentElement; } const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const R = (e) => { const r = e.getBoundingClientRect(); return { id: e.id || e.className.split(' ')[0] + (e.dataset.k ? ':' + e.dataset.k : ''), x: +r.left.toFixed(1), y: +r.top.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };
    const touch = [...app.querySelectorAll('.abtn,.sbtn,.cell,.slot,.mtabs button,.dbtn button,.mclose,.dskip,#stick')].filter(vis).map(R);
    const blocks = [...app.querySelectorAll('#hero,#sys,#mini,#quest,#boss,#toast,#stick,.abtn,.dbox,.dskip')].filter(vis).map(R);
    const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    // 원·팔각 버튼은 네모 상자보다 작게 그려지므로 버튼끼리는 중심 거리로 본다
    const isBtn = (r) => /^b-/.test(r.id);
    const overlaps = [];
    for (let i = 0; i < blocks.length; i++) for (let j = i + 1; j < blocks.length; j++) {
      const a = blocks[i], b = blocks[j];
      if (isBtn(a) && isBtn(b)) { const d = Math.hypot(a.x + a.w / 2 - b.x - b.w / 2, a.y + a.h / 2 - b.y - b.h / 2); if (d < (a.w + b.w) / 2 + 2) overlaps.push([a.id, b.id, +d.toFixed(1)]); }
      else if (hit(a, b)) overlaps.push([a.id, b.id]);
    }
    const W = innerWidth, H = innerHeight;
    const reach = touch.filter(isBtn).map((r) => ({ id: r.id, d: +Math.hypot(W - (r.x + r.w / 2), H - (r.y + r.h / 2)).toFixed(0) }));
    const out = blocks.filter((r) => r.x < 0 || r.y < 0 || r.x + r.w > W || r.y + r.h > H).map((r) => r.id);
    // 화면 가운데(놀이가 벌어지는 곳)를 가리는 넓이: 가운데 60%×60% 상자와 겹치는 HUD 넓이의 비율
    const cx0 = W * 0.2, cy0 = H * 0.2, cw = W * 0.6, ch = H * 0.6; let cover = 0;
    for (const r of blocks) { const ox = Math.max(0, Math.min(r.x + r.w, cx0 + cw) - Math.max(r.x, cx0)), oy = Math.max(0, Math.min(r.y + r.h, cy0 + ch) - Math.max(r.y, cy0)); cover += ox * oy; }
    let area = 0; for (const r of blocks) area += r.w * r.h;
    return { W, H, minTouch: Math.min(...touch.map((r) => Math.min(r.w, r.h))), small: touch.filter((r) => Math.min(r.w, r.h) < 44).map((r) => `${r.id} ${r.w}x${r.h}`), overlaps, out, reachMax: Math.max(0, ...reach.map((r) => r.d)), reachWho: (reach.sort((a, b) => b.d - a.d)[0] || {}).id, centerCoverPct: +(cover / (cw * ch) * 100).toFixed(1), hudAreaPct: +(area / (W * H) * 100).toFixed(1), n: touch.length };
  },
  setView,
};
