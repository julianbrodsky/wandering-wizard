# Wandering Wizard

A tiny maze game for the browser. You are a wizard in a 5×5 labyrinth who can
see **only the tile they are standing on**. Find the way out.

**▶ [Play it](https://julianbrodsky.github.io/wandering-wizard/)** — works on
phones and desktop, loads instantly, installs nothing.

## How to play

You start on a marked tile. Below the maze are the moves available to you —
and only the moves available to you. If the pad offers *Up* and *Right*, there
are walls below you and to your left. Reading the pad is the whole game: it is
the only map you get.

Directions are absolute: *Right* always goes right on screen, whichever way
the wizard happens to be pointing. He simply turns his wand towards wherever
he just went.

- **Red ovals are portals.** Step on one and you are pulled to its twin,
  somewhere else in the maze. 15 of the 20 mazes have a pair; in five of those,
  the portal is the *only* way to reach the exit.
- **The exit** is the single gap in the outer wall. Reach it and you have
  escaped.

On a desktop the arrow keys and `WASD` work too.

## Running it locally

There is no build step, no bundler and no dependencies. Clone it and open
`index.html`, or serve the folder:

```bash
python3 -m http.server 8000
```

## How it works

Four small files, loaded as plain scripts. Nothing is fetched at runtime — no
webfonts, no sprites, no libraries — so the game is playable the moment the
HTML lands.

| File | Role |
| --- | --- |
| `js/mazes.js` | The 20 mazes, generated ahead of time. Data only. |
| `js/render.js` | Draws the board and the wizard as inline SVG. |
| `js/game.js` | Rules, movement and input. |
| `css/style.css` | Layout and theming. |

A few decisions worth knowing about:

**The mazes are baked in, not generated on load.** Generating a maze in the
browser means every player waits for a search that has to be re-run and
re-validated on every visit, and a bad roll is a maze nobody can finish. They
are generated once, offline, by a deterministic script and checked into the
repo, so what ships is exactly what was verified.

**Fog of war is opacity, not clipping.** Every walkable tile is drawn once when
the maze loads and sits at `opacity: 0`; the tile underfoot is the only one
lit. Moving is a CSS transform on a single group, so the camera pan stays on
the compositor and the wizard — who is drawn outside that group — never moves
on screen at all. The board slides beneath them.

**The wizard is drawn from above.** Turning rotates the whole figure, which
only works top-down: a wizard drawn in profile would be upside down walking
south.

**Illegal moves are hidden, not disabled.** A hidden button keeps its slot in
the grid, so the pad never shifts under your thumb mid-maze, and it leaves the
tab order and the accessibility tree along with the screen.

## The maze data

Each maze is a 7×7 character grid. Rows and columns 1–5 are the playable 5×5
interior; the outer ring is solid wall except for one `E`, the exit.

```
#######
##P#S.#     #  wall          S  start
##.#.##     .  floor         E  exit
#....##     P  portal (two per maze, linked)
#..#.##
E..#.P#
#######
```

To rebuild the set:

```bash
node tools/generate-mazes.js
```

The generator is seeded, so it always produces the same 20 mazes and the
regenerated file diffs cleanly. It only accepts a maze that is solvable within
8–10 moves, has real junctions rather than a single corridor, and — for portal
mazes — cannot strand you: from *every* cell you can reach, the exit must still
be reachable. A one-way teleport into a sealed pocket would be unwinnable, so
those boards are rejected outright.

To check the shipped data against all of those rules:

```bash
node tools/verify-mazes.js
```

The checker re-derives every answer from the grids alone and exits non-zero if
any maze is unwinnable, mislabelled, malformed, or a duplicate.

## Browser support

Any current browser. It uses CSS grid, custom properties, `dvh` units and CSS
transforms on SVG. Motion respects `prefers-reduced-motion`.

## License

MIT — see [LICENSE](LICENSE).
