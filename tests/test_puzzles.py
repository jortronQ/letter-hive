import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("build_puzzles", ROOT / "scripts/build-puzzles.py")
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class PuzzleGenerationTests(unittest.TestCase):
    def test_letter_reuse_centre_and_word_filtering(self):
        words = ["collateral", "collector", "coal", "tall", "cat", "Coal", "co-op", "coals", "café", "cooool"]
        puzzles = builder.build_puzzles(words, [{"center": "o", "outer": "acelrt"}], {"add": [], "exclude": []})
        self.assertEqual(puzzles[0]["words"], ["coal", "collateral", "collector", "cooool"])

    def test_explicit_additions_and_exclusions(self):
        puzzles = builder.build_puzzles(["collateral", "coal"], [{"center": "o", "outer": "acelrt"}],
                                        {"add": ["coco"], "exclude": ["coal"]})
        self.assertEqual(puzzles[0]["words"], ["coco", "collateral"])

    def test_invalid_and_conflicting_overrides_fail(self):
        for overrides in ({"add": ["Coal"], "exclude": []}, {"add": ["coal"], "exclude": ["coal"]}):
            with self.assertRaises(ValueError):
                builder.build_puzzles([], [], overrides)

    def test_missing_pangram_and_duplicate_letters_fail(self):
        for config in ({"center": "o", "outer": "acelrt"}, {"center": "o", "outer": "acelro"}):
            with self.assertRaises(ValueError):
                builder.build_puzzles(["coal"], [config], {"add": [], "exclude": []})

    def test_australian_export_and_generated_answers(self):
        vocabulary = set((ROOT / "data/esdb/en-au-60.txt").read_text().splitlines())
        self.assertIn("colour", vocabulary)
        self.assertNotIn("color", vocabulary)
        self.assertIn("centre", vocabulary)
        puzzles = json.loads(builder.render())["puzzles"]
        for puzzle in puzzles:
            words = puzzle["words"]
            self.assertGreaterEqual(len(words), 40)
            self.assertEqual(words, sorted(set(words)))
            self.assertTrue(any(set(word) == set(puzzle["center"] + puzzle["outer"]) for word in words))
        self.assertEqual(len({"".join(sorted(puzzle["center"] + puzzle["outer"])) for puzzle in puzzles}), 120)
        self.assertEqual(len({puzzle["id"] for puzzle in puzzles}), len(puzzles))
        self.assertGreaterEqual(len({puzzle["center"] for puzzle in puzzles}), 15)
        self.assertGreaterEqual(len(set("".join(puzzle["center"] + puzzle["outer"] for puzzle in puzzles))), 24)
        for puzzle in puzzles[4:]:
            letters = set(puzzle["center"] + puzzle["outer"])
            self.assertLessEqual(len(puzzle["words"]), 150)
            self.assertTrue(2 <= len(letters & set("aeiou")) <= 3)
            self.assertLessEqual(len(letters & set("jqxz")), 1)


if __name__ == "__main__":
    unittest.main()
