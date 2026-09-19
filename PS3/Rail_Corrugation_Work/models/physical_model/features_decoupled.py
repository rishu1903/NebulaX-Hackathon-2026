import numpy as np
import pandas as pd
from scipy.stats import kurtosis

WHEEL_DIAMETER_METERS = 0.85
WHEEL_TEETH = 90
SAMPLING_RATE_HZ = 10000.0

def get_channel_groupings(columns):
    """
    Categorizes the 128 sensor columns into Side I and Side II,
    and into Vibration and Shock.
    """
    side1_vib_cols = []
    side2_vib_cols = []
    side1_shock_cols = []
    side2_shock_cols = []
    
    for i, col in enumerate(columns[1:], start=1):
        is_vib = "Vibration" in col
        is_shock = "Shock" in col
        
        # Positions 1, 3, 5, 7 -> Side I (Left rail)
        # Positions 2, 4, 6, 8 -> Side II (Right rail)
        is_side1 = any(f"position {p} " in col for p in [1, 3, 5, 7])
        is_side2 = any(f"position {p} " in col for p in [2, 4, 6, 8])
        
        if is_vib and is_side1:
            side1_vib_cols.append(i)
        elif is_vib and is_side2:
            side2_vib_cols.append(i)
        elif is_shock and is_side1:
            side1_shock_cols.append(i)
        elif is_shock and is_side2:
            side2_shock_cols.append(i)
            
    return {
        "side1_vib": side1_vib_cols,
        "side2_vib": side2_vib_cols,
        "side1_shock": side1_shock_cols,
        "side2_shock": side2_shock_cols,
        "side1_all": side1_vib_cols + side1_shock_cols,
        "side2_all": side2_vib_cols + side2_shock_cols
    }

_CACHED_GROUPINGS = None

def compute_window_volatility(signal, window_size_samples):
    """
    Splits (10000, C) into (N_windows, window_size_samples, C).
    Computes RMS per window, standard deviation across windows (volatility),
    and burst ratio (max RMS / median RMS).
    """
    n_samples, n_channels = signal.shape
    n_windows = n_samples // window_size_samples
    truncated = signal[:n_windows * window_size_samples]
    windows = truncated.reshape(n_windows, window_size_samples, n_channels)
    
    # RMS per window: (n_windows, n_channels)
    win_rms = np.sqrt(np.mean(windows ** 2, axis=1))
    
    # Volatility = standard deviation of window energies
    volatility = np.std(win_rms, axis=0) # (n_channels,)
    vol_mean = float(np.mean(volatility))
    vol_max = float(np.max(volatility))
    
    # Burst ratio = max window energy / (median window energy + eps)
    med_rms = np.median(win_rms, axis=0)
    burst_ratio = np.max(win_rms, axis=0) / (med_rms + 1e-6)
    burst_mean = float(np.mean(burst_ratio))
    burst_max = float(np.max(burst_ratio))
    
    return vol_mean, vol_max, burst_mean, burst_max

