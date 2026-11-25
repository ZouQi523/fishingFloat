'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../src/tackle.js');
const {GRAVITY}=require('../src/physics.js').constants;

function checkSurfaceAccounting(s) {
  const p = s.curves.wind, y = s.options.waterY;
  let geometric = 0;
  for (let i = 1; i < p.length; i++) {
    if (Math.abs(p[i-1].y-y)<1e-12 && Math.abs(p[i].y-y)<1e-12)
      geometric += Math.hypot(p[i].x-p[i-1].x,p[i].y-p[i-1].y,p[i].z-p[i-1].z);
  }
  assert.ok(geometric > .05, 'nondegenerate interface contact exists');
  assert.ok(Math.abs(geometric-s.evaluation.windSurfaceLength)<1e-8,
    `flat endpoint legs belong to interface too: geometric=${geometric}, supported=${s.evaluation.windSurfaceLength}`);
  const o=s.options, wetFraction=Math.min(.5,o.lineDensity/o.waterDensity);
  const expected=Math.max(0,(o.lineDensity-o.waterDensity*wetFraction)*Math.PI*o.mainDiameter**2/4*geometric*GRAVITY);
  assert.ok(Math.abs(expected-s.evaluation.surfaceSupportN)<1e-10, 'support follows all and only interface material');
}

test('a surface-level vertically aligned rod includes its flat endpoint leg in interface support',()=>{
  const sim=T.create({rodTip:{x:.025,y:.83,z:.025}});sim.reset({cast:false});
  checkSurfaceAccounting(sim.snapshot());
});

test('a surface-level seat includes its flat endpoint leg in interface support',()=>{
  const sim=T.create({rodTip:{x:.025,y:1.1,z:.025}});sim.reset({cast:false});
  sim.configure({waterY:sim.snapshot().nodes.floatFoot.y});
  checkSurfaceAccounting(sim.snapshot());
});

test('an entirely surface-level slack wind has no fully immersed phantom endpoint legs',()=>{
  const sim=T.create({rodTip:{x:.025,y:1.1,z:.025}});sim.reset({cast:false});
  const waterY=sim.snapshot().nodes.floatFoot.y;
  sim.configure({waterY,rodTip:{y:waterY}});
  const s=sim.snapshot();checkSurfaceAccounting(s);
  assert.ok(Math.abs(s.evaluation.windSurfaceLength-(s.options.mainLength-s.options.floatToSwivel))<1e-8);
});
