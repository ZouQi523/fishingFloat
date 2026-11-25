'use strict';
// Real CDP input: tank objects are observation-only; standalone workshops edit seat drafts.
module.exports=async({send,evaluate})=>{
  const checks=[],ok=(v,name)=>{if(!v)throw Error(name);checks.push(name);};
  const wait=()=>evaluate('new Promise(r=>setTimeout(()=>requestAnimationFrame(()=>requestAnimationFrame(r)),700))');
  const tick=()=>evaluate('new Promise(r=>setTimeout(r,40))');
  const key=async(key,code=key,windowsVirtualKeyCode)=>{
    const event={key,code,...(windowsVirtualKeyCode?{windowsVirtualKeyCode}:{})};
    await send('Input.dispatchKeyEvent',{type:'keyDown',...event});
    await send('Input.dispatchKeyEvent',{type:'keyUp',...event});
  };
  const clickPoint=async p=>{
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x,y:p.y});
    await send('Input.dispatchMouseEvent',{type:'mousePressed',x:p.x,y:p.y,button:'left',buttons:1,clickCount:1});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x,y:p.y,button:'left',buttons:0,clickCount:1});
  };
  const elementPoint=async(id,fraction=.5)=>{
    const p=await evaluate(`(()=>{const e=document.getElementById(${JSON.stringify(id)});if(!e)return null;e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return{x:r.left+r.width*${fraction},y:r.top+r.height/2,width:r.width,height:r.height,visible:!!e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden'}})()`);
    ok(p&&p.visible&&p.width>0&&p.height>0,id+' is visible');
    ok(await evaluate(`(()=>{const e=document.getElementById(${JSON.stringify(id)}),hit=document.elementFromPoint(${p.x},${p.y});return e===hit||e.contains(hit)})()`),id+' receives real pointer input');
    return p;
  };
  const click=async id=>clickPoint(await elementPoint(id));
  const mouseDrag=async(p,dx=48,dy=-24,camera=true)=>{
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x,y:p.y});
    await send('Input.dispatchMouseEvent',{type:'mousePressed',x:p.x,y:p.y,button:'left',buttons:1,clickCount:1});
    for(let i=1;i<=6;i++)await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x+dx*i/6,y:p.y+dy*i/6,button:'left',buttons:1});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x+dx,y:p.y+dy,button:'left',buttons:0,clickCount:1});
    await (camera?wait():tick());
  };
  const snapshot=()=>evaluate('({options:floatLab.getState().options,nodes:floatLab.getState().nodes,time:floatLab.getState().time,paused:floatLab.getState().paused,leadMass:floatLab.getState().leadMass,lineMassG:floatLab.getState().evaluation.lineMassG,camera:floatLab.getRenderState().camera,workshop:floatLab.getRenderState().workshop})');
  const unchanged=(before,after)=>JSON.stringify(before.options)===JSON.stringify(after.options)&&JSON.stringify(before.nodes)===JSON.stringify(after.nodes);
  const cameraMoved=(before,after)=>Math.hypot(...after.position.map((n,i)=>n-before.position[i]))>1e-4;
  const inert=async()=>evaluate("(()=>{const i=floatLab.getRenderState().interaction;return i.dragging===null&&i.rigPickingEnabled===false&&i.orbitEnabled&&!document.getElementById('trim').classList.contains('on')})()");
  const modelPoint=async node=>{
    const p=await evaluate(`floatLab.projectPoint(floatLab.getState().nodes.${node})`);
    const hit=await evaluate(`document.elementFromPoint(${p.x},${p.y})?.id`);
    ok(hit==='c',node+' projected model point is exposed canvas: '+JSON.stringify({p,hit}));
    return p;
  };
  const fixedLengths=await evaluate("(()=>{if(!floatLab.getState().paused)document.getElementById('btnPause').click();document.getElementById('physicsPanel').open=false;floatLab.configure({floatToSwivel:.42,leadAboveSwivel:.055});floatLab.settle();const o=floatLab.getState().options;return{main:o.mainLength,leaders:o.leaderLengths}})()");
  await wait();
  ok(await evaluate('floatLab.getState().paused'),'simulation is paused before observation-only interaction checks');
  ok(await evaluate("['sceneLabels','floatHandle','leadHandle','focusReadout','tips'].every(id=>!document.getElementById(id))"),'scene labels, grab handles, numeric focus readout and floating tips are absent');
  ok(await inert(),'rig picking is disabled while camera orbit remains enabled');

  const near=(a,b,t=1e-8)=>Math.abs(a-b)<t;
  const frozen=(a,b)=>unchanged(a,b)&&a.time===b.time;
  const hardwarePoint=()=>evaluate("(()=>{const r=document.getElementById('seatCanvas').getBoundingClientRect(),l=floatLab.getRenderState().workshop.layout;return{x:r.left+l.axisX,y:r.top+l.seatY}})()");
  ok(await evaluate("document.getElementById('seatWorkshop').hidden&&['seatControls','btnSeatDone','floatControl','leadControl'].every(id=>!document.getElementById(id))"),'standalone workshop starts hidden and replaces old HUD slider controls');
  for(const spec of [
    {mode:'float',button:'btnAdjustFloat',option:'floatToSwivel',other:'leadAboveSwivel',reset:42},
    {mode:'lead',button:'btnAdjustLead',option:'leadAboveSwivel',other:'floatToSwivel',reset:5.5}
  ]){
    let before=await snapshot();
    await click(spec.button);await tick();
    let opened=await snapshot();
    ok(opened.workshop.open&&opened.workshop.mode===spec.mode&&near(opened.workshop.valueCm,before.options[spec.option]*100)&&near(opened.workshop.originalCm,before.options[spec.option]*100),spec.mode+' workshop starts an exact-original draft');
    ok(await evaluate("(()=>{const e=document.getElementById('seatWorkshop'),r=e.getBoundingClientRect(),g=document.getElementById('seatGrip'),gr=g.getBoundingClientRect();return !e.hidden&&!e.closest('#hud')&&e.getAttribute('role')==='dialog'&&e.getAttribute('aria-modal')==='true'&&r.left<=1&&r.top<=1&&r.right>=innerWidth-1&&r.bottom>=innerHeight-1&&g.tagName==='BUTTON'&&g.getAttribute('role')==='slider'&&gr.width>=44&&gr.height>=44&&!!g.closest('#seatStage')&&['seatTitle','seatValue','seatDelta','seatCanvas'].every(id=>document.getElementById(id).getClientRects().length)&&['floatDepth','leadPosition','floatDepthVal','leadPositionVal'].every(id=>document.getElementById(id).closest('#legacyRigInputs')&&!document.getElementById(id).getClientRects().length)})()"),spec.mode+' is a fullscreen accessible illustrated workshop, separate from hidden legacy inputs');
    ok(await evaluate("!floatLab.getRenderState().interaction.orbitEnabled&&document.getElementById('hud').closest('[inert]')!==null"),'workshop disables orbit and makes background HUD inert');
    const expectedMin=spec.mode==='float'?Math.max(18,before.options.leadAboveSwivel*100+2.5,(before.options.leadAboveSwivel+before.options.leadTravel)*100+.5):2;
    const expectedMax=spec.mode==='float'?80:Math.min(before.options.floatToSwivel*100-2.5,(before.options.floatToSwivel-before.options.leadTravel)*100-.5);
    ok(near(opened.workshop.minCm,expectedMin)&&near(opened.workshop.maxCm,expectedMax),spec.mode+' draft bounds preserve seat spacing and stored running travel');
    ok(await evaluate("(()=>{const w=floatLab.getRenderState().workshop,g=document.getElementById('seatGrip');return Number(g.getAttribute('aria-valuenow'))===w.valueCm&&Number(g.getAttribute('aria-valuemin'))===w.minCm&&Number(g.getAttribute('aria-valuemax'))===w.maxCm})()"),spec.mode+' grip announces current value and bounds');
    const blank=await evaluate("(()=>{const r=document.getElementById('seatCanvas').getBoundingClientRect();return{x:r.left+12,y:r.top+12}})()");
    await clickPoint(blank);await tick();
    ok(near((await snapshot()).workshop.valueCm,opened.workshop.valueCm),spec.mode+' blank canvas click does not move hardware');
    const hardware=await hardwarePoint();
    await mouseDrag(hardware,0,-36,false);
    let draft=await snapshot();
    ok(draft.workshop.valueCm>opened.workshop.valueCm&&!draft.workshop.dragging&&frozen(before,draft),spec.mode+' upward illustrated-hardware mouse drag changes draft only and freezes simulation');
    ok(!cameraMoved(before.camera,draft.camera),spec.mode+' canvas drag never moves camera');
    await click('seatCancel');await tick();
    let cancelled=await snapshot();
    ok(!cancelled.workshop.open&&frozen(before,cancelled)&&cancelled.paused===before.paused&&await inert(),spec.mode+' Cancel preserves options, nodes, time and pause state');
    ok(await evaluate(`document.activeElement?.id==='${spec.button}'`),spec.mode+' Cancel returns focus to opener');

    await click(spec.button);await tick();
    await mouseDrag(await elementPoint('seatGrip'),0,-30,false);
    let pointed=await snapshot();
    ok(pointed.workshop.valueCm>before.options[spec.option]*100&&frozen(before,pointed),spec.mode+' real grip mouse drag edits only draft');
    await evaluate("document.getElementById('seatGrip').focus()");
    await key('ArrowUp','ArrowUp',38);
    draft=await snapshot();
    ok(near(draft.workshop.valueCm,pointed.workshop.valueCm+.5)&&frozen(before,draft),spec.mode+' focused grip ArrowUp adds a half centimetre without committing');
    const gestureStart=draft.workshop.valueCm,grip=await elementPoint('seatGrip');
    await evaluate("document.getElementById('seatGrip').addEventListener('pointerdown',e=>{document.getElementById('seatGrip').dataset.testPointerId=String(e.pointerId)},{once:true,capture:true})");
    await send('Input.dispatchMouseEvent',{type:'mousePressed',x:grip.x,y:grip.y,button:'left',buttons:1,clickCount:1});
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:grip.x,y:grip.y-24,button:'left',buttons:1});
    ok((await snapshot()).workshop.valueCm>gestureStart,spec.mode+' active captured mouse gesture changes draft');
    ok(await evaluate("(()=>{const id=Number(document.getElementById('seatGrip').dataset.testPointerId),holder=[...document.querySelectorAll('*')].find(e=>e.hasPointerCapture?.(id));if(!holder)return false;holder.releasePointerCapture(id);return true})()"),spec.mode+' hardware gesture owns real pointer capture');
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:grip.x,y:grip.y-24,button:'left',buttons:0,clickCount:1});await tick();
    const lost=await snapshot();
    ok(near(lost.workshop.valueCm,gestureStart)&&!lost.workshop.dragging&&frozen(before,lost),spec.mode+' lost pointer capture reverts only its current gesture');
    await click('seatRestore');
    let restored=await snapshot();
    ok(near(restored.workshop.valueCm,spec.reset)&&frozen(before,restored),spec.mode+' Restore resets only draft to its standard setting');
    await evaluate("document.getElementById('seatGrip').focus()");
    await key('Home','Home',36);await key('ArrowDown','ArrowDown',40);
    ok(near((await snapshot()).workshop.valueCm,opened.workshop.minCm),spec.mode+' Home and ArrowDown clamp at lower bound');
    await key('End','End',35);await key('ArrowUp','ArrowUp',38);
    ok(near((await snapshot()).workshop.valueCm,opened.workshop.maxCm),spec.mode+' End and ArrowUp clamp at upper bound');
    // Ensure both directions of real Tab navigation remain inside the modal.
    await evaluate("(()=>{const q=[...document.getElementById('seatWorkshop').querySelectorAll('button,[tabindex]')].filter(e=>!e.disabled&&e.tabIndex>=0&&e.getClientRects().length);q.at(-1).focus()})()");
    await key('Tab','Tab',9);
    ok(await evaluate("document.getElementById('seatWorkshop').contains(document.activeElement)"),spec.mode+' Tab at last control stays in workshop');
    await evaluate("(()=>{const q=[...document.getElementById('seatWorkshop').querySelectorAll('button,[tabindex]')].filter(e=>!e.disabled&&e.tabIndex>=0&&e.getClientRects().length);q[0].focus()})()");
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9,modifiers:8});
    await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9,modifiers:8});
    ok(await evaluate("document.getElementById('seatWorkshop').contains(document.activeElement)"),spec.mode+' Shift-Tab at first control stays in workshop');
    await click('seatRestore');await evaluate("document.getElementById('seatGrip').focus()");await key('ArrowUp','ArrowUp',38);
    draft=await snapshot();await click('seatDone');await tick();
    const committed=await snapshot();
    ok(!committed.workshop.open&&near(committed.options[spec.option],draft.workshop.valueCm/100)&&near(committed.options[spec.other],before.options[spec.other]),spec.mode+' Done commits only the selected seat');
    ok(JSON.stringify({...committed.options,[spec.option]:before.options[spec.option]})===JSON.stringify(before.options),spec.mode+' Done leaves every other rig option unchanged');
    ok(committed.paused===before.paused&&committed.time===0&&!cameraMoved(before.camera,committed.camera),spec.mode+' Done recasts while preserving pause state and camera');
    ok(committed.leadMass===before.leadMass&&near(committed.lineMassG,before.lineMassG)&&committed.options.mainLength===fixedLengths.main&&JSON.stringify(committed.options.leaderLengths)===JSON.stringify(fixedLengths.leaders),spec.mode+' Done preserves lead mass, line mass and fixed material lengths');

    before=await snapshot();await click(spec.button);await tick();
    await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
    try{
      let p=await elementPoint('seatGrip');
      await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:p.x,y:p.y,id:11}]});
      await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:p.x,y:p.y-28,id:11}]});
      await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await tick();
      const touched=await snapshot();
      ok(touched.workshop.valueCm>before.options[spec.option]*100&&frozen(before,touched),spec.mode+' mobile touch grip drag changes draft only');
      p=await elementPoint('seatGrip');
      await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:p.x,y:p.y,id:12}]});
      await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:p.x,y:p.y-24,id:12}]});
      ok((await snapshot()).workshop.valueCm>touched.workshop.valueCm,spec.mode+' second touch gesture changes current draft');
      await send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await tick();
      const aborted=await snapshot();
      ok(near(aborted.workshop.valueCm,touched.workshop.valueCm)&&!aborted.workshop.dragging&&frozen(before,aborted),spec.mode+' touchCancel rolls back only the active gesture');
    }finally{await send('Emulation.setTouchEmulationEnabled',{enabled:false});}
    await key('Escape','Escape',27);await tick();
    cancelled=await snapshot();
    ok(!cancelled.workshop.open&&frozen(before,cancelled)&&await inert(),spec.mode+' Escape discards draft and restores camera controls');
    ok(await evaluate(`document.activeElement?.id==='${spec.button}'`),spec.mode+' Escape restores opener focus');
    // Done recasts geometry: only cancellation, never confirmation, promises frozen nodes.
    await evaluate('floatLab.configure({floatToSwivel:.42,leadAboveSwivel:.055});floatLab.settle()');
  }

  // An open workshop freezes a running simulation without toggling its pause flag.
  await evaluate("document.getElementById('btnPause').click();document.getElementById('btnAdjustFloat').click()");
  let running=await snapshot();await tick();let held=await snapshot();
  ok(!running.paused&&!held.paused&&frozen(running,held),'workshop freezes an otherwise running simulation without changing pause');
  await click('seatCancel');await tick();
  ok(await evaluate('!floatLab.getState().paused&&floatLab.getState().time>'+running.time),'Cancel resumes the previously running simulation');
  await click('btnAdjustLead');await click('seatDone');await tick();
  ok(await evaluate('!floatLab.getState().paused&&floatLab.getState().time>0'),'Done resumes the previously running simulation after recast');
  await evaluate("document.getElementById('btnPause').click()");

  // Restore predictable geometry after committed workshop edits, then use projected
  // physical model coordinates rather than removed overlay handles.
  await evaluate('floatLab.configure({floatToSwivel:.42,leadAboveSwivel:.055});floatLab.settle()');
  for(const {view,node} of [{view:'float',node:'floatFoot'},{view:'rig',node:'lead'}]){
    await evaluate(`floatLab.setView('${view}')`);await wait();
    let p=await modelPoint(node),before=await snapshot();
    await clickPoint(p);await tick();
    let after=await snapshot();
    ok(unchanged(before,after),view+' model click preserves all rig options and paused node positions');
    ok(await inert(),view+' model click neither opens trim nor enables picking');
    p=await modelPoint(node);before=await snapshot();
    await mouseDrag(p);
    after=await snapshot();
    ok(cameraMoved(before.camera,after.camera),view+' model mouse drag rotates the camera');
    ok(unchanged(before,after),view+' model mouse drag preserves all options and paused node positions');
    ok(await inert(),view+' model mouse drag leaves orbit enabled, with no trim or seat drag');
  }

  await evaluate("floatLab.setView('float')");await wait();
  let p=await modelPoint('floatFoot'),before=await snapshot();
  await send('Input.dispatchMouseEvent',{type:'mouseWheel',x:p.x,y:p.y,deltaX:0,deltaY:100});await wait();
  let after=await snapshot();
  const distance=c=>Math.hypot(...c.position.map((n,i)=>n-c.target[i]));
  ok(Math.abs(distance(before.camera)-distance(after.camera))>1e-4,'real wheel input still zooms the camera');
  ok(unchanged(before,after)&&await inert(),'wheel navigation preserves paused rig geometry and never opens trim');

  // A touch gesture starting on the lead is camera navigation, not a seat edit.
  await evaluate("floatLab.setView('rig')");await wait();
  p=await modelPoint('lead');before=await snapshot();
  await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
  try{
    await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:p.x,y:p.y,id:1}]});
    for(let i=1;i<=5;i++)await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:p.x+42*i/5,y:p.y-22*i/5,id:1}]});
    await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await wait();
    after=await snapshot();
    ok(cameraMoved(before.camera,after.camera),'real touch model drag rotates the camera');
    ok(unchanged(before,after)&&await inert(),'real touch model drag does not edit the rig or open trim');
    p=await modelPoint('lead');
    await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:p.x,y:p.y,id:2}]});
    await send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await wait();
    ok(await inert(),'touch cancellation leaves picking disabled and camera controls enabled');
  }finally{
    await send('Emulation.setTouchEmulationEnabled',{enabled:false});
  }
  await evaluate("floatLab.setView('rig')");await wait();
  p=await modelPoint('lead');before=await snapshot();await mouseDrag(p,-40,-18);after=await snapshot();
  ok(cameraMoved(before.camera,after.camera)&&unchanged(before,after)&&await inert(),'mouse orbit remains usable after touchCancel without changing the rig');

  // Only the explicit primary action should launch the cutting workshop.
  before=await snapshot();await click('btnTrim');await tick();
  ok(await evaluate("document.getElementById('trim').classList.contains('on')"),'primary trim button still opens the cutting workshop');
  await click('trimCancel');await tick();after=await snapshot();
  ok(await inert(),'trim Cancel closes the workshop and restores orbit');
  ok(unchanged(before,after),'opening and cancelling trim preserves the paused rig');
  ok(after.options.mainLength===fixedLengths.main&&JSON.stringify(after.options.leaderLengths)===JSON.stringify(fixedLengths.leaders),'all native controls and camera gestures preserve fixed mainline and leaders');
  return{passed:checks.length,checks};
};
