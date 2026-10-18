#!/usr/bin/env python3
# 「숨쉬는 원경」 (Stage 5 P2) — 원경 그림(assets/bg/*.webp)에서 빛나는 곳(불·촛불·창·달·마법진)을 찾아 src/data/atmos.js 를 쓴다.
#
#   python3 -I tools/atmos/find_lights.py [--sheet DIR] [--only s01_village,s11_chapel]
#
# 방법: 그림을 폭 252 px 로 줄여(세로는 비율대로) 밝기·채도·색상 문턱을 넘는 칸을 이어 붙인 덩어리(blob)를 찾는다.
#   - 따뜻한 빛(색상 0–55°, 붉은 끝 330–360°)  → flicker 1.0 (불·횃불·촛불: 일렁임)
#   - 그 밖의 색 빛(초록 수조·보라 마법진·청록 해파리) → flicker 0.35 (천천히 숨쉼)
#   - 채도가 낮은 흰 빛(달·창·하늘 틈)            → flicker 0.12 (거의 고정)
# 덩어리마다 중심 (u, v ∈ [0,1], 그림 기준), 반경 r (그림 높이 대비), 평균색(조금 밝게), flicker, feed(플레이 층을 비추는 광원으로
# world.lighting 에 넘길지: 따뜻한 빛 + 그림 아래 62 % 안) 을 낸다. 가까운 덩어리는 합치고, 그림마다 크기×밝기 순 최대 12 개.
# 그 위에 OVERRIDES (손으로 확인한 값: 빼거나 더하거나 바꿀 빛, 빛줄기, 안개 세기·색, 창문 빛깔) 를 덮어쓴다.
# fog.color 는 그림 아래쪽 띠(55–90 %)의 평균색을 밝힌 것, windowTint 는 그림의 가장 밝은 3 % 칸 평균색으로 만든 [유리 위, 유리 아래, 빛줄기].
# --sheet DIR: 그림마다 찾은 빛·빛줄기를 원으로 겹친 확인용 그림 (DIR/<id>.jpg, 손 확인용 — 저장소 밖에 둔다).
import sys, os, json, math, colorsys
from PIL import Image, ImageDraw
import numpy as np
from scipy import ndimage

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
BG_DIR = os.path.join(ROOT, 'assets', 'bg')
OUT = os.path.join(ROOT, 'src', 'data', 'atmos.js')
W_SMALL = 252
MAX_LIGHTS = 12

# ── 손 확인 값 (2026-10-18, P2 — 그림 30장을 겹침 그림으로 하나씩 보고 고침) ──
#  drop: [(u, v, 반경)] 이 원 안에 중심이 있는 자동 빛을 뺀다 · add: 빛 추가 · lights: 자동 대신 이 목록만
#  rays: 빛줄기 {u, v(꼭짓점), angle(라디안, 0 = 똑바로 아래, + = 오른쪽으로 기움), len(그림 높이 대비), w(폭, 그림 높이 대비), color, a}
#  fog: {near, far, color?} — near 는 앞 안개(인물 앞, ≤ 0.18), far 는 원경 안개 · windowTint: [위, 아래, 빛줄기] rgba 문자열
FIRE, WARM, CANDLE = '#ff8a3a', '#ffb050', '#ffc878'
def L(u, v, r, color, flicker=1.0, feed=False):
    return {'u': u, 'v': v, 'r': r, 'color': color, 'flicker': flicker, 'feed': feed}

