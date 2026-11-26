import contextlib
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("check_hints", ROOT / "scripts/check-hints.py")
checker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checker)


class HintSourceTests(unittest.TestCase):
    def test_bundled_definitions_cover_default_and_optional_answers(self):
        puzzles = json.loads((ROOT / "data/puzzles.json").read_text())["puzzles"]
        clues = json.loads((ROOT / "data/hints.json").read_text())["clues"]
        accepted = {word for puzzle in puzzles
                    for word in puzzle["words"] + puzzle.get("threeLetterWords", [])}
        self.assertEqual(set(clues), accepted)
        checker.check_clues(accepted, clues)

    def setUp(self):
        self.editorial = {
            "source": {"name": "User-provided definition", "definition": "A member of the Romani people."},
            "gentle": "A historical name for a member of the Romani people.",
            "stronger": "A member of an ethnic group with origins in northern India.",
        }

    def test_separate_definition_source_still_requires_nonrevealing_clues(self):
        checker.check_clues({"gypsy"}, {"gypsy": self.editorial})
        with self.assertRaises(ValueError):
            checker.check_clues(set(), {"gypsy": self.editorial})
        with self.assertRaises(ValueError):
            checker.check_clues({"gypsy"}, {"gypsy": {**self.editorial, "gentle": "A gypsy."}})

    def test_missing_or_conflicting_provenance_is_rejected(self):
        for source in (None, "editorial", {}, {"name": "Editorial"},
                       {"name": " ", "definition": "A definition."},
                       {"name": "Editorial", "definition": " "}):
            with self.subTest(source=source), self.assertRaises(ValueError):
                checker.check_clues({"gypsy"}, {"gypsy": {**self.editorial, "source": source}})
        with self.assertRaises(ValueError):
            checker.check_clues({"gypsy"}, {"gypsy": {**self.editorial, "synset": "00000001-n"}})
        without_source = {key: value for key, value in self.editorial.items() if key != "source"}
        with self.assertRaises(ValueError):
            checker.check_clues({"gypsy"}, {"gypsy": without_source})

    def test_archive_verifies_wordnet_senses_alongside_separate_sources(self):
        with tempfile.TemporaryDirectory() as directory:
            archive = Path(directory) / "wordnet.zip"
            with ZipFile(archive, "w") as stream:
                stream.writestr("entries-b.json", json.dumps({
                    "book": {"n": {"sense": [{"synset": "00000001-n"}]}}
                }))
                stream.writestr("synsets-n.json", json.dumps({
                    "00000001-n": {"definition": ["A written work."]}
                }))
            source = {"sha256": hashlib.sha256(archive.read_bytes()).hexdigest()}
            clues = {"gypsy": self.editorial, "book": {
                "synset": "00000001-n", "gentle": "A written work.", "stronger": "Pages bound together for reading."
            }}
            with contextlib.redirect_stdout(io.StringIO()):
                checker.check_archive(archive, source, set(clues), clues)
            clues["book"]["synset"] = "00000002-n"
            with self.assertRaises(ValueError):
                checker.check_archive(archive, source, set(clues), clues)

    def test_headword_mappings_require_a_distinct_lemma_and_supported_relationship(self):
        clue = {"synset": "00000001-n", "gentle": "A group of organisms.",
                "stronger": "Organisms such as mushrooms and moulds."}
        valid = {**clue, "lemma": "fungus", "relation": "inflection"}
        checker.check_clues({"fungi"}, {"fungi": valid})
        for metadata in ({"lemma": "fungus"}, {"relation": "inflection"},
                         {"lemma": " ", "relation": "inflection"},
                         {"lemma": "fungi", "relation": "inflection"},
                         {"lemma": "fungus", "relation": "guessed"},
                         {"lemma": "fungus", "relation": "punctuation"}):
            with self.subTest(metadata=metadata), self.assertRaises(ValueError):
                checker.check_clues({"fungi"}, {"fungi": {**clue, **metadata}})
        with self.assertRaises(ValueError):
            checker.check_clues({"sung"}, {"sung": {
                **clue, "lemma": "Sung", "relation": "punctuation"}})
        with self.assertRaises(ValueError):
            checker.check_clues({"gypsy"}, {"gypsy": {
                **self.editorial, "lemma": "Romani", "relation": "inflection"}})

    def test_archive_checks_listed_forms_against_the_same_part_of_speech(self):
        with tempfile.TemporaryDirectory() as directory:
            archive = Path(directory) / "wordnet.zip"
            with ZipFile(archive, "w") as stream:
                stream.writestr("entries-g.json", json.dumps({
                    "gin": {
                        "v": {"form": ["ginning"], "sense": [{"synset": "00000001-v"}]},
                        "n": {"sense": [{"synset": "00000002-n"}]},
                    },
                    "bow-wow": {"n": {"sense": [{"synset": "00000003-n"}]}},
                }))
                stream.writestr("synsets.json", json.dumps({
                    "00000001-v": {"definition": ["Separate cotton seeds."]},
                    "00000002-n": {"definition": ["An alcoholic drink."]},
                    "00000003-n": {"definition": ["A dog's bark."]},
                }))
            source = {"sha256": hashlib.sha256(archive.read_bytes()).hexdigest()}
            clues = {
                "ginning": {"lemma": "gin", "relation": "inflection", "synset": "00000001-v",
                            "gentle": "Processing cotton.", "stronger": "Removing seeds from cotton fibres."},
                "bowwow": {"lemma": "bow-wow", "relation": "punctuation", "synset": "00000003-n",
                           "gentle": "An animal's call.", "stronger": "A bark made by a dog."},
            }
            checker.check_clues(set(clues), clues)
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                checker.check_archive(archive, source, set(clues), clues)
            self.assertIn("exact spelling: 0/2", output.getvalue())
            noun_sense = {**clues["ginning"], "synset": "00000002-n"}
            with self.assertRaises(ValueError):
                checker.check_archive(archive, source, {"ginning"}, {"ginning": noun_sense})
            with self.assertRaises(ValueError):
                checker.check_archive(archive, source, {"ginned"}, {"ginned": clues["ginning"]})

    def test_regular_mappings_check_spelling_part_of_speech_and_irregular_plurals(self):
        with tempfile.TemporaryDirectory() as directory:
            archive = Path(directory) / "wordnet.zip"
            entries = {
                "cat": {"n": {"sense": [{"synset": "cat-n"}]}},
                "fox": {"n": {"sense": [{"synset": "fox-n"}]}},
                "carry": {"v": {"sense": [{"synset": "carry-v"}]}},
                "stop": {"v": {"sense": [{"synset": "stop-v"}]}},
                "dance": {"v": {"sense": [{"synset": "dance-v"}]}},
                "happy": {"a": {"sense": [{"synset": "happy-a"}]}},
                "free": {"v": {"form": ["freeing"], "sense": [{"synset": "free-v"}]}},
                "wolf": {
                    "n": {"form": ["wolves"], "sense": [{"synset": "wolf-n"}]},
                    "v": {"sense": [{"synset": "wolf-v"}]},
                },
            }
            definitions = {sense["synset"]: {"definition": ["A source definition."]}
                           for parts in entries.values() for part in parts.values()
                           for sense in part["sense"]}
            with ZipFile(archive, "w") as stream:
                stream.writestr("entries-fixture.json", json.dumps(entries))
                stream.writestr("synsets.json", json.dumps(definitions))
            source = {"sha256": hashlib.sha256(archive.read_bytes()).hexdigest()}

            def clue(lemma, relation, synset):
                return {"lemma": lemma, "relation": relation, "synset": synset,
                        "gentle": "A grammatical form.", "stronger": "A form used in a particular sentence."}

            cases = [
                ("cats", "cat", "plural", "cat-n"), ("foxes", "fox", "plural", "fox-n"),
                ("carried", "carry", "past", "carry-v"), ("carrying", "carry", "participle", "carry-v"),
                ("carries", "carry", "third-person", "carry-v"), ("stopped", "stop", "past", "stop-v"),
                ("stopping", "stop", "participle", "stop-v"), ("danced", "dance", "past", "dance-v"),
                ("dancing", "dance", "participle", "dance-v"), ("happier", "happy", "comparative", "happy-a"),
                ("happiest", "happy", "superlative", "happy-a"), ("freed", "free", "past", "free-v"),
                ("freeing", "free", "participle", "free-v"), ("wolfs", "wolf", "third-person", "wolf-v"),
            ]
            clues = {word: clue(lemma, relation, synset) for word, lemma, relation, synset in cases}
            checker.check_clues(set(clues), clues)
            with contextlib.redirect_stdout(io.StringIO()):
                checker.check_archive(archive, source, set(clues), clues)
            for word, lemma, relation, synset in (
                ("cates", "cat", "plural", "cat-n"), ("cats", "cat", "past", "cat-n"),
                ("carrys", "carry", "third-person", "carry-v"), ("carryed", "carry", "past", "carry-v"),
                ("wolfs", "wolf", "plural", "wolf-n"), ("happier", "happy", "plural", "happy-a"),
            ):
                with self.subTest(word=word, relation=relation), self.assertRaises(ValueError):
                    checker.check_archive(archive, source, {word}, {word: clue(lemma, relation, synset)})


if __name__ == "__main__":
    unittest.main()
