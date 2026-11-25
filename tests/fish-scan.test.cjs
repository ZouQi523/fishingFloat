'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const A=require('../src/crucian-mesh.js'),B=require('../src/fish-body.js'),C=require('../src/fish-collision.js');
const floor=.055,water=.83,bounds={minX:-.8,maxX:.8,minZ:-.372,maxZ:.38};
const habitat=C.createHabitat({bounds,bottomY:floor,waterY:water,cellSize:.004,triangles:[-.13,.10,-.04,-.02,.13,-.04,-.02,.13,.04,-.13,.10,-.04,-.02,.13,.04,-.13,.10,.04]});
function vertex(a,i,t){const d=A.deformation,x=Math.fround(a[i]);let z=Math.fround(a[i+2]);if(d){const u=Math.max(0,Math.min(1,(-x+d.startX)/d.span));z=Math.fround(z+d.amplitude*u*u*Math.sin(t*d.frequency+u*d.phase));}return[x,Math.fround(a[i+1]),z];}
function rotation(q){const{x,y,z,w}=q;return[1-2*(y*y+z*z),2*(x*y-w*z),2*(x*z+w*y),2*(x*y+w*z),1-2*(x*x+z*z),2*(y*z-w*x),2*(x*z-w*y),2*(y*z+w*x),1-2*(x*x+y*y)];}
test('licensed scan, frozen model-derived swept body and actual oral-rim centroid share identity',()=>{
 assert.equal(A.modelHash,B.modelHash);assert.equal(A.deformation.amplitude,.003);assert.deepEqual(A.deformation,B.deformation);
 assert.ok(Object.isFrozen(B)&&Object.isFrozen(B.points)&&Object.isFrozen(B.surfacePoints));
 assert.ok(A.counts.triangles>=10000&&A.counts.triangles<40000);assert.ok(A.textures[0].width>=1024);
 const mesh=A.meshes.find(m=>m.name===A.mouthSource.mesh),lip=A.mouthSource.vertexIndices;
 assert.ok(lip.length>=8);const center=[0,0,0];for(const i of lip)for(let k=0;k<3;k++)center[k]+=Math.fround(mesh.positions[i*3+k])/lip.length;
 assert.ok(Math.hypot(...center)<1e-7,'actual GPU lip centroid, not a made-up origin');
 for(const texture of A.textures)assert.equal(Buffer.from(texture.data,'base64').length,texture.width*texture.height*4);
});
test('independent actual deformed render vertices stay above gravel/rock and within all six bounds across yaw/pitch/corners',()=>{
 let worst=0,vertices=0;
 for(let j=0;j<36;j++){
  const yaw=j*Math.PI*.618,pitch=[0,-.35,-.8,-1.3,1.3,Math.PI/2-1e-7][j%6];
  const direction={x:Math.cos(yaw)*Math.cos(pitch),y:Math.sin(pitch),z:Math.sin(yaw)*Math.cos(pitch)};
  const mouth={x:j%3===0?-.79:j%3===1?.79:0,y:j%5===0?.82:.059,z:j%4===0?-.37:j%4===1?.379:0};
  const r=C.resolve({mouth,direction,velocity:{x:-1,y:-1,z:1},body:B,habitat});assert.ok(r.contact.feasible);
  const m=rotation(r.quaternion);
  for(const t of [0,.217,.631,1.27])for(const data of A.meshes)for(let i=0;i<data.positions.length;i+=3){
   const [x,y,z]=vertex(data.positions,i,t),X=r.mouth.x+m[0]*x+m[1]*y+m[2]*z,Y=r.mouth.y+m[3]*x+m[4]*y+m[5]*z,Z=r.mouth.z+m[6]*x+m[7]*y+m[8]*z;
   worst=Math.max(worst,bounds.minX-X,X-bounds.maxX,bounds.minZ-Z,Z-bounds.maxZ,habitat.heightAt(X,Z)-Y,Y-water);vertices++;
  }
 }
 assert.ok(worst<1e-7,'independent full-render-mesh worst penetration '+worst);assert.ok(vertices>8000000);
});
test('continuous lateral wave is contained by exported support, independently against full render mesh',()=>{
 let rng=19;const rnd=()=>((rng=Math.imul(rng,1664525)+1013904223>>>0)/2**32);
 for(let j=0;j<48;j++){
  const normal=[rnd()*2-1,rnd()*2-1,rnd()*2-1];let support=-Infinity,render=-Infinity;
  for(let i=0;i<B.points.length;i+=3)support=Math.max(support,B.points[i]*normal[0]+B.points[i+1]*normal[1]+B.points[i+2]*normal[2]);
  for(const t of [0,.31,.89])for(const mesh of A.meshes)for(let i=0;i<mesh.positions.length;i+=3){const v=vertex(mesh.positions,i,t);render=Math.max(render,v[0]*normal[0]+v[1]*normal[1]+v[2]*normal[2]);}
  assert.ok(support>=render-1e-8,'swept support omitted actual photographed fin/body');
 }
});
