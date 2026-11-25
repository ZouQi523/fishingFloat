'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const {pathToFileURL}=require('node:url');
const Asset=require('../src/crucian-mesh.js'),Collision=require('../src/fish-collision.js');
const Lab=require('../src/fish-lab.js'),Tackle=require('../src/tackle.js');
const viewSource=fs.readFileSync(path.join(__dirname,'../src/fish-view.js'),'utf8');
const three=import(pathToFileURL(path.join(__dirname,'../vendor/three.module.js')).href);
const identity={x:0,y:0,z:0,w:1};
const fingerprint=asset=>crypto.createHash('sha256').update(JSON.stringify(asset)).digest('hex');
function state(time,enabled=true){return{enabled,time,mouth:{x:.12,y:.34,z:-.05},direction:{x:1,y:0,z:0},poseQuaternion:identity};}
async function createView(asset=Asset){
  const THREE=await three,scene=new THREE.Scene(),trig={sin:0,cos:0};
  const countedMath=Object.create(Math);
  for(const name of ['sin','cos'])countedMath[name]=x=>{trig[name]++;return Math[name](x);};
  const window={CrucianMesh:asset,FishCollision:Collision};
  vm.runInNewContext(viewSource,{window,atob,Math:countedMath},{filename:'fish-view.js'});
  const view=window.FishView.create({THREE,scene}),root=scene.children[0];
  return{view,root,THREE,trig,resetTrig(){trig.sin=trig.cos=0;}};
}
// Independent legacy formula, using the actual Float32 base values supplied to Three.
// In particular this does NOT use angle addition or any optimized coefficient.
function reference(data,d,time){
  const positions=Float32Array.from(data.positions),baseNormal=Float32Array.from(data.normals),normals=new Float32Array(baseNormal.length);
  for(let i=0;i<positions.length;i+=3){
    const u=Math.max(0,Math.min(1,(-positions[i]+d.startX)/d.span)),phase=time*d.frequency+u*d.phase,amp=d.amplitude*u*u;
    positions[i+2]=positions[i+2]+amp*Math.sin(phase);
    const derivative=u>0&&u<1?-(2*d.amplitude*u*Math.sin(phase)+amp*d.phase*Math.cos(phase))/d.span:0;
    const nx=baseNormal[i]-derivative*baseNormal[i+2],ny=baseNormal[i+1],nz=baseNormal[i+2],len=Math.hypot(nx,ny,nz)||1;
    normals[i]=nx/len;normals[i+1]=ny/len;normals[i+2]=nz/len;
  }
  return{positions,normals};
}
function checkGeometry(root,asset,time){
  let positionError=0,normalError=0;
  root.children.forEach((mesh,j)=>{
    const expected=reference(asset.meshes[j],asset.deformation,time),attributes=mesh.geometry.attributes;
    for(let i=0;i<expected.positions.length;i++){
      positionError=Math.max(positionError,Math.abs(attributes.position.array[i]-expected.positions[i]));
      normalError=Math.max(normalError,Math.abs(attributes.normal.array[i]-expected.normals[i]));
    }
  });
  assert.ok(positionError<1e-7,'Float32 position difference '+positionError+' at '+time);
  assert.ok(normalError<1e-7,'analytic normal difference '+normalError+' at '+time);
}
function boundaryAsset(){
  const positions=[0,0,0,-.029,.001,.002,-.03,.002,0,-.18,.003,.001,-.19,.002,-.001,-.07,.001,.003];
  return{id:'boundary-fixture',modelHash:'unchanged',mouthSource:{mesh:'boundary',vertexIndices:[0]},deformation:{...Asset.deformation},
    counts:{meshes:1,vertices:6,triangles:2},textures:[],meshes:[{name:'boundary',positions,normals:Array.from({length:6},()=>[.8,.1,Math.sqrt(.35)]).flat()}]};
}

