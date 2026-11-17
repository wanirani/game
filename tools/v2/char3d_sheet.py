# v2 char3d: tools/v2/char3d_evidence.mjs 가 오려 낸 cmp_<자리>_<2d|3d>.png 를 2D | 입체 쌍으로 이어 붙인다.
#   python3 tools/v2/char3d_sheet.py <ev 폴더> <out.jpg> <자리,자리,…> <열 수> <칸 크기 px>
import sys
from PIL import Image, ImageDraw, ImageFont
src, out, names, cols, cell = sys.argv[1], sys.argv[2], sys.argv[3].split(','), int(sys.argv[4]), int(sys.argv[5])
try: font = ImageFont.truetype('/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc', 19)
except Exception: font = ImageFont.load_default()
LAB = {'street_idle':'거리 · 서 있기','street_run_right':'거리 · 오른쪽으로 달리기','street_run_left':'거리 · 왼쪽으로 달리기','alley_into_screen':'골목 · 화면 안쪽으로','alley_toward_camera':'골목 · 카메라 쪽으로','alley_diagonal':'골목 · 대각선','jump':'점프','dash':'대시','attack1':'공격 1타','attack3':'공격 3타 (찌르기)','yard_fight':'마당 전투','hurt':'피격'}
rows = (len(names) + cols - 1) // cols
W = cols * (cell * 2 + 12) ; H = rows * (cell + 34)
sh = Image.new('RGB', (W, H), (14, 16, 22)); d = ImageDraw.Draw(sh)
for i, n in enumerate(names):
    x0 = (i % cols) * (cell * 2 + 12); y0 = (i // cols) * (cell + 34)
    for k, m in enumerate(['2d', '3d']):
        im = Image.open(f'{src}/cmp_{n}_{m}.png').convert('RGB').resize((cell, cell), Image.LANCZOS)
        sh.paste(im, (x0 + k * (cell + 2), y0 + 30))
    try: d.text((x0 + 6, y0 + 4), f"{LAB.get(n, n)}   (왼쪽 2D 퍼펫 · 오른쪽 입체)", fill=(255, 233, 176), font=font)
    except Exception: d.text((x0 + 6, y0 + 4), n, fill=(255, 233, 176))
sh.save(out, quality=88)
print(sh.size)
