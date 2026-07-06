import json
from pathlib import Path

import pytest
from draftops_projections.normalize import normalize_name, normalize_position, normalize_team
from draftops_projections.sleeper import load_active_sleeper_players


@pytest.mark.parametrize(
    ("raw_name", "normalized"),
    [
        ("Marvin Harrison Jr.", "marvin harrison"),
        ("Ja'Marr Chase", "jamarr chase"),
        ("Amon-Ra St. Brown", "amonra st brown"),
        ("C.J. Stroud", "cj stroud"),
        ("Brian Thomas III", "brian thomas"),
    ],
)
def test_normalize_name_removes_suffixes_and_punctuation(
    raw_name: str,
    normalized: str,
) -> None:
    assert normalize_name(raw_name) == normalized


@pytest.mark.parametrize(
    ("raw_team", "normalized"),
    [
        ("ARZ", "ARI"),
        ("JAC", "JAX"),
        ("BLT", "BAL"),
        ("CLV", "CLE"),
        ("HST", "HOU"),
        ("LA", "LAR"),
        ("OAK", "LV"),
        ("WSH", "WAS"),
        ("FA", ""),
        ("", ""),
        (None, ""),
    ],
)
def test_normalize_team_maps_source_abbreviations(raw_team: str | None, normalized: str) -> None:
    assert normalize_team(raw_team) == normalized


@pytest.mark.parametrize("position", ["QB", "RB", "WR", "TE"])
def test_normalize_position_allows_supported_offensive_positions(position: str) -> None:
    assert normalize_position(position) == position


@pytest.mark.parametrize("position", ["K", "DEF", "LB", None])
def test_normalize_position_rejects_out_of_scope_positions(position: str | None) -> None:
    assert normalize_position(position) is None


def test_load_active_sleeper_players_filters_and_normalizes_records(tmp_path: Path) -> None:
    sleeper_json = tmp_path / "sleeper_players.json"
    sleeper_json.write_text(
        json.dumps(
            {
                "4984": {
                    "player_id": "4984",
                    "full_name": "Josh Allen",
                    "first_name": "Josh",
                    "last_name": "Allen",
                    "search_full_name": "joshallen",
                    "team": "BUF",
                    "position": "QB",
                    "fantasy_positions": ["QB"],
                    "age": 30,
                    "years_exp": 8,
                    "active": True,
                    "status": "Active",
                },
                "11628": {
                    "player_id": "11628",
                    "full_name": "Marvin Harrison",
                    "first_name": "Marvin",
                    "last_name": "Harrison",
                    "search_full_name": "marvinharrison",
                    "team": "ARZ",
                    "position": "WR",
                    "fantasy_positions": ["WR"],
                    "age": 24,
                    "years_exp": 2,
                    "active": True,
                    "status": "Active",
                },
                "inactive": {
                    "player_id": "inactive",
                    "full_name": "Inactive Runner",
                    "first_name": "Inactive",
                    "last_name": "Runner",
                    "search_full_name": "inactiverunner",
                    "team": "FA",
                    "position": "RB",
                    "fantasy_positions": ["RB"],
                    "age": None,
                    "years_exp": None,
                    "active": False,
                    "status": "Inactive",
                },
                "defender": {
                    "player_id": "defender",
                    "full_name": "Active Linebacker",
                    "first_name": "Active",
                    "last_name": "Linebacker",
                    "search_full_name": "activelinebacker",
                    "team": None,
                    "position": "LB",
                    "fantasy_positions": ["LB"],
                    "age": 27,
                    "years_exp": 5,
                    "active": True,
                    "status": "Active",
                },
            }
        ),
        encoding="utf-8",
    )

    players = load_active_sleeper_players(sleeper_json)

    assert [player.sleeper_id for player in players] == ["4984", "11628"]
    assert players[0].normalized_name == "josh allen"
    assert players[1].team == "ARI"
