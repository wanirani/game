// 무한의 탑 방 풀 검증 (src/data/tower.js towerRooms):
//   node tools/tower_rooms.mjs [--list] [--keep]
// 풀의 방마다 걷어 낸 사본(towerRoom)을 만들고, 땅 자리(적이 떨어져 서는 칸)마다 문 'D' 를 둔 검증용 STAGES 를 이 파일이 내보낸다.
// 실행하면 tools/validate_maps.mjs --stages tools/tower_rooms.mjs 로 같은 검사(행 길이·P·기믹 문자·도달성 BFS)를 돌린다 —
// '문 (x,y) 도달 불가' = 시작 위치에서 닿을 수 없는 땅 자리 (tower.js SLOT_DENY / ROOM_DENY 로 거른다). 오류 0 이어야 한다.
// --list: 방마다 크기·땅 자리·날개 자리 수 표
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { STAGES as GAME, STAGE_ORDER } from '../src/data/stages.js';
import { towerRooms, towerRoom } from '../src/data/tower.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** 검증용 STAGES: 스테이지마다 'tw_<sid>', 방 = 걷어 낸 사본 + 땅 자리마다 'D' (next 는 자기 자신) */
function build() {
  const out = {};
  for (const r of towerRooms(GAME, STAGE_ORDER)) {
    const T = towerRoom(GAME, r.sid, r.rid);
    const rows = T.room.map.map((s) => [...s]);
    for (const s of T.slots) if (s.ground && rows[s.gy]?.[s.tx] === ' ') rows[s.gy][s.tx] = 'D';
    const st = (out[`tw_${r.sid}`] ??= { id: `tw_${r.sid}`, chapter: 0, name: `탑 ${r.sid}`, start: r.rid, rooms: {}, docs: [], liquid: GAME[r.sid].liquid, theme: GAME[r.sid].theme, tileStyle: GAME[r.sid].tileStyle });
    st.rooms[r.rid] = { ...T.room, map: rows.map((x) => x.join('')), next: r.rid, enemies: undefined };
  }
  return out;
}
export const STAGES = build();

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const rooms = towerRooms(GAME, STAGE_ORDER);
  if (process.argv.includes('--list')) {
    console.table(rooms.map((r) => { const T = towerRoom(GAME, r.sid, r.rid); return { key: r.key, W: T.room.map[0].length, H: T.room.map.length, ground: T.ground, air: T.slots.length - T.ground }; }));
  }
  const p1 = rooms.filter((r) => +r.sid.slice(1) <= 13).length;
  console.log(`무한의 탑 방 풀: ${rooms.length}방 (1부 ${p1} · 2부 ${rooms.length - p1}), 땅 자리 ${rooms.reduce((a, r) => a + towerRoom(GAME, r.sid, r.rid).ground, 0)}개`);
  const res = spawnSync(process.execPath, [path.join(HERE, 'validate_maps.mjs'), '--stages', fileURLToPath(import.meta.url)], { encoding: 'utf8' });
  const lines = (res.stdout ?? '').split('\n');
  console.log(lines.filter((l) => /✗|!|오류/.test(l) || l.startsWith('■')).join('\n'));
  process.exit(res.status ?? 1);
}
