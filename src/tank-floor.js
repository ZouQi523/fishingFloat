/* Single source for the unchanged seed-7 rendered sand/rocks and their collision triangles. */
(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.TankFloor=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const DEFAULTS=Object.freeze({width:1.62-.010*2,depth:.78-.010*2,bottomY:.055,waterY:.83,cellSize:.004,dilationCells:1,seed:7,pebbleCount:1500});
  const ALGORITHM='clipped-cell-max-y-dilate-v1';
  function parameters(options){const p={...DEFAULTS};for(const k of ['width','depth','bottomY','waterY'])if(options[k]!==undefined)p[k]=options[k];return p;}
  function matchesCache(cache,p){
    if(!cache||!cache.metadata||!cache.grid)return false;
    const m=cache.metadata,g=cache.grid,b=g.bounds;
    return m.schemaVersion===1&&m.algorithm===ALGORITHM&&['producerSHA256','algorithmSHA256','threeSHA256','gridSHA256'].every(k=>typeof m[k]==='string'&&/^[a-f0-9]{64}$/.test(m[k]))&&Object.keys(DEFAULTS).every(k=>m.params&&m.params[k]===p[k])&&b&&b.minX===-p.width/2&&b.maxX===p.width/2&&b.minZ===-.372&&b.maxZ===p.depth/2&&g.bottomY===p.bottomY&&g.waterY===p.waterY&&g.cellSize===p.cellSize&&g.dilationCells===p.dilationCells&&g.triangleCount===270540&&Number.isSafeInteger(g.rasterizedTriangles)&&g.rasterizedTriangles>=0&&g.rasterizedTriangles<=g.triangleCount;
  }
  function decodeGrid(cache){
    const text=cache.dataBase64;
    if(typeof text!=='string')throw new TypeError('terrain cache needs base64 Float64 bytes');
    const binary=typeof atob==='function'?atob(text):Buffer.from(text,'base64').toString('binary');
    if(binary.length%8||binary.length>4000000*8)throw new RangeError('invalid terrain cache byte length');
    const bytes=new Uint8Array(binary.length);for(let i=0;i<bytes.length;i++)bytes[i]=binary.charCodeAt(i);
    const view=new DataView(bytes.buffer),data=new Float64Array(bytes.length/8);
    for(let i=0;i<data.length;i++)data[i]=view.getFloat64(i*8,true);
    return {...cache.grid,data};
  }
  function create(options){
    const {THREE:T,scene,optics,collision,cache}=options,p=parameters(options),{width:IN_W,depth:IN_D,bottomY:GRAVEL_Y,waterY:WATER_Y}=p;
    if(!T||!scene||!optics||!collision)throw new TypeError('TankFloor.create needs THREE, scene, optics, collision');
    let cached=null;
    if(matchesCache(cache,p)){try{cached=collision.createHabitatFromGrid(decodeGrid(cache));}catch(_){/* Explicit safe fallback to original producer/rasterizer. */}}
    const record=!!options.recordTriangles||!cached,collisionTriangles=record?[]:null;
    const bed = new T.Mesh(
      new T.BoxGeometry(IN_W, 0.05, IN_D),
      optics.addMicroSurface(new T.MeshStandardMaterial({ color: 0x82745b, roughness: 0.97 }), 1300, .25)
    );
    bed.position.set(0, GRAVEL_Y - 0.025, 0);
    bed.receiveShadow = true;
    scene.add(bed);
    const geo = new T.IcosahedronGeometry(1, 2);
    function recordObstacle(matrix){
      if(!record)return;
      const positions=geo.attributes.position,v=new T.Vector3();
      for(let i=0;i<positions.count;i++){v.fromBufferAttribute(positions,i).applyMatrix4(matrix);collisionTriangles.push(v.x,v.y,v.z);}
    }
    const pebblePos=geo.attributes.position;
    for(let i=0;i<pebblePos.count;i++){
      const x=pebblePos.getX(i),y=pebblePos.getY(i),z=pebblePos.getZ(i);
      const f=1+.1*Math.sin(x*7+y*3)*Math.cos(z*5-x*2);
      pebblePos.setXYZ(i,x*f,y*f,z*f);
    }
    geo.computeVertexNormals();
    const normal=geo.attributes.normal,sums=new Map(),keys=[];
    for(let i=0;i<pebblePos.count;i++){
      const key=[pebblePos.getX(i),pebblePos.getY(i),pebblePos.getZ(i)].map(v=>v.toFixed(5)).join(',');
      keys.push(key);
      if(!sums.has(key))sums.set(key,new T.Vector3());
      sums.get(key).add(new T.Vector3(normal.getX(i),normal.getY(i),normal.getZ(i)));
    }
    for(let i=0;i<normal.count;i++){
      const n=sums.get(keys[i]).normalize();normal.setXYZ(i,n.x,n.y,n.z);
    }
    const mat = optics.addMicroSurface(new T.MeshStandardMaterial({ roughness: 0.96, metalness: 0 }), 70, .14);
    const count = 1500;
    const inst = new T.InstancedMesh(geo, mat, count);
    const dummy = new T.Object3D();
    const col = new T.Color();
    const rnd = (function (a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })(7);
    for (let i = 0; i < count; i++) {
      const r = 0.004 + Math.pow(rnd(), 1.6) * 0.010;
      dummy.position.set(
        (rnd() - 0.5) * (IN_W - 0.02),
        GRAVEL_Y + r * 0.35 + rnd() * 0.004,
        (rnd() - 0.5) * (IN_D - 0.02)
      );
      if(Math.hypot(dummy.position.x,dummy.position.z)<.035)dummy.position.x+=.07;
      dummy.scale.set(r, r * (0.5 + rnd() * 0.4), r * (0.8 + rnd() * 0.4));
      dummy.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
      recordObstacle(dummy.matrix);
      const l = 0.16 + rnd() * 0.22;
      col.setHSL(0.085 + rnd() * 0.035, 0.34 + rnd() * 0.16, l);
      inst.setColorAt(i, col);
    }
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.castShadow = true;
    inst.receiveShadow = true;
    scene.add(inst);
    const rockMat = optics.addMicroSurface(new T.MeshStandardMaterial({ color: 0x4a5149, roughness: 0.92 }), 380, .19);
    const rhw = IN_W / 2, rhd = IN_D / 2;
    [[-0.66, 0.30, 0.02, 0.16, 0.07], [0.64, -0.12, 0.05, 0.12, 0.055],
     [0.16, -0.46, -0.14, 0.085, 0.04]].forEach(function (r) {
      const m = new T.Mesh(geo, rockMat);
      m.scale.set(r[3], r[4], r[3] * 0.85);
      m.position.set(r[0] * rhw, GRAVEL_Y + r[4] * 0.45, r[1] * rhd);
      m.rotation.y = r[2] * 10;
      m.updateMatrix();recordObstacle(m.matrix);
      m.castShadow = true;
      m.receiveShadow = true;
      scene.add(m);
    });
    if(options.onTriangles&&record)options.onTriangles(collisionTriangles);
    return cached||collision.createHabitat({bounds:{minX:-IN_W/2,maxX:IN_W/2,minZ:-.372,maxZ:IN_D/2},bottomY:GRAVEL_Y,waterY:WATER_Y,cellSize:p.cellSize,dilationCells:p.dilationCells,triangles:collisionTriangles});
  }
  return Object.freeze({DEFAULTS,ALGORITHM,create,parameters,matchesCache,decodeGrid});
});
