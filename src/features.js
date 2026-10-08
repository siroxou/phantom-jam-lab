// Forecast features shared by the dataset script and the web page,
// so the model sees identical inputs in training and in the browser.

// One snapshot of the loop. The page and the dataset take one every 0.5 s of simulated time.
function takeSample(sim) {
  const N = sim.N; let m = 0;
  for (let i = 0; i < N; i++) m += sim.v[i];
  m /= N;
  let q = 0, gm = 0, minGap = Infinity, maxDecel = 0, smooth = 0, copy = 0;
  const gaps = new Array(N);
  for (let i = 0; i < N; i++) {
    q += (sim.v[i] - m) ** 2;
    gaps[i] = sim.gapOf(i); gm += gaps[i];
    if (gaps[i] < minGap) minGap = gaps[i];
    if (-sim.acc[i] > maxDecel) maxDecel = -sim.acc[i];
    if (sim.kind[i] === 'smooth') smooth++; else if (sim.kind[i] === 'copycat') copy++;
  }
  gm /= N;
  let gq = 0; for (let i = 0; i < N; i++) gq += (gaps[i] - gm) ** 2;
  return { t: sim.t, mean: m, sd: Math.sqrt(q / (N - 1)), gapSd: Math.sqrt(gq / (N - 1)), minGap, maxDecel,
           smoothFrac: smooth / N, copyFrac: copy / N, density: (N / sim.L) * 1000 };
}

const WIN = 40, RECENT = 10; // 20 s and 5 s of samples

// The 9 model inputs at sample k, built from the last 20 s. Null until 20 s of samples exist.
function jamFeatures(S, k) {
  if (k < WIN - 1) return null;
  const a = k - WIN + 1;
  let sd5 = 0, gap5 = 0, mean5 = 0;
  for (let j = k - RECENT + 1; j <= k; j++) { sd5 += S[j].sd; gap5 += S[j].gapSd; mean5 += S[j].mean; }
  sd5 /= RECENT; gap5 /= RECENT; mean5 /= RECENT;
  let minGap = Infinity, maxDecel = 0, st = 0, ss = 0, stt = 0, sts = 0;
  for (let j = a; j <= k; j++) {
    if (S[j].minGap < minGap) minGap = S[j].minGap;
    if (S[j].maxDecel > maxDecel) maxDecel = S[j].maxDecel;
    const tt = (j - a) * 0.5; st += tt; ss += S[j].sd; stt += tt * tt; sts += tt * S[j].sd;
  }
  const n = WIN, slope = (n * sts - st * ss) / (n * stt - st * st);
  return { sd5, sdSlope: slope, gapSd5: gap5, minGap20: minGap, maxDecel20: maxDecel, mean5,
           smoothFrac: S[k].smoothFrac, copyFrac: S[k].copyFrac, density: S[k].density };
}

// True if any sample in the last 20 s had a stop-and-go wave (speed spread above 2.5 m/s).
function waveNow(S, k) { for (let j = Math.max(0, k - WIN + 1); j <= k; j++) if (S[j].sd > 2.5) return true; return false; }

// Logistic regression from model/model.json: the chance a jam starts within the next 60 s.
function jamRisk(f, M) {
  let z = M.intercept;
  M.features.forEach((name, i) => { z += M.coef[i] * (f[name] - M.mean[i]) / M.scale[i]; });
  return 1 / (1 + Math.exp(-z));
}

if (typeof module !== 'undefined') module.exports = { takeSample, jamFeatures, waveNow, jamRisk, WIN };
