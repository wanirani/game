#!/usr/bin/env python3
"""
BLOOD NOCTURNE -- equipment icon builder (Blender / bpy).

Procedurally models every equipment item (weapons, armour, accessories) from
primitives, lathes, lofted blades, swept tubes and extruded outlines, assigns
PBR materials, lights the object with a 3-point studio rig and renders it with
Cycles into a square transparent PNG icon.

Usage (bpy is importable as a python module):
    python3 tools/blender/build_icons_equipment.py                 # all icons
    python3 tools/blender/build_icons_equipment.py --only whip_1,whip_2 --samples 32
    python3 tools/blender/build_icons_equipment.py --only 'sword_*'
    python3 tools/blender/build_icons_equipment.py --list

Output: assets/icons/<id>.png (128x128 RGBA, rendered at 256 and LANCZOS
downsampled). A contact sheet of the rendered ids is written as well.

Conventions used by the builders
    * The item is modelled "front facing": the camera looks along +Y, so the
      picture plane is XZ (x = right, z = up).  2D outlines are given as (x, z).
    * Long weapons are modelled pointing up (+Z) and the view() call turns
      them diagonally (bottom-left -> top-right) like RPG inventory icons.
    * After building, the whole item is normalised to a 2-unit box so the
      light rig works identically for every item.
"""

import argparse
import fnmatch
import math
import os
import random
import sys
import tempfile
import time

import bpy  # noqa: E402  (bpy must be imported before bmesh)
import bmesh
import numpy as np
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
GAME_ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
DEFAULT_OUT = os.path.join(GAME_ROOT, "assets", "icons")

TAU = math.tau
rad = math.radians


# =============================================================================
#  Global build state
# =============================================================================
class _State:
    root = None          # empty that parents every part of the current item
    coll = None          # scene collection
    view = None          # presentation parameters for the current item
    mats = {}            # material cache (per scene)
    rng = random.Random(1)
    shared = {}          # shared mesh datablocks (chain links, spikes ...)
    parent = None        # current parent for new parts (see group())


G = _State()


def default_view():
    return dict(diag=0.0, yaw=0.0, pitch=0.0, roll=0.0, fill=0.86, glow=1.0,
                key=1.0, rim=1.0, fill_light=1.0, exposure=0.0)


def view(**kw):
    """Set presentation for the current item.

    diag  : rotation (deg) in the picture plane; 45 = tip to top-right
    yaw   : rotation (deg) around the item's own long axis (shows thickness)
    pitch : tilt (deg) of the item's top toward the camera
    roll  : extra rotation around the camera axis applied first (deg)
    fill  : fraction of the frame the item's larger dimension fills
    glow  : multiplier for the post-process emissive glow
    """
    G.view.update(kw)


# =============================================================================
#  Scene / render setup
# =============================================================================
def new_scene(args):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    G.coll = sc.collection
    G.mats = {}
    G.shared = {}
    G.view = default_view()
    G.rng = random.Random(7)
    G.parent = None

    sc.render.engine = "CYCLES"
    cy = sc.cycles
    cy.device = "CPU"
    cy.samples = args.samples
    cy.use_adaptive_sampling = True
    cy.adaptive_threshold = 0.02
    cy.max_bounces = 8
    cy.diffuse_bounces = 3
    cy.glossy_bounces = 4
    cy.transmission_bounces = 8
    cy.transparent_max_bounces = 8
    cy.caustics_reflective = False
    cy.caustics_refractive = False
    cy.blur_glossy = 1.0
    cy.sample_clamp_indirect = 8.0
    try:
        cy.use_denoising = True
        cy.denoiser = "OPENIMAGEDENOISE"
    except Exception:  # pragma: no cover - denoiser not compiled in
        cy.use_denoising = False
    sc.render.film_transparent = True
    sc.render.resolution_x = args.res
    sc.render.resolution_y = args.res
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.render.image_settings.color_depth = "8"
    try:
        sc.view_settings.view_transform = "AgX"
        sc.view_settings.look = "AgX - Punchy"
    except Exception:
        try:
            sc.view_settings.view_transform = "Standard"
        except Exception:
            pass
    sc.render.threads_mode = "AUTO"

    root = bpy.data.objects.new("ITEM", None)
    G.coll.objects.link(root)
    G.root = root
    return sc


def _look_at(ob, target=(0, 0, 0)):
    d = Vector(target) - ob.location
    ob.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()


def add_area(name, loc, color, power, size, target=(0, 0, 0), spread=None):
    ld = bpy.data.lights.new(name, "AREA")
    ld.color = color
    ld.energy = power
    ld.size = size
    if spread is not None:
        ld.spread = spread
    ob = bpy.data.objects.new(name, ld)
    G.coll.objects.link(ob)
    ob.location = loc
    _look_at(ob, target)
    return ob


def setup_world(sc, gloss=1.0):
    """Dim gradient environment for diffuse light plus a brighter studio
    gradient that only glossy rays see (metals keep definition even where
    they face the camera)."""
    w = bpy.data.worlds.new("World")
    sc.world = w
    nt = w.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputWorld")
    bg = nt.nodes.new("ShaderNodeBackground")
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Generated"], sep.inputs[0])
    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.inputs["From Min"].default_value = -1.0
    mr.inputs["From Max"].default_value = 1.0
    nt.links.new(sep.outputs["Z"], mr.inputs["Value"])
    # diffuse environment
    dim = _ramp(nt, (0, 0), [(0.0, (0.010, 0.008, 0.012)), (0.45, (0.015, 0.012, 0.015)),
                             (0.53, (0.09, 0.085, 0.09)), (1.0, (0.05, 0.055, 0.07))])
    nt.links.new(mr.outputs["Result"], dim.inputs["Fac"])
    # glossy-only studio environment: dark floor, bright horizon band,
    # brighter toward the camera side and the key (left) side
    gl = _ramp(nt, (0, -300), [(0.0, (0.006, 0.006, 0.007)), (0.2, (0.03, 0.028, 0.03)),
                               (0.3, (0.07, 0.066, 0.064)),
                               (0.42, (0.2, 0.19, 0.18)), (0.54, (0.26, 0.25, 0.24)),
                               (0.7, (0.11, 0.11, 0.12)), (1.0, (0.05, 0.055, 0.07))])
    nt.links.new(mr.outputs["Result"], gl.inputs["Fac"])
    fy = nt.nodes.new("ShaderNodeMapRange")
    fy.inputs["From Min"].default_value = 1.0
    fy.inputs["From Max"].default_value = -1.0
    fy.inputs["To Min"].default_value = 0.35
    fy.inputs["To Max"].default_value = 1.1 * gloss
    nt.links.new(sep.outputs["Y"], fy.inputs["Value"])
    fx = nt.nodes.new("ShaderNodeMapRange")
    fx.inputs["From Min"].default_value = 1.0
    fx.inputs["From Max"].default_value = -1.0
    fx.inputs["To Min"].default_value = 0.6
    fx.inputs["To Max"].default_value = 1.3
    nt.links.new(sep.outputs["X"], fx.inputs["Value"])
    m1 = nt.nodes.new("ShaderNodeMix")
    m1.data_type = "RGBA"
    m1.blend_type = "MULTIPLY"
    m1.inputs["Factor"].default_value = 1.0
    nt.links.new(gl.outputs["Color"], m1.inputs[6])
    comb = nt.nodes.new("ShaderNodeMath")
    comb.operation = "MULTIPLY"
    nt.links.new(fy.outputs["Result"], comb.inputs[0])
    nt.links.new(fx.outputs["Result"], comb.inputs[1])
    nt.links.new(comb.outputs[0], m1.inputs[7])
    lp = nt.nodes.new("ShaderNodeLightPath")
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    nt.links.new(lp.outputs["Is Glossy Ray"], mix.inputs["Factor"])
    nt.links.new(dim.outputs["Color"], mix.inputs[6])
    nt.links.new(m1.outputs[2], mix.inputs[7])
    nt.links.new(mix.outputs[2], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = 1.0
    nt.links.new(bg.outputs[0], out.inputs["Surface"])


def setup_lights_camera(sc):
    v = G.view
    k, r, f = v["key"], v["rim"], v["fill_light"]
    # warm key, upper-left-front
    add_area("Key", (-1.2, -3.0, 2.8), (1.0, 0.80, 0.60), 260 * k, 0.8)
    # cool rim, behind upper-right (bright edge highlights)
    add_area("Rim", (3.8, 4.2, 3.2), (0.55, 0.72, 1.0), 1300 * r, 2.2)
    # violet kicker, behind lower-left
    add_area("Kick", (-4.2, 3.8, -1.8), (0.75, 0.55, 1.0), 550 * r, 2.0)
    # soft cool fill, front right low
    add_area("Fill", (4.6, -5.2, -1.2), (0.72, 0.80, 1.0), 160 * f, 3.5)
    # broad top softbox -> long reflections on metal
    add_area("Top", (1.5, -1.0, 6.0), (1.0, 0.97, 0.94), 90, 3.0)

    cam_d = bpy.data.cameras.new("Cam")
    cam_d.type = "ORTHO"
    cam_d.ortho_scale = 2.0 / v["fill"]
    cam_d.clip_start = 0.1
    cam_d.clip_end = 100
    cam = bpy.data.objects.new("Cam", cam_d)
    G.coll.objects.link(cam)
    cam.location = (0, -30, 0)
    cam.rotation_euler = (rad(90), 0, 0)
    sc.camera = cam
    if v["exposure"]:
        sc.view_settings.exposure = v["exposure"]


def _all_world_verts():
    dg = bpy.context.evaluated_depsgraph_get()
    pts = []
    for ob in G.coll.objects:
        if ob.type not in {"MESH", "CURVE", "FONT", "SURFACE"} or ob.hide_render:
            continue
        ev = ob.evaluated_get(dg)
        try:
            me = ev.to_mesh()
        except RuntimeError:
            continue
        if me is None or len(me.vertices) == 0:
            ev.to_mesh_clear()
            continue
        n = len(me.vertices)
        co = np.empty(n * 3, dtype=np.float64)
        me.vertices.foreach_get("co", co)
        co = co.reshape(n, 3)
        mw = np.array(ob.matrix_world)
        co = co @ mw[:3, :3].T + mw[:3, 3]
        pts.append(co)
        ev.to_mesh_clear()
    if not pts:
        return np.zeros((1, 3))
    return np.concatenate(pts, axis=0)


def frame_item():
    """Apply the presentation rotation and normalise the item into a 2-unit
    box centred on the origin (camera looks along +Y)."""
    v = G.view
    R = (Matrix.Rotation(rad(v["diag"]), 4, "Y")
         @ Matrix.Rotation(rad(v["pitch"]), 4, "X")
         @ Matrix.Rotation(rad(v["yaw"]), 4, "Z")
         @ Matrix.Rotation(rad(v["roll"]), 4, "Y"))
    G.root.matrix_world = R
    bpy.context.view_layer.update()
    pts = _all_world_verts()
    mn, mx = pts.min(axis=0), pts.max(axis=0)
    size = max(mx[0] - mn[0], mx[2] - mn[2], 1e-6)
    s = 2.0 / size
    c = (mn + mx) / 2.0
    T = Matrix.Translation(Vector((-c[0] * s, -c[1] * s, -c[2] * s)))
    G.root.matrix_world = T @ Matrix.Scale(s, 4) @ R
    bpy.context.view_layer.update()


# =============================================================================
#  Materials
# =============================================================================
def _nt_new(nt, kind, loc=(0, 0), **props):
    n = nt.nodes.new(kind)
    n.location = loc
    for k, val in props.items():
        setattr(n, k, val)
    return n


def _link(nt, a, b):
    nt.links.new(a, b)


def pbr(name, color, metal=0.0, rough=0.5, emit=None, emit_str=0.0,
        trans=0.0, ior=1.45, coat=0.0, sheen=0.0, spec=0.5, sss=0.0,
        noise_rough=0.0, bump=0.0, bump_scale=40.0, glow=None, pattern=None,
        pattern_args=None, alpha=1.0, glow_str=1.0, grunge=0.0, grunge_scale=4.0):
    """Principled material with optional procedural break-up.

    noise_rough : amplitude of roughness variation (metals look worn)
    bump        : strength of a fine noise bump (leather / cloth / rough iron)
    pattern     : name of an extra procedural pattern ('wood', 'veins',
                  'braid', 'scales', 'chainmail', 'grain') that drives colour
                  and bump.
    glow        : RGB used by the post-process bloom pass (defaults to emit
                  colour when emit_str > 0)
    """
    key = name
    if key in G.mats:
        return G.mats[key]
    m = bpy.data.materials.new(name)
    nt = m.node_tree
    nt.nodes.clear()
    out = _nt_new(nt, "ShaderNodeOutputMaterial", (600, 0))
    bsdf = _nt_new(nt, "ShaderNodeBsdfPrincipled", (300, 0))
    _link(nt, bsdf.outputs[0], out.inputs["Surface"])
    I = bsdf.inputs
    I["Base Color"].default_value = (*color, 1)
    I["Metallic"].default_value = metal
    I["Roughness"].default_value = rough
    I["IOR"].default_value = ior
    I["Specular IOR Level"].default_value = spec
    I["Transmission Weight"].default_value = trans
    I["Coat Weight"].default_value = coat
    I["Sheen Weight"].default_value = sheen
    I["Subsurface Weight"].default_value = sss
    I["Alpha"].default_value = alpha
    if emit is not None and emit_str > 0:
        I["Emission Color"].default_value = (*emit, 1)
        I["Emission Strength"].default_value = emit_str
        if glow is None:
            glow = emit
    tc = _nt_new(nt, "ShaderNodeTexCoord", (-900, 0))
    bump_height = None

    if noise_rough > 0:
        nz = _nt_new(nt, "ShaderNodeTexNoise", (-600, -200))
        nz.inputs["Scale"].default_value = 6.0
        nz.inputs["Detail"].default_value = 8.0
        _link(nt, tc.outputs["Object"], nz.inputs["Vector"])
        mr = _nt_new(nt, "ShaderNodeMapRange", (-300, -200))
        mr.inputs["To Min"].default_value = max(0.02, rough - noise_rough)
        mr.inputs["To Max"].default_value = min(1.0, rough + noise_rough)
        mr.inputs["From Min"].default_value = 0.3
        mr.inputs["From Max"].default_value = 0.7
        _link(nt, nz.outputs["Fac"], mr.inputs["Value"])
        _link(nt, mr.outputs["Result"], I["Roughness"])

    if grunge > 0:
        gz = _nt_new(nt, "ShaderNodeTexNoise", (-600, 450))
        gz.inputs["Scale"].default_value = grunge_scale
        gz.inputs["Detail"].default_value = 10.0
        gz.inputs["Roughness"].default_value = 0.65
        _link(nt, tc.outputs["Object"], gz.inputs["Vector"])
        gr = _ramp(nt, (-350, 450), [(0.35, tuple(c * (1 - grunge) for c in color)),
                                     (0.65, color)])
        _link(nt, gz.outputs["Fac"], gr.inputs["Fac"])
        _link(nt, gr.outputs["Color"], I["Base Color"])

    if bump > 0:
        nz2 = _nt_new(nt, "ShaderNodeTexNoise", (-600, -450))
        nz2.inputs["Scale"].default_value = bump_scale
        nz2.inputs["Detail"].default_value = 6.0
        nz2.inputs["Roughness"].default_value = 0.6
        _link(nt, tc.outputs["Object"], nz2.inputs["Vector"])
        bump_height = (nz2.outputs["Fac"], bump)

    if pattern:
        bump_height = _pattern(nt, pattern, pattern_args or {}, tc, I, color,
                               bump_height)
        if pattern == "veins":
            pa = pattern_args or {}
            glow = pa.get("color", (1.0, 0.05, 0.02))
            m["glow_norm"] = 1.0 / pa.get("strength", 8.0)

    if bump_height is not None:
        bn = _nt_new(nt, "ShaderNodeBump", (0, -400))
        bn.inputs["Strength"].default_value = bump_height[1]
        bn.inputs["Distance"].default_value = 0.02
        _link(nt, bump_height[0], bn.inputs["Height"])
        _link(nt, bn.outputs["Normal"], I["Normal"])

    if glow is not None:
        m["glow"] = list(glow)
        m["glow_str"] = glow_str
    G.mats[key] = m
    return m


def _ramp(nt, loc, stops):
    r = _nt_new(nt, "ShaderNodeValToRGB", loc)
    cr = r.color_ramp
    cr.elements[0].position = stops[0][0]
    cr.elements[0].color = (*stops[0][1], 1)
    cr.elements[1].position = stops[-1][0]
    cr.elements[1].color = (*stops[-1][1], 1)
    for p, c in stops[1:-1]:
        e = cr.elements.new(p)
        e.color = (*c, 1)
    return r


def _pattern(nt, kind, a, tc, I, color, bump_height):
    if kind == "wood":
        mp = _nt_new(nt, "ShaderNodeMapping", (-700, 200))
        mp.inputs["Scale"].default_value = a.get("scale", (14.0, 14.0, 1.2))
        _link(nt, tc.outputs["Object"], mp.inputs["Vector"])
        nz = _nt_new(nt, "ShaderNodeTexNoise", (-500, 200))
        nz.inputs["Scale"].default_value = 3.0
        nz.inputs["Detail"].default_value = 10.0
        nz.inputs["Distortion"].default_value = 0.6
        _link(nt, mp.outputs["Vector"], nz.inputs["Vector"])
        dark = a.get("dark", tuple(c * 0.45 for c in color))
        r = _ramp(nt, (-250, 200), [(0.3, dark), (0.7, color)])
        _link(nt, nz.outputs["Fac"], r.inputs["Fac"])
        _link(nt, r.outputs["Color"], I["Base Color"])
        return (nz.outputs["Fac"], a.get("bump", 0.25))

    if kind == "veins":
        # glowing cracks: voronoi distance-to-edge with noise distortion
        mp = _nt_new(nt, "ShaderNodeMapping", (-800, 250))
        mp.inputs["Scale"].default_value = a.get("scale", (3.0, 3.0, 3.0))
        _link(nt, tc.outputs["Object"], mp.inputs["Vector"])
        nz = _nt_new(nt, "ShaderNodeTexNoise", (-700, 450))
        nz.inputs["Scale"].default_value = 2.5
        nz.inputs["Detail"].default_value = 4.0
        _link(nt, tc.outputs["Object"], nz.inputs["Vector"])
        mix = _nt_new(nt, "ShaderNodeMix", (-600, 300))
        mix.data_type = "VECTOR"
        mix.inputs["Factor"].default_value = 0.35
        _link(nt, mp.outputs["Vector"], mix.inputs[4])
        _link(nt, nz.outputs["Color"], mix.inputs[5])
        vo = _nt_new(nt, "ShaderNodeTexVoronoi", (-400, 300))
        vo.feature = "DISTANCE_TO_EDGE"
        vo.inputs["Scale"].default_value = a.get("density", 4.0)
        _link(nt, mix.outputs[1], vo.inputs["Vector"])
        mr = _nt_new(nt, "ShaderNodeMapRange", (-200, 300))
        mr.inputs["From Min"].default_value = 0.0
        mr.inputs["From Max"].default_value = a.get("width", 0.05)
        mr.inputs["To Min"].default_value = 1.0
        mr.inputs["To Max"].default_value = 0.0
        _link(nt, vo.outputs["Distance"], mr.inputs["Value"])
        vc = a.get("color", (1.0, 0.05, 0.02))
        I["Emission Color"].default_value = (*vc, 1)
        mul = _nt_new(nt, "ShaderNodeMath", (0, 300), operation="MULTIPLY")
        mul.inputs[1].default_value = a.get("strength", 8.0)
        _link(nt, mr.outputs["Result"], mul.inputs[0])
        _link(nt, mul.outputs[0], I["Emission Strength"])
        # darker metal around cracks
        return (mr.outputs["Result"], -0.3)

    if kind == "braid":
        # UV: u along the tube (in radii units), v around
        uvn = _nt_new(nt, "ShaderNodeUVMap", (-900, 300))
        sep = _nt_new(nt, "ShaderNodeSeparateXYZ", (-750, 300))
        _link(nt, uvn.outputs["UV"], sep.inputs[0])
        f = a.get("freq", 1.0)
        n = a.get("strands", 2.0)

        def stripe(sign, y):
            m1 = _nt_new(nt, "ShaderNodeMath", (-600, y), operation="MULTIPLY")
            m1.inputs[1].default_value = f
            _link(nt, sep.outputs["X"], m1.inputs[0])
            m2 = _nt_new(nt, "ShaderNodeMath", (-600, y - 80), operation="MULTIPLY")
            m2.inputs[1].default_value = sign * n
            _link(nt, sep.outputs["Y"], m2.inputs[0])
            ad = _nt_new(nt, "ShaderNodeMath", (-450, y), operation="ADD")
            _link(nt, m1.outputs[0], ad.inputs[0])
            _link(nt, m2.outputs[0], ad.inputs[1])
            fr = _nt_new(nt, "ShaderNodeMath", (-300, y), operation="PINGPONG")
            fr.inputs[1].default_value = 0.5
            _link(nt, ad.outputs[0], fr.inputs[0])
            return fr

        s1 = stripe(1, 400)
        s2 = stripe(-1, 200)
        mx = _nt_new(nt, "ShaderNodeMath", (-150, 300), operation="MAXIMUM")
        _link(nt, s1.outputs[0], mx.inputs[0])
        _link(nt, s2.outputs[0], mx.inputs[1])
        dark = a.get("dark", tuple(c * 0.35 for c in color))
        r = _ramp(nt, (0, 300), [(0.30, dark), (0.5, color)])
        _link(nt, mx.outputs[0], r.inputs["Fac"])
        _link(nt, r.outputs["Color"], I["Base Color"])
        return (mx.outputs[0], a.get("bump", 0.6))

    if kind == "chainmail":
        mp = _nt_new(nt, "ShaderNodeMapping", (-700, 200))
        mp.inputs["Scale"].default_value = a.get("scale", (1.0, 1.0, 1.6))
        _link(nt, tc.outputs["Object"], mp.inputs["Vector"])
        vo = _nt_new(nt, "ShaderNodeTexVoronoi", (-500, 200))
        vo.feature = "F1"
        vo.voronoi_dimensions = "3D"
        vo.inputs["Scale"].default_value = a.get("density", 60.0)
        vo.inputs["Randomness"].default_value = 0.05
        _link(nt, mp.outputs["Vector"], vo.inputs["Vector"])
        # ring: bright band at mid distance
        mr = _nt_new(nt, "ShaderNodeMapRange", (-300, 200))
        mr.inputs["From Min"].default_value = 0.15
        mr.inputs["From Max"].default_value = 0.5
        _link(nt, vo.outputs["Distance"], mr.inputs["Value"])
        pp = _nt_new(nt, "ShaderNodeMath", (-150, 200), operation="PINGPONG")
        pp.inputs[1].default_value = 0.5
        _link(nt, mr.outputs["Result"], pp.inputs[0])
        dark = tuple(c * 0.15 for c in color)
        r = _ramp(nt, (0, 200), [(0.05, dark), (0.35, color)])
        _link(nt, pp.outputs[0], r.inputs["Fac"])
        _link(nt, r.outputs["Color"], I["Base Color"])
        return (pp.outputs[0], a.get("bump", 0.8))

    if kind == "scales":
        mp = _nt_new(nt, "ShaderNodeMapping", (-700, 200))
        mp.inputs["Scale"].default_value = a.get("scale", (1.0, 1.0, 1.0))
        _link(nt, tc.outputs["Object"], mp.inputs["Vector"])
        vo = _nt_new(nt, "ShaderNodeTexVoronoi", (-500, 200))
        vo.feature = "F1"
        vo.inputs["Scale"].default_value = a.get("density", 20.0)
        _link(nt, mp.outputs["Vector"], vo.inputs["Vector"])
        dark = tuple(c * 0.4 for c in color)
        r = _ramp(nt, (0, 200), [(0.0, color), (0.5, dark)])
        _link(nt, vo.outputs["Distance"], r.inputs["Fac"])
        _link(nt, r.outputs["Color"], I["Base Color"])
        return (vo.outputs["Distance"], -a.get("bump", 0.5))

    if kind == "stripes":
        # Stripes along object Z (cloth weave / wrapped grips)
        mp = _nt_new(nt, "ShaderNodeMapping", (-700, 200))
        mp.inputs["Scale"].default_value = a.get("scale", (1.0, 1.0, 1.0))
        _link(nt, tc.outputs["Object"], mp.inputs["Vector"])
        wv = _nt_new(nt, "ShaderNodeTexWave", (-500, 200))
        wv.wave_type = "BANDS"
        wv.bands_direction = a.get("dir", "Z")
        wv.inputs["Scale"].default_value = a.get("freq", 10.0)
        wv.inputs["Distortion"].default_value = a.get("distort", 0.0)
        _link(nt, mp.outputs["Vector"], wv.inputs["Vector"])
        dark = a.get("dark", tuple(c * 0.4 for c in color))
        r = _ramp(nt, (-250, 200), [(0.2, dark), (0.8, color)])
        _link(nt, wv.outputs["Fac"], r.inputs["Fac"])
        _link(nt, r.outputs["Color"], I["Base Color"])
        return (wv.outputs["Fac"], a.get("bump", 0.4))
    raise ValueError(kind)


# ---- palette ---------------------------------------------------------------
def M_iron():
    return pbr("iron", (0.27, 0.26, 0.25), metal=1, rough=0.46, noise_rough=0.18,
               bump=0.08, bump_scale=25)


def M_darkiron():
    return pbr("darkiron", (0.16, 0.155, 0.15), metal=1, rough=0.45,
               noise_rough=0.15, bump=0.1, bump_scale=25)


def M_steel():
    return pbr("steel", (0.66, 0.68, 0.72), metal=1, rough=0.24, noise_rough=0.08)


def M_silver():
    return pbr("silver", (0.94, 0.95, 0.98), metal=1, rough=0.14, noise_rough=0.05)


def M_gold():
    return pbr("gold", (1.0, 0.70, 0.26), metal=1, rough=0.2, noise_rough=0.06)


def M_palegold():
    return pbr("palegold", (1.0, 0.86, 0.55), metal=1, rough=0.18)


def M_brass():
    return pbr("brass", (0.78, 0.55, 0.28), metal=1, rough=0.32, noise_rough=0.1)


def M_bronze():
    return pbr("bronze", (0.62, 0.36, 0.18), metal=1, rough=0.35, noise_rough=0.1)


def M_blackmetal():
    return pbr("blackmetal", (0.055, 0.05, 0.06), metal=1, rough=0.28,
               noise_rough=0.08)


def M_wood(tint=(0.42, 0.24, 0.11), name="wood"):
    return pbr(name, tint, rough=0.55, pattern="wood")


def M_darkwood():
    return M_wood((0.22, 0.11, 0.06), "darkwood")


def M_leather(color=(0.36, 0.19, 0.09), name="leather"):
    return pbr(name, color, rough=0.55, bump=0.35, bump_scale=60, coat=0.15)


def M_cloth(color, name):
    return pbr(name, color, rough=0.85, sheen=0.6, bump=0.25, bump_scale=120)


def M_bone():
    return pbr("bone", (0.86, 0.80, 0.64), rough=0.45, sss=0.1, bump=0.15,
               bump_scale=30)


def M_parchment():
    return pbr("parchment", (0.88, 0.78, 0.58), rough=0.8, bump=0.1)


def M_gem(color, name, glow_str=1.2):
    return pbr(name, color, rough=0.03, trans=0.55, ior=1.9, spec=1.0,
               emit=color, emit_str=glow_str)


def M_glow(color, name, strength=6.0, base=None):
    return pbr(name, base or tuple(c * 0.4 for c in color), rough=0.3,
               emit=color, emit_str=strength)


def M_black_glass():
    return pbr("blackglass", (0.02, 0.02, 0.025), rough=0.05, spec=1.0)


# =============================================================================
#  Mesh construction helpers
# =============================================================================
def _place(ob, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1), parent=None):
    ob.parent = parent or G.parent or G.root
    ob.location = loc
    ob.rotation_euler = rot
    if isinstance(scale, (int, float)):
        scale = (scale, scale, scale)
    ob.scale = scale
    return ob


def make_mesh(name, verts, faces, mat=None, smooth=True, sharp=None, uvs=None,
              mats=None, face_mats=None, **tf):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces])
    me.validate(clean_customdata=False)
    if uvs is not None:
        uvl = me.uv_layers.new(name="UVMap")
        # uvs: per-vertex uv list; spread to loops
        data = uvl.data
        li = 0
        for poly in me.polygons:
            for vi in poly.vertices:
                data[li].uv = uvs[vi]
                li += 1
    if mats:
        for m in mats:
            me.materials.append(m)
        if face_mats is not None:
            me.polygons.foreach_set("material_index", face_mats)
    elif mat is not None:
        me.materials.append(mat)
    if smooth:
        me.shade_smooth()
        if sharp is not None:
            me.set_sharp_from_angle(angle=rad(sharp))
    else:
        me.shade_flat()
    ob = bpy.data.objects.new(name, me)
    G.coll.objects.link(ob)
    _place(ob, **tf)
    return ob


def bm_to_obj(name, bm, mat=None, smooth=True, sharp=None, **tf):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    if mat is not None:
        me.materials.append(mat)
    if smooth:
        me.shade_smooth()
        if sharp is not None:
            me.set_sharp_from_angle(angle=rad(sharp))
    else:
        me.shade_flat()
    ob = bpy.data.objects.new(name, me)
    G.coll.objects.link(ob)
    _place(ob, **tf)
    return ob


def link_shared(name, mesh, loc=(0, 0, 0), rot=(0, 0, 0), scale=1.0, matrix=None,
                parent=None):
    ob = bpy.data.objects.new(name, mesh)
    G.coll.objects.link(ob)
    ob.parent = parent or G.parent or G.root
    if matrix is not None:
        ob.matrix_parent_inverse = Matrix()
        ob.matrix_basis = matrix
    else:
        _place(ob, loc, rot, scale, parent)
    return ob


class group:
    """Context manager: parts created inside are parented to a new empty with
    the given transform (nestable)."""

    def __init__(self, loc=(0, 0, 0), rot=(0, 0, 0), scale=1.0, name="grp"):
        self.loc, self.rot, self.scale, self.name = loc, rot, scale, name

    def __enter__(self):
        e = bpy.data.objects.new(self.name, None)
        G.coll.objects.link(e)
        _place(e, self.loc, self.rot, self.scale)
        self.prev = G.parent
        G.parent = e
        return e

    def __exit__(self, *exc):
        G.parent = self.prev
        return False


# ---- modifiers ---------------------------------------------------------------
def bevel(ob, width=0.01, segments=2, angle=40, clamp=True):
    md = ob.modifiers.new("Bevel", "BEVEL")
    md.width = width
    md.segments = segments
    md.limit_method = "ANGLE"
    md.angle_limit = rad(angle)
    md.use_clamp_overlap = clamp
    return ob


def subsurf(ob, levels=2):
    md = ob.modifiers.new("Subsurf", "SUBSURF")
    md.levels = levels
    md.render_levels = levels
    return ob


