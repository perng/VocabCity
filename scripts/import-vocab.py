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
    if source.exists() and destination.exists() and destination.stat().st_mtime >= source.stat().st_mtime:
        return f'audio/{filename}'
    if source.exists() and shutil.which('ffmpeg'):
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', str(source), '-c:a', 'aac', '-b:a', '96k', str(destination)], check=True)
        return f'audio/{filename}'
    return None

ROOMS = [
    {'id': 'wonders', 'name': 'Everyday Wonders', 'subtitle': 'Find the extraordinary in the ordinary.', 'color': '#54756a', 'words': ['serene', 'flourish', 'nurture', 'curiosity', 'delicate', 'abundant']},
    {'id': 'world', 'name': 'Out in the World', 'subtitle': 'A new perspective is just a word away.', 'color': '#59768b', 'words': ['journey', 'wander', 'destination', 'landscape', 'horizon', 'habitat']},
    {'id': 'ideas', 'name': 'Ideas at Work', 'subtitle': 'Small ideas. Remarkable possibilities.', 'color': '#ad7355', 'words': ['inspire', 'collaboration', 'innovation', 'ambition', 'craft', 'sustainable']},
    {'id': 'earth', 'name': 'Rooted in Nature', 'subtitle': 'The living earth, in every season.', 'color': '#71875b', 'words': ['agriculture', 'cultivate', 'fertile', 'rural', 'fragrant', 'abundance']},
    {'id': 'connections', 'name': 'Living Connections', 'subtitle': 'A world held together by care.', 'color': '#54877c', 'words': ['ecosystem', 'ecology', 'conservation', 'preserve', 'restore', 'shelter']},
    {'id': 'perspective', 'name': 'Light & Perspective', 'subtitle': 'Make a little room for a new way of seeing.', 'color': '#7a7895', 'words': ['scenic', 'magnificent', 'spacious', 'fragile', 'radiant', 'reflection']},
    {'id': 'together', 'name': 'Better Together', 'subtitle': 'A shared world, made by many hands.', 'color': '#ac7a50', 'words': ['community', 'harmony', 'cooperate', 'gather', 'volunteer', 'contribution']},
    {'id': 'caring', 'name': 'The Art of Caring', 'subtitle': 'Small acts. Lasting warmth.', 'color': '#ae7b79', 'words': ['generous', 'gratitude', 'compassion', 'cherish', 'embrace', 'companion']},
    {'id': 'welcome', 'name': 'A Warm Welcome', 'subtitle': 'There is always a place for you.', 'color': '#ba8c59', 'words': ['welcome', 'hospitality', 'tradition', 'mentor', 'wisdom', 'encourage']},
    {'id': 'woodland', 'name': 'The Leafy Walk', 'subtitle': 'A little wonder beneath the leaves.', 'color': '#527b5c', 'words': ['wildlife', 'species', 'diversity', 'observe', 'encounter', 'environment']},
    {'id': 'palace', 'name': 'The Palace Gallery', 'subtitle': 'Art, light, and a little grandeur.', 'color': '#ac9066', 'words': ['thrive', 'adapt', 'vitality', 'growth', 'gradual', 'endurance']},
    {'id': 'street', 'name': 'A Street of Stories', 'subtitle': 'Take a stroll. Find a new perspective.', 'color': '#b07e6c', 'words': ['excursion', 'navigate', 'guide', 'remote', 'solitude', 'refuge']},
    {'id': 'market', 'name': 'The Discovery Market', 'subtitle': 'Wander the square. Collect a few words.', 'color': '#b28c50', 'words': ['mineral', 'texture', 'surface', 'formation', 'structure', 'durable']},
    {'id': 'cave', 'name': 'The Lantern Cave', 'subtitle': 'A little light changes what we see.', 'color': '#728b82', 'words': ['illuminate', 'emerge', 'mysterious', 'clarity', 'perceive', 'reveal']},
    {'id': 'waterfront', 'name': 'The Waterfront Terrace', 'subtitle': 'A breath of sea air. A wider horizon.', 'color': '#6c999e', 'words': ['tunnel', 'exploration', 'discover', 'insight', 'remarkable', 'majestic']},

]

