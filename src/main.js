// @ts-check
// Entry point: wires the menu, pause, settings and results screens to the game.
import { RANGE } from './mission.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { createInput } from './input.js';
import { createGame } from './game.js';
import { loadSettings, saveSettings, loadBest, saveBest } from './settings.js';

const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));
const SCREENS = ['menu', 'pause', 'settings', 'results'];

let settings = loadSettings();
/** Screen to return to when settings close. */
let settingsReturn = 'menu';

const audio = createAudio();
audio.setEnabled(settings.sound);
const hud = createHud();
const viewCanvas = /** @type {HTMLCanvasElement} */ ($('view'));
const scopeCanvas = /** @type {HTMLCanvasElement} */ ($('scope'));

/** @type {ReturnType<typeof createGame> | null} */
let game = null;

const input = createInput(viewCanvas, {
  fire: () => game && game.fire(),
  scope: () => game && game.toggleScope(),
  breath: (on) => game && game.setBreath(on),
  reload: () => game && game.reload(),
  zoom: (n) => game && game.zoomStep(n),
  pause: () => pauseGame()
});

game = createGame({
  canvas: viewCanvas,
  scopeCanvas,
  mission: RANGE,
  hud,
  audio,
  input,
  settings,
  onEnd: showResults
});

/** Shows one screen, or the HUD when name is null. */
function show(name) {
  for (const s of SCREENS) $('screen-' + s).hidden = s !== name;
  hud.show(name === null);
}

// ---------- menu ----------

$('mission-title').textContent = RANGE.title;
$('mission-location').textContent = RANGE.location;
$('mission-briefing').textContent = RANGE.briefing;
const objectives = $('mission-objectives');
for (const text of RANGE.objectives) {
  const li = document.createElement('li');
  li.textContent = text;
  objectives.appendChild(li);
}
showBest();

function showBest() {
  const best = loadBest(RANGE.id);
  $('mission-best').textContent = best === null ? 'No clean run yet' : 'Best clear ' + clock(best);
}

$('btn-start').addEventListener('click', () => startMission());
$('btn-menu-settings').addEventListener('click', () => openSettings('menu'));

async function startMission() {
  audio.unlock();
  enterFullscreen();
  requestWakeLock();
  if (settings.gyro !== 'off') await input.requestGyroPermission();
  show(null);
  game.start();
}

// ---------- in-game buttons ----------

/** Fires on touch-down for responsiveness; the browser's later click is ignored. */
function press(id, fn) {
  $(id).addEventListener('pointerdown', (e) => {
    e.preventDefault();
    fn();
  });
}
press('btn-fire', () => game.fire());
press('btn-scope', () => game.toggleScope());
press('btn-reload', () => game.reload());
press('btn-pause', () => pauseGame());

const breathBtn = $('btn-breath');
breathBtn.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  try {
    breathBtn.setPointerCapture(e.pointerId);
  } catch (err) {
    /* optional */
  }
  game.setBreath(true);
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  breathBtn.addEventListener(type, () => game.setBreath(false));
}

const zoom = /** @type {HTMLInputElement} */ ($('zoom'));
zoom.addEventListener('input', () => game.setZoom(parseFloat(zoom.value)));

// ---------- pause ----------

function pauseGame() {
  if (game && game.pause()) show('pause');
}
$('btn-resume').addEventListener('click', () => {
  show(null);
  game.resume();
});
$('btn-restart').addEventListener('click', () => {
  show(null);
  game.start();
});
$('btn-quit').addEventListener('click', () => {
  game.toMenu();
  showBest();
  show('menu');
});
$('btn-pause-settings').addEventListener('click', () => openSettings('pause'));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseGame();
});

// ---------- settings ----------

const form = {
  quality: /** @type {HTMLSelectElement} */ ($('set-quality')),
  sensitivity: /** @type {HTMLInputElement} */ ($('set-sensitivity')),
  sensitivityOut: $('set-sensitivity-out'),
  gyro: /** @type {HTMLSelectElement} */ ($('set-gyro')),
  sound: /** @type {HTMLInputElement} */ ($('set-sound')),
  trail: /** @type {HTMLInputElement} */ ($('set-trail'))
};

function openSettings(from) {
  settingsReturn = from;
  form.quality.value = settings.quality;
  form.sensitivity.value = String(settings.sensitivity);
  form.sensitivityOut.textContent = settings.sensitivity.toFixed(1) + '×';
  form.gyro.value = settings.gyro;
  form.sound.checked = settings.sound;
  form.trail.checked = settings.trail;
  show('settings');
}
form.sensitivity.addEventListener('input', () => {
  form.sensitivityOut.textContent = parseFloat(form.sensitivity.value).toFixed(1) + '×';
});
$('btn-settings-done').addEventListener('click', async () => {
  const wantsGyro = form.gyro.value !== 'off' && settings.gyro === 'off';
  settings = {
    quality: /** @type {any} */ (form.quality.value),
    sensitivity: parseFloat(form.sensitivity.value),
    gyro: /** @type {any} */ (form.gyro.value),
    sound: form.sound.checked,
    trail: form.trail.checked
  };
  if (wantsGyro) await input.requestGyroPermission();
  saveSettings(settings);
  game.applySettings(settings);
  show(settingsReturn);
});

