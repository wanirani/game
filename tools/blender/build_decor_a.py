#!/usr/bin/env python3
"""
BLOOD NOCTURNE -- background decoration sprites, group A (deco_a).

Village, graveyard, gate/castle, hall, catacombs and library set-dressing
that the tile renderer (src/render/tiles.js DECOR_SETS) draws behind the
gameplay layer.  Every object is modelled procedurally in Blender (bpy as a
python module): lathes, sweeps, extruded / inflated outlines, bmesh block
assemblies, cloth grids with fold functions, curves with bevel depth and the
usual modifier stack (bevel, subdivision, solidify, array, boolean, displace).
Objects get PBR Principled materials with procedural break-up (stone with
moss, marble veins, wood grain, rusted iron, brass, bone, velvet, gold
thread, glazed ceramic, emissive glass / embers / flames), a warm key + cool
rim + fill rig with a dim world, and are rendered with Cycles (CPU) into
transparent PNGs from a straight side view (orthographic, very slight top
angle).  Floor pieces touch the bottom edge of the frame, hanging pieces
(banner, curtain) touch the top edge.  Rendering happens at 2x and a Pillow
post-pass adds bloom around emissive parts and downsamples with LANCZOS.

The scene / material / geometry toolkit is a snapshot of the one in
build_icons_misc.py (same pipeline, lighting and materials) so this script is
standalone.

Usage (bpy is importable as a python module):
    python3 tools/blender/build_decor_a.py                        # everything
    python3 tools/blender/build_decor_a.py --only 'deco_grave_*' --samples 24
    python3 tools/blender/build_decor_a.py --list
    python3 tools/blender/build_decor_a.py --contact-only

Outputs
    assets/props/<id>.png            RGBA sprites at the sizes in tiles.js
    /tmp/claude-0/contact_deco_a.png review sheet

Conventions
    * The camera looks along +Y: the picture plane is XZ (x right, z up);
      2D outlines are (x, z) pairs, the front of an object faces -Y.
    * After building, objects are normalised into a 2-unit box so a single
      light rig fits all of them; builders work in "about a metre" units.
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
#  Extra helpers (from build_icons_misc.py)
# =============================================================================
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


def bake(ob, M):
    """Bake a matrix into the mesh data and reset the object transform (so an
    array/radial modifier can use the object origin as its pivot)."""
    ob.data.transform(M)
    ob.matrix_basis = Matrix()
    return ob


def M_wrought():
    return pbr("wrought", (0.17, 0.16, 0.16), metal=1, rough=0.36, noise_rough=0.12,
               pattern="rust", rust=(0.22, 0.1, 0.05), scale=5.0)


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


def _profile_r(prof, z):
    for (r0, z0), (r1, z1) in zip(prof[:-1], prof[1:]):
        if z0 <= z <= z1 and z1 > z0:
            return r0 + (r1 - r0) * (z - z0) / (z1 - z0)
    return prof[-1][0]


BOOK_COLORS = [(0.32, 0.03, 0.04), (0.06, 0.16, 0.08), (0.05, 0.08, 0.2), (0.3, 0.16, 0.06),
               (0.06, 0.05, 0.05), (0.22, 0.05, 0.18), (0.36, 0.26, 0.12), (0.12, 0.2, 0.22)]


def M_book(i):
    c = BOOK_COLORS[i % len(BOOK_COLORS)]
    return pbr("book%d" % i, c, rough=0.5, coat=0.25, coat_rough=0.3, pattern="bands",
               band=(0.95, 0.68, 0.28), pos=(0.1, 0.14, 0.84, 0.88))


# =============================================================================
#  DECOR TOOLKIT (additions for set dressing)
# =============================================================================
def deco(item_id, size, anchor="bottom"):
    """Register a decoration builder.  anchor: 'bottom' (stands on the floor)
    or 'top' (hangs from the ceiling)."""
    def wrap(fn):
        def run():
            view(anchor=anchor, margin=0.0, fill=0.97, pitch=7.0, glow=0.0)
            fn()
        REGISTRY[item_id] = dict(id=item_id, fn=run, kind="prop", size=size,
                                 anchor=anchor)
        return fn
    return wrap


def bake_coords():
    """Bake every eligible part's own transform into its mesh so procedural
    patterns that read Object coordinates (moss creeping up from the ground,
    stone breakup) are continuous across parts instead of restarting per part."""
    for ob in list(G.coll.objects):
        if ob.type != "MESH" or ob.data.users > 1 or ob.children:
            continue
        if any(md.type == "ARRAY" for md in ob.modifiers):
            continue
        if ob.get("noframe"):
            continue
        bake(ob, ob.matrix_basis.copy())


def bm_box(bm, size, M):
    """Add a box of `size` transformed by matrix M to bmesh `bm`."""
    res = bmesh.ops.create_cube(bm, size=1.0)
    vs = res["verts"]
    bmesh.ops.scale(bm, vec=Vector(size), verts=vs)
    bmesh.ops.transform(bm, matrix=M, verts=vs)
    return vs


def blades(bases, mat, rng, h=(0.08, 0.2), w=0.02, lean=0.6, dirs=None, segs=3,
           bend=0.35, name="blades"):
    """One mesh of many thin tapered blades (grass, straw, weeds).
    bases: list of (x, y, z); dirs: optional list of growth directions."""
    verts, faces = [], []
    for i, (x, y, z) in enumerate(bases):
        H = rng.uniform(*h)
        if dirs is not None:
            d = Vector(dirs[i]).normalized()
        else:
            a = rng.uniform(-lean, lean)
            d = Vector((math.sin(a), rng.uniform(-0.3, 0.3), math.cos(a))).normalized()
        side = d.cross(Vector((0, 0, 1)))
        if side.length < 1e-3:
            side = Vector((1, 0, 0))
        side.normalize()
        tw = rng.uniform(-0.9, 0.9)
        side = (side * math.cos(tw) + d.cross(side) * math.sin(tw)).normalized()
        hd = Vector((d.x, d.y, 0.0))
        if hd.length > 1e-4:
            hd.normalize()
        p = Vector((x, y, z))
        b = len(verts)
        for k in range(segs + 1):
            t = k / segs
            c = p + d * H * t + hd * bend * H * t * t - Vector((0, 0, bend * 0.5 * H * t * t * abs(d.x)))
            hw = w * 0.5 * (1 - t) + 0.0012
            verts.append(tuple(c - side * hw))
            verts.append(tuple(c + side * hw))
        for k in range(segs):
            i0 = b + 2 * k
            faces.append((i0, i0 + 1, i0 + 3, i0 + 2))
    return make_mesh(name, verts, faces, mat, smooth=True)


def tuft_bases(rng, cx, cy, n, rx=0.1, ry=0.05, z=0.0):
    return [(cx + rng.uniform(-rx, rx), cy + rng.uniform(-ry, ry), z) for _ in range(n)]


def jitter_outline(pts, rng, amt=0.01, keep=lambda x, z: z < 1e-6):
    out = []
    for (x, z) in pts:
        if keep(x, z):
            out.append((x, z))
        else:
            out.append((x + rng.uniform(-amt, amt), z + rng.uniform(-amt, amt)))
    return out


def surface(fn, nu, nv, mat, name="surf", face_mat=None, thick=0.0, smooth=True):
    """Grid surface: fn(u, v) -> (x, y, z), u across, v along.  face_mat(u, v)
    returns a material slot index per face (mat must then be a list)."""
    verts = [fn(i / nu, j / nv) for j in range(nv + 1) for i in range(nu + 1)]
    W = nu + 1
    faces, fm = [], []
    for j in range(nv):
        for i in range(nu):
            a = j * W + i
            faces.append((a, a + 1, a + W + 1, a + W))
            if face_mat:
                fm.append(face_mat((i + 0.5) / nu, (j + 0.5) / nv))
    ob = make_mesh(name, verts, faces, mat, smooth=smooth,
                   face_mats=fm if face_mat else None)
    if thick:
        solidify(ob, thick, offset=0.0)
    return ob


def text_obj(body, size, depth, mat, loc=(0, 0, 0), rot=(rad(90), 0, 0), name="text",
             spacing=1.0):
    """Extruded text converted to a mesh (reads in the XZ plane, facing -Y)."""
    cu = bpy.data.curves.new(name, "FONT")
    cu.body = body
    cu.size = size
    cu.extrude = depth
    cu.align_x = "CENTER"
    cu.align_y = "CENTER"
    cu.space_character = spacing
    tob = bpy.data.objects.new(name + "_c", cu)
    G.coll.objects.link(tob)
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(tob.evaluated_get(dg))
    bpy.data.objects.remove(tob)
    if mat is not None:
        me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    G.coll.objects.link(ob)
    _place(ob, loc, rot)
    return ob


def M_grass(name="grass", color=(0.15, 0.22, 0.06)):
    return pbr(name, color, rough=0.55, sss=0.2, sss_radius=(0.4, 1.0, 0.3), spec=0.35)


def M_hay(name="hay", color=(0.66, 0.48, 0.19)):
    return pbr(name, color, rough=0.7, sss=0.08, pattern="wood", axis="X", grain=4.0,
               dark=(0.24, 0.15, 0.04), stain=0.55, bump=0.9, bump_scale=90)


def lumpy_box(size, mat, loc=(0, 0, 0), rot=(0, 0, 0), cuts=10, bev=0.07, disp=0.025,
              name="lumpy"):
    """Subdivided, bevelled, noise-displaced box (hay bales, sacks of grain)."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=cuts, use_grid_fill=True)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    ob = bm_obj(name, bm, mat, smooth=True, loc=loc, rot=rot)
    bevel(ob, bev, 3, angle=60)
    displace(ob, disp, 0.18, depth=3)
    return ob


def M_dirt(name="dirt", color=(0.16, 0.12, 0.09)):
    return pbr(name, color, rough=0.95, pattern="stone", scale=6.0, crack=0.0,
               dark=(0.06, 0.045, 0.035), bump=0.5, bump_scale=25)


def M_goldthread():
    return pbr("goldthread", (1.0, 0.7, 0.28), metal=1, rough=0.34, bump=0.55,
               bump_scale=170)


def M_velvet(name="velvet", color=(0.30, 0.012, 0.024)):
    return pbr(name, color, rough=0.72, sheen=1.0, bump=0.2, bump_scale=160,
               noise_rough=0.1)


def M_fringe(name="fringe", color=(1.0, 0.7, 0.28), freq=70.0):
    """Gold fringe: vertical strands (alpha cut-out along object X), metallic."""
    if name in G.mats:
        return G.mats[name]
    m = bpy.data.materials.new(name)
    nt = m.node_tree
    nt.nodes.clear()
    out = nn(nt, "ShaderNodeOutputMaterial")
    b = nn(nt, "ShaderNodeBsdfPrincipled")
    ln(nt, b.outputs[0], out.inputs["Surface"])
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Metallic"].default_value = 1.0
    b.inputs["Roughness"].default_value = 0.38
    tc = nn(nt, "ShaderNodeTexCoord")
    sep = nn(nt, "ShaderNodeSeparateXYZ")
    ln(nt, tc.outputs["Object"], sep.inputs[0])
    nz = noise(nt, tc.outputs["Object"], 30.0, 2.0)
    xw = math_node(nt, "ADD", math_node(nt, "MULTIPLY", sep.outputs["X"], freq),
                   math_node(nt, "MULTIPLY", nz.outputs["Fac"], 0.6))
    f = math_node(nt, "FRACT", xw)
    strand = math_node(nt, "LESS_THAN", f, 0.62)
    ln(nt, strand, b.inputs["Alpha"])
    G.mats[name] = m
    return m


def M_glaze(name, base, gold=(1.0, 0.7, 0.28), bands=(), pat_band=None, n_ang=14,
            n_z=7.0):
    """Glazed ceramic with gold bands (Generated Z ranges) and a gold diamond
    lattice inside `pat_band`."""
    if name in G.mats:
        return G.mats[name]
    m = bpy.data.materials.new(name)
    nt = m.node_tree
    nt.nodes.clear()
    out = nn(nt, "ShaderNodeOutputMaterial")
    b = nn(nt, "ShaderNodeBsdfPrincipled")
    ln(nt, b.outputs[0], out.inputs["Surface"])
    b.inputs["Coat Weight"].default_value = 0.9
    b.inputs["Coat Roughness"].default_value = 0.06
    tc = nn(nt, "ShaderNodeTexCoord")
    sep = nn(nt, "ShaderNodeSeparateXYZ")
    ln(nt, tc.outputs["Generated"], sep.inputs[0])
    gz = sep.outputs["Z"]
    mask = None

    def band(lo, hi):
        return math_node(nt, "MULTIPLY", math_node(nt, "GREATER_THAN", gz, lo),
                         math_node(nt, "LESS_THAN", gz, hi))
    for lo, hi in bands:
        bm_ = band(lo, hi)
        mask = bm_ if mask is None else math_node(nt, "MAXIMUM", mask, bm_)
    if pat_band:
        gr = nn(nt, "ShaderNodeTexGradient", gradient_type="RADIAL")
        ln(nt, tc.outputs["Object"], gr.inputs["Vector"])
        fa = math_node(nt, "FRACT", math_node(nt, "MULTIPLY", gr.outputs["Fac"], n_ang))
        fz = math_node(nt, "FRACT", math_node(nt, "MULTIPLY", gz, n_z))
        da = math_node(nt, "ABSOLUTE", math_node(nt, "SUBTRACT", fa, 0.5))
        dz = math_node(nt, "ABSOLUTE", math_node(nt, "SUBTRACT", fz, 0.5))
        dd = math_node(nt, "ADD", da, dz)
        line = math_node(nt, "MULTIPLY", math_node(nt, "GREATER_THAN", dd, 0.4),
                         math_node(nt, "LESS_THAN", dd, 0.47))
        dot = math_node(nt, "LESS_THAN", dd, 0.12)
        pm = math_node(nt, "MULTIPLY", math_node(nt, "MAXIMUM", line, dot),
                       band(*pat_band))
        mask = pm if mask is None else math_node(nt, "MAXIMUM", mask, pm)
    nzc = noise(nt, tc.outputs["Object"], 4.0, 4.0)
    basec = ramp(nt, nzc.outputs["Fac"], [(0.3, tuple(c * 0.7 for c in base)),
                                          (0.7, base)])
    if mask is None:
        ln(nt, basec, b.inputs["Base Color"])
        b.inputs["Roughness"].default_value = 0.2
    else:
        mix = nn(nt, "ShaderNodeMix", data_type="RGBA")
        ln(nt, mask, mix.inputs["Factor"])
        ln(nt, basec, mix.inputs[6])
        mix.inputs[7].default_value = (*gold, 1)
        ln(nt, mix.outputs[2], b.inputs["Base Color"])
        ln(nt, mask, b.inputs["Metallic"])
        mr = nn(nt, "ShaderNodeMapRange", {"To Min": 0.18, "To Max": 0.3})
        ln(nt, mask, mr.inputs["Value"])
        ln(nt, mr.outputs["Result"], b.inputs["Roughness"])
    G.mats[name] = m
    return m


def skull2(loc, s, mat, rot=(0, 0, 0), jaw=True, dark=None):
    """Human skull facing -Y (unit skull ~0.85 wide, ~1.0 tall), origin at
    the centre of the cranium base."""
    dark = dark or pbr("socket", (0.012, 0.008, 0.006), rough=0.95)
    with sub(loc=loc, rot=rot, scale=s):
        sphere(0.5, mat, loc=(0, 0.06, 0.16), scale=(0.84, 1.0, 0.84), seg=28, rings=14,
               name="cranium")
        sphere(0.5, mat, loc=(0, -0.2, -0.06), scale=(0.66, 0.56, 0.52), seg=24, rings=12,
               name="face")
        sphere(0.5, mat, loc=(0, -0.34, 0.1), scale=(0.7, 0.26, 0.2), seg=20, rings=10,
               name="brow")
        for sx in (-1, 1):
            sphere(0.12, mat, loc=(sx * 0.27, -0.28, -0.08), scale=(1.0, 1.3, 0.7), seg=12,
                   rings=8, name="cheek")
            sphere(0.13, dark, loc=(sx * 0.155, -0.4, -0.02), scale=(1.0, 0.55, 0.92),
                   seg=14, rings=8, name="socket")
        extrude(mirror_x([(0.0, -0.08), (0.05, -0.02), (0.035, 0.06), (0.0, 0.08)]), 0.06,
                dark, loc=(0, -0.45, -0.17), name="nose")
        sphere(0.5, mat, loc=(0, -0.36, -0.3), scale=(0.4, 0.24, 0.16), seg=16, rings=8,
               name="maxilla")
        teeth = pbr("teeth", (0.9, 0.84, 0.68), rough=0.35)
        for k in range(6):
            box((0.045, 0.05, 0.075), teeth, loc=(-0.125 + k * 0.05, -0.44, -0.37),
                bev=0.01, name="tooth")
        if jaw:
            sphere(0.5, mat, loc=(0, -0.3, -0.47), scale=(0.52, 0.42, 0.16), seg=18,
                   rings=8, name="jaw")
            for k in range(5):
                box((0.042, 0.045, 0.06), teeth, loc=(-0.1 + k * 0.05, -0.43, -0.43),
                    bev=0.01, name="tooth")


def long_bone(p0, p1, r, mat, knob=1.35):
    """Femur-like bone between p0 and p1 with knobbly condyles."""
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    path = [p0 + d * (i / 10) for i in range(11)]
    sweep(path, lambda s: r * (1.0 + 0.9 * (abs(s - 0.5) * 2) ** 4), mat, segs=10,
          name="bone")
    side = d.cross(Vector((0, 0, 1)))
    if side.length < 1e-4:
        side = Vector((1, 0, 0))
    side.normalize()
    dn = d.normalized()
    for end, sg in ((p0, -1), (p1, 1)):
        for k in (-1, 1):
            sphere(r * knob, mat, loc=end + side * r * 0.75 * k + dn * sg * r * 0.3, seg=12,
                   rings=8, name="knob")


def rib(center, R, a0, a1, r, mat, rot=(0, 0, 0)):
    pts = [(R * math.cos(a0 + (a1 - a0) * i / 12), 0.0, R * math.sin(a0 + (a1 - a0) * i / 12))
           for i in range(13)]
    return sweep(pts, lambda s: r * (1.0 - 0.4 * s), mat, segs=8, ellipse=(1.0, 0.5),
                 loc=center, rot=rot, name="rib")


