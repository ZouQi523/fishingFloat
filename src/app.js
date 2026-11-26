/* 浮漂实验室 · SI 浮力 + 单向绳约束 / 接触近似
 * 依赖：全局 THREE（three.module.js 已被 build.py 转成经典脚本）与 OrbitControls
 */
window.__FLOAT_APP_READY__ = (async function () {
  'use strict';
  const boot = window.FloatBoot || {stage:async()=>{},mark:()=>{},yieldWork:async()=>{}};
  await boot.stage('初始化物理钓组 · 保留 240 Hz 解算');
  const T = window.THREE;
  const OrbitControls = window.OrbitControls;

  /* =========================== 尺寸与常量 =========================== */
  const TANK_W = 1.62, TANK_H = 1.42, TANK_D = 0.78;
  const GLASS = 0.010;
  const IN_W = TANK_W - GLASS * 2, IN_D = TANK_D - GLASS * 2;
  const WATER_Y = 0.83;
  const GRAVEL_Y = 0.055;

  const P = window.FloatPhysics;
  const physicsOptions = { waterY: WATER_Y, bottomY: GRAVEL_Y, floatMassG: 0.6,
    lineMaterial: 'nylon', mainDiameter: 0.00022, subDiameter: 0.00016, baitMassG: 0.34 };
  // 几何和物理共用同一条回转曲线，不再用目数反推漂重。
  const F_LEN = 0.26, S_BODY0 = 0.125, S_BODY1 = 0.20;
  const BAND = 0.0157;            // 一目 = 15.7mm

  const floatRadius = P.radius;
  const LEAD_MAX = 10;
  let leadMass = 4.00;
  let paused = false, viewMode = 'tank', showForces = false, showGuides = true;
  // 这是一副已经绑好的线组；移漂、移铅只改变线上的位置，不重新裁线。
  const FIXED_LINE = Object.freeze({mainLength:1.20,leaderLengths:Object.freeze([.12,.15])});
  const rig = window.TaiwanRig.create({ ...physicsOptions, ...FIXED_LINE, leadMassG: leadMass });
  function configureRig(patch){return rig.configure({...patch,...FIXED_LINE});}
  // Exactly the original 4,800 steps, in small batches that allow loading UI to paint.
  boot.mark('settle-start');
  let settleSlice = performance.now();
  for(let quarter=0;quarter<80;quarter++){
    rig.step(.25);
    if(performance.now()-settleSlice>=6){
      await boot.stage(`稳定钓组 · ${(quarter+1)/4} / 20 秒物理时间`,{paint:false});
      await boot.yieldWork();
      settleSlice=performance.now();
    }
  }
  let rigState = rig.snapshot();
  boot.mark('settle-end');
  await boot.stage('准备渲染器与扫描鱼资源');
  const fishSimulation = window.FishLab.create({rig});
  let currentEvaluation = rigState.evaluation;
  let rodLifted = false;
  const vec = p => new T.Vector3(p.x, p.y, p.z);

  /* =========================== 渲染器 / 场景 =========================== */
  const canvas = document.getElementById('c');
  const renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true });
  // Reserve fill-rate headroom on Retina displays; automatic tiers may reduce pixels, never physics.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  // The first (unclipped) refraction pass updates all shadows once per display frame.
  // Main, scope and mirrored passes then reuse them instead of rendering 4–6 shadow maps.
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;

  const scene = new T.Scene();
  scene.background = new T.Color(0x080b08);
  const fishView = window.FishView.create({THREE:T,scene});

  const camera = new T.PerspectiveCamera(38, 1, 0.05, 20);
  camera.position.set(0.12, 0.86, 1.20);

  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 0.69, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 0.16;
  controls.maxDistance = 5.5;
  controls.minPolarAngle = 0.75;
  controls.maxPolarAngle = 1.82;
  controls.minAzimuthAngle = -1.95;
  controls.maxAzimuthAngle = 1.05;
  controls.update();

  boot.mark('fish-resources-ready');
  await boot.stage('准备日光与水体环境');
  /* 环境贴图：程序化生成，给玻璃/水面/鱼线提供反射 */
  (function env() {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 256;
    const g = c.getContext('2d');
    const lg = g.createLinearGradient(0, 0, 0, 256);
    // Neutral daylight above, muted bankside greens below; no cyan studio wash.
    lg.addColorStop(0.00, '#dce0cd');
    lg.addColorStop(0.20, '#a9b494');
    lg.addColorStop(0.42, '#667457');
    lg.addColorStop(0.62, '#384632');
    lg.addColorStop(1.00, '#171f16');
    g.fillStyle = lg;
    g.fillRect(0, 0, 512, 256);
    g.fillStyle = 'rgba(255,252,235,0.55)';
    g.fillRect(0, 14, 512, 16);
    g.fillStyle = 'rgba(225,232,207,0.22)';
    g.fillRect(0, 40, 512, 6);
    const tex = new T.CanvasTexture(c);
    tex.mapping = T.EquirectangularReflectionMapping;
    tex.colorSpace = T.SRGBColorSpace;
    const pmrem = new T.PMREMGenerator(renderer);
    scene.environment = pmrem.fromEquirectangular(tex).texture;
    tex.dispose(); pmrem.dispose();
  })();

  /* 湖岸日光：柔和中性天空光 + 暖白主光，避免原先青蓝补光染水。 */
  const ambient = new T.HemisphereLight(0xe8ebd6, 0x494d36, 0.90);
  scene.add(ambient);

  const key = new T.DirectionalLight(0xfff4df, 2.15);
  key.position.set(-0.75, 2.80, 1.15);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 4.0;
  key.shadow.camera.left = -1.1;
  key.shadow.camera.right = 1.1;
  key.shadow.camera.top = 1.80;
  key.shadow.camera.bottom = -0.1;
  key.shadow.bias = -0.00008;
  key.shadow.normalBias = 0.0002;
  scene.add(key);

  const fill = new T.PointLight(0xe8ead3, 0.25, 2.0, 2);
  fill.position.set(0.24, 0.48, 0.64);
  scene.add(fill);

  const rim = new T.DirectionalLight(0xb0be8a, 0.40);
  rim.position.set(-0.8, 0.5, -0.9);
  scene.add(rim);

  /* =========================== 房间背景 =========================== */
  (function room() {
    const c = document.createElement('canvas');
    c.width = 8; c.height = 256;
    const g = c.getContext('2d');
    const lg = g.createLinearGradient(0, 0, 0, 256);
    lg.addColorStop(0, '#20271f');
    lg.addColorStop(0.45, '#10160f');
    lg.addColorStop(1, '#070a07');
    g.fillStyle = lg;
    g.fillRect(0, 0, 8, 256);
    const tex = new T.CanvasTexture(c);
    tex.colorSpace = T.SRGBColorSpace;
    const m = new T.Mesh(
      new T.PlaneGeometry(6, 3.2),
      new T.MeshBasicMaterial({ map: tex })
    );
    m.position.set(0, 0.9, -1.7);
    scene.add(m);
  })();

  /* =========================== 鱼缸玻璃 =========================== */
  const glassMat = new T.MeshPhysicalMaterial({
    color: 0xf0f1e5, roughness: 0.03, metalness: 0.0,
    transparent: true, opacity: 0.018, side: T.DoubleSide,
    envMapIntensity: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.03,
    depthWrite: false
  });

  function glassPanel(w, h, x, y, z, ry) {
    const m = new T.Mesh(new T.BoxGeometry(w, h, GLASS), glassMat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    scene.add(m);
    return m;
  }
  const cy = TANK_H / 2;
  glassPanel(TANK_W, TANK_H, 0, cy, TANK_D / 2, 0);              // 前
  glassPanel(TANK_W, TANK_H, 0, cy, -TANK_D / 2, 0);             // 后
  glassPanel(TANK_D, TANK_H, TANK_W / 2, cy, 0, Math.PI / 2);    // 右
  // 左侧玻璃的水上检修口：竿身能伸入，不穿过实体玻璃；开口下缘高于静水面15mm。
  const accessY=WATER_Y+.015;
  glassPanel(TANK_D,accessY,-TANK_W/2,accessY/2,0,Math.PI/2);
  glassPanel(.24,TANK_H-accessY,-TANK_W/2,(TANK_H+accessY)/2,.27,Math.PI/2);
  glassPanel(.38,TANK_H-accessY,-TANK_W/2,(TANK_H+accessY)/2,-.20,Math.PI/2);
  const bottom = new T.Mesh(new T.BoxGeometry(TANK_W, GLASS, TANK_D), glassMat);
  bottom.position.set(0, GLASS / 2, 0);
  scene.add(bottom);

  // 缸背板（水下的"背景墙"，否则会看到黑色虚空）
  (function backWall() {
    const m = new T.Mesh(
      new T.PlaneGeometry(TANK_W - 0.02, TANK_H - 0.02),
      new T.MeshStandardMaterial({ color: 0x647154, roughness: 0.95, metalness: 0.0 })
    );
    m.position.set(0, TANK_H / 2, -TANK_D / 2 + 0.018);
    m.receiveShadow = true;
    scene.add(m);
  })();

  // 桌面（让缸有落点）
  (function floor() {
    const m = new T.Mesh(
      new T.PlaneGeometry(4, 2.4),
      new T.MeshStandardMaterial({ color: 0x10150e, roughness: 0.8, metalness: 0.1 })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.y = -0.002;
    m.receiveShadow = true;
    scene.add(m);
  })();

  // 前玻璃上的斜向反光（让玻璃板存在感）
  (function glassSheen() {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 512;
    const g = c.getContext('2d');
    g.clearRect(0, 0, 512, 512);
    function band(x0, w, a) {
      const lg = g.createLinearGradient(x0, 0, x0 + w, 0);
      lg.addColorStop(0, 'rgba(255,255,255,0)');
      lg.addColorStop(0.5, 'rgba(238,240,221,' + a + ')');
      lg.addColorStop(1, 'rgba(255,255,255,0)');
      g.save();
      g.translate(x0 + w / 2, 256);
      g.transform(1, 0, -0.55, 1, 0, 0);
      g.translate(-(x0 + w / 2), -256);
      g.fillStyle = lg;
      g.fillRect(x0, -260, w, 1020);
      g.restore();
    }
    band(70, 120, 0.10);
    band(250, 46, 0.07);
    const tex = new T.CanvasTexture(c);
    const m = new T.Mesh(
      new T.PlaneGeometry(TANK_W - 0.02, TANK_H - 0.02),
      new T.MeshBasicMaterial({
        map: tex, transparent: true, blending: T.AdditiveBlending,
        depthWrite: false, opacity: 0.18, side: T.DoubleSide
      })
    );
    m.position.set(0, TANK_H / 2, TANK_D / 2 + 0.004);
    m.renderOrder = 7;
    scene.add(m);
  })();

  // 缸体棱边（硅胶/框架的黑边）
  (function edges() {
    const box = new T.BoxGeometry(TANK_W, TANK_H, TANK_D);
    const eg = new T.EdgesGeometry(box);
    const lines = new T.LineSegments(eg, new T.LineBasicMaterial({
      color: 0x0a1116, transparent: true, opacity: 0.85
    }));
    lines.position.y = cy;
    scene.add(lines);
  })();

  // 顶部灯槽
  (function hood() {
    const g = new T.Group();
    const bar = new T.Mesh(
      new T.BoxGeometry(TANK_W + 0.03, 0.030, .075),
      new T.MeshStandardMaterial({ color: 0x070b0f, roughness: 0.55, metalness: 0.35 })
    );
    bar.position.set(0,TANK_H+.022,-TANK_D/2+.05);
    g.add(bar);
    const tube = new T.Mesh(
      new T.BoxGeometry(TANK_W - 0.22, 0.004, .045),
      new T.MeshStandardMaterial({ color: 0xfff7e5, emissive: 0xfff0d4, emissiveIntensity: 0.18 })
    );
    tube.position.set(0,TANK_H-.006,-TANK_D/2+.05);
    g.add(tube);
    scene.add(g);
    const lamp = new T.PointLight(0xfff3da, 0.65, 1.6, 2);
    lamp.position.set(0, TANK_H - 0.02, 0);
    scene.add(lamp);
  })();

  /* =========================== 砂石 / 水草 / 石头 =========================== */
  await boot.stage('载入同源砂石碰撞高度场');
  boot.mark('terrain-start');
  const habitat=window.TankFloor.create({THREE:T,scene,optics:window.FloatOptics,
    width:IN_W,depth:IN_D,bottomY:GRAVEL_Y,waterY:WATER_Y,
    collision:window.FishCollision,cache:window.TerrainCache});
  fishSimulation.setHabitat(habitat);fishView.setHabitat(habitat);
  boot.mark('terrain-end');
  await boot.stage('构建水草、钓具与观察相机');

  const plants = [];
  (function grass() {
    const rnd = (function (a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })(99);
    const hw = IN_W / 2, hd = IN_D / 2;
    const spots = [[-0.80, 0.44], [-0.63, 0.17], [0.76, 0.38], [0.57, 0.10], [0.88, -0.20], [-0.88, -0.24]];
    for (let s = 0; s < spots.length; s++) {
      const n = 5 + Math.floor(rnd() * 4);
      for (let i = 0; i < n; i++) {
        const h = 0.20 + rnd() * 0.38;
        const w = 0.010 + rnd() * 0.010;
        const geo = new T.PlaneGeometry(w, h, 4, 18);
        geo.translate(0, h / 2, 0);
        const pos = geo.attributes.position;
        const bend = (rnd() - 0.5) * 0.09, twist = rnd() * 6.28;
        for (let v = 0; v < pos.count; v++) {
          const y = pos.getY(v) / h;
          pos.setX(v, pos.getX(v) * Math.sin(Math.PI*(.08+.92*y)) + Math.sin(y * 1.9) * bend);
          pos.setZ(v, Math.cos(y * 1.6 + twist) * bend * 0.35 + Math.pow(pos.getX(v)/w,2)*.004);
        }
        geo.computeVertexNormals();
        const mat = new T.MeshStandardMaterial({
          color: new T.Color().setHSL(0.32 + rnd() * 0.06, 0.30 + rnd() * 0.2, 0.12 + rnd() * 0.09),
          roughness: 0.75, metalness: 0.0, side: T.DoubleSide
        });
        const m = new T.Mesh(geo, mat);
        m.position.set(spots[s][0] * hw + (rnd() - 0.5) * 0.07, GRAVEL_Y, spots[s][1] * hd + (rnd() - 0.5) * 0.06);
        m.rotation.y = rnd() * 6.28;
        m.castShadow = true;
        scene.add(m);
        plants.push({ mesh: m, phase: rnd() * 6.28, baseX: m.rotation.z, amp: 0.02 + rnd() * 0.03 });
      }
    }
  })();

  /* =========================== 水体 =========================== */
  const optics = window.FloatOptics.createWater(renderer, scene, camera, IN_W, IN_D, WATER_Y, { sun: key, ambient });
  const water = optics.mesh;
  const meniscus = window.FloatOptics.createMeniscus(scene);

  // 原水体盒也按真实深度积分吸收/散射，不再仅叠一层几乎透明的颜色。
  const volMat = optics.volumeMaterial;
  const waterVol = new T.Mesh(new T.BoxGeometry(IN_W, WATER_Y - 0.004, IN_D), volMat);
  waterVol.position.y = (WATER_Y - 0.004) / 2;
  waterVol.renderOrder = 3;
  scene.add(waterVol);

  /* 水底焦散（两层缓慢错动，最便宜的"水感"） */
  const causticTex = (function () {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 512;
    const g = c.getContext('2d');
    g.fillStyle = '#000';
    g.fillRect(0, 0, 512, 512);
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 220; i++) {
      const x = Math.random() * 512, y = Math.random() * 512;
      const rx = 6 + Math.random() * 30, ry = rx * (0.35 + Math.random() * 0.5);
      const rg = g.createRadialGradient(x, y, 0, x, y, rx);
      rg.addColorStop(0, 'rgba(230,235,195,' + (0.10 + Math.random() * 0.16).toFixed(3) + ')');
      rg.addColorStop(1, 'rgba(230,235,195,0)');
      g.save();
      g.translate(x, y); g.scale(1, ry / rx); g.translate(-x, -y);
      g.fillStyle = rg;
      g.beginPath(); g.arc(x, y, rx, 0, 6.283); g.fill();
      g.restore();
    }
    const t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.set(2.2, 1.4);
    t.colorSpace = T.SRGBColorSpace;
    return t;
  })();

  const causticTex2 = causticTex.clone();
  causticTex2.needsUpdate = true;
  causticTex2.repeat.set(1.7, 1.1);

  const causticA = new T.Mesh(
    new T.PlaneGeometry(IN_W, IN_D),
    new T.MeshBasicMaterial({
      map: causticTex, transparent: true, blending: T.AdditiveBlending,
      depthWrite: false, opacity: 0.5
    })
  );
  causticA.rotation.x = -Math.PI / 2;
  causticA.position.y = GRAVEL_Y + 0.0015;
  causticA.renderOrder = 2;
  scene.add(causticA);

  const causticB = new T.Mesh(
    new T.PlaneGeometry(IN_W * 0.9, IN_D * 0.9),
    new T.MeshBasicMaterial({
      map: causticTex2, transparent: true, blending: T.AdditiveBlending,
      depthWrite: false, opacity: 0.30
    })
  );
  causticB.rotation.x = -Math.PI / 2;
  causticB.position.set(0.03, GRAVEL_Y + 0.002, 0.02);
  causticB.renderOrder = 2;
  scene.add(causticB);

  /* =========================== 浮漂 =========================== */
  function makeBodyTexture() {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 512;
    const g = c.getContext('2d');
    const lg = g.createLinearGradient(0, 0, 0, 512);
    lg.addColorStop(0, '#8f5722');
    lg.addColorStop(0.5, '#c2843c');
    lg.addColorStop(1, '#b3762f');
    g.fillStyle = lg;
    g.fillRect(0, 0, 512, 512);
    const rnd = (function (a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })(11);
    for (let i = 0; i < 520; i++) {
      const x = rnd() * 512;
      const a = 0.03 + rnd() * 0.1;
      g.strokeStyle = rnd() < 0.35
        ? 'rgba(255,238,200,' + a + ')'
        : 'rgba(96,56,18,' + a + ')';
      g.lineWidth = 0.5 + rnd() * 2.6;
      g.beginPath();
      g.moveTo(x, 0);
      g.bezierCurveTo(x + (rnd() - 0.5) * 10, 170, x + (rnd() - 0.5) * 10, 340, x + (rnd() - 0.5) * 14, 512);
      g.stroke();
    }
    // 肩部漆环（贴图顶部 = 漂身上端）
    g.fillStyle = '#12121a';
    g.fillRect(0, 6, 512, 26);
    g.fillStyle = '#b02518';
    g.fillRect(0, 38, 512, 16);
    g.fillStyle = '#12121a';
    g.fillRect(0, 480, 512, 14);
    const tex = new T.CanvasTexture(c);
    tex.colorSpace = T.SRGBColorSpace;
    tex.wrapS = T.RepeatWrapping;
    return tex;
  }

  function makeTipTexture() {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 512;
    const g = c.getContext('2d');
    g.fillStyle = '#f2f0e6';
    g.fillRect(0, 0, 64, 512);
    // 顶端 = 贴图顶部（LatheGeometry 的 v=1 对应 points 末端 = 漂尾顶端）
    const nBand = S_BODY0 / BAND, bh = 512 / nBand;
    for (let i = 0; i < Math.ceil(nBand); i++) {
      const y = i * bh;
      const col = i % 2 === 0 ? '#f42a06' : '#c9ef1a';
      g.fillStyle = col;
      g.fillRect(0, y, 64, bh);
      g.fillStyle = 'rgba(12,12,16,0.85)';
      g.fillRect(0, y + bh - 2.2, 64, 2.2);
    }
    const tex = new T.CanvasTexture(c);
    tex.colorSpace = T.SRGBColorSpace;
    return tex;
  }

  function lathePts(sBottom, sTop, n) {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const s = sBottom + (sTop - sBottom) * (i / n);
      pts.push(new T.Vector2(Math.max(0.00025, floatRadius(s)), -s));
    }
    pts.unshift(new T.Vector2(0, -sBottom));
    pts.push(new T.Vector2(0, -sTop));
    return pts;
  }

  function floatGeometry(sBottom,sTop,n,segments) {
    const geometry=new T.LatheGeometry(lathePts(sBottom,sTop,n),segments);
    const pos=geometry.attributes.position,uv=geometry.attributes.uv;
    // Lathe caps add vertex rows; map paint to actual metres, not row indices.
    for(let i=0;i<pos.count;i++)uv.setY(i,(pos.getY(i)+sBottom)/(sBottom-sTop));
    return geometry;
  }

  const floatGroup = new T.Group();
  floatGroup.position.copy(vec(rigState.nodes.floatTop));
  scene.add(floatGroup);

  (function buildFloat() {
    // 漂尾
    const tipMat = new T.MeshPhysicalMaterial({
      map: makeTipTexture(), roughness: 0.30, metalness: 0.0,
      clearcoat: 0.7, clearcoatRoughness: 0.2,
      emissive: 0xffffff, emissiveIntensity: 0.025,
      emissiveMap: makeTipTexture()
    });
    const tip = new T.Mesh(floatGeometry(S_BODY0, 0, 40, 28), tipMat);
    tip.castShadow = true;
    floatGroup.add(tip);

    // 漂身
    const bodyMat = new T.MeshPhysicalMaterial({
      map: makeBodyTexture(), color: 0xffb877, roughness: 0.30, metalness: 0.0,
      clearcoat: 0.85, clearcoatRoughness: 0.10, envMapIntensity: 0.55
    });
    const body = new T.Mesh(floatGeometry(S_BODY1, S_BODY0, 64, 40), bodyMat);
    body.castShadow = true;
    floatGroup.add(body);

    // 漂脚
    const legMat = new T.MeshPhysicalMaterial({
      color: 0x14161b, roughness: 0.30, metalness: 0.35,
      clearcoat: 0.8, clearcoatRoughness: 0.15
    });
    const leg = new T.Mesh(floatGeometry(F_LEN, S_BODY1, 24, 18), legMat);
    leg.castShadow = true;
    floatGroup.add(leg);

    // 漂尾根部的金属座
    const collar = new T.Mesh(
      new T.CylinderGeometry(0.00086, 0.00087, 0.001, 24),
      new T.MeshStandardMaterial({ color: 0x1b1e24, roughness: 0.35, metalness: 0.7 })
    );
    collar.position.y = -S_BODY0 + 0.0005;
    floatGroup.add(collar);
  })();

  /* 左侧观漂：同一副浮漂几何、同一个物理快照，独立固定视角。 */
  // Observation window pans to the float with a 1.2 s delay so horizontal
  // movement stays visible instead of being cancelled by instant re-centring.
  const SCOPE_FOLLOW_DELAY_S=1.2;
  const floatScope = window.FloatScope.create({THREE:T,renderer,scene,source:floatGroup,
    floatLength:F_LEN,tipLength:S_BODY0,bandLength:BAND,waterY:WATER_Y,followDelay:SCOPE_FOLLOW_DELAY_S,
    beforeRender:(viewCamera,viewport)=>optics.capture([waterVol,meniscus,arrowB,arrowW,arrowR],viewCamera,viewport),
    afterRender:()=>optics.bindCamera(camera)});
  function positionFloatScope() {
    const panel=document.getElementById('floatScope'),hud=document.getElementById('hud').getBoundingClientRect();
    const bar=document.getElementById('observationBar').getBoundingClientRect();
    const mobile=innerWidth<=620, gap=mobile?10:12;
    if(panel.dataset.expanded==='true'){
      const height=Math.max(100,Math.min(720,bar.top-gap*2));
      const width=Math.max(100,Math.min(760,innerWidth-gap*2,height*.9));
      panel.style.left=((innerWidth-width)/2)+'px';panel.style.top=gap+'px';
      panel.style.width=width+'px';panel.style.height=height+'px';
      return;
    }
    let left=hud.left,top=hud.bottom+gap,width=mobile?Math.min(148,hud.width):hud.width;
    let room=bar.top-top-14;
    // A short landscape screen cannot stack two panels; keep the window in
    // the left-hand area, beside the HUD and below the collapsed More button.
    if(room<155){
      left=hud.right+gap;width=Math.min(164,innerWidth-left-12);
      const more=document.getElementById('physicsPanel');
      top=hud.top;
      if(!more.open){const r=more.getBoundingClientRect();if(left+width>r.left)top=Math.max(top,r.bottom+gap);}
      room=bar.top-top-14;
    }
    panel.style.left=left+'px';panel.style.top=top+'px';
    panel.style.width=Math.max(100,width)+'px';
    panel.style.height=Math.max(110,Math.min(mobile?320:400,room))+'px';
  }
  const scopePanel=document.getElementById('floatScope'),scopeZoom=document.getElementById('floatScopeZoom');
  function setScopeExpanded(expanded){
    scopePanel.dataset.expanded=String(expanded);
    scopeZoom.setAttribute('aria-expanded',String(expanded));
    scopeZoom.setAttribute('aria-label',expanded?'还原观漂小窗':'放大观漂小窗');
    scopeZoom.title=expanded?'还原 · 双击小窗或按 Esc':'放大 · 双击小窗';
    document.getElementById('floatScopeHint').textContent=expanded?'双击还原 · Esc 退出':'双击放大 · 实时相机';
    positionFloatScope();floatScope.resize();
  }
  let scopeTouchStart=null,scopeLastTap=null,scopeTouchToggleAt=-Infinity;
  scopeZoom.addEventListener('click',()=>setScopeExpanded(scopePanel.dataset.expanded!=='true'));
  scopePanel.addEventListener('dblclick',event=>{
    event.preventDefault();
    if(event.target.closest('button')||performance.now()-scopeTouchToggleAt<650)return;
    setScopeExpanded(scopePanel.dataset.expanded!=='true');
  });
  scopePanel.addEventListener('pointerdown',event=>{
    if(event.pointerType==='touch'&&event.isPrimary!==false&&!event.target.closest('button'))scopeTouchStart={id:event.pointerId,x:event.clientX,y:event.clientY,time:performance.now()};
  });
  scopePanel.addEventListener('pointercancel',()=>{scopeTouchStart=null;scopeLastTap=null;});
  scopePanel.addEventListener('pointerup',event=>{
    const start=scopeTouchStart;scopeTouchStart=null;
    if(event.pointerType!=='touch'||!start||start.id!==event.pointerId)return;
    const now=performance.now();
    if(now-start.time>350||Math.hypot(event.clientX-start.x,event.clientY-start.y)>12){scopeLastTap=null;return;}
    if(scopeLastTap&&now-scopeLastTap.time<320&&Math.hypot(event.clientX-scopeLastTap.x,event.clientY-scopeLastTap.y)<24){
      scopeTouchToggleAt=now;scopeLastTap=null;setScopeExpanded(scopePanel.dataset.expanded!=='true');
    }else scopeLastTap={x:event.clientX,y:event.clientY,time:now};
  });
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&scopePanel.dataset.expanded==='true')setScopeExpanded(false);});
  const scopeLayoutObserver=new ResizeObserver(positionFloatScope);
  scopeLayoutObserver.observe(document.getElementById('hud'));

  /* 所有线段均取自同一物理快照。实径圆管与一像素示意高亮分离，
     不增粗参与排水/质量计算的鱼线，不另加装饰性“竿线”。 */
  const NA = 64;
  function sampleCurve(points, n = NA) {
    const lengths = [0];
    for (let i=1;i<points.length;i++) lengths.push(lengths[i-1]+vec(points[i]).distanceTo(vec(points[i-1])));
    const total=lengths[lengths.length-1], out=[];
    let j=1;
    for(let i=0;i<n;i++) {
      const d=total*i/(n-1);
      while(j<lengths.length-1&&lengths[j]<d)j++;
      const u=(d-lengths[j-1])/Math.max(1e-12,lengths[j]-lengths[j-1]);
      out.push(vec(points[j-1]).lerp(vec(points[j]),u));
    }
    return out;
  }

  // 圆管网格（顶点可每帧更新，避免反复新建几何体）
  function makeTube(n, radial, radius) {
    const geo = new T.BufferGeometry();
    const count = n * radial;
    const pos = new Float32Array(count * 3);
    const nor = new Float32Array(count * 3);
    const uv = new Float32Array(count * 2);
    const idx = [];
    for (let i = 0; i < n - 1; i++) {
      for (let j = 0; j < radial; j++) {
        const j2 = (j + 1) % radial;
        const a = i * radial + j, b = i * radial + j2;
        const c = (i + 1) * radial + j, d = (i + 1) * radial + j2;
        idx.push(a, c, b, b, c, d);
      }
    }
    for (let i = 0; i < count; i++) {
      uv[i * 2] = (i % radial) / radial;
      uv[i * 2 + 1] = Math.floor(i / radial) / (n - 1);
    }
    geo.setIndex(idx);
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new T.BufferAttribute(nor, 3));
    geo.setAttribute('uv', new T.BufferAttribute(uv, 2));
    geo.boundingSphere = new T.Sphere(new T.Vector3(), 1);
    return geo;
  }

  function updateTube(geo, n, radial, pts, radius) {
    const pos = geo.attributes.position.array;
    const nor = geo.attributes.normal.array;
    let nx = 0, ny = 1, nz = 0;
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const pa = pts[Math.max(0, i - 1)];
      const pb = pts[Math.min(n - 1, i + 1)];
      let tx = pb.x - pa.x, ty = pb.y - pa.y, tz = pb.z - pa.z;
      const tl = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1e-7;
      tx /= tl; ty /= tl; tz /= tl;
      if (i === 0) {
        const ux = Math.abs(ty) > 0.9 ? 1 : 0;
        const uy = Math.abs(ty) > 0.9 ? 0 : 1;
        const dot = ux * tx + uy * ty;
        nx = ux - tx * dot; ny = uy - ty * dot; nz = -tz * dot;
      } else {
        const dot = nx * tx + ny * ty + nz * tz;
        nx -= tx * dot; ny -= ty * dot; nz -= tz * dot;
      }
      const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1e-7;
      nx /= nl; ny /= nl; nz /= nl;
      const bx = ty * nz - tz * ny, by = tz * nx - tx * nz, bz = tx * ny - ty * nx;
      for (let j = 0; j < radial; j++) {
        const a = j / radial * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        const ox = nx * ca + bx * sa, oy = ny * ca + by * sa, oz = nz * ca + bz * sa;
        const k = (i * radial + j) * 3;
        pos[k] = p.x + ox * radius;
        pos[k + 1] = p.y + oy * radius;
        pos[k + 2] = p.z + oz * radius;
        nor[k] = ox; nor[k + 1] = oy; nor[k + 2] = oz;
      }
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.normal.needsUpdate = true;
  }

  // 鱼线材质：尼龙/氟碳线，半透明 + 强环境反射
  const lineMat = new T.MeshPhysicalMaterial({
    color: 0xcbd5cc, roughness: 0.18, metalness: 0,
    transparent: true, opacity: 0.60, clearcoat: 1, clearcoatRoughness: 0.05,
    envMapIntensity: 1.15, side: T.DoubleSide, depthWrite: false
  });

  function makeStrand(isSub, color, samples = NA) {
    const tube=new T.Mesh(makeTube(samples,6,.0001),lineMat);
    // Underwater strands must be composited by the water volume (renderOrder 3,
    // an opaque screen-space medium). Drawing them after it put the line over the
    // opaque water at 0% clarity, so the rig stayed visible when nothing below the
    // surface should be. Tube/guide now render before the volume; the capture pass
    // still contains them, so 35%/100% clarity shows them attenuated/correctly.
    tube.renderOrder=1; tube.frustumCulled=false;
    const geometry=new T.BufferGeometry();
    geometry.setAttribute('position',new T.BufferAttribute(new Float32Array(samples*3),3));
    const guide=new T.Line(geometry,new T.LineBasicMaterial({color,transparent:true,opacity:.30,depthWrite:false}));
    guide.renderOrder=2;guide.frustumCulled=false;
    scene.add(tube,guide);
    return {tube,guide,isSub,samples};
  }
  // 接水弯曲用更密的同源采样，避免把物理圆弧重新画成少数折线段。
  const strands={wind:makeStrand(false,0xaddace,256),upper:makeStrand(false,0xa0c8bc),lower:makeStrand(false,0xa0c8bc),
    leaders:[makeStrand(true,0xd3c999),makeStrand(true,0xd3c999)]};
  const rubberMat=new T.MeshPhysicalMaterial({color:0x161d1c,roughness:.60,clearcoat:.15});
  const metalMat=new T.MeshStandardMaterial({color:0xaab5bd,roughness:.32,metalness:.9});
  const floatSeat=new T.Group();
  const socket=new T.Mesh(new T.LatheGeometry([
    new T.Vector2(.00068,.001),new T.Vector2(.00068,-.0049),new T.Vector2(.0011,-.0049),
    new T.Vector2(.0011,.001),new T.Vector2(.00068,.001)],24),rubberMat);
  floatSeat.add(socket);
  const seatEye=new T.Mesh(new T.TorusGeometry(.0009,.000346,8,20),rubberMat);
  // 线孔与求解器的漂座承力点共点；毫米级座内走线按理想点接头处理。
  seatEye.rotation.x=Math.PI/2;floatSeat.add(seatEye);scene.add(floatSeat);
  // 1250 kg/m³ 配件：六颗椭球豆各约2 mg；空心漂座与线眼合计约20 mg。
  function makeBean(){const bean=new T.Mesh(new T.SphereGeometry(1,16,12),rubberMat);bean.scale.set(.0006,.001061,.0006);scene.add(bean);return bean;}
  const floatBeans=Array.from({length:4},makeBean), leadBeans=Array.from({length:2},makeBean);

  // 固定竿尖是主线的边界条件；竿身为几何参照，不另造弹簧拉力。
  const rodGroup=new T.Group();scene.add(rodGroup);
  const rodMesh=new T.Mesh(new T.BufferGeometry(),window.FloatOptics.addMicroSurface(
    new T.MeshPhysicalMaterial({color:0x1a242a,metalness:.45,roughness:.32,clearcoat:1}),2600,.08));
  rodMesh.castShadow=true;rodGroup.add(rodMesh);
  const grip=new T.Mesh(new T.CylinderGeometry(.010,.012,.20,24),new T.MeshStandardMaterial({color:0x4b3927,roughness:.85}));
  rodGroup.add(grip);
  const rodEye=new T.Mesh(new T.TorusGeometry(.0032,.00055,10,24),metalMat);rodGroup.add(rodEye);
  let rodGeometryKey='';
  function syncRod(p){
    const key=[p.x,p.y,p.z].join(',');if(key===rodGeometryKey)return;rodGeometryKey=key;
    const tip=vec(p),butt=new T.Vector3(-1.16,Math.max(.99,p.y-.15),.13);
    const curve=new T.CatmullRomCurve3([butt,butt.clone().lerp(tip,.48).add(new T.Vector3(0,.035,0)),tip]);
    const pts=curve.getPoints(40), geo=makeTube(pts.length,12,.004);
    updateTube(geo,pts.length,12,pts,.004);
    // Taper each ring around its own centre, leaving the real mainline eye at the tip.
    const a=geo.attributes.position;
    for(let i=0;i<pts.length;i++){const f=1-.82*i/(pts.length-1);for(let j=0;j<12;j++){const k=i*12+j;
      a.setXYZ(k,pts[i].x+(a.getX(k)-pts[i].x)*f,pts[i].y+(a.getY(k)-pts[i].y)*f,pts[i].z+(a.getZ(k)-pts[i].z)*f);}}
    geo.computeVertexNormals();rodMesh.geometry.dispose();rodMesh.geometry=geo;rodMesh.frustumCulled=false;
    const axis=pts[8].clone().sub(butt).normalize();grip.position.copy(butt).addScaledVector(axis,.07);
    grip.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),axis);rodEye.position.copy(tip);
  }

  const leadGroup = new T.Group();
  scene.add(leadGroup);

  const leadMesh = new T.Mesh(
    new T.CylinderGeometry(1, 1, 1, 18),
    window.FloatOptics.addMicroSurface(new T.MeshPhysicalMaterial({ color: 0x727a80, roughness: 0.68, metalness: 0.8, envMapIntensity: 0.9 }), 2600, .16)
  );
  leadMesh.castShadow = true;
  leadGroup.add(leadMesh);

  // 铅皮座（塑料）
  const seatMesh = new T.Mesh(
    new T.LatheGeometry([
      new T.Vector2(.000506,.010),new T.Vector2(.000506,-.010),
      new T.Vector2(.0011,-.010),new T.Vector2(.0011,-.00975),
      new T.Vector2(.000905,-.00975),new T.Vector2(.000905,.00975),
      new T.Vector2(.0011,.00975),new T.Vector2(.0011,.010),new T.Vector2(.000506,.010)],24),
    new T.MeshStandardMaterial({ color: 0x1e2a26, roughness: 0.55, metalness: 0.1 })
  );
  leadGroup.add(seatMesh);

  // 独立八字环：主线止于上眼，两根子线都系在下眼。不是铅皮座的子对象。
  const swivelGroup=new T.Group();scene.add(swivelGroup);
  for(const y of [0,-.006]){const eye=new T.Mesh(new T.TorusGeometry(.00125,.00024,10,28),metalMat);eye.position.y=y;swivelGroup.add(eye);}
  const swivelBarrel=new T.Mesh(new T.CylinderGeometry(.00037,.00037,.0038,16),metalMat);
  swivelBarrel.position.y=-.003;swivelGroup.add(swivelBarrel);

  // 子线 + 钩 + 饵
  const hooks = [];
  for (let k = 0; k < 2; k++) {

    const hook = new T.Group();
    const hookMat = new T.MeshStandardMaterial({ color: 0xc8d6de, roughness: 0.3, metalness: 0.9 });
    const shank = new T.Mesh(new T.CylinderGeometry(0.00020, 0.00020, 0.012, 12), hookMat);
    shank.position.y = -0.006;
    hook.add(shank);
    const bend = new T.Mesh(new T.TorusGeometry(0.0035, 0.00020, 8, 24, Math.PI * 1.15), hookMat);
    bend.position.y = -0.012;
    bend.rotation.z = Math.PI * 0.55;
    hook.add(bend);
    // 饵料
    const bait = new T.Mesh(
      new T.SphereGeometry(0.0042, 24, 20),
      window.FloatOptics.addMicroSurface(new T.MeshStandardMaterial({ color: 0x987143, roughness: 1 }), 3600, .35)
    );
    bait.position.set(k?.0025:-.0025, -0.016, 0);
    hook.rotation.y=k?Math.PI:0;
    hook.add(bait);
    scene.add(hook);
    hooks.push(hook);
  }

  /* =========================== 交互 =========================== */
  function setLead(v) {
    if(!Number.isFinite(v))return;
    leadMass = Math.max(0, Math.min(LEAD_MAX, Math.round(v * 100) / 100));  // 精确到 0.01 g
    document.getElementById('precisionLead').value = leadMass.toFixed(2);
    configureRig({leadMassG:leadMass});rigState=rig.snapshot();currentEvaluation=rigState.evaluation;
    updateHUD();
  }

  /* =========================== 剪铅皮面板 =========================== */
  const LEAD_RESET = 5.0;
  const trimEl = document.getElementById('trim');
  const trimCanvas = document.getElementById('trimCanvas');
  const tctx = trimCanvas.getContext('2d');
  const trimValEl = document.getElementById('trimVal');

  let trimOpen = false;
  let trimMax = LEAD_RESET;      // 这块铅皮原本多重
  let trimKeep = LEAD_RESET;     // 目前保留多少
  let trimMouse = { x: -1, y: -1, in: false };
  let trimCutAnim = null;        // 掉落的碎片
  let trimDPR = 1;
  let splashT = 0;

  function trimLayout() {
    const w = trimCanvas.clientWidth || 1200;
    const h = trimCanvas.clientHeight || 500;
    const sw = Math.min(w * 0.78, 1000);
    const sh = Math.max(64, Math.min(h * 0.22, 118));
    return { w: w, h: h, x0: (w - sw) / 2, y0: h * 0.34, sw: sw, sh: sh };
  }

  function resizeTrim() {
    trimDPR = Math.min(window.devicePixelRatio || 1, 2);
    const w = trimCanvas.clientWidth || 1;
    const h = trimCanvas.clientHeight || 1;
    trimCanvas.width = Math.max(1, Math.round(w * trimDPR));
    trimCanvas.height = Math.max(1, Math.round(h * trimDPR));
    tctx.setTransform(trimDPR, 0, 0, trimDPR, 0, 0);
  }

  function openTrim() {
    closeSeatEditor();
    trimMax = Math.round(leadMass * 100) / 100;
    trimKeep = trimMax;
    trimCutAnim = null;
    trimOpen = true;
    trimEl.classList.add('on');
    controls.enabled = false;
    trimValEl.textContent = trimKeep.toFixed(2);
    resizeTrim();
  }

  function closeTrim() {
    trimOpen = false;
    trimEl.classList.remove('on');
    controls.enabled = true;
  }

  // “重置落水”只重置初态；提竿通过移动真实的固定竿尖边界传递张力。
  let castPhase = 0;
  function recast() {
    rig.reset({cast:true});fishSimulation.rebase();castPhase=0;splashT=.45;
    syncRig();updateHUD();
  }

  document.getElementById('btnReset').addEventListener('click', function () {
    setLead(LEAD_RESET);
    recast();
  });
  document.getElementById('btnTrim').addEventListener('click', openTrim);
  document.getElementById('trimDone').addEventListener('click', function () {
    setLead(trimKeep);
    closeTrim();
    recast();
  });
  document.getElementById('trimCancel').addEventListener('click', closeTrim);
  document.getElementById('trimRestore').addEventListener('click', function () {
    trimMax = LEAD_RESET;
    trimKeep = LEAD_RESET;
    trimCutAnim = null;
    trimValEl.textContent = trimKeep.toFixed(2);
  });

  trimCanvas.addEventListener('pointermove', function (e) {
    const r = trimCanvas.getBoundingClientRect();
    trimMouse.x = e.clientX - r.left;
    trimMouse.y = e.clientY - r.top;
    trimMouse.in = true;
  });
  trimCanvas.addEventListener('pointerleave', function () { trimMouse.in = false; });
  trimCanvas.addEventListener('pointerdown', function (e) {
    const L = trimLayout();
    const r = trimCanvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    let w = ((x - L.x0) / L.sw) * trimMax;
    w = Math.max(0, Math.min(trimMax, w));
    w = Math.round(w * 100) / 100;
    if (trimMax <= 0 || w >= trimKeep - 0.005) return;      // 只能往小里剪
    trimCutAnim = { from: w, to: trimKeep, t: 0 };
    trimKeep = w;
    trimValEl.textContent = trimKeep.toFixed(2);
  });

  // 剪刀图标
  function drawScissors(g, x, y) {
    g.save();
    g.translate(x, y);
    g.scale(1.22, 1.22);
    g.rotate(-0.12);
    g.shadowColor = 'rgba(0,0,0,0.6)';
    g.shadowBlur = 6;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.strokeStyle = 'rgba(228,242,250,0.95)';
    g.lineWidth = 2.2;
    // 刀片
    g.beginPath(); g.moveTo(-1, -2.5); g.lineTo(19, -8); g.stroke();
    g.beginPath(); g.moveTo(-1, 2.5); g.lineTo(19, 8); g.stroke();
    // 交叉手柄
    g.beginPath(); g.moveTo(-1, -2.5); g.quadraticCurveTo(-10, -6, -15, -11); g.stroke();
    g.beginPath(); g.moveTo(-1, 2.5); g.quadraticCurveTo(-10, 6, -15, 11); g.stroke();
    // 指环
    g.beginPath(); g.arc(-17.5, -12.5, 4.2, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(-17.5, 12.5, 4.2, 0, Math.PI * 2); g.stroke();
    // 轴
    g.beginPath(); g.arc(0, 0, 1.6, 0, Math.PI * 2);
    g.fillStyle = 'rgba(228,242,250,0.95)';
    g.fill();
    g.restore();
  }

  function drawTrim(dt) {
    const L = trimLayout();
    const g = tctx;
    g.clearRect(0, 0, L.w, L.h);

    if (trimCutAnim) {
      trimCutAnim.t += dt * 2.2;
      if (trimCutAnim.t >= 1) trimCutAnim = null;
    }

    const safeMax = Math.max(0.01, trimMax);
    const keepW = L.sw * (trimKeep / safeMax);
    const wAt = function (px) { return ((px - L.x0) / L.sw) * trimMax; };
    const xAt = function (w) { return L.x0 + L.sw * (w / safeMax); };

    // 鼠标对应的重量（吸附 0.01 g）
    let cutW = Math.max(0, Math.min(trimMax, wAt(trimMouse.x)));
    cutW = Math.round(cutW * 100) / 100;
    const canCut = trimMouse.in && cutW < trimKeep - 0.004;

    /* --- 被剪掉的部分（虚影） --- */
    g.save();
    g.beginPath();
    g.rect(L.x0 + keepW, L.y0, L.sw - keepW, L.sh);
    g.fillStyle = 'rgba(150,190,210,0.055)';
    g.fill();
    g.setLineDash([5, 6]);
    g.strokeStyle = 'rgba(150,200,220,0.22)';
    g.lineWidth = 1;
    g.strokeRect(L.x0 + keepW, L.y0, L.sw - keepW, L.sh);
    g.restore();

    /* --- 铅皮本体 --- */
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.6)';
    g.shadowBlur = 26;
    g.shadowOffsetY = 10;
    const mg = g.createLinearGradient(0, L.y0, 0, L.y0 + L.sh);
    mg.addColorStop(0.00, '#8d99a3');
    mg.addColorStop(0.07, '#dfe8ee');
    mg.addColorStop(0.22, '#c3ced6');
    mg.addColorStop(0.45, '#a4b0b9');
    mg.addColorStop(0.62, '#7b8790');
    mg.addColorStop(0.80, '#98a4ad');
    mg.addColorStop(0.94, '#cbd5dc');
    mg.addColorStop(1.00, '#6f7b84');
    g.fillStyle = mg;
    g.beginPath();
    g.rect(L.x0, L.y0, Math.max(1, keepW), L.sh);
    g.fill();
    g.restore();

    // 金属纹理：竖向压痕 + 两端切边
    g.save();
    g.beginPath();
    g.rect(L.x0, L.y0, Math.max(1, keepW), L.sh);
    g.clip();
    const rnd = (function (a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })(3);
    for (let i = 0; i < 90; i++) {
      const x = L.x0 + rnd() * Math.max(1, keepW);
      const a = 0.03 + rnd() * 0.07;
      g.strokeStyle = rnd() < 0.5 ? 'rgba(255,255,255,' + a + ')' : 'rgba(40,55,66,' + a + ')';
      g.lineWidth = 0.6 + rnd() * 1.6;
      g.beginPath(); g.moveTo(x, L.y0); g.lineTo(x + (rnd() - 0.5) * 2, L.y0 + L.sh); g.stroke();
    }
    for (let k = 1; k < 4; k++) {
      const yy = L.y0 + (L.sh * k) / 4;
      g.strokeStyle = 'rgba(30,44,54,0.16)';
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(L.x0, yy); g.lineTo(L.x0 + Math.max(1, keepW), yy); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.18)';
      g.beginPath(); g.moveTo(L.x0, yy + 1.2); g.lineTo(L.x0 + Math.max(1, keepW), yy + 1.2); g.stroke();
    }
    // 上下高光边
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fillRect(L.x0, L.y0, Math.max(1, keepW), 1.5);
    g.fillStyle = 'rgba(20,32,40,0.35)';
    g.fillRect(L.x0, L.y0 + L.sh - 2, Math.max(1, keepW), 2);
    g.restore();

    // 剪切端面
    g.fillStyle = 'rgba(235,248,255,0.85)';
    g.fillRect(L.x0 + keepW - 2, L.y0, 2, L.sh);

    /* --- 掉落碎片 --- */
    if (trimCutAnim) {
      const t = trimCutAnim.t;
      const x1 = xAt(trimCutAnim.from), x2 = xAt(trimCutAnim.to);
      g.save();
      g.globalAlpha = Math.max(0, 1 - t * 1.15);
      g.translate((x1 + x2) / 2, L.y0 + L.sh / 2 + t * t * 160);
      g.rotate(t * 0.5);
      const fg = g.createLinearGradient(0, -L.sh / 2, 0, L.sh / 2);
      fg.addColorStop(0, '#dbe4ea'); fg.addColorStop(0.5, '#a3aeb6'); fg.addColorStop(1, '#cdd6dc');
      g.fillStyle = fg;
      g.fillRect(-(x2 - x1) / 2, -L.sh / 2, x2 - x1, L.sh);
      g.restore();
    }

    /* --- 刻度 --- */
    const sy = L.y0 + L.sh + 26;
    g.strokeStyle = 'rgba(150,200,220,0.30)';
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(L.x0, sy); g.lineTo(L.x0 + L.sw, sy); g.stroke();

    g.font = '10px ui-sans-serif, -apple-system, "PingFang SC", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'top';
    const step = trimMax > 2 ? 0.1 : 0.05;
    for (let v = 0; v <= trimMax + 1e-9; v += step) {
      const x = xAt(v);
      const isMajor = Math.abs(v / 0.5 - Math.round(v / 0.5)) < 1e-6;
      const isMid = Math.abs(v / 0.1 - Math.round(v / 0.1)) < 1e-6;
      g.beginPath();
      g.moveTo(x, sy);
      g.lineTo(x, sy + (isMajor ? 13 : (isMid ? 8 : 5)));
      g.strokeStyle = isMajor ? 'rgba(180,220,238,0.75)' : 'rgba(150,200,220,0.35)';
      g.stroke();
      if (isMajor) {
        g.fillStyle = 'rgba(190,220,235,0.85)';
        g.fillText(v.toFixed(1), x, sy + 18);
      }
    }
    // 单位
    g.textAlign = 'left';
    g.fillStyle = 'rgba(160,200,215,0.5)';
    g.fillText('单位：g', L.x0, sy + 34);

    /* --- 剪切提示线 --- */
    if (canCut) {
      const cx = xAt(cutW);
      g.save();
      g.setLineDash([6, 5]);
      g.strokeStyle = 'rgba(127,230,200,0.9)';
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(cx, L.y0 - 26);
      g.lineTo(cx, sy + 4);
      g.stroke();
      g.restore();

      const label = '保留 ' + cutW.toFixed(2) + ' g';
      g.font = '600 12px ui-sans-serif, -apple-system, "PingFang SC", sans-serif';
      const tw = g.measureText(label).width;
      const lx = Math.min(L.x0 + L.sw - tw - 16, Math.max(L.x0, cx - tw / 2 - 8));
      const ly = L.y0 - 52;
      g.fillStyle = 'rgba(10,26,30,0.92)';
      g.strokeStyle = 'rgba(127,230,200,0.55)';
      g.lineWidth = 1;
      g.beginPath();
      g.rect(lx, ly, tw + 16, 24);
      g.fill(); g.stroke();
      g.fillStyle = 'rgba(200,255,240,0.95)';
      g.textBaseline = 'middle';
      g.fillText(label, lx + 8, ly + 12);
    }

    /* --- 剪刀 --- */
    if (trimMouse.in) drawScissors(g, trimMouse.x, trimMouse.y);
  }

  /* =========================== HUD =========================== */
  const elLead = document.getElementById('leadVal');
  const elExpo = document.getElementById('expoVal');
  const elExpoLabel = document.getElementById('expoLabel');
  const elState = document.getElementById('stateInfo');
  const elLine = document.getElementById('lineInfo');

  const arrowB=new T.ArrowHelper(new T.Vector3(0,1,0),new T.Vector3(),.06,0x8ae3c2,.009,.004);
  const arrowW=new T.ArrowHelper(new T.Vector3(0,-1,0),new T.Vector3(),.06,0xf4ad77,.009,.004);
  const arrowR=new T.ArrowHelper(new T.Vector3(0,1,0),new T.Vector3(),.05,0x99c4f5,.008,.003);
  scene.add(arrowB,arrowW,arrowR);
  function updateHUD() {
    const e=currentEvaluation, o=rigState.options,n=rigState.nodes;
    const vertical=n.floatTop.y-WATER_Y, degrees=e.tiltRad*180/Math.PI;
    const axial=vertical/Math.max(.001,Math.cos(e.tiltRad));
    const upright=degrees<20, inTip=upright&&vertical>=0&&axial<=S_BODY0;
    elLead.textContent=leadMass.toFixed(2)+' g';
    elExpoLabel.textContent=!upright?'漂体倾角':vertical<0?'漂尖没入':inTip?'露出漂目':'漂身出水';
    elExpo.textContent=!upright?degrees.toFixed(0):inTip?(axial/BAND).toFixed(1):(Math.abs(vertical)*1000).toFixed(0);
    document.getElementById('expoUnit').textContent=!upright?'°':inTip?'目':'mm';
    const taut=vec(n.rod).distanceTo(vec(n.floatFoot))>=(o.mainLength-o.floatToSwivel)*.998&&e.rodTensionN>.0002;
    const contact=e.contacts.lead?'铅座触底':e.contacts.hooks.every(Boolean)?'双钩触底':e.contacts.hooks.some(Boolean)?'单钩触底':'半水悬浮';
    const state=taut?'竿线绷紧 · 竿尖参与承重':contact+' · '+(o.leadLocked?'锁铅':'限定行程跑铅');
    elState.textContent=(paused?'暂停 · ':'')+state;
    document.getElementById('statusBadge').textContent=paused?'已暂停':taut?'竿线承重':e.contacts.lead?'铅到底':e.contacts.hooks.some(Boolean)?'钩触底':vertical<0?'漂没入':'半水';
    elLine.textContent='全线自重 '+(e.lineMassG*1000).toFixed(1)+' mg / 排水 '+(e.lineBuoyancyG*1000).toFixed(1)+' mg · 含水上风线';
    const text=(id,value)=>document.getElementById(id).textContent=value;
    const fixed=v=>v.toFixed(6);
    text('forceBuoyancy',fixed(e.buoyancyN));text('forceWeight',fixed(e.weightN));
    text('forceSupport',fixed(e.bottomSupportN));text('forceRod',fixed(e.rodReaction.y));
    text('forceSurface',fixed(e.surfaceSupportN||0));
    text('forceResidual',fixed(e.buoyancyN-e.weightN+e.bottomSupportN+e.rodReaction.y+(e.surfaceSupportN||0)));
    text('rigDetails','主线 '+(o.mainLength*100).toFixed(0)+' cm · 漂座以下 '+(o.floatToSwivel*100).toFixed(1)+' cm · 子线 '+o.leaderLengths.map(l=>(l*100).toFixed(1)).join(' / ')+' cm · 总排水 '+(e.displacedVolume*1e6).toFixed(3)+' mL');
    text('windLengthInfo',((o.mainLength-o.floatToSwivel)*100).toFixed(1)+' cm');
    text('tackleStatus',state);text('rodTension',(e.rodTensionN*1000).toFixed(3)+' mN');
    text('seatTension',(e.tension.upper*1000).toFixed(2)+' mN');
    text('leadTravelInfo',(rigState.leadCoordinate*100).toFixed(1)+' cm / '+(o.leadLocked?'两豆夹紧':'向上 '+(o.leadTravel*100).toFixed(1)+' cm 行程'));
    arrowB.visible=arrowW.visible=arrowR.visible=showForces;
    const base=vec(n.floatFoot).lerp(vec(n.floatTop),.40);
    arrowB.position.copy(base).add(new T.Vector3(-.025,0,0));arrowW.position.copy(base).add(new T.Vector3(.025,0,0));
    arrowB.setLength(Math.max(.008,Math.min(.16,e.buoyancyN*4)),.007,.003);
    arrowW.setLength(Math.max(.008,Math.min(.16,e.weightN*4)),.007,.003);
    arrowR.position.copy(vec(n.rod));
    if(e.rodTensionN>1e-10)arrowR.setDirection(vec(e.rodReaction).normalize());
    arrowR.setLength(Math.max(.01,Math.min(.14,e.rodTensionN*5)),.007,.003);
  }

  let cameraTween=null;
  // Main view was a 38° telephoto; a normal-lens field of view reads the tank more
  // naturally, while the close-up views keep their tighter framing.
  function viewFov(mode){
    const portrait=innerWidth/innerHeight<.8;
    if(mode==='tank')return portrait?52:45;
    if(mode==='angler')return portrait?50:44;
    return 38;
  }
  const VIEW_BUTTONS=[['Tank','tank'],['Float','float'],['Rig','rig'],['Angler','angler']];
  function setView(mode) {
    viewMode=mode;
    const n=rigState.nodes;
    const portrait=innerWidth/innerHeight<.8;
    camera.fov=viewFov(mode);camera.updateProjectionMatrix();
    let target,position;
    if(mode==='tank'){
      target=new T.Vector3(portrait?-.17:-.30,.72,0);
      position=new T.Vector3(portrait?-.05:.12,1.08,portrait?5.1:2.95);
    }else if(mode==='angler'){
      // Angler's seat: eye height at the bank, just left/front of the rod butt and
      // outside the front glass, looking out across the water at the float.
      // The offset is relative to the real float pose, so re-seating the float or
      // recasting keeps the same over-the-water framing.
      target=vec(n.floatFoot).lerp(vec(n.floatTop),.55);
      target.y=Math.max(WATER_Y+.02,target.y);
      position=target.clone().add(portrait?new T.Vector3(-1.45,.56,1.30):new T.Vector3(-1.25,.50,1.00));
    }else if(mode==='rig'){
      target=vec(n.lead).lerp(vec(n.hooks[1]),.40);target.y=Math.max(GRAVEL_Y+.075,target.y)+(portrait?.035:0);
      position=target.clone().add(new T.Vector3(.075,.075,portrait?.92:.65));
    }else{
      target=vec(n.floatFoot).lerp(vec(n.floatTop),.60);
      if(portrait)target.x-=.035;
      position=target.clone().add(new T.Vector3(.065,.04,portrait?.84:.67));
    }
    cameraTween={from:camera.position.clone(),to:position,a:controls.target.clone(),b:target,t:0,start:performance.now()};
    VIEW_BUTTONS.forEach(([key,id])=>{const btn=document.getElementById('btnView'+key);const active=id===mode;btn.classList.toggle('active',active);btn.setAttribute('aria-pressed',String(active));});
  }
  VIEW_BUTTONS.forEach(([key,id])=>document.getElementById('btnView'+key).addEventListener('click',()=>{closeSeatEditor();setView(id);}));
  // Take the rig to a separate workbench; the tank never acquires edit handles.
  const seatWorkshop=window.SeatWorkshop.create({
    getOptions:()=>rig.options,
    onOpen:mode=>{
      if(trimOpen)closeTrim();
      cameraTween=null;controls.enabled=false;
      document.getElementById('physicsPanel').open=false;
      for(const [id,m] of [['btnAdjustFloat','float'],['btnAdjustLead','lead']]){
        const button=document.getElementById(id),active=m===mode;
        button.setAttribute('aria-pressed',String(active));button.setAttribute('aria-expanded',String(active));
      }
    },
    onCommit:(mode,valueCm)=>{
      configureRig({[mode==='float'?'floatToSwivel':'leadAboveSwivel']:valueCm*.01});
      syncTackleInputs();recast();
    },
    onClose:()=>{
      controls.enabled=!trimOpen;
      for(const id of ['btnAdjustFloat','btnAdjustLead']){
        const button=document.getElementById(id);button.setAttribute('aria-pressed','false');button.setAttribute('aria-expanded','false');
      }
    }
  });
  function closeSeatEditor(){seatWorkshop.close();}
  for(const [id,mode] of [['btnAdjustFloat','float'],['btnAdjustLead','lead']]){
    document.getElementById(id).addEventListener('click',()=>seatWorkshop.open(mode));
  }
  function setPaused(value){
    paused=!!value;fishSimulation.setPaused(paused);
    document.getElementById('btnPause').textContent=paused?'继续模拟':'暂停';document.getElementById('btnPause').setAttribute('aria-pressed',String(paused));
    return paused;
  }
  document.getElementById('btnPause').addEventListener('click',()=>setPaused(!paused));
  document.getElementById('btnRecast').addEventListener('click',recast);
  document.getElementById('showForces').addEventListener('change',e=>showForces=e.target.checked);
  const waterTransparencyInput=document.getElementById('waterTransparency');
  function updateWaterTransparency(){
    const raw=Number(waterTransparencyInput.value);
    const percent=Math.round(optics.setSurfaceTransparency(raw/100)*100);
    waterTransparencyInput.value=String(percent);
    document.getElementById('waterTransparencyVal').textContent=percent+'%';
    waterTransparencyInput.setAttribute('aria-valuetext',percent+'%'+(percent===0?'，不透视水下':percent===100?'，清水演示':percent===35?'，湖水（默认）':''));
  }
  waterTransparencyInput.addEventListener('input',updateWaterTransparency);
  waterTransparencyInput.addEventListener('change',updateWaterTransparency);
  updateWaterTransparency();
  document.getElementById('precisionLead').value=leadMass.toFixed(2);
  document.getElementById('precisionLead').addEventListener('change',e=>setLead(Number(e.target.value)||0));
  function updateParameters(event){
    const val=id=>{const el=document.getElementById(id), n=Number(el.value);const v=Math.max(Number(el.min),Math.min(Number(el.max),Number.isFinite(n)?n:Number(el.defaultValue)));el.value=String(v);return v;};
    physicsOptions.lineMaterial=document.getElementById('lineMaterial').value;
    physicsOptions.mainDiameter=val('lineDiameter')*.001;
    physicsOptions.subDiameter=val('subDiameter')*.001;
    const temp=val('waterTemp');
    physicsOptions.waterDensity=1000*(1-((temp+288.9414)/(508929.2*(temp+68.12963)))*Math.pow(temp-3.9863,2));
    physicsOptions.baitMassG=val('baitMass');
    const fields={waterTemp:'waterDensity',lineMaterial:'lineMaterial',lineDiameter:'mainDiameter',subDiameter:'subDiameter',baitMass:'baitMassG'};
    const key=event&&fields[event.target.id];
    configureRig(key?{[key]:physicsOptions[key]}:physicsOptions);
    rigState=rig.snapshot();currentEvaluation=rigState.evaluation;
    updateHUD();
  }
  ['waterTemp','lineMaterial','lineDiameter','subDiameter','baitMass'].forEach(id=>document.getElementById(id).addEventListener('change',updateParameters));

  const rigFields={floatDepth:'floatToSwivel',leadPosition:'leadAboveSwivel'};
  function syncTackleInputs(){
    const o=rig.options;
    document.getElementById('leadPosition').max=String(Number(((o.floatToSwivel-.025)*100).toFixed(2)));
    for(const [id,key] of Object.entries({...rigFields,mainLength:'mainLength',leadTravel:'leadTravel'}))document.getElementById(id).value=String(Number((o[key]*100).toFixed(2)));
    for(const [id,index] of [['leaderShort',0],['leaderLong',1]])document.getElementById(id).value=String(o.leaderLengths[index]*100);
    document.getElementById('rodHeight').value=String(Number(((o.rodTip.y-(rodLifted?.55:0))*100).toFixed(2)));
    document.getElementById('rodReach').value=String(-o.rodTip.x*100);
    document.getElementById('leadLocked').checked=o.leadLocked;
    for(const id of ['floatDepth','leadPosition','leadTravel'])document.getElementById(id+'Val').textContent=Number(document.getElementById(id).value).toFixed(1);
    document.getElementById('leadTravel').disabled=o.leadLocked;
    document.getElementById('btnLiftRod').textContent=rodLifted?'放回竿尖':'提竿 55 cm';
    document.getElementById('btnLiftRod').setAttribute('aria-pressed',String(rodLifted));
  }
  function updateTackleParameters(event){
    const value=id=>{const el=document.getElementById(id),v=Number(el.value);return Math.max(Number(el.min),Math.min(Number(el.max),Number.isFinite(v)?v:Number(el.defaultValue)))*.01;};
    const changed=event&&event.target.id,patch={};
    for(const [id,key] of Object.entries(rigFields))if(changed===id)patch[key]=value(id);
    if(changed==='leadLocked'){
      patch.leadLocked=document.getElementById('leadLocked').checked;
      if(patch.leadLocked)patch.leadAboveSwivel=rigState.leadCoordinate;
    }
    configureRig(patch);rigState=rig.snapshot();currentEvaluation=rigState.evaluation;
    syncTackleInputs();updateHUD();
  }
  for(const id of Object.keys(rigFields)){
    const input=document.getElementById(id);input.addEventListener(input.type==='range'?'input':'change',updateTackleParameters);
  }
  document.getElementById('leadLocked').addEventListener('change',updateTackleParameters);
  document.getElementById('showGuides').addEventListener('change',e=>{showGuides=e.target.checked;syncRig();});
  document.getElementById('btnLiftRod').addEventListener('click',()=>{
    configureRig({rodTip:{...rig.options.rodTip,y:rig.options.rodTip.y+(rodLifted?-.55:.55)}});
    rodLifted=!rodLifted;rigState=rig.snapshot();currentEvaluation=rigState.evaluation;syncTackleInputs();updateHUD();
  });
  document.getElementById('btnRigReset').addEventListener('click',()=>{
    rodLifted=false;configureRig(window.TaiwanRig.defaults);leadMass=rig.options.leadMassG;
    Object.assign(physicsOptions,{lineMaterial:'nylon',mainDiameter:.00022,subDiameter:.00016,baitMassG:.34,waterDensity:998.23});
    for(const [id,value] of Object.entries({lineMaterial:'nylon',lineDiameter:.22,subDiameter:.16,baitMass:.34,waterTemp:20,precisionLead:4}))document.getElementById(id).value=value;
    syncTackleInputs();recast();setView('tank');
  });
  if(matchMedia('(max-width: 620px)').matches)document.getElementById('physicsPanel').open=false;

  /* =========================== 动画 =========================== */
  const clock = new T.Clock();
  let t = 0;
  let floatY = floatGroup.position.y;
  let floatVY = 0;
  const tmpV = new T.Vector3();

  function updateWater(time) {
    optics.update(time,splashT,floatGroup.position);
    const n=rigState.nodes,axis=vec(n.floatTop).sub(vec(n.floatFoot));
    const u=(WATER_Y-n.floatFoot.y)/axis.y;
    meniscus.visible=Math.abs(axis.y)>.065&&u>0&&u<1;
    if(meniscus.visible){
      const p=vec(n.floatFoot).addScaledVector(axis,u),r=floatRadius((1-u)*F_LEN);
      meniscus.scale.set(r*F_LEN/Math.abs(axis.y),.0012,r);
      meniscus.rotation.y=-Math.atan2(axis.z,axis.x);
      meniscus.position.set(p.x,WATER_Y+.00005,p.z);
    }
  }

  function syncRig() {
    rigState=rig.snapshot();currentEvaluation=rigState.evaluation;
    const n=rigState.nodes,o=rigState.options,up=new T.Vector3(0,1,0);
    floatY=n.floatTop.y;floatVY=rigState.velocityY;
    const axis=vec(n.floatTop).sub(vec(n.floatFoot)).normalize();
    floatGroup.position.copy(vec(n.floatTop));floatGroup.quaternion.setFromUnitVectors(up,axis);
    floatSeat.position.copy(vec(n.floatFoot));floatSeat.quaternion.copy(floatGroup.quaternion);
    function strand(item,curve){
      const points=sampleCurve(curve,item.samples),radius=(item.isSub?o.subDiameter:o.mainDiameter)/2;
      updateTube(item.tube.geometry,item.samples,6,points,radius);
      const a=item.guide.geometry.attributes.position;
      for(let i=0;i<item.samples;i++)a.setXYZ(i,points[i].x,points[i].y,points[i].z);
      a.needsUpdate=true;item.guide.visible=showGuides;
    }
    for(const key of ['wind','upper','lower'])strand(strands[key],rigState.curves[key]);
    for(let k=0;k<2;k++)strand(strands.leaders[k],rigState.curves.leaders[k]);
    function tangentAt(p,curves){
      let best=Infinity,tangent=up;
      for(const curve of curves)for(let i=1;i<curve.length;i++){
        const a=vec(curve[i-1]),b=vec(curve[i]),d=Math.min(a.distanceToSquared(vec(p)),b.distanceToSquared(vec(p)));
        if(d<best&&a.distanceToSquared(b)>1e-15){best=d;tangent=b.sub(a).normalize();}
      }
      return tangent;
    }
    for(let i=0;i<floatBeans.length;i++){
      const p=rigState.markers.floatStops[i];floatBeans[i].position.copy(vec(p));
      floatBeans[i].quaternion.setFromUnitVectors(up,tangentAt(p,[rigState.curves.wind,rigState.curves.upper]));
    }
    for(let i=0;i<leadBeans.length;i++){
      const p=rigState.markers.leadStops[i];leadBeans[i].position.copy(vec(p));
      leadBeans[i].quaternion.setFromUnitVectors(up,tangentAt(p,[rigState.curves.upper,rigState.curves.lower]));
    }
    const dim=P.leadDimensions(leadMass);
    leadGroup.position.copy(vec(n.lead));
    leadGroup.quaternion.setFromUnitVectors(up,tangentAt(n.lead,[rigState.curves.upper]));
    leadMesh.visible=leadMass>0;
    if(leadMesh.userData.mass!==leadMass){
      leadMesh.geometry.dispose();
      const r=dim.radius,ri=dim.innerRadius,h=Math.max(.000001,dim.height);
      leadMesh.geometry=new T.LatheGeometry([new T.Vector2(ri,0),new T.Vector2(ri,-h),new T.Vector2(r,-h),new T.Vector2(r,0),new T.Vector2(ri,0)],48);
      leadMesh.userData.mass=leadMass;
    }
    leadMesh.position.y=dim.height/2;seatMesh.position.y=0;
    swivelGroup.position.copy(vec(n.swivel));
    for(let k=0;k<2;k++){
      hooks[k].position.copy(vec(n.hooks[k]));
      const bait=hooks[k].children[2];
      bait.scale.setScalar(o.baitRadius/.0042);bait.visible=o.baitMassG>0;
      bait.position.set(0,-P.constants.BAIT_OFFSET,0);
    }
    syncRod(n.rod);
    return rigState;
  }

  let lastPanelAt=-Infinity,lastPerformanceAt=-Infinity;
  const adaptivePerformance=window.FloatPerformance.create({
    devicePixelRatio:window.devicePixelRatio||1,
    onQuality:q=>{renderer.setPixelRatio(q.pixelRatio);optics.setQuality(q);resize();}
  });
  document.addEventListener('visibilitychange',()=>{
    adaptivePerformance.suspend(document.hidden);
    clock.getDelta(); // Background-tab suspension is not a slow rendering sample.
  });

  function animate() {
    const frameStart=performance.now();
    const refreshPanel=frameStart-lastPanelAt>=100;
    // The coordinator owns catch-up budgeting and reports dropped wall time.
    const realDt = clock.getDelta();
    // Drafts live entirely on the workbench. Freeze the tank without changing
    // the user's pause setting, and drain the clock to avoid a catch-up step.
    if(seatWorkshop.isOpen()){requestAnimationFrame(animate);return;}
    fishSimulation.setPaused(paused);
    const dt=fishSimulation.advance(realDt)*fishSimulation.fixedDt;
    t += dt;
    // Fixed physics clock; float transform only consumes original rig output.
    syncRig();
    const fishFrame=fishSimulation.snapshot(rigState,{includeHistory:refreshPanel});
    fishView.update({...fishFrame.fish,speed:Math.hypot(fishFrame.fish.velocity.x,fishFrame.fish.velocity.y,fishFrame.fish.velocity.z)});
    if(refreshPanel){fishPanel.update(fishFrame);lastPanelAt=frameStart;}


    // —— 缓慢的装饰性水草摆动（不向钓组施加虚构外力）
    for (let i = 0; i < plants.length; i++) {
      const p = plants[i];
      p.mesh.rotation.z = Math.sin(t * 0.9 + p.phase) * p.amp;
    }

    if (splashT > 0) splashT = Math.max(0, splashT - dt * 1.6);
    if (trimOpen) drawTrim(realDt);

    causticTex.offset.x = t * 0.014;
    causticTex.offset.y = Math.sin(t * 0.21) * 0.03 + t * 0.006;
    causticTex2.offset.x = -t * 0.017;
    causticTex2.offset.y = Math.cos(t * 0.17) * 0.02 - t * 0.009;

    updateWater(t);
    if(refreshPanel)updateHUD();

    controls.update();
    if(cameraTween){
      cameraTween.t=Math.min(1,(performance.now()-cameraTween.start)/500);
      const u=1-Math.pow(1-cameraTween.t,3);
      camera.position.copy(cameraTween.from).lerp(cameraTween.to,u);
      controls.target.copy(cameraTween.a).lerp(cameraTween.b,u);
      if(cameraTween.t===1)cameraTween=null;
      controls.update();
    }
    camera.updateMatrixWorld();
    // 线形辅助也进入水面透射/反射图；否则刚入水的弧线会被水面遮掉一截。
    renderer.shadowMap.needsUpdate=true;
    optics.capture([waterVol, meniscus, arrowB, arrowW, arrowR]);
    renderer.render(scene, camera);
    floatScope.render(rigState);
    adaptivePerformance.sample({intervalMs:realDt*1000,workMs:performance.now()-frameStart,now:frameStart});
    if(frameStart-lastPerformanceAt>=500){
      const p=adaptivePerformance.snapshot(),status=document.getElementById('performanceStatus');
      if(status)status.textContent=p.fps===null?'60 FPS目标 · 测量中':`${p.fps.toFixed(0)} FPS · 自动画质：${p.name}${p.belowTargetAtMinimum?' · 设备性能不足':''}`;
      lastPerformanceAt=frameStart;
    }
    requestAnimationFrame(animate);
  }

  /* =========================== 自适应 =========================== */
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    optics.resize(w,h);
    camera.aspect = w / h;
    // 竖屏时拉远一点，保证整缸可见
    camera.fov = viewFov(viewMode);
    camera.updateProjectionMatrix();
    positionFloatScope();
  }
  window.addEventListener('resize', function () { resize();if(!seatWorkshop.isOpen())setView(viewMode);else seatWorkshop.resize();if (trimOpen) resizeTrim(); });
  resize();

  function refreshFish(){syncRig();const s=fishSimulation.snapshot(rigState);fishView.update({...s.fish,speed:Math.hypot(s.fish.velocity.x,s.fish.velocity.y,s.fish.velocity.z)});updateHUD();return s;}
  const fishPanel=window.FishPanel.create({
    getState:()=>fishSimulation.snapshot(rigState),
    trigger:id=>{fishSimulation.trigger(id);return refreshFish();},
    configure:p=>fishSimulation.configure(p),
    configureRig:p=>{configureRig(p);syncTackleInputs();return refreshFish();},
    pause:value=>{setPaused(value===undefined?!paused:value);return refreshFish();},
    step:()=>{setPaused(true);if(!seatWorkshop.isOpen())fishSimulation.step();return refreshFish();},
    reset:()=>{fishSimulation.reset();return refreshFish();},
    setSpeed:value=>fishSimulation.setSpeed(value),
    setEnabled:value=>{fishSimulation.setEnabled(value);return refreshFish();}
  });
  updateParameters();syncTackleInputs();syncRig();
  setView('tank');
  await boot.stage('预热着色器、鱼纹理与双相机光学');
  boot.mark('gpu-prewarm-start');
  // Prewarm the normally hidden fish too: do not move startup stutter to its first bite.
  const initialFish=fishSimulation.snapshot(rigState,{includeHistory:false}).fish;
  fishView.update({...initialFish,enabled:true});
  if(renderer.compileAsync)await renderer.compileAsync(scene,camera);
  else renderer.compile(scene,camera);
  renderer.shadowMap.needsUpdate=true;
  optics.capture([waterVol,meniscus,arrowB,arrowW,arrowR]);
  renderer.render(scene,camera);
  floatScope.render(rigState);
  fishView.update(initialFish);
  boot.mark('gpu-prewarm-end');
  await boot.stage('绘制首个可交互场景');
  window.floatLab = {
    performance:{snapshot:()=>adaptivePerformance.snapshot()},
    physics:P,tackle:window.TaiwanRig,
    getState:()=>({...rig.snapshot(),topY:floatY,velocityY:floatVY,leadMass,castPhase,paused}),
    getRenderState:()=>({
      camera:{position:camera.position.toArray(),target:controls.target.toArray(),viewMode,transitioning:!!cameraTween},
      interaction:{dragging:null,rigPickingEnabled:false,orbitEnabled:controls.enabled},
      workshop:seatWorkshop.snapshot(),
      floatScope:floatScope.snapshot(),waterOptics:optics.snapshot(),fish:fishView.snapshot(),sceneUuid:scene.uuid,floatUuid:floatGroup.uuid,
      floatTop:floatGroup.position.toArray(),floatAxis:new T.Vector3(0,1,0).applyQuaternion(floatGroup.quaternion).toArray(),
      floatSeat:floatSeat.position.toArray(),lead:leadGroup.position.toArray(),swivel:swivelGroup.position.toArray(),
      hookPositions:hooks.map(h=>h.position.toArray()),swivelIndependent:swivelGroup.parent===scene,
      guides:[strands.wind,strands.upper,strands.lower,...strands.leaders].map(s=>s.guide.visible),
      windPoints:Array.from({length:strands.wind.samples},(_,i)=>{const a=strands.wind.guide.geometry.attributes.position;return {x:a.getX(i),y:a.getY(i),z:a.getZ(i)};}),
      lineRadii:[strands.wind,strands.upper,strands.lower,...strands.leaders].map(s=>{
        const p=s.guide.geometry.attributes.position,a=s.tube.geometry.attributes.position;
        return Math.hypot(a.getX(0)-p.getX(0),a.getY(0)-p.getY(0),a.getZ(0)-p.getZ(0));
      }),rodTip:rodEye.position.toArray(),beanPositions:{float:floatBeans.map(b=>b.position.toArray()),lead:leadBeans.map(b=>b.position.toArray())}
    }),
    projectPoint:p=>{const v=vec(p).project(camera);return {x:(v.x*.5+.5)*innerWidth,y:(-v.y*.5+.5)*innerHeight};},
    setLead,setView,recast,
    fish:{
      getState:()=>fishSimulation.snapshot(rigState),
      getRenderState:()=>fishView.snapshot(),
      trigger:id=>{fishSimulation.trigger(id);return refreshFish();},
      configure:patch=>fishSimulation.configure(patch),
      reset:()=>{fishSimulation.reset();return refreshFish();},
      setEnabled:value=>{fishSimulation.setEnabled(value);return refreshFish();},
      pause:(value=true)=>{setPaused(value);return refreshFish();},
      setSpeed:value=>fishSimulation.setSpeed(value),
      step:(ticks=1)=>{setPaused(true);if(!seatWorkshop.isOpen())fishSimulation.step(ticks);return refreshFish();}
    },
    configure:patch=>{
      configureRig(patch);const o=rig.options;leadMass=o.leadMassG;Object.assign(physicsOptions,patch);
      document.getElementById('precisionLead').value=leadMass.toFixed(2);
      for(const [id,value] of Object.entries({lineMaterial:o.lineMaterial,lineDiameter:o.mainDiameter*1000,subDiameter:o.subDiameter*1000,baitMass:o.baitMassG}))document.getElementById(id).value=String(value);
      syncTackleInputs();syncRig();updateHUD();return rigState;
    },
    settle:(seconds=20)=>{rig.settle(seconds);syncRig();updateHUD();return rigState;},renderer
  };
  updateHUD();
  animate();
  boot.mark('first-scene-frame');
})();
