// 「블러드 녹턴」 3D 판 인터페이스 2차 시안 — uigem 「세공한 유리」.
// 1차 시안(tools/v2/ui_mock/shared/mock.js)의 뼈대를 가져와 이 시안에 맞게 고쳤다 (1차 파일은 건드리지 않는다).
//   ?view=play|dialog|menu   ?bg=yard|street|alley   ?shot=1 (캡처용)   ?hide=hud|ink (잰 값용: HUD 전체 / 아이콘·글자만 숨김)
const Q = new URLSearchParams(location.search);
const root = document.documentElement;
const SHOT = Q.get('shot') === '1';
if (Q.get('noblur') === '1') root.classList.add('noblur');   // 메뉴 배경을 흐리지 않고 어둡게만 (흐림 없는 판)
const dev = () => (innerHeight < 480 ? 'phone' : 'fold');
const IC = (k) => `../../../../assets/v2/ui/uigem/ic_${k}.webp`;
const IT = (k) => `../../../../assets/icons/${k}.png`;
const BGDIR = '../../ui_mock/bg/';

// ── 재질: 게임에서는 시작할 때 한 번 오프스크린 캔버스에 구워 두는 그림들. 시안에서는 SVG 데이터 URI 로 만든다 ──────────
const uri = (svg) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
const PT = '<linearGradient id="pt" x1="0.1" y1="0" x2="0.9" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".22" stop-color="#b9c0cf"/><stop offset=".42" stop-color="#f3f5fa"/><stop offset=".6" stop-color="#6f7789"/><stop offset=".8" stop-color="#e6eaf2"/><stop offset="1" stop-color="#9aa2b3"/></linearGradient>';
// 기요셰(엔진 터닝) 무늬: 겹친 원으로 만드는 로제트. 유리 밑에 아주 옅게 깔린다
function guilloche(n = 30, r = 27, d = 23, op = 0.13) {
  let c = '';
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; c += `<circle cx="${(50 + d * Math.cos(a)).toFixed(2)}" cy="${(50 + d * Math.sin(a)).toFixed(2)}" r="${r}"/>`; }
  return uri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g fill="none" stroke="#fff" stroke-width=".42" opacity="${op}">${c}</g></svg>`);
}
// 테: 백금 고리(대각선 금속 반사) + 안쪽 밀그레인(작은 구슬 줄) + 바깥·안 어두운 실선. w = 테 두께(지름 100 기준), dbl = 겹테(공격), ticks = 눈금(미니맵·스틱)
function rim({ w = 4.2, bead = true, dbl = false, ticks = 0, op = 1 } = {}) {
  const R = 50 - w / 2 - 0.6;
  let s = `<circle cx="50" cy="50" r="${R + w / 2 + 0.3}" fill="none" stroke="#05060c" stroke-opacity=".55" stroke-width=".9"/><circle cx="50" cy="50" r="${R}" fill="none" stroke="url(#pt)" stroke-width="${w}"/><circle cx="50" cy="50" r="${R - w / 2 - 0.2}" fill="none" stroke="#05060c" stroke-opacity=".5" stroke-width=".7"/>`;
  s += `<path d="M ${50 - R * 0.82} ${50 - R * 0.57} A ${R} ${R} 0 0 1 ${50 + R * 0.26} ${50 - R * 0.965}" fill="none" stroke="#fff" stroke-opacity=".9" stroke-width="${w * 0.34}" stroke-linecap="round"/>`;
  if (bead) { const rb = R - w / 2 - 2.1; s += `<circle cx="50" cy="50" r="${rb}" fill="none" stroke="#f2f4f9" stroke-opacity=".8" stroke-width="1.05" stroke-dasharray="0.01 ${(2 * Math.PI * rb / Math.round(2 * Math.PI * rb / 2.5)).toFixed(3)}" stroke-linecap="round"/>`; }
  if (dbl) { const r2 = R - w / 2 - 6.2; s += `<circle cx="50" cy="50" r="${r2}" fill="none" stroke="url(#pt)" stroke-width="1.5"/><circle cx="50" cy="50" r="${r2 + 2.6}" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width=".7" stroke-dasharray="2.4 1.2"/>`; }
  for (let i = 0; i < ticks; i++) { const a = i / ticks * Math.PI * 2, big = i % (ticks / 4) === 0, r0 = R - w / 2 - 1, r1 = r0 - (big ? 5 : 2.4); s += `<path d="M${(50 + r0 * Math.sin(a)).toFixed(2)} ${(50 - r0 * Math.cos(a)).toFixed(2)}L${(50 + r1 * Math.sin(a)).toFixed(2)} ${(50 - r1 * Math.cos(a)).toFixed(2)}" stroke="#f2f4f9" stroke-opacity="${big ? 0.95 : 0.55}" stroke-width="${big ? 1 : 0.6}"/>`; }
  return uri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs>${PT}</defs><g opacity="${op}">${s}</g></svg>`);
}
// 판 모서리 장식: 은선 두 겹 꺾쇠 + 작은 마름모 (네 방향)
function corner(rot, gem = '#e9edf5') {
  return uri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28"><g transform="rotate(${rot} 14 14)" fill="none" stroke-linecap="round"><path d="M1.5 27V9a7.500 7.500 0 0 1 7.500-7.500H27" stroke="#eef1f6" stroke-width="1.300"/><path d="M5.500 27V11.500a6 6 0 0 1 6-6H27" stroke="#eef1f6" stroke-opacity=".42" stroke-width="1"/><path d="M5.500 2l3.500 3.500-3.500 3.500L2 5.500z" fill="${gem}" stroke="#0a0c14" stroke-opacity=".5" stroke-width=".6"/></g></svg>`);
}
const st = root.style;
st.setProperty('--guil', guilloche());
st.setProperty('--guil2', guilloche(44, 30, 20, 0.11));
st.setProperty('--rim', rim());
st.setProperty('--rim-s', rim({ w: 4.6 }));
st.setProperty('--rim-atk', rim({ w: 3.4, dbl: true }));
st.setProperty('--rim-dim', rim({ op: 0.34, bead: false }));
st.setProperty('--rim-map', rim({ w: 2.6, bead: false, ticks: 48 }));
st.setProperty('--rim-stick', rim({ w: 1.7, bead: true, ticks: 4 }));
st.setProperty('--rim-knob', rim({ w: 5, bead: false }));
[0, 90, 180, 270].forEach((r, i) => { st.setProperty('--c' + i, corner(r)); st.setProperty('--cr' + i, corner(r, '#e2334a')); });

