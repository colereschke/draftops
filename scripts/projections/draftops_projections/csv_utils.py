from __future__ import annotations

import csv
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import cast

from draftops_projections.models import MatchResult, ProjectionRow, SleeperPlayer

CsvValue = str | int | float | bool | None
CsvRow = dict[str, CsvValue]

RAW_PROJECTION_COLUMNS = [
    "projection_name",
    "projection_team",
    "projection_position",
    "games",
    "pass_att",
    "pass_cmp",
    "pass_yds",
    "pass_td",
    "pass_int",
    "pass_sacks",
    "rush_att",
    "rush_yds",
    "rush_td",
    "targets",
    "receptions",
    "rec_yds",
    "rec_td",
    "base_fantasy_points",
    "projection_rank",
    "source_page",
]

NORMALIZED_SLEEPER_COLUMNS = [
    "sleeper_id",
    "full_name",
    "first_name",
    "last_name",
    "search_full_name",
    "normalized_name",
    "team",
    "position",
    "fantasy_positions",
    "age",
    "years_exp",
    "active",
    "status",
]

MASTER_PROJECTION_COLUMNS = [
    "sleeper_id",
    "player_name",
    "first_name",
    "last_name",
    "search_full_name",
    "team",
    "position",
    "fantasy_positions",
    "age",
    "years_exp",
    "active",
    "status",
    "games",
    "pass_att",
    "pass_cmp",
    "pass_yds",
    "pass_td",
    "pass_int",
    "pass_sacks",
    "rush_att",
    "rush_yds",
    "rush_td",
    "targets",
    "receptions",
    "rec_yds",
    "rec_td",
    "base_fantasy_points",
    "projection_rank",
    "projection_source",
    "projection_date",
    "season",
    "match_method",
    "match_confidence",
]

MATCH_REPORT_COLUMNS = [
    "projection_name",
    "projection_team",
    "projection_position",
    "sleeper_id",
    "sleeper_name",
    "sleeper_team",
    "sleeper_position",
    "match_method",
    "match_confidence",
    "notes",
]

UNMATCHED_COLUMNS = [
    "projection_name",
    "projection_team",
    "projection_position",
    "games",
    "base_fantasy_points",
    "projection_rank",
    "reason",
    "candidate_sleeper_ids",
    "candidate_names",
]


def projection_to_raw_dict(projection: ProjectionRow) -> CsvRow:
    return {
        "projection_name": projection.projection_name,
        "projection_team": projection.projection_team,
        "projection_position": projection.projection_position,
        "games": projection.games,
        "pass_att": projection.pass_att,
        "pass_cmp": projection.pass_cmp,
        "pass_yds": projection.pass_yds,
        "pass_td": projection.pass_td,
        "pass_int": projection.pass_int,
        "pass_sacks": projection.pass_sacks,
        "rush_att": projection.rush_att,
        "rush_yds": projection.rush_yds,
        "rush_td": projection.rush_td,
        "targets": projection.targets,
        "receptions": projection.receptions,
        "rec_yds": projection.rec_yds,
        "rec_td": projection.rec_td,
        "base_fantasy_points": projection.base_fantasy_points,
        "projection_rank": projection.projection_rank,
        "source_page": projection.source_page,
    }


def sleeper_to_dict(sleeper: SleeperPlayer) -> CsvRow:
    return {
        "sleeper_id": sleeper.sleeper_id,
        "full_name": sleeper.full_name,
        "first_name": sleeper.first_name,
        "last_name": sleeper.last_name,
        "search_full_name": sleeper.search_full_name,
        "normalized_name": sleeper.normalized_name,
        "team": sleeper.team,
        "position": sleeper.position,
        "fantasy_positions": _join(sleeper.fantasy_positions),
        "age": sleeper.age,
        "years_exp": sleeper.years_exp,
        "active": sleeper.active,
        "status": sleeper.status,
    }


def match_to_master_dict(match: MatchResult) -> CsvRow:
    projection = match.projection
    sleeper = match.sleeper
    return {
        "sleeper_id": _sleeper_value(sleeper, "sleeper_id"),
        "player_name": sleeper.full_name if sleeper is not None else projection.projection_name,
        "first_name": _sleeper_value(sleeper, "first_name"),
        "last_name": _sleeper_value(sleeper, "last_name"),
        "search_full_name": _sleeper_value(sleeper, "search_full_name"),
        "team": sleeper.team if sleeper is not None else projection.projection_team,
        "position": sleeper.position if sleeper is not None else projection.projection_position,
        "fantasy_positions": _join(sleeper.fantasy_positions) if sleeper is not None else "",
        "age": sleeper.age if sleeper is not None else "",
        "years_exp": sleeper.years_exp if sleeper is not None else "",
        "active": sleeper.active if sleeper is not None else "",
        "status": sleeper.status if sleeper is not None else "",
        "games": projection.games,
        "pass_att": projection.pass_att,
        "pass_cmp": projection.pass_cmp,
        "pass_yds": projection.pass_yds,
        "pass_td": projection.pass_td,
        "pass_int": projection.pass_int,
        "pass_sacks": projection.pass_sacks,
        "rush_att": projection.rush_att,
        "rush_yds": projection.rush_yds,
        "rush_td": projection.rush_td,
        "targets": projection.targets,
        "receptions": projection.receptions,
        "rec_yds": projection.rec_yds,
        "rec_td": projection.rec_td,
        "base_fantasy_points": projection.base_fantasy_points,
        "projection_rank": projection.projection_rank,
        "projection_source": "mike_clay",
        "projection_date": "2026-06-22",
        "season": 2026,
        "match_method": match.match_method,
        "match_confidence": match.match_confidence,
    }


def match_to_report_dict(match: MatchResult) -> CsvRow:
    sleeper = match.sleeper
    return {
        "projection_name": match.projection.projection_name,
        "projection_team": match.projection.projection_team,
        "projection_position": match.projection.projection_position,
        "sleeper_id": _sleeper_value(sleeper, "sleeper_id"),
        "sleeper_name": _sleeper_value(sleeper, "full_name"),
        "sleeper_team": _sleeper_value(sleeper, "team"),
        "sleeper_position": _sleeper_value(sleeper, "position"),
        "match_method": match.match_method,
        "match_confidence": match.match_confidence,
        "notes": match.notes,
    }


def unmatched_to_dict(match: MatchResult) -> CsvRow:
    projection = match.projection
    return {
        "projection_name": projection.projection_name,
        "projection_team": projection.projection_team,
        "projection_position": projection.projection_position,
        "games": projection.games,
        "base_fantasy_points": projection.base_fantasy_points,
        "projection_rank": projection.projection_rank,
        "reason": match.notes,
        "candidate_sleeper_ids": _join(match.candidate_sleeper_ids),
        "candidate_names": _join(match.candidate_names),
    }


def write_csv(path: Path, columns: Sequence[str], rows: Sequence[Mapping[str, CsvValue]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=columns, extrasaction="raise")
        writer.writeheader()
        writer.writerows(rows)


def _sleeper_value(sleeper: SleeperPlayer | None, field_name: str) -> CsvValue:
    if sleeper is None:
        return ""
    value = cast(CsvValue | tuple[str, ...], getattr(sleeper, field_name))
    if isinstance(value, tuple):
        return _join(value)
    return value


def _join(values: Sequence[str]) -> str:
    return "|".join(values)
