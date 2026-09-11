"""Install the reviewed generated artwork without modifying the Handy 990 source."""
from concurrent.futures import ThreadPoolExecutor
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
conversions = []
for spec in direction:
    word = spec['word']
    if word not in sources:
        continue
    source = Path(sources[word])
    header = source.read_bytes()[:24]
    assert header[:8] == b'\x89PNG\r\n\x1a\n', f'{word}: expected PNG master'
    width, height = struct.unpack('>II', header[16:24])
    assert min(width, height) >= 1024, f'{word}: insufficient native resolution'
    if not (masters / f'{word}.png').exists() or (masters / f'{word}.png').stat().st_mtime < source.stat().st_mtime:
        shutil.copy2(source, masters / f'{word}.png')
    target = web / f'{word}.webp'
    if not target.exists() or target.stat().st_mtime < source.stat().st_mtime:
        conversions.append((source, target))
    catalog[word] = {k: spec[k] for k in ['title', 'titleZh', 'series', 'seriesZh', 'medium', 'mediumZh', 'style']}
    if spec.get('mural'):
        catalog[word]['mural'] = True
    catalog[word].update(image=f'artwork/museum-v1/{word}.webp', width=width, height=height, provenance='AI-generated with the built-in image_gen tool')
# Format conversion only: retain native pixel dimensions and the PNG master. Only changed masters are converted.
def convert(pair):
    result = subprocess.run(['cwebp', '-quiet', '-q', '92', '-m', '6', str(pair[0]), '-o', str(pair[1])], capture_output=True, text=True)
    return pair[0].stem if result.returncode else None
with ThreadPoolExecutor(max_workers=8) as pool:
    broken = [word for word in pool.map(convert, conversions) if word]
for word in broken:
    # A truncated master keeps its sticker until it is generated again.
    catalog.pop(word, None)
    (web / f'{word}.webp').unlink(missing_ok=True)
for exhibit in collection['exhibits']:
    art = catalog.get(exhibit['word'])
    if not art:
        continue
    exhibit['image'] = art['image']
    exhibit['artwork'] = art
(ROOT / 'art-direction/catalog.json').write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n')
collection_path.write_text(json.dumps(collection, ensure_ascii=False, indent=2) + '\n')
print(f'Installed {len(catalog)} native-resolution artworks ({len(conversions)} newly converted) and preserved their PNG masters.' + (f' Broken masters, regenerate: {broken}' if broken else '') + (f' Still missing {len(missing)}: {missing[:12]}{"…" if len(missing) > 12 else ""}' if missing else ''))