// ── 내용 ────────────────────────────────────────────────────────────
const T = {
  hero: { name: '카엘', lv: 12, cls: '바람길 추적자', hp: 1840, hpMax: 2400, st: 62 },
  stage: '잿빛 마을 · 마당',
  quest: { tag: '주 임무', name: '마당의 문을 열어라', lines: [['해골 병사 처치', '2/5']] },
  boss: { name: '돌날개 문지기', sub: '깨어난 석상', lv: 15, hp: 64 },
  toast: { name: '밤늑대 송곳니', n: 2, verb: '획득', ic: 'm_fang' },
  acts: [['attack', '공격'], ['jump', '점프'], ['dash', '대시'], ['s1', '회오리 베기'], ['s2', '세 갈래 베기'], ['ult', '붉은 달'], ['swap', '교대'], ['mount', '탑승'], ['guard', '막기'], ['lock', '조준']],
  sys: [['auto', '자동'], ['map', '지도'], ['bag', '가방'], ['menu', '메뉴']],
  dlg: ['문이 잠겼군. 석상이 깨어나기 전에 열쇠부터 찾아야겠어.', '바람이 골목 안쪽에서 불어온다. 놈들이 지나간 길이 아직 식지 않았어.', '좋아, 붉은 달이 지기 전에 끝내자.'],
  tabs: ['장비', '가방', '기술', '임무', '설정'],
  eq: [['sword_5', '무기', '은월 사냥검', '+3', 3], ['', '머리', '비어 있음', '', 0], ['body_3', '몸통', '청록 비늘 조끼', '+1', 3], ['cloak_3', '망토', '붉은 밤 망토', '+2', 2], ['amulet_3', '목걸이', '송곳니 목걸이', '', 1], ['ring_3', '반지', '달조각 반지', '', 4]],
  bag: [['sword_5', 3, ''], ['m_fang', 1, '12'], ['potion_hp', 2, '5'], ['m_herb', 1, '23'], ['bone', 1, '8'], ['gem_crystal', 4, '1'], ['body_3', 2, ''], ['key', 3, '1'],
    ['dagger_3', 1, ''], ['ring_3', 4, ''], ['potion_mp', 1, '9'], ['cloak_3', 2, ''], ['head_3', 2, ''], ['coin', 1, '40'], ['stone_3', 4, '36'], ['scroll_protect', 2, '4'], ['rift_lantern', 3, '1'], ['sub_cross', 3, '3']],
  item: { ic: 'sword_5', name: '은월 사냥검', rar: '희귀 · 한손검', stats: [['공격력', '+48', '▲12'], ['치명 확률', '+6%', ''], ['공격 속도', '빠름', '']],
    desc: '달빛에 벼린 은날. 밤의 것을 벨 때마다 칼등의 붉은 보석이 한 번씩 숨을 쉰다.' },
  stats: [['공격력', '312'], ['방어력', '148'], ['생명력', '2,400'], ['치명', '18%']],
};
const num = (n) => n.toLocaleString('en-US');
const LOCK = '<svg class="lk" viewBox="0 0 16 16"><path d="M4.500 7.500V5.500a3.500 3.500 0 0 1 7 0v2" fill="none" stroke="#e9edf5" stroke-width="1.600"/><rect x="3" y="7.300" width="10" height="7" rx="1.600" fill="#e9edf5"/><circle cx="8" cy="10.800" r="1.300" fill="#10121c"/></svg>';
export const abtn = (id, lb, cls = '', extra = '') => `<button class="abtn ${cls}" id="b-${id}" data-k="${id}"><i class="gl"></i><i class="rim"></i><i class="prog"></i><img class="ico ink" src="${IC(id)}" alt=""><i class="cd"></i><b class="ct ink"></b><i class="gem"></i>${extra}<span class="lb">${lb}</span></button>`;

