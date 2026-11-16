// @ts-check
// Builds the 3D range: sky, ground, berms, paper targets, boards, flags, the keeper and his
// hut, trees and the distant city. Everything is procedural; there are no model files yet.
import * as THREE from 'three';
import { BODY, personHit } from './ballistics.js';
import {
  grassTexture, earthTexture, paperTarget, boardTexture, puffTexture, windowsTexture, rng, PAPER
} from './textures.js';

export const COLORS = {
  mist: '#8f9aa1',
  skyTop: '#25303c',
  sunGlow: '#e8a06a',
  sun: '#f2c08c',
  hemiSky: '#b4c0cb',
  hemiGround: '#3b3329',
  grass: '#4a5238',
  lane: '#5d6646',
  frost: '#c9d3dc',
  wood: '#4a3a2c',
  woodDark: '#2c231b',
  metal: '#1c2025',
  tree: '#1b231e',
  flag: '#9c2b2b',
  coat: '#5a4030',
  trousers: '#2a2d31',
  skin: '#b48c74',
  sodium: '#e8a33d'
};

/** Height of the bottom edge of each paper sheet above the ground. */
const PAPER_BASE = 0.25;

/**
 * @param {typeof import('./mission.js').RANGE} mission
 */
export function buildWorld(mission) {
  const scene = new THREE.Scene();
  const mist = new THREE.Color(COLORS.mist);
  scene.background = mist;
  scene.fog = new THREE.FogExp2(mist, 0.0016);

  /** Solid boxes for bullets: [minX, minY, minZ, maxX, maxY, maxZ]. */
  const colliders = [];
  /** Meshes the rangefinder can measure to. */
  const rangeMeshes = [];

  addSky(scene);

  const hemi = new THREE.HemisphereLight(COLORS.hemiSky, COLORS.hemiGround, 2.1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(COLORS.sun, 2.6);
  sun.position.set(300, 40, -260);
  scene.add(sun);

  // Ground and the mowed range strip.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(3000, 3000),
    new THREE.MeshLambertMaterial({ map: grassTexture(COLORS.grass, COLORS.frost, 11) })
  );
  ground.material.map.repeat.set(400, 400);
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  rangeMeshes.push(ground);

  const lane = new THREE.Mesh(
    new THREE.PlaneGeometry(96, 445),
    new THREE.MeshLambertMaterial({
      map: grassTexture(COLORS.lane, COLORS.frost, 12),
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2
    })
  );
  lane.material.map.repeat.set(14, 64);
  lane.rotation.x = -Math.PI / 2;
  lane.position.set(0, 0.01, -222);
  scene.add(lane);
  rangeMeshes.push(lane);

  // Earth berms: the backstop and the two side walls.
  const earth = new THREE.MeshLambertMaterial({ map: earthTexture(5) });
  earth.map.repeat.set(20, 2);
  addBox(scene, earth, [0, 4.5, -446], [170, 9, 14], colliders, rangeMeshes);
  const sideEarth = earth.clone();
  sideEarth.map = earth.map.clone();
  sideEarth.map.repeat.set(1, 40);
  addBox(scene, sideEarth, [-53, 1.75, -232], [8, 3.5, 420], colliders, rangeMeshes);
  addBox(scene, sideEarth, [55, 1.75, -232], [8, 3.5, 420], colliders, rangeMeshes);

  const wood = new THREE.MeshLambertMaterial({ color: COLORS.wood });
  const woodDark = new THREE.MeshLambertMaterial({ color: COLORS.woodDark });

  const targets = mission.targets.map((def) => addPaperTarget(scene, def, woodDark, rangeMeshes));

  for (const d of mission.boards) addBoard(scene, mission.boardX, d, woodDark, rangeMeshes);

  const flags = [];
  for (const [x, z] of [[-27, -100], [29, -200], [-27, -300], [29, -400]]) {
    flags.push(addFlag(scene, x, z, woodDark));
  }

  addShelter(scene, wood, woodDark);
  addHut(scene, mission.keeper.hut, woodDark, colliders, rangeMeshes);
  const keeper = makeKeeper(scene, mission.keeper);
  addTrees(scene);
  addCity(scene);

  const mistSprites = addMist(scene);
  const effects = makeEffects(scene);

  const trail = makeTrail(scene);

  /**
   * Per-frame animation.
   * @param {number} dt
   * @param {number} time
   * @param {number} wind crosswind in m/s, positive blows right
   */
  function update(dt, time, wind) {
    for (let i = 0; i < flags.length; i++) animateFlag(flags[i], time, wind, i);
    keeper.update(dt);
    for (const t of targets) {
      if (t.down && t.fall < 1) {
        t.fall = Math.min(1, t.fall + dt * 3.2);
        const e = 1 - Math.pow(1 - t.fall, 3);
        t.pivot.rotation.x = -Math.PI * 0.47 * e;
      }
    }
    for (let i = 0; i < mistSprites.length; i++) {
      const s = mistSprites[i];
      s.position.x = s.userData.x0 + Math.sin(time * 0.02 + i) * 15;
    }
    effects.update(dt);
    trail.update(dt);
  }

  /** Stands every target back up with fresh paper and sends the keeper back to his hut. */
  function reset() {
    for (const t of targets) {
      t.down = false;
      t.fall = 0;
      t.pivot.rotation.x = 0;
      const old = t.paper.texture;
      t.paper = paperTarget(t.lane);
      t.sheet.material.map = t.paper.texture;
      t.sheet.material.needsUpdate = true;
      old.dispose();
    }
    keeper.reset();
  }

  return { scene, targets, keeper, colliders, rangeMeshes, effects, trail, update, reset };
}

