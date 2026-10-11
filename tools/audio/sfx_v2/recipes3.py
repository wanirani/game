"""고급 효과음 v2 — 3차 묶음 레시피: 남은 104개 이름 전부 (build_sfx_v2.py 가 RECIPES 에 합친다). 소재는 모두 CC0 1.0 (sources.json).

목표: '합성음 단독 재생 0' — 등록된 모든 효과음 이름(내장 73 · 체감 45 · 동료 31)이 녹음 샘플을 갖는다 (docs/specs/anime_motion_sfx.md §4).
층 규칙은 1·2차와 같다: 녹음 층 2~4개 (순간음/몸통/꼬리), 합성음 층 없음.
용량: 이름마다 변형 3개(자주 울리는 hit_bone·hit_ghost·step_bone·down_hit 은 4개), 64 kbps 모노, 꼬리는 짧게 —
  메뉴·미니게임·연출 징글은 실제 오르골(music box) 음 하나하나를 녹음한 BigSoundBank 소재로 화음을 쌓는다 (오르골 G#·A#·C·C#·D#·F·G).
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


QP = [f'oga:qubodup_punch/qubodupPunch0{i}.flac' for i in range(1, 6)]
MEAT = ['oga:qubodup_impact/qubodupImpactMeat01.flac', 'oga:qubodup_impact/qubodupImpactMeat02.flac']
MED = 'oga:medieval/'
PUNCH = [2460, 2461, 2463, 2465, 2468]
FALL = [(2452, 0.0), (2453, 0.0), (2455, 0.0), (2456, 0.0)]
# 오르골 음 (BigSoundBank 'Music box, <음> #n') — 반음 번호(C=0) → 소재 번호
MB = {'G#': 1865, 'A#': 1866, 'C': 1867, 'C#': 1868, 'D#': 1869, 'F': 1870, 'G': 1871,
      'G#2': 1872, 'A#2': 1873, 'C2': 1874, 'C#2': 1875, 'D#2': 1876, 'F2': 1877, 'G2': 1878, 'G#3': 1879}
CHIME = [2079, 2080, 2081, 2082, 2083, 2084, 2085, 2086]      # Chimes "dream"
BUTTERFLY = [2087, 2088, 2089]                                 # Chimes "butterfly"
GLASS = [1325, 1328, 1330, 1332, 1335]                         # 와인잔 건배 (맑은 '팅')
WHOOSH = [1795, 1796, 1797, 1798, 1799, 1800, 1801, 1802]


def arp(notes, step, g=0, st=0, len_=0.55, tau=0.22, dly0=0, hp=300, decay=0.0):
    """오르골 화음/아르페지오 층들 (음마다 dly 를 step ms 씩)"""
    return [L(B(MB[n]), len=len_, g=g - decay * i, st=st, hp=hp, tau=tau, hold=0.02, dly=dly0 + i * step) for i, n in enumerate(notes)]


R3 = {
    # ═════════════ 내장 (src/core/audio.js) ═════════════
    # 산탄총 (빅터) — 실제 산탄총·소총 총성 + 가슴을 치는 저음 + 펌프 '철컥'
    'shotgun': {'n': 3, 'var': lambda v: dict(layers=[
        L(B([397, 2854, 397][v]), at=[0.95, 0, 0.95][v], len=0.45, g=0, st=[-1, -2, -3][v], hp=70, tau=0.14, hold=0.01, clip=6),
        L(KI(f'impactPunch_heavy_00{v + 1}.ogg'), len=0.2, g=-6, st=-6, lp=380, tau=0.09),
        L(B([1984, 1985, 1984][v]), at=[1.45, 0.3, 0.1][v], al='pk', len=0.1, g=-13, st=-3, hp=900, tau=0.04, dly=230),
    ], eq=[('ls', 90, 2.0, 0.7), ('pk', 600, -2.0, 1.0)], sat=(2.4, 0.35), lp=11000)},
    # 십자가 부메랑 — 회전하며 지나가는 두 번의 휙 + 쇠 십자가의 얇은 울림
    'cross': {'n': 3, 'var': lambda v: dict(layers=[
        L(B([1798, 1801, 1799][v]), al='pk', pre=0.06, len=0.16, g=0, st=1, hp=300, tau=0.05, hold=0.04),
        L(B([1801, 1799, 1798][v]), al='pk', pre=0.06, len=0.16, g=-3, st=0, hp=300, tau=0.05, dly=130),
        L(B(GLASS[v]), len=0.4, g=-12, st=-7, hp=1200, tau=0.16, dly=10),
    ], eq=[('pk', 450, -1.5, 1.0)], sat=(1.3, 0.1))},
    # 성수 — 병이 깨져 '쉬익' 끓는 거품 + 작은 물보라 + 불꽃 '훅'
    'holywater_burn': {'n': 3, 'var': lambda v: dict(layers=[
        L(B([1529, 1531, 1532][v]), len=0.25, g=-2, hp=300, tau=0.08),
        L(B(117), at=[0.3, 1.6, 3.1][v], len=0.55, g=0, hp=1500, tau=0.22, hold=0.05, dly=40),
        L(RD(f'spell_fire_0{[2, 4, 6][v]}.ogg'), len=0.4, g=-7, hp=120, tau=0.15, dly=30),
    ], eq=[('hs', 9000, -2.0, 0.7)], sat=(1.3, 0.1))},
    # 시간 정지 — 시계 태엽 '드르륵' + 초침 두 번 + 낮게 울리는 징
    'stopwatch': {'n': 3, 'var': lambda v: dict(layers=[
        L(B([1674, 1675, 2668][v]), at=[1.54, 0.9, 0.056][v], len=0.35, g=-2, hp=600, tau=0.12, hold=0.05),
        L(B(2137), at=[0.62, 0.856, 1.12][v], len=0.09, g=-4, hp=900, tau=0.03, dly=200),
        L(B(2137), at=[1.12, 0.62, 0.856][v], len=0.09, g=-6, hp=900, tau=0.03, dly=480),
        L(B(1482), len=1.0, g=-6, st=[5, 3, 7][v], hp=150, tau=0.4, dly=150),
    ])},
    # 안개 변신 — 길게 빠지는 바람 + 숨결
    'mist': {'n': 3, 'var': lambda v: dict(layers=[
        L(B(573), at=[2.48, 9.39, 4.70][v] - 0.1, al='pk', pre=0.15, len=0.6, g=0, st=-5, hp=250, lp=6000, tau=0.25, hold=0.1),
        L(B(747), at=[0.26, 1.784, 2.564][v], len=0.6, g=-6, hp=800, tau=0.25),
        L(B(CHIME[v + 2]), len=0.5, g=-15, st=-5, hp=1500, tau=0.2, dly=60),
    ])},
    # 물 튀김 — 실제 작은 물보라 + 젖은 천
    'splash': {'n': 3, 'var': lambda v: dict(layers=[
        L(B([1529, 1530, 1532][v]), len=0.4, g=0, hp=120, tau=0.15),
        L(f'oga:qubodup_impact/qubodupImpactMeat0{v % 2 + 1}.flac', len=0.12, g=-11, st=-4, lp=1500, tau=0.05),
    ], eq=[('hs', 9000, -2.0, 0.7)])},
    # 플레이어 사망 — 몸이 무너지는 무게 + 아주 낮게 내린 교회 종 + 징
    'death': {'n': 3, 'var': lambda v: dict(layers=[
        L(B(FALL[v][0]), at=FALL[v][1], al='pk', win=1.2, len=0.6, g=0, st=-3, hp=40, lp=2500, tau=0.22, hold=0.03),
        L(B(135), at=[0.0, 6.3, 12.0][v], al='pk', pre=0.01, win=4.0, len=1.6, g=-3, st=[-7, -8, -9][v], hp=60, tau=0.7, hold=0.05, dly=120),
        L(B(1483), len=1.4, g=-8, st=-14, lp=900, tau=0.6, dly=100),
    ], eq=[('ls', 90, 1.5, 0.7)], sat=(1.4, 0.15))},
    # 하트(생명 회복 아이템) — 작은 종 + 유리 '팅' + 오르골 한 음
    'heart': {'n': 3, 'var': lambda v: dict(layers=[
        L(B([292, 293, 294][v]), len=0.4, g=0, hp=900, tau=0.16),
        L(B(GLASS[v + 1]), len=0.35, g=-5, st=[2, 0, 4][v], hp=2000, tau=0.14),
        L(B(MB[['C2', 'D#2', 'G2'][v]]), len=0.45, g=-7, hp=300, tau=0.2, dly=30),
    ])},
    # 무기 강화 획득 — 오르골 상행 3음 + 풍경
    'powerup': {'n': 3, 'var': lambda v: dict(layers=arp([['C', 'D#', 'G'], ['G#', 'C', 'D#'], ['D#', 'G', 'A#']][v], 70, len_=0.45, tau=0.2) + [
        L(B(CHIME[v]), len=0.6, g=-6, hp=1200, tau=0.25, dly=140),
        L(B(WHOOSH[v + 2]), al='pk', pre=0.06, len=0.2, g=-12, st=5, hp=1200, tau=0.06),
    ])},
    # 1UP — 오르골 4음 상행 + 맑은 종 + 풍경
    'extra_life': {'n': 3, 'var': lambda v: dict(layers=arp([['C', 'D#', 'G', 'C2'], ['G#', 'C', 'D#', 'G#2'], ['D#', 'G', 'A#', 'D#2']][v], 85, len_=0.5, tau=0.24) + [
        L(B(2115), len=0.8, g=-6, st=[0, -2, 2][v], hp=600, tau=0.35, dly=255),
        L(B(BUTTERFLY[v]), len=0.6, g=-9, hp=1500, tau=0.25, dly=255),
    ])},
    # 세이브 — 티베트 싱잉볼 + 풍경 + 작은 종 (조용히 오래)
    'save': {'n': 3, 'var': lambda v: dict(layers=[
        L(B(1110), len=1.3, g=0, st=[0, 2, -2][v], hp=150, tau=0.6, hold=0.05),
        L(B(CHIME[v + 4]), len=0.9, g=-5, hp=1200, tau=0.35, dly=40),
        L(B([292, 293, 294][v]), len=0.7, g=-9, st=-5, hp=700, tau=0.3, dly=180),
    ])},
    # 비밀 발견 — 신비로운 오르골 음정(증4도) + 나비 풍경 + 유리
    'secret': {'n': 3, 'var': lambda v: dict(layers=arp([['C', 'F', 'G#2'], ['D#', 'A#', 'C#2'], ['G#', 'C#', 'F2']][v], 110, len_=0.6, tau=0.28) + [
        L(B(BUTTERFLY[v]), len=0.8, g=-5, hp=1500, tau=0.3, dly=60),
    ])},
    # 박쥐 울음 — 실제 박쥐 울음 두 번 + 날갯짓
    'bat': {'n': 3, 'var': lambda v: dict(layers=[
        L(B(458), at=[0.24, 0.97, 3.05][v], len=0.1, g=0, st=-14, hp=800, tau=0.04),
        L(B(458), at=[1.80, 3.28, 2.0][v], len=0.1, g=-4, st=-15, hp=800, tau=0.04, dly=90),
        L(B(840), at=[0.13, 0.55, 0.13][v], win=0.5, al='pk', pre=0.03, len=0.16, g=-8, st=2, hp=300, tau=0.06),
    ])},
    # 유령 — 낮은 유령 신음 (짧게) + 바람
    'ghost': {'n': 3, 'var': lambda v: dict(layers=[
        L(B([2046, 2047, 2048][v]), at=[0.5, 1.2, 0.8][v], al='pk', pre=0.25, win=2.0, len=0.9, g=0, st=[2, 0, 3][v], hp=120, lp=5000, tau=0.35, hold=0.15),
        L(B(573), at=2.48, al='pk', pre=0.2, len=0.6, g=-9, st=-6, hp=400, lp=5000, tau=0.25, dly=60),
    ])},
    # 보스 포효 — 괴물 그르렁 (낮게) + 고양잇과 포효 (아주 낮게) + 천둥 몸통
    'boss_roar': {'n': 3, 'var': lambda v: dict(layers=[
        L(B(486), at=[3.96, 5.69, 0.03][v], al='pk', pre=0.15, win=1.2, len=1.3, g=0, st=-5, hp=50, lp=5000, tau=0.5, hold=0.2),
        L(B([1881, 1883, 1884][v]), al='pk', pre=0.1, len=0.9, g=-3, st=-12, hp=60, tau=0.4, hold=0.1, dly=40),
        L(B(3113), at=0.98, al='pk', len=1.2, g=-8, st=-8, lp=500, tau=0.5, dly=80),
    ], eq=[('ls', 80, 2.0, 0.7)], sat=(2.0, 0.3))},
    # 보스 경고 — 큰 북 두 번 + 강한 징
    'warning': {'n': 3, 'var': lambda v: dict(layers=[
        L(B([2338, 2341, 2338][v]), len=0.5, g=0, st=[-2, 0, -3][v], hp=40, tau=0.2),
        L(B([2341, 2338, 2341][v]), len=0.5, g=-1, st=[-3, -1, -4][v], hp=40, tau=0.2, dly=280),
        L(B([1484, 1485, 1484][v]), len=1.2, g=-4, st=[-5, -7, -4][v], hp=80, tau=0.5, dly=280),
    ], eq=[('ls', 80, 1.5, 0.7)], sat=(1.6, 0.2))},
    # 필살기 발동 — 거꾸로 차오르는 심벌 + 징 '쾅' + 풍경
    'ult': {'n': 3, 'var': lambda v: dict(layers=[
        L(B([2311, 2315, 2311][v]), len=0.45, g=-2, rev=True, hp=600, tau=0),
        L(B([1485, 1484, 1485][v]), len=0.8, g=0, st=[-3, -5, -2][v], hp=60, tau=0.32, dly=430),
        L(B([2338, 2341, 2338][v]), len=0.5, g=-3, st=-2, hp=35, tau=0.2, dly=430),
        L(B(CHIME[v + 1]), len=0.6, g=-10, hp=1500, tau=0.25, dly=440),
    ], sat=(1.8, 0.25))},
    # 콤보 증가 — 아주 짧은 유리 '팅' + 오르골 높은 음
    'combo': {'n': 3, 'var': lambda v: dict(layers=[
        L(B(GLASS[[0, 2, 4][v]]), len=0.14, g=0, st=[5, 7, 9][v], hp=2500, tau=0.05),
        L(B(MB[['G2', 'G#3', 'G2'][v]]), len=0.16, g=-4, st=[0, 0, 2][v], hp=800, tau=0.06),
    ])},
    # 차지 완료 — 맑은 잔 '팅' + 오르골 + 작은 종
    'charge_ready': {'n': 3, 'var': lambda v: dict(layers=[
        L(B(GLASS[v + 2]), len=0.4, g=0, st=3, hp=2000, tau=0.15),
        L(B(MB[['C2', 'D#2', 'G2'][v]]), len=0.4, g=-3, hp=500, tau=0.16, dly=15),
        L(B([292, 293, 294][v]), len=0.4, g=-9, st=4, hp=1200, tau=0.16),
    ])},
    # 강화 성공 — 모루 '깡' + 상행 오르골 + 종 + 풍경
    'enhance_success': {'n': 3, 'var': lambda v: dict(layers=[
        L(B([3589, 3590, 3589][v]), len=0.5, g=0, hp=200, tau=0.2),
        *arp([['C', 'G', 'C2'], ['G#', 'D#', 'G#2'], ['D#', 'A#', 'D#2']][v], 90, g=-3, len_=0.6, tau=0.26, dly0=180),
        L(B(2115), len=0.9, g=-6, hp=500, tau=0.4, dly=360),
        L(B(BUTTERFLY[v]), len=0.7, g=-9, hp=1500, tau=0.3, dly=360),
    ])},
    # 강화 실패 — 둔한 모루 + 쇠가 떨어지는 소리 + 낮은 징 짧게
    'enhance_fail': {'n': 3, 'var': lambda v: dict(layers=[
        L(B([3590, 3589, 3590][v]), len=0.3, g=0, st=-3, lp=4000, tau=0.1),
        L(BFH(f'bfh1_metal_falling_0{v + 1}.ogg'), len=0.5, g=-4, hp=200, tau=0.2, dly=120),
        L(B(1483), len=0.8, g=-6, st=-12, lp=800, tau=0.3, dly=60),
    ], sat=(1.4, 0.15))},
    # 강화 파괴 — 유리·거울이 산산조각 + 쇠 무너짐 + 낮은 징
    'enhance_destroy': {'n': 3, 'var': lambda v: dict(layers=[
        L(B([3589, 3590, 3589][v]), len=0.3, g=-3, hp=200, tau=0.1),
        L(B([148, 387, 148][v]), len=0.9, g=0, hp=300, tau=0.35, dly=40),
        L(BFH(f'bfh1_metal_falling_0{[4, 5, 3][v]}.ogg'), len=0.6, g=-6, hp=200, tau=0.25, dly=160),
        L(B(1483), len=1.2, g=-7, st=-15, lp=700, tau=0.5, dly=40),
    ], sat=(1.6, 0.2))},
    # 주사위 — 실제 주사위가 나무 탁자에 구르는 소리
    'dice': {'n': 3, 'var': lambda v: dict(layers=[
        L(B([581, 582, 583][v]), at=[0.07, 0.06, 0.0][v], len=0.6, g=0, hp=250, tau=0.25, hold=0.15),
        L(KI(f'impactWood_light_00{v}.ogg'), len=0.1, g=-10, st=6, hp=600, tau=0.04, dly=10),
    ])},
    # 슬롯 회전 — 라쳇이 빠르게 도는 '드르르'
    'slot_spin': {'n': 3, 'var': lambda v: dict(layers=[
        L(B(1435), at=[0.95, 2.43, 4.13][v], len=0.7, g=0, hp=800, tau=0.4, hold=0.3),
        L(B(794), at=[2.26, 1.29, 2.26][v], len=0.35, g=-6, st=-4, hp=600, tau=0.15),
    ], sat=(4.0, 0.6)), 'cmax': 10, 'lmax': 9},
    # 슬롯 당첨 — 동전 쏟아짐 + 종 + 오르골 화음
    'slot_win': {'n': 3, 'var': lambda v: dict(layers=[
        L(B(193), at=[0.0, 3.0, 6.0][v], al='pk', pre=0.05, win=3.0, len=0.9, g=0, hp=400, tau=0.35, hold=0.2),
        *arp([['C', 'D#', 'G', 'C2'], ['G#', 'C', 'D#', 'G#2'], ['D#', 'G', 'A#', 'D#2']][v], 60, g=-3, len_=0.5, tau=0.22),
        L(B(2117), len=0.8, g=-7, hp=800, tau=0.35, dly=240),
    ])},
    # 승리 — 밝은 오르골 화음 + 나비 풍경 + 종
    'win': {'n': 3, 'cmax': 9, 'var': lambda v: dict(lp=11000, layers=arp([['C', 'D#', 'G', 'C2', 'D#2'], ['G#', 'C', 'D#', 'G#2', 'C2'], ['D#', 'G', 'A#', 'D#2', 'G2']][v], 75, len_=0.55, tau=0.25) + [
        L(B(BUTTERFLY[v]), len=0.7, g=-6, hp=1500, tau=0.3, dly=300),
        L(B([292, 293, 294][v]), len=0.6, g=-8, hp=900, tau=0.25, dly=300),
    ])},
    # 패배 — 낮게 내린 오르골 하행 + 낮은 징
    'lose': {'n': 3, 'var': lambda v: dict(layers=arp([['G', 'D#', 'C'], ['D#', 'C', 'G#'], ['F', 'C#', 'A#']][v], 160, st=-5, len_=0.7, tau=0.3) + [
        L(B(1483), len=1.0, g=-6, st=-14, lp=900, tau=0.4, dly=320),
    ])},
    # 준비 — 손종 두 번 '띵 띵'
    'ready': {'n': 3, 'var': lambda v: dict(layers=[
        L(B(479), len=0.25, g=0, st=[0, -2, 2][v], hp=600, tau=0.09),
        L(B(479), len=0.3, g=0, st=[0, -2, 2][v], hp=600, tau=0.1, dly=190),
    ])},
    # 시작 — 권투 종 '땡' + 북
    'go': {'n': 3, 'var': lambda v: dict(layers=[
        L(B(1926), len=0.8, g=0, st=[0, 1, -1][v], hp=500, tau=0.3),
        L(B([2338, 2341, 2338][v]), len=0.35, g=-4, hp=40, tau=0.12),
        L(B(479), len=0.4, g=-8, st=7, hp=1000, tau=0.14),
    ])},
    # 상자 열기 — 쇠 걸쇠 '딸깍' + 경첩 삐걱 + 동전 반짝
    'chest': {'n': 3, 'var': lambda v: dict(layers=[
        L(K(['metalLatch.ogg', 'metalClick.ogg', 'metalLatch.ogg'][v]), len=0.15, g=0, hp=400, tau=0.06),
        L(K(f'creak{v + 1}.ogg'), len=0.5, g=-3, hp=150, tau=0.2, dly=80),
        L(RD(f'item_coins_0{v + 1}.ogg'), len=0.4, g=-9, hp=800, tau=0.15, dly=380),
    ])},
    # 회복 — 풍경 + 싱잉볼 짧게 + 맑은 잔
    'heal': {'n': 3, 'var': lambda v: dict(layers=[
        L(B(CHIME[v + 3]), len=0.8, g=0, hp=1000, tau=0.3),
        L(B(1110), len=0.9, g=-5, st=[7, 5, 9][v], hp=300, tau=0.35, dly=20),
        L(B(GLASS[v]), len=0.4, g=-10, st=2, hp=2000, tau=0.15, dly=120),
    ])},
    # 촛대 부수기 — 쇠 촛대 '텅' + 유리 조각 + 불씨
    'candle': {'n': 3, 'var': lambda v: dict(layers=[
        L(KI(f'impactMetal_light_00{v}.ogg'), len=0.2, g=0, hp=300, tau=0.07),
        L(BFH(f'bfh1_glass_hit_0{v % 2 + 1}.ogg'), len=0.25, g=-6, hp=1000, tau=0.09, dly=10),
        L(B(49), at=[0.04, 6.64, 0.04][v], len=0.2, g=-12, st=[0, 0, 2][v], hp=1500, tau=0.07, dly=20),
    ])},
    # 문 — 나무 문 열림 + 경첩 + 닫힘 '쿵'
    'door': {'n': 3, 'var': lambda v: dict(layers=[
        L(K(['doorOpen_1.ogg', 'doorOpen_2.ogg', 'doorOpen_1.ogg'][v]), len=0.6, g=0, st=[0, -1, -2][v], hp=80, tau=0.25, hold=0.1),
        L(K(f'doorClose_{v + 1}.ogg'), len=0.3, g=-5, hp=60, tau=0.12, dly=380),
    ])},
    # 벽 부수기 — 돌 무너짐 + 돌 굴러떨어짐 + 곡괭이
    'break_wall': {'n': 3, 'var': lambda v: dict(layers=[
        L(KI(f'impactMining_00{v + 1}.ogg'), len=0.2, g=0, hp=60, tau=0.08),
        L(BFH(f'bfh1_rock_breaking_0{v + 1}.ogg'), len=0.7, g=-1, hp=60, tau=0.3, dly=20),
        L(BFH(f'bfh1_rock_falling_0{[2, 4, 6][v]}.ogg'), len=0.7, g=-6, hp=150, tau=0.3, dly=150),
    ], eq=[('ls', 100, 1.5, 0.7)], sat=(1.6, 0.2))},
    # 종 — 실제 종 (교회 종 · 작은 종)
    'bell': {'n': 3, 'var': lambda v: dict(layers=[
        L(B([135, 2115, 2117][v]), at=[6.3, 0, 0][v], al='pk', pre=0.01, win=4.0, len=1.4, g=0, st=[0, -3, -5][v], hp=150, tau=0.6, hold=0.05),
        L(B([292, 293, 294][v]), len=0.6, g=-10, st=-7, hp=600, tau=0.25),
    ])},
    # 시계 초침 — 기계 시계 '똑' 하나
    'clock_tick': {'n': 3, 'var': lambda v: dict(layers=[
        L(B(1372), at=[0.004, 0.3, 0.892][v], len=0.12, g=0, hp=700, tau=0.04),
        L(B(2137), at=[0.62, 0.856, 1.12][v], len=0.07, g=-9, st=-4, hp=900, tau=0.025),
    ])},
    # 보스 사망 — 큰 폭발 + 몸이 무너짐 + 낮은 징 + 돌 무너짐
    'boss_die': {'n': 3, 'var': lambda v: dict(layers=[
        L(B([1807, 1808, 1806][v]), len=1.0, g=0, hp=30, tau=0.4, clip=4),
        L(B(2454), at=0.30, al='pk', win=1.2, len=0.8, g=-3, st=-8, lp=300, tau=0.3, dly=150),
        L(B(1483), len=1.6, g=-6, st=-16, lp=700, tau=0.7, dly=60),
        L(BFH(f'bfh1_rock_falling_0{[3, 5, 7][v]}.ogg'), len=0.9, g=-11, hp=300, tau=0.35, dly=300),
    ], eq=[('ls', 70, 2.0, 0.7)], sat=(2.2, 0.35))},
    # 대장간 망치질 — 모루 '깡'
    'enhance_hit': {'n': 3, 'var': lambda v: dict(layers=[
        L(B([3589, 3590, 3589][v]), at=[0.0, 0.0, 1.0][v], len=0.45, g=0, st=[0, -1, 1][v], hp=150, tau=0.18),
        L(KI(f'impactMetal_heavy_00{v}.ogg'), len=0.2, g=-7, st=-3, hp=80, tau=0.07),
    ])},
    # 카드 — 종이 넘김 '착'
    'card': {'n': 3, 'var': lambda v: dict(layers=[
        L(B(164), len=0.18, g=0, st=[3, 5, 1][v], hp=1000, tau=0.06),
        L(K(f'bookFlip{v + 1}.ogg'), len=0.12, g=-6, st=4, hp=1500, tau=0.04),
    ])},
    # 동전 넣기 — 컵 속 동전 '찰랑' + 쇠 딸깍
    'coin_insert': {'n': 3, 'var': lambda v: dict(layers=[
        L(B([339, 340, 339][v]), at=[0, 0, 0.6][v], len=0.35, g=0, hp=500, tau=0.12),
        L(K('metalClick.ogg'), len=0.1, g=-8, st=[0, 2, -2][v], hp=800, tau=0.04, dly=120),
    ])},

    # ═════════════ 체감 (src/core/sfx_feel.js) ═════════════
    'step_bone': {'n': 4, 'var': lambda v: dict(layers=[
        L(B([1408, 1409, 1408, 1409][v]), al='pk', len=0.09, g=0, st=[6, 4, 3, 7][v], hp=700, tau=0.03),
        L(KI(f'footstep_wood_00{v}.ogg'), len=0.08, g=-3, lp=2500, tau=0.03),
    ], eq=[('pk', 250, -1.5, 1.0)])},
    # 밀기 (블록·상자) — 신발이 버티는 소리 + 무거운 돌이 끌림
    'step_push': {'n': 3, 'var': lambda v: dict(layers=[
        L(KI(f'footstep_concrete_00{v + 1}.ogg'), len=0.08, g=0, lp=3000, tau=0.03),
        L(B(1634), at=[0.5, 2.0, 3.5][v], len=0.25, g=-4, st=-3, hp=100, lp=3000, tau=0.1, hold=0.05),
    ])},
    # 미끄러짐 — 신발이 바닥을 쓸며 자갈 '사르륵'
    'skid': {'n': 3, 'var': lambda v: dict(layers=[
        L(B(1318), at=[1.89, 2.51, 4.34][v], len=0.22, g=0, hp=400, tau=0.1, hold=0.05),
        L(B(510), at=[0.5, 1.5, 2.5][v], len=0.25, g=-4, hp=600, tau=0.1),
    ])},
    # 방향 전환 — 짧은 옷깃 + 밑창 '쓱'
    'pivot': {'n': 3, 'var': lambda v: dict(layers=[
        L(K(f'cloth{v + 1}.ogg'), al='pk', len=0.1, g=0, hp=400, tau=0.04),
        L(B(1318), at=[0.64, 1.89, 2.51][v], len=0.08, g=-4, hp=900, tau=0.03),
    ])},
    # 대시 순간 — 강한 휙 + 깃발 펄럭 + 낮은 '퍽'
    'dash_burst': {'n': 3, 'var': lambda v: dict(layers=[
        L(B([1800, 1801, 1798][v]), al='pk', pre=0.05, len=0.25, g=0, st=1, hp=200, tau=0.08, hold=0.04),
        L(B([1787, 1788, 1787][v]), al='pk', pre=0.03, len=0.18, g=-6, st=2, hp=300, tau=0.06),
        L(QP[v], len=0.12, g=-11, st=-8, lp=300, tau=0.05),
    ])},
    # 띄우기 (올려치기) — 위로 치솟는 휙 + 묵직한 펀치
    'launch': {'n': 3, 'var': lambda v: dict(layers=[
        L(KI(f'impactPunch_heavy_00{v}.ogg'), len=0.2, g=0, hp=50, tau=0.08),
        L(B([1799, 1797, 1802][v]), al='pk', pre=0.06, len=0.3, g=-2, st=4, hp=500, tau=0.1, hold=0.04, dly=20),
        L(K(f'cloth{v + 2}.ogg'), al='pk', len=0.12, g=-10, hp=400, tau=0.05, dly=40),
    ], sat=(1.6, 0.2))},
    # 다운 공격 (쓰러진 적) — 땅을 울리는 짧은 퍽
    'down_hit': {'n': 4, 'var': lambda v: dict(layers=[
        L(KI(f'impactPunch_medium_00{v}.ogg'), len=0.14, g=0, hp=60, tau=0.05),
        L(B(FALL[v][0]), at=FALL[v][1], al='pk', win=1.2, len=0.2, g=-4, st=-2, lp=1500, tau=0.07),
    ], sat=(1.5, 0.2))},
    # 백어택 — 날카로운 '짝' + 살 + 뼈
    'back_attack': {'n': 3, 'var': lambda v: dict(layers=[
        L(B(PUNCH[v + 1]), len=0.12, g=0, hp=400, tau=0.04, clip=6),
        L(B([2582, 2586, 2591][v]), al='pk', len=0.16, g=-3, hp=200, lp=6000, tau=0.06),
        L(B([1408, 1409, 1408][v]), al='pk', len=0.12, g=-7, hp=900, tau=0.04, dly=10),
    ], sat=(1.8, 0.25))},
    # 무거운 착지 — 높은 곳에서 떨어진 몸무게 '쿵' + 콘크리트 착지 + 흙
    'land_heavy': {'n': 3, 'var': lambda v: dict(layers=[
        L(B([1835, 1836, 1837][v]), at=[0.9, 0.32, 0.45][v], len=0.22, g=0, st=-3, hp=40, lp=5000, tau=0.08, hold=0.01),
        L(B(FALL[v][0]), at=FALL[v][1], al='pk', win=1.2, len=0.3, g=-2, st=-4, hp=35, lp=1500, tau=0.11),
        L(KI(f'impactPunch_heavy_00{v + 1}.ogg'), len=0.18, g=-6, st=-5, lp=400, tau=0.07),
    ], eq=[('ls', 90, 2.5, 0.7), ('pk', 400, -2.0, 1.0)], sat=(1.6, 0.2))},
    # 벽 튕김 — 몸이 벽에 '쾅' + 나무 판 + 펀치
    'wall_bounce': {'n': 3, 'var': lambda v: dict(layers=[
        L(B(FALL[v][0]), at=FALL[v][1], al='pk', win=1.2, len=0.3, g=0, hp=60, lp=3000, tau=0.1),
        L(KI(f'impactPlank_medium_00{v}.ogg'), len=0.2, g=-3, hp=100, tau=0.07),
        L(QP[v + 1], len=0.15, g=-8, st=-4, lp=500, tau=0.06),
    ], sat=(1.6, 0.2))},
    # 바닥 튕김 — 몸이 바닥에 떨어짐 + 흙먼지 + 돌
    'ground_bounce': {'n': 3, 'var': lambda v: dict(layers=[
        L(B([2453, 2455, 2456][v]), al='pk', win=1.2, len=0.35, g=0, hp=40, lp=2500, tau=0.12),
        L(KI(f'impactSoft_heavy_00{v}.ogg'), len=0.25, g=-3, lp=1200, tau=0.1),
        L(BFH('bfh1_rock_hit_01.ogg'), len=0.12, g=-12, st=-3, hp=400, tau=0.05),
    ], eq=[('ls', 90, 1.5, 0.7)], sat=(1.6, 0.2))},
    # 카운터 (쳐내고 반격) — 칼날끼리 '챙' + 맑은 울림 + 휙
    'counter': {'n': 3, 'var': lambda v: dict(layers=[
        L(MED + ['Sabre Katana Blade on Blade.wav', 'Norse Sword Katana Blade on Blade.wav', 'Sabre Norse Sword Blade on Blade.wav'][v],
          at=[2.58, 0.19, 12.39][v], len=0.5, g=0, hp=300, tau=0.2, clip=3),
        L(B(GLASS[v + 1]), len=0.4, g=-9, st=-3, hp=2000, tau=0.15, dly=10),
        L(B(WHOOSH[v + 4]), al='pk', pre=0.04, len=0.15, g=-9, st=3, hp=800, tau=0.05, dly=60),
    ])},
    # 뼈 재질 층 — 뼈가 꺾이는 '딱' + 나무 달그락
    'hit_bone': {'n': 4, 'var': lambda v: dict(layers=[
        L(B([1408, 1409, 596, 596][v]), at=[0, 0, 3.80, 6.90][v], al='pk', len=0.14, g=0, st=[0, 1, -1, 2][v], hp=500, tau=0.05),
        L(RD(f'item_wood_0{v % 3 + 1}.ogg'), len=0.14, g=-5, st=4, hp=700, tau=0.05, dly=8),
        L(QP[v], len=0.12, g=-10, st=-3, lp=800, tau=0.04),
    ], eq=[('pk', 400, -2.0, 1.0)], sat=(1.5, 0.2))},
    # 영체 재질 층 — 차가운 바람이 갈라지는 휙 + 유령 숨 + 유리 울림
    'hit_ghost': {'n': 4, 'var': lambda v: dict(layers=[
        L(B([1797, 1802, 1797, 1802][v]), al='pk', pre=0.03, len=0.18, g=0, st=[-2, -3, -1, -4][v], hp=600, tau=0.06),
        L(B([2049, 2050, 2047, 2048][v]), at=[1.0, 1.5, 2.0, 2.5][v], al='pk', pre=0.05, win=2.0, len=0.3, g=-4, st=4, hp=300, tau=0.1),
        L(B(GLASS[v]), len=0.3, g=-12, st=-5, hp=2500, tau=0.1, dly=5),
    ])},
    # 깨지는 충격 (강한 타격 마무리) — 돌·얼음이 쩍 갈라짐 + 무거운 펀치
    'impact_crack': {'n': 3, 'var': lambda v: dict(layers=[
        L(KI(f'impactPunch_heavy_00{v + 2}.ogg'), len=0.25, g=0, hp=40, tau=0.1),
        L(B([2205, 2206, 2207][v]), at=[0.62, 0.32, 0.05][v], len=0.25, g=-3, hp=500, tau=0.08),
        L(BFH(f'bfh1_rock_breaking_0{v + 1}.ogg'), len=0.35, g=-6, hp=200, tau=0.12, dly=10),
    ], eq=[('ls', 80, 2.0, 0.7)], sat=(2.0, 0.3))},
    # 처치 슬로모션 — 느리게 늘어지는 휙 + 심장 한 번 + 낮은 징
    'kill_slowmo': {'n': 3, 'var': lambda v: dict(layers=[
        L(B(573), at=[8.18, 2.48, 12.0][v] - 0.08, al='pk', pre=0.1, len=0.7, g=0, st=-9, hp=150, lp=4000, tau=0.3, hold=0.1),
        L(B([243, 244, 243][v]), len=0.4, g=-2, st=-2, lp=500, tau=0.15),
        L(B(1482), len=0.7, g=-9, st=-10, lp=1500, tau=0.3, dly=30),
    ], lp=10000)},
    # 랭크 상승 — 오르골 빠른 상행 4음 + 맑은 잔
    'rank_up': {'n': 3, 'var': lambda v: dict(layers=arp([['C', 'D#', 'G', 'C2'], ['D#', 'G', 'A#', 'D#2'], ['G#', 'C', 'D#', 'G#2']][v], 40, len_=0.35, tau=0.14) + [
        L(B(GLASS[v + 2]), len=0.35, g=-5, st=5, hp=2500, tau=0.14, dly=130),
    ])},
    # 아나운서 (각성·랭크 문구 등장) — 큰 북 + 크래시 심벌 + 징 짧게
    'announce': {'n': 3, 'var': lambda v: dict(layers=[
        L(B([2338, 2341, 2338][v]), len=0.45, g=0, st=-2, hp=35, tau=0.18),
        L(B([2315, 2311, 2320][v]), len=0.5, g=-4, hp=1500, tau=0.2),
        L(B([1484, 1485, 1484][v]), len=0.55, g=-6, st=-3, hp=100, tau=0.22),
    ], sat=(1.6, 0.2))},
    # 콤보 이정표 — 오르골 두 음 + 트라이앵글
    'combo_milestone': {'n': 3, 'var': lambda v: dict(layers=arp([['G2', 'C2'], ['D#2', 'G#3'], ['F2', 'A#2']][v], 70, len_=0.3, tau=0.12) + [
        L(B([1687, 1689, 1687][v]), len=0.35, g=-6, hp=2000, tau=0.14, dly=70),
    ])},
    # 임팩트 프레임 — 아주 무거운 펀치 + 가까운 폭발 짧게 + 유리 '짝'
    'impact_frame': {'n': 3, 'var': lambda v: dict(layers=[
        L(KI(f'impactPunch_heavy_00{v}.ogg'), len=0.25, g=0, hp=35, tau=0.1),
        L(B([1807, 1808, 1806][v]), len=0.3, g=-3, hp=40, lp=4000, tau=0.1, clip=4),
        L(B([1121, 1122, 1121][v]), len=0.1, g=-10, hp=3000, tau=0.03),
    ], eq=[('ls', 70, 2.0, 0.7)], sat=(2.4, 0.35))},
    # 각성 홀드 (누르고 있는 동안) — 거꾸로 차오르는 심벌 + 낮게 끌어올리는 징
    'awaken_hold': {'n': 3, 'var': lambda v: dict(layers=[
        L(B([2311, 2315, 2320][v]), len=0.55, g=0, rev=True, hp=700, tau=0),
        L(B([1483, 1484, 1485][v]), len=0.55, g=-4, st=-10, rev=True, hp=60, lp=1500, tau=0),
    ])},
    # 각성 차지 — 먼 폭발의 낮은 몸통 + 거꾸로 심벌 + 풍경
    'awaken_charge': {'n': 3, 'var': lambda v: dict(layers=[
        L(B(1023), len=0.9, g=0, st=[-4, -6, -3][v], lp=1200, hp=30, tau=0.35, hold=0.05),
        L(B([2315, 2311, 2315][v]), len=0.4, g=-4, rev=True, hp=1000, tau=0),
        L(B(CHIME[v + 5]), len=0.6, g=-10, st=-2, hp=1500, tau=0.25, dly=60),
    ])},
    # 컷인 휙 — 굵은 휙 + 깃발
    'cutin_whoosh': {'n': 3, 'var': lambda v: dict(layers=[
        L(B([1798, 1801, 573][v]), at=[0, 0, 2.48][v], al='pk', pre=0.08, len=0.28, g=0, st=[0, 1, -1][v], hp=250, tau=0.09, hold=0.06),
        L(B([1787, 1789, 1788][v]), al='pk', pre=0.04, len=0.2, g=-7, st=3, hp=400, tau=0.07),
    ])},
    # 붓질 — 실제 붓이 종이를 쓸고 지나감
    'brush_stroke': {'n': 3, 'var': lambda v: dict(layers=[
        L(B(1961), at=[0.5, 8.3, 11.6][v], len=0.14, g=0, hp=1500, tau=0.05),
        L(B(1106), at=[1.0, 4.0, 7.0][v], len=0.12, g=-6, hp=1200, tau=0.04),
    ])},
    # 낙관 찍기 — 무거운 나무 '쿵' + 책 내려놓기 + 펀치
    'seal_stamp': {'n': 3, 'var': lambda v: dict(layers=[
        L(KI(f'impactWood_heavy_00{v}.ogg'), len=0.2, g=0, hp=60, tau=0.07),
        L(K(f'bookPlace{v + 1}.ogg'), len=0.15, g=-4, hp=200, tau=0.06),
        L(QP[v + 2], len=0.12, g=-9, st=-5, lp=400, tau=0.05),
    ])},
    # 눈빛 번쩍 — 높은 유리 '팅' + 트라이앵글 + 풍경
    'eye_glint': {'n': 3, 'var': lambda v: dict(layers=[
        L(B(GLASS[[4, 1, 3][v]]), len=0.4, g=0, st=7, hp=3000, tau=0.15),
        L(B([1689, 1687, 1689][v]), len=0.4, g=-5, st=5, hp=3000, tau=0.15, dly=15),
        L(B(CHIME[v]), len=0.4, g=-10, st=5, hp=3000, tau=0.15),
    ])},
    # 각성 스팅어 — 0.4 초 동안 거꾸로 차오르는 심벌 → 0.4 초에 북 + 징 + 배음 노래 (lead 0.4)
    'awaken_stinger': {'n': 3, 'var': lambda v: dict(layers=[
        L(B([2311, 2315, 2311][v]), len=0.4, g=-2, rev=True, hp=700, tau=0),
        L(B([2338, 2341, 2338][v]), len=0.6, g=0, st=-3, hp=30, tau=0.25, dly=400),
        L(B([1485, 1484, 1485][v]), len=1.0, g=-3, st=[-5, -7, -4][v], hp=60, tau=0.45, dly=400),
        L(B(3033), at=[2.0, 6.0, 10.0][v], len=1.0, g=-8, st=[0, -2, 2][v], hp=150, tau=0.45, hold=0.2, dly=400),
    ], sat=(1.8, 0.25))},
    # 각성 폭발 — 가까운 폭발 + 몸통 + 천둥 + 낮은 징
    'awaken_boom': {'n': 3, 'var': lambda v: dict(layers=[
        L(B([1808, 1807, 1806][v]), len=1.0, g=0, hp=30, tau=0.4, clip=4),
        L(B(2454), at=0.30, al='pk', win=1.2, len=0.9, g=-3, st=-12, lp=170, tau=0.35, hold=0.03),
        L(B([3113, 3114, 2718][v]), at=[0.98, 0.6, 0.5][v], al='pk', len=1.3, g=-6, st=-3, lp=2500, hp=35, tau=0.5, dly=40),
        L(B(1483), len=1.4, g=-9, st=-12, lp=900, tau=0.6, dly=30),
    ], eq=[('ls', 70, 2.0, 0.7)], sat=(2.6, 0.4))},
    # 심장 박동 — 실제 심장 두 번 '쿵쿵'
    'heartbeat': {'n': 3, 'var': lambda v: dict(layers=[
        L(B([243, 244, 243][v]), len=0.25, g=0, st=[0, 1, -1][v], lp=500, tau=0.08),
        L(B([244, 243, 244][v]), len=0.25, g=-3, st=[-1, 0, -2][v], lp=450, tau=0.08, dly=170),
    ], eq=[('ls', 70, 3.0, 0.7)])},
    # 까마귀 — 실제 까마귀 울음
    'crow_caw': {'n': 3, 'var': lambda v: dict(layers=[
        L(B([956, 754, 754][v]), at=[0.04, 3.0, 12.0][v], al='pk', pre=0.05, win=2.5, len=0.6, g=0, hp=400, tau=0.25, hold=0.15),
    ])},
    # 손가락 튕기기 — 실제 손가락 '딱'
    'finger_snap': {'n': 3, 'var': lambda v: dict(layers=[
        L(B(483), at=[1.116, 2.276, 3.356][v], len=0.12, g=0, hp=800, tau=0.04),
        L(B(GLASS[v]), len=0.25, g=-14, st=5, hp=3000, tau=0.1, dly=5),
    ])},
    # 탄창 돌리기 — 라쳇이 '드르륵' 돌다가 '철컥' 잠김
    'cylinder_spin': {'n': 3, 'var': lambda v: dict(layers=[
        L(B(794), at=[2.26, 1.29, 3.17][v], len=0.45, g=0, st=-2, hp=700, tau=0.25, hold=0.2),
        L(B([1984, 1985, 1984][v]), at=[1.45, 0.3, 0.1][v], al='pk', len=0.12, g=-3, hp=900, tau=0.04, dly=430),
    ], sat=(4.0, 0.6)), 'cmax': 10, 'lmax': 9},
    # 성가 (문) — 배음 노래(사람 목소리 화음) + 싱잉볼 + 풍경
    'choir_gate': {'n': 3, 'var': lambda v: dict(layers=[
        L(B(3033), at=[2.0, 6.0, 10.0][v], len=1.5, g=0, st=[2, 0, 4][v], hp=150, tau=0.6, hold=0.4),
        L(B(3033), at=[4.0, 8.0, 12.0][v], len=1.4, g=-3, st=[9, 7, 11][v], hp=250, tau=0.55, hold=0.35, dly=30),
        L(B(1109), at=2.0, len=1.4, g=-7, st=[0, -2, 2][v], hp=200, tau=0.6, hold=0.3),
        L(B(CHIME[v + 1]), len=0.9, g=-10, hp=1500, tau=0.35, dly=80),
    ])},
    # 전쟁 뿔피리 — 실제 뿔피리를 낮게 + 큰 북
    'war_horn': {'n': 3, 'var': lambda v: dict(layers=[
        L(B([2522, 2523, 2526][v]), at=[0.07, 0.1, 0.996][v], len=1.3, g=0, st=[-7, -9, -5][v], hp=60, lp=3500, tau=0.5, hold=0.6),
        L(B([2341, 2338, 2341][v]), len=0.6, g=-6, st=-3, hp=30, tau=0.25),
    ], sat=(1.6, 0.2))},
    # 칼집 넣기 — 칼날이 미끄러져 들어가는 '스릉' + 손잡이 딸깍
    'sheath': {'n': 3, 'var': lambda v: dict(layers=[
        L(B([2574, 2576, 2578][v]), al='pk', pre=0.1, len=0.3, g=0, st=-2, hp=1200, tau=0.12, hold=0.05),
        L(K(['metalLatch.ogg', 'metalClick.ogg', 'beltHandle1.ogg'][v]), len=0.12, g=-5, hp=500, tau=0.05, dly=230),
    ])},

    # ═════════════ 동료·탈것 (src/core/audio_companions.js) ═════════════
    # 소환 — 거꾸로 차오르는 바람 + 싱잉볼 + 풍경
    'summon': {'n': 3, 'var': lambda v: dict(layers=[
        L(B(573), at=[2.48, 9.39, 4.70][v] - 0.1, al='pk', pre=0.2, len=0.4, g=-2, st=-3, rev=True, hp=300, tau=0),
        L(B(1110), len=0.7, g=0, st=[5, 3, 7][v], hp=250, tau=0.3, dly=360),
        L(B(CHIME[v + 2]), len=0.6, g=-6, hp=1500, tau=0.25, dly=370),
    ])},
    # 해제 — 빠지는 바람 + 내려가는 풍경
    'dismiss': {'n': 3, 'var': lambda v: dict(layers=[
        L(B(573), at=[8.18, 3.57, 1.35][v] - 0.05, al='pk', pre=0.1, len=0.45, g=0, st=-5, hp=300, tau=0.18, hold=0.06),
        L(B(CHIME[v + 4]), len=0.5, g=-6, st=-7, hp=1200, tau=0.2, dly=30),
    ])},
    # 탑승 — 가죽 안장 + 옷 + 말 콧김
    'mount_up': {'n': 3, 'var': lambda v: dict(layers=[
        L(K(['handleSmallLeather.ogg', 'handleSmallLeather2.ogg', 'dropLeather.ogg'][v]), len=0.25, g=0, hp=150, tau=0.1),
        L(K(f'cloth{v + 1}.ogg'), al='pk', len=0.15, g=-4, hp=300, tau=0.06),
        L(B([285, 286, 1543][v]), len=0.45, g=-6, hp=200, tau=0.18, dly=150),
    ])},
    # 말 울음 — 실제 말 울음
    'neigh': {'n': 3, 'var': lambda v: dict(layers=[
        L(B([460, 863, 1541][v]), len=1.2, g=0, st=[0, -1, 1][v], hp=150, tau=0.45, hold=0.6),
    ])},
    # 말 착지 — 발굽 둘이 땅에 + 몸무게
    'hoof_land': {'n': 3, 'var': lambda v: dict(layers=[
        L(B(611), at=[0.29, 1.22, 1.77][v], len=0.12, g=0, hp=80, tau=0.05),
        L(B(611), at=[2.42, 0.29, 1.22][v], len=0.12, g=-2, hp=80, tau=0.05, dly=55),
        L(B([1835, 1836, 1837][v]), at=[0.9, 0.32, 0.45][v], len=0.2, g=-3, hp=45, lp=3000, tau=0.08),
    ], eq=[('ls', 90, 2.0, 0.7)])},
    # 멧돼지 그르렁 — 실제 돼지 꿀꿀을 낮게
    'boar_grunt': {'n': 3, 'var': lambda v: dict(layers=[
        L(B([1658, 1659, 1658][v]), at=[0.06, 0.56, 0.6][v], len=0.45, g=0, st=[-4, -5, -3][v], hp=60, tau=0.18, hold=0.15),
    ])},
    # 늑대 울음 — 길게 우는 개('노래하는 개')를 낮게 + 숨결
    'wolf_howl': {'n': 3, 'var': lambda v: dict(layers=[
        L(B([2450, 2451, 2450][v]), len=1.5, g=0, st=[-3, -4, -5][v], hp=150, tau=0.6, hold=0.8),
        L(B(747), at=[0.26, 1.784, 2.564][v], len=0.6, g=-14, hp=1500, tau=0.3, dly=200),
    ])},
    # 늑대 물기 — 짧은 으르렁 + 살 + 이빨 '딱'
    'wolf_bite': {'n': 3, 'var': lambda v: dict(layers=[
        L(B([1885, 1887, 1060][v]), at=[0.06, 0.2, 0.31][v], al='pk', len=0.25, g=0, st=-3, hp=150, tau=0.1),
        L(MEAT[v % 2], len=0.12, g=-5, st=-3, lp=2500, tau=0.05, dly=60),
        L(B([1408, 1409, 1408][v]), al='pk', len=0.07, g=-9, st=6, hp=1500, tau=0.025, dly=60),
    ])},
    # 작은 포효 (새끼 용·짐승) — 고양잇과 포효를 조금 낮게
    'roar_small': {'n': 3, 'var': lambda v: dict(layers=[
        L(B([1881, 1882, 1883][v]), len=0.7, g=0, st=[-5, -4, -6][v], hp=100, tau=0.28, hold=0.25),
        L(B(486), at=[3.96, 5.69, 0.03][v], al='pk', pre=0.1, win=1.2, len=0.5, g=-8, st=-2, hp=80, tau=0.2),
    ])},
    # 불 뿜기 — 휘발유 불꽃 '화르륵' + 큰 불 + 휙
    'fire_breath': {'n': 3, 'var': lambda v: dict(layers=[
        L(B(1340), at=[0.03, 2.0, 4.0][v], len=0.7, g=0, hp=80, tau=0.3, hold=0.2),
        L(RD(f'spell_fire_0{[1, 3, 5][v]}.ogg'), len=0.5, g=-4, hp=100, tau=0.2),
        L(B(WHOOSH[v + 3]), al='pk', pre=0.05, len=0.25, g=-8, st=-3, hp=200, tau=0.08),
    ])},
    # 날카로운 울음 (와이번·박쥐 탈것) — 새 비명 + 박쥐 울음 낮게
    'screech': {'n': 3, 'var': lambda v: dict(layers=[
        L(B(1762), at=[0.0, 0.3, 0.6][v], al='pk', pre=0.05, win=1.0, len=0.55, g=0, st=[-3, -5, -2][v], hp=400, tau=0.22, hold=0.15),
        L(B(458), at=[0.24, 0.97, 1.80][v], len=0.1, g=-6, st=-18, hp=500, tau=0.04, dly=40),
    ])},
    # 뼈 달그락 — 뼈 부딪힘 + 나무 조각
    'bone_rattle': {'n': 3, 'var': lambda v: dict(layers=[
        L(B([1408, 1409, 596][v]), at=[0, 0, 18.7][v], al='pk', len=0.15, g=0, st=4, hp=700, tau=0.06),
        L(RD(f'item_wood_0{v + 1}.ogg'), len=0.2, g=-3, st=6, hp=900, tau=0.08, dly=60),
        L(KI(f'impactWood_light_00{v + 1}.ogg'), len=0.12, g=-7, st=4, hp=800, tau=0.04, dly=130),
    ])},
    # 요정 방울 — 오르골 두 음 + 풍경
    'fairy_chime': {'n': 3, 'var': lambda v: dict(layers=arp([['G2', 'C2'], ['D#2', 'G#3'], ['C2', 'G2']][v], 90, len_=0.5, tau=0.22) + [
        L(B(BUTTERFLY[v]), len=0.6, g=-5, st=3, hp=2000, tau=0.25, dly=40),
    ])},
    # 기사 방패막이 — 방패에 쇠가 '텅' + 맑은 울림
    'knight_guard': {'n': 3, 'var': lambda v: dict(layers=[
        L(KI(f'impactPlate_heavy_00{v}.ogg'), len=0.3, g=0, hp=80, tau=0.12),
        L(MED + 'Mace Norse Sword Blade.wav', at=[3.59, 0.5, 1.6][v], len=0.4, g=-4, hp=400, tau=0.16),
        L(B(GLASS[v + 2]), len=0.35, g=-12, st=-9, hp=1500, tau=0.14),
    ])},
    # 임프 낄낄 — 미친 웃음을 높게
    'imp_cackle': {'n': 3, 'var': lambda v: dict(layers=[
        L(B([2092, 2093, 2095][v]), at=[0.22, 0.12, 0.16][v], len=0.75, g=0, st=[5, 6, 4][v], hp=300, tau=0.3, hold=0.4),
    ])},
    # 부엉이 — 실제 올빼미 울음
    'owl_hoot': {'n': 3, 'var': lambda v: dict(layers=[
        L(B([1763, 1764, 1763][v]), at=[0.2, 0.14, 5.24][v], len=1.0, g=0, hp=200, tau=0.4, hold=0.5),
    ])},
    # 톱니 윙윙 — 태엽 감는 소리 + 라쳇
    'gear_whir': {'n': 3, 'var': lambda v: dict(layers=[
        L(B([1674, 1675, 2664][v]), at=[4.46, 0.9, 1.676][v], len=0.5, g=0, hp=500, tau=0.25, hold=0.2),
        L(B(794), at=[1.29, 2.26, 3.17][v], len=0.3, g=-6, st=-3, hp=700, tau=0.12),
    ])},
    # 낫 휘두르기 — 긴 휙 + 칼날 + 낮은 쇠 울림
    'scythe': {'n': 3, 'var': lambda v: dict(layers=[
        L(B(572), at=[6.50, 7.50, 8.51][v] - 0.1, al='pk', pre=0.1, len=0.35, g=0, st=-3, hp=300, tau=0.12, hold=0.06),
        L(RD(f'blade_0{v + 1}.ogg'), al='pk', len=0.2, g=-6, hp=1500, tau=0.08, dly=60),
        L(B(GLASS[v]), len=0.4, g=-14, st=-10, hp=1000, tau=0.16, dly=60),
    ])},
    # 영혼 거두기 — 유령 신음 + 거꾸로 바람 + 낮은 징 + 풍경
    'soul_reap': {'n': 3, 'var': lambda v: dict(layers=[
        L(B([2049, 2050, 2046][v]), at=[1.0, 1.5, 0.5][v], al='pk', pre=0.2, win=2.0, len=0.8, g=0, st=3, hp=200, tau=0.3, hold=0.15),
        L(B(573), at=2.38, al='pk', pre=0.2, len=0.4, g=-6, st=-4, rev=True, hp=300, tau=0),
        L(B(1483), len=0.9, g=-8, st=-8, lp=1200, tau=0.35, dly=380),
        L(B(CHIME[v + 1]), len=0.6, g=-10, st=-3, hp=1500, tau=0.25, dly=380),
    ])},
    # 알 깨짐 — 껍질이 '빠직' (유리 장식·생당근) + 작은 나무
    'egg_crack': {'n': 3, 'var': lambda v: dict(layers=[
        L(B([1598, 1599, 1600][v]), al='pk', len=0.15, g=0, st=4, hp=600, tau=0.05),
        L(B([1121, 1122, 1121][v]), len=0.2, g=-6, st=-3, hp=1500, tau=0.07, dly=60),
        L(KI(f'impactWood_light_00{v + 2}.ogg'), len=0.1, g=-9, st=5, hp=900, tau=0.04, dly=130),
    ])},
    # 동료 합류 — 오르골 화음 + 싱잉볼 + 풍경 (조금 길게)
    'companion_join': {'n': 3, 'var': lambda v: dict(layers=arp([['C', 'D#', 'G', 'C2'], ['G#', 'C', 'D#', 'G#2'], ['D#', 'G', 'A#', 'D#2']][v], 110, len_=0.7, tau=0.32) + [
        L(B(1110), len=1.1, g=-4, st=[0, -4, 3][v], hp=200, tau=0.5, dly=330),
        L(B(CHIME[v + 3]), len=0.8, g=-7, hp=1500, tau=0.35, dly=330),
    ])},
    # 유대 상승 — 오르골 두 음 상행 + 잔
    'bond_up': {'n': 3, 'var': lambda v: dict(layers=arp([['C', 'G'], ['D#', 'A#'], ['G#', 'D#2']][v], 100, len_=0.5, tau=0.22) + [
        L(B(GLASS[v + 1]), len=0.35, g=-8, st=4, hp=2500, tau=0.14, dly=100),
    ])},
    # 낙마 — 몸이 떨어짐 + 옷 + 말 콧김
    'knock_off': {'n': 3, 'var': lambda v: dict(layers=[
        L(B(FALL[v + 1][0]), at=FALL[v + 1][1], al='pk', win=1.2, len=0.4, g=0, hp=40, lp=2500, tau=0.15),
        L(K(f'cloth{v + 2}.ogg'), al='pk', len=0.15, g=-5, hp=300, tau=0.06),
        L(B([285, 1543, 286][v]), len=0.4, g=-8, hp=200, tau=0.16, dly=200),
    ])},
    # 협공 — 짧은 휙 + 가벼운 펀치 + 작은 '팅'
    'assist': {'n': 3, 'var': lambda v: dict(layers=[
        L(B(WHOOSH[v + 2]), al='pk', pre=0.04, len=0.15, g=0, st=2, hp=600, tau=0.05),
        L(KI(f'impactPunch_medium_00{v + 1}.ogg'), len=0.12, g=-2, hp=80, tau=0.04, dly=60),
        L(B(GLASS[v]), len=0.25, g=-13, st=3, hp=2500, tau=0.1, dly=60),
    ])},
    # 사슴 울음 — 뿔피리를 아주 낮게 + 돼지 그르렁 (사슴 발정 울음 같은 낮은 포효)
    'stag_call': {'n': 3, 'var': lambda v: dict(layers=[
        L(B(2526), at=[0.18, 0.996, 1.888][v], len=0.6, g=0, st=[-10, -11, -9][v], hp=80, lp=3000, tau=0.25, hold=0.3),
        L(B([1659, 1658, 1659][v]), at=[0.96, 1.33, 4.05][v], len=0.7, g=-4, st=-6, hp=60, tau=0.3, hold=0.3),
    ])},
    # 그리핀 울음 — 새 비명 + 고양잇과 포효
    'griffin_cry': {'n': 3, 'var': lambda v: dict(layers=[
        L(B(1762), at=[0.0, 0.3, 0.6][v], al='pk', pre=0.05, win=1.0, len=0.7, g=0, st=[-1, -2, 0][v], hp=500, tau=0.28, hold=0.2),
        L(B([1883, 1884, 1882][v]), len=0.6, g=-5, st=-4, hp=120, tau=0.25, dly=40),
    ])},
    # 거울 방울 — 맑은 잔 두 번 + 풍경 + 거울 반짝
    'mirror_chime': {'n': 3, 'var': lambda v: dict(layers=[
        L(B(GLASS[v]), len=0.5, g=0, st=2, hp=2000, tau=0.2),
        L(B(GLASS[v + 2]), len=0.5, g=-3, st=7, hp=2000, tau=0.2, dly=90),
        L(B(CHIME[v + 5]), len=0.6, g=-6, hp=1500, tau=0.25, dly=40),
    ])},
    # 젤리 전기 — 지지직 + 끈적한 몸
    'jelly_zap': {'n': 3, 'var': lambda v: dict(layers=[
        L(B(2134), len=0.3, g=0, st=[0, 2, -2][v], hp=500, tau=0.12),
        L(B(952), at=[5.33, 7.96, 0.2][v], len=0.25, g=-4, hp=800, tau=0.1),
        L(RD(f'creature_slime_0{v + 1}.ogg'), len=0.3, g=-5, hp=150, tau=0.12, dly=20),
    ])},
    # 모모 꿀꺽 — 입소리 + 꿀꺽
    'momo_gulp': {'n': 3, 'var': lambda v: dict(layers=[
        L(B([1652, 3177, 3176][v]), at=[0.06, 0.0, 0.0][v], len=0.3, g=0, st=[3, 0, 2][v], hp=150, tau=0.12),
        L(B([1707, 1708, 1709][v]), len=0.18, g=-4, st=[4, 5, 6][v], hp=200, tau=0.07, dly=110),
    ])},
}

# 드문 소리 (미니게임·대장간·연출 징글·동료 울음·영웅별 각성 연출) — index 에 lazy:1 → 게임은 핵심 소리를 먼저 풀고 이것들은 잠시 뒤 나눠 푼다
# (휴대폰·저사양 묶음은 24 kHz 로 풀어 메모리를 아낀다 — src/core/audio.js V2Bank)
LAZY = set('''dice card slot_spin slot_win win lose ready go coin_insert enhance_hit enhance_success enhance_fail enhance_destroy
save secret extra_life death boss_die boss_roar warning bell door chest clock_tick
crow_caw finger_snap cylinder_spin choir_gate war_horn sheath heartbeat eye_glint seal_stamp brush_stroke cutin_whoosh
awaken_hold awaken_charge awaken_stinger awaken_boom
summon dismiss mount_up neigh hoof_land boar_grunt wolf_howl wolf_bite roar_small fire_breath screech bone_rattle fairy_chime
knight_guard imp_cackle owl_hoot gear_whir scythe soul_reap egg_crack companion_join bond_up knock_off assist stag_call griffin_cry
mirror_chime jelly_zap momo_gulp'''.split())
# 용량 (이 묶음의 APK 예산 +1.0 MB 안 — /tmp/claude-0/g9/motionsfx.md): 자주 울리는 소리는 서로 다른 녹음 3~4벌 · 56 kbps · 44.1 kHz,
# 드문 소리는 녹음 1벌 · 40 kbps · 32 kHz 에 index 'vr'(재생 속도 변형 3개: 원래·−약 1반음·+약 1반음)로 '변형 3개'를 만든다 (같은 소리 연타 방지는 그대로).
VR = [1.0, 0.95, 1.055]
# 드물게 울리는 긴 소리 (발동·연출·획득) — 한 벌만 싣고 재생 속도로 변형 (용량)
ONE = set('ult stopwatch heal powerup mist charge_ready kill_slowmo announce rank_up combo_milestone'.split())
for _n, _r in R3.items():
    if _n in LAZY:
        _r['lazy'] = 1
        _r['n'] = 1
        _r['vr'] = VR
        _r.setdefault('rate', 32000)
        _r.setdefault('br', '40k')
    else:
        _r.setdefault('br', '56k')
        if _n in ONE:
            _r['n'] = 1; _r['vr'] = VR
assert LAZY <= set(R3), LAZY - set(R3)
