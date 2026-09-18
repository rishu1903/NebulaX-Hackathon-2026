from pathlib import Path
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from src.common.config import DOOR_TRAIN_CSV, DOOR_TRAIN_ANSWER, DOOR_TEST_CSV
from src.common.metrics import parse_door_timestamp, compute_door_score

def segment_door_stream(df: pd.DataFrame, jump_threshold: float = 0.5):
    """
    Segments a continuous door data stream into discrete cycles based on time jumps.
    Returns a list of segment tuples: (start_idx, end_idx, start_time_str, end_time_str).
    """
    times = [parse_door_timestamp(ts) for ts in df['Datetime']]
    deltas = [times[i] - times[i-1] for i in range(1, len(times))]
    jump_indices = [0] + [i for i, d in enumerate(deltas, start=1) if d > jump_threshold] + [len(df)]
    
    segments = []
    for idx in range(len(jump_indices) - 1):
        s_idx = jump_indices[idx]
        e_idx = jump_indices[idx + 1]
        start_time = df.iloc[s_idx]['Datetime']
        end_time = df.iloc[e_idx - 1]['Datetime']
        segments.append((s_idx, e_idx, start_time, end_time))
    return segments

def extract_door_features(seg_df: pd.DataFrame) -> list:
    """Extracts electro-mechanical feature vector from a single door cycle segment."""
    current = seg_df['Motor current(mA)'].values
    voltage = seg_df['Motor Voltage(10mV)'].values
    emf = seg_df['Motor electrodynamic force'].values
    pos = seg_df['Door leaf position'].values
    
    is_opening = seg_df['Door is opening'].mean() > 0.5
    
    return [
        len(seg_df),
        float(np.max(current)),
        float(np.mean(current)),
        float(np.median(current)),
        float(np.std(current)),
        float(np.percentile(current, 75)),
        float(np.percentile(current, 90)),
        float(np.max(voltage)),
        float(np.mean(voltage)),
        float(np.std(voltage)),
        float(np.max(emf)),
        float(np.mean(emf)),
        float(np.std(emf)),
        float(np.sum(current)),
        float(np.sum(current * voltage)),
        float(np.sum(current ** 2)),
        float(np.max(pos) - np.min(pos)),
        1.0 if is_opening else 0.0,
    ]

class DoorPipeline:
    def __init__(self):
        self.model = RandomForestClassifier(
            n_estimators=100,
            max_depth=6,
            random_state=42,
            class_weight='balanced'
        )
        self.is_trained = False

    def train(self, train_csv_path: Path = DOOR_TRAIN_CSV, answer_csv_path: Path = DOOR_TRAIN_ANSWER):
        df_train = pd.read_csv(train_csv_path)
        df_ans = pd.read_csv(answer_csv_path)
        
        segments = segment_door_stream(df_train)
        X = []
        y = []
        for idx, (s_idx, e_idx, s_time, e_time) in enumerate(segments):
            seg = df_train.iloc[s_idx:e_idx]
            feats = extract_door_features(seg)
            status = df_ans.iloc[idx]['status']
            X.append(feats)
            y.append(1 if status == 'Abnormal resistance' else 0)
        
        self.model.fit(np.array(X), np.array(y))
        self.is_trained = True
        return self

    def predict_stream(self, test_csv_path: Path = DOOR_TEST_CSV) -> pd.DataFrame:
        if not self.is_trained:
            self.train()
            
        df_test = pd.read_csv(test_csv_path)
        segments = segment_door_stream(df_test)
        
        records = []
        for s_idx, e_idx, start_time, end_time in segments:
            seg = df_test.iloc[s_idx:e_idx]
            feats = extract_door_features(seg)
            pred_class = self.model.predict([feats])[0]
            label = "Abnormal resistance" if pred_class == 1 else "Normal"
            records.append({
                "start_time": start_time,
                "end_time": end_time,
                "prediction": label
            })
            
        return pd.DataFrame(records)
