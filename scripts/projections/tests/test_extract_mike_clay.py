from draftops_projections.extract_mike_clay import parse_offensive_projection_line


def test_parse_offensive_projection_line_reads_qb_stats_before_defensive_columns() -> None:
    row = parse_offensive_projection_line(
        "QB Josh Allen 17 509 340 3945 26 12 36 116 579 12 0 0 0 0 369 1 "
        "DI Ed Oliver 726 49 6.4 0.0 5",
        team="BUF",
        source_page=5,
    )

    assert row is not None
    assert row.projection_name == "Josh Allen"
    assert row.projection_team == "BUF"
    assert row.projection_position == "QB"
    assert row.pass_att == 509
    assert row.rush_yds == 579
    assert row.base_fantasy_points == 369.0
    assert row.projection_rank == 1
    assert row.source_page == 5


def test_parse_offensive_projection_line_handles_suffix_and_apostrophe_names() -> None:
    row = parse_offensive_projection_line(
        "WR Marvin Harrison Jr. 17 0 0 0 0 0 0 0 0 0 126 69 956 5 194 33 "
        "ED Josh Sweat 492 30 8.2 0.1 48",
        team="ARI",
        source_page=2,
    )

    assert row is not None
    assert row.projection_name == "Marvin Harrison Jr."
    assert row.targets == 126
    assert row.receptions == 69
    assert row.rec_yds == 956


def test_parse_offensive_projection_line_handles_comma_formatted_numbers() -> None:
    row = parse_offensive_projection_line(
        "QB Josh Allen 17 509 340 3,945 26 12 36 116 579 12 0 0 0 0 369 1",
        team="BUF",
        source_page=5,
    )

    assert row is not None
    assert row.pass_yds == 3945


def test_parse_offensive_projection_line_skips_total_and_unsupported_rows() -> None:
    assert (
        parse_offensive_projection_line(
            "QB Total 34 605 381 3949 18 11 46 55 242 2 0 0 0 0 236 131",
            team="ARI",
            source_page=2,
        )
        is None
    )
    assert (
        parse_offensive_projection_line(
            "K Tyler Bass 17 0 0 0 0 0 0 0 0 0 0 0 0 0 123 1",
            team="BUF",
            source_page=5,
        )
        is None
    )