# =============================================================================
#  VILLAGE
# =============================================================================
@deco("deco_village_well", (144, 144))
def build_village_well():
    rng = random.Random(7)
    st = M_stone("wellstone", (0.33, 0.31, 0.28), scale=5.0, crack=0.012, moss=True,
                 moss_z0=0.0, moss_z1=0.45, moss_color=(0.07, 0.1, 0.035))
    capst = M_stone("wellcap", (0.38, 0.36, 0.33), scale=4.0, crack=0.01)
    mortar = pbr("mortar", (0.08, 0.07, 0.06), rough=0.95, bump=0.4, bump_scale=30)
    wood = M_wood((0.34, 0.2, 0.1), "wellwood_v", axis="Z", grain=1.3)
    wood_h = M_wood((0.34, 0.2, 0.1), "wellwood_h", axis="X", grain=1.3)
    dark = M_wood((0.2, 0.1, 0.05), "wellbarge", axis="X", grain=1.2)
    shingle = M_wood((0.2, 0.12, 0.07), "shingle", axis="X", grain=2.0, stain=0.6)
    iron = M_wrought()
    rope = pbr("rope", (0.5, 0.38, 0.2), rough=0.85, bump=0.9, bump_scale=70)
    R, th, ch = 0.74, 0.22, 0.17
    # ---- stone ring: staggered courses of bevelled blocks (one mesh) ----
    bm = bmesh.new()
    Rm = R - th / 2
    n = 13
    for c in range(4):
        off = 0.5 * (c % 2)
        z = ch * (c + 0.5)
        for k in range(n):
            a = TAU * (k + off + rng.uniform(-0.06, 0.06)) / n
            w = 2 * (R - 0.02) * math.sin(math.pi / n) - 0.03 + rng.uniform(-0.015, 0.01)
            M = (Matrix.Translation((Rm * math.cos(a), Rm * math.sin(a), z + rng.uniform(-0.006, 0.006)))
                 @ Matrix.Rotation(a + math.pi / 2, 4, "Z")
                 @ Matrix.Rotation(rng.uniform(-0.04, 0.04), 4, "X")
                 @ Matrix.Rotation(rng.uniform(-0.04, 0.04), 4, "Y"))
            bm_box(bm, (w, th + rng.uniform(-0.03, 0.02), ch - 0.022 + rng.uniform(-0.01, 0.006)), M)
    ring = bm_obj("wellring", bm, st, sharp=30)
    bevel(ring, 0.02, 2)
    bm = bmesh.new()
    for k in range(11):
        a = TAU * (k + 0.3) / 11
        w = 2 * (R + 0.04) * math.sin(math.pi / 11) - 0.025
        M = (Matrix.Translation(((Rm + 0.02) * math.cos(a), (Rm + 0.02) * math.sin(a), 4 * ch + 0.055))
             @ Matrix.Rotation(a + math.pi / 2, 4, "Z")
             @ Matrix.Rotation(rng.uniform(-0.03, 0.03), 4, "X"))
        bm_box(bm, (w, th + 0.08, 0.1), M)
    caps = bm_obj("wellcapring", bm, capst, sharp=30)
    bevel(caps, 0.025, 2)
    lathe([(R - th + 0.01, 0.0), (R - 0.03, 0.0), (R - 0.03, 4 * ch + 0.02),
           (R - th + 0.01, 4 * ch + 0.02)], mortar, seg=48, cap=False, name="mortar")
    cyl(R - th + 0.02, 0.02, pbr("wellwater", (0.005, 0.012, 0.02), rough=0.04, spec=0.9),
        loc=(0, 0, 0.5), seg=48, name="water")
    # ---- posts, beams, windlass ----
    ztop = 1.72
    for sx in (-1, 1):
        box((0.13, 0.13, ztop - 0.35), wood, loc=(sx * 0.66, 0, (ztop + 0.35) / 2), bev=0.012,
            name="post")
        # knee braces
        sweep([(sx * 0.66, -0.07, ztop - 0.36), (sx * 0.44, -0.07, ztop - 0.1)], 0.03, wood,
              segs=6, name="brace")
    box((1.5, 0.12, 0.11), wood_h, loc=(0, 0, ztop - 0.05), bev=0.012, name="tiebeam")
    cyl(0.065, 1.22, wood_h, rot=(0, rad(90), 0), loc=(0, 0, 1.3), seg=20, name="windlass")
    for i in range(10):
        x = -0.2 + i * 0.042
        torus(0.077, 0.019, rope, loc=(x, 0, 1.3), rot=(0, rad(90), 0), seg=20, rseg=6,
              name="coil")
    cyl(0.028, 0.22, iron, rot=(0, rad(90), 0), loc=(0.8, 0, 1.3), seg=10)
    box((0.045, 0.045, 0.3), iron, loc=(0.9, 0, 1.18), bev=0.01)
    cyl(0.026, 0.2, wood_h, rot=(0, rad(90), 0), loc=(0.98, 0, 1.05), seg=10, name="handle")
    # ---- bucket on the rim + rope ----
    bx, bz = 0.42, 4 * ch + 0.105
    staves = pbr("bucketstaves", (0.42, 0.26, 0.12), rough=0.6, pattern="staves", count=12)
    lathe([(0.0, 0.0), (0.105, 0.0), (0.13, 0.26), (0.12, 0.26), (0.1, 0.03), (0.0, 0.03)],
          staves, seg=32, loc=(bx, -0.12, bz), name="bucket")
    for z in (0.05, 0.21):
        torus(0.108 + z * 0.09, 0.011, iron, loc=(bx, -0.12, bz + z), seg=32, rseg=6)
    sweep([(bx - 0.125, -0.12, bz + 0.24), (bx - 0.08, -0.12, bz + 0.36), (bx, -0.12, bz + 0.39),
           (bx + 0.08, -0.12, bz + 0.36), (bx + 0.125, -0.12, bz + 0.24)], 0.01, iron, segs=6,
          name="bail")
    sweep(catmull([(0.12, -0.06, 1.24), (0.26, -0.1, 1.2), (bx, -0.12, bz + 0.39)], 6), 0.013,
          rope, segs=6, name="rope")
    # ---- gabled shingle roof (ridge runs front-to-back) ----
    ez, pz, ex = 1.6, 2.1, 1.0
    L = math.hypot(ex, pz - ez)
    ang = math.atan2(pz - ez, ex)
    bm = bmesh.new()
    rows = 7
    for sx in (-1, 1):
        for r_ in range(rows):
            t = (r_ + 0.5) / rows
            x = sx * ex * (1 - t)
            z = ez + (pz - ez) * t + 0.04
            for k in range(7):
                y = -0.5 + (k + 0.5 * (r_ % 2)) * 1.0 / 6.5
                if y > 0.52:
                    continue
                M = (Matrix.Translation((x, y, z))
                     @ Matrix.Rotation(sx * (ang + 0.1), 4, "Y")
                     @ Matrix.Rotation(rng.uniform(-0.05, 0.05), 4, "X"))
                bm_box(bm, (L / rows + 0.07, 1.0 / 6.5 - 0.012, 0.035), M)
    sh = bm_obj("shingles", bm, shingle, sharp=30)
    bevel(sh, 0.006, 1)
    for sx in (-1, 1):
        box((L + 0.06, 1.08, 0.05), dark, loc=(sx * ex / 2, 0, (ez + pz) / 2),
            rot=(0, sx * ang, 0), name="roofboard")
        box((L + 0.1, 0.06, 0.11), dark, loc=(sx * ex / 2, -0.55, (ez + pz) / 2 - 0.02),
            rot=(0, sx * ang, 0), bev=0.012, name="barge")
    gable = [(-ex + 0.12, ez + 0.02), (ex - 0.12, ez + 0.02), (0.0, pz - 0.06)]
    extrude(gable, 0.04, pbr("gablewood", (0.3, 0.18, 0.09), rough=0.6, pattern="wood",
                             axis="Z", grain=1.5), loc=(0, -0.46, 0), name="gable")
    groove = pbr("groove", (0.04, 0.02, 0.01), rough=0.9)
    for i in range(-4, 5):
        x = i * 0.18
        hz = (pz - 0.06 - ez) * (1 - abs(x) / (ex - 0.12))
        if hz > 0.05:
            box((0.012, 0.01, hz), groove, loc=(x, -0.485, ez + 0.02 + hz / 2))
    box((0.1, 0.05, pz - ez - 0.1), dark, loc=(0, -0.5, (ez + pz) / 2 - 0.05), name="kingpost")
    sphere(0.045, iron, loc=(0, -0.56, pz - 0.02), seg=12, rings=8)
    # ---- ground: rocks + grass ----
    for (x, y, s_) in ((-0.86, -0.5, 0.09), (0.82, -0.55, 0.07), (-0.62, -0.72, 0.06)):
        displace(ico(s_, capst, loc=(x, y, s_ * 0.45), subdiv=2, scale=(1.3, 1.0, 0.7)), 0.02, 0.3)
    gb = []
    for x in (-0.75, -0.45, -0.1, 0.3, 0.62, 0.85):
        gb += tuft_bases(rng, x, -0.68 if abs(x) < 0.7 else -0.3, 12, 0.08, 0.05)
    blades(gb, M_grass("villgrass", (0.16, 0.26, 0.07)), rng, h=(0.07, 0.2), w=0.022,
           name="grass")
    view(pitch=8, glow=0.0)


def wheel(loc, R, wood, iron, spokes=10, name="wheel"):
    """Cart wheel in the picture plane (axle along Y)."""
    with sub(loc=loc, rot=(rad(90), 0, 0)):
        torus(R - 0.06, 0.05, wood, seg=64, rseg=10, rz=1.25, name=name + "_felloe")
        torus(R - 0.012, 0.018, iron, seg=64, rseg=8, rz=2.8, rr=0.8, name=name + "_tire")
        lathe([(0.0, -0.13), (0.07, -0.13), (0.1, -0.08), (0.11, 0.0), (0.1, 0.08),
               (0.07, 0.13), (0.0, 0.13)], wood, seg=24, name=name + "_hub")
        for z in (-0.1, 0.1):
            torus(0.1, 0.014, iron, loc=(0, 0, z), seg=24, rseg=6)
        cyl(0.04, 0.03, iron, loc=(0, 0, -0.14), seg=10)
        for k in range(spokes):
            a = TAU * (k + 0.25) / spokes
            c, s_ = math.cos(a), math.sin(a)
            sweep([(0.09 * c, 0.09 * s_, 0.0), ((R - 0.09) * c, (R - 0.09) * s_, 0.0)],
                  lambda t: 0.028 - 0.008 * t, wood, segs=8, name="spoke")


@deco("deco_village_cart", (192, 120))
def build_village_cart():
    rng = random.Random(11)
    wood = M_wood((0.38, 0.23, 0.11), "cartwood", axis="X", grain=1.3, stain=0.55)
    wood_v = M_wood((0.36, 0.21, 0.1), "cartwood_v", axis="Z", grain=1.3, stain=0.55)
    dark = M_wood((0.22, 0.12, 0.06), "cartdark", axis="X", grain=1.2)
    iron = M_wrought()
    AX = (-0.15, 0.0, 0.56)
    Rw = 0.56
    for wy in (0.7, -0.7):
        wheel((AX[0], wy, AX[2]), Rw, M_wood((0.3, 0.17, 0.08), "wheelwood", axis="Z", grain=1.4),
              iron)
    with sub(loc=AX, rot=(0, rad(6), 0)):
        cyl(0.05, 1.46, iron, rot=(rad(90), 0, 0), seg=12, name="axle")
        for y in (-0.45, 0.45):
            box((2.3, 0.1, 0.1), dark, loc=(0.1, y, 0.14), bev=0.01, name="sill")
        box((2.2, 1.12, 0.07), wood, loc=(0.1, 0, 0.225), bev=0.01, name="bed")
        for sy in (-1, 1):
            for zb in (0.36, 0.54):
                box((2.16, 0.045, 0.15), wood, loc=(0.1, sy * 0.585, zb),
                    rot=(0, rad(rng.uniform(-0.5, 0.5)), 0), bev=0.008, name="board")
            for x in (-0.94, -0.36, 0.34, 1.12):
                box((0.07, 0.07, 0.6), wood_v, loc=(x, sy * 0.625, 0.42), bev=0.01, name="stake")
                sphere(0.012, iron, loc=(x, sy * 0.665, 0.36), seg=8, rings=4)
                sphere(0.012, iron, loc=(x, sy * 0.665, 0.54), seg=8, rings=4)
        for sx in (-1, 1):
            box((0.045, 1.12, 0.33), wood, loc=(0.1 + sx * 1.085, 0, 0.43), bev=0.008, name="endboard")
        for y in (-0.45, 0.45):
            sweep(catmull([(0.9, y, 0.14), (1.5, y, 0.06), (2.0, y, -0.3)], 6),
                  lambda s: 0.045 - 0.014 * s, dark, segs=10, name="shaft")
            torus(0.05, 0.012, iron, loc=(1.55, y, 0.05), rot=(0, rad(90 - 25), 0), seg=16, rseg=6)
        sweep([(1.85, -0.45, -0.21), (1.85, 0.45, -0.21)], 0.03, dark, segs=8, name="crossbar")
        # ---- cargo: barrel, sacks, hay ----
        staves = pbr("staves", (0.42, 0.24, 0.1), rough=0.6, pattern="staves", count=16)
        body = catmull2d([(0.24, 0.0), (0.28, 0.18), (0.29, 0.34), (0.27, 0.5), (0.24, 0.66)], 5,
                         closed=False)
        prof = [(0.0, 0.0)] + body + [(0.22, 0.66), (0.0, 0.64)]
        lathe(prof, staves, seg=40, loc=(-0.62, 0.12, 0.26), name="barrel")
        for z in (0.07, 0.2, 0.46, 0.59):
            r = _profile_r(body, z)
            torus(r + 0.008, 0.014, iron, loc=(-0.62, 0.12, 0.26 + z), rz=2.2, rr=0.6, seg=40,
                  rseg=8)
        burlap = pbr("burlap", (0.46, 0.35, 0.2), rough=0.92, sheen=0.4, bump=0.7,
                     bump_scale=140, pattern="stone", scale=3.0, crack=0.0,
                     dark=(0.3, 0.22, 0.12))
        sack = [(0.0, 0.0), (0.2, 0.01), (0.26, 0.09), (0.26, 0.27), (0.2, 0.4), (0.09, 0.46),
                (0.05, 0.5), (0.08, 0.55), (0.06, 0.6), (0.0, 0.6)]
        for (x, y, rz_, tilt) in ((-0.12, -0.15, 20, -14), (0.2, 0.18, -40, 10)):
            with sub(loc=(x, y, 0.25), rot=(rad(tilt * 0.5), rad(tilt), rad(rz_))):
                lathe(sack, burlap, seg=28, sy=0.8, name="sack",
                      radial=lambda a, t: 1 + 0.05 * math.sin(7 * a) * t)
                torus(0.058, 0.012, rope_mat(), loc=(0, 0, 0.49), sy=0.8, seg=16, rseg=6)
        hay = M_hay("carthay")
        sphere(0.5, hay, loc=(0.62, 0.0, 0.3), scale=(1.1, 1.0, 0.86), seg=40, rings=20,
               name="haypile")
        sb, dirs = [], []
        for _ in range(260):
            a = rng.uniform(0, TAU)
            b = rng.uniform(0.0, 1.0)
            v = Vector((math.cos(a) * math.sqrt(1 - b * b), math.sin(a) * math.sqrt(1 - b * b), b))
            p = Vector((0.62, 0.0, 0.3)) + Vector((v.x * 0.55, v.y * 0.5, v.z * 0.43))
            sb.append(tuple(p))
            dirs.append(tuple(v + Vector((rng.uniform(-0.6, 0.6), rng.uniform(-0.6, 0.6),
                                          rng.uniform(-0.3, 0.3)))))
        blades(sb, pbr("straw", (0.78, 0.6, 0.26), rough=0.6, sss=0.1), rng, h=(0.07, 0.18),
               w=0.012, dirs=dirs, segs=2, bend=0.2, name="straw")
        # pitchfork stuck in the hay
        sweep([(0.85, -0.05, 0.3), (0.35, -0.12, 1.22)], 0.022, wood_v, segs=8, name="forkhandle")
        with sub(loc=(0.35, -0.12, 1.22), rot=(0, rad(-28.7), 0)):
            box((0.2, 0.03, 0.03), iron, loc=(0, 0, 0.02), bev=0.008)
            for x in (-0.09, 0.0, 0.09):
                sweep(catmull([(x, 0, 0.02), (x * 1.1, -0.02, 0.15), (x * 1.15, -0.06, 0.28)], 5),
                      lambda s: 0.012 * (1 - 0.8 * s), iron, segs=6, name="tine")
    view(pitch=9)


def rope_mat():
    return pbr("rope", (0.5, 0.38, 0.2), rough=0.85, bump=0.9, bump_scale=70)


@deco("deco_village_fence", (192, 72))
def build_village_fence():
    rng = random.Random(21)
    post_m = M_wood((0.25, 0.18, 0.11), "fencepost", axis="Z", grain=1.4, stain=0.6)
    pick_m = M_wood((0.44, 0.35, 0.24), "picket", axis="Z", grain=1.7, stain=0.6)
    rail_m = M_wood((0.34, 0.25, 0.15), "fencerail", axis="X", grain=1.4, stain=0.55)
    iron = M_wrought()
    xs = [-1.95, -0.98, 0.0, 0.98, 1.95]
    for x in xs:
        h = 1.42 + rng.uniform(-0.06, 0.05)
        out = [(-0.075, 0.0), (0.075, 0.0), (0.075, h - 0.09), (0.0, h), (-0.075, h - 0.09)]
        extrude(jitter_outline(out, rng, 0.006), 0.15, post_m, loc=(x + rng.uniform(-0.02, 0.02), 0.04, 0),
                rot=(0, rad(rng.uniform(-3, 3)), 0), bev=0.014, name="post")
    for bi in range(4):
        x0, x1 = xs[bi], xs[bi + 1]
        for z in (0.36, 0.98):
            if bi == 2 and z > 0.5:
                # broken upper rail: two sagging halves
                box((0.52, 0.06, 0.1), rail_m, loc=(x0 + 0.26, -0.04, z - 0.1),
                    rot=(0, rad(22), 0), bev=0.01, name="railbroken")
                box((0.4, 0.06, 0.1), rail_m, loc=(x1 - 0.2, -0.04, z - 0.08),
                    rot=(0, rad(-24), 0), bev=0.01, name="railbroken")
                continue
            box((x1 - x0 + 0.12, 0.06, 0.1), rail_m, loc=((x0 + x1) / 2, -0.04, z + rng.uniform(-0.02, 0.02)),
                rot=(0, rad(rng.uniform(-1.5, 1.5)), 0), bev=0.01, name="rail")
            for x in (x0 + 0.02, x1 - 0.02):
                sphere(0.013, iron, loc=(x, -0.08, z), seg=8, rings=4)
        for k in range(4):
            if (bi, k) in ((1, 2), (3, 0)):
                continue
            x = x0 + (x1 - x0) * (k + 0.9) / 4.8
            h = rng.uniform(1.08, 1.22)
            w = 0.11
            lean = rng.uniform(-2.5, 2.5)
            if (bi, k) == (2, 3):
                lean = -14
            out = [(-w / 2, 0.0), (w / 2, 0.0), (w / 2, h - 0.08), (0.0, h), (-w / 2, h - 0.08)]
            extrude(jitter_outline(out, rng, 0.005), 0.032, pick_m, loc=(x, -0.1, 0.05),
                    rot=(0, rad(lean), 0), bev=0.008, name="picket")
    gb = []
    for x in np.linspace(-2.0, 2.0, 16):
        gb += tuft_bases(rng, x + rng.uniform(-0.1, 0.1), -0.16, 9, 0.12, 0.06)
    blades(gb, M_grass("villgrass", (0.16, 0.26, 0.07)), rng, h=(0.08, 0.26), w=0.024,
           name="grass")
    view(pitch=6)