OVERRIDES = {
    # 불타는 마을: 지붕·창의 불길 (아래쪽은 플레이 층으로), 핏빛 달은 천천히 숨쉬는 테두리 빛만
    'bg/s01_village': {'lights': [
        L(.021, .534, .09, FIRE), L(.03, .80, .06, WARM, .8, True), L(.089, .866, .11, FIRE, 1, True), L(.185, .896, .11, FIRE, 1, True),
        L(.278, .67, .07, FIRE), L(.513, .906, .12, FIRE, 1, True), L(.764, .896, .1, FIRE, 1, True), L(.84, .87, .09, FIRE, 1, True),
        L(.972, .898, .1, FIRE, 1, True), L(.876, .726, .06, WARM, .8), L(.975, .745, .06, WARM, .8), L(.565, .255, .33, '#ff3a30', .08),
    ], 'fog': {'near': .07, 'far': .14, 'color': '#a0705a'}},
    # 안개의 묘지: 달 + 청록 도깨비불 + 무너진 예배당 창
    'bg/s02_graveyard': {'lights': [
        L(.737, .309, .12, '#e8f0ff', .08), L(.164, .717, .06, '#4af0e0', .6, True), L(.858, .771, .07, '#4af0e0', .6, True),
        L(.73, .687, .035, '#4af0e0', .6), L(.526, .568, .035, '#4af0e0', .6), L(.333, .518, .05, '#3ad8d0', .3), L(.413, .49, .07, '#3ad8d0', .3),
    ], 'rays': {'from': 'moon', 'u': .737, 'v': .31, 'angle': -0.5, 'len': .75, 'w': .32, 'color': '#c8d8ff', 'a': .13},
        'fog': {'near': .14, 'far': .26, 'color': '#a8b0d0'}},
    # 악마성 정문: 성벽 위 횃불 (번개 그림은 빛으로 치지 않는다 — 날씨 번개가 따로 번쩍인다)
    'bg/s03_gate': {'lights': [
        L(.10, .38, .05, FIRE), L(.22, .375, .045, FIRE), L(.346, .374, .045, FIRE), L(.652, .383, .04, FIRE), L(.775, .374, .045, FIRE), L(.898, .384, .05, FIRE),
        L(.27, .17, .03, WARM, .8), L(.73, .17, .03, WARM, .8),
    ], 'fog': {'near': .06, 'far': .12, 'color': '#9a8ac8'}},
    # 대회랑: 샹들리에 + 벽 촛대, 가운데 큰 창의 빛줄기
    'bg/s04_hall': {'lights': [
        L(.175, .265, .1, CANDLE, .6), L(.825, .243, .1, CANDLE, .6), L(.313, .487, .05, CANDLE, .6), L(.69, .487, .05, CANDLE, .6),
        L(.075, .635, .04, CANDLE, .8, True), L(.925, .635, .04, CANDLE, .8, True), L(.508, .59, .14, '#d8e0ff', .08),
    ], 'rays': {'from': 'window', 'u': .508, 'v': .42, 'angle': 0.0, 'len': .55, 'w': .3, 'color': '#e8ecff', 'a': .1},
        'fog': {'near': .06, 'far': .13, 'color': '#b89890'}},
    # 지하 묘지: 벽등 + 가운데 굴의 초록 빛
    'bg/s05_catacombs': {'lights': [
        L(.074, .514, .07, CANDLE, 1, True), L(.156, .52, .035, CANDLE), L(.843, .52, .035, CANDLE), L(.915, .51, .07, CANDLE, 1, True),
        L(.502, .544, .1, '#50e0a0', .3),
    ], 'fog': {'near': .1, 'far': .2, 'color': '#7aa060'}},
    # 대도서관: 벽 촛대 + 보라 마법진
    'bg/s06_library': {'lights': [
        L(.339, .362, .04, WARM, .8), L(.661, .357, .04, WARM, .8), L(.803, .64, .04, WARM, .8, True), L(.875, .725, .04, WARM, .8, True),
        L(.652, .889, .04, WARM, .8, True), L(.30, .738, .04, WARM, .8, True), L(.198, .778, .07, '#b060ff', .35), L(.8, .86, .07, '#b060ff', .35),
        L(.508, .87, .07, '#b060ff', .35), L(.175, .4, .05, '#b060ff', .35),
    ], 'fog': {'near': .05, 'far': .1, 'color': '#a090c0'}},
    # 연금술 연구소: 초록 수조 (천천히 숨쉼) + 따뜻한 플라스크
    'bg/s07_alchemy': {'lights': [
        L(.5, .4, .16, '#60ff60', .25), L(.31, .48, .13, '#60ff60', .25), L(.895, .65, .1, '#60ff60', .25), L(.067, .663, .06, '#60ff60', .25),
        L(.729, .683, .06, '#60ff60', .25), L(.643, .6, .04, '#60ff60', .25), L(.156, .671, .05, '#ffc080', 1, True), L(.817, .683, .05, '#ffc080', 1, True),
    ], 'fog': {'near': .08, 'far': .18, 'color': '#70c070'}},
    # 지하 수로: 굴 끝의 빛 + 청록 폭포
    'bg/s08_waterway': {'lights': [
        L(.502, .554, .07, '#c0f0ff', .1), L(.145, .66, .08, '#40d8ff', .3, True), L(.855, .673, .09, '#40d8ff', .3, True), L(.889, .305, .05, '#40d8ff', .3),
    ], 'fog': {'near': .12, 'far': .22, 'color': '#60c0e0'}},
    # 시계탑: 커다란 시계 창의 빛과 그 빛줄기
    'bg/s09_clocktower': {'lights': [
        L(.508, .37, .2, '#fff4e0', .05), L(.381, .773, .05, '#fff0d8', .1), L(.635, .773, .05, '#fff0d8', .1),
    ], 'rays': {'from': 'window', 'u': .508, 'v': .45, 'angle': 0.0, 'len': .7, 'w': .5, 'color': '#fff0d8', 'a': .11},
        'fog': {'near': .05, 'far': .1, 'color': '#c8c0b0'}},
    # 얼어붙은 첨탑: 오로라 (천천히 일렁임) + 성의 따뜻한 창
    'bg/s10_spire': {'lights': [
        L(.16, .30, .15, '#40ffb0', .5), L(.79, .27, .15, '#40ffb0', .5), L(.5, .548, .04, '#ffd890', .6),
    ], 'fog': {'near': .1, 'far': .22, 'color': '#d8e8ff'}},
    # 피의 예배당: 붉은 스테인드글라스 + 제단의 흰 빛과 촛불
    'bg/s11_chapel': {'lights': [
        L(.016, .434, .1, '#ff3040', .25), L(.145, .474, .09, '#ff3040', .25), L(.24, .55, .05, '#ff3040', .25), L(.333, .59, .04, '#ff3040', .25),
        L(.667, .59, .04, '#ff3040', .25), L(.752, .51, .05, '#ff3040', .25), L(.839, .518, .09, '#ff3040', .25), L(.988, .484, .1, '#ff3040', .25),
        L(.5, .584, .12, '#f0e8ff', .08), L(.464, .69, .03, CANDLE, 1, True), L(.536, .69, .03, CANDLE, 1, True),
    ], 'rays': {'from': 'window', 'u': .5, 'v': .5, 'angle': 0.0, 'len': .5, 'w': .35, 'color': '#ffe8f0', 'a': .1},
        'fog': {'near': .08, 'far': .16, 'color': '#c06070'}},
    # 드라큘라의 왕좌: 핏빛 달 + 계단 촛대
    'bg/s12_throne': {'lights': [
        L(.508, .333, .3, '#ff3020', .06), L(.432, .62, .03, CANDLE, 1, True), L(.583, .62, .03, CANDLE, 1, True),
    ], 'fog': {'near': .1, 'far': .2, 'color': '#a04050'}},
    # 심연의 역성: 하늘의 눈 + 소용돌이 + 용암 웅덩이
    'bg/s13_abyss': {'lights': [
        L(.1, .232, .05, '#ff60c0', .4), L(.21, .32, .04, '#ff60c0', .4), L(.79, .32, .04, '#ff60c0', .4), L(.911, .232, .05, '#ff60c0', .4),
        L(.502, .53, .08, '#c060ff', .5), L(.14, .836, .09, '#ff8030', .9, True), L(.208, .814, .09, '#ff8030', .9, True),
        L(.633, .886, .05, '#ff8030', .9, True), L(.717, .866, .07, '#ff8030', .9, True), L(.763, .803, .1, '#ff8030', .9, True),
    ], 'fog': {'near': .08, 'far': .18, 'color': '#a070c0'}},
    # 거울의 성: 달과 그 반영 + 수정 샹들리에, 위쪽 창의 빛줄기
    'bg/s14_mirror': {'lights': [
        L(.185, .297, .12, '#f0f4ff', .05), L(.185, .894, .08, '#f0f4ff', .05), L(.75, .104, .06, '#e8f0ff', .4), L(.948, .074, .06, '#e8f0ff', .4),
        L(.83, .233, .05, '#e8f0ff', .4),
    ], 'rays': {'from': 'top', 'u': .3, 'v': 0.0, 'angle': 0.35, 'len': .85, 'w': .3, 'color': '#dff0ff', 'a': .1},
        'fog': {'near': .08, 'far': .18, 'color': '#c0d8e8'}},
    # 영겁의 용광로: 모루 화로 + 쇳물 줄기 + 용암 강
    'bg/s15_forge': {'lights': [
        L(.229, .458, .08, FIRE, 1, True), L(.796, .454, .08, FIRE, 1, True), L(.508, .647, .1, '#ffb040', .8, True), L(.048, .717, .07, '#ff7a30', .9, True),
        L(.208, .757, .07, '#ff7a30', .9, True), L(.312, .771, .07, '#ff7a30', .9, True), L(.464, .727, .07, '#ff7a30', .9, True),
        L(.6, .647, .06, '#ff7a30', .9, True), L(.948, .727, .07, '#ff7a30', .9, True), L(.702, .239, .04, FIRE), L(.3, .23, .04, FIRE),
    ], 'fog': {'near': .08, 'far': .18, 'color': '#c06030'}},
    # 가라앉은 성소: 수면의 빛과 빛줄기 + 해파리 + 따뜻한 등불
    'bg/s16_sunken': {'lights': [
        L(.494, .09, .14, '#80f0ff', .1), L(.585, .249, .07, '#70f8ff', .5), L(.644, .255, .05, '#70f8ff', .5), L(.553, .428, .05, '#70f8ff', .5),
        L(.295, .372, .045, '#70f8ff', .5), L(.271, .522, .045, '#70f8ff', .5), L(.725, .478, .045, '#70f8ff', .5), L(.74, .647, .045, '#70f8ff', .5),
        L(.7, .163, .04, '#70f8ff', .5), L(.079, .651, .04, '#ffb060', .8, True), L(.911, .514, .03, '#ffb060', .8, True),
    ], 'rays': {'from': 'top', 'u': .494, 'v': 0.0, 'angle': 0.0, 'len': .9, 'w': .45, 'color': '#90f0ff', 'a': .13},
        'fog': {'near': .12, 'far': .24, 'color': '#40b0b0'}},
    # 폭풍의 공중정원: 구름 사이의 해 + 금빛 지붕
    'bg/s17_sky': {'lights': [
        L(.02, .375, .2, '#ffd090', .05), L(.226, .454, .14, '#ffd090', .05), L(.49, .41, .04, '#ffe0a0', .3),
    ], 'rays': {'from': 'top', 'u': .12, 'v': .3, 'angle': 0.6, 'len': .7, 'w': .4, 'color': '#ffe0b0', 'a': .1},
        'fog': {'near': .1, 'far': .2, 'color': '#c8c0b8'}},
    # 악몽의 미궁: 커다란 달과 그 빛줄기
    'bg/s18_nightmare': {'lights': [
        L(.735, .235, .2, '#e0f0e8', .05),
    ], 'rays': {'from': 'moon', 'u': .735, 'v': .25, 'angle': -0.4, 'len': .8, 'w': .35, 'color': '#d8f0e8', 'a': .1},
        'fog': {'near': .1, 'far': .2, 'color': '#a0b8b0'}},
    # 썩어가는 숲: 나무 사이로 드는 빛 + 빛나는 버섯
    'bg/s19_blight': {'lights': [
        L(.69, .458, .2, '#e8f0a0', .1), L(.9, .408, .12, '#e8f0a0', .1), L(.052, .528, .04, '#f0f0ff', .5), L(.1, .7, .04, '#f0f0ff', .5),
        L(.887, .713, .05, '#f0f0ff', .5), L(.984, .713, .04, '#f0f0ff', .5), L(.972, .528, .04, '#f0f0ff', .5),
    ], 'rays': {'from': 'top', 'u': .7, 'v': 0.0, 'angle': -0.15, 'len': .9, 'w': .4, 'color': '#f0f8c0', 'a': .1},
        'fog': {'near': .12, 'far': .24, 'color': '#c8d890'}},
    # 태초의 공허: 불타는 사슬과 금빛 균열
    'bg/s20_void': {'lights': [
        L(.14, .847, .07, '#ff9040', 1, True), L(.53, .209, .04, '#ffa050', .6), L(.633, .677, .05, '#ffa050', .6, True), L(.431, .484, .04, '#ffa050', .6),
    ], 'fog': {'near': .06, 'far': .14, 'color': '#8090c0'}},
    # 마을(허브): 창·화로·등불 + 핏빛 달
    'bg/hub': {'lights': [
        L(.053, .604, .04, WARM, .7), L(.109, .713, .04, WARM, .7, True), L(.242, .867, .07, FIRE, 1, True), L(.22, .753, .03, WARM, .7),
        L(.337, .793, .03, WARM, .7, True), L(.714, .175, .2, '#ff3a30', .06),
    ], 'fog': {'near': .06, 'far': .12, 'color': '#8a7a90'}},
    # 피의 투기장: 관중석 횃불 + 달
    'bg/s_arena': {'lights': [
        L(.017, .418, .04, FIRE), L(.185, .554, .04, FIRE), L(.198, .703, .04, FIRE, 1, True), L(.419, .574, .04, FIRE), L(.48, .643, .04, FIRE, 1, True),
        L(.611, .574, .04, FIRE), L(.664, .673, .04, FIRE, 1, True), L(.841, .464, .04, FIRE), L(.931, .524, .04, FIRE), L(.98, .643, .04, FIRE, 1, True),
        L(.718, .149, .1, '#f0f0ff', .05),
    ], 'rays': {'from': 'moon', 'u': .718, 'v': .15, 'angle': -0.55, 'len': .8, 'w': .3, 'color': '#e8ecff', 'a': .09},
        'fog': {'near': .06, 'far': .12, 'color': '#a09080'}},
}
# 메뉴·장면 전용 그림(월드 원경으로 쓰이지 않음: 결말·여관·상점·대장간·타이틀·지도·외전 둥지)은 자동 값을 두되 플레이 층 광원(feed)은 끈다
MENU_ONLY = {'bg/ending', 'bg/inn', 'bg/shop', 'bg/smith', 'bg/title', 'bg/worldmap', 'bg/worldmap2', 'bg/s21_nest'}