test('full frozen scan CPU positions and analytic normals match independent legacy deformation',async()=>{
  const before=fingerprint(Asset),{view,root,THREE,trig,resetTrig}=await createView();
  try{
    for(const mesh of root.children){assert.equal(mesh.geometry.attributes.position.usage,THREE.DynamicDrawUsage);assert.equal(mesh.geometry.attributes.normal.usage,THREE.DynamicDrawUsage);}
    for(const time of [0,.031,.217,.631,1.27,23.5,-10,1e6]){
      resetTrig();view.update(state(time));
      assert.equal(trig.sin,1,'one global sine, not per-vertex trig');assert.equal(trig.cos,1,'one global cosine');
      checkGeometry(root,Asset,time);
      const data=Asset.meshes.find(m=>m.name===Asset.mouthSource.mesh),mesh=root.children.find(m=>m.name===data.name);
      for(const i of Asset.mouthSource.vertexIndices)for(let k=0;k<3;k++)assert.equal(mesh.geometry.attributes.position.array[i*3+k],Math.fround(data.positions[i*3+k]),'actual mouth lip remains fixed');
    }
    assert.equal(fingerprint(Asset),before,'no source geometry, normals, identity or deformation metadata modified');
  }finally{view.dispose();}
});

test('clamp boundaries and extreme finite timestamps preserve the legacy formula',async()=>{
  const asset=boundaryAsset(),{view,root}=await createView(asset);
  try{for(const time of [0,.13,-1,2**24,1e12,Number.MAX_VALUE/16]){view.update(state(time));checkGeometry(root,asset,time);}}
  finally{view.dispose();}
});

test('disabled updates do no deformation/uploads and same-time re-enable catches up',async()=>{
  const asset=boundaryAsset(),{view,root,trig,resetTrig}=await createView(asset),attributes=root.children[0].geometry.attributes;
  try{
    const initial=Array.from(attributes.position.array),initialVersion=attributes.position.version,normalVersion=attributes.normal.version;
    resetTrig();for(const time of [0,.25,.5])view.update(state(time,false));
    assert.deepEqual(Array.from(attributes.position.array),initial);assert.equal(attributes.position.version,initialVersion);assert.equal(attributes.normal.version,normalVersion);
    assert.equal(trig.sin+trig.cos,0);assert.equal(root.visible,false);
    view.update(state(.5));checkGeometry(root,asset,.5);assert.equal(root.visible,true);assert.equal(attributes.position.version,initialVersion+1);
    const rendered=Array.from(attributes.position.array),version=attributes.position.version;
    resetTrig();view.update(state(.5));view.update(state(.5,false));view.update(state(.5));
    assert.equal(attributes.position.version,version,'warmup enable/hide/re-enable at the same time uploads nothing twice');
    const hidden={...state(1.25,false),mouth:{x:-.25,y:.5,z:.2},direction:{x:0,y:0,z:1},poseQuaternion:Collision.orientation({x:0,y:0,z:1})};
    view.update(hidden);const report=view.snapshot();
    assert.equal(report.time,hidden.time);assert.equal(report.state,'disabled');
    for(const key of ['x','y','z']){assert.equal(report.physicalMouth[key],hidden.mouth[key]);assert.ok(Math.abs(report.modelMouth[key]-hidden.mouth[key])<1e-14);assert.equal(report.direction[key],hidden.direction[key]);}
    for(const key of ['x','y','z','w'])assert.equal(report.poseQuaternion[key],hidden.poseQuaternion[key]);
    assert.deepEqual(Array.from(attributes.position.array),rendered,'hidden snapshot describes existing CPU geometry, not a new hidden deformation');
    assert.equal(attributes.position.version,version);assert.equal(trig.sin+trig.cos,0);
    view.update(state(1.25));checkGeometry(root,asset,1.25);assert.equal(attributes.position.version,version+1);
  }finally{view.dispose();}
});

