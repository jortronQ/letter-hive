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


if __name__ == "__main__":
    unittest.main()