# Root-family rooms fill the Root Quarter east of the garden: a north-south spine with
# covered walks branching east, twelve rooms per walk. Every reviewed root family from
# Handy 990's root workshop gets a room. The six starter lessons are transcribed from
# lib/vocab_root_lessons.dart; the other 87 come from docs/vocab-root-workshop-recipes.json.
STARTER_FAMILIES = [
    ('root_port', {
        'export': 'ex:prefix_ex|port:root_port', 'portable': 'port:root_port|able:suffix_able',
        'porter': 'port:root_port|er:suffix_er', 'report': 're:prefix_re|port:root_port',
        'support': 'sub:prefix_sub:sup|port:root_port', 'transportation': 'trans:prefix_trans|port:root_port|ation:suffix_tion'}),
    ('root_struct', {
        'structure': 'struct:root_struct|ure:suffix_ure', 'construct': 'con:prefix_con|struct:root_struct',
        'instruct': 'in:prefix_in_into|struct:root_struct', 'instructor': 'in:prefix_in_into|struct:root_struct|or:suffix_or',
        'destruction': 'de:prefix_de|struct:root_struct|ion:suffix_tion', 'infrastructure': 'infra:new_infra|struct:root_struct|ure:suffix_ure'}),
    ('root_spec', {
        'inspect': 'in:prefix_in_into|spect:root_spec', 'inspector': 'in:prefix_in_into|spect:root_spec|or:suffix_or',
        'spectator': 'spect:root_spec|ator:suffix_or', 'prospect': 'pro:prefix_pro|spect:root_spec', 'respect': 're:prefix_re|spect:root_spec'}),
    ('root_scrib', {
        'script': 'script:root_scrib', 'manuscript': 'manu:root_manu|script:root_scrib', 'describe': 'de:prefix_de|scribe:root_scrib',
        'prescribe': 'pre:prefix_pre|scribe:root_scrib', 'subscribe': 'sub:prefix_sub|scribe:root_scrib', 'transcript': 'trans:prefix_trans:tran|script:root_scrib'}),
    ('root_tract', {
        'attract': 'ad:prefix_ad:at|tract:root_tract', 'extract': 'ex:prefix_ex|tract:root_tract', 'distract': 'dis:prefix_dis|tract:root_tract',
        'contract': 'con:prefix_con|tract:root_tract', 'contractor': 'con:prefix_con|tract:root_tract|or:suffix_or'}),
    ('root_ject', {
        'inject': 'in:prefix_in_into|ject:root_ject', 'reject': 're:prefix_re|ject:root_ject',
        'project': 'pro:prefix_pro|ject:root_ject', 'projection': 'pro:prefix_pro|ject:root_ject|ion:suffix_tion'}),
]
NEW_MEANINGS = {'new_infra': {'en_US': 'below or beneath', 'zh_TW': '在...之下、底層', 'ja_JP': '下、下方', 'ko_KR': '아래, 밑', 'vi_VN': 'bên dưới', 'th_TH': 'ข้างล่างหรือใต้'}}
ROOT_SUBTITLES = {
    'port': ('Carry a word out, back, across.', '把單字帶出去、帶回來、帶過去。'),
    'struct': ('Every word here is built from build.', '這裡的每個單字，都從「建造」蓋起。'),
    'spect': ('Look in, look ahead, look again.', '看進去、看向前、再看一次。'),
    'scrib': ('Written words, from script to subscribe.', '從 script 到 subscribe，都是寫下來的字。'),
    'tract': ('Words that pull, draw, and attract.', '拉近、拖走、吸引：都是 tract。'),
    'ject': ('Words thrown in, back, and forward.', '丟進去、丟回去、往前丟。'),
    'rupt': ('Words that break in, out, and apart.', '闖入、爆發、打斷：都從「破」開始。'),
    'form': ('One shape, many forms.', '一個形狀，千變萬化。'),
}
ROOM_HUES = [205, 25, 250, 40, 95, 10, 210, 170]
LEVEL_MIN = 30  # every catalog word above this level gets a display
HOUSE_SIZE = 6


