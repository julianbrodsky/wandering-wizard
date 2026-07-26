#!/usr/bin/env node
/*
 * Checks js/mazes.js against every rule the game relies on.
 *
 * The generator already enforces these while searching, but it is the thing
 * being tested -- this re-derives the answers from the emitted data alone, so
 * a bad edit or a loosened constraint fails loudly instead of shipping a maze
 * nobody can finish.
 *
 * Run:  node tools/verify-mazes.js
 * Exits non-zero on the first failing maze.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const EXPECTED_COUNT = 20;
const EXPECTED_WITH_PORTALS = 15;
const SIZE = 7;
const DIRS = [
  [-1, 0],
  [0, 1],
  [1, 0],
  [0, -1],
];
const DIR_NAMES = ['N', 'E', 'S', 'W'];

function loadMazes() {
  const file = path.join(__dirname, '..', 'js', 'mazes.js');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox);
  return sandbox.window.WW.MAZES;
}

const failures = [];

function check(id, condition, message) {
  if (!condition) failures.push('maze ' + id + ': ' + message);
  return condition;
}

/* ------------------------------------------------------------------ *
 * Solving, re-derived from the grid alone
 * ------------------------------------------------------------------ */

function solver(maze) {
  const at = (r, c) =>
    r < 0 || c < 0 || r >= SIZE || c >= SIZE ? '#' : maze.grid[r][c];

  const portals = [];
  let start = null;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (at(r, c) === 'S') start = [r, c];
      if (at(r, c) === 'P') portals.push([r, c]);
    }
  }

  const resolve = (r, c) => {
    if (at(r, c) !== 'P' || portals.length !== 2) return [r, c];
    const [a, b] = portals;
    return a[0] === r && a[1] === c ? b : a;
  };

  /* Shortest number of moves from an occupied cell to the exit. */
  const distanceToExit = (from) => {
    const seen = new Set([from.join(',')]);
    let frontier = [from];
    for (let depth = 1; frontier.length; depth++) {
      const next = [];
      for (const [r, c] of frontier) {
        for (const [dr, dc] of DIRS) {
          const nr = r + dr;
          const nc = c + dc;
          if (at(nr, nc) === '#') continue;
          if (at(nr, nc) === 'E') return depth;
          const t = resolve(nr, nc);
          const k = t.join(',');
          if (seen.has(k)) continue;
          seen.add(k);
          next.push(t);
        }
      }
      frontier = next;
    }
    return Infinity;
  };

  /* Every cell the player can end a move on. */
  const reachable = () => {
    const seen = new Set([start.join(',')]);
    const queue = [start];
    for (let i = 0; i < queue.length; i++) {
      const [r, c] = queue[i];
      for (const [dr, dc] of DIRS) {
        const nr = r + dr;
        const nc = c + dc;
        if (at(nr, nc) === '#' || at(nr, nc) === 'E') continue;
        const t = resolve(nr, nc);
        const k = t.join(',');
        if (seen.has(k)) continue;
        seen.add(k);
        queue.push(t);
      }
    }
    return queue;
  };

  return { at, start, portals, distanceToExit, reachable };
}

/* ------------------------------------------------------------------ *
 * Rules
 * ------------------------------------------------------------------ */

