from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from draftops_projections.models import SleeperPlayer
from draftops_projections.normalize import normalize_name, normalize_position, normalize_team


def load_active_sleeper_players(path: Path) -> list[SleeperPlayer]:
    raw_data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw_data, dict):
        raise ValueError("Sleeper player data must be a JSON object keyed by player ID")

    players: list[SleeperPlayer] = []
    for raw_player in raw_data.values():
        if not isinstance(raw_player, dict):
            continue
        player = _parse_sleeper_player(raw_player)
        if player is not None:
            players.append(player)
    return players


def _parse_sleeper_player(raw_player: dict[str, Any]) -> SleeperPlayer | None:
    if raw_player.get("active") is not True:
        return None

    position = normalize_position(_optional_string(raw_player.get("position")))
    if position is None:
        return None

    full_name = _optional_string(raw_player.get("full_name"))
    player_id = _optional_string(raw_player.get("player_id"))
    if full_name == "" or player_id == "":
        return None

    fantasy_positions = raw_player.get("fantasy_positions")
    if isinstance(fantasy_positions, list):
        parsed_fantasy_positions = tuple(
            item for item in (_optional_string(value) for value in fantasy_positions) if item
        )
    else:
        parsed_fantasy_positions = ()

    return SleeperPlayer(
        sleeper_id=player_id,
        full_name=full_name,
        first_name=_optional_string(raw_player.get("first_name")),
        last_name=_optional_string(raw_player.get("last_name")),
        search_full_name=_optional_string(raw_player.get("search_full_name")),
        normalized_name=normalize_name(full_name),
        team=normalize_team(_optional_string(raw_player.get("team"))),
        position=position,
        fantasy_positions=parsed_fantasy_positions,
        age=_optional_float(raw_player.get("age")),
        years_exp=_optional_int(raw_player.get("years_exp")),
        active=True,
        status=_optional_string(raw_player.get("status")),
    )


def _optional_string(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    return str(value)


def _optional_float(value: object) -> float | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, int | float):
        return float(value)
    if isinstance(value, str) and value.strip():
        return float(value)
    return None


def _optional_int(value: object) -> int | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str) and value.strip():
        return int(value)
    return None
