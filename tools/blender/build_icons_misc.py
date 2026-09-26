#!/usr/bin/env python3
"""
BLOOD NOCTURNE -- consumable / relic / sub-weapon icons and level-prop sprites.

Every object is modelled procedurally in Blender (bpy as a python module):
lathes, sweeps, extruded and "inflated" outlines, bevelled boxes, curves with
bevel depth, and the usual modifier stack (bevel, subdivision, solidify,
array, screw, boolean, displace).  Objects get PBR Principled materials with
procedural break-up (wood grain, marble veins, rust, parchment stains, glowing
cracks ...), a 3-point studio rig (warm key, cool rim, fill) plus a dim
gradient world so metals have something to reflect, and are rendered with
Cycles into transparent PNGs.  A Pillow post-pass adds bloom around emissive
parts (flames, gems, potions), downsamples with LANCZOS and cleans alpha.

Usage (bpy is importable as a python module):
    python3 tools/blender/build_icons_misc.py                    # everything
    python3 tools/blender/build_icons_misc.py --only potion_hp,stone_*
    python3 tools/blender/build_icons_misc.py --only 'prop_*' --samples 32
    python3 tools/blender/build_icons_misc.py --list
    python3 tools/blender/build_icons_misc.py --contact-only     # just sheets

Outputs
    assets/icons/<id>.png   128x128 RGBA inventory icons (3/4 presentation)
    assets/props/<id>.png   side-scroller prop sprites (front view, slight
                            top angle, bottom/top anchored, size per prop)
    /tmp/claude-0/contact_misc.png, contact_misc_props.png  review sheets

Conventions used by the builders
    * The camera looks along +Y: the picture plane is XZ (x right, z up).
      2D outlines are given as (x, z) pairs.
    * Icons are modelled upright; view(diag=, pitch=, yaw=) turns them into a
      3/4 inventory presentation (diag 45 = top of the item to the upper right).
    * After building, icons (and auto-fit props) are normalised into a 2-unit
      box centred on the origin so a single light rig fits every object.
"""

import argparse
import fnmatch
import glob
import math
import os
import random
import shutil
import sys
import tempfile
import time
import zlib

import bpy  # noqa: E402  (bpy must be imported before bmesh)
import bmesh
import numpy as np
from mathutils import Matrix, Vector
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
GAME_ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
ICON_DIR = os.path.join(GAME_ROOT, "assets", "icons")
PROP_DIR = os.path.join(GAME_ROOT, "assets", "props")
CONTACT_DIR = "/tmp/claude-0"

TAU = math.tau
rad = math.radians


# =============================================================================
#  Registry / global build state
# =============================================================================
REGISTRY = {}   # id -> dict(id, fn, kind, size)


def item(item_id, kind="icon", size=(128, 128)):
    """Decorator registering a builder.  kind: 'icon' | 'prop'."""
    def deco(fn):
        REGISTRY[item_id] = dict(id=item_id, fn=fn, kind=kind, size=size)
        return fn
    return deco


class _State:
    root = None        # empty parenting every part of the current object
    coll = None
    view = None
    mats = {}
    rng = random.Random(1)
    lights = []        # point lights created by builders (flames, glows)
    stack = []         # sub-assembly parents (see `sub`)
    kind = "icon"


G = _State()


def default_view(kind):
    v = dict(diag=0.0, yaw=0.0, pitch=0.0, roll=0.0, fill=0.86,
             glow=1.0, glow_beauty=0.0, glow_thr=0.82, bloom=1.0,
             key=1.0, rim=1.0, fill_light=1.0, top=1.0, world=1.0,
             exposure=0.0, anchor="center", fixed_ortho=None,
             transparent_glass=False, margin=0.02, look="AgX - Punchy", front=0.6,
             transform="AgX")
    if kind == "prop":
        v.update(pitch=7.0, fill=0.95, anchor="bottom")
    return v


def view(**kw):
    """Presentation of the current object.

    diag  : rotation (deg) in the picture plane; 45 = top to the upper right
    yaw   : rotation (deg) about the object's own vertical axis
    pitch : tilt (deg) of the object's top toward the camera (see from above)
    fill  : fraction of the frame the object's limiting dimension fills
    glow  : bloom multiplier for the emission pass
    glow_beauty : bloom from bright pixels of the beauty pass (glass items)
    anchor: 'center' | 'bottom' | 'top' (props stand on / hang from an edge)
    fixed_ortho : skip auto-fit; use this ortho scale (builder units) so two
                  sprites (closed/open chest) share one scale
    """
    G.view.update(kw)


# =============================================================================
#  Scene, world, lights, camera
# =============================================================================
def new_scene(args, spec):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    G.coll = sc.collection
    G.mats = {}
    G.lights = []
    G.stack = []
    G.kind = spec["kind"]
    G.view = default_view(spec["kind"])
    G.rng = random.Random(zlib.crc32(spec["id"].encode()))

    sc.render.engine = "CYCLES"
    cy = sc.cycles
    cy.device = "CPU"
    cy.samples = args.samples
    cy.use_adaptive_sampling = True
    cy.adaptive_threshold = 0.02
    cy.max_bounces = 10
    cy.diffuse_bounces = 3
    cy.glossy_bounces = 4
    cy.transmission_bounces = 10
    cy.transparent_max_bounces = 12
    cy.caustics_reflective = False
    cy.caustics_refractive = False
    cy.blur_glossy = 1.0
    cy.sample_clamp_indirect = 10.0
    try:
        cy.use_denoising = True
        cy.denoiser = "OPENIMAGEDENOISE"
    except Exception:          # denoiser not compiled in -> plain render
        try:
            cy.use_denoising = False
        except Exception:
            pass
    sc.render.film_transparent = True
    ss = args.ss
    sc.render.resolution_x = spec["size"][0] * ss
    sc.render.resolution_y = spec["size"][1] * ss
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
    root = bpy.data.objects.new("ROOT", None)
    G.coll.objects.link(root)
    G.root = root
    return sc


