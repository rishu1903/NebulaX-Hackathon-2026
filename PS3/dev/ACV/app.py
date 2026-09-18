"""Streamlit front-end for the ACV subsystem.

    streamlit run app.py

Upload one or more ACV .xlsx case files, see every car ranked by refrigerant-leak
likelihood with a colour-coded risk band, and download acv_predictions.csv.
"""
import os
import tempfile

import pandas as pd
import streamlit as st

from acv_core import SEVERITY_CUTOFFS, predict_file, severity, write_predictions_csv

BAND_STYLE = {
    "red": "background-color:#f8b4b4;color:#600",
    "yellow": "background-color:#fbe7a1;color:#553",
    "green": "background-color:#c8ecc8;color:#030",
    "no data": "background-color:#e0e0e0;color:#555",
}

st.set_page_config(page_title="Train Condition Monitoring", layout="wide")
st.title("Train Condition Monitoring")
subsystem = st.selectbox("Subsystem", ["ACV (air-conditioning refrigerant leak)"])
st.write(
    "Upload an ACV telemetry file (.xlsx). Every car is ranked from most- to least-likely to "
    "have the refrigerant leak, so a maintenance engineer knows which car to inspect first."
)

uploads = st.file_uploader("ACV case file(s)", type=["xlsx"], accept_multiple_files=True)


@st.cache_data(show_spinner="Analysing file…")
def analyse(name, data):
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, name)
        with open(path, "wb") as fh:
            fh.write(data)
        return predict_file(path)


results = []
for up in uploads or []:
    try:
        r = analyse(up.name, up.getvalue())
    except Exception as exc:  # unreadable / unknown-schema file
        st.error(f"{up.name}: could not be analysed ({exc})")
        continue
    results.append(r)

    st.subheader(up.name)
    st.success(f"Inspect car **{r['ranked_cars'][0]}** first.")
    rows = []
    for rank, car in enumerate(r["ranked_cars"], start=1):
        score = r["scores"].get(car)
        rows.append(
            {
                "Rank": rank,
                "Car": car,
                "Deviation score": None if pd.isna(score) else round(score, 3),
                "Risk": severity(score),
            }
        )
    table = pd.DataFrame(rows)
    st.dataframe(
        table.style.apply(
            lambda col: [BAND_STYLE[v] for v in col] if col.name == "Risk" else [""] * len(col),
            axis=0,
        ),
        hide_index=True,
        width="stretch",
    )
    if r["empty_cars"]:
        st.warning(f"No usable sensor data for car(s) {', '.join(r['empty_cars'])}; ranked last.")
    if r["margin"] is not None:
        st.caption(f"Gap between 1st and 2nd: {r['margin']:.3f}  ·  schema: {r['schema_matched']}")

if results:
    tmp_csv = os.path.join(tempfile.gettempdir(), "acv_predictions_download.csv")
    write_predictions_csv(results, tmp_csv)
    with open(tmp_csv) as fh:
        csv_text = fh.read()
    st.download_button("Download acv_predictions.csv", csv_text, "acv_predictions.csv", "text/csv")

with st.expander("How the risk colours work"):
    st.write(
        f"Score = how much further above its cooling setpoint a car's cabin runs than its "
        f"sibling cars, averaged over cooling periods. Red ≥ {SEVERITY_CUTOFFS['red']}, "
        f"yellow ≥ {SEVERITY_CUTOFFS['yellow']} (the 95th / 90th percentile of healthy cars in "
        f"the training data)."
    )