catalog = read(DATA / 'catalog.json')['questions']
lexicon = read(DATA / 'lexicon.json')['entries']
collocations = read(DATA / 'collocations.json')['entries']
morphemes = {m['id']: m for m in read(DATA / 'morphemes.json')['morphemes']}
recipes = read(SOURCE / 'docs/vocab-root-workshop-recipes.json')
NEW_MEANINGS.update(recipes['new_meanings'])
stickers = set(read(SOURCE / 'assets/vocab_stickers/index.json'))
art_catalog_path = ROOT / 'art-direction/catalog.json'
art_catalog = read(art_catalog_path) if art_catalog_path.exists() else {}

def piece_meaning(meaning_id):
    if meaning_id in morphemes:
        m = morphemes[meaning_id]
        return {'gloss': m['gloss'], 'translations': m['translations'], 'display': m['display']}
    meaning = NEW_MEANINGS[meaning_id]
    return {'gloss': meaning['en_US'], 'translations': {k: v for k, v in meaning.items() if k != 'en_US'}, 'display': None}

def family_entries():
    """Yield (root_id, [(word, pieces, root_index)]) for every root family, starters first."""
    lessons = [(root_id, [(word, [tuple(part.split(':')) for part in spec.split('|')]) for word, spec in words.items()]) for root_id, words in STARTER_FAMILIES]
    starters = {root_id for root_id, _ in STARTER_FAMILIES}
    for lesson in recipes['lessons']:
        if lesson['root_id'] in starters:
            continue
        lessons.append((lesson['root_id'], [(w['word'], [(p['surface'], p['meaning_id'], p.get('joined', p['surface'])) for p in w['pieces']]) for w in lesson['words']]))
    for root_id, entries in lessons:
        result = []
        for word, pieces in entries:
            pieces = [(surface, meaning_id, joined[0] if joined else surface) for surface, meaning_id, *joined in pieces]
            assert ''.join(joined for _, _, joined in pieces) == word, (word, pieces)
            root_index = next(i for i, (_, meaning_id, _) in enumerate(pieces) if meaning_id == root_id)
            result.append((word, [{'surface': surface, 'joined': joined, 'meaningId': meaning_id, **piece_meaning(meaning_id)} for surface, meaning_id, joined in pieces], root_index))
        yield root_id, result