def setup_world(sc):
    """Dim, slightly cool studio gradient with a bright horizon band so that
    polished metal always has something to reflect."""
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
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    cr = ramp.color_ramp
    cr.elements[0].position = 0.0
    cr.elements[0].color = (0.012, 0.009, 0.012, 1)
    cr.elements[1].position = 1.0
    cr.elements[1].color = (0.11, 0.12, 0.16, 1)
    cr.elements.new(0.42).color = (0.035, 0.028, 0.03, 1)
    cr.elements.new(0.51).color = (0.26, 0.23, 0.22, 1)
    cr.elements.new(0.60).color = (0.07, 0.07, 0.09, 1)
    nt.links.new(mr.outputs["Result"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = 1.0 * G.view["world"]
    nt.links.new(bg.outputs[0], out.inputs["Surface"])


def _look_at(ob, target=(0, 0, 0)):
    d = Vector(target) - ob.location
    ob.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()


def add_area(name, loc, color, power, size, target=(0, 0, 0)):
    ld = bpy.data.lights.new(name, "AREA")
    ld.color = color
    ld.energy = power
    ld.size = size
    ob = bpy.data.objects.new(name, ld)
    G.coll.objects.link(ob)
    ob.location = loc
    _look_at(ob, target)
    return ob


def point_light(loc, color=(1.0, 0.62, 0.25), power=30.0, radius=0.05,
                parent=None):
    """Point light parented to the object (flames, glowing cores).  Power is
    given in builder units and rescaled after normalisation."""
    ld = bpy.data.lights.new("pl", "POINT")
    ld.color = color
    ld.energy = power
    ld.shadow_soft_size = radius
    ob = bpy.data.objects.new("pl", ld)
    G.coll.objects.link(ob)
    ob.parent = parent or _parent()
    ob.location = loc
    G.lights.append(ob)
    return ob


def setup_rig(sc):
    v = G.view
    k, r, f, t = v["key"], v["rim"], v["fill_light"], v["top"]
    # warm key: upper left, in front
    add_area("Key", (-4.0, -5.2, 4.4), (1.0, 0.82, 0.62), 950 * k, 3.2)
    # cool rim: behind, upper right -> bright readable edge
    add_area("Rim", (4.2, 4.4, 3.4), (0.55, 0.72, 1.0), 1500 * r, 2.4)
    # violet kicker: behind lower left, separates the silhouette at the bottom
    add_area("Kick", (-4.4, 4.0, -1.6), (0.78, 0.55, 1.0), 520 * r, 2.0)
    # soft cool fill: front right, low
    add_area("Fill", (4.8, -5.4, -0.8), (0.72, 0.80, 1.0), 300 * f, 5.0)
    # broad top softbox -> long reflections on metal
    add_area("Top", (0.0, -2.6, 6.2), (1.0, 0.97, 0.94), 240 * t, 7.0)
    # large dim frontal softbox behind the camera: flat metal faces pointing at
    # the viewer reflect it instead of the dark world
    if v["front"] > 0:
        fl = add_area("Front", (0.6, -12.0, 1.2), (1.0, 0.93, 0.85), 700 * v["front"], 9.0)
        try:
            fl.visible_camera = False
        except Exception:
            pass
    if v["exposure"]:
        sc.view_settings.exposure = v["exposure"]
    try:
        sc.view_settings.view_transform = v["transform"]
        sc.view_settings.look = v["look"]
    except Exception:
        pass


def _eval_points():
    """World-space vertices of every renderable object (modifiers applied)."""
    dg = bpy.context.evaluated_depsgraph_get()
    pts = []
    for ob in G.coll.objects:
        if ob.type not in {"MESH", "CURVE", "FONT", "SURFACE"}:
            continue
        if ob.hide_render or ob.get("noframe"):
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
        pts.append(co @ mw[:3, :3].T + mw[:3, 3])
        ev.to_mesh_clear()
    if not pts:
        return np.zeros((1, 3))
    return np.concatenate(pts, axis=0)


def frame_and_camera(sc):
    """Apply presentation rotation, normalise/fit, place the ortho camera."""
    v = G.view
    R = (Matrix.Rotation(rad(v["diag"]), 4, "Y")
         @ Matrix.Rotation(rad(v["pitch"]), 4, "X")
         @ Matrix.Rotation(rad(v["yaw"]), 4, "Z")
         @ Matrix.Rotation(rad(v["roll"]), 4, "Y"))
    G.root.matrix_world = R
    bpy.context.view_layer.update()
    pts = _eval_points()
    mn, mx = pts.min(axis=0), pts.max(axis=0)
    resx, resy = sc.render.resolution_x, sc.render.resolution_y
    aspect = resx / resy

    if v["fixed_ortho"]:
        s = 1.0
        S = v["fixed_ortho"]
        # centre horizontally on the model origin (builders model around x=0)
        cx = 0.0
        w, h = mx[0] - mn[0], mx[2] - mn[2]
        zmin, zmax = mn[2], mx[2]
    else:
        w0, h0 = mx[0] - mn[0], mx[2] - mn[2]
        s = 2.0 / max(w0, h0, 1e-6)
        c = (mn + mx) / 2.0
        T = Matrix.Translation(Vector((-c[0] * s, -c[1] * s, -c[2] * s)))
        G.root.matrix_world = T @ Matrix.Scale(s, 4) @ R
        bpy.context.view_layer.update()
        w, h = w0 * s, h0 * s
        zmin, zmax = -h / 2, h / 2
        cx = 0.0
        f = v["fill"]
        if aspect >= 1.0:
            S = max(w / f, h * aspect / f)
        else:
            S = max(h / f, w / (aspect * f))
    # rescale builder point lights: distances scaled by the lights' world
    # scale (normalisation * any sub-assembly scale)
    bpy.context.view_layer.update()
    for L in G.lights:
        ws = L.matrix_world.to_scale().x
        L.data.energy *= ws * ws
        L.data.shadow_soft_size *= ws

    if aspect >= 1.0:
        Wv, Hv = S, S / aspect
    else:
        Wv, Hv = S * aspect, S
    m = v["margin"] * Hv
    if v["anchor"] == "bottom":
        cz = zmin - m + Hv / 2
    elif v["anchor"] == "top":
        cz = zmax + m - Hv / 2
    else:
        cz = (zmin + zmax) / 2 if v["fixed_ortho"] else 0.0

    cam_d = bpy.data.cameras.new("Cam")
    cam_d.type = "ORTHO"
    cam_d.ortho_scale = S
    cam_d.clip_start = 0.1
    cam_d.clip_end = 200
    cam = bpy.data.objects.new("Cam", cam_d)
    G.coll.objects.link(cam)
    cam.location = (cx, -40, cz)
    cam.rotation_euler = (rad(90), 0, 0)
    sc.camera = cam
    return s


def setup_emission_output(sc, tmpdir, item_id):
    """Compositor: beauty -> render result, Emission pass -> separate PNG used
    as the bloom mask.  Returns the expected mask path prefix (or None)."""
    try:
        vl = sc.view_layers[0]
        vl.use_pass_emit = True
        ng = bpy.data.node_groups.new("comp", "CompositorNodeTree")
        sc.compositing_node_group = ng
        rl = ng.nodes.new("CompositorNodeRLayers")
        go = ng.nodes.new("NodeGroupOutput")
        ng.interface.new_socket("Image", in_out="OUTPUT",
                                socket_type="NodeSocketColor")
        ng.links.new(rl.outputs["Image"], go.inputs[0])
        fo = ng.nodes.new("CompositorNodeOutputFile")
        fo.directory = tmpdir + os.sep
        fo.file_name = item_id + "__"
        it = fo.file_output_items.new("RGBA", "emit")
        # linear (not view-transformed) emission keeps glow colours saturated
        try:
            fo.save_as_render = False
            it.save_as_render = False
        except Exception:
            pass
        fo.format.media_type = "IMAGE"
        fo.format.file_format = "PNG"
        fo.format.color_mode = "RGB"
        fo.format.color_depth = "8"
        ng.links.new(rl.outputs["Emission"], fo.inputs["emit"])
        return os.path.join(tmpdir, item_id + "__emit")
    except Exception as e:  # older/newer API: no bloom mask, still renders
        print("  (emission pass unavailable: %s)" % e)
        return None


# =============================================================================
#  Materials
# =============================================================================
def nn(nt, kind, inputs=None, **props):
    n = nt.nodes.new(kind)
    for k, val in props.items():
        setattr(n, k, val)
    if inputs:
        for k, val in inputs.items():
            n.inputs[k].default_value = val
    return n


def ln(nt, a, b):
    nt.links.new(a, b)


def math_node(nt, op, a, b=None, clamp=False):
    n = nt.nodes.new("ShaderNodeMath")
    n.operation = op
    n.use_clamp = clamp
    for i, x in enumerate((a, b)):
        if x is None:
            continue
        if isinstance(x, (int, float)):
            n.inputs[i].default_value = x
        else:
            ln(nt, x, n.inputs[i])
    return n.outputs[0]


def ramp(nt, fac, stops):
    """Colour ramp; stops = [(pos, (r,g,b)), ...]."""
    r = nt.nodes.new("ShaderNodeValToRGB")
    cr = r.color_ramp
    cr.elements[0].position = stops[0][0]
    cr.elements[0].color = (*stops[0][1], 1)
    cr.elements[1].position = stops[-1][0]
    cr.elements[1].color = (*stops[-1][1], 1)
    for p, c in stops[1:-1]:
        cr.elements.new(p).color = (*c, 1)
    ln(nt, fac, r.inputs["Fac"])
    return r.outputs["Color"]


def noise(nt, vec, scale=5.0, detail=6.0, rough=0.55, distort=0.0):
    n = nn(nt, "ShaderNodeTexNoise", {"Scale": scale, "Detail": detail,
                                      "Roughness": rough,
                                      "Distortion": distort})
    ln(nt, vec, n.inputs["Vector"])
    return n


def mapping(nt, vec, scale=(1, 1, 1), loc=(0, 0, 0), rot=(0, 0, 0)):
    m = nn(nt, "ShaderNodeMapping")
    m.inputs["Scale"].default_value = scale
    m.inputs["Location"].default_value = loc
    m.inputs["Rotation"].default_value = rot
    ln(nt, vec, m.inputs["Vector"])
    return m.outputs["Vector"]


def pbr(name, color=(0.8, 0.8, 0.8), metal=0.0, rough=0.5, emit=None,
        emit_str=0.0, trans=0.0, ior=1.45, coat=0.0, coat_rough=0.05,
        sheen=0.0, spec=0.5, sss=0.0, sss_radius=(1.0, 0.4, 0.2),
        noise_rough=0.0, bump=0.0, bump_scale=40.0, pattern=None, alpha=1.0,
        **pa):
    """Principled material with optional procedural pattern (see _PATTERNS).
    Cached by name within the current scene."""
    if name in G.mats:
        return G.mats[name]
    m = bpy.data.materials.new(name)
    nt = m.node_tree
    nt.nodes.clear()
    out = nn(nt, "ShaderNodeOutputMaterial")
    bsdf = nn(nt, "ShaderNodeBsdfPrincipled")
    ln(nt, bsdf.outputs[0], out.inputs["Surface"])
    I = bsdf.inputs
    I["Base Color"].default_value = (*color, 1)
    I["Metallic"].default_value = metal
    I["Roughness"].default_value = rough
    I["IOR"].default_value = ior
    I["Specular IOR Level"].default_value = spec
    I["Transmission Weight"].default_value = trans
    I["Coat Weight"].default_value = coat
    I["Coat Roughness"].default_value = coat_rough
    I["Sheen Weight"].default_value = sheen
    I["Subsurface Weight"].default_value = sss
    I["Subsurface Radius"].default_value = sss_radius
    I["Subsurface Scale"].default_value = 0.08
    I["Alpha"].default_value = alpha
    if emit is not None and emit_str > 0:
        I["Emission Color"].default_value = (*emit, 1)
        I["Emission Strength"].default_value = emit_str
    tc = nn(nt, "ShaderNodeTexCoord")
    heights = []
    if noise_rough > 0:
        nz = noise(nt, tc.outputs["Object"], 6.0, 8.0)
        mr = nn(nt, "ShaderNodeMapRange",
                {"From Min": 0.3, "From Max": 0.7,
                 "To Min": max(0.02, rough - noise_rough),
                 "To Max": min(1.0, rough + noise_rough)})
        ln(nt, nz.outputs["Fac"], mr.inputs["Value"])
        ln(nt, mr.outputs["Result"], I["Roughness"])
    if bump > 0:
        nz2 = noise(nt, tc.outputs["Object"], bump_scale, 6.0, 0.6)
        heights.append((nz2.outputs["Fac"], bump))
    if pattern:
        h = _PATTERNS[pattern](nt, I, tc, color, pa)
        if h is not None:
            heights.append(h)
    if heights:
        prev = None
        for hsock, strength in heights:
            bn = nn(nt, "ShaderNodeBump", {"Strength": abs(strength),
                                           "Distance": 0.02})
            bn.invert = strength < 0
            ln(nt, hsock, bn.inputs["Height"])
            if prev is not None:
                ln(nt, prev, bn.inputs["Normal"])
            prev = bn.outputs["Normal"]
        ln(nt, prev, I["Normal"])
    G.mats[name] = m
    return m


# ---- procedural patterns ---------------------------------------------------
def _pat_wood(nt, I, tc, color, a):
    axis = a.get("axis", "Z")
    sc = {"X": (1.0, 14.0, 14.0), "Y": (14.0, 1.0, 14.0),
          "Z": (14.0, 14.0, 1.0)}[axis]
    k = a.get("grain", 1.0)
    vec = mapping(nt, tc.outputs["Object"], tuple(x * k for x in sc))
    nz = noise(nt, vec, 1.6, 10.0, 0.62, 1.2)
    dark = a.get("dark", tuple(c * 0.42 for c in color))
    col = ramp(nt, nz.outputs["Fac"], [(0.32, dark), (0.52, color),
                                        (0.72, tuple(min(1, c * 1.25) for c in color))])
    # large-scale stain/age variation
    nz2 = noise(nt, tc.outputs["Object"], 1.8, 3.0)
    mix = nn(nt, "ShaderNodeMix", data_type="RGBA", blend_type="MULTIPLY")
    mix.inputs["Factor"].default_value = a.get("stain", 0.45)
    ln(nt, col, mix.inputs[6])
    st = ramp(nt, nz2.outputs["Fac"], [(0.3, (0.55, 0.5, 0.45)), (0.7, (1, 1, 1))])
    ln(nt, st, mix.inputs[7])
    ln(nt, mix.outputs[2], I["Base Color"])
    return (nz.outputs["Fac"], a.get("bump", 0.25))


def _pat_rust(nt, I, tc, color, a):
    nz = noise(nt, tc.outputs["Object"], a.get("scale", 5.0), 8.0, 0.65)
    f = ramp(nt, nz.outputs["Fac"], [(0.52, (0, 0, 0)), (0.66, (1, 1, 1))])
    rust = a.get("rust", (0.28, 0.12, 0.05))
    mix = nn(nt, "ShaderNodeMix", data_type="RGBA")
    ln(nt, f, mix.inputs["Factor"])
    mix.inputs[6].default_value = (*color, 1)
    mix.inputs[7].default_value = (*rust, 1)
    ln(nt, mix.outputs[2], I["Base Color"])
    # rust patches are rough and non-metallic
    mr = nn(nt, "ShaderNodeMapRange", {"To Min": I["Roughness"].default_value,
                                       "To Max": 0.85})
    ln(nt, f, mr.inputs["Value"])
    ln(nt, mr.outputs["Result"], I["Roughness"])
    mm = nn(nt, "ShaderNodeMapRange", {"To Min": I["Metallic"].default_value,
                                       "To Max": 0.2})
    ln(nt, f, mm.inputs["Value"])
    ln(nt, mm.outputs["Result"], I["Metallic"])
    nz2 = noise(nt, tc.outputs["Object"], 40.0, 4.0)
    return (nz2.outputs["Fac"], a.get("bump", 0.15))


def _pat_stone(nt, I, tc, color, a):
    vec = tc.outputs["Object"]
    s = a.get("scale", 3.0)
    nz = noise(nt, vec, s, 8.0, 0.6)
    dark = a.get("dark", tuple(c * 0.5 for c in color))
    col = ramp(nt, nz.outputs["Fac"], [(0.3, dark), (0.6, color),
                                        (0.8, tuple(min(1, c * 1.2) for c in color))])
    vo = nn(nt, "ShaderNodeTexVoronoi", {"Scale": s * 1.4}, feature="DISTANCE_TO_EDGE")
    ln(nt, vec, vo.inputs["Vector"])
    crack = math_node(nt, "LESS_THAN", vo.outputs["Distance"], a.get("crack", 0.025))
    mix = nn(nt, "ShaderNodeMix", data_type="RGBA", blend_type="MULTIPLY")
    ln(nt, crack, mix.inputs["Factor"])
    ln(nt, col, mix.inputs[6])
    mix.inputs[7].default_value = (0.3, 0.3, 0.3, 1)
    col = mix.outputs[2]
    if a.get("moss"):
        nzm = noise(nt, vec, 2.5, 6.0, 0.7)
        # moss grows at the bottom (object z low) and in noisy patches
        sep = nn(nt, "ShaderNodeSeparateXYZ")
        ln(nt, vec, sep.inputs[0])
        zf = nn(nt, "ShaderNodeMapRange", {"From Min": a.get("moss_z0", -1.0),
                                           "From Max": a.get("moss_z1", 0.0),
                                           "To Min": 0.35, "To Max": -0.2})
        ln(nt, sep.outputs["Z"], zf.inputs["Value"])
        add = math_node(nt, "ADD", nzm.outputs["Fac"], zf.outputs["Result"])
        mf = ramp(nt, add, [(0.62, (0, 0, 0)), (0.72, (1, 1, 1))])
        m2 = nn(nt, "ShaderNodeMix", data_type="RGBA")
        ln(nt, mf, m2.inputs["Factor"])
        ln(nt, col, m2.inputs[6])
        m2.inputs[7].default_value = (*a.get("moss_color", (0.10, 0.14, 0.05)), 1)
        col = m2.outputs[2]
    ln(nt, col, I["Base Color"])
    nzb = noise(nt, vec, s * 8, 6.0, 0.6)
    add = math_node(nt, "ADD", nzb.outputs["Fac"],
                    math_node(nt, "MULTIPLY", vo.outputs["Distance"], 4.0))
    return (add, a.get("bump", 0.35))


def _pat_marble(nt, I, tc, color, a):
    vec = tc.outputs["Object"]
    wv = nn(nt, "ShaderNodeTexWave", {"Scale": a.get("scale", 1.6),
                                      "Distortion": 9.0, "Detail": 6.0,
                                      "Detail Scale": 1.5},
            wave_type="BANDS", bands_direction="DIAGONAL")
    ln(nt, vec, wv.inputs["Vector"])
    vein = a.get("vein", (0.45, 0.43, 0.42))
    col = ramp(nt, wv.outputs["Fac"], [(0.0, vein), (0.035, color), (0.965, color),
                                        (1.0, vein)])
    nz = noise(nt, vec, 3.0, 4.0)
    mix = nn(nt, "ShaderNodeMix", data_type="RGBA", blend_type="MULTIPLY")
    mix.inputs["Factor"].default_value = 0.25
    ln(nt, col, mix.inputs[6])
    ln(nt, nz.outputs["Color"], mix.inputs[7])
    ln(nt, mix.outputs[2], I["Base Color"])
    return None


def _pat_parchment(nt, I, tc, color, a):
    vec = tc.outputs["Object"]
    nz = noise(nt, vec, a.get("scale", 3.0), 8.0, 0.6)
    dark = a.get("dark", (0.45, 0.30, 0.14))
    col = ramp(nt, nz.outputs["Fac"], [(0.28, dark), (0.5, color),
                                        (0.75, tuple(min(1, c * 1.08) for c in color))])
    if a.get("lines"):
        # faint ink lines (writing) along the sheet
        wv = nn(nt, "ShaderNodeTexWave", {"Scale": a.get("line_freq", 18.0),
                                          "Distortion": 1.5, "Detail": 2.0},
                wave_type="BANDS", bands_direction=a.get("line_dir", "Z"))
        ln(nt, vec, wv.inputs["Vector"])
        ink = ramp(nt, wv.outputs["Fac"], [(0.0, (0, 0, 0)), (0.12, (0, 0, 0)),
                                            (0.18, (1, 1, 1))])
        nzi = noise(nt, vec, 30.0, 2.0)
        m0 = nn(nt, "ShaderNodeMix", data_type="RGBA")
        ln(nt, ink, m0.inputs["Factor"])
        m0.inputs[6].default_value = (1, 1, 1, 1)
        ln(nt, nzi.outputs["Fac"], m0.inputs[7])
        mix = nn(nt, "ShaderNodeMix", data_type="RGBA", blend_type="MULTIPLY")
        mix.inputs["Factor"].default_value = 1.0
        ln(nt, col, mix.inputs[6])
        inkcol = ramp(nt, m0.outputs[2], [(0.3, (0.25, 0.15, 0.1)), (0.6, (1, 1, 1))])
        ln(nt, inkcol, mix.inputs[7])
        col = mix.outputs[2]
    ln(nt, col, I["Base Color"])
    nzb = noise(nt, vec, 60.0, 4.0)
    return (nzb.outputs["Fac"], a.get("bump", 0.12))


def _pat_leather(nt, I, tc, color, a):
    vec = tc.outputs["Object"]
    nz = noise(nt, vec, a.get("scale", 4.0), 6.0, 0.6)
    dark = tuple(c * 0.45 for c in color)
    col = ramp(nt, nz.outputs["Fac"], [(0.3, dark), (0.65, color)])
    ln(nt, col, I["Base Color"])
    vo = nn(nt, "ShaderNodeTexVoronoi", {"Scale": a.get("grain", 70.0)})
    ln(nt, vec, vo.inputs["Vector"])
    return (vo.outputs["Distance"], a.get("bump", 0.3))


def _pat_bands(nt, I, tc, color, a):
    """Book spines etc.: gold bands near the ends of the Generated Z axis."""
    sep = nn(nt, "ShaderNodeSeparateXYZ")
    ln(nt, tc.outputs["Generated"], sep.inputs[0])
    g = a.get("band", (1.0, 0.72, 0.3))
    pos = a.get("pos", (0.1, 0.16, 0.84, 0.9))
    r = nt.nodes.new("ShaderNodeValToRGB")
    r.color_ramp.interpolation = "CONSTANT"
    cr = r.color_ramp
    cr.elements[0].position = 0.0
    cr.elements[0].color = (*color, 1)
    for p, c in [(pos[0], g), (pos[1], color), (pos[2], g), (pos[3], color)]:
        cr.elements.new(p).color = (*c, 1)
    ln(nt, sep.outputs["Z"], r.inputs["Fac"])
    ln(nt, r.outputs["Color"], I["Base Color"])
    # the gold bands are metallic
    mt = nn(nt, "ShaderNodeRGBToBW")
    ln(nt, r.outputs["Color"], mt.inputs[0])
    mr = nn(nt, "ShaderNodeMapRange", {"From Min": sum(color) / 3 + 0.02,
                                       "From Max": sum(g) / 3})
    ln(nt, mt.outputs[0], mr.inputs["Value"])
    ln(nt, mr.outputs["Result"], I["Metallic"])
    vo = nn(nt, "ShaderNodeTexVoronoi", {"Scale": 60.0})
    ln(nt, tc.outputs["Object"], vo.inputs["Vector"])
    return (vo.outputs["Distance"], 0.2)


def _pat_veins(nt, I, tc, color, a):
    """Glowing cracks (voronoi edges distorted by noise)."""
    vec = tc.outputs["Object"]
    nz = noise(nt, vec, 2.0, 3.0)
    mix = nn(nt, "ShaderNodeMix", data_type="VECTOR")
    mix.inputs["Factor"].default_value = 0.3
    ln(nt, vec, mix.inputs[4])
    ln(nt, nz.outputs["Color"], mix.inputs[5])
    vo = nn(nt, "ShaderNodeTexVoronoi", {"Scale": a.get("density", 3.0)},
            feature="DISTANCE_TO_EDGE")
    ln(nt, mix.outputs[1], vo.inputs["Vector"])
    mr = nn(nt, "ShaderNodeMapRange", {"From Min": 0.0,
                                       "From Max": a.get("width", 0.06),
                                       "To Min": 1.0, "To Max": 0.0})
    ln(nt, vo.outputs["Distance"], mr.inputs["Value"])
    I["Emission Color"].default_value = (*a.get("vein_color", (1.0, 0.1, 0.02)), 1)
    ln(nt, math_node(nt, "MULTIPLY", mr.outputs["Result"], a.get("strength", 8.0)),
       I["Emission Strength"])
    return (mr.outputs["Result"], -0.5)


def _pat_roast(nt, I, tc, color, a):
    vec = tc.outputs["Object"]
    nz = noise(nt, vec, 4.0, 8.0, 0.62, 0.4)
    col = ramp(nt, nz.outputs["Fac"], [(0.25, (0.07, 0.025, 0.01)),
                                        (0.42, (0.28, 0.08, 0.025)),
                                        (0.58, (0.55, 0.20, 0.06)),
                                        (0.75, (0.78, 0.40, 0.12))])
    ln(nt, col, I["Base Color"])
    nzb = noise(nt, vec, 14.0, 8.0, 0.65)
    return (nzb.outputs["Fac"], 0.6)


def _pat_crust(nt, I, tc, color, a):
    vec = tc.outputs["Object"]
    nz = noise(nt, vec, 3.0, 6.0, 0.6)
    col = ramp(nt, nz.outputs["Fac"], [(0.3, (0.16, 0.06, 0.015)),
                                        (0.48, (0.42, 0.17, 0.035)),
                                        (0.7, (0.68, 0.36, 0.10))])
    # flour dusting on top (object +z)
    sep = nn(nt, "ShaderNodeSeparateXYZ")
    ln(nt, vec, sep.inputs[0])
    nzf = noise(nt, vec, 18.0, 4.0)
    fl = math_node(nt, "ADD", nzf.outputs["Fac"],
                   math_node(nt, "MULTIPLY", sep.outputs["Z"], a.get("flour", 1.2)))
    ff = ramp(nt, fl, [(0.72, (0, 0, 0)), (0.82, (1, 1, 1))])
    mix = nn(nt, "ShaderNodeMix", data_type="RGBA")
    ln(nt, ff, mix.inputs["Factor"])
    ln(nt, col, mix.inputs[6])
    mix.inputs[7].default_value = (0.92, 0.86, 0.74, 1)
    ln(nt, mix.outputs[2], I["Base Color"])
    nzb = noise(nt, vec, 25.0, 6.0)
    return (nzb.outputs["Fac"], 0.5)


def _pat_staves(nt, I, tc, color, a):
    """Barrel staves: angular stripes around object Z + wood grain along Z."""
    vec = tc.outputs["Object"]
    gr = nn(nt, "ShaderNodeTexGradient", gradient_type="RADIAL")
    ln(nt, vec, gr.inputs["Vector"])
    n = a.get("count", 18)
    st = math_node(nt, "FRACT", math_node(nt, "MULTIPLY", gr.outputs["Fac"], n))
    groove = ramp(nt, st, [(0.0, (0, 0, 0)), (0.04, (1, 1, 1)), (0.96, (1, 1, 1)),
                            (1.0, (0, 0, 0))])
    # per-stave tint variation
    idx = math_node(nt, "FLOOR", math_node(nt, "MULTIPLY", gr.outputs["Fac"], n))
    wn = nn(nt, "ShaderNodeTexWhiteNoise", noise_dimensions="1D")
    ln(nt, idx, wn.inputs["W"])
    vec2 = mapping(nt, vec, (12.0, 12.0, 0.9))
    nz = noise(nt, vec2, 1.6, 10.0, 0.62, 1.2)
    dark = tuple(c * 0.45 for c in color)
    col = ramp(nt, nz.outputs["Fac"], [(0.32, dark), (0.55, color),
                                        (0.75, tuple(min(1, c * 1.2) for c in color))])
    m1 = nn(nt, "ShaderNodeMix", data_type="RGBA", blend_type="MULTIPLY")
    m1.inputs["Factor"].default_value = 1.0
    ln(nt, col, m1.inputs[6])
    tint = ramp(nt, wn.outputs["Value"], [(0.0, (0.7, 0.68, 0.66)), (1.0, (1.1, 1.05, 1.0))])
    ln(nt, tint, m1.inputs[7])
    m2 = nn(nt, "ShaderNodeMix", data_type="RGBA", blend_type="MULTIPLY")
    m2.inputs["Factor"].default_value = 1.0
    ln(nt, m1.outputs[2], m2.inputs[6])
    ln(nt, groove, m2.inputs[7])
    ln(nt, m2.outputs[2], I["Base Color"])
    bw = nn(nt, "ShaderNodeRGBToBW")
    ln(nt, groove, bw.inputs[0])
    add = math_node(nt, "ADD", bw.outputs[0],
                    math_node(nt, "MULTIPLY", nz.outputs["Fac"], 0.3))
    return (add, 0.6)


def _pat_eye(nt, I, tc, color, a):
    """Eyeball looking along -Y: slit pupil, fiery iris, veined sclera."""
    sep = nn(nt, "ShaderNodeSeparateXYZ")
    ln(nt, tc.outputs["Object"], sep.inputs[0])
    comb = nn(nt, "ShaderNodeCombineXYZ")
    ln(nt, math_node(nt, "MULTIPLY", sep.outputs["X"], a.get("slit", 3.2)), comb.inputs["X"])
    ln(nt, sep.outputs["Z"], comb.inputs["Z"])
    rp = nn(nt, "ShaderNodeVectorMath", operation="LENGTH")
    ln(nt, comb.outputs[0], rp.inputs[0])
    comb2 = nn(nt, "ShaderNodeCombineXYZ")
    ln(nt, sep.outputs["X"], comb2.inputs["X"])
    ln(nt, sep.outputs["Z"], comb2.inputs["Z"])
    ri = nn(nt, "ShaderNodeVectorMath", operation="LENGTH")
    ln(nt, comb2.outputs[0], ri.inputs[0])
    # front hemisphere only (y < 0)
    front = math_node(nt, "LESS_THAN", sep.outputs["Y"], 0.0)
    ir = a.get("iris", 0.55)
    # radial streaks in the iris
    gr = nn(nt, "ShaderNodeTexGradient", gradient_type="RADIAL")
    mp = mapping(nt, tc.outputs["Object"], rot=(rad(90), 0, 0))
    ln(nt, mp, gr.inputs["Vector"])
    wn = noise(nt, math_node(nt, "MULTIPLY", gr.outputs["Fac"], 40.0), 3.0, 2.0)
    iris_col = ramp(nt, math_node(nt, "ADD", math_node(nt, "DIVIDE", ri.outputs["Value"], ir),
                                  math_node(nt, "MULTIPLY", wn.outputs["Fac"], 0.35)),
                    [(0.2, (1.0, 0.85, 0.2)), (0.55, (1.0, 0.35, 0.02)),
                     (0.95, (0.5, 0.02, 0.01))])
    # sclera with veins
    vo = nn(nt, "ShaderNodeTexVoronoi", {"Scale": 6.0}, feature="DISTANCE_TO_EDGE")
    ln(nt, tc.outputs["Object"], vo.inputs["Vector"])
    veins = math_node(nt, "LESS_THAN", vo.outputs["Distance"], 0.02)
    scl = nn(nt, "ShaderNodeMix", data_type="RGBA")
    ln(nt, veins, scl.inputs["Factor"])
    scl.inputs[6].default_value = (0.92, 0.86, 0.78, 1)
    scl.inputs[7].default_value = (0.7, 0.04, 0.03, 1)
    # iris mask (front and ri < ir)
    iris_m = math_node(nt, "MULTIPLY", front, math_node(nt, "LESS_THAN", ri.outputs["Value"], ir))
    m1 = nn(nt, "ShaderNodeMix", data_type="RGBA")
    ln(nt, iris_m, m1.inputs["Factor"])
    ln(nt, scl.outputs[2], m1.inputs[6])
    ln(nt, iris_col, m1.inputs[7])
    pupil = math_node(nt, "MULTIPLY", front, math_node(nt, "LESS_THAN", rp.outputs["Value"], a.get("pupil", 0.42)))
    m2 = nn(nt, "ShaderNodeMix", data_type="RGBA")
    ln(nt, pupil, m2.inputs["Factor"])
    ln(nt, m1.outputs[2], m2.inputs[6])
    m2.inputs[7].default_value = (0.0, 0.0, 0.0, 1)
    ln(nt, m2.outputs[2], I["Base Color"])
    # the iris glows
    ln(nt, iris_col, I["Emission Color"])
    ln(nt, math_node(nt, "MULTIPLY", math_node(nt, "SUBTRACT", iris_m, pupil),
                     a.get("glow", 2.0)), I["Emission Strength"])
    return None


def _pat_prism(nt, I, tc, color, a):
    """Rainbow liquid for the elixir: hue swirls over object space."""
    vec = tc.outputs["Object"]
    nz = noise(nt, vec, 1.5, 3.0, 0.5, 2.0)
    sep = nn(nt, "ShaderNodeSeparateXYZ")
    ln(nt, vec, sep.inputs[0])
    f = math_node(nt, "ADD", math_node(nt, "MULTIPLY", sep.outputs["Z"], 1.4),
                  math_node(nt, "MULTIPLY", nz.outputs["Fac"], 1.2))
    f = math_node(nt, "FRACT", f)
    col = ramp(nt, f, [(0.0, (1.0, 0.1, 0.3)), (0.18, (1.0, 0.6, 0.05)),
                        (0.36, (0.3, 1.0, 0.2)), (0.54, (0.05, 0.8, 1.0)),
                        (0.72, (0.3, 0.2, 1.0)), (0.9, (1.0, 0.15, 0.8)),
                        (1.0, (1.0, 0.1, 0.3))])
    ln(nt, col, I["Base Color"])
    ln(nt, col, I["Emission Color"])
    return None


_PATTERNS = dict(wood=_pat_wood, rust=_pat_rust, stone=_pat_stone,
                 marble=_pat_marble, parchment=_pat_parchment,
                 leather=_pat_leather, bands=_pat_bands, veins=_pat_veins,
                 roast=_pat_roast, crust=_pat_crust, staves=_pat_staves,
                 eye=_pat_eye, prism=_pat_prism)


def M_flame(name="flame", core=(1.0, 0.55, 0.12), mid=(1.0, 0.24, 0.02),
            tip=(0.7, 0.06, 0.02), strength=2.0, soft=1.6):
    """Emission flame: bright core at the base, reddening toward the tip,
    fading to transparent at grazing angles (soft edges)."""
    if name in G.mats:
        return G.mats[name]
    m = bpy.data.materials.new(name)
    nt = m.node_tree
    nt.nodes.clear()
    out = nn(nt, "ShaderNodeOutputMaterial")
    tc = nn(nt, "ShaderNodeTexCoord")
    sep = nn(nt, "ShaderNodeSeparateXYZ")
    ln(nt, tc.outputs["Generated"], sep.inputs[0])
    col = ramp(nt, sep.outputs["Z"], [(0.0, core), (0.35, core), (0.65, mid), (1.0, tip)])
    em = nn(nt, "ShaderNodeEmission", {"Strength": strength})
    ln(nt, col, em.inputs["Color"])
    lw = nn(nt, "ShaderNodeLayerWeight", {"Blend": 0.5})
    fac = math_node(nt, "POWER", lw.outputs["Facing"], soft)
    # the tip is more transparent
    fac = math_node(nt, "ADD", fac, math_node(nt, "MULTIPLY", sep.outputs["Z"], 0.35), clamp=True)
    tr = nn(nt, "ShaderNodeBsdfTransparent")
    mix = nn(nt, "ShaderNodeMixShader")
    ln(nt, fac, mix.inputs["Fac"])
    ln(nt, em.outputs[0], mix.inputs[1])
    ln(nt, tr.outputs[0], mix.inputs[2])
    ln(nt, mix.outputs[0], out.inputs["Surface"])
    G.mats[name] = m
    return m


def M_glowshell(name, color, strength=3.0, soft=1.2):
    """Additive-looking glow shell (emission fading to transparent at edges)."""
    if name in G.mats:
        return G.mats[name]
    m = bpy.data.materials.new(name)
    nt = m.node_tree
    nt.nodes.clear()
    out = nn(nt, "ShaderNodeOutputMaterial")
    em = nn(nt, "ShaderNodeEmission", {"Strength": strength, "Color": (*color, 1)})
    lw = nn(nt, "ShaderNodeLayerWeight", {"Blend": 0.5})
    fac = math_node(nt, "POWER", lw.outputs["Facing"], soft)
    tr = nn(nt, "ShaderNodeBsdfTransparent")
    mix = nn(nt, "ShaderNodeMixShader")
    ln(nt, fac, mix.inputs["Fac"])
    ln(nt, em.outputs[0], mix.inputs[1])
    ln(nt, tr.outputs[0], mix.inputs[2])
    ln(nt, mix.outputs[0], out.inputs["Surface"])
    G.mats[name] = m
    return m


def M_beam(name, color, strength=2.0):
    """Vertical light beam: emission fading upward (Generated Z) and to the
    sides (Generated X) -> treasure glow / holy light."""
    if name in G.mats:
        return G.mats[name]
    m = bpy.data.materials.new(name)
    nt = m.node_tree
    nt.nodes.clear()
    out = nn(nt, "ShaderNodeOutputMaterial")
    tc = nn(nt, "ShaderNodeTexCoord")
    sep = nn(nt, "ShaderNodeSeparateXYZ")
    ln(nt, tc.outputs["Generated"], sep.inputs[0])
    fz = ramp(nt, sep.outputs["Z"], [(0.0, (1, 1, 1)), (1.0, (0, 0, 0))])
    xd = math_node(nt, "ABSOLUTE", math_node(nt, "SUBTRACT", sep.outputs["X"], 0.5))
    fx = ramp(nt, xd, [(0.0, (1, 1, 1)), (0.5, (0, 0, 0))])
    bw1 = nn(nt, "ShaderNodeRGBToBW")
    ln(nt, fz, bw1.inputs[0])
    bw2 = nn(nt, "ShaderNodeRGBToBW")
    ln(nt, fx, bw2.inputs[0])
    f = math_node(nt, "MULTIPLY", bw1.outputs[0], bw2.outputs[0])
    f = math_node(nt, "POWER", f, 1.5)
    em = nn(nt, "ShaderNodeEmission", {"Strength": strength, "Color": (*color, 1)})
    tr = nn(nt, "ShaderNodeBsdfTransparent")
    mix = nn(nt, "ShaderNodeMixShader")
    ln(nt, f, mix.inputs["Fac"])
    ln(nt, tr.outputs[0], mix.inputs[1])
    ln(nt, em.outputs[0], mix.inputs[2])
    ln(nt, mix.outputs[0], out.inputs["Surface"])
    G.mats[name] = m
    return m


# ---- palette ------------------------------------------------------------------
def M_iron():
    return pbr("iron", (0.30, 0.29, 0.28), metal=1, rough=0.42, noise_rough=0.15,
               pattern="rust", scale=4.0)


def M_darkiron():
    return pbr("darkiron", (0.13, 0.125, 0.12), metal=1, rough=0.38,
               noise_rough=0.12, pattern="rust", rust=(0.18, 0.08, 0.04))


def M_steel():
    return pbr("steel", (0.72, 0.74, 0.78), metal=1, rough=0.26, noise_rough=0.1)


def M_silver():
    return pbr("silver", (0.94, 0.95, 0.98), metal=1, rough=0.2, noise_rough=0.06)


def M_gold():
    return pbr("gold", (1.0, 0.68, 0.24), metal=1, rough=0.18, noise_rough=0.06)


def M_palegold():
    return pbr("palegold", (1.0, 0.84, 0.52), metal=1, rough=0.16)


def M_brass():
    return pbr("brass", (0.80, 0.56, 0.26), metal=1, rough=0.3, noise_rough=0.12)


def M_bronze():
    return pbr("bronze", (0.60, 0.34, 0.16), metal=1, rough=0.34, noise_rough=0.12)


def M_blackmetal():
    return pbr("blackmetal", (0.05, 0.045, 0.055), metal=1, rough=0.26,
               noise_rough=0.08)


def M_wood(tint=(0.40, 0.22, 0.10), name="wood", **kw):
    return pbr(name, tint, rough=0.58, pattern="wood", **kw)


def M_darkwood(**kw):
    return M_wood((0.20, 0.10, 0.05), "darkwood", **kw)


def M_leather(color=(0.34, 0.18, 0.08), name="leather", **kw):
    return pbr(name, color, rough=0.5, coat=0.2, coat_rough=0.3,
               pattern="leather", **kw)


def M_cloth(color, name="cloth"):
    return pbr(name, color, rough=0.85, sheen=0.7, bump=0.25, bump_scale=140)


def M_bone(name="bone", color=(0.86, 0.79, 0.62)):
    return pbr(name, color, rough=0.42, sss=0.15, sss_radius=(1.0, 0.6, 0.3),
               bump=0.18, bump_scale=30)


def M_parchment(name="parchment", color=(0.88, 0.76, 0.54), **kw):
    return pbr(name, color, rough=0.78, sss=0.05, pattern="parchment", **kw)


def M_glass(name="glass", tint=(0.95, 0.97, 1.0), rough=0.02):
    return pbr(name, tint, rough=rough, trans=1.0, ior=1.47, spec=0.7)


def M_liquid(name, color, emit_str=1.2, trans=0.75):
    return pbr(name, color, rough=0.05, trans=trans, ior=1.33, emit=color,
               emit_str=emit_str, spec=0.6)


def M_gem(name, color, glow=1.5, trans=0.55, ior=1.9):
    return pbr(name, color, rough=0.02, trans=trans, ior=ior, spec=1.0,
               emit=color, emit_str=glow)


def M_glow(name, color, strength=6.0, base=None):
    return pbr(name, base or tuple(c * 0.4 for c in color), rough=0.3,
               emit=color, emit_str=strength)


def M_wax(name="wax", color=(0.93, 0.88, 0.74)):
    return pbr(name, color, rough=0.45, sss=0.35, sss_radius=(1.0, 0.7, 0.4),
               coat=0.15)


def M_sealwax(name, color):
    return pbr(name, color, rough=0.28, sss=0.2, coat=0.4, coat_rough=0.12,
               sss_radius=(1.0, 0.3, 0.2), bump=0.15, bump_scale=18)


def M_stone(name="stone", color=(0.42, 0.40, 0.38), **kw):
    return pbr(name, color, rough=0.82, pattern="stone", **kw)


def M_marble(name="marble", color=(0.90, 0.88, 0.85), **kw):
    return pbr(name, color, rough=0.3, sss=0.25, sss_radius=(1.0, 0.9, 0.8),
               pattern="marble", **kw)


def M_black():
    return pbr("black", (0.012, 0.01, 0.012), rough=0.6)


# =============================================================================
#  Geometry helpers
# =============================================================================
class sub:
    """Context manager: parts created inside are parented to a transformed
    empty (sub-assemblies such as a candle on a chandelier arm)."""

    def __init__(self, loc=(0, 0, 0), rot=(0, 0, 0), scale=1.0):
        self.loc, self.rot, self.scale = loc, rot, scale

    def __enter__(self):
        e = bpy.data.objects.new("grp", None)
        G.coll.objects.link(e)
        _place(e, self.loc, self.rot, self.scale)
        G.stack.append(e)
        return e

    def __exit__(self, *exc):
        G.stack.pop()
        return False


def _parent():
    return G.stack[-1] if G.stack else G.root


def _place(ob, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1), parent=None):
    ob.parent = parent or _parent()
    ob.location = loc
    ob.rotation_euler = rot
    if isinstance(scale, (int, float)):
        scale = (scale, scale, scale)
    ob.scale = scale
    return ob


def _finish_mesh(me, mat, smooth, sharp):
    if isinstance(mat, (list, tuple)):
        for mm in mat:
            me.materials.append(mm)
    elif mat is not None:
        me.materials.append(mat)
    if smooth:
        me.shade_smooth()
        if sharp is not None:
            me.set_sharp_from_angle(angle=rad(sharp))
    else:
        me.shade_flat()


def make_mesh(name, verts, faces, mat=None, smooth=True, sharp=None, uvs=None,
              face_mats=None, fix_normals=False, **tf):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces])
    me.validate(clean_customdata=False)
    if uvs is not None:
        uvl = me.uv_layers.new(name="UVMap")
        li = 0
        for poly in me.polygons:
            for vi in poly.vertices:
                uvl.data[li].uv = uvs[vi]
                li += 1
    if fix_normals:
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(me)
        bm.free()
    if face_mats is not None:
        _finish_mesh(me, mat, smooth, sharp)
        me.polygons.foreach_set("material_index", face_mats)
    else:
        _finish_mesh(me, mat, smooth, sharp)
    ob = bpy.data.objects.new(name, me)
    G.coll.objects.link(ob)
    _place(ob, **tf)
    return ob


def bm_obj(name, bm, mat=None, smooth=True, sharp=None, **tf):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    _finish_mesh(me, mat, smooth, sharp)
    ob = bpy.data.objects.new(name, me)
    G.coll.objects.link(ob)
    _place(ob, **tf)
    return ob


# ---- modifiers ----------------------------------------------------------------
def bevel(ob, width=0.01, segments=2, angle=40, clamp=True, limit="ANGLE"):
    md = ob.modifiers.new("Bevel", "BEVEL")
    md.width = width
    md.segments = segments
    md.limit_method = limit
    if limit == "ANGLE":
        md.angle_limit = rad(angle)
    md.use_clamp_overlap = clamp
    md.harden_normals = False
    return ob


def subsurf(ob, levels=2):
    md = ob.modifiers.new("Subsurf", "SUBSURF")
    md.levels = levels
    md.render_levels = levels
    return ob


def solidify(ob, thick=0.02, offset=-1.0, rim=True):
    md = ob.modifiers.new("Solidify", "SOLIDIFY")
    md.thickness = thick
    md.offset = offset
    md.use_rim = rim
    md.use_even_offset = True
    return ob


def boolean(ob, cutter, op="DIFFERENCE", solver="EXACT"):
    md = ob.modifiers.new("Bool", "BOOLEAN")
    md.operation = op
    md.object = cutter
    try:
        md.solver = solver
        md.material_mode = "TRANSFER"   # cut faces take the cutter's material
    except Exception:
        pass
    cutter.hide_render = True
    cutter.hide_viewport = True
    cutter["noframe"] = True
    return ob