test('snapshot still checks actual deformed render-buffer geometry under a nontrivial pose',async()=>{
  const asset=boundaryAsset(),{view,root,THREE}=await createView(asset);
  try{
    const direction={x:.4,y:-.3,z:.7},s={...state(.913),direction,poseQuaternion:Collision.orientation(direction)};
    view.setHabitat({heightAt:(x,z)=>.31+.2*x-.1*z});view.update(s);
    // A deliberate CPU-buffer edit must be visible to QA, proving it is not replaced
    // by cached hull bounds or the analytic source formula.
    const attributes=root.children[0].geometry.attributes;attributes.position.array[2]+=.009;
    const report=view.snapshot(),min={x:Infinity,y:Infinity,z:Infinity},max={x:-Infinity,y:-Infinity,z:-Infinity};
    let penetration=0;const p=new THREE.Vector3();
    for(const mesh of root.children)for(let i=0;i<mesh.geometry.attributes.position.count;i++){
      p.fromBufferAttribute(mesh.geometry.attributes.position,i).applyMatrix4(mesh.matrixWorld);
      for(const key of ['x','y','z']){min[key]=Math.min(min[key],p[key]);max[key]=Math.max(max[key],p[key]);}
      penetration=Math.max(penetration,.31+.2*p.x-.1*p.z-p.y);
    }
    for(const key of ['x','y','z']){assert.equal(report.bounds.min[key],min[key]);assert.equal(report.bounds.max[key],max[key]);assert.ok(Math.abs(report.modelMouth[key]-s.mouth[key])<1e-14);}
    assert.equal(report.terrainPenetration,penetration);assert.equal(report.modelHash,asset.modelHash);
  }finally{view.dispose();}
});

test('FishLab lightweight history option keeps default snapshots, cloned history and physics unchanged',()=>{
  const rig=Tackle.create(),lab=Lab.create({rig,seed:20261125});
  lab.advance(1/30);const supplied=rig.snapshot(),full=lab.snapshot(supplied);
  assert.ok(full.history.length>1);assert.strictEqual(full.rig,supplied);
  for(const options of [undefined,{},null,{includeHistory:true}])assert.deepEqual(lab.snapshot(supplied,options),full);
  const light=lab.snapshot(supplied,{includeHistory:false});assert.deepEqual(light,{...full,history:[]});assert.strictEqual(light.rig,supplied);
  full.history[0].marks=999;light.history.push({time:-1,marks:-1});
  const after=lab.snapshot(supplied);assert.notEqual(after.history[0].marks,999);assert.equal(after.history.length,full.history.length);
  const controlRig=Tackle.create(),control=Lab.create({rig:controlRig,seed:20261125});control.advance(1/30);
  for(let i=0;i<12;i++){lab.snapshot(undefined,{includeHistory:false});lab.advance(1/120);control.advance(1/120);}
  assert.deepEqual(lab.snapshot(),control.snapshot(),'render-only reads cannot change any fixed-step state/history/events');
});

test('lightweight FishLab snapshots skip the history map itself, not only the returned value',()=>{
  const context=vm.createContext({module:{exports:{}},require:id=>{assert.equal(id,'./fish-behavior.js');return require('../src/fish-behavior.js');},historyMaps:0});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/fish-lab.js'),'utf8'),context);
  vm.runInContext(`const originalMap=Array.prototype.map;Array.prototype.map=function(...args){if(this[0]&&'marks' in this[0]&&'behavior' in this[0])historyMaps++;return originalMap.apply(this,args);};`,context);
  const rig=Tackle.create(),lab=context.module.exports.create({rig});
  lab.snapshot();assert.equal(context.historyMaps,1);
  for(let i=0;i<10;i++)lab.snapshot(undefined,{includeHistory:false});assert.equal(context.historyMaps,1,'no history.map allocations on lightweight reads');
  lab.snapshot();assert.equal(context.historyMaps,2,'legacy/default history still copied');
});
