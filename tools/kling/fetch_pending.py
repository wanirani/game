#!/usr/bin/env python3
"""클링 생성 이미지 다운로드 + 게임용 가공 (네트워크가 *.klingai.com 을 허용하는 세션에서 실행).
tools/kling/pending.json (+ pending_new.json) 의 각 항목을 받아:
  bg       → assets/bg/<id>.webp       높이 1080, WebP q80
  portrait → assets/portraits/<id>.webp 영웅 높이 1200 / NPC·보스 1024, WebP q82
  tex      → assets/tex/<id>.webp      512x512 심리스 타일, WebP q82
결과를 tools/kling/manifest.json 에 병합. 이미 있는 파일은 --force 없으면 건너뜀.
사용: python3 tools/kling/fetch_pending.py [--force]
"""
import json, os, subprocess, sys, time
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, HERE)
from seamless_lib import make_seamless, edge_seam_score, tiled_preview  # noqa: E402

RAW = '/tmp/kling_raw'
HEROES = {'kael', 'sera', 'victor', 'bran', 'lia', 'azel'}
OUT = {'bg': 'assets/bg', 'portrait': 'assets/portraits', 'tex': 'assets/tex'}

def load_jobs():
    jobs = {}
    for f in ('pending.json', 'pending_new.json'):
        p = os.path.join(HERE, f)
        if os.path.exists(p):
            jobs.update(json.load(open(p)))
    return jobs

def download(url, dst):
    for i in range(5):
        r = subprocess.run(['curl', '-sS', '-L', '--fail', '--max-time', '180', '-o', dst + '.part', url])
        if r.returncode == 0 and os.path.getsize(dst + '.part') > 1000:
            os.replace(dst + '.part', dst); return True
        time.sleep(2 * (i + 1))
    return False

def process(aid, j, raw, dst):
    im = Image.open(raw).convert('RGB')
    g = j['group']
    if g == 'tex':
        s = min(im.size); l, t = (im.width - s) // 2, (im.height - s) // 2
        im = im.crop((l, t, l + s, t + s)).resize((512, 512), Image.LANCZOS)
        out = make_seamless(im)
        out.save(dst, 'WEBP', quality=82, method=6)
        os.makedirs('/tmp/kling_preview', exist_ok=True)
        tiled_preview(Image.open(dst).convert('RGB')).save(f'/tmp/kling_preview/{aid}_2x2.png')
        return
    h = 1080 if g == 'bg' else (1200 if aid in HEROES else 1024)
    w = round(im.width * h / im.height)
    im.resize((w, h), Image.LANCZOS).save(dst, 'WEBP', quality=80 if g == 'bg' else 82, method=6)

def main():
    force = '--force' in sys.argv
    os.makedirs(RAW, exist_ok=True)
    jobs = load_jobs()
    man_p = os.path.join(HERE, 'manifest.json')
    man = json.load(open(man_p)) if os.path.exists(man_p) else {}
    ok, fail = [], []
    for aid, j in jobs.items():
        d = os.path.join(REPO, OUT[j['group']]); os.makedirs(d, exist_ok=True)
        dst = os.path.join(d, aid + '.webp')
        if os.path.exists(dst) and not force: ok.append(aid); continue
        raw = os.path.join(RAW, aid + '.png')
        if not os.path.exists(raw) and not download(j['url'], raw):
            fail.append(aid); print('FAIL download', aid); continue
        try:
            process(aid, j, raw, dst)
            Image.open(dst).load()
            man[aid] = {'group': j['group'], 'aspect_ratio': j.get('ar'), 'generationId': j.get('gid'), 'model': 'kling-image-v3_0_omni', 'prompt': j.get('prompt'), 'file': os.path.relpath(dst, REPO)}
            ok.append(aid); print('ok', aid, os.path.getsize(dst) // 1024, 'KB')
        except Exception as e:
            fail.append(aid); print('FAIL process', aid, e)
    tmp = man_p + '.tmp'; json.dump(man, open(tmp, 'w'), ensure_ascii=False, indent=1); os.replace(tmp, man_p)
    print(f'\n완료 {len(ok)} / 실패 {len(fail)}: {fail}')
    sys.exit(1 if fail else 0)

if __name__ == '__main__':
    main()
