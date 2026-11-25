/* Scanned fish in the original scene. Physical mouth and pose are never offset for appearance. */
(function () {
  'use strict';
  window.FishView = {
    create({ THREE: T, scene }) {
      const asset = window.CrucianMesh;
      if (!asset?.meshes || !window.FishCollision) throw new Error('Load scanned fish and shared collision pose before FishView');
      const root = new T.Group(); root.name = 'CrucianFish'; root.visible = false; scene.add(root);
      const source = asset.mouthSource, lip = asset.meshes.find(m => m.name === source.mesh);
      if (!lip || !source.vertexIndices?.length) throw new Error('Scanned fish requires actual oral-rim vertex landmarks');
      const mouth = new T.Vector3();
      // Measure the same Float32 vertices that reach the GPU, not a separate free marker.
      source.vertexIndices.forEach(i => mouth.add(new T.Vector3(Math.fround(lip.positions[i*3]), Math.fround(lip.positions[i*3+1]), Math.fround(lip.positions[i*3+2]))));
      mouth.divideScalar(source.vertexIndices.length);
      const physicalMouth = new T.Vector3(), actualMouth = new T.Vector3(), direction = new T.Vector3(1,0,0);
      const geometries = [], materials = [], meshes = [], textures = [], animated = [];
      let enabled = false, disposed = false, time = 0, lastTime = NaN, state = 'disabled', habitat = null;
      (asset.textures || []).forEach(s => {
        const bytes = atob(s.data), rgba = new Uint8Array(bytes.length);
        for (let i=0;i<bytes.length;i++) rgba[i]=bytes.charCodeAt(i);
        const texture = new T.DataTexture(rgba,s.width,s.height,T.RGBAFormat);
        texture.colorSpace=T.SRGBColorSpace;texture.flipY=!!s.flipY;
        texture.magFilter=T.LinearFilter;texture.minFilter=T.LinearMipmapLinearFilter;
        texture.generateMipmaps=true;texture.anisotropy=4;texture.needsUpdate=true;textures.push(texture);
      });
      asset.meshes.forEach(data => {
        const geometry = new T.BufferGeometry();
        geometry.setAttribute('position',new T.Float32BufferAttribute(data.positions,3));
        geometry.setAttribute('normal',new T.Float32BufferAttribute(data.normals,3));
        if (data.uvs?.length) geometry.setAttribute('uv',new T.Float32BufferAttribute(data.uvs,2));
        if (data.colors?.length) geometry.setAttribute('color',new T.Float32BufferAttribute(data.colors,3));
        geometry.computeBoundingSphere();
        const material = new T.MeshStandardMaterial({
          color:new T.Color().fromArray(data.color||[1,1,1]),vertexColors:!!data.colors?.length,
          map:textures[data.textureIndex]||null,roughness:data.roughness??.68,metalness:data.metalness??0,
          side:T.DoubleSide,envMapIntensity:.55
        });
        const mesh=new T.Mesh(geometry,material);mesh.name=data.name;mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);
        geometries.push(geometry);materials.push(material);meshes.push(mesh);
        const a={position:geometry.attributes.position,normal:geometry.attributes.normal,base:Float32Array.from(data.positions),baseNormal:Float32Array.from(data.normals),indices:[]};
        const d=asset.deformation;
        if(d){
          const count=a.base.length/3;
          a.offsetSin=new Float64Array(count);a.offsetCos=new Float64Array(count);
          a.derivativeSin=new Float64Array(count);a.derivativeCos=new Float64Array(count);
          for(let i=0,j=0;i<a.base.length;i+=3,j++){
            const u=Math.max(0,Math.min(1,(-a.base[i]+d.startX)/d.span)),amp=d.amplitude*u*u;
            if(u>0){
              a.indices.push(i);
              const s=Math.sin(u*d.phase),c=Math.cos(u*d.phase);
              a.offsetSin[j]=amp*c;a.offsetCos[j]=amp*s;
              if(u<1){
                a.derivativeSin[j]=-(2*d.amplitude*u*c-amp*d.phase*s)/d.span;
                a.derivativeCos[j]=-(2*d.amplitude*u*s+amp*d.phase*c)/d.span;
              }
            }
            // Non-moving head/mouth normals never need to be normalized again.
            const nx=a.baseNormal[i],ny=a.baseNormal[i+1],nz=a.baseNormal[i+2],len=Math.hypot(nx,ny,nz)||1;
            a.normal.array[i]=nx/len;a.normal.array[i+1]=ny/len;a.normal.array[i+2]=nz/len;
          }
          a.indices=Uint32Array.from(a.indices);
          if(T.DynamicDrawUsage!==undefined){a.position.setUsage(T.DynamicDrawUsage);a.normal.setUsage(T.DynamicDrawUsage);}
        }
        animated.push(a);
      });
      function deform(t) {
        const d=asset.deformation;if(!d)return;
        const angle=t*d.frequency,s=Math.sin(angle),c=Math.cos(angle);
        // Preserve legacy floating-point phase rounding even at extreme timestamps.
        // Normal simulation times use only the two global trig calls above.
        const extreme=Math.abs(angle)>2**26;
        for(const a of animated){const p=a.position.array,n=a.normal.array;
          for(let k=0;k<a.indices.length;k++){const i=a.indices[k],j=i/3;
            let offset=a.offsetSin[j]*s+a.offsetCos[j]*c;
            let derivative=a.derivativeSin[j]*s+a.derivativeCos[j]*c;
            if(extreme){
              const u=Math.max(0,Math.min(1,(-a.base[i]+d.startX)/d.span)),phase=angle+u*d.phase,amp=d.amplitude*u*u;
              offset=amp*Math.sin(phase);
              derivative=u<1?-(2*d.amplitude*u*Math.sin(phase)+amp*d.phase*Math.cos(phase))/d.span:0;
            }
            p[i+2]=a.base[i+2]+offset;
            const nx=a.baseNormal[i]-derivative*a.baseNormal[i+2],ny=a.baseNormal[i+1],nz=a.baseNormal[i+2],len=Math.sqrt(nx*nx+ny*ny+nz*nz)||1;
            n[i]=nx/len;n[i+1]=ny/len;n[i+2]=nz/len;
          }a.position.needsUpdate=true;a.normal.needsUpdate=true;
        }
      }
      function update(fishState) {
        if(disposed)return;enabled=!!fishState?.enabled;root.visible=enabled;if(!fishState)return;
        state=fishState.state||(enabled?'swimming':'disabled');time=Number.isFinite(fishState.time)?fishState.time:0;
        const p=fishState.mouth;if(!p||![p.x,p.y,p.z].every(Number.isFinite)){root.visible=false;enabled=false;return;}
        physicalMouth.set(p.x,p.y,p.z);const d=fishState.direction;if(d)direction.set(d.x,d.y,d.z).normalize();
        const q=fishState.poseQuaternion||window.FishCollision.orientation(direction);
        root.quaternion.set(q.x,q.y,q.z,q.w);
        root.position.copy(physicalMouth).sub(actualMouth.copy(mouth).applyQuaternion(root.quaternion));
        // Hidden updates retain the last rendered CPU geometry and do no vertex work.
        // Do not advance lastTime here: enabling at the same state time must deform.
        if(enabled&&time!==lastTime){deform(time);lastTime=time;}root.updateMatrixWorld(true);
      }
      function snapshot() {
        root.updateMatrixWorld(true);actualMouth.copy(mouth).applyMatrix4(root.matrixWorld);
        const min={x:Infinity,y:Infinity,z:Infinity},max={x:-Infinity,y:-Infinity,z:-Infinity};let terrainPenetration=0;
        // Independent QA of actual deformed render vertices; not a collision-hull self-test.
        const v=new T.Vector3();for(const mesh of meshes){const p=mesh.geometry.attributes.position;
          for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld);
            for(const k of ['x','y','z']){min[k]=Math.min(min[k],v[k]);max[k]=Math.max(max[k],v[k]);}
            if(habitat)terrainPenetration=Math.max(terrainPenetration,habitat.heightAt(v.x,v.z)-v.y);
          }}
        return{enabled,visible:root.visible,state,time,modelId:asset.id,modelHash:asset.modelHash,modelMouth:{x:actualMouth.x,y:actualMouth.y,z:actualMouth.z},physicalMouth:{x:physicalMouth.x,y:physicalMouth.y,z:physicalMouth.z},error:actualMouth.distanceTo(physicalMouth),modelMouthLocal:mouth.toArray(),mouthSource:{...source,vertexCount:source.vertexIndices.length},position:{x:root.position.x,y:root.position.y,z:root.position.z},direction:{x:direction.x,y:direction.y,z:direction.z},poseQuaternion:{x:root.quaternion.x,y:root.quaternion.y,z:root.quaternion.z,w:root.quaternion.w},counts:{...asset.counts},bounds:{min,max},terrainPenetration};
      }
      function setHabitat(value){habitat=value;}
      function dispose(){if(disposed)return;disposed=true;scene.remove(root);geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());}
      update({enabled:false,mouth:{x:0,y:0,z:0},direction:{x:1,y:0,z:0},time:0});
      return{update,snapshot,setHabitat,dispose};
    }
  };
})();
