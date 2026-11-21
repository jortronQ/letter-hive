"""Validate bundled clues, optionally comparing them with the pinned WordNet ZIP."""

import argparse
import hashlib
import json
from pathlib import Path
from zipfile import ZipFile


ROOT = Path(__file__).resolve().parents[1]


def check_clues(accepted, clues):
    for word, entry in clues.items():
        if word not in accepted:
            raise ValueError(f"{word!r} is not an accepted answer")
        if not isinstance(entry.get("synset"), str) or not entry["synset"]:
            raise ValueError(f"{word!r} is missing a synset ID")
        for level in ("gentle", "stronger"):
            clue = entry.get(level)
            if not isinstance(clue, str) or not clue.strip() or word in clue.casefold():
                raise ValueError(f"{word!r} has a missing or revealing {level} clue")
        if entry["gentle"].strip() == entry["stronger"].strip():
            raise ValueError(f"{word!r} uses the same clue twice")


def check_archive(path, source, accepted, clues):
    with path.open("rb") as stream:
        if hashlib.file_digest(stream, "sha256").hexdigest() != source["sha256"]:
            raise ValueError("WordNet archive checksum does not match data/hints.json")

    senses = {}
    defined = set()
    with ZipFile(path) as archive:
        for name in archive.namelist():
            if not name.endswith(".json"):
                continue
            with archive.open(name) as stream:
                entries = json.load(stream)
            if name.startswith("entries-"):
                for word, parts in entries.items():
                    if word in accepted:
                        senses.setdefault(word, set()).update(
                            sense["synset"]
                            for part in parts.values()
                            for sense in part.get("sense", [])
                        )
            else:
                defined.update(
                    key for key, entry in entries.items()
                    if isinstance(entry, dict) and entry.get("definition")
                )

    for word, entry in clues.items():
        synset = entry["synset"]
        if synset not in senses.get(word, ()) or synset not in defined:
            raise ValueError(f"{word!r} does not have a definition for synset {synset}")

    matches = sum(bool(ids & defined) for ids in senses.values())
    print(f"WordNet definitions by exact spelling: {matches:,}/{len(accepted):,}.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--wordnet-zip", type=Path)
    args = parser.parse_args()
    puzzles = json.loads((ROOT / "data/puzzles.json").read_text())["puzzles"]
    accepted = {word for puzzle in puzzles for word in puzzle["words"]}
    data = json.loads((ROOT / "data/hints.json").read_text())
    check_clues(accepted, data["clues"])
    if args.wordnet_zip:
        check_archive(args.wordnet_zip, data["source"], accepted, data["clues"])
    covered_puzzles = sum(any(word in data["clues"] for word in puzzle["words"]) for puzzle in puzzles)
    print(f"Reviewed clues: {len(data['clues'])} words across {covered_puzzles}/{len(puzzles)} puzzles.")


if __name__ == "__main__":
    main()
