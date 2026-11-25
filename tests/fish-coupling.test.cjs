'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const T = require('../src/tackle.js');
const dt = 1 / 240;
const vec = (x = 0, y = 0, z = 0) => ({ x, y, z });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const legacySnapshot = rig => { const { lastInteraction, ...legacy } = rig.snapshot(); return legacy; };

// Captured BEFORE editing tackle.js, by executing its original source in a VM.
// Original source SHA256: 001e46d061a8bc7ff41f6ab77d463ce766b42c87123cc763f48ee5f7bcc2ed60
// Hashes cover EVERY original snapshot field (including curves, reactions, options,
// six-node velocities and sliding coordinate), not rounded/selected coordinates.
const baseline = [
  { options: {}, hashes: [
    '9c7a05615fa9b9857f43937cec4a2dfe9116b88c0e0a7eeb38898d4ef883c34f',
    'ca9a219a410b2ce14074a0cae137958f1eaf5784ff18bb54b85f25d0063ef26f',
    '81a8e4cd62cbdf47ed5708d435ffd7bd4c4c2b7f51adf85a9a770d73051ba6c6',
    '10b87194f83d1831743c5ab861133c905a57d737974c22b11f71132f76f39b74'
  ], finalFoot: vec(-.1892762882353487, .5947000674218229, .025076082151009375) },
  { options: { leadLocked: false, leadAboveSwivel: .08 }, hashes: [
    'cb8726c1d719fe1cf0e62835623ce1135d9ec8624b84211b9bc91415c323f699',
    '63a71a5c0e474c5ec3fd60d13e2cb3e7bd41ea8bf239c5931bc16395af705cb1',
    '86bfb7f3ffa577213d365622a505843bbd2cfed73bf58ebd3578da939afc630e',
    'dcd0f3b2ffd0e759ad755b1728c74c826653fa9f6beae316da22b74ca892cf69'
  ], finalFoot: vec(-.19424889308926035, .5952838392213549, .025067204778546206) },
  { options: { floatToSwivel: .9, leadMassG: 8, baitMassG: 1.2, leaderLengths: [.18, .22] }, hashes: [
    '626d995ff9b8c2597d42e361e30ed8bd5bb9c4bd34003949ff20814c5a98ccbb',
    'b59a9453ccaa1216db2f3aa2ddf8e28277c1721de14be4851e699f4cdb5137fb',
    'b0cbc16d7bfb80ffb9d5bad9b1f0a484574b658a38bcee6ba5362e183c0a89cd',
    'c0c3a33800a0e51d39571de7e58a700d0e4a6359e7cee738eb835dca390a89d7'
  ], finalFoot: vec(-.5609992400898658, .8205935917554621, .024628151970644985) }
];

test('uncoupled and explicit zero-force trajectories exactly match pre-change VM baselines', () => {
  for (const fixture of baseline) {
    for (const interaction of [undefined, {}, { hooks: [vec(), vec()], lineContacts: [] }]) {
      const rig = T.create(fixture.options);
      [0, .1, .4, 1.5].forEach((seconds, i) => {
        rig.step(seconds, interaction);
        assert.equal(digest(legacySnapshot(rig)), fixture.hashes[i]);
      });
      assert.deepEqual(rig.snapshot().nodes.floatFoot, fixture.finalFoot);
    }
  }
});

test('optional hook mass preserves legacy options, validates atomically and keeps default physics exact', () => {
  const ordinary = T.create(), explicit = T.create({ hookMassG: .025 });
  assert.equal(Object.hasOwn(ordinary.options, 'hookMassG'), false);
  assert.equal(Object.hasOwn(T.normalize({ hookMassG: undefined }), 'hookMassG'), false);
  assert.equal(T.normalize({ hookMassG: 1 }).hookMassG, .3);
  assert.equal(T.normalize({ hookMassG: 0 }).hookMassG, 0);
  ordinary.step(.4); explicit.step(.4);
  const a = ordinary.snapshot(), b = explicit.snapshot();
  delete b.options.hookMassG; delete b.evaluation.options.hookMassG;
  assert.deepEqual(b, a, 'explicit standard hook changes no geometry, forces or trajectory');
  for (const hookMassG of [NaN, Infinity, -Infinity, -.001, null, '0.1']) {
    const before = explicit.snapshot();
    assert.throws(() => explicit.configure({ hookMassG, leadMassG: 9 }));
    assert.deepEqual(explicit.snapshot(), before);
    assert.throws(() => T.create({ hookMassG }));
  }
  explicit.configure({ hookMassG: .08 }); explicit.configure({ baitMassG: .5 });
  assert.equal(explicit.options.hookMassG, .08, 'other configuration changes retain an explicit hook mass');
});