def solidify(ob, thick=0.02, offset=0.0):
    md = ob.modifiers.new("Solidify", "SOLIDIFY")
    md.thickness = thick
    md.offset = offset
    return ob


def boolean(ob, cutter, op="DIFFERENCE"):
    md = ob.modifiers.new("Bool", "BOOLEAN")
    md.operation = op
    md.object = cutter
    md.solver = "EXACT"
    cutter.hide_render = True
    cutter.display_type = "WIRE"
    return ob


def displace_noise(ob, strength=0.02, scale=0.3):
    tex = bpy.data.textures.new("disp", "CLOUDS")
    tex.noise_scale = scale
    md = ob.modifiers.new("Disp", "DISPLACE")
    md.texture = tex
    md.strength = strength
    md.mid_level = 0.5
    return ob


# ---- primitives -------------------------------------------------------------
def box(size, mat, loc=(0, 0, 0), rot=(0, 0, 0), bev=0.0, bev_seg=2, name="box"):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    ob = bm_to_obj(name, bm, mat, smooth=True, sharp=30, loc=loc, rot=rot)
    if bev > 0:
        bevel(ob, bev, bev_seg)
    return ob


def sphere(r, mat, loc=(0, 0, 0), rot=(0, 0, 0), scale=1.0, seg=32, rings=16,
           name="sphere"):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=r)
    return bm_to_obj(name, bm, mat, loc=loc, rot=rot, scale=scale)


def icosphere(r, mat, loc=(0, 0, 0), subdiv=2, smooth=True, scale=1.0,
              rot=(0, 0, 0), name="ico"):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=r)
    return bm_to_obj(name, bm, mat, smooth=smooth, loc=loc, scale=scale, rot=rot)


def cyl(r, depth, mat, loc=(0, 0, 0), rot=(0, 0, 0), seg=32, r2=None, bev=0.0,
        name="cyl", smooth=True):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg,
                          radius1=r, radius2=r if r2 is None else r2,
                          depth=depth)
    ob = bm_to_obj(name, bm, mat, smooth=smooth, sharp=40, loc=loc, rot=rot)
    if bev > 0:
        bevel(ob, bev, 2)
    return ob


def cone(r, depth, mat, loc=(0, 0, 0), rot=(0, 0, 0), seg=16, name="cone",
         smooth=True):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=True, segments=seg,
                          radius1=r, radius2=0.0, depth=depth)
    # move so base is at z=0, tip at z=depth
    bmesh.ops.translate(bm, vec=Vector((0, 0, depth / 2)), verts=bm.verts)
    return bm_to_obj(name, bm, mat, smooth=smooth, sharp=50, loc=loc, rot=rot)


def lathe(profile, mat, seg=32, loc=(0, 0, 0), rot=(0, 0, 0), scale=1.0,
          smooth=True, sharp=None, cap=True, name="lathe", sx=1.0, sy=1.0,
          uv=False, xsec=None, a0=0.0):
    """Revolve a (r, z) profile (bottom -> top) around Z."""
    verts, faces, uvs = [], [], []
    rings = []
    for pi, (r, z) in enumerate(profile):
        if r <= 1e-6:
            rings.append([len(verts)])
            verts.append((0, 0, z))
            uvs.append((0.5, pi / (len(profile) - 1)))
            continue
        ring = []
        for i in range(seg):
            a = TAU * i / seg + a0
            rr = r * (xsec(a, z) if xsec else 1.0)
            ring.append(len(verts))
            verts.append((rr * math.cos(a) * sx, rr * math.sin(a) * sy, z))
            uvs.append((i / seg, pi / (len(profile) - 1)))
        rings.append(ring)
    for a_, b_ in zip(rings[:-1], rings[1:]):
        if len(a_) == 1 and len(b_) == 1:
            continue
        if len(a_) == 1:
            for i in range(seg):
                faces.append((a_[0], b_[i], b_[(i + 1) % seg]))
        elif len(b_) == 1:
            for i in range(seg):
                faces.append((a_[i], b_[0], a_[(i + 1) % seg])[::-1])
        else:
            for i in range(seg):
                j = (i + 1) % seg
                faces.append((a_[i], a_[j], b_[j], b_[i]))
    if cap:
        if len(rings[0]) > 1:
            faces.append(tuple(reversed(rings[0])))
        if len(rings[-1]) > 1:
            faces.append(tuple(rings[-1]))
    return make_mesh(name, verts, faces, mat, smooth=smooth, sharp=sharp,
                     uvs=uvs if uv else None, loc=loc, rot=rot, scale=scale)


def torus(R, r, mat, loc=(0, 0, 0), rot=(0, 0, 0), seg=48, rseg=12, scale=1.0,
          name="torus", sx=1.0, sy=1.0, rs=1.0):
    """Torus around Z. sx/sy stretch the major circle, rs scales the tube
    thickness along Z (flat bands)."""
    verts, faces = [], []
    for i in range(seg):
        a = TAU * i / seg
        ca, sa = math.cos(a), math.sin(a)
        for j in range(rseg):
            b = TAU * j / rseg
            rr = R + r * math.cos(b)
            verts.append((rr * ca * sx, rr * sa * sy, r * math.sin(b) * rs))
    for i in range(seg):
        for j in range(rseg):
            i2, j2 = (i + 1) % seg, (j + 1) % rseg
            faces.append((i * rseg + j, i2 * rseg + j, i2 * rseg + j2, i * rseg + j2))
    return make_mesh(name, verts, faces, mat, loc=loc, rot=rot, scale=scale)


def extrude(pts, depth, mat, loc=(0, 0, 0), rot=(0, 0, 0), bev=0.0, bev_seg=2,
            name="extr", sharp=35, scale=1.0, taper=0.0, bev_angle=40):
    """Extrude a 2D outline given in the XZ picture plane along Y (centered).
    taper > 0 shrinks the back face toward the centroid (bevelled slab)."""
    n = len(pts)
    # ensure CCW when seen from -Y (camera): compute signed area in (x, z)
    area = 0.0
    for i in range(n):
        x1, z1 = pts[i]
        x2, z2 = pts[(i + 1) % n]
        area += x1 * z2 - x2 * z1
    if area < 0:
        pts = list(reversed(pts))
    cx = sum(p[0] for p in pts) / n
    cz = sum(p[1] for p in pts) / n
    verts = []
    for (x, z) in pts:
        verts.append((x, -depth / 2, z))
    for (x, z) in pts:
        if taper:
            x = cx + (x - cx) * (1 - taper)
            z = cz + (z - cz) * (1 - taper)
        verts.append((x, depth / 2, z))
    faces = [tuple(range(n)), tuple(range(2 * n - 1, n - 1, -1))]
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, n + i, n + j, j))
    ob = make_mesh(name, verts, faces, mat, smooth=True, sharp=sharp, loc=loc,
                   rot=rot, scale=scale)
    # fix normals (outward)
    me = ob.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    me.shade_smooth()
    me.set_sharp_from_angle(angle=rad(sharp))
    if bev > 0:
        bevel(ob, bev, bev_seg, angle=bev_angle)
    return ob


def frame_path(path):
    """Parallel-transport frames for a list of Vector points."""
    n = len(path)
    T = []
    for i in range(n):
        a = path[max(i - 1, 0)]
        b = path[min(i + 1, n - 1)]
        t = (b - a)
        if t.length < 1e-9:
            t = Vector((0, 0, 1))
        T.append(t.normalized())
    ref = Vector((0, -1, 0)) if abs(T[0].y) < 0.9 else Vector((1, 0, 0))
    N0 = (ref - ref.dot(T[0]) * T[0]).normalized()
    N = [N0]
    for i in range(1, n):
        v = N[-1] - N[-1].dot(T[i]) * T[i]
        if v.length < 1e-9:
            v = N[-1]
        N.append(v.normalized())
    B = [T[i].cross(N[i]) for i in range(n)]
    return T, N, B


def sweep(path, radius, mat, segs=12, caps=True, radial=None, name="tube",
          smooth=True, uv=False, ellipse=(1.0, 1.0), twist=0.0, sharp=None):
    """Sweep a circle along `path` (list of 3-tuples).

    radius : float | list | callable(s) where s in [0, 1] (arc length)
    radial : optional callable(s, theta, arclen) -> multiplier (braids, ribs)
    """
    path = [Vector(p) for p in path]
    n = len(path)
    L = [0.0]
    for i in range(1, n):
        L.append(L[-1] + (path[i] - path[i - 1]).length)
    total = max(L[-1], 1e-9)
    T, N, B = frame_path(path)
    verts, faces, uvs = [], [], []
    for i in range(n):
        s = L[i] / total
        if callable(radius):
            r = radius(s)
        elif isinstance(radius, (list, tuple)):
            r = radius[i]
        else:
            r = radius
        for j in range(segs):
            th = TAU * j / segs + twist * s
            m = radial(s, th, L[i]) if radial else 1.0
            off = (N[i] * math.cos(th) * ellipse[0] + B[i] * math.sin(th) * ellipse[1]) * r * m
            verts.append(path[i] + off)
            uvs.append((L[i], j / segs))
    for i in range(n - 1):
        for j in range(segs):
            j2 = (j + 1) % segs
            faces.append((i * segs + j, i * segs + j2, (i + 1) * segs + j2,
                          (i + 1) * segs + j))
    if caps:
        c0 = len(verts)
        verts.append(path[0])
        uvs.append((0, 0))
        c1 = len(verts)
        verts.append(path[-1])
        uvs.append((total, 0))
        for j in range(segs):
            j2 = (j + 1) % segs
            faces.append((c0, j2, j))
            faces.append((c1, (n - 1) * segs + j, (n - 1) * segs + j2))
    return make_mesh(name, verts, faces, mat, smooth=smooth, sharp=sharp,
                     uvs=uvs if uv else None)


def resample(path, step):
    """Resample a polyline at a fixed arc-length step."""
    path = [Vector(p) for p in path]
    out = [path[0]]
    acc = 0.0
    for i in range(1, len(path)):
        a, b = path[i - 1], path[i]
        seg = (b - a).length
        while acc + seg >= step:
            t = (step - acc) / seg
            a = a.lerp(b, t)
            out.append(a)
            seg = (b - a).length
            acc = 0.0
        acc += seg
    return out


def bezier(p0, p1, p2, p3, n=48):
    p0, p1, p2, p3 = map(Vector, (p0, p1, p2, p3))
    pts = []
    for i in range(n + 1):
        t = i / n
        u = 1 - t
        pts.append(u ** 3 * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t ** 3 * p3)
    return pts


def catmull(points, n_per=12):
    """Catmull-Rom spline through points (list of 3-tuples)."""
    P = [Vector(p) for p in points]
    P = [P[0] + (P[0] - P[1])] + P + [P[-1] + (P[-1] - P[-2])]
    out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for k in range(n_per):
            t = k / n_per
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t
                              + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
                              + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out.append(P[-2])
    return out


def frame_matrix(pos, t, n):
    """Matrix whose X axis = t, Z axis = n (orthonormalised)."""
    t = Vector(t).normalized()
    n = Vector(n)
    n = (n - n.dot(t) * t).normalized()
    b = n.cross(t)
    M = Matrix(((t.x, b.x, n.x, pos[0]),
                (t.y, b.y, n.y, pos[1]),
                (t.z, b.z, n.z, pos[2]),
                (0, 0, 0, 1)))
    return M


# =============================================================================
#  Composite parts
# =============================================================================
BLADE_X = {
    # (u, v): u across the width (-1..1 = cutting edges), v through the
    # thickness.  Each profile has a narrow secondary bevel next to the edge
    # so the polished edge material stays a thin bright line.
    "diamond": [(-1, 0), (-0.86, 0.3), (0, 1), (0.86, 0.3), (1, 0), (0.86, -0.3), (0, -1),
                (-0.86, -0.3)],
    "hex": [(-1, 0), (-0.86, 0.45), (-0.55, 1), (0.55, 1), (0.86, 0.45), (1, 0),
            (0.86, -0.45), (0.55, -1), (-0.55, -1), (-0.86, -0.45)],
    "fuller": [(-1, 0), (-0.86, 0.5), (-0.62, 1), (-0.2, 1), (0, "f"), (0.2, 1), (0.62, 1),
               (0.86, 0.5), (1, 0), (0.86, -0.5), (0.62, -1), (0.2, -1), (0, "-f"), (-0.2, -1),
               (-0.62, -1), (-0.86, -0.5)],
    "single": [(-1, 0), (-0.84, 0.35), (-0.35, 0.85), (0.999, 1), (0.999, -1), (-0.35, -0.85),
               (-0.84, -0.35)],
    "lens": [(-1, 0), (-0.7, 0.7), (0, 1), (0.7, 0.7), (1, 0), (0.7, -0.7),
             (0, -1), (-0.7, -0.7)],
}


def std_blade(width, tip=0.2, taper=0.25, tip_pow=0.75, thick=0.03,
              fuller=0.0, fuller_end=0.7):
    def fn(t):
        w = width / 2 * (1 - taper * t)
        if t > 1 - tip:
            w *= ((1 - t) / tip) ** tip_pow
        f = fuller if t < fuller_end else fuller * max(0, 1 - (t - fuller_end) / 0.1)
        return w, 0.0, thick * (1 - 0.5 * t), f
    return fn


def blade(length, fn, mat, edge_mat=None, cross="diamond", n=48, z0=0.0,
          name="blade", bend=None):
    """Lofted blade along +Z.  fn(t) -> (halfwidth, center_x, halfthick,
    fuller_depth).  Faces touching the cutting edges (|u| == 1) get
    edge_mat (polished edge highlight)."""
    X = BLADE_X[cross]
    k = len(X)
    verts, faces, fm = [], [], []
    for i in range(n):
        t = i / n
        w, cx, th, fd = fn(t)
        z = z0 + t * length
        by = bend(t) if bend else 0.0
        for (u, v) in X:
            if v == "f":
                v = 1 - fd
            elif v == "-f":
                v = -(1 - fd)
            verts.append((cx + u * w, v * th, z + by * 0))
    # tip
    w, cx, th, fd = fn(1.0)
    tip = len(verts)
    verts.append((cx, 0, z0 + length))
    edge_idx = [j for j, (u, v) in enumerate(X) if abs(u) == 1]
    for i in range(n - 1):
        for j in range(k):
            j2 = (j + 1) % k
            faces.append((i * k + j, i * k + j2, (i + 1) * k + j2, (i + 1) * k + j))
            fm.append(1 if (j in edge_idx or j2 in edge_idx) and edge_mat else 0)
    last = (n - 1) * k
    for j in range(k):
        j2 = (j + 1) % k
        faces.append((last + j, last + j2, tip))
        fm.append(1 if (j in edge_idx or j2 in edge_idx) and edge_mat else 0)
    faces.append(tuple(range(k))[::-1])
    fm.append(0)
    mats = [mat, edge_mat] if edge_mat else [mat]
    ob = make_mesh(name, verts, faces, mats=mats, face_mats=fm, smooth=False)
    me = ob.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    me.shade_flat()
    return ob


def grip(z0, z1, r, mat, wraps=10, depth=0.12, seg=20, flare=0.0, name="grip",
         spiral=True):
    """Wrapped grip along Z.  spiral=True gives a helical cord/leather wrap,
    otherwise stacked rings."""
    L = z1 - z0
    n = max(24, int(wraps * 8))
    pitch = L / max(wraps, 1)
    k = TAU / pitch

    def rad_fn(s):
        belly = 1 + 0.07 * math.sin(s * math.pi) + flare * (abs(s - 0.5) * 2) ** 2
        return r * belly

    if spiral:
        def radial(s, th, Ls):
            ph = (Ls * k + th) / 2.0
            return 1 + depth * (abs(math.sin(ph)) ** 0.45 - 0.75)
    else:
        def radial(s, th, Ls):
            return 1 + depth * (abs(math.sin(Ls * k / 2)) ** 0.6 - 0.5)
    path = [(0, 0, z0 + L * i / n) for i in range(n + 1)]
    return sweep(path, rad_fn, mat, segs=seg, radial=radial, name=name)


def gem(r, mat, loc=(0, 0, 0), rot=(rad(90), 0, 0), seg=10, height=0.8,
        name="gem", cut="brilliant", scale=1.0):
    """Faceted gem, crown facing +Z of its local frame (default rotated to face
    the camera)."""
    if cut == "brilliant":
        prof = [(0, -r * height), (r * 0.98, -r * 0.05), (r, 0.0), (r * 0.62, r * 0.38),
                (0, r * 0.42)]
    elif cut == "cabochon":
        prof = [(0, -r * 0.1), (r, 0), (r * 0.92, r * 0.3), (r * 0.7, r * 0.55),
                (r * 0.38, r * 0.7), (0, r * 0.75)]
    else:  # step / emerald
        prof = [(0, -r * 0.5), (r * 0.7, -r * 0.25), (r, 0.0), (r, r * 0.1),
                (r * 0.72, r * 0.35), (0, r * 0.35)]
    return lathe(prof, mat, seg=seg, loc=loc, rot=rot, smooth=cut == "cabochon",
                 name=name, scale=scale)


def crystal(r, h, mat, loc=(0, 0, 0), rot=(0, 0, 0), sides=6, tip=0.35,
            base_tip=0.25, name="crystal", scale=1.0):
    """Hexagonal crystal prism with pointed ends along +Z."""
    prof = [(0, 0), (r, h * base_tip), (r, h * (1 - tip)), (0, h)]
    return lathe(prof, mat, seg=sides, loc=loc, rot=rot, smooth=False,
                 name=name, scale=scale)


def link_mesh(L, W, wire, seg=24, rseg=8):
    """Stadium-shaped chain link in the XY plane, long axis X."""
    key = ("link", round(L, 4), round(W, 4), round(wire, 4))
    if key in G.shared:
        return G.shared[key]
    R = W / 2
    straight = max(L - W, 0.0) / 2
    path = []
    for i in range(seg):
        a = TAU * i / seg
        x = R * math.cos(a)
        y = R * math.sin(a)
        x += straight if math.cos(a) >= 0 else -straight
        path.append(Vector((x, y, 0)))
    verts, faces = [], []
    n = len(path)
    for i in range(n):
        p = path[i]
        t = (path[(i + 1) % n] - path[i - 1]).normalized()
        nrm = Vector((0, 0, 1))
        b = t.cross(nrm)
        for j in range(rseg):
            th = TAU * j / rseg
            verts.append(p + (b * math.cos(th) + nrm * math.sin(th)) * wire)
    for i in range(n):
        for j in range(rseg):
            i2, j2 = (i + 1) % n, (j + 1) % rseg
            faces.append((i * rseg + j, i2 * rseg + j, i2 * rseg + j2, i * rseg + j2))
    me = bpy.data.meshes.new("link")
    me.from_pydata([tuple(v) for v in verts], [], faces)
    me.shade_smooth()
    G.shared[key] = me
    return me


def chain(path, mat, link_len=0.12, wire=0.014, width=None, twist0=0.0,
          name="chain", scale_fn=None):
    """Interlocked chain links along a path."""
    width = width or link_len * 0.62
    step = (link_len - 2 * wire) * 0.82
    pts = resample(path, step)
    me = link_mesh(link_len, width, wire)
    if not me.materials:
        me.materials.append(mat)
    obs = []
    ref = Vector((0, -1, 0))
    for i in range(len(pts) - 1):
        a, b = pts[i], pts[i + 1]
        c = (a + b) / 2
        t = (b - a).normalized()
        n = ref - ref.dot(t) * t
        if n.length < 1e-6:
            n = Vector((1, 0, 0))
        n.normalize()
        if (i % 2) == 1:
            n = t.cross(n)
        M = frame_matrix(c, t, n)
        # link long axis X -> t, ring normal Z -> n
        if scale_fn:
            s = scale_fn(i / max(1, len(pts) - 2))
            M = M @ Matrix.Scale(s, 4)
        obs.append(link_shared(name, me, matrix=M))
    return obs


def spikes_on_points(points, normals, length, r, mat, name="spike", seg=10):
    key = ("spike", round(length, 4), round(r, 4))
    if key not in G.shared:
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=True, segments=seg,
                              radius1=r, radius2=0.0, depth=length)
        bmesh.ops.translate(bm, vec=Vector((0, 0, length / 2)), verts=bm.verts)
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        me.materials.append(mat)
        me.shade_smooth()
        me.set_sharp_from_angle(angle=rad(50))
        G.shared[key] = me
    me = G.shared[key]
    for p, nrm in zip(points, normals):
        q = Vector(nrm).normalized().to_track_quat("Z", "Y")
        M = Matrix.Translation(Vector(p)) @ q.to_matrix().to_4x4()
        link_shared(name, me, matrix=M)


def spiked_ball(r, spike_len, mat, spike_mat=None, loc=(0, 0, 0), subdiv=1):
    ball = icosphere(r, mat, loc=loc, subdiv=3, name="ball")
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=r)
    pts = [Vector(loc) + v.co * 0.92 for v in bm.verts]
    nrms = [v.co.normalized() for v in bm.verts]
    bm.free()
    spikes_on_points(pts, nrms, spike_len, r * 0.28, spike_mat or mat)
    return ball


def rivets(points, r, mat, normal=(0, -1, 0)):
    for p in points:
        sphere(r, mat, loc=p, seg=12, rings=6, scale=(1, 0.6, 1), name="rivet")


# ---- 2D outline helpers --------------------------------------------------------
def arc(cx, cz, r, a0, a1, n=16, rz=None):
    rz = r if rz is None else rz
    return [(cx + r * math.cos(a0 + (a1 - a0) * i / n),
             cz + rz * math.sin(a0 + (a1 - a0) * i / n)) for i in range(n + 1)]


def mirror_x(half):
    """half: points on +X side from top-centre to bottom-centre."""
    other = [(-x, z) for (x, z) in reversed(half) if abs(x) > 1e-6]
    return half + other


def shape_cross(w, h, arm_w, arm_z, flare=0.0):
    """Latin cross outline (centered x=0, base z=0)."""
    a = arm_w / 2
    f = flare
    return [(-a, 0), (a, 0), (a, arm_z - a), (w / 2, arm_z - a - f),
            (w / 2, arm_z + a + f), (a, arm_z + a), (a, h), (-a, h),
            (-a, arm_z + a), (-w / 2, arm_z + a + f), (-w / 2, arm_z - a - f),
            (-a, arm_z - a)]


def shape_star(n, r1, r2, rot=math.pi / 2):
    pts = []
    for i in range(2 * n):
        r = r1 if i % 2 == 0 else r2
        a = rot + math.pi * i / n
        pts.append((r * math.cos(a), r * math.sin(a)))
    return pts


def shape_heart(s, n=60):
    pts = []
    for i in range(n):
        t = TAU * i / n
        x = 16 * math.sin(t) ** 3
        z = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        pts.append((x * s / 16, z * s / 16))
    return pts


def shape_crescent(R, r, off, n=48):
    """Crescent: outer circle radius R minus a circle radius r shifted by off
    along +x.  Returns outline points."""
    # intersection angles
    pts = []
    # outer arc: points of big circle not inside small circle
    out = []
    for i in range(n * 2):
        a = TAU * i / (n * 2)
        x, z = R * math.cos(a), R * math.sin(a)
        if (x - off) ** 2 + z ** 2 >= r * r:
            out.append((a, x, z))
    # order outer from top intersection going through left side
    out.sort(key=lambda p: (p[0] - math.pi / 2) % TAU)
    pts = [(x, z) for _, x, z in out]
    # inner arc of small circle inside big circle, from bottom to top
    inner = []
    for i in range(n * 2):
        a = TAU * i / (n * 2)
        x, z = off + r * math.cos(a), r * math.sin(a)
        if x * x + z * z <= R * R:
            inner.append((a, x, z))
    inner.sort(key=lambda p: -((p[0] - math.pi) % TAU))
    inner_pts = [(x, z) for _, x, z in inner]
    # connect: outer goes top -> left -> bottom; inner goes bottom -> top
    # inner sorted so we walk from bottom (angle ~ -a) to top
    inner_pts.sort(key=lambda p: p[1])
    return pts + inner_pts


# =============================================================================
#  ITEM BUILDERS
# =============================================================================
REGISTRY = {}


def item(item_id):
    def deco(fn):
        REGISTRY[item_id] = fn
        return fn
    return deco



# =============================================================================
#  SHARED PARTS
# =============================================================================
def stroke2d(p, q, w, depth, mat, y=0.0, name="stroke"):
    """Thin bar between two XZ points (runes, engravings, frames)."""
    dx, dz = q[0] - p[0], q[1] - p[1]
    L = math.hypot(dx, dz)
    ang = math.atan2(dz, dx)
    return box((L + w, depth, w), mat, loc=((p[0] + q[0]) / 2, y, (p[1] + q[1]) / 2),
               rot=(0, -ang, 0), name=name)


_RUNE_GRID = [(0, 0), (1, 0), (0, 1), (1, 1), (0, 2), (1, 2), (0.5, 1), (0.5, 0), (0.5, 2)]


def runes(x, z0, z1, y, cell, mat, stroke=None, seed=3, gap=0.35, horizontal=False):
    """Row of random runic glyphs along Z (or X if horizontal) in the XZ
    plane at depth y.  Glyphs are 2-4 strokes on a 2x3 grid."""
    rng = random.Random(seed)
    stroke = stroke or cell * 0.16
    gw, gh = cell * 0.55, cell * 0.8
    pos = z0
    obs = []
    while pos + gh <= z1 + 1e-6:
        strokes = set()
        # vertical stave (most runes have one)
        if rng.random() < 0.8:
            c = rng.choice([0, 1, 0.5])
            strokes.add(((c, 0), (c, 2)))
        for _ in range(rng.randint(1, 3)):
            a, b = rng.sample(_RUNE_GRID, 2)
            if a != b:
                strokes.add((a, b))
        for a, b in strokes:
            if horizontal:
                pa = (pos + a[1] / 2 * gh, x + (a[0] - 0.5) * gw)
                pb = (pos + b[1] / 2 * gh, x + (b[0] - 0.5) * gw)
            else:
                pa = (x + (a[0] - 0.5) * gw, pos + a[1] / 2 * gh)
                pb = (x + (b[0] - 0.5) * gw, pos + b[1] / 2 * gh)
            obs.append(stroke2d(pa, pb, stroke, stroke * 0.6, mat, y=y, name="rune"))
        pos += gh * (1 + gap)
    return obs


def skull(mat, loc=(0, 0, 0), rot=(0, 0, 0), scale=0.1, socket_mat=None,
          eye_mat=None, jaw=True, horns=None, horn_mat=None):
    """Stylised skull (~1 unit tall before scaling), face toward -Y."""
    socket_mat = socket_mat or pbr("skull_socket", (0.02, 0.01, 0.01), rough=0.9)
    with group(loc, rot, scale, name="skull"):
        cran = sphere(0.5, mat, loc=(0, 0.05, 0.12), scale=(0.9, 1.0, 0.88), name="cranium")
        face = sphere(0.33, mat, loc=(0, -0.2, -0.2), scale=(1.0, 0.85, 0.85), name="face")
        cheekL = sphere(0.13, mat, loc=(-0.28, -0.27, -0.12), name="cheek")
        cheekR = sphere(0.13, mat, loc=(0.28, -0.27, -0.12), name="cheek")
        for ob in (face, cheekL, cheekR):
            boolean(cran, ob, "UNION")
        # carve sockets & nose from the union
        cutL = sphere(0.15, mat, loc=(-0.19, -0.46, -0.02), scale=(1.1, 1.0, 1.0), name="cutL")
        cutR = sphere(0.15, mat, loc=(0.19, -0.46, -0.02), scale=(1.1, 1.0, 1.0), name="cutR")
        cutN = cone(0.07, 0.2, mat, loc=(0, -0.5, -0.28), rot=(0, 0, 0), seg=3, name="cutN")
        boolean(cran, cutL)
        boolean(cran, cutR)
        boolean(cran, cutN)
        # dark socket fill (or glowing eyes)
        sphere(0.11, socket_mat, loc=(-0.19, -0.36, -0.03), name="sock")
        sphere(0.11, socket_mat, loc=(0.19, -0.36, -0.03), name="sock")
        if eye_mat:
            sphere(0.055, eye_mat, loc=(-0.19, -0.44, -0.03), name="eye")
            sphere(0.055, eye_mat, loc=(0.19, -0.44, -0.03), name="eye")
        sphere(0.06, socket_mat, loc=(0, -0.44, -0.22), scale=(0.8, 1, 1.3), name="nose")
        # teeth
        for k in range(6):
            a = rad(-38 + k * 15.2)
            x, y = 0.3 * math.sin(a), -0.13 - 0.3 * math.cos(a)
            box((0.055, 0.05, 0.1), mat, loc=(x, y - 0.06, -0.43), rot=(0, 0, a), bev=0.012,
                name="tooth")
        if jaw:
            j = sphere(0.3, mat, loc=(0, -0.12, -0.52), scale=(0.95, 0.9, 0.42), name="jaw")
            for k in range(6):
                a = rad(-38 + k * 15.2)
                x, y = 0.28 * math.sin(a), -0.13 - 0.28 * math.cos(a)
                box((0.05, 0.05, 0.09), mat, loc=(x, y - 0.07, -0.52), rot=(0, 0, a), bev=0.012,
                    name="tooth")
        if horns:
            for side in (-1, 1):
                p0 = Vector((side * 0.32, 0.05, 0.4))
                pts = bezier(p0, p0 + Vector((side * 0.3, 0.0, 0.25)),
                             p0 + Vector((side * 0.55, 0.1, 0.1)),
                             p0 + Vector((side * 0.6, 0.15, 0.55)), 24)
                sweep(pts, lambda s: 0.1 * (1 - s) + 0.005, horn_mat or mat, segs=12,
                      name="horn")


def eye(r, iris_mat, loc=(0, 0, 0), rot=(0, 0, 0), sclera_mat=None, slit=True,
        pupil_mat=None, lid_mat=None):
    """Eye ball facing -Y."""
    sclera_mat = sclera_mat or pbr("sclera", (0.85, 0.8, 0.72), rough=0.2, coat=0.6)
    pupil_mat = pupil_mat or pbr("pupil", (0.0, 0.0, 0.0), rough=0.1, spec=1.0)
    with group(loc, rot, 1.0, name="eye"):
        sphere(r, sclera_mat, name="sclera")
        # iris cap
        lathe([(0, -r * 1.02), (r * 0.55, -r * 0.86), (r * 0.62, -r * 0.78), (0, -r * 0.78)],
              iris_mat, seg=32, rot=(rad(-90), 0, 0), name="iris")
        if slit:
            sphere(r * 0.5, pupil_mat, loc=(0, -r * 0.62, 0), scale=(0.16, 0.9, 0.95),
                   name="pupil")
        else:
            sphere(r * 0.25, pupil_mat, loc=(0, -r * 0.83, 0), scale=(1, 0.5, 1), name="pupil")
        if lid_mat:
            # almond eyelids
            torus(r * 1.05, r * 0.16, lid_mat, rot=(rad(90), 0, 0), sx=1.25, sy=0.7,
                  seg=48, rseg=10, name="lid")


