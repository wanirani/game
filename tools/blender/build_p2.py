#!/usr/bin/env python3
"""
BLOOD NOCTURNE -- Part 2 ("BEYOND THE RIFT", docs/specs/world2.md sec. 13.2)
icons and level props, rendered procedurally in Blender (bpy as a module).

This builder does not copy the render framework: it imports the existing
builders and reuses their pipelines, helpers and materials so Part 2 art
matches Part 1 exactly.

    build_icons_equipment  (module E)  tier-7 equipment icons: same scene,
                           studio rig, glossy-only studio world, auto framing,
                           emissive glow pass, bloom + 1 px dark outline.
    build_decor_b          (module D)  key-item icons (world hearts, star
                           shard, rift lantern, dawnflower) and the level
                           props: same rig as build_icons_misc / decor
                           sprites (warm key, cool rim, violet kicker, fill,
                           top softbox, dim world), Cycles, 2x supersampled,
                           emission-pass bloom, LANCZOS downsample.

Tier-7 look (all eleven equipment icons): near-black "void metal" with a
thin-film iridescent sheen, one jagged iridescent rift-crack seam (cyan ->
violet -> magenta -> gold, white-hot core) running through the main part, a
small warm-white faceted star gem, pale star-gold trims and a few starlight
glints.  Tier 6 is black + blood red; tier 7 must read as otherworldly.

Usage:
    python3 tools/blender/build_p2.py                         # everything
    python3 tools/blender/build_p2.py --only 'sword_7,wheart_*' --samples 32
    python3 tools/blender/build_p2.py --list
    python3 tools/blender/build_p2.py --contact-only

Outputs
    assets/icons/<id>.png   128x128 RGBA (tier-7 gear, world hearts, keys)
    assets/props/<id>.png   RGBA sprites, size per id (DECOR_SETS in
                            world2.md sec. 4.1, rendered 2x then downsampled)
    /tmp/claude-0/proto/contact_p2_icons.png   review sheets (icons with
    /tmp/claude-0/proto/contact_p2_props.png   the tier-6 row for comparison;
                                               props on light + dark slots)
"""

import argparse
import fnmatch
import math
import os
import random
import shutil
import sys
import tempfile
import time
from types import SimpleNamespace

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import bpy  # noqa: E402,F401
import bmesh  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402
from PIL import Image, ImageDraw, ImageFont  # noqa: E402

import build_icons_equipment as E  # noqa: E402
import build_decor_b as D  # noqa: E402

GAME_ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
ICON_DIR = os.path.join(GAME_ROOT, "assets", "icons")
PROP_DIR = os.path.join(GAME_ROOT, "assets", "props")
CONTACT_DIR = "/tmp/claude-0/proto"

TAU = math.tau
rad = math.radians

# =============================================================================
#  Registry
# =============================================================================
P2 = {}   # id -> dict(id, kind: 'equip'|'icon'|'prop', size, anchor)


def equip(item_id):
    """Tier-7 equipment icon (build_icons_equipment pipeline)."""
    def deco(fn):
        E.REGISTRY[item_id] = fn
        P2[item_id] = dict(id=item_id, kind="equip", size=(128, 128), anchor="center")
        return fn
    return deco


def icon(item_id):
    """Key-item icon (build_decor_b / build_icons_misc pipeline)."""
    def deco(fn):
        D.item(item_id, (128, 128), "icon")(fn)
        P2[item_id] = dict(id=item_id, kind="icon", size=(128, 128), anchor="center")
        return fn
    return deco


def prop(item_id, size, anchor="bottom"):
    """Level prop sprite (build_decor_b pipeline).  anchor: 'bottom' (floor)
    or 'top' (hangs from the ceiling)."""
    def deco(fn):
        D.item(item_id, size, "prop")(fn)
        P2[item_id] = dict(id=item_id, kind="prop", size=size, anchor=anchor)
        return fn
    return deco


# =============================================================================
#  Shared palette
# =============================================================================
# iridescent rift spectrum (linear RGB), cyclic
RIFT_STOPS = [(0.0, (0.18, 0.95, 1.0)), (0.2, (0.32, 0.5, 1.0)), (0.4, (0.66, 0.3, 1.0)),
              (0.6, (1.0, 0.3, 0.78)), (0.8, (1.0, 0.8, 0.4)), (1.0, (0.18, 0.95, 1.0))]
STAR_WHITE = (1.0, 0.93, 0.78)          # warm white star light
RIFT_K = 0.3     # global multiplier of rift seam emission (keeps the colours saturated)
GLOW_K = 0.35    # global multiplier of solid rift-light emission (rings, cores)
WORLD_COLORS = {1: "#dff4ff", 2: "#ff7a2a", 3: "#3ad0c8", 4: "#bfe0ff", 5: "#c060ff",
                6: "#9ad040"}


def srgb(hexcol):
    """'#rrggbb' -> linear RGB tuple."""
    h = hexcol.lstrip("#")
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255.0
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return tuple(out)


# =============================================================================
#  Node helpers usable with any material (module independent)
# =============================================================================
def _n(nt, kind, **inputs):
    node = nt.nodes.new(kind)
    for k, v in inputs.items():
        if k.startswith("_"):
            setattr(node, k[1:], v)
        else:
            node.inputs[k].default_value = v
    return node


def _m(nt, op, a, b=None, clamp=False):
    node = nt.nodes.new("ShaderNodeMath")
    node.operation = op
    node.use_clamp = clamp
    for i, x in enumerate((a, b)):
        if x is None:
            continue
        if isinstance(x, (int, float)):
            node.inputs[i].default_value = x
        else:
            nt.links.new(x, node.inputs[i])
    return node.outputs[0]


def _ramp(nt, fac, stops, interp="LINEAR"):
    r = nt.nodes.new("ShaderNodeValToRGB")
    cr = r.color_ramp
    cr.interpolation = interp
    cr.elements[0].position = stops[0][0]
    cr.elements[0].color = (*stops[0][1], 1)
    cr.elements[1].position = stops[-1][0]
    cr.elements[1].color = (*stops[-1][1], 1)
    for p, c in stops[1:-1]:
        cr.elements.new(p).color = (*c, 1)
    nt.links.new(fac, r.inputs["Fac"])
    return r.outputs["Color"]


def _bsdf(m):
    return next(n for n in m.node_tree.nodes if n.bl_idname == "ShaderNodeBsdfPrincipled")


def add_rift(m, along="Z", across="X", center=0.0, amp=0.05, freq=2.2, width=0.012,
             halo=0.07, strength=14.0, halo_str=1.4, seed=0.0, col_freq=2.0, span=None,
             taper=None, branches=0.0, depth=None, base_scorch=(0.1, 0.02, 0.16),
             coord="Object", bend=0.0, polar=None):
    """Add an emissive iridescent rift crack to a Principled material.

    The seam runs along object axis `along`; its distance is measured along
    `across` (optionally also `depth`, so a seam can be restricted to one
    face).  amp/freq: jaggedness; width/halo: core and soft glow widths
    (object units); span=(a0, a1): the seam fades in/out along `along`;
    taper=(a0, a1): width shrinks from a0 to a1.  Emission colour cycles
    through the rift spectrum along the seam, white-hot in the core.
    bend: the centre line follows center + bend * along^2 (curved blades).
    polar=(u, v, R): the seam runs around a circle of radius R in the
    object's u/v plane (ring bands); `along` becomes arc length.
    Returns the (0..1) seam-mask socket."""
    nt = m.node_tree
    I = _bsdf(m).inputs
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs[coord], sep.inputs[0])
    if polar is not None:
        pu, pv, R = polar
        u_, v_ = sep.outputs[pu], sep.outputs[pv]
        rr = _m(nt, "SQRT", _m(nt, "ADD", _m(nt, "MULTIPLY", u_, u_), _m(nt, "MULTIPLY", v_, v_)))
        a = _m(nt, "MULTIPLY", _m(nt, "ARCTAN2", v_, u_), R)
        x = _m(nt, "SUBTRACT", rr, R)
    else:
        a = sep.outputs[along]
        x = sep.outputs[across]
    if bend:
        center_s = _m(nt, "ADD", _m(nt, "MULTIPLY", _m(nt, "MULTIPLY", a, a), bend), center)
    else:
        center_s = center
    # jagged centre line: two octaves of 1D-ish noise along the seam
    cb = nt.nodes.new("ShaderNodeCombineXYZ")
    nt.links.new(_m(nt, "MULTIPLY", a, freq), cb.inputs["X"])
    cb.inputs["Y"].default_value = 3.1 + seed
    cb.inputs["Z"].default_value = 7.3 + seed * 1.7
    nz = _n(nt, "ShaderNodeTexNoise", Scale=1.0, Detail=8.0, Roughness=0.72)
    nt.links.new(cb.outputs[0], nz.inputs["Vector"])
    cb2 = nt.nodes.new("ShaderNodeCombineXYZ")
    nt.links.new(_m(nt, "MULTIPLY", a, freq * 6.0), cb2.inputs["X"])
    cb2.inputs["Y"].default_value = 11.0 + seed
    nz2 = _n(nt, "ShaderNodeTexNoise", Scale=1.0, Detail=2.0, Roughness=0.5)
    nt.links.new(cb2.outputs[0], nz2.inputs["Vector"])
    jag = _m(nt, "ADD", _m(nt, "MULTIPLY", _m(nt, "SUBTRACT", nz.outputs["Fac"], 0.5), amp * 2.0),
             _m(nt, "MULTIPLY", _m(nt, "SUBTRACT", nz2.outputs["Fac"], 0.5), amp * 0.5))
    d = _m(nt, "ABSOLUTE", _m(nt, "SUBTRACT", _m(nt, "SUBTRACT", x, center_s), jag))
    if depth is not None:
        # only on the camera-facing side (depth axis < limit)
        ax, lim = depth
        d = _m(nt, "ADD", d, _m(nt, "MULTIPLY", _m(nt, "GREATER_THAN", sep.outputs[ax], lim), 10.0))
    wscale = None
    if taper is not None:
        t0, t1 = taper
        mr = _n(nt, "ShaderNodeMapRange", **{"From Min": t0, "From Max": t1, "To Min": 1.0,
                                             "To Max": 0.25})
        nt.links.new(a, mr.inputs["Value"])
        wscale = mr.outputs["Result"]
        d = _m(nt, "DIVIDE", d, wscale)
    core = _n(nt, "ShaderNodeMapRange", **{"From Min": width * 0.35, "From Max": width,
                                           "To Min": 1.0, "To Max": 0.0})
    nt.links.new(d, core.inputs["Value"])
    glow = _n(nt, "ShaderNodeMapRange", **{"From Min": 0.0, "From Max": halo, "To Min": 1.0,
                                           "To Max": 0.0})
    nt.links.new(d, glow.inputs["Value"])
    glow_sq = _m(nt, "POWER", glow.outputs["Result"], 2.2)
    seam = core.outputs["Result"]
    if branches > 0:
        # short side cracks near the seam (voronoi edges masked by the halo)
        vo = _n(nt, "ShaderNodeTexVoronoi", Scale=branches, _feature="DISTANCE_TO_EDGE")
        nt.links.new(tc.outputs[coord], vo.inputs["Vector"])
        br = _n(nt, "ShaderNodeMapRange", **{"From Min": 0.0, "From Max": 0.03, "To Min": 1.0,
                                             "To Max": 0.0})
        nt.links.new(vo.outputs["Distance"], br.inputs["Value"])
        near = _n(nt, "ShaderNodeMapRange", **{"From Min": halo * 0.4, "From Max": halo * 1.6,
                                               "To Min": 1.0, "To Max": 0.0})
        nt.links.new(d, near.inputs["Value"])
        seam = _m(nt, "MAXIMUM", seam, _m(nt, "MULTIPLY", _m(nt, "MULTIPLY", br.outputs["Result"],
                                                               near.outputs["Result"]), 0.7))
    if span is not None:
        s0, s1 = span
        f0 = _n(nt, "ShaderNodeMapRange", **{"From Min": s0, "From Max": s0 + (s1 - s0) * 0.12})
        nt.links.new(a, f0.inputs["Value"])
        f1 = _n(nt, "ShaderNodeMapRange", **{"From Min": s1, "From Max": s1 - (s1 - s0) * 0.12})
        nt.links.new(a, f1.inputs["Value"])
        env = _m(nt, "MULTIPLY", f0.outputs["Result"], f1.outputs["Result"])
        seam = _m(nt, "MULTIPLY", seam, env)
        glow_sq = _m(nt, "MULTIPLY", glow_sq, env)
    # colour cycling along the seam
    cph = _m(nt, "FRACT", _m(nt, "ADD", _m(nt, "MULTIPLY", a, col_freq),
                             _m(nt, "MULTIPLY", nz.outputs["Fac"], 0.6 + 0.0 * seed)))
    col = _ramp(nt, cph, RIFT_STOPS)
    hot = nt.nodes.new("ShaderNodeMix")
    hot.data_type = "RGBA"
    nt.links.new(_m(nt, "MULTIPLY", _m(nt, "POWER", seam, 4.0), 0.15), hot.inputs["Factor"])
    nt.links.new(col, hot.inputs[6])
    hot.inputs[7].default_value = (1.0, 0.97, 0.92, 1)
    em = _m(nt, "ADD", _m(nt, "MULTIPLY", seam, strength * RIFT_K),
            _m(nt, "MULTIPLY", glow_sq, halo_str * RIFT_K))
    # combine with an existing emission (e.g. star speckle) if any
    es = I["Emission Strength"]
    if es.links:
        prev = es.links[0].from_socket
        nt.links.remove(es.links[0])
        em = _m(nt, "ADD", em, prev)
    nt.links.new(em, es)
    if I["Emission Color"].links:
        nt.links.remove(I["Emission Color"].links[0])
    nt.links.new(hot.outputs[2], I["Emission Color"])
    # scorched, darker metal close to the crack
    if base_scorch is not None and not I["Base Color"].links:
        bc = nt.nodes.new("ShaderNodeMix")
        bc.data_type = "RGBA"
        nt.links.new(glow.outputs["Result"], bc.inputs["Factor"])
        bc.inputs[6].default_value = I["Base Color"].default_value
        bc.inputs[7].default_value = (*base_scorch, 1)
        nt.links.new(bc.outputs[2], I["Base Color"])
    return seam


def add_starfield(m, density=40.0, size=0.12, strength=6.0, color=STAR_WHITE, coord="Object"):
    """Tiny emissive star specks inside a dark material (night-sky metal /
    cloth).  Voronoi F1 cells with a random subset lit."""
    nt = m.node_tree
    I = _bsdf(m).inputs
    tc = nt.nodes.new("ShaderNodeTexCoord")
    vo = _n(nt, "ShaderNodeTexVoronoi", Scale=density, Randomness=1.0, _feature="F1")
    nt.links.new(tc.outputs[coord], vo.inputs["Vector"])
    sc = nt.nodes.new("ShaderNodeSeparateColor")
    nt.links.new(vo.outputs["Color"], sc.inputs[0])
    lit = _m(nt, "GREATER_THAN", sc.outputs[0], 0.72)
    dot = _n(nt, "ShaderNodeMapRange", **{"From Min": size * 0.3, "From Max": size, "To Min": 1.0,
                                          "To Max": 0.0})
    nt.links.new(vo.outputs["Distance"], dot.inputs["Value"])
    tw = _m(nt, "ADD", 0.4, _m(nt, "MULTIPLY", sc.outputs[1], 1.2))
    em = _m(nt, "MULTIPLY", _m(nt, "MULTIPLY", _m(nt, "MULTIPLY", dot.outputs["Result"], lit), tw),
            strength)
    es = I["Emission Strength"]
    if es.links:
        prev = es.links[0].from_socket
        nt.links.remove(es.links[0])
        em = _m(nt, "ADD", em, prev)
    nt.links.new(em, es)
    if not I["Emission Color"].links:
        I["Emission Color"].default_value = (*color, 1)
    return em


def thin_film(m, thickness=460.0, ior=1.75, vary=None, scale=2.5):
    """Thin-film iridescence.  vary=(t0, t1) drives the film thickness with
    object-space noise so the sheen shifts teal -> violet -> magenta."""
    I = _bsdf(m).inputs
    I["Thin Film Thickness"].default_value = thickness
    I["Thin Film IOR"].default_value = ior
    if vary is not None:
        nt = m.node_tree
        tc = nt.nodes.new("ShaderNodeTexCoord")
        nz = _n(nt, "ShaderNodeTexNoise", Scale=scale, Detail=3.0, Roughness=0.5)
        nt.links.new(tc.outputs["Object"], nz.inputs["Vector"])
        mr = _n(nt, "ShaderNodeMapRange", **{"From Min": 0.3, "From Max": 0.7, "To Min": vary[0],
                                             "To Max": vary[1]})
        nt.links.new(nz.outputs["Fac"], mr.inputs["Value"])
        nt.links.new(mr.outputs["Result"], I["Thin Film Thickness"])
    return m


# =============================================================================
#  Tier-7 materials / parts for the equipment pipeline (module E)
# =============================================================================
def EM_void(name="voidmetal", color=(0.024, 0.022, 0.044), rough=0.33, film=(230.0, 390.0),
            rift=None, stars=0.0, glow_str=0.75, metal=1.0, film_ior=1.33):
    """Void metal: near-black, polished, thin-film iridescent sheen (film
    thickness varies over the surface: teal / violet / magenta glints).
    rift = dict(add_rift kwargs) adds the emissive crack seam."""
    if name in E.G.mats:
        return E.G.mats[name]
    m = E.pbr(name, color, metal=metal, rough=rough, noise_rough=0.06)
    thin_film(m, sum(film) / 2, film_ior, vary=film)
    if stars:
        add_starfield(m, density=stars, size=0.11, strength=5.0)
    if rift is not None:
        add_rift(m, **rift)
    if rift is not None or stars:
        m["glow"] = list(RIFT_STOPS[2][1])
        m["glow_str"] = glow_str
        m["glow_norm"] = 1.0 / max(rift.get("strength", 14.0) * RIFT_K if rift else 6.0, 1.0)
    return m


def EM_stargold():
    """Pale 'star gold' trims (lighter, whiter than tier-5 gold)."""
    return E.pbr("stargold", (1.0, 0.9, 0.68), metal=1.0, rough=0.16, noise_rough=0.05)


def EM_starsilver():
    return E.pbr("starsilver", (0.9, 0.93, 1.0), metal=1.0, rough=0.12, noise_rough=0.04)


def EM_stargem():
    return E.pbr("stargem", (1.0, 0.95, 0.85), rough=0.02, trans=0.35, ior=2.0, spec=1.0,
                 emit=STAR_WHITE, emit_str=3.2, glow=(1.0, 0.9, 0.7), glow_str=1.3)


def EM_riftglow(name="riftglow", strength=8.0, col=(0.6, 0.35, 1.0)):
    """Solid iridescent emissive (floating shard cores, energy)."""
    if name in E.G.mats:
        return E.G.mats[name]
    strength *= GLOW_K
    m = E.pbr(name, tuple(c * 0.3 for c in col), rough=0.2, emit=col, emit_str=strength,
              glow=col, glow_str=1.0)
    nt = m.node_tree
    I = _bsdf(m).inputs
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Object"], sep.inputs[0])
    nz = _n(nt, "ShaderNodeTexNoise", Scale=2.5, Detail=3.0)
    nt.links.new(tc.outputs["Object"], nz.inputs["Vector"])
    ph = _m(nt, "FRACT", _m(nt, "ADD", _m(nt, "MULTIPLY", sep.outputs["Z"], 1.3), nz.outputs["Fac"]))
    nt.links.new(_ramp(nt, ph, RIFT_STOPS), I["Emission Color"])
    m["glow_norm"] = 1.0 / strength
    return m


def EM_riftshard(name="riftshard"):
    """Dark glassy shard whose facets glow iridescent at grazing angles."""
    if name in E.G.mats:
        return E.G.mats[name]
    m = E.pbr(name, (0.02, 0.015, 0.035), metal=0.3, rough=0.08, coat=1.0, emit=(0.5, 0.3, 1.0),
              emit_str=1.0, glow=(0.6, 0.35, 1.0), glow_str=0.8)
    thin_film(m, 520.0, 1.6)
    nt = m.node_tree
    I = _bsdf(m).inputs
    lw = _n(nt, "ShaderNodeLayerWeight", Blend=0.35)
    em = _m(nt, "MULTIPLY", _m(nt, "POWER", lw.outputs["Fresnel"], 1.5), 6.0)
    nt.links.new(em, I["Emission Strength"])
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Object"], sep.inputs[0])
    ph = _m(nt, "FRACT", _m(nt, "ADD", _m(nt, "MULTIPLY", sep.outputs["X"], 2.0),
                            _m(nt, "MULTIPLY", sep.outputs["Z"], 3.0)))
    nt.links.new(_ramp(nt, ph, RIFT_STOPS), I["Emission Color"])
    m["glow_norm"] = 1.0 / 6.0
    return m


def star_mesh_E(r1, r2, depth, n=4, mat=None, loc=(0, 0, 0), rot=(0, 0, 0), back=None,
                name="stargem", rot0=math.pi / 2):
    """Faceted bipyramid star (outline in the local XZ plane, apex toward -Y)."""
    back = depth if back is None else back
    verts = []
    for i in range(2 * n):
        r = r1 if i % 2 == 0 else r2
        a = rot0 + math.pi * i / n
        verts.append((r * math.cos(a), 0.0, r * math.sin(a)))
    f = len(verts)
    verts.append((0.0, -depth, 0.0))
    b = len(verts)
    verts.append((0.0, back, 0.0))
    faces = []
    k = 2 * n
    for i in range(k):
        j = (i + 1) % k
        faces.append((i, j, f))
        faces.append((j, i, b))
    ob = E.make_mesh(name, verts, faces, mat, smooth=False, loc=loc, rot=rot)
    me = ob.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    return ob


def star_gem(r, loc, rot=(0, 0, 0), n=4, setting=True, ring_mat=None, depth=None):
    """Small warm-white star gem, optionally in a pale-gold star setting."""
    depth = depth if depth is not None else r * 0.55
    with E.group(loc, rot, 1.0, name="star_gem"):
        if setting:
            star_mesh_E(r * 1.28, r * 0.5, depth * 0.35, n=n, mat=ring_mat or EM_stargold(),
                        loc=(0, depth * 0.35, 0), rot0=math.pi / 2 + math.pi / n, name="star_set")
        star_mesh_E(r, r * 0.34, depth, n=n, mat=EM_stargem(), back=depth * 0.3)


def glint_E(loc, size, color=STAR_WHITE, strength=10.0, name="glint"):
    """Flat 4-point starlight glint.  Rotation is fixed up after the view is
    known (see face_camera) so it always faces the camera."""
    m = E.pbr("glint_%d%d%d" % tuple(int(c * 9) for c in color), color, rough=0.3, emit=color,
              emit_str=strength, glow=color, glow_str=1.2)
    ob = star_mesh_E(size, size * 0.14, size * 0.05, n=4, mat=m, loc=loc, name=name, rot0=0.0)
    ob["face_camera"] = True
    return ob


