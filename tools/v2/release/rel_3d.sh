#!/bin/bash
# 3D 앱만 빌드 (docs/RELEASE.md §4.1 · §4.2). 바깥 변경이 없을 때만: 
#   git diff --name-only <지난 3D 출시 커밋> HEAD -- . ':!src/v2' ':!assets/v2' ':!tools/v2' ':!docs' ':!tools/higgsfield'   → 비어 있어야 한다
# 돌리기 전에: 점검 묶음(pre_chain.sh)이 통과한 나무 그대로일 것, 자동 저장을 멈출 것(빌드 동안 HEAD 가 움직이면 안 된다), 도는 갈래는 저장소를 건드리지 않을 것.
#   bash tools/v2/release/rel_3d.sh [기록 폴더, 기본 /tmp/claude-0/v2/rel]      결과: <폴더>/steps.txt (끝줄 ALLDONE) · probe.log (크기 · sha256 · build-info)
# 서명 키(tools/android/release.keystore · keystore.properties)는 읽기만 한다 — 출력하지도, 저장소에 넣지도 않는다.
cd "$(dirname "$0")/../../.." || exit 2
export TMPDIR=/dev/shm
L=${1:-/tmp/claude-0/v2/rel}
mkdir -p "$L"
: > "$L/steps.txt"
step() { echo "== $(date -u +%H:%M:%S) $1" >> "$L/steps.txt"; }
step "head $(git rev-parse --short HEAD) dirty=$(git status --porcelain | wc -l)"
step "check-key"; tools/apk/build_apk.sh --check-key > "$L/checkkey.log" 2>&1; echo "exit=$?" >> "$L/steps.txt"
step "web3d"; node tools/deploy/build_web.mjs --target 3d > "$L/web3d.log" 2>&1; echo "exit=$?" >> "$L/steps.txt"
step "target_check 3d"; node tools/deploy/target_check.mjs --dir dist/web3d --scenes v2b,v2c,v2bench,v2a > "$L/tc3d.log" 2>&1; echo "exit=$?" >> "$L/steps.txt"
step "apk 3d"; APP_VARIANT=3d tools/apk/build_apk.sh --verify > "$L/apk3d.log" 2>&1; echo "exit=$?" >> "$L/steps.txt"
step "dist_boot v2g"; node tools/v2/dist_boot_check.mjs --dir dist/web3d --scenes v2g > "$L/boot.log" 2>&1; echo "exit=$?" >> "$L/steps.txt"
step "head-after $(git rev-parse --short HEAD) dirty=$(git status --porcelain | wc -l)"
step "probe"; { echo "audio files: $(ls dist/web3d/assets/v2/audio | wc -l)"; ls -la dist/BloodNocturne3D.apk; sha256sum dist/BloodNocturne3D.apk; cat dist/web3d/build-info.js; } > "$L/probe.log" 2>&1; echo "exit=$?" >> "$L/steps.txt"
step "ALLDONE"
