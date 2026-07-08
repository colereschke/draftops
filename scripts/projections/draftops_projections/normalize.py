from __future__ import annotations

import re
import unicodedata

from draftops_projections.models import SUPPORTED_POSITIONS

SUFFIX_RE = re.compile(r"\b(jr|sr|ii|iii|iv|v)\.?\b", re.IGNORECASE)
MIDDLE_INITIAL_RE = re.compile(r"\b[a-z]\b", re.IGNORECASE)
WHITESPACE_RE = re.compile(r"\s+")

TEAM_ALIASES = {
    "ARI": "ARI",
    "ARZ": "ARI",
    "ATL": "ATL",
    "BAL": "BAL",
    "BLT": "BAL",
    "BUF": "BUF",
    "CAR": "CAR",
    "CHI": "CHI",
    "CIN": "CIN",
    "CLE": "CLE",
    "CLV": "CLE",
    "DAL": "DAL",
    "DEN": "DEN",
    "DET": "DET",
    "GB": "GB",
    "HOU": "HOU",
    "HST": "HOU",
    "IND": "IND",
    "JAC": "JAX",
    "JAX": "JAX",
    "KC": "KC",
    "LA": "LAR",
    "LAC": "LAC",
    "LAR": "LAR",
    "LV": "LV",
    "OAK": "LV",
    "MIA": "MIA",
    "MIN": "MIN",
    "NE": "NE",
    "NO": "NO",
    "NYG": "NYG",
    "NYJ": "NYJ",
    "PHI": "PHI",
    "PIT": "PIT",
    "SEA": "SEA",
    "SF": "SF",
    "TB": "TB",
    "TEN": "TEN",
    "WFT": "WAS",
    "WAS": "WAS",
    "WSH": "WAS",
}


def normalize_name(name: str) -> str:
    normalized = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    normalized = normalized.lower().strip()
    normalized = normalized.replace(".", "")
    normalized = normalized.replace("'", "")
    normalized = normalized.replace("-", "")
    normalized = normalized.replace(",", "")
    normalized = SUFFIX_RE.sub("", normalized)
    normalized = MIDDLE_INITIAL_RE.sub("", normalized)
    return WHITESPACE_RE.sub(" ", normalized).strip()


def normalize_team(team: str | None) -> str:
    if team is None:
        return ""
    raw_team = team.strip().upper()
    if raw_team in {"", "FA", "-", "—", "–"}:
        return ""
    return TEAM_ALIASES.get(raw_team, raw_team)


def normalize_position(position: str | None) -> str | None:
    if position is None:
        return None
    normalized = position.strip().upper()
    if normalized in SUPPORTED_POSITIONS:
        return normalized
    return None
