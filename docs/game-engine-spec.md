# Game Engine Specification

## Purpose

Define tournament simulation behavior, rules accuracy requirements, and replay model for LLM Hold'em v1.

## 1. Tournament Configuration (v1 fixed defaults)

- Format: single-table SNG
- Seats: 6 max
- Players: LLM agents only
- Starting stack: 2000 chips each
- Blinds start: 10/20
- Blind level cadence: every 10 completed hands
- Level style: standard doubling-ish progression
- Payout: none (rankings only)

## 2. Blind Level Preset

Because “standard doubling-ish” was selected, define a fixed list in code, for example:

1. 10/20
2. 15/30
3. 20/40
4. 30/60
5. 40/80
6. 50/100
7. 75/150
8. 100/200
9. 150/300
10. 200/400
11. 300/600
12. 400/800
13. 500/1000
14. 700/1400
15. 1000/2000

This list can be tuned later, but must remain deterministic and fixed for v1.

## 3. Rules Accuracy Requirements

The engine must correctly implement:

- Texas Hold’em betting rounds: preflop, flop, turn, river,
- action order by position and street,
- no-limit bet/raise/all-in semantics,
- minimum raise logic and re-open conditions,
- short-stack all-ins,
- side pot creation and settlement,
- split-pot tie outcomes,
- showdown hand ranking and kicker rules,
- folded hand eligibility removal,
- dead-button handling in tournament progression,
- heads-up transition with correct blind/button assignment.

## 4. Hand State Machine

### 4.1 Hand start

1. Advance dealer/button based on live players and dead-button rules.
2. Post blinds with all-in adjustment if stack < blind.
3. Deal hole cards to active players.
4. Initialize hand pots and round context.

### 4.2 Street progression

For each street:

1. Set first actor based on street and live players.
2. Loop actions until betting round closure criteria are met.
3. Deal community cards if at least two non-folded players remain.

### 4.3 Early termination

If one player remains un-folded before showdown:

- award all current pots immediately,
- skip remaining streets,
- record uncontested win event.

### 4.4 Showdown

- reveal eligible players’ hands,
- rank hands,
- distribute main + side pots with split handling,
- update stacks and elimination states.

## 5. Legal Action Computation

At every decision point, compute legal options from current state:

- `fold` (if facing bet)
- `check` (if no amount to call)
- `call` (up to player stack)
- `bet` (if no prior wager on street)
- `raise` (if facing wager and min-raise allowed)
- `all_in` (always legal when player has chips)

Computed action set must include:

- call amount,
- min raise total,
- max raise total,
- effective stack and commitment deltas.

## 6. LLM Action Resolution

Action pipeline:

1. Build prompt context.
2. Request JSON action.
3. Parse and validate.
4. If invalid/illegal, retry once with explicit reason.
5. If still invalid, apply forced fold.
6. Persist both attempts and final resolved action metadata.

## 7. Public Information Model for Prompting

Prompt context must include only information visible to a real player at decision time:

- seat map and positions,
- blind level and hand number,
- visible board cards,
- public betting actions and bet sizes,
- stack sizes and chips behind,
- public pot/side-pot totals,
- prior public events in the hand.

Never include hidden hole cards of opponents or undealt deck information.

## 8. Replay and Timeline Model

### 8.1 Timeline events

Persist ordered immutable event stream for each match:

- hand lifecycle events,
- action requests and outcomes,
- board reveals,
- pot distributions,
- eliminations,
- blind level changes,
- final standings.

### 8.2 Navigation semantics

- step forward/backward navigates event index,
- backward is replay-only (no rollback and branch simulation),
- current view state = fold(event[0..index]).

### 8.3 Auto-run + controls

Match may run continuously while UI receives WS updates.

Controls:

- pause execution,
- resume execution,
- step one event forward,
- step one event backward (already-recorded events only),
- adjustable playback speed.

## 9. Determinism Requirements

Persist seed on match creation.

Given same:

- seed,
- initial configuration,
- sequence of resolved actions,

the game engine must produce identical timeline and results.

## 10. Error and Edge Case Policy

- malformed agent output => retry once then force-fold,
- provider timeout/error => treat as unresolved action and force-fold (with telemetry),
- impossible state detection => mark match failed and preserve forensic logs,
- arithmetic precision => use integer chip units only.

## 11. Output Artifacts

Each completed match must persist:

- final standings (1..6),
- elimination order,
- full event timeline,
- per-action telemetry,
- per-agent aggregate stats,
- seed and config snapshot.
