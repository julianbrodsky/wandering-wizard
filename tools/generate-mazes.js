#!/usr/bin/env node
/*
 * Maze generator for Wandering Wizard.
 *
 * The game ships with a fixed set of 20 hand-verified mazes so that nothing has
 * to be generated in the browser at load time. This script produces that set.
 * It is deterministic: the same SEED always yields the same 20 mazes, so the
 * generated file can be reviewed in diffs like any other source.
 *
 * Run:  node tools/generate-mazes.js
 * Out:  js/mazes.js
 *
 * Board model
 * -----------
 * A maze is a 7x7 character grid. Rows 1..5 / cols 1..5 are the playable 5x5
 * interior. Row/col 0 and 6 form the solid outer rim, except for a single rim
 * cell that is the exit.
 *
 *   '#'  wall (impassable)
 *   '.'  open floor
 *   'S'  start (open floor, wizard's initial cell)
 *   'P'  portal (open floor; exactly two per maze, they link to each other)
 *   'E'  exit (the one gap in the outer rim)
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SEED = 0x5EED1234;
const SIZE = 7; // full board including the rim
const LO = 1; // first interior index
const HI = 5; // last interior index

const TOTAL_MAZES = 20;
const PLAIN_MAZES = 5; // no portals
const ESSENTIAL_PORTAL_MAZES = 5; // unsolvable if the portals were removed
const BONUS_PORTAL_MAZES = TOTAL_MAZES - PLAIN_MAZES - ESSENTIAL_PORTAL_MAZES;

const MIN_SOLUTION = 8; // shortest win must take at least this many moves
const MAX_SOLUTION = 30; // ...and at most this many, so nothing is a slog
const MIN_JUNCTIONS = 2; // cells offering 3+ exits, so mazes aren't corridors
const MIN_PORTAL_SPAN = 3; // Manhattan distance between linked portals

const DIRS = [
  [-1, 0], // north
  [0, 1], // east
  [1, 0], // south
  [0, -1], // west
];
const DIR_NAMES = ['N', 'E', 'S', 'W'];

/* ------------------------------------------------------------------ *
 * Deterministic PRNG (mulberry32)
 * ------------------------------------------------------------------ */

function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = makeRng(SEED);

function randInt(maxExclusive) {
  return Math.floor(rng() * maxExclusive);
}

function pick(list) {
  return list[randInt(list.length)];
}

function shuffled(list) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Board helpers
 * ------------------------------------------------------------------ */

const key = (r, c) => r * SIZE + c;
const unkey = (k) => [Math.floor(k / SIZE), k % SIZE];

function blankBoard() {
  return Array.from({ length: SIZE }, () => new Array(SIZE).fill('#'));
}

function interiorCells() {
  const cells = [];
  for (let r = LO; r <= HI; r++) {
    for (let c = LO; c <= HI; c++) cells.push([r, c]);
  }
  return cells;
}

/**
 * Rim cells that can serve as an exit: on an edge, not a corner, so that
 * exactly one interior cell is orthogonally adjacent to them.
 */
function exitCandidates() {
  const out = [];
  for (let i = LO; i <= HI; i++) {
    out.push([0, i, [1, i]]);
    out.push([SIZE - 1, i, [SIZE - 2, i]]);
    out.push([i, 0, [i, 1]]);
    out.push([i, SIZE - 1, [i, SIZE - 2]]);
  }
  return out;
}

const isWalkable = (board, r, c) =>
  r >= 0 && c >= 0 && r < SIZE && c < SIZE && board[r][c] !== '#';

/* ------------------------------------------------------------------ *
 * Solving
 * ------------------------------------------------------------------ */

function makeResolver(portals, usePortals) {
  const link = new Map();
  if (usePortals && portals) {
    link.set(key(...portals[0]), portals[1]);
    link.set(key(...portals[1]), portals[0]);
  }
  return (r, c) => link.get(key(r, c)) || [r, c];
}

/**
 * Breadth-first search for the shortest win, played exactly the way the game
 * plays: stepping onto a portal immediately relocates you to its twin, and
 * arriving that way does not bounce you back again.
 *
 * Because the teleport is forced, the cell you *occupy* after a move is fully
 * determined by the cell you moved into, so plain cell-level BFS is still
 * sound -- we just resolve each destination through the portal link first.
 * `from` is a cell already occupied, so it is not resolved again.
 *
 * Returns the move count of the shortest win, or Infinity if the exit cannot
 * be reached. `usePortals: false` scores the same board with the portals
 * treated as ordinary floor, which is how we tell whether a portal is load
 * bearing or just a shortcut.
 */
