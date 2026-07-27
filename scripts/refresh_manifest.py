from datetime import date
from pathlib import Path

from esip.manifest import refresh_manifest


root = Path(__file__).resolve().parents[1]
count = refresh_manifest(
    root,
    root / "SourceFiles" / "source_manifest.csv",
    date.today().isoformat(),
)
print(f"Manifest refreshed: {count} governed input files")
