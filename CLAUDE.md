# Silent Contract 3D: notes for Claude

A 3D remake of the 2D noir sniper game *Silent Contract* (repo `secret-contract`). Three.js, plain JavaScript modules type-checked by TypeScript, Android first through Capacitor (planned). Main test phone: Samsung Galaxy S24, landscape. The current milestone is a prototype of one mission, `range` ("Cold Range").

## The user's constraints

- **Don't use the user's computer for heavy work.** Light file edits, git and `node` one-liners are fine. Don't run `npm install`, Vite, dev servers, browsers or Gradle on the Mac. Builds and tests run in GitHub Actions. Previews go to a private claude.ai artifact that the user opens on their phone. Ask before anything heavier.
- The user decides; discuss before large changes. They asked for common best practices where they didn't choose.

## Layout

- `index.html`: the whole page (styles, HUD, menus). It is a full document for Vite. Its import map points `three` at a pinned jsDelivr build, so the source runs in a browser without a build step.
- `src/ballistics.js`: pure physics and hit geometry, no three.js, unit-tested with `node --test`. Drag, gravity, wind, zeroing, `silhouetteHit`, `personHit`, segment tests.
- `src/mission.js`: mission data (targets, boards, keeper path, radio lines).
- `src/world.js`: builds the scene procedurally (no model files). It also holds the keeper's walk and hit test.
- `src/textures.js`: canvas textures (grass, earth, paper targets with bullet holes, boards).
- `src/game.js`: loop, camera, scope, sway and breath, firing, bullet flight, hits, win and fail. `game.debug` has test hooks.
- `src/scope.js`: scope mask and mil reticle. `src/hud.js`: DOM HUD. `src/input.js`: touch, mouse, keys and gyro. `src/audio.js`: synthesized sound. `src/settings.js`: localStorage, guarded. `src/main.js`: screens and wiring.

## Rules

- Units are metres, seconds and radians. Axes: x right, y up, z toward the shooter, so downrange is `-z`.
- People and paper silhouettes must be drawn inside the hit zones in `BODY` (`src/ballistics.js`). These match the 2D game's `LW.bodyGeom`: head circle at `0.935 h` with radius `0.066 h`.
- Every `src/*.js` file starts with `// @ts-check`. Write JSDoc types where inference fails.
- Keep `three` in `package.json` and the import map in `index.html` on the same version; `npm run check` enforces this.
- Draw code must not throw: the frame loop catches errors, but keep it defensive.

## Commands (run in CI, not on the user's Mac)

- `npm run check`: project checks. `npm run typecheck`: `tsc` over `src/`. `npm test`: ballistics unit tests. `npm run build`: Vite build to `dist/`, with three bundled and the import map removed.
- `node scripts/preview-page.mjs <dir>`: writes the artifact preview (the page as a fragment, plus `src/`) to `<dir>`. It's light, so it's fine to run locally.

## Testing tips

- In the browser console: `SC3D.game.start()`, `SC3D.game.debug.aimAt(x, y, z)`, `SC3D.game.fire()`, `SC3D.game.debug.win()`.
- `requestAnimationFrame` stops in hidden tabs; shim it with `setTimeout` for automated runs.
