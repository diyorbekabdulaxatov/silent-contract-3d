// @ts-check
// The game: render loop, camera and scope, sway and breath, firing, bullet flight, hits and
// the mission's win and fail rules.
import * as THREE from 'three';
import { KESTREL, zeroAngle, shotAt, step, silhouetteHit, segmentBox, BODY, SOUND_SPEED } from './ballistics.js';
import { buildWorld } from './world.js';
import { PAPER, paintHole } from './textures.js';
import { drawScope, clearScope } from './scope.js';
import { makePerson, makeProp } from './models.js';

const BASE_FOV = 55;
const ZOOM_MIN = 3;
const ZOOM_MAX = 18;
const YAW_LIMIT = 1.05;
const PITCH_MIN = -0.42;
const PITCH_MAX = 0.32;
const SWAY = 0.0019;
/** Field of view that counts as 1x through the scope (roughly the eye's natural view). */
const SCOPE_REF_FOV = 28;
const SUBSTEP = 1 / 1000;
/** @type {Record<string, number>} */
const QUALITY_RATIO = { low: 1, medium: 1.5, high: 2 };

/** Vertical field of view through the scope at a given magnification. */
function scopeFov(zoom) {
  return (2 * Math.atan(Math.tan((SCOPE_REF_FOV * Math.PI) / 360) / zoom) * 180) / Math.PI;
}

/**
 * @param {{
 *   canvas: HTMLCanvasElement, scopeCanvas: HTMLCanvasElement,
 *   mission: typeof import('./mission.js').RANGE,
 *   hud: ReturnType<typeof import('./hud.js').createHud>,
 *   audio: ReturnType<typeof import('./audio.js').createAudio>,
 *   input: ReturnType<typeof import('./input.js').createInput>,
 *   settings: import('./settings.js').Settings,
 *   onEnd: (result: any) => void
 * }} opts
 */
