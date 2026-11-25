'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Real vendored Three math, cameras, scenes and render targets; only WebGL is mocked.
const threePath = path.join(__dirname, '../vendor/three.module.js');
const threeSource = fs.readFileSync(threePath, 'utf8');
const exportPattern = /export\s*\{([^}]+)\};?\s*$/;
assert.match(threeSource, exportPattern);
const context = vm.createContext({ console, window: {} });
vm.runInContext(threeSource.replace(exportPattern, (_, names) =>
  'globalThis.THREE = {' + names.replace(/(\w+)\s+as\s+(\w+)/g, '$2: $1') + '};'),
context, { filename: threePath });
const T = context.THREE;
context.window.THREE = T;
const opticsPath = path.join(__dirname, '../src/optics.js');
vm.runInContext(fs.readFileSync(opticsPath, 'utf8'), context, { filename: opticsPath });
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10,
  `${actual} != ${expected}`);
const array = vector => Array.from(vector.toArray());
const meshes = scene => {
  const result = [];
  scene.traverse(object => { if (object.isMesh) result.push(object); });
  return result;
};
function state(renderer) {
  return { target: renderer.target, cubeFace: renderer.cubeFace, mipLevel: renderer.mipLevel,
    viewport: array(renderer.viewport), scissor: array(renderer.scissor),
    scissorTest: renderer.scissorTest, clippingPlanes: renderer.clippingPlanes,
    autoClear: renderer.autoClear };
}
function fixture(lighting) {
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(45, 1.5, .01, 100);
  camera.position.set(1, 2, 3); camera.lookAt(0, .8, 0);
  const scope = new T.OrthographicCamera(-.2, .2, .3, -.3, .01, 10);
  scope.position.set(-.4, 1.2, 1); scope.lookAt(0, .8, 0);
  scope.zoom = 1.3; scope.updateProjectionMatrix();
  const source = new T.Mesh(new T.BoxGeometry(.01, .3, .01), new T.MeshStandardMaterial());
  scene.add(source);
  const hidden = new T.Group(), alreadyHidden = new T.Group();
  alreadyHidden.visible = false; scene.add(hidden, alreadyHidden);
  const renderer = {
    target: { name: 'original-cube' }, cubeFace: 4, mipLevel: 2,
    viewport: new T.Vector4(13, 17, 800, 600), scissor: new T.Vector4(19, 23, 100, 200),
    scissorTest: true, clippingPlanes: [new T.Plane(new T.Vector3(1, 0, 0), 3)],
    autoClear: false, captures: [], failAt: -1,
    getRenderTarget() { return this.target; },
    getActiveCubeFace() { return this.cubeFace; },
    getActiveMipmapLevel() { return this.mipLevel; },
    getViewport(out) { return out.copy(this.viewport); },
    getScissor(out) { return out.copy(this.scissor); },
    getScissorTest() { return this.scissorTest; },
    setViewport(...args) { args.length === 1 ? this.viewport.copy(args[0]) : this.viewport.set(...args); },
    setScissor(...args) { args.length === 1 ? this.scissor.copy(args[0]) : this.scissor.set(...args); },
    setScissorTest(value) { this.scissorTest = value; },
    setRenderTarget(target, face = 0, mip = 0) {
      this.target = target; this.cubeFace = face; this.mipLevel = mip;
      this.viewport.set(0, 0, 9999, 9999); this.scissor.set(0, 0, 9999, 9999);
      this.scissorTest = true;
    },
    render(renderScene, renderCamera) {
      renderScene.updateMatrixWorld(true); renderCamera.updateMatrixWorld(true);
      this.captures.push({ scene: renderScene, camera: renderCamera,
        position: renderCamera.getWorldPosition(new T.Vector3()),
        direction: renderCamera.getWorldDirection(new T.Vector3()),
        waterVisible: optics.mesh.visible, volumeVisible: waterVolume.visible, hiddenVisible: hidden.visible,
        alreadyHiddenVisible: alreadyHidden.visible, ...state(this) });
      if (this.captures.length === this.failAt) throw failure;
    }
  };
  const failure = new Error('intentional optical render failure');
  const optics = context.window.FloatOptics.createWater(renderer, scene, camera, 2, 1, .8, lighting);
  // The application, not createWater, owns the original water-volume mesh.
  assert.equal(meshes(scene).length, 2, 'createWater adds only the original surface');
  const waterVolume = new T.Mesh(new T.BoxGeometry(2, .8 - .004, 1), optics.volumeMaterial);
  waterVolume.position.y = (.8 - .004) / 2; waterVolume.renderOrder = 3; scene.add(waterVolume);
  return { scene, camera, scope, source, hidden, alreadyHidden, waterVolume, renderer, optics, failure,
    uniforms: optics.mesh.material.uniforms };
}

