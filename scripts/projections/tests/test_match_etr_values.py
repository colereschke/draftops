from draftops_projections.match_etr_values import match_etr_value_row
from draftops_projections.models import SleeperPlayer


def sleeper(**overrides: object) -> SleeperPlayer:
    data = {
        "sleeper_id": "1",
        "full_name": "Jayden Daniels",
        "first_name": "Jayden",
        "last_name": "Daniels",
        "search_full_name": "jayden daniels",
        "normalized_name": "jayden daniels",
        "team": "WAS",
        "position": "QB",
        "fantasy_positions": ("QB",),
        "age": 25.0,
        "years_exp": 2,
        "active": True,
        "status": "Active",
    }
    data.update(overrides)
    return SleeperPlayer(**data)


def test_matches_etr_wft_to_sleeper_was_alias() -> None:
    result = match_etr_value_row(
        {"Player": "Jayden Daniels", "Team": "WFT", "Position": "QB"},
        [sleeper()],
    )

    assert result.sleeper is not None
    assert result.sleeper.sleeper_id == "1"
    assert result.match_method == "normalized_name_team_position"


def test_uses_name_position_when_etr_team_is_blank() -> None:
    result = match_etr_value_row(
        {"Player": "Justin Fields", "Team": "—", "Position": "QB"},
        [
            sleeper(
                sleeper_id="2",
                full_name="Justin Fields",
                normalized_name="justin fields",
                team="NYJ",
            )
        ],
    )

    assert result.sleeper is not None
    assert result.sleeper.sleeper_id == "2"
    assert result.match_method == "normalized_name_position"


def test_ambiguous_name_position_match_stays_unmatched() -> None:
    result = match_etr_value_row(
        {"Player": "John Smith", "Team": "—", "Position": "WR"},
        [
            sleeper(
                sleeper_id="2", full_name="John Smith", normalized_name="john smith", position="WR"
            ),
            sleeper(
                sleeper_id="3", full_name="John Smith", normalized_name="john smith", position="WR"
            ),
        ],
    )

    assert result.sleeper is None
    assert result.notes == "ambiguous_match"
