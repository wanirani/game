#!/usr/bin/env python3
"""매트된 Kling 이미지를 퍼핏 부품으로 자르고 아틀라스(atlas.webp) + manifest.json 을 만든다.

사용:  python3 tools/painted/build_parts.py <id>
입력:  configs/<id>.json, .work/<id>/matte/*.png (matte.py 결과)
출력:  <out>/atlas.webp, <out>/manifest.json   (<out> = 설정의 "out", 예: assets/painted/bosses/b_bonedragon)
       .work/<id>/parts/<부품>.png            (시트/검수용)

단위
  src px  : 원본 Kling 이미지 픽셀 (설정의 모든 좌표)
  lps     : 논리(게임) px / src px  → 부품의 게임 내 크기를 정한다
  td      : 텍셀 / 논리 px (아틀라스 해상도, 보통 2.0). 런타임이 기기에 맞춰 더 낮게 다시 굽는다
  manifest 의 피벗/점은 아틀라스 부품 사각형 안의 텍셀 좌표

설정 (configs/<id>.json)
  "cuts": { "<원본>": {
      "punch": [ {"type":"dark", "poly":[[x,y]...], "lum":34, "open":7, "dilate":1, "k":0.98} ],     # 입 속 어두운 곳 등 투명 처리
      "masks": { "<이름>": [ {"op":"poly","pts":[[x,y]...],"feather":1.0},                          # 합집합
                              {"op":"minus","color":"red","rect":[x0,y0,x1,y1]},                      # 색 규칙 빼기 (red|green|dark|bright)
                              {"op":"minus","pts":[[x,y]...]} ] } } }                                 # 폴리곤 빼기
  "parts": [ {"name","src","lps","box":[x0,y0,x1,y1],"mask":"<이름>"|"!<이름>"(여집합)|없음,
              "pivots":{"<이름>":[x,y]}, "points":{"<이름>":[[x,y]...]}, "extra":{...그대로 복사}} ]
  "chains": [ {"prefix","src","lps","joints":[x...],"top","bot","axis","tiles":[i...],"cap":i|null,
               "splitSpines":true, "spineOverlap":24} ]
      관절 x 사이가 척추 타일 i (joints[i]..joints[i+1]). 오른쪽 = 머리 쪽. top 위의 연결 성분 = 등가시(spine), bot 아래 = 늘어진 것(흘러내림·갈비)
      splitSpines: 등가시를 따로 잘라 런타임에 길이/각도/조합을 바꿀 수 있게 함 (반복 무늬 줄이기)
  "debris": [ {"prefix","src","lps","boxes":[[x0,y0,x1,y1]...]} ]   # 상자 안 가장 큰 덩어리 → 파편 부품 (피벗 c = 무게중심, r = 반지름)
"""
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage as ndi
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from matte import load_config, matte as run_matte, ROOT  # noqa: E402

PAD = 4          # 아틀라스 부품 사이 여백(텍셀) — 쌍선형 샘플이 이웃 부품을 끌어오지 않게


