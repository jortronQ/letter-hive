"""Refresh the vendored vocabulary from a checkout of the pinned ESDB revision."""

import hashlib
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
REVISION = "1e5b7d3a72f47a71da5d28686c1dd4b397178485"
OPTIONS = ["word-list", "60", "D", "1", "--deaccent", "--wo-poses=abbr",
           "--categories=", "--wo-pos-categories=nonword,wordpart"]


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python3 scripts/import-esdb.py /path/to/esdb-checkout")
    checkout = Path(sys.argv[1]).resolve()
    revision = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=checkout, text=True).strip()
    if revision != REVISION:
        raise SystemExit(f"Expected ESDB revision {REVISION}; got {revision}")
    if subprocess.check_output(["git", "status", "--porcelain", "--untracked-files=no"], cwd=checkout):
        raise SystemExit("ESDB source checkout has modified tracked files")
    subprocess.run(["make"], cwd=checkout, check=True)
    exported = subprocess.check_output([sys.executable, "scowl", *OPTIONS], cwd=checkout, text=True)
    destination = ROOT / "data/esdb"
    destination.mkdir(parents=True, exist_ok=True)
    # Preserve the complete upstream export. Game-specific filtering happens in build-puzzles.py.
    vocabulary = "\n".join(sorted(set(exported.splitlines()))) + "\n"
    (destination / "en-au-60.txt").write_text(vocabulary)
    (destination / "COPYRIGHT.txt").write_bytes((checkout / "Copyright").read_bytes())
    metadata = {
        "repository": "https://github.com/en-wl/wordlist",
        "revision": REVISION,
        "size": 60,
        "spelling": "D (Australian English)",
        "variant_level": 1,
        "export_command": ["python3", "scowl", *OPTIONS],
        "sha256": hashlib.sha256(vocabulary.encode()).hexdigest(),
        "entries": len(vocabulary.splitlines()),
    }
    (destination / "source.json").write_text(json.dumps(metadata, indent=2) + "\n")
    print(f"Imported {metadata['entries']} ESDB entries.")


if __name__ == "__main__":
    main()