function build() {
  const h = T.hero, q = T.quest, b = T.boss;
  const acts = T.acts.map(([id, lb]) => abtn(id, lb, '', id === 'mount' ? LOCK : '')).join('');
  const sys = T.sys.map(([id, lb]) => `<button class="sbtn" id="s-${id}" data-k="${id}"><i class="gl"></i><i class="rim"></i><img class="ico ink" src="${IC(id)}" alt=""><span class="lb">${lb}</span>${id === 'bag' ? '<b class="bd ink">3</b>' : ''}</button>`).join('');
  const cells = Array.from({ length: 40 }, (_, i) => { const c = T.bag[i]; return c ? `<button class="cell r${c[1]}${i === 0 ? ' sel' : ''}"><i class="fr"></i><img src="${IT(c[0])}" alt="">${c[2] ? `<b>${c[2]}</b>` : ''}</button>` : '<button class="cell empty"><i class="fr"></i></button>'; }).join('');
  const eq = T.eq.map(([k, part, nm, plus, r]) => `<button class="slot r${r}${r ? '' : ' empty'}"><span class="si">${k ? `<img src="${IT(k)}" alt="">` : ''}</span><span class="sp">${part}</span><span class="sn">${nm}</span>${plus ? `<b class="pl">${plus}</b>` : ''}</button>`).join('');
  return `
<div id="bg"></div><div id="shade"></div>
<div id="hud">
  <div id="hero"><div class="pt"><img src="kael3_face.webp" alt=""><i class="rim"></i><b class="lv ink">${h.lv}</b></div>
    <div class="hi"><div class="hn ink"><b class="nm">${h.name}</b><span class="cls">${h.cls}</span><span class="num">${num(h.hp)}<em> / ${num(h.hpMax)}</em></span></div>
      <div class="hp bar"><i class="ch"><i class="lag" style="width:${(h.hp / h.hpMax * 100 + 7).toFixed(1)}%"></i><i class="fill" style="width:${(h.hp / h.hpMax * 100).toFixed(1)}%"></i><i class="seg"></i></i></div>
      <div class="st bar"><i class="ch"><i class="fill" style="width:${h.st}%"></i></i></div></div></div>
  <div id="sys">${sys}</div>
  <div id="mini"><i class="gl"></i><svg viewBox="0 0 100 100" class="mm"><path class="mf" d="M18 14h64v48H60v34H40V62H18z"/><path class="mw" d="M18 14h26M56 14h26v48H60v34M40 96V62H18V14"/><path class="mg" d="M44 14h12"/>
    <circle class="me" cx="36" cy="40" r="3"/><circle class="me" cx="64" cy="40" r="3"/><circle class="me" cx="50" cy="29" r="3"/><circle class="me" cx="28" cy="24" r="3"/><circle class="me" cx="72" cy="24" r="3"/>
    <path class="mo" d="M50 8l4.500 6-4.500 6-4.500-6z"/><path class="mh" d="M50 43l6 11-6-2.800-6 2.800z"/></svg><i class="rim"></i><i class="gem"></i><span class="mn ink">${T.stage}</span></div>
  <div id="quest"><img class="qi ink" src="${IC('quest')}" alt=""><div class="qb ink"><div class="qt">${q.tag}</div><div class="qn">${q.name}</div>${q.lines.map(([t, c]) => `<div class="ql"><span>${t}</span><b>${c}</b></div>`).join('')}</div></div>
  <div id="boss"><div class="bn ink"><i class="dia"></i><b>${b.name}</b><i class="dia"></i></div><div class="bbar bar"><i class="ch"><i class="lag" style="width:${b.hp + 6}%"></i><i class="fill" style="width:${b.hp}%"></i><i class="seg"></i></i></div><i class="bgem"></i><div class="bs ink"><span>${b.sub} · Lv.${b.lv}</span><b>${b.hp}%</b></div></div>
  <div id="toast"><span class="ti"><img src="${IT(T.toast.ic)}" alt=""></span><span class="tt ink"><b>${T.toast.name}</b> ×${T.toast.n} <em>${T.toast.verb}</em></span></div>
  <span class="dmg d1 ink">128</span><span class="dmg d2 crit ink"><em>치명</em>342</span><span class="dmg d3 ink">96</span><span class="dmg d4 hurt ink">-45</span>
  <div id="stick"><i class="gl"></i><i class="rim"></i><i class="knob"></i></div>
  <div id="acts">${acts}</div>
</div>
<div id="dlg"><div class="dbox"><i class="fr"></i><p class="dt"></p><i class="dnext"></i></div><div class="dp"><img src="kael3_bust.webp" alt=""><i class="fr"></i><i class="gem"></i></div><div class="dn"><i class="fr"></i><b>${h.name}</b><span>${h.cls}</span></div><button class="dskip"><span>건너뛰기</span></button></div>
<div id="menu"><i class="veil"></i>
  <div class="mh"><div class="mtitle"><img src="${IC('menu')}" alt=""><b>사냥 수첩</b></div><div class="mtabs">${T.tabs.map((t, i) => `<button class="${i === 0 ? 'on' : ''}"><span>${t}</span></button>`).join('')}</div>
    <div class="mcur"><span class="c1"><img src="${IT('coin')}" alt="">12,480</span><span class="c2"><i class="gem"></i>36</span></div><button class="mclose" aria-label="닫기"><i class="gl"></i><i class="rim"></i><svg viewBox="0 0 24 24"><path d="M7 7l10 10M17 7L7 17"/></svg></button></div>
  <div class="mb">
    <div class="mchar pn"><i class="fr"></i><div class="mpt"><img src="kael3_bust.webp" alt=""></div><div class="mcn"><b>${h.name}</b><span>Lv.${h.lv} · ${h.cls}</span></div><ul class="mstat">${T.stats.map(([k, v]) => `<li>${k}<b>${v}</b></li>`).join('')}</ul></div>
    <div class="meq pn"><i class="fr"></i><h3><span>착용 중</span></h3><div class="slots">${eq}</div></div>
    <div class="mgrid pn"><i class="fr"></i><h3><span>가방</span><em>18 / 40</em></h3><div class="cells">${cells}</div></div>
    <div class="mdet pn"><i class="fr"></i><div class="dh"><span class="di r3"><img src="${IT(T.item.ic)}" alt=""></span><div><b>${T.item.name}</b><span class="rar">${T.item.rar}</span></div></div>
      <ul class="ds">${T.item.stats.map(([k, v, d]) => `<li>${k}<b>${v}</b>${d ? `<em>${d}</em>` : ''}</li>`).join('')}</ul><p class="dd">${T.item.desc}</p>
      <div class="dbtn"><button class="pri"><i class="gem"></i><span>장착</span></button><button><span>강화</span></button><button class="ghost"><span>버리기</span></button></div></div>
  </div>
</div>
<div id="views"><button data-v="play">전투</button><button data-v="dialog">대화</button><button data-v="menu">가방</button></div>`;
}

