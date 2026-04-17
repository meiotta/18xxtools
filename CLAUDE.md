# 18xxtools — Claude Session Rules

Read `PROJECT_REFERENCE.md` before doing anything. It defines the full project context, file locations, coordinate systems, and ground rules. This file is the short version.

---

## What this project is

A vanilla JS map editor for designing 18xx board games. No build step. All editable code is in `js/`. The renderer is `js/renderer.js`.

**Tobymao** (`C:\Users\meiot\Rail\18xx-master`) is Toby Mao's open-source Ruby 18xx game engine at https://18xx.games. It is the ground truth for every rendering decision — how cities are positioned, how revenue bubbles are placed, how location names are positioned, how track is drawn. It is read-only. Never edit it.

---

## Non-negotiable rules

**Before implementing any tobymao behavior — port, approximation, or fix — read the relevant source file in `18xx-master` first.** No heuristics. No invented geometry. The source is there; use it.

Relevant paths:
- `assets/app/view/game/part/` — city.rb, town_rect.rb, location_name.rb, base.rb, track.rb, revenue.rb
- `lib/engine/tile.rb` — compute_city_town_edges, preferred_city_town_edges
- `lib/engine/part/` — city.rb, town.rb, path.rb

**RCA required for every bug and every incorrect port.** Before writing a fix: (a) state what was wrong, (b) identify which tobymao source was not consulted, (c) read that source, (d) then implement. This applies to new ports too, not only bug fixes.

**Minimum edit.** Change only what is necessary. Do not refactor surrounding code unless explicitly asked.

**Confirm the worktree.** Live JS lives in `18xxtools/.claude/worktrees/<name>/js/`. The worktree name changes. Always confirm before editing.
