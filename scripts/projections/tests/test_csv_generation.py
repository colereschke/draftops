import csv
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
    unmatched_to_dict,
    write_csv,
)
from draftops_projections.models import MatchResult, ProjectionRow, SleeperPlayer


def test_csv_columns_are_explicit_and_stable() -> None:
    assert RAW_PROJECTION_COLUMNS == [
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
    assert NORMALIZED_SLEEPER_COLUMNS[:6] == [
        "sleeper_id",
        "full_name",
        "first_name",
        "last_name",
        "search_full_name",
        "normalized_name",
    ]
    assert "base_fantasy_points" in MASTER_PROJECTION_COLUMNS
    assert MATCH_REPORT_COLUMNS[-1] == "notes"
    assert UNMATCHED_COLUMNS == [
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


def test_projection_to_raw_dict_uses_base_fantasy_points() -> None:
    row = projection_to_raw_dict(_projection("Josh Allen", "BUF", "QB"))

    assert row["projection_name"] == "Josh Allen"
    assert row["base_fantasy_points"] == 369.0
    assert "fantasy_points" not in row


def test_match_to_master_dict_includes_sleeper_fields_for_matched_player() -> None:
    result = MatchResult(
        projection=_projection("Josh Allen", "BUF", "QB"),
        sleeper=_sleeper("4984", "Josh Allen", "BUF", "QB"),
        match_method="exact_name_team_position",
        match_confidence=1.0,
        notes="",
    )

    row = match_to_master_dict(result)

    assert row["sleeper_id"] == "4984"
    assert row["player_name"] == "Josh Allen"
    assert row["team"] == "BUF"
    assert row["position"] == "QB"
    assert row["base_fantasy_points"] == 369.0
    assert row["projection_source"] == "mike_clay"
    assert row["projection_date"] == "2026-06-22"
    assert row["season"] == 2026


def test_unmatched_rows_keep_projection_in_master_and_unmatched_report() -> None:
    result = MatchResult(
        projection=_projection("Unknown Player", "WAS", "WR"),
        sleeper=None,
        match_method="unmatched",
        match_confidence=0.0,
        notes="multiple_candidates",
        candidate_sleeper_ids=("a", "b"),
        candidate_names=("Unknown Player", "Unknown Player"),
    )

    master_row = match_to_master_dict(result)
    unmatched_row = unmatched_to_dict(result)
    report_row = match_to_report_dict(result)

    assert master_row["sleeper_id"] == ""
    assert master_row["player_name"] == "Unknown Player"
    assert unmatched_row["reason"] == "multiple_candidates"
    assert unmatched_row["candidate_sleeper_ids"] == "a|b"
    assert report_row["sleeper_id"] == ""


def test_write_csv_creates_parent_directory_and_header(tmp_path: Path) -> None:
    output_path = tmp_path / "nested" / "raw.csv"

    write_csv(
        output_path,
        RAW_PROJECTION_COLUMNS,
        [projection_to_raw_dict(_projection("Josh Allen", "BUF", "QB"))],
    )

    with output_path.open(newline="", encoding="utf-8") as file:
        rows = list(csv.DictReader(file))

    assert rows[0]["projection_name"] == "Josh Allen"
    assert rows[0]["base_fantasy_points"] == "369.0"


def _projection(name: str, team: str, position: str) -> ProjectionRow:
    return ProjectionRow(
        projection_name=name,
        projection_team=team,
        projection_position=position,
        games=17,
        pass_att=509,
        pass_cmp=340,
        pass_yds=3945,
        pass_td=26,
        pass_int=12,
        pass_sacks=36,
        rush_att=116,
        rush_yds=579,
        rush_td=12,
        targets=0,
        receptions=0,
        rec_yds=0,
        rec_td=0,
        base_fantasy_points=369.0,
        projection_rank=1,
        source_page=2,
    )


def _sleeper(sleeper_id: str, name: str, team: str, position: str) -> SleeperPlayer:
    return SleeperPlayer(
        sleeper_id=sleeper_id,
        full_name=name,
        first_name=name.split(" ", maxsplit=1)[0],
        last_name=name.split(" ", maxsplit=1)[-1],
        search_full_name=name.lower().replace(" ", ""),
        normalized_name=name.lower().replace(".", "").replace("'", ""),
        team=team,
        position=position,
        fantasy_positions=(position,),
        age=30.0,
        years_exp=8,
        active=True,
        status="Active",
    )