test('one original scene and water mesh serve distinct perspective and orthographic optical views', () => {
  const f = fixture(), { optics, renderer, uniforms } = f;
  const originalMeshes = meshes(f.scene);
  assert.equal(uniforms.tBelow.value, null, 'targets are lazy before a view is bound/captured');
  optics.resize(1200, 800);
  optics.capture([f.waterVolume, f.hidden]);
  const mainBelow = uniforms.tBelow.value, mainMirror = uniforms.tMirror.value;
  const mainMatrix = uniforms.mirrorMatrix.value;
  const mainDepth = uniforms.tDepth.value;
  const mainInverse = uniforms.belowInverseViewProjection.value;
  assert.equal(uniforms.orthographicView.value, 0);
  vectorClose(array(uniforms.viewDirection.value), array(f.camera.getWorldDirection(new T.Vector3())));
  assert.equal(mainDepth.isDepthTexture, true);
  assert.equal(mainDepth, renderer.captures[0].target.depthTexture);
  vectorClose(array(mainInverse), array(new T.Matrix4().multiplyMatrices(
    f.camera.matrixWorld, f.camera.projectionMatrixInverse)));
  assert.equal(renderer.captures[0].camera, f.camera, 'refraction uses the real main camera');
  assert.equal(renderer.captures[1].camera.isPerspectiveCamera, true);
  assert.notEqual(renderer.captures[1].camera, f.camera);
  assert.deepEqual(array(renderer.captures[1].camera.projectionMatrix), array(f.camera.projectionMatrix));
  assert.deepEqual(renderer.captures[0].viewport, [0, 0, 1000, 667]);
  optics.capture([f.waterVolume, f.hidden], f.scope, { width: 300, height: 480 });
  assert.equal(renderer.captures[2].camera, f.scope, 'inset refraction uses its actual second camera');
  const reflected = renderer.captures[3];
  assert.equal(reflected.camera.isOrthographicCamera, true);
  assert.notEqual(reflected.camera, f.scope);
  assert.notEqual(reflected.camera, renderer.captures[1].camera);
  assert.deepEqual(array(reflected.camera.projectionMatrix), array(f.scope.projectionMatrix));
  assert.equal(reflected.camera.zoom, f.scope.zoom);
  assert.deepEqual(renderer.captures[2].viewport, [0, 0, 300, 480]);
  assert.notEqual(uniforms.tBelow.value, mainBelow);
  assert.notEqual(uniforms.tMirror.value, mainMirror);
  assert.notEqual(uniforms.mirrorMatrix.value, mainMatrix);
  assert.equal(uniforms.tBelow.value, renderer.captures[2].target.texture);
  assert.equal(uniforms.tDepth.value, renderer.captures[2].target.depthTexture);
  assert.notEqual(uniforms.tDepth.value, mainDepth);
  assert.notEqual(uniforms.belowInverseViewProjection.value, mainInverse);
  assert.equal(uniforms.orthographicView.value, 1);
  vectorClose(array(uniforms.viewDirection.value), array(f.scope.getWorldDirection(new T.Vector3())));
  vectorClose(array(uniforms.belowInverseViewProjection.value), array(new T.Matrix4().multiplyMatrices(
    f.scope.matrixWorld, f.scope.projectionMatrixInverse)));
  assert.equal(uniforms.tMirror.value, reflected.target.texture);
  assert.deepEqual(array(uniforms.eye.value), array(f.scope.position));
  for (const capture of renderer.captures) {
    assert.equal(capture.scene, f.scene, 'both passes render the exact original scene');
    assert.equal(capture.waterVisible, false);
    assert.equal(capture.volumeVisible, false, 'app-owned water volume is hidden from its own captures');
    assert.equal(capture.hiddenVisible, false);
    assert.equal(capture.alreadyHiddenVisible, false);
    assert.equal(capture.autoClear, true);
    assert.equal(capture.scissorTest, false, 'inset scissor cannot clip offscreen capture');
    assert.equal(capture.cubeFace, 0); assert.equal(capture.mipLevel, 0);
  }
  assert.deepEqual(meshes(f.scene), originalMeshes, 'capture adds no water/float clones or other meshes');
  assert.equal(originalMeshes.length, 3);
  optics.bindCamera();
  assert.equal(uniforms.tBelow.value, mainBelow);
  assert.equal(uniforms.tMirror.value, mainMirror);
  assert.equal(uniforms.mirrorMatrix.value, mainMatrix);
  assert.equal(uniforms.tDepth.value, mainDepth);
  assert.equal(uniforms.belowInverseViewProjection.value, mainInverse);
  assert.equal(uniforms.orthographicView.value, 0);
  vectorClose(array(uniforms.viewDirection.value), array(f.camera.getWorldDirection(new T.Vector3())));
  assert.deepEqual(array(uniforms.eye.value), array(f.camera.position));
});

