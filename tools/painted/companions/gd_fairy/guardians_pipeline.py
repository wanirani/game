#!/usr/bin/env python3
"""Painted guardian puppets (CMP-GUARD-ART-A: gd_fairy gd_spiritwolf gd_imp gd_knight gd_whelp gd_owl) — one-shot rebuild.

    python3 tools/painted/companions/gd_fairy/guardians_pipeline.py gd_owl [gd_imp ...]     (or: all)

Shared by the six guardians (kept in the first guardian's folder because this package owns only the per-id folders).
Same pipeline as the painted enemies (docs/art/ENEMY_PIPELINE.md §4), different folders:
  tools/painted/companions/<id>/parts.json + src/*.webp   --tools/painted/enemies/matte.py-->   <WORK>/matte/<file>
  tools/painted/enemies/build.py (run with the companion folders patched in)  -->  assets/painted/companions/<id>/{atlas.webp, rig.json}
WORK = $GUARD_WORK or tools/painted/.work/companions (git-ignored); preview_<id>.png lands there.
The runtime loads the atlas through enemy_kit.requestRig({ src: '../companions/<id>' }) (src/render/painted/companions/<id>.js).
"""
import json, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
CMP = os.path.dirname(HERE)                                   # tools/painted/companions
PAINTED = os.path.dirname(CMP)                                # tools/painted
ENEMY = os.path.join(PAINTED, 'enemies')
WORK = os.environ.get('GUARD_WORK') or os.path.join(PAINTED, '.work', 'companions')
IDS = ['gd_fairy', 'gd_spiritwolf', 'gd_imp', 'gd_knight', 'gd_whelp', 'gd_owl']

ids = sys.argv[1:] or ['all']
if ids == ['all']:
    ids = [i for i in IDS if os.path.isfile(os.path.join(CMP, i, 'parts.json'))]
os.makedirs(os.path.join(WORK, 'matte'), exist_ok=True)

src = open(os.path.join(ENEMY, 'build.py'), encoding='utf-8').read()
old = "os.path.join(ROOT, 'assets', 'painted', 'enemies', EID)"
if old not in src:
    sys.exit('build.py changed: output folder line not found')
src = src.replace(old, "os.path.join(ROOT, 'assets', 'painted', 'companions', EID)")
# build.py reads <HERE>/<id>/parts.json and ROOT = HERE/../../..  → pretend it lives in tools/painted/companions/
src = f"__file__ = {os.path.join(CMP, 'build.py')!r}\n" + src

for gid in ids:
    cfg = json.load(open(os.path.join(CMP, gid, 'parts.json'), encoding='utf-8'))
    for key, s in cfg['sources'].items():
        out = os.path.join(WORK, 'matte', s['file'])
        raw = os.path.join(CMP, gid, 'src', s['raw'])
        if os.path.exists(out) and os.path.getmtime(out) > os.path.getmtime(raw):
            continue
        args = [sys.executable, os.path.join(ENEMY, 'matte.py'), raw, out] + ([f"--{s['mode']}"] if s.get('mode') else [])
        print('matte', key, s['raw'], s.get('mode', ''))
        subprocess.run(args, check=True)
    subprocess.run([sys.executable, '-', gid, '--work', WORK], input=src.encode('utf-8'), check=True)
