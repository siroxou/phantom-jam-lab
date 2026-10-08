// Run with `npm test` (Node's built-in test runner, no dependencies).
const test = require('node:test');
const assert = require('node:assert/strict');
const { createSim } = require('../src/sim.js');
const { takeSample, jamFeatures, jamRisk } = require('../src/features.js');
const model = require('../model/model.json');

// Drive one loop with the same brake tap the experiments use (car 3, 2 s, at t = 3 s).
function drive(opts, seconds, onStep) {
  const s = createSim(opts);
  for (let k = 0; k < Math.round(seconds / s.dt); k++) {
    if (k === 30) s.tapCar(3, 2.0);
    s.step();
    if (onStep) onStep(s, k);
  }
  return s;
}
const spread = v => {
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1));
};
const peakSpread = (opts, fromStep) => {
  let peak = 0;
  drive(opts, 600, (s, k) => { if (k >= fromStep) peak = Math.max(peak, spread(Array.from(s.v))); });
  return peak;
};

test('same seed gives the same traffic', () => {
  assert.deepEqual(Array.from(drive({ seed: 7 }, 120).x), Array.from(drive({ seed: 7 }, 120).x));
});

test('cars never overlap, in any setup', () => {
  for (const [numAI, aiStyle] of [[0, 'smooth'], [1, 'smooth'], [1, 'copycat'], [22, 'copycat'], [22, 'smooth']])
    for (const seed of [1, 2, 3]) assert.equal(drive({ numAI, aiStyle, seed }, 600).contacts, 0, `${numAI} ${aiStyle}, seed ${seed}`);
});

test('a brake tap turns an all-human loop into a stop-and-go wave', () => {
  for (const seed of [1, 2, 3, 4, 5]) assert.ok(peakSpread({ seed }, 0) > 2.5, `seed ${seed}`);
});

test('one smoothing AI car keeps the loop below the wave threshold', () => {
  for (const seed of [1, 2, 3]) assert.ok(peakSpread({ seed, numAI: 1, aiStyle: 'smooth' }, 3000) < 2.5, `seed ${seed}`);
});

test('one copycat cruise-control car does not fix the jam', () => {
  for (const seed of [1, 2, 3]) assert.ok(peakSpread({ seed, numAI: 1, aiStyle: 'copycat' }, 3000) > 2.5, `seed ${seed}`);
});

test('forecaster needs 20 s of history, then returns a probability', () => {
  const s = createSim({ seed: 1 }), S = [];
  for (let k = 1; k <= 600; k++) { s.step(); if (k % 5 === 0) S.push(takeSample(s)); }
  assert.equal(jamFeatures(S, 38), null);
  const f = jamFeatures(S, S.length - 1);
  for (const name of model.features) assert.ok(Number.isFinite(f[name]), name);
  const p = jamRisk(f, model);
  assert.ok(p > 0 && p < 1, `risk ${p}`);
});
