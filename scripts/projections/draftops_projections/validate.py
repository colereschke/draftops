from __future__ import annotations

from collections import Counter
from collections.abc import Sequence
from dataclasses import dataclass

from draftops_projections.models import SUPPORTED_POSITIONS, MatchResult, ProjectionRow

MINIMUM_POSITION_COUNTS = {
    "QB": 40,
    "RB": 80,
    "WR": 120,
    "TE": 50,
}

DEFAULT_REQUIRED_KNOWN_PLAYERS = (
    "Josh Allen",
    "Lamar Jackson",
    "Bijan Robinson",
    "Ja'Marr Chase",
    "Marvin Harrison Jr.",
    "Trey McBride",
    "Dalton Kincaid",
)


class ValidationError(Exception):
    """Raised when generated projection data is unsafe to trust."""


@dataclass(frozen=True)
class ValidationSummary:
    position_counts: dict[str, int]
    matched_counts: dict[str, int]
    unmatched_counts: dict[str, int]


def validate_pipeline_results(
    projections: Sequence[ProjectionRow],
    matches: Sequence[MatchResult],
    *,
    require_minimums: bool,
    required_known_players: Sequence[str] = DEFAULT_REQUIRED_KNOWN_PLAYERS,
) -> ValidationSummary:
    if not projections:
        raise ValidationError("No projections extracted")

    _validate_duplicate_projection_keys(projections)
    _validate_duplicate_matched_sleeper_ids(matches)
    _validate_required_known_players(matches, required_known_players)

    position_counts = dict(Counter(projection.projection_position for projection in projections))
    for position in sorted(SUPPORTED_POSITIONS):
        if position_counts.get(position, 0) == 0:
            raise ValidationError(f"No projections extracted for {position}")
        if require_minimums and position_counts[position] < MINIMUM_POSITION_COUNTS[position]:
            raise ValidationError(
                f"Too few {position} projections extracted: "
                f"{position_counts[position]} < {MINIMUM_POSITION_COUNTS[position]}"
            )

    matched_counts: Counter[str] = Counter()
    unmatched_counts: Counter[str] = Counter()
    for match in matches:
        position = match.projection.projection_position
        if match.sleeper is None:
            unmatched_counts[position] += 1
        else:
            matched_counts[position] += 1

    return ValidationSummary(
        position_counts=position_counts,
        matched_counts=dict(matched_counts),
        unmatched_counts=dict(unmatched_counts),
    )


def _validate_duplicate_projection_keys(projections: Sequence[ProjectionRow]) -> None:
    keys = [
        (projection.projection_name, projection.projection_team, projection.projection_position)
        for projection in projections
    ]
    duplicates = [key for key, count in Counter(keys).items() if count > 1]
    if duplicates:
        raise ValidationError(f"Duplicate projection keys: {duplicates}")


def _validate_duplicate_matched_sleeper_ids(matches: Sequence[MatchResult]) -> None:
    sleeper_ids = [match.sleeper.sleeper_id for match in matches if match.sleeper is not None]
    duplicates = [sleeper_id for sleeper_id, count in Counter(sleeper_ids).items() if count > 1]
    if duplicates:
        raise ValidationError(f"Duplicate matched Sleeper IDs: {duplicates}")


def _validate_required_known_players(
    matches: Sequence[MatchResult],
    required_known_players: Sequence[str],
) -> None:
    matched_projection_names = {
        match.projection.projection_name for match in matches if match.sleeper is not None
    }
    for known_player in required_known_players:
        if known_player not in matched_projection_names:
            raise ValidationError(f"Missing required known-player match: {known_player}")
