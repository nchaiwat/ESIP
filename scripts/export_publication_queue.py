from pathlib import Path

from esip.publication_governance import export_publication_queue


root = Path(__file__).resolve().parents[1]
total, ready = export_publication_queue(root)
print(f"Publication readiness: {ready} ready, {total - ready} blocked, {total} total")
