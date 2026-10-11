#!/usr/bin/env python3
"""assets/audio/LICENSE-CREDITS.txt (옛 CREDITS.md — build_web 이 .md 를 건너뛰어 배포본에 빠지던 것을 라이선스 사본으로 함께 싣는다) 의 '고급 효과음 v2' 절을 build_sfx_v2.py --credits 가 쓴 JSON(쓰인 소재 → 출처·used_in)으로 다시 쓴다.
  python3 tools/audio/sfx_v2/credits_md.py /tmp/claude-0/g7/sfx_sources.json"""
import json, sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
src = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
ix = json.loads((ROOT / 'assets/audio/sfx_v2/index.json').read_text(encoding='utf-8'))
names = list(ix['sfx'])
nfiles = len(ix['files'])
by = defaultdict(list)
for k, s in src.items():
    by[s['author']].append((k, s))
head = f"""## 고급 효과음 v2 / Premium SFX v2 (`assets/audio/sfx_v2/`)

게임 기본값 (끄기: `?sfx=v1` 또는 localStorage `bn.sfx`=`v1`, docs/specs/anime_motion_sfx.md §4·§5.1). {len(names)}종 ({', '.join(names)}) — 파일 {nfiles}개 (.m4a 만).
모든 소리는 아래 **녹음 소재(전부 CC0 1.0)** 를 잘라 층으로 쌓고(순간음 + 몸통 + 꼬리) EQ·가벼운 새츄레이션·라우드니스(-16 LUFS)·클리퍼·리미터(≤ -1 dBFS)로 오프라인 가공한 2차 저작물이다 — 합성음 층 없음. 만드는 법: `tools/audio/sfx_v2/build_sfx_v2.py` + `recipes2.py`·`recipes3.py` (레시피), 소재 받기: `tools/audio/sfx_v2/fetch_sources.py`, 파일별 출처 원본: `tools/audio/sfx_v2/sources.json`.
All v2 sounds are derivative works layered from the recordings below, every one released under **CC0 1.0** (public domain dedication — no attribution required, credited here anyway). No synthesized layers.

라이선스 근거 / Licence evidence:
- BigSoundBank.com (Joseph SARDIN): 사이트 전체 CC0 1.0 — https://bigsoundbank.com/droits.html
- Kenney "Impact Sounds"·"RPG Audio": 팩의 License.txt (CC0 1.0) — https://kenney.nl/assets/impact-sounds · https://kenney.nl/assets/rpg-audio
- OpenGameArt.org: 각 묶음 페이지의 License(s): CC0 (작가 본인 녹음/공개) — 아래 표의 페이지
- 쓰지 않은 것 / Rejected: freesound.org·sonniss.com (이 환경에서 접속 403), StarNinjas 묶음(원본이 클리핑), 출처가 불분명한 재업로드 묶음, CC0 가 아닌 파일(MIT/zlib 등), mp3 로만 받을 수 있는 BigSoundBank 소리(#0437·#0438 — 손실 원본), AI 생성 오디오
"""
parts = [head]
for au in sorted(by, key=lambda a: -len(by[a])):
    rows = sorted(by[au], key=lambda kv: kv[0])
    parts.append(f"\n### {au} — CC0 1.0 ({len(rows)})\n\n| 소재 / Source | 쓰인 곳 / Used in | 원본 / Origin |\n|---|---|---|")
    for k, s in rows:
        origin = s['page'] + (f" (`{s['member']}` in {s['url'].rsplit('/', 1)[-1]})" if 'member' in s else f" ({s['url']})")
        parts.append(f"| {s['title']} | {', '.join(s['used_in'])} | {origin} |")
p = ROOT / 'assets/audio/LICENSE-CREDITS.txt'
txt = p.read_text(encoding='utf-8')
i = txt.index('## 고급 효과음 v2')
p.write_text(txt[:i] + '\n'.join(parts) + '\n', encoding='utf-8')
print(f'LICENSE-CREDITS.txt v2 절: 소재 {len(src)}개 · 작가 {len(by)}명')
