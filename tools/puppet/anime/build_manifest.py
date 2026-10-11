#!/usr/bin/env python3
"""애니풍 시범 매니페스트: assets/puppets_anime/<char>/<cls>/rig.json 이 있는 직업을 모아 assets/puppets_anime/manifest.json 을 쓴다.
  python3 tools/puppet/anime/build_manifest.py
런타임(src/render/hero_puppet.js)은 pilot.anime 일 때만 이 파일을 읽는다. h = 리그·아틀라스·턴 시트 해시(캐시 무효화).
형식: {"v":1, "classes": {"kael": {"kael_hunter": {"h": "...", "turn16": true}}}}"""
import os, sys, json
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
from lib.pup import REPO, file_hash  # noqa: E402

ROOT = os.path.join(REPO, 'assets', 'puppets_anime')


def main():
    out = {}
    for cid in sorted(os.listdir(ROOT)):
        d = os.path.join(ROOT, cid)
        if not os.path.isdir(d):
            continue
        for cls in sorted(os.listdir(d)):
            cd = os.path.join(d, cls)
            rp = os.path.join(cd, 'rig.json')
            if not os.path.exists(rp):
                continue
            files = [rp] + [os.path.join(cd, f) for f in sorted(os.listdir(cd)) if f.endswith('.webp')]
            rig = json.load(open(rp, encoding='utf-8'))
            e = {'h': file_hash(*files)}
            if (rig.get('turn') or {}).get('turn16'):
                e['turn16'] = True
            out.setdefault(cid, {})[cls] = e
    m = {'v': 1, '_doc': '애니풍 시범(pilot.anime) 퍼펫 목록 — tools/puppet/anime/build_manifest.py 가 만든다', 'classes': out}
    json.dump(m, open(os.path.join(ROOT, 'manifest.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(json.dumps(out))


if __name__ == '__main__':
    main()
