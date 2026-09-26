#!/usr/bin/env python3
"""Inspection sheet for a matted image: connected components (index + bbox) and a coordinate grid, composited on a
dark backdrop so the alpha edge is visible. Used to author tools/painted/enemies/<id>/parts.json (bboxes, polygons,
pivots in source pixels).
Usage: python3 insp_sheet.py <matte.png> <out.jpg> [--crop x0,y0,x1,y1] [--grid 100] [--scale 0.5] [--pts x,y;x,y]"""
import sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

args = [a for a in sys.argv[1:] if not a.startswith('--')]
opt = {sys.argv[i][2:]: sys.argv[i + 1] for i in range(len(sys.argv) - 1) if sys.argv[i].startswith('--')}
im = Image.open(args[0]).convert('RGBA')
A = np.asarray(im)
crop = [int(v) for v in opt['crop'].split(',')] if 'crop' in opt else [0, 0, im.width, im.height]
grid = int(opt.get('grid', 100))
sc = float(opt.get('scale', 0.5))
x0, y0, x1, y1 = crop
bgc = Image.new('RGBA', im.size, (34, 26, 40, 255))
comp = Image.alpha_composite(bgc, im).crop(crop)
d = ImageDraw.Draw(comp)
for gx in range((x0 // grid) * grid, x1, grid):
    d.line([(gx - x0, 0), (gx - x0, y1 - y0)], fill=(80, 200, 255, 90) if gx % (grid * 5) else (255, 220, 80, 160), width=1)
for gy in range((y0 // grid) * grid, y1, grid):
    d.line([(0, gy - y0), (x1 - x0, gy - y0)], fill=(80, 200, 255, 90) if gy % (grid * 5) else (255, 220, 80, 160), width=1)
if 'crop' not in opt:
    m = A[..., 3] > 60
    lab, n = ndi.label(m)
    objs = ndi.find_objects(lab)
    k = 0
    for i, sl in enumerate(objs):
        if sl is None: continue
        area = int((lab[sl] == i + 1).sum())
        if area < 1500: continue
        ys, xs = sl
        d.rectangle([xs.start, ys.start, xs.stop, ys.stop], outline=(255, 80, 80, 255), width=3)
        d.text((xs.start + 4, ys.start + 4), f'#{i + 1} [{xs.start},{ys.start},{xs.stop},{ys.stop}]', fill=(255, 255, 0, 255))
        print(f'#{i + 1} bbox=[{xs.start},{ys.start},{xs.stop},{ys.stop}] area={area}')
        k += 1
for s in (opt.get('pts') or '').split(';'):
    if not s: continue
    px, py = [float(v) for v in s.split(',')]
    d.ellipse([px - x0 - 6, py - y0 - 6, px - x0 + 6, py - y0 + 6], outline=(0, 255, 0, 255), width=3)
# grid labels
for gx in range((x0 // grid) * grid, x1, grid * 2):
    d.text((gx - x0 + 2, 2), str(gx), fill=(255, 255, 255, 255))
for gy in range((y0 // grid) * grid, y1, grid * 2):
    d.text((2, gy - y0 + 2), str(gy), fill=(255, 255, 255, 255))
comp = comp.resize((max(1, int(comp.width * sc)), max(1, int(comp.height * sc))), Image.LANCZOS)
comp.convert('RGB').save(args[1], quality=88)
