// Builds the forecaster's training data: 2,500 randomized runs -> data/jam_windows.csv.
// Each row is one calm 20 s stretch of traffic, labeled 1 if a jam starts in the next 60 s.
// Deterministic, so it writes the same file every time. Takes about 45 s.
const fs = require('fs');
const path = require('path');
const { createSim } = require('../src/sim.js');
const { takeSample, jamFeatures, waveNow } = require('../src/features.js');

let r = 12345; // fixed seed for the scenario generator
const rnd = () => { r = (r * 1103515245 + 12345) % 2147483648; return r / 2147483648; };

const cols = ['run', 't', 'sd5', 'sdSlope', 'gapSd5', 'minGap20', 'maxDecel20', 'mean5', 'smoothFrac', 'copyFrac', 'density', 'label'];
const rows = [cols.join(',')];
let jams = 0;

for (let run = 0; run < 2500; run++) {
  const N = 20 + Math.floor(rnd() * 5);                  // 20 to 24 cars, so crowding varies
  const lo = 0.9 + 0.5 * rnd();                          // driver acceleration range [lo, lo + 0.6] m/s^2
  const pAI = rnd();
  const numAI = pAI < 0.2 ? 1 + Math.floor(rnd() * 2) : 0;
  const style = pAI < 0.2 ? (rnd() < 0.75 ? 'smooth' : 'copycat') : 'smooth';
  const sim = createSim({ N, seed: 1000 + run, humanA: [lo, lo + 0.6], noise: 0.1 + 0.4 * rnd(), numAI, aiStyle: style });
  const tapT = rnd() < 0.6 ? 5 + rnd() * 200 : -1, tapLen = 0.5 + 2 * rnd(), tapCar = Math.floor(rnd() * N);
  const S = [];
  for (let k = 1; k <= 3300; k++) {                      // 330 s per run
    if (tapT > 0 && Math.abs(sim.t - tapT) < sim.dt / 2) sim.tapCar(tapCar, tapLen);
    sim.step();
    if (k % 5 === 0) S.push(takeSample(sim));
  }
  for (let k = 59; k + 120 < S.length; k += 30) {        // one window every 15 s, from t = 30 s
    if (waveNow(S, k)) continue;                         // only forecast from calm traffic
    const f = jamFeatures(S, k);
    let label = 0;
    for (let j = k + 1; j <= k + 120; j++) if (S[j].sd > 2.5) { label = 1; break; }
    jams += label;
    rows.push([run, S[k].t.toFixed(1), ...cols.slice(2, 11).map(c => f[c].toFixed(4)), label].join(','));
  }
}

const out = path.join(__dirname, '..', 'data', 'jam_windows.csv');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, rows.join('\n'));
console.log(`${rows.length - 1} windows written to data/jam_windows.csv (${jams} followed by a jam)`);
