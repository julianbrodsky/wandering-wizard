/*
 * Wandering Wizard -- maze data.
 *
 * GENERATED FILE. Do not edit by hand; run `node tools/generate-mazes.js`.
 *
 * Each maze is a 7x7 grid. Rows/cols 1-5 are the playable 5x5 interior; the
 * outer ring is solid wall except for a single 'E' gap, the exit.
 *
 *   '#' wall   '.' floor   'S' start   'P' portal (two per maze, linked)   'E' exit
 *
 * `letter` names the map; the game serves them in this order, one per day.
 * `facing` is the direction the wizard's wand points on the first turn, and
 * `shortest` is the fewest moves in which the maze can be escaped (portals
 * included), verified by the generator.
 */
(function (global) {
  'use strict';

  var MAZES = [
    {
      letter: 'A',
      facing: 'S',
      shortest: 8,
      grid: [
      '#######',
      '##S#..#',
      '#.....#',
      '####.##',
      '#..#.##',
      '#.....E',
      '#######'
      ],
    },
    {
      letter: 'B',
      facing: 'E',
      shortest: 8,
      grid: [
      '#######',
      '#..#..#',
      '#P....E',
      '#....##',
      '##.#.P#',
      '#S.#..#',
      '#######'
      ],
    },
    {
      letter: 'C',
      facing: 'W',
      shortest: 8,
      grid: [
      '#######',
      '#..#.##',
      '##....#',
      '#.S#..#',
      '#.#...#',
      '#..#..#',
      '#####E#'
      ],
    },
    {
      letter: 'D',
      facing: 'E',
      shortest: 8,
      grid: [
      '#######',
      '#####.#',
      '#...#.#',
      '##...P#',
      '##...##',
      '#S.#P.E',
      '#######'
      ],
    },
    {
      letter: 'E',
      facing: 'S',
      shortest: 10,
      grid: [
      '#######',
      'E..#.P#',
      '#.P...#',
      '#.#.###',
      '#...#S#',
      '###...#',
      '#######'
      ],
    },
    {
      letter: 'F',
      facing: 'S',
      shortest: 9,
      grid: [
      '#######',
      'E.#.###',
      '#..#.S#',
      '#.##..#',
      '#P.#.##',
      '####.P#',
      '#######'
      ],
    },
    {
      letter: 'G',
      facing: 'N',
      shortest: 9,
      grid: [
      '#####E#',
      '#.....#',
      '##....#',
      '#..#..#',
      '#.#...#',
      '#S#..##',
      '#######'
      ],
    },
    {
      letter: 'H',
      facing: 'E',
      shortest: 8,
      grid: [
      '#######',
      '##P#S.#',
      '##.#.##',
      '#....##',
      '#..#.##',
      'E..#.P#',
      '#######'
      ],
    },
    {
      letter: 'I',
      facing: 'E',
      shortest: 9,
      grid: [
      '####E##',
      '#....##',
      '#.#.#.#',
      '#.#...#',
      '#..##.#',
      '#.##S.#',
      '#######'
      ],
    },
    {
      letter: 'J',
      facing: 'S',
      shortest: 10,
      grid: [
      '#####E#',
      '##P.#.#',
      '#S#...#',
      '#.#.P##',
      '#.....#',
      '#..#..#',
      '#######'
      ],
    },
    {
      letter: 'K',
      facing: 'N',
      shortest: 8,
      grid: [
      '#######',
      '#...P.#',
      '##..#.#',
      '##S#.##',
      '#P#...#',
      '#...#.#',
      '###E###'
      ],
    },
    {
      letter: 'L',
      facing: 'W',
      shortest: 9,
      grid: [
      '#######',
      '##.P#.#',
      '##.#.##',
      '#.....#',
      '#.##P.#',
      '#.##.S#',
      '#E#####'
      ],
    },
    {
      letter: 'M',
      facing: 'N',
      shortest: 8,
      grid: [
      '#####E#',
      '#.....#',
      '#P##.##',
      '#.#...#',
      '#..#P##',
      '#S....#',
      '#######'
      ],
    },
    {
      letter: 'N',
      facing: 'N',
      shortest: 9,
      grid: [
      '#######',
      '#.#P..#',
      '#.###S#',
      '##..###',
      'E.#.P.#',
      '#.....#',
      '#######'
      ],
    },
    {
      letter: 'O',
      facing: 'E',
      shortest: 8,
      grid: [
      '#######',
      '#..#.##',
      '#P...##',
      '##.#P.#',
      '#S.#..#',
      '###...#',
      '###E###'
      ],
    },
    {
      letter: 'P',
      facing: 'N',
      shortest: 9,
      grid: [
      '#E#####',
      '#....##',
      '##..P.#',
      '#.....#',
      '##.#..#',
      '#P..#S#',
      '#######'
      ],
    },
    {
      letter: 'Q',
      facing: 'W',
      shortest: 8,
      grid: [
      '#######',
      '#.##.P#',
      '###..##',
      '##P#..#',
      '#..#..E',
      '#.S.###',
      '#######'
      ],
    },
    {
      letter: 'R',
      facing: 'N',
      shortest: 9,
      grid: [
      '#######',
      'E....##',
      '#.#..##',
      '#.##P.#',
      '#.##..#',
      '#.P..S#',
      '#######'
      ],
    },
    {
      letter: 'S',
      facing: 'W',
      shortest: 8,
      grid: [
      '#######',
      '#.#.###',
      '#P....#',
      '####.##',
      '#.P#.S#',
      '#...###',
      '##E####'
      ],
    },
    {
      letter: 'T',
      facing: 'W',
      shortest: 10,
      grid: [
      '#######',
      '#..S#.#',
      '#.##.##',
      '#.#..##',
      '#.....E',
      '#....##',
      '#######'
      ],
    }
  ];

  global.WW = global.WW || {};
  global.WW.MAZES = MAZES;
})(typeof window !== 'undefined' ? window : globalThis);
