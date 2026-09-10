#!/usr/bin/env python3
"""Generate missing museum artwork with the Codex CLI's image_gen tool.

Each pending artwork in art-direction/prompts.json (no usable entry in
art-direction/generated-sources.json) runs as one hard-timed `codex exec`.
Outputs land in output/artwork/generated/<word>.png. Rerunning resumes:
existing files are skipped. Shard the batch across processes with --shard i/n.

    python3 scripts/generate-artwork.py --limit 1          # smoke test
    python3 scripts/generate-artwork.py --shard 0/2 &      # two workers
    python3 scripts/generate-artwork.py --shard 1/2 &
    python3 scripts/generate-artwork.py --record           # update generated-sources.json
"""
import argparse
import json
import shutil
import struct
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROMPTS = ROOT / 'art-direction/prompts.json'
SOURCES = ROOT / 'art-direction/generated-sources.json'
OUT = ROOT / 'output/artwork/generated'
REQUEST = """Generate ONE original artwork image using your image_gen.imagegen tool, and write the PNG to exactly:
{path}

{prompt}

HARD RULES:
- Use image_gen.imagegen (real bitmap image generation) ONLY, at the largest supported square size.
- NEVER use Python, PIL/Pillow, matplotlib, ImageMagick, SVG, canvas, or any code/plotting to fabricate, stub, or approximate the image. A code-drawn or placeholder image is a FAILURE.
- If you cannot generate a real image, do nothing and reply exactly: FAILED <reason>.
- After writing the PNG, reply exactly: DONE {path}
"""


def png_size(path: Path):
    header = path.read_bytes()[:24]
    if header[:8] != b'\x89PNG\r\n\x1a\n':
        return None
    return struct.unpack('>II', header[16:24])


def usable(path: Path):
    return path.is_file() and path.stat().st_size > 0 and (png_size(path) or (0, 0))[0] >= 1024


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--limit', type=int)
    ap.add_argument('--timeout', type=int, default=300)
    ap.add_argument('--model', default='gpt-5.6-sol', help='Codex model that this CLI version supports')
    ap.add_argument('--shard', default='0/1')
    ap.add_argument('--words', help='comma-separated words to generate first, ignoring sharding')
    ap.add_argument('--record', action='store_true', help='write generated paths into generated-sources.json and exit')
    args = ap.parse_args()
    artworks = json.loads(PROMPTS.read_text())['artworks']
    sources = json.loads(SOURCES.read_text()) if SOURCES.exists() else {}
    OUT.mkdir(parents=True, exist_ok=True)
    if args.record:
        for art in artworks:
            path = OUT / f"{art['word']}.png"
            if usable(path):
                sources[art['word']] = str(path)
        SOURCES.write_text(json.dumps(sources, ensure_ascii=False, indent=2) + '\n')
        missing = [a['word'] for a in artworks if not Path(sources.get(a['word'], '/nonexistent')).is_file()]
        print(f'Recorded {len(sources)} sources; missing {len(missing)}: {missing}')
        return 0 if not missing else 1
    index, count = map(int, args.shard.split('/'))
    pending = [a for a in artworks if not Path(sources.get(a['word'], '/nonexistent')).is_file() and not usable(OUT / f"{a['word']}.png")]
    if args.words:
        wanted = set(args.words.split(','))
        pending = [a for a in pending if a['word'] in wanted]
    else:
        pending = [a for i, a in enumerate(pending) if i % count == index]
    pending = pending[: args.limit]
    if not pending:
        print('Nothing to generate.')
        return 0
    timeout = ['gtimeout', '--kill-after=10', str(args.timeout)] if shutil.which('gtimeout') else ['perl', '-e', 'alarm shift; exec @ARGV', str(args.timeout)]
    failed = []
    for i, art in enumerate(pending, 1):
        path = OUT / f"{art['word']}.png"
        print(f"[{args.shard} {i}/{len(pending)}] {art['word']}", flush=True)
        proc = subprocess.run(timeout + ['codex', 'exec', '-m', args.model, '--cd', str(ROOT), '--sandbox', 'workspace-write', REQUEST.format(path=path, prompt=art['prompt'])], capture_output=True, text=True, stdin=subprocess.DEVNULL)
        if usable(path):
            print(f"    ok {png_size(path)}", flush=True)
        else:
            failed.append(art['word'])
            print(f"    FAILED rc={proc.returncode} {(proc.stdout or '')[-300:].strip()} {(proc.stderr or '')[-200:].strip()}", flush=True)
    print(f'Done: {len(pending) - len(failed)}/{len(pending)} generated. Failed: {failed}')
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
