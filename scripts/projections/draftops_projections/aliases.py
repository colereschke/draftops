"""Manual player aliases for projection-to-Sleeper matching.

Keep in sync with src/lib/sleeperMatch.ts's MANUAL_ALIASES (TS rankings-upload matcher) — same
purpose, duplicated across the Python/TS boundary rather than shared since it's a short, static
list.
"""

MANUAL_ALIASES: dict[str, str] = {
    "bam knight": "zonovan knight",
    "cameron ward": "cam ward",
    "chigoziem okonkwo": "chig okonkwo",
    "christopher rodriguez": "chris rodriguez",
    "hollywood brown": "marquise brown",
    "josh palmer": "joshua palmer",
    "ken walker": "kenneth walker",
    "kenneth gainwell": "kenny gainwell",
    "nathaniel dell": "tank dell",
    "nick singleton": "nicholas singleton",
}
