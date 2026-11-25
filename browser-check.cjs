const fs = require('node:fs');
const path = require('node:path');
const watchdog=setTimeout(()=>{console.error('Browser verification timed out');process.exit(2);},Number(process.env.BROWSER_TIMEOUT_MS)||90000);
(async()=>{
  const targets=await (await fetch('http://127.0.0.1:9334/json/list')).json();
  const tab=targets.find(t=>t.type==='page')||await (await fetch('http://127.0.0.1:9334/json/new?about:blank',{method:'PUT'})).json();
  const ws=new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  let id=0;const pending=new Map(),errors=[];
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}
    else if(m.method==='Runtime.exceptionThrown'||m.method==='Log.entryAdded'&&m.params.entry.level==='error'||m.method==='Runtime.consoleAPICalled'&&m.params.type==='error'){errors.push(m.params);console.error(JSON.stringify(m.params));}};
  const send=(method,params={})=>new Promise((resolve,reject)=>{const k=++id;pending.set(k,{resolve,reject});ws.send(JSON.stringify({id:k,method,params}));});
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
  await send('Runtime.enable');await send('Log.enable');await send('Page.enable');await send('Emulation.setFocusEmulationEnabled',{enabled:true});await send('Page.setWebLifecycleState',{state:'active'});await send('Page.bringToFront');
  const mobile=process.env.MOBILE==='1';
  await send('Emulation.setDeviceMetricsOverride',{width:mobile?390:1440,height:mobile?844:1000,deviceScaleFactor:1,mobile});
  await send('Page.navigate',{url:'file://'+path.resolve('index.html')});
  await evaluate(`new Promise((resolve,reject)=>{const start=performance.now();function ready(){const boot=window.FloatBoot?.snapshot?.();if(boot?.state==='error')return reject(Error(boot.error));if(window.floatLab&&(!boot||boot.state==='ready'))return requestAnimationFrame(()=>requestAnimationFrame(resolve));if(performance.now()-start>60000)return reject(Error('App readiness timed out'));setTimeout(ready,16);}ready();})`);
  console.log('Navigated; inspecting page');
  console.log('STATE',await evaluate('window.floatLab?.getState()'));
  if(!await evaluate('!!window.floatLab'))throw Error('App failed to initialize');
  const action=process.argv[2]==='--regression'?'('+require('./tests/browser-actions.cjs').toString()+')()':process.argv[2]==='--fish'?'('+require('./tests/browser-fish.cjs').toString()+')()':process.argv[2];let result;if(action){result=action==='--drag'?await require('./tests/browser-drag.cjs')({send,evaluate}):action==='--scope'?await require('./tests/browser-scope.cjs')({send,evaluate}):action==='--water'?await require('./tests/browser-transparency.cjs')({send,evaluate}):await evaluate(action);console.log('ACTION',result);}
  await evaluate('new Promise(r=>setTimeout(()=>requestAnimationFrame(()=>requestAnimationFrame(r)),1500))');
  const shot=await send('Page.captureScreenshot',{format:'png'});
  const out=process.argv[3]||'preview-updated.png';fs.writeFileSync(out,Buffer.from(shot.data,'base64'));
  console.log('SCREENSHOT',out,'ERRORS',errors.length);
  const hud=await evaluate('({text:document.getElementById("hud").innerText,info:floatLab.renderer.info.render})');
  console.log('HUD',hud);
  fs.writeFileSync(out.replace(/\.png$/,'.json'),JSON.stringify({viewport:mobile?'390x844':'1440x1000',artifact:{bytes:fs.statSync('index.html').size,sha256:require('node:crypto').createHash('sha256').update(fs.readFileSync('index.html')).digest('hex')},boot:await evaluate('window.FloatBoot?.snapshot?.()'),result,errors,hud,state:await evaluate('floatLab.getState()')},null,2));
  ws.close();clearTimeout(watchdog);process.exitCode=errors.length?1:0;
})().catch(e=>{console.error(e);process.exit(1);});
