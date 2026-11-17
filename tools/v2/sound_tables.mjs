// v2 타격감 표 → 마크다운 표 (docs/v2/SOUND_FEEL.md §3·§6·§7 의 표를 다시 뽑을 때): node tools/v2/sound_tables.mjs
const T = await import('../../src/v2/feel/table.js');
const names = (ls) => (ls || []).map((l) => ({ o: '', n: '★', s: '~' })[l.k] + l.n).join(' + ') || '—';
let o = '';
o += '| 세기 | 경직 | 흔들림 | 밀림 | 줌 | 음악 낮춤 | 소리 크기 | 꼬리 늦춤 | 진동 |\n|---|---|---|---|---|---|---|---|---|\n';
for (const k of T.STRENGTHS) { const s = T.STRENGTH[k]; o += `| ${k} | ${(s.stop * 1000).toFixed(0)} ms | ${s.shake} | ${s.kick} | ${s.zoom > 1 ? s.zoom + '× / ' + s.zoomT + 's' : '—'} | ${s.duck ? s.duck[0] + ' / ' + s.duck[1] + 's' : '—'} | ${s.gain} | ${(s.tailAt * 1000).toFixed(0)} ms | ${s.haptic} |\n`; }
o += '\n| 무기 | 이름 | 경직 배율 | 휘두름→닿음 | 베는 무기 | 휘두름 (H) | 순간음 (H) |\n|---|---|---|---|---|---|---|\n';
for (const k of T.WEAPONS) { const w = T.WEAPON[k]; o += `| \`${k}\` | ${w.label} | ×${w.stopK} | ${(w.lead * 1000).toFixed(0)} ms | ${w.cut ? '예' : '아니오'} | ${names(w.whoosh.H)} | ${names(w.trans.H)} |\n`; }
o += '\n| 재질 | 이름 | 경직 배율 | 불티 | 몸통 | 꼬리 | 죽을 때 |\n|---|---|---|---|---|---|---|\n';
for (const k of T.MATERIALS) { const m = T.MATERIAL[k]; o += `| \`${k}\` | ${m.label} | ×${m.stopK} | ${m.spark} | ${names(m.body)} | ${names(m.tail)} | ${names(m.die)} |\n`; }
o += '\n| 덧붙임 | 비트 | 소리 | 경직 | 흔들림 | 줌 | 느린 화면 | 음악 낮춤 | 진동 |\n|---|---|---|---|---|---|---|---|---|\n';
for (const k in T.MOD) { const m = T.MOD[k]; o += `| \`${k}\` | ${T.FLAG[k]} | ${names(m.add || m.only)}${m.only ? ' (몸통·꼬리 대신)' : ''} | ${m.stop != null ? '= ' + (m.stop * 1000).toFixed(0) + ' ms' : ''}${m.stopAdd ? '+' + (m.stopAdd * 1000).toFixed(0) + ' ms' : ''} | ${m.shake != null ? '= ' + m.shake : ''}${m.shakeAdd ? '+' + m.shakeAdd : ''} | ${m.zoom ? m.zoom + '× / ' + (m.zoomT || 0) + 's' : '—'} | ${m.slow ? m.slow[0] + 's @ ' + m.slow[1] + '×' : '—'} | ${m.duck ? m.duck[0] + ' / ' + m.duck[1] + 's' : '—'} | ${m.haptic || '—'} |\n`; }
o += '\n| 진동 | 패드 (강 / 약 / ms) | 휴대폰 (ms) |\n|---|---|---|\n';
for (const k in T.HAPTIC) { const h = T.HAPTIC[k]; o += `| \`${k}\` | ${h.pad.join(' / ')} | ${h.phone ? JSON.stringify(h.phone) : '없음'} |\n`; }
o += '\n| 사건 이름 | 묶음 | 층 (★ 새 샘플 · ~ 합성) | 크기 | 진동 | 추천 연출 |\n|---|---|---|---|---|---|\n';
for (const k of T.EVENT_NAMES) { const e = T.EVENTS[k]; const fx = [e.stop ? `경직 ${(e.stop * 1000).toFixed(0)} ms` : '', e.shake ? `흔들림 ${e.shake}` : '', e.zoom ? `줌 ${e.zoom}×/${e.zoomT}s` : '', e.duck ? `음악 ${e.duck[0]}/${e.duck[1]}s` : ''].filter(Boolean).join(' · '); o += `| \`${k}\` | ${e.bus.slice(3)} | ${e.loop ? '고리 버퍼 `' + e.loop + '`' : k.startsWith('bell.') && k !== 'bell.toll' ? '★종 ' + e.layers.length + '음' : names(e.layers)} | ${e.gain} | ${e.haptic || '—'} | ${fx || '—'} |\n`; }
o += '\n| 가락 | 이름 | 뜻 | 음 (D4 기준 반음 @ 초) |\n|---|---|---|---|\n';
for (const k of T.BELLS) { const b = T.BELL[k]; o += `| \`${k}\` | ${b.label} | ${b.text} | ${b.notes.map(([s, t]) => `${s >= 0 ? '+' : ''}${s}@${t}`).join(' ')} |\n`; }
// 예: 조합 몇 개의 최종값
o += '\n| 예 | 경직 | 흔들림 | 줌 | 느린 화면 | 진동 | 층 수 (낮음/보통/높음) |\n|---|---|---|---|---|---|---|\n';
for (const [w, m, s, f, lab] of [['dagger', 'flesh', 'L', 0, '단검 · 살 · 약'], ['sword', 'bone', 'M', 0, '한손검 · 뼈 · 중'], ['sword', 'armor', 'H', 0, '한손검 · 갑옷 · 강'], ['sword', 'bone', 'H', 1, '한손검 · 뼈 · 강 + 치명타'], ['great', 'stone', 'F', 0, '대검 · 돌 · 끝'], ['blunt', 'armor', 'F', 3, '둔기 · 갑옷 · 끝 + 치명타 + 처치'], ['great', 'bone', 'F', 18, '대검 · 뼈 · 끝 + 마무리 일격'], ['sword', 'armor', 'M', 4, '막힘'], ['sword', 'armor', 'H', 8, '받아치기']]) {
  const r = T.hitFeel(w, m, s, f); o += `| ${lab} | ${(r.stop * 1000).toFixed(0)} ms | ${r.shake} | ${r.zoom > 1 ? r.zoom + '×/' + r.zoomT + 's' : '—'} | ${r.slow ? r.slow[0] + 's @ ' + r.slow[1] + '×' : '—'} | ${r.haptic} | ${[0, 1, 2].map((q) => r.layers.filter((l) => l.q <= q).length).join(' / ')} |\n`; }
console.log(o);
