'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const T = require('../src/tackle.js');
const F = require('../src/fish-behavior.js');
const L = require('../src/fish-lab.js');
const H = 1 / 240, SEED = 20261125;
const magnitude = v => Math.hypot(v.x, v.y, v.z);
const distance = (a, b) => Math.hypot(a.x-b.x, a.y-b.y, a.z-b.z);
const legacy = s => { const { lastInteraction, ...old } = s; return old; };
const outcomes = {};

// Observe each real integration tick without constructing full curves per tick.
// A full diagnostic snapshot is sampled only every 12 ticks (20 Hz).
function runExperiment(id, options = {}, seed = SEED, ticks = 4000, parameters = {}) {
  const rig = T.create(options); rig.settle(20);
  const initial = rig.getInteractionState();
  const metrics = { ticks, heldSamples: 0, nonzeroTicks: 0, contactTicks: 0, appliedContactTicks: 0,
    maxRequestedForceN: 0, maxFloatFootRiseM: 0, maxFloatFootDropM: 0,
    maxFloatFootDisplacementM: 0, maxLengthErrorM: 0 };
  const originalStep = rig.step;
  rig.step = (dt, input) => {
    if (input) {
      const force = (input.hooks || []).reduce((a, f) => a + magnitude(f), 0)
        + (input.lineContacts || []).reduce((a, c) => a + magnitude(c.force), 0);
      metrics.maxRequestedForceN = Math.max(metrics.maxRequestedForceN, force);
      if (force > 1e-12) metrics.nonzeroTicks++;
      const before = rig.getInteractionState();
      for (const c of input.lineContacts || []) {
        metrics.contactTicks++;
        if (distance(before.nodes.leaderAnchor, before.nodes.hooks[c.leader]) >= before.options.leaderLengths[c.leader] - 1e-6)
          metrics.appliedContactTicks++;
      }
    }
    originalStep(dt, input);
    const current = rig.getInteractionState(), dy = current.nodes.floatFoot.y - initial.nodes.floatFoot.y;
    metrics.maxFloatFootRiseM = Math.max(metrics.maxFloatFootRiseM, dy);
    metrics.maxFloatFootDropM = Math.min(metrics.maxFloatFootDropM, dy);
    metrics.maxFloatFootDisplacementM = Math.max(metrics.maxFloatFootDisplacementM,
      distance(current.nodes.floatFoot, initial.nodes.floatFoot));
    return rig;
  };
  const lab = L.create({ rig, seed }); lab.configure(parameters); lab.trigger(id);
  let snapshot;
  for (let n = 0; n < ticks;) {
    const count = Math.min(12, ticks - n); snapshot = lab.step(count); n += count;
    if (snapshot.fish.held) metrics.heldSamples++;
    metrics.maxLengthErrorM = Math.max(metrics.maxLengthErrorM, snapshot.rig.evaluation.maxLengthError);
  }
  return { ...metrics, states: [...new Set(snapshot.events.map(e => e.state))], events: snapshot.events,
    failedCapture: snapshot.fish.failedCapture, finalState: snapshot.fish.state,
    finalFloatFootDisplacementM: distance(snapshot.rig.nodes.floatFoot, initial.nodes.floatFoot),
    finalFloatFootVerticalOffsetM: snapshot.rig.nodes.floatFoot.y - initial.nodes.floatFoot.y,
    finalFloatFootSpeedMps: magnitude(snapshot.rig.velocities[0]),
    finalForceN: magnitude(snapshot.rig.lastInteraction.total), snapshot };
}

function finite(value) {
  if (typeof value === 'number') assert.ok(Number.isFinite(value));
  else if (value && typeof value === 'object') for (const item of Object.values(value)) finite(item);
}

test('fish modules load as browser globals without DOM, THREE or rig mutation APIs', () => {
  const context = vm.createContext({});
  for (const file of ['fish-body.js', 'fish-collision.js', 'fish-behavior.js', 'fish-lab.js'])
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), context);
  assert.equal(typeof context.FishBehavior.create, 'function');
  assert.equal(typeof context.FishLab.create, 'function');
  assert.equal(Object.keys(F.labels).length, 10);
  assert.equal(Object.keys(F.experiments).length, 8);
  assert.throws(() => L.create(), TypeError);
});

