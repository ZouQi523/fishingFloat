/* FloatBoot contract: app.js is last and assigns window.__FLOAT_APP_READY__ to
 * its initialization Promise, resolving only after its first scene render.
 * await FloatBoot.stage(label) updates real stage text and yields TWO rAFs:
 * a paint opportunity between callbacks, not proof of a displayed GPU frame.
 * Loader-only stage(label, {paint:false}) still updates/records the stage.
 * Loader boundaries yield after >=8ms since the last opportunity, or before
 * decoding/executing >=200000 source bytes. A single synchronous operation
 * cannot be preempted: 8ms is a scheduling target, never a task-time guarantee.
 * yieldWork() yields a main-thread task via scheduler.yield, MessageChannel,
 * or setTimeout(0). It gives the browser scheduling/rendering opportunities,
 * NOT a confirmed paint and NOT a forced two-frame delay.
 * mark(name)/snapshot() expose observations, never estimated time/progress.
 * Required: ES2017, Promise, atob, Uint8Array, Blob.stream, Response.text,
 * DecompressionStream('gzip'); vendored Three r170 additionally needs WebGL2.
 * Missing gzip APIs => readable offline error/reload, no network polyfills.
 * Missing rAF => two timer turns (explicitly reported, no paint guarantee).
 * Missing inert => pointer/keyboard/focus capture keeps the app unavailable.
 */
