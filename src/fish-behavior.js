/* Crucian behaviour, SI units. No DOM/THREE and no access to rig mutation.
 * Mouth is a dynamic particle driven by bounded swimming acceleration. Only
 * hook forces / taut-leader contacts leave this module; no float targets exist. */
(function(root,factory){const common=typeof module==='object'&&module.exports;const api=factory(common?require('./fish-collision.js'):root.FishCollision,common?require('./fish-body.js'):root.FishBody);if(common)module.exports=api;if(root)root.FishBehavior=api;})(typeof globalThis!=='undefined'?globalThis:this,function(Collision,Body){
  'use strict';
  const V=(x=0,y=0,z=0)=>({x,y,z}), cp=p=>V(p.x,p.y,p.z), add=(a,b)=>V(a.x+b.x,a.y+b.y,a.z+b.z), sub=(a,b)=>V(a.x-b.x,a.y-b.y,a.z-b.z), mul=(v,k)=>V(v.x*k,v.y*k,v.z*k), len=v=>Math.hypot(v.x,v.y,v.z), clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const unit=(v,f=V(1,0,0))=>len(v)>1e-12?mul(v,1/len(v)):cp(f), limited=(v,n)=>len(v)>n?mul(v,n/len(v)):v;
  const labels=Object.freeze({cruise:'自由巡游',discover:'发现饵料',approach:'靠近饵料',inspect:'观察和试探',suck:'吸入饵料',spit:'吐出饵料',lift:'含饵抬头',swim:'含饵游动',rub:'蹭线',flee:'受惊逃离'});
  const experiments=Object.freeze({nibble:'轻微吸饵',quick:'快速吸饵',spit:'吸饵后吐饵',lift:'含饵抬头',sideways:'含饵横向游动',down:'含饵向下游动',rub:'鱼体蹭线',probe:'连续试探饵料'});
  const defaults=Object.freeze({speed:.09,duration:1.6,force:.0015,direction:Object.freeze({x:1,y:0,z:0}),jitter:.002,hook:1,autonomous:false,seed:20261125,massKg:.08});
  function create(raw={}){
    let parameters={...defaults,direction:cp(defaults.direction)},seed=defaults.seed,rng=1,state='cruise',stateAge=0,time=0,held=false,enabled=false,experiment=null,queue=[],mouth=V(),velocity=V(),direction=V(1,0,0),phaseOrigin=V(),target=V(),requested=V(),events=[],cycle=0,stageDuration=1,initialised=false;
    let hook=1,autonomous=false,modeScale=1,failedCapture=false,behaviors={};
    const body=raw.body||Body;
    let habitat=null,externalHabitat=false,contact=null,poseQuaternion=Collision.orientation(direction),yaw=0,pitch=Math.asin(-.6),poseTicks=0,feedingPitch=null;
    function habitatFor(o){
      if(!habitat||(!externalHabitat&&(habitat.bottomY!==o.bottomY||habitat.waterY!==o.waterY)))habitat=Collision.createHabitat({bounds:{minX:-.8,maxX:.8,minZ:-.372,maxZ:.38},bottomY:o.bottomY,waterY:o.waterY});
      return habitat;
    }
    function constrain(o){
      const before=cp(velocity),r=Collision.resolve({mouth,direction,velocity,body,habitat:habitatFor(o)});
      mouth=r.mouth;velocity=r.velocity;direction=r.direction;poseQuaternion=r.quaternion;contact=r.contact;
      contact.boundaryImpulse=mul(sub(velocity,before),parameters.massKg);
      if(!contact.feasible){held=false;failedCapture=true;}
    }
    function setHabitat(value){habitat=value.heightAt?value:Collision.createHabitat(value);externalHabitat=true;feedingPitch=null;if(initialised)constrain({bottomY:habitat.bottomY,waterY:habitat.waterY});return snapshot();}
    const facing=(a,b)=>V(Math.cos(b)*Math.cos(a),Math.sin(b),Math.cos(b)*Math.sin(a));
    function orient(o,feeding,h){
      let wanted=direction;
      if(['discover','approach','inspect','suck','lift','swim','rub'].includes(state)){
        const y=clamp((mouth.y-o.bottomY-.10)*6,-.65,.45),a=state==='swim'&&Math.hypot(velocity.x,velocity.z)>.005?Math.atan2(velocity.z,velocity.x):0;
        wanted=facing(a,Math.asin(y));
      }else if(len(velocity)>.002)wanted=unit(velocity);
      if(experiment==='rub')wanted=V(1,0,0);
      const wantedYaw=Math.atan2(wanted.z,wanted.x);let wantedPitch=Math.asin(clamp(wanted.y,-1,1));
      // Search real model support at the food, not an arbitrary whole-body mouth lift.
      if(['discover','approach','inspect','suck'].includes(state)&&experiment!=='rub'&&len(sub(mouth,feeding))<.11){
        if(feedingPitch===null||poseTicks%24===0){
          feedingPitch=wantedPitch;
          for(let a=wantedPitch;a>=-1.40;a-=.06){feedingPitch=a;
            const floor=Collision.requiredFloorHeight({mouth:feeding,direction:facing(wantedYaw,a),body,habitat:habitatFor(o)});
            if(floor<=feeding.y+.001)break;
          }
        }wantedPitch=Math.min(wantedPitch,feedingPitch);
      }else feedingPitch=null;
      const limit=2.2*h,delta=Math.atan2(Math.sin(wantedYaw-yaw),Math.cos(wantedYaw-yaw));
      yaw+=clamp(delta,-limit,limit);pitch+=clamp(wantedPitch-pitch,-limit,limit);
      direction=facing(yaw,pitch);poseTicks++;
    }
    function effective(){return {...parameters,...behaviors[state],direction:cp(behaviors[state]?.direction||parameters.direction)};}
    function profile(raw){const p={};for(const [key,min,max] of [['speed',.002,.5],['duration',.1,12],['force',0,.05],['jitter',0,.08]])if(raw[key]!==undefined){if(!Number.isFinite(raw[key]))throw new TypeError(key+' must be finite');p[key]=clamp(raw[key],min,max);}if(raw.direction){if(!['x','y','z'].every(k=>Number.isFinite(raw.direction[k])))throw new TypeError('direction must be finite');p.direction=unit(raw.direction);}return p;}
    function random(){rng=(rng+0x6D2B79F5)>>>0;let t=rng;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;}
    function configure(p={}){
      if(p.behaviors){const next={...behaviors};for(const [id,value] of Object.entries(p.behaviors)){if(!Object.hasOwn(labels,id))throw new RangeError('Unknown behaviour '+id);if(value===null)delete next[id];else next[id]={...next[id],...profile(value)};}behaviors=next;}
      for(const [key,min,max] of [['speed',.002,.5],['duration',.1,12],['force',0,.05],['jitter',0,.08],['massKg',.01,.5]])if(p[key]!==undefined){if(!Number.isFinite(p[key]))throw new TypeError(key+' must be finite');parameters[key]=clamp(p[key],min,max);}
      if(p.direction){if(!['x','y','z'].every(k=>Number.isFinite(p.direction[k])))throw new TypeError('direction must be finite');parameters.direction=unit(p.direction);}
      if(p.hook!==undefined)hook=p.hook===0?0:1;if(p.autonomous!==undefined)autonomous=!!p.autonomous;
      if(p.seed!==undefined){if(!Number.isInteger(p.seed))throw new TypeError('seed must be integer');seed=p.seed>>>0;rng=seed;}
      parameters.hook=hook;parameters.autonomous=autonomous;parameters.seed=seed;
      return snapshot();
    }
    configure(raw);
    const bait=s=>add(s.nodes.hooks[hook],V(0,-.016,0));
    const anchor=s=>s.leaderAnchor||add(s.nodes.swivel,V(0,-.006,0));
    function enter(next,duration=parameters.duration){state=next;stateAge=0;stageDuration=Math.max(.02,behaviors[next]?.duration??duration);phaseOrigin=cp(mouth);held=held&&!['cruise','spit','flee','rub'].includes(next);events.push({time,state:next,label:labels[next],experiment});if(events.length>200)events.shift();if(next==='cruise')cycle++;}
    function reset(s){rng=seed;time=0;stateAge=0;held=false;failedCapture=false;modeScale=1;stageDuration=2;experiment=null;queue=[];events=[];cycle=0;requested=V();velocity=V();const b=bait(s);mouth=add(b,V(-.16,.12,.045));direction=unit(V(.8,-.6,0));yaw=0;pitch=Math.asin(-.6);poseTicks=0;feedingPitch=null;constrain(s.options);target=cp(mouth);initialised=true;enter('cruise',2);return snapshot();}
    function setEnabled(value,s){enabled=!!value;if(!initialised&&s)reset(s);if(!enabled){held=false;queue=[];experiment=null;requested=V();enter('cruise',2);}return enabled;}
    function trigger(id,s){if(!Object.hasOwn(experiments,id))throw new RangeError('Unknown fish experiment '+id);if(!initialised)reset(s);enabled=true;held=false;failedCapture=false;experiment=id;modeScale=id==='quick'?2.3:id==='nibble'?.45:1;
      const D=parameters.duration;
      if(id==='rub')queue=[['rub',D],['flee',.9]];
      else if(id==='probe')queue=[['suck',.16],['spit',.20],['inspect',.28],['suck',.22],['spit',.20],['inspect',.25],['suck',.18],['spit',.2],['flee',.8]];
      else queue=[['suck',id==='quick'?.20:.55],...(id==='lift'?[['lift',D]]:id==='sideways'||id==='down'?[['swim',D]]:id==='spit'?[['swim',.35]]:[]),['spit',.25],['flee',.9]];
      enter('discover',.18);return snapshot();
    }
    function next(){if(queue.length){const [s,d]=queue.shift();enter(s,d);}else{experiment=null;enter('cruise',2+random()*2);}}
    function step(h,s){
      if(!Number.isFinite(h)||h<=0||h>1/60)throw new RangeError('Fish behaviour requires a fixed substep <=1/60 s');
      if(!initialised)reset(s);time+=h;requested=V();const out={hooks:[V(),V()],lineContacts:[]};
      if(!enabled)return out;
      stateAge+=h;const p=effective(),b=bait(s),o=s.options, floor=o.bottomY+.004,ceiling=o.waterY-.035;
      const forceLimit=Math.min(.05,behaviors[state]?.force??p.force*modeScale);
      const rubPoint=add(mul(anchor(s),.5),mul(s.nodes.hooks[hook],.5));
      const feeding=add(add(b,mul(p.direction,-.006)),V(0,.001,0));
      if(state==='cruise'){
        const angle=cycle*2.399+time*.48;
        target=V(clamp(b.x+Math.cos(angle)*.20,-.56,.56),clamp(b.y+.13+Math.sin(angle*.7)*.055,floor+.055,ceiling),clamp(b.z+Math.sin(angle)*.12,-.23,.23));
        if(autonomous&&o.baitMassG>0&&stateAge>(behaviors.cruise?.duration??1)&&len(sub(mouth,b))<.60)trigger(['nibble','spit','lift','sideways'][Math.floor(random()*4)],s);
      }else if(['discover','approach','inspect','suck'].includes(state))target=experiment==='rub'?add(rubPoint,V(.09,0,0)):feeding;
      else if(state==='lift')target=add(phaseOrigin,mul(behaviors.lift?.direction||V(0,1,0),p.speed*Math.min(stateAge,stageDuration)));
      else if(state==='swim'){
        const d=behaviors.swim?.direction||(experiment==='down'?V(0,-1,0):experiment==='spit'?V():p.direction);
        target=add(phaseOrigin,mul(d,p.speed*Math.min(stateAge,stageDuration)));
      }else if(state==='rub')target=add(rubPoint,V(.09,0,Math.sin(stateAge*4)*.008));
      else if(state==='spit')target=add(phaseOrigin,V(-stateAge*.035,stateAge*.01,0));
      else if(state==='flee')target=add(phaseOrigin,V(-stateAge*.22,stateAge*.08,.03));
      if(['cruise','spit','flee'].includes(state)&&behaviors[state]?.direction)target=add(phaseOrigin,mul(p.direction,p.speed*stateAge));
      target.x=clamp(target.x,-.59,.59);target.y=clamp(target.y,floor,ceiling);target.z=clamp(target.z,-.24,.24);
      const speed=state==='flee'&&!behaviors.flee?.speed?Math.max(.18,p.speed*2):p.speed;
      let desired=limited(mul(sub(target,mouth),5),speed);
      const jitter=p.jitter;desired=add(desired,V((random()-.5)*jitter,(random()-.5)*jitter,(random()-.5)*jitter));
      velocity=add(velocity,mul(limited(mul(sub(desired,velocity),8),.8),h));mouth=add(mouth,mul(velocity,h));
      // Whole-body contact constrains the SAME physical mouth/pose used below for forces.
      orient(o,feeding,h);constrain(o);
      const d=sub(mouth,b),distance=len(d);
      if(state==='suck'&&o.baitMassG>0&&distance<.010)held=true;
      if((state==='suck'||((state==='lift'||state==='swim')&&held))&&o.baitMassG>0){
        const hv=s.velocities?.hooks?.[hook]||V();
        if(held)requested=limited(add(mul(d,.20),mul(sub(velocity,hv),.0015)),forceLimit);
        else if(distance<.055)requested=mul(unit(d),forceLimit*Math.exp(-Math.pow(distance/.028,2)));
        out.hooks[hook]=cp(requested);
      }
      if(state==='rub'){
        const center=sub(mouth,mul(direction,.09));
        const taut=len(sub(anchor(s),s.nodes.hooks[hook]))>=o.leaderLengths[hook]-1e-6;
        if(taut&&len(sub(center,rubPoint))<.045){const f=mul(behaviors.rub?.direction||V(0,0,1),p.force*Math.sin(Math.PI*clamp(stateAge/stageDuration,0,1)));out.lineContacts.push({leader:hook,t:.5,force:f});requested=cp(f);}
      }
      // Equal/opposite mouth/contact reaction is integrated into the fish body.
      velocity=sub(velocity,mul(requested,h/parameters.massKg));
      // A hook reaction may point back into an active boundary. Remove only that
      // normal component; do not manufacture a compensating force on the tackle.
      const beforeContact=cp(velocity);
      for(const n of contact.normals||[]){const vn=velocity.x*n.x+velocity.y*n.y+velocity.z*n.z;if(vn<0)velocity=sub(velocity,mul(n,vn));}
      contact.boundaryImpulse=add(contact.boundaryImpulse,mul(sub(velocity,beforeContact),parameters.massKg));
      if(state==='discover'&&stateAge>=stageDuration)enter('approach',12);
      else if(state==='approach'&&(len(sub(mouth,target))<.009||stateAge>=stageDuration)){
        if(stateAge>=stageDuration&&len(sub(mouth,target))>.018){failedCapture=true;queue=[];enter('flee',.8);}else enter('inspect',.25);
      }else if(state==='inspect'&&stateAge>=stageDuration)next();
      else if(!['cruise','discover','approach','inspect'].includes(state)&&stateAge>=stageDuration)next();
      return out;
    }
    function snapshot(){return{enabled,time,state,label:labels[state],stateAge,held,failedCapture,experiment,hook,autonomous,seed,mouth:cp(mouth),velocity:cp(velocity),direction:cp(direction),poseQuaternion:{...poseQuaternion},collision:contact?JSON.parse(JSON.stringify(contact)):null,bodyModel:body.id,appliedForce:cp(requested),parameters:{...parameters,direction:cp(parameters.direction)},behaviors:JSON.parse(JSON.stringify(behaviors)),activeParameters:effective(),events:events.map(e=>({...e}))};}
    return{configure,reset,setEnabled,trigger,step,snapshot,setHabitat};
  }
  return Object.freeze({create,labels,experiments,defaults});
});