for (const id of Object.keys(F.experiments)) test(`4000-tick ${id} experiment uses actual force, releases and stays finite`, () => {
  const result = outcomes[id] = runExperiment(id);
  finite(result);
  assert.equal(result.failedCapture, false);
  assert.equal(result.finalState, 'cruise');
  assert.ok(result.nonzeroTicks > 0, `${id} must produce nonzero physical force`);
  if (id === 'rub') {
    assert.equal(result.heldSamples, 0);
    assert.ok(result.appliedContactTicks > 0, 'rub must really reach a taut line');
  } else {
    assert.ok(result.heldSamples > 0, `${id} must actually capture the bait`);
    assert.equal(result.contactTicks, 0);
  }
  assert.ok(result.maxFloatFootDisplacementM > 1e-5, 'actual rig must respond');
  assert.ok(result.maxLengthErrorM < .001, 'original line constraints remain respected');
  assert.equal(result.finalForceN, 0, 'released force must not remain sticky');
  assert.ok(Math.abs(result.finalFloatFootVerticalOffsetM) < .0001,
    `vertical equilibrium must naturally recover, observed ${result.finalFloatFootVerticalOffsetM}`);
  assert.ok(result.finalFloatFootSpeedMps < .0001);
});

test('the eight real experiments collectively visit all ten behavioral states', () => {
  const states = new Set(Object.values(outcomes).flatMap(r => r.states));
  assert.deepEqual([...states].sort(), Object.keys(F.labels).sort());
});

test('fixed seed repeats exactly, batched ticks and real-frame partitioning follow one trajectory', () => {
  const create = seed => {
    const rig = T.create(); rig.settle(8);
    const lab = L.create({ rig, seed }); lab.trigger('sideways'); return lab;
  };
  const a = create(SEED), b = create(SEED), c = create(SEED), d = create(SEED + 1);
  const expected = a.step(2000);
  assert.deepEqual(b.step(2000), expected);
  // 500 frames of 1/60s = 2000 fixed physical ticks, independent of snapshots.
  for (let i = 0; i < 500; i++) assert.equal(c.advance(1 / 60), 4);
  assert.deepEqual(c.snapshot(), expected);
  const changed = d.step(2000);
  assert.notDeepEqual(changed.fish.mouth, expected.fish.mouth);
  assert.notDeepEqual(changed.rig.nodes, expected.rig.nodes);
});

test('disabled lab and zero-force enabled experiment match the uncoupled rig bit-for-bit', () => {
  for (const mode of ['disabled', 'force0', 'force0-rub']) {
    const rig = T.create(), control = T.create(); rig.settle(8); control.settle(8);
    const lab = L.create({ rig, seed: SEED });
    if (mode !== 'disabled') { lab.configure({ force: 0 }); lab.trigger(mode === 'force0-rub' ? 'rub' : 'sideways'); }
    const actual = lab.step(3000);
    for (let i = 0; i < 3000; i++) control.step(H);
    assert.deepEqual(legacy(actual.rig), legacy(control.snapshot()), mode);
    assert.equal(magnitude(actual.rig.lastInteraction.total), 0);
    if (mode === 'force0') assert.ok(actual.events.some(e => e.state === 'suck'));
  }
});

test('same lift experiment depends on actual float-seat and bait-mass configuration and releases naturally', () => {
  const configurations = [ { floatToSwivel: .32 }, { floatToSwivel: .7 }, { floatToSwivel: .32, baitMassG: 1.2 } ];
  const results = configurations.map(options => ({ options, result: runExperiment('lift', options) }));
  outcomes.configurationSensitivity = results.map(({ options, result: { snapshot, ...metrics } }) => ({ options, ...metrics }));
  for (const { result } of results) {
    assert.equal(result.failedCapture, false);
    assert.ok(result.heldSamples > 0, 'configuration must really capture bait before testing coupled response');
    assert.equal(result.finalForceN, 0);
    assert.ok(result.maxLengthErrorM < .001);
    assert.ok(Math.abs(result.finalFloatFootVerticalOffsetM) < .0002,
      `release recovers vertically without manipulating the float: ${result.finalFloatFootVerticalOffsetM}`);
  }
  const responses = results.map(({ result }) => result.maxFloatFootRiseM - result.maxFloatFootDropM);
  assert.ok(Math.abs(responses[0] - responses[1]) > .0001, 'seat/slack must affect the measured response');
  assert.ok(Math.abs(responses[0] - responses[2]) > .0001, 'bait load must affect the measured response');
});

