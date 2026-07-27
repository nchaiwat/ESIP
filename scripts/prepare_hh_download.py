from __future__ import annotations

import argparse
from datetime import date
from pathlib import Path


def prepare_hh_folder(root: Path, download_date: date) -> Path:
    folder = root / "SourceFiles" / "HH" / "incoming" / download_date.isoformat()
    folder.mkdir(parents=True, exist_ok=True)
    return folder.resolve()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--date", type=date.fromisoformat, default=date.today())
    args = parser.parse_args()
    print(prepare_hh_folder(args.root.resolve(), args.date))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
