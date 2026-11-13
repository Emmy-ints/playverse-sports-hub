# Athlete pipeline

Builds `public/assets/athletes/athlete-{m,f}.glb` and `athlete-anims.json`.

Sources (not in this repo):
- MakeHuman data (CC0): `git clone --filter=blob:none https://github.com/makehumancommunity/makehuman` → set `MH` in `body.mjs`.
  Needs `3dobjs/base.obj`, `rigs/default.mhskel`, `rigs/default_weights.mhw`, `eyes/low-poly`, `eyes/materials/brown_eye.png`
  and the young-adult macro targets under `targets/macrodetails`.
- CMU mocap as BVH: `git clone --filter=blob:none https://github.com/una-dinosauria/cmu-mocap` → set `CMU` in `build.mjs`.

Run: `node build.mjs <outDir>` (Node 22, no dependencies).

- `body.mjs` — morphs the base mesh (gender / muscle / height), reduced 76-bone skeleton, skin weights.
- `kit.mjs` — garment fields, clipped/relaxed clothing shells with hems, lofted shoes, eyes, skin detail colours.
- `retarget.mjs` — BVH parsing and direction-corrected retargeting onto the MakeHuman skeleton.
- `build.mjs` — hair styles, accessories, GLB writer, animation pack (int16 quaternions, base64).
- `preview.mjs` — software rasteriser used to check meshes and poses as PNGs.
