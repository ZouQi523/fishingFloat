# Crucian carp model handoff

## Contract

Load classic scripts in this order: Three, `src/crucian-mesh.js`, `src/fish-view.js`.
No GLTF loader, fetch, external image loading, ES-module runtime or network dependency.
A 512×256 grayscale scale/lateral-line texture is embedded as raw base64 pixels
inside the classic JS; FishView creates it synchronously with Three.DataTexture.

```js
const view = window.FishView.create({ THREE, scene });
view.update({
  enabled: true,
  mouth: { x: 0, y: .3, z: 0 },
  direction: { x: 1, y: 0, z: 0 },
  time: 0,
  state: 'approach',
  speed: .03 // optional visual tail-beat input, metres/second
});
const qa = view.snapshot();
view.dispose();
```

`enabled` defaults false. `update` never modifies fishState or any physics state.
The fish is added directly to the supplied scene, uses its existing lighting,
environment and optics, and creates no camera, inset, private scene or light.
Only the caudal fin animates; head/body/mouth never swim away from the authoritative
mouth. +X is forward, +Y up, +Z lateral, units metres.

## Geometry

Built in Blender 5.2, not generated from Three primitives. Body length including
mouth and caudal fin: 0.18m. Body height 0.069m and thickness 0.030m. Overall fins
extend to 0.084m height and 0.04823m width. Deep compressed body, single long-based
dorsal, forked caudal, paired pectoral/pelvic and anal fins, small dark eyes,
operculum creases and an actual open lip/recessed oral cavity.

46 submeshes; 1,937 authored Blender vertices; 3,694 triangles. Export is an
unindexed triangle buffer with 11,082 GPU vertices, approximately 908KB classic JS.
The revised head retains 28mm depth just 12mm behind the actual mouth: rounded
forehead and a short blunt snout rather than a long conical point. Small eyes
remain anatomical rather than oversized cartoon eyes.
Colour is a restrained silver/olive dark-back/light-belly vertex gradient with
subtle embedded crescent scale rows and an interrupted lateral sensory line; no
cartoon outlines, glossy oversized eyes, or external textures. Fin roots and eye
parts intentionally overlap body surfaces as a real-time layered assembly. This
is a rendering asset, not a boolean-unified printable solid.

The actual oral rim is at local x=+0.09m. FishView derives its attachment point
from exported front lip vertices. It does not use a repositioned marker object.
`snapshot()` returns modelMouth, physicalMouth, error, modelMouthLocal, mouthSource,
position, direction, visibility, state/time and counts.

## Validation

The final five-view contact sheet was rendered and opened/visually inspected.
The +X view includes the actual open mouth. No cropped geometry, giant eye,
separated fin rays or black inverted surface patches were observed.

Strict geometry inspector passes: all 46 meshes closed, zero non-manifold edges,
boundary edges, degenerate faces, loose vertices, inconsistent normals or floating
parts. Inter-object intersections at anatomical attachment points are intentional;
self-intersection/printability certification is not claimed.

`node assets/crucian/render-qa.mjs` uses the repository's real Three implementation.
206 direction/pitch/reversal cases, including the -X singular direction and zero
vector fallback; default/disabled hiding, immutable inputs and idempotent dispose.
Maximum snapshot mouth error 6.36e-17m; maximum independently measured actual
Float32 lip geometry error 3.58e-9m, comfortably below 1e-6m.

## Reproduction

```sh
S=/Users/zouqi/.dsh/skills/blender-modeling/scripts
$S/blrun $S/preview.py -- --build tools/build-crucian.py --out assets/crucian/contact-sheet.png --views iso,front,right,back,top --res 420x320 --cols 3 --style studio --samples 24
$S/blrun $S/inspect.py -- --build tools/build-crucian.py --json assets/crucian/geometry-qa.json --strict
node assets/crucian/render-qa.mjs
```

The Blender build writes the classic JS, summary and source blend deterministically.
A rerun may also create Blender's standard `.blend1` previous-save backup.
