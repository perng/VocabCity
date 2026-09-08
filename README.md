# Vocab Hall

A walkable vocabulary museum with an entrance atrium, three long gallery routes, and an outdoor garden built with React, TypeScript, Vite, and Three.js. The prototype pairs 54 Handy 990 words with original, high-resolution AI-created paintings, with definitions and example sentences on the walls.

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
- Click a painting to open its flashcard and immediately hear the word's pronunciation. This also works from the collection, garden word list, and next/previous exhibit controls. Opening another exhibit replaces the current audio; closing it stops playback. The flashcard includes the original definition, example, pronunciation, translations, collocations, synonyms, and other senses.
- Each of the nine gallery areas has a coordinated collection of six works: impressionist oils, botanical watercolors, contemporary gouache and collage, or soft pastel and charcoal. Choose **欣賞畫作 / View artwork** in a word's detail view to inspect its large painting, localized title, and medium.
- Traditional Chinese (`zh_TW`) is the default interface and translation language, including the exhibit labels. The header switches between Chinese and English; the exhibit language selector also supports the source translations in Japanese, Korean, Vietnamese, and Thai. Language choices persist in this browser.
- Each exhibit has **聽單字**, **聽例句**, and **全部播放** controls. Play all reads the word and then its main example. Playback supports 0.75×, 1×, and 1.25× speed, shows progress, and stops when leaving the exhibit. Additional meanings have their own sentence buttons. Ambient tones become quieter while speech plays.
- Visitors start in the forecourt facing a twelve-meter-wide gate, greeted by the original waving Handy 990 mascot. The bright 36 × 28-meter entrance atrium connects the central gallery and two new 84-meter wings, each 24 meters wide. The west wing explores nature and light; the east wing explores people and connection. There are no interior doorways or partition walls, and the central walking routes stay clear of benches and sculptures.
- Walk directly through the full-width open end into the garden, with olive-like trees, flowers, a reflecting pool, shaded pergola seating, and distant hills. The pool and visible perimeter walls prevent walking through water or off the grounds.
- Plants have curved leaves with veins, branching stems, textured bark, ferns, sculpted pots with soil and pebbles, lavender, petaled daisies, and flowering water lilies. Shared materials and instanced foliage keep repeated details efficient; distant trees use fewer leaves.
- Six freestanding garden displays feature serene, flourish, nurture, landscape, habitat, and sustainable. These share learning progress with their indoor counterparts: 54 unique words, 60 physical displays. Open **花園裡的單字** in the garden to jump to one.
- Unchecked words have a bright gold frame and a gold empty checkbox, visible even at the dimmest point of the slow 6.8-second glow. Checking a word changes its frame to quiet wood and its checkbox to a filled green checkmark. Checkmarks work directly in 3D, in the detail view, and on collection cards; they persist across visits. Reduced-motion preferences suppress the animation while keeping the contrasting colors.
- Small YouTube icons in the caption row beneath each painting open the official YouGlish embedded player for that word, with real YouTube examples, captions, replay, speed, and next/previous controls. The icon has its own space above the gloss. The provider loads only when requested; closing the dialog stops playback. Vocabulary audio and ambience pause while the player is open. A direct YouGlish link and retry are available if the provider cannot load.
- Reading tables, book stacks, sculptures, ceramic vessels, lanterns, varied stones, a birdbath, and a gardener’s corner add small discoveries along the side paths.
- Exhibit viewing areas stay clear: indoor objects sit between displays, while the garden sign and pergola occupy the entrance perimeter, and trees and lanterns sit away from the paintings. Hover guidance appears below the artwork.
- The guided tour visits all 54 exhibits. The floor map shows the full T-shaped plan and jumps between the entrance, all nine galleries, and the garden, and tracks your position indoors and outdoors.
- Save words to a collection that can be searched and filtered. Discoveries and saved words stay in local browser storage; they do not sync to Handy 990.
- Day/evening lighting and optional quiet ambient tones are available. Audio only starts after an explicit interaction.

## Content provenance

Vocabulary, recordings, and the preserved original stickers come from the existing `~/handy-toeic` repository. The displayed paintings were newly generated for Vocab Hall. The source repository is never modified. The importer joins catalog questions to lexicon entries and selects the primary sense, while retaining the catalog's display sentence and its translations. Collocations are joined by the original sense index.