def face_camera():
    """Counter-rotate objects tagged face_camera by the presentation rotation
    so flat glints stay facing the camera (call after view())."""
    v = E.G.view
    R = (Matrix.Rotation(rad(v["diag"]), 4, "Y") @ Matrix.Rotation(rad(v["pitch"]), 4, "X")
         @ Matrix.Rotation(rad(v["yaw"]), 4, "Z") @ Matrix.Rotation(rad(v["roll"]), 4, "Y"))
    Rinv = R.inverted()
    for ob in E.G.coll.objects:
        if ob.get("face_camera"):
            P = Matrix()
            p = ob.parent
            while p is not None and p is not E.G.root:
                P = p.matrix_basis @ P
                p = p.parent
            ob.rotation_mode = "QUATERNION"
            ob.rotation_quaternion = (P.inverted().to_quaternion() @ Rinv.to_quaternion())


def shard_E(loc, r, h, rot=(0, 0, 0), mat=None, name="rshard"):
    """Floating rift shard (elongated faceted crystal)."""
    return E.lathe([(0, -h * 0.45), (r, -h * 0.1), (r * 0.8, h * 0.25), (0, h * 0.55)],
                   mat or EM_riftshard(), seg=4, loc=loc, rot=rot, smooth=False, name=name)


# =============================================================================
#  TIER-7 EQUIPMENT ICONS
# =============================================================================
@equip("sword_7")
def sword_7():
    """Rift blade: void-metal blade split along its length by an iridescent
    crack, chips of the edge drifting off near the tip, a ring of rift light
    at the root, star-gold crescent guard with a star gem."""
    blade_m = EM_void("rift_blade", rift=dict(along="Z", across="X", center=0.0, amp=0.05,
                                              freq=2.2, width=0.022, halo=0.055, strength=12.0,
                                              halo_str=0.8, span=(0.0, 1.1),
                                              taper=(0.0, 1.1), branches=4.0))
    edge_m = E.pbr("rift_edge", (0.62, 0.66, 0.78), metal=1.0, rough=0.12)
    thin_film(edge_m, 300.0, 1.35, vary=(250.0, 380.0))
    gold = EM_stargold()
    void = EM_void("voidmetal")
    L = 1.12

    def fn(t):
        w = 0.105 * (1 - 0.15 * t) * (1 + 0.1 * math.sin(t * math.pi))
        if t > 0.8:
            w *= ((1 - t) / 0.2) ** 0.8
        return w, 0.0, 0.024 * (1 - 0.45 * t), 0.0
    E.blade(L, fn, blade_m, edge_m, cross="hex", n=64)
    # chips of the blade edge drifting away near the tip
    for (x, z, r, h, a) in ((0.15, 0.86, 0.03, 0.09, 30), (-0.14, 0.93, 0.024, 0.07, -40),
                            (0.2, 1.02, 0.018, 0.05, 55)):
        shard_E((x, 0.0, z), r, h, rot=(rad(20), rad(a), 0), mat=EM_riftshard())
    # thin ring of rift light around the blade root
    E.torus(0.16, 0.007, EM_riftglow("ringglow", 7.0), loc=(0, 0, 0.12), rot=(rad(72), 0, 0),
            seg=64, rseg=8, name="halo")
    # crescent guard: two upswept horns, star-gold inlay
    half = [(0.0, 0.035), (0.06, 0.03), (0.13, 0.06), (0.2, 0.13), (0.24, 0.22), (0.215, 0.1),
            (0.17, 0.02), (0.1, -0.035), (0.03, -0.055), (0.0, -0.06)]
    E.extrude(E.mirror_x(half), 0.055, void, bev=0.01, name="guard")
    E.extrude(E.mirror_x([(x * 0.86, z * 0.86 + 0.004) for x, z in half]), 0.07, gold,
              bev=0.006, name="guard_inlay")
    star_gem(0.055, (0, -0.045, -0.005), n=4)
    E.grip(-0.27, -0.05, 0.022, E.pbr("wrap_night", (0.05, 0.04, 0.09), rough=0.4, coat=0.4),
           wraps=9, name="grip")
    E.torus(0.028, 0.008, gold, loc=(0, 0, -0.05), seg=24, rseg=6, name="collar")
    pz = E.pommel("pear", -0.27, 0.034, void, 0.022)
    star_mesh_E(0.032, 0.012, 0.018, n=4, mat=EM_stargem(), loc=(0, 0, pz - 0.014))
    glint_E((0.0, -0.05, 1.2), 0.07)
    glint_E((0.15, -0.05, 0.1), 0.035)
    E.view(diag=45, yaw=-25, glow=1.0)
    face_camera()


def void_bead(p, t, r, h, mat, sides=6, name="bead"):
    """Elongated faceted bead centred at p, long axis along tangent t."""
    q = Vector(t).normalized().to_track_quat("Z", "Y")
    return E.lathe([(0, -h / 2), (r, -h * 0.12), (r, h * 0.12), (0, h / 2)], mat, seg=sides,
                   loc=p, rot=q.to_euler(), smooth=False, name=name)


@equip("whip_7")
def whip_7():
    """Starlight lash: faceted void-crystal vertebrae threaded on a cord of
    iridescent rift light, void-metal handle with a glowing seam, star-gold
    fittings, a star crystal at the pommel and another as the cracker."""
    void = EM_void("voidmetal")
    gold = EM_stargold()
    handle_m = EM_void("rift_handle", rift=dict(along="Z", across="X", amp=0.012, freq=5.0,
                                                width=0.009, halo=0.022, strength=11.0,
                                                halo_str=0.6, span=(0.04, 0.46),
                                                depth=("Y", 0.004)))
    bead_m = EM_riftshard("lash_crys")
    with E.group((0, 0, 0), (0, rad(-8), 0)):
        top = E.whip_handle(handle_m, void, ferrule_mat=gold, knot_mat=void, length=0.5, r=0.046)
        for z in (0.05, 0.27):
            E.torus(0.05, 0.011, gold, loc=(0, 0, z), seg=24, rseg=6, name="band")
        star_mesh_E(0.085, 0.03, 0.035, n=4, mat=EM_stargem(), loc=(0, -0.01, -0.14))
    path = E.coil_path((top.x + 0.07, 0, top.z + 0.02), turns=2.0, center=(0.42, 0, 0.86))
    path = E.lash_with_tail(path, drop=(0.2, -0.5))
    E.sweep(path, lambda s: 0.014 * (1 - 0.6 * s) + 0.004, EM_riftglow("lash_core", 8.0),
            segs=8, name="lash_core")
    pts = E.resample(path, 0.062)
    n = len(pts)
    for i in range(n - 1):
        a, b = pts[i], pts[i + 1]
        sc = 1 - 0.6 * i / n
        void_bead((a + b) / 2, b - a, 0.036 * sc, 0.054, bead_m if i % 3 else gold, sides=4)
    tip = path[-1]
    star_mesh_E(0.07, 0.024, 0.03, n=4, mat=EM_stargem(), loc=tip + Vector((0, -0.01, -0.02)))
    glint_E(tip + Vector((0.02, -0.05, -0.02)), 0.08)
    glint_E(Vector((0.62, -0.05, 1.12)), 0.04)
    E.view(diag=0, glow=1.0)
    face_camera()


@equip("greatsword_7")
def greatsword_7():
    """Riven greatsword: a broad void-metal blade torn lengthwise by the rift,
    iridescent light pouring through the gap, star-gold winged guard."""
    half_m = EM_void("riven_void", rift=dict(along="Z", across="Y", center=0.0, amp=0.004,
                                             freq=3.0, width=0.004, halo=0.012, strength=0.0,
                                             halo_str=0.0), film=(240.0, 400.0))
    edge_m = E.pbr("rift_edge", (0.62, 0.66, 0.78), metal=1.0, rough=0.12)
    thin_film(edge_m, 300.0, 1.35, vary=(250.0, 380.0))
    gold = EM_stargold()
    void = EM_void("voidmetal")
    L = 1.3

    def W(t):
        w = 0.17 * (1 + 0.08 * t)
        if t > 0.74:
            w *= max(0.0, (1 - t) / 0.26) ** 0.75
        return w

    def g(t):
        if t < 0.05:
            return 0.02 + 0.02 * t / 0.05
        if t > 0.6:
            return 0.04 * max(0.0, 1 - (t - 0.6) / 0.22) ** 1.3
        return 0.04

    for side in (-1, 1):
        def fn(t, side=side):
            ww, gg = W(t), g(t)
            return max((ww - gg) / 2, 0.002), side * (ww + gg) / 2, 0.028 * (1 - 0.4 * t), 0.0
        E.blade(L, fn, half_m, edge_m, cross="hex", n=64, name="half")
    # rift light in the gap
    ts = [i / 40 * 0.84 for i in range(41)]
    out = [(g(t) * 0.9 + 0.004, t * L) for t in ts] + \
        [(-(g(t) * 0.9 + 0.004), t * L) for t in reversed(ts)]
    E.extrude(out, 0.03, EM_riftglow("gap_light", 9.0), name="gap_light")
    # guard: void bar with star-gold swept wings
    E.box((0.46, 0.08, 0.075), void, loc=(0, 0, -0.035), bev=0.02, name="guard")
    for sx in (-1, 1):
        wingp = [(0.0, 0.0), (0.1, 0.02), (0.2, 0.07), (0.28, 0.16), (0.3, 0.26), (0.24, 0.16),
                 (0.16, 0.1), (0.2, 0.18), (0.14, 0.12), (0.06, 0.05)]
        E.extrude([(sx * (0.2 + x), z - 0.06) for x, z in wingp], 0.05, gold, bev=0.008,
                  name="wing")
    star_gem(0.07, (0, -0.05, -0.035), n=4)
    E.grip(-0.46, -0.075, 0.03, E.pbr("wrap_night", (0.05, 0.04, 0.09), rough=0.4, coat=0.4),
           wraps=12, name="grip")
    E.torus(0.036, 0.01, gold, loc=(0, 0, -0.08), seg=24, rseg=6, name="collar")
    pz = E.pommel("pear", -0.46, 0.042, void, 0.03)
    star_mesh_E(0.045, 0.016, 0.022, n=4, mat=EM_stargem(), loc=(0, 0, pz - 0.02))
    for (x, z, r, h, a) in ((0.0, 1.16, 0.026, 0.08, 10), (0.08, 1.24, 0.02, 0.06, 40),
                            (-0.06, 1.3, 0.016, 0.05, -30)):
        shard_E((x, 0.0, z), r, h, rot=(rad(15), rad(a), 0))
    glint_E((0.0, -0.06, 1.35), 0.06)
    glint_E((0.18, -0.06, 0.02), 0.035)
    E.view(diag=45, yaw=-22, glow=1.0)
    face_camera()


@equip("dagger_7")
def dagger_7():
    """Crescent fang: curved void-metal blade with a glowing rift crack,
    crescent-moon guard, star-gold collar and a star gem pommel."""
    CURVE = 0.14
    L = 0.64
    blade_m = EM_void("fang_blade", rift=dict(along="Z", across="X", center=0.0, amp=0.03,
                                              freq=4.0, width=0.016, halo=0.04, strength=12.0,
                                              halo_str=0.8, span=(0.02, 0.62),
                                              taper=(0.0, 0.66), bend=CURVE / (L * L)))
    edge_m = E.pbr("rift_edge", (0.62, 0.66, 0.78), metal=1.0, rough=0.12)
    thin_film(edge_m, 300.0, 1.35, vary=(250.0, 380.0))
    gold = EM_stargold()
    void = EM_void("voidmetal")

    def fn(t):
        w = 0.07 * (1 + 0.25 * math.sin(t * math.pi * 0.8))
        if t > 0.7:
            w *= ((1 - t) / 0.3) ** 0.9
        return w, CURVE * t * t, 0.02 * (1 - 0.5 * t), 0.0
    E.blade(L, fn, blade_m, edge_m, cross="hex", n=56)
    # guard: star-gold horns curving up along the blade, void boss with the seam
    horn = [(0.0, -0.02), (0.06, -0.03), (0.12, -0.02), (0.17, 0.02), (0.2, 0.08), (0.21, 0.15)]
    for sx in (-1, 1):
        E.extrude(E.thick_polyline([(sx * x, z) for x, z in horn], 0.05, 0.012), 0.045, gold,
                  bev=0.008, name="horn", loc=(0, 0, -0.03))
    E.lathe(E.smooth_profile([(0, -0.1), (0.045, -0.09), (0.055, -0.05), (0.04, -0.01), (0, 0.0)],
                             3), void, seg=24, sy=0.7, name="boss")
    E.torus(0.03, 0.009, gold, loc=(0, 0, -0.07), seg=24, rseg=6, name="collar")
    E.handle_oval(-0.3, -0.07, 0.026, E.pbr("wrap_night", (0.05, 0.04, 0.09), rough=0.4, coat=0.4),
                  name="handle")
    E.torus(0.028, 0.008, gold, loc=(0, 0, -0.3), seg=24, rseg=6, name="collar2")
    star_gem(0.05, (0, 0.0, -0.36), n=4)
    for (x, z, r, h, a) in ((0.2, 0.52, 0.02, 0.06, 40), (0.07, 0.72, 0.016, 0.05, -20)):
        shard_E((x, 0.0, z), r, h, rot=(rad(15), rad(a), 0))
    glint_E((0.14, -0.05, 0.66), 0.06)
    E.view(diag=45, yaw=-18, glow=1.0)
    face_camera()


@equip("gun_7")
def gun_7():
    """Astral hand-cannon: heavy octagonal void-metal barrel with a rift seam
    and star-gold bands, a flared star-gold muzzle full of rift light, a
    crystal chamber holding a star gem, night-leather grip."""
    gold = EM_stargold()
    void = EM_void("voidmetal")
    barrel_m = EM_void("barrel_void", rift=dict(along="Z", across="X", center=0.0, amp=0.016,
                                                freq=4.0, width=0.011, halo=0.03, strength=11.0,
                                                halo_str=0.8, span=(0.0, 0.56),
                                                depth=("Y", 0.0)))
    z = 0.06
    x0, x1 = 0.08, 0.66
    E.barrel_x(x0, x1, z, 0.058, barrel_m, sides=8, r_end=0.05, bore=False, name="barrel")
    E.barrel_x(x0, x0 + 0.38, z - 0.078, 0.02, void, bore=False, name="rail")
    for x in (0.16, 0.36, 0.56):
        E.torus(0.062, 0.013, gold, loc=(x, 0, z), rot=(0, rad(90), 0), seg=32, rseg=6, name="band")
    # flared muzzle with rift light inside
    E.lathe([(0.052, 0.0), (0.06, 0.04), (0.1, 0.11), (0.115, 0.13), (0.09, 0.13), (0.05, 0.06),
             (0.0, 0.06)], gold, seg=40, loc=(x1 - 0.01, 0, z), rot=(0, rad(90), 0), name="muzzle")
    E.cyl(0.085, 0.01, EM_riftglow("maw", 9.0), loc=(x1 + 0.1, 0, z), rot=(0, rad(90), 0), seg=32,
          name="maw")
    for k in range(6):
        a = TAU * k / 6
        d = Vector((0, math.cos(a), math.sin(a)))
        p0 = Vector((x1 + 0.1, 0, z)) + d * 0.1
        E.lathe([(0, 0), (0.014, 0.01), (0, 0.06)], gold, seg=4, loc=p0,
                rot=(d + Vector((0.6, 0, 0))).normalized().to_track_quat("Z", "Y").to_euler(),
                smooth=False, name="crown_tip")
    E.torus(0.07, 0.008, EM_riftglow("muzzle_ring", 8.0), loc=(x1 + 0.2, 0, z),
            rot=(0, rad(90), 0), seg=48, rseg=6, name="muzzle_ring")
    # frame
    frame = [(-0.16, 0.12), (0.1, 0.13), (0.12, 0.1), (0.12, -0.04), (0.04, -0.07),
             (-0.05, -0.08), (-0.12, -0.05), (-0.18, 0.05)]
    E.extrude(frame, 0.09, void, bev=0.016, name="frame")
    E.extrude([(x * 0.86 - 0.01, zz * 0.78 + 0.01) for x, zz in frame], 0.1, gold, bev=0.005,
              name="frame_trim")
    # crystal chamber with the star gem
    E.sphere(0.075, EM_riftshard("chamber_crys"), loc=(-0.02, 0.0, 0.1), scale=(1.2, 1.0, 1.0),
             seg=8, rings=5, name="chamber")
    star_gem(0.05, (-0.02, -0.085, 0.1), n=4)
    ham = [(-0.14, 0.12), (-0.18, 0.17), (-0.22, 0.185), (-0.23, 0.17), (-0.19, 0.15),
           (-0.16, 0.1)]
    E.extrude(ham, 0.03, gold, bev=0.005, name="hammer")
    E.trigger_guard(-0.06, 0.07, -0.07, 0.08, 0.011, gold)
    gp = E.grip_shape(-0.11, -0.04, 0.27, 0.095, angle=26, butt=1.2, curve=0.07)
    E.extrude(gp, 0.08, E.pbr("grip_night", (0.04, 0.035, 0.07), rough=0.45, coat=0.4,
                              bump=0.2, bump_scale=60), bev=0.018, name="grip", bev_angle=50)
    bc = E.grip_end(-0.11, -0.04, 0.27, 26, 0.07)
    E.sphere(0.045, gold, loc=bc, scale=(1.0, 0.9, 0.65), name="butt_cap")
    star_mesh_E(0.05, 0.018, 0.024, n=4, mat=EM_stargem(), loc=bc + Vector((-0.01, -0.045, -0.02)))
    glint_E((x1 + 0.2, -0.1, z + 0.09), 0.06)
    E.view(diag=24, yaw=-32, glow=1.0)
    face_camera()


@equip("staff_7")
def staff_7():
    """Star-crescent staff: void-metal shaft with a rift seam, a star-gold
    crescent cradling a floating eight-point star crystal inside a tilted
    orbit of rift light, drifting shards."""
    gold = EM_stargold()
    void = EM_void("voidmetal")
    shaft = EM_void("shaft_void", rift=dict(along="Z", across="X", amp=0.01, freq=4.0,
                                            width=0.007, halo=0.018, strength=10.0, halo_str=0.5,
                                            span=(-0.8, 0.45), depth=("Y", 0.0)))
    E.lathe([(0, -0.86), (0.026, -0.86), (0.03, 0.5), (0, 0.52)], shaft, seg=20, name="shaft")
    E.grip(-0.3, 0.02, 0.033, E.pbr("wrap_night", (0.05, 0.04, 0.09), rough=0.4, coat=0.4),
           wraps=9, name="grip")
    for zz in (-0.8, -0.31, 0.04, 0.42):
        E.torus(0.034, 0.01, gold, loc=(0, 0, zz), seg=24, rseg=6, name="band")
    E.lathe([(0, -0.95), (0.018, -0.92), (0.034, -0.86), (0, -0.84)], gold, seg=4, smooth=False,
            name="butt")
    E.lathe(E.smooth_profile([(0, 0.46), (0.04, 0.46), (0.075, 0.54), (0.06, 0.6), (0, 0.6)], 3),
            void, seg=24, name="head_base")
    moon = E.shape_crescent(0.36, 0.31, 0.15)
    pts = [(-zz, x + 0.02) for x, zz in moon]
    E.extrude([(x, zz + 0.9) for x, zz in pts], 0.065, gold, bev=0.012, name="crescent")
    E.extrude([(x * 0.9, zz * 0.9 + 0.9) for x, zz in pts], 0.08, void, bev=0.006,
              name="crescent_core")
    SZ = 0.97
    star_mesh_E(0.2, 0.065, 0.1, n=4, mat=EM_stargem(), loc=(0, -0.02, SZ))
    star_mesh_E(0.13, 0.05, 0.06, n=4, mat=EM_stargem(), loc=(0, -0.01, SZ), rot0=math.pi / 4 + math.pi / 2)
    E.torus(0.27, 0.008, EM_riftglow("orbit", 8.0), loc=(0, 0, SZ), rot=(rad(70), rad(-20), 0),
            seg=64, rseg=6, name="orbit")
    for (x, zz, r, h, a) in ((0.26, 1.08, 0.024, 0.07, 30), (-0.25, 1.12, 0.02, 0.06, -35),
                             (0.3, 0.8, 0.016, 0.05, 60)):
        shard_E((x, 0.0, zz), r, h, rot=(rad(15), rad(a), 0))
    glint_E((0.08, -0.12, SZ + 0.1), 0.09)
    glint_E((-0.2, -0.1, 0.72), 0.04)
    E.view(diag=40, yaw=-20, glow=1.0)
    face_camera()


@equip("spear_7")
def spear_7():
    """Rift lance (이졸데): void-metal pole split by a rift seam, star-gold
    bands and a winged star-gold collar, a long faceted void blade with a
    glowing rift core, a star gem in the collar and a mane of rift light."""
    gold = EM_stargold()
    void = EM_void("voidmetal")
    shaft = EM_void("spear_void", rift=dict(along="Z", across="X", amp=0.01, freq=4.0,
                                            width=0.007, halo=0.018, strength=10.0, halo_str=0.5,
                                            span=(-0.7, 0.4), depth=("Y", 0.0)))
    E.lathe([(0, -0.78), (0.025, -0.78), (0.024, 0.44), (0, 0.44)], shaft, seg=20, name="shaft")
    E.grip(-0.42, -0.16, 0.03, E.pbr("wrap_night", (0.05, 0.04, 0.09), rough=0.4, coat=0.4),
           wraps=8, name="grip")
    for zz in (-0.72, -0.12, 0.3):
        E.torus(0.029, 0.009, gold, loc=(0, 0, zz), seg=24, rseg=6, name="band")
    E.lathe([(0, -0.86), (0.016, -0.84), (0.03, -0.78), (0, -0.76)], gold, seg=4, smooth=False,
            name="butt")
    top = 0.44 + 0.11
    E.lathe(E.smooth_profile([(0, 0.44), (0.035, 0.44), (0.045, 0.48), (0.032, top), (0, top)], 3),
            gold, seg=24, name="collar")
    wing = [(0.02, 0.0), (0.08, 0.03), (0.16, 0.1), (0.23, 0.19), (0.16, 0.1), (0.19, 0.06),
            (0.11, 0.03), (0.05, -0.02)]
    for sx in (-1, 1):
        E.extrude([(sx * x, z) for x, z in wing], 0.03, gold, loc=(0, 0, top - 0.06), bev=0.006,
                  name="collar_wing")

    def fn(t):
        w = 0.06 * (0.45 + 0.55 * math.sin(min(1.0, t / 0.35) * math.pi / 2))
        if t > 0.35:
            w = 0.06 * ((1 - t) / 0.65) ** 0.85
        return w, 0.0, 0.02 * (1 - 0.5 * t), 0
    E.blade(0.58, fn, void, E.pbr("rift_edge", (0.85, 0.8, 1.0), metal=1, rough=0.06),
            cross="lens", z0=top - 0.01, n=56)
    E.blade(0.46, lambda t: (0.012 * (1 - t) ** 0.6, 0.0, 0.005, 0), EM_riftglow("lance_core", 10.0),
            cross="diamond", z0=top + 0.04, n=20, name="core").location.y = -0.01
    star_gem(0.03, (0, -0.035, top - 0.04))
    for i in range(5):
        a = (i - 2) / 2
        p0 = Vector((0.0, a * 0.02, top - 0.08))
        p3 = Vector((0.12 + 0.05 * (1 + a), -0.03 + a * 0.05, top - 0.42))
        E.sweep(E.bezier(p0, p0 + Vector((0.05, 0, -0.02)), p3 + Vector((-0.04, 0, 0.12)), p3, 20),
                lambda s: 0.009 * (1.2 - 0.9 * s), EM_riftglow("mane_rift", 6.0), segs=8, name="mane")
    shard_E((0.16, 0.0, 1.0), 0.02, 0.06, rot=(rad(15), rad(30), 0))
    glint_E((0.03, -0.1, top + 0.4), 0.07)
    E.view(diag=42, yaw=-22, fill=0.9, glow=1.0)
    face_camera()