function shortestWin(board, from, portals, usePortals) {
  const resolve = makeResolver(portals, usePortals);
  const seen = new Set([key(...from)]);
  let frontier = [from];

  for (let depth = 1; depth <= MAX_SOLUTION; depth++) {
    const next = [];
    for (const [r, c] of frontier) {
      for (const [dr, dc] of DIRS) {
        const nr = r + dr;
        const nc = c + dc;
        if (!isWalkable(board, nr, nc)) continue;
        if (board[nr][nc] === 'E') return depth;
        const [tr, tc] = resolve(nr, nc);
        const k = key(tr, tc);
        if (seen.has(k)) continue;
        seen.add(k);
        next.push([tr, tc]);
      }
    }
    if (!next.length) break;
    frontier = next;
  }
  return Infinity;
}

/** Every cell the player can end a move on, starting from `start`. */
function reachableCells(board, start, portals) {
  const resolve = makeResolver(portals, true);
  const seen = new Set([key(...start)]);
  const queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const [r, c] = queue[i];
    for (const [dr, dc] of DIRS) {
      const nr = r + dr;
      const nc = c + dc;
      if (!isWalkable(board, nr, nc)) continue;
      if (board[nr][nc] === 'E') continue;
      const [tr, tc] = resolve(nr, nc);
      const k = key(tr, tc);
      if (seen.has(k)) continue;
      seen.add(k);
      queue.push([tr, tc]);
    }
  }
  return queue;
}

/**
 * No soft-locks: from anywhere the player can reach, the exit must still be
 * reachable. Without portals this is automatic (every move can be undone), but
 * a portal is one-way in effect -- it can strand you in a pocket you could
 * never have walked into. Those boards are rejected outright.
 */
function isEscapableFromEverywhere(board, start, portals) {
  return reachableCells(board, start, portals).every(
    (cell) => shortestWin(board, cell, portals, true) !== Infinity
  );
}

/** Cells with three or more open neighbours -- a maze needs real choices. */
function countJunctions(board) {
  let n = 0;
  for (const [r, c] of interiorCells()) {
    if (board[r][c] === '#') continue;
    let open = 0;
    for (const [dr, dc] of DIRS) {
      if (isWalkable(board, r + dr, c + dc)) open++;
    }
    if (open >= 3) n++;
  }
  return n;
}

/* ------------------------------------------------------------------ *
 * Candidate generation
 * ------------------------------------------------------------------ */

/**
 * Build one random candidate board and report on it. Returns null as soon as
 * any structural requirement fails; the caller simply retries.
 *
 * `mode` is 'plain' (no portals), 'essential' (portals required to win) or
 * 'bonus' (portals present, maze winnable without them).
 */
function makeCandidate(mode) {
  const wantsPortals = mode !== 'plain';
  const minWalls = mode === 'essential' ? 7 : 5;
  const maxWalls = mode === 'essential' ? 11 : 9;
  const wallCount = minWalls + randInt(maxWalls - minWalls + 1);

  const board = blankBoard();
  const cells = shuffled(interiorCells());
  const walls = cells.slice(0, wallCount);
  const open = cells.slice(wallCount);
  for (const [r, c] of open) board[r][c] = '.';

  // Exit: a rim gap whose single interior neighbour is walkable.
  const exits = exitCandidates().filter(
    ([, , [ir, ic]]) => board[ir][ic] !== '#'
  );
  if (!exits.length) return null;
  const [er, ec, exitNeighbour] = pick(exits);
  board[er][ec] = 'E';

  // Start: any open interior cell other than the exit's neighbour, so the
  // maze never opens with the exit already in reach.
  const startPool = open.filter(
    ([r, c]) => !(r === exitNeighbour[0] && c === exitNeighbour[1])
  );
  if (!startPool.length) return null;
  const start = pick(startPool);

  // Portals: two open cells, far enough apart to be worth taking, never on
  // the start and never on the exit's neighbour (standing there is the only
  // way to reach the exit, and a portal would teleport you off it forever).
  let portals = null;
  if (wantsPortals) {
    const pool = open.filter(
      ([r, c]) =>
        !(r === start[0] && c === start[1]) &&
        !(r === exitNeighbour[0] && c === exitNeighbour[1])
    );
    const pairs = [];
    for (let i = 0; i < pool.length; i++) {
      for (let j = i + 1; j < pool.length; j++) {
        const span =
          Math.abs(pool[i][0] - pool[j][0]) + Math.abs(pool[i][1] - pool[j][1]);
        if (span >= MIN_PORTAL_SPAN) pairs.push([pool[i], pool[j]]);
      }
    }
    if (!pairs.length) return null;
    portals = pick(pairs);
    board[portals[0][0]][portals[0][1]] = 'P';
    board[portals[1][0]][portals[1][1]] = 'P';
  }

  board[start[0]][start[1]] = 'S';

  if (countJunctions(board) < MIN_JUNCTIONS) return null;

  const solution = shortestWin(board, start, portals, true);
  if (solution < MIN_SOLUTION || solution > MAX_SOLUTION) return null;
  if (wantsPortals && !isEscapableFromEverywhere(board, start, portals)) return null;

  const withoutPortals = wantsPortals
    ? shortestWin(board, start, portals, false)
    : solution;
  const portalEssential = wantsPortals && withoutPortals === Infinity;

  if (mode === 'essential' && !portalEssential) return null;
  if (mode === 'bonus' && portalEssential) return null;

  // Initial facing is cosmetic -- movement is absolute -- but point the wand
  // down an open passage rather than straight into a wall.
  const facings = DIRS.map((d, i) => i).filter((i) =>
    isWalkable(board, start[0] + DIRS[i][0], start[1] + DIRS[i][1])
  );
  if (!facings.length) return null;
  const facing = DIR_NAMES[pick(facings)];

  return {
    grid: board.map((row) => row.join('')),
    facing,
    solution,
    portalEssential,
  };
}

