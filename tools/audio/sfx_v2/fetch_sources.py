#!/usr/bin/env python3
"""v2 효과음 소재 받기 + 출처 목록(sources.json) 만들기.

  python3 tools/audio/sfx_v2/fetch_sources.py --src /tmp/claude-0/g3/sfx_src            # build_sfx_v2.py 가 쓰는 소재만 받는다
  python3 tools/audio/sfx_v2/fetch_sources.py --write-sources [--bsb-meta meta.json]    # sources.json 다시 쓰기 (개발용)

  소재 폴더 구조: <src>/bsb/<번호>.flac|wav · <src>/oga/<묶음>/<파일> · <src>/kenney/<팩>/Audio/<파일>
  모든 소재는 CC0 1.0 이다:
   · BigSoundBank.com (Joseph SARDIN) — 사이트 전체 CC0 1.0 (https://bigsoundbank.com/droits.html: "Creative Commons CC0 1.0 Universal")
   · Kenney.nl — 팩마다 License.txt (CC0 1.0)
   · OpenGameArt.org — 아래 PACKS 의 각 페이지에 License(s): CC0 로 올라온 묶음만 (작가 본인 녹음)
  받기 주소가 막혀 있으면 (freesound.org·sonniss.com 은 이 환경에서 403) 쓰지 않는다.
"""
import argparse
import io
import json
import subprocess
import sys
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
OGA = 'https://opengameart.org'
BSB_LIC = 'https://bigsoundbank.com/droits.html'
# OGA 묶음: 폴더 → (페이지, 받을 파일, 압축 안 경로 접두사, 작가)
PACKS = {
    'qubodup_punch': ('/content/punch', '/sites/default/files/qubodupPunch.7z', 'qubodupPunch/', 'qubodup (Iwan Gabovitch)'),
    'qubodup_impact': ('/content/impact', '/sites/default/files/qubodupImpact.7z', 'qubodupImpact/', 'qubodup (Iwan Gabovitch)'),
    'starninjas_clash': ('/content/20-sword-sound-effects-attacks-and-clashes', '/sites/default/files/sword_clash_-_starninjas_0.zip', '', 'StarNinjas'),
    'starninjas_impact': ('/content/10-impactshield-blocks', '/sites/default/files/impact_-_starninjas.zip', '', 'StarNinjas'),
    'starninjas_ding': ('/content/4-metal-dingsrings', '/sites/default/files/ding_-_starninjas.zip', '', 'StarNinjas'),
    'rubberduck_rpg': ('/content/80-cc0-rpg-sfx', '/sites/default/files/80-CC0-RPG-SFX_0.zip', '', 'rubberduck'),
    'rubberduck_bfh': ('/content/75-cc0-breaking-falling-hit-sfx', '/sites/default/files/sfx_breaking_and_falling.zip', '', 'rubberduck'),
    'medieval': ('/content/medieval-sound-effects-weapon-impacts', '/sites/default/files/medieval_sfx_weapon_on_weapon_1_of_2.7z', '',
                 'MedicineStorm (OGA) — Still North Media / Free Firearm Sound Library 팀 녹음, CC0'),
    'fantozzi': ('/content/fantozzis-footsteps-grasssand-stone', '/sites/default/files/Fantozzi-footsteps.7z', 'Fantozzi-footsteps/flac/',
                 'Fantozzi (freesound.org pack 10338, CC0) — 잘라 올림: qubodup'),
}
KENNEY = {'impact-sounds': 'https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip',
          'rpg-audio': 'https://kenney.nl/media/pages/assets/rpg-audio/8e99002d76-1677590336/kenney_rpg-audio.zip'}


def curl(url):
    r = subprocess.run(['curl', '-sSL', '-m', '180', '--fail', url], capture_output=True)
    if r.returncode != 0:
        sys.exit(f'받기 실패: {url} ({r.stderr.decode(errors="replace").strip()[:200]})')
    return r.stdout


