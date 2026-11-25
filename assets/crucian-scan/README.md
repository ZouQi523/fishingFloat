# 真实张口银鲫扫描资产 — Genuine open-mouth silver crucian scan

## 中文交付摘要

- **来源真实可追溯，非 Tripo 生成、非程序手搓鱼体**：使用 [ffish.asia / floraZia.com 的银鲫摄影扫描 ccd31440](https://sketchfab.com/3d-models/cc0-crucian-carp-c-auratus-langsdorfii-ccd3144068d34cd9b15f3c38d2fb790b)，通过 Objaverse/Hugging Face 取得原始文件。双侧原照片纹理、真实张口和所有鱼鳍均保留，已清除色卡与18个孤立单三角碎片。
- **保守署名**：作者现页面声明 CC0，但原下载文件保留历史 CC BY 4.0 信息，因此按较保守做法保留作者 **ffish.asia / floraZia.com**、原作链接、来源和本页修改说明；未把历史署名要求抹去。
- **最终模型已冻结**：19,900 三角面、9,963 原生几何顶点、单一连通整鱼，长约18厘米，1024²原照片重投影贴图；嘴原点是16个实际口缘顶点的质心，而非随意放置的标记。
- **扫描不冒充水密 CAD**：视觉网格仍有98条开放/非流形缝边，不宣称水密。碰撞使用独立闭合保守凸包，不依赖视觉网格闭合性；它包含全部原高模和最终渲染顶点、全部鱼鳍，并覆盖任意时刻的连续±3毫米侧向摆尾，另含0.1毫米数值垫和1.5毫米碰撞皮肤。凸包会保守跨过口腔、鱼鳍之间等凹部，因此不是精确凹面碰撞体。
- **已验证**：源扫描全部375,838个导入顶点（含UV重复）、渲染顶点连续扫掠、69,731个独立凸包表面探针、RGBA逐字节对应和GLB原生重新导入均通过；最终六视图和真实口缘标记图已经实际渲染并人工查看。详见下方报告与技术细节。

This is the actual `ccd3144068d34cd9b15f3c38d2fb790b` photographic scan of **Carassius auratus langsdorfii**, not a handmade or procedurally reconstructed fish. Its bilateral asymmetry, scales, eyes, mouth opening, tail and all fins come from the scan.

## Attribution and source

- Creator: **ffish.asia / floraZia.com**, [creator page](https://sketchfab.com/ffishAsia-and-floraZia).
- [Canonical source — CC0 ギンブナ 🐟 Crucian Carp, C. auratus langsdorfii](https://sketchfab.com/3d-models/cc0-crucian-carp-c-auratus-langsdorfii-ccd3144068d34cd9b15f3c38d2fb790b).
- [Downloaded original GLB](https://huggingface.co/datasets/allenai/objaverse/resolve/main/glbs/000-154/ccd3144068d34cd9b15f3c38d2fb790b.glb).
- Original GLB SHA-256: `03f157b0c6fb945e44d008a14f8faa9db32bf74f046ca18fcc1081b9f569a529`.
- Current source metadata declares **CC0**. Downloaded historical metadata contained **CC BY 4.0**; attribution and this modification notice are retained conservatively. [CC0](https://creativecommons.org/publicdomain/zero/1.0/) · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

## Modifications

1. Removed detached 12-triangle colour calibration cube `Object_4`; joined six fish chunks, applied transforms and welded identical positions at `1e-7 m`: **184,668 unique vertices / 369,195 triangles** before reduction.
2. Uniformly scaled source length to 0.18 m; oriented runtime **+X head / +Y dorsal / +Z lateral**.
3. Protected the real mouth during QEM reduction, removed 18 duplicate faces produced by reduction, cleared stale custom split normals and regenerated smooth normals. Removed **18 disconnected single-triangle micro-fragments**, retaining the complete multi-face anatomy and all fins.
4. Final visual mesh: **9,963 geometric vertices / 19,900 triangles / one connected component**, runtime unindexed GPU payload **59,700 vertices**. Actual reduced length is **0.1799898 m**.
5. Reprojected the original photographic albedo high-to-low using **EMIT-only selected-to-active baking**, avoiding UV stretching caused by direct triangle collapse. New atlas is **1024×1024 RGBA**, with no procedural scales, repainting, invented features or lighting introduced by the colour-transfer bake. [Original extracted albedo](assets/crucian-scan/original-scanned-albedo.png) · [Reprojected runtime albedo](assets/crucian-scan/scanned-albedo.png).
6. Set origin to measured centroid of **16 actual lip vertices** distributed around the scanned aperture. Runtime `mouthLocal=[0,0,0]`; exported lip centroid differs by **8.84 nm** due to rounding. Actual source mouth position is unchanged by debris removal; vertex indices are updated after reindexing.
7. Removed unused imported parent empties from the final native scene.

## Continuous deformation and collision envelope

Both runtime payloads declare:

```json
{"amplitude":0.003,"startX":-0.03,"span":0.15,"frequency":7,"phase":4}
```

Intended sway: `z += .003*u*u*sin(time*7+u*4)`, where `u=clamp((-x-.03)/.15,0,1)`. The mouth stays fixed in local space.

Collision hull includes **all original pre-reduction vertices AND all final visual vertices**, Minkowski-expanded by the entire local-Z segment **[-3 mm,+3 mm]**, plus **0.1 mm XYZ numerical construction padding**. This contains every continuous sway phase, not just sampled animation frames, and conservatively bridges concavities.

Immutable `FishBody`: **830 hull support points / 5,090 hull-surface samples**, `skin=0.0015 m`, `sampleSpacing=0.003 m`, `quantizationError=1e-7 m`, `constructionPadding=0.0001 m`. The body, point arrays, mouth array and deformation metadata are frozen for collision caching.

Surface construction uses ≤1.7 mm barycentric cells and ≤2 mm Poisson pruning: continuous coverage bound `2 + 1.7/sqrt(3) < 2.982 mm`, including rounding. Independent reconstructed-hull probes reached only **2.2744 mm** distance from the nearest sample.

## Validation and previews

- [Six actual rendered views](assets/crucian-scan/contact-sheet.png): both sides, mouth-facing, rear and top; no calibration cube or detached fragments. Rendered and visually inspected after the final export.
- [Mouth-landmark close-ups](assets/crucian-scan/mouth-landmarks.png): cyan dots are actual exported scanned lip vertices; orange is their measured centroid. Jagged rear edges are a **preview-only head crop**, not damage to the delivered full fish.
- [Geometry QA](assets/crucian-scan/geometry-qa.json): tested **375,838 original imported vertices**, including seam/UV duplicates, every visual vertex and the **continuous ±3 mm support bound**. Minimum containment margin **97 µm**, before the additional 1.5 mm skin. Tested **69,731** independent hull-surface probes. One connected visual component, no loose vertices.
- [Runtime/texture QA](assets/crucian-scan/runtime-qa.json): classic offline payloads, immutable collision arrays; all **4,194,304 RGBA bytes** equal the saved PNG pixels in bottom-up order for `flipY=false`; GLB buffer bounds match runtime geometry.
- [GLB re-import QA](assets/crucian-scan/glb-reimport-qa.json): one mesh / **19,900 triangles**, successful native Blender re-import, **no structural repair required**. GLB has **14,592 position/UV-split vertices**, distinct from native geometric or unindexed runtime counts.

This photographic visual mesh is **not watertight CAD**: it retains **98 open/non-manifold scan/reduction seam edges**. Collision does **not** assume watertight visual topology; it uses the independent expanded closed convex envelope containing all original points and all fins. The remaining main fish is a single connected component; detached single-triangle debris has been removed.

## Deliverables and reproduction

- [Native Blender asset](assets/crucian-scan/silver-crucian.blend).
- [Self-contained textured GLB](assets/crucian-scan/silver-crucian.glb).
- [Classic offline mesh payload](src/crucian-mesh.js): `window.CrucianMesh` / CommonJS.
- [Immutable collision payload](src/fish-body.js): `window.FishBody` / CommonJS.
- [Importer and reproducible baking/export procedure](tools/import-crucian-scan.py).
- [Independent source geometry verifier](assets/crucian-scan/verify-scan.py).
- [Independent runtime and PNG/GLB verifier](assets/crucian-scan/verify-runtime.js).
- [Native GLB re-import verifier](assets/crucian-scan/reimport-glb.py).
- [Compact model summary](assets/crucian-scan/model-summary.json).

Final frozen runtime mesh/body model hash:

```text
281aa1fb3da062e2a01135377b56549b0af147fefe61975582b607777060fb67
```

Derived from exported rounded positions plus the actual photographic RGBA bytes, linking visual and collision payloads. No runtime network fetch required. No further exports are pending.