def feather(L, W, mat, loc=(0, 0, 0), rot=(0, 0, 0), depth=None, name="feather"):
    """Feather outline pointing +Z from base at origin."""
    pts = []
    n = 14
    for i in range(n + 1):
        t = i / n
        w = W / 2 * (math.sin(math.pi * min(1, t * 1.05)) ** 0.7) * (1 - 0.3 * t)
        pts.append((w, t * L))
    half = [(x, z) for x, z in reversed(pts)]
    outline = [(0, L)] + [(x, z) for x, z in half[1:-1]] + [(0, 0)] + \
        [(-x, z) for x, z in pts[1:-1]]
    return extrude(outline, depth or W * 0.08, mat, loc=loc, rot=rot, bev=W * 0.03,
                   name=name, sharp=60)


def wing(side, mat, loc=(0, 0, 0), scale=1.0, rows=3, n=8, tilt=0.0, accent=None):
    """Feathered angel wing in the XZ plane. side=+1 extends to +X."""
    with group(loc, (0, 0, 0), scale, name="wing"):
        # arm: from root up/out to the wrist
        arm = bezier((0, 0, 0), (side * 0.25, 0, 0.35), (side * 0.6, 0, 0.55),
                     (side * 0.95, 0, 0.62), 40)
        for row in range(rows):
            lens = [0.95, 0.62, 0.36][row]
            ww = [0.13, 0.12, 0.11][row]
            cnt = n - row
            for i in range(cnt):
                t = (i + 0.5 * (row % 2)) / cnt
                p = arm[int(t * (len(arm) - 1))]
                # feathers hang downward, fanning outward toward the tip
                ang = rad(-180 + 20 + t * 60) if side > 0 else rad(-(20 + t * 60))
                L = lens * (0.55 + 0.65 * t)
                rot_y = -(ang - math.pi / 2)
                y = 0.02 * row + 0.003 * i
                m = accent if (accent and row == 0) else mat
                feather(L, ww * (0.8 + 0.4 * t), m, loc=(p.x, y, p.z),
                        rot=(0, rot_y if side > 0 else rot_y, 0))
        sweep(arm, lambda s: 0.05 * (1 - 0.5 * s), mat, segs=10, name="wing_arm")


def book(w, h, t, cover_mat, page_mat, trim_mat=None, spine_mat=None, corners=True,
         corner_mat=None, clasp=True, bands=True):
    """Closed book standing up; front cover faces -Y, spine on -X."""
    ct = t * 0.13     # cover thickness
    # page block
    box((w * 0.95, t - 2 * ct, h * 0.94), page_mat, loc=(w * 0.02, 0, 0), bev=0.004,
        name="pages")
    # covers
    for sgn in (-1, 1):
        box((w, ct, h), cover_mat, loc=(0, sgn * (t / 2 - ct / 2), 0), bev=ct * 0.35,
            bev_seg=3, name="cover")
    # rounded spine
    sp = cyl(t / 2, h, spine_mat or cover_mat, loc=(-w / 2, 0, 0), seg=24, name="spine")
    sp.scale = (0.45, 1, 1)
    if bands:
        for z in (-h * 0.3, 0, h * 0.3):
            torus(t / 2, ct * 0.35, trim_mat or cover_mat, loc=(-w / 2, 0, z), sx=0.5,
                  seg=24, rseg=6, name="band")
    if corners:
        cm = corner_mat or trim_mat or cover_mat
        c = w * 0.2
        for sz in (-1, 1):
            pts = [(w / 2 + x, z) for x, z in [(0.004, 0.004), (-c, 0.004), (0.004, -c)]]
            pts = [(x, sz * (h / 2) + (z if sz > 0 else -z)) for x, z in pts]
            extrude(pts, t + ct * 0.6, cm, bev=0.006, name="corner")
    if clasp:
        box((w * 0.18, t * 0.6, h * 0.12), trim_mat or cover_mat,
            loc=(w / 2 + w * 0.02, 0, 0), bev=0.008, name="clasp")


def barrel_x(x0, x1, z, r, mat, seg=24, r_end=None, muzzle=0.0, bore=True, y=0.0,
             name="barrel", sides=None):
    """Cylinder along +X from x0 to x1 at height z (gun barrels)."""
    r_end = r if r_end is None else r_end
    L = x1 - x0
    prof = [(0, 0), (r, 0), (r_end, L)]
    if muzzle:
        prof = [(0, 0), (r, 0), (r_end, L - muzzle), (r_end * 1.25, L - muzzle * 0.6),
                (r_end * 1.25, L)]
    if bore:
        prof += [(r_end * 0.55, L), (r_end * 0.55, L - 0.02), (0, L - 0.02)]
    else:
        prof += [(0, L)]
    return lathe(prof, mat, seg=sides or seg, loc=(x0, y, z), rot=(0, rad(90), 0),
                 smooth=sides is None, sharp=None if sides is None else 30, cap=False,
                 name=name)


def grip_shape(x_top, z_top, length, width, angle=18, butt=1.25, curve=0.05):
    """Pistol grip outline hanging down/back from (x_top, z_top); `curve`
    bends the lower part backwards (bird's-head / banana grips)."""
    a = rad(angle)
    d = Vector((-math.sin(a), 0, -math.cos(a)))
    side = Vector((math.cos(a), 0, -math.sin(a)))
    p0 = Vector((x_top, 0, z_top))

    def centre(t):
        return p0 + d * (length * t) - side * (curve * t * t)

    def tangent(t):
        return (d * length - side * (2 * curve * t)).normalized()

    pts = []
    n = 12
    for i in range(n + 1):  # front edge going down
        t = i / n
        tg = tangent(t)
        nr = Vector((-tg.z, 0, tg.x))
        if nr.dot(side) < 0:
            nr = -nr
        c = centre(t) + nr * (width / 2 * (1 + 0.12 * math.sin(t * math.pi)))
        pts.append((c.x, c.z))
    tg = tangent(1.0)
    nr = Vector((-tg.z, 0, tg.x))
    if nr.dot(side) < 0:
        nr = -nr
    bc = centre(1.0)
    for i in range(1, 8):
        aa = math.pi * i / 8
        v = nr * (width / 2 * butt * math.cos(aa)) + tg * (width * 0.35 * math.sin(aa))
        c = bc + v
        pts.append((c.x, c.z))
    for i in range(n, -1, -1):  # back edge going up
        t = i / n
        tg = tangent(t)
        nr = Vector((-tg.z, 0, tg.x))
        if nr.dot(side) < 0:
            nr = -nr
        c = centre(t) - nr * (width / 2 * (1 + 0.2 * math.sin(t * math.pi) + 0.2 * t))
        pts.append((c.x, c.z))
    return pts


def grip_end(x_top, z_top, length, angle, curve=0.05):
    a = rad(angle)
    d = Vector((-math.sin(a), 0, -math.cos(a)))
    side = Vector((math.cos(a), 0, -math.sin(a)))
    return Vector((x_top, 0, z_top)) + d * length - side * curve


def trigger_guard(x0, x1, z, depth, r, mat, y=0.0):
    pts = []
    for i in range(25):
        t = i / 24
        a = math.pi * t
        x = x0 + (x1 - x0) * (0.5 - 0.5 * math.cos(a))
        zz = z - depth * math.sin(a) * (1 - 0.25 * t)
        pts.append((x, y, zz))
    sweep(pts, r, mat, segs=10, name="tguard")
    # trigger
    sweep(bezier((x0 + (x1 - x0) * 0.55, y, z), (x0 + (x1 - x0) * 0.5, y, z - depth * 0.4),
                 (x0 + (x1 - x0) * 0.36, y, z - depth * 0.55), (x0 + (x1 - x0) * 0.3, y, z - depth * 0.6), 12),
          lambda s: r * (1.2 - 0.5 * s), mat, segs=8, name="trigger")


def cross_emblem(size, mat, loc, depth=0.02, rot=(0, 0, 0), flare=0.0, bev=0.004):
    pts = shape_cross(size * 0.62, size, size * 0.2, size * 0.66, flare=flare)
    pts = [(x, z - size / 2) for x, z in pts]
    return extrude(pts, depth, mat, loc=loc, rot=rot, bev=bev, name="cross")


def sawtooth(t, n, amp):
    """0..1 triangular wave used for serrated blade edges."""
    f = (t * n) % 1.0
    return amp * (1 - f)


def smooth_profile(pts, n=6):
    """Catmull-Rom smooth a (r, z) profile."""
    P = catmull([(r, 0, z) for r, z in pts], n)
    return [(max(p.x, 0.0), p.z) for p in P]


def thick_polyline(pts, w, w_end=None, cap="round", n_cap=6):
    """Closed outline around an open 2D polyline (x, z) with width w
    (linearly tapering to w_end).  Used for guards, prongs, frames."""
    w_end = w if w_end is None else w_end
    P = [Vector((x, z)) for x, z in pts]
    n = len(P)
    left, right = [], []
    for i in range(n):
        a = P[max(i - 1, 0)]
        b = P[min(i + 1, n - 1)]
        d = (b - a).normalized()
        nrm = Vector((-d.y, d.x))
        ww = (w + (w_end - w) * i / max(n - 1, 1)) / 2
        left.append(P[i] + nrm * ww)
        right.append(P[i] - nrm * ww)
    out = [tuple(p) for p in left]
    if cap == "round":
        d = (P[-1] - P[-2]).normalized()
        nrm = Vector((-d.y, d.x))
        ww = w_end / 2
        for k in range(1, n_cap):
            a = math.pi * k / n_cap
            v = nrm * math.cos(a) * ww + d * math.sin(a) * ww
            out.append(tuple(P[-1] + v))
    out += [tuple(p) for p in reversed(right)]
    if cap == "round":
        d = (P[0] - P[1]).normalized()
        nrm = Vector((-d.y, d.x))
        ww = w / 2
        for k in range(1, n_cap):
            a = math.pi * k / n_cap
            v = nrm * math.cos(a) * ww + d * math.sin(a) * ww
            out.append(tuple(P[0] + v))
    return out


# =============================================================================
#  WHIPS
# =============================================================================
def whip_handle(body_mat, cap_mat, length=0.46, r=0.036, wrap_mat=None, knot_mat=None,
                ferrule_mat=None, knob="knob"):
    """Handle along +Z from 0 to length; returns top point."""
    prof = [(0, 0.0), (r * 1.05, 0.0)]
    for i in range(1, 13):
        t = i / 12
        prof.append((r * (1.05 - 0.18 * t), t * length))
    prof.append((0, length))
    lathe(prof, body_mat, seg=24, name="whip_handle")
    if wrap_mat:
        grip(length * 0.1, length * 0.78, r * 1.06, wrap_mat, wraps=11, depth=0.16,
             name="whip_wrap")
    fm = ferrule_mat or cap_mat
    lathe([(0, length * 0.76), (r * 1.1, length * 0.76), (r * 1.2, length * 0.8),
           (r * 1.2, length * 0.84), (r * 1.0, length * 0.86), (0, length * 0.86)], fm, seg=24,
          name="ferrule")
    if knob == "knob":
        lathe([(0, -0.07), (r * 0.7, -0.07), (r * 1.55, -0.05), (r * 1.7, -0.025),
               (r * 1.35, 0.0), (r * 1.1, 0.02), (0, 0.02)], cap_mat, seg=24, name="whip_knob")
    # knot where the lash begins
    km = knot_mat or wrap_mat or body_mat
    lathe(smooth_profile([(0, length - 0.01), (r * 0.95, length - 0.005), (r * 1.15, length + 0.04),
                          (r * 0.85, length + 0.09), (r * 0.55, length + 0.12)], 4)
          + [(0, length + 0.12)], km, seg=20, name="knot")
    return Vector((0, 0, length + 0.1))


def coil_path(start, turns=2.2, R=0.30, center=(0.36, 0.0, 0.78), drift=(0.16, 0.05, -0.02),
              n=260, shrink=0.12, wobble=0.06):
    """Path from the handle top swinging into a coil of loops."""
    pts = []
    c0 = Vector(center)
    d = Vector(drift)
    for i in range(n + 1):
        t = i / n
        a = math.pi * 1.05 + TAU * turns * t
        c = c0 + d * (t * turns)
        rr = R * (1 - shrink * t)
        pts.append(c + Vector((rr * math.cos(a), wobble * math.sin(a * 0.5), rr * math.sin(a))))
    lead = bezier(start, Vector(start) + Vector((0, 0, 0.16)),
                  pts[0] + Vector((-0.08, 0, -0.12)), pts[0], 24)[:-1]
    return lead + pts


def braid_radial(pitch=0.045, amp=0.14):
    k = TAU / pitch

    def f(s, th, L):
        a = math.sin(L * k + 2 * th)
        b = math.sin(L * k - 2 * th)
        return 1 + amp * (max(a, b) ** 3)
    return f


def lash_with_tail(path, drop=(0.16, -0.55)):
    end = path[-1]
    tail = bezier(end, end + Vector((0.15, 0, -0.1)), end + Vector((0.25, 0, -0.35)),
                  end + Vector((drop[0], 0, drop[1])), 40)[1:]
    return resample(path + tail, 0.006)


def cracker(tip, mat, n=3, L=0.11):
    for k in range(n):
        a = -0.35 + 0.35 * k
        sweep(bezier(tip, tip + Vector((0.01 * k, 0, -L * 0.3)),
                     tip + Vector((0.02 + a * 0.05, 0, -L * 0.65)),
                     tip + Vector((a * L * 0.8, 0, -L)), 10),
              lambda s: 0.006 * (1 - 0.8 * s), mat, segs=6, name="cracker")


@item("whip_1")
def whip_1():
    """Leather whip: coiled braided leather, wooden handle."""
    wood = M_wood((0.40, 0.22, 0.10))
    leather = pbr("whip_leather", (0.45, 0.24, 0.11), rough=0.5, coat=0.2,
                  pattern="braid", pattern_args=dict(freq=22.0, strands=2.0))
    wrap = pbr("wrap_leather", (0.30, 0.15, 0.07), rough=0.55, coat=0.2,
               pattern="braid", pattern_args=dict(freq=30.0, strands=3.0))
    with group((0, 0, 0), (0, rad(-8), 0)):
        top = whip_handle(wood, M_iron(), wrap_mat=None, knot_mat=wrap)
    path = coil_path((top.x - 0.015, 0, top.z - 0.01), turns=2.2)
    path = lash_with_tail(path)
    sweep(path, lambda s: 0.034 * (1 - 0.75 * s) + 0.004, leather, segs=14,
          radial=braid_radial(0.05, 0.12), uv=True, name="lash")
    cracker(path[-1], M_cloth((0.78, 0.7, 0.55), "cracker"))
    view(diag=0)


@item("whip_2")
def whip_2():
    """Chain whip: steel links on a leather-wrapped steel handle."""
    steel = M_steel()
    wrap = M_leather((0.08, 0.055, 0.045), "wrap_black")
    whip_handle(M_darkiron(), steel, wrap_mat=wrap, ferrule_mat=steel, knot_mat=steel,
                length=0.46, r=0.036)
    # guard ring at the top
    torus(0.055, 0.014, steel, loc=(0, 0, 0.47), seg=32, rseg=8, name="guard_ring")
    pts = catmull([(0, 0, 0.56), (0.04, 0, 0.8), (0.24, 0.02, 0.98), (0.48, 0, 0.9),
                   (0.6, -0.02, 0.66), (0.78, 0, 0.52), (0.98, 0.02, 0.62), (1.06, 0, 0.86),
                   (1.02, 0, 1.08)], 16)
    chain(pts, steel, link_len=0.085, wire=0.0125)
    # pointed weight at the end
    end, prev = pts[-1], pts[-4]
    d = (end - prev).normalized()
    with group(end + d * 0.05, d.to_track_quat("Z", "Y").to_euler(), 1.0):
        torus(0.025, 0.009, steel, rot=(rad(90), 0, 0), seg=20, rseg=6, name="eyelet")
        lathe([(0, 0.02), (0.035, 0.05), (0.045, 0.1), (0.03, 0.16), (0, 0.24)], steel,
              seg=6, smooth=False, name="dart")
    view(diag=0, yaw=0)