test('same lift experiment responds differently to real light/heavy steel hooks and releases', () => {
  const results = [.005, .15].map(hookMassG => ({ options: { floatToSwivel: .32, hookMassG },
    result: runExperiment('lift', { floatToSwivel: .32, hookMassG }, SEED, 5000) }));
  outcomes.hookMassSensitivity = results.map(({ options, result: { snapshot, ...metrics } }) => ({ options, ...metrics }));
  for (const { result } of results) {
    assert.equal(result.failedCapture, false); assert.ok(result.heldSamples > 0);
    assert.equal(result.finalForceN, 0); assert.equal(result.finalState, 'cruise');
    assert.ok(result.maxLengthErrorM < .001);
    assert.ok(Math.abs(result.finalFloatFootVerticalOffsetM) < .001,
      `real hook mass should naturally recover after release: ${result.finalFloatFootVerticalOffsetM}`);
  }
  const response = result => result.maxFloatFootRiseM - result.maxFloatFootDropM;
  assert.ok(Math.abs(response(results[0].result) - response(results[1].result)) > .0001);
});

test('pause, single-tick control, history, time scale and dropped backlog are explicit', () => {
  const rig = T.create(), lab = L.create({ rig, seed: SEED });
  lab.setPaused(true); assert.equal(lab.advance(10), 0);
  assert.equal(lab.step(1).ticks, 1, 'explicit lab.step(1) works while paused');
  lab.setPaused(false); lab.setSpeed(.5); assert.equal(lab.advance(1), 30);
  const s = lab.snapshot(); assert.equal(s.droppedTime, .75); assert.equal(s.history.length, 8);
  assert.ok(s.history.every((point, i) => i === 0 || Math.abs(point.time - s.history[i-1].time - 1/60) < 1e-12));
  assert.throws(() => lab.step(0), RangeError); assert.throws(() => lab.step(24001), RangeError);
  assert.throws(() => lab.advance(NaN), RangeError); assert.throws(() => lab.setSpeed(2), RangeError);
});

test('failed capture diagnostics reset cleanly and rebase leaves settled rig entirely untouched', () => {
  const rig = T.create(), state = rig.getInteractionState(), fish = F.create({ speed: .002 });
  fish.reset(state); fish.trigger('quick', state);
  for (let i = 0; i < 4000; i++) fish.step(H, state);
  assert.equal(fish.snapshot().failedCapture, true, 'slow fish cannot reach the bait within the capture timeout');
  const cleared = fish.reset(state);
  assert.equal(cleared.failedCapture, false); assert.equal(cleared.held, false);
  assert.equal(cleared.state, 'cruise'); assert.equal(cleared.experiment, null);
  assert.equal(cleared.time, 0); assert.equal(magnitude(cleared.appliedForce), 0);
  assert.deepEqual(cleared.events.map(e => e.state), ['cruise']);
  rig.settle(8); const lab = L.create({ rig, seed: SEED }); lab.trigger('lift'); lab.step(1000);
  const before = rig.snapshot(), rebased = lab.rebase();
  assert.deepEqual(rebased.rig, before, 'rebase must not reset/re-settle or alter any existing rig field');
  assert.equal(rebased.ticks, 0); assert.equal(rebased.time, 0); assert.equal(rebased.fish.time, 0);
  assert.equal(rebased.history.length, 1); assert.equal(rebased.fish.state, 'cruise');
  assert.equal(rebased.fish.held, false); assert.equal(rebased.fish.failedCapture, false);
  assert.equal(magnitude(rebased.fish.requestedForce), 0);
});

test('autonomous behavior discovers, approaches and sucks real bait without a manual trigger', () => {
  const rig = T.create(); rig.settle(8);
  let nonzeroTicks = 0; const originalStep = rig.step;
  rig.step = (dt, input) => {
    if (input && input.hooks.some(force => magnitude(force) > 1e-12)) nonzeroTicks++;
    return originalStep(dt, input);
  };
  const lab = L.create({ rig, seed: SEED }); lab.configure({ autonomous: true }); lab.setEnabled(true);
  const result = lab.step(5000), states = result.events.map(e => e.state);
  for (const state of ['discover', 'approach', 'inspect', 'suck']) assert.ok(states.includes(state), state);
  assert.ok(nonzeroTicks > 0, 'autonomous capture must produce actual Newton forces');
  finite(result);
});

test('zero bait cannot be falsely held or pulled by a sucking fish', () => {
  const state = T.create({ baitMassG: 0 }).getInteractionState(), fish = F.create({ seed: SEED });
  fish.reset(state); fish.trigger('lift', state);
  for (let i = 0; i < 4000; i++) {
    const input = fish.step(H, state);
    assert.ok(input.hooks.every(force => magnitude(force) === 0));
    if (i % 12 === 0) assert.equal(fish.snapshot().held, false);
  }
  assert.ok(fish.snapshot().events.some(e => e.state === 'suck'));
});

