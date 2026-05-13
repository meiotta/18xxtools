# 18xxtools — Autotest Pipeline

End-to-end automated test pipeline for **18xxtools** (the JS map editor). Drives the editor's UI via Puppeteer, exercises a matrix of map + setup + edit combinations, exports the resulting Ruby files, deploys them into a sibling clone of the **tobymao/18xx** Ruby engine, and runs `Game.new` inside the engine to confirm each export is loadable end-to-end.

> **History note:** this folder was previously `erin/` on the `erin/deploy-output` branch. It was moved to `sidecar/autotest/` for discoverability — the `erin/` name made it look like a person's scratch folder when in fact it's the canonical round-trip test harness.

## Why it exists

18xxtools generates four Ruby files per game design (`game.rb`, `entities.rb`, `meta.rb`, `map.rb`). The only way to know those files are *actually correct* — not just syntactically valid — is to run them through the engine and confirm `Engine::Game::<Name>::Game.new(%w[Alice Bob])` doesn't crash. This pipeline automates that round-trip across 60 combinations so regressions in the JS exporters surface immediately instead of being found by a user.

## Folder structure

```
sidecar/autotest/
├── runner_linux.js     # main harness — Puppeteer + Node, drives one or all matrix rows
├── runner.js           # legacy Windows-only export harness; cannot deploy/verify
├── test_matrix.json    # the 60-row forge matrix (forge01–forge60)
├── puppet-lib/         # composable step library (next-gen) — see below
├── output/             # per-test artifacts: output/forgeNN/ holds the 4 Ruby files + edits.json
├── test_log.md         # written by runner_linux.js per run; one row per matrix entry
└── evan_updates.md     # Evan's running fix log; chronological RCA notes from prior runs
```

### `runner_linux.js`

The orchestrator. Single file, ~640 lines. Per matrix row:

