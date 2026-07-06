import pytest
from draftops_projections.models import MatchResult, ProjectionRow, SleeperPlayer
from draftops_projections.validate import ValidationError, validate_pipeline_results


def test_validate_pipeline_results_rejects_duplicate_matched_sleeper_ids() -> None:
    projection = _projection("Josh Allen", "BUF", "QB")
    sleeper = _sleeper("4984", "Josh Allen", "BUF", "QB")

    with pytest.raises(ValidationError, match="Duplicate matched Sleeper IDs"):
        validate_pipeline_results(
            projections=[projection, _projection("Josh Allen Duplicate", "BUF", "QB")],
            matches=[
                _match(projection, sleeper),
                _match(_projection("Josh Allen Duplicate", "BUF", "QB"), sleeper),
            ],
            require_minimums=False,
            required_known_players=(),
        )


def test_validate_pipeline_results_rejects_missing_supported_position() -> None:
    with pytest.raises(ValidationError, match="No projections extracted for TE"):
        validate_pipeline_results(
            projections=[
                _projection("Josh Allen", "BUF", "QB"),
                _projection("Bijan Robinson", "ATL", "RB"),
                _projection("Ja'Marr Chase", "CIN", "WR"),
            ],
            matches=[],
            require_minimums=False,
            required_known_players=(),
        )


def test_validate_pipeline_results_rejects_missing_known_player_match() -> None:
    projection = _projection("Josh Allen", "BUF", "QB")

    with pytest.raises(ValidationError, match="Missing required known-player match: Josh Allen"):
        validate_pipeline_results(
            projections=[projection],
            matches=[_match(projection, None)],
            require_minimums=False,
            required_known_players=("Josh Allen",),
        )


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
        base_fantasy_points=1.0,
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
        age=None,
        years_exp=None,
        active=True,
        status="Active",
    )


def _match(projection: ProjectionRow, sleeper: SleeperPlayer | None) -> MatchResult:
    return MatchResult(
        projection=projection,
        sleeper=sleeper,
        match_method="exact_name_team_position" if sleeper is not None else "unmatched",
        match_confidence=1.0 if sleeper is not None else 0.0,
        notes="",
    )
