/* Real-time aquarium optics. Screen-space refraction is an approximation, not a ray tracer. */
(function () {
  'use strict';
  const T = window.THREE;
  // One lake-water palette for the original surface and the tank's water volume.
  const waterPalette = Object.freeze({ surface: 0x68765a, deep: 0x202719 });
  window.FloatOptics = {
    waterPalette,
    createWater(renderer, scene, camera, width, depth, level, lighting = {}) {
      // Every view samples the same scene/water, but owns its optical captures.
      // Weak keys avoid retaining a removed inset camera (allocation is lazy).
      const views = new WeakMap(), allocatedViews = new Set();
      let primarySize = { width: 640, height: 480 };
      let opticalScale = 1, reflectionInterval = 3;
      const captureSize = ({ width, height }) => {
        width = Number.isFinite(width) ? Math.max(1, width) : 1;
        height = Number.isFinite(height) ? Math.max(1, height) : 1;
        const scale = opticalScale * Math.min(1, 1000 / Math.max(width, height));
        return { width: Math.max(1, Math.round(width * scale)),
          height: Math.max(1, Math.round(height * scale)) };
      };
      function viewState(viewCamera) {
        let state = views.get(viewCamera);
        if (!state) {
          const initialSize = captureSize(primarySize);
          const refraction = new T.WebGLRenderTarget(initialSize.width, initialSize.height,
            { type: T.HalfFloatType });
          refraction.depthTexture = new T.DepthTexture(initialSize.width, initialSize.height, T.UnsignedIntType);
          state = { refraction, reflection: new T.WebGLRenderTarget(initialSize.width, initialSize.height,
              { type: T.HalfFloatType }), mirror: viewCamera.clone(),
            reflectMatrix: new T.Matrix4(), inverseViewProjection: new T.Matrix4(), frame: 0, reflectionValid: false, reflectionOffset: viewCamera === camera ? 0 : 1 };
          views.set(viewCamera, state);
          allocatedViews.add(state);
        }
        return state;
      }
      function sizeState(state, size) {
        if (state.refraction.width === size.width && state.refraction.height === size.height) return;
        state.refraction.setSize(size.width, size.height);
        state.reflection.setSize(size.width, size.height);
        state.frame = 0; state.reflectionValid = false; // A resized capture has no valid pixels yet.
      }
      const bias = new T.Matrix4().set(.5,0,0,.5, 0,.5,0,.5, 0,0,.5,.5, 0,0,0,1);
      const uniforms = {
        tBelow: { value: null }, tMirror: { value: null }, tDepth: { value: null },
        belowInverseViewProjection: { value: new T.Matrix4() },
        waterBoundsMin: { value: new T.Vector3(-width / 2, 0, -depth / 2) },
        waterBoundsMax: { value: new T.Vector3(width / 2, level, depth / 2) },
        extinction: { value: new T.Vector3(6, 5, 8) },
        viewDirection: { value: new T.Vector3() }, orthographicView: { value: 0 },
        time: { value: 0 }, impact: { value: 0 }, center: { value: new T.Vector2() },
        mirrorMatrix: { value: new T.Matrix4() }, eye: { value: camera.position.clone() },
        surfaceTransparency: { value: .35 }, waterTint: { value: new T.Color(waterPalette.surface) },
        transmissionTint: { value: new T.Vector3(.84, .90, .67) },
        sunDirection: { value: new T.Vector3(-.4, 1, .5).normalize() },
        sunRadiance: { value: new T.Color(2, 1.9, 1.76) },
        ambientIrradiance: { value: new T.Color(.5, .5, .5) }
      };
      const sunPosition = new T.Vector3(), sunTarget = new T.Vector3();
      function updateLighting() {
        if (lighting.sun) {
          lighting.sun.getWorldPosition(sunPosition);
          lighting.sun.target.getWorldPosition(sunTarget);
          const direction = uniforms.sunDirection.value.copy(sunPosition).sub(sunTarget);
          if (direction.lengthSq() > 1e-12) direction.normalize();
          else direction.set(0, 1, 0);
          uniforms.sunRadiance.value.copy(lighting.sun.color).multiplyScalar(Math.max(0, lighting.sun.intensity));
        }
        if (lighting.ambient) {
          uniforms.ambientIrradiance.value.copy(lighting.ambient.color).multiplyScalar(Math.max(0, lighting.ambient.intensity) * .7);
        }
      }
      updateLighting();
      // Both the surface and the original tank volume integrate the SAME medium.
      // Depth is from the original scene, never a guessed constant bottom depth.
      const mediumShader = `
        uniform sampler2D tDepth;
        uniform mat4 belowInverseViewProjection;
        uniform vec3 waterBoundsMin; uniform vec3 waterBoundsMax;
        uniform vec3 extinction;
        vec3 worldAt(vec2 uv,float z){
          vec4 p=belowInverseViewProjection*vec4(uv*2.-1.,z*2.-1.,1.);
          return p.xyz/p.w;
        }
        float waterPathLength(vec2 uv){
          vec3 origin=worldAt(uv,0.);
          vec3 delta=worldAt(uv,texture2D(tDepth,uv).r)-origin;
          // Slab intersection of the near-to-visible-hit segment with real water bounds.
          // Segment parameters, not view-space depth, work for BOTH projection types.
          vec3 safeDelta=mix(vec3(.0000001),delta,step(vec3(.0000001),abs(delta)));
          vec3 a=(waterBoundsMin-origin)/safeDelta;
          vec3 b=(waterBoundsMax-origin)/safeDelta;
          vec3 lo=min(a,b),hi=max(a,b);
          float enter=max(0.,max(lo.x,max(lo.y,lo.z)));
          float leave=min(1.,min(hi.x,min(hi.y,hi.z)));
          return max(0.,leave-enter)*length(delta);
        }
        vec3 mediumTransmission(float distanceInWater){
          if(surfaceTransparency<=0.)return vec3(0.);
          float density=(1.-surfaceTransparency)/max(surfaceTransparency,.02);
          // Beer-Lambert attenuation: shallow objects remain; deep contrast disappears.
          return exp(-extinction*density*distanceInWater)
            *pow(transmissionTint,vec3(distanceInWater));
        }
      `;
      const material = new T.ShaderMaterial({
        uniforms, side: T.DoubleSide,
        vertexShader: `varying vec3 vWorld; varying vec4 vClip; varying vec4 vMirror;
          uniform float time; uniform float impact; uniform vec2 center; uniform mat4 mirrorMatrix;
          void main(){ vec3 p=position; float r=distance(p.xz,center);
            p.y += .00012*sin(p.x*22.+time*.8)*cos(p.z*29.-time*.65)
              + impact*.0012*sin(r*90.-time*10.)*exp(-r*8.);
            vec4 world=modelMatrix*vec4(p,1.); vWorld=world.xyz;
            vClip=projectionMatrix*viewMatrix*world; vMirror=mirrorMatrix*world; gl_Position=vClip; }`,
        fragmentShader: `uniform sampler2D tBelow; uniform sampler2D tMirror;
          uniform float surfaceTransparency; uniform vec3 waterTint; uniform vec3 transmissionTint;
          uniform vec3 sunDirection; uniform vec3 sunRadiance; uniform vec3 ambientIrradiance;
          uniform float time; uniform float impact; uniform vec2 center; uniform vec3 eye;
          uniform vec3 viewDirection; uniform float orthographicView;
          varying vec3 vWorld; varying vec4 vClip; varying vec4 vMirror;
          ${mediumShader}
          void main(){vec2 q=vWorld.xz; float r=distance(q,center);
            vec2 slope=vec2(cos(q.x*22.+time*.8)*.0026, -sin(q.y*29.-time*.65)*.0035);
            slope += normalize(q-center+vec2(.00001))*impact*.016*cos(r*90.-time*10.)*exp(-r*8.);
            vec3 n=normalize(vec3(-slope.x,1.,-slope.y));
            vec3 v=orthographicView>.5?-viewDirection:normalize(eye-vWorld); float ndv=abs(dot(n,v));
            // Exact unpolarized dielectric Fresnel, including underwater total internal reflection.
            float eta=eye.y>vWorld.y?1./1.333:1.333;
            float st2=eta*eta*(1.-ndv*ndv);
            float ct=sqrt(max(0.,1.-st2));
            float rs=(eta*ndv-ct)/max(.00001,eta*ndv+ct);
            float rp=(ndv-eta*ct)/max(.00001,ndv+eta*ct);
            float f=st2>=1.?1.:.5*(rs*rs+rp*rp);
            vec2 uv=vClip.xy/vClip.w*.5+.5;
            vec2 rm=vMirror.xy/vMirror.w;
            vec2 sampleUV=clamp(uv+slope*.12,vec2(.001),vec2(.999));
            vec3 below=texture2D(tBelow,sampleUV).rgb;
            vec3 reflected=texture2D(tMirror,clamp(rm+slope*.08,vec2(.001),vec2(.999))).rgb;
            float distanceInWater=waterPathLength(sampleUV);
            // Approximate Snell-bent optical length; screen-space refraction is not ray tracing.
            if(eye.y>vWorld.y)distanceInWater*=ndv/max(ct,.1);
            vec3 transmission=mediumTransmission(distanceInWater);
            vec3 waterScatter=waterTint*(ambientIrradiance+sunRadiance*max(dot(n,sunDirection),0.)*.25);
            below=mix(waterScatter,below,transmission);
            vec3 c=mix(below,reflected,clamp(f,.02,1.));
            vec3 l=normalize(sunDirection); vec3 h=normalize(l+v);
            c+=sunRadiance*pow(max(dot(n,h),0.),650.)*.065;
            gl_FragColor=vec4(c,1.);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`
      });
      // This replaces the old faint flat tint on the ORIGINAL waterVol box.
      // Captures hide that box, so no pixel is fogged twice and no dry geometry is fogged.
      const volumeMaterial = new T.ShaderMaterial({
        uniforms, transparent: true, depthWrite: false, side: T.FrontSide,
        vertexShader: `varying vec4 vClip; varying float vNormalY;
          void main(){vNormalY=normal.y;vClip=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position=vClip;}`,
        fragmentShader: `uniform sampler2D tBelow;
          uniform float surfaceTransparency; uniform vec3 transmissionTint;
          uniform vec3 waterTint; uniform vec3 ambientIrradiance;
          uniform vec3 sunRadiance; uniform vec3 sunDirection;
          varying vec4 vClip; varying float vNormalY;
          ${mediumShader}
          void main(){
            // Only lateral boundaries: the original wavy surface owns top Fresnel/reflection.
            // An opaque optical composite on the box lid would overwrite that real surface.
            if(abs(vNormalY)>.5)discard;
            vec2 uv=clamp(vClip.xy/vClip.w*.5+.5,vec2(.001),vec2(.999));
            vec3 source=texture2D(tBelow,uv).rgb;
            vec3 transmission=mediumTransmission(waterPathLength(uv));
            vec3 scatter=waterTint*(ambientIrradiance+sunRadiance*max(sunDirection.y,0.)*.25);
            gl_FragColor=vec4(mix(scatter,source,transmission),1.);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`
      });
      const geometry = new T.PlaneGeometry(width, depth, 100, 50);
      geometry.rotateX(-Math.PI/2);
      const mesh = new T.Mesh(geometry, material);
      mesh.position.y=level; scene.add(mesh);
      const target = new T.Vector3(), eye = new T.Vector3(), rotation = new T.Quaternion();
      function bindCamera(viewCamera = camera) {
        const state = viewState(viewCamera);
        uniforms.tBelow.value = state.refraction.texture;
        uniforms.tDepth.value = state.refraction.depthTexture;
        uniforms.tMirror.value = state.reflection.texture;
        uniforms.mirrorMatrix.value = state.reflectMatrix;
        viewCamera.getWorldPosition(uniforms.eye.value);
        viewCamera.getWorldDirection(uniforms.viewDirection.value);
        uniforms.orthographicView.value = viewCamera.isOrthographicCamera ? 1 : 0;
        state.inverseViewProjection.multiplyMatrices(viewCamera.matrixWorld, viewCamera.projectionMatrixInverse);
        uniforms.belowInverseViewProjection.value = state.inverseViewProjection;
        return state;
      }
      return {
        mesh, volumeMaterial,
        bindCamera,
        setQuality({opticalScale: scale = 1, reflectionInterval: interval = 3} = {}) {
          opticalScale = Math.max(.35, Math.min(1, Number(scale) || 1));
          reflectionInterval = Math.max(1, Math.min(12, Math.round(Number(interval) || 3)));
        },
        dispose() {
          for (const state of allocatedViews) { state.refraction.dispose(); state.reflection.dispose(); }
          allocatedViews.clear();
          geometry.dispose(); material.dispose(); volumeMaterial.dispose(); scene.remove(mesh);
        },
        setSurfaceTransparency(value) {
          if (Number.isFinite(value)) uniforms.surfaceTransparency.value = Math.max(0, Math.min(1, value));
          return uniforms.surfaceTransparency.value;
        },
        snapshot() { return {
          surfaceTransparency: uniforms.surfaceTransparency.value,
          opticalScale, reflectionInterval,
          attenuationModel: 'beer-lambert-depth', volumeScattering: true,
          extinction: uniforms.extinction.value.toArray(),
          waterColor: uniforms.waterTint.value.getHexString(),
          sunDirection: uniforms.sunDirection.value.toArray(),
          sunRadiance: uniforms.sunRadiance.value.toArray(),
          ambientIrradiance: uniforms.ambientIrradiance.value.toArray()
        }; },
        update(time, impact, center) {
          updateLighting();
          uniforms.time.value=time; uniforms.impact.value=impact;
          uniforms.center.value.set(center.x,center.z);
          camera.getWorldPosition(uniforms.eye.value);
        },
        resize(w,h) {
          primarySize = { width: w, height: h };
          const state = views.get(camera);
          if (state) sizeState(state, captureSize(primarySize));
        },
        capture(hidden = [], viewCamera = camera, viewport = primarySize) {
          const state = viewState(viewCamera);
          sizeState(state, captureSize(viewport));
          bindCamera(viewCamera);
          const prev = renderer.getRenderTarget();
          const cubeFace = renderer.getActiveCubeFace ? renderer.getActiveCubeFace() : 0;
          const mipLevel = renderer.getActiveMipmapLevel ? renderer.getActiveMipmapLevel() : 0;
          const prevViewport = renderer.getViewport(new T.Vector4());
          const prevScissor = renderer.getScissor(new T.Vector4());
          const prevScissorTest = renderer.getScissorTest();
          const clippingPlanes = renderer.clippingPlanes, autoClear = renderer.autoClear;
          // Deduplicate, including the water itself, before changing visibility.
          const visibility = new Map([mesh, ...hidden].map(object => [object, object.visible]));
          const renderTarget = (buffer, renderCamera) => {
            renderer.setRenderTarget(buffer);
            // Do NOT call renderer.setViewport(0, 0, buffer.width, buffer.height) here:
            // setViewport stores CSS-like values and multiplies them by the renderer's
            // pixel ratio, which only applies to the canvas drawing buffer. Rendering
            // into a render target already uses the target's own device-pixel viewport
            // (see three.js setRenderTarget / RenderTarget.setSize). Scaling it again
            // zoomed/cropped every optical capture whenever the adaptive pixel ratio
            // was not exactly 1 (e.g. 0.82/0.66/1.5), leaving ghost floats in the
            // observation window and stale rectangles in the water.
            renderer.setScissorTest(false);
            renderer.autoClear = true;
            renderer.render(scene, renderCamera);
          };
          try {
            for (const object of visibility.keys()) object.visible = false;
            renderTarget(state.refraction, viewCamera);
            if (!state.reflectionValid || (state.frame + state.reflectionOffset) % reflectionInterval === 0) {
              const mirror = state.mirror;
              // copy preserves either projection type, zoom, view offsets and layers.
              mirror.copy(viewCamera);
              mirror.matrixAutoUpdate = true;
              viewCamera.getWorldPosition(eye);
              mirror.position.copy(eye); mirror.position.y = 2 * level - eye.y;
              viewCamera.getWorldDirection(target); target.add(eye);
              target.y = 2 * level - target.y;
              viewCamera.getWorldQuaternion(rotation);
              mirror.up.set(0, 1, 0).applyQuaternion(rotation);
              mirror.up.y *= -1;
              mirror.lookAt(target); mirror.updateMatrixWorld(true);
              state.reflectMatrix.copy(bias).multiply(mirror.projectionMatrix).multiply(mirror.matrixWorldInverse);
              const side = eye.y >= level ? 1 : -1;
              renderer.clippingPlanes = [new T.Plane(new T.Vector3(0, side, 0), -side * level + .0002)];
              renderTarget(state.reflection, mirror);
              state.reflectionValid = true;
            }
            state.frame++;
          } finally {
            for (const [object, visible] of visibility) object.visible = visible;
            renderer.clippingPlanes = clippingPlanes;
            renderer.autoClear = autoClear;
            // Target changes can reset rectangles, so restore them afterwards.
            renderer.setRenderTarget(prev, cubeFace, mipLevel);
            renderer.setViewport(prevViewport);
            renderer.setScissor(prevScissor);
            renderer.setScissorTest(prevScissorTest);
          }
        }
      };
    },
    // A small wetting meniscus; visual only (surface tension excluded from the bulk solver).
    createMeniscus(scene) {
      const geo=new T.RingGeometry(1,3.6,64,10);geo.rotateX(-Math.PI/2);
      const a=geo.attributes.position;
      for(let i=0;i<a.count;i++){const r=Math.hypot(a.getX(i),a.getZ(i));a.setY(i,.45*Math.exp(-(r-1)*2.4));}
      geo.computeVertexNormals();
      const mesh=new T.Mesh(geo,new T.MeshPhysicalMaterial({color:0xa8d7ce,roughness:.1,
        metalness:0,transparent:true,opacity:.28,side:T.DoubleSide,depthWrite:false,clearcoat:1}));
      mesh.renderOrder=5;scene.add(mesh);return mesh;
    },
    addMicroSurface(material, scale, strength) {
      material.onBeforeCompile=shader=>{
        shader.vertexShader='varying vec3 vMicroPosition;\n'+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvMicroPosition=position;');
        shader.fragmentShader='varying vec3 vMicroPosition;\n'+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
          float grain=sin(vMicroPosition.x*${scale.toFixed(1)})*sin(vMicroPosition.y*${(scale*.71).toFixed(1)})*sin(vMicroPosition.z*${(scale*1.3).toFixed(1)});
          normal=normalize(normal+vec3(grain,grain*.41,-grain*.63)*${strength.toFixed(4)});`);
      };
      material.customProgramCacheKey=()=>`micro-${scale}-${strength}`;
      return material;
    }
  };
})();
