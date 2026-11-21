// Drawing only: the world's state and the current screen in, pixels out. The 1280x720
// playfield is scaled to fit the window and centred, the margin filled with the backdrop
// colour. Flat colours and canvas text for the HUD and the panels. A guard's vision cone is
// drawn as a polygon raycast against the walls, so cover really does cut the cone short.
import { COLS, FIELD, FONT, LIVES, PALETTE, ROWS, TILE } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_LEVEL = 'level';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

/** The panel's width; its height grows with its lines: room for the title, the lines and the prompt. */
const PANEL = { width: 640, top: 132, line: 32, bottom: 68 };
const CONE_RAYS = 20;

function formatTime(seconds) {
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${rest < 10 ? '0' : ''}${rest}`;
}

export function createRenderer(canvas, world) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const css = { scale: 1, x: 0, y: 0 };

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
    const rect = canvas.getBoundingClientRect();
    css.scale = Math.min(rect.width / FIELD.width, rect.height / FIELD.height);
    css.x = (rect.width - FIELD.width * css.scale) / 2;
    css.y = (rect.height - FIELD.height * css.scale) / 2;
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align) {
    if (!fonts.has(size)) fonts.set(size, `${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align;
    context.fillText(value, x, y);
  }

  function circle(x, y, r, color) {
    context.fillStyle = color;
    context.beginPath();
    context.arc(x, y, r, 0, Math.PI * 2);
    context.fill();
  }

  /** March a ray from (x, y) along `angle` until a solid tile or the range ends; return the hit point. */
  function rayHit(x, y, angle, range) {
    const stepX = Math.cos(angle) * 8;
    const stepY = Math.sin(angle) * 8;
    let px = x;
    let py = y;
    for (let d = 8; d <= range; d += 8) {
      px = x + stepX * (d / 8);
      py = y + stepY * (d / 8);
      if (world.tileSolid(Math.floor(px / TILE), Math.floor(py / TILE))) return { x: px, y: py };
    }
    return { x: x + Math.cos(angle) * range, y: y + Math.sin(angle) * range };
  }

  function drawCone(guard) {
    const alerted = guard.state === 'chase';
    const suspicious = guard.meter > 0.02;
    context.beginPath();
    context.moveTo(guard.x, guard.y);
    for (let i = 0; i <= CONE_RAYS; i += 1) {
      const angle = guard.angle - guard.halfFov + (2 * guard.halfFov * i) / CONE_RAYS;
      const hit = rayHit(guard.x, guard.y, angle, guard.range);
      context.lineTo(hit.x, hit.y);
    }
    context.closePath();
    context.fillStyle = alerted ? PALETTE.coneAlert : suspicious ? PALETTE.coneSeen : PALETTE.cone;
    context.globalAlpha = alerted ? 0.35 : 0.24;
    context.fill();
    context.globalAlpha = 1;
  }

  function drawField(state) {
    for (let ty = 0; ty < ROWS; ty += 1) {
      for (let tx = 0; tx < COLS; tx += 1) {
        const kind = world.tileKind(tx, ty);
        const x = tx * TILE;
        const y = ty * TILE;
        if (kind === '#') {
          context.fillStyle = PALETTE.wall;
          context.fillRect(x, y, TILE, TILE);
          context.fillStyle = PALETTE.wallTop;
          context.fillRect(x, y, TILE, 5);
        } else if (kind === 'C') {
          context.fillStyle = PALETTE.floorA;
          context.fillRect(x, y, TILE, TILE);
          context.fillStyle = PALETTE.crate;
          context.fillRect(x + 4, y + 4, TILE - 8, TILE - 8);
          context.strokeStyle = PALETTE.crateEdge;
          context.lineWidth = 2;
          context.beginPath();
          context.moveTo(x + 4, y + 4);
          context.lineTo(x + TILE - 4, y + TILE - 4);
          context.moveTo(x + TILE - 4, y + 4);
          context.lineTo(x + 4, y + TILE - 4);
          context.stroke();
        } else if (kind === 'B') {
          context.fillStyle = PALETTE.floorA;
          context.fillRect(x, y, TILE, TILE);
          circle(x + 13, y + 15, 11, PALETTE.bush);
          circle(x + 27, y + 13, 12, PALETTE.bushLight);
          circle(x + 20, y + 27, 10, PALETTE.bush);
        } else {
          context.fillStyle = (tx + ty) % 2 === 0 ? PALETTE.floorA : PALETTE.floorB;
          context.fillRect(x, y, TILE, TILE);
        }
      }
    }

    // Exit door: a glowing green doorway with its label.
    const exit = state.exit;
    context.fillStyle = PALETTE.exit;
    context.fillRect(exit.x - 17, exit.y - 17, 34, 34);
    context.fillStyle = PALETTE.exitGlow;
    context.fillRect(exit.x - 11, exit.y - 11, 22, 22);
    context.fillStyle = PALETTE.panel;
    context.fillRect(exit.x - 2, exit.y - 11, 4, 22);
    context.textBaseline = 'alphabetic';
    text('EXIT', exit.x, exit.y - 26, 15, PALETTE.exitGlow, 'center');

    for (const item of state.loot) {
      if (!item.active) continue;
      context.save();
      context.translate(item.x, item.y);
      context.rotate(Math.PI / 4);
      context.fillStyle = PALETTE.loot;
      context.fillRect(-8, -8, 16, 16);
      context.fillStyle = '#fff3c4';
      context.fillRect(-4, -4, 8, 8);
      context.restore();
    }

    const coin = state.coin;
    if (coin.active && coin.t < 1) {
      circle(coin.x, coin.y, 6, PALETTE.coin);
      context.strokeStyle = PALETTE.coin;
      context.lineWidth = 2;
      context.beginPath();
      context.arc(coin.x, coin.y, 10, 0, Math.PI * 2);
      context.stroke();
    } else if (coin.active && coin.ring > 0) {
      const progress = 1 - coin.ring / 2.5;
      context.globalAlpha = 0.8 * (1 - progress);
      context.strokeStyle = PALETTE.coin;
      context.lineWidth = 3;
      context.beginPath();
      context.arc(coin.tx, coin.ty, 8 + progress * 26, 0, Math.PI * 2);
      context.stroke();
      context.globalAlpha = 1;
      circle(coin.tx, coin.ty, 5, PALETTE.coin);
    }

    for (const guard of state.guards) drawCone(guard);

    for (const guard of state.guards) {
      circle(guard.x, guard.y, guard.radius, guard.state === 'chase' ? PALETTE.guard : PALETTE.guardDark);
      context.strokeStyle = PALETTE.guard;
      context.lineWidth = 2;
      context.beginPath();
      context.arc(guard.x, guard.y, guard.radius, 0, Math.PI * 2);
      context.stroke();
      // Facing tick: the guard's eyes look where it looks.
      circle(
        guard.x + Math.cos(guard.angle) * (guard.radius - 3),
        guard.y + Math.sin(guard.angle) * (guard.radius - 3),
        3.5,
        PALETTE.text,
      );
      if (guard.meter > 0.02 && guard.state !== 'chase') {
        context.strokeStyle = PALETTE.coneSeen;
        context.lineWidth = 4;
        context.beginPath();
        context.arc(guard.x, guard.y, guard.radius + 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * guard.meter);
        context.stroke();
      }
      if (guard.state === 'chase') text('!', guard.x, guard.y - guard.radius - 6, 22, PALETTE.danger, 'center');
      else if (guard.state === 'investigate' || guard.state === 'search') text('?', guard.x, guard.y - guard.radius - 6, 20, PALETTE.cone, 'center');
    }

    const player = state.player;
    context.globalAlpha = player.hidden ? 0.55 : 1;
    circle(player.x, player.y, player.radius, PALETTE.player);
    context.strokeStyle = PALETTE.playerDark;
    context.lineWidth = 2;
    context.beginPath();
    context.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
    context.stroke();
    circle(
      player.x + Math.cos(player.angle) * (player.radius - 3),
      player.y + Math.sin(player.angle) * (player.radius - 3),
      3,
      PALETTE.panel,
    );
    context.globalAlpha = 1;
    if (player.hidden) {
      context.setLineDash([5, 4]);
      context.strokeStyle = PALETTE.bushLight;
      context.lineWidth = 2;
      context.beginPath();
      context.arc(player.x, player.y, player.radius + 6, 0, Math.PI * 2);
      context.stroke();
      context.setLineDash([]);
      text('HIDDEN', player.x, player.y - player.radius - 8, 12, PALETTE.bushLight, 'center');
    }
  }

  function drawHud(state) {
    context.textBaseline = 'top';
    let maxMeter = 0;
    for (const guard of state.guards) maxMeter = Math.max(maxMeter, guard.meter);
    const anyChase = state.guards.some((guard) => guard.state === 'chase');

    text(`Score ${state.score + state.levelScore}`, 24, 16, 24, PALETTE.text, 'left');
    text(`${state.levelName}  ·  Level ${state.levelIndex + 1}/${state.levelCount}`, FIELD.width / 2, 16, 24, PALETTE.text, 'center');
    text(`Time ${formatTime(state.levelTime)}`, FIELD.width - 24, 16, 24, PALETTE.text, 'right');

    text(`Loot ◆ ${state.lootGot}/${state.lootTotal}`, 24, 48, 20, PALETTE.loot, 'left');
    text(`Coins ● ${state.coinsLeft}  (click to throw)`, 24, 74, 20, PALETTE.coin, 'left');

    let hearts = '';
    for (let i = 0; i < LIVES; i += 1) hearts += i < state.lives ? '♥' : '♡';
    text(hearts, FIELD.width - 24, 48, 22, PALETTE.guard, 'right');

    if (maxMeter > 0.02 || anyChase) {
      const flash = anyChase ? 0.6 + 0.4 * Math.sin(state.totalTime * 10) : 1;
      context.globalAlpha = flash;
      text(anyChase ? 'SPOTTED — RUN!' : 'SEEN!', FIELD.width / 2, 52, 30, PALETTE.danger, 'center');
      context.globalAlpha = 1;
      context.fillStyle = PALETTE.panel;
      context.fillRect(FIELD.width / 2 - 90, 92, 180, 10);
      context.fillStyle = PALETTE.danger;
      context.fillRect(FIELD.width / 2 - 90, 92, 180 * maxMeter, 10);
    }
  }

  function drawPanel(title, lines, prompt) {
    const height = PANEL.top + lines.length * PANEL.line + PANEL.bottom;
    const x = (FIELD.width - PANEL.width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, y, PANEL.width, height);
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    context.strokeRect(x, y, PANEL.width, height);
    context.textBaseline = 'alphabetic';
    text(title, FIELD.width / 2, y + 76, 46, PALETTE.text, 'center');
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], FIELD.width / 2, y + PANEL.top + index * PANEL.line, 21, PALETTE.muted, 'center');
    }
    text(prompt, FIELD.width / 2, y + height - 38, 23, PALETTE.coin, 'center');
  }

  const TITLE_LINES = [
    'You are the Shadow Courier. Cross the museum at night,',
    'slip past the guards, grab the parcels, reach the green EXIT.',
    'Move with WASD or arrow keys. Hold Shift to sprint (loud!).',
    'Click to throw a coin and lure a guard away. Bushes hide you.',
    'Walls and crates block a guard\'s sight. 3 lives. 3 levels.',
    '',
  ];
  const PAUSED_LINES = ['The guards will wait for you.'];
  const OVER_LINES = ['', ''];
  const LEVEL_LINES = ['', '', ''];
  const WIN_LINES = ['', '', ''];

  /** Paint one frame: the field, then the HUD or a panel for the screen the game is on. */
  function draw(state, screen, best) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    drawField(state);
    if (screen === SCREEN_TITLE) {
      TITLE_LINES[5] = `Best score ${best}`;
      drawPanel('SHADOW COURIER', TITLE_LINES, 'Press Space or click to start');
      return;
    }
    drawHud(state);
    if (screen === SCREEN_PAUSED) drawPanel('Paused', PAUSED_LINES, 'Press P to resume');
    else if (screen === SCREEN_LEVEL) {
      LEVEL_LINES[0] = `${state.lastLevel.name} cleared!`;
      LEVEL_LINES[1] = `Time ${formatTime(state.lastLevel.time)}  ·  Loot ${state.lastLevel.lootGot}/${state.lastLevel.lootTotal}`;
      LEVEL_LINES[2] = `Score ${state.lastLevel.score}`;
      drawPanel('Level complete', LEVEL_LINES, 'Press Space or click for the next level');
    } else if (screen === SCREEN_OVER) {
      OVER_LINES[0] = `Score ${state.score}`;
      OVER_LINES[1] = `Best ${best}`;
      drawPanel('Caught!', OVER_LINES, 'Press Space or click to try again');
    } else if (screen === SCREEN_WIN) {
      WIN_LINES[0] = 'Every parcel delivered. Nobody saw a thing.';
      WIN_LINES[1] = `Score ${state.score}  ·  Time ${formatTime(state.totalTime)}`;
      WIN_LINES[2] = `Best ${best}`;
      drawPanel('GHOST — YOU WIN!', WIN_LINES, 'Press Space or click to play again');
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return {
    draw,
    /** Client (CSS pixel) coordinates to world coordinates, for mouse clicks. */
    toWorld(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (clientX - rect.left - css.x) / css.scale,
        y: (clientY - rect.top - css.y) / css.scale,
      };
    },
  };
}
