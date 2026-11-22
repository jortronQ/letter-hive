const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.join(__dirname, "..");
const data = JSON.parse(fs.readFileSync(path.join(root, "data/puzzles.json")));
const hintData = JSON.parse(fs.readFileSync(path.join(root, "data/hints.json")));
const code = fs.readFileSync(path.join(root, "letter-hive.js"), "utf8");

class Element {
  constructor() { this.children = []; this.listeners = {}; this.style = {}; this.attributes = {}; this.textContent = ""; }
  addEventListener(type, fn) { this.listeners[type] = fn; }
  setAttribute(name, value) { this.attributes[name] = value; }
  showModal() { this.open = true; }
  close() { this.open = false; }
  focus() { this.focused = true; }
  replaceChildren() { this.children = []; }
  append(node) { this.children.push(node); }
  matches() { return false; }
}

async function launch(index, fetchOverride, saved = new Map(), systemDark = false) {
  const elements = new Map();
  const get = (id) => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  };
  const tiles = Array.from({ length: 6 }, () => new Element());
  const controls = [get("center"), ...tiles, get("enter"), get("delete"), get("shuffle")];
  get("hintBtn").disabled = true;
  const navigation = [get("newPuzzle"), get("previousPuzzle"), get("dailyPuzzle")];
  const document = {
    documentElement: { dataset: {} },
    getElementById: get,
    querySelectorAll: (selector) => selector === ".hex.outer" ? tiles : [...controls, ...navigation],
    createElement: () => new Element(),
    addEventListener(type, fn) { this[type] = fn; },
  };
  let date = new Date(2026, 0, 1, 12);
  while (Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000) % data.puzzles.length !== index) {
    date.setDate(date.getDate() + 1);
  }
  class Today extends Date { constructor(...args) { super(...(args.length ? args : [date.getTime()])); } }
  const media = { matches: systemDark, addEventListener(_event, listener) { this.change = listener; } };
  await vm.runInNewContext(code, {
    document, Date: Today,
    window: { matchMedia: () => media },
    localStorage: { getItem: (key) => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) },
    fetch: async (url) => {
      if (url === "data/hints.json" && !fetchOverride) {
        return { ok: true, json: async () => structuredClone(hintData) };
      }
      if (fetchOverride) return fetchOverride(url);
      assert.equal(url, "data/puzzles.json");
      return { ok: true, json: async () => structuredClone(data) };
    },
    setTimeout: () => 1, clearTimeout() {},
  });
  return {
    get, controls, navigation, saved,
    get theme() { return document.documentElement.dataset.theme; },
    changeSystemTheme(dark) { media.matches = dark; media.change(); },
    type(word) { for (const key of word) document.keydown({ key, target: new Element(), preventDefault() {} }); },
    submit() { get("enter").listeners.click(); },
    activateWithKeyboard(key) {
      document.keydown({ key, target: { matches: (selector) => selector === "button" },
        preventDefault() { assert.fail("Button activation must keep the browser's default behavior"); } });
    },
  };
}

test("every daily puzzle loads, scores pangrams, rejects duplicates, and restores saved answers", async () => {
  for (let index = 0; index < data.puzzles.length; index++) {
    const game = await launch(index);
    assert.equal(game.get("message").textContent, "");
    assert.ok(game.controls.every((control) => control.disabled === false));
    assert.equal(game.get("hintBtn").disabled, true);
    const puzzle = data.puzzles[index];
    const word = puzzle.words.find((word) => new Set(word).size === 7);
    game.type(word);
    game.submit();
    assert.equal(game.get("points").textContent, word.length + 7);
    assert.equal(game.get("count").textContent, "1 word");
    const total = puzzle.words.reduce((sum, word) => sum + (word.length === 4 ? 1 : word.length) + (new Set(word).size === 7 ? 7 : 0), 0);
    assert.ok(game.get("next").textContent.includes(`${total} possible`));
    game.type(word);
    game.submit();
    assert.equal(game.get("message").textContent, "Already found");
    const restored = await launch(index, undefined, game.saved);
    assert.equal(restored.get("points").textContent, word.length + 7);
  }
});

