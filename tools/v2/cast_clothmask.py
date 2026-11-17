#!/usr/bin/env python3
"""v2 cast: 공용 마을 사람 몸의 "옷만 물들이는" 마스크를 만든다 (castpeople, 2026-11-17).

  python3 tools/v2/cast_clothmask.py assets/v2/char3d/villager_m.glb assets/v2/char3d/villager_m_cloth.webp [--demo out.glb r,g,b]

- 공용 몸은 일부러 무채색(삼베 · 연회색 모직) 옷으로 만들었다. 텍스처에서 채도가 낮고 너무 어둡지 않은 곳 = 옷, 나머지(살 · 머리 · 가죽) = 그대로.
- 결과: 회색조 WebP (흰색 = 옷). 셰이더에서  rgb = tex.rgb * mix(vec3(1.0), tint, mask)  로 쓰면 살빛은 건드리지 않고 옷 색만 바뀐다.
- --demo: 마스크로 물들인 텍스처를 넣은 GLB 를 따로 써 본다 (미리보기용, 게임에는 싣지 않는다).
"""
import sys, json, struct, io
import numpy as np
from PIL import Image, ImageFilter

def read_glb(p):
    b = open(p, 'rb').read(); jl = struct.unpack_from('<I', b, 12)[0]
    J = json.loads(b[20:20 + jl]); bl = struct.unpack_from('<I', b, 20 + jl)[0]
    return J, b[28 + jl:28 + jl + bl]

def write_glb(p, J, views):
    """views: bufferView 마다의 바이트 (차례대로 다시 쌓는다)"""
    out = bytearray()
    for i, v in enumerate(views):
        while len(out) % 4: out.append(0)
        J['bufferViews'][i]['byteOffset'] = len(out); J['bufferViews'][i]['byteLength'] = len(v); out += v
    while len(out) % 4: out.append(0)
    J['buffers'][0]['byteLength'] = len(out)
    js = json.dumps(J, separators=(',', ':')).encode()
    while len(js) % 4: js += b' '
    open(p, 'wb').write(struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(js) + 8 + len(out)) + struct.pack('<I4s', len(js), b'JSON') + js + struct.pack('<I4s', len(out), b'BIN\0') + bytes(out))

def main():
    src, dst = sys.argv[1], sys.argv[2]
    J, B = read_glb(src)
    views = [B[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']] for v in J['bufferViews']]
    iv = J['images'][0]['bufferView']
    tex = Image.open(io.BytesIO(views[iv])).convert('RGB')
    a = np.asarray(tex).astype(np.float32) / 255
    mx, mn = a.max(-1), a.min(-1); sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-5), 0)
    m = np.clip((0.24 - sat) / 0.08, 0, 1) * np.clip((mx - 0.22) / 0.10, 0, 1)      # 채도 0.16 아래 = 옷, 0.24 위 = 아님; 아주 어두운 곳 제외
    mask = Image.fromarray((m * 255).astype(np.uint8), 'L').filter(ImageFilter.MedianFilter(5)).filter(ImageFilter.GaussianBlur(1.2))
    mask.resize((512, 512), Image.LANCZOS).save(dst, 'WEBP', quality=80, method=6)
    print('마스크', dst, '옷 비율 %.0f%%' % (m.mean() * 100))
    if '--demo' in sys.argv:
        k = sys.argv.index('--demo'); out = sys.argv[k + 1]; tint = np.array([float(x) for x in sys.argv[k + 2].split(',')], np.float32)
        mm = np.asarray(mask).astype(np.float32)[..., None] / 255
        t2 = Image.fromarray(np.clip(a * (1 - mm + mm * tint) * 255, 0, 255).astype(np.uint8), 'RGB')
        buf = io.BytesIO(); t2.save(buf, 'WEBP', quality=82); views[iv] = buf.getvalue()
        write_glb(out, J, views); print('미리보기', out)

if __name__ == '__main__':
    main()