class Builder:
    def __init__(self, cfg):
        self.cfg = cfg; self.td = cfg.get('td', 2.0)
        self.parts = {}      # name -> (img RGBA uint8, entry dict)
        self.groups = {}
        self._src = {}
        self.work = cfg['_work']
        os.makedirs(os.path.join(self.work, 'parts'), exist_ok=True)

    # ── 원본 ──
    def src(self, name):
        if name not in self._src:
            path = run_matte(self.cfg, name)
            S = np.asarray(Image.open(path).convert('RGBA')).astype(np.float32)
            for pu in self.cfg.get('cuts', {}).get(name, {}).get('punch', []):
                S = self.punch(S, pu)
            self._src[name] = S
        return self._src[name]

    def punch(self, S, pu):
        if pu.get('type', 'dark') == 'dark':
            lum = S[..., :3].mean(2)
            zone = poly_mask(S.shape, pu['poly'], 0) > 0.5 if 'poly' in pu else np.ones(S.shape[:2], bool)
            dark = (lum < pu.get('lum', 34)) & (S[..., 3] > 128) & zone
            o = pu.get('open', 7)
            if o: dark = ndi.binary_opening(dark, structure=np.ones((o, o)))
            if pu.get('dilate', 1): dark = ndi.binary_dilation(dark, iterations=pu.get('dilate', 1))
            S = S.copy(); S[..., 3] *= (1 - dark.astype(np.float32) * pu.get('k', 0.98))
        return S

    def mask(self, srcname, expr, shape):
        if not expr: return np.ones(shape[:2], np.float32)
        inv = expr.startswith('!'); key = expr.lstrip('!')
        ops = self.cfg['cuts'][srcname]['masks'][key]
        S = self.src(srcname)
        m = np.zeros(shape[:2], np.float32)
        for op in ops:
            if op['op'] == 'poly':
                m = np.maximum(m, poly_mask(shape, op['pts'], op.get('feather', 1.0)))
            elif op['op'] == 'rect':
                x0, y0, x1, y1 = op['rect']; m[y0:y1, x0:x1] = 1
            elif op['op'] == 'minus':
                if 'color' in op:
                    sel = color_rule(S, op['color'])
                    if 'rect' in op:
                        x0, y0, x1, y1 = op['rect']; r = np.zeros_like(sel); r[y0:y1, x0:x1] = True; sel &= r
                    m[sel] = 0
                elif 'pts' in op:
                    m *= 1 - poly_mask(shape, op['pts'], op.get('feather', 1.0))
        return 1 - m if inv else m

    # ── 저장 ──
    def save(self, name, rgba, box, lps, pivots=None, points=None, extra=None, group=None):
        x0, y0, x1, y1 = [int(round(v)) for v in box]
        H, W = rgba.shape[:2]
        x0, y0, x1, y1 = max(0, x0), max(0, y0), min(W, x1), min(H, y1)
        crop = np.clip(rgba[y0:y1, x0:x1], 0, 255).astype(np.uint8)
        im = Image.fromarray(crop, 'RGBA')
        k = lps * self.td
        w, h = max(1, round((x1 - x0) * k)), max(1, round((y1 - y0) * k))
        im = im.resize((w, h), Image.LANCZOS)
        a = np.asarray(im).astype(np.float32)
        # 투명 픽셀에 가장 가까운 불투명 색을 번지게 (쌍선형 샘플 시 검은/회색 테 방지)
        msk = a[..., 3] > 8
        if msk.any() and not msk.all():
            idx = ndi.distance_transform_edt(~msk, return_distances=False, return_indices=True)
            for c in range(3): a[..., c] = a[..., c][idx[0], idx[1]]
        img = a.astype(np.uint8)
        ent = {'lps': lps}
        for pn, (px, py) in (pivots or {}).items(): ent[pn] = [round((px - x0) * k, 2), round((py - y0) * k, 2)]
        for pn, pts in (points or {}).items(): ent[pn] = [[round((x - x0) * k, 2), round((y - y0) * k, 2)] for x, y in pts]
        if extra: ent.update(extra)
        self.parts[name] = (img, ent)
        if group: self.groups.setdefault(group, []).append(name)
        Image.fromarray(img, 'RGBA').save(os.path.join(self.work, 'parts', name + '.png'))
        return ent

    # ── 일반 부품 ──
    def build_parts(self):
        for p in self.cfg.get('parts', []):
            S = self.src(p['src'])
            m = self.mask(p['src'], p.get('mask'), S.shape)
            t = S.copy(); t[..., 3] *= m
            self.save(p['name'], t, p.get('box', [0, 0, S.shape[1], S.shape[0]]), p['lps'], p.get('pivots'), p.get('points'), p.get('extra'), p.get('group'))

    # ── 척추 체인 → 몸통 타일 + 등가시 ──
    def build_chain(self, c):
        V = self.src(c['src']); h, w = V.shape[:2]
        J, top, bot, axis = c['joints'], c['top'], c['bot'], c['axis']
        split = c.get('splitSpines', True); ov = c.get('spineOverlap', 24)
        alpha = V[..., 3] > 40
        lab_top, nt = ndi.label(alpha[:top])
        lab_bot, nb = ndi.label(alpha[bot:])

        def tile_of(x):
            for i in range(len(J) - 1):
                if J[i] <= x < J[i + 1]: return i
            return None
        # 흘러내림 다듬기: bot 아래의 가는 줄(체액 줄기)과 끝 방울은 잘라낸다 → 런타임 입자(ichor)가 세계 아래 방향으로 흘린다
        td_ = c.get('trimDrips')
        if td_:
            y0 = bot + td_.get('below', 40)
            edt = ndi.distance_transform_edt(alpha)
            thin = (edt < td_.get('thick', 7)); thin[:y0] = False
            keep = alpha & ~thin
            lab_all, _ = ndi.label(keep)
            core = set(np.unique(lab_all[top:bot][keep[top:bot]]).tolist()) - {0}
            keep &= np.isin(lab_all, list(core))
            V = V.copy(); cut = alpha & ~keep; cut[:y0] = False
            V[..., 3] *= 1 - ndi.gaussian_filter(cut.astype(np.float32), 1.0)
            alpha = V[..., 3] > 40
            lab_bot, nb = ndi.label(alpha[bot:])
        top_owner, top_base = {}, {}
        minA = c.get('spineMinArea', 1500)
        for ci in range(1, nt + 1):
            ys, xs = np.where(lab_top == ci)
            if len(ys) < minA: continue
            base = xs[ys == ys.max()].mean()
            jr = min(range(1, len(J)), key=lambda i: abs(J[i] - base))
            top_owner[ci] = jr - 1 if abs(J[jr] - base) < c.get('spineSnap', 120) else tile_of(base)
            top_base[ci] = (float(base), float(ys.min()), float(xs[ys == ys.min()].mean()))
        bot_owner = {}
        for ci in range(1, nb + 1):
            ys, xs = np.where(lab_bot == ci)
            if len(ys) < 40: continue
            bot_owner[ci] = tile_of(xs[ys == ys.min()].mean())
        tiles = c.get('tiles', list(range(1, len(J) - 2)))
        cap = c.get('cap')
        xr = np.arange(w, dtype=np.float32)
        pre = c['prefix']
        for i in tiles + ([cap] if cap is not None else []):
            is_cap = i == cap
            m = np.zeros((h, w), np.float32)
            right = J[i + 1] if i + 1 < len(J) else w
            ramp = np.clip((xr - (J[i] - 22)) / 40.0, 0, 1) * (np.clip(((right + 30) - xr) / 26.0, 0, 1) if not is_cap else 1)
            m[top:bot] = ramp[None, :]
            spine = None
            owned = sorted([ci for ci, o in top_owner.items() if o == i], key=lambda ci: -(lab_top == ci).sum())
            for ci in owned[:1]:
                cm = (lab_top == ci).astype(np.float32)
                if split:
                    spine = (ci, cm)
                else:
                    cm2 = cm.copy()
                    if not is_cap: cm2[:, right + 60:] = 0
                    m[:top] = np.maximum(m[:top], cm2)
                    if not is_cap: m[top:top + 90, right:right + 60] = 1
            for ci, o in bot_owner.items():
                if o == i: m[bot:][lab_bot == ci] = 1
            m = ndi.gaussian_filter(m, 0.7)
            t = V.copy(); t[..., 3] *= m
            ys, xs = np.where(t[..., 3] > 10)
            bx = (max(0, xs.min() - 4), max(0, ys.min() - 4), min(w, xs.max() + 5), min(h, ys.max() + 5))
            name = f'{pre}{i}' if not is_cap else f'{pre}cap'
            piv = {'jl': (J[i], axis), 'jr': ((right if not is_cap else J[i] + c.get('capLen', 380)), axis)}
            if spine: piv['spn'] = (top_base[spine[0]][0], top)
            self.save(name, t, bx, c['lps'], piv, group='cap' if is_cap else 'vert', extra={'src': c['src']})
            if spine:
                ci, cm = spine
                base_x = top_base[ci][0]
                # 몸통 뒤에 겹쳐 숨길 여유: top 아래 ov 행, 가시 밑동 폭 ± 6
                bxs = np.where(cm[top - 1] > 0)[0]
                sm = np.zeros((h, w), np.float32); sm[:top] = cm
                if len(bxs):
                    sm[top:top + ov, max(0, bxs.min() - 6):bxs.max() + 7] = 1
                sm = ndi.gaussian_filter(sm, 0.7) * alpha.astype(np.float32)
                ts = V.copy(); ts[..., 3] *= sm
                ys, xs = np.where(ts[..., 3] > 10)
                sb = (max(0, xs.min() - 4), max(0, ys.min() - 4), min(w, xs.max() + 5), min(h, ys.max() + 5))
                tip = top_base[ci][2], top_base[ci][1]
                self.save(f'{pre}s{i}', ts, sb, c['lps'], {'base': (base_x, top), 'tip': tip}, group='spine')

    # ── 파편 ──
    def build_debris(self, d):
        S = self.src(d['src'])
        for j, b in enumerate(d.get('boxes', [])):
            x0, y0, x1, y1 = b
            a = S[y0:y1, x0:x1, 3] > 60
            lab, n = ndi.label(a)
            if n == 0: continue
            sizes = ndi.sum(np.ones_like(a, np.float32), lab, range(1, n + 1))
            keep = np.isin(lab, [int(np.argmax(sizes)) + 1] + [i + 1 for i, s in enumerate(sizes) if s > sizes.max() * d.get('keepFrac', 0.25)])
            keep = ndi.binary_dilation(keep, iterations=2)
            m = np.zeros(S.shape[:2], np.float32); m[y0:y1, x0:x1] = keep
            t = S.copy(); t[..., 3] *= ndi.gaussian_filter(m, 0.6)
            ys, xs = np.where(t[..., 3] > 10)
            cy, cx = float(ys.mean()), float(xs.mean())
            r = float(np.sqrt(len(ys) / np.pi)) * d['lps']
            bb = (xs.min() - 4, ys.min() - 4, xs.max() + 5, ys.max() + 5)
            self.save(f"{d['prefix']}{j}", t, bb, d['lps'], {'c': (cx, cy)}, extra={'r': round(r, 2)}, group='debris')

    # ── 아틀라스 ──
    def pack(self, out):
        items = sorted(self.parts.items(), key=lambda kv: -kv[1][0].shape[0])
        total = sum((im.shape[0] + PAD * 2) * (im.shape[1] + PAD * 2) for im, _ in self.parts.values())
        W = 1024
        while W * W < total * 1.25 and W < 4096: W *= 2
        W = max(W, max(im.shape[1] for im, _ in self.parts.values()) + PAD * 2)
        x = y = rowh = 0; place = {}
        for name, (im, _) in items:
            ih, iw = im.shape[:2]
            if x + iw + PAD * 2 > W: x = 0; y += rowh; rowh = 0
            place[name] = (x + PAD, y + PAD); x += iw + PAD * 2; rowh = max(rowh, ih + PAD * 2)
        H = y + rowh
        atlas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        man = {'id': self.cfg['id'], 'td': self.td, 'atlas': {'file': 'atlas', 'w': W, 'h': H}, 'parts': {}, 'groups': self.groups}
        for name, (im, ent) in self.parts.items():
            px, py = place[name]
            atlas.paste(Image.fromarray(im, 'RGBA'), (px, py))
            man['parts'][name] = {'x': px, 'y': py, 'w': im.shape[1], 'h': im.shape[0], **ent}
        os.makedirs(out, exist_ok=True)
        atlas.save(os.path.join(out, 'atlas.webp'), 'WEBP', quality=int(self.cfg.get('quality', 90)), method=6)
        with open(os.path.join(out, 'manifest.json'), 'w', encoding='utf-8') as f:
            json.dump(man, f, indent=1, ensure_ascii=False)
        kb = os.path.getsize(os.path.join(out, 'atlas.webp')) // 1024
        px = sum(im.shape[0] * im.shape[1] for im, _ in self.parts.values())
        print(f'  atlas {W}x{H}  {len(self.parts)} parts  {px / 1e6:.2f} Mpx  {kb} KB  → {os.path.relpath(out, ROOT)}')
        return man


def poly_mask(shape, pts, feather=1.2):
    h, w = shape[:2]
    im = Image.new('L', (w, h), 0); ImageDraw.Draw(im).polygon([tuple(p) for p in pts], fill=255)
    if feather: im = im.filter(ImageFilter.GaussianBlur(feather))
    return np.asarray(im).astype(np.float32) / 255.0


def color_rule(S, rule):
    r, g, b = S[..., 0], S[..., 1], S[..., 2]
    if rule == 'red': return (r > g + 35) & (r > 70)
    if rule == 'green': return (g > r + 25) & (g > b + 10)
    if rule == 'dark': return S[..., :3].mean(2) < 40
    if rule == 'bright': return S[..., :3].mean(2) > 200
    raise ValueError('unknown color rule ' + rule)


def build(pid):
    cfg = load_config(pid)
    B = Builder(cfg)
    B.build_parts()
    for c in cfg.get('chains', []): B.build_chain(c)
    for d in cfg.get('debris', []): B.build_debris(d)
    return B.pack(os.path.join(ROOT, cfg['out']))


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(1)
    build(sys.argv[1])