test('reflection tracks the corresponding world-space camera pose, projection and clipping side', () => {
  const f = fixture(), parent = new T.Group();
  parent.position.set(.3, -.2, .5); parent.rotation.set(.12, .3, -.15);
  parent.add(f.scope); f.scene.add(parent);
  f.scope.rotation.z += .2;
  const expectedEye = f.scope.getWorldPosition(new T.Vector3());
  const expectedDirection = f.scope.getWorldDirection(new T.Vector3());
  f.optics.capture([f.waterVolume], f.scope, { width: 300, height: 480 });
  const reflection = f.renderer.captures[1];
  close(reflection.position.x, expectedEye.x); close(reflection.position.z, expectedEye.z);
  close(reflection.position.y, 1.6 - expectedEye.y);
  close(reflection.direction.x, expectedDirection.x);
  close(reflection.direction.y, -expectedDirection.y);
  close(reflection.direction.z, expectedDirection.z);
  assert.deepEqual(array(f.uniforms.eye.value), array(expectedEye));
  const bias = new T.Matrix4().set(.5,0,0,.5, 0,.5,0,.5, 0,0,.5,.5, 0,0,0,1);
  const expectedMatrix = bias.multiply(reflection.camera.projectionMatrix).multiply(reflection.camera.matrixWorldInverse);
  assert.deepEqual(array(f.uniforms.mirrorMatrix.value), array(expectedMatrix));
  assert.equal(reflection.clippingPlanes.length, 1);
  assert.deepEqual(array(reflection.clippingPlanes[0].normal), [0, 1, 0]);
  close(reflection.clippingPlanes[0].constant, -.8 + .0002);
  f.camera.position.y = .3;
  f.optics.capture([f.waterVolume]);
  assert.deepEqual(array(f.renderer.captures.at(-1).clippingPlanes[0].normal), [0, -1, 0]);
});

test('reflection initializes immediately, then staggered thirds remain independent per camera', () => {
  const f = fixture(), counts = { main: 0, scope: 0 };
  for (const [camera, key] of [[f.camera, 'main'], [f.scope, 'scope'], [f.camera, 'main'],
    [f.scope, 'scope'], [f.scope, 'scope'], [f.scope, 'scope'], [f.camera, 'main'], [f.camera, 'main']]) {
    const before = f.renderer.captures.length;
    f.optics.capture([f.waterVolume], camera, { width: 200, height: 300 });
    const frame = counts[key]++;
    assert.equal(f.renderer.captures.length - before, frame === 0 || (frame + (key==='main'?0:1)) % 3 === 0 ? 2 : 1,
      `${key} capture ${frame + 1}`);
  }
  assert.notEqual(f.renderer.captures[1].camera, f.renderer.captures[3].camera);
});