export function createGame(opts) {
  const { canvas, scopeCanvas, mission, hud, audio, input, onEnd } = opts;
  let settings = opts.settings;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scopeCtx = scopeCanvas.getContext('2d');

  const world = buildWorld(mission);
  const camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.05, 4000);
  camera.rotation.order = 'YXZ';
  camera.position.set(mission.eye.x, mission.eye.y, mission.eye.z);
  world.scene.add(camera);
  const rifleModel = makeRifleModel();
  camera.add(rifleModel);

  // Swap in the 3D models once they load. The simple box versions stay if loading fails.
  makeProp('rifle', 1.15)
    .then((mesh) => {
      for (const child of rifleModel.children) child.visible = false;
      mesh.position.set(0, 0.04, -0.35);
      rifleModel.add(mesh);
    })
    .catch((err) => console.warn('Rifle model did not load; keeping the simple rifle.', err));
  makePerson('keeper', world.keeper.h)
    .then((p) => world.keeper.setModel(p))
    .catch((err) => console.warn('Keeper model did not load; keeping the simple figure.', err));

  const rifle = KESTREL;
  const zero = zeroAngle(rifle);
  const raycaster = new THREE.Raycaster();
  const center = new THREE.Vector2(0, 0);
  const tmpDir = new THREE.Vector3();
  const tmpRight = new THREE.Vector3();
  const tmpUp = new THREE.Vector3();
  /** Test hook: no sway, so automated shots land where they are aimed. */
  let steady = false;

  const view = { w: 1, h: 1, dpr: 1, ratio: 1 };
  const perf = { frames: 0, total: 0, checked: false, auto: 'high' };
  let s = freshState();
  let scopeDrawn = false;
  let rangeTimer = 0;
  let last = performance.now();

  function freshState() {
    return {
      mode: 'menu',
      time: 0,
      missionTime: 0,
      yaw: 0,
      pitch: -0.012,
      scoped: false,
      zoom: 8,
      fov: BASE_FOV,
      ammo: rifle.magazine,
      bolt: 0,
      reload: 0,
      recoil: 0,
      breath: 1,
      holding: false,
      tired: 0,
      swayMul: 1,
      swayT: Math.random() * 100,
      wind: mission.wind.base,
      shots: 0,
      hits: 0,
      heads: 0,
      down: 0,
      longest: 0,
      bullets: [],
      radioIndex: 0,
      endTimer: -1,
      result: null
    };
  }

  // ---------- sizing and quality ----------

  function applyQuality() {
    const q = settings.quality === 'auto' ? (perf.checked ? perf.auto : 'high') : settings.quality;
    const cap = QUALITY_RATIO[q] || 1.5;
    view.ratio = Math.min(window.devicePixelRatio || 1, cap);
    renderer.setPixelRatio(view.ratio);
    renderer.setSize(view.w, view.h, false);
  }

  function resize() {
    view.w = Math.max(1, window.innerWidth);
    view.h = Math.max(1, window.innerHeight);
    view.dpr = Math.min(window.devicePixelRatio || 1, 2);
    applyQuality();
    camera.aspect = view.w / view.h;
    camera.updateProjectionMatrix();
    scopeCanvas.width = Math.round(view.w * view.dpr);
    scopeCanvas.height = Math.round(view.h * view.dpr);
    scopeDrawn = false;
  }

  /** Auto quality: after a few seconds of play, step down if frames are slow. */
  function measure(dt) {
    if (settings.quality !== 'auto' || perf.checked || s.mode !== 'playing') return;
    perf.frames++;
    perf.total += dt;
    if (perf.frames < 180) return;
    const avg = perf.total / perf.frames;
    perf.checked = true;
    perf.auto = avg > 1 / 40 ? 'low' : avg > 1 / 52 ? 'medium' : 'high';
    applyQuality();
  }

  // ---------- actions ----------

  function canFire() {
    return s.mode === 'playing' && s.reload <= 0 && s.bolt <= 0 && s.ammo > 0;
  }

  function fire() {
    if (s.mode !== 'playing') return;
    if (s.reload > 0 || s.bolt > 0) return;
    if (s.ammo <= 0) {
      startReload();
      return;
    }
    camera.updateMatrixWorld();
    camera.getWorldDirection(tmpDir);
    tmpRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
    tmpDir.applyAxisAngle(tmpRight, zero);
    // The bore sits a few centimetres under the scope.
    tmpUp.set(0, 1, 0).applyQuaternion(camera.quaternion).multiplyScalar(rifle.sightHeight);
    s.bullets.push({
      x: camera.position.x - tmpUp.x, y: camera.position.y - tmpUp.y, z: camera.position.z - tmpUp.z,
      vx: tmpDir.x * rifle.velocity, vy: tmpDir.y * rifle.velocity, vz: tmpDir.z * rifle.velocity,
      t: 0, drag: rifle.drag
    });
    s.ammo--;
    s.shots++;
    s.bolt = rifle.boltTime;
    s.recoil += s.scoped ? 0.028 : 0.05;
    audio.shot();
    audio.bolt(0.45);
    vibrate(28);
  }

  function startReload() {
    if (s.mode !== 'playing' || s.reload > 0 || s.ammo === rifle.magazine) return;
    s.reload = rifle.reloadTime;
    audio.reload();
  }

  function toggleScope() {
    if (s.mode !== 'playing') return;
    s.scoped = !s.scoped;
    if (!s.scoped && s.holding) setBreath(false);
  }

  function setZoom(z) {
    s.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
  }

  /** @param {boolean} on */
  function setBreath(on) {
    if (s.mode !== 'playing') return;
    if (on && (!s.scoped || s.tired > 0 || s.breath < 0.05 || s.holding)) return;
    if (!on && !s.holding) return;
    s.holding = on;
    audio.breath(on);
  }

  // ---------- simulation ----------

  function update(dt) {
    s.time += dt;
    s.wind = mission.wind.base
      + Math.sin(s.time * 0.13) * mission.wind.gust * 0.6
      + Math.sin(s.time * 0.37 + 1) * mission.wind.gust * 0.4;

    if (s.mode === 'menu') {
      s.yaw = Math.sin(s.time * 0.05) * 0.22;
      s.pitch = -0.02 + Math.sin(s.time * 0.07) * 0.01;
      s.scoped = false;
      s.fov = BASE_FOV;
      aimCamera(0, 0);
      world.update(dt, s.time, s.wind);
      return;
    }
    if (s.mode === 'paused') return;

    if (s.mode === 'playing') s.missionTime += dt;
    hud.tick(dt);

    // Look: drag scales with the field of view so aiming feels the same at every zoom.
    const look = input.consumeLook();
    const gyro = input.consumeGyro();
    if (s.mode === 'playing') {
      const k = settings.sensitivity * 0.0032 * (s.fov / BASE_FOV);
      s.yaw -= look.dx * k;
      s.pitch -= look.dy * k;
      if (settings.gyro === 'always' || (settings.gyro === 'scope' && s.scoped)) {
        s.yaw += gyro.yaw;
        s.pitch += gyro.pitch;
      }
      s.yaw = Math.max(-YAW_LIMIT, Math.min(YAW_LIMIT, s.yaw));
      s.pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, s.pitch));
    }

    // Field of view eases to the scope's magnification.
    const targetFov = s.scoped ? scopeFov(s.zoom) : BASE_FOV;
    s.fov += (targetFov - s.fov) * Math.min(1, dt * 16);
    if (Math.abs(targetFov - s.fov) < 0.01) s.fov = targetFov;

    // Breath: holding steadies the rifle for five seconds, then the shooter runs out of air.
    if (s.holding) {
      s.breath -= dt / 5;
      if (s.breath <= 0) {
        s.breath = 0;
        s.holding = false;
        s.tired = 2.5;
        audio.breath(false);
      }
    } else {
      s.breath = Math.min(1, s.breath + dt / 3.5);
      if (s.tired > 0) s.tired -= dt;
    }
    const swayTarget = steady ? 0 : rifle.swayMul * (s.holding ? 0.12 : s.tired > 0 ? 2 : 1) * (s.scoped ? 1 : 0.25);
    s.swayMul += (swayTarget - s.swayMul) * Math.min(1, dt * 4);
    s.swayT += dt;
    const swayYaw = SWAY * s.swayMul * (Math.sin(s.swayT * 0.71) * 0.6 + Math.sin(s.swayT * 1.37 + 0.5) * 0.4);
    const swayPitch = SWAY * s.swayMul * (Math.sin(s.swayT * 0.93 + 1.7) * 0.55 + Math.sin(s.swayT * 1.71) * 0.45);
    s.recoil *= Math.exp(-dt * 7);
    aimCamera(swayYaw, swayPitch);

    // Bolt and magazine.
    if (s.bolt > 0) s.bolt -= dt;
    if (s.reload > 0) {
      s.reload -= dt;
      if (s.reload <= 0) {
        s.reload = 0;
        s.ammo = rifle.magazine;
      }
    } else if (s.ammo === 0 && s.bolt <= 0 && s.mode === 'playing') {
      startReload();
    }

    flyBullets(dt);
    world.update(dt, s.time, s.wind);

    // Radio lines on the mission clock.
    while (s.radioIndex < mission.radio.length && s.missionTime >= mission.radio[s.radioIndex].at) {
      hud.say(mission.radio[s.radioIndex].text);
      s.radioIndex++;
    }

    // Rangefinder, ten times a second.
    rangeTimer -= dt;
    if (rangeTimer <= 0) {
      rangeTimer = 0.1;
      raycaster.setFromCamera(center, camera);
      const hits = raycaster.intersectObjects(world.rangeMeshes, false);
      hud.range(hits.length ? hits[0].distance : null);
    }

    hud.targets(s.down, world.targets.length);
    hud.wind(s.wind);
    hud.ammo(s.ammo, rifle.magazine, s.reload > 0 ? 'RELOADING' : s.bolt > 0 ? 'BOLT' : s.ammo === 0 ? 'EMPTY' : 'READY');
    hud.breath(s.breath, s.holding, s.tired > 0);
    hud.scoped(s.scoped, s.zoom);
    hud.fireReady(canFire());

    if (s.endTimer > 0) {
      s.endTimer -= dt;
      if (s.endTimer <= 0) finish();
    }
  }

  function aimCamera(swayYaw, swayPitch) {
    camera.rotation.set(s.pitch + swayPitch + s.recoil, s.yaw + swayYaw, 0);
    if (Math.abs(camera.fov - s.fov) > 1e-4) {
      camera.fov = s.fov;
      camera.updateProjectionMatrix();
    }
    rifleModel.visible = s.fov > BASE_FOV * 0.8;
    rifleModel.position.z = -0.42 + s.recoil * 1.2;
    rifleModel.rotation.x = s.recoil * 2.5;
  }

  function flyBullets(dt) {
    const wind = { x: s.wind, z: 0 };
    for (let i = s.bullets.length - 1; i >= 0; i--) {
      const b = s.bullets[i];
      let remaining = dt;
      let done = false;
      while (remaining > 1e-6 && !done) {
        const h = Math.min(SUBSTEP, remaining);
        remaining -= h;
        const a = { x: b.x, y: b.y, z: b.z };
        step(b, h, wind);
        const hit = collide(a, b);
        if (hit) {
          resolveHit(hit, b);
          done = true;
        } else if (b.t > 3 || b.y < -2) {
          done = true;
        }
      }
      if (settings.trail) {
        const back = 0.035;
        world.trail.set({ x: b.x - b.vx * back, y: b.y - b.vy * back, z: b.z - b.vz * back }, b);
      }
      if (done) s.bullets.splice(i, 1);
    }
  }

  /** Earliest thing the segment a-b meets, or null. */
  function collide(a, b) {
    /** @type {any} */
    let best = null;
    const consider = (hit) => {
      if (hit && (!best || hit.t < best.t)) best = hit;
    };
    if (b.y <= 0 && a.y > 0) {
      consider({ t: a.y / (a.y - b.y), kind: 'earth' });
    }
    for (const box of world.colliders) {
      const t = segmentBox(a, b, box);
      if (t !== null) consider({ t, kind: 'earth' });
    }
    for (const target of world.targets) {
      if (target.down) continue;
      if (!(a.z > target.z && b.z <= target.z)) continue;
      const f = (a.z - target.z) / (a.z - b.z);
      const lx = a.x + (b.x - a.x) * f - target.x;
      const ly = a.y + (b.y - a.y) * f - target.footY;
      if (Math.abs(lx) <= PAPER.W / 2 && ly >= -PAPER.FOOT && ly <= PAPER.H - PAPER.FOOT) {
        consider({ t: f, kind: 'paper', target, lx, ly });
      }
    }
    const k = world.keeper.hitTest(a, b);
    if (k) consider({ t: k.t, kind: 'person', part: k.part });
    if (best) {
      best.x = a.x + (b.x - a.x) * best.t;
      best.y = a.y + (b.y - a.y) * best.t;
      best.z = a.z + (b.z - a.z) * best.t;
    }
    return best;
  }

  function resolveHit(hit, b) {
    const dist = Math.hypot(hit.x - mission.eye.x, hit.z - mission.eye.z);
    const delay = dist / SOUND_SPEED;
    const time = b.t.toFixed(2) + ' s';
    if (hit.kind === 'paper') {
      const target = hit.target;
      paintHole(target.paper, hit.lx, hit.ly);
      const zone = silhouetteHit(hit.lx, hit.ly, BODY.HEIGHT, BODY.HEAD_LENIENCY);
      audio.impact(delay, 'paper', dist);
      world.effects.puff(hit, '#e9e3d6', 0.6);
      if (zone && s.result === null) {
        target.down = true;
        s.down++;
        s.hits++;
        if (zone === 'head') s.heads++;
        s.longest = Math.max(s.longest, dist);
        hud.flash((zone === 'head' ? 'Head' : 'Hit') + ' · lane ' + target.lane + ' · ' + Math.round(dist) + ' m · ' + time, 'good');
        if (s.down === world.targets.length) {
          s.result = 'win';
          s.endTimer = 1.6;
        }
      } else if (s.result === null) {
        hud.flash('Paper only · lane ' + target.lane + ' · ' + Math.round(dist) + ' m', 'plain');
      }
    } else if (hit.kind === 'person') {
      world.keeper.fall();
      audio.impact(delay, 'person', dist);
      world.effects.puff(hit, '#7a2a2a', 0.5);
      hud.flash('You shot ' + world.keeper.name + '.', 'bad');
      if (s.result === null) {
        s.result = 'keeper';
        s.endTimer = 1.8;
      }
    } else {
      audio.impact(delay, 'earth', dist);
      world.effects.puff(hit, '#8a7a66', Math.min(2.4, 0.7 + dist / 250));
      if (s.result === null) hud.flash('Miss · ' + Math.round(dist) + ' m', 'plain');
    }
  }

  function finish() {
    s.mode = 'over';
    s.scoped = false;
    s.holding = false;
    onEnd({
      result: s.result,
      time: s.missionTime,
      shots: s.shots,
      hits: s.hits,
      heads: s.heads,
      down: s.down,
      total: world.targets.length,
      longest: s.longest
    });
  }

  // ---------- rendering ----------

  function render() {
    renderer.render(world.scene, camera);
    const showScope = s.scoped && s.fov < BASE_FOV * 0.8 && s.mode !== 'menu';
    if (showScope) {
      drawScope(scopeCtx, view.w, view.h, view.dpr, s.fov);
      scopeDrawn = true;
    } else if (scopeDrawn) {
      clearScope(scopeCtx, view.w, view.h, view.dpr);
      scopeDrawn = false;
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    try {
      update(dt);
      measure(dt);
      render();
    } catch (err) {
      console.error(err);
    }
  }

  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(frame);

  return {
    start() {
      world.reset();
      s = freshState();
      s.mode = 'playing';
      hud.reset();
      input.consumeLook();
      input.consumeGyro();
      input.setGyro(settings.gyro !== 'off');
      audio.startAmbient();
    },
    pause() {
      if (s.mode !== 'playing') return false;
      s.mode = 'paused';
      s.holding = false;
      return true;
    },
    resume() {
      if (s.mode !== 'paused') return;
      s.mode = 'playing';
      input.consumeLook();
      last = performance.now();
    },
    toMenu() {
      world.reset();
      s = freshState();
    },
    get mode() {
      return s.mode;
    },
    /** @param {import('./settings.js').Settings} next */
    applySettings(next) {
      settings = next;
      audio.setEnabled(next.sound);
      input.setGyro(next.gyro !== 'off');
      perf.checked = false;
      perf.frames = 0;
      perf.total = 0;
      applyQuality();
    },
    fire,
    reload: startReload,
    toggleScope,
    setBreath,
    setZoom,
    zoomStep(steps) {
      setZoom(s.zoom * Math.pow(1.15, steps));
    },
    /** Test hooks for automated runs. */
    debug: {
      state: () => s,
      win() {
        for (const t of world.targets) t.down = true;
        s.down = world.targets.length;
        s.result = 'win';
        finish();
      },
      canFire,
      /** @param {boolean} on */
      steady(on) {
        steady = on;
        if (on) s.swayMul = 0;
      },
      aimAt(x, y, z) {
        const dx = x - camera.position.x;
        const dy = y - camera.position.y;
        const dz = z - camera.position.z;
        s.yaw = Math.atan2(-dx, -dz);
        s.pitch = Math.atan2(dy, Math.hypot(dx, dz));
        s.recoil = 0;
      },
      /** Aims at a target's chest with the right holdover for its range and the current wind. */
      solve(i) {
        const t = world.targets[i];
        const dist = Math.hypot(t.x - camera.position.x, t.z - camera.position.z);
        const shot = shotAt(rifle, zero, dist, s.wind);
        this.aimAt(t.x - shot.drift, t.footY + 0.7 * BODY.HEIGHT + shot.drop, t.z);
      },
      lookAtKeeper() {
        const g = world.keeper.group.position;
        this.aimAt(g.x, 1.1, g.z);
      },
      targets: () => world.targets.map((t) => ({ lane: t.lane, dist: t.dist, down: t.down })),
      keeperAlive: () => world.keeper.alive
    }
  };
}

