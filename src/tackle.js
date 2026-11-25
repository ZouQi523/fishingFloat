/* Continuous Taiwan rig. SI units; tension-only inextensible cables, no equilibrium targets.
 * Line inertia/weight/buoyancy is lumped at cable endpoints; its drawn sag is quasi-static.
 * Float buoyancy is integrated over the shared profile and applied at its actual centroid.
 */
(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./physics.js') : root.FloatPhysics);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TaiwanRig = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (P) {
  'use strict';
  if (!P) throw new Error('TaiwanRig requires FloatPhysics');
  const C = P.constants, G = C.GRAVITY, FL = C.FLOAT_LENGTH;
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const num = (v, d) => Number.isFinite(v) ? v : d;
  const point = (x = 0, y = 0, z = 0) => ({ x, y, z });
  const copy = p => point(p.x, p.y, p.z);
  const add = (a, b) => point(a.x + b.x, a.y + b.y, a.z + b.z);
  const sub = (a, b) => point(a.x - b.x, a.y - b.y, a.z - b.z);
  const scale = (a, s) => point(a.x * s, a.y * s, a.z * s);
  const norm = a => Math.hypot(a.x, a.y, a.z);
  const distance = (a, b) => norm(sub(a, b));
  const mix = (a, b, t) => add(scale(a, 1 - t), scale(b, t));
  const json = a => JSON.parse(JSON.stringify(a));
  const defaults = Object.freeze({ leadMassG: 4, floatMassG: .6, baitMassG: .34,
    waterY: .83, bottomY: .055, waterDensity: 998.23, lineMaterial: 'nylon',
    mainDiameter: .00022, subDiameter: .00016, mainLength: 1.20, windOnSurface: true,
    floatToSwivel: .42, leadAboveSwivel: .055, leadTravel: .08, leadLocked: true,
    leaderLengths: Object.freeze([.12, .15]), rodTip: Object.freeze({ x: -.50, y: 1.10, z: .025 }) });
  function normalize(raw) {
    const r = Object.assign({}, defaults, raw || {}), material = r.lineMaterial;
    if (!Object.prototype.hasOwnProperty.call(P.materials, material)) throw new RangeError('Unknown line material: ' + material);
    const mainLength = clamp(num(r.mainLength, 1.2), .08, 20);
    const floatToSwivel = clamp(num(r.floatToSwivel, .42), .03, mainLength - .02);
    const leadAboveSwivel = clamp(num(r.leadAboveSwivel, .055), .005, floatToSwivel - .005);
    const baitDensity = Math.max(1, num(r.baitDensity, C.BAIT_DENSITY));
    const baitMassG = Math.max(0, num(r.baitMassG, .34));
    const baitRadius = Math.cbrt(baitMassG / 2000 / baitDensity * 3 / (4 * Math.PI));
    const waterY = num(r.waterY, .83), bottomY = num(r.bottomY, .055);
    if (bottomY >= waterY) throw new RangeError('bottomY must be below waterY');
    const rod = r.rodTip || defaults.rodTip, leaders = r.leaderLengths || defaults.leaderLengths;
    // Preserve the legacy options shape unless hook mass was explicitly supplied.
    const hookMassG = r.hookMassG;
    if (hookMassG !== undefined && (!Number.isFinite(hookMassG) || hookMassG < 0))
      throw new RangeError('hookMassG must be finite and nonnegative');
    const normalized = { leadMassG: Math.max(0, num(r.leadMassG, 4)), floatMassG: Math.max(.01, num(r.floatMassG, .6)),
      baitMassG, baitDensity, baitRadius, hookExtent: Math.max(.0155, baitMassG ? C.BAIT_OFFSET + baitRadius : 0),
      waterY, bottomY, waterDensity: Math.max(1, num(r.waterDensity, 998.23)), lineMaterial: material,
      lineDensity: P.materials[material], mainDiameter: clamp(num(r.mainDiameter, .00022), .00001, .003),
      subDiameter: clamp(num(r.subDiameter, .00016), .00001, .003), mainLength, floatToSwivel, windOnSurface: r.windOnSurface !== false,
      leadAboveSwivel, leadTravel: clamp(num(r.leadTravel, .08), 0, floatToSwivel - leadAboveSwivel - .005),
      leadLocked: r.leadLocked !== false, leaderLengths: [0, 1].map(i => clamp(num(leaders[i], defaults.leaderLengths[i]), .01, 5)),
      rodTip: point(num(rod.x, -.5), num(rod.y, 1.1), num(rod.z, .025)) };
    if (hookMassG !== undefined) normalized.hookMassG = clamp(hookMassG, 0, .3);
    return normalized;
  }
  const bins = Array.from({ length: 48 }, (_, i) => {
    const s0 = i / 48 * FL, s1 = (i + 1) / 48 * FL, s = (s0 + s1) / 2;
    return { s0, s1, t: 1 - s / FL, radius: P.radius(s),
      maxRadius: Math.max(P.radius(s0), P.radius(s), P.radius(s1)),
      volume: P.volumeBelow(s0) - P.volumeBelow(s1) };
  });
  const diskFraction = q => q <= -1 ? 0 : q >= 1 ? 1
    : .5 + (Math.asin(q) + q * Math.sqrt(Math.max(0, 1 - q * q))) / Math.PI;
  const radialQuadrature = Array.from({ length: 12 }, (_, i) => {
    const angle = (i + 1) * Math.PI / 13;
    return { q: Math.cos(angle), weight: 2 / 13 * Math.sin(angle) ** 2 };
  });
  // Exact shared axial profile integrals; tilted cuts integrate circular cross sections.
  // The 48 axial bins approximate transverse radius only, never the total/upright volume.
  function floatSubmersion(foot, top, waterY = C.WATER_Y) {
    const delta = sub(top, foot), dy = delta.y, axisY = dy / Math.max(norm(delta), 1e-12);
    const radialProjection = Math.sqrt(Math.max(0, 1 - axisY * axisY));
    let volume = 0, topShare = 0;
    function axialWet(bin, level) {
      if (Math.abs(dy) < 1e-12) return top.y <= level ? bin.volume : 0;
      const cut = (top.y - level) * FL / dy;
      return dy > 0 ? P.volumeBelow(clamp(cut, bin.s0, bin.s1)) - P.volumeBelow(bin.s1)
        : P.volumeBelow(bin.s0) - P.volumeBelow(clamp(cut, bin.s0, bin.s1));
    }
    for (const bin of bins) {
      const p = mix(foot, top, bin.t), halfAxial = Math.abs(dy) / bins.length / 2;
      const r = bin.radius * radialProjection, extent = halfAxial + bin.maxRadius * radialProjection;
      let v;
      if (waterY >= p.y + extent) v = bin.volume;
      else if (waterY <= p.y - extent) v = 0;
      else if (r < 1e-10) v = axialWet(bin, waterY);
      else if (halfAxial < r * .3) {
        // Nearly horizontal: integrate the analytic circular-segment area along the axis.
        v = 0;
        for (let j = 0; j < 4; j++) {
          const s0 = bin.s0 + (bin.s1 - bin.s0) * j / 4, s1 = s0 + (bin.s1 - bin.s0) / 4;
          const s = (s0 + s1) / 2, y = top.y - dy * s / FL;
          v += (P.volumeBelow(s0) - P.volumeBelow(s1)) * diskFraction((waterY - y) / (P.radius(s) * radialProjection));
        }
      } else {
        // Disk-area quadrature convolves radial immersion with exact axial profile clipping.
        v = 0;
        for (const q of radialQuadrature) v += q.weight * axialWet(bin, waterY - q.q * r);
      }
      volume += v; topShare += v * bin.t;
    }
    volume = clamp(volume, 0, P.totalVolume);
    return { volume, footShare: Math.max(0, volume - topShare), topShare,
      center: volume > 0 ? mix(foot, top, topShare / volume) : mix(foot, top, .5) };
  }
  function wet(a, b, y) { return Math.abs(a - b) < 1e-12 ? +(a <= y) : clamp((y - Math.min(a, b)) / Math.abs(a - b), 0, 1); }
  function sphereWet(y, r, water) {
    if (!r) return 0;
    const h = clamp(water - y + r, 0, 2 * r);
    return Math.PI * h * h * (r - h / 3);
  }
  // A sampled hanging/arching cable with exact material mass. Contact clips sag at the bed;
  // bed slack is laid laterally, not removed from line length. No cable can push its endpoints.
  // Wind alone may retain its free slack at the interface: a quasi-static ideal surface
  // retention assumption for an unpressed/unwetted line, NOT a resolved capillary/wetting
  // simulation. Endpoint legs still use material, carry weight, and can enter the water.
  function cable(a, b, length, diameter, o, surfaceHeld = false) {
    const d = distance(a, b), slack = Math.max(0, length - d), n = 24;
    const buoyant = o.lineDensity < o.waterDensity && Math.max(a.y, b.y) < o.waterY;
    const direction = buoyant ? 1 : -1;
    let points, surfaceStart = -1, surfaceEnd = -1;
    const arc = ps => ps.slice(1).reduce((s, p, i) => s + distance(p, ps[i]), 0);
    if (surfaceHeld && o.windOnSurface && slack > 1e-7) {
      // Default: ideal interface retention supports the wind line even for nylon.
      // This is separate from PE-style bulk positive buoyancy.
      // Begin with a reachable broken-line route, then round its two interface
      // corners with quadratic legs. Their surface tangents and the bowed span's
      // tangents agree (C1 direction continuity); there is no air/water kink.
      // Rounding uses real material: solve the surface bow only AFTER measuring
      // both curved legs. Near tautness the rounding/contact shrink to zero.
      const ha = Math.abs(a.y - o.waterY), hb = Math.abs(b.y - o.waterY), v = ha + hb;
      const h = Math.hypot(b.x - a.x, b.z - a.z), minimum = Math.hypot(h, v);
      // Coincident interface endpoints have no horizontal routing axis. Lay a
      // closed surface loop instead of degenerating into a submerged out-and-back
      // strand. Its polygon radius conserves the same material length exactly.
      if (h < 1e-10 && v < 1e-10) {
        const count = 192, radius = length / (2 * count * Math.sin(Math.PI / count));
        points = Array.from({length:count+1}, (_,i) => {
          if (!i) return copy(a); if (i === count) return copy(b);
          const angle = 2 * Math.PI * i / count;
          return point(a.x + radius * Math.sin(angle), o.waterY, a.z + radius * (1 - Math.cos(angle)));
        });
        surfaceStart = 0; surfaceEnd = count;
      }
      if (!points && length >= minimum - 1e-9) {
        const span = length >= h + v ? h : clamp((length * length - h * h - v * v) / (2 * Math.max(1e-12, length - h)), 0, h);
        const inset = h - span, ta = v ? inset * ha / v : 0, tb = v ? inset * hb / v : 0;
        const ux = h > 1e-12 ? (b.x - a.x) / h : 1, uz = h > 1e-12 ? (b.z - a.z) / h : 0;
        // A tiny, slack-funded spread also permits a smooth loop when the rod
        // and seat happen to be vertically aligned, instead of an out-and-back cusp.
        const spread = Math.min(.02, Math.max(0, .02 - h), Math.max(0, length - h - v) * .08);
        const sa=ha>1e-10?spread:0, sb=hb>1e-10?spread:0;
        const ca = point(a.x + ux * (ta - sa), o.waterY, a.z + uz * (ta - sa));
        const cb = point(b.x - ux * (tb - sb), o.waterY, b.z - uz * (tb - sb));
        const reach = span + sa + sb;
        const ra = ha > 1e-10 ? Math.min(.06, reach * .20, ha * .6) : 0;
        const rb = hb > 1e-10 ? Math.min(.06, reach * .20, hb * .6) : 0;
        const entry = point(ca.x + ux * ra, o.waterY, ca.z + uz * ra);
        const exit = point(cb.x - ux * rb, o.waterY, cb.z - uz * rb);
        const eased = (i, count) => (1 - Math.cos(Math.PI * i / count)) / 2;
        const quadratic = (p, c, q) => {
          const A = distance(p, c), B = distance(c, q);
          const ts = Array.from({length:17}, (_, i) => eased(i, 16));
          if (A > 1e-14 && B > 1e-14) {
            const cosine = ((c.x-p.x)*(q.x-c.x)+(c.y-p.y)*(q.y-c.y)+(c.z-p.z)*(q.z-c.z))/(A*B);
            const theta = Math.acos(clamp(cosine, -1, 1)), count = Math.ceil(theta/(Math.PI/90));
            // Equal tangent-angle knots resolve even a shrinking near-taut fillet;
            // fixed t spacing alone skips its final, almost horizontal tangent.
            for (let i=1; i<count; i++) {
              const left = B*Math.sin(theta*(1-i/count)), right = A*Math.sin(theta*i/count);
              ts.push(right/(left+right));
            }
          }
          ts.sort((a,b)=>a-b);
          return ts.filter((t,i)=>!i || t>ts[i-1]).map(t => {
            if (!t) return copy(p); if (t===1) return copy(q);
            const s=1-t;
            return point(s*s*p.x+2*s*t*c.x+t*t*q.x, s*s*p.y+2*s*t*c.y+t*t*q.y, s*s*p.z+2*s*t*c.z+t*t*q.z);
          });
        };
        const air = quadratic(a, ca, entry), approach = quadratic(exit, cb, b);
        const available = length - arc(air) - arc(approach);
        if (reach > 1e-10 && available >= distance(entry, exit) - 1e-9) {
          const chord = distance(entry, exit);
          const basis = t => {
            const s=Math.sin(Math.PI*t), c=Math.cos(Math.PI*t);
            return {t, bow:t>0&&t<1?s**4:0, slope:4*Math.PI*s*s*s*c};
          };
          const solve = (knots, iterations) => {
            const segments=knots.slice(1).map((p,i)=>[chord*(p.t-knots[i].t),p.bow-knots[i].bow]);
            let lo=0, hi=length;
            for (let k=0;k<iterations;k++) {
              const m=(lo+hi)/2;
              let measured=0; for (const [dx,db] of segments) measured+=Math.hypot(dx,m*db);
              if(measured<available)lo=m;else hi=m;
            }
            return (lo+hi)/2;
          };
          const coarse=Array.from({length:33},(_,i)=>basis(eased(i,32)));
          const estimate=solve(coarse,32), knots=[basis(0)];
          const refine=(l,r,depth) => {
            const delta=Math.abs(Math.atan2(estimate*l.slope,chord)-Math.atan2(estimate*r.slope,chord));
            if(delta>Math.PI/90 && depth<36) {
              const m=basis((l.t+r.t)/2);refine(l,m,depth+1);refine(m,r,depth+1);
            } else knots.push(r);
          };
          // The tangent slope is monotone on these four intervals. Refining
          // angle, not just t, catches the tight top of a long or narrow loop.
          const boundaries=[0,1/3,.5,2/3,1].map(basis);
          for(let i=1;i<boundaries.length;i++)refine(boundaries[i-1],boundaries[i],0);
          // Keep knots FIXED during the authoritative length solve, avoiding
          // discontinuous arc changes as adaptive subdivisions appear/disappear.
          const amplitude=solve(knots,36);
          points=air;surfaceStart=points.length-1;
          points.push(...knots.slice(1).map(k=>{
            const p=mix(entry,exit,k.t);p.x-=uz*k.bow*amplitude;p.z+=ux*k.bow*amplitude;return p;
          }));surfaceEnd=points.length-1;
          points.push(...approach.slice(1));
        }
      }
    }
    function shape(amp) {
      const out = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n, p = mix(a, b, t), bow = Math.sin(Math.PI * t) * amp;
        const wanted = p.y + direction * bow;
        p.y = clamp(wanted, o.bottomY, Math.max(o.waterY, a.y, b.y) + (buoyant ? 0 : 100));
        // At a unilateral surface, the remaining strand drapes sideways on that surface.
        p.z += Math.max(0, Math.abs(wanted - p.y)) * Math.sin(2 * Math.PI * t);
        out.push(p);
      }
      out[0] = copy(a); out[n] = copy(b);
      return out;
    }
    if (!points && slack < 1e-7) points = shape(0);
    else if (!points) {
      let lo = 0, hi = length;
      for (let k = 0, iterations = surfaceHeld ? 30 : 15; k < iterations; k++) { const m = (lo + hi) / 2; if (arc(shape(m)) < length) lo = m; else hi = m; }
      points = shape((lo + hi) / 2);
    }
    let arclength = 0, immersed = 0, surfaceLength = 0;
    // Nominally half immersed. An exceptionally light line / dense liquid needs
    // less immersion: never invent a downward retention force to hold it under.
    const surfaceWetFraction = Math.min(.5, o.lineDensity / o.waterDensity);
    for (let i = 1; i < points.length; i++) {
      const l = distance(points[i - 1], points[i]), onSurface = i > surfaceStart && i <= surfaceEnd;
      arclength += l; immersed += l * (onSurface ? surfaceWetFraction : wet(points[i - 1].y, points[i].y, o.waterY));
      if (onSurface) surfaceLength += l;
    }
    const volume = Math.PI * diameter ** 2 / 4 * length;
    // Publish material supported length, not additional mass or Archimedean
    // buoyancy. Retention supplies only the interface strand's remaining weight;
    // it does not directly support the submerged tackle or constrain endpoints.
    const supportedLength = arclength ? length * surfaceLength / arclength : 0;
    const surfaceVolume = Math.PI * diameter ** 2 / 4 * supportedLength;
    return { points, length, mass: volume * o.lineDensity, surfaceLength: supportedLength,
      surfaceSupportN: Math.max(0, (o.lineDensity - o.waterDensity * surfaceWetFraction) * surfaceVolume * G),
      wetVolume: volume * (arclength ? immersed / arclength : +(a.y <= o.waterY)) };
  }
  function create(raw) {
    let o = normalize(raw), nodes, velocities, coordinate, slideVelocity = 0, time = 0;
    let last = { wind: 0, upper: 0, lower: 0, leaders: [0, 0], support: 0, rod: point() };
    const emptyInteraction = () => ({ hooks: [point(), point()], lineContacts: [],
      nodes: Array.from({ length: 6 }, () => point()), total: point() });
    let lastInteraction = emptyInteraction();
    // Forces are Newtons, not positions/impulses. Only real hook attachments and
    // contacts on the two leaders are public entry points into the original solver.
    function interactionInput(value) {
      if (value == null) return null;
      if (typeof value !== 'object' || Array.isArray(value)
        || Object.keys(value).some(k => k !== 'hooks' && k !== 'lineContacts')) {
        throw new TypeError('interaction accepts only hooks and lineContacts');
      }
      const force = v => {
        if (!v || !['x', 'y', 'z'].every(k => Number.isFinite(v[k]))) throw new RangeError('interaction force must be a finite {x,y,z} vector in N');
        return copy(v);
      };
      const hooks = value.hooks === undefined ? [point(), point()] : value.hooks;
      if (!Array.isArray(hooks) || hooks.length !== 2) throw new TypeError('interaction.hooks must contain two force vectors');
      const contacts = value.lineContacts === undefined ? [] : value.lineContacts;
      if (!Array.isArray(contacts)) throw new TypeError('interaction.lineContacts must be an array');
      return { hooks: [force(hooks[0]), force(hooks[1])], lineContacts: Array.from(contacts, c => {
        if (!c || (c.leader !== 0 && c.leader !== 1) || !Number.isFinite(c.t) || c.t < 0 || c.t > 1) {
          throw new RangeError('line contact requires leader 0 or 1 and t in [0,1]');
        }
        return { leader: c.leader, t: c.t, force: force(c.force) };
      }) };
    }
    function applyInteraction(l, interaction) {
      const actual = emptyInteraction();
      if (interaction) {
        actual.hooks = interaction.hooks.map(copy);
        actual.hooks.forEach((f, i) => { actual.nodes[4 + i] = copy(f); });
        actual.lineContacts = interaction.lineContacts.map(c => {
          // Drawn slack has no dynamic interior nodes. Never fake its response by
          // pushing its endpoints: only a geometrically taut leader admits this
          // quasi-static virtual-work endpoint distribution (t=0 at the ring).
          const taut = distance(leaderAnchor(), nodes[4 + c.leader]) >= o.leaderLengths[c.leader] - 1e-6;
          if (taut) {
            actual.nodes[3] = add(actual.nodes[3], scale(c.force, 1 - c.t));
            actual.nodes[4 + c.leader] = add(actual.nodes[4 + c.leader], scale(c.force, c.t));
          }
          return { leader: c.leader, t: c.t, force: copy(c.force), taut, applied: taut };
        });
        actual.nodes.forEach((f, i) => {
          // Skip exact zeros: the uncoupled arithmetic path stays bit-for-bit
          // identical, including its original force summation/integration order.
          if (f.x || f.y || f.z) l.f[i] = add(l.f[i], f);
          actual.total = add(actual.total, f);
        });
      }
      lastInteraction = actual;
    }
    const leaderAnchor = () => add(nodes[3], point(0, -.006, 0));
    const leadFloorRadius = () => {
      const d = P.leadDimensions(o.leadMassG);
      // Circumscribed envelopes cover tilted lead corners and the bare 20mm flanged seat.
      return Math.max(Math.hypot(d.height / 2, d.radius), Math.hypot(.010, .00110));
    };
    const cm = .075 / FL; // physical CM is below the immersed spindle's centre of buoyancy
    function cables() {
      return [cable(o.rodTip, nodes[0], o.mainLength - o.floatToSwivel, o.mainDiameter, o, true),
        cable(nodes[0], nodes[2], o.floatToSwivel - coordinate, o.mainDiameter, o),
        cable(nodes[2], nodes[3], coordinate, o.mainDiameter, o),
        ...[0, 1].map(i => cable(leaderAnchor(), nodes[4 + i], o.leaderLengths[i], o.subDiameter, o))];
    }
    function loads() {
      const hookMassG = o.hookMassG ?? C.HOOK_MASS_G;
      const f = Array.from({ length: 6 }, () => point()), masses = [o.floatMassG / 1000 * (1 - cm), o.floatMassG / 1000 * cm,
        (o.leadMassG + C.SEAT_MASS_G) / 1000, C.SWIVEL_MASS_G / 1000,
        (hookMassG + o.baitMassG / 2) / 1000, (hookMassG + o.baitMassG / 2) / 1000];
      // One additional float seat plus six small stopper beans (12mg total), not another lead seat/swivel.
      const floatFittingsMass = .020 / 1000, beanMass = .012 / 1000;
      masses[0] += floatFittingsMass + beanMass / 2; masses[2] += beanMass / 2;
      let volume = 0, floatVolume = 0, lineMass = 0, lineWet = 0, rodLoad = 0, surfaceSupport = 0;
      const buoy = (i, v) => { volume += v; f[i].y += o.waterDensity * G * v; };
      const hydro = floatSubmersion(nodes[0], nodes[1], o.waterY);
      floatVolume = hydro.volume; buoy(0, hydro.footShare); buoy(1, hydro.topShare);
      buoy(0, (floatFittingsMass + beanMass / 2) / C.SEAT_DENSITY * wet(nodes[0].y - .004, nodes[0].y + .004, o.waterY));
      const leadVolume = o.leadMassG / 1000 / C.LEAD_DENSITY;
      buoy(2, (leadVolume + (C.SEAT_MASS_G / 1000 + beanMass / 2) / C.SEAT_DENSITY) * wet(nodes[2].y - .009, nodes[2].y + .009, o.waterY));
      buoy(3, masses[3] / C.STEEL_DENSITY * wet(nodes[3].y - .003, nodes[3].y + .003, o.waterY));
      for (let i = 4; i < 6; i++) {
        buoy(i, hookMassG / 1000 / C.STEEL_DENSITY * wet(nodes[i].y - .0155, nodes[i].y, o.waterY)
          + sphereWet(nodes[i].y - C.BAIT_OFFSET, o.baitRadius, o.waterY));
      }
      const strands = cables(), pairs = [[-1, 0], [0, 2], [2, 3], [3, 4], [3, 5]];
      strands.forEach((s, k) => {
        lineMass += s.mass; lineWet += s.wetVolume; volume += s.wetVolume;
        surfaceSupport += s.surfaceSupportN;
        const load = G * (o.waterDensity * s.wetVolume - s.mass) + s.surfaceSupportN;
        pairs[k].forEach(i => {
          if (i < 0) rodLoad -= load / 2;
          else { masses[i] += s.mass / 2; f[i].y += (o.waterDensity * G * s.wetVolume + s.surfaceSupportN) / 2; }
        });
      });
      // Rod-end line mass belongs to total weight, but not to a moving node.
      const totalMass = masses.reduce((a, b) => a + b, 0) + strands[0].mass / 2;
      masses.forEach((m, i) => { f[i].y -= m * G; });
      const effective = masses.slice();
      effective[0] += .4 * o.waterDensity * floatVolume * (1 - cm);
      effective[1] += .4 * o.waterDensity * floatVolume * cm;
      return { f, masses, effective, totalMass, volume, floatVolume, lineMass, lineWet, rodLoad, surfaceSupport, strands };
    }
    function reset(arg) {
      time = 0; coordinate = o.leadAboveSwivel; slideVelocity = 0;
      const cast = !arg || arg.cast !== false;
      const foot = point(.025, o.waterY - .095 + (cast ? .12 : 0), .025);
      const lead = add(foot, point(.002, -(o.floatToSwivel - coordinate), 0));
      const ring = add(lead, point(0, -coordinate, 0));
      nodes = [foot, add(foot, point(0, FL, 0)), lead, ring,
        add(ring, point(-.009, -o.leaderLengths[0] + .001, 0)), add(ring, point(.009, -o.leaderLengths[1] + .001, .003))];
      velocities = nodes.map(() => point());
      lastInteraction = emptyInteraction();
      last = { wind: 0, upper: 0, lower: 0, leaders: [0, 0], support: 0, rod: point() };
      return api;
    }
    function integrate(h, interaction) {
      const l = loads(), old = nodes.map(copy), inv = l.effective.map(m => 1 / Math.max(m, 1e-6));
      applyInteraction(l, interaction);
      const tensions = [0, 0, 0, 0, 0];
      let support = 0, rod = point(0, l.rodLoad, 0);
      for (let i = 0; i < nodes.length; i++) {
        const speed = norm(velocities[i]);
        const drag = (i < 2 ? .0015 : i === 2 ? .004 : .0008) + .002 * speed;
        velocities[i] = add(scale(velocities[i], 1 / (1 + drag * h * inv[i])), scale(l.f[i], h * inv[i]));
        nodes[i] = add(nodes[i], scale(velocities[i], h));
      }
      function segment(a, b, length, index, rigid) {
        const pa = a < 0 ? o.rodTip : a === 3 && b >= 4 ? leaderAnchor() : nodes[a], delta = sub(nodes[b], pa), d = norm(delta);
        const error = d - length;
        if ((!rigid && error <= 0) || d < 1e-12) return;
        const ia = a < 0 ? 0 : inv[a], ib = inv[b], lambda = error / (ia + ib), u = scale(delta, 1 / d);
        if (a >= 0) nodes[a] = add(nodes[a], scale(u, lambda * ia));
        nodes[b] = add(nodes[b], scale(u, -lambda * ib));
        if (index >= 0) tensions[index] += lambda / (h * h);
        if (a < 0) rod = add(rod, scale(u, -lambda / (h * h)));
      }
      function pulley() {
        const u0 = sub(nodes[0], nodes[2]), u1 = sub(nodes[3], nodes[2]), a = norm(u0), b = norm(u1);
        const excess = a + b - o.floatToSwivel;
        if (excess <= 0 || a < 1e-10 || b < 1e-10) return;
        const ga = scale(u0, 1 / a), gb = scale(u1, 1 / b), gl = scale(add(ga, gb), -1);
        const denom = inv[0] + inv[3] + inv[2] * norm(gl) ** 2;
        const lambda = excess / denom;
        nodes[0] = add(nodes[0], scale(ga, -lambda * inv[0]));
        nodes[3] = add(nodes[3], scale(gb, -lambda * inv[3]));
        nodes[2] = add(nodes[2], scale(gl, -lambda * inv[2]));
        tensions[1] += lambda / h ** 2; tensions[2] += lambda / h ** 2;
      }
      const radii = [.001, .001, leadFloorRadius(), .009, o.hookExtent, o.hookExtent];
      for (let it = 0; it < 24; it++) {
        segment(0, 1, FL, -1, true);
        segment(-1, 0, o.mainLength - o.floatToSwivel, 0);
        if (o.leadLocked) {
          segment(0, 2, o.floatToSwivel - o.leadAboveSwivel, 1);
          segment(2, 3, o.leadAboveSwivel, 2);
        } else {
          pulley();
          segment(0, 2, o.floatToSwivel - o.leadAboveSwivel, 1);
          segment(2, 3, o.leadAboveSwivel + o.leadTravel, 2);
        }
        segment(3, 4, o.leaderLengths[0], 3); segment(3, 5, o.leaderLengths[1], 4);
        // Bait balls cannot overlap each other; hook positions are leader attachment points.
        const delta = sub(nodes[5], nodes[4]), d = norm(delta), min = 2 * o.baitRadius;
        if (d < min && min > 0) {
          const u = d > 1e-10 ? scale(delta, 1 / d) : point(1, 0, 0), correction = (min - d) / (inv[4] + inv[5]);
          nodes[4] = add(nodes[4], scale(u, -correction * inv[4])); nodes[5] = add(nodes[5], scale(u, correction * inv[5]));
        }
        for (let i = 0; i < 6; i++) {
          const penetration = o.bottomY + radii[i] - nodes[i].y;
          if (penetration > 0) { nodes[i].y += penetration; support += penetration / inv[i] / h ** 2; }
        }
        // Prevent the wider spindle from cutting the bed if the float lies sideways.
        for (const b of bins) {
          const p = mix(nodes[0], nodes[1], b.t), radius = P.radius((1 - b.t) * FL);
          const penetration = o.bottomY + radius * Math.sqrt(Math.max(0, 1 - ((nodes[1].y - nodes[0].y) / FL) ** 2)) - p.y;
          if (penetration > 0) {
            const w0 = 1 - b.t, w1 = b.t, lam = penetration / (inv[0] * w0 ** 2 + inv[1] * w1 ** 2);
            nodes[0].y += lam * inv[0] * w0; nodes[1].y += lam * inv[1] * w1; support += lam / h ** 2;
          }
        }
      }
      if (!o.leadLocked) {
        const upper = distance(nodes[0], nodes[2]), lower = distance(nodes[2], nodes[3]);
        // Slack material slides down the main under gravity, with viscous water drag.
        slideVelocity = (slideVelocity - G * h) / (1 + 30 * h);
        const lo = Math.max(o.leadAboveSwivel, lower), hi = Math.min(o.leadAboveSwivel + o.leadTravel, o.floatToSwivel - upper);
        coordinate = clamp(coordinate + slideVelocity * h, Math.min(lo, hi), Math.max(lo, hi));
        coordinate = clamp(coordinate, o.leadAboveSwivel, o.leadAboveSwivel + o.leadTravel);
        if (coordinate <= lo || coordinate >= hi) slideVelocity = 0;
      } else coordinate = o.leadAboveSwivel;
      velocities = nodes.map((p, i) => scale(sub(p, old[i]), 1 / h));
      // Inelastic bed contact supplies friction; no equilibrium snapping or energy injection.
      nodes.forEach((p, i) => { if (p.y <= o.bottomY + radii[i] + 1e-7) { velocities[i].x *= .92; velocities[i].z *= .92; } });
      last = { wind: tensions[0], upper: tensions[1], lower: tensions[2], leaders: tensions.slice(3), support, rod };
      time += h;
    }
    function step(dt, interaction) {
      if (!Number.isFinite(dt) || dt < 0 || dt > 60) throw new RangeError('dt must be finite and in [0,60] seconds');
      const input = interactionInput(interaction), n = Math.ceil(dt * 240);
      if (!n) lastInteraction = emptyInteraction();
      // The supplied forces are held constant over dt; leader tautness is tested
      // afresh at each original <=1/240s substep, before predicting positions.
      for (let i = 0; i < n; i++) integrate(dt / n, input);
      return api;
    }
    function settle(seconds = 20) {
      if (!Number.isFinite(seconds) || seconds < 0 || seconds > 600) throw new RangeError('settle seconds must be in [0,600]');
      let remaining = seconds;
      while (remaining > 1e-10) { const dt = Math.min(1, remaining); step(dt); remaining -= dt; }
      return snapshot();
    }
    function configure(patch) {
      const p = patch || {};
      o = normalize(Object.assign({}, o, p, { rodTip: Object.assign({}, o.rodTip, p.rodTip || {}) }));
      coordinate = clamp(coordinate, o.leadAboveSwivel, o.leadAboveSwivel + (o.leadLocked ? 0 : o.leadTravel));
      return api;
    }
    // No loads(), hydrostatics, cable curves, or marker construction here: fish
    // behavior reads this once per 1/240s step. All returned data are detached.
    function getInteractionState() {
      return { time, nodes: { floatFoot: copy(nodes[0]), floatTop: copy(nodes[1]),
        lead: copy(nodes[2]), swivel: copy(nodes[3]), leaderAnchor: leaderAnchor(),
        hooks: [copy(nodes[4]), copy(nodes[5])], rod: copy(o.rodTip) },
        velocities: { hooks: [copy(velocities[4]), copy(velocities[5])] },
        options: Object.assign({}, o, { leaderLengths: o.leaderLengths.slice(), rodTip: copy(o.rodTip) }),
        velocityY: velocities[0].y };
    }
    function snapshot() {
      const l = loads(), strands = l.strands, axis = sub(nodes[1], nodes[0]);
      const c = { hooks: [4, 5].map(i => nodes[i].y <= o.bottomY + o.hookExtent + 1e-4),
        lead: nodes[2].y <= o.bottomY + leadFloorRadius() + 1e-4,
        float: Math.min(nodes[0].y, nodes[1].y) <= o.bottomY + .006 };
      const pointAlong = (ps, fraction) => {
        let total = 0; const ls = ps.slice(1).map((p, i) => { const d = distance(p, ps[i]); total += d; return d; });
        let target = clamp(fraction, 0, 1) * total;
        for (let i = 0; i < ls.length; i++) { if (target <= ls[i]) return mix(ps[i], ps[i + 1], ls[i] ? target / ls[i] : 0); target -= ls[i]; }
        return copy(ps[ps.length - 1]);
      };
      // Both beans are material-coordinate markers, NOT a terminal connection.
      const fullMain = strands[1].points.concat(strands[2].points.slice(1));
      const lowerStop = pointAlong(fullMain, 1 - (o.leadAboveSwivel - .012) / o.floatToSwivel);
      const upperStop = pointAlong(fullMain, 1 - (o.leadAboveSwivel + (o.leadLocked ? 0 : o.leadTravel) + .012) / o.floatToSwivel);
      const weightN = l.totalMass * G, buoyancyN = o.waterDensity * l.volume * G;
      const residual = buoyancyN - weightN + last.support + last.rod.y + l.surfaceSupport;
      const errors = [Math.abs(norm(axis) - FL), ...strands.map((s, i) => {
        const ends = [[o.rodTip, nodes[0]], [nodes[0], nodes[2]], [nodes[2], nodes[3]], [leaderAnchor(), nodes[4]], [leaderAnchor(), nodes[5]]][i];
        return Math.max(0, distance(...ends) - s.length);
      })];
      return { options: json(o), time, nodes: { rod: copy(o.rodTip), floatFoot: copy(nodes[0]), floatTop: copy(nodes[1]), lead: copy(nodes[2]),
        swivel: copy(nodes[3]), leaderAnchor: leaderAnchor(), hooks: [copy(nodes[4]), copy(nodes[5])] },
        curves: { wind: strands[0].points, upper: strands[1].points, lower: strands[2].points, leaders: strands.slice(3).map(s => s.points) },
        markers: { floatStops: [.010, .006].map(d => pointAlong(strands[0].points, 1 - d / strands[0].length))
          .concat([.006, .010].map(d => pointAlong(strands[1].points, d / strands[1].length))), leadStops: [upperStop, lowerStop] },
        leadCoordinate: coordinate, velocityY: velocities[0].y, velocities: velocities.map(copy),
        lastInteraction: json(lastInteraction),
        evaluation: { buoyancyN, weightN, bottomSupportN: last.support, rodReaction: copy(last.rod), rodTensionN: norm(last.rod),
          surfaceSupportN: l.surfaceSupport, windSurfaceLength: strands[0].surfaceLength,
          lineMassG: l.lineMass * 1000, lineBuoyancyG: o.waterDensity * l.lineWet * 1000,
          lineApparentMassG: (l.lineMass - o.waterDensity * l.lineWet) * 1000,
          floatDisplacedVolume: l.floatVolume, displacedVolume: l.volume,
          exposureM: Math.max(0, nodes[1].y - o.waterY), tiltRad: Math.acos(clamp(axis.y / Math.max(norm(axis), 1e-12), -1, 1)),
          staticResidualN: Math.hypot(last.rod.x, residual, last.rod.z),
          status: c.float ? 'sunk' : c.lead ? 'lead-bottom' : c.hooks.some(Boolean) ? 'hooks-bottom' : nodes[1].y < o.waterY ? 'submerged' : 'floating',
          contacts: c, tension: { wind: norm(last.rod), upper: last.upper, lower: last.lower, leaders: last.leaders.slice() },
          maxLengthError: Math.max(...errors), options: json(o) } };
    }
    const api = { get options() { return json(o); }, configure, reset, step, settle, snapshot, getInteractionState,
      get velocities() { return velocities.map(copy); } };
    reset(); return api;
  }
  return Object.freeze({ defaults, normalize, create, floatSubmersion });
});
