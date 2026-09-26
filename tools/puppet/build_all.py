#!/usr/bin/env python3
"""퍼펫 전체 재빌드 (한 번에): 모든 리그 테이블 → 아틀라스·마스크·턴테이블 → 매니페스트 → 검증 시트 → 용량 보고
  python3 tools/puppet/build_all.py            # 전부
  python3 tools/puppet/build_all.py kael       # 한 캐릭터만 (charId 또는 classId 접두어)
  python3 tools/puppet/build_all.py --no-turn  # 턴테이블 생략(빠름)
결과: assets/puppets/<charId>/<classId>/*, assets/puppets/_shared/cape_tex.webp,
      src/render/puppet_manifest.js (런타임이 읽는 목록: 어떤 캐릭터·직업에 퍼펫이 있는지 + 파일 해시)"""
import argparse, glob, json, os, sys, subprocess, time
from concurrent.futures import ProcessPoolExecutor
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib.pup import RIGS, OUT, REPO, load_json, file_hash


def one(args):
    path, turn = args
    from build_rig import build
    from build_turn import build_turn
    t0 = time.time()
    meta = build(path, quiet=True)
    tr = build_turn(path, quiet=True) if turn else None
    return path, meta['charId'], meta['classId'], round(time.time() - t0, 1), bool(tr)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('only', nargs='?', default=None)
    ap.add_argument('--no-turn', action='store_true')
    ap.add_argument('-j', type=int, default=3)
    a = ap.parse_args()
    rigs = sorted(glob.glob(os.path.join(RIGS, '*', '*.json')))
    if a.only:
        rigs = [r for r in rigs if os.path.basename(r).startswith(a.only) or os.path.basename(os.path.dirname(r)) == a.only]
    here = os.path.dirname(os.path.abspath(__file__))
    subprocess.run([sys.executable, os.path.join(here, 'build_cape.py')], check=True)
    with ProcessPoolExecutor(max_workers=a.j) as ex:
        for path, cid, clsid, dt, tr in ex.map(one, [(r, not a.no_turn) for r in rigs]):
            print(f'  ✓ {cid}/{clsid}  {dt}s{"  +turn" if tr else ""}')
    write_manifest()
    subprocess.run([sys.executable, os.path.join(here, 'sheet.py')] + ([a.only] if a.only else []), check=False)
    report()


def write_manifest():
    """src/render/puppet_manifest.js — 퍼펫이 있는 캐릭터/직업 목록. 여기 없는 조합은 요청조차 하지 않는다(404 없음)."""
    M = {}
    for rp in sorted(glob.glob(os.path.join(OUT, '*', '*', 'rig.json'))):
        cls = os.path.basename(os.path.dirname(rp)); cid = os.path.basename(os.path.dirname(os.path.dirname(rp)))
        rig = load_json(rp)
        d = os.path.dirname(rp)
        files = sorted(f for f in os.listdir(d))
        h = file_hash(*[os.path.join(d, f) for f in files])
        M.setdefault(cid, {})[cls] = dict(h=h, turn=bool(rig.get('turn')), lv=sorted(rig['levels'].keys()))
    js = ['// 자동 생성: tools/puppet/build_all.py — 손으로 고치지 말 것.',
          '// 채색 컷아웃 퍼펫이 준비된 캐릭터/직업. h = 파일 묶음 해시(캐시 무효화), turn = 턴테이블 시트 유무.',
          'export const PUPPETS = ' + json.dumps(M, ensure_ascii=False, indent=1) + ';', '']
    p = os.path.join(REPO, 'src', 'render', 'puppet_manifest.js')
    open(p, 'w', encoding='utf-8').write('\n'.join(js))
    print('manifest', os.path.relpath(p, REPO), sum(len(v) for v in M.values()), 'puppets')


def report():
    tot = 0; per = {}
    for f in glob.glob(os.path.join(OUT, '**', '*'), recursive=True):
        if os.path.isfile(f):
            s = os.path.getsize(f); tot += s
            k = os.path.relpath(f, OUT).split(os.sep)
            key = '/'.join(k[:2]) if len(k) > 2 else k[0]
            per[key] = per.get(key, 0) + s
    for k in sorted(per):
        print(f'  {k:32s} {per[k] / 1024:8.1f} KB')
    print(f'assets/puppets 합계 {tot / 1024:.1f} KB ({tot} bytes)')


if __name__ == '__main__':
    main()
