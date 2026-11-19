#!/bin/bash
# 3D 판 출시 전 점검 묶음 — 본 세션이 「갈래가 하나도 돌지 않는 깨끗한 나무」에서 돌린다 (브라우저는 한 번에 하나).
#   bash tools/v2/release/pre_chain.sh [결과 폴더, 기본 /tmp/claude-0/v2/pre]        (CH_TO=<사건 id> 로 1장 봇이 갈 곳을 바꾼다, 기본 ev_ending_home = 맺음까지)
# 결과: <폴더>/steps.txt (끝줄 ALLDONE), 단계별 로그는 그 옆. 70분쯤 걸린다 (처리 장치 4개 기준).
# 읽는 법: 모든 줄이 exit=0 · "first15 beats-not-run=0 OK" · "chapter reached=true … helps=0 … OK" · "old saves: N ok, 0 helped, 0 failed" 여야 낸다.
#   - 지난 판의 저장(old saves): 소유자의 기기에 남아 있는 저장이 새 판에서 읽히고 이어져야 한다 (tools/v2/release/old_saves.sh, 저장은 tools/v2/fixtures/).
#   - game_story first15 는 건너뛴 박자가 있어도 "ALL OK" 를 찍는다 → beats-not-run 이 0 이 아니면 실패로 읽고 그 단계만 다시 돌린다.
#   - 1장 봇의 도움(help)이 「체력이 낮아 달아났다」류면 봇의 흔들림이다: 그 구간을 저장에서 다시 돌려 0 이면 통과로 본다 (막힌 길이면 결함).
cd "$(dirname "$0")/../../.." || exit 2
L=${1:-/tmp/claude-0/v2/pre}
mkdir -p "$L"
: > "$L/steps.txt"
step() { echo "== $(date -u +%H:%M:%S) $1" >> "$L/steps.txt"; }
run() { name=$1; shift; step "$name start"; timeout 1800 "$@" > "$L/$name.log" 2>&1; echo "exit=$? ($name)" >> "$L/steps.txt"; }
step "head $(git rev-parse --short HEAD) dirty=$(git status --porcelain | wc -l)"
run folds        node tools/v2/world_folds.mjs --check
run validate     node tools/v2/world_validate.mjs
run verify_node  node tools/v2/world_verify_node.mjs
run fence_node   node tools/v2/world_fence_node.mjs
run rules        node tools/v2/play_rules_test.mjs
run motion       node tools/v2/play_motion_check.mjs
run whip         node tools/v2/whip_check.mjs
run story_check  node tools/v2/story_check.mjs
run chapter_reach node tools/v2/chapter_reach.mjs                              # 이야기의 자리 증명(잠긴 문 · 종탑 문 · 납골당 구획 · 사람이 시작 자리에 서지 않음)
run fx_link      node tools/v2/fx_sound_link.mjs
run fonts        python3 tools/fonts/build_fonts.py --check
run story_boot    node tools/v2/game_story.mjs --plan boot    --out "$L/story"
run story_first15 node tools/v2/game_story.mjs --plan first15 --out "$L/story"
nr=$(grep -o "beats not run [0-9]*" "$L/story_first15.log" | tail -n 1 | grep -o "[0-9]*$"); echo "first15 beats-not-run=${nr:-?} $( [ "${nr:-1}" = "0" ] && echo OK || echo FAIL )" >> "$L/steps.txt"
run story_saves   node tools/v2/game_story.mjs --plan saves   --out "$L/story"
run story_edges   node tools/v2/game_story.mjs --plan edges   --out "$L/story"
run story_cross30 node tools/v2/game_story.mjs --plan cross30 --out "$L/story"
run cross_edge    node tools/v2/cross_edge.mjs --out "$L/cross_edge"
run break_check   node tools/v2/break_check.mjs
run owner_fix     node tools/v2/owner_fix_check.mjs --out "$L/ownerfix"   # the owner's reports of 2026-11-18: pieces at a full gauge, sleepers facing and waking
run whip_press    node tools/v2/whip_press.mjs --out "$L/whip_press"        # 입력 기억: 규칙의 전 · 후 표 + 패드의 포인터 처리기로 게임 시간에 누름 (PLAY_API 1.1)
run smoke         node tools/smoke.mjs
run p0_entry      node tools/v2/p0_entry_check.mjs
run world_check   node tools/v2/world_check.mjs
run game_check    node tools/v2/game_check.mjs --devices fold_open
# 1장 봇: 깨끗한 저장에서 정직한 입력으로 CH_TO 사건까지 (500초씩 끊어서 이어 간다)
CH_TO=${CH_TO:-ev_ending_home}
C="$L/chapter"; rm -rf "$C"; mkdir -p "$C"
step "chapter start (to $CH_TO)"
timeout 1200 node tools/v2/chapter_audit.mjs --out "$C" --to "$CH_TO" --max-seconds 500 > "$L/chapter_1.log" 2>&1; echo "exit=$? (chapter_1)" >> "$L/steps.txt"
i=1
while [ $i -lt 10 ]; do
  if node -e "const t=JSON.parse(require('fs').readFileSync('$C/table.json','utf8'));process.exit(t.rows['$CH_TO']?0:1)" 2>/dev/null; then break; fi
  i=$((i+1))
  timeout 1200 node tools/v2/chapter_audit.mjs --out "$C" --from last --to "$CH_TO" --max-seconds 500 > "$L/chapter_$i.log" 2>&1; echo "exit=$? (chapter_$i)" >> "$L/steps.txt"
done
node -e "const t=JSON.parse(require('fs').readFileSync('$C/table.json','utf8'));const ok=!!t.rows['$CH_TO'];const errs=(t.errors||[]).filter(e=>!/^\[tool\]/.test(String(e.msg||e.text||e)));console.log('chapter reached='+ok+' rows='+Object.keys(t.rows).length+' helps='+t.helps.length+' page-errors='+errs.length+' (all '+(t.errors||[]).length+') context-lost='+(t.lost||[]).length+' '+(ok&&t.helps.length===0&&errs.length===0?'OK':'FAIL'));for(const h of t.helps)console.log('  help ['+h.beat+'] '+h.reason+' — '+h.what)" >> "$L/steps.txt" 2>&1
# 여왕의 구간 · 쉼터: 방금 봇이 쓴 「달아난 뒤」 저장에서 불러오기 · 건넘 · 나갔다 오기 · 쓰러짐 (28 검사)
F=$(ls "$C"/saves/*_ev_boss_flee.json 2>/dev/null | tail -n 1)
if [ -n "$F" ]; then run chapter_states node tools/v2/chapter_states.mjs --save "$F" --out "$L/states"; else echo "exit=9 (chapter_states: no save after ev_boss_flee in $C/saves)" >> "$L/steps.txt"; fi
# 지난 판들의 저장 열두 개(APK 11 셋 · APK 12 넷 · APK 13 다섯)를 읽혀 45초씩 이어 플레이
step "old saves start"
SECS=${OLD_SECS:-45} bash tools/v2/release/old_saves.sh "$L/old_saves" ${OLD_LIST:-apk11:032 apk11:064 apk11:074 apk12:038 apk12:055 apk12:073 apk12:080 apk13:021 apk13:046 apk13:066 apk13:075 apk13:082} > "$L/old_saves.log" 2>&1; echo "exit=$? (old_saves)" >> "$L/steps.txt"
tail -n 2 "$L/old_saves/summary.txt" | head -n 1 >> "$L/steps.txt"
step "head-after $(git rev-parse --short HEAD) dirty=$(git status --porcelain | wc -l)"
step "ALLDONE"