def unpack(data, url):
    """→ {압축 안 경로: bytes}"""
    if url.endswith('.zip'):
        z = zipfile.ZipFile(io.BytesIO(data))
        return {n: z.read(n) for n in z.namelist() if not n.endswith('/')}
    try:
        import py7zr  # pip install py7zr (빌드 도구 전용)
    except ImportError:
        sys.exit('.7z 를 풀려면 py7zr 가 필요하다: pip install --target <dir> py7zr 후 PYTHONPATH=<dir>')
    with py7zr.SevenZipFile(io.BytesIO(data)) as z:
        return {k: v.read() for k, v in z.readall().items()}


def fetch(src):
    from build_sfx_v2 import used_sources  # 같은 폴더
    srcs = json.loads((HERE / 'sources.json').read_text(encoding='utf-8'))
    need = used_sources()
    arch = {}
    for key in need:
        s = srcs[key]
        dst = src / s['path']
        if dst.exists():
            continue
        dst.parent.mkdir(parents=True, exist_ok=True)
        if 'member' not in s:
            dst.write_bytes(curl(s['url']))
        else:
            if s['url'] not in arch:
                arch[s['url']] = unpack(curl(s['url']), s['url'])
            dst.write_bytes(arch[s['url']][s['member']])
        print('받음', key, '→', dst)
    print(f'소재 {len(need)}개 준비됨 ({src})')


def write_sources(bsb_meta, src):
    """build_sfx_v2.py 가 쓰는 키 → 출처 (개발용: 소재를 바꿀 때)"""
    from build_sfx_v2 import used_sources
    meta = json.loads(Path(bsb_meta).read_text(encoding='utf-8'))
    out = {}
    for key in used_sources():
        kind, rel = key.split(':', 1)
        if kind == 'bsb':
            m = meta[rel]
            ext = 'flac' if (src / 'bsb' / f'{rel}.flac').exists() else 'wav'   # 옛 소리 몇 개는 FLAC 이 없고 WAV(BWF) 만 있다
            out[key] = {'path': f'bsb/{rel}.{ext}', 'url': f'https://bigsoundbank.com/UPLOAD/{"bwf-en" if ext == "wav" else "flac"}/{rel}.{ext}',
                        'page': f'https://bigsoundbank.com/{m["slug"]}-s{rel}.html', 'title': m['title'] + f' (#{rel})',
                        'author': 'Joseph SARDIN — BigSoundBank.com', 'license': 'CC0 1.0', 'license_url': BSB_LIC}
        elif kind == 'oga':
            pack, fn = rel.split('/', 1)
            page, url, pre, au = PACKS[pack]
            out[key] = {'path': f'oga/{rel}', 'url': OGA + url, 'member': pre + fn, 'page': OGA + page, 'title': fn,
                        'author': au, 'license': 'CC0 1.0', 'license_url': 'https://creativecommons.org/publicdomain/zero/1.0/'}
        else:
            pack, fn = rel.split('/', 1)
            out[key] = {'path': f'kenney/{pack}/Audio/{fn}', 'url': KENNEY[pack], 'member': f'Audio/{fn}', 'page': f'https://kenney.nl/assets/{pack}',
                        'title': fn, 'author': 'Kenney (www.kenney.nl)', 'license': 'CC0 1.0', 'license_url': 'https://creativecommons.org/publicdomain/zero/1.0/'}
    (HERE / 'sources.json').write_text(json.dumps(out, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(f'sources.json: {len(out)}개')


if __name__ == '__main__':
    sys.path.insert(0, str(HERE))
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--src', default='/tmp/claude-0/g3/sfx_src')
    ap.add_argument('--write-sources', action='store_true')
    ap.add_argument('--bsb-meta', default='/tmp/claude-0/g3/sfx_tools/bsb_meta.json')
    a = ap.parse_args()
    if a.write_sources:
        write_sources(a.bsb_meta, Path(a.src))
    else:
        fetch(Path(a.src))