test('hook mass changes real steel weight and displaced volume at identical geometry, then real settlement', () => {
  const C = require('../src/physics.js').constants;
  const light = T.create({ floatToSwivel: .32, hookMassG: .005 });
  const heavy = T.create({ floatToSwivel: .32, hookMassG: .15 });
  const a = light.snapshot(), b = heavy.snapshot(), deltaKg = 2 * (.15 - .005) / 1000;
  assert.deepEqual(a.nodes, b.nodes); assert.deepEqual(a.curves, b.curves);
  assert.ok(a.nodes.hooks.every(hook => hook.y < a.options.waterY));
  assert.ok(Math.abs(b.evaluation.weightN - a.evaluation.weightN - deltaKg * C.GRAVITY) < 1e-15);
  const steelVolume = deltaKg / C.STEEL_DENSITY;
  assert.ok(Math.abs(b.evaluation.displacedVolume - a.evaluation.displacedVolume - steelVolume) < 1e-18);
  assert.ok(Math.abs(b.evaluation.buoyancyN - a.evaluation.buoyancyN - steelVolume * a.options.waterDensity * C.GRAVITY) < 1e-15);
  light.settle(20); heavy.settle(20);
  const settledLight = light.snapshot(), settledHeavy = heavy.snapshot();
  assert.ok(settledLight.nodes.floatFoot.y > settledHeavy.nodes.floatFoot.y + .05);
  assert.ok(settledLight.evaluation.maxLengthError < .001);
  assert.ok(settledHeavy.evaluation.maxLengthError < .001);
  assert.deepEqual(settledLight.options.leaderLengths, settledHeavy.options.leaderLengths);
  assert.equal(settledLight.options.hookExtent, settledHeavy.options.hookExtent);
});

test('light state matches physical nodes and is detached without advancing time', () => {
  const rig = T.create().step(.2), full = rig.snapshot(), state = rig.getInteractionState();
  for (const key of ['floatFoot', 'floatTop', 'lead', 'swivel', 'leaderAnchor', 'hooks', 'rod']) assert.deepEqual(state.nodes[key], full.nodes[key]);
  assert.deepEqual(state.velocities.hooks, full.velocities.slice(4));
  assert.deepEqual(state.options, full.options);
  assert.equal(state.velocityY, full.velocityY); assert.equal(state.time, full.time);
  assert.equal(state.curves, undefined);
  state.nodes.hooks[0].y = 50; state.nodes.swivel.x = 50;
  state.velocities.hooks[0].y = 50; state.options.leaderLengths[0] = 50; state.options.rodTip.x = 50;
  assert.deepEqual(rig.snapshot(), full);
});

test('invalid forces and contact inputs fail atomically before physics advances', () => {
  const rig = T.create().step(.1), before = rig.snapshot();
  const invalid = [
    { hooks: [vec(NaN), vec()] }, { hooks: [vec(), vec(0, Infinity)] },
    { hooks: [vec()] }, { hooks: Array(2) }, { hooks: [{ x: 1, y: 2 }, vec()] },
    { lineContacts: [{ leader: 2, t: .5, force: vec() }] },
    { lineContacts: [{ leader: 0, t: NaN, force: vec() }] },
    { lineContacts: [{ leader: 0, t: -.01, force: vec() }] },
    { lineContacts: [{ leader: 1, t: 1.01, force: vec() }] },
    { lineContacts: [{ leader: 0, t: .5, force: vec(0, 0, -Infinity) }] },
    { lineContacts: [null] }, { lineContacts: Array(1) }, { lineContacts: {} },
    { nodes: { floatFoot: vec() } }, { floatTop: vec() }, [], 1
  ];
  for (const input of invalid) {
    assert.throws(() => rig.step(dt, input));
    assert.deepEqual(rig.snapshot(), before);
  }
});

test('hook acts on its true node with real slack empty travel, not direct float motion', () => {
  const options = { floatToSwivel: .7 }, a = T.create(options), b = T.create(options);
  a.settle(8); b.settle(8);
  const before = a.snapshot();
  assert.ok(before.options.leaderLengths[0] - dist(before.nodes.leaderAnchor, before.nodes.hooks[0]) > .08);
  a.step(dt, { hooks: [vec(.001), vec()] }); b.step(dt);
  const pulled = a.snapshot(), free = b.snapshot();
  assert.ok(dist(pulled.nodes.hooks[0], free.nodes.hooks[0]) > 1e-5);
  for (const key of ['floatFoot', 'floatTop', 'swivel']) assert.deepEqual(pulled.nodes[key], free.nodes[key]);
  assert.deepEqual(pulled.lastInteraction.nodes.slice(0, 4), [vec(), vec(), vec(), vec()]);
  assert.deepEqual(pulled.lastInteraction.hooks, [vec(.001), vec()]);
  assert.equal(pulled.evaluation.tension.leaders[0], 0);
});