def hexc(rgb):
    return '#%02x%02x%02x' % tuple(int(max(0, min(255, round(c)))) for c in rgb)

def boost(rgb, light=0.12, sat=1.15):
    r, g, b = [c / 255 for c in rgb]
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    l = min(0.82, l + light); s = min(1.0, s * sat)
    r, g, b = colorsys.hls_to_rgb(h, l, s)
    return (r * 255, g * 255, b * 255)

def classify(rgb):
    r, g, b = [c / 255 for c in rgb]
    h, s, v = colorsys.rgb_to_hsv(r, g, b)
    deg = h * 360
    if s < 0.22:
        return 'white'
    if deg <= 55 or deg >= 330:
        return 'warm'
    return 'color'

FLICKER = {'warm': 1.0, 'color': 0.35, 'white': 0.12}

def detect(img):
    w, h = img.size
    hs = max(1, round(h * W_SMALL / w))
    sm = np.asarray(img.convert('RGB').resize((W_SMALL, hs), Image.LANCZOS)).astype(np.float32)
    R, G, B = sm[..., 0], sm[..., 1], sm[..., 2]
    L = 0.2126 * R + 0.7152 * G + 0.0722 * B
    mx = np.maximum(np.maximum(R, G), B); mn = np.minimum(np.minimum(R, G), B)
    S = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0)
    # 빛 = 그림 전체 밝기 분포의 위쪽 꼬리: 97 백분위 이상이면서 절대 밝기 문턱, 또는 아주 진한 채도의 밝은 칸
    p97 = float(np.percentile(L, 97))
    thr = max(150.0, p97)
    mask = (L >= thr) | ((mx >= 200) & (S >= 0.55))
    # 덩어리 하나가 그림 폭을 가로지르는 불길(s01)일 수 있어, 연결 성분 대신 "빛 지도"의 봉우리를 찾는다:
    # 문턱을 넘은 칸의 밝기를 흐리게 편 지도에서 9×9 극대점 → 큰 순서로 고르되 이미 고른 빛과 그림 높이 9 % 안이면 버린다
    M = ndimage.gaussian_filter(np.where(mask, L, 0).astype(np.float32), 1.6)
    cover = ndimage.gaussian_filter(mask.astype(np.float32), 3.0)   # 둘레 빛 칸 비율 → 빛의 크기
    peaks = (M == ndimage.maximum_filter(M, size=9)) & (M > thr * 0.18)
    ys, xs = np.nonzero(peaks)
    cand = sorted(((float(M[y, x]) * (0.4 + float(cover[y, x])), x, y) for y, x in zip(ys, xs)), reverse=True)
    blobs = []
    for score, x, y in cand:
        u, v = (x + 0.5) / W_SMALL, (y + 0.5) / hs
        if any(math.hypot((u - q['u']) * W_SMALL / hs, v - q['v']) < 0.09 for q in blobs):
            continue
        # 둘레 반경 5칸 안의 빛 칸: 평균색·넓이
        y0, y1, x0, x1 = max(0, y - 5), min(hs, y + 6), max(0, x - 5), min(W_SMALL, x + 6)
        sub = mask[y0:y1, x0:x1]
        area = int(sub.sum())
        if area < 2:
            continue
        rgb = sm[y0:y1, x0:x1][sub].mean(axis=0)
        blobs.append({'u': u, 'v': v, 'core': math.sqrt(area / math.pi) / hs, 'area': area, 'rgb': rgb, 'lum': float(L[y0:y1, x0:x1][sub].mean()), 'score': score})
        if len(blobs) >= MAX_LIGHTS:
            break
    lights = []
    for q in blobs[:MAX_LIGHTS]:
        kind = classify(q['rgb'])
        r = min(0.22, max(0.035, q['core'] * 2.4))
        lights.append({
            'u': round(q['u'], 3), 'v': round(q['v'], 3), 'r': round(r, 3),
            'color': hexc(boost(q['rgb'])), 'flicker': FLICKER[kind],
            'feed': kind == 'warm' and q['v'] > 0.38,
        })
    # 안개 색: 아래쪽 띠 평균을 밝힘 · 창문 빛깔: 가장 밝은 3 %
    band = sm[int(hs * 0.55):int(hs * 0.9)].reshape(-1, 3).mean(axis=0)
    fogc = hexc(boost(band, 0.22, 0.9))
    top = sm[L >= p97].reshape(-1, 3).mean(axis=0) if (L >= p97).any() else np.array([160, 180, 255])
    tc = boost(top, 0.05, 1.1)
    rgba = lambda c, a, k=1.0: 'rgba(%d,%d,%d,%s)' % (round(c[0] * k), round(c[1] * k), round(c[2] * k), a)
    tint = [rgba(tc, 0.5), rgba(tc, 0.25, 0.4), rgba(tc, 0.12)]
    avg = sm.reshape(-1, 3).mean(axis=0)
    return lights, fogc, tint, hexc(avg)

