/* Fail acceptance on stale artifacts, browser errors, network use or missed 60 Hz budgets. */
'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
function verify(report,artifact){
 assert.equal(report.htmlSHA256,artifact.sha256,'performance evidence must match the current HTML');
 assert.equal(report.htmlBytes,artifact.bytes,'HTML byte count must match');
 assert.equal(report.errors.length,0,'no browser exceptions');
 assert.equal(report.externalRequests.length,0,'standalone game must not use the network');
 let count=0;
 for(const result of report.results){
  assert.equal(result.boot.state,'ready','loader must complete');
  for(const c of result.cases){
   const label=result.viewport+'/'+c.scenario;
   assert.ok(Number.isFinite(c.meanFPS)&&c.meanFPS>=59,label+': minimum 60 Hz-class FPS, with measurement tolerance');
   assert.ok(Number.isFinite(c.p95Ms)&&c.p95Ms<=18,label+': P95 <=18 ms');
   assert.ok(Number.isFinite(c.p99Ms)&&c.p99Ms<=20,label+': P99 <=20 ms');
   assert.equal(c.over33ms,0,label+': no >33.5 ms frame');
   assert.equal(c.shadowUpdatesPerFrame,1,label+': one shadow update per display frame');
   count++;
  }
 }
 assert.ok(count>0,'must measure actual frames');return count;
}
module.exports={verify};
if(require.main===module){
 const html=fs.readFileSync('index.html'),artifact={bytes:html.length,sha256:crypto.createHash('sha256').update(html).digest('hex')};
 const paths=process.argv.slice(2);if(!paths.length)paths.push('qa-performance-after.json','qa-performance-retina.json');
 let cases=0;for(const path of paths)cases+=verify(JSON.parse(fs.readFileSync(path,'utf8')),artifact);
 console.log(JSON.stringify({passed:true,cases,artifact,notes:'60 Hz measurement tolerance; not a claim for all devices or real phones.'}));
}