@item("whip_3")
def whip_3():
    """Thorned vine whip with a silver-bound gnarled handle."""
    bark = pbr("bark", (0.24, 0.16, 0.09), rough=0.8, bump=0.6, bump_scale=18)
    vine = pbr("vine", (0.16, 0.26, 0.08), rough=0.55, bump=0.35, bump_scale=35, coat=0.2)
    thorn = pbr("thorn", (0.35, 0.08, 0.05), rough=0.35, coat=0.4)
    leaf = pbr("leaf", (0.12, 0.34, 0.08), rough=0.45, sss=0.2, coat=0.3)
    silver = M_silver()
    # gnarled handle
    hp = [(0, 0, 0), (0.01, 0, 0.15), (-0.01, 0, 0.3), (0.0, 0, 0.46)]
    sweep(catmull(hp, 10), lambda s: 0.042 - 0.006 * s, bark, segs=16,
          radial=lambda s, th, L: 1 + 0.12 * math.sin(3 * th + L * 30), name="handle")
    for z in (0.02, 0.44):
        torus(0.045, 0.011, silver, loc=(0, 0, z), seg=28, rseg=8, name="band")
    sphere(0.05, silver, loc=(0, 0, -0.02), scale=(1, 1, 0.8), name="knob")
    # the vine
    main = catmull([(0, 0, 0.46), (0.02, 0, 0.72), (0.22, 0.02, 0.98), (0.52, 0, 1.02),
                    (0.72, -0.02, 0.84), (0.66, 0, 0.62), (0.44, 0.02, 0.62),
                    (0.46, 0, 0.78), (0.6, 0, 0.8)], 18)
    main = resample(main, 0.008)
    T, N, B = frame_path(main)
    for ph in (0.0, math.pi):
        strand = []
        for i, p in enumerate(main):
            s = i / (len(main) - 1)
            a = ph + i * 0.16
            rr = 0.014 * (1 - 0.6 * s)
            strand.append(p + (N[i] * math.cos(a) + B[i] * math.sin(a)) * rr)
        sweep(strand, lambda s: 0.017 * (1 - 0.7 * s) + 0.003, vine, segs=10, name="strand")
    # thorns
    pts, nrms = [], []
    for i in range(6, len(main) - 3, 7):
        k = (i // 7)
        a = k * 2.1
        n = (N[i] * math.cos(a) + B[i] * math.sin(a)).normalized()
        # rake thorns slightly backward toward the handle
        n = (n - T[i] * 0.35).normalized()
        s = i / len(main)
        pts.append(main[i] + n * 0.012 * (1 - 0.6 * s))
        nrms.append(n)
    spikes_on_points(pts, nrms, 0.055, 0.012, thorn, name="thorn")
    # leaves
    for i, a in ((40, 0.4), (95, 2.5), (150, 4.0)):
        if i >= len(main):
            continue
        n = (N[i] * math.cos(a) + B[i] * math.sin(a)).normalized()
        q = n.to_track_quat("Z", "Y").to_euler()
        feather(0.12, 0.06, leaf, loc=main[i], rot=q, name="leaf")
    view(diag=0)


@item("whip_4")
def whip_4():
    """Morning-star whip: chain flail ending in a spiked ball, runic handle."""
    steel = pbr("dsteel", (0.42, 0.44, 0.48), metal=1, rough=0.3, noise_rough=0.1)
    iron = M_darkiron()
    rune = M_glow((0.25, 0.6, 1.0), "rune_blue", 10)
    wrap = M_leather((0.06, 0.08, 0.16), "wrap_blue")
    whip_handle(steel, steel, wrap_mat=wrap, ferrule_mat=steel, knot_mat=steel, length=0.5)
    torus(0.05, 0.008, rune, loc=(0, 0, 0.44), seg=28, rseg=6, name="rune_ring")
    torus(0.05, 0.008, rune, loc=(0, 0, 0.1), seg=28, rseg=6, name="rune_ring")
    pts = catmull([(0, 0, 0.6), (0.03, 0, 0.84), (0.22, 0.02, 1.0), (0.46, 0, 0.98),
                   (0.62, 0, 0.84), (0.7, 0, 0.66)], 16)
    chain(pts, steel, link_len=0.09, wire=0.014)
    c = pts[-1] + Vector((0.02, 0, -0.16))
    torus(0.03, 0.01, steel, loc=pts[-1] + Vector((0, 0, -0.03)), rot=(0, rad(90), 0), seg=20,
          rseg=6, name="ring")
    spiked_ball(0.15, 0.12, iron, steel, loc=c)
    # glowing rune band around the ball
    torus(0.152, 0.01, rune, loc=c, rot=(rad(70), rad(20), 0), seg=48, rseg=6, name="ball_rune")
    view(diag=0)


@item("whip_5")
def whip_5():
    """Holy golden whip: gold braided lash, cross-shaped handle."""
    gold = M_gold()
    lash = pbr("holy_lash", (1.0, 0.74, 0.34), metal=0.85, rough=0.28, coat=0.3,
               pattern="braid", pattern_args=dict(freq=22.0, strands=2.0,
                                                  dark=(0.42, 0.25, 0.08)))
    white = M_leather((0.9, 0.87, 0.8), "white_leather")
    holy = M_gem((0.8, 0.9, 1.0), "holy_gem", 2.0)
    with group((0, 0, 0), (0, rad(-8), 0)):
        top = whip_handle(gold, gold, wrap_mat=white, ferrule_mat=gold, knot_mat=gold,
                          length=0.5, r=0.037)
        # cross guard making the handle a cross
        cross = shape_cross(0.44, 0.36, 0.075, 0.23, flare=0.03)
        extrude([(x, z + 0.4) for x, z in cross], 0.06, gold, bev=0.012, name="cross")
        gem(0.042, holy, loc=(0, -0.035, 0.63), seg=10, name="cross_gem")
        for sx in (-0.22, 0.22):
            sphere(0.028, gold, loc=(sx, 0, 0.63), name="knob")
        sphere(0.028, gold, loc=(0, 0, 0.77), name="knob")
    path = coil_path((top.x + 0.07, 0, top.z + 0.02), turns=2.0, center=(0.42, 0, 0.86))
    path = lash_with_tail(path, drop=(0.2, -0.5))
    sweep(path, lambda s: 0.034 * (1 - 0.72 * s) + 0.004, lash, segs=14,
          radial=braid_radial(0.05, 0.12), uv=True, name="lash")
    for i in (30, 60):
        p = path[i]
        d = (path[i + 1] - path[i - 1]).normalized()
        torus(0.04, 0.009, gold, loc=p, rot=d.to_track_quat("Z", "Y").to_euler(), seg=24,
              rseg=6, name="lash_ring")
    tip = path[-1]
    sphere(0.02, M_glow((1.0, 0.9, 0.6), "holy_spark", 12), loc=tip, name="spark")
    view(diag=0)


@item("whip_6")
def whip_6():
    """Crimson blood whip: glowing vertebra segments, skull pommel."""
    black = M_blackmetal()
    seg_mat = pbr("blood_seg", (0.22, 0.01, 0.02), metal=0.6, rough=0.22, coat=0.8,
                  emit=(1.0, 0.03, 0.02), emit_str=0.12, glow_str=0.18)
    core = M_glow((1.0, 0.08, 0.04), "blood_core", 12)
    veins = pbr("black_veins", (0.05, 0.04, 0.05), metal=1, rough=0.3, pattern="veins",
                pattern_args=dict(color=(1.0, 0.05, 0.03), strength=10, density=5, width=0.06))
    bone = M_bone()
    eye_m = M_glow((1.0, 0.1, 0.05), "skull_eye", 18)
    # handle
    lathe([(0, 0.0), (0.04, 0.0), (0.036, 0.25), (0.032, 0.42), (0, 0.42)], veins, seg=24,
          name="handle")
    for z in (0.02, 0.4):
        torus(0.042, 0.012, black, loc=(0, 0, z), seg=24, rseg=6, name="band")
    # spiked guard
    spikes_on_points([(0.03 * math.cos(a), 0.03 * math.sin(a), 0.42) for a in
                      (0, math.pi / 2, math.pi, 3 * math.pi / 2)],
                     [(math.cos(a), math.sin(a), 0.6) for a in (0, math.pi / 2, math.pi, 3 * math.pi / 2)],
                     0.07, 0.014, black, name="guard_spike")
    skull(bone, loc=(0, 0, -0.13), rot=(0, 0, 0), scale=0.22, eye_mat=eye_m)
    # vertebra lash
    pts = catmull([(0, 0, 0.44), (0.02, 0, 0.7), (0.2, 0.02, 0.95), (0.5, 0, 1.0),
                   (0.72, 0, 0.82), (0.7, 0, 0.56), (0.5, 0, 0.5), (0.42, 0, 0.66),
                   (0.54, 0, 0.74)], 18)
    pts = resample(pts, 0.004)
    step = 0.06
    seg_pts = resample(pts, step)
    sp_p, sp_n = [], []
    for i in range(len(seg_pts) - 1):
        a, b = seg_pts[i], seg_pts[i + 1]
        c = (a + b) / 2
        t = (b - a).normalized()
        s = i / len(seg_pts)
        sc = 1.0 - 0.55 * s
        q = t.to_track_quat("Z", "Y")
        sphere(0.04 * sc, seg_mat, loc=c, rot=q.to_euler(), scale=(1.0, 1.0, 0.8 * step / (0.08 * sc)),
               seg=16, rings=10, name="vert")
        torus(0.03 * sc, 0.012 * sc, black, loc=a, rot=q.to_euler(), seg=16, rseg=6, name="joint")
        side = Vector((0, -1, 0)).cross(t).normalized()
        for sg in (-1, 1):
            sp_p.append(c + side * sg * 0.03 * sc)
            sp_n.append((side * sg + t * -0.6).normalized())
    spikes_on_points(sp_p, sp_n, 0.05, 0.012, black, name="vspike")
    view(diag=0, glow=0.9)


# =============================================================================
#  SWORD PARTS
# =============================================================================
def guard_bar(half_w, h, droop=0.0, end_r=None, n=24):
    """Crossguard outline: bar whose ends bend by `droop` (negative = toward
    the blade). Top edge at z=0 (blade side) going down to z=-h."""
    end_r = end_r or h * 0.7
    top, bot = [], []
    for i in range(n + 1):
        t = i / n
        x = -half_w + 2 * half_w * t
        d = droop * (abs(2 * t - 1) ** 2.2)
        top.append((x, -d))
        bot.append((x, -h - d))
    zc = -h / 2 - droop
    pts = top + arc(half_w, zc, end_r, math.pi / 2, -math.pi / 2, 8)[1:-1] \
        + list(reversed(bot)) + arc(-half_w, zc, end_r, -math.pi / 2, -3 * math.pi / 2, 8)[1:-1]
    return pts


def pommel(kind, z, r, mat, grip_r, sy=0.6):
    """Pommel hanging below z."""
    if kind == "disc":
        lathe([(0, z - r * 1.25), (r * 0.55, z - r * 1.2), (r, z - r * 0.75),
               (r * 1.02, z - r * 0.5), (r * 0.55, z - r * 0.05), (grip_r * 0.9, z + 0.004),
               (0, z + 0.004)], mat, seg=28, sy=sy, name="pommel")
        return z - r * 1.25
    if kind == "ball":
        sphere(r, mat, loc=(0, 0, z - r * 0.85), name="pommel")
        return z - r * 1.85
    if kind == "pear":
        lathe(smooth_profile([(0, z - r * 2.0), (r * 0.55, z - r * 1.9), (r, z - r * 1.25),
                              (r * 0.75, z - r * 0.45), (grip_r, z + 0.004), (0, z + 0.004)], 4),
              mat, seg=28, name="pommel")
        return z - r * 2.0
    if kind == "wheel":
        cyl(r, r * 0.55, mat, loc=(0, 0, z - r), rot=(rad(90), 0, 0), seg=32, bev=r * 0.12,
            name="pommel")
        cyl(r * 0.55, r * 0.75, mat, loc=(0, 0, z - r), rot=(rad(90), 0, 0), seg=24,
            bev=r * 0.08, name="pommel_boss")
        cyl(grip_r * 1.1, r * 0.3, mat, loc=(0, 0, z - 0.01), seg=16, name="neck")
        return z - 2 * r
    if kind == "spike":
        lathe([(0, z - r * 2.6), (r * 0.5, z - r * 1.2), (r * 0.9, z - r * 0.6),
               (grip_r, z + 0.004), (0, z + 0.004)], mat, seg=6, smooth=False, name="pommel")
        return z - r * 2.6
    raise ValueError(kind)


def sword_assembly(blade_len, blade_fn, blade_mat, edge_mat, guard_pts, guard_mat,
                   grip_len, grip_r, grip_mat, pommel_kind, pommel_mat, pommel_r=None,
                   cross="fuller", guard_depth=0.05, wraps=9, n=48, guard_bev=0.008):
    """Blade from z=0 upward, guard outline top at z=0, grip/pommel below.
    Returns (guard_bottom_z, pommel_bottom_z)."""
    blade(blade_len, blade_fn, blade_mat, edge_mat, cross=cross, n=n)
    extrude(guard_pts, guard_depth, guard_mat, bev=guard_bev, name="guard")
    gz = min(p[1] for p in guard_pts)
    gz = max(gz, -0.06)
    grip(gz - grip_len, gz + 0.005, grip_r, grip_mat, wraps=wraps, name="grip")
    pb = pommel(pommel_kind, gz - grip_len, pommel_r or grip_r * 1.9, pommel_mat, grip_r)
    return gz, pb


# =============================================================================
#  SWORDS
# =============================================================================
@item("sword_1")
def sword_1():
    """Iron longsword: plain fullered blade, straight bar guard, leather grip."""
    iron = M_iron()
    edge = pbr("iron_edge", (0.46, 0.45, 0.44), metal=1, rough=0.3)
    sword_assembly(1.0, std_blade(0.1, fuller=0.5, thick=0.016), iron, edge,
                   guard_bar(0.17, 0.035), M_darkiron(), 0.24, 0.021,
                   M_leather((0.30, 0.16, 0.07)), "disc", M_darkiron(), 0.042)
    view(diag=45, yaw=-25)


@item("sword_2")
def sword_2():
    """Steel arming sword: bright blade, upswept quillons, wire-bound grip."""
    steel = M_steel()
    edge = pbr("steel_edge", (0.85, 0.87, 0.9), metal=1, rough=0.12)
    brass = M_brass()
    sword_assembly(1.02, std_blade(0.11, fuller=0.55, thick=0.017, taper=0.32), steel, edge,
                   guard_bar(0.2, 0.038, droop=-0.05, end_r=0.03), steel, 0.25, 0.022,
                   M_leather((0.12, 0.07, 0.05), "leather_dark"), "pear", steel, 0.04)
    for z in (-0.06, -0.3):
        torus(0.024, 0.006, brass, loc=(0, 0, z), seg=24, rseg=6, name="ferrule")
    # small langet
    extrude([(-0.025, 0), (0.025, 0), (0.0, 0.07)], 0.03, steel, bev=0.004, name="langet")
    view(diag=45, yaw=-25)


@item("sword_3")
def sword_3():
    """Silver rapier with a swept hilt."""
    silver = M_silver()
    blade_m = pbr("rapier_steel", (0.82, 0.84, 0.88), metal=1, rough=0.16)
    edge = pbr("rapier_edge", (0.95, 0.96, 0.98), metal=1, rough=0.08)
    blade(1.2, std_blade(0.05, tip=0.12, taper=0.45, thick=0.013, tip_pow=0.9),
          blade_m, edge, cross="hex", n=48)
    # ricasso block
    box((0.05, 0.024, 0.07), blade_m, loc=(0, 0, 0.02), bev=0.006, name="ricasso")
    r = 0.012
    # straight quillons with curled ends
    q = catmull([(-0.22, 0, 0.04), (-0.18, 0, 0.0), (0.0, 0, -0.01), (0.18, 0, 0.0),
                 (0.22, 0, -0.04)], 10)
    sweep(q, r, silver, segs=10, name="quillon")
    for p in (q[0], q[-1]):
        sphere(0.022, silver, loc=p, name="quillon_end")
    # knuckle bow from quillon to pommel
    bow = catmull([(0.12, 0, -0.005), (0.15, -0.01, -0.1), (0.12, -0.01, -0.22),
                   (0.03, 0, -0.29)], 12)
    sweep(bow, r, silver, segs=10, name="bow")
    # swept branches
    for off in (0.05, 0.09):
        br = catmull([(0.02, 0, -0.01), (0.07 + off * 0.4, -0.03, -0.06 - off * 0.5),
                      (0.13, -0.01, -0.1 - off * 0.4)], 10)
        sweep(br, r * 0.85, silver, segs=8, name="branch")
    # pas d'ane rings over the ricasso & side ring
    torus(0.05, r * 0.85, silver, loc=(0, 0, 0.035), rot=(0, 0, 0), sx=1.0, sy=0.45, seg=32,
          rseg=8, name="ring")
    torus(0.07, r * 0.85, silver, loc=(0.0, -0.05, -0.02), rot=(rad(75), 0, 0), seg=32, rseg=8,
          name="side_ring")
    grip(-0.27, -0.005, 0.019, pbr("wire_black", (0.05, 0.05, 0.06), metal=0.8, rough=0.3),
         wraps=16, depth=0.18, name="grip")
    lathe(smooth_profile([(0, -0.37), (0.02, -0.365), (0.036, -0.33), (0.032, -0.295),
                          (0.02, -0.27), (0, -0.27)], 4), silver, seg=28, name="pommel")
    gem(0.016, M_gem((0.15, 0.35, 1.0), "sapph_small", 1.0), loc=(0, -0.034, -0.325), seg=8)
    view(diag=45, yaw=-25)


@item("sword_4")
def sword_4():
    """Rune blade: dark steel with glowing blue runes, winged guard, crystal."""
    dsteel = pbr("rune_steel", (0.17, 0.2, 0.27), metal=1, rough=0.3, noise_rough=0.08)
    edge = pbr("rune_edge", (0.78, 0.84, 0.92), metal=1, rough=0.1)
    rune = M_glow((0.25, 0.65, 1.0), "rune_blue", 12)
    crystal_m = M_gem((0.2, 0.55, 1.0), "blue_crystal", 2.5)
    darkm = pbr("guard_dsteel", (0.16, 0.18, 0.24), metal=1, rough=0.3)
    silver = M_silver()
    L = 1.04
    blade(L, std_blade(0.13, fuller=0.55, thick=0.017, taper=0.3, fuller_end=0.78), dsteel, edge,
          cross="fuller", n=56)
    runes(0.0, 0.1, 0.8, -0.011, 0.055, rune, seed=11, gap=0.25)
    # winged guard
    half = [(0.0, 0.05), (0.06, 0.03), (0.14, 0.06), (0.24, 0.12), (0.2, 0.05), (0.26, 0.04),
            (0.18, -0.01), (0.1, -0.04), (0.04, -0.05), (0.0, -0.06)]
    extrude(mirror_x(half), 0.055, darkm, bev=0.01, name="guard")
    for sx in (-1, 1):
        extrude([(sx * x, z) for x, z in [(0.06, 0.035), (0.14, 0.065), (0.2, 0.1), (0.12, 0.035)]],
                0.058, silver, bev=0.004, name="guard_trim")
    gem(0.034, crystal_m, loc=(0, -0.03, 0.0), seg=8, name="guard_gem")
    grip(-0.26, -0.05, 0.022, pbr("wrap_navy", (0.05, 0.07, 0.14), rough=0.5, coat=0.2),
         wraps=9, name="grip")
    torus(0.025, 0.006, rune, loc=(0, 0, -0.155), seg=24, rseg=6, name="grip_rune")
    lathe([(0, -0.26), (0.03, -0.26), (0.036, -0.28), (0, -0.29)], darkm, seg=24, name="pcap")
    crystal(0.03, 0.14, crystal_m, loc=(0, 0, -0.41), sides=6, tip=0.3, base_tip=0.3,
            name="pommel_crystal")
    view(diag=45, yaw=-25, glow=1.0)


@item("sword_5")
def sword_5():
    """Holy claymore: great silver blade with a radiant core, gold hilt."""
    silver = M_silver()
    edge = pbr("holy_edge", (1.0, 0.98, 0.95), metal=1, rough=0.06)
    gold = M_gold()
    light = M_glow((1.0, 0.8, 0.4), "holy_light", 4.0, base=(1.0, 0.85, 0.5))
    L = 1.12
    blade(L, std_blade(0.15, fuller=0.5, thick=0.02, taper=0.28, tip=0.15, fuller_end=0.72),
          silver, edge, cross="fuller", n=56)
    # radiant inlay in the fuller
    blade(L * 0.7, lambda t: (0.02 * (1 - 0.4 * t) * (min(1, (1 - t) / 0.2) ** 0.8), 0.0, 0.004, 0),
          light, cross="diamond", z0=0.06, n=24, name="inlay").location.y = -0.01
    # gold ricasso sleeve
    extrude([(-0.06, 0.0), (0.06, 0.0), (0.045, 0.1), (0.0, 0.14), (-0.045, 0.1)], 0.045, gold,
            bev=0.006, name="sleeve")
    # forward-swept quillons with quatrefoil ends
    arm = [(0.0, -0.02), (0.1, 0.0), (0.2, 0.06), (0.27, 0.13)]
    for sx in (-1, 1):
        extrude(thick_polyline([(sx * x, z) for x, z in arm], 0.05, 0.035), 0.05, gold,
                bev=0.008, name="quillon")
        cx, cz = sx * 0.27, 0.13
        for a in range(4):
            aa = a * math.pi / 2 + math.pi / 4
            sphere(0.02, gold, loc=(cx + 0.022 * math.cos(aa), 0, cz + 0.022 * math.sin(aa)),
                   name="qf")
        sphere(0.014, light, loc=(cx, -0.018, cz), name="qf_c")
    lathe(smooth_profile([(0, -0.07), (0.05, -0.06), (0.065, -0.02), (0.045, 0.02), (0, 0.03)], 3),
          gold, seg=32, sy=0.6, name="guard_boss")
    gem(0.035, M_gem((0.85, 0.92, 1.0), "diamond", 1.6), loc=(0, -0.04, -0.02), seg=12)
    grip(-0.36, -0.06, 0.026, pbr("wrap_white", (0.92, 0.89, 0.82), rough=0.5, coat=0.2),
         wraps=11, name="grip")
    for z in (-0.07, -0.21, -0.35):
        torus(0.028, 0.007, gold, loc=(0, 0, z), seg=24, rseg=6, name="band")
    zb = pommel("wheel", -0.36, 0.05, gold, 0.026)
    cross_emblem(0.06, light, (0, -0.032, -0.41), depth=0.01)
    view(diag=45, yaw=-25, glow=0.9)


@item("sword_6")
def sword_6():
    """Dark crystal demon sword: jagged violet crystal blade, winged black
    hilt with a demon eye."""
    crys = pbr("demon_crystal", (0.16, 0.03, 0.32), rough=0.05, trans=0.45, ior=1.6, spec=1.0,
               emit=(0.4, 0.05, 1.0), emit_str=0.2, glow_str=0.3)
    core = M_glow((0.6, 0.2, 1.0), "demon_core", 6)
    black = M_blackmetal()
    edge = pbr("crys_edge", (0.4, 0.15, 0.8), rough=0.02, trans=0.3, spec=1.0,
               emit=(0.5, 0.15, 1.0), emit_str=0.7, glow_str=0.6)

    def fn(t):
        w = 0.075 * (1 + 0.35 * math.sin(t * math.pi * 0.9))
        w += sawtooth(t, 6, 0.028) * (1 - t)
        if t > 0.82:
            w *= ((1 - t) / 0.18) ** 0.9
        return w, 0.012 * math.sin(t * 7), 0.02 * (1 - 0.5 * t), 0
    blade(1.08, fn, crys, edge, cross="lens", n=72)
    blade(0.9, lambda t: (0.018 * (1 - t) ** 0.6, 0.0, 0.006, 0), core, cross="diamond",
          z0=0.05, n=20, name="core")
    # demon-wing guard
    half = [(0.0, 0.04), (0.05, 0.03), (0.1, 0.07), (0.16, 0.16), (0.2, 0.26), (0.19, 0.12),
            (0.26, 0.14), (0.22, 0.05), (0.3, 0.02), (0.2, -0.03), (0.1, -0.05), (0.0, -0.07)]
    extrude(mirror_x(half), 0.06, black, bev=0.008, name="guard")
    eye(0.034, M_glow((1.0, 0.15, 0.05), "demon_iris", 8), loc=(0, -0.03, -0.01),
        lid_mat=black)
    grip(-0.26, -0.06, 0.022, pbr("wrap_violet", (0.12, 0.03, 0.14), rough=0.45, coat=0.3),
         wraps=9, name="grip")
    for side in (-1, 1):
        cone(0.014, 0.07, black, loc=(side * 0.02, 0, -0.1), rot=(0, side * rad(110), 0),
             name="grip_spike")
    pommel("spike", -0.26, 0.035, black, 0.022)
    crystal(0.02, 0.07, crys, loc=(0, -0.0, -0.33), sides=5, name="pommel_gem")
    view(diag=45, yaw=-25, glow=1.0)


# =============================================================================
#  GREAT WEAPONS
# =============================================================================
def fan_blade(inner, edge, th0, mat, edge_mat=None, nu=14, concave=0.35, th_edge=0.002,
              edge_frac=0.2, name="axe_bit"):
    """Axe-like bit: a surface interpolated from the `inner` polyline (at the
    haft) to the `edge` polyline (cutting edge), both lists of (x, z) with the
    same count, thinning toward the edge.  Front faces -Y."""
    nv = len(inner)
    zmid = (inner[0][1] + inner[-1][1]) / 2
    grid = []
    for iu in range(nu + 1):
        u = iu / nu
        row = []
        for iv in range(nv):
            x = inner[iv][0] + (edge[iv][0] - inner[iv][0]) * u
            z = inner[iv][1] + (edge[iv][1] - inner[iv][1]) * u
            z += (zmid - z) * concave * math.sin(math.pi * u) * abs(2 * iv / (nv - 1) - 1)
            if u < 1 - edge_frac:
                th = th0 * (1 - 0.35 * u / (1 - edge_frac))
            else:
                k = (u - (1 - edge_frac)) / edge_frac
                th = th0 * 0.65 * (1 - k) + th_edge * k
            row.append((x, th, z))
        grid.append(row)
    verts, faces, fm = [], [], []
    for sgn in (-1, 1):
        for row in grid:
            for (x, th, z) in row:
                verts.append((x, sgn * th, z))
    off = (nu + 1) * nv

    def vid(side, iu, iv):
        return side * off + iu * nv + iv
    for iu in range(nu):
        is_edge = (iu / nu) >= 1 - edge_frac - 1e-6
        for iv in range(nv - 1):
            faces.append((vid(0, iu, iv), vid(0, iu + 1, iv), vid(0, iu + 1, iv + 1), vid(0, iu, iv + 1)))
            faces.append((vid(1, iu, iv), vid(1, iu, iv + 1), vid(1, iu + 1, iv + 1), vid(1, iu + 1, iv)))
            fm += [1 if (is_edge and edge_mat) else 0] * 2
    # rims: top (iv = 0), bottom (iv = nv-1), edge (iu = nu), inner (iu = 0)
    for iu in range(nu):
        for iv in (0, nv - 1):
            faces.append((vid(0, iu, iv), vid(1, iu, iv), vid(1, iu + 1, iv), vid(0, iu + 1, iv)))
            fm.append(0)
    for iv in range(nv - 1):
        for iu in (0, nu):
            faces.append((vid(0, iu, iv), vid(0, iu, iv + 1), vid(1, iu, iv + 1), vid(1, iu, iv)))
            fm.append(1 if (iu == nu and edge_mat) else 0)
    mats = [mat, edge_mat] if edge_mat else [mat]
    ob = make_mesh(name, verts, faces, mats=mats, face_mats=fm, smooth=True, sharp=30)
    me = ob.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    me.shade_smooth()
    me.set_sharp_from_angle(angle=rad(30))
    return ob


@item("greatsword_1")
def greatsword_1():
    """Iron greatsword: long broad blade, long bar guard, two-hand grip."""
    iron = M_iron()
    edge = pbr("iron_edge", (0.46, 0.45, 0.44), metal=1, rough=0.3)
    sword_assembly(1.3, std_blade(0.16, fuller=0.5, thick=0.02, taper=0.3, tip=0.14), iron, edge,
                   guard_bar(0.26, 0.045, droop=0.0), M_darkiron(), 0.42, 0.025,
                   M_leather((0.28, 0.15, 0.07)), "wheel", M_darkiron(), 0.05, wraps=13,
                   guard_depth=0.06)
    view(diag=45, yaw=-22)


@item("greatsword_2")
def greatsword_2():
    """Zweihander: steel blade with parrying hooks, leather ricasso, side
    rings and S-curled quillons."""
    steel = M_steel()
    edge = pbr("steel_edge", (0.85, 0.87, 0.9), metal=1, rough=0.12)
    leather = M_leather((0.3, 0.07, 0.05), "leather_red")
    blade(1.35, std_blade(0.13, fuller=0.5, thick=0.018, taper=0.2, tip=0.12), steel, edge,
          cross="fuller", n=56)
    # leather-wrapped ricasso
    grip(0.0, 0.2, 0.05, leather, wraps=5, depth=0.08, name="ricasso").scale = (1.0, 0.35, 1.0)
    # parrying hooks
    for sx in (-1, 1):
        pts = [(sx * 0.05, 0.2), (sx * 0.1, 0.19), (sx * 0.13, 0.22), (sx * 0.12, 0.26)]
        extrude(thick_polyline(catmull_2d(pts, 6), 0.03, 0.012), 0.03, steel, bev=0.004,
                name="hook")
    # S-curled quillons
    q = [(0.0, -0.02), (0.12, -0.02), (0.22, 0.01), (0.28, 0.07), (0.3, 0.12), (0.27, 0.15)]
    for sx in (-1, 1):
        extrude(thick_polyline(catmull_2d([(sx * x, z) for x, z in q], 6), 0.04, 0.026), 0.04,
                steel, bev=0.006, name="quillon")
    for sx in (-1, 1):
        torus(0.055, 0.011, steel, loc=(sx * 0.07, -0.035, -0.03), rot=(rad(90), 0, 0), seg=28,
              rseg=8, name="side_ring")
    box((0.1, 0.05, 0.05), steel, loc=(0, 0, -0.025), bev=0.01, name="guard_block")
    grip(-0.47, -0.05, 0.026, M_leather((0.1, 0.06, 0.04), "leather_dark"), wraps=13, name="grip")
    torus(0.028, 0.007, M_brass(), loc=(0, 0, -0.26), seg=24, rseg=6, name="band")
    pommel("pear", -0.47, 0.048, steel, 0.026)
    view(diag=45, yaw=-22)


def catmull_2d(pts, n=8):
    P = catmull([(x, 0, z) for x, z in pts], n)
    return [(p.x, p.z) for p in P]


@item("greatsword_3")
def greatsword_3():
    """Great battle axe: double-bitted silver head on a banded haft."""
    silver = pbr("axe_silver", (0.85, 0.87, 0.92), metal=1, rough=0.2, noise_rough=0.06)
    edge = pbr("axe_edge", (0.98, 0.98, 1.0), metal=1, rough=0.06)
    steel = M_steel()
    wood = M_darkwood()
    # haft
    lathe([(0, -0.95), (0.03, -0.95), (0.032, 0.72), (0, 0.74)], wood, seg=20, name="haft")
    grip(-0.85, -0.45, 0.034, M_leather((0.12, 0.06, 0.035), "leather_dark"), wraps=8, name="grip")
    for z in (-0.4, 0.2):
        torus(0.034, 0.009, steel, loc=(0, 0, z), seg=24, rseg=6, name="band")
    cone(0.034, 0.14, steel, loc=(0, 0, -0.95), rot=(math.pi, 0, 0), seg=8, name="butt_spike")
    # socket
    lathe(smooth_profile([(0, 0.28), (0.05, 0.28), (0.058, 0.4), (0.06, 0.62), (0.05, 0.72),
                          (0, 0.72)], 3), steel, seg=8, smooth=False, name="socket")
    # bits
    n = 16
    for sx in (-1, 1):
        inner = [(sx * 0.055, 0.64 - 0.2 * i / (n - 1)) for i in range(n)]
        edge_pts = []
        for i in range(n):
            a = math.pi * (0.5 - i / (n - 1)) * 0.92
            edge_pts.append((sx * (0.26 + 0.14 * math.cos(a)), 0.53 + 0.36 * math.sin(a)))
        fan_blade(inner, edge_pts, 0.026, silver, edge, nu=16, concave=0.45)
    # top spike
    blade(0.26, std_blade(0.06, tip=0.5, taper=0.2, thick=0.018), silver, edge, cross="diamond",
          z0=0.72, n=12, name="top_spike")
    # engraved rune-free trim: small gem on socket
    gem(0.022, M_gem((0.2, 0.45, 1.0), "sapph_small", 1.0), loc=(0, -0.058, 0.53), seg=8)
    view(diag=38, yaw=-18)


@item("greatsword_4")
def greatsword_4():
    """Flame blade: flamberge with glowing molten edges and a flame guard."""
    dsteel = pbr("flame_steel", (0.2, 0.17, 0.16), metal=1, rough=0.32, noise_rough=0.1)
    edge = pbr("flame_edge", (0.9, 0.35, 0.08), metal=0.6, rough=0.3,
               emit=(1.0, 0.35, 0.04), emit_str=1.6, glow_str=0.45)
    core = M_glow((1.0, 0.55, 0.12), "flame_core", 9)
    bronze = M_bronze()

    def fn(t):
        w = 0.078 * (1 - 0.25 * t) * (1 + 0.16 * math.sin(t * TAU * 5.5))
        if t > 0.86:
            w *= ((1 - t) / 0.14) ** 0.8
        return w, 0.0, 0.019 * (1 - 0.5 * t), 0.55 if t < 0.75 else 0.0
    blade(1.32, fn, dsteel, edge, cross="fuller", n=110)
    blade(1.0, lambda t: (0.01 * (1 - t) ** 0.5, 0.0, 0.004, 0), core, cross="diamond", z0=0.05,
          n=24, name="core").location.y = -0.011
    blade(1.0, lambda t: (0.01 * (1 - t) ** 0.5, 0.0, 0.004, 0), core, cross="diamond", z0=0.05,
          n=24, name="core_b").location.y = 0.011
    # flame guard
    half = [(0.0, 0.1), (0.04, 0.05), (0.08, 0.1), (0.1, 0.2), (0.13, 0.08), (0.2, 0.12),
            (0.28, 0.24), (0.27, 0.1), (0.24, 0.02), (0.14, -0.03), (0.06, -0.05), (0.0, -0.06)]
    extrude(mirror_x(half), 0.055, bronze, bev=0.008, name="guard")
    gem(0.034, M_gem((1.0, 0.35, 0.05), "fire_opal", 2.5), loc=(0, -0.03, 0.01), seg=10)
    grip(-0.44, -0.055, 0.026, M_leather((0.22, 0.06, 0.03), "leather_red"), wraps=12, name="grip")
    pommel("pear", -0.44, 0.05, bronze, 0.026)
    view(diag=45, yaw=-22, glow=1.0)


@item("greatsword_5")
def greatsword_5():
    """Dragon slayer: a huge slab of iron with a gold-armoured base and
    a dragon-eye ruby."""
    slab = pbr("slab_iron", (0.2, 0.19, 0.18), metal=1, rough=0.6, noise_rough=0.2, bump=0.5,
               bump_scale=10, grunge=0.7, grunge_scale=6)
    edge = pbr("slab_edge", (0.5, 0.5, 0.5), metal=1, rough=0.28)
    gold = M_gold()
    rune = M_glow((1.0, 0.75, 0.3), "gold_rune", 6)

    def fn(t):
        w = 0.15 * (1 - 0.1 * t)
        if t > 0.88:
            w *= ((1 - t) / 0.12) ** 0.55
        return w, 0.0, 0.035, 0
    blade(1.35, fn, slab, edge, cross="hex", n=40)
    # gold armour plate at the base of the blade
    half = [(0.0, 0.34), (0.06, 0.3), (0.15, 0.22), (0.165, 0.0), (0.0, 0.0)]
    extrude(mirror_x(half), 0.085, gold, bev=0.01, name="base_plate")
    gem(0.045, M_gem((0.95, 0.08, 0.04), "ruby", 1.2), loc=(0, -0.046, 0.14), seg=12)
    runes(0.0, 0.4, 1.05, -0.037, 0.07, rune, seed=21, gap=0.3)
    # massive guard
    box((0.46, 0.1, 0.07), gold, loc=(0, 0, -0.035), bev=0.015, name="guard")
    for sx in (-1, 1):
        sphere(0.045, gold, loc=(sx * 0.24, 0, -0.035), name="guard_end")
    grip(-0.5, -0.07, 0.032, M_leather((0.2, 0.1, 0.05)), wraps=12, name="grip")
    pommel("wheel", -0.5, 0.065, gold, 0.032)
    view(diag=45, yaw=-32, glow=0.8)


@item("greatsword_6")
def greatsword_6():
    """Demon cleaver: black single-edged slab with red veins, spine spikes,
    horned hilt."""
    black = pbr("cleaver_black", (0.04, 0.035, 0.04), metal=1, rough=0.3, pattern="veins",
                pattern_args=dict(color=(1.0, 0.05, 0.02), strength=6.0, density=2.6, width=0.03,
                                  scale=(2.5, 2.5, 2.5)))
    edge = pbr("cleaver_edge", (0.35, 0.05, 0.05), metal=1, rough=0.2,
               emit=(1.0, 0.06, 0.02), emit_str=1.2, glow_str=0.5)
    bm = M_blackmetal()
    bone = M_bone()
    S = 0.12   # spine x

    def fn(t):
        W = 0.3 * (1 + 0.18 * t)
        if t > 0.72:
            W *= max(0.02, 1 - (t - 0.72) / 0.28) ** 0.7
        w = W / 2
        return w, S - w, 0.024, 0
    blade(1.25, fn, black, edge, cross="single", n=48)
    # spine spikes
    pts, nrms = [], []
    for i in range(6):
        z = 0.2 + i * 0.15
        pts.append((S + 0.005, 0, z))
        nrms.append((1, 0, 0.5))
    spikes_on_points(pts, nrms, 0.09, 0.022, bm, name="spine_spike")
    # horned guard
    box((0.3, 0.07, 0.06), bm, loc=(0.0, 0, -0.03), bev=0.012, name="guard")
    for sx in (-1, 1):
        p0 = Vector((sx * 0.13, 0, -0.03))
        sweep(bezier(p0, p0 + Vector((sx * 0.12, 0, 0.0)), p0 + Vector((sx * 0.16, 0, 0.12)),
                     p0 + Vector((sx * 0.08, 0, 0.22)), 20), lambda s: 0.035 * (1 - s) + 0.003,
              bone, segs=12, name="horn")
    gem(0.035, M_gem((1.0, 0.06, 0.02), "blood_gem", 3.0), loc=(0, -0.04, -0.03), seg=10)
    grip(-0.46, -0.06, 0.028, M_leather((0.1, 0.03, 0.03), "leather_blood"), wraps=12, name="grip")
    pommel("spike", -0.46, 0.04, bm, 0.028)
    view(diag=45, yaw=-22, glow=1.0)


# =============================================================================
#  DAGGERS
# =============================================================================
def edges_fn(left, right, thick, fuller=None, curve=0.0):
    """Blade function from two edge curves: left(t), right(t) are x positions
    of the -X and +X edges.  curve bends the whole blade toward +X."""
    def fn(t):
        a, b = left(t), right(t)
        w = max((b - a) / 2, 1e-4)
        th = thick(t) if callable(thick) else thick * (1 - 0.5 * t)
        return w, (a + b) / 2 + curve * t * t, th, fuller(t) if fuller else 0.0
    return fn


def handle_oval(z0, z1, r, mat, sy=0.62, bulge=0.12, groove=0.0, seg=28, name="handle"):
    prof = []
    n = 16
    for i in range(n + 1):
        t = i / n
        rr = r * (1 + bulge * math.sin(t * math.pi) - groove * math.exp(-((t - 0.78) / 0.08) ** 2))
        prof.append((rr, z0 + (z1 - z0) * t))
    return lathe([(0, z0)] + prof + [(0, z1)], mat, seg=seg, sy=sy, name=name)


@item("dagger_1")
def dagger_1():
    """Hunting knife: clip-point blade, wooden handle, brass bolster."""
    steel = pbr("knife_steel", (0.5, 0.5, 0.5), metal=1, rough=0.3, noise_rough=0.1)
    edge = pbr("knife_edge", (0.8, 0.8, 0.82), metal=1, rough=0.12)
    brass = M_brass()
    wood = M_wood((0.45, 0.22, 0.1), "knife_wood")

    def spine(t):
        return 0.045 if t < 0.62 else 0.045 - 0.05 * ((t - 0.62) / 0.38) ** 1.3

    def edge_x(t):
        return -0.05 + 0.045 * (max(0, t - 0.55) / 0.45) ** 2.2
    blade(0.52, edges_fn(edge_x, lambda t: max(spine(t), edge_x(t) + 0.002), 0.014), steel, edge,
          cross="single", n=40)
    extrude([(-0.07, 0.0), (0.065, 0.0), (0.065, -0.035), (-0.075, -0.035)], 0.04, brass,
            bev=0.008, name="bolster")
    handle_oval(-0.4, -0.035, 0.034, wood, sy=0.55, groove=0.0)
    for z in (-0.12, -0.25):
        cyl(0.008, 0.05, brass, loc=(0, 0, z), rot=(rad(90), 0, 0), seg=12, name="pin")
    lathe([(0, -0.44), (0.03, -0.44), (0.037, -0.42), (0.036, -0.4), (0, -0.4)], brass, seg=24,
          sy=0.6, name="butt")
    view(diag=45, yaw=-22)


@item("dagger_2")
def dagger_2():
    """Kunai: leaf blade in blackened steel, red cord grip, ring pommel."""
    black = pbr("kunai_steel", (0.12, 0.12, 0.13), metal=1, rough=0.35, noise_rough=0.1)
    edge = pbr("kunai_edge", (0.75, 0.76, 0.8), metal=1, rough=0.12)

    def fn(t):
        w = 0.07 * math.sin(math.pi * (0.15 + 0.85 * t) ** 0.8) * (1 - t) ** 0.35
        return max(w, 0.0005), 0.0, 0.018 * (1 - 0.6 * t), 0
    blade(0.46, fn, black, edge, cross="diamond", n=40)
    grip(-0.32, 0.005, 0.02, M_cloth((0.55, 0.05, 0.05), "cord_red"), wraps=12, depth=0.2,
         name="grip")
    lathe([(0, -0.34), (0.018, -0.34), (0.018, -0.31), (0, -0.31)], black, seg=16, name="neck")
    torus(0.05, 0.011, black, loc=(0, 0, -0.39), rot=(rad(90), 0, 0), seg=32, rseg=10,
          name="ring")
    view(diag=45, yaw=-22)


@item("dagger_3")
def dagger_3():
    """Kris: wavy pamor blade, carved wooden hilt with a silver cup."""
    pamor = pbr("pamor", (0.34, 0.35, 0.38), metal=1, rough=0.36, grunge=0.5, grunge_scale=16)
    edge = pbr("kris_edge", (0.9, 0.9, 0.93), metal=1, rough=0.1)
    silver = M_silver()
    wood = M_darkwood()

    def fn(t):
        w = 0.042 * (1 - 0.35 * t)
        if t < 0.12:
            w *= 1 + 0.9 * (1 - t / 0.12)   # wide base (ganja)
        if t > 0.9:
            w *= ((1 - t) / 0.1) ** 0.8
        cx = 0.016 * math.sin(t * TAU * 3.5) * (0.4 + 0.6 * min(1, t / 0.15))
        if t < 0.12:
            cx += 0.03 * (1 - t / 0.12)
        return max(w, 0.0005), cx, 0.012 * (1 - 0.5 * t), 0
    blade(0.6, fn, pamor, edge, cross="diamond", n=90)
    # silver cup (mendak) with gems
    lathe(smooth_profile([(0, -0.03), (0.035, -0.03), (0.042, -0.015), (0.036, 0.0), (0, 0.0)], 3),
          silver, seg=28, name="cup")
    for k in range(6):
        a = TAU * k / 6
        sphere(0.008, M_gem((0.9, 0.1, 0.1), "ruby_small", 0.8),
               loc=(0.04 * math.cos(a), 0.04 * math.sin(a) * 0.9, -0.015), name="bead")
    # curved carved handle
    hp = catmull([(0, 0, -0.03), (0.0, 0, -0.14), (-0.02, 0, -0.24), (-0.07, 0, -0.3)], 10)
    sweep(hp, lambda s: 0.03 * (1 + 0.25 * math.sin(s * math.pi)) - 0.004 * s, wood, segs=18,
          radial=lambda s, th, L: 1 + 0.08 * math.sin(4 * th + L * 50), name="handle")
    sphere(0.035, silver, loc=hp[-1], scale=(1.1, 1, 0.9), name="butt")
    view(diag=45, yaw=-22)


@item("dagger_4")
def dagger_4():
    """Tanto: curved single-edge blade with a glowing blue hamon, gold-rimmed
    tsuba and diamond-wrapped hilt."""
    steel = pbr("tanto_steel", (0.55, 0.58, 0.64), metal=1, rough=0.2)
    hamon = pbr("hamon", (0.8, 0.9, 1.0), metal=0.8, rough=0.1, emit=(0.35, 0.7, 1.0),
                emit_str=1.5, glow_str=0.5)
    gold = M_gold()
    dark = M_darkiron()
    rune = M_glow((0.3, 0.7, 1.0), "rune_blue", 10)

    def left(t):
        e = -0.034
        if t > 0.8:
            e += 0.05 * ((t - 0.8) / 0.2) ** 1.6
        return e

    def right(t):
        return max(0.034 - 0.004 * t, left(t) + 0.002)
    blade(0.55, edges_fn(left, right, 0.016, curve=-0.05), steel, hamon, cross="single", n=48)
    runes(0.012, 0.06, 0.24, -0.013, 0.04, rune, seed=5, gap=0.3)
    # habaki
    box((0.08, 0.036, 0.04), gold, loc=(0.0, 0, 0.018), bev=0.006, name="habaki")
    # tsuba
    cyl(0.085, 0.018, dark, loc=(0, 0, -0.01), seg=40, bev=0.004, name="tsuba").scale = (1, 0.7, 1)
    torus(0.085, 0.007, gold, loc=(0, 0, -0.01), sy=0.7, seg=40, rseg=6, name="tsuba_rim")
    # tsuka with diamond wrap
    wrap = pbr("ito", (0.85, 0.85, 0.8), rough=0.6, pattern="braid",
               pattern_args=dict(freq=2.0, strands=7.0, dark=(0.03, 0.04, 0.09), bump=0.4))
    lathe([(0, -0.3)] + [(0.028 * (1 + 0.06 * math.sin(t * math.pi)), -0.3 + 0.28 * t)
                          for t in [i / 12 for i in range(13)]] + [(0, -0.02)],
          wrap, seg=32, sy=0.7, uv=True, name="tsuka")
    lathe([(0, -0.33), (0.026, -0.33), (0.03, -0.31), (0.03, -0.295), (0, -0.295)], dark, seg=24,
          sy=0.7, name="kashira")
    view(diag=45, yaw=-22, glow=0.9)


@item("dagger_5")
def dagger_5():
    """Shadow blade: black double-edged dagger with violet glowing edges."""
    black = pbr("shadow_black", (0.03, 0.028, 0.035), metal=1, rough=0.22)
    edge = pbr("shadow_edge", (0.4, 0.1, 0.8), metal=0.3, rough=0.2, emit=(0.6, 0.15, 1.0),
               emit_str=5.0, glow_str=0.8)
    gem_m = M_gem((0.6, 0.15, 1.0), "amethyst", 2.0)
    gold = pbr("dark_gold", (0.6, 0.42, 0.2), metal=1, rough=0.3)

    def fn(t):
        w = 0.055 * (1 - 0.55 * t) * (1 + 0.25 * math.sin(t * math.pi * 1.2))
        if t > 0.8:
            w *= ((1 - t) / 0.2) ** 0.9
        return max(w, 0.0005), 0.02 * math.sin(t * math.pi * 1.1), 0.014 * (1 - 0.5 * t), 0
    blade(0.6, fn, black, edge, cross="diamond", n=56)
    # bat-wing guard
    half = [(0.0, 0.03), (0.05, 0.02), (0.1, 0.05), (0.16, 0.1), (0.14, 0.03), (0.18, 0.0),
            (0.12, -0.02), (0.06, -0.035), (0.0, -0.04)]
    extrude(mirror_x(half), 0.04, black, bev=0.006, name="guard")
    for sx in (-1, 1):
        extrude([(sx * x, z) for x, z in [(0.05, 0.022), (0.1, 0.05), (0.15, 0.09), (0.09, 0.02)]],
                0.042, gold, bev=0.003, name="guard_trim")
    gem(0.025, gem_m, loc=(0, -0.022, 0.0), seg=8)
    grip(-0.24, -0.035, 0.02, M_leather((0.08, 0.04, 0.1), "leather_violet"), wraps=8, name="grip")
    pommel("spike", -0.24, 0.028, black, 0.02)
    view(diag=45, yaw=-22, glow=1.0)


@item("dagger_6")
def dagger_6():
    """Crystal fang: curved translucent red crystal fang on a bone hilt."""
    crys = pbr("fang_crystal", (0.7, 0.03, 0.06), rough=0.03, trans=0.5, ior=1.7, spec=1.0)
    core = M_glow((1.0, 0.1, 0.06), "fang_core", 3)
    bone = M_bone()
    black = M_blackmetal()
    path = bezier((0, 0, 0), (0, 0, 0.25), (0.06, 0, 0.45), (0.2, 0, 0.62), 40)
    sweep(path, lambda s: 0.095 * (1 - s) ** 0.85 + 0.001, crys, segs=6, ellipse=(0.45, 1.0),
          smooth=False, name="fang")
    sweep(path[:32], lambda s: 0.022 * (1 - s) + 0.002, core, segs=6, name="fang_core")
    # claw guard: small bone fangs curving outward
    for sx in (-1, 1):
        p0 = Vector((sx * 0.04, 0, -0.01))
        sweep(bezier(p0, p0 + Vector((sx * 0.08, 0, -0.01)), p0 + Vector((sx * 0.12, 0, 0.04)),
                     p0 + Vector((sx * 0.1, 0, 0.12)), 20), lambda s: 0.025 * (1 - s) + 0.002,
              bone, segs=10, name="claw")
    lathe(smooth_profile([(0, -0.05), (0.05, -0.045), (0.06, -0.02), (0.045, 0.01), (0, 0.015)], 3),
          black, seg=24, sy=0.7, name="collar")
    grip(-0.3, -0.04, 0.022, M_leather((0.25, 0.03, 0.04), "leather_crimson"), wraps=8, name="grip")
    sphere(0.04, M_gem((1.0, 0.05, 0.05), "blood_orb", 2.5), loc=(0, 0, -0.34), name="orb")
    torus(0.03, 0.008, black, loc=(0, 0, -0.31), seg=24, rseg=6, name="orb_ring")
    view(diag=45, yaw=-18, glow=1.0)


# =============================================================================
#  GUNS  (modelled pointing +X, grip hanging down/back)
# =============================================================================
def fluted_cylinder(x0, x1, z, r, mat, flutes=6, name="cylinder"):
    L = x1 - x0
    body = lathe(smooth_profile([(0, 0), (r * 0.9, 0), (r, L * 0.08), (r, L * 0.92),
                                 (r * 0.9, L), (0, L)], 3),
                 mat, seg=36, loc=(x0, 0, z), rot=(0, rad(90), 0), name=name)
    for k in range(flutes):
        a = TAU * (k + 0.5) / flutes
        c = cyl(r * 0.24, L * 0.62, mat, loc=(x0 + L * 0.5, r * 1.02 * math.sin(a),
                                              z + r * 1.02 * math.cos(a)),
                rot=(0, rad(90), 0), seg=12, name="flute_cut")
        boolean(body, c)
    # chamber mouths at the front
    return body


def revolver(metal, grip_mat, trim, barrel_len=0.46, cyl_mat=None, engraved=None,
             octagon=True, grip_angle=24, hammer_mat=None):
    """Classic single-action revolver."""
    cm = cyl_mat or metal
    z_b = 0.03
    # barrel + ejector housing
    barrel_x(0.14, 0.14 + barrel_len, z_b, 0.027, metal, sides=8 if octagon else None,
             name="barrel")
    barrel_x(0.14, 0.14 + barrel_len * 0.62, z_b - 0.045, 0.012, metal, bore=False,
             name="ejector")
    box((0.03, 0.012, 0.022), metal, loc=(0.14 + barrel_len - 0.03, 0, z_b + 0.03), bev=0.003,
        name="front_sight")
    # frame
    frame = [(-0.1, 0.07), (0.15, 0.07), (0.16, 0.055), (0.16, -0.035), (0.08, -0.06),
             (-0.03, -0.065), (-0.08, -0.05), (-0.12, 0.02)]
    extrude(frame, 0.045, metal, bev=0.008, name="frame")
    fluted_cylinder(0.0, 0.14, z_b - 0.005, 0.058, cm)
    # hammer
    ham = [(-0.07, 0.06), (-0.1, 0.1), (-0.14, 0.115), (-0.15, 0.1), (-0.12, 0.085),
           (-0.09, 0.05)]
    extrude(ham, 0.02, hammer_mat or metal, bev=0.004, name="hammer")
    trigger_guard(-0.02, 0.1, -0.055, 0.075, 0.009, trim)
    # grip
    gp = grip_shape(-0.075, -0.03, 0.24, 0.075, angle=grip_angle, butt=1.1, curve=0.06)
    extrude(gp, 0.062, grip_mat, bev=0.016, name="grip", bev_angle=50)
    e = grip_end(-0.075, -0.03, 0.24, grip_angle, 0.06)
    sphere(0.035, metal, loc=e, scale=(1.0, 0.85, 0.6), name="butt_cap")
    for p in ((-0.1, -0.1),):
        cyl(0.011, 0.068, trim, loc=(p[0], 0, p[1]), rot=(rad(90), 0, 0), seg=16, name="screw")
    return z_b


@item("gun_1")
def gun_1():
    """Flintlock pistol: long iron barrel, walnut stock, brass fittings."""
    iron = M_iron()
    brass = M_brass()
    wood = M_wood((0.42, 0.2, 0.08), "walnut")
    z = 0.0
    barrel_x(0.1, 0.78, z, 0.034, iron, r_end=0.028, muzzle=0.035, name="barrel")
    barrel_x(-0.02, 0.22, z, 0.04, iron, sides=8, bore=False, name="breech")
    # fore stock under the barrel
    extrude([(-0.02, -0.02), (0.62, -0.02), (0.64, -0.045), (0.6, -0.06), (-0.02, -0.07)],
            0.05, wood, bev=0.012, name="forestock")
    torus(0.04, 0.008, brass, loc=(0.62, 0, -0.02), rot=(0, rad(90), 0), sx=0.7, name="band")
    # ramrod
    barrel_x(0.1, 0.72, -0.06, 0.009, M_darkwood(), bore=False, name="ramrod")
    sphere(0.012, brass, loc=(0.73, 0, -0.06), name="rod_tip")
    # grip (bird's head) + butt cap
    gp = grip_shape(-0.02, -0.02, 0.3, 0.085, angle=40, butt=1.2, curve=0.08)
    extrude(gp, 0.065, wood, bev=0.018, name="grip", bev_angle=50)
    bc = grip_end(-0.02, -0.02, 0.3, 40, 0.08)
    sphere(0.05, brass, loc=bc, scale=(1.0, 0.75, 0.8), name="butt_cap")
    # lock plate, hammer (cock) and frizzen
    extrude([(-0.1, -0.035), (0.12, -0.035), (0.14, 0.0), (0.1, 0.03), (-0.08, 0.03),
             (-0.12, 0.0)], 0.012, iron, loc=(0, -0.036, 0), bev=0.003, name="lock_plate")
    cock = thick_polyline(catmull_2d([(-0.03, 0.02), (-0.06, 0.07), (-0.05, 0.12),
                                      (0.0, 0.13)], 6), 0.028, 0.02)
    extrude(cock, 0.016, iron, loc=(0, -0.045, 0), bev=0.004, name="cock")
    box((0.03, 0.02, 0.02), iron, loc=(0.005, -0.045, 0.13), bev=0.004, name="flint")
    extrude([(0.06, 0.03), (0.09, 0.03), (0.09, 0.1), (0.07, 0.1)], 0.02, iron,
            loc=(0, -0.045, 0), bev=0.004, name="frizzen")
    trigger_guard(-0.06, 0.1, -0.06, 0.08, 0.009, brass)
    view(diag=24, yaw=-22)


@item("gun_2")
def gun_2():
    """Revolver: blued steel, walnut grip."""
    steel = pbr("blued_steel", (0.35, 0.38, 0.44), metal=1, rough=0.25, noise_rough=0.08)
    wood = M_wood((0.38, 0.17, 0.07), "walnut")
    revolver(steel, wood, M_brass())
    view(diag=24, yaw=-22)


@item("gun_3")
def gun_3():
    """Sawn-off double barrel: engraved silver receiver, short barrels."""
    steel = M_steel()
    silver = pbr("engraved_silver", (0.9, 0.9, 0.93), metal=1, rough=0.2, pattern="stripes",
                 pattern_args=dict(scale=(12, 12, 12), freq=2.0, distort=10.0, dir="X",
                                   dark=(0.45, 0.45, 0.48), bump=0.3))
    wood = M_wood((0.35, 0.16, 0.07), "walnut")
    z = 0.03
    for y in (-0.034, 0.034):
        barrel_x(0.1, 0.58, z, 0.033, steel, muzzle=0.0, y=y, name="barrel")
    box((0.46, 0.02, 0.02), steel, loc=(0.34, 0, z + 0.035), bev=0.004, name="rib")
    # receiver
    rec = [(-0.08, 0.07), (0.12, 0.07), (0.12, -0.02), (0.02, -0.045), (-0.1, -0.03)]
    extrude(rec, 0.1, silver, bev=0.012, name="receiver")
    # fore-end
    extrude([(0.1, -0.005), (0.36, -0.005), (0.38, -0.03), (0.34, -0.045), (0.1, -0.045)],
            0.08, wood, bev=0.015, name="fore_end")
    # twin hammers
    for y in (-0.03, 0.03):
        ham = [(-0.05, 0.06), (-0.08, 0.11), (-0.12, 0.125), (-0.12, 0.11), (-0.09, 0.09),
               (-0.07, 0.05)]
        extrude(ham, 0.016, silver, loc=(0, y, 0), bev=0.004, name="hammer")
    trigger_guard(-0.04, 0.09, -0.04, 0.075, 0.009, silver)
    gp = grip_shape(-0.07, -0.01, 0.26, 0.085, angle=34, butt=1.2, curve=0.06)
    extrude(gp, 0.075, wood, bev=0.02, name="grip", bev_angle=50)
    bc = grip_end(-0.07, -0.01, 0.26, 34, 0.06)
    sphere(0.045, silver, loc=bc, scale=(1.0, 0.9, 0.6), name="butt_cap")
    view(diag=24, yaw=-26)


@item("gun_4")
def gun_4():
    """Engraved silver revolver: long barrel with glowing blue rune
    engraving, ivory grip with a sapphire medallion."""
    silver = pbr("rev_silver", (0.9, 0.91, 0.95), metal=1, rough=0.16, pattern="stripes",
                 pattern_args=dict(scale=(14, 14, 14), freq=2.0, distort=9.0, dir="X",
                                   dark=(0.55, 0.56, 0.6), bump=0.25))
    ivory = pbr("ivory", (0.92, 0.88, 0.76), rough=0.3, coat=0.5, sss=0.1)
    rune = M_glow((0.3, 0.7, 1.0), "rune_blue", 10)
    gold = M_gold()
    zb = revolver(silver, ivory, gold, barrel_len=0.56, octagon=True, hammer_mat=silver)
    runes(zb, 0.2, 0.62, -0.03, 0.034, rune, seed=9, gap=0.35, horizontal=True)
    gem(0.02, M_gem((0.15, 0.4, 1.0), "sapphire", 1.2), loc=(-0.14, -0.04, -0.13), seg=10,
        name="medallion")
    torus(0.022, 0.005, gold, loc=(-0.14, -0.036, -0.13), rot=(rad(90), 0, 0), seg=24, rseg=6,
          name="medallion_rim")
    view(diag=24, yaw=-22, glow=0.8)


@item("gun_5")
def gun_5():
    """Holy repeater pistol: gold revolver-repeater with twin barrels, pearl
    grip with a gold cross, radiant cross sight and a halo ring."""
    gold = M_gold()
    pearl = pbr("pearl", (0.95, 0.93, 0.9), rough=0.25, coat=0.8, sheen=0.3)
    light = M_glow((1.0, 0.88, 0.55), "holy_light", 6.0, base=(1.0, 0.9, 0.7))
    white = M_silver()
    zb = revolver(gold, pearl, white, barrel_len=0.5, octagon=False, cyl_mat=white)
    barrel_x(0.14, 0.58, zb - 0.058, 0.02, gold, name="barrel_low")
    cross_emblem(0.08, gold, (-0.13, -0.034, -0.13), depth=0.012, rot=(0, rad(24), 0))
    cross_emblem(0.07, light, (0.6, 0, zb + 0.07), depth=0.012)
    torus(0.045, 0.008, light, loc=(0.5, 0, zb - 0.02), rot=(0, rad(90), 0), seg=32, rseg=6,
          name="halo")
    gem(0.022, M_gem((1.0, 0.95, 0.85), "holy_gem", 2.0), loc=(0.04, -0.03, 0.07 - 0.005), seg=10)
    view(diag=24, yaw=-22, glow=0.9)


@item("gun_6")
def gun_6():
    """Demon hand cannon: black bell-mouthed barrel with glowing red maw,
    vents and spikes on a bone grip."""
    black = pbr("cannon_black", (0.05, 0.045, 0.05), metal=1, rough=0.3, pattern="veins",
                pattern_args=dict(color=(1.0, 0.06, 0.02), strength=7.0, density=3.0, width=0.035,
                                  scale=(3, 3, 3)))
    bm = M_blackmetal()
    bone = M_bone()
    maw = M_glow((1.0, 0.12, 0.03), "maw_fire", 14)
    vent = M_glow((1.0, 0.2, 0.05), "vent_fire", 8)
    z = 0.06
    # thick barrel with bell muzzle
    prof = [(0, 0), (0.085, 0), (0.08, 0.3), (0.085, 0.42), (0.13, 0.5), (0.145, 0.54),
            (0.1, 0.54), (0, 0.5)]
    lathe(prof, black, seg=40, loc=(0.02, 0, z), rot=(0, rad(90), 0), name="barrel")
    # glowing maw disc
    cyl(0.1, 0.01, maw, loc=(0.54, 0, z), rot=(0, rad(90), 0), seg=32, name="maw")
    # teeth ring inside the bell
    pts, nrms = [], []
    for k in range(10):
        a = TAU * k / 10
        pts.append((0.555, 0.12 * math.sin(a), z + 0.12 * math.cos(a)))
        nrms.append((0.4, -math.sin(a), -math.cos(a)))
    spikes_on_points(pts, nrms, 0.06, 0.016, bone, name="tooth")
    # reinforcing rings and vents
    for x in (0.08, 0.3):
        torus(0.088, 0.016, bm, loc=(x, 0, z), rot=(0, rad(90), 0), seg=40, rseg=8, name="ring")
    for k in range(3):
        box((0.04, 0.02, 0.012), vent, loc=(0.14 + k * 0.05, -0.078, z + 0.03), rot=(0, 0, rad(12)),
            bev=0.003, name="vent")
    # dorsal spikes
    spikes_on_points([(0.1 + k * 0.1, 0, z + 0.08) for k in range(3)],
                     [(-0.4, 0, 1)] * 3, 0.08, 0.02, bm, name="spike")
    # breech & frame
    extrude([(-0.12, 0.13), (0.04, 0.14), (0.05, -0.02), (-0.03, -0.06), (-0.14, -0.03)], 0.12,
            bm, bev=0.015, name="breech")
    trigger_guard(-0.06, 0.05, -0.05, 0.08, 0.011, bm)
    gp = grip_shape(-0.08, -0.03, 0.25, 0.085, angle=26, butt=1.15, curve=0.06)
    extrude(gp, 0.075, M_leather((0.12, 0.03, 0.03), "leather_blood"), bev=0.018, name="grip",
            bev_angle=50)
    bc = grip_end(-0.08, -0.03, 0.25, 26, 0.06)
    lathe([(0, 0), (0.035, 0.0), (0.0, 0.1)], bone, seg=8, loc=bc,
          rot=(0, rad(180) + rad(26), 0), smooth=False, name="butt_spike")
    for k in range(3):
        cone(0.012, 0.045, bone, loc=bc + Vector((0.05 + 0.03 * k, 0, 0.06 + 0.07 * k)),
             rot=(0, rad(64), 0), seg=8, name="grip_spike")
    gem(0.028, M_gem((1.0, 0.05, 0.02), "blood_gem", 3.0), loc=(-0.05, -0.062, 0.05), seg=10)
    view(diag=24, yaw=-32, glow=1.0)


# =============================================================================
#  STAVES / HOLY FOCI
# =============================================================================
def beads_along(path, r, mat, spacing, big_every=0, big_mat=None, big_r=None):
    pts = resample(path, spacing)
    key = ("bead", round(r, 4))
    if key not in G.shared:
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=10, radius=r)
        me = bpy.data.meshes.new("bead")
        bm.to_mesh(me)
        bm.free()
        me.materials.append(mat)
        me.shade_smooth()
        G.shared[key] = me
    me = G.shared[key]
    for i, p in enumerate(pts):
        if big_every and i % big_every == 0:
            sphere(big_r or r * 1.4, big_mat or mat, loc=p, seg=20, rings=12, name="bigbead")
        else:
            link_shared("bead", me, loc=p)
    return pts


