from datetime import datetime
import numpy as np
import pandas as pd
from typing import List, Dict, Any, Tuple


def parse_door_timestamp(ts_str: str) -> float:
    """
    Parses door timestamps like '2023-7-5-0-0-3-760'
    Format: Year-Month-Day-Hour-Minute-Second-Millisecond
    Returns timestamp in seconds (float).
    """
    if isinstance(ts_str, (int, float)):
        return float(ts_str)
    ts_str = str(ts_str).strip()
    # Try custom hyphen format
    parts = ts_str.split("-")
    if len(parts) == 7:
        try:
            year, month, day, hour, minute, second, ms = map(int, parts)
            # Microseconds: ms * 1000
            dt = datetime(year, month, day, hour, minute, second, ms * 1000)
            return dt.timestamp()
        except Exception:
            pass
    # Try ISO/standard format
    try:
        dt = pd.to_datetime(ts_str)
        return dt.timestamp()
    except Exception:
        raise ValueError(f"Unable to parse timestamp: {ts_str}")


def compute_iou(start1: float, end1: float, start2: float, end2: float) -> float:
    """Computes 1D temporal Intersection over Union."""
    intersection = max(0.0, min(end1, end2) - max(start1, start2))
    dur1 = max(0.0, end1 - start1)
    dur2 = max(0.0, end2 - start2)
    union = dur1 + dur2 - intersection
    if union <= 0.0:
        return 0.0
    return intersection / union


def compute_door_score(
    true_segments: List[Dict[str, Any]], 
    pred_segments: List[Dict[str, Any]]
) -> Dict[str, float]:
    """
    Computes IoU-weighted soft F1 for Door temporal segment detection.
    Each segment is a dict with keys: 'start_time', 'end_time', 'prediction' (or 'status').
    """
    if not true_segments and not pred_segments:
        return {"score": 1.0, "soft_precision": 1.0, "soft_recall": 1.0, "matched_pairs": 0}
    if not true_segments or not pred_segments:
        return {"score": 0.0, "soft_precision": 0.0, "soft_recall": 0.0, "matched_pairs": 0}

    # Normalize true segments
    t_segs = []
    for s in true_segments:
        label = s.get("status") or s.get("prediction")
        t_start = parse_door_timestamp(s["start_time"])
        t_end = parse_door_timestamp(s["end_time"])
        t_segs.append({"start": t_start, "end": t_end, "label": label})

    # Normalize pred segments
    p_segs = []
    for s in pred_segments:
        label = s.get("status") or s.get("prediction")
        p_start = parse_door_timestamp(s["start_time"])
        p_end = parse_door_timestamp(s["end_time"])
        p_segs.append({"start": p_start, "end": p_end, "label": label})

    # Find candidate pairs (same label and IoU > 0)
    candidates = []
    for t_idx, t in enumerate(t_segs):
        for p_idx, p in enumerate(p_segs):
            if t["label"] == p["label"]:
                iou = compute_iou(t["start"], t["end"], p["start"], p["end"])
                if iou > 0.0:
                    candidates.append((iou, t_idx, p_idx))

    # Sort descending by IoU for greedy 1-to-1 matching
    candidates.sort(key=lambda x: x[0], reverse=True)

    matched_t = set()
    matched_p = set()
    sum_iou = 0.0
    match_count = 0

    for iou, t_idx, p_idx in candidates:
        if t_idx not in matched_t and p_idx not in matched_p:
            matched_t.add(t_idx)
            matched_p.add(p_idx)
            sum_iou += iou
            match_count += 1

    soft_recall = sum_iou / len(t_segs)
    soft_precision = sum_iou / len(p_segs)
    
    if (soft_recall + soft_precision) > 0.0:
        score = 2.0 * soft_recall * soft_precision / (soft_recall + soft_precision)
    else:
        score = 0.0

    return {
        "score": float(score),
        "soft_precision": float(soft_precision),
        "soft_recall": float(soft_recall),
        "sum_iou": float(sum_iou),
        "matched_pairs": match_count,
        "true_count": len(t_segs),
        "pred_count": len(p_segs),
    }


def compute_acv_file_score(ranked_cars: List[str], true_car: str, total_cars: int = 8) -> float:
    """
    Computes linear rank decay score for ACV localization:
    score = (n - (r - 1)) / n
    Where r is 1-based rank (1 = top pick).
    """
    clean_true = str(true_car).zfill(2)
    clean_ranks = [str(c).strip().zfill(2) for c in ranked_cars]
    n = max(len(clean_ranks), total_cars)
    
    if clean_true not in clean_ranks:
        return 0.0
    
    r = clean_ranks.index(clean_true) + 1  # 1-based rank
    return (n - (r - 1)) / float(n)


def compute_acv_score(predictions: List[Dict[str, Any]], ground_truth: Dict[str, str]) -> float:
    """
    Computes average linear rank decay score across multiple ACV files.
    ground_truth: {file_id: true_car_str}
    """
    if not predictions:
        return 0.0
    scores = []
    for pred in predictions:
        file_id = pred["file_id"]
        if file_id in ground_truth:
            raw_cars = pred["ranked_cars"]
            if isinstance(raw_cars, str):
                cars_list = raw_cars.split("|")
            else:
                cars_list = list(raw_cars)
            file_score = compute_acv_file_score(cars_list, ground_truth[file_id])
            scores.append(file_score)
    return float(np.mean(scores)) if scores else 0.0


def compute_shm_score(y_true: np.ndarray, y_pred: np.ndarray) -> Dict[str, float]:
    """
    Computes SHM score = max(0, 1 - MAPE).
    MAPE = mean( |y_true - y_pred| / |y_true| )
    """
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
    
    nonzero_mask = y_true != 0
    if not np.any(nonzero_mask):
        return {"mape": 0.0, "score": 1.0}
    
    abs_pct_errors = np.abs(y_true[nonzero_mask] - y_pred[nonzero_mask]) / np.abs(y_true[nonzero_mask])
    mape = float(np.mean(abs_pct_errors))
    score = float(max(0.0, 1.0 - mape))
    
    return {
        "score": score,
        "mape": mape,
        "mae": float(np.mean(np.abs(y_true - y_pred))),
        "rmse": float(np.sqrt(np.mean((y_true - y_pred) ** 2)))
    }
