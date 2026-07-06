import csv
import json
from pathlib import Path

from draftops_projections.cli import main
from draftops_projections.csv_utils import RAW_PROJECTION_COLUMNS


def test_cli_pipeline_writes_outputs_from_temp_paths(tmp_path: Path) -> None:
    raw_projection_csv = tmp_path / "input" / "raw_mike_clay_projections.csv"
    sleeper_json = tmp_path / "input" / "sleeper_players.json"
    output_dir = tmp_path / "generated"
    raw_projection_csv.parent.mkdir(parents=True)

    _write_raw_projection_csv(raw_projection_csv)
    _write_sleeper_json(sleeper_json)

    exit_code = main(
        [
            "--raw-projections-csv",
            str(raw_projection_csv),
            "--sleeper-json",
            str(sleeper_json),
            "--output-dir",
            str(output_dir),
            "--skip-known-player-validation",
        ]
    )

    assert exit_code == 0
    master_path = output_dir / "master_projections.csv"
    match_report_path = output_dir / "projection_match_report.csv"
    unmatched_path = output_dir / "unmatched_players.csv"
    assert master_path.exists()
    assert match_report_path.exists()
    assert unmatched_path.exists()

    with master_path.open(newline="", encoding="utf-8") as file:
        master_rows = list(csv.DictReader(file))

    assert len(master_rows) == 4
    assert master_rows[0]["sleeper_id"] == "4984"
    assert master_rows[0]["base_fantasy_points"] == "369.0"


def _write_raw_projection_csv(path: Path) -> None:
    rows = [
        _projection_row("Josh Allen", "BUF", "QB", 369.0, 1),
        _projection_row("Bijan Robinson", "ATL", "RB", 353.0, 2),
        _projection_row("Ja'Marr Chase", "CIN", "WR", 309.0, 1),
        _projection_row("Trey McBride", "ARI", "TE", 252.0, 1),
    ]
    with path.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=RAW_PROJECTION_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)


def _projection_row(
    name: str,
    team: str,
    position: str,
    base_fantasy_points: float,
    rank: int,
) -> dict[str, object]:
    return {
        "projection_name": name,
        "projection_team": team,
        "projection_position": position,
        "games": 17,
        "pass_att": 0,
        "pass_cmp": 0,
        "pass_yds": 0,
        "pass_td": 0,
        "pass_int": 0,
        "pass_sacks": 0,
        "rush_att": 0,
        "rush_yds": 0,
        "rush_td": 0,
        "targets": 0,
        "receptions": 0,
        "rec_yds": 0,
        "rec_td": 0,
        "base_fantasy_points": base_fantasy_points,
        "projection_rank": rank,
        "source_page": 2,
    }


def _write_sleeper_json(path: Path) -> None:
    path.write_text(
        json.dumps(
            {
                "4984": _sleeper("4984", "Josh Allen", "BUF", "QB"),
                "11604": _sleeper("11604", "Bijan Robinson", "ATL", "RB"),
                "7564": _sleeper("7564", "Ja'Marr Chase", "CIN", "WR"),
                "8130": _sleeper("8130", "Trey McBride", "ARI", "TE"),
            }
        ),
        encoding="utf-8",
    )


def _sleeper(sleeper_id: str, name: str, team: str, position: str) -> dict[str, object]:
    first_name, last_name = name.split(" ", maxsplit=1)
    return {
        "player_id": sleeper_id,
        "full_name": name,
        "first_name": first_name,
        "last_name": last_name,
        "search_full_name": name.lower().replace(" ", "").replace("'", ""),
        "team": team,
        "position": position,
        "fantasy_positions": [position],
        "age": 25,
        "years_exp": 3,
        "active": True,
        "status": "Active",
    }
