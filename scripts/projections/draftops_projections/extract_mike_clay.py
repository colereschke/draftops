from __future__ import annotations

from collections.abc import Iterable
from pathlib import Path

import pdfplumber

from draftops_projections.models import ProjectionRow
from draftops_projections.normalize import normalize_team

OFFENSIVE_FIELD_COUNT = 16
TEAM_NAME_TO_ABBR = {
    "Arizona Cardinals": "ARI",
    "Atlanta Falcons": "ATL",
    "Baltimore Ravens": "BAL",
    "Buffalo Bills": "BUF",
    "Carolina Panthers": "CAR",
    "Chicago Bears": "CHI",
    "Cincinnati Bengals": "CIN",
    "Cleveland Browns": "CLE",
    "Dallas Cowboys": "DAL",
    "Denver Broncos": "DEN",
    "Detroit Lions": "DET",
    "Green Bay Packers": "GB",
    "Houston Texans": "HOU",
    "Indianapolis Colts": "IND",
    "Jacksonville Jaguars": "JAX",
    "Kansas City Chiefs": "KC",
    "Las Vegas Raiders": "LV",
    "Los Angeles Chargers": "LAC",
    "Los Angeles Rams": "LAR",
    "Miami Dolphins": "MIA",
    "Minnesota Vikings": "MIN",
    "New England Patriots": "NE",
    "New Orleans Saints": "NO",
    "New York Giants": "NYG",
    "New York Jets": "NYJ",
    "Philadelphia Eagles": "PHI",
    "Pittsburgh Steelers": "PIT",
    "San Francisco 49ers": "SF",
    "Seattle Seahawks": "SEA",
    "Tampa Bay Buccaneers": "TB",
    "Tennessee Titans": "TEN",
    "Washington Commanders": "WAS",
}


def extract_mike_clay_projections(
    pdf_path: Path,
    *,
    start_page: int = 2,
    end_page: int = 33,
) -> list[ProjectionRow]:
    rows: list[ProjectionRow] = []
    with pdfplumber.open(pdf_path) as pdf:
        for page_number in range(start_page, end_page + 1):
            page = pdf.pages[page_number - 1]
            text = page.extract_text(x_tolerance=1, y_tolerance=3) or ""
            team = _team_from_lines(text.splitlines())
            if team == "":
                continue
            for line in text.splitlines():
                row = parse_offensive_projection_line(line, team=team, source_page=page_number)
                if row is not None:
                    rows.append(row)
    return rows


def parse_offensive_projection_line(
    line: str,
    *,
    team: str,
    source_page: int,
) -> ProjectionRow | None:
    tokens = line.split()
    if not tokens or tokens[0] not in {"QB", "RB", "WR", "TE"}:
        return None

    position = tokens[0]
    first_number_index = _first_numeric_token_index(tokens)
    if first_number_index is None or first_number_index <= 1:
        return None

    name = " ".join(tokens[1:first_number_index])
    if name == "Total":
        return None

    numeric_tokens = tokens[first_number_index : first_number_index + OFFENSIVE_FIELD_COUNT]
    if len(numeric_tokens) < OFFENSIVE_FIELD_COUNT:
        return None
    if any(not _is_number(token) for token in numeric_tokens):
        return None

    values = [_parse_number(token) for token in numeric_tokens]
    return ProjectionRow(
        projection_name=name,
        projection_team=normalize_team(team),
        projection_position=position,
        games=int(values[0]),
        pass_att=int(values[1]),
        pass_cmp=int(values[2]),
        pass_yds=int(values[3]),
        pass_td=int(values[4]),
        pass_int=int(values[5]),
        pass_sacks=int(values[6]),
        rush_att=int(values[7]),
        rush_yds=int(values[8]),
        rush_td=int(values[9]),
        targets=int(values[10]),
        receptions=int(values[11]),
        rec_yds=int(values[12]),
        rec_td=int(values[13]),
        base_fantasy_points=float(values[14]),
        projection_rank=int(values[15]),
        source_page=source_page,
    )


def _team_from_lines(lines: Iterable[str]) -> str:
    for line in lines:
        if not line.startswith("2026 ") or not line.endswith(" Projections"):
            continue
        team_name = line.removeprefix("2026 ").removesuffix(" Projections")
        return TEAM_NAME_TO_ABBR.get(team_name, "")
    return ""


def _first_numeric_token_index(tokens: list[str]) -> int | None:
    for index, token in enumerate(tokens):
        if _is_number(token):
            return index
    return None


def _is_number(token: str) -> bool:
    try:
        _parse_number(token)
    except ValueError:
        return False
    return True


def _parse_number(token: str) -> float:
    return float(token.replace(",", ""))