for (const failAt of [-1, 1, 2]) {
  test(`capture restores complete renderer and visibility state ${failAt < 0 ? 'on success' : 'when pass ' + failAt + ' throws'}`, () => {
    const f = fixture(), renderer = f.renderer, before = state(renderer);
    f.optics.mesh.visible = false;
    renderer.failAt = failAt;
    const capture = () => f.optics.capture([f.waterVolume, f.hidden, f.alreadyHidden, f.hidden, f.optics.mesh],
      f.scope, { width: 100, height: 160 });
    if (failAt < 0) capture();
    else assert.throws(capture, error => error === f.failure);
    assert.deepEqual(state(renderer), before);
    assert.equal(renderer.clippingPlanes, before.clippingPlanes, 'preserve clipping array identity');
    assert.equal(renderer.target, before.target);
    assert.equal(f.hidden.visible, true);
    assert.equal(f.alreadyHidden.visible, false);
    assert.equal(f.optics.mesh.visible, false, 'do not unhide water that was already hidden');
    renderer.failAt = -1;
    const count = renderer.captures.length;
    capture();
    assert.equal(renderer.captures.length - count, failAt < 0 ? 1 : 2,
      'a failed first capture retries reflection rather than leaving an uninitialized mirror');
    assert.deepEqual(state(renderer), before);
  });
}

test('primary resize and inset viewport sizes remain independent, capped and nonzero', () => {
  const f = fixture();
  f.optics.resize(800, 600); f.optics.capture([f.waterVolume]);
  const primary = f.renderer.captures[0].target;
  f.optics.capture([f.waterVolume], f.scope, { width: 300, height: 2400 });
  const inset = f.renderer.captures[2].target;
  assert.equal(inset.width, 125); assert.equal(inset.height, 1000);
  assert.notEqual(primary.depthTexture, inset.depthTexture);
  assert.equal(primary.depthTexture.isDepthTexture, true);
  assert.equal(inset.depthTexture.isDepthTexture, true);
  f.optics.resize(4000, 2000);
  assert.equal(primary.width, 1000); assert.equal(primary.height, 500);
  assert.equal(inset.width, 125); assert.equal(inset.height, 1000);
  f.optics.capture([f.waterVolume], f.scope, { width: 0, height: -30 });
  assert.equal(inset.width, 1); assert.equal(inset.height, 1);
  assert.equal(f.renderer.captures.at(-1).camera.isOrthographicCamera, true,
    'resizing invalidates mirror pixels and immediately captures a fresh reflection');
  f.optics.bindCamera();
  assert.equal(f.uniforms.tBelow.value, primary.texture);
  f.optics.resize(0, 0);
  assert.equal(primary.width, 1); assert.equal(primary.height, 1);
});

test('depth inverse projection round-trips actual world hits for both camera types and camera motion', () => {
  const f = fixture();
  assert.deepEqual(array(f.uniforms.waterBoundsMin.value), [-1, 0, -.5]);
  assert.deepEqual(array(f.uniforms.waterBoundsMax.value), [1, .8, .5]);
  assert.deepEqual(array(f.uniforms.extinction.value), [6, 5, 8]);
  for (const camera of [f.camera, f.scope]) {
    for (const offset of [0, .13]) {
      camera.position.x += offset;
      camera.lookAt(0, .5, 0);
      camera.updateMatrixWorld(true);
      f.optics.capture([f.waterVolume], camera, { width: 160, height: 160 });
      const inverse = f.uniforms.belowInverseViewProjection.value;
      for (const point of [new T.Vector3(0, .1, 0), new T.Vector3(.2, .79, -.1)]) {
        // Actual depth-buffer convention is NDC [-1,1] -> sampled depth [0,1].
        const ndc = point.clone().project(camera), depth = ndc.z * .5 + .5;
        assert.ok(depth > 0 && depth < 1);
        const reconstructed = new T.Vector3(ndc.x, ndc.y, depth * 2 - 1).applyMatrix4(inverse);
        vectorClose(array(reconstructed), array(point));
        const near = new T.Vector3(ndc.x, ndc.y, -1).applyMatrix4(inverse);
        const expectedNear = new T.Vector3(ndc.x, ndc.y, -1).unproject(camera);
        vectorClose(array(near), array(expectedNear));
        assert.ok(near.distanceTo(reconstructed) > .01, 'near and sampled hit are distinct ray endpoints');
      }
    }
  }
});

