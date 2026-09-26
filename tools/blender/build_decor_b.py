#!/usr/bin/env python3
"""
BLOOD NOCTURNE -- background decoration sprites, group B.

Stage decorations for the alchemy lab, waterway, clock tower, ice spire,
chapel, throne room and abyss.  Every object is modelled procedurally in
Blender (bpy as a python module) from lathes, sweeps, extruded / inflated
outlines, bevelled boxes, curves with bevel depth and the usual modifier
stack (bevel, subdivision, solidify, array, screw, boolean, displace), gets
PBR Principled materials (stone, marble, wood, iron, brass, bone, cloth,
emissive glass, transmissive ice ...), is lit by the same studio rig as the
prop sprites (warm key, cool rim, violet kicker, fill, top softbox, dim
gradient world) and rendered with Cycles (CPU) into transparent PNGs from a
straight side view (orthographic camera, very slight top angle).  Standing
objects touch the bottom edge of the frame, hanging ones (chains, pendulum,
bell, icicles) the top edge.  A Pillow post-pass adds bloom around emissive
parts, downsamples 2x with LANCZOS and cleans alpha.

The render framework (scene / rig / camera fit / materials / geometry
helpers / post-process) mirrors tools/blender/build_icons_misc.py so the
decorations match the existing prop sprites; it is copied here so this
script is self-contained.

Usage (bpy is importable as a python module):
    python3 tools/blender/build_decor_b.py                       # everything
    python3 tools/blender/build_decor_b.py --only 'deco_clock_*' --samples 32
    python3 tools/blender/build_decor_b.py --list
    python3 tools/blender/build_decor_b.py --contact-only

Outputs
    assets/props/<id>.png            RGBA sprites (size per id, 1 tile = 48 px)
    /tmp/claude-0/contact_deco_b.png review sheet

Conventions
    * The camera looks along +Y: the picture plane is XZ (x right, z up).
      2D outlines are given as (x, z) pairs; -Y is toward the viewer.
    * After building, every object is normalised into a 2-unit box centred
      on the origin so one light rig fits every object.
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


def item(item_id, size=(128, 128), kind="prop"):
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
        v.update(pitch=7.0, fill=0.95, anchor="bottom", margin=0.0)
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
    col = m2.outputs[2]
    if a.get("moss"):
        col = _moss_mix(nt, col, vec, a)
    ln(nt, col, I["Base Color"])
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
                    a.get("iris_cols", [(0.2, (1.0, 0.85, 0.2)), (0.55, (1.0, 0.35, 0.02)),
                                        (0.95, (0.5, 0.02, 0.01))]))
    # sclera with veins
    vo = nn(nt, "ShaderNodeTexVoronoi", {"Scale": 6.0}, feature="DISTANCE_TO_EDGE")
    ln(nt, tc.outputs["Object"], vo.inputs["Vector"])
    veins = math_node(nt, "LESS_THAN", vo.outputs["Distance"], 0.02)
    scl = nn(nt, "ShaderNodeMix", data_type="RGBA")
    ln(nt, veins, scl.inputs["Factor"])
    scl.inputs[6].default_value = (*a.get("sclera", (0.92, 0.86, 0.78)), 1)
    scl.inputs[7].default_value = (*a.get("vein", (0.7, 0.04, 0.03)), 1)
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


def _moss_mix(nt, col, vec, a):
    """Mix moss / algae into `col`: denser toward low object Z, noisy patches."""
    nzm = noise(nt, vec, a.get("moss_scale", 2.5), 6.0, 0.7)
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
    return m2.outputs[2]


def _pat_frost(nt, I, tc, color, a):
    """Stone / metal with hoar-frost and snow settling on upward faces."""
    vec = tc.outputs["Object"]
    s = a.get("scale", 3.0)
    nz = noise(nt, vec, s, 8.0, 0.6)
    dark = a.get("dark", tuple(c * 0.55 for c in color))
    col = ramp(nt, nz.outputs["Fac"], [(0.3, dark), (0.6, color),
                                        (0.85, tuple(min(1, c * 1.15) for c in color))])
    geo = nn(nt, "ShaderNodeNewGeometry")
    sep = nn(nt, "ShaderNodeSeparateXYZ")
    ln(nt, geo.outputs["Normal"], sep.inputs[0])
    nzf = noise(nt, vec, a.get("frost_scale", 10.0), 6.0, 0.65)
    f = math_node(nt, "ADD", math_node(nt, "MULTIPLY", sep.outputs["Z"], a.get("up", 0.8)),
                  math_node(nt, "MULTIPLY", nzf.outputs["Fac"], 0.7))
    thr = a.get("thr", 0.75)
    fm = ramp(nt, f, [(thr, (0, 0, 0)), (thr + 0.15, (1, 1, 1))])
    bw = nn(nt, "ShaderNodeRGBToBW")
    ln(nt, fm, bw.inputs[0])
    mix = nn(nt, "ShaderNodeMix", data_type="RGBA")
    ln(nt, bw.outputs[0], mix.inputs["Factor"])
    ln(nt, col, mix.inputs[6])
    mix.inputs[7].default_value = (*a.get("frost_color", (0.84, 0.92, 1.0)), 1)
    ln(nt, mix.outputs[2], I["Base Color"])
    mr = nn(nt, "ShaderNodeMapRange", {"To Min": I["Roughness"].default_value,
                                       "To Max": 0.75})
    ln(nt, bw.outputs[0], mr.inputs["Value"])
    ln(nt, mr.outputs["Result"], I["Roughness"])
    mm = nn(nt, "ShaderNodeMapRange", {"To Min": I["Metallic"].default_value,
                                       "To Max": 0.0})
    ln(nt, bw.outputs[0], mm.inputs["Value"])
    ln(nt, mm.outputs["Result"], I["Metallic"])
    return (nzf.outputs["Fac"], a.get("bump", 0.3))


_PATTERNS = dict(frost=_pat_frost, wood=_pat_wood, rust=_pat_rust, stone=_pat_stone,
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
#  Shared helpers (from the prop builders)
# =============================================================================
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


def sparkle(loc, size, color=(1.0, 0.9, 0.6), strength=6.0, rot=(0, 0, 0), name="sparkle"):
    """Flat 4-point star glint (emissive), facing the camera."""
    m = M_glow("spark_%d_%d_%d" % tuple(int(c * 9) for c in color), color, strength,
               base=color)
    return inflate(shape_star(4, size, size * 0.18, rot=0.0), size * 0.08, m, rings=2,
                   loc=loc, rot=rot, name=name)


def wrapped_grip(z0, z1, r, mat, wraps=8, depth=0.12, seg=24, name="grip"):
    """Leather-wrapped grip: lathe with a helical bump (radial modulation)."""
    n = 40
    prof = [(r, z0 + (z1 - z0) * i / n) for i in range(n + 1)]
    return lathe(prof, mat, seg=seg, name=name, cap=True,
                 radial=lambda a, t: 1 + depth * max(0.0, math.sin(a + t * wraps * TAU)) ** 2)


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


def bake(ob, M):
    """Bake a matrix into the mesh data and reset the object transform."""
    ob.data.transform(M)
    ob.matrix_basis = Matrix()
    return ob


def M_wrought():
    return pbr("wrought", (0.17, 0.16, 0.16), metal=1, rough=0.36, noise_rough=0.12,
               pattern="rust", rust=(0.22, 0.1, 0.05), scale=5.0)


# =============================================================================
#  DECORATION BUILDERS
# =============================================================================
# ==== BUILDERS ====
# ---- extra materials -----------------------------------------------------------
def M_copper(name="copper", patina=True):
    if patina:
        return pbr(name, (0.93, 0.5, 0.32), metal=1, rough=0.28, noise_rough=0.1,
                   pattern="rust", rust=(0.2, 0.44, 0.36), scale=4.0)
    return pbr(name, (0.95, 0.52, 0.33), metal=1, rough=0.22, noise_rough=0.08)


def M_ice(name="ice", tint=(0.7, 0.9, 1.0), glow=0.25, rough=0.06, trans=0.9):
    return pbr(name, tint, rough=rough, trans=trans, ior=1.31, spec=0.6,
               emit=(0.45, 0.8, 1.0), emit_str=glow, bump=0.15, bump_scale=14,
               noise_rough=0.04)


def M_snow():
    return pbr("snow", (0.88, 0.92, 1.0), rough=0.75, sss=0.3, sss_radius=(0.6, 0.8, 1.0),
               bump=0.5, bump_scale=25)


def M_blackwax():
    return pbr("blackwax", (0.035, 0.028, 0.034), rough=0.32, sss=0.15,
               sss_radius=(1.0, 0.3, 0.2), coat=0.35, coat_rough=0.15)


def M_velvet(name="velvet", color=(0.42, 0.012, 0.03)):
    return pbr(name, color, rough=0.8, sheen=1.0, bump=0.2, bump_scale=160)


def M_lacquer():
    return pbr("lacquer", (0.02, 0.015, 0.02), rough=0.3, coat=0.8, coat_rough=0.08,
               pattern="wood", axis="Z", grain=1.2, dark=(0.006, 0.004, 0.006))


def M_blackmarble(name="blackmarble"):
    return M_marble(name, (0.045, 0.04, 0.05), vein=(0.36, 0.32, 0.36), scale=1.4)


def M_water(name="water", glow=0.2, tint=(0.35, 0.5, 0.45), emit=(0.3, 0.7, 0.6)):
    return pbr(name, tint, rough=0.03, trans=0.65, ior=1.33, emit=emit, emit_str=glow,
               coat=0.5)


def M_stained(name, palette, scale=16.0, lead=0.05, strength=3.0, warm=None):
    """Stained glass: voronoi cells coloured from `palette` (constant ramp over
    the cell's random value), dark raised lead cames on the cell edges and a
    little hand-made brightness variation.  warm = (cx, cz, radius, amount)
    pushes cells inside that circle toward the end of the palette."""
    if name in G.mats:
        return G.mats[name]
    m = bpy.data.materials.new(name)
    nt = m.node_tree
    nt.nodes.clear()
    out = nn(nt, "ShaderNodeOutputMaterial")
    bsdf = nn(nt, "ShaderNodeBsdfPrincipled")
    ln(nt, bsdf.outputs[0], out.inputs["Surface"])
    I = bsdf.inputs
    I["Roughness"].default_value = 0.35
    tc = nn(nt, "ShaderNodeTexCoord")
    vec = mapping(nt, tc.outputs["Object"], scale=(1.0, 1.0, 0.75))
    vo = nn(nt, "ShaderNodeTexVoronoi", {"Scale": scale}, feature="F1")
    ln(nt, vec, vo.inputs["Vector"])
    scol = nn(nt, "ShaderNodeSeparateColor")
    ln(nt, vo.outputs["Color"], scol.inputs[0])
    fac = scol.outputs[0]
    if warm:
        cx, cz, rr, amt = warm
        sep = nn(nt, "ShaderNodeSeparateXYZ")
        ln(nt, tc.outputs["Object"], sep.inputs[0])
        cb = nn(nt, "ShaderNodeCombineXYZ")
        ln(nt, math_node(nt, "SUBTRACT", sep.outputs["X"], cx), cb.inputs["X"])
        ln(nt, math_node(nt, "SUBTRACT", sep.outputs["Z"], cz), cb.inputs["Z"])
        L = nn(nt, "ShaderNodeVectorMath", operation="LENGTH")
        ln(nt, cb.outputs[0], L.inputs[0])
        mask = math_node(nt, "LESS_THAN", L.outputs["Value"], rr)
        fac = math_node(nt, "ADD", math_node(nt, "MULTIPLY", fac, 1.0 - amt),
                        math_node(nt, "MULTIPLY", mask, amt))
    r = nt.nodes.new("ShaderNodeValToRGB")
    cr = r.color_ramp
    cr.interpolation = "CONSTANT"
    cr.elements[0].position = 0.0
    cr.elements[0].color = (*palette[0], 1)
    cr.elements[1].position = 1.0
    cr.elements[1].color = (*palette[-1], 1)
    n = len(palette)
    for i in range(1, n - 1):
        cr.elements.new(i / n).color = (*palette[i], 1)
    cr.elements[-1].position = (n - 1) / n
    ln(nt, fac, r.inputs["Fac"])
    col = r.outputs["Color"]
    vo2 = nn(nt, "ShaderNodeTexVoronoi", {"Scale": scale}, feature="DISTANCE_TO_EDGE")
    ln(nt, vec, vo2.inputs["Vector"])
    leadm = nn(nt, "ShaderNodeMapRange", {"From Min": lead * 0.55, "From Max": lead,
                                          "To Min": 1.0, "To Max": 0.0})
    ln(nt, vo2.outputs["Distance"], leadm.inputs["Value"])
    nz = noise(nt, vec, 5.0, 4.0)
    br = nn(nt, "ShaderNodeMapRange", {"From Min": 0.3, "From Max": 0.7,
                                       "To Min": 0.6, "To Max": 1.3})
    ln(nt, nz.outputs["Fac"], br.inputs["Value"])
    glass_f = math_node(nt, "SUBTRACT", 1.0, leadm.outputs["Result"])
    ln(nt, math_node(nt, "MULTIPLY", math_node(nt, "MULTIPLY", glass_f, br.outputs["Result"]),
                     strength), I["Emission Strength"])
    ln(nt, col, I["Emission Color"])
    bc = nn(nt, "ShaderNodeMix", data_type="RGBA")
    ln(nt, leadm.outputs["Result"], bc.inputs["Factor"])
    dim = nn(nt, "ShaderNodeMix", data_type="RGBA", blend_type="MULTIPLY")
    dim.inputs["Factor"].default_value = 1.0
    ln(nt, col, dim.inputs[6])
    dim.inputs[7].default_value = (0.3, 0.3, 0.3, 1)
    ln(nt, dim.outputs[2], bc.inputs[6])
    bc.inputs[7].default_value = (0.03, 0.03, 0.035, 1)
    ln(nt, bc.outputs[2], I["Base Color"])
    ln(nt, leadm.outputs["Result"], I["Metallic"])
    bn = nn(nt, "ShaderNodeBump", {"Strength": 0.6, "Distance": 0.02})
    ln(nt, leadm.outputs["Result"], bn.inputs["Height"])
    ln(nt, bn.outputs["Normal"], I["Normal"])
    G.mats[name] = m
    return m


def M_void(name, glow=(0.02, 0.07, 0.05), center=(0.0, 0.5), radius=0.7, strength=1.0):
    """Near-black opening with a faint radial glow deep inside (tunnels)."""
    if name in G.mats:
        return G.mats[name]
    m = bpy.data.materials.new(name)
    nt = m.node_tree
    nt.nodes.clear()
    out = nn(nt, "ShaderNodeOutputMaterial")
    bsdf = nn(nt, "ShaderNodeBsdfPrincipled")
    ln(nt, bsdf.outputs[0], out.inputs["Surface"])
    I = bsdf.inputs
    I["Base Color"].default_value = (0.003, 0.004, 0.004, 1)
    I["Roughness"].default_value = 0.9
    tc = nn(nt, "ShaderNodeTexCoord")
    sep = nn(nt, "ShaderNodeSeparateXYZ")
    ln(nt, tc.outputs["Object"], sep.inputs[0])
    cb = nn(nt, "ShaderNodeCombineXYZ")
    ln(nt, math_node(nt, "SUBTRACT", sep.outputs["X"], center[0]), cb.inputs["X"])
    ln(nt, math_node(nt, "SUBTRACT", sep.outputs["Z"], center[1]), cb.inputs["Z"])
    L = nn(nt, "ShaderNodeVectorMath", operation="LENGTH")
    ln(nt, cb.outputs[0], L.inputs[0])
    f = math_node(nt, "DIVIDE", L.outputs["Value"], radius)
    col = ramp(nt, f, [(0.0, glow), (1.0, (0, 0, 0))])
    ln(nt, col, I["Emission Color"])
    I["Emission Strength"].default_value = strength
    G.mats[name] = m
    return m


# ---- extra geometry helpers -------------------------------------------------------
def round_profile(R, zc, neck_r, neck_top, lip=0.03, n=18):
    """(r, z) profile of a round-bottomed flask: sphere R at zc + neck + lip."""
    at = math.acos(min(neck_r / R, 0.999))
    pts = [(0.0, zc - R)]
    for i in range(1, n + 1):
        a = -math.pi / 2 + (at + math.pi / 2) * i / n
        pts.append((R * math.cos(a), zc + R * math.sin(a)))
    pts += [(neck_r, neck_top - lip), (neck_r * 1.3, neck_top - lip * 0.5),
            (neck_r * 1.22, neck_top)]
    return pts


def vessel(profile, glass, liquid=None, fill_z=None, thick=0.016, gap=0.004, seg=40,
           loc=(0, 0, 0), smooth=True, rot=(0, 0, 0)):
    """Glass vessel (open lathe + solidify) with an optional liquid body filled
    up to fill_z (profile coordinates)."""
    with sub(loc=loc, rot=rot):
        g = lathe(profile, glass, seg=seg, cap=False, name="glass", smooth=smooth)
        solidify(g, thick, offset=-1.0)
        if liquid is not None and fill_z is not None:
            zb = profile[0][1] + thick + gap
            inner = []
            prev = None
            for (r, z) in profile:
                if z <= fill_z:
                    inner.append((max(r - thick - gap, 0.0), max(z, zb)))
                elif prev is not None:
                    r0, z0 = prev
                    t = (fill_z - z0) / max(z - z0, 1e-9)
                    inner.append((max(r0 + (r - r0) * t - thick - gap, 0.0), fill_z))
                    break
                prev = (r, z)
            inner.append((0.0, fill_z))
            lathe(inner, liquid, seg=seg, name="liquid", smooth=smooth)
    return g


def cork(x, y, z, r, h, mat=None):
    mat = mat or pbr("cork", (0.45, 0.3, 0.16), rough=0.85, bump=0.6, bump_scale=60)
    return cyl(r, h, mat, loc=(x, y, z + h / 2), r2=r * 1.15, seg=20, name="cork")


def helix(r, z0, z1, turns, wire, mat, cx=0.0, cy=0.0, per_turn=24, name="helix", a0=0.0):
    n = max(int(turns * per_turn), 8)
    pts = [(cx + r * math.cos(a0 + TAU * turns * i / n), cy + r * math.sin(a0 + TAU * turns * i / n),
            z0 + (z1 - z0) * i / n) for i in range(n + 1)]
    return sweep(pts, wire, mat, segs=8, name=name)


def bolt(p0, p1, rng, mat, halo=None, n=9, jag=0.07, r=0.009, branches=1, depth=0):
    """Jagged lightning bolt (emissive tube + optional soft glow shell)."""
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    perp = Vector((-d.z, 0.0, d.x))
    if perp.length < 1e-6:
        perp = Vector((1, 0, 0))
    perp.normalize()
    pts = [p0]
    for i in range(1, n):
        t = i / n
        env = math.sin(math.pi * t)
        pts.append(p0 + d * t + perp * rng.uniform(-jag, jag) * (0.4 + env)
                   + Vector((0, rng.uniform(-jag, jag) * 0.4, 0)))
    pts.append(p1)
    sweep(pts, lambda s: r * (1.0 - 0.55 * s), mat, segs=6, name="bolt")
    if halo is not None:
        h = sweep(pts, lambda s: r * 4.0 * (1.0 - 0.5 * s), halo, segs=8, name="bolthalo")
        h["noframe"] = True
    if depth < 1:
        for _ in range(branches):
            k = rng.randint(2, n - 3)
            q0 = pts[k]
            dd = (p1 - q0) * rng.uniform(0.35, 0.6)
            q1 = q0 + dd + perp * rng.uniform(-1, 1) * d.length * 0.25
            bolt(q0, q1, rng, mat, halo, n=5, jag=jag * 0.6, r=r * 0.6, branches=0,
                 depth=depth + 1)
    return pts


def prof_r(prof, z):
    """Radius of a monotone (in z) lathe profile at height z."""
    for (r0, z0), (r1, z1) in zip(prof[:-1], prof[1:]):
        if z0 <= z <= z1 and z1 > z0:
            return r0 + (r1 - r0) * (z - z0) / (z1 - z0)
    return prof[-1][0]


def lancet(w, zb, zs, d=0.0, n=14):
    """Equilateral pointed-arch outline (x, z) of half-width w, springing at
    zs, offset outward by d (concentric moulding)."""
    R = 2 * w + d
    hw = w + d
    ta = math.acos(w / R)
    half = [(0.0, zb), (hw, zb)]
    for i in range(n + 1):
        th = ta * i / n
        half.append((-w + R * math.cos(th), zs + R * math.sin(th)))
    half[-1] = (0.0, half[-1][1])
    return mirror_x(half)


def lancet_arc(w, zs, d=0.0, n=16, y=0.0, cx=0.0):
    """3D points along the arched part of a lancet (left springing -> apex ->
    right springing)."""
    R = 2 * w + d
    ta = math.acos(w / R)
    right = [(cx - w + R * math.cos(ta * i / n), y, zs + R * math.sin(ta * i / n))
             for i in range(n + 1)]
    left = [(2 * cx - x, yy, z) for (x, yy, z) in reversed(right[:-1])]
    return left + right[::-1]


def rock(loc, r, mat, scale=(1, 1, 1), seed=0, strength=0.35, rot=(0, 0, 0), subdiv=3,
         name="rock"):
    ob = ico(r, mat, loc=loc, subdiv=subdiv, scale=scale, rot=rot, name=name)
    tex = bpy.data.textures.new("rockdisp", "CLOUDS")
    tex.noise_scale = 0.5 * r
    tex.noise_depth = 3
    md = ob.modifiers.new("Disp", "DISPLACE")
    md.texture = tex
    md.strength = strength * r
    md.texture_coords = "LOCAL"
    if seed:
        e = bpy.data.objects.new("dispctl", None)
        G.coll.objects.link(e)
        e.location = (seed * 1.7, seed * 0.9, seed * 2.3)
        md.texture_coords = "OBJECT"
        md.texture_coords_object = e
        e["noframe"] = True
    return ob


def octa(r, h, mat, loc, rot=(0, 0, 0), name="shard"):
    return lathe([(0.0, -h), (r, 0.0), (0.0, h)], mat, seg=4, smooth=False, loc=loc, rot=rot,
                 name=name)


def icicle(x, y, z, length, r, mat, rng, lean=0.0):
    """Rippled hanging icicle whose root is at z (points down)."""
    n = 14
    ph = rng.uniform(0, TAU)
    prof = [(0.0, -length)]
    for i in range(1, n + 1):
        t = i / n
        rr = r * t ** 0.85 * (1 + 0.14 * math.sin(t * 22 + ph))
        prof.append((rr, -length * (1 - t)))
    prof.append((0.0, 0.0))
    ob = lathe(prof, mat, seg=10, loc=(x, y, z), rot=(0, rad(lean), 0), name="icicle")
    return ob


# =============================================================================
#  ALCHEMY LAB
# =============================================================================
@item("deco_lab_alembic", (120, 144))
def build_lab_alembic():
    wood = M_darkwood()
    iron = M_wrought()
    brass = M_brass()
    copper = M_copper()
    glass = M_glass("alglass", (0.88, 1.0, 0.92))
    green = M_liquid("algreen", (0.2, 1.0, 0.3), emit_str=2.0, trans=0.4)
    red = M_liquid("alred", (1.0, 0.1, 0.08), emit_str=1.5, trans=0.4)
    corkm = pbr("cork", (0.45, 0.3, 0.16), rough=0.85, bump=0.6, bump_scale=60)
    # workbench board with iron end caps
    box((1.74, 0.8, 0.14), wood, loc=(0, 0, 0.07), bev=0.02, name="board")
    for sx in (-1, 1):
        box((0.08, 0.84, 0.16), iron, loc=(sx * 0.86, 0, 0.08), bev=0.01, name="cap")
        for z in (0.04, 0.12):
            sphere(0.014, iron, loc=(sx * 0.86, -0.425, z), scale=(1, 0.6, 1), seg=10, rings=6)
    # spirit burner with a blue flame
    bx = -0.3
    lathe([(0.0, 0.14), (0.14, 0.14), (0.15, 0.17), (0.11, 0.24), (0.05, 0.27),
           (0.045, 0.31), (0.0, 0.31)], brass, seg=32, loc=(bx, 0, 0), name="burner")
    blue = M_flame("blueflame", core=(0.55, 0.75, 1.0), mid=(0.25, 0.4, 1.0),
                   tip=(0.9, 0.35, 0.1), strength=3.0)
    flame((bx, 0, 0.3), 0.2, mat=blue, power=12)
    # tripod
    ring_z = 0.64
    torus(0.22, 0.02, iron, loc=(bx, 0, ring_z), seg=40, rseg=8)
    for k in range(3):
        a = math.pi / 2 + TAU * k / 3
        c, s_ = math.cos(a), math.sin(a)
        sweep([(bx + 0.34 * c, 0.34 * s_, 0.14), (bx + 0.28 * c, 0.28 * s_, 0.4),
               (bx + 0.22 * c, 0.22 * s_, ring_z)], 0.017, iron, segs=8, name="leg")
    # cucurbit (boiling flask)
    R = 0.34
    zc = ring_z + math.sqrt(R * R - 0.22 * 0.22)
    top = zc + 0.5
    vessel(round_profile(R, zc, 0.09, top), glass, green, fill_z=zc + 0.06, loc=(bx, 0, 0))
    rng = random.Random(4)
    bub = pbr("albub", (0.7, 1.0, 0.75), rough=0.02, trans=1.0, ior=1.1,
              emit=(0.5, 1.0, 0.5), emit_str=0.8)
    for i in range(12):
        a = rng.uniform(0, TAU)
        rr = rng.uniform(0.02, 0.24)
        sphere(rng.uniform(0.012, 0.03), bub,
               loc=(bx + rr * math.cos(a), rr * math.sin(a) - 0.05, rng.uniform(zc - 0.2, zc + 0.05)),
               seg=10, rings=6)
    # copper still head
    lathe([(0.0, top - 0.12), (0.105, top - 0.12), (0.105, top), (0.17, top + 0.05),
           (0.22, top + 0.14), (0.22, top + 0.24), (0.15, top + 0.33), (0.07, top + 0.37),
           (0.045, top + 0.42), (0.07, top + 0.45), (0.0, top + 0.48)], copper, seg=40,
          loc=(bx, 0, 0), name="head")
    torus(0.225, 0.016, brass, loc=(bx, 0, top + 0.19), seg=48, rseg=8)
    torus(0.11, 0.014, brass, loc=(bx, 0, top - 0.005), seg=32, rseg=6)
    # beak -> receiver, with a brass cooling jacket
    rx = 0.5
    beak = catmull([(bx + 0.18, 0, top + 0.2), (bx + 0.42, 0, top + 0.13), (rx - 0.1, 0, 1.0),
                    (rx, 0, 0.8)], 8)
    sweep(beak, lambda t: 0.042 - 0.018 * t, copper, segs=12, name="beak")
    sweep(beak[9:16], 0.07, brass, segs=16, name="jacket")
    for p in (beak[9], beak[15]):
        sphere(0.075, brass, loc=p, scale=(1, 1, 0.5), seg=16, rings=8)
    # receiver flask in a cork ring
    R2 = 0.24
    zc2 = 0.14 + 0.05 + R2 * 0.95
    torus(0.13, 0.04, corkm, loc=(rx, 0, 0.18), seg=32, rseg=10, rz=0.8)
    vessel(round_profile(R2, zc2, 0.065, 0.9), glass, green, fill_z=zc2 - 0.03, loc=(rx, 0, 0))
    sphere(0.022, green, loc=(rx, 0, 0.66), scale=(1, 1, 1.3), seg=12, rings=8, name="drop")
    # small red phial in front
    vessel(round_profile(0.08, 0.22, 0.025, 0.4), glass, red, fill_z=0.22, loc=(0.14, -0.22, 0))
    cork(0.14, -0.22, 0.39, 0.03, 0.05, corkm)
    point_light((bx, -0.25, zc), (0.3, 1.0, 0.35), 30, 0.2)
    point_light((rx, -0.25, zc2), (0.3, 1.0, 0.35), 12, 0.15)
    point_light((0.14, -0.35, 0.25), (1.0, 0.15, 0.1), 4, 0.1)
    view(pitch=7, fill=0.95, glow=0.8, glow_beauty=0.25)


@item("deco_lab_cauldron", (120, 96))
def build_lab_cauldron():
    iron = pbr("cauldron", (0.09, 0.085, 0.085), metal=1, rough=0.42, noise_rough=0.15,
               pattern="rust", rust=(0.22, 0.1, 0.04), scale=3.0)
    brew = pbr("brew", (0.3, 0.95, 0.08), rough=0.12, emit=(0.4, 1.0, 0.1), emit_str=2.4,
               sss=0.2, sss_radius=(0.4, 1.0, 0.2), coat=0.5)
    foam = pbr("foam", (0.6, 1.0, 0.4), rough=0.15, emit=(0.5, 1.0, 0.25), emit_str=1.4,
               trans=0.35, ior=1.2)
    outer = [(0.0, 0.3), (0.28, 0.31), (0.52, 0.4), (0.68, 0.56), (0.76, 0.76), (0.75, 0.94),
             (0.69, 1.1), (0.61, 1.2), (0.6, 1.26), (0.64, 1.3), (0.66, 1.34)]
    lathe(outer + [(0.63, 1.37), (0.56, 1.36), (0.54, 1.2), (0.0, 1.2)], iron, seg=64,
          name="pot")
    torus(0.64, 0.045, iron, loc=(0, 0, 1.35), seg=64, rseg=12)
    torus(0.765, 0.026, iron, loc=(0, 0, 0.85), seg=64, rseg=8, rz=1.8)
    for k in range(16):
        a = TAU * k / 16
        sphere(0.018, iron, loc=(0.79 * math.cos(a), 0.79 * math.sin(a), 0.85), seg=8, rings=4)
    for sx in (-1, 1):
        box((0.12, 0.12, 0.12), iron, loc=(sx * 0.68, 0, 1.2), bev=0.02, name="lug")
        torus(0.11, 0.024, iron, loc=(sx * 0.78, 0, 1.08), rot=(rad(90), 0, 0), seg=32, rseg=8)
    for k in range(3):
        a = math.pi / 2 + TAU * k / 3
        c, s_ = math.cos(a), math.sin(a)
        pts = catmull([(0.42 * c, 0.42 * s_, 0.44), (0.56 * c, 0.56 * s_, 0.26),
                       (0.6 * c, 0.6 * s_, 0.08)], 6)
        sweep(pts, lambda t: 0.075 - 0.025 * t, iron, segs=12, name="leg")
        sphere(0.075, iron, loc=(0.62 * c, 0.62 * s_, 0.05), scale=(1.2, 1.2, 0.7), seg=16,
               rings=8)
        for d in (-1, 0, 1):
            ca = a + d * 0.12
            cone(0.025, 0.08, iron, loc=(0.66 * math.cos(ca), 0.66 * math.sin(ca), 0.03),
                 rot=(0, rad(90), ca), seg=6)
    # fire under the pot
    char = pbr("charwood", (0.06, 0.035, 0.02), rough=0.85, pattern="veins",
               vein_color=(1.0, 0.35, 0.05), density=5.0, width=0.05, strength=5.0)
    for (ang, y) in ((18, -0.1), (-22, 0.0), (85, 0.05)):
        cyl(0.065, 0.95, char, loc=(0, y, 0.07), rot=(0, rad(90), rad(ang)), seg=12, name="log")
    embers = M_glow("embers", (1.0, 0.3, 0.04), 3.0)
    ico(0.3, embers, loc=(0, 0, 0.05), subdiv=2, scale=(1.2, 0.8, 0.15))
    for (x, h, lean) in ((-0.3, 0.26, -12), (0.0, 0.3, 0), (0.28, 0.27, 12), (-0.14, 0.22, -4),
                         (0.15, 0.24, 6)):
        flame((x, -0.28, 0.08), h, lean=lean, power=16)
    # brew surface, bubbles, foam
    lathe([(0.0, 1.24), (0.56, 1.24), (0.565, 1.31), (0.4, 1.35), (0.0, 1.37)], brew, seg=64,
          name="brew")
    rng = random.Random(11)
    for i in range(16):
        a = rng.uniform(math.pi * 1.05, math.pi * 1.95) if i < 10 else rng.uniform(0, TAU)
        rr = rng.uniform(0.05, 0.5)
        r = rng.uniform(0.035, 0.09)
        sphere(r, foam if i % 3 else brew, loc=(rr * math.cos(a), rr * math.sin(a) * 0.8,
                                               1.33 + r * 0.35), seg=16, rings=8, name="bubble")
    sphere(0.13, foam, loc=(0.2, -0.12, 1.4), seg=24, rings=12, name="bigbubble")
    # overflow drips down the outside
    for (adeg, L) in ((-65, 0.34), (-100, 0.2), (-128, 0.42), (-30, 0.16)):
        a = rad(adeg)
        pts = []
        for i in range(9):
            t = i / 8
            z = 1.37 - (0.05 + L) * t
            r = (prof_r(outer, z) if z < 1.34 else 0.68) + 0.022
            pts.append((r * math.cos(a), r * math.sin(a), z))
        sweep(pts, lambda t: 0.028 * (1 - 0.25 * t), brew, segs=10, name="drip")
        sphere(0.03, brew, loc=pts[-1], scale=(1, 1, 1.3), seg=12, rings=8)
    # stirring paddle
    wood = M_wood((0.35, 0.2, 0.1), "paddle")
    sweep([(-0.1, 0.12, 1.1), (-0.58, 0.0, 1.62)], 0.03, wood, segs=10, name="paddle")
    for (x, z, r) in ((0.1, 1.5, 0.11), (-0.2, 1.58, 0.09), (0.32, 1.54, 0.08)):
        s = sphere(r, M_glowshell("steam", (0.4, 1.0, 0.3), 0.6, 1.6), loc=(x, -0.1, z),
                   seg=16, rings=8)
        s["noframe"] = True
    point_light((0, -0.3, 1.52), (0.4, 1.0, 0.2), 45, 0.3)
    view(pitch=9, fill=0.95, glow=0.8)


def _bottle(x, z0, kind, liq, glass, y=0.0, s=1.0, fill=0.6, corkit=True, corkm=None,
            seg=36):
    """Glass bottles for shelves.  Returns the top z."""
    smooth, rot = True, (0, 0, 0)
    if kind == "round":
        R = 0.2 * s
        prof = round_profile(R, R, 0.05 * s, 0.56 * s)
    elif kind == "tall":
        prof = [(0.0, 0.0), (0.1 * s, 0.0), (0.11 * s, 0.02 * s), (0.11 * s, 0.4 * s),
                (0.06 * s, 0.49 * s), (0.036 * s, 0.52 * s), (0.036 * s, 0.62 * s),
                (0.046 * s, 0.64 * s)]
    elif kind == "square":
        prof = [(0.0, 0.0), (0.13 * s, 0.0), (0.14 * s, 0.02 * s), (0.14 * s, 0.38 * s),
                (0.06 * s, 0.46 * s), (0.036 * s, 0.48 * s), (0.036 * s, 0.56 * s),
                (0.046 * s, 0.58 * s)]
        seg, smooth, rot = 4, False, (0, 0, rad(45))
    elif kind == "cone":
        prof = [(0.0, 0.0), (0.17 * s, 0.0), (0.18 * s, 0.02 * s), (0.05 * s, 0.33 * s),
                (0.05 * s, 0.44 * s), (0.062 * s, 0.46 * s)]
    elif kind == "jar":
        prof = [(0.0, 0.0), (0.15 * s, 0.0), (0.16 * s, 0.02 * s), (0.16 * s, 0.34 * s),
                (0.13 * s, 0.38 * s), (0.13 * s, 0.4 * s)]
    elif kind == "tube":
        prof = [(0.0, 0.0), (0.022 * s, 0.006 * s), (0.034 * s, 0.03 * s), (0.036 * s, 0.05 * s),
                (0.036 * s, 0.4 * s), (0.044 * s, 0.41 * s)]
        seg = 16
    zmax = prof[-1][1]
    vessel(prof, glass, liq, zmax * fill if liq is not None else None, loc=(x, y, z0), seg=seg,
           smooth=smooth, rot=rot, thick=0.012 if kind == "tube" else 0.016)
    top = z0 + zmax
    if corkit and kind in ("round", "tall", "square", "cone"):
        r = prof[-1][0] * 0.85
        cork(x, y, top - 0.04 * s, r, 0.08 * s, corkm)
        top += 0.04 * s
    return top


@item("deco_lab_flaskrack", (144, 120))
def build_lab_flaskrack():
    wood = M_wood((0.3, 0.16, 0.07), "rackwood", axis="X", grain=1.2)
    dark = M_wood((0.1, 0.05, 0.025), "rackback", axis="Z")
    iron = M_wrought()
    brass = M_brass()
    glass = M_glass("rackglass", (0.92, 1.0, 0.96))
    dglass = pbr("darkglass", (0.1, 0.3, 0.12), rough=0.05, trans=0.8, ior=1.5)
    corkm = pbr("cork", (0.45, 0.3, 0.16), rough=0.85, bump=0.6, bump_scale=60)
    cols = dict(red=(1.0, 0.08, 0.06), blue=(0.1, 0.4, 1.0), green=(0.2, 1.0, 0.3),
                violet=(0.65, 0.15, 1.0), amber=(1.0, 0.55, 0.08))
    L = {k: M_liquid("liq_" + k, c, emit_str=1.6, trans=0.45) for k, c in cols.items()}
    W, D = 2.3, 0.46
    for sx in (-1, 1):
        box((0.09, D, 1.72), wood, loc=(sx * 1.1, 0, 0.86), bev=0.015, name="upright")
        lathe([(0.0, 1.72), (0.055, 1.72), (0.065, 1.76), (0.035, 1.8), (0.05, 1.85),
               (0.0, 1.92)], wood, seg=12, loc=(sx * 1.1, -0.16, 0), name="finial")
    shelves = (0.05, 0.84, 1.64)
    for z in shelves:
        box((W, D + 0.04, 0.055), wood, loc=(0, 0, z), bev=0.012, name="shelf")
    box((W - 0.1, 0.03, 1.66), dark, loc=(0, D / 2 - 0.02, 0.86), name="back")
    for z in shelves[1:]:
        for sx in (-1, 1):
            sweep([(sx * 1.05, -0.2, z - 0.2), (sx * 1.05, -0.2, z - 0.03),
                   (sx * 0.88, -0.2, z - 0.03)], 0.012, iron, segs=6, name="bracket")
    z0, z1, z2 = (z + 0.0275 for z in shelves)
    # ---- bottom shelf
    skull((-0.86, -0.02, z0 + 0.39 * 0.3), 0.3, M_bone())
    _bottle(-0.52, z0, "square", L["green"], glass, s=1.05, corkm=corkm)
    _bottle(-0.14, z0, "round", L["red"], glass, s=1.0, corkm=corkm)
    _bottle(0.24, z0, "jar", L["amber"], glass, s=1.05, fill=0.85)
    cyl(0.145, 0.04, iron, loc=(0.24, 0, z0 + 0.44), seg=24)
    sphere(0.03, brass, loc=(0.24, 0, z0 + 0.475), seg=12, rings=6)
    eye = pbr("jareye", (0.9, 0.85, 0.75), rough=0.3, pattern="eye", iris=0.5, glow=1.5)
    sphere(0.07, eye, loc=(0.24, -0.02, z0 + 0.2), rot=(0, 0, rad(10)), seg=24, rings=12)
    zz = z0
    for i, (c, h) in enumerate((((0.3, 0.05, 0.04), 0.07), ((0.06, 0.2, 0.1), 0.06))):
        box((0.36, 0.28, h), pbr("rbook%d" % i, c, rough=0.5, coat=0.2), loc=(0.58, 0, zz + h / 2),
            rot=(0, 0, rad(6 - 12 * i)), bev=0.012, name="book")
        zz += h
    _bottle(0.6, z0 + 0.13, "tube", L["violet"], glass, s=0.55, fill=0.7)
    _bottle(0.88, z0, "cone", L["blue"], glass, s=1.0, corkm=corkm)
    # ---- middle shelf
    box((0.46, 0.14, 0.035), wood, loc=(-0.78, -0.04, z1 + 0.16), bev=0.006)
    box((0.46, 0.14, 0.03), wood, loc=(-0.78, -0.04, z1 + 0.015), bev=0.006)
    for sx in (-1, 1):
        box((0.03, 0.14, 0.16), wood, loc=(-0.78 + sx * 0.215, -0.04, z1 + 0.09))
    for i, k in enumerate(("red", "green", "blue", "violet", "amber")):
        _bottle(-0.96 + 0.09 * i, z1 + 0.03, "tube", L[k], glass, y=-0.04, s=0.95,
                fill=0.45 + 0.08 * (i % 3))
    _bottle(-0.36, z1, "tall", L["violet"], glass, s=1.0, corkm=corkm)
    torus(0.1, 0.03, corkm, loc=(0.02, 0, z1 + 0.03), seg=24, rseg=8, rz=0.8)
    _bottle(0.02, z1 + 0.02, "round", L["amber"], glass, s=0.8, corkm=corkm)
    stone = M_stone("mortar", (0.45, 0.43, 0.4), scale=6.0)
    lathe([(0.0, z1), (0.11, z1), (0.14, z1 + 0.05), (0.15, z1 + 0.12), (0.12, z1 + 0.12),
           (0.1, z1 + 0.07), (0.0, z1 + 0.06)], stone, seg=32, loc=(0.36, 0, 0), name="mortar")
    cyl(0.022, 0.26, stone, loc=(0.4, 0, z1 + 0.18), rot=(0, rad(24), 0), r2=0.035, seg=12)
    candle((0.64, -0.04, z1), 0.05, 0.2, drip_seed=3, flame_h=0.16, power=14)
    # hourglass
    hx = 0.9
    for zz in (z1 + 0.015, z1 + 0.37):
        cyl(0.11, 0.03, brass, loc=(hx, 0, zz), seg=24, bev=0.006)
    for k in range(3):
        a = TAU * k / 3 + 0.5
        cyl(0.011, 0.35, brass, loc=(hx + 0.09 * math.cos(a), 0.09 * math.sin(a), z1 + 0.19), seg=8)
    hg = [(0.0, 0.0), (0.07, 0.01), (0.08, 0.06), (0.05, 0.13), (0.012, 0.17), (0.05, 0.21),
          (0.08, 0.28), (0.07, 0.33), (0.0, 0.34)]
    lathe(hg, glass, seg=24, loc=(hx, 0, z1 + 0.03), name="hourglass")
    sand = pbr("sand", (0.95, 0.7, 0.35), rough=0.8, emit=(1.0, 0.55, 0.15), emit_str=0.25)
    lathe([(0.0, 0.015), (0.06, 0.02), (0.07, 0.05), (0.0, 0.1)], sand, seg=24,
          loc=(hx, 0, z1 + 0.03))
    lathe([(0.0, 0.2), (0.055, 0.22), (0.07, 0.26), (0.0, 0.26)], sand, seg=24,
          loc=(hx, 0, z1 + 0.03))
    # ---- on top
    _bottle(-0.7, z2, "jar", L["violet"], dglass, s=0.8, fill=0.7)
    cyl(0.11, 0.035, iron, loc=(-0.7, 0, z2 + 0.335), seg=24)
    parch = M_parchment()
    cyl(0.05, 0.42, parch, loc=(-0.12, -0.05, z2 + 0.05), rot=(0, rad(90), rad(8)), seg=20)
    cyl(0.045, 0.36, parch, loc=(-0.08, 0.05, z2 + 0.14), rot=(0, rad(90), rad(-12)), seg=20)
    torus(0.055, 0.008, pbr("ribbon", (0.5, 0.03, 0.04), rough=0.6), loc=(-0.1, -0.05, z2 + 0.05),
          rot=(0, rad(90), rad(8)), seg=20, rseg=6)
    _bottle(0.4, z2, "tall", None, dglass, s=0.62, corkm=pbr("seal", (0.5, 0.02, 0.03), rough=0.3))
    _bottle(0.62, z2, "round", L["green"], glass, s=0.55, corkm=corkm)
    candle((0.9, 0, z2), 0.055, 0.14, drip_seed=9, flame_h=0.16, power=14)
    for (x, z, k) in ((-0.14, z0 + 0.2, "red"), (0.88, z0 + 0.15, "blue"), (-0.36, z1 + 0.3, "violet"),
                      (-0.52, z0 + 0.2, "green"), (-0.8, z1 + 0.2, "green")):
        point_light((x, -0.35, z), cols[k], 5, 0.1)
    view(pitch=7, fill=0.95, glow=0.7, glow_beauty=0.2)


@item("deco_lab_tesla", (96, 192))
def build_lab_tesla():
    stone = M_stone("teslastone", (0.22, 0.21, 0.24), scale=4.0)
    brass = M_brass()
    cop = M_copper("coil", patina=False)
    ceramic = pbr("ceramic", (0.16, 0.05, 0.04), rough=0.25, coat=0.6, coat_rough=0.1)
    rune = M_glow("rune", (0.65, 0.3, 1.0), 5.0)
    arc = M_glow("arc", (0.75, 0.8, 1.0), 16.0, base=(0.8, 0.85, 1.0))
    halo = M_glowshell("archalo", (0.55, 0.35, 1.0), 2.5, 1.0)
    polished = pbr("polished", (0.88, 0.88, 0.94), metal=1, rough=0.12)
    lathe([(0.0, 0.0), (0.46, 0.0), (0.46, 0.07), (0.41, 0.1), (0.38, 0.26), (0.43, 0.29),
           (0.43, 0.34), (0.0, 0.34)], stone, seg=8, smooth=False, rot=(0, 0, rad(22.5)),
          name="base")
    for z, R in ((0.3, 0.435), (0.08, 0.465)):
        torus(R, 0.018, brass, loc=(0, 0, z), seg=8, rseg=6,
              rot=(0, 0, rad(22.5)))
    fy = -0.38 * math.cos(math.pi / 8)
    with sub(loc=(0, fy - 0.005, 0.18), rot=(rad(90), 0, 0)):
        cyl(0.09, 0.02, brass, seg=32)
    extrude(shape_star(5, 0.07, 0.028), 0.012, rune, loc=(0, fy - 0.022, 0.18), name="sigil")
    for sx in (-1, 1):
        extrude([(-0.012, -0.05), (0.012, -0.05), (0.012, 0.05), (-0.012, 0.05)], 0.01, rune,
                loc=(sx * 0.2, fy + 0.05, 0.18), rot=(0, 0, rad(-45 * sx)), name="runebar")
    for k in range(4):
        a = TAU * k / 4 + TAU / 8
        cyl(0.025, 0.26, ceramic, loc=(0.3 * math.cos(a), 0.3 * math.sin(a), 0.47), seg=12)
        sphere(0.03, brass, loc=(0.3 * math.cos(a), 0.3 * math.sin(a), 0.61), seg=12, rings=6)
    helix(0.3, 0.4, 0.58, 3.0, 0.022, cop, per_turn=40)
    cyl(0.1, 1.2, ceramic, loc=(0, 0, 0.94), seg=32)
    helix(0.107, 0.47, 1.41, 34, 0.0075, cop, per_turn=20)
    for z in (0.44, 1.45):
        torus(0.11, 0.02, brass, loc=(0, 0, z), seg=32, rseg=8)
    cyl(0.035, 0.1, brass, loc=(0, 0, 1.58), seg=16)
    torus(0.24, 0.075, polished, loc=(0, 0, 1.64), seg=48, rseg=16, name="toroid")
    torus(0.2, 0.008, rune, loc=(0, 0, 1.08), rot=(rad(14), rad(8), 0), seg=48, rseg=6)
    torus(0.23, 0.008, rune, loc=(0, 0, 0.8), rot=(rad(-10), rad(-6), 0), seg=48, rseg=6)
    cyl(0.018, 0.12, brass, loc=(0, 0, 1.73), seg=12)
    orb = M_glow("orb", (0.75, 0.6, 1.0), 7.0, base=(0.8, 0.7, 1.0))
    sphere(0.085, orb, loc=(0, 0, 1.8), seg=24, rings=12)
    h = sphere(0.16, halo, loc=(0, 0, 1.8), seg=24, rings=12)
    h["noframe"] = True
    rng = random.Random(21)
    for p1 in ((-0.46, -0.08, 1.98), (0.46, -0.05, 1.72), (-0.44, 0.0, 1.46), (0.18, -0.1, 2.06),
               (-0.12, -0.1, 2.04), (0.44, 0.02, 1.36)):
        bolt((0, -0.02, 1.8), p1, rng, arc, halo, n=9, jag=0.06, r=0.009)
    for p0, p1 in (((-0.3, 0, 1.64), (-0.45, -0.1, 1.2)), ((0.3, 0, 1.66), (0.46, -0.1, 1.98))):
        bolt(p0, p1, rng, arc, halo, n=7, jag=0.05, r=0.007, branches=0)
    point_light((0, -0.3, 1.8), (0.6, 0.6, 1.0), 70, 0.15)
    point_light((0, -0.6, 0.2), (0.6, 0.3, 1.0), 6, 0.1)
    view(pitch=6, fill=0.95, glow=0.9)


# =============================================================================
#  WATERWAY
# =============================================================================
@item("deco_water_grate", (144, 144))
def build_water_grate():
    stone = M_stone("sewerstone", (0.34, 0.33, 0.31), scale=3.5, crack=0.02)
    mossy = M_stone("sewermoss", (0.3, 0.31, 0.27), scale=3.5, moss=True, moss_z0=-0.25,
                    moss_z1=0.25, moss_color=(0.09, 0.15, 0.05))
    rust = pbr("grate_rust", (0.24, 0.2, 0.18), metal=1, rough=0.5, noise_rough=0.15,
               pattern="rust", rust=(0.34, 0.13, 0.05), scale=7.0)
    slime = pbr("slime", (0.2, 0.4, 0.1), rough=0.1, trans=0.4, emit=(0.3, 0.7, 0.15),
                emit_str=0.35, coat=0.8)
    water = M_water("sewerwater", glow=0.25)
    w, zs, zb, D = 0.6, 0.92, 0.12, 0.5
    box((2.0, 0.66, 0.12), mossy, loc=(0, -0.06, 0.06), bev=0.02, name="sill")
    # jambs (quoined courses)
    courses = ((0.12, 0.38, 0.34), (0.39, 0.65, 0.44), (0.66, 0.92, 0.34))
    for ci, (za, zt, bw) in enumerate(courses):
        for sx in (-1, 1):
            box((bw, D, zt - za - 0.012), mossy if ci == 0 else stone,
                loc=(sx * (w + bw / 2 + 0.006), 0, (za + zt) / 2), bev=0.02, name="jamb")
    # voussoirs
    n = 9
    for i in range(n):
        a0 = math.pi * i / n + 0.012
        a1 = math.pi * (i + 1) / n - 0.012
        ro = 1.0 if i == n // 2 else 0.9
        inner = [(w * math.cos(a0 + (a1 - a0) * k / 4), zs + w * math.sin(a0 + (a1 - a0) * k / 4))
                 for k in range(5)]
        outer = [(ro * math.cos(a0 + (a1 - a0) * k / 4), zs + ro * math.sin(a0 + (a1 - a0) * k / 4))
                 for k in range(5)]
        extrude(inner + outer[::-1], D + (0.06 if i == n // 2 else 0.0), stone,
                y0=-D / 2 - (0.06 if i == n // 2 else 0.0), bev=0.02, name="voussoir")
    # dark tunnel behind
    opening = [(-w, zb), (w, zb)] + arc_pts(0, zs, w, 0, math.pi, 24)[1:-1]
    extrude(opening, 0.02, M_void("sewervoid", (0.02, 0.08, 0.06), (0.0, 0.5), 0.8, 1.0),
            y0=0.16, name="void")
    eyes = M_glow("rateyes", (1.0, 0.05, 0.02), 8.0)
    for x in (-0.22, -0.175):
        sphere(0.014, eyes, loc=(x, 0.14, 0.3), seg=8, rings=4)
    # bars
    xs = [-0.5 + 0.125 * i for i in range(9)]
    for i, x in enumerate(xs):
        ztop = zs + math.sqrt(max(w * w - x * x, 0.0)) + 0.04
        if i == 6:
            sweep(catmull([(x, 0.02, ztop), (x, 0.02, 0.64), (x + 0.03, -0.06, 0.48),
                           (x + 0.1, -0.22, 0.36)], 8), 0.026, rust, segs=12, name="bentbar")
            cyl(0.026, 0.12, rust, loc=(x, 0.02, zb + 0.06), seg=12)
        else:
            cyl(0.026, ztop - zb, rust, loc=(x, 0.02, (ztop + zb) / 2), seg=12, name="bar")
    for z in (0.42, 0.82, 1.22):
        hw = w if z <= zs else math.sqrt(w * w - (z - zs) ** 2)
        box((2 * hw + 0.05, 0.035, 0.055), rust, loc=(0, -0.012, z), bev=0.008, name="band")
        for x in xs:
            if abs(x) < hw - 0.02 and not (x > 0.2 and x < 0.3 and z < 0.7):
                sphere(0.018, rust, loc=(x, -0.034, z), scale=(1, 0.6, 1), seg=10, rings=6)
    # slime drips from the intrados, water spilling over the sill
    rng = random.Random(7)
    for adeg in (38, 72, 104, 140):
        a = rad(adeg)
        p = Vector((w * 0.99 * math.cos(a), -0.2, zs + w * 0.99 * math.sin(a)))
        L = rng.uniform(0.08, 0.2)
        sweep([p, p + Vector((0, 0, -L * 0.5)), p + Vector((0, 0, -L))],
              lambda t: 0.018 * (1 - 0.4 * t), slime, segs=8, name="slimedrip")
        sphere(0.02, slime, loc=p + Vector((0, 0, -L)), scale=(1, 1, 1.3), seg=10, rings=6)
    extrude([(-0.34, 0.14), (0.34, 0.14), (0.3, -0.36), (-0.3, -0.36)],
            0.012, water, loc=(0, 0, 0.126), rot=(rad(-90), 0, 0), name="spill")
    fall = [(-0.3, 0.0), (0.3, 0.0), (0.28, 0.125), (-0.28, 0.125)]
    extrude(fall, 0.02, water, y0=-0.4, name="fall")
    lathe([(0.0, 0.0), (0.42, 0.0), (0.4, 0.01), (0.0, 0.012)], water, seg=40, sy=0.35,
          loc=(0, -0.42, 0.0), name="puddle")
    point_light((0.0, 0.08, 0.55), (0.3, 0.9, 0.7), 8, 0.2)
    view(pitch=6, fill=0.95, glow=0.6)


@item("deco_water_chain", (32, 240))
def build_water_chain():
    iron = pbr("chainiron", (0.22, 0.2, 0.19), metal=1, rough=0.42, noise_rough=0.15,
               pattern="rust", rust=(0.3, 0.12, 0.05), scale=9.0)
    box((0.24, 0.24, 0.05), iron, loc=(0, 0, -0.025), bev=0.012, name="plate")
    for sx in (-1, 1):
        sphere(0.02, iron, loc=(sx * 0.08, -0.12, -0.028), scale=(1, 0.6, 1), seg=10, rings=6)
    cyl(0.02, 0.06, iron, loc=(0, 0, -0.075), seg=12)
    torus(0.042, 0.015, iron, loc=(0, 0, -0.14), rot=(0, rad(90), 0), seg=24, rseg=8)
    chain([(0, 0, -0.16), (0, 0, -1.74)], iron, link_len=0.14, wire=0.02, width=0.09)
    torus(0.036, 0.014, iron, loc=(-0.03, 0, -1.74), rot=(rad(90), 0, 0), seg=24, rseg=8)
    hk = [(-0.03, 0, -1.775), (-0.03, 0, -1.87)]
    for i in range(1, 17):
        a = math.pi + (math.pi + 0.6) * i / 16
        hk.append((0.03 + 0.06 * math.cos(a), 0, -1.88 + 0.06 * math.sin(a)))
    sweep(hk, lambda t: 0.024 - 0.012 * t ** 2, iron, segs=12, name="hook")
    tip = Vector(hk[-1])
    cone(0.012, 0.03, iron, loc=tip, rot=(0, rad(-30), 0), seg=8)
    sphere(0.014, M_water("chainwater", 0.3), loc=(-0.03, 0, -1.965), scale=(1, 1, 1.35),
           seg=12, rings=8)
    view(anchor="top", pitch=4, fill=0.97, glow=0.3)


@item("deco_water_pipe", (192, 96))
def build_water_pipe():
    rust = pbr("piperust", (0.3, 0.27, 0.24), metal=1, rough=0.45, noise_rough=0.15,
               pattern="rust", rust=(0.36, 0.15, 0.06), scale=3.0)
    iron = M_darkiron()
    red = pbr("valvered", (0.5, 0.05, 0.03), metal=0.3, rough=0.4, pattern="rust",
              rust=(0.25, 0.1, 0.05), scale=6.0)
    brass = M_brass()
    conc = M_stone("pipeblock", (0.36, 0.35, 0.33), scale=4.0, moss=True, moss_z0=-0.2,
                   moss_z1=0.2)
    water = M_water("pipewater", 0.3)
    Pr, X, Z, bend = 0.13, 0.82, 0.62, 0.2
    path = [(-X, 0, z) for z in (0.0, 0.14, 0.28, Z - bend)]
    path += [(-X + bend + bend * math.cos(math.pi - (math.pi / 2) * i / 10), 0,
              Z - bend + bend * math.sin(math.pi - (math.pi / 2) * i / 10)) for i in range(1, 11)]
    path += [(x, 0, Z) for x in (-0.4, -0.1, 0.1, 0.4)]
    path += [(X - bend + bend * math.cos((math.pi / 2) * (1 - i / 10)), 0,
              Z - bend + bend * math.sin((math.pi / 2) * (1 - i / 10))) for i in range(0, 11)]
    path += [(X, 0, z) for z in (0.28, 0.14, 0.0)]
    sweep(path, Pr, rust, segs=28, name="pipe")
    for sx in (-1, 1):
        lathe([(0.0, 0.0), (0.24, 0.0), (0.24, 0.05), (0.17, 0.07), (0.16, 0.12), (0.0, 0.12)],
              iron, seg=40, loc=(sx * X, 0, 0), name="floorflange")
        for k in range(8):
            a = TAU * k / 8
            cyl(0.02, 0.04, iron, loc=(sx * X + 0.2 * math.cos(a), 0.2 * math.sin(a), 0.07), seg=6)
        with sub(loc=(sx * X, 0, 0.34)):
            cyl(0.18, 0.07, iron, seg=36, bev=0.01)
            for k in range(8):
                a = TAU * k / 8
                cyl(0.018, 0.1, iron, loc=(0.155 * math.cos(a), 0.155 * math.sin(a), 0), seg=6)
    for x in (-0.42, 0.42):
        with sub(loc=(x, 0, Z), rot=(0, rad(90), 0)):
            cyl(0.19, 0.07, iron, seg=36, bev=0.01)
            for k in range(8):
                a = TAU * k / 8 + TAU / 16
                cyl(0.018, 0.1, iron, loc=(0.165 * math.cos(a), 0.165 * math.sin(a), 0), seg=6)
    for x in (-0.64, 0.64):
        with sub(loc=(x, 0, Z), rot=(0, rad(90), 0)):
            torus(Pr + 0.004, 0.012, rust, seg=32, rseg=6)
    # valve on a stone block, wheel facing the camera
    box((0.4, 0.4, 0.42), conc, loc=(0, 0, 0.21), bev=0.02, name="block")
    sphere(0.2, iron, loc=(0, 0, Z), scale=(1.15, 1.0, 1.0), seg=32, rings=16, name="valve")
    cyl(0.08, 0.16, iron, loc=(0, 0, Z + 0.22), seg=24, bev=0.01)
    cyl(0.1, 0.04, iron, loc=(0, 0, Z + 0.31), seg=6, bev=0.006)
    with sub(loc=(0, -0.17, Z), rot=(rad(90), 0, 0)):
        cyl(0.03, 0.2, iron, loc=(0, 0, 0.1), seg=12)
        torus(0.17, 0.022, red, loc=(0, 0, 0.2), seg=40, rseg=8, name="wheel")
        for k in range(3):
            box((0.34, 0.024, 0.02), red, loc=(0, 0, 0.2), rot=(0, 0, TAU * k / 6 + 0.3))
        cyl(0.04, 0.05, red, loc=(0, 0, 0.2), seg=16)
        for k in range(8):
            a = TAU * k / 8
            sphere(0.024, red, loc=(0.17 * math.cos(a), 0.17 * math.sin(a), 0.2), seg=8, rings=4)
    # pressure gauge
    cyl(0.025, 0.22, brass, loc=(0.55, 0, Z + 0.2), seg=12)
    with sub(loc=(0.55, 0.0, Z + 0.36), rot=(rad(90), 0, 0)):
        cyl(0.1, 0.06, brass, seg=32, bev=0.008)
        cyl(0.085, 0.01, pbr("gaugeface", (0.9, 0.86, 0.75), rough=0.4), loc=(0, 0, 0.032), seg=32)
        box((0.012, 0.07, 0.008), M_black(), loc=(0.02, 0.022, 0.04), rot=(0, 0, rad(-35)))
        torus(0.088, 0.008, M_darkiron(), loc=(0, 0, 0.034), seg=32, rseg=4)
    # leaking spout + stream + puddle
    sweep([(-X, 0, 0.26), (-X, -0.14, 0.26), (-X, -0.22, 0.24), (-X, -0.25, 0.2)], 0.05, rust,
          segs=14, name="spout")
    torus(0.05, 0.014, rust, loc=(-X, -0.25, 0.19), seg=20, rseg=6)
    sweep(catmull([(-X, -0.25, 0.19), (-X + 0.005, -0.26, 0.12), (-X + 0.01, -0.27, 0.02)], 6),
          lambda t: 0.02 + 0.008 * t, water, segs=10, name="stream")
    lathe([(0.0, 0.0), (0.3, 0.0), (0.28, 0.008), (0.0, 0.01)], water, seg=40, sy=0.4,
          loc=(-X + 0.05, -0.3, 0.0), name="puddle")
    for (dx, dz, r) in ((0.05, 0.05, 0.012), (-0.04, 0.03, 0.01), (0.08, 0.02, 0.008)):
        sphere(r, water, loc=(-X + dx, -0.3, dz), seg=8, rings=4)
    view(pitch=7, fill=0.95, glow=0.4)


@item("deco_water_barrel", (72, 96))
def build_water_barrel():
    prof = [(0.0, 0.0), (0.5, 0.0), (0.52, 0.03), (0.6, 0.45), (0.62, 0.8), (0.6, 1.15),
            (0.52, 1.57), (0.5, 1.6)]
    wood = pbr("wetstaves", (0.24, 0.15, 0.08), rough=0.35, coat=0.35, coat_rough=0.2,
               pattern="staves", count=20, moss=True, moss_z0=0.0, moss_z1=0.9,
               moss_color=(0.1, 0.16, 0.05))
    iron = pbr("hoopiron", (0.2, 0.18, 0.17), metal=1, rough=0.45, pattern="rust",
               rust=(0.32, 0.13, 0.05), scale=6.0)
    lathe(prof + [(0.46, 1.6), (0.46, 1.55), (0.0, 1.55)], wood, seg=64, name="barrel")
    for z in (0.12, 0.42, 1.18, 1.48):
        r = prof_r(prof, z)
        torus(r + 0.012, 0.022, iron, loc=(0, 0, z), seg=64, rseg=8, rz=2.2, rr=0.6, name="hoop")
        sphere(0.016, iron, loc=(0, -(r + 0.03), z), scale=(1, 0.6, 1), seg=8, rings=4)
    lid = M_wood((0.26, 0.16, 0.08), "lidwood", axis="X", grain=1.4)
    with sub(loc=(0.05, 0.0, 1.58), rot=(rad(-5), rad(6), 0)):
        lathe([(0.0, 0.0), (0.5, 0.0), (0.5, 0.06), (0.0, 0.06)], lid, seg=48, name="lid")
        torus(0.08, 0.016, iron, loc=(0, 0, 0.07), rot=(rad(90), 0, 0), a0=0, a1=math.pi, seg=16,
              rseg=6)
    # wooden tap with a trickle of water
    tw = M_wood((0.3, 0.2, 0.1), "tapwood")
    r0 = prof_r(prof, 0.32)
    with sub(loc=(0, -r0 + 0.02, 0.32), rot=(rad(90), 0, 0)):
        cyl(0.05, 0.16, tw, loc=(0, 0, 0.08), seg=16)
        cyl(0.06, 0.03, iron, loc=(0, 0, 0.02), seg=16)
    cyl(0.03, 0.08, tw, loc=(0, -r0 - 0.1, 0.27), seg=12)
    box((0.14, 0.03, 0.03), tw, loc=(0, -r0 - 0.1, 0.39), bev=0.008)
    cyl(0.012, 0.05, tw, loc=(0, -r0 - 0.1, 0.36), seg=8)
    water = M_water("barrelwater", 0.3)
    sweep([(0, -r0 - 0.1, 0.23), (0.0, -r0 - 0.1, 0.12), (0.0, -r0 - 0.1, 0.01)],
          lambda t: 0.013 + 0.006 * t, water, segs=10, name="stream")
    lathe([(0.0, 0.0), (0.34, 0.0), (0.32, 0.008), (0.0, 0.01)], water, seg=40, sy=0.45,
          loc=(0.0, -r0 - 0.1, 0.0), name="puddle")
    # algae strands hanging from the lower hoop
    slime = pbr("algae", (0.12, 0.22, 0.06), rough=0.3, sss=0.3, sss_radius=(0.3, 1.0, 0.2), coat=0.5)
    rng = random.Random(3)
    for adeg in (-60, -80, -125, -145, -30):
        a = rad(adeg)
        r = prof_r(prof, 0.42) + 0.03
        L = rng.uniform(0.1, 0.22)
        sweep([(r * math.cos(a), r * math.sin(a), 0.42), (r * 1.01 * math.cos(a), r * 1.01 * math.sin(a), 0.42 - L)],
              lambda t: 0.018 * (1 - 0.7 * t), slime, segs=8, name="algae")
    view(pitch=8, fill=0.95, glow=0.3)


# =============================================================================
#  CLOCK TOWER
# =============================================================================
@item("deco_clock_pendulum", (96, 288))
def build_clock_pendulum():
    brass = M_brass()
    gold = M_gold()
    iron = M_darkiron()
    steel = M_steel()
    silver = M_silver()
    gem = M_gem("pendgem", (0.9, 0.02, 0.06), glow=1.2)
    # suspension bracket (touches the top of the frame)
    box((0.56, 0.3, 0.1), iron, loc=(0, 0, -0.05), bev=0.02, name="bracket")
    plate = mirror_x([(0.0, -0.48), (0.07, -0.44), (0.15, -0.34), (0.2, -0.22), (0.22, -0.12),
                      (0.22, -0.06), (0.0, -0.06)])
    extrude(plate, 0.04, brass, y0=-0.12, bev=0.01, name="plate")
    for (x, z) in ((-0.14, -0.14), (0.14, -0.14), (0.0, -0.4)):
        sphere(0.02, gold, loc=(x, -0.125, z), scale=(1, 0.6, 1), seg=10, rings=6)
    cyl(0.035, 0.3, steel, loc=(0, 0, -0.24), rot=(rad(90), 0, 0), seg=16, name="pivot")
    with sub(loc=(0, -0.13, -0.24), rot=(rad(90), 0, 0)):
        cyl(0.05, 0.02, gold, seg=24)
    box((0.05, 0.02, 0.14), steel, loc=(0, 0, -0.42), name="spring")
    # lyre rod
    top_z, bob_z = -0.47, -2.5
    cyl(0.018, top_z - bob_z, steel, loc=(0, 0, (top_z + bob_z) / 2), seg=12, name="rod")
    for sx in (-1, 1):
        pts = catmull([(sx * 0.03, 0, -0.5), (sx * 0.15, 0, -0.9), (sx * 0.2, 0, -1.4),
                       (sx * 0.15, 0, -1.9), (sx * 0.035, 0, -2.3)], 10)
        sweep(pts, 0.02, brass, segs=10, name="lyre")
        sweep([(p.x * 0.55, -0.01, p.z) for p in pts], 0.011, gold, segs=8, name="lyre_in")
    for z, hw in ((-0.9, 0.15), (-1.9, 0.15)):
        box((2 * hw, 0.03, 0.03), brass, loc=(0, 0, z), bev=0.006)
        for sx in (-1, 1):
            sphere(0.032, gold, loc=(sx * hw, 0, z), seg=12, rings=8)
    extrude(shape_star(8, 0.13, 0.06), 0.03, gold, loc=(0, -0.02, -1.4), bev=0.006, name="star")
    with sub(loc=(0, -0.04, -1.4), rot=(rad(90), 0, 0)):
        torus(0.075, 0.012, brass, seg=32, rseg=6)
        lathe([(0.0, -0.01), (0.045, 0.0), (0.03, 0.025), (0.0, 0.03)], gem, seg=8, smooth=False)
    # bob: lens-shaped brass disc with a silver crescent moon and sun rays
    with sub(loc=(0, 0, -2.62), rot=(rad(90), 0, 0)):
        lathe([(0.0, -0.05), (0.4, -0.03), (0.42, 0.0), (0.4, 0.035), (0.28, 0.065), (0.0, 0.08)],
              brass, seg=72, name="bob")
        torus(0.415, 0.022, gold, seg=72, rseg=8)
        torus(0.22, 0.008, iron, loc=(0, 0, 0.074), seg=48, rseg=6)
        for k in range(24):
            a = TAU * k / 24
            L = 0.13 if k % 2 else 0.09
            r = 0.235 + L / 2
            box((0.014, L, 0.01), gold, loc=(r * math.cos(a), r * math.sin(a), 0.066 - 0.04 * (r - 0.28)),
                rot=(0, 0, a - math.pi / 2))
        cyl(0.15, 0.012, silver, loc=(0, 0, 0.08), seg=48)
        cyl(0.13, 0.014, brass, loc=(0.065, 0.045, 0.084), seg=48)
        lathe([(0.0, 0.0), (0.035, 0.005), (0.025, 0.02), (0.0, 0.025)], gem, seg=8, smooth=False,
              loc=(-0.07, -0.02, 0.085))
    view(anchor="top", pitch=4, fill=0.97, glow=0.5)


def _numeral(text, alpha, R, H, mat, y=-0.03, sw=0.018):
    """Roman numeral built from bars, placed radially (bottom toward the centre)."""
    glyphs = []
    for ch in text:
        if ch == "I":
            glyphs.append(([(0.0, 0.0, 0.0, 1.0)], 0.0))
        elif ch == "V":
            glyphs.append(([(-0.3, 1.0, 0.0, 0.0), (0.3, 1.0, 0.0, 0.0)], 0.6))
        elif ch == "X":
            glyphs.append(([(-0.3, 1.0, 0.3, 0.0), (0.3, 1.0, -0.3, 0.0)], 0.6))
    gap = 0.34
    total = sum(w for _, w in glyphs) * H + gap * H * (len(glyphs) - 1)
    with sub(loc=(R * math.sin(alpha), y, R * math.cos(alpha)), rot=(0, alpha, 0)):
        cx = -total / 2
        for strokes, w in glyphs:
            mid = cx + w * H / 2
            for (x0, z0, x1, z1) in strokes:
                ax, az = mid + x0 * H, (z0 - 0.5) * H
                bx, bz = mid + x1 * H, (z1 - 0.5) * H
                dx, dz = bx - ax, bz - az
                Ls = math.hypot(dx, dz)
                box((sw, 0.014, Ls + sw * 0.4), mat, loc=((ax + bx) / 2, 0, (az + bz) / 2),
                    rot=(0, math.atan2(dx, dz), 0), name="stroke")
            cx += w * H + gap * H
        for zz in (-0.5 * H, 0.5 * H):
            box((total + 0.3 * H, 0.014, sw * 0.6), mat, loc=(0, 0, zz), name="serif")


@item("deco_clock_face", (192, 192))
def build_clock_face():
    iron = M_darkiron()
    bronze = M_bronze()
    gold = M_gold()
    black = M_blackmetal()
    face = M_parchment("clockface", (0.84, 0.77, 0.6), scale=2.5, dark=(0.5, 0.4, 0.25))
    enamel = pbr("enamel", (0.3, 0.01, 0.03), rough=0.22, coat=0.8, coat_rough=0.05)
    gem = M_gem("clockgem", (0.95, 0.02, 0.06), glow=1.0)
    teeth = 36
    pts = []
    for k in range(teeth):
        a0 = TAU * k / teeth
        for (da, r) in ((0.0, 0.93), (0.2, 0.93), (0.32, 1.0), (0.68, 1.0), (0.8, 0.93)):
            a = a0 + da * TAU / teeth
            pts.append((r * math.cos(a), r * math.sin(a)))
    extrude(pts, 0.1, iron, y0=0.0, bev=0.012, name="gear")
    for k in range(8):
        a = TAU * k / 8 + TAU / 16
        sphere(0.03, iron, loc=(0.9 * math.cos(a), -0.02, 0.9 * math.sin(a)), scale=(1, 0.6, 1),
               seg=10, rings=6)
    with sub(rot=(rad(90), 0, 0)):
        lathe([(0.0, 0.0), (0.86, 0.0), (0.86, 0.02), (0.0, 0.02)], face, seg=96, name="face")
        torus(0.87, 0.055, bronze, loc=(0, 0, 0.03), seg=96, rseg=12, name="bezel")
        torus(0.8, 0.016, gold, loc=(0, 0, 0.026), seg=96, rseg=8)
        lathe([(0.0, 0.02), (0.36, 0.02), (0.36, 0.028), (0.0, 0.028)], enamel, seg=64, name="enamel")
        torus(0.36, 0.012, gold, loc=(0, 0, 0.028), seg=64, rseg=6)
        torus(0.705, 0.005, black, loc=(0, 0, 0.022), seg=96, rseg=4)
        torus(0.805 - 0.005, 0.005, black, loc=(0, 0, 0.022), seg=96, rseg=4)
    extrude(shape_star(12, 0.33, 0.15), 0.006, gold, loc=(0, -0.031, 0), name="sunburst")
    for k in range(60):
        al = TAU * k / 60
        big = k % 5 == 0
        L = 0.075 if big else 0.04
        R = 0.79 - L / 2
        box((0.022 if big else 0.01, 0.01, L), black, loc=(R * math.sin(al), -0.025, R * math.cos(al)),
            rot=(0, al, 0), name="tick")
    names = ["XII", "I", "II", "III", "IIII", "V", "VI", "VII", "VIII", "IX", "X", "XI"]
    for k, t in enumerate(names):
        _numeral(t, TAU * k / 12, 0.585, 0.13, black)
    # hands: 11:52 -- nearly midnight
    hour = mirror_x([(0.0, -0.14), (0.035, -0.12), (0.04, -0.09), (0.014, -0.06), (0.022, 0.0),
                     (0.013, 0.05), (0.011, 0.25), (0.045, 0.28), (0.06, 0.32), (0.045, 0.36),
                     (0.02, 0.38), (0.0, 0.44)])
    minute = mirror_x([(0.0, -0.18), (0.03, -0.16), (0.035, -0.13), (0.012, -0.08), (0.02, 0.0),
                       (0.01, 0.06), (0.008, 0.5), (0.032, 0.54), (0.02, 0.58), (0.0, 0.7)])
    extrude(hour, 0.015, black, loc=(0, -0.05, 0), rot=(0, rad(356), 0), bev=0.004, name="hourhand")
    extrude(minute, 0.015, black, loc=(0, -0.07, 0), rot=(0, rad(312), 0), bev=0.004,
            name="minutehand")
    a = rad(356)
    torus(0.03, 0.008, gold, loc=(0.32 * math.sin(a), -0.06, 0.32 * math.cos(a)), rot=(rad(90), 0, 0),
          seg=20, rseg=6)
    sphere(0.065, gold, loc=(0, -0.08, 0), scale=(1, 0.55, 1), seg=24, rings=12, name="boss")
    lathe([(0.0, 0.0), (0.035, 0.005), (0.025, 0.02), (0.0, 0.025)], gem, seg=8, smooth=False,
          loc=(0, -0.11, 0), rot=(rad(90), 0, 0))
    crack = [(0.18, -0.022, 0.72), (0.24, -0.022, 0.62), (0.22, -0.022, 0.55), (0.3, -0.022, 0.46),
             (0.29, -0.022, 0.4)]
    sweep(crack, lambda t: 0.006 * (1 - 0.6 * t), M_black(), segs=6, name="crack")
    view(anchor="center", pitch=3, fill=0.97, glow=0.3)


@item("deco_clock_bell", (120, 120))
def build_clock_bell():
    wood = M_darkwood()
    iron = M_wrought()
    bronze = pbr("bellbronze", (0.62, 0.4, 0.2), metal=1, rough=0.3, noise_rough=0.1,
                 pattern="rust", rust=(0.16, 0.4, 0.32), scale=3.0)
    gold = M_gold()
    box((1.6, 0.36, 0.3), wood, loc=(0, 0, -0.15), bev=0.03, name="yoke")
    for x in (-0.42, 0.42):
        box((0.1, 0.4, 0.33), iron, loc=(x, 0, -0.155), bev=0.01, name="strap")
        for z in (-0.06, -0.24):
            sphere(0.02, iron, loc=(x, -0.2, z), scale=(1, 0.6, 1), seg=10, rings=6)
    for sx in (-1, 1):
        cyl(0.075, 0.2, iron, loc=(sx * 0.88, 0, -0.15), rot=(0, rad(90), 0), seg=20, name="axle")
        cyl(0.1, 0.04, iron, loc=(sx * 0.81, 0, -0.15), rot=(0, rad(90), 0), seg=20)
        sweep([(sx * 0.22, 0, -0.29), (sx * 0.22, 0, -0.38), (sx * 0.15, 0, -0.46)], 0.028, iron,
              segs=10, name="hanger")
    lathe([(0.0, -0.5), (0.14, -0.5), (0.12, -0.42), (0.08, -0.32), (0.0, -0.3)], bronze, seg=32,
          name="crown")
    prof = [(0.0, -0.46), (0.26, -0.46), (0.33, -0.49), (0.36, -0.55), (0.37, -0.72), (0.385, -0.92),
            (0.41, -1.1), (0.47, -1.28), (0.56, -1.42), (0.65, -1.52), (0.68, -1.57), (0.66, -1.61),
            (0.6, -1.59), (0.5, -1.5), (0.4, -1.3), (0.33, -0.9), (0.3, -0.6), (0.0, -0.56)]
    lathe(prof, bronze, seg=72, name="bell")
    outer = prof[:12]
    outer_up = [(r, z) for (r, z) in reversed(outer)]

    def R_at(z):
        return prof_r(outer_up, z)
    for z, rr in ((-0.56, 0.02), (-0.66, 0.012), (-1.12, 0.018), (-1.4, 0.022)):
        torus(R_at(z) + 0.004, rr, bronze, loc=(0, 0, z), seg=72, rseg=8, name="band")
    for k in range(28):
        a = TAU * k / 28
        r = R_at(-0.61) + 0.008
        box((0.03, 0.014, 0.04), bronze, loc=(r * math.cos(a), r * math.sin(a), -0.61),
            rot=(0, 0, a + math.pi / 2), bev=0.004, name="glyph")
    z_c = -0.95
    r = R_at(z_c)
    extrude(shape_cross(0.2, 0.3, 0.05, 0.2, 0.02), 0.03, gold, loc=(0, -r - 0.004, z_c - 0.15),
            rot=(rad(-6), 0, 0), bev=0.006, name="cross")
    cyl(0.025, 1.1, iron, loc=(0, 0, -1.12), seg=12, name="clapper")
    sphere(0.1, iron, loc=(0, 0, -1.7), scale=(1, 1, 1.15), seg=24, rings=12, name="ball")
    view(anchor="top", pitch=6, fill=0.95, glow=0.0)


# =============================================================================
#  ICE SPIRE
# =============================================================================
@item("deco_ice_crystal", (96, 144))
def build_ice_crystal():
    ice = M_ice("icecrys", tint=(0.62, 0.88, 1.0), glow=0.9, trans=0.75)
    core = M_glow("icecore", (0.45, 0.85, 1.0), 4.0, base=(0.6, 0.9, 1.0))
    rockm = M_stone("icerock", (0.2, 0.23, 0.28), scale=4.0)
    snow = M_snow()
    rock((0, 0, 0.1), 0.5, rockm, scale=(1.05, 0.8, 0.4), seed=1)
    rock((-0.42, -0.05, 0.06), 0.2, rockm, scale=(1.0, 0.9, 0.6), seed=2)
    rock((0.44, 0.0, 0.05), 0.18, rockm, scale=(1.1, 0.9, 0.6), seed=3)
    rock((0.05, -0.05, 0.2), 0.46, snow, scale=(1.0, 0.72, 0.16), seed=4, strength=0.2)
    crystals = [((0.0, 0.0, 0.12), (0.04, 0.0, 1.0), 0.19, 1.72, 0.2),
                ((-0.24, 0.05, 0.14), (-0.3, 0.05, 1.0), 0.13, 1.08, 0.5),
                ((0.26, 0.02, 0.14), (0.34, -0.1, 1.0), 0.14, 1.18, 1.0),
                ((-0.44, -0.08, 0.08), (-0.6, -0.1, 1.0), 0.08, 0.56, 0.3),
                ((0.46, -0.05, 0.08), (0.6, -0.2, 1.0), 0.08, 0.5, 0.7),
                ((0.1, -0.28, 0.12), (0.2, -0.8, 1.0), 0.08, 0.46, 0.1),
                ((-0.1, 0.25, 0.14), (-0.15, 0.3, 1.0), 0.12, 1.32, 0.9),
                ((-0.18, -0.25, 0.1), (-0.4, -0.8, 1.0), 0.06, 0.36, 0.4)]
    for (b, d, r, h, tw) in crystals:
        crystal(b, d, r, h, ice, twist=tw, sides=6)
        if r >= 0.12:
            crystal(b, d, r * 0.4, h * 0.8, core, twist=tw, sides=6, bev=0)
    for (p, s) in (((0.28, -0.45, 1.45), 0.07), ((-0.3, -0.45, 1.05), 0.05), ((0.05, -0.45, 1.9), 0.05)):
        sparkle(p, s, (0.8, 0.95, 1.0))
    point_light((0, -0.4, 0.9), (0.5, 0.85, 1.0), 60, 0.3)
    view(pitch=7, fill=0.95, glow=0.9, glow_beauty=0.3)


@item("deco_ice_statue", (96, 176))
def build_ice_statue():
    ped = pbr("iceped", (0.34, 0.38, 0.44), rough=0.8, pattern="frost", scale=3.0, thr=0.6, bump=0.35)
    armor = pbr("frozenarmor", (0.42, 0.47, 0.54), metal=0.85, rough=0.32, pattern="frost",
                scale=5.0, thr=0.62, frost_scale=14.0)
    capem = pbr("frozencape", (0.06, 0.1, 0.2), rough=0.8, sheen=0.5, pattern="frost", scale=4.0,
                thr=0.55)
    steel = pbr("frozensteel", (0.62, 0.68, 0.74), metal=1, rough=0.22, pattern="frost", scale=6.0,
                thr=0.7)
    ice = M_ice("statueice", tint=(0.66, 0.9, 1.0), glow=0.5, trans=0.8)
    snow = M_snow()
    eyes = M_glow("knighteyes", (0.4, 0.85, 1.0), 10.0)
    black = M_black()
    rng = random.Random(6)
    box((0.94, 0.7, 0.14), ped, loc=(0, 0, 0.07), bev=0.02, name="plinth")
    box((0.78, 0.58, 0.28), ped, loc=(0, 0, 0.28), bev=0.015, name="die")
    box((0.9, 0.66, 0.08), ped, loc=(0, 0, 0.46), bev=0.02, name="cornice")
    box((0.86, 0.6, 0.04), snow, loc=(0, 0.02, 0.505), bev=0.018, bev_seg=3, name="snowcap")
    for i in range(10):
        x = -0.4 + 0.089 * i + rng.uniform(-0.02, 0.02)
        icicle(x, -0.315, 0.43, rng.uniform(0.05, 0.15), 0.02, ice, rng)
    with sub(loc=(0, 0.02, 0.5)):
        cp = lathe([(0.36, 0.06), (0.33, 0.35), (0.3, 0.7), (0.27, 1.0), (0.23, 1.2), (0.2, 1.3)],
                   capem, seg=40, cap=False, a0=rad(12), a1=rad(168), name="cape",
                   radial=lambda a, t: 1 + 0.08 * math.sin(9 * a) * (1 - t))
        solidify(cp, 0.025)
        for sx in (-1, 1):
            sphere(0.5, armor, loc=(sx * 0.11, -0.05, 0.035), scale=(0.15, 0.3, 0.09), seg=20, rings=10)
            lathe([(0.0, 0.05), (0.055, 0.05), (0.066, 0.18), (0.06, 0.32), (0.066, 0.4), (0.0, 0.42)],
                  armor, seg=24, loc=(sx * 0.11, 0, 0), name="greave")
            sphere(0.068, armor, loc=(sx * 0.11, -0.02, 0.44), scale=(1, 1.1, 0.9), seg=16, rings=8)
            lathe([(0.0, 0.44), (0.07, 0.46), (0.085, 0.62), (0.09, 0.72), (0.0, 0.74)], armor,
                  seg=24, loc=(sx * 0.1, 0, 0), name="thigh")
        lathe([(0.0, 0.6), (0.215, 0.6), (0.2, 0.66), (0.212, 0.665), (0.195, 0.73), (0.205, 0.735),
               (0.185, 0.8), (0.17, 0.86), (0.0, 0.86)], armor, seg=40, sy=0.72, name="tassets")
        torus(0.172, 0.018, armor, loc=(0, 0, 0.86), sy=0.75, seg=40, rseg=8)
        lathe([(0.0, 0.84), (0.16, 0.84), (0.19, 0.95), (0.22, 1.08), (0.235, 1.18), (0.22, 1.26),
               (0.15, 1.3), (0.07, 1.32), (0.0, 1.32)], armor, seg=40, sy=0.72, name="cuirass")
        sweep(catmull([(0, -0.135, 0.9), (0, -0.165, 1.08), (0, -0.16, 1.24)], 6), 0.012, armor,
              segs=8)
        cyl(0.075, 0.1, armor, loc=(0, 0, 1.35), seg=24)
        for sx in (-1, 1):
            sphere(0.14, armor, loc=(sx * 0.24, 0, 1.24), scale=(1.0, 0.9, 0.72), seg=24, rings=12,
                   name="pauldron")
            for k, zz in enumerate((1.17, 1.11)):
                torus(0.12 - 0.015 * k, 0.022, armor, loc=(sx * (0.26 + 0.01 * k), 0, zz),
                      rot=(0, rad(-18 * sx), 0), seg=32, rseg=8)
            sphere(0.12, snow, loc=(sx * 0.24, 0.0, 1.31), scale=(1, 0.85, 0.3), seg=20, rings=10)
            sh, el, hd = (sx * 0.26, 0.0, 1.16), (sx * 0.29, -0.06, 0.97), (sx * 0.05, -0.2, 0.92)
            sweep([sh, el], 0.055, armor, segs=12, name="upperarm")
            sphere(0.062, armor, loc=el, seg=16, rings=8)
            sweep(catmull([el, (sx * 0.2, -0.17, 0.92), hd], 5), lambda t: 0.05 - 0.008 * t, armor,
                  segs=12, name="forearm")
            sphere(0.055, armor, loc=(sx * 0.045, -0.21, 0.92), scale=(1.1, 1.0, 0.9), seg=16,
                   rings=8)
            icicle(sx * 0.2, -0.14, 0.9, 0.1, 0.013, ice, rng)
        # sword planted in the pedestal
        blade = mirror_x([(0.0, 0.0), (0.028, 0.08), (0.034, 0.8), (0.0, 0.8)])
        extrude(blade, 0.02, steel, loc=(0, -0.22, 0.0), bev=0.006, name="blade")
        sweep([(-0.16, -0.22, 0.78), (-0.1, -0.22, 0.82), (0.1, -0.22, 0.82), (0.16, -0.22, 0.78)],
              0.018, steel, segs=8, name="guard")
        cyl(0.02, 0.12, M_leather((0.12, 0.1, 0.12), "frozengrip"), loc=(0, -0.22, 0.89), seg=12)
        sphere(0.034, steel, loc=(0, -0.22, 0.975), seg=16, rings=8)
        for x in (-0.14, 0.14, -0.07):
            icicle(x, -0.22, 0.79, rng.uniform(0.05, 0.1), 0.011, ice, rng)
        # great helm with a glowing visor
        lathe([(0.0, 1.37), (0.1, 1.38), (0.115, 1.45), (0.12, 1.57), (0.112, 1.64), (0.08, 1.7),
               (0.0, 1.73)], armor, seg=32, name="helm")
        box((0.18, 0.03, 0.022), black, loc=(0, -0.112, 1.565))
        for sx in (-1, 1):
            sphere(0.013, eyes, loc=(sx * 0.035, -0.118, 1.565), seg=8, rings=4)
        for x in (-0.04, -0.02, 0.0, 0.02, 0.04):
            box((0.008, 0.02, 0.05), black, loc=(x, -0.118, 1.47))
        sphere(0.09, snow, loc=(0, 0, 1.7), scale=(1, 1, 0.35), seg=20, rings=10)
        crystal((0, 0, 1.68), (0.0, 0.0, 1.0), 0.03, 0.2, ice, sides=6)
        crystal((0.03, 0, 1.68), (0.5, -0.1, 1.0), 0.022, 0.13, ice, sides=6)
        crystal((-0.03, 0, 1.68), (-0.5, 0.1, 1.0), 0.02, 0.12, ice, sides=6)
        # ice growing on the statue
        for (b, d, r, h) in (((-0.22, -0.1, 0.0), (-0.4, -0.3, 1.0), 0.07, 0.42),
                             ((0.2, -0.12, 0.0), (0.35, -0.35, 1.0), 0.08, 0.5),
                             ((0.28, 0.05, 0.0), (0.5, 0.1, 1.0), 0.06, 0.32),
                             ((-0.08, -0.2, 0.0), (-0.1, -0.4, 1.0), 0.05, 0.26),
                             ((0.05, 0.15, 0.0), (0.1, 0.3, 1.0), 0.09, 0.55),
                             ((-0.3, 0.08, 0.0), (-0.45, 0.0, 1.0), 0.06, 0.34),
                             ((-0.28, 0.0, 1.28), (-0.4, -0.1, 1.0), 0.05, 0.24),
                             ((-0.22, 0.05, 1.32), (-0.1, 0.0, 1.0), 0.04, 0.17)):
            crystal(b, d, r, h, ice, twist=rng.uniform(0, 1), sides=6)
    point_light((0.0, -0.5, 1.9), (0.5, 0.8, 1.0), 12, 0.2)
    point_light((0.0, -0.4, 0.7), (0.5, 0.85, 1.0), 10, 0.2)
    view(pitch=6, fill=0.95, glow=0.7)


@item("deco_ice_icicles", (192, 96))
def build_ice_icicles():
    stone = pbr("icestone", (0.26, 0.3, 0.36), rough=0.8, pattern="frost", scale=3.5, thr=0.55)
    ice = M_ice("icicle", tint=(0.7, 0.92, 1.0), glow=0.45, trans=0.85)
    snow = M_snow()
    water = M_water("meltwater", 0.3, tint=(0.8, 0.95, 1.0), emit=(0.5, 0.85, 1.0))
    rng = random.Random(12)
    bottom = [(0.95 - 1.9 * i / 20, -0.2 + rng.uniform(-0.035, 0.035)) for i in range(21)]
    outline = [(-1.0, -0.1), (-0.97, -0.06), (0.97, -0.06), (1.0, -0.1), (0.985, -0.17)] + bottom + \
        [(-0.985, -0.17)]
    extrude(outline, 0.5, stone, y0=-0.25, bev=0.025, name="ledge")
    top = [(-0.99 + 1.98 * i / 24, -0.005 - abs(math.sin(i * 1.7)) * 0.012) for i in range(25)]
    snow_out = [(-1.0, -0.075), (1.0, -0.075), (1.0, -0.03)] + top[::-1] + [(-1.0, -0.03)]
    extrude(snow_out, 0.56, snow, y0=-0.3, bev=0.028, bev_seg=3, name="snow")
    for i in range(12):
        x = -0.92 + 1.84 * i / 11 + rng.uniform(-0.04, 0.04)
        sphere(0.08, snow, loc=(x, -0.29, -0.07), scale=(rng.uniform(0.8, 1.4), 0.6, 0.45), seg=16,
               rings=8)

    def bz(x):
        pts = sorted(bottom)
        for (x0, z0), (x1, z1) in zip(pts[:-1], pts[1:]):
            if x0 <= x <= x1:
                return z0 + (z1 - z0) * (x - x0) / (x1 - x0)
        return -0.2
    sweep([(x, -0.22, bz(x) + 0.01) for x in [-0.95 + 1.9 * i / 40 for i in range(41)]], 0.035, ice,
          segs=10, name="glaze")
    x = -0.93
    while x < 0.94:
        L = 0.16 + 0.5 * math.exp(-((x + 0.25) / 0.4) ** 2) + 0.32 * math.exp(-((x - 0.55) / 0.2) ** 2)
        L *= rng.uniform(0.45, 1.1)
        r = 0.028 + 0.035 * min(L / 0.6, 1.0)
        icicle(x, -0.2 + rng.uniform(-0.03, 0.03), bz(x) + 0.03, L, r, ice, rng, lean=rng.uniform(-4, 4))
        if rng.random() < 0.3:
            sphere(0.012, water, loc=(x, -0.2, bz(x) + 0.03 - L - 0.03), scale=(1, 1, 1.4), seg=10,
                   rings=6)
        x += rng.uniform(0.06, 0.11)
    x = -0.9
    while x < 0.9:
        L = rng.uniform(0.1, 0.35)
        icicle(x, 0.05, bz(x) + 0.03, L, 0.03, ice, rng, lean=rng.uniform(-4, 4))
        x += rng.uniform(0.12, 0.2)
    point_light((0, -0.6, -0.6), (0.5, 0.85, 1.0), 25, 0.3)
    view(anchor="top", pitch=6, fill=0.97, glow=0.6, glow_beauty=0.2)


# =============================================================================
#  CHAPEL
# =============================================================================
def _quatrefoil(r, n=48):
    return [(r * (0.72 + 0.28 * abs(math.cos(2 * TAU * i / n))) * math.cos(TAU * i / n),
             r * (0.72 + 0.28 * abs(math.cos(2 * TAU * i / n))) * math.sin(TAU * i / n))
            for i in range(n)]


@item("deco_chapel_pew", (192, 80))
def build_chapel_pew():
    oak = M_wood((0.2, 0.1, 0.045), "pewwood", axis="X", grain=1.2)
    dark = M_wood((0.1, 0.05, 0.025), "pewdark", axis="Z", grain=1.4)
    velvet = M_velvet("pewvelvet")
    gold = M_gold()
    L = 2.2
    for sx in (-1, 1):
        x = sx * 1.12
        box((0.1, 0.56, 0.8), oak, loc=(x, 0.02, 0.4), bev=0.015, name="endpost")
        extrude(lancet(0.028, 0.14, 0.56, n=8), 0.012, dark, loc=(x, -0.262, 0), name="carve")
        lathe([(0.0, 0.8), (0.065, 0.8), (0.075, 0.83), (0.045, 0.86), (0.07, 0.9), (0.06, 0.94),
               (0.03, 0.98), (0.012, 1.02), (0.0, 1.05)], dark, seg=8, loc=(x, 0.02, 0), smooth=False,
              rot=(0, 0, rad(22.5)), name="finial")
        sphere(0.02, gold, loc=(x, 0.02, 1.055), seg=12, rings=6)
    box((L, 0.46, 0.07), oak, loc=(0, -0.02, 0.44), bev=0.015, name="seat")
    box((L, 0.035, 0.05), dark, loc=(0, -0.255, 0.43), bev=0.01, name="nosing")
    box((L, 0.03, 0.14), dark, loc=(0, -0.2, 0.33), name="apron")
    for i in range(9):
        extrude(_quatrefoil(0.045), 0.01, oak, loc=(-0.96 + i * 0.24, -0.218, 0.33), bev=0.003,
                name="quatrefoil")
    with sub(loc=(0, 0.2, 0.47), rot=(rad(-7), 0, 0)):
        box((L, 0.05, 0.5), oak, loc=(0, 0, 0.25), name="back")
        box((L + 0.02, 0.1, 0.07), dark, loc=(0, 0.02, 0.52), bev=0.015, name="toprail")
        box((L + 0.02, 0.06, 0.03), dark, loc=(0, -0.01, 0.475), bev=0.008)
        for i in range(7):
            x = -0.93 + i * 0.31
            extrude(lancet(0.1, 0.05, 0.3, n=10), 0.014, dark, loc=(x, -0.03, 0), name="panel")
            extrude(lancet(0.072, 0.075, 0.3, n=10), 0.012, oak, loc=(x, -0.04, 0), name="panelin")
    box((L - 0.12, 0.38, 0.06), velvet, loc=(0, -0.04, 0.505), bev=0.028, bev_seg=4, name="cushion")
    for sx in (-1, 1):
        sphere(0.02, gold, loc=(sx * 1.02, -0.235, 0.5), seg=10, rings=6)
        cone(0.016, 0.06, gold, loc=(sx * 1.02, -0.235, 0.49), rot=(rad(180), 0, 0), seg=8)
    book = pbr("hymnal", (0.05, 0.03, 0.03), rough=0.45, coat=0.3)
    with sub(loc=(0.55, 0.1, 0.54), rot=(rad(-10), 0, rad(-8))):
        box((0.2, 0.05, 0.28), book, loc=(0, 0, 0.14), bev=0.01)
        box((0.012, 0.042, 0.26), M_parchment(), loc=(0.1, 0, 0.14))
        extrude(shape_cross(0.08, 0.13, 0.022, 0.09), 0.006, gold, loc=(0, -0.028, 0.08))
    box((L, 0.06, 0.06), dark, loc=(0, 0.08, 0.1), bev=0.01, name="stretcher")
    box((0.08, 0.3, 0.34), dark, loc=(0, 0.02, 0.2), name="midleg")
    view(pitch=8, fill=0.95, glow=0.3)


@item("deco_chapel_altar", (192, 144))
def build_chapel_altar():
    bm = M_blackmarble()
    bm2 = M_marble("altarpanel", (0.09, 0.07, 0.08), vein=(0.4, 0.3, 0.3), scale=2.2)
    gold = M_gold()
    cloth = M_velvet("altarcloth", (0.4, 0.012, 0.03))
    wax = M_blackwax()
    gem = M_gem("altargem", (0.95, 0.02, 0.05), glow=1.2)
    box((2.3, 0.95, 0.1), bm, loc=(0, 0, 0.05), bev=0.02, name="plinth")
    box((2.0, 0.78, 0.8), bm, loc=(0, 0, 0.5), bev=0.015, name="body")
    box((2.3, 0.95, 0.1), bm, loc=(0, 0, 0.95), bev=0.02, name="mensa")
    for z in (0.11, 0.89):
        box((2.04, 0.82, 0.02), gold, loc=(0, 0, z), bev=0.004)
    for x in (-0.62, 0.62):
        ol = lancet(0.2, 0.2, 0.48, n=12)
        extrude(ol, 0.02, bm2, loc=(x, -0.39, 0), name="panel")
        sweep([(px + x, -0.402, pz) for (px, pz) in ol + ol[:1]], 0.012, gold, segs=6, name="panelgold")
        extrude(_quatrefoil(0.07), 0.012, gold, loc=(x, -0.405, 0.66), bev=0.003)
        with sub(loc=(x, -0.41, 0.66), rot=(rad(90), 0, 0)):
            lathe([(0.0, 0.0), (0.03, 0.005), (0.02, 0.02), (0.0, 0.025)], gem, seg=8, smooth=False)
    for sx in (-1, 1):
        cyl(0.045, 0.7, bm2, loc=(sx * 0.95, -0.4, 0.49), seg=16)
        cyl(0.065, 0.05, gold, loc=(sx * 0.95, -0.4, 0.845), seg=16, bev=0.008)
        cyl(0.065, 0.05, gold, loc=(sx * 0.95, -0.4, 0.14), seg=16, bev=0.008)
    box((0.72, 0.9, 0.02), cloth, loc=(0, 0, 1.01), name="clothtop")
    box((0.72, 0.02, 0.52), cloth, loc=(0, -0.487, 0.75), bev=0.006, name="clothfront")
    box((0.64, 0.006, 0.014), gold, loc=(0, -0.499, 0.53))
    for sx in (-1, 1):
        box((0.014, 0.006, 0.44), gold, loc=(sx * 0.32, -0.499, 0.75))
    for i in range(18):
        cyl(0.008, 0.05, gold, loc=(-0.34 + i * 0.04, -0.49, 0.47), seg=6)
    extrude(shape_cross(0.24, 0.34, 0.055, 0.23, 0.022), 0.01, gold, loc=(0, -0.5, 0.6), bev=0.003)
    # standing crucifix
    box((0.26, 0.2, 0.05), gold, loc=(0, 0.15, 1.045), bev=0.01)
    box((0.18, 0.15, 0.05), gold, loc=(0, 0.15, 1.095), bev=0.01)
    extrude(shape_cross(0.32, 0.56, 0.05, 0.4, 0.015), 0.04, gold, loc=(0, 0.15, 1.12), bev=0.008,
            name="crucifix")
    with sub(loc=(0, 0.125, 1.52), rot=(rad(90), 0, 0)):
        lathe([(0.0, 0.0), (0.03, 0.005), (0.02, 0.02), (0.0, 0.025)], gem, seg=8, smooth=False)
    # chalice
    lathe([(0.0, 0.0), (0.09, 0.0), (0.085, 0.02), (0.03, 0.05), (0.02, 0.1), (0.04, 0.12),
           (0.02, 0.14), (0.02, 0.16), (0.08, 0.2), (0.1, 0.3), (0.09, 0.3), (0.07, 0.22), (0.0, 0.2)],
          gold, seg=40, loc=(-0.34, -0.1, 1.02), name="chalice")
    with sub(loc=(-0.34, -0.14, 1.14), rot=(rad(90), 0, 0)):
        lathe([(0.0, 0.0), (0.018, 0.004), (0.012, 0.012), (0.0, 0.015)], gem, seg=8, smooth=False)
    # tome with a skull on it
    tome = pbr("tome", (0.12, 0.03, 0.03), rough=0.45, pattern="leather")
    with sub(loc=(0.36, -0.08, 1.02), rot=(0, 0, rad(-8))):
        box((0.36, 0.26, 0.09), tome, loc=(0, 0, 0.045), bev=0.015)
        box((0.34, 0.245, 0.07), M_parchment(), loc=(0.012, -0.012, 0.045))
        for sx in (-1, 1):
            box((0.05, 0.01, 0.09), gold, loc=(sx * 0.16, -0.132, 0.045), bev=0.003)
    skull((0.36, -0.1, 1.11 + 0.39 * 0.24), 0.24, M_bone(), rot=(0, 0, rad(-15)))
    for (sx, hs) in ((-1, (0.62, 0.46, 0.34)), (1, (0.55, 0.4, 0.3))):
        cx = sx * 0.86
        lathe([(0.0, 0.0), (0.24, 0.0), (0.25, 0.02), (0.23, 0.035), (0.0, 0.03)], gold, seg=40,
              loc=(cx, 0, 1.0), name="tray")
        pos = ((cx + sx * 0.02, 0.08), (cx - sx * 0.13, -0.08), (cx + sx * 0.14, -0.1))
        for (p, h, seed) in zip(pos, hs, (1, 2, 3)):
            candle((p[0], p[1], 1.03), 0.055, h, drip_seed=seed + (5 if sx > 0 else 0), wax=wax,
                   flame_h=0.17, power=18)
    view(pitch=7, fill=0.95, glow=0.9)


@item("deco_chapel_window", (144, 288))
def build_chapel_window():
    stone = M_stone("chapelstone", (0.2, 0.19, 0.21), scale=4.0, crack=0.015)
    stone2 = M_stone("chapelstone2", (0.15, 0.14, 0.16), scale=4.5, crack=0.015)
    iron = M_blackmetal()
    pal = [(0.2, 0.04, 0.6), (0.42, 0.05, 0.8), (0.68, 0.03, 0.45), (0.85, 0.02, 0.1),
           (0.55, 0.0, 0.07), (0.95, 0.1, 0.08), (1.0, 0.5, 0.1)]
    w, zb, zs = 0.3, 0.13, 1.25
    glassm = M_stained("stainedglass", pal, scale=15.0, lead=0.05, strength=3.2,
                       warm=(0.0, 1.64, 0.13, 0.45))
    box((1.0, 0.44, 0.1), stone, loc=(0, -0.06, 0.05), bev=0.02, name="sill")
    A = extrude(lancet(w, 0.1, zs, d=0.17), 0.3, stone, y0=-0.12, name="frameA")
    cutA = extrude(lancet(w, 0.05, zs, d=0.07), 0.6, stone, y0=-0.3, name="cutA")
    boolean(A, cutA)
    bevel(A, 0.018, 2)
    B = extrude(lancet(w, 0.1, zs, d=0.07), 0.24, stone2, y0=-0.06, name="frameB")
    cutB = extrude(lancet(w, zb, zs, d=0.0), 0.6, stone2, y0=-0.3, name="cutB")
    boolean(B, cutB)
    bevel(B, 0.012, 2)
    extrude(lancet(w, zb, zs, d=0.006), 0.01, glassm, y0=0.05, name="glass")
    box((0.035, 0.07, zs + 0.03 - zb), stone2, loc=(0, 0.015, (zb + zs + 0.03) / 2), bev=0.006,
        name="mullion")
    ws = (w - 0.0175) / 2
    for sx in (-1, 1):
        sweep(lancet_arc(ws, zs, 0.0, n=14, y=0.015, cx=sx * (0.0175 + ws)), 0.018, stone2, segs=8,
              name="subarch")
    torus(0.105, 0.018, stone2, loc=(0, 0.015, 1.64), rot=(rad(90), 0, 0), seg=48, rseg=8, name="rose")
    for (dx, dz) in ((0.05, 0), (-0.05, 0), (0, 0.05), (0, -0.05)):
        torus(0.045, 0.009, stone2, loc=(dx, 0.02, 1.64 + dz), rot=(rad(90), 0, 0), seg=32, rseg=6)
    for z in (0.4, 0.68, 0.96):
        box((2 * w + 0.02, 0.012, 0.012), iron, loc=(0, 0.035, z), name="saddlebar")
    hood = lancet_arc(w, zs, d=0.2, n=24, y=-0.13)
    sweep(hood, 0.03, stone, segs=10, name="hood")
    for sx in (-1, 1):
        box((0.08, 0.07, 0.1), stone, loc=(sx * (w + 0.2), -0.13, zs - 0.03), bev=0.012)
    apex = hood[len(hood) // 2]
    lathe([(0.0, 0.0), (0.045, 0.0), (0.03, 0.05), (0.018, 0.1), (0.0, 0.14)], stone, seg=8,
          smooth=False, loc=(0, -0.13, apex[2] + 0.02), name="finial")
    sphere(0.028, stone, loc=(0, -0.13, apex[2] + 0.16), seg=12, rings=6)
    point_light((0, -0.35, 1.0), (0.8, 0.1, 0.4), 15, 0.3)
    view(pitch=3, fill=0.97, glow=0.55)


@item("deco_chapel_candles", (96, 96))
def build_chapel_candles():
    wax = M_blackwax()
    specs = [(-0.25, 0.25, 0.16, 1.3, 1), (0.35, 0.22, 0.14, 1.45, 2), (0.05, 0.1, 0.16, 1.05, 3),
             (-0.56, 0.12, 0.14, 0.86, 4), (0.62, 0.02, 0.13, 0.7, 5), (-0.75, -0.18, 0.11, 0.45, 6),
             (-0.2, -0.2, 0.12, 0.6, 7), (0.25, -0.26, 0.11, 0.38, 8), (0.74, -0.25, 0.1, 0.3, 9)]
    for (x, y, r, h, s) in specs:
        candle((x, y, 0.04), r, h, drip_seed=s, wax=wax, flame_h=0.3 + r, power=22)
    rng = random.Random(2)
    for i in range(14):
        sphere(rng.uniform(0.1, 0.22), wax, loc=(rng.uniform(-0.8, 0.8), rng.uniform(-0.35, 0.3), 0.02),
               scale=(1.3, 1.0, 0.18), seg=24, rings=8, name="pool")
    skull((-0.46, -0.44, 0.02 + 0.39 * 0.28), 0.28, M_bone(), rot=(0, 0, rad(18)))
    view(pitch=8, fill=0.95, glow=1.0)


# =============================================================================
#  THRONE ROOM
# =============================================================================
@item("deco_throne_chair", (192, 240))
def build_throne_chair():
    lac = M_lacquer()
    vel = M_velvet("thronevelvet", (0.45, 0.01, 0.035))
    gold = M_gold()
    bm = M_blackmarble()
    gem = M_gem("thronegem", (1.0, 0.0, 0.05), glow=1.5)
    # dais with a crimson runner
    box((2.0, 1.1, 0.14), bm, loc=(0, -0.05, 0.07), bev=0.02, name="step1")
    box((2.02, 1.12, 0.02), gold, loc=(0, -0.05, 0.13), bev=0.004)
    box((1.6, 0.95, 0.14), bm, loc=(0, 0.0, 0.21), bev=0.02, name="step2")
    box((1.62, 0.97, 0.02), gold, loc=(0, 0.0, 0.27), bev=0.004)
    for (sz, lc) in (((0.72, 0.012, 0.14), (0, -0.607, 0.07)), ((0.72, 0.13, 0.012), (0, -0.54, 0.146)),
                     ((0.72, 0.012, 0.15), (0, -0.482, 0.21)), ((0.72, 0.3, 0.012), (0, -0.33, 0.286))):
        box(sz, vel, loc=lc, name="runner")
    for sx in (-1, 1):
        box((0.02, 0.014, 0.14), gold, loc=(sx * 0.35, -0.615, 0.07))
        box((0.02, 0.014, 0.15), gold, loc=(sx * 0.35, -0.49, 0.21))
    z0 = 0.28
    box((1.2, 0.72, 0.44), lac, loc=(0, 0.02, z0 + 0.22), bev=0.02, name="seatbase")
    for x in (-0.36, 0.0, 0.36):
        ol = lancet(0.1, z0 + 0.08, z0 + 0.22, n=10)
        sweep([(px + x, -0.345, pz) for (px, pz) in ol + ol[:1]], 0.012, gold, segs=6, name="seatarch")
    for sx in (-1, 1):
        sphere(0.09, gold, loc=(sx * 0.56, -0.3, z0 + 0.07), scale=(1, 1, 0.8), seg=20, rings=10)
        for d in (-1, 0, 1):
            cone(0.025, 0.09, gold, loc=(sx * 0.56 + d * 0.05, -0.36, z0 + 0.03),
                 rot=(rad(100), 0, rad(d * 15)), seg=8)
    box((1.08, 0.66, 0.12), vel, loc=(0, -0.02, z0 + 0.5), bev=0.05, bev_seg=4, name="cushion")
    for sx in (-1, 1):
        box((0.14, 0.7, 0.36), lac, loc=(sx * 0.62, 0.02, z0 + 0.62), bev=0.02, name="armbase")
        box((0.17, 0.72, 0.06), vel, loc=(sx * 0.62, 0.02, z0 + 0.83), bev=0.025, name="armpad")
        box((0.15, 0.72, 0.02), gold, loc=(sx * 0.62, 0.02, z0 + 0.795))
        lathe([(0.0, 0.0), (0.06, 0.0), (0.06, 0.04), (0.035, 0.08), (0.05, 0.16), (0.03, 0.26),
               (0.05, 0.32), (0.06, 0.36), (0.0, 0.36)], gold, seg=20, loc=(sx * 0.62, -0.36, z0 + 0.44),
              name="baluster")
        skull((sx * 0.62, -0.34, z0 + 0.86 + 0.078), 0.2, gold, rot=(0, 0, rad(-10 * sx)))
    # tall gothic back
    zb = z0 + 0.44
    half = [(0.0, 0.0), (0.52, 0.0), (0.52, 1.18), (0.46, 1.3), (0.36, 1.4), (0.2, 1.5), (0.08, 1.6),
            (0.0, 1.7)]
    back = mirror_x(half)
    extrude(back, 0.14, lac, loc=(0, 0, zb), y0=0.26, bev=0.02, name="back")
    half_in = [(0.0, 0.1), (0.42, 0.1), (0.42, 1.14), (0.37, 1.24), (0.28, 1.32), (0.16, 1.4),
               (0.06, 1.47), (0.0, 1.53)]
    inner = mirror_x(half_in)
    extrude(inner, 0.03, vel, loc=(0, 0, zb), y0=0.235, name="backvelvet")
    sweep([(x, 0.232, zb + z) for (x, z) in inner + inner[:1]], 0.016, gold, segs=8, name="trim_in")
    sweep([(x, 0.255, zb + z) for (x, z) in back + back[:1]], 0.02, gold, segs=8, name="trim_out")
    for row in range(6):
        z = 0.25 + row * 0.16
        for col in range(-3, 4):
            x = col * 0.13 + (0.065 if row % 2 else 0.0)
            if abs(x) < 0.38:
                sphere(0.017, gold, loc=(x, 0.228, zb + z), seg=10, rings=6)
    with sub(loc=(0, 0.215, zb + 1.23), rot=(rad(90), 0, 0)):
        torus(0.1, 0.016, gold, seg=40, rseg=8)
        lathe([(0.0, 0.0), (0.06, 0.01), (0.045, 0.04), (0.0, 0.05)], gem, seg=10, smooth=False)
    extrude(shape_star(8, 0.15, 0.1), 0.012, gold, loc=(0, 0.222, zb + 1.23), name="crest")
    for sx in (-1, 1):
        box((0.13, 0.16, 1.35), lac, loc=(sx * 0.6, 0.33, zb + 0.675), bev=0.015, name="post")
        for zz in (0.3, 0.9, 1.33):
            box((0.15, 0.18, 0.03), gold, loc=(sx * 0.6, 0.33, zb + zz), bev=0.005)
        lathe([(0.0, 0.0), (0.08, 0.0), (0.08, 0.04), (0.05, 0.08), (0.04, 0.2), (0.02, 0.3),
               (0.0, 0.36)], gold, seg=8, smooth=False, loc=(sx * 0.6, 0.33, zb + 1.35),
              rot=(0, 0, rad(22.5)), name="pinnacle")
        sphere(0.025, gold, loc=(sx * 0.6, 0.33, zb + 1.72), seg=12, rings=6)
    lathe([(0.0, 0.0), (0.06, 0.0), (0.045, 0.1), (0.02, 0.2), (0.0, 0.26)], gold, seg=8,
          smooth=False, loc=(0, 0.33, zb + 1.66), name="spire")
    with sub(loc=(0, 0.25, zb + 1.62), rot=(rad(90), 0, 0)):
        lathe([(0.0, 0.0), (0.045, 0.008), (0.03, 0.03), (0.0, 0.04)], gem, seg=8, smooth=False)
    # bat-wing crest behind the back
    wing = [(0.1, 1.2), (0.3, 1.52), (0.55, 1.72), (0.82, 1.9), (0.98, 1.84), (0.9, 1.7), (0.95, 1.52),
            (0.8, 1.5), (0.78, 1.32), (0.62, 1.34), (0.52, 1.14), (0.35, 1.2), (0.2, 1.05)]
    for sx in (-1, 1):
        extrude([(sx * x, z) for (x, z) in wing], 0.03, lac, loc=(0, 0, zb), y0=0.42, bev=0.008,
                name="wing")
        lead = catmull([(sx * 0.1, 0.415, zb + 1.2), (sx * 0.3, 0.415, zb + 1.52),
                        (sx * 0.55, 0.415, zb + 1.72), (sx * 0.82, 0.415, zb + 1.9),
                        (sx * 0.98, 0.415, zb + 1.84)], 6)
        sweep(lead, lambda t: 0.028 - 0.014 * t, gold, segs=8, name="wingbone")
        for (x, z) in ((0.9, 1.7), (0.8, 1.5), (0.62, 1.34), (0.35, 1.2)):
            sweep([(sx * 0.55, 0.415, zb + 1.72), (sx * x, 0.415, zb + z)], lambda t: 0.016 - 0.008 * t,
                  gold, segs=6, name="finger")
        cone(0.03, 0.1, gold, loc=(sx * 0.55, 0.415, zb + 1.72), rot=(0, rad(-30 * sx), 0), seg=8)
    point_light((0, 0.9, 1.7), (1.0, 0.05, 0.08), 90, 0.5)
    point_light((0, -0.6, 2.0), (1.0, 0.25, 0.2), 6, 0.3)
    view(pitch=7, fill=0.95, glow=0.5)


@item("deco_throne_statue", (96, 224))
def build_throne_statue():
    st = M_stone("demonstone", (0.2, 0.18, 0.21), scale=5.0, crack=0.012)
    ped = M_stone("demonped", (0.14, 0.13, 0.15), scale=3.0)
    gold = M_gold()
    eyes = M_glow("demoneyes", (1.0, 0.08, 0.02), 10.0)
    bone = M_bone("fangs", (0.75, 0.72, 0.66))

    def part(ob):
        displace(ob, 0.008, 0.04)
        return ob
    box((0.8, 0.6, 0.1), ped, loc=(0, 0, 0.05), bev=0.02)
    box((0.66, 0.5, 0.24), ped, loc=(0, 0, 0.22), bev=0.015)
    box((0.76, 0.58, 0.08), ped, loc=(0, 0, 0.38), bev=0.02)
    for z in (0.107, 0.333):
        box((0.68, 0.52, 0.014), gold, loc=(0, 0, z))
    skull((0, -0.255, 0.2), 0.14, st)
    with sub(loc=(0, 0, 0.42)):
        wing = [(0.14, 0.9), (0.22, 1.2), (0.3, 1.46), (0.35, 1.4), (0.43, 1.16), (0.39, 1.08),
                (0.43, 0.86), (0.38, 0.8), (0.37, 0.56), (0.3, 0.62), (0.2, 0.78)]
        for sx in (-1, 1):
            extrude([(sx * x, z) for (x, z) in wing], 0.02, st, y0=0.14, bev=0.006, name="wing")
            sweep(catmull([(sx * 0.14, 0.13, 0.92), (sx * 0.22, 0.13, 1.2), (sx * 0.3, 0.13, 1.45)], 6),
                  lambda t: 0.032 - 0.014 * t, st, segs=10, name="wingarm")
            for (x, z) in ((0.43, 1.16), (0.43, 0.86), (0.37, 0.56)):
                sweep([(sx * 0.3, 0.13, 1.44), (sx * x, 0.13, z)], lambda t: 0.014 - 0.008 * t, st,
                      segs=6, name="finger")
            cone(0.018, 0.07, st, loc=(sx * 0.3, 0.13, 1.45), rot=(0, rad(-20 * sx), 0), seg=8)
            path = catmull([(sx * 0.13, -0.08, 0.05), (sx * 0.14, 0.06, 0.22), (sx * 0.15, -0.06, 0.44),
                            (sx * 0.12, 0.0, 0.64)], 6)
            part(sweep(path, lambda t: 0.035 + 0.055 * t ** 1.3, st, segs=14, name="leg"))
            sphere(0.05, st, loc=(sx * 0.13, -0.1, 0.04), scale=(1, 1.4, 0.7), seg=14, rings=8)
            for d in (-1, 0, 1):
                cone(0.012, 0.05, st, loc=(sx * 0.13 + d * 0.025, -0.16, 0.03), rot=(rad(95), 0, 0), seg=6)
            cone(0.015, 0.06, st, loc=(sx * 0.15, -0.09, 0.44), rot=(rad(80), 0, 0), seg=6)
            sphere(0.085, st, loc=(sx * 0.21, 0.0, 1.03), seg=16, rings=8)
            sphere(0.5, st, loc=(sx * 0.085, -0.09, 0.98), scale=(0.19, 0.1, 0.14), seg=16, rings=8)
            for row in range(3):
                sphere(0.03, st, loc=(sx * 0.035, -0.095, 0.72 + row * 0.06), scale=(1, 0.5, 0.8), seg=10,
                       rings=6)
            sphere(0.014, eyes, loc=(sx * 0.035, -0.118, 1.2), seg=10, rings=6)
            cone(0.01, 0.035, bone, loc=(sx * 0.025, -0.16, 1.125), rot=(rad(180), 0, 0), seg=6)
            cone(0.025, 0.09, st, loc=(sx * 0.08, 0.0, 1.2), rot=(0, rad(-70 * sx), 0), seg=8)
            sweep(catmull([(sx * 0.05, -0.03, 1.26), (sx * 0.11, -0.01, 1.32), (sx * 0.15, 0.03, 1.42),
                           (sx * 0.13, 0.06, 1.52)], 8), lambda t: 0.032 * (1 - t) + 0.004, st, segs=10,
                  name="horn")
        part(sphere(0.5, st, loc=(0, 0.0, 0.66), scale=(0.34, 0.24, 0.2), seg=24, rings=12))
        extrude([(-0.12, 0.7), (0.12, 0.7), (0.1, 0.42), (0.05, 0.47), (0.0, 0.38), (-0.05, 0.46),
                 (-0.1, 0.4)], 0.02, st, loc=(0, -0.12, 0), bev=0.005, name="loincloth")
        part(sphere(0.5, st, loc=(0, 0, 0.78), scale=(0.26, 0.2, 0.24), seg=24, rings=12))
        part(sphere(0.5, st, loc=(0, 0.01, 0.96), scale=(0.44, 0.26, 0.28), seg=24, rings=12))
        cyl(0.05, 0.1, st, loc=(0, 0, 1.1), seg=16)
        part(sphere(0.5, st, loc=(0, -0.02, 1.19), scale=(0.17, 0.19, 0.19), seg=24, rings=12))
        sphere(0.5, st, loc=(0, -0.1, 1.14), scale=(0.11, 0.12, 0.08), seg=16, rings=8)
        sphere(0.5, st, loc=(0, -0.09, 1.215), scale=(0.16, 0.06, 0.04), seg=16, rings=8)
        # right arm grips a golden trident
        tx = 0.33
        sweep(catmull([(0.21, 0, 1.03), (0.27, 0.03, 0.9), (0.29, 0.0, 0.84), (0.32, -0.08, 0.9),
                       (tx, -0.1, 0.94)], 6), lambda t: 0.05 - 0.012 * t, st, segs=12, name="arm")
        sphere(0.045, st, loc=(tx, -0.1, 0.94), seg=14, rings=8)
        cyl(0.016, 1.52, gold, loc=(tx, -0.1, 0.76), seg=12, name="shaft")
        box((0.2, 0.03, 0.03), gold, loc=(tx, -0.1, 1.52), bev=0.008)
        cone(0.022, 0.2, gold, loc=(tx, -0.1, 1.52), seg=8)
        for d in (-1, 1):
            sweep([(tx + d * 0.1, -0.1, 1.52), (tx + d * 0.1, -0.1, 1.6)], 0.014, gold, segs=8)
            cone(0.018, 0.08, gold, loc=(tx + d * 0.1, -0.1, 1.6), seg=8)
            cone(0.012, 0.05, gold, loc=(tx + d * 0.1, -0.1, 1.56), rot=(0, rad(-120 * d), 0), seg=6)
        sphere(0.03, gold, loc=(tx, -0.1, 0.0), seg=10, rings=6)
        # left arm raised with open claws
        sweep(catmull([(-0.21, 0, 1.03), (-0.3, 0.02, 0.9), (-0.3, -0.04, 0.82), (-0.22, -0.14, 0.9)], 6),
              lambda t: 0.05 - 0.012 * t, st, segs=12, name="arm")
        sphere(0.042, st, loc=(-0.21, -0.15, 0.92), seg=14, rings=8)
        for k in range(4):
            cone(0.01, 0.06, bone, loc=(-0.24 + k * 0.02, -0.18, 0.95), rot=(rad(-30), rad(-20 + 12 * k), 0),
                 seg=6)
        tail = catmull([(0, 0.1, 0.62), (-0.14, 0.22, 0.46), (-0.26, 0.08, 0.2), (-0.2, -0.14, 0.07),
                        (-0.02, -0.22, 0.06), (0.08, -0.2, 0.07)], 8)
        sweep(tail, lambda t: 0.04 * (1 - t) + 0.01, st, segs=10, name="tail")
        extrude(mirror_x([(0.0, -0.02), (0.045, 0.03), (0.02, 0.05), (0.0, 0.09)]), 0.015, st,
                loc=(0.08, -0.2, 0.07), rot=(0, rad(90), 0), bev=0.004, name="spade")
    point_light((0, -0.5, 1.7), (1.0, 0.1, 0.05), 8, 0.2)
    view(pitch=6, fill=0.95, glow=0.5)


@item("deco_throne_candelabra", (96, 224))
def build_throne_candelabra():
    gold = M_gold()
    wax = M_wax("redwax", (0.42, 0.015, 0.025))
    gem = M_gem("candgem", (0.9, 0.0, 0.05), glow=0.8)
    lathe([(0.0, 0.1), (0.18, 0.1), (0.2, 0.13), (0.15, 0.19), (0.09, 0.26), (0.06, 0.34),
           (0.08, 0.37), (0.0, 0.37)], gold, seg=40, name="base")
    for k in range(3):
        a = math.pi / 2 + TAU * k / 3
        c, s_ = math.cos(a), math.sin(a)
        pts = catmull([(0.12 * c, 0.12 * s_, 0.2), (0.25 * c, 0.25 * s_, 0.2), (0.34 * c, 0.34 * s_, 0.1),
                       (0.37 * c, 0.37 * s_, 0.04)], 6)
        sweep(pts, lambda t: 0.035 - 0.01 * t, gold, segs=10, name="leg")
        sphere(0.045, gold, loc=(0.38 * c, 0.38 * s_, 0.04), scale=(1.2, 1.2, 0.8), seg=14, rings=8)
        for d in (-1, 0, 1):
            ca = a + d * 0.14
            cone(0.014, 0.05, gold, loc=(0.4 * math.cos(ca), 0.4 * math.sin(ca), 0.02),
                 rot=(0, rad(90), ca), seg=6)
        curl = []
        for i in range(14):
            t = i / 13
            ang = t * TAU * 0.9
            rr = 0.06 * (1 - 0.7 * t)
            curl.append(((0.2 + rr * math.cos(ang)) * c, (0.2 + rr * math.cos(ang)) * s_,
                         0.28 + rr * math.sin(ang)))
        sweep(curl, 0.012, gold, segs=6, name="curl")
    stem = [(0.05, 0.36), (0.035, 0.5), (0.08, 0.54), (0.1, 0.59), (0.07, 0.64), (0.032, 0.7),
            (0.032, 0.92), (0.06, 0.95), (0.085, 1.0), (0.06, 1.05), (0.03, 1.1), (0.03, 1.28),
            (0.05, 1.31), (0.075, 1.35), (0.09, 1.4), (0.05, 1.44), (0.035, 1.47), (0.0, 1.47)]
    lathe(stem, gold, seg=32, name="stem")
    for (z, r) in ((0.59, 0.1), (1.0, 0.085), (1.4, 0.09)):
        with sub(loc=(0, -r + 0.005, z), rot=(rad(90), 0, 0)):
            lathe([(0.0, 0.0), (0.028, 0.005), (0.018, 0.018), (0.0, 0.022)], gem, seg=8, smooth=False)
    pan = [(0.0, 0.0), (0.085, 0.0), (0.095, 0.02), (0.06, 0.035), (0.035, 0.04), (0.0, 0.04)]
    lathe(pan, gold, seg=32, loc=(0, 0, 1.47))
    candle((0, 0, 1.5), 0.045, 0.42, drip_seed=1, wax=wax, flame_h=0.15, power=16)
    for sx in (-1, 1):
        outer = catmull([(0, 0.03, 1.38), (sx * 0.14, 0.03, 1.3), (sx * 0.3, 0.03, 1.36),
                         (sx * 0.35, 0.03, 1.5), (sx * 0.35, 0.03, 1.55)], 8)
        sweep(outer, 0.02, gold, segs=10, name="outerarm")
        inner = catmull([(0, -0.03, 1.44), (sx * 0.1, -0.03, 1.47), (sx * 0.18, -0.03, 1.56),
                         (sx * 0.18, -0.03, 1.62)], 8)
        sweep(inner, 0.017, gold, segs=10, name="innerarm")
        curl = []
        for i in range(14):
            t = i / 13
            ang = -t * TAU * 0.9
            rr = 0.05 * (1 - 0.7 * t)
            curl.append((sx * (0.2 + rr * math.cos(ang)), 0.03, 1.25 + rr * math.sin(ang)))
        sweep(curl, 0.01, gold, segs=6, name="armcurl")
        lathe(pan, gold, seg=32, loc=(sx * 0.35, 0.03, 1.55))
        candle((sx * 0.35, 0.03, 1.58), 0.04, 0.2, drip_seed=2 + sx, wax=wax, flame_h=0.14, power=14)
        lathe(pan, gold, seg=32, loc=(sx * 0.18, -0.03, 1.62))
        candle((sx * 0.18, -0.03, 1.65), 0.04, 0.22, drip_seed=5 + sx, wax=wax, flame_h=0.14, power=14)
    view(pitch=6, fill=0.95, glow=1.0)


# =============================================================================
#  ABYSS
# =============================================================================
def M_abyssrock(name="abyssrock", strength=4.0):
    return pbr(name, (0.035, 0.025, 0.045), rough=0.35, coat=0.4, pattern="veins",
               vein_color=(0.6, 0.12, 1.0), density=3.0, width=0.03, strength=strength)


def M_chaoscrys():
    return pbr("chaoscrys", (0.4, 0.1, 0.8), rough=0.06, trans=0.45, ior=1.6, spec=0.8,
               emit=(0.62, 0.18, 1.0), emit_str=2.0)


@item("deco_abyss_crystal", (96, 160))
def build_abyss_crystal():
    obs = M_abyssrock()
    crys = M_chaoscrys()
    dark = pbr("voidcrys", (0.02, 0.01, 0.035), metal=0.4, rough=0.12, coat=0.8,
               emit=(0.4, 0.05, 0.7), emit_str=0.15)
    core = M_glow("chaoscore", (0.95, 0.5, 1.0), 6.0, base=(1.0, 0.7, 1.0))
    rock((0, 0.02, 0.1), 0.42, obs, scale=(1.1, 0.8, 0.42), seed=1)
    rock((-0.36, -0.08, 0.06), 0.2, obs, scale=(1.0, 0.9, 0.6), seed=2)
    rock((0.38, -0.02, 0.06), 0.18, obs, scale=(1.1, 0.9, 0.7), seed=3)
    rock((0.12, -0.26, 0.04), 0.12, obs, scale=(1.2, 1.0, 0.6), seed=4)
    spec = [((0.0, 0.0, 0.14), (0.08, -0.04, 1.0), 0.2, 1.62, 0.3, crys),
            ((-0.24, 0.05, 0.12), (-0.38, 0.0, 1.0), 0.12, 0.95, 0.7, crys),
            ((0.24, 0.0, 0.12), (0.34, -0.1, 1.0), 0.13, 1.05, 1.1, crys),
            ((-0.38, -0.1, 0.08), (-0.7, -0.2, 0.9), 0.07, 0.48, 0.2, crys),
            ((0.4, -0.05, 0.06), (0.65, -0.2, 0.8), 0.07, 0.44, 0.5, crys),
            ((-0.05, 0.25, 0.12), (-0.1, 0.4, 1.0), 0.11, 1.2, 0.9, crys),
            ((0.1, -0.25, 0.08), (0.3, -0.9, 1.0), 0.06, 0.4, 0.4, dark),
            ((-0.18, -0.22, 0.08), (-0.35, -0.8, 1.0), 0.05, 0.34, 0.8, dark),
            ((0.3, 0.2, 0.08), (0.5, 0.3, 1.0), 0.06, 0.5, 0.1, dark)]
    for (b, d, r, h, tw, m) in spec:
        crystal(b, d, r, h, m, twist=tw, sides=5)
        if m is crys and r >= 0.11:
            crystal(b, d, r * 0.38, h * 0.8, core, twist=tw, sides=5, bev=0)
    rng = random.Random(5)
    for (p, r, h) in (((-0.42, -0.05, 1.3), 0.05, 0.1), ((0.4, 0.0, 1.55), 0.045, 0.09),
                      ((-0.3, -0.1, 1.8), 0.035, 0.07), ((0.38, -0.1, 0.95), 0.04, 0.08)):
        octa(r, h, crys, p, rot=(rng.uniform(-0.5, 0.5), rng.uniform(-0.5, 0.5), rng.uniform(0, 1)))
    for (p, s) in (((0.22, -0.4, 1.6), 0.06), ((-0.25, -0.4, 1.12), 0.05)):
        sparkle(p, s, (0.85, 0.6, 1.0))
    point_light((0, -0.4, 0.9), (0.6, 0.2, 1.0), 70, 0.3)
    view(pitch=7, fill=0.95, glow=0.9, glow_beauty=0.2)


def twisted_column(z0, z1, rfun, lobes, twist, mat, n_z=72, n_a=48, lobe_amp=0.3, seed=0):
    rng = random.Random(seed)
    ph0, ph1 = rng.uniform(0, TAU), rng.uniform(0, TAU)
    verts, faces = [], []
    for i in range(n_z + 1):
        t = i / n_z
        z = z0 + (z1 - z0) * t
        r = rfun(t)
        ph = twist * t
        for j in range(n_a):
            a = TAU * j / n_a
            m = (1 + lobe_amp * math.cos(lobes * (a - ph)) + 0.05 * math.sin(3 * a + ph0 + 9 * t)
                 + 0.04 * math.sin(7 * a + ph1 - 13 * t))
            verts.append((r * m * math.cos(a), r * m * math.sin(a), z))
    for i in range(n_z):
        for j in range(n_a):
            j2 = (j + 1) % n_a
            faces.append((i * n_a + j, i * n_a + j2, (i + 1) * n_a + j2, (i + 1) * n_a + j))
    b = len(verts)
    verts.append((0, 0, z0 - 0.02))
    tp = len(verts)
    verts.append((0, 0, z1 + 0.04))
    for j in range(n_a):
        j2 = (j + 1) % n_a
        faces.append((b, j2, j))
        faces.append((tp, n_z * n_a + j, n_z * n_a + j2))
    return make_mesh("spire", verts, faces, mat, smooth=True, fix_normals=True)


@item("deco_abyss_spire", (96, 240))
def build_abyss_spire():
    obs = M_abyssrock("spirerock", 5.0)
    crys = M_chaoscrys()
    ring = M_glow("voidring", (0.7, 0.25, 1.0), 5.0)

    def rf(t):
        if t < 0.88:
            return 0.045 + 0.24 * t ** 1.35
        r88 = 0.045 + 0.24 * 0.88 ** 1.35
        return r88 * (1 - 0.35 * (t - 0.88) / 0.12)
    sp = twisted_column(0.06, 1.72, rf, 4, 1.3 * math.pi, obs, seed=3)
    displace(sp, 0.035, 0.18)
    rng = random.Random(9)
    for k in range(5):
        a = TAU * k / 5 + 0.3
        d = (math.cos(a) * 0.45, math.sin(a) * 0.45, 1.0)
        crystal((0.15 * math.cos(a), 0.15 * math.sin(a), 1.66), d, 0.07, rng.uniform(0.2, 0.34), obs,
                twist=rng.uniform(0, 1), sides=4, bev=0.0)
    for (a, h) in ((1.2, 0.36), (3.4, 0.28), (5.0, 0.3)):
        crystal((0.08 * math.cos(a), 0.08 * math.sin(a), 1.72), (0.3 * math.cos(a), 0.3 * math.sin(a), 1.0),
                0.06, h, crys, sides=5)
    for (x, y, r, sc) in ((0.0, 0.0, 0.2, (1.4, 1.1, 0.45)), (-0.24, -0.06, 0.12, (1.1, 1.0, 0.6)),
                          (0.24, -0.02, 0.12, (1.2, 1.0, 0.55)), (0.08, -0.2, 0.08, (1.2, 1.0, 0.6)),
                          (-0.12, 0.18, 0.1, (1.2, 1.0, 0.6))):
        rock((x, y, 0.04), r, obs, scale=sc, seed=int(abs(x * 100)) + 1)
    for (x, z, r) in ((-0.33, 1.2, 0.06), (0.34, 1.45, 0.055), (-0.3, 1.62, 0.045), (0.32, 0.95, 0.05),
                      (-0.28, 0.72, 0.04)):
        rock((x, -0.05, z), r, obs, scale=(1.1, 1.0, 0.8), seed=int(z * 10))
    torus(0.3, 0.008, ring, loc=(0, 0, 1.2), rot=(rad(14), rad(-10), 0), seg=64, rseg=6)
    torus(0.24, 0.006, ring, loc=(0, 0, 0.78), rot=(rad(-12), rad(8), 0), seg=64, rseg=6)
    for z in (1.2, 0.78):
        s = torus(0.3 if z > 1 else 0.24, 0.03, M_glowshell("ringhalo", (0.6, 0.2, 1.0), 1.0, 1.2),
                  loc=(0, 0, z), rot=(rad(14 if z > 1 else -12), rad(-10 if z > 1 else 8), 0), seg=64,
                  rseg=8)
        s["noframe"] = True
    point_light((0, -0.5, 1.3), (0.6, 0.2, 1.0), 30, 0.3)
    point_light((0, -0.4, 0.3), (0.6, 0.2, 1.0), 10, 0.2)
    view(pitch=6, fill=0.95, glow=0.8)


@item("deco_abyss_eye", (120, 120))
def build_abyss_eye():
    disc_m = pbr("eyedisc", (0.2, 0.18, 0.23), rough=0.8, pattern="veins", vein_color=(0.55, 0.1, 0.9),
                 density=2.5, width=0.02, strength=2.0)
    st = M_stone("eyestone", (0.22, 0.2, 0.25), scale=4.0, crack=0.015)
    st2 = M_stone("eyestone2", (0.15, 0.13, 0.17), scale=3.0)
    eye = pbr("abysseye", (0.9, 0.85, 0.75), rough=0.25, coat=0.6, pattern="eye", iris=0.2,
              pupil=0.15, slit=3.4, glow=3.0,
              iris_cols=[(0.2, (1.0, 0.6, 1.0)), (0.55, (0.7, 0.1, 1.0)), (0.95, (0.25, 0.0, 0.5))],
              sclera=(0.78, 0.74, 0.62), vein=(0.5, 0.05, 0.2))
    box((1.0, 0.6, 0.12), st2, loc=(0, 0, 0.06), bev=0.02, name="plinth")
    box((0.78, 0.5, 0.2), st2, loc=(0, 0, 0.22), bev=0.02)
    box((0.36, 0.3, 0.14), st2, loc=(0, 0, 0.38), bev=0.02, name="neck")
    C, Rd = 1.08, 0.66
    circle = [(Rd * math.cos(TAU * i / 64), C + Rd * math.sin(TAU * i / 64)) for i in range(64)]
    inflate(circle, 0.2, disc_m, rings=8, center=(0, C), back_depth=0.1, name="disc")
    torus(Rd, 0.06, st, loc=(0, 0, C), rot=(rad(90), 0, 0), seg=72, rseg=10, name="rim")
    for k in range(14):
        a = TAU * k / 14 + TAU / 28
        if abs(((a - 1.5 * math.pi + math.pi) % TAU) - math.pi) < rad(40):
            continue
        L = 0.28 if k % 2 == 0 else 0.17
        u = (math.cos(a), math.sin(a))
        p = (-u[1], u[0])
        hw = 0.075 if k % 2 == 0 else 0.055
        r0 = Rd - 0.02
        tipa = a + rad(7)
        pts = [(r0 * u[0] - p[0] * hw, C + r0 * u[1] - p[1] * hw),
               (r0 * u[0] + p[0] * hw, C + r0 * u[1] + p[1] * hw),
               ((r0 + L * 0.55) * math.cos(a + rad(4)) + p[0] * hw * 0.35,
                C + (r0 + L * 0.55) * math.sin(a + rad(4)) + p[1] * hw * 0.35),
               ((r0 + L) * math.cos(tipa), C + (r0 + L) * math.sin(tipa))]
        extrude(pts, 0.12, st, y0=-0.06, bev=0.012, name="thorn")

    def disc_y(x, z):
        d = math.hypot(x, z - C)
        return -0.2 * math.sqrt(max(0.0, 1 - (d / Rd) ** 2))
    for k in range(8):
        a0 = TAU * k / 8 + 0.2
        path = []
        for i in range(12):
            t = i / 11
            r = 0.4 + 0.2 * t
            a = a0 + 0.5 * t
            x, z = r * math.cos(a), C + r * math.sin(a)
            path.append((x, disc_y(x, z) + 0.005, z))
        sweep(path, lambda t: 0.028 * (1 - 0.6 * t), st, segs=8, name="tendril")
    E = (0, -0.16, C)
    sphere(0.3, eye, loc=E, seg=48, rings=24, name="eyeball")
    Rl = 0.33
    dome_up = [(Rl * math.cos(rad(p)), Rl * math.sin(rad(p))) for p in range(0, 91, 6)]
    dome_dn = [(Rl * math.cos(rad(p)), -Rl * math.sin(rad(p))) for p in range(90, -1, -6)]
    for (prof, ang) in ((dome_up, -32), (dome_dn, 28)):
        with sub(loc=E, rot=(rad(ang), 0, 0)):
            lid = lathe(prof, st, seg=48, cap=False, name="lid")
            solidify(lid, 0.05, offset=1.0)
            torus(Rl + 0.02, 0.035, st, seg=48, rseg=10, name="lidrim")
    point_light((0, -0.75, C), (0.7, 0.2, 1.0), 20, 0.1)
    view(pitch=5, fill=0.95, glow=0.8)


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


def contact_sheet(ids, path, kind):
    items = [(i, REGISTRY[i]) for i in ids if REGISTRY[i]["kind"] == kind]
    files = []
    for i, spec in items:
        d = ICON_DIR if kind == "icon" else PROP_DIR
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
        maxh = 0
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
    ap.add_argument("--samples", type=int, default=48)
    ap.add_argument("--ss", type=int, default=2, help="supersampling factor")
    ap.add_argument("--out-icons", default=ICON_DIR)
    ap.add_argument("--out-props", default=PROP_DIR)
    ap.add_argument("--contact", default=os.path.join(CONTACT_DIR, "contact_deco_b.png"))
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
        tmpdir = tempfile.mkdtemp(prefix="bn_decob_")
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
    p = contact_sheet(all_ids, args.contact, "prop")
    print("contact sheet:", p)
    if failed:
        print("FAILED:", failed)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
