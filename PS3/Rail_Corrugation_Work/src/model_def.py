import numpy as np
from lightgbm import LGBMClassifier
from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier

class EnsembleRailModel:
    """
    Production soft-voting ensemble combining LightGBM, 
    HistGradientBoosting, and Balanced Random Forest with 
    stationary vehicle override logic.
    """
    def __init__(self):
        self.m1 = LGBMClassifier(
            class_weight="balanced", 
            random_state=42, 
            n_estimators=180, 
            learning_rate=0.04, 
            verbose=-1
        )
        self.m2 = HistGradientBoostingClassifier(
            class_weight="balanced", 
            random_state=42, 
            max_iter=160, 
            learning_rate=0.06
        )
        self.m3 = RandomForestClassifier(
            n_estimators=250, 
            class_weight="balanced", 
            max_depth=12,
            random_state=42
        )
        self.classes_ = None

    def fit(self, X, y):
        self.m1.fit(X, y)
        self.m2.fit(X, y)
        self.m3.fit(X, y)
        self.classes_ = self.m1.classes_
        return self

    def predict_proba(self, X):
        p1 = self.m1.predict_proba(X)
        p2 = self.m2.predict_proba(X)
        p3 = self.m3.predict_proba(X)
        return 0.50 * p1 + 0.30 * p2 + 0.20 * p3

    def predict(self, X, is_stationary=None):
        probs = self.predict_proba(X)
        preds = [self.classes_[i] for i in np.argmax(probs, axis=1)]
        if is_stationary is not None:
            for i, stat in enumerate(is_stationary):
                if stat == 1.0 or stat is True:
                    preds[i] = "Normal"
        return preds
