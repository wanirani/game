#!/usr/bin/env python3
"""채색 크리처 한 번에 빌드: 매트(캐시) → 부품 자르기·아틀라스·manifest → 부품 시트 [→ 게임 포즈 갤러리].

사용:
  python3 tools/painted/build.py <id> [--force] [--poses] [--vector] [--mobile]
    --force  : 매트를 다시 계산 (원본을 바꿨거나 matte 설정을 바꿨을 때)
    --poses  : 빌드 후 node tools/painted/poses.mjs <id> 로 실제 게임 포즈 시트까지 (poses/<id>.mjs 필요)
    --vector : 포즈 갤러리를 기존 벡터 그림으로도 찍어 나란히 비교 (--poses 와 함께)
    --mobile : 포즈 갤러리를 844×390 모바일로도
결과: <out>/atlas.webp + manifest.json (게임이 읽는 파일), .work/<id>/parts_sheet.png, /tmp/claude-0/painted/poses_<id>/sheet_*.jpg
전체 흐름과 설정 형식: docs/art/BOSS_PIPELINE.md
"""
import os, sys, subprocess, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from matte import load_config, matte, sources_used, ROOT  # noqa: E402
import build_parts  # noqa: E402


def main(argv):
    args = [a for a in argv if not a.startswith('--')]
    if not args:
        print(__doc__); return 1
    pid = args[0]
    force = '--force' in argv
    cfg = load_config(pid)
    t0 = time.time()
    print(f'[1/3] matte ({pid})')
    for n in sources_used(cfg):
        matte(cfg, n, force)
    print('[2/3] parts → atlas + manifest')
    man = build_parts.build(pid)
    print('[3/3] parts sheet')
    subprocess.run([sys.executable, os.path.join(os.path.dirname(__file__), 'sheet.py'), pid], check=True)
    groups = {k: len(v) for k, v in man.get('groups', {}).items()}
    print(f'done in {time.time() - t0:.1f}s — {len(man["parts"])} parts, groups {groups}, td {man["td"]}')
    if '--poses' in argv:
        base = ['node', os.path.join(ROOT, 'tools', 'painted', 'poses.mjs'), pid]
        subprocess.run(base, check=True, cwd=ROOT)
        if '--vector' in argv: subprocess.run(base + ['--vector'], check=True, cwd=ROOT)
        if '--mobile' in argv: subprocess.run(base + ['--mobile'], check=True, cwd=ROOT)
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
