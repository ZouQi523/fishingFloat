/* Mouth-origin whole-fish support and conservative height-field collision.
 * Pure JS: +X head, +Y up, +Z side. Rendering must use orientation() too.
 * Terrain is a height field, not a full mesh/overhang or swept CCD solver. */
(function (root, factory) {
  'use strict'; const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FishCollision = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const EPS = 1e-9;
  const validatedArrays = new WeakSet(), poseCache = new WeakMap();
  const finite = (n, name) => { if (!Number.isFinite(n)) throw new TypeError(name + ' must be finite'); return n; };
  const vec = (v, name) => ({ x: finite(v && v.x, name + '.x'), y: finite(v && v.y, name + '.y'), z: finite(v && v.z, name + '.z') });
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  function unit(v) { const n = Math.hypot(v.x, v.y, v.z); return n > 1e-15 ? { x: v.x / n, y: v.y / n, z: v.z / n } : { x: 1, y: 0, z: 0 }; }
  function orientation(direction) {
    const d = unit(vec(direction, 'direction'));
    // R_y(yaw) R_z(pitch), not shortest-arc rotation (which introduces roll).
    const yaw = Math.hypot(d.x, d.z) > 1e-15 ? Math.atan2(-d.z, d.x) : 0;
    const pitch = Math.asin(clamp(d.y, -1, 1));
    const sy = Math.sin(yaw / 2), cy = Math.cos(yaw / 2), sp = Math.sin(pitch / 2), cp = Math.cos(pitch / 2);
    return { x: sy * sp, y: sy * cp, z: cy * sp, w: cy * cp };
  }
  function pointArray(points, name, allowEmpty = false) {
    if (!points || typeof points.length !== 'number' || points.length % 3 || (!allowEmpty && !points.length)) throw new TypeError(name + ' must be flat xyz points');
    if (typeof points !== 'object') throw new TypeError(name + ' must be an array');
    if (validatedArrays.has(points)) return points;
    for (let i = 0; i < points.length; i++) if (!Number.isFinite(points[i])) throw new TypeError(name + '[' + i + '] must be finite');
    // Frozen exported geometry is validated once. Mutable callers remain checked.
    if (Object.isFrozen(points)) validatedArrays.add(points);
    return points;
  }
  function transform(points, quaternion) {
    pointArray(points, 'points', true);
    let { x, y, z, w } = quaternion || {}; [x, y, z, w].forEach(n => finite(n, 'quaternion'));
    const n = Math.hypot(x, y, z, w); if (n < 1e-15) throw new RangeError('quaternion must have nonzero length');
    x /= n; y /= n; z /= n; w /= n;
    const xx = x*x, yy = y*y, zz = z*z, xy = x*y, xz = x*z, yz = y*z, wx = w*x, wy = w*y, wz = w*z;
    const a = 1-2*(yy+zz), b = 2*(xy-wz), c = 2*(xz+wy), d = 2*(xy+wz), e = 1-2*(xx+zz), f = 2*(yz-wx), g = 2*(xz-wy), h = 2*(yz+wx), j = 1-2*(xx+yy);
    const out = new Array(points.length);
    for (let i = 0; i < points.length; i += 3) { const px = points[i], py = points[i+1], pz = points[i+2]; out[i] = a*px+b*py+c*pz; out[i+1] = d*px+e*py+f*pz; out[i+2] = g*px+h*py+j*pz; }
    return out;
  }
  function clip(poly, axis, limit, sign) {
    const out = []; if (!poly.length) return out;
    let a = poly[poly.length - 1], da = (a[axis] - limit) * sign;
    for (const b of poly) {
      const db = (b[axis] - limit) * sign, ina = da >= 0, inb = db >= 0;
      if (ina !== inb) { const t = da / (da - db); out.push([a[0]+t*(b[0]-a[0]), a[1]+t*(b[1]-a[1]), a[2]+t*(b[2]-a[2])]); }
      if (inb) out.push(b);
      a = b; da = db;
    }
    return out;
  }
  function habitatOptions(options) {
    const input = options.bounds || {}, bounds = {};
    for (const k of ['minX','maxX','minZ','maxZ']) bounds[k] = finite(input[k], 'bounds.' + k);
    if (bounds.maxX <= bounds.minX || bounds.maxZ <= bounds.minZ) throw new RangeError('habitat bounds must have positive width/depth');
    const bottomY = finite(options.bottomY, 'bottomY'), waterY = finite(options.waterY, 'waterY');
    if (waterY <= bottomY) throw new RangeError('waterY must exceed bottomY');
    const cellSize = finite(options.cellSize === undefined ? .004 : options.cellSize, 'cellSize');
    if (cellSize <= 0) throw new RangeError('cellSize must be positive');
    const columns = Math.ceil((bounds.maxX - bounds.minX) / cellSize), rows = Math.ceil((bounds.maxZ - bounds.minZ) / cellSize);
    if (!Number.isSafeInteger(columns * rows) || columns * rows > 4000000) throw new RangeError('habitat grid exceeds 4 million cells');
    const dilationCells = options.dilationCells === undefined ? 1 : options.dilationCells;
    if (!Number.isInteger(dilationCells) || dilationCells < 0 || dilationCells > 4) throw new RangeError('dilationCells must be an integer in [0,4]');
    return {bounds,bottomY,waterY,cellSize,columns,rows,dilationCells};
  }
  function createHabitat(options = {}) {
    const settings=habitatOptions(options),{bounds,bottomY,waterY,cellSize,columns,rows,dilationCells}=settings;
    const triangles = options.triangles || []; pointArray(triangles, 'triangles', true);
    if (triangles.length % 9) throw new TypeError('triangles must contain complete flat xyz triangles');
    let data = new Float64Array(columns * rows); data.fill(bottomY);
    let rasterizedTriangles = 0;
    for (let t = 0; t < triangles.length; t += 9) {
      const tri = [Array.from(triangles.slice(t,t+3)), Array.from(triangles.slice(t+3,t+6)), Array.from(triangles.slice(t+6,t+9))];
      const minX = Math.min(...tri.map(p=>p[0])), maxX = Math.max(...tri.map(p=>p[0])), minZ = Math.min(...tri.map(p=>p[2])), maxZ = Math.max(...tri.map(p=>p[2]));
      if (maxX < bounds.minX || minX > bounds.maxX || maxZ < bounds.minZ || minZ > bounds.maxZ) continue;
      const x0 = clamp(Math.floor((minX-bounds.minX)/cellSize),0,columns-1), x1 = clamp(Math.floor((maxX-bounds.minX)/cellSize),0,columns-1);
      const z0 = clamp(Math.floor((minZ-bounds.minZ)/cellSize),0,rows-1), z1 = clamp(Math.floor((maxZ-bounds.minZ)/cellSize),0,rows-1);
      rasterizedTriangles++;
      for (let iz = z0; iz <= z1; iz++) for (let ix = x0; ix <= x1; ix++) {
        const ax = bounds.minX + ix*cellSize, az = bounds.minZ + iz*cellSize;
        let polygon = clip(tri,0,ax,1); polygon = clip(polygon,0,Math.min(bounds.maxX,ax+cellSize),-1);
        polygon = clip(polygon,2,az,1); polygon = clip(polygon,2,Math.min(bounds.maxZ,az+cellSize),-1);
        for (const p of polygon) data[iz*columns+ix] = Math.max(data[iz*columns+ix],p[1]);
      }
    }
    if (dilationCells) {
      const original = data; data = new Float64Array(original.length);
      for (let z = 0; z < rows; z++) for (let x = 0; x < columns; x++) {
        let height = bottomY;
        for (let dz = -dilationCells; dz <= dilationCells; dz++) for (let dx = -dilationCells; dx <= dilationCells; dx++) {
          const xx=x+dx, zz=z+dz; if (xx>=0 && xx<columns && zz>=0 && zz<rows) height=Math.max(height,original[zz*columns+xx]);
        }
        data[z*columns+x]=height;
      }
    }
    return finishHabitat(settings,data,triangles.length/9,rasterizedTriangles);
  }
  function createHabitatFromGrid(options = {}) {
    const settings=habitatOptions(options),{columns,rows,bottomY}=settings;
    if(options.columns!==columns||options.rows!==rows)throw new RangeError('cached grid dimensions do not match bounds/cellSize');
    if(Object.prototype.toString.call(options.data)!=='[object Float64Array]'||options.data.length!==columns*rows)throw new TypeError('cached grid data must be matching Float64Array');
    const count=options.triangleCount,raster=options.rasterizedTriangles;
    if(!Number.isSafeInteger(count)||count<0||!Number.isSafeInteger(raster)||raster<0||raster>count)throw new RangeError('invalid cached triangle counts');
    const data=new Float64Array(options.data);
    for(let i=0;i<data.length;i++)if(!Number.isFinite(data[i])||data[i]<bottomY)throw new RangeError('invalid cached grid height at '+i);
    return finishHabitat(settings,data,count,raster);
  }
  function finishHabitat(settings,data,triangleCount,rasterizedTriangles) {
    const {bounds,bottomY,waterY,cellSize,columns,rows,dilationCells}=settings;
    Object.freeze(bounds);
    function heightAt(x,z) {
      finite(x,'heightAt.x'); finite(z,'heightAt.z');
      if (x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ) return bottomY;
      return data[Math.min(rows-1,Math.floor((z-bounds.minZ)/cellSize))*columns+Math.min(columns-1,Math.floor((x-bounds.minX)/cellSize))];
    }
    const grid = Object.freeze({ columns, rows, cellSize, dilationCells, at(x,z) { if (!Number.isInteger(x)||!Number.isInteger(z)||x<0||x>=columns||z<0||z>=rows) throw new RangeError('cell index outside grid'); return data[z*columns+x]; } });
    return Object.freeze({ bounds, bottomY, waterY, cellSize, grid, heightAt, triangleCount, rasterizedTriangles });
  }
  function prepare(input) {
    const mouth = vec(input.mouth,'mouth'), direction = unit(vec(input.direction,'direction')), body = input.body || {}, habitat = input.habitat;
    if (!habitat || typeof habitat.heightAt !== 'function' || !habitat.bounds) throw new TypeError('habitat must come from createHabitat');
    const points = pointArray(body.points,'body.points'), skin = finite(body.skin === undefined ? .001 : body.skin,'body.skin');
    if (skin < 0) throw new RangeError('body.skin must be nonnegative');
    const quaternion = orientation(direction), old = poseCache.get(body);
    const cacheable = Object.isFrozen(points) && (!body.surfacePoints || Object.isFrozen(body.surfacePoints));
    const hit = cacheable && old && old.points === points && old.surfacePoints === body.surfacePoints && ['x','y','z','w'].every(k=>old.quaternion[k]===quaternion[k]);
    let rotated, surface, ext;
    if (hit) ({rotated,surface,ext}=old);
    else {
      rotated = transform(points,quaternion);
      surface = body.surfacePoints ? transform(pointArray(body.surfacePoints,'body.surfacePoints',true),quaternion) : [];
      ext = { minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity,minZ:Infinity,maxZ:-Infinity };
      for (let i=0;i<rotated.length;i+=3) { ext.minX=Math.min(ext.minX,rotated[i]);ext.maxX=Math.max(ext.maxX,rotated[i]);ext.minY=Math.min(ext.minY,rotated[i+1]);ext.maxY=Math.max(ext.maxY,rotated[i+1]);ext.minZ=Math.min(ext.minZ,rotated[i+2]);ext.maxZ=Math.max(ext.maxZ,rotated[i+2]); }
      if (cacheable) poseCache.set(body,{points,surfacePoints:body.surfacePoints,quaternion:{...quaternion},rotated,surface,ext});
    }
    const b=habitat.bounds, limits={minX:b.minX+skin-ext.minX,maxX:b.maxX-skin-ext.maxX,minY:habitat.bottomY+skin-ext.minY,maxY:habitat.waterY-skin-ext.maxY,minZ:b.minZ+skin-ext.minZ,maxZ:b.maxZ-skin-ext.maxZ};
    return {mouth,direction,quaternion,rotated,surface,skin,habitat,limits};
  }
  function floor(prepared, mouth) {
    const {habitat,skin,rotated,surface,limits}=prepared;let required=limits.minY,terrain=false,support=null;
    for (const points of [rotated,surface]) for (let i=0;i<points.length;i+=3) {
      const x=mouth.x+points[i],z=mouth.z+points[i+2],height=habitat.heightAt(x,z), y=height+skin-points[i+1];
      if (y>required) {required=y;support={x,y:height,z};terrain=height>habitat.bottomY+EPS;}
    }
    return {required,terrain,support};
  }
  function requiredFloorHeight(input) { const p=prepare(input);return floor(p,p.mouth).required; }
  function inspect(p,mouth,suppliedFloor) {
    const f=suppliedFloor||floor(p,mouth),l={...p.limits,minY:f.required};
    const penetrations={minX:Math.max(0,l.minX-mouth.x),maxX:Math.max(0,mouth.x-l.maxX),minY:Math.max(0,l.minY-mouth.y),maxY:Math.max(0,mouth.y-l.maxY),minZ:Math.max(0,l.minZ-mouth.z),maxZ:Math.max(0,mouth.z-l.maxZ)};
    const contacts=[];
    for (const axis of ['X','Y','Z']) {const k=axis.toLowerCase();if(mouth[k]<=l['min'+axis]+EPS)contacts.push('min'+axis);if(mouth[k]>=l['max'+axis]-EPS)contacts.push('max'+axis);}
    const penetration=Math.max(...Object.values(penetrations)),fits=l.minX<=l.maxX+EPS&&l.minY<=l.maxY+EPS&&l.minZ<=l.maxZ+EPS;
    return {feasible:fits&&penetration<=EPS,fits,penetration,penetrations,limits:l,requiredFloorY:f.required,terrain:f.terrain,support:f.support,contacts};
  }
  function clearance(input) {const p=prepare(input);return inspect(p,p.mouth);}
  function resolve(input) {
    const p=prepare(input),original=p.mouth,velocity=vec(input.velocity||{x:0,y:0,z:0},'velocity'),mouth={...original};
    const project=(value,min,max)=>min<=max?clamp(value,min,max):(min+max)/2;
    mouth.x=project(mouth.x,p.limits.minX,p.limits.maxX);mouth.z=project(mouth.z,p.limits.minZ,p.limits.maxZ);
    const floorResult=floor(p,mouth),required=floorResult.required;mouth.y=project(mouth.y,required,p.limits.maxY);
    const after=inspect(p,mouth,floorResult), before=inspect(p,original,mouth.x===original.x&&mouth.z===original.z?floorResult:null), normals=[];
    for (const axis of ['X','Y','Z']) {
      const k=axis.toLowerCase(),lo=after.limits['min'+axis],hi=after.limits['max'+axis];
      if(lo>hi+EPS)velocity[k]=0;
      else {if(mouth[k]<=lo+EPS&&velocity[k]<0)velocity[k]=0;if(mouth[k]>=hi-EPS&&velocity[k]>0)velocity[k]=0;}
      if(mouth[k]<=lo+EPS){const n={x:0,y:0,z:0};n[k]=1;normals.push(n);}if(mouth[k]>=hi-EPS){const n={x:0,y:0,z:0};n[k]=-1;normals.push(n);}
    }
    const correction={x:mouth.x-original.x,y:mouth.y-original.y,z:mouth.z-original.z};
    return {mouth,direction:p.direction,quaternion:p.quaternion,velocity,contact:{feasible:after.feasible,unresolved:!after.feasible||after.penetration>EPS,planes:after.contacts,terrain:after.terrain&&mouth.y<=required+EPS,correction,requiredFloorY:required,penetration:before.penetration,residualPenetration:after.penetration,normals,support:after.support,limits:after.limits}};
  }
  return Object.freeze({orientation,transform,createHabitat,createHabitatFromGrid,resolve,clearance,requiredFloorHeight});
});