@deco("deco_village_haybale", (96, 72))
def build_village_haybale():
    rng = random.Random(5)
    hay = M_hay()
    hay2 = M_hay("hay2", (0.6, 0.44, 0.17))
    straw = pbr("straw", (0.8, 0.62, 0.27), rough=0.6, sss=0.1)
    twine = pbr("twine", (0.3, 0.18, 0.08), rough=0.8, bump=0.5, bump_scale=80)

    def bale(loc, size, rotz, mat, seed):
        r_ = random.Random(seed)
        w, d, h = size
        with sub(loc=loc, rot=(0, 0, rad(rotz))):
            lumpy_box(size, mat, loc=(0, 0, h / 2), cuts=8, bev=0.08, disp=0.03, name="bale")
            for fx in (-0.28, 0.28):
                x = fx * w
                e = 0.012
                path = [(x, -d / 2 - e, 0.02), (x, -d / 2 - e, h - 0.06), (x, -d / 2 + 0.05, h + e),
                        (x, d / 2 - 0.05, h + e), (x, d / 2 + e, h - 0.06), (x, d / 2 + e, 0.02)]
                sweep(catmull(path, 4), 0.014, twine, segs=6, caps=True, name="twine")
            sb, dirs = [], []
            for _ in range(320):
                face = r_.random()
                if face < 0.45:      # front face
                    p = (r_.uniform(-w / 2, w / 2), -d / 2 - 0.005, r_.uniform(0.03, h - 0.03))
                    dv = (r_.uniform(-0.6, 0.6), -1.0, r_.uniform(-0.5, 0.5))
                elif face < 0.75:    # top
                    p = (r_.uniform(-w / 2, w / 2), r_.uniform(-d / 2, d / 2), h + 0.005)
                    dv = (r_.uniform(-0.8, 0.8), r_.uniform(-0.8, 0.8), 1.0)
                else:                # ends
                    sx = r_.choice((-1, 1))
                    p = (sx * (w / 2 + 0.005), r_.uniform(-d / 2, d / 2), r_.uniform(0.03, h - 0.03))
                    dv = (sx * 1.0, r_.uniform(-0.6, 0.6), r_.uniform(-0.6, 0.6))
                sb.append(p)
                dirs.append(dv)
            blades(sb, straw, r_, h=(0.05, 0.17), w=0.016, dirs=dirs, segs=2, bend=0.25,
                   name="straw")
    bale((0.0, 0.0, 0.0), (1.3, 0.78, 0.56), 0.0, hay, 1)
    bale((-0.1, 0.03, 0.555), (1.08, 0.72, 0.5), 9.0, hay2, 2)
    wood = M_wood((0.4, 0.26, 0.13), "forkwood", axis="Z", grain=1.2)
    iron = M_wrought()
    top = Vector((0.66, -0.3, 1.18))
    bot = Vector((0.98, -0.32, 0.0))
    sweep([bot, top], 0.024, wood, segs=8, name="forkhandle")
    ang = math.atan2(top.x - bot.x, top.z - bot.z)
    with sub(loc=tuple(top), rot=(0, ang, 0)):
        box((0.22, 0.03, 0.035), iron, loc=(0, 0, 0.02), bev=0.008)
        cyl(0.03, 0.08, iron, loc=(0, 0, -0.02), seg=10)
        for x in (-0.1, 0.0, 0.1):
            sweep(catmull([(x, 0, 0.02), (x * 1.1, -0.02, 0.16), (x * 1.12, -0.05, 0.32)], 5),
                  lambda s: 0.013 * (1 - 0.8 * s), iron, segs=6, name="tine")
    gb = [(rng.uniform(-0.8, 0.9), rng.uniform(-0.62, -0.42), 0.004) for _ in range(40)]
    gd = [(rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(0.0, 0.1)) for _ in range(40)]
    blades(gb, straw, rng, h=(0.06, 0.16), w=0.012, dirs=gd, segs=2, name="loosestraw")
    view(pitch=9)


@deco("deco_village_lamppost", (64, 192))
def build_village_lamppost():
    iron = pbr("lampiron", (0.085, 0.085, 0.095), metal=1, rough=0.36, noise_rough=0.12,
               pattern="rust", rust=(0.2, 0.09, 0.05), scale=5.0)
    brass = M_brass()
    lathe([(0.0, 0.0), (0.3, 0.0), (0.3, 0.07), (0.25, 0.11), (0.25, 0.2), (0.19, 0.25),
           (0.16, 0.38), (0.11, 0.44), (0.0, 0.44)], iron, seg=8, sharp=30,
          rot=(0, 0, rad(22.5)), name="base")
    lathe([(0.0, 0.44), (0.075, 0.44), (0.06, 0.62), (0.052, 2.2), (0.0, 2.2)], iron, seg=32,
          name="pole", radial=lambda a, t: 1 + 0.07 * max(0.0, math.cos(12 * a)))
    for z, r in ((0.62, 0.075), (1.3, 0.066), (2.05, 0.07), (2.2, 0.09)):
        torus(r, 0.018, iron, loc=(0, 0, z), seg=32, rseg=8)
    cyl(0.021, 0.7, iron, rot=(0, rad(90), 0), loc=(0, 0, 2.1), seg=10, name="ladderbar")
    for sx in (-1, 1):
        sphere(0.04, brass, loc=(sx * 0.36, 0, 2.1), seg=14, rings=8)
        curl = [(sx * 0.05, 0.0, 2.24), (sx * 0.2, 0.0, 2.2), (sx * 0.27, 0.0, 2.06),
                (sx * 0.21, 0.0, 1.94), (sx * 0.13, 0.0, 1.97), (sx * 0.14, 0.0, 2.04),
                (sx * 0.19, 0.0, 2.03)]
        curve_tube(curl, 0.016, iron, name="scroll")
    # lantern: square frustum turned 45deg so a face points at the camera
    s2 = math.sqrt(2)
    zb, zt = 2.3, 2.84
    lathe([(0.0, 2.22), (0.1 * s2, 2.22), (0.17 * s2, 2.28), (0.18 * s2, 2.3), (0.13 * s2, 2.33),
           (0.0, 2.33)], iron, seg=4, sharp=30, rot=(0, 0, rad(45)), name="lampbase")
    glass = pbr("lampglass", (1.0, 0.86, 0.6), rough=0.12, trans=0.55, ior=1.45,
                emit=(1.0, 0.6, 0.22), emit_str=1.6, spec=0.6)
    lathe([(0.135 * s2, zb), (0.195 * s2, zt)], glass, seg=4, cap=False, rot=(0, 0, rad(45)),
          name="panes", smooth=False)
    for sx in (-1, 1):
        for sy in (-1, 1):
            sweep([(sx * 0.14, sy * 0.14, zb - 0.02), (sx * 0.2, sy * 0.2, zt + 0.01)], 0.017,
                  iron, segs=6, name="corner")
    for z, hw in ((zb + 0.01, 0.14), ((zb + zt) / 2, 0.17), (zt, 0.2)):
        for sy in (-1, 1):
            box((2 * hw + 0.02, 0.022, 0.022), iron, loc=(0, sy * hw, z))
        for sx in (-1, 1):
            box((0.022, 2 * hw + 0.02, 0.022), iron, loc=(sx * hw, 0, z))
    lathe([(0.0, zt), (0.25 * s2, zt), (0.25 * s2, zt + 0.04), (0.21 * s2, zt + 0.06),
           (0.06 * s2, zt + 0.24), (0.04 * s2, zt + 0.27), (0.0, zt + 0.27)], iron, seg=4,
          sharp=30, rot=(0, 0, rad(45)), name="roof")
    sphere(0.045, brass, loc=(0, 0, zt + 0.31), seg=14, rings=8)
    torus(0.05, 0.012, iron, loc=(0, 0, zt + 0.4), rot=(rad(90), 0, 0), seg=20, rseg=6)
    candle((0, 0, zb + 0.02), 0.035, 0.16, drip_seed=4, power=0, light=False, flame_h=0.16)
    point_light((0, -0.05, zb + 0.28), (1.0, 0.62, 0.28), 60, 0.08)
    point_light((0, -0.5, zb + 0.25), (1.0, 0.62, 0.28), 10, 0.2)
    view(pitch=6, glow=0.9, fill=0.97)


# =============================================================================
#  GRAVEYARD
# =============================================================================
def M_gravestone(name, color=(0.27, 0.27, 0.28), z0=0.0, z1=0.35, scale=2.6):
    return M_stone(name, color, scale=scale, crack=0.006, moss=True, moss_z0=z0, moss_z1=z1,
                   moss_color=(0.06, 0.085, 0.03), dark=tuple(c * 0.4 for c in color))


def grave_grass(rng, xs, y, n=10, rx=0.1, h=(0.06, 0.2), name="grass"):
    gb = []
    for x in xs:
        gb += tuft_bases(rng, x, y, n, rx, 0.05)
    return blades(gb, M_grass("gravegrass", (0.075, 0.1, 0.04)), rng, h=h, w=0.022, name=name)


@deco("deco_grave_tomb1", (72, 96))
def build_grave_tomb1():
    rng = random.Random(31)
    st = M_gravestone("tomb1stone", (0.3, 0.3, 0.31), -0.1, 0.35)
    base_m = M_gravestone("tomb1base", (0.24, 0.235, 0.235), -0.1, 0.1)
    engr = pbr("engrave", (0.05, 0.05, 0.055), rough=0.95)
    W, H0 = 0.84, 0.92
    half = [(0.0, 0.0), (W / 2, 0.0), (W / 2, H0), (W / 2 + 0.035, H0 + 0.035),
            (W / 2 - 0.01, H0 + 0.075)]
    half += arc_pts(0.0, H0 + 0.075, W / 2 - 0.01, 0.0, math.pi / 2, n=14)[1:]
    out = mirror_x(half)
    out = jitter_outline(out, rng, 0.008)
    # a chipped corner at the upper right
    out = [(x - 0.035, z - 0.03) if (x > 0.3 and z > 1.02) else (x, z) for (x, z) in out]
    box((1.02, 0.36, 0.13), base_m, loc=(0, 0, 0.065), bev=0.02, name="plinth")
    D = 0.17
    with sub(loc=(0, 0, 0.12), rot=(rad(-3), rad(3.5), 0)):
        slab = extrude(out, D, st, bev=0.02, name="slab")
        cutters = []
        cutters.append(extrude(shape_cross(0.24, 0.34, 0.06, 0.24, 0.012), 0.04, engr,
                               loc=(0, -D / 2, 0.86), name="c_cross"))
        cutters.append(text_obj("R.I.P", 0.15, 0.02, engr, loc=(0, -D / 2, 0.64), name="c_text"))
        for z, w in ((0.44, 0.44), (0.34, 0.32), (0.26, 0.38)):
            cutters.append(box((w, 0.04, 0.022), engr, loc=(0, -D / 2, z), name="c_line"))
        arc = [(x * 0.84, (z - H0) * 0.84 + H0 - 0.02) for (x, z) in half[3:]]
        path = [(x, -D / 2, z) for (x, z) in mirror_x([(W / 2 * 0.84, 0.18)] + arc)[:-1]]
        cutters.append(sweep(path[: len(path)], 0.012, engr, segs=6, name="c_border"))
        for c in cutters:
            boolean(slab, c)
    grave_grass(rng, (-0.45, -0.15, 0.2, 0.48), -0.2, 12, 0.1, name="grass")
    bake_coords()
    view(pitch=6)


def celtic_braid(p0, p1, amp, y, mat, n_cross=4, r=0.011):
    """Two interlaced strands running from p0 to p1 (x, z) at depth y."""
    p0, p1 = Vector((p0[0], 0, p0[1])), Vector((p1[0], 0, p1[1]))
    d = p1 - p0
    L = d.length
    t_ = d.normalized()
    nrm = Vector((-t_.z, 0, t_.x))
    for ph in (0.0, math.pi):
        pts = []
        for i in range(n_cross * 12 + 1):
            s = i / (n_cross * 12)
            a = s * n_cross * math.pi + ph
            q = p0 + d * s + nrm * amp * math.sin(a)
            pts.append((q.x, y - 0.006 * math.cos(a + math.pi / 2), q.z))
        sweep(pts, r, mat, segs=6, name="braid")


@deco("deco_grave_tomb2", (64, 112))
def build_grave_tomb2():
    rng = random.Random(32)
    st = M_gravestone("celtstone", (0.28, 0.28, 0.3), 0.1, 0.7)
    recess = M_gravestone("celtrecess", (0.15, 0.15, 0.16), 0.1, 0.7, scale=4.0)
    box((0.86, 0.56, 0.16), st, loc=(0, 0, 0.08), bev=0.025, name="base")
    extrude([(-0.34, 0.0), (0.34, 0.0), (0.27, 0.42), (-0.27, 0.42)], 0.4, st,
            loc=(0, 0, 0.16), bev=0.02, name="block")
    box((0.62, 0.36, 0.06), st, loc=(0, 0, 0.61), bev=0.015, name="blockcap")
    z0 = 0.64
    D = 0.2
    cross = shape_cross(1.0, 1.36, 0.26, 0.96, flare=0.035)
    cr = extrude(cross, D, st, loc=(0, 0, z0), bev=0.022, name="cross")
    inner = shape_cross(0.91, 1.27, 0.17, 0.915, flare=0.02)
    cut = extrude(inner, 0.04, recess, loc=(0, -D / 2, z0 + 0.045), name="c_panel")
    boolean(cr, cut)
    zc = z0 + 0.96
    torus(0.33, 0.05, st, loc=(0, 0, zc), rot=(rad(90), 0, 0), seg=64, rseg=10, rz=1.9,
          name="ring")
    torus(0.33, 0.012, recess, loc=(0, -0.095, zc), rot=(rad(90), 0, 0), seg=64, rseg=6,
          name="ringgroove")
    ys = -D / 2 + 0.018
    sphere(0.07, st, loc=(0, ys, zc), scale=(1, 0.55, 1), seg=20, rings=10, name="boss")
    pts = []
    for i in range(121):
        th = TAU * i / 120
        rr = 0.12 * math.cos(3 * th)
        pts.append((rr * math.cos(th), ys - 0.004 * math.sin(6 * th), zc + rr * math.sin(th)))
    sweep(pts, 0.011, st, segs=6, caps=False, name="triquetra")
    celtic_braid((0, z0 + 0.1), (0, zc - 0.16), 0.045, ys, st, n_cross=5)
    celtic_braid((0, zc + 0.16), (0, z0 + 1.3), 0.04, ys, st, n_cross=2)
    for sx in (-1, 1):
        celtic_braid((sx * 0.16, zc), (sx * 0.43, zc), 0.035, ys, st, n_cross=2)
        sphere(0.035, st, loc=(sx * 0.46, ys, zc), scale=(1, 0.5, 1), seg=12, rings=6)
    sphere(0.035, st, loc=(0, ys, z0 + 1.33), scale=(1, 0.5, 1), seg=12, rings=6)
    grave_grass(rng, (-0.38, -0.1, 0.18, 0.4), -0.3, 11, 0.1, name="grass")
    bake_coords()
    view(pitch=6)


@deco("deco_grave_tomb3", (96, 80))
def build_grave_tomb3():
    rng = random.Random(33)
    st = M_gravestone("brokenstone", (0.29, 0.285, 0.28), -0.05, 0.4)
    fresh = M_stone("brokenfresh", (0.4, 0.38, 0.35), scale=6.0, crack=0.003)
    engr = pbr("engrave", (0.05, 0.05, 0.055), rough=0.95)
    W = 0.8
    D = 0.17
    brk = [(-W / 2, 0.86), (-0.3, 0.95), (-0.24, 0.84), (-0.12, 1.0), (0.0, 0.9), (0.08, 1.02),
           (0.18, 0.88), (0.28, 0.97), (W / 2, 0.8)]
    stump = [(-W / 2, 0.0), (W / 2, 0.0)] + list(reversed(brk))
    box((0.98, 0.38, 0.12), M_gravestone("brokenbase", (0.23, 0.225, 0.225), -0.1, 0.1),
        loc=(-0.22, 0, 0.06), bev=0.02, name="plinth")
    with sub(loc=(-0.22, 0, 0.11), rot=(0, rad(-5), 0)):
        sl = extrude(stump, D, st, bev=0.015, name="stump")
        cuts = [text_obj("MDCC", 0.13, 0.02, engr, loc=(0, -D / 2, 0.55), name="c_text")]
        for z, w in ((0.36, 0.42), (0.27, 0.3)):
            cuts.append(box((w, 0.04, 0.02), engr, loc=(0, -D / 2, z), name="c_line"))
        for c in cuts:
            boolean(sl, c)
        # rough break surface on top
        for (x, z) in brk[1:-1]:
            ico(0.035, fresh, loc=(x, 0, z - 0.02), subdiv=1, scale=(1.2, 2.2, 0.6))
    # fallen arched top piece, lying on its edge to the right
    top = [(x, z - 0.8) for (x, z) in brk]
    top += [(W / 2, 0.26)] + [(x, z) for (x, z) in arc_pts(0.0, 0.26, W / 2, 0.0, math.pi, n=18)[1:-1]] + [(-W / 2, 0.26)]
    top = jitter_outline(top, rng, 0.006, keep=lambda x, z: False)
    beta = rad(102)
    cb, sb_ = math.cos(beta), math.sin(beta)
    tp = [(x * cb + z * sb_, -x * sb_ + z * cb) for (x, z) in top]
    mnx = min(p[0] for p in tp)
    mnz = min(p[1] for p in tp)
    piece = extrude(top, D, st, loc=(0.1 - mnx, -0.16, -mnz), rot=(0, beta, 0), bev=0.015,
                    name="fallen")
    # rubble
    for (x, y, s_) in ((0.28, -0.32, 0.07), (0.1, -0.36, 0.045), (0.5, -0.4, 0.05),
                       (-0.62, -0.28, 0.05), (0.72, -0.3, 0.035)):
        displace(ico(s_, st, loc=(x, y, s_ * 0.5), subdiv=2, scale=(1.3, 1.0, 0.75),
                     rot=(0, 0, rng.uniform(0, 3))), 0.015, 0.2)
    grave_grass(rng, (-0.6, -0.3, 0.0, 0.3, 0.62), -0.3, 10, 0.1, name="grass")
    bake_coords()
    view(pitch=6)


