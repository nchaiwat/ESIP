from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml


@dataclass(frozen=True)
class ProfileIssue:
    profile: str
    message: str


def load_yaml(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as stream:
        content = yaml.safe_load(stream)
    if not isinstance(content, dict):
        raise ValueError(f"{path} must contain a YAML mapping")
    return content


def validate_profiles(profile_dir: Path, registry_path: Path) -> list[ProfileIssue]:
    registry = load_yaml(registry_path)
    registered = set(registry.get("sources", {}))
    issues: list[ProfileIssue] = []
    seen: set[str] = set()

    for path in sorted(profile_dir.glob("*.yaml")):
        profile = load_yaml(path)
        source_code = profile.get("source_code")
        label = path.name
        if source_code != path.stem:
            issues.append(ProfileIssue(label, "source_code must match the profile filename"))
        if source_code not in registered:
            issues.append(ProfileIssue(label, f"source_code {source_code!r} is not registered"))
        if source_code in seen:
            issues.append(ProfileIssue(label, f"duplicate profile for {source_code}"))
        seen.add(source_code)
        if not profile.get("profile_version"):
            issues.append(ProfileIssue(label, "profile_version is required"))
        datasets = profile.get("datasets")
        if not isinstance(datasets, dict) or not datasets:
            issues.append(ProfileIssue(label, "at least one dataset is required"))
            continue
        for dataset_name, dataset in datasets.items():
            if not isinstance(dataset, dict):
                issues.append(ProfileIssue(label, f"dataset {dataset_name} must be a mapping"))
                continue
            mapping = dataset.get("mapping")
            if not isinstance(mapping, dict) or not mapping:
                issues.append(ProfileIssue(label, f"dataset {dataset_name} requires mapping"))

    for missing in sorted(registered - seen):
        issues.append(ProfileIssue(missing, "registered source has no import profile"))
    return issues
