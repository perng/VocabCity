# Vocab Hall

A walkable vocabulary city: a walled Mediterranean old town where 2,538 Handy 990 words (every catalog word above level 30) hang on the harbour quay, in squares and arcades, inside a cathedral, a palazzo, a guildhall, a town hall and a cistern, in a park and a market, and in 482 townhouses of the Old Town: 93 root-family houses, 243 theme houses, 28 word-family houses and 118 level lanes. Built with React, TypeScript, Vite, and Three.js, with original, high-resolution AI-created paintings and definitions and example sentences beside every work.

The site is published at [https://ai.perng.com/apps/vocab-hall/](https://ai.perng.com/apps/vocab-hall/); `public/site.txt` records that address for the deploy script.

## Run locally

```sh
npm install
npm run dev
```

Open http://localhost:5173. `npm run build` creates a static site in `dist/`; `npm run preview` serves that production build. Relative asset URLs support hosting at a subdirectory.

## Deploy to ai.perng.com

`public/site.txt` records the deployment URL, `https://ai.perng.com/apps/vocab-hall/`. Vite copies this control file into `dist/` when building. Deploy only the contents of `dist/`:

```sh
npm run build
python3 ~/.claude/skills/ai-perng-com-sync/scripts/sync.py dist --dry-run
python3 ~/.claude/skills/ai-perng-com-sync/scripts/sync.py dist
```

The sync script excludes `site.txt` from the upload and adds or updates files without deleting existing remote files.

## Explore

- W/A/S/D: walk; arrow keys: move forward/backward and turn. Q/E also turn. Shift increases walking speed.
- Drag with a mouse or swipe with a finger to look around. On-screen arrows support touch and keyboard input.
- Click a painting to open its flashcard and immediately hear the word's pronunciation. This also works from the collection and the next/previous exhibit controls. The flashcard includes the original definition, example, pronunciation, translations, collocations, synonyms, and other senses.
- **The city plan.** Visitors arrive on the **Harbour Quay** facing the sea gate; the quay wall carries the first paintings, the **Belvedere** pergola sits at its western end, and the **Harbour Mole** runs out to the lighthouse with freestanding displays. Through the twin-towered gate is the **Gate Square** with a fountain and arcades, flanked by the **Town Hall** (indoor) and the **Inn Courtyard** (open air). The arcaded **Corso** leads north with paintings on the house fronts under the arcades and passages halfway along to the **City Park** (pond, bandstand, two open-air groups) and the **Market Square** (six stalls). The **Cathedral Square** has a statue at its centre, the **Palazzo** to the west, the **Guildhall** to the east, and the domed **Cathedral** to the north with the lantern-lit **Cistern** beside it.
- **The Old Town.** North of the cathedral a promenade opens onto the canal street and, beside it, three more avenues. Twenty-five lanes in four block columns cross the canal and avenues on bridges; each lane has ten townhouse plots a side, alternating open **courtyard** houses and roofed **shop** houses. Every house is one exhibition of two to six words: the 93 **root-family houses** come first (transcribed from Handy 990's root workshop; the banner shows the root, its meaning in the current language, its Latin origin and the family's words, word banners highlight the root in gold and the plaque shows the formula such as `sub + port`), then 243 **theme houses** built from Handy 990's theme maps (the banner shows the theme title in six languages and its group labels), 28 **word-family houses** (verb, noun and adjective forms of one stem), and 118 **level lanes** holding every remaining word above level 30, six to a house in alphabetical order by level band. A two-sided banner hangs at each house's centre above a floor medallion, a lintel sign names the house over its door, and lane signs at every bridge list the houses along that lane. Words that belong to several root families or to a landmark hang in each of their rooms and share one learning state. The **Bell Tower** closes the canal to the north and the **Observatory** stands on its hill beyond the walls.
- **Built to grow.** The plan is parametric: lanes stack northward up to eight rows, then further block columns open east and west of the canal joined by avenues, and the wall walk inside the ramparts is reserved for future landmark groups (sixty metres per group). Townhouses are built on demand within about 64 meters of the visitor and released beyond about 104 meters, so the scene budget does not grow with the collection. The city walls, map and navigation derive from the counts in `src/collection-counts.json`, which the importer writes. Flashcard details (pronunciation symbols, other senses, collocations, synonyms) live in `public/data/exhibits/<id>.json` and load when a card opens, keeping the bundled collection light.
- Each of the fifteen landmark groups has six works in deliberately mixed media: Chinese ink wash and gongbi silk, ukiyo-e and Rinpa gold leaf, Mughal, Madhubani and Persian miniatures, arabesque illumination, Korean minhwa, batik, Byzantine mosaic, Greek red-figure pottery, Mexican and West African folk idioms, geometric and gestural abstraction, cubism, cut-paper, photomontage and fabric collage, Bauhaus, stained glass, linocut, pop art and risograph prints. Twelve works are murals sprayed, stencilled or frescoed straight onto the outdoor walls of the gate square, quay, arcades, inn courtyard and belvedere, and hang without frames. Each townhouse is its own series with a medium drawn from the museum's twenty-three. Choose **欣賞畫作 / View artwork** in a word's detail view to inspect its large painting, localized title, and medium.
- Traditional Chinese (`zh_TW`) is the default interface and translation language, including the district and lane signs. The header switches between Chinese and English; the exhibit language selector also supports the source translations in Japanese, Korean, Vietnamese, and Thai. Language choices persist in this browser.
- Each exhibit has **聽單字**, **聽例句**, and **全部播放** controls. Play all reads the word and then its main example. Playback supports 0.75×, 1×, and 1.25× speed, shows progress, and stops when leaving the exhibit. Additional meanings have their own sentence buttons. Ambient tones become quieter while speech plays.
- A root-family exhibit's detail view adds a **拆解字根 / Word roots** panel for each family the word belongs to: every piece with its meaning (prefix, root, suffix), the root's origin, links to the rest of the family, and a shortcut to the house. The collection's gallery filter lists landmarks and townhouses, and opening a shared word from a filtered room lands in that room.
- Unchecked words have a bright gold frame and a gold empty checkbox, visible even at the dimmest point of the slow 6.8-second glow. Checking a word changes its frame to quiet wood and its checkbox to a filled green checkmark. Checkmarks work directly in 3D, in the detail view, and on collection cards; they persist across visits. Reduced-motion preferences suppress the animation while keeping the contrasting colors.
- Small YouTube icons in the caption row beneath each painting open the official YouGlish embedded player for that word, with real YouTube examples, captions, replay, speed, and next/previous controls. The provider loads only when requested; closing the dialog stops playback. Vocabulary audio and ambience pause while the player is open.
- The guided tour visits all 2,538 exhibits. The city map shows every landmark, the Old Town lanes and houses, the canal, the bell tower and the observatory, and follows your position; the map dialog offers landmark shortcuts, a list of the landmark groups, and a grid of all ninety-three root houses. **下一站 / Next stop** walks the landmarks in order and **下一個字根 / Next root** walks the houses.
- Save words to a collection that can be searched and filtered. Discoveries and saved words stay in local browser storage; they do not sync to Handy 990.
- Day/evening lighting and optional quiet ambient tones are available. Audio only starts after an explicit interaction.

## Content provenance

Vocabulary, recordings, and the preserved original stickers come from the existing `~/handy-toeic` repository. The displayed paintings were newly generated for Vocab Hall. The source repository is never modified. The importer joins catalog questions to lexicon entries and selects the primary sense, while retaining the catalog's display sentence and its translations. Collocations are joined by the original sense index.

- `data/supplemental/vocabulary/catalog.json`
- `data/supplemental/vocabulary/lexicon.json`
- `data/supplemental/vocabulary/collocations.json`
- `data/supplemental/vocabulary/morphemes.json` (root, prefix, and suffix meanings with translations)
- `docs/vocab-root-workshop-recipes.json` (reviewed root-lesson word splits; the six starter families are transcribed from `lib/vocab_root_lessons.dart` in `scripts/import-vocab.py`)
- `data/supplemental/vocabulary/theme_maps.json` and `word_families.json` (theme houses and word-family houses)
- `assets/vocab_stickers/<question-id>.webp`
- `assets/mascot/lift_wave.webp` (copied unchanged for the gate greeting)
- `assets/listening/audio_src/vw_<word>_us.opus`
- `assets/listening/audio_src/ve_<question-id>_<display-index>_us.opus`

The 2,538 word recordings and all available example recordings are converted locally to AAC/M4A for browser compatibility. Example index 0 is the catalog sentence; additional examples follow the flashcard's primary-sense-first display order. Browser speech synthesis is a fallback if a recording cannot play. Re-import after changing the curated word lists in `scripts/import-vocab.py`:

```sh
npm run import:vocab
# Or use a different source checkout:
python3 scripts/import-vocab.py /path/to/handy-toeic
```

Python 3 is required for importing; FFmpeg is optional for importing recordings. The prototype assets are self-contained, so running the website does not need the source repository or FFmpeg. Re-importing vocabulary preserves the museum artwork through `art-direction/catalog.json`.

## Museum artwork

All 2,538 works were created with `image_gen`: the first 90 through the Codex app's built-in tool, and the rest with `scripts/generate-artwork.py`, which drives the Codex CLI (`codex exec`) one hard-timed image at a time, several workers in parallel. Art direction for the townhouse words was drafted with `scripts/author-artwork.py` (Codex writes title, Chinese title and scene subject per batch into `output/artwork/authoring/`) and turned into prompts by `scripts/assemble-prompts.py`, which names each house as a series and assigns a medium from the pool. Each has a native resolution of 1254 × 1254 pixels, compared with the original 160 × 160 stickers. The requested 2048-pixel output was returned at 1254 pixels and retained without upscaling. Each root family is its own series with a name and a medium drawn from the museum's twenty-three mediums, from harbour impressionism for port to luminous chiaroscuro for rupt. Words without a Handy 990 sticker show a placeholder until their painting is installed. PNG masters are kept on disk under `output/artwork/masters/` and are not committed.

- Original PNG masters: `output/artwork/masters/`.
- Browser assets: `public/artwork/museum-v1/` (native-resolution WebP copies).
- Exact prompts and revision instructions: `art-direction/prompts.json`.
- Native generation paths: `art-direction/generated-sources.json`.
- Titles, series, mediums, resolution, and provenance: `art-direction/catalog.json`.

To generate any artwork still missing from `art-direction/generated-sources.json`, run `python3 scripts/generate-artwork.py` (`--limit 1` for a smoke test, `--shard 0/2` and `--shard 1/2` for two workers, `--model` to choose a Codex model the installed CLI supports), then `python3 scripts/generate-artwork.py --record`. Generated PNGs land in `output/artwork/generated/`, which is not committed. To reinstall generated artwork from the recorded source paths, run `python3 scripts/install-artwork.py`. To paint a set of works again in different media, run `python3 scripts/restyle-artwork.py` (default: the hundred landmark and first-house works; `--words` for others), which rotates through `art-direction/styles.json`, retires the old masters to `output/artwork/retired/` and prints the `--words` list to pass to the generator; a style flagged `mural` renders frameless on the wall. This requires `cwebp`; it preserves the PNG masters and converts the browser copies to quality-92 WebP without resizing. Indoor and outdoor displays of the same word share a painting texture. The 3D scene uses a 768-pixel texture copy to limit GPU memory; the HTML artwork viewer retains each original 1254-pixel image.

## Validation

```sh
npm run build
npm test
```

The Playwright tests use locally installed Google Chrome by default and check artwork/audio availability, painting selection, translations, persistence, uninterrupted walking through the halls into the garden and back, wall and pool collision, hall/garden navigation, the full guided tour, mobile controls, the Traditional Chinese default, sequential audio playback, playback speed, and preventing overlapping recordings. Additional checks cover outdoor checkbox/video raycasts, clear views of every outdoor banner, painting, and gloss, learned-state persistence, reduced motion, and the YouGlish loading/retry/cleanup contract using a controlled provider response. Live third-party playback is checked separately in the browser. Screenshots are written to `test-results/`. The scene redraws on changes and, at a modest rate, while nearby unchecked frames glow. It stops pulsing while reading a dialog or when the page is hidden; architectural shadows are generated once.

The browser suite also verifies that every painting loads at its native resolution, each landmark group mixes at least four media while townhouses keep one series medium, the twelve murals sit on outdoor walls, and the larger artwork view works on desktop and mobile.

Pronunciation checks cover automatic playback from paintings, collection cards, and garden exhibits; switching and reopening words; pause/replay controls; and stopping audio when closing an exhibit. Saving or checking a word and changing its translation do not restart playback.

## Prototype scope

This is a curated selection, not the full 3,834-question catalog. It uses local storage rather than accounts or a backend. The 3D view requires WebGL; the HTML collection remains available if WebGL cannot initialize. Static asset hosting is sufficient. The museum assets and original audio are local; YouGlish videos require internet access and depend on provider availability. The public prototype is available at [ai.perng.com/apps/vocab-hall](https://ai.perng.com/apps/vocab-hall/).

Implementation references: [Three.js renderer documentation](https://threejs.org/docs/pages/WebGLRenderer.html), [Vite documentation](https://vite.dev/guide/), and [YouGlish widget API and usage terms](https://youglish.com/api/doc/widget). Review YouGlish’s terms before commercial distribution; the prototype retains its attribution and player controls.

Expansion checks cover starting at the mascot gate, walking through the atrium to both wings, all nine gallery destinations, solid wing end walls, new word and sentence recordings, and the Traditional Chinese welcome/map on a phone.

The new environment checks walk the continuous route from the garden to the waterfront rail, visit and play recordings in each setting, exercise every market stall’s painting/check/video controls, explore the wider market square, and follow the localized next-stop buttons on a phone.

## License

MIT. See [LICENSE](LICENSE).
