/*
 * Wandering Wizard -- rules and input.
 *
 * The wizard sees only the tile underfoot. The control pad is therefore the
 * one piece of information the player gets for free: a direction is offered
 * if and only if it does not lead into a wall, so the shape of the pad is how
 * you read the walls around you.
 *
 * Directions are stored as indices into WW.DIRS (0 north, 1 east, 2 south,
 * 3 west). Moves are absolute -- "right" is right on the screen no matter
 * which way the wizard happens to be pointing. Facing is cosmetic: the wizard
 * turns his wand towards wherever he just went.
 */
(function (global) {
  'use strict';

  var DIRS = global.WW.DIRS;
  var DIR_NAMES = ['N', 'E', 'S', 'W'];

  /* Each move names a compass direction on screen, not one relative to the
   * wizard, so these line up with WW.DIRS exactly. */
  var HEADING = { up: 0, right: 1, down: 2, left: 3 };
  var MOVE_ORDER = ['up', 'right', 'down', 'left'];

  var KEYS = {
    ArrowUp: 'up',
    ArrowRight: 'right',
    ArrowDown: 'down',
    ArrowLeft: 'left',
    w: 'up',
    d: 'right',
    s: 'down',
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
   * The clock
   * ---------------------------------------------------------------- */

  /* Minutes and seconds. Anything past an hour just keeps counting minutes;
   * a 5x5 maze that takes that long has earned the odd-looking number. */
  function formatTime(ms) {
    var total = Math.floor(ms / 1000);
    var seconds = total % 60;
    return Math.floor(total / 60) + ':' + (seconds < 10 ? '0' : '') + seconds;
  }

  /*
   * Elapsed time is always derived from the starting timestamp rather than
   * accumulated tick by tick. Background tabs throttle timers heavily, so
   * counting ticks would quietly under-report a maze left open in another tab.
   */
  function Clock(node) {
    this.node = node;
    this.startedAt = null;
    this.stoppedMs = null;
    this.ticker = null;
    this.render(0);
  }

  Clock.prototype.elapsed = function () {
    if (this.stoppedMs !== null) return this.stoppedMs;
    if (this.startedAt === null) return 0;
    return Date.now() - this.startedAt;
  };

  Clock.prototype.start = function () {
    if (this.startedAt !== null) return;
    var self = this;
    this.startedAt = Date.now();
    this.ticker = setInterval(function () {
      self.render(self.elapsed());
    }, 200);
  };

  Clock.prototype.stop = function () {
    if (this.startedAt !== null && this.stoppedMs === null) {
      this.stoppedMs = Date.now() - this.startedAt;
    }
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = null;
    this.render(this.elapsed());
  };

  Clock.prototype.reset = function () {
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = null;
    this.startedAt = null;
    this.stoppedMs = null;
    this.render(0);
  };

  Clock.prototype.render = function (ms) {
    var text = formatTime(ms);
    if (this.node.textContent !== text) this.node.textContent = text;
  };

  /* ---------------------------------------------------------------- *
   * Game
   * ---------------------------------------------------------------- */

  function Game(nodes, mazes) {
    this.nodes = nodes;
    this.mazes = mazes;
    this.renderer = new global.WW.Renderer(nodes);
    this.clock = new Clock(nodes.timer);
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
    this.clock.reset();
    this.resetShare();
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

  Game.prototype.targetOf = function (move) {
    var dir = DIRS[HEADING[move]];
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
    this.facing = HEADING[move]; // cosmetic: point the wand the way we went
    this.pos = target;

    this.renderer.face(this.facing);
    this.renderer.light(target.r, target.c);
    this.renderer.moveTo(target.r, target.c);

    if (!this.moved) {
      this.moved = true;
      // The clock runs from the first step, not from when the maze appeared,
      // so reading the room costs nothing.
      this.clock.start();
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
    // Stopped on the step that wins it, not when the card animates in.
    this.clock.stop();

    this.after(this.moveMs + 420, function () {
      self.nodes.winTime.textContent = formatTime(self.clock.elapsed());
      self.nodes.overlay.hidden = false;
      self.nodes.newMaze.focus();
      self.announce('Ye hath escaped, in ' + formatTime(self.clock.elapsed()) + '.');
    });
  };

  /* ---------------------------------------------------------------- *
   * Sharing
   * ---------------------------------------------------------------- */

  Game.prototype.note = function (text) {
    this.nodes.shareNote.textContent = text;
  };

  Game.prototype.shareMessage = function () {
    return (
      'I escaped maze ' + this.maze.id + ' of ' + this.mazes.length +
      ' in ' + formatTime(this.clock.elapsed()) + '. Ye hath escaped!'
    );
  };

  /*
   * The native share sheet is the one route that reaches every social app the
   * player actually has, and it costs no third-party script. Where it does not
   * exist -- desktop, mostly -- fall back to putting the message on the
   * clipboard so it can be pasted anywhere.
   */
  Game.prototype.share = function () {
    var self = this;
    var url = location.origin + location.pathname;
    var message = this.shareMessage();

    if (navigator.share) {
      navigator
        .share({ title: 'Wandering Wizard', text: message, url: url })
        .then(function () {
          self.note('');
        })
        .catch(function (error) {
          // Dismissing the sheet is not a failure worth reporting.
          if (error && error.name === 'AbortError') return;
          self.copy(message + ' ' + url);
        });
      return;
    }

    this.copy(message + ' ' + url);
  };

  /*
   * Copying has more ways to go quiet than to fail loudly: writeText rejects
   * without permission, and on a document the browser considers hidden it
   * simply never settles at all. Whatever happens, the player pressed a button
   * and is owed an answer, so an unanswered write falls back to showing them
   * the message to copy by hand.
   */
  Game.prototype.copy = function (payload) {
    var self = this;
    var settled = false;

    var succeeded = function () {
      if (settled) return;
      settled = true;
      self.note('Copied — paste it wherever you like.');
    };

    var giveUp = function () {
      if (settled) return;
      settled = true;
      self.reveal(payload);
    };

    this.after(1200, giveUp);

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(payload).then(succeeded, function () {
        if (legacyCopy(payload)) succeeded();
        else giveUp();
      });
      return;
    }

    if (legacyCopy(payload)) succeeded();
    else giveUp();
  };

  /** Last resort: put the message on screen, selected, for a manual copy. */
  Game.prototype.reveal = function (payload) {
    var field = this.nodes.shareField;
    this.note('Copy this to share:');
    field.value = payload;
    field.hidden = false;
    field.focus();
    field.select();
  };

  Game.prototype.resetShare = function () {
    this.note('');
    this.nodes.shareField.hidden = true;
    this.nodes.shareField.value = '';
  };

  /* execCommand is deprecated, but it is the only clipboard route left on an
   * insecure origin -- opening index.html straight off disk, for instance. */
  function legacyCopy(payload) {
    var field = document.createElement('textarea');
    field.value = payload;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.appendChild(field);
    field.select();

    var copied = false;
    try {
      copied = document.execCommand('copy');
    } catch (error) {
      copied = false;
    }
    document.body.removeChild(field);
    return copied;
  }

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

    this.nodes.share.addEventListener('click', function () {
      self.share();
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
        share: document.getElementById('share'),
        shareNote: document.getElementById('share-note'),
        shareField: document.getElementById('share-field'),
        winTime: document.getElementById('win-time'),
        timer: document.getElementById('timer'),
        label: document.getElementById('maze-label'),
        announcer: document.getElementById('announcer'),
        pads: pads(),
      },
      global.WW.MAZES
    );
  });
})(typeof window !== 'undefined' ? window : globalThis);
