#!/usr/bin/env python3
"""export.mjs 가 내보낸 PNG 를 아틀라스(webp + json)로 묶는다.
   python3 tools/v2/ui_mock2/uiink/pack_atlas.py [/dev/shm/uiink/export] [assets/v2/ui/uiink]"""
import sys, json, glob, os
from PIL import Image
src = sys.argv[1] if len(sys.argv) > 1 else '/dev/shm/uiink/export'
dst = sys.argv[2] if len(sys.argv) > 2 else 'assets/v2/ui/uiink'
os.makedirs(dst, exist_ok=True)
for group, width in (('icons', 1280), ('mat', 1536)):
    files = sorted(glob.glob(f'{src}/{group}/*.png'))
    ims = [(os.path.splitext(os.path.basename(f))[0], Image.open(f).convert('RGBA')) for f in files]
    x = y = rowh = 0; pos = {}
    for name, im in ims:  # 줄 채우기
        if x + im.width > width: x = 0; y += rowh + 2; rowh = 0
        pos[name] = [x, y, im.width, im.height]; x += im.width + 2; rowh = max(rowh, im.height)
    atlas = Image.new('RGBA', (width, y + rowh), (0, 0, 0, 0))
    for name, im in ims: atlas.paste(im, tuple(pos[name][:2]))
    out = f'{dst}/{group}_ink.webp'
    atlas.save(out, 'WEBP', quality=92, method=6, exact=True)
    json.dump({'image': os.path.basename(out), 'size': list(atlas.size), 'frames': pos}, open(f'{dst}/{group}_ink.json', 'w'), ensure_ascii=False, separators=(',', ':'))
    print(out, atlas.size, len(ims), 'sprites', os.path.getsize(out) // 1024, 'KB')
