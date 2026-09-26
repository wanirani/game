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
             halo=0.07, strength=14.0, halo_str=1.4, seed=0.0, col_freq=0.9, span=None,
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
    nt.links.new(_m(nt, "MULTIPLY", _m(nt, "POWER", seam, 4.0), 0.4), hot.inputs["Factor"])
    nt.links.new(col, hot.inputs[6])
    hot.inputs[7].default_value = (1.0, 0.97, 0.92, 1)
    em = _m(nt, "ADD", _m(nt, "MULTIPLY", seam, strength), _m(nt, "MULTIPLY", glow_sq, halo_str))
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
def EM_void(name="voidmetal", color=(0.028, 0.025, 0.048), rough=0.3, film=(230.0, 390.0),
            rift=None, stars=0.0, glow_str=0.75, metal=1.0, film_ior=1.3):
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
        m["glow_norm"] = 1.0 / max(rift.get("strength", 14.0) if rift else 6.0, 1.0)
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


def blade_piece(L, fn, t0, t1, mat, edge_mat=None, cross="hex", n=24, jag0=0.0, jag1=0.0,
                seed=1, point=False, name="blade_piece", loc=(0, 0, 0), rot=(0, 0, 0)):
    """Section t0..t1 of a lofted blade (E.blade conventions: fn(t) ->
    (halfwidth, centre_x, halfthick, fuller)).  Both ends are capped; jag0 /
    jag1 give the cut ends a broken, jagged profile.  point=True closes the
    top into the blade tip instead."""
    X = [(u, v) for (u, v) in E.BLADE_X[cross] if not isinstance(v, str)]
    k = len(X)
    rng = random.Random(seed)
    jr0 = [rng.uniform(-1, 1) for _ in range(k)]
    jr1 = [rng.uniform(-1, 1) for _ in range(k)]
    verts, faces, fm = [], [], []
    edge_idx = [j for j, (u, v) in enumerate(X) if abs(u) == 1]
    for i in range(n + 1):
        s_ = i / n
        t = t0 + (t1 - t0) * s_
        w, cx, th, _fd = fn(min(t, 0.999))
        z = t * L
        for j, (u, v) in enumerate(X):
            dz = 0.0
            if i == 0:
                dz = jag0 * jr0[j]
            elif i == n and not point:
                dz = jag1 * jr1[j]
            verts.append((cx + u * w, v * th, z + dz))
    for i in range(n):
        for j in range(k):
            j2 = (j + 1) % k
            faces.append((i * k + j, i * k + j2, (i + 1) * k + j2, (i + 1) * k + j))
            fm.append(1 if (j in edge_idx or j2 in edge_idx) and edge_mat else 0)
    faces.append(tuple(range(k))[::-1])
    fm.append(0)
    last = n * k
    if point:
        w, cx, th, _fd = fn(1.0)
        tip = len(verts)
        verts.append((cx, 0.0, L * t1 + 0.0))
        for j in range(k):
            j2 = (j + 1) % k
            faces.append((last + j, last + j2, tip))
            fm.append(1 if (j in edge_idx or j2 in edge_idx) and edge_mat else 0)
    else:
        faces.append(tuple(last + j for j in range(k)))
        fm.append(0)
    mats = [mat, edge_mat] if edge_mat else [mat]
    ob = E.make_mesh(name, verts, faces, mats=mats, face_mats=fm, smooth=False, loc=loc, rot=rot)
    me = ob.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    me.shade_flat()
    return ob


def rift_tear(loc, rx, rz, rot=(0, 0, 0), strength=9.0, name="rift_tear"):
    """Glowing lens-shaped tear in space (flattened ellipsoid of rift light)."""
    return E.sphere(1.0, EM_riftglow("riftglow", strength), loc=loc, rot=rot,
                    scale=(rx, rx * 0.35, rz), seg=24, rings=12, name=name)


# =============================================================================
#  TIER-7 EQUIPMENT ICONS
# =============================================================================
@equip("sword_7")
def sword_7():
    """Rift blade: void-metal blade split by an iridescent crack whose upper
    third has broken away and floats above a tear of rift light; pale
    star-gold crescent guard with a star gem."""
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


# ==== END OF BUILDERS ====


# =============================================================================
#  Driver
# =============================================================================
def render(pid, args, tmpdir):
    spec = P2[pid]
    t0 = time.time()
    if spec["kind"] == "equip":
        a = SimpleNamespace(samples=args.samples, res=256, size=128, out=args.out_icons,
                            outline=0.55, no_glow=False, blend=False)
        out = E.render_item(pid, a, tmpdir)
    else:
        a = SimpleNamespace(samples=args.samples, ss=2, out_icons=args.out_icons,
                            out_props=args.out_props)
        out = D.build_one(D.REGISTRY[pid], a, tmpdir)
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
            ref = iid.endswith("_6")
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