function addSky(scene) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(COLORS.skyTop) },
      horizon: { value: new THREE.Color(COLORS.mist) },
      glow: { value: new THREE.Color(COLORS.sunGlow) },
      sunDir: { value: new THREE.Vector3(0.75, 0.06, -0.65).normalize() }
    },
    vertexShader: [
      'varying vec3 vDir;',
      'void main() {',
      '  vDir = normalize(position);',
      '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
      '}'
    ].join('\n'),
    fragmentShader: [
      'uniform vec3 top;',
      'uniform vec3 horizon;',
      'uniform vec3 glow;',
      'uniform vec3 sunDir;',
      'varying vec3 vDir;',
      'void main() {',
      '  vec3 d = normalize(vDir);',
      '  float h = clamp(d.y, 0.0, 1.0);',
      '  vec3 c = mix(horizon, top, pow(h, 0.5));',
      '  float s = max(dot(d, sunDir), 0.0);',
      '  c += glow * pow(s, 6.0) * 0.5 * (1.0 - h);',
      '  c += glow * pow(s, 400.0) * 0.8;',
      '  gl_FragColor = vec4(c, 1.0);',
      '  #include <colorspace_fragment>',
      '}'
    ].join('\n')
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(2800, 32, 16), mat);
  sky.renderOrder = -1;
  scene.add(sky);
}

function addBox(scene, material, pos, size, colliders, rangeMeshes) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), material);
  mesh.position.set(pos[0], pos[1], pos[2]);
  scene.add(mesh);
  if (colliders) {
    colliders.push([
      pos[0] - size[0] / 2, pos[1] - size[1] / 2, pos[2] - size[2] / 2,
      pos[0] + size[0] / 2, pos[1] + size[1] / 2, pos[2] + size[2] / 2
    ]);
  }
  if (rangeMeshes) rangeMeshes.push(mesh);
  return mesh;
}

/**
 * @param {import('./mission.js').PaperTargetDef} def
 */
function addPaperTarget(scene, def, frameMat, rangeMeshes) {
  const group = new THREE.Group();
  group.position.set(def.x, 0, -def.dist);
  scene.add(group);

  // Two posts and a crossbar behind the paper.
  const postGeo = new THREE.BoxGeometry(0.07, PAPER_BASE + PAPER.H + 0.05, 0.07);
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(postGeo, frameMat);
    post.position.set(side * (PAPER.W / 2 + 0.06), (PAPER_BASE + PAPER.H + 0.05) / 2, -0.12);
    group.add(post);
  }
  const bar = new THREE.Mesh(new THREE.BoxGeometry(PAPER.W + 0.2, 0.07, 0.07), frameMat);
  bar.position.set(0, PAPER_BASE - 0.04, -0.12);
  group.add(bar);

  const paper = paperTarget(def.lane);
  const geo = new THREE.PlaneGeometry(PAPER.W, PAPER.H);
  geo.translate(0, PAPER.H / 2, 0);
  const sheet = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: paper.texture, side: THREE.DoubleSide }));
  const pivot = new THREE.Group();
  pivot.position.y = PAPER_BASE;
  pivot.add(sheet);
  group.add(pivot);
  rangeMeshes.push(sheet);

  return {
    lane: def.lane,
    dist: def.dist,
    x: def.x,
    z: -def.dist,
    /** Height of the silhouette's feet above the ground. */
    footY: PAPER_BASE + PAPER.FOOT,
    paper,
    sheet,
    pivot,
    down: false,
    fall: 0
  };
}

