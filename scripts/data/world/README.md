# Build Your XI — World Data

This directory contains the source and processed data pipeline for the World game mode.

## Current World scope

The initial World game uses:

- Format: Men's ODI
- Competition: ICC Men's Cricket World Cup
- Season unit: World Cup edition
- Editions:
  - 2011
  - 2015
  - 2019
  - 2023

The season is the tournament edition, not a generic calendar year.

---

## Source hierarchy

World data follows this source hierarchy:

### 1. Primary sources

Use official ICC material whenever available:

- ICC tournament pages
- ICC match centres
- ICC official scorecards
- ICC tournament statistics
- ICC tournament media guides
- ICC player profiles
- ICC official squad announcements

### 2. Secondary sources

If ICC does not expose a required field, use the relevant national cricket board's official source.

Examples:

- BCCI
- Cricket Australia
- ECB
- PCB
- Cricket South Africa
- New Zealand Cricket
- Sri Lanka Cricket
- Bangladesh Cricket Board
- Cricket West Indies
- Afghanistan Cricket Board
- Cricket Ireland
- Cricket Scotland
- Cricket Zimbabwe
- Cricket Kenya
- Netherlands Cricket

### 3. Third-party sources

Third-party datasets may only be used for:

- cross-checking
- identifying possible discrepancies
- locating missing source material

They are not authoritative for the imported game data.

---

## Data pipeline

The intended pipeline is:

official source
    ↓
raw source record
    ↓
normalized processed JSON
    ↓
validation
    ↓
Supabase
    ↓
World game APIs

Application code must never contain a hard-coded World player pool.

---

## Role normalization

The World game supports four role categories:

- WK
- BAT
- AR
- BOWL

A player may only enter the World game pool after their role has been verified.

Unresolved roles must be excluded.

Do not guess a player's role from:

- batting position
- number of wickets
- strike rate
- bowling average
- fantasy-cricket classifications
- third-party player databases

The role must be supported by an official source or documented official team classification.

---

## XI validation

World XI selection does not use fielding positions.

The required role structure is:

| Role | Minimum |
|---|---:|
| WK | 1 |
| BAT | 4 |
| AR | 1 |
| BOWL | 3 |
| AR + BOWL | 5 |

The XI must contain exactly 11 players.

The following must therefore be true:

- WK >= 1
- BAT >= 4
- AR >= 1
- BOWL >= 3
- AR + BOWL >= 5
- Total players = 11

---

## Database architecture

World uses the generic tables:

- teams
- seasons
- team_seasons
- players
- player_season_stats
- player_roles

Shared game tables:

- game_sessions
- game_players
- game_scores
- game_results
- challenge_scores
- challenges

World game sessions use:

`game_sessions.game_mode = 'world'`

and:

`game_sessions.world_team_season_id`

IPL continues using:

`game_sessions.team_season_id`

Do not reuse the IPL foreign key for World.

---

## World API architecture

Planned World endpoints:

/api/world/random/team
/api/world/random/season
/api/world/team-season/[id]/players
/api/world/game/complete

Additional endpoints may be introduced when challenge and leaderboard integration is implemented.

---

## Security principles

The client must never be trusted for:

- player eligibility
- player statistics
- team-season ownership
- score calculation
- challenge score submission
- final game result
- leaderboard score

The server must retrieve authoritative game data from Supabase.

The client submits selections.

The server validates those selections against the database.

The server calculates the final score.

---

## Data integrity

Every World player-season relationship must belong to:

1. a valid player
2. a valid team
3. a valid World Cup edition
4. a valid team-season relationship

A player must not be inserted into the game pool merely because their name appears in a source document.

---

## Import policy

World import scripts should be:

- repeatable
- idempotent
- database-driven
- safe to re-run
- independent from the application UI
- independent from hard-coded player pools

Use upserts where the schema supports a unique constraint.

Do not create duplicate teams, players, seasons, or team-season relationships.

---

## 2011 data

The 2011 World Cup data requires additional source verification.

Some official ICC pages contain final squads for individual teams, while other available ICC pages describe preliminary squads.

Therefore:

- preliminary squad data must not be imported as final squad data
- missing final squad information must be obtained from an official source
- no player should be added merely to make the dataset complete

---

## Validation requirement

Before importing World data, run validation that checks:

- duplicate players
- duplicate teams
- duplicate seasons
- duplicate team-season relationships
- missing roles
- invalid roles
- missing statistics
- orphaned player-season records
- duplicate player-season records
- invalid team-season references

The importer must fail rather than silently import invalid data.

---

## Important

Do not put World player arrays inside:

`src/lib/world`

or React components.

World data belongs in Supabase.

The application should query the database through server-side APIs.