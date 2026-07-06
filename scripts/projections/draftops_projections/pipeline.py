from __future__ import annotations

import csv
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path

from draftops_projections.csv_utils import (
    MASTER_PROJECTION_COLUMNS,
    MATCH_REPORT_COLUMNS,
    NORMALIZED_SLEEPER_COLUMNS,
    RAW_PROJECTION_COLUMNS,
    UNMATCHED_COLUMNS,
    match_to_master_dict,
    match_to_report_dict,
    projection_to_raw_dict,
    sleeper_to_dict,
    unmatched_to_dict,
    write_csv,
)
from draftops_projections.extract_mike_clay import extract_mike_clay_projections
from draftops_projections.match_players import match_projection
from draftops_projections.models import MatchResult, ProjectionRow
from draftops_projections.sleeper import load_active_sleeper_players
from draftops_projections.validate import ValidationSummary, validate_pipeline_results


@dataclass(frozen=True)
class PipelineResult:
    projections: list[ProjectionRow]
    matches: list[MatchResult]
    summary: ValidationSummary


def run_pipeline(
    *,
    pdf_path: Path | None,
    raw_projections_csv: Path | None,
    sleeper_json: Path,
    output_dir: Path,
    require_minimums: bool,
    required_known_players: Sequence[str],
) -> PipelineResult:
    if raw_projections_csv is not None:
        projections = read_raw_projection_csv(raw_projections_csv)
    elif pdf_path is not None:
        projections = extract_mike_clay_projections(pdf_path)
    else:
        raise ValueError("Either pdf_path or raw_projections_csv must be provided")

    sleeper_players = load_active_sleeper_players(sleeper_json)
    matches = [match_projection(projection, sleeper_players) for projection in projections]
    summary = validate_pipeline_results(
        projections,
        matches,
        require_minimums=require_minimums,
        required_known_players=required_known_players,
    )

    output_dir.mkdir(parents=True, exist_ok=True)
    write_csv(
        output_dir / "raw_mike_clay_projections.csv",
        RAW_PROJECTION_COLUMNS,
        [projection_to_raw_dict(projection) for projection in projections],
    )
    write_csv(
        output_dir / "normalized_sleeper_players.csv",
        NORMALIZED_SLEEPER_COLUMNS,
        [sleeper_to_dict(sleeper) for sleeper in sleeper_players],
    )
    write_csv(
        output_dir / "master_projections.csv",
        MASTER_PROJECTION_COLUMNS,
        [match_to_master_dict(match) for match in matches],
    )
    write_csv(
        output_dir / "projection_match_report.csv",
        MATCH_REPORT_COLUMNS,
        [match_to_report_dict(match) for match in matches if match.sleeper is not None],
    )
    write_csv(
        output_dir / "unmatched_players.csv",
        UNMATCHED_COLUMNS,
        [unmatched_to_dict(match) for match in matches if match.sleeper is None],
    )

    return PipelineResult(projections=projections, matches=matches, summary=summary)


def read_raw_projection_csv(path: Path) -> list[ProjectionRow]:
    with path.open(newline="", encoding="utf-8") as file:
        return [_projection_from_csv_row(row) for row in csv.DictReader(file)]


def _projection_from_csv_row(row: dict[str, str]) -> ProjectionRow:
    return ProjectionRow(
        projection_name=row["projection_name"],
        projection_team=row["projection_team"],
        projection_position=row["projection_position"],
        games=_required_int(row["games"]),
        pass_att=_required_int(row["pass_att"]),
        pass_cmp=_required_int(row["pass_cmp"]),
        pass_yds=_required_int(row["pass_yds"]),
        pass_td=_required_int(row["pass_td"]),
        pass_int=_required_int(row["pass_int"]),
        pass_sacks=_required_int(row["pass_sacks"]),
        rush_att=_required_int(row["rush_att"]),
        rush_yds=_required_int(row["rush_yds"]),
        rush_td=_required_int(row["rush_td"]),
        targets=_required_int(row["targets"]),
        receptions=_required_int(row["receptions"]),
        rec_yds=_required_int(row["rec_yds"]),
        rec_td=_required_int(row["rec_td"]),
        base_fantasy_points=float(row["base_fantasy_points"]),
        projection_rank=_optional_int(row["projection_rank"]),
        source_page=_optional_int(row["source_page"]),
    )


def _required_int(value: str) -> int:
    return int(float(value))


def _optional_int(value: str) -> int | None:
    if value == "":
        return None
    return int(float(value))