def displace(ob, strength=0.03, scale=0.4, kind="CLOUDS", mid=0.5, depth=2):
    tex = bpy.data.textures.new("disp", kind)
    if kind in {"CLOUDS", "MARBLE", "WOOD", "STUCCI"}:
        tex.noise_scale = scale
        try:
            tex.noise_depth = depth
        except Exception:
            pass
    elif kind == "VORONOI":
        tex.noise_scale = scale
    md = ob.modifiers.new("Disp", "DISPLACE")
    md.texture = tex
    md.strength = strength
    md.mid_level = mid
    md.texture_coords = "LOCAL"
    return ob


def array(ob, count, offset=(1, 0, 0), relative=False, obj_offset=None):
    md = ob.modifiers.new("Array", "ARRAY")
    md.count = count
    if obj_offset is not None:
        md.use_relative_offset = False
        md.use_constant_offset = False
        md.use_object_offset = True
        md.offset_object = obj_offset
    elif relative:
        md.use_relative_offset = True
        md.relative_offset_displace = offset
    else:
        md.use_relative_offset = False
        md.use_constant_offset = True
        md.constant_offset_displace = offset
    return ob


def radial_array(ob, count, axis="Z", center=(0, 0, 0)):
    """Array modifier with an object offset rotated 360/count about `axis`
    (classic Blender radial array).  The object must be modelled with its
    origin at the rotation centre."""
    e = bpy.data.objects.new("arr_ctl", None)
    G.coll.objects.link(e)
    e.parent = ob
    e.location = center
    idx = "XYZ".index(axis)
    r = [0, 0, 0]
    r[idx] = TAU / count
    e.rotation_euler = r
    array(ob, count, obj_offset=e)
    return ob


# ---- primitives -------------------------------------------------------------
def box(size, mat, loc=(0, 0, 0), rot=(0, 0, 0), bev=0.0, bev_seg=2, name="box"):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    ob = bm_obj(name, bm, mat, smooth=True, sharp=30, loc=loc, rot=rot)
    if bev > 0:
        bevel(ob, bev, bev_seg)
    return ob


def sphere(r, mat, loc=(0, 0, 0), rot=(0, 0, 0), scale=1.0, seg=32, rings=16,
           name="sphere", smooth=True):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=r)
    return bm_obj(name, bm, mat, smooth=smooth, loc=loc, rot=rot, scale=scale)


def ico(r, mat, loc=(0, 0, 0), subdiv=2, smooth=True, scale=1.0, rot=(0, 0, 0),
        name="ico"):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=r)
    return bm_obj(name, bm, mat, smooth=smooth, loc=loc, scale=scale, rot=rot)


def cyl(r, depth, mat, loc=(0, 0, 0), rot=(0, 0, 0), seg=32, r2=None, bev=0.0,
        name="cyl", smooth=True, sharp=40, scale=1.0):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg,
                          radius1=r, radius2=r if r2 is None else r2, depth=depth)
    ob = bm_obj(name, bm, mat, smooth=smooth, sharp=sharp, loc=loc, rot=rot,
                scale=scale)
    if bev > 0:
        bevel(ob, bev, 2)
    return ob