def extract_decoupled_features(df_or_array, column_names=None):
    """
    Extracts physics-based decoupled features:
    - Independent Side I metrics
    - Independent Side II metrics
    - Jerk / Time derivative (rate of change da/dt)
    - Multi-window rolling volatility vectors (20ms, 50ms, 100ms, 200ms)
    - Crest factors and kurtosis
    - Corrugation resonance frequency energy
    - Speed normalization
    """
    global _CACHED_GROUPINGS
    if isinstance(df_or_array, pd.DataFrame):
        data = df_or_array.values
        if _CACHED_GROUPINGS is None:
            _CACHED_GROUPINGS = get_channel_groupings(df_or_array.columns.tolist())
    else:
        data = df_or_array
        if _CACHED_GROUPINGS is None and column_names is not None:
            _CACHED_GROUPINGS = get_channel_groupings(column_names)
            
    groupings = _CACHED_GROUPINGS
    
    # 1. Speed & Movement
    speed_raw = data[:, 0]
    transitions = int(np.sum(np.diff(speed_raw) != 0))
    transitions_per_rev = WHEEL_TEETH * 2  # 180
    revs_per_sec = transitions / transitions_per_rev
    speed_mps = revs_per_sec * (np.pi * WHEEL_DIAMETER_METERS)
    speed_kmh = speed_mps * 3.6
    is_stationary = 1.0 if transitions <= 50 else 0.0
    
    feats = {
        "speed_mps": float(speed_mps),
        "speed_kmh": float(speed_kmh),
        "transitions": int(transitions),
        "is_stationary": float(is_stationary)
    }
    
    # 2. Sensor signals & DC detrend
    sensors = data[:, 1:]
    sensors_detrended = sensors - np.mean(sensors, axis=0, keepdims=True)
    
    s1_vib = sensors_detrended[:, [c - 1 for c in groupings["side1_vib"]]]
    s2_vib = sensors_detrended[:, [c - 1 for c in groupings["side2_vib"]]]
    s1_shock = sensors_detrended[:, [c - 1 for c in groupings["side1_shock"]]]
    s2_shock = sensors_detrended[:, [c - 1 for c in groupings["side2_shock"]]]
    
    # 3. Time Derivative / Jerk (Rate of change da/dt)
    # dt = 1 / 10000 = 0.0001 s, so diff * 10000 = jerk in m/s^3
    dt_scale = SAMPLING_RATE_HZ
    s1_vib_jerk = np.diff(s1_vib, axis=0) * dt_scale
    s2_vib_jerk = np.diff(s2_vib, axis=0) * dt_scale
    s1_shock_jerk = np.diff(s1_shock, axis=0) * dt_scale
    s2_shock_jerk = np.diff(s2_shock, axis=0) * dt_scale
    
    # 4. Process Side I and Side II independently
    side_signals = {
        "s1": (s1_vib, s1_shock, s1_vib_jerk, s1_shock_jerk),
        "s2": (s2_vib, s2_shock, s2_vib_jerk, s2_shock_jerk)
    }
    
    # Candidate window durations to evaluate:
    # 20ms = 200 samples, 50ms = 500 samples, 100ms = 1000 samples, 200ms = 2000 samples
    window_sizes = {
        "20ms": 200,
        "50ms": 500,
        "100ms": 1000,
        "200ms": 2000
    }
    
    for side_prefix, (vib, shock, vib_jerk, shock_jerk) in side_signals.items():
        # A. Vibration & Shock RMS
        vib_rms = np.sqrt(np.mean(vib ** 2, axis=0))
        shock_rms = np.sqrt(np.mean(shock ** 2, axis=0))
        
        feats[f"{side_prefix}_vib_rms_mean"] = float(np.mean(vib_rms))
        feats[f"{side_prefix}_vib_rms_max"] = float(np.max(vib_rms))
        feats[f"{side_prefix}_vib_rms_std"] = float(np.std(vib_rms))
        
        feats[f"{side_prefix}_shock_rms_mean"] = float(np.mean(shock_rms))
        feats[f"{side_prefix}_shock_rms_max"] = float(np.max(shock_rms))
        
        # B. Jerk / Rate of Change RMS & Peaks
        vib_jerk_rms = np.sqrt(np.mean(vib_jerk ** 2, axis=0))
        shock_jerk_rms = np.sqrt(np.mean(shock_jerk ** 2, axis=0))
        
        feats[f"{side_prefix}_vib_jerk_rms_mean"] = float(np.mean(vib_jerk_rms))
        feats[f"{side_prefix}_vib_jerk_rms_max"] = float(np.max(vib_jerk_rms))
        feats[f"{side_prefix}_vib_jerk_p95"] = float(np.percentile(np.abs(vib_jerk), 95))
        
        feats[f"{side_prefix}_shock_jerk_rms_mean"] = float(np.mean(shock_jerk_rms))
        feats[f"{side_prefix}_shock_jerk_rms_max"] = float(np.max(shock_jerk_rms))
        feats[f"{side_prefix}_shock_jerk_p95"] = float(np.percentile(np.abs(shock_jerk), 95))
        
        # C. Multi-Window Volatility Vectors
        for win_name, win_len in window_sizes.items():
            # Vibration volatility & burst ratio
            vol_mean, vol_max, burst_mean, burst_max = compute_window_volatility(vib, win_len)
            feats[f"{side_prefix}_vib_vol_mean_{win_name}"] = vol_mean
            feats[f"{side_prefix}_vib_vol_max_{win_name}"] = vol_max
            feats[f"{side_prefix}_vib_burst_mean_{win_name}"] = burst_mean
            feats[f"{side_prefix}_vib_burst_max_{win_name}"] = burst_max
            
            # Shock volatility & burst ratio
            s_vol_mean, s_vol_max, s_burst_mean, s_burst_max = compute_window_volatility(shock, win_len)
            feats[f"{side_prefix}_shock_vol_mean_{win_name}"] = s_vol_mean
            feats[f"{side_prefix}_shock_vol_max_{win_name}"] = s_vol_max
            feats[f"{side_prefix}_shock_burst_mean_{win_name}"] = s_burst_mean
            feats[f"{side_prefix}_shock_burst_max_{win_name}"] = s_burst_max
            
        # D. Waveform Impulsiveness & Crest Factor
        vib_mean_signal = np.mean(vib, axis=1)
        shock_mean_signal = np.mean(shock, axis=1)
        
        feats[f"{side_prefix}_kurt_vib"] = float(kurtosis(vib_mean_signal))
        feats[f"{side_prefix}_kurt_shock"] = float(kurtosis(shock_mean_signal))
        
        vib_p2p = float(np.max(vib) - np.min(vib))
        shock_p2p = float(np.max(shock) - np.min(shock))
        feats[f"{side_prefix}_p2p_vib"] = vib_p2p
        feats[f"{side_prefix}_p2p_shock"] = shock_p2p
        
        # Crest factor = peak / RMS
        feats[f"{side_prefix}_crest_vib"] = float(np.max(np.abs(vib)) / (np.mean(vib_rms) + 1e-6))
        feats[f"{side_prefix}_crest_shock"] = float(np.max(np.abs(shock)) / (np.mean(shock_rms) + 1e-6))
        
        # E. Frequency Domain (200 - 1200 Hz Corrugation Resonance Band)
        n = len(vib_mean_signal)
        fft_vib = np.abs(np.fft.rfft(vib_mean_signal)) / n
        freqs = np.fft.rfftfreq(n, d=1.0 / SAMPLING_RATE_HZ)
        res_mask = (freqs >= 200.0) & (freqs <= 1200.0)
        
        fft_energy_res = float(np.sum(fft_vib[res_mask] ** 2))
        feats[f"{side_prefix}_fft_res_energy"] = fft_energy_res
        if np.any(res_mask):
            feats[f"{side_prefix}_dom_freq"] = float(freqs[res_mask][np.argmax(fft_vib[res_mask])])
        else:
            feats[f"{side_prefix}_dom_freq"] = 0.0
            
        # F. Speed-Normalized Metrics
        speed_reg = speed_mps + 1.0
        feats[f"{side_prefix}_energy_per_speed_vib"] = feats[f"{side_prefix}_vib_rms_mean"] / speed_reg
        feats[f"{side_prefix}_energy_per_speed_shock"] = feats[f"{side_prefix}_shock_rms_mean"] / speed_reg
        feats[f"{side_prefix}_jerk_per_speed_vib"] = feats[f"{side_prefix}_vib_jerk_rms_mean"] / speed_reg
        feats[f"{side_prefix}_jerk_per_speed_shock"] = feats[f"{side_prefix}_shock_jerk_rms_mean"] / speed_reg

    return feats