test('hook-only forces pull the existing taut rig, conserve lengths and naturally recover', () => {
  const options = { floatToSwivel: .32, leadMassG: 3.8 }, a = T.create(options), b = T.create(options);
  a.settle(8); b.settle(8);
  const originalMass = a.snapshot().evaluation.lineMassG;
  for (let i = 0; i < 120; i++) {
    a.step(dt, { hooks: [vec(0, -.008), vec()] }); b.step(dt);
    const s = a.snapshot();
    assert.ok(s.evaluation.maxLengthError < .001);
    assert.equal(s.evaluation.lineMassG, originalMass);
    assert.deepEqual(s.options.leaderLengths, [.12, .15]);
    assert.deepEqual(s.lastInteraction.nodes.slice(0, 4), [vec(), vec(), vec(), vec()]);
  }
  const pulled = a.snapshot(), free = b.snapshot();
  assert.ok(dist(pulled.nodes.floatFoot, free.nodes.floatFoot) > .05);
  assert.ok(pulled.nodes.floatTop.y < free.nodes.floatTop.y - .05);
  a.settle(12); b.settle(12);
  assert.ok(dist(a.snapshot().nodes.floatFoot, b.snapshot().nodes.floatFoot) < 1e-4);
  assert.deepEqual(a.snapshot().lastInteraction.total, vec());
});

test('taut contact distributes actual Newton force only to the ring and selected hook', () => {
  const control = T.create(); control.settle(8); control.step(dt);
  const free = control.snapshot();
  for (const t of [0, .25, 1]) {
    const rig = T.create(); rig.settle(8);
    const state = rig.getInteractionState();
    assert.ok(Math.abs(dist(state.nodes.leaderAnchor, state.nodes.hooks[1]) - state.options.leaderLengths[1]) < 1e-6);
    const force = vec(.001, -.002, .003), input = { lineContacts: [{ leader: 1, t, force }] };
    rig.step(dt, input);
    const s = rig.snapshot(), actual = s.lastInteraction;
    assert.equal(actual.lineContacts[0].applied, true); assert.equal(actual.lineContacts[0].taut, true);
    assert.deepEqual(actual.hooks, [vec(), vec()]);
    assert.deepEqual(actual.nodes.slice(0, 3), [vec(), vec(), vec()]); assert.deepEqual(actual.nodes[4], vec());
    for (const k of ['x', 'y', 'z']) {
      assert.equal(actual.nodes[3][k], force[k] * (1 - t) || 0);
      assert.equal(actual.nodes[5][k], force[k] * t || 0);
      assert.ok(Math.abs(actual.total[k] - force[k]) < 1e-18);
    }
    assert.ok(s.evaluation.maxLengthError < .001);
    assert.ok(dist(s.nodes.swivel, free.nodes.swivel) + dist(s.nodes.hooks[1], free.nodes.hooks[1]) > 1e-6,
      'contact changes actual integrated nodes, not only diagnostics');
    input.lineContacts[0].force.x = 99; actual.nodes[3].x = 99;
    assert.notEqual(rig.snapshot().lastInteraction.nodes[3].x, 99);
  }
});

test('slack line contact applies no endpoint approximation and exactly follows unforced physics', () => {
  const options = { floatToSwivel: .7 }, a = T.create(options), b = T.create(options);
  a.settle(8); b.settle(8);
  for (let i = 0; i < 24; i++) {
    a.step(dt, { lineContacts: [{ leader: 0, t: .5, force: vec(.1, -.1, .1) }] }); b.step(dt);
    assert.deepEqual(legacySnapshot(a), legacySnapshot(b));
    const actual = a.snapshot().lastInteraction;
    assert.equal(actual.lineContacts[0].applied, false); assert.equal(actual.lineContacts[0].taut, false);
    assert.deepEqual(actual.total, vec());
    assert.deepEqual(actual.nodes, Array.from({ length: 6 }, () => vec()));
  }
});

test('constant multi-substep forces are deterministic and never sticky after release/reset', () => {
  const a = T.create(), b = T.create(), input = { hooks: [vec(.0001, -.0002), vec(0, 0, .0001)] };
  a.step(1 / 60, input);
  for (let i = 0; i < 4; i++) b.step(dt, input);
  assert.deepEqual(a.snapshot(), b.snapshot());
  const c = T.create().step(1 / 60, input);
  assert.deepEqual(c.snapshot(), a.snapshot());
  a.step(dt);
  assert.deepEqual(a.snapshot().lastInteraction.hooks, [vec(), vec()]);
  assert.deepEqual(a.snapshot().lastInteraction.total, vec());
  b.reset(); assert.deepEqual(b.snapshot().lastInteraction, T.create().snapshot().lastInteraction);
  c.step(0, input);
  assert.deepEqual(c.snapshot().lastInteraction.total, vec(), 'zero elapsed time applies no force');
});
