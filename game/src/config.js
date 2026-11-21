// Shadow Courier: every tuning number and colour in one place. The playfield is a fixed
// 1280x720 logical area (32 by 18 tiles of 40 px); the renderer scales it to the window, so
// no rule below depends on the screen size.

export const FIELD = { width: 1280, height: 720 };
export const TILE = 40;
export const COLS = 32;
export const ROWS = 18;

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const PLAYER = {
  radius: 12,
  walk: 175,
  sprint: 265,
  /** Guards inside this radius hear a sprinting courier and turn toward them. */
  noiseRadius: 250,
};

export const LIVES = 3;

export const GUARD = {
  radius: 13,
  patrolSpeed: 95,
  chaseSpeed: 168,
  searchSpeed: 70,
  investigateSpeed: 130,
  /** How far a guard can see, in pixels. */
  range: 230,
  /** Half of the vision cone's opening angle, in radians (about 35 degrees each side). */
  halfFov: 0.61,
  /** Detection meter fills this fast (per second) while the courier is seen; closer is faster. */
  detectFill: 1.15,
  /** Detection meter drains this fast (per second) while the courier is hidden. */
  detectDrain: 0.55,
  /** A sprinting courier this close to a guard raises the meter even unseen (heard). */
  hearFill: 0.25,
  /** Touching a guard at this distance gets the courier caught. */
  catchDist: 27,
  /** A thrown coin draws the nearest guard inside this radius to investigate. */
  investigateRadius: 430,
  /** Seconds a guard scans a spot it chased to before giving up. */
  searchSeconds: 2.5,
  /** Seconds a guard studies a coin's landing spot before resuming patrol. */
  investigateSeconds: 1.6,
};

export const COIN = {
  /** Coins per level, in level order. */
  perLevel: [3, 3, 2],
  /** Seconds a thrown coin takes to fly to its target. */
  flightSeconds: 0.28,
  /** Seconds the landing ring stays visible. */
  ringSeconds: 2.5,
};

export const LOOT = { points: 100 };

/** Level-complete bonus: 500 minus 8 per second spent on the level, never below zero. */
export const TIME_BONUS = { base: 500, perSecond: 8 };

export const PALETTE = {
  backdrop: '#0d1117',
  floorA: '#232c3d',
  floorB: '#28324a',
  floorEdge: '#1b2230',
  wall: '#3a4660',
  wallTop: '#55648a',
  crate: '#6b5433',
  crateEdge: '#8a6f45',
  bush: '#2e5d3a',
  bushLight: '#3f7a4e',
  player: '#ffd166',
  playerDark: '#c79a3a',
  guard: '#e5534b',
  guardDark: '#a83a34',
  cone: '#f2c94c',
  coneAlert: '#e5534b',
  coneSeen: '#ff9f43',
  exit: '#37c978',
  exitGlow: '#7be3a8',
  loot: '#f2c94c',
  coin: '#ffd94d',
  panel: '#1d2433',
  panelEdge: '#33405c',
  text: '#eef1f5',
  muted: '#9aa5bb',
  danger: '#ff6b61',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'shadow-courier.best';
