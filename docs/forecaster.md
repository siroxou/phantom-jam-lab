# Jam forecaster (model card)

The risk gauge in the lab estimates the chance that a stop-and-go wave starts within the next 60 seconds, using the last 20 seconds of traffic. It is a logistic regression trained on simulated traffic only.

## Training data

`npm run dataset` builds 2,500 runs of 330 s each, randomizing every run:

- Crowding: 20 to 24 cars on the 260 m loop.
- Driver acceleration: a range 0.6 m/s² wide, starting between 0.9 and 1.4 m/s².
- Driver noise: 0.1 to 0.5 m/s².
- AI cars: none in 80 percent of runs, otherwise 1 or 2 (three quarters smoothing, one quarter copycat).
- Brake tap: in 60 percent of runs, at a random time between 5 and 205 s, lasting 0.5 to 2.5 s.

From 30 s on, the script takes a window every 15 s. Windows with a wave anywhere in the last 20 s are skipped, since the point is to forecast from calm traffic. Each remaining window is labeled 1 if the spread of speeds across cars tops 2.5 m/s within the next 60 s. That gives 32,195 windows, 4,653 of them (14 percent) followed by a jam. The script is deterministic, so it writes the same CSV every time.

## Features

| Feature | Meaning |
| --- | --- |
| `sd5` | Spread of speeds across cars, averaged over the last 5 s (m/s) |
| `sdSlope` | How fast that spread grew over the last 20 s (m/s per s) |
| `gapSd5` | Spread of the gaps between cars, last 5 s (m) |
| `minGap20` | Tightest gap anywhere in the loop, last 20 s (m) |
| `maxDecel20` | Hardest braking anywhere in the loop, last 20 s (m/s²) |
| `mean5` | Average speed, last 5 s (m/s) |
| `smoothFrac` | Share of cars that are smoothing AI |
| `copyFrac` | Share of cars that are copycat AI |
| `density` | Cars per km |

The same code computes these in training and in the browser: [`src/features.js`](../src/features.js).

## Training and testing

Windows are split by run, 80/20, so no test window comes from a run the model trained on: 25,709 training windows and 6,486 test windows. [`model/train.py`](../model/train.py) compares three forecasters on the test set.

| Forecaster | AUC | Precision | Recall |
| --- | --- | --- | --- |
| Rule of thumb: speed spread above 1.5 m/s | 0.70 | 46% | 50% |
| Logistic regression, alert at 25% risk (used in the lab) | 0.82 | 48% | 65% |
| Gradient boosting, alert at 30% risk | 0.83 | 58% | 56% |

AUC runs from 0.5 (a coin flip) to 1.0 (perfect). Precision is the share of alerts that were followed by a jam, and recall is the share of jams that got an alert.

Gradient boosting scores slightly higher, but the logistic regression ships in the page because it is nine weights and one formula, easy to embed and easy to explain. An earlier version used class weighting, which pushed every percentage up. The shipped model is unweighted, so the gauge reads as real odds.

## What it learned

Standardized coefficients. A larger magnitude means more influence, and a positive sign raises the risk.

| Feature | Weight |
| --- | --- |
| Tightest gap (`minGap20`) | -0.91 |
| Average speed (`mean5`) | -0.63 |
| Density (`density`) | -0.57 |
| Share of smoothing AI (`smoothFrac`) | -0.49 |
| Growth of the speed spread (`sdSlope`) | +0.31 |
| Speed spread (`sd5`) | +0.19 |
| Share of copycat AI (`copyFrac`) | +0.17 |
| Spread of gaps (`gapSd5`) | -0.05 |
| Hardest braking (`maxDecel20`) | -0.03 |

A tight gap somewhere in the loop and slow, wobbling traffic raise the risk. Smoothing AI lowers it and copycat AI raises it. The negative weight on density looks backward and is probably a selection effect: in the most crowded runs jams start early, so the calm windows that survive the filter come from their most stable stretches.

## Field test

`npm run forecast-check` runs 300 fresh loops at the lab's default settings: 22 cars, no AI, one brake tap between 20 and 119 s. Of those, 250 jammed, and the forecaster warned before all 250, a median of 41 s ahead (middle half 12 to 85 s). It also warned in 48 of the 50 runs that never jammed. On a loop this crowded the warning is nearly always on, so it says little there. The test-set numbers above, measured across varied conditions, are the fairer score.

## Limitations

- It has only ever seen this simulator, never real traffic.
- The 60 s horizon and the 25 percent alert level are choices. A lower alert level catches more jams and raises more false alarms.
- Phantom jams grow out of small random wobbles, so some of what it misses was never predictable from the last 20 s.

## Retrain

```bash
npm run dataset
pip install -r requirements.txt
npm run train
npm run build
```

`train.py` prints the comparison table and writes `model/model.json`, which `build.js` inlines into `index.html`.
