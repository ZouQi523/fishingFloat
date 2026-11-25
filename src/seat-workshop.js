/* Full-screen, draft-only float / lead seat workbench. No solver dependency. */
(function () {
  'use strict';

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const format = value => String(Number(value.toFixed(3)));

  function create(config) {
    config = config || {};
    const ids = ['seatWorkshop', 'seatTitle', 'seatEyebrow', 'seatSubtitle', 'seatMetric',
      'seatValue', 'seatDelta', 'seatCanvas', 'seatStage', 'seatGrip', 'seatNote',
      'seatRestore', 'seatCancel', 'seatDone'];
    const el = {};
    ids.forEach(id => {
      el[id] = document.getElementById(id);
      if (!el[id]) throw new Error('SeatWorkshop requires #' + id);
    });
    const modal = el.seatWorkshop, canvas = el.seatCanvas, grip = el.seatGrip;
    const ctx = canvas.getContext('2d');
    let opened = false, mode = 'float', value = 42, original = 42;
    let min = 18, max = 80, floatDepth = 42, leadHeight = 5.5;
    let width = 1, height = 1, layout = { axisX: 0, seatY: 0, pxPerCm: 1 };
    let gesture = null, opener = null, background = [];
    let hardwareRects = [];
    const isFloat = () => mode === 'float';
    const yAt = cm => layout.zeroY - cm * layout.pxPerCm;
    const snap = cm => clamp(Math.round(cm * 2) / 2, min, max);

    function snapshot() {
      return { open: opened, mode, valueCm: value, originalCm: original, minCm: min, maxCm: max,
        dragging: !!gesture, layout: { ...layout },
        hardwareRects: hardwareRects.map(rect => ({ ...rect })) };
    }

    function text(g, message, x, y, color, align, size) {
      g.fillStyle = color || '#a9c3bd';
      g.font = (size || 11) + 'px system-ui, -apple-system, sans-serif';
      g.textAlign = align || 'left';
      g.textBaseline = 'middle';
      g.fillText(message, x, y);
    }
    function line(g, x1, y1, x2, y2, color, thickness) {
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2);
      g.strokeStyle = color; g.lineWidth = thickness || 1; g.stroke();
    }
    function rounded(g, x, y, w, h, radius) {
      const r = Math.min(radius, w / 2, h / 2);
      g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y);
      g.quadraticCurveTo(x + w, y, x + w, y + r); g.lineTo(x + w, y + h - r);
      g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h);
      g.quadraticCurveTo(x, y + h, x, y + h - r); g.lineTo(x, y + r);
      g.quadraticCurveTo(x, y, x + r, y); g.closePath();
    }
    function stop(g, x, y) {
      rounded(g, x - 5, y - 5, 10, 10, 4);
      const rubber = g.createLinearGradient(x - 5, 0, x + 5, 0);
      rubber.addColorStop(0, '#121b19'); rubber.addColorStop(.4, '#64756b');
      rubber.addColorStop(.7, '#283e35'); rubber.addColorStop(1, '#0b1511');
      g.fillStyle = rubber; g.fill();
      g.strokeStyle = '#6b7e6d'; g.lineWidth = .6; g.stroke();
    }
    function floatHardware(g, cm, ghost) {
      const x = layout.axisX, foot = yAt(cm), top = yAt(cm + 26);
      const length = foot - top;
      const antennaEnd = top + length * .48, bodyTop = top + length * .49;
      const bodyBottom = top + length * .82;
      g.save();
      if (ghost) {
        g.setLineDash([4, 5]); g.strokeStyle = '#83ac9d66'; g.lineWidth = 1.3;
        g.strokeRect(x - 16, top - 2, 32, length + 9);
        g.restore(); return;
      }
      g.shadowColor = '#0009'; g.shadowBlur = 12; g.shadowOffsetX = 4;
      line(g, x, antennaEnd, x, foot - 3, '#9b4e2e', 3);
      const bands = 9, bandH = (antennaEnd - top) / bands;
      for (let i = 0; i < bands; i++) {
        line(g, x, top + i * bandH, x, top + (i + 1) * bandH,
          i % 2 ? '#182723' : (i < 5 ? '#ef9b54' : '#dfe19a'), 4);
      }
      const wood = g.createLinearGradient(x - 12, 0, x + 12, 0);
      wood.addColorStop(0, '#713f26'); wood.addColorStop(.25, '#c58d50');
      wood.addColorStop(.48, '#f2ce83'); wood.addColorStop(.7, '#bd8749');
      wood.addColorStop(1, '#674324');
      g.beginPath(); g.moveTo(x, bodyTop);
      g.bezierCurveTo(x + 17, bodyTop + 5, x + 14, bodyBottom - 8, x, bodyBottom);
      g.bezierCurveTo(x - 14, bodyBottom - 8, x - 17, bodyTop + 5, x, bodyTop);
      g.fillStyle = wood; g.fill();
      g.strokeStyle = '#f6d49399'; g.lineWidth = .7; g.stroke();
      g.shadowBlur = 0; g.shadowOffsetX = 0;
      line(g, x - 3, bodyTop + 10, x - 3, bodyBottom - 9, '#ffe2a64d', 1);
      stop(g, x, foot - 11); stop(g, x, foot + 10);
      rounded(g, x - 7, foot - 4, 14, 8, 3);
      g.fillStyle = '#d7b669'; g.fill();
      g.restore();
      hardwareRects.push({ x: x - 19, y: top - 7, width: 38, height: length + 23 });
    }
    function leadHardware(g, cm, ghost, context) {
      const x = layout.axisX, cy = yAt(cm), h = context ? 22 : 38, w = context ? 12 : 22;
      g.save();
      if (ghost) {
        g.setLineDash([4, 5]); g.strokeStyle = '#83ac9d66';
        rounded(g, x - w / 2 - 4, cy - h / 2 - 4, w + 8, h + 8, 5); g.stroke();
        g.restore(); return;
      }
      if (context) g.globalAlpha = .43;
      stop(g, x, cy - h / 2 - 8); stop(g, x, cy + h / 2 + 8);
      const metal = g.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
      metal.addColorStop(0, '#586964'); metal.addColorStop(.18, '#b6c4bc');
      metal.addColorStop(.4, '#e5e6d6'); metal.addColorStop(.57, '#9aa59c');
      metal.addColorStop(.9, '#4c5c57'); metal.addColorStop(1, '#899a8f');
      g.shadowColor = '#0009'; g.shadowBlur = 10; g.shadowOffsetX = 4;
      rounded(g, x - w / 2, cy - h / 2, w, h, 4); g.fillStyle = metal; g.fill();
      g.shadowBlur = 0; g.shadowOffsetX = 0;
      for (let i = 0; i < 5; i++) {
        const yy = cy - h / 2 + 5 + i * (h - 8) / 5;
        line(g, x - w / 2 + 2, yy + 2, x + w / 2 - 2, yy - 1, '#233c3540', .8);
      }
      line(g, x + w / 2 - 4, cy - h / 2 + 4, x + w / 2 - 4, cy + h / 2 - 4, '#293c3670');
      g.restore();
      if (!context) hardwareRects.push({ x: x - 18, y: cy - h / 2 - 15, width: 36, height: h + 30 });
    }
    function updateLabels() {
      const delta = value - original;
      el.seatValue.textContent = format(value);
      el.seatDelta.textContent = Math.abs(delta) < 1e-8 ? '与原位置相同' :
        (delta > 0 ? '向竿尖移动 ' : '向八字环移动 ') + format(Math.abs(delta)) + ' cm';
      grip.setAttribute('aria-valuemin', String(min));
      grip.setAttribute('aria-valuemax', String(max));
      grip.setAttribute('aria-valuenow', String(value));
      grip.setAttribute('aria-valuetext', format(value) + ' 厘米，距八字环');
      grip.setAttribute('aria-label', isFloat() ? '移动漂座' : '移动铅座');
      grip.setAttribute('aria-orientation', 'vertical');
      grip.classList.toggle('dragging', !!gesture);
      canvas.style.cursor = gesture ? 'grabbing' : 'default';
    }
    function draw() {
      if (!opened || !ctx) return;
      layout.seatY = yAt(value);
      hardwareRects = [];
      const g = ctx, x = layout.axisX, bottom = layout.zeroY, top = layout.topY;
      g.clearRect(0, 0, width, height);
      const bg = g.createLinearGradient(0, 0, width, height);
      bg.addColorStop(0, '#102622'); bg.addColorStop(.52, '#0b1c1a'); bg.addColorStop(1, '#061210');
      g.fillStyle = bg; g.fillRect(0, 0, width, height);
      const glow = g.createRadialGradient(x, height * .45, 5, x, height * .45, height * .65);
      glow.addColorStop(0, '#24483b55'); glow.addColorStop(1, '#0b1b1600');
      g.fillStyle = glow; g.fillRect(0, 0, width, height);
      // Quiet workbench grid, not an interactive tank or a clickable ruler.
      for (let xx = 16; xx < width; xx += 32) line(g, xx, 0, xx, height, '#a4c5ac05');
      for (let yy = 16; yy < height; yy += 32) line(g, 0, yy, width, yy, '#a4c5ac05');
      const rulerX = Math.max(48, x - 69), domain = layout.domainCm;
      line(g, rulerX, top, rulerX, bottom, '#93ad9455');
      const minor = layout.pxPerCm >= 8 ? 1 : 5;
      const major = domain > 65 ? 10 : 5;
      for (let cm = 0; cm <= domain + .001; cm += minor) {
        const majorTick = cm % major === 0, yy = yAt(cm);
        line(g, rulerX - (majorTick ? 10 : 5), yy, rulerX, yy, majorTick ? '#9fb79b99' : '#8ca99144');
        if (majorTick) text(g, String(cm), rulerX - 16, yy, '#9bb49a', 'right', 10);
      }
      text(g, 'cm', rulerX - 16, top - 22, '#7d998a', 'right', 10);
      text(g, '竿尖方向 ↑', x, 24, '#b7c9ab', 'center', 11);
      line(g, x, top, x, bottom - 9, '#d0d4ae99', 1.4);
      line(g, x + 1, top, x + 1, bottom - 9, '#e8ecd42b', .5);
      // A narrow shaded corridor shows the permitted travel, without a HUD slider.
      line(g, x + 19, yAt(min), x + 19, yAt(max), '#add3aa14', 3);
      line(g, x + 16, yAt(min), x + 23, yAt(min), '#add3aa55');
      line(g, x + 16, yAt(max), x + 23, yAt(max), '#add3aa55');
      if (isFloat()) {
        leadHardware(g, leadHeight, false, true);
        floatHardware(g, original, true);
        floatHardware(g, value, false);
      } else {
        // The float itself remains above this enlarged lower-line view.
        line(g, x - 6, top - 8, x + 6, top - 2, '#bed0ae88', 1.5);
        line(g, x - 6, top - 2, x + 6, top + 4, '#bed0ae88', 1.5);
        text(g, '上接漂座', x + 23, top - 4, '#789989', 'left', 10);
        leadHardware(g, original, true, false);
        leadHardware(g, value, false, false);
      }
      if (Math.abs(value - original) > 1e-8) {
        g.save(); g.setLineDash([3, 4]);
        line(g, x - 28, yAt(original), Math.min(width - 12, x + 25), yAt(original), '#a8c9ad66');
        g.restore();
        text(g, '原位', x + 32, yAt(original), '#86a48d', 'left', 10);
      }
      g.save(); g.strokeStyle = '#c1c7a5'; g.lineWidth = 1.5;
      g.beginPath(); g.ellipse(x, bottom - 3, 4, 7, 0, 0, Math.PI * 2); g.stroke();
      rounded(g, x - 3, bottom + 5, 6, 8, 2); g.stroke();
      g.beginPath(); g.ellipse(x, bottom + 20, 4, 7, 0, 0, Math.PI * 2); g.stroke();
      g.restore();
      text(g, '八字环 · 0', x + 19, bottom + 15, '#b7c9ab', 'left', 11);
      text(g, '部件宽度已放大示意', width / 2, height - 15, '#698c7d', 'center', 10);
      // The handle always stays entirely inside the stage, including at its endpoints.
      const handleW = Math.max(44, grip.offsetWidth || 44);
      const handleH = Math.max(44, grip.offsetHeight || 44);
      grip.style.left = clamp(x + 28, 0, Math.max(0, width - handleW)) + 'px';
      grip.style.top = clamp(layout.seatY - 22, 0, Math.max(0, height - handleH)) + 'px';
      updateLabels();
    }

    function releaseGesture(revert) {
      if (!gesture) return;
      const previous = gesture;
      gesture = null; // Clear before releasePointerCapture can dispatch lostpointercapture.
      if (revert) value = previous.startValue;
      try {
        if (previous.element.hasPointerCapture && previous.element.hasPointerCapture(previous.id)) {
          previous.element.releasePointerCapture(previous.id);
        }
      } catch (_) { /* The browser may already have implicitly released capture. */ }
      draw();
    }
    function resize() {
      if (!opened) return;
      releaseGesture(true);
      const bounds = canvas.getBoundingClientRect();
      width = Math.max(1, bounds.width || el.seatStage.clientWidth || 320);
      height = Math.max(1, bounds.height || el.seatStage.clientHeight || 480);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const top = Math.min(62, height * .14), bottom = Math.max(top + 1, height - Math.min(70, height * .16));
      const domain = isFloat() ? Math.max(110, max + 28) : Math.max(floatDepth, max + 2.5);
      layout = { axisX: clamp(width * .46, Math.min(115, width * .4), Math.max(width * .5, width - 110)),
        seatY: 0, pxPerCm: (bottom - top) / domain, topY: top, zeroY: bottom, domainCm: domain };
      draw();
    }
    function setValue(next) {
      value = clamp(next, min, max);
      draw();
    }
    function pointerDown(event) {
      if (!opened || gesture || (event.button !== undefined && event.button !== 0) || event.isPrimary === false) return;
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left, y = event.clientY - rect.top;
      if (event.currentTarget === canvas && !hardwareRects.some(r =>
        x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height)) return;
      event.preventDefault();
      grip.focus({ preventScroll: true });
      gesture = { id: event.pointerId, element: event.currentTarget, startY: event.clientY, startValue: value };
      try { event.currentTarget.setPointerCapture(event.pointerId); } catch (_) { /* Synthetic input may not support capture. */ }
      draw();
    }
    function pointerMove(event) {
      if (!opened) return;
      if (!gesture) {
        if (event.currentTarget === canvas) {
          const rect = canvas.getBoundingClientRect(), x = event.clientX - rect.left, y = event.clientY - rect.top;
          canvas.style.cursor = hardwareRects.some(r => x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height) ? 'grab' : 'default';
        }
        return;
      }
      if (event.pointerId !== gesture.id) return;
      event.preventDefault();
      const distance = (gesture.startY - event.clientY) / layout.pxPerCm;
      // Preserve normalized fractional originals until a genuine movement is made.
      if (Math.abs(event.clientY - gesture.startY) < .5) return;
      setValue(snap(gesture.startValue + distance));
    }
    function pointerEnd(event) {
      if (gesture && event.pointerId === gesture.id) releaseGesture(event.type !== 'pointerup');
    }
    [canvas, grip].forEach(target => {
      target.addEventListener('pointerdown', pointerDown);
      target.addEventListener('pointermove', pointerMove);
      target.addEventListener('pointerup', pointerEnd);
      target.addEventListener('pointercancel', pointerEnd);
      target.addEventListener('lostpointercapture', pointerEnd);
      target.style.touchAction = 'none';
    });
    grip.addEventListener('keydown', event => {
      if (!opened) return;
      let next;
      const step = event.shiftKey ? 5 : .5;
      if (event.key === 'ArrowUp' || event.key === 'ArrowRight') next = snap(value + step);
      else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') next = snap(value - step);
      else if (event.key === 'Home') next = min;
      else if (event.key === 'End') next = max;
      else return;
      event.preventDefault();
      releaseGesture(true);
      setValue(next);
    });
    function focusable() {
      return Array.from(modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]'))
        .filter(node => !node.disabled && node.tabIndex >= 0 && !node.hidden &&
          !node.closest('[hidden], [inert]') && node.getClientRects().length > 0);
    }
    function modalKeydown(event) {
      if (!opened) return;
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation(); close();
      } else if (event.key === 'Tab') {
        const nodes = focusable();
        if (!nodes.length) { event.preventDefault(); grip.focus(); return; }
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (event.shiftKey && (document.activeElement === first || !modal.contains(document.activeElement))) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !modal.contains(document.activeElement))) {
          event.preventDefault(); first.focus();
        }
      }
    }
    function keepFocus(event) {
      if (opened && !modal.contains(event.target)) grip.focus({ preventScroll: true });
    }
    function finish(commit) {
      if (!opened) return;
      releaseGesture(!commit);
      if (!commit) value = original;
      draw(); // Keep closed snapshots and accessibility values consistent with cancellation.
      const committedValue = value, closingMode = mode;
      opened = false;
      modal.hidden = true; modal.classList.remove('on');
      modal.removeEventListener('keydown', modalKeydown);
      document.removeEventListener('focusin', keepFocus);
      background.forEach(item => {
        item.node.inert = item.inert;
        if (item.attribute === null) item.node.removeAttribute('inert');
        else item.node.setAttribute('inert', item.attribute);
      });
      background = [];
      try {
        if (commit && typeof config.onCommit === 'function') config.onCommit(closingMode, committedValue);
      } finally {
        try {
          if (typeof config.onClose === 'function') config.onClose(closingMode);
        } finally {
          if (opener && opener.isConnected && typeof opener.focus === 'function') opener.focus({ preventScroll: true });
          opener = null;
        }
      }
    }
    function close() { finish(false); }
    function open(nextMode) {
      if (opened) return snapshot();
      if (nextMode !== 'float' && nextMode !== 'lead') throw new Error('SeatWorkshop mode must be float or lead');
      const options = typeof config.getOptions === 'function' ? config.getOptions() || {} : {};
      mode = nextMode;
      floatDepth = finite(options.floatToSwivel, .42) * 100;
      leadHeight = finite(options.leadAboveSwivel, .055) * 100;
      // Preserve the stored running-lead travel even while the lead is locked.
      // Moving one seat must not silently normalize another solver setting.
      const travelCm = Math.max(0, finite(options.leadTravel, .08) * 100);
      min = isFloat() ? Math.max(18, leadHeight + 2.5, leadHeight + travelCm + .5) : 2;
      max = isFloat() ? Math.max(min, 80) : Math.max(min, Math.min(floatDepth - 2.5, floatDepth - travelCm - .5));
      // Clamp to legal geometry, but never quantize a normalized external value on open.
      original = clamp(isFloat() ? floatDepth : leadHeight, min, max);
      value = original;
      opener = document.activeElement;
      opened = true;
      modal.hidden = false; modal.classList.add('on');
      el.seatTitle.textContent = isFloat() ? '移漂' : '移铅';
      el.seatEyebrow.textContent = '线组工坊 / ' + (isFloat() ? 'FLOAT SEAT' : 'LEAD SEAT');
      el.seatSubtitle.textContent = isFloat() ? '沿主线移动漂座，改变漂座至八字环的距离。' : '沿主线移动铅座，不增减铅重，也不改变线长。';
      el.seatMetric.textContent = isFloat() ? '漂座至八字环' : '铅座至八字环';
      el.seatNote.textContent = '拖动' + (isFloat() ? '浮漂' : '铅皮座') + '或右侧手柄 · 步进 0.5 cm · 方向键微调，Shift 加速 · 完成生效，取消保留原位';
      grip.textContent = isFloat() ? '↕ 握住漂座' : '↕ 握住铅座';
      grip.title = '拖动移位；方向键每次 0.5 cm，Shift 每次 5 cm；Home / End 到边界';
      background = ['c', 'hud', 'floatScope', 'physicsPanel', 'observationBar'].map(id => document.getElementById(id))
        .filter(node => node && !node.contains(modal)).map(node => ({ node, inert: !!node.inert, attribute: node.getAttribute('inert') }));
      background.forEach(item => { item.node.inert = true; item.node.setAttribute('inert', ''); });
      modal.addEventListener('keydown', modalKeydown);
      document.addEventListener('focusin', keepFocus);
      if (typeof config.onOpen === 'function') config.onOpen(mode);
      resize();
      grip.focus({ preventScroll: true });
      return snapshot();
    }
    el.seatRestore.addEventListener('click', () => {
      if (!opened) return;
      releaseGesture(true); setValue(clamp(isFloat() ? 42 : 5.5, min, max));
    });
    el.seatCancel.addEventListener('click', close);
    el.seatDone.addEventListener('click', () => finish(true));
    window.addEventListener('resize', resize);
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => {
        if (!opened) return;
        const rect = canvas.getBoundingClientRect();
        if (Math.abs(rect.width - width) > .5 || Math.abs(rect.height - height) > .5) resize();
      });
      observer.observe(el.seatStage);
    }
    return { open, close, resize, isOpen: () => opened, snapshot };
  }

  window.SeatWorkshop = Object.freeze({ create });
})();
