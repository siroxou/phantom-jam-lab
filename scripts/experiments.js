// Reruns the results tables in docs/results.md.
//   node scripts/experiments.js              6 driver setups x 10 seeds (about 5 s)
//   node scripts/experiments.js --calibrate  driver-setting sweep used to match the Tucson experiment
// Each run lasts 10 minutes of simulated time and is measured over its last 5 minutes.
const { createSim } = require('../src/sim.js');

const MPH = 2.23694, SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function run(opts, tap) {
  const s = createSim(opts);
  let sum = 0, sum2 = 0, n = 0, stopped = 0, brakesAtWarmup = 0;
  for (let k = 0; k < 6000; k++) {
    if (tap && k === 30) s.tapCar(3, 2.0); // car 3 brakes hard for 2 s at t = 3 s
    s.step();
    if (k === 3000) brakesAtWarmup = s.hardBrakes;
    if (k > 3000) for (let i = 0; i < s.N; i++) { sum += s.v[i]; sum2 += s.v[i] ** 2; n++; if (s.v[i] < 0.5) stopped++; }
  }
  const mean = sum / n;
  return { avg: mean * MPH, swing: Math.sqrt(sum2 / n - mean * mean) * MPH,
           brakes: (s.hardBrakes - brakesAtWarmup) / 5, stopped: (100 * stopped) / n };
}

function row(label, opts, tap = true) {
  const rs = SEEDS.map(seed => run({ ...opts, seed }, tap));
  const avg = k => rs.reduce((a, r) => a + r[k], 0) / rs.length;
  return `| ${label} | ${avg('avg').toFixed(1)} | ${avg('swing').toFixed(1)} | ${avg('brakes').toFixed(0)} | ${avg('stopped').toFixed(0)} |`;
}

const header = '| Who is driving | Average speed (mph) | Speed swing (mph) | Hard brakes per minute | Time stopped (%) |\n| --- | --- | --- | --- | --- |';

if (process.argv.includes('--calibrate')) {
  // No brake tap here, so waves have to grow out of driver noise alone.
  for (const humanA of [[0.8, 1.2], [0.9, 1.4], [1.0, 1.5], [1.0, 1.6]]) {
    console.log(`\nDriver acceleration ${humanA[0]} to ${humanA[1]} m/s^2\n${header}`);
    console.log(row('All 22 human', { humanA }, false));
    console.log(row('1 smoothing AI car', { humanA, numAI: 1, aiStyle: 'smooth' }, false));
  }
} else {
  console.log(header);
  console.log(row('All 22 human', {}));
  console.log(row('1 smoothing AI car', { numAI: 1, aiStyle: 'smooth' }));
  console.log(row('2 smoothing AI cars', { numAI: 2, aiStyle: 'smooth' }));
  console.log(row('1 copycat car', { numAI: 1, aiStyle: 'copycat' }));
  console.log(row('All 22 copycat', { numAI: 22, aiStyle: 'copycat' }));
  console.log(row('All 22 smoothing AI', { numAI: 22, aiStyle: 'smooth' }));
}
