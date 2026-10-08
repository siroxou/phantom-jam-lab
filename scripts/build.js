// Builds index.html: inlines the simulation, the forecast features and the trained model into src/template.html.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const stripExports = src => src.replace(/^if \(typeof module !== 'undefined'\).*$/m, '').trim();
const { features, mean, scale, coef, intercept } = JSON.parse(read('model/model.json'));

const html = read('src/template.html')
  .replace('/*SIM*/', () => stripExports(read('src/sim.js')))
  .replace('/*FEATURES*/', () => stripExports(read('src/features.js')))
  .replace('/*MODEL*/', () => JSON.stringify({ features, mean, scale, coef, intercept }));
fs.writeFileSync(path.join(root, 'index.html'), html);
console.log(`index.html written (${(html.length / 1024).toFixed(1)} KB)`);
