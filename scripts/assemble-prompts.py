#!/usr/bin/env python3
"""Turn reviewed Codex drafts (output/artwork/authoring/codex-*.json) into prompts.

Each townhouse is a series: its banner text names the series, and a medium is drawn
from the city's pool by house index. Words already in art-direction/prompts.json are
left untouched, so rerunning only appends what is new.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AUTHORING = ROOT / 'output/artwork/authoring'
TEMPLATE = '''Use case: stylized-concept.
Asset: one original high-resolution museum artwork expressing the vocabulary word "{word}".
Subject: {subject}
Style/medium: {style}
Composition: a complete square artwork, flat straight-on reproduction filling the entire image edge to edge, carefully composed and rich in details that reward close viewing. Render at the highest supported square resolution, at least 1024 pixels per side.
Constraints: only the artwork. No picture frame, gallery wall, writing, labels, typography, signatures, watermarks, logos, collage grids or sticker outlines. No named artist imitation. No clip art, children's flashcard aesthetic or plastic CGI. Keep the meaning visually recognizable.'''

prompts = json.loads((ROOT / 'art-direction/prompts.json').read_text())
have = {a['word'] for a in prompts['artworks']}
mediums = json.loads((AUTHORING / 'mediums.json').read_text())
collection = json.loads((ROOT / 'src/collection.json').read_text())
rooms = collection['rooms']
drafts = {}
for path in sorted(AUTHORING.glob('codex-*.json')):
    for entry in json.loads(path.read_text())['words']:
        drafts.setdefault(entry['word'], entry)
added, missing = 0, []
for exhibit in collection['exhibits']:
    word = exhibit['word']
    if word in have:
        continue
    draft = drafts.get(word)
    if not draft:
        missing.append(word)
        continue
    room = rooms[exhibit['room']]
    house = room.get('house')
    medium = mediums[exhibit['room'] % len(mediums)]
    series = house['display'] if house else room['name']
    series_zh = (house['translations'].get('zh_TW') if house else None) or series
    prompts['artworks'].append({
        'word': word, 'title': draft['title'].strip(), 'titleZh': draft['titleZh'].strip(),
        'series': series, 'seriesZh': series_zh, 'medium': medium['medium'], 'mediumZh': medium['mediumZh'], 'style': medium['style'],
        'prompt': TEMPLATE.format(word=word, subject=draft['subject'].strip(), style=medium['text']),
    })
    have.add(word)
    added += 1
prompts['version'] = prompts.get('version', 5) + (1 if added else 0)
(ROOT / 'art-direction/prompts.json').write_text(json.dumps(prompts, ensure_ascii=False, indent=2) + '\n')
print(f'Added {added} prompts ({len(prompts["artworks"])} total). Missing drafts for {len(missing)}: {missing[:10]}{"…" if len(missing) > 10 else ""}')
