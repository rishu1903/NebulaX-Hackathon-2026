import pytest
import numpy as np
from src.common.metrics import (
    compute_iou,
    compute_door_score,
    compute_acv_file_score,
    compute_shm_score,
    parse_door_timestamp,
)

def test_parse_door_timestamp():
    ts1 = "2023-7-5-0-0-3-760"
    t1 = parse_door_timestamp(ts1)
    assert isinstance(t1, float)
    assert t1 > 0

def test_iou_calculation():
    # Perfect match
    assert compute_iou(10.0, 20.0, 10.0, 20.0) == 1.0
    # No overlap
    assert compute_iou(10.0, 20.0, 30.0, 40.0) == 0.0
    # Partial overlap: [10, 20] and [15, 25] -> inter=5, union=15 -> 1/3
    assert abs(compute_iou(10.0, 20.0, 15.0, 25.0) - (5.0 / 15.0)) < 1e-6

def test_door_score_empty():
    assert compute_door_score([], [])["score"] == 1.0
    assert compute_door_score([{"start_time": "2023-7-5-0-0-0-0", "end_time": "2023-7-5-0-0-1-0", "prediction": "Normal"}], [])["score"] == 0.0

def test_door_score_matching():
    true_segs = [
        {"start_time": "2023-7-5-0-0-0-0", "end_time": "2023-7-5-0-0-4-0", "status": "Normal"},
        {"start_time": "2023-7-5-0-1-0-0", "end_time": "2023-7-5-0-1-4-0", "status": "Abnormal resistance"},
    ]
    # Perfect predictions
    res = compute_door_score(true_segs, true_segs)
    assert res["score"] == 1.0
    assert res["matched_pairs"] == 2

    # Wrong labels -> zero score
    pred_wrong_label = [
        {"start_time": "2023-7-5-0-0-0-0", "end_time": "2023-7-5-0-0-4-0", "prediction": "Abnormal resistance"},
        {"start_time": "2023-7-5-0-1-0-0", "end_time": "2023-7-5-0-1-4-0", "prediction": "Normal"},
    ]
    res_wrong = compute_door_score(true_segs, pred_wrong_label)
    assert res_wrong["score"] == 0.0

def test_acv_scoring():
    cars = ["01", "02", "03", "04", "05", "06", "07", "08"]
    # 1st place -> 1.0
    assert compute_acv_file_score(cars, "01") == 1.0
    # 2nd place -> (8 - 1) / 8 = 0.875
    assert compute_acv_file_score(cars, "02") == 0.875
    # 3rd place -> (8 - 2) / 8 = 0.750
    assert compute_acv_file_score(cars, "03") == 0.750
    # 8th place -> (8 - 7) / 8 = 0.125
    assert compute_acv_file_score(cars, "08") == 0.125
    # Not ranked -> 0
    assert compute_acv_file_score(cars, "99") == 0.0

def test_shm_worked_example():
    # Worked example from SHM_Info_Kit.md:
    y_true = np.array([0.10, 0.30, 0.50, 0.70, 0.90])
    y_pred = np.array([0.15, 0.28, 0.55, 0.68, 0.85])
    res = compute_shm_score(y_true, y_pred)
    assert abs(res["mape"] - 0.15) < 1e-3
    assert abs(res["score"] - 0.85) < 1e-3


def test_shm_worst_case():
    y_true = np.array([0.10, 0.30, 0.50, 0.70, 0.90])
    y_pred = np.array([0.50, 0.50, 0.50, 0.50, 0.50])
    res = compute_shm_score(y_true, y_pred)
    assert res["score"] == 0.0