@item("staff_1")
def staff_1():
    """Wooden staff: gnarled shaft with a curled crook, leather wrap."""
    wood = M_wood((0.36, 0.2, 0.09), "staff_wood")
    leather = M_leather((0.3, 0.16, 0.07))
    iron = M_iron()
    shaft = catmull([(0, 0, -1.0), (0.02, 0, -0.5), (-0.015, 0, 0.0), (0.01, 0, 0.45),
                     (0.0, 0, 0.72)], 16)
    # curl: spiral at the top
    c = Vector((0.12, 0, 0.78))
    curl = []
    for i in range(1, 60):
        t = i / 59
        a = math.pi - t * math.pi * 1.7
        rr = 0.13 * (1 - 0.55 * t)
        curl.append(c + Vector((rr * math.cos(a), 0.02 * t, rr * math.sin(a))))
    path = resample(shaft + curl, 0.01)
    rnd = random.Random(4)
    knots = [(rnd.random(), rnd.random() * TAU) for _ in range(9)]

    def radial(s, th, L):
        m = 1.0
        for (ks, kt) in knots:
            d = (s - ks) * 40
            m += 0.25 * math.exp(-d * d) * max(0, math.cos(th - kt)) ** 2
        return m * (1 + 0.04 * math.sin(th * 3 + L * 12))
    sweep(path, lambda s: 0.034 * (1 - 0.35 * s) + 0.004, wood, segs=16, radial=radial,
          name="shaft")
    grip(-0.25, 0.08, 0.037, leather, wraps=8, depth=0.18, name="wrap")
    lathe([(0, -1.08), (0.02, -1.08), (0.04, -1.0), (0.042, -0.94), (0, -0.94)], iron, seg=16,
          name="ferrule")
    # cord and a hanging charm
    p0 = Vector((0.01, -0.03, 0.62))
    sweep(bezier(p0, p0 + Vector((0.02, -0.01, -0.08)), p0 + Vector((0.05, -0.01, -0.14)),
                 p0 + Vector((0.06, -0.01, -0.22)), 16), 0.006,
          M_cloth((0.7, 0.62, 0.45), "cord"), segs=6, name="cord")
    feather(0.14, 0.05, M_cloth((0.75, 0.72, 0.68), "feather_white"),
            loc=p0 + Vector((0.06, -0.01, -0.22)), rot=(0, rad(160), 0))
    torus(0.04, 0.008, M_cloth((0.7, 0.62, 0.45), "cord"), loc=(0.0, 0, 0.6), seg=20, rseg=6,
          name="cord_wrap")
    view(diag=40, yaw=-20)


@item("staff_2")
def staff_2():
    """Rosary: a loop of rosewood beads with silver paters and a silver
    crucifix."""
    bead = pbr("rosewood", (0.35, 0.07, 0.05), rough=0.25, coat=0.8)
    silver = M_silver()
    loop = []
    for i in range(120):
        a = TAU * i / 120 - math.pi / 2
        loop.append((0.36 * math.cos(a), 0.12 * math.sin(a) * math.sin(a * 0.5 + 1), 0.4 + 0.33 * math.sin(a)))
    loop.append(loop[0])
    beads_along(loop, 0.028, bead, 0.066, big_every=11, big_mat=silver, big_r=0.036)
    # centre piece medallion at the bottom of the loop
    bottom = Vector(loop[0])
    lathe([(0, -0.012), (0.05, -0.012), (0.055, 0.0), (0.05, 0.012), (0, 0.012)], silver, seg=6,
          loc=bottom + Vector((0, -0.01, -0.02)), rot=(rad(90), 0, 0), smooth=False,
          name="medallion")
    # strand down to the cross
    strand = [bottom + Vector((0, 0, -0.07)), bottom + Vector((0, 0, -0.38))]
    beads_along(strand, 0.028, bead, 0.068, big_every=4, big_mat=silver, big_r=0.034)
    cz = bottom.z - 0.46
    pts = shape_cross(0.24, 0.36, 0.055, 0.25, flare=0.012)
    extrude([(x, z + cz - 0.36) for x, z in pts], 0.035, silver, bev=0.008, name="crucifix")
    torus(0.018, 0.006, silver, loc=(0, 0, cz + 0.012), rot=(rad(90), 0, 0), seg=16, rseg=6,
          name="bail")
    gem(0.02, M_gem((0.9, 0.1, 0.15), "ruby", 1.0), loc=(0, -0.022, cz - 0.11), seg=8)
    view(diag=0, roll=0, yaw=-10, pitch=5)


@item("staff_3")
def staff_3():
    """Holy tome: closed book, navy leather, silver corners, gold cross."""
    cover = M_leather((0.08, 0.1, 0.28), "leather_navy")
    pages = pbr("pages", (0.9, 0.82, 0.62), rough=0.8, pattern="stripes",
                pattern_args=dict(scale=(1, 60, 1), freq=5.0, dir="Y", dark=(0.62, 0.54, 0.38),
                                  bump=0.2))
    silver = M_silver()
    gold = M_gold()
    book(0.62, 0.84, 0.2, cover, pages, trim_mat=silver, corner_mat=silver)
    cross_emblem(0.46, gold, (0.02, -0.105, 0.0), depth=0.018, flare=0.02, bev=0.006)
    gem(0.035, M_gem((0.2, 0.45, 1.0), "sapphire", 1.2), loc=(0.02, -0.12, 0.07), seg=10)
    # border lines on the cover
    for (a, b) in (((-0.25, -0.36), (0.27, -0.36)), ((-0.25, 0.36), (0.27, 0.36)),
                   ((-0.25, -0.36), (-0.25, 0.36)), ((0.27, -0.36), (0.27, 0.36))):
        stroke2d(a, b, 0.012, 0.01, silver, y=-0.1, name="border")
    view(yaw=-28, pitch=10)


@item("staff_4")
def staff_4():
    """Crystal staff: silver shaft, claw head holding a glowing blue crystal."""
    silver = M_silver()
    wrap = M_leather((0.07, 0.1, 0.22), "wrap_blue")
    crys = pbr("staff_crystal", (0.25, 0.55, 1.0), rough=0.02, trans=0.55, ior=1.6, spec=1.0,
               emit=(0.3, 0.65, 1.0), emit_str=1.6, glow_str=0.7)
    core = M_glow((0.5, 0.85, 1.0), "crystal_core", 8)
    lathe([(0, -0.85), (0.024, -0.85), (0.028, 0.55), (0, 0.56)], silver, seg=20, name="shaft")
    grip(-0.3, 0.05, 0.03, wrap, wraps=9, name="grip")
    for z in (-0.8, -0.31, 0.06, 0.4):
        torus(0.032, 0.009, silver, loc=(0, 0, z), seg=24, rseg=6, name="band")
    cone(0.026, 0.08, silver, loc=(0, 0, -0.85), rot=(math.pi, 0, 0), seg=12, name="tip")
    # collar + claws
    lathe(smooth_profile([(0, 0.5), (0.03, 0.5), (0.06, 0.58), (0.07, 0.62), (0, 0.62)], 3),
          silver, seg=24, name="collar")
    for k in range(3):
        a = TAU * k / 3 + 0.3
        d = Vector((math.cos(a), math.sin(a) * 0.6, 0))
        p0 = Vector((0, 0, 0.6)) + d * 0.05
        pts = bezier(p0, p0 + d * 0.12 + Vector((0, 0, 0.05)), p0 + d * 0.12 + Vector((0, 0, 0.25)),
                     p0 + d * 0.02 + Vector((0, 0, 0.34)), 20)
        sweep(pts, lambda s: 0.02 * (1 - 0.8 * s) + 0.003, silver, segs=10, name="claw")
    crystal(0.09, 0.42, crys, loc=(0, 0, 0.57), sides=6, tip=0.3, base_tip=0.2)
    crystal(0.035, 0.24, core, loc=(0, 0, 0.64), sides=6, tip=0.3, base_tip=0.2, name="core")
    for (x, z, s) in ((0.17, 0.82, 0.5), (-0.14, 0.9, 0.4)):
        crystal(0.03 * s * 2, 0.12 * s * 2, crys, loc=(x, 0, z), rot=(0, rad(25 * (1 if x > 0 else -1)), 0),
                sides=6, name="shard")
    view(diag=40, yaw=-20, glow=1.0)


@item("staff_5")
def staff_5():
    """Archangel staff: gold shaft, feathered wings, halo and radiant orb."""
    gold = M_gold()
    white = pbr("wing_white", (0.95, 0.94, 0.92), rough=0.55, sheen=0.4, sss=0.1)
    tip = pbr("wing_gold", (1.0, 0.82, 0.45), metal=0.7, rough=0.3)
    light = M_glow((1.0, 0.92, 0.7), "holy_orb", 8.0, base=(1.0, 0.95, 0.85))
    wrap = M_leather((0.9, 0.87, 0.8), "white_leather")
    lathe([(0, -0.85), (0.026, -0.85), (0.03, 0.48), (0, 0.5)], gold, seg=20, name="shaft")
    grip(-0.3, 0.05, 0.032, wrap, wraps=9, name="grip")
    for z in (-0.78, -0.31, 0.06):
        torus(0.034, 0.01, gold, loc=(0, 0, z), seg=24, rseg=6, name="band")
    lathe([(0, -0.93), (0.02, -0.91), (0.037, -0.85), (0, -0.83)], gold, seg=16, name="butt")
    lathe(smooth_profile([(0, 0.44), (0.035, 0.44), (0.07, 0.52), (0.06, 0.58), (0.03, 0.6),
                          (0, 0.6)], 3), gold, seg=24, name="head_base")
    for side in (-1, 1):
        wing(side, white, loc=(side * 0.04, 0.02, 0.56), scale=0.56, n=7, accent=tip)
    torus(0.13, 0.014, gold, loc=(0, 0.03, 0.8), rot=(rad(90), 0, 0), seg=48, rseg=8, name="halo")
    sphere(0.075, light, loc=(0, 0, 0.8), name="orb")
    cross_emblem(0.1, gold, (0, 0, 1.0), depth=0.02, flare=0.01)
    view(diag=35, yaw=-12, glow=0.9)


