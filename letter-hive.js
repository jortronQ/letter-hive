(async () => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const themeSelect = $("themeMode");
  const systemTheme = window.matchMedia?.("(prefers-color-scheme: dark)");
  themeSelect.value = "system";
  try {
    const savedTheme = localStorage.getItem("letterhive-theme");
    if (savedTheme === "light" || savedTheme === "dark") themeSelect.value = savedTheme;
  } catch {}
  function applyTheme() {
    const mode = themeSelect.value;
    document.documentElement.dataset.theme =
      mode === "system" ? (systemTheme?.matches ? "dark" : "light") : mode;
  }
  themeSelect.addEventListener("change", () => {
    try { localStorage.setItem("letterhive-theme", themeSelect.value); } catch {}
    applyTheme();
  });
  systemTheme?.addEventListener?.("change", applyTheme);
  applyTheme();
  const controls = document.querySelectorAll(".hex, .actions button, .puzzleNav button, #hintBtn");
  controls.forEach((button) => (button.disabled = true));
  const [response, rotationResponse] = await Promise.all([
    fetch("data/puzzles.json"),
    fetch("data/daily-rotation.json"),
  ]);
  if (!response.ok) throw new Error("Puzzle data unavailable");
  const { puzzles } = await response.json();
  if (!Array.isArray(puzzles) || !puzzles.length) {
    throw new Error("Invalid puzzle data");
  }
  const { clues: semanticClues } = await fetch("data/hints.json")
    .then((result) => result.ok ? result.json() : {})
    .then((data) => data ?? {})
    .catch(() => ({}));
  if (!rotationResponse.ok) throw new Error("Daily rotation unavailable");
  const { archiveStart, puzzleIds } = await rotationResponse.json();
  const now = new Date();
  const dayKey = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
  const dayMilliseconds = 86400000;
  const dayNumber = Math.floor(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / dayMilliseconds,
  );
  const byId = new Map(puzzles.map((puzzle) => [puzzle.id, puzzle]));
  if (!Array.isArray(puzzleIds) || !puzzleIds.length || puzzleIds.some((id) => !byId.has(id))) {
    throw new Error("Invalid daily rotation");
  }
  const puzzleForDay = (day) => byId.get(puzzleIds[(day % puzzleIds.length + puzzleIds.length) % puzzleIds.length]);
  const dailyPuzzle = puzzleForDay(dayNumber);
  const archiveEnd = new Date((dayNumber - 1) * dayMilliseconds).toISOString().slice(0, 10);
  const formatArchiveDate = (date) => new Date(date).toLocaleDateString(undefined, {
    timeZone: "UTC", day: "numeric", month: "short", year: "numeric",
  });
  function archivedPuzzle(date) {
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        date < archiveStart || date > archiveEnd) return null;
    const timestamp = Date.parse(date);
    if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== date) return null;
    return puzzleForDay(timestamp / dayMilliseconds);
  }
  function readSaved(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
    } catch {
      return fallback;
    }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  }
  const savedSession = readSaved("letterhive-session-v1", {});
  const validIds = (value) => Array.isArray(value) ? value.filter((id) => byId.has(id)) : [];
  const history = [];
  if (savedSession?.dayKey === dayKey && Array.isArray(savedSession.history)) {
    for (const item of savedSession.history) {
      // Older sessions stored only puzzle IDs.
      const id = typeof item === "string" ? item : item?.id;
      if (!byId.has(id)) continue;
      const date = archivedPuzzle(item?.date)?.id === id ? item.date : null;
      history.push({ id, date });
    }
  }
  let seen = new Set(validIds(savedSession?.seen));
  const progress = new Map();
  let current, currentArchiveDate, center, outer, available, dictionary, total, storageKey;
  let guess = "", found = [];
  let hintTarget, hintLevels;
  const isPangram = (word) => [...available].every((letter) => word.includes(letter));
  const score = (word) => (word.length === 4 ? 1 : word.length) + (isPangram(word) ? 7 : 0);

  // Old saves were keyed only by date, using the original four-puzzle rotation.
  // Move today's answers to their actual letter set, even if today's new daily
  // puzzle is different. Leave the original save untouched.
  const legacyIds = ["o-acelrt", "i-aelnrt", "m-aeinrt", "l-aceort"];
  const legacyPuzzle = byId.get(legacyIds[dayNumber % legacyIds.length]);
  if (legacyPuzzle && readSaved("letterhive-puzzle-" + legacyPuzzle.id, null) === null) {
    const legacy = readSaved("letterhive-v2-" + dayKey, null)
      ?? readSaved("letterhive-v1-" + dayKey, []);
    if (Array.isArray(legacy) && legacy.length) {
      save("letterhive-puzzle-" + legacyPuzzle.id,
        [...new Set(legacy.filter((word) => legacyPuzzle.words.includes(word)))]);
    }
  }
  const played = new Set(validIds(savedSession?.played));
  if (!Array.isArray(savedSession?.played)) {
    // Older saves may still have a visited ID or saved words after history resets.
    for (const puzzle of puzzles) {
      const savedWords = readSaved("letterhive-puzzle-" + puzzle.id, null);
      if (Array.isArray(savedWords) && savedWords.length) played.add(puzzle.id);
    }
    for (const id of seen) played.add(id);
    for (const item of history) played.add(item.id);
  }
  function saveSession() {
    save("letterhive-session-v1", { dayKey, history, seen: [...seen], played: [...played] });
  }
  $("today").textContent = now.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const tiles = [...document.querySelectorAll(".hex.outer")];
  function paintTiles() {
    tiles.forEach((tile, i) => {
      tile.textContent = outer[i].toUpperCase();
      tile.setAttribute("aria-label", "Letter " + outer[i].toUpperCase());
    });
  }
  function paintGuess() {
    const el = $("typed");
    el.replaceChildren();
    for (const ch of guess) {
      const node = document.createElement("span");
      node.textContent = ch.toUpperCase();
      if (ch === center) node.className = "center";
      el.append(node);
    }
    $("cursor").hidden = guess.length > 0;
  }
  const ranks = [
    "Beginner",
    "Good Start",
    "Moving Up",
    "Good",
    "Solid",
    "Nice",
    "Great",
    "Amazing",
    "Genius",
    "Queen Bee",
  ];
  const hintUnlockLevel = 2;
  const rankThreshold = (level) => Math.ceil(total * level / (ranks.length - 1));
  let rankLevel = 0;

  function paintRankBar(bar) {
    bar.replaceChildren();
    ranks.forEach((rank, level) => {
      const segment = document.createElement("i");
      segment.title = `${rank} · ${rankThreshold(level)} points`;
      if (level <= rankLevel) segment.className = "done";
      bar.append(segment);
    });
  }
  function paintScore() {
    const n = found.reduce((sum, w) => sum + score(w), 0);
    rankLevel = ranks.findLastIndex((_, level) => n >= rankThreshold(level));
    $("points").textContent = n;
    $("rank").textContent = ranks[rankLevel];
    $("count").textContent =
      found.length + " word" + (found.length === 1 ? "" : "s");
    paintRankBar($("progress"));
    paintRankBar($("ranks"));
    $("next").textContent =
      rankLevel === ranks.length - 1
        ? "Perfect! You found every word."
        : `Next rank at ${rankThreshold(rankLevel + 1)} points · ${total} possible`;
    const preview = $("foundPreview");
    preview.replaceChildren();
    for (const word of [...found].reverse()) {
      const item = document.createElement("span");
      item.textContent = word + (isPangram(word) ? " ★" : "");
      preview.append(item);
    }
    if (!found.length) preview.textContent = "No words yet";
    preview.scrollLeft = 0;

    const list = $("found");
    list.replaceChildren();
    if (!found.length) {
      const node = document.createElement("div");
      node.className = "empty";
      node.textContent =
        "Your discoveries will appear here. Start with any four-letter word!";
      list.append(node);
    } else {
      for (const w of [...found].sort()) {
        const node = document.createElement("span");
        node.textContent = w + (isPangram(w) ? " ★" : "");
        list.append(node);
      }
    }
  }
  let messageTimeout;
  function feedback(msg) {
    $("message").textContent = msg;
    clearTimeout(messageTimeout);
    messageTimeout = setTimeout(() => ($("message").textContent = ""), 2300);
  }
  const strongestHint = 2;
  function hintStorageKey() {
    return "letterhive-hints-" + current.id;
  }
  function loadHints() {
    const saved = readSaved(hintStorageKey(), {});
    const levels = saved?.levels;
    hintLevels = new Map();
    for (const word of dictionary) {
      const level = levels?.[word];
      if (Number.isInteger(level) && level >= 1 && level <= 3) {
        hintLevels.set(word, Math.min(level, strongestHint));
      }
    }
    hintTarget = hintLevels.has(saved?.target) && !found.includes(saved.target)
      ? saved.target : null;
  }
  function saveHints() {
    save(hintStorageKey(), { target: hintTarget, levels: Object.fromEntries(hintLevels) });
  }
  function missingWords() {
    const solved = new Set(found);
    return [...dictionary].filter((word) => !solved.has(word));
  }
  function selectHint(pangramsOnly = false) {
    if (rankLevel < hintUnlockLevel) return;
    const missing = missingWords();
    const eligible = pangramsOnly ? missing.filter(isPangram) : missing;
    if (pangramsOnly && eligible.length === 0) return;
    const alternatives = eligible.filter((word) => word !== hintTarget);
    const options = alternatives.length ? alternatives : eligible;
    const unseen = options.filter((word) => !hintLevels.has(word));
    const reviewed = unseen.filter((word) => semanticClues?.[word]?.gentle);
    const choices = reviewed.length ? reviewed : unseen.length ? unseen : options;
    hintTarget = choices[Math.floor(Math.random() * choices.length)] ?? null;
    if (hintTarget && !hintLevels.has(hintTarget)) hintLevels.set(hintTarget, 1);
    saveHints();
    paintHint(missing, true);
  }
  function paintHint(missing = missingWords(), requested = false) {
    const locked = rankLevel < hintUnlockLevel;
    const level = locked ? undefined : hintLevels.get(hintTarget);
    const clue = $("puzzleClue");
    let text = "";
    if (locked) {
      text = `Hints unlock at ${ranks[hintUnlockLevel]} (${rankThreshold(hintUnlockLevel)} points).`;
    } else if (level) {
      text = describeHint(hintTarget, level);
    } else if (requested && !missing.length) {
      text = "You’ve found every word!";
    }
    if (clue.textContent !== text) {
      clue.textContent = text;
      clue.scrollTop = 0;
    }
    clue.tabIndex = text ? 0 : -1;

    const hintButton = $("hintBtn");
    const hintLabel = level ? "Different hint" : "Hint";
    hintButton.setAttribute("aria-label", hintLabel);
    hintButton.title = hintLabel;
    $("hintIcon").hidden = Boolean(level);
    $("differentHintIcon").hidden = !level;
    hintButton.disabled = locked || Boolean(level && missing.length < 2);
    $("pangramHint").hidden = !missing.some(isPangram);
    $("pangramHint").disabled = locked;
    $("strongerHint").hidden = !level;
    $("strongerHint").disabled = !level || level === strongestHint;
  }
  function describeHint(word, level) {
    const prefix = word.slice(0, level).toUpperCase();
    const start = `${word.length} letters, ${prefix}—:`;
    const reviewed = semanticClues?.[word];
    const definition = level === 1 ? reviewed?.gentle : reviewed?.stronger;
    if (typeof definition === "string" && definition && !definition.toLowerCase().includes(word)) {
      return `${start} ${definition}`;
    }
    const repeats = new Set(word).size < word.length
      ? "Repeated symbols." : "All symbols distinct.";
    if (level === 1) return `${start} ${repeats}`;
    const vowels = [...word].filter((letter) => "aeiou".includes(letter)).length;
    return `${start} Contains ${vowels} ${vowels === 1 ? "vowel" : "vowels"} (A, E, I, O, U).`;
  }
  function add(ch) {
    if (guess.length >= 30) {
      feedback("That word is too long");
      return;
    }
    guess += ch;
    paintGuess();
  }
  function remove() {
    guess = guess.slice(0, -1);
    paintGuess();
  }
  function submit() {
    const w = guess.toLowerCase();
    guess = "";
    paintGuess();
    if (w.length < 4) return feedback("Too short");
    if (!w.includes(center)) return feedback("Missing the centre letter");
    if (found.includes(w)) return feedback("Already found");
    if (!dictionary.has(w)) return feedback("Not in this puzzle’s dictionary");
    found.push(w);
    if (w === hintTarget) {
      hintTarget = null;
      saveHints();
    }
    progress.set(current.id, [...found]);
    save(storageKey, found);
    paintScore();
    paintHint();
    feedback((isPangram(w) ? "★ Pangram! " : "Nice! ") + "+" + score(w));
  }
  function loadPuzzle(puzzle, { date = null, remember = true } = {}) {
    current = puzzle;
    currentArchiveDate = date;
    center = puzzle.center;
    outer = [...puzzle.outer];
    available = new Set(center + puzzle.outer);
    dictionary = new Set(puzzle.words);
    total = puzzle.words.reduce((sum, word) => sum + score(word), 0);
    storageKey = "letterhive-puzzle-" + puzzle.id;
    const saved = progress.get(puzzle.id) ?? readSaved(storageKey, []);
    found = Array.isArray(saved)
      ? [...new Set(saved.filter((word) => dictionary.has(word)))] : [];
    guess = "";
    clearTimeout(messageTimeout);
    $("message").textContent = "";
    loadHints();
    $("center").textContent = center.toUpperCase();
    $("center").setAttribute("aria-label", "Centre letter " + center.toUpperCase());
    const previous = history.at(-1);
    if (remember && (previous?.id !== puzzle.id || previous.date !== date)) {
      history.push({ id: puzzle.id, date });
    }
    if (history.length > puzzles.length * 2) history.shift();
    seen.add(puzzle.id);
    played.delete(puzzle.id);
    played.add(puzzle.id);
    saveSession();
    $("puzzleStatus").textContent = date
      ? formatArchiveDate(date)
      : puzzle.id === dailyPuzzle.id
        ? "Today’s puzzle" : "Puzzle " + (puzzles.indexOf(puzzle) + 1) + " of " + puzzles.length;
    $("dailyPuzzle").disabled = !date && puzzle.id === dailyPuzzle.id;
    $("previousPuzzle").disabled = history.length < 2;
    paintTiles();
    paintGuess();
    paintScore();
    paintHint();
  }
  $("newPuzzle").addEventListener("click", () => {
    let candidates = puzzles.filter((puzzle) => puzzle.id !== current.id && !seen.has(puzzle.id));
    if (!candidates.length) {
      seen = new Set([current.id]);
      candidates = puzzles.filter((puzzle) => puzzle.id !== current.id);
    }
    if (!candidates.length) return;
    // Prefer different letters from the puzzle just played.
    const overlap = (puzzle) => [...(puzzle.center + puzzle.outer)].filter((letter) => available.has(letter)).length;
    const minimum = Math.min(...candidates.map(overlap));
    candidates = candidates.filter((puzzle) => overlap(puzzle) === minimum);
    loadPuzzle(candidates[Math.floor(Math.random() * candidates.length)]);
  });
  $("dailyPuzzle").addEventListener("click", () => loadPuzzle(dailyPuzzle));
  $("previousPuzzle").addEventListener("click", () => {
    if (history.length < 2) return;
    history.pop();
    const previous = history.at(-1);
    loadPuzzle(byId.get(previous.id), { date: previous.date, remember: false });
  });
  const archiveDialog = $("archiveDialog");
  const archiveInput = $("archiveDate");
  const playedSelect = $("playedPuzzle");
  function paintPlayedPuzzles() {
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Choose a played puzzle";
    playedSelect.replaceChildren();
    playedSelect.append(placeholder);
    for (const id of [...played].reverse()) {
      const puzzle = byId.get(id);
      const option = document.createElement("option");
      option.value = id;
      option.textContent = `Puzzle ${puzzles.indexOf(puzzle) + 1} · ${puzzle.center.toUpperCase()} + ${puzzle.outer.toUpperCase()}`;
      playedSelect.append(option);
    }
    playedSelect.value = "";
  }
  $("archiveBtn").addEventListener("click", () => {
    archiveInput.value = currentArchiveDate || archiveEnd;
    $("archiveError").textContent = "";
    paintPlayedPuzzles();
    archiveDialog.showModal();
  });
  $("archiveCancel").addEventListener("click", () => archiveDialog.close());
  $("archiveForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const date = archiveInput.value;
    const puzzle = archivedPuzzle(date);
    if (!puzzle) {
      $("archiveError").textContent = "Choose a date in the archive range.";
      archiveInput.focus();
      return;
    }
    loadPuzzle(puzzle, { date });
    archiveDialog.close();
  });
  $("playedPuzzleForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const id = playedSelect.value;
    if (!played.has(id)) return;
    loadPuzzle(byId.get(id));
    archiveDialog.close();
  });
  $("center").addEventListener("click", () => add(center));
  tiles.forEach((tile, i) =>
    tile.addEventListener("click", () => add(outer[i])),
  );
  $("hintBtn").addEventListener("click", () => selectHint());
  $("pangramHint").addEventListener("click", () => selectHint(true));
  $("strongerHint").addEventListener("click", () => {
    const level = hintLevels.get(hintTarget);
    if (rankLevel < hintUnlockLevel || !level || level >= strongestHint) return;
    hintLevels.set(hintTarget, level + 1);
    saveHints();
    paintHint();
    $("puzzleClue").focus({ preventScroll: true });
  });
  $("delete").addEventListener("click", remove);
  $("enter").addEventListener("click", submit);
  $("shuffle").addEventListener("click", () => {
    for (let i = outer.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [outer[i], outer[j]] = [outer[j], outer[i]];
    }
    paintTiles();
  });
  document.addEventListener("keydown", (e) => {
    if (
      $("help").open ||
      archiveDialog.open ||
      $("wordsDialog").open ||
      e.altKey ||
      e.ctrlKey ||
      e.metaKey ||
      e.target.matches("input,textarea,select")
    )
      return;
    if (e.target.matches("button") && (e.key === "Enter" || e.key === " ")) return;
    const ch = e.key.toLowerCase();
    if (ch.length === 1 && available.has(ch)) {
      e.preventDefault();
      add(ch);
    } else if (e.key === "Backspace") {
      e.preventDefault();
      remove();
    } else if (e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  });
  function openFoundWords() {
    const dialog = $("wordsDialog");
    const panel = $("wordPanel");
    const credits = $("credits");
    const content = panel.parentElement;
    const wrap = credits.parentElement;
    const body = $("wordsDialogBody");
    body.append(panel, credits);
    body.scrollTop = 0;
    dialog.addEventListener("close", () => {
      content.append(panel);
      wrap.append(credits);
    }, { once: true });
    dialog.showModal();
    $("foundHeading").focus();
  }
  $("wordsBtn").addEventListener("click", openFoundWords);
  $("expandWordsBtn").addEventListener("click", openFoundWords);
  $("howBtn").addEventListener("click", () => $("help").showModal());
  $("closeHelp").addEventListener("click", () => $("help").close());
  controls.forEach((button) => (button.disabled = false));
  const archiveAvailable = archiveEnd >= archiveStart;
  $("archiveDailySection").hidden = !archiveAvailable;
  archiveInput.min = archiveStart;
  archiveInput.max = archiveEnd;
  if (archiveAvailable) {
    $("archiveRange").textContent = `Available from ${formatArchiveDate(archiveStart)} to ${formatArchiveDate(archiveEnd)}.`;
  }
  const last = history.at(-1);
  loadPuzzle(last ? byId.get(last.id) : dailyPuzzle, { date: last?.date });
})().catch(() => {
  document.getElementById("message").textContent =
    "Couldn’t load the puzzle. Check your connection and reload.";
});
