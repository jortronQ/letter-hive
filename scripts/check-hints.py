"""Validate bundled clues, optionally comparing them with the pinned WordNet ZIP."""

import argparse
import hashlib
import json
from pathlib import Path
import re
from zipfile import ZipFile


ROOT = Path(__file__).resolve().parents[1]
REGULAR_RELATIONS = {
    "plural": {"n"}, "third-person": {"v"}, "past": {"v"},
    "participle": {"v"}, "comparative": {"a", "s", "r"}, "superlative": {"a", "s", "r"},
}


def without_word_separators(word):
    return re.sub(r"[- ]", "", word)


def regular_forms(lemma, pos, relation):
    """Conservative spelling guards for reviewed mappings, not a lemmatiser."""
    if pos not in REGULAR_RELATIONS.get(relation, ()) or not re.fullmatch(r"[a-z]+", lemma):
        return set()
    consonant_y = len(lemma) > 1 and lemma.endswith("y") and lemma[-2] not in "aeiou"
    if relation in ("plural", "third-person"):
        if consonant_y:
            return {lemma[:-1] + "ies"}
        if lemma.endswith(("s", "x", "z", "ch", "sh")):
            return {lemma + "es"}
        if lemma.endswith("o"):
            return {lemma + "s", lemma + "es"}
        return {lemma + "s"}
    suffix = {"past": "ed", "participle": "ing", "comparative": "er", "superlative": "est"}[relation]
    if relation == "participle" and lemma.endswith("ie"):
        return {lemma[:-2] + "ying"}
    if relation != "participle" and consonant_y:
        return {lemma[:-1] + "i" + suffix}
    if lemma.endswith("e"):
        if relation == "participle" and lemma.endswith(("ee", "oe", "ye")):
            return {lemma + suffix}
        return {lemma[:-1] + suffix}
    forms = {lemma + suffix}
    if (len(lemma) >= 3 and lemma[-1] not in "aeiouwxy"
            and lemma[-2] in "aeiou" and lemma[-3] not in "aeiou"):
        forms.add(lemma + lemma[-1] + suffix)
    if lemma.endswith("c") and relation in ("past", "participle"):
        forms.add(lemma + "k" + suffix)
    return forms


def check_clues(accepted, clues):
    for word, entry in clues.items():
        if word not in accepted:
            raise ValueError(f"{word!r} is not an accepted answer")
        if "source" in entry:
            source = entry["source"]
            if (not isinstance(source, dict)
                    or any(not isinstance(source.get(key), str) or not source[key].strip()
                           for key in ("name", "definition"))):
                raise ValueError(f"{word!r} is missing its definition source or source text")
            if any(key in entry for key in ("synset", "lemma", "relation")):
                raise ValueError(f"{word!r} mixes a separate definition source with a WordNet synset")
        elif not isinstance(entry.get("synset"), str) or not entry["synset"]:
            raise ValueError(f"{word!r} is missing a synset ID")
        if "lemma" in entry or "relation" in entry:
            lemma = entry.get("lemma")
            if not isinstance(lemma, str) or not lemma.strip() or lemma == word:
                raise ValueError(f"{word!r} is missing a distinct WordNet headword")
            if entry.get("relation") not in {"inflection", "punctuation", *REGULAR_RELATIONS}:
                raise ValueError(f"{word!r} has an unsupported WordNet relationship")
            if entry["relation"] == "punctuation" and without_word_separators(lemma) != word:
                raise ValueError(f"{word!r} is not a punctuation variant of {lemma!r}")
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

    lemmas = {entry["lemma"] for entry in clues.values() if "lemma" in entry}
    senses = {}
    inflections = {}
    headwords = {}
    defined = set()
    with ZipFile(path) as archive:
        for name in archive.namelist():
            if not name.endswith(".json"):
                continue
            with archive.open(name) as stream:
                entries = json.load(stream)
            if name.startswith("entries-"):
                for word, parts in entries.items():
                    if word in accepted or word in lemmas:
                        if word in lemmas:
                            headwords[word] = parts
                        senses.setdefault(word, set()).update(
                            sense["synset"]
                            for part in parts.values()
                            for sense in part.get("sense", [])
                        )
                        for part in parts.values():
                            for form in part.get("form", []):
                                if form in accepted:
                                    inflections.setdefault((word, form), set()).update(
                                        sense["synset"] for sense in part.get("sense", [])
                                    )
            else:
                defined.update(
                    key for key, entry in entries.items()
                    if isinstance(entry, dict) and entry.get("definition")
                )

    for word, entry in clues.items():
        if "source" in entry:
            continue
        synset = entry["synset"]
        lemma = entry.get("lemma", word)
        if synset not in senses.get(lemma, ()) or synset not in defined:
            raise ValueError(f"{word!r} has no definition under {lemma!r} for synset {synset}")
        if entry.get("relation") == "inflection" and synset not in inflections.get((lemma, word), ()):
            raise ValueError(f"{word!r} is not a listed form for {lemma!r} and synset {synset}")
        relation = entry.get("relation")
        if relation in REGULAR_RELATIONS:
            valid = any(
                word in regular_forms(lemma, pos, relation)
                and (relation != "plural" or not part.get("form") or word in part["form"])
                and any(sense["synset"] == synset for sense in part.get("sense", []))
                for pos, part in headwords.get(lemma, {}).items()
            )
            if not valid:
                raise ValueError(f"{word!r} is not a supported {relation} of {lemma!r} for synset {synset}")

    matches = sum(bool(ids & defined) for word, ids in senses.items() if word in accepted)
    print(f"WordNet definitions by exact spelling: {matches:,}/{len(accepted):,}.")
    mapped = sum("lemma" in entry for entry in clues.values())
    if mapped:
        print(f"Reviewed WordNet headword mappings: {mapped:,}.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--wordnet-zip", type=Path)
    args = parser.parse_args()
    puzzles = json.loads((ROOT / "data/puzzles.json").read_text())["puzzles"]
    accepted = {word for puzzle in puzzles
                for word in puzzle["words"] + puzzle.get("threeLetterWords", [])}
    data = json.loads((ROOT / "data/hints.json").read_text())
    check_clues(accepted, data["clues"])
    if args.wordnet_zip:
        check_archive(args.wordnet_zip, data["source"], accepted, data["clues"])
    covered_puzzles = sum(any(word in data["clues"] for word in puzzle["words"]) for puzzle in puzzles)
    print(f"Reviewed clues: {len(data['clues'])} words across {covered_puzzles}/{len(puzzles)} puzzles.")


if __name__ == "__main__":
    main()