// Whole-body contact intentionally changes fish-enabled motion. The rejected
// mouth-only numerical baseline is archived in baselines/pre-scan-fish.zip.
// Preserve the actual profile/no-profile equivalence, not penetrative old poses.
test('empty per-state profiles exactly preserve all eight scanned-body responses', () => {
  for (const id of Object.keys(F.experiments)) {
    const repeat=runExperiment(id,{},SEED,4000,{behaviors:{}}),ordinary=outcomes[id];
    assert.deepEqual([repeat.maxFloatFootRiseM,repeat.maxFloatFootDropM],
      [ordinary.maxFloatFootRiseM,ordinary.maxFloatFootDropM],id);
    assert.deepEqual(repeat.snapshot.rig.nodes,ordinary.snapshot.rig.nodes,id+' actual rig');
  }
});

function controllerTrace(state, parameters, experiment, ticks = 3000) {
  const fish = F.create({ seed: SEED, ...parameters }); fish.reset(state);
  if (experiment) fish.trigger(experiment, state); else fish.setEnabled(true, state);
  const maxByState = {}, active = {}, held = new Set();
  for (let i = 0; i < ticks; i++) {
    const before = fish.snapshot(), output = fish.step(H, state), current = fish.snapshot();
    active[before.state] = before.activeParameters;
    maxByState[before.state] = Math.max(maxByState[before.state] || 0,
      ...output.hooks.map(magnitude), ...output.lineContacts.map(c => magnitude(c.force)));
    if (current.held) held.add(current.state);
  }
  return { fish, final: fish.snapshot(), maxByState, active, held };
}

test('state duration overrides queue timing and explicit force never receives mode multipliers', () => {
  const rig = T.create(); rig.settle(20); const state = rig.getInteractionState();
  state.velocities.hooks[1] = { x: -100, y: 0, z: 0 }; // limiter stress, no rig mutation
  for (const experiment of ['quick', 'nibble']) {
    const result = controllerTrace(state, { behaviors: { suck: { force: .0002, duration: .8 } } }, experiment);
    const events = result.final.events, start = events.find(e => e.state === 'suck'), end = events.find(e => e.state === 'spit');
    assert.ok(start && end); assert.ok(Math.abs(end.time - start.time - .8) <= 2 * H);
    assert.ok(Math.abs(result.maxByState.suck - .0002) < 1e-16, experiment);
    assert.equal(result.active.suck.duration, .8); assert.equal(result.active.suck.force, .0002);
    assert.equal(result.active.approach.force, F.defaults.force);
    assert.ok(result.held.size > 0);
  }
  const capped = controllerTrace(state, { force: .05 }, 'quick');
  assert.ok(Math.abs(capped.maxByState.suck - .05) < 1e-14, 'quick global multiplier is still capped at .05N');
});

test('state direction, speed and jitter independently change actual controller motion', () => {
  const state = T.create().getInteractionState();
  const profile = (speed, jitter = 0, direction = { x: 1, y: 0, z: 0 }) => ({ behaviors: { cruise: { speed, jitter, direction } } });
  const slow = controllerTrace(state, profile(.03), null, 120).final;
  const fast = controllerTrace(state, profile(.12), null, 120).final;
  const reversed = controllerTrace(state, profile(.12, 0, { x: -1, y: 0, z: 0 }), null, 120).final;
  const noisy = controllerTrace(state, profile(.12, .02), null, 120).final;
  const initial = F.create().reset(state).mouth;
  assert.ok(fast.mouth.x - initial.x > 2 * (slow.mouth.x - initial.x));
  assert.ok(fast.mouth.x > initial.x && reversed.mouth.x < initial.x);
  assert.equal(fast.mouth.y, initial.y); assert.equal(fast.mouth.z, initial.z);
  assert.notDeepEqual(noisy.mouth, fast.mouth);
  assert.equal(fast.activeParameters.speed, .12); assert.equal(fast.activeParameters.jitter, 0);
  const rig = T.create(); rig.settle(20);
  const lifted = controllerTrace(rig.getInteractionState(), { behaviors: { lift: {
    duration: .4, speed: .05, jitter: 0, direction: { x: 0, y: 2, z: 0 }, force: .0003
  } } }, 'lift');
  assert.deepEqual(lifted.active.lift.direction, { x: 0, y: 1, z: 0 });
  assert.equal(lifted.active.lift.speed, .05); assert.equal(lifted.active.lift.jitter, 0);
  assert.ok(lifted.maxByState.lift > 0 && lifted.maxByState.lift <= .0003 + 1e-16);
  const events = lifted.final.events, start = events.find(e => e.state === 'lift'), end = events.find(e => e.state === 'spit');
  assert.ok(Math.abs(end.time - start.time - .4) <= 2 * H);
});

