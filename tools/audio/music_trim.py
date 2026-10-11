#!/usr/bin/env python3
"""배경 음악 크기 맞춤 표 (다시 인코딩하지 않음) — assets/audio/music/index.json 의 tracks[id].trim (dB) 을 쓴다.

  python3 tools/audio/music_trim.py [--from st.json] [--dry]

  곡들은 이미 통합 라우드니스(I)가 -16.1 LUFS 로 맞춰져 있지만, 조용한 도입·끝이 긴 곡은 '몸통'이 그만큼 더 크게 들린다.
  그래서 3초 단기 라우드니스(S, ffmpeg ebur128)의 중앙값 S50 이 모든 곡에서 같게: trim = I − S50 (±3 dB 로 자름, 0.1 dB 단위).
  audio_rec.js: gain = 10^((REF_LUFS − lufs + trim)/20) — 볼륨 슬라이더(musicG)와 덕킹은 그 뒤에 곱해지므로 그대로.
"""
import argparse, json, re, statistics, subprocess
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MUS = ROOT / 'assets/audio/music'


def measure(item):
    k, t = item
    r = subprocess.run(['ffmpeg', '-nostats', '-i', str(MUS / t['file']), '-af', 'ebur128', '-f', 'null', '-'], capture_output=True, text=True)
    S = sorted(float(m) for m in re.findall(r' S:\s*(-?[\d.]+)', r.stderr) if float(m) > -60)
    I = re.findall(r'I:\s*(-?[\d.]+) LUFS', r.stderr)
    return k, {'I': float(I[-1]), 'S50': statistics.median(S)}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--from', dest='src', default=None, help='이미 잰 값 (JSON {id:{I, S50}})')
    ap.add_argument('--dry', action='store_true')
    a = ap.parse_args()
    p = MUS / 'index.json'
    ix = json.loads(p.read_text(encoding='utf-8'))
    if a.src:
        st = json.loads(Path(a.src).read_text())
    else:
        with ThreadPoolExecutor(3) as ex:
            st = dict(ex.map(measure, ix['tracks'].items()))
    for k, t in ix['tracks'].items():
        m = st.get(k)
        if not m:
            continue
        trim = round(max(-3.0, min(3.0, m['I'] - m['S50'])), 1)
        print(f'{k:10s} I {m["I"]:6.1f}  S50 {m["S50"]:6.1f}  trim {trim:+.1f} dB')
        if trim:
            t['trim'] = trim
        else:
            t.pop('trim', None)
    if not a.dry:
        p.write_text(json.dumps(ix, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