1. Launches headless Chromium, `file://`-loads `index.html`.
2. Imports the chosen map (`importMap`), runs setup (A/B = upload tobymao's `entities.rb`+`game.rb`; C/D/E = synthesize companies/minors/nationals programmatically via `setupCustom`).
3. Applies two numbered edits (1–10) defined in `applyEdit`.
4. Forces `state.meta.title = 'ForgeNN'` so the exported module name comes out `GForgeNN`.
5. Syncs `state.corpPacks` from `companies`/`minors` (belt-and-suspenders for legacy `export-game.js` readers).
6. Captures the four exports via `renderGameRb()` / `renderEntitiesRb()` / `renderMetaRb()` / `exportRubyMap()`.
7. Writes the four files to `output/forgeNN/`.
8. Runs `ruby_sanityCheck()` — fails the test if any of the four files is empty, if `game.rb` lacks core constants, or if **module names disagree across the four files** (see below).
9. Deploys: copies `output/forgeNN/{game,entities,meta,map}.rb` into `${ENGINE_DIR}/g_forgeNN/`.
10. Verifies: `docker exec -w /18xx 18xx-rack-1 ruby -e "require_relative 'lib/engine'; Engine::Game::GForgeNN::Game.new(%w[Alice Bob Charlie])"`. PASS iff exit 0.

#### Environment variables (all optional — auto-discovery covers the common case)

| Var | Purpose | Default |
|---|---|---|
| `ERIN_ROOT` | 18xxtools repo root | one dir above this file |
| `ERIN_WORKTREE` | dir containing `index.html` | newest `.claude/worktrees/*` with `js/export-entities.js` |
| `ERIN_ENGINE_DIR` | tobymao engine's `lib/engine/game` dir | probes `/workspaces/18xx[-master]/lib/engine/game` and sibling clones |
| `ERIN_DOCKER` | verify container name | `18xx-rack-1` |
| `ERIN_BASE_URL` | override the `file://` URL | `file://${WORKTREE}/index.html` |

#### Exit status legend (one row per test in `test_log.md`)

- `PASS` — sanity-check passed, deploy succeeded, `ruby -e "Game.new"` exited 0.
- `FAIL` — page-load error, export issue from sanity-check, or `docker exec` ruby raised. Notes column has the exact reason.
- `UNSUPPORTED` — an edit returned `ok: false` (e.g. "no privates to replace"). Test ran, files were written, but the edit was a no-op.
- `EXPORTED` — exports OK but `ERIN_ENGINE_DIR` was not resolvable, so no deploy/verify happened (development-only mode).
- `BLOCKED` — legacy status from `runner.js` (Windows-only) when SSH to a codespace wasn't available; not produced by `runner_linux.js`.

### `puppet-lib/`

A composable step library + assembler — the **next-gen replacement** for `runner_linux.js`'s inline `applyEdit` / `setupCustom` switch statements. Six step modules + one runner:

| File | Steps exported |
|---|---|
| `map.js`        | `selectMap`, `getValidHomeHexes`, `addWaterUpgradeAbility` |
| `companies.js`  | `importCorpsFromGame`, `buildMajor`, `buildMinor`, `buildNational`, `addMajor`, `removeMajor`, `replacePrivateWithAbility`, `addPrivate` |
| `trains.js`     | `addTrain`, `reduceTrainCount`, `setNationalTrainRule`, `exportTopUnpurchasedTrain` |
| `mechanics.js`  | `setTileLayRule`, `setOrExportRule` |
| `market.js`     | `flipMarketType`, `setMarketType` |
| `rounds.js`     | `setOrSetTrainExport`, `setOrCount` |
| `runner.js`     | assembler — takes a permutation config and dispatches `edits[].type` to the right step |
| `index.js`      | re-exports the above for `require('../puppet-lib')` |

**Status:** the step modules and the assembler are on `main`. `runner_linux.js` does **not** currently delegate to `puppet-lib/` — its `applyEdit` and `setupCustom` are still inline. The migration is in flight; see Addy for the assembler roadmap and Tim for the rounds-step direction.

### `test_matrix.json`

JSON array of 60 forge IDs. Each row:

```json
{ "id": "forge01", "map": "1830", "setup": "A", "edit1": 1, "edit2": 6 }
```

- **map** — one of 8 supported maps
- **setup** — `A`/`B`/`C`/`D`/`E`. A/B import tobymao's `entities.rb`+`game.rb` for 1889/1846. C builds 6 majors. D builds 3 majors + 12 minors. E builds 5 majors + a national + 3 privates.
- **edit1 / edit2** — numbered 1–10. See `applyEdit` switch in `runner_linux.js`.

### `output/`

One subdirectory per matrix row (`forge01/` … `forge60/`). Each contains:

- `game.rb`, `entities.rb`, `meta.rb`, `map.rb` — the four Ruby exports
- `namespace.rb` — the top-level namespace file (see below)
- `edits.json` — `[{ edit, ok, note }, …]` for the two applied edits

`forge01/` is the canonical reference and is committed once a PASS is verified end-to-end. The other directories are regenerated per run.

## Running it

### One test
```bash
cd /workspaces/18xxtools
node sidecar/autotest/runner_linux.js forge01
```

PASS row in `test_log.md`:
```
| forge01  | 1830 | A | 1 | 6 | PASS | Ruby OK (e1:ok,e6:ok) module=GForge01 dir=g_forge01 |
```

### Full matrix
```bash
node sidecar/autotest/runner_linux.js
```

## The module-consistency check

Inside `ruby_sanityCheck()` (commit `b609180`). Extracts the game-specific module name from each of the four exports and asserts they all declare the same name. Fires **before** deploy. If any pair disagrees:
```
FAIL | Export issues: module name mismatch across exports (game.rb=GForge01, meta.rb=GGame, ...) — deploy aborted
```

## Why codespace + Docker

The verify step needs the tobymao engine source mounted inside a running container with its bundle installed. The standard tobymao `docker-compose.yml` provides this. Run the pipeline inside a codespace on `meiotta/18xx` where:

- `/workspaces/18xx` = engine source
- `/workspaces/18xxtools` = sibling clone of this repo (must be cloned separately)
- `docker compose up -d` in `/workspaces/18xx` brings up `18xx-rack-1`

Ask the repo admin for the active codespace URL.

## Agent roster

| Agent | Lane | Surface area |
|---|---|---|
| **Erin** | Deploy pipeline | `sidecar/autotest/runner_linux.js`, codespace + Docker setup, deploy + verify workflow, module-consistency check |
| **Jeff** | Export fixes | Bug fixes in `js/export-{game,entities,ruby}.js`; ability-kwarg shape; module-skeleton emission |
| **Max** | Renderer / map | Map rendering correctness (`js/renderer.js`), hex/city geometry, map-export DSL |
| **Evan** | Export pipeline | Architectural ownership of `js/export-*.js`; running RCA log in `evan_updates.md` |
| **Tim** | Rounds | `puppet-lib/rounds.js`, round-flow modeling, OR/SR step orchestration |
| **Mark** | Market | `puppet-lib/market.js`, market-type emission, market constant placeholders |
| **Addy** | Steps | `puppet-lib/*` step library composition + the `puppet-lib/runner.js` assembler |
| **Farrah** | TODO(Farrah): role TBD | — |

**Jeff/Evan overlap note:** Evan owns exporter architecture; Jeff lands specific shape-fix patches. Both touch `js/export-*.js` — coordinate to avoid double-patching the same line.

## Known limitations

### Parallel-emitter debt

Ability serialization lives in two places that must be kept in sync by hand:

- `_rbAbility` in `js/export-game.js`
- `_eiAbilityLine` in `js/export-entities.js`

Each new ability-kwarg fix must be applied to both. Jeff's RCA (verbatim):

> Two parallel ability serialisers maintained separately is the structural shape of this whole class of bug. `hexes:`, `corporations:`, `tiles:` etc. carry the same blind-emit risk in both `_rbAbility` and `_eiAbilityLine`. A more durable fix would be per-type kwarg allowlists driven by a table mirroring `ability/*.rb` `setup` signatures.

When patching one emitter, search the other for the same field name.

### The namespace file

Every tobymao game requires a **top-level namespace file** at `lib/engine/game/g_<slug>.rb`, sitting **next to** the `g_<slug>/` directory (not inside it). Without it, Zeitwerk cannot autoload the subdirectory and the engine raises `LoadError: cannot load such file -- engine/game/g_forge01` on first `require`.

Content is just the empty module declaration:

```ruby
# frozen_string_literal: true

module Engine
  module Game
    module GForge01
    end
  end
end
```

The exporter generates this via `renderNamespaceRb()` (in `js/export-game.js`). The pipeline writes it as `output/forgeNN/namespace.rb` and `deployGame()` copies it to `ENGINE_DIR/g_forgeNN.rb`. The bundled zip export (`exportFor18xxBtn`) has always included it. The `ruby_sanityCheck()` will flag a missing namespace file the same way it flags a missing `map.rb`.

### Other open items

- **1822MX DSL gaps** — `future_label=`, `groups:`, `track:thin`, multi-terrain `upgrade=` not yet round-trippable.
- **`sh: 2: class: not found` warnings** from rack-1 — cosmetic noise from `rerun`'s reload mechanism; ignore unless `worker=0 ready` never appears.
- **No CI yet** — matrix is run manually in the codespace.

## Useful commits

- `d6e4d91` — move `erin/` → `sidecar/autotest/` (Max)
- `b87817c` — bare-city renderer fix (Max)
- `b609180` — module-name consistency check (Erin)
- `c282ffd` / `2e7da76` — `shares:` gating fix, entities then game (Jeff)
- `dfa1b5e` — `require_relative 'meta'` + `include_meta` in game.rb skeleton (Jeff)
- `7a0b1a8` — emit `PLAYER_RANGE` in meta.rb (Jeff)
- `1e51c86` — wrap entities.rb in module hierarchy (Evan)
- `9fe4799` — wrap map.rb in `Engine::Game::GName::Map` module (Evan)

## Where to escalate

- Pipeline/Docker/codespace broken → **Erin**
- Ruby engine error from `lib/engine/ability/*.rb` or `meta.rb` → **Jeff**
- Syntactically broken Ruby export → **Evan** then **Jeff**
- Map rendering / cities / hexes wrong → **Max**
- New step needed in the matrix → **Addy** + **Erin**
- Rounds / OR-flow → **Tim**
- Market constants → **Mark**
