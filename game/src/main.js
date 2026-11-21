// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s steps
// (several in a slow frame, none in a fast one), and the renderer paints what is there. The game
// moves between six screens: title, play, paused, level complete, game over and win. Sounds are
// tiny blips synthesised with WebAudio in code; there are no audio files.
//
// ?seed=N fixes the game. ?shot=start|play|end (with &seed=N) stages that scene instead of
// running the loop, paints it twice and sets window.__shotReady for a screenshot.
import { BEST_KEY, LIVES, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_ALERT, EVENT_CAUGHT, EVENT_COIN, EVENT_LEVEL, EVENT_OVER, EVENT_THROW, EVENT_WIN } from './world.js';
import { ACTION_CONFIRM, ACTION_PAUSE, createInput } from './input.js';
import { createRenderer, SCREEN_LEVEL, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas, world);

/** One short synthesised blip; silent when audio is unavailable or blocked. */
let audio = null;
function beep(freq, seconds, type, volume) {
  try {
    if (audio === null) audio = new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') void audio.resume();
    const tone = audio.createOscillator();
    const gain = audio.createGain();
    tone.type = type || 'sine';
    tone.frequency.value = freq;
    gain.gain.value = volume || 0.07;
    tone.connect(gain);
    gain.connect(audio.destination);
    tone.start();
    tone.stop(audio.currentTime + seconds);
  } catch {
    // No audio on this browser: the game plays on silently.
  }
}

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas, renderer.toWorld);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();

  // Screen readers (and anyone watching the page's text) hear the screen changes and each catch.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset();
    input.takeThrow();
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce(`Playing. ${LIVES} lives. ${world.state.levelName}.`);
  }

  function finishGame(won) {
    screen = won ? SCREEN_WIN : SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    announce(won ? `You win. Score ${world.state.score}. Best ${best}.` : `Caught. Game over. Score ${world.state.score}. Best ${best}.`);
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_WIN)) {
      startGame();
    } else if (actions & ACTION_CONFIRM && screen === SCREEN_LEVEL) {
      screen = SCREEN_PLAY;
      announce(`Playing. ${world.state.levelName}.`);
    } else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, { mx: 0, my: 0, sprint: false, throwTarget: null }, true);
      return;
    }
    const direction = input.direction();
    const events = world.step(STEP, {
      mx: direction.mx,
      my: direction.my,
      sprint: direction.sprint,
      throwTarget: input.takeThrow(),
    }, false);
    if (events & EVENT_COIN) beep(880, 0.08, 'sine', 0.06);
    if (events & EVENT_THROW) beep(1320, 0.05, 'sine', 0.05);
    if (events & EVENT_ALERT) {
      beep(180, 0.25, 'sawtooth', 0.1);
      announce('Spotted! A guard is chasing you.');
    }
    if (events & EVENT_WIN) {
      beep(523, 0.12, 'sine', 0.08);
      setTimeout(() => beep(659, 0.12, 'sine', 0.08), 120);
      setTimeout(() => beep(784, 0.2, 'sine', 0.08), 240);
      finishGame(true);
    } else if (events & EVENT_LEVEL) {
      beep(660, 0.1, 'sine', 0.07);
      setTimeout(() => beep(880, 0.15, 'sine', 0.07), 110);
      screen = SCREEN_LEVEL;
      announce(`Level complete. Score ${world.state.score}.`);
    } else if (events & EVENT_OVER) {
      beep(90, 0.4, 'square', 0.1);
      finishGame(false);
    } else if (events & EVENT_CAUGHT) {
      beep(140, 0.3, 'square', 0.1);
      announce(world.state.lives === 1 ? 'Caught. 1 life left.' : `Caught. ${world.state.lives} lives left.`);
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best);
  }

  // Leaving the tab pauses a running game rather than letting guards close in unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Shadow Courier. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
