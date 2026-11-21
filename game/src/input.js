// Keyboard and pointer input. Held keys give a steering vector; one-shot presses (start,
// restart, pause) are queued as bit flags and taken once by the loop, so a press between two
// frames is never lost and never counted twice. A click on the canvas throws a coin to that
// point in the world (taken once, like the actions).

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const SPRINT = new Set(['ShiftLeft', 'ShiftRight']);

export function createInput(target, toWorld) {
  let up = false;
  let down = false;
  let left = false;
  let right = false;
  let sprint = false;
  let actions = 0;
  let throwTarget = null;

  window.addEventListener('keydown', (event) => {
    if (UP.has(event.code)) up = true;
    else if (DOWN.has(event.code)) down = true;
    else if (LEFT.has(event.code)) left = true;
    else if (RIGHT.has(event.code)) right = true;
    else if (SPRINT.has(event.code)) sprint = true;
    else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (UP.has(event.code)) up = false;
    else if (DOWN.has(event.code)) down = false;
    else if (LEFT.has(event.code)) left = false;
    else if (RIGHT.has(event.code)) right = false;
    else if (SPRINT.has(event.code)) sprint = false;
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    up = false;
    down = false;
    left = false;
    right = false;
    sprint = false;
  });
  target.addEventListener('pointerdown', (event) => {
    actions |= ACTION_CONFIRM;
    throwTarget = toWorld(event.clientX, event.clientY);
  });

  return {
    /** The steering vector: -1..1 on each axis (0, 0 when still or when opposite keys cancel). */
    direction() {
      return {
        mx: (right ? 1 : 0) - (left ? 1 : 0),
        my: (down ? 1 : 0) - (up ? 1 : 0),
        sprint,
      };
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** The last click's world point since the last call, or null. */
    takeThrow() {
      const taken = throwTarget;
      throwTarget = null;
      return taken;
    },
  };
}
