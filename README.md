# Letter Hive

A daily word game with ESDB Australian English answers, System, Light, and Dark colour modes, and progress saved on your device.

Serve this directory, then open `http://localhost:8000`:

```sh
python3 -m http.server 8000
```

Use a local server rather than opening `index.html` as a file: the game fetches its generated answers from `data/puzzles.json`. No JavaScript packages or external dictionary API are required. All runtime assets are served from this site; the full ESDB export is used only during generation.

- `index.html` contains the page markup.
- `letter-hive.css` contains the styles.
- `letter-hive.js` contains the game logic.
- `data/puzzle-config.json` defines collection size, answer-count limits, selection seed, and preserved letter sets.
- `data/puzzles.json` contains the generated answers used by the game.
- `data/word-overrides.json` holds explicit additions and exclusions.

## Install and play offline

Open Letter Hive online first. In Safari on iPhone, use **Share → Add to Home Screen**. In Chrome on Android, use **Install app** or **Add to Home screen** from the browser menu. Launch Letter Hive from the home-screen icon to play in its own window.

Open the installed app once while online so it can cache the game and puzzle data for offline play. Progress is saved locally. Depending on your browser, progress from before installation may live in separate storage.

## Daily puzzle archive

Choose **Archive** and select a past date to play its daily puzzle. The archive starts on 16 November 2026, the first full day in Brisbane after the current ESDB rotation went live. **Today** returns to the daily challenge, and **Previous** still follows your play history, including archive dates. An archived puzzle shares saved progress and hints with the same letter set elsewhere in the game. The **Played puzzles** list in Archive also lets you resume previously opened letter sets, including those started with **New**. It is stored on this device and carries over to later days. Older play can be recovered where a visited puzzle ID or saved words are still present.

[data/daily-rotation.json](data/daily-rotation.json) preserves the published order of daily puzzle IDs. Keep this order stable so reordering the free-play collection doesn’t change which puzzle a past date opens.

## Optional three-letter words

Open **How to play** and turn on **Allow three-letter words** to include shorter answers. Four letters remains the default. Three-letter words follow the same centre-letter and available-letter rules and earn 1 point each, just like four-letter words. Possible points, rank thresholds, completion and hints use the selected answer set. The setting applies to daily, archive and free play and is saved on this device.

Switching back to four letters hides shorter discoveries from the word list and score without deleting them. Turn the option on again to restore them. Longer answers and their scores carry across both modes. Every optional three-letter answer has a gentle definition clue and a more specific clue for the same meaning.

## Optional puzzle hints

Hints unlock at the third rank, **Moving Up**, for each puzzle. Choose **Hint** beside the score to show a clue below the progress bar. It gives the first letter and a simple definition. **Stronger hint**, to the right of the clue, reveals the first two letters and a more specific definition for the same meaning. Words without reviewed definitions use structural clues instead. Use **Different hint** to switch targets or **Pangram hint** to choose an undiscovered pangram. Hints never show the full answer or affect scoring or rank.

Letter Hive remembers the current target and strongest clue you’ve requested for each word on this device. Progress is separate for each puzzle, and hints work offline with the cached game data.