@equip("head_7")
def head_7():
    """Rift crown-helm: void-metal helm split by a glowing crack, T visor
    burning with rift light, a crown of crystal spikes on a star-gold band,
    star gem on the brow, swept star-gold fins and a halo behind."""
    helm_m = EM_void("helm_void", rift=dict(along="Z", across="X", center=0.1, amp=0.06,
                                            freq=3.0, width=0.014, halo=0.04, strength=11.0,
                                            halo_str=0.7, span=(0.08, 0.92), depth=("Y", -0.05),
                                            branches=4.0))
    gold = EM_stargold()
    void = EM_void("voidmetal")
    inner = E.pbr("helm_void_in", (0.0, 0.0, 0.0), rough=1.0, spec=0.0)
    helm = E.lathe(E.smooth_profile([(0.0, 0.0), (0.27, 0.0), (0.3, 0.14), (0.315, 0.4),
                                     (0.29, 0.6), (0.21, 0.78), (0.09, 0.93), (0.0, 1.0)], 5),
                   helm_m, seg=64, sy=1.08, xsec=E.ridge_xsec(0.2, 0.28), name="helm")
    # T visor
    c1 = E.box((0.4, 0.4, 0.06), void, loc=(0, -0.3, 0.46), name="visor_cut")
    c2 = E.box((0.07, 0.4, 0.28), void, loc=(0, -0.3, 0.32), name="visor_cut2")
    E.boolean(helm, c1)
    E.boolean(helm, c2)
    E.lathe([(0.0, 0.02), (0.27, 0.02), (0.28, 0.7), (0.0, 0.7)], inner, seg=32, name="void")
    E.box((0.36, 0.02, 0.045), EM_riftglow("visor_glow", 12.0), loc=(0, -0.29, 0.46),
          name="visor_l")
    E.box((0.05, 0.02, 0.24), EM_riftglow("visor_glow", 12.0), loc=(0, -0.3, 0.33), name="visor_v")
    # cheek guards
    for sx in (-1, 1):
        cheek = [(sx * 0.06, 0.4), (sx * 0.26, 0.42), (sx * 0.3, 0.1), (sx * 0.12, -0.02)]
        E.extrude(cheek, 0.03, void, loc=(0, -0.31, 0), rot=(0, 0, sx * 0.4), bev=0.008, name="cheek")
        E.sweep([(sx * 0.07, -0.33, 0.39), (sx * 0.27, -0.33, 0.41)], 0.008, gold, segs=6,
                name="cheek_trim")
    # star-gold crown band: alternating star-gold spires and rift crystals
    E.torus(0.3, 0.026, gold, loc=(0, 0, 0.6), sy=1.08, seg=72, rseg=8, name="crown_band")
    spike_m = EM_riftshard("crown_crys")
    for k in range(9):
        a = -math.pi / 2 + (k - 4) * 0.36
        p = Vector((0.3 * math.cos(a), 0.3 * 1.08 * math.sin(a), 0.6))
        h = (0.36 - 0.05 * abs(k - 4)) * (1.0 if k % 2 == 0 else 0.75)
        d = Vector((math.cos(a) * 0.22, math.sin(a) * 0.22, 1.0)).normalized()
        q = d.to_track_quat("Z", "Y")
        E.lathe([(0, 0), (0.038, 0.03), (0.03, h * 0.7), (0, h)], gold if k % 2 == 0 else spike_m,
                seg=4, loc=p, rot=q.to_euler(), smooth=False, name="crown_spike")
    star_gem(0.075, (0, -0.36, 0.63), rot=(rad(-8), 0, 0), n=4)
    # swept star-gold feathers on the sides
    for sx in (-1, 1):
        for k, (L, W, ang) in enumerate(((0.36, 0.1, 52), (0.3, 0.09, 70), (0.22, 0.08, 88))):
            E.feather(L, W, gold, loc=(sx * 0.3, 0.06 + 0.02 * k, 0.4 + 0.02 * k),
                      rot=(0, sx * rad(ang), 0), name="feather")
    E.torus(0.3, 0.02, void, loc=(0, 0, 0.02), sy=1.08, seg=64, rseg=8, name="rim")
    E.torus(0.31, 0.009, gold, loc=(0, 0, 0.045), sy=1.08, seg=64, rseg=6, name="rim_trim")
    glint_E((0.3, -0.4, 0.95), 0.06)
    E.view(yaw=22, pitch=6, glow=1.0)
    face_camera()


@equip("body_7")
def body_7():
    """Rift plate: void-metal cuirass torn by a glowing crack, star-gold
    trims, crystal-spiked pauldrons and a star gem at the heart."""
    xs = E.ridge_xsec(0.14, 0.35)
    plate = EM_void("plate_void", rift=dict(along="Z", across="X", center=0.03, amp=0.14,
                                            freq=2.2, width=0.016, halo=0.045, strength=11.0,
                                            halo_str=0.7, span=(0.42, 0.95), depth=("Y", -0.05),
                                            branches=3.0))
    void = EM_void("voidmetal")
    gold = EM_stargold()
    E.torso_shell(plate, 0.42, 0.93, xsec=xs, name="breastplate", thick=0.025)
    E.band_at(0.425, gold, r=0.013, xsec=xs, off=0.012, name="trim")
    for k in range(3):
        z1 = 0.42 - k * 0.085
        z0 = z1 - 0.1
        prof = [(E.torso_r(z0) * (1.06 + 0.02 * k), z0), (E.torso_r(z1) * (1.02 + 0.02 * k), z1)]
        ob = E.lathe(prof, void, seg=64, sx=E.TSX, sy=E.TSY, cap=False, xsec=xs, name="lame")
        E.solidify(ob, 0.018)
        pts = [Vector((prof[0][0] * math.cos(TAU * i / 64) * xs(TAU * i / 64, 0) * E.TSX,
                       prof[0][0] * math.sin(TAU * i / 64) * xs(TAU * i / 64, 0) * E.TSY, z0))
               for i in range(65)]
        E.sweep(pts, 0.009, gold, segs=6, caps=False, name="lame_trim")
    for side in (-1, 1):
        a = -math.pi / 2 + side * 0.5
        p = E.torso_pt(a, 0.12, off=0.04, scale=1.12)
        E.extrude([(-0.09, 0.0), (0.09, 0.0), (0.06, -0.18), (0.0, -0.26), (-0.06, -0.18)], 0.02,
                  void, loc=(p.x, p.y, 0.12), rot=(0, 0, side * 0.25), bev=0.008, name="tasset")
    E.torus(0.19, 0.04, void, loc=(0, 0, 0.95), sx=1.0, sy=0.72, name="gorget")
    E.torus(0.2, 0.012, gold, loc=(0, 0, 0.98), sx=1.0, sy=0.74, name="gorget_trim")
    spike_m = EM_riftshard("pauldron_crys")
    for side in (-1, 1):
        E.pauldron(void, side, (side * 0.38, 0.0, 0.84), 0.23, 3, trim=gold)
        for k, (dx, h, tilt) in enumerate(((0.0, 0.3, 20), (0.08, 0.22, 40), (-0.07, 0.18, 5))):
            p = Vector((side * (0.4 + dx), -0.02 * k, 0.94))
            d = Vector((side * math.sin(rad(tilt)), 0.0, math.cos(rad(tilt))))
            q = d.to_track_quat("Z", "Y")
            E.lathe([(0, 0), (0.04, 0.03), (0.035, h * 0.7), (0, h)], spike_m, seg=4, loc=p,
                    rot=q.to_euler(), smooth=False, name="p_spike")
    p = E.torso_pt(-math.pi / 2, 0.68, off=0.03, xsec=xs)
    star_gem(0.085, p + Vector((0, -0.01, 0)), n=4)
    glint_E(p + Vector((0.12, -0.08, 0.1)), 0.06)
    E.view(yaw=0, pitch=8, glow=1.0)
    face_camera()


@equip("cloak_7")
def cloak_7():
    """Night-sky mantle: iridescent void outside, a lining that is a starry
    night full of nebula light, star-gold trims, star clasps; the hem frays
    into drifting shards."""
    if "nightsky" not in E.G.mats:
        sky = E.pbr("nightsky", (0.02, 0.02, 0.06), rough=0.55, sheen=0.4)
        nt = sky.node_tree
        I = _bsdf(sky).inputs
        tc = nt.nodes.new("ShaderNodeTexCoord")
        nz = _n(nt, "ShaderNodeTexNoise", Scale=2.2, Detail=6.0, Roughness=0.6, Distortion=0.8)
        nt.links.new(tc.outputs["Object"], nz.inputs["Vector"])
        neb = _ramp(nt, nz.outputs["Fac"], [(0.3, (0.008, 0.01, 0.035)), (0.5, (0.03, 0.02, 0.1)),
                                             (0.62, (0.12, 0.03, 0.2)), (0.72, (0.02, 0.1, 0.18))])
        nt.links.new(neb, I["Base Color"])
        add_starfield(sky, density=34.0, size=0.14, strength=7.0)
        sky["glow"] = list(STAR_WHITE)
        sky["glow_str"] = 0.5
        sky["glow_norm"] = 1.0 / 7.0
    sky = E.G.mats["nightsky"]
    outer = EM_void("cloak_void", color=(0.03, 0.028, 0.06), rough=0.45, film=(250.0, 420.0),
                    metal=0.2)
    gold = EM_stargold()

    def hem(u):
        return 0.07 * abs(math.sin(u * 3.5 * math.pi)) ** 1.5 + 0.02 * math.sin(u * 13)
    c = E.Cape(folds=7, fold_amp=0.06, hem=hem, wrap_bot=120, r_bot=0.6)
    c.build(outer, sky)
    for which in ("left", "right", "hem"):
        E.sweep(c.edge_path(which, off=0.0), 0.014, gold, segs=6, name="trim")
    E.collar_stand(outer, sky, r0=0.17, r1=0.3, h=0.3, wrap=125, flare=0.14)
    pL, pR = E.clasp_pair(c, gold, chain_mat=gold, r=0.05)
    for pp in (pL, pR):
        star_mesh_E(0.06, 0.022, 0.03, n=4, mat=EM_stargem(), loc=pp + Vector((0, -0.03, 0)))
    for (u, dz, r, h, a) in ((-0.5, 0.12, 0.03, 0.09, 20), (0.1, 0.16, 0.024, 0.07, -30),
                             (0.6, 0.1, 0.02, 0.06, 45), (-0.15, 0.24, 0.016, 0.05, 10)):
        p = c.P(u, 1.0, 0.02)
        shard_E((p.x, p.y - 0.05, p.z - dz), r, h, rot=(rad(15), rad(a), 0))
    glint_E(pR + Vector((0.08, -0.08, 0.08)), 0.06)
    E.view(yaw=18, pitch=6, glow=1.0)
    face_camera()


@equip("ring_7")
def ring_7():
    """Rift ring: void-metal band with a glowing crack running around it,
    star-gold claws holding a large star gem, orbiting shards."""
    band = EM_void("ring_void", rift=dict(polar=("X", "Z", 0.39), amp=0.012, freq=6.0,
                                          width=0.01, halo=0.022, strength=11.0, halo_str=0.6,
                                          depth=("Y", -0.02)))
    gold = EM_stargold()
    E.ring_band(band, w=0.11, t=0.065, top_swell=0.9)
    E.lathe([(0, 0.36), (0.12, 0.37), (0.15, 0.43), (0, 0.43)], gold, seg=8, smooth=False,
            name="cup")
    for k in range(4):
        a = TAU * (k + 0.5) / 4
        d = Vector((math.cos(a), math.sin(a), 0))
        p0 = Vector((0, 0, 0.42)) + d * 0.1
        E.sweep(E.bezier(p0, p0 + d * 0.14 + Vector((0, 0, 0.05)), p0 + d * 0.15 + Vector((0, 0, 0.2)),
                         p0 + d * 0.04 + Vector((0, 0, 0.3)), 16), lambda s: 0.022 * (1 - 0.8 * s),
                gold, segs=8, name="claw")
    star_mesh_E(0.22, 0.075, 0.1, n=4, mat=EM_stargem(), loc=(0, -0.02, 0.62), back=0.06)
    star_mesh_E(0.13, 0.05, 0.06, n=4, mat=EM_stargem(), loc=(0, -0.01, 0.62),
                rot0=math.pi / 2 + math.pi / 4)
    for (x, z, r, h, a) in ((0.52, 0.34, 0.034, 0.1, 30), (-0.5, 0.22, 0.028, 0.085, -40),
                            (0.46, -0.3, 0.022, 0.065, 70)):
        shard_E((x, -0.05, z), r, h, rot=(rad(20), rad(a), 0))
    glint_E((0.18, -0.12, 0.8), 0.08)
    E.view(yaw=24, pitch=14, glow=1.0)
    face_camera()


@equip("amulet_7")
def amulet_7():
    """Star reliquary: star-gold compass star behind a void-metal medallion
    split by a glowing crack, a large star gem at its heart, a thin orbit of
    rift light, star-gold chain."""
    gold = EM_stargold()
    med = EM_void("medallion_void", rift=dict(along="Z", across="X", center=0.0, amp=0.06,
                                              freq=3.5, width=0.012, halo=0.035, strength=11.0,
                                              halo_str=0.7, depth=("Y", -0.02), branches=5.0))
    E.necklace("chain", gold, bail_z=0.32)
    E.extrude(E.shape_star(8, 0.36, 0.13, rot=math.pi / 2), 0.03, gold, bev=0.006, name="compass",
              loc=(0, 0.02, 0))
    E.lathe([(0, -0.03), (0.2, -0.03), (0.215, 0.0), (0.2, 0.03), (0, 0.03)], med, seg=64,
            rot=(rad(90), 0, 0), name="medallion")
    E.torus(0.21, 0.018, gold, rot=(rad(90), 0, 0), seg=64, rseg=8, name="frame")
    star_mesh_E(0.13, 0.045, 0.07, n=4, mat=EM_stargem(), loc=(0, -0.035, 0))
    E.torus(0.3, 0.006, EM_riftglow("orbit", 7.0), rot=(rad(90 - 18), rad(20), 0), seg=72, rseg=6,
            name="orbit")
    E.torus(0.028, 0.009, gold, loc=(0, 0, 0.33), rot=(0, rad(90), 0), seg=16, rseg=6, name="bail")
    glint_E((0.2, -0.08, 0.16), 0.06)
    E.view(pitch=4, glow=1.0)
    face_camera()


# =============================================================================
#  KEY-ITEM ICONS (build_decor_b / build_icons_misc pipeline, module D)
# =============================================================================
def surface_D(fn, nu, nv, mat, name="surf", thick=0.0, smooth=True):
    """Grid surface fn(u, v) -> (x, y, z) with per-vertex UV = (u, v)."""
    verts, uvs = [], []
    for j in range(nv + 1):
        for i in range(nu + 1):
            u, v = i / nu, j / nv
            verts.append(fn(u, v))
            uvs.append((u, v))
    W = nu + 1
    faces = []
    for j in range(nv):
        for i in range(nu):
            a = j * W + i
            faces.append((a, a + 1, a + W + 1, a + W))
    ob = D.make_mesh(name, verts, faces, mat, smooth=smooth, uvs=uvs)
    if thick:
        D.solidify(ob, thick, offset=0.0)
    return ob


def leaf_D(loc, length, width, rot, mat, depth=0.016):
    n = 12
    up = [(length * i / n, width * math.sin(math.pi * i / n) ** 0.8) for i in range(n + 1)]
    lo = [(length * i / n, -width * 0.8 * math.sin(math.pi * i / n) ** 0.8)
          for i in range(n - 1, 0, -1)]
    return D.inflate(up + lo, depth, mat, rings=3, center=(length * 0.45, 0.0), loc=loc, rot=rot,
                     name="leaf")


def DM_stargold():
    return D.pbr("stargold", (1.0, 0.88, 0.62), metal=1.0, rough=0.18, noise_rough=0.05)


def DM_riftglow(name="riftglow_d", strength=3.0):
    """Solid emissive rift light for the D pipeline (colour cycles in Z)."""
    if name in D.G.mats:
        return D.G.mats[name]
    m = D.pbr(name, (0.1, 0.06, 0.2), rough=0.3, emit=(0.6, 0.35, 1.0), emit_str=strength)
    nt = m.node_tree
    I = _bsdf(m).inputs
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Object"], sep.inputs[0])
    nz = _n(nt, "ShaderNodeTexNoise", Scale=2.5, Detail=3.0)
    nt.links.new(tc.outputs["Object"], nz.inputs["Vector"])
    ph = _m(nt, "FRACT", _m(nt, "ADD", _m(nt, "MULTIPLY", sep.outputs["Z"], 1.6), nz.outputs["Fac"]))
    nt.links.new(_ramp(nt, ph, RIFT_STOPS), I["Emission Color"])
    return m


def anchor_emblem(mat, s=1.0, y=0.0, loc=(0, 0, 0), glow=None):
    """Ship's anchor in the XZ plane (ring on top), ~0.62*s tall, centred."""
    with D.sub(loc=loc, scale=s):
        r = 0.02
        D.torus(0.055, 0.018, mat, loc=(0, y, 0.25), rot=(rad(90), 0, 0), seg=32, rseg=8,
                name="a_ring")
        D.box((0.036, 0.04, 0.44), mat, loc=(0, y, 0.0), bev=0.01, name="a_shank")
        D.box((0.24, 0.04, 0.034), mat, loc=(0, y, 0.15), bev=0.01, name="a_stock")
        for sx in (-1, 1):
            D.sphere(0.024, mat, loc=(sx * 0.125, y, 0.15), seg=12, rings=8, name="a_knob")
            arm = [(sx * math.sin(a) * 0.19, y, -0.03 - math.cos(a) * 0.19)
                   for a in [rad(t) for t in range(0, 76, 5)]]
            arm = [(0.0, y, -0.22)] + arm[1:]
            D.sweep(arm, lambda t: r * (1.0 + 0.3 * t), mat, segs=10, name="a_arm")
            tip = Vector(arm[-1])
            d = (tip - Vector(arm[-4])).normalized()
            # fluke: flat arrow head pointing along the arm
            D.cone(0.05, 0.075, mat, loc=tuple(tip), rot=d.to_track_quat("Z", "Y").to_euler(),
                   seg=4, name="a_fluke", scale=(1.0, 0.45, 1.0))
        D.sphere(0.035, mat, loc=(0, y, -0.225), seg=12, rings=8, name="a_crown")


HEART_GEM = {1: (0.45, 0.62, 0.8), 2: (0.9, 0.16, 0.01), 3: (0.01, 0.42, 0.38),
             4: (0.1, 0.3, 1.0), 5: (0.36, 0.04, 0.85), 6: (0.2, 0.48, 0.02)}


def _wheart(n):
    """World heart n: faceted heart crystal in the world colour (a deeper,
    saturated version of WORLD_COLORS[n] so it reads at 32 px), star-gold
    (mirror / storm: star-silver) rim and a raised anchor emblem."""
    col = srgb(WORLD_COLORS[n])
    gc = HEART_GEM[n]
    S = 0.62
    if n == 1:
        # mirror world: silvery crystal that reflects like a mirror
        gem = D.pbr("wheart_1", gc, metal=0.45, rough=0.03, trans=0.35, ior=2.1, spec=1.0,
                    emit=gc, emit_str=0.2)
    else:
        gem = D.pbr("wheart_%d" % n, gc, rough=0.02, trans=0.45, ior=1.9, spec=1.0, emit=gc,
                    emit_str=0.45)
    D.inflate(D.shape_heart(S, n=22), 0.3, gem, rings=3, flat=True, center=(0.0, 0.0),
              name="heart")
    silver = n in (1, 4)
    rim_m = (D.pbr("starsilver", (0.9, 0.93, 1.0), metal=1.0, rough=0.12) if silver
             else DM_stargold())
    emb = (D.pbr("anchor_silver", (0.72, 0.76, 0.84), metal=1.0, rough=0.2) if silver
           else D.pbr("anchor_gold", (0.95, 0.62, 0.26), metal=1.0, rough=0.22))
    rim = [(x * 1.05, 0.02, z * 1.05 - 0.004) for (x, z) in D.shape_heart(S, n=90)]
    D.sweep(rim + rim[:3], 0.04, rim_m, segs=10, caps=False, name="rim")
    # anchor emblem riding on the front facets
    anchor_emblem(emb, s=1.08, loc=(0.0, -0.31, 0.03))
    if n == 4:
        rng = random.Random(4)
        D.bolt((-0.16, -0.14, 0.32), (0.12, -0.14, -0.34), rng,
               D.M_glow("stormbolt", (0.85, 0.95, 1.0), 14.0), n=7, jag=0.09, r=0.022, branches=1)
    if n == 6:
        leafm = D.pbr("sprout", (0.25, 0.6, 0.1), rough=0.45, sss=0.2, coat=0.3,
                      emit=(0.4, 0.9, 0.2), emit_str=0.3)
        D.sweep([(0.0, 0.0, 0.42), (0.01, 0.0, 0.5), (0.0, 0.0, 0.58)], 0.014, leafm, segs=8,
                name="stem")
        leaf_D((0.0, 0.0, 0.56), 0.22, 0.08, (0, rad(-35), 0), leafm, depth=0.014)
        leaf_D((0.0, 0.0, 0.53), 0.17, 0.065, (0, rad(-150), 0), leafm, depth=0.014)
    if n == 2:
        D.flame((0.0, 0.0, -0.3), 0.4, light=False)
    D.sparkle((0.36, -0.4, 0.36), 0.1, (1.0, 0.96, 0.9))
    D.sparkle((-0.42, -0.4, -0.18), 0.07, (1.0, 0.96, 0.9))
    D.point_light((0, -0.7, 0.1), col, 10, 0.3)
    D.view(pitch=6, yaw=14, fill=0.9, glow=0.5)


for _n_ in range(1, 7):
    icon("wheart_%d" % _n_)(lambda _n_=_n_: _wheart(_n_))


