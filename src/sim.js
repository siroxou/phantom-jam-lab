// Phantom Jam Lab: ring-road car-following simulation.
// Humans: Intelligent Driver Model (Treiber et al. 2000) + small random "attention" noise.
// Smooth AI: PI-with-saturation idea from Stern et al. 2018 (drive your own average speed, keep a buffer).
// Copycat AI: delayed OVRV cruise control like the string-unstable ACC models in Gunter et al. (2019 preprint).

function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand) {
  let u = 0, v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const DEFAULTS = {
  N: 22,
  L: 260,          // meters, same loop size as the Tucson experiment
  carLen: 5,       // meters
  dt: 0.1,         // seconds
  numAI: 0,
  aiStyle: 'smooth', // 'smooth' | 'copycat'
  seed: 1,
  noise: 0.3,      // m/s^2, std of driver attention noise
  humanA: [1.0, 1.6],
  humanT: [0.6, 0.8],
  humanS0: 1.5,
};

function createSim(options) {
  const o = Object.assign({}, DEFAULTS, options || {});
  const rand = mulberry32(o.seed);
  const N = o.N, L = o.L, dt = o.dt;
  const x = new Float64Array(N), v = new Float64Array(N), acc = new Float64Array(N);
  const noise = new Float64Array(N);
  const kind = new Array(N);
  const p = new Array(N);
  const U = new Float64Array(N), vcmd = new Float64Array(N);
  const delaySteps = Math.round(0.95 / dt);
  const histGap = [], histLead = [];
  const brakeFlag = new Uint8Array(N);
  const perturb = new Float64Array(N); // seconds of forced braking left
  let t = 0, hardBrakes = 0, contacts = 0;

  function aiSlots(k) {
    const s = new Set();
    for (let j = 0; j < k; j++) s.add(Math.floor((j * N) / k));
    return s;
  }

  function setAI(k, style) {
    o.numAI = k; o.aiStyle = style || o.aiStyle;
    const slots = aiSlots(k);
    for (let i = 0; i < N; i++) {
      const prev = kind[i];
      kind[i] = slots.has(i) ? o.aiStyle : 'human';
      if (kind[i] === 'smooth' && prev !== 'smooth') { U[i] = v[i]; vcmd[i] = v[i]; }
    }
  }

  // Equal spacing, everyone rolling at the same speed, like the start of the real experiments.
  const v0start = 7.5;
  for (let i = 0; i < N; i++) {
    x[i] = (i * L) / N + (rand() - 0.5) * 0.4;
    v[i] = v0start;
    p[i] = {
      a: o.humanA[0] + (o.humanA[1] - o.humanA[0]) * rand(),   // comfortable acceleration
      b: 1.5,                                                    // comfortable braking
      T: o.humanT[0] + (o.humanT[1] - o.humanT[0]) * rand(),   // time gap people keep
      s0: o.humanS0,
      v0: 20,                  // speed they would drive on an empty road
    };
  }
  setAI(o.numAI, o.aiStyle);
  for (let s = 0; s <= delaySteps; s++) {
    histGap.push(new Float64Array(N).fill(L / N - o.carLen));
    histLead.push(new Float64Array(N).fill(v0start));
  }

  function gapOf(i) {
    const j = (i + 1) % N;
    let d = x[j] - x[i];
    if (d < 0) d += L;
    return d - o.carLen;
  }

  function idm(vi, gap, vLead, q) {
    const dv = vi - vLead;
    const sStar = q.s0 + Math.max(0, vi * q.T + (vi * dv) / (2 * Math.sqrt(q.a * q.b)));
    return q.a * (1 - Math.pow(vi / q.v0, 4) - Math.pow(sStar / Math.max(gap, 0.2), 2));
  }

  const safeQ = { a: 1.5, b: 3.0, T: 0.5, s0: 2.0, v0: 40 };

  function step() {
    const gaps = new Float64Array(N), leads = new Float64Array(N);
    for (let i = 0; i < N; i++) { gaps[i] = gapOf(i); leads[i] = v[(i + 1) % N]; }
    histGap.push(gaps); histLead.push(leads);
    if (histGap.length > delaySteps + 1) { histGap.shift(); histLead.shift(); }
    const oldGap = histGap[0], oldLead = histLead[0];

    for (let i = 0; i < N; i++) {
      const gap = gaps[i], vl = leads[i], vi = v[i];
      let a;
      if (kind[i] === 'human') {
        a = idm(vi, gap, vl, p[i]);
        noise[i] += (-noise[i] / 2) * dt + o.noise * Math.sqrt(dt) * gaussian(rand);
        a += noise[i];
        if (perturb[i] > 0) { a = Math.min(a, -3.5); perturb[i] -= dt; }
        a = Math.max(-9, Math.min(a, p[i].a * 1.5));
      } else if (kind[i] === 'smooth') {
        // Estimate the average speed of traffic from your own recent speed (about one lap).
        U[i] += ((vi - U[i]) * dt) / 30;
        const gl = 7, gu = 30, vCatch = 1, gamma = 2;
        const vTarget = U[i] + vCatch * Math.min(Math.max((gap - gl) / (gu - gl), 0), 1);
        const dxs = Math.max(4, 2 * (vi - vl));
        const alpha = Math.min(Math.max((gap - dxs) / gamma, 0), 1);
        const beta = 1 - alpha / 2;
        vcmd[i] = beta * (alpha * vTarget + (1 - alpha) * vl) + (1 - beta) * vcmd[i];
        const err = vcmd[i] - vi;
        a = err > 0 ? 0.6 * err : 1.2 * err;
        a = Math.min(a, idm(vi, gap, vl, safeQ));
        if (perturb[i] > 0) { a = Math.min(a, -3.5); perturb[i] -= dt; }
        a = Math.max(-6, Math.min(a, 1.5));
      } else {
        // Copycat cruise control: reacts to a delayed reading of the gap and the car ahead.
        const k1 = 0.05, k2 = 0.34, th = 0.8, eta = 2.0;
        a = k1 * (oldGap[i] - eta - th * vi) + k2 * (oldLead[i] - vi) + 0.05 * gaussian(rand);
        // Collision avoidance braking, like the automatic emergency braking real cars carry.
        a = Math.min(a, idm(vi, gap, vl, safeQ));
        if (perturb[i] > 0) { a = Math.min(a, -3.5); perturb[i] -= dt; }
        a = Math.max(-8, Math.min(a, 2.0));
      }
      acc[i] = a;
    }

    for (let i = 0; i < N; i++) {
      let vn = v[i] + acc[i] * dt;
      if (vn < 0) vn = 0;
      const wasBraking = brakeFlag[i];
      const hard = acc[i] < -2.0 && v[i] > 0.5;
      if (hard && !wasBraking) hardBrakes++;
      brakeFlag[i] = hard ? 1 : (acc[i] > -1.0 ? 0 : brakeFlag[i]);
      x[i] = (x[i] + 0.5 * (v[i] + vn) * dt) % L;
      v[i] = vn;
    }
    // Contact guard: never let a car overlap the one ahead.
    for (let i = 0; i < N; i++) {
      const g = gapOf(i);
      if (g < 0.3) {
        const j = (i + 1) % N;
        x[i] = (x[j] - o.carLen - 0.3 + L) % L;
        v[i] = Math.min(v[i], v[j]);
        contacts++;
      }
    }
    t += dt;
  }

  function tapCar(i, secs) { perturb[i] = secs || 1.5; }
  function tapBrakes() {
    // A random human driver taps the brakes hard for 1.5 seconds.
    const humans = [];
    for (let i = 0; i < N; i++) if (kind[i] === 'human') humans.push(i);
    if (!humans.length) return -1;
    const i = humans[Math.floor(rand() * humans.length)];
    perturb[i] = 1.5;
    return i;
  }

  return {
    step, setAI, tapBrakes, tapCar, gapOf,
    get t() { return t; },
    get hardBrakes() { return hardBrakes; },
    get contacts() { return contacts; },
    x, v, acc, kind, N, L, dt, carLen: o.carLen,
  };
}

if (typeof module !== 'undefined') module.exports = { createSim };
