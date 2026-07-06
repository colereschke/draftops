from __future__ import annotations

import argparse
from collections.abc import Sequence
from pathlib import Path

from draftops_projections.pipeline import run_pipeline
from draftops_projections.validate import DEFAULT_REQUIRED_KNOWN_PLAYERS, ValidationError

DEFAULT_PDF_PATH = Path("data/raw/NFLDK2026_CS_ClayProjections2026.pdf")
DEFAULT_SLEEPER_PATH = Path("data/raw/sleeper_players.json")
DEFAULT_OUTPUT_DIR = Path("data/generated")


def main(argv: Sequence[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)

    required_known_players: Sequence[str]
    if args.skip_known_player_validation:
        required_known_players = ()
    else:
        required_known_players = DEFAULT_REQUIRED_KNOWN_PLAYERS

    try:
        result = run_pipeline(
            pdf_path=args.pdf if args.raw_projections_csv is None else None,
            raw_projections_csv=args.raw_projections_csv,
            sleeper_json=args.sleeper_json,
            output_dir=args.output_dir,
            require_minimums=args.raw_projections_csv is None,
            required_known_players=required_known_players,
        )
    except ValidationError as error:
        print(f"Validation failed: {error}")
        return 1

    _print_summary(result.summary.position_counts, "Mike Clay projections extracted")
    _print_summary(result.summary.matched_counts, "Matched to Sleeper")
    _print_summary(result.summary.unmatched_counts, "Unmatched")
    print(f"Output written: {args.output_dir}")
    return 0


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Generate DraftOps projection CSVs.")
    parser.add_argument("--pdf", type=Path, default=DEFAULT_PDF_PATH)
    parser.add_argument("--raw-projections-csv", type=Path, default=None)
    parser.add_argument("--sleeper-json", type=Path, default=DEFAULT_SLEEPER_PATH)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--skip-known-player-validation", action="store_true")
    return parser


def _print_summary(counts: dict[str, int], label: str) -> None:
    print(f"{label}:")
    for position in ("QB", "RB", "WR", "TE"):
        print(f"  {position}: {counts.get(position, 0)}")
