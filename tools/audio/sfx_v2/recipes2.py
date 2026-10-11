"""고급 효과음 v2 — 2차 묶음 레시피 (build_sfx_v2.py 가 RECIPES 에 합친다). 소재는 모두 CC0 1.0 (sources.json).

고른 순서 = 실제 플레이 호출 수 (단계 진행 봇 s01·s03·s04 보스·s06·s09·s14·s18 + 메뉴 호출 자리 수, /tmp/claude-0/g7/sfx.md):
  휘두르기(무기별) → 이동(점프·착지·대시·바닥 재질별 발소리) → UI → 원소 마법 → 몸 종류별 적 사망 → 탈것.
층 규칙은 1차와 같다: 녹음 층 2~4개 (순간음/몸통/꼬리), 합성음 층 없음. 'br' = AAC 비트레이트(기본 80k 모노),
'room' = 장소 잔향 송신 배율(0 = 메뉴 소리처럼 방 울림 없음), 'of' = 다른 효과음 이름의 변형 묶음 (enemy_die_bone → enemy_die).
"""


def L(s, **k):
    k['s'] = s
    return k


def B(i):
    return f'bsb:{i:04d}'


def K(f):                   # Kenney RPG Audio
    return f'ken:rpg-audio/{f}'


def KI(f):                  # Kenney Impact Sounds
    return f'ken:impact-sounds/{f}'


def RD(f):                  # rubberduck '80 CC0 RPG SFX'
    return f'oga:rubberduck_rpg/{f}'


def BFH(f):                 # rubberduck '75 CC0 breaking/falling/hit'
    return f'oga:rubberduck_bfh/{f}'


PUNCH = [2460, 2461, 2463, 2465, 2468]
QPUNCH = [f'oga:qubodup_punch/qubodupPunch0{i}.flac' for i in range(1, 6)]
GORE = [2582, 2585, 2586, 2589, 2591, 2599]
BONE = [(1408, 0.0), (1409, 0.0), (596, 3.80), (596, 6.90), (596, 18.70)]
FALL = [(2452, 0.0), (2453, 0.0), (2455, 0.0), (2456, 0.0), (2454, 0.30)]
HEEL = [0.36, 0.94, 1.50, 2.78, 3.40]
FANT = ['L1', 'R2', 'L2', 'R1', 'L3']
CRACK = [2949, 2950, 2951, 2952]                        # Whip crack #1–#4 (진짜 채찍)
W572 = [6.50, 7.50, 8.51, 1.10, 3.45]                   # Whoosh #1 (칼) 의 휘두름 위치
W573 = [8.18, 2.48, 9.39, 1.35, 3.57, 4.70, 12.0]       # Whoosh #2 (칼·화살)
EQ_STEP = [('pk', 250, -1.5, 1.0), ('hs', 8000, -2.0, 0.7)]

