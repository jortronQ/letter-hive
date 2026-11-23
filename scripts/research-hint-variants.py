"""Suggest WordNet matches for unreviewed answers; never add clues automatically."""

import argparse
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
import unicodedata
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]


def possible_roots(word):
    """Offer regular-form hypotheses, not verified word or sense equivalences."""
    candidates = []
    for suffix, replacement in (("s", ""), ("es", ""), ("ies", "y")):
        if word.endswith(suffix):
            candidates.append((word[:-len(suffix)] + replacement, "plural/third-person"))
    for suffix, relation in (("ed", "past"), ("ing", "participle"),
                             ("er", "comparative"), ("est", "superlative")):
        if word.endswith(suffix):
            stem = word[:-len(suffix)]
            candidates.extend(((stem, relation), (stem + "e", relation)))
            if len(stem) > 1 and stem[-1] == stem[-2]:
                candidates.append((stem[:-1], relation))
            if stem.endswith("i"):
                candidates.append((stem[:-1] + "y", relation))
    return list(dict.fromkeys(candidates))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--wordnet-zip", type=Path, required=True)
    parser.add_argument("--output", type=Path, help="Write the full candidate report as development JSON")
    parser.add_argument("--limit", type=int, default=30, help="Maximum headword suggestions to print")
    args = parser.parse_args()
    hints = json.loads((ROOT / "data/hints.json").read_text())
    with args.wordnet_zip.open("rb") as stream:
        if hashlib.file_digest(stream, "sha256").hexdigest() != hints["source"]["sha256"]:
            raise ValueError("WordNet archive checksum does not match data/hints.json")
    puzzles = json.loads((ROOT / "data/puzzles.json").read_text())["puzzles"]
    frequency = Counter(word for puzzle in puzzles for word in puzzle["words"])
    remaining = set(frequency) - set(hints["clues"])
    entries, definitions = {}, {}
    with ZipFile(args.wordnet_zip) as archive:
        for name in archive.namelist():
            if not name.endswith(".json"):
                continue
            data = json.loads(archive.read(name))
            if name.startswith("entries-"):
                entries.update(data)
            else:
                definitions.update({key: value["definition"] for key, value in data.items()
                                    if isinstance(value, dict) and value.get("definition")})

    def senses(part):
        return [{"synset": sense["synset"], "definitions": definitions[sense["synset"]]}
                for sense in part.get("sense", []) if sense["synset"] in definitions]

    groups = {key: defaultdict(list) for key in (
        "listed_inflections", "punctuation_variants", "other_normalisation_candidates", "regular_form_hypotheses")}
    for lemma, parts in sorted(entries.items()):
        simple = "".join(c for c in unicodedata.normalize("NFKD", lemma.casefold()) if "a" <= c <= "z")
        punctuation_only = lemma.replace("-", "").replace(" ", "")
        for pos, part in parts.items():
            meanings = senses(part)
            if not meanings:
                continue
            option = {"lemma": lemma, "pos": pos, "senses": meanings}
            for form in part.get("form", []):
                if form in remaining:
                    groups["listed_inflections"][form].append(option)
            if simple in remaining and simple != lemma:
                group = "punctuation_variants" if punctuation_only == simple else "other_normalisation_candidates"
                groups[group][simple].append(option)
    for word in sorted(remaining):
        for lemma, relation in possible_roots(word):
            for pos, part in entries.get(lemma, {}).items():
                allowed = {"n", "v"} if relation == "plural/third-person" else (
                    {"v"} if relation in ("past", "participle") else {"a", "s", "r"})
                meanings = senses(part)
                if pos in allowed and meanings:
                    groups["regular_form_hypotheses"][word].append({
                        "lemma": lemma, "pos": pos, "relation": relation, "senses": meanings})
    ranked = lambda word: (-frequency[word], len(word), word)
    report = {
        "archive_sha256": hints["source"]["sha256"],
        "unreviewed_answers": len(remaining),
        "note": "Suggestions only. Review spelling, grammatical form, source sense and suitability before adding clues.",
        "groups": {group: {word: options[word] for word in sorted(options, key=ranked)}
                   for group, options in groups.items()},
    }
    union = set().union(*(set(options) for options in groups.values()))
    print(f"Unreviewed answers: {len(remaining):,}; with at least one hypothesis: {len(union):,}.")
    for group, options in report["groups"].items():
        print(f"{group}: {len(options):,} answers (groups overlap).")
        for word, matches in list(options.items())[:max(0, args.limit)]:
            labels = ", ".join(dict.fromkeys(f"{item['lemma']} ({item['pos']})" for item in matches))
            print(f"  {word}: {labels}")
    if args.output:
        args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    main()
