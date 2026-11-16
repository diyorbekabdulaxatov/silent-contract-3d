# Silent Contract 3D

A noir sniper game in 3D for phones and browsers, built with [Three.js](https://threejs.org). It's the 3D remake of *Silent Contract*.

**Status:** prototype. One mission, *Cold Range*: ten paper targets from 80 to 400 m at the Varenne Rifle Club at dawn, with real bullet drop, wind and a mil reticle. Don't shoot Teodor.

## Controls

| Phone (landscape) | Keyboard and mouse |
|---|---|
| Drag anywhere to aim | Drag to aim |
| **Scope** button | `E` or right-click |
| Zoom slider (while scoped) | Mouse wheel, `+` / `-` |
| Hold **Hold breath** to steady the scope (5 s) | Hold `Shift` |
| **Fire** | `Space` |
| **Reload** | `R` |
| Pause button | `Esc` |

Gyro aiming (tilt to aim) is in Settings, off by default.

## How it's built

- Plain JavaScript modules, type-checked by TypeScript (`// @ts-check` with JSDoc). There's no build step for development: `index.html` loads `three` from a pinned CDN copy through an import map.
- `npm run build` bundles everything with Vite into `dist/`, which works offline. That folder is what the Android app (Capacitor, coming next) will wrap.
- GitHub Actions runs the checks, type-check, unit tests and build on every push. The built game is uploaded as the `game-dist` artifact.

## Roadmap

1. Range prototype: feel and performance on a Galaxy S24. *(now)*
2. People with animation, AI and alarms in 3D.
3. The other twelve missions from the 2D game.
4. Android app through Capacitor and GitHub Actions (APK, then AAB for Google Play).
