/* A real second camera into the SAME scene. No cloned rig, lights or backdrop. */
(function(global){
  'use strict';
  function create(options){
    const {THREE:T,renderer,scene,source,beforeRender,afterRender}=options;
    if(!T||!renderer||!scene||!source)throw new Error('FloatScope requires THREE, renderer, scene and source');
    const floatLength=options.floatLength===undefined?.26:options.floatLength;
    const tipLength=options.tipLength===undefined?.125:options.tipLength;
    const bandLength=options.bandLength===undefined?.0157:options.bandLength;
    const waterY=options.waterY===undefined?.83:options.waterY;
    const elevation=20*Math.PI/180,sin=Math.sin(elevation),cos=Math.cos(elevation);
    const baseField=.24,waterFraction=.56;
    const camera=new T.OrthographicCamera(-.1,.1,.1,-.1,.01,10);
    camera.name='float-observation-camera';
    const target=new T.Vector3(),top=new T.Vector3(),axis=new T.Vector3();
    const size=new T.Vector2(),savedViewport=new T.Vector4(),savedScissor=new T.Vector4();
    const meshes=[];
    // Framing centre follows the float with a fixed wall-clock delay instead of
    // snapping: when the float is dragged sideways it visibly shifts inside the
    // window first, then the camera pans over. Vertical exposure is not tracked
    // (the base field is fixed), so bobbing/顿口 remain directly visible too.
    const followDelay=Math.max(0,options.followDelay===undefined?1.2:(Number(options.followDelay)||0));
    const clock=typeof options.now==='function'?options.now
      :()=>global.performance&&typeof global.performance.now==='function'?global.performance.now():Date.now();
    const followHistory=[];
    function delayedFollow(x,z,f){
      if(!(followDelay>0))return{x,z,f};
      const t=clock();
      const previous=followHistory[followHistory.length-1];
      if(previous&&(Math.hypot(x-previous.x,z-previous.z)>.15||Math.abs(f-previous.f)>.12)){
        // A reset/recast/parameter edit is a discontinuity, not observed drift:
        // snap the observer instead of replaying a one-second fly-in.
        followHistory.length=0;
        followHistory.push({t,x,z,f});
        return{x,z,f};
      }
      followHistory.push({t,x,z,f});
      const horizon=t-followDelay*1000;
      // Keep a one-second tail so interpolation never runs out of samples.
      while(followHistory.length>2&&followHistory[0].t<horizon-1000)followHistory.shift();
      if(followHistory[0].t>horizon)return{x:followHistory[0].x,z:followHistory[0].z,f:followHistory[0].f};
      let i=followHistory.length-1;
      while(i>0&&followHistory[i].t>horizon)i--;
      const a=followHistory[i],b=followHistory[Math.min(i+1,followHistory.length-1)];
      const u=b.t>a.t?Math.max(0,Math.min(1,(horizon-a.t)/(b.t-a.t))):1;
      return{x:a.x+(b.x-a.x)*u,z:a.z+(b.z-a.z)*u,f:a.f+(b.f-a.f)*u};
    }
    // Geometry is examined solely for framing. It is never copied or modified.
    source.traverse(object=>{
      if(object.isMesh&&object.geometry&&object.geometry.attributes.position){
        const position=object.geometry.attributes.position;
        meshes.push({object,position,world:new Float64Array(position.count*3),indices:object.geometry.index&&object.geometry.index.array});
      }
    });
    let last={rendered:false};
    const dom=id=>global.document.getElementById(id);
    function setText(id,text){const element=dom(id);if(element&&element.textContent!==text)element.textContent=text;}
    function render(state){
      last.rendered=false;
      source.updateWorldMatrix(true,true);
      top.setFromMatrixPosition(source.matrixWorld);
      axis.set(0,1,0).transformDirection(source.matrixWorld);
      let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
      let minV=Infinity,maxV=-Infinity,minMirrorV=Infinity,highest=-Infinity;
      function include(x,y,z){
        minX=Math.min(minX,x);maxX=Math.max(maxX,x);
        minZ=Math.min(minZ,z);maxZ=Math.max(maxZ,z);
        const v=cos*(y-waterY)-sin*z;
        minV=Math.min(minV,v);maxV=Math.max(maxV,v);
        // Reserve space for reflection from the real water's optical capture.
        minMirrorV=Math.min(minMirrorV,-cos*(y-waterY)-sin*z);
      }
      function crossing(world,a,b){
        const ay=world[a+1],by=world[b+1];
        if((ay<waterY&&by>waterY)||(ay>waterY&&by<waterY)){
          const t=(waterY-ay)/(by-ay);
          include(world[a]+(world[b]-world[a])*t,waterY,world[a+2]+(world[b+2]-world[a+2])*t);
        }
      }
      for(const mesh of meshes){
        let visible=true;
        for(let object=mesh.object;object&&object!==scene;object=object.parent){if(!object.visible){visible=false;break;}}
        if(!visible)continue;
        const p=mesh.position,w=mesh.world,m=mesh.object.matrixWorld.elements;
        for(let i=0;i<p.count;i++){
          const x=p.getX(i),y=p.getY(i),z=p.getZ(i),j=i*3;
          w[j]=m[0]*x+m[4]*y+m[8]*z+m[12];
          w[j+1]=m[1]*x+m[5]*y+m[9]*z+m[13];
          w[j+2]=m[2]*x+m[6]*y+m[10]*z+m[14];
          highest=Math.max(highest,w[j+1]);
          if(w[j+1]>=waterY)include(w[j],w[j+1],w[j+2]);
        }
        const index=mesh.indices,count=index?index.length:p.count;
        for(let i=0;i+2<count;i+=3){
          const a=(index?index[i]:i)*3,b=(index?index[i+1]:i+1)*3,c=(index?index[i+2]:i+2)*3;
          crossing(w,a,b);crossing(w,b,c);crossing(w,c,a);
        }
      }
      const submerged=highest<=waterY,vertical=top.y-waterY,footVertical=vertical-axis.y*floatLength;
      let exposedLength=0;
      if(vertical>=0&&footVertical>=0)exposedLength=floatLength;
      else if(vertical>0||footVertical>0)exposedLength=floatLength*Math.max(vertical,footVertical)/Math.abs(vertical-footVertical);
      const hudVertical=state&&state.nodes&&state.nodes.floatTop?state.nodes.floatTop.y-waterY:vertical;
      const evaluation=state&&state.evaluation;
      const tilt=evaluation&&Number.isFinite(evaluation.tiltRad)?evaluation.tiltRad:Math.acos(Math.max(-1,Math.min(1,axis.y)));
      const degrees=tilt*180/Math.PI,axial=hudVertical/Math.max(.001,Math.cos(tilt));
      const marksValid=degrees<20&&axial>=0&&axial<=tipLength;
      if(submerged){setText('floatScopeReading','全部没入');setText('floatScopeState','水面以上无可见漂体');}
      else if(degrees>=20){setText('floatScopeReading',degrees.toFixed(0)+'°');setText('floatScopeState','漂体倾角 · 不读漂目');}
      else if(marksValid){setText('floatScopeReading',(axial/bandLength).toFixed(1)+' 目');setText('floatScopeState','露出漂目 · 已校正倾角');}
      else{setText('floatScopeReading',(Math.abs(hudVertical)*1000).toFixed(0)+' mm');setText('floatScopeState',hudVertical<0?'漂尖没入 · 不读漂目':'漂身出水');}
      const section=dom('floatScope');if(section)section.dataset.submerged=String(submerged);
      const view=dom('floatScopeView'),rect=view&&view.getBoundingClientRect(),canvasRect=renderer.domElement.getBoundingClientRect();
      renderer.getSize(size);
      let viewport={x:0,y:0,width:0,height:0},cssTop=0,cssHeight=0;
      if(rect&&canvasRect.width>0&&canvasRect.height>0){
        const left=Math.max(rect.left,canvasRect.left,0),right=Math.min(rect.right,canvasRect.right,global.innerWidth||Infinity);
        const upper=Math.max(rect.top,canvasRect.top,0),bottom=Math.min(rect.bottom,canvasRect.bottom,global.innerHeight||Infinity);
        const sx=size.x/canvasRect.width,sy=size.y/canvasRect.height;
        viewport={x:(left-canvasRect.left)*sx,y:(canvasRect.bottom-bottom)*sy,width:Math.max(0,right-left)*sx,height:Math.max(0,bottom-upper)*sy};
        cssTop=upper-rect.top;cssHeight=Math.max(0,bottom-upper);
      }
      const aspect=viewport.width>0&&viewport.height>0?viewport.width/viewport.height:.75;
      const rawFollowX=submerged?top.x:(minX+maxX)/2,rawFollowZ=submerged?top.z:(minZ+maxZ)/2;
      let rawFieldHeight=baseField;
      if(!submerged&&Number.isFinite(minV)&&aspect>0){
        const above=maxV+sin*rawFollowZ,below=Math.min(minV,minMirrorV)+sin*rawFollowZ;
        rawFieldHeight=Math.max(baseField,(maxX-minX)/(aspect*.88),above/(waterFraction-.06),-below/(1-waterFraction-.06));
      }
      // The delayed observer keeps pan, tilt framing and zoom from reacting instantly:
      // a drift/dip is seen moving first, then the camera settles over it.
      const follow=delayedFollow(rawFollowX,rawFollowZ,rawFieldHeight);
      const fieldHeight=follow.f;
      target.set(follow.x,waterY+(waterFraction-.5)*fieldHeight/cos,follow.z);
      camera.position.copy(target).add(new T.Vector3(0,sin,cos));camera.lookAt(target);
      camera.left=-fieldHeight*aspect/2;camera.right=fieldHeight*aspect/2;camera.top=fieldHeight/2;camera.bottom=-fieldHeight/2;
      camera.updateProjectionMatrix();camera.updateMatrixWorld();
      const waterline=dom('floatScopeWaterline');if(waterline)waterline.style.top=(cssTop+cssHeight*waterFraction)+'px';
      last={elevationDegrees:20,followDelaySeconds:followDelay,followLagging:followDelay>0,
        followCenter:{x:follow.x,z:follow.z},rawFollowCenter:{x:rawFollowX,z:rawFollowZ},
        rawFieldHeightM:rawFieldHeight,
        camera:{position:camera.position.toArray(),target:target.toArray(),uuid:camera.uuid},
        sourceTop:top.toArray(),sourceAxis:axis.toArray(),sourceUuid:source.uuid,sceneUuid:scene.uuid,
        exposedLengthM:submerged?0:exposedLength,submerged,waterY,fieldHeightM:fieldHeight,viewport,
        sameScene:true,viewStyle:'scene-camera',clippingAboveWater:false,waterlineVisible:false,rendered:false,
        projection:{type:'orthographic',left:camera.left,right:camera.right,top:camera.top,bottom:camera.bottom,near:camera.near,far:camera.far,waterlineFraction:waterFraction},
        tiltDegrees:degrees,marks:!submerged&&marksValid?axial/bandLength:null};
      if(!view||viewport.width<=0||viewport.height<=0||(view.getClientRects&&view.getClientRects().length===0))return;
      renderer.getViewport(savedViewport);renderer.getScissor(savedScissor);
      const saved={scissorTest:renderer.getScissorTest(),clippingPlanes:renderer.clippingPlanes,localClippingEnabled:renderer.localClippingEnabled,
        autoClear:renderer.autoClear,target:renderer.getRenderTarget(),cubeFace:renderer.getActiveCubeFace?renderer.getActiveCubeFace():0,mipLevel:renderer.getActiveMipmapLevel?renderer.getActiveMipmapLevel():0};
      try{
        if(beforeRender)beforeRender(camera,viewport);
        renderer.setRenderTarget(null);
        renderer.setViewport(viewport.x,viewport.y,viewport.width,viewport.height);
        renderer.setScissor(viewport.x,viewport.y,viewport.width,viewport.height);renderer.setScissorTest(true);
        renderer.autoClear=true;
        // This is the exact scene rendered in the main viewport: original objects,
        // lights, materials, water, occlusion and callbacks. Only the camera differs.
        renderer.render(scene,camera);last.rendered=true;
      }finally{
        try{if(afterRender)afterRender(camera);}finally{
          renderer.clippingPlanes=saved.clippingPlanes;renderer.localClippingEnabled=saved.localClippingEnabled;renderer.autoClear=saved.autoClear;
          renderer.setRenderTarget(saved.target,saved.cubeFace,saved.mipLevel);renderer.setViewport(savedViewport);renderer.setScissor(savedScissor);renderer.setScissorTest(saved.scissorTest);
        }
      }
    }
    return{render,snapshot:()=>JSON.parse(JSON.stringify(last)),resize:()=>{last.rendered=false;}};
  }
  global.FloatScope={create};
})(window);