def apply_overrides(key, lights, entry):
    ov = OVERRIDES.get(key, {})
    if 'lights' in ov:
        lights = [dict(l) for l in ov['lights']]
    else:
        for (du, dv, dr) in ov.get('drop', []):
            lights = [l for l in lights if math.hypot(l['u'] - du, l['v'] - dv) > dr]
        lights = lights + [dict(l) for l in ov.get('add', [])]
    for l in lights:
        l.setdefault('flicker', 1.0); l.setdefault('feed', False)
        if key in MENU_ONLY: l['feed'] = False
    if key in MENU_ONLY: lights = lights[:4]
    entry['lights'] = lights
    if 'rays' in ov: entry['rays'] = ov['rays']
    if 'fog' in ov: entry['fog'] = {**entry['fog'], **ov['fog']}
    if 'windowTint' in ov: entry['windowTint'] = ov['windowTint']
    return entry

def sheet(path, img, entry, out):
    w, h = img.size
    k = 1260 / w
    im = img.convert('RGB').resize((1260, round(h * k)))
    d = ImageDraw.Draw(im)
    H = im.height
    for i, l in enumerate(entry['lights']):
        x, y, r = l['u'] * 1260, l['v'] * H, l['r'] * H
        col = l['color']
        d.ellipse([x - r, y - r, x + r, y + r], outline=col, width=2)
        d.ellipse([x - 3, y - 3, x + 3, y + 3], fill=('#ffffff' if l.get('feed') else '#000000'), outline=col)
        d.text((x + 5, y - 12), '%d f%.2g%s' % (i, l['flicker'], ' F' if l.get('feed') else ''), fill='#ffff00')
    ry = entry.get('rays')
    if ry:
        x, y = ry['u'] * 1260, ry['v'] * H
        L = ry['len'] * H
        a = ry.get('angle', 0)
        ex, ey = x + math.sin(a) * L, y + math.cos(a) * L
        d.line([x, y, ex, ey], fill='#00ffff', width=3)
        d.text((x + 6, y), 'ray', fill='#00ffff')
    d.rectangle([0, 0, 520, 16], fill='#000000')
    d.text((4, 2), '%s fog near %.2f far %.2f %s  tint %s' % (os.path.basename(path), entry['fog']['near'], entry['fog']['far'], entry['fog']['color'], entry['windowTint'][0]), fill='#ffffff')
    im.save(os.path.join(out, os.path.splitext(os.path.basename(path))[0] + '.jpg'), quality=84)