R2 = {
    # ───────────── 휘두르기 (무기별) ─────────────
    # 채찍 휘두름 (카엘 기본 공격, 가장 잦은 소리) — 밧줄이 공기를 가르는 '휙' + 끝에서 가볍게 '탁' + 사슬 고리
    'whip': {'n': 4, 'var': lambda v: dict(layers=[
        L(B([1795, 1796, 1795, 1796][v]), al='pk', pre=0.09, len=0.22, g=0, st=[0, 0, 2, -1][v], hp=300, tau=0.06, hold=0.06),
        L(B(CRACK[v]), len=0.12, g=-8, st=[0, -1, 1, 0][v], hp=900, tau=0.035, dly=85, clip=6),
        L(RD(f'chain_0{[1, 2, 3, 2][v]}.ogg'), len=0.16, g=-17, hp=2500, lp=7000, tau=0.06, dly=20),
    ], eq=[('pk', 250, -2.0, 1.0), ('hs', 9000, -2.0, 0.7)], sat=(1.4, 0.15), lp=12000)},
    # 채찍 끝 '짝' (끝까지 뻗은 공격) — 짧은 휙 + 진짜 채찍 크랙 + 몸통
    'whip_crack': {'n': 4, 'var': lambda v: dict(layers=[
        L(B([1797, 1802, 1797, 1802][v]), al='pk', pre=0.06, len=0.12, g=-5, st=[2, 0, 3, 1][v], hp=500, tau=0.04, hold=0.04),
        L(B(CRACK[(v + 1) % 4]), len=0.22, g=0, hp=400, tau=0.06, dly=70, clip=4),
        L(B(PUNCH[v]), len=0.08, g=-13, hp=200, lp=3000, tau=0.03, dly=72),
        L(RD(f'chain_0{[2, 3, 1, 3][v]}.ogg'), len=0.14, g=-19, hp=2500, lp=7000, tau=0.05, dly=60),
    ], eq=[('pk', 3000, 1.5, 0.8), ('hs', 10000, -2.0, 0.7)], sat=(1.8, 0.25), lp=12000)},
    # 검 휘두름 — 칼이 공기를 가르는 휙 + 아주 작은 날 울림 + 소매
    'slash': {'n': 5, 'var': lambda v: dict(layers=[
        L(B([128, 572, 572, 573, 1797][v]), at=[0, W572[0], W572[1], W573[1] - 0.05, 0][v], al='pk', pre=0.07, len=0.2, g=0, st=[1, 2, 0, 3, 2][v],
          hp=600, tau=0.05, hold=0.06),
        L(K(f'drawKnife{[1, 2, 3, 1, 2][v]}.ogg'), al='pk', pre=0.01, len=0.12, g=-16, hp=3000, tau=0.05, dly=40),
        L(K(f'cloth{[1, 2, 3, 4, 1][v]}.ogg'), len=0.12, g=-15, hp=400, lp=5000, tau=0.05),
    ], eq=[('pk', 400, -2.0, 1.0), ('pk', 4000, 1.5, 0.8)], sat=(1.3, 0.1))},
    # 큰 무기 휘두름 (대검·도끼·망치) — 낮게 깔린 굵은 휙 + 공기 무게
    'slash_heavy': {'n': 4, 'var': lambda v: dict(layers=[
        L(B([1798, 1801, 1800, 1799][v]), al='pk', pre=0.1, len=0.32, g=0, st=[-4, -5, -3, -6][v], hp=120, tau=0.09, hold=0.1),
        L(B(573), at=W573[v] - 0.05, al='pk', pre=0.08, len=0.28, g=-4, st=-5, hp=200, lp=6000, tau=0.08, hold=0.08),
        L(QPUNCH[v], len=0.3, g=-11, st=-12, lp=180, tau=0.12, dly=80),
        L(K(f'drawKnife{v % 3 + 1}.ogg'), al='pk', len=0.14, g=-17, st=-5, hp=2000, tau=0.06, dly=60),
    ], eq=[('ls', 120, 2.0, 0.7), ('pk', 500, -2.0, 1.0)], sat=(1.8, 0.25))},
    # 단검 던지기 — 짧고 높은 휙 + 칼날 스침 + 금속 반짝임
    'dagger': {'n': 4, 'var': lambda v: dict(layers=[
        L(B([1797, 1802, 128, 1797][v]), al='pk', pre=0.04, len=0.12, g=0, st=[5, 4, 6, 7][v], hp=1200, tau=0.035, hold=0.03),
        L(K(['knifeSlice.ogg', 'knifeSlice2.ogg'][v % 2]), al='pk', pre=0.01, len=0.1, g=-6, st=[0, 1, 2, -1][v], hp=1500, tau=0.04),
        L(B([2574, 2575, 2576, 2577][v]), al='pk', len=0.14, g=-15, hp=3000, tau=0.06, dly=10),
    ], eq=[('hs', 7000, 1.0, 0.7)], sat=(1.2, 0.1))},
    # 도끼 던지기 — 돌며 세 번 지나가는 휙
    'axe': {'n': 3, 'var': lambda v: dict(layers=[
        L(B([1798, 1799, 1801][v]), al='pk', pre=0.06, len=0.14, g=0, st=-2, hp=200, tau=0.05, hold=0.04),
        L(B([1799, 1801, 1798][v]), al='pk', pre=0.06, len=0.14, g=-3, st=-3, hp=200, tau=0.05, hold=0.04, dly=120),
        L(B([1801, 1798, 1799][v]), al='pk', pre=0.06, len=0.14, g=-7, st=-4, hp=200, tau=0.05, dly=240),
    ], eq=[('pk', 450, -1.5, 1.0)], sat=(1.3, 0.1))},
    # 총 (빅터) — 실제 총성(짧게 자른 꼬리) + 가슴을 치는 저음 + 쇠 장치 '찰칵'
    'gun': {'n': 4, 'br': '96k', 'var': lambda v: dict(layers=[
        L(B([397, 2853, 397, 2854][v]), at=[0.95, 0, 0.95, 0][v], len=0.35, g=0, st=[3, 2, 1, 4][v], hp=90, tau=[0.08, 0.06, 0.09, 0.06][v], hold=0.008, clip=6),
        L(KI(f'impactPunch_heavy_00{v}.ogg'), len=0.18, g=-7, st=-5, lp=400, tau=0.08),
        L(B([1984, 1985, 1984, 1985][v]), at=[1.45, 0.3, 0.1, 0.05][v], al='pk', len=0.08, g=-15, hp=1500, tau=0.03, dly=5),
    ], eq=[('ls', 100, 2.0, 0.7), ('pk', 600, -2.0, 1.0)], sat=(2.2, 0.35), lp=11000)},

    # ───────────── 이동 ─────────────
    # 점프 (도약) — 외투 펄럭 + 신발 박차기 + 작은 바람
    'jump': {'n': 4, 'var': lambda v: dict(layers=[
        L(K(f'cloth{v + 1}.ogg'), al='pk', pre=0.02, len=0.14, g=0, hp=300, lp=7000, tau=0.06),
        L(KI(f'footstep_concrete_00{v}.ogg'), len=0.06, g=-4, hp=700, tau=0.025),
        L(B([1797, 1802, 1799, 1797][v]), al='pk', pre=0.05, len=0.12, g=-11, st=[6, 5, 7, 4][v], hp=1500, tau=0.04, dly=15),
    ], eq=[('pk', 300, -2.0, 1.0)])},
    # 2단 점프 — 공기를 차는 휙 + 외투가 크게 펄럭 + 허리띠
    'double_jump': {'n': 4, 'var': lambda v: dict(layers=[
        L(B(573), at=W573[v + 3] - 0.05, al='pk', pre=0.06, len=0.2, g=0, st=[3, 4, 2, 5][v], hp=700, tau=0.06, hold=0.05),
        L(K(f'cloth{(v + 2) % 4 + 1}.ogg'), al='pk', len=0.16, g=-3, hp=250, tau=0.07),
        L(K(['clothBelt.ogg', 'clothBelt2.ogg'][v % 2]), len=0.12, g=-13, hp=600, tau=0.05, dly=20),
    ], eq=[('pk', 350, -1.5, 1.0)])},
    # 착지 — 실제 점프 착지 녹음 (돌·흙) + 몸무게 + 옷
    'land': {'n': 4, 'var': lambda v: dict(layers=[
        L(B([1835, 1836, 1837, 1838][v]), at=[0.9, 0.32, 0.45, 0.78][v], len=0.16, g=0, hp=45, lp=6000, tau=0.06, hold=0.01),
        L(KI(f'impactSoft_medium_00{v}.ogg'), len=0.14, g=-5, lp=900, tau=0.06),
        L(K(f'cloth{v + 1}.ogg'), al='pk', len=0.1, g=-13, hp=400, tau=0.05, dly=8),
    ], eq=[('ls', 100, 2.0, 0.7), ('pk', 400, -2.0, 1.0)], sat=(1.3, 0.1))},
    # 대시 — 빠른 휙 + 신발이 바닥을 긁음 + 옷
    'dash': {'n': 4, 'var': lambda v: dict(layers=[
        L(B([1800, 1801, 1800, 1801][v]), al='pk', pre=0.08, len=0.22, g=0, st=[2, 1, 3, 0][v], hp=250, tau=0.07, hold=0.06),
        L(B(1318), at=[1.89, 2.51, 4.34, 0.64][v], len=0.12, g=-7, hp=500, tau=0.05),
        L(K(f'cloth{(v + 1) % 4 + 1}.ogg'), al='pk', len=0.12, g=-11, hp=300, tau=0.05),
    ], eq=[('pk', 450, -1.5, 1.0)])},
    # 발소리: 흙 (1장 마을 — 가장 많이 들림)
    'step_dirt': {'n': 5, 'var': lambda v: dict(layers=[
        L(f'oga:fantozzi/Fantozzi-Sand{FANT[v]}.flac', len=0.16, g=0, hp=120, lp=7000, tau=0.05, hold=0.01),
        L(KI(f'footstep_grass_00{v}.ogg'), len=0.1, g=-6, hp=200, tau=0.04),
        L(KI(f'footstep_concrete_00{v}.ogg'), len=0.06, g=-9, lp=700, tau=0.03),
    ], eq=EQ_STEP, sat=(1.2, 0.1))},
    # 발소리: 나무 (마루·계단)
    'step_wood': {'n': 5, 'var': lambda v: dict(layers=[
        L(B(165), at=[1.07, 1.70, 2.29, 3.49, 4.81][v], len=0.18, g=0, hp=80, lp=8000, tau=0.06, hold=0.01),
        L(KI(f'footstep_wood_00{v}.ogg'), len=0.1, g=-3, hp=120, tau=0.04),
        L(KI(f'impactWood_light_00{v}.ogg'), len=0.06, g=-10, lp=600, tau=0.03),
    ], eq=EQ_STEP, sat=(1.2, 0.1))},
    # 발소리: 쇠 (시계탑·격자 바닥)
    'step_metal': {'n': 5, 'var': lambda v: dict(layers=[
        L(B(166), at=HEEL[v], len=0.09, g=-2, hp=450, tau=0.03, clip=5),
        L(KI(f'impactPlate_light_00{v}.ogg'), len=0.14, g=0, hp=300, tau=0.06),
        L(KI(f'impactMetal_light_00{v}.ogg'), len=0.1, g=-9, st=-3, hp=200, lp=5000, tau=0.04),
        L(KI(f'footstep_concrete_00{v}.ogg'), len=0.06, g=-7, lp=700, tau=0.03),
    ], eq=[('pk', 2500, -1.5, 1.0), ('hs', 9000, -3.0, 0.7)], sat=(1.2, 0.1))},
    # 발소리: 살 (살점 바닥) — 진흙 걸음 + 젖은 살
    'step_flesh': {'n': 5, 'var': lambda v: dict(layers=[
        L(B(495), at=[3.29, 3.80, 4.64, 6.49, 7.81][v], len=0.2, g=0, hp=90, lp=6000, tau=0.07, hold=0.01),
        L(B(GORE[v]), al='pk', len=0.12, g=-10, hp=300, lp=4000, tau=0.05, dly=15),
        L(KI(f'impactSoft_medium_00{v}.ogg'), len=0.08, g=-9, lp=600, tau=0.03),
    ], eq=EQ_STEP, sat=(1.2, 0.1))},
    # 발소리: 눈
    'step_snow': {'n': 5, 'var': lambda v: dict(layers=[
        L(KI(f'footstep_snow_00{v}.ogg'), len=0.18, g=0, hp=150, tau=0.07, hold=0.02),
        L(B(208), at=[32.6, 34.05, 34.5, 35.4, 36.85][v], len=0.18, g=-4, hp=200, lp=8000, tau=0.07),
        L(KI(f'footstep_concrete_00{v}.ogg'), len=0.06, g=-10, lp=600, tau=0.03),
    ], eq=EQ_STEP)},
    # 발소리: 얕은 물
    'step_water': {'n': 5, 'var': lambda v: dict(layers=[
        L(B([1529, 1530, 1531, 1532, 1529][v]), len=0.22, g=0, st=[3, 2, 4, 1, 5][v], hp=200, tau=0.08, hold=0.01),
        L(KI(f'footstep_concrete_00{v}.ogg'), len=0.07, g=-7, lp=900, tau=0.03),
    ], eq=EQ_STEP)},

    # ───────────── UI (방 울림 없음) ─────────────
    # 커서 이동 — 작은 쇠 스위치 '딸깍' + 나무 '똑'
    'menu_move': {'n': 4, 'room': 0, 'var': lambda v: dict(layers=[
        L(B(321), at=[0.24, 0.76, 1.23, 2.32][v], len=0.05, g=0, hp=1200, tau=0.015),
        L(KI(f'impactWood_light_00{v}.ogg'), len=0.06, g=-7, st=5, hp=600, tau=0.02),
    ], eq=[('hs', 8000, -2.0, 0.7)])},
    # 확인 — 쇠 걸쇠 '철컥' + 낮은 나무 + 작은 종 꼬리
    'menu_ok': {'n': 3, 'room': 0, 'var': lambda v: dict(layers=[
        L(K('metalLatch.ogg'), al='pk', pre=0.005, len=0.12, g=0, st=[0, 1, -1][v], hp=500, tau=0.05),
        L(KI(f'impactWood_medium_00{v}.ogg'), len=0.12, g=-5, st=-2, lp=1500, tau=0.05),
        L(B([2081, 2080, 2083][v]), len=0.45, g=-13, st=[0, 2, -2][v], hp=2500, tau=0.18, dly=25),
    ])},
    # 취소 — 천 스침 + 책 덮는 낮은 '툭'
    'menu_cancel': {'n': 3, 'room': 0, 'var': lambda v: dict(layers=[
        L(K(f'cloth{v + 2}.ogg'), al='pk', pre=0.02, len=0.14, g=-2, hp=300, tau=0.06),
        L(K(['bookClose.ogg', 'bookPlace1.ogg', 'bookPlace2.ogg'][v]), al='pk', len=0.12, g=0, st=-3, lp=2500, tau=0.05, dly=15),
    ])},
    # 대사 글자 — 타자기 글쇠를 아주 작고 둥글게
    'type': {'n': 4, 'room': 0, 'var': lambda v: dict(layers=[
        L(B(1065), at=[0.12, 0.92, 2.91, 6.35][v], len=0.05, g=0, hp=400, lp=4000, tau=0.018),
        L(KI(f'impactWood_light_00{v}.ogg'), len=0.04, g=-12, st=7, hp=900, tau=0.015),
    ])},
    # 금화 — 동전 무더기 + 컵에 떨어지는 동전 + 손에 쥔 동전
    'coin': {'n': 4, 'var': lambda v: dict(layers=[
        L(RD(f'item_coins_0{v + 1}.ogg'), len=0.35, g=0, hp=400, tau=0.15, hold=0.02),
        L(B([339, 340, 339, 340][v]), len=0.3, g=-5, st=[2, 0, 4, 1][v], hp=800, tau=0.12, dly=10),
        L(K(['handleCoins.ogg', 'handleCoins2.ogg'][v % 2]), al='pk', len=0.14, g=-13, hp=1000, tau=0.06),
    ], eq=[('hs', 8000, -1.5, 0.7)])},
    # 아이템 획득 — 유리 풍경 + 보석 + 가죽 주머니 + 작은 종
    'item': {'n': 3, 'br': '96k', 'var': lambda v: dict(layers=[
        L(B([2080, 2081, 2083][v]), len=0.8, g=0, hp=900, tau=0.35, hold=0.05),
        L(RD(f'item_gem_0{v + 1}.ogg'), len=0.3, g=-4, hp=600, tau=0.12),
        L(K(['handleSmallLeather.ogg', 'handleSmallLeather2.ogg', 'beltHandle1.ogg'][v]), al='pk', len=0.14, g=-9, hp=200, tau=0.06),
        L(B([292, 293, 294][v]), len=0.9, g=-10, hp=1200, tau=0.4, dly=60),
    ])},
    # 레벨 업 — 글로켄슈필 상승 + 풍경 + 높인 징의 반짝임 + 종
    'levelup': {'n': 3, 'br': '96k', 'var': lambda v: dict(layers=[
        L(B(920), at=[0.1, 4.85, 10.2][v], len=1.3, g=0, hp=500, tau=0.6, hold=0.4),
        L(B([2079, 2082, 2088][v]), at=[0, 0, 0.8][v], len=1.4, g=-4, hp=1500, tau=0.6, dly=250),
        L(B(1482), len=1.5, g=-9, st=12, hp=300, tau=0.7, dly=380),
        L(B([292, 293, 294][v]), len=1.2, g=-8, hp=900, tau=0.5, dly=420),
    ], eq=[('ls', 200, -2.0, 0.7)])},

    # ───────────── 원소 마법 ─────────────
    # 불 — 불꽃 마법 녹음 + 큰 불의 '훅' 몸통 + 성냥 불티
    'fire': {'n': 4, 'var': lambda v: dict(layers=[
        L(RD(f'spell_fire_0{[1, 3, 5, 7][v]}.ogg'), len=0.5, g=0, hp=80, tau=0.2, hold=0.05),
        L(B(987), at=[0.03, 10.1, 7.2, 5.25][v], len=0.4, g=-5, lp=1500, hp=60, tau=0.15),
        L(B(4), at=0.27, len=0.15, g=-11, st=[0, 2, -2, 4][v], hp=1500, tau=0.05),
    ], eq=[('ls', 120, 2.0, 0.7)], sat=(1.6, 0.2))},
    # 얼음 — 얼음 깨짐 + 유리컵 속 얼음 + 유리 울림
    'ice': {'n': 4, 'var': lambda v: dict(layers=[
        L(B([2205, 2206, 2207, 2208][v]), at=[0.62, 0.32, 0.05, 0.21][v], len=0.3, g=0, hp=400, tau=0.1),
        L(B([2123, 2124, 2125, 2123][v]), len=0.3, g=-4, st=[2, 0, 3, -1][v], hp=1500, tau=0.12, dly=20),
        L(B([1325, 1330, 1328, 1325][v]), len=0.5, g=-10, st=[0, 2, -2, 4][v], hp=2500, tau=0.2, dly=40),
    ], eq=[('hs', 9000, -2.0, 0.7)], sat=(1.3, 0.1))},
    # 번개 (마법) — 채찍 같은 '딱' + 전기 지지직 + 천둥 몸통
    'thunder': {'n': 4, 'var': lambda v: dict(layers=[
        L(B([2949, 2951, 2950, 2952][v]), len=0.12, g=0, hp=800, tau=0.04, clip=4),
        L(B(134), at=[4.02, 8.42, 8.88, 2.32][v], len=0.25, g=-3, hp=600, tau=0.1),
        L(B(3113), at=0.98, al='pk', len=0.6, g=-5, st=[0, 2, -2, 1][v], lp=2500, hp=40, tau=0.25, dly=30),
    ], eq=[('ls', 90, 2.0, 0.7)], sat=(1.8, 0.25), lp=12000)},
    # 천둥 (장면 연출·보스) — 실제 천둥 한 번 + 앞의 '딱' + 낮은 우르릉
    'thunderclap': {'n': 3, 'br': '96k', 'var': lambda v: dict(layers=[
        L(B([3114, 3115, 2718][v]), at=[0.6, 0.43, 0.5][v], al='pk', pre=0.08, len=2.2, g=0, hp=35, tau=0.9, hold=0.15),
        L(B([2950, 2952, 2949][v]), len=0.15, g=-6, hp=1500, tau=0.05),
        L(B(3113), at=0.98, len=1.4, g=-6, st=-5, lp=600, tau=0.6, dly=60),
    ], eq=[('ls', 80, 2.0, 0.7)], sat=(1.6, 0.2))},
    # 성스러운 빛 — 풍경 + 작은 종 + 낮게 깔린 징 + 유리
    'holy': {'n': 3, 'br': '96k', 'var': lambda v: dict(layers=[
        L(B([2082, 2079, 2088][v]), at=[0, 0, 0.8][v], len=1.0, g=0, hp=800, tau=0.45, hold=0.1),
        L(B([292, 293, 294][v]), len=1.1, g=-3, hp=700, tau=0.5),
        L(B(1482), len=1.0, g=-11, st=7, hp=200, tau=0.5),
        L(B([1328, 1325, 1330][v]), len=0.6, g=-11, st=5, hp=3000, tau=0.25, dly=40),
    ])},
    # 어둠 — 낮게 내린 징 + 어두운 휙 + 쇠사슬
    'dark': {'n': 4, 'var': lambda v: dict(layers=[
        L(B(1483), len=0.9, g=0, st=[-12, -10, -14, -11][v], hp=40, lp=1500, tau=0.4, hold=0.05),
        L(B(573), at=W573[v] - 0.05, al='pk', pre=0.12, len=0.4, g=-4, st=-7, hp=150, lp=3000, tau=0.16, hold=0.08),
        L(B([359, 360, 359, 360][v]), at=[2.2, 0.13, 3.28, 0.13][v], len=0.4, g=-13, st=-5, hp=300, lp=4000, tau=0.15, dly=50),
    ], eq=[('ls', 90, 1.5, 0.7)], sat=(1.6, 0.2))},
    # 마법 (일반) — 나비 풍경 + 휙 + 불꽃놀이 초의 지지직
    'magic': {'n': 4, 'var': lambda v: dict(layers=[
        L(B([2087, 2088, 2081, 2080][v]), at=[1.39, 0.84, 0, 0][v], len=0.6, g=0, hp=1000, tau=0.25, hold=0.03),
        L(B([1797, 1802, 128, 1797][v]), al='pk', pre=0.06, len=0.2, g=-5, st=[3, 4, 2, 5][v], hp=800, tau=0.06, hold=0.05),
        L(B(1278), at=[3, 9, 15, 21][v], len=0.4, g=-11, hp=2500, tau=0.15, dly=20),
    ])},
    # 폭발 — 가까운 폭발 + 돌 부서짐 + 낮은 몸통
    'explode': {'n': 3, 'br': '96k', 'var': lambda v: dict(layers=[
        L(B([1808, 1807, 1806][v]), len=0.8, g=0, hp=30, tau=0.3, clip=4),
        L(BFH(f'bfh1_rock_breaking_0{[2, 3, 1][v]}.ogg'), len=0.7, g=-8, hp=300, tau=0.25, dly=30),
        L(B(2454), at=0.30, al='pk', win=1.2, len=0.6, g=-5, st=-10, lp=200, tau=0.25),
    ], eq=[('ls', 70, 2.0, 0.7), ('pk', 300, -2.0, 0.9)], sat=(2.4, 0.4))},

    # ───────────── 몸 종류별 적 사망 (enemy_die 의 변형 — 마지막 타격의 재질 층으로 고른다) ─────────────
    # 뼈 (해골) — 뼈 부러짐 + 뼈가 흩어져 떨어짐 + 나무 달그락
    'enemy_die_bone': {'n': 4, 'of': 'enemy_die', 'var': lambda v: dict(layers=[
        L(B(BONE[v][0]), at=BONE[v][1], al='pk', len=0.2, g=0, hp=500, tau=0.07),
        L(BFH(f'bfh1_wood_falling_0{[1, 2, 1, 2][v]}.ogg'), len=0.5, g=-4, st=4, hp=600, tau=0.2, dly=60),
        L(RD(f'item_wood_0{[1, 2, 3, 1][v]}.ogg'), len=0.25, g=-7, st=5, hp=800, tau=0.1, dly=140),
        L(B(FALL[v][0]), at=FALL[v][1], al='pk', win=1.2, len=0.3, g=-11, hp=60, lp=1500, tau=0.1, dly=100),
    ], eq=[('pk', 400, -2.0, 1.0)], sat=(1.4, 0.15))},
    # 영체 (유령) — 흩어지는 바람 + 내려가는 풍경 + 지지직 잔불
    'enemy_die_ghost': {'n': 4, 'of': 'enemy_die', 'br': '96k', 'var': lambda v: dict(layers=[
        L(B(573), at=W573[v] - 0.1, al='pk', pre=0.15, len=0.45, g=0, st=[-5, -4, -6, -3][v], hp=300, lp=6000, tau=0.18, hold=0.1),
        L(B([2080, 2081, 2083, 2082][v]), len=0.9, g=-6, st=-7, hp=600, tau=0.4, dly=30),
        L(B(1278), at=[2, 8, 14, 20][v], len=0.6, g=-13, hp=3000, tau=0.25),
    ])},
    # 돌·쇠 (갑옷·골렘·얼음) — 돌 무너짐 + 쇠 갑옷 떨어짐 + 무거운 쇠
    'enemy_die_stone': {'n': 4, 'of': 'enemy_die', 'var': lambda v: dict(layers=[
        L(BFH(f'bfh1_rock_breaking_0{[1, 2, 3, 1][v]}.ogg'), len=0.6, g=0, st=[0, -2, 1, -3][v], hp=60, tau=0.25),
        L(BFH(f'bfh1_metal_falling_0{v + 1}.ogg'), len=0.5, g=-5, hp=300, tau=0.2, dly=50),
        L(KI(f'impactMetal_heavy_00{v}.ogg'), len=0.3, g=-6, st=-3, hp=80, tau=0.1),
    ], eq=[('ls', 100, 1.5, 0.7), ('pk', 2500, -1.5, 1.0)], sat=(1.6, 0.2))},

    # ───────────── 탈것 ─────────────
    # 말발굽 (달리기 한 걸음) — 실제 말 질주 녹음의 발굽 하나 + 낮은 흙
    'gallop': {'n': 4, 'var': lambda v: dict(layers=[
        L(B(611), at=[0.29, 1.22, 1.77, 2.42][v], len=0.1, g=0, hp=80, tau=0.04),
        L(KI(f'footstep_concrete_00{v}.ogg'), len=0.06, g=-8, lp=500, tau=0.03),
    ], eq=EQ_STEP)},
    # 날갯짓 — 비둘기 날갯짓 한 번
    'wing_flap': {'n': 4, 'var': lambda v: dict(layers=[
        L(B([840, 476, 840, 476][v]), at=[0.13, 0.36, 0.5, 3.32][v], al='pk', pre=0.04, len=0.22, g=0, st=[-3, -2, -4, -1][v], hp=150, tau=0.08, hold=0.03),
        L(K(f'cloth{v + 1}.ogg'), al='pk', len=0.15, g=-9, st=-4, hp=200, tau=0.06),
    ])},
}

ALIAS = {'footstep': 'step_stone'}     # 같은 파일을 쓰는 이름 (용량 0)

for _r in R2.values():          # 2차 묶음 기본 AAC 비트레이트 (짧은 모노 효과음 — 용량 예산 +0.6 MB 안)
    _r.setdefault('br', '80k')
