'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const boot = fs.readFileSync(path.join(root, 'src/boot.js'), 'utf8');
const shell = fs.readFileSync(path.join(root, 'src/shell.html'), 'utf8');

function packed(name, source) {
  const bytes = Buffer.from(source);
  const zipped = zlib.gzipSync(bytes);
  return { name, encoding: 'gzip-base64', sourceBytes: bytes.length,
    compressedBytes: zipped.length, data: zipped.toString('base64') };
}
const appModule = source => packed('src/app.js', source || 'window.__FLOAT_APP_READY__ = Promise.resolve();');

function fixture(modules, options = {}) {
  const listeners = {}, docListeners = {}, frames = [], frameStages = [], executions = [];
  let frame = 0, reloads = 0;
  function element() {
    return { textContent: '', hidden: false, attrs: {}, handlers: {},
      setAttribute(name, value) { this.attrs[name] = value; },
      removeAttribute(name) { delete this.attrs[name]; },
      addEventListener(type, fn) { this.handlers[type] = fn; },
      contains(target) { return target === this; }, focus() { this.focused = true; }, remove() {} };
  }
  const elements = Object.fromEntries(['floatApp', 'loading', 'loadingStage', 'loadingDetail',
    'loadingProgress', 'loadingRetry', 'floatModules'].map(id => [id, element()]));
  elements.floatApp.attrs = { inert: '', 'aria-busy': 'true' };
  elements.loadingRetry.hidden = true;
  elements.floatModules.textContent = JSON.stringify({ version: 1, modules });
  const document = {
    readyState: 'loading', getElementById: id => elements[id],
    createElement: () => element(),
    addEventListener(type, fn) { (docListeners[type] ||= []).push(fn); },
    body: { appendChild(script) {
      executions.push({ frame, name: script.textContent.match(/sourceURL=float-inline\/(.*)/)?.[1] });
      try { vm.runInContext(script.textContent, context); }
      catch (error) { (listeners.error || []).forEach(fn => fn({ error, message: error.message })); }
    } },
  };
  const window = {
    performance: { now: options.now || (() => performance.now()) }, atob,
    setTimeout, location: { reload() { reloads++; } },
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    requestAnimationFrame: options.noRaf ? undefined : cb => {
      setImmediate(() => {
        frame++; frames.push(frame); frameStages.push(elements.loadingStage.textContent); cb(frame * 16);
      });
    },
  };
  Object.assign(window, options.window || {});
  const network = () => { throw new Error('NETWORK FORBIDDEN'); };
  const context = vm.createContext({ window, document, console, Promise, Error,
    Blob, Response: options.Response || Response, Uint8Array,
    DecompressionStream: options.noGzip ? undefined : DecompressionStream,
    fetch: network, XMLHttpRequest: network, WebSocket: network, ...options.globals });
  vm.runInContext(boot, context, { filename: 'src/boot.js' });
  const start = () => docListeners.DOMContentLoaded.forEach(fn => fn());
  const snapshot = () => JSON.parse(JSON.stringify(window.FloatBoot.snapshot()));
  const until = async predicate => {
    const deadline = performance.now() + 5000;
    while (!predicate()) {
      if (performance.now() > deadline) throw new Error('Timed out: ' + JSON.stringify(snapshot()));
      await new Promise(resolve => setImmediate(resolve));
    }
  };
  return { window, context, elements, frames, frameStages, executions, start, snapshot, until, docListeners,
    get frame() { return frame; }, get reloads() { return reloads; } };
}

