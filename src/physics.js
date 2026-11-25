/* FloatPhysics: SI-unit, vertical, tension-only fishing-rig model. No rendering dependencies. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FloatPhysics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const C = Object.freeze({ FLOAT_LENGTH: .26, BODY_START: .125, BODY_END: .20,
    BAND: .0157, MAIN_LENGTH: .105, SUB_LENGTH: .058, WATER_Y: .83, BOTTOM_Y: .055,
    WATER_DENSITY: 998.2, GRAVITY: 9.80665, FLOAT_MASS_G: .6,
    MAIN_DIAMETER: .00022, SUB_DIAMETER: .00016, LEAD_DENSITY: 11340,
    STEEL_DENSITY: 7850, HOOK_MASS_G: .025, BAIT_RADIUS: .0042, BAIT_DENSITY: 1100,
    SEAT_MASS_G: .045, SEAT_DENSITY: 1250, SWIVEL_MASS_G: .035,
    HOOK_EXTENT: .0202, BAIT_OFFSET: .016, RING_DROP: .004, RING_EXTENT: .0062 });
  const materials = Object.freeze({ nylon: 1140, fluoro: 1780, pe: 970 });
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  function finite(x, fallback) { return Number.isFinite(x) ? x : fallback; }
  function options(o) {
    o = o || {};
    const waterY = finite(o.waterY, C.WATER_Y), bottomY = finite(o.bottomY, C.BOTTOM_Y);
    if (bottomY >= waterY) throw new RangeError('bottomY must be below waterY');
    const material = o.lineMaterial || 'nylon';
    if (!(material in materials)) throw new RangeError('Unknown line material: ' + material);
    const baitDensity = Math.max(1, finite(o.baitDensity, C.BAIT_DENSITY));
    const baitMassG = Math.max(0, finite(o.baitMassG, 2 * baitDensity * 4 / 3 * Math.PI * C.BAIT_RADIUS ** 3 * 1000));
    const baitRadius = Math.cbrt((baitMassG / 2000 / baitDensity) * 3 / (4 * Math.PI));
    const hookExtent = Math.max(.0155, baitMassG > 0 ? C.BAIT_OFFSET + baitRadius : 0);
    return { waterY, bottomY, waterDensity: Math.max(1, finite(o.waterDensity, C.WATER_DENSITY)),
      baitMassG, baitRadius, hookExtent,
      floatMassG: Math.max(.001, finite(o.floatMassG, C.FLOAT_MASS_G)), lineMaterial: material,
      lineDensity: Math.max(1, finite(o.lineDensity, materials[material])),
      mainDiameter: clamp(finite(o.mainDiameter, C.MAIN_DIAMETER), .00001, .003),
      subDiameter: clamp(finite(o.subDiameter, C.SUB_DIAMETER), .00001, .003),
      baitDensity,
      linearDrag: Math.max(0, finite(o.linearDrag, .003)),
      dragCoefficient: Math.max(0, finite(o.dragCoefficient, .85)) };
  }
  // Continuous profile, shared verbatim with the renderer: painted antenna, spindle, carbon foot.
  function radius(s) {
    s = clamp(s, 0, C.FLOAT_LENGTH);
    if (s < C.BODY_START) return .00055 + .00030 * s / C.BODY_START;
    if (s < C.BODY_END) return .00085 + .00475 * Math.pow(Math.sin(Math.PI * (s - C.BODY_START) / (C.BODY_END - C.BODY_START)), .9);
    return .00085 - .00020 * (s - C.BODY_END) / (C.FLOAT_LENGTH - C.BODY_END);
  }
  const N = 4096, ds = C.FLOAT_LENGTH / N, volumes = new Float64Array(N + 1);
  for (let i = N - 1; i >= 0; i--) volumes[i] = volumes[i + 1] + Math.PI * radius((i + .5) * ds) ** 2 * ds;
  function volumeBelow(s) {
    if (s <= 0) return volumes[0];
    if (s >= C.FLOAT_LENGTH) return 0;
    const q = s / ds, i = Math.floor(q);
    return volumes[i] + (volumes[i + 1] - volumes[i]) * (q - i);
  }
  function leadDimensions(massG) {
    const massKg = Math.max(0, finite(massG, 0)) / 1000;
    const volumeM3 = massKg / C.LEAD_DENSITY;
    const height = massKg > 0 ? .018 : 0;
    const innerRadius = .0011;
    const radius = Math.sqrt(innerRadius ** 2 + (height ? volumeM3 / (Math.PI * height) : 0));
    return { height, radius, innerRadius, volumeM3, massKg, centerOffsetY: -height / 2,
      bottomOffsetY: -height, subAnchorOffsetY: -height - C.RING_DROP };
  }
  function rigLayout(topY, leadMassG, rawOptions) {
    const o = options(rawOptions), dim = leadDimensions(leadMassG);
    const floatBottomY = topY - C.FLOAT_LENGTH;
    const minimumTopY = o.bottomY + C.FLOAT_LENGTH;
    const leadMinTop = o.bottomY + Math.max(dim.height + C.RING_EXTENT, .007);
    const freeLeadTop = floatBottomY - C.MAIN_LENGTH;
    const leadTopY = Math.max(freeLeadTop, leadMinTop);
    const leadBottomY = leadTopY - dim.height;
    const subAnchorY = leadBottomY - C.RING_DROP;
    const freeHookY = subAnchorY - C.SUB_LENGTH;
    const hookY = Math.max(o.bottomY + o.hookExtent, freeHookY);
    const eps = 1e-8;
    return { floatTopY: topY, floatBottomY, mainStartY: floatBottomY, mainEndY: leadTopY,
      leadTopY, leadBottomY, leadCenterY: (leadTopY + leadBottomY) / 2,
      subAnchorY, hookYs: [hookY, hookY], baitCenterYs: [hookY - C.BAIT_OFFSET, hookY - C.BAIT_OFFSET],
      mainSlack: Math.max(0, C.MAIN_LENGTH - Math.abs(floatBottomY - leadTopY)),
      subSlack: Math.max(0, C.SUB_LENGTH - Math.abs(subAnchorY - hookY)), minimumTopY,
      contactTopYs: { hooks: o.bottomY + o.hookExtent + C.SUB_LENGTH + dim.height + C.RING_DROP + C.MAIN_LENGTH + C.FLOAT_LENGTH,
        lead: leadMinTop + C.MAIN_LENGTH + C.FLOAT_LENGTH, float: minimumTopY },
      contacts: { hooks: [freeHookY <= o.bottomY + o.hookExtent + eps, freeHookY <= o.bottomY + o.hookExtent + eps],
        lead: freeLeadTop <= leadMinTop + eps, float: topY <= minimumTopY + eps }, leadDimensions: dim };
  }
  function wetFraction(a, b, waterY) {
    if (Math.abs(a - b) < 1e-12) return a <= waterY ? 1 : 0;
    return clamp((waterY - Math.min(a, b)) / Math.abs(a - b), 0, 1);
  }
  function sphereWet(centerY, r, waterY) {
    const h = clamp(waterY - (centerY - r), 0, 2 * r);
    return Math.PI * h * h * (r - h / 3);
  }
  // Vertical limiting catenary: taut strand, or two hanging arms and a bed-supported remainder.
  // This is a static shape approximation, not an elastic rod simulation.
  function strand(a, b, length, diameter, o) {
    const area = Math.PI * diameter * diameter / 4;
    // A buoyant slack PE strand arches upward, rather than transmitting compression along a U.
    if (o.lineDensity < o.waterDensity && a <= o.waterY && b <= o.waterY && length > Math.abs(a - b) + 1e-8) {
      const highY = Math.min(o.waterY, (a + b + length) / 2);
      const topLength = highY - a, bottomLength = highY - b;
      const surfaceLength = Math.max(0, length - topLength - bottomLength);
      const armLoad = C.GRAVITY * (o.lineDensity - o.waterDensity) * area;
      return { massKg: o.lineDensity * area * length,
        wetVolume: area * (topLength + bottomLength + surfaceLength * o.lineDensity / o.waterDensity),
        topLoadN: armLoad * topLength, bottomLoadN: armLoad * bottomLength, floorLoadN: 0,
        topMassKg: o.lineDensity * area * topLength, topLength, bottomLength,
        floorLength: 0, surfaceLength, highY, lowY: Math.min(a, b), shape: 'arch' };
    }
    let topLength, bottomLength, floorLength, low;
    if (length <= Math.abs(a - b) + 1e-8) {
      topLength = a >= b ? length : 0;
      bottomLength = length - topLength; floorLength = 0; low = Math.min(a, b);
    } else {
      low = Math.max(o.bottomY, (a + b - length) / 2);
      topLength = Math.max(0, a - low); bottomLength = Math.max(0, b - low);
      floorLength = Math.max(0, length - topLength - bottomLength);
    }
    const part = (l, y) => {
      const volume = area * l;
      const wetVolume = volume * wetFraction(low, y, o.waterY);
      return { massKg: o.lineDensity * volume, wetVolume,
        loadN: C.GRAVITY * (o.lineDensity * volume - o.waterDensity * wetVolume) };
    };
    const top = part(topLength, a), bottom = part(bottomLength, b), floor = part(floorLength, low);
    return { massKg: top.massKg + bottom.massKg + floor.massKg,
      wetVolume: top.wetVolume + bottom.wetVolume + floor.wetVolume,
      topLoadN: top.loadN, bottomLoadN: bottom.loadN, floorLoadN: floor.loadN,
      topMassKg: top.massKg, topLength, bottomLength, floorLength, lowY: low };
  }
  function evaluate(topY, leadMassG, rawOptions) {
    const o = options(rawOptions), layout = rigLayout(topY, leadMassG, o), d = layout.leadDimensions;
    const g = C.GRAVITY, rho = o.waterDensity;
    const floatMass = o.floatMassG / 1000, floatVolume = volumeBelow(topY - o.waterY);
    const leadWet = d.volumeM3 * wetFraction(layout.leadBottomY, layout.leadTopY, o.waterY);
    const seatMass = C.SEAT_MASS_G / 1000, swivelMass = C.SWIVEL_MASS_G / 1000;
    const seatWet = seatMass / C.SEAT_DENSITY * wetFraction(layout.leadTopY - .007, layout.leadTopY + .007, o.waterY);
    const swivelWet = swivelMass / C.STEEL_DENSITY * wetFraction(layout.subAnchorY - .0022, layout.subAnchorY + .0022, o.waterY);
    const main = strand(layout.mainStartY, layout.mainEndY, C.MAIN_LENGTH, o.mainDiameter, o);
    let massKg = floatMass + d.massKg + seatMass + swivelMass + main.massKg;
    let displacedVolume = floatVolume + leadWet + seatWet + swivelWet + main.wetVolume;
    let support = main.floorLoadN, adjustableSupport = 0, subLoadAtLead = 0, lineMass = main.massKg, lineWet = main.wetVolume;
    let suspendedMass = floatMass + main.topMassKg;
    const subs = [];
    for (let k = 0; k < 2; k++) {
      const s = strand(layout.subAnchorY, layout.hookYs[k], C.SUB_LENGTH, o.subDiameter, o);
      const hookMass = C.HOOK_MASS_G / 1000;
      const hookWet = hookMass / C.STEEL_DENSITY * wetFraction(layout.hookYs[k] - .0155, layout.hookYs[k], o.waterY);
      const baitVolume = 4 / 3 * Math.PI * o.baitRadius ** 3;
      const baitMass = o.baitDensity * baitVolume;
      const baitWet = sphereWet(layout.baitCenterYs[k], o.baitRadius, o.waterY);
      const payloadLoad = g * (hookMass + baitMass - rho * (hookWet + baitWet));
      massKg += s.massKg + hookMass + baitMass;
      displacedVolume += s.wetVolume + hookWet + baitWet;
      lineMass += s.massKg; lineWet += s.wetVolume;
      const grounded = layout.contacts.hooks[k];
      const hookSupport = grounded ? Math.max(0, payloadLoad + s.bottomLoadN) : 0;
      support += s.floorLoadN + hookSupport;
      if (grounded && Math.abs(topY - layout.contactTopYs.hooks) < 1e-8) adjustableSupport += hookSupport;
      subLoadAtLead += s.topLoadN + (grounded ? 0 : payloadLoad);
      if (!layout.contacts.lead) suspendedMass += s.topMassKg + (grounded ? 0 : hookMass + baitMass);
      subs.push(s);
    }
    const leadLoad = g * (d.massKg + seatMass + swivelMass - rho * (leadWet + seatWet + swivelWet));
    if (layout.contacts.lead) {
      const leadSupport = Math.max(0, leadLoad + subLoadAtLead + main.bottomLoadN);
      support += leadSupport;
      if (Math.abs(topY - layout.contactTopYs.lead) < 1e-8) adjustableSupport += leadSupport;
    } else suspendedMass += d.massKg + seatMass + swivelMass;
    const weightN = massKg * g, buoyancyN = rho * displacedVolume * g;
    // At exact first contact the normal reaction is whatever is needed (0 <= N <= available load).
    if (adjustableSupport > 0) support -= clamp(buoyancyN - weightN + support, 0, adjustableSupport);
    if (layout.contacts.float) support += Math.max(0, weightN - buoyancyN - support);
    support = Math.max(0, support);
    const netForceN = buoyancyN - weightN + support;
    const contact = layout.contacts;
    const status = contact.float ? 'sunk' : contact.lead ? 'lead-bottom' : contact.hooks[0] ? 'hooks-bottom' : topY < o.waterY ? 'submerged' : 'floating';
    return { topY, buoyancyN, weightN, netForceN, massKg, displacedVolume,
      floatDisplacedVolume: floatVolume, leadDisplacedVolume: leadWet,
      lineMassG: lineMass * 1000, lineBuoyancyG: rho * lineWet * 1000,
      lineApparentMassG: (lineMass - rho * lineWet) * 1000,
      bottomSupportN: support, bottomSupportG: support / g * 1000,
      suspendedMassKg: Math.max(floatMass, suspendedMass),
      effectiveMassKg: Math.max(floatMass, suspendedMass) + .35 * rho * floatVolume,
      contact, contacts: contact, status, layout, strands: { main, subs }, options: o };
  }
  function equilibrium(leadMassG, rawOptions) {
    const o = options(rawOptions), l = rigLayout(o.waterY, leadMassG, o);
    const min = l.minimumTopY, max = o.waterY + C.FLOAT_LENGTH;
    // Include contact boundaries explicitly: support can produce a non-smooth force curve.
    const candidates = [min, l.contactTopYs.lead, l.contactTopYs.hooks].filter(y => y >= min && y <= max);
    for (const topY of candidates) {
      const e = evaluate(topY, leadMassG, o);
      if (Math.abs(e.netForceN) < 1e-10) return Object.assign(e, { converged: true });
    }
    let lo = min, hi = max;
    for (let i = 0; i < 70; i++) {
      const mid = (lo + hi) / 2;
      if (evaluate(mid, leadMassG, o).netForceN > 0) lo = mid; else hi = mid;
    }
    const e = evaluate((lo + hi) / 2, leadMassG, o);
    return Object.assign(e, { converged: Math.abs(e.netForceN) < 1e-7 });
  }
  function step(state, dt, leadMassG, rawOptions) {
    if (!Number.isFinite(dt) || dt < 0 || dt > 10) throw new RangeError('dt must be finite and in [0,10] seconds');
    const o = options(rawOptions);
    let topY = finite(state.topY, finite(state.y, o.waterY + .1));
    let velocityY = finite(state.velocityY, finite(state.velocity, 0));
    const n = Math.max(1, Math.ceil(dt * 240)), h = dt / n;
    for (let i = 0; i < n; i++) {
      const e = evaluate(topY, leadMassG, o);
      const wet = clamp(e.floatDisplacedVolume / volumes[0], 0, 1);
      const area = Math.PI * .0056 ** 2;
      const drag = o.linearDrag * (wet + .025) * velocityY + .5 * o.waterDensity * o.dragCoefficient * area * wet * velocityY * Math.abs(velocityY);
      const oldY = topY;
      velocityY += (e.netForceN - drag) / e.effectiveMassKg * h;
      topY += velocityY * h;
      if (topY < e.layout.minimumTopY) { topY = e.layout.minimumTopY; velocityY = Math.max(0, velocityY); }
      // A slack line becoming taut picks up stationary bed-supported mass: inelastic impulse.
      // Omitting this creates numerical energy at the moving-mass discontinuity.
      if (velocityY > 0) {
        for (const boundary of [e.layout.contactTopYs.lead, e.layout.contactTopYs.hooks]) {
          if (oldY <= boundary && topY > boundary) {
            const before = evaluate(boundary - 1e-7, leadMassG, o).effectiveMassKg;
            const after = evaluate(boundary + 1e-7, leadMassG, o).effectiveMassKg;
            velocityY *= Math.min(1, before / after);
            topY = boundary + (topY - boundary) * Math.min(1, before / after);
          }
        }
      }
      // Inelastic settling at a taut, bed-supported boundary; no target force or fictitious spring.
      if (Math.abs(velocityY) < .025) {
        for (const boundary of [e.layout.contactTopYs.hooks, e.layout.contactTopYs.lead]) {
          if ((oldY - boundary) * (topY - boundary) <= 0 && Math.abs(evaluate(boundary, leadMassG, o).netForceN) < 1e-10) {
            topY = boundary; velocityY = 0; break;
          }
        }
      }
    }
    return { topY, y: topY, velocityY, velocity: velocityY, evaluation: evaluate(topY, leadMassG, o) };
  }
  return Object.freeze({ constants: C, materials, radius, volumeBelow, totalVolume: volumes[0], leadDimensions, rigLayout, evaluate, equilibrium, step });
});