function addBoard(scene, x, dist, postMat, rangeMeshes) {
  const group = new THREE.Group();
  group.position.set(x, 0, -dist);
  group.rotation.y = Math.atan2(-x, dist);
  scene.add(group);
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 1.2),
    new THREE.MeshLambertMaterial({ map: boardTexture(dist + ' M') })
  );
  board.position.y = 2.1;
  group.add(board);
  rangeMeshes.push(board);
  const backing = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.3, 0.05), postMat);
  backing.position.set(0, 2.1, -0.04);
  group.add(backing);
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.6, 0.1), postMat);
    post.position.set(side * 0.9, 0.8, -0.06);
    group.add(post);
  }
}

function addFlag(scene, x, z, poleMat) {
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 5, 6), poleMat);
  pole.position.set(x, 2.5, z);
  scene.add(pole);
  const pivot = new THREE.Group();
  pivot.position.set(x, 4.9, z);
  scene.add(pivot);
  const geo = new THREE.PlaneGeometry(1.3, 0.75, 4, 1);
  geo.translate(0.65, -0.375, 0);
  const cloth = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: COLORS.flag, side: THREE.DoubleSide }));
  pivot.add(cloth);
  return { pivot, cloth, base: geo.attributes.position.array.slice(0) };
}

function animateFlag(flag, time, wind, i) {
  const strength = Math.min(1, Math.max(0.12, Math.abs(wind) / 4));
  const dir = wind >= 0 ? 0 : Math.PI;
  flag.pivot.rotation.y = dir + Math.sin(time * 2.1 + i) * 0.12 * strength + Math.PI * 0.08;
  flag.pivot.rotation.z = (wind >= 0 ? -1 : 1) * (1 - strength) * 1.1;
  // Ripple the cloth along its length.
  const pos = flag.cloth.geometry.attributes.position;
  const arr = pos.array;
  for (let v = 0; v < pos.count; v++) {
    const bx = flag.base[v * 3];
    arr[v * 3 + 2] = Math.sin(time * 7 * (0.5 + strength) - bx * 5 + i) * 0.08 * bx * strength;
  }
  pos.needsUpdate = true;
}

/** The covered firing point: a roof edge above the shooter and a bench in front. */
function addShelter(scene, wood, woodDark) {
  addBox(scene, woodDark, [0, 2.75, 1.2], [9, 0.12, 5], null, null);
  addBox(scene, wood, [0, 2.62, -1.25], [9, 0.18, 0.18], null, null);
  for (const x of [-4.3, 4.3]) addBox(scene, woodDark, [x, 1.3, -1.25], [0.16, 2.6, 0.16], null, null);
  addBox(scene, wood, [0, 0.86, -0.62], [1.5, 0.07, 0.9], null, null);
  for (const x of [-0.65, 0.65]) addBox(scene, woodDark, [x, 0.42, -0.62], [0.08, 0.84, 0.8], null, null);
  const bag = new THREE.MeshLambertMaterial({ color: '#5b5240' });
  addBox(scene, bag, [0, 0.95, -0.95], [0.36, 0.13, 0.2], null, null);
  // Firing line markers on the grass.
  const line = new THREE.MeshLambertMaterial({ color: '#c9c2b0' });
  addBox(scene, line, [0, 0.02, -1.6], [40, 0.03, 0.12], null, null);
}

function addHut(scene, hut, woodDark, colliders, rangeMeshes) {
  const wall = new THREE.MeshLambertMaterial({ color: '#3d3a36' });
  addBox(scene, wall, [hut.x + 2, 1.4, hut.z], [4, 2.8, 3.6], colliders, rangeMeshes);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(3.3, 1.3, 4), woodDark);
  roof.position.set(hut.x + 2, 3.45, hut.z);
  roof.rotation.y = Math.PI / 4;
  scene.add(roof);
  const lamp = new THREE.MeshBasicMaterial({ color: COLORS.sodium });
  const win = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.6), lamp);
  win.position.set(hut.x - 0.01, 1.7, hut.z - 0.6);
  win.rotation.y = -Math.PI / 2;
  scene.add(win);
  const door = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 2), woodDark);
  door.position.set(hut.x - 0.01, 1, hut.z + 0.9);
  door.rotation.y = -Math.PI / 2;
  scene.add(door);
  // Chimney.
  addBox(scene, wall, [hut.x + 3, 3.9, hut.z - 0.8], [0.4, 1.2, 0.4], null, null);
}

