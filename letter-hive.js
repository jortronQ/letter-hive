(async () => {
  "use strict";
  const controls = document.querySelectorAll(".hex, .actions button, .puzzleNav button");
  controls.forEach((button) => (button.disabled = true));
  const response = await fetch("data/puzzles.json");
  if (!response.ok) throw new Error("Puzzle data unavailable");
  const { puzzles } = await response.json();
  if (!Array.isArray(puzzles) || !puzzles.length) {
    throw new Error("Invalid puzzle data");
  }
  const $ = (id) => document.getElementById(id);
  const userTheme = (() => {
    try {
      return localStorage.getItem("letterhive-theme");
    } catch {
      return null;
    }
  })();
  const prefersDark =
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  let theme =
    userTheme === "dark" || userTheme === "light"
      ? userTheme
      : prefersDark
        ? "dark"
        : "light";
  function applyTheme() {
    document.documentElement.dataset.theme = theme;
    $("themeBtn").textContent = theme === "dark" ? "☀" : "☾";
    $("themeBtn").title =
      theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
    $("themeBtn").setAttribute("aria-label", $("themeBtn").title);
  }
  $("themeBtn").addEventListener("click", () => {
    theme = theme === "dark" ? "light" : "dark";
    try {
      localStorage.setItem("letterhive-theme", theme);
    } catch {}
    applyTheme();
  });
  applyTheme();
  const now = new Date();
  const dayKey = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
  const dayNumber = Math.floor(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000,
  );
  const dailyPuzzle = puzzles[dayNumber % puzzles.length];
  const byId = new Map(puzzles.map((puzzle) => [puzzle.id, puzzle]));
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
  const history = savedSession?.dayKey === dayKey ? validIds(savedSession.history) : [];
  let seen = new Set(validIds(savedSession?.seen));
  const progress = new Map();
  let current, center, outer, available, dictionary, total, storageKey;
  let guess = "", found = [];
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
  function saveSession() {
    save("letterhive-session-v1", { dayKey, history, seen: [...seen] });
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
  function paintScore() {
    const n = found.reduce((sum, w) => sum + score(w), 0);
    $("points").textContent = n;
    $("progress").style.width =
      (total ? Math.min(100, (100 * n) / total) : 0) + "%";
    const level = n >= total ? 9 : Math.min(8, Math.floor((n / total) * 9));
    $("rank").textContent = ranks[level];
    $("count").textContent =
      found.length + " word" + (found.length === 1 ? "" : "s");
    $("ranks").replaceChildren();
    for (let i = 0; i < 9; i++) {
      const mark = document.createElement("i");
      if (i <= level) mark.className = "done";
      $("ranks").append(mark);
    }
    $("next").textContent =
      level === 9
        ? "Perfect! You found every word."
        : `Next rank at ${Math.ceil(((level + 1) * total) / 9)} points · ${total} possible`;
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
    progress.set(current.id, [...found]);
    save(storageKey, found);
    paintScore();
    feedback((isPangram(w) ? "★ Pangram! " : "Nice! ") + "+" + score(w));
  }
  function loadPuzzle(puzzle, remember = true) {
    current = puzzle;
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
    $("center").textContent = center.toUpperCase();
    $("center").setAttribute("aria-label", "Centre letter " + center.toUpperCase());
    if (remember && history.at(-1) !== puzzle.id) history.push(puzzle.id);
    if (history.length > puzzles.length * 2) history.shift();
    seen.add(puzzle.id);
    saveSession();
    $("puzzleStatus").textContent = puzzle.id === dailyPuzzle.id
      ? "Today’s puzzle" : "Puzzle " + (puzzles.indexOf(puzzle) + 1) + " of " + puzzles.length;
    $("dailyPuzzle").disabled = puzzle.id === dailyPuzzle.id;
    $("previousPuzzle").disabled = history.length < 2;
    paintTiles();
    paintGuess();
    paintScore();
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
    loadPuzzle(byId.get(history.at(-1)), false);
  });
  $("center").addEventListener("click", () => add(center));
  tiles.forEach((tile, i) =>
    tile.addEventListener("click", () => add(outer[i])),
  );
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
      $("wordsDialog").open ||
      e.altKey ||
      e.ctrlKey ||
      e.metaKey ||
      e.target.matches("input,textarea")
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
  loadPuzzle(byId.get(history.at(-1)) || dailyPuzzle);
})().catch(() => {
  document.getElementById("message").textContent =
    "Couldn’t load the puzzle. Check your connection and reload.";
});
