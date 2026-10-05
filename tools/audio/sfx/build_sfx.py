#!/usr/bin/env python3
"""녹음 효과음 묶음 만들기 — Kenney CC0 팩에서 고른 샘플을 다듬어 assets/audio/sfx/ 에 쓴다 (audio.js 의 샘플 레이어용).

  python3 tools/audio/sfx/build_sfx.py --src /tmp/claude-0/audio_rt [--out assets/audio/sfx] [--keep-gains]

  --src : Kenney 팩을 푼 폴더 (impact-sounds/ rpg-audio/ interface-sounds/ sci-fi-sounds/, 각자 Audio/ 와 License.txt)
          받기: https://kenney.nl/assets/{impact-sounds,rpg-audio,interface-sounds,sci-fi-sounds} (CC0 1.0)
  하는 일: 파일마다 ffmpeg 로 모노 → 앞뒤 무음 자르기 → 끝 8 ms 페이드 → 피크 -1 dBFS → 44.1 kHz
           → .m4a (AAC-LC 80 kbps) + .ogg (Vorbis q4) 두 형식 (헤드리스 Chromium·일부 리눅스 브라우저는 AAC 를 풀지 못하고,
           옛 사파리는 Vorbis 를 풀지 못한다 → audio.js 가 canPlayType 으로 고르고, 풀기에 실패하면 다른 형식을 시도한다).
           index.json = { version, rate, formats, core:[먼저 받을 이름], sfx:{이름:{f:[파일 id], g, s, r?}}, files:{id:{dur, on, m4a, ogg}} }
             g = 샘플 음량 (호출 vol 에 곱한다), s = 합성음 몫 (0 = 샘플만, 0.6 = 합성음을 0.6배로 겹침), r = 재생 속도 배율
           g 는 tools/audio/sfx/calibrate.mjs 가 엔진 렌더로 맞춘다 (--keep-gains 면 기존 index.json 의 g 를 유지).
           라이선스 사본: assets/audio/sfx/LICENSE-kenney.txt
"""
import argparse
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[3]
RATE = 44100

