import numpy as np
import pandas as pd
from scipy.stats import kurtosis

# Wheel parameters specified in Rail_Corrugation_Info_Kit.md
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

def localized_top3_features(sensors_detrended, groupings):
    out = {}
    window, hop, k = 2000, 1000, 3
    for kind in ("vib", "shock"):
        side_energy = {}
        for side in ("side1", "side2"):
            indices = np.asarray(groupings[f"{side}_{kind}"]) - 1
            signal = sensors_detrended[:, indices]
            values = []
            for start in range(0, signal.shape[0] - window + 1, hop):
                segment = signal[start:start + window]
                channel_energy = np.mean(segment ** 2, axis=0)
                values.append(np.mean(np.partition(channel_energy, -k)[-k:]))
            side_energy[side] = np.asarray(values)
        a = side_energy["side1"]
        b = side_energy["side2"]
        eps = max(1e-12, 1e-3 * float(np.median(np.r_[a, b])))
        contrast = np.log((a + eps) / (b + eps))
        out[f"{kind}_top3_side1_p90"] = float(np.log1p(np.quantile(a, 0.90)))
        out[f"{kind}_top3_side2_p90"] = float(np.log1p(np.quantile(b, 0.90)))
        out[f"{kind}_top3_contrast_median"] = float(np.median(contrast))
        out[f"{kind}_top3_contrast_p90"] = float(np.quantile(contrast, 0.90))
        out[f"{kind}_top3_contrast_p10"] = float(np.quantile(contrast, 0.10))
    return out