/**
 * The range keeper. Every part is drawn inside the body hit zones from ballistics.js.
 * @param {(typeof import('./mission.js').RANGE)['keeper']} def
 */
function makeKeeper(scene, def) {
  const h = BODY.HEIGHT * 0.98;
  const group = new THREE.Group();
  scene.add(group);
  const coat = new THREE.MeshLambertMaterial({ color: COLORS.coat });
  const trousers = new THREE.MeshLambertMaterial({ color: COLORS.trousers });
  const skin = new THREE.MeshLambertMaterial({ color: COLORS.skin });
  const cap = new THREE.MeshLambertMaterial({ color: '#2b2622' });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.24 * h, (BODY.TORSO_Y1 - BODY.TORSO_Y0 + 0.02) * h, 0.17 * h), coat);
  torso.position.y = ((BODY.TORSO_Y0 + BODY.TORSO_Y1) / 2 - 0.01) * h;
  group.add(torso);
  // Coat skirt over the hips.
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.21 * h, 0.1 * h, 0.15 * h), coat);
  skirt.position.y = (BODY.TORSO_Y0 - 0.03) * h;
  group.add(skirt);

  const head = new THREE.Mesh(new THREE.SphereGeometry(BODY.HEAD_R * h * 0.95, 12, 10), skin);
  head.position.y = BODY.HEAD_Y * h;
  group.add(head);
  const capMesh = new THREE.Mesh(new THREE.CylinderGeometry(BODY.HEAD_R * h * 0.9, BODY.HEAD_R * h * 0.95, 0.035 * h, 12), cap);
  capMesh.position.y = (BODY.HEAD_Y + 0.04) * h;
  group.add(capMesh);
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.05 * h, 0.04 * h, 0.05 * h), skin);
  neck.position.y = (BODY.TORSO_Y1 + 0.015) * h;
  group.add(neck);

  const legs = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.05 * h, BODY.TORSO_Y0 * h, 0);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.085 * h, BODY.TORSO_Y0 * h, 0.09 * h), trousers);
    leg.position.y = -BODY.TORSO_Y0 * h / 2;
    hip.add(leg);
    group.add(hip);
    legs.push(hip);
  }
  const arms = [];
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.13 * h, (BODY.TORSO_Y1 - 0.03) * h, 0);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.04 * h, 0.34 * h, 0.06 * h), coat);
    arm.position.y = -0.17 * h;
    shoulder.add(arm);
    group.add(shoulder);
    arms.push(shoulder);
  }

  const path = def.path;
  const state = {
    group,
    h,
    name: def.name,
    alive: true,
    leg: 0,
    target: 1,
    dir: 1,
    wait: def.pause,
    /** @param {number} dt */
    update(dt) {
      if (!state.alive) return;
      if (state.wait > 0) {
        state.wait -= dt;
        pose(0);
        return;
      }
      const goal = path[state.target];
      const dx = goal.x - group.position.x;
      const dz = goal.z - group.position.z;
      const d = Math.hypot(dx, dz);
      const stepLen = def.speed * dt;
      if (d <= stepLen) {
        group.position.x = goal.x;
        group.position.z = goal.z;
        if (state.target === path.length - 1) state.dir = -1;
        else if (state.target === 0) state.dir = 1;
        if (state.target === path.length - 1 || state.target === 0) state.wait = def.pause;
        state.target += state.dir;
      } else {
        group.position.x += (dx / d) * stepLen;
        group.position.z += (dz / d) * stepLen;
        group.rotation.y = Math.atan2(dx, dz);
        state.leg += dt * def.speed * 3.2;
        pose(Math.sin(state.leg));
      }
    },
    /**
     * Segment test in world space.
     * @param {{x:number,y:number,z:number}} a
     * @param {{x:number,y:number,z:number}} b
     */
    hitTest(a, b) {
      if (!state.alive) return null;
      const c = Math.cos(-group.rotation.y);
      const s = Math.sin(-group.rotation.y);
      const local = (p) => {
        const x = p.x - group.position.x;
        const z = p.z - group.position.z;
        return { x: x * c + z * s, y: p.y - group.position.y, z: -x * s + z * c };
      };
      return personHit(local(a), local(b), h);
    },
    fall() {
      state.alive = false;
      group.rotation.x = -Math.PI / 2;
      group.position.y = 0.12 * h;
    },
    reset() {
      state.alive = true;
      state.target = 1;
      state.dir = 1;
      state.wait = def.pause;
      state.leg = 0;
      group.rotation.set(0, 0, 0);
      group.position.set(path[0].x, 0, path[0].z);
      pose(0);
    }
  };

  function pose(s) {
    legs[0].rotation.x = s * 0.2;
    legs[1].rotation.x = -s * 0.2;
    arms[0].rotation.x = -s * 0.25;
    arms[1].rotation.x = s * 0.25;
  }

  group.position.set(path[0].x, 0, path[0].z);
  return state;
}

