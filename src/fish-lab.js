/* Permanent fixed-step physical experiment coordinator, shared by game/lab.
 * No rendering or UI dependencies; dropping wall-clock backlog never changes a
 * physical step. All experiments act via FishBehavior -> TaiwanRig hook forces. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./fish-behavior.js'):root.FishBehavior);if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.FishLab=api;})(typeof globalThis!=='undefined'?globalThis:this,function(Fish){
  'use strict';const H=1/240,BAND=.0157;
  function marks(s){const dy=s.nodes.floatTop.y-s.nodes.floatFoot.y;return(s.nodes.floatTop.y-s.options.waterY)/(Math.max(.08,dy/.26)*BAND);}
  function create({rig,seed=20261125}={}){
    if(!rig||!rig.getInteractionState)throw new TypeError('FishLab requires the shared TaiwanRig force interface');
    const fish=Fish.create({seed});let enabled=false,paused=false,speed=1,ticks=0,accumulator=0,history=[],droppedTime=0;
    fish.reset(rig.getInteractionState());
    function sample(){const s=rig.getInteractionState(),f=fish.snapshot();history.push({time:ticks*H,marks:marks(s),behavior:f.state});if(history.length>601)history.shift();}
    sample();
    function tick(){const before=rig.getInteractionState();const input=fish.step(H,before);rig.step(H,enabled?input:undefined);ticks++;if(ticks%4===0)sample();}
    function advance(realSeconds){if(!Number.isFinite(realSeconds)||realSeconds<0)throw new RangeError('elapsed time must be finite/nonnegative');if(paused)return 0;const accepted=Math.min(realSeconds,.25);droppedTime+=Math.max(0,realSeconds-accepted);accumulator+=accepted*speed;let count=0;while(accumulator+1e-12>=H){tick();accumulator=Math.max(0,accumulator-H);count++;}return count;}
    function step(count=1){if(!Number.isInteger(count)||count<1||count>24000)throw new RangeError('step count must be 1..24000');for(let i=0;i<count;i++)tick();return snapshot();}
    function rebase(){ticks=0;accumulator=0;history=[];droppedTime=0;fish.reset(rig.getInteractionState());fish.setEnabled(enabled,rig.getInteractionState());sample();return snapshot();}
    function reset(){rig.reset({cast:false});rig.settle(20);return rebase();}
    function setEnabled(value){enabled=!!value;fish.setEnabled(enabled,rig.getInteractionState());return enabled;}
    function trigger(id){enabled=true;fish.trigger(id,rig.getInteractionState());return snapshot();}
    function configure(patch){fish.configure(patch);return snapshot();}
    function setPaused(value){paused=!!value;return paused;}
    function setSpeed(value){if(![.1,.25,.5,1].includes(value))throw new RangeError('time scale must be .1, .25, .5 or 1');speed=value;return speed;}
    // Render-only callers can omit history copies while keeping the snapshot shape.
    // Default snapshots, fixed-step sampling and simulation semantics are unchanged.
    function snapshot(s,options){s=s||rig.snapshot();const f=fish.snapshot(),actual=s.lastInteraction?.total||{x:0,y:0,z:0};
      return{time:ticks*H,ticks,fixedDt:H,enabled,paused,speed,seed:f.seed,marks:marks(s),droppedTime,
        fish:{...f,enabled,requestedForce:f.appliedForce,appliedForce:enabled?{...actual}:{x:0,y:0,z:0}},rig:s,history:options?.includeHistory===false?[]:history.map(p=>({...p})),events:f.events.map(e=>({...e}))};}
    return{advance,step,reset,rebase,setEnabled,trigger,configure,setPaused,setSpeed,snapshot,setHabitat:value=>fish.setHabitat(value),get fixedDt(){return H;}};
  }
  return Object.freeze({create,marks,fixedDt:H});
});
