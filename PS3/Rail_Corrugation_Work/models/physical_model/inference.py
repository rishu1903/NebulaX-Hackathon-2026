import os
import joblib
import pandas as pd
import numpy as np

# Import the feature extractor from the same directory
from features_decoupled import extract_decoupled_features

class RailCorrugationModel:
    def __init__(self, model_dir=None):
        """
        Initializes the inference pipeline, loading the saved models and feature lists.
        """
        if model_dir is None:
            model_dir = os.path.dirname(os.path.abspath(__file__))
            
        self.s1_features_list = joblib.load(os.path.join(model_dir, "features_s1.joblib"))
        self.s2_features_list = joblib.load(os.path.join(model_dir, "features_s2.joblib"))
        
        self.s1_models = joblib.load(os.path.join(model_dir, "models_s1.joblib"))
        self.s2_models = joblib.load(os.path.join(model_dir, "models_s2.joblib"))
        
        # Asymmetric thresholds optimized on validation
        self.threshold_s1 = 0.35
        self.threshold_s2 = 0.60
        
    def extract_features(self, df_raw):
        """
        Extracts the physical decoupled features from a raw CSV dataframe.
        """
        feats_dict = extract_decoupled_features(df_raw)
        
        # Calculate jerk ratios (not included directly in extract_decoupled_features originally)
        feats_dict['s1_jerk_to_vib_ratio'] = feats_dict['s1_vib_jerk_rms_mean'] / (feats_dict['s1_vib_rms_mean'] + 1e-6)
        feats_dict['s2_jerk_to_vib_ratio'] = feats_dict['s2_vib_jerk_rms_mean'] / (feats_dict['s2_vib_rms_mean'] + 1e-6)
        feats_dict['s1_jerk_to_shock_ratio'] = feats_dict['s1_shock_jerk_rms_mean'] / (feats_dict['s1_shock_rms_mean'] + 1e-6)
        feats_dict['s2_jerk_to_shock_ratio'] = feats_dict['s2_shock_jerk_rms_mean'] / (feats_dict['s2_shock_rms_mean'] + 1e-6)
        
        return pd.DataFrame([feats_dict])
        
    def predict(self, df_raw):
        """
        Predicts the fault severity / classification for a given raw test file.
        
        Returns:
            dict with 'prediction' (Normal, Side I, Side II) and 'probabilities'
        """
        # 1. Feature Extraction
        df_feats = self.extract_features(df_raw)
        
        # 2. Check for stationary state (train isn't moving fast enough)
        is_stat = df_feats.iloc[0]['is_stationary'] == 1.0
        if is_stat:
            return {
                "prediction": "Normal", 
                "prob_side1": 0.0, 
                "prob_side2": 0.0,
                "reason": "Stationary/Low Speed"
            }
            
        # 3. Model Inference (3-way blend for each side)
        X1 = df_feats[self.s1_features_list].values
        X2 = df_feats[self.s2_features_list].values
        
        # LightGBM (40%), HistGB (30%), ExtraTrees (30%)
        p1 = (
            0.40 * self.s1_models['lgb'].predict_proba(X1)[0, 1] +
            0.30 * self.s1_models['hgb'].predict_proba(X1)[0, 1] +
            0.30 * self.s1_models['et'].predict_proba(X1)[0, 1]
        )
        
        p2 = (
            0.40 * self.s2_models['lgb'].predict_proba(X2)[0, 1] +
            0.30 * self.s2_models['hgb'].predict_proba(X2)[0, 1] +
            0.30 * self.s2_models['et'].predict_proba(X2)[0, 1]
        )
        
        # 4. Asymmetric Thresholding Strategy
        pred = "Normal"
        if p1 >= self.threshold_s1 and p2 >= self.threshold_s2:
            pred = "Side I" if p1 > p2 else "Side II"
        elif p1 >= self.threshold_s1:
            pred = "Side I"
        elif p2 >= self.threshold_s2:
            pred = "Side II"
            
        return {
            "prediction": pred,
            "prob_side1": float(round(p1, 4)),
            "prob_side2": float(round(p2, 4))
        }

if __name__ == "__main__":
    # Quick test run
    print("Testing backend model instantiation...")
    try:
        model = RailCorrugationModel()
        print("Model loaded successfully!")
    except Exception as e:
        print(f"Error loading model: {e}")
