const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.join(__dirname, "..");
const data = JSON.parse(fs.readFileSync(path.join(root, "data/puzzles.json")));
const code = fs.readFileSync(path.join(root, "letter-hive.js"), "utf8");

class Element {
  constructor() { this.children = []; this.listeners = {}; this.style = {}; this.textContent = ""; }
  addEventListener(type, fn) { this.listeners[type] = fn; }
  setAttribute() {}
  replaceChildren() { this.children = []; }
  append(node) { this.children.push(node); }
  matches() { return false; }
}

async function launch(index, fetchOverride, saved = new Map()) {
  const elements = new Map();
  const get = (id) => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  };
  const tiles = Array.from({ length: 6 }, () => new Element());
  const controls = [get("center"), ...tiles, get("enter"), get("delete"), get("shuffle")];
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
  await vm.runInNewContext(code, {
    document, Date: Today,
    window: { matchMedia: () => ({ matches: false }) },
    localStorage: { getItem: (key) => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) },
    fetch: fetchOverride || (async (url) => {
      assert.equal(url, "data/puzzles.json");
      return { ok: true, json: async () => structuredClone(data) };
    }),
    setTimeout: () => 1, clearTimeout() {},
  });
  return {
    get, controls, navigation, saved,
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

test("loading errors keep game controls disabled and explain how to recover", async () => {
  for (const fetch of [async () => { throw new Error("offline"); }, async () => ({ ok: false }), async () => ({ ok: true, json: async () => ({ puzzles: [] }) })]) {
    const game = await launch(0, fetch);
    assert.match(game.get("message").textContent, /Couldn’t load the puzzle/);
    assert.ok(game.controls.every((control) => control.disabled));
    assert.ok(game.navigation.every((control) => control.disabled));
  }
});
