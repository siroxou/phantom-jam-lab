// Field test for the forecaster on the lab's default loop (22 cars, no AI), using 300 runs it never trained on.
// Reports how often it warned before a jam, how early, and how often it warned when no jam came.
const { createSim } = require('../src/sim.js');
const { takeSample, jamFeatures, waveNow, jamRisk } = require('../src/features.js');
const model = require('../model/model.json');

const leads = [];
let missed = 0, calm = 0, falseAlarms = 0;
for (let run = 0; run < 300; run++) {
  const sim = createSim({ seed: 9000 + run });
  const tapT = 20 + ((run * 37) % 100), S = [];
  let onset = null, firstAlert = null;
  for (let k = 1; k <= 3300; k++) {
    if (Math.abs(sim.t - tapT) < 0.05) sim.tapCar(run % 22, 0.5 + (run % 5) * 0.4);
    sim.step();
    if (k % 5 !== 0) continue;
    S.push(takeSample(sim));
    const i = S.length - 1;
    if (onset === null && S[i].sd > 2.5) onset = S[i].t;
    if (onset === null && firstAlert === null && i >= 39 && !waveNow(S, i) && jamRisk(jamFeatures(S, i), model) >= model.alert) firstAlert = S[i].t;
  }
  if (onset === null) { calm++; if (firstAlert !== null) falseAlarms++; }
  else if (firstAlert !== null) leads.push(onset - firstAlert);
  else missed++;
}
leads.sort((a, b) => a - b);
const q = p => leads[Math.floor(p * (leads.length - 1))].toFixed(0);
console.log(`Runs that jammed: ${leads.length + missed}. Warned in advance: ${leads.length}. Missed: ${missed}.`);
console.log(`Warning time before the jam: median ${q(0.5)} s, middle half ${q(0.25)} to ${q(0.75)} s.`);
console.log(`Runs that never jammed: ${calm}. False alarms in ${falseAlarms} of them.`);
