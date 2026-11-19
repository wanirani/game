#!/bin/bash
# 지난 출시들의 저장이 지금 나무에서 읽히고 이어지는가 — 소유자의 기기에는 지난 판의 저장이 남아 있다.
#   bash tools/v2/release/old_saves.sh <기록 폴더> [묶음:번호 …]      예: apk11:013 apk12:073 (묶음 없이 번호만 쓰면 apk11)      결과: <폴더>/summary.txt (끝줄 ALLDONE)
#   목록이 없으면 모든 묶음의 모든 저장.
# 저장마다 이야기 봇(tools/v2/chapter_audit.mjs --from <저장>)이 SECS(기본 75)초 동안 이어 플레이한다. 읽는 법: 줄마다 exit=0 · beats-run 1 이상 · errors=0 · lost=0.
# helps 는 0 이어야 하지만 봇 탓일 수도 있다 — 도움이 난 저장은 한 번 더 돌려 보고(같은 자리면 게임 쪽), 까닭을 읽는다
#   (예: 쓰러져 다른 지역의 쉼터에서 일어난 뒤 봇이 길을 되짚지 못함, 저장 뒤에 세계가 바뀐 자리에서 봇의 박자 순서가 안 맞음 — 2026-11-19 의 두 건).
# 저장 묶음: tools/v2/fixtures/saves_apk11/ (APK 11 무렵의 봇 저장 14개), saves_apk12/ (APK 12 = 커밋 6ba79c0 의 봇 저장 17개: 맺음 뒤 저장 포함).
# 출시할 때마다 그 판의 저장 한 벌을 saves_apk<n>/ 으로 더한다.
cd "$(dirname "$0")/../../.." || exit 2
O=${1:?기록 폴더}; shift
F=tools/v2/fixtures
rm -rf "$O"; mkdir -p "$O"
LIST=${*:-$(for d in $F/saves_apk*/; do k=$(basename "$d" | sed 's/^saves_//'); for f in "$d"*.json; do echo "$k:$(basename "$f" | sed 's/_.*//')"; done; done | tr '\n' ' ')}
for t in $LIST; do
  case "$t" in *:*) k=${t%%:*}; n=${t##*:};; *) k=apk11; n=$t;; esac
  f=$(ls $F/saves_$k/${n}_*.json 2>/dev/null | head -1); [ -z "$f" ] && { echo "$t: no such save FAIL ::" >> "$O/summary.txt"; continue; }
  b=${k}_$(basename "$f" .json); cp "$f" "$O/$b.json"
  timeout 400 node tools/v2/chapter_audit.mjs --out "$O/$b" --from "$O/$b.json" --max-seconds ${SECS:-75} > "$O/$b.log" 2>&1; ex=$?
  node -e "
    const fs=require('fs');let t=null;try{t=JSON.parse(fs.readFileSync('$O/$b/table.json','utf8'));}catch(e){}
    const log=fs.readFileSync('$O/$b.log','utf8').split('\n').filter(l=>/ ran  /.test(l));
    const last=log.length?log[log.length-1].replace(/events.*\]/,'').replace(/^\S+ ran +/,'').slice(0,100):'(no beat ran)';
    const errs=t?(t.errors||[]).filter(e=>!/^\[tool\]/.test(String(e.msg||e.text||e))):[];
    console.log('$b exit=$ex beats-run='+log.length+' helps='+(t?t.helps.length:'?')+' errors='+(t?errs.length:'?')+' lost='+(t?(t.lost||[]).length:'?')+' '+(($ex===0)&&t&&log.length>0&&errs.length===0&&!(t.lost||[]).length?(t.helps.length?'HELPED':'OK'):'FAIL')+' :: '+last);
    if(t)for(const h of t.helps)console.log('    help ['+h.beat+'] '+String(h.reason).slice(0,300)+' — '+String(h.what).slice(0,120));
    for(const e of errs.slice(0,3))console.log('    error '+JSON.stringify(e).slice(0,300));
  " >> "$O/summary.txt" 2>&1
done
echo "old saves: $(grep -c ' OK ::' "$O/summary.txt") ok, $(grep -c ' HELPED ::' "$O/summary.txt") helped, $(grep -c ' FAIL ::' "$O/summary.txt") failed of $(echo $LIST | wc -w)" >> "$O/summary.txt"
echo ALLDONE >> "$O/summary.txt"
