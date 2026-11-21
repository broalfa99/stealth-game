// The screenshot scenes behind ?shot=start|play|end. Each one plays the real rules forward
// from a fresh world for a fixed number of steps, steered by an autopilot that plans a path
// across the tile grid with A* (tiles inside a guard's cone cost far more than open floor),
// replans twice a second as the guards move, and waits behind cover when the only way
// forward is watched — so the frame is what a short game really looks like and the same seed
// always gives the same frame.
import { COLS, FIELD, PLAYER, ROWS, STEP, TILE } from './config.js';
import { EVENT_LEVEL, EVENT_OVER, EVENT_WIN } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';

const START_SECONDS = 5;
const PLAY_SECONDS = 18;
const END_LIMIT_SECONDS = 600;
const REPLAN_EVERY = 30;
const IDLE = { mx: 0, my: 0, sprint: false, throwTarget: null };
const MOVES = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIRS8 = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/**
 * Cheapest tile path from the courier to the exit. A tile inside a guard's cone costs
 * `conePenalty` extra, so the pilot detours around watched ground when it can; a tile near
 * a guard costs a little extra, so it keeps its distance.
 */
function planPath(world, conePenalty) {
  const state = world.state;
  const startX = Math.floor(state.player.x / TILE);
  const startY = Math.floor(state.player.y / TILE);
  const goalX = state.exit.tx;
  const goalY = state.exit.ty;
  const key = (x, y) => y * COLS + x;
  const tileCost = (x, y) => {
    const cx = x * TILE + TILE / 2;
    const cy = y * TILE + TILE / 2;
    let cost = 1;
    if (world.seenAt(cx, cy)) cost += conePenalty;
    for (const guard of state.guards) {
      const d = Math.hypot(guard.x - cx, guard.y - cy);
      if (d < 120) cost += (120 - d) / 40;
    }
    return cost;
  };
  const gScore = new Map([[key(startX, startY), 0]]);
  const cameFrom = new Map();
  const open = [{ x: startX, y: startY, f: 0 }];
  const closed = new Set();
  while (open.length > 0) {
    let bestIndex = 0;
    for (let i = 1; i < open.length; i += 1) if (open[i].f < open[bestIndex].f) bestIndex = i;
    const current = open.splice(bestIndex, 1)[0];
    const currentKey = key(current.x, current.y);
    if (closed.has(currentKey)) continue;
    closed.add(currentKey);
    if (current.x === goalX && current.y === goalY) {
      const path = [];
      let node = current;
      while (node !== undefined) {
        path.unshift({ x: node.x, y: node.y });
        node = cameFrom.get(key(node.x, node.y));
      }
      return path;
    }
    for (const [dx, dy] of MOVES) {
      const nx = current.x + dx;
      const ny = current.y + dy;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      if (world.tileSolid(nx, ny)) continue;
      const nextKey = key(nx, ny);
      if (closed.has(nextKey)) continue;
      const g = gScore.get(currentKey) + tileCost(nx, ny);
      if (g < (gScore.get(nextKey) ?? Infinity)) {
        gScore.set(nextKey, g);
        cameFrom.set(nextKey, current);
        const h = Math.abs(goalX - nx) + Math.abs(goalY - ny);
        open.push({ x: nx, y: ny, f: g + h });
      }
    }
  }
  return null;
}

/** Flee: of the eight ways to step, the one out of every cone and farthest from the guards. */
function flee(world) {
  const state = world.state;
  const player = state.player;
  let best = [0, 0];
  let bestCost = Infinity;
  for (const [dx, dy] of DIRS8) {
    const len = Math.hypot(dx, dy) || 1;
    const nx = player.x + (dx / len) * PLAYER.walk * 0.3;
    const ny = player.y + (dy / len) * PLAYER.walk * 0.3;
    if (nx < 20 || ny < 20 || nx > FIELD.width - 20 || ny > FIELD.height - 20) continue;
    if (!world.canStandAt(nx, ny, PLAYER.radius)) continue;
    let cost = world.seenAt(nx, ny) ? 10000 : 0;
    for (const guard of state.guards) {
      const gd = Math.hypot(guard.x - nx, guard.y - ny);
      cost += Math.max(0, 200 - gd) * 5;
    }
    if (world.inBushAt(nx, ny)) cost -= 200;
    if (cost < bestCost) {
      bestCost = cost;
      best = [dx, dy];
    }
  }
  const len = Math.hypot(best[0], best[1]) || 1;
  return { mx: best[0] / len, my: best[1] / len, sprint: false, throwTarget: null };
}

function autopilot(world, ctx) {
  const state = world.state;
  const player = state.player;
  ctx.step += 1;
  const distExit = Math.hypot(state.exit.x - player.x, state.exit.y - player.y);
  if (distExit < ctx.bestDist - 20) {
    ctx.bestDist = distExit;
    ctx.stuck = 0;
  } else {
    ctx.stuck += 1;
  }
  // After ~8 s without progress the pilot stops avoiding cones and pushes through.
  const impatience = Math.min(1, ctx.stuck / (60 * 8));
  if (ctx.step % REPLAN_EVERY === 1 || !ctx.path || ctx.path.length === 0) {
    ctx.path = planPath(world, 60 * (1 - impatience) + 1);
  }
  if (!ctx.path || ctx.path.length === 0) return IDLE;
  // Drop the tiles already reached.
  while (ctx.path.length > 1) {
    const next = ctx.path[0];
    const cx = next.x * TILE + TILE / 2;
    const cy = next.y * TILE + TILE / 2;
    if (Math.hypot(cx - player.x, cy - player.y) < 14) ctx.path.shift();
    else break;
  }
  const next = ctx.path[0];
  const cx = next.x * TILE + TILE / 2;
  const cy = next.y * TILE + TILE / 2;
  // Spotted where we stand: run for cover instead of following the plan.
  if (world.seenAt(player.x, player.y)) return flee(world);
  // The only way forward is watched and we can still afford to wait: hold position.
  if (ctx.path.length > 1 && world.seenAt(cx, cy) && impatience < 0.9) return IDLE;
  const dx = cx - player.x;
  const dy = cy - player.y;
  const len = Math.hypot(dx, dy) || 1;
  return { mx: dx / len, my: dy / len, sprint: false, throwTarget: null };
}

/**
 * Set `world` to the named scene (start, play or end; any other name is start) and return the
 * screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'play' && name !== 'end') {
    for (let index = 0; index < START_SECONDS / STEP; index += 1) world.step(STEP, IDLE, true);
    return { screen: SCREEN_TITLE, best: 0 };
  }
  const ctx = { bestDist: Infinity, stuck: 0, step: 0, path: null };
  const limit = name === 'end' ? END_LIMIT_SECONDS : PLAY_SECONDS;
  let won = false;
  let over = false;
  for (let index = 0; index < limit / STEP; index += 1) {
    const events = world.step(STEP, autopilot(world, ctx), false);
    if (events & EVENT_LEVEL) {
      ctx.bestDist = Infinity;
      ctx.stuck = 0;
      ctx.path = null;
    }
    if (events & EVENT_WIN) {
      won = true;
      break;
    }
    if (events & EVENT_OVER) {
      over = true;
      break;
    }
  }
  if (name === 'end') {
    if (won) return { screen: SCREEN_WIN, best: world.state.score };
    if (over) return { screen: SCREEN_OVER, best: world.state.score };
    return { screen: SCREEN_PLAY, best: world.state.score };
  }
  return { screen: SCREEN_PLAY, best: world.state.score };
}