const app = document.getElementById('app');
if (app) {
  app.innerHTML = build();
  let view = Q.get('view') || 'play', line = 0;
  const $ = (s) => app.querySelector(s);
  const setView = (v) => {
    view = v;
    const d = dev();
    const bg = Q.get('bg') || (v === 'dialog' ? 'street' : 'yard');
    app.className = `v-${v} ${d} bg-${bg}${SHOT ? ' shot' : ''}${Q.get('hide') ? ' hide-' + Q.get('hide') : ''}`;
    $('#bg').style.backgroundImage = `url(${BGDIR}${d === 'fold' ? 'fold_open' : 'phone2'}_${bg}.webp)`;
    if (v === 'dialog') $('.dt').textContent = T.dlg[line % T.dlg.length];
  };
  setView(view);
  addEventListener('resize', () => setView(view));

  // 보여 주기용 상태: 점프 = 눌림, 기술 2 = 재사용 대기(테가 차오른다), 궁극기 = 다 참, 탑승 = 잠김, 조준 = 켜짐
  const set = (id, cdp, ct) => { const e = $('#b-' + id); e.style.setProperty('--cdp', cdp); e.querySelector('.ct').textContent = ct; e.classList.toggle('cool', cdp > 0); };
  set('s2', 58, '3'); $('#b-ult').classList.add('full'); $('#b-mount').classList.add('off'); $('#b-lock').classList.add('on'); $('#b-jump').classList.add('held');

  const stick = $('#stick'), knob = $('#stick .knob');
  let sid = null;
  const moveKnob = (e) => { const r = stick.getBoundingClientRect(), R = r.width * 0.3; let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2); const m = Math.hypot(dx, dy); if (m > R) { dx *= R / m; dy *= R / m; } knob.style.transform = `translate(${dx}px,${dy}px)`; };
  stick.addEventListener('pointerdown', (e) => { sid = e.pointerId; try { stick.setPointerCapture(sid); } catch { /* 합성 이벤트 */ } stick.classList.add('pr'); moveKnob(e); });
  stick.addEventListener('pointermove', (e) => { if (e.pointerId === sid) moveKnob(e); });
  const up = (e) => { if (e.pointerId === sid) { sid = null; stick.classList.remove('pr'); knob.style.transform = ''; } };
  stick.addEventListener('pointerup', up); stick.addEventListener('pointercancel', up);
  app.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('.abtn,.sbtn,.cell,.slot,.mtabs button,.dbtn button,.mclose,#views button,.dskip');
    if (!b) { if (view === 'dialog' && e.target.closest('#dlg')) { line++; if (line >= T.dlg.length) { line = 0; setView('play'); } else setView('dialog'); } return; }
    b.classList.add('pr'); setTimeout(() => b.classList.remove('pr'), 180);
    if (b.matches('#views button')) setView(b.dataset.v);
    else if (b.matches('.sbtn')) { if (b.dataset.k === 'bag' || b.dataset.k === 'menu') setView('menu'); else b.classList.toggle('on'); }
    else if (b.matches('.mclose')) setView('play');
    else if (b.matches('.dskip')) { line = 0; setView('play'); }
    else if (b.matches('.mtabs button')) app.querySelectorAll('.mtabs button').forEach((x) => x.classList.toggle('on', x === b));
    else if (b.matches('.cell')) app.querySelectorAll('.cell').forEach((x) => x.classList.toggle('sel', x === b));
    else if (b.matches('.abtn')) {
      const k = b.dataset.k;
      if (k === 'lock' || k === 'guard') b.classList.toggle('on');
      if ((k === 's1' || k === 's2') && !b.classList.contains('cool')) { const t0 = performance.now(), D = 4000; const step = (t) => { const p = 1 - (t - t0) / D; if (p <= 0) { set(k, 0, ''); return; } set(k, p * 100, String(Math.ceil(p * D / 1000))); requestAnimationFrame(step); }; requestAnimationFrame(step); }
    }
  });

  // 검사용: 눌리는 것들의 크기·겹침·넓이 (render.mjs 가 부른다)
  window.__ui = {
    measure() {
      const vis = (e) => { const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false; let p = e.parentElement; while (p && p !== app) { if (getComputedStyle(p).display === 'none') return false; p = p.parentElement; } const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const R = (e) => { const r = e.getBoundingClientRect(); return { id: e.id || e.className.split(' ')[0] + (e.dataset.k ? ':' + e.dataset.k : ''), x: +r.left.toFixed(1), y: +r.top.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };
      const touch = [...app.querySelectorAll('.abtn,.sbtn,.cell,.slot,.mtabs button,.dbtn button,.mclose,.dskip,#stick')].filter(vis).map(R);
      const blocks = [...app.querySelectorAll('#hero,#sys,#mini,#quest,#boss,#toast,#stick,.abtn,.dbox,.dp,.dn,.dskip')].filter(vis).map(R);
      const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      const isBtn = (r) => /^b-/.test(r.id), dlgPart = (r) => /^(dbox|dp|dn)$/.test(r.id);
      const overlaps = [];
      for (let i = 0; i < blocks.length; i++) for (let j = i + 1; j < blocks.length; j++) {
        const a = blocks[i], b = blocks[j];
        if (dlgPart(a) && dlgPart(b)) continue;   // 대화 상자·초상·이름표는 일부러 겹쳐 놓는다
        if (isBtn(a) && isBtn(b)) { const d = Math.hypot(a.x + a.w / 2 - b.x - b.w / 2, a.y + a.h / 2 - b.y - b.h / 2); if (d < (a.w + b.w) / 2 + 2) overlaps.push([a.id, b.id, +d.toFixed(1)]); }
        else if (hit(a, b)) overlaps.push([a.id, b.id]);
      }
      const W = innerWidth, H = innerHeight;
      const reach = touch.filter(isBtn).map((r) => ({ id: r.id, d: +Math.hypot(W - (r.x + r.w / 2), H - (r.y + r.h / 2)).toFixed(0) }));
      const out = blocks.filter((r) => r.x < 0 || r.y < 0 || r.x + r.w > W || r.y + r.h > H).map((r) => r.id);
      const cx0 = W * 0.2, cy0 = H * 0.2, cw = W * 0.6, ch = H * 0.6; let cover = 0;
      for (const r of blocks) { const ox = Math.max(0, Math.min(r.x + r.w, cx0 + cw) - Math.max(r.x, cx0)), oy = Math.max(0, Math.min(r.y + r.h, cy0 + ch) - Math.max(r.y, cy0)); cover += ox * oy; }
      let area = 0; for (const r of blocks) area += r.w * r.h;
      let minFont = 99, minFontWho = '';
      for (const e of app.querySelectorAll('*')) { if (![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue; if (!vis(e)) continue; const f = parseFloat(getComputedStyle(e).fontSize); if (f > 0 && f < minFont) { minFont = f; minFontWho = (e.className || e.tagName) + ':' + e.textContent.trim().slice(0, 8); } }
      const sizes = {}; for (const r of touch) if (isBtn(r) || /^s-|stick/.test(r.id)) sizes[r.id] = Math.min(r.w, r.h);
      return { W, H, minTouch: Math.min(...touch.map((r) => Math.min(r.w, r.h))), small: touch.filter((r) => Math.min(r.w, r.h) < 44).map((r) => `${r.id} ${r.w}x${r.h}`), overlaps, out, reachMax: Math.max(0, ...reach.map((r) => r.d)), reachWho: (reach.sort((a, b) => b.d - a.d)[0] || {}).id, centerCoverPct: +(cover / (cw * ch) * 100).toFixed(1), hudAreaPct: +(area / (W * H) * 100).toFixed(1), n: touch.length, minFont, minFontWho, sizes };
    },
    setView,
  };
} else {
  window.__gem = { IC, IT, abtn, LOCK };   // sheet.html · strip.html 이 같은 버튼 마크업을 쓴다
}