def fmt_entry(key, e):
    def lt(l):
        s = '{ u: %s, v: %s, r: %s, color: %s, flicker: %s' % (l['u'], l['v'], l['r'], json.dumps(l['color']), l['flicker'])
        if l.get('feed'): s += ', feed: true'
        return s + ' }'
    lines = ['  %s: {' % json.dumps(key)]
    if e['lights']:
        lines.append('    lights: [')
        for l in e['lights']:
            lines.append('      %s,' % lt(l))
        lines.append('    ],')
    else:
        lines.append('    lights: [],')
    if e.get('rays'):
        r = e['rays']
        lines.append('    rays: { from: %s, u: %s, v: %s, angle: %s, len: %s, w: %s, color: %s, a: %s },' % (
            json.dumps(r.get('from', 'top')), r['u'], r['v'], r.get('angle', 0), r['len'], r['w'], json.dumps(r['color']), r['a']))
    else:
        lines.append('    rays: null,')
    f = e['fog']
    lines.append('    fog: { near: %s, far: %s, color: %s },' % (f['near'], f['far'], json.dumps(f['color'])))
    lines.append('    windowTint: [%s],' % ', '.join(json.dumps(t) for t in e['windowTint']))
    lines.append('    avg: %s,' % json.dumps(e['avg']))
    lines.append('  },')
    return '\n'.join(lines)