/** A simple bolt rifle seen from the shooter's eye when not scoped. */
function makeRifleModel() {
  const g = new THREE.Group();
  const walnut = new THREE.MeshLambertMaterial({ color: '#3b2a1e' });
  const steel = new THREE.MeshLambertMaterial({ color: '#15181c' });
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.08, 0.5), walnut);
  stock.position.set(0, -0.02, 0.05);
  g.add(stock);
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.24), steel);
  receiver.position.set(0, 0.035, -0.12);
  g.add(receiver);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.012, 0.7, 10), steel);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.04, -0.58);
  g.add(barrel);
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.3, 14), steel);
  tube.rotation.x = Math.PI / 2;
  tube.position.set(0, 0.088, -0.12);
  g.add(tube);
  const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.02, 0.08, 14), steel);
  bell.rotation.x = Math.PI / 2;
  bell.position.set(0, 0.088, -0.3);
  g.add(bell);
  const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.07, 6), steel);
  bolt.rotation.z = Math.PI / 2;
  bolt.position.set(0.045, 0.03, -0.05);
  g.add(bolt);
  g.scale.setScalar(0.8);
  g.position.set(0.17, -0.19, -0.42);
  g.rotation.y = 0.03;
  return g;
}

function vibrate(ms) {
  try {
    if (navigator.vibrate) navigator.vibrate(ms);
  } catch (err) {
    /* not supported */
  }
}
