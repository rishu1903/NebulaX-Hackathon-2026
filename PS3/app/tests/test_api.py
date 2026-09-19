from __future__ import annotations

from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from PS3.app.backend import main

DATA = Path(__file__).resolve().parents[2] / "02_Datasets"
CONTRACT_KEYS = {
    "subsystem", "success", "filename", "headline", "prediction", "summary",
    "table", "chart_data", "technical_details", "submission_csv", "error",
}


@pytest.fixture(scope="module")
def client():
    with TestClient(main.app) as c:  # context manager runs the startup (adapter loading)
        yield c


def _post(client, subsystem, name, data, content_type="application/octet-stream"):
    return client.post(f"/api/analyse/{subsystem}", files={"file": (name, data, content_type)})


def test_health_reports_all_subsystems(client):
    body = client.get("/api/health").json()
    assert body["status"] == "ok"
    assert set(body["subsystems"]) == {"acv", "door", "rail", "shm"}


def test_subsystems_lists_accepted_types(client):
    body = client.get("/api/subsystems").json()
    accepts = {s["key"]: s["accepts"] for s in body["subsystems"]}
    assert accepts == {"acv": [".xlsx"], "door": [".csv"], "rail": [".csv"], "shm": [".csv"]}
    assert body["max_upload_mb"] == main.MAX_UPLOAD_MB


def test_unknown_subsystem_is_404(client):
    assert _post(client, "nope", "x.csv", b"a,b\n1,2\n").status_code == 404


def test_wrong_extension_is_415(client):
    resp = _post(client, "acv", "data.csv", b"a,b\n1,2\n")
    assert resp.status_code == 415
    assert ".xlsx" in resp.json()["detail"]


def test_empty_file_is_400(client):
    assert _post(client, "shm", "empty.csv", b"").status_code == 400


def test_oversized_upload_is_413(client, monkeypatch):
    monkeypatch.setattr(main, "MAX_UPLOAD_MB", 1)
    assert _post(client, "shm", "big.csv", b"1\n" * (600 * 1024)).status_code == 413


def test_malformed_file_returns_contract_with_422(client):
    resp = _post(client, "shm", "bad.csv", b"not,a,signal\nx,y,z\n")
    assert resp.status_code == 422
    body = resp.json()
    assert set(body) == CONTRACT_KEYS
    assert body["success"] is False and body["error"]


def test_unavailable_adapter_is_503(client, monkeypatch):
    monkeypatch.delitem(main._adapters, "shm")
    monkeypatch.setitem(main._adapter_errors, "shm", "boom")
    resp = _post(client, "shm", "x.csv", b"1\n2\n")
    assert resp.status_code == 503 and "boom" in resp.json()["detail"]


needs_data = pytest.mark.skipif(not DATA.exists(), reason="raw datasets not present")


@needs_data
def test_acv_end_to_end(client):
    path = DATA / "ACV" / "Test" / "acv_test_case.xlsx"
    resp = _post(client, "acv", path.name, path.read_bytes())
    body = resp.json()
    assert resp.status_code == 200 and set(body) == CONTRACT_KEYS
    assert body["prediction"] == "01|03|07|04|08|06|02|05"
    assert len(body["table"]) == 8


@needs_data
def test_shm_end_to_end(client):
    path = DATA / "SHM" / "Test" / "test01.csv"
    resp = _post(client, "shm", path.name, path.read_bytes())
    body = resp.json()
    assert resp.status_code == 200 and set(body) == CONTRACT_KEYS
    assert float(body["prediction"]) == pytest.approx(0.0324478523873052, rel=1e-6)


@needs_data
def test_rail_end_to_end(client):
    path = DATA / "Rail_Corrugation" / "Test" / "Test1.csv"
    resp = _post(client, "rail", path.name, path.read_bytes())
    body = resp.json()
    assert resp.status_code == 200 and set(body) == CONTRACT_KEYS
    assert body["prediction"] == "Normal"


@needs_data
def test_door_end_to_end(client):
    path = DATA / "Door" / "Test.csv"
    resp = _post(client, "door", path.name, path.read_bytes())
    body = resp.json()
    assert resp.status_code == 200 and set(body) == CONTRACT_KEYS
    assert body["summary"]["cycles_found"] == 38
    assert body["summary"]["abnormal"] == 8


def test_mount_ui_serves_static_and_keeps_api(tmp_path):
    (tmp_path / "index.html").write_text("<h1>ui</h1>")
    application = FastAPI()
    application.include_router(main.router)
    assert main.mount_ui(application, tmp_path) is True
    with TestClient(application) as c:
        assert "<h1>ui</h1>" in c.get("/").text
        assert c.get("/api/health").json()["status"] == "ok"  # API not shadowed by the UI


def test_mount_ui_skips_missing_dir(tmp_path):
    assert main.mount_ui(FastAPI(), tmp_path / "nope") is False