def cone(r, h, mat, loc=(0, 0, 0), rot=(0, 0, 0), seg=16, name="cone",
         smooth=True, scale=1.0):
    """Cone with its base at z=0 and tip at z=h (local)."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=True, segments=seg,
                          radius1=r, radius2=0.0, depth=h)
    bmesh.ops.translate(bm, vec=Vector((0, 0, h / 2)), verts=bm.verts)
    return bm_obj(name, bm, mat, smooth=smooth, sharp=50, loc=loc, rot=rot,
                  scale=scale)


def lathe(profile, mat, seg=48, loc=(0, 0, 0), rot=(0, 0, 0), scale=1.0,
          smooth=True, sharp=None, cap=True, name="lathe", radial=None,
          a0=0.0, a1=None, sx=1.0, sy=1.0, parent=None):
    """Revolve a (r, z) profile (bottom -> top) around Z.

    radial(theta, t) -> radius multiplier (flutes, folds, ruffles), t in [0,1]
    a0/a1 : partial revolution (open lathe, e.g. a veil); caps disabled then.
    """
    full = a1 is None
    if full:
        a1 = a0 + TAU
    nseg = seg if full else seg + 1
    verts, faces, uvs = [], [], []
    rings = []
    npf = len(profile)
    for pi, (r, z) in enumerate(profile):
        t = pi / max(npf - 1, 1)
        if r <= 1e-7 and full:
            rings.append([len(verts)])
            verts.append((0, 0, z))
            uvs.append((0.5, t))
            continue
        ring = []
        for i in range(nseg):
            a = a0 + (a1 - a0) * i / seg
            rr = r * (radial(a, t) if radial else 1.0)
            ring.append(len(verts))
            verts.append((rr * math.cos(a) * sx, rr * math.sin(a) * sy, z))
            uvs.append((i / seg, t))
        rings.append(ring)
    for ra, rb in zip(rings[:-1], rings[1:]):
        if len(ra) == 1 and len(rb) == 1:
            continue
        if len(ra) == 1:
            for i in range(seg):
                faces.append((ra[0], rb[i], rb[(i + 1) % seg]))
        elif len(rb) == 1:
            for i in range(seg):
                faces.append((ra[(i + 1) % seg], ra[i], rb[0]))
        else:
            for i in range(seg):
                j = (i + 1) % nseg if full else i + 1
                faces.append((ra[i], ra[j], rb[j], rb[i]))
    if cap and full:
        if len(rings[0]) > 1:
            faces.append(tuple(reversed(rings[0])))
        if len(rings[-1]) > 1:
            faces.append(tuple(rings[-1]))
    return make_mesh(name, verts, faces, mat, smooth=smooth, sharp=sharp,
                     uvs=uvs, loc=loc, rot=rot, scale=scale,
                     fix_normals=True, parent=parent)


def torus(R, r, mat, loc=(0, 0, 0), rot=(0, 0, 0), seg=48, rseg=12, scale=1.0,
          name="torus", sx=1.0, sy=1.0, rz=1.0, rr=1.0, a0=0.0, a1=None):
    """Torus around Z.  sx/sy stretch the ring, rz/rr scale the tube along Z /
    radially (flat bands: rz > rr).  a0/a1: partial arc (open ends capped)."""
    full = a1 is None
    if full:
        a1 = TAU
    n = seg if full else seg + 1
    verts, faces = [], []
    for i in range(n):
        a = a0 + (a1 - a0) * i / seg
        ca, sa = math.cos(a), math.sin(a)
        for j in range(rseg):
            b = TAU * j / rseg
            rad_ = R + r * rr * math.cos(b)
            verts.append((rad_ * ca * sx, rad_ * sa * sy, r * rz * math.sin(b)))
    for i in range(seg):
        i2 = (i + 1) % n if full else i + 1
        for j in range(rseg):
            j2 = (j + 1) % rseg
            faces.append((i * rseg + j, i2 * rseg + j, i2 * rseg + j2, i * rseg + j2))
    if not full:
        faces.append(tuple(range(rseg))[::-1])
        faces.append(tuple((n - 1) * rseg + j for j in range(rseg)))
    return make_mesh(name, verts, faces, mat, loc=loc, rot=rot, scale=scale,
                     fix_normals=True)


def _poly_area(pts):
    a = 0.0
    n = len(pts)
    for i in range(n):
        x1, z1 = pts[i]
        x2, z2 = pts[(i + 1) % n]
        a += x1 * z2 - x2 * z1
    return a / 2


def extrude(pts, depth, mat, loc=(0, 0, 0), rot=(0, 0, 0), bev=0.0, bev_seg=2,
            name="extr", sharp=35, scale=1.0, bev_angle=40, y0=None):
    """Extrude a 2D (x, z) outline along Y, centred on y=0 (or from y0)."""
    if _poly_area(pts) < 0:
        pts = list(reversed(pts))
    n = len(pts)
    ya = -depth / 2 if y0 is None else y0
    yb = ya + depth
    verts = [(x, ya, z) for (x, z) in pts] + [(x, yb, z) for (x, z) in pts]
    faces = [tuple(range(n)), tuple(range(2 * n - 1, n - 1, -1))]
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, n + i, n + j, j))
    ob = make_mesh(name, verts, faces, mat, smooth=True, sharp=sharp, loc=loc,
                   rot=rot, scale=scale, fix_normals=True)
    if bev > 0:
        bevel(ob, bev, bev_seg, angle=bev_angle)
    return ob


def inflate(pts, depth, mat, rings=6, center=None, flat=False, back=True,
            loc=(0, 0, 0), rot=(0, 0, 0), scale=1.0, name="inflate",
            profile=None, back_depth=None):
    """'Inflate' a star-shaped (x, z) outline into a pillow / cut-gem solid.
    Rings shrink toward `center`; y offset follows `profile(t)` (t=0 at the
    outline, 1 at the centre; default: quarter circle).  flat=True + few rings
    gives a faceted gemstone look."""
    if _poly_area(pts) < 0:
        pts = list(reversed(pts))
    n = len(pts)
    if center is None:
        center = (sum(p[0] for p in pts) / n, sum(p[1] for p in pts) / n)
    cx, cz = center
    prof = profile or (lambda t: math.sqrt(max(0.0, 1 - (1 - t) ** 2)))
    bd = depth if back_depth is None else back_depth
    verts, faces = [], []

    def ring(k, sign, d):
        t = k / rings
        f = 1 - t
        y = -sign * d * prof(t)
        return [(cx + (x - cx) * f, y, cz + (z - cz) * f) for (x, z) in pts]

    # outline ring shared by both halves
    for (x, z) in pts:
        verts.append((x, 0.0, z))
    idx_front = [list(range(n))]
    for k in range(1, rings):
        base = len(verts)
        verts.extend(ring(k, 1, depth))
        idx_front.append(list(range(base, base + n)))
    cf = len(verts)
    verts.append((cx, -depth * prof(1.0), cz))
    idx_back = [list(range(n))]
    if back:
        for k in range(1, rings):
            base = len(verts)
            verts.extend(ring(k, -1, bd))
            idx_back.append(list(range(base, base + n)))
        cb = len(verts)
        verts.append((cx, bd * prof(1.0), cz))
    for rs, cidx, flip in ((idx_front, cf, False), (idx_back, cb if back else None, True)):
        if cidx is None:
            continue
        for a_, b_ in zip(rs[:-1], rs[1:]):
            for i in range(n):
                j = (i + 1) % n
                f = (a_[i], a_[j], b_[j], b_[i])
                faces.append(f[::-1] if flip else f)
        last = rs[-1]
        for i in range(n):
            j = (i + 1) % n
            f = (last[i], last[j], cidx)
            faces.append(f[::-1] if flip else f)
    if not back:
        faces.append(tuple(range(n))[::-1])
    return make_mesh(name, verts, faces, mat, smooth=not flat, loc=loc, rot=rot,
                     scale=scale, fix_normals=True)


def frame_path(path):
    n = len(path)
    T = []
    for i in range(n):
        a = path[max(i - 1, 0)]
        b = path[min(i + 1, n - 1)]
        t = b - a
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


def sweep(path, radius, mat, segs=12, caps=True, name="tube", smooth=True,
          ellipse=(1.0, 1.0), radial=None, sharp=None, **tf):
    """Sweep a circle along `path` (list of 3-tuples).
    radius: float | callable(s) with s in [0,1] along the arc length."""
    path = [Vector(p) for p in path]
    n = len(path)
    L = [0.0]
    for i in range(1, n):
        L.append(L[-1] + (path[i] - path[i - 1]).length)
    total = max(L[-1], 1e-9)
    T, N, B = frame_path(path)
    verts, faces = [], []
    for i in range(n):
        s = L[i] / total
        r = radius(s) if callable(radius) else radius
        for j in range(segs):
            th = TAU * j / segs
            m = radial(s, th) if radial else 1.0
            off = (N[i] * math.cos(th) * ellipse[0] + B[i] * math.sin(th) * ellipse[1]) * r * m
            verts.append(path[i] + off)
    for i in range(n - 1):
        for j in range(segs):
            j2 = (j + 1) % segs
            faces.append((i * segs + j, i * segs + j2, (i + 1) * segs + j2,
                          (i + 1) * segs + j))
    if caps:
        c0 = len(verts)
        verts.append(path[0])
        c1 = len(verts)
        verts.append(path[-1])
        for j in range(segs):
            j2 = (j + 1) % segs
            faces.append((c0, j2, j))
            faces.append((c1, (n - 1) * segs + j, (n - 1) * segs + j2))
    return make_mesh(name, verts, faces, mat, smooth=smooth, sharp=sharp,
                     fix_normals=True, **tf)


def curve_tube(points, bevel_depth, mat, radii=None, name="ctube", kind="NURBS",
               res=4, bevel_res=4, order=4, cyclic=False, caps=True, **tf):
    """Real Blender curve with bevel depth (ropes, fuses, wrought-iron arms).
    `radii` scales the bevel per control point."""
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = bevel_depth
    cu.bevel_resolution = bevel_res
    cu.resolution_u = res
    cu.render_resolution_u = res
    cu.use_fill_caps = caps
    sp = cu.splines.new(kind)
    sp.points.add(len(points) - 1)
    for i, p in enumerate(points):
        sp.points[i].co = (p[0], p[1], p[2], 1.0)
        if radii is not None:
            sp.points[i].radius = radii[i]
    if kind == "NURBS":
        sp.order_u = min(order, len(points))
        sp.use_endpoint_u = True
    sp.use_cyclic_u = cyclic
    sp.use_smooth = True
    ob = bpy.data.objects.new(name, cu)
    G.coll.objects.link(ob)
    if mat is not None:
        cu.materials.append(mat)
    _place(ob, **tf)
    return ob


def bezier_pts(p0, p1, p2, p3, n=24):
    p0, p1, p2, p3 = map(Vector, (p0, p1, p2, p3))
    out = []
    for i in range(n + 1):
        t = i / n
        u = 1 - t
        out.append(u ** 3 * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t ** 3 * p3)
    return out


def catmull(points, n_per=10):
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


def catmull2d(points, n_per=8, closed=True):
    """Smooth closed 2D outline through (x, z) points."""
    P = [Vector((p[0], p[1], 0)) for p in points]
    n = len(P)
    out = []
    rng_ = range(n) if closed else range(n - 1)
    for i in rng_:
        p0 = P[(i - 1) % n] if closed or i > 0 else P[0]
        p1, p2 = P[i], P[(i + 1) % n]
        p3 = P[(i + 2) % n] if closed or i + 2 < n else P[-1]
        for k in range(n_per):
            t = k / n_per
            t2, t3 = t * t, t * t * t
            v = 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
                       + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
            out.append((v.x, v.y))
    if not closed:
        out.append((P[-1].x, P[-1].y))
    return out


def arc_pts(cx, cz, r, a0, a1, n=16, rz=None):
    rz = r if rz is None else rz
    return [(cx + r * math.cos(a0 + (a1 - a0) * i / n),
             cz + rz * math.sin(a0 + (a1 - a0) * i / n)) for i in range(n + 1)]


def mirror_x(half):
    """half: list of (x, z) with x >= 0 from bottom-centre to top-centre."""
    return half + [(-x, z) for (x, z) in reversed(half) if abs(x) > 1e-9]


def shape_heart(s=1.0, n=64):
    pts = []
    for i in range(n):
        t = TAU * i / n
        x = 16 * math.sin(t) ** 3
        z = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        pts.append((x * s / 16, z * s / 16))
    return pts


def shape_cross(w, h, arm, arm_z, flare=0.0):
    """Cross outline (x, z): vertical bar 0..h, horizontal bar of total width
    w centred at arm_z, bar thickness `arm`; flare > 0 widens the ends
    (cross pattee)."""
    a, f = arm / 2, flare
    return [(-a - f, 0.0), (a + f, 0.0), (a, arm_z - a),
            (w / 2, arm_z - a - f), (w / 2, arm_z + a + f), (a, arm_z + a),
            (a + f, h), (-a - f, h), (-a, arm_z + a),
            (-w / 2, arm_z + a + f), (-w / 2, arm_z - a - f), (-a, arm_z - a)]


def shape_star(n, r1, r2, rot=math.pi / 2):
    pts = []
    for i in range(2 * n):
        r = r1 if i % 2 == 0 else r2
        a = rot + math.pi * i / n
        pts.append((r * math.cos(a), r * math.sin(a)))
    return pts


def link_mesh(L, W, wire, seg=20, rseg=8):
    """One oval chain link lying in the XZ plane (long axis Z)."""
    verts, faces = [], []
    straight = max(L - W, 0) / 2
    rr = W / 2 - wire
    path = []
    for i in range(seg):
        a = TAU * i / seg
        x, z = rr * math.cos(a), rr * math.sin(a)
        z += straight if z >= 0 else -straight
        path.append((x, z, a))
    for (x, z, a) in path:
        nx, nz = math.cos(a), math.sin(a)
        for j in range(rseg):
            b = TAU * j / rseg
            verts.append((x + wire * math.cos(b) * nx, wire * math.sin(b),
                          z + wire * math.cos(b) * nz))
    for i in range(seg):
        i2 = (i + 1) % seg
        for j in range(rseg):
            j2 = (j + 1) % rseg
            faces.append((i * rseg + j, i2 * rseg + j, i2 * rseg + j2, i * rseg + j2))
    me = bpy.data.meshes.new("link")
    me.from_pydata(verts, [], faces)
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    me.shade_smooth()
    return me


def chain(path, mat, link_len=0.12, wire=0.014, width=None):
    """Chain of alternating links following a polyline (instanced meshes)."""
    width = width or link_len * 0.62
    me = link_mesh(link_len, width, wire)
    me.materials.append(mat)
    pitch = link_len - 2 * wire * 1.1
    pts = [Vector(p) for p in path]
    # resample
    out = [pts[0]]
    acc = 0.0
    for i in range(1, len(pts)):
        a, b = pts[i - 1], pts[i]
        seg = (b - a).length
        while acc + seg >= pitch:
            t = (pitch - acc) / seg
            a = a.lerp(b, t)
            out.append(a)
            seg = (b - a).length
            acc = 0.0
        acc += seg
    obs = []
    for i in range(len(out) - 1):
        p = (out[i] + out[i + 1]) / 2
        t = (out[i + 1] - out[i]).normalized()
        q = t.to_track_quat("Z", "Y")
        M = q.to_matrix().to_4x4()
        if i % 2:
            M = M @ Matrix.Rotation(math.pi / 2, 4, "Z")
        M = Matrix.Translation(p) @ M
        ob = bpy.data.objects.new("link", me)
        G.coll.objects.link(ob)
        ob.parent = _parent()
        ob.matrix_basis = M
        obs.append(ob)
    return obs


def rivet_row(p0, p1, n, r, mat, normal=(0, -1, 0)):
    """Row of hemispherical rivets using an Array modifier."""
    p0, p1 = Vector(p0), Vector(p1)
    step = (p1 - p0) / max(n - 1, 1)
    ob = sphere(r, mat, loc=p0, seg=12, rings=6, name="rivet")
    ob.scale = (1, 0.55, 1) if abs(normal[1]) > 0.5 else (1, 1, 0.55)
    # constant offset is in local space -> undo the squash
    sc = Vector(ob.scale)
    array(ob, n, offset=(step.x / sc.x, step.y / sc.y, step.z / sc.z))
    return ob


def flame(loc, h, mat=None, core_mat=None, r=None, lean=0.0, light=True,
          power=None, parent=None):
    """Teardrop flame: outer translucent shell + hot inner core (+ light)."""
    r = r or h * 0.21
    mat = mat or M_flame()
    core_mat = core_mat or M_flame("flame_core", core=(1.0, 0.85, 0.55),
                                   mid=(1.0, 0.6, 0.2), tip=(1.0, 0.4, 0.06),
                                   strength=4.0, soft=1.0)
    prof = []
    N = 16
    for i in range(N + 1):
        t = i / N
        rr = r * math.sin(math.pi * t ** 0.55) ** 0.9 * (1 - 0.3 * t)
        prof.append((max(rr, 0.0), h * t))
    prof[0] = (0.0, 0.0)
    prof[-1] = (0.0, h)
    ph = random.Random(int(loc[0] * 1000 + loc[2] * 77)).uniform(0, TAU)
    ob = lathe(prof, mat, seg=24, loc=loc, name="flame", parent=parent,
               radial=lambda a, t: 1 + 0.22 * t * math.sin(3 * a + t * 7 + ph))
    core = lathe([(x * 0.5, z * 0.62) for (x, z) in prof], core_mat, seg=16,
                 loc=(loc[0], loc[1] - r * 0.1, loc[2] + h * 0.02), name="flame_core",
                 parent=parent)
    if lean:
        for o in (ob, core):
            o.rotation_euler = (0, rad(lean), 0)
    if light:
        point_light((loc[0], loc[1] - r * 0.5, loc[2] + h * 0.35),
                    power=power if power is not None else 40.0 * h / 0.25,
                    radius=r * 0.6, parent=parent)
    return ob


def candle(loc, r, h, drip_seed=0, wax=None, flame_h=None, light=True, power=None):
    """Wax candle standing at loc (base), with drips, wick and flame."""
    wax = wax or M_wax()
    rng = random.Random(drip_seed)
    x, y, z = loc
    # slightly melted top: lathe with a dip
    prof = [(0, z), (r, z), (r, z + h - r * 0.25), (r * 0.96, z + h - r * 0.05),
            (r * 0.7, z + h - r * 0.12), (r * 0.25, z + h - r * 0.22), (0, z + h - r * 0.22)]
    body = lathe(prof, wax, seg=28, loc=(x, y, 0), name="candle")
    # drips: elongated blobs hanging over the rim
    for i in range(rng.randint(3, 5)):
        a = rng.uniform(0, TAU)
        dl = rng.uniform(0.15, 0.55) * h
        dr = r * rng.uniform(0.12, 0.2)
        pts = []
        for k in range(8):
            t = k / 7
            pts.append((x + (r + dr * 0.4) * math.cos(a), y + (r + dr * 0.4) * math.sin(a),
                        z + h - r * 0.1 - dl * t))
        sweep(pts, lambda s, dr=dr: dr * (1.0 - 0.25 * s) * (1.15 if s > 0.9 else 1.0),
              wax, segs=10, name="drip")
        sphere(dr * 1.15, wax, loc=pts[-1], seg=10, rings=6, name="dripend")
    top = z + h - r * 0.22
    cyl(r * 0.07, r * 0.5, M_black(), loc=(x, y, top + r * 0.2), seg=6, name="wick")
    fh = flame_h if flame_h is not None else r * 3.4
    if fh > 0:
        flame((x, y, top + r * 0.18), fh, light=light, power=power)
    return body


# =============================================================================
#  ICON BUILDERS
# =============================================================================
def flask(profile, glass, liquid, fill_z, thick=0.03, seg=48, gap=0.012,
          smooth=True):
    """Glass vessel (lathe + solidify) with a liquid body filled up to fill_z."""
    outer = lathe(profile, glass, seg=seg, cap=False, name="glass", smooth=smooth)
    solidify(outer, thick, offset=-1.0)
    if smooth:
        subsurf(outer, 1)
    # liquid: profile shrunk inward, clipped at fill_z
    inner = []
    for i, (r, z) in enumerate(profile):
        if z > fill_z:
            (r0, z0) = profile[i - 1]
            t = (fill_z - z0) / (z - z0) if z != z0 else 0
            inner.append((max(r0 + (r - r0) * t - thick - gap, 0.0), fill_z))
            break
        inner.append((max(r - thick - gap, 0.0), max(z, profile[0][1] + thick + gap)))
    inner.append((0.0, fill_z))
    liq = lathe(inner, liquid, seg=seg, name="liquid", smooth=smooth)
    if smooth:
        subsurf(liq, 1)
    return outer, liq


def cork(z0, r, h, mat=None, taper=0.9):
    mat = mat or pbr("cork", (0.55, 0.38, 0.22), rough=0.8, bump=0.6, bump_scale=90)
    prof = [(0, z0), (r * taper, z0), (r, z0 + h * 0.85), (r * 0.94, z0 + h), (0, z0 + h)]
    ob = lathe(prof, mat, seg=32, name="cork", sharp=50)
    bevel(ob, r * 0.12, 2)
    return ob


def _round_flask_profile(R=0.55, zc=0.55, neck_r=0.13, neck_top=1.4, a_top=64):
    prof = [(0.0, zc - R)]
    for i in range(1, 25):
        a = rad(-90 + (a_top + 90) * i / 24)
        prof.append((R * math.cos(a), zc + R * math.sin(a)))
    zs = zc + R * math.sin(rad(a_top))
    prof += [(neck_r * 1.25, zs + 0.06), (neck_r * 1.02, zs + 0.13),
             (neck_r, zs + 0.2), (neck_r, neck_top - 0.05), (neck_r * 1.3, neck_top),
             (neck_r * 1.3, neck_top + 0.04), (neck_r * 1.08, neck_top + 0.07)]
    return prof


@item("potion_hp")
def build_potion_hp():
    glass = M_glass()
    liq = M_liquid("hp_liq", (0.85, 0.0, 0.02), emit_str=0.7)
    prof = _round_flask_profile()
    flask(prof, glass, liq, fill_z=0.78)
    cork(1.28, 0.125, 0.26)
    # red wax dip over the cork + twine
    torus(0.145, 0.018, pbr("twine", (0.55, 0.42, 0.28), rough=0.9, bump=0.5,
                               bump_scale=200), loc=(0, 0, 1.2), rseg=8)
    torus(0.15, 0.016, pbr("twine", (0.55, 0.42, 0.28)), loc=(0, 0, 1.24), rseg=8)
    # small bubbles inside
    rng = random.Random(3)
    bub = M_glass("bubble")
    for i in range(7):
        a = rng.uniform(0, TAU)
        rr = rng.uniform(0.05, 0.35)
        sphere(rng.uniform(0.015, 0.035), bub, loc=(rr * math.cos(a), rr * math.sin(a) - 0.1,
                                                    rng.uniform(0.25, 0.7)), seg=10, rings=6)
    # gold heart emblem on the front
    inflate(shape_heart(0.12), 0.04, M_gold(), rings=4, loc=(0, -0.56, 0.52),
            rot=(rad(-6), 0, 0))
    view(pitch=14, diag=-8, glow=0.8, glow_beauty=0.5)


def bubbles(n, rmax, z0, z1, seed=3, mat=None, rmin=0.012, rbub=0.03):
    rng = random.Random(seed)
    mat = mat or M_glass("bubble")
    for _ in range(n):
        a = rng.uniform(0, TAU)
        rr = rng.uniform(0.03, rmax)
        sphere(rng.uniform(rmin, rbub), mat, loc=(rr * math.cos(a), rr * math.sin(a),
                                                  rng.uniform(z0, z1)), seg=10, rings=6,
               name="bubble")


def wax_drips(z_top, r, n, mat, length=(0.06, 0.16), seed=1, rr=0.022):
    rng = random.Random(seed)
    for _ in range(n):
        a = rng.uniform(0, TAU)
        dl = rng.uniform(*length)
        pts = [((r + 0.004) * math.cos(a), (r + 0.004) * math.sin(a), z_top - dl * k / 6)
               for k in range(7)]
        sweep(pts, lambda s: rr * (1.0 - 0.3 * s), mat, segs=10, name="drip")
        sphere(rr * 0.95, mat, loc=pts[-1], seg=10, rings=6, name="dripend")


def leaf(loc, length, width, rot, mat=None, depth=0.016):
    mat = mat or pbr("leaf", (0.13, 0.38, 0.07), rough=0.45, sss=0.2,
                     sss_radius=(0.3, 1.0, 0.2), coat=0.3)
    n = 12
    up = [(length * i / n, width * math.sin(math.pi * i / n) ** 0.8) for i in range(n + 1)]
    lo = [(length * i / n, -width * 0.8 * math.sin(math.pi * i / n) ** 0.8)
          for i in range(n - 1, 0, -1)]
    return inflate(up + lo, depth, mat, rings=3, center=(length * 0.45, 0.0),
                   loc=loc, rot=rot, name="leaf")


@item("potion_mp")
def build_potion_mp():
    glass = M_glass()
    liq = M_liquid("mp_liq", (0.02, 0.2, 0.95), emit_str=0.9)
    prof = [(0.0, 0.0), (0.44, 0.0), (0.50, 0.02), (0.53, 0.07), (0.52, 0.12),
            (0.40, 0.42), (0.28, 0.70), (0.17, 0.92), (0.135, 1.0), (0.13, 1.08),
            (0.13, 1.32), (0.17, 1.35), (0.17, 1.39), (0.14, 1.41)]
    flask(prof, glass, liq, fill_z=0.6)
    cork(1.24, 0.12, 0.24)
    wax = M_sealwax("bluewax", (0.04, 0.10, 0.50))
    lathe([(0.0, 1.53), (0.10, 1.525), (0.16, 1.50), (0.185, 1.44), (0.185, 1.33),
           (0.18, 1.29), (0.0, 1.29)], wax, seg=40)
    wax_drips(1.31, 0.18, 5, wax, seed=4)
    inflate(shape_star(5, 0.14, 0.06), 0.04, M_silver(), rings=3, flat=True,
            loc=(0, -0.445, 0.31), rot=(rad(-22), 0, 0))
    bubbles(8, 0.3, 0.1, 0.5, seed=5)
    view(pitch=14, diag=7, glow=0.8, glow_beauty=0.5)


@item("potion_full")
def build_potion_full():
    glass = M_glass()
    liq = M_liquid("full_liq", (0.95, 0.42, 0.0), emit_str=0.5, trans=0.6)
    ctrl = [(0.30, 0.10), (0.52, 0.2), (0.63, 0.42), (0.64, 0.62), (0.56, 0.84),
            (0.40, 1.0), (0.24, 1.1), (0.17, 1.2)]
    body = catmull2d(ctrl, 6, closed=False)
    prof = [(0.0, 0.08), (0.18, 0.085)] + body + [(0.16, 1.3), (0.16, 1.44),
                                                  (0.21, 1.47), (0.21, 1.51), (0.17, 1.53)]
    flask(prof, glass, liq, fill_z=0.97)
    gold = M_gold()
    lathe([(0.0, -0.05), (0.42, -0.05), (0.46, -0.01), (0.42, 0.04), (0.33, 0.07),
           (0.35, 0.12), (0.27, 0.17), (0.0, 0.17)], gold, seg=48, sharp=45)
    for k in range(6):
        a = TAU * k / 6 + TAU / 12
        pts = [((r + 0.022) * math.cos(a), (r + 0.022) * math.sin(a), z)
               for (r, z) in body if z < 1.12]
        sweep(pts, 0.02, gold, segs=8, name="rib")
        # little gem studs on the ribs at the equator
        rr = 0.665
        sphere(0.04, M_gem("ruby", (1.0, 0.04, 0.08), glow=1.0),
               loc=(rr * math.cos(a), rr * math.sin(a), 0.62), seg=12, rings=8)
    torus(0.645, 0.026, gold, loc=(0, 0, 0.62), rz=1.3, seg=64)
    torus(0.185, 0.035, gold, loc=(0, 0, 1.22))
    lathe([(0.0, 1.36), (0.14, 1.36), (0.15, 1.5), (0.21, 1.54), (0.24, 1.6),
           (0.21, 1.66), (0.11, 1.70), (0.075, 1.75), (0.0, 1.76)], gold, seg=40)
    for k in range(8):
        a = TAU * k / 8
        cone(0.03, 0.1, gold, loc=(0.2 * math.cos(a), 0.2 * math.sin(a), 1.64),
             rot=(0, 0, 0), seg=8, name="spike")
    sphere(0.085, M_gem("ruby", (1.0, 0.04, 0.08), glow=1.0), loc=(0, 0, 1.82), seg=20,
           rings=12)
    bubbles(8, 0.4, 0.2, 0.85, seed=7)
    view(pitch=12, diag=-6, fill=0.9, glow=0.9, glow_beauty=0.55)


@item("elixir")
def build_elixir():
    glass = M_glass("glass_facet")
    liq = pbr("prism_liq", (1, 1, 1), rough=0.05, trans=0.45, ior=1.33,
              emit=(1, 1, 1), emit_str=0.9, pattern="prism")
    prof = [(0.0, 0.0), (0.30, 0.0), (0.40, 0.1), (0.44, 0.35), (0.44, 0.55),
            (0.34, 0.78), (0.16, 0.92), (0.11, 0.98), (0.11, 1.18), (0.15, 1.21),
            (0.15, 1.25), (0.12, 1.27)]
    flask(prof, glass, liq, fill_z=0.8, seg=6, smooth=False, thick=0.025)
    gold = M_gold()
    lathe([(0.0, -0.07), (0.40, -0.07), (0.44, -0.03), (0.38, 0.02), (0.0, 0.02)], gold,
          seg=6, smooth=False)
    torus(0.13, 0.03, gold, loc=(0, 0, 1.0))
    torus(0.46, 0.022, gold, loc=(0, 0, 0.45), seg=6, rz=1.6)
    gem = M_gem("amethyst", (0.6, 0.1, 1.0), glow=0.7)
    g = lathe([(0.0, 1.18), (0.15, 1.36), (0.0, 1.66)], gem, seg=4, smooth=False,
              name="stopper_gem")
    g.rotation_euler = (0, 0, rad(45))
    torus(0.12, 0.025, gold, loc=(0, 0, 1.26))
    wing = [(0.0, -0.05), (0.10, -0.08), (0.16, -0.02), (0.24, -0.05), (0.30, 0.04),
            (0.38, 0.02), (0.43, 0.12), (0.50, 0.13), (0.53, 0.24), (0.56, 0.36),
            (0.48, 0.34), (0.36, 0.30), (0.24, 0.24), (0.12, 0.16), (0.0, 0.10)]
    for sx in (1, -1):
        pts = [(sx * x, z) for (x, z) in wing]
        inflate(pts, 0.035, M_palegold(), rings=3, loc=(sx * 0.40, 0.0, 0.58),
                rot=(0, 0, rad(-28 * sx)), name="wing")
    view(pitch=10, diag=0, fill=0.9, glow=1.0, glow_beauty=0.6)


@item("antidote")
def build_antidote():
    glass = M_glass()
    liq = M_liquid("anti_liq", (0.12, 0.85, 0.16), emit_str=0.9)
    prof = [(0.0, 0.0)] + [(0.17 * math.sin(rad(a)), 0.17 - 0.17 * math.cos(rad(a)))
                           for a in range(15, 91, 15)]
    prof += [(0.17, 1.1), (0.15, 1.18), (0.11, 1.24), (0.11, 1.44), (0.145, 1.47),
             (0.145, 1.5), (0.12, 1.52)]
    flask(prof, glass, liq, fill_z=1.0, seg=40)
    cork(1.36, 0.1, 0.24)
    twine = pbr("twine", (0.55, 0.42, 0.28), rough=0.9, bump=0.5, bump_scale=200)
    torus(0.122, 0.016, twine, loc=(0, 0, 1.3), rseg=8)
    torus(0.124, 0.016, twine, loc=(0, 0, 1.335), rseg=8)
    lab = lathe([(0.182, 0.42), (0.182, 0.86)], M_parchment("label", (0.9, 0.84, 0.66)),
                seg=16, a0=rad(-90 - 60), a1=rad(-90 + 60), cap=False, name="label")
    solidify(lab, 0.008, offset=1.0)
    inflate(shape_cross(0.16, 0.24, 0.06, 0.14, 0.012), 0.02,
            pbr("greenink", (0.03, 0.35, 0.06), rough=0.5), rings=3,
            loc=(0, -0.19, 0.52))
    leaf((-0.08, -0.1, 1.33), 0.34, 0.09, (0, rad(140), rad(-10)))
    leaf((0.06, -0.1, 1.31), 0.28, 0.08, (0, rad(55), rad(10)))
    bubbles(6, 0.1, 0.15, 0.9, seed=9, rbub=0.022)
    view(pitch=10, diag=-20, fill=0.9, glow=0.8, glow_beauty=0.5)


@item("meat")
def build_meat():
    roast = pbr("roast", (0.4, 0.12, 0.04), rough=0.35, coat=0.6, coat_rough=0.15,
                pattern="roast")
    m = ico(0.5, roast, subdiv=4, scale=(1.2, 0.95, 0.9), name="meat")
    displace(m, strength=0.09, scale=0.35)
    subsurf(m, 1)
    bone = M_bone()
    cyl(0.085, 2.1, bone, rot=(0, rad(90), 0), seg=24, name="bone")
    for sx in (-1, 1):
        for dz in (-0.075, 0.075):
            sphere(0.115, bone, loc=(sx * 1.05, 0, dz), seg=20, rings=12, name="knob")
    view(diag=-28, pitch=20, yaw=-18, fill=0.92, glow=0.0)


@item("bread")
def build_bread():
    crust = pbr("crust", (0.6, 0.3, 0.1), rough=0.55, coat=0.2, pattern="crust", flour=0.5)
    crumb = pbr("crumb", (0.95, 0.84, 0.62), rough=0.85, bump=0.8, bump_scale=35)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=72, v_segments=36, radius=0.5)
    for v in bm.verts:
        x, y, z = v.co
        if z < -0.2:
            z = -0.2 + (z + 0.2) * 0.25
        v.co = Vector((x * 1.6, y * 0.85, z * 0.8))
    loaf = bm_obj("loaf", bm, crust)
    displace(loaf, 0.025, 0.25)
    for xo in (-0.48, 0.0, 0.48):
        zt = 0.8 * math.sqrt(max(0.25 - (xo / 1.6) ** 2, 0)) + 0.035
        c = sphere(0.5, crumb, loc=(xo, -0.03, zt - 0.005), scale=(0.62, 0.2, 0.17),
                   rot=(0, 0, rad(58)), seg=24, rings=12, name="score")
        boolean(loaf, c)
    view(pitch=30, yaw=-16, diag=12, fill=0.92, glow=0.0)


STONE_TIERS = {
    1: dict(col=(0.55, 0.58, 0.62), glow=0.06, n=2, size=0.85, shards=0),
    2: dict(col=(0.03, 0.75, 0.16), glow=0.35, n=3, size=0.9, shards=0),
    3: dict(col=(0.02, 0.28, 1.0), glow=0.5, n=4, size=0.95, shards=0),
    4: dict(col=(0.28, 0.02, 1.0), glow=0.5, n=5, size=1.0, shards=3),
    5: dict(col=(1.0, 0.5, 0.02), glow=0.55, n=5, size=1.02, shards=4, band=True),
    6: dict(col=(0.72, 0.0, 0.025), glow=0.45, n=7, size=1.08, shards=6, obsidian=True),
}


def crystal(base, direction, r, h, mat, twist=0.0, sides=6, bev=0.012):
    prof = [(0.0, -0.05 * h), (r * 0.82, -0.05 * h), (r, 0.1 * h), (r, 0.72 * h), (0.0, h)]
    ob = lathe(prof, mat, seg=sides, smooth=False, name="crystal")
    q = Vector(direction).normalized().to_track_quat("Z", "Y")
    ob.rotation_mode = "QUATERNION"
    ob.rotation_quaternion = q @ Matrix.Rotation(twist, 4, "Z").to_quaternion()
    ob.location = base
    if bev:
        bevel(ob, bev * r / 0.2, 1, angle=20)
    return ob


def _build_stone(tier):
    T = STONE_TIERS[tier]
    rng = random.Random(40 + tier)
    col = T["col"]
    gem = M_gem("stonegem%d" % tier, col, glow=T["glow"], trans=0.35, ior=1.7)
    if T.get("obsidian"):
        rock_m = pbr("obsidian", (0.03, 0.02, 0.03), rough=0.22, pattern="veins",
                     vein_color=(1.0, 0.05, 0.1), strength=6.0, density=3.5, width=0.05)
    elif tier == 5:
        rock_m = M_stone("rock5", (0.46, 0.38, 0.28), scale=4.0)
    else:
        rock_m = M_stone("rock", (0.36, 0.35, 0.36), scale=4.0)
    rock = ico(0.5, rock_m, subdiv=2, smooth=False, scale=(0.95, 0.85, 0.55), name="rock",
               loc=(0, 0, -0.05))
    displace(rock, 0.16, 0.5)
    S = T["size"]
    H = 1.05 * S
    crystal((0, 0, 0.0), (0.05, 0.0, 1.0), 0.19 * S, H, gem, twist=rng.uniform(0, 1))
    for k in range(T["n"] - 1):
        a = TAU * (k + 0.3) / (T["n"] - 1) + rng.uniform(-0.3, 0.3)
        tilt = rng.uniform(0.45, 0.8)
        d = (math.cos(a) * math.sin(tilt), math.sin(a) * math.sin(tilt) * 0.8, math.cos(tilt))
        rr = rng.uniform(0.16, 0.3)
        crystal((rr * math.cos(a), rr * math.sin(a) * 0.8, 0.02), d,
                0.12 * S * rng.uniform(0.8, 1.1), H * rng.uniform(0.45, 0.72), gem,
                twist=rng.uniform(0, 1))
    for k in range(T["shards"]):
        a = TAU * k / max(T["shards"], 1) + 0.4
        p = (0.78 * math.cos(a), 0.5 * math.sin(a), 0.55 + 0.25 * math.sin(2 * a + 1))
        s = lathe([(0.0, -0.09), (0.05, 0.0), (0.0, 0.13)], gem, seg=4, smooth=False,
                  loc=p, rot=(rng.uniform(-0.6, 0.6), rng.uniform(-0.6, 0.6), 0),
                  name="shard")
    if T.get("band"):
        g = M_gold()
        torus(0.47, 0.035, g, loc=(0, 0, -0.04), sx=1.02, sy=0.92, rz=1.6, seg=64)
        for k in range(8):
            a = TAU * k / 8
            sphere(0.045, M_gem("topaz", (1.0, 0.75, 0.2), glow=0.8),
                   loc=(0.51 * 1.02 * math.cos(a), 0.51 * 0.92 * math.sin(a), -0.04),
                   seg=10, rings=6)
    if tier >= 3:
        point_light((0, -0.6, 0.45), color=col, power=6 * tier, radius=0.3)
    view(pitch=16, yaw=15, fill=0.86, glow=0.25 + 0.12 * tier)


for _t in range(1, 7):
    item("stone_%d" % _t)(lambda _t=_t: _build_stone(_t))


def sparkle(loc, size, color=(1.0, 0.9, 0.6), strength=6.0, rot=(0, 0, 0), name="sparkle"):
    """Flat 4-point star glint (emissive), facing the camera."""
    m = M_glow("spark_%d_%d_%d" % tuple(int(c * 9) for c in color), color, strength,
               base=color)
    return inflate(shape_star(4, size, size * 0.18, rot=0.0), size * 0.08, m, rings=2,
                   loc=loc, rot=rot, name=name)


def rolled_sheet(length, r_in, turns, thick, mat, flap=0.0, droop=0.0, n=140,
                 start=0.0, rough_edge=0.0):
    """Parchment rolled around Z: an Archimedean spiral cross-section (XY)
    extruded along Z plus an optional loose flap, thickened with Solidify."""
    gap = thick * 1.7
    b = gap / TAU
    total = turns * TAU
    pts = []
    for i in range(n + 1):
        th = total * i / n
        r = r_in + b * th
        pts.append(Vector((r * math.cos(th + start), r * math.sin(th + start), 0)))
    if flap > 0:
        t = (pts[-1] - pts[-2]).normalized()
        nrm = Vector((-t.y, t.x, 0))
        m = 14
        for k in range(1, m + 1):
            u = k / m
            pts.append(pts[-1] + t * (flap / m) - nrm * (droop * u * u / m) * 4)
    zs = 20
    verts, faces = [], []
    for p in pts:
        for k in range(zs + 1):
            z = -length / 2 + length * k / zs
            verts.append((p.x, p.y, z))
    for i in range(len(pts) - 1):
        for k in range(zs):
            a = i * (zs + 1) + k
            faces.append((a, a + 1, a + zs + 2, a + zs + 1))
    ob = make_mesh("sheet", verts, faces, mat, fix_normals=False)
    solidify(ob, thick, offset=0.0)
    if rough_edge:
        displace(ob, rough_edge, 0.15)
    return ob, r_in + b * total


def wax_seal(loc, r, mat, emblem=None, emblem_mat=None, rot=(rad(90), 0, 0)):
    """Irregular wax disc facing -Y with an embossed emblem."""
    prof = [(0.0, 0.0), (r, 0.0), (r * 1.04, r * 0.18), (r * 0.9, r * 0.34),
            (r * 0.72, r * 0.36), (r * 0.62, r * 0.26), (0.0, r * 0.26)]
    with sub(loc=loc, rot=rot):
        lathe(prof, mat, seg=40, radial=lambda a, t: 1 + 0.07 * math.sin(5 * a + 1)
              + 0.04 * math.sin(11 * a), name="seal")
        torus(r * 0.62, r * 0.05, mat, loc=(0, 0, r * 0.3), rseg=8)
        if emblem is not None:
            inflate(emblem, r * 0.12, emblem_mat or mat, rings=3,
                    loc=(0, 0, r * 0.26), rot=(rad(-90), 0, 0), back=False)


def ribbon_band(R, height, mat, z=0.0):
    return torus(R, height / 2, mat, loc=(0, 0, z), rz=1.0, rr=0.22, seg=64, rseg=10,
                 name="band")


@item("scroll_protect")
def build_scroll_protect():
    parch = M_parchment("parch_p", (0.9, 0.8, 0.6))
    sheet, R = rolled_sheet(1.5, 0.05, 3.2, 0.012, parch, flap=0.12, droop=0.02)
    blue = M_cloth((0.05, 0.12, 0.45), "blueribbon")
    ribbon_band(R + 0.012, 0.12, blue, z=0.0)
    wax = M_sealwax("bluewax", (0.05, 0.14, 0.62))
    wax_seal((0, -(R + 0.03), 0.0), 0.13, wax,
             emblem=[(x * 0.9, z * 0.9 - 0.02) for (x, z) in
                     mirror_x([(0.0, -0.09), (0.07, -0.03), (0.075, 0.07), (0.0, 0.08)])],
             emblem_mat=M_silver())
    # two ribbon tails hanging from the seal
    for sx in (-1, 1):
        pts = [(sx * 0.03, -(R + 0.035), -0.05), (sx * 0.08, -(R + 0.05), -0.2),
               (sx * 0.1, -(R + 0.04), -0.38)]
        sweep(catmull(pts, 6), 0.035, blue, segs=10, ellipse=(1.0, 0.2), name="tail")
    view(diag=45, pitch=22, yaw=-10, fill=0.9, glow=0.3)


@item("scroll_bless")
def build_scroll_bless():
    parch = pbr("parch_b", (0.95, 0.74, 0.36), rough=0.6, sss=0.05, pattern="parchment",
                dark=(0.7, 0.42, 0.1), emit=(1.0, 0.7, 0.25), emit_str=0.05)
    sheet, R = rolled_sheet(1.4, 0.07, 2.8, 0.012, parch, flap=0.1)
    gold = M_gold()
    # wooden rod with golden finials through the core
    cyl(0.055, 1.62, M_darkwood(), seg=16)
    for sz in (-1, 1):
        with sub(loc=(0, 0, sz * 0.8), rot=(0 if sz > 0 else math.pi, 0, 0)):
            lathe([(0.0, 0.0), (0.09, 0.0), (0.12, 0.04), (0.09, 0.08), (0.07, 0.11),
                   (0.1, 0.16), (0.06, 0.22), (0.0, 0.26)], gold, seg=24, name="finial")
    ribbon_band(R + 0.012, 0.1, gold, z=0.25)
    ribbon_band(R + 0.012, 0.1, gold, z=-0.25)
    wax_seal((0, -(R + 0.03), 0.0), 0.12, M_sealwax("goldwax", (0.9, 0.55, 0.08)),
             emblem=shape_cross(0.12, 0.16, 0.04, 0.1, 0.01), emblem_mat=gold)
    # holy glints
    sparkle((0.32, -0.3, 0.55), 0.12, (1.0, 0.9, 0.55))
    sparkle((-0.3, -0.3, -0.35), 0.09, (1.0, 0.9, 0.55))
    sparkle((0.28, -0.3, -0.72), 0.07, (1.0, 0.9, 0.55))
    point_light((0, -0.6, 0), (1.0, 0.8, 0.4), 12, 0.3)
    view(diag=45, pitch=22, yaw=-10, fill=0.86, glow=0.7)


@item("doc")
def build_doc():
    parch = M_parchment("parch_old", (0.80, 0.66, 0.44), dark=(0.32, 0.2, 0.08), scale=4.0,
                        lines=True, line_freq=22.0, line_dir="Z")
    sheet, R = rolled_sheet(1.3, 0.05, 2.4, 0.014, parch, flap=0.3, droop=0.05,
                            rough_edge=0.012, start=rad(150))
    red = pbr("redribbon", (0.5, 0.02, 0.03), rough=0.45, sheen=0.8, coat=0.2)
    ribbon_band(R + 0.012, 0.09, red, z=0.05)
    wax = M_sealwax("redwax", (0.55, 0.02, 0.02))
    # bow: two loops + tails
    y0 = -(R + 0.03)
    for sx in (-1, 1):
        with sub(loc=(sx * 0.1, y0 - 0.01, 0.1), rot=(rad(90), rad(-25 * sx), 0)):
            torus(0.09, 0.018, red, rz=0.3, rr=1.0, sx=1.5, rseg=8)
        pts = [(sx * 0.02, y0, 0.0), (sx * 0.1, y0 - 0.03, -0.18), (sx * 0.16, y0 - 0.02, -0.36)]
        sweep(catmull(pts, 6), 0.03, red, segs=10, ellipse=(1.0, 0.25), name="tail")
    wax_seal((0, y0 - 0.01, 0.04), 0.11, wax,
             emblem=shape_star(6, 0.07, 0.03))
    view(diag=38, pitch=24, yaw=-25, fill=0.9, glow=0.2)


@item("key")
def build_key():
    iron = pbr("keyiron", (0.36, 0.34, 0.33), metal=1, rough=0.34, noise_rough=0.12,
               pattern="rust", rust=(0.3, 0.13, 0.05), scale=6.0)
    # shaft (z = 0 bit end ... 1.25 bow)
    lathe([(0.0, -0.02), (0.055, -0.02), (0.06, 0.0), (0.055, 0.34), (0.08, 0.36),
           (0.08, 0.40), (0.055, 0.42), (0.055, 0.86), (0.075, 0.88), (0.09, 0.92),
           (0.075, 0.96), (0.06, 0.98), (0.06, 1.08), (0.1, 1.11), (0.1, 1.15),
           (0.07, 1.18), (0.0, 1.2)], iron, seg=24, sharp=50)
    bit = [(0.04, 0.0), (0.36, 0.0), (0.36, 0.09), (0.27, 0.09), (0.27, 0.15),
           (0.36, 0.15), (0.36, 0.3), (0.22, 0.3), (0.22, 0.22), (0.14, 0.22),
           (0.14, 0.3), (0.04, 0.3)]
    extrude(bit, 0.08, iron, bev=0.012, loc=(0, 0, 0.02))
    # gothic quatrefoil bow
    bc = 1.46
    with sub(loc=(0, 0, bc), rot=(rad(90), 0, 0)):
        torus(0.31, 0.045, iron, seg=64)
        for k in range(4):
            a = TAU * k / 4 + TAU / 8
            torus(0.12, 0.03, iron, loc=(0.13 * math.cos(a), 0.13 * math.sin(a), 0), seg=40)
        for k in range(8):
            a = TAU * k / 8
            L = 0.12 if k % 2 == 0 else 0.07
            cone(0.035, L, iron, loc=(0.33 * math.cos(a), 0.33 * math.sin(a), 0),
                 rot=(0, rad(90), a), seg=8, name="spike")
        sphere(0.075, M_gem("keyruby", (0.9, 0.02, 0.05), glow=0.6), seg=20, rings=12)
    view(diag=-135, pitch=0, yaw=25, fill=0.9, glow=0.4)


@item("relic_1")
def build_relic_fang():
    enamel = pbr("enamel", (0.93, 0.89, 0.8), rough=0.22, sss=0.25,
                 sss_radius=(1.0, 0.8, 0.6), coat=0.6, coat_rough=0.1)
    path = bezier_pts((0.0, 0.0, 1.15), (0.02, 0.0, 0.7), (0.05, 0.0, 0.35), (0.32, 0.0, 0.0), 40)
    sweep(path, lambda s: 0.23 * (1 - s) ** 0.7 + 0.006, enamel, segs=20,
          ellipse=(1.0, 0.8), name="fang")
    gold = M_gold()
    lathe([(0.0, 1.03), (0.24, 1.03), (0.28, 1.1), (0.24, 1.18), (0.27, 1.26),
           (0.2, 1.35), (0.0, 1.37)], gold, seg=32, radial=lambda a, t: 1 + 0.04 *
          math.sin(8 * a), name="cap")
    torus(0.07, 0.022, gold, loc=(0, 0, 1.46), rot=(rad(90), 0, 0))
    sphere(0.07, M_gem("fangruby", (0.9, 0.0, 0.04), glow=0.8), loc=(0, -0.26, 1.19),
           seg=16, rings=10)
    blood = pbr("blood", (0.35, 0.0, 0.01), rough=0.08, coat=1.0, sss=0.3,
                sss_radius=(1.0, 0.1, 0.1))
    tip = path[-1]
    lathe([(0.0, 0.0), (0.045, 0.03), (0.05, 0.06), (0.03, 0.1), (0.0, 0.16)], blood,
          seg=20, loc=(tip.x + 0.02, tip.y, tip.z - 0.22), name="drop")
    sweep([(tip.x - 0.1, tip.y - 0.1, tip.z + 0.3), (tip.x - 0.02, tip.y - 0.12, tip.z + 0.1),
           (tip.x + 0.01, tip.y - 0.02, tip.z)], lambda s: 0.03 + 0.01 * s, blood,
          segs=10, name="streak")
    view(diag=-12, pitch=5, yaw=-20, fill=0.88, glow=0.4)


@item("relic_2")
def build_relic_ring():
    gold = M_gold()
    dark = pbr("gunmetal", (0.18, 0.16, 0.17), metal=1, rough=0.25)
    with sub(rot=(rad(90), 0, 0)):
        torus(0.42, 0.075, gold, rz=1.5, rr=0.7, seg=64, rseg=16, name="band")
        torus(0.42, 0.02, dark, loc=(0, 0, 0.075), rseg=8, seg=64)
        torus(0.42, 0.02, dark, loc=(0, 0, -0.075), rseg=8, seg=64)
    top = 0.47
    with sub(loc=(0, 0, top)):
        lathe([(0.0, 0.0), (0.14, 0.0), (0.2, 0.08), (0.2, 0.12), (0.17, 0.14),
               (0.0, 0.14)], gold, seg=32)
        for k in range(6):
            a = TAU * k / 6
            sweep([(0.19 * math.cos(a), 0.19 * math.sin(a), 0.1),
                   (0.21 * math.cos(a), 0.21 * math.sin(a), 0.22),
                   (0.15 * math.cos(a), 0.15 * math.sin(a), 0.3)],
                  lambda s: 0.03 * (1 - 0.5 * s), gold, segs=8, name="prong")
        ruby = M_gem("bloodruby", (0.9, 0.0, 0.03), glow=0.9, trans=0.45)
        lathe([(0.0, 0.02), (0.2, 0.18), (0.2, 0.2), (0.13, 0.3), (0.0, 0.31)], ruby,
              seg=10, smooth=False, name="gem")
        for sx in (-1, 1):
            sphere(0.055, ruby, loc=(sx * 0.25, 0, 0.02), seg=12, rings=8)
    point_light((0, -0.5, 0.75), (1.0, 0.05, 0.05), 12, 0.2)
    view(yaw=32, pitch=14, diag=-8, fill=0.86, glow=0.6)


@item("relic_3")
def build_relic_eye():
    gold = M_gold()
    eye = pbr("eyeball", (0.9, 0.85, 0.8), rough=0.3, coat=1.0, coat_rough=0.02,
              sss=0.2, pattern="eye", iris=0.56, pupil=0.44, slit=3.4, glow=1.2)
    sphere(1.0, eye, scale=0.34, seg=48, rings=24, name="eye")
    with sub(rot=(rad(90), 0, 0)):
        torus(0.36, 0.055, gold, seg=64)
        torus(0.44, 0.03, gold, seg=64)
        cyl(0.46, 0.06, pbr("darkgold", (0.3, 0.2, 0.08), metal=1, rough=0.4),
            loc=(0, 0, -0.08), seg=48)
        for k in range(16):
            a = TAU * k / 16
            L = 0.28 if k % 2 == 0 else 0.15
            cone(0.05 if k % 2 == 0 else 0.035, L, gold,
                 loc=(0.45 * math.cos(a), 0.45 * math.sin(a), -0.04),
                 rot=(0, rad(90), a), seg=6, name="ray", smooth=False)
    torus(0.09, 0.025, gold, loc=(0, 0, 0.82), rot=(rad(90), 0, 0))
    sphere(0.07, M_gem("eyegem", (0.9, 0.0, 0.04), glow=0.8), loc=(0, -0.05, -0.8), seg=16,
           rings=10)
    view(pitch=6, yaw=-14, fill=0.9, glow=0.6)


@item("relic_4")
def build_relic_heart():
    crys = pbr("darkcrystal", (0.10, 0.0, 0.09), rough=0.03, trans=0.5, ior=1.8,
               spec=1.0, emit=(0.3, 0.0, 0.2), emit_str=0.12)
    S, D = 0.62, 0.3
    inflate(shape_heart(S, n=22), D, crys, rings=3, flat=True, center=(0.0, 0.0),
            name="heart")
    core = M_glow("heartcore", (1.0, 0.02, 0.2), 1.1)
    inflate(shape_heart(0.3, n=32), 0.12, core, rings=5, center=(0.0, 0.0), name="core")
    thorn = pbr("thornmetal", (0.07, 0.06, 0.07), metal=1, rough=0.3)

    def surf_y(x, z):
        r = math.hypot(x / 0.66, z / 0.62)
        if r >= 1.0:
            return 0.06
        return -D * math.sqrt(1 - r * r) - 0.035

    rng = random.Random(4)
    for (x0, z0, x1, z1, ph) in ((-0.8, 0.45, 0.55, -0.62, 0.0), (0.8, 0.3, -0.5, -0.5, 1.7)):
        pts = []
        for i in range(41):
            t = i / 40
            x = x0 + (x1 - x0) * t
            z = z0 + (z1 - z0) * t + 0.07 * math.sin(t * 9 + ph)
            pts.append((x, surf_y(x, z), z))
        sweep(pts, 0.032, thorn, segs=8, name="vine")
        for i in range(4, 38, 4):
            p = Vector(pts[i])
            cone(0.03, 0.11, thorn, loc=p, rot=(rad(90), rng.choice((-1, 1)) * rad(50), 0),
                 seg=6, name="thorn")
    point_light((0, -0.6, 0.0), (1.0, 0.1, 0.4), 10, 0.2)
    view(pitch=8, yaw=18, fill=0.88, glow=0.7)


@item("relic_5")
def build_relic_ribs():
    bone = M_bone("oldbone", (0.84, 0.76, 0.58))
    gold = M_gold()
    lathe([(0.0, -0.1), (0.5, -0.1), (0.54, -0.06), (0.48, 0.0), (0.36, 0.04),
           (0.34, 0.12), (0.26, 0.16), (0.0, 0.16)], gold, seg=48, sharp=45)
    lathe([(0.0, -0.16), (0.56, -0.16), (0.56, -0.1), (0.0, -0.1)],
          M_stone("darkstone", (0.08, 0.07, 0.08)), seg=48)
    for k in range(6):
        a = TAU * k / 6
        sphere(0.04, M_gem("relicruby", (0.9, 0.02, 0.04), glow=0.6),
               loc=(0.5 * math.cos(a), 0.5 * math.sin(a), -0.04), seg=10, rings=6)
    zs = [0.25 + 0.2 * i for i in range(7)]
    for i, z in enumerate(zs):
        with sub(loc=(0, 0.1, z)):
            lathe([(0.0, -0.07), (0.1, -0.07), (0.115, 0.0), (0.1, 0.07), (0.0, 0.07)],
                  bone, seg=20)
            cone(0.05, 0.16, bone, rot=(rad(-100), 0, 0), loc=(0, 0.05, 0), seg=8)
            for sx in (-1, 1):
                cone(0.04, 0.14, bone, rot=(0, rad(90 * sx), 0), seg=8)
    for i, z in enumerate(zs[1:6]):
        w = 0.62 - 0.05 * abs(i - 1.5)
        for sx in (-1, 1):
            pts = [(sx * 0.1, 0.1, z), (sx * w * 0.85, 0.05, z + 0.02),
                   (sx * w, -0.2, z - 0.08), (sx * w * 0.75, -0.45, z - 0.2),
                   (sx * 0.18, -0.55, z - 0.3)]
            sweep(catmull(pts, 8), lambda s: 0.038 * (1 - 0.3 * s), bone, segs=10,
                  ellipse=(1.0, 0.6), name="rib")
    # sternum + gold bindings
    sweep([(0, -0.56, zs[1] - 0.2), (0, -0.58, zs[5] - 0.25)], 0.045, bone, segs=10,
          ellipse=(1.4, 0.6))
    for z in (zs[2], zs[4]):
        torus(0.13, 0.025, gold, loc=(0, 0.1, z), seg=32)
    sphere(0.1, M_gem("relicheart", (0.9, 0.0, 0.05), glow=1.2), loc=(0, -0.22, zs[3] - 0.1),
           seg=20, rings=12)
    point_light((0, -0.3, zs[3]), (1.0, 0.1, 0.1), 8, 0.1)
    view(yaw=-28, pitch=10, fill=0.9, glow=0.5)


def wrapped_grip(z0, z1, r, mat, wraps=8, depth=0.12, seg=24, name="grip"):
    """Leather-wrapped grip: lathe with a helical bump (radial modulation)."""
    n = 40
    prof = [(r, z0 + (z1 - z0) * i / n) for i in range(n + 1)]
    return lathe(prof, mat, seg=seg, name=name, cap=True,
                 radial=lambda a, t: 1 + depth * max(0.0, math.sin(a + t * wraps * TAU)) ** 2)


@item("sub_dagger")
def build_sub_dagger():
    steel = M_steel()
    blade = mirror_x([(0.0, 0.0), (0.075, 0.0), (0.11, 0.28), (0.085, 0.62), (0.03, 0.95),
                      (0.0, 1.08)])
    inflate(blade, 0.045, steel, rings=2, flat=True, profile=lambda t: t,
            center=(0.0, 0.4), name="blade")
    # fuller groove glint
    silver = M_silver()
    extrude(mirror_x([(0.0, -0.05), (0.14, -0.04), (0.2, 0.0), (0.14, 0.04), (0.0, 0.05)]),
            0.09, silver, bev=0.015, loc=(0, 0, -0.02), name="guard")
    wrapped_grip(-0.36, -0.06, 0.042, M_leather((0.22, 0.08, 0.05), "grip_red"), wraps=6)
    torus(0.075, 0.02, silver, loc=(0, 0, -0.45), rot=(rad(90), 0, 0))
    lathe([(0.0, -0.4), (0.05, -0.4), (0.052, -0.36), (0.045, -0.35), (0.0, -0.35)], silver,
          seg=16)
    view(diag=45, yaw=28, pitch=6, fill=0.9, glow=0.2)


@item("sub_axe")
def build_sub_axe():
    steel = M_steel()
    iron = M_darkiron()
    wood = M_wood((0.42, 0.24, 0.1), "axewood")
    cyl(0.055, 1.35, wood, loc=(0, 0, -0.2), seg=20)
    lathe([(0.0, -0.93), (0.07, -0.93), (0.08, -0.88), (0.065, -0.82), (0.0, -0.82)], iron,
          seg=20)
    for z in (-0.6, -0.45, -0.3):
        torus(0.058, 0.012, pbr("wrap", (0.3, 0.15, 0.07), rough=0.8), loc=(0, 0, z), rseg=6)
    head = [(0.05, -0.12), (0.2, -0.16), (0.36, -0.3), (0.48, -0.36), (0.52, -0.2),
            (0.55, 0.05), (0.53, 0.28), (0.48, 0.44), (0.36, 0.38), (0.2, 0.22), (0.05, 0.16)]
    for sx in (1, -1):
        pts = [(sx * x, z) for (x, z) in catmull2d(head, 3, closed=True)]
        extrude(pts, 0.07, steel, bev=0.03, bev_seg=1, loc=(0, 0, 0.55), name="bit",
                sharp=25)
    box((0.16, 0.16, 0.36), iron, loc=(0, 0, 0.56), bev=0.02)
    cone(0.06, 0.3, steel, loc=(0, 0, 0.74), seg=4, smooth=False, name="spike")
    view(diag=32, yaw=22, pitch=8, fill=0.9, glow=0.2)


@item("sub_holywater")
def build_sub_holywater():
    glass = M_glass()
    liq = M_liquid("holy_liq", (0.1, 0.45, 1.0), emit_str=1.0)
    prof = _round_flask_profile(R=0.5, zc=0.5, neck_r=0.12, neck_top=1.25, a_top=62)
    flask(prof, glass, liq, fill_z=0.82)
    silver = M_silver()
    lathe([(0.0, 1.16), (0.15, 1.16), (0.16, 1.3), (0.12, 1.34), (0.14, 1.4),
           (0.08, 1.44), (0.0, 1.45)], silver, seg=32, name="cap")
    torus(0.06, 0.018, silver, loc=(0, 0, 1.5), rot=(rad(90), 0, 0))
    extrude(shape_cross(0.3, 0.44, 0.1, 0.29, 0.03), 0.05, silver, bev=0.018, bev_seg=1,
            loc=(0, -0.55, 0.25), rot=(rad(-8), 0, 0), name="cross", sharp=25)
    sphere(0.035, M_gem("holygem", (0.2, 0.6, 1.0), glow=1.2), loc=(0, -0.59, 0.54),
           seg=12, rings=8)
    bubbles(8, 0.3, 0.2, 0.7, seed=11)
    # rosary beads hanging from the neck
    beads = M_gem("bead", (0.1, 0.2, 0.6), glow=0.3)
    for i in range(9):
        t = i / 8
        x = 0.14 + 0.28 * math.sin(t * math.pi * 0.9)
        z = 1.1 - 0.7 * t
        sphere(0.03, beads, loc=(x, -0.45 * math.sin(t * math.pi) - 0.12, z), seg=10, rings=6)
    view(pitch=12, diag=-10, fill=0.88, glow=0.8, glow_beauty=0.5)


@item("sub_cross")
def build_sub_cross():
    gold = M_gold()
    pal = M_palegold()
    extrude(shape_cross(1.1, 1.3, 0.3, 0.82, 0.1), 0.16, gold, bev=0.05, bev_seg=1,
            name="cross", sharp=25)
    extrude(shape_cross(0.7, 0.88, 0.1, 0.56, 0.035), 0.06, pal, bev=0.02, bev_seg=1,
            loc=(0, -0.09, 0.21), name="inlay", sharp=25)
    with sub(loc=(0, -0.12, 0.82), rot=(rad(90), 0, 0)):
        torus(0.15, 0.03, pal, seg=40)
        lathe([(0.0, -0.02), (0.12, 0.02), (0.08, 0.08), (0.0, 0.09)],
              M_gem("crossgem", (0.1, 0.35, 1.0), glow=0.9), seg=8, smooth=False)
    point_light((0, -0.6, 0.8), (1.0, 0.8, 0.4), 10, 0.3)
    view(diag=-22, yaw=24, pitch=10, fill=0.88, glow=0.5)


@item("sub_stopwatch")
def build_sub_stopwatch():
    gold = M_gold()
    with sub(rot=(rad(90), 0, 0)):
        lathe([(0.0, -0.1), (0.42, -0.1), (0.5, -0.07), (0.54, 0.0), (0.52, 0.06),
               (0.48, 0.09), (0.46, 0.11), (0.44, 0.1), (0.44, 0.04), (0.0, 0.04)], gold,
              seg=64, name="case")
        cyl(0.44, 0.01, pbr("dial", (0.92, 0.88, 0.78), rough=0.35, coat=0.6),
            loc=(0, 0, 0.042), seg=64)
        ink = pbr("dialink", (0.03, 0.03, 0.05), rough=0.4)
        for k in range(12):
            a = TAU * k / 12
            L = 0.07 if k % 3 == 0 else 0.04
            box((0.022 if k % 3 == 0 else 0.014, L, 0.01), ink,
                loc=(0.36 * math.cos(a), 0.36 * math.sin(a), 0.05), rot=(0, 0, a + math.pi / 2))
        blue = pbr("bluesteel", (0.05, 0.1, 0.35), metal=1, rough=0.2)
        extrude(mirror_x([(0.0, -0.05), (0.025, 0.0), (0.012, 0.28), (0.0, 0.31)]), 0.01,
                blue, loc=(0, 0.0, 0.056), rot=(rad(-90), 0, rad(30)), name="hand_m")
        extrude(mirror_x([(0.0, -0.04), (0.03, 0.0), (0.016, 0.18), (0.0, 0.21)]), 0.01,
                blue, loc=(0, 0.0, 0.062), rot=(rad(-90), 0, rad(-60)), name="hand_h")
        cyl(0.03, 0.03, gold, loc=(0, 0, 0.07), seg=16)
        dome = lathe([(0.44, 0.075), (0.36, 0.1), (0.2, 0.118), (0.0, 0.122)][::-1],
                     pbr("watchglass", (1, 1, 1), rough=0.02, trans=1.0, ior=1.2, spec=0.3),
                     seg=64, name="crystal", cap=False)
        solidify(dome, 0.006)
    # stem, crown and bow
    cyl(0.05, 0.12, gold, loc=(0, 0, 0.6), seg=16)
    lathe([(0.0, 0.64), (0.08, 0.64), (0.08, 0.74), (0.0, 0.74)], gold, seg=24,
          radial=lambda a, t: 1 + 0.08 * (math.sin(16 * a) > 0))
    torus(0.14, 0.03, gold, loc=(0, 0, 0.88), rot=(rad(90), 0, 0), seg=40)
    chain([(0.1, 0.0, 0.98), (0.35, 0.02, 1.0), (0.6, 0.0, 0.88), (0.75, 0.0, 0.7)], gold,
          link_len=0.11, wire=0.016)
    view(yaw=22, pitch=6, diag=-10, fill=0.88, glow=0.2)


@item("sub_pistol")
def build_sub_pistol():
    wood = M_wood((0.36, 0.17, 0.07), "gunwood", axis="X", grain=1.2)
    iron = pbr("gunmetal2", (0.2, 0.2, 0.22), metal=1, rough=0.28, noise_rough=0.1)
    brass = M_brass()
    stock = [(0.75, 0.33), (0.75, 0.21), (0.12, 0.19), (-0.02, 0.13), (-0.1, 0.02),
             (-0.26, -0.22), (-0.4, -0.44), (-0.56, -0.54), (-0.72, -0.48), (-0.74, -0.36),
             (-0.6, -0.16), (-0.46, 0.08), (-0.34, 0.27), (-0.22, 0.34)]
    extrude(stock, 0.19, wood, bev=0.045, bev_seg=3, name="stock")
    with sub(loc=(0.4, 0, 0.35), rot=(0, rad(90), 0)):
        lathe([(0.0, -0.62), (0.07, -0.62), (0.065, -0.5), (0.055, 0.3), (0.06, 0.62),
               (0.075, 0.64), (0.075, 0.7), (0.035, 0.7), (0.035, 0.6), (0.0, 0.6)], iron,
              seg=24, name="barrel")
        for z in (-0.1, 0.35):
            torus(0.062, 0.014, brass, loc=(0, 0, z), rseg=8)
    extrude([(-0.24, 0.2), (0.12, 0.2), (0.14, 0.3), (-0.2, 0.33)], 0.02, brass,
            loc=(0, -0.105, 0), bev=0.005, name="lockplate")
    cock = [(-0.2, 0.28), (-0.12, 0.3), (-0.14, 0.36), (-0.2, 0.44), (-0.18, 0.5),
            (-0.26, 0.52), (-0.28, 0.46), (-0.24, 0.4), (-0.26, 0.32)]
    extrude(cock, 0.05, iron, loc=(0, -0.11, 0.0), bev=0.01, name="cock")
    extrude([(0.02, 0.34), (0.07, 0.34), (0.07, 0.5), (0.02, 0.47)], 0.05, iron,
            loc=(0, -0.11, 0), bev=0.008, name="frizzen")
    with sub(loc=(-0.08, 0, 0.08), rot=(rad(90), 0, 0)):
        torus(0.13, 0.018, brass, a0=rad(180), a1=rad(360), sx=1.2, seg=24, rseg=8)
    extrude([(-0.07, 0.12), (-0.03, 0.12), (-0.06, 0.0), (-0.1, -0.02)], 0.03, brass,
            bev=0.006, name="trigger")
    sphere(0.13, brass, loc=(-0.66, 0, -0.48), scale=(1.0, 0.7, 0.8), seg=20, rings=10)
    cyl(0.018, 0.9, pbr("ramrod", (0.2, 0.12, 0.06), rough=0.5), loc=(0.35, -0.02, 0.24),
        rot=(0, rad(90), 0), seg=8)
    view(diag=18, yaw=-18, pitch=4, fill=0.92, glow=0.2)


@item("sub_bible")
def build_sub_bible():
    leather = M_leather((0.30, 0.04, 0.05), "bibleleather", scale=3.0)
    gold = M_gold()
    pages = pbr("pages", (0.93, 0.86, 0.68), rough=0.8, pattern="parchment",
                dark=(0.7, 0.58, 0.38), scale=12.0)
    W, H, T = 0.9, 1.2, 0.34
    box((W - 0.04, T - 0.06, H - 0.06), pages, loc=(0.02, 0, 0), name="pageblock")
    for sy in (-1, 1):
        box((W, 0.05, H), leather, loc=(0, sy * (T / 2 - 0.02), 0), bev=0.02, name="cover")
    cyl(T / 2, H, leather, loc=(-W / 2, 0, 0), seg=24, scale=(0.35, 1, 1), name="spine")
    for z in (-0.4, -0.15, 0.15, 0.4):
        torus(T / 2 + 0.005, 0.015, gold, loc=(-W / 2, 0, z), sx=0.37, rseg=6)
    y = -(T / 2 + 0.01)
    inflate(shape_cross(0.42, 0.62, 0.11, 0.42, 0.03), 0.04, gold, rings=3, flat=True,
            loc=(0.02, y, -0.28), name="crossplate")
    sphere(0.05, M_gem("biblegem", (0.9, 0.05, 0.1), glow=1.0), loc=(0.02, y - 0.03, 0.14),
           seg=14, rings=8)
    for sx in (-1, 1):
        for sz in (-1, 1):
            tri = [(0, 0), (0.2, 0), (0, 0.2)]
            extrude([(sx * x, sz * z) for (x, z) in tri], 0.02, gold, bev=0.006,
                    loc=(sx * (W / 2 - 0.005), y, sz * (H / 2 - 0.005)), name="corner")
    # clasp
    box((0.14, T + 0.08, 0.12), gold, loc=(W / 2 + 0.02, 0, 0.0), bev=0.02, name="clasp")
    # floating aura below + glints
    disc = lathe([(0.0, 0.0), (0.7, 0.0)], M_glowshell("aura", (1.0, 0.75, 0.3), 1.5, 0.8),
                 seg=48, loc=(0, 0, -0.75), cap=False)
    sparkle((0.55, -0.4, 0.6), 0.1)
    sparkle((-0.6, -0.4, -0.35), 0.08)
    point_light((0, -0.5, -0.6), (1.0, 0.8, 0.4), 12, 0.3)
    view(yaw=-30, pitch=14, diag=8, fill=0.86, glow=0.6)


@item("sub_bomb")
def build_sub_bomb():
    body = pbr("bombbody", (0.045, 0.045, 0.055), metal=0.6, rough=0.22, coat=0.4,
               noise_rough=0.1, bump=0.08, bump_scale=15)
    sphere(0.5, body, seg=48, rings=24, name="bomb")
    iron = M_iron()
    torus(0.5, 0.025, iron, rot=(rad(90), 0, rad(30)), seg=64)
    lathe([(0.0, 0.38), (0.15, 0.38), (0.16, 0.5), (0.19, 0.53), (0.19, 0.58),
           (0.14, 0.6), (0.0, 0.6)], iron, seg=32)
    rope = pbr("fuse", (0.62, 0.48, 0.3), rough=0.9, bump=0.6, bump_scale=120)
    pts = [(0.0, 0.0, 0.55), (0.0, 0.0, 0.72), (0.08, -0.02, 0.84), (0.2, -0.02, 0.88),
           (0.28, 0.0, 0.84)]
    curve_tube(pts, 0.028, rope, name="fuse")
    tip = pts[-1]
    flame((tip[0] + 0.02, tip[1], tip[2] + 0.0), 0.2, power=20)
    for k in range(6):
        a = TAU * k / 6 + 0.3
        sparkle((tip[0] + 0.14 * math.cos(a), tip[1] - 0.1, tip[2] + 0.12 + 0.14 * math.sin(a)),
                0.05 + 0.03 * (k % 2), (1.0, 0.7, 0.2), strength=8.0)
    view(pitch=12, diag=-8, fill=0.86, glow=1.0)


@item("heart_s")
def build_heart_s():
    ruby = M_gem("heartruby", (0.85, 0.0, 0.04), glow=0.55, trans=0.45)
    inflate(shape_heart(0.5, n=18), 0.24, ruby, rings=3, flat=True, center=(0.0, 0.0),
            name="heart")
    sparkle((0.3, -0.3, 0.3), 0.08, (1.0, 0.85, 0.85))
    view(pitch=6, yaw=18, fill=0.6, glow=0.5)


@item("heart_l")
def build_heart_l():
    ruby = M_gem("heartruby", (0.85, 0.0, 0.04), glow=0.6, trans=0.45)
    S = 0.62
    inflate(shape_heart(S, n=22), 0.3, ruby, rings=3, flat=True, center=(0.0, 0.0),
            name="heart")
    gold = M_gold()
    rim = [(x * 1.05, 0.02, z * 1.05 - 0.004) for (x, z) in shape_heart(S, n=90)]
    sweep(rim + rim[:3], 0.035, gold, segs=10, caps=False, name="rim")
    # little golden wings
    wing = [(0.0, -0.05), (0.12, -0.07), (0.18, -0.01), (0.27, -0.04), (0.33, 0.05),
            (0.41, 0.04), (0.46, 0.15), (0.48, 0.28), (0.38, 0.26), (0.24, 0.2),
            (0.1, 0.14), (0.0, 0.1)]
    for sx in (1, -1):
        inflate([(sx * x, z) for (x, z) in wing], 0.03, M_palegold(), rings=3,
                loc=(sx * 0.6, 0.05, 0.2), rot=(0, 0, rad(-25 * sx)), name="wing")
    sparkle((0.34, -0.36, 0.34), 0.1, (1.0, 0.85, 0.85))
    sparkle((-0.4, -0.36, -0.2), 0.07, (1.0, 0.85, 0.85))
    point_light((0, -0.6, 0.1), (1.0, 0.1, 0.1), 10, 0.3)
    view(pitch=6, yaw=14, fill=0.92, glow=0.6)


@item("coin")
def build_coin():
    gold = pbr("coingold", (1.0, 0.7, 0.26), metal=1, rough=0.22, noise_rough=0.08,
               bump=0.05, bump_scale=30)
    with sub(rot=(rad(90), 0, 0)):
        lathe([(0.0, -0.06), (0.44, -0.06), (0.47, -0.075), (0.52, -0.06), (0.53, 0.0),
               (0.52, 0.06), (0.47, 0.075), (0.44, 0.06), (0.42, 0.045), (0.0, 0.045)],
              gold, seg=64, name="coin")
        for k in range(20):
            a = TAU * k / 20
            sphere(0.018, gold, loc=(0.4 * math.cos(a), 0.4 * math.sin(a), 0.045), seg=8, rings=4)
    extrude(shape_cross(0.44, 0.56, 0.12, 0.36, 0.035), 0.04, gold, bev=0.015, bev_seg=1,
            loc=(0, -0.065, -0.3), name="emboss", sharp=25)
    sparkle((0.34, -0.2, 0.36), 0.1, (1.0, 0.95, 0.7))
    view(yaw=28, pitch=8, diag=-12, fill=0.86, glow=0.4)


@item("moneybag")
def build_moneybag():
    sack = M_leather((0.45, 0.28, 0.13), "sack", scale=3.0)
    prof = [(0.0, 0.0), (0.3, 0.0), (0.5, 0.1), (0.6, 0.32), (0.58, 0.58), (0.44, 0.8),
            (0.22, 0.95), (0.13, 1.02), (0.14, 1.07), (0.24, 1.14), (0.32, 1.24), (0.3, 1.28)]
    bag = lathe(catmull2d(prof, 4, closed=False), sack, seg=64, cap=False, name="bag",
                radial=lambda a, t: 1 + 0.16 * math.sin(9 * a) * max(0, t - 0.8) * 5
                + 0.03 * math.sin(5 * a + 1) * (1 - t))
    solidify(bag, 0.025)
    rope = pbr("rope", (0.62, 0.48, 0.28), rough=0.9, bump=0.6, bump_scale=150)
    torus(0.15, 0.035, rope, loc=(0, 0, 1.04), seg=32, rseg=10)
    for sx, d in ((1, 0.2), (-1, 0.3)):
        pts = [(sx * 0.12, -0.08, 1.02), (sx * 0.2, -0.15, 0.9), (sx * 0.24, -0.18, 1.02 - d - 0.4)]
        sweep(catmull(pts, 6), 0.03, rope, segs=8, name="ropeend")
    gold = M_gold()
    # coins peeking out of the top and spilled in front
    for (x, y, z, rx, ry) in ((0.05, 0.02, 1.2, 70, 20), (-0.1, 0.05, 1.18, 60, -30),
                              (0.4, -0.5, 0.06, 0, 0), (0.62, -0.3, 0.14, 25, 10),
                              (0.2, -0.6, 0.03, 0, 0)):
        with sub(loc=(x, y, z), rot=(rad(rx), rad(ry), 0)):
            lathe([(0.0, -0.03), (0.16, -0.03), (0.17, 0.0), (0.16, 0.03), (0.0, 0.03)], gold,
                  seg=32, name="coin")
    # gold emblem sewn on the bag
    extrude(shape_cross(0.18, 0.24, 0.06, 0.15, 0.015), 0.02, gold, bev=0.006,
            loc=(0, -0.6, 0.34), rot=(rad(-4), 0, 0), name="emblem")
    view(pitch=12, yaw=8, fill=0.86, glow=0.2)


def brilliant(r, mat, table=0.56, crown=0.2, pav=0.45, seg=16, **tf):
    """Round brilliant cut: table, star ring, girdle, pavilion ring, culet."""
    rings = [(r * table, crown, 0.0), (r * 0.82, crown * 0.55, 0.5), (r, 0.0, 0.0),
             (r, -0.03 * r, 0.0), (r * 0.52, -pav * 0.55, 0.5)]
    verts, faces = [], []
    idx = []
    for (rr, z, off) in rings:
        ring = []
        for i in range(seg):
            a = TAU * (i + off) / seg
            ring.append(len(verts))
            verts.append((rr * math.cos(a), rr * math.sin(a), z))
        idx.append(ring)
    top = len(verts)
    verts.append((0, 0, crown))
    bot = len(verts)
    verts.append((0, 0, -pav))
    for i in range(seg):
        faces.append((top, idx[0][i], idx[0][(i + 1) % seg]))
    for k in range(len(idx) - 1):
        A, B = idx[k], idx[k + 1]
        for i in range(seg):
            j = (i + 1) % seg
            faces.append((A[i], B[i], A[j]) if rings[k + 1][2] == 0.5 else (A[i], B[i], B[j]))
            faces.append((A[j], B[i], B[j]) if rings[k + 1][2] == 0.5 else (A[i], B[j], A[j]))
    L = idx[-1]
    for i in range(seg):
        faces.append((L[i], bot, L[(i + 1) % seg]))
    return make_mesh("brilliant", verts, faces, mat, smooth=False, fix_normals=True, **tf)


@item("gem_crystal")
def build_gem_crystal():
    dia = pbr("diamond", (0.55, 0.88, 1.0), rough=0.0, trans=1.0, ior=2.42, spec=1.0,
              emit=(0.3, 0.7, 1.0), emit_str=0.06)
    brilliant(0.62, dia)
    sparkle((0.42, -0.5, 0.3), 0.14, (0.8, 0.95, 1.0), strength=8.0)
    sparkle((-0.5, -0.5, 0.05), 0.09, (0.8, 0.95, 1.0), strength=8.0)
    sparkle((0.2, -0.5, -0.3), 0.07, (0.8, 0.95, 1.0), strength=8.0)
    point_light((0, -0.4, 0.8), (0.7, 0.9, 1.0), 10, 0.2)
    view(pitch=24, yaw=8, fill=0.84, glow=0.5, world=1.4, front=0.5)


@item("oneup")
def build_oneup():
    gold = M_gold()
    pal = pbr("statuegold", (1.0, 0.78, 0.4), metal=1, rough=0.2, noise_rough=0.06)
    lathe([(0.0, 0.0), (0.5, 0.0), (0.52, 0.05), (0.46, 0.09), (0.44, 0.24), (0.5, 0.28),
           (0.5, 0.33), (0.0, 0.33)], M_marble("blackmarble", (0.08, 0.06, 0.08),
                                             vein=(0.35, 0.3, 0.3)), seg=48, sharp=40)
    torus(0.5, 0.025, gold, loc=(0, 0, 0.31), seg=48)
    torus(0.47, 0.025, gold, loc=(0, 0, 0.07), seg=48)
    with sub(loc=(0, 0, 0.33)):
        # legs + boots
        for sx in (-1, 1):
            sweep([(sx * 0.15, 0.0, 0.05), (sx * 0.12, 0.0, 0.35), (sx * 0.08, 0.0, 0.65)],
                  lambda s: 0.06 + 0.02 * s, pal, segs=12, name="leg")
            sphere(0.08, pal, loc=(sx * 0.16, -0.04, 0.05), scale=(1.0, 1.6, 0.8), seg=16,
                   rings=8)
        # long coat
        lathe([(0.0, 0.35), (0.3, 0.3), (0.26, 0.55), (0.18, 0.75), (0.16, 0.8), (0.0, 0.8)],
              pal, seg=32, radial=lambda a, t: 1 + 0.06 * math.sin(7 * a), name="coat")
        sphere(0.2, pal, loc=(0, 0, 0.95), scale=(1.0, 0.72, 1.35), seg=24, rings=12)
        # cape
        cape = lathe([(0.42, 0.25), (0.34, 0.6), (0.24, 1.0), (0.17, 1.2)], pal, seg=24,
                     a0=rad(10), a1=rad(170), cap=False, name="cape",
                     radial=lambda a, t: 1 + 0.08 * math.sin(6 * a))
        solidify(cape, 0.03)
        sphere(0.11, pal, loc=(0, 0, 1.32), scale=(1.0, 1.0, 1.1), seg=24, rings=12,
               name="head")
        hair = ico(0.125, pal, loc=(0.0, 0.03, 1.36), subdiv=2, name="hair")
        displace(hair, 0.05, 0.08, kind="VORONOI")
        # arm raised with the whip, other arm on the hip
        sweep([(0.18, 0.0, 1.12), (0.3, -0.02, 1.25), (0.3, -0.04, 1.48)],
              lambda s: 0.055 - 0.015 * s, pal, segs=10, name="arm")
        sphere(0.055, pal, loc=(0.3, -0.04, 1.52), seg=12, rings=8)
        sweep([(-0.18, 0.0, 1.12), (-0.3, -0.02, 0.95), (-0.18, -0.06, 0.82)],
              lambda s: 0.055 - 0.01 * s, pal, segs=10, name="arm")
        whip = catmull([(0.3, -0.04, 1.52), (0.25, -0.06, 1.8), (-0.1, -0.05, 1.95),
                        (-0.45, -0.02, 1.75), (-0.55, 0.0, 1.4), (-0.42, 0.02, 1.15)], 8)
        sweep(whip, lambda s: 0.03 * (1 - s) + 0.008, gold, segs=8, name="whip")
    sparkle((0.52, -0.4, 1.9), 0.12, (1.0, 0.9, 0.6))
    sparkle((-0.6, -0.4, 0.9), 0.08, (1.0, 0.9, 0.6))
    view(yaw=-18, pitch=6, fill=0.9, glow=0.5)


@item("powerup")
def build_powerup():
    orb_glass = pbr("orbglass", (1.0, 0.92, 0.8), rough=0.02, trans=1.0, ior=1.3, spec=0.6)
    sphere(0.55, orb_glass, seg=48, rings=24, name="orb")
    sphere(0.3, M_glowshell("orbcore", (1.0, 0.22, 0.02), 1.2, 1.4), loc=(0, 0.15, 0), seg=32,
           rings=16)
    whipm = M_glow("whipglow", (1.0, 0.5, 0.05), 1.2, base=(0.9, 0.45, 0.04))
    lash = catmull([(-0.1, -0.3, -0.08), (0.02, -0.32, 0.14), (0.2, -0.3, 0.26),
                    (0.33, -0.28, 0.08), (0.22, -0.27, -0.1), (0.08, -0.28, -0.02),
                    (0.12, -0.3, 0.1)], 8)
    sweep(lash, lambda s: 0.05 * (1 - 0.75 * s), whipm, segs=10, name="whip")
    handle = M_glow("whiphandle", (1.0, 0.08, 0.03), 1.0, base=(0.45, 0.03, 0.02))
    sweep([(-0.32, -0.3, -0.36), (-0.1, -0.3, -0.08)], 0.06, handle, segs=12, name="handle")
    sphere(0.07, whipm, loc=(-0.33, -0.3, -0.37), seg=12, rings=8)
    gold = M_gold()
    torus(0.64, 0.025, gold, rot=(rad(72), rad(20), 0), seg=64)
    torus(0.64, 0.025, gold, rot=(rad(72), rad(-40), rad(60)), seg=64)
    lathe([(0.0, -0.72), (0.2, -0.72), (0.24, -0.66), (0.18, -0.58), (0.1, -0.52), (0.0, -0.5)],
          gold, seg=32, name="base")
    point_light((0, -0.2, 0), (1.0, 0.5, 0.15), 30, 0.2)
    sparkle((0.5, -0.6, 0.5), 0.1, (1.0, 0.85, 0.5))
    sparkle((-0.55, -0.6, -0.3), 0.07, (1.0, 0.85, 0.5))
    view(pitch=8, fill=0.86, glow=1.0, glow_beauty=0.4)


# =============================================================================
#  PROP BUILDERS (front view, slight top angle, anchored to the frame edge)
# =============================================================================
def bake(ob, M):
    """Bake a matrix into the mesh data and reset the object transform (so an
    array/radial modifier can use the object origin as its pivot)."""
    ob.data.transform(M)
    ob.matrix_basis = Matrix()
    return ob


def M_wrought():
    return pbr("wrought", (0.17, 0.16, 0.16), metal=1, rough=0.36, noise_rough=0.12,
               pattern="rust", rust=(0.22, 0.1, 0.05), scale=5.0)


@item("prop_candelabra", "prop", (128, 192))
def build_prop_candelabra():
    iron = M_wrought()
    brass = M_brass()
    lathe([(0.0, 0.1), (0.34, 0.1), (0.36, 0.14), (0.3, 0.19), (0.18, 0.28), (0.11, 0.4),
           (0.13, 0.45), (0.13, 0.49), (0.08, 0.53), (0.0, 0.53)], iron, seg=40, name="base")
    for k in range(3):
        a = TAU * k / 3 - math.pi / 2
        c, s_ = math.cos(a), math.sin(a)
        pts = [(0.22 * c, 0.22 * s_, 0.2), (0.4 * c, 0.4 * s_, 0.2), (0.5 * c, 0.5 * s_, 0.08),
               (0.54 * c, 0.54 * s_, 0.03)]
        sweep(catmull(pts, 6), lambda t: 0.045 - 0.01 * t, iron, segs=10, name="foot")
        sphere(0.055, iron, loc=(0.55 * c, 0.55 * s_, 0.045), seg=14, rings=8, name="claw")
    lathe([(0.05, 0.52), (0.05, 0.86), (0.09, 0.9), (0.12, 0.96), (0.09, 1.02), (0.05, 1.06),
           (0.045, 1.66), (0.09, 1.7), (0.09, 1.76), (0.05, 1.8), (0.045, 2.18), (0.07, 2.22),
           (0.0, 2.22)], iron, seg=24, name="stem")
    for sx in (-1, 1):
        arm = [(0.0, 0.0, 1.73), (sx * 0.25, 0.0, 1.62), (sx * 0.52, 0.0, 1.72),
               (sx * 0.64, 0.0, 1.92), (sx * 0.64, 0.0, 2.02)]
        curve_tube(arm, 0.036, iron, name="arm")
        curl = [(sx * 0.12, 0, 1.64 - 0.0)]
        for i in range(1, 16):
            t = i / 15
            ang = t * TAU * 1.1
            rr = 0.12 * (1 - t * 0.8)
            curl.append((sx * (0.28 - rr * math.cos(ang)), 0.0, 1.54 + rr * math.sin(ang) * 0.9))
        curve_tube(curl, 0.02, iron, kind="POLY", name="curl")
    pan = [(0.0, 0.0), (0.15, 0.0), (0.18, 0.04), (0.16, 0.055), (0.07, 0.03), (0.0, 0.03)]
    for (x, z, h, seed) in ((-0.64, 2.02, 0.4, 1), (0.64, 2.02, 0.36, 2), (0.0, 2.22, 0.5, 3)):
        lathe(pan, brass, seg=32, loc=(x, 0, z), name="pan")
        candle((x, 0, z + 0.03), 0.07, h, drip_seed=seed, power=30)
    view(pitch=6, fill=0.9, glow=1.0)


@item("prop_torch", "prop", (96, 128))
def build_prop_torch():
    iron = M_wrought()
    plate = mirror_x([(0.0, -0.55), (0.18, -0.55), (0.22, -0.48), (0.22, 0.12), (0.16, 0.3),
                      (0.0, 0.44)])
    extrude(plate, 0.06, iron, y0=0.05, bev=0.02, name="plate")
    extrude([(x * 0.78, z * 0.82 - 0.03) for (x, z) in plate], 0.03, iron, y0=0.03,
            bev=0.01, name="plate2")
    for (x, z) in ((-0.13, -0.45), (0.13, -0.45), (-0.13, 0.12), (0.13, 0.12), (0.0, 0.3)):
        sphere(0.025, iron, loc=(x, 0.02, z), scale=(1, 0.6, 1), seg=10, rings=6)
    sweep(catmull([(0.0, 0.03, -0.3), (0.0, -0.12, -0.34), (0.0, -0.26, -0.22),
                   (0.0, -0.3, -0.14)], 8), 0.03, iron, segs=10, name="bracket")
    torus(0.075, 0.02, iron, loc=(0, -0.3, -0.12), rseg=8)
    torus(0.07, 0.02, iron, loc=(0, -0.3, 0.1), rseg=8)
    sweep([(0.0, 0.03, 0.1), (0.0, -0.23, 0.1)], 0.02, iron, segs=8)
    wood = M_wood((0.3, 0.17, 0.08), "torchwood")
    cyl(0.035, 0.75, wood, r2=0.05, loc=(0, -0.3, -0.16), seg=16, name="stick")
    char = pbr("charcloth", (0.12, 0.07, 0.04), rough=0.9, bump=0.8, bump_scale=60,
               emit=(1.0, 0.3, 0.05), emit_str=0.0)
    wrapped_grip(0.18, 0.36, 0.075, char, wraps=4, depth=0.25, name="wrap")
    for k in range(4):
        a = TAU * k / 4 + 0.4
        sweep([(0.05 * math.cos(a), -0.3 + 0.05 * math.sin(a), 0.14),
               (0.1 * math.cos(a), -0.3 + 0.1 * math.sin(a), 0.3),
               (0.09 * math.cos(a), -0.3 + 0.09 * math.sin(a), 0.4)], 0.013, iron, segs=6)
    torus(0.095, 0.015, iron, loc=(0, -0.3, 0.38), rseg=6)
    embers = M_glow("embers", (1.0, 0.35, 0.05), 3.0)
    ico(0.07, embers, loc=(0, -0.3, 0.38), subdiv=1, scale=(1.1, 1.1, 0.5))
    flame((0, -0.3, 0.33), 0.62, power=90)
    flame((0.04, -0.33, 0.36), 0.34, lean=12, light=False)
    flame((-0.05, -0.33, 0.35), 0.3, lean=-14, light=False)
    view(pitch=6, fill=0.92, anchor="center", glow=1.0)


@item("prop_candle", "prop", (64, 96))
def build_prop_candle():
    brass = M_brass()
    lathe([(0.0, 0.0), (0.2, 0.0), (0.22, 0.03), (0.16, 0.06), (0.08, 0.1), (0.08, 0.14),
           (0.26, 0.15), (0.3, 0.19), (0.28, 0.21), (0.12, 0.19), (0.12, 0.26), (0.1, 0.27),
           (0.0, 0.27)], brass, seg=40, name="stand")
    with sub(loc=(0.33, 0, 0.19), rot=(rad(90), 0, 0)):
        torus(0.07, 0.016, brass, seg=24, rseg=8)
    candle((0, 0, 0.25), 0.085, 0.7, drip_seed=5, power=35)
    view(pitch=8, fill=0.9, glow=1.0)


def _half_cyl_outline(R, h_scale, n=16):
    return [(R * math.cos(math.pi * i / n), R * h_scale * math.sin(math.pi * i / n))
            for i in range(n + 1)]


def _build_chest(open_):
    wood = M_wood((0.34, 0.12, 0.05), "chestwood", axis="X", grain=1.3)
    iron = M_wrought()
    gold = M_gold()
    W, D, H = 1.4, 0.82, 0.62
    box((W, D, H), wood, loc=(0, 0, H / 2), bev=0.02, name="body")
    # horizontal plank grooves on the front
    groove = pbr("groove", (0.05, 0.02, 0.01), rough=0.9)
    for z in (0.21, 0.42):
        box((W - 0.02, 0.01, 0.012), groove, loc=(0, -D / 2 - 0.001, z))
    box((W + 0.08, D + 0.08, 0.07), gold, loc=(0, 0, 0.035), bev=0.015, name="foot_trim")
    box((W + 0.05, D + 0.05, 0.05), gold, loc=(0, 0, H - 0.02), bev=0.012, name="rim")
    for x in (-0.44, 0.44):
        box((0.11, D + 0.03, H - 0.02), iron, loc=(x, 0, H / 2), bev=0.008, name="band")
        rivet_row((x, -D / 2 - 0.02, 0.12), (x, -D / 2 - 0.02, H - 0.1), 4, 0.022, iron)
    for sx in (-1, 1):
        for (zc, sz) in ((0.07, 1), (H - 0.05, -1)):
            pts = [(0, 0), (0.2, 0), (0.2, 0.05), (0.05, 0.05), (0.05, 0.2), (0, 0.2)]
            extrude([(sx * (-x), sz * z) for (x, z) in pts], 0.02, gold, bev=0.006,
                    loc=(sx * (W / 2 + 0.005), -D / 2 - 0.01, zc), name="corner")
    lock = mirror_x([(0.0, -0.14), (0.1, -0.1), (0.13, 0.02), (0.1, 0.12), (0.0, 0.15)])
    extrude(lock, 0.035, gold, loc=(0, -D / 2 - 0.02, H - 0.2), bev=0.01, name="lock")
    extrude(mirror_x([(0.0, -0.06), (0.012, -0.06), (0.012, 0.0), (0.025, 0.02),
                      (0.0, 0.04)]), 0.02, M_black(), loc=(0, -D / 2 - 0.035, H - 0.21),
            name="keyhole")
    R = D / 2 + 0.01
    ang = -112 if open_ else 0
    with sub(loc=(0, R, H + 0.005), rot=(rad(ang), 0, 0)):
        with sub(loc=(0, -R, 0), rot=(0, 0, rad(90))):
            extrude(_half_cyl_outline(R, 0.78), W + 0.02, wood, bev=0.02, name="lid")
            for x in (-0.44, 0.44):
                torus(R + 0.012, 0.03, iron, loc=(0, x, 0), rot=(rad(90), 0, 0), a0=0,
                      a1=math.pi, sy=0.78, rz=1.9, rr=0.5, seg=24, name="lidband")
            torus(R + 0.014, 0.025, gold, loc=(0, -(W / 2 + 0.005), 0), rot=(rad(90), 0, 0),
                  a0=0, a1=math.pi, sy=0.78, seg=24, name="lidtrim")
            torus(R + 0.014, 0.025, gold, loc=(0, W / 2 + 0.005, 0), rot=(rad(90), 0, 0),
                  a0=0, a1=math.pi, sy=0.78, seg=24, name="lidtrim")
        extrude(mirror_x([(0.0, -0.16), (0.06, -0.14), (0.07, 0.0), (0.0, 0.02)]), 0.03, gold,
                loc=(0, -2 * R - 0.005, 0.02), bev=0.008, name="hasp")
        if open_:
            velvet = M_cloth((0.35, 0.02, 0.04), "velvet")
            box((W - 0.06, 0.02, R * 1.4), velvet, loc=(0, -R, R * 0.35), name="lining")
    if open_:
        coins = pbr("coinpile", (1.0, 0.68, 0.22), metal=1, rough=0.22, emit=(1.0, 0.6, 0.15),
                    emit_str=0.12, pattern="stone", scale=9.0, crack=0.08, bump=0.9,
                    dark=(0.55, 0.3, 0.05))
        pile = sphere(0.5, coins, loc=(0, 0, H - 0.02), scale=(W * 0.92, D * 0.86, 0.5), seg=48,
                      rings=24, name="pile")
        rng = random.Random(3)
        for i in range(22):
            x = rng.uniform(-0.55, 0.55)
            y = rng.uniform(-0.3, 0.25)
            zt = (H - 0.02) + 0.25 * math.sqrt(max(0, 1 - (x / 0.64) ** 2 - (y / 0.35) ** 2))
            with sub(loc=(x, y, zt), rot=(rad(rng.uniform(-40, 40)), rad(rng.uniform(-40, 40)), 0)):
                lathe([(0.0, -0.012), (0.075, -0.012), (0.08, 0.0), (0.075, 0.012),
                       (0.0, 0.012)], gold, seg=20, name="coin")
        for (x, col) in ((-0.3, (0.9, 0.02, 0.05)), (0.12, (0.05, 0.3, 1.0)), (0.4, (0.1, 0.9, 0.3))):
            zt = (H - 0.02) + 0.25 * math.sqrt(max(0, 1 - (x / 0.64) ** 2)) - 0.02
            lathe([(0.0, -0.07), (0.075, 0.0), (0.0, 0.07)], M_gem("chestgem_%s" % x, col, glow=0.7),
                  seg=6, smooth=False, loc=(x, -0.15, zt + 0.03), rot=(rad(20), rad(30), 0),
                  name="gem")
        beam = extrude([(-0.6, 0.0), (0.6, 0.0), (0.8, 1.2), (-0.8, 1.2)], 0.01,
                       M_beam("treasurebeam", (1.0, 0.7, 0.22), 0.7), loc=(0, -0.1, H + 0.12),
                       name="beam")
        beam["noframe"] = True
        for x in (-0.35, 0.0, 0.35):
            point_light((x, -0.25, H + 0.35), (1.0, 0.7, 0.3), 7, 0.2)
        sparkle((0.45, -0.5, 1.1), 0.09, (1.0, 0.9, 0.6))
        sparkle((-0.5, -0.5, 0.95), 0.07, (1.0, 0.9, 0.6))
        sparkle((0.1, -0.5, 1.3), 0.06, (1.0, 0.9, 0.6))
    view(pitch=14, fixed_ortho=1.86, anchor="bottom", glow=0.7 if open_ else 0.3)


item("prop_chest_closed", "prop", (128, 128))(lambda: _build_chest(False))
item("prop_chest_open", "prop", (128, 128))(lambda: _build_chest(True))


@item("prop_coffin", "prop", (128, 192))
def build_prop_coffin():
    lac = pbr("coffinwood", (0.10, 0.025, 0.02), rough=0.35, coat=0.7, coat_rough=0.12,
              pattern="wood", axis="Z", grain=1.2, dark=(0.03, 0.008, 0.006))
    lid_m = pbr("coffinlid", (0.14, 0.03, 0.03), rough=0.3, coat=0.8, coat_rough=0.1,
                pattern="wood", axis="Z", grain=1.2, dark=(0.04, 0.01, 0.008))
    silver = M_silver()
    gold = M_gold()
    outline = [(-0.3, 0.12), (0.3, 0.12), (0.44, 1.52), (0.32, 2.1), (-0.32, 2.1), (-0.44, 1.52)]
    extrude(outline, 0.46, lac, bev=0.03, name="body")
    cx, cz = 0.0, 1.1

    def shrink(pts, f):
        return [(cx + (x - cx) * f, cz + (z - cz) * f) for (x, z) in pts]
    extrude(shrink(outline, 0.9), 0.1, lid_m, y0=-0.33, bev=0.035, bev_seg=3, name="lid")
    trim = [(x, -0.335, z) for (x, z) in shrink(outline, 0.93)]
    sweep(trim + trim[:2], 0.022, gold, segs=8, caps=False, name="trim")
    # glowing red seam between body and lid: the save-point aura
    seam = [(x, -0.24, z) for (x, z) in shrink(outline, 1.0)]
    sweep(seam + seam[:2], 0.01, M_glow("seamred", (1.0, 0.02, 0.04), 0.9), segs=8, caps=False,
          name="seam")
    extrude(shape_cross(0.5, 1.1, 0.13, 0.78, 0.04), 0.05, silver, loc=(0, -0.37, 0.62),
            bev=0.016, bev_seg=1, name="cross", sharp=25)
    with sub(loc=(0, -0.41, 1.4), rot=(rad(90), 0, 0)):
        torus(0.1, 0.022, gold, seg=32)
        lathe([(0.0, -0.02), (0.08, 0.02), (0.05, 0.07), (0.0, 0.08)],
              M_gem("coffingem", (0.9, 0.0, 0.04), glow=1.2), seg=10, smooth=False)
    for (x, z) in outline:
        sphere(0.045, gold, loc=(x * 0.97, -0.25, z + (0.02 if z < 1 else -0.02)),
               seg=12, rings=8)
    box((1.05, 0.62, 0.12), M_stone("slab", (0.3, 0.29, 0.29), scale=3.0), loc=(0, 0, 0.06),
        bev=0.02, name="slab")
    point_light((0.0, 0.6, 1.3), (1.0, 0.04, 0.04), 70, 0.4)
    point_light((0.0, -0.8, 0.3), (1.0, 0.1, 0.08), 8, 0.3)
    view(pitch=5, fill=0.9, glow=0.55, rim=0.8)


def feather(root, length, width, angle, mat, y=0.0, name="feather"):
    """Flat feather (inflated leaf outline) pointing at `angle` (deg, 0 = +x,
    90 = up) in the picture plane."""
    n = 10
    up = [(length * i / n, width * math.sin(math.pi * (i / n) ** 0.8) ** 0.7) for i in range(n + 1)]
    lo = [(length * i / n, -width * 0.7 * math.sin(math.pi * (i / n) ** 0.8) ** 0.7)
          for i in range(n - 1, 0, -1)]
    rot = (0, -rad(angle), 0)
    return inflate(up + lo, width * 0.22, mat, rings=3, center=(length * 0.4, 0.0),
                   loc=(root[0], y, root[1]), rot=rot, name=name)


@item("prop_statue", "prop", (128, 256))
def build_prop_statue():
    marble = M_marble("statuemarble", (0.86, 0.85, 0.84), vein=(0.7, 0.69, 0.7))
    base_m = M_marble("pedestalmarble", (0.5, 0.48, 0.5), vein=(0.34, 0.33, 0.35), scale=2.0)
    gold = M_gold()
    box((1.3, 0.9, 0.2), base_m, loc=(0, 0, 0.1), bev=0.03, name="plinth")
    box((1.0, 0.7, 0.64), base_m, loc=(0, 0, 0.52), bev=0.02, name="pedestal")
    box((1.2, 0.85, 0.14), base_m, loc=(0, 0, 0.9), bev=0.03, name="cornice")
    box((1.12, 0.8, 0.05), gold, loc=(0, 0, 0.225), bev=0.01)
    extrude(shape_cross(0.3, 0.44, 0.08, 0.3, 0.03), 0.04, gold, loc=(0, -0.36, 0.3),
            bev=0.012, bev_seg=1, name="emblem", sharp=25)
    z0 = 0.97
    with sub(loc=(0, 0.05, z0)):
        robe = [(0.0, 0.0), (0.46, 0.0), (0.45, 0.08), (0.38, 0.45), (0.29, 0.9),
                (0.21, 1.22), (0.17, 1.36), (0.0, 1.36)]
        lathe(robe, marble, seg=64, sy=0.8, name="robe",
              radial=lambda a, t: 1 + 0.09 * math.sin(11 * a + 0.5) * (1 - t) ** 1.2
              + 0.03 * math.sin(23 * a) * (1 - t))
        sphere(0.5, marble, loc=(0, 0, 1.6), scale=(0.44, 0.33, 0.62), seg=32, rings=16,
               name="torso")
        for sx in (-1, 1):
            sphere(0.1, marble, loc=(sx * 0.2, 0.02, 1.82), seg=16, rings=10)
        cyl(0.06, 0.18, marble, loc=(0, 0.0, 1.95), seg=16)
        sphere(0.13, marble, loc=(0, -0.01, 2.12), scale=(1.0, 1.05, 1.18), seg=32, rings=16,
               name="head")
        veil = lathe([(0.0, 2.36), (0.1, 2.33), (0.16, 2.24), (0.17, 2.08), (0.2, 1.92),
                      (0.27, 1.76), (0.33, 1.52), (0.36, 1.3)], marble, seg=40, cap=False,
                     a0=rad(-25), a1=rad(205), name="veil",
                     radial=lambda a, t: 1 + 0.05 * math.sin(9 * a) * t)
        solidify(veil, 0.025)
        halo = M_glow("halo", (1.0, 0.85, 0.5), 2.2, base=(1.0, 0.85, 0.5))
        torus(0.26, 0.018, halo, loc=(0, 0.2, 2.18), rot=(rad(90), 0, 0), seg=64, rseg=8)
        for sx in (-1, 1):
            sweep(catmull([(sx * 0.22, 0.0, 1.82), (sx * 0.3, -0.03, 1.6),
                           (sx * 0.22, -0.18, 1.5), (sx * 0.1, -0.28, 1.55)], 8),
                  lambda t: 0.06 + 0.035 * t ** 2, marble, segs=12, name="arm")
            sphere(0.045, marble, loc=(sx * 0.08, -0.3, 1.57), seg=12, rings=8)
        orb = M_glow("healorb", (0.45, 0.8, 1.0), 1.3, base=(0.5, 0.8, 1.0))
        sphere(0.13, orb, loc=(0, -0.34, 1.66), seg=32, rings=16, name="orb")
        sphere(0.2, M_glowshell("orbhalo", (0.4, 0.75, 1.0), 0.6, 1.2), loc=(0, -0.34, 1.66),
               seg=32, rings=16)
        point_light((0, -0.55, 1.66), (0.6, 0.85, 1.0), 40, 0.1)
        # wings: feathers hang from an arched leading edge, longest at the tip
        edge = catmull([(0.14, 1.86), (0.3, 2.22), (0.46, 2.6), (0.6, 2.92), (0.62, 3.12)], 10)
        for sx in (-1, 1):
            m = len(edge)
            for row, (L0, L1, w, dy, zoff) in enumerate(((0.3, 1.25, 0.1, 0.26, 0.0),
                                                          (0.22, 0.66, 0.1, 0.2, 0.05),
                                                          (0.14, 0.34, 0.08, 0.15, 0.08))):
                nf = 9 if row == 0 else (8 if row == 1 else 7)
                for k in range(nf):
                    u = k / (nf - 1)
                    x, z = edge[min(int(u * (m - 1)), m - 1)]
                    ang = -98 + 30 * u
                    L = L0 + (L1 - L0) * u ** 0.8
                    a = ang if sx > 0 else 180 - ang
                    feather((sx * x, z + zoff), L, w, a, marble, y=dy + 0.01 * k,
                            name="feather")
            sweep([(sx * x, 0.15, z + 0.04) for (x, z) in edge], lambda t: 0.06 - 0.03 * t,
                  marble, segs=10, name="wingarm")
    view(pitch=5, fill=0.95, glow=0.7, top=1.5)


@item("prop_gargoyle", "prop", (128, 160))
def build_prop_gargoyle():
    stone = M_stone("gargstone", (0.42, 0.41, 0.43), scale=3.5, crack=0.012)
    ped = M_stone("pedstone", (0.34, 0.33, 0.34), scale=3.0, moss=True, moss_z0=-0.35,
                  moss_z1=0.1)
    box((1.0, 0.85, 0.16), ped, loc=(0, 0, 0.08), bev=0.03)
    box((0.8, 0.68, 0.62), ped, loc=(0, 0, 0.47), bev=0.02)
    box((0.96, 0.82, 0.13), ped, loc=(0, 0, 0.845), bev=0.03)
    eye = M_glow("gargeye", (1.0, 0.05, 0.02), 6.0)

    def part(ob):
        displace(ob, 0.012, 0.05)
        return ob
    with sub(loc=(0, 0.05, 0.91), rot=(0, 0, rad(-28))):
        part(sphere(0.5, stone, loc=(0, 0.08, 0.42), scale=(0.52, 0.62, 0.62),
                    rot=(rad(28), 0, 0), seg=32, rings=16, name="torso"))
        part(sphere(0.22, stone, loc=(0, -0.13, 0.52), scale=(1.1, 0.9, 1.0), seg=24, rings=12))
        part(sphere(0.17, stone, loc=(0, -0.3, 0.74), seg=24, rings=12, name="head"))
        part(sphere(0.5, stone, loc=(0, -0.45, 0.68), scale=(0.2, 0.26, 0.15), seg=20, rings=10))
        part(sphere(0.5, stone, loc=(0, -0.42, 0.6), scale=(0.17, 0.22, 0.08), rot=(rad(-12), 0, 0),
                    seg=20, rings=10))
        sphere(0.5, stone, loc=(0, -0.38, 0.8), scale=(0.34, 0.14, 0.1), seg=20, rings=10)
        for sx in (-1, 1):
            sphere(0.032, eye, loc=(sx * 0.075, -0.43, 0.78), seg=12, rings=8)
            for k in range(2):
                cone(0.018, 0.06, M_bone("fangstone", (0.7, 0.68, 0.64)),
                     loc=(sx * (0.04 + 0.04 * k), -0.54, 0.64), rot=(rad(180), 0, 0), seg=6)
            horn = catmull([(sx * 0.1, -0.26, 0.86), (sx * 0.2, -0.16, 1.0),
                            (sx * 0.24, 0.02, 1.08), (sx * 0.2, 0.18, 1.02)], 8)
            sweep(horn, lambda t: 0.05 * (1 - t) + 0.006, stone, segs=10, name="horn")
            cone(0.05, 0.16, stone, loc=(sx * 0.16, -0.26, 0.78), rot=(0, rad(70 * sx), 0), seg=8)
            arm = catmull([(sx * 0.2, -0.16, 0.5), (sx * 0.26, -0.3, 0.3), (sx * 0.24, -0.36, 0.04)], 6)
            part(sweep(arm, lambda t: 0.075 - 0.02 * t, stone, segs=12, name="arm"))
            sphere(0.07, stone, loc=(sx * 0.24, -0.4, 0.03), scale=(1.1, 1.3, 0.6), seg=14, rings=8)
            for c in (-1, 0, 1):
                cone(0.018, 0.07, stone, loc=(sx * 0.24 + c * 0.035, -0.47, 0.02),
                     rot=(rad(100), 0, 0), seg=6)
            part(sphere(0.5, stone, loc=(sx * 0.27, 0.12, 0.2), scale=(0.24, 0.42, 0.32), seg=20,
                        rings=10, name="thigh"))
            sphere(0.08, stone, loc=(sx * 0.3, -0.08, 0.04), scale=(1.0, 1.4, 0.6), seg=14, rings=8)
            # bat wing: membrane + bones
            with sub(loc=(sx * 0.16, 0.24, 0.62), rot=(0, 0, rad(-18 * sx))):
                outline = [(0.0, 0.0), (0.12, 0.34), (0.34, 0.62), (0.72, 0.56), (0.56, 0.4),
                           (0.7, 0.2), (0.5, 0.14), (0.54, -0.1), (0.32, -0.02), (0.2, -0.24),
                           (0.06, -0.1)]
                extrude([(sx * x, z) for (x, z) in outline], 0.03,
                        M_stone("wingstone", (0.36, 0.35, 0.36), scale=5.0), bev=0.01)
                bones = [(0.34, 0.62), (0.72, 0.56), (0.7, 0.2), (0.54, -0.1), (0.2, -0.24)]
                sweep([(0.0, -0.02, 0.0), (sx * 0.14, -0.02, 0.36), (sx * 0.34, -0.02, 0.62)],
                      lambda t: 0.045 - 0.015 * t, stone, segs=8)
                for (x, z) in bones[1:]:
                    sweep([(sx * 0.34, -0.02, 0.62), (sx * x, -0.02, z)], lambda t: 0.028 - 0.02 * t,
                          stone, segs=6)
                cone(0.03, 0.12, stone, loc=(sx * 0.34, -0.02, 0.62), rot=(0, rad(-20 * sx), 0), seg=6)
        tail = catmull([(0.0, 0.34, 0.16), (0.22, 0.4, 0.02), (0.38, 0.25, -0.16),
                        (0.44, -0.05, -0.3), (0.38, -0.3, -0.36)], 8)
        sweep(tail, lambda t: 0.055 * (1 - t) + 0.014, stone, segs=10, name="tail")
        extrude(mirror_x([(0.0, 0.0), (0.05, 0.02), (0.0, 0.1)]), 0.03, stone,
                loc=(0.38, -0.33, -0.4), rot=(0, rad(20), 0))
    view(pitch=7, fill=0.95, glow=0.6)


def _arch_pt(r, c, hs, t):
    """Point on a pointed (two-centred) arch: t in [0, 1] from the left
    springer over the apex to the right springer; arcs of radius r centred at
    (+c, hs) (left arc) and (-c, hs) (right arc)."""
    a_ap = math.acos(-c / r)
    if t <= 0.5:
        a = math.pi - (math.pi - a_ap) * (t / 0.5)
        return (c + r * math.cos(a), hs + r * math.sin(a))
    a = math.pi - (math.pi - a_ap) * ((1 - t) / 0.5)
    return (-(c + r * math.cos(a)), hs + r * math.sin(a))


@item("prop_door", "prop", (128, 192))
def build_prop_door():
    stone = M_stone("doorstone", (0.36, 0.34, 0.33), scale=3.0, moss=True, moss_z0=-0.4,
                    moss_z1=0.6)
    wood = M_wood((0.26, 0.13, 0.06), "doorwood", axis="Z", grain=1.1)
    iron = M_wrought()
    w_in, hs = 1.2, 1.3
    r_in = 0.9 * w_in
    c = r_in - w_in / 2
    r_out = r_in + 0.26
    # voussoirs
    n = 11
    for i in range(n):
        t0, t1 = i / n + 0.004, (i + 1) / n - 0.004
        inner = [_arch_pt(r_in, c, hs, t0 + (t1 - t0) * k / 4) for k in range(5)]
        outer = [_arch_pt(r_out, c, hs, t0 + (t1 - t0) * k / 4) for k in range(5)]
        extrude(inner + outer[::-1], 0.36 if i != n // 2 else 0.42, stone, bev=0.025,
                name="voussoir")
    # jambs
    wj = r_out - r_in
    zc = 0.0
    k = 0
    while zc < hs - 0.01:
        hgt = min(0.32 if k % 2 == 0 else 0.24, hs - zc)
        for sx in (-1, 1):
            ext = 0.05 if k % 2 == 0 else 0.0
            x0 = sx * w_in / 2
            x1 = sx * (w_in / 2 + wj + ext)
            extrude([(x0, zc + 0.006), (x1, zc + 0.006), (x1, zc + hgt - 0.006),
                     (x0, zc + hgt - 0.006)], 0.36, stone, bev=0.025, name="jamb")
        zc += hgt
        k += 1
    box((w_in + 2 * wj + 0.3, 0.5, 0.08), stone, loc=(0, -0.06, -0.04), bev=0.02, name="step")
    # door planks, clipped to the arch with a boolean intersect
    bm = bmesh.new()
    npl = 6
    pw = w_in / npl
    for i in range(npl):
        x = -w_in / 2 + pw * (i + 0.5)
        gap = 0.02 if i == npl // 2 - 1 or i == npl // 2 else 0.008
        res = bmesh.ops.create_cube(bm, size=1.0)
        vs = res["verts"]
        bmesh.ops.scale(bm, vec=Vector((pw - gap, 0.1, hs + r_in)), verts=vs)
        bmesh.ops.translate(bm, vec=Vector((x, 0.06, (hs + r_in) / 2)), verts=vs)
    planks = bm_obj("planks", bm, wood, sharp=30)
    bevel(planks, 0.01, 1)
    opening = [_arch_pt(r_in, c, hs, i / 40) for i in range(41)]
    opening = [(opening[0][0], -0.01)] + opening + [(opening[-1][0], -0.01)]
    cutter = extrude([(x * 0.999, z) for (x, z) in opening], 0.6, None, name="cut")
    boolean(planks, cutter, op="INTERSECT")
    # iron straps with scroll ends and rivets
    for z in (0.32, 0.98, 1.6):
        if z < hs:
            half = w_in / 2 - 0.03
        else:
            half = (c - math.sqrt(r_in ** 2 - (z - hs) ** 2)) * -1 - 0.05
        box((2 * half, 0.03, 0.1), iron, loc=(0, -0.005, z), bev=0.008, name="strap")
        rivet_row((-half + 0.06, -0.025, z), (half - 0.06, -0.025, z), 7, 0.02, iron)
        for sx in (-1, 1):
            curl = []
            for i in range(14):
                tt = i / 13
                ang = tt * TAU * 0.85 + math.pi / 2
                rr = 0.07 * (1 - 0.6 * tt)
                curl.append((sx * (0.12 + rr * math.cos(ang) * -1), -0.025, z + 0.05 + rr * math.sin(ang) - 0.07))
            curve_tube(curl, 0.014, iron, kind="POLY")
    brass = M_brass()
    with sub(loc=(0, -0.03, 1.05), rot=(rad(90), 0, 0)):
        lathe([(0.0, 0.0), (0.1, 0.0), (0.09, 0.03), (0.04, 0.05), (0.0, 0.05)], iron, seg=24,
              radial=lambda a, t: 1 + 0.12 * math.sin(8 * a))
    torus(0.11, 0.02, brass, loc=(0, -0.07, 0.94), rot=(rad(90), 0, 0), seg=32)
    extrude(mirror_x([(0.0, -0.1), (0.05, -0.08), (0.05, 0.08), (0.0, 0.1)]), 0.02, iron,
            loc=(0.3, -0.02, 0.9), bev=0.006)
    extrude(mirror_x([(0.0, -0.04), (0.01, -0.04), (0.01, 0.0), (0.02, 0.015), (0.0, 0.03)]),
            0.02, M_black(), loc=(0.3, -0.035, 0.9))
    view(pitch=5, fill=0.95, glow=0.0)


@item("prop_chandelier", "prop", (256, 160))
def build_prop_chandelier():
    iron = M_wrought()
    brass = M_brass()
    R1, R2 = 1.45, 0.82
    lathe([(0.0, -0.62), (0.03, -0.5), (0.06, -0.38), (0.12, -0.3), (0.14, -0.22),
           (0.08, -0.16), (0.07, 0.0), (0.16, 0.06), (0.16, 0.12), (0.07, 0.18), (0.06, 0.5),
           (0.12, 0.56), (0.1, 0.64), (0.05, 0.7), (0.05, 0.92), (0.0, 0.94)], iron, seg=32,
          name="shaft")
    torus(R1, 0.05, iron, seg=96, rseg=10, rz=1.4, name="ring1")
    torus(R2, 0.04, iron, loc=(0, 0, 0.46), seg=64, rseg=10, rz=1.4, name="ring2")
    n1, n2 = 10, 6
    for k in range(n1):
        a = TAU * (k + 0.5) / n1
        c, s_ = math.cos(a), math.sin(a)
        if k % 2 == 0:
            curve_tube([(0.1 * c, 0.1 * s_, 0.1), (0.55 * c, 0.55 * s_, -0.12),
                        (1.05 * c, 1.05 * s_, -0.1), (R1 * c, R1 * s_, 0.0)], 0.03, iron,
                       name="arm")
        # hanging drop between candles
        cone(0.035, 0.18, iron, loc=(R1 * math.cos(a + TAU / n1 / 2), R1 * math.sin(a + TAU / n1 / 2),
                                     -0.04), rot=(math.pi, 0, 0), seg=8, name="drop")
        with sub(loc=(R1 * c, R1 * s_, 0.04)):
            lathe([(0.0, 0.0), (0.11, 0.0), (0.13, 0.04), (0.11, 0.05), (0.05, 0.03), (0.0, 0.03)],
                  brass, seg=20, name="cup")
            candle((0, 0, 0.03), 0.055, 0.3 + 0.05 * math.sin(k * 2.3), drip_seed=k, power=22)
    for k in range(n2):
        a = TAU * k / n2
        c, s_ = math.cos(a), math.sin(a)
        curve_tube([(0.07 * c, 0.07 * s_, 0.3), (0.4 * c, 0.4 * s_, 0.28), (R2 * c, R2 * s_, 0.46)],
                   0.025, iron, name="arm2")
        with sub(loc=(R2 * c, R2 * s_, 0.5)):
            lathe([(0.0, 0.0), (0.1, 0.0), (0.12, 0.04), (0.1, 0.05), (0.0, 0.03)], brass, seg=20)
            candle((0, 0, 0.03), 0.05, 0.28, drip_seed=20 + k, power=18)
    hub = (0, 0, 1.3)
    torus(0.08, 0.025, iron, loc=hub, seg=24, rseg=8)
    for k in range(4):
        a = TAU * k / 4 + TAU / 8
        chain([(R1 * math.cos(a) * 0.98, R1 * math.sin(a) * 0.98, 0.05), (0.06 * math.cos(a),
               0.06 * math.sin(a), hub[2])], iron, link_len=0.13, wire=0.016)
    chain([(0, 0, hub[2] + 0.04), (0, 0, 1.9)], iron, link_len=0.14, wire=0.018)
    view(pitch=12, anchor="top", fill=0.96, glow=0.9, margin=0.0)


def _profile_r(prof, z):
    for (r0, z0), (r1, z1) in zip(prof[:-1], prof[1:]):
        if z0 <= z <= z1 and z1 > z0:
            return r0 + (r1 - r0) * (z - z0) / (z1 - z0)
    return prof[-1][0]


@item("prop_barrel", "prop", (96, 96))
def build_prop_barrel():
    staves = pbr("staves", (0.42, 0.24, 0.1), rough=0.6, pattern="staves", count=18)
    body = catmull2d([(0.42, 0.0), (0.49, 0.3), (0.52, 0.6), (0.49, 0.9), (0.42, 1.2)], 6,
                     closed=False)
    prof = [(0.0, 0.0)] + body + [(0.4, 1.2), (0.39, 1.15), (0.0, 1.15)]
    lathe(prof, staves, seg=72, name="barrel")
    lid = M_wood((0.36, 0.2, 0.08), "lidwood", axis="X", grain=1.3)
    cyl(0.39, 0.02, lid, loc=(0, 0, 1.155), seg=48, name="lid")
    for x in (-0.13, 0.13):
        box((0.008, 0.78, 0.012), pbr("groove", (0.05, 0.02, 0.01), rough=0.9),
            loc=(x, 0, 1.165))
    iron = M_wrought()
    for z in (0.1, 0.33, 0.87, 1.1):
        r = _profile_r(body, z)
        torus(r + 0.012, 0.022, iron, loc=(0, 0, z), rz=2.4, rr=0.6, seg=72, rseg=10,
              name="hoop")
        for k in range(5):
            a = -math.pi / 2 + (k - 2) * 0.35
            sphere(0.012, iron, loc=((r + 0.03) * math.cos(a), (r + 0.03) * math.sin(a), z),
                   seg=8, rings=4)
    view(pitch=12, fill=0.94, glow=0.0)


@item("prop_crate", "prop", (96, 96))
def build_prop_crate():
    core = M_wood((0.28, 0.16, 0.07), "cratecore", axis="X", grain=1.4)
    board = M_wood((0.46, 0.28, 0.12), "crateboard", axis="X", grain=1.4)
    board_v = M_wood((0.46, 0.28, 0.12), "crateboard_v", axis="Z", grain=1.4)
    iron = M_wrought()
    S = 1.0
    box((S * 0.96, S * 0.96, S * 0.96), core, loc=(0, 0, S / 2), name="core")
    # front planks with gaps
    for i in range(4):
        z = 0.12 + i * 0.25
        box((S * 0.86, 0.03, 0.225), core, loc=(0, -0.48, z + 0.1), bev=0.008, name="plank")
    t = 0.13
    for (sx, sz) in ((-1, 0), (1, 0)):
        box((t, 0.06, S), board_v, loc=(sx * (S / 2 - t / 2), -0.49, S / 2), bev=0.012)
    for sz in (0, 1):
        box((S, 0.06, t), board, loc=(0, -0.49, t / 2 + sz * (S - t)), bev=0.012)
    L = math.hypot(S - 2 * t, S - 2 * t)
    ang = math.atan2(S - 2 * t, S - 2 * t)
    box((L, 0.05, t * 0.9), board, loc=(0, -0.5, S / 2), rot=(0, -ang, 0), bev=0.012,
        name="brace")
    # top frame (visible from the slight top angle)
    for sy in (-1, 1):
        box((S, t, 0.06), board, loc=(0, sy * (S / 2 - t / 2), S - 0.01), bev=0.012)
    for sx in (-1, 1):
        box((t, S, 0.06), board_v, loc=(sx * (S / 2 - t / 2), 0, S - 0.01), bev=0.012)
    for sx in (-1, 1):
        for sz in (-1, 1):
            pts = [(0, 0), (0.2, 0), (0.2, 0.05), (0.05, 0.05), (0.05, 0.2), (0, 0.2)]
            extrude([(sx * -x, -sz * z) for (x, z) in pts], 0.02, iron, bev=0.006,
                    loc=(sx * (S / 2 + 0.005), -0.53, S / 2 + sz * (S / 2 + 0.005)))
            sphere(0.018, iron, loc=(sx * (S / 2 - 0.06), -0.545, S / 2 + sz * (S / 2 - 0.06)),
                   seg=8, rings=4)
    view(pitch=12, fill=0.94, glow=0.0)


@item("prop_pillar", "prop", (96, 256))
def build_prop_pillar():
    stone = M_stone("pillarstone", (0.25, 0.25, 0.29), scale=1.6, crack=0.004)
    carved = M_stone("carvedstone", (0.3, 0.3, 0.34), scale=3.0, crack=0.004)
    mossy = M_stone("plinthstone", (0.24, 0.24, 0.27), scale=3.0, moss=True, moss_z0=-0.1,
                    moss_z1=0.1)
    box((1.0, 1.0, 0.24), mossy, loc=(0, 0, 0.12), bev=0.03, name="plinth")
    lathe([(0.0, 0.24), (0.47, 0.24), (0.49, 0.29), (0.45, 0.35), (0.40, 0.37), (0.42, 0.42),
           (0.37, 0.48), (0.34, 0.5), (0.0, 0.5)], carved, seg=48, sharp=50, name="base")
    zt = 3.3
    lathe([(0.0, 0.5), (0.3, 0.5), (0.3, zt), (0.0, zt)], stone, seg=64, name="shaft",
          radial=lambda a, t: 1 + 0.05 * math.cos(16 * a))
    for k in range(4):
        a = TAU * k / 4 + TAU / 8
        cyl(0.1, zt - 0.5, stone, loc=(0.31 * math.cos(a), 0.31 * math.sin(a), (zt + 0.5) / 2),
            seg=20)
    for z in (1.4, 2.4):
        torus(0.36, 0.045, carved, loc=(0, 0, z), seg=64, rseg=10)
    joint = pbr("joint", (0.05, 0.05, 0.06), rough=0.9)
    for z in (0.95, 1.9, 2.85):
        torus(0.302, 0.006, joint, loc=(0, 0, z), seg=64, rseg=6)
    lathe([(0.0, zt), (0.36, zt), (0.38, zt + 0.05), (0.42, zt + 0.2), (0.5, zt + 0.34),
           (0.56, zt + 0.4), (0.0, zt + 0.4)], carved, seg=48, name="capital")
    # foliage crockets: one leaf baked off-axis + radial array modifier
    lf = leaf((0.0, 0.0, 0.0), 0.34, 0.1, (0, rad(-80), 0),
              mat=M_stone("leafstone", (0.46, 0.45, 0.47), scale=6.0, crack=0.005), depth=0.03)
    bake(lf, Matrix.Translation((0.0, -0.43, zt + 0.04)) @ Matrix.Rotation(rad(32), 4, "X")
         @ lf.matrix_basis.copy())
    radial_array(lf, 8)
    lathe([(0.0, zt + 0.4), (0.62, zt + 0.4), (0.64, zt + 0.46), (0.62, zt + 0.52),
           (0.0, zt + 0.52)], stone, seg=8, smooth=False, name="abacus")
    view(pitch=6, fill=0.96, glow=0.0)


BOOK_COLORS = [(0.32, 0.03, 0.04), (0.06, 0.16, 0.08), (0.05, 0.08, 0.2), (0.3, 0.16, 0.06),
               (0.06, 0.05, 0.05), (0.22, 0.05, 0.18), (0.36, 0.26, 0.12), (0.12, 0.2, 0.22)]


def M_book(i):
    c = BOOK_COLORS[i % len(BOOK_COLORS)]
    return pbr("book%d" % i, c, rough=0.5, coat=0.25, coat_rough=0.3, pattern="bands",
               band=(0.95, 0.68, 0.28), pos=(0.1, 0.14, 0.84, 0.88))


def skull(loc, s, mat, rot=(0, 0, 0)):
    with sub(loc=loc, rot=rot, scale=s):
        sphere(0.5, mat, loc=(0, 0, 0.1), scale=(0.9, 1.05, 0.95), seg=24, rings=12)
        sphere(0.5, mat, loc=(0, -0.22, -0.18), scale=(0.62, 0.5, 0.42), seg=20, rings=10)
        dark = pbr("socket", (0.02, 0.01, 0.01), rough=0.9)
        for sx in (-1, 1):
            sphere(0.13, dark, loc=(sx * 0.17, -0.4, 0.0), seg=12, rings=8)
        cone(0.07, 0.12, dark, loc=(0, -0.46, -0.16), rot=(rad(90), 0, 0), seg=3)
        for k in range(6):
            box((0.05, 0.05, 0.07), mat, loc=(-0.13 + k * 0.052, -0.45, -0.34), bev=0.01)


@item("prop_bookshelf", "prop", (128, 192))
def build_prop_bookshelf():
    wood = M_wood((0.25, 0.12, 0.05), "shelfwood", axis="Z", grain=1.2)
    wood_h = M_wood((0.25, 0.12, 0.05), "shelfwood_h", axis="X", grain=1.2)
    back = M_wood((0.08, 0.04, 0.02), "shelfback", axis="Z", grain=1.0)
    W, D, H = 1.3, 0.42, 2.0
    for sx in (-1, 1):
        box((0.08, D, H), wood, loc=(sx * (W / 2 - 0.04), 0, H / 2), bev=0.012, name="side")
    box((W - 0.1, 0.03, H - 0.05), back, loc=(0, D / 2 - 0.015, H / 2), name="back")
    box((W + 0.14, D + 0.08, 0.1), wood_h, loc=(0, 0, H + 0.05), bev=0.02, name="crown")
    box((W + 0.06, D + 0.04, 0.06), wood_h, loc=(0, -0.01, H - 0.01), bev=0.015)
    box((W + 0.08, D + 0.06, 0.12), wood_h, loc=(0, 0, 0.06), bev=0.02, name="plinth")
    arch = [_arch_pt(0.6, 0.3, 0.0, i / 20) for i in range(21)]
    extrude([(x, z) for (x, z) in arch] + [(0.3, -0.02), (-0.3, -0.02)], 0.06, wood_h,
            loc=(0, -D / 2 - 0.02, H + 0.1), bev=0.01, name="pediment")
    brass = M_brass()
    shelves = [0.12, 0.56, 1.0, 1.44]
    for z in shelves:
        box((W - 0.1, D - 0.04, 0.05), wood_h, loc=(0, -0.01, z + 0.025), bev=0.008,
            name="shelf")
        box((W - 0.1, 0.02, 0.04), brass, loc=(0, -D / 2 + 0.005, z + 0.03))
    rng = random.Random(12)
    for si, z in enumerate(shelves):
        z0 = z + 0.05
        top = (shelves[si + 1] if si + 1 < len(shelves) else H - 0.05) - 0.02
        x = -W / 2 + 0.1
        xend = W / 2 - 0.1
        special = {0: "stack", 1: "skull", 2: None, 3: "candle"}[si]
        sp_at = rng.uniform(-0.2, 0.25)
        while x < xend - 0.04:
            if special and abs(x - sp_at) < 0.05:
                if special == "stack":
                    for k in range(4):
                        w_, h_ = rng.uniform(0.3, 0.36), rng.uniform(0.05, 0.07)
                        box((w_, 0.26, h_), M_book(rng.randrange(8)),
                            loc=(x + 0.17, -0.04, z0 + 0.03 + k * 0.065), rot=(0, 0, rad(rng.uniform(-8, 8))),
                            bev=0.008, name="flatbook")
                    x += 0.38
                elif special == "skull":
                    skull((x + 0.14, -0.05, z0 + 0.13), 0.28, M_bone("skullbone", (0.8, 0.74, 0.6)))
                    x += 0.3
                elif special == "candle":
                    lathe([(0.0, 0.0), (0.08, 0.0), (0.09, 0.02), (0.03, 0.03), (0.0, 0.03)], brass,
                          seg=20, loc=(x + 0.1, -0.08, z0))
                    candle((x + 0.1, -0.08, z0 + 0.02), 0.035, 0.2, drip_seed=3, power=10)
                    x += 0.22
                special = None
                continue
            w_ = rng.uniform(0.05, 0.1)
            h_ = min(rng.uniform(0.26, 0.38), top - z0 - 0.02)
            lean = 0.0
            if rng.random() < 0.08 and x > -0.3:
                lean = rng.choice((-1, 1)) * rng.uniform(8, 16)
            box((w_, 0.28, h_), M_book(rng.randrange(8)),
                loc=(x + w_ / 2, -0.04, z0 + h_ / 2), rot=(0, rad(lean), 0), bev=0.007,
                name="book")
            x += w_ + (0.012 if lean == 0 else 0.05)
    view(pitch=5, fill=0.95, glow=0.6)


@item("prop_gear", "prop", (192, 192))
def build_prop_gear():
    brass = pbr("gearbrass", (0.74, 0.5, 0.22), metal=1, rough=0.3, noise_rough=0.14,
                bump=0.08, bump_scale=20)
    dark = M_wrought()
    N, Rr, Rt = 16, 0.84, 1.0
    pts = []
    for k in range(N):
        a0 = TAU * k / N
        da = TAU / N
        for (f, r) in ((0.0, Rr), (0.12, Rr), (0.28, Rt), (0.52, Rt), (0.68, Rr)):
            a = a0 + f * da
            pts.append((r * math.cos(a), r * math.sin(a)))
    gear = extrude(pts, 0.22, brass, name="gear", sharp=30)
    # spoke windows cut with one boolean (six disjoint cutter pieces)
    bm = bmesh.new()
    for k in range(6):
        a0 = TAU * k / 6 + rad(8)
        a1 = TAU * (k + 1) / 6 - rad(8)
        corner = [(0.34, a0 + 0.1), (0.66, a0 + 0.05), (0.66, a1 - 0.05), (0.34, a1 - 0.1)]
        win = [(r * math.cos(a), r * math.sin(a)) for (r, a) in corner]
        win = catmull2d(win, 6, closed=True)
        if _poly_area(win) < 0:
            win = win[::-1]
        vs_front = [bm.verts.new((x, -0.5, z)) for (x, z) in win]
        vs_back = [bm.verts.new((x, 0.5, z)) for (x, z) in win]
        bm.faces.new(vs_front)
        bm.faces.new(vs_back[::-1])
        n = len(win)
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((vs_front[i], vs_back[i], vs_back[j], vs_front[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    cutter = bm_obj("windows", bm, None)
    boolean(gear, cutter)
    bevel(gear, 0.02, 1, angle=30)     # after the boolean so the windows get chamfers
    gear.data.shade_flat()
    torus(0.8, 0.018, dark, rot=(rad(90), 0, 0), loc=(0, -0.115, 0), seg=96, rseg=6)
    with sub(rot=(rad(90), 0, 0)):
        lathe([(0.0, -0.17), (0.26, -0.17), (0.28, -0.13), (0.28, 0.13), (0.26, 0.17),
               (0.0, 0.17)], brass, seg=48, name="hub")
        lathe([(0.0, -0.22), (0.1, -0.22), (0.1, 0.24), (0.0, 0.24)], dark, seg=6,
              smooth=False, name="axle")
        bolt = lathe([(0.0, 0.16), (0.035, 0.16), (0.035, 0.2), (0.0, 0.2)], dark, seg=6,
                     smooth=False, name="bolt")
        bake(bolt, Matrix.Translation((0.19, 0.0, 0.0)))
        radial_array(bolt, 6)
    view(pitch=6, yaw=14, anchor="center", fill=0.94, glow=0.0)


@item("prop_vat", "prop", (128, 192))
def build_prop_vat():
    brass = M_brass()
    iron = M_wrought()
    glass = M_glass("vatglass", (0.9, 1.0, 0.95))
    lathe([(0.0, 0.0), (0.64, 0.0), (0.66, 0.05), (0.6, 0.1), (0.56, 0.3), (0.62, 0.34),
           (0.62, 0.42), (0.0, 0.42)], iron, seg=48, sharp=40, name="base")
    torus(0.63, 0.025, brass, loc=(0, 0, 0.38), seg=64)
    for k in range(10):
        a = TAU * k / 10
        sphere(0.02, brass, loc=(0.61 * math.cos(a), 0.61 * math.sin(a), 0.2), seg=8, rings=4)
    tube = lathe([(0.5, 0.42), (0.5, 1.9)], glass, seg=64, cap=False, name="tube")
    solidify(tube, 0.025)
    liq = pbr("vatliquid", (0.2, 0.9, 0.25), rough=0.05, trans=0.55, ior=1.33,
              emit=(0.25, 1.0, 0.3), emit_str=1.0)
    lathe([(0.0, 0.43), (0.465, 0.43), (0.465, 1.62), (0.0, 1.62)], liq, seg=64, name="liquid")
    rng = random.Random(8)
    bub = pbr("vatbubble", (0.8, 1.0, 0.85), rough=0.02, trans=1.0, ior=1.1,
              emit=(0.4, 1.0, 0.5), emit_str=0.6)
    for i in range(22):
        a = rng.uniform(0, TAU)
        rr = rng.uniform(0.05, 0.4)
        sphere(rng.uniform(0.015, 0.045), bub, loc=(rr * math.cos(a), rr * math.sin(a) - 0.1,
                                                    rng.uniform(0.5, 1.58)), seg=10, rings=6)
    flesh = pbr("specimen", (0.05, 0.1, 0.06), rough=0.5, sss=0.3, sss_radius=(0.3, 1.0, 0.4))
    with sub(loc=(0, 0.05, 1.0), rot=(0, rad(-15), 0)):
        sphere(0.15, flesh, loc=(0, 0, 0.28), scale=(1.0, 1.0, 1.1), seg=20, rings=10)
        sphere(0.5, flesh, loc=(0, 0.03, 0.0), scale=(0.26, 0.24, 0.4), seg=20, rings=10)
        sweep(catmull([(0.1, -0.05, 0.1), (0.2, -0.12, -0.05), (0.08, -0.14, -0.15)], 6), 0.035,
              flesh, segs=8)
        sweep(catmull([(-0.08, -0.03, -0.15), (0.05, -0.12, -0.25), (-0.05, -0.1, -0.35)], 6),
              0.04, flesh, segs=8)
        eye = M_glow("specimeneye", (1.0, 0.9, 0.3), 3.0)
        sphere(0.02, eye, loc=(0.05, -0.14, 0.3), seg=8, rings=4)
        sphere(0.02, eye, loc=(-0.05, -0.14, 0.3), seg=8, rings=4)
    torus(0.515, 0.03, brass, loc=(0, 0, 0.46), seg=64, rz=1.5)
    torus(0.515, 0.03, brass, loc=(0, 0, 1.86), seg=64, rz=1.5)
    torus(0.515, 0.02, brass, loc=(0, 0, 1.16), seg=64)
    for k in range(4):
        a = TAU * k / 4 + TAU / 8
        cyl(0.025, 1.46, brass, loc=(0.55 * math.cos(a), 0.55 * math.sin(a), 1.16), seg=12)
    lathe([(0.0, 1.88), (0.56, 1.88), (0.6, 1.93), (0.55, 2.0), (0.42, 2.08), (0.25, 2.16),
           (0.15, 2.18), (0.0, 2.18)], brass, seg=48, name="cap")
    for k in range(12):
        a = TAU * k / 12
        sphere(0.018, iron, loc=(0.57 * math.cos(a), 0.57 * math.sin(a), 1.95), seg=8, rings=4)
    pipe = catmull([(0.0, 0.0, 2.1), (0.0, 0.0, 2.45), (0.12, 0.0, 2.6), (0.4, 0.0, 2.62),
                    (0.56, 0.0, 2.5), (0.6, 0.0, 2.2)], 8)
    sweep(pipe, 0.055, brass, segs=14, name="pipe")
    for p in (pipe[4], pipe[-6]):
        torus(0.075, 0.02, iron, loc=p, seg=20, rseg=6)
    with sub(loc=(0.1, -0.08, 2.35), rot=(rad(90), 0, 0)):
        torus(0.12, 0.018, M_darkiron(), seg=32, rseg=8)
        for k in range(4):
            box((0.24, 0.02, 0.02), M_darkiron(), rot=(0, 0, TAU * k / 8))
    with sub(loc=(0, -0.63, 0.22), rot=(rad(90), 0, 0)):
        cyl(0.1, 0.04, brass, seg=24)
        cyl(0.085, 0.01, pbr("gaugeface", (0.9, 0.86, 0.75), rough=0.4), loc=(0, 0, 0.02), seg=24)
        box((0.012, 0.07, 0.01), M_black(), loc=(0.015, 0.02, 0.028), rot=(0, 0, rad(-30)))
    point_light((0, -0.2, 1.1), (0.3, 1.0, 0.35), 60, 0.3)
    point_light((0, -0.9, 1.1), (0.3, 1.0, 0.35), 20, 0.3)
    view(pitch=7, fill=0.95, glow=0.7, glow_beauty=0.35)


# ==== END OF BUILDERS ====


# =============================================================================
#  Post-processing
# =============================================================================
def _blur(a, r):
    """Approximate gaussian blur (3 box passes) on a 2D float array."""
    r = max(1, int(round(r)))
    out = a
    for _ in range(3):
        for axis in (0, 1):
            pad = [(0, 0), (0, 0)]
            pad[axis] = (r + 1, r)
            p = np.pad(out, pad, mode="constant")
            c = np.cumsum(p, axis=axis)
            if axis == 0:
                out = (c[2 * r + 1:, :] - c[:-2 * r - 1, :]) / (2 * r + 1)
            else:
                out = (c[:, 2 * r + 1:] - c[:, :-2 * r - 1]) / (2 * r + 1)
    return out


def _read_png(path):
    """Read an RGB(A) PNG to float [0,1]."""
    im = Image.open(path)
    if im.mode not in ("RGB", "RGBA"):
        im = im.convert("RGBA")
    return np.asarray(im).astype(np.float32) / 255.0


def postprocess(beauty_path, emit_path, out_path, out_size, v):
    A = _read_png(beauty_path)
    if A.shape[2] == 3:
        A = np.concatenate([A, np.ones_like(A[..., :1])], axis=2)
    rgb, a = A[..., :3], A[..., 3:4]
    prem = rgb * a
    H, W = a.shape[:2]
    src = np.zeros_like(prem)
    if emit_path and os.path.exists(emit_path):
        E = _read_png(emit_path)[..., :3]
        src += E * v["glow"]
    if v["glow_beauty"] > 0:
        lum = prem.max(axis=2, keepdims=True)
        thr = v["glow_thr"]
        src += np.clip((lum - thr) / (1 - thr), 0, 1) * prem * v["glow_beauty"]
    if src.max() > 1e-4:
        base = min(W, H) * v["bloom"]
        bl = np.zeros_like(src)
        for c in range(3):
            bl[..., c] = (_blur(src[..., c], base * 0.018) * 0.55
                          + _blur(src[..., c], base * 0.055) * 0.45)
        # fade the halo toward the frame border so it never hard-clips
        yy = np.linspace(0, 1, H)[:, None]
        xx = np.linspace(0, 1, W)[None, :]
        edge = np.minimum(np.minimum(xx, 1 - xx) * W, np.minimum(yy, 1 - yy) * H)
        fade = np.clip(edge / (min(W, H) * 0.06), 0, 1)[..., None]
        bl *= fade * 1.6
        prem = prem + bl
        a = np.maximum(a, np.clip(bl.max(axis=2, keepdims=True) * 1.1, 0, 1))
        prem = np.minimum(prem, a)
    # downsample premultiplied channels with LANCZOS in float
    ow, oh = out_size
    chans = []
    for c in range(3):
        chans.append(np.asarray(Image.fromarray(prem[..., c].astype(np.float32), "F")
                                .resize((ow, oh), Image.LANCZOS)))
    al = np.asarray(Image.fromarray(a[..., 0].astype(np.float32), "F")
                    .resize((ow, oh), Image.LANCZOS))
    al = np.clip(al, 0, 1)
    P = np.clip(np.stack(chans, axis=2), 0, None)
    P = np.minimum(P, al[..., None])
    rgb = np.where(al[..., None] > 1e-4, P / np.maximum(al[..., None], 1e-4), 0)
    # clean alpha: kill near-transparent dust, zero colour where alpha is 0
    al = np.where(al < 1.5 / 255, 0, al)
    rgb = np.where(al[..., None] > 0, rgb, 0)
    out = np.concatenate([np.clip(rgb, 0, 1), al[..., None]], axis=2)
    Image.fromarray((out * 255 + 0.5).astype(np.uint8), "RGBA").save(out_path, optimize=True)


# =============================================================================
#  Build driver
# =============================================================================
def build_one(spec, args, tmpdir):
    t0 = time.time()
    sc = new_scene(args, spec)
    spec["fn"]()
    setup_world(sc)
    setup_rig(sc)
    frame_and_camera(sc)
    if G.view["transparent_glass"]:
        sc.cycles.film_transparent_glass = True
        sc.cycles.film_transparent_roughness = 0.1
    emit_prefix = setup_emission_output(sc, tmpdir, spec["id"])
    beauty = os.path.join(tmpdir, spec["id"] + "__beauty.png")
    sc.render.filepath = beauty
    bpy.ops.render.render(write_still=True)
    emit = None
    if emit_prefix:
        cands = sorted(glob.glob(emit_prefix + "*.png"))
        emit = cands[0] if cands else None
    out_dir = args.out_icons if spec["kind"] == "icon" else args.out_props
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, spec["id"] + ".png")
    postprocess(beauty, emit, out, spec["size"], G.view)
    print("  %-20s %5.1fs -> %s" % (spec["id"], time.time() - t0, out), flush=True)
    return out


def contact_sheet(ids, path, kind, icon_dir=ICON_DIR, prop_dir=PROP_DIR):
    items = [(i, REGISTRY[i]) for i in ids if REGISTRY[i]["kind"] == kind]
    files = []
    for i, _spec in items:
        d = icon_dir if kind == "icon" else prop_dir
        f = os.path.join(d, i + ".png")
        if os.path.exists(f):
            files.append((i, f))
    if not files:
        return None
    try:
        font = ImageFont.load_default(size=12)
    except TypeError:
        font = ImageFont.load_default()
    bg = (22, 18, 24, 255)
    slot = (40, 32, 42, 255)
    if kind == "icon":
        cw, ch, cols = 196, 160, 6
        rows = (len(files) + cols - 1) // cols
        sheet = Image.new("RGBA", (cw * cols + 8, ch * rows + 8), bg)
        d = ImageDraw.Draw(sheet)
        for k, (i, f) in enumerate(files):
            x = 8 + (k % cols) * cw
            y = 8 + (k // cols) * ch
            im = Image.open(f).convert("RGBA")
            d.rectangle([x, y, x + 131, y + 131], fill=slot)
            sheet.alpha_composite(im, (x + 2, y + 2))
            small = im.resize((48, 48), Image.LANCZOS)
            d.rectangle([x + 136, y + 2, x + 136 + 51, y + 2 + 51], fill=slot)
            sheet.alpha_composite(small, (x + 138, y + 4))
            d.text((x, y + 136), i, fill=(230, 210, 190, 255), font=font)
    else:
        pad = 12
        rows, row, rw = [], [], 0
        for i, f in files:
            im = Image.open(f).convert("RGBA")
            if rw + im.width + pad > 1400 and row:
                rows.append(row)
                row, rw = [], 0
            row.append((i, im))
            rw += im.width + pad
        if row:
            rows.append(row)
        H = sum(max(im.height for _, im in r) + 30 for r in rows) + pad
        Wd = max(sum(im.width + pad for _, im in r) for r in rows) + pad
        sheet = Image.new("RGBA", (Wd, H), bg)
        d = ImageDraw.Draw(sheet)
        y = pad
        for r in rows:
            x = pad
            rh = max(im.height for _, im in r)
            for i, im in r:
                d.rectangle([x, y, x + im.width - 1, y + rh - 1], fill=slot)
                sheet.alpha_composite(im, (x, y + rh - im.height))
                d.text((x, y + rh + 4), i, fill=(230, 210, 190, 255), font=font)
                x += im.width + pad
            y += rh + 30
    os.makedirs(os.path.dirname(path), exist_ok=True)
    sheet.convert("RGB").save(path)
    return path


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--only", default="", help="comma list of ids / globs")
    ap.add_argument("--samples", type=int, default=56)
    ap.add_argument("--ss", type=int, default=2, help="supersampling factor")
    ap.add_argument("--out-icons", default=ICON_DIR)
    ap.add_argument("--out-props", default=PROP_DIR)
    ap.add_argument("--contact", default=os.path.join(CONTACT_DIR, "contact_misc.png"))
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--contact-only", action="store_true")
    ap.add_argument("--keep-tmp", action="store_true")
    args = ap.parse_args(argv)

    ids = list(REGISTRY)
    if args.only:
        pats = [p.strip() for p in args.only.split(",") if p.strip()]
        ids = [i for i in ids if any(fnmatch.fnmatch(i, p) for p in pats)]
    if args.list:
        for i in ids:
            s = REGISTRY[i]
            print("%-22s %-5s %dx%d" % (i, s["kind"], *s["size"]))
        return 0
    failed = []
    if not args.contact_only:
        tmpdir = tempfile.mkdtemp(prefix="bn_misc_")
        t0 = time.time()
        print("Rendering %d objects (samples=%d, ss=%d)" % (len(ids), args.samples, args.ss))
        for i in ids:
            try:
                build_one(REGISTRY[i], args, tmpdir)
            except Exception as e:  # keep going; report at the end
                import traceback
                traceback.print_exc()
                failed.append((i, str(e)))
        print("Total %.1fs" % (time.time() - t0))
        if not args.keep_tmp:
            shutil.rmtree(tmpdir, ignore_errors=True)
        else:
            print("tmp:", tmpdir)
    all_ids = list(REGISTRY)
    p1 = contact_sheet(all_ids, args.contact, "icon", args.out_icons, args.out_props)
    base, ext = os.path.splitext(args.contact)
    p2 = contact_sheet(all_ids, base + "_props" + ext, "prop", args.out_icons, args.out_props)
    print("contact sheets:", p1, p2)
    if failed:
        print("FAILED:", failed)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