test('Python packer is deterministic, round-trippable, HTML-safe, and never writes index', () => {
  const before = fs.existsSync(path.join(root, 'index.html')) ? fs.statSync(path.join(root, 'index.html')).mtimeMs : null;
  // Import helpers only: DO NOT call build.main or regenerate the project HTML.
  // Synthetic sources live solely in an automatically cleaned temporary folder.
  const result = spawnSync('python3', ['-B', '-c', `
import importlib.util,json,pathlib,tempfile
spec=importlib.util.spec_from_file_location('float_build','build.py')
b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
with tempfile.TemporaryDirectory(prefix='float-pack-test-') as folder:
 r=pathlib.Path(folder);(r/'vendor').mkdir();(r/'src').mkdir()
 (r/'vendor/three.module.js').write_text('const ThreeValue=7; export { ThreeValue as Value };')
 (r/'vendor/OrbitControls.js').write_text("import { Value } from 'three'; const OrbitControls=Value; export { OrbitControls };")
 for name in b.APP_MODULES: (r/'src'/name).write_text('/* '+name+' 中文 </script> */')
 for name in ('shell.html','boot.js'): (r/'src'/name).write_text((pathlib.Path('src')/name).read_text())
 m=b.make_manifest(r); assert m==b.make_manifest(r)
 html=b.render_html(r); assert not (r/'index.html').exists()
 print(json.dumps({'manifest':m,'html':html}))
`], { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr);
  const { manifest, html } = JSON.parse(result.stdout);
  assert.equal(manifest.modules.at(-1).name, 'src/app.js');
  const names = manifest.modules.map(m => m.name);
  assert.deepEqual(names.slice(0, 2), ['vendor/three.module.js', 'vendor/OrbitControls.js']);
  assert.deepEqual(names.slice(names.indexOf('src/fish-collision.js') + 1,
    names.indexOf('src/fish-collision.js') + 3), ['src/terrain-cache.js', 'src/tank-floor.js']);
  for (const module of manifest.modules) {
    const decoded = zlib.gunzipSync(Buffer.from(module.data, 'base64'));
    assert.equal(decoded.length, module.sourceBytes);
    assert.equal(Buffer.from(module.data, 'base64').length, module.compressedBytes);
    if (module.name.startsWith('src/')) assert.ok(decoded.toString().includes('中文 </script>'));
  }
  const match = html.match(/<script id="floatModules" type="application\/json">([\s\S]*?)<\/script>/);
  assert.ok(match); assert.deepEqual(JSON.parse(match[1]), manifest);
  assert.ok(html.includes('window.THREE') === false, 'classic engine source is only compressed');
  assert.doesNotMatch(html, /\/\*__(?:BOOT|MODULES|APP|THREE|ORBIT)__\*\//);
  assert.doesNotMatch(html, /<(?:script|link|img)\b[^>]*(?:src|href)=["']https?:/i);
  assert.equal(before, fs.existsSync(path.join(root, 'index.html')) ? fs.statSync(path.join(root, 'index.html')).mtimeMs : null);
});

test('shell puts lightweight accessible loader first, locks app, and has only local inline resources', () => {
  assert.ok(shell.indexOf('id="loading"') < shell.indexOf('id="floatApp"'));
  assert.match(shell, /id="floatApp" aria-busy="true" inert/);
  assert.match(shell, /<progress id="loadingProgress"/);
  assert.match(shell, /aria-live="polite"/);
  assert.match(shell, /id="loadingRetry"[^>]*hidden/);
  assert.match(shell, /<noscript>/);
  assert.doesNotMatch(shell, /<(?:script|link)\b[^>]*(?:src|href)=/i);
  assert.doesNotMatch(boot, /\b(?:fetch|importScripts)\s*\(|\bnew\s+(?:Worker|XMLHttpRequest|WebSocket)\b/);
});

test('boot decompresses/executes sequentially, preserves classic globals, waits readiness and paint turns', async () => {
  let resolveReady;
  const ready = new Promise(resolve => { resolveReady = resolve; });
  const f = fixture([
    packed('vendor/first.js', 'const sharedValue = 37; window.order = ["first"];'),
    packed('src/second.js', 'window.order.push(sharedValue);'),
    appModule('window.order.push("app"); window.__FLOAT_APP_READY__ = ready;'),
  ], { globals: { ready } });
  f.start();
  await f.until(() => f.window.order?.at(-1) === 'app');
  assert.deepEqual(Array.from(f.window.order), ['first', 37, 'app']);
  assert.equal(f.snapshot().state, 'loading');
  assert.equal(f.elements.loading.hidden, false);
  assert.ok('inert' in f.elements.floatApp.attrs);
  assert.equal(f.snapshot().completedUnits, 6);
  const readyFrame = f.frame;
  resolveReady();
  await f.until(() => f.snapshot().state === 'ready');
  assert.ok(f.frame >= readyFrame + 2);
  assert.equal(f.elements.loading.hidden, true);
  assert.equal(f.elements.floatApp.attrs['aria-busy'], 'false');
  assert.ok(!('inert' in f.elements.floatApp.attrs));
  const snapshot = f.snapshot();
  assert.equal(snapshot.completedUnits, snapshot.totalUnits);
  const names = snapshot.events.map(e => e.name);
  assert.ok(names.indexOf('app:ready') < names.indexOf('frame:opportunity'));
  assert.ok(names.indexOf('frame:opportunity') < names.indexOf('boot:finish'));
  assert.ok(snapshot.events.every(e => Number.isFinite(e.elapsedMs) && e.elapsedMs >= 0));
  snapshot.events[0].name = 'tampered';
  assert.equal(f.snapshot().events[0].name, 'boot:start');
});

test('async app stage completes before readiness and boot-owned finish', async () => {
  const f = fixture([appModule(`window.__FLOAT_APP_READY__ = (async function () {
    await window.FloatBoot.stage('建立真实场景');
    window.firstSceneRendered = true;
    window.FloatBoot.mark('scene:first-render');
  })();`)]);
  f.start();
  await f.until(() => f.snapshot().stage === '建立真实场景');
  assert.equal(f.window.firstSceneRendered, undefined);
  assert.equal(f.elements.loading.hidden, false);
  await f.until(() => f.snapshot().state === 'ready');
  const names = f.snapshot().events.map(event => event.name);
  assert.ok(names.indexOf('stage:建立真实场景') < names.indexOf('scene:first-render'));
  assert.ok(names.indexOf('scene:first-render') < names.indexOf('app:ready'));
  assert.ok(names.indexOf('app:ready') < names.indexOf('boot:finish'));
});

test('stage records real labels and yields twice, even outside startup', async () => {
  const f = fixture([appModule()]);
  const frame = f.frame;
  const promise = f.window.FloatBoot.stage('真实阶段 · 创建场景');
  assert.equal(f.snapshot().stage, '真实阶段 · 创建场景');
  assert.equal(f.frame, frame);
  await promise;
  assert.equal(f.frame, frame + 2);
  const mark = f.window.FloatBoot.mark('custom:checkpoint');
  assert.equal(mark.name, 'custom:checkpoint');
  mark.name = 'mutated';
  assert.equal(f.snapshot().events.at(-1).name, 'custom:checkpoint');
});

test('explicit paint:false records stage immediately without scheduling a frame', async () => {
  const f = fixture([appModule()], { now: () => 0 });
  await f.window.FloatBoot.stage('合批中的真实步骤', { paint: false });
  assert.equal(f.frame, 0);
  assert.equal(f.snapshot().stage, '合批中的真实步骤');
  assert.equal(f.snapshot().events.at(-1).name, 'stage:合批中的真实步骤');
  assert.equal(f.snapshot().paintOpportunities, 0);
});

test('cheap modules batch with only mandatory start/end opportunities and retain every real stage', async () => {
  const f = fixture([
    packed('src/a.js', 'window.a = 1;'), packed('src/b.js', 'window.b = 2;'), appModule(),
  ], { now: () => 0 });
  f.start(); await f.until(() => f.snapshot().state === 'ready');
  assert.equal(f.frame, 4, 'two rAF at start and two after readiness, not per module');
  assert.deepEqual(f.executions.map(item => item.frame), [2, 2, 2]);
  assert.equal(f.snapshot().paintOpportunities, 2);
  const stages = f.snapshot().events.filter(event => event.name.startsWith('stage:'));
  assert.equal(stages.filter(event => event.name.startsWith('stage:解压 ')).length, 3);
  assert.equal(stages.filter(event => event.name.startsWith('stage:执行 ')).length, 3);
  assert.equal(f.snapshot().completedUnits, 8);
});

test('sourceBytes >= 200000 forces a paint before both decode and execute', async () => {
  const source = 'window.largeLoaded = true;'.padEnd(200000, ' ');
  const f = fixture([packed('src/large.js', source), appModule()], { now: () => 0 });
  f.start(); await f.until(() => f.snapshot().state === 'ready');
  assert.equal(f.frame, 8);
  assert.equal(f.executions[0].frame, 6);
  assert.equal(f.frameStages.filter(stage => stage === '解压 1/2 · src/large.js').length, 2);
  assert.equal(f.frameStages.filter(stage => stage === '执行 1/2 · src/large.js').length, 2);
  assert.equal(f.snapshot().largeModuleBytes, 200000);
});

test('a small module exceeding the 8ms target yields before the next boundary, not during synchronous execution', async () => {
  let clock = 0;
  const f = fixture([
    packed('src/costly-small.js', 'advanceClock(8);'), appModule(),
  ], { now: () => clock, globals: { advanceClock: delta => { clock += delta; } } });
  f.start(); await f.until(() => f.snapshot().state === 'ready');
  assert.deepEqual(f.executions.map(item => item.frame), [2, 4]);
  assert.equal(f.frame, 6);
  assert.equal(f.frameStages.filter(stage => stage === '解压 2/2 · src/app.js').length, 2);
  assert.equal(f.snapshot().loaderBudgetMs, 8);
});

test('decompression elapsed budget is checked again before executing a small module', async () => {
  let clock = 0;
  class TimedResponse extends Response {
    async text() { const source = await super.text(); clock += 9; return source; }
  }
  const f = fixture([appModule()], { now: () => clock, Response: TimedResponse });
  f.start(); await f.until(() => f.snapshot().state === 'ready');
  assert.equal(f.frame, 6);
  assert.equal(f.executions[0].frame, 4);
  assert.equal(f.frameStages.filter(stage => stage === '执行 1/1 · src/app.js').length, 2);
});

test('yieldWork prefers bound scheduler.yield without rAF, channel, or timer', async () => {
  const calls = [];
  const scheduler = { yield() {
    assert.equal(this, scheduler); calls.push('scheduler');
    return new Promise(resolve => setImmediate(resolve));
  } };
  const f = fixture([appModule()], { window: { scheduler,
    MessageChannel: function () { assert.fail('channel should not be used'); },
    setTimeout() { assert.fail('timer should not be used'); } } });
  let resumed = false;
  const promise = f.window.FloatBoot.yieldWork().then(() => { resumed = true; });
  assert.equal(resumed, false);
  await promise;
  assert.deepEqual(calls, ['scheduler']);
  assert.equal(f.frame, 0); assert.equal(f.snapshot().paintOpportunities, 0);
});

test('yieldWork falls back to MessageChannel and closes both ports before resuming', async () => {
  const closed = [];
  let instance;
  class Channel {
    constructor() {
      instance = this;
      this.port1 = { onmessage: null, close() { closed.push(1); } };
      this.port2 = { postMessage() { setImmediate(() => instance.port1.onmessage()); },
        close() { closed.push(2); } };
    }
  }
  const f = fixture([appModule()], { window: { MessageChannel: Channel,
    setTimeout() { assert.fail('timer should not be used'); } } });
  const promise = f.window.FloatBoot.yieldWork();
  assert.deepEqual(closed, []);
  await promise;
  assert.deepEqual(closed, [1, 2]);
  assert.equal(instance.port1.onmessage, null);
  assert.equal(instance.port1.onmessageerror, null);
  assert.equal(f.frame, 0);
});

test('yieldWork uses asynchronous setTimeout0 when scheduler and MessageChannel are absent', async () => {
  const delays = [];
  const f = fixture([appModule()], { window: { setTimeout(fn, delay) {
    delays.push(delay); setImmediate(fn);
  } } });
  let resumed = false;
  const promise = f.window.FloatBoot.yieldWork().then(() => { resumed = true; });
  assert.equal(resumed, false);
  await promise;
  assert.deepEqual(delays, [0]); assert.equal(f.frame, 0);
});

for (const mode of ['post-throws', 'message-error', 'constructor-throws']) {
  test('yieldWork closes channel and uses timer on ' + mode, async () => {
    const closed = [], delays = [];
    class Channel {
      constructor() {
        if (mode === 'constructor-throws') throw new Error('channel unavailable');
        const channel = this;
        this.port1 = { close() { closed.push(1); } };
        this.port2 = { close() { closed.push(2); }, postMessage() {
          if (mode === 'post-throws') throw new Error('post failed');
          setImmediate(() => channel.port1.onmessageerror());
        } };
      }
    }
    const f = fixture([appModule()], { window: { MessageChannel: Channel,
      setTimeout(fn, delay) { delays.push(delay); setImmediate(fn); } } });
    await f.window.FloatBoot.yieldWork();
    assert.deepEqual(closed, mode === 'constructor-throws' ? [] : [1, 2]);
    assert.deepEqual(delays, [0]); assert.equal(f.frame, 0);
  });
}

test('yieldWork propagates scheduler rejection rather than hiding initialization errors', async () => {
  const f = fixture([appModule()], { window: { scheduler: {
    yield() { return Promise.reject(new Error('scheduler failed')); },
  } } });
  await assert.rejects(f.window.FloatBoot.yieldWork(), /scheduler failed/);
});

test('missing gzip API reports actionable offline failure and reload retry without enabling app', async () => {
  const f = fixture([appModule()], { noGzip: true }); f.start();
  await f.until(() => f.snapshot().state === 'error');
  assert.match(f.elements.loadingDetail.textContent, /DecompressionStream/);
  assert.equal(f.elements.loadingRetry.hidden, false);
  assert.equal(f.elements.loadingProgress.hidden, true);
  assert.equal(f.elements.loading.hidden, false);
  assert.ok('inert' in f.elements.floatApp.attrs);
  f.elements.loadingRetry.handlers.click(); assert.equal(f.reloads, 1);
});

for (const [name, modules, pattern] of [
  ['bad gzip', [{ ...appModule(), data: Buffer.from('not gzip').toString('base64'), compressedBytes: 8 }], /gzip|header|compression/i],
  ['runtime exception', [appModule('throw new Error("module exploded")')], /module exploded/],
  ['syntax exception', [appModule('const = broken;')], /Unexpected|token/],
  ['missing readiness contract', [appModule('window.noReadiness = true;')], /__FLOAT_APP_READY__/],
  ['readiness rejection', [appModule('window.__FLOAT_APP_READY__ = Promise.reject(new Error("ready failed"));')], /ready failed/],
  ['app is not last', [appModule(), packed('src/late.js', '')], /app.js/],
  ['duplicate app', [appModule(), appModule()], /app.js/],
]) {
  test(name + ' stays covered and never finishes', async () => {
    const f = fixture(modules); f.start();
    await f.until(() => f.snapshot().state === 'error');
    assert.match(f.snapshot().error, pattern);
    assert.equal(f.elements.loading.hidden, false);
    assert.ok(!f.snapshot().events.some(e => e.name === 'boot:finish'));
  });
}

test('missing rAF uses explicit timer degradation; inert fallback captures focus and interaction', async () => {
  const f = fixture([appModule()], { noRaf: true });
  f.start();
  let prevented = 0, stopped = 0;
  const event = { target: f.elements.floatApp, type: 'focusin',
    preventDefault() { prevented++; }, stopImmediatePropagation() { stopped++; } };
  f.docListeners.focusin[0](event);
  assert.equal(prevented, 1); assert.equal(stopped, 1);
  assert.equal(f.elements.loading.focused, true);
  await f.until(() => f.snapshot().state === 'ready');
  assert.equal(f.snapshot().scheduling, 'double-timer-no-paint-guarantee');
  f.docListeners.focusin[0](event); assert.equal(prevented, 1);
});
