# Third-party assets

| Asset | File | Source | Licence |
|---|---|---|---|
| Studio environment HDRI ("Ferndale Studio 04", 1k) — bowling | `public/assets/env/studio.hdr` | Poly Haven (via the three.js examples repository) | CC0 1.0 (public domain) |
| Sky HDRI "Blouberg Sunrise 2" (1k) — Oceanfront Links | `public/assets/env/oceanfront.hdr` | Poly Haven (via three.js examples) | CC0 1.0 |
| Sky HDRI "Spruit Sunrise" (1k) — Countryside Championship | `public/assets/env/countryside.hdr` | Poly Haven (via three.js examples) | CC0 1.0 |
| Sky HDRI "Moonless Golf" (1k) — Moonlight Night Golf | `public/assets/env/night.hdr` | Poly Haven (via three.js examples) | CC0 1.0 |

Everything else in the bowling and golf scenes (characters, course maps, trees (lane wood, pin decals, ball cover, carpet, neon sign, pin and ball
meshes, sounds) is generated procedurally in code (`src/game/bowling/textures.ts`, `renderer.ts`, `audio.ts`).

## Engines and libraries

- PlayCanvas Engine — MIT
- Rapier (`@dimforge/rapier3d-compat`) — Apache-2.0