function addTrees(scene) {
  const r = rng(77);
  const count = 280;
  const mesh = new THREE.InstancedMesh(
    new THREE.ConeGeometry(2.2, 9, 6),
    new THREE.MeshLambertMaterial({ color: COLORS.tree }),
    count
  );
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    let x, z;
    if (i < 150) {
      x = -320 + r() * 640;
      z = -468 - r() * 220;
    } else {
      const side = i % 2 ? 1 : -1;
      x = side * (68 + r() * 110);
      z = 20 - r() * 470;
    }
    const k = 0.7 + r() * 0.9;
    s.set(k, k * (0.8 + r() * 0.5), k);
    p.set(x, 4.5 * s.y, z);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
  }
  scene.add(mesh);
}

/** Port Varenne on the horizon, unaffected by fog so it reads as a skyline. */
function addCity(scene) {
  const r = rng(9);
  const mat = new THREE.MeshBasicMaterial({ map: windowsTexture(3), color: '#46505a', fog: false });
  const geo = new THREE.BoxGeometry(1, 1, 1);
  for (let i = 0; i < 30; i++) {
    const w = 40 + r() * 60;
    const h = 30 + r() * 120;
    const b = new THREE.Mesh(geo, mat);
    b.scale.set(w, h, 40);
    b.position.set(-1100 + i * 75 + r() * 30, h / 2 - 10, -2000 - r() * 300);
    scene.add(b);
  }
}

function addMist(scene) {
  const tex = puffTexture();
  const sprites = [];
  const r = rng(31);
  for (let i = 0; i < 16; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: '#c4ccd2', transparent: true, opacity: 0.16, depthWrite: false }));
    const x = -60 + r() * 120;
    s.position.set(x, 2 + r() * 2, -50 - r() * 380);
    s.scale.set(50 + r() * 40, 7 + r() * 5, 1);
    s.userData.x0 = x;
    scene.add(s);
    sprites.push(s);
  }
  return sprites;
}

/** Short-lived dust and paper puffs at impact points. */
function makeEffects(scene) {
  const tex = puffTexture();
  const live = [];
  return {
    /**
     * @param {THREE.Vector3 | {x:number,y:number,z:number}} p
     * @param {string} color
     * @param {number} size
     */
    puff(p, color, size) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, opacity: 0.8, depthWrite: false }));
      s.position.set(p.x, p.y, p.z);
      s.userData.age = 0;
      s.userData.size = size;
      s.scale.setScalar(size * 0.2);
      scene.add(s);
      live.push(s);
    },
    /** @param {number} dt */
    update(dt) {
      for (let i = live.length - 1; i >= 0; i--) {
        const s = live[i];
        s.userData.age += dt;
        const a = s.userData.age / 1.1;
        if (a >= 1) {
          scene.remove(s);
          s.material.dispose();
          live.splice(i, 1);
          continue;
        }
        s.scale.setScalar(s.userData.size * (0.2 + a));
        s.position.y += dt * 0.4;
        s.material.opacity = 0.8 * (1 - a);
      }
    }
  };
}

/** A faint vapour trail behind the bullet, so players can read the arc while they learn. */
function makeTrail(scene) {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(2 * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.LineBasicMaterial({ color: '#e9e3d6', transparent: true, opacity: 0 });
  const line = new THREE.Line(geo, mat);
  line.frustumCulled = false;
  scene.add(line);
  let fade = 0;
  return {
    /**
     * @param {{x:number,y:number,z:number}} tail
     * @param {{x:number,y:number,z:number}} head
     */
    set(tail, head) {
      positions[0] = tail.x; positions[1] = tail.y; positions[2] = tail.z;
      positions[3] = head.x; positions[4] = head.y; positions[5] = head.z;
      geo.attributes.position.needsUpdate = true;
      mat.opacity = 0.45;
      fade = 0.5;
    },
    /** @param {number} dt */
    update(dt) {
      if (fade > 0) {
        fade -= dt;
        mat.opacity = Math.max(0, 0.45 * (fade / 0.5));
      }
    }
  };
}
