// @ts-check
// 3D models (glTF binary). The files live in models/ and are CC0; see models/CREDITS.md.
// URLs are built with import.meta.url, so they resolve next to the source when it runs
// without a build, and Vite copies and fingerprints them in a production build.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

/** @type {Record<string, string>} */
const URLS = {
  keeper: new URL('../models/keeper.glb', import.meta.url).href,
  suit: new URL('../models/man-suit.glb', import.meta.url).href,
  rifle: new URL('../models/rifle.glb', import.meta.url).href
};

const loader = new GLTFLoader();
/** @type {Map<string, Promise<any>>} */
const cache = new Map();

/**
 * Loads a model once; later calls share the same promise. The claude.ai preview cannot serve
 * .glb files, so scripts/preview-page.mjs also writes each model as a base64 module
 * (models/<name>.glb.js); that copy is the fallback when the .glb itself is missing.
 */
export function loadModel(name) {
  if (!cache.has(name)) {
    const url = URLS[name];
    cache.set(name, loader.loadAsync(url).catch(async () => {
      const mod = await import(/* @vite-ignore */ url + '.js');
      const bytes = Uint8Array.from(atob(mod.default), (c) => c.charCodeAt(0));
      return loader.parseAsync(bytes.buffer, '');
    }));
  }
  return cache.get(name);
}

/**
 * The Quaternius materials are 40% metallic, which renders almost black without an
 * environment map. Our lighting is a sky and a low sun, so make them matte.
 */
function matte(obj) {
  obj.traverse((o) => {
    const mesh = /** @type {any} */ (o);
    if (!mesh.isMesh) return;
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (m && m.isMeshStandardMaterial) {
        m.metalness = 0;
        m.roughness = 0.85;
      }
    }
  });
}

/** Bounding box of an object in its current pose, skinned meshes included. */
export function measure(obj) {
  obj.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(obj, true);
}

/**
 * An animated person, scaled to `height` metres, feet at y = 0, centred on x and z, facing +z.
 * Clips are keyed by their short name ("Walk", "Idle", "Death", ...).
 * @param {string} name
 * @param {number} height
 */
export async function makePerson(name, height) {
  const gltf = await loadModel(name);
  const model = SkeletonUtils.clone(gltf.scene);
  matte(model);
  const size = measure(model).getSize(new THREE.Vector3());
  model.scale.multiplyScalar(height / size.y);
  const box = measure(model);
  model.position.x -= (box.min.x + box.max.x) / 2;
  model.position.y -= box.min.y;
  model.position.z -= (box.min.z + box.max.z) / 2;
  model.traverse((o) => {
    // Skinned meshes move away from their bind-pose bounds while animating.
    if (/** @type {any} */ (o).isMesh) o.frustumCulled = false;
  });
  /** @type {Record<string, THREE.AnimationClip>} */
  const clips = {};
  for (const clip of gltf.animations) clips[clip.name.split('|').pop()] = clip;
  return { model, mixer: new THREE.AnimationMixer(model), clips };
}

/**
 * A static prop scaled so its longest side is `length` metres, with that side along -z and
 * its centre at the origin.
 * @param {string} name
 * @param {number} length
 */
export async function makeProp(name, length) {
  const gltf = await loadModel(name);
  const model = gltf.scene.clone(true);
  matte(model);
  const size = measure(model).getSize(new THREE.Vector3());
  // Turn the longest axis to run along z.
  if (size.x >= size.y && size.x >= size.z) model.rotation.y = Math.PI / 2;
  else if (size.y >= size.x && size.y >= size.z) model.rotation.x = Math.PI / 2;
  const wrap = new THREE.Group();
  wrap.add(model);
  const longest = Math.max(size.x, size.y, size.z);
  wrap.scale.setScalar(length / longest);
  const box = measure(wrap);
  const center = box.getCenter(new THREE.Vector3());
  const holder = new THREE.Group();
  wrap.position.sub(center);
  holder.add(wrap);
  return holder;
}