test('profiles merge, detach input and snapshots, and clear overrides back to defaults', () => {
  const input = { behaviors: { cruise: { speed: .12, direction: { x: 0, y: 1, z: 0 } }, suck: { duration: .8, force: .0002 } } };
  const fish = F.create(input); input.behaviors.cruise.direction.y = 99; input.behaviors.suck.force = 99;
  const before = fish.snapshot(); assert.equal(before.behaviors.suck.force, .0002);
  before.behaviors.cruise.direction.y = 88; before.activeParameters.direction.y = 77;
  before.activeParameters.speed = 88; before.parameters.direction.x = 99;
  assert.deepEqual(fish.snapshot().behaviors.cruise.direction, { x: 0, y: 1, z: 0 });
  assert.equal(fish.snapshot().activeParameters.speed, .12);
  fish.configure({ behaviors: { suck: { jitter: 0 } } });
  assert.deepEqual(fish.snapshot().behaviors.suck, { duration: .8, force: .0002, jitter: 0 });
  const cleared = fish.configure({ behaviors: { cruise: null } });
  assert.equal(cleared.behaviors.cruise, undefined); assert.ok(cleared.behaviors.suck);
  assert.equal(cleared.activeParameters.speed, F.defaults.speed);
  assert.deepEqual(cleared.activeParameters.direction, F.defaults.direction);
  fish.configure({ behaviors: { suck: null } }); assert.deepEqual(fish.snapshot().behaviors, {});
  const state = T.create().getInteractionState(), original = F.create();
  fish.reset(state); original.reset(state); fish.setEnabled(true, state); original.setEnabled(true, state);
  for (let i = 0; i < 240; i++) { fish.step(H, state); original.step(H, state); }
  assert.deepEqual(fish.snapshot(), original.snapshot(), 'clearing all profiles restores the exact default trajectory');
});

test('profiles reject unknown states and nonfinite values without modifying existing overrides', () => {
  const fish = F.create({ behaviors: { suck: { force: .0002 } } }), before = fish.snapshot();
  for (const behaviors of [ { unknown: {} }, { suck: { force: NaN } }, { lift: { duration: Infinity } },
    { swim: { speed: NaN } }, { rub: { jitter: Infinity } }, { lift: { direction: { x: 0, y: NaN, z: 0 } } },
    { suck: { force: .001 }, unknown: {} } ]) {
    assert.throws(() => fish.configure({ behaviors }));
    assert.deepEqual(fish.snapshot(), before, 'rejected update must not partly alter overrides');
  }
});

test('autonomous cruise duration override changes its wait while default stays one second', () => {
  const state = T.create().getInteractionState();
  const ordinary = controllerTrace(state, { autonomous: true }, null, 360);
  const custom = controllerTrace(state, { autonomous: true, behaviors: { cruise: { duration: .4 } } }, null, 360);
  const firstDiscovery = result => result.final.events.find(event => event.state === 'discover').time;
  assert.ok(Math.abs(firstDiscovery(ordinary) - 1) <= 2 * H);
  assert.ok(Math.abs(firstDiscovery(custom) - .4) <= 2 * H);
});

test('write optional quantitative QA report without changing production files', () => {
  if (!process.env.UPDATE_FISH_QA) return;
  const experiments = Object.fromEntries(Object.entries(outcomes).filter(([id]) => Object.hasOwn(F.experiments, id))
    .map(([id, { snapshot, ...metrics }]) => [id, metrics]));
  fs.writeFileSync(path.join(__dirname, '../qa-fish-experiments.json'), JSON.stringify({
    seed: SEED, dt: H, ticks: 4000, experiments, configurationSensitivity: outcomes.configurationSensitivity,
    hookMassSensitivity: outcomes.hookMassSensitivity,
    note: 'Snapshots sampled every 12 ticks; actual force and physical-node extrema observed each tick. Horizontal release offset is not expected to vanish in the original rig.'
  }, null, 2) + '\n');
});