def extract_features(df_or_array, column_names=None):
    """
    Extracts physical and statistical features from a single rail recording.
    Input can be a pandas DataFrame or a numpy array of shape (10000, 129).
    """
    if isinstance(df_or_array, pd.DataFrame):
        data = df_or_array.values
        groupings = get_channel_groupings(df_or_array.columns.tolist())
    else:
        data = df_or_array
        if column_names is None:
            raise ValueError("column_names are required for array input")
        groupings = get_channel_groupings(column_names)
    
    # 1. Speed & Movement features from Column 0
    # A toothed wheel with 90 teeth produces 2 transitions per tooth (0->1 rising, 1->0 falling)
    # Total transitions per full revolution = 90 * 2 = 180 transitions
    speed_raw = data[:, 0]
    transitions = int(np.sum(np.diff(speed_raw) != 0))
    transitions_per_rev = WHEEL_TEETH * 2  # 180
    revs_per_sec = transitions / transitions_per_rev
    speed_mps = revs_per_sec * (np.pi * WHEEL_DIAMETER_METERS)
    speed_kmh = speed_mps * 3.6
    is_stationary = 1.0 if transitions <= 50 else 0.0
    
    # 2. Extract sensor signals & DC detrend
    # Columns 1 to 128
    sensors = data[:, 1:]
    # Zero-center each sensor column to remove DC voltage drift
    sensors_detrended = sensors - np.mean(sensors, axis=0, keepdims=True)
    
    # Extract channel groups
    # Note: indices in groupings are 1-based relative to data, so subtract 1 for sensors array
    s1_vib = sensors_detrended[:, [c - 1 for c in groupings["side1_vib"]]]
    s2_vib = sensors_detrended[:, [c - 1 for c in groupings["side2_vib"]]]
    s1_shock = sensors_detrended[:, [c - 1 for c in groupings["side1_shock"]]]
    s2_shock = sensors_detrended[:, [c - 1 for c in groupings["side2_shock"]]]
    
    s1_all = sensors_detrended[:, [c - 1 for c in groupings["side1_all"]]]
    s2_all = sensors_detrended[:, [c - 1 for c in groupings["side2_all"]]]
    
    # 3. RMS calculations (Root Mean Square = sqrt(mean(x^2)))
    s1_vib_rms = np.sqrt(np.mean(s1_vib ** 2, axis=0))
    s2_vib_rms = np.sqrt(np.mean(s2_vib ** 2, axis=0))
    s1_shock_rms = np.sqrt(np.mean(s1_shock ** 2, axis=0))
    s2_shock_rms = np.sqrt(np.mean(s2_shock ** 2, axis=0))
    
    s1_all_rms = np.sqrt(np.mean(s1_all ** 2, axis=0))
    s2_all_rms = np.sqrt(np.mean(s2_all ** 2, axis=0))
    
    s1_vib_rms_mean = float(np.mean(s1_vib_rms))
    s1_vib_rms_max = float(np.max(s1_vib_rms))
    s1_vib_rms_std = float(np.std(s1_vib_rms))
    
    s2_vib_rms_mean = float(np.mean(s2_vib_rms))
    s2_vib_rms_max = float(np.max(s2_vib_rms))
    s2_vib_rms_std = float(np.std(s2_vib_rms))
    
    s1_shock_rms_mean = float(np.mean(s1_shock_rms))
    s1_shock_rms_max = float(np.max(s1_shock_rms))
    
    s2_shock_rms_mean = float(np.mean(s2_shock_rms))
    s2_shock_rms_max = float(np.max(s2_shock_rms))
    
    total_rms_s1 = float(np.mean(s1_all_rms))
    total_rms_s2 = float(np.mean(s2_all_rms))
    total_rms_max_s1 = float(np.max(s1_all_rms))
    total_rms_max_s2 = float(np.max(s2_all_rms))
    
    # 4. Asymmetry & Ratio Features (Core Differentiators)
    eps = 1e-6
    ratio_total_rms = (total_rms_s1 + eps) / (total_rms_s2 + eps)
    ratio_vib_rms = (s1_vib_rms_mean + eps) / (s2_vib_rms_mean + eps)
    ratio_max_vib_rms = (s1_vib_rms_max + eps) / (s2_vib_rms_max + eps)
    diff_max_vib_rms = s1_vib_rms_max - s2_vib_rms_max
    
    ratio_shock_rms = (s1_shock_rms_mean + eps) / (s2_shock_rms_mean + eps)
    ratio_max_shock = (s1_shock_rms_max + eps) / (s2_shock_rms_max + eps)
    diff_max_shock = s1_shock_rms_max - s2_shock_rms_max
    
    ratio_vib_std = (s1_vib_rms_std + eps) / (s2_vib_rms_std + eps)
    diff_vib_std = s1_vib_rms_std - s2_vib_rms_std
    
    normalized_diff_rms = (total_rms_s1 - total_rms_s2) / (total_rms_s1 + total_rms_s2 + eps)
    normalized_diff_vib = (s1_vib_rms_mean - s2_vib_rms_mean) / (s1_vib_rms_mean + s2_vib_rms_mean + eps)
    normalized_diff_max_vib = (s1_vib_rms_max - s2_vib_rms_max) / (s1_vib_rms_max + s2_vib_rms_max + eps)
    
    # 5. Impulsive Metrics (Peak-to-Peak and Kurtosis)
    # Kurtosis on the mean vibration signal per side
    s1_vib_mean_signal = np.mean(s1_vib, axis=1)
    s2_vib_mean_signal = np.mean(s2_vib, axis=1)
    
    kurt_s1 = float(kurtosis(s1_vib_mean_signal))
    kurt_s2 = float(kurtosis(s2_vib_mean_signal))
    
    p2p_s1 = float(np.max(s1_vib) - np.min(s1_vib))
    p2p_s2 = float(np.max(s2_vib) - np.min(s2_vib))
    ratio_p2p = (p2p_s1 + eps) / (p2p_s2 + eps)
    diff_p2p = p2p_s1 - p2p_s2
    
    # 6. Speed-Normalized Energy
    speed_reg = speed_mps + 1.0
    energy_per_speed_s1 = total_rms_s1 / speed_reg
    energy_per_speed_s2 = total_rms_s2 / speed_reg
    
    # 7. Frequency Domain (FFT) Features in Corrugation Resonance Band (200 - 1200 Hz)
    # FFT of mean vibration signal on each side
    n = len(s1_vib_mean_signal)
    fft_s1 = np.abs(np.fft.rfft(s1_vib_mean_signal)) / n
    fft_s2 = np.abs(np.fft.rfft(s2_vib_mean_signal)) / n
    freqs = np.fft.rfftfreq(n, d=1.0 / SAMPLING_RATE_HZ)
    
    # Resonance mask for 200 Hz to 1200 Hz
    res_mask = (freqs >= 200.0) & (freqs <= 1200.0)
    fft_energy_s1_res = float(np.sum(fft_s1[res_mask] ** 2))
    fft_energy_s2_res = float(np.sum(fft_s2[res_mask] ** 2))
    fft_res_ratio = (fft_energy_s1_res + eps) / (fft_energy_s2_res + eps)
    
    # Dominant frequency in resonance band
    if np.any(res_mask):
        dom_freq_s1 = float(freqs[res_mask][np.argmax(fft_s1[res_mask])])
        dom_freq_s2 = float(freqs[res_mask][np.argmax(fft_s2[res_mask])])
    else:
        dom_freq_s1 = 0.0
        dom_freq_s2 = 0.0

    feats = {
        "speed_mps": speed_mps,
        "speed_kmh": speed_kmh,
        "transitions": transitions,
        "is_stationary": is_stationary,
        
        "total_rms_s1": total_rms_s1,
        "total_rms_s2": total_rms_s2,
        "total_rms_max_s1": total_rms_max_s1,
        "total_rms_max_s2": total_rms_max_s2,
        
        "s1_vib_rms_mean": s1_vib_rms_mean,
        "s1_vib_rms_max": s1_vib_rms_max,
        "s1_vib_rms_std": s1_vib_rms_std,
        
        "s2_vib_rms_mean": s2_vib_rms_mean,
        "s2_vib_rms_max": s2_vib_rms_max,
        "s2_vib_rms_std": s2_vib_rms_std,
        
        "s1_shock_rms_mean": s1_shock_rms_mean,
        "s1_shock_rms_max": s1_shock_rms_max,
        
        "s2_shock_rms_mean": s2_shock_rms_mean,
        "s2_shock_rms_max": s2_shock_rms_max,
        
        "ratio_total_rms": ratio_total_rms,
        "ratio_vib_rms": ratio_vib_rms,
        "ratio_max_vib_rms": ratio_max_vib_rms,
        "diff_max_vib_rms": diff_max_vib_rms,
        "ratio_shock_rms": ratio_shock_rms,
        "ratio_max_shock": ratio_max_shock,
        "diff_max_shock": diff_max_shock,
        
        "ratio_vib_std": ratio_vib_std,
        "diff_vib_std": diff_vib_std,
        
        "normalized_diff_rms": normalized_diff_rms,
        "normalized_diff_vib": normalized_diff_vib,
        "normalized_diff_max_vib": normalized_diff_max_vib,
        
        "kurt_s1": kurt_s1,
        "kurt_s2": kurt_s2,
        "p2p_s1": p2p_s1,
        "p2p_s2": p2p_s2,
        "ratio_p2p": ratio_p2p,
        "diff_p2p": diff_p2p,
        
        "energy_per_speed_s1": energy_per_speed_s1,
        "energy_per_speed_s2": energy_per_speed_s2,
        
        "fft_energy_s1_res": fft_energy_s1_res,
        "fft_energy_s2_res": fft_energy_s2_res,
        "fft_res_ratio": fft_res_ratio,
        "dom_freq_s1": dom_freq_s1,
        "dom_freq_s2": dom_freq_s2
    }
    
    top3_feats = localized_top3_features(sensors_detrended, groupings)
    feats.update(top3_feats)
    return feats
