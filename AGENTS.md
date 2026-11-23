# Letter Hive contributor guide

Letter Hive is a static, installable word game. Keep it playable offline after
its first online load, with Australian English answers and progress stored on
the player's device.

## Architecture and coding conventions

- `index.html` owns the semantic markup and native dialogs. `letter-hive.css`
  owns layout, responsive rules and theme tokens. `letter-hive.js` owns game
  state, scoring, navigation, storage and DOM updates.
- Keep the site build-free. Use browser APIs, plain JavaScript, HTML and CSS.
  Python scripts under `scripts/` handle data generation and validation with
  the standard library. Follow neighbouring formatting and reuse the existing
  game state, render functions and CSS custom properties.
- Use relative asset URLs so GitHub Pages can serve the app from a repository
  subpath. When adding a runtime asset, check the deployment copy list in
  `.github/workflows/pages.yml` and the precache list in `sw.js`. The workflow
  replaces `LETTER_HIVE_BUILD_REVISION` with the deployed commit SHA.
- Keep the game self-contained at runtime. It fetches bundled puzzle, rotation
  and hint JSON. The full ESDB export and the WordNet archive are development
  inputs. Puzzle and rotation data are required to play. Missing hint data
  falls back to structural clues.

## Puzzle data and dictionary

- The accepted vocabulary comes from the bundled ESDB Australian English
  export at `data/esdb/en-au-60.txt`. Keep its upstream revision, exact export
  command and SHA-256 in `data/esdb/source.json`, and preserve
  `data/esdb/COPYRIGHT.txt` and the in-game attribution. The export uses size
  60, spelling D, variant level 1 and ESDB's deaccent option. It excludes
  abbreviations, nonwords and word parts and uses the default word category.
- Playable answers match `[a-z]{4,30}`. Filter capitalised entries and words
  with punctuation, spaces or hyphens as written. Put explicit exceptions in
  `data/word-overrides.json`. Both the `add` and `exclude` lists follow the
  playable format and must be disjoint.
- Edit `data/puzzle-config.json` or the overrides and regenerate
  `data/puzzles.json` with `python3 scripts/build-puzzles.py`. Keep the
  generated file in sync with its inputs. Normal generation is deterministic
  and uses the bundled export. See the README for reimporting upstream ESDB.
- Each puzzle has seven distinct letters and one required centre letter.
  Answers draw from those letters, may repeat letters, and include at least one
  pangram using all seven. New sets come from actual pangrams and use the
  configured answer-count bounds (currently 40–150), two or three vowels and
  at most one of J, Q, X or Z. Preserve the original four puzzles.

## Gameplay, saves and daily archive

- Four-letter words earn one point, longer words earn one point per letter,
  and pangrams earn a seven-point bonus. Compute possible points from the
  full generated answer set. Use the same rank thresholds for the scoreline,
  both rank bars and hint availability. Hints unlock at **Moving Up**.
- Puzzle IDs use the centre letter followed by a hyphen and the sorted outer
  letters. Progress and hint state follow that ID across daily, archive and
  free play. Keep existing save keys and compatibility with older date-keyed
  and ID-only saves when changing storage. Filter restored answers against
  the current puzzle. The game should still play when storage is unavailable.
- **New** favours low letter overlap and avoids repeats until the collection
  has been visited. **Previous** follows play history, **Today** opens the local
  day's challenge, and **Archive** opens past daily puzzles or resumes played
  puzzles, including ones started with **New**.
- Keep published daily date assignments stable when growing or reordering the
  free-play pool. `data/daily-rotation.json` holds the published order and the
  archive start date. The current lookup uses the day number modulo
  `puzzleIds.length`, so even appending IDs to that array changes past
  assignments. If extending the daily schedule, verify representative
  published dates still resolve to their original IDs.

## Reviewed hints

- Store shared clues by accepted spelling under `clues` in `data/hints.json`.
  Keep the pinned Open English WordNet 2025 source, checksum and CC BY 4.0
  attribution. Check that the selected `synset` has a definition for that
  spelling and that its meaning suits the puzzle. Prioritise pangrams and
  recurring answers, especially in puzzles with limited reviewed coverage.
