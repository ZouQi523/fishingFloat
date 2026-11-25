'use strict';
// Independent Node checks: classic offline payload, exact PNG pixels, GLB buffers.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');const asset=require(path.join(root,'src/crucian-mesh.js')),body=require(path.join(root,'src/fish-body.js'));
assert.equal(asset.modelHash,body.modelHash);assert(Object.isFrozen(body));for(const k of ['points','surfacePoints','mouthLocal','deformation'])assert(Object.isFrozen(body[k]),k);
const t=asset.textures[0],rgba=Buffer.from(t.data,'base64');assert.equal(rgba.length,1024*1024*4);assert.equal(t.flipY,false);assert.equal(t.colorSpace,'srgb');
const png=fs.readFileSync(path.join(__dirname,'scanned-albedo.png'));let offset=8,blocks=[],w,h;
while(offset<png.length){const size=png.readUInt32BE(offset),type=png.toString('ascii',offset+4,offset+8),data=png.subarray(offset+8,offset+8+size);offset+=size+12;if(type==='IHDR'){w=data.readUInt32BE(0);h=data.readUInt32BE(4);assert.equal(data[8],8);assert.equal(data[9],6);}if(type==='IDAT')blocks.push(data);}
const raw=zlib.inflateSync(Buffer.concat(blocks)),stride=w*4,rows=[];let previous=Buffer.alloc(stride),p=0;
for(let y=0;y<h;y++){const filter=raw[p++],row=Buffer.from(raw.subarray(p,p+stride));p+=stride;
for(let x=0;x<stride;x++){const a=x>=4?row[x-4]:0,b=previous[x],c=x>=4?previous[x-4]:0;let prediction=0;
if(filter===1)prediction=a;if(filter===2)prediction=b;if(filter===3)prediction=Math.floor((a+b)/2);if(filter===4){const q=a+b-c,pa=Math.abs(q-a),pb=Math.abs(q-b),pc=Math.abs(q-c);prediction=pa<=pb&&pa<=pc?a:pb<=pc?b:c;}row[x]=(row[x]+prediction)&255;}rows.push(row);previous=row;}
assert.deepEqual(rgba,Buffer.concat(rows.reverse()),'RGBA8 must equal saved PNG bytes with bottom-up row order');
const glb=fs.readFileSync(path.join(__dirname,'silver-crucian.glb'));assert.equal(glb.toString('ascii',0,4),'glTF');assert.equal(glb.readUInt32LE(4),2);assert.equal(glb.readUInt32LE(8),glb.length);
const jsonLength=glb.readUInt32LE(12),gltf=JSON.parse(glb.toString('utf8',20,20+jsonLength));assert.equal(gltf.meshes.length,1);assert.equal(gltf.images.length,1);
const binStart=20+jsonLength+8,primitive=gltf.meshes[0].primitives[0],position=gltf.accessors[primitive.attributes.POSITION],view=gltf.bufferViews[position.bufferView];assert.equal(position.componentType,5126);
const gpu=asset.meshes[0],exportedBounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
for(let i=0;i<position.count;i++)for(let axis=0;axis<3;axis++){const value=glb.readFloatLE(binStart+(view.byteOffset||0)+(position.byteOffset||0)+i*(view.byteStride||12)+axis*4);exportedBounds.min[axis]=Math.min(exportedBounds.min[axis],value);exportedBounds.max[axis]=Math.max(exportedBounds.max[axis],value);}
for(let axis=0;axis<3;axis++){const expected=gpu.positions.filter((_,i)=>i%3===axis);assert(Math.abs(Math.min(...expected)-exportedBounds.min[axis])<1e-7);assert(Math.abs(Math.max(...expected)-exportedBounds.max[axis])<1e-7);}
const indexAccessor=gltf.accessors[primitive.indices];assert.equal(indexAccessor.count/3,asset.counts.triangles);
const report={passed:true,modelHash:asset.modelHash,classicOffline:true,immutableCollisionArrays:true,rgbaBytes:rgba.length,rgbaExactlyMatchesSavedPng:true,textureRowOrder:'bottom-up for WebGL flipY=false',glbVersion:2,glbMeshCount:gltf.meshes.length,glbTriangleCount:indexAccessor.count/3,glbImageCount:gltf.images.length,glbBufferBoundsMatchRuntime:true,meshJsBytes:fs.statSync(path.join(root,'src/crucian-mesh.js')).size,bodyJsBytes:fs.statSync(path.join(root,'src/fish-body.js')).size};
fs.writeFileSync(path.join(__dirname,'runtime-qa.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
