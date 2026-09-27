#!/usr/bin/env python3
"""Skeleton mage sources (ART-ENEMY-2). Re-creates src/*.webp from the stored Kling images:
  skeleton_mage_ref.webp = Kling Step-4 edit of the armless skeleton side view (shot sk_mage, take 2: hooded purple robe,
                           gold-trimmed mantle, rope belt with skull charms) — robe body, sleeve arm
  staff.webp             = Kling single prop (shot staff, take 1: gnarled black staff, bony claw, violet crystal)
Kling raw downloads live in tools/.qa_art-enemy-2/raw/ while the package runs (tools/kling/manifest_art-enemy-2.json)."""
import os
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))
RAW = os.path.join(ROOT, 'tools', '.qa_art-enemy-2', 'raw')
OUT = os.path.join(HERE, 'src'); os.makedirs(OUT, exist_ok=True)
def save(im, name): im.convert('RGB').save(os.path.join(OUT, name), 'WEBP', quality=93, method=6); print(name, im.size)
def raw(n): p = os.path.join(RAW, n); return Image.open(p) if os.path.exists(p) else None
if raw('sk_mage_2.png'): save(raw('sk_mage_2.png'), 'skeleton_mage_ref.webp')
if raw('staff_1.png'): save(raw('staff_1.png'), 'staff.webp')
