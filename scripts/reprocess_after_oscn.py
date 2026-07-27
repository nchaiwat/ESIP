from pathlib import Path
import sys

from esip.reprocess import reprocess_if_oscn_changed


root = Path(__file__).resolve().parents[1]
result = reprocess_if_oscn_changed(root, force="--force" in sys.argv)
print(f"OSCN reprocess: {result.status}")
print(result.message)
if result.before and result.after:
    print(
        "PRODUCT_NOT_MAPPED: "
        f"{result.before.product_not_mapped_rows:,} -> "
        f"{result.after.product_not_mapped_rows:,}"
    )