@item("staff_6")
def staff_6():
    """Grimoire: black-violet leather tome bound in spiked iron, a living eye
    on the cover and glowing violet sigils."""
    cover = pbr("grim_leather", (0.08, 0.03, 0.1), rough=0.5, bump=0.6, bump_scale=30, coat=0.2)
    pages = pbr("grim_pages", (0.55, 0.45, 0.32), rough=0.85, pattern="stripes",
                pattern_args=dict(scale=(1, 60, 1), freq=5.0, dir="Y", dark=(0.3, 0.22, 0.14),
                                  bump=0.2))
    iron = M_blackmetal()
    sig = M_glow((0.7, 0.25, 1.0), "sigil_violet", 9)
    book(0.62, 0.84, 0.22, cover, pages, trim_mat=iron, corner_mat=iron)
    # spikes on the corners
    for sx, sz in ((0.3, 0.41), (0.3, -0.41)):
        cone(0.02, 0.08, iron, loc=(sx, -0.11, sz), rot=(rad(90), 0, 0), seg=8, name="spike")
    # sigil ring around the eye
    torus(0.19, 0.008, sig, loc=(0.02, -0.112, 0.0), rot=(rad(90), 0, 0), seg=64, rseg=6,
          name="sigil_ring")
    for k in range(8):
        a = TAU * k / 8
        p = (0.02 + 0.235 * math.cos(a), 0.235 * math.sin(a))
        stroke2d((p[0] - 0.02, p[1]), (p[0] + 0.02, p[1] + 0.02), 0.01, 0.008, sig, y=-0.112,
                 name="sigil")
    lathe([(0, -0.02), (0.14, -0.02), (0.15, 0.0), (0.13, 0.02), (0, 0.02)], iron, seg=40,
          loc=(0.02, -0.11, 0.0), rot=(rad(90), 0, 0), sy=0.72, name="eye_socket")
    eye(0.1, M_glow((0.75, 0.2, 1.0), "grim_iris", 6), loc=(0.02, -0.1, 0.0),
        rot=(0, 0, 0), lid_mat=pbr("grim_lid", (0.12, 0.04, 0.1), rough=0.5))
    # chain draped across
    ch = catmull([(-0.33, -0.14, 0.3), (-0.1, -0.16, 0.2), (0.15, -0.16, -0.22),
                  (0.35, -0.13, -0.32)], 12)
    chain(ch, iron, link_len=0.07, wire=0.01)
    lathe([(0, 0), (0.05, 0), (0.05, 0.03), (0, 0.03)], iron, seg=6, loc=(0.35, -0.13, -0.32),
          rot=(rad(90), 0, 0), smooth=False, name="lock")
    view(yaw=-28, pitch=10, glow=1.0)


# =============================================================================
#  SPEARS  (이졸데, modelled pointing +Z: butt at the bottom, head at the top)
# =============================================================================
def spear_shaft(z0, z1, r, mat, butt_mat, bands=(), band_mat=None, wraps=((-0.32, -0.08),),
                wrap_mat=None, name="shaft"):
    """Straight pole from z0 to z1 with a pointed butt cap, metal bands and
    one or more grip wraps (two-handed: two wraps)."""
    lathe([(0, z0), (r, z0), (r * 0.94, z1), (0, z1)], mat, seg=20, name=name)
    lathe([(0, z0 - 0.07), (r * 0.5, z0 - 0.04), (r * 1.25, z0 + 0.01), (r * 1.1, z0 + 0.04),
           (0, z0 + 0.04)], butt_mat, seg=16, name="butt")
    for z in bands:
        torus(r * 1.08, r * 0.32, band_mat or butt_mat, loc=(0, 0, z), seg=24, rseg=6, name="band")
    for (a, b) in wraps:
        grip(a, b, r * 1.12, wrap_mat or M_leather((0.2, 0.11, 0.06)), wraps=7, depth=0.14,
             name="wrap")


def spear_socket(z, r, mat, h=0.1, name="socket"):
    """Conical socket joining the pole to the head; returns the top z."""
    lathe(smooth_profile([(0, z), (r * 1.3, z), (r * 1.6, z + h * 0.3), (r * 1.25, z + h),
                          (0, z + h)], 3), mat, seg=24, name=name)
    return z + h


def spear_mane(z, mat, n=5, length=0.34, spread=0.07, r=0.009, name="mane"):
    """Dragon-mane tassel: soft cords hanging from the socket and blowing
    back (+x is the icon's lower right after the diagonal view)."""
    for i in range(n):
        a = (i - (n - 1) / 2) / max(1, n - 1)
        p0 = Vector((0.0, a * 0.02, z))
        p3 = Vector((0.1 + spread * (1 + a), -0.03 + a * 0.05, z - length * (0.75 + 0.25 * abs(a))))
        sweep(bezier(p0, p0 + Vector((0.05, 0, -0.02)), p3 + Vector((-0.04, 0, 0.12)), p3, 20),
              lambda s, r=r: r * (1.2 - 0.9 * s), mat, segs=8, name=name)


def leaf_fn(width, thick=0.016, belly=0.42, tip_pow=0.85):
    """Leaf-shaped spear head: widest at `belly`, rounded base, sharp tip."""
    def fn(t):
        if t < belly:
            w = width / 2 * (0.35 + 0.65 * math.sin(t / belly * math.pi / 2))
        else:
            w = width / 2 * ((1 - t) / (1 - belly)) ** tip_pow
        return w, 0.0, thick * (1 - 0.6 * t), 0
    return fn


@item("spear_1")
def spear_1():
    """Ash spear: pale wooden pole, iron leaf head, red horsehair tassel."""
    wood = M_wood((0.5, 0.33, 0.17), "ash_wood")
    iron = M_iron()
    edge = pbr("leaf_edge", (0.55, 0.55, 0.56), metal=1, rough=0.28)
    spear_shaft(-0.78, 0.5, 0.026, wood, iron, bands=(0.32,), wraps=((-0.34, -0.12),),
                wrap_mat=M_leather((0.3, 0.16, 0.07)))
    top = spear_socket(0.48, 0.026, iron)
    blade(0.42, leaf_fn(0.12), iron, edge, cross="diamond", z0=top - 0.01, n=40)
    spear_mane(top - 0.06, M_cloth((0.62, 0.06, 0.08), "tassel_red"), n=5)
    view(diag=42, yaw=-22, fill=0.9)


@item("spear_2")
def spear_2():
    """Winged spear: steel head with two side lugs, iron-banded pole, teal
    tassel (the sky order's colour)."""
    wood = M_wood((0.38, 0.22, 0.1), "spear_wood")
    steel = M_steel()
    edge = pbr("wing_edge", (0.86, 0.88, 0.92), metal=1, rough=0.12)
    spear_shaft(-0.78, 0.5, 0.026, wood, steel, bands=(-0.5, 0.0, 0.32), band_mat=M_iron(),
                wraps=((-0.36, -0.12),))
    top = spear_socket(0.48, 0.026, steel)
    blade(0.44, leaf_fn(0.11, belly=0.38), steel, edge, cross="diamond", z0=top - 0.01, n=40)
    lugs = [(0.0, 0.0), (0.12, 0.05), (0.13, 0.08), (0.04, 0.07), (0.0, 0.09)]
    extrude(mirror_x(lugs), 0.03, steel, loc=(0, 0, top - 0.04), bev=0.005, name="lugs")
    spear_mane(top - 0.06, M_cloth((0.15, 0.6, 0.68), "tassel_teal"), n=5)
    view(diag=42, yaw=-22, fill=0.9)


@item("spear_3")
def spear_3():
    """Dragon-fang lance: long straight steel spike, dark steel pole with a
    gold collar and sapphire, teal tassel."""
    dsteel = pbr("lance_dsteel", (0.22, 0.24, 0.3), metal=1, rough=0.3)
    steel = M_steel()
    edge = pbr("fang_edge", (0.92, 0.94, 0.97), metal=1, rough=0.08)
    gold = M_gold()
    spear_shaft(-0.78, 0.46, 0.025, dsteel, steel, bands=(-0.55, 0.28), band_mat=gold,
                wraps=((-0.38, -0.14),), wrap_mat=pbr("wrap_dark", (0.06, 0.06, 0.08), rough=0.45))
    top = spear_socket(0.44, 0.025, gold, h=0.12)
    blade(0.58, std_blade(0.085, tip=0.22, taper=0.35, thick=0.018, fuller=0.4, fuller_end=0.6),
          steel, edge, cross="fuller", z0=top - 0.01, n=48)
    gem(0.022, M_gem((0.15, 0.35, 1.0), "sapph_lance", 1.2), loc=(0, -0.034, top - 0.06), seg=8)
    spear_mane(top - 0.08, M_cloth((0.15, 0.6, 0.68), "tassel_teal"), n=6, length=0.38)
    view(diag=42, yaw=-22, fill=0.9)


@item("spear_4")
def spear_4():
    """Rune partisan: blue-black steel head with curved side blades and
    glowing runes, crimson tassel."""
    dsteel = pbr("partisan_steel", (0.17, 0.2, 0.27), metal=1, rough=0.3, noise_rough=0.08)
    edge = pbr("partisan_edge", (0.78, 0.84, 0.92), metal=1, rough=0.1)
    rune = M_glow((0.25, 0.65, 1.0), "rune_blue", 12)
    silver = M_silver()
    spear_shaft(-0.78, 0.46, 0.026, M_darkwood(), silver, bands=(-0.52, 0.3), wraps=((-0.38, -0.12),),
                wrap_mat=pbr("wrap_navy", (0.05, 0.07, 0.14), rough=0.5, coat=0.2))
    top = spear_socket(0.44, 0.026, dsteel, h=0.11)
    blade(0.5, std_blade(0.1, tip=0.25, taper=0.4, thick=0.018, fuller=0.45, fuller_end=0.62),
          dsteel, edge, cross="fuller", z0=top - 0.01, n=48)
    wing = [(0.03, 0.0), (0.1, 0.02), (0.17, 0.08), (0.19, 0.16), (0.13, 0.1), (0.07, 0.07), (0.03, 0.05)]
    for sx in (-1, 1):
        extrude([(sx * x, z) for x, z in wing], 0.03, dsteel, loc=(0, 0, top - 0.02), bev=0.005,
                name="side_blade")
    runes(0.0, top + 0.06, top + 0.34, -0.012, 0.04, rune, seed=5, gap=0.3)
    spear_mane(top - 0.06, M_cloth((0.55, 0.05, 0.08), "tassel_crimson"), n=5)
    view(diag=42, yaw=-22, fill=0.9, glow=1.0)


@item("spear_5")
def spear_5():
    """Dragon-wing holy spear: silver pole with white wrap, gold wing guard,
    long silver head with a radiant inlay, gold tassel."""
    silver = M_silver()
    gold = M_gold()
    edge = pbr("holy_spear_edge", (1.0, 0.98, 0.95), metal=1, rough=0.06)
    light = M_glow((1.0, 0.8, 0.4), "holy_light", 4.0, base=(1.0, 0.85, 0.5))
    spear_shaft(-0.78, 0.44, 0.025, silver, gold, bands=(-0.6, -0.1, 0.26), band_mat=gold,
                wraps=((-0.42, -0.16),), wrap_mat=pbr("wrap_white", (0.92, 0.89, 0.82), rough=0.5, coat=0.2))
    top = spear_socket(0.42, 0.025, gold, h=0.1)
    blade(0.56, leaf_fn(0.12, belly=0.3, tip_pow=0.9), silver, edge, cross="fuller", z0=top + 0.02, n=48)
    blade(0.36, lambda t: (0.016 * (1 - 0.5 * t) * (min(1, (1 - t) / 0.2) ** 0.8), 0.0, 0.004, 0),
          light, cross="diamond", z0=top + 0.08, n=24, name="inlay").location.y = -0.012
    wing = [(0.02, 0.0), (0.08, 0.03), (0.16, 0.1), (0.24, 0.18), (0.17, 0.1), (0.2, 0.06),
            (0.12, 0.03), (0.06, -0.02)]
    for sx in (-1, 1):
        extrude([(sx * x, z) for x, z in wing], 0.035, gold, loc=(0, 0, top - 0.03), bev=0.006,
                name="wing_guard")
    gem(0.03, M_gem((0.85, 0.92, 1.0), "diamond", 1.6), loc=(0, -0.034, top - 0.01), seg=12)
    spear_mane(top - 0.08, M_cloth((0.85, 0.65, 0.2), "tassel_gold"), n=6, length=0.38)
    view(diag=42, yaw=-22, fill=0.9, glow=0.9)


@item("spear_6")
def spear_6():
    """Black-dragon spear: black metal pole, jagged violet-crimson crystal
    head with a burning core, crimson mane."""
    black = M_blackmetal()
    crys = pbr("wyrm_crystal", (0.3, 0.02, 0.12), rough=0.05, trans=0.45, ior=1.6, spec=1.0,
               emit=(1.0, 0.1, 0.3), emit_str=0.25, glow_str=0.3)
    edge = pbr("wyrm_edge", (0.6, 0.1, 0.25), rough=0.02, trans=0.3, spec=1.0,
               emit=(1.0, 0.15, 0.35), emit_str=0.7, glow_str=0.6)
    core = M_glow((1.0, 0.2, 0.3), "wyrm_core", 6)
    spear_shaft(-0.78, 0.44, 0.026, black, black, bands=(-0.5, 0.25), band_mat=pbr("blood_steel", (0.5, 0.04, 0.06), metal=1, rough=0.3),
                wraps=((-0.4, -0.14),), wrap_mat=pbr("wrap_violet", (0.12, 0.03, 0.14), rough=0.45, coat=0.3))
    top = spear_socket(0.42, 0.026, black, h=0.12)

    def fn(t):
        w = 0.06 * (1 + 0.3 * math.sin(t * math.pi * 0.9)) + sawtooth(t, 5, 0.022) * (1 - t)
        if t > 0.75:
            w *= ((1 - t) / 0.25) ** 0.9
        return w, 0.01 * math.sin(t * 6), 0.02 * (1 - 0.5 * t), 0
    blade(0.6, fn, crys, edge, cross="lens", z0=top - 0.01, n=64)
    blade(0.46, lambda t: (0.014 * (1 - t) ** 0.6, 0.0, 0.006, 0), core, cross="diamond",
          z0=top + 0.03, n=20, name="core")
    for sx in (-1, 1):
        cone(0.016, 0.1, black, loc=(sx * 0.05, 0, top - 0.04), rot=(0, sx * rad(125), 0), name="barb")
    spear_mane(top - 0.08, M_cloth((0.5, 0.02, 0.05), "tassel_blood"), n=6, length=0.4)
    view(diag=42, yaw=-22, fill=0.9, glow=1.0)


# =============================================================================
#  BODY ARMOUR
# =============================================================================
TORSO = [(0.36, 0.0), (0.33, 0.1), (0.295, 0.25), (0.305, 0.4), (0.355, 0.58), (0.37, 0.7),
         (0.36, 0.8), (0.3, 0.88), (0.2, 0.95), (0.16, 1.0)]
TSX, TSY = 1.0, 0.62


def torso_r(z, prof=None):
    prof = prof or TORSO
    if z <= prof[0][1]:
        return prof[0][0]
    for (r0, z0), (r1, z1) in zip(prof[:-1], prof[1:]):
        if z0 <= z <= z1:
            t = (z - z0) / max(z1 - z0, 1e-6)
            t = t * t * (3 - 2 * t)
            return r0 + (r1 - r0) * t
    return prof[-1][0]


def ridge_xsec(amount=0.06, width=0.35, front=-math.pi / 2):
    def f(a, z):
        d = (a - front + math.pi) % TAU - math.pi
        return 1 + amount * math.exp(-(d / width) ** 2)
    return f


def torso_pt(a, z, off=0.0, xsec=None, scale=1.0):
    """Point on the torso surface; a = -pi/2 is the front centre."""
    r = torso_r(z) * scale * (xsec(a, z) if xsec else 1.0) + off
    return Vector((r * math.cos(a) * TSX, r * math.sin(a) * TSY, z))


def torso_shell(mat, z0, z1, scale=1.0, xsec=None, n=24, thick=0.02, name="torso", seg=64,
                flare_bottom=0.0, cap=False):
    prof = []
    for i in range(n + 1):
        z = z0 + (z1 - z0) * i / n
        r = torso_r(z) * scale
        if flare_bottom:
            r *= 1 + flare_bottom * max(0, 1 - (z - z0) / 0.08) ** 2
        prof.append((r, z))
    ob = lathe(prof, mat, seg=seg, sx=TSX, sy=TSY, cap=cap, xsec=xsec, name=name, a0=0.0)
    if thick:
        solidify(ob, thick)
    return ob


def band_at(z, mat, scale=1.0, r=0.012, xsec=None, name="band", off=0.0):
    pts = [torso_pt(TAU * i / 64, z, off=off, xsec=xsec, scale=scale) for i in range(65)]
    return sweep(pts, r, mat, segs=8, caps=False, name=name)


def pauldron(mat, side, loc, size=0.2, layers=3, trim=None, spikes=0, spike_mat=None,
             sy=0.85):
    """Layered shoulder guard; side = -1 left, +1 right."""
    x, y, z = loc
    for k in range(layers):
        s = size * (1 - 0.1 * k)
        zz = z - k * size * 0.3
        prof = [(0, s * 0.55), (s * 0.5, s * 0.48), (s * 0.85, s * 0.28), (s, 0.0),
                (s * 1.02, -0.02 * s)]
        cx = x + side * k * size * 0.12
        ob = lathe(smooth_profile(prof, 4), mat, seg=40, loc=(cx, y, zz),
                   rot=(0, side * rad(35 + k * 8), 0), sx=1.0, sy=sy, cap=False, name="pauldron")
        solidify(ob, 0.014)
        if trim:
            torus(s * 1.0, 0.011, trim, loc=(cx, y, zz), rot=(0, side * rad(35 + k * 8), 0),
                  sx=1.0, sy=sy, seg=48, rseg=8, name="ptrim")
    if spikes:
        for k in range(spikes):
            a = rad(-35 + k * 35)
            p = Vector((x + side * size * 0.3, y + size * 0.35 * math.sin(a), z + size * 0.45))
            cone(size * 0.13, size * (0.75 - 0.2 * abs(k - (spikes - 1) / 2)), spike_mat or mat,
                 loc=p, rot=(0, side * rad(35), 0), name="spike")


def sleeve(mat, side, length=0.28, r0=0.105, r1=0.09, droop=0.5, trim=None):
    p0 = Vector((side * 0.3, 0, 0.83))
    d = Vector((side * 0.55, 0, -droop)).normalized()
    pts = [p0 + d * (length * i / 10) for i in range(11)]
    ob = sweep(pts, lambda s: r0 + (r1 - r0) * s, mat, segs=20, name="sleeve")
    if trim:
        torus(r1 * 1.02, 0.014, trim, loc=pts[-1], rot=d.to_track_quat("Z", "Y").to_euler(),
              seg=24, rseg=6, name="cuff")
    return ob


def belt(mat, z, buckle_mat=None, scale=1.06, h=0.06, buckle=True):
    prof = [(torso_r(z - h / 2) * scale, z - h / 2), (torso_r(z + h / 2) * scale, z + h / 2)]
    ob = lathe(prof, mat, seg=64, sx=TSX, sy=TSY, cap=False, name="belt")
    solidify(ob, 0.012)
    if buckle:
        p = torso_pt(-math.pi / 2, z, off=0.012, scale=scale)
        bm = buckle_mat or M_iron()
        torus(0.042, 0.009, bm, loc=p, rot=(rad(90), 0, 0), sx=1.0, sy=1.2, seg=24, rseg=6,
              name="buckle")
    return ob


@item("body_1")
def body_1():
    """Cloth tunic: linen, short sleeves, laced V-neck, rope belt."""
    linen = pbr("linen", (0.5, 0.4, 0.26), rough=0.9, sheen=0.7, bump=0.35, bump_scale=160,
                grunge=0.35, grunge_scale=5)
    cord = M_cloth((0.3, 0.2, 0.1), "cord_brown")
    torso_shell(linen, 0.0, 0.97, scale=1.0, flare_bottom=0.1, name="tunic")
    for side in (-1, 1):
        sleeve(linen, side, length=0.26, r0=0.11, r1=0.1, droop=0.55)
    # V-neck opening with lacing
    top = torso_pt(-math.pi / 2, 0.95, off=0.01)
    bot = torso_pt(-math.pi / 2, 0.72, off=0.01)
    extrude([(-0.07, 0.95), (0.07, 0.95), (0.0, 0.7)], 0.02, pbr("shadow", (0.05, 0.03, 0.02), rough=1),
            loc=(0, top.y - 0.004, 0), name="vneck")
    for k in range(4):
        z = 0.92 - k * 0.055
        w = 0.055 * (1 - k * 0.2)
        stroke2d((-w, z), (w, z - 0.05), 0.012, 0.012, cord, y=top.y - 0.01, name="lace")
        stroke2d((w, z), (-w, z - 0.05), 0.012, 0.012, cord, y=top.y - 0.01, name="lace")
    # rope belt with hanging ends
    band_at(0.3, cord, scale=1.03, r=0.02, name="rope")
    p = torso_pt(-math.pi / 2 + 0.4, 0.3, off=0.03)
    for k in (-1, 1):
        sweep([p, p + Vector((0.02 * k, -0.01, -0.12)), p + Vector((0.03 * k, -0.01, -0.2))], 0.014,
              cord, segs=8, name="rope_end")
    # neckline hem
    band_at(0.965, linen, scale=1.0, r=0.018, name="collar")
    view(yaw=0, pitch=8)


@item("body_2")
def body_2():
    """Leather armour: boiled-leather chest, shoulder pads, straps and studs."""
    dark = M_leather((0.22, 0.11, 0.05), "leather_dark_brown")
    light = M_leather((0.42, 0.24, 0.1), "leather_tan")
    iron = M_iron()
    torso_shell(dark, 0.0, 0.97, flare_bottom=0.08, name="jerkin")
    xs = ridge_xsec(0.05, 0.5)
    torso_shell(light, 0.45, 0.9, scale=1.05, xsec=xs, name="chest", thick=0.025)
    band_at(0.45, dark, scale=1.06, r=0.014, xsec=xs, name="edge")
    band_at(0.9, dark, scale=1.06, r=0.014, xsec=xs, name="edge")
    for side in (-1, 1):
        pauldron(light, side, (side * 0.36, 0.0, 0.84), 0.17, 2, trim=dark)
    # cross strap
    pts = [torso_pt(a, z, off=0.035, xsec=xs, scale=1.05) for a, z in
           [(-math.pi / 2 - 0.75, 0.86), (-math.pi / 2 - 0.3, 0.72), (-math.pi / 2 + 0.2, 0.56),
            (-math.pi / 2 + 0.7, 0.42)]]
    sweep(catmull(pts, 6), 0.022, dark, segs=8, ellipse=(0.35, 1.0), name="strap")
    # studs
    for a in (-math.pi / 2 - 0.55, -math.pi / 2 + 0.55):
        for z in (0.55, 0.65, 0.75):
            sphere(0.016, iron, loc=torso_pt(a, z, off=0.03, xsec=xs, scale=1.05), seg=12, rings=6,
                   name="stud")
    belt(dark, 0.3, iron, scale=1.07, h=0.07)
    # hanging tassets
    for a in (-math.pi / 2 - 0.45, -math.pi / 2 + 0.45):
        p = torso_pt(a, 0.26, off=0.03, scale=1.08)
        box((0.14, 0.02, 0.2), light, loc=(p.x, p.y, 0.16), rot=(0, 0, 0), bev=0.02, name="tasset")
        for z in (0.2, 0.1):
            sphere(0.013, iron, loc=(p.x, p.y - 0.012, z), seg=10, rings=6, name="stud")
    view(yaw=0, pitch=8)


@item("body_3")
def body_3():
    """Chain mail hauberk with leather collar and belt."""
    mail = pbr("chainmail", (0.62, 0.63, 0.66), metal=1, rough=0.35, pattern="chainmail",
               pattern_args=dict(density=34.0, scale=(1.0, 1.0, 1.6), bump=1.0))
    leather = M_leather((0.25, 0.13, 0.06))
    steel = M_steel()
    torso_shell(mail, -0.06, 0.95, flare_bottom=0.14, name="hauberk")
    for side in (-1, 1):
        sleeve(mail, side, length=0.3, r0=0.11, r1=0.1, droop=0.6, trim=leather)
    band_at(-0.055, leather, scale=1.14, r=0.016, name="hem")
    # coif-like collar
    lathe([(0.2, 0.9), (0.2, 1.02), (0.17, 1.06)], leather, seg=48, sx=TSX, sy=TSY * 1.1,
          cap=False, name="collar")
    band_at(0.9, leather, scale=1.02, r=0.02, name="collar_edge")
    belt(leather, 0.3, steel, scale=1.06, h=0.07)
    view(yaw=0, pitch=8)


@item("body_4")
def body_4():
    """Steel plate cuirass: ridged breastplate, articulated lames, tassets,
    layered pauldrons with brass trim."""
    steel = M_steel()
    trim = M_brass()
    xs = ridge_xsec(0.1, 0.4)
    torso_shell(steel, 0.42, 0.93, xsec=xs, name="breastplate", thick=0.025)
    band_at(0.425, trim, scale=1.0, r=0.011, xsec=xs, name="trim", off=0.012)
    for k in range(3):
        z1 = 0.42 - k * 0.085
        z0 = z1 - 0.1
        prof = [(torso_r(z0) * (1.06 + 0.02 * k), z0), (torso_r(z1) * (1.02 + 0.02 * k), z1)]
        ob = lathe(prof, steel, seg=64, sx=TSX, sy=TSY, cap=False, xsec=xs, name="lame")
        solidify(ob, 0.018)
        pts = [Vector((prof[0][0] * math.cos(TAU * i / 64) * xs(TAU * i / 64, 0) * TSX,
                       prof[0][0] * math.sin(TAU * i / 64) * xs(TAU * i / 64, 0) * TSY, z0))
               for i in range(65)]
        sweep(pts, 0.009, trim, segs=6, caps=False, name="lame_trim")
    # tassets
    for side in (-1, 1):
        a = -math.pi / 2 + side * 0.5
        p = torso_pt(a, 0.12, off=0.04, scale=1.12)
        extrude([(-0.09, 0.0), (0.09, 0.0), (0.08, -0.2), (0.0, -0.23), (-0.08, -0.2)], 0.02,
                steel, loc=(p.x, p.y, 0.12), rot=(0, 0, side * 0.25), bev=0.008, name="tasset")
    # gorget
    torus(0.19, 0.035, steel, loc=(0, 0, 0.95), sx=1.0, sy=0.72, name="gorget")
    torus(0.2, 0.011, trim, loc=(0, 0, 0.975), sx=1.0, sy=0.74, name="gorget_trim")
    for side in (-1, 1):
        pauldron(steel, side, (side * 0.37, 0.0, 0.84), 0.21, 3, trim=trim)
    for z in (0.62, 0.72, 0.82):
        for a in (-math.pi / 2 - 0.6, -math.pi / 2 + 0.6):
            sphere(0.014, trim, loc=torso_pt(a, z, off=0.028, xsec=xs), seg=10, rings=6,
                   name="rivet")
    view(yaw=0, pitch=8)


@item("body_5")
def body_5():
    """Holy armour: white enamel plate with gold trims, winged gold
    pauldrons and a tabard bearing a radiant cross."""
    white = pbr("enamel_white", (0.9, 0.9, 0.88), metal=0.0, rough=0.2, coat=1.0)
    gold = M_gold()
    cloth = M_cloth((0.9, 0.88, 0.82), "cloth_white")
    light = M_glow((1.0, 0.8, 0.4), "holy_cross", 1.2, base=(1.0, 0.75, 0.35))
    xs = ridge_xsec(0.1, 0.4)
    torso_shell(white, 0.36, 0.93, xsec=xs, name="breastplate", thick=0.025)
    band_at(0.365, gold, r=0.016, xsec=xs, off=0.012, name="trim")
    band_at(0.93, gold, r=0.016, xsec=xs, off=0.012, name="trim")
    # gold ridge line
    ridge = [torso_pt(-math.pi / 2, z, off=0.02, xsec=xs) for z in [0.4 + 0.5 * i / 20 for i in range(21)]]
    sweep(ridge, 0.01, gold, segs=8, name="ridge")
    # skirt
    torso_shell(cloth, -0.2, 0.37, scale=1.05, flare_bottom=0.0, name="skirt", thick=0.015)
    band_at(-0.19, gold, scale=1.05, r=0.014, name="skirt_trim")
    # tabard panel with radiant cross
    p = torso_pt(-math.pi / 2, 0.2, off=0.02, scale=1.08)
    extrude([(-0.13, 0.36), (0.13, 0.36), (0.13, -0.2), (0.0, -0.28), (-0.13, -0.2)], 0.012, cloth,
            loc=(0, p.y, 0), bev=0.004, name="tabard")
    extrude([(-0.13, 0.36), (0.13, 0.36), (0.13, -0.2), (0.0, -0.28), (-0.13, -0.2)], 0.008, gold,
            loc=(0, p.y + 0.004, 0), scale=(1.06, 1, 1.02), name="tabard_trim")
    cross_emblem(0.3, gold, (0, p.y - 0.012, 0.06), depth=0.014, flare=0.012)
    cross_emblem(0.22, light, (0, torso_pt(-math.pi / 2, 0.68, off=0.03, xsec=xs).y, 0.68),
                 depth=0.015, flare=0.01)
    for side in (-1, 1):
        pauldron(gold, side, (side * 0.37, 0.0, 0.84), 0.21, 2, trim=white)
        wing(side, gold, loc=(side * 0.45, 0.03, 0.9), scale=0.2, n=5, rows=2)
    torus(0.19, 0.035, gold, loc=(0, 0, 0.95), sx=1.0, sy=0.72, name="gorget")
    view(yaw=0, pitch=8, glow=0.8)


@item("body_6")
def body_6():
    """Dark plate: black armour with crimson trims, spiked pauldrons and a
    glowing blood gem."""
    black = pbr("dark_plate", (0.045, 0.04, 0.05), metal=1, rough=0.3, pattern="veins",
                pattern_args=dict(color=(1.0, 0.05, 0.03), strength=3.0, density=2.2, width=0.014,
                                  scale=(2.5, 2.5, 2.5)))
    bm = M_blackmetal()
    crimson = pbr("crimson_trim", (0.55, 0.03, 0.04), metal=1, rough=0.25,
                  emit=(1.0, 0.05, 0.03), emit_str=0.4, glow_str=0.25)
    xs = ridge_xsec(0.14, 0.35)
    torso_shell(black, 0.42, 0.93, xsec=xs, name="breastplate", thick=0.025)
    band_at(0.425, crimson, r=0.013, xsec=xs, off=0.012, name="trim")
    for k in range(3):
        z1 = 0.42 - k * 0.085
        z0 = z1 - 0.1
        prof = [(torso_r(z0) * (1.06 + 0.02 * k), z0), (torso_r(z1) * (1.02 + 0.02 * k), z1)]
        ob = lathe(prof, bm, seg=64, sx=TSX, sy=TSY, cap=False, xsec=xs, name="lame")
        solidify(ob, 0.018)
        pts = [Vector((prof[0][0] * math.cos(TAU * i / 64) * xs(TAU * i / 64, 0) * TSX,
                       prof[0][0] * math.sin(TAU * i / 64) * xs(TAU * i / 64, 0) * TSY, z0))
               for i in range(65)]
        sweep(pts, 0.009, crimson, segs=6, caps=False, name="lame_trim")
    for side in (-1, 1):
        a = -math.pi / 2 + side * 0.5
        p = torso_pt(a, 0.12, off=0.04, scale=1.12)
        extrude([(-0.09, 0.0), (0.09, 0.0), (0.06, -0.18), (0.0, -0.26), (-0.06, -0.18)], 0.02,
                bm, loc=(p.x, p.y, 0.12), rot=(0, 0, side * 0.25), bev=0.008, name="tasset")
    # horned gorget
    torus(0.19, 0.04, bm, loc=(0, 0, 0.95), sx=1.0, sy=0.72, name="gorget")
    torus(0.2, 0.012, crimson, loc=(0, 0, 0.98), sx=1.0, sy=0.74, name="gorget_trim")
    for side in (-1, 1):
        pauldron(bm, side, (side * 0.38, 0.0, 0.84), 0.23, 3, trim=crimson, spikes=3, spike_mat=bm)
    # blood gem in a spiked setting
    p = torso_pt(-math.pi / 2, 0.66, off=0.03, xsec=xs)
    lathe([(0, -0.02), (0.08, -0.02), (0.09, 0.0), (0.07, 0.025), (0, 0.025)], bm, seg=8,
          loc=p, rot=(rad(90), 0, 0), smooth=False, name="gem_setting")
    gem(0.06, M_gem((1.0, 0.04, 0.03), "blood_gem", 3.0), loc=p + Vector((0, -0.03, 0)), seg=12)
    view(yaw=0, pitch=8, glow=1.0)