(function () {
  'use strict';
  var doc = document;
  var started = window.performance && typeof window.performance.now === 'function'
    ? function () { return window.performance.now(); } : function () { return Date.now(); };
  var origin = started();
  var lastPaintOpportunity = origin, paintOpportunities = 0;
  var loaderBudgetMs = 8, largeModuleBytes = 200000;
  var events = [], state = 'loading', currentStage = '准备离线观察室';
  var completed = 0, total = 0, failure = null, activeModule = '';
  var app, overlay, label, detail, progress, retry;
  var raf = typeof window.requestAnimationFrame === 'function';

  function mark(name) {
    var item = { name: String(name), elapsedMs: Math.max(0, started() - origin) };
    events.push(item);
    return { name: item.name, elapsedMs: item.elapsedMs };
  }
  function snapshot() {
    return { state: state, stage: currentStage, completedUnits: completed, totalUnits: total,
      activeModule: activeModule, scheduling: raf ? 'double-requestAnimationFrame' : 'double-timer-no-paint-guarantee',
      error: failure ? failure.message : null,
      loaderBudgetMs: loaderBudgetMs, largeModuleBytes: largeModuleBytes,
      paintOpportunities: paintOpportunities,
      events: events.map(function (item) { return { name: item.name, elapsedMs: item.elapsedMs }; }) };
  }
  function turn() {
    return new Promise(function (resolve) {
      if (raf) window.requestAnimationFrame(function () { resolve(); });
      else window.setTimeout(resolve, 0);
    });
  }
  async function paintOpportunity() {
    await turn(); await turn();
    lastPaintOpportunity = started();
    paintOpportunities++;
  }
  async function yieldWork() {
    if (failure) throw failure;
    if (window.scheduler && typeof window.scheduler.yield === 'function') {
      await window.scheduler.yield();
    } else {
      await new Promise(function (resolve) {
        var channel;
        function close() {
          if (!channel) return;
          channel.port1.onmessage = null;
          channel.port1.onmessageerror = null;
          channel.port1.close(); channel.port2.close();
        }
        if (typeof window.MessageChannel === 'function') {
          try {
            channel = new window.MessageChannel();
            channel.port1.onmessage = function () { close(); resolve(); };
            channel.port1.onmessageerror = function () {
              close(); window.setTimeout(resolve, 0);
            };
            channel.port2.postMessage(null);
            return;
          } catch (error) { close(); }
        }
        window.setTimeout(resolve, 0);
      });
    }
    if (failure) throw failure;
  }
  function update() {
    if (!label) return;
    label.textContent = currentStage;
    detail.textContent = total
      ? '已完成 ' + completed + ' / ' + total + ' 个实际步骤 · 解压 / 执行 / 场景就绪 / 绘制机会（非耗时百分比）'
      : '所有资源均在此 HTML 内 · 无需联网';
    if (total) { progress.max = total; progress.value = completed; progress.hidden = false; }
  }
  async function stage(text, options) {
    if (failure) throw failure;
    currentStage = String(text);
    mark('stage:' + currentStage);
    update();
    // Public stage(label) always yields. Only explicit loader batching opts out.
    if (!options || options.paint !== false) await paintOpportunity();
    if (failure) throw failure;
  }
  function loaderStage(text, module) {
    return stage(text, { paint: module.sourceBytes >= largeModuleBytes
      || started() - lastPaintOpportunity >= loaderBudgetMs });
  }
  function fail(error) {
    if (state === 'ready' || failure) return;
    failure = error instanceof Error ? error : new Error(String(error));
    state = 'error';
    mark('boot:error');
    currentStage = '观察室未能启动';
    update();
    if (detail) detail.textContent = (activeModule ? activeModule + '：' : '') + failure.message
      + '。请使用支持 gzip DecompressionStream 的现代浏览器；可离线重新打开或重试。';
    if (progress) progress.hidden = true;
    if (retry) retry.hidden = false;
    if (overlay) overlay.setAttribute('role', 'alert');
  }
  function blockInteraction(event) {
    if (state !== 'ready' && app && app.contains(event.target)) {
      event.preventDefault(); event.stopImmediatePropagation();
      if (event.type === 'focusin' && overlay) overlay.focus();
    }
  }
  window.FloatBoot = Object.freeze({ stage: stage, yieldWork: yieldWork, mark: mark, snapshot: snapshot });
  mark('boot:start');
  window.addEventListener('error', function (event) {
    if (state === 'loading') fail(event.error || new Error(event.message || '脚本执行失败'));
  });
  window.addEventListener('unhandledrejection', function (event) {
    if (state === 'loading') fail(event.reason || new Error('异步初始化失败'));
  });
  ['click', 'pointerdown', 'keydown', 'focusin'].forEach(function (type) {
    doc.addEventListener(type, blockInteraction, true);
  });

  async function decompress(module) {
    if (module.encoding !== 'gzip-base64') throw new Error('不支持的内嵌模块编码');
    var binary = window.atob(module.data);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    if (bytes.length !== module.compressedBytes) throw new Error('压缩模块长度不匹配');
    try {
      var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
      return await new Response(stream).text();
    } catch (error) {
      throw new Error('gzip 解压失败：模块损坏或浏览器不支持此格式'
        + (error && error.message ? '（' + error.message + '）' : ''));
    }
  }
  function execute(source, name) {
    var script = doc.createElement('script');
    // DOM textContent, not HTML parsing: literal </script> is safe here.
    script.textContent = source + '\n//# sourceURL=float-inline/' + name + '\n';
    try { doc.body.appendChild(script); } finally { script.remove(); }
    // Inline classic syntax/runtime exceptions arrive via window.error.
    if (failure) throw failure;
  }
  async function start() {
    app = doc.getElementById('floatApp');
    overlay = doc.getElementById('loading');
    label = doc.getElementById('loadingStage');
    detail = doc.getElementById('loadingDetail');
    progress = doc.getElementById('loadingProgress');
    retry = doc.getElementById('loadingRetry');
    retry.addEventListener('click', function () { window.location.reload(); });
    try {
      await stage('正在读取离线模块清单');
      if (typeof DecompressionStream !== 'function' || typeof Blob !== 'function'
          || !Blob.prototype.stream || typeof Response !== 'function' || !Response.prototype.text
          || typeof window.atob !== 'function') {
        throw new Error('当前浏览器缺少离线 gzip 解压 API：DecompressionStream / Blob.stream / Response.text / atob');
      }
      var manifest = JSON.parse(doc.getElementById('floatModules').textContent);
      if (manifest.version !== 1 || !Array.isArray(manifest.modules) || !manifest.modules.length
          || manifest.modules[manifest.modules.length - 1].name !== 'src/app.js'
          || manifest.modules.filter(function (module) { return module.name === 'src/app.js'; }).length !== 1) {
        throw new Error('内嵌模块清单无效：app.js 必须且只能在最后');
      }
      total = manifest.modules.length * 2 + 2;
      mark('manifest:ready');
      for (var i = 0; i < manifest.modules.length; i++) {
        var module = manifest.modules[i];
        activeModule = module.name;
        await loaderStage('解压 ' + (i + 1) + '/' + manifest.modules.length + ' · ' + module.name, module);
        var source = await decompress(module);
        completed++; mark('decompressed:' + module.name);
        await loaderStage('执行 ' + (i + 1) + '/' + manifest.modules.length + ' · ' + module.name, module);
        execute(source, module.name);
        completed++; mark('executed:' + module.name);
      }
      activeModule = '';
      // Attach the readiness handler BEFORE the next yield: a fast rejection is
      // handled immediately, not accidentally classified as unhandled.
      var ready = window.__FLOAT_APP_READY__;
      if (!ready || typeof ready.then !== 'function') throw new Error('应用未提供 __FLOAT_APP_READY__ Promise');
      await ready;
      if (failure) throw failure;
      completed++; mark('app:ready');
      await stage('场景已就绪 · 等待首帧绘制机会');
      completed++; mark('frame:opportunity');
      // Only boot owns completion. No app callback may reveal a partial scene.
      state = 'ready';
      currentStage = '观察室已就绪';
      update();
      app.removeAttribute('inert');
      app.setAttribute('aria-busy', 'false');
      overlay.hidden = true;
      mark('boot:finish');
    } catch (error) { fail(error); }
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
