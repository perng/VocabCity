#!/usr/bin/env python3
"""Draft art direction (title, Chinese title, scene subject) for words that lack a prompt.

Each batch of words is handed to the Codex CLI, which writes JSON to
output/artwork/authoring/codex-<n>.json. Rerunning resumes: batches whose JSON
already validates are skipped. The subjects are reviewed before they become prompts.

    python3 scripts/author-artwork.py --limit 1        # smoke test one batch
    python3 scripts/author-artwork.py --shard 0/3 &     # three parallel drivers
"""
import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path.home() / 'handy-toeic'
OUT = ROOT / 'output/artwork/authoring'
BATCH = 40
BRIEF = """You write art direction for original paintings in a walkable 3D vocabulary city. Each painting expresses ONE English vocabulary word so a learner recognises the meaning at a glance.

For every word in the batch, produce:
- "title": an evocative English painting title, 2–5 words, not the word itself.
- "titleZh": a natural Traditional Chinese (Taiwan) title, 2–6 characters.
- "subject": 25–45 words describing ONE concrete, specific scene that makes the word's primary meaning (the given gloss) visually recognisable. Name the setting, the key objects, the light and the moment. Use the example sentence only as inspiration.

Rules: no writing, letters, numbers, signs, logos or labels in the scene; no named artists or brands; no gore, weapons aimed at people, nudity or frightening imagery; difficult words are shown gently and symbolically. Vary settings, times of day, and human/non-human subjects across the batch. Write in the style of these approved examples:
- export: "Wooden crates and steel containers being hoisted onto a cargo ship at a harbour in golden evening light, cranes silhouetted against the sky, goods bound for another country."
- inspect: "A woman with a magnifying glass closely examining the mechanism of a wooden clock on a workbench, tools and a lamp beside her, intent concentration."
- transform: "A caterpillar, a chrysalis and a butterfly on one branch beside a potter's wheel where a lump of clay is becoming a vase."
"""
REQUEST = """{brief}
Read the batch file {batch_path} (a JSON array of objects with word, pos, gloss and example).
Write a JSON file to exactly {out_path} with this shape and nothing else:
{{"words": [{{"word": "...", "title": "...", "titleZh": "...", "subject": "..."}}, ...]}}
Include every word from the batch exactly once, same spelling. Do not modify any other file. Reply with only: DONE
"""


def valid(path: Path, words: list[str]) -> bool:
    try:
        data = json.loads(path.read_text())
    except Exception:
        return False
    got = {w.get('word'): w for w in data.get('words', []) if isinstance(w, dict)}
    return all(w in got and all(isinstance(got[w].get(k), str) and got[w][k].strip() for k in ('title', 'titleZh', 'subject')) for w in words)


def pending_words():
    prompts = {a['word'] for a in json.loads((ROOT / 'art-direction/prompts.json').read_text())['artworks']}
    authored = set()
    for path in OUT.glob('codex-*.json'):
        try:
            authored.update(w['word'] for w in json.loads(path.read_text())['words'])
        except Exception:
            pass
    catalog = json.loads((SOURCE / 'data/supplemental/vocabulary/catalog.json').read_text())['questions']
    lexicon = json.loads((SOURCE / 'data/supplemental/vocabulary/lexicon.json').read_text())['entries']
    level, example = {}, {}
    for q in catalog:
        l = q.get('difficulty_level', q.get('source_level'))
        if l is None:
            continue
        if q['answer'] not in level or l > level[q['answer']]:
            level[q['answer']] = l
            example[q['answer']] = q['display_sentence']
    words = []
    for word in sorted(level):
        if level[word] <= 30 or word in prompts or word in authored:
            continue
        entry = lexicon[word]
        sense = entry['senses'][entry.get('primary_sense', 0)]
        words.append({'word': word, 'pos': sense['pos'], 'gloss': sense['gloss'], 'example': example[word]})
    return words


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--limit', type=int)
    ap.add_argument('--shard', default='0/1')
    ap.add_argument('--timeout', type=int, default=600)
    ap.add_argument('--model', default='gpt-5.6-sol')
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    words = pending_words()
    batches = [words[i:i + BATCH] for i in range(0, len(words), BATCH)]
    index, count = map(int, args.shard.split('/'))
    existing = sorted(int(p.stem.split('-')[1]) for p in OUT.glob('codex-*.json'))
    next_number = (existing[-1] + 1) if existing else 0
    jobs = [(next_number + i, batch) for i, batch in enumerate(batches) if i % count == index][: args.limit]
    if not jobs:
        print('Nothing to author.')
        return 0
    timeout = ['gtimeout', '--kill-after=10', str(args.timeout)] if shutil.which('gtimeout') else []
    failed = 0
    for number, batch in jobs:
        batch_path = OUT / f'batch-codex-{number}.json'
        out_path = OUT / f'codex-{number}.json'
        batch_path.write_text(json.dumps(batch, ensure_ascii=False, indent=1))
        print(f'[{args.shard}] batch {number}: {len(batch)} words ({batch[0]["word"]} … {batch[-1]["word"]})', flush=True)
        proc = subprocess.run(timeout + ['codex', 'exec', '-m', args.model, '--cd', str(ROOT), '--sandbox', 'workspace-write', REQUEST.format(brief=BRIEF, batch_path=batch_path, out_path=out_path)], capture_output=True, text=True, stdin=subprocess.DEVNULL)
        if valid(out_path, [w['word'] for w in batch]):
            print('    ok', flush=True)
        else:
            failed += 1
            out_path.unlink(missing_ok=True)
            print(f'    FAILED rc={proc.returncode} {(proc.stdout or "")[-300:].strip()}', flush=True)
    print(f'Done: {len(jobs) - failed}/{len(jobs)} batches authored.')
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
