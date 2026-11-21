// The game's rules and state, with no drawing and no browser in it: the courier, the guards
// and their patrols, vision cones and line of sight, detection, thrown coins, loot, lives,
// levels and score. step() advances one fixed step and returns what happened as bit flags, so
// the caller can react without the world knowing about screens or sound.
//
// Tile legend: '#' wall, 'C' crate, 'B' bush, '.' floor, 'P' courier start, 'E' exit, 'G' loot.
// Walls and crates block movement and sight. Bushes hide the courier but block nothing else.
// Guard patrols are waypoint lists in tile coordinates, walked in a loop.
import { COIN, COLS, FIELD, GUARD, LIVES, LOOT, PLAYER, ROWS, TILE, TIME_BONUS } from './config.js';

export const EVENT_COIN = 1;
export const EVENT_CAUGHT = 2;
export const EVENT_LEVEL = 4;
export const EVENT_WIN = 8;
export const EVENT_OVER = 16;
export const EVENT_ALERT = 32;
export const EVENT_THROW = 64;

const LEVELS = [
  {
    name: 'The Gallery',
    coins: COIN.perLevel[0],
    guards: [{ waypoints: [[4, 7], [27, 7]] }, { waypoints: [[27, 14], [4, 14]] }],
    map: [
      '################################',
      '#P....B......C........B........#',
      '#.....###......####......###...#',
      '#.....#........#.........#.....#',
      '#..G..#....B...#....B....#..E..#',
      '#.....#........#.........#.....#',
      '#.....###..C...####..C...###...#',
      '#..............................#',
      '#....C.......B..........C......#',
      '#.....###.....#####......###...#',
      '#.....#.......#...#......#.....#',
      '#..B..#...G...#...#..B...#.....#',
      '#.....#.......#...#......#.....#',
      '#.....###.....#####......###...#',
      '#..............................#',
      '#....B.........C..........B....#',
      '#..............................#',
      '################################',
    ],
  },
  {
    name: 'The Vault Wing',
    coins: COIN.perLevel[1],
    guards: [
      { waypoints: [[4, 7], [27, 7]] },
      { waypoints: [[27, 14], [4, 14]] },
      { waypoints: [[29, 2], [29, 15]] },
    ],
    map: [
      '################################',
      '#P....B......C........B.......G#',
      '#.....###......####......###...#',
      '#..C..#........#.........#..C..#',
      '#.....#....B...#....B....#.....#',
      '#..G..#........#.........#.....#',
      '#.....###..C...####..C...###...#',
      '#..............................#',
      '#....C.......B..........C......#',
      '#..######....#####....######...#',
      '#..#....#....#...#....#....#...#',
      '#..#....#.BG.#...#.B..#....#...#',
      '#..#....#....#...#....#....#...#',
      '#..######....#####....######...#',
      '#..............................#',
      '#....B.........C..........B....#',
      '#..............C.............E.#',
      '################################',
    ],
  },
  {
    name: 'The Grand Hall',
    coins: COIN.perLevel[2],
    guards: [
      { waypoints: [[4, 7], [27, 7]] },
      { waypoints: [[27, 14], [4, 14]] },
      { waypoints: [[10, 8], [10, 13]] },
      { waypoints: [[21, 8], [21, 13]] },
    ],
    map: [
      '################################',
      '#P....C.......B........C......G#',
      '#.....###......####......###...#',
      '#.....#........#.........#.....#',
      '#..C..#....B...#....B....#..C..#',
      '#.....#........#.........#..E..#',
      '#.....###......####......###...#',
      '#..............................#',
      '#....B.........C.........B.....#',
      '#.....###.....#####......###...#',
      '#.....#.......#...#......#.....#',
      '#..G..#...B...#...#..B...#.....#',
      '#.....#.......#...#......#.....#',
      '#.....###.....#####......###...#',
      '#..............................#',
      '#....C.........B..........C....#',
      '#..............................#',
      '################################',
    ],
  },
];

function tileCentre(tx, ty) {
  return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
}