test('dispose releases both cameras optical targets and owned materials without removing app-owned volume', () => {
  const f = fixture();
  f.optics.capture([f.waterVolume]);
  f.optics.capture([f.waterVolume], f.scope, { width: 100, height: 160 });
  const targets = new Set(f.renderer.captures.map(capture => capture.target));
  assert.equal(targets.size, 4, 'two real cameras own distinct color/depth and mirror targets');
  const resources = [...targets, f.optics.mesh.geometry, f.optics.mesh.material, f.optics.volumeMaterial];
  const disposed = new Map(resources.map(resource => [resource, 0]));
  for (const resource of resources) resource.addEventListener('dispose', () =>
    disposed.set(resource, disposed.get(resource) + 1));
  f.optics.dispose();
  for (const resource of resources) assert.equal(disposed.get(resource), 1);
  assert.equal(f.optics.mesh.parent, null);
  assert.equal(f.waterVolume.parent, f.scene, 'volume mesh ownership stays with the original application');
  assert.equal(f.source.parent, f.scene);
});

test('global time/impact/center survive view binding while update keeps following the main camera', () => {
  const f = fixture();
  f.optics.update(12.5, .4, { x: .2, z: -.3 });
  f.optics.capture([f.waterVolume], f.scope, { width: 100, height: 160 });
  assert.deepEqual(array(f.uniforms.eye.value), array(f.scope.position));
  f.optics.bindCamera();
  assert.equal(f.uniforms.time.value, 12.5);
  assert.equal(f.uniforms.impact.value, .4);
  assert.deepEqual(array(f.uniforms.center.value), [.2, -.3]);
  f.camera.position.set(2, 3, 4);
  f.optics.update(13, .2, { x: 0, z: 0 });
  assert.deepEqual(array(f.uniforms.eye.value), [2, 3, 4]);
});

test('water clarity is bounded, defaults to .35 and ignores invalid nonfinite input', () => {
  const f=fixture(),{optics,uniforms}=f;
  assert.equal(optics.snapshot().surfaceTransparency,.35);
  for(const [input,expected] of [[.35,.35],[0,0],[1,1],[-.5,0],[2,1],[.42,.42],[NaN,.42],[Infinity,.42],[-Infinity,.42],['0',.42]]){
    assert.equal(optics.setSurfaceTransparency(input),expected);
    assert.equal(uniforms.surfaceTransparency.value,expected);
    assert.equal(optics.snapshot().surfaceTransparency,expected);
  }
});