/* ------------------------------------------------------------------ *
 * Build the set
 * ------------------------------------------------------------------ */

function buildSet() {
  const plan = [
    ...Array(PLAIN_MAZES).fill('plain'),
    ...Array(ESSENTIAL_PORTAL_MAZES).fill('essential'),
    ...Array(BONUS_PORTAL_MAZES).fill('bonus'),
  ];

  const seen = new Set();
  const mazes = [];

  for (const mode of plan) {
    let accepted = null;
    for (let attempt = 0; attempt < 2000000 && !accepted; attempt++) {
      const candidate = makeCandidate(mode);
      if (!candidate) continue;
      const signature = candidate.grid.join('|') + '/' + candidate.facing;
      if (seen.has(signature)) continue;
      seen.add(signature);
      accepted = candidate;
    }
    if (!accepted) {
      throw new Error(`could not generate a "${mode}" maze -- loosen the constraints`);
    }
    mazes.push(accepted);
  }

  // Interleave the categories so the first few maps a player sees aren't all
  // of one kind.
  return shuffled(mazes).map((maze, i) => ({ id: i + 1, ...maze }));
}

/* ------------------------------------------------------------------ *
 * Emit js/mazes.js
 * ------------------------------------------------------------------ */

function serialize(mazes) {
  const entries = mazes
    .map((m) => {
      const rows = m.grid.map((row) => `      '${row}'`).join(',\n');
      return [
        '    {',
        `      id: ${m.id},`,
        `      facing: '${m.facing}',`,
        `      shortest: ${m.solution},`,
        '      grid: [',
        rows,
        '      ],',
        '    }',
      ].join('\n');
    })
    .join(',\n');

  return `/*
 * Wandering Wizard -- maze data.
 *
 * GENERATED FILE. Do not edit by hand; run \`node tools/generate-mazes.js\`.
 *
 * Each maze is a 7x7 grid. Rows/cols 1-5 are the playable 5x5 interior; the
 * outer ring is solid wall except for a single 'E' gap, the exit.
 *
 *   '#' wall   '.' floor   'S' start   'P' portal (two per maze, linked)   'E' exit
 *
 * \`facing\` is the direction the wizard's wand points on the first turn, and
 * \`shortest\` is the fewest moves in which the maze can be escaped (portals
 * included), verified by the generator.
 */
(function (global) {
  'use strict';

  var MAZES = [
${entries}
  ];

  global.WW = global.WW || {};
  global.WW.MAZES = MAZES;
})(typeof window !== 'undefined' ? window : globalThis);
`;
}

function main() {
  const mazes = buildSet();
  const out = path.join(__dirname, '..', 'js', 'mazes.js');
  fs.writeFileSync(out, serialize(mazes));

  const withPortals = mazes.filter((m) => m.grid.join('').includes('P'));
  const essential = mazes.filter((m) => m.portalEssential);
  const lengths = mazes.map((m) => m.solution);
  console.log(`wrote ${path.relative(process.cwd(), out)}`);
  console.log(`  mazes:            ${mazes.length}`);
  console.log(`  with portals:     ${withPortals.length}`);
  console.log(`  portal-essential: ${essential.length}`);
  console.log(
    `  solution length:  ${Math.min(...lengths)}-${Math.max(...lengths)} moves`
  );
}

main();
