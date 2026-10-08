"""Train the jam forecaster behind the lab's risk gauge.

Reads data/jam_windows.csv (make it with `npm run dataset`), splits by simulation run
so the test runs are unseen, compares three forecasters, and writes model/model.json.
"""
import json
from pathlib import Path

import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import precision_score, recall_score, roc_auc_score
from sklearn.model_selection import GroupShuffleSplit
from sklearn.preprocessing import StandardScaler

ROOT = Path(__file__).resolve().parent.parent
FEATURES = ["sd5", "sdSlope", "gapSd5", "minGap20", "maxDecel20", "mean5", "smoothFrac", "copyFrac", "density"]
ALERT = 0.25  # risk at which the gauge counts as a warning

df = pd.read_csv(ROOT / "data" / "jam_windows.csv")
X, y, runs = df[FEATURES].values, df["label"].values, df["run"].values
train, test = next(GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=7).split(X, y, runs))


def score(name, p, threshold):
    hit = p >= threshold
    return {"model": name, "auc": round(roc_auc_score(y[test], p), 3),
            "precision": round(precision_score(y[test], hit), 3), "recall": round(recall_score(y[test], hit), 3)}


scaler = StandardScaler().fit(X[train])
lr = LogisticRegression(max_iter=2000).fit(scaler.transform(X[train]), y[train])  # unweighted, so the odds stay calibrated
gb = HistGradientBoostingClassifier(max_iter=300, learning_rate=0.08, random_state=7).fit(X[train], y[train])

results = [
    score("Rule of thumb: speed wobble above 1.5 m/s", (X[test][:, 0] > 1.5).astype(float), 0.5),
    score("Logistic regression, alert at 25% (used in the lab)", lr.predict_proba(scaler.transform(X[test]))[:, 1], ALERT),
    score("Gradient boosting, alert at 30%", gb.predict_proba(X[test])[:, 1], 0.30),
]
for r in results:
    print(f"{r['model']:<52} AUC {r['auc']:.3f}  precision {r['precision']:.0%}  recall {r['recall']:.0%}")
print(f"train windows {len(train)}, test windows {len(test)}, jam rate {y[test].mean():.1%}")
print("standardized coefficients:", dict(zip(FEATURES, lr.coef_[0].round(2))))

(ROOT / "model" / "model.json").write_text(json.dumps({
    "features": FEATURES,
    "mean": scaler.mean_.round(5).tolist(),
    "scale": scaler.scale_.round(5).tolist(),
    "coef": lr.coef_[0].round(5).tolist(),
    "intercept": round(float(lr.intercept_[0]), 5),
    "alert": ALERT,
    "test": {"train_windows": int(len(train)), "test_windows": int(len(test)),
             "jam_rate": round(float(y[test].mean()), 3), "results": results},
}, indent=1))
print("wrote model/model.json")