@icon("star_shard")
def build_star_shard():
    """Small five-pointed crystal star, warm white light from within."""
    gem = D.pbr("starshard", (1.0, 0.74, 0.38), rough=0.02, trans=0.5, ior=2.0, spec=1.0,
                emit=(1.0, 0.8, 0.5), emit_str=0.22)
    D.inflate(D.shape_star(5, 0.6, 0.26), 0.2, gem, rings=2, flat=True, center=(0.0, 0.0),
              name="star")
    core = D.M_glow("starcore", (1.0, 0.9, 0.7), 1.6, base=(1.0, 0.95, 0.85))
    D.inflate(D.shape_star(5, 0.22, 0.1), 0.22, core, rings=2, flat=True, center=(0.0, 0.0),
              loc=(0, -0.01, 0), name="core")
    D.sparkle((0.42, -0.35, 0.42), 0.12, (1.0, 0.95, 0.85), strength=8.0)
    D.sparkle((-0.5, -0.35, -0.3), 0.07, (1.0, 0.95, 0.85), strength=8.0)
    D.sparkle((0.5, -0.35, -0.42), 0.05, (0.8, 0.9, 1.0), strength=8.0)
    D.point_light((0, -0.6, 0.2), (1.0, 0.85, 0.6), 8, 0.3)
    D.view(pitch=10, yaw=16, diag=-12, fill=0.8, glow=0.45, exposure=-0.35)


def M_blackflame(name="blackflame"):
    """Black flame: near-black body whose silhouette burns violet / rift
    colours (emission from the grazing-angle layer weight), soft edges."""
    if name in D.G.mats:
        return D.G.mats[name]
    m = bpy.data.materials.new(name)
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Generated"], sep.inputs[0])
    lw = _n(nt, "ShaderNodeLayerWeight", Blend=0.45)
    edge = _m(nt, "POWER", lw.outputs["Facing"], 2.6)
    col = _ramp(nt, sep.outputs["Z"], [(0.0, (0.2, 0.7, 1.0)), (0.25, (0.55, 0.25, 1.0)),
                                        (0.7, (0.9, 0.2, 0.9)), (1.0, (1.0, 0.35, 0.7))])
    em = _n(nt, "ShaderNodeEmission")
    nt.links.new(col, em.inputs["Color"])
    nt.links.new(_m(nt, "MULTIPLY", edge, 12.0), em.inputs["Strength"])
    dark = _n(nt, "ShaderNodeBsdfDiffuse", Color=(0.004, 0.002, 0.008, 1))
    add = nt.nodes.new("ShaderNodeAddShader")
    nt.links.new(dark.outputs[0], add.inputs[0])
    nt.links.new(em.outputs[0], add.inputs[1])
    # tip fades out
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    mix = nt.nodes.new("ShaderNodeMixShader")
    fade = _m(nt, "MULTIPLY", _m(nt, "POWER", sep.outputs["Z"], 3.0), 0.7)
    nt.links.new(fade, mix.inputs["Fac"])
    nt.links.new(add.outputs[0], mix.inputs[1])
    nt.links.new(tr.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs["Surface"])
    D.G.mats[name] = m
    return m


def black_flame(loc, h, r=None, seed=0):
    r = r or h * 0.24
    prof = []
    N = 18
    for i in range(N + 1):
        t = i / N
        rr = r * math.sin(math.pi * t ** 0.55) ** 0.9 * (1 - 0.3 * t)
        prof.append((max(rr, 0.0), h * t))
    prof[0] = (0.0, 0.0)
    prof[-1] = (0.0, h)
    ph = random.Random(seed).uniform(0, TAU)
    fl = D.lathe(prof, M_blackflame(), seg=32, loc=loc, name="blackflame",
                 radial=lambda a, t: 1 + 0.35 * t * math.sin(3 * a + t * 9 + ph)
                 + 0.12 * math.sin(5 * a - t * 14))
    fl.rotation_euler = (0, rad(4), 0)
    for k, (dx, hh) in enumerate(((-0.62, 0.62), (0.66, 0.55), (0.1, 0.4))):
        p2 = [(x * 0.45, z * hh) for x, z in prof]
        D.lathe(p2, M_blackflame(), seg=16, loc=(loc[0] + dx * r, loc[1] + 0.01, loc[2]),
                rot=(0, rad(-18 * (1 if dx > 0 else -1)), 0), name="blackflame_lick")


@icon("rift_lantern")
def build_rift_lantern():
    """Old iron lantern (rusted, dented), smoky glass panes and a black flame
    burning with rift-coloured edges inside."""
    iron = D.M_wrought()
    dark = D.pbr("lantern_iron", (0.1, 0.09, 0.085), metal=1, rough=0.45, noise_rough=0.15,
                 pattern="rust", rust=(0.24, 0.1, 0.05), scale=6.0)
    glass = D.pbr("smokyglass", (0.8, 0.78, 0.86), rough=0.02, trans=1.0, ior=1.3, spec=0.5)
    # base
    D.lathe(D.catmull2d([(0.0, 0.0), (0.3, 0.0), (0.33, 0.04), (0.3, 0.08), (0.24, 0.1),
                         (0.25, 0.14), (0.0, 0.14)], 3, closed=False), dark, seg=48, name="base")
    # glass chimney and frame posts
    D.lathe([(0.2, 0.14), (0.205, 0.5), (0.2, 0.86)], glass, seg=40, cap=False, name="glass")
    for k in range(4):
        a = TAU * k / 4 + TAU / 8
        x, y = 0.22 * math.cos(a), 0.22 * math.sin(a)
        D.box((0.03, 0.03, 0.74), iron, loc=(x, y, 0.5), rot=(0, 0, a), bev=0.006, name="post")
    for z in (0.16, 0.52, 0.86):
        D.torus(0.22, 0.014, iron, loc=(0, 0, z), seg=48, rseg=8, name="hoop")
    # cap and handle
    D.lathe(D.catmull2d([(0.24, 0.86), (0.25, 0.9), (0.18, 0.98), (0.1, 1.04), (0.06, 1.1),
                         (0.07, 1.14), (0.0, 1.15)], 3, closed=False), dark, seg=48, name="cap")
    for k in range(8):
        a = TAU * k / 8
        D.box((0.05, 0.012, 0.02), D.M_black(), loc=(0.19 * math.cos(a), 0.19 * math.sin(a), 0.95),
              rot=(0, rad(35), a), name="vent")
    D.torus(0.13, 0.016, iron, loc=(0, 0, 1.25), rot=(rad(90), 0, 0), seg=40, rseg=8,
            name="handle")
    # black flame on a wick
    D.cyl(0.02, 0.06, dark, loc=(0, 0, 0.17), seg=12, name="wickholder")
    black_flame((0, 0, 0.19), 0.6, r=0.15, seed=3)
    D.point_light((0, -0.05, 0.45), (0.55, 0.3, 1.0), 20, 0.12)
    D.point_light((0, -0.5, 0.5), (0.5, 0.35, 1.0), 8, 0.3)
    D.sparkle((0.3, -0.4, 0.75), 0.06, (0.8, 0.7, 1.0))
    D.view(pitch=10, yaw=18, diag=-6, fill=0.88, glow=0.8, glow_beauty=0.05,
           transparent_glass=False)


def M_petal(name="dawnpetal"):
    """Pale-gold petal: creamy SSS body, glowing gold rim and tip (UV v = across
    0..1, u = along 0..1)."""
    if name in D.G.mats:
        return D.G.mats[name]
    m = D.pbr(name, (1.0, 0.72, 0.36), rough=0.4, sss=0.2, sss_radius=(1.0, 0.6, 0.25), sheen=0.2,
              emit=(1.0, 0.66, 0.22), emit_str=0.0)
    nt = m.node_tree
    I = _bsdf(m).inputs
    uvn = nt.nodes.new("ShaderNodeUVMap")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(uvn.outputs["UV"], sep.inputs[0])
    across = _m(nt, "ABSOLUTE", _m(nt, "SUBTRACT", _m(nt, "MULTIPLY", sep.outputs["Y"], 2.0), 1.0))
    edge = _n(nt, "ShaderNodeMapRange", **{"From Min": 0.72, "From Max": 1.0})
    nt.links.new(across, edge.inputs["Value"])
    tip = _n(nt, "ShaderNodeMapRange", **{"From Min": 0.75, "From Max": 1.0})
    nt.links.new(sep.outputs["X"], tip.inputs["Value"])
    g = _m(nt, "MAXIMUM", _m(nt, "POWER", edge.outputs["Result"], 1.5), tip.outputs["Result"])
    nt.links.new(_m(nt, "MULTIPLY", g, 2.2), I["Emission Strength"])
    # base: warm gold at the throat, pale gold toward the tip
    col = _ramp(nt, sep.outputs["X"], [(0.0, (0.9, 0.35, 0.05)), (0.35, (0.98, 0.6, 0.2)),
                                        (1.0, (1.0, 0.8, 0.45))])
    nt.links.new(col, I["Base Color"])
    return m


@icon("dawnflower")
def build_dawnflower():
    """Pale-gold six-petalled lily whose petal edges glow like the first
    light of dawn; gold stamens, a short stem with two leaves."""
    pet = M_petal()
    anth = D.M_glow("anther", (1.0, 0.7, 0.2), 4.0, base=(1.0, 0.6, 0.15))
    stemm = D.pbr("lilystem", (0.2, 0.42, 0.1), rough=0.45, sss=0.2, coat=0.2)
    leafm = D.pbr("lilyleaf", (0.18, 0.4, 0.08), rough=0.4, sss=0.2, coat=0.3)
    L, Wd = 0.62, 0.15
    with D.sub(loc=(0, 0, 0.05), rot=(rad(-18), 0, 0)):
        for k in range(6):
            a = TAU * k / 6 + (0.26 if k % 2 else 0.0)
            ca, sa = math.cos(a), math.sin(a)
            inner = k % 2 == 1
            Lk = L * (0.92 if inner else 1.0)

            def fn(u, v, ca=ca, sa=sa, Lk=Lk, inner=inner):
                t = u
                w = Wd * (math.sin(math.pi * min(1.0, t ** 0.75)) ** 0.8) * (1 - 0.15 * t)
                s_ = (v * 2 - 1)
                # radial distance and height: rise from the throat then recurve
                r = Lk * (0.08 + 0.82 * t)
                h = Lk * (0.62 * t - 0.5 * t * t * t) + (0.03 if inner else 0.0)
                cup = 0.06 * (1 - s_ * s_) * math.sin(math.pi * t)
                x = r * ca - s_ * w * sa
                y = r * sa + s_ * w * ca
                z = h + cup
                return (x, y, z)
            surface_D(fn, 20, 8, pet, name="petal", thick=0.012)
        for k in range(6):
            a = TAU * k / 6 + 0.13
            d = Vector((math.cos(a), math.sin(a), 0))
            p0 = Vector((0, 0, 0.02))
            p3 = p0 + d * 0.16 + Vector((0, 0, 0.3))
            D.sweep(D.bezier_pts(p0, p0 + Vector((0, 0, 0.12)), p3 - d * 0.04, p3, 10), 0.007,
                    stemm, segs=6, name="filament")
            D.sphere(0.022, anth, loc=tuple(p3), scale=(1.0, 1.0, 1.8), seg=12, rings=8,
                     name="anther")
        D.sweep([(0, 0, 0.0), (0, 0, 0.2), (0.01, -0.01, 0.38)], 0.009, stemm, segs=6, name="pistil")
        D.sphere(0.02, D.M_glow("stigma", (1.0, 0.85, 0.5), 3.0), loc=(0.01, -0.01, 0.39),
                 seg=12, rings=8)
        D.sphere(0.06, stemm, loc=(0, 0, -0.01), scale=(1, 1, 0.8), seg=16, rings=8, name="receptacle")
    stem = D.bezier_pts((0, 0.02, 0.0), (0.02, 0.05, -0.2), (-0.05, 0.08, -0.4), (-0.12, 0.1, -0.62), 16)
    D.sweep(stem, lambda t: 0.028 - 0.006 * t, stemm, segs=10, name="stem")
    leaf_D((-0.05, 0.08, -0.35), 0.4, 0.07, (rad(10), rad(-160), 0), leafm, depth=0.014)
    leaf_D((-0.03, 0.06, -0.25), 0.34, 0.06, (rad(-10), rad(-30), 0), leafm, depth=0.014)
    for (p, s_) in (((0.34, -0.5, 0.52), 0.07), ((-0.4, -0.5, 0.3), 0.05), ((0.42, -0.5, -0.1), 0.04)):
        D.sparkle(p, s_, (1.0, 0.9, 0.65))
    D.point_light((0, -0.4, 0.35), (1.0, 0.75, 0.4), 8, 0.3)
    D.view(pitch=0, yaw=0, diag=-8, fill=0.88, glow=0.6, key=0.7, fill_light=0.7, top=0.6,
           front=0.3, exposure=-0.45)


# =============================================================================
#  PROPS (build_decor_b pipeline, module D) -- front view, 1 tile = 48 px
# =============================================================================
def DM_mirror(name="mirrorglass", tint=(0.82, 0.88, 0.95), rough=0.03, glow=0.0):
    """Silvered mirror glass (reflects the studio world: dark with highlights)."""
    return D.pbr(name, tint, metal=1.0, rough=rough, coat=0.6, coat_rough=0.02,
                 emit=(0.55, 0.7, 0.9), emit_str=glow)


def DM_neutral_glass(name="neutralglass", tint=(1.0, 1.0, 1.0), lo=0.46, hi=0.78, emit=0.25,
                     metal=0.55):
    """Soft mirror surface with diagonal sheen bands.  Neutral grey by default
    (the tintable mirror switch: no hue of its own, the game tints it); a
    tint + lower levels gives a dark bluish mirror for the decorations."""
    if name in D.G.mats:
        return D.G.mats[name]
    m = D.pbr(name, (0.6, 0.6, 0.6), metal=metal, rough=0.12, coat=0.5, coat_rough=0.03,
              emit=(0.5, 0.5, 0.5), emit_str=emit)
    nt = m.node_tree
    I = _bsdf(m).inputs
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Object"], sep.inputs[0])
    diag = _m(nt, "ADD", sep.outputs["X"], _m(nt, "MULTIPLY", sep.outputs["Z"], 0.6))
    wv = _m(nt, "SINE", _m(nt, "MULTIPLY", diag, 7.0))

    def c(v):
        return tuple(v * t for t in tint)
    band = _ramp(nt, wv, [(0.0, c(lo)), (0.55, c(lo + (hi - lo) * 0.12)), (0.8, c(hi * 0.9)),
                          (1.0, c(hi))])
    nt.links.new(band, I["Base Color"])
    nt.links.new(band, I["Emission Color"])
    return m


def crack_web(center, rng, mat, n=7, R=0.3, y=-0.02, r=0.004, plane="xz"):
    """Radial crack lines plus a few concentric links (broken glass)."""
    cx, cz = center
    ends = []
    for k in range(n):
        a = TAU * k / n + rng.uniform(-0.3, 0.3)
        L = R * rng.uniform(0.55, 1.0)
        pts = [(cx, y, cz)]
        for j in range(1, 5):
            t = j / 4
            aa = a + rng.uniform(-0.18, 0.18)
            pts.append((cx + math.cos(aa) * L * t, y, cz + math.sin(aa) * L * t))
        D.sweep(pts, lambda s: r * (1 - 0.6 * s), mat, segs=5, name="crack")
        ends.append(pts)
    for k in range(n):
        p, q = ends[k], ends[(k + 1) % n]
        i = rng.randint(1, 3)
        D.sweep([p[i], ((p[i][0] + q[i][0]) / 2, y, (p[i][2] + q[i][2]) / 2 + 0.01), q[i]], r * 0.7,
                mat, segs=5, name="crack")


def scroll_curve(p0, p1, bulge, n=16):
    """Gentle S-scroll between two XZ points (list of 3D points, y=0)."""
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    nrm = Vector((-d.z, 0, d.x)).normalized()
    return D.bezier_pts(p0, p0 + d * 0.33 + nrm * bulge, p1 - d * 0.33 - nrm * bulge, p1, n)


@prop("deco_mirror_frame", (96, 176))
def build_mirror_frame():
    """Baroque standing mirror: oval silvered glass with a spider-web crack,
    ornate silver frame with a crown crest, scroll arms and a claw-footed
    pedestal."""
    silver = D.M_silver()
    dark = D.pbr("mirror_darksilver", (0.5, 0.52, 0.58), metal=1.0, rough=0.28, noise_rough=0.1,
                 pattern="rust", rust=(0.12, 0.13, 0.16), scale=6.0)
    glass = DM_neutral_glass("mf_glass", tint=(0.55, 0.7, 1.0), lo=0.1, hi=0.5, emit=0.3, metal=0.8)
    crack = D.M_glow("mf_crack", (0.75, 0.9, 1.0), 4.0, base=(0.9, 0.95, 1.0))
    rng = random.Random(11)
    # pedestal
    D.lathe(D.catmull2d([(0.0, 0.0), (0.3, 0.0), (0.32, 0.05), (0.24, 0.1), (0.14, 0.16),
                         (0.08, 0.3), (0.1, 0.36), (0.0, 0.36)], 3, closed=False), dark, seg=40,
            name="pedestal")
    for k in range(4):
        a = TAU * k / 4 + TAU / 8
        d = Vector((math.cos(a), math.sin(a), 0))
        p0 = Vector((0, 0, 0.14)) + d * 0.1
        D.sweep(D.bezier_pts(p0, p0 + d * 0.12 + Vector((0, 0, 0.04)), p0 + d * 0.25,
                             p0 + d * 0.27 + Vector((0, 0, -0.12)), 10), lambda s: 0.03 - 0.01 * s,
                dark, segs=8, name="claw_leg")
        D.sphere(0.035, dark, loc=tuple(p0 + d * 0.27 + Vector((0, 0, -0.12))), seg=12, rings=8)
    D.cyl(0.05, 0.3, dark, loc=(0, 0, 0.5), seg=16, name="post")
    # oval glass + frame
    C = 1.12
    RX, RZ = 0.38, 0.58
    oval = [(RX * math.cos(TAU * i / 72), RZ * math.sin(TAU * i / 72)) for i in range(72)]
    D.extrude([(x, z + C) for x, z in oval], 0.03, glass, name="glass")
    ring = [(RX * 1.03 * math.cos(TAU * i / 96), -0.01, C + RZ * 1.03 * math.sin(TAU * i / 96))
            for i in range(97)]
    D.sweep(ring, 0.05, silver, segs=12, caps=False, name="frame")
    ring2 = [(RX * 1.16 * math.cos(TAU * i / 96), 0.0, C + RZ * 1.11 * math.sin(TAU * i / 96))
             for i in range(97)]
    D.sweep(ring2, 0.022, dark, segs=8, caps=False, name="frame_outer")
    for i in range(28):
        a = TAU * i / 28
        D.sphere(0.018, silver, loc=(RX * 1.1 * math.cos(a), -0.03, C + RZ * 1.07 * math.sin(a)),
                 seg=10, rings=6, name="bead")
    # crest: crown of leaves + a small oval medallion
    crest = [(0.0, 0.0), (0.05, 0.03), (0.1, 0.02), (0.14, 0.08), (0.1, 0.12), (0.06, 0.1),
             (0.05, 0.17), (0.02, 0.2), (0.0, 0.26)]
    D.extrude(D.mirror_x(crest), 0.05, silver, loc=(0, -0.01, C + RZ + 0.02), bev=0.01,
              name="crest")
    D.sphere(0.04, DM_mirror("mf_orb", glow=0.3), loc=(0, -0.04, C + RZ + 0.1), seg=16, rings=8)
    # scroll arms from the pedestal to the frame
    for sx in (-1, 1):
        pts = scroll_curve((sx * 0.05, 0, 0.62), (sx * RX * 1.05, 0, C - 0.2), sx * 0.08)
        D.sweep(pts, lambda s: 0.03 - 0.012 * s, silver, segs=10, name="arm")
        D.sphere(0.035, silver, loc=tuple(pts[-1]), seg=12, rings=8)
        leafp = [(0.0, 0.0), (0.06, 0.04), (0.1, 0.12), (0.05, 0.1), (0.0, 0.16)]
        D.extrude([(sx * x, z) for x, z in leafp], 0.03, silver, bev=0.006,
                  loc=(sx * RX * 0.95, -0.02, C - RZ * 0.95), rot=(0, 0, 0), name="leaf")
    crack_web((0.08, C + 0.12), rng, crack, n=8, R=0.36, y=-0.022, r=0.005)
    for (p, s_) in (((0.22, -0.3, C + 0.35), 0.06), ((-0.2, -0.3, C - 0.3), 0.04)):
        D.sparkle(p, s_, (0.85, 0.95, 1.0))
    D.point_light((0, -0.6, C), (0.7, 0.85, 1.0), 20, 0.3)
    D.view(pitch=5, fill=0.95, glow=0.6, glow_beauty=0.1)


@prop("deco_mirror_shards", (144, 64))
def build_mirror_shards():
    """Heap of broken mirror shards stuck upright in the floor, a bent strip of
    silver frame, cold glints."""
    glass = DM_mirror("ms_glass", tint=(0.8, 0.86, 0.95), glow=0.15)
    back = D.pbr("ms_back", (0.12, 0.13, 0.16), metal=0.6, rough=0.4)
    silver = D.M_silver()
    stone = D.M_stone("ms_floor", (0.2, 0.22, 0.27), scale=4.0)
    rng = random.Random(21)
    for k in range(9):
        D.rock((rng.uniform(-0.9, 0.9), rng.uniform(-0.1, 0.2), 0.0), rng.uniform(0.05, 0.1), stone,
               scale=(1.4, 1.0, 0.5), seed=k + 1, strength=0.3)
    dark = DM_neutral_glass("ms_dark", tint=(0.55, 0.7, 1.0), lo=0.08, hi=0.55, emit=0.3, metal=0.8)
    for k in range(15):
        x = -0.85 + 1.7 * k / 14 + rng.uniform(-0.05, 0.05)
        h = rng.uniform(0.3, 0.9) * (1.0 - 0.5 * abs(x) / 0.95)
        w = rng.uniform(0.1, 0.22)
        pts = [(-w / 2, 0.0), (w / 2, 0.0)]
        if rng.random() < 0.5:
            pts.append((w * rng.uniform(0.1, 0.5), h * rng.uniform(0.5, 0.8)))
        pts.append((rng.uniform(-w, w) * 0.4, h))
        ob = D.extrude(pts, 0.016, glass if k % 3 == 0 else dark, name="shard",
                       loc=(x, rng.uniform(-0.2, 0.2), -0.03),
                       rot=(rng.uniform(-0.3, 0.15), rng.uniform(-0.45, 0.45), rng.uniform(-0.9, 0.9)))
        ob.data.materials.append(back)
    # lying frame fragment
    arc = [(0.2 + 0.45 * math.cos(a), -0.2, 0.03 + 0.14 * math.sin(a))
           for a in [math.pi * (0.1 + 0.6 * i / 20) for i in range(21)]]
    D.sweep(arc, 0.03, silver, segs=10, name="frame_bit")
    for (p, s_) in (((-0.5, -0.4, 0.5), 0.07), ((0.45, -0.4, 0.42), 0.05), ((0.05, -0.4, 0.62), 0.05)):
        D.sparkle(p, s_, (0.85, 0.95, 1.0))
    D.point_light((0, -0.7, 0.4), (0.7, 0.85, 1.0), 16, 0.3)
    D.view(pitch=9, fill=0.95, glow=0.5, glow_beauty=0.12)


