from __future__ import annotations

from io import StringIO
from pathlib import Path

import pandas as pd
import pytest

from PS3.app.adapters import acv_adapter, door_adapter, rail_adapter, shm_adapter


CONTRACT_KEYS = {
    "subsystem",
    "success",
    "filename",
    "headline",
    "prediction",
    "summary",
    "table",
    "chart_data",
    "technical_details",
    "submission_csv",
    "error",
}


def assert_contract(result: dict) -> None:
    assert set(result) == CONTRACT_KEYS
    assert isinstance(result["success"], bool)
    assert isinstance(result["headline"], str)
    assert isinstance(result["summary"], dict)
    assert isinstance(result["technical_details"], dict)


def _door_stream() -> bytes:
    """Two synthetic door cycles: a low-resistance one (Normal) and a high-resistance one (Abnormal)."""
    header = (
        "Datetime,Motor current(mA),Motor Voltage(10mV),Motor electrodynamic force,"
        "Door leaf position,Open command,Close command,Door is opening\n"
    )
    rows = []
    for start_s, current in ((0, 100), (30, 300)):  # 30 s idle gap between cycles
        for i in range(60):  # 20 ms sampling
            ms = start_s * 1000 + i * 20
            stamp = f"2023-7-5-0-0-{ms // 1000}-{ms % 1000}"
            rows.append(f"{stamp},{current},400,400,{i * 10},1,0,1\n")
    return (header + "".join(rows)).encode()


def test_door_adapter_success_contract() -> None:
    result = door_adapter.analyse_upload(_door_stream(), "Test.csv")

    assert_contract(result)
    assert result["success"] is True
    assert result["prediction"] == ["Normal", "Abnormal resistance"]
    assert result["summary"]["cycles_found"] == 2
    assert result["summary"]["abnormal"] == 1
    assert result["technical_details"]["retraining_during_inference"] is False
    parsed = pd.read_csv(StringIO(result["submission_csv"]))
    assert list(parsed.columns) == ["start_time", "end_time", "prediction"]
    assert parsed.shape == (2, 3)


def test_door_adapter_matches_submitted_csv() -> None:
    """The app must produce exactly the file we submit (guards against a stale submission)."""
    ps3 = Path(__file__).resolve().parents[2]
    test_csv = ps3 / "02_Datasets" / "Door" / "Test.csv"
    submitted = ps3 / "Door_Work" / "outputs" / "submission" / "door_predictions.csv"
    if not test_csv.exists():
        pytest.skip("raw Door dataset not present")

    result = door_adapter.analyse_upload(test_csv.read_bytes(), "Test.csv")

    assert result["success"] is True
    assert result["submission_csv"] == submitted.read_text()


def test_door_adapter_missing_column_is_readable() -> None:
    result = door_adapter.analyse_upload(b"Datetime\n2023-7-5-0-0-0-0\n", "bad.csv")

    assert_contract(result)
    assert result["success"] is False
    assert "missing required column" in result["error"]


def test_acv_adapter_success_contract(monkeypatch) -> None:
    def fake_predict_file(path):
        return {
            "file_id": "ignored.xlsx",
            "ranked_cars": ["03", "01", "02"],
            "ranked_cars_str": "03|01|02",
            "scores": {"03": 0.5, "01": 0.2, "02": 0.1},
            "margin": 0.3,
            "schema_matched": "Indoor Average Temperature",
            "empty_cars": [],
        }

    monkeypatch.setattr(acv_adapter, "predict_file", fake_predict_file)

    result = acv_adapter.analyse_upload(b"fake-xlsx", "case.xlsx")

    assert_contract(result)
    assert result["success"] is True
    assert result["prediction"] == "03|01|02"
    parsed = pd.read_csv(StringIO(result["submission_csv"]))
    assert list(parsed.columns) == ["file_id", "ranked_cars"]
    assert parsed.loc[0, "ranked_cars"] == "03|01|02"


def test_rail_adapter_success_contract(monkeypatch) -> None:
    monkeypatch.setattr(
        rail_adapter,
        "predict_csv_bytes",
        lambda data, file_id: {
            "prediction": "Side I",
            "speed_kmh": 31.5,
            "speed_transitions": 590,
            "low_transition_override": False,
            "hotspot": {
                "start_m": 2.0,
                "end_m": 3.5,
                "center_m": 2.75,
                "total_m": 8.75,
                "peak_to_median_energy": 1.4,
            },
        },
    )

    result = rail_adapter.analyse_upload(b"csv", "Test1.csv")

    assert_contract(result)
    assert result["success"] is True
    assert result["prediction"] == "Side I"
    assert result["summary"]["hotspot"]["center_m"] == 2.75
    parsed = pd.read_csv(StringIO(result["submission_csv"]))
    assert list(parsed.columns) == ["file_id", "prediction"]
    assert parsed.loc[0, "prediction"] == "Side I"


def test_shm_adapter_success_contract(monkeypatch) -> None:
    fake_result = {
        "subsystem": "SHM",
        "file_id": "test01.csv",
        "prediction": 0.123,
        "model_name": "Physics_k_times_fatigue_power_5",
        "technical_details": {"fatigue_power_5": 10.0},
    }
    monkeypatch.setattr(shm_adapter, "predict_shm_upload", lambda data, name: fake_result)
    monkeypatch.setattr(
        shm_adapter,
        "prediction_result_to_submission_csv",
        lambda result: "file_id,prediction\ntest01.csv,0.123\n",
    )

    result = shm_adapter.analyse_upload(b"1\n2\n", "test01.csv")

    assert_contract(result)
    assert result["success"] is True
    assert result["prediction"] == 0.123
    parsed = pd.read_csv(StringIO(result["submission_csv"]))
    assert list(parsed.columns) == ["file_id", "prediction"]
    assert parsed.loc[0, "prediction"] == 0.123


def test_extension_errors_return_contract() -> None:
    for adapter, name in [
        (acv_adapter, "case.csv"),
        (rail_adapter, "rail.xlsx"),
        (shm_adapter, "signal.txt"),
    ]:
        result = adapter.analyse_upload(b"bad", name)
        assert_contract(result)
        assert result["success"] is False
        assert result["submission_csv"] is None
