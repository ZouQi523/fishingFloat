'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Real vendored Three scene/geometry/material/camera math; only WebGL is mocked.
const threePath = path.join(__dirname, '../vendor/three.module.js');
const threeSource = fs.readFileSync(threePath, 'utf8');
const exportPattern = /export\s*\{([^}]+)\};?\s*$/;
assert.match(threeSource, exportPattern, 'vendored Three must have one final named export');
const threeContext = vm.createContext({ console });
vm.runInContext(threeSource.replace(exportPattern, (_, names) =>
  'globalThis.THREE = {' + names.replace(/(\w+)\s+as\s+(\w+)/g, '$2: $1') + '};'),
threeContext, { filename: threePath });
const T = threeContext.THREE;
const scopePath = path.join(__dirname, '../src/float-scope.js');
const scopeSource = fs.readFileSync(scopePath, 'utf8');
const WATER = .83, BAND = .0157;
const close = (actual, expected, tolerance = 1e-10) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected} (tol ${tolerance})`);
const plain = value => JSON.parse(JSON.stringify(value));
const rect = (left, top, width, height) => ({ left, top, width, height,
  right: left + width, bottom: top + height });

function rendererState(renderer) {
  return { viewport: Array.from(renderer.viewport.toArray()),
    scissor: Array.from(renderer.scissor.toArray()), scissorTest: renderer.scissorTest,
    clippingPlanes: renderer.clippingPlanes, localClippingEnabled: renderer.localClippingEnabled,
    autoClear: renderer.autoClear, target: renderer.target,
    cubeFace: renderer.cubeFace, mipLevel: renderer.mipLevel };
}
function objects(scene) {
  const result = [];
  scene.traverse(object => result.push(object));
  return result;
}
const capture = f => f.renderer.captures.at(-1);

function fixture(options = {}) {
  const elements = Object.fromEntries(['floatScope', 'floatScopeView', 'floatScopeReading',
    'floatScopeState', 'floatScopeWaterline'].map(id => [id, { textContent: '', dataset: {}, style: {} }]));
  let viewRect = rect(460, 50, 150, 240), canvasRect = rect(40, 30, 600, 400), displayed = true;
  elements.floatScopeView.getBoundingClientRect = () => viewRect;
  elements.floatScopeView.getClientRects = () => displayed ? [viewRect] : [];
  const document = { getElementById: id => elements[id] || null };
  const context = vm.createContext({ window: { innerWidth: 800, innerHeight: 600, document }, document });
  vm.runInContext(scopeSource, context, { filename: scopePath });

  const scene = new T.Scene(), source = new T.Group(), parent = new T.Group();
  const texture = new T.Texture();
  const material = new T.MeshStandardMaterial({ map: texture, color: 0xffcc33 });
  const otherMaterial = new T.MeshStandardMaterial({ map: texture, color: 0xee3333 });
  const originalPlanes = [new T.Plane(new T.Vector3(1, 0, 0), 2)];
  material.clippingPlanes = originalPlanes;
  const geometry = new T.BoxGeometry(.008, .26, .008).translate(0, -.13, 0);
  const stem = new T.Mesh(geometry, material), bands = new T.Mesh(geometry, [material, otherMaterial]);
  stem.name = 'stem'; bands.name = 'bands'; source.name = 'physical-float';
  stem.castShadow = stem.receiveShadow = true;
  source.add(stem, bands);
  parent.position.set(.2, .1, -.3); parent.add(source); scene.add(parent);
  const light = new T.DirectionalLight(0xffffff, 2);
  const water = new T.Mesh(new T.PlaneGeometry(20, 20), new T.MeshPhysicalMaterial({ transmission: .8 }));
  water.name = 'original-scene-water'; water.rotation.x = -Math.PI / 2; water.position.y = WATER;
  const submergedObject = new T.Mesh(new T.BoxGeometry(.02, .02, .02), otherMaterial);
  submergedObject.position.set(.3, WATER - .04, -.1);
  scene.add(light, water, submergedObject); scene.environment = texture;
  function pose(topY = WATER + 4 * BAND, tiltDegrees = 0) {
    source.position.set(.1, topY - parent.position.y, .2);
    source.rotation.set(0, 0, tiltDegrees * Math.PI / 180);
    scene.updateMatrixWorld(true);
  }
  pose();
  const events = [], failures = {}, mainCamera = new T.PerspectiveCamera();
  let opticsCamera = mainCamera;
  stem.onBeforeRender = (renderer, actualScene, camera, actualGeometry, actualMaterial) => {
    events.push('source-before');
    assert.equal(actualScene, scene); assert.equal(actualGeometry, geometry); assert.equal(actualMaterial, material);
    assert.equal(camera, opticsCamera);
    if (failures.meshBefore) throw failures.meshBefore;
  };
  stem.onAfterRender = () => { events.push('source-after'); if (failures.meshAfter) throw failures.meshAfter; };
  water.onBeforeRender = (renderer, actualScene, camera) => {
    events.push('water-before'); assert.equal(actualScene, scene); assert.equal(camera, opticsCamera);
  };
  const renderer = {
    domElement: { getBoundingClientRect: () => canvasRect },
    viewport: new T.Vector4(7, 11, 901, 603), scissor: new T.Vector4(17, 19, 801, 503),
    scissorTest: false, clippingPlanes: originalPlanes, localClippingEnabled: false, autoClear: false,
    target: { name: 'main-target' }, cubeFace: 3, mipLevel: 2, captures: [],
    getSize(out) { return out.set(1200, 800); },
    getViewport(out) { return out.copy(this.viewport); },
    getScissor(out) { return out.copy(this.scissor); },
    getScissorTest() { return this.scissorTest; },
    setViewport(...args) { args.length === 1 ? this.viewport.copy(args[0]) : this.viewport.set(...args); },
    setScissor(...args) { args.length === 1 ? this.scissor.copy(args[0]) : this.scissor.set(...args); },
    setScissorTest(value) { this.scissorTest = value; },
    getRenderTarget() { return this.target; },
    getActiveCubeFace() { return this.cubeFace; },
    getActiveMipmapLevel() { return this.mipLevel; },
    setRenderTarget(target, face = 0, mip = 0) {
      this.target = target; this.cubeFace = face; this.mipLevel = mip;
      // Real target switches can reset both rectangles: restore target first.
      this.viewport.set(0, 0, 1200, 800); this.scissor.set(0, 0, 1200, 800);
    },
    render(actualScene, camera) {
      events.push('render'); actualScene.updateMatrixWorld(true); camera.updateMatrixWorld(true);
      const renderedObjects = [];
      this.captures.push({ scene: actualScene, camera, opticsCamera, renderedObjects, ...rendererState(this) });
      actualScene.traverseVisible(object => {
        if (!object.isMesh) return;
        renderedObjects.push(object);
        const mat = Array.isArray(object.material) ? object.material[0] : object.material;
        object.onBeforeRender(this, actualScene, camera, object.geometry, mat, null);
        object.onAfterRender(this, actualScene, camera, object.geometry, mat, null);
      });
      if (failures.render) throw failures.render;
    }
  };
  const f = { renderer, scene, source, parent, stem, bands, geometry, material, otherMaterial,
    texture, water, light, submergedObject, originalPlanes, elements, pose, events, failures, mainCamera,
    opticsCamera: () => opticsCamera,
    setView: value => { viewRect = value; }, setCanvas: value => { canvasRect = value; },
    hide: () => { displayed = false; }, show: () => { displayed = true; } };
  if (options.setup) options.setup(f);
  scene.updateMatrixWorld(true);
  f.originalObjects = objects(scene);
  f.originalMaterials = f.originalObjects.filter(o => o.isMesh).map(o => o.material);
  // Reject both cloning and creation of a private scene/mesh/material rig.
  for (const item of [...f.originalObjects, geometry, material, otherMaterial, texture, water.material]) {
    item.clone = () => { throw new Error('scope must never clone original scene resources'); };
  }
  const guardedThree = new Proxy(T, { get(target, key) {
    if (/^(Scene|Group|Mesh|.*Material|.*Light|.*Geometry)$/.test(String(key))) {
      throw new Error(`scope must not construct ${String(key)}`);
    }
    return target[key];
  } });
  f.create = overrides => context.window.FloatScope.create({ THREE: guardedThree, renderer, scene, source,
    waterY: options.waterY === undefined ? WATER : options.waterY,
    beforeRender(camera, viewport) {
      events.push('optics-capture'); opticsCamera = camera;
      f.beforeArgs = { camera, viewport };
      if (options.beforeRender) options.beforeRender(f, camera, viewport);
      if (failures.before) throw failures.before;
    },
    afterRender(camera) {
      events.push('optics-restore'); f.afterCamera = camera; opticsCamera = mainCamera;
      if (options.afterRender) options.afterRender(f, camera);
      if (failures.after) throw failures.after;
    }, ...overrides });
  f.scope = f.create();
  // Normalize JSON snapshots across the VM realm for strict structural assertions.
  const snapshot = f.scope.snapshot;
  f.scope.snapshot = () => plain(snapshot());
  return f;
}

function assertWaterline(camera, snapshot) {
  const p = new T.Vector3(snapshot.camera.target[0], snapshot.waterY, snapshot.camera.target[2]).project(camera);
  close((1 - p.y) / 2, .56); close(snapshot.projection.waterlineFraction, .56);
}
function assertOriginalObjects(f) {
  const current = objects(f.scene);
  assert.equal(current.length, f.originalObjects.length);
  current.forEach((object, i) => assert.equal(object, f.originalObjects[i]));
  current.filter(o => o.isMesh).forEach((mesh, i) => assert.equal(mesh.material, f.originalMaterials[i]));
  assert.equal(f.stem.geometry, f.geometry); assert.equal(f.stem.material, f.material);
  assert.equal(f.source.parent, f.parent);
}
// Independently clip actual triangles at the physical water plane for framing QA.
function aboveWaterTrianglePoints(source, scene, waterY) {
  const result = [];
  source.traverse(mesh => {
    if (!mesh.isMesh) return;
    for (let ancestor = mesh; ancestor && ancestor !== scene; ancestor = ancestor.parent) {
      if (!ancestor.visible) return;
    }
    const p = mesh.geometry.attributes.position, index = mesh.geometry.index;
    const count = index ? index.count : p.count;
    for (let i = 0; i + 2 < count; i += 3) {
      const triangle = [0, 1, 2].map(j => new T.Vector3().fromBufferAttribute(p,
        index ? index.getX(i + j) : i + j).applyMatrix4(mesh.matrixWorld));
      for (let j = 0; j < 3; j++) {
        const a = triangle[j], b = triangle[(j + 1) % 3];
        if (a.y >= waterY) result.push(a);
        if ((a.y < waterY) !== (b.y < waterY)) {
          result.push(a.clone().lerp(b, (waterY - a.y) / (b.y - a.y)));
        }
      }
    }
  });
  return result;
}

test('scene is required and creation never constructs, clones, reparents, or adds scene resources', () => {
  const f = fixture();
  assert.throws(() => f.create({ scene: undefined }), /requires THREE, renderer, scene and source/);
  assertOriginalObjects(f);
  const materialJSON = f.material.toJSON(), world = Array.from(f.source.matrixWorld.elements);
  f.scope.render();
  const rendered = capture(f), snapshot = f.scope.snapshot();
  assert.equal(rendered.scene, f.scene);
  assert.equal(rendered.scene.getObjectByName('physical-float'), f.source);
  for (const object of [f.stem, f.bands, f.water, f.submergedObject]) {
    assert.ok(rendered.renderedObjects.includes(object), 'original visible objects reach renderer callbacks');
    assert.equal(object.visible, true);
  }
  assert.ok(objects(rendered.scene).includes(f.light));
  assert.equal(rendered.scene.environment, f.texture);
  assert.equal(f.stem.castShadow, true); assert.equal(f.stem.receiveShadow, true);
  assert.equal(snapshot.sameScene, true); assert.equal(snapshot.viewStyle, 'scene-camera');
  assert.equal(snapshot.clippingAboveWater, false); assert.equal(snapshot.waterlineVisible, false);
  assert.equal(snapshot.sceneUuid, f.scene.uuid); assert.equal(snapshot.sourceUuid, f.source.uuid);
  assert.equal(rendered.clippingPlanes, f.originalPlanes);
  assert.equal(rendered.localClippingEnabled, false);
  assert.equal(f.material.clippingPlanes, f.originalPlanes);
  assert.deepEqual(f.material.toJSON(), materialJSON);
  assert.deepEqual(Array.from(f.source.matrixWorld.elements), world);
  assertOriginalObjects(f);
});

test('actual independent camera is 20 degrees; waterline .56 and field .24 are stable through normal bobbing', () => {
  const f = fixture(); let previous, originalCamera;
  for (const exposure of [.025, 4 * BAND, .09]) {
    f.pose(WATER + exposure);
    const transforms = objects(f.scene).map(o => Array.from(o.matrixWorld.elements));
    f.scope.render();
    const snapshot = f.scope.snapshot(), { camera } = capture(f);
    assert.ok(camera.isOrthographicCamera); assert.notEqual(camera, f.mainCamera);
    assert.ok(!objects(f.scene).includes(camera), 'observation camera is not added to scene');
    if (originalCamera) assert.equal(camera, originalCamera);
    originalCamera = camera;
    const direction = camera.getWorldDirection(new T.Vector3());
    close(Math.atan2(-direction.y, Math.hypot(direction.x, direction.z)) * 180 / Math.PI, 20);
    close(snapshot.elevationDegrees, 20); close(snapshot.fieldHeightM, .24);
    close(snapshot.sourceTop[1], WATER + exposure); close(snapshot.waterY, WATER);
    close(snapshot.camera.position[1] - snapshot.camera.target[1], Math.sin(Math.PI / 9));
    assert.equal(snapshot.camera.uuid, camera.uuid);
    if (previous) assert.deepEqual(snapshot.camera, previous.camera);
    assertWaterline(camera, snapshot);
    objects(f.scene).forEach((o, i) => assert.deepEqual(Array.from(o.matrixWorld.elements), transforms[i]));
    assertOriginalObjects(f); previous = snapshot;
  }
});

test('shared optics capture precedes original scene callbacks and main optics restore follows them', () => {
  const f = fixture(); f.scope.render();
  assert.deepEqual(f.events, ['optics-capture', 'render', 'source-before', 'source-after', 'water-before', 'optics-restore']);
  assert.equal(f.beforeArgs.camera, capture(f).camera);
  assert.deepEqual(plain(f.beforeArgs.viewport), f.scope.snapshot().viewport);
  assert.equal(capture(f).opticsCamera, capture(f).camera);
  assert.equal(f.afterCamera, capture(f).camera); assert.equal(f.opticsCamera(), f.mainCamera);
});

test('physical exposed axis length and HUD marks use authoritative tilt-corrected HUD state', () => {
  const f = fixture(), tiltRad = 12 * Math.PI / 180;
  f.pose(WATER + .09, 5);
  const hudTop = WATER + 4 * BAND * Math.cos(tiltRad);
  f.scope.render({ nodes: { floatTop: { y: hudTop } }, evaluation: { tiltRad } });
  const snapshot = f.scope.snapshot();
  close(snapshot.exposedLengthM, .09 / Math.cos(5 * Math.PI / 180));
  close(snapshot.marks, 4); close(snapshot.tiltDegrees, 12);
  assert.equal(f.elements.floatScopeReading.textContent, '4.0 目');
  assert.equal(f.elements.floatScopeState.textContent, '露出漂目 · 已校正倾角');
  assert.equal(f.elements.floatScope.dataset.submerged, 'false');
  f.pose(WATER + .4); f.scope.render(); close(f.scope.snapshot().exposedLengthM, .26);
  assert.equal(f.scope.snapshot().marks, null);
  assert.equal(f.elements.floatScopeReading.textContent, '400 mm');
});

test('submerged float reports no above-water body but remains in original scene render, then recovers', () => {
  const f = fixture(); f.pose(WATER - .01); f.scope.render();
  const snapshot = f.scope.snapshot();
  assert.equal(snapshot.submerged, true); assert.equal(snapshot.exposedLengthM, 0); assert.equal(snapshot.marks, null);
  assert.equal(f.elements.floatScopeReading.textContent, '全部没入');
  assert.equal(f.elements.floatScopeState.textContent, '水面以上无可见漂体');
  assert.equal(f.elements.floatScope.dataset.submerged, 'true');
  assert.ok(capture(f).renderedObjects.includes(f.stem), 'module must not hide submerged mesh from scene water');
  assert.ok(capture(f).renderedObjects.includes(f.water));
  assert.equal(capture(f).localClippingEnabled, false);
  assertWaterline(capture(f).camera, snapshot);
  f.pose(); f.scope.render(); close(f.scope.snapshot().marks, 4);
  assert.equal(f.elements.floatScope.dataset.submerged, 'false');
});

test('20-degree and strongly tilted floats never claim readable marks, including pose-only fallback', () => {
  const f = fixture();
  for (const degrees of [20, 45, 89, 110]) {
    f.pose(WATER + .07, degrees);
    f.scope.render({ nodes: { floatTop: { y: WATER + .07 } }, evaluation: { tiltRad: degrees * Math.PI / 180 } });
    assert.equal(f.scope.snapshot().marks, null);
    assert.equal(f.elements.floatScopeReading.textContent, degrees + '°');
    assert.equal(f.elements.floatScopeState.textContent, '漂体倾角 · 不读漂目');
  }
  f.pose(WATER + .07, 55); f.scope.render(); close(f.scope.snapshot().tiltDegrees, 55);
  assert.equal(f.scope.snapshot().marks, null);
});

for (const indexed of [true, false]) {
  test(`framing fits actual ${indexed ? 'indexed' : 'non-indexed'} above-water triangles, tilted bounds and water crossings`, () => {
    const f = fixture({ setup(f) {
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute([0, .01, 0, -1, -1, -.3, 1, -1, .3], 3));
      if (indexed) g.setIndex([0, 1, 2]);
      const mesh = new T.Mesh(g, f.material); mesh.name = 'wide-triangle'; f.source.add(mesh);
      const hidden = new T.Group(); hidden.visible = false;
      hidden.add(new T.Mesh(new T.BoxGeometry(100, 100, 100), f.material)); f.source.add(hidden);
    } });
    for (const [exposure, tilt] of [[.04, 0], [.4, 0], [.3, 75], [.7, 40]]) {
      f.pose(WATER + exposure, tilt); f.scope.render();
      const snapshot = f.scope.snapshot(), { camera } = capture(f);
      const points = aboveWaterTrianglePoints(f.source, f.scene, WATER);
      assert.ok(points.length > 0); assert.ok(snapshot.fieldHeightM < 5, 'hidden gigantic mesh cannot drive bounds');
      const xs = points.map(p => p.x), zs = points.map(p => p.z);
      close(snapshot.camera.target[0], (Math.min(...xs) + Math.max(...xs)) / 2, 1e-8);
      close(snapshot.camera.target[2], (Math.min(...zs) + Math.max(...zs)) / 2, 1e-8);
      for (const point of points) {
        const projected = point.clone().project(camera);
        assert.ok(Math.abs(projected.x) <= .880001, `horizontal framing: ${projected.x}`);
        assert.ok(Math.abs(projected.y) <= .880001, `vertical framing: ${projected.y}`);
        assert.ok(Math.abs(projected.z) <= 1, 'actual triangles lie within camera depth');
      }
      if (exposure >= .3) assert.ok(snapshot.fieldHeightM > .24);
      close((camera.right - camera.left) / (camera.top - camera.bottom), snapshot.viewport.width / snapshot.viewport.height);
      assertWaterline(camera, snapshot); assertOriginalObjects(f);
    }
  });
}

test('hidden source meshes do not expand framing or get made visible by the inset', () => {
  const f = fixture(); f.scope.render(); const baseline = f.scope.snapshot();
  f.bands.visible = false; f.scope.render();
  close(f.scope.snapshot().fieldHeightM, baseline.fieldHeightM);
  assert.equal(f.bands.visible, false); assert.ok(!capture(f).renderedObjects.includes(f.bands));
  f.source.visible = false; f.scope.render();
  assert.equal(f.scope.snapshot().submerged, true); assert.equal(f.source.visible, false);
  assert.ok(!capture(f).renderedObjects.includes(f.stem));
  assert.ok(capture(f).renderedObjects.includes(f.water));
});

test('camera follows moved original source across frames with unchanged mesh, material and UUID identities', () => {
  const f = fixture(); let previous;
  for (const [x, z, exposure] of [[.2, -.3, .05], [1.3, -.8, .07], [-.6, .2, .035]]) {
    f.parent.position.x = x; f.parent.position.z = z; f.pose(WATER + exposure, 8); f.scope.render();
    const snapshot = f.scope.snapshot();
    assert.equal(snapshot.sceneUuid, f.scene.uuid); assert.equal(snapshot.sourceUuid, f.source.uuid);
    assert.equal(capture(f).scene, f.scene); assertOriginalObjects(f);
    const top = new T.Vector3().setFromMatrixPosition(f.source.matrixWorld);
    assert.deepEqual(snapshot.sourceTop, Array.from(top.toArray()));
    if (previous) assert.notDeepEqual(snapshot.camera.target, previous.camera.target);
    assertWaterline(capture(f).camera, snapshot); previous = snapshot;
  }
});

test('viewport clips CSS coordinates to canvas/window and converts to bottom-left renderer units', () => {
  const f = fixture(); f.scope.render();
  assert.deepEqual(f.scope.snapshot().viewport, { x: 840, y: 280, width: 300, height: 480 });
  assert.deepEqual(capture(f).viewport, [840, 280, 300, 480]);
  assert.deepEqual(capture(f).scissor, [840, 280, 300, 480]); assert.equal(capture(f).scissorTest, true);
  close(parseFloat(f.elements.floatScopeWaterline.style.top), 240 * .56);
  f.setView(rect(-20, -10, 180, 130)); f.scope.render();
  assert.deepEqual(f.scope.snapshot().viewport, { x: 0, y: 620, width: 240, height: 180 });
  close(parseFloat(f.elements.floatScopeWaterline.style.top), 40 + 90 * .56);
  f.setCanvas(rect(40, 30, 1000, 800)); f.setView(rect(760, 550, 200, 200)); f.scope.render();
  assert.deepEqual(f.scope.snapshot().viewport, { x: 864, y: 230, width: 48, height: 50 });
  close(parseFloat(f.elements.floatScopeWaterline.style.top), 50 * .56);
});

for (const stage of ['success', 'before', 'render', 'meshBefore', 'meshAfter', 'after']) {
  test(`full renderer state and main optics restore after ${stage}, including callback exceptions`, () => {
    const f = fixture({ beforeRender(f) {
      if (stage === 'before') {
        f.renderer.clippingPlanes = []; f.renderer.localClippingEnabled = false;
        f.renderer.autoClear = true; f.renderer.setRenderTarget({ name: 'optics-target' });
        f.renderer.setScissorTest(false);
      }
    }, afterRender(f) {
      // Restoration must survive an afterRender callback that mutates state then throws.
      if (stage === 'after') { f.renderer.clippingPlanes = []; f.renderer.setRenderTarget(null); }
    } });
    const renderer = f.renderer;
    renderer.scissorTest = true; renderer.localClippingEnabled = true;
    const before = rendererState(renderer), failure = new Error(`intentional ${stage} failure`);
    if (stage !== 'success') f.failures[stage] = failure;
    if (stage === 'success') f.scope.render();
    else assert.throws(() => f.scope.render(), error => error === failure);
    assert.equal(f.events.at(-1), 'optics-restore'); assert.equal(f.opticsCamera(), f.mainCamera);
    assert.equal(f.afterCamera, f.beforeArgs.camera);
    assert.deepEqual(rendererState(renderer), before);
    assert.equal(renderer.clippingPlanes, before.clippingPlanes); assert.equal(renderer.target, before.target);
    assert.equal(f.scope.snapshot().rendered, stage === 'success' || stage === 'after');
    if (stage !== 'before') {
      const during = capture(f);
      assert.equal(during.target, null); assert.equal(during.cubeFace, 0); assert.equal(during.mipLevel, 0);
      assert.equal(during.autoClear, true); assert.equal(during.scissorTest, true);
      assert.equal(during.clippingPlanes, before.clippingPlanes, 'no inset clipping changes');
      assert.equal(during.localClippingEnabled, before.localClippingEnabled);
    } else assert.equal(renderer.captures.length, 0);
    delete f.failures[stage]; f.scope.render();
    assert.equal(f.scope.snapshot().rendered, true); assert.deepEqual(rendererState(renderer), before);
    assertOriginalObjects(f);
  });
}

test('afterRender still restores main optics when beforeRender and afterRender both throw', () => {
  const f = fixture(), before = rendererState(f.renderer);
  f.failures.before = new Error('capture failed'); f.failures.after = new Error('restore callback failed');
  assert.throws(() => f.scope.render(), error => error === f.failures.after);
  assert.deepEqual(f.events, ['optics-capture', 'optics-restore']);
  assert.equal(f.opticsCamera(), f.mainCamera); assert.deepEqual(rendererState(f.renderer), before);
  assert.equal(f.scope.snapshot().rendered, false);
});

test('hidden, missing, offscreen, or zero-size inset skips rendering and optics; resize invalidates snapshot', () => {
  const f = fixture(); f.scope.render(); assert.equal(f.scope.snapshot().rendered, true);
  f.scope.resize(); assert.equal(f.scope.snapshot().rendered, false);
  const before = rendererState(f.renderer), count = f.renderer.captures.length, eventCount = f.events.length;
  const checkSkipped = () => {
    f.scope.render(); assert.equal(f.scope.snapshot().rendered, false);
    assert.equal(f.renderer.captures.length, count); assert.equal(f.events.length, eventCount);
    assert.deepEqual(rendererState(f.renderer), before);
  };
  f.hide(); checkSkipped(); f.show();
  f.setView(rect(2000, 2000, 150, 240)); checkSkipped();
  assert.equal(f.scope.snapshot().viewport.width, 0); assert.equal(f.scope.snapshot().viewport.height, 0);
  f.setView(rect(40, 30, 0, 100)); checkSkipped();
  f.setCanvas(rect(40, 30, 0, 0)); checkSkipped();
  delete f.elements.floatScopeView; checkSkipped();
});
