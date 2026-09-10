"""Install the reviewed generated artwork without modifying the Handy 990 source."""
import json
import shutil
import struct
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sources = json.loads((ROOT / 'art-direction/generated-sources.json').read_text())
direction = json.loads((ROOT / 'art-direction/prompts.json').read_text())['artworks']
collection_path = ROOT / 'src/collection.json'
collection = json.loads(collection_path.read_text())
# Artwork is installed as it becomes available; words without a recorded source keep their sticker.
missing = sorted({e['word'] for e in collection['exhibits']} - sources.keys())
masters = ROOT / 'output/artwork/masters'
web = ROOT / 'public/artwork/museum-v1'
masters.mkdir(parents=True, exist_ok=True)
web.mkdir(parents=True, exist_ok=True)
catalog = {}
for spec in direction:
    word = spec['word']
    if word not in sources:
        continue
    source = Path(sources[word])
    header = source.read_bytes()[:24]
    assert header[:8] == b'\x89PNG\r\n\x1a\n', f'{word}: expected PNG master'
    width, height = struct.unpack('>II', header[16:24])
    assert min(width, height) >= 1024, f'{word}: insufficient native resolution'
    shutil.copy2(source, masters / f'{word}.png')
    # Format conversion only: retain native pixel dimensions and the PNG master.
    subprocess.run(['cwebp', '-quiet', '-q', '92', '-m', '6', str(source), '-o', str(web / f'{word}.webp')], check=True)
    catalog[word] = {k: spec[k] for k in ['title', 'titleZh', 'series', 'seriesZh', 'medium', 'mediumZh', 'style']}
    catalog[word].update(image=f'artwork/museum-v1/{word}.webp', width=width, height=height, provenance='AI-generated with the built-in image_gen tool')
for exhibit in collection['exhibits']:
    art = catalog.get(exhibit['word'])
    if not art:
        continue
    exhibit['image'] = art['image']
    exhibit['artwork'] = art
(ROOT / 'art-direction/catalog.json').write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n')
collection_path.write_text(json.dumps(collection, ensure_ascii=False, indent=2) + '\n')
print(f'Installed {len(catalog)} native-resolution artworks and preserved their PNG masters.' + (f' Still missing {len(missing)}: {missing[:12]}{"…" if len(missing) > 12 else ""}' if missing else ''))