# 이름 → (파일 [팩/이름], 합성음 몫 s, 재생 속도 r). s=0 이면 샘플이 합성음을 대신한다.
MAP = {
    # ── 타격 ──
    'hit': (['impact-sounds/impactPunch_medium_000', 'impact-sounds/impactPunch_medium_001', 'impact-sounds/impactPunch_medium_002'], 0.6, 1),
    'hit_heavy': (['impact-sounds/impactPunch_heavy_000', 'impact-sounds/impactPunch_heavy_001', 'impact-sounds/impactPunch_heavy_002'], 0.6, 1),
    'crit': (['impact-sounds/impactPunch_heavy_003'], 0.75, 1),
    'hit_flesh': (['impact-sounds/impactSoft_heavy_000', 'impact-sounds/impactSoft_heavy_001'], 0.5, 1),
    'hit_bone': (['impact-sounds/impactWood_light_000', 'impact-sounds/impactWood_light_001'], 0.5, 1),
    'hit_stone': (['impact-sounds/impactMining_000', 'impact-sounds/impactMining_001'], 0.5, 1),
    'clang': (['impact-sounds/impactMetal_heavy_000', 'impact-sounds/impactMetal_heavy_001'], 0.5, 1),
    'counter': (['impact-sounds/impactMetal_medium_000'], 0.7, 1),
    'enhance_hit': (['impact-sounds/impactMetal_heavy_002'], 0.6, 1),
    'enemy_die': (['impact-sounds/impactSoft_heavy_002'], 0.7, 1),
    'hurt': (['impact-sounds/impactPunch_medium_003'], 0.7, 1),
    'wall_bounce': (['impact-sounds/impactPlank_medium_000'], 0.6, 1),
    'ground_bounce': (['impact-sounds/impactSoft_heavy_003'], 0.6, 1),
    'land': (['impact-sounds/impactSoft_medium_000', 'impact-sounds/impactSoft_medium_001'], 0.5, 1),
    'land_heavy': (['impact-sounds/impactSoft_heavy_004'], 0.6, 1),
    'explode': (['sci-fi-sounds/explosionCrunch_000', 'sci-fi-sounds/explosionCrunch_001'], 0.6, 1),
    'break_wall': (['impact-sounds/impactMining_002', 'impact-sounds/impactMining_003'], 0.6, 1),
    'boss_die': (['sci-fi-sounds/lowFrequency_explosion_000'], 0.8, 1),
    'ult_impact': (['sci-fi-sounds/lowFrequency_explosion_001'], 0.7, 1),
    'candle': (['impact-sounds/impactGlass_light_000', 'impact-sounds/impactGlass_light_001'], 0.5, 1),
    'bell': (['impact-sounds/impactBell_heavy_000'], 0.7, 1),
    'seal_stamp': (['impact-sounds/impactPlate_heavy_000'], 0.6, 1),
    # ── 무기 ──
    'slash': (['rpg-audio/knifeSlice', 'rpg-audio/knifeSlice2'], 0.5, 1),
    'slash_heavy': (['rpg-audio/knifeSlice', 'rpg-audio/knifeSlice2'], 0.6, 0.8),
    'dagger': (['rpg-audio/drawKnife1', 'rpg-audio/drawKnife2'], 0.5, 1),
    'sheath': (['rpg-audio/drawKnife3'], 0.4, 1),
    'axe': (['rpg-audio/chop'], 0.6, 1),
    # ── 이동 (발소리는 샘플만) ──
    'footstep': (['rpg-audio/footstep00', 'rpg-audio/footstep01', 'rpg-audio/footstep02'], 0, 1),
    'step_stone': (['impact-sounds/footstep_concrete_000', 'impact-sounds/footstep_concrete_001', 'impact-sounds/footstep_concrete_002'], 0, 1),
    'step_dirt': (['impact-sounds/footstep_grass_000', 'impact-sounds/footstep_grass_001', 'impact-sounds/footstep_grass_002'], 0, 1),
    'step_wood': (['impact-sounds/footstep_wood_000', 'impact-sounds/footstep_wood_001', 'impact-sounds/footstep_wood_002'], 0, 1),
    'step_snow': (['impact-sounds/footstep_snow_000', 'impact-sounds/footstep_snow_001', 'impact-sounds/footstep_snow_002'], 0, 1),
    'jump': (['rpg-audio/cloth1'], 0.7, 1),
    'double_jump': (['rpg-audio/cloth2'], 0.7, 1.1),
    'dash': (['rpg-audio/cloth3', 'rpg-audio/cloth4'], 0.6, 1),
    # ── 획득·환경 ──
    'coin': (['rpg-audio/handleCoins'], 0.8, 1),
    'coin_insert': (['rpg-audio/handleCoins2'], 0.7, 1),
    'door': (['rpg-audio/doorOpen_1'], 0.3, 1),
    'chest': (['rpg-audio/creak1'], 0.8, 1),
    'heal': (['interface-sounds/glass_001'], 0.8, 1),
    'card': (['rpg-audio/bookFlip1', 'rpg-audio/bookFlip2', 'rpg-audio/bookFlip3'], 0, 1),
    'magic': (['sci-fi-sounds/forceField_000'], 0.7, 1),
    'clock_tick': (['interface-sounds/tick_004'], 0, 1),
    # ── 메뉴 ──
    'menu_move': (['interface-sounds/tick_001'], 0.5, 1),
    'menu_ok': (['interface-sounds/confirmation_001'], 0.4, 1),
    'menu_cancel': (['interface-sounds/back_001'], 0.4, 1),
}
# 첫 사용자 입력 뒤 곧바로 받을 묶음 (나머지는 처음 울릴 때 받고, 그동안은 합성음만)
CORE = ['hit', 'hit_heavy', 'crit', 'hit_flesh', 'hit_bone', 'hit_stone', 'clang', 'enemy_die', 'hurt', 'land', 'land_heavy',
        'slash', 'slash_heavy', 'dagger', 'axe', 'jump', 'double_jump', 'dash', 'step_stone', 'step_dirt', 'step_wood', 'step_snow', 'footstep',
        'coin', 'menu_move', 'menu_ok', 'menu_cancel', 'card', 'explode', 'candle']
PACKS = ['impact-sounds', 'rpg-audio', 'interface-sounds', 'sci-fi-sounds']


def run(cmd):
    r = subprocess.run(cmd, capture_output=True)
    if r.returncode != 0:
        sys.exit('ffmpeg 실패: ' + ' '.join(cmd) + '\n' + r.stderr.decode(errors='replace')[-600:])
    return r.stdout


def decode(path):
    """→ float32 모노 PCM (44.1 kHz)"""
    raw = run(['ffmpeg', '-v', 'error', '-i', str(path), '-ac', '1', '-ar', str(RATE), '-f', 'f32le', '-'])
    return np.frombuffer(raw, dtype=np.float32).copy()


