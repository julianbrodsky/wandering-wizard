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
   * The daily map
   * ---------------------------------------------------------------- */

  /* Twenty letters, A..T, skipping U-Z. Map A ran on the epoch date and the
   * set cycles from there, so day 21 comes back around to A. */
  var LETTERS = 'ABCDEFGHIJKLMNOPQRST';
  var EPOCH = [2026, 7, 1]; // 2026-08-01, month is 0-based
  var STORAGE_KEY = 'wandering-wizard/daily';

  /*
   * A calendar day number. The *local* date fields are fed through Date.UTC so
   * this is pure calendar arithmetic: subtracting two of these counts days on
   * the wall calendar, and no daylight-saving shift can drag the boundary onto
   * the wrong side of midnight.
   */
  function dayNumber(date) {
    return Math.round(
      Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000
    );
  }

  /** Which map belongs to `date`. Exported so the rotation can be tested. */
  function mapIndexFor(date, count) {
    var epoch = Math.round(Date.UTC(EPOCH[0], EPOCH[1], EPOCH[2]) / 86400000);
    var offset = (dayNumber(date) - epoch) % count;
    return (offset + count) % count; // a clock set backwards still lands somewhere
  }

  /* ---------------------------------------------------------------- *
   * Saved progress
   * ---------------------------------------------------------------- */

  /*
   * One map a day means a reload must not hand out a fresh attempt, so the run
   * is written down as it happens and picked back up on load. Storage can be
   * unavailable outright (private windows, disabled cookies); when it is, the
   * game still plays perfectly well and simply forgets between visits.
   */
  var Store = {
    read: function () {
      try {
        var raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (error) {
        return null;
      }
    },
    write: function (state) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch (error) {
        /* nothing to do; the run just will not survive a reload */
      }
    },
  };

  /* ---------------------------------------------------------------- *
   * Maze model
   * ---------------------------------------------------------------- */

  function Maze(data) {
    this.letter = data.letter;
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

  /* Pick a run back up mid-flight. Time spent away from the page is not
   * charged: the clock restarts as though the player had only just reached
   * the elapsed total they left on. */
  Clock.prototype.resume = function (ms) {
    if (this.ticker) clearInterval(this.ticker);
    var self = this;
    this.stoppedMs = null;
    this.startedAt = Date.now() - ms;
    this.ticker = setInterval(function () {
      self.render(self.elapsed());
    }, 200);
    this.render(ms);
  };

  /* A finished run, restored from storage: the total is fixed, nothing ticks. */
  Clock.prototype.freeze = function (ms) {
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = null;
    this.startedAt = Date.now() - ms;
    this.stoppedMs = ms;
    this.render(ms);
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
    this.day = dayNumber(new Date());
    this.timers = [];

    this.moveMs = cssMs('--move-ms', 280);
    this.warpMs = 340;

    this.bindInput();
    this.loadToday();
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

  /*
   * Everyone gets the same map on the same day, and only that one. A run in
   * progress is restored exactly where it was left, so a reload is not a way
   * to start the day's map over on a fresh clock.
   */
  Game.prototype.loadToday = function () {
    var index = mapIndexFor(new Date(), this.mazes.length);
    var maze = new Maze(this.mazes[index]);
    var saved = Store.read();
    var resume = saved && saved.day === this.day ? saved : null;

    this.clearTimers();
    this.clock.reset();
    this.resetShare();
    this.showPanel('win');

    this.maze = maze;
    this.busy = false;
    this.won = false;

    if (resume) {
      this.pos = { r: resume.pos.r, c: resume.pos.c };
      this.facing = resume.facing;
      this.moved = resume.moved;
      this.won = !!resume.done;
    } else {
      this.pos = { r: maze.start.r, c: maze.start.c };
      this.facing = maze.facing;
      this.moved = false;
    }

    this.renderer.clearWarp();
    this.renderer.loadMaze(maze);
    if (this.moved) this.renderer.hideStartRune();
    this.renderer.light(this.pos.r, this.pos.c);
    this.renderer.moveTo(this.pos.r, this.pos.c, true);
    this.renderer.face(this.facing, true);

    this.nodes.label.textContent = 'Map ' + maze.letter;
    this.nodes.winLetter.textContent = maze.letter;
    this.nodes.mapLetter.textContent = maze.letter;

    if (this.won) {
      this.clock.freeze(resume.elapsed || 0);
      this.showWin(true);
      this.announce(
        'Map ' + maze.letter + ' is already escaped, in ' +
          formatTime(this.clock.elapsed()) + '. A new map arrives tomorrow.'
      );
    } else {
      this.nodes.overlay.hidden = true;
      if (this.moved) this.clock.resume(resume.elapsed || 0);
      this.announce(
        (resume ? 'Map ' + maze.letter + ', resumed. ' : 'Map ' + maze.letter + '. ') +
          this.pathsSentence()
      );
    }

    this.refreshControls();
  };

  Game.prototype.save = function () {
    Store.write({
      day: this.day,
      letter: this.maze.letter,
      pos: this.pos,
      facing: this.facing,
      moved: this.moved,
      elapsed: this.clock.elapsed(),
      done: this.won,
    });
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
      self.save();
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
        self.save();
        self.announce('A portal pulls you elsewhere. ' + self.pathsSentence());
      });
    });
  };

  Game.prototype.finish = function () {
    var self = this;
    this.won = true;
    // Stopped on the step that wins it, not when the card animates in.
    this.clock.stop();
    this.save();
    this.refreshControls();

    this.after(this.moveMs + 420, function () {
      self.showWin(false);
      self.announce('Ye hath escaped, in ' + formatTime(self.clock.elapsed()) + '.');
    });
  };

  /* ---------------------------------------------------------------- *
   * Victory, and the map behind it
   * ---------------------------------------------------------------- */

  Game.prototype.showWin = function (instant) {
    this.nodes.winTime.textContent = formatTime(this.clock.elapsed());
    this.nodes.overlay.hidden = false;
    this.showPanel('win');
    // Restoring a finished run on load should not steal focus from the page;
    // only a win the player just earned pulls focus to the card.
    if (!instant) this.nodes.share.focus();
  };

  Game.prototype.showPanel = function (which) {
    this.nodes.winCard.hidden = which !== 'win';
    this.nodes.mapCard.hidden = which !== 'map';
  };

  Game.prototype.seeMap = function () {
    this.renderer.drawFullMap(this.nodes.mapSvg, this.maze);
    // A quarter of the maps have no portals; don't key a legend to nothing.
    this.nodes.legendPortals.hidden = this.maze.portals.length === 0;
    this.showPanel('map');
    this.nodes.mapBack.focus();
    this.announce('The whole of map ' + this.maze.letter + ', revealed.');
  };

  /* ---------------------------------------------------------------- *
   * Sharing
   * ---------------------------------------------------------------- */

  Game.prototype.note = function (text) {
    this.nodes.shareNote.textContent = text;
  };

  Game.prototype.shareMessage = function () {
    return (
      'Ye hath escaped map ' + this.maze.letter + ' in ' +
      formatTime(this.clock.elapsed()) + '.'
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
      // Once the map is beaten the pad is done for the day, whatever the
      // walls around the exit happen to allow.
      this.nodes.pads[move].hidden = this.won || !this.canMove(move);
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

    this.nodes.share.addEventListener('click', function () {
      self.share();
    });

    this.nodes.seeMap.addEventListener('click', function () {
      self.seeMap();
    });

    this.nodes.mapBack.addEventListener('click', function () {
      self.showPanel('win');
      self.nodes.seeMap.focus();
    });

    document.addEventListener('keydown', function (event) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key === 'Escape' && !self.nodes.mapCard.hidden) {
        event.preventDefault();
        self.showPanel('win');
        self.nodes.seeMap.focus();
        return;
      }

      var move = KEYS[event.key] || KEYS[event.key.toLowerCase()];
      if (!move) return;
      event.preventDefault();
      self.move(move);
    });

    /* Write the run down before the page goes away, so closing the tab
     * mid-maze costs at most the seconds since the last move. */
    var persist = function () {
      if (self.maze) self.save();
    };
    window.addEventListener('pagehide', persist);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') persist();
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
        winCard: document.getElementById('win-card'),
        mapCard: document.getElementById('map-card'),
        mapSvg: document.getElementById('map-svg'),
        mapBack: document.getElementById('map-back'),
        legendPortals: document.getElementById('legend-portals'),
        seeMap: document.getElementById('see-map'),
        share: document.getElementById('share'),
        shareNote: document.getElementById('share-note'),
        shareField: document.getElementById('share-field'),
        winTime: document.getElementById('win-time'),
        winLetter: document.getElementById('win-letter'),
        mapLetter: document.getElementById('map-letter'),
        timer: document.getElementById('timer'),
        label: document.getElementById('map-label'),
        announcer: document.getElementById('announcer'),
        pads: pads(),
      },
      global.WW.MAZES
    );
  });

  /* Exported so the rotation can be checked against arbitrary dates without
   * having to wait for one. */
  global.WW.mapIndexFor = mapIndexFor;
  global.WW.LETTERS = LETTERS;
})(typeof window !== 'undefined' ? window : globalThis);