def room_color(index):
    hue = ROOM_HUES[index % len(ROOM_HUES)] + (index // len(ROOM_HUES)) * 13
    import colorsys
    r, g, b = colorsys.hls_to_rgb((hue % 360) / 360, 0.46, 0.24)
    return '#%02x%02x%02x' % (round(r * 255), round(g * 255), round(b * 255))

def build_exhibit(word, room_index, slot):
    questions = [q for q in catalog if q['answer'] == word]
    q = next((q for q in questions if q['id'] in stickers), questions[0])
    entry = lexicon[word]
    primary = entry.get('primary_sense', 0)
    sense = entry['senses'][primary]
    image = SOURCE / 'assets/vocab_stickers' / f"{q['id']}.webp"
    target = ROOT / 'public/artwork' / f'{word}.webp'
    target.parent.mkdir(parents=True, exist_ok=True)
    if image.exists():
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
    return {
        'id': q['id'], 'word': word, 'room': room_index, 'slot': slot,
        'ipa': entry.get('ipa', ''), 'kk': entry.get('kk', ''),
        'pos': sense['pos'], 'definition': sense['gloss'],
        'example': q['display_sentence'], 'translations': sense.get('translations', {}),
        'definitionTranslations': sense.get('definition_translations', {}),
        'exampleTranslations': {locale: t['sentence'] for locale, t in q.get('translations', {}).items() if 'sentence' in t},
        'synonyms': sense.get('synonyms', []), 'level': q.get('difficulty_level', q.get('source_level')),
        'senses': display_senses,
        'collocations': collocation_sense.get('phrases', []),
        'image': art_catalog.get(word, {}).get('image', f'artwork/{word}.webp' if image.exists() else 'artwork/placeholder.webp'),
        **({'originalImage': f'artwork/{word}.webp'} if image.exists() else {}),
        **({'artwork': art_catalog[word]} if word in art_catalog else {}),
        'audio': audio, 'exampleAudio': example_audio,
    }

exhibits = []
for room_index, room in enumerate(ROOMS):
    for slot, word in enumerate(room.pop('words')):
        exhibits.append(build_exhibit(word, room_index, slot))
by_word = {e['word']: e for e in exhibits}
rooms = list(ROOMS)
zh_path = ROOT / 'src/zh-TW.json'
zh = read(zh_path)

def add_house(kind, name, name_zh, subtitle, subtitle_zh, display, translations, note, words, extra=None):
    """Append a townhouse room; returns its index. Words already placed get a second display for root houses only."""
    room_index = len(rooms)
    zh[name] = name_zh
    zh[subtitle] = subtitle_zh
    rooms.append({
        'id': f'house-{room_index}', 'name': name, 'subtitle': subtitle, 'color': room_color(room_index),
        'house': {'kind': kind, 'display': display, 'translations': translations, 'note': note, 'words': words},
        **(extra or {}),
    })
    return room_index

# 1. Root-family houses, transcribed from Handy 990's root workshop.
for root_id, words in family_entries():
    root = morphemes[root_id]
    subtitle, subtitle_zh = ROOT_SUBTITLES.get(root['display'], (
        f"One root, many words: {root['display']} means {root['gloss']}.",
        f"同一個字根，許多單字：{root['display']} 的意思是「{root['translations']['zh_TW']}」。"))
    room_index = add_house('root', f"Root Family · {root['display']}", f"字根家族 · {root['display']}", subtitle, subtitle_zh,
                           root['display'], root['translations'], root['origin'], [word for word, _, _ in words],
                           {'id': f"root-{root_id.removeprefix('root_')}", 'root': {'id': root_id, 'display': root['display'], 'meaning': root['gloss'], 'translations': root['translations'], 'origin': root['origin'], 'words': [word for word, _, _ in words]}})
    for slot, (word, pieces, root_index) in enumerate(words):
        family = {'room': room_index, 'slot': slot, 'root': root['display'], 'pieces': pieces, 'rootIndex': root_index}
        if word not in by_word:
            exhibit = build_exhibit(word, room_index, slot)
            exhibits.append(exhibit)
            by_word[word] = exhibit
        by_word[word].setdefault('families', []).append(family)

# 2. Every remaining catalog word above LEVEL_MIN, grouped by theme map, then derivation family, then level.
level = {}
for q in catalog:
    l = q.get('difficulty_level', q.get('source_level'))
    if l is not None and (q['answer'] not in level or l > level[q['answer']]):
        level[q['answer']] = l
eligible = lambda word: word in lexicon and level.get(word, 0) > LEVEL_MIN and word not in by_word
def chunks(items, size=HOUSE_SIZE):
    """Split into houses of at most `size`, balanced so no house is left with a single word."""
    if not items:
        return []
    count = -(-len(items) // size)
    base, extra = divmod(len(items), count)
    parts, start = [], 0
    for i in range(count):
        end = start + base + (1 if i < extra else 0)
        parts.append(items[start:end])
        start = end
    return parts
def place_house(kind, name, name_zh, subtitle, subtitle_zh, display, translations, note, words):
    room_index = add_house(kind, name, name_zh, subtitle, subtitle_zh, display, translations, note, words)
    for slot, word in enumerate(words):
        exhibit = build_exhibit(word, room_index, slot)
        exhibits.append(exhibit)
        by_word[word] = exhibit

theme_maps = read(DATA / 'theme_maps.json')['maps']
for theme in theme_maps:
    members = []
    for group in theme['groups']:
        members += [(m['word'], group) for m in group['members'] if eligible(m['word']) and m['word'] not in [w for w, _ in members]]
    if len(members) < 2:
        continue
    titles = {locale: t['title'] for locale, t in theme['translations'].items()}
    parts = chunks(members)
    for part_index, part in enumerate(parts):
        suffix = f" {'I II III IV V VI'.split()[part_index]}" if len(parts) > 1 else ''
        labels = []
        for _, group in part:
            label = group['translations']['en_US']['label']
            if label not in labels:
                labels.append(label)
        labels_zh = []
        for _, group in part:
            label = group['translations']['zh_TW']['label']
            if label not in labels_zh:
                labels_zh.append(label)
        place_house('theme', f"{titles['en_US']}{suffix}", f"{titles['zh_TW']}{suffix}",
                    f"Theme house: {' · '.join(labels)}.", f"主題小屋：{'、'.join(labels_zh)}。",
                    titles['en_US'], {k: v for k, v in titles.items() if k != 'en_US'}, ' · '.join(labels), [w for w, _ in part])

families = read(DATA / 'word_families.json')['families']
pending = []
for family in sorted(families, key=lambda f: f['id']):
    words = [m['word'] for m in family['members'] if eligible(m['word']) and m['word'] not in pending and m['word'] not in [w for w, _ in pending]]
    if len(words) >= 2:
        pending += [(w, family['id']) for w in words]
for part in chunks(pending):
    heads = []
    for _, head in part:
        if head not in heads:
            heads.append(head)
    zh_heads = [lexicon[h]['senses'][lexicon[h].get('primary_sense', 0)]['translations'].get('zh_TW', h) if h in lexicon else h for h in heads]
    display = ' · '.join(heads)
    translations = {loc: ' · '.join(lexicon[h]['senses'][lexicon[h].get('primary_sense', 0)]['translations'].get(loc, h) if h in lexicon else h for h in heads) for loc in ('zh_TW', 'ja_JP', 'ko_KR', 'vi_VN', 'th_TH')}
    place_house('family', f"Word Families · {display}", f"單字家族 · {'、'.join(zh_heads)}",
                'One stem, several forms: verb, noun, adjective side by side.', '同一個字幹，不同詞性並肩而立。',
                display, translations, 'Word families from Handy 990', [w for w, _ in part])

rest = sorted((w for w in level if eligible(w)), key=lambda w: (level[w] // 10, w))
for part in chunks(rest):
    lo, hi = level[part[0]] // 10 * 10 + 1, level[part[0]] // 10 * 10 + 10
    letters = f"{part[0]}–{part[-1]}"
    place_house('level', f"Level {lo}–{hi} · {letters}", f"等級 {lo}–{hi} · {letters}",
                f"Six words of level {lo} to {hi}, in alphabetical order.", f"等級 {lo} 到 {hi} 的六個單字，依字母排序。",
                f"{lo}–{hi}", {'zh_TW': f'等級 {lo}–{hi}', 'ja_JP': f'レベル {lo}–{hi}', 'ko_KR': f'레벨 {lo}–{hi}', 'vi_VN': f'Cấp {lo}–{hi}', 'th_TH': f'ระดับ {lo}–{hi}'},
                f"Level {lo}–{hi} · {letters}", part)

zh_path.write_text(json.dumps(zh, ensure_ascii=False, indent=2) + '\n')

# Light records stay in the bundle; detail fields load when a flashcard opens.
DETAIL_KEYS = ['ipa', 'kk', 'synonyms', 'senses', 'collocations', 'originalImage']
details_dir = ROOT / 'public/data/exhibits'
details_dir.mkdir(parents=True, exist_ok=True)
light = []
for exhibit in exhibits:
    detail = {k: exhibit[k] for k in DETAIL_KEYS if k in exhibit}
    (details_dir / f"{exhibit['id']}.json").write_text(json.dumps(detail, ensure_ascii=False))
    light.append({k: v for k, v in exhibit.items() if k not in DETAIL_KEYS})
output = {'source': 'Handy 990', 'catalogCount': len(catalog), 'rooms': rooms, 'exhibits': light}
(ROOT / 'src/collection.json').write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n')
(ROOT / 'src/collection-counts.json').write_text(json.dumps({'landmarks': len(ROOMS), 'houses': len(rooms) - len(ROOMS)}) + '\n')
from collections import Counter
kinds = Counter(room['house']['kind'] for room in rooms if 'house' in room)
print(f'Imported {len(exhibits)} exhibitions across {len(rooms)} rooms ({dict(kinds)} houses, {sum(len(e.get("families", [])) for e in exhibits)} family displays), with {sum(bool(e["audio"]) for e in exhibits)} pronunciation recordings.')
