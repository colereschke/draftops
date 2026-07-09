from __future__ import annotations

import argparse
import csv
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path

from draftops_projections.aliases import MANUAL_ALIASES
from draftops_projections.models import SleeperPlayer
from draftops_projections.normalize import normalize_name, normalize_position, normalize_team
from draftops_projections.sleeper import load_active_sleeper_players


@dataclass(frozen=True)
class EtrMatchResult:
    etr_name: str
    etr_team: str
    etr_position: str
    sleeper: SleeperPlayer | None
    match_method: str
    match_confidence: float
    notes: str


def match_etr_value_row(
    row: dict[str, str],
    sleeper_players: Sequence[SleeperPlayer],
) -> EtrMatchResult:
    name = row["Player"].strip()
    team = normalize_team(row.get("Team", ""))
    position = normalize_position(row.get("Position", ""))
    normalized_name = normalize_name(name)

    if position is None:
        return EtrMatchResult(
            name, team, "", None, "unsupported_position", 0, "unsupported_position"
        )

    candidates = [
        player
        for player in sleeper_players
        if player.normalized_name == normalized_name
        and player.position == position
        and (team == "" or player.team == team)
    ]
    if len(candidates) == 1:
        method = "normalized_name_position" if team == "" else "normalized_name_team_position"
        confidence = 0.9 if team == "" else 0.98
        return EtrMatchResult(name, team, position, candidates[0], method, confidence, "")

    if len(candidates) > 1:
        return EtrMatchResult(name, team, position, None, "ambiguous_match", 0, "ambiguous_match")

    alias_name = MANUAL_ALIASES.get(normalized_name)
    if alias_name is not None:
        alias_candidates = [
            player
            for player in sleeper_players
            if player.normalized_name == alias_name
            and player.position == position
            and (team == "" or player.team == team)
        ]
        if len(alias_candidates) == 1:
            return EtrMatchResult(
                name,
                team,
                position,
                alias_candidates[0],
                "alias",
                0.95,
                f"alias:{normalized_name}->{alias_name}",
            )
        if len(alias_candidates) > 1:
            return EtrMatchResult(
                name, team, position, None, "ambiguous_match", 0, "ambiguous_alias_match"
            )

    return EtrMatchResult(name, team, position, None, "no_match", 0, "no_match")


def generate_etr_match_csv(
    *,
    etr_csv: Path,
    sleeper_json: Path,
    output_csv: Path,
) -> list[EtrMatchResult]:
    sleeper_players = load_active_sleeper_players(sleeper_json)
    with etr_csv.open(newline="", encoding="utf-8-sig") as file:
        results = [match_etr_value_row(row, sleeper_players) for row in csv.DictReader(file)]

    output_csv.parent.mkdir(parents=True, exist_ok=True)
    with output_csv.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(
            file,
            fieldnames=[
                "etr_name",
                "etr_team",
                "etr_position",
                "sleeper_id",
                "sleeper_name",
                "sleeper_team",
                "match_method",
                "match_confidence",
                "notes",
            ],
        )
        writer.writeheader()
        for result in results:
            writer.writerow(
                {
                    "etr_name": result.etr_name,
                    "etr_team": result.etr_team,
                    "etr_position": result.etr_position,
                    "sleeper_id": result.sleeper.sleeper_id if result.sleeper else "",
                    "sleeper_name": result.sleeper.full_name if result.sleeper else "",
                    "sleeper_team": result.sleeper.team if result.sleeper else "",
                    "match_method": result.match_method,
                    "match_confidence": result.match_confidence,
                    "notes": result.notes,
                }
            )
    return results


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Match ETR dynasty values to Sleeper IDs.")
    parser.add_argument("--etr-csv", type=Path, required=True)
    parser.add_argument("--sleeper-json", type=Path, required=True)
    parser.add_argument("--output-csv", type=Path, required=True)
    args = parser.parse_args(argv)

    results = generate_etr_match_csv(
        etr_csv=args.etr_csv,
        sleeper_json=args.sleeper_json,
        output_csv=args.output_csv,
    )
    matched = sum(1 for result in results if result.sleeper is not None)
    print(f"Matched {matched}/{len(results)} ETR rows")
    print(f"Output written: {args.output_csv}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