ESDB supplies the accepted spellings. [data/hints.json](data/hints.json) stores two reviewed clues per spelling, shared across puzzles. It records the selected WordNet sense and the pinned source archive and checksum, or a per-entry dictionary source for separately researched meanings. The WordNet clues are adapted from [Open English WordNet 2025](https://github.com/globalwordnet/english-wordnet/releases/tag/2025-edition) under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). See the [source licence and notices](https://github.com/globalwordnet/english-wordnet/blob/2025-edition/LICENSE.md). A matching spelling alone doesn’t verify the intended sense, so only reviewed clues ship. New hint targets favour reviewed clues where available, and the game can still offer structural clues for other answers.

To expand coverage, add or edit entries in `data/hints.json`. Use an accepted spelling, verify the source sense, and write two increasingly specific clues that omit the answer. WordNet entries use a `synset` ID. A headword mapping also records its `lemma` and `relation`. Use `inflection` for a form explicitly listed in WordNet, or `punctuation` for a reviewed change that removes spaces or hyphens without changing case or substituting letters. Reviewed regular forms use `plural`, `third-person`, `past`, `participle`, `comparative` or `superlative`. Archive validation checks the selected headword, sense and part of speech, then checks either the listed form or the applicable spelling rule. Nouns with explicit alternative plurals must use a listed spelling. These guards support human review; they do not establish grammatical or semantic equivalence by themselves. For a separately supplied definition, use a per-entry `source` object containing its `name` and `definition` instead; do not attach an unrelated WordNet sense. Both kinds receive the same answer and clue checks, while archive validation applies to WordNet entries. Run `python3 scripts/check-hints.py` to check the bundled entries, or pass `--wordnet-zip /path/to/english-wordnet-2025-json.zip` to also verify each sense ID against the pinned archive and measure exact-spelling coverage. The game and normal deployment use the bundled file and don’t need the WordNet archive or API.

The collection has reviewed clues for **all 4,311 default answers** across all 121 puzzles (100% of unique default answers): 2,677 use exact WordNet spellings, 1,216 use reviewed headword mappings (167 listed inflections, 10 punctuation variants and 1,039 regular forms), and 418 use separately recorded definitions. Reviewed definitions cover **all 6,461 default answer appearances (100%)**; all 121 puzzles have a reviewed pangram clue.

The optional mode adds **507 three-letter answers**, all with two reviewed definition clues: 423 use exact WordNet spellings, 19 use verified headword mappings and 65 use separately recorded dictionary definitions. Together, both modes have clues for **all 4,818 unique answers** and **all 7,680 answer appearances**.

Separate sources include [Collins](https://www.collinsdictionary.com/), [Merriam-Webster](https://www.merriam-webster.com/), [Cambridge](https://dictionary.cambridge.org/), [Oxford Learner's Dictionaries](https://www.oxfordlearnersdictionaries.com/), the [Australian National Dictionary Centre](https://history.cass.anu.edu.au/centres/andc/meanings-origins/all) and the [Dictionary of Canadianisms](https://dchp.arts.ubc.ca/). Each separately sourced entry records a link and an adapted definition, with its headword or an additional definition link where needed. The four Wiktionary-based entries also record contributor attribution and [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) licence links. The previously supplied editorial definition retains its own provenance.

Some words have been excluded through `data/word-overrides.json` because of their potentially offensive nature or unsuitable source definitions. Every accepted answer, including optional three-letter words, has two reviewed definition clues. Structural hints remain available as a fallback if hint data cannot be loaded.

To generate research suggestions without changing answers or clues:

```sh
python3 scripts/research-hint-variants.py --wordnet-zip /path/to/english-wordnet-2025-json.zip --output /tmp/hint-variant-candidates.json
```

The checksum-verified report groups explicitly listed forms, punctuation variants, other normalisations, and regular-form hypotheses. Groups overlap and suggestions are not verified equivalences. Preserve the answer's tense, number and part of speech when adapting a headword's definition. Review sense ambiguities even when WordNet lists the form: `genii`, for example, appears under `genius` with intellectual-ability senses, and the `login` suggestions point to verbs rather than its usual noun use. The shipped clues for those examples use separately researched dictionary definitions. Capitalisation changes and suffix guesses never qualify automatically for archive-validated mappings.

## Dictionary

The source is the [English Speller Database (ESDB, formerly SCOWL)](https://github.com/en-wl/wordlist), pinned to revision `1e5b7d3a72f47a71da5d28686c1dd4b397178485`.

Settings: size **60**, Australian spelling (**D**), maximum variant level **1**, accents removed using ESDB's export option, abbreviations excluded, default word category only, and nonwords/word parts excluded. The exact command and SHA-256 checksum are recorded in `data/esdb/source.json`. The complete exported list contains 108,458 entries; the game then accepts only lowercase ASCII words with 4–30 letters by default and includes optional three-letter words in a separate `threeLetterWords` list for each puzzle. Capitalised entries, punctuation, possessives, and compounds containing spaces or hyphens are excluded rather than normalised into playable words.

Each generated answer must contain the centre letter and use only the seven puzzle letters. Letters may repeat. Generation fails if any puzzle has no pangram. Ranks and possible points use the complete generated answer set.

## Puzzle collection and free play

The collection contains **120 distinct seven-letter sets**, with **121 puzzles** because two of the preserved original puzzles use the same letters with different centre letters. All published letter sets are pinned in the configuration’s `preserve` list, including the original four, so vocabulary exclusions cannot change daily assignments. Two published puzzles (`b-eginrz` and `i-bekrtz`) now have 39 answers after exclusions. New sets are selected deterministically from actual ESDB pangrams, with 40–150 accepted answers, two or three vowels, and at most one of J/Q/X/Z. Selection favours different letters between neighbouring puzzles and balances letter and centre-letter usage. These are vocabulary and variety checks rather than a guarantee of equal difficulty.

The local date chooses a daily puzzle. **New** starts another immediately, preferring unvisited puzzles whose letters differ most from the current set. No puzzle repeats until the collection has been visited; a new cycle then begins. **Previous** returns through this session's puzzle history, and **Today** returns to the daily challenge. A reload on the same day resumes the current puzzle. A new day opens that day's challenge.

Progress is stored separately by a stable ID made from the centre and outer letters, so it survives switching puzzles, reloading, and reordering the collection. Today's saves from the old four-puzzle daily rotation are migrated to their original letter set without deleting the old save. Saved answers outside the current dictionary are excluded from the displayed score. Browser storage must be available for persistence across reloads.

ESDB is a spelling dictionary, so its acceptance rules differ from other word games. Add lowercase words to the `add` or `exclude` arrays in `data/word-overrides.json` to curate exceptions.

Regenerate the collection after changing its settings, preserved letter sets, or an override:

```sh
python3 scripts/build-puzzles.py
```

The export is bundled, so normal generation and deployment need no upstream download. To reproduce the export itself, use a separate upstream checkout:

```sh
git clone --branch v2 https://github.com/en-wl/wordlist.git /tmp/letter-hive-esdb
git -C /tmp/letter-hive-esdb checkout 1e5b7d3a72f47a71da5d28686c1dd4b397178485
python3 scripts/import-esdb.py /tmp/letter-hive-esdb
python3 scripts/build-puzzles.py
```

Importing requires Git, Make, Python 3, and SQLite support in Python, as required by that ESDB revision. The importer checks the pinned revision and rejects modified upstream source files.

Dictionary copyright: Copyright 2000-2026 by Kevin Atkinson; Australian English data Copyright 2016 by Benjamin Titze. The complete upstream notices are preserved in [data/esdb/COPYRIGHT.txt](data/esdb/COPYRIGHT.txt), included in the deployed site, and linked from the game footer.

## Validation

```sh
python3 -m unittest discover -s tests -p 'test_*.py'
python3 scripts/build-puzzles.py --check
node --test tests/game.test.cjs
```

Python tests cover dictionary filtering, Australian spelling, overrides, pangrams, and collection diversity. Node tests exercise every puzzle, scoring, duplicate rejection, puzzle navigation, independent progress, reloads, old-save migration, avoiding repeats, and data-loading failures using a simulated DOM. They do not replace a browser rendering check.

## GitHub Pages

The included workflow checks the generated answers and runs tests before publishing when changes are pushed to `main`. It can also be run manually from the Actions tab. The deployment includes the HTML, CSS, JavaScript, web app manifest, icons, service worker, generated puzzle JSON, daily rotation, reviewed hint JSON, and dictionary licence. It excludes the full dictionary export and development scripts.

1. Create an empty GitHub repository named `letter-hive` under your account.
2. Connect this checkout and push your committed changes:

   ```sh
   git remote add origin https://github.com/YOUR-USERNAME/letter-hive.git
   git push -u origin main
   ```

3. In the GitHub repository, open **Settings → Pages** and choose **GitHub Actions** as the source.
4. Open **Actions → Deploy to GitHub Pages → Run workflow** to deploy, or push another change to `main`.

The deployment reports the live URL, normally `https://YOUR-USERNAME.github.io/letter-hive/`. Relative asset paths also support an account site at `https://YOUR-USERNAME.github.io/` if the repository is named `YOUR-USERNAME.github.io`.

Progress and theme preferences are saved in each browser's local storage. Progress from a local file does not transfer to the hosted site.
