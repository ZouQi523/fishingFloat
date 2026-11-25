'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const T = require('../src/tackle.js');
const P = require('../src/physics.js');
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const arc = ps => ps.slice(1).reduce((s, p, i) => s + dist(p, ps[i]), 0);
const close = (a, b, e = 1e-7) => assert.ok(Math.abs(a - b) <= e, `${a} != ${b} (tol ${e})`);
const finiteJSON = s => {
  assert.doesNotThrow(() => JSON.stringify(s));
  (function visit(x) { if (typeof x === 'number') assert.ok(Number.isFinite(x)); else if (x && typeof x === 'object') Object.values(x).forEach(visit); })(s);
};
function check(s) {
  finiteJSON(s);
  assert.ok(s.evaluation.maxLengthError < .001);
  assert.ok(s.leadCoordinate >= s.options.leadAboveSwivel - 1e-8);
  assert.ok(s.leadCoordinate <= s.options.leadAboveSwivel + (s.options.leadLocked ? 0 : s.options.leadTravel) + 1e-8);
  const e = s.evaluation, o = s.options;
  s.nodes.hooks.forEach(p => assert.ok(p.y >= o.bottomY + o.hookExtent - 1e-8));
  assert.ok(dist(...s.nodes.hooks) >= 2 * o.baitRadius - 2e-5);
  const leadDim = P.leadDimensions(o.leadMassG), leadEnvelope = Math.max(Math.hypot(leadDim.height / 2, leadDim.radius), Math.hypot(.010, .00110));
  assert.ok(s.nodes.lead.y >= o.bottomY + leadEnvelope - 1e-8);
  for (const n of [e.rodTensionN, e.tension.wind, e.tension.upper, e.tension.lower, ...e.tension.leaders, e.bottomSupportN]) assert.ok(n >= 0);
  close(e.lineApparentMassG, e.lineMassG - e.lineBuoyancyG, 1e-12);
}
test('float hydrostatics uses exact upright profile and submerged circular sections when horizontal', () => {
  const water = .83;
  for (let i = 0; i <= 260; i++) {
    const top = { x: 0, y: water + i / 1000, z: 0 }, foot = { x: 0, y: top.y - .26, z: 0 };
    close(T.floatSubmersion(foot, top, water).volume, P.volumeBelow(top.y - water), 1e-18);
    // Reversing the same profile's vertical direction preserves the complementary volume.
    const inverse = T.floatSubmersion({ x: 0, y: water + .26 - i / 1000, z: 0 }, { x: 0, y: water - i / 1000, z: 0 }, water);
    close(inverse.volume, P.totalVolume - P.volumeBelow(i / 1000), 1e-18);
  }
  const horizontal = y => T.floatSubmersion({ x: 0, y, z: 0 }, { x: .26, y, z: 0 }, water).volume;
  close(horizontal(water), P.totalVolume / 2, 1e-18);
  close(horizontal(water - .006), P.totalVolume, 1e-18);
  close(horizontal(water + .006), 0, 1e-18);
  assert.ok(horizontal(water + .002) > 0 && horizontal(water + .002) < P.totalVolume / 2);
  close(horizontal(water - .002) + horizontal(water + .002), P.totalVolume, 1e-18);
  // Crossing the horizontal pose must be continuous, not flip entire profile slices dry/wet.
  for (const delta of [-1e-5, -1e-7, 1e-7, 1e-5]) {
    const v = T.floatSubmersion({ x: 0, y: water - delta / 2, z: 0 }, { x: .26, y: water + delta / 2, z: 0 }, water).volume;
    assert.ok(Math.abs(v - P.totalVolume / 2) < P.totalVolume * .002);
  }
});
test('UMD works in a browser and CommonJS without mutating legacy physics', () => {
  const context = { console };
  vm.createContext(context);
  for (const file of ['physics.js', 'tackle.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), context);
  assert.equal(typeof context.TaiwanRig.create, 'function');
  const before = P.equilibrium(4);
  context.TaiwanRig.create().step(.1);
  assert.deepEqual(P.equilibrium(4), before);
  finiteJSON(context.TaiwanRig.create().snapshot());
});
test('normalization uses shared materials and exact per-ball bait mass/radius', () => {
  const o = T.normalize();
  close(o.lineDensity, P.materials.nylon);
  close(2 * 4 / 3 * Math.PI * o.baitRadius ** 3 * o.baitDensity * 1000, o.baitMassG, 1e-12);
  assert.throws(() => T.normalize({ lineMaterial: 'lead' }), RangeError);
  assert.throws(() => T.normalize({ bottomY: 2 }), RangeError);
  const clamped = T.normalize({ mainLength: .1, floatToSwivel: 10, leadAboveSwivel: 4, leadTravel: 4 });
  assert.ok(clamped.floatToSwivel < clamped.mainLength);
  assert.ok(clamped.leadAboveSwivel + clamped.leadTravel < clamped.floatToSwivel);
});
test('continuous main line, independent terminal ring and unequal leaders share physical geometry', () => {
  const s = T.create().settle(); check(s);
  assert.deepEqual(s.curves.wind[0], s.nodes.rod);
  assert.deepEqual(s.curves.wind.at(-1), s.nodes.floatFoot);
  assert.deepEqual(s.curves.upper[0], s.nodes.floatFoot);
  assert.deepEqual(s.curves.upper.at(-1), s.nodes.lead);
  assert.deepEqual(s.curves.lower[0], s.nodes.lead);
  assert.deepEqual(s.curves.lower.at(-1), s.nodes.swivel);
  assert.ok(dist(s.nodes.lead, s.nodes.swivel) > .04);
  close(s.nodes.swivel.y - s.nodes.leaderAnchor.y, .006);
  s.curves.leaders.forEach((ps, i) => {
    assert.deepEqual(ps[0], s.nodes.leaderAnchor); assert.deepEqual(ps.at(-1), s.nodes.hooks[i]);
    close(arc(ps), s.options.leaderLengths[i], .0001);
  });
  close(dist(s.nodes.floatTop, s.nodes.floatFoot), P.constants.FLOAT_LENGTH, .0001);
  close(arc(s.curves.wind) + arc(s.curves.upper) + arc(s.curves.lower), s.options.mainLength, .0001);
  assert.ok(s.nodes.hooks[0].y > s.nodes.hooks[1].y + .02);
  assert.equal(s.markers.floatStops.length, 4);
  assert.equal(s.markers.leadStops.length, 2);
  assert.ok(dist(...s.markers.leadStops) > .02, 'locked beans must not coincide');
});
test('snapshot is detached pure JSON and never advances time; configure preserves dynamics', () => {
  const sim = T.create().step(.6), a = sim.snapshot();
  assert.deepEqual(sim.snapshot(), a);
  a.nodes.lead.x = 10; a.options.rodTip.x = 10;
  const before = sim.snapshot();
  sim.configure({ rodTip: { y: 1.4 }, floatToSwivel: .5 });
  const after = sim.snapshot();
  assert.deepEqual(after.nodes.floatFoot, before.nodes.floatFoot);
  assert.deepEqual(after.velocities, before.velocities);
  close(after.time, before.time);
  close(after.options.rodTip.x, -.5); close(after.options.rodTip.y, 1.4);
  close(after.options.mainLength, 1.2);
  const opt = sim.options; opt.leaderLengths[0] = 100;
  close(sim.options.leaderLengths[0], .12);
  sim.reset({ cast: false }); close(sim.snapshot().time, 0);
});
test('main material length/mass conserved when float seat moves; line diameter squared and material density', () => {
  const a = T.create().snapshot();
  const b = T.create({ floatToSwivel: .7 }).snapshot();
  close(a.evaluation.lineMassG, b.evaluation.lineMassG, 1e-12);
  const m = (o = {}) => T.create(o).snapshot().evaluation.lineMassG;
  close(m({ mainDiameter: .00044, subDiameter: .00032 }), m() * 4, 1e-12);
  close(m({ lineMaterial: 'fluoro' }) / m(), P.materials.fluoro / P.materials.nylon, 1e-12);
  const expected = (Math.PI * .00022 ** 2 / 4 * 1.2 + Math.PI * .00016 ** 2 / 4 * (.12 + .15)) * P.materials.nylon * 1000;
  close(m(), expected, 1e-12);
});
test('deeper float setting deepens rig and transfers unsupported weight to the bed', () => {
  const a = T.create({ floatToSwivel: .32 }).settle();
  const b = T.create({ floatToSwivel: .70 }).settle();
  check(a); check(b);
  assert.ok(b.nodes.swivel.y < a.nodes.swivel.y - .12);
  assert.ok(b.evaluation.contacts.hooks.every(Boolean));
  assert.ok(b.evaluation.bottomSupportN > a.evaluation.bottomSupportN);
});
test('unsupported overload must reach bed or be supported by rod, not fabricated floating equilibrium', () => {
  const s = T.create({ leadMassG: 12 }).settle(); check(s);
  assert.ok(s.evaluation.contacts.lead || s.evaluation.rodTensionN > .01);
  assert.ok(s.evaluation.bottomSupportN > .04);
  assert.ok(s.evaluation.staticResidualN < .0001);
  assert.ok(s.evaluation.floatDisplacedVolume <= P.totalVolume * (1 + 1e-10));
});
test('rod-side tension really lifts the rig and balances its weight', () => {
  const sim = T.create(); const low = sim.settle();
  sim.configure({ rodTip: { x: 0, y: 2, z: 0 } });
  const high = sim.settle(); check(high);
  assert.ok(high.nodes.lead.y > low.nodes.lead.y + .4);
  assert.ok(high.evaluation.rodTensionN > .03);
  assert.ok(high.evaluation.rodReaction.y > .03);
  assert.ok(high.evaluation.staticResidualN < .0001);
  close(high.evaluation.buoyancyN + high.evaluation.rodReaction.y + high.evaluation.bottomSupportN, high.evaluation.weightN, .0001);
});
test('locked lead has fixed material coordinate; running lead obeys beans and falls to lower stop', () => {
  const sim = T.create({ leadAboveSwivel: .13 });
  check(sim.settle(8)); close(sim.snapshot().leadCoordinate, .13);
  sim.configure({ leadLocked: false, leadAboveSwivel: .055, leadTravel: .08 });
  sim.step(1 / 120);
  const free = sim.snapshot(); check(free);
  assert.ok(free.leadCoordinate > .06 && free.leadCoordinate < .134, 'free slider keeps material coordinate between beans');
  assert.ok(free.evaluation.tension.upper > 0);
  close(free.evaluation.tension.upper, free.evaluation.tension.lower, 1e-10);
  for (let i = 0; i < 30; i++) {
    sim.step(.1); const s = sim.snapshot(); check(s);
    assert.ok(dist(s.nodes.floatFoot, s.nodes.lead) + dist(s.nodes.lead, s.nodes.swivel) <= s.options.floatToSwivel + .001);
  }
  const final = sim.settle(8); check(final);
  close(final.leadCoordinate, .055, .0002);
  assert.ok(dist(...final.markers.leadStops) > .09);
});
test('slack leaders never transmit compression and bed/bait contacts stay unilateral', () => {
  const s = T.create({ floatToSwivel: .9, baitMassG: 1.2, leaderLengths: [.18, .22], leadMassG: 8 }).settle(); check(s);
  assert.ok(s.evaluation.contacts.hooks.every(Boolean));
  s.evaluation.tension.leaders.forEach(t => assert.ok(t < .0001));
  for (const curve of [s.curves.wind, s.curves.upper, s.curves.lower, ...s.curves.leaders]) curve.forEach(p => assert.ok(p.y >= s.options.bottomY - 1e-8));
});
test('default nylon wind line rests on the surface without inventing material or wet buoyancy', () => {
  const s = T.create().settle(15), o = s.options, e = s.evaluation, w = s.curves.wind;
  close(arc(w), o.mainLength - o.floatToSwivel, 2e-7);
  close(dist(w[0], s.nodes.rod), 0); close(dist(w[w.length - 1], s.nodes.floatFoot), 0);
  assert.ok(e.windSurfaceLength > .25, 'substantial slack remains supported after allocating real material to both rounded legs');
  assert.ok(w.filter(p => Math.abs(p.y - o.waterY) < 1e-10).length >= 24);
  assert.ok(w.every(p => p.y >= Math.min(o.waterY, s.nodes.floatFoot.y) - 1e-10));
  assert.ok(e.surfaceSupportN > 0 && e.surfaceSupportN < .001);
  const first = w.findIndex(p => Math.abs(p.y - o.waterY) < 1e-10);
  const last = w.findLastIndex(p => Math.abs(p.y - o.waterY) < 1e-10);
  assert.ok(first > 0 && last < w.length - 1, 'air leg and submerged seat approach both remain');
  assert.ok(s.nodes.floatFoot.y < o.waterY - .1);
  for (let i = 1; i < w.length; i++) {
    if (i < first) assert.ok(w[i].y >= o.waterY - 1e-10);
    if (i > last) assert.ok(w[i].y <= w[i - 1].y + 1e-10, 'no submerged return loop');
  }
  close(e.windSurfaceLength, arc(w.slice(first, last + 1)), 1e-8);
  close(e.surfaceSupportN, (o.lineDensity - o.waterDensity / 2) * Math.PI * o.mainDiameter ** 2 / 4 * e.windSurfaceLength * P.constants.GRAVITY, 1e-12);
  close(e.buoyancyN - e.weightN + e.bottomSupportN + e.rodReaction.y + e.surfaceSupportN, 0, 1e-8);
  assert.ok(e.staticResidualN < 1e-8); check(s);
});
test('rounded wind legs meet the supported span tangentially without air/water corners', () => {
  const turn = (a, b, c) => {
    const u = [b.x-a.x,b.y-a.y,b.z-a.z], v = [c.x-b.x,c.y-b.y,c.z-b.z];
    const cosine = u.reduce((s, x, i) => s+x*v[i], 0) / Math.hypot(...u) / Math.hypot(...v);
    return Math.acos(Math.max(-1, Math.min(1, cosine))) * 180 / Math.PI;
  };
  for (const options of [{}, {mainLength:2.4}, {mainLength:20},
    {rodTip:{x:.025,y:1.10,z:.025}}, {rodTip:{x:.03,y:1.10,z:.025}},
    {rodTip:{x:-.075,y:.95,z:.20}}, {rodTip:{x:-.3,y:.65,z:.025}},
    {rodTip:{x:-.5,y:.831,z:.025}}, {rodTip:{x:.5,y:1.10,z:-.15}}]) {
    const sim=T.create(options); sim.reset({cast:false});
    const s=sim.snapshot(), p=s.curves.wind, y=s.options.waterY;
    finiteJSON(s);
    const first=p.findIndex(q=>Math.abs(q.y-y)<1e-10), last=p.findLastIndex(q=>Math.abs(q.y-y)<1e-10);
    assert.ok(first>1 && last<p.length-2, 'both legs and a supported middle span exist');
    assert.ok(turn(p[first-1],p[first],p[first+1])<5, 'air/surface sampled tangent turns less than five degrees');
    assert.ok(turn(p[last-1],p[last],p[last+1])<5, 'surface/seat sampled tangent turns less than five degrees');
    for(let i=1;i<p.length-1;i++) assert.ok(turn(p[i-1],p[i],p[i+1])<5, 'adaptive physical knots resolve bends along the WHOLE curve, not only its joins');
    close(arc(p),s.options.mainLength-s.options.floatToSwivel,1e-8);
    close(arc(p.slice(first,last+1)),s.evaluation.windSurfaceLength,1e-8);
    close(dist(p[0],s.nodes.rod),0); close(dist(p.at(-1),s.nodes.floatFoot),0);
    assert.ok(p.every(q=>q.y>=Math.min(s.nodes.rod.y,s.nodes.floatFoot.y,y)-1e-10));
  }
});
test('rounded submerged material contributes wet volume but only the flat interface span gets retention', () => {
  for(const rodTip of [{x:-.5,y:1.10,z:.025},{x:-.3,y:.65,z:.025},{x:.025,y:.83,z:.025}]) {
    const sim=T.create({rodTip});sim.reset({cast:false});
    const s=sim.snapshot(),o=s.options,e=s.evaluation,p=s.curves.wind;
    let wetArc=0,heldArc=0;
    for(let i=1;i<p.length;i++) {
      const a=p[i-1],b=p[i],l=dist(a,b);
      const onSurface=Math.abs(a.y-o.waterY)<1e-13&&Math.abs(b.y-o.waterY)<1e-13;
      const fraction=onSurface?.5:Math.abs(a.y-b.y)<1e-14?+(a.y<=o.waterY):Math.max(0,Math.min(1,(o.waterY-Math.min(a.y,b.y))/Math.abs(a.y-b.y)));
      wetArc+=l*fraction;if(onSurface)heldArc+=l;
    }
    const mainArea=Math.PI*o.mainDiameter**2/4,subArea=Math.PI*o.subDiameter**2/4;
    const wetVolume=mainArea*((o.mainLength-o.floatToSwivel)*wetArc/arc(p)+o.floatToSwivel)
      +subArea*o.leaderLengths.reduce((a,b)=>a+b,0);
    close(e.lineBuoyancyG,o.waterDensity*wetVolume*1000,1e-10);
    close(e.windSurfaceLength,heldArc,1e-9);
    close(e.surfaceSupportN,(o.lineDensity-o.waterDensity/2)*mainArea*heldArc*P.constants.GRAVITY,1e-12);
    close(dist(p[0],s.nodes.rod),0);close(dist(p.at(-1),s.nodes.floatFoot),0);
    close(arc(p),o.mainLength-o.floatToSwivel,1e-8);
  }
});
test('moving only float and lead seats keeps fixed main and leader lengths with a surface wind line', () => {
  const sim = T.create(), initial = sim.snapshot(), total = initial.options.mainLength, leaders = initial.options.leaderLengths;
  for (const depth of [.3, .42, .6]) {
    sim.configure({ floatToSwivel: depth, leadAboveSwivel: .06 });
    const s = sim.settle(8), e = s.evaluation;
    close(s.options.mainLength, total); assert.deepEqual(s.options.leaderLengths, leaders);
    close(e.lineMassG, initial.evaluation.lineMassG, 1e-12);
    close(arc(s.curves.wind), total - depth, 3e-5);
    close(arc(s.curves.upper) + arc(s.curves.lower) + arc(s.curves.wind), total, 3e-5);
    check(s);
  }
});
test('a lifted taut wind line leaves the water instead of stretching down to a forced contact', () => {
  const s = T.create({ rodTip: { x: -.5, y: 1.65, z: .025 } }).settle(15), e = s.evaluation;
  close(e.windSurfaceLength, 0); close(e.surfaceSupportN, 0);
  assert.ok(s.curves.wind.every(p => p.y > s.options.waterY));
  assert.ok(e.rodTensionN > .03); close(arc(s.curves.wind), s.options.mainLength - s.options.floatToSwivel, 3e-5);
  check(s);
});
test('surface support is a separate contact assumption, not a changed line density or legacy physics', () => {
  const floating = T.create().settle(10), pressed = T.create({ windOnSurface: false }).settle(10);
  close(floating.evaluation.lineMassG, pressed.evaluation.lineMassG, 1e-12);
  close(floating.options.lineDensity, P.materials.nylon); close(pressed.options.lineDensity, P.materials.nylon);
  close(pressed.evaluation.surfaceSupportN, 0); close(pressed.evaluation.windSurfaceLength, 0);
  assert.ok(Math.min(...pressed.curves.wind.map(p => p.y)) < pressed.nodes.floatFoot.y - .05);
});
test('settle is actual deterministic elapsed physical time; small-frame integration agrees', () => {
  const a = T.create(), b = T.create();
  a.settle(2);
  for (let i = 0; i < 120; i++) b.step(1 / 60);
  close(a.snapshot().time, 2, 1e-10);
  for (const key of ['floatFoot', 'floatTop', 'lead', 'swivel']) close(dist(a.snapshot().nodes[key], b.snapshot().nodes[key]), 0, 1e-9);
  const c = T.create(); for (let i = 0; i < 200; i++) c.step(.01);
  close(dist(a.snapshot().nodes.floatFoot, c.snapshot().nodes.floatFoot), 0, .015);
  assert.throws(() => a.step(-1), RangeError); assert.throws(() => a.step(NaN), RangeError);
  assert.throws(() => a.settle(Infinity), RangeError);
  a.step(0); finiteJSON(a.snapshot());
});

test('surface wind arc has fixed material length across general main lengths and seat coordinates', () => {
  for (const mainLength of [1.2, 2.4, 20]) {
    const sim = T.create({ mainLength, rodTip: { x: -.075, y: .95, z: .025 } });
    sim.reset({ cast: false });
    const mass = sim.snapshot().evaluation.lineMassG;
    for (const floatToSwivel of [.18, .42, .8]) {
      sim.configure({ floatToSwivel });
      for (const leadAboveSwivel of [.02, .10]) {
        sim.configure({ leadAboveSwivel });
        const s = sim.snapshot(); finiteJSON(s);
        close(s.options.mainLength, mainLength);
        close(s.evaluation.lineMassG, mass, 1e-12);
        close(arc(s.curves.wind), mainLength - floatToSwivel, 1e-8);
        assert.ok(s.evaluation.windSurfaceLength > 0);
        assert.ok(s.evaluation.windSurfaceLength <= mainLength - floatToSwivel);
      }
    }
  }
});

test('surface retention detaches immediately when unreachable and recovers after an actual lift and lowering', () => {
  const sim = T.create(), low = sim.settle(), mass = low.evaluation.lineMassG;
  sim.configure({ rodTip: { y: 1.65 } });
  const unreachable = sim.snapshot();
  close(unreachable.evaluation.windSurfaceLength, 0); close(unreachable.evaluation.surfaceSupportN, 0);
  const high = sim.settle(); check(high);
  assert.ok(high.nodes.hooks.every((p, i) => p.y > low.nodes.hooks[i].y + .1));
  assert.ok(high.evaluation.rodReaction.y > .03);
  close(high.evaluation.surfaceSupportN, 0); close(high.evaluation.windSurfaceLength, 0);
  assert.ok(!high.evaluation.contacts.hooks.some(Boolean));
  assert.ok(high.evaluation.staticResidualN < 1e-6);
  close(high.evaluation.lineMassG, mass, 1e-12);
  sim.configure({ rodTip: { y: 1.10 } });
  const lowered = sim.settle(); check(lowered);
  assert.ok(lowered.evaluation.windSurfaceLength > .25);
  assert.ok(lowered.evaluation.surfaceSupportN > 0);
  assert.ok(lowered.evaluation.staticResidualN < 1e-6);
  close(lowered.evaluation.lineMassG, mass, 1e-12);
  close(arc(lowered.curves.wind), lowered.options.mainLength - lowered.options.floatToSwivel, 1e-8);
});

test('nylon, fluoro and PE keep their material masses with separate interface support and force closure', () => {
  for (const lineMaterial of ['nylon', 'fluoro', 'pe']) {
    const sim = T.create({ lineMaterial }), held = sim.settle(), e = held.evaluation, o = held.options;
    check(held);
    assert.ok(e.windSurfaceLength > 0 && e.surfaceSupportN > 0);
    const expectedMass = (Math.PI * o.mainDiameter ** 2 / 4 * o.mainLength
      + Math.PI * o.subDiameter ** 2 / 4 * o.leaderLengths.reduce((a, b) => a + b, 0)) * P.materials[lineMaterial] * 1000;
    close(e.lineMassG, expectedMass, 1e-12);
    close(e.buoyancyN - e.weightN + e.bottomSupportN + e.rodReaction.y + e.surfaceSupportN, 0, 1e-7);
    sim.configure({ windOnSurface: false });
    const free = sim.snapshot();
    assert.deepEqual(free.nodes, held.nodes, 'retention configuration never resets dynamics');
    close(free.evaluation.surfaceSupportN, 0); close(free.evaluation.windSurfaceLength, 0);
    close(free.evaluation.lineMassG, e.lineMassG, 1e-12);
    close(arc(free.curves.wind), o.mainLength - o.floatToSwivel, 1e-8);
    assert.ok(e.lineBuoyancyG < free.evaluation.lineBuoyancyG, 'surface line is not fully immersed');
  }
  const denseWater = T.create({ lineMaterial: 'pe', waterDensity: 2500 }); denseWater.reset({ cast: false });
  const s = denseWater.snapshot(); finiteJSON(s);
  assert.ok(s.evaluation.windSurfaceLength > 0);
  close(s.evaluation.surfaceSupportN, 0, 1e-12); // buoyant line needs less immersion, not downward support
});

test('surface contact length vanishes continuously as the wind material becomes taut', () => {
  const sim = T.create(); sim.reset({ cast: false });
  const start = sim.snapshot(), chord = dist(start.nodes.rod, start.nodes.floatFoot), spans = [], offsets=[];
  const a=start.nodes.rod,b=start.nodes.floatFoot,u={x:(b.x-a.x)/chord,y:(b.y-a.y)/chord,z:(b.z-a.z)/chord};
  for (const slack of [.001, .0001, .00001, 1e-7, 0]) {
    sim.configure({ mainLength: start.options.floatToSwivel + chord + slack });
    const s = sim.snapshot(); finiteJSON(s);
    const ps=s.curves.wind;
    close(arc(ps), chord + slack, 1e-8);
    close(dist(ps[0],a),0);close(dist(ps.at(-1),b),0);
    const offset=Math.max(...ps.map(p=>{const t=(p.x-a.x)*u.x+(p.y-a.y)*u.y+(p.z-a.z)*u.z;return dist(p,{x:a.x+t*u.x,y:a.y+t*u.y,z:a.z+t*u.z});}));
    offsets.push(offset);spans.push(s.evaluation.windSurfaceLength);
    assert.ok(offset<=Math.sqrt(Math.max(0,(chord+slack)**2-chord**2))/2+1e-9,'whole rounded path stays in its fixed-length endpoint ellipse');
    for(let i=1;i<ps.length-1;i++) {
      const p=ps[i-1],q=ps[i],r=ps[i+1],l=dist(p,q),m=dist(q,r);
      // Sub-angstrom chords cannot produce a stable floating-point direction.
      if(Math.min(l,m)<1e-10)continue;
      const cosine=((q.x-p.x)*(r.x-q.x)+(q.y-p.y)*(r.y-q.y)+(q.z-p.z)*(r.z-q.z))/(l*m);
      assert.ok(Math.acos(Math.max(-1,Math.min(1,cosine)))<5*Math.PI/180,'shrinking rounded legs do not leave a sampled sharp corner');
    }
  }
  for(let i=1;i<spans.length;i++) {
    assert.ok(spans[i]<spans[i-1]);assert.ok(offsets[i]<offsets[i-1]);
  }
  close(spans.at(-1),0);close(offsets.at(-1),0,1e-10);close(sim.snapshot().evaluation.surfaceSupportN,0);
});
