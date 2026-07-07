from __future__ import annotations

from collections.abc import Callable, Sequence

from draftops_projections.aliases import MANUAL_ALIASES
from draftops_projections.models import MatchResult, ProjectionRow, SleeperPlayer
from draftops_projections.normalize import normalize_name, normalize_position, normalize_team


def match_projection(
    projection: ProjectionRow,
    sleeper_players: Sequence[SleeperPlayer],
) -> MatchResult:
    projection_name = normalize_name(projection.projection_name)
    projection_team = normalize_team(projection.projection_team)
    projection_position = normalize_position(projection.projection_position)

    if projection_position is None:
        return _unmatched(projection, (), "unsupported_position")

    attempts: tuple[
        tuple[str, float, Callable[[SleeperPlayer], bool]],
        ...,
    ] = (
        (
            "exact_name_team_position",
            1.0,
            lambda player: (
                player.full_name.casefold() == projection.projection_name.casefold()
                and player.team == projection_team
                and player.position == projection_position
            ),
        ),
        (
            "normalized_name_team_position",
            0.98,
            lambda player: (
                player.normalized_name == projection_name
                and player.team == projection_team
                and player.position == projection_position
            ),
        ),
        (
            "normalized_name_team",
            0.97,
            lambda player: (
                player.normalized_name == projection_name and player.team == projection_team
            ),
        ),
        (
            "normalized_name_position",
            0.96,
            lambda player: (
                player.normalized_name == projection_name and player.position == projection_position
            ),
        ),
    )

    for method, confidence, predicate in attempts:
        matched = _unique_match(sleeper_players, predicate)
        if matched is not None:
            return MatchResult(
                projection=projection,
                sleeper=matched,
                match_method=method,
                match_confidence=confidence,
                notes="",
            )

    alias_name = MANUAL_ALIASES.get(projection_name)
    if alias_name is not None:
        alias_matched = _unique_match(
            sleeper_players,
            lambda player: (
                player.normalized_name == alias_name
                and player.position == projection_position
                and (projection_team == "" or player.team == projection_team)
            ),
        )
        if alias_matched is not None:
            return MatchResult(
                projection=projection,
                sleeper=alias_matched,
                match_method="alias",
                match_confidence=0.95,
                notes=f"alias:{projection_name}->{alias_name}",
            )

    candidates = tuple(
        player
        for player in sleeper_players
        if player.normalized_name == projection_name and player.position == projection_position
    )
    reason = "multiple_candidates" if len(candidates) > 1 else "no_name_match"
    return _unmatched(projection, candidates, reason)


def _unique_match(
    sleeper_players: Sequence[SleeperPlayer],
    predicate: Callable[[SleeperPlayer], bool],
) -> SleeperPlayer | None:
    matches = [player for player in sleeper_players if predicate(player)]
    if len(matches) == 1:
        return matches[0]
    return None


def _unmatched(
    projection: ProjectionRow,
    candidates: Sequence[SleeperPlayer],
    reason: str,
) -> MatchResult:
    return MatchResult(
        projection=projection,
        sleeper=None,
        match_method="unmatched",
        match_confidence=0.0,
        notes=reason,
        candidate_sleeper_ids=tuple(player.sleeper_id for player in candidates),
        candidate_names=tuple(player.full_name for player in candidates),
    )
