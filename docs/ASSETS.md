# Third-party assets

| Asset | File | Source | Licence |
|---|---|---|---|
| Studio environment HDRI ("Ferndale Studio 04", 1k) | `public/assets/env/studio.hdr` | Poly Haven (via the three.js examples repository) | CC0 1.0 (public domain) |

Everything else in the bowling scene (lane wood, pin decals, ball cover, carpet, neon sign, pin and ball
meshes, sounds) is generated procedurally in code (`src/game/bowling/textures.ts`, `renderer.ts`, `audio.ts`).

## Engines and libraries

- PlayCanvas Engine — MIT
- Rapier (`@dimforge/rapier3d-compat`) — Apache-2.0
