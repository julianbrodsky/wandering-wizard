/*
 * Wandering Wizard -- rules and input.
 *
 * The wizard sees only the tile underfoot. The control pad is therefore the
 * one piece of information the player gets for free: a direction is offered
 * if and only if it does not lead into a wall, so the shape of the pad is how
 * you read the walls around you.
 *
 * Directions are stored as indices into WW.DIRS (0 north, 1 east, 2 south,
 * 3 west). A move is relative to where the wand points: the wizard turns to
 * face the chosen direction and steps into it, so "forward" is always
 * wherever they last went.
 */
(function (global) {
  'use strict';

  var DIRS = global.WW.DIRS;
  var DIR_NAMES = ['N', 'E', 'S', 'W'];

  /* Quarter-turns clockwise from the current facing. */
  var RELATIVE = { forward: 0, right: 1, back: 2, left: 3 };
  var MOVE_ORDER = ['forward', 'right', 'back', 'left'];

  var KEYS = {
    ArrowUp: 'forward',
    ArrowRight: 'right',
    ArrowDown: 'back',
    ArrowLeft: 'left',
    w: 'forward',
    d: 'right',
    s: 'back',
    a: 'left',
  };

  /* ---------------------------------------------------------------- *
   * Maze model
   * ---------------------------------------------------------------- */

  function Maze(data) {
    this.id = data.id;
    this.grid = data.grid;
    this.rows = data.grid.length;
    this.cols = data.grid[0].length;
    this.facing = DIR_NAMES.indexOf(data.facing);
    this.portals = [];

    for (var r = 0; r < this.rows; r++) {
      for (var c = 0; c < this.cols; c++) {
        var ch = this.grid[r][c];
        if (ch === 'S') this.start = { r: r, c: c };
        else if (ch === 'E') this.exit = { r: r, c: c };
        else if (ch === 'P') this.portals.push({ r: r, c: c });
      }
    }
  }

  Maze.prototype.charAt = function (r, c) {
    if (r < 0 || c < 0 || r >= this.rows || c >= this.cols) return '#';
    return this.grid[r][c];
  };

  Maze.prototype.isWall = function (r, c) {
    return this.charAt(r, c) === '#';
  };

  Maze.prototype.isExit = function (r, c) {
    return this.charAt(r, c) === 'E';
  };

  /** The far end of the portal pair, if (r, c) is a portal. */
  Maze.prototype.twinOf = function (r, c) {
    if (this.charAt(r, c) !== 'P') return null;
    var a = this.portals[0];
    var b = this.portals[1];
    return a.r === r && a.c === c ? b : a;
  };

  Maze.prototype.walkableCells = function () {
    var TYPES = { S: 'start', P: 'portal', E: 'exit', '.': 'floor' };
    var out = [];
    for (var r = 0; r < this.rows; r++) {
      for (var c = 0; c < this.cols; c++) {
        var type = TYPES[this.grid[r][c]];
        if (type) out.push({ r: r, c: c, type: type });
      }
    }
    return out;
  };

  /* ---------------------------------------------------------------- *
   * Game
   * ---------------------------------------------------------------- */

  function Game(nodes, mazes) {
    this.nodes = nodes;
    this.mazes = mazes;
    this.renderer = new global.WW.Renderer(nodes);
    this.busy = false;
    this.won = false;
    this.currentIndex = -1;
    this.timers = [];

    this.moveMs = cssMs('--move-ms', 280);
    this.warpMs = 340;

    this.bindInput();
    this.loadRandomMaze();
  }

  /* Read an animation length out of the stylesheet so the pacing of the game
   * and the pacing of the transitions cannot drift apart -- including when
   * prefers-reduced-motion collapses them to nothing. */
  function cssMs(name, fallback) {
    var raw = getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim();
    var value = parseFloat(raw);
    if (!value) return fallback;
    return raw.indexOf('ms') === -1 ? value * 1000 : value;
  }

  Game.prototype.after = function (ms, fn) {
    var self = this;
    var id = setTimeout(function () {
      self.timers.splice(self.timers.indexOf(id), 1);
      fn();
    }, ms);
    this.timers.push(id);
  };

  Game.prototype.clearTimers = function () {
    for (var i = 0; i < this.timers.length; i++) clearTimeout(this.timers[i]);
    this.timers = [];
  };

  /* ---------------------------------------------------------------- *
   * Loading a maze
   * ---------------------------------------------------------------- */

  Game.prototype.loadIndex = function (index) {
    this.currentIndex = index;
    this.load(new Maze(this.mazes[index]));
  };

  Game.prototype.loadRandomMaze = function () {
    var index = Math.floor(Math.random() * this.mazes.length);
    // Never hand back the maze that was just played.
    if (this.mazes.length > 1 && index === this.currentIndex) {
      index = (index + 1 + Math.floor(Math.random() * (this.mazes.length - 1)))
        % this.mazes.length;
    }
    this.loadIndex(index);
  };

  Game.prototype.load = function (maze) {
    this.clearTimers();
    this.maze = maze;
    this.pos = { r: maze.start.r, c: maze.start.c };
    this.facing = maze.facing;
    this.moved = false;
    this.won = false;
    this.busy = false;

    this.renderer.clearWarp();
    this.renderer.loadMaze(maze);
    this.renderer.light(this.pos.r, this.pos.c);
    this.renderer.moveTo(this.pos.r, this.pos.c, true);
    this.renderer.face(this.facing, true);

    this.nodes.label.textContent =
      'Maze ' + maze.id + ' of ' + this.mazes.length;
    this.nodes.overlay.hidden = true;

    this.refreshControls();
    this.announce('A new maze. ' + this.pathsSentence());
  };

  /* ---------------------------------------------------------------- *
   * Moving
   * ---------------------------------------------------------------- */

  /** Absolute direction index for a relative move from the current facing. */
  Game.prototype.absolute = function (move) {
    return (this.facing + RELATIVE[move]) % 4;
  };

  Game.prototype.targetOf = function (move) {
    var dir = DIRS[this.absolute(move)];
    return { r: this.pos.r + dir.dr, c: this.pos.c + dir.dc };
  };

  Game.prototype.canMove = function (move) {
    var target = this.targetOf(move);
    return !this.maze.isWall(target.r, target.c);
  };

  Game.prototype.move = function (move) {
    if (this.busy || this.won || !this.canMove(move)) return;

    var target = this.targetOf(move);
    this.busy = true;
    this.facing = this.absolute(move);
    this.pos = target;

    this.renderer.face(this.facing);
    this.renderer.light(target.r, target.c);
    this.renderer.moveTo(target.r, target.c);

    if (!this.moved) {
      this.moved = true;
      // "Start" is a one-time marker; once the wizard leaves, it is gone.
      this.after(this.moveMs, this.renderer.hideStartRune.bind(this.renderer));
    }

    if (this.maze.isExit(target.r, target.c)) {
      this.finish();
      return;
    }

    var twin = this.maze.twinOf(target.r, target.c);
    if (twin) {
      this.warpTo(twin);
      return;
    }

    var self = this;
    this.after(this.moveMs, function () {
      self.busy = false;
      self.refreshControls();
      self.announce(self.pathsSentence());
    });
  };

  /* Land on the portal, let the player see it, then get yanked across. */
  Game.prototype.warpTo = function (twin) {
    var self = this;
    this.after(this.moveMs, function () {
      self.renderer.flashWarp();
      self.after(self.warpMs * 0.35, function () {
        self.pos = { r: twin.r, c: twin.c };
        self.renderer.light(twin.r, twin.c);
        self.renderer.moveTo(twin.r, twin.c, true);
      });
      self.after(self.warpMs, function () {
        self.renderer.clearWarp();
        self.busy = false;
        self.refreshControls();
        self.announce('A portal pulls you elsewhere. ' + self.pathsSentence());
      });
    });
  };

  Game.prototype.finish = function () {
    var self = this;
    this.won = true;
    this.after(this.moveMs + 420, function () {
      self.nodes.overlay.hidden = false;
      self.nodes.newMaze.focus();
      self.announce('Ye hath escaped!');
    });
  };

  /* ---------------------------------------------------------------- *
   * Controls
   * ---------------------------------------------------------------- */

  /*
   * The pad is only redrawn once the wizard has settled. Leaving the previous
   * options up during the pan reads better than blanking the pad for a beat,
   * and taps that land mid-move are ignored anyway.
   */
  Game.prototype.refreshControls = function () {
    for (var i = 0; i < MOVE_ORDER.length; i++) {
      var move = MOVE_ORDER[i];
      this.nodes.pads[move].hidden = !this.canMove(move);
    }
  };

  Game.prototype.openMoves = function () {
    var out = [];
    for (var i = 0; i < MOVE_ORDER.length; i++) {
      if (this.canMove(MOVE_ORDER[i])) out.push(MOVE_ORDER[i]);
    }
    return out;
  };

  Game.prototype.pathsSentence = function () {
    var open = this.openMoves();
    if (!open.length) return 'No way onward.';
    return 'Paths: ' + open.join(', ') + '.';
  };

  Game.prototype.announce = function (text) {
    this.nodes.announcer.textContent = text;
  };

  Game.prototype.bindInput = function () {
    var self = this;

    this.nodes.controls.addEventListener('click', function (event) {
      var button = event.target.closest('[data-move]');
      if (button) self.move(button.getAttribute('data-move'));
    });

    this.nodes.newMaze.addEventListener('click', function () {
      self.loadRandomMaze();
    });

    document.addEventListener('keydown', function (event) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      var move = KEYS[event.key] || KEYS[event.key.toLowerCase()];
      if (!move) return;
      event.preventDefault();
      self.move(move);
    });
  };

  /* ---------------------------------------------------------------- *
   * Boot
   * ---------------------------------------------------------------- */

  function pads() {
    var out = {};
    var buttons = document.querySelectorAll('[data-move]');
    for (var i = 0; i < buttons.length; i++) {
      out[buttons[i].getAttribute('data-move')] = buttons[i];
    }
    return out;
  }

  document.addEventListener('DOMContentLoaded', function () {
    // Kept on WW purely as a console handle: `WW.game.loadIndex(6)` jumps
    // straight to a given maze, which beats reloading until one comes up.
    global.WW.game = new Game(
      {
        stage: document.getElementById('stage'),
        defs: document.getElementById('stage-defs'),
        world: document.getElementById('world'),
        tiles: document.getElementById('tiles'),
        wizard: document.getElementById('wizard'),
        view: document.querySelector('.view'),
        controls: document.getElementById('controls'),
        overlay: document.getElementById('win-overlay'),
        newMaze: document.getElementById('new-maze'),
        label: document.getElementById('maze-label'),
        announcer: document.getElementById('announcer'),
        pads: pads(),
      },
      global.WW.MAZES
    );
  });
})(typeof window !== 'undefined' ? window : globalThis);