// ---------- results ----------

function showResults(r) {
  const win = r.result === 'win';
  $('results-stamp').textContent = win ? 'Cleared' : 'Void';
  $('results-stamp').dataset.tone = win ? 'good' : 'bad';
  $('results-title').textContent = win ? 'Range cleared' : 'Contract void';
  $('results-line').textContent = win
    ? 'Ten paper men down before the club opens. Teodor has the coffee on.'
    : 'You shot Teodor Pell. The club will not open today, and the city will hear why.';
  $('res-time').textContent = clock(r.time);
  $('res-shots').textContent = String(r.shots);
  $('res-accuracy').textContent = r.shots ? Math.round((r.hits / r.shots) * 100) + '%' : '---';
  $('res-heads').textContent = r.heads + ' / ' + r.down;
  $('res-longest').textContent = r.longest ? Math.round(r.longest) + ' m' : '---';
  let bestText = '';
  if (win) {
    const best = loadBest(RANGE.id);
    if (best === null || r.time < best) {
      saveBest(RANGE.id, r.time);
      bestText = 'New best time.';
    } else {
      bestText = 'Best ' + clock(best) + '.';
    }
  }
  $('results-best').textContent = bestText;
  show('results');
}
$('btn-retry').addEventListener('click', () => {
  show(null);
  game.start();
});
$('btn-results-menu').addEventListener('click', () => {
  game.toMenu();
  showBest();
  show('menu');
});

// ---------- helpers ----------

function clock(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m + ':' + String(s).padStart(2, '0');
}

function enterFullscreen() {
  try {
    const el = /** @type {any} */ (document.documentElement);
    if (document.fullscreenElement || !el.requestFullscreen) return;
    el.requestFullscreen({ navigationUI: 'hide' })
      .then(() => {
        const so = /** @type {any} */ (screen).orientation;
        if (so && so.lock) return so.lock('landscape');
        return undefined;
      })
      .catch(() => {});
  } catch (err) {
    /* fullscreen is optional */
  }
}

function requestWakeLock() {
  try {
    const wl = /** @type {any} */ (navigator).wakeLock;
    if (wl) wl.request('screen').catch(() => {});
  } catch (err) {
    /* optional */
  }
}

show('menu');
let selfTestStarted = false;
function maybeSelfTest() {
  if (selfTestStarted) return;
  if (location.hash === '#selftest') {
    selfTestStarted = true;
    runSelfTest();
  } else if (location.hash === '#keeper') {
    // Follows Teodor through the scope, for checking his model and animations.
    selfTestStarted = true;
    show(null);
    game.start();
    game.debug.steady(true);
    game.toggleScope();
    game.setZoom(12);
    setInterval(() => game.debug.lookAtKeeper(), 50);
  }
}
maybeSelfTest();
// The artifact host can hand the hash over after the page has loaded.
window.addEventListener('hashchange', maybeSelfTest);

/**
 * Open the page with #selftest to play the mission automatically: every target gets one
 * shot aimed with the correct holdover, and the result is printed on screen.
 */
async function runSelfTest() {
  const out = document.createElement('pre');
  out.style.cssText = 'position:fixed;left:8px;top:60px;z-index:100;margin:0;padding:8px 10px;'
    + 'background:rgba(0,0,0,.8);color:#e9e3d6;font:12px/1.4 monospace;pointer-events:none';
  document.body.appendChild(out);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  await wait(500);
  show(null);
  game.start();
  game.debug.steady(true);
  game.toggleScope();
  const count = game.debug.targets().length;
  for (let i = 0; i < count; i++) {
    for (let guard = 0; !game.debug.canFire() && guard < 100; guard++) await wait(100);
    game.debug.solve(i);
    await wait(200);
    game.debug.solve(i);
    game.fire();
    out.textContent = 'SELFTEST: shot ' + (i + 1) + ' of ' + count;
    await wait(900);
  }
  await wait(1500);
  const t = game.debug.targets();
  out.textContent = 'SELFTEST ' + (t.every((x) => x.down) && game.debug.keeperAlive() ? 'PASS' : 'FAIL') + '\n'
    + 'down: ' + t.filter((x) => x.down).map((x) => x.lane).join(' ') + '\n'
    + 'standing: ' + (t.filter((x) => !x.down).map((x) => x.lane).join(' ') || 'none') + '\n'
    + 'keeper alive: ' + game.debug.keeperAlive() + '\nmode: ' + game.mode;
}

// Handle for automated tests and debugging in the console.
/** @type {any} */ (window).SC3D = { game, settings: () => settings };
