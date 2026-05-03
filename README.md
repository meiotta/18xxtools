# 18xx Game Designer

A browser-based designer for creating 18xx-family board games compatible with the [18xx.games](https://18xx.games) engine (tobymao). No build step — open `index.html` directly. Design from scratch or import an existing game's `.rb` source files; every UI change writes to the same export pipeline, so import and export are the same lossless round-trip.

## What it does

The tool covers the full surface of a tobymao game.rb / entities.rb definition across five panels:

**Map** — hex grid editor (flat-top, configurable size). Paint terrain with cost labels, place and rotate standard 18xx track tiles (yellow/green/brown/grey), add cities, OO cities, towns, and dual-town dits. Right-click context menu for all hex operations. Tile rendering is ported from tobymao source (`assets/app/view/game/part/`) — every rendering decision traces to a specific Ruby source line.

**Companies** — define private companies with face value, revenue, abilities (all ~50 tobymao ability fields parsed and editable), auction tier, and mail-contract flag. Define corporations (majors, minors) with color, home token hex, par value, token count, and full ability set. Import from entities.rb — all 8 target games (1822, 1822PNW, 1830, 1846, 1889, 1882, 1822MX, 1870) round-trip cleanly.

**Trains & Phases** — define train types (distance, cost, count, rust conditions, variants, event triggers) and phases (train trigger, operating rounds, tile colors, status flags, events). Phase status tags drawn from a catalog of 50+ tobymao status strings. Import from game.rb. Export emits valid `TRAINS` and `PHASES` Ruby constants.

**Mechanics** — game-wide constants: bank cash, player range, starting cash, cert limits, stock-round rules (sell order, movement, blocking), operating-round rules (tile lays, train requirements, emergency buy), game-end conditions, event triggers. Every green-dot field emits to the rb preview unconditionally — what the panel says is set, the rb states. Import from game.rb builds a `functionMap` with four entry types: `const` (known constant), `ref` (pointer to another panel's state), `method` (recognized method body), and `raw` (opaque Ruby for anything not yet editable).

**Rounds** — define the round structure: initial round class (waterfall auction, draft, stock-direct), stock-round and operating-round step lists (ordered, with per-step options like `{ blocks: true }`, duplicates supported), merger round configuration. Emit-only-when-customized — a 1830-vanilla game produces no round Ruby at all and inherits from base.rb. The rb preview updates live.

## Import / Export

**Import game.rb** — parses `TRAINS`, `PHASES`, `BANK_CASH`, `STARTING_CASH`, `CERT_LIMIT`, `PLAYERS_RANGE`, all stock/OR rule constants, and game-end checks into editable state. Unrepresentable Ruby becomes a `raw` functionMap entry shown in the panel but not editable.

**Import entities.rb** — parses `COMPANIES` (all ~50 ability fields) and `CORPORATIONS`/`MINORS`. Import order is independent — game.rb-first or entities-first both resolve correctly via deferred name linking.

**Export game.rb** — the Preview button in Mechanics shows a live game.rb. All panels write to the same pipeline: trains, phases, companies, corporations, and mechanics all emit into named slots in the `_GAME_RB_SKELETON`. Round factory methods (`def init_round`, `def stock_round`, `def operating_round`, `def next_round!`) emit only when the designer departs from base.rb defaults.

**Export entities.rb** — companies and corporations export to a separate entities.rb. Round-trip verified against all 8 target games.

## Usage

1. Open `index.html` in any modern browser (Chrome, Firefox, Safari, Edge)
2. Use the left rail icons to switch between Map, Companies, Trains & Phases, Mechanics, and Rounds
3. Import an existing game: File → Import game.rb and/or Import entities.rb
4. Design 