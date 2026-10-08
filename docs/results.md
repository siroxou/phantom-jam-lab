# Results

Every number here comes from `npm run experiments` and `npm run calibrate`. Each row averages 10 runs (seeds 1 to 10). A run lasts 10 minutes of simulated time and is measured over its last 5 minutes.

## How the AI drives matters more than how many AI cars there are

In the main experiment, car 3 brakes hard for 2 s at t = 3 s, which reliably starts a jam in an all-human loop.

| Who is driving | Average speed (mph) | Speed swing (mph) | Hard brakes per minute | Time stopped (%) |
| --- | --- | --- | --- | --- |
| All 22 human | 10.4 | 8.8 | 44 | 25 |
| 1 smoothing AI car | 16.1 | 1.2 | 0 | 0 |
| 2 smoothing AI cars | 16.0 | 0.8 | 0 | 0 |
| 1 copycat car | 9.6 | 9.2 | 46 | 32 |
| All 22 copycat | 4.4 | 8.8 | 22 | 72 |
| All 22 smoothing AI | 9.7 | 0.9 | 0 | 0 |

One smoothing car, under 5 percent of the loop, removes the wave. A second one tightens the speed swing further. A single copycat car makes things slightly worse, and a loop made entirely of copycats is the worst setup tested, with cars stopped almost three quarters of the time.

A loop made entirely of smoothing cars is smooth but slow. Each car only copies its own past average speed, so after the brake tap the loop settles at whatever pace the slowdown left behind, and no one is left to pull it back up. The 100-car test on I-24 near Nashville in 2022 gave its cars speed targets based on wider traffic conditions, which is one way around this.

## Compared with the real experiment

Stern et al. (2018) ran 21 to 22 cars on a 260 m ring in Tucson with one automated car. Across their three experiments, the automated car cut the speed spread by 50 to 81 percent, cut fuel use by 22 to 43 percent, and changed throughput by -2.5 to +14 percent. In their best run the spread fell from 3.31 to 0.64 m/s (7.4 to 1.4 mph).

In the lab, one smoothing car cuts the swing by 86 percent (8.8 to 1.2 mph) and raises average speed by 55 percent (10.4 to 16.1 mph). The direction matches. The speed gain is much larger than Tucson's, likely because the simulated drivers stop completely more often than the real ones did. The lab does not model fuel.

## Calibration

The human-driver settings were chosen by running the loop with no brake tap, so waves had to grow out of driver noise alone, and comparing one smoothing AI car against an all-human loop.

| Driver acceleration (m/s²) | All human: average (mph) | All human: swing (mph) | 1 AI car: average (mph) | 1 AI car: swing (mph) | Speed gain |
| --- | --- | --- | --- | --- | --- |
| 0.8 to 1.2 | 8.3 | 8.5 | 14.0 | 3.2 | +69% |
| 0.9 to 1.4 | 9.3 | 8.8 | 15.8 | 1.6 | +70% |
| 1.0 to 1.5 | 11.7 | 7.6 | 16.0 | 1.3 | +37% |
| 1.0 to 1.6 | 13.3 | 6.0 | 16.1 | 1.2 | +21% |

The first settings tried, 0.8 to 1.2 m/s², made one AI car look far too strong. The lab uses 1.0 to 1.6 m/s², where the swing drops from 6.0 to 1.2 mph, close to Tucson's 7.4 to 1.4 mph, and the speed gain of 21 percent sits nearest Tucson's best of 14 percent.

## Bugs caught along the way

- The first copycat model let cars drive into the car ahead, 558 times per run on average across 5 runs. It now has a collision-avoidance floor like automatic emergency braking, and `npm test` checks that no car ever overlaps another.
- At first a loop of 22 copycats never jammed, because every car started perfectly spaced and the model had no noise. Starting positions now get up to 0.2 m of jitter, and the copycat gets small sensor noise.
- In the page, switching a car from copycat to smoothing left its target speed at zero, so it would have stopped dead. `setAI` now resets the target whenever a car becomes a smoothing AI.
- On phones, the results table pushed the page wider than the screen. The grid columns now use `minmax(0, 1fr)`.

## Reproduce

```bash
npm run experiments
npm run calibrate
```

Both finish in seconds on Node 18 or newer.
