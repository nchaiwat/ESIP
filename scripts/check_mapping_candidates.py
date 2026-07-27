from pathlib import Path

from esip.candidate_quality import evaluate_candidate_quality, write_candidate_quality


root = Path(__file__).resolve().parents[1]
quality = evaluate_candidate_quality(root)
path = write_candidate_quality(root, quality)
print(
    f"Candidate quality: {'PASS' if quality.passed else 'FAIL'}; "
    f"{quality.product_reviewable} reviewable product(s), "
    f"{quality.branch_high_confidence} high-confidence branch(es)"
)
print(f"Report: {path.relative_to(root)}")
for issue in quality.issues:
    print(f"- {issue}")
raise SystemExit(0 if quality.passed else 1)
