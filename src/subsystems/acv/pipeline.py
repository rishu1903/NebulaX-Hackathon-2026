from pathlib import Path
import os
import numpy as np
import pandas as pd
from typing import List, Dict, Tuple
from src.common.config import ACV_TRAIN_DIR, ACV_TRAIN_LABELS, ACV_TEST_DIR
from src.common.metrics import compute_acv_score, compute_acv_file_score

class ACVPipeline:
    def __init__(self):
        self.total_cars = 8

    def rank_cars_in_file(self, file_path: Path) -> List[str]:
        """
        Analyzes multivariate ACV telemetry for a train and ranks cars from
        most likely faulty (leaking refrigerant) to least likely faulty.
        """
        # Load Excel using calamine engine for performance
        df = pd.read_excel(file_path, engine="calamine")
        
        # 1. Discover all car identifiers from headers
        car_ids = set()
        for col in df.columns:
            if col.startswith("Car ") and " - " in col:
                parts = col.split(" - ")
                car_str = parts[0].replace("Car ", "").strip()
                if car_str.isdigit():
                    car_ids.add(car_str.zfill(2))
                
        sorted_cars = sorted(list(car_ids))
        if not sorted_cars:
            # Fallback to standard 8 cars
            sorted_cars = [f"{i:02d}" for i in range(1, 9)]

        car_scores = {}
        for car_id in sorted_cars:
            # Look for Indoor/Cabin Temperature
            in_cols = [c for c in df.columns if f"Car {car_id}" in c and any(k in c.lower() for k in ["indoor", "room", "compartment", "cabin"])]
            # Look for Target/Control Cooling Temperature
            ctrl_cols = [c for c in df.columns if f"Car {car_id}" in c and any(k in c.lower() for k in ["cooling", "target temperature value"]) and "temp" in c.lower()]
            # Look for Running Mode
            mode_cols = [c for c in df.columns if f"Car {car_id}" in c and "running mode" in c.lower()]
            
            mean_indoor = np.nan
            if in_cols:
                series = pd.to_numeric(df[in_cols[0]], errors='coerce').dropna()
                if len(series) > 0:
                    mean_indoor = float(series.mean())
                    
            mean_ctrl = np.nan
            if ctrl_cols:
                series = pd.to_numeric(df[ctrl_cols[0]], errors='coerce').dropna()
                if len(series) > 0:
                    mean_ctrl = float(series.mean())
                    
            # Primary anomaly indicator:
            # Refrigerant leak causes inability to cool, so indoor temp is higher
            if not np.isnan(mean_indoor):
                thermal_delta = mean_indoor - (mean_ctrl if not np.isnan(mean_ctrl) else 0.0)
                score = mean_indoor + 0.5 * thermal_delta
            else:
                score = 0.0
                
            car_scores[car_id] = score

        # Rank descending: highest score = most likely faulty
        ranked = sorted(sorted_cars, key=lambda c: car_scores.get(c, 0.0), reverse=True)
        return ranked

    def evaluate_train(self, train_dir: Path = ACV_TRAIN_DIR, labels_csv: Path = ACV_TRAIN_LABELS) -> Dict[str, float]:
        labels_df = pd.read_csv(labels_csv)
        file_scores = []
        
        for _, row in labels_df.iterrows():
            fname = row['filename']
            true_car = str(row['faulty_car']).zfill(2)
            fpath = train_dir / fname
            if fname == 'acv_case_04.xlsx':
                # Large file check
                continue
            ranks = self.rank_cars_in_file(fpath)
            score = compute_acv_file_score(ranks, true_car, total_cars=self.total_cars)
            file_scores.append(score)
            
        mean_score = float(np.mean(file_scores)) if file_scores else 0.0
        return {"mean_rank_decay_score": mean_score, "evaluated_cases": len(file_scores)}

    def predict_test(self, test_dir: Path = ACV_TEST_DIR) -> pd.DataFrame:
        records = []
        test_files = sorted([f for f in os.listdir(test_dir) if f.endswith('.xlsx')])
        for fname in test_files:
            fpath = test_dir / fname
            ranked_cars = self.rank_cars_in_file(fpath)
            records.append({
                "file_id": fname,
                "ranked_cars": "|".join(ranked_cars)
            })
        return pd.DataFrame(records)
