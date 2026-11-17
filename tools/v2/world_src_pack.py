#!/usr/bin/env python3
"""PROPS lane: compact copies of the generated sources, kept in the repo so that the bakes can be repeated (docs/v2/ENV_KIT.md 16).
   python3 tools/v2/world_src_pack.py --raw /tmp/claude-0/v2/world/raw [--props a,b] [--tex k_a,k_b]
 models:   <raw>/<id>.glb (2048 px JPEG, about 1 MB each) -> tools/v2/world_src/props/<id>.glb with the texture at 1024 px (JPEG q 86): the bake samples it into cells of at most 600 px
 surfaces: <raw>/<k_xxx>.png (1024 px)                   -> tools/v2/world_src/tex/<k_xxx>.webp (q 88)
"""
import sys, os, io, json, struct, argparse
from PIL import Image

ap = argparse.ArgumentParser(); ap.add_argument('--raw', required=True); ap.add_argument('--props', default=''); ap.add_argument('--tex', default=''); ap.add_argument('--out', default='tools/v2/world_src'); a = ap.parse_args()
os.makedirs(a.out + '/props', exist_ok=True); os.makedirs(a.out + '/tex', exist_ok=True)
for mid in [x for x in a.props.split(',') if x]:
    f = open(f'{a.raw}/{mid}.glb', 'rb').read(); jl = struct.unpack('<I', f[12:16])[0]; J = json.loads(f[20:20 + jl]); b0 = 20 + jl + 8; binlen = struct.unpack('<I', f[20 + jl:24 + jl])[0]; B = f[b0:b0 + binlen]
    iv = J['images'][0]['bufferView']; bv = J['bufferViews'][iv]; o = bv.get('byteOffset', 0)
    assert o + bv['byteLength'] >= max(v.get('byteOffset', 0) + v['byteLength'] for v in J['bufferViews']), 'image is expected to be the last buffer view'
    im = Image.open(io.BytesIO(B[o:o + bv['byteLength']])).convert('RGB').resize((1024, 1024), Image.LANCZOS); buf = io.BytesIO(); im.save(buf, 'JPEG', quality=86, optimize=True); jb = buf.getvalue()
    nb = B[:o] + jb; nb += b'\0' * ((4 - len(nb) % 4) % 4); bv['byteLength'] = len(jb); J['buffers'] = [{'byteLength': len(nb)}]; J['images'][0]['mimeType'] = 'image/jpeg'
    js = json.dumps(J, separators=(',', ':')).encode(); js += b' ' * ((4 - len(js) % 4) % 4)
    out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(nb)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(nb), 0x004E4942) + nb
    open(f'{a.out}/props/{mid}.glb', 'wb').write(out); print(f'{mid}.glb {len(f)} -> {len(out)} bytes')
for k in [x for x in a.tex.split(',') if x]:
    im = Image.open(f'{a.raw}/{k}.png').convert('RGB'); im.save(f'{a.out}/tex/{k}.webp', 'WEBP', quality=88, method=6); print(f'{k}.webp {os.path.getsize(f"{a.out}/tex/{k}.webp")} bytes ({im.size[0]} px)')
