/*
 * Wandering Wizard -- drawing.
 *
 * Everything is one inline SVG, so there is nothing to download and nothing to
 * decode: no sprites, no webfonts, no canvas. The board is laid out at
 * TILE user units per cell and the camera is a CSS transform on a single
 * group, which keeps panning on the compositor.
 *
 * Fog of war is opacity, not clipping: every walkable tile is drawn once when
 * the maze loads and sits at opacity 0 until the wizard is standing on it.
 */
(function (global) {
  'use strict';

  var TILE = 100; // user units per cell
  var HALF = TILE / 2;
  var VIEW = 124; // viewBox size; a bit over one tile is on screen
  var CENTER = VIEW / 2;
  var WALL = 13; // thickness of a wall face, drawn inside the cell
  var FADE = 20; // how far the floor dissolves into an open passage

  var DIRS = [
    { dr: -1, dc: 0 }, // 0 north
    { dr: 0, dc: 1 }, // 1 east
    { dr: 1, dc: 0 }, // 2 south
    { dr: 0, dc: -1 }, // 3 west
  ];

  /* ---------------------------------------------------------------- *
   * Static markup
   * ---------------------------------------------------------------- */

  var DEFS = [
    '<radialGradient id="floor" cx="50%" cy="42%" r="72%">',
    '<stop offset="0%" stop-color="#6d6294"/>',
    '<stop offset="58%" stop-color="#4a4269"/>',
    '<stop offset="100%" stop-color="#332d49"/>',
    '</radialGradient>',

    '<linearGradient id="wallN" x1="0" y1="0" x2="0" y2="1">',
    '<stop offset="0%" stop-color="#0b0913"/>',
    '<stop offset="70%" stop-color="#1d1830"/>',
    '<stop offset="100%" stop-color="#463c6b"/>',
    '</linearGradient>',
    '<linearGradient id="wallS" x1="0" y1="1" x2="0" y2="0">',
    '<stop offset="0%" stop-color="#0b0913"/>',
    '<stop offset="70%" stop-color="#1d1830"/>',
    '<stop offset="100%" stop-color="#463c6b"/>',
    '</linearGradient>',
    '<linearGradient id="wallW" x1="0" y1="0" x2="1" y2="0">',
    '<stop offset="0%" stop-color="#0b0913"/>',
    '<stop offset="70%" stop-color="#1d1830"/>',
    '<stop offset="100%" stop-color="#463c6b"/>',
    '</linearGradient>',
    '<linearGradient id="wallE" x1="1" y1="0" x2="0" y2="0">',
    '<stop offset="0%" stop-color="#0b0913"/>',
    '<stop offset="70%" stop-color="#1d1830"/>',
    '<stop offset="100%" stop-color="#463c6b"/>',
    '</linearGradient>',

    // Open sides dissolve to black so a passage does not read as a wall.
    '<linearGradient id="fadeN" x1="0" y1="0" x2="0" y2="1">',
    '<stop offset="0%" stop-color="#07070c"/>',
    '<stop offset="100%" stop-color="#07070c" stop-opacity="0"/>',
    '</linearGradient>',
    '<linearGradient id="fadeS" x1="0" y1="1" x2="0" y2="0">',
    '<stop offset="0%" stop-color="#07070c"/>',
    '<stop offset="100%" stop-color="#07070c" stop-opacity="0"/>',
    '</linearGradient>',
    '<linearGradient id="fadeW" x1="0" y1="0" x2="1" y2="0">',
    '<stop offset="0%" stop-color="#07070c"/>',
    '<stop offset="100%" stop-color="#07070c" stop-opacity="0"/>',
    '</linearGradient>',
    '<linearGradient id="fadeE" x1="1" y1="0" x2="0" y2="0">',
    '<stop offset="0%" stop-color="#07070c"/>',
    '<stop offset="100%" stop-color="#07070c" stop-opacity="0"/>',
    '</linearGradient>',

    '<radialGradient id="portal" cx="50%" cy="42%" r="62%">',
    '<stop offset="0%" stop-color="#ffd2d8"/>',
    '<stop offset="28%" stop-color="#ff4d5e"/>',
    '<stop offset="72%" stop-color="#c3122c"/>',
    '<stop offset="100%" stop-color="#5c0714"/>',
    '</radialGradient>',
    '<radialGradient id="portalHalo" cx="50%" cy="50%" r="50%">',
    '<stop offset="30%" stop-color="#ff5266" stop-opacity="0.55"/>',
    '<stop offset="100%" stop-color="#ff5266" stop-opacity="0"/>',
    '</radialGradient>',

    '<radialGradient id="exitGlow" cx="50%" cy="50%" r="50%">',
    '<stop offset="0%" stop-color="#fff3d2"/>',
    '<stop offset="45%" stop-color="#ffd98a" stop-opacity="0.75"/>',
    '<stop offset="100%" stop-color="#ffd98a" stop-opacity="0"/>',
    '</radialGradient>',

    '<linearGradient id="robe" x1="0" y1="0" x2="0" y2="1">',
    '<stop offset="0%" stop-color="#8a5fe0"/>',
    '<stop offset="100%" stop-color="#3a2069"/>',
    '</linearGradient>',
    '<linearGradient id="hat" x1="0" y1="1" x2="0" y2="0">',
    '<stop offset="0%" stop-color="#5c37ad"/>',
    '<stop offset="100%" stop-color="#2b1653"/>',
    '</linearGradient>',
    '<radialGradient id="beam" cx="50%" cy="50%" r="50%">',
    '<stop offset="0%" stop-color="#cbb6ff" stop-opacity="0.42"/>',
    '<stop offset="100%" stop-color="#cbb6ff" stop-opacity="0"/>',
    '</radialGradient>',
    '<radialGradient id="spark" cx="50%" cy="50%" r="50%">',
    '<stop offset="0%" stop-color="#ffffff"/>',
    '<stop offset="40%" stop-color="#ffe9a8" stop-opacity="0.85"/>',
    '<stop offset="100%" stop-color="#ffe9a8" stop-opacity="0"/>',
    '</radialGradient>',
  ].join('');

  /*
   * The wizard, seen from above, facing -y. Turning rotates this whole group,
   * which is why the figure is drawn top-down rather than in profile: a
   * side-on wizard would end up upside down walking south.
   */
  var WIZARD = [
    '<g class="wizard-turn"><g transform="scale(0.62)">',
    // light cast ahead of the wand
    '<ellipse cx="0" cy="-52" rx="40" ry="34" fill="url(#beam)"/>',
    '<ellipse cx="0" cy="16" rx="29" ry="12" fill="#000" opacity="0.45"/>',
    // cloak: a teardrop, narrow at the front
    '<path d="M0,-26 C18,-22 28,-2 24,14 C20,28 -20,28 -24,14 C-28,-2 -18,-22 0,-26 Z"',
    ' fill="url(#robe)"/>',
    '<path d="M0,-26 C10,-22 15,-10 14,2 C8,6 -8,6 -14,2 C-15,-10 -10,-22 0,-26 Z"',
    ' fill="#000" opacity="0.16"/>',
    // hat brim, then the cone leaning forward
    '<ellipse cx="0" cy="-3" rx="23" ry="20" fill="#341d61"/>',
    '<ellipse cx="0" cy="-4" rx="23" ry="20" fill="none" stroke="#6f4ac0" stroke-width="1.6"/>',
    '<path d="M-13,-3 Q-6,-30 0,-41 Q6,-30 13,-3 Q0,4 -13,-3 Z" fill="url(#hat)"/>',
    '<circle cx="0" cy="-24" r="2.6" fill="#ffd98a"/>',
    // wand, held out to one side and aimed forward, tip glowing
    '<path d="M16,-4 L25,-38" stroke="#0e0a18" stroke-width="6.5" stroke-linecap="round" opacity="0.5"/>',
    '<path d="M16,-4 L25,-38" stroke="#d9b382" stroke-width="3.6" stroke-linecap="round"/>',
    '<circle cx="26" cy="-40" r="14" fill="url(#spark)"/>',
    '<circle cx="26" cy="-40" r="3.4" fill="#fffdf5"/>',
    '</g></g>',
  ].join('');

  /* ---------------------------------------------------------------- *
   * Tiles
   * ---------------------------------------------------------------- */

  function tileEdges(maze, r, c) {
    var out = '';
    var sides = [
      { name: 'N', wall: [-HALF, -HALF, TILE, WALL], fade: [-HALF, -HALF, TILE, FADE] },
      { name: 'E', wall: [HALF - WALL, -HALF, WALL, TILE], fade: [HALF - FADE, -HALF, FADE, TILE] },
      { name: 'S', wall: [-HALF, HALF - WALL, TILE, WALL], fade: [-HALF, HALF - FADE, TILE, FADE] },
      { name: 'W', wall: [-HALF, -HALF, WALL, TILE], fade: [-HALF, -HALF, FADE, TILE] },
    ];

    for (var i = 0; i < 4; i++) {
      var side = sides[i];
      var blocked = maze.isWall(r + DIRS[i].dr, c + DIRS[i].dc);
      var box = blocked ? side.wall : side.fade;
      var fill = (blocked ? 'url(#wall' : 'url(#fade') + side.name + ')';
      out +=
        '<rect x="' + box[0] + '" y="' + box[1] +
        '" width="' + box[2] + '" height="' + box[3] + '" fill="' + fill + '"/>';
    }
    return out;
  }

  function tileMarkup(maze, cell) {
    var r = cell.r;
    var c = cell.c;
    var body =
      '<rect x="' + -HALF + '" y="' + -HALF + '" width="' + TILE +
      '" height="' + TILE + '" fill="url(#floor)"/>' +
      // flagstone grout, nudged per cell so the floor is not a repeating stamp
      '<path d="M' + -HALF + ',' + ((r * 7 + c * 3) % 21 - 6) +
      ' H' + HALF + '" stroke="#000" stroke-opacity="0.1" stroke-width="1.5"/>' +
      '<path d="M' + ((c * 11 + r * 5) % 27 - 10) + ',' + -HALF +
      ' V' + HALF + '" stroke="#000" stroke-opacity="0.1" stroke-width="1.5"/>';

    if (cell.type === 'exit') {
      body +=
        '<circle cx="0" cy="0" r="52" fill="url(#exitGlow)"/>' +
        '<path d="M-20,34 V-6 A20,20 0 0 1 20,-6 V34 Z" fill="#fff6dd" opacity="0.92"/>';
    }

    if (cell.type === 'portal') {
      body +=
        '<ellipse class="portal-glow" cx="0" cy="0" rx="42" ry="30" fill="url(#portalHalo)"/>' +
        '<ellipse cx="0" cy="0" rx="27" ry="18" fill="url(#portal)"/>' +
        '<ellipse cx="0" cy="-3" rx="15" ry="8" fill="#fff" opacity="0.2"/>';
    }

    body += tileEdges(maze, r, c);

    if (cell.type === 'start') {
      body +=
        '<circle class="start-rune" cx="0" cy="0" r="34" fill="none"' +
        ' stroke="#ffd98a" stroke-opacity="0.5" stroke-width="2.2"' +
        ' stroke-dasharray="6 10" stroke-linecap="round"/>';
    }

    return (
      '<g class="tile" data-cell="' + r + ',' + c + '" transform="translate(' +
      (c * TILE + HALF) + ',' + (r * TILE + HALF) + ')">' + body + '</g>'
    );
  }

  /* ---------------------------------------------------------------- *
   * The whole map, revealed
   * ---------------------------------------------------------------- */

  /*
   * The zoomed-out view shown once a maze is beaten. Floor cells are drawn
   * flush rather than inset so that open runs read as corridors, and walls are
   * simply the backdrop showing through. Gradients are referenced by id from
   * the stage's <defs>, which resolve document-wide.
   */
  function mapMarkup(maze) {
    var w = maze.cols * TILE;
    var h = maze.rows * TILE;
    var out =
      '<rect x="0" y="0" width="' + w + '" height="' + h + '" fill="#0b0912"/>';

    var cells = maze.walkableCells();
    for (var i = 0; i < cells.length; i++) {
      var cell = cells[i];
      var x = cell.c * TILE;
      var y = cell.r * TILE;
      out +=
        '<rect x="' + x + '" y="' + y + '" width="' + TILE + '" height="' +
        TILE + '" fill="url(#floor)"/>';
    }

    // Decorations sit above every floor tile so nothing is half-covered by a
    // neighbouring cell drawn later.
    for (var j = 0; j < cells.length; j++) {
      var c2 = cells[j];
      var cx = c2.c * TILE + HALF;
      var cy = c2.r * TILE + HALF;

      if (c2.type === 'exit') {
        out +=
          '<circle cx="' + cx + '" cy="' + cy + '" r="70" fill="url(#exitGlow)"/>' +
          '<path d="M' + (cx - 20) + ',' + (cy + 32) + ' V' + (cy - 6) +
          ' A20,20 0 0 1 ' + (cx + 20) + ',' + (cy - 6) +
          ' V' + (cy + 32) + ' Z" fill="#fff6dd" opacity="0.95"/>';
      } else if (c2.type === 'portal') {
        out +=
          '<ellipse cx="' + cx + '" cy="' + cy + '" rx="30" ry="21" fill="url(#portal)"/>' +
          '<ellipse cx="' + cx + '" cy="' + (cy - 4) +
          '" rx="17" ry="9" fill="#fff" opacity="0.22"/>';
      } else if (c2.type === 'start') {
        out +=
          '<circle cx="' + cx + '" cy="' + cy + '" r="30" fill="none"' +
          ' stroke="#ffd98a" stroke-opacity="0.85" stroke-width="5"' +
          ' stroke-dasharray="7 9" stroke-linecap="round"/>' +
          '<circle cx="' + cx + '" cy="' + cy + '" r="8" fill="#ffd98a" fill-opacity="0.7"/>';
      }
    }

    return out;
  }

  /* ---------------------------------------------------------------- *
   * Renderer
   * ---------------------------------------------------------------- */

  function Renderer(nodes) {
    this.nodes = nodes;
    this.tiles = {};
    this.lit = null;
    this.angle = 0; // unwrapped, so turns always take the short way round

    // The zoom level lives here and nowhere else: the viewBox, the camera
    // maths and the wizard's anchor all derive from VIEW.
    nodes.stage.setAttribute('viewBox', '0 0 ' + VIEW + ' ' + VIEW);
    nodes.wizard.setAttribute('transform', 'translate(' + CENTER + ',' + CENTER + ')');

    nodes.defs.innerHTML = DEFS;
    nodes.wizard.innerHTML = WIZARD;
    this.turner = nodes.wizard.querySelector('.wizard-turn');
  }

  Renderer.prototype.loadMaze = function (maze) {
    var markup = '';
    var cells = maze.walkableCells();
    for (var i = 0; i < cells.length; i++) markup += tileMarkup(maze, cells[i]);
    this.nodes.tiles.innerHTML = markup;

    this.tiles = {};
    var nodes = this.nodes.tiles.querySelectorAll('.tile');
    for (var j = 0; j < nodes.length; j++) {
      this.tiles[nodes[j].getAttribute('data-cell')] = nodes[j];
    }
    this.lit = null;
  };

  /** Reveal exactly one tile; everything else falls back into the dark. */
  Renderer.prototype.light = function (r, c) {
    if (this.lit) this.lit.classList.remove('is-lit');
    var tile = this.tiles[r + ',' + c];
    if (tile) tile.classList.add('is-lit');
    this.lit = tile || null;
  };

  Renderer.prototype.hideStartRune = function () {
    var rune = this.nodes.tiles.querySelector('.start-rune');
    if (rune) rune.parentNode.removeChild(rune);
  };

  /* Pan the board so that cell (r, c) sits under the stationary wizard. */
  Renderer.prototype.moveTo = function (r, c, instant) {
    var world = this.nodes.world;
    var x = CENTER - (c * TILE + HALF);
    var y = CENTER - (r * TILE + HALF);

    if (instant) world.style.transition = 'none';
    world.style.transform = 'translate(' + x + 'px,' + y + 'px)';
    if (instant) {
      // Flush the layout so the suppressed transition cannot leak into the
      // next, animated, move.
      void world.getBoundingClientRect();
      world.style.transition = '';
    }
  };

  Renderer.prototype.face = function (dirIndex, instant) {
    var target = dirIndex * 90;
    var delta = (((target - this.angle) % 360) + 540) % 360 - 180;
    this.angle += delta;
    if (instant) this.turner.style.transition = 'none';
    this.turner.style.transform = 'rotate(' + this.angle + 'deg)';
    if (instant) {
      void this.turner.getBoundingClientRect();
      this.turner.style.transition = '';
    }
  };

  Renderer.prototype.flashWarp = function () {
    var view = this.nodes.view;
    view.classList.remove('is-warping');
    void view.offsetWidth; // restart the animation
    view.classList.add('is-warping');
  };

  Renderer.prototype.clearWarp = function () {
    this.nodes.view.classList.remove('is-warping');
  };

  /** Fill an <svg> with the fully revealed maze, sized to the board. */
  Renderer.prototype.drawFullMap = function (svg, maze) {
    svg.setAttribute('viewBox', '0 0 ' + maze.cols * TILE + ' ' + maze.rows * TILE);
    svg.innerHTML = mapMarkup(maze);
  };

  global.WW = global.WW || {};
  global.WW.Renderer = Renderer;
  global.WW.DIRS = DIRS;
})(typeof window !== 'undefined' ? window : globalThis);