function currentPuzzle(game) {
  const session = JSON.parse(game.saved.get("letterhive-session-v1"));
  return data.puzzles.find((puzzle) => puzzle.id === session.history.at(-1));
}

test("new puzzles vary letters, save progress independently, resume on reload, and support returning", async () => {
  const game = await launch(0);
  const first = currentPuzzle(game);
  game.activateWithKeyboard("Enter");
  game.activateWithKeyboard(" ");
  const word = first.words[0];
  game.type(word);
  game.submit();
  const points = game.get("points").textContent;
  game.type(first.center.repeat(4));
  game.get("newPuzzle").listeners.click();
  const second = currentPuzzle(game);
  assert.notEqual(second.id, first.id);
  assert.notEqual([...second.center + second.outer].sort().join(""), [...first.center + first.outer].sort().join(""));
  assert.equal(game.get("points").textContent, 0);
  assert.equal(game.get("typed").children.length, 0);
  game.type(second.words[0]);
  game.submit();
  const secondPoints = game.get("points").textContent;
  const restored = await launch(0, undefined, game.saved);
  assert.equal(currentPuzzle(restored).id, second.id);
  assert.equal(restored.get("points").textContent, secondPoints);
  restored.get("previousPuzzle").listeners.click();
  assert.equal(currentPuzzle(restored).id, first.id);
  assert.equal(restored.get("points").textContent, points);
  restored.get("newPuzzle").listeners.click();
  restored.get("dailyPuzzle").listeners.click();
  assert.equal(currentPuzzle(restored).id, first.id);
  assert.equal(restored.get("points").textContent, points);
});

test("new puzzle does not repeat a puzzle until the entire collection is visited", async () => {
  const game = await launch(0);
  const seen = new Set([currentPuzzle(game).id]);
  for (let count = 1; count < data.puzzles.length; count++) {
    game.get("newPuzzle").listeners.click();
    const id = currentPuzzle(game).id;
    assert.ok(!seen.has(id), `Unexpected repeated puzzle ${id}`);
    seen.add(id);
  }
  const previous = currentPuzzle(game).id;
  game.get("newPuzzle").listeners.click();
  assert.notEqual(currentPuzzle(game).id, previous);
});

test("old daily saves migrate to their original letters rather than today's new puzzle", async () => {
  const index = 7;
  let date = new Date(2026, 0, 1, 12);
  while (Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000) % data.puzzles.length !== index) date.setDate(date.getDate() + 1);
  const day = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
  const legacyIndex = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000) % 4;
  const legacy = data.puzzles[legacyIndex];
  const saved = new Map([["letterhive-v2-" + day, JSON.stringify([legacy.words[0], "notaword"])]]);
  const game = await launch(index, undefined, saved);
  assert.equal(game.get("points").textContent, 0);
  assert.deepEqual(JSON.parse(saved.get("letterhive-puzzle-" + legacy.id)), [legacy.words[0]]);
  assert.ok(saved.has("letterhive-v2-" + day));
});

test("progressive hints describe the only missing accepted word without revealing it", async () => {
  const index = data.puzzles.findIndex((puzzle) => puzzle.words.includes("letter"));
  const puzzle = data.puzzles[index];
  const word = "letter";
  const found = puzzle.words.filter((answer) => answer !== word);
  const progressKey = "letterhive-puzzle-" + puzzle.id;
  const hintKey = "letterhive-hints-" + puzzle.id;
  const saved = new Map([[progressKey, JSON.stringify(found)]]);
  const game = await launch(index, undefined, saved);
  const initialPoints = game.get("points").textContent;
  const initialRank = game.get("rank").textContent;
  const clue = game.get("puzzleClue");

  assert.equal(clue.textContent, "");
  assert.equal(game.get("hintBtn").attributes["aria-label"], "Hint");
  assert.equal(game.get("strongerHint").hidden, true);
  game.get("hintBtn").listeners.click();
  assert.equal(game.get("hintBtn").attributes["aria-label"], "Different hint");
  assert.equal(game.get("hintIcon").hidden, true);
  assert.equal(game.get("differentHintIcon").hidden, false);
  assert.equal(game.get("hintBtn").disabled, true);
  assert.equal(clue.textContent, "6 letters, L—: Repeated symbols.");
  assert.equal(JSON.parse(saved.get(hintKey)).target, word);

  game.get("strongerHint").listeners.click();
  assert.match(clue.textContent, /^6 letters, LE—: Contains 2 vowels/);
  assert.equal(game.get("strongerHint").disabled, true);
  assert.equal(JSON.parse(saved.get(hintKey)).levels[word], 2);
  assert.equal(game.get("points").textContent, initialPoints);
  assert.equal(game.get("rank").textContent, initialRank);
  assert.deepEqual(JSON.parse(saved.get(progressKey)), found);

  game.type(word);
  game.submit();
  assert.equal(JSON.parse(saved.get(hintKey)).target, null);
  assert.equal(clue.textContent, "");
  assert.equal(game.get("hintBtn").attributes["aria-label"], "Hint");
  game.get("hintBtn").listeners.click();
  assert.equal(clue.textContent, "You’ve found every word!");
  assert.equal(game.get("pangramHint").hidden, true);
  assert.equal(game.get("rank").textContent, "Queen Bee");
});

