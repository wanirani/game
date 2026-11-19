#!/bin/bash
# 지난 출시(APK 11, 커밋 55448b3 무렵)의 저장이 지금 나무에서 읽히고 이어지는가 — 소유자의 기기에는 지난 판의 저장이 남아 있다.
#   bash tools/v2/release/old_saves.sh <기록 폴더> [저장 번호 …]      결과: <폴더>/summary.txt (끝줄 ALLDONE)
# 저장마다 이야기 봇(tools/v2/chapter_audit.mjs --from <저장>)이 SECS(기본 75)초 동안 이어 플레이한다. 읽는 법: 줄마다 exit=0 · beats-run 1 이상 · errors=0 · lost=0.
# helps 는 0 이어야 하지만 봇의 길 찾기 탓일 수도 있다 — 도움이 난 저장은 한 번 더 돌려 보고(같은 자리면 게임 쪽), 까닭을 읽는다.
# 저장은 tools/v2/fixtures/saves_apk11/ (이야기 봇이 그 나무에서 쓴 것 14개: 광장 · 종탑 · 첫 건넘 · 묘지 · 납골당 · 여왕의 세 구간). 출시할 때마다 그 판의 저장 한 벌을 옆에 더한다.
cd "$(dirname "$0")/../../.." || exit 2
O=${1:?기록 폴더}; shift
S=tools/v2/fixtures/saves_apk11
rm -rf "$O"; mkdir -p "$O"
LIST=${*:-$(ls $S | sed 's/_.*//' | tr '\n' ' ')}
for n in $LIST; do
  f=$(ls $S/${n}_*.json 2>/dev/null | head -1); [ -z "$f" ] && { echo "$n: no such save" >> "$O/summary.txt"; continue; }
  b=$(basename "$f" .json); cp "$f" "$O/$b.json"
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
