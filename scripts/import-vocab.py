"""Build a self-contained exhibition from Handy 990's existing flashcards.

Usage: python3 scripts/import-vocab.py [path/to/handy-toeic]
The source repository is only read, never changed.
"""
import json
import shutil
import subprocess
import sys
from pathlib import Path

SOURCE = Path(sys.argv[1]).expanduser() if len(sys.argv) > 1 else Path.home() / 'handy-toeic'
ROOT = Path(__file__).resolve().parent.parent
DATA = SOURCE / 'data/supplemental/vocabulary'

def read(path):
    return json.loads(path.read_text())

def import_audio(source, filename):
    destination = ROOT / 'public/audio' / filename
    destination.parent.mkdir(parents=True, exist_ok=True)
    if source.exists() and shutil.which('ffmpeg'):
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', str(source), '-c:a', 'aac', '-b:a', '96k', str(destination)], check=True)
        return f'audio/{filename}'
    return None

ROOMS = [
    {'id': 'wonders', 'name': 'Everyday Wonders', 'subtitle': 'Find the extraordinary in the ordinary.', 'color': '#54756a', 'words': ['serene', 'flourish', 'nurture', 'curiosity', 'delicate', 'abundant']},
    {'id': 'world', 'name': 'Out in the World', 'subtitle': 'A new perspective is just a word away.', 'color': '#59768b', 'words': ['journey', 'wander', 'destination', 'landscape', 'horizon', 'habitat']},
    {'id': 'ideas', 'name': 'Ideas at Work', 'subtitle': 'Small ideas. Remarkable possibilities.', 'color': '#ad7355', 'words': ['inspire', 'collaboration', 'innovation', 'ambition', 'craft', 'sustainable']},
]

catalog = read(DATA / 'catalog.json')['questions']
lexicon = read(DATA / 'lexicon.json')['entries']
collocations = read(DATA / 'collocations.json')['entries']
stickers = set(read(SOURCE / 'assets/vocab_stickers/index.json'))
art_catalog_path = ROOT / 'art-direction/catalog.json'
art_catalog = read(art_catalog_path) if art_catalog_path.exists() else {}
exhibits = []
for room_index, room in enumerate(ROOMS):
    for slot, word in enumerate(room.pop('words')):
        q = next(q for q in catalog if q['answer'] == word and q['id'] in stickers)
        entry = lexicon[word]
        primary = entry.get('primary_sense', 0)
        sense = entry['senses'][primary]
        image = SOURCE / 'assets/vocab_stickers' / f"{q['id']}.webp"
        target = ROOT / 'public/artwork' / f'{word}.webp'
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(image, target)
        slug = ''.join(c for c in word.lower() if c.isascii() and c.isalnum())
        audio_source = SOURCE / 'assets/listening/audio_src' / f'vw_{slug}_us.opus'
        audio = import_audio(audio_source, f'{word}.m4a')
        display_senses = [sense] + [s for i, s in enumerate(entry['senses']) if i != primary]
        example_audio = import_audio(SOURCE / 'assets/listening/audio_src' / f"ve_{q['id']}_0_us.opus", f'{word}-example-0.m4a')
        for display_index, display_sense in enumerate(display_senses):
            if display_index > 0 and display_sense.get('example'):
                display_sense['audio'] = import_audio(SOURCE / 'assets/listening/audio_src' / f"ve_{q['id']}_{display_index}_us.opus", f'{word}-example-{display_index}.m4a')
        collocation_sense = next((s for s in collocations.get(word, {}).get('senses', []) if s['sense_index'] == primary), {})
        exhibits.append({
            'id': q['id'], 'word': word, 'room': room_index, 'slot': slot,
            'ipa': entry.get('ipa', ''), 'kk': entry.get('kk', ''),
            'pos': sense['pos'], 'definition': sense['gloss'],
            'example': q['display_sentence'], 'translations': sense.get('translations', {}),
            'definitionTranslations': sense.get('definition_translations', {}),
            'exampleTranslations': {locale: t['sentence'] for locale, t in q.get('translations', {}).items() if 'sentence' in t},
            'synonyms': sense.get('synonyms', []), 'level': q.get('difficulty_level', q.get('source_level')),
            'senses': display_senses,
            'collocations': collocation_sense.get('phrases', []),
            'image': art_catalog.get(word, {}).get('image', f'artwork/{word}.webp'),
            'originalImage': f'artwork/{word}.webp',
            **({'artwork': art_catalog[word]} if word in art_catalog else {}),
            'audio': audio, 'exampleAudio': example_audio,
        })

output = {'source': 'Handy 990', 'catalogCount': len(catalog), 'rooms': ROOMS, 'exhibits': exhibits}
(ROOT / 'src/collection.json').write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n')
print(f'Imported {len(exhibits)} exhibitions, with original stickers and {sum(bool(e["audio"]) for e in exhibits)} pronunciation recordings.')
