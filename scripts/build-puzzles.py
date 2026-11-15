"""Generate deterministic puzzle answers from the pinned ESDB export; no network needed."""

import argparse
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def playable(word):
    # Check case before normalising: capitalised names must not become answers.
    return isinstance(word, str) and re.fullmatch(r"[a-z]{4,30}", word) is not None


def select_configs(words, settings):
    """Keep legacy puzzles, then choose diverse, playable seven-letter alphabets."""
    configs = list(settings["preserve"])
    signatures = {"".join(sorted(config["center"] + config["outer"])) for config in configs}
    groups = defaultdict(list)
    for word in sorted(words):
        signature = "".join(sorted(set(word)))
        if len(signature) <= 7:
            groups[signature].append(word)
    candidates = {}
    for signature in sorted(groups):
        if len(signature) != 7 or signature in signatures:
            continue
        if not 2 <= len(set(signature) & set("aeiou")) <= 3:
            continue
        if len(set(signature) & set("jqxz")) > 1:
            continue
        # Every candidate alphabet comes from a real pangram. Gather its subsets
        # rather than scanning the entire dictionary for every potential puzzle.
        answers = []
        for bits in range(1, 128):
            subset = "".join(letter for i, letter in enumerate(signature) if bits & (1 << i))
            answers.extend(groups.get(subset, []))
        counts = Counter(letter for word in answers for letter in set(word))
        options = [(center, counts[center]) for center in signature
                   if settings["min_words"] <= counts[center] <= settings["max_words"]]
        if options:
            candidates[signature] = options
    letter_counts = Counter(letter for signature in signatures for letter in signature)
    center_counts = Counter(config["center"] for config in configs)
    while len(signatures) < settings["letter_sets"]:
        if not candidates:
            raise ValueError("Not enough playable letter sets for the requested collection")
        previous = set(configs[-1]["center"] + configs[-1]["outer"])
        ranked = []
        for signature, options in candidates.items():
            center, count = min(options, key=lambda option: (center_counts[option[0]], abs(option[1] - 75), option[0]))
            tie = hashlib.sha256((settings["seed"] + signature + center).encode()).hexdigest()
            rank = (len(set(signature) & previous), center_counts[center],
                    sum(letter_counts[letter] for letter in signature), tie)
            ranked.append((rank, signature, center))
        _, signature, center = min(ranked)
        configs.append({"center": center, "outer": signature.replace(center, "")})
        signatures.add(signature)
        letter_counts.update(signature)
        center_counts.update(center)
        del candidates[signature]
    return configs


def build_puzzles(vocabulary, configs, overrides):
    for group in ("add", "exclude"):
        if not all(playable(word) for word in overrides[group]):
            raise ValueError(f"Every {group} override must contain 4–30 lowercase ASCII letters")
    if set(overrides["add"]) & set(overrides["exclude"]):
        raise ValueError("A word cannot be both added and excluded")
    words = {word for word in vocabulary if playable(word)}
    words.update(overrides["add"])
    words.difference_update(overrides["exclude"])
    if isinstance(configs, dict):
        configs = select_configs(words, configs)
    puzzles = []
    for config in configs:
        center, outer = config["center"], config["outer"]
        letters = center + outer
        if not re.fullmatch(r"[a-z]{7}", letters) or len(center) != 1 or len(set(letters)) != 7:
            raise ValueError("Each puzzle needs seven distinct lowercase letters and one centre letter")
        allowed = set(letters)
        answers = sorted(word for word in words if center in word and set(word) <= allowed)
        if not any(set(word) == allowed for word in answers):
            raise ValueError(f"Puzzle {letters} has no pangram")
        puzzles.append({"id": center + "-" + "".join(sorted(outer)), **config, "words": answers})
    return puzzles


def render():
    source = ROOT / "data/esdb/en-au-60.txt"
    metadata = json.loads((source.parent / "source.json").read_text())
    if hashlib.sha256(source.read_bytes()).hexdigest() != metadata["sha256"]:
        raise ValueError("ESDB export checksum differs from data/esdb/source.json")
    puzzles = build_puzzles(
        source.read_text().splitlines(),
        json.loads((ROOT / "data/puzzle-config.json").read_text()),
        json.loads((ROOT / "data/word-overrides.json").read_text()),
    )
    return json.dumps({
        "source": "ESDB, Australian English, level 60",
        "copyright": ["Copyright 2000-2026 by Kevin Atkinson", "Copyright 2016 by Benjamin Titze"],
        "license": "data/esdb/COPYRIGHT.txt",
        "puzzles": puzzles,
    }, indent=2) + "\n"


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="fail if the bundled puzzle data is stale")
    args = parser.parse_args()
    output = ROOT / "data/puzzles.json"
    generated = render()
    if args.check:
        if not output.is_file() or output.read_text() != generated:
            raise SystemExit("Puzzle data is stale. Run python3 scripts/build-puzzles.py")
        print("Puzzle data is up to date.")
    else:
        output.write_text(generated)
        for puzzle in json.loads(generated)["puzzles"]:
            print(f"{puzzle['center']} / {puzzle['outer']}: {len(puzzle['words'])} words")
