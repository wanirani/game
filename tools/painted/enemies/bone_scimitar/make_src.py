#!/usr/bin/env python3
"""Bone scimitar sources (ART-ENEMY-2). Re-creates src/*.webp from the stored Kling images:
  bone_scimitar_ref.webp  = Kling Step-4 edit of the armless skeleton side view (shot sk_scim, take 2: turban + sash)
  skel_legs.webp          = crop of tools/painted/enemies/skeleton/src/skeleton_edit.webp (bare thigh + shin, same scale)
  skel_arms.webp          = crop of tools/painted/enemies/skeleton/src/skeleton_sheet1.webp (upper arm + forearm)
  scimitar.webp           = crop of the ART-ENEMY-2 props sheet (shot props, take 2)
Kling raw downloads live in tools/.qa_art-enemy-2/raw/ while the package runs (see tools/kling/manifest_art-enemy-2.json)."""
import os
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))
RAW = os.path.join(ROOT, 'tools', '.qa_art-enemy-2', 'raw'); SK = os.path.join(ROOT, 'tools', 'painted', 'enemies', 'skeleton', 'src')
OUT = os.path.join(HERE, 'src'); os.makedirs(OUT, exist_ok=True)
def save(im, name): im.convert('RGB').save(os.path.join(OUT, name), 'WEBP', quality=93, method=6); print(name, im.size)
if os.path.exists(os.path.join(RAW, 'sk_scim_2.png')): save(Image.open(os.path.join(RAW, 'sk_scim_2.png')), 'bone_scimitar_ref.webp')
save(Image.open(os.path.join(SK, 'skeleton_edit.webp')).crop((740, 1090, 1130, 2320)), 'skel_legs.webp')
save(Image.open(os.path.join(SK, 'skeleton_sheet1.webp')).crop((100, 320, 330, 1030)), 'skel_arms.webp')
if os.path.exists(os.path.join(RAW, 'props_2.png')): save(Image.open(os.path.join(RAW, 'props_2.png')).crop((20, 0, 440, 1440)), 'scimitar.webp')