@deco("deco_grave_angel", (96, 192))
def build_grave_angel():
    rng = random.Random(34)
    stone = M_stone("angelstone", (0.4, 0.4, 0.42), scale=1.4, crack=0.003, moss=True,
                    moss_z0=0.9, moss_z1=1.5, moss_color=(0.07, 0.09, 0.04),
                    dark=(0.17, 0.17, 0.19))
    ped = M_gravestone("angelped", (0.26, 0.255, 0.26), 0.0, 0.5, scale=2.4)
    box((1.24, 0.86, 0.18), ped, loc=(0, 0, 0.09), bev=0.03, name="plinth")
    box((0.92, 0.64, 0.64), ped, loc=(0, 0, 0.5), bev=0.02, name="die")
    box((1.1, 0.78, 0.14), ped, loc=(0, 0, 0.89), bev=0.03, name="cornice")
    box((0.98, 0.7, 0.05), ped, loc=(0, 0, 0.22), bev=0.012)
    engr = pbr("engrave", (0.05, 0.05, 0.055), rough=0.95)
    plaque = extrude([(-0.3, 0.0), (0.3, 0.0), (0.3, 0.46), (-0.3, 0.46)], 0.03,
                     M_gravestone("angelplaque", (0.34, 0.335, 0.33), -0.5, 0.0),
                     loc=(0, -0.33, 0.26), bev=0.012, name="plaque")
    cuts = [text_obj("IN PACE", 0.075, 0.02, engr, loc=(0, -0.345, 0.6), name="c_text")]
    cuts.append(extrude(shape_cross(0.14, 0.2, 0.035, 0.14, 0.006), 0.04, engr,
                        loc=(0, -0.345, 0.32), name="c_cross"))
    for c in cuts:
        boolean(plaque, c)
    # ivy creeping up the left corner of the pedestal
    ivy = pbr("ivy", (0.07, 0.16, 0.05), rough=0.45, sss=0.2, sss_radius=(0.3, 1.0, 0.2),
              coat=0.3)
    vine = pbr("vine", (0.16, 0.12, 0.07), rough=0.8)
    vp = catmull([(-0.62, -0.3, 0.0), (-0.48, -0.34, 0.25), (-0.4, -0.33, 0.48), (-0.47, -0.34, 0.68),
                  (-0.36, -0.4, 0.9), (-0.2, -0.42, 0.97)], 6)
    sweep(vp, 0.012, vine, segs=6, name="vine")
    for i in range(3, len(vp) - 1, 2):
        p = vp[i]
        a = rng.uniform(-35, 35) + (0 if (i // 2) % 2 else 180)
        leaf((p.x, p.y - 0.02, p.z), rng.uniform(0.07, 0.11), 0.045, (0, rad(-a), 0), ivy,
             depth=0.01)
    # ---- the weeping figure ----
    with sub(loc=(0, 0.02, 0.96)):
        robe = [(0.0, 0.0), (0.4, 0.0), (0.39, 0.08), (0.33, 0.45), (0.27, 0.85), (0.22, 1.1),
                (0.19, 1.26), (0.0, 1.26)]
        lathe(robe, stone, seg=72, sy=0.78, name="robe",
              radial=lambda a, t: 1 + 0.1 * math.sin(13 * a + 0.4) * (1 - t) ** 1.1
              + 0.035 * math.sin(29 * a) * (1 - t))
        sphere(0.5, stone, loc=(0, 0.0, 1.42), scale=(0.38, 0.29, 0.5), seg=32, rings=16,
               name="torso")
        for sx in (-1, 1):
            sphere(0.095, stone, loc=(sx * 0.18, 0.0, 1.6), seg=16, rings=10, name="shoulder")
        with sub(loc=(0, -0.05, 1.7), rot=(rad(30), 0, 0)):
            cyl(0.055, 0.12, stone, loc=(0, 0, 0.03), seg=16)
            sphere(0.12, stone, loc=(0, -0.01, 0.16), scale=(1.0, 1.05, 1.15), seg=32, rings=16,
                   name="head")
            veil = lathe([(0.0, 0.33), (0.09, 0.31), (0.145, 0.24), (0.155, 0.1), (0.18, -0.04),
                          (0.24, -0.2), (0.3, -0.42)], stone, seg=40, cap=False,
                         a0=rad(-20), a1=rad(200), name="veil",
                         radial=lambda a, t: 1 + 0.06 * math.sin(9 * a) * t)
            solidify(veil, 0.022)
        for sx in (-1, 1):
            arm = catmull([(sx * 0.2, 0.0, 1.6), (sx * 0.25, -0.1, 1.42), (sx * 0.16, -0.22, 1.5),
                           (sx * 0.06, -0.25, 1.74)], 8)
            sweep(arm, lambda t: 0.055 + 0.015 * math.sin(t * math.pi), stone, segs=12, name="arm")
            # hanging bell sleeve
            sl = catmull([(sx * 0.23, -0.12, 1.42), (sx * 0.26, -0.14, 1.28),
                          (sx * 0.22, -0.16, 1.14)], 6)
            sweep(sl, lambda t: 0.07 * (1 - 0.6 * t), stone, segs=10, ellipse=(0.6, 1.0),
                  name="sleeve")
            sphere(0.06, stone, loc=(sx * 0.05, -0.27, 1.8), scale=(0.8, 0.55, 1.25), seg=16,
                   rings=10, name="hand")
        # wings folded upward behind the figure
        edge = catmull([(0.1, 1.56), (0.3, 1.88), (0.5, 2.24), (0.64, 2.56), (0.68, 2.8)], 10)
        m = len(edge)
        for sx in (-1, 1):
            for row, (L0, L1, w, dy) in enumerate(((0.28, 1.18, 0.09, 0.28), (0.2, 0.62, 0.09, 0.22),
                                                   (0.12, 0.3, 0.07, 0.16))):
                nf = (10, 8, 7)[row]
                for k in range(nf):
                    u = k / (nf - 1)
                    x, z = edge[min(int(u * (m - 1)), m - 1)]
                    ang = -96 + 14 * u
                    L = L0 + (L1 - L0) * u ** 0.9
                    a = ang if sx > 0 else 180 - ang
                    feather((sx * x, z + 0.02), L, w, a, stone, y=dy + 0.012 * k, name="feather")
            sweep([(sx * x, 0.16, z + 0.03) for (x, z) in edge], lambda t: 0.055 - 0.025 * t,
                  stone, segs=10, name="wingarm")
    bake_coords()
    view(pitch=5, fill=0.97)


@deco("deco_grave_deadtree", (192, 288))
def build_grave_deadtree():
    rng = random.Random(1313)
    bark = pbr("bark", (0.09, 0.075, 0.065), rough=0.9, pattern="wood", axis="Z", grain=0.7,
               dark=(0.02, 0.017, 0.015), stain=0.45, bump=0.7, bump_scale=14)
    segs_log = []

    def grow(p, d, L, r0, depth, jit=0.5):
        n = 6
        pts = [Vector(p)]
        dd = Vector(d).normalized()
        cur = Vector(p)
        for i in range(n):
            j = Vector((rng.uniform(-0.45, 0.45), rng.uniform(-0.15, 0.15),
                        rng.uniform(-0.2, 0.32)))
            dd = (dd + j * jit).normalized()
            if abs(cur.y + dd.y * L / n) > 0.28:
                dd.y *= -0.5
                dd.normalize()
            cur = cur + dd * (L / n)
            pts.append(cur.copy())
        path = catmull(pts, 4)
        r1 = max(r0 * 0.55, 0.005)
        rf = (lambda s, r0=r0, r1=r1: r0 + (r1 - r0) * s ** 0.85)
        rad_fn = None
        if r0 > 0.04:
            ph = rng.uniform(0, TAU)
            rad_fn = (lambda s, th, ph=ph: 1 + 0.09 * math.sin(7 * th + s * 11 + ph)
                      + 0.05 * math.sin(3 * th - s * 5))
        sweep(path, rf, bark, segs=max(5, min(16, int(r0 * 90))), radial=rad_fn, name="branch")
        segs_log.append((path, rf, depth))
        if depth == 0:
            return
        kids = 2 if depth >= 3 else rng.choice((2, 2, 3))
        for k in range(kids):
            t = 1.0 if k == 0 else rng.uniform(0.35, 0.85)
            idx = min(int(t * (len(path) - 1)), len(path) - 1)
            q = path[idx]
            tang = (path[min(idx + 1, len(path) - 1)] - path[max(idx - 1, 0)]).normalized()
            side = (1 if k % 2 else -1) * (1 if rng.random() < 0.5 else -1)
            ang = rad(rng.uniform(10, 24) if k == 0 else rng.uniform(26, 48)) * side
            ca, sa = math.cos(ang), math.sin(ang)
            nd = Vector((tang.x * ca - tang.z * sa, tang.y + rng.uniform(-0.25, 0.25),
                         tang.x * sa + tang.z * ca))
            if nd.z < -0.2:
                nd.z = -0.2
            grow(q, nd, L * rng.uniform(0.6, 0.76), rf(t) * (0.85 if k == 0 else 0.62), depth - 1)
    grow((0.0, 0.0, 0.05), (0.08, 0.0, 1.0), 1.45, 0.2, 5, jit=0.26)
    # roots flaring along the ground
    for k, (a, L) in enumerate(((-0.3, 0.62), (0.4, 0.58), (2.6, 0.7), (3.3, 0.55), (-1.6, 0.4),
                                (1.3, 0.45))):
        ex, ey = math.cos(a) * L, math.sin(a) * L * 0.5
        path = catmull([(0.0, 0.0, 0.38), (ex * 0.35, ey * 0.35, 0.12), (ex * 0.7, ey * 0.7, 0.03),
                        (ex, ey, 0.0)], 6)
        sweep(path, lambda s: 0.12 * (1 - s) ** 1.2 + 0.012, bark, segs=10, name="root")
    # knot hole on the trunk
    trunk = segs_log[0][0]
    zi = min(range(len(trunk)), key=lambda i: abs(trunk[i].z - 0.75))
    p = trunk[zi]
    rr = segs_log[0][1](zi / (len(trunk) - 1))
    sphere(0.06, pbr("hole", (0.01, 0.006, 0.004), rough=1.0), loc=(p.x + 0.02, p.y - rr * 0.8, p.z),
           scale=(0.8, 0.5, 1.4), seg=16, rings=8)
    torus(0.06, 0.02, bark, loc=(p.x + 0.02, p.y - rr * 0.78, p.z), rot=(rad(90), 0, 0),
          scale=(0.85, 1.4, 1.0), seg=24, rseg=8)
    # mound + grass
    lathe([(0.0, 0.1), (0.4, 0.08), (0.8, 0.03), (1.0, 0.0), (0.0, 0.0)], M_dirt("treedirt", (0.1, 0.08, 0.06)),
          seg=40, sy=0.45, name="mound")
    grave_grass(rng, (-0.8, -0.5, -0.2, 0.25, 0.55, 0.85), -0.3, 12, 0.12, h=(0.06, 0.22))
    # a crow perched on a near-horizontal branch on the right
    cands = []
    for path, rf, depth in segs_log:
        if depth not in (2, 3):
            continue
        for i in range(4, len(path) - 4):
            tg = (path[i + 1] - path[i - 1]).normalized()
            if abs(tg.z) < 0.35 and path[i].x > 0.35 and path[i].z > 1.5:
                cands.append((path[i].z, path[i], rf(i / (len(path) - 1)), tg))
    if cands:
        cands.sort(key=lambda c: -c[0])
        _, p, r, tg = cands[min(2, len(cands) - 1)]
        feathers = pbr("crowfeather", (0.012, 0.012, 0.016), rough=0.45, coat=0.15,
                       coat_rough=0.3)
        face = -1 if tg.x > 0 else 1
        with sub(loc=(p.x, p.y - 0.02, p.z + r + 0.005), scale=0.3):
            with sub(rot=(0, 0, 0), scale=(1.0 if face > 0 else 1.0)):
                sphere(0.5, feathers, loc=(0, 0, 0.32), scale=(0.62, 0.36, 0.38),
                       rot=(0, rad(-20 * face), 0), seg=24, rings=12, name="crowbody")
                sphere(0.17, feathers, loc=(face * 0.3, 0, 0.52), seg=16, rings=10, name="crowhead")
                cone(0.07, 0.2, pbr("beak", (0.03, 0.03, 0.03), rough=0.3),
                     loc=(face * 0.42, 0, 0.52), rot=(0, rad(90 * face), 0), seg=10)
                sphere(0.03, M_glow("croweye", (1.0, 0.15, 0.05), 2.5), loc=(face * 0.38, -0.12, 0.57),
                       seg=8, rings=4)
                extrude([(0.0, -0.04), (0.0, 0.04), (-0.45, -0.02), (-0.5, -0.14)], 0.12, feathers,
                        loc=(-face * 0.25, 0, 0.2), rot=(0, 0, 0 if face > 0 else math.pi), name="tail")
                for dx in (-0.06, 0.06):
                    sweep([(dx, 0.0, 0.18), (dx, 0.0, 0.0)], 0.02, pbr("beak", (0.03, 0.03, 0.03)),
                          segs=6)
    view(pitch=5, fill=0.97)


@deco("deco_grave_fence", (192, 96))
def build_grave_fence():
    rng = random.Random(41)
    iron = pbr("fenceiron", (0.075, 0.072, 0.078), metal=1, rough=0.4, noise_rough=0.12,
               pattern="rust", rust=(0.24, 0.1, 0.05), scale=6.0)
    st = M_gravestone("fencepier", (0.27, 0.265, 0.265), 0.0, 0.45, scale=3.0)
    for sx in (-1, 1):
        x = sx * 1.84
        box((0.4, 0.4, 0.14), st, loc=(x, 0, 0.07), bev=0.02, name="pierbase")
        box((0.32, 0.32, 1.44), st, loc=(x, 0, 0.14 + 0.72), bev=0.015, name="pier")
        box((0.4, 0.4, 0.1), st, loc=(x, 0, 1.63), bev=0.02, name="piercap")
        lathe([(0.0, 1.68), (0.19 * math.sqrt(2), 1.68), (0.0, 1.86)], st, seg=4, sharp=30,
              rot=(0, 0, rad(45)), loc=(x, 0, 0), name="pyramid")
        sphere(0.085, st, loc=(x, 0, 1.93), seg=16, rings=10)
    for z in (0.22, 1.06, 1.3):
        box((3.36, 0.045, 0.055), iron, loc=(0, 0, z), bev=0.008, name="rail")
    nb = 17
    spear = mirror_x([(0.0, -0.02), (0.035, 0.03), (0.06, 0.1), (0.03, 0.18), (0.0, 0.26)])
    for i in range(nb):
        x = -1.52 + 3.04 * i / (nb - 1)
        tall = i % 2 == 0
        top = 1.6 if tall else 1.45
        lean = rng.uniform(-1.2, 1.2)
        if i == 11:
            lean = 8.0
        with sub(loc=(x, 0, 0.06), rot=(0, rad(lean), 0)):
            cyl(0.024, top - 0.06, iron, loc=(0, 0, (top - 0.06) / 2), seg=10, name="bar")
            if i == 5:
                continue      # broken-off finial
            if tall:
                sphere(0.035, iron, loc=(0, 0, top - 0.05), seg=12, rings=8)
                extrude(spear, 0.035, iron, loc=(0, 0, top - 0.04), bev=0.008, name="spear")
            else:
                sphere(0.042, iron, loc=(0, 0, top - 0.02), seg=12, rings=8)
    for i in range(nb - 1):
        x = -1.52 + 3.04 * (i + 0.5) / (nb - 1)
        torus(0.078, 0.012, iron, loc=(x, 0, 1.18), rot=(rad(90), 0, 0), seg=28, rseg=6,
              name="ring")
        curl = [(x, 0, 0.22)]
        for k in range(1, 14):
            t = k / 13
            a = math.pi * 1.4 * t
            rr = 0.06 * (1 - 0.5 * t)
            curl.append((x + rr * math.sin(a) * (1 if i % 2 else -1), 0, 0.22 + 0.12 * t + rr * (1 - math.cos(a)) * 0.4))
        curve_tube(curl, 0.01, iron, kind="POLY", name="scroll")
    ivy = pbr("ivy", (0.07, 0.16, 0.05), rough=0.45, sss=0.2, sss_radius=(0.3, 1.0, 0.2), coat=0.3)
    vine = pbr("vine", (0.16, 0.12, 0.07), rough=0.8)
    vp = catmull([(-1.62, -0.05, 0.0), (-1.4, -0.06, 0.3), (-1.1, -0.06, 0.2), (-0.85, -0.06, 0.52),
                  (-0.6, -0.06, 0.9), (-0.3, -0.06, 1.1), (-0.05, -0.06, 1.25)], 6)
    sweep(vp, 0.013, vine, segs=6, name="vine")
    for i in range(2, len(vp) - 1, 2):
        p = vp[i]
        a = rng.uniform(-35, 35) + (0 if (i // 2) % 2 else 180)
        leaf((p.x, p.y - 0.02, p.z), rng.uniform(0.08, 0.12), 0.05, (0, rad(-a), 0), ivy,
             depth=0.01)
    grave_grass(rng, list(np.linspace(-1.8, 1.8, 12)), -0.12, 9, 0.12, h=(0.06, 0.22))
    bake_coords()
    view(pitch=5)


# =============================================================================
#  GATE / CASTLE
# =============================================================================
@deco("deco_gate_banner", (64, 192), anchor="top")
def build_gate_banner():
    vel = M_velvet("bannervelvet", (0.34, 0.012, 0.024))
    gth = M_goldthread()
    gold = M_gold()
    iron = M_wrought()
    hw = 0.42
    ztop = -0.08

    def zb(x):
        return -2.5 - 0.4 * (1 - abs(x) / hw)

    def fn(u, v):
        x0 = -hw + 2 * hw * u
        z = ztop + v * (zb(x0) - ztop)
        y = (0.045 * math.sin(u * TAU * 2.5 + 0.8) * (0.3 + 0.7 * v)
             + 0.02 * math.sin(v * math.pi) - 0.012 * math.sin(u * math.pi))
        x = x0 * (1 - 0.035 * v) + 0.018 * math.sin(v * math.pi * 1.1)
        return (x, y, z)

    def fm(u, v):
        x0 = -hw + 2 * hw * u
        ds = min(u, 1 - u) * 2 * hw
        db = (1 - v) * (ztop - zb(x0))
        d = min(ds, db)
        if d < 0.05 or 0.085 < d < 0.1:
            return 1
        return 0
    surface(fn, 56, 180, [vel, gth], face_mat=fm, thick=0.018, name="banner")
    # crest: gold winged blood-drop under a crown, framed by a ring
    ymin = min(fn(u / 20, v / 20)[1] for u in range(4, 17) for v in range(5, 10))
    yc = ymin - 0.025
    zc = -1.02
    with sub(loc=(0, yc, zc)):
        wing = [(0.05, 0.05), (0.12, 0.14), (0.21, 0.19), (0.3, 0.24), (0.34, 0.16),
                (0.3, 0.1), (0.27, 0.11), (0.25, 0.03), (0.21, 0.05), (0.18, -0.04),
                (0.14, -0.01), (0.1, -0.09), (0.06, -0.04)]
        for sx in (-1, 1):
            extrude([(sx * x, z) for (x, z) in wing], 0.025, gold, bev=0.006, name="wing")
            for (x, z) in ((0.3, 0.24), (0.34, 0.16)):
                sphere(0.012, gold, loc=(sx * x, -0.015, z), seg=8, rings=4)
        drop = arc_pts(0.0, 0.0, 0.075, math.pi - 0.62, TAU + 0.62, n=24) + [(0.0, 0.17)]
        inflate(drop, 0.045, M_gem("bannergem", (0.85, 0.0, 0.04), glow=0.6), rings=5,
                loc=(0, -0.02, -0.04), name="drop")
        torus(0.1, 0.014, gold, loc=(0, -0.005, -0.02), rot=(rad(90), 0, 0), seg=40, rseg=6,
              scale=(0.85, 1.0, 1.1))
        crown = [(-0.11, 0.0), (0.11, 0.0), (0.13, 0.11), (0.065, 0.06), (0.0, 0.14),
                 (-0.065, 0.06), (-0.13, 0.11)]
        extrude(crown, 0.025, gold, loc=(0, 0, 0.2), bev=0.006, name="crown")
        for (x, z) in ((-0.13, 0.11), (0.0, 0.14), (0.13, 0.11)):
            sphere(0.018, gold, loc=(x, -0.01, 0.2 + z), seg=10, rings=6)
        # small cross below
        extrude(shape_cross(0.1, 0.2, 0.03, 0.14, 0.008), 0.02, gold, loc=(0, 0, -0.42),
                bev=0.005, name="smallcross")
    # rod, sleeve, cord, ring
    cyl(0.026, 1.0, iron, rot=(0, rad(90), 0), seg=12, name="rod")
    cyl(0.06, 0.88, vel, rot=(0, rad(90), 0), loc=(0, 0, -0.03), seg=24, name="sleeve")
    for sx in (-1, 1):
        lathe([(0.0, 0.0), (0.04, 0.02), (0.05, 0.06), (0.02, 0.1), (0.0, 0.14)], gold, seg=16,
              loc=(sx * 0.5, 0, 0), rot=(0, rad(90 * sx), 0), name="finial")
        sweep(catmull([(sx * 0.42, 0, 0.02), (sx * 0.22, 0, 0.22), (sx * 0.03, 0, 0.42)], 6),
              0.012, M_goldthread(), segs=6, name="cord")
    torus(0.05, 0.013, gold, loc=(0, 0, 0.47), rot=(rad(90), 0, 0), seg=24, rseg=6)
    # tassels at the tip and the two lower corners

    def tassel(x, y, z, L=0.24):
        sweep([(x, y, z), (x, y, z - 0.07)], 0.008, gth, segs=6)
        lathe([(0.0, 0.0), (0.03, -0.015), (0.035, -0.045), (0.018, -0.06), (0.05, -0.09),
               (0.062, -L + 0.02), (0.0, -L)], gth, seg=32, loc=(x, y, z - 0.06),
              radial=lambda a, t: 1 + 0.12 * max(0.0, math.sin(24 * a)) * (t > 0.4))
    for u in (0.0, 0.5, 1.0):
        x, y, z = fn(u, 1.0)
        tassel(x, y, z)
    view(pitch=5, fill=0.97, glow=0.25)


@deco("deco_gate_portcullis", (144, 192))
def build_gate_portcullis():
    rng = random.Random(51)
    st = M_stone("gatestone", (0.28, 0.265, 0.255), scale=2.6, crack=0.01, moss=True, moss_z0=0.0,
                 moss_z1=0.5, moss_color=(0.06, 0.08, 0.03))
    key_m = M_stone("keystone", (0.33, 0.31, 0.3), scale=3.0, crack=0.008)
    iron = pbr("portiron", (0.3, 0.28, 0.27), metal=1, rough=0.5, noise_rough=0.15,
               pattern="rust", rust=(0.26, 0.11, 0.05), scale=3.0)
    void = pbr("passage", (0.0, 0.0, 0.0), rough=1.0, spec=0.0, emit=(0.05, 0.055, 0.08),
               emit_str=1.0)
    w_in, hs = 1.5, 1.95
    r_in = w_in / 2
    r_out = r_in + 0.32
    D = 0.56
    n = 9
    for i in range(n):
        a0 = math.pi - math.pi * i / n - 0.008
        a1 = math.pi - math.pi * (i + 1) / n + 0.008
        ro = r_out + (0.1 if i == n // 2 else 0.0)
        inner = [(r_in * math.cos(a0 + (a1 - a0) * k / 4), hs + r_in * math.sin(a0 + (a1 - a0) * k / 4))
                 for k in range(5)]
        outer = [(ro * math.cos(a0 + (a1 - a0) * k / 4), hs + ro * math.sin(a0 + (a1 - a0) * k / 4))
                 for k in range(5)]
        extrude(inner + outer[::-1], D + (0.08 if i == n // 2 else 0.0),
                key_m if i == n // 2 else st, bev=0.03, name="voussoir")
    wj = r_out - r_in
    zc, k = 0.0, 0
    while zc < hs - 0.01:
        hgt = min(0.34 if k % 2 == 0 else 0.26, hs - zc)
        for sx in (-1, 1):
            ext = 0.07 if k % 2 == 0 else 0.0
            x0 = sx * w_in / 2
            x1 = sx * (w_in / 2 + wj + ext)
            extrude([(x0, zc + 0.008), (x1, zc + 0.008), (x1, zc + hgt - 0.008), (x0, zc + hgt - 0.008)],
                    D, st, bev=0.03, name="jamb")
        zc += hgt
        k += 1
    for sx in (-1, 1):    # impost blocks
        box((wj + 0.14, D + 0.08, 0.12), key_m, loc=(sx * (w_in / 2 + wj / 2 + 0.02), 0, hs - 0.02),
            bev=0.02, name="impost")
    opening = [(-r_in, 0.0), (r_in, 0.0)] + [(r_in * math.cos(math.pi * i / 32), hs + r_in * math.sin(math.pi * i / 32))
                                            for i in range(33)]
    extrude(opening, 0.04, void, y0=0.24, name="void")
    box((w_in + 0.3, D + 0.1, 0.07), key_m, loc=(0, -0.02, 0.035), bev=0.02, name="threshold")
    # ---- portcullis grid (raised a little), clipped to the arch ----
    lift = 0.36
    bm = bmesh.new()
    xs = [-0.63 + 0.18 * i for i in range(8)]
    for x in xs:
        bm_box(bm, (0.09, 0.08, 3.0), Matrix.Translation((x, -0.02, lift + 1.5)))
    zs = [lift + 0.18 + 0.33 * i for i in range(9)]
    for z in zs:
        bm_box(bm, (w_in + 0.2, 0.05, 0.075), Matrix.Translation((0, 0.035, z)))
    grid = bm_obj("portcullis", bm, iron, sharp=30)
    bevel(grid, 0.01, 1)
    cutter = extrude([(x * 0.995, z) for (x, z) in opening], 1.0, None, name="clip")
    boolean(grid, cutter, op="INTERSECT")

    def ztop(x):
        return hs + math.sqrt(max(0.0, r_in ** 2 - x * x))
    for x in xs:
        cone(0.05, 0.22, iron, loc=(x, -0.02, lift + 0.01), rot=(math.pi, 0, 0), seg=8, name="spike")
        for z in zs:
            if z < ztop(x) - 0.06:
                sphere(0.022, iron, loc=(x, -0.065, z), scale=(1, 0.6, 1), seg=10, rings=6)
    # chains disappearing into the arch
    for sx in (-1, 1):
        chain([(sx * 0.66, 0.1, lift + 2.2), (sx * 0.66, 0.1, 3.0)], iron, link_len=0.12, wire=0.016)
    # carved skull on the keystone
    skull2((0, -D / 2 - 0.08, hs + r_in + 0.2), 0.2, key_m)
    for sx in (-1, 1):
        # iron torch rings on the jambs
        torus(0.06, 0.014, iron, loc=(sx * (w_in / 2 + 0.18), -D / 2 - 0.05, 1.35),
              rot=(rad(90), 0, 0), seg=20, rseg=6)
        sphere(0.03, iron, loc=(sx * (w_in / 2 + 0.18), -D / 2 - 0.02, 1.41), seg=10, rings=6)
    bake_coords()
    view(pitch=6, fill=0.97)


@deco("deco_gate_brazier", (72, 120))
def build_gate_brazier():
    rng = random.Random(52)
    iron = M_darkiron()
    wr = M_wrought()
    for k in range(3):
        a = TAU * k / 3 - math.pi / 2
        c, s_ = math.cos(a), math.sin(a)
        pts = [(0.15 * c, 0.15 * s_, 1.02), (0.3 * c, 0.3 * s_, 0.88), (0.46 * c, 0.46 * s_, 0.52),
               (0.5 * c, 0.5 * s_, 0.2), (0.56 * c, 0.56 * s_, 0.07)]
        sweep(catmull(pts, 6), lambda t: 0.042 - 0.01 * t, wr, segs=10, name="leg")
        sphere(0.07, wr, loc=(0.58 * c, 0.58 * s_, 0.05), scale=(1.2, 1.2, 0.72), seg=16, rings=8,
               name="paw")
        for tz in (-0.5, 0.0, 0.5):
            ta = a + tz
            cone(0.022, 0.09, wr, loc=(0.58 * c + 0.06 * math.cos(ta), 0.58 * s_ + 0.06 * math.sin(ta), 0.03),
                 rot=(0, rad(90), ta), seg=6, name="claw")
        curl = []
        for i in range(16):
            t = i / 15
            ang = t * TAU * 0.95
            rr = 0.09 * (1 - 0.7 * t)
            px = 0.45 + 0.12 - rr * math.cos(ang)
            pz = 0.6 + rr * math.sin(ang)
            curl.append((px * c, px * s_, pz))
        curve_tube(curl, 0.016, wr, kind="POLY", name="curl")
    lathe([(0.0, 0.28), (0.05, 0.28), (0.07, 0.34), (0.045, 0.4), (0.04, 0.8), (0.07, 0.86),
           (0.06, 0.92), (0.12, 1.02), (0.0, 1.02)], wr, seg=24, name="stem")
    torus(0.47, 0.02, wr, loc=(0, 0, 0.5), seg=64, rseg=8, name="legring")
    for k in range(3):
        a = TAU * k / 3 - math.pi / 2
        sweep([(0.05 * math.cos(a), 0.05 * math.sin(a), 0.36), (0.46 * math.cos(a), 0.46 * math.sin(a), 0.5)],
              0.016, wr, segs=6)
    prof = [(0.12, 1.0), (0.3, 1.05), (0.45, 1.15), (0.56, 1.29), (0.6, 1.36)]
    bowl = lathe([(0.0, 1.0)] + prof, iron, seg=64, cap=False, name="bowl",
                 radial=lambda a, t: 1 + 0.03 * max(0.0, math.cos(16 * a)) * t)
    solidify(bowl, 0.03)
    torus(0.6, 0.032, wr, loc=(0, 0, 1.36), seg=64, rseg=10, name="rim")
    torus(0.51, 0.02, wr, loc=(0, 0, 1.2), seg=64, rseg=8, name="band")
    for k in range(14):
        a = TAU * k / 14
        sphere(0.018, M_brass(), loc=(0.52 * math.cos(a), 0.52 * math.sin(a), 1.2), seg=8, rings=4)
    for k in range(12):
        a = TAU * (k + 0.5) / 12
        c, s_ = math.cos(a), math.sin(a)
        with sub(loc=(0.6 * c, 0.6 * s_, 1.37), rot=(0, 0, a)):
            cone(0.035, 0.2, wr, rot=(0, rad(28), 0), seg=8, name="spike")
    coal = pbr("coal", (0.045, 0.03, 0.02), rough=0.85, pattern="veins", density=5.0, width=0.09,
               vein_color=(1.0, 0.28, 0.03), strength=7.0)
    lathe([(0.0, 1.3), (0.52, 1.3), (0.4, 1.36), (0.0, 1.4)], M_glow("embers", (1.0, 0.3, 0.04), 2.5),
          seg=40, name="embermound")
    for i in range(22):
        a = rng.uniform(0, TAU)
        rr = math.sqrt(rng.random()) * 0.46
        displace(ico(rng.uniform(0.05, 0.085), coal, loc=(rr * math.cos(a), rr * math.sin(a),
                                                          1.36 + rng.uniform(-0.02, 0.05)),
                     subdiv=2, scale=(1.2, 1.1, 0.7), rot=(0, 0, rng.uniform(0, 3))), 0.02, 0.15)
    flame((0.0, -0.02, 1.34), 0.98, power=160)
    flame((0.2, -0.08, 1.32), 0.62, lean=16, light=False)
    flame((-0.21, -0.05, 1.32), 0.56, lean=-18, light=False)
    flame((0.06, 0.14, 1.33), 0.74, lean=6, light=False)
    flame((-0.1, -0.2, 1.34), 0.42, lean=-8, light=False)
    flame((0.32, 0.05, 1.33), 0.36, lean=24, light=False)
    spark = M_glow("spark", (1.0, 0.55, 0.12), 8.0, base=(1.0, 0.6, 0.2))
    for i in range(12):
        sphere(rng.uniform(0.012, 0.022), spark, loc=(rng.uniform(-0.4, 0.4), rng.uniform(-0.2, 0.1),
                                                     rng.uniform(2.05, 2.75)), seg=8, rings=4)
    point_light((0, -0.6, 1.1), (1.0, 0.45, 0.12), 25, 0.3)
    view(pitch=7, glow=1.0, fill=0.97)


# =============================================================================
#  HALL
# =============================================================================
@deco("deco_hall_armor", (72, 160))
def build_hall_armor():
    steel = pbr("armorsteel", (0.66, 0.67, 0.7), metal=1, rough=0.24, noise_rough=0.1,
                bump=0.05, bump_scale=30)
    dsteel = pbr("armordark", (0.2, 0.2, 0.22), metal=1, rough=0.32, noise_rough=0.1)
    gold = M_gold()
    leather = M_leather((0.18, 0.08, 0.04), "armorleather")
    vel = M_velvet("capevelvet", (0.26, 0.01, 0.02))
    wood = M_wood((0.2, 0.09, 0.04), "armorstand", axis="X", grain=1.3, coat=0.4, coat_rough=0.2)
    box((0.86, 0.62, 0.16), wood, loc=(0, 0, 0.08), bev=0.02, name="stand")
    box((0.9, 0.66, 0.03), gold, loc=(0, 0, 0.145), bev=0.008)
    z0 = 0.16
    # cape behind

    def cape(u, v):
        x = (-0.34 + 0.68 * u) * (1 + 0.55 * v)
        y = 0.22 + 0.05 * v + 0.04 * math.sin(u * TAU * 3 + 0.5) * v
        z = 2.12 - v * 1.72 + 0.03 * math.sin(u * TAU * 2.2) * v
        return (x, y, z)
    surface(cape, 32, 48, vel, thick=0.02, name="cape")
    for sx in (-1, 1):
        x = sx * 0.155
        # sabaton
        sphere(0.5, steel, loc=(x, -0.1, z0 + 0.05), scale=(0.16, 0.36, 0.1), seg=24, rings=12)
        for k in range(3):
            torus(0.07, 0.012, steel, loc=(x, -0.14 - k * 0.05, z0 + 0.07), rot=(rad(80), 0, 0),
                  sx=1.1, seg=24, rseg=6)
        lathe([(0.07, z0 + 0.08), (0.08, z0 + 0.18), (0.095, z0 + 0.38), (0.092, z0 + 0.5),
               (0.078, z0 + 0.6), (0.084, z0 + 0.64)], steel, seg=32, loc=(x, 0, 0), sy=0.92,
              name="greave", radial=lambda a, t: 1 + 0.08 * math.exp(-((a - 1.5 * math.pi) / 0.35) ** 2))
        sphere(0.1, steel, loc=(x, -0.03, z0 + 0.69), scale=(1.0, 1.1, 0.9), seg=24, rings=12, name="poleyn")
        extrude(mirror_x([(0.0, -0.08), (0.06, -0.04), (0.07, 0.04), (0.0, 0.08)]), 0.018, steel,
                loc=(x + sx * 0.08, -0.06, z0 + 0.69), rot=(0, 0, rad(sx * 40)), bev=0.005, name="kneefan")
        lathe([(0.1, z0 + 0.76), (0.12, z0 + 0.88), (0.13, z0 + 1.06), (0.125, z0 + 1.16)], steel, seg=32,
              loc=(x, 0, 0), name="cuisse")
        # tasset plates over the thighs
        tas = lathe([(0.19, z0 + 1.34), (0.21, z0 + 1.02)][::-1], steel, seg=24, cap=False,
                    loc=(x * 0.8, 0.0, 0), a0=rad(200), a1=rad(340), name="tasset")
        solidify(tas, 0.012)
        torus(0.2, 0.01, gold, loc=(x * 0.8, 0.0, z0 + 1.02), a0=rad(200), a1=rad(340), seg=16, rseg=6)
        for k in range(3):
            torus(0.2 + 0.002 * k, 0.008, dsteel, loc=(x * 0.8, 0, z0 + 1.12 + 0.08 * k),
                  a0=rad(205), a1=rad(335), seg=16, rseg=6)
    for k in range(4):
        zt = z0 + 1.46 - 0.075 * k
        band = lathe([(0.25 + 0.018 * k, zt), (0.27 + 0.018 * k, zt - 0.095)], steel, seg=48,
                     cap=False, sy=0.74, name="fauld")
        solidify(band, 0.012)
    lathe([(0.22, z0 + 1.44), (0.25, z0 + 1.52), (0.29, z0 + 1.66), (0.3, z0 + 1.8), (0.27, z0 + 1.92),
           (0.2, z0 + 2.0), (0.14, z0 + 2.04), (0.0, z0 + 2.05)], steel, seg=64, sy=0.72,
          name="cuirass", radial=lambda a, t: 1 + 0.07 * math.exp(-((a - 1.5 * math.pi) / 0.32) ** 2))
    torus(0.225, 0.014, gold, loc=(0, 0, z0 + 1.45), sy=0.74, seg=48, rseg=6)
    torus(0.19, 0.014, gold, loc=(0, 0, z0 + 2.0), sy=0.74, seg=48, rseg=6)
    lathe([(0.15, z0 + 2.0), (0.14, z0 + 2.08), (0.12, z0 + 2.17), (0.0, z0 + 2.17)], steel, seg=32,
          sy=0.9, name="gorget")
    for k in range(2):
        torus(0.15 - 0.012 * k, 0.012, dsteel, loc=(0, 0, z0 + 2.05 + 0.055 * k), sy=0.9, seg=32,
              rseg=6)
    # pauldrons
    for sx in (-1, 1):
        with sub(loc=(sx * 0.33, 0.0, z0 + 1.96), rot=(0, rad(-sx * 28), 0)):
            sphere(0.17, steel, scale=(1.08, 0.95, 0.72), seg=32, rings=16, name="pauldron")
            for k in range(3):
                lm = lathe([(0.165 + 0.01 * k, -0.04 - 0.07 * k), (0.18 + 0.01 * k, -0.12 - 0.07 * k)],
                           steel, seg=40, cap=False, sy=0.9, name="lame")
                solidify(lm, 0.012)
            torus(0.19 + 0.02, 0.012, gold, loc=(0, 0, -0.26), sy=0.9, seg=40, rseg=6)
        extrude([(0.0, 0.0), (0.12, 0.0), (0.1, 0.1), (0.02, 0.14)], 0.02, steel,
                loc=(sx * 0.2, 0.0, z0 + 2.07), rot=(0, 0, 0) if sx > 0 else (0, 0, math.pi),
                bev=0.006, name="haute")
    # arms resting on the sword pommel
    grip_z = z0 + 1.4
    for sx in (-1, 1):
        sh = Vector((sx * 0.36, 0.0, z0 + 1.82))
        el = Vector((sx * 0.4, -0.1, z0 + 1.5))
        wr_ = Vector((sx * 0.07, -0.36, grip_z + 0.06))
        sweep([sh, sh.lerp(el, 0.5), el], 0.07, steel, segs=16, name="rerebrace")
        sphere(0.085, steel, loc=el, seg=20, rings=10, name="couter")
        extrude(mirror_x([(0.0, -0.07), (0.06, -0.03), (0.06, 0.04), (0.0, 0.07)]), 0.016, steel,
                loc=(el.x + sx * 0.07, el.y - 0.02, el.z), rot=(0, 0, rad(sx * 30)), bev=0.005,
                name="elbowfan")
        sweep([el, el.lerp(wr_, 0.5), wr_], lambda t: 0.066 - 0.012 * t, steel, segs=16, name="vambrace")
        sphere(0.5, steel, loc=(sx * 0.055, -0.39, grip_z + 0.08 - 0.02 * (sx > 0)),
               scale=(0.16, 0.13, 0.11), seg=20, rings=10, name="gauntlet")
        for k in range(3):
            box((0.018, 0.1, 0.03), dsteel, loc=(sx * (0.02 + 0.03 * k), -0.44, grip_z + 0.04),
                rot=(rad(-20), 0, 0), bev=0.006)
    # greatsword planted point-down
    blade = pbr("blade", (0.8, 0.82, 0.86), metal=1, rough=0.16)
    extrude(mirror_x([(0.0, 0.0), (0.03, 0.08), (0.05, 0.3), (0.052, 1.02), (0.0, 1.02)]), 0.022,
            blade, loc=(0, -0.42, z0 + 0.005), bev=0.006, name="swordblade")
    box((0.014, 0.004, 0.8), dsteel, loc=(0, -0.432, z0 + 0.6), name="fuller")
    box((0.44, 0.05, 0.045), gold, loc=(0, -0.42, z0 + 1.05), bev=0.012, name="guard")
    for sx in (-1, 1):
        sphere(0.035, gold, loc=(sx * 0.23, -0.42, z0 + 1.03), seg=12, rings=8)
    cyl(0.028, 0.3, leather, loc=(0, -0.42, z0 + 1.22), seg=12, name="grip")
    sphere(0.05, gold, loc=(0, -0.42, z0 + 1.4), scale=(1, 0.7, 1), seg=16, rings=8, name="pommel")
    # great helm
    hz = z0 + 2.17
    lathe([(0.0, hz), (0.14, hz), (0.155, hz + 0.08), (0.16, hz + 0.3), (0.13, hz + 0.39),
           (0.06, hz + 0.43), (0.0, hz + 0.44)], steel, seg=40, sy=1.08, name="helm")
    dark = pbr("slit", (0.005, 0.004, 0.004), rough=0.9)
    box((0.26, 0.03, 0.028), dark, loc=(0, -0.168, hz + 0.24), name="eyeslit")
    box((0.04, 0.02, 0.33), gold, loc=(0, -0.172, hz + 0.18), bev=0.006, name="nasal")
    box((0.3, 0.02, 0.03), gold, loc=(0, -0.168, hz + 0.29), bev=0.006, name="brow")
    for k in range(6):
        sphere(0.009, dark, loc=(0.07 + (k % 2) * 0.03, -0.165, hz + 0.08 + (k // 2) * 0.035), seg=6,
               rings=4)
    torus(0.158, 0.012, gold, loc=(0, 0, hz + 0.01), sy=1.08, seg=40, rseg=6)
    lathe([(0.0, 0.0), (0.03, 0.0), (0.035, 0.05), (0.0, 0.08)], gold, seg=16, loc=(0, 0, hz + 0.43))
    plume = M_velvet("plume", (0.5, 0.02, 0.03))
    for k in range(7):
        off = (k - 3) * 0.02
        pts = catmull([(0.0, 0.02, hz + 0.48), (0.05 + off, 0.04, hz + 0.66 + off), (0.2 + off * 2, 0.08, hz + 0.72),
                       (0.34 + off * 2, 0.1, hz + 0.58 - abs(off) * 2), (0.4 + off, 0.1, hz + 0.4 + off * 3)], 6)
        sweep(pts, lambda t: 0.012 + 0.04 * math.sin(math.pi * min(1.0, t * 1.2)) ** 0.7, plume, segs=8,
              name="plume")
    view(pitch=6, fill=0.97, glow=0.0)


@deco("deco_hall_vase", (64, 96))
def build_hall_vase():
    glaze = M_glaze("vaseglaze", (0.3, 0.015, 0.03),
                    bands=((0.0, 0.035), (0.33, 0.35), (0.7, 0.72), (0.9, 0.925), (0.975, 1.0)),
                    pat_band=(0.37, 0.68), n_ang=12, n_z=6.0)
    gold = M_gold()
    prof = [(0.0, 0.0), (0.2, 0.0), (0.22, 0.03), (0.17, 0.07), (0.13, 0.12), (0.16, 0.18),
            (0.29, 0.34), (0.38, 0.52), (0.4, 0.66), (0.36, 0.84), (0.25, 1.0), (0.15, 1.1),
            (0.13, 1.2), (0.15, 1.3), (0.21, 1.38), (0.22, 1.41), (0.19, 1.41), (0.12, 1.3),
            (0.1, 1.18), (0.0, 1.16)]
    lathe(prof, glaze, seg=64, name="vase")
    lathe([(0.0, 1.17), (0.1, 1.19), (0.115, 1.3), (0.0, 1.3)], pbr("vaseinside", (0.01, 0.005, 0.005),
                                                                   rough=0.8), seg=32)
    torus(0.205, 0.016, gold, loc=(0, 0, 1.405), seg=48, rseg=8)
    torus(0.2, 0.018, gold, loc=(0, 0, 0.012), seg=48, rseg=8)
    for sx in (-1, 1):
        pts = catmull([(sx * 0.33, 0, 0.86), (sx * 0.46, 0, 0.94), (sx * 0.47, 0, 1.12),
                       (sx * 0.34, 0, 1.26), (sx * 0.16, 0, 1.27)], 8)
        sweep(pts, 0.026, gold, segs=10, name="handle")
        curl = [(sx * (0.46 + 0.05 * math.sin(a)), 0.0, 0.93 - 0.05 * math.cos(a) + 0.05)
                for a in np.linspace(0, math.pi * 1.6, 12)]
        curve_tube(curl, 0.014, gold, kind="POLY", name="curl")
    # a few dried roses
    stem = pbr("stem", (0.06, 0.08, 0.03), rough=0.6)
    rose = pbr("rose", (0.16, 0.0, 0.02), rough=0.55, sheen=0.5, sss=0.2, sss_radius=(1.0, 0.2, 0.2))
    for (dx, h, lean) in ((-0.05, 0.42, -18), (0.04, 0.5, 8), (0.1, 0.36, 26)):
        a = rad(lean)
        top = (dx + math.sin(a) * h, 0.0, 1.2 + math.cos(a) * h)
        sweep(catmull([(dx * 0.5, 0.0, 1.15), (dx + math.sin(a) * h * 0.5, 0.0, 1.2 + math.cos(a) * h * 0.55), top], 5),
              0.011, stem, segs=6, name="stem")
        for k in range(5):
            ph = TAU * k / 5
            sphere(0.035, rose, loc=(top[0] + 0.022 * math.cos(ph), top[1] + 0.022 * math.sin(ph), top[2] + 0.01),
                   scale=(0.8, 0.8, 1.2), seg=12, rings=8)
        sphere(0.03, rose, loc=(top[0], top[1], top[2] + 0.04), seg=12, rings=8)
        leaf((dx + math.sin(a) * h * 0.5, -0.01, 1.2 + math.cos(a) * h * 0.5), 0.07, 0.03,
             (0, rad(-40 if lean > 0 else -140), 0), pbr("dryleaf", (0.1, 0.1, 0.04), rough=0.6),
             depth=0.008)
    view(pitch=8, fill=0.97)


@deco("deco_hall_bust", (64, 120))
def build_hall_bust():
    rng = random.Random(61)
    marble = M_marble("bustmarble", (0.9, 0.89, 0.87), vein=(0.62, 0.61, 0.62), scale=1.4)
    verde = M_marble("verde", (0.06, 0.12, 0.09), vein=(0.42, 0.55, 0.46), scale=1.8)
    gold = M_gold()
    box((0.64, 0.64, 0.14), verde, loc=(0, 0, 0.07), bev=0.02, name="base")
    lathe([(0.0, 0.14), (0.28, 0.14), (0.29, 0.18), (0.25, 0.22), (0.22, 0.24), (0.23, 0.28),
           (0.2, 0.3), (0.0, 0.3)], verde, seg=48, name="basemold")
    lathe([(0.0, 0.3), (0.19, 0.3), (0.175, 1.14), (0.0, 1.14)], verde, seg=64, name="shaft",
          radial=lambda a, t: 1 - 0.06 * max(0.0, math.cos(16 * a)) ** 2)
    lathe([(0.0, 1.14), (0.2, 1.14), (0.22, 1.17), (0.2, 1.2), (0.25, 1.24), (0.28, 1.27), (0.0, 1.27)],
          verde, seg=48, name="capital")
    box((0.6, 0.6, 0.08), verde, loc=(0, 0, 1.31), bev=0.015, name="abacus")
    box((0.3, 0.02, 0.04), gold, loc=(0, -0.3, 1.31), bev=0.006, name="plaque")
    torus(0.19, 0.012, gold, loc=(0, 0, 0.32), seg=48, rseg=6)
    torus(0.18, 0.012, gold, loc=(0, 0, 1.12), seg=48, rseg=6)
    lathe([(0.0, 1.35), (0.14, 1.35), (0.15, 1.38), (0.1, 1.42), (0.08, 1.47), (0.12, 1.5), (0.0, 1.5)],
          marble, seg=40, name="socle")
    lathe([(0.0, 1.48), (0.16, 1.5), (0.3, 1.56), (0.39, 1.66), (0.42, 1.78), (0.4, 1.86), (0.3, 1.93),
           (0.15, 1.97), (0.0, 1.98)], marble, seg=64, sy=0.55, sx=0.86, name="chest")
    sweep(catmull([(-0.34, -0.06, 1.86), (-0.12, -0.2, 1.74), (0.12, -0.22, 1.62), (0.34, -0.14, 1.55)], 8),
          0.07, marble, segs=12, ellipse=(1.0, 0.45), radial=lambda s, th: 1 + 0.12 * math.sin(3 * th),
          name="drape")
    sweep(catmull([(-0.3, -0.12, 1.76), (-0.05, -0.22, 1.63), (0.2, -0.2, 1.54)], 8), 0.045, marble,
          segs=10, ellipse=(1.0, 0.45), name="drape2")
    cyl(0.085, 0.26, marble, loc=(0, -0.01, 2.04), rot=(rad(6), 0, 0), seg=24, name="neck")
    with sub(loc=(0, -0.03, 2.27), rot=(0, 0, rad(38)), scale=1.25):
        sphere(0.14, marble, scale=(0.9, 1.05, 1.12), seg=32, rings=16, name="head")
        sphere(0.07, marble, loc=(0, -0.09, -0.1), scale=(1.0, 0.9, 0.8), seg=16, rings=10, name="chin")
        for sx in (-1, 1):
            sphere(0.05, marble, loc=(sx * 0.07, -0.08, -0.05), scale=(1.0, 0.8, 1.0), seg=12, rings=8)
            sphere(0.048, marble, loc=(sx * 0.125, 0.0, 0.0), scale=(0.35, 0.7, 1.1), seg=12, rings=8,
                   name="ear")
            sphere(0.025, marble, loc=(sx * 0.045, -0.118, 0.02), scale=(1.1, 0.6, 0.7), seg=10, rings=6,
                   name="eye")
        sphere(0.5, marble, loc=(0, -0.12, 0.05), scale=(0.2, 0.07, 0.05), seg=16, rings=8, name="brow")
        extrude(mirror_x([(0.0, -0.065), (0.03, -0.06), (0.012, 0.03), (0.0, 0.04)]), 0.05, marble,
                loc=(0, -0.135, -0.01), rot=(rad(-12), 0, 0), bev=0.01, name="nose")
        sphere(0.025, marble, loc=(0, -0.13, -0.09), scale=(1.4, 0.6, 0.5), seg=10, rings=6, name="lips")
        # curls
        for i in range(34):
            th = rng.uniform(-0.6 * math.pi, 1.6 * math.pi)
            ph = rng.uniform(0.15, 1.2)
            if math.sin(th) < -0.6 and ph > 0.6:
                continue
            r_ = 0.14
            x = r_ * 0.95 * math.cos(ph) * math.cos(th) * 0.9
            y = r_ * 1.05 * math.cos(ph) * math.sin(th) + 0.01
            z = r_ * 1.12 * math.sin(ph) * 0.95 + 0.01
            if y < -0.08 and z < 0.08:
                continue
            sphere(rng.uniform(0.028, 0.038), marble, loc=(x, y, z), seg=10, rings=6, name="curl")
        leafm = pbr("laurel", (1.0, 0.7, 0.26), metal=1, rough=0.22)
        for k in range(18):
            a = -math.pi * 0.5 + TAU * k / 18
            p = (0.135 * math.cos(a) * 0.95, 0.145 * math.sin(a) + 0.01, 0.075 + 0.02 * math.sin(a))
            for side in (-1, 1):
                with sub(loc=p, rot=(0, 0, a + math.pi / 2)):
                    leaf((0, 0, 0), 0.06, 0.02, (0, rad(-90 + side * 35), 0), leafm, depth=0.006)
    view(pitch=6, fill=0.97)


@deco("deco_hall_curtain", (144, 288), anchor="top")
def build_hall_curtain():
    vel = M_velvet("curtainvelvet", (0.2, 0.006, 0.014))
    gth = M_goldthread()
    gold = M_gold()
    brass = M_brass()
    H, xo, vt = 5.6, 1.42, 0.6
    ztop = -0.14

    def xin(v):
        if v < vt:
            s = v / vt
            e = 1 - (1 - s) ** 1.7
            return -0.05 + (-0.9 + 0.05) * e
        s = (v - vt) / (1 - vt)
        return -0.9 + (-0.52 + 0.9) * s ** 0.75

    def panel(u, v):
        xi = xin(v)
        w = xi + xo
        comp = max(0.0, 1 - w / (xo - 0.05))
        A = 0.06 + 0.17 * comp
        x = -xo + u * w
        ph = u * TAU * 4.5 + 0.5 * math.sin(u * TAU * 1.7) + 0.4 + 0.3 * v
        y = A * (0.75 * math.sin(ph) + 0.25 * math.sin(2.3 * ph + 1.0)) + 0.04 * (1 - u)
        y -= 0.13 * math.exp(-((v - vt + 0.035) / 0.045) ** 2) * (0.4 + 0.6 * u)
        x -= 0.05 * math.exp(-((v - vt + 0.035) / 0.05) ** 2) * u
        z = ztop - v * H + 0.04 * math.sin(u * TAU * 4.5 + 0.4) * (v > 0.97) * (v - 0.97) * 30
        return (x, y, z)

    def fm(u, v):
        return 1 if (u > 0.965 or v > 0.985) else 0
    for sx in (-1, 1):
        fn = panel if sx < 0 else (lambda u, v: (lambda p: (-p[0], p[1], p[2]))(panel(u, v)))
        surface(fn, 72, 150, [vel, gth], face_mat=fm, thick=0.022, name="panel")
        # tie-back rope + tassel
        zt = ztop - vt * H
        cx = sx * (-xo + (xin(vt) + xo) / 2)
        wt = (xin(vt) + xo) / 2 + 0.06
        torus(wt, 0.035, gth, loc=(cx, -0.04, zt), sx=1.0, sy=0.62 / wt * 0.5, seg=48, rseg=8,
              rot=(0, rad(-sx * 8), 0), name="tieback")
        tx = sx * (xin(vt) + 0.02) * -1 * -1
        tx = sx * -(-xin(vt) - 0.04)
        sweep(catmull([(cx + sx * wt * 0.9, -0.15, zt), (tx + sx * 0.02, -0.24, zt - 0.14),
                       (tx + sx * 0.03, -0.24, zt - 0.3)], 5), 0.014, gth, segs=6, name="tasselcord")
        tz = zt - 0.3
        lathe([(0.0, 0.0), (0.045, -0.02), (0.05, -0.06), (0.03, -0.09), (0.08, -0.14), (0.1, -0.4),
               (0.0, -0.43)], gth, seg=32, loc=(tx + sx * 0.03, -0.24, tz),
              radial=lambda a, t: 1 + 0.12 * max(0.0, math.sin(26 * a)) * (t > 0.45), name="tassel")
        sphere(0.05, gold, loc=(tx + sx * 0.03, -0.24, tz - 0.07), seg=16, rings=8)
    # valance with three swags, gold fringe and tassels

    def zb(u):
        return -0.55 - 0.32 * math.sin(math.pi * ((u * 3) % 1.0))

    def val(u, v):
        x = -1.5 + 3.0 * u
        z = -0.06 + v * (zb(u) + 0.06)
        f = math.sin(math.pi * ((u * 3) % 1.0))
        y = -0.18 - 0.1 * f * v ** 0.8 + 0.018 * math.sin(v * TAU * 3.2) * f
        return (x, y, z)
    surface(val, 150, 40, [vel, gth], face_mat=lambda u, v: 1 if v > 0.94 else 0, thick=0.02,
            name="valance")

    def fringe(u, v):
        x, y, z = val(u, 1.0)
        return (x, y - 0.005, z - v * 0.15)
    surface(fringe, 150, 4, M_fringe("curtainfringe"), name="fringe")
    for u in (0.0, 1 / 3, 2 / 3, 1.0):
        x, y, z = val(u, 1.0)
        lathe([(0.0, 0.0), (0.035, -0.02), (0.04, -0.05), (0.025, -0.07), (0.07, -0.11), (0.08, -0.3),
               (0.0, -0.32)], gth, seg=32, loc=(x * 0.985, y - 0.02, z - 0.02),
              radial=lambda a, t: 1 + 0.12 * max(0.0, math.sin(26 * a)) * (t > 0.45), name="valtassel")
    # rod with finials
    cyl(0.035, 3.12, brass, rot=(0, rad(90), 0), loc=(0, -0.06, -0.03), seg=16, name="rod")
    for sx in (-1, 1):
        lathe([(0.0, 0.0), (0.055, 0.01), (0.065, 0.05), (0.04, 0.09), (0.06, 0.14), (0.0, 0.22)], brass,
              seg=24, loc=(sx * 1.56, -0.06, -0.03), rot=(0, rad(90 * sx), 0), name="finial")
        for x in (sx * 1.3, sx * 0.02):
            pass
    view(pitch=5, fill=0.97, glow=0.0)


# =============================================================================
#  CATACOMBS
# =============================================================================
def bone_mats():
    return [M_bone("bone_a", (0.82, 0.76, 0.6)), M_bone("bone_b", (0.7, 0.63, 0.48)),
            M_bone("bone_c", (0.88, 0.84, 0.72))]


@deco("deco_cata_bonepile", (144, 72))
def build_cata_bonepile():
    rng = random.Random(71)
    mats = bone_mats()
    dirt = M_dirt("bonedust", (0.19, 0.16, 0.12))
    RX, RY, HH = 1.35, 0.6, 0.42
    lathe([(0.0, HH), (0.5, HH * 0.93), (0.9, HH * 0.72), (1.15, HH * 0.45), (RX, 0.0), (0.0, 0.0)],
          dirt, seg=48, sy=RY / RX, name="mound")

    def h(x, y):
        return HH * math.sqrt(max(0.0, 1 - (x / RX) ** 2 - (y / RY) ** 2))
    for i in range(34):
        while True:
            x, y = rng.uniform(-RX, RX), rng.uniform(-RY, RY * 0.5)
            if (x / RX) ** 2 + (y / RY) ** 2 < 0.95:
                break
        L = rng.uniform(0.35, 0.62)
        r = rng.uniform(0.028, 0.04)
        a = rng.uniform(0, math.pi)
        d = Vector((math.cos(a), math.sin(a) * 0.5, 0))
        p0 = Vector((x, y, 0)) - d * L / 2
        p1 = Vector((x, y, 0)) + d * L / 2
        p0.z = h(p0.x, p0.y) + r * 0.6
        p1.z = h(p1.x, p1.y) + r * 0.6
        long_bone(p0, p1, r, mats[i % 3])
    for (x, y, zz, a) in ((-0.5, -0.1, 0.9, 0.5), (0.55, 0.05, 0.85, -0.6), (1.0, -0.2, 0.55, 0.9)):
        base = Vector((x, y, h(x, y) - 0.05))
        tip = base + Vector((math.sin(a) * zz * 0.6, -0.05, zz * 0.8))
        long_bone(base, tip, 0.036, mats[0])
    for i in range(10):
        x, y = rng.uniform(-1.0, 1.0), rng.uniform(-0.45, 0.2)
        rib((x, y, h(x, y) + 0.02), rng.uniform(0.18, 0.26), rng.uniform(0.2, 0.6), rng.uniform(2.0, 2.6),
            0.02, mats[i % 3], rot=(rad(rng.uniform(40, 80)), 0, rng.uniform(0, math.pi)))
    for (x, y, s, yaw, pitch) in ((-0.15, -0.05, 0.3, -15, 5), (0.35, -0.3, 0.26, 25, -10),
                                  (-0.8, -0.2, 0.25, -35, 8), (1.25, -0.45, 0.22, 40, 0),
                                  (0.85, 0.15, 0.24, 10, 15)):
        skull2((x, y, h(x, y) + s * 0.42), s, mats[2], rot=(rad(pitch), rad(rng.uniform(-10, 10)), rad(yaw)),
               jaw=rng.random() < 0.5)
    for i in range(12):
        x, y = rng.uniform(-1.3, 1.3), rng.uniform(-0.6, -0.2)
        zz = h(x, y)
        cyl(0.035, 0.05, mats[1], loc=(x, y, zz + 0.02), rot=(rad(rng.uniform(0, 90)), 0, rng.uniform(0, 3)),
            seg=10, name="vertebra")
    view(pitch=9, fill=0.97)


@deco("deco_cata_skullpile", (96, 80))
def build_cata_skullpile():
    rng = random.Random(72)
    mats = bone_mats()
    s = 0.33
    rows = (5, 4, 3, 2, 1)
    top = None
    for layer, yoff in ((1, 0.2), (0, -0.05)):
        for r_, n in enumerate(rows):
            if layer == 1 and r_ > 2:
                continue
            for i in range(n):
                x = (i - (n - 1) / 2) * 0.31 + rng.uniform(-0.015, 0.015)
                z = 0.13 + r_ * 0.25 + s * 0.42
                if layer == 1:
                    x += 0.15
                    z += 0.08
                yaw = rng.uniform(-22, 22)
                skull2((x, yoff + r_ * 0.06, z), s * rng.uniform(0.93, 1.05), mats[(i + r_) % 3],
                       rot=(rad(rng.uniform(-8, 10)), rad(rng.uniform(-8, 8)), rad(yaw)),
                       jaw=rng.random() < 0.6 or r_ == 0)
                if r_ == 4 and layer == 0:
                    top = (x, yoff + r_ * 0.06, z)
    # femur ends between the skulls + bones at the foot of the pile
    for i in range(6):
        x = (i - 2.5) * 0.3
        long_bone((x + 0.12, 0.35, 0.07), (x + 0.1, -0.3, 0.06 + rng.uniform(0, 0.02)), 0.035, mats[i % 3])
    for (a, b) in (((-0.95, -0.35, 0.04), (-0.45, -0.5, 0.04)), ((0.55, -0.45, 0.04), (1.0, -0.25, 0.05))):
        long_bone(a, b, 0.034, mats[1])
    # candle on the top skull
    if top:
        x, y, z = top
        zt = z + s * 0.47
        candle((x, y + 0.02, zt - 0.02), 0.05, 0.3, drip_seed=9, power=26)
        wax = M_wax()
        for k, (dx, L) in enumerate(((-0.07, 0.12), (0.06, 0.18), (0.0, 0.08))):
            pts = [(x + dx * (1 + 0.3 * t), y - 0.06 - 0.06 * t, zt - 0.01 - L * t) for t in np.linspace(0, 1, 6)]
            sweep(pts, lambda q: 0.014 * (1 - 0.3 * q), wax, segs=8, name="wax")
            sphere(0.016, wax, loc=pts[-1], seg=8, rings=6)
    view(pitch=8, fill=0.97, glow=0.8)


@deco("deco_cata_sarcophagus", (192, 96))
def build_cata_sarcophagus():
    rng = random.Random(73)
    st = M_stone("sarcstone", (0.32, 0.3, 0.27), scale=2.2, crack=0.008, moss=True, moss_z0=0.0,
                 moss_z1=0.45, moss_color=(0.06, 0.08, 0.03))
    lid_m = M_stone("sarclid", (0.3, 0.285, 0.26), scale=2.4, crack=0.008)
    eff = M_stone("effigy", (0.42, 0.4, 0.37), scale=1.6, crack=0.003)
    niche = M_stone("sarcniche", (0.2, 0.19, 0.17), scale=4.0, crack=0.0)
    void = pbr("void", (0.0, 0.0, 0.0), rough=1.0, spec=0.0)
    L, D = 3.4, 1.1
    box((L + 0.3, D + 0.24, 0.14), st, loc=(0, 0, 0.07), bev=0.02, name="plinth")
    box((L + 0.14, D + 0.12, 0.12), st, loc=(0, 0, 0.2), bev=0.025, name="basemold")
    chest = box((L, D, 0.86), st, loc=(0, 0, 0.26 + 0.43), bev=0.02, name="chest")
    box((L + 0.1, D + 0.1, 0.08), st, loc=(0, 0, 1.08), bev=0.02, name="topmold")
    box((L - 0.2, D - 0.2, 0.02), void, loc=(0, 0, 1.115), name="void")
    # arcaded niches carved into the front
    bm = bmesh.new()
    nN = 5
    for i in range(nN):
        cx = (i - (nN - 1) / 2) * 0.62
        w, hs = 0.42, 0.38
        pts = [(cx - w / 2, 0.38)] + [(cx + _arch_pt(0.3, 0.3 - w / 2, 0.0, t)[0], 0.38 + hs + _arch_pt(0.3, 0.3 - w / 2, 0.0, t)[1])
                                       for t in np.linspace(0, 1, 13)] + [(cx + w / 2, 0.38)]
        vs_f = [bm.verts.new((x, -D / 2 - 0.05, z)) for (x, z) in pts]
        vs_b = [bm.verts.new((x, -D / 2 + 0.05, z)) for (x, z) in pts]
        bm.faces.new(vs_f)
        bm.faces.new(vs_b[::-1])
        for k in range(len(pts)):
            j = (k + 1) % len(pts)
            bm.faces.new((vs_f[k], vs_b[k], vs_b[j], vs_f[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    cut = bm_obj("niches", bm, niche)
    boolean(chest, cut)
    for i in range(nN + 1):
        cx = (i - nN / 2) * 0.62
        cyl(0.035, 0.52, st, loc=(cx, -D / 2 - 0.02, 0.62), seg=12, name="colonnette")
        box((0.1, 0.06, 0.05), st, loc=(cx, -D / 2 - 0.02, 0.9), bev=0.01)
        box((0.1, 0.06, 0.05), st, loc=(cx, -D / 2 - 0.02, 0.36), bev=0.01)
    skull2((0, -D / 2 + 0.02, 0.6), 0.2, eff)
    for sx in (-1, 1):
        extrude(shape_cross(0.14, 0.24, 0.04, 0.16, 0.01), 0.03, eff, loc=(sx * 0.62, -D / 2 + 0.03, 0.5),
                bev=0.006)
    # ---- lid, pivoted up at the left end ----
    with sub(loc=(L / 2 + 0.08, 0, 1.12), rot=(0, rad(4.5), 0)):
        box((L + 0.12, D + 0.14, 0.2), lid_m, loc=(-(L + 0.12) / 2, 0, 0.1), bev=0.03, name="lid")
        box((L - 0.1, D - 0.1, 0.06), lid_m, loc=(-(L + 0.12) / 2, 0, 0.22), bev=0.02, name="lidtop")
        zt = 0.25
        cx0 = -(L + 0.12) / 2
        with sub(loc=(cx0, 0, zt)):
            box((0.4, 0.56, 0.14), eff, loc=(-1.3, 0, 0.07), bev=0.05, name="pillow")
            sphere(0.17, eff, loc=(-1.24, 0, 0.27), scale=(1.1, 0.9, 0.9), seg=24, rings=12, name="head")
            sphere(0.05, eff, loc=(-1.2, -0.02, 0.42), scale=(0.9, 0.8, 0.9), seg=10, rings=6, name="nose")
            lathe([(0.0, 0.0), (0.18, 0.0), (0.2, 0.06), (0.14, 0.12), (0.0, 0.14)], eff, seg=24,
                  loc=(-1.24, 0, 0.36), rot=(0, rad(90), 0), scale=0.9, name="coif")
            sphere(0.5, eff, loc=(-0.45, 0, 0.14), scale=(1.1, 0.56, 0.3), seg=32, rings=12, name="chest")
            sphere(0.5, eff, loc=(0.5, 0, 0.1), scale=(1.4, 0.48, 0.2), seg=32, rings=12, name="legs")
            for k in range(5):
                sweep(catmull([(-0.1, -0.2 + 0.1 * k, 0.16), (0.6, -0.17 + 0.085 * k, 0.17),
                               (1.15, -0.15 + 0.075 * k, 0.09)], 5), 0.028, eff, segs=6, name="fold")
            for sy in (-1, 1):
                sphere(0.5, eff, loc=(1.22, sy * 0.1, 0.2), scale=(0.14, 0.13, 0.3), seg=16, rings=8,
                       name="foot")
            with sub(loc=(-0.52, 0, 0.26), rot=(0, rad(-8), 0)):
                for sy in (-1, 1):
                    sphere(0.5, eff, loc=(0, sy * 0.032, 0.14), scale=(0.1, 0.06, 0.34), seg=16, rings=8,
                           name="hands")
                sweep([(0.12, -0.14, -0.04), (0.0, -0.05, 0.02)], 0.035, eff, segs=8, name="forearm")
                sweep([(0.12, 0.14, -0.04), (0.0, 0.05, 0.02)], 0.035, eff, segs=8, name="forearm")
            # small hound at the feet
            sphere(0.5, eff, loc=(1.48, 0, 0.13), scale=(0.28, 0.4, 0.24), seg=20, rings=10)
            sphere(0.1, eff, loc=(1.52, -0.16, 0.26), seg=14, rings=8)
    # skeletal hand reaching out of the gap
    bone = M_bone("handbone", (0.8, 0.74, 0.58))
    hx = -L / 2 + 0.35
    long_bone((hx - 0.05, 0.1, 1.15), (hx + 0.05, -D / 2 - 0.04, 1.17), 0.022, bone, knob=1.2)
    long_bone((hx - 0.1, 0.1, 1.14), (hx - 0.02, -D / 2 - 0.02, 1.16), 0.018, bone, knob=1.2)
    for k in range(4):
        fx = hx - 0.06 + k * 0.045
        pts = catmull([(fx + 0.02, -D / 2 - 0.05, 1.17), (fx + 0.01 * k, -D / 2 - 0.13, 1.14),
                       (fx, -D / 2 - 0.12, 1.02), (fx - 0.01, -D / 2 - 0.08, 0.95 + 0.02 * k)], 4)
        sweep(pts, lambda t: 0.013 * (1 - 0.4 * t), bone, segs=6, name="finger")
        for p in pts[4::4]:
            sphere(0.015, bone, loc=p, seg=8, rings=4)
    sweep(catmull([(hx - 0.12, -D / 2 - 0.05, 1.16), (hx - 0.14, -D / 2 - 0.12, 1.12),
                   (hx - 0.13, -D / 2 - 0.1, 1.04)], 4), 0.013, bone, segs=6, name="thumb")
    bake_coords()
    view(pitch=8, fill=0.97)


@deco("deco_cata_urn", (56, 80))
def build_cata_urn():
    bronze = pbr("urnbronze", (0.46, 0.27, 0.12), metal=1, rough=0.34, noise_rough=0.12,
                 pattern="rust", rust=(0.12, 0.3, 0.24), scale=2.2)
    dark = pbr("urndark", (0.12, 0.08, 0.05), metal=1, rough=0.45)
    prof = [(0.0, 0.0), (0.22, 0.0), (0.24, 0.035), (0.16, 0.08), (0.12, 0.14), (0.15, 0.2),
            (0.29, 0.36), (0.36, 0.55), (0.35, 0.72), (0.27, 0.88), (0.17, 0.96), (0.16, 1.02),
            (0.2, 1.05), (0.0, 1.05)]
    lathe(prof, bronze, seg=64, name="urn")
    for z, r in ((0.2, 0.155), (0.55, 0.362), (0.96, 0.172)):
        torus(r, 0.014, dark, loc=(0, 0, z), seg=64, rseg=6)
    lathe([(0.0, 1.05), (0.21, 1.05), (0.215, 1.08), (0.17, 1.12), (0.1, 1.2), (0.05, 1.24),
           (0.06, 1.28), (0.0, 1.29)], bronze, seg=48, name="lid")
    sphere(0.06, bronze, loc=(0, 0, 1.33), scale=(1, 1, 1.2), seg=20, rings=10, name="knob")
    for sx in (-1, 1):
        torus(0.1, 0.022, bronze, loc=(sx * 0.33, 0, 0.8), rot=(rad(90), 0, 0), a0=rad(-80), a1=rad(80),
              scale=(sx, 1, 1), seg=20, rseg=8, name="handle")
    skull2((0, -0.33, 0.62), 0.17, bronze, dark=dark)
    for sx in (-1, 1):
        long_bone((sx * 0.05, -0.34, 0.5), (sx * 0.2, -0.28, 0.4), 0.014, bronze, knob=1.4)
        long_bone((-sx * 0.05, -0.34, 0.5), (-sx * 0.2, -0.28, 0.4), 0.014, bronze, knob=1.4)
    view(pitch=8, fill=0.97)


# =============================================================================
#  LIBRARY
# =============================================================================
COVER_COLORS = [(0.34, 0.03, 0.04), (0.06, 0.15, 0.08), (0.05, 0.07, 0.19), (0.3, 0.15, 0.06),
                (0.07, 0.05, 0.05), (0.2, 0.05, 0.17), (0.36, 0.25, 0.1), (0.1, 0.18, 0.2)]


def M_cover(i):
    return pbr("cover%d" % i, COVER_COLORS[i % len(COVER_COLORS)], rough=0.45, coat=0.3,
               coat_rough=0.3, pattern="leather", scale=6.0, grain=90.0)


def M_pages():
    return pbr("pages", (0.86, 0.78, 0.6), rough=0.8, pattern="parchment", lines=True,
               line_freq=90.0, line_dir="Z", dark=(0.5, 0.38, 0.2))


def book(loc, size, idx, rot=(0, 0, 0), spine_front=True):
    """Closed book lying flat.  size = (w along x, d along y, h thickness)."""
    w, d, h = size
    cover = M_cover(idx)
    gold = M_gold()
    with sub(loc=loc, rot=(rot[0], rot[1], rot[2] + (0 if spine_front else math.pi))):
        for sz in (-1, 1):
            box((w, d, 0.016), cover, loc=(0, 0, sz * (h / 2 - 0.008)), bev=0.005, name="board")
        box((w - 0.03, d - 0.025, h - 0.03), M_pages(), loc=(0, 0.01, 0), name="pageblock")
        cyl(h / 2, w, cover, loc=(0, -d / 2 + 0.012, 0), rot=(0, rad(90), 0), scale=(1, 0.42, 1), seg=16,
            name="spine")
        for fx in (-0.36, -0.28, 0.28, 0.36):
            box((0.018, 0.02, h * 0.96), gold, loc=(fx * w, -d / 2 - 0.005, 0), name="band")


@deco("deco_lib_desk", (144, 96))
def build_lib_desk():
    rng = random.Random(81)
    wood = M_wood((0.3, 0.13, 0.06), "deskwood", axis="X", grain=1.3, coat=0.45, coat_rough=0.18)
    wood_v = M_wood((0.28, 0.12, 0.055), "deskwood_v", axis="Z", grain=1.3, coat=0.45, coat_rough=0.18)
    brass = M_brass()
    W, Dd, Ht = 2.7, 1.1, 1.14
    box((W, Dd, 0.08), wood, loc=(0, 0, Ht), bev=0.025, name="top")
    box((W - 0.24, Dd - 0.14, 0.22), wood, loc=(0, 0, Ht - 0.15), bev=0.01, name="apron")
    for sx in (-1, 1):
        box((1.0, 0.03, 0.16), wood_v, loc=(sx * 0.62, -(Dd - 0.14) / 2 - 0.01, Ht - 0.15), bev=0.012,
            name="drawer")
        sphere(0.03, brass, loc=(sx * 0.62, -(Dd - 0.14) / 2 - 0.04, Ht - 0.15), seg=12, rings=8)
        extrude(mirror_x([(0.0, -0.05), (0.04, -0.03), (0.04, 0.03), (0.0, 0.05)]), 0.01, brass,
                loc=(sx * 0.62, -(Dd - 0.14) / 2 - 0.025, Ht - 0.15), name="escutcheon")
    leg = [(0.0, 0.0), (0.055, 0.0), (0.07, 0.04), (0.05, 0.1), (0.05, 0.18), (0.085, 0.3), (0.06, 0.4),
           (0.045, 0.55), (0.07, 0.7), (0.08, 0.8), (0.075, Ht - 0.26), (0.0, Ht - 0.26)]
    for sx in (-1, 1):
        for sy in (-1, 1):
            lathe(leg, wood_v, seg=24, loc=(sx * (W / 2 - 0.2), sy * (Dd / 2 - 0.14), 0), name="leg")
        box((0.05, Dd - 0.28, 0.05), wood, loc=(sx * (W / 2 - 0.2), 0, 0.2), name="stretcher")
    box((W - 0.4, 0.05, 0.05), wood, loc=(0, 0, 0.2), name="stretcher")
    zt = Ht + 0.04
    # slanted book-stand with an open book
    with sub(loc=(-0.05, 0.12, zt + 0.08), rot=(rad(24), 0, 0)):
        box((1.0, 0.62, 0.035), wood, loc=(0, 0, 0.12), bev=0.008, name="stand")
        box((1.0, 0.05, 0.05), wood, loc=(0, -0.31, 0.16), bev=0.008, name="lip")
        box((1.02, 0.66, 0.02), M_cover(0), loc=(0, 0.0, 0.15), bev=0.006, name="bookcover")
        pages = pbr("openpages", (0.9, 0.82, 0.64), rough=0.8, pattern="parchment", lines=True,
                    line_freq=26.0, line_dir="Y", dark=(0.55, 0.4, 0.2))
        for sx in (-1, 1):
            def pg(u, v, sx=sx):
                x = sx * (0.015 + 0.47 * u)
                y = -0.3 + 0.6 * v
                z = 0.17 + 0.06 * math.sin(math.pi * min(1.0, u * 1.25)) ** 0.6 * (1 - 0.45 * u) + 0.012 * u
                return (x, y, z)
            surface(pg, 24, 12, pages, thick=0.02, name="page")
        sweep([(0.0, 0.28, 0.2), (0.02, -0.3, 0.2), (0.03, -0.38, 0.1), (0.02, -0.4, -0.05)], 0.012,
              M_velvet("ribbon", (0.5, 0.02, 0.03)), segs=6, ellipse=(1.0, 0.3), name="ribbon")
    box((0.9, 0.08, 0.24), wood, loc=(-0.05, 0.4, zt + 0.12), bev=0.01, name="standprop")
    for k, (dz, rz) in enumerate(((0.0, 4), (0.12, -6), (0.23, 10))):
        book((-1.0, 0.05, zt + 0.06 + dz), (0.62 - 0.06 * k, 0.46, 0.11), k + 2, rot=(0, 0, rad(rz)),
             spine_front=k != 1)
    # inkwell + quill
    lathe([(0.0, 0.0), (0.08, 0.0), (0.09, 0.03), (0.08, 0.1), (0.05, 0.13), (0.045, 0.16), (0.0, 0.16)],
          pbr("inkglass", (0.02, 0.03, 0.05), rough=0.08, coat=1.0), seg=24, loc=(0.62, -0.3, zt), name="inkwell")
    feather((0.63, zt + 0.12), 0.5, 0.055, 64, pbr("quill", (0.88, 0.86, 0.82), rough=0.6, sheen=0.5),
            y=-0.32, name="quill")
    # candlestick
    lathe([(0.0, 0.0), (0.12, 0.0), (0.13, 0.03), (0.08, 0.06), (0.04, 0.1), (0.035, 0.3), (0.06, 0.33),
           (0.09, 0.35), (0.0, 0.35)], brass, seg=32, loc=(0.98, -0.12, zt), name="candlestick")
    candle((0.98, -0.12, zt + 0.35), 0.045, 0.34, drip_seed=6, power=34)
    for k in range(3):
        box((0.36, 0.26, 0.004), M_parchment("loose%d" % k), loc=(0.3 + k * 0.1, -0.35 + 0.02 * k, zt + 0.004 * k),
            rot=(0, 0, rad(rng.uniform(-18, 18))), name="paper")
    view(pitch=9, fill=0.97, glow=0.8)


def M_globe():
    name = "globemap"
    if name in G.mats:
        return G.mats[name]
    m = bpy.data.materials.new(name)
    nt = m.node_tree
    nt.nodes.clear()
    out = nn(nt, "ShaderNodeOutputMaterial")
    b = nn(nt, "ShaderNodeBsdfPrincipled")
    ln(nt, b.outputs[0], out.inputs["Surface"])
    b.inputs["Roughness"].default_value = 0.45
    b.inputs["Coat Weight"].default_value = 0.5
    b.inputs["Coat Roughness"].default_value = 0.15
    tc = nn(nt, "ShaderNodeTexCoord")
    vec = tc.outputs["Object"]
    nz = noise(nt, vec, 2.2, 8.0, 0.55, 0.3)
    land = ramp(nt, nz.outputs["Fac"], [(0.5, (0, 0, 0)), (0.52, (1, 1, 1))])
    coast = ramp(nt, nz.outputs["Fac"], [(0.47, (0, 0, 0)), (0.5, (1, 1, 1)), (0.53, (0, 0, 0))])
    nz2 = noise(nt, vec, 9.0, 4.0)
    sea = ramp(nt, nz2.outputs["Fac"], [(0.3, (0.23, 0.33, 0.3)), (0.7, (0.3, 0.42, 0.36))])
    ground = ramp(nt, nz2.outputs["Fac"], [(0.3, (0.62, 0.46, 0.22)), (0.7, (0.78, 0.62, 0.34))])
    m1 = nn(nt, "ShaderNodeMix", data_type="RGBA")
    ln(nt, land, m1.inputs["Factor"])
    ln(nt, sea, m1.inputs[6])
    ln(nt, ground, m1.inputs[7])
    col = m1.outputs[2]
    # graticule
    sep = nn(nt, "ShaderNodeSeparateXYZ")
    ln(nt, vec, sep.inputs[0])
    gr = nn(nt, "ShaderNodeTexGradient", gradient_type="RADIAL")
    ln(nt, vec, gr.inputs["Vector"])
    lon = math_node(nt, "FRACT", math_node(nt, "MULTIPLY", gr.outputs["Fac"], 12.0))
    lonl = math_node(nt, "LESS_THAN", math_node(nt, "ABSOLUTE", math_node(nt, "SUBTRACT", lon, 0.5)), 0.03)
    lat = math_node(nt, "FRACT", math_node(nt, "MULTIPLY", sep.outputs["Z"], 5.0))
    latl = math_node(nt, "LESS_THAN", math_node(nt, "ABSOLUTE", math_node(nt, "SUBTRACT", lat, 0.5)), 0.04)
    grid = math_node(nt, "MAXIMUM", lonl, latl)
    bw = nn(nt, "ShaderNodeRGBToBW")
    ln(nt, coast, bw.inputs[0])
    lines = math_node(nt, "MAXIMUM", math_node(nt, "MULTIPLY", grid, 0.6), bw.outputs[0])
    m2 = nn(nt, "ShaderNodeMix", data_type="RGBA")
    ln(nt, lines, m2.inputs["Factor"])
    ln(nt, col, m2.inputs[6])
    m2.inputs[7].default_value = (0.16, 0.1, 0.05, 1)
    # aged varnish darkening toward the poles
    ln(nt, m2.outputs[2], b.inputs["Base Color"])
    G.mats[name] = m
    return m


@deco("deco_lib_globe", (72, 120))
def build_lib_globe():
    wood = M_wood((0.3, 0.14, 0.06), "globewood", axis="Z", grain=1.3, coat=0.4, coat_rough=0.2)
    brass = M_brass()
    zc, Rg = 1.34, 0.46
    for k in range(3):
        a = TAU * k / 3 - math.pi / 2
        c, s_ = math.cos(a), math.sin(a)
        pts = catmull([(0.5 * c, 0.5 * s_, 0.02), (0.58 * c, 0.58 * s_, 0.3), (0.52 * c, 0.52 * s_, 0.7),
                       (0.58 * c, 0.58 * s_, zc - 0.02)], 8)
        sweep(pts, lambda t: 0.04 + 0.012 * math.sin(t * math.pi * 2.0) ** 2, wood, segs=12, name="leg")
        sphere(0.05, brass, loc=(0.5 * c, 0.5 * s_, 0.03), scale=(1, 1, 0.7), seg=12, rings=8, name="foot")
        sweep([(0.56 * c, 0.56 * s_, 0.36), (0.05 * c, 0.05 * s_, 0.3)], 0.022, wood, segs=8, name="stretcher")
    lathe([(0.0, 0.18), (0.04, 0.2), (0.07, 0.26), (0.07, 0.34), (0.04, 0.38), (0.0, 0.38)], wood, seg=24,
          name="hub")
    torus(0.6, 0.035, wood, loc=(0, 0, zc), seg=64, rseg=10, rz=0.55, rr=1.6, name="horizon")
    torus(0.6, 0.02, brass, loc=(0, 0, zc + 0.022), seg=64, rseg=8, rz=0.3, rr=2.2, name="horizontop")
    tilt = rad(23.5)
    with sub(loc=(0, 0, zc), rot=(0, tilt, 0)):
        torus(Rg + 0.04, 0.016, brass, rot=(rad(90), 0, 0), seg=64, rseg=8, rz=1.8, name="meridian")
        sphere(Rg, M_globe(), rot=(0, 0, rad(40)), seg=64, rings=32, name="globe")
        for sz in (-1, 1):
            cyl(0.018, 0.08, brass, loc=(0, 0, sz * (Rg + 0.05)), seg=10)
            sphere(0.025, brass, loc=(0, 0, sz * (Rg + 0.09)), seg=10, rings=6)
    # support under the meridian
    lathe([(0.0, 0.38), (0.04, 0.4), (0.03, zc - Rg - 0.1), (0.07, zc - Rg - 0.06), (0.0, zc - Rg - 0.04)],
          wood, seg=20, name="column")
    view(pitch=8, fill=0.97)


@deco("deco_lib_bookstack", (72, 72))
def build_lib_bookstack():
    rng = random.Random(83)
    z = 0.0
    specs = [(1.0, 0.72, 0.16), (0.92, 0.66, 0.12), (0.95, 0.7, 0.18), (0.8, 0.6, 0.1), (0.86, 0.62, 0.14),
             (0.72, 0.52, 0.12), (0.64, 0.48, 0.09)]
    for i, (w, d, h) in enumerate(specs):
        book((rng.uniform(-0.06, 0.06), rng.uniform(-0.03, 0.03), z + h / 2), (w, d, h), i,
             rot=(0, 0, rad(rng.uniform(-14, 14))), spine_front=(i % 3 != 1))
        z += h
    brass = M_brass()
    lathe([(0.0, 0.0), (0.13, 0.0), (0.14, 0.02), (0.1, 0.03), (0.0, 0.03)], brass, seg=24,
          loc=(0.12, -0.05, z), name="saucer")
    torus(0.045, 0.01, brass, loc=(0.29, -0.05, z + 0.02), rot=(rad(90), 0, 0), seg=16, rseg=6)
    candle((0.12, -0.05, z + 0.025), 0.05, 0.16, drip_seed=12, power=22)
    view(pitch=9, fill=0.97, glow=0.8)


@deco("deco_lib_ladder", (64, 240))
def build_lib_ladder():
    wood = M_wood((0.36, 0.15, 0.07), "ladderwood", axis="Z", grain=1.4, coat=0.45, coat_rough=0.2)
    wood_h = M_wood((0.36, 0.15, 0.07), "ladderwood_h", axis="X", grain=1.4, coat=0.45, coat_rough=0.2)
    brass = M_brass()
    H = 4.4
    xb, xt = 0.52, 0.4
    for sx in (-1, 1):
        a = math.atan2(xb - xt, H)
        box((0.1, 0.075, H + 0.02), wood, loc=(sx * (xb + xt) / 2, 0, H / 2), rot=(0, rad(-sx * math.degrees(a)), 0),
            bev=0.015, name="rail")
        # brass shoe + hook at the top
        box((0.13, 0.1, 0.1), brass, loc=(sx * xb, 0, 0.05), bev=0.015, name="shoe")
        cyl(0.05, 0.035, brass, loc=(sx * (xb + 0.07), 0, 0.06), rot=(0, rad(90), 0), seg=16, name="wheel")
        hook = catmull([(sx * xt, 0.0, H - 0.1), (sx * xt, 0.0, H + 0.12), (sx * xt, 0.12, H + 0.22),
                        (sx * xt, 0.24, H + 0.14), (sx * xt, 0.25, H + 0.04)], 6)
        sweep(hook, 0.026, brass, segs=10, name="hook")
        sphere(0.034, brass, loc=hook[-1], seg=12, rings=8)
    n = 13
    for i in range(n):
        z = 0.34 + i * (H - 0.6) / (n - 1)
        hwz = xb + (xt - xb) * z / H
        cyl(0.034, 2 * hwz, wood_h, loc=(0, -0.005, z), rot=(0, rad(90), 0), seg=16, name="rung")
        for sx in (-1, 1):
            torus(0.04, 0.008, brass, loc=(sx * (hwz - 0.06), -0.005, z), rot=(0, rad(90), 0), seg=16, rseg=6)
    view(pitch=5, fill=0.97)


# ==== END OF BUILDERS ====


# =============================================================================
#  Post-processing and build driver (from build_icons_misc.py)
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


def contact_sheet(ids, path, scale=1, src_dir=PROP_DIR):
    files = []
    for i in ids:
        f = os.path.join(src_dir, i + ".png")
        if os.path.exists(f):
            files.append((i, f))
    if not files:
        return None
    try:
        font = ImageFont.load_default(size=12)
    except TypeError:
        font = ImageFont.load_default()
    bg = (22, 18, 24, 255)
    slot = (52, 44, 56, 255)
    pad = 12
    maxw = 1500
    rows, row, rw = [], [], 0
    for i, f in files:
        im = Image.open(f).convert("RGBA")
        if scale != 1:
            im = im.resize((im.width * scale, im.height * scale), Image.LANCZOS)
        if rw + im.width + pad > maxw and row:
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
            # checker-ish slot: top half lighter so dark sprites stay readable
            d.rectangle([x, y, x + im.width - 1, y + rh - 1], fill=slot)
            d.rectangle([x, y + rh - 1, x + im.width - 1, y + rh], fill=(120, 90, 60, 255))
            anchor_top = REGISTRY[i].get("anchor") == "top"
            sheet.alpha_composite(im, (x, y if anchor_top else y + rh - im.height))
            d.text((x, y + rh + 4), i.replace("deco_", ""), fill=(230, 210, 190, 255), font=font)
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
    ap.add_argument("--out-props", default=PROP_DIR)
    ap.add_argument("--contact", default=os.path.join(CONTACT_DIR, "contact_deco_a.png"))
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--contact-only", action="store_true")
    ap.add_argument("--keep-tmp", action="store_true")
    args = ap.parse_args(argv)
    args.out_icons = ICON_DIR

    ids = list(REGISTRY)
    if args.only:
        pats = [p.strip() for p in args.only.split(",") if p.strip()]
        ids = [i for i in ids if any(fnmatch.fnmatch(i, p) for p in pats)]
    if args.list:
        for i in ids:
            s = REGISTRY[i]
            print("%-26s %dx%d  %s" % (i, s["size"][0], s["size"][1], s.get("anchor", "bottom")))
        return 0
    failed = []
    if not args.contact_only:
        tmpdir = tempfile.mkdtemp(prefix="bn_decor_a_")
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
    p1 = contact_sheet(list(REGISTRY), args.contact, src_dir=args.out_props)
    base, ext = os.path.splitext(args.contact)
    p2 = contact_sheet(list(REGISTRY), base + "_x2" + ext, scale=2, src_dir=args.out_props)
    print("contact sheets:", p1, p2)
    if failed:
        print("FAILED:", failed)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
