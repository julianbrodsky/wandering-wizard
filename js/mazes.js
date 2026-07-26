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
 * `facing` is the direction the wizard's wand points on the first turn, and
 * `shortest` is the fewest moves in which the maze can be escaped (portals
 * included), verified by the generator.
 */
(function (global) {
  'use strict';

  var MAZES = [
    {
      id: 1,
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
      id: 2,
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
      id: 3,
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
      id: 4,
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
      id: 5,
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
      id: 6,
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
      id: 7,
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
      id: 8,
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
      id: 9,
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
      id: 10,
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
      id: 11,
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
      id: 12,
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
      id: 13,
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
      id: 14,
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
      id: 15,
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
      id: 16,
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
      id: 17,
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
      id: 18,
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
      id: 19,
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
      id: 20,
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