test('both real camera captures share transmission without replacing material or losing reflection', () => {
  const f=fixture(),material=f.optics.mesh.material,originalMeshes=meshes(f.scene);
  f.optics.setSurfaceTransparency(.27);
  for(const camera of [f.camera,f.scope,f.camera]){
    f.optics.capture([f.waterVolume],camera,{width:200,height:150});
    assert.equal(f.uniforms.surfaceTransparency.value,.27);
    assert.equal(f.optics.mesh.material,material);
    assert.ok(f.uniforms.tBelow.value&&f.uniforms.tMirror.value);
    assert.deepEqual(meshes(f.scene),originalMeshes);
  }
  assert.equal(f.optics.volumeMaterial.uniforms, material.uniforms, 'volume and surface share the exact uniforms');
  assert.ok(f.optics.volumeMaterial.isShaderMaterial, 'side volume uses the real optical shader, not opacity tint');
  assert.match(f.optics.volumeMaterial.fragmentShader.replace(/\s+/g, ''),
    /gl_FragColor=vec4\(mix\([^;]+\),1\.\)/,
    'volume writes fully integrated radiance with alpha one, not a faint opacity overlay');
  assert.match(f.optics.volumeMaterial.vertexShader.replace(/\s+/g, ''), /vNormalY=normal\.y;/,
    'volume identifies the original box lateral faces from its geometric normals');
  assert.match(f.optics.volumeMaterial.fragmentShader.replace(/\s+/g, ''), /if\(abs\(vNormalY\)>(?:0)?\.5\)discard;/,
    'volume discards top and bottom caps so its alpha-one composite cannot overwrite surface Fresnel');
  assert.match(material.fragmentShader,/mix\(below,reflected,clamp\(f/,'real scene reflection remains Fresnel-weighted');
});

function vectorClose(actual, expected) {
  assert.equal(actual.length, expected.length);
  actual.forEach((value, index) => close(value, expected[index]));
}
const radiance = (light, scale = 1) => [light.color.r, light.color.g, light.color.b]
  .map(value => value * Math.max(0, light.intensity) * scale);
const lightState = light => ({
  parent: light.parent, position: array(light.position), quaternion: array(light.quaternion),
  scale: array(light.scale), color: array(light.color), intensity: light.intensity,
  groundColor: light.groundColor && array(light.groundColor),
  target: light.target, targetParent: light.target && light.target.parent,
  targetPosition: light.target && array(light.target.position),
  targetQuaternion: light.target && array(light.target.quaternion),
  targetScale: light.target && array(light.target.scale)
});

test('shared lake palette, green transmission and deterministic fallback lighting initialize immediately', () => {
  const palette = context.window.FloatOptics.waterPalette;
  assert.equal(Object.isFrozen(palette), true);
  assert.deepEqual(Object.keys(palette).sort(), ['deep', 'surface']);
  assert.equal(palette.surface, 0x68765a);
  assert.equal(palette.deep, 0x202719);
  const f = fixture(), other = fixture();
  assert.equal(f.uniforms.waterTint.value.getHex(), palette.surface);
  assert.equal(f.uniforms.transmissionTint.value.isVector3, true);
  assert.deepEqual(array(f.uniforms.transmissionTint.value), [.84, .90, .67]);
  for (const name of ['sunDirection', 'sunRadiance', 'ambientIrradiance']) {
    const initial = array(f.uniforms[name].value);
    assert.equal(initial.length, 3);
    assert.ok(initial.every(Number.isFinite), `${name} fallback is finite`);
    assert.deepEqual(initial, array(other.uniforms[name].value), `${name} fallback is deterministic`);
    f.optics.update(1, 0, { x: 0, z: 0 });
    assert.deepEqual(array(f.uniforms[name].value), initial, `${name} fallback survives updates`);
  }
  close(f.uniforms.sunDirection.value.length(), 1);
  const snapshot = f.optics.snapshot();
  assert.equal(snapshot.surfaceTransparency, .35);
  assert.equal(snapshot.attenuationModel, 'beer-lambert-depth');
  assert.equal(snapshot.volumeScattering, true);
  assert.deepEqual(Array.from(snapshot.extinction), [6, 5, 8]);
  assert.match(snapshot.waterColor, /^#?68765a$/i);
  for (const name of ['sunDirection', 'sunRadiance', 'ambientIrradiance']) {
    assert.ok(Array.isArray(snapshot[name]), `${name} snapshot is a plain array`);
    assert.deepEqual(Array.from(snapshot[name]), array(f.uniforms[name].value));
  }
});

test('initial lighting uses real parented sun and target world transforms without changing the lights', () => {
  const sun = new T.DirectionalLight(0xffb060, 2.3);
  const ambient = new T.HemisphereLight(0x7596c0, 0x20180c, .65);
  const sunParent = new T.Group(), targetParent = new T.Group();
  sunParent.position.set(3, -2, 1); sunParent.rotation.set(.3, -.5, .2);
  sunParent.scale.set(1.2, .8, 1.6); sun.position.set(2, 4, -3);
  targetParent.position.set(-2, .5, 4); targetParent.rotation.set(-.2, .4, .6);
  targetParent.scale.set(.7, 1.3, .9); sun.target.position.set(-1, .4, 2);
  sunParent.add(sun); targetParent.add(sun.target);
  const beforeSun = lightState(sun), beforeAmbient = lightState(ambient);
  const f = fixture({ sun, ambient });
  const expected = sun.getWorldPosition(new T.Vector3())
    .sub(sun.target.getWorldPosition(new T.Vector3())).normalize();
  vectorClose(array(f.uniforms.sunDirection.value), array(expected));
  vectorClose(array(f.uniforms.sunRadiance.value), radiance(sun));
  vectorClose(array(f.uniforms.ambientIrradiance.value), radiance(ambient, .7));
  assert.deepEqual(lightState(sun), beforeSun);
  assert.deepEqual(lightState(ambient), beforeAmbient);
  assert.equal(f.renderer.captures.length, 0, 'initial lighting sync does not render');
  assert.equal(meshes(f.scene).length, 3, 'lighting creates no additional meshes');
});

test('update refreshes world sun direction, live colors and intensities while leaving real lights unchanged', () => {
  const sun = new T.DirectionalLight(0xffffff, 1);
  const ambient = new T.HemisphereLight(0xffffff, 0x112233, 1);
  const sunParent = new T.Group(), targetParent = new T.Group();
  sunParent.add(sun); targetParent.add(sun.target);
  const f = fixture({ sun, ambient });
  f.scene.add(sunParent, targetParent, ambient);
  const originalMeshes = meshes(f.scene), uniforms = f.uniforms;
  const initialDirection = array(uniforms.sunDirection.value);
  sunParent.position.set(-4, 2, 3); sunParent.rotation.set(.4, .2, -.3);
  sun.position.set(2, 3, -1);
  targetParent.position.set(1, -.5, -2); targetParent.rotation.set(-.2, .6, .1);
  sun.target.position.set(.2, -.4, .8);
  sun.color.setRGB(.23, .52, .81); sun.intensity = 3.2;
  ambient.color.setRGB(.18, .37, .29); ambient.intensity = .45;
  const beforeSun = lightState(sun), beforeAmbient = lightState(ambient);
  f.optics.update(2, .1, { x: .2, z: -.1 });
  const expected = sun.getWorldPosition(new T.Vector3())
    .sub(sun.target.getWorldPosition(new T.Vector3())).normalize();
  assert.notDeepEqual(array(uniforms.sunDirection.value), initialDirection);
  vectorClose(array(uniforms.sunDirection.value), array(expected));
  vectorClose(array(uniforms.sunRadiance.value), radiance(sun));
  vectorClose(array(uniforms.ambientIrradiance.value), radiance(ambient, .7));
  assert.deepEqual(lightState(sun), beforeSun);
  assert.deepEqual(lightState(ambient), beforeAmbient);
  for (const name of ['sunDirection', 'sunRadiance', 'ambientIrradiance']) {
    vectorClose(Array.from(f.optics.snapshot()[name]), array(uniforms[name].value));
  }
  sun.intensity = -2; ambient.intensity = -3;
  f.optics.update(3, 0, { x: 0, z: 0 });
  assert.deepEqual(array(uniforms.sunRadiance.value), [0, 0, 0]);
  assert.deepEqual(array(uniforms.ambientIrradiance.value), [0, 0, 0]);
  assert.equal(sun.intensity, -2); assert.equal(ambient.intensity, -3);
  sun.intensity = .8; ambient.intensity = 1.7;
  ambient.color.setRGB(.62, .44, .12);
  f.optics.update(4, 0, { x: 0, z: 0 });
  vectorClose(array(uniforms.sunRadiance.value), radiance(sun));
  vectorClose(array(uniforms.ambientIrradiance.value), radiance(ambient, .7));
  assert.deepEqual(meshes(f.scene), originalMeshes);
  assert.equal(f.renderer.captures.length, 0, 'lighting updates create no rendering passes or scenes');
});

test('coincident sun and target use a finite up direction on creation and subsequent updates', () => {
  const sun = new T.DirectionalLight(0xffffff, 1), parent = new T.Group();
  parent.position.set(4, -1, 2); parent.rotation.set(.2, .5, -.1);
  sun.position.set(1, 2, 3); sun.target.position.copy(sun.position);
  parent.add(sun, sun.target);
  const f = fixture({ sun });
  assert.deepEqual(array(f.uniforms.sunDirection.value), [0, 1, 0]);
  sun.position.x += 2;
  f.optics.update(1, 0, { x: 0, z: 0 });
  close(f.uniforms.sunDirection.value.length(), 1);
  sun.target.position.copy(sun.position);
  f.optics.update(2, 0, { x: 0, z: 0 });
  assert.deepEqual(array(f.uniforms.sunDirection.value), [0, 1, 0]);
});

test('main and scope bindings retain one material, lake tints and live lighting with no scene or mesh clones', () => {
  const sun = new T.DirectionalLight(0xffcc88, 1.4);
  const ambient = new T.HemisphereLight(0x779966, 0x333322, .6);
  const f = fixture({ sun, ambient }), material = f.optics.mesh.material;
  const originalMeshes = meshes(f.scene), uniforms = f.uniforms;
  const sharedNames = ['waterTint', 'transmissionTint', 'sunDirection', 'sunRadiance', 'ambientIrradiance'];
  const shared = sharedNames.map(name => ({ uniform: uniforms[name], value: uniforms[name].value }));
  f.optics.setSurfaceTransparency(.38);
  for (const camera of [f.camera, f.scope, f.camera]) {
    f.optics.capture([f.waterVolume], camera, { width: 200, height: 160 });
    f.optics.bindCamera(camera);
    assert.equal(f.optics.mesh.material, material);
    assert.equal(material.uniforms, uniforms);
    sharedNames.forEach((name, index) => {
      assert.equal(uniforms[name], shared[index].uniform);
      assert.equal(uniforms[name].value, shared[index].value);
    });
    assert.equal(uniforms.waterTint.value.getHex(), context.window.FloatOptics.waterPalette.surface);
    assert.deepEqual(array(uniforms.transmissionTint.value), [.84, .90, .67]);
    vectorClose(array(uniforms.sunRadiance.value), radiance(sun));
    vectorClose(array(uniforms.ambientIrradiance.value), radiance(ambient, .7));
    assert.deepEqual(meshes(f.scene), originalMeshes);
    const snapshot = f.optics.snapshot();
    assert.equal(snapshot.surfaceTransparency, .38);
    assert.match(snapshot.waterColor, /^#?68765a$/i);
  }
  assert.ok(f.renderer.captures.every(capture => capture.scene === f.scene));
});

test('water scattering and highlights use supplied illumination while real refraction and Fresnel remain', () => {
  const shader = fixture().optics.mesh.material.fragmentShader.replace(/\s+/g, '');
  assert.match(shader, /waterScatter=waterTint\*\(ambientIrradiance\+sunRadiance\*max\(dot\(n,sunDirection\),0\.\)\*\.25\)/);
  assert.match(shader, /vec3l=normalize\(sunDirection\);vec3h=normalize\(l\+v\)/, 'Blinn half-vector highlight follows the scene sun direction');
  assert.match(shader, /sunRadiance\*[^;]*pow\(|pow\([^;]*\*sunRadiance/,
    'sun highlight is modulated by live sun radiance, not a fixed highlight color');
  assert.match(shader, /texture2D\(tBelow,/, 'refraction still samples the real scene');
  assert.match(shader, /texture2D\(tMirror,/, 'reflection still samples the real scene');
  assert.match(shader, /mix\(below,reflected,clamp\(f/, 'real Fresnel reflection weighting remains');
});

test('adaptive optical scale applies once per camera and resize keeps projection/depth coherent',()=>{
  const f=fixture();f.optics.setQuality({opticalScale:.5,reflectionInterval:6});f.optics.resize(1440,1000);
  f.optics.capture([f.waterVolume]);
  assert.deepEqual(f.renderer.captures[0].viewport,[0,0,500,347]);
  f.optics.capture([f.waterVolume],f.scope,{width:300,height:480});
  assert.deepEqual(f.renderer.captures[2].viewport,[0,0,150,240]);
  f.optics.bindCamera(f.scope);assert.equal(f.uniforms.tDepth.value,f.renderer.captures[2].target.depthTexture);
  f.optics.bindCamera();assert.equal(f.uniforms.tDepth.value,f.renderer.captures[0].target.depthTexture);
  assert.equal(f.optics.snapshot().reflectionInterval,6);
  f.optics.setQuality({opticalScale:1,reflectionInterval:3});f.optics.resize(1440,1000);
  f.optics.capture([f.waterVolume]);assert.deepEqual(f.renderer.captures.at(-2).viewport,[0,0,1000,694]);
});
test('staggered views avoid synchronized six-pass reflection spikes after initialization',()=>{
  const f=fixture();for(let frame=0;frame<15;frame++){
    const before=f.renderer.captures.length;
    f.optics.capture([f.waterVolume]);f.optics.capture([f.waterVolume],f.scope,{width:300,height:480});
    assert.ok(f.renderer.captures.length-before<=(frame===0?4:3));
  }
});
