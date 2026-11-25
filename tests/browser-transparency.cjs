'use strict';
module.exports=async function({send,evaluate}){
  let passed=0;
  const assert=(condition,message)=>{if(!condition)throw new Error(message);passed++;};
  const frames=()=>evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(r))))');
  await evaluate(`(()=>{
    if(!floatLab.getState().paused)document.getElementById('btnPause').click();
    floatLab.settle(20);
    document.getElementById('physicsPanel').open=true;
    document.getElementById('environmentControls').open=true;
    document.getElementById('waterTransparency').scrollIntoView({block:'nearest'});
  })()`);
  // OrbitControls damping and startup camera tweens can outlast a fixed delay.
  // Measure only after the real view settles; keep exact framebuffer assertions.
  await evaluate(`new Promise((resolve,reject)=>{
    let previous=null,stable=0,count=0;
    function check(){
      const camera=floatLab.getRenderState().camera;
      const pose=[...camera.position,...camera.target];
      const unchanged=previous&&pose.every((value,index)=>Math.abs(value-previous[index])<=1e-12);
      stable=!camera.transitioning&&unchanged?stable+1:0;
      previous=pose;
      if(stable>=8)return resolve();
      if(++count>=240)return reject(new Error('Camera did not settle within 240 RAF frames: '+JSON.stringify(camera)));
      requestAnimationFrame(check);
    }
    requestAnimationFrame(check);
  })`);
  const baseline=await evaluate('JSON.stringify(floatLab.getState())');
  const initial=await evaluate('floatLab.getRenderState()');
  assert(initial.waterOptics.surfaceTransparency===.35,'default lake clarity is 35%');
  assert(initial.waterOptics.attenuationModel==='beer-lambert-depth','snapshot reports depth-based Beer-Lambert attenuation');
  assert(initial.waterOptics.volumeScattering===true,'snapshot reports integrated volume scattering');
  assert(JSON.stringify(initial.waterOptics.extinction)==='[6,5,8]','snapshot reports per-metre RGB extinction');
  const image=()=>evaluate(`new Promise(resolve=>requestAnimationFrame(()=>{
    const renderer=floatLab.renderer,gl=renderer.getContext(),ratio=renderer.getPixelRatio();
    const q=floatLab.getRenderState().floatScope.viewport;
    function signature(x,y,w,h){
      x=Math.floor(x*ratio);y=Math.floor(y*ratio);w=Math.max(1,Math.floor(w*ratio));h=Math.max(1,Math.floor(h*ratio));
      const pixels=new Uint8Array(w*h*4);gl.readPixels(x,y,w,h,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
      let hash=2166136261,nonzero=0;for(let i=0;i<pixels.length;i++){hash=Math.imul(hash^pixels[i],16777619);if(i%4!==3&&pixels[i])nonzero++;}
      return {hash:hash>>>0,nonzero};
    }
    const size=renderer.getSize(new THREE.Vector2());
    resolve({scope:signature(q.x,q.y,q.width,q.height),main:signature(size.x*.45,0,size.x*.5,size.y)});
  }))`);
  const samples=[];
  for(const percent of [100,35,0,100]){
    await evaluate(`(()=>{const el=document.getElementById('waterTransparency');el.value='${percent}';el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await frames();
    const state=await evaluate(`({render:floatLab.getRenderState(),physics:JSON.stringify(floatLab.getState()),text:document.getElementById('waterTransparencyVal').textContent,aria:document.getElementById('waterTransparency').getAttribute('aria-valuetext')})`);
    assert(Math.abs(state.render.waterOptics.surfaceTransparency-percent/100)<1e-9,percent+'% material uniform');
    assert(state.text===percent+'%'&&state.aria.startsWith(percent+'%'),percent+'% visible and accessible reading');
    assert(state.physics===baseline,percent+'% does not reconfigure or advance physics');
    assert(state.render.sceneUuid===initial.sceneUuid&&state.render.floatScope.sceneUuid===initial.sceneUuid,percent+'% shares original scene');
    assert(state.render.floatUuid===initial.floatUuid&&state.render.floatScope.sourceUuid===initial.floatUuid,percent+'% keeps original float');
    samples.push({percent,...await image()});
  }
  for(const region of ['scope','main']){
    assert(samples.every(s=>s[region].nonzero>0),region+' framebuffer is nonblank');
    assert(samples[0][region].hash!==samples[2][region].hash,region+' visible difference between clear and opaque');
    assert(samples[1][region].hash!==samples[2][region].hash,region+' intermediate transparency is rendered');
    assert(samples[0][region].hash===samples[3][region].hash,region+' clear image restores exactly');
  }
  // Browser-generated keyboard input must drive the same live range control.
  await evaluate("document.getElementById('waterTransparency').focus()");
  for(const [key,code,expected] of [['Home',36,0],['ArrowRight',39,1],['End',35,100]]){
    for(const type of ['keyDown','keyUp'])await send('Input.dispatchKeyEvent',{type,key,code:key,windowsVirtualKeyCode:code,nativeVirtualKeyCode:code});
    const value=await evaluate("({value:Number(document.getElementById('waterTransparency').value),material:floatLab.getRenderState().waterOptics.surfaceTransparency})");
    assert(value.value===expected&&Math.abs(value.material-expected/100)<1e-9,key+' keyboard operation updates actual water');
  }
  const depth=await require('./browser-water-depth.cjs')({evaluate});
  passed+=depth.passed;
  // Leave a useful opaque-water screenshot, with the new control visible.
  await evaluate("(()=>{const el=document.getElementById('waterTransparency');el.value='0';el.dispatchEvent(new Event('input',{bubbles:true}));el.blur();})()");
  await frames();
  return{passed,samples,depth};
};