- Write distinct `gentle` and `stronger` phrasings for the same sense. Make the
  second clue more specific. The validator rejects the full answer anywhere
  in either clue, ignoring case. Review clue quality and answer leakage in
  addition to running the validator.
- The game formats clues below the progress bar as `N letters, A—: …` and
  `N letters, AB—: …`. The pangram star sits to the left of the hint bulb.
  With a clue visible, the bulb switches to the circular-arrow variant and
  the stronger-hint button sits to the right of the clue. Keep structural
  clues available for words without a reviewed definition. Hint requests
  leave scoring and ranks alone.

## UI and PWA design

- Keep the hive and controls stable when clues or transient feedback appear.
  Use the existing compact scoreline, entry, message and hive spacing. On
  mobile portrait, fit the game in one viewport and keep the actions easy to
  reach. Preserve the even gaps around the hexagons and the SVG brand mark,
  which avoids iOS emoji substitution.
- Respect safe-area insets and dynamic viewport height. The installed iOS
  portrait layout has its own top inset for the status-bar blur. Check it on
  an installed iPhone PWA when changing header or viewport spacing.
- On mobile portrait, keep the found-words strip below the actions and its
  expand control centred beside the words. The found-words dialog opens with
  focus on its heading and has a centred **Back to puzzle** footer button.
  The archive dialog also starts on its heading so the native date picker
  opens only when selected. Keep the date field within the dialog and check
  its text alignment on iOS.
- Preserve **System**, **Light** and **Dark** theme choices. System follows
  device changes and explicit choices persist. Use the existing slate-blue
  dark palette, visible keyboard focus, accessible names for icon-only
  buttons, live feedback and reduced-motion styles.

## Local preview and validation

Serve the repository with `python3 -m http.server 8000` and open
`http://localhost:8000`. For installed PWA testing on a phone, use an HTTPS
preview and check the updated build online before testing it offline. Account
for the service worker's cached assets when previewing changes.

Run the checks used by GitHub Pages CI from the repository root.

```sh
python3 -m unittest discover -s tests -p 'test_*.py'
python3 scripts/build-puzzles.py --check
python3 scripts/check-hints.py
node --test tests/game.test.cjs
```

For WordNet clue changes, also run
`python3 scripts/check-hints.py --wordnet-zip /path/to/english-wordnet-2025-json.zip`
against the pinned archive to validate sense IDs and report coverage. The Node
suite uses a simulated DOM. Check layout, accessibility and service-worker
changes in a browser as appropriate.

## Git workflow

Make requested edits on the task branch in the shared checkout so the
maintainer can review them locally. Inspect the branch and working tree first,
preserve unrelated changes, and run the appropriate checks before committing
or merging. Use clear commits and PR descriptions. Use `Closes #N` only for
issues fully resolved by the change. Use a plain issue reference for partial
work. Reuse an existing PR for the same branch and target.

| Shortcut | Action |
| --- | --- |
| `C!` | Commit the task's changes. |
| `CP!` | Commit and push the current branch to `origin`. |
| `P!` | Push the current branch's existing commits, setting upstream if needed. |
| `R!` | Open or reuse a PR for the current branch, targeting `main` by default. |
| `PR!` | Push the current branch, then open or reuse its PR. |
| `CPR!` | Commit, push the current branch, then open or reuse its PR. |
| `M!` | Merge the current branch into synchronised `main`. |
| `CM!` | Commit, then merge into synchronised `main`. |
| `MP!` | Merge into synchronised `main`, then push `main` to `origin`. |
| `CMP!` | Commit, merge into synchronised `main`, then push `main` to `origin`. |

Treat shortcuts as case-insensitive instructions when used as commands. Carry
out only the steps specified. If a required step is omitted, report it.
Fetch before merging, prefer a fast-forward when possible and follow branch
protection. Report the commit, push, PR, merge and issue status as applicable.
