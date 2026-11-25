/* Standalone fish laboratory UI. No application/renderer dependencies. */
(function (root) {
  'use strict';
  const BEHAVIORS = [
    ['nibble', '轻啄'], ['quick', '快吸'], ['spit', '吸入吐出'], ['lift', '含饵抬头'],
    ['sideways', '横向游走'], ['down', '含饵下潜'], ['rub', '蹭线'], ['probe', '试探']
  ];
  const CSS = `
.fish-lab{position:fixed;right:24px;bottom:86px;width:310px;max-width:calc(100vw - 24px);z-index:7;color:#e8f2f3;background:rgba(10,23,30,.95);border:1px solid #38525c;border-radius:12px;box-shadow:0 8px 30px #0005;font:11px/1.55 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;box-sizing:border-box;isolation:isolate}
.fish-lab *{box-sizing:border-box}.fish-lab>summary{display:flex;align-items:center;gap:7px;list-style:none;cursor:pointer;min-height:42px;padding:11px 13px;color:#a9e6cc;user-select:none}.fish-lab>summary::-webkit-details-marker{display:none}.fish-lab>summary::after{content:'＋';margin-left:auto}.fish-lab[open]>summary::after{content:'−'}.fish-lab .fl-summary-state{margin-left:auto;color:#94aeb8;font-size:10px}.fish-lab .fl-body{padding:0 12px 13px;max-height:min(65vh,620px);overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin}.fish-lab p{margin:6px 0;color:#9fb8c0;font-size:10px}.fish-lab .fl-note{padding:7px 9px;background:#a9e6cc0c;border:1px solid #a9e6cc22;border-radius:7px}.fish-lab .fl-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:8px 0}.fish-lab .fl-check{display:flex;align-items:center;gap:6px;min-height:32px;cursor:pointer}.fish-lab input[type=checkbox]{width:16px;height:16px;accent-color:#a9e6cc}.fish-lab .fl-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px}.fish-lab button{min-height:34px;border:1px solid #38525c;border-radius:6px;background:#a9e6cc0a;color:#e8f2f3;font:inherit;padding:6px 8px;cursor:pointer}.fish-lab button:hover{background:#a9e6cc20}.fish-lab button[aria-pressed=true]{border-color:#a9e6cc;color:#a9e6cc;background:#a9e6cc15}.fish-lab button:focus-visible,.fish-lab input:focus-visible,.fish-lab select:focus-visible,.fish-lab summary:focus-visible{outline:2px solid #a9e6cc;outline-offset:2px}.fish-lab label.fl-field{display:flex;flex-direction:column;gap:3px;min-width:0;color:#94aeb8;font-size:10px}.fish-lab input[type=number],.fish-lab select{width:100%;min-height:33px;border:1px solid #38525c;border-radius:6px;color:#e8f2f3;background:#07151c;padding:5px 7px;font:11px ui-monospace,SFMono-Regular,Consolas,monospace}.fish-lab .fl-config{margin-top:10px;border-top:1px solid #38525c}.fish-lab .fl-config>summary{padding:9px 0;cursor:pointer;color:#bcd1d8}.fish-lab .fl-transport{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin:9px 0}.fish-lab .fl-speed{display:flex;align-items:center;gap:8px;color:#94aeb8}.fish-lab .fl-speed select{width:auto;flex:1}.fish-lab dl{margin:9px 0;padding:7px 9px;background:#0002;border-radius:7px}.fish-lab .fl-reading{display:flex;justify-content:space-between;gap:8px;margin:3px 0;font-size:10px}.fish-lab dt{color:#94aeb8;flex-shrink:0}.fish-lab dd{margin:0;text-align:right;font:10px/1.65 ui-monospace,SFMono-Regular,Consolas,monospace;overflow-wrap:anywhere}.fish-lab canvas{display:block;width:100%;height:126px;border:1px solid #38525c;border-radius:6px;background:#06131a}.fish-lab .fl-chart-caption{display:flex;justify-content:space-between;gap:8px;font-size:9px;color:#94aeb8;margin:5px 0}.fish-lab .fl-status{min-height:15px;color:#eac29a;overflow-wrap:anywhere}.fish-lab .fl-events{font-size:9px;color:#94aeb8;max-height:54px;overflow:auto;margin-top:5px}
@media(max-width:620px){.fish-lab{top:max(68px,calc(env(safe-area-inset-top) + 56px));right:12px;bottom:auto;width:112px;border-radius:9px}.fish-lab>summary{padding:8px 10px;min-height:37px;font-size:10px}.fish-lab .fl-summary-state{display:none}.fish-lab[open]{width:min(310px,calc(100vw - 24px));max-height:55vh;max-height:55dvh;display:flex;flex-direction:column}.fish-lab[open]>summary{flex:0 0 auto}.fish-lab .fl-body{min-height:0;max-height:calc(55vh - 39px);max-height:calc(55dvh - 39px);overflow-y:auto}.fish-lab button{min-height:36px}}
`;
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const first = (...values) => values.find(value => value !== undefined && value !== null);
  const number = (value, digits = 3) => finite(value) ? value.toFixed(digits) : '—';
  const vector = value => Array.isArray(value) ? value : value && typeof value === 'object' ? [value.x, value.y, value.z] : [];
  const magnitude = value => {
    if (finite(value)) return Math.abs(value);
    const a = vector(value);
    return a.length === 3 && a.every(finite) ? Math.hypot(...a) : undefined;
  };
  function create(options = {}) {
    const doc = root.document;
    const host = options.host && typeof options.host.appendChild === 'function' ? options.host : doc.body;
    let disposed = false, last = {}, frame = 0, lastPoll = -Infinity, localHistory = [], localEvents = [], lastBehavior;
    let context = null, resizeObserver = null, error = '', paused = false, enabled = false;
    const cleanups = [], fields = {}, fieldLabels = {}, readings = {}, behaviorButtons = new Map();
    const defaults = { speed: .08, duration: 1.5, force: .012, jitter: .01, seed: 1, hook: 0, autonomous: false, direction: { x: 0, y: -1, z: 0 } };
    const settings = { ...defaults, direction: { ...defaults.direction } };
    const make = (tag, parent, className, text, id) => {
      const node = doc.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = text;
      if (id) node.id = id;
      if (parent) parent.appendChild(node);
      return node;
    };
    const listen = (target, type, fn) => { target.addEventListener(type, fn); cleanups.push(() => target.removeEventListener(type, fn)); };
    const style = make('style', doc.head || host);
    style.textContent = CSS;
    const panel = make('details', host, 'fish-lab', undefined, 'fishPanel');
    panel.setAttribute('aria-label', '鱼行为实验室');
    const summary = make('summary', panel, '', undefined, 'fishPanelToggle');
    make('span', summary, '', '鱼行为实验');
    const summaryState = make('span', summary, 'fl-summary-state', '物理关闭');
    const body = make('div', panel, 'fl-body', undefined, 'fishPanelBody');
    make('p', body, 'fl-note', '默认关闭鱼的物理作用。点击实验会自动开启鱼；鱼通过线组受力影响漂相。曲线记录最近 10 秒模拟时间。');
    const invoke = (name, ...args) => {
      if (typeof options[name] !== 'function') { error = `未连接 ${name} 接口`; showError(); return; }
      try {
        const result = options[name](...args);
        error = '';
        if (result && typeof result.then === 'function') result.then(() => { if (!disposed) poll(); }).catch(e => { if (!disposed) { error = e && e.message || '操作失败'; showError(); } });
        else poll();
        showError();
        return result;
      } catch (e) { error = e && e.message || '操作失败'; showError(); }
    };
    const row = make('div', body, 'fl-row');
    const checkbox = (parent, id, label, change) => {
      const wrap = make('label', parent, 'fl-check');
      const input = make('input', wrap, '', undefined, id); input.type = 'checkbox';
      make('span', wrap, '', label); listen(input, 'change', () => change(input.checked)); return input;
    };
    const enableInput = checkbox(row, 'fishEnabled', '开启鱼物理作用', value => {
      enabled = value; invoke('setEnabled', value); paintState();
    });
    const autonomousInput = checkbox(row, 'fishAutonomous', '自主行为', value => {
      settings.autonomous = value; invoke('configure', { autonomous: value });
    });
    const experimentGrid = make('div', body, 'fl-grid', undefined, 'fishExperiments');
    BEHAVIORS.forEach(([id, label]) => {
      const button = make('button', experimentGrid, '', label, `fishBehavior-${id}`);
      button.type = 'button'; button.dataset.behavior = id; button.setAttribute('aria-pressed', 'false');
      listen(button, 'click', () => {
        // Numeric changes are already applied to their selected profile. Never
        // flatten a state's merged values back into the global configuration.
        invoke('trigger', id);
        const time = simulationTime(last);
        if (finite(time)) localEvents.push({ time, label });
        localEvents = localEvents.slice(-160);
        if (panel.open) draw();
      });
      behaviorButtons.set(id, button);
    });
    const config = make('details', body, 'fl-config');
    make('summary', config, '', '行为参数 · SI 单位');
    make('p', config, '', '统一参数为所有状态的基准；单态显示基准与覆盖合并值。方向为世界坐标 x / y / z，y 向上。自主行为、种子和钩号始终全局。');
    const profileWrap = make('label', config, 'fl-field');
    make('span', profileWrap, '', '调整范围');
    const profileSelect = make('select', profileWrap, '', undefined, 'fishParam-profile');
    [['global', '统一参数'], ['cruise', '巡游'], ['discover', '发现鱼饵'], ['approach', '接近'],
      ['inspect', '观察试探'], ['suck', '吸饵'], ['spit', '吐饵'], ['lift', '含饵抬头'],
      ['swim', '含饵游动'], ['rub', '蹭线'], ['flee', '逃离']].forEach(([id, label]) => {
      const option = make('option', profileSelect, '', label); option.value = id;
    });
    profileSelect.value = 'global';
    const clearProfile = make('button', config, '', '清除该状态覆盖', 'fishParam-clearProfile');
    clearProfile.type = 'button'; clearProfile.disabled = true;
    listen(profileSelect, 'change', () => { clearProfile.disabled = profileSelect.value === 'global'; update(last); });
    listen(clearProfile, 'click', () => {
      if (profileSelect.value !== 'global') invoke('configure', { behaviors: { [profileSelect.value]: null } });
    });
    const form = make('div', config, 'fl-grid');
    function numeric(name, label, value, min, max, step) {
      const wrap = make('label', form, 'fl-field'); fieldLabels[name] = make('span', wrap, '', label);
      const input = make('input', wrap, '', undefined, `fishParam-${name}`);
      input.type = 'number'; input.value = String(value); input.step = String(step);
      if (min !== null) input.min = String(min);
      if (max !== null) input.max = String(max);
      fields[name] = input;
      listen(input, 'change', () => {
        let next = Number(input.value);
        if (input.value.trim() === '' || !Number.isFinite(next)) { input.value = String(value); return; }
        next = Math.max(min === null ? -Infinity : min, Math.min(max === null ? Infinity : max, next));
        if (name === 'seed' || name === 'hook') next = Math.trunc(next);
        input.value = String(next);
        if (name[0] === 'd' && ['dx', 'dy', 'dz'].includes(name)) settings.direction[name[1]] = next;
        else settings[name] = next;
        invoke('configure', name === 'seed' || name === 'hook' ? { [name]: next } : configurationPatch());
      });
    }
    numeric('speed', '嘴部速度 m/s', defaults.speed, .002, .5, .002);
    numeric('duration', '持续时间 s', defaults.duration, .1, 12, .1);
    numeric('force', '基础作用力 N', defaults.force, 0, .05, .001);
    numeric('jitter', '扰动 m/s', defaults.jitter, 0, .08, .001);
    numeric('dx', '方向 x', 0, -100, 100, .1);
    numeric('dy', '方向 y', -1, -100, 100, .1);
    numeric('dz', '方向 z', 0, -100, 100, .1);
    numeric('seed', '随机种子（整数）', defaults.seed, 0, 4294967295, 1);
    numeric('hook', '目标钩 0 / 1', defaults.hook, 0, 1, 1);
    make('p', config, '', '单态覆盖优先；快吸 ×2.3 / 轻啄 ×0.45 对统一基础力带倍率，总上限 0.05 N。单态力为精确上限。');
    const rigField = make('label', config, 'fl-field');
    make('span', rigField, '', '钩重 每枚 g');
    const hookMassInput = make('input', rigField, '', undefined, 'fishRig-hookMassG');
    hookMassInput.type = 'number'; hookMassInput.min = '0'; hookMassInput.max = '0.3'; hookMassInput.step = '0.005'; hookMassInput.value = '0.025';
    listen(hookMassInput, 'change', () => {
      const value = Number(hookMassInput.value);
      if (!hookMassInput.value.trim() || !Number.isFinite(value)) { hookMassInput.value = String(first(last.rig && last.rig.options && last.rig.options.hookMassG, .025)); return; }
      const hookMassG = Math.max(0, Math.min(.3, value));
      hookMassInput.value = String(hookMassG);
      invoke('configureRig', { hookMassG });
    });
    make('p', config, '', '改重后点重置，保持同种子重跑。');
    const transport = make('div', body, 'fl-transport');
    const pauseButton = make('button', transport, '', '暂停', 'fishPause'); pauseButton.type = 'button';
    const stepButton = make('button', transport, '', '单步', 'fishStep'); stepButton.type = 'button';
    stepButton.title = '暂停并推进 1/240 秒模拟时间';
    const resetButton = make('button', transport, '', '重置', 'fishReset'); resetButton.type = 'button';
    listen(pauseButton, 'click', () => { paused = !paused; invoke('pause', paused); paintState(); });
    listen(stepButton, 'click', () => { paused = true; invoke('pause', true); invoke('step'); paintState(); poll(); });
    listen(resetButton, 'click', () => { localHistory = []; localEvents = []; lastBehavior = undefined; invoke('reset'); poll(); });
    const speedWrap = make('label', body, 'fl-speed'); make('span', speedWrap, '', '时间倍率');
    const speedSelect = make('select', speedWrap, '', undefined, 'fishTimeScale');
    [[1, '1× 正常'], [.25, '0.25× 慢动作'], [.1, '0.1× 慢动作']].forEach(([value, label]) => {
      const option = make('option', speedSelect, '', label); option.value = String(value);
    });
    listen(speedSelect, 'change', () => invoke('setSpeed', Number(speedSelect.value)));
    const dl = make('dl', body, '', undefined, 'fishTelemetry');
    [['marks', '露目 / 目'], ['velocity', '漂 vY / m·s⁻¹'], ['mouth', '鱼嘴 xyz / m'], ['behavior', '当前行为'],
      ['capture', '吸饵 / 捕获状态'], ['force', '实际鱼作用力 / N'], ['main', '主线 上 / 下 N'], ['leaders', '双子线 / N'], ['contact', '双钩触底 0 / 1'],
      ['balance', '浮力 / 重量 / 底支撑 N']].forEach(([key, label]) => {
      const item = make('div', dl, 'fl-reading'); make('dt', item, '', label);
      readings[key] = make('dd', item, '', '—', `fishRead-${key}`);
    });
    const caption = make('div', body, 'fl-chart-caption');
    make('span', caption, '', '露目 · 最近 10 s · 自动量程');
    const clock = make('span', caption, '', 't = — s', 'fishClock');
    const canvas = make('canvas', body, '', undefined, 'fishHistory');
    canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', '最近十秒模拟时间的露目曲线，竖线表示鱼行为事件');
    try { context = canvas.getContext('2d'); } catch (_) { /* Canvas is optional for headless DOM hosts. */ }
    const eventText = make('div', body, 'fl-events', '', 'fishEvents');
    const status = make('p', body, 'fl-status', '', 'fishPanelStatus'); status.setAttribute('role', 'status');
    const credits=make('details',body,'fl-config',undefined,'fishModelCredits');
    make('summary',credits,'','实物扫描模型 · 来源与许可');
    make('p',credits,'','银鲫 Carassius auratus langsdorfii；作者 ffish.asia / floraZia.com。模型经清理、18cm缩放、减面、原摄影纹理烘焙、口缘锚定及离线转换。保留原下载版本 CC BY 4.0 署名许可；不是 Tripo 生成。');
    const creditLinks=make('p',credits);
    for(const [label,href] of [['原模型','https://sketchfab.com/3d-models/crucian-carp-carassius-auratus-langsdorfii-ccd3144068d34cd9b15f3c38d2fb790b'],['作者','https://sketchfab.com/ffishAsia-and-floraZia'],['CC BY 4.0','https://creativecommons.org/licenses/by/4.0/']]){
      const link=make('a',creditLinks,'',label+' ');link.href=href;link.target='_blank';link.rel='noopener noreferrer';link.style.color='#a9e6cc';
    }
    function showError() { status.textContent = error; }
    function parameterSnapshot() { return { ...settings, direction: { ...settings.direction } }; }
    function configurationPatch() {
      const { speed, duration, force, jitter, seed, hook } = settings;
      const parameters = { speed, duration, force, direction: { ...settings.direction }, jitter };
      return profileSelect.value === 'global' ? { ...parameters, seed, hook }
        : { behaviors: { [profileSelect.value]: parameters }, seed, hook };
    }
    function simulationTime(state) { return first(state.time, state.rig && state.rig.time, state.fish && state.fish.time); }
    function normalized(state) {
      const rig = state.rig || {}, evaluation = rig.evaluation || state.evaluation || {}, fish = state.fish || {};
      const tensions = evaluation.tension || rig.tension || {};
      return {
        time: simulationTime(state), fish, rig, evaluation,
        marks: first(state.marks, state.exposedMarks, rig.marks, rig.exposedMarks, rig.exposureMarks, evaluation.marks),
        velocity: first(rig.velocityY, state.velocityY, rig.float && rig.float.velocityY),
        behavior: first(fish.behavior, fish.state, state.behavior),
        force: magnitude(first(rig.lastInteraction && rig.lastInteraction.total, fish.appliedForce, fish.forceN, state.appliedForce)),
        main: [first(tensions.upper, rig.mainTensionN, evaluation.rodTensionN), tensions.lower],
        leaders: first(tensions.leaders, rig.leaderTensionsN, []),
        hooks: first(evaluation.contacts && evaluation.contacts.hooks, rig.contacts && rig.contacts.hooks, [])
      };
    }
    function paintState() {
      enableInput.checked = enabled;
      summaryState.textContent = enabled ? '鱼物理已开启' : '物理关闭';
      pauseButton.textContent = paused ? '继续' : '暂停';
      pauseButton.setAttribute('aria-pressed', String(paused));
    }
    function update(state) {
      if (disposed) return;
      if (!state || typeof state !== 'object') state = {};
      last = state;
      const data = normalized(state), fish = data.fish;
      if (typeof state.enabled === 'boolean') enabled = state.enabled;
      else if (typeof fish.enabled === 'boolean') enabled = fish.enabled;
      if (typeof state.paused === 'boolean') paused = state.paused;
      if (finite(state.speed) && [1, .25, .1].includes(state.speed)) speedSelect.value = String(state.speed);
      if (doc.activeElement !== hookMassInput) hookMassInput.value = String(first(data.rig.options && data.rig.options.hookMassG, .025));
      fieldLabels.force.textContent = profileSelect.value === 'global' ? '基础作用力 N' : '该状态作用力上限 N';
      const globalParameters = fish.parameters || state.parameters || {};
      const override = profileSelect.value !== 'global' && fish.behaviors && fish.behaviors[profileSelect.value] || {};
      const parameters = { ...defaults, ...globalParameters, ...override,
        direction: { ...defaults.direction, ...globalParameters.direction, ...override.direction } };
      const autonomous = first(fish.autonomous, globalParameters.autonomous);
      if (typeof autonomous === 'boolean') { settings.autonomous = autonomous; autonomousInput.checked = autonomous; }
      // Do not overwrite a number while the user is typing in it.
      const configValues = { ...parameters, seed: first(state.seed, parameters.seed), hook: first(fish.hook, parameters.hook) };
      if (parameters.direction) {
        const dir = vector(parameters.direction); configValues.dx = dir[0]; configValues.dy = dir[1]; configValues.dz = dir[2];
      }
      Object.keys(fields).forEach(key => {
        if (!finite(configValues[key]) || doc.activeElement === fields[key]) return;
        fields[key].value = String(configValues[key]);
        if (['dx', 'dy', 'dz'].includes(key)) settings.direction[key[1]] = configValues[key];
        else settings[key] = configValues[key];
      });
      paintState();
      readings.marks.textContent = number(data.marks, 2);
      readings.velocity.textContent = number(data.velocity, 4);
      const mouth = vector(first(fish.mouth, fish.mouthPosition));
      readings.mouth.textContent = mouth.length ? mouth.map(v => number(v)).join(' / ') : '—';
      const label = first(fish.label, BEHAVIORS.find(item => item[0] === data.behavior)?.[1], data.behavior, '未启动');
      readings.behavior.textContent = typeof label === 'string' ? label : '—';
      readings.capture.textContent = fish.held === true ? '吸饵成功 · 持饵中' : fish.failedCapture === true ? '未捕获 · 追饵失败' : fish.held === false ? '未持饵' : '—';
      readings.force.textContent = number(enabled ? data.force : 0, 4);
      readings.main.textContent = data.main.map(v => number(v, 4)).join(' / ');
      readings.leaders.textContent = [0, 1].map(i => number(data.leaders[i], 4)).join(' / ');
      readings.contact.textContent = [0, 1].map(i => typeof data.hooks[i] === 'boolean' ? data.hooks[i] ? '是' : '否' : '—').join(' / ');
      readings.balance.textContent = [data.evaluation.buoyancyN, data.evaluation.weightN, data.evaluation.bottomSupportN].map(v => number(v, 4)).join(' / ');
      behaviorButtons.forEach((button, id) => button.setAttribute('aria-pressed', String(id === first(fish.experiment, data.behavior))));
      clock.textContent = `t = ${number(data.time, 2)} s`;
      if (finite(data.time)) {
        if (localHistory.length && data.time < localHistory[localHistory.length - 1].time) { localHistory = []; localEvents = []; lastBehavior = undefined; }
        if (finite(data.marks)) {
          const point = { time: data.time, marks: data.marks };
          if (localHistory.length && localHistory[localHistory.length - 1].time === data.time) localHistory[localHistory.length - 1] = point;
          else localHistory.push(point);
        }
        if (data.behavior && data.behavior !== lastBehavior) { localEvents.push({ time: data.time, label: String(label) }); lastBehavior = data.behavior; }
        localHistory = localHistory.filter(p => p.time >= data.time - 10).slice(-2400);
        localEvents = localEvents.filter(p => p.time >= data.time - 10).slice(-160);
      }
      const events = chartEvents();
      eventText.textContent = events.slice(-3).map(event => `${number(event.time, 2)}s ${event.label || event.behavior || '行为'}`).join(' · ');
      if (panel.open) draw();
    }
    function chartEvents() {
      const events = Array.isArray(last.events) ? last.events : [];
      // A 60 Hz history repeats behavior on every sample: mark transitions only.
      const historyEvents = []; let previous;
      if (Array.isArray(last.history)) last.history.forEach(point => {
        if (!point) return;
        if (point.event || (point.behavior && point.behavior !== previous)) {
          const id = point.event || point.behavior;
          historyEvents.push({ time: point.time, label: BEHAVIORS.find(item => item[0] === id)?.[1] || id });
        }
        previous = point.behavior;
      });
      // Authoritative app events take precedence over sampled/local fallbacks.
      const source = events.length ? events : historyEvents.length ? historyEvents : localEvents;
      const now = simulationTime(last), seen = new Set();
      return source.filter(event => {
        if (!event || !finite(event.time) || (finite(now) && (event.time < now - 10 || event.time > now))) return false;
        const key = `${event.time}:${event.label || event.behavior || ''}`;
        if (seen.has(key)) return false; seen.add(key); return true;
      }).sort((a, b) => a.time - b.time);
    }
    function chartPoints() {
      if (Array.isArray(last.history)) {
        const history = last.history.filter(p => p && finite(p.time) && finite(p.marks));
        if (history.length) return history;
      }
      return localHistory;
    }
    function draw() {
      if (disposed || !panel.open || !context) return;
      const width = canvas.clientWidth || 284, height = canvas.clientHeight || 126;
      const dpr = Math.max(1, root.devicePixelRatio || 1);
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      }
      const ctx = context; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height);
      const current = simulationTime(last), end = finite(current) ? current : 0, start = end - 10;
      const points = chartPoints().filter(p => p.time >= start && p.time <= end).sort((a, b) => a.time - b.time);
      // Display small real bites without changing their values: axes explicitly
      // show the automatic range, with a 0.2-mark minimum span (no noise zoom).
      let low = points.length ? Math.min(...points.map(p => p.marks)) : 0;
      let high = points.length ? Math.max(...points.map(p => p.marks)) : 1;
      if (high - low < .2) { const center = (low + high) / 2; low = center - .1; high = center + .1; }
      const padding = Math.max(.02, (high - low) * .1); low -= padding; high += padding;
      const left = 29, right = width - 7, top = 15, bottom = height - 20;
      const x = time => left + (time - start) / 10 * (right - left);
      const y = marks => bottom - (marks - low) / (high - low) * (bottom - top);
      ctx.font = '9px sans-serif'; ctx.lineWidth = 1;
      for (let i = 0; i <= 2; i++) {
        const value = low + (high - low) * i / 2, py = y(value);
        ctx.strokeStyle = '#24404b'; ctx.beginPath(); ctx.moveTo(left, py); ctx.lineTo(right, py); ctx.stroke();
        ctx.fillStyle = '#91aeb9'; ctx.fillText(value.toFixed(high - low < .5 ? 2 : 1), 2, py + 3);
      }
      ctx.fillStyle = '#91aeb9'; ctx.fillText('−10s', left, height - 5); ctx.fillText('现在', right - 20, height - 5);
      const labelLanes = [[], []];
      chartEvents().filter(event => event.time >= start && event.time <= end).slice(-24).reverse().forEach(event => {
        const px = x(event.time); ctx.strokeStyle = '#d7b58855'; ctx.setLineDash([2, 3]);
        ctx.beginPath(); ctx.moveTo(px, top); ctx.lineTo(px, bottom); ctx.stroke(); ctx.setLineDash([]);
        // Keep every event marker, but never pile nearby text labels together.
        // Most recent events have priority; exact times remain in the event list.
        const label = String(event.label || event.behavior || '行为').slice(0, 4);
        const labelWidth = ctx.measureText(label).width;
        const labelX = Math.max(left, Math.min(px + 2, right - labelWidth));
        const lane = labelLanes.findIndex(boxes => boxes.every(box => labelX + labelWidth + 4 < box[0] || labelX > box[1] + 4));
        if (lane >= 0) {
          labelLanes[lane].push([labelX, labelX + labelWidth]);
          ctx.fillStyle = '#d7b588'; ctx.fillText(label, labelX, 9 + lane * 10);
        }
      });
      ctx.strokeStyle = '#a9e6cc'; ctx.lineWidth = 1.6; ctx.beginPath();
      points.forEach((point, index) => { if (index) ctx.lineTo(x(point.time), y(point.marks)); else ctx.moveTo(x(point.time), y(point.marks)); });
      ctx.stroke();
      if (!points.length) { ctx.fillStyle = '#91aeb9'; ctx.fillText('等待模拟遥测', left + 45, height / 2); }
    }
    function poll() {
      if (disposed || typeof options.getState !== 'function') return;
      try { const state = options.getState(); if (state && typeof state === 'object' && typeof state.then !== 'function') update(state); }
      catch (e) { error = e && e.message || '遥测暂不可用'; showError(); }
    }
    function tick(timestamp) {
      if (disposed) return;
      if (timestamp - lastPoll >= 100) { lastPoll = timestamp; poll(); }
      frame = root.requestAnimationFrame(tick);
    }
    listen(panel, 'toggle', () => { if (panel.open) { poll(); draw(); } });
    listen(root, 'resize', () => { if (panel.open) draw(); });
    if (typeof root.ResizeObserver === 'function') { resizeObserver = new root.ResizeObserver(() => { if (panel.open) draw(); }); resizeObserver.observe(canvas); }
    poll();
    if (typeof root.requestAnimationFrame === 'function') frame = root.requestAnimationFrame(tick);
    return {
      update,
      snapshot() {
        return { open: panel.open, enabled, paused, speed: Number(speedSelect.value), profile: profileSelect.value, parameters: parameterSnapshot(), hookMassG: Number(hookMassInput.value),
          time: simulationTime(last), history: chartPoints().map(p => ({ time: p.time, marks: p.marks })),
          events: chartEvents().map(p => ({ time: p.time, label: String(p.label || p.behavior || '行为') })), error };
      },
      dispose() {
        if (disposed) return; disposed = true;
        if (frame && typeof root.cancelAnimationFrame === 'function') root.cancelAnimationFrame(frame);
        if (resizeObserver) resizeObserver.disconnect(); cleanups.forEach(fn => fn()); panel.remove(); style.remove();
        localHistory = []; localEvents = [];
      }
    };
  }
  root.FishPanel = Object.freeze({ create });
})(typeof window !== 'undefined' ? window : globalThis);