def main():
    args = sys.argv[1:]
    sheet_dir = args[args.index('--sheet') + 1] if '--sheet' in args else None
    only = set(args[args.index('--only') + 1].split(',')) if '--only' in args else None
    if sheet_dir: os.makedirs(sheet_dir, exist_ok=True)
    files = sorted(f for f in os.listdir(BG_DIR) if f.endswith('.webp'))
    entries = []
    for f in files:
        name = os.path.splitext(f)[0]
        key = 'bg/' + name
        img = Image.open(os.path.join(BG_DIR, f))
        lights, fogc, tint, avg = detect(img)
        entry = {'lights': lights, 'rays': None, 'fog': {'near': 0.1, 'far': 0.16, 'color': fogc}, 'windowTint': tint, 'avg': avg}
        entry = apply_overrides(key, lights, entry)
        for l in entry['lights']:
            assert 0 <= l['u'] <= 1 and 0 <= l['v'] <= 1, (key, l)
        assert entry['fog']['near'] <= 0.18, key
        entries.append((key, entry))
        if sheet_dir and (only is None or name in only):
            sheet(f, img, entry, sheet_dir)
    head = [
        '// 「숨쉬는 원경」 (Stage 5 P2): 원경 그림마다 빛나는 곳·빛줄기·안개·창문 빛깔. src/render/atmos.js 가 읽는다.',
        '// tools/atmos/find_lights.py 가 assets/bg/*.webp 에서 만든다 (손 확인 값은 그 스크립트의 OVERRIDES) — 이 파일을 손으로 고치지 말고 스크립트를 다시 돌린다.',
        '// 키 = 에셋 키 (stage.bg). 값:',
        '//   lights[{u, v(그림 기준 0–1), r(그림 높이 대비 반경), color, flicker(0 고정 – 1 불꽃 일렁임), feed?(플레이 층을 비추는 광원으로 world.lighting 에 넘김)}]',
        '//   rays {from, u, v(꼭짓점), angle(라디안, 0 = 아래), len, w(그림 높이 대비), color, a} | null',
        '//   fog {near(인물 앞 안개 알파, ≤ 0.18), far(원경 안개 알파), color} · windowTint [유리 위, 유리 아래, 빛줄기] (render/tiles.js 창문 대체 빛깔) · avg(그림 평균색)',
        'export const ATMOS = {',
    ]
    body = [fmt_entry(k, e) for k, e in entries]
    with open(OUT, 'w', encoding='utf-8') as fh:
        fh.write('\n'.join(head + body + ['};', '']))
    print('wrote %s (%d entries)' % (os.path.relpath(OUT, ROOT), len(entries)))
    for k, e in entries:
        print('  %-24s lights %2d feed %d rays %s' % (k, len(e['lights']), sum(1 for l in e['lights'] if l.get('feed')), 'y' if e.get('rays') else '-'))

if __name__ == '__main__':
    main()
