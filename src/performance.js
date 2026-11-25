/* 60 Hz rendering budget. Quality may adapt; the SI solver's timestep never does. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.FloatPerformance=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const TARGET_FPS=60,FRAME_BUDGET_MS=1000/TARGET_FPS;
 const TIERS=Object.freeze([
  Object.freeze({name:'清晰',scale:1,opticalScale:1,reflectionInterval:3}),
  Object.freeze({name:'均衡',scale:.82,opticalScale:.8,reflectionInterval:4}),
  Object.freeze({name:'流畅',scale:.66,opticalScale:.65,reflectionInterval:5}),
  Object.freeze({name:'性能优先',scale:.5,opticalScale:.5,reflectionInterval:6})
 ]);
 function create({devicePixelRatio=1,onQuality=()=>{}}={}){
  const maxRatio=Math.min(1.5,Math.max(.5,Number(devicePixelRatio)||1));
  let tier=0,frames=[],lastEvaluation=0,lastChange=0,healthySince=null,suspended=false,changes=[],observations=0;
  function settings(){return{...TIERS[tier],tier,pixelRatio:Math.max(.5,maxRatio*TIERS[tier].scale)};}
  function stats(){
   if(!frames.length)return{samples:0,fps:null,p95Ms:null,p99Ms:null,workP95Ms:null,over33ms:0};
   const sorted=frames.map(f=>f.intervalMs).sort((a,b)=>a-b),work=frames.map(f=>f.workMs).sort((a,b)=>a-b);
   const at=(a,q)=>a[Math.min(a.length-1,Math.floor(a.length*q))];
   return{samples:frames.length,fps:1000/(frames.reduce((sum,f)=>sum+f.intervalMs,0)/frames.length),p95Ms:at(sorted,.95),p99Ms:at(sorted,.99),workP95Ms:at(work,.95),over33ms:frames.filter(f=>f.intervalMs>33.5).length};
  }
  function change(next,now,reason){tier=next;lastChange=now;healthySince=null;frames=[];changes.push({atMs:now,tier,reason});if(changes.length>24)changes.shift();onQuality(settings());}
  function sample({intervalMs,workMs,now}){
   if(suspended||![intervalMs,workMs,now].every(Number.isFinite)||intervalMs<=0||workMs<0)return;
   // A hidden tab/debugger pause is not evidence that fewer pixels will help.
   if(intervalMs>1000){frames=[];healthySince=null;return;}
   observations++;frames.push({intervalMs,workMs});if(frames.length>120)frames.shift();
   if(frames.length<60||now-lastEvaluation<1000)return;lastEvaluation=now;
   const s=stats(),slow=s.p95Ms>FRAME_BUDGET_MS*1.25||s.workP95Ms>FRAME_BUDGET_MS*.92;
   if(slow){healthySince=null;if(tier<TIERS.length-1&&now-lastChange>=1800)change(tier+1,now,'60 Hz frame budget exceeded');}
   else if(s.p95Ms<18&&s.workP95Ms<8){
    if(healthySince===null)healthySince=now;
    if(tier>0&&now-healthySince>=12000&&now-lastChange>=12000)change(tier-1,now,'sustained rendering headroom');
   }else healthySince=null;
  }
  function suspend(value){suspended=!!value;frames=[];healthySince=null;lastEvaluation=0;}
  function snapshot(){const s=stats();return{targetFPS:TARGET_FPS,frameBudgetMs:FRAME_BUDGET_MS,mode:'auto',...settings(),...s,suspended,observations,belowTargetAtMinimum:tier===TIERS.length-1&&s.samples>=60&&(s.fps<57||s.p95Ms>FRAME_BUDGET_MS*1.25),changes:changes.map(x=>({...x})),measurement:'requestAnimationFrame wall intervals; workMs is CPU submission, not GPU elapsed time'};}
  return{sample,suspend,settings,snapshot};
 }
 return Object.freeze({create,TARGET_FPS,FRAME_BUDGET_MS,TIERS});
});
