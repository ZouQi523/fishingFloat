'use strict';

// Invoked by the existing browser runner, never starts a competing CDP session.
// A detached renderer keeps this controlled scene entirely off the user's canvas.
module.exports = async function ({ evaluate }) {
  const result = await evaluate(`(() => {
    const T = window.THREE;
    const original = {
      physics: JSON.stringify(floatLab.getState()),
      render: floatLab.getRenderState(),
      target: floatLab.renderer.getRenderTarget(),
      viewport: floatLab.renderer.getViewport(new T.Vector4()).toArray(),
      scissor: floatLab.renderer.getScissor(new T.Vector4()).toArray(),
      scissorTest: floatLab.renderer.getScissorTest()
    };
    const renderer = new T.WebGLRenderer({ antialias: false, alpha: false });
    const size = 192, opticsInstances = new Set(), geometries = new Set(), materials = new Set();
    const reports = [], shaderErrors = [];
    const previousShaderError = renderer.debug.onShaderError;
    renderer.debug.onShaderError = (gl, program, vertex, fragment) => {
      shaderErrors.push([gl.getProgramInfoLog(program), gl.getShaderInfoLog(vertex),
        gl.getShaderInfoLog(fragment)].filter(Boolean).join('\\n'));
    };
    renderer.setPixelRatio(1); renderer.setSize(size, size, false);
    renderer.toneMapping = T.NoToneMapping;
    renderer.outputColorSpace = T.SRGBColorSpace;
    const output = new T.WebGLRenderTarget(size, size, { type: T.UnsignedByteType });
    const pixel = new Uint8Array(4);
    function sample(camera, world) {
      const point = world.clone().project(camera);
      const x = Math.floor((point.x * .5 + .5) * size);
      const y = Math.floor((point.y * .5 + .5) * size);
      if (x < 2 || y < 2 || x >= size - 2 || y >= size - 2)
        throw new Error('Controlled target is outside the offscreen framebuffer');
      let value = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        renderer.readRenderTargetPixels(output, x + dx, y + dy, 1, 1, pixel);
        value += (pixel[0] + pixel[1] + pixel[2]) / 3;
      }
      return value / 9;
    }
    try {
      for (const kind of ['perspective', 'orthographic']) {
        for (const entry of ['surface', 'side']) {
          const scene = new T.Scene(); scene.background = new T.Color(.2, .2, .2);
          const camera = kind === 'perspective'
            ? new T.PerspectiveCamera(45, 1, .05, 20)
            : new T.OrthographicCamera(-1.25, 1.25, 1.25, -1.25, .05, 20);
          if (entry === 'surface') {
            camera.up.set(0, 0, -1); camera.position.set(0, 4, 0); camera.lookAt(0, 1, 0);
          } else {
            camera.position.set(0, 1, 4); camera.lookAt(0, 1, 0);
          }
          camera.updateMatrixWorld(true);
          const sun = new T.DirectionalLight(0xffffff, 0);
          const ambient = new T.HemisphereLight(0xffffff, 0xffffff, 1);
          const optics = FloatOptics.createWater(renderer, scene, camera, 4, 4, 2, { sun, ambient });
          opticsInstances.add(optics);
          // Match the original app volume: its top sits below the animated surface.
          const volume = new T.Mesh(new T.BoxGeometry(4, 2 - .004, 4), optics.volumeMaterial);
          volume.position.y = (2 - .004) / 2; volume.renderOrder = 3; scene.add(volume);
          const patches = [0x000000, 0xffffff].map((color, index) => {
            const patch = new T.Mesh(new T.PlaneGeometry(.65, .65),
              new T.MeshBasicMaterial({ color, side: T.DoubleSide }));
            patch.position.x = index ? .5 : -.5;
            if (entry === 'surface') patch.rotation.x = -Math.PI / 2;
            scene.add(patch); return patch;
          });
          scene.traverse(object => {
            if (object.geometry) geometries.add(object.geometry);
            if (object.material) materials.add(object.material);
          });
          // createWater owns these resources and its per-camera RTs via dispose().
          geometries.delete(optics.mesh.geometry);
          materials.delete(optics.mesh.material); materials.delete(optics.volumeMaterial);
          optics.resize(size, size); optics.update(0, 0, { x: 0, z: 0 });
          for (const distance of [.015, .8]) {
            for (const patch of patches) {
              if (entry === 'surface') patch.position.y = 2 - distance;
              else { patch.position.y = 1; patch.position.z = 2 - distance; }
            }
            for (const clarity of [1, .35, 0]) {
              optics.setSurfaceTransparency(clarity);
              optics.capture([volume], camera, { width: size, height: size });
              optics.bindCamera(camera);
              renderer.setRenderTarget(output); renderer.setViewport(0, 0, size, size);
              renderer.setScissorTest(false); renderer.autoClear = true;
              renderer.render(scene, camera);
              const black = sample(camera, patches[0].position);
              const white = sample(camera, patches[1].position);
              reports.push({ kind, entry, distance, clarity, black, white,
                contrast: Math.abs(white - black) });
            }
          }
        }
      }
      const current = floatLab.getRenderState();
      return {
        reports, shaderErrors,
        unchanged: original.physics === JSON.stringify(floatLab.getState()) &&
          original.render.sceneUuid === current.sceneUuid &&
          original.render.floatUuid === current.floatUuid &&
          original.target === floatLab.renderer.getRenderTarget() &&
          JSON.stringify(original.viewport) === JSON.stringify(floatLab.renderer.getViewport(new T.Vector4()).toArray()) &&
          JSON.stringify(original.scissor) === JSON.stringify(floatLab.renderer.getScissor(new T.Vector4()).toArray()) &&
          original.scissorTest === floatLab.renderer.getScissorTest(),
        detached: !renderer.domElement.isConnected
      };
    } finally {
      renderer.debug.onShaderError = previousShaderError;
      renderer.setRenderTarget(null);
      for (const optics of opticsInstances) optics.dispose();
      output.dispose();
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      renderer.dispose(); renderer.forceContextLoss();
    }
  })()`);
  let passed = 0;
  const assert = (condition, message) => {
    if (!condition) throw new Error(message + '\n' + JSON.stringify(result, null, 2));
    passed++;
  };
  assert(result.shaderErrors.length === 0, 'production water surface and volume shaders compile on the GPU');
  assert(result.detached, 'controlled optical fixture never enters the user-visible DOM');
  assert(result.unchanged, 'GPU probe preserves real scene, float, physics and renderer state');
  for (const kind of ['perspective', 'orthographic']) {
    for (const entry of ['surface', 'side']) {
      const row = (distance, clarity) => result.reports.find(r =>
        r.kind === kind && r.entry === entry && r.distance === distance && r.clarity === clarity);
      const label = kind + ' ' + entry;
      const shallowClear = row(.015, 1), shallowLake = row(.015, .35);
      const deepClear = row(.8, 1), deepLake = row(.8, .35);
      assert(shallowClear.contrast > 120 && deepClear.contrast > 120,
        label + ' 100% clarity recovers black-white targets at both depths');
      assert(shallowLake.contrast > shallowClear.contrast * .45,
        label + ' 35% clarity preserves a shallow target rather than a flat opacity tint');
      assert(deepLake.contrast < deepClear.contrast * .04 && deepLake.contrast < shallowLake.contrast * .08,
        label + ' 35% clarity suppresses deep contrast by integrated path length');
      for (const distance of [.015, .8]) {
        assert(row(distance, 0).contrast < 3,
          label + ' 0% clarity completely hides even the shallow underwater target at ' + distance + 'm');
      }
    }
  }
  return { passed, reports: result.reports };
};
