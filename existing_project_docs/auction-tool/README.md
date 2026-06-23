# Dynasty Auction Startup Tool

## Project Overview

This is a fantasy football dynasty auction startup draft tool. It started as a quick value sheet and is intended to grow into a full auction draft tracker with team-by-team spend tracking, player assignment logging, and live budget management for all 12 teams.

---

## League Context

| Setting | Value |
|---|---|
| Platform | Sleeper |
| Format | Dynasty (keep players year-over-year) |
| Teams | 12 |
| Roster Size | 30 players per team |
| Starters | 13 (exact lineup TBD) |
| Bench | 17 |
| Scoring | Full PPR + TE premium (+1 PPR reception, +0.25 first down for TEs) |
| QB Format | **Superflex** (QB/RB/WR/TE in flex) — QBs are premium assets |
| Auction Budget | **$1,000 per team** |
| Nomination | 2 concurrent nominations, 12-hour timer |
| Rookies | 2026 rookies included in startup pool |
| Draft Style | Slow auction (OTC platform) |

### Scoring Details (from Sleeper)
- Passing: 0.05/yd (20 yds = 1 pt), 6 pts/TD, -2 INT, +3 bonus for 50+ yd TD
- Rushing: 0.1/yd, 6 pts/TD, +0.25 first down, +0.1/attempt, +5 bonus for 50+ yd TD
- Receiving: 1 pt/reception (PPR), 0.1/yd, 6 pts/TD, +0.5 first down, +5 bonus for 50+ yd TD
- **TE Premium**: +1 pt/reception (on top of PPR), +0.25 first down bonus (additional)

---

## 2027 Pick Package System (Important!)

This league has a unique wrinkle for 2027 rookie picks. Each team's **entire 2027 pick package (1st + 2nd + 3rd round picks)** is represented by a specific **kicker placeholder** in the auction. Winning the bid on a kicker nets you that team's complete 2027 1st, 2nd, and 3rd round draft picks.

**2028 picks are NOT available in the startup auction.**

### Kicker → Team Assignments

| Kicker | Team/Manager |
|---|---|
| Cameron Dicker | chappy72 |
| Tyler Loop | DrFunk |
| Brandon Aubrey | Henrizzler87 |
| Jake Bates | CharlesChillFFB |
| Tyler Bass | moneymarkel2626 |
| Cam Little | sam4bama |
| Nick Folk | mattveksler |
| Matt Gay | coreschke (this user) |
| Will Lutz | gaf2323 |
| Harrison Butker | dark44 |
| Jason Sanders | SlamminSam58 |
| Chris Boswell | JHenny74 |

**Note:** "coreschke" is the user (Cole). Matt Gay = coreschke's own 2027 picks.

### Pick Package Valuation
- 2027 1st: ~$75 target (scaled from $15 on $200 budget)
- 2027 2nd: ~$15 target
- 2027 3rd: ~$5 target
- **Package total: ~$95 raw, ~$109 with SF speculative premium**
- Ceiling: ~$130 (room can run hot on these in SF formats)
- Floor: ~$75 (don't let them go cheap)

---

## Value Sheet Methodology

### Source Data
- `Dynasty_Rankings.csv` — custom rankings file with SF/TE premium positional ranks and both 1QB and 2QB auction values (based on $200 budget)

### Scaling
- Base values from the `2QBAuction` column in the CSV (Superflex format)
- **Multiplied by 5x** to convert $200 → $1,000 budget
- **TE premium adjustment**: ~18% upward bump on all TE values to account for the additional PPR and first down scoring

### Value Columns (in the UI)
- **Floor**: ~87% of target — steal territory, outperform if you land here
- **Target**: Calibrated bid price
- **Ceiling**: ~115% of target — hard stop, walk away above this

### Position Color Coding
- QB: Blue
- RB: Green  
- WR: Amber/Orange
- TE: Purple
- PICK: Teal
- PKG (2027 package): Gold

### Age Color Coding
- ≤24: Green (dynasty sweet spot)
- 25–27: White (prime years)
- 28–30: Amber (aging concern)
- 31+: Red (heavy discount in dynasty)

---

## Current State of the App

The current `src/AuctionSheet.jsx` is a single React component (no build tooling, designed to run as a Claude artifact). It includes:

- Full player table (~300 players) with SF rank, position, team, age, floor/target/ceiling
- Position filter tabs (ALL / QB / RB / WR / TE / PICK / PKG)
- Search by player name or team
- Sort by any column
- Show/hide notes column
- Simple budget tracker (manual spend entry, shows remaining)
- Budget bar showing positional market weight
- Age color coding
- Rookie badge (R)
- Pick package badge (PKG)

---

## What Needs to Be Built Next

### 1. Team Roster Tracker
The biggest gap. Need to track:
- All 12 teams and their managers (see manager list below)
- Which players each team has won
- How much each team has spent
- How much budget each team has remaining
- How many roster spots each team has filled (max 30)

This would likely be a second "tab" or view in the app.

### 2. Live Auction Log
- A feed/log of completed bids: Player → Team → Price
- Ability to add a result (player, winning team, winning price)
- Should update team budgets and roster counts automatically

### 3. Budget Pressure View
- Show which teams are "dangerous" (lots of budget remaining, few spots to fill)
- Show which teams are "done" (low budget relative to spots remaining)
- Classic auction tracker math: `remaining_budget - remaining_spots` = effective buying power

### 4. Nomination Helper
- Which players to nominate to burn rival budgets
- Could cross-reference known team composition vs. remaining player pool

---

## 12 Teams / Managers

| Manager Handle | Notes |
|---|---|
| coreschke | **This user (Cole)** |
| chappy72 | |
| DrFunk | |
| Henrizzler87 | |
| CharlesChillFFB | |
| moneymarkel2626 | |
| sam4bama | |
| mattveksler | |
| gaf2323 | |
| dark44 | |
| SlamminSam58 | |
| JHenny74 | |

---

## Technical Notes

- Current component is designed as a standalone React artifact (no build step, runs in Claude's artifact renderer)
- Uses only React hooks (useState, useMemo) — no external dependencies beyond React
- Styling is all inline CSS (no CSS-in-JS library, no Tailwind)
- Data is hardcoded in the component from the CSV — a refactor to load the CSV at runtime would be cleaner
- The `fixedPlayers` array is the canonical player list with scaled values applied
- For Claude Code: the app should probably be scaffolded as a proper Vite + React project for local dev, with the player data extracted to a separate `data/players.js` or loaded from the CSV

---

## Files in This Package

```
auction-tool/
├── README.md                  ← This file (full project context)
├── src/
│   ├── AuctionSheet.jsx       ← Current working React component (value sheet)
│   └── Dynasty_Rankings.csv  ← Source rankings data (SF/TE premium, 1QB + 2QB auction values)
```
