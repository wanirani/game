#!/usr/bin/env python3
"""One-shot rebuild of a painted enemy from its stored Kling sources:

    python3 tools/painted/enemies/pipeline.py skeleton [bat ghost ...]     (or: all)

For every source in tools/painted/enemies/<id>/parts.json → "sources": { key: { raw, file, mode, k } }:
  src/<raw> (Kling image, webp)  --matte.py [--rembg|--soft]-->  <WORK>/matte/<file>
then build.py cuts the parts and writes assets/painted/enemies/<id>/{atlas.webp, rig.json} and <WORK>/preview_<id>.png.
WORK = $ENEMY_WORK or tools/painted/.work/enemies (git-ignored).
"""
import json, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.environ.get('ENEMY_WORK') or os.path.abspath(os.path.join(HERE, '..', '.work', 'enemies'))
ids = sys.argv[1:] or ['all']
if ids == ['all']:
    ids = sorted(d for d in os.listdir(HERE) if os.path.isfile(os.path.join(HERE, d, 'parts.json')))
os.makedirs(os.path.join(WORK, 'matte'), exist_ok=True)
for eid in ids:
    cfg = json.load(open(os.path.join(HERE, eid, 'parts.json')))
    for key, s in cfg['sources'].items():
        out = os.path.join(WORK, 'matte', s['file'])
        src = os.path.join(HERE, eid, 'src', s['raw'])
        if os.path.exists(out) and os.path.getmtime(out) > os.path.getmtime(src):
            continue
        # matte.py reads PNG/WebP alike (PIL)
        args = [sys.executable, os.path.join(HERE, 'matte.py'), src, out] + ([f"--{s['mode']}"] if s.get('mode') else [])
        print('matte', key, s['raw'], s.get('mode', ''))
        subprocess.run(args, check=True)
    env = dict(os.environ, ENEMY_WORK=WORK)
    subprocess.run([sys.executable, os.path.join(HERE, 'build.py'), eid], check=True, env=env)