# =============================================================================
#  HEADGEAR
# =============================================================================
def deform(ob, fn):
    me = ob.data
    for v in me.vertices:
        v.co = fn(v.co.copy())
    me.update()
    return ob


def ribbon_outline(pts2d, width_fn, n_cap=4):
    """Outline around a 2D path whose half-width varies: width_fn(t)."""
    P = [Vector(p) for p in pts2d]
    n = len(P)
    left, right = [], []
    for i in range(n):
        a = P[max(i - 1, 0)]
        b = P[min(i + 1, n - 1)]
        d = (b - a).normalized()
        nr = Vector((-d.y, d.x))
        w = width_fn(i / (n - 1))
        left.append(P[i] + nr * w)
        right.append(P[i] - nr * w)
    return [tuple(p) for p in left] + [tuple(p) for p in reversed(right)]


def plume(path2d, width, mat, y=0.0, depth=0.012, name="plume", rot=(0, 0, 0), loc=(0, 0, 0)):
    """Curved ostrich plume: wavy-edged ribbon."""
    def wfn(t):
        return width * (math.sin(math.pi * min(1, t * 1.1)) ** 0.6) * (1 - 0.35 * t) * \
            (1 + 0.12 * math.sin(t * 60))
    pts = ribbon_outline(path2d, wfn)
    return extrude(pts, depth, mat, loc=loc, rot=rot, bev=depth * 0.4, name=name, sharp=70)


def fluffy_plume(path, mat, length=0.12, n=36, droop=0.5, r=0.006, tip_mat=None):
    """Ostrich plume: a rachis along `path` (3D points) with drooping barbs."""
    path = resample(catmull(path, 10), 0.005)
    sweep(path, lambda s: r * (1 - 0.7 * s) + 0.001, mat, segs=6, name="rachis")
    T, N, B = frame_path(path)
    for i in range(n):
        t = (i + 0.5) / n
        k = int(t * (len(path) - 1))
        L = length * math.sin(math.pi * min(1.0, t * 1.08)) ** 0.5 * (1 - 0.3 * t)
        for sgn in (-1, 1):
            side = (B[k] * sgn).normalized()
            p0 = path[k]
            d = (side + T[k] * 0.5).normalized()
            p1 = p0 + d * L * 0.5 + Vector((0, 0, -droop * L * 0.15))
            p2 = p0 + d * L + T[k] * L * 0.2 + Vector((0, 0, -droop * L * 0.45))
            m = tip_mat if (tip_mat and t > 0.75) else mat
            sweep(bezier(p0, p1, (p1 + p2) / 2, p2, 6), lambda s: r * 1.4 * (1 - 0.8 * s),
                  m, segs=5, caps=False, name="barb")


@item("head_1")
def head_1():
    """Leather hood with a peaked cowl and a laced collar."""
    leather = pbr("hood_leather", (0.33, 0.2, 0.1), rough=0.6, bump=0.35, bump_scale=50, coat=0.1,
                  grunge=0.4, grunge_scale=6)
    void = pbr("hood_void", (0.0, 0.0, 0.0), rough=1.0, spec=0.0)
    prof = smooth_profile([(0.58, 0.0), (0.5, 0.08), (0.34, 0.26), (0.36, 0.45), (0.37, 0.62),
                           (0.3, 0.8), (0.14, 0.94), (0.0, 0.98)], 5)
    hood = lathe(prof, leather, seg=64, sy=1.0, cap=False, name="hood")

    def peak(co):
        if co.z > 0.55:
            k = (co.z - 0.55) / 0.43
            co.y += 0.2 * k * k
            co.z += 0.12 * k * k
            co.x *= 1 - 0.25 * k
        # hem wave
        if co.z < 0.12:
            a = math.atan2(co.y, co.x)
            co.z += 0.025 * math.sin(a * 7) * (1 - co.z / 0.12)
        return co
    deform(hood, peak)
    solidify(hood, 0.03)
    cut = sphere(0.25, leather, loc=(0, -0.38, 0.55), scale=(1.0, 1.0, 1.3), name="cut")
    boolean(hood, cut)
    sphere(0.3, void, loc=(0, 0.02, 0.56), scale=(0.95, 0.9, 1.05), name="void")
    # opening rim
    rim = []
    for i in range(49):
        a = TAU * i / 48
        rim.append((0.235 * math.cos(a), -0.3 - 0.06 * max(0, math.sin(a)) ** 2, 0.55 + 0.31 * math.sin(a)))
    sweep(rim, 0.022, leather, segs=10, caps=False, name="rim")
    # collar laces
    cord = M_cloth((0.75, 0.66, 0.48), "cord")
    for k in range(3):
        z = 0.24 - k * 0.05
        stroke2d((-0.06, z), (0.06, z - 0.035), 0.012, 0.012, cord, y=-0.36, name="lace")
        stroke2d((0.06, z), (-0.06, z - 0.035), 0.012, 0.012, cord, y=-0.36, name="lace")
    view(yaw=22, pitch=6)


@item("head_2")
def head_2():
    """Feathered wide-brimmed cavalier hat with a steel buckle."""
    felt = pbr("felt", (0.035, 0.025, 0.04), rough=0.7, sheen=0.0, spec=0.3, bump=0.2,
               bump_scale=120)
    band = M_cloth((0.5, 0.05, 0.05), "band_red")
    steel = M_steel()
    white = pbr("plume_white", (0.92, 0.9, 0.86), rough=0.7, sheen=0.9, sss=0.1)
    red = pbr("plume_red", (0.7, 0.06, 0.05), rough=0.7, sheen=0.9)
    brim = lathe(smooth_profile([(0.0, 0.0), (0.3, 0.0), (0.5, 0.01), (0.6, 0.045), (0.62, 0.07)], 4),
                 felt, seg=72, sy=0.92, cap=False, name="brim")

    def cock(co):
        # cock the brim up on the left side
        if co.x < -0.2:
            k = (-co.x - 0.2) / 0.42
            co.z += 0.22 * k * k
        return co
    deform(brim, cock)
    solidify(brim, 0.02)
    lathe(smooth_profile([(0.28, 0.0), (0.285, 0.12), (0.27, 0.22), (0.2, 0.3), (0.0, 0.33)], 4),
          felt, seg=64, sy=0.92, name="crown")
    solidify(lathe([(0.29, 0.0), (0.292, 0.07)], band, seg=64, sy=0.93, cap=False, name="band"),
             0.012)
    # buckle at the front
    box((0.1, 0.02, 0.08), steel, loc=(0.0, -0.275, 0.035), bev=0.01, name="buckle")
    box((0.06, 0.03, 0.045), band, loc=(0.0, -0.28, 0.035), bev=0.005, name="buckle_in")
    # plumes sweeping back over the crown
    fluffy_plume([(0.2, -0.18, 0.08), (0.34, -0.05, 0.2), (0.4, 0.12, 0.36), (0.22, 0.3, 0.46),
                  (-0.02, 0.36, 0.42)], white, length=0.2, n=70, r=0.009, tip_mat=red)
    fluffy_plume([(0.22, -0.2, 0.06), (0.38, -0.12, 0.12), (0.5, 0.0, 0.2), (0.56, 0.12, 0.16)],
                 red, length=0.13, n=36, r=0.009)
    view(yaw=18, pitch=16)


@item("head_3")
def head_3():
    """Iron great helm: eye slits, breathing holes and a riveted cross."""
    iron = pbr("helm_iron", (0.3, 0.29, 0.28), metal=1, rough=0.42, noise_rough=0.15, bump=0.1,
               grunge=0.45, grunge_scale=5)
    dark = M_darkiron()
    void = pbr("helm_void", (0.0, 0.0, 0.0), rough=1.0, spec=0.0)
    brass = M_brass()
    helm = lathe(smooth_profile([(0.0, 0.0), (0.3, 0.0), (0.31, 0.2), (0.315, 0.45), (0.3, 0.6),
                                 (0.24, 0.72), (0.12, 0.78), (0.0, 0.8)], 5), iron, seg=64,
                 sy=1.05, name="helm", cap=True)
    for sx in (-1, 1):
        c = box((0.2, 0.3, 0.035), iron, loc=(sx * 0.12, -0.3, 0.5), name="slit")
        boolean(helm, c)
    for k in range(4):
        for j in range(2):
            c = cyl(0.014, 0.3, iron, loc=(0.06 + k * 0.05, -0.3, 0.26 - j * 0.06),
                    rot=(rad(90), 0, 0), seg=10, name="breath")
            boolean(helm, c)
    lathe([(0.0, 0.02), (0.28, 0.02), (0.29, 0.7), (0.0, 0.7)], void, seg=32, sy=1.0, name="void")
    # riveted cross reinforcement
    front = []
    for i in range(21):
        z = 0.06 + 0.7 * i / 20
        r = torso_r_generic(z)
        front.append((0, -r * 1.05 - 0.01, z))
    sweep(front, 0.03, dark, segs=4, ellipse=(0.4, 1.0), name="nasal")
    band = [(0.325 * math.cos(a), 0.325 * 1.05 * math.sin(a), 0.585) for a in
            [TAU * i / 64 for i in range(65)]]
    sweep(band, 0.024, dark, segs=4, ellipse=(1.0, 0.6), caps=False, name="brow")
    band2 = [(0.312 * math.cos(a), 0.312 * 1.05 * math.sin(a), 0.03) for a in
             [TAU * i / 64 for i in range(65)]]
    sweep(band2, 0.02, dark, segs=6, caps=False, name="rim")
    for z in (0.12, 0.3, 0.68):
        sphere(0.016, brass, loc=(0, -0.345, z), seg=10, rings=6, name="rivet")
    for a in (-math.pi / 2 - 0.5, -math.pi / 2 + 0.5, -math.pi / 2 - 1.0, -math.pi / 2 + 1.0):
        sphere(0.015, brass, loc=(0.34 * math.cos(a), 0.34 * 1.05 * math.sin(a), 0.585), seg=10,
               rings=6, name="rivet")
    view(yaw=24, pitch=6)


def torso_r_generic(z):
    prof = [(0.3, 0.0), (0.31, 0.2), (0.315, 0.45), (0.3, 0.6), (0.24, 0.72), (0.12, 0.78),
            (0.0, 0.8)]
    for (r0, z0), (r1, z1) in zip(prof[:-1], prof[1:]):
        if z0 <= z <= z1:
            t = (z - z0) / (z1 - z0)
            return r0 + (r1 - r0) * t
    return 0.0


@item("head_4")
def head_4():
    """Silver circlet: filigree band with a glowing sapphire crest."""
    silver = M_silver()
    gem_m = M_gem((0.2, 0.5, 1.0), "sapphire_glow", 2.0)
    rune = M_glow((0.35, 0.7, 1.0), "rune_blue", 8)
    band = [(0.36 * math.cos(a), 0.36 * math.sin(a), 0.02 * math.cos(2 * a)) for a in
            [TAU * i / 96 for i in range(97)]]
    sweep(band, 0.022, silver, segs=10, ellipse=(0.45, 1.0), caps=False, name="band")
    band2 = [(0.36 * math.cos(a), 0.36 * math.sin(a), 0.045 + 0.02 * math.cos(2 * a)) for a in
             [TAU * i / 96 for i in range(97)]]
    sweep(band2, 0.008, silver, segs=8, caps=False, name="band_top")
    # crest at the front
    half = [(0.0, 0.3), (0.04, 0.2), (0.1, 0.12), (0.2, 0.06), (0.24, 0.0), (0.12, 0.02),
            (0.06, -0.02), (0.0, -0.03)]
    extrude(mirror_x(half), 0.02, silver, loc=(0, -0.37, 0.02), bev=0.006, name="crest")
    for sx in (-1, 1):
        extrude(thick_polyline(catmull_2d([(sx * 0.03, 0.2), (sx * 0.09, 0.14), (sx * 0.17, 0.08),
                                           (sx * 0.2, 0.03)], 6), 0.012), 0.024, rune,
                loc=(0, -0.375, 0.02), name="filigree")
    gem(0.06, gem_m, loc=(0, -0.39, 0.12), seg=12, cut="step", scale=(1, 1, 1.3))
    for sx in (-1, 1):
        gem(0.022, gem_m, loc=(sx * 0.14, -0.385, 0.06), seg=8)
    view(yaw=0, pitch=24, glow=0.9)


@item("head_5")
def head_5():
    """Gold crown: fleur-de-lis points, jewelled band, velvet cap and cross."""
    gold = M_gold()
    velvet = pbr("velvet", (0.12, 0.0, 0.012), rough=0.7, sheen=0.15, bump=0.2, bump_scale=80)
    rubies = M_gem((0.95, 0.05, 0.08), "ruby", 1.0)
    saph = M_gem((0.1, 0.3, 1.0), "sapphire", 1.0)
    emer = M_gem((0.05, 0.8, 0.3), "emerald", 1.0)
    pearl = pbr("pearl", (0.95, 0.93, 0.9), rough=0.25, coat=0.8)
    solidify(lathe([(0.34, 0.0), (0.36, 0.02), (0.36, 0.16), (0.34, 0.18)], gold, seg=72,
                   cap=False, name="band"), 0.02)
    torus(0.365, 0.014, gold, loc=(0, 0, 0.02), seg=72, rseg=8, name="rim_low")
    torus(0.36, 0.012, gold, loc=(0, 0, 0.17), seg=72, rseg=8, name="rim_high")
    lathe(smooth_profile([(0.33, 0.1), (0.34, 0.25), (0.25, 0.4), (0.0, 0.45)], 4), velvet, seg=48,
          cap=False, name="cap")
    # fleur-de-lis and pearl points
    fleur = [(0.0, 0.3), (0.035, 0.24), (0.03, 0.18), (0.08, 0.22), (0.1, 0.16), (0.06, 0.1),
             (0.03, 0.1), (0.04, 0.0), (0.0, 0.0)]
    n = 8
    for k in range(n):
        a = TAU * k / n - math.pi / 2
        x, y = 0.355 * math.cos(a), 0.355 * math.sin(a)
        rot = (0, 0, a + math.pi / 2)
        if k % 2 == 0:
            extrude(mirror_x(fleur), 0.02, gold, loc=(x, y, 0.16), rot=rot, bev=0.006,
                    name="fleur")
        else:
            extrude(mirror_x([(0.0, 0.16), (0.02, 0.1), (0.04, 0.0), (0.0, 0.0)]), 0.02, gold,
                    loc=(x, y, 0.16), rot=rot, bev=0.005, name="point")
            sphere(0.022, pearl, loc=(x * 1.0, y * 1.0, 0.34), name="pearl")
        gm = (rubies, saph, emer)[k % 3]
        gem(0.03, gm, loc=(0.37 * math.cos(a + TAU / 16), 0.37 * math.sin(a + TAU / 16), 0.095),
            rot=(0, rad(90), a + TAU / 16), seg=10, cut="cabochon")
    # cross on the orb
    sphere(0.05, gold, loc=(0, 0, 0.47), name="orb")
    cross_emblem(0.14, gold, (0, 0, 0.58), depth=0.025, flare=0.012)
    gem(0.04, rubies, loc=(0, -0.375, 0.095), rot=(rad(90), 0, 0), seg=12)
    view(yaw=0, pitch=18)


@item("head_6")
def head_6():
    """Horned demon helm: black spiked helm with ram horns and burning eyes."""
    black = pbr("demon_helm", (0.05, 0.045, 0.055), metal=1, rough=0.3, pattern="veins",
                pattern_args=dict(color=(1.0, 0.06, 0.02), strength=2.0, density=1.6, width=0.01,
                                  scale=(3, 3, 3)))
    bm = M_blackmetal()
    horn = pbr("horn", (0.18, 0.12, 0.09), rough=0.4, coat=0.4, bump=0.3, bump_scale=30)
    horn_tip = pbr("horn_tip", (0.85, 0.78, 0.62), rough=0.35, coat=0.4)
    eye_m = M_glow((1.0, 0.12, 0.04), "demon_eyes", 14)
    void = pbr("helm_void", (0.0, 0.0, 0.0), rough=1.0, spec=0.0)
    helm = lathe(smooth_profile([(0.0, 0.0), (0.3, 0.0), (0.33, 0.15), (0.32, 0.45), (0.28, 0.64),
                                 (0.16, 0.8), (0.0, 0.9)], 5), black, seg=64, sy=1.08,
                 xsec=ridge_xsec(0.18, 0.3), name="helm")
    # angular eye slits
    for sx in (-1, 1):
        c = extrude([(sx * 0.03, 0.45), (sx * 0.2, 0.52), (sx * 0.19, 0.46), (sx * 0.04, 0.41)], 0.4,
                    bm, loc=(0, -0.3, 0), name="slit")
        boolean(helm, c)
    lathe([(0.0, 0.02), (0.27, 0.02), (0.28, 0.7), (0.0, 0.7)], void, seg=32, name="void")
    for sx in (-1, 1):
        sphere(0.05, eye_m, loc=(sx * 0.11, -0.27, 0.47), scale=(1.7, 0.5, 0.6), name="eye")
    # angular brow plate and cheek guards
    brow = [(-0.26, 0.56), (0.0, 0.5), (0.26, 0.56), (0.24, 0.62), (0.0, 0.58), (-0.24, 0.62)]
    extrude(brow, 0.05, bm, loc=(0, -0.325, 0), bev=0.008, name="brow")
    for sx in (-1, 1):
        cheek = [(sx * 0.05, 0.38), (sx * 0.24, 0.42), (sx * 0.26, 0.14), (sx * 0.1, 0.04)]
        extrude(cheek, 0.03, bm, loc=(0, -0.3, 0), rot=(0, 0, sx * 0.35), bev=0.006, name="cheek")
    # mouth grille
    for k in range(5):
        x = -0.1 + k * 0.05
        c = box((0.022, 0.4, 0.14), bm, loc=(x, -0.3, 0.2), name="grille")
        boolean(helm, c)
    # crest of spikes
    pts, nrms = [], []
    for k in range(5):
        a = -0.5 + k * 0.25
        pts.append((0, 0.3 * math.sin(a) * 1.0, 0.8 * math.cos(a) * 0.95))
        nrms.append((0, math.sin(a) * 0.6, 1))
    spikes_on_points(pts, nrms, 0.14, 0.03, bm, name="crest")
    # ram horns
    for sx in (-1, 1):
        p0 = Vector((sx * 0.26, 0.02, 0.55))
        path = bezier(p0, p0 + Vector((sx * 0.3, 0.02, 0.18)), p0 + Vector((sx * 0.5, 0.05, -0.1)),
                      p0 + Vector((sx * 0.46, -0.1, 0.36)), 48)
        sweep(path, lambda s: 0.11 * (1 - s) ** 0.8 + 0.004, horn, segs=16,
              radial=lambda s, th, L: 1 + 0.06 * max(0, math.sin(L * 90)), name="horn")
        tip = path[-10:]
        sweep(tip, lambda s: 0.11 * (1 - (0.8 + 0.2 * s)) ** 0.8 * 1.05 + 0.004, horn_tip, segs=16,
              name="horn_tip")
    torus(0.3, 0.02, bm, loc=(0, 0, 0.02), sy=1.08, seg=64, rseg=8, name="rim")
    view(yaw=22, pitch=6, glow=1.0)


# =============================================================================
#  CLOAKS
# =============================================================================
class Cape:
    """Parametric cape surface.  u in [-1, 1] runs around the body (0 = back
    centre, +-1 = front edges), v in [0, 1] from the neck down to the hem.
    The camera sees the lining (inside) with the front edges wrapping toward
    it."""

    def __init__(self, H=1.1, r_neck=0.17, r_sh=0.34, r_bot=0.56, wrap_top=150, wrap_sh=118,
                 wrap_bot=112, folds=7, fold_amp=0.07, hem=None, phase=0.3, sway=0.0):
        self.__dict__.update(locals())
        self.hem = hem or (lambda u: 0.0)

    def R(self, v):
        if v < 0.12:
            k = v / 0.12
            k = k * k * (3 - 2 * k)
            return self.r_neck + (self.r_sh - self.r_neck) * k
        k = (v - 0.12) / 0.88
        return self.r_sh + (self.r_bot - self.r_sh) * k ** 0.9

    def wrap(self, v):
        if v < 0.12:
            k = v / 0.12
            return rad(self.wrap_top + (self.wrap_sh - self.wrap_top) * k)
        k = (v - 0.12) / 0.88
        return rad(self.wrap_sh + (self.wrap_bot - self.wrap_sh) * k)

    def P(self, u, v, off=0.0):
        phi = u * self.wrap(v)
        amp = self.fold_amp * max(0.0, v - 0.1) ** 0.8
        r = self.R(v) + amp * math.sin(u * self.folds * math.pi + self.phase) + off
        z = -self.H * v * (1 + self.hem(u) * v ** 4)
        z += 0.03 * math.sin(u * self.folds * math.pi + self.phase + 1.2) * v ** 4
        x = r * math.sin(phi) + self.sway * v * v
        y = r * math.cos(phi)
        # shoulders: drop the sides a little
        z -= 0.05 * abs(math.sin(phi)) * min(1.0, v / 0.12) * (1 - v)
        return Vector((x, y, z))

    def build(self, outer, inner, nu=96, nv=48, thick=0.018, name="cape"):
        verts, faces = [], []
        for j in range(nv + 1):
            v = j / nv
            for i in range(nu + 1):
                u = -1 + 2 * i / nu
                verts.append(self.P(u, v))
        W = nu + 1
        for j in range(nv):
            for i in range(nu):
                a = j * W + i
                faces.append((a, a + 1, a + 1 + W, a + W))
        ob = make_mesh(name, verts, faces, mats=[outer, inner], smooth=True)
        md = ob.modifiers.new("Solidify", "SOLIDIFY")
        md.thickness = thick
        md.offset = -1.0
        md.material_offset = 1
        md.material_offset_rim = 0
        return ob

    def edge_path(self, which, off=0.012, n=60):
        if which == "hem":
            return [self.P(-1 + 2 * i / n, 1.0, off) + Vector((0, 0, -0.004)) for i in range(n + 1)]
        u = -1.0 if which == "left" else 1.0
        return [self.P(u * 0.995, i / n, off) for i in range(n + 1)]


def collar_stand(outer, inner, r0=0.17, r1=0.34, h=0.34, wrap=135, flare=0.12, name="collar"):
    verts, faces = [], []
    nu, nv = 48, 10
    for j in range(nv + 1):
        t = j / nv
        for i in range(nu + 1):
            u = -1 + 2 * i / nu
            phi = u * rad(wrap)
            r = r0 + (r1 - r0) * t + flare * t * t * abs(u)
            z = h * t * (1 + 0.35 * abs(u))
            verts.append((r * math.sin(phi), r * math.cos(phi), z))
    W = nu + 1
    for j in range(nv):
        for i in range(nu):
            a = j * W + i
            faces.append((a, a + W, a + 1 + W, a + 1))
    ob = make_mesh(name, verts, faces, mats=[outer, inner], smooth=True)
    md = ob.modifiers.new("Solidify", "SOLIDIFY")
    md.thickness = 0.02
    md.offset = 1.0
    md.material_offset = 1
    return ob


def clasp_pair(cape, mat, jewel=None, chain_mat=None, v=0.04, r=0.045):
    pL = cape.P(-0.97, v, 0.02)
    pR = cape.P(0.97, v, 0.02)
    for p in (pL, pR):
        lathe([(0, -0.012), (r, -0.012), (r * 1.1, 0.0), (r * 0.8, 0.014), (0, 0.016)], mat,
              seg=28, loc=p, rot=(rad(90), 0, 0), name="clasp")
        if jewel:
            gem(r * 0.55, jewel, loc=p + Vector((0, -0.016, 0)), seg=10)
    if chain_mat:
        mid = (pL + pR) / 2 + Vector((0, -0.02, -0.06))
        chain(bezier(pL, pL + (mid - pL) * 0.6, pR + (mid - pR) * 0.6, pR, 20), chain_mat,
              link_len=0.05, wire=0.007)
    return pL, pR


def fur_collar(cape, mat, r=0.06):
    pts = [cape.P(-0.98 + 1.96 * i / 60, 0.02, 0.03) for i in range(61)]
    ob = sweep(pts, r, mat, segs=16, radial=lambda s, th, L: 1 + 0.18 * math.sin(th * 7 + L * 80)
               * math.sin(L * 37 + th * 3), name="fur")
    return ob


@item("cloak_1")
def cloak_1():
    """Brown wool travelling cloak with a wooden toggle."""
    outer = pbr("wool_brown", (0.26, 0.15, 0.08), rough=0.9, sheen=0.4, bump=0.4, bump_scale=90,
                grunge=0.35, grunge_scale=5)
    inner = pbr("wool_brown_in", (0.17, 0.1, 0.06), rough=0.9, sheen=0.3, bump=0.3, bump_scale=90)
    c = Cape(hem=lambda u: 0.03 * math.sin(u * 17) + 0.02 * math.sin(u * 7))
    c.build(outer, inner)
    # rolled hood lying on the shoulders
    pts = [c.P(-0.9 + 1.8 * i / 50, 0.03, 0.05) + Vector((0, 0, 0.02)) for i in range(51)]
    sweep(pts, lambda s: 0.06 + 0.03 * math.sin(s * math.pi), outer, segs=16, name="hood_roll")
    wood = M_wood((0.4, 0.24, 0.1), "toggle_wood")
    cord = M_cloth((0.6, 0.5, 0.35), "cord")
    pL, pR = c.P(-0.97, 0.06, 0.03), c.P(0.97, 0.06, 0.03)
    sweep(bezier(pL, pL + Vector((0.04, -0.03, -0.03)), pR + Vector((-0.04, -0.03, -0.03)), pR, 16),
          0.008, cord, segs=6, name="cord")
    cyl(0.018, 0.1, wood, loc=(pL + pR) / 2 + Vector((0, -0.04, -0.03)), rot=(0, rad(90), rad(10)),
        seg=12, name="toggle")
    view(yaw=18, pitch=6)


@item("cloak_2")
def cloak_2():
    """Blue cape with a grey fur collar and steel clasps."""
    outer = pbr("cape_blue", (0.06, 0.12, 0.38), rough=0.7, sheen=0.5, bump=0.2, bump_scale=110)
    inner = pbr("cape_blue_in", (0.03, 0.05, 0.16), rough=0.7, sheen=0.4)
    fur = pbr("fur_grey", (0.55, 0.53, 0.5), rough=0.9, sheen=1.0, bump=0.8, bump_scale=200)
    steel = M_steel()
    c = Cape(hem=lambda u: 0.015 * math.sin(u * 9))
    c.build(outer, inner)
    fur_collar(c, fur, r=0.065)
    clasp_pair(c, steel, chain_mat=steel)
    view(yaw=18, pitch=6)


@item("cloak_3")
def cloak_3():
    """Crimson cape with silver trim and ruby clasps."""
    outer = pbr("cape_red", (0.42, 0.02, 0.03), rough=0.55, sheen=0.5, coat=0.1)
    inner = pbr("cape_red_in", (0.2, 0.01, 0.02), rough=0.6, sheen=0.4)
    silver = M_silver()
    c = Cape(folds=8, fold_amp=0.06)
    c.build(outer, inner)
    for which in ("left", "right", "hem"):
        sweep(c.edge_path(which, off=0.0), 0.012, silver, segs=6, name="trim")
    sweep([c.P(-0.98 + 1.96 * i / 60, 0.0, 0.01) for i in range(61)], 0.02, silver, segs=8,
          name="collar_trim")
    clasp_pair(c, silver, jewel=M_gem((0.9, 0.04, 0.06), "ruby", 1.0), chain_mat=silver)
    view(yaw=18, pitch=6)


@item("cloak_4")
def cloak_4():
    """Vampire cape: black outside, blood-red satin lining, high collar and a
    glowing crystal clasp."""
    outer = pbr("cape_black", (0.02, 0.018, 0.022), rough=0.45, sheen=0.3, coat=0.2)
    inner = pbr("satin_red", (0.5, 0.01, 0.03), rough=0.28, sheen=0.4, coat=0.3)
    c = Cape(folds=6, fold_amp=0.07, hem=lambda u: 0.05 * abs(math.sin(u * 2.5 * math.pi)))
    c.build(outer, inner)
    collar_stand(outer, inner, r0=0.17, r1=0.3, h=0.36, wrap=128)
    bm = M_blackmetal()
    clasp_pair(c, bm, jewel=M_gem((1.0, 0.05, 0.08), "blood_crystal", 2.5), chain_mat=bm)
    view(yaw=18, pitch=6, glow=0.8)


@item("cloak_5")
def cloak_5():
    """White holy mantle: layered capelet, gold trim, radiant cross clasp."""
    outer = pbr("mantle_white", (0.88, 0.86, 0.82), rough=0.6, sheen=0.5, bump=0.15, bump_scale=110)
    inner = pbr("mantle_cream", (0.72, 0.62, 0.45), rough=0.5, sheen=0.5)
    gold = M_gold()
    light = M_glow((1.0, 0.88, 0.55), "holy_light", 5.0, base=(1.0, 0.88, 0.6))
    c = Cape(folds=7, fold_amp=0.05)
    c.build(outer, inner)
    for which in ("left", "right", "hem"):
        sweep(c.edge_path(which, off=0.0), 0.016, gold, segs=6, name="trim")
    cap = Cape(H=0.42, r_neck=0.18, r_sh=0.37, r_bot=0.46, wrap_top=150, wrap_sh=125, wrap_bot=122,
               folds=9, fold_amp=0.03)
    cap.build(outer, inner, name="capelet")
    sweep(cap.edge_path("hem", off=0.0), 0.016, gold, segs=6, name="trim")
    # gold crosses embroidered along the capelet hem
    for u in (-0.55, -0.2, 0.2, 0.55):
        p = cap.P(u, 0.85, -0.03)
        q = cap.P(u, 0.85, 0.0)
        n = (q - p).normalized()
        cross_emblem(0.08, gold, p - n * 0.004, depth=0.01,
                     rot=(0, 0, math.atan2(n.x, -n.y) + math.pi))
    pL, pR = clasp_pair(c, gold, chain_mat=gold, r=0.05)
    cross_emblem(0.13, light, (pL + pR) / 2 + Vector((0, -0.05, -0.07)), depth=0.02, flare=0.01)
    view(yaw=18, pitch=6, glow=0.8)


