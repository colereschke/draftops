from draftops_projections.match_etr_values import match_etr_value_row
from draftops_projections.models import SleeperPlayer


def sleeper(
    *,
    sleeper_id: str = "1",
    full_name: str = "Jayden Daniels",
    first_name: str = "Jayden",
    last_name: str = "Daniels",
    search_full_name: str = "jayden daniels",
    normalized_name: str = "jayden daniels",
    team: str = "WAS",
    position: str = "QB",
    fantasy_positions: tuple[str, ...] = ("QB",),
    age: float | None = 25.0,
    years_exp: int | None = 2,
    active: bool = True,
    status: str = "Active",
) -> SleeperPlayer:
    return SleeperPlayer(
        sleeper_id=sleeper_id,
        full_name=full_name,
        first_name=first_name,
        last_name=last_name,
        search_full_name=search_full_name,
        normalized_name=normalized_name,
        team=team,
        position=position,
        fantasy_positions=fantasy_positions,
        age=age,
        years_exp=years_exp,
        active=active,
        status=status,
    )


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