test("reviewed clues are reused across puzzles and fall back if hint data is unavailable", async () => {
  const word = "book";
  const puzzles = data.puzzles.filter((puzzle) => puzzle.words.includes(word));
  assert.ok(puzzles.length > 1);

  for (const puzzle of puzzles) {
    const saved = new Map([["letterhive-puzzle-" + puzzle.id,
      JSON.stringify(puzzle.words.filter((answer) => answer !== word))]]);
    const index = data.puzzles.indexOf(puzzle);
    const game = await launch(index, undefined, saved);
    game.get("hintBtn").listeners.click();
    const clue = game.get("puzzleClue");
    assert.equal(clue.textContent, `4 letters, B—: ${hintData.clues[word].gentle}`);
    game.get("strongerHint").listeners.click();
    assert.equal(clue.textContent, `4 letters, BO—: ${hintData.clues[word].stronger}`);

    const fallback = await launch(index, async (url) => {
      if (url === "data/hints.json") throw new Error("Hint data unavailable");
      return { ok: true, json: async () => structuredClone(data) };
    }, saved);
    assert.match(fallback.get("puzzleClue").textContent, /^4 letters, BO—: Contains 2 vowels/);
  }
});

test("another word, pangram filtering, and saved hint levels respect puzzle boundaries", async () => {
  const [puzzle] = data.puzzles;
  const pangram = puzzle.words.find((word) => new Set(word).size === 7);
  const ordinary = puzzle.words.find((word) => new Set(word).size < 7);
  const found = puzzle.words.filter((word) => word !== pangram && word !== ordinary);
  const hintKey = "letterhive-hints-" + puzzle.id;
  const saved = new Map([
    ["letterhive-puzzle-" + puzzle.id, JSON.stringify(found)],
    [hintKey, JSON.stringify({ target: "invented", levels: { invented: 3 }, pangramOnly: false })],
  ]);
  let game = await launch(0, undefined, saved);
  const click = (id) => game.get(id).listeners.click();
  const hints = () => JSON.parse(saved.get(hintKey));

  click("hintBtn");
  const first = hints().target;
  assert.ok([pangram, ordinary].includes(first));
  click("hintBtn");
  assert.notEqual(hints().target, first);
  assert.ok([pangram, ordinary].includes(hints().target));
  for (const word of Object.keys(hints().levels)) {
    assert.ok(puzzle.words.includes(word) && !found.includes(word));
    assert.ok(word.length >= 4 && word.includes(puzzle.center));
    assert.ok([...word].every((letter) => (puzzle.center + puzzle.outer).includes(letter)));
  }

  click("pangramHint");
  assert.equal(hints().target, pangram);
  assert.equal(game.get("pangramHint").hidden, false);
  click("strongerHint");
  assert.equal(hints().levels[pangram], 2);
  const strongerClue = game.get("puzzleClue").textContent;
  game = await launch(0, undefined, saved);
  assert.equal(hints().target, pangram);
  assert.equal(game.get("puzzleClue").textContent, strongerClue);

  click("newPuzzle");
  assert.match(game.get("puzzleClue").textContent, /^Hints unlock at Moving Up/);
  assert.equal(game.get("hintBtn").disabled, true);
  click("previousPuzzle");
  assert.equal(hints().target, pangram);
  assert.equal(game.get("puzzleClue").textContent, strongerClue);

  game.type(pangram);
  game.submit();
  assert.equal(game.get("pangramHint").hidden, true);
  click("hintBtn");
  assert.equal(hints().target, ordinary);
});

