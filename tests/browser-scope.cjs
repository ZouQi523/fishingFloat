/* Real-browser integration checks for the independent live observation window. */
module.exports=async function({send,evaluate}){
  let checks=0;
  const assert=(ok,message)=>{if(!ok)throw Error('Float scope: '+message);checks++;};
  const frame=()=>evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
  const inspect=()=>evaluate(`(()=>{
    const lab=floatLab,s=lab.getState(),r=lab.getRenderState(),v=document.getElementById('floatScopeView').getBoundingClientRect(),p=document.getElementById('floatScope').getBoundingClientRect(),h=document.getElementById('hud').getBoundingClientRect(),b=document.getElementById('observationBar').getBoundingClientRect();
    return {s,r,view:{x:v.x,y:v.y,width:v.width,height:v.height},panel:{x:p.x,y:p.y,right:p.right,bottom:p.bottom},hudBottom:h.bottom,barTop:b.top,reading:document.getElementById('floatScopeReading').textContent,status:document.getElementById('floatScopeState').textContent,reference:parseFloat(document.getElementById('floatScopeWaterline').style.top),renderer:{viewport:lab.renderer.getViewport(new THREE.Vector4()).toArray(),scissorTest:lab.renderer.getScissorTest(),clipping:lab.renderer.clippingPlanes.length,localClipping:lab.renderer.localClippingEnabled,target:lab.renderer.getRenderTarget(),autoClear:lab.renderer.autoClear},width:innerWidth,height:innerHeight};
  })()`);
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const near=(a,b,tol=1e-7)=>Math.abs(a-b)<tol;
  const check=async()=>{
    await frame();const x=await inspect(),q=x.r.floatScope;
    assert(q.rendered,'viewport rendered');
    assert(q.elevationDegrees===20,'20 degree diagnostic');
    assert(q.followDelaySeconds===1.2&&q.followLagging===true,'scope camera pans with a finite 1.2 s delay');
    const d=q.camera.position.map((v,i)=>v-q.camera.target[i]);
    assert(near(Math.atan2(d[1],Math.hypot(d[0],d[2]))*180/Math.PI,20),'actual camera elevation');
    assert(q.sameScene&&q.sceneUuid===x.r.sceneUuid&&q.sourceUuid===x.r.floatUuid,'second camera observes original scene and original float');
    assert(!q.clippingAboveWater&&near(q.waterY,x.s.options.waterY),'actual scene water and occlusion, not an isolated clipped float');
    assert(q.sourceTop.every((v,i)=>near(v,x.r.floatTop[i])),'source float position synchronized');
    assert(q.sourceAxis.every((v,i)=>near(v,x.r.floatAxis[i])),'source float tilt synchronized');
    assert(near(q.viewport.x,x.view.x)&&near(q.viewport.y,x.height-x.view.y-x.view.height),'viewport follows DOM slot');
    assert(near(q.viewport.width,x.view.width)&&near(q.viewport.height,x.view.height),'viewport dimensions match DOM');
    assert(x.panel.x>=0&&x.panel.right<=x.width+1&&x.panel.bottom<=x.barTop-10,'panel remains onscreen above toolbar');
    assert(near(x.reference/x.view.height,.56),'contact framing stays fixed at 56%');
    assert(q.viewStyle==='scene-camera'&&!q.waterlineVisible,'actual scene camera without fake water background or waterline');
    assert(same(x.renderer.viewport,[0,0,x.width,x.height]),'main viewport restored');
    assert(!x.renderer.scissorTest&&!x.renderer.clipping&&!x.renderer.localClipping&&x.renderer.target===null&&x.renderer.autoClear,'renderer state restored');
    if(q.marks!==null)assert(x.reading===q.marks.toFixed(1)+' 目','reading matches physical marks');
    return x;
  };
  await evaluate('document.getElementById("btnPause").click()');
  // First-use shader compilation can postpone initial camera frames beyond the
  // navigation delay. Do not mistake an unfinished preset tween for a click.
  await evaluate('new Promise(resolve=>{function stable(){if(!floatLab.getRenderState().camera.transitioning)resolve();else requestAnimationFrame(stable);}requestAnimationFrame(stable);})');
  // The delayed observer needs one full delay period with a static float before
  // comparisons: earlier history still contains the load-time settling motion.
  await evaluate('new Promise(r=>setTimeout(r,1600))');
  let first=await check();
  assert(first.s.paused,'pause for deterministic checks');
  const before=first.s,cam=first.r.camera;
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x:first.view.x+first.view.width/2,y:first.view.y+first.view.height/2,button:'left',clickCount:1});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:first.view.x+first.view.width/2,y:first.view.y+first.view.height/2,button:'left',clickCount:1});
  let now=await check();
  assert(same(before.nodes,now.s.nodes)&&same(before.options,now.s.options)&&before.time===now.s.time,'read-only window cannot alter rig');
  // OrbitControls can round-trip spherical coordinates by machine epsilon.
  assert(cam.viewMode===now.r.camera.viewMode&&cam.transitioning===now.r.camera.transitioning&&cam.position.every((v,i)=>near(v,now.r.camera.position[i]))&&cam.target.every((v,i)=>near(v,now.r.camera.target[i])),'scope click cannot orbit main camera: '+JSON.stringify({before:cam,after:now.r.camera}));
  const doubleClick=async view=>{
    const point={x:view.x+view.width/2,y:view.y+view.height/2,button:'left',clickCount:2};
    await send('Input.dispatchMouseEvent',{type:'mousePressed',...point});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',...point});
  };
  const normalSize={width:now.view.width,height:now.view.height};
  await doubleClick(now.view);now=await check();
  assert(now.view.width>normalSize.width*1.2&&now.view.height>normalSize.height,'real double click enlarges live viewport');
  assert(await evaluate('document.getElementById("floatScopeZoom").getAttribute("aria-expanded")==="true"'),'expanded state is accessible');
  assert(same(before.nodes,now.s.nodes)&&same(before.options,now.s.options)&&before.time===now.s.time,'enlarging never changes physics');
  await doubleClick(now.view);now=await check();
  assert(near(now.view.width,normalSize.width)&&near(now.view.height,normalSize.height),'second real double click restores original size');
  await evaluate('document.getElementById("floatScopeZoom").click()');now=await check();
  assert(now.view.width>normalSize.width*1.2,'explicit button also enlarges');
  await send('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:1,mobile:false});
  await frame();now=await check();
  assert(await evaluate('document.getElementById("floatScope").dataset.expanded==="true"'),'expanded viewport remains bounded after orientation change');
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await frame();
  await send('Emulation.setDeviceMetricsOverride',{width:first.width,height:first.height,deviceScaleFactor:1,mobile:first.width<621});
  await frame();now=await check();
  assert(near(now.view.width,normalSize.width)&&near(now.view.height,normalSize.height),'Escape restores responsive small layout');
  await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
  const doubleTap=async view=>{
    const point={x:view.x+view.width/2,y:view.y+view.height/2};
    for(let i=0;i<2;i++){
      await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
      await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    }
  };
  await doubleTap(now.view);now=await check();
  assert(now.view.width>normalSize.width*1.2,'real touch double tap enlarges exactly once');
  await doubleTap(now.view);now=await check();
  assert(near(now.view.width,normalSize.width),'real touch double tap restores exactly once');
  await send('Emulation.setTouchEmulationEnabled',{enabled:false});
  await evaluate('floatLab.setView("rig")');
  await new Promise(r=>setTimeout(r,700));
  now=await check();
  assert(same(first.r.floatScope.camera,now.r.floatScope.camera),'scope camera independent of main view');
  await evaluate('floatLab.configure({floatToSwivel:.18,leadMassG:10});floatLab.settle(20)');
  now=await check();
  assert(now.r.floatScope.submerged&&now.r.floatScope.exposedLengthM===0&&now.r.floatScope.marks===null,'fully submerged has no exposed float or marks');
  assert(now.reading==='全部没入'&&now.status.includes('无可见'),'submerged window has explicit empty-state message');
  await evaluate('floatLab.configure({floatToSwivel:.8,leadMassG:4});floatLab.settle(20)');
  now=await check();
  assert(!now.r.floatScope.submerged,'exposed float returns after adjustment');
  assert(now.r.floatScope.fieldHeightM>=.24,'large exposure never shrinks base field');
  if(now.r.floatScope.tiltDegrees>=20)assert(now.r.floatScope.marks===null,'tilted float does not invent marks');
  await evaluate('floatLab.configure({floatToSwivel:.42,leadMassG:4});floatLab.settle(20);floatLab.setView("tank")');
  await new Promise(r=>setTimeout(r,700));
  first=await check();
  await evaluate('document.getElementById("btnAdjustFloat").click()');
  const opened=await inspect();
  assert(await evaluate('document.getElementById("floatScope").inert'),'workshop inerts scope background');
  await new Promise(r=>setTimeout(r,100));
  assert((await inspect()).s.time===opened.s.time,'workbench still freezes simulation');
  await evaluate('document.getElementById("seatCancel").click()');
  now=await check();
  assert(!await evaluate('document.getElementById("floatScope").inert'),'scope restored after workshop cancel');
  assert(same(first.s.options,now.s.options),'cancel preserves rig');
  const original={width:now.width,height:now.height};
  await send('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:1,mobile:false});
  await new Promise(r=>setTimeout(r,700));
  await check();
  await send('Emulation.setDeviceMetricsOverride',{...original,deviceScaleFactor:1,mobile:original.width<621});
  await new Promise(r=>setTimeout(r,700));
  now=await check();
  assert(same(first.s.options,now.s.options),'resize never changes rig');
  return {passed:checks,reading:now.reading,scope:now.r.floatScope};
};
