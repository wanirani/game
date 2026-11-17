# UI-VERIFY lane: how much of the scene the v2 buttons hide. Reads the white / black captures of
#   node tools/v2/ui_verify_shots.mjs --only glass
# coverage of a pixel = 1 - (white capture - black capture) / 255  (0 = the scene shows through untouched, 1 = hidden)
import json, sys
from PIL import Image
out = sys.argv[1] if len(sys.argv) > 1 else '/tmp/claude-0/v2/uiverify'
info = json.load(open(out + '/shots_glass.json'))['glass']
res = {}
for dev, m in info.items():
    w = Image.open(f'{out}/glass_{dev}_white.png').convert('L'); b = Image.open(f'{out}/glass_{dev}_black.png').convert('L')
    k = w.width / m['w']; W, B = w.load(), b.load()
    tot = 0; over8 = 0; over50 = 0
    for y in range(0, w.height, 2):
        for x in range(0, w.width, 2):
            a = 1 - (W[x, y] - B[x, y]) / 255; tot += 1; over8 += a > 0.08; over50 += a > 0.5
    row = {'screen_over8pct': round(100 * over8 / tot, 1), 'screen_over50pct': round(100 * over50 / tot, 1), 'buttons': {}}
    for bt in m['buttons']:
        r = bt['d'] / 2 * k; cx = bt['cx'] * k; cy = bt['cy'] * k; vals = []
        for y in range(int(cy - r), int(cy + r), 2):
            for x in range(int(cx - r), int(cx + r), 2):
                if (x - cx) ** 2 + (y - cy) ** 2 <= (r * 0.94) ** 2 and 0 <= x < w.width and 0 <= y < w.height: vals.append(1 - (W[x, y] - B[x, y]) / 255)
        vals.sort(); n = len(vals)
        row['buttons'][bt['id']] = {'mean': round(100 * sum(vals) / n), 'clearest_quarter': round(100 * vals[n // 4]), 'median': round(100 * vals[n // 2])}
    res[dev] = row
json.dump(res, open(out + '/glass.json', 'w'), indent=1)
print(json.dumps(res))
