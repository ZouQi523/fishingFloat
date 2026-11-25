'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const P = require('../src/physics.js');
const C = P.constants;
const close = (actual, expected, tolerance = 1e-10) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected} (tol ${tolerance})`);
function simulate(mass, dt, seconds = 25, options) {
  let state = { topY: 1.2, velocityY: 0 };
  for (let i = 0; i < Math.round(seconds / dt); i++) state = P.step(state, dt, mass, options);
  return state;
}

test('UMD builds the same browser global without require or THREE', () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/physics.js'), 'utf8'), context);
  close(context.FloatPhysics.totalVolume, P.totalVolume);
  assert.equal(typeof context.FloatPhysics.step, 'function');
});

test('SI constants and continuous, realistic float profile', () => {
  close(C.WATER_DENSITY, 998.2); close(C.GRAVITY, 9.80665);
  close(C.FLOAT_MASS_G, .6); close(C.FLOAT_LENGTH, .26);
  assert.ok(P.totalVolume > 3e-6 && P.totalVolume < 6e-6);
  for (const boundary of [C.BODY_START, C.BODY_END]) close(P.radius(boundary - 1e-10), P.radius(boundary + 1e-10), 1e-9);
  close(P.radius(.1625), .0056);
});

test('volume integration agrees with independent high-resolution quadrature', () => {
  let volume = 0;
  const n = 100000, h = C.FLOAT_LENGTH / n;
  for (let i = 0; i < n; i++) volume += Math.PI * P.radius((i + .5) * h) ** 2 * h;
  close(P.totalVolume, volume, 2e-12);
  close(P.volumeBelow(-1), P.totalVolume); close(P.volumeBelow(1), 0);
  for (let s = 0; s < .26; s += .001) assert.ok(P.volumeBelow(s + .001) <= P.volumeBelow(s));
});

test('lead geometry conserves actual mass and displaces water', () => {
  for (const mass of [0, .01, 1, 3, 5, 10]) {
    const d = P.leadDimensions(mass);
    close(Math.PI * (d.radius ** 2 - d.innerRadius ** 2) * d.height * C.LEAD_DENSITY, mass / 1000);
    close(d.subAnchorOffsetY, -d.height - C.RING_DROP);
  }
  const e1 = P.evaluate(.75, 1), e2 = P.evaluate(.75, 2);
  close(e2.weightN - e1.weightN, .001 * C.GRAVITY);
  close(e2.buoyancyN - e1.buoyancyN, C.WATER_DENSITY * (.001 / C.LEAD_DENSITY) * C.GRAVITY);
  close(e2.netForceN - e1.netForceN, -.001 * (1 - C.WATER_DENSITY / C.LEAD_DENSITY) * C.GRAVITY);
});

test('nylon line weight uses physical diameters, length and density', () => {
  const e = P.evaluate(.75, 3);
  const volume = Math.PI / 4 * (C.MAIN_DIAMETER ** 2 * C.MAIN_LENGTH + 2 * C.SUB_DIAMETER ** 2 * C.SUB_LENGTH);
  close(e.lineMassG, 1140 * volume * 1000);
  close(e.lineBuoyancyG, C.WATER_DENSITY * volume * 1000);
  assert.ok(e.lineMassG > e.lineBuoyancyG);
  assert.ok(e.lineMassG < .01); // Not the previous visually inflated millimetre-thick rope.
});

test('material switching changes line weight without changing displacement', () => {
  const nylon = P.evaluate(.75, 3, { lineMaterial: 'nylon' });
  const fluoro = P.evaluate(.75, 3, { lineMaterial: 'fluoro' });
  const pe = P.evaluate(.75, 3, { lineMaterial: 'pe' });
  close(nylon.lineBuoyancyG, fluoro.lineBuoyancyG); close(nylon.lineBuoyancyG, pe.lineBuoyancyG);
  assert.ok(fluoro.netForceN < nylon.netForceN && nylon.netForceN < pe.netForceN);
  assert.ok(pe.lineApparentMassG < 0);
  assert.throws(() => P.evaluate(.75, 3, { lineMaterial: 'unobtainium' }), RangeError);
});

test('buoyant PE slack arches upward instead of pushing through a compressed strand', () => {
  const e = P.evaluate(.4, 5, { lineMaterial: 'pe' });
  const main = e.strands.main;
  assert.equal(main.shape, 'arch');
  assert.ok(main.highY >= e.layout.mainStartY && main.highY >= e.layout.mainEndY);
  assert.ok(main.topLoadN < 0 && main.bottomLoadN < 0);
  close(main.floorLoadN, 0);
  close(main.topLength + main.bottomLength + main.surfaceLength, C.MAIN_LENGTH);
  close(e.netForceN, e.buoyancyN - e.weightN + e.bottomSupportN);
});

test('partially wet line loses buoyancy continuously when lifted', () => {
  const wet = P.evaluate(.90, 3), partial = P.evaluate(1.2, 3), dry = P.evaluate(1.5, 3);
  assert.ok(wet.lineBuoyancyG > partial.lineBuoyancyG);
  assert.ok(partial.lineBuoyancyG > dry.lineBuoyancyG);
  close(dry.lineBuoyancyG, 0);
  close(wet.lineMassG, dry.lineMassG);
});

test('hook, bait, lead seat and swivel mass are not omitted', () => {
  const e = P.evaluate(.75, 3);
  const baitMassKg = C.BAIT_DENSITY * 4 / 3 * Math.PI * C.BAIT_RADIUS ** 3;
  close(e.massKg, (.6 + 3 + C.SEAT_MASS_G + C.SWIVEL_MASS_G + 2 * C.HOOK_MASS_G + e.lineMassG) / 1000 + 2 * baitMassKg);
  close(e.netForceN, e.buoyancyN - e.weightN + e.bottomSupportN);
});

test('equilibrium exposure decreases monotonically as lead increases', () => {
  let last = Infinity;
  for (let mass = 0; mass <= 6; mass += .025) {
    const e = P.equilibrium(mass);
    assert.ok(e.topY <= last + 1e-8, `${mass}: ${e.topY} > ${last}`);
    close(e.netForceN, 0, 1e-8);
    assert.equal(e.converged, true);
    last = e.topY;
  }
});

test('float mass is an independent parameter, not back-solved from a target mark', () => {
  const light = P.equilibrium(3, { floatMassG: .5 });
  const heavy = P.equilibrium(3, { floatMassG: .8 });
  assert.ok(light.topY > heavy.topY);
  close(P.evaluate(.75, 3, { floatMassG: .8 }).weightN - P.evaluate(.75, 3, { floatMassG: .5 }).weightN, .0003 * C.GRAVITY);
});

test('fully submerged overweight rig cannot hover in midwater', () => {
  const a = P.evaluate(.8, 5), b = P.evaluate(.6, 5);
  assert.ok(a.netForceN < 0); close(a.netForceN, b.netForceN);
  close(a.bottomSupportN, 0); close(b.bottomSupportN, 0);
  const e = P.equilibrium(5);
  assert.equal(e.status, 'lead-bottom'); assert.ok(e.topY < .6);
  close(e.layout.leadBottomY - C.RING_EXTENT, C.BOTTOM_Y);
});

test('hook contact releases hook and bait weight, never lifts the lead from below', () => {
  const boundary = P.rigLayout(.75, 5).contactTopYs.hooks;
  const before = P.evaluate(boundary + .001, 5), after = P.evaluate(boundary - .001, 5);
  assert.equal(before.contacts.hooks[0], false);
  assert.equal(after.contacts.hooks[0], true);
  assert.equal(after.contacts.lead, false);
  assert.ok(after.netForceN < 0, 'Overweight lead must keep sinking after hooks touch');
  assert.ok(after.netForceN > before.netForceN);
  assert.ok(after.bottomSupportG < .12, 'Hook contact cannot support the entire 5g sinker');
  close(after.layout.leadTopY, after.layout.floatBottomY - C.MAIN_LENGTH);
  assert.ok(after.layout.subSlack > 0);
});

test('static contact reactions are partial and nonnegative at exact touching', () => {
  for (const mass of [4.1, 5]) {
    const e = P.equilibrium(mass);
    assert.ok(e.contacts.hooks[0]); assert.ok(e.bottomSupportN >= 0);
    close(e.netForceN, 0);
  }
  assert.equal(P.equilibrium(4.1).status, 'hooks-bottom');
  const heavyFloat = P.equilibrium(0, { floatMassG: 6 });
  assert.equal(heavyFloat.status, 'sunk');
  close(heavyFloat.topY, C.BOTTOM_Y + C.FLOAT_LENGTH); close(heavyFloat.netForceN, 0);
});

test('main and subline geometry conserves length even with bed slack', () => {
  for (const y of [.95, .52, .5, .4442, .4, .315]) {
    const e = P.evaluate(y, 5), l = e.layout;
    close(l.mainStartY, l.floatBottomY); close(l.mainEndY, l.leadTopY);
    close(l.subAnchorY, l.leadBottomY - C.RING_DROP);
    close(e.strands.main.topLength + e.strands.main.bottomLength + e.strands.main.floorLength, C.MAIN_LENGTH);
    for (const s of e.strands.subs) close(s.topLength + s.bottomLength + s.floorLength, C.SUB_LENGTH);
    assert.ok(l.hookYs[0] - C.HOOK_EXTENT >= C.BOTTOM_Y - 1e-10);
    assert.ok(l.leadBottomY - C.RING_EXTENT >= C.BOTTOM_Y - 1e-10);
  }
});

test('dynamics settles floating, hook-grounded and lead-grounded rigs', () => {
  for (const mass of [0, 3, 4, 4.1, 5, 10]) {
    const state = simulate(mass, 1 / 60);
    close(state.topY, P.equilibrium(mass).topY, .0004);
    assert.ok(Math.abs(state.velocityY) < .002);
    assert.ok(Number.isFinite(state.evaluation.netForceN));
  }
});

test('fixed small substeps give stable comparable results across frame rates', () => {
  for (const mass of [3, 4.1, 5, 10]) {
    const slow = simulate(mass, 1 / 30), fast = simulate(mass, 1 / 144);
    close(slow.topY, fast.topY, .0002);
    close(slow.velocityY, fast.velocityY, .002);
  }
});

test('editable total bait mass updates volume, wet load and bed clearance consistently', () => {
  const dry = P.evaluate(1.5, 3, { baitMassG: 0 });
  const bait = P.evaluate(1.5, 3, { baitMassG: .34 });
  close(bait.weightN - dry.weightN, .00034 * C.GRAVITY);
  const wet0 = P.evaluate(.7, 3, { baitMassG: 0 });
  const wet = P.evaluate(.7, 3, { baitMassG: .34 });
  close(wet.buoyancyN - wet0.buoyancyN, .00034 / C.BAIT_DENSITY * C.WATER_DENSITY * C.GRAVITY);
  close(wet.options.baitRadius ** 3 * 4 / 3 * Math.PI * 2 * C.BAIT_DENSITY, .00034);
  for(const baitMassG of [0,.34,1,5]){
    const e=P.equilibrium(8,{baitMassG}), l=e.layout;
    if(baitMassG>0)assert.ok(l.baitCenterYs[0]-e.options.baitRadius>=C.BOTTOM_Y-1e-10);
    assert.ok(l.hookYs[0]-.0155>=C.BOTTOM_Y-1e-10);
  }
  assert.ok(P.equilibrium(4,{baitMassG:.34}).topY>P.equilibrium(4,{baitMassG:1}).topY);
});

test('water density alters buoyancy without changing actual component masses', () => {
  const warm=P.evaluate(.75,4,{waterDensity:992.2}), cool=P.evaluate(.75,4,{waterDensity:999.8});
  close(warm.massKg,cool.massKg);
  close(cool.buoyancyN/warm.buoyancyN,999.8/992.2);
  assert.ok(P.equilibrium(4,{waterDensity:999.8}).topY>P.equilibrium(4,{waterDensity:992.2}).topY);
});

test('no spring target: initial acceleration follows evaluated physical force', () => {
  const initial = { topY: .7, velocityY: 0 }, e = P.evaluate(initial.topY, 5);
  const dt = 1e-5, s = P.step(initial, dt, 5);
  close(s.velocityY / dt, e.netForceN / e.effectiveMassKg, 1e-10);
  assert.ok(s.topY < initial.topY);
  assert.throws(() => P.step(initial, -1, 5), RangeError);
});
