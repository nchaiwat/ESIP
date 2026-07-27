from pathlib import Path

from esip.profiles import validate_profiles


def test_workspace_profiles_are_structurally_valid() -> None:
    root = Path(__file__).resolve().parents[1]
    issues = validate_profiles(
        root / "ImportProfiles", root / "config" / "source_registry.yaml"
    )
    assert issues == []