def M_coldflame():
    return D.M_flame("coldflame", core=(0.85, 0.95, 1.0), mid=(0.45, 0.72, 1.0),
                     tip=(0.25, 0.35, 1.0), strength=2.6)


@prop("deco_mirror_chandelier", (144, 120), anchor="top")
def build_mirror_chandelier():
    """Silver chandelier hung with mirror-glass prisms; six cold blue-white
    candle flames."""
    silver = D.M_silver()
    crys = D.pbr("prism_glass", (0.9, 0.95, 1.0), rough=0.0, trans=1.0, ior=1.9, spec=1.0,
                 emit=(0.6, 0.8, 1.0), emit_str=0.25)
    wax = D.M_wax("coldwax", (0.9, 0.93, 0.98))
    top = 1.0
    D.chain([(0, 0, top + 0.28), (0, 0, top)], silver, link_len=0.09, wire=0.012)
    D.lathe(D.catmull2d([(0.0, top), (0.05, top), (0.04, 0.9), (0.09, 0.8), (0.05, 0.72),
                         (0.13, 0.6), (0.18, 0.52), (0.1, 0.46), (0.04, 0.4), (0.0, 0.36)], 3,
                        closed=False), silver, seg=40, name="stem")
    D.torus(0.16, 0.015, silver, loc=(0, 0, 0.52), seg=40, rseg=8)
    n = 6
    for k in range(n):
        a = TAU * k / n + 0.25
        d = Vector((math.cos(a), math.sin(a) * 0.55, 0))
        p0 = Vector((0, 0, 0.54)) + d * 0.14
        p3 = Vector((0, 0, 0.6)) + d * 0.66
        pts = D.bezier_pts(p0, p0 + d * 0.2 + Vector((0, 0, -0.2)), p3 + Vector((0, 0, -0.26)), p3, 18)
        D.sweep(pts, lambda s: 0.024 - 0.008 * s, silver, segs=8, name="arm")
        D.lathe([(0.0, 0.0), (0.06, 0.0), (0.075, 0.03), (0.045, 0.035), (0.0, 0.035)], silver,
                seg=20, loc=tuple(p3), name="cup")
        D.cyl(0.028, 0.11, wax, loc=(p3.x, p3.y, p3.z + 0.09), seg=12, name="candle")
        D.flame((p3.x, p3.y, p3.z + 0.15), 0.13, mat=M_coldflame(),
                core_mat=D.M_flame("coldcore", core=(1.0, 1.0, 1.0), mid=(0.7, 0.9, 1.0),
                                   tip=(0.4, 0.6, 1.0), strength=4.0, soft=1.0),
                light=True, power=6)
        # hanging prisms
        mid = pts[len(pts) // 2]
        D.sweep([tuple(mid), (mid.x, mid.y, mid.z - 0.1)], 0.004, silver, segs=4)
        D.octa(0.035, 0.07, crys, (mid.x, mid.y, mid.z - 0.17), rot=(0, 0, a))
        D.octa(0.028, 0.05, crys, (p3.x, p3.y, p3.z - 0.1), rot=(0, 0, a))
    for k in range(10):
        a = TAU * k / 10
        D.octa(0.03, 0.06, crys, (0.17 * math.cos(a), 0.17 * math.sin(a) * 0.6, 0.4), rot=(0, 0, a))
    D.octa(0.05, 0.12, crys, (0, 0, 0.24))
    D.sparkle((0.3, -0.4, 0.3), 0.05, (0.85, 0.95, 1.0))
    D.view(pitch=10, fill=0.95, glow=0.7, anchor="top")


def lancet_path(w, zs, d=0.0, y=0.0, n=16):
    """Pointed arch (half-width w, springing at zs, offset d) as 3D points
    from the left springing over the apex to the right springing."""
    R = 2 * w + d
    ta = math.acos(w / R)
    right = [(-w + R * math.cos(ta * i / n), zs + R * math.sin(ta * i / n)) for i in range(n + 1)]
    left = [(-x, z) for (x, z) in right]
    pts = left + list(reversed(right))[1:]
    return [(x, y, z) for (x, z) in pts]


@prop("prop_mirror_switch", (96, 192))
def build_prop_mirror_switch():
    """Mirror switch: tall standing mirror in a silver gothic (lancet-arched)
    frame; the glass is a light neutral grey so the game can tint it (phase A
    warm silver, phase B cold cyan)."""
    silver = D.M_silver()
    dark = D.pbr("ms_darksilver", (0.42, 0.44, 0.5), metal=1.0, rough=0.3, noise_rough=0.1)
    glass = DM_neutral_glass(metal=0.0, emit=0.35)
    w, zb, zs = 0.34, 0.2, 1.3
    D.extrude(D.lancet(w, zb, zs), 0.03, glass, name="glass")
    # frame: outer and inner mouldings following the lancet
    for d_, r_, m_, y_ in ((0.05, 0.045, silver, 0.0), (0.12, 0.022, dark, 0.01)):
        arc = lancet_path(w, zs, d=d_, y=y_)
        side_l = [(-(w + d_), y_, zb - 0.02 + (zs - zb + 0.02) * i / 8) for i in range(8)]
        side_r = [(w + d_, y_, zs - (zs - zb + 0.02) * i / 8) for i in range(1, 9)]
        path = side_l + arc + side_r
        D.sweep(path, r_, m_, segs=10, name="frame")
    D.box((2 * w + 0.2, 0.08, 0.06), silver, loc=(0, 0, zb - 0.02), bev=0.015, name="sill")
    # crockets and finial
    arc = lancet_path(w, zs, d=0.1, y=0.0)
    for i in range(2, len(arc) - 2, 3):
        p = Vector(arc[i])
        D.cone(0.022, 0.07, silver, loc=tuple(p), rot=(0, math.atan2(p.x, p.z - zs) * 0.8, 0), seg=6)
    apex = Vector(arc[len(arc) // 2])
    D.lathe(D.catmull2d([(0.0, 0.0), (0.04, 0.0), (0.02, 0.08), (0.05, 0.12), (0.0, 0.26)], 3,
                        closed=False), silver, seg=16, loc=(apex.x, 0, apex.z), name="finial")
    # base and feet
    D.box((2 * w + 0.28, 0.3, 0.1), dark, loc=(0, 0.02, 0.1), bev=0.02, name="plinth")
    D.box((2 * w + 0.14, 0.24, 0.06), silver, loc=(0, 0.02, 0.18), bev=0.015, name="plinth2")
    for sx in (-1, 1):
        D.sphere(0.05, silver, loc=(sx * (w + 0.1), -0.08, 0.04), seg=12, rings=8, name="foot")
    D.view(pitch=5, fill=0.95, glow=0.4)


def DM_hotmetal(name="hotmetal", strength=4.0):
    """Glowing hot iron: white-yellow core fading to orange-red (object Z)."""
    if name in D.G.mats:
        return D.G.mats[name]
    m = D.pbr(name, (0.3, 0.06, 0.02), metal=0.6, rough=0.4, emit=(1.0, 0.4, 0.08),
              emit_str=strength)
    nt = m.node_tree
    I = _bsdf(m).inputs
    tc = nt.nodes.new("ShaderNodeTexCoord")
    nz = _n(nt, "ShaderNodeTexNoise", Scale=4.0, Detail=6.0, Roughness=0.6)
    nt.links.new(tc.outputs["Object"], nz.inputs["Vector"])
    col = _ramp(nt, nz.outputs["Fac"], [(0.3, (1.0, 0.16, 0.02)), (0.55, (1.0, 0.45, 0.08)),
                                         (0.75, (1.0, 0.8, 0.35))])
    nt.links.new(col, I["Emission Color"])
    return m


def DM_molten(name="molten", strength=5.0):
    """Molten metal surface: bright glowing liquid with darker cooling crust."""
    if name in D.G.mats:
        return D.G.mats[name]
    m = D.pbr(name, (0.1, 0.03, 0.01), rough=0.3, emit=(1.0, 0.5, 0.1), emit_str=strength)
    nt = m.node_tree
    I = _bsdf(m).inputs
    tc = nt.nodes.new("ShaderNodeTexCoord")
    vo = _n(nt, "ShaderNodeTexVoronoi", Scale=5.0, _feature="DISTANCE_TO_EDGE")
    nz = _n(nt, "ShaderNodeTexNoise", Scale=3.0, Detail=4.0)
    nt.links.new(tc.outputs["Object"], nz.inputs["Vector"])
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "VECTOR"
    mix.inputs["Factor"].default_value = 0.3
    nt.links.new(tc.outputs["Object"], mix.inputs[4])
    nt.links.new(nz.outputs["Color"], mix.inputs[5])
    nt.links.new(mix.outputs[1], vo.inputs["Vector"])
    crust = _ramp(nt, vo.outputs["Distance"], [(0.0, (1.0, 0.85, 0.4)), (0.06, (1.0, 0.45, 0.06)),
                                                (0.16, (0.5, 0.08, 0.01)), (0.3, (0.12, 0.02, 0.0))])
    nt.links.new(crust, I["Emission Color"])
    return m


def M_firebrick():
    return D.pbr("firebrick", (0.35, 0.12, 0.07), rough=0.85, pattern="stone", scale=5.0,
                 crack=0.05, dark=(0.08, 0.03, 0.02))


@prop("deco_forge_anvil", (120, 96))
def build_forge_anvil():
    """Heavy black anvil on a banded oak block, a white-hot bar on the face,
    a sledge hammer leaning against it, sparks."""
    iron = D.pbr("anvil_iron", (0.13, 0.12, 0.12), metal=1.0, rough=0.35, noise_rough=0.15,
                 pattern="rust", rust=(0.2, 0.08, 0.04), scale=5.0)
    face = D.pbr("anvil_face", (0.55, 0.55, 0.56), metal=1.0, rough=0.2, noise_rough=0.08)
    wood = D.M_darkwood()
    band = D.M_wrought()
    hot = DM_hotmetal()
    # oak block
    D.lathe([(0.0, 0.0), (0.4, 0.0), (0.42, 0.04), (0.38, 0.34), (0.39, 0.38), (0.0, 0.38)],
            wood, seg=40, sy=0.8, name="block")
    for z in (0.08, 0.3):
        D.torus(0.415, 0.018, band, loc=(0, 0, z), sy=0.8, seg=48, rseg=6, name="band")
    # anvil: waist, body, face, horn, heel
    D.box((0.36, 0.3, 0.1), iron, loc=(0, 0, 0.43), bev=0.03, name="foot")
    D.box((0.2, 0.2, 0.18), iron, loc=(0, 0, 0.56), bev=0.04, name="waist")
    body = [(-0.42, 0.72), (0.34, 0.72), (0.36, 0.66), (0.2, 0.62), (0.14, 0.6), (-0.14, 0.6),
            (-0.2, 0.62), (-0.42, 0.66)]
    D.extrude(body, 0.26, iron, bev=0.02, name="body")
    D.box((0.74, 0.25, 0.03), face, loc=(-0.04, 0, 0.735), bev=0.01, name="face")
    horn = D.lathe([(0.12, 0.0), (0.1, 0.1), (0.06, 0.24), (0.0, 0.34)], iron, seg=24,
                   loc=(0.33, 0, 0.68), rot=(0, rad(90), 0), name="horn")
    horn.scale = (0.8, 1.0, 1.0)
    # hot bar with sparks
    D.box((0.34, 0.05, 0.04), hot, loc=(-0.02, -0.02, 0.77), bev=0.012, name="hotbar")
    D.point_light((0, -0.3, 0.85), (1.0, 0.45, 0.1), 30, 0.2)
    rng = random.Random(3)
    spark = D.M_glow("spark", (1.0, 0.6, 0.15), 10.0)
    for k in range(10):
        a = rng.uniform(0.2, math.pi - 0.2)
        L = rng.uniform(0.08, 0.2)
        p0 = Vector((rng.uniform(-0.1, 0.1), -0.05, 0.8))
        d = Vector((math.cos(a), 0, math.sin(a) * 0.6))
        p1 = p0 + d * rng.uniform(0.08, 0.22)
        D.sweep([tuple(p1), tuple(p1 + d * L * 0.6)], 0.007, spark, segs=4, name="spark")
    # sledge hammer leaning on the block
    with D.sub(loc=(-0.44, -0.12, 0.0), rot=(0, rad(18), 0)):
        D.cyl(0.025, 0.62, wood, loc=(0, 0, 0.31), seg=12, name="haft")
        D.box((0.1, 0.1, 0.2), iron, loc=(0, 0, 0.64), rot=(0, rad(90), 0), bev=0.015, name="head")
    D.view(pitch=8, fill=0.95, glow=0.9)


@prop("deco_forge_crucible", (144, 160))
def build_forge_crucible():
    """Brick furnace cradling a huge iron crucible brimming with molten metal,
    a pour lip dripping fire, chain tackle above."""
    iron = D.pbr("cruc_iron", (0.12, 0.11, 0.11), metal=1.0, rough=0.4, noise_rough=0.15,
                 pattern="rust", rust=(0.22, 0.09, 0.04), scale=4.0)
    brick = M_firebrick()
    molten = DM_molten()
    hot = DM_hotmetal("cruc_hot", 3.0)
    # furnace base (octagonal brick drum) with glowing mouth
    D.lathe([(0.0, 0.0), (0.62, 0.0), (0.64, 0.05), (0.6, 0.55), (0.63, 0.6), (0.0, 0.6)], brick,
            seg=8, smooth=False, name="furnace")
    mouth = [(-0.18, 0.08), (0.18, 0.08), (0.18, 0.28), (0.0, 0.38), (-0.18, 0.28)]
    D.extrude(mouth, 0.05, D.M_glow("furnace_fire", (1.0, 0.4, 0.05), 5.0), loc=(0, -0.58, 0),
              name="mouth")
    D.sweep([(-0.2, -0.6, 0.06), (-0.2, -0.6, 0.29), (0.0, -0.6, 0.41), (0.2, -0.6, 0.29),
             (0.2, -0.6, 0.06)], 0.025, iron, segs=8, name="mouth_frame")
    # crucible
    prof = [(0.0, 0.52), (0.36, 0.52), (0.48, 0.62), (0.56, 0.85), (0.58, 1.1), (0.6, 1.16),
            (0.52, 1.16), (0.5, 1.1), (0.0, 1.1)]
    D.lathe(prof, iron, seg=48, name="crucible")
    D.lathe([(0.0, 1.08), (0.5, 1.08), (0.5, 1.12), (0.0, 1.12)], molten, seg=48, name="melt")
    for z in (0.7, 0.95):
        r = 0.53 if z < 0.9 else 0.575
        D.torus(r, 0.022, iron, loc=(0, 0, z), seg=48, rseg=6, name="hoop")
    # molten metal brimming over the rim and running down the outer wall
    for (a, L) in ((-1.2, 0.34), (-1.9, 0.22)):
        d = Vector((math.cos(a), math.sin(a), 0))
        pts = [tuple(d * 0.6 + Vector((0, 0, 1.16))), tuple(d * 0.62 + Vector((0, 0, 1.08))),
               tuple(d * 0.6 + Vector((0, 0, 1.16 - L * 0.6))), tuple(d * 0.575 + Vector((0, 0, 1.16 - L)))]
        D.sweep(D.catmull(pts, 5), lambda t: 0.035 * (1 - 0.3 * t), hot, segs=10, name="overflow")
        D.sphere(0.035, hot, loc=pts[-1], seg=12, rings=8, name="drop")
    # trunnions and chain tackle
    for sx in (-1, 1):
        D.cyl(0.05, 0.12, iron, loc=(sx * 0.62, 0, 0.92), rot=(0, rad(90), 0), seg=16, name="trunnion")
        D.chain([(sx * 0.62, 0.0, 0.95), (sx * 0.4, 0.0, 1.4), (0.0, 0.0, 1.62)], iron,
                link_len=0.08, wire=0.012)
    D.torus(0.06, 0.016, iron, loc=(0, 0, 1.66), rot=(rad(90), 0, 0), seg=24, rseg=8, name="ring")
    D.point_light((0, -0.3, 1.3), (1.0, 0.5, 0.1), 40, 0.3)
    D.point_light((0, -0.8, 0.2), (1.0, 0.4, 0.05), 20, 0.2)
    D.view(pitch=12, fill=0.95, glow=0.9)


@prop("deco_forge_chains", (64, 240), anchor="top")
def build_forge_chains():
    """Two heavy iron chains hanging from a ceiling bracket, one ending in a
    cargo hook, the other in a shackle with a glowing hot link."""
    iron = D.pbr("chain_iron", (0.13, 0.12, 0.12), metal=1.0, rough=0.38, noise_rough=0.15,
                 pattern="rust", rust=(0.24, 0.1, 0.05), scale=6.0)
    hot = DM_hotmetal("chain_hot", 3.5)
    D.box((0.5, 0.2, 0.08), iron, loc=(0, 0, 2.52), bev=0.02, name="bracket")
    for sx in (-0.14, 0.14):
        D.box((0.06, 0.06, 0.1), iron, loc=(sx, 0, 2.44), bev=0.01, name="lug")
    D.chain([(-0.14, 0, 2.42), (-0.12, 0, 0.62)], iron, link_len=0.16, wire=0.024)
    hook = D.bezier_pts((-0.12, 0, 0.62), (-0.12, 0, 0.35), (-0.36, 0, 0.25), (-0.3, 0, 0.45), 20)
    D.sweep(hook, lambda t: 0.05 - 0.035 * t, iron, segs=12, name="hook")
    D.sphere(0.07, iron, loc=(-0.12, 0, 0.66), seg=16, rings=8, name="swivel")
    D.chain([(0.14, 0, 2.42), (0.14, 0, 1.2)], iron, link_len=0.16, wire=0.024)
    D.torus(0.08, 0.025, hot, loc=(0.14, 0, 1.12), rot=(0, 0, 0), sx=0.6, seg=24, rseg=8,
            name="hotlink")
    D.torus(0.1, 0.026, iron, loc=(0.14, 0, 0.98), rot=(rad(90), 0, 0), sx=0.8, seg=24, rseg=8,
            name="shackle")
    D.point_light((0.14, -0.3, 1.1), (1.0, 0.45, 0.1), 12, 0.2)
    D.view(pitch=4, fill=0.95, glow=0.8, anchor="top")


# ---- sunken sanctuary ------------------------------------------------------------
def DM_coral(name, color, glow=0.0, emit=None):
    return D.pbr(name, color, rough=0.6, sss=0.25, sss_radius=(1.0, 0.5, 0.4), bump=0.5,
                 bump_scale=60, emit=emit or color, emit_str=glow)


def coral_branch(p0, d, L, r, mat, rng, depth=0, name="coral"):
    """Recursive branching coral."""
    p0 = Vector(p0)
    d = Vector(d).normalized()
    pts = [p0]
    for i in range(1, 7):
        d = (d + Vector((rng.uniform(-0.2, 0.2), rng.uniform(-0.1, 0.1), 0.12))).normalized()
        pts.append(pts[-1] + d * L / 6)
    D.sweep(pts, lambda t: r * (1 - 0.55 * t), mat, segs=8, name=name)
    D.sphere(r * 0.5, mat, loc=tuple(pts[-1]), seg=8, rings=6)
    if depth < 2:
        for _ in range(2):
            k = rng.randint(2, 5)
            nd = (d + Vector((rng.uniform(-0.9, 0.9), rng.uniform(-0.3, 0.3), 0.3))).normalized()
            coral_branch(pts[k], nd, L * 0.6, r * 0.62, mat, rng, depth + 1, name)


@prop("deco_sunk_coral", (120, 120))
def build_sunk_coral():
    """Reef clump on a wet rock: branching red coral, a lace fan, a brain coral,
    anemones with glowing teal tips."""
    rockm = D.pbr("reefrock", (0.14, 0.2, 0.2), rough=0.8, pattern="stone", scale=4.0, moss=True,
                  moss_color=(0.05, 0.2, 0.15), moss_z0=-0.2, moss_z1=0.5)
    red = DM_coral("coral_red", (0.7, 0.14, 0.12))
    orange = DM_coral("coral_or", (0.85, 0.42, 0.14))
    brain = DM_coral("coral_brain", (0.55, 0.5, 0.32))
    fanm = DM_coral("coral_fan", (0.55, 0.12, 0.45))
    anem = DM_coral("anemone", (0.1, 0.5, 0.45), glow=0.3, emit=(0.2, 0.9, 0.8))
    tipm = D.M_glow("anem_tip", (0.3, 1.0, 0.9), 5.0)
    rng = random.Random(7)
    D.rock((0, 0.05, 0.12), 0.46, rockm, scale=(1.25, 0.8, 0.42), seed=1)
    D.rock((-0.45, -0.1, 0.06), 0.18, rockm, scale=(1.2, 1.0, 0.7), seed=2)
    D.rock((0.5, -0.05, 0.05), 0.16, rockm, scale=(1.2, 1.0, 0.7), seed=3)
    for (x, y, L, r, m) in ((-0.2, 0.0, 0.9, 0.075, red), (0.15, 0.1, 0.75, 0.065, orange),
                            (-0.42, -0.1, 0.5, 0.05, orange)):
        coral_branch((x, y, 0.25), (x * 0.4, 0, 1.0), L, r, m, rng)
    # sea fan: lace of cells (voronoi edges opaque, cells dark)
    if "coral_lace" not in D.G.mats:
        lace = D.pbr("coral_lace", (0.62, 0.14, 0.5), rough=0.6, sss=0.2)
        nt = lace.node_tree
        I = _bsdf(lace).inputs
        tc = nt.nodes.new("ShaderNodeTexCoord")
        vo = _n(nt, "ShaderNodeTexVoronoi", Scale=14.0, _feature="DISTANCE_TO_EDGE")
        nt.links.new(tc.outputs["Object"], vo.inputs["Vector"])
        nt.links.new(_ramp(nt, vo.outputs["Distance"], [(0.0, (0.75, 0.2, 0.6)), (0.06, (0.62, 0.14, 0.5)),
                                                        (0.1, (0.1, 0.02, 0.08))]), I["Base Color"])
    lace = D.G.mats["coral_lace"]
    pts = [(0.0, 0.0)] + [(0.42 * math.cos(a), 0.55 * math.sin(a)) for a in
                          [math.pi * (0.1 + 0.8 * i / 20) for i in range(21)]]
    D.extrude(pts, 0.02, lace, loc=(0.3, 0.15, 0.3), rot=(0, rad(-12), rad(15)), name="fan")
    for k in range(7):
        a = math.pi * (0.15 + 0.7 * k / 6)
        D.sweep([(0.3, 0.13, 0.3), (0.3 + 0.4 * math.cos(a), 0.13, 0.3 + 0.52 * math.sin(a))], 0.012,
                fanm, segs=6, name="fan_rib")
    # brain coral
    b = D.sphere(0.2, brain, loc=(0.42, -0.2, 0.28), scale=(1.0, 0.9, 0.7), seg=32, rings=16)
    D.displace(b, 0.03, 0.05, kind="MARBLE")
    # anemones
    for (x, y, z) in ((-0.1, -0.3, 0.3), (0.12, -0.35, 0.26), (-0.5, -0.25, 0.18)):
        D.cyl(0.05, 0.1, anem, loc=(x, y, z), seg=12, name="anem_body")
        for k in range(10):
            a = TAU * k / 10
            d = Vector((math.cos(a) * 0.5, math.sin(a) * 0.5, 1.0)).normalized()
            p0 = Vector((x, y, z + 0.05)) + Vector((math.cos(a), math.sin(a), 0)) * 0.04
            p1 = p0 + d * 0.12
            D.sweep([tuple(p0), tuple(p0 + d * 0.06 + Vector((0, 0, 0.02))), tuple(p1)],
                    lambda t: 0.012 * (1 - 0.5 * t), anem, segs=6, name="tentacle")
            D.sphere(0.012, tipm, loc=tuple(p1), seg=8, rings=4)
    for k in range(6):
        D.sphere(rng.uniform(0.015, 0.03), D.M_glass("bubble", (0.9, 1.0, 1.0)),
                 loc=(rng.uniform(-0.4, 0.4), -0.35, rng.uniform(0.8, 1.2)), seg=12, rings=8)
    D.point_light((0, -0.6, 0.6), (0.3, 0.9, 0.85), 20, 0.3)
    D.view(pitch=8, fill=0.95, glow=0.6)


def barnacles(ob_center, R, n, mat, rng, zmin=-1, zmax=1, scale=1.0):
    for _ in range(n):
        a = rng.uniform(0, TAU)
        z = rng.uniform(zmin, zmax)
        p = Vector(ob_center) + Vector((math.cos(a) * R, math.sin(a) * R, z))
        D.cone(0.03 * scale, 0.03 * scale, mat, loc=tuple(p), seg=6, name="barnacle",
               rot=(0, math.atan2(math.cos(a), 1.0) * 0.6, 0))


@prop("deco_sunk_bell", (144, 120))
def build_sunk_bell():
    """A great bronze church bell fallen on its side on the sea floor, green
    with verdigris, crusted with barnacles and coral, seaweed streaming."""
    bronze = D.pbr("verdigris", (0.2, 0.46, 0.38), metal=0.35, rough=0.5, pattern="rust",
                   rust=(0.5, 0.3, 0.13), scale=3.5, bump=0.2)
    inner = D.pbr("bell_in", (0.04, 0.06, 0.05), rough=0.8)
    rockm = D.pbr("sand", (0.3, 0.28, 0.2), rough=0.9, bump=0.4, bump_scale=30)
    barn = D.pbr("barnacle", (0.72, 0.7, 0.62), rough=0.7, bump=0.4, bump_scale=60)
    weed = D.pbr("seaweed", (0.12, 0.35, 0.12), rough=0.5, sss=0.3, coat=0.3)
    red = DM_coral("coral_red", (0.7, 0.14, 0.12))
    rng = random.Random(5)
    for k, (x, r) in enumerate(((-0.55, 0.3), (0.0, 0.42), (0.55, 0.3), (-0.2, 0.25), (0.35, 0.28))):
        D.rock((x, 0.1, 0.0), r, rockm, scale=(1.6, 0.9, 0.28), seed=k + 4, strength=0.25)
    prof = [(0.0, 1.2), (0.12, 1.2), (0.22, 1.16), (0.3, 1.05), (0.33, 0.85), (0.36, 0.62),
            (0.44, 0.4), (0.56, 0.22), (0.64, 0.12), (0.66, 0.06), (0.62, 0.04), (0.56, 0.1),
            (0.4, 0.3), (0.29, 0.6), (0.26, 0.9), (0.2, 1.08), (0.0, 1.12)]
    with D.sub(loc=(0.05, 0.0, 0.62), rot=(0, rad(-78), 0)):
        with D.sub(loc=(0, 0, -0.62)):
            D.lathe(prof, bronze, seg=56, cap=True, name="bell")
            D.lathe([(0.0, 0.1), (0.54, 0.1), (0.3, 0.6), (0.0, 1.05)], inner, seg=40, name="inner")
            for z in (0.2, 0.9):
                r = 0.6 if z < 0.5 else 0.3
                D.torus(r, 0.022, bronze, loc=(0, 0, z), seg=48, rseg=6, name="rib")
            D.torus(0.12, 0.04, bronze, loc=(0, 0, 1.26), rot=(rad(90), 0, 0), seg=24, rseg=8,
                    name="crown")
            # clapper hanging out
            D.sweep([(0, 0, 0.9), (0.0, 0.0, 0.3), (0.0, -0.1, 0.05)], 0.025, bronze, segs=8)
            D.sphere(0.07, bronze, loc=(0.0, -0.1, 0.02), seg=16, rings=8)
    for k in range(40):
        x = rng.uniform(-0.6, 0.55)
        D.cone(rng.uniform(0.02, 0.035), 0.035, barn, loc=(x, rng.uniform(-0.5, -0.2),
               rng.uniform(0.3, 1.0) * (1 - abs(x) * 0.4)), rot=(rad(90), 0, 0), seg=6,
               name="barnacle")
    for (x, y, z) in ((0.5, -0.1, 0.9), (-0.45, -0.1, 0.3)):
        coral_branch((x, y, z), (0.2 if x > 0 else -0.3, -0.2, 1.0), 0.45, 0.03, red, rng)
    for k in range(6):
        x = rng.uniform(-0.8, 0.8)
        pts = [(x + 0.08 * math.sin(i * 0.9 + k), -0.3 + 0.02 * i, 0.05 + 0.1 * i) for i in range(8)]
        D.sweep(pts, lambda t: 0.022 * (1 - 0.6 * t), weed, segs=6, name="weed")
    D.point_light((0.0, -0.8, 1.0), (0.3, 0.9, 0.85), 18, 0.3)
    D.view(pitch=10, fill=0.95, glow=0.5)


@prop("deco_sunk_statue", (96, 200))
def build_sunk_statue():
    """Drowned saint: a robed stone priestess with folded hands and a broken
    halo, overgrown with coral, barnacles and streaming kelp."""
    stone = D.pbr("sunkstone", (0.46, 0.52, 0.52), rough=0.75, pattern="stone", scale=2.5,
                  crack=0.004, moss=True, moss_color=(0.06, 0.28, 0.2), moss_z0=-0.6, moss_z1=1.0)
    weed = D.pbr("kelp", (0.14, 0.38, 0.12), rough=0.5, sss=0.3, coat=0.3)
    red = DM_coral("coral_red", (0.7, 0.14, 0.12))
    orange = DM_coral("coral_or", (0.85, 0.42, 0.14))
    barn = D.pbr("barnacle", (0.72, 0.7, 0.62), rough=0.7, bump=0.4, bump_scale=60)
    halo = D.pbr("halo_bronze", (0.5, 0.62, 0.45), metal=0.8, rough=0.35, emit=(0.3, 0.9, 0.8),
                 emit_str=0.4)
    rng = random.Random(9)
    D.box((0.8, 0.6, 0.18), stone, loc=(0, 0, 0.09), bev=0.03, name="plinth")
    D.box((0.64, 0.5, 0.14), stone, loc=(0, 0, 0.25), bev=0.03, name="plinth2")
    with D.sub(loc=(0, 0, 0.32)):
        D.lathe(D.catmull2d([(0.0, 0.0), (0.3, 0.0), (0.28, 0.25), (0.22, 0.6), (0.2, 0.85),
                             (0.23, 1.0), (0.16, 1.12), (0.08, 1.16), (0.0, 1.16)], 3,
                            closed=False), stone, seg=40, sy=0.75, name="robe",
                radial=lambda a, t: 1 + 0.06 * math.sin(9 * a) * (1 - t))
        # hood + head
        D.sphere(0.13, stone, loc=(0, -0.02, 1.26), scale=(1.0, 1.0, 1.15), seg=24, rings=12)
        hood = D.lathe(D.catmull2d([(0.0, 1.46), (0.1, 1.44), (0.17, 1.33), (0.18, 1.18),
                                    (0.2, 1.08)], 3, closed=False), stone, seg=32, cap=False,
                       a0=rad(-60), a1=rad(240), name="hood")
        D.solidify(hood, 0.03)
        # folded hands
        for sx in (-1, 1):
            D.sweep([(sx * 0.2, -0.05, 1.0), (sx * 0.14, -0.2, 0.86), (sx * 0.03, -0.24, 0.9)],
                    0.05, stone, segs=10, name="arm")
        D.sphere(0.06, stone, loc=(0, -0.27, 0.93), scale=(0.8, 0.6, 1.2), seg=16, rings=8)
        # broken halo
        D.torus(0.22, 0.018, halo, loc=(0, 0.1, 1.3), rot=(rad(90), 0, 0), a0=rad(-50), a1=rad(200),
                seg=48, rseg=8, name="halo")
    for k in range(30):
        a = rng.uniform(-2.2, -0.9)
        z = rng.uniform(0.35, 1.3)
        r = 0.23 * 0.75
        D.cone(0.022, 0.025, barn, loc=(0.25 * math.cos(a), r * math.sin(a), z),
               rot=(rad(90), 0, 0), seg=6, name="barnacle")
    coral_branch((0.25, -0.15, 0.35), (0.6, -0.2, 1.0), 0.42, 0.03, red, rng)
    coral_branch((-0.28, -0.1, 0.3), (-0.5, -0.1, 1.0), 0.36, 0.028, orange, rng)
    coral_branch((0.1, -0.05, 1.5), (0.4, 0.0, 1.0), 0.24, 0.02, red, rng)
    for k in range(5):
        x = -0.3 + 0.15 * k
        pts = [(x + 0.06 * math.sin(i * 1.1 + k), -0.35, 0.3 + 0.16 * i) for i in range(6 + k % 3)]
        D.sweep(pts, lambda t: 0.024 * (1 - 0.7 * t), weed, segs=6, name="kelp")
    D.point_light((0, -0.7, 1.4), (0.3, 0.9, 0.85), 14, 0.3)
    D.view(pitch=6, fill=0.95, glow=0.5)


# ---- sky kingdom -------------------------------------------------------------------
def DM_whitemarble():
    return D.M_marble("skymarble", (0.93, 0.91, 0.86), vein=(0.72, 0.68, 0.62), scale=1.4)


def DM_skygold():
    return D.pbr("skygold", (1.0, 0.76, 0.34), metal=1.0, rough=0.2, noise_rough=0.06)


def cloud_puffs(center, rx, rz, n, rng, mat=None):
    """Soft cloud tuft made of overlapping spheres (bright, slightly SSS)."""
    mat = mat or D.pbr("cloud", (0.95, 0.96, 1.0), rough=0.9, sss=0.6,
                       sss_radius=(1.0, 1.0, 1.0), emit=(0.8, 0.85, 1.0), emit_str=0.15)
    cx, cy, cz = center
    for k in range(n):
        x = cx + rng.uniform(-rx, rx)
        z = cz + rng.uniform(-rz * 0.3, rz) * (1 - abs(x - cx) / (rx * 1.3))
        r = rng.uniform(0.4, 0.75) * rz
        D.sphere(r, mat, loc=(x, cy + rng.uniform(-0.1, 0.1), z), scale=(1.6, 1.0, 0.8), seg=24,
                 rings=12, name="cloud")


@prop("deco_sky_column", (96, 240))
def build_sky_column():
    """White marble column of the sky palace: fluted shaft with gilded rings,
    a gilded Corinthian-ish capital with volutes, stepped base on a cloud."""
    marble = DM_whitemarble()
    gold = DM_skygold()
    rng = random.Random(4)
    H = 2.75
    D.box((0.62, 0.62, 0.1), marble, loc=(0, 0, 0.12), bev=0.02, name="plinth")
    D.lathe(D.catmull2d([(0.0, 0.17), (0.28, 0.17), (0.3, 0.2), (0.26, 0.25), (0.24, 0.3),
                         (0.27, 0.33), (0.0, 0.33)], 3, closed=False), marble, seg=48, name="base")
    D.torus(0.25, 0.02, gold, loc=(0, 0, 0.35), seg=48, rseg=8, name="ring")
    D.lathe([(0.0, 0.35), (0.22, 0.35), (0.2, H - 0.3), (0.0, H - 0.3)], marble, seg=64,
            name="shaft", radial=lambda a, t: 1 - 0.07 * max(0.0, math.cos(20 * a)) ** 4)
    for z in (0.9, H - 0.34):
        D.torus(0.215, 0.02, gold, loc=(0, 0, z), seg=48, rseg=8, name="ring")
    # capital: bell of gilded leaves + abacus with volutes
    for k in range(12):
        a = TAU * k / 12
        d = Vector((math.cos(a), math.sin(a), 0))
        p0 = Vector((0, 0, H - 0.3)) + d * 0.19
        pts = D.bezier_pts(p0, p0 + d * 0.04 + Vector((0, 0, 0.12)), p0 + d * 0.12 + Vector((0, 0, 0.2)),
                           p0 + d * 0.18 + Vector((0, 0, 0.16)), 10)
        D.sweep(pts, lambda t: 0.04 * (1 - 0.6 * t), gold, segs=6, name="leaf")
    D.lathe([(0.0, H - 0.32), (0.21, H - 0.32), (0.3, H - 0.1), (0.0, H - 0.1)], marble, seg=48,
            name="bell")
    D.box((0.72, 0.72, 0.09), marble, loc=(0, 0, H - 0.05), bev=0.02, name="abacus")
    D.box((0.74, 0.74, 0.02), gold, loc=(0, 0, H - 0.095), bev=0.005, name="abacus_trim")
    for sx in (-1, 1):
        D.torus(0.06, 0.028, gold, loc=(sx * 0.3, -0.3, H - 0.14), rot=(rad(90), 0, 0), seg=24,
                rseg=8, name="volute")
    cloud_puffs((0, -0.12, 0.05), 0.34, 0.12, 12, rng)
    D.view(pitch=6, fill=0.95, glow=0.3)


@prop("deco_sky_statue", (120, 200))
def build_sky_statue():
    """Winged guardian of the sky kingdom: a white marble angel knight with
    gilded wings, helm and spear, on a gilded pedestal."""
    marble = DM_whitemarble()
    gold = DM_skygold()
    D.box((0.84, 0.56, 0.14), marble, loc=(0, 0, 0.07), bev=0.02, name="plinth")
    D.box((0.7, 0.48, 0.22), marble, loc=(0, 0, 0.25), bev=0.02, name="die")
    D.box((0.72, 0.5, 0.03), gold, loc=(0, 0, 0.35), bev=0.008, name="trim")
    with D.sub(loc=(0, 0.02, 0.37)):
        D.lathe(D.catmull2d([(0.0, 0.0), (0.26, 0.0), (0.22, 0.4), (0.17, 0.72), (0.2, 0.9),
                             (0.24, 1.0), (0.2, 1.06), (0.1, 1.1), (0.0, 1.1)], 3,
                            closed=False), marble, seg=40, sy=0.7, name="robe",
                radial=lambda a, t: 1 + 0.07 * math.sin(10 * a) * (1 - t) ** 2)
        D.torus(0.18, 0.025, gold, loc=(0, 0, 0.72), sy=0.72, seg=40, rseg=8, name="belt")
        D.sphere(0.1, marble, loc=(0, 0, 1.2), scale=(1.0, 1.0, 1.1), seg=24, rings=12, name="head")
        D.lathe(D.catmull2d([(0.0, 1.36), (0.08, 1.34), (0.115, 1.25), (0.12, 1.16)], 3,
                            closed=False), gold, seg=32, cap=False, name="helm")
        D.cone(0.02, 0.14, gold, loc=(0, 0, 1.34), seg=8, name="crest")
        for sx in (-1, 1):
            D.sphere(0.1, gold, loc=(sx * 0.22, 0, 1.0), scale=(1.0, 0.8, 0.7), seg=20, rings=10,
                     name="pauldron")
        # arms: right holds a spear, left on a shield
        D.sweep([(0.22, 0, 0.98), (0.3, -0.08, 0.8), (0.24, -0.16, 0.72)], 0.045, marble, segs=10)
        D.cyl(0.018, 1.6, gold, loc=(0.26, -0.18, 0.95), seg=10, name="spear")
        D.cone(0.04, 0.2, gold, loc=(0.26, -0.18, 1.75), seg=4, name="spearhead")
        D.sweep([(-0.22, 0, 0.98), (-0.3, -0.1, 0.78), (-0.2, -0.2, 0.62)], 0.045, marble, segs=10)
        D.lathe([(0.0, 0.0), (0.18, 0.0), (0.2, 0.02), (0.0, 0.05)], marble, seg=32,
                loc=(-0.22, -0.24, 0.55), rot=(rad(90), 0, 0), sx=0.8, name="shield")
        D.torus(0.18, 0.015, gold, loc=(-0.22, -0.25, 0.55), rot=(rad(90), 0, 0), sx=0.8, seg=32,
                rseg=6, name="shield_rim")
        D.extrude(D.shape_star(4, 0.09, 0.03), 0.02, gold, loc=(-0.22, -0.27, 0.55), name="shield_star")
        # wings
        for sx in (-1, 1):
            with D.sub(loc=(sx * 0.14, 0.14, 0.98), rot=(0, 0, sx * rad(-12))):
                for k in range(8):
                    th = rad(8 + 11 * k)
                    L = 0.42 + 0.055 * k
                    p = [(0.0, 0.0), (L * 0.35, 0.055), (L, 0.025), (L * 0.97, -0.02), (L * 0.3, -0.06)]
                    D.extrude([(sx * x, z) for x, z in p], 0.025, gold if k >= 6 else marble,
                              loc=(0, 0.012 * k, 0.0), rot=(0, -sx * th, 0), bev=0.006,
                              name="feather")
                D.sphere(0.07, marble, scale=(1.4, 1.0, 1.0), seg=16, rings=8, name="wing_root")
    D.view(pitch=6, fill=0.95, glow=0.3)


@prop("deco_sky_urn", (72, 96))
def build_sky_urn():
    """Marble amphora with gilded bands, wing handles and a laurel of light."""
    marble = DM_whitemarble()
    gold = DM_skygold()
    prof = [(0.0, 0.0), (0.2, 0.0), (0.22, 0.04), (0.12, 0.1), (0.14, 0.16), (0.3, 0.34),
            (0.36, 0.52), (0.32, 0.72), (0.18, 0.86), (0.13, 0.94), (0.18, 1.0), (0.2, 1.04),
            (0.0, 1.04)]
    D.lathe(D.catmull2d(prof, 4, closed=False), marble, seg=48, name="urn")
    for z, r in ((0.52, 0.365), (0.86, 0.185), (0.1, 0.13)):
        D.torus(r, 0.018, gold, loc=(0, 0, z), seg=48, rseg=8, name="band")
    D.torus(0.2, 0.02, gold, loc=(0, 0, 1.04), seg=40, rseg=8, name="lip")
    for sx in (-1, 1):
        wingp = [(0.0, 0.0), (0.1, 0.06), (0.2, 0.16), (0.24, 0.3), (0.18, 0.22), (0.19, 0.28),
                 (0.12, 0.2), (0.12, 0.26), (0.05, 0.16)]
        D.extrude([(sx * x, z) for x, z in wingp], 0.03, gold, loc=(sx * 0.3, 0.0, 0.58), bev=0.006,
                  name="wing_handle")
    # meander band (gold frieze)
    for k in range(10):
        a = -math.pi / 2 + (k - 4.5) * 0.28
        D.box((0.05, 0.012, 0.05), gold, loc=(0.35 * math.cos(a), 0.35 * math.sin(a) * 1.0, 0.44),
              rot=(0, 0, a + math.pi / 2), bev=0.004, name="meander")
    D.view(pitch=6, fill=0.95, glow=0.2)


# ---- nightmare labyrinth -------------------------------------------------------------
def DM_dreamwood():
    return D.pbr("dreamwood", (0.16, 0.08, 0.12), rough=0.55, coat=0.3, pattern="wood",
                 dark=(0.04, 0.015, 0.03))


def DM_dreamglow(name="dreamglow", strength=4.0):
    return D.M_glow(name, (0.75, 0.3, 1.0), strength, base=(0.6, 0.3, 0.9))


@prop("deco_dream_cradle", (160, 120))
def build_dream_cradle():
    """A lost child's rocking cradle: dark lacquered wood, a torn violet veil,
    a mobile of glowing moons and stars hanging over it."""
    wood = DM_dreamwood()
    veil = D.pbr("veil", (0.42, 0.18, 0.55), rough=0.7, sheen=0.6, sss=0.3, alpha=0.85)
    lace = D.pbr("lace", (0.85, 0.8, 0.85), rough=0.7, sheen=0.5)
    brass = D.pbr("dreambrass", (0.55, 0.42, 0.3), metal=1.0, rough=0.4)
    # rockers
    for sy in (-0.28, 0.28):
        arc = [(0.72 * math.sin(a), sy, 0.34 - 0.34 * math.cos(a) * 0.9) for a in
               [rad(-70 + 140 * i / 20) for i in range(21)]]
        D.sweep(arc, 0.035, wood, segs=10, name="rocker")
    # basket: box with slatted sides
    D.box((1.0, 0.56, 0.06), wood, loc=(0, 0, 0.16), bev=0.02, name="floor")
    for sx in (-1, 1):
        D.box((0.06, 0.6, 0.6), wood, loc=(sx * 0.52, 0, 0.44), bev=0.02, name="end")
        D.sphere(0.05, wood, loc=(sx * 0.52, -0.3, 0.78), seg=16, rings=8, name="knob")
        D.sphere(0.05, wood, loc=(sx * 0.52, 0.3, 0.78), seg=16, rings=8, name="knob")
    for k in range(9):
        x = -0.44 + 0.11 * k
        D.cyl(0.018, 0.4, wood, loc=(x, -0.28, 0.4), seg=8, name="slat")
    D.box((1.02, 0.04, 0.05), wood, loc=(0, -0.28, 0.62), bev=0.01, name="rail")
    D.box((1.02, 0.04, 0.05), wood, loc=(0, -0.28, 0.2), bev=0.01, name="rail")
    # blanket spilling over
    D.lathe([(0.0, 0.58), (0.42, 0.58), (0.36, 0.64), (0.0, 0.66)], lace, seg=24, sx=1.1, sy=0.6,
            name="blanket")
    # canopy post + torn veil
    D.cyl(0.02, 0.8, wood, loc=(0.52, 0.2, 1.0), seg=8, name="post")
    D.sweep(D.bezier_pts((0.52, 0.2, 1.38), (0.35, 0.2, 1.46), (0.0, 0.2, 1.42), (-0.1, 0.2, 1.36), 12),
            0.015, wood, segs=6, name="arm")

    def arm_z(x):
        return 1.38 + 0.08 * math.sin(math.pi * (0.52 - x) / 0.62)

    def vfn(u, v):
        x = 0.5 - 0.62 * u
        L = 0.5 + 0.22 * u + 0.07 * math.sin(u * 23.0) + 0.05 * math.sin(u * 41.0 + 1.0)
        z = arm_z(x) - v * L
        y = 0.2 - 0.16 * v * v - 0.03 * math.sin(u * 17.0 + v * 5.0)
        return (x + 0.05 * v * math.sin(u * 3.0), y, z)
    surface_D(vfn, 32, 14, veil, name="veil", thick=0.006)
    # mobile: a small hoop hung from the canopy arm, moons and stars on threads
    moon_m = D.M_glow("dreammoon", (0.85, 0.7, 1.0), 1.4, base=(0.8, 0.7, 0.95))
    star_m = D.M_glow("dreamstar", (1.0, 0.85, 0.6), 1.6)
    hx, hz = -0.12, 1.2
    D.sweep([(hx, 0.1, arm_z(hx) - 0.02), (hx, 0.1, hz)], 0.004, brass, segs=4, name="thread")
    D.torus(0.16, 0.008, brass, loc=(hx, 0.1, hz), sy=0.5, seg=32, rseg=6, name="hoop")
    for k, (dx, dz, kind) in enumerate(((-0.16, 0.2, "moon"), (-0.05, 0.28, "star"),
                                        (0.06, 0.18, "moon"), (0.16, 0.26, "star"))):
        top = (hx + dx, 0.1 - 0.04, hz)
        bot = (top[0], top[1], hz - dz)
        D.sweep([top, bot], 0.003, brass, segs=4, name="thread")
        if kind == "moon":
            moon = E.shape_crescent(0.06, 0.05, 0.03)
            D.extrude(moon, 0.02, moon_m, loc=(bot[0], bot[1], bot[2] - 0.06), name="moon")
        else:
            D.extrude(D.shape_star(5, 0.065, 0.028), 0.02, star_m, loc=(bot[0], bot[1], bot[2] - 0.065),
                      name="star")
    D.point_light((0, -0.6, 0.9), (0.7, 0.3, 1.0), 16, 0.3)
    D.view(pitch=8, fill=0.95, glow=0.7)


@prop("deco_dream_doll", (72, 80))
def build_dream_doll():
    """Cracked porcelain doll slumped against nothing: violet dress, one empty
    socket, one glowing violet eye."""
    porcelain = D.pbr("porcelain", (0.92, 0.88, 0.86), rough=0.2, coat=0.8, sss=0.2)
    dress = D.pbr("dolldress", (0.32, 0.1, 0.4), rough=0.7, sheen=0.6, bump=0.2, bump_scale=120)
    lace = D.pbr("lace", (0.85, 0.8, 0.85), rough=0.7, sheen=0.5)
    hair = D.pbr("dollhair", (0.25, 0.15, 0.08), rough=0.6, sheen=0.5, bump=0.5, bump_scale=200)
    eye = D.M_glow("dolleye", (0.6, 0.12, 1.0), 1.4)
    black = D.M_black()
    crack = D.pbr("dollcrack", (0.05, 0.02, 0.05), rough=0.9)
    # skirt (sitting: wide bell) + legs forward
    D.lathe(D.catmull2d([(0.0, 0.0), (0.42, 0.0), (0.4, 0.06), (0.28, 0.22), (0.18, 0.4),
                         (0.14, 0.5), (0.0, 0.5)], 3, closed=False), dress, seg=40, sy=0.8,
            name="dress", radial=lambda a, t: 1 + 0.07 * math.sin(12 * a) * (1 - t))
    D.torus(0.4, 0.025, lace, loc=(0, 0, 0.03), sy=0.8, seg=48, rseg=6, name="hem")
    for sx in (-1, 1):
        D.sweep([(sx * 0.1, -0.1, 0.06), (sx * 0.14, -0.4, 0.05)], 0.045, porcelain, segs=10,
                name="leg")
        D.sphere(0.055, black, loc=(sx * 0.14, -0.44, 0.06), scale=(0.9, 1.3, 0.9), seg=12, rings=8)
        D.sweep([(sx * 0.14, 0.0, 0.46), (sx * 0.24, -0.05, 0.3), (sx * 0.22, -0.14, 0.18)], 0.035,
                porcelain, segs=10, name="arm")
    D.torus(0.13, 0.03, lace, loc=(0, 0, 0.5), sy=0.8, seg=32, rseg=6, name="collar")
    # head tilted
    with D.sub(loc=(0, 0.0, 0.68), rot=(rad(-8), rad(14), 0)):
        D.sphere(0.17, porcelain, scale=(1.0, 0.95, 1.05), seg=32, rings=16, name="head")
        hr = D.sphere(0.185, hair, loc=(0, 0.04, 0.04), scale=(1.05, 1.0, 1.05), seg=32, rings=16,
                      name="hair")
        cut = D.box((0.5, 0.3, 0.3), hair, loc=(0, -0.2, -0.08), rot=(rad(-20), 0, 0))
        D.boolean(hr, cut)
        for sx in (-1, 1):
            D.sweep([(sx * 0.16, 0.02, 0.02), (sx * 0.2, 0.0, -0.12), (sx * 0.18, -0.02, -0.26)],
                    0.035, hair, segs=8, name="curl")
        D.sphere(0.04, eye, loc=(-0.06, -0.15, 0.02), scale=(1.0, 0.5, 1.0), seg=16, rings=8,
                 name="eye")
        D.sphere(0.042, black, loc=(0.06, -0.14, 0.02), scale=(1.0, 0.5, 1.0), seg=16, rings=8,
                 name="socket")
        D.sweep([(0.02, -0.165, 0.12), (0.05, -0.17, 0.06), (0.03, -0.172, 0.0),
                 (0.07, -0.165, -0.06)], 0.005, crack, segs=4, name="crack")
        D.box((0.05, 0.02, 0.01), D.pbr("dolllip", (0.5, 0.08, 0.12), rough=0.3), loc=(0, -0.16, -0.08))
        D.lathe([(0.0, 0.0), (0.08, 0.0), (0.1, 0.04), (0.0, 0.05)], lace, seg=24, loc=(0.08, 0.02, 0.16),
                rot=(0, rad(30), 0), name="bow")
    D.point_light((0, -0.5, 0.7), (0.7, 0.3, 1.0), 6, 0.2)
    D.view(pitch=10, fill=0.95, glow=0.7)


@prop("deco_dream_clock", (96, 220))
def build_dream_clock():
    """A grandfather clock that has started to melt: the case twists and sags,
    the dial droops over its frame, the pendulum glows violet."""
    wood = DM_dreamwood()
    brass = D.pbr("dreambrass", (0.62, 0.46, 0.3), metal=1.0, rough=0.35)
    dial = D.pbr("dial", (0.85, 0.8, 0.7), rough=0.5)
    glow = DM_dreamglow("pendglow", 3.0)
    black = D.M_black()
    glass = D.pbr("clockglass", (0.3, 0.2, 0.4), rough=0.05, trans=0.8, ior=1.4)
    parts = []
    parts.append(D.box((0.6, 0.42, 0.16), wood, loc=(0, 0, 0.08), bev=0.02, name="foot"))
    parts.append(D.box((0.5, 0.36, 1.2), wood, loc=(0, 0, 0.76), bev=0.02, name="trunk"))
    parts.append(D.box((0.62, 0.44, 0.62), wood, loc=(0, 0, 1.66), bev=0.03, name="hood"))
    top = [(-0.34, 0.0), (0.34, 0.0), (0.3, 0.1), (0.14, 0.2), (0.0, 0.28), (-0.14, 0.2), (-0.3, 0.1)]
    parts.append(D.extrude(top, 0.44, wood, loc=(0, 0, 1.97), bev=0.02, name="bonnet"))
    # window with glowing pendulum
    D.box((0.3, 0.02, 0.8), glass, loc=(0, -0.185, 0.8), name="window")
    D.cyl(0.012, 0.6, brass, loc=(0.03, -0.16, 0.95), rot=(0, rad(8), 0), seg=8, name="rod")
    D.cyl(0.1, 0.03, glow, loc=(0.07, -0.16, 0.62), rot=(rad(90), 0, 0), seg=24, name="bob")
    # drooping dial: surface that sags below the hood
    def dfn(u, v):
        a = TAU * u
        r = 0.25 * v
        x = r * math.cos(a)
        z = r * math.sin(a)
        sag = max(0.0, -z) * 0.9 * (v ** 2) + 0.12 * v ** 3 * max(0.0, math.sin(a + 0.6) * -1)
        return (x, -0.235 - 0.02 * v, 1.66 + z - sag)
    surface_D(dfn, 48, 8, dial, name="dial", thick=0.01)
    D.torus(0.26, 0.02, brass, loc=(0, -0.23, 1.66), rot=(rad(90), 0, 0), seg=48, rseg=6,
            name="bezel")
    for k in range(12):
        a = TAU * k / 12
        r = 0.2
        z = r * math.sin(a)
        sag = max(0.0, -z) * 0.9 + 0.12 * max(0.0, math.sin(a + 0.6) * -1)
        D.box((0.012, 0.01, 0.04), black, loc=(r * math.cos(a), -0.26, 1.66 + z - sag * 0.8),
              rot=(0, -a + math.pi / 2, 0), name="tick")
    D.box((0.012, 0.01, 0.16), black, loc=(0.02, -0.265, 1.6), rot=(0, rad(160), 0), name="hand")
    D.box((0.012, 0.01, 0.12), black, loc=(-0.03, -0.265, 1.64), rot=(0, rad(50), 0), name="hand")
    # twist + bend the whole case (melting)
    for ob in list(D.G.coll.objects):
        if ob.type == "MESH" and ob.name.split(".")[0] in ("trunk", "hood", "bonnet", "foot"):
            md = ob.modifiers.new("Tw", "SIMPLE_DEFORM")
            md.deform_method = "TWIST"
            md.angle = rad(10)
            md.deform_axis = "Z"
    for (x, z) in ((0.28, 1.36), (-0.3, 1.2), (0.26, 0.4)):
        D.sweep([(x, -0.2, z), (x + 0.01, -0.21, z - 0.08), (x, -0.22, z - 0.18)],
                lambda t: 0.03 * (1 - 0.5 * t), wood, segs=8, name="drip")
    D.point_light((0.0, -0.6, 0.7), (0.7, 0.3, 1.0), 10, 0.2)
    D.view(pitch=5, fill=0.95, glow=0.6)


# ---- blighted forest -----------------------------------------------------------------
def DM_rotwood(name="rotwood"):
    return D.pbr(name, (0.2, 0.15, 0.1), rough=0.8, pattern="wood", dark=(0.05, 0.035, 0.02),
                 stain=0.6, moss=True, moss_color=(0.28, 0.36, 0.08), moss_z0=-0.4, moss_z1=0.6)


def DM_capflesh(name, color, spots=None):
    """Mushroom cap: sickly colour with pale warty spots."""
    if name in D.G.mats:
        return D.G.mats[name]
    m = D.pbr(name, color, rough=0.55, sss=0.25, sss_radius=(1.0, 0.8, 0.4), coat=0.3,
              bump=0.2, bump_scale=30)
    if spots:
        nt = m.node_tree
        I = _bsdf(m).inputs
        tc = nt.nodes.new("ShaderNodeTexCoord")
        vo = _n(nt, "ShaderNodeTexVoronoi", Scale=9.0, _feature="F1")
        nt.links.new(tc.outputs["Object"], vo.inputs["Vector"])
        sp = _n(nt, "ShaderNodeMapRange", **{"From Min": 0.14, "From Max": 0.22})
        nt.links.new(vo.outputs["Distance"], sp.inputs["Value"])
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        nt.links.new(sp.outputs["Result"], mix.inputs["Factor"])
        mix.inputs[6].default_value = (*spots, 1)
        mix.inputs[7].default_value = (*color, 1)
        nt.links.new(mix.outputs[2], I["Base Color"])
        inv = _m(nt, "SUBTRACT", 1.0, sp.outputs["Result"])
        I["Emission Color"].default_value = (*spots, 1)
        nt.links.new(_m(nt, "MULTIPLY", inv, 2.5), I["Emission Strength"])
    return m


def DM_gills(name="gills", strength=2.5):
    """Glowing yellow-green gills (radial stripes)."""
    if name in D.G.mats:
        return D.G.mats[name]
    m = D.pbr(name, (0.55, 0.7, 0.2), rough=0.6, emit=(0.72, 1.0, 0.25), emit_str=strength)
    nt = m.node_tree
    I = _bsdf(m).inputs
    tc = nt.nodes.new("ShaderNodeTexCoord")
    gr = _n(nt, "ShaderNodeTexGradient", _gradient_type="RADIAL")
    nt.links.new(tc.outputs["Object"], gr.inputs["Vector"])
    st = _m(nt, "PINGPONG", _m(nt, "MULTIPLY", gr.outputs["Fac"], 48.0), 0.5)
    nt.links.new(_m(nt, "MULTIPLY", _m(nt, "ADD", st, 0.2), strength), I["Emission Strength"])
    return m


def mushroom(base, h, cap_r, cap_mat, stem_mat, gill_mat, lean=0.0, cap_h=None, ring=None):
    """Toadstool: curved stem, domed cap with glowing gills under it."""
    cap_h = cap_h or cap_r * 0.6
    bx, by, bz = base
    top = Vector((bx + lean * h, by, bz + h))
    pts = D.bezier_pts(Vector(base), Vector(base) + Vector((0, 0, h * 0.4)),
                       top - Vector((lean * h * 0.3, 0, h * 0.3)), top, 16)
    D.sweep(pts, lambda t: cap_r * 0.27 * (1.3 - 0.45 * t), stem_mat, segs=14, name="stem")
    D.sphere(cap_r * 0.28, stem_mat, loc=(bx, by, bz + 0.02), scale=(1.2, 1.2, 0.6), seg=16, rings=8)
    ang = math.atan2(lean * h, h) * 0.6
    with D.sub(loc=tuple(top), rot=(rad(-22), ang, 0)):
        D.lathe(D.catmull2d([(0.0, cap_h), (cap_r * 0.5, cap_h * 0.9), (cap_r * 0.9, cap_h * 0.5),
                             (cap_r, cap_h * 0.12), (cap_r * 0.96, 0.0)], 4, closed=False),
                cap_mat, seg=48, cap=False, name="cap",
                radial=lambda a, t: 1 + 0.05 * math.sin(5 * a + 1.3) * t)
        D.lathe([(cap_r * 0.95, 0.0), (cap_r * 0.25, -0.02), (0.0, -0.01)], gill_mat, seg=48,
                name="gills")
        if ring:
            D.torus(cap_r * 0.3, cap_r * 0.05, stem_mat, loc=(0, 0, -cap_h * 0.5), seg=24, rseg=6)
    return top


@prop("deco_blight_shroom", (144, 160))
def build_blight_shroom():
    """Cluster of giant sickly toadstools with glowing yellow-green gills and
    spots, spore motes drifting up."""
    cap1 = DM_capflesh("cap_tox", (0.3, 0.36, 0.05), spots=(0.85, 1.0, 0.35))
    cap2 = DM_capflesh("cap_purp", (0.3, 0.1, 0.28), spots=(0.85, 1.0, 0.35))
    stem = D.pbr("shroomstem2", (0.46, 0.46, 0.34), rough=0.6, sss=0.3, sss_radius=(1.0, 0.9, 0.6),
                 bump=0.3, bump_scale=40, pattern="stone", scale=6.0, crack=0.0,
                 dark=(0.22, 0.24, 0.12))
    gills = DM_gills("gills", 4.0)
    soil = D.pbr("rotsoil", (0.12, 0.1, 0.06), rough=0.9, bump=0.5, bump_scale=20, pattern="stone",
                 scale=3.0, moss=True, moss_color=(0.26, 0.34, 0.06), moss_z0=-0.2, moss_z1=0.4)
    rng = random.Random(6)
    D.rock((0.0, 0.1, 0.0), 0.62, soil, scale=(1.3, 0.8, 0.22), seed=3, strength=0.3)
    mushroom((0.05, 0.05, 0.08), 1.05, 0.46, cap1, stem, gills, lean=-0.08, ring=True)
    mushroom((-0.42, -0.05, 0.06), 0.62, 0.3, cap2, stem, gills, lean=-0.22)
    mushroom((0.46, -0.08, 0.06), 0.72, 0.32, cap1, stem, gills, lean=0.18)
    mushroom((0.22, -0.3, 0.04), 0.3, 0.15, cap2, stem, gills, lean=0.1)
    mushroom((-0.2, -0.32, 0.04), 0.22, 0.12, cap1, stem, gills, lean=-0.15)
    mote = D.M_glow("spore_mote", (0.8, 1.0, 0.4), 6.0)
    for k in range(14):
        D.sphere(rng.uniform(0.008, 0.018), mote, loc=(rng.uniform(-0.6, 0.6), -0.35,
                 rng.uniform(0.3, 1.5)), seg=8, rings=4, name="mote")
    D.point_light((0, -0.5, 0.8), (0.7, 1.0, 0.3), 24, 0.3)
    D.view(pitch=8, fill=0.95, glow=0.7)


@prop("deco_blight_stump", (144, 110))
def build_blight_stump():
    """Rotten hollow stump of a great tree: split bark, roots clawing the
    ground, shelf fungi and a glowing rot inside."""
    bark = DM_rotwood()
    inner = D.pbr("rotcore", (0.1, 0.08, 0.04), rough=0.9, emit=(0.6, 0.9, 0.2), emit_str=0.6,
                  bump=0.6, bump_scale=15)
    shelf = DM_capflesh("shelf", (0.55, 0.45, 0.2), spots=None)
    rng = random.Random(2)
    prof = [(0.0, 0.0), (0.62, 0.0), (0.5, 0.12), (0.44, 0.3), (0.42, 0.55), (0.44, 0.7)]
    st = D.lathe(prof, bark, seg=40, cap=False, name="stump",
                 radial=lambda a, t: 1 + 0.1 * math.sin(7 * a) + 0.05 * math.sin(13 * a + 1)
                 + 0.12 * max(0.0, math.sin(a * 3 + 2)) * t)
    D.solidify(st, 0.08)
    # jagged broken rim
    for k in range(9):
        a = TAU * k / 9 + rng.uniform(-0.1, 0.1)
        h = rng.uniform(0.1, 0.32)
        D.cone(0.1, h, bark, loc=(0.4 * math.cos(a), 0.4 * math.sin(a), 0.66), seg=5,
               scale=(1.0, 0.5, 1.0), rot=(0, 0, a + math.pi / 2), name="splinter")
    D.lathe([(0.0, 0.5), (0.38, 0.5), (0.36, 0.62), (0.0, 0.58)], inner, seg=32, name="rot")
    for k in range(7):
        a = TAU * k / 7 + 0.3
        d = Vector((math.cos(a), math.sin(a), 0))
        p0 = Vector((0, 0, 0.18)) + d * 0.4
        pts = D.bezier_pts(p0, p0 + d * 0.25 + Vector((0, 0, 0.02)), p0 + d * 0.45 + Vector((0, 0, -0.16)),
                           p0 + d * rng.uniform(0.6, 0.8) + Vector((0, 0, -0.18)), 12)
        D.sweep(pts, lambda t: 0.1 * (1 - 0.8 * t) + 0.01, bark, segs=10, name="root")
    for (a, z, r) in ((-1.8, 0.42, 0.2), (-1.2, 0.3, 0.15), (-2.4, 0.22, 0.13), (-0.6, 0.5, 0.12)):
        with D.sub(loc=(0.46 * math.cos(a), 0.46 * math.sin(a) * 0.9, z), rot=(0, 0, a)):
            D.lathe([(0.0, 0.03), (r, 0.0), (r * 0.9, -0.03), (0.0, -0.02)], shelf, seg=24,
                    a0=rad(-80), a1=rad(80), name="shelf")
    mote = D.M_glow("spore_mote", (0.8, 1.0, 0.4), 6.0)
    for k in range(8):
        D.sphere(rng.uniform(0.01, 0.02), mote, loc=(rng.uniform(-0.3, 0.3), -0.1,
                 rng.uniform(0.7, 1.0)), seg=8, rings=4, name="mote")
    D.point_light((0, -0.2, 0.9), (0.7, 1.0, 0.3), 16, 0.3)
    D.view(pitch=12, fill=0.95, glow=0.6)


@prop("deco_blight_totem", (96, 200))
def build_blight_totem():
    """Blight shaman's totem: a rotten pole crowned with an antlered beast
    skull, strung with bones and vines, fungus sprouting, eyes glowing green."""
    bark = DM_rotwood("totemwood")
    bone = D.M_bone("blightbone", (0.78, 0.74, 0.58))
    vine = D.pbr("vine", (0.2, 0.3, 0.08), rough=0.6, coat=0.2)
    eye = D.M_glow("totem_eye", (0.7, 1.0, 0.25), 9.0)
    cap = DM_capflesh("cap_rot", (0.42, 0.3, 0.12), spots=(0.85, 1.0, 0.45))
    gills = DM_gills()
    stem = D.pbr("shroomstem", (0.72, 0.68, 0.5), rough=0.6, sss=0.3)
    soil = D.pbr("rotsoil2", (0.12, 0.1, 0.06), rough=0.9, bump=0.5, bump_scale=20)
    D.rock((0, 0.05, 0.0), 0.35, soil, scale=(1.2, 0.9, 0.3), seed=2)
    D.lathe([(0.0, 0.0), (0.1, 0.0), (0.085, 1.4), (0.0, 1.42)], bark, seg=16, name="pole",
            radial=lambda a, t: 1 + 0.12 * math.sin(5 * a + t * 9))
    D.box((0.7, 0.08, 0.07), bark, loc=(0, 0.02, 1.08), rot=(0, rad(-6), 0), bev=0.02, name="crossbar")
    # beast skull: elongated cranium + snout, antlers
    with D.sub(loc=(0, -0.04, 1.5)):
        D.sphere(0.16, bone, scale=(1.0, 1.0, 0.9), seg=24, rings=12, name="cranium")
        D.lathe([(0.0, 0.0), (0.1, 0.0), (0.07, 0.24), (0.0, 0.26)], bone, seg=16,
                loc=(0, -0.06, -0.06), rot=(rad(160), 0, 0), sx=1.0, sy=0.7, name="snout")
        for sx in (-1, 1):
            D.sphere(0.045, D.M_black(), loc=(sx * 0.07, -0.13, 0.02), seg=12, rings=8)
            D.sphere(0.022, eye, loc=(sx * 0.07, -0.16, 0.02), seg=12, rings=8)
            p0 = Vector((sx * 0.1, 0.0, 0.1))
            ant = D.bezier_pts(p0, p0 + Vector((sx * 0.15, 0, 0.1)), p0 + Vector((sx * 0.25, 0, 0.3)),
                               p0 + Vector((sx * 0.22, 0, 0.5)), 16)
            D.sweep(ant, lambda t: 0.03 * (1 - 0.6 * t), bone, segs=8, name="antler")
            for (t, L, ang) in ((0.4, 0.14, 50), (0.7, 0.12, 30)):
                q = ant[int(t * (len(ant) - 1))]
                d = Vector((sx * math.cos(rad(ang)), 0, math.sin(rad(ang))))
                D.sweep([tuple(q), tuple(q + d * L)], lambda s: 0.018 * (1 - 0.6 * s), bone, segs=6,
                        name="tine")
    # hanging bones and vines
    for sx in (-1, 1):
        x = sx * 0.3
        D.sweep([(x, -0.02, 1.06), (x, -0.02, 0.86)], 0.004, vine, segs=4)
        D.sweep([(x - 0.05, -0.02, 0.86), (x + 0.05, -0.02, 0.8)], 0.02, bone, segs=6, name="bone")
        D.sphere(0.022, bone, loc=(x - 0.05, -0.02, 0.86), seg=10, rings=6)
        D.sphere(0.022, bone, loc=(x + 0.05, -0.02, 0.8), seg=10, rings=6)
    vpts = [(0.1 * math.cos(t * 9), -0.1 * abs(math.sin(t * 9)) - 0.02, 0.1 + 1.1 * t) for t in
            [i / 40 for i in range(41)]]
    D.sweep(vpts, 0.014, vine, segs=6, name="vine")
    mushroom((0.08, -0.08, 0.5), 0.12, 0.1, cap, stem, gills, lean=0.8)
    mushroom((-0.09, -0.06, 0.8), 0.1, 0.08, cap, stem, gills, lean=-0.9)
    mushroom((0.15, -0.1, 0.05), 0.18, 0.1, cap, stem, gills, lean=0.1)
    D.point_light((0, -0.5, 1.5), (0.7, 1.0, 0.3), 12, 0.2)
    D.view(pitch=6, fill=0.95, glow=0.6)


@prop("prop_spore_pod", (96, 96))
def build_prop_spore_pod():
    """Spore pod: bulbous fleshy fungus sac, translucent skin with glowing
    yellow-green veins and pores, a stubby stalk and root tendrils."""
    if "podskin" not in D.G.mats:
        skin = D.pbr("podskin", (0.22, 0.26, 0.06), rough=0.35, sss=0.35, sss_radius=(0.6, 1.0, 0.2),
                     coat=0.6, coat_rough=0.1, pattern="veins", vein_color=(0.62, 1.0, 0.18),
                     density=3.0, width=0.03, strength=1.4)
    skin = D.G.mats["podskin"]
    pore = D.M_glow("podpore", (0.75, 1.0, 0.25), 4.0)
    stalk = D.pbr("podstalk", (0.35, 0.3, 0.15), rough=0.6, sss=0.3, bump=0.4, bump_scale=40)
    rng = random.Random(4)
    pod = D.sphere(0.46, skin, loc=(0, 0, 0.5), scale=(1.0, 0.95, 0.92), seg=48, rings=24, name="pod")
    D.displace(pod, 0.06, 0.35)
    for k in range(5):
        a = TAU * k / 5 + 0.2
        D.sphere(0.2, skin, loc=(0.34 * math.cos(a), 0.34 * math.sin(a) * 0.8, 0.4 + 0.1 * math.sin(a * 2)),
                 scale=(1.0, 1.0, 1.2), seg=24, rings=12, name="lobe")
    for k in range(12):
        a = rng.uniform(-2.6, -0.5)
        z = rng.uniform(0.25, 0.85)
        r = 0.46 * math.sqrt(max(0.0, 1 - ((z - 0.5) / 0.46) ** 2)) + 0.01
        D.sphere(rng.uniform(0.02, 0.04), pore, loc=(r * math.cos(a), r * math.sin(a), z),
                 scale=(1.0, 0.5, 1.0), seg=10, rings=6, name="pore")
    D.lathe([(0.0, 0.9), (0.09, 0.88), (0.06, 1.0), (0.07, 1.06), (0.0, 1.08)], stalk, seg=16,
            name="stalk")
    for k in range(5):
        a = TAU * k / 5 + 0.5
        d = Vector((math.cos(a), math.sin(a), 0))
        p0 = Vector((0, 0, 0.12)) + d * 0.15
        D.sweep(D.bezier_pts(p0, p0 + d * 0.1 + Vector((0, 0, -0.08)), p0 + d * 0.22,
                             p0 + d * 0.3 + Vector((0, 0, -0.1)), 10), lambda t: 0.03 * (1 - 0.8 * t),
                stalk, segs=6, name="tendril")
    mote = D.M_glow("spore_mote", (0.8, 1.0, 0.4), 6.0)
    for k in range(6):
        D.sphere(rng.uniform(0.012, 0.022), mote, loc=(rng.uniform(-0.55, 0.55), -0.4,
                 rng.uniform(0.2, 1.0)), seg=8, rings=4, name="mote")
    D.point_light((0, -0.7, 0.5), (0.7, 1.0, 0.3), 6, 0.3)
    D.view(pitch=6, fill=0.92, glow=0.5)


# ---- void ----------------------------------------------------------------------------
def DM_voidrock(name="voidrock"):
    if name in D.G.mats:
        return D.G.mats[name]
    m = D.pbr(name, (0.03, 0.028, 0.045), rough=0.55, coat=0.3, bump=0.4, bump_scale=12)
    add_starfield(m, density=18.0, size=0.12, strength=6.0)
    return m


def DM_voidprism(name="voidprism"):
    if name in D.G.mats:
        return D.G.mats[name]
    m = D.pbr(name, (0.12, 0.1, 0.2), rough=0.22, trans=0.3, ior=1.5, spec=0.35, coat=0.6,
              coat_rough=0.3, emit=(0.6, 0.5, 1.0), emit_str=0.45)
    thin_film(m, 400.0, 1.4, vary=(250.0, 600.0), scale=1.5)
    nt = m.node_tree
    I = _bsdf(m).inputs
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Object"], sep.inputs[0])
    ph = _m(nt, "FRACT", _m(nt, "ADD", _m(nt, "MULTIPLY", sep.outputs["Z"], 1.2),
                            _m(nt, "MULTIPLY", sep.outputs["X"], 0.8)))
    nt.links.new(_ramp(nt, ph, RIFT_STOPS), I["Emission Color"])
    return m


@prop("deco_void_prism", (96, 160))
def build_void_prism():
    """Iridescent prism crystal hovering over a shattered void rock, shards
    orbiting on a ring of light."""
    rockm = DM_voidrock()
    prism = DM_voidprism()
    ring = DM_riftglow("void_ring", 1.3)
    rng = random.Random(3)
    D.rock((0, 0.02, 0.1), 0.4, rockm, scale=(1.1, 0.8, 0.4), seed=1)
    D.rock((-0.32, -0.08, 0.05), 0.16, rockm, scale=(1.0, 0.9, 0.7), seed=2)
    D.rock((0.34, -0.02, 0.05), 0.14, rockm, scale=(1.1, 0.9, 0.7), seed=3)
    C = 1.02
    D.lathe([(0.0, -0.52), (0.2, -0.05), (0.2, 0.18), (0.0, 0.62)], prism, seg=6, smooth=False,
            loc=(0, 0, C), rot=(0, rad(8), rad(0)), name="prism")
    D.torus(0.36, 0.008, ring, loc=(0, 0, C - 0.05), rot=(rad(76), rad(-10), 0), seg=72, rseg=6,
            name="orbit")
    for k in range(5):
        a = TAU * k / 5 + 0.4
        p = (0.36 * math.cos(a), 0.36 * math.sin(a) * 0.25, C - 0.05 + 0.09 * math.sin(a))
        D.octa(rng.uniform(0.03, 0.05), rng.uniform(0.06, 0.1), prism, p,
               rot=(rng.uniform(0, 1), rng.uniform(0, 1), rng.uniform(0, 1)))
    for (p, s_) in (((0.2, -0.4, 1.5), 0.06), ((-0.25, -0.4, 0.8), 0.04)):
        D.sparkle(p, s_, (0.9, 0.9, 1.0))
    D.point_light((0, -0.5, C - 0.5), (0.7, 0.6, 1.0), 10, 0.3)
    D.view(pitch=7, fill=0.95, glow=0.6, front=0.0)


@prop("deco_void_monolith", (96, 240))
def build_void_monolith():
    """Black monolith of the void: a slab of star-flecked obsidian split by a
    glowing white-iridescent crack, rubble at its foot."""
    if "monolith" not in D.G.mats:
        m = D.pbr("monolith", (0.02, 0.018, 0.03), rough=0.18, coat=0.6, coat_rough=0.05)
        add_starfield(m, density=22.0, size=0.1, strength=5.0)
        add_rift(m, along="Z", across="X", center=0.02, amp=0.12, freq=1.6, width=0.02, halo=0.07,
                 strength=10.0, halo_str=1.0, span=(0.1, 2.3), depth=("Y", -0.1), branches=3.0,
                 base_scorch=(0.05, 0.02, 0.08))
    mono = D.G.mats["monolith"]
    rockm = DM_voidrock()
    H = 2.3
    pts = [(-0.3, 0.0), (0.3, 0.0), (0.27, H * 0.7), (0.2, H * 0.92), (0.05, H), (-0.12, H * 0.95),
           (-0.26, H * 0.75)]
    D.extrude(pts, 0.24, mono, loc=(0, 0, 0.1), bev=0.03, name="monolith")
    rng = random.Random(8)
    for k in range(7):
        x = rng.uniform(-0.45, 0.45)
        D.rock((x, rng.uniform(-0.2, 0.1), 0.05), rng.uniform(0.07, 0.14), rockm,
               scale=(1.3, 1.0, 0.7), seed=k + 1)
    ring = DM_riftglow("void_ring", 1.3)
    D.torus(0.42, 0.006, ring, loc=(0, 0, 1.5), rot=(rad(80), rad(8), 0), seg=72, rseg=6,
            name="orbit")
    for k in range(4):
        D.octa(rng.uniform(0.025, 0.04), rng.uniform(0.05, 0.08), DM_voidprism(),
               (rng.uniform(-0.4, 0.4), -0.2, rng.uniform(1.2, 2.2)),
               rot=(rng.uniform(0, 1), rng.uniform(0, 1), 0))
    D.view(pitch=5, fill=0.95, glow=0.7)


@prop("deco_void_fragment", (144, 120))
def build_void_fragment():
    """A torn-away fragment of some world floating over the void: a chunk of
    earth and flagstones with a broken pillar stump, its underside trailing
    rock and roots; debris and star dust below."""
    rockm = DM_voidrock()
    earth = D.pbr("fragearth", (0.24, 0.18, 0.13), rough=0.85, pattern="stone", scale=4.0,
                  crack=0.012, dark=(0.08, 0.06, 0.05))
    flag = D.M_stone("flagstone", (0.45, 0.43, 0.4), scale=3.0)
    marble = D.M_marble("fragmarble", (0.8, 0.78, 0.74), scale=1.5)
    root = D.pbr("fragroot", (0.18, 0.12, 0.08), rough=0.8)
    edge = DM_riftglow("frag_edge", 1.6)
    rng = random.Random(5)
    C = 0.72
    # inverted cone of rock/earth
    chunk = D.lathe(D.catmull2d([(0.0, -0.55), (0.18, -0.4), (0.4, -0.2), (0.62, -0.05), (0.66, 0.0),
                                 (0.0, 0.0)], 3, closed=False), earth, seg=10, smooth=False,
                    loc=(0, 0, C), sy=0.55, name="chunk",
                    radial=lambda a, t: 1 + 0.18 * math.sin(3 * a + 1) * (1 - t))
    D.displace(chunk, 0.08, 0.3)
    D.lathe([(0.0, 0.0), (0.64, 0.0), (0.64, 0.04), (0.0, 0.04)], flag, seg=10, smooth=False,
            loc=(0, 0, C), sy=0.55, name="flags")
    # glowing torn rim
    rim = [(0.65 * math.cos(TAU * i / 60) * (1 + 0.05 * math.sin(i * 1.7)), 0.36 * math.sin(TAU * i / 60),
            C + 0.005) for i in range(61)]
    D.sweep(rim, 0.012, edge, segs=6, caps=False, name="rim")
    # broken pillar stump
    D.lathe([(0.0, 0.0), (0.16, 0.0), (0.14, 0.06), (0.12, 0.08), (0.12, 0.42), (0.0, 0.42)], marble,
            seg=24, loc=(-0.2, 0.05, C + 0.04), name="stump",
            radial=lambda a, t: 1 - 0.06 * max(0.0, math.cos(12 * a)) ** 4)
    for k in range(5):
        D.cone(0.05, rng.uniform(0.04, 0.12), marble, loc=(-0.2 + 0.08 * math.cos(k * 1.3), 0.05,
               C + 0.46), seg=5, name="break")
    D.box((0.3, 0.14, 0.1), marble, loc=(0.28, -0.05, C + 0.09), rot=(0, rad(12), rad(20)), bev=0.02)
    # hanging roots
    for k in range(6):
        x = rng.uniform(-0.4, 0.4)
        pts = [(x, 0.0, C - 0.1), (x + rng.uniform(-0.08, 0.08), -0.02, C - 0.3),
               (x + rng.uniform(-0.1, 0.1), -0.04, C - rng.uniform(0.45, 0.6))]
        D.sweep(D.catmull(pts, 6), lambda t: 0.018 * (1 - 0.8 * t), root, segs=6, name="root")
    # debris below
    for k in range(9):
        D.rock((rng.uniform(-0.6, 0.6), rng.uniform(-0.2, 0.1), rng.uniform(0.02, 0.1)),
               rng.uniform(0.04, 0.09), rockm, scale=(1.2, 1.0, 0.8), seed=k + 3)
    for k in range(5):
        D.rock((rng.uniform(-0.5, 0.5), -0.1, rng.uniform(0.22, 0.45)), rng.uniform(0.02, 0.04),
               rockm, seed=k + 20)
    for (p, s_) in (((0.45, -0.4, 1.1), 0.05), ((-0.5, -0.4, 0.4), 0.04)):
        D.sparkle(p, s_, (0.9, 0.9, 1.0))
    D.point_light((0, -0.6, C + 0.2), (0.7, 0.6, 1.0), 16, 0.3)
    D.view(pitch=10, fill=0.95, glow=0.6)


# ==== END OF BUILDERS ====


# =============================================================================
#  Driver
# =============================================================================
AURA_STOPS = [(0.0, (80, 235, 255)), (0.33, (150, 120, 255)), (0.66, (255, 110, 215)),
              (1.0, (255, 215, 140))]   # sRGB rift spectrum for the tier-7 aura


def rift_aura(path, strength=0.55, radius=4.0, grow=5):
    """Tier-7 signature: a soft iridescent halo hugging the icon silhouette
    (cyan lower-left -> violet -> magenta -> gold upper-right), composited
    under the icon and faded before the frame border.  Keeps tier-7 gear
    readable as 'legendary' down to 32 px slots."""
    import numpy as np
    from PIL import ImageFilter
    im = np.asarray(Image.open(path).convert("RGBA")).astype(np.float32) / 255.0
    H, W = im.shape[:2]
    a = im[..., 3]
    m = Image.fromarray(((a > 0.25) * 255).astype(np.uint8), "L")
    m = m.filter(ImageFilter.MaxFilter(grow)).filter(ImageFilter.GaussianBlur(radius))
    m = np.asarray(m).astype(np.float32) / 255.0
    yy, xx = np.mgrid[0:H, 0:W]
    t = np.clip(xx / (W - 1) * 0.6 + (1 - yy / (H - 1)) * 0.4, 0, 1)
    col = np.zeros((H, W, 3), np.float32)
    for (p0, c0), (p1, c1) in zip(AURA_STOPS[:-1], AURA_STOPS[1:]):
        sel = (t >= p0) & (t <= p1)
        f = ((t - p0) / (p1 - p0))[..., None]
        col[sel] = (np.array(c0) * (1 - f) + np.array(c1) * f)[sel] / 255.0
    idx = np.arange(W, dtype=np.float32)
    edge = np.minimum(idx, W - 1 - idx) / (W / 14.0)
    fade = np.clip(np.minimum(edge[:, None], edge[None, :]), 0, 1) ** 1.5
    aa = np.clip(m * strength * fade, 0, 1)
    A = a + aa * (1 - a)
    C = (im[..., :3] * a[..., None] + col * aa[..., None] * (1 - a[..., None])) / \
        np.maximum(A[..., None], 1e-4)
    out = np.concatenate([np.clip(C, 0, 1), A[..., None]], axis=2)
    out[out[..., 3] < 1.5 / 255] = 0
    Image.fromarray((out * 255 + 0.5).astype(np.uint8), "RGBA").save(path, optimize=True)


def render(pid, args, tmpdir):
    spec = P2[pid]
    t0 = time.time()
    if spec["kind"] == "equip":
        a = SimpleNamespace(samples=args.samples, res=256, size=128, out=args.out_icons,
                            outline=0.55, no_glow=False, blend=False)
        out = E.render_item(pid, a, tmpdir)
        rift_aura(out)
    else:
        a = SimpleNamespace(samples=args.samples, ss=2, out_icons=args.out_icons,
                            out_props=args.out_props)
        out = D.build_one(D.REGISTRY[pid], a, tmpdir)
    if spec["kind"] == "equip":
        print("  %-26s %5.1fs -> %s" % (pid, time.time() - t0, out), flush=True)
    return out


def _font(size=12):
    for f in ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",):
        if os.path.exists(f):
            return ImageFont.truetype(f, size)
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def contact_icons(ids, path, icon_dir):
    """Icons at 128 + 48 px.  Tier-7 gear rows show the tier-6 icon first."""
    font = _font(11)
    rows = []
    gear = [i for i in ids if P2[i]["kind"] == "equip"]
    other = [i for i in ids if P2[i]["kind"] == "icon"]
    for i in gear:
        rows.append([i.replace("_7", "_6"), i])
    cols = 6
    pairs = [gear[k:k + 3] for k in range(0, len(gear), 3)]
    lines = []
    for p in pairs:
        line = []
        for i in p:
            line += [i.replace("_7", "_6"), i]
        lines.append(line)
    for k in range(0, len(other), cols):
        lines.append(other[k:k + cols])
    cw, ch, small = 128 + 48 + 16, 128 + 20, 48
    W = cols * cw + 16
    H = len(lines) * ch + 16
    sheet = Image.new("RGBA", (W, H), (14, 11, 16, 255))
    d = ImageDraw.Draw(sheet)
    for r, line in enumerate(lines):
        for c, iid in enumerate(line):
            x, y = 8 + c * cw, 8 + r * ch
            ref = iid not in P2
            f = os.path.join(ICON_DIR if ref else icon_dir, iid + ".png")
            d.rectangle([x, y, x + 127, y + 127], fill=(26, 22, 30, 255) if not ref else (20, 18, 22, 255),
                        outline=(60, 50, 64, 255))
            if os.path.exists(f):
                im = Image.open(f).convert("RGBA")
                sheet.alpha_composite(im, (x, y))
                sm = im.resize((small, small), Image.LANCZOS)
                d.rectangle([x + 132, y, x + 132 + small - 1, y + small - 1], fill=(40, 34, 44, 255))
                sheet.alpha_composite(sm, (x + 132, y))
                sm2 = im.resize((32, 32), Image.LANCZOS)
                d.rectangle([x + 132, y + 54, x + 132 + 31, y + 54 + 31], fill=(8, 4, 10, 255))
                sheet.alpha_composite(sm2, (x + 132, y + 54))
            d.text((x + 2, y + 130), iid + ("  (ref)" if ref else ""),
                   fill=(150, 140, 130, 255) if ref else (230, 215, 195, 255), font=font)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    sheet.convert("RGB").save(path)
    return path


def contact_props(ids, path, prop_dir, bg=(22, 18, 24)):
    font = _font(11)
    files = [(i, os.path.join(prop_dir, i + ".png")) for i in ids if P2[i]["kind"] == "prop"]
    files = [(i, f) for i, f in files if os.path.exists(f)]
    if not files:
        return None
    pad = 14
    rows, row, rw = [], [], 0
    for i, f in files:
        im = Image.open(f).convert("RGBA")
        w = max(im.width, int(font.getlength(i.replace("deco_", ""))) + 4)
        if rw + w + pad > 1300 and row:
            rows.append(row)
            row, rw = [], 0
        row.append((i, im, w))
        rw += w + pad
    if row:
        rows.append(row)
    H = sum(max(im.height for _, im, _ in r) + 34 for r in rows) + pad
    Wd = max(sum(w + pad for _, _, w in r) for r in rows) + pad
    sheet = Image.new("RGBA", (Wd, H), (*bg, 255))
    d = ImageDraw.Draw(sheet)
    y = pad
    for r in rows:
        x = pad
        rh = max(im.height for _, im, _ in r)
        for i, im, w in r:
            ox = x + (w - im.width) // 2
            oy = y if P2[i]["anchor"] == "top" else y + rh - im.height
            d.rectangle([ox, oy, ox + im.width - 1, oy + im.height - 1],
                        fill=tuple(min(255, c + 18) for c in bg) + (255,))
            sheet.alpha_composite(im, (ox, oy))
            d.text((x, y + rh + 5), i.replace("deco_", ""), fill=(230, 215, 195, 255), font=font)
            x += w + pad
        y += rh + 34
    os.makedirs(os.path.dirname(path), exist_ok=True)
    sheet.convert("RGB").save(path)
    return path


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--only", default="", help="comma list of ids / globs")
    ap.add_argument("--samples", type=int, default=56)
    ap.add_argument("--out-icons", default=ICON_DIR)
    ap.add_argument("--out-props", default=PROP_DIR)
    ap.add_argument("--contact-dir", default=CONTACT_DIR)
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--contact-only", action="store_true")
    ap.add_argument("--keep-tmp", action="store_true")
    args = ap.parse_args(argv)

    ids = list(P2)
    if args.only:
        pats = [p.strip() for p in args.only.split(",") if p.strip()]
        ids = [i for i in ids if any(fnmatch.fnmatch(i, p) for p in pats)]
    if args.list:
        for i in ids:
            s = P2[i]
            print("%-26s %-5s %dx%d %s" % (i, s["kind"], s["size"][0], s["size"][1], s["anchor"]))
        return 0
    failed = []
    if not args.contact_only:
        tmpdir = tempfile.mkdtemp(prefix="bn_p2_")
        t0 = time.time()
        print("Rendering %d objects (samples=%d)" % (len(ids), args.samples), flush=True)
        for i in ids:
            try:
                render(i, args, tmpdir)
            except Exception as e:  # keep going; report at the end
                import traceback
                traceback.print_exc()
                failed.append((i, str(e)))
        print("Total %.1fs" % (time.time() - t0))
        if not args.keep_tmp:
            shutil.rmtree(tmpdir, ignore_errors=True)
        else:
            print("tmp:", tmpdir)
    all_ids = list(P2)
    p1 = contact_icons(all_ids, os.path.join(args.contact_dir, "contact_p2_icons.png"),
                       args.out_icons)
    p2 = contact_props(all_ids, os.path.join(args.contact_dir, "contact_p2_props.png"),
                       args.out_props)
    p3 = contact_props(all_ids, os.path.join(args.contact_dir, "contact_p2_props_light.png"),
                       args.out_props, bg=(120, 116, 124))
    print("contact sheets:", p1, p2, p3)
    if failed:
        print("FAILED:", failed)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