def tidy(x):
    """앞뒤 무음 자르기 (-50 dBFS 아래), 앞 2 ms 여유, 끝 8 ms 페이드, 피크 -1 dBFS"""
    thr = 10 ** (-50 / 20) * max(1e-9, float(np.max(np.abs(x))))
    idx = np.nonzero(np.abs(x) > thr)[0]
    if not len(idx):
        return x[:1], 0.0
    a = max(0, int(idx[0]) - int(RATE * 0.002))
    b = min(len(x), int(idx[-1]) + int(RATE * 0.01))
    y = x[a:b].astype(np.float64)
    fade = min(len(y), int(RATE * 0.008))
    y[-fade:] *= np.linspace(1, 0, fade)
    pk = float(np.max(np.abs(y))) or 1.0
    y *= (10 ** (-1 / 20)) / pk
    on = float(np.argmax(np.abs(y) > 10 ** (-40 / 20))) / RATE  # 첫 소리까지(초) — 런타임이 디코더 지연(프라이밍)을 잴 때 기준
    return y.astype(np.float32), on


def encode(y, out_base):
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as t:
        wav = t.name
    try:
        p = subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(RATE), '-ac', '1', '-i', 'pipe:0', '-c:a', 'pcm_s16le', wav],
                           input=y.tobytes(), capture_output=True)
        if p.returncode != 0:
            sys.exit('wav 쓰기 실패: ' + p.stderr.decode(errors='replace')[-400:])
        run(['ffmpeg', '-v', 'error', '-y', '-i', wav, '-c:a', 'aac', '-b:a', '80k', '-movflags', '+faststart', '-map_metadata', '-1', str(out_base) + '.m4a'])
        run(['ffmpeg', '-v', 'error', '-y', '-i', wav, '-c:a', 'libvorbis', '-q:a', '4', '-map_metadata', '-1', str(out_base) + '.ogg'])
    finally:
        os.unlink(wav)


def file_id(src):
    pack, name = src.split('/', 1)
    pre = {'impact-sounds': 'imp', 'rpg-audio': 'rpg', 'interface-sounds': 'ui', 'sci-fi-sounds': 'sf'}[pack]
    return f'{pre}_{name}'.replace('-', '_')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--src', default='/tmp/claude-0/audio_rt')
    ap.add_argument('--out', default=str(ROOT / 'assets/audio/sfx'))
    ap.add_argument('--keep-gains', action='store_true')
    a = ap.parse_args()
    src, out = Path(a.src), Path(a.out)
    for p in PACKS:
        lic = (src / p / 'License.txt')
        if not lic.is_file() or 'CC0' not in lic.read_text(encoding='utf-8', errors='replace'):
            sys.exit(f'{lic}: CC0 라이선스 파일이 없습니다')
    out.mkdir(parents=True, exist_ok=True)
    old = {}
    if a.keep_gains and (out / 'index.json').is_file():
        old = json.loads((out / 'index.json').read_text(encoding='utf-8')).get('sfx', {})
    files, sfx = {}, {}
    for name, (srcs, s, r) in MAP.items():
        ids = []
        for sp in srcs:
            fid = file_id(sp)
            ids.append(fid)
            if fid in files:
                continue
            y, on = tidy(decode(src / sp.split('/')[0] / 'Audio' / (sp.split('/')[1] + '.ogg')))
            encode(y, out / fid)
            files[fid] = {'dur': round(len(y) / RATE, 4), 'on': round(on, 4), 'm4a': (out / f'{fid}.m4a').stat().st_size,
                          'ogg': (out / f'{fid}.ogg').stat().st_size, 'src': f'kenney/{sp}.ogg'}
        e = {'f': ids, 'g': old.get(name, {}).get('g', 1.0), 's': s}
        if r != 1:
            e['r'] = r
        sfx[name] = e
    # 쓰지 않는 옛 파일 정리
    keep = {f'{fid}.{ext}' for fid in files for ext in ('m4a', 'ogg')} | {'index.json', 'LICENSE-kenney.txt'}
    for p in out.iterdir():
        if p.is_file() and p.name not in keep:
            p.unlink()
    lic = '\n\n'.join(f'── kenney.nl/assets/{p} ──\n' + (src / p / 'License.txt').read_text(encoding='utf-8', errors='replace').strip() for p in PACKS)
    (out / 'LICENSE-kenney.txt').write_text('블러드 녹턴 효과음 샘플 출처 — Kenney (www.kenney.nl), CC0 1.0 (퍼블릭 도메인). 원본 팩의 License.txt 사본:\n\n' + lic + '\n', encoding='utf-8')
    idx = {'version': 1, 'rate': RATE, 'formats': ['m4a', 'ogg'], 'core': [n for n in CORE if n in sfx], 'sfx': sfx, 'files': files}
    (out / 'index.json').write_text(json.dumps(idx, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    tot = {ext: sum(f[ext] for f in files.values()) for ext in ('m4a', 'ogg')}
    print(f'효과음 {len(sfx)}종 · 파일 {len(files)}개 · m4a {tot["m4a"] / 1024:.0f} KB · ogg {tot["ogg"] / 1024:.0f} KB → {out}')


if __name__ == '__main__':
    main()
