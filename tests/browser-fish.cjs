'use strict';
// Injected into a real offline file:// page by browser-check.cjs --fish.
module.exports=async function fishBrowserRegression(){
  const checks=[],ok=(v,n)=>{if(!v)throw Error(n);checks.push(n);},el=id=>document.getElementById(id),F=floatLab.fish,near=(a,b,t=1e-9)=>Math.abs(a-b)<t;
  const frame=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  const change=(id,value)=>{const e=el(id);if(e.type==='checkbox')e.checked=value;else e.value=String(value);e.dispatchEvent(new Event(e.type==='range'?'input':'change',{bubbles:true}));};
  const initial=F.getState();
  ok(!initial.enabled,'fish starts disabled: original trim baseline remains the default');
  ok(!el('fishPanel').open,'laboratory panel is initially collapsed');
  ok(!document.querySelector('script[src],link[rel=stylesheet][href^=http]'),'single-file app has no external scripts/styles');
  ok(performance.getEntriesByType('resource').every(r=>!/^https?:/.test(r.name)),'offline load made no network resource requests');
  F.pause(true);F.reset();
  const frozen=JSON.stringify(floatLab.getState().nodes),frozenTime=F.getState().time;
  await new Promise(r=>setTimeout(r,140));
  ok(JSON.stringify(floatLab.getState().nodes)===frozen&&F.getState().time===frozenTime,'pause freezes rig and behavior across real frames');
  el('fishPanel').open=true;el('fishTelemetry').open=true;await frame();
  let box=el('fishPanel').getBoundingClientRect();
  ok(box.left>=0&&box.right<=innerWidth&&box.top>=0&&box.bottom<=innerHeight,'expanded panel stays within desktop/mobile viewport');
  if(innerWidth<620)ok(box.height<=innerHeight*.56,'mobile expanded lab remains within 55vh');
  for(const id of ['nibble','quick','spit','lift','sideways','down','rub','probe']){
    const b=el('fishBehavior-'+id);ok(!!b&&b.textContent.length>0,'manual experiment button '+id);
    b.click();const s=F.getState();ok(s.enabled&&s.fish.experiment===id,'real callback enables and triggers '+id);
  }
  ok(!/黑漂/.test(el('fishBehavior-down').textContent),'downward behavior button does not promise a forced black float');
  F.reset();const beforeStep=F.getState();el('fishStep').click();const afterStep=F.getState();
  ok(afterStep.paused&&afterStep.ticks===beforeStep.ticks+1&&near(afterStep.time-beforeStep.time,1/240),'single-step advances exactly one fixed physical tick and stays paused');
  ok(near(afterStep.rig.time-beforeStep.rig.time,1/240),'single-step drives the original rig at the same fixed clock');
  change('fishParam-profile','suck');change('fishParam-force',.0002);
  ok(near(F.getState().fish.behaviors.suck.force,.0002),'per-state force configuration reaches behavior engine');
  ok(near(F.getState().fish.parameters.force,.0015),'per-state configuration does not overwrite global parameters');
  el('fishParam-clearProfile').click();ok(!F.getState().fish.behaviors.suck,'clear state override restores global fallback');
  change('fishParam-profile','global');
  change('fishRig-hookMassG',.035);ok(near(F.getState().rig.options.hookMassG,.035),'hook-mass control updates real tackle, not behavior force');
  change('fishRig-hookMassG',.025);
  F.pause(false);el('btnAdjustFloat').click();const inWorkshop=F.getState();await new Promise(r=>setTimeout(r,150));
  ok(F.getState().ticks===inWorkshop.ticks&&F.getState().rig.time===inWorkshop.rig.time,'independent tackle workshop freezes fish and original rig together');
  el('seatCancel').click();F.pause(true);
  change('fishTimeScale',.25);ok(F.getState().speed===.25,'slow-motion selector reaches fixed clock');
  F.pause(false);const slowBefore=F.getState().time,slowWall=performance.now();await new Promise(r=>setTimeout(r,190));F.pause(true);
  const slowElapsed=(performance.now()-slowWall)/1000,slowDelta=F.getState().time-slowBefore;
  ok(slowDelta>0&&slowDelta<=slowElapsed*.4+.02,'slow motion advances simulation below measured wall-clock rate: '+slowDelta.toFixed(4)+'s / '+slowElapsed.toFixed(4)+'s');
  change('fishTimeScale',1);
  floatLab.configure({floatToSwivel:.32,leadMassG:4,baitMassG:.34});
  F.configure({autonomous:false,seed:20261125});F.reset();F.trigger('lift');
  let held=false,nonzero=false,aligned=true,wholeBody=true,peak=-Infinity,start=F.getState().marks;
  for(let i=0;i<30;i++){
    const s=F.step(120),r=F.getRenderState();held=held||s.fish.held;nonzero=nonzero||Math.hypot(...Object.values(s.rig.lastInteraction.total))>1e-8;peak=Math.max(peak,s.marks);
    wholeBody=wholeBody&&s.fish.collision.feasible&&r.terrainPenetration<1e-6&&r.bounds.min.y>=s.rig.options.bottomY-1e-6&&r.bounds.max.y<=s.rig.options.waterY+1e-6&&r.bounds.min.x>=-.800001&&r.bounds.max.x<=.800001&&r.bounds.min.z>=-.372001&&r.bounds.max.z<=.380001;
    aligned=aligned&&r.error<1e-6&&Math.hypot(r.modelMouth.x-s.fish.mouth.x,r.modelMouth.y-s.fish.mouth.y,r.modelMouth.z-s.fish.mouth.z)<1e-6;
  }
  ok(held,'actual approach and oral contact capture bait in browser');
  ok(nonzero,'behavior transmits real nonzero hook force into the original solver');
  ok(peak>start+.15,'head lifting naturally changes exposed marks without scripted float coordinates');
  ok(aligned,'actual model lip tracks physical mouth through moving/pitched poses');
  ok(wholeBody,'actual deformed render vertices clear all real scene stones, floor, walls and water across the experiment');
  let s=F.getState();ok(s.history.length<=601&&s.history.at(-1).time-s.history[0].time<=10+1e-8,'history retains only last ten simulation seconds');
  ok(s.events.some(e=>e.state==='suck')&&s.events.some(e=>e.state==='spit'),'curve has real suction/release behavior events');
  ok(s.rig.evaluation.maxLengthError<1e-5,'fish-loaded line constraints remain within tolerance');
  ok(el('fishRead-marks').textContent!=='—'&&el('fishRead-mouth').textContent.includes('/'),'live physical telemetry renders exposed marks and mouth');
  ok(el('fishHistory').width>0&&el('fishEvents').textContent.length>0,'history canvas and behavior event text render');
  const atEnd=JSON.stringify({nodes:s.rig.nodes,fish:s.fish,history:s.history});
  F.reset();F.trigger('lift');F.step(3600);s=F.getState();
  ok(JSON.stringify({nodes:s.rig.nodes,fish:s.fish,history:s.history})===atEnd,'same seed and reset reproduce exact browser physical history');
  // Leave a clear-water debug view with the real fish and mouth at work.
  change('waterTransparency',100);floatLab.setView('tank');F.reset();F.trigger('lift');
  for(let i=0;i<24;i++){s=F.step(60);if(s.fish.state==='lift'&&s.fish.stateAge>.6)break;}
  await frame();
  const model=F.getRenderState();
  ok(model.visible&&model.counts.triangles>1000&&model.mouthSource.vertexCount>=4,'offline fish is real original-scene geometry with a measured lip');
  ok(floatLab.getRenderState().waterOptics&&floatLab.renderer.getContext().getError()===0,'existing optics and WebGL remain healthy with fish');
  box=el('fishPanel').getBoundingClientRect();ok(box.right<=innerWidth&&box.bottom<=innerHeight,'final populated panel remains on-screen');
  return{checks:checks.length,names:checks,viewport:{width:innerWidth,height:innerHeight},physical:{time:s.time,state:s.fish.state,mouth:s.fish.mouth,marks:s.marks,force:s.rig.lastInteraction.total},model,offline:true,screenshot:'100% clarity debug; shipped default is 35%'};
};