- `data/supplemental/vocabulary/catalog.json`
- `data/supplemental/vocabulary/lexicon.json`
- `data/supplemental/vocabulary/collocations.json`
- `assets/vocab_stickers/<question-id>.webp`
- `assets/mascot/lift_wave.webp` (copied unchanged for the gate greeting)
- `assets/listening/audio_src/vw_<word>_us.opus`
- `assets/listening/audio_src/ve_<question-id>_<display-index>_us.opus`

The 54 word recordings and all available example recordings are converted locally to AAC/M4A for browser compatibility. Example index 0 is the catalog sentence; additional examples follow the flashcard's primary-sense-first display order. Browser speech synthesis is a fallback if a recording cannot play. Re-import after changing the curated word lists in `scripts/import-vocab.py`:

```sh
npm run import:vocab
# Or use a different source checkout:
python3 scripts/import-vocab.py /path/to/handy-toeic
```

Python 3 is required for importing; FFmpeg is optional for importing recordings. The prototype assets are self-contained, so running the website does not need the source repository or FFmpeg. Re-importing vocabulary preserves the museum artwork through `art-direction/catalog.json`.

## Museum artwork

All 54 works were created with built-in `image_gen`. Each has a native resolution of 1254 × 1254 pixels, compared with the original 160 × 160 stickers. The requested 2048-pixel output was returned at 1254 pixels and retained without upscaling.

- Original PNG masters: `output/artwork/masters/`.
- Browser assets: `public/artwork/museum-v1/` (native-resolution WebP copies).
- Exact prompts and revision instructions: `art-direction/prompts.json`.
- Native generation paths: `art-direction/generated-sources.json`.
- Titles, series, mediums, resolution, and provenance: `art-direction/catalog.json`.

To reinstall generated artwork from the recorded source paths, run `python3 scripts/install-artwork.py`. This requires `cwebp`; it preserves the PNG masters and converts the browser copies to quality-92 WebP without resizing. Indoor and outdoor displays of the same word share a painting texture. The 3D scene uses a 768-pixel texture copy to limit GPU memory; the HTML artwork viewer retains each original 1254-pixel image.

## Validation

```sh
npm run build
npm test
```

The Playwright tests use locally installed Google Chrome by default and check artwork/audio availability, painting selection, translations, persistence, uninterrupted walking through the halls into the garden and back, wall and pool collision, hall/garden navigation, the full guided tour, mobile controls, the Traditional Chinese default, sequential audio playback, playback speed, and preventing overlapping recordings. Additional checks cover outdoor checkbox/video raycasts, clear views of every outdoor banner, painting, and gloss, learned-state persistence, reduced motion, and the YouGlish loading/retry/cleanup contract using a controlled provider response. Live third-party playback is checked separately in the browser. Screenshots are written to `test-results/`. The scene redraws on changes and, at a modest rate, while nearby unchecked frames glow. It stops pulsing while reading a dialog or when the page is hidden; architectural shadows are generated once.

The browser suite also verifies that all 54 paintings load at their native resolution, each hall has a consistent style, and the larger artwork view works on desktop and mobile.

Pronunciation checks cover automatic playback from paintings, collection cards, and garden exhibits; switching and reopening words; pause/replay controls; and stopping audio when closing an exhibit. Saving or checking a word and changing its translation do not restart playback.

## Prototype scope

This is a curated selection, not the full 3,834-question catalog. It uses local storage rather than accounts or a backend. The 3D view requires WebGL; the HTML collection remains available if WebGL cannot initialize. Static asset hosting is sufficient. The museum assets and original audio are local; YouGlish videos require internet access and depend on provider availability. The public prototype is available at [ai.perng.com/apps/vocab-hall](https://ai.perng.com/apps/vocab-hall/).

Implementation references: [Three.js renderer documentation](https://threejs.org/docs/pages/WebGLRenderer.html), [Vite documentation](https://vite.dev/guide/), and [YouGlish widget API and usage terms](https://youglish.com/api/doc/widget). Review YouGlish’s terms before commercial distribution; the prototype retains its attribution and player controls.

Expansion checks cover starting at the mascot gate, walking through the atrium to both wings, all nine gallery destinations, solid wing end walls, new word and sentence recordings, and the Traditional Chinese welcome/map on a phone.
