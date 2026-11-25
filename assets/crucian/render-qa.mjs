// Pure renderer QA with the repository's real Three; no DOM or GPU mock.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import * as THREE from '../../vendor/three.module.js';
globalThis.window = {};
vm.runInThisContext(fs.readFileSync(new URL('../../src/crucian-mesh.js',import.meta.url),'utf8'));
vm.runInThisContext(fs.readFileSync(new URL('../../src/fish-view.js',import.meta.url),'utf8'));
const scene = new THREE.Scene();
const view = window.FishView.create({THREE,scene});
assert.equal(view.snapshot().enabled,false);
const root = scene.getObjectByName('CrucianFish');
const lip = scene.getObjectByName('Oral_lip_actual_rim');
assert.ok(lip,'Actual lip mesh participates in the render scene');
const body = scene.getObjectByName('Crucian_body');
assert.ok(body.material.map && body.material.map.isDataTexture,'Scales must be embedded synchronous pixels');
assert.equal(body.geometry.getAttribute('uv').count,body.geometry.getAttribute('position').count);
assert.equal(body.material.map.image.data.length,512*256*4);
const bp=body.geometry.getAttribute('position');let foreheadMin=Infinity,foreheadMax=-Infinity;
for(let i=0;i<bp.count;i++)if(Math.abs(bp.getX(i)-.078)<1e-6){foreheadMin=Math.min(foreheadMin,bp.getY(i));foreheadMax=Math.max(foreheadMax,bp.getY(i));}
assert.ok(foreheadMax-foreheadMin>.027,'Short snout must retain round depth 12mm behind actual mouth');
let textureDisposed=false;body.material.map.addEventListener('dispose',()=>textureDisposed=true);
let maxError = 0, maxRealRimError = 0;
const directions = [{x:1,y:0,z:0},{x:-1,y:0,z:0},{x:0,y:1,z:0},{x:0,y:-1,z:0},{x:0,y:0,z:1},{x:0,y:0,z:0}];
for (let i=0;i<200;i++) directions.push({x:Math.sin(i*1.33),y:Math.cos(i*.45)*.5,z:Math.cos(i*.77)});
for (let i=0;i<directions.length;i++) {
  const state={enabled:true,mouth:{x:Math.sin(i)*.4,y:.2+Math.cos(i)*.1,z:Math.sin(i*.7)*.15},direction:directions[i],time:i*.1,state:'approach',speed:.04};
  const before=JSON.stringify(state);view.update(state);
  assert.equal(JSON.stringify(state),before,'Rendering must not mutate behavior/physics');
  const snap=view.snapshot();maxError=Math.max(maxError,snap.error);
  assert.ok(snap.error<1e-6);
  const a=lip.geometry.getAttribute('position');let maxX=-Infinity;
  for(let j=0;j<a.count;j++)maxX=Math.max(maxX,a.getX(j));
  const points=new Map();for(let j=0;j<a.count;j++)if(Math.abs(a.getX(j)-maxX)<1e-8){
    const v=new THREE.Vector3().fromBufferAttribute(a,j);points.set(v.toArray().join(','),v);
  }
  const actual=new THREE.Vector3();points.forEach(p=>actual.add(p));actual.divideScalar(points.size).applyMatrix4(lip.matrixWorld);
  const err=actual.distanceTo(new THREE.Vector3(state.mouth.x,state.mouth.y,state.mouth.z));
  maxRealRimError=Math.max(maxRealRimError,err);assert.ok(err<1e-6,'ACTUAL rendered lip must match physical mouth');
}
view.update({enabled:false,mouth:{x:0,y:.3,z:0},direction:{x:1,y:0,z:0},time:4});
assert.equal(root.visible,false);
const counts=window.CrucianMesh.counts;view.dispose();view.dispose();assert.equal(scene.children.length,0);assert.equal(textureDisposed,true);
const report={ok:true,embeddedScaleTexture:true,textureDisposed,foreheadDepth:foreheadMax-foreheadMin,cases:directions.length,maxError,maxRealRimError,defaultHidden:true,disabledHidden:true,inputImmutable:true,disposeIdempotent:true,realMouthMeshInScene:true,counts};
fs.writeFileSync(new URL('./render-qa.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