function angleDifference(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function createWorld(random) {
  const solid = new Uint8Array(COLS * ROWS);
  const bush = new Uint8Array(COLS * ROWS);
  /** The map character at each tile ('#', 'C', 'B', '.', 'P', 'E', 'G'), for the renderer. */
  const kinds = new Array(COLS * ROWS).fill('.');
  const player = { x: 0, y: 0, radius: PLAYER.radius, moving: false, sprinting: false, hidden: false, angle: 0 };
  const guards = [];
  const loot = [];
  const coin = { active: false, x: 0, y: 0, tx: 0, ty: 0, t: 0, ring: 0 };
  const exit = { x: 0, y: 0, tx: 0, ty: 0 };
  const state = {
    player, guards, loot, coin, exit,
    levelIndex: 0, levelName: LEVELS[0].name, levelCount: LEVELS.length,
    lives: LIVES, score: 0, levelScore: 0,
    lootGot: 0, lootTotal: 0, coinsLeft: 0,
    levelTime: 0, totalTime: 0,
    /** Stats of the level just completed, for the level-complete panel. */
    lastLevel: { name: '', time: 0, lootGot: 0, lootTotal: 0, score: 0 },
  };

  function tileSolid(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return true;
    return solid[ty * COLS + tx] === 1;
  }

  function tileBush(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return false;
    return bush[ty * COLS + tx] === 1;
  }

  /** True when a circle of radius `r` at (x, y) would overlap a solid tile. */
  function circleHitsSolid(x, y, r) {
    const x0 = Math.floor((x - r) / TILE);
    const x1 = Math.floor((x + r) / TILE);
    const y0 = Math.floor((y - r) / TILE);
    const y1 = Math.floor((y + r) / TILE);
    for (let ty = y0; ty <= y1; ty += 1) {
      for (let tx = x0; tx <= x1; tx += 1) {
        if (!tileSolid(tx, ty)) continue;
        const cx = Math.max(tx * TILE, Math.min(x, tx * TILE + TILE));
        const cy = Math.max(ty * TILE, Math.min(y, ty * TILE + TILE));
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy < r * r) return true;
      }
    }
    return false;
  }

  /** Slide a circle by (dx, dy), axis by axis, so it never enters a solid tile. */
  function moveCircle(body, dx, dy) {
    if (dx !== 0 && !circleHitsSolid(body.x + dx, body.y, body.radius)) body.x += dx;
    if (dy !== 0 && !circleHitsSolid(body.x, body.y + dy, body.radius)) body.y += dy;
  }

  /** True when nothing solid stands between the two points (sampled along the segment). */
  function lineOfSight(x0, y0, x1, y1) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const dist = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(dist / 6));
    for (let i = 1; i < steps; i += 1) {
      const t = i / steps;
      if (tileSolid(Math.floor((x0 + dx * t) / TILE), Math.floor((y0 + dy * t) / TILE))) return false;
    }
    return true;
  }

  function inBushAt(x, y) {
    return tileBush(Math.floor(x / TILE), Math.floor(y / TILE));
  }

  /** Could the guard at its current spot and facing see a courier standing at (x, y)? */
  function guardSeesAt(guard, x, y) {
    const dx = x - guard.x;
    const dy = y - guard.y;
    const dist = Math.hypot(dx, dy);
    if (dist > guard.range) return false;
    if (Math.abs(angleDifference(Math.atan2(dy, dx), guard.angle)) > guard.halfFov) return false;
    if (inBushAt(x, y)) return false;
    return lineOfSight(guard.x, guard.y, x, y);
  }

  function loadLevel(index) {
    const level = LEVELS[index];
    solid.fill(0);
    bush.fill(0);
    loot.length = 0;
    guards.length = 0;
    coin.active = false;
    coin.ring = 0;
    let start = { x: TILE * 1.5, y: TILE * 1.5 };
    for (let ty = 0; ty < ROWS; ty += 1) {
      const row = level.map[ty];
      for (let tx = 0; tx < COLS; tx += 1) {
        const cell = row[tx];
        kinds[ty * COLS + tx] = cell;
        if (cell === '#' || cell === 'C') solid[ty * COLS + tx] = 1;
        else if (cell === 'B') bush[ty * COLS + tx] = 1;
        else if (cell === 'P') start = tileCentre(tx, ty);
        else if (cell === 'E') {
          const c = tileCentre(tx, ty);
          exit.x = c.x;
          exit.y = c.y;
          exit.tx = tx;
          exit.ty = ty;
        } else if (cell === 'G') {
          const c = tileCentre(tx, ty);
          loot.push({ x: c.x, y: c.y, active: true });
        }
      }
    }
    player.x = start.x;
    player.y = start.y;
    player.angle = 0;
    player.moving = false;
    player.sprinting = false;
    player.hidden = false;
    for (const def of level.guards) {
      const points = def.waypoints.map(([tx, ty]) => tileCentre(tx, ty));
      const first = points[0];
      const second = points[1] ?? points[0];
      guards.push({
        x: first.x, y: first.y, radius: GUARD.radius,
        angle: Math.atan2(second.y - first.y, second.x - first.x),
        state: 'patrol', waypoints: points, wpIndex: 1 % points.length,
        meter: 0, lastSeen: { x: first.x, y: first.y },
        scanTimer: 0, pauseTimer: 0, scanDir: 1,
        speed: GUARD.patrolSpeed, range: GUARD.range, halfFov: GUARD.halfFov,
        stuckTimer: 0, lastX: first.x, lastY: first.y,
      });
    }
    state.levelIndex = index;
    state.levelName = level.name;
    state.lootTotal = loot.length;
    state.lootGot = 0;
    state.levelScore = 0;
    state.levelTime = 0;
    state.coinsLeft = level.coins;
  }

  function reset() {
    state.lives = LIVES;
    state.score = 0;
    state.totalTime = 0;
    loadLevel(0);
  }

  function nearestWaypointIndex(guard) {
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < guard.waypoints.length; i += 1) {
      const d = Math.hypot(guard.waypoints[i].x - guard.x, guard.waypoints[i].y - guard.y);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    return best;
  }

  function updateGuard(guard, dt, harmless) {
    // A guard that cannot reach its target for a while skips to the next waypoint. A guard
    // that is searching, or pausing at a waypoint, stands still on purpose: never count that.
    if (guard.state !== 'search' && guard.pauseTimer <= 0) {
      if (Math.hypot(guard.x - guard.lastX, guard.y - guard.lastY) < 0.1) {
        guard.stuckTimer += dt;
        if (guard.stuckTimer > 1.5) {
          guard.stuckTimer = 0;
          if (guard.state === 'patrol') guard.wpIndex = (guard.wpIndex + 1) % guard.waypoints.length;
          else {
            guard.state = 'search';
            guard.scanTimer = GUARD.searchSeconds;
          }
        }
      } else {
        guard.stuckTimer = 0;
      }
    }
    guard.lastX = guard.x;
    guard.lastY = guard.y;

    let target = null;
    let speed = guard.speed;
    if (guard.state === 'patrol') {
      if (guard.pauseTimer > 0) {
        guard.pauseTimer -= dt;
        return;
      }
      target = guard.waypoints[guard.wpIndex];
      speed = GUARD.patrolSpeed;
    } else if (guard.state === 'chase') {
      target = guard.lastSeen;
      speed = GUARD.chaseSpeed;
    } else if (guard.state === 'investigate') {
      target = guard.lastSeen;
      speed = GUARD.investigateSpeed;
    } else if (guard.state === 'search') {
      guard.scanTimer -= dt;
      guard.angle += guard.scanDir * 1.4 * dt;
      if (guard.scanTimer <= 0) {
        guard.state = 'patrol';
        guard.wpIndex = nearestWaypointIndex(guard);
        guard.pauseTimer = 0.3;
      }
      return;
    }
    if (target === null) return;
    const dx = target.x - guard.x;
    const dy = target.y - guard.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 7) {
      if (guard.state === 'patrol') {
        guard.wpIndex = (guard.wpIndex + 1) % guard.waypoints.length;
        guard.pauseTimer = 0.35;
      } else if (guard.state === 'chase') {
        guard.state = 'search';
        guard.scanTimer = GUARD.searchSeconds;
      } else if (guard.state === 'investigate') {
        guard.state = 'search';
        guard.scanTimer = GUARD.investigateSeconds;
      }
      return;
    }
    const step = Math.min(dist, speed * dt);
    const nx = guard.x + (dx / dist) * step;
    const ny = guard.y + (dy / dist) * step;
    const beforeX = guard.x;
    const beforeY = guard.y;
    moveCircle(guard, nx - guard.x, ny - guard.y);
    const moved = Math.hypot(guard.x - beforeX, guard.y - beforeY);
    if (moved > 0.01) guard.angle = Math.atan2(guard.y - beforeY, guard.x - beforeX);
  }

  function updateCoin(dt) {
    if (!coin.active) return;
    if (coin.t < 1) {
      coin.t = Math.min(1, coin.t + dt / COIN.flightSeconds);
      // Fly straight from the throw origin to the target.
      coin.x = coin.startX + (coin.tx - coin.startX) * coin.t;
      coin.y = coin.startY + (coin.ty - coin.startY) * coin.t;
      if (coin.t >= 1) {
        let best = null;
        let bestDist = GUARD.investigateRadius;
        for (const guard of guards) {
          const d = Math.hypot(guard.x - coin.tx, guard.y - coin.ty);
          if (d < bestDist) {
            bestDist = d;
            best = guard;
          }
        }
        if (best !== null && best.state !== 'chase') {
          best.state = 'investigate';
          best.lastSeen.x = coin.tx;
          best.lastSeen.y = coin.ty;
          best.meter = Math.max(0, best.meter - 0.4);
        }
        coin.ring = COIN.ringSeconds;
      }
    } else if (coin.ring > 0) {
      coin.ring = Math.max(0, coin.ring - dt);
      if (coin.ring === 0) coin.active = false;
    }
  }

  /**
   * One fixed step. `input` is { mx, my, sprint, throwTarget } (throwTarget null or {x, y} in
   * world pixels). With `harmless` set (the title screen's backdrop) guards patrol but nothing
   * is seen, caught or scored.
   */
  function step(dt, input, harmless) {
    let events = 0;
    state.levelTime += dt;
    state.totalTime += dt;

    if (!harmless) {
      const len = Math.hypot(input.mx, input.my);
      const nx = len > 0 ? input.mx / len : 0;
      const ny = len > 0 ? input.my / len : 0;
      const speed = input.sprint ? PLAYER.sprint : PLAYER.walk;
      player.moving = len > 0;
      player.sprinting = input.sprint && len > 0;
      if (len > 0) {
        player.angle = Math.atan2(ny, nx);
        moveCircle(player, nx * speed * dt, ny * speed * dt);
      }
      player.hidden = inBushAt(player.x, player.y);

      if (input.throwTarget !== null && input.throwTarget !== undefined && state.coinsLeft > 0 && !coin.active) {
        state.coinsLeft -= 1;
        coin.active = true;
        coin.startX = player.x;
        coin.startY = player.y;
        coin.x = player.x;
        coin.y = player.y;
        coin.tx = Math.max(8, Math.min(FIELD.width - 8, input.throwTarget.x));
        coin.ty = Math.max(8, Math.min(FIELD.height - 8, input.throwTarget.y));
        coin.t = 0;
        coin.ring = 0;
        events |= EVENT_THROW;
      }
    }

    updateCoin(dt);

    for (const guard of guards) {
      updateGuard(guard, dt, harmless);
      if (harmless) continue;
      const seen = guardSeesAt(guard, player.x, player.y);
      const dist = Math.hypot(player.x - guard.x, player.y - guard.y);
      if (seen) {
        guard.meter += GUARD.detectFill * (1 + (1 - dist / guard.range) * 0.6) * dt;
        guard.lastSeen.x = player.x;
        guard.lastSeen.y = player.y;
        if (guard.meter >= 1 && guard.state !== 'chase') {
          guard.meter = 1;
          guard.state = 'chase';
          events |= EVENT_ALERT;
        }
      } else {
        guard.meter = Math.max(0, guard.meter - GUARD.detectDrain * dt);
      }
      if (player.sprinting && !player.hidden && dist < PLAYER.noiseRadius) {
        const want = Math.atan2(player.y - guard.y, player.x - guard.x);
        guard.angle += angleDifference(want, guard.angle) * Math.min(1, 3 * dt);
        guard.meter = Math.min(1, guard.meter + GUARD.hearFill * dt);
        if (guard.meter >= 1 && guard.state !== 'chase') {
          guard.state = 'chase';
          guard.lastSeen.x = player.x;
          guard.lastSeen.y = player.y;
          events |= EVENT_ALERT;
        }
      }
      if (dist < GUARD.catchDist && state.lives > 0) {
        events |= EVENT_CAUGHT;
        state.lives -= 1;
        if (state.lives <= 0) {
          events |= EVENT_OVER;
        } else {
          loadLevel(state.levelIndex);
        }
        return events;
      }
    }

    if (harmless) return events;

    for (const item of loot) {
      if (!item.active) continue;
      if (Math.hypot(player.x - item.x, player.y - item.y) < 24) {
        item.active = false;
        state.lootGot += 1;
        state.levelScore += LOOT.points;
        events |= EVENT_COIN;
      }
    }

    if (Math.abs(player.x - exit.x) < TILE / 2 && Math.abs(player.y - exit.y) < TILE / 2) {
      const bonus = Math.max(0, TIME_BONUS.base - Math.floor(state.levelTime) * TIME_BONUS.perSecond);
      state.score += state.levelScore + bonus;
      state.lastLevel = {
        name: LEVELS[state.levelIndex].name,
        time: state.levelTime,
        lootGot: state.lootGot,
        lootTotal: state.lootTotal,
        score: state.score,
      };
      state.levelScore = 0;
      events |= EVENT_LEVEL;
      if (state.levelIndex >= LEVELS.length - 1) {
        events |= EVENT_WIN;
      } else {
        loadLevel(state.levelIndex + 1);
      }
    }
    return events;
  }

  function tileKind(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return '#';
    return kinds[ty * COLS + tx];
  }

  /** Would any guard see a courier standing at (x, y) right now? (Autopilot helper.) */
  function seenAt(x, y) {
    if (inBushAt(x, y)) return false;
    for (const guard of guards) {
      if (guardSeesAt(guard, x, y)) return true;
    }
    return false;
  }

  reset();
  return {
    state, reset, step, loadLevel, seenAt, inBushAt, tileSolid, tileKind, lineOfSight,
    /** Would a circle of radius `r` at (x, y) stand clear of walls and crates? */
    canStandAt(x, y, r) {
      return !circleHitsSolid(x, y, r);
    },
  };
}