function verify(maze) {
  const id = maze.id;

  if (!check(id, Array.isArray(maze.grid) && maze.grid.length === SIZE,
    'grid must have ' + SIZE + ' rows')) return;
  if (!check(id, maze.grid.every((row) => row.length === SIZE),
    'every row must be ' + SIZE + ' characters')) return;
  if (!check(id, /^[#.SPE]+$/.test(maze.grid.join('')),
    'grid contains an unknown character')) return;

  const flat = maze.grid.join('');
  const counts = {
    S: (flat.match(/S/g) || []).length,
    E: (flat.match(/E/g) || []).length,
    P: (flat.match(/P/g) || []).length,
  };
  check(id, counts.S === 1, 'expected exactly one start, found ' + counts.S);
  check(id, counts.E === 1, 'expected exactly one exit, found ' + counts.E);
  check(id, counts.P === 0 || counts.P === 2,
    'portals must come in a pair, found ' + counts.P);

  const { at, start, distanceToExit, reachable } = solver(maze);
  if (!start || counts.E !== 1) return;

  // The rim is solid apart from the exit, and the exit is not a corner.
  let exit = null;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const onRim = r === 0 || c === 0 || r === SIZE - 1 || c === SIZE - 1;
      if (!onRim) continue;
      if (at(r, c) === 'E') exit = [r, c];
      else check(id, at(r, c) === '#', 'rim cell ' + r + ',' + c + ' is not a wall');
    }
  }
  check(id, exit !== null, 'the exit must sit in the outer rim');

  if (exit) {
    const open = DIRS.filter(
      ([dr, dc]) => at(exit[0] + dr, exit[1] + dc) !== '#'
    );
    check(id, open.length === 1,
      'the exit must border exactly one open cell, found ' + open.length);
  }

  // The start is inside the 5x5, and its opening facing is not into a wall.
  check(id, start[0] > 0 && start[0] < SIZE - 1 && start[1] > 0 && start[1] < SIZE - 1,
    'the start must be inside the 5x5 interior');
  const facing = DIR_NAMES.indexOf(maze.facing);
  check(id, facing !== -1, 'unknown facing "' + maze.facing + '"');
  if (facing !== -1) {
    const [dr, dc] = DIRS[facing];
    check(id, at(start[0] + dr, start[1] + dc) !== '#',
      'the wizard starts facing a wall');
  }

  // There are walls inside the 5x5, not just the rim.
  let interiorWalls = 0;
  for (let r = 1; r < SIZE - 1; r++) {
    for (let c = 1; c < SIZE - 1; c++) if (at(r, c) === '#') interiorWalls++;
  }
  check(id, interiorWalls > 0, 'the interior has no walls at all');

  // The maze is winnable, in the number of moves it claims.
  const shortest = distanceToExit(start);
  check(id, shortest !== Infinity, 'the exit cannot be reached from the start');
  check(id, shortest === maze.shortest,
    'claims a ' + maze.shortest + '-move solution but the shortest is ' + shortest);

  // And it cannot be lost: no portal strands the player anywhere.
  const stranded = reachable().filter((cell) => distanceToExit(cell) === Infinity);
  check(id, stranded.length === 0,
    'these cells are dead ends with no route to the exit: ' +
      stranded.map((c) => c.join(',')).join(' '));
}

/* ------------------------------------------------------------------ *
 * Run
 * ------------------------------------------------------------------ */

function main() {
  const mazes = loadMazes();

  check('set', mazes.length === EXPECTED_COUNT,
    'expected ' + EXPECTED_COUNT + ' mazes, found ' + mazes.length);

  const ids = mazes.map((m) => m.id).join(',');
  const wanted = mazes.map((_, i) => i + 1).join(',');
  check('set', ids === wanted, 'ids must run 1..' + mazes.length);

  const withPortals = mazes.filter((m) => m.grid.join('').includes('P')).length;
  check('set', withPortals === EXPECTED_WITH_PORTALS,
    'expected ' + EXPECTED_WITH_PORTALS + ' mazes with portals, found ' + withPortals);

  const shapes = new Set(mazes.map((m) => m.grid.join('|')));
  check('set', shapes.size === mazes.length, 'two mazes share the same layout');

  mazes.forEach(verify);

  if (failures.length) {
    console.error('FAILED\n' + failures.map((f) => '  - ' + f).join('\n'));
    process.exit(1);
  }

  const lengths = mazes.map((m) => m.shortest);
  console.log('OK -- ' + mazes.length + ' mazes');
  console.log('  with portals:    ' + withPortals);
  console.log('  solution length: ' +
    Math.min(...lengths) + '-' + Math.max(...lengths) + ' moves');
}

main();
