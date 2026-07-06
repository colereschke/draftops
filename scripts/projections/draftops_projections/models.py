from dataclasses import dataclass

SUPPORTED_POSITIONS = frozenset({"QB", "RB", "WR", "TE"})


@dataclass(frozen=True)
class ProjectionRow:
    projection_name: str
    projection_team: str
    projection_position: str
    games: int
    pass_att: int
    pass_cmp: int
    pass_yds: int
    pass_td: int
    pass_int: int
    pass_sacks: int
    rush_att: int
    rush_yds: int
    rush_td: int
    targets: int
    receptions: int
    rec_yds: int
    rec_td: int
    base_fantasy_points: float
    projection_rank: int | None
    source_page: int | None


@dataclass(frozen=True)
class SleeperPlayer:
    sleeper_id: str
    full_name: str
    first_name: str
    last_name: str
    search_full_name: str
    normalized_name: str
    team: str
    position: str
    fantasy_positions: tuple[str, ...]
    age: float | None
    years_exp: int | None
    active: bool
    status: str


@dataclass(frozen=True)
class MatchResult:
    projection: ProjectionRow
    sleeper: SleeperPlayer | None
    match_method: str
    match_confidence: float
    notes: str
    candidate_sleeper_ids: tuple[str, ...] = ()
    candidate_names: tuple[str, ...] = ()


@dataclass(frozen=True)
class MasterProjectionRow:
    projection: ProjectionRow
    sleeper: SleeperPlayer | None
    match_method: str
    match_confidence: float