@item("cloak_6")
def cloak_6():
    """Bat-wing cloak: scalloped membrane between bony ribs, spiked collar and
    a blood-red clasp."""
    outer = pbr("membrane_out", (0.035, 0.02, 0.035), rough=0.4, sheen=0.3, coat=0.3,
                bump=0.3, bump_scale=40)
    inner = pbr("membrane_in", (0.13, 0.008, 0.025), rough=0.4, coat=0.3, pattern="veins",
                pattern_args=dict(color=(0.9, 0.02, 0.05), strength=1.5, density=3.0, width=0.02,
                                  scale=(2, 2, 2)))
    rib_m = pbr("rib_bone", (0.32, 0.27, 0.24), rough=0.35, coat=0.5)
    n_sc = 3.0

    def hem(u):
        # scallops: the membrane is pulled up between the ribs
        return -0.22 * abs(math.sin(u * n_sc * math.pi / 2 * 2)) ** 0.8 + 0.05

    c = Cape(folds=6, fold_amp=0.035, hem=hem, wrap_bot=125, r_bot=0.62)
    c.build(outer, inner)
    # ribs along the scallop points (where hem is lowest)
    k = int(n_sc * 2)
    for i in range(k + 1):
        u = -1 + 2 * i / k
        pts = [c.P(u, 0.05 + 0.95 * j / 30, 0.02) for j in range(31)]
        sweep(pts, lambda s: 0.026 * (1 - 0.6 * s) + 0.005, rib_m, segs=8, name="rib")
        cone(0.015, 0.07, rib_m, loc=pts[-1], rot=(math.pi, 0, 0), seg=8, name="claw")
    collar_stand(outer, inner, r0=0.17, r1=0.32, h=0.3, wrap=125, flare=0.2)
    spikes_on_points([c.P(u, 0.0, 0.0) + Vector((0, 0, 0.28 + 0.1 * abs(u))) for u in (-0.9, -0.6, 0.6, 0.9)],
                     [(math.sin(u * 2), -0.2, 1) for u in (-0.9, -0.6, 0.6, 0.9)], 0.12, 0.025,
                     rib_m, name="collar_spike")
    bm = M_blackmetal()
    clasp_pair(c, bm, jewel=M_gem((1.0, 0.04, 0.03), "blood_gem", 3.0), chain_mat=bm)
    view(yaw=18, pitch=6, glow=1.0)


# =============================================================================
#  RINGS  (band in the XZ plane, hole facing the camera, top = +Z)
# =============================================================================
def ring_band(mat, R=0.36, w=0.09, t=0.05, seg=72, top_swell=0.6, twist=0, name="band"):
    """Ring band; thicker/wider toward the top (shoulders)."""
    verts, faces = [], []
    rseg = 16
    for i in range(seg):
        a = TAU * i / seg + math.pi / 2
        sw = 1 + top_swell * max(0.0, math.sin(a)) ** 3
        ca, sa = math.cos(a), math.sin(a)
        for j in range(rseg):
            b = TAU * j / rseg + twist * a
            cb, sb = math.cos(b), math.sin(b)
            rr = t * sw * 0.5 * (abs(cb) ** 0.55) * (1 if cb >= 0 else -1)
            yy = w * sw * 0.5 * (abs(sb) ** 0.55) * (1 if sb >= 0 else -1)
            rad_ = R + t * 0.5 + rr
            verts.append((rad_ * ca, yy, rad_ * sa))
    for i in range(seg):
        for j in range(rseg):
            i2, j2 = (i + 1) % seg, (j + 1) % rseg
            faces.append((i * rseg + j, i * rseg + j2, i2 * rseg + j2, i2 * rseg + j))
    return make_mesh(name, verts, faces, mat)


def twisted_band(mat, R=0.37, r=0.022, strands=2, turns=9, name="twist"):
    for k in range(strands):
        pts = []
        for i in range(257):
            a = TAU * i / 256
            ph = a * turns + TAU * k / strands
            rr = R + r * 0.9 * math.cos(ph)
            pts.append((rr * math.cos(a), r * 0.9 * math.sin(ph), rr * math.sin(a)))
        sweep(pts, r, mat, segs=10, caps=False, name=name)


def prong_setting(mat, z, r, n=4, h=0.12, prong_r=0.013):
    lathe([(0, z - 0.03), (r * 0.5, z - 0.03), (r * 0.9, z + h * 0.3),
           (r * 0.95, z + h * 0.42), (0, z + h * 0.42)], mat, seg=28, name="setting")
    for k in range(n):
        a = TAU * (k + 0.5) / n
        p0 = Vector((r * 0.6 * math.cos(a), r * 0.6 * math.sin(a), z))
        p1 = Vector((r * 1.05 * math.cos(a), r * 1.05 * math.sin(a), z + h * 0.6))
        p2 = Vector((r * 0.78 * math.cos(a), r * 0.78 * math.sin(a), z + h * 1.02))
        sweep(bezier(p0, p0 + Vector((0, 0, h * 0.3)), p1, p2, 10),
              lambda s: prong_r * (1 - 0.35 * s), mat, segs=8, name="prong")


@item("ring_1")
def ring_1():
    """Iron signet ring."""
    iron = pbr("ring_iron", (0.3, 0.29, 0.28), metal=1, rough=0.45, noise_rough=0.15,
               grunge=0.5, grunge_scale=8, bump=0.15, bump_scale=30)
    ring_band(iron, w=0.12, t=0.07, top_swell=0.5)
    lathe(smooth_profile([(0, 0.38), (0.13, 0.38), (0.15, 0.42), (0.14, 0.45), (0, 0.46)], 3), iron,
          seg=40, sy=0.8, name="signet")
    dark = M_darkiron()
    stroke2d((-0.05, 0.0), (0.05, 0.0), 0.02, 0.02, dark, y=0.0, name="mark").location = (0, 0, 0.462)
    view(yaw=30, pitch=24)


@item("ring_2")
def ring_2():
    """Steel ring set with a ruby."""
    steel = M_steel()
    ring_band(steel, top_swell=0.9)
    prong_setting(steel, 0.4, 0.15, n=4, h=0.15, prong_r=0.016)
    gem(0.16, M_gem((0.85, 0.02, 0.05), "ruby", 0.6), loc=(0, 0, 0.54), rot=(0, 0, 0), seg=12,
        name="ruby")
    view(yaw=32, pitch=18)


@item("ring_3")
def ring_3():
    """Silver twisted ring: six-prong sapphire flanked by diamonds."""
    silver = M_silver()
    twisted_band(silver, R=0.37, r=0.024, strands=2, turns=10)
    prong_setting(silver, 0.4, 0.17, n=6, h=0.16, prong_r=0.016)
    gem(0.18, M_gem((0.1, 0.3, 1.0), "sapphire", 0.8), loc=(0, 0, 0.56), rot=(0, 0, 0), seg=14)
    for sx in (-1, 1):
        a = math.pi / 2 + sx * 0.42
        p = Vector((0.43 * math.cos(a), -0.0, 0.43 * math.sin(a)))
        gem(0.038, M_gem((0.9, 0.95, 1.0), "diamond", 0.8), loc=p, rot=(0, -sx * 0.42, 0), seg=10)
    view(yaw=32, pitch=18)


@item("ring_4")
def ring_4():
    """Runic emerald ring: engraved band with glowing green runes, large
    step-cut emerald in a bezel."""
    band_m = pbr("rune_silver", (0.75, 0.8, 0.82), metal=1, rough=0.22)
    rune = M_glow((0.25, 1.0, 0.45), "rune_green", 8)
    emer = M_gem((0.05, 0.85, 0.35), "emerald", 1.4)
    ring_band(band_m, w=0.12, t=0.06, top_swell=0.8)
    # runes around the visible front face of the band
    for i in range(12):
        a = math.pi / 2 + (i - 5.5) * 0.36
        if abs(math.sin(a) - 1) < 0.05:
            continue
        p = Vector((0.39 * math.cos(a), -0.063, 0.39 * math.sin(a)))
        box((0.016, 0.012, 0.055), rune, loc=p, rot=(0, -(a - math.pi / 2), 0), name="rune")
        box((0.04, 0.012, 0.014), rune, loc=p + Vector((0.0, 0, 0.0)), rot=(0, -(a - math.pi / 2) + 0.7, 0),
            name="rune")
    # bezel
    lathe([(0, 0.37), (0.22, 0.37), (0.24, 0.46), (0.21, 0.5), (0, 0.5)], band_m, seg=4,
          sx=1.0, sy=0.8, a0=math.pi / 4, smooth=False, name="bezel")
    lathe([(0, 0.46), (0.15, 0.46), (0.17, 0.54), (0.11, 0.6), (0, 0.61)], emer, seg=4,
          sy=0.8, a0=math.pi / 4, smooth=False, name="emerald")
    view(yaw=32, pitch=20, glow=0.9)


@item("ring_5")
def ring_5():
    """Skull ring: heavy gold band crowned with a silver skull with ruby eyes."""
    gold = M_gold()
    silver = pbr("skull_silver", (0.88, 0.88, 0.9), metal=1, rough=0.22)
    ruby = M_glow((1.0, 0.05, 0.05), "ruby_eye", 6)
    ring_band(gold, w=0.13, t=0.07, top_swell=1.0)
    skull(silver, loc=(0, -0.02, 0.6), rot=(rad(-8), 0, 0), scale=0.42, eye_mat=ruby,
          socket_mat=pbr("skull_socket", (0.02, 0.01, 0.01), rough=0.9))
    view(yaw=24, pitch=12, glow=0.9)


@item("ring_6")
def ring_6():
    """Blood moon ring: black claw band gripping a huge glowing red orb, with
    bat wings on the shoulders."""
    bm = M_blackmetal()
    orb = pbr("blood_moon", (0.6, 0.01, 0.02), rough=0.08, trans=0.3, coat=1.0,
              emit=(1.0, 0.06, 0.03), emit_str=2.5, glow_str=0.8)
    ring_band(bm, w=0.1, t=0.06, top_swell=0.9)
    lathe([(0, 0.36), (0.12, 0.37), (0.14, 0.43), (0, 0.43)], bm, seg=8, smooth=False,
          name="cup")
    sphere(0.22, orb, loc=(0, 0, 0.62), name="orb")
    for k in range(4):
        a = TAU * (k + 0.5) / 4
        d = Vector((math.cos(a), math.sin(a), 0))
        p0 = Vector((0, 0, 0.42)) + d * 0.1
        sweep(bezier(p0, p0 + d * 0.16 + Vector((0, 0, 0.06)), p0 + d * 0.17 + Vector((0, 0, 0.24)),
                     p0 + d * 0.05 + Vector((0, 0, 0.38)), 16), lambda s: 0.026 * (1 - 0.8 * s),
              bm, segs=8, name="claw")
    for sx in (-1, 1):
        wing_pts = [(0.0, 0.0), (0.12, 0.1), (0.24, 0.14), (0.3, 0.06), (0.24, 0.04), (0.2, -0.02),
                    (0.14, 0.02), (0.1, -0.04), (0.05, 0.0)]
        extrude([(sx * x, z) for x, z in wing_pts], 0.02, bm, loc=(sx * 0.14, -0.02, 0.36),
                rot=(0, sx * rad(-20), 0), bev=0.004, name="bat_wing")
    view(yaw=24, pitch=14, glow=1.0)


# =============================================================================
#  AMULETS  (necklace loop with a pendant hanging at the bottom centre)
# =============================================================================
def necklace(kind, mat, bail_z=0.2, top=None, half_w=0.3, back_y=0.2):
    top = bail_z + 0.42 if top is None else top
    pts_front = [(-half_w, 0.04, top), (-half_w * 0.95, 0.0, top - 0.25),
                 (-half_w * 0.55, -0.02, bail_z + 0.1), (0, -0.02, bail_z)]
    right = [(-x, y, z) for x, y, z in reversed(pts_front[:-1])]
    front = catmull(pts_front + right, 10)
    back = catmull([(half_w, 0.04, top), (half_w * 0.6, back_y, top + 0.08), (0, back_y * 1.2, top + 0.1),
                    (-half_w * 0.6, back_y, top + 0.08), (-half_w, 0.04, top)], 8)
    path = front + back[1:]
    if kind == "chain":
        chain(path, mat, link_len=0.048, wire=0.0075)
    elif kind == "cord":
        sweep(resample(path, 0.01), 0.012, mat, segs=8, name="cord")
    return path


@item("amulet_1")
def amulet_1():
    """Wooden cross pendant on a leather cord."""
    wood = M_wood((0.45, 0.26, 0.11), "cross_wood")
    cord = M_leather((0.2, 0.1, 0.05), "cord_leather")
    necklace("cord", cord, bail_z=0.2)
    pts = shape_cross(0.34, 0.5, 0.09, 0.34, flare=0.0)
    extrude([(x, z - 0.36) for x, z in pts], 0.05, wood, bev=0.012, name="cross")
    # binding at the crossing
    for k in (-1, 1):
        stroke2d((-0.05, -0.02 + 0.02 * k), (0.05, -0.02 - 0.02 * k), 0.012, 0.06, cord, y=0.0,
                 name="binding")
    torus(0.03, 0.009, cord, loc=(0, 0, 0.17), rot=(rad(90), 0, 0), seg=16, rseg=6, name="loop")
    view(pitch=4)


@item("amulet_2")
def amulet_2():
    """Silver crescent moon amulet with a small sapphire star."""
    silver = M_silver()
    necklace("chain", silver, bail_z=0.2)
    moon = shape_crescent(0.22, 0.19, 0.1)
    extrude([(x, z - 0.05) for x, z in moon], 0.05, silver, bev=0.012, name="moon")
    torus(0.028, 0.009, silver, loc=(0, 0, 0.18), rot=(0, rad(90), 0), seg=16, rseg=6, name="bail")
    gem(0.045, M_gem((0.2, 0.45, 1.0), "sapphire", 1.4), loc=(0.07, -0.03, -0.05), seg=8)
    view(pitch=4, glow=0.7)


@item("amulet_3")
def amulet_3():
    """Beast tooth necklace: leather thong with fangs and bone beads."""
    cord = M_leather((0.22, 0.12, 0.06), "cord_leather")
    tooth = pbr("tooth", (0.9, 0.84, 0.68), rough=0.35, coat=0.4, sss=0.1)
    bead = M_wood((0.35, 0.18, 0.08), "bead_wood")
    path = necklace("cord", cord, bail_z=0.26)
    # pick positions along the lower arc
    lower = [p for p in resample(path, 0.005) if p.y < 0.03 and p.z < 0.5]
    n = 5
    for k in range(n):
        t = 0.1 + 0.8 * k / (n - 1)
        p = lower[int(t * (len(lower) - 1))]
        L = 0.24 if k == 2 else (0.18 if k in (1, 3) else 0.13)
        side = (k - 2) * 0.18
        tip = p + Vector((side * 0.3, 0, -L))
        path_t = bezier(p, p + Vector((0, 0, -L * 0.4)), tip + Vector((-side * 0.2 + 0.03, 0, L * 0.3)),
                        tip, 20)
        sweep(path_t, lambda s, L=L: 0.045 * (L / 0.24) * (1 - s) ** 0.9 + 0.002, tooth, segs=12,
              name="tooth")
        torus(0.028 * (L / 0.24) + 0.012, 0.008, cord, loc=p + Vector((0, 0, -0.01)), seg=16, rseg=6,
              name="wrap")
    for k in range(4):
        t = 0.22 + 0.56 * k / 3
        p = lower[int(t * (len(lower) - 1))]
        sphere(0.028, bead, loc=p + Vector((0, -0.005, 0.01)), name="bead")
    view(pitch=4)


@item("amulet_4")
def amulet_4():
    """Heart locket: silver filigree heart framing a glowing crimson crystal
    heart."""
    silver = M_silver()
    crys = pbr("heart_crystal", (0.45, 0.005, 0.03), rough=0.05, trans=0.4, spec=1.0, coat=1.0,
               emit=(1.0, 0.02, 0.06), emit_str=0.25, glow_str=0.35)
    necklace("chain", silver, bail_z=0.24)
    heart = shape_heart(0.24)
    extrude([(x, z - 0.02) for x, z in heart], 0.06, silver, bev=0.02, name="locket")
    inner = shape_heart(0.15)
    extrude([(x, z - 0.02) for x, z in inner], 0.08, crys, bev=0.025, name="heart_gem",
            loc=(0, -0.012, 0))
    torus(0.03, 0.009, silver, loc=(0, 0, 0.22), rot=(0, rad(90), 0), seg=16, rseg=6, name="bail")
    for sx in (-1, 1):
        stroke2d((sx * 0.02, 0.2), (sx * 0.12, 0.25), 0.012, 0.012, silver, y=-0.02, name="filigree")
    view(pitch=4, glow=0.9)


@item("amulet_5")
def amulet_5():
    """Eye amulet: gold sunburst framing a watchful eye with a glowing iris."""
    gold = M_gold()
    necklace("chain", gold, bail_z=0.26)
    rays = shape_star(16, 0.27, 0.19)
    extrude(rays, 0.03, gold, bev=0.006, name="sunburst", loc=(0, 0.01, 0))
    torus(0.18, 0.02, gold, rot=(rad(90), 0, 0), seg=48, rseg=10, name="frame")
    lathe([(0, -0.02), (0.17, -0.02), (0.17, 0.02), (0, 0.02)], pbr("enamel_blue", (0.03, 0.05, 0.2),
                                                                     rough=0.2, coat=1.0),
          seg=48, rot=(rad(90), 0, 0), name="backplate")
    eye(0.1, M_glow((1.0, 0.7, 0.2), "eye_iris", 5), loc=(0, -0.03, 0.0), slit=True,
        lid_mat=gold)
    torus(0.028, 0.009, gold, loc=(0, 0, 0.27), rot=(0, rad(90), 0), seg=16, rseg=6, name="bail")
    view(pitch=4, glow=0.8)


@item("amulet_6")
def amulet_6():
    """Star pendant: black spiked star around a blazing violet-crimson core."""
    bm = M_blackmetal()
    core = pbr("star_core", (0.5, 0.1, 0.9), rough=0.05, trans=0.3, spec=1.0,
               emit=(0.6, 0.12, 1.0), emit_str=0.9, glow_str=0.6)
    red = M_glow((1.0, 0.1, 0.2), "star_red", 6)
    necklace("chain", bm, bail_z=0.3)
    star = shape_star(8, 0.34, 0.14)
    extrude(star, 0.06, bm, bev=0.01, name="star")
    extrude(shape_star(8, 0.36, 0.1, rot=math.pi / 2 + math.pi / 8), 0.03, M_glow((1.0, 0.08, 0.15),
            "star_rays", 3.0), name="rays", loc=(0, 0.02, 0))
    inner = shape_star(4, 0.2, 0.07, rot=math.pi / 2)
    extrude(inner, 0.07, core, bev=0.012, name="core_star", loc=(0, -0.01, 0))
    sphere(0.05, red, loc=(0, -0.04, 0), name="heart")
    torus(0.028, 0.009, bm, loc=(0, 0, 0.3), rot=(0, rad(90), 0), seg=16, rseg=6, name="bail")
    view(pitch=4, glow=0.9)


# ----------------------------------------------------------------------------
# @@BUILDERS@@  (item builders are inserted above the pipeline section)
# ----------------------------------------------------------------------------


# =============================================================================
#  RENDER PIPELINE
# =============================================================================
def _glow_materials():
    return [m for m in bpy.data.materials if "glow" in m.keys()]


def glow_pass(sc, path, args):
    """Second, cheap render in which only emissive materials are visible (as
    flat emission) and everything else is a holdout.  Used for the bloom."""
    for m in bpy.data.materials:
        nt = m.node_tree
        if nt is None:
            continue
        if "glow" in m.keys():
            bsdf = next((n for n in nt.nodes if n.bl_idname == "ShaderNodeBsdfPrincipled"), None)
            if bsdf is None:
                continue
            I = bsdf.inputs
            for lk in list(I["Base Color"].links):
                nt.links.remove(lk)
            I["Base Color"].default_value = (0, 0, 0, 1)
            I["Metallic"].default_value = 0.0
            I["Specular IOR Level"].default_value = 0.0
            I["Transmission Weight"].default_value = 0.0
            I["Coat Weight"].default_value = 0.0
            I["Sheen Weight"].default_value = 0.0
            I["Subsurface Weight"].default_value = 0.0
            I["Emission Color"].default_value = (*m["glow"], 1)
            gs = m.get("glow_str", 1.0)
            es = I["Emission Strength"]
            if es.links:
                src = es.links[0].from_socket
                nt.links.remove(es.links[0])
                mul = nt.nodes.new("ShaderNodeMath")
                mul.operation = "MULTIPLY"
                mul.inputs[1].default_value = gs * m.get("glow_norm", 1.0)
                nt.links.new(src, mul.inputs[0])
                nt.links.new(mul.outputs[0], es)
            else:
                es.default_value = gs
        else:
            nt.nodes.clear()
            out = nt.nodes.new("ShaderNodeOutputMaterial")
            ho = nt.nodes.new("ShaderNodeHoldout")
            nt.links.new(ho.outputs[0], out.inputs["Surface"])
    # objects without material -> default material renders grey: give holdout
    hold = bpy.data.materials.new("__hold")
    nt = hold.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    ho = nt.nodes.new("ShaderNodeHoldout")
    nt.links.new(ho.outputs[0], out.inputs["Surface"])
    for ob in G.coll.objects:
        if ob.type == "MESH" and len(ob.data.materials) == 0:
            ob.data.materials.append(hold)
    for ob in G.coll.objects:
        if ob.type == "LIGHT":
            ob.hide_render = True
    sc.world = None
    sc.cycles.samples = 12
    sc.cycles.use_denoising = False
    sc.cycles.use_adaptive_sampling = False
    sc.view_settings.view_transform = "Standard"
    sc.view_settings.look = "None"
    sc.view_settings.exposure = 0.0
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


def _blur(arr, radius):
    """Separable gaussian blur of an HxWxC float array (numpy only)."""
    sigma = max(radius, 0.1)
    k = int(math.ceil(sigma * 3))
    x = np.arange(-k, k + 1, dtype=np.float32)
    w = np.exp(-(x * x) / (2 * sigma * sigma))
    w /= w.sum()
    pad = np.pad(arr, ((k, k), (k, k), (0, 0)), mode="constant")
    tmp = np.zeros_like(pad)
    for i, wi in enumerate(w):
        tmp[:, k:-k] += wi * pad[:, i:i + pad.shape[1] - 2 * k]
    out = np.zeros_like(arr)
    for i, wi in enumerate(w):
        out += wi * tmp[i:i + arr.shape[0], k:-k]
    return out


def post_process(main_png, glow_png, out_png, size, glow_k=1.0, outline=0.55):
    from PIL import Image, ImageFilter
    im = Image.open(main_png).convert("RGBA")
    big = np.asarray(im).astype(np.float32) / 255.0
    # downsample in premultiplied space (no dark fringes)
    prem = big.copy()
    prem[..., :3] *= prem[..., 3:4]
    small = np.zeros((size, size, 4), np.float32)
    for c in range(4):
        ch = Image.fromarray(prem[..., c], mode="F").resize((size, size), Image.LANCZOS)
        small[..., c] = np.asarray(ch)
    small = np.clip(small, 0, 1)
    A = small[..., 3:4]
    small[..., :3] = np.minimum(small[..., :3], A)
    # clean alpha specks / denoiser haze
    mask = A < 0.03
    small[mask[..., 0]] = 0
    P, A = small[..., :3], small[..., 3:4]
    base_A = A.copy()

    if glow_png and os.path.exists(glow_png) and glow_k > 0:
        g = np.asarray(Image.open(glow_png).convert("RGBA")).astype(np.float32) / 255.0
        g[..., :3] *= g[..., 3:4]
        gs = np.zeros((size, size, 4), np.float32)
        for c in range(4):
            ch = Image.fromarray(g[..., c], mode="F").resize((size, size), Image.LANCZOS)
            gs[..., c] = np.asarray(ch)
        gs = np.clip(gs, 0, 1)
        G1 = _blur(gs, size / 64.0)
        G2 = _blur(gs, size / 18.0)
        Gt = (0.9 * G1 + 0.8 * G2) * glow_k
        # fade the halo out toward the icon border so it never gets clipped
        idx = np.arange(size, dtype=np.float32)
        edge = np.minimum(idx, size - 1 - idx) / (size / 12.0)
        fade = np.clip(np.minimum(edge[:, None], edge[None, :]), 0, 1) ** 1.5
        Gt *= fade[..., None]
        P = P + Gt[..., :3] * (1 - 0.35 * A)
        A = A + np.clip(Gt[..., 3:4], 0, 1) * (1 - A)
        A = np.clip(A, 0, 1)

    if outline > 0:
        solid = (base_A[..., 0] > 0.4).astype(np.uint8) * 255
        dil = Image.fromarray(solid, mode="L").filter(ImageFilter.MaxFilter(3))
        dil = dil.filter(ImageFilter.GaussianBlur(0.6))
        oa = (np.asarray(dil).astype(np.float32) / 255.0)[..., None] * outline
        ocol = np.array([0.03, 0.015, 0.03], np.float32)
        P = P + ocol * oa * (1 - A)
        A = A + oa * (1 - A)

    A = np.clip(A, 0, 1)
    rgb = np.where(A > 1e-4, P / np.maximum(A, 1e-4), 0)
    rgb = np.clip(rgb, 0, 1)
    A[A < 1.5 / 255] = 0
    rgb[A[..., 0] == 0] = 0
    out = np.concatenate([rgb, A], axis=2)
    Image.fromarray((out * 255 + 0.5).astype(np.uint8), "RGBA").save(out_png)


def render_item(item_id, args, tmpdir):
    sc = new_scene(args)
    setup_world(sc)
    REGISTRY[item_id]()
    frame_item()
    setup_lights_camera(sc)
    main_png = os.path.join(tmpdir, item_id + "_main.png")
    glow_png = os.path.join(tmpdir, item_id + "_glow.png")
    sc.render.filepath = main_png
    bpy.ops.render.render(write_still=True)
    if args.blend:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(tmpdir, item_id + ".blend"))
    glow_k = 0.0 if args.no_glow else G.view["glow"]
    has_glow = bool(_glow_materials()) and glow_k > 0
    if has_glow:
        glow_pass(sc, glow_png, args)
    out_png = os.path.join(args.out, item_id + ".png")
    post_process(main_png, glow_png if has_glow else None, out_png, args.size,
                 glow_k=glow_k, outline=args.outline)
    return out_png


CATEGORY_ORDER = ["whip", "sword", "greatsword", "dagger", "gun", "staff",
                  "body", "head", "cloak", "ring", "amulet"]


def contact_sheet(ids, out_dir, path, size):
    from PIL import Image, ImageDraw, ImageFont
    cols = 6
    rows_by_cat = {}
    for i in ids:
        cat = i.rsplit("_", 1)[0]
        rows_by_cat.setdefault(cat, []).append(i)
    cats = [c for c in CATEGORY_ORDER if c in rows_by_cat] + \
        [c for c in rows_by_cat if c not in CATEGORY_ORDER]
    small = 48
    cw, ch = size + small + 22, size + 20
    W = cols * cw + 16
    H = len(cats) * ch + 16
    sheet = Image.new("RGBA", (W, H), (14, 11, 16, 255))
    dr = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 11)
    except Exception:
        font = ImageFont.load_default()
    for r, cat in enumerate(cats):
        for c, iid in enumerate(sorted(rows_by_cat[cat],
                                       key=lambda s: int(s.rsplit("_", 1)[1]))[:cols]):
            x, y = 8 + c * cw, 8 + r * ch
            dr.rectangle([x, y, x + size - 1, y + size - 1], fill=(26, 22, 30, 255),
                         outline=(60, 50, 64, 255))
            p = os.path.join(out_dir, iid + ".png")
            if os.path.exists(p):
                ic = Image.open(p).convert("RGBA")
                sheet.alpha_composite(ic, (x, y))
                sm = ic.resize((small, small), Image.LANCZOS)
                dr.rectangle([x + size + 6, y, x + size + 6 + small - 1, y + small - 1],
                             fill=(40, 34, 44, 255))
                sheet.alpha_composite(sm, (x + size + 6, y))
            dr.text((x + 2, y + size + 3), iid, fill=(210, 200, 190, 255), font=font)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    sheet.save(path)
    return path


def select_ids(only):
    if not only:
        return list(REGISTRY)
    out = []
    for pat in only.split(","):
        pat = pat.strip()
        if not pat:
            continue
        hits = [k for k in REGISTRY if fnmatch.fnmatch(k, pat)]
        if not hits:
            print("!! unknown id / pattern:", pat)
        out += [h for h in hits if h not in out]
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--only", default="", help="comma separated ids / globs")
    ap.add_argument("--samples", type=int, default=56)
    ap.add_argument("--res", type=int, default=256, help="render resolution")
    ap.add_argument("--size", type=int, default=128, help="final icon size")
    ap.add_argument("--out", default=DEFAULT_OUT)
    ap.add_argument("--outline", type=float, default=0.55,
                    help="opacity of the 1px dark silhouette outline (0=off)")
    ap.add_argument("--no-glow", action="store_true")
    ap.add_argument("--contact", default="/tmp/claude-0/contact_equipment.png")
    ap.add_argument("--no-contact", action="store_true")
    ap.add_argument("--blend", action="store_true", help="also save .blend files")
    ap.add_argument("--tmp", default=None, help="keep intermediate renders here")
    ap.add_argument("--list", action="store_true")
    args = ap.parse_args(argv)

    if args.list:
        print("\n".join(REGISTRY))
        return 0
    ids = select_ids(args.only)
    os.makedirs(args.out, exist_ok=True)
    tmpdir = args.tmp or tempfile.mkdtemp(prefix="bn_icons_")
    os.makedirs(tmpdir, exist_ok=True)
    t_all = time.time()
    failed = []
    for i, iid in enumerate(ids):
        t0 = time.time()
        try:
            p = render_item(iid, args, tmpdir)
            print("[%d/%d] %-14s %5.1fs -> %s" % (i + 1, len(ids), iid,
                                                  time.time() - t0, p), flush=True)
        except Exception as e:  # keep going, report at the end
            import traceback
            traceback.print_exc()
            failed.append(iid)
            print("[%d/%d] %-14s FAILED: %s" % (i + 1, len(ids), iid, e), flush=True)
    print("total %.1fs" % (time.time() - t_all))
    if not args.no_contact:
        all_ids = [k for k in REGISTRY if os.path.exists(os.path.join(args.out, k + ".png"))]
        print("contact sheet:", contact_sheet(all_ids, args.out, args.contact, args.size))
    if failed:
        print("FAILED:", ",".join(failed))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
