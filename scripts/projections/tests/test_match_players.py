from draftops_projections.match_players import match_projection
from draftops_projections.models import ProjectionRow, SleeperPlayer


def test_match_projection_prefers_exact_name_team_position() -> None:
    projection = _projection("Josh Allen", "BUF", "QB")
    players = [
        _sleeper("1", "Josh Allen", "JAX", "DE"),
        _sleeper("4984", "Josh Allen", "BUF", "QB"),
    ]

    result = match_projection(projection, players)

    assert result.sleeper is not None
    assert result.sleeper.sleeper_id == "4984"
    assert result.match_method == "exact_name_team_position"
    assert result.match_confidence == 1.0


def test_match_projection_uses_suffix_normalized_name_with_team_and_position() -> None:
    projection = _projection("Marvin Harrison Jr.", "ARI", "WR")
    players = [_sleeper("11628", "Marvin Harrison", "ARI", "WR")]

    result = match_projection(projection, players)

    assert result.sleeper is not None
    assert result.sleeper.sleeper_id == "11628"
    assert result.match_method == "normalized_name_team_position"
    assert result.match_confidence == 0.98


def test_match_projection_resolves_duplicate_names_by_team_and_position() -> None:
    projection = _projection("Josh Allen", "BUF", "QB")
    players = [
        _sleeper("inactive-name-collision", "Josh Allen", "", "WR"),
        _sleeper("4984", "Josh Allen", "BUF", "QB"),
    ]

    result = match_projection(projection, players)

    assert result.sleeper is not None
    assert result.sleeper.sleeper_id == "4984"


def test_match_projection_returns_unmatched_for_ambiguous_candidates() -> None:
    projection = _projection("Chris Smith", "", "WR")
    players = [
        _sleeper("a", "Chris Smith", "BUF", "WR"),
        _sleeper("b", "Chris Smith", "DAL", "WR"),
    ]

    result = match_projection(projection, players)

    assert result.sleeper is None
    assert result.match_method == "unmatched"
    assert result.match_confidence == 0.0
    assert result.candidate_sleeper_ids == ("a", "b")


def test_match_projection_constrains_alias_by_position_and_team() -> None:
    projection = _projection("Hollywood Brown", "KC", "WR")
    players = [
        _sleeper("wrong-team", "Marquise Brown", "ARI", "WR"),
        _sleeper("wrong-position", "Marquise Brown", "KC", "RB"),
        _sleeper("right", "Marquise Brown", "KC", "WR"),
    ]

    result = match_projection(projection, players)

    assert result.sleeper is not None
    assert result.sleeper.sleeper_id == "right"
    assert result.match_method == "alias"
    assert result.match_confidence == 0.95


def test_match_projection_uses_manual_aliases_for_unmatched_projection_names() -> None:
    alias_cases = [
        ("Bam Knight", "Zonovan Knight", "ARI", "RB"),
        ("Josh Palmer", "Joshua Palmer", "BUF", "WR"),
        ("Ken Walker III", "Kenneth Walker", "KC", "RB"),
        ("Kenneth Gainwell", "Kenny Gainwell", "TB", "RB"),
        ("Cameron Ward", "Cam Ward", "TEN", "QB"),
        ("Chigoziem Okonkwo", "Chig Okonkwo", "WAS", "TE"),
    ]

    for projection_name, sleeper_name, team, position in alias_cases:
        result = match_projection(
            _projection(projection_name, team, position),
            [_sleeper("matched", sleeper_name, team, position)],
        )

        assert result.sleeper is not None
        assert result.sleeper.full_name == sleeper_name
        assert result.match_method == "alias"


def test_match_projection_handles_middle_initial_name_variant() -> None:
    result = match_projection(
        _projection("Kyle T. Williams", "NE", "WR"),
        [_sleeper("matched", "Kyle Williams", "NE", "WR")],
    )

    assert result.sleeper is not None
    assert result.sleeper.full_name == "Kyle Williams"
    assert result.match_method == "normalized_name_team_position"


def _projection(name: str, team: str, position: str) -> ProjectionRow:
    return ProjectionRow(
        projection_name=name,
        projection_team=team,
        projection_position=position,
        games=17,
        pass_att=0,
        pass_cmp=0,
        pass_yds=0,
        pass_td=0,
        pass_int=0,
        pass_sacks=0,
        rush_att=0,
        rush_yds=0,
        rush_td=0,
        targets=0,
        receptions=0,
        rec_yds=0,
        rec_td=0,
        base_fantasy_points=0.0,
        projection_rank=None,
        source_page=None,
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
        age=None,
        years_exp=None,
        active=True,
        status="Active",
    )
