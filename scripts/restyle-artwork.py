#!/usr/bin/env python3
"""Reassign diverse media to a set of installed artworks so they are painted again.

Default selection: every landmark work (rooms 0-14) plus ten from the first two
root houses, one hundred in all. Styles come from art-direction/styles.json and
rotate so each room mixes media; mural styles (painted straight on a wall) go
only to rooms with real outdoor walls. Old masters move to output/artwork/retired
and their generated-sources entries are dropped, so generate-artwork.py redoes them.

    python3 scripts/restyle-artwork.py            # prints the words to regenerate
    python3 scripts/restyle-artwork.py --dry-run
"""
import argparse
import json
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROMPTS = ROOT / 'art-direction/prompts.json'
SOURCES = ROOT / 'art-direction/generated-sources.json'
GENERATED = ROOT / 'output/artwork/generated'
RETIRED = ROOT / 'output/artwork/retired'
OUTDOOR_WALL_ROOMS = {0, 1, 3, 7, 8, 11}  # gate square, quay, both arcades, inn courtyard, belvedere
MURAL_SLOTS = {1, 4}
TEMPLATE = '''Use case: stylized-concept.
Asset: one original high-resolution artwork expressing the vocabulary word "{word}".
Subject: {subject}
Style/medium: {style} Render the subject entirely in this medium, ignoring any other medium named in the subject.
Composition: {composition}
Constraints: {constraints}'''
FRAMED = dict(
    composition='a complete square artwork, flat straight-on reproduction filling the entire image edge to edge, carefully composed and rich in details that reward close viewing. Render at the highest supported square resolution, at least 1024 pixels per side.',
    constraints="only the artwork. No picture frame, gallery wall, writing, labels, typography, signatures, watermarks, logos or sticker outlines. No named artist imitation. No clip art, children's flashcard aesthetic or plastic CGI. Keep the meaning visually recognizable.",
)
MURAL = dict(
    composition='a straight-on square view of the painted wall itself, the mural filling the image edge to edge with the wall texture as its ground. Render at the highest supported square resolution, at least 1024 pixels per side.',
    constraints="only the painted wall. No picture frame, no street, ground, sky or passers-by, no lettering, tags, words, typography, signatures, watermarks or logos of any kind. No named artist imitation. No clip art or plastic CGI. Keep the meaning visually recognizable.",
)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--words', help='comma-separated words instead of the default selection')
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args()
    prompts = json.loads(PROMPTS.read_text())
    sources = json.loads(SOURCES.read_text())
    styles = json.loads((ROOT / 'art-direction/styles.json').read_text())['styles']
    framed = [s for s in styles if not s.get('mural')]
    murals = [s for s in styles if s.get('mural')]
    exhibits = json.loads((ROOT / 'src/collection.json').read_text())['exhibits']
    if args.words:
        wanted = args.words.split(',')
        chosen = [e for e in exhibits if e['word'] in wanted]
    else:
        chosen = [e for e in exhibits if e['room'] < 15]
        chosen += [e for e in exhibits if e['room'] == 15][:6] + [e for e in exhibits if e['room'] == 16][:4]
    by_word = {a['word']: a for a in prompts['artworks']}
    slot = {}
    framed_i = mural_i = 0
    for e in chosen:
        art = by_word[e['word']]
        position = slot[e['room']] = slot.get(e['room'], -1) + 1
        if e['room'] in OUTDOOR_WALL_ROOMS and position in MURAL_SLOTS:
            style = murals[mural_i % len(murals)]; mural_i += 1
        else:
            style = framed[framed_i % len(framed)]; framed_i += 1
        subject = re.search(r'Subject: (.*?)\nStyle/medium:', art['prompt'], re.S).group(1).strip()
        art.update(medium=style['medium'], mediumZh=style['mediumZh'], style=style['style'])
        art.pop('mural', None)
        if style.get('mural'):
            art['mural'] = True
        art['prompt'] = TEMPLATE.format(word=e['word'], subject=subject, style=style['text'], **(MURAL if style.get('mural') else FRAMED))
        print(f"{e['room']:>3} {e['word']:<16} {style['medium']}{' (mural)' if style.get('mural') else ''}")
    if args.dry_run:
        return
    RETIRED.mkdir(parents=True, exist_ok=True)
    for e in chosen:
        sources.pop(e['word'], None)
        old = GENERATED / f"{e['word']}.png"
        if old.exists():
            shutil.move(old, RETIRED / f"{e['word']}-v1.png")
    prompts['version'] = prompts.get('version', 5) + 1
    PROMPTS.write_text(json.dumps(prompts, ensure_ascii=False, indent=2) + '\n')
    SOURCES.write_text(json.dumps(sources, ensure_ascii=False, indent=2) + '\n')
    print(f"Restyled {len(chosen)} works. Regenerate with: --words {','.join(e['word'] for e in chosen)}")


if __name__ == '__main__':
    main()