test("System follows device changes while saved Light and Dark override them", async () => {
  const saved = new Map();
  const game = await launch(0, undefined, saved, true);
  assert.equal(game.get("themeMode").value, "system");
  assert.equal(game.theme, "dark");
  game.changeSystemTheme(false);
  assert.equal(game.theme, "light");

  for (const mode of ["light", "dark"]) {
    saved.set("letterhive-theme", mode);
    const reloaded = await launch(0, undefined, saved, mode === "light");
    const select = reloaded.get("themeMode");
    assert.equal(select.value, mode);
    reloaded.changeSystemTheme(mode === "light");
    assert.equal(reloaded.theme, mode);

    select.value = "system";
    select.listeners.change();
    assert.equal(saved.get("letterhive-theme"), "system");
    assert.equal(reloaded.theme, mode === "light" ? "dark" : "light");
  }
});

test("both rank bars and hint availability update at the exact Moving Up threshold", async () => {
  const puzzle = data.puzzles[0];
  const points = (word) => (word.length === 4 ? 1 : word.length) + (new Set(word).size === 7 ? 7 : 0);
  const threshold = Math.ceil(puzzle.words.reduce((sum, word) => sum + points(word), 0) * 2 / 9);
  const finishingWord = puzzle.words.find((word) => word.length === 4);
  const combinations = new Map([[0, []]]);
  for (const word of puzzle.words.filter((answer) => answer !== finishingWord)) {
    for (const [n, words] of [...combinations]) {
      const next = n + points(word);
      if (next < threshold && !combinations.has(next)) combinations.set(next, [...words, word]);
    }
  }

  const saved = new Map([["letterhive-puzzle-" + puzzle.id, JSON.stringify(combinations.get(threshold - 1))]]);
  const game = await launch(0, undefined, saved);
  const reached = (id) => game.get(id).children.filter((segment) => segment.className === "done").length;
  assert.equal(game.get("rank").textContent, "Good Start");
  assert.equal(game.get("puzzleClue").textContent, `Hints unlock at Moving Up (${threshold} points).`);
  assert.equal(game.get("hintBtn").disabled, true);
  assert.equal(game.get("pangramHint").disabled, true);
  assert.equal(reached("progress"), 2);
  assert.equal(reached("progress"), reached("ranks"));

  game.type(finishingWord);
  game.submit();
  assert.equal(game.get("rank").textContent, "Moving Up");
  assert.equal(game.get("hintBtn").disabled, false);
  assert.equal(game.get("pangramHint").disabled, false);
  assert.equal(reached("progress"), 3);
  assert.equal(reached("progress"), reached("ranks"));
  assert.deepEqual(game.get("progress").children.map((segment) => segment.title),
    game.get("ranks").children.map((segment) => segment.title));

  const restored = await launch(0, undefined, saved);
  assert.equal(restored.get("hintBtn").disabled, false);
  restored.get("newPuzzle").listeners.click();
  assert.equal(restored.get("hintBtn").disabled, true);
  restored.get("previousPuzzle").listeners.click();
  assert.equal(restored.get("hintBtn").disabled, false);
});

test("loading errors keep game controls disabled and explain how to recover", async () => {
  for (const fetch of [async () => { throw new Error("offline"); }, async () => ({ ok: false }), async () => ({ ok: true, json: async () => ({ puzzles: [] }) })]) {
    const game = await launch(0, fetch);
    assert.match(game.get("message").textContent, /Couldn’t load the puzzle/);
    assert.ok(game.controls.every((control) => control.disabled));
    assert.ok(game.navigation.every((control) => control.disabled));
    assert.equal(game.get("hintBtn").disabled, true);
  }
});
